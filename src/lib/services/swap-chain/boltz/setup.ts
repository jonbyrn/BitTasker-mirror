/**
 * Swap Chain — Boltz Setup Helpers
 *
 * Shared setup, funding, claim infrastructure, and swap data storage
 * for Boltz chain swaps. Contains the common building blocks that
 * executor and claim modules compose together.
 */

import * as Sentry from '@sentry/sveltekit';
import { tryCatch } from '$lib/utils/tryCatch';
import { createDebug } from '$lib/utils/debug';
import { sendEvmTransaction } from '../tx-helpers';
import { parseDecimalToSmallestUnit, satsToWei } from '$lib/utils/amount-conversion';
import { generateSwapPreimage } from '$lib/utils/swap-preimage';
import { boltzProvider } from '$lib/services/BoltzProvider';
import { encodeEtherSwapLock } from '../abi';
import type { SwapClaimData } from '../persistence';
import {
	swapClaimData,
	swapRefundData,
	persistClaimData,
	persistRefundData,
	saveClaimDataToNostr
} from '../persistence';
import { safeAddress, type SwapChainState } from '../state';

const d = createDebug('swap-chain');

// boltzProvider singleton imported from BoltzProvider.ts — aliased as 'boltz' for brevity
const boltz = boltzProvider;

// ---------------------------------------------------------------------------
// Ethers lazy loader
// ---------------------------------------------------------------------------

/** Cached ethers module — avoids repeated dynamic import overhead per swap. */
let _ethersModule: typeof import('ethers') | null = null;
export async function getEthers() {
	if (!_ethersModule) {
		_ethersModule = await import('ethers');
	}
	return _ethersModule;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Common return type for all swap execution functions. */
export type BoltzHopResult = { data: string | null; error: Error | null };

/** Result of prepareChainSwap — enough data to send the lockup transaction. */
export interface SwapSetupResult {
	amountSats: number;
	preimageHex: string;
	hashHex: string;
	swapResult: Awaited<ReturnType<typeof boltz.createSwap>>;
}

// ---------------------------------------------------------------------------
// Chain swap preparation
// ---------------------------------------------------------------------------

/**
 * Common setup for chain swaps: validate amount, generate preimage/refund key,
 * create Boltz swap, and persist claim + refund data.
 *
 * Does NOT send the lockup transaction — the caller must do that with the
 * returned setup data, because lockup mechanics differ per swap direction
 * (EtherSwap.lock on RSK vs ERC20Swap.lock on Arbitrum).
 */
export async function prepareChainSwap(
	state: SwapChainState,
	claimAddress: string,
	fromSymbol?: string,
	toSymbol?: string
): Promise<{ data: SwapSetupResult | null; error: Error | null }> {
	const amount = state.amount;
	if (!amount) return { data: null, error: new Error('Amount is required') };
	const amountSats = Number(parseDecimalToSmallestUnit(amount, 8));
	if (amountSats <= 0) return { data: null, error: new Error('Invalid amount') };

	const { preimageHex, hashHex } = await generateSwapPreimage();
	const { ethers } = await getEthers();
	const refundWallet = ethers.Wallet.createRandom();

	const swapResult = await boltz.createSwap({
		amountSats,
		claimAddress,
		preimageHash: hashHex,
		refundPublicKey: refundWallet.publicKey.slice(2),
		fromSymbol,
		toSymbol
	});

	d.log(
		'[prepareChainSwap] boltz swap created: id=%s lockup=%s claim=%s timeout=%s',
		swapResult.swapId,
		swapResult.lockupAddress,
		swapResult.claimAddress,
		swapResult.timeoutBlockHeight
	);

	await storeBoltzSwapData({
		swapId: swapResult.swapId,
		preimageHex,
		hashHex,
		claimDetails: swapResult.claimDetails ?? null,
		lockupAddress: swapResult.lockupAddress,
		timeoutBlockHeight: swapResult.timeoutBlockHeight,
		claimAddress: swapResult.lockupClaimAddress
	});

	return { data: { amountSats, preimageHex, hashHex, swapResult }, error: null };
}

// ---------------------------------------------------------------------------
// RSK funding
// ---------------------------------------------------------------------------

/**
 * Send rBTC to a Boltz lockup address via EtherSwap.lock() on RSK.
 *
 * Used by executeRbtcToBtcSwap and executeRbtcToArbitrumSwap — both lock
 * rBTC with identical calldata. The only difference is the connected wallet ID.
 */
export async function lockRskFunds(
	setup: SwapSetupResult,
	sourceConnectedWalletId: string | null
): Promise<{ data: string | null; error: Error | null }> {
	// CRITICAL: Use Boltz's lockup claim address (not the user's destination address).
	// Boltz's RSK address is the one authorized to call claim() on the user's lockup.
	// Using the user's Arbitrum address here causes Boltz to reject the lockup
	// with transaction.lockupFailed because msg.sender doesn't match.
	const boltzClaimAddr = setup.swapResult.lockupClaimAddress;
	if (!boltzClaimAddr) {
		return { data: null, error: new Error('Boltz lockup claim address missing — cannot lock funds') };
	}
	const lockCalldata = encodeEtherSwapLock(
		'0x' + setup.hashHex,
		safeAddress(boltzClaimAddr),
		setup.swapResult.timeoutBlockHeight
	);
	const rbtcWei = satsToWei(setup.amountSats);
	d.log(
		'[lockRskFunds] to=%s value=%s wei boltzClaimAddr=%s userClaimAddr=%s wallet=%s',
		setup.swapResult.lockupAddress,
		rbtcWei.toString(),
		boltzClaimAddr,
		setup.swapResult.claimAddress,
		sourceConnectedWalletId ?? 'builtin'
	);
	return sendEvmTransaction({
		to: setup.swapResult.lockupAddress,
		data: lockCalldata,
		value: rbtcWei,
		chain: 'rsk',
		sourceConnectedWalletId
	});
}

// ---------------------------------------------------------------------------
// Claim infrastructure
// ---------------------------------------------------------------------------

/**
 * Shared claim logic: send an EVM transaction to claim swap funds on any chain.
 *
 * Used by claimTbtcOnArbitrum (ERC20Swap.claim on Arbitrum) and
 * claimRbtcOnRsk (EtherSwap.claim on RSK). The caller encodes the
 * chain-specific calldata; this function handles the transaction,
 * error handling, logging, and Sentry breadcrumbs.
 */
export async function claimSwapFunds(params: {
	contractAddress: string;
	chain: 'rsk' | 'bsc' | 'arbitrum';
	calldata: string;
	gasLimit?: number;
	sourceConnectedWalletId: string | null;
	logLabel: string;
	feeToken?: string;
}): Promise<Error | null> {
	const dClaim = createDebug(`swap-chain:${params.logLabel}`);
	try {
		dClaim.log(
			'Claim calldata: selector=%s to=%s wallet=%s',
			params.calldata.substring(0, 10),
			params.contractAddress.substring(0, 10),
			params.sourceConnectedWalletId ?? 'builtin'
		);
		d.log(
			'[claimSwapFunds:%s] submitting claim: contract=%s wallet=%s',
			params.logLabel,
			params.contractAddress.substring(0, 10),
			params.sourceConnectedWalletId ?? 'builtin'
		);

		const normalizedContract = safeAddress(params.contractAddress);
		if (!normalizedContract) {
			return new Error(`Invalid contract address for ${params.logLabel} claim: ${params.contractAddress}`);
		}

		const { data: txHash, error: claimError } = await sendEvmTransaction({
			to: normalizedContract,
			data: params.calldata,
			value: 0n,
			chain: params.chain,
			gasLimit: params.gasLimit,
			sourceConnectedWalletId: params.sourceConnectedWalletId,
			feeToken: params.feeToken
		});

		if (claimError) {
			d.log('[claimSwapFunds:%s] CLAIM FAILED: %s', params.logLabel, claimError.message);
			dClaim.error('%s claim failed: %s', params.logLabel, claimError.message);
			return claimError;
		}

		d.log('[claimSwapFunds:%s] CLAIM CONFIRMED: %s', params.logLabel, txHash);
		dClaim.log('%s claim confirmed: %s', params.logLabel, txHash);
		Sentry.addBreadcrumb({
			category: 'boltz',
			message: `${params.logLabel} claimed: ${txHash}`,
			level: 'info',
			data: { contract: params.contractAddress }
		});
		return null;
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		dClaim.error('%s claim failed: %s', params.logLabel, message);
		Sentry.addBreadcrumb({
			category: 'swap-chain.claim',
			message: `${params.logLabel} claim failed`,
			level: 'error',
			data: { contract: params.contractAddress, error: message }
		});
		return new Error(message);
	}
}

// ---------------------------------------------------------------------------
// Swap data storage
// ---------------------------------------------------------------------------

/**
 * Store Boltz swap claim data and refund data for later claiming/refunding.
 * Persists to: in-memory Map → Capacitor Preferences → Nostr NIP-44.
 */
export async function storeBoltzSwapData(params: {
	swapId: string;
	preimageHex: string;
	hashHex: string;
	claimDetails: SwapClaimData['claimDetails'] | null | undefined;
	lockupAddress: string;
	timeoutBlockHeight: number;
	claimAddress: string;
}): Promise<void> {
	d.log(
		'[storeBoltzSwapData] START swapId=%s hasClaimDetails=%s',
		params.swapId,
		!!params.claimDetails
	);
	// Store claim data (preimage + claim details) when the user needs to claim
	if (params.claimDetails) {
		const storedClaim: SwapClaimData = {
			preimageHex: params.preimageHex,
			claimDetails: params.claimDetails,
			lockupClaimAddress: params.claimAddress
		};
		swapClaimData.set(params.swapId, storedClaim);
		d.log('[storeBoltzSwapData] claim data stored in memory');

		// Persist to Preferences (critical — must succeed or log failure)
		d.log('[storeBoltzSwapData] persisting to Preferences...');
		const { error: prefError } = await tryCatch(persistClaimData());
		d.log('[storeBoltzSwapData] Preferences done, error=%s', prefError?.message ?? 'none');
		if (prefError) {
			d.error('Failed to persist claim data to Preferences: %s', prefError.message);
			Sentry.captureException(prefError, { tags: { area: 'swap-persistence' } });
		}

		// Persist to Nostr (best-effort — don't fail the swap if this fails)
		saveClaimDataToNostr(params.swapId, storedClaim).catch((e: Error) => {
			d.warn('Nostr claim data backup failed: %s', e.message);
			Sentry.addBreadcrumb({
				category: 'swap.nostr',
				message: 'Nostr backup failed',
				level: 'warning'
			});
		});
	}

	// Store refund data (always needed — user may need to refund if swap fails)
	swapRefundData.set(params.swapId, {
		preimageHash: params.hashHex,
		lockupAddress: params.lockupAddress,
		timeoutBlockHeight: params.timeoutBlockHeight,
		claimAddress: params.claimAddress
	});

	// Persist refund data to Preferences (critical — must succeed or log failure)
	d.log('[storeBoltzSwapData] persisting refund data...');
	const { error: refError } = await tryCatch(persistRefundData());
	d.log('[storeBoltzSwapData] refund data done, error=%s', refError?.message ?? 'none');
	if (refError) {
		d.error('Failed to persist refund data: %s', refError.message);
		Sentry.captureException(refError, { tags: { area: 'swap-persistence' } });
	}

	d.log('[storeBoltzSwapData] DONE');
	Sentry.addBreadcrumb({
		category: 'swap.persistence',
		message: `Stored swap data for ${params.swapId}`,
		level: 'info',
		data: { hasClaim: !!params.claimDetails }
	});
}

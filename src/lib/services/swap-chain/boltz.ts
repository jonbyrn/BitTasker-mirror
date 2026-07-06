/**
 * Swap Chain — Boltz Swap Logic
 *
 * Boltz-specific swap execution: chain swaps (RBTC↔TBTC↔BTC), submarine swaps
 * (RBTC→Lightning), lockup transactions, chain swap completion polling, and
 * tBTC/rBTC claiming on Arbitrum/RSK.
 */

import { get } from 'svelte/store';
import * as Sentry from '@sentry/sveltekit';
import { tryCatch } from '$lib/utils/tryCatch';
import { createDebug } from '$lib/utils/debug';
import {
	walletStore,
	createSubmarineSwap,
	lockSubmarineSwapFunds,
	createChainSwap
} from '$lib/stores/wallet.store';
import { getHandle } from '$lib/stores/connected-wallets.store';
import {
	sendEvmTransaction,
	resolveUserAddress,
	queryERC20Balance,
	waitForERC20Balance
} from './tx-helpers';
import { parseDecimalToSmallestUnit, satsToWei } from '$lib/utils/amount-conversion';
import { generateSwapPreimage } from '$lib/utils/swap-preimage';
import {
	TBTC_ARB,
	ETHERSWAP_ADDRESS,
	GAS_LIMIT_ARB_CLAIM,
	GAS_LIMIT_RSK_CLAIM,
	BOLTZ_MAX_WAIT_MS
} from '$lib/services/swap-chain/utils';
import { boltzProvider } from '$lib/services/BoltzProvider';
import {
	encodeEtherSwapLock,
	encodeEtherSwapClaim,
	encodeERC20SwapClaim,
	encodeERC20SwapLockPrepay,
	encodeERC20Approve
} from './abi';
import type { RouteHop } from '$lib/services/route-resolver';
import type { SwapClaimData } from './persistence';
import {
	swapClaimData,
	swapRefundData,
	persistClaimData,
	persistRefundData,
	saveClaimDataToNostr,
	loadPersistedClaimData,
	loadClaimDataFromNostr
} from './persistence';
import { safeAddress, boltzAddress, type SwapChainState, sleep, setSwapProgress } from './state';

const d = createDebug('swap-chain');

// boltzProvider singleton imported from BoltzProvider.ts — aliased as 'boltz' for brevity
const boltz = boltzProvider;

/** Cached ethers module — avoids repeated dynamic import overhead per swap. */
let _ethersModule: typeof import('ethers') | null = null;
async function getEthers() {
	if (!_ethersModule) {
		_ethersModule = await import('ethers');
	}
	return _ethersModule;
}

/** Common return type for all swap execution functions. */
type BoltzHopResult = { data: string | null; error: Error | null };

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Result of prepareChainSwap — enough data to send the lockup transaction. */
interface SwapSetupResult {
	amountSats: number;
	preimageHex: string;
	hashHex: string;
	swapResult: Awaited<ReturnType<typeof boltz.createSwap>>;
}

/**
 * Common setup for chain swaps: validate amount, generate preimage/refund key,
 * create Boltz swap, and persist claim + refund data.
 *
 * Does NOT send the lockup transaction — the caller must do that with the
 * returned setup data, because lockup mechanics differ per swap direction
 * (EtherSwap.lock vs ERC20Swap.lockPrepayMinerfee).
 */
async function prepareChainSwap(
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
		claimAddress: swapResult.claimAddress
	});

	return { data: { amountSats, preimageHex, hashHex, swapResult }, error: null };
}

/**
 * Send rBTC to a Boltz lockup address via EtherSwap.lock() on RSK.
 *
 * Used by executeRbtcToBtcSwap and executeRbtcToArbitrumSwap — both lock
 * rBTC with identical calldata. The only difference is the connected wallet ID.
 */
async function lockRskFunds(
	setup: SwapSetupResult,
	sourceConnectedWalletId: string | null
): Promise<{ data: string | null; error: Error | null }> {
	const lockCalldata = encodeEtherSwapLock(
		'0x' + setup.hashHex,
		safeAddress(setup.swapResult.claimAddress),
		setup.swapResult.timeoutBlockHeight
	);
	const rbtcWei = satsToWei(setup.amountSats);
	d.log(
		'[lockRskFunds] to=%s value=%s wei wallet=%s',
		setup.swapResult.lockupAddress,
		rbtcWei.toString(),
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

/**
 * Shared claim logic: send an EVM transaction to claim swap funds on any chain.
 *
 * Used by claimTbtcOnArbitrum (ERC20Swap.claim on Arbitrum) and
 * claimRbtcOnRsk (EtherSwap.claim on RSK). The caller encodes the
 * chain-specific calldata; this function handles the transaction,
 * error handling, logging, and Sentry breadcrumbs.
 */
async function claimSwapFunds(params: {
	contractAddress: string;
	chain: 'rsk' | 'bsc' | 'arbitrum';
	calldata: string;
	gasLimit?: number;
	sourceConnectedWalletId: string | null;
	logLabel: string;
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

		const { data: txHash, error: claimError } = await sendEvmTransaction({
			to: safeAddress(params.contractAddress),
			data: params.calldata,
			value: 0n,
			chain: params.chain,
			gasLimit: params.gasLimit,
			sourceConnectedWalletId: params.sourceConnectedWalletId
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
async function storeBoltzSwapData(params: {
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

// ---------------------------------------------------------------------------
// Execute Boltz hop
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Swap branches (extracted from executeBoltzHop)
// ---------------------------------------------------------------------------

/**
 * tBTC → RBTC via Boltz direct chain swap.
 * Sends tBTC (ERC-20 on Arbitrum) to a Boltz lockup address; Boltz releases rBTC on RSK.
 * Verifies tBTC balance before creating the swap; handles ERC-20 approve + lockPrepayMinerfee.
 */
async function executeTbtcToRbtcSwap(
	state: SwapChainState,
	_hop: RouteHop
): Promise<BoltzHopResult> {
	d.log('[executeTbtcToRbtcSwap] START amount=%s', state.amount);
	const amount = state.amount;
	if (!amount) return { data: null, error: new Error('Amount is required') };
	const expectedAmountSats = Number(parseDecimalToSmallestUnit(amount, 8));
	d.log('[executeTbtcToRbtcSwap] expectedAmountSats=%d', expectedAmountSats);
	if (expectedAmountSats <= 0) return { data: null, error: new Error('Invalid amount') };

	try {
		const rskAddr = boltzAddress(get(walletStore).rsk.address ?? '');
		d.log('[executeTbtcToRbtcSwap] rskAddr=%s', rskAddr || 'EMPTY');
		if (!rskAddr) return { data: null, error: new Error('No RSK wallet address') };

		// Resolve the user's Arbitrum address for balance check
		const arbAddr = state.sourceConnectedWalletId
			? safeAddress(getHandle(state.sourceConnectedWalletId)?.address ?? '')
			: safeAddress(get(walletStore).arb?.address || get(walletStore).rsk.address || '');
		if (!arbAddr)
			return { data: null, error: new Error('No Arbitrum wallet address for balance check') };

		// Wait for tBTC balance to arrive on Arbitrum.
		// For 2-hop routes (e.g., wBTC→Symbiosis→tBTC→Boltz→rBTC), the tBTC
		// may arrive asynchronously from the Symbiosis swap. We wait until the
		// balance is sufficient or timeout.
		const expectedWei = satsToWei(expectedAmountSats);
		setSwapProgress('locking-tbtc', 'Waiting for tBTC delivery on Arbitrum...');
		d.log(
			'[executeTbtcToRbtcSwap] Waiting for tBTC balance at %s (need %s wei)...',
			arbAddr,
			expectedWei.toString()
		);

		const tbtcBalance = await waitForERC20Balance(
			TBTC_ARB,
			arbAddr,
			expectedWei,
			'arbitrum',
			180_000 // 3 minutes — generous for same-chain DEX swap
		);

		d.log(
			'[executeTbtcToRbtcSwap] tBTC balance: %s wei (expected: %s)',
			tbtcBalance.toString(),
			expectedWei.toString()
		);

		if (tbtcBalance === 0n) {
			return {
				data: null,
				error: new Error('tBTC balance is 0 on Arbitrum — swap delivery may have failed')
			};
		}

		// Use the actual balance if it's less than expected (Symbiosis slippage/fees).
		// Convert wei to sats: sats = wei / 1e10
		const actualAmountSats = Number(tbtcBalance / 10_000_000_000n);
		const amountSats = Math.min(expectedAmountSats, actualAmountSats);

		if (amountSats < 100) {
			return {
				data: null,
				error: new Error(`tBTC balance too low: ${actualAmountSats} sats (minimum 100 sats)`)
			};
		}

		if (actualAmountSats < expectedAmountSats) {
			d.log(
				'[executeTbtcToRbtcSwap] Using reduced amount: %d sats (expected %d, slippage %d sats)',
				actualAmountSats,
				expectedAmountSats,
				expectedAmountSats - actualAmountSats
			);
			d.warn(
				'TBTC balance lower than expected: got %d sats, wanted %d sats (slippage: %d)',
				actualAmountSats,
				expectedAmountSats,
				expectedAmountSats - actualAmountSats
			);
		}

		// Create Boltz swap with the actual available amount
		const refundWallet = (await getEthers()).ethers.Wallet.createRandom();
		const { preimageHex, hashHex } = await generateSwapPreimage();

		d.log('Creating TBTC→RBTC chain swap: %d sats to %s', amountSats, rskAddr);
		const swapResult = await boltz.createSwap({
			amountSats,
			claimAddress: rskAddr,
			preimageHash: hashHex,
			refundPublicKey: refundWallet.publicKey.slice(2),
			fromSymbol: 'TBTC',
			toSymbol: 'RBTC'
		});
		d.log(
			'[executeTbtcToRbtcSwap] boltz.createSwap OK: id=%s lockup=%s expectedAmt=%d',
			swapResult.swapId,
			swapResult.lockupAddress,
			swapResult.expectedAmount
		);
		d.log('Chain swap created: id=%s lockup=%s', swapResult.swapId, swapResult.lockupAddress);

		setSwapProgress('locking-tbtc', `Locking tBTC → ${swapResult.swapId}`);

		await storeBoltzSwapData({
			swapId: swapResult.swapId,
			preimageHex,
			hashHex,
			claimDetails: swapResult.claimDetails,
			lockupAddress: swapResult.lockupAddress,
			timeoutBlockHeight: swapResult.timeoutBlockHeight,
			claimAddress: swapResult.claimAddress
		});

		// Use the Boltz expected amount for the lock (may differ slightly from our amountSats)
		const lockAmountSats = swapResult.expectedAmount || amountSats;
		const tbtcAmount = satsToWei(lockAmountSats);

		// Verify balance still sufficient after Boltz swap creation
		const currentBalance = await queryERC20Balance(TBTC_ARB, arbAddr, 'arbitrum');
		if (currentBalance === null) {
			return { data: null, error: new Error('Failed to query tBTC balance (RPC error)') };
		}
		if (currentBalance < tbtcAmount) {
			return {
				data: null,
				error: new Error(
					`Insufficient tBTC for lock: have ${currentBalance.toString()} wei, need ${tbtcAmount.toString()} wei`
				)
			};
		}

		// Step 1: Approve the Boltz lockup contract to spend tBTC
		const lockupContract = swapResult.lockupAddress;
		const approveCalldata = encodeERC20Approve(lockupContract, tbtcAmount);
		d.log(
			'[executeTbtcToRbtcSwap] Step 1: approve tBTC for %s (amount=%s)',
			lockupContract,
			tbtcAmount.toString()
		);
		const { data: approveTxHash, error: approveError } = await sendEvmTransaction({
			to: TBTC_ARB,
			data: approveCalldata,
			value: 0n,
			chain: 'arbitrum',
			sourceConnectedWalletId: state.sourceConnectedWalletId
		});
		d.log(
			'[executeTbtcToRbtcSwap] approve result: tx=%s error=%s',
			approveTxHash ?? 'null',
			approveError?.message ?? 'none'
		);
		if (approveError)
			return { data: null, error: new Error(`tBTC approve failed: ${approveError.message}`) };

		// Step 2: Call lockPrepayMinerfee — locks tBTC AND forwards ETH to Boltz's claim address
		// so Boltz has gas to claim on Arbitrum. Plain lock() reverts without prepay.
		const lockCalldata = encodeERC20SwapLockPrepay(
			'0x' + hashHex,
			tbtcAmount,
			TBTC_ARB,
			swapResult.claimAddress,
			swapResult.timeoutBlockHeight
		);
		// Send 0.001 ETH (~$3) to cover Boltz's Arbitrum claim gas
		const prepayWei = 1_000_000_000_000_000n; // 0.001 ETH
		d.log(
			'[executeTbtcToRbtcSwap] Step 2: calling ERC20Swap.lockPrepayMinerfee() on %s amount=%s prepay=%s wei',
			lockupContract,
			tbtcAmount.toString(),
			prepayWei.toString()
		);
		const { data: lockupTxHash, error: lockupError } = await sendEvmTransaction({
			to: lockupContract,
			data: lockCalldata,
			value: prepayWei,
			chain: 'arbitrum',
			sourceConnectedWalletId: state.sourceConnectedWalletId
		});
		d.log(
			'[executeTbtcToRbtcSwap] lock result: tx=%s error=%s',
			lockupTxHash ?? 'null',
			lockupError?.message ?? 'none'
		);
		if (lockupError) return { data: null, error: lockupError };
		d.log('TBTC lockup tx: %s', lockupTxHash);
		setSwapProgress(
			'locking-tbtc',
			`Lockup tx sent: ${lockupTxHash?.substring(0, 16) ?? 'unknown'}...`
		);
		return { data: swapResult.swapId, error: null };
	} catch (err) {
		d.log('[executeTbtcToRbtcSwap] CAUGHT:', (err as Error).message);
		d.error('TBTC→RBTC chain swap failed: %s', (err as Error).message);
		Sentry.captureException(err, { tags: { area: 'swap-chain.tbtc-to-rbtc' } });
		return { data: null, error: err instanceof Error ? err : new Error(String(err)) };
	}
}

/**
 * RBTC → Lightning via Boltz submarine swap.
 *
 * The user sends rBTC to a Boltz lockup address. Boltz pays the Lightning
 * invoice on the user's behalf.
 */
async function executeRbtcToLightningSwap(
	state: SwapChainState,
	_hop: RouteHop
): Promise<BoltzHopResult> {
	if (!state.destination || state.destination.type !== 'invoice') {
		return { data: null, error: new Error('Lightning hop requires an invoice destination') };
	}

	const { data: swapResult, error: createError } = await tryCatch(
		createSubmarineSwap(state.destination.invoice)
	);

	if (createError !== null) {
		return {
			data: null,
			error: createError instanceof Error ? createError : new Error(String(createError))
		};
	}

	// Lock funds to execute the swap
	if (state.sourceConnectedWalletId) {
		d.log(
			'executeRbtcToLightningSwap: using connected wallet %s for lockup',
			state.sourceConnectedWalletId
		);

		// Extract lockup details from SubmarineSwapResult.swapData (typed from wallet-core SDK).
		const lockupAddress = swapResult.swapData.lockupAddress;
		const lockupAmountRaw = swapResult.swapData.expectedAmount;

		if (!lockupAddress) {
			return { data: null, error: new Error('Could not extract lockup address from swap data') };
		}
		if (typeof lockupAmountRaw !== 'number' && typeof lockupAmountRaw !== 'string') {
			return { data: null, error: new Error('Could not extract lockup amount from swap data') };
		}

		const lockupAmountWei = BigInt(lockupAmountRaw);

		const { data: txHash, error: txError } = await sendEvmTransaction({
			to: lockupAddress,
			data: '0x',
			value: lockupAmountWei,
			chain: 'rsk',
			sourceConnectedWalletId: state.sourceConnectedWalletId
		});
		if (txError) return { data: null, error: txError };
		return { data: txHash, error: null };
	}

	// Built-in wallet lockup
	const { data: lockResult, error: lockError } = await tryCatch(
		lockSubmarineSwapFunds(swapResult.swapData)
	);

	if (lockError !== null) {
		return {
			data: null,
			error: lockError instanceof Error ? lockError : new Error(String(lockError))
		};
	}

	return { data: lockResult?.txHash ?? null, error: null };
}

/**
 * RBTC → BTC via Boltz chain swap (on-chain Bitcoin).
 *
 * Connected wallet: creates the swap via Boltz API and sends an rBTC lockup
 * via the EtherSwap.lock() contract on RSK.
 * Built-in wallet: delegates to `createChainSwap` (handles everything).
 */
async function executeRbtcToBtcSwap(
	state: SwapChainState,
	_hop: RouteHop
): Promise<BoltzHopResult> {
	const amount = state.amount;
	if (!amount) {
		return { data: null, error: new Error('Amount is required for chain swap') };
	}

	const amountSats = Number(parseDecimalToSmallestUnit(amount, 8));
	if (amountSats <= 0) {
		return { data: null, error: new Error('Invalid amount for chain swap') };
	}

	// Connected wallet path: create the swap via Boltz API and send lockup via evmSigner
	if (state.sourceConnectedWalletId) {
		d.log(
			'executeRbtcToBtcSwap: using connected wallet %s for RBTC→BTC',
			state.sourceConnectedWalletId
		);

		try {
			const btcAddr = resolveUserAddress(state, 'BTC');
			if (!btcAddr) {
				return { data: null, error: new Error('No BTC address available for claim') };
			}

			const { data: setup, error: setupError } = await prepareChainSwap(
				state,
				boltzAddress(btcAddr)
			);
			if (setupError || !setup) return { data: null, error: setupError };

			const { data: lockupTxHash, error: lockupError } = await lockRskFunds(
				setup,
				state.sourceConnectedWalletId
			);
			if (lockupError) return { data: null, error: lockupError };
			d.log('Boltz chain swap (BTC) lockup tx: %s', lockupTxHash);

			return { data: setup.swapResult.swapId, error: null };
		} catch (err) {
			d.error('Boltz chain swap (RBTC→BTC) failed: %s', (err as Error).message);
			return { data: null, error: err instanceof Error ? err : new Error(String(err)) };
		}
	}

	// Built-in wallet path
	const { data: swapResult, error: chainError } = await tryCatch(createChainSwap(amountSats));
	if (chainError !== null) {
		return {
			data: null,
			error: chainError instanceof Error ? chainError : new Error(String(chainError))
		};
	}
	return { data: swapResult?.swapId ?? null, error: null };
}

/**
 * RBTC or BTC → tBTC on Arbitrum via Boltz chain swap.
 * User locks rBTC on RSK; Boltz releases tBTC on Arbitrum. Claim handled by pollBoltzChainSwapCompletion.
 */
async function executeRbtcToArbitrumSwap(
	state: SwapChainState,
	_hop: RouteHop
): Promise<BoltzHopResult> {
	d.log('executeRbtcToArbitrumSwap: connected=%s', state.sourceConnectedWalletId ?? 'builtin');

	try {
		const arbAddr = state.sourceConnectedWalletId
			? boltzAddress(getHandle(state.sourceConnectedWalletId)?.address ?? '')
			: boltzAddress(get(walletStore).arb?.address || get(walletStore).rsk.address || '');
		if (!arbAddr) return { data: null, error: new Error('No Arbitrum wallet address available') };

		const { data: setup, error: setupError } = await prepareChainSwap(state, arbAddr);
		if (setupError || !setup) return { data: null, error: setupError };

		setSwapProgress('locking-rbtc', `Locking rBTC → ${setup.swapResult.swapId}`);

		const { data: lockupTxHash, error: lockupError } = await lockRskFunds(
			setup,
			state.sourceConnectedWalletId
		);
		if (lockupError) {
			d.error('Boltz lockup failed: %s', lockupError.message);
			return { data: null, error: lockupError };
		}
		d.log('Boltz chain swap lockup tx: %s', lockupTxHash);
		setSwapProgress(
			'locking-rbtc',
			`Lockup tx sent: ${lockupTxHash?.substring(0, 16) ?? 'unknown'}...`
		);
		return { data: setup.swapResult.swapId, error: null };
	} catch (err) {
		d.error('Boltz chain swap failed: %s', err instanceof Error ? err.message : String(err));
		return { data: null, error: err instanceof Error ? err : new Error(String(err)) };
	}
}

// ---------------------------------------------------------------------------
// Execute Boltz hop (dispatcher)
// ---------------------------------------------------------------------------

/**
 * Execute a Boltz swap hop. Routes to the appropriate swap function based
 * on source asset and destination chain.
 */
export async function executeBoltzHop(
	hop: RouteHop,
	state: SwapChainState
): Promise<BoltzHopResult> {
	const from = hop.fromAsset.toUpperCase();
	const to = hop.toChain;

	d.log('executeBoltzHop: from=%s to=%s', from, to);

	if (from === 'TBTC' && to === 'rsk') return executeTbtcToRbtcSwap(state, hop);
	if (from === 'RBTC' && to === 'lightning') return executeRbtcToLightningSwap(state, hop);
	if (from === 'RBTC' && to === 'bitcoin') return executeRbtcToBtcSwap(state, hop);
	if ((from === 'RBTC' || from === 'BTC') && to === 'arbitrum')
		return executeRbtcToArbitrumSwap(state, hop);

	return {
		data: null,
		error: new Error(`Unsupported Boltz swap: ${hop.fromAsset} -> ${to}`)
	};
}

// ---------------------------------------------------------------------------
// Polling
// ---------------------------------------------------------------------------

/**
 * Wait for Boltz to create a tBTC lockup on Arbitrum's ERC20Swap contract.
 * Polls for the Lockup event to get on-chain claim parameters (claimAddress, refundAddress, amount, timelock).
 */
async function waitForBoltzLockup(
	contractAddress: string,
	hashlock: string,
	expectedAmount: number,
	logger: ReturnType<typeof createDebug>,
	maxWaitMs = 120_000
): Promise<{
	claimAddress: string;
	refundAddress: string;
	amount: bigint;
	timelock: number;
} | null> {
	const ARB_RPCS = ['https://arb1.arbitrum.io/rpc', 'https://rpc.ankr.com/arbitrum'];
	const paddedHashlock = hashlock.startsWith('0x') ? hashlock : '0x' + hashlock;
	const startTime = Date.now();
	let pollInterval = 5000;

	// ERC20Swap Lockup event topic0
	const LOCKUP_TOPIC = '0xa98eaa2bd8230d87a1a4c356f5c1d41cb85ff88131122ec8b1931cb9d31ae145';

	while (Date.now() - startTime < maxWaitMs) {
		try {
			let data: { result?: unknown[] } | null = null;
			for (const rpc of ARB_RPCS) {
				try {
					const resp = await fetch(rpc, {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							jsonrpc: '2.0',
							method: 'eth_getLogs',
							params: [
								{
									fromBlock: '0x0',
									toBlock: 'latest',
									address: contractAddress,
									topics: [LOCKUP_TOPIC, paddedHashlock]
								}
							],
							id: 1
						}),
						signal: AbortSignal.timeout(10_000)
					});
					data = await resp.json();
					break;
				} catch {
					d.log('[waitForBoltzLockup] RPC %s failed, trying next', rpc);
				}
			}
			if (!data) throw new Error('All Arbitrum RPC endpoints failed');
			const logs = (data.result || []) as Array<{
				topics: string[];
				data: string;
				blockNumber: string;
			}>;

			if (logs.length > 0) {
				const log = logs[logs.length - 1]; // Use latest lockup
				const topics = log.topics;
				const dataHex = log.data;

				if (topics.length >= 4 && dataHex.length >= 194) {
					const claimAddress = '0x' + topics[2].slice(26);
					const refundAddress = '0x' + topics[3].slice(26);
					const amount = BigInt('0x' + dataHex.slice(2, 66));
					// Token address is at data[64..128], timelock at data[128..192]
					const timelock = Number(BigInt('0x' + dataHex.slice(130, 194)));

					d.log(
						'[waitForBoltzLockup] FOUND lockup: claim=%s refund=%s amount=%s timelock=%d block=%s',
						claimAddress.substring(0, 10),
						refundAddress.substring(0, 10),
						amount.toString(),
						timelock,
						log.blockNumber
					);
					logger.log(
						'Found Boltz lockup: claim=%s refund=%s amount=%s timelock=%d',
						claimAddress.substring(0, 10),
						refundAddress.substring(0, 10),
						amount.toString(),
						timelock
					);

					return { claimAddress, refundAddress, amount, timelock };
				}
			}

			const elapsed = Math.round((Date.now() - startTime) / 1000);
			d.log('[waitForBoltzLockup] not found yet, elapsed=%ds, waiting %dms', elapsed, pollInterval);
			logger.log('Boltz lockup not found yet, waiting %dms...', pollInterval);
		} catch (e) {
			d.log('[waitForBoltzLockup] scan error: %s', (e as Error).message);
			logger.warn('Lockup scan error: %s', (e as Error).message);
		}

		await sleep(pollInterval);
		pollInterval = Math.min(pollInterval * 1.3, 15000);
	}

	d.log('[waitForBoltzLockup] TIMEOUT after %dms — lockup not found', maxWaitMs);
	return null;
}

/**
 * Poll a Boltz chain swap until it completes. Handles claim phase automatically:
 * loads claim data (memory → Preferences → Nostr), claims on Arbitrum or RSK when ready.
 */
export async function pollBoltzChainSwapCompletion(
	swapId: string,
	sourceConnectedWalletId: string | null,
	maxWaitMs: number = BOLTZ_MAX_WAIT_MS, // 15 minutes — chain swaps need claim time
	direction: 'rbtc-to-tbtc' | 'tbtc-to-rbtc' = 'rbtc-to-tbtc'
): Promise<{ data: string | null; error: Error | null }> {
	let pollInterval = 3000; // Start at 3s for fast swaps
	const MAX_POLL_INTERVAL = 15000; // Cap at 15s
	const startTime = Date.now();
	const dBoltz = createDebug('swap-chain:boltz-poll');
	let claimAttempts = 0;
	const MAX_CLAIM_ATTEMPTS = 3;

	while (Date.now() - startTime < maxWaitMs) {
		// Back off when offline — avoid hammering Boltz API
		if (typeof navigator !== 'undefined' && !navigator.onLine) {
			dBoltz.warn('Device offline during Boltz poll — backing off');
			await sleep(pollInterval * 3);
			pollInterval = Math.min(pollInterval * 1.5, MAX_POLL_INTERVAL);
			continue;
		}

		const { data: statusResult, error: statusError } = await tryCatch(
			(async () => {
				return boltz.getSwapStatus(swapId);
			})()
		);

		if (statusError !== null) {
			d.log('[pollBoltz] status error (transient): %s', statusError.message);
			dBoltz.warn('Boltz status poll error (transient): %s', statusError.message);
			await sleep(pollInterval);
			pollInterval = Math.min(pollInterval * 1.5, MAX_POLL_INTERVAL);
			continue;
		}

		if (!statusResult) {
			d.log('[pollBoltz] no status result, waiting %dms', pollInterval);
			await sleep(pollInterval);
			pollInterval = Math.min(pollInterval * 1.5, MAX_POLL_INTERVAL);
			continue;
		}

		const status = statusResult.status;
		const elapsed = Math.round((Date.now() - startTime) / 1000);
		d.log('[pollBoltz] swap=%s status=%s elapsed=%ds', swapId, status, elapsed);
		dBoltz.log('Boltz swap %s status: %s (elapsed %ds)', swapId, status, elapsed);

		// Reset poll interval on successful status check
		pollInterval = 3000;

		// Terminal success — tBTC claimed on Arbitrum
		if (status === 'transaction.claimed') {
			dBoltz.log('Boltz swap %s completed successfully (claimed)', swapId);
			Sentry.addBreadcrumb({
				category: 'swap-chain.boltz',
				message: `Boltz swap completed: ${swapId}`,
				data: { swapId, status }
			});
			swapClaimData.delete(swapId); // Cleanup
			return { data: status, error: null };
		}

		// Terminal failure states
		if (
			status === 'swap.expired' ||
			status === 'transaction.failed' ||
			status === 'swap.failed' ||
			status === 'transaction.lockupFailed'
		) {
			dBoltz.error('Boltz swap %s terminal failure: %s', swapId, status);
			Sentry.addBreadcrumb({
				category: 'swap-chain.boltz',
				message: `Boltz swap failed: ${swapId}`,
				level: 'error',
				data: { swapId, status }
			});
			swapClaimData.delete(swapId); // Cleanup
			return { data: null, error: new Error(`Boltz swap ${swapId} failed: ${status}`) };
		}

		// Server confirmed lockup OR claim pending — attempt to claim.
		// wallet-core CANNOT interfere with our swaps (different Nostr tags:
		// we use 'boltz-swap-chain', wallet-core uses 'chain'). The claim.pending
		// status means OUR claim tx is being mined, or Boltz detected a claim
		// attempt from the wallet-core's older L-BTC→RBTC swaps (irrelevant).
		if (status === 'transaction.server.confirmed' || status === 'transaction.claim.pending') {
			// Cap claim attempts to prevent infinite retry loop burning gas
			claimAttempts++;
			if (claimAttempts > MAX_CLAIM_ATTEMPTS) {
				dBoltz.error(
					'Claim attempts exceeded %d for swap %s — aborting',
					MAX_CLAIM_ATTEMPTS,
					swapId
				);
				return {
					data: null,
					error: new Error(`Claim failed after ${MAX_CLAIM_ATTEMPTS} attempts`)
				};
			}

			d.log(
				'[pollBoltz] claim attempt %d/%d, status=%s, direction=%s',
				claimAttempts,
				MAX_CLAIM_ATTEMPTS,
				status,
				direction
			);
			let claimData = swapClaimData.get(swapId);
			if (!claimData) {
				// Try loading persisted claim data (survives page refresh)
				dBoltz.log('No in-memory claim data for %s — attempting persisted load', swapId);
				await loadPersistedClaimData();
				claimData = swapClaimData.get(swapId);
			}
			if (!claimData) {
				// Last resort: load from Nostr (survives app reinstall, device change)
				dBoltz.log('No Preferences claim data for %s — attempting Nostr recovery', swapId);
				const nostrData = await loadClaimDataFromNostr(swapId);
				if (nostrData) {
					swapClaimData.set(swapId, nostrData);
					claimData = nostrData;
					dBoltz.log('Recovered claim data from Nostr for swap %s', swapId);
				}
			}
			if (!claimData) {
				dBoltz.error('No claim data stored for swap %s — cannot claim', swapId);
				return { data: null, error: new Error('Missing claim data for tBTC claim') };
			}

			// Claim on the correct chain based on swap direction
			if (direction === 'tbtc-to-rbtc') {
				// TBTC→RBTC: claim rBTC on RSK by calling EtherSwap.claim()
				dBoltz.log('Claiming rBTC on RSK for swap %s (TBTC→RBTC direction)', swapId);
				setSwapProgress('claiming-rbtc', 'Claiming rBTC on RSK...');

				// Use the user's RSK wallet address as the claim destination — NOT
				// claimData.lockupClaimAddress which is Boltz's internal address.
				// Normalize to lowercase then checksum with getAddress() — ethers v6
				// throws INVALID_ARGUMENT if the stored address has bad EIP-55 checksum.
				const { getAddress } = await import('ethers');
				const rawAddr = get(walletStore).rsk.address || claimData.lockupClaimAddress;
				const userRskAddr = getAddress(rawAddr.toLowerCase());
				dBoltz.log(
					'Claiming rBTC on RSK to address=%s (was lockupClaim=%s)',
					userRskAddr,
					claimData.lockupClaimAddress
				);
				const claimError = await claimRbtcOnRsk({
					preimageHex: claimData.preimageHex,
					amount: claimData.claimDetails.amount,
					claimAddress: userRskAddr,
					refundAddress: claimData.claimDetails.refundAddress,
					timelock: claimData.claimDetails.timeoutBlockHeight,
					sourceConnectedWalletId
				});

				if (claimError !== null) {
					dBoltz.error('rBTC claim failed: %s', claimError.message);
					await sleep(pollInterval);
					continue;
				}

				dBoltz.log('rBTC claim submitted on RSK — waiting for confirmation');
				swapClaimData.delete(swapId);
			} else {
				// RBTC→TBTC: claim tBTC on Arbitrum by calling ERC20Swap.claim()
				// IMPORTANT: After Boltz confirms the source lockup, Boltz needs time to
				// create the tBTC lockup on Arbitrum. We must scan for the lockup event
				// before attempting to claim, and use the on-chain parameters (not the
				// API's claimDetails which may have the wrong refund address).
				setSwapProgress('claiming-tbtc', 'Waiting for Boltz tBTC lockup on Arbitrum...');

				// Compute hashlock from preimage (SHA-256)
				const preimagePairs = claimData.preimageHex.match(/.{2}/g);
				if (!preimagePairs) {
					dBoltz.error('Invalid preimage hex for swap %s — cannot compute hashlock', swapId);
					return { data: null, error: new Error('Invalid preimage hex') };
				}
				const preimageBytes = Uint8Array.from(preimagePairs.map((b) => parseInt(b, 16)));
				const hashlockBuf = await crypto.subtle.digest('SHA-256', preimageBytes);
				const hashlock =
					'0x' +
					Array.from(new Uint8Array(hashlockBuf))
						.map((b) => b.toString(16).padStart(2, '0'))
						.join('');

				const lockupParams = await waitForBoltzLockup(
					claimData.claimDetails.lockupAddress,
					hashlock,
					claimData.claimDetails.amount,
					dBoltz
				);

				if (!lockupParams) {
					dBoltz.error('Boltz lockup not found on Arbitrum for swap %s after waiting', swapId);
					await sleep(pollInterval);
					continue;
				}

				dBoltz.log(
					'Found Boltz lockup on Arbitrum: claimAddr=%s refundAddr=%s amount=%s',
					lockupParams.claimAddress.substring(0, 10),
					lockupParams.refundAddress.substring(0, 10),
					lockupParams.amount.toString()
				);

				// Persist on-chain claim params so resume uses verified values
				claimData.claimDetails = {
					...claimData.claimDetails,
					refundAddress: lockupParams.refundAddress,
					amount: Number(lockupParams.amount),
					timeoutBlockHeight: lockupParams.timelock
				};
				swapClaimData.set(swapId, claimData);
				await persistClaimData();

				const claimError = await claimTbtcOnArbitrum({
					contractAddress: claimData.claimDetails.lockupAddress,
					preimageHex: '0x' + claimData.preimageHex,
					amount: Number(lockupParams.amount),
					tokenAddress: TBTC_ARB,
					claimAddress: lockupParams.claimAddress,
					refundAddress: lockupParams.refundAddress,
					timelock: lockupParams.timelock,
					sourceConnectedWalletId
				});

				if (claimError !== null) {
					d.log(
						'[pollBoltz] tBTC CLAIM FAILED (attempt %d/%d): %s',
						claimAttempts,
						MAX_CLAIM_ATTEMPTS,
						claimError.message
					);
					dBoltz.error('tBTC claim failed: %s', claimError.message);
					await sleep(pollInterval);
					continue;
				}

				d.log('[pollBoltz] tBTC CLAIM SUCCESS — swap %s complete', swapId);
				dBoltz.log('tBTC claim confirmed on Arbitrum — swap complete');
				swapClaimData.delete(swapId);

				// Return immediately — don't continue polling. The claim is
				// on-chain confirmed (sendEvmTransaction verified receipt).
				// Boltz will update to transaction.claimed eventually, but
				// continuing the poll would re-enter the claim block with
				// the already-consumed lockup, causing reverts.
				return { data: 'transaction.claimed', error: null };
			}
		}

		// Non-terminal states: swap.created, swap.mempool, swap.confirmed — keep waiting
		await sleep(pollInterval);
	}

	return {
		data: null,
		error: new Error(`Boltz swap ${swapId} did not complete within ${maxWaitMs / 1000}s`)
	};
}

// ---------------------------------------------------------------------------
// Claim functions
// ---------------------------------------------------------------------------

/**
 * Claim tBTC on Arbitrum by calling ERC20Swap.claim().
 *
 * The ERC20Swap contract on Arbitrum holds tBTC locked by Boltz.
 * After the RSK lockup is confirmed, the user must call claim() with the
 * preimage to release tBTC to their Arbitrum address.
 *
 * @returns Error if claim failed, null on success
 */
async function claimTbtcOnArbitrum(params: {
	contractAddress: string;
	preimageHex: string;
	amount: number;
	tokenAddress: string;
	claimAddress: string;
	refundAddress: string;
	timelock: number;
	sourceConnectedWalletId: string | null;
}): Promise<Error | null> {
	const calldata = encodeERC20SwapClaim(
		params.preimageHex,
		BigInt(params.amount),
		params.tokenAddress,
		params.claimAddress,
		params.refundAddress,
		BigInt(params.timelock)
	);

	return claimSwapFunds({
		contractAddress: params.contractAddress,
		chain: 'arbitrum',
		calldata,
		gasLimit: GAS_LIMIT_ARB_CLAIM,
		sourceConnectedWalletId: params.sourceConnectedWalletId,
		logLabel: 'tBTC-on-Arbitrum'
	});
}

/**
 * Claim rBTC on RSK by calling EtherSwap.claim().
 *
 * After Boltz detects the tBTC lockup on Arbitrum, it locks rBTC on RSK.
 * The user calls EtherSwap.claim() with the preimage to release rBTC.
 *
 * The claim call is: claim(bytes32 preimage, uint256 amount, address claimAddress, uint256 timelock)
 * where claimAddress = Boltz's claim address, amount = sats locked, timelock = block height.
 *
 * @returns Error if claim failed, null on success
 */
async function claimRbtcOnRsk(params: {
	preimageHex: string;
	amount: number;
	claimAddress: string;
	refundAddress: string;
	timelock: number;
	sourceConnectedWalletId: string | null;
}): Promise<Error | null> {
	const calldata = encodeEtherSwapClaim(
		'0x' + params.preimageHex,
		BigInt(params.amount) * BigInt(1e10), // sats → wei
		params.claimAddress,
		BigInt(params.timelock)
	);

	return claimSwapFunds({
		contractAddress: ETHERSWAP_ADDRESS,
		chain: 'rsk',
		calldata,
		gasLimit: GAS_LIMIT_RSK_CLAIM,
		sourceConnectedWalletId: params.sourceConnectedWalletId,
		logLabel: 'rBTC-on-RSK'
	});
}

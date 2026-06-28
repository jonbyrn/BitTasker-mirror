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
	sendConnectedWalletArbitrumTx
} from './tx-helpers';
import { parseDecimalToSmallestUnit, satsToWei } from '$lib/utils/amount-conversion';
import { generateSwapPreimage } from '$lib/utils/swap-preimage';
import {
	TBTC_ARB,
	ETHERSWAP_ADDRESS,
	CHAIN_ID_RSK,
	GAS_LIMIT_ARB_CLAIM,
	GAS_LIMIT_RSK_CLAIM,
	BOLTZ_MAX_WAIT_MS
} from '$lib/services/swap-chain/utils';
import { boltzProvider } from '$lib/services/BoltzProvider';
import { encodeEtherSwapLock, encodeEtherSwapClaim, encodeERC20SwapClaim } from './abi';
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

/** Common return type for all swap execution functions. */
type BoltzHopResult = { data: string | null; error: Error | null };

// ---------------------------------------------------------------------------
// Swap data storage
// ---------------------------------------------------------------------------

/**
 * Store Boltz swap claim data and refund data for later claiming/refunding.
 *
 * Claim data (preimage + claim details) is stored when `claimDetails` is provided —
 * the user needs this to claim funds after Boltz confirms the lockup.
 * Refund data is always stored — the user may need to refund if the swap fails.
 *
 * Data is persisted to: in-memory Map → Capacitor Preferences → Nostr NIP-44.
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
	// Store claim data (preimage + claim details) when the user needs to claim
	if (params.claimDetails) {
		const storedClaim: SwapClaimData = {
			preimageHex: params.preimageHex,
			claimDetails: params.claimDetails,
			lockupClaimAddress: params.claimAddress
		};
		swapClaimData.set(params.swapId, storedClaim);

		// Persist to Preferences (critical — must succeed or log failure)
		const { error: prefError } = await tryCatch(persistClaimData());
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
	const { error: refError } = await tryCatch(persistRefundData());
	if (refError) {
		d.error('Failed to persist refund data: %s', refError.message);
		Sentry.captureException(refError, { tags: { area: 'swap-persistence' } });
	}

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
 *
 * Sends tBTC (ERC-20 on Arbitrum) to a Boltz lockup address. Boltz detects
 * the lockup and releases rBTC on RSK to the user's address.
 */
async function executeTbtcToRbtcSwap(
	state: SwapChainState,
	_hop: RouteHop
): Promise<BoltzHopResult> {
	const amount = state.amount;
	if (!amount) return { data: null, error: new Error('Amount is required') };
	const amountSats = Number(parseDecimalToSmallestUnit(amount, 8));
	if (amountSats <= 0) return { data: null, error: new Error('Invalid amount') };

	try {
		const rskAddr = boltzAddress(get(walletStore).rsk.address ?? '');
		if (!rskAddr) return { data: null, error: new Error('No RSK wallet address') };

		// Create chain swap: TBTC → RBTC
		const refundWallet = (await import('ethers')).ethers.Wallet.createRandom();
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

		// Send tBTC to Boltz lockup on Arbitrum (native value transfer)
		const tbtcWei = satsToWei(amountSats);
		const { data: lockupTxHash, error: lockupError } = await sendEvmTransaction({
			to: swapResult.lockupAddress,
			data: '0x',
			value: tbtcWei,
			chain: 'arbitrum',
			sourceConnectedWalletId: state.sourceConnectedWalletId
		});
		if (lockupError) return { data: null, error: lockupError };
		d.log('TBTC lockup tx: %s', lockupTxHash);
		setSwapProgress('locking-tbtc', `Lockup tx sent: ${lockupTxHash!.substring(0, 16)}...`);
		return { data: swapResult.swapId, error: null };
	} catch (err) {
		d.error('TBTC→RBTC chain swap failed: %s', (err as Error).message);
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
			// Generate preimage
			const { preimageHex, hashHex } = await generateSwapPreimage();

			// Generate refund key using ethers
			const { ethers } = await import('ethers');
			const refundWallet = ethers.Wallet.createRandom();
			const refundPublicKey = refundWallet.publicKey.slice(2);

			// Get BTC claim address from the user's connected wallet
			const btcAddr = resolveUserAddress(state, 'BTC');
			if (!btcAddr) {
				return { data: null, error: new Error('No BTC address available for claim') };
			}

			// Use BoltzProvider's createSwap with BTC destination
			const swapResult = await boltz.createSwap({
				amountSats,
				claimAddress: boltzAddress(btcAddr),
				preimageHash: hashHex,
				refundPublicKey
			});

			d.log(
				'Boltz chain swap (BTC) created: id=%s lockup=%s claim=%s timeout=%s',
				swapResult.swapId,
				swapResult.lockupAddress,
				swapResult.claimAddress,
				swapResult.timeoutBlockHeight
			);

			await storeBoltzSwapData({
				swapId: swapResult.swapId,
				preimageHex,
				hashHex,
				claimDetails: null, // RBTC→BTC: Boltz handles BTC claim, no user-side claim needed
				lockupAddress: swapResult.lockupAddress,
				timeoutBlockHeight: swapResult.timeoutBlockHeight,
				claimAddress: swapResult.claimAddress
			});

			const lockCalldata = encodeEtherSwapLock(
				'0x' + hashHex,
				safeAddress(swapResult.claimAddress),
				swapResult.timeoutBlockHeight
			);
			const rbtcWei = satsToWei(amountSats);
			const { data: lockupTxHash, error: lockupError } = await sendEvmTransaction({
				to: swapResult.lockupAddress,
				data: lockCalldata,
				value: rbtcWei,
				chain: 'rsk',
				sourceConnectedWalletId: state.sourceConnectedWalletId
			});
			if (lockupError) return { data: null, error: lockupError };
			d.log('Boltz chain swap (BTC) lockup tx: %s', lockupTxHash);

			return { data: swapResult.swapId, error: null };
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
 *
 * The user locks rBTC on RSK via EtherSwap.lock(). Boltz detects the lockup
 * and releases tBTC on Arbitrum. The `pollBoltzChainSwapCompletion` function
 * handles the claim phase.
 *
 * Handles both 'RBTC' (from SmartRouter boltz+lifi route) and 'BTC' (from
 * legacy boltzQuoteToRoute).
 */
async function executeRbtcToArbitrumSwap(
	state: SwapChainState,
	_hop: RouteHop
): Promise<BoltzHopResult> {
	const amount = state.amount;
	if (!amount) return { data: null, error: new Error('Amount is required') };
	const amountSats = Number(parseDecimalToSmallestUnit(amount, 8));
	if (amountSats <= 0) return { data: null, error: new Error('Invalid amount') };

	d.log(
		'executeRbtcToArbitrumSwap: amount=%s (%d sats) connected=%s',
		amount,
		amountSats,
		state.sourceConnectedWalletId ?? 'builtin'
	);

	try {
		// Generate preimage using Web Crypto API (browser-safe)
		const { preimageHex, hashHex } = await generateSwapPreimage();

		// Generate refund key using ethers (browser-safe)
		const { ethers } = await import('ethers');
		const refundWallet = ethers.Wallet.createRandom();
		const refundPublicKey = refundWallet.publicKey.slice(2); // remove 0x prefix

		// Get Arbitrum claim address (connected wallet or built-in, lowercase for Boltz)
		const arbAddr = state.sourceConnectedWalletId
			? boltzAddress(getHandle(state.sourceConnectedWalletId)?.address ?? '')
			: boltzAddress(get(walletStore).arb?.address || get(walletStore).rsk.address || '');
		if (!arbAddr) return { data: null, error: new Error('No Arbitrum wallet address available') };

		// Create the swap via Boltz API
		const swapResult = await boltz.createSwap({
			amountSats,
			claimAddress: arbAddr,
			preimageHash: hashHex,
			refundPublicKey
		});

		d.log(
			'Boltz swap created: id=%s lockup=%s claim=%s timeout=%s',
			swapResult.swapId,
			swapResult.lockupAddress,
			swapResult.claimAddress,
			swapResult.timeoutBlockHeight
		);
		setSwapProgress('locking-rbtc', `Locking rBTC → ${swapResult.swapId}`);

		// Store claim + refund data via shared helper (persists to Preferences + Nostr)
		await storeBoltzSwapData({
			swapId: swapResult.swapId,
			preimageHex,
			hashHex,
			claimDetails: swapResult.claimDetails ?? null,
			lockupAddress: swapResult.lockupAddress,
			timeoutBlockHeight: swapResult.timeoutBlockHeight,
			claimAddress: swapResult.claimAddress
		});

		// ABI-encode the EtherSwap.lock() calldata
		const lockCalldata = encodeEtherSwapLock(
			'0x' + hashHex,
			safeAddress(swapResult.claimAddress),
			swapResult.timeoutBlockHeight
		);

		// Send rBTC to lockup via lock() — connected wallet or built-in
		const rbtcWei = satsToWei(amountSats);
		d.log(
			'Boltz lockup: to=%s value=%s wei calldata=%s wallet=%s',
			swapResult.lockupAddress,
			rbtcWei.toString(),
			lockCalldata.substring(0, 20),
			state.sourceConnectedWalletId ?? 'builtin'
		);
		const { data: lockupTxHash, error: lockupError } = await sendEvmTransaction({
			to: swapResult.lockupAddress,
			data: lockCalldata,
			value: rbtcWei,
			chain: 'rsk',
			sourceConnectedWalletId: state.sourceConnectedWalletId
		});
		if (lockupError) {
			d.error('Boltz lockup failed: %s', lockupError.message);
			return { data: null, error: lockupError };
		}
		d.log('Boltz chain swap lockup tx: %s', lockupTxHash);
		setSwapProgress('locking-rbtc', `Lockup tx sent: ${lockupTxHash!.substring(0, 16)}...`);
		return { data: swapResult.swapId, error: null };
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
 * Poll a Boltz chain swap until it completes (tBTC arrives on Arbitrum).
 *
 * Boltz chain swaps require the APP to claim tBTC on Arbitrum after the
 * lockup is confirmed. The flow is:
 *   1. User sends rBTC to EtherSwap.lock() on RSK (hop 1)
 *   2. Boltz monitors RSK, detects lockup → status becomes transaction.server.confirmed
 *   3. APP claims tBTC on Arbitrum by calling ERC20Swap.claim() with the preimage
 *   4. tBTC arrives in user's Arbitrum wallet → status becomes transaction.claimed
 *
 * This function polls for status changes and automatically claims when ready.
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
			dBoltz.warn('Boltz status poll error (transient): %s', statusError.message);
			await sleep(pollInterval);
			pollInterval = Math.min(pollInterval * 1.5, MAX_POLL_INTERVAL);
			continue;
		}

		if (!statusResult) {
			await sleep(pollInterval);
			pollInterval = Math.min(pollInterval * 1.5, MAX_POLL_INTERVAL);
			continue;
		}

		const status = statusResult.status;
		const elapsed = Math.round((Date.now() - startTime) / 1000);
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

		// Server confirmed lockup — we need to claim tBTC on Arbitrum
		if (status === 'transaction.server.confirmed') {
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

				const claimError = await claimRbtcOnRsk({
					preimageHex: claimData.preimageHex,
					amount: claimData.claimDetails.amount,
					claimAddress: claimData.lockupClaimAddress,
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
				dBoltz.log(
					'Claiming tBTC on Arbitrum: contract=%s amount=%d token=%s',
					claimData.claimDetails.lockupAddress,
					claimData.claimDetails.amount,
					TBTC_ARB
				);
				setSwapProgress('claiming-tbtc', 'Claiming tBTC on Arbitrum...');

				const claimError = await claimTbtcOnArbitrum({
					contractAddress: claimData.claimDetails.lockupAddress,
					preimageHex: '0x' + claimData.preimageHex,
					amount: claimData.claimDetails.amount,
					tokenAddress: TBTC_ARB,
					claimAddress: claimData.lockupClaimAddress,
					refundAddress: claimData.claimDetails.refundAddress,
					timelock: claimData.claimDetails.timeoutBlockHeight,
					sourceConnectedWalletId
				});

				if (claimError !== null) {
					dBoltz.error('tBTC claim failed: %s', claimError.message);
					await sleep(pollInterval);
					continue;
				}

				dBoltz.log('tBTC claim submitted on Arbitrum — waiting for confirmation');
				swapClaimData.delete(swapId);
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
 * Priority:
 * 1. Connected wallet EVM signer (has ETH for gas, or gasless via relay)
 * 2. Built-in wallet via sendArbitrumTransaction (gasless relay via ERC-4337)
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
	const dClaim = createDebug('swap-chain:claim-tbtc');

	try {
		const calldata = encodeERC20SwapClaim(
			params.preimageHex,
			BigInt(params.amount),
			params.tokenAddress,
			params.claimAddress,
			params.refundAddress,
			BigInt(params.timelock)
		);

		dClaim.log(
			'Claim calldata: len=%d selector=%s to=%s wallet=%s',
			calldata.length,
			calldata.substring(0, 10),
			params.contractAddress,
			params.sourceConnectedWalletId ?? 'builtin'
		);

		let txHash: string | null = null;

		// Priority 1: Connected wallet EVM signer (has ETH or gasless relay)
		if (params.sourceConnectedWalletId) {
			const evmSigner = getEvmSigner(params.sourceConnectedWalletId);
			if (evmSigner) {
				dClaim.log('Claiming via connected wallet %s on Arbitrum', params.sourceConnectedWalletId);
				try {
					const result = await sendConnectedWalletArbitrumTx(
						evmSigner,
						safeAddress(params.contractAddress),
						calldata,
						'0'
					);
					txHash = result;
					dClaim.log('Connected wallet claim tx: %s', txHash);
				} catch (connErr) {
					dClaim.warn(
						'Connected wallet claim failed (%s), trying gasless relay',
						(connErr as Error).message
					);
				}
			}
		}

		// Priority 2: Built-in wallet via gasless relay
		if (!txHash) {
			dClaim.log('Claiming via built-in wallet (gasless relay)');
			txHash = await sendArbitrumTransaction({
				to: safeAddress(params.contractAddress),
				data: calldata,
				value: '0',
				gasLimit: GAS_LIMIT_ARB_CLAIM
			});
			dClaim.log('Built-in wallet claim tx: %s', txHash);
		}

		Sentry.addBreadcrumb({
			category: 'boltz',
			message: `tBTC claimed on Arbitrum: ${txHash}`,
			level: 'info',
			data: { swapContract: params.contractAddress }
		});

		return null;
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		dClaim.error('claimTbtcOnArbitrum failed: %s', message);
		Sentry.addBreadcrumb({
			category: 'swap-chain.claim',
			message: 'tBTC claim on Arbitrum failed',
			level: 'error',
			data: { contractAddress: params.contractAddress, error: message }
		});
		return new Error(message);
	}
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
	const dClaim = createDebug('swap-chain:claim-rbtc');

	try {
		const amountSats = BigInt(params.amount);
		const calldata = encodeEtherSwapClaim(
			'0x' + params.preimageHex,
			amountSats * BigInt(1e10), // sats → wei
			params.claimAddress,
			BigInt(params.timelock)
		);

		dClaim.log(
			'Claim calldata: selector=%s to=%s wallet=%s',
			calldata.substring(0, 10),
			ETHERSWAP_ADDRESS,
			params.sourceConnectedWalletId ?? 'builtin'
		);

		let txHash: string;

		if (params.sourceConnectedWalletId) {
			const evmSigner = getEvmSigner(params.sourceConnectedWalletId);
			if (!evmSigner) {
				return new Error('Connected wallet EVM signer not available for RSK claim');
			}
			dClaim.log('Claiming via connected wallet %s on RSK', params.sourceConnectedWalletId);
			const result = await evmSigner.sendTransaction({
				to: ETHERSWAP_ADDRESS,
				data: calldata,
				value: 0n,
				chainId: CHAIN_ID_RSK
			});
			txHash = result.txHash;
		} else {
			dClaim.log('Claiming via built-in wallet on RSK');
			txHash = await sendRawTransaction({
				to: ETHERSWAP_ADDRESS,
				data: calldata,
				value: '0',
				gasLimit: GAS_LIMIT_RSK_CLAIM
			});
		}

		dClaim.log('rBTC claim tx: %s', txHash);

		Sentry.addBreadcrumb({
			category: 'boltz',
			message: `rBTC claimed on RSK: ${txHash}`,
			level: 'info',
			data: { contract: ETHERSWAP_ADDRESS }
		});

		return null;
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		dClaim.error('claimRbtcOnRsk failed: %s', message);
		Sentry.addBreadcrumb({
			category: 'swap-chain.claim',
			message: 'rBTC claim on RSK failed',
			level: 'error',
			data: { contract: ETHERSWAP_ADDRESS, error: message }
		});
		return new Error(message);
	}
}

/**
 * Swap Chain — Boltz Polling & Completion
 *
 * Polls Boltz swap status and handles the claim phase automatically:
 * loads claim data (memory → Preferences → Nostr), claims on Arbitrum or RSK
 * when ready, and waits for on-chain lockup events.
 */

import { get } from 'svelte/store';
import * as Sentry from '@sentry/sveltekit';
import { tryCatch } from '$lib/utils/tryCatch';
import { createDebug } from '$lib/utils/debug';
import { walletStore } from '$lib/stores/wallet.store';
import { boltzProvider } from '$lib/services/BoltzProvider';
import { TBTC_ARB, BOLTZ_MAX_WAIT_MS } from '../utils';
import {
	swapClaimData,
	persistClaimData,
	loadPersistedClaimData,
	loadClaimDataFromNostr
} from '../persistence';
import { sleep, setSwapProgress } from '../state';
import { claimTbtcOnArbitrum, claimRbtcOnRsk } from './claims';

const d = createDebug('swap-chain');

// boltzProvider singleton — aliased as 'boltz' for brevity
const boltz = boltzProvider;

// ---------------------------------------------------------------------------
// Claim attempt tracking — survives across separate polling invocations
// (e.g., app restart → resume). Keyed by swapId.
// ---------------------------------------------------------------------------

/** Track claim attempts per swap ID — module-level so it persists across polling calls. */
const claimAttemptCounts = new Map<string, number>();

/** Max claim attempts before aborting to prevent infinite gas-burning retries. */
const MAX_CLAIM_ATTEMPTS = 5;

/** Classify a claim error as transient (retryable) or permanent (abort). */
export function isTransientClaimError(err: Error): boolean {
	const msg = err.message.toLowerCase();
	// Transient: network issues, timeouts, rate limits, RPC failures
	if (msg.includes('timeout') || msg.includes('econnrefused') || msg.includes('etimedout')) return true;
	if (msg.includes('rate limit') || msg.includes('429') || msg.includes('503')) return true;
	if (msg.includes('network') || msg.includes('fetch failed')) return true;
	if (msg.includes('nonce too low') || msg.includes('already known')) return true;
	// Transient: gasless relay specific (retryable)
	if (msg.includes('gasless relay timeout')) return true;
	if (msg.includes('pre-flight simulation failed: insufficient')) return true;
	// Everything else is permanent — don't retry
	return false;
}

// ---------------------------------------------------------------------------
// Lockup event scanning
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

	// Start scanning from a recent block (not genesis) to avoid slow queries.
	// Use 'latest' minus ~1000 blocks (~3 minutes on Arbitrum).
	let startBlock: string | number = 'latest';
	try {
		for (const rpc of ARB_RPCS) {
			try {
				const resp = await fetch(rpc, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_blockNumber', params: [], id: 1 }),
					signal: AbortSignal.timeout(5000)
				});
				const data = await resp.json() as { result?: string };
				if (data.result) {
					startBlock = Math.max(0, parseInt(data.result, 16) - 1000);
					break;
				}
			} catch { /* try next RPC */ }
		}
	} catch { startBlock = 'latest'; }

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
									fromBlock: typeof startBlock === 'number' ? '0x' + startBlock.toString(16) : startBlock,
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
				} catch (err) {
					d.warn('[waitForBoltzLockup] RPC %s failed: %s', rpc, (err as Error).message);
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

// ---------------------------------------------------------------------------
// Swap completion polling
// ---------------------------------------------------------------------------

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

	// Load or initialise the claim attempt counter for this swap.
	// Module-level Map persists across separate polling invocations (app restart/resume).
	if (!claimAttemptCounts.has(swapId)) {
		claimAttemptCounts.set(swapId, 0);
	}

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
			claimAttemptCounts.delete(swapId);
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
			claimAttemptCounts.delete(swapId);
			return { data: null, error: new Error(`Boltz swap ${swapId} failed: ${status}`) };
		}

		// Server confirmed lockup OR claim pending — attempt to claim.
		// wallet-core CANNOT interfere with our swaps (different Nostr tags:
		// we use 'bittasker-swap-chain', wallet-core uses 'boltz-swap-chain'). The claim.pending
		// status means OUR claim tx is being mined, or Boltz detected a claim
		// attempt from the wallet-core's older L-BTC→RBTC swaps (irrelevant).
		if (status === 'transaction.server.confirmed' || status === 'transaction.claim.pending') {
			// Cap claim attempts to prevent infinite retry loop burning gas
			const currentAttempts = (claimAttemptCounts.get(swapId) ?? 0) + 1;
			claimAttemptCounts.set(swapId, currentAttempts);

			if (currentAttempts > MAX_CLAIM_ATTEMPTS) {
				dBoltz.error(
					'Claim attempts exceeded %d for swap %s — aborting',
					MAX_CLAIM_ATTEMPTS,
					swapId
				);
				claimAttemptCounts.delete(swapId);
				return {
					data: null,
					error: new Error(`Claim failed after ${MAX_CLAIM_ATTEMPTS} attempts`)
				};
			}

			d.log(
				'[pollBoltz] claim attempt %d/%d, status=%s, direction=%s',
				currentAttempts,
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
					if (!isTransientClaimError(claimError)) {
						dBoltz.error('rBTC claim error is permanent — aborting retries for swap %s', swapId);
						claimAttemptCounts.delete(swapId);
						return { data: null, error: claimError };
					}
					// Exponential backoff: 5s, 15s, 45s
					const backoff = Math.min(5000 * Math.pow(3, currentAttempts - 1), 60000);
					dBoltz.log('Transient claim error — retrying in %dms (attempt %d/%d)', backoff, currentAttempts, MAX_CLAIM_ATTEMPTS);
					await sleep(backoff);
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
					const attempts = claimAttemptCounts.get(swapId) ?? 0;
					d.log(
						'[pollBoltz] tBTC CLAIM FAILED (attempt %d/%d): %s',
						attempts,
						MAX_CLAIM_ATTEMPTS,
						claimError.message
					);
					dBoltz.error('tBTC claim failed: %s', claimError.message);
					if (!isTransientClaimError(claimError)) {
						dBoltz.error('tBTC claim error is permanent — aborting retries for swap %s', swapId);
						claimAttemptCounts.delete(swapId);
						return { data: null, error: claimError };
					}
					// Exponential backoff: 5s, 15s, 45s
					const backoff = Math.min(5000 * Math.pow(3, attempts - 1), 60000);
					dBoltz.log('Transient claim error — retrying in %dms (attempt %d/%d)', backoff, attempts, MAX_CLAIM_ATTEMPTS);
					await sleep(backoff);
					continue;
				}

				d.log('[pollBoltz] tBTC CLAIM SUCCESS — swap %s complete', swapId);
				dBoltz.log('tBTC claim confirmed on Arbitrum — swap complete');
				swapClaimData.delete(swapId);
				claimAttemptCounts.delete(swapId);

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

	claimAttemptCounts.delete(swapId);
	return {
		data: null,
		error: new Error(`Boltz swap ${swapId} did not complete within ${maxWaitMs / 1000}s`)
	};
}

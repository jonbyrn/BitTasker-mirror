/**
 * Swap Chain — Recovery & Refund
 *
 * Functions for recovering stuck swap funds: checking refund eligibility,
 * executing refunds, scanning on-chain for unclaimed lockups, and
 * recovering refund data from RSK event logs.
 */

import * as Sentry from '@sentry/sveltekit';
import { tryCatch } from '$lib/utils/tryCatch';
import { createDebug } from '$lib/utils/debug';
import { sendRawTransaction } from '$lib/stores/wallet.store';
import { parseDecimalToSmallestUnit } from '$lib/utils/amount-conversion';
import {
	swapRefundData,
	swapClaimData,
	loadPersistedRefundData,
	persistRefundData,
	persistClaimData
} from './persistence';
import type { SwapRefundData } from './persistence';
import { safeAddress, loadSwapChainState, transitionTo } from './state';
import {
	ETHERSWAP_ADDRESS,
	RSK_RPC_URL,
	GAS_LIMIT_RSK,
	LOCKUP_TOPIC,
	CLAIM_TOPIC,
	RSK_BLOCK_TIME_SECONDS,
	BLOCKSCOUT_API_BASE
} from './utils';
import { encodeEtherSwapRefund } from './abi';
import type { JsonRpcProvider } from 'ethers';

const d = createDebug('swap-chain');

// ---------------------------------------------------------------------------
// RSK provider singleton
// ---------------------------------------------------------------------------

let _rskProvider: JsonRpcProvider | null = null;
async function getRskProvider(): Promise<JsonRpcProvider> {
	if (_rskProvider) return _rskProvider;
	const { ethers } = await import('ethers');
	_rskProvider = new ethers.JsonRpcProvider(RSK_RPC_URL);
	return _rskProvider;
}

// ---------------------------------------------------------------------------
// Refund info
// ---------------------------------------------------------------------------

/**
 * Check whether a refund is available for the current stuck swap.
 * Returns the refund data and whether the timelock has expired.
 */
export async function getRefundInfo(): Promise<{
	preimageHash: string;
	lockupAddress: string;
	timeoutBlockHeight: number;
	claimAddress: string;
	canRefund: boolean;
	message: string;
} | null> {
	const state = await loadSwapChainState();
	if (!state.swap1Id) return null;

	// Try in-memory first, then persisted
	let rd = swapRefundData.get(state.swap1Id);
	if (!rd) {
		await loadPersistedRefundData();
		rd = swapRefundData.get(state.swap1Id);
	}
	if (!rd) return null;

	// Check if timelock has expired by querying RSK current block
	let canRefund = false;
	let message = '';
	try {
		const rskProvider = await getRskProvider();
		const currentBlock = await rskProvider.getBlockNumber();
		if (currentBlock >= rd.timeoutBlockHeight) {
			canRefund = true;
			message = `Timelock expired at block ${rd.timeoutBlockHeight} (current: ${currentBlock}) — refund available`;
		} else {
			const blocksRemaining = rd.timeoutBlockHeight - currentBlock;
			const minutesRemaining = Math.ceil((blocksRemaining * RSK_BLOCK_TIME_SECONDS) / 60);
			message = `Timelock at block ${rd.timeoutBlockHeight} (current: ${currentBlock}) — ~${minutesRemaining}m remaining`;
		}
	} catch (err) {
		d.warn('Failed to check RSK block number: %s', (err as Error).message);
		message = 'Unable to check timelock status — try refund anyway';
		canRefund = true; // Let the user try
	}

	return { ...rd, canRefund, message };
}

// ---------------------------------------------------------------------------
// Refund execution
// ---------------------------------------------------------------------------

/**
 * Execute a refund for a stuck Boltz chain swap.
 * Calls EtherSwap.refund(preimageHash) on RSK to recover locked rBTC.
 */
export async function refundSwapChain(): Promise<{
	txHash: string | null;
	error: Error | null;
}> {
	const dRefund = createDebug('swap-chain:refund');
	const state = await loadSwapChainState();
	if (!state.swap1Id) {
		return { txHash: null, error: new Error('No swap ID found in state') };
	}

	// Get refund data
	let rd = swapRefundData.get(state.swap1Id);
	if (!rd) {
		await loadPersistedRefundData();
		rd = swapRefundData.get(state.swap1Id);
	}
	if (!rd) {
		return {
			txHash: null,
			error: new Error(
				'No refund data found — cannot recover funds automatically. Lockup address and preimageHash are needed.'
			)
		};
	}

	dRefund.log(
		'Refunding swap %s: lockup=%s preimageHash=%s timeout=%s',
		state.swap1Id,
		rd.lockupAddress,
		rd.preimageHash.substring(0, 16) + '...',
		rd.timeoutBlockHeight
	);

	Sentry.addBreadcrumb({
		category: 'swap-chain.refund',
		message: `Refund started for swap ${state.swap1Id}`,
		data: { swapId: state.swap1Id, lockupAddress: rd.lockupAddress }
	});

	// Self-healing: verify stored claimAddress against on-chain Lockup event.
	// Swaps created before the claimAddress fix stored the user's destination
	// address instead of Boltz's source chain address. The on-chain Lockup
	// event always has the correct address that was used in EtherSwap.lock().
	try {
		const { getRSKAddress } = await import('$lib/stores/wallet.store');
		const rskAddress = await getRSKAddress();
		if (rskAddress) {
			const events = await fetchLockupEvents(rskAddress);
			const matching = events.find(
				(ev) => ev.preimageHash.toLowerCase() === ('0x' + rd!.preimageHash).toLowerCase()
			);
			if (matching && matching.claimAddress.toLowerCase() !== rd!.claimAddress.toLowerCase()) {
				dRefund.warn(
					'claimAddress mismatch: stored=%s on-chain=%s — self-healing from chain',
					rd!.claimAddress,
					matching.claimAddress
				);
				rd!.claimAddress = matching.claimAddress;
				if (matching.timelock && matching.timelock !== rd!.timeoutBlockHeight) {
					dRefund.warn(
						'timelock mismatch: stored=%s on-chain=%s — healing',
						rd!.timeoutBlockHeight,
						matching.timelock
					);
					rd!.timeoutBlockHeight = matching.timelock;
				}
				swapRefundData.set(state.swap1Id, rd!);
				await persistRefundData();
				dRefund.log('Refund data healed from on-chain event');
			}
		}
	} catch (healErr) {
		dRefund.warn('Self-healing check failed (non-blocking): %s', (healErr as Error).message);
	}

	try {
		// ABI-encode the EtherSwap.refund() call
		const refundCalldata = encodeEtherSwapRefund(
			'0x' + rd.preimageHash,
			rd.claimAddress,
			BigInt(rd.timeoutBlockHeight)
		);

		// Send the refund transaction from the built-in wallet
		const refundTxHash = await sendRawTransaction({
			to: safeAddress(rd.lockupAddress),
			data: refundCalldata,
			value: '0',
			gasLimit: GAS_LIMIT_RSK
		});

		dRefund.log('Refund tx sent: %s', refundTxHash);

		Sentry.addBreadcrumb({
			category: 'swap-chain.refund',
			message: `Refund successful: ${refundTxHash}`,
			data: { swapId: state.swap1Id, txHash: refundTxHash }
		});

		// Transition to COMPLETE — funds recovered
		const { data: _completedState, error: completeError } = await transitionTo(state, 'COMPLETE', {
			error: `Refund successful: ${refundTxHash}`
		});
		if (completeError !== null) {
			dRefund.warn('Failed to transition to COMPLETE after refund: %s', completeError.message);
		}

		// Clean up persisted data
		swapRefundData.delete(state.swap1Id);
		const { error: cleanupRefundErr } = await tryCatch(persistRefundData());
		if (cleanupRefundErr) {
			dRefund.warn('Failed to persist refund data cleanup: %s', cleanupRefundErr.message);
			Sentry.addBreadcrumb({
				category: 'swap.cleanup',
				message: 'Refund data cleanup persistence failed',
				level: 'warning'
			});
		}
		swapClaimData.delete(state.swap1Id);
		const { error: cleanupClaimErr } = await tryCatch(persistClaimData());
		if (cleanupClaimErr) {
			dRefund.warn('Failed to persist claim data cleanup: %s', cleanupClaimErr.message);
			Sentry.addBreadcrumb({
				category: 'swap.cleanup',
				message: 'Claim data cleanup persistence failed',
				level: 'warning'
			});
		}

		return { txHash: refundTxHash, error: null };
	} catch (err) {
		const errorMsg = (err as Error).message;
		dRefund.error('Refund failed: %s', errorMsg);
		Sentry.addBreadcrumb({
			category: 'swap-chain.refund',
			message: `Refund failed: ${errorMsg}`,
			level: 'error',
			data: { swapId: state.swap1Id }
		});
		return { txHash: null, error: new Error(`Refund failed: ${errorMsg}`) };
	}
}

// ---------------------------------------------------------------------------
// Shared recovery helpers
// ---------------------------------------------------------------------------

interface ParsedLockupEvent {
	preimageHash: string;
	amountWei: bigint;
	claimAddress: string;
	timelock: number;
	transactionHash: string;
	blockNumber: number;
}

/** Lockup event topic0 — event signature hash. */

/** Claim event topic0 — used to check if a lockup was already claimed. */

/**
 * Query Blockscout for Lockup events for a given RSK address.
 * Returns parsed lockup events with preimage hash, amount, claim address, and timelock.
 */
async function fetchLockupEvents(rskAddress: string): Promise<ParsedLockupEvent[]> {
	const paddedAddr = '0x' + rskAddress.toLowerCase().slice(2).padStart(64, '0');

	const url = `${BLOCKSCOUT_API_BASE}?module=logs&action=getLogs&address=${ETHERSWAP_ADDRESS}&topic0=${LOCKUP_TOPIC}&topic2=${paddedAddr}&topic0_2_opr=and&fromBlock=0&toBlock=latest`;
	const resp = await fetch(url);
	const data = (await resp.json()) as {
		result?: Array<{
			topics: string[];
			data: string;
			blockNumber: string;
			transactionHash: string;
		}>;
	};

	if (!data.result || !Array.isArray(data.result)) {
		throw new Error('Failed to query Lockup events from Blockscout');
	}

	const events: ParsedLockupEvent[] = [];
	for (const ev of data.result) {
		const topics = ev.topics;
		const dataHex = ev.data;
		if (topics.length < 2 || dataHex.length < 194) continue;

		events.push({
			preimageHash: topics[1],
			amountWei: BigInt('0x' + dataHex.slice(2, 66)),
			claimAddress: '0x' + dataHex.slice(90, 130),
			timelock: Number(BigInt('0x' + dataHex.slice(130, 194))),
			transactionHash: ev.transactionHash,
			blockNumber: parseInt(ev.blockNumber, 16)
		});
	}

	return events;
}

/**
 * Check if a lockup is resolved on-chain (claimed or refunded).
 * Returns true if the lockup has been resolved (swaps() returns zeros or throws).
 */
async function isLockupResolved(
	swapContract: { swaps(preimageHash: string): Promise<unknown[]> },
	preimageHash: string
): Promise<boolean> {
	try {
		const onChain = await swapContract.swaps(preimageHash);
		return (onChain as bigint[])[0] === 0n;
	} catch {
		// swaps() decode error = all zeros = already resolved
		return true;
	}
}

/**
 * Check Blockscout if a lockup has been claimed (Claim event exists).
 * Returns true if a Claim event was found for the given preimage hash.
 */
async function isLockupClaimed(preimageHash: string): Promise<boolean> {
	const claimUrl = `${BLOCKSCOUT_API_BASE}?module=logs&action=getLogs&address=${ETHERSWAP_ADDRESS}&topic0=${CLAIM_TOPIC}&topic1=${preimageHash}&topic0_1_opr=and&fromBlock=0&toBlock=latest`;
	const claimResp = await fetch(claimUrl);
	const claimData = (await claimResp.json()) as { result?: Array<unknown> };
	return Array.isArray(claimData.result) && claimData.result.length > 0;
}

// ---------------------------------------------------------------------------
// On-chain recovery
// ---------------------------------------------------------------------------

/**
 * Recover refund data from RSK on-chain Lockup event logs.
 * Queries the Boltz EtherSwap contract for Lockup events indexed by the
 * user's RSK address, matches the swap amount, and stores the refund data.
 *
 * This is the primary recovery mechanism for EVM chains — Boltz persists
 * all swap parameters in contract event logs.
 */
export async function recoverRefundDataFromChain(): Promise<{
	data: SwapRefundData | null;
	error: Error | null;
}> {
	const dRecover = createDebug('swap-chain:recover');
	const state = await loadSwapChainState();

	if (!state.swap1Id || !state.amount) {
		return { data: null, error: new Error('No swap ID or amount in state') };
	}

	// Get user's RSK address
	const { getRSKAddress } = await import('$lib/stores/wallet.store');
	const rskAddress = await getRSKAddress();
	if (!rskAddress) {
		return { data: null, error: new Error('No RSK address available') };
	}

	dRecover.log(
		'Recovering refund data for swap %s (amount=%s, addr=%s)',
		state.swap1Id,
		state.amount,
		rskAddress
	);

	try {
		// Compute the expected amount in wei (state.amount is decimal string of RBTC)
		const expectedAmountWei = parseDecimalToSmallestUnit(state.amount, 18);

		// Fetch all Lockup events for this address
		const events = await fetchLockupEvents(rskAddress);
		dRecover.log('Found %d Lockup events for address %s', events.length, rskAddress);

		// Create provider + contract once for on-chain existence checks
		const { ethers: ethersCheck } = await import('ethers');
		const checkProvider = await getRskProvider();
		const swapAbi = [
			'function swaps(bytes32) view returns (uint256, address, address, uint256, bytes32, address)'
		];
		const swapContract = new ethersCheck.Contract(ETHERSWAP_ADDRESS, swapAbi, checkProvider);

		// Parse events and find matching amount
		for (const ev of events) {
			// Match by amount (within 1% tolerance for dust differences)
			const diff =
				ev.amountWei > expectedAmountWei
					? ev.amountWei - expectedAmountWei
					: expectedAmountWei - ev.amountWei;
			if (diff > expectedAmountWei / 100n) continue;

			dRecover.log(
				'Matching Lockup: amount=%s preimageHash=%s timelock=%s',
				ev.amountWei.toString(),
				ev.preimageHash.substring(0, 18) + '...',
				ev.timelock
			);

			// Check if already claimed via Blockscout
			if (await isLockupClaimed(ev.preimageHash)) {
				dRecover.log('Lockup already claimed, skipping');
				continue;
			}

			// Verify the swap still exists in contract storage
			if (
				await isLockupResolved(
					swapContract as unknown as { swaps(preimageHash: string): Promise<unknown[]> },
					ev.preimageHash
				)
			) {
				dRecover.log('Lockup already resolved (no on-chain data), skipping');
				continue;
			}

			// Found an unclaimed lockup — store refund data
			const refundData: SwapRefundData = {
				preimageHash: ev.preimageHash.startsWith('0x') ? ev.preimageHash.slice(2) : ev.preimageHash,
				lockupAddress: ETHERSWAP_ADDRESS,
				timeoutBlockHeight: ev.timelock,
				claimAddress: ev.claimAddress
			};

			swapRefundData.set(state.swap1Id, refundData);
			await persistRefundData();

			dRecover.log(
				'Recovered refund data: preimageHash=%s timelock=%s claimAddress=%s',
				ev.preimageHash.substring(0, 18) + '...',
				ev.timelock,
				ev.claimAddress
			);

			return { data: refundData, error: null };
		}

		return { data: null, error: new Error('No matching unclaimed Lockup event found on-chain') };
	} catch (err) {
		dRecover.error('Recovery failed: %s', (err as Error).message);
		Sentry.captureException(err, {
			tags: { component: 'swap-chain', recovery: 'recoverRefundDataFromChain' },
			extra: { swapId: state.swap1Id, source: 'blockscout-api' }
		});
		return { data: null, error: new Error(`Recovery failed: ${(err as Error).message}`) };
	}
}

// ---------------------------------------------------------------------------
// Lockup scanning
// ---------------------------------------------------------------------------

/**
 * Represents an unclaimed Boltz EtherSwap lockup found on-chain.
 */
export interface UnclaimedLockup {
	/** Preimage hash (without 0x prefix) — the lock key */
	preimageHash: string;
	/** RSK EtherSwap contract address */
	lockupAddress: string;
	/** Boltz claim address on RSK */
	claimAddress: string;
	/** Locked amount in satoshis */
	amountSats: number;
	/** RSK block height after which refund is possible */
	timeoutBlockHeight: number;
	/** Current RSK block height */
	currentBlock: number;
	/** Whether the timelock has expired */
	expired: boolean;
	/** RSK transaction hash of the lockup */
	txHash: string;
	/** RSK block number of the lockup */
	blockNumber: number;
	/** Whether the lockup has been resolved (claimed or refunded) on-chain */
	resolved: boolean;
}

/**
 * Scan the RSK blockchain for all unclaimed Boltz EtherSwap lockups
 * belonging to the user's RSK address.
 */
export async function scanUnclaimedLockups(): Promise<{
	data: UnclaimedLockup[];
	error: Error | null;
}> {
	const dScan = createDebug('swap-chain:scan');

	try {
		const { getRSKAddress } = await import('$lib/stores/wallet.store');
		const rskAddress = await getRSKAddress();
		if (!rskAddress) {
			return { data: [], error: new Error('No RSK address available') };
		}

		// Fetch all Lockup events using shared helper
		const events = await fetchLockupEvents(rskAddress);
		dScan.log('Found %d Lockup events for %s', events.length, rskAddress);

		const { ethers: ethersLib } = await import('ethers');
		const provider = await getRskProvider();
		const currentBlock = await provider.getBlockNumber();

		// Create contract instance for on-chain existence checks
		const swapAbi = [
			'function swaps(bytes32) view returns (uint256, address, address, uint256, bytes32, address)'
		];
		const swapContract = new ethersLib.Contract(ETHERSWAP_ADDRESS, swapAbi, provider);

		const results: UnclaimedLockup[] = [];

		for (const ev of events) {
			// Check if already resolved on-chain using shared helper
			const resolved = await isLockupResolved(
				swapContract as unknown as { swaps(preimageHash: string): Promise<unknown[]> },
				ev.preimageHash
			);
			if (resolved) {
				dScan.log('Lockup %s already resolved', ev.preimageHash.slice(0, 10));
			}

			results.push({
				preimageHash: ev.preimageHash.startsWith('0x') ? ev.preimageHash.slice(2) : ev.preimageHash,
				lockupAddress: ETHERSWAP_ADDRESS,
				claimAddress: ev.claimAddress,
				amountSats: Number(ev.amountWei / 10000000000n),
				timeoutBlockHeight: ev.timelock,
				currentBlock,
				expired: currentBlock >= ev.timelock,
				txHash: ev.transactionHash,
				blockNumber: ev.blockNumber,
				resolved
			});
		}

		dScan.log('Found %d unclaimed lockups', results.length);
		return { data: results, error: null };
	} catch (err) {
		dScan.error('Scan failed: %s', (err as Error).message);
		Sentry.captureException(err, {
			tags: { component: 'swap-chain', recovery: 'scanUnclaimedLockups' }
		});
		return { data: [], error: new Error(`Scan failed: ${(err as Error).message}`) };
	}
}

// ---------------------------------------------------------------------------
// Direct lockup refund
// ---------------------------------------------------------------------------

/**
 * Refund a specific on-chain lockup directly.
 */
export async function refundLockupDirect(lockup: UnclaimedLockup): Promise<{
	txHash: string | null;
	error: Error | null;
}> {
	const dRefund = createDebug('swap-chain:refund-direct');

	dRefund.log(
		'Refunding lockup: preimageHash=%s timelock=%s amount=%d sats',
		lockup.preimageHash.substring(0, 16) + '...',
		lockup.timeoutBlockHeight,
		lockup.amountSats
	);

	try {
		const refundCalldata = encodeEtherSwapRefund(
			'0x' + lockup.preimageHash,
			lockup.claimAddress,
			BigInt(lockup.timeoutBlockHeight)
		);

		const refundTxHash = await sendRawTransaction({
			to: safeAddress(lockup.lockupAddress),
			data: refundCalldata,
			value: '0',
			gasLimit: GAS_LIMIT_RSK
		});

		dRefund.log('Refund tx sent: %s', refundTxHash);
		return { txHash: refundTxHash, error: null };
	} catch (err) {
		const errorMsg = (err as Error).message;
		dRefund.error('Refund failed: %s', errorMsg);
		return { txHash: null, error: new Error(`Refund failed: ${errorMsg}`) };
	}
}

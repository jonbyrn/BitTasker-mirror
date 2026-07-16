/**
 * Connected Wallet Reverse Swap — Lightning → RBTC
 *
 * Creates a Boltz reverse swap where the claim address is a connected
 * wallet's RSK address. The claim transaction is sent via the connected
 * wallet's EVMSigner (not the built-in wallet).
 *
 * ## Flow (Option A: User-Initiated Claim)
 *
 * 1. Generate preimage + preimageHash (client-side)
 * 2. Call Boltz API with claimAddress = connected wallet address
 * 3. Save swap data to persistent storage (Capacitor Preferences)
 * 4. User pays Lightning invoice (shown in PaymentRequestModal)
 * 5. Background: poll swap status periodically
 * 6. When Boltz locks RBTC → notify user "Lightning payment received!"
 * 7. User taps "Claim" → signs claim tx via connected wallet's evmSigner
 *
 * The swap data persists across app restarts. On app start, check for
 * pending swaps via `getClaimableSwaps()`.
 *
 * @see https://docs.boltz.exchange/v/api/api-v2
 */

import { Preferences } from '@capacitor/preferences';
import type { EVMSigner } from '$lib/services/external-wallet/types';
import { createDebug } from '$lib/utils/debug';
import * as Sentry from '@sentry/sveltekit';

const d = createDebug('connected-reverse-swap');

const BOLTZ_BASE_URL = import.meta.env.VITE_BOLTZ_API_URL || 'https://api.boltz.exchange/v2';

/** Capacitor Preferences key for pending connected wallet reverse swaps. */
const STORAGE_KEY = 'bittasker_connected_reverse_swaps_v1';

/** Poll interval for checking swap status (ms). */
const POLL_INTERVAL_MS = 10_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Status of a pending connected wallet reverse swap. */
export type PendingSwapStatus =
	| 'pending' // Created, waiting for Lightning payment
	| 'claimable' // Lightning paid, Boltz locked RBTC — ready to claim
	| 'claiming' // Claim tx submitted, waiting for confirmation
	| 'claimed' // RBTC claimed successfully
	| 'expired' // Invoice expired or swap timed out
	| 'failed'; // Claim failed

export interface PendingConnectedSwap {
	swapId: string;
	preimage: string;
	preimageHash: string;
	invoice: string;
	expectedAmount: number;
	refundAddress: string;
	timeoutBlockHeight: number;
	/** Connected wallet ID (matches ConnectorHandle.id) */
	connectedWalletId: string;
	/** Connected wallet RSK address (claimAddress) */
	connectedWalletAddress: string;
	/** Connected wallet display name */
	connectedWalletName: string;
	status: PendingSwapStatus;
	claimTxHash?: string;
	error?: string;
	createdAt: number;
	updatedAt: number;
}

export interface ConnectedReverseSwapClaimResult {
	txHash: string;
}

// ---------------------------------------------------------------------------
// Create reverse swap
// ---------------------------------------------------------------------------

/**
 * Create a Boltz reverse swap (Lightning → RBTC) with a connected wallet's
 * RSK address as the claim address. Saves the swap to persistent storage
 * as a pending claim.
 */
export async function createConnectedReverseSwap(
	amountSats: number,
	claimAddress: string,
	connectedWalletId: string,
	connectedWalletName: string
): Promise<PendingConnectedSwap> {
	if (!amountSats || amountSats <= 0) {
		throw new Error('Amount must be greater than 0');
	}
	if (!claimAddress || !claimAddress.startsWith('0x')) {
		throw new Error('Invalid claim address');
	}

	// Generate preimage (32 random bytes) and preimageHash (SHA-256)
	const preimageBytes = new Uint8Array(32);
	crypto.getRandomValues(preimageBytes);
	const preimage = Array.from(preimageBytes, (b) => b.toString(16).padStart(2, '0')).join('');

	const hashBuffer = await crypto.subtle.digest('SHA-256', preimageBytes);
	const preimageHash = Array.from(new Uint8Array(hashBuffer), (b) =>
		b.toString(16).padStart(2, '0')
	).join('');

	d.log('Creating reverse swap: amount=%d claimAddress=%s', amountSats, claimAddress);

	const response = await fetch(`${BOLTZ_BASE_URL}/swap/reverse`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			from: 'BTC',
			to: 'RBTC',
			invoiceAmount: amountSats,
			preimageHash,
			claimAddress: claimAddress.toLowerCase()
		})
	});

	if (!response.ok) {
		const errorBody = await response.text();
		d.error('Boltz API error: %d %s', response.status, errorBody);
		throw new Error(`Failed to create reverse swap: ${response.status} ${errorBody}`);
	}

	const data = (await response.json()) as {
		id: string;
		invoice: string;
		expectedAmount?: number;
		refundAddress?: string;
		timeoutBlockHeight?: number;
	};

	d.log('Reverse swap created: id=%s invoice=%s...', data.id, data.invoice.substring(0, 20));

	const pendingSwap: PendingConnectedSwap = {
		swapId: data.id,
		preimage,
		preimageHash,
		invoice: data.invoice,
		expectedAmount: data.expectedAmount ?? amountSats,
		refundAddress: data.refundAddress ?? '',
		timeoutBlockHeight: data.timeoutBlockHeight ?? 0,
		connectedWalletId,
		connectedWalletAddress: claimAddress,
		connectedWalletName,
		status: 'pending',
		createdAt: Date.now(),
		updatedAt: Date.now()
	};

	// Save to persistent storage
	await savePendingSwap(pendingSwap);

	Sentry.addBreadcrumb({
		category: 'boltz',
		message: `Connected wallet reverse swap created: ${data.id}`,
		level: 'info'
	});

	return pendingSwap;
}

// ---------------------------------------------------------------------------
// Query swap status from Boltz
// ---------------------------------------------------------------------------

/** Statuses where the lockup is confirmed and we can claim. */
const CLAIMABLE_STATUSES = new Set(['transaction.mempool', 'transaction.confirmed']);

/** Statuses that indicate the swap is done (claimed or failed). */
const TERMINAL_BOLTZ_STATUSES = new Set([
	'transaction.claimed',
	'invoice.settled',
	'transaction.failed',
	'invoice.failedToPay',
	'invoice.expired',
	'swap.expired'
]);

/**
 * Check the current Boltz status of a single swap.
 * Returns the Boltz status string and optional lockup tx hash.
 */
export async function checkSwapStatus(
	swapId: string
): Promise<{ status: string; lockupTxHash?: string }> {
	const response = await fetch(`${BOLTZ_BASE_URL}/swap/${swapId}`);
	if (!response.ok) {
		throw new Error(`Boltz status check failed: ${response.status}`);
	}
	const data = (await response.json()) as {
		status?: string;
		transaction?: { id?: string };
	};
	return {
		status: data.status ?? 'unknown',
		lockupTxHash: data.transaction?.id
	};
}

/**
 * Scan all pending swaps and update their status based on Boltz API.
 * Returns swaps that became claimable (Lightning payment received).
 */
export async function refreshPendingSwaps(): Promise<PendingConnectedSwap[]> {
	const pending = await loadPendingSwaps();
	if (pending.length === 0) return [];

	const becameClaimable: PendingConnectedSwap[] = [];

	for (const swap of pending) {
		// Skip already-terminal swaps
		if (swap.status === 'claimed' || swap.status === 'expired' || swap.status === 'failed') {
			continue;
		}
		// Skip actively claiming
		if (swap.status === 'claiming') {
			continue;
		}

		try {
			const { status } = await checkSwapStatus(swap.swapId);

			if (CLAIMABLE_STATUSES.has(status) && swap.status === 'pending') {
				swap.status = 'claimable';
				swap.updatedAt = Date.now();
				await savePendingSwap(swap);
				becameClaimable.push(swap);
				d.log('Swap %s is now claimable (Boltz status: %s)', swap.swapId, status);
			} else if (TERMINAL_BOLTZ_STATUSES.has(status)) {
				if (status === 'transaction.claimed' || status === 'invoice.settled') {
					swap.status = 'claimed';
				} else {
					swap.status = 'expired';
				}
				swap.updatedAt = Date.now();
				await savePendingSwap(swap);
				d.log('Swap %s reached terminal status: %s', swap.swapId, status);
			}
		} catch (err) {
			d.warn('Failed to check status for swap %s: %s', swap.swapId, (err as Error).message);
		}
	}

	return becameClaimable;
}

/**
 * Get all pending swaps that are ready to claim (Lightning payment received,
 * Boltz locked RBTC, user hasn't claimed yet).
 */
export async function getClaimableSwaps(): Promise<PendingConnectedSwap[]> {
	const pending = await loadPendingSwaps();
	return pending.filter((s) => s.status === 'claimable');
}

/**
 * Get all active pending swaps (pending or claimable — not yet fully resolved).
 */
export async function getActivePendingSwaps(): Promise<PendingConnectedSwap[]> {
	const pending = await loadPendingSwaps();
	return pending.filter((s) => s.status === 'pending' || s.status === 'claimable');
}

// ---------------------------------------------------------------------------
// Claim via connected wallet evmSigner (user-initiated)
// ---------------------------------------------------------------------------

/**
 * Get the EtherSwap contract address from the Boltz API.
 */
async function getEtherSwapContractAddress(): Promise<string> {
	const response = await fetch(`${BOLTZ_BASE_URL}/swap/submarine`);
	if (!response.ok) {
		throw new Error(`Failed to get Boltz contract info: ${response.status}`);
	}
	const data = (await response.json()) as {
		RBTC?: { network?: { contractAddress?: string } };
	};
	const contractAddress = data.RBTC?.network?.contractAddress;
	if (!contractAddress) {
		throw new Error('Could not determine EtherSwap contract address from Boltz API');
	}
	return contractAddress;
}

/**
 * Claim RBTC from a pending connected wallet reverse swap.
 *
 * The user initiates this by tapping "Claim" in the UI. The function:
 * 1. Fetches the latest lockup parameters from the on-chain event
 * 2. Encodes `claim(bytes32, uint256, address, uint256)` calldata
 * 3. Sends via the connected wallet's evmSigner
 * 4. Updates the pending swap status in storage
 *
 * The contract uses `msg.sender` as the claim address, so the connected
 * wallet MUST have been the claimAddress when the swap was created.
 */
export async function claimPendingSwap(
	swap: PendingConnectedSwap,
	evmSigner: EVMSigner
): Promise<ConnectedReverseSwapClaimResult> {
	if (!evmSigner) {
		throw new Error('EVM signer is required for claiming');
	}
	if (!swap.preimage || swap.preimage.length !== 64) {
		throw new Error('Invalid preimage: must be 32 bytes (64 hex characters)');
	}

	// Mark as claiming
	swap.status = 'claiming';
	swap.updatedAt = Date.now();
	await savePendingSwap(swap);

	try {
		// Get the EtherSwap contract address
		const contractAddress = await getEtherSwapContractAddress();
		d.log(
			'Claiming via connected wallet: contract=%s amount=%d sats',
			contractAddress,
			swap.expectedAmount
		);

		// Convert sats to wei (1 sat = 10^10 wei for RBTC)
		const amountWei = BigInt(swap.expectedAmount) * BigInt(10_000_000_000);

		// Ensure preimage has 0x prefix
		const preimageHex = swap.preimage.startsWith('0x') ? swap.preimage : `0x${swap.preimage}`;

		// Encode claim(bytes32, uint256, address, uint256) using ethers
		const { ethers } = await import('ethers');
		const iface = new ethers.Interface([
			'function claim(bytes32 preimage, uint256 amount, address refundAddress, uint256 timelock)'
		]);
		const calldata = iface.encodeFunctionData('claim', [
			preimageHex,
			amountWei,
			swap.refundAddress,
			swap.timeoutBlockHeight
		]);

		// Send the claim transaction via connected wallet's evmSigner
		const result = await evmSigner.sendTransaction({
			to: contractAddress,
			data: calldata,
			value: 0n,
			chainId: 30 // RSK mainnet
		});

		d.log('Claim tx sent: %s', result.txHash);

		// Update swap as claimed
		swap.status = 'claimed';
		swap.claimTxHash = result.txHash;
		swap.updatedAt = Date.now();
		await savePendingSwap(swap);

		Sentry.addBreadcrumb({
			category: 'boltz',
			message: `Connected wallet reverse swap claimed: ${result.txHash}`,
			level: 'info'
		});

		return { txHash: result.txHash };
	} catch (err) {
		// Mark as failed but keep in storage for retry
		swap.status = 'claimable'; // Revert to claimable so user can retry
		swap.error = err instanceof Error ? err.message : String(err);
		swap.updatedAt = Date.now();
		await savePendingSwap(swap);

		d.error('Claim failed for swap %s: %s', swap.swapId, swap.error);
		throw err;
	}
}

/**
 * Remove a pending swap from storage (e.g., after user dismisses an expired swap).
 */
export async function removePendingSwap(swapId: string): Promise<void> {
	const pending = await loadPendingSwaps();
	const filtered = pending.filter((s) => s.swapId !== swapId);
	await Preferences.set({ key: STORAGE_KEY, value: JSON.stringify(filtered) });
}

// ---------------------------------------------------------------------------
// Persistent storage (Capacitor Preferences)
// ---------------------------------------------------------------------------

async function loadPendingSwaps(): Promise<PendingConnectedSwap[]> {
	try {
		const { value } = await Preferences.get({ key: STORAGE_KEY });
		if (!value) return [];
		return JSON.parse(value) as PendingConnectedSwap[];
	} catch {
		return [];
	}
}

async function savePendingSwap(swap: PendingConnectedSwap): Promise<void> {
	const pending = await loadPendingSwaps();
	const idx = pending.findIndex((s) => s.swapId === swap.swapId);
	if (idx >= 0) {
		pending[idx] = swap;
	} else {
		pending.push(swap);
	}
	await Preferences.set({ key: STORAGE_KEY, value: JSON.stringify(pending) });
}

// ---------------------------------------------------------------------------
// Background Poller
// ---------------------------------------------------------------------------

/**
 * Start a background poller that checks pending swaps every POLL_INTERVAL_MS.
 * Returns a stop function. Idempotent — only one poller runs at a time.
 */
let _pollerInterval: ReturnType<typeof setInterval> | null = null;

export function startPendingSwapPoller(
	onClaimable: (swap: PendingConnectedSwap) => void
): () => void {
	if (_pollerInterval) return () => stopPendingSwapPoller();

	const poll = async () => {
		try {
			const becameClaimable = await refreshPendingSwaps();
			for (const swap of becameClaimable) {
				onClaimable(swap);
			}
		} catch (err) {
			d.warn('Poll cycle failed: %s', (err as Error).message);
		}
	};

	// Run immediately, then on interval
	poll();
	_pollerInterval = setInterval(poll, POLL_INTERVAL_MS);

	return () => stopPendingSwapPoller();
}

function stopPendingSwapPoller(): void {
	if (_pollerInterval) {
		clearInterval(_pollerInterval);
		_pollerInterval = null;
	}
}

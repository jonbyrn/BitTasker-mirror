/**
 * Swap Chain — Data Persistence
 *
 * In-memory + Capacitor Preferences + Nostr NIP-44 persistence for Boltz
 * swap claim data and refund data. These survive app restarts, page refreshes,
 * and (via Nostr) device changes.
 */

import { Preferences } from '@capacitor/preferences';
import * as Sentry from '@sentry/sveltekit';
import { createDebug } from '$lib/utils/debug';
import { getNostrKeyPair } from '$lib/utils/nostrKeys';
import { saveSwapToNostr, recoverSwapsFromNostr } from '$lib/utils/swapAdapter';

const d = createDebug('swap-chain');

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------

/**
 * Storage key for Boltz chain swap claim data.
 * Persists the preimage + claim details so they survive page refreshes.
 * Without this, `pollBoltzChainSwapCompletion` cannot claim tBTC after
 * Boltz confirms the lockup if the user reloads the app mid-swap.
 */
const CLAIM_DATA_KEY = 'bittasker_swap_claim_data';
const REFUND_DATA_KEY = 'bittasker_swap_refund_data';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Storage for claim data keyed by Boltz swap ID.
 * When creating a chain swap, we generate a random preimage and store
 * the full claim details (preimage, claimDetails from API, lockupDetails).
 * These are needed to claim tBTC on Arbitrum after Boltz confirms the lockup.
 */
export interface SwapClaimData {
	preimageHex: string;
	claimDetails: {
		lockupAddress: string;
		amount: number;
		refundAddress: string;
		timeoutBlockHeight: number;
	};
	lockupClaimAddress: string; // where TBTC goes on Arbitrum
}

/**
 * Storage for Boltz refund data keyed by swap ID.
 * Needed to call `EtherSwap.refund(preimageHash)` on RSK after the
 * Boltz timelock expires, allowing the user to recover locked rBTC.
 */
export interface SwapRefundData {
	/** SHA-256 hash of the preimage — the lock key in EtherSwap.lock() */
	preimageHash: string;
	/** RSK EtherSwap contract address where rBTC was locked */
	lockupAddress: string;
	/** RSK block height after which refund is possible */
	timeoutBlockHeight: number;
	/** Boltz claim address on RSK (used in lock() calldata) */
	claimAddress: string;
}

// ---------------------------------------------------------------------------
// In-memory maps
// ---------------------------------------------------------------------------

export const swapClaimData = new Map<string, SwapClaimData>();
export const swapRefundData = new Map<string, SwapRefundData>();

// ---------------------------------------------------------------------------
// Refund data persistence
// ---------------------------------------------------------------------------

/**
 * Persist the refund data map to Capacitor Preferences.
 * Called whenever a new Boltz swap is created.
 */
export async function persistRefundData(): Promise<void> {
	try {
		const obj = Object.fromEntries(swapRefundData);
		await Preferences.set({ key: REFUND_DATA_KEY, value: JSON.stringify(obj) });
	} catch (e) {
		d.warn('Failed to persist refund data: %s', e instanceof Error ? e.message : String(e));
	}
}

/**
 * Load persisted refund data from Capacitor Preferences into the in-memory map.
 * Called at module init so refund data survives page refreshes.
 */
export async function loadPersistedRefundData(): Promise<void> {
	try {
		const { value } = await Preferences.get({ key: REFUND_DATA_KEY });
		if (value) {
			const obj = JSON.parse(value) as Record<string, SwapRefundData>;
			for (const [key, val] of Object.entries(obj)) {
				if (!swapRefundData.has(key)) {
					swapRefundData.set(key, val);
				}
			}
			d.log('Loaded %d persisted refund data entries', Object.keys(obj).length);
		}
	} catch (e) {
		d.warn('Failed to load persisted refund data: %s', e instanceof Error ? e.message : String(e));
	}
}

// ---------------------------------------------------------------------------
// Claim data persistence
// ---------------------------------------------------------------------------

/**
 * Persist the claim data map to Capacitor Preferences.
 * Called whenever a new Boltz swap is created and claim data is stored.
 */
export async function persistClaimData(): Promise<void> {
	try {
		const obj = Object.fromEntries(swapClaimData);
		await Preferences.set({ key: CLAIM_DATA_KEY, value: JSON.stringify(obj) });
	} catch (e) {
		d.warn('Failed to persist claim data: %s', e instanceof Error ? e.message : String(e));
		Sentry.captureException(e, { tags: { component: 'swap-persistence' } });
	}
}

/**
 * Load persisted claim data from Capacitor Preferences into the in-memory map.
 * Called at module init so claim data survives page refreshes.
 */
export async function loadPersistedClaimData(): Promise<void> {
	try {
		const { value } = await Preferences.get({ key: CLAIM_DATA_KEY });
		if (value) {
			const obj = JSON.parse(value) as Record<string, SwapClaimData>;
			for (const [key, val] of Object.entries(obj)) {
				if (!swapClaimData.has(key)) {
					swapClaimData.set(key, val);
				}
			}
			d.log('Loaded %d persisted claim data entries', Object.keys(obj).length);
		}
	} catch (e) {
		d.warn('Failed to load persisted claim data: %s', e instanceof Error ? e.message : String(e));
	}
}

// ---------------------------------------------------------------------------
// Nostr backup (claim data only — primary persistence mechanism)
// ---------------------------------------------------------------------------

/**
 * Save a single chain swap's claim data to Nostr (NIP-44 encrypted).
 * This is the primary persistence mechanism — survives app reinstall,
 * device change, and relay replication. Preferences is the fallback.
 *
 * The event is encrypted to the user's own pubkey, so only they can read it.
 * Uses kind 30078 (parameterized replaceable) with `d` tag = swapId,
 * so re-saving the same swap overwrites the previous event.
 */
export async function saveClaimDataToNostr(
	swapId: string,
	claimData: SwapClaimData
): Promise<void> {
	try {
		const { nsec } = await getNostrKeyPair();
		const now = Math.floor(Date.now() / 1000);
		// Build a minimal ExtendedChainSwapData for the adapter.
		// The adapter serializes all fields into NIP-44 encrypted content.
		const swapRecord: import('$lib/utils/swapAdapter').ExtendedChainSwapData = {
			id: swapId,
			type: 'chain' as const,
			preimage: claimData.preimageHex,
			preimageHash: '',
			status: 'transaction.server.confirmed' as const,
			createdAt: now,
			updatedAt: now,
			expiresAt: now + 3600,
			claimDetails: claimData.claimDetails ?? undefined,
			lockupClaimAddress: claimData.lockupClaimAddress,
			fromAsset: 'L-BTC' as const,
			fromAmount: 0,
			lockupAddress: '',
			blindingKey: '',
			liquidUri: '',
			lockupTimeoutBlockHeight: 0,
			toAsset: 'RBTC' as const,
			toAmount: 0,
			rbtcAddress: '',
			claimTimeoutBlockHeight: 0,
			refundPublicKey: '',
			refundPrivateKey: '',
			refundAddress: ''
		};
		await saveSwapToNostr(swapRecord, nsec, 'bittasker-swap-chain');
		d.log('Saved claim data to Nostr for swap %s', swapId);
	} catch (err) {
		d.warn('Failed to save claim data to Nostr for swap %s: %s', swapId, (err as Error).message);
	}
}

/**
 * Load claim data from Nostr for a specific swap ID.
 * Used as a last-resort fallback when both in-memory and Preferences are empty
 * (e.g. after app reinstall or Preferences data loss).
 *
 * Returns the SwapClaimData if found, null otherwise.
 */
export async function loadClaimDataFromNostr(swapId: string): Promise<SwapClaimData | null> {
	try {
		const { nsec } = await getNostrKeyPair();
		const swaps = await recoverSwapsFromNostr(nsec, 'bittasker-swap-chain', true);

		for (const swap of swaps) {
			// recoverSwapsFromNostr returns deserialized objects from NIP-44 encrypted content.
			// We saved them as ExtendedChainSwapData, so access fields with type narrowing.
			const s = swap as import('$lib/utils/swapAdapter').ExtendedChainSwapData;
			if (s.id === swapId && s.preimage) {
				d.log('Recovered claim data from Nostr for swap %s', swapId);
				return {
					preimageHex: s.preimage,
					claimDetails: s.claimDetails as typeof s extends { claimDetails: infer T } ? T : never,
					lockupClaimAddress: s.lockupClaimAddress ?? ''
				};
			}
		}
		return null;
	} catch (err) {
		d.warn('Failed to load claim data from Nostr for swap %s: %s', swapId, (err as Error).message);
		return null;
	}
}

// ---------------------------------------------------------------------------
// Module init — load persisted data on module init (best-effort, browser/native only)
// ---------------------------------------------------------------------------

if (typeof window !== 'undefined') {
	loadPersistedRefundData();
	loadPersistedClaimData();
}

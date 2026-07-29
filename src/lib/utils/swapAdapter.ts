/**
 * Nostr-based Swap Storage Adapter (NDK)
 *
 * Implements SwapStorage for Boltz swaps via NDK + NIP-44 encryption.
 * All swap data is encrypted to the user's own pubkey via NIP-44,
 * ensuring zero-knowledge persistence — relays cannot read swap contents.
 */

import type {
	SwapStorage,
	BoltzSwapData,
	ChainSwapData,
	SubmarineSwapData
} from '@bittasker/wallet-core';

/**
 * Extended ChainSwapData with Boltz RBTC→TBTC specific fields.
 *
 * The SDK's ChainSwapData is L-BTC↔RBTC specific. For RBTC→TBTC chain swaps
 * via Boltz, we need additional fields (claimDetails, lockupClaimAddress) that
 * aren't in the SDK type. This extension preserves type safety while allowing
 * the Nostr adapter to serialize these extra fields.
 */
export interface ExtendedChainSwapData extends ChainSwapData {
	claimDetails?: {
		lockupAddress: string;
		amount: number;
		refundAddress: string;
		timeoutBlockHeight: number;
	};
	lockupClaimAddress?: string;
}
import { Buffer } from 'buffer';
import { getPublicKey } from 'nostr-tools';
import { NDKEvent, NDKRelaySet } from '@nostr-dev-kit/ndk';
import nip44 from '$lib/nostr/nip44';
import { ndk } from '$lib/nostr/ndk';
import { applyNdkSignerFromNsec } from '$lib/nostr/ndkSigner';
import { publishDeletionEventNdk } from '$lib/nostr/profile/ndk';
import KINDS from '$lib/utils/constants/kinds';
import { NOSTR_FINAL_STATES } from '$lib/utils/wallet/swapStatusMap';
import { resolveExplicitRelayUrls } from '$lib/utils/relayUrls';
import { PUBLISH_TIMEOUT_MS } from '$lib/utils/nostr';
import { createDebug } from '$lib/utils/debug';
import * as Sentry from '@sentry/sveltekit';

const d = createDebug('swap-adapter');
const RELAYS = resolveExplicitRelayUrls(import.meta.env.VITE_NOSTR_RELAY_URL);

function randomBytes(length: number): Uint8Array {
	const bytes = new Uint8Array(length);
	crypto.getRandomValues(bytes);
	return bytes;
}

let ndkReadyPromise: Promise<string> | null = null;
let ndkReadyNsecKey: string | null = null;

function nsecCacheKey(nsec: Uint8Array): string {
	return Buffer.from(nsec).toString('hex');
}

async function ensureNdkReady(nsec: Uint8Array): Promise<string> {
	const key = nsecCacheKey(nsec);
	if (ndkReadyPromise && ndkReadyNsecKey === key) {
		return ndkReadyPromise;
	}

	ndkReadyNsecKey = key;
	ndkReadyPromise = (async () => {
		await applyNdkSignerFromNsec(nsec);
		return getPublicKey(nsec);
	})();

	try {
		return await ndkReadyPromise;
	} catch (error) {
		ndkReadyPromise = null;
		ndkReadyNsecKey = null;
		throw error;
	}
}

function swapRelaySet(): NDKRelaySet {
	return NDKRelaySet.fromRelayUrls(RELAYS, ndk);
}

// Swap type tags for filtering
export type SwapType = 'boltz-swap-reverse' | 'boltz-swap-chain' | 'bittasker-swap-chain' | 'boltz-swap-submarine';

export type PendingSwapData = BoltzSwapData | ExtendedChainSwapData | SubmarineSwapData;

function buildSwapContent(
	swapData: BoltzSwapData | ExtendedChainSwapData | SubmarineSwapData,
	swapType: SwapType
): Record<string, unknown> {
	const content: Record<string, unknown> = {
		id: swapData.id,
		preimageHash: swapData.preimageHash,
		status: swapData.status,
		lockupTxHash: swapData.lockupTxHash,
		createdAt: swapData.createdAt,
		updatedAt: swapData.updatedAt,
		expiresAt: swapData.expiresAt,
		rifRelayUsed: swapData.rifRelayUsed,
		claimAddress: swapData.claimAddress,
		description: swapData.description
	};

	if ('preimage' in swapData && swapData.preimage) {
		content.preimage = swapData.preimage;
	}
	if ('rbtcAddress' in swapData && swapData.rbtcAddress) {
		content.rbtcAddress = swapData.rbtcAddress;
	}
	if ('claimTxHash' in swapData && swapData.claimTxHash) {
		content.claimTxHash = swapData.claimTxHash;
	}

	if (swapType === 'boltz-swap-reverse') {
		const reverseSwap = swapData as BoltzSwapData;
		content.type = 'reverse';
		content.amount = reverseSwap.amount;
		content.invoice = reverseSwap.invoice;
		content.onchainAmount = reverseSwap.onchainAmount;
		content.refundAddress = reverseSwap.refundAddress;
		content.timeoutBlockHeight = reverseSwap.timeoutBlockHeight;
	} else if (swapType === 'boltz-swap-chain') {
		const chainSwap = swapData as ExtendedChainSwapData;
		content.type = 'chain';
		content.refundPrivateKey = chainSwap.refundPrivateKey;
		content.refundPublicKey = chainSwap.refundPublicKey;
		content.blindingKey = chainSwap.blindingKey;
		content.liquidUri = chainSwap.liquidUri;
		content.lockupAddress = chainSwap.lockupAddress;
		content.fromAmount = chainSwap.fromAmount;
		content.toAmount = chainSwap.toAmount;
		content.fromAsset = chainSwap.fromAsset;
		content.toAsset = chainSwap.toAsset;
		content.lockupTimeoutBlockHeight = chainSwap.lockupTimeoutBlockHeight;
		content.claimTimeoutBlockHeight = chainSwap.claimTimeoutBlockHeight;
		content.serverLockupTxHash = chainSwap.serverLockupTxHash;
		content.refundAddress = chainSwap.refundAddress;

		// Boltz RBTC→TBTC chain swaps: persist claim details needed to
		// claim tBTC on Arbitrum. These fields are on ExtendedChainSwapData
		// (not in the SDK ChainSwapData type which is Liquid↔RBTC specific).
		if (chainSwap.claimDetails) content.claimDetails = chainSwap.claimDetails;
		if (chainSwap.lockupClaimAddress) content.lockupClaimAddress = chainSwap.lockupClaimAddress;
		if (chainSwap.claimTimeoutBlockHeight)
			content.timeoutBlockHeight = chainSwap.claimTimeoutBlockHeight;
	} else if (swapType === 'boltz-swap-submarine') {
		const submarineSwap = swapData as SubmarineSwapData;
		content.type = 'submarine';
		content.invoice = submarineSwap.invoice;
		content.invoiceAmount = submarineSwap.invoiceAmount;
		content.fromAmount = submarineSwap.fromAmount;
		content.fromAsset = submarineSwap.fromAsset;
		content.expectedAmount = submarineSwap.expectedAmount;
		content.lockupAddress = submarineSwap.lockupAddress;
		content.swapTree = submarineSwap.swapTree;
		content.refundPublicKey = submarineSwap.refundPublicKey;
		content.refundPrivateKey = submarineSwap.refundPrivateKey;
		content.timeoutBlockHeight = submarineSwap.timeoutBlockHeight;
		if (submarineSwap.blindingKey) {
			content.blindingKey = submarineSwap.blindingKey;
		}
	}

	return content;
}

export async function saveSwapToNostr(
	swapData: BoltzSwapData | ExtendedChainSwapData | SubmarineSwapData,
	nsec: Uint8Array,
	swapType: SwapType
): Promise<void> {
	try {
		const npub = await ensureNdkReady(nsec);
		const content = buildSwapContent(swapData, swapType);
		const contentString = JSON.stringify(content);

		const nsecHex = Buffer.from(nsec).toString('hex');
		const conversationKey = await nip44.getConversationKey(nsecHex, npub);
		const nonce = randomBytes(32);
		const encryptedContent = await nip44.encrypt(contentString, conversationKey, nonce);

		const tags: string[][] = [
			['d', swapData.id],
			[
				'a',
				String(
					'amount' in swapData
						? swapData.amount
						: 'fromAmount' in swapData
							? swapData.fromAmount
							: 0
				)
			],
			['s', swapData.status],
			['t', swapType]
		];

		if ('rbtcAddress' in swapData && swapData.rbtcAddress) {
			tags.push(['r', swapData.rbtcAddress]);
		}

		const ndkEvent = new NDKEvent(ndk);
		ndkEvent.kind = KINDS.PENDING_SWAPS;
		ndkEvent.created_at = Math.floor(Date.now() / 1000);
		ndkEvent.tags = tags;
		ndkEvent.content = encryptedContent;
		await ndkEvent.sign();

		const relaySet = swapRelaySet();
		const requiredRelayCount = Math.min(1, RELAYS.length);
		await ndkEvent.publish(relaySet, PUBLISH_TIMEOUT_MS, requiredRelayCount);
	} catch (error) {
		d.error('Failed to save swap to Nostr: %s', (error as Error).message);
	}
}

export async function recoverSwapsFromNostr(
	nsec: Uint8Array,
	swapType: SwapType,
	includeFinal: boolean
): Promise<PendingSwapData[]> {
	try {
		const npub = await ensureNdkReady(nsec);
		const relaySet = swapRelaySet();

		const events = await ndk.fetchEvents(
			{
				authors: [npub],
				kinds: [KINDS.PENDING_SWAPS],
				'#t': [swapType]
			},
			{ closeOnEose: true },
			relaySet
		);

		const latestBySwapId = new Map<string, NDKEvent>();
		for (const event of events) {
			const swapId = event.tagValue('d');
			if (!swapId) continue;
			const existing = latestBySwapId.get(swapId);
			if (!existing || (event.created_at ?? 0) > (existing.created_at ?? 0)) {
				latestBySwapId.set(swapId, event);
			}
		}

		const nsecHex = Buffer.from(nsec).toString('hex');
		const conversationKey = await nip44.getConversationKey(nsecHex, npub);
		const swaps: PendingSwapData[] = [];

		for (const event of latestBySwapId.values()) {
			try {
				// Guard: skip events with empty or obviously invalid content
				if (!event.content || typeof event.content !== 'string') {
					continue;
				}
				const decryptedContent = await nip44.decrypt(event.content, conversationKey);
				const data = JSON.parse(decryptedContent) as PendingSwapData;

				if (!includeFinal && (NOSTR_FINAL_STATES as readonly string[]).includes(data.status)) {
					continue;
				}

				swaps.push(data);
			} catch (err) {
				// Silently skip events that can't be decrypted (may be NIP-04 encrypted
				// from older versions, corrupted, or encrypted with a different key).
				// These are not critical — the swap will be re-created on next use.
				d.log('Skipping undecryptable swap event: %s', (err as Error).message);
			}
		}

		return swaps;
	} catch (error) {
		d.error('Failed to recover swaps from Nostr: %s', (error as Error).message);
		return [];
	}
}

async function recoverPendingSwaps(
	nsec: Uint8Array,
	swapType: SwapType
): Promise<PendingSwapData[]> {
	return recoverSwapsFromNostr(nsec, swapType, false);
}

async function recoverAllSwapsFromNostr(
	nsec: Uint8Array,
	swapType: SwapType
): Promise<PendingSwapData[]> {
	return recoverSwapsFromNostr(nsec, swapType, true);
}

/**
 * Delete a single swap event from Nostr
 * Used when user manually dismisses a swap
 */
async function deleteSwapEvent(
	nsec: Uint8Array,
	swapId: string,
	swapType: SwapType
): Promise<boolean> {
	try {
		const npub = await ensureNdkReady(nsec);
		const relaySet = swapRelaySet();

		const events = await ndk.fetchEvents(
			{
				authors: [npub],
				kinds: [KINDS.PENDING_SWAPS],
				'#d': [swapId],
				'#t': [swapType]
			},
			{ closeOnEose: true },
			relaySet
		);

		if (!events.size) {
			return false;
		}

		const event = [...events][0];
		await publishDeletionEventNdk(event.id, KINDS.PENDING_SWAPS.toString(), RELAYS);
		return true;
	} catch (error) {
		d.error('Failed to delete swap event: %s', (error as Error).message);
		return false;
	}
}

async function deleteAllSwapEvents(
	nsec: Uint8Array,
	swapType: SwapType
): Promise<{ count: number }> {
	try {
		const npub = await ensureNdkReady(nsec);
		const relaySet = swapRelaySet();

		const events = await ndk.fetchEvents(
			{
				authors: [npub],
				kinds: [KINDS.PENDING_SWAPS],
				'#t': [swapType]
			},
			{ closeOnEose: true },
			relaySet
		);

		let deleteCount = 0;
		for (const event of events) {
			try {
				await publishDeletionEventNdk(event.id, KINDS.PENDING_SWAPS.toString(), RELAYS);
				deleteCount++;
			} catch (err) {
				d.error('Failed to delete event %s: %s', event.id, (err as Error).message);
			}
		}

		return { count: deleteCount };
	} catch (error) {
		d.error('Failed to delete swap events: %s', (error as Error).message);
		throw error;
	}
}

/**
 * Nostr-based storage adapter for Boltz swaps
 * Implements the SDK's SwapStorage interface
 */
export class NostrSwapStorage implements SwapStorage {
	constructor(
		private nsec: Uint8Array,
		private swapType: SwapType
	) {}

	/**
	 * Save swap data to Nostr
	 * @param swapId - Unique swap identifier
	 * @param data - Swap data to save
	 */
	async save(
		swapId: string,
		data: BoltzSwapData | ChainSwapData | SubmarineSwapData
	): Promise<void> {
		try {
			await saveSwapToNostr(data, this.nsec, this.swapType);
		} catch (error) {
			d.error('Failed to save swap %s to Nostr: %s', swapId, (error as Error).message);
		}
	}

	/**
	 * Load a specific swap by ID
	 * @param swapId - Unique swap identifier
	 * @returns Swap data or null if not found
	 */
	async load(swapId: string): Promise<BoltzSwapData | ChainSwapData | SubmarineSwapData | null> {
		try {
			const swaps = await this.loadAll();
			return swaps.find((s) => s.id === swapId) || null;
		} catch (error) {
			d.error('Failed to load swap %s from Nostr: %s', swapId, (error as Error).message);
			return null;
		}
	}

	/**
	 * Load all swaps of this type
	 * @returns Array of swap data
	 */
	async loadAll(): Promise<(BoltzSwapData | ChainSwapData | SubmarineSwapData)[]> {
		try {
			return await recoverPendingSwaps(this.nsec, this.swapType);
		} catch (error) {
			d.error('Failed to load swaps from Nostr: %s', (error as Error).message);
			Sentry.addBreadcrumb({
				category: 'swap.nostr',
				message: 'Failed to load swaps from Nostr',
				level: 'warning'
			});
			return [];
		}
	}

	/** Includes completed/final swaps — used for chain tx sort hints. */
	async loadAllIncludingFinal(): Promise<(BoltzSwapData | ChainSwapData | SubmarineSwapData)[]> {
		try {
			return await recoverAllSwapsFromNostr(this.nsec, this.swapType);
		} catch (error) {
			d.error('Failed to load swaps from Nostr: %s', (error as Error).message);
			return [];
		}
	}

	/**
	 * Delete a specific swap
	 * @param swapId - Unique swap identifier
	 */
	async delete(swapId: string): Promise<void> {
		try {
			await deleteSwapEvent(this.nsec, swapId, this.swapType);
		} catch (error) {
			d.error('Failed to delete swap %s from Nostr: %s', swapId, (error as Error).message);
			// Don't throw - deletion is not critical
		}
	}

	/**
	 * Delete all swaps of this type
	 * @returns Object with count of deleted swaps
	 */
	async deleteAll(): Promise<{ count: number }> {
		try {
			return await deleteAllSwapEvents(this.nsec, this.swapType);
		} catch (error) {
			d.error('Failed to delete all swaps from Nostr: %s', (error as Error).message);
			throw error;
		}
	}
}

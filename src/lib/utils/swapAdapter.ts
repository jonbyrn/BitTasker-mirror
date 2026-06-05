/**
 * Nostr-based Swap Storage Adapter
 *
 * Consolidated implementation of SwapStorage interface for Boltz swaps.
 * Uses Nostr (NIP-44 encryption) for decentralized, user-owned data storage.
 *
 * Features:
 * - Implements SwapStorage interface from @bittasker/wallet-core
 * - Save/update swap data to Nostr with NIP-44 encryption
 * - Recover pending swaps on app restart
 * - Delete swap events (individual or all by type)
 * - Supports both reverse swaps (Lightning → RBTC) and chain swaps (L-BTC → RBTC)
 */

import type {
	SwapStorage,
	BoltzSwapData,
	ChainSwapData,
	SubmarineSwapData
} from '@bittasker/wallet-core';
import { Buffer } from 'buffer';
import { getPublicKey, finalizeEvent } from 'nostr-tools';
import nip44 from '$lib/nostr/nip44';
import KINDS from '$lib/utils/constants/kinds';
import { appStore } from '$lib/stores/app.store';
import { get } from 'svelte/store';

// Define relay URLs
const RELAYS = [import.meta.env.VITE_NOSTR_RELAY_URL].filter(Boolean);

function randomBytes(length: number): Uint8Array {
	const bytes = new Uint8Array(length);
	crypto.getRandomValues(bytes);
	return bytes;
}

/**
 * Get the centralized pool instance from appStore
 */
function getPool() {
	const pool = get(appStore)?.pool;
	if (!pool) {
		throw new Error('Pool not found');
	}
	return pool;
}

// Swap type tags for filtering
export type SwapType = 'boltz-swap-reverse' | 'boltz-swap-chain' | 'boltz-swap-submarine';

// Union type for all swap data
export type PendingSwapData = BoltzSwapData | ChainSwapData | SubmarineSwapData;

/**
 * Save swap data to Nostr (encrypted via NIP-44)
 *
 * The ENTIRE event content is encrypted with NIP-44.
 * Sensitive fields (preimage, refundPrivateKey) are stored as plaintext
 * within the encrypted content - no double encryption needed.
 */
async function saveSwapToNostr(
	swapData: BoltzSwapData | ChainSwapData | SubmarineSwapData,
	nsec: Uint8Array,
	swapType: SwapType
): Promise<void> {
	try {
		console.log('🔒 Saving swap to Nostr:', swapData.id, 'Type:', swapType);

		const npub = getPublicKey(nsec);

		// Build content object - will be encrypted as a whole
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

		// Add common optional fields if they exist
		if ('preimage' in swapData && swapData.preimage) {
			content.preimage = swapData.preimage;
		}
		if ('rbtcAddress' in swapData && swapData.rbtcAddress) {
			content.rbtcAddress = swapData.rbtcAddress;
		}
		if ('claimTxHash' in swapData && swapData.claimTxHash) {
			content.claimTxHash = swapData.claimTxHash;
		}

		// Add type-specific fields
		if (swapType === 'boltz-swap-reverse') {
			const reverseSwap = swapData as BoltzSwapData;
			content.type = 'reverse';
			content.amount = reverseSwap.amount;
			content.invoice = reverseSwap.invoice;
			content.onchainAmount = reverseSwap.onchainAmount;
			content.refundAddress = reverseSwap.refundAddress;
			content.timeoutBlockHeight = reverseSwap.timeoutBlockHeight;
		} else if (swapType === 'boltz-swap-chain') {
			const chainSwap = swapData as ChainSwapData;
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

		// Encrypt the entire content with NIP-44
		const contentString = JSON.stringify(content);

		// getConversationKey expects hex strings
		const nsecHex = Buffer.from(nsec).toString('hex');
		const conversationKey = await nip44.getConversationKey(nsecHex, npub);
		const nonce = randomBytes(32);
		const encryptedContent = await nip44.encrypt(contentString, conversationKey, nonce);

		// Prepare Nostr event (parameterized replaceable)
		const tags: string[][] = [
			['d', swapData.id], // Unique identifier (makes it replaceable)
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
			['t', swapType] // Swap type tag for filtering
		];

		// Add rbtcAddress tag if it exists
		if ('rbtcAddress' in swapData && swapData.rbtcAddress) {
			tags.push(['r', swapData.rbtcAddress]);
		}

		const eventTemplate = {
			kind: KINDS.PENDING_SWAPS,
			created_at: Math.floor(Date.now() / 1000),
			tags,
			content: encryptedContent,
			pubkey: npub
		};

		// Sign and publish
		const signedEvent = finalizeEvent(eventTemplate, nsec);
		const pool = getPool();
		pool.publish(RELAYS, signedEvent);

		console.log('✅ Swap saved to Nostr:', swapData.id);
	} catch (error) {
		console.error('❌ Failed to save swap to Nostr:', error);
		// Don't throw - swap can still work even if Nostr storage fails
	}
}

/**
 * Recover pending swaps from Nostr
 * Filters by swap type tag and decrypts content
 */
async function recoverPendingSwaps(
	nsec: Uint8Array,
	swapType: SwapType
): Promise<PendingSwapData[]> {
	try {
		const npub = getPublicKey(nsec);
		const pool = getPool();

		// Query Nostr for user's swap events with the specified tag
		const events = await pool.querySync(RELAYS, {
			authors: [npub],
			kinds: [KINDS.PENDING_SWAPS],
			'#t': [swapType]
		});

		const pendingSwaps: PendingSwapData[] = [];

		// getConversationKey expects hex strings
		const nsecHex = Buffer.from(nsec).toString('hex');
		const conversationKey = await nip44.getConversationKey(nsecHex, npub);

		for (const event of events) {
			try {
				// Decrypt the entire content
				const decryptedContent = await nip44.decrypt(event.content, conversationKey);
				const data = JSON.parse(decryptedContent);

				// Check if swap is still pending (not in final state)
				const finalStates = [
					'invoice.settled',
					'swap.expired',
					'transaction.failed',
					'transaction.claimed',
					'claimed'
				];

				if (!finalStates.includes(data.status)) {
					pendingSwaps.push(data);
				}
			} catch (err) {
				console.error('❌ Failed to process swap event:', err);
			}
		}

		return pendingSwaps;
	} catch (error) {
		console.error('❌ Failed to recover swaps from Nostr:', error);
		return [];
	}
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
		const npub = getPublicKey(nsec);
		const pool = getPool();

		console.log('🗑️ Deleting swap:', swapId);

		// Query for the specific swap event
		const events = await pool.querySync(RELAYS, {
			authors: [npub],
			kinds: [KINDS.PENDING_SWAPS],
			'#d': [swapId],
			'#t': [swapType]
		});

		if (!events || events.length === 0) {
			console.warn('⚠️ Swap event not found:', swapId);
			return false;
		}

		// Delete the event
		const event = events[0];
		const deletionEventTemplate = {
			kind: 5,
			created_at: Math.floor(Date.now() / 1000),
			tags: [
				['e', event.id],
				['k', KINDS.PENDING_SWAPS.toString()]
			],
			content: `Deleting swap ${swapId}`
		};

		const signedDeletion = finalizeEvent(deletionEventTemplate, nsec);
		pool.publish(RELAYS, signedDeletion);

		console.log('✅ Deleted swap event:', swapId);
		return true;
	} catch (error) {
		console.error('❌ Failed to delete swap event:', error);
		return false;
	}
}

/**
 * Delete all swap events of a specific type from Nostr
 * Useful for clearing test data
 */
async function deleteAllSwapEvents(
	nsec: Uint8Array,
	swapType: SwapType
): Promise<{ count: number }> {
	try {
		const npub = getPublicKey(nsec);
		const pool = getPool();

		console.log('🗑️ Deleting all swaps. Type:', swapType);

		// Query Nostr for user's swap events of this type
		const events = await pool.querySync(RELAYS, {
			authors: [npub],
			kinds: [KINDS.PENDING_SWAPS],
			'#t': [swapType]
		});

		console.log(`📦 Found ${events.length} swap events to delete`);

		let deleteCount = 0;

		// Delete each event (NIP-09)
		for (const event of events) {
			try {
				const deletionEventTemplate = {
					kind: 5,
					created_at: Math.floor(Date.now() / 1000),
					tags: [
						['e', event.id],
						['k', KINDS.PENDING_SWAPS.toString()]
					],
					content: `Deleting ${swapType} swap data`
				};

				const signedDeletion = finalizeEvent(deletionEventTemplate, nsec);
				pool.publish(RELAYS, signedDeletion);
				deleteCount++;
				console.log(`✅ Deleted event: ${event.id}`);
			} catch (err) {
				console.error(`❌ Failed to delete event ${event.id}:`, err);
			}
		}

		console.log(`✅ Deleted ${deleteCount} swap events from Nostr`);
		return { count: deleteCount };
	} catch (error) {
		console.error('❌ Failed to delete swap events:', error);
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
			console.error(`Failed to save swap ${swapId} to Nostr:`, error);
			// Don't throw - swap can continue even if storage fails
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
			console.error(`Failed to load swap ${swapId} from Nostr:`, error);
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
			console.error('Failed to load swaps from Nostr:', error);
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
			console.error(`Failed to delete swap ${swapId} from Nostr:`, error);
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
			console.error('Failed to delete all swaps from Nostr:', error);
			throw error;
		}
	}
}

/**
 * Boltz Pending Swaps Storage (Nostr)
 * 
 * Unified storage layer for both reverse swaps and chain swaps.
 * Uses Nostr (NIP-44 encryption) for decentralized, user-owned data storage.
 * 
 * Features:
 * - Save/update swap data to Nostr
 * - Recover pending swaps on app restart
 * - Delete swap events (by type)
 * - Delete individual swap events
 */

import type { BoltzSwapData } from './reverseSwapService';
import type { ChainSwapData } from './chainSwapService';
import { randomBytes } from 'crypto';
import { Buffer } from 'buffer';
import { SimplePool } from 'nostr-tools/pool';
import { getPublicKey, finalizeEvent, type NostrEvent } from 'nostr-tools';
import nip44 from '$lib/nostr/nip44';
import KINDS from '$lib/utils/constants/kinds';

// Define relay URLs
const RELAYS = [import.meta.env.VITE_NOSTR_RELAY_URL].filter(Boolean);

// Initialize a pool for relay connections
const pool = new SimplePool();

// Swap type tags for filtering
export type SwapType = 'boltz-swap-reverse' | 'boltz-swap-chain';

// Union type for all swap data
export type PendingSwapData = BoltzSwapData | ChainSwapData;

/**
 * Convert nsec to bytes if needed
 */
function nsecToBytes(nsec: string | Uint8Array): Uint8Array {
	if (typeof nsec === 'string' && nsec.length === 64) {
		return new Uint8Array(Buffer.from(nsec, 'hex'));
	}
	return nsec as Uint8Array;
}

/**
 * Save swap data to Nostr (encrypted via NIP-44)
 * 
 * The ENTIRE event content is encrypted with NIP-44.
 * Sensitive fields (preimage, refundPrivateKey) are stored as plaintext
 * within the encrypted content - no double encryption needed.
 */
export async function saveSwapToNostr(
	swapData: BoltzSwapData | ChainSwapData,
	nsec: string | Uint8Array,
	swapType: SwapType
): Promise<void> {
	try {
		console.log('🔒 Saving swap to Nostr:', swapData.id, 'Type:', swapType);

		const nsecBytes = nsecToBytes(nsec);
		const npub = getPublicKey(nsecBytes);

		// Build content object - will be encrypted as a whole
		const content: Record<string, unknown> = {
			id: swapData.id,
			preimage: swapData.preimage, // Plaintext within encrypted event
			preimageHash: swapData.preimageHash,
			rbtcAddress: swapData.rbtcAddress,
			status: swapData.status,
			lockupTxHash: swapData.lockupTxHash,
			claimTxHash: swapData.claimTxHash,
			createdAt: swapData.createdAt,
			updatedAt: swapData.updatedAt,
			expiresAt: swapData.expiresAt,
			rifRelayUsed: swapData.rifRelayUsed
		};

		// Add type-specific fields
		if (swapType === 'boltz-swap-reverse') {
			const reverseSwap = swapData as BoltzSwapData;
			content.amount = reverseSwap.amount;
			content.invoice = reverseSwap.invoice;
			content.claimAddress = reverseSwap.claimAddress;
			content.onchainAmount = reverseSwap.onchainAmount;
			content.refundAddress = reverseSwap.refundAddress;
			content.timeoutBlockHeight = reverseSwap.timeoutBlockHeight;
		} else if (swapType === 'boltz-swap-chain') {
			const chainSwap = swapData as ChainSwapData;
			content.type = 'chain';
			content.refundPrivateKey = chainSwap.refundPrivateKey; // Plaintext within encrypted event
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
			content.claimAddress = chainSwap.claimAddress;
			content.serverLockupTxHash = chainSwap.serverLockupTxHash;
			content.refundAddress = chainSwap.refundAddress;
		}

		// Encrypt the entire content with NIP-44
		const contentString = JSON.stringify(content);
		
		// getConversationKey expects hex strings
		const nsecHex = Buffer.from(nsecBytes).toString('hex');
		const conversationKey = await nip44.getConversationKey(nsecHex, npub);
		const nonce = randomBytes(32);
		const encryptedContent = await nip44.encrypt(contentString, conversationKey, nonce);

		// Prepare Nostr event (parameterized replaceable)
		const eventTemplate = {
			kind: KINDS.PENDING_SWAPS,
			created_at: Math.floor(Date.now() / 1000),
			tags: [
				['d', swapData.id], // Unique identifier (makes it replaceable)
				['a', String('amount' in swapData ? swapData.amount : 'toAmount' in swapData ? swapData.toAmount : 0)], // Amount
				['s', swapData.status], // Status
				['r', swapData.rbtcAddress], // rBTC address
				['t', swapType] // Swap type tag for filtering
			],
			content: encryptedContent,
			pubkey: npub
		};

		// Sign and publish
		const signedEvent = finalizeEvent(eventTemplate, nsecBytes);
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
export async function recoverPendingSwaps(
	nsec: string | Uint8Array,
	swapType: SwapType
): Promise<PendingSwapData[]> {
	try {
		const nsecBytes = nsecToBytes(nsec);
		const npub = getPublicKey(nsecBytes);

		console.log('🔍 Recovering swaps from Nostr. Type:', swapType, 'User:', npub.slice(0, 8));

		// Query Nostr for user's swap events with the specified tag
		const events = await pool.querySync(RELAYS, {
			authors: [npub],
			kinds: [KINDS.PENDING_SWAPS],
			'#t': [swapType]
		});

		console.log('📦 Found', events.length, 'swap events');

		const pendingSwaps: PendingSwapData[] = [];
		
		// getConversationKey expects hex strings
		const nsecHex = Buffer.from(nsecBytes).toString('hex');
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
				} else {
					console.log('⏭️ Skipping completed/failed swap:', data.id, 'Status:', data.status);
				}
			} catch (err) {
				console.error('❌ Failed to process swap event:', err);
			}
		}

		console.log('✅ Recovered', pendingSwaps.length, 'pending swaps');
		return pendingSwaps;
	} catch (error) {
		console.error('❌ Failed to recover swaps from Nostr:', error);
		return [];
	}
}

/**
 * Delete all swap events of a specific type from Nostr
 * Useful for clearing test data
 */
export async function deleteAllSwapEvents(
	nsec: string | Uint8Array,
	swapType: SwapType
): Promise<{ count: number }> {
	try {
		const nsecBytes = nsecToBytes(nsec);
		const npub = getPublicKey(nsecBytes);

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
				const deletionEventTemplate: Partial<NostrEvent> = {
					kind: 5, // Deletion event
					created_at: Math.floor(Date.now() / 1000),
					tags: [
						['e', event.id], // Reference the event to delete
						['k', KINDS.PENDING_SWAPS.toString()] // Optional: specify the kind being deleted
					],
					content: `Deleting ${swapType} swap data`
				};

				const signedDeletion = finalizeEvent(deletionEventTemplate as any, nsecBytes);
				pool.publish(RELAYS, signedDeletion as any);
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
 * Delete a single swap event from Nostr
 * Used when user manually dismisses a swap
 */
export async function deleteSwapEvent(
	nsec: string | Uint8Array,
	swapId: string,
	swapType: SwapType
): Promise<boolean> {
	try {
		const nsecBytes = nsecToBytes(nsec);
		const npub = getPublicKey(nsecBytes);

		console.log('🗑️ Deleting swap:', swapId);

		// Query for the specific swap event
		const events = await pool.querySync(RELAYS, {
			authors: [npub],
			kinds: [KINDS.PENDING_SWAPS],
			'#d': [swapId], // Match by 'd' tag (identifier)
			'#t': [swapType] // Match by type
		});

		if (!events || events.length === 0) {
			console.warn('⚠️ Swap event not found:', swapId);
			return false;
		}

		// Delete the event
		const event = events[0];
		const deletionEventTemplate: Partial<NostrEvent> = {
			kind: 5,
			created_at: Math.floor(Date.now() / 1000),
			tags: [
				['e', event.id],
				['k', KINDS.PENDING_SWAPS.toString()]
			],
			content: `Deleting swap ${swapId}`
		};

		const signedDeletion = finalizeEvent(deletionEventTemplate as any, nsecBytes);
		pool.publish(RELAYS, signedDeletion as any);

		console.log('✅ Deleted swap event:', swapId);
		return true;
	} catch (error) {
		console.error('❌ Failed to delete swap event:', error);
		return false;
	}
}


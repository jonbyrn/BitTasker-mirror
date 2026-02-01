import type { NostrEvent } from 'nostr-tools';
import type { NostrEventWithFollowup, NostrBidStatus } from '$lib/types/bid';
import { writable, get } from 'svelte/store';
import { getNpub } from '$lib/utils/nostrKeys';
import { nip19 } from 'nostr-tools';
import { appStore } from '$lib/stores/app.store';
import { getBidsForTask, decryptBidEvent, clearBidCache } from '$lib/utils/nostr-bid';
import KINDS from '$lib/utils/constants/kinds';
import TAGS, { TAG_FILTERS } from '$lib/utils/constants/tags';

// Bid store state
type BidStoreState = {
    bids: { [taskId: string]: NostrEventWithFollowup[] };
    currentTaskId: string | null;
    isLoading: boolean;
    error: string | null;
    processingBidIds: Set<string>;
};

// Initial state
const initialState: BidStoreState = {
    bids: {},
    currentTaskId: null,
    isLoading: false,
    error: null,
    processingBidIds: new Set()
};

// Subscription management per task
let bidSubscription: { close: () => void } | null = null;
let bidStatusSubscriptionIncoming: { close: () => void } | null = null;
let bidStatusSubscriptionOutgoing: { close: () => void } | null = null;

/**
 * Handle incoming bid event from subscription
 * Decrypts the single event and adds it to the bids array (no full reload)
 */
async function handleBidEvent(event: NostrEvent) {
    try {
        // Extract taskId from #t tag
        const taskIdTag = event.tags.find((tag) => tag[0] === TAGS.T);
        const taskId = taskIdTag?.[1];

        if (!taskId) {
            console.warn('[BidStore] Bid event missing task ID');
            return;
        }

        // Get current store state
        const currentState = get(bidStore);

        // Only reload if we're currently viewing this task
        if (currentState.currentTaskId !== taskId) {
            return;
        }

        // Decrypt the single bid event
        const decryptedBid = await decryptBidEvent(event);

        if (!decryptedBid) {
            console.warn('[BidStore] Failed to decrypt bid event:', event.id);
            return;
        }

        // Add the new bid to the top of the existing bids array
        bidStore.update((state) => {
            const existingBids = state.bids[taskId] || [];

            // Check if bid already exists (avoid duplicates)
            const bidExists = existingBids.some(b => b.id === decryptedBid.id);
            if (bidExists) {
                return state;
            }

            return {
                ...state,
                bids: {
                    ...state.bids,
                    [taskId]: [decryptedBid, ...existingBids]
                }
            };
        });

        // Invalidate cache so next load gets fresh data including this new bid
        clearBidCache(taskId);

    } catch (error) {
        console.error('[BidStore] Error handling bid event:', error);
    }
}

/**
 * Handle incoming bid status event from subscription
 * Decrypts the status event and updates the corresponding bid in the array
 */
async function handleBidStatusEvent(event: NostrEvent) {
    try {
        // Extract taskId from #t tag
        const taskIdTag = event.tags.find((tag) => tag[0] === TAGS.T);
        const taskId = taskIdTag?.[1];

        if (!taskId) {
            console.warn('[BidStore] Status event missing task ID');
            return;
        }

        // Extract parent bid event ID from #e tag
        const parentEventIdTag = event.tags.find((tag) => tag[0] === TAGS.E);
        const parentBidId = parentEventIdTag?.[1];

        if (!parentBidId) {
            console.warn('[BidStore] Status event missing parent bid ID');
            return;
        }

        // Get current store state
        const currentState = get(bidStore);

        // Only process if we have bids for this task
        if (!currentState.bids[taskId]) {
            return;
        }

        // Decrypt the single status event
        const decryptedStatus = await decryptBidEvent(event);

        if (!decryptedStatus) {
            console.warn('[BidStore] Failed to decrypt status event:', event.id);
            return;
        }

        // Update the corresponding bid with the new status
        bidStore.update((state) => {
            const existingBids = state.bids[taskId] || [];

            // Find the bid that this status belongs to
            const updatedBids = existingBids.map(bid => {
                if (bid.id === parentBidId) {
                    // Check if this status is newer than existing one
                    const existingStatus = bid.latestStatus;
                    if (!existingStatus || decryptedStatus.created_at > existingStatus.created_at) {
                        // The decrypted event already has parsed content as NostrBidStatus
                        // Cast it properly for TypeScript
                        const typedStatus = decryptedStatus as unknown as Omit<NostrEvent, 'content'> & { content: NostrBidStatus };

                        return {
                            ...bid,
                            latestStatus: typedStatus
                        };
                    }
                }
                return bid;
            });

            return {
                ...state,
                bids: {
                    ...state.bids,
                    [taskId]: updatedBids
                }
            };
        });

        // Invalidate cache so next load gets fresh data with updated status
        clearBidCache(taskId);

    } catch (error) {
        console.error('[BidStore] Error handling bid status event:', error);
    }
}

// Create the store
function createBidStore() {
    const { subscribe, set, update } = writable<BidStoreState>(initialState);

    /**
     * Subscribe to bid and bid-status updates for a specific task
     */
    async function subscribeToUpdates(taskId: string, legacyTaskId?: string) {
        try {
            // Close existing subscriptions if any
            unsubscribeFromUpdates();

            const npub = await getNpub();
            const userPubkeyHex = npub.startsWith('npub') ? (nip19.decode(npub).data as string) : npub;
            const pool = get(appStore).pool;

            if (!pool) {
                console.error('[BidStore] Pool not available');
                return;
            }

            const taskIds =
                legacyTaskId && legacyTaskId !== taskId ? [taskId, legacyTaskId] : [taskId];
            const since = Math.floor(Date.now() / 1000);

            // Subscription 1: New bids for this task (where user is recipient)
            bidSubscription = pool.subscribe(
                [import.meta.env.VITE_NOSTR_RELAY_URL],
                {
                    kinds: [KINDS.BIDS],
                    ...TAG_FILTERS.byTask(taskIds),
                    ...TAG_FILTERS.byNpub(
                        npub.startsWith('npub') ? [userPubkeyHex, npub] : [userPubkeyHex, nip19.npubEncode(userPubkeyHex)]
                    ),
                    since
                },
                { onevent: handleBidEvent }
            );

            // Subscription 2: Bid status updates TO user (incoming)
            bidStatusSubscriptionIncoming = pool.subscribe(
                get(appStore).relays,
                {
                    kinds: [KINDS.BID_STATUS],
                    ...TAG_FILTERS.byTask(taskIds),
                    ...TAG_FILTERS.byNpub(
                        npub.startsWith('npub') ? [userPubkeyHex, npub] : [userPubkeyHex, nip19.npubEncode(userPubkeyHex)]
                    ),
                    since
                },
                { onevent: handleBidStatusEvent }
            );

            // Subscription 3: Bid status updates FROM user (to see own updates)
            bidStatusSubscriptionOutgoing = pool.subscribe(
                [import.meta.env.VITE_NOSTR_RELAY_URL],
                {
                    kinds: [KINDS.BID_STATUS],
                    authors: [userPubkeyHex],
                    ...TAG_FILTERS.byTask(taskIds),
                    since
                },
                { onevent: handleBidStatusEvent }
            );
        } catch (error) {
            console.error('[BidStore] Failed to subscribe:', error);
        }
    }

    /**
     * Unsubscribe from bid updates
     */
    function unsubscribeFromUpdates() {
        if (bidSubscription) {
            bidSubscription.close();
            bidSubscription = null;
        }
        if (bidStatusSubscriptionIncoming) {
            bidStatusSubscriptionIncoming.close();
            bidStatusSubscriptionIncoming = null;
        }
        if (bidStatusSubscriptionOutgoing) {
            bidStatusSubscriptionOutgoing.close();
            bidStatusSubscriptionOutgoing = null;
        }
    }

    return {
        subscribe,
        set,
        update,

        /**
         * Load bids for a specific task (initial load)
         */
        async loadBidsForTask(taskId: string) {
            update((state) => ({
                ...state,
                isLoading: true,
                error: null,
                currentTaskId: taskId
            }));

            try {
                const loadedBids = await getBidsForTask(taskId, true);

                update((state) => ({
                    ...state,
                    bids: {
                        ...state.bids,
                        [taskId]: loadedBids as NostrEventWithFollowup[]
                    },
                    isLoading: false,
                    error: null
                }));
            } catch (err) {
                const error = err instanceof Error ? err.message : 'Failed to load bids';
                update((state) => ({ ...state, error, isLoading: false }));
                console.error('[BidStore] Error loading bids:', err);
            }
        },

        /**
         * Get bids for a specific task from the store
         */
        getBidsForTask(taskId: string): NostrEventWithFollowup[] {
            const state = get({ subscribe });
            return state.bids[taskId] || [];
        },

        /**
         * Subscribe to real-time bid updates for a task
         */
        subscribeToUpdates,

        /**
         * Unsubscribe from real-time bid updates
         */
        unsubscribeFromUpdates,

        /**
         * Clear bids for a specific task
         */
        clearTaskBids(taskId: string) {
            update((state) => {
                const newBids = { ...state.bids };
                delete newBids[taskId];
                return {
                    ...state,
                    bids: newBids,
                    currentTaskId: state.currentTaskId === taskId ? null : state.currentTaskId
                };
            });
        },

        /**
         * Add bid to processing state (creates new Set for reactivity)
         */
        addProcessingBid(bidId: string) {
            update((state) => {
                const newProcessingBidIds = new Set(state.processingBidIds);
                newProcessingBidIds.add(bidId);
                return {
                    ...state,
                    processingBidIds: newProcessingBidIds
                };
            });
        },

        /**
         * Remove bid from processing state (creates new Set for reactivity)
         */
        removeProcessingBid(bidId: string) {
            update((state) => {
                const newProcessingBidIds = new Set(state.processingBidIds);
                newProcessingBidIds.delete(bidId);
                return {
                    ...state,
                    processingBidIds: newProcessingBidIds
                };
            });
        },

        /**
         * Reset store to initial state
         */
        reset() {
            unsubscribeFromUpdates();
            set(initialState);
        }
    };
}

// Export the store instance
export const bidStore = createBidStore();


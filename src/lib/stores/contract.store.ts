import type { ContractWithEvents, NostrContract } from '$lib/types/contract';
import { writable } from 'svelte/store';
import { createDebug } from '$lib/utils/debug';
import { walletManager } from '$lib/stores/wallet.store';
import { escrow } from '$lib/utils/escrow';
import { getNpub } from '$lib/utils/nostrKeys';
import { nip19, type NostrEvent } from 'nostr-tools';
import { appStore } from '$lib/stores/app.store';
import { get } from 'svelte/store';
import KINDS from '$lib/utils/constants/kinds';

const d = createDebug('storecontracts');

// Contract store state
type ContractStoreState = {
	contract: ContractWithEvents | null; // Current selected contract
	contracts: ContractWithEvents[]; // All contracts
	contractsMap: Map<string, number>; // Maps escrowData.id -> array index for O(1) access
	isLoading: boolean;
	error: string | null;
	isDrawerOpen: boolean;
	isResolutionFormOpen: boolean;
	// Infinite scroll state
	hasMore: boolean; // Whether more contracts can be loaded
	oldestTimestamp: number | null; // Timestamp of oldest loaded contract for pagination (event.created_at in seconds)
	isSubscribed: boolean; // Whether real-time subscriptions are active
	isLoadingMore: boolean; // Whether currently loading more contracts
};

// Initial state
const initialState: ContractStoreState = {
	contracts: [],
	contract: null,
	contractsMap: new Map(),
	isLoading: false,
	error: null,
	isDrawerOpen: false,
	isResolutionFormOpen: false,
	hasMore: true,
	oldestTimestamp: null,
	isSubscribed: false,
	isLoadingMore: false
};

// Pagination configuration
const CONTRACTS_LIMIT = 5; // Number of contracts to display per page
const PAGINATION_BUFFER = 5; // Extra contracts to fetch for handling duplicates/collisions

// Subscription management - need TWO subscriptions for OR logic (per event type)
// Status update subscriptions
let statusSubscriptionIncoming: { close: () => void } | null = null;
let statusSubscriptionOutgoing: { close: () => void } | null = null;

// Contract creation subscriptions
let contractSubscription: { close: () => void } | null = null;

// Create the store
function createContractStore() {
	const { subscribe, set, update } = writable<ContractStoreState>(initialState);

	/**
	 * Subscribe to contract status updates
	 * Note: pool.subscribe only accepts ONE filter at a time, so we need TWO separate subscriptions:
	 * Subscription 1: Status events TO the user (recipient - #p tag)
	 * Subscription 2: Status events FROM the user (author - to see own status updates)
	 */
	async function subscribeToStatusUpdates() {
		try {
			if (statusSubscriptionIncoming && statusSubscriptionOutgoing) {
				d.log('Already subscribed to status updates');
				return;
			}

			const npub = await getNpub();
			const userPubkeyHex = npub.startsWith('npub') ? (nip19.decode(npub).data as string) : npub;
			const _appStore = get(appStore);
			const pool = _appStore?.pool;

			if (!pool) {
				d.error('Pool not available (subscribeToStatusUpdates)');
				return;
			}

			const since = Math.floor(Date.now() / 1000);

			// Subscription 1: Status events where user is RECIPIENT
			statusSubscriptionIncoming = pool.subscribe(
				_appStore?.relays ?? [],
				{
					kinds: [KINDS.CONTRACT_STATUS],
					'#p': [userPubkeyHex],
					since
				},
				{ onevent: async (event: NostrEvent) => await escrow.contractOps.handleStatusEvent(event) }
			);

			// Subscription 2: Status events where user is AUTHOR (to see own updates)
			statusSubscriptionOutgoing = pool.subscribe(
				_appStore?.relays ?? [],
				{
					kinds: [KINDS.CONTRACT_STATUS],
					authors: [userPubkeyHex],
					since
				},
				{ onevent: async (event: NostrEvent) => await escrow.contractOps.handleStatusEvent(event) }
			);
		} catch (error) {
			d.error('Failed to subscribe:', error);
		}
	}

	/**
	 * Subscribe to new contract creation events
	 * Note: pool.subscribe only accepts ONE filter at a time, so we need TWO separate subscriptions:
	 * Subscription 1: Contract events where user is PARTICIPANT (#p tag)
	 * Subscription 2: Contract events where user is AUTHOR (contracts they create)
	 */
	async function subscribeToNewContracts() {
		try {
			if (contractSubscription) return;

			const npub = await getNpub();
			const userPubkeyHex = npub.startsWith('npub') ? (nip19.decode(npub).data as string) : npub;
			const _appStore = get(appStore);
			const pool = _appStore?.pool;

			if (!pool) {
				d.error('Pool not available (subscribeToNewContracts)');
				return;
			}

			const since = Math.floor(Date.now() / 1000);
			const currentNetwork = import.meta.env.VITE_RSK_NETWORK;

			// Subscription 1: Contract events where user is PARTICIPANT
			contractSubscription = pool.subscribe(
				_appStore?.relays ?? [],
				{
					kinds: [KINDS.CONTRACT],
					'#p': [userPubkeyHex],
					'#n': [currentNetwork], // Filter by current network
					since
				},
				{ onevent: escrow.contractOps.handleContractEvent }
			);
		} catch (error) {
			d.error('Failed to subscribe to new contracts:', error);
		}
	}

	/**
	 * Unsubscribe from contract status updates
	 */
	function unsubscribeFromStatusUpdates() {
		if (statusSubscriptionIncoming) {
			statusSubscriptionIncoming.close();
			statusSubscriptionIncoming = null;
		}
		if (statusSubscriptionOutgoing) {
			statusSubscriptionOutgoing.close();
			statusSubscriptionOutgoing = null;
		}
	}

	/**
	 * Unsubscribe from new contract creation events
	 */
	function unsubscribeFromNewContracts() {
		if (contractSubscription) {
			contractSubscription.close();
			contractSubscription = null;
		}
	}
	return {
		set,
		subscribe,
		update,

		/**
		 * Load all contracts (initial load)
		 */
		async loadContracts() {
			update((state) => ({ ...state, isLoading: true, error: null }));
			d.log('load start', { limit: CONTRACTS_LIMIT });

			try {
				const loadedContracts = await escrow.contractOps.getContracts({ limit: CONTRACTS_LIMIT });

				if (loadedContracts.length > 0) await walletManager.initialize();

				// Build index map: escrowData.id -> array index for O(1) access
				const contractsMap = new Map<string, number>();
				loadedContracts.forEach((contract, index) => {
					const id = contract.escrowData?.id ?? contract.contractEvent.content.escrowId;
					contractsMap.set(id, index);
				});

				// Determine oldest timestamp for pagination (use event.created_at in seconds)
				const oldestTimestamp =
					loadedContracts.length > 0
						? loadedContracts[loadedContracts.length - 1].contractEvent.created_at
						: null;

				// Determine if more contracts can be loaded
				const hasMore = loadedContracts.length === CONTRACTS_LIMIT;

				set({
					contracts: loadedContracts,
					contract: null, // Reset selected contract when reloading
					contractsMap,
					isLoading: false,
					error: null,
					isDrawerOpen: false,
					isResolutionFormOpen: false,
					hasMore,
					oldestTimestamp,
					isSubscribed: false,
					isLoadingMore: false
				});

				d.log('load result', {
					count: loadedContracts.length,
					sample: loadedContracts.map((c) => ({
						escrowId: c.escrowData?.id ?? c.contractEvent.content.escrowId,
						taskId: c.contractEvent.content.taskId,
						taskIdFormat:
							typeof c.contractEvent.content.taskId === 'string'
								? /^[0-9a-fA-F]{64}$/.test(c.contractEvent.content.taskId)
									? 'event-id'
									: 'd-tag'
								: 'unknown',
						status: c.status
					}))
				});

				// Subscribe to real-time updates AFTER initial load
				await subscribeToStatusUpdates();
				await subscribeToNewContracts();

				// Mark as subscribed
				update((state) => ({ ...state, isSubscribed: true }));
			} catch (err) {
				const error = err instanceof Error ? err.message : 'Failed to load contracts';
				update((state) => ({ ...state, error, isLoading: false }));
			}
		},

		/**
		 * Load more contracts (infinite scroll) - Hybrid Pagination Approach
		 *
		 * Strategy:
		 * 1. Fetch LIMIT + BUFFER contracts to handle timestamp collisions
		 * 2. Filter out already-loaded contracts by escrowData.id (deduplication)
		 * 3. Take first LIMIT contracts from filtered results
		 * 4. Update boundary timestamp and contractsMap
		 * 5. hasMore = (filtered count > LIMIT)
		 *
		 * This approach handles:
		 * - Same-second timestamp collisions (escrowData.id dedup)
		 * - Relay boundary ambiguity (over-fetching compensates)
		 */
		async loadMoreContracts() {
			const state = get(contractStore);

			// Prevent multiple simultaneous loads
			if (state.isLoadingMore || state.isLoading || !state.hasMore) {
				d.log('Already loading more contracts or no more contracts to load');
				return;
			}

			if (!state.oldestTimestamp) {
				update((state) => ({ ...state, isLoadingMore: false, hasMore: false }));
				d.log('No oldest timestamp to load more contracts');
				return;
			}

			update((state) => ({ ...state, isLoadingMore: true }));

			try {
				// Fetch with buffer for handling collisions and duplicates
				const fetchLimit = CONTRACTS_LIMIT + PAGINATION_BUFFER;
				const fetchedContracts = await escrow.contractOps.getContracts({
					limit: fetchLimit,
					until: state.oldestTimestamp
				});

				// Check if we got any new contracts
				if (fetchedContracts.length === 0) {
					update((s) => ({ ...s, hasMore: false, isLoadingMore: false }));
					d.log('No more contracts available');
					return;
				}

				// Filter out already-loaded contracts by escrowData.id (deduplication)
				const newContracts = fetchedContracts.filter((contract) => {
					const id = contract.escrowData?.id ?? contract.contractEvent.content.escrowId;
					return !state.contractsMap.has(id);
				});

				// Take only the contracts we need (LIMIT)
				const contractsToAdd = newContracts.slice(0, CONTRACTS_LIMIT);

				if (contractsToAdd.length === 0) {
					// All fetched contracts were duplicates - try fetching from older timestamp
					const oldestFetched = fetchedContracts[fetchedContracts.length - 1];
					d.log('All contracts were duplicates, updating boundary');

					update((s) => ({
						...s,
						oldestTimestamp: oldestFetched.contractEvent.created_at,
						isLoadingMore: false
					}));
					return;
				}

				// Update store with new contracts
				update((state) => {
					// Merge contracts
					const allContracts = [...state.contracts, ...contractsToAdd];

					// Rebuild index map
					const newContractsMap = new Map<string, number>();
					allContracts.forEach((contract, index) => {
						const id = contract.escrowData?.id ?? contract.contractEvent.content.escrowId;
						newContractsMap.set(id, index);
					});

					// Update boundary timestamp (use last DISPLAYED contract's timestamp)
					const newOldestTimestamp =
						contractsToAdd[contractsToAdd.length - 1].contractEvent.created_at;

					// Determine if more contracts might exist
					// If we got more unique contracts than we needed, there's likely more
					const hasMore = newContracts.length > CONTRACTS_LIMIT;

					return {
						...state,
						contracts: allContracts,
						contractsMap: newContractsMap,
						oldestTimestamp: newOldestTimestamp,
						hasMore,
						isLoadingMore: false
					};
				});
			} catch (err) {
				d.error('Error loading more contracts:', err);
				update((s) => ({ ...s, isLoadingMore: false }));
			}
		},

		/**
		 * Reload a specific contract from Nostr/blockchain by escrowData.id
		 * Use this sparingly - only when you need to fetch fresh data
		 * (e.g., new contract created, or need to sync status events)
		 */
		async loadContractByEscrowId(escrowId: string): Promise<boolean> {
			try {
				const loadedContracts = await escrow.contractOps.getContracts({ escrowIds: [escrowId] });

				if (loadedContracts.length > 0) {
					const updatedContract = loadedContracts[0];
					const escrowDataId =
						updatedContract.escrowData?.id ?? updatedContract.contractEvent.content.escrowId;

					update((state) => {
						const index = state.contractsMap.get(escrowDataId);
						const selectedEscrowId =
							state.contract?.escrowData?.id ?? state.contract?.contractEvent.content.escrowId;
						const selectedContract =
							selectedEscrowId === escrowDataId ? updatedContract : state.contract;

						if (index === undefined) {
							// New contract - add it to the array
							const newIndex = state.contracts.length;
							const newContractsMap = new Map(state.contractsMap);
							newContractsMap.set(escrowDataId, newIndex);

							return {
								...state,
								contracts: [...state.contracts, updatedContract],
								contractsMap: newContractsMap,
								contract: selectedContract
							};
						}

						// Existing contract - update at index
						const newContracts = [...state.contracts];
						newContracts[index] = updatedContract;

						return {
							...state,
							contracts: newContracts,
							contract: selectedContract
						};
					});

					return true;
				}
			} catch (err) {
				d.error('Error reloading contract', { escrowId }, err);
			}

			return false;
		},

		/**
		 * Get dynamic value from contract using dot notation path
		 * Examples:
		 *   getContractKey(contract, 'escrowId') -> contract.contractEvent.content.escrowId
		 *   getContractKey(contract, 'taskTitle') -> contract.contractEvent.content.taskTitle
		 *   getContractKey(contract, 'status') -> contract.status
		 *   getContractKey(contract, 'isClient') -> contract.isClient
		 *   getContractKey(contract, 'taskeePubkey') -> computed based on isClient
		 *   getContractKey(contract, 'contractEventId') -> contract.contractEvent.id
		 */
		getContractKey(
			contract: ContractWithEvents,
			key:
				| keyof NostrContract
				| keyof ContractWithEvents
				| 'otherPartyNpub'
				| 'contractEventId'
				| 'contextLabel'
		): string | number | boolean | undefined {
			const content = contract.contractEvent.content;
			const contextType = content.contextType ?? 'task';
			const contextTitle =
				content.contextTitle ??
				content.serviceTitle ??
				content.taskTitle ??
				content.contextId ??
				content.serviceId ??
				content.taskId;
			const contextDescription = content.contextDescription ?? content.taskDescription ?? '';

			// Handle special computed cases first
			if (key === 'contractEventId') {
				return contract.contractEvent.id;
			}

			if (key === 'contextLabel') {
				if (contextType === 'service') {
					return content.purchaseMode === 'instant_buy' ? 'Book Now' : 'Quoted Service';
				}
				return 'Task Contract';
			}

			if (key === 'otherPartyNpub') {
				return contract.isClient ? content.freelancerPubkey : content.clientPubkey;
			}

			if (key === 'contextType') {
				return contextType;
			}

			if (key === 'contextTitle' || key === 'serviceTitle' || key === 'taskTitle') {
				return contextTitle;
			}

			if (key === 'contextDescription' || key === 'taskDescription') {
				return contextDescription;
			}

			if (key === 'contextId' || key === 'serviceId' || key === 'taskId') {
				return content.contextId ?? content.serviceId ?? content.taskId;
			}

			// Direct properties on ContractWithEvents
			if (key in contract && typeof contract[key as keyof ContractWithEvents] !== 'undefined') {
				return contract[key as keyof ContractWithEvents] as string | number | boolean | undefined;
			}

			// Properties in contractEvent.content (NostrContract)
			if (key in contract.contractEvent.content) {
				return contract.contractEvent.content[key as keyof NostrContract] as string | number | boolean | undefined;
			}

			d.warn('Unknown key', { key: String(key) });
			return undefined;
		},

		/**
		 * Subscribe to real-time contract status updates
		 */
		subscribeToStatusUpdates,

		/**
		 * Unsubscribe from real-time contract status updates
		 */
		unsubscribeFromStatusUpdates,

		/**
		 * Subscribe to new contract creation events
		 */
		subscribeToNewContracts,

		/**
		 * Unsubscribe from new contract creation events
		 */
		unsubscribeFromNewContracts,

		/**
		 * Reset store to initial state
		 */
		reset() {
			// Unsubscribe from all subscriptions before reset
			unsubscribeFromStatusUpdates();
			unsubscribeFromNewContracts();
			set(initialState);
		}
	};
}

// Export the store instance
export const contractStore = createContractStore();

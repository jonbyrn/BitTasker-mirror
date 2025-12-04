import type { ContractWithEvents, NostrContract } from '$lib/types/contract';
import { writable } from 'svelte/store';
import { getContracts, handleStatusEvent } from '$lib/utils/nostr-contract';
import { getNpub } from '$lib/utils/nostrKeys';
import { nip19 } from 'nostr-tools';
import { appStore } from '$lib/stores/app.store';
import { get } from 'svelte/store';
import KINDS from '$lib/utils/constants/kinds';

// Contract store state
type ContractStoreState = {
	contract: ContractWithEvents | null; // Current selected contract
	contracts: ContractWithEvents[]; // All contracts
	contractsMap: Map<string, number>; // Maps escrowId -> array index for O(1) access
	isLoading: boolean;
	error: string | null;
	isDrawerOpen: boolean;
	isResolutionFormOpen: boolean;
};

// Initial state
const initialState: ContractStoreState = {
	contracts: [],
	contract: null,
	contractsMap: new Map(),
	isLoading: false,
	error: null,
	isDrawerOpen: false,
	isResolutionFormOpen: false
};

// Subscription management - need TWO subscriptions for OR logic
let statusSubscriptionIncoming: { close: () => void } | null = null;
let statusSubscriptionOutgoing: { close: () => void } | null = null;

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
				return;
			}

			const npub = await getNpub();
			const userPubkeyHex = npub.startsWith('npub') ? (nip19.decode(npub).data as string) : npub;
			const pool = get(appStore).pool;

			if (!pool) {
				console.error('[ContractStore] Pool not available');
				return;
			}

			const since = Math.floor(Date.now() / 1000);

			// Subscription 1: Status events where user is RECIPIENT
			statusSubscriptionIncoming = pool.subscribe(
				[import.meta.env.VITE_NOSTR_RELAY_URL],
				{
					kinds: [KINDS.CONTRACT_STATUS],
					'#p': [userPubkeyHex],
					since
				},
				{ onevent: handleStatusEvent }
			);

			// Subscription 2: Status events where user is AUTHOR (to see own updates)
			statusSubscriptionOutgoing = pool.subscribe(
				[import.meta.env.VITE_NOSTR_RELAY_URL],
				{
					kinds: [KINDS.CONTRACT_STATUS],
					authors: [userPubkeyHex],
					since
				},
				{ onevent: handleStatusEvent }
			);

		} catch (error) {
			console.error('[ContractStore] Failed to subscribe:', error);
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
	return {
		set,
		subscribe,
		update,

		/**
		 * Load all contracts (initial load)
		 */
		async loadContracts() {
			update(state => ({ ...state, isLoading: true, error: null }));

			try {
				const loadedContracts = await getContracts();

				// Build index map: escrowId -> array index for O(1) access
				const contractsMap = new Map<string, number>();
				loadedContracts.forEach((contract, index) => {
					contractsMap.set(contract.contractEvent.content.escrowId, index);
				});

				set({
					contracts: loadedContracts,
					contract: null, // Reset selected contract when reloading
					contractsMap,
					isLoading: false,
					error: null,
					isDrawerOpen: false,
					isResolutionFormOpen: false
				});
			} catch (err) {
				const error = err instanceof Error ? err.message : 'Failed to load contracts';
				update(state => ({ ...state, error, isLoading: false }));
				console.error('[ContractStore] Error loading contracts:', err);
			}
		},

		/**
		 * Reload a specific contract from Nostr/blockchain
		 * Use this sparingly - only when you need to fetch fresh data
		 * (e.g., new contract created, or need to sync status events)
		 */
		async loadContractByEscrowId(escrowId: string) {
			try {
				const loadedContracts = await getContracts({ escrowIds: [escrowId] });

				if (loadedContracts.length > 0) {
					const updatedContract = loadedContracts[0];

					update(state => {
						const index = state.contractsMap.get(escrowId);

						if (index === undefined) {
							// New contract - add it to the array
							const newIndex = state.contracts.length;
							const newContractsMap = new Map(state.contractsMap);
							newContractsMap.set(escrowId, newIndex);

							return {
								...state,
								contracts: [...state.contracts, updatedContract],
								contractsMap: newContractsMap
							};
						}

						// Existing contract - update at index
						const newContracts = [...state.contracts];
						newContracts[index] = updatedContract;

						return {
							...state,
							contracts: newContracts
						};
					});
				}
			} catch (err) {
				console.error(`[ContractStore] Error reloading contract ${escrowId}:`, err);
			}
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
			key: keyof NostrContract | keyof ContractWithEvents | 'otherPartyNpub' | 'contractEventId'
		): any {
			// Handle special computed cases first
			if (key === 'contractEventId') {
				return contract.contractEvent.id;
			}

			if (key === 'otherPartyNpub') {
				return contract.isClient
					? contract.contractEvent.content.freelancerPubkey
					: contract.contractEvent.content.clientPubkey;
			}

			// Direct properties on ContractWithEvents
			if (key in contract && typeof contract[key as keyof ContractWithEvents] !== 'undefined') {
				return contract[key as keyof ContractWithEvents];
			}

			// Properties in contractEvent.content (NostrContract)
			if (key in contract.contractEvent.content) {
				return contract.contractEvent.content[key as keyof NostrContract];
			}

			console.warn(`[ContractStore] Unknown key: ${String(key)}`);
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
		 * Reset store to initial state
		 */
		reset() {
			set(initialState);
		}
	};
}

// Export the store instance
export const contractStore = createContractStore();


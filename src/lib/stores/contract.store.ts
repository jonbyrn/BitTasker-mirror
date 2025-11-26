import type { ContractWithEvents, NostrContract } from '$lib/types/contract';
import { writable } from 'svelte/store';
import { getContracts } from '$lib/utils/nostr-contract';
import { EscrowStatus } from '$lib/utils/enums/wallet.enum';

// Contract store state
type ContractStoreState = {
	contracts: ContractWithEvents[];
	contractsMap: Map<string, number>; // Maps escrowId -> array index for O(1) access
	isLoading: boolean;
	error: string | null;
};

// Initial state
const initialState: ContractStoreState = {
	contracts: [],
	contractsMap: new Map(),
	isLoading: false,
	error: null
};

// Create the store
function createContractStore() {
	const { subscribe, set, update } = writable<ContractStoreState>(initialState);

	return {
		subscribe,

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
					contractsMap,
					isLoading: false,
					error: null
				});
			} catch (err) {
				const error = err instanceof Error ? err.message : 'Failed to load contracts';
				update(state => ({ ...state, error, isLoading: false }));
				console.error('[ContractStore] Error loading contracts:', err);
			}
		},

		/**
		 * Update contract status directly (called from blockchain events)
		 * This updates the contract status without re-fetching from Nostr/blockchain
		 * 
		 * @param escrowId - The escrow ID of the contract to update
		 * @param newStatus - The new unified status
		 * @param blockchainStatus - The new blockchain status (optional)
		 */
		updateContractStatus(
			escrowId: string, 
			newStatus: EscrowStatus, 
			blockchainStatus?: EscrowStatus
		) {
			update(state => {
				const index = state.contractsMap.get(escrowId);
				
				if (index === undefined) {
					console.warn(`[ContractStore] Contract not found for escrowId: ${escrowId}`);
					return state;
				}

				// Direct array access - O(1) operation
				const contract = state.contracts[index];
				
				// Create updated contract with new status
				const updatedContract: ContractWithEvents = {
					...contract,
					status: newStatus,
					blockchainStatus: blockchainStatus ?? contract.blockchainStatus,
					isPending: false // Clear pending state after blockchain confirmation
				};
				
				// Create new array with updated contract at the same index
				const newContracts = [...state.contracts];
				newContracts[index] = updatedContract;
				
				return {
					...state,
					contracts: newContracts
				};
			});
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
			key: keyof NostrContract | keyof ContractWithEvents | 'taskeePubkey' | 'contractEventId'
		): any {
			// Handle special computed cases first
			if (key === 'contractEventId') {
				return contract.contractEvent.id;
			}
			
			if (key === 'taskeePubkey') {
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
		 * Reset store to initial state
		 */
		reset() {
			set(initialState);
		}
	};
}

// Export the store instance
export const contractStore = createContractStore();


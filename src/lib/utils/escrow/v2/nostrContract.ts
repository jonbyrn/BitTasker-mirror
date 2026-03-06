import type { Filter, NostrEvent } from 'nostr-tools';
import type { EscrowData, DisputeProposal } from '$lib/types/wallet';
import { nip19, nip44 } from 'nostr-tools';
import { getNostrKeyPair, getNpub } from '$lib/utils/nostrKeys';
import { queryNostrEvents, publishNostrEvent } from '$lib/utils/nostr';
import TAGS, { TAG_FILTERS, TAG_PATTERNS } from '$lib/utils/constants/tags';
import type {
	NostrContract,
	NostrContractStatus,
	ContractWithEvents,
	ContractEvent,
	CreateContractParams,
	PublishStatusParams,
	ContractFilter,
	ContractStatusEvent
} from '$lib/types/contract';
import { escrow } from './escrow';
import { EscrowStatus } from './escrow.enum';
import { getSignedEvent } from '$lib/utils/nostr';
import { determineContractState } from '$lib/utils/helpers/contractPermissions';
import { contractStore } from '$lib/stores/contract.store';
import { get } from 'svelte/store';
import { appStore } from '$lib/stores/app.store';
import { publishEscrowStatus } from './escrowEvents';
import KINDS from '$lib/utils/constants/kinds';
import nostrEventsService from '$lib/api/services/nostr/events';
import { EscrowError, EscrowErrorCode, isEscrowError } from '$lib/utils/helpers/escrowErrors';
import { getProvider } from '$lib/stores/wallet.store';

const VERSION_TAG = 'v2';

/**
 * Publish a new contract event after escrow creation (as encrypted DM)
 */
export async function publishContractEvent(params: CreateContractParams): Promise<void> {
	try {
		const npub = await getNpub();
		const clientPubkey = npub.startsWith('npub') ? (nip19.decode(npub).data as string) : npub;

		const network = import.meta.env.VITE_RSK_NETWORK;
		const contractAddress =
			network === 'mainnet'
				? import.meta.env.VITE_RSK_CONTRACT_ADDRESS_V2_MAINNET
				: import.meta.env.VITE_RSK_CONTRACT_ADDRESS_V2_TESTNET;

		const contractData: NostrContract = {
			escrowId: params.escrowId,
			taskId: params.taskId,
			taskTitle: params.taskTitle,
			taskDescription: params.taskDescription,
			freelancerPubkey: params.freelancerPubkey,
			clientPubkey,
			amount: params.amount,
			currency: 'RBTC',
			status: EscrowStatus.Funded,
			estimatedStartTime: params.estimatedStartTime,
			estimatedCompletionTime: params.estimatedCompletionTime,
			transactionHash: params.transactionHash,
			type: 'contract',
			contractAddress
		};

		const contractMessage = JSON.stringify(contractData);
		const tags = TAG_PATTERNS.contract(
			params.escrowId,
			params.taskId,
			params.freelancerPubkey,
			clientPubkey,
			network,
			VERSION_TAG
		);

		await publishNostrEvent(KINDS.CONTRACT, contractMessage, params.freelancerPubkey, tags);
	} catch (error) {
		console.warn('[V2] Error creating contract:', error);
	}
}

export async function publishContractStatus(params: PublishStatusParams): Promise<void> {
	try {
		let npub = await getNpub();
		npub = npub.startsWith('npub') ? (nip19.decode(npub).data as string) : npub;

		const statusData: NostrContractStatus = {
			contractEventId: params.contractEventId,
			escrowId: params.escrowId,
			action: params.action,
			message: params.message,
			timestamp: Date.now(),
			transactionHash: params.transactionHash,
			proposedClientAmount: params.proposedClientAmount,
			proposedFreelancerAmount: params.proposedFreelancerAmount,
			completionAttachments: params.completionAttachments,
			type: 'contract-status'
		};

		// TODO: Unnecessary code to be removed, pass contract data from arguments
		const contractEvents = await queryNostrEvents({
			kinds: [KINDS.CONTRACT],
			'#d': [params.escrowId],
			limit: 1
		});

		if (contractEvents.length === 0) {
			throw new Error('Contract not found for status update');
		}

		const contractData: NostrContract = contractEvents[0].content as unknown as NostrContract;
		const recipientPubkey =
			npub === contractData.clientPubkey
				? contractData.freelancerPubkey
				: contractData.clientPubkey;

		const statusMessage = JSON.stringify(statusData);
		const tags = TAG_PATTERNS.contractStatus(
			params.contractEventId,
			params.escrowId,
			recipientPubkey,
			params.action,
			VERSION_TAG
		);

		await publishNostrEvent(KINDS.CONTRACT_STATUS, statusMessage, recipientPubkey, tags);
	} catch (error) {
		console.warn('[V2] Error publishing contract status:', error);
	}
}

export async function getContracts(filter?: ContractFilter): Promise<ContractWithEvents[]> {
	try {
		let npub = await getNpub();
		npub = npub.startsWith('npub') ? (nip19.decode(npub).data as string) : npub;

		const currentNetwork = import.meta.env.VITE_RSK_NETWORK;

		const nostrFilter: Filter = {
			kinds: [KINDS.CONTRACT],
			...TAG_FILTERS.byNpub(npub),
			...TAG_FILTERS.byNetwork(currentNetwork),
			limit: filter?.limit || 5
		};

		if (filter?.escrowIds) nostrFilter['#d'] = filter.escrowIds;
		if (filter?.taskIds) nostrFilter['#t'] = filter.taskIds;
		if (filter?.until) nostrFilter.until = filter.until;
		if (filter?.since) nostrFilter.since = filter.since;

		// Query contract events with their status events attached automatically
		// The followup feature will query CONTRACT_STATUS events that reference these contract event IDs
		const contractEventsWithStatus = await queryNostrEvents(
			nostrFilter,
			{
				kinds: [KINDS.CONTRACT_STATUS],
				limit: (filter?.limit || 5) * 20
			},
			{
				attachAs: 'statusEvents',
				keepLatest: false
			}
		);

		const contractsWithStatuses: ContractWithEvents[] = [];

		for (const event of contractEventsWithStatus) {
			try {
				const contractEvent = event as unknown as ContractEvent;
				const statusEvents = contractEvent.statusEvents?.sort(
					(a, b) => a.created_at - b.created_at
				);

				// TODO: Suspicious code to be verified and removed if not needed
				// Version-aware recovery for stale PendingAcceptance events
				if (statusEvents && contractEvent.content.escrowId) {
					const pendingAcceptanceEvents = statusEvents.filter(
						(e) => e.content.action === EscrowStatus.PendingAcceptance && e.content.transactionHash
					);
					const hasFundsReleased = statusEvents.some(
						(e) => e.content.action === EscrowStatus.FundsReleased
					);

					if (pendingAcceptanceEvents.length > 0 && !hasFundsReleased) {
						const now = Math.floor(Date.now() / 1000);
						const staleEvents = pendingAcceptanceEvents.filter(
							(e) => (now * 1000 - e.created_at * 1000) / 60000 > 5
						);

						if (staleEvents.length > 0) {
							const oldestStale = staleEvents.sort((a, b) => a.created_at - b.created_at)[0];
							if (oldestStale.content.transactionHash && contractEvent.id) {
								recoverMissingFundsReleasedEvent(
									contractEvent.content.escrowId,
									contractEvent.id,
									oldestStale.content.transactionHash
								).catch(() => { });
							}
						}
					}
				}

				const isClient = contractEvent.content.clientPubkey === npub;
				const isFreelancer = contractEvent.content.freelancerPubkey === npub;

				let escrowData: EscrowData | null = null;
				let blockchainStatus: EscrowStatus | null = null;
				let isPending = false;
				const disputeProposal: DisputeProposal | null = null;

				try {
					// Version-aware blockchain address resolution
					const contractVersion =
						contractEvent.tags?.find((t: string[]) => t[0] === 'v')?.[1] || 'v1';

					const v2ContractAddress =
						currentNetwork === 'mainnet'
							? import.meta.env.VITE_RSK_CONTRACT_ADDRESS_V2_MAINNET
							: import.meta.env.VITE_RSK_CONTRACT_ADDRESS_V2_TESTNET;
					const v1ContractAddress =
						currentNetwork === 'mainnet'
							? import.meta.env.VITE_RSK_CONTRACT_ADDRESS_MAINNET
							: import.meta.env.VITE_RSK_CONTRACT_ADDRESS_TESTNET;

					const defaultAddress = contractVersion === 'v2' ? v2ContractAddress : v1ContractAddress;

					const contractAddress =
						contractEvent.content.contractAddress &&
							contractEvent.content.contractAddress.toLowerCase() !==
							defaultAddress?.toLowerCase()
							? contractEvent.content.contractAddress
							: undefined;

					escrowData = await escrow.loadEscrowDetails(contractEvent.content.escrowId, contractAddress);

					if (escrowData) {
						blockchainStatus = escrowData.status;
					}

					// TODO: Messing dispute proposal fetching, mainly because in this version we're not storing disputes on-chain
				} catch (escrowError) {
					const errorMessage =
						escrowError instanceof Error ? escrowError.message : String(escrowError);
					const isEscrowNotFound =
						errorMessage.includes('not found') ||
						errorMessage.includes('does not exist') ||
						errorMessage.includes('execution reverted');
					const isInfraError =
						errorMessage.includes('wallet') ||
						errorMessage.includes('provider') ||
						errorMessage.includes('contract') ||
						errorMessage.includes('network') ||
						errorMessage.includes('timeout') ||
						errorMessage.includes('fetch');

					if (isEscrowNotFound && contractEvent.content.transactionHash) {
						isPending = true;
					} else if (isInfraError) {
						continue;
					}
				}

				const { status, permissions } = determineContractState(
					blockchainStatus,
					statusEvents || [],
					contractEvent.content,
					escrowData,
					disputeProposal,
					isPending,
					isClient,
					isFreelancer
				);

				const completionAttachments =
					statusEvents
						?.slice()
						.reverse()
						.find((e) => e.content.completionAttachments)?.content.completionAttachments || null;

				// TODO: Reverify this condition
				if (!escrowData && !isPending) continue;

				if (!escrowData && isPending) {
					escrowData = {
						id: contractEvent.content.escrowId,
						client: contractEvent.content.clientPubkey || '',
						freelancer: contractEvent.content.freelancerPubkey || '',
						baseAmount: contractEvent.content.amount || '0',
						clientFee: '0',
						freelancerFee: '0',
						totalAmount: contractEvent.content.amount || '0',
						status: EscrowStatus.PendingFunding,
						estimatedStartTime: contractEvent.content.estimatedStartTime || 0,
						estimatedCompletionTime: contractEvent.content.estimatedCompletionTime || 0,
						completionTime: 0,
						timelockExpiry: 0,
						clientFeeTier: 'standard' as const,
						freelancerFeeTier: 'standard' as const,
						createdAt: contractEvent.created_at * 1000,
						lastUpdated: Date.now()
					};
				}

				contractsWithStatuses.push({
					contractEvent,
					statusEvents: statusEvents || [],
					isClient,
					blockchainStatus,
					escrowData,
					status,
					isPending,
					permissions,
					disputeProposal,
					completionAttachments
				});
			} catch (error) {
				console.error('[V2] Failed to process contract event:', event.id, error);
			}
		}

		let filteredContracts = contractsWithStatuses;
		if (filter?.statuses) {
			filteredContracts = contractsWithStatuses.filter((c) =>
				filter.statuses!.includes(c.status)
			);
		}

		return filteredContracts.sort(
			(a, b) => b.contractEvent.created_at - a.contractEvent.created_at
		);
	} catch (error) {
		throw new Error(error instanceof Error ? error.message : String(error));
	}
}


/**
 * Delete a contract event (Nostr event)
 *
 * DELETION RULES (Blockchain-First):
 * 1. Query blockchain escrow status (source of truth)
 * 2. Allow deletion ONLY if escrow was never funded
 * 3. Block deletion if transaction hash exists (funding in progress)
 * 4. Block deletion for all other cases (funded, completed, cancelled, disputed)
 *
 * @param contractEventId - The ID of the contract event to delete
 * @param escrowId - The escrow ID to check contract status
 * @throws EscrowError if deletion is not allowed or fails
 */
export async function deleteContract(contractEventId: string, escrowId: string): Promise<void> {
	try {
		const contracts = await getContracts({ escrowIds: [escrowId] });

		if (contracts.length === 0) {
			throw new EscrowError(EscrowErrorCode.ESCROW_NOT_FOUND, 'Contract not found for deletion');
		}

		const contract = contracts[0];

		if (!contract.permissions.canDelete) {
			if (contract.blockchainStatus !== null) {
				throw new EscrowError(
					EscrowErrorCode.ESCROW_FUNDED,
					'Cannot delete contract: Escrow was funded on blockchain'
				);
			}

			if (contract.isPending || contract.contractEvent.content.transactionHash) {
				throw new EscrowError(
					EscrowErrorCode.ESCROW_FUNDING_IN_PROGRESS,
					'Cannot delete contract: Funding transaction is in progress'
				);
			}

			throw new EscrowError(
				EscrowErrorCode.ESCROW_VERIFICATION_FAILED,
				'Cannot delete contract: Deletion not allowed'
			);
		}

		const deletionEvent = {
			kind: 5,
			created_at: Math.floor(Date.now() / 1000),
			content: 'Contract deleted by user',
			tags: [
				['e', contractEventId],
				['k', String(KINDS.CONTRACT)]
			]
		};

		const signedEvent = await getSignedEvent(deletionEvent);
		const response = await nostrEventsService.deleteEvent(signedEvent);

		if (response.deleteCount === 0) {
			throw new EscrowError(
				EscrowErrorCode.ESCROW_VERIFICATION_FAILED,
				'Failed to delete contract: Deletion event was not published'
			);
		}
	} catch (error) {
		if (isEscrowError(error)) throw error;
		throw new EscrowError(
			EscrowErrorCode.ESCROW_UNKNOWN_ERROR,
			`Failed to delete contract: ${error instanceof Error ? error.message : 'Unknown error'}`,
			error
		);
	}
}

// TODO: Suspicious code to be verified and removed if not needed
/**
 * Recovery: check if a transaction is confirmed and publish missing FundsReleased event.
 */
async function recoverMissingFundsReleasedEvent(
	escrowId: string,
	contractEventId: string,
	transactionHash: string
): Promise<void> {
	try {
		const provider = getProvider('rsk');
		if (!provider) return;

		const receipt = await provider.getTransactionReceipt(transactionHash);
		if (!receipt || receipt.status === 0) return;

		await publishEscrowStatus({
			escrowId,
			contractEventId,
			transactionHash: receipt.hash,
			status: EscrowStatus.FundsReleased
		});
	} catch {
		// Recovery is best-effort — do not propagate
	}
}

export async function handleStatusEvent(event: NostrEvent): Promise<void> {
	try {
		const npub = await getNpub();
		const userPubkeyHex = npub.startsWith('npub') ? (nip19.decode(npub).data as string) : npub;

		const statusEvent = await decryptStatusEvent(event, userPubkeyHex);
		if (!statusEvent) return;

		const { action, transactionHash } = statusEvent.content;

		const escrowIdTag = event.tags.find((tag: string[]) => tag[0] === TAGS.R);
		const escrowId = escrowIdTag?.[1];
		if (!escrowId) return;

		const contractsStore = get(contractStore);

		const index = contractsStore.contractsMap.get(escrowId);
		if (index === undefined) return;

		const contract = contractsStore.contracts[index];

		const updatedStatusEvents = [...(contract.statusEvents || []), statusEvent].sort(
			(a, b) => a.created_at - b.created_at
		);

		// V2 does not have getDisputeProposal — skip for V2-version contracts.
		// disputeProposal remains as-is from contract state.
		const freshDisputeProposal = contract.disputeProposal;

		// TODO: Handle dispute proposal fetching

		const { status, permissions } = determineContractState(
			contract.blockchainStatus,
			updatedStatusEvents,
			contract.contractEvent.content,
			contract.escrowData,
			freshDisputeProposal,
			contract.isPending || false,
			contract.isClient,
			!contract.isClient
		);

		contractStore.update((state) => {
			const updatedContract: ContractWithEvents = {
				...contract,
				statusEvents: updatedStatusEvents,
				status,
				permissions,
				disputeProposal: freshDisputeProposal
			};

			const newContracts = [...state.contracts];
			newContracts[index] = updatedContract;

			return {
				...state,
				contracts: newContracts,
				contract:
					state.contract?.contractEvent.content.escrowId === escrowId
						? updatedContract
						: state.contract
			};
		});

		// Refresh blockchain data for confirmed state transitions
		const confirmedActions: EscrowStatus[] = [
			EscrowStatus.Completed,
			EscrowStatus.FundsReleased,
			EscrowStatus.FundsClaimed,
			EscrowStatus.InDispute,
			EscrowStatus.DisputeResolved,
			EscrowStatus.DisputeUnresolved,
			EscrowStatus.Cancelled,
			EscrowStatus.Refunded,
			EscrowStatus.NoShow,
			EscrowStatus.WorkInProgress
		];

		if (transactionHash && confirmedActions.includes(action)) {
			escrow
				.loadEscrowDetails(escrowId, contract.contractEvent.content.contractAddress)
				.then((freshEscrowData) => {
					// TODO: Handle disupte proposal

					if (!freshEscrowData) return;

					const { status: newStatus, permissions: newPermissions } = determineContractState(
						freshEscrowData.status,
						updatedStatusEvents,
						contract.contractEvent.content,
						freshEscrowData,
						freshDisputeProposal,
						false,
						contract.isClient,
						!contract.isClient
					);

					contractStore.update((s) => {
						const idx = s.contractsMap.get(escrowId);
						if (idx === undefined) return s;

						const newContracts = [...s.contracts];
						newContracts[idx] = {
							...newContracts[idx],
							blockchainStatus: freshEscrowData.status,
							escrowData: freshEscrowData,
							status: newStatus,
							permissions: newPermissions,
							isPending: false
						};

						return {
							...s,
							contracts: newContracts,
							contract:
								s.contract?.contractEvent.content.escrowId === escrowId
									? newContracts[idx]
									: s.contract
						};
					});
				})
				.catch((err) => {
					console.error('[V2] Failed to fetch escrow data after status event:', err);
				});
		}
	} catch (error) {
		console.error('[V2] Error handling status event:', error);
	}
}

export async function handleContractEvent(event: NostrEvent): Promise<void> {
	try {
		const npub = await getNpub();
		const userPubkeyHex = npub.startsWith('npub') ? (nip19.decode(npub).data as string) : npub;

		const contractEvent = await decryptContractEvent(event, userPubkeyHex);
		if (!contractEvent) return;

		const escrowIdTag = event.tags.find((tag: string[]) => tag[0] === TAGS.D);
		const escrowId = escrowIdTag?.[1];
		if (!escrowId) return;

		const contractsStore = get(contractStore);
		const existingIndex = contractsStore.contractsMap.get(escrowId);
		if (existingIndex !== undefined) return;

		const isClient = contractEvent.content.clientPubkey === userPubkeyHex;
		const isFreelancer = contractEvent.content.freelancerPubkey === userPubkeyHex;


		let escrowData: EscrowData | null = null;
		let blockchainStatus: EscrowStatus | null = null;
		let isPending = false;
		const disputeProposal: DisputeProposal | null = null;

		try {
			// TODO: Add function to load address from escrow manager
			const contractVersion =
				event.tags?.find((t: string[]) => t[0] === 'v')?.[1] || 'v1';
			const currentNetwork = import.meta.env.VITE_RSK_NETWORK;
			const defaultAddress =
				contractVersion === 'v2'
					? currentNetwork === 'mainnet'
						? import.meta.env.VITE_RSK_CONTRACT_ADDRESS_V2_MAINNET
						: import.meta.env.VITE_RSK_CONTRACT_ADDRESS_V2_TESTNET
					: currentNetwork === 'mainnet'
						? import.meta.env.VITE_RSK_CONTRACT_ADDRESS_MAINNET
						: import.meta.env.VITE_RSK_CONTRACT_ADDRESS_TESTNET;

			const contractAddress =
				contractEvent.content.contractAddress &&
					contractEvent.content.contractAddress.toLowerCase() !== defaultAddress?.toLowerCase()
					? contractEvent.content.contractAddress
					: undefined;

			escrowData = await escrow.loadEscrowDetails(escrowId, contractAddress);

			if (escrowData) {
				blockchainStatus = escrowData.status;
				// TODO: Handle dispute proposal fetching
			}
		} catch (escrowError) {
			const errorMessage = escrowError instanceof Error ? escrowError.message : String(escrowError);
			const isEscrowNotFound =
				errorMessage.includes('not found') ||
				errorMessage.includes('does not exist') ||
				errorMessage.includes('execution reverted');

			if (isEscrowNotFound && contractEvent.content.transactionHash) {
				isPending = true;
			} else {
				return;
			}
		}

		const { status, permissions } = determineContractState(
			blockchainStatus,
			[],
			contractEvent.content,
			escrowData,
			disputeProposal,
			isPending,
			isClient,
			isFreelancer
		);

		if (!escrowData) {
			if (!isPending) return;
			escrowData = {
				id: escrowId,
				client: contractEvent.content.clientPubkey || '',
				freelancer: contractEvent.content.freelancerPubkey || '',
				baseAmount: contractEvent.content.amount || '0',
				clientFee: '0',
				freelancerFee: '0',
				totalAmount: contractEvent.content.amount || '0',
				status: EscrowStatus.PendingFunding,
				estimatedStartTime: contractEvent.content.estimatedStartTime || 0,
				estimatedCompletionTime: contractEvent.content.estimatedCompletionTime || 0,
				completionTime: 0,
				timelockExpiry: 0,
				clientFeeTier: 'standard' as const,
				freelancerFeeTier: 'standard' as const,
				createdAt: event.created_at * 1000,
				lastUpdated: Date.now()
			};
		}

		contractStore.update((state) => {
			const newContract: ContractWithEvents = {
				contractEvent,
				statusEvents: [],
				isClient,
				blockchainStatus,
				escrowData: escrowData!,
				status,
				isPending,
				permissions,
				disputeProposal,
				completionAttachments: null
			};

			const newContracts = [...state.contracts, newContract];
			// TODO: Changed from last version - requires manual testing
			const newMap = new Map(state.contractsMap);
			newMap.set(escrowId, newContracts.length - 1);

			return {
				...state,
				contracts: newContracts,
				contractsMap: newMap
			};
		});
	} catch (error) {
		console.error('[V2] Error handling contract event:', error);
	}
}

// ---------------------------------------------------------------------------
// Internal decryption helpers (same pattern as V1)
// ---------------------------------------------------------------------------
async function decryptContractEvent(
	event: NostrEvent,
	userPubkeyHex: string
): Promise<ContractEvent | null> {
	try {
		const { nsec } = await getNostrKeyPair();

		const senderIsUser = event.pubkey === userPubkeyHex;
		const pTag = event.tags.find((t: string[]) => t[0] === 'p');
		const recipientPubkey = pTag?.[1];

		const counterpartyPubkey = senderIsUser ? recipientPubkey : event.pubkey;
		if (!counterpartyPubkey) return null;

		const conversationKey = await nip44.getConversationKey(
			nsec,
			counterpartyPubkey
		);
		const decrypted = await nip44.decrypt(event.content, conversationKey);
		const content = JSON.parse(decrypted) as NostrContract;

		if (content.type !== 'contract') return null;

		return { ...event, content } as ContractEvent;
	} catch {
		return null;
	}
}

async function decryptStatusEvent(
	event: NostrEvent,
	userPubkeyHex: string
): Promise<ContractStatusEvent | null> {
	try {
		const { nsec } = await getNostrKeyPair();

		const senderIsUser = event.pubkey === userPubkeyHex;
		const pTag = event.tags.find((t: string[]) => t[0] === 'p');
		const recipientPubkey = pTag?.[1];

		const counterpartyPubkey = senderIsUser ? recipientPubkey : event.pubkey;
		if (!counterpartyPubkey) return null;

		const conversationKey = await nip44.getConversationKey(
			nsec,
			counterpartyPubkey
		);
		const decrypted = await nip44.decrypt(event.content, conversationKey);
		const content = JSON.parse(decrypted) as NostrContractStatus;

		if (content.type !== 'contract-status') return null;

		return { ...event, content } as ContractStatusEvent;
	} catch {
		return null;
	}
}

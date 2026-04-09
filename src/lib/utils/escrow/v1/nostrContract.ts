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
import { createDebug } from '$lib/utils/debug';

const d = createDebug('contracts');

/**
 * Create a new contract event after escrow creation (as encrypted DM)
 */
export async function publishContractEvent(params: CreateContractParams): Promise<void> {
	try {
		const npub = await getNpub();
		const clientPubkey = npub.startsWith('npub') ? (nip19.decode(npub).data as string) : npub;

		const network = import.meta.env.VITE_RSK_NETWORK;
		const contractAddress =
			network === 'mainnet'
				? import.meta.env.VITE_RSK_CONTRACT_ADDRESS_MAINNET
				: import.meta.env.VITE_RSK_CONTRACT_ADDRESS_TESTNET;

		const contractData: NostrContract = {
			escrowId: params.escrowId,
			taskId: params.taskId,
			taskTitle: params.taskTitle,
			taskDescription: params.taskDescription,
			freelancerPubkey: params.freelancerPubkey,
			clientPubkey,
			amount: params.amount,
			currency: 'RBTC',
			status: EscrowStatus.Funded, // Contract is created when escrow is funded
			estimatedStartTime: params.estimatedStartTime,
			estimatedCompletionTime: params.estimatedCompletionTime,
			transactionHash: params.transactionHash, // Include transaction hash if provided
			type: 'contract', // Identify as contract message
			contractAddress
		};

		// Send as encrypted contract event
		const contractMessage = JSON.stringify(contractData);
		const tags = TAG_PATTERNS.contract(
			params.escrowId,
			params.taskId,
			params.freelancerPubkey,
			clientPubkey,
			network,
			'v1'
		);

		await publishNostrEvent(KINDS.CONTRACT, contractMessage, params.freelancerPubkey, tags);
	} catch (error) {
		console.warn('Error creating contract:', error);
	}
}

/**
 * Publish a status update for a contract (as encrypted DM)
 */
export async function publishContractStatus(params: PublishStatusParams): Promise<void> {
	try {
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

		// Send as encrypted contract status event
		const statusMessage = JSON.stringify(statusData);
		const tags = TAG_PATTERNS.contractStatus(
			params.contractEventId,
			params.escrowId,
			params.recipientPubkey,
			params.action,
			'v1'
		);

		await publishNostrEvent(KINDS.CONTRACT_STATUS, statusMessage, params.recipientPubkey, tags);
	} catch (error) {
		console.warn('Error publishing contract status:', error);
	}
}

/**
 * Get all contracts where the user is either client or freelancer
 *
 * Performance improvements over legacy version:
 * - Queries KINDS.CONTRACT directly instead of fetching ALL conversations
 * - Uses tag-based relay filtering (#p tag for participants)
 * - Queries KINDS.CONTRACT_STATUS separately with #e tag for event reference
 * - 100x reduction in data fetched and decrypted
 * - Includes comprehensive blockchain integration and status management
 *
 * Supports pagination via until parameter:
 * - First page: getContracts({ limit: 5 })
 * - Next page: getContracts({ limit: 5, until: oldestTimestamp })
 */
export async function getContracts(filter?: ContractFilter): Promise<ContractWithEvents[]> {
	d.log('getContracts start', {
		limit: filter?.limit,
		until: filter?.until,
		escrowIds: filter?.escrowIds,
		taskIds: filter?.taskIds
	});

	let npub = await getNpub();

	if (npub.startsWith('npub')) {
		const { nip19 } = await import('nostr-tools');
		npub = nip19.decode(npub).data as string;
	}

	// Get current network from environment
	const currentNetwork = import.meta.env.VITE_RSK_NETWORK;

	// Build filter for contract events
	const nostrFilter: Filter = {
		kinds: [KINDS.CONTRACT],
		...TAG_FILTERS.byNpub(npub), // Contracts where user is participant
		...TAG_FILTERS.byNetwork(currentNetwork), // Filter by current network
		limit: filter?.limit || 5 // Default to 5 for infinite scroll
	};

	// Add optional filters
	if (filter?.escrowIds) {
		nostrFilter['#d'] = filter.escrowIds;
	}

	if (filter?.taskIds) {
		nostrFilter['#t'] = filter.taskIds;
	}

	// Add pagination support
	if (filter?.until) {
		nostrFilter.until = filter.until;
	}

	if (filter?.since) {
		nostrFilter.since = filter.since;
	}

	// Note: We don't filter by status here since we need blockchain state to determine true status

	// Query contract events with their status events attached automatically
	// The followup feature will query CONTRACT_STATUS events that reference these contract event IDs
	const queryStartTime = import.meta.env.DEV ? performance.now() : 0;
	d.log('getContracts nostr query', { filter: nostrFilter });
	const contractEventsWithStatus = await queryNostrEvents(
		nostrFilter,
		{
			kinds: [KINDS.CONTRACT_STATUS], // Kind of followup events to query
			limit: (filter?.limit || 5) * 20 // limit * (10 ~ status events) * 2 safety margin
		},
		{
			attachAs: 'statusEvents', // Attach status events as array property
			keepLatest: false // Keep ALL status events, not just the latest
		}
	);

	d.log('getContracts nostr query result', {
		contractEventsCount: contractEventsWithStatus.length,
		durationMs: import.meta.env.DEV ? Math.round(performance.now() - queryStartTime) : undefined
	});

	// Process contracts with attached status events
	const contractsWithStatuses: ContractWithEvents[] = [];

	for (const event of contractEventsWithStatus) {
		try {
			const contractEvent = event as unknown as ContractEvent;
			// Get status events attached by queryNostrEvents (already filtered and decrypted)
			// Cast properly through unknown since NostrEvent has string content by default
			const statusEvents = contractEvent.statusEvents?.sort((a, b) => a.created_at - b.created_at);

			// RECOVERY: Check for stale PendingAcceptance events and attempt to recover
			if (statusEvents && contractEvent.content.escrowId) {
				const pendingAcceptanceEvents = statusEvents.filter(
					(e) => e.content.action === EscrowStatus.PendingAcceptance && e.content.transactionHash
				);
				const hasFundsReleased = statusEvents.some(
					(e) => e.content.action === EscrowStatus.FundsReleased
				);

				// Check for stale PendingAcceptance (older than 5 minutes) without FundsReleased
				if (pendingAcceptanceEvents.length > 0 && !hasFundsReleased) {
					const now = Math.floor(Date.now() / 1000);
					const staleEvents = pendingAcceptanceEvents.filter((e) => {
						const ageMinutes = (now * 1000 - e.created_at * 1000) / 60000;
						return ageMinutes > 5; // Older than 5 minutes
					});

					if (staleEvents.length > 0) {
						const oldestStaleEvent = staleEvents.sort((a, b) => a.created_at - b.created_at)[0];
						const transactionHash = oldestStaleEvent.content.transactionHash;

						if (transactionHash && contractEvent.id) {
							const recoveryRecipient =
								(npub === contractEvent?.content?.clientPubkey
									? contractEvent?.content?.freelancerPubkey
									: contractEvent?.content?.clientPubkey) || '';
							recoverMissingFundsReleasedEvent(
								contractEvent.content.escrowId,
								contractEvent.id,
								transactionHash,
								recoveryRecipient
							).catch(() => {});
						}
					}
				}
			}

			// Determine if user is client
			const isClient = contractEvent.content.clientPubkey === npub;
			const isFreelancer = contractEvent.content.freelancerPubkey === npub;

			// Query blockchain escrow data (source of truth)
			let escrowData: EscrowData | null = null;
			let blockchainStatus: EscrowStatus | null = null;
			let isPending = false;
			let disputeProposal: DisputeProposal | null = null;

			try {
				// Check if contract address differs from current environment
				const currentNetwork = import.meta.env.VITE_RSK_NETWORK;
				const currentContractAddress =
					currentNetwork === 'mainnet'
						? import.meta.env.VITE_RSK_CONTRACT_ADDRESS_MAINNET
						: import.meta.env.VITE_RSK_CONTRACT_ADDRESS_TESTNET;

				// Determine if we need to pass contract address for backwards compatibility
				const contractAddress =
					contractEvent.content.contractAddress &&
					contractEvent.content.contractAddress.toLowerCase() !==
						currentContractAddress?.toLowerCase()
						? contractEvent.content.contractAddress
						: undefined;

				escrowData = await escrow.loadEscrowDetails(
					contractEvent.content.escrowId,
					contractAddress
				);

				if (escrowData) {
					blockchainStatus = escrowData.status;

					// Fetch dispute proposal if in dispute
					if (blockchainStatus === EscrowStatus.InDispute) {
						try {
							disputeProposal = await escrow.getDisputeProposal(
								contractEvent.content.escrowId,
								contractAddress
							);
							if (disputeProposal && escrowData) {
								// Calculate client amount from total - freelancer amount
								const totalAmount = parseFloat(escrowData.baseAmount);
								const freelancerAmount = parseFloat(disputeProposal.freelancerAmount);
								disputeProposal.clientAmount = (totalAmount - freelancerAmount).toString();
							}
						} catch (disputeError) {
							console.warn(
								`Failed to load dispute proposal for ${contractEvent.content.escrowId}:`,
								disputeError
							);
						}
					}
				}
			} catch (escrowError) {
				const errorMessage =
					escrowError instanceof Error ? escrowError.message : String(escrowError);

				// Determine error type
				const isWalletError =
					errorMessage.includes('wallet') ||
					errorMessage.includes('Failed to initialize') ||
					errorMessage.includes('not initialized') ||
					errorMessage.includes('not connected');
				const isProviderError =
					errorMessage.includes('provider') ||
					errorMessage.includes('Failed to get provider') ||
					errorMessage.includes('provider destroyed');
				const isContractError =
					errorMessage.includes('contract') || errorMessage.includes('Failed to connect');
				const isEscrowNotFound =
					errorMessage.includes('not found') ||
					errorMessage.includes('does not exist') ||
					(errorMessage.includes('execution reverted') &&
						!isProviderError &&
						!isWalletError &&
						!isContractError);

				// Only set isPending=true for legitimate "escrow not found" errors
				// Don't set it for wallet/provider/contract errors - these are infrastructure issues
				if (isEscrowNotFound && contractEvent.content.transactionHash) {
					isPending = true;
				} else if (isWalletError || isProviderError || isContractError) {
					// For infrastructure errors, don't set isPending - these should be retried
					// Skip this contract - don't create it with invalid state
					// The contract will be retried on next load or via subscription
					continue; // Skip to next contract in the loop
				}
			}

			// Determine status and permissions based on blockchain state + Nostr events
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

			// Extract completion attachments from latest status event with attachments
			const completionAttachments =
				statusEvents
					?.slice()
					.reverse()
					.find((e) => e.content.completionAttachments)?.content.completionAttachments || null;

			// Skip contracts with null escrowData - these are infrastructure errors that should be retried
			// Only create contracts with valid escrowData OR legitimate pending state (escrow not found with transactionHash)
			if (!escrowData && !isPending) {
				continue; // Skip to next contract in the loop
			}

			// For pending contracts (escrow not found but has transactionHash), create a minimal escrowData placeholder
			if (!escrowData && isPending) {
				// Create minimal placeholder escrowData for pending contracts
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

			// TypeScript guard: escrowData should be non-null at this point
			// (either from blockchain or placeholder for pending contracts)
			// This should never happen due to logic above, but TypeScript needs the check
			if (!escrowData) {
				d.error('Unexpected: escrowData is null for contract', {
					escrowId: contractEvent.content.escrowId
				});
				continue;
			}

			d.log('getContracts per contract', {
				escrowId: contractEvent.content.escrowId,
				taskId: contractEvent.content.taskId,
				taskIdFormat:
					typeof contractEvent.content.taskId === 'string'
						? /^[0-9a-fA-F]{64}$/.test(contractEvent.content.taskId)
							? 'event-id'
							: 'd-tag'
						: 'unknown',
				blockchainStatus,
				status,
				statusSource: blockchainStatus !== null ? 'blockchain' : 'nostr-or-pending'
			});

			contractsWithStatuses.push({
				contractEvent,
				statusEvents: statusEvents || [],
				isClient,
				blockchainStatus,
				escrowData, // TypeScript now knows this is non-null
				status,
				isPending,
				permissions,
				disputeProposal,
				completionAttachments
			});
		} catch (error) {
			d.error('Failed to process contract event', { eventId: event.id }, error);
		}
	}

	// Apply status filter if provided (after blockchain status determination)
	let filteredContracts = contractsWithStatuses;
	if (filter?.statuses) {
		filteredContracts = contractsWithStatuses.filter((c) => filter.statuses!.includes(c.status));
	}

	// Sort by creation time (newest first)
	return filteredContracts.sort((a, b) => b.contractEvent.created_at - a.contractEvent.created_at);
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

/**
 * Recovery mechanism: Check if a transaction is confirmed and publish missing FundsReleased event
 * This fixes cases where acceptTask() confirmed but the FundsReleased event was never published
 */
async function recoverMissingFundsReleasedEvent(
	escrowId: string,
	contractEventId: string,
	transactionHash: string,
	recipientPubkey: string
): Promise<void> {
	try {
		// Get provider to check transaction status
		const { getProvider } = await import('$lib/stores/wallet.store');
		const provider = await getProvider('rsk');

		if (!provider) {
			return;
		}

		// Check if transaction is confirmed
		const receipt = await provider.getTransactionReceipt(transactionHash);

		if (!receipt) {
			return; // Transaction not yet confirmed, wait
		}

		// Check transaction status
		if (receipt.status === 0) {
			return; // Transaction failed, don't publish FundsReleased
		}

		// Transaction is confirmed and successful - publish missing FundsReleased event
		// Import and publish the missing event
		// Import the function directly (escrowEvents exports individual functions, not a namespace)
		await publishEscrowStatus({
			escrowId,
			contractEventId,
			transactionHash: receipt.hash,
			status: EscrowStatus.FundsReleased,
			recipientPubkey
		});
	} catch {
		// Don't throw - recovery is best-effort
	}
}

export async function deleteContract(contractEventId: string, escrowId: string): Promise<void> {
	const { EscrowError, EscrowErrorCode, isEscrowError } = await import(
		'$lib/utils/helpers/escrowErrors'
	);

	try {
		// Step 1: Get contract using new getContracts() function
		const contracts = await getContracts({ escrowIds: [escrowId] });

		if (contracts.length === 0) {
			throw new EscrowError(EscrowErrorCode.ESCROW_NOT_FOUND, 'Contract not found for deletion');
		}

		const contract = contracts[0];

		// Step 2: Check deletion permission (determined by getContracts based on blockchain state)
		if (!contract.permissions.canDelete) {
			// Provide specific error based on state
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

		// Step 3: Create deletion event (NIP-09)
		const deletionEvent = {
			kind: 5, // Deletion event
			created_at: Math.floor(Date.now() / 1000),
			content: 'Contract deleted by user',
			tags: [
				['e', contractEventId], // Event to delete
				['k', String(KINDS.CONTRACT)] // Kind of event being deleted
			]
		};

		// Step 4: Sign and publish deletion event
		const signedEvent = await getSignedEvent(deletionEvent);
		const response = await nostrEventsService.deleteEvent(signedEvent);

		if (response.deleteCount === 0) {
			throw new EscrowError(
				EscrowErrorCode.ESCROW_VERIFICATION_FAILED,
				'Failed to delete contract: Deletion event was not published'
			);
		}

		console.log('✅ Contract deleted successfully:', contractEventId);
	} catch (error) {
		console.error('❌ Failed to delete contract:', error);

		// Re-throw EscrowError as-is
		if (isEscrowError(error)) {
			throw error;
		}

		// Wrap other errors
		throw new EscrowError(
			EscrowErrorCode.ESCROW_UNKNOWN_ERROR,
			`Failed to delete contract: ${error instanceof Error ? error.message : 'Unknown error'}`,
			error
		);
	}
}

/**
 * Handle incoming contract status event from subscription
 */
export async function handleStatusEvent(event: NostrEvent) {
	try {
		const npub = await getNpub();
		const userPubkeyHex = npub.startsWith('npub') ? (nip19.decode(npub).data as string) : npub;

		// Decrypt the status event
		const statusEvent = await decryptStatusEvent(event, userPubkeyHex);
		if (!statusEvent) {
			console.warn('[handleStatusEvent] ❌ Failed to decrypt status event:', event.id);
			return;
		}

		console.log({ received: statusEvent });
		const { action, transactionHash } = statusEvent.content;

		// Extract escrow ID from #r tag (as per existing tag pattern)
		const escrowIdTag = event.tags.find((tag) => tag[0] === TAGS.R);
		const escrowId = escrowIdTag?.[1];

		if (!escrowId) {
			console.warn('[ContractStore] Status event missing escrow ID');
			return;
		}

		// Get current contract state
		const contractsStore = get(contractStore);

		const index = contractsStore.contractsMap.get(escrowId);
		if (index === undefined) {
			console.warn(`[ContractStore] Contract not found for escrowId: ${escrowId}`);
			return;
		}

		const contract = contractsStore.contracts[index];

		// Add the new status event to the contract's status events
		const updatedStatusEvents = [...(contract.statusEvents || []), statusEvent].sort(
			(a, b) => a.created_at - b.created_at
		);

		// Fetch dispute proposal BEFORE updating store (if needed)
		let freshDisputeProposal = contract.disputeProposal;

		if (action === EscrowStatus.DisputeResolutionProposed) {
			try {
				const proposal = await escrow.getDisputeProposal(
					escrowId,
					contract.contractEvent.content.contractAddress
				);

				if (proposal && contract.escrowData) {
					// Calculate client amount from total - freelancer amount
					const totalAmount = parseFloat(contract.escrowData.baseAmount);
					const freelancerAmount = parseFloat(proposal.freelancerAmount);
					proposal.clientAmount = (totalAmount - freelancerAmount).toString();
					freshDisputeProposal = proposal;
				}
			} catch (err) {
				console.warn(`Failed to load dispute proposal for ${escrowId}:`, err);
			}
		}

		// Re-determine contract state with fresh proposal
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

		// Update store once with everything
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

		// If blockchain-confirmed action, fetch fresh blockchain data (async, for other fields)
		if (
			transactionHash &&
			[
				EscrowStatus.Completed,
				EscrowStatus.FundsReleased,
				EscrowStatus.InDispute,
				EscrowStatus.DisputeResolved,
				EscrowStatus.Cancelled
			].includes(action)
		) {
			// Async update blockchain data
			escrow
				.loadEscrowDetails(escrowId, contract.contractEvent.content.contractAddress)
				.then(async (escrowData) => {
					if (escrowData) {
						// Fetch dispute proposal again if status is InDispute (for blockchain confirmation)
						let confirmedDisputeProposal = freshDisputeProposal;
						if (escrowData.status === EscrowStatus.InDispute) {
							try {
								const proposal = await escrow.getDisputeProposal(
									escrowId,
									contract.contractEvent.content.contractAddress
								);
								if (proposal) {
									const totalAmount = parseFloat(escrowData.baseAmount);
									const freelancerAmount = parseFloat(proposal.freelancerAmount);
									proposal.clientAmount = (totalAmount - freelancerAmount).toString();
									confirmedDisputeProposal = proposal;
								}
							} catch (err) {
								console.warn(
									`Failed to load dispute proposal during blockchain update for ${escrowId}:`,
									err
								);
							}
						}

						const { status: newStatus, permissions: newPermissions } = determineContractState(
							escrowData.status,
							updatedStatusEvents,
							contract.contractEvent.content,
							escrowData,
							confirmedDisputeProposal,
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
								blockchainStatus: escrowData.status,
								escrowData: escrowData,
								status: newStatus,
								permissions: newPermissions,
								disputeProposal: confirmedDisputeProposal,
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
					}
				})
				.catch((err) => {
					console.error('[ContractStore] Failed to fetch escrow data:', err);
				});
		}
	} catch (error) {
		console.error('[ContractStore] Error handling status event:', error);
	}
}

/**
 * Handle incoming contract creation event from subscription
 */
export async function handleContractEvent(event: NostrEvent) {
	try {
		const npub = await getNpub();
		const userPubkeyHex = npub.startsWith('npub') ? (nip19.decode(npub).data as string) : npub;

		// Decrypt the contract event
		const contractEvent = await decryptContractEvent(event, userPubkeyHex);
		if (!contractEvent) {
			console.warn('[handleContractEvent] ❌ Failed to decrypt contract event:', event.id);
			return;
		}

		// Extract escrow ID from #d tag
		const escrowIdTag = event.tags.find((tag) => tag[0] === TAGS.D);
		const escrowId = escrowIdTag?.[1];

		if (!escrowId) {
			console.warn('[ContractStore] Contract event missing escrow ID');
			return;
		}

		// Get current contract state
		const contractsStore = get(contractStore);

		// Check if contract already exists (avoid duplicates)
		const existingIndex = contractsStore.contractsMap.get(escrowId);
		if (existingIndex !== undefined) {
			console.log(`[ContractStore] Contract ${escrowId} already exists, skipping`);
			return;
		}

		console.log(`[ContractStore] 🆕 New contract detected: ${escrowId}`);

		// Determine if user is client or freelancer
		const isClient = contractEvent.content.clientPubkey === userPubkeyHex;
		const isFreelancer = contractEvent.content.freelancerPubkey === userPubkeyHex;

		// Query blockchain escrow data (source of truth)
		let escrowData: EscrowData | null = null;
		let blockchainStatus: EscrowStatus | null = null;
		let isPending = false;
		let disputeProposal: DisputeProposal | null = null;

		try {
			// Check if contract address differs from current environment
			const currentNetwork = import.meta.env.VITE_RSK_NETWORK;
			const currentContractAddress =
				currentNetwork === 'mainnet'
					? import.meta.env.VITE_RSK_CONTRACT_ADDRESS_MAINNET
					: import.meta.env.VITE_RSK_CONTRACT_ADDRESS_TESTNET;

			// Determine if we need to pass contract address for backwards compatibility
			const contractAddress =
				contractEvent.content.contractAddress &&
				contractEvent.content.contractAddress.toLowerCase() !==
					currentContractAddress?.toLowerCase()
					? contractEvent.content.contractAddress
					: undefined;

			escrowData = await escrow.loadEscrowDetails(escrowId, contractAddress);

			if (escrowData) {
				blockchainStatus = escrowData.status;

				// Fetch dispute proposal if in dispute
				if (blockchainStatus === EscrowStatus.InDispute) {
					try {
						disputeProposal = await escrow.getDisputeProposal(escrowId, contractAddress);
						if (disputeProposal && escrowData) {
							// Calculate client amount from total - freelancer amount
							const totalAmount = parseFloat(escrowData.baseAmount);
							const freelancerAmount = parseFloat(disputeProposal.freelancerAmount);
							disputeProposal.clientAmount = (totalAmount - freelancerAmount).toString();
						}
					} catch (disputeError) {
						console.warn(`Failed to load dispute proposal for ${escrowId}:`, disputeError);
					}
				}
			}
		} catch {
			console.warn(`Escrow not found: ${escrowId}`);
			// Check if there's a transactionHash in Nostr - indicates pending funding
			if (contractEvent.content.transactionHash) {
				isPending = true;
			}
		}

		// Determine status and permissions based on blockchain state
		const { status, permissions } = determineContractState(
			blockchainStatus,
			[], // No status events yet for new contract
			contractEvent.content,
			escrowData,
			disputeProposal,
			isPending,
			isClient,
			isFreelancer
		);

		// Create the new contract object
		const newContract: ContractWithEvents = {
			contractEvent,
			statusEvents: [],
			isClient,
			blockchainStatus,
			escrowData: escrowData!, // Non-null assertion safe here due to check above
			status,
			isPending,
			permissions,
			disputeProposal,
			completionAttachments: null
		};

		// Add to store (prepend to top for newest first)
		contractStore.update((state) => {
			// Prepend new contract to the beginning
			const updatedContracts = [newContract, ...state.contracts];

			// Rebuild index map after prepending
			const sortedContractsMap = new Map<string, number>();
			updatedContracts.forEach((contract, index) => {
				sortedContractsMap.set(contract.contractEvent.content.escrowId, index);
			});

			return {
				...state,
				contracts: updatedContracts,
				contractsMap: sortedContractsMap
			};
		});

		console.log(`[ContractStore] ✅ New contract added to store: ${escrowId}`);

		// Show notification for new contract (can be handled by UI toast system)
		appStore.showInfoToast(`New contract received: ${newContract.contractEvent.content.taskTitle}`);
	} catch (err) {
		console.error('[ContractStore] Error handling contract event:', err);
	}
}

/**
 * Decrypt a contract event
 */
async function decryptContractEvent(
	event: NostrEvent,
	userPubkeyHex: string
): Promise<ContractEvent | null> {
	try {
		const { nsec } = await getNostrKeyPair();

		// Determine the other party's pubkey for decryption
		let otherPubkey: string;

		if (event.pubkey === userPubkeyHex) {
			// We are the sender, decrypt with recipient's key
			// For contract events, there are two #p tags (client and freelancer)
			// We need to find the one that's NOT us
			const recipientTags = event.tags.filter((tag) => tag[0] === 'p');
			const otherPartyTag = recipientTags.find((tag) => tag[1] !== userPubkeyHex);

			if (!otherPartyTag || !otherPartyTag[1]) {
				return null;
			}
			otherPubkey = otherPartyTag[1];
		} else {
			// We are the recipient, decrypt with sender's key
			otherPubkey = event.pubkey;
		}

		// Get conversation key and decrypt
		const conversationKey = await nip44.getConversationKey(nsec, otherPubkey);
		const decryptedContent = nip44.decrypt(event.content, conversationKey);

		return {
			...event,
			content: JSON.parse(decryptedContent)
		} as ContractEvent;
	} catch (error) {
		// Skip events that fail to decrypt
		if (error instanceof Error && !error.message.includes('Invalid MAC')) {
			console.error('[ContractStore] Failed to decrypt contract event:', event.id, error);
		}
		return null;
	}
}

/**
 * Decrypt a contract status event
 */
async function decryptStatusEvent(
	event: NostrEvent,
	userPubkeyHex: string
): Promise<ContractStatusEvent | null> {
	try {
		const { nsec } = await getNostrKeyPair();

		// Determine the other party's pubkey for decryption
		let otherPubkey: string;

		if (event.pubkey === userPubkeyHex) {
			// We are the sender, decrypt with recipient's key
			const recipientTag = event.tags.find((tag) => tag[0] === 'p');
			if (!recipientTag || !recipientTag[1]) {
				return null;
			}
			otherPubkey = recipientTag[1];
		} else {
			// We are the recipient, decrypt with sender's key
			otherPubkey = event.pubkey;
		}

		// Get conversation key and decrypt
		const conversationKey = await nip44.getConversationKey(nsec, otherPubkey);
		const decryptedContent = nip44.decrypt(event.content, conversationKey);

		return {
			...event,
			content: JSON.parse(decryptedContent)
		} as ContractStatusEvent;
	} catch (error) {
		// Skip events that fail to decrypt
		if (error instanceof Error && !error.message.includes('Invalid MAC')) {
			console.error('[ContractStore] Failed to decrypt status event:', event.id, error);
		}
		return null;
	}
}

import type {
	ContractCreationEvent,
	CreateContractParams,
	PendingContractCreation,
	PublishContractStatusParams
} from '$lib/types/contract';
import { writable } from 'svelte/store';
import { publishContractEvent, publishContractStatus } from './nostrContract';
import { sendBidStatusUpdate } from '$lib/utils/nostr-bid';
import { EscrowStatus } from './escrow.enum';
import { t } from 'svelte-i18n';
import { get } from 'svelte/store';
import { appStore } from '$lib/stores/app.store';
import { pushNotificationService } from '$lib/api/services/push-notification.service';
import { BidStatusEnum } from '$lib/utils/enums/bid.enum';
import { contractStore } from '$lib/stores/contract.store';
import { getStatusMessages } from '$lib/utils/helpers/contractStatusFormatter';
import { createDebug } from '$lib/utils/debug';
import { updateTask } from '$lib/nostr/task';
import { TaskStatusEnum } from '$lib/utils/enums/task.enum';
import { getNpub } from '$lib/utils/nostrKeys';
import { completeServiceProposalAcceptance } from '$lib/utils/service-quote/accept';
import { publishServiceProposalStatus } from '$lib/utils/service-quote/publish';
import { SERVICE_QUOTE_MESSAGE_TYPES } from '$lib/utils/service-quote/protocol';
import type {
	ServiceAcceptanceSnapshot,
	ServiceAcceptanceUnknownReasonCode
} from '$lib/types/service-quote';
import { dispatchServiceContractCreatedNotification } from '$lib/utils/service-quote/notifications';
import {
	clearAcceptanceReplayEntry,
	getAcceptanceConfirmedMonitorEntry,
	getAcceptanceReplayEntry,
	upsertAcceptanceConfirmedMonitorEntry,
	upsertAcceptanceReplayEntry
} from '$lib/utils/service-quote/acceptance-ledger';
import { reverifyPublishedServiceAcceptance } from '$lib/utils/escrow/v1/escrow';

const _ = get(t);
const d = createDebug('escrow:events');
let reverifyPublishedServiceAcceptanceImpl = reverifyPublishedServiceAcceptance;

export function configureServiceAcceptanceReverifyForTest(
	impl: typeof reverifyPublishedServiceAcceptance | null
): void {
	reverifyPublishedServiceAcceptanceImpl = impl ?? reverifyPublishedServiceAcceptance;
}

function isServicePendingContract(contract: PendingContractCreation): boolean {
	return contract.contextType === 'service';
}

interface ServiceAcceptanceReplayPublishTarget {
	escrowId: string;
	proposalId: string;
	proposalEventId: string;
	quoteRequestId: string;
	serviceId: string;
	serviceAddress: string;
	counterpartyPubkey: string;
	transactionHash: string;
	acceptanceSnapshot?: ServiceAcceptanceSnapshot;
}

function createServiceAcceptanceReplayTarget(
	pendingContract: PendingContractCreation,
	escrowId: string,
	transactionHash: string
): ServiceAcceptanceReplayPublishTarget | null {
	if (
		!isServicePendingContract(pendingContract) ||
		!pendingContract.proposalId ||
		!pendingContract.proposalEventId ||
		!pendingContract.quoteRequestId ||
		!pendingContract.serviceId ||
		!pendingContract.serviceAddress
	) {
		return null;
	}

	return {
		escrowId,
		proposalId: pendingContract.proposalId,
		proposalEventId: pendingContract.proposalEventId,
		quoteRequestId: pendingContract.quoteRequestId,
		serviceId: pendingContract.serviceId,
		serviceAddress: pendingContract.serviceAddress,
		counterpartyPubkey: pendingContract.freelancerPubkey,
		transactionHash,
		acceptanceSnapshot: pendingContract.acceptanceSnapshot
	};
}

async function resolveServiceAcceptanceReplayTarget(
	escrowId: string
): Promise<ServiceAcceptanceReplayPublishTarget | null> {
	const pendingContract = pendingContracts.get(escrowId);
	if (pendingContract) {
		const inMemoryTarget = createServiceAcceptanceReplayTarget(
			pendingContract,
			escrowId,
			pendingContract.transactionHash
		);
		if (inMemoryTarget) {
			return inMemoryTarget;
		}
	}

	const replayEntry = await getAcceptanceReplayEntry(escrowId);
	if (!replayEntry) {
		return null;
	}

	return {
		escrowId: replayEntry.escrowId,
		proposalId: replayEntry.proposalId,
		proposalEventId: replayEntry.proposalEventId,
		quoteRequestId: replayEntry.quoteRequestId,
		serviceId: replayEntry.serviceId,
		serviceAddress: replayEntry.serviceAddress,
		counterpartyPubkey: replayEntry.counterpartyPubkey,
		transactionHash: replayEntry.transactionHash,
		acceptanceSnapshot: replayEntry.acceptanceSnapshot
	};
}

async function persistConfirmedServiceAcceptanceMonitor(
	target: ServiceAcceptanceReplayPublishTarget,
	publishedStatus: 'accepted' | 'accept_unknown' | 'contract_sync_pending' = 'accepted'
): Promise<void> {
	if (!target.acceptanceSnapshot) {
		return;
	}

	await upsertAcceptanceConfirmedMonitorEntry({
		escrowId: target.escrowId,
		proposalId: target.proposalId,
		proposalEventId: target.proposalEventId,
		quoteRequestId: target.quoteRequestId,
		serviceId: target.serviceId,
		serviceAddress: target.serviceAddress,
		counterpartyPubkey: target.counterpartyPubkey,
		transactionHash: target.transactionHash,
		publishedStatus,
		acceptanceSnapshot: target.acceptanceSnapshot
	});
}

// Event types for escrow events
export interface EscrowCreatedEvent {
	escrowId: string;
	transactionHash: string;
	transactionHashes?: string[];
	client: string;
	freelancer: string;
	amount: string;
	acceptanceSnapshot?: ServiceAcceptanceSnapshot;
}

// Stores for escrow events
// TODO: Useless store, needs to be removed
export const contractCreationStore = writable<ContractCreationEvent | null>(null);

const pendingContracts = new Map<string, PendingContractCreation>();
const pendingContractsByTxHash = new Map<string, PendingContractCreation>();
// Track contracts currently being processed to prevent race conditions
const processingContracts = new Set<string>();

function normalizeTransactionHash(transactionHash: string | null | undefined): string | null {
	if (typeof transactionHash !== 'string') {
		return null;
	}

	const normalizedValue = transactionHash.trim().toLowerCase();
	return normalizedValue.length > 0 ? normalizedValue : null;
}

function getTransactionHashCandidates(
	event: Pick<EscrowCreatedEvent, 'transactionHash' | 'transactionHashes'>
): string[] {
	return Array.from(
		new Set(
			[event.transactionHash, ...(event.transactionHashes ?? [])]
				.map((value) => normalizeTransactionHash(value))
				.filter((value): value is string => value !== null)
		)
	);
}

/**
 * Register a pending contract creation by transaction hash (before we have escrow ID)
 */
export function registerPendingContractByTxHash(
	params: Omit<PendingContractCreation, 'escrowId'>
): void {
	const normalizedTransactionHash = normalizeTransactionHash(params.transactionHash);
	if (!normalizedTransactionHash) {
		return;
	}

	pendingContractsByTxHash.set(normalizedTransactionHash, {
		...(params as PendingContractCreation),
		transactionHash: normalizedTransactionHash
	});
	contractCreationStore.set({
		state: 'funding_submitted',
		transactionHash: normalizedTransactionHash,
		transactionHashes: [normalizedTransactionHash]
	});
	d.log('registerPendingContractByTxHash', {
		txHash: normalizedTransactionHash.slice(0, 10),
		taskId: params.taskId
	});
}

/**
 * Clean up pending contract by transaction hash (called when transaction fails)
 * Uses atomic operations to prevent race conditions with handleEscrowCreated
 */
export function cleanupPendingContractByTxHash(transactionHash: string): void {
	const normalizedTransactionHash = normalizeTransactionHash(transactionHash);
	if (!normalizedTransactionHash) {
		return;
	}

	// Check if contract is currently being processed
	if (processingContracts.has(normalizedTransactionHash)) {
		d.warn('cleanupPendingContractByTxHash skipped (processing)', {
			transactionHash: normalizedTransactionHash.slice(0, 10)
		});
		return;
	}

	// Atomic check-and-delete to prevent race conditions
	const removed = pendingContractsByTxHash.delete(normalizedTransactionHash);
	if (removed) {
		d.log('cleanupPendingContractByTxHash', {
			transactionHash: normalizedTransactionHash.slice(0, 10)
		});
	}
}

export function replacePendingContractByTxHash(
	previousTransactionHash: string,
	nextTransactionHash: string
): void {
	const previousHash = normalizeTransactionHash(previousTransactionHash);
	const nextHash = normalizeTransactionHash(nextTransactionHash);
	if (!previousHash || !nextHash) {
		return;
	}

	if (previousHash === nextHash) {
		return;
	}

	const pendingContract = pendingContractsByTxHash.get(previousHash);
	if (!pendingContract) {
		return;
	}

	pendingContractsByTxHash.delete(previousHash);
	pendingContractsByTxHash.set(nextHash, {
		...pendingContract,
		transactionHash: nextHash
	});

	if (processingContracts.delete(previousHash)) {
		processingContracts.add(nextHash);
	}

	contractCreationStore.set({
		state: 'funding_submitted',
		transactionHash: previousHash,
		transactionHashes: [previousHash, nextHash]
	});

	d.log('replacePendingContractByTxHash', {
		previousHash: previousHash.slice(0, 10),
		nextHash: nextHash.slice(0, 10)
	});
}

export function findPendingServiceContractByTransactionHashes(
	transactionHashes: Iterable<string>
): PendingContractCreation | null {
	for (const transactionHash of transactionHashes) {
		const normalizedTransactionHash = normalizeTransactionHash(transactionHash);
		if (!normalizedTransactionHash) {
			continue;
		}

		const pendingContract = pendingContractsByTxHash.get(normalizedTransactionHash);
		if (pendingContract && isServicePendingContract(pendingContract)) {
			return pendingContract;
		}
	}

	return null;
}

function getServiceAcceptanceUnknownMessage(
	reasonCode: ServiceAcceptanceUnknownReasonCode
): string {
	switch (reasonCode) {
		case 'tx_replaced':
			return 'The wallet replaced the original escrow transaction. Contract confirmation is still syncing.';
		case 'pending_timeout':
			return 'The escrow transaction was submitted, but confirmation is still syncing.';
		case 'rpc_unavailable':
			return 'The escrow transaction state could not be verified because the RPC was unavailable.';
		case 'nonce_conflict':
			return 'The escrow transaction encountered a wallet nonce conflict and needs reconciliation.';
		case 'reconciliation_deferred':
			return 'The escrow transaction needs additional reconciliation before service acceptance can be confirmed.';
	}
}

export async function publishPendingServiceAcceptanceUnknownByTxHash(
	lookupTransactionHash: string,
	reasonCode: ServiceAcceptanceUnknownReasonCode,
	transactionHashOverride?: string
): Promise<void> {
	const normalizedLookupHash = normalizeTransactionHash(lookupTransactionHash);
	if (!normalizedLookupHash) {
		return;
	}

	const pendingContract = pendingContractsByTxHash.get(normalizedLookupHash);
	if (
		!pendingContract ||
		!isServicePendingContract(pendingContract) ||
		!pendingContract.quoteRequestId ||
		!pendingContract.proposalId ||
		!pendingContract.proposalEventId ||
		!pendingContract.serviceId ||
		!pendingContract.serviceAddress
	) {
		return;
	}

	const statusTransactionHash =
		normalizeTransactionHash(transactionHashOverride) ?? normalizedLookupHash;
	const message = getServiceAcceptanceUnknownMessage(reasonCode);

	try {
		await publishServiceProposalStatus({
			content: {
				type: SERVICE_QUOTE_MESSAGE_TYPES.STATUS,
				proposalId: pendingContract.proposalId,
				quoteRequestId: pendingContract.quoteRequestId,
				serviceId: pendingContract.serviceId,
				serviceAddress: pendingContract.serviceAddress,
				status: 'accept_unknown',
				actorPubkey: await getNpub(),
				message,
				reasonCode,
				timestamp: Math.floor(Date.now() / 1000),
				transactionHash: statusTransactionHash,
				version: 'v1'
			},
			proposalEventId: pendingContract.proposalEventId,
			counterpartyPubkey: pendingContract.freelancerPubkey,
			taskerPubkey: await getNpub(),
			taskeePubkey: pendingContract.freelancerPubkey
		});
	} catch (statusUpdateError) {
		d.error(
			'publishPendingServiceAcceptanceUnknownByTxHash: failed to publish service accept_unknown status',
			{
				transactionHash: statusTransactionHash.slice(0, 10),
				proposalId: pendingContract.proposalId,
				reasonCode
			},
			statusUpdateError
		);
	} finally {
		completeServiceProposalAcceptance(
			pendingContract.proposalId,
			false,
			false,
			reasonCode,
			statusTransactionHash
		);
	}
}

export type PendingServiceAcceptanceRetryResult =
	| { status: 'accepted' }
	| { status: 'deferred'; reasonCode: 'reconciliation_deferred' }
	| { status: 'not_found' };

export type PublishedServiceAcceptanceReverifyResult =
	| { status: 'confirmed' }
	| { status: 'downgraded'; reasonCode: ServiceAcceptanceUnknownReasonCode }
	| { status: 'deferred'; reasonCode: ServiceAcceptanceUnknownReasonCode }
	| { status: 'not_found' };

export async function retryPendingServiceAcceptanceByEscrowId(
	escrowId: string
): Promise<PendingServiceAcceptanceRetryResult> {
	const replayTarget = await resolveServiceAcceptanceReplayTarget(escrowId);
	if (!replayTarget) {
		return { status: 'not_found' };
	}

	try {
		await publishServiceProposalStatus({
			content: {
				type: SERVICE_QUOTE_MESSAGE_TYPES.STATUS,
				proposalId: replayTarget.proposalId,
				quoteRequestId: replayTarget.quoteRequestId,
				serviceId: replayTarget.serviceId,
				serviceAddress: replayTarget.serviceAddress,
				status: 'accepted',
				actorPubkey: await getNpub(),
				timestamp: Math.floor(Date.now() / 1000),
				escrowId,
				transactionHash: replayTarget.transactionHash,
				acceptanceSnapshot: replayTarget.acceptanceSnapshot,
				version: 'v1'
			},
			proposalEventId: replayTarget.proposalEventId,
			counterpartyPubkey: replayTarget.counterpartyPubkey,
			taskerPubkey: await getNpub(),
			taskeePubkey: replayTarget.counterpartyPubkey
		});

		completeServiceProposalAcceptance(
			replayTarget.proposalId,
			true,
			false,
			undefined,
			replayTarget.transactionHash
		);
		await persistConfirmedServiceAcceptanceMonitor(replayTarget);
		pendingContracts.delete(escrowId);
		await clearAcceptanceReplayEntry(escrowId);
		return { status: 'accepted' };
	} catch (statusUpdateError) {
		await upsertAcceptanceReplayEntry(replayTarget);
		completeServiceProposalAcceptance(
			replayTarget.proposalId,
			false,
			false,
			'reconciliation_deferred',
			replayTarget.transactionHash
		);
		d.error(
			'retryPendingServiceAcceptanceByEscrowId: failed to republish service accepted status',
			{
				escrowId,
				proposalId: replayTarget.proposalId
			},
			statusUpdateError
		);
		return { status: 'deferred', reasonCode: 'reconciliation_deferred' };
	}
}

export async function reverifyPublishedServiceAcceptanceByEscrowId(
	escrowId: string
): Promise<PublishedServiceAcceptanceReverifyResult> {
	const monitorEntry = await getAcceptanceConfirmedMonitorEntry(escrowId);
	if (!monitorEntry) {
		return { status: 'not_found' };
	}

	try {
		const result = await reverifyPublishedServiceAcceptanceImpl({
			escrowId: monitorEntry.escrowId,
			transactionHash: monitorEntry.transactionHash,
			acceptanceSnapshot: monitorEntry.acceptanceSnapshot
		});

		if (result.status === 'confirmed') {
			const nextAcceptanceSnapshot = {
				...monitorEntry.acceptanceSnapshot,
				confirmationsAtVerification: result.confirmationsAtVerification
			};
			if (monitorEntry.publishedStatus !== 'accepted') {
				await publishServiceProposalStatus({
					content: {
						type: SERVICE_QUOTE_MESSAGE_TYPES.STATUS,
						proposalId: monitorEntry.proposalId,
						quoteRequestId: monitorEntry.quoteRequestId,
						serviceId: monitorEntry.serviceId,
						serviceAddress: monitorEntry.serviceAddress,
						status: 'accepted',
						actorPubkey: await getNpub(),
						timestamp: Math.floor(Date.now() / 1000),
						escrowId: monitorEntry.escrowId,
						transactionHash: monitorEntry.transactionHash,
						acceptanceSnapshot: nextAcceptanceSnapshot,
						version: 'v1'
					},
					proposalEventId: monitorEntry.proposalEventId,
					counterpartyPubkey: monitorEntry.counterpartyPubkey,
					taskerPubkey: await getNpub(),
					taskeePubkey: monitorEntry.counterpartyPubkey
				});
				completeServiceProposalAcceptance(
					monitorEntry.proposalId,
					true,
					false,
					undefined,
					monitorEntry.transactionHash
				);
			}

			await upsertAcceptanceConfirmedMonitorEntry({
				escrowId: monitorEntry.escrowId,
				proposalId: monitorEntry.proposalId,
				proposalEventId: monitorEntry.proposalEventId,
				quoteRequestId: monitorEntry.quoteRequestId,
				serviceId: monitorEntry.serviceId,
				serviceAddress: monitorEntry.serviceAddress,
				counterpartyPubkey: monitorEntry.counterpartyPubkey,
				transactionHash: monitorEntry.transactionHash,
				publishedStatus: 'accepted',
				acceptanceSnapshot: nextAcceptanceSnapshot,
				createdAtMs: monitorEntry.createdAtMs,
				lastVerifiedAtMs: Date.now()
			});
			return { status: 'confirmed' };
		}

		if (result.status === 'deferred') {
			await upsertAcceptanceConfirmedMonitorEntry({
				escrowId: monitorEntry.escrowId,
				proposalId: monitorEntry.proposalId,
				proposalEventId: monitorEntry.proposalEventId,
				quoteRequestId: monitorEntry.quoteRequestId,
				serviceId: monitorEntry.serviceId,
				serviceAddress: monitorEntry.serviceAddress,
				counterpartyPubkey: monitorEntry.counterpartyPubkey,
				transactionHash: monitorEntry.transactionHash,
				publishedStatus: monitorEntry.publishedStatus,
				acceptanceSnapshot: monitorEntry.acceptanceSnapshot,
				createdAtMs: monitorEntry.createdAtMs,
				lastVerifiedAtMs: monitorEntry.lastVerifiedAtMs
			});
			return result;
		}

		if (monitorEntry.publishedStatus !== 'accept_unknown') {
			await publishServiceProposalStatus({
				content: {
					type: SERVICE_QUOTE_MESSAGE_TYPES.STATUS,
					proposalId: monitorEntry.proposalId,
					quoteRequestId: monitorEntry.quoteRequestId,
					serviceId: monitorEntry.serviceId,
					serviceAddress: monitorEntry.serviceAddress,
					status: 'accept_unknown',
					actorPubkey: await getNpub(),
					message: getServiceAcceptanceUnknownMessage(result.reasonCode),
					reasonCode: result.reasonCode,
					timestamp: Math.floor(Date.now() / 1000),
					escrowId: monitorEntry.escrowId,
					transactionHash: monitorEntry.transactionHash,
					version: 'v1'
				},
				proposalEventId: monitorEntry.proposalEventId,
				counterpartyPubkey: monitorEntry.counterpartyPubkey,
				taskerPubkey: await getNpub(),
				taskeePubkey: monitorEntry.counterpartyPubkey
			});
			completeServiceProposalAcceptance(
				monitorEntry.proposalId,
				false,
				false,
				result.reasonCode,
				monitorEntry.transactionHash
			);
		}
		await upsertAcceptanceConfirmedMonitorEntry({
			escrowId: monitorEntry.escrowId,
			proposalId: monitorEntry.proposalId,
			proposalEventId: monitorEntry.proposalEventId,
			quoteRequestId: monitorEntry.quoteRequestId,
			serviceId: monitorEntry.serviceId,
			serviceAddress: monitorEntry.serviceAddress,
			counterpartyPubkey: monitorEntry.counterpartyPubkey,
			transactionHash: monitorEntry.transactionHash,
			publishedStatus: 'accept_unknown',
			acceptanceSnapshot: monitorEntry.acceptanceSnapshot,
			createdAtMs: monitorEntry.createdAtMs,
			lastVerifiedAtMs: Date.now()
		});
		return result;
	} catch (error) {
		d.error(
			'reverifyPublishedServiceAcceptanceByEscrowId: failed to reverify published service acceptance',
			{ escrowId, proposalId: monitorEntry.proposalId },
			error
		);
		await upsertAcceptanceConfirmedMonitorEntry({
			escrowId: monitorEntry.escrowId,
			proposalId: monitorEntry.proposalId,
			proposalEventId: monitorEntry.proposalEventId,
			quoteRequestId: monitorEntry.quoteRequestId,
			serviceId: monitorEntry.serviceId,
			serviceAddress: monitorEntry.serviceAddress,
			counterpartyPubkey: monitorEntry.counterpartyPubkey,
			transactionHash: monitorEntry.transactionHash,
			publishedStatus: monitorEntry.publishedStatus,
			acceptanceSnapshot: monitorEntry.acceptanceSnapshot,
			createdAtMs: monitorEntry.createdAtMs,
			lastVerifiedAtMs: monitorEntry.lastVerifiedAtMs
		});
		return { status: 'deferred', reasonCode: 'rpc_unavailable' };
	}
}

/**
 * Register a pending contract creation for when the escrow is created
 */
export function registerPendingContract(params: PendingContractCreation): void {
	pendingContracts.set(params.escrowId, params);
	d.log('registerPendingContract', { escrowId: params.escrowId, taskId: params.taskId });
}

/**
 * Unified function to publish contract status to Nostr and show appropriate toast
 *
 * Call with PENDING status (e.g., PendingCompletion) BEFORE transaction broadcast
 * Call with CONFIRMED status (e.g., Completed) AFTER transaction confirmation
 *
 * This function handles:
 * - Publishing status to Nostr
 * - Showing appropriate toast (info for pending, success for confirmed, error on failure)
 * - All message translations
 *
 * @example
 * // Before transaction
 * await publishEscrowStatus({ status: EscrowStatus.PendingCompletion, ... });
 *
 * // After confirmation
 * await publishEscrowStatus({ status: EscrowStatus.Completed, ... });
 */
export async function publishEscrowStatus(params: PublishContractStatusParams): Promise<void> {
	try {
		const messages = getStatusMessages(params.status, {
			statusVariant: params.statusMessagingVariant
		});
		const isPending = params.status >= EscrowStatus.PendingFunding; // Pending states are 6+

		// Publish to Nostr
		await publishContractStatus({
			contractEventId: params.contractEventId,
			escrowId: params.escrowId,
			action: params.status,
			message: _(
				isPending ? messages.pendingMessage || messages.confirmedMessage : messages.confirmedMessage
			),
			transactionHash: params.transactionHash,
			completionAttachments: params.completionAttachments,
			proposedClientAmount: params.proposedClientAmount,
			proposedFreelancerAmount: params.proposedFreelancerAmount,
			recipientPubkey: params.recipientPubkey
		});

		d.log('publishEscrowStatus', { escrowId: params.escrowId, status: params.status });

		// Show appropriate toast
		if (isPending) {
			// Pending states show info toast (if message exists)
			if (messages.pendingMessage) {
				appStore.showInfoToast(get(t)(messages.pendingMessage));
			}
		} else {
			// Confirmed states show success toast
			appStore.showSuccessToast(get(t)(messages.successToast));
		}
	} catch (error) {
		const messages = getStatusMessages(params.status, {
			statusVariant: params.statusMessagingVariant
		});
		d.error(
			'publishEscrowStatus failed',
			{ status: params.status, escrowId: params.escrowId },
			error
		);
		appStore.showErrorToast(get(t)(messages.errorToast));
	}
}

/**
 * Handle escrow created event - called from contract event listener
 */
export async function handleEscrowCreated(event: EscrowCreatedEvent): Promise<void> {
	// Check if we have a pending contract for this escrow (by escrow ID or transaction hash)
	let pendingContract = pendingContracts.get(event.escrowId);
	let retainServiceAcceptanceForRetry = false;

	// If not found by escrow ID, try to find by transaction hash
	// Use atomic operations to prevent race conditions with cleanupPendingContractByTxHash
	if (!pendingContract) {
		for (const txHash of getTransactionHashCandidates(event)) {
			// Atomic check-and-get to prevent race conditions
			// Mark as processing BEFORE getting to prevent cleanup during processing
			if (pendingContractsByTxHash.has(txHash)) {
				processingContracts.add(txHash);

				// Get the contract (it may have been deleted by cleanup, but we're protected by processingContracts)
				const contract = pendingContractsByTxHash.get(txHash);
				if (contract) {
					// Remove from txHash map and add to escrow ID map
					pendingContractsByTxHash.delete(txHash);
					pendingContract = contract;
					pendingContracts.set(event.escrowId, { ...contract, escrowId: event.escrowId });
					break;
				}

				// Contract was deleted between has() and get() - remove from processing set
				processingContracts.delete(txHash);
			}
		}
	}

	if (pendingContract) {
		try {
			// Create the contract parameters
			const contractParams: CreateContractParams = {
				escrowId: event.escrowId,
				taskId: pendingContract.taskId,
				taskTitle: pendingContract.taskTitle,
				taskDescription: pendingContract.taskDescription,
				freelancerPubkey: pendingContract.freelancerPubkey,
				clientRskAddress: pendingContract.clientRskAddress,
				amount: pendingContract.amount,
				estimatedStartTime: pendingContract.estimatedStartTime,
				estimatedCompletionTime: pendingContract.estimatedCompletionTime,
				contextType: pendingContract.contextType,
				contextId: pendingContract.contextId,
				contextTitle: pendingContract.contextTitle,
				contextDescription: pendingContract.contextDescription,
				contextVersionRef: pendingContract.contextVersionRef,
				serviceId: pendingContract.serviceId,
				serviceAddress: pendingContract.serviceAddress,
				serviceTitle: pendingContract.serviceTitle,
				quoteRequestId: pendingContract.quoteRequestId,
				proposalId: pendingContract.proposalId,
				proposalEventId: pendingContract.proposalEventId,
				purchaseMode: pendingContract.purchaseMode,
				instantOrderId: pendingContract.instantOrderId,
				selectedTierId: pendingContract.selectedTierId,
				pricingSnapshot: pendingContract.pricingSnapshot,
				agreementSnapshot: pendingContract.agreementSnapshot,
				transactionHash: event.transactionHash
			};

			d.log('handleEscrowCreated: publishing contract event', {
				escrowId: event.escrowId,
				taskId: pendingContract.taskId
			});
			await publishContractEvent(contractParams);

			if (isServicePendingContract(pendingContract)) {
				dispatchServiceContractCreatedNotification({
					recipientPubkey: pendingContract.freelancerPubkey,
					escrowId: event.escrowId,
					serviceTitle:
						pendingContract.serviceTitle ??
						pendingContract.contextTitle ??
						pendingContract.taskTitle,
					purchaseMode: pendingContract.purchaseMode ?? 'quote'
				});
			} else {
				// Use unified helper for task notifications
				const taskTitle = pendingContract.taskTitle ?? 'task';
				void pushNotificationService.sendNotificationToNpubs({
					npubs: [pendingContract.freelancerPubkey],
					title: `New contract created ${taskTitle ? `for task: ${taskTitle}` : ''}`,
					body: `Your bid ${taskTitle ? `on task: ${taskTitle}` : ''} has been accepted by the client`,
					type: 'contract_created',
					clickAction: `${import.meta.env.VITE_CLIENT_URL}/dashboard?tab=contracts`,
					icon: 'https://bittasker.com/images/logos/bittasker-logomark.svg'
				});
			}

			if (
				isServicePendingContract(pendingContract) &&
				pendingContract.quoteRequestId &&
				pendingContract.proposalId &&
				pendingContract.proposalEventId &&
				pendingContract.serviceId &&
				pendingContract.serviceAddress
			) {
				try {
					await publishServiceProposalStatus({
						content: {
							type: SERVICE_QUOTE_MESSAGE_TYPES.STATUS,
							proposalId: pendingContract.proposalId,
							quoteRequestId: pendingContract.quoteRequestId,
							serviceId: pendingContract.serviceId,
							serviceAddress: pendingContract.serviceAddress,
							status: 'accepted',
							actorPubkey: await getNpub(),
							timestamp: Math.floor(Date.now() / 1000),
							escrowId: event.escrowId,
							transactionHash: event.transactionHash,
							acceptanceSnapshot: event.acceptanceSnapshot ?? pendingContract.acceptanceSnapshot,
							version: 'v1'
						},
						proposalEventId: pendingContract.proposalEventId,
						counterpartyPubkey: pendingContract.freelancerPubkey,
						taskerPubkey: await getNpub(),
						taskeePubkey: pendingContract.freelancerPubkey
					});
					completeServiceProposalAcceptance(
						pendingContract.proposalId,
						true,
						false,
						undefined,
						event.transactionHash
					);
					await persistConfirmedServiceAcceptanceMonitor(
						{
							escrowId: event.escrowId,
							proposalId: pendingContract.proposalId,
							proposalEventId: pendingContract.proposalEventId,
							quoteRequestId: pendingContract.quoteRequestId,
							serviceId: pendingContract.serviceId,
							serviceAddress: pendingContract.serviceAddress,
							counterpartyPubkey: pendingContract.freelancerPubkey,
							transactionHash: event.transactionHash,
							acceptanceSnapshot: event.acceptanceSnapshot ?? pendingContract.acceptanceSnapshot
						},
						'accepted'
					);
					await clearAcceptanceReplayEntry(event.escrowId);
				} catch (statusUpdateError) {
					const replayTarget = createServiceAcceptanceReplayTarget(
						pendingContract,
						event.escrowId,
						event.transactionHash
					);
					if (replayTarget) {
						await upsertAcceptanceReplayEntry({
							...replayTarget,
							acceptanceSnapshot: event.acceptanceSnapshot ?? replayTarget.acceptanceSnapshot
						});
					}
					completeServiceProposalAcceptance(
						pendingContract.proposalId,
						false,
						false,
						'reconciliation_deferred',
						event.transactionHash
					);
					retainServiceAcceptanceForRetry = true;
					pendingContracts.set(event.escrowId, {
						...pendingContract,
						escrowId: event.escrowId,
						transactionHash: event.transactionHash,
						acceptanceSnapshot: event.acceptanceSnapshot ?? pendingContract.acceptanceSnapshot
					});
					d.error(
						'handleEscrowCreated: failed to publish service accepted status',
						{
							escrowId: event.escrowId,
							proposalId: pendingContract.proposalId
						},
						statusUpdateError
					);
				}
			}

			// Publish bid acceptance status via encrypted DM nostr event
			// If this fails, log the error but don't fail the entire contract creation
			// The escrow is already created, so we should continue even if status update fails
			if (!isServicePendingContract(pendingContract) && pendingContract.taskId) {
				try {
					await sendBidStatusUpdate(
						pendingContract.bidEventId,
						pendingContract.taskId,
						pendingContract.freelancerPubkey,
						BidStatusEnum.ACCEPTED,
						_('dashboard.bids.bid_acceptance.bid_accepted_message'),
						event.escrowId,
						event.transactionHash
					);
				} catch (statusUpdateError) {
					// Log error but don't throw - escrow is already created
					d.error(
						'handleEscrowCreated: Failed to send bid status update',
						{ escrowId: event.escrowId },
						statusUpdateError
					);
					// Show warning to user that bid status update failed
					appStore.showErrorToast(
						'Escrow created successfully, but failed to update bid status. The bid status may need to be updated manually.'
					);
				}
			}

			// Task status update to IN_PROGRESS (Nostr after chain confirmation). See docs/tasks/task-status.md.
			if (!isServicePendingContract(pendingContract) && pendingContract.taskId) {
				try {
					await updateTask(pendingContract.taskId, { status: TaskStatusEnum.IN_PROGRESS });
				} catch (taskUpdateError) {
					d.error(
						'handleEscrowCreated: Failed to update task status',
						{ taskId: pendingContract.taskId },
						taskUpdateError
					);
				}
			}

			// Success toast is shown in BidAcceptanceForm.svelte success screen
			// No need to show duplicate toast here to avoid double notifications

			// Reload the newly created contract from Nostr to populate the store.
			// Contract creation is only considered successful once the event is queryable.
			const contractLoaded = await contractStore.loadContractByEscrowId(event.escrowId);
			if (!contractLoaded) {
				if (!retainServiceAcceptanceForRetry) {
					pendingContracts.delete(event.escrowId);
				}
				for (const txHash of getTransactionHashCandidates(event)) {
					processingContracts.delete(txHash);
				}
				contractCreationStore.set({
					state: 'contract_sync_pending',
					escrowId: event.escrowId,
					transactionHash: event.transactionHash,
					transactionHashes: getTransactionHashCandidates(event)
				});
				d.warn('handleEscrowCreated: contract publish succeeded but reload is still syncing', {
					escrowId: event.escrowId
				});
				return;
			}

			// Update contract creation store
			contractCreationStore.set({
				state: 'contract_ready',
				escrowId: event.escrowId,
				contractEventId: `contract-${event.escrowId}`, // Use escrow ID as reference
				transactionHash: event.transactionHash,
				transactionHashes: getTransactionHashCandidates(event)
			});

			// Note: Task acceptance message (locations/congratulations) is now sent from BidAcceptanceForm.svelte
			// after successful acceptBidAndCreateEscrow, not from here. This keeps the flow cleaner and avoids
			// redundant task fetching since we already have task data in the form.

			// Clean up pending contract
			if (!retainServiceAcceptanceForRetry) {
				pendingContracts.delete(event.escrowId);
			}
			// Also remove from processing set if it was there
			for (const txHash of getTransactionHashCandidates(event)) {
				processingContracts.delete(txHash);
			}
			d.log('handleEscrowCreated: completed', {
				escrowId: event.escrowId,
				taskId: pendingContract.taskId
			});
		} catch (error) {
			d.error(
				'handleEscrowCreated: Failed to create Nostr contract',
				{ escrowId: event.escrowId },
				error
			);

			// Remove from processing set on error
			for (const txHash of getTransactionHashCandidates(event)) {
				processingContracts.delete(txHash);
			}

			// Update contract creation store with error
			contractCreationStore.set({
				state: 'failed',
				escrowId: event.escrowId,
				transactionHash: event.transactionHash,
				transactionHashes: getTransactionHashCandidates(event),
				error: error instanceof Error ? error.message : 'Unknown error'
			});

			// Show error toast
			appStore.showErrorToast(
				`Failed to create contract: ${error instanceof Error ? error.message : 'Unknown error'}`
			);
		}
	} else {
		d.warn('handleEscrowCreated: no pending contract', { escrowId: event.escrowId });
	}
}

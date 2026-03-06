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
const _ = get(t);

export interface EscrowCreatedEvent {
	escrowId: string;
	transactionHash: string;
	client: string;
	freelancer: string;
	amount: string;
}

export const contractCreationStore = writable<ContractCreationEvent | null>(null);

const pendingContracts = new Map<string, PendingContractCreation>();
const pendingContractsByTxHash = new Map<string, PendingContractCreation>();
const processingContracts = new Set<string>();

export function registerPendingContractByTxHash(
	params: Omit<PendingContractCreation, 'escrowId'>
): void {
	pendingContractsByTxHash.set(params.transactionHash, params as PendingContractCreation);
	console.log('[V2] ✅ Registered pending contract for transaction:', params.transactionHash);
}

export function cleanupPendingContractByTxHash(transactionHash: string): void {
	if (processingContracts.has(transactionHash)) {
		console.log('[V2] ⚠️ Skipping cleanup - contract is currently being processed:', transactionHash);
		return;
	}

	const removed = pendingContractsByTxHash.delete(transactionHash);
	if (removed) {
		console.log('[V2] 🧹 Cleaned up pending contract for failed transaction:', transactionHash);
	}
}

export function registerPendingContract(params: PendingContractCreation): void {
	pendingContracts.set(params.escrowId, params);
}

/**
 * Publish escrow status to Nostr and show appropriate toast.
 * Call with PENDING status BEFORE transaction broadcast.
 * Call with CONFIRMED status AFTER transaction confirmation.
 */
export async function publishEscrowStatus(params: PublishContractStatusParams): Promise<void> {
	try {
		const messages = getStatusMessages(params.status);
		// V2 pending states start at 100+
		const isPending = params.status >= EscrowStatus.PendingFunding;

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
			proposedFreelancerAmount: params.proposedFreelancerAmount
		});

		if (isPending) {
			if (messages.pendingMessage) {
				appStore.showInfoToast(get(t)(messages.pendingMessage));
			}
		} else {
			appStore.showSuccessToast(get(t)(messages.successToast));
		}
	} catch (error) {
		const messages = getStatusMessages(params.status);
		console.error(`[V2] Failed to publish status (${params.status}):`, error);
		appStore.showErrorToast(get(t)(messages.errorToast));
	}
}

export async function handleEscrowCreated(event: EscrowCreatedEvent): Promise<void> {
	let pendingContract = pendingContracts.get(event.escrowId);

	if (!pendingContract) {
		const txHash = event.transactionHash;

		if (pendingContractsByTxHash.has(txHash)) {
			processingContracts.add(txHash);

			const contractData = pendingContractsByTxHash.get(txHash);
			if (contractData) {
				pendingContractsByTxHash.delete(txHash);
				pendingContract = contractData;
				pendingContracts.set(event.escrowId, { ...contractData, escrowId: event.escrowId });
			} else {
				processingContracts.delete(txHash);
			}
		}
	}

	if (pendingContract) {
		try {
			const contractParams: CreateContractParams = {
				escrowId: event.escrowId,
				taskId: pendingContract.taskId,
				taskTitle: pendingContract.taskTitle,
				taskDescription: pendingContract.taskDescription,
				freelancerPubkey: pendingContract.freelancerPubkey,
				amount: pendingContract.amount,
				estimatedStartTime: pendingContract.estimatedStartTime,
				estimatedCompletionTime: pendingContract.estimatedCompletionTime,
				transactionHash: event.transactionHash
			};

			await publishContractEvent(contractParams);

			pushNotificationService.sendNotificationToNpubs({
				npubs: [pendingContract.freelancerPubkey],
				title: `New contract created ${pendingContract.taskTitle ? `for task: ${pendingContract.taskTitle}` : ''}`,
				body: `Your bid ${pendingContract.taskTitle ? `on task: ${pendingContract.taskTitle}` : ''} has been accepted by the client`,
				type: 'contract_created',
				clickAction: `${import.meta.env.VITE_CLIENT_URL}/dashboard?tab=contracts`,
				icon: 'https://bittasker.com/images/Logos/BitTasker-square-logo.svg'
			});

			contractCreationStore.set({
				escrowId: event.escrowId,
				contractEventId: `contract-${event.escrowId}`
			});

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
				console.error('[V2] Failed to send bid status update after escrow creation:', statusUpdateError);
				appStore.showErrorToast(
					'Escrow created successfully, but failed to update bid status. The bid status may need to be updated manually.'
				);
			}

			await contractStore.loadContractByEscrowId(event.escrowId);

			pendingContracts.delete(event.escrowId);
			processingContracts.delete(event.transactionHash);
		} catch (error) {
			console.error('[V2] Failed to create Nostr contract:', error);
			processingContracts.delete(event.transactionHash);

			contractCreationStore.set({
				escrowId: event.escrowId,
				error: error instanceof Error ? error.message : 'Unknown error'
			});

			appStore.showErrorToast(
				`Failed to create contract: ${error instanceof Error ? error.message : 'Unknown error'}`
			);
		}
	} else {
		console.log('[V2] No pending contract found for escrow:', event.escrowId);
	}
}

import { pushNotificationService } from '$lib/api/services/push-notification.service';
import type { ContractAction } from '$lib/types/contract';

/**
 * Helper to notify backend about contract actions for push notifications
 * This allows the backend to send push notifications when contract status changes
 */
export async function notifyBackendOfContractAction(
	escrowId: string,
	action: ContractAction,
	contractEventId?: string,
	additionalData?: Record<string, unknown>
): Promise<void> {
	try {
		// Use sendNotification mutation to notify backend
		// Backend will handle sending push notifications to relevant parties
		const { SendNotificationStore } = await import('$houdini');
		const sendNotificationStore = new SendNotificationStore();
		
		// Get current device ID (backend will determine recipient devices)
		const deviceId = pushNotificationService.getCurrentDeviceId();
		
		if (!deviceId) {
			console.warn('⚠️ Device ID not available, skipping backend notification');
			return;
		}
		
		// Extract additional data
		const taskId = (additionalData?.taskId as string) || '';
		const freelancerPubkey = (additionalData?.freelancerPubkey as string) || '';
		const taskCreatorPubkey = (additionalData?.taskCreatorPubkey as string) || '';
		const transactionHash = (additionalData?.transactionHash as string) || '';
		
		// Create appropriate notification message based on action
		let title: string;
		let body: string;
		let type: string;
		
		switch (action) {
			case 'contract-created':
				title = 'Contract Created';
				body = taskId 
					? `New contract created for task ${taskId}`
					: `New contract created for escrow ${escrowId}`;
				type = 'contract_created';
				break;
			case 'task-completed':
				title = 'Task Completed';
				body = taskId
					? `Task ${taskId} has been marked as completed`
					: `Task has been marked as completed for escrow ${escrowId}`;
				type = 'task_completed';
				break;
			case 'payment-released':
				title = 'Payment Released';
				body = taskId
					? `Payment has been released for task ${taskId}`
					: `Payment has been released for escrow ${escrowId}`;
				type = 'payment_released';
				break;
			case 'dispute-raised':
				title = 'Dispute Raised';
				body = taskId
					? `A dispute has been raised for task ${taskId}`
					: `A dispute has been raised for escrow ${escrowId}`;
				type = 'dispute_raised';
				break;
			case 'contract-cancelled':
				title = 'Contract Cancelled';
				body = taskId
					? `Contract has been cancelled for task ${taskId}`
					: `Contract has been cancelled for escrow ${escrowId}`;
				type = 'contract_cancelled';
				break;
			default:
				title = 'Contract Update';
				body = taskId
					? `Contract status updated for task ${taskId}`
					: `Contract status updated for escrow ${escrowId}`;
				type = 'contract_update';
		}
		
		// Build body with metadata for backend routing (similar to bid notifications)
		let notificationBody = body;
		if (taskId) {
			notificationBody += ` | taskId:${taskId}`;
		}
		notificationBody += ` | escrowId:${escrowId}`;
		if (contractEventId) {
			notificationBody += ` | contractEventId:${contractEventId}`;
		}
		if (freelancerPubkey) {
			notificationBody += ` | freelancerPubkey:${freelancerPubkey}`;
		}
		if (taskCreatorPubkey) {
			notificationBody += ` | taskCreatorPubkey:${taskCreatorPubkey}`;
		}
		if (transactionHash) {
			notificationBody += ` | transactionHash:${transactionHash}`;
		}
		
		// For contract_created: deviceId identifies the TASK CREATOR, backend should notify the FREELANCER
		// For other actions: backend should determine recipient based on action type
		// Backend should parse taskId/escrowId from body to find the contract and determine the correct recipient
		await sendNotificationStore.mutate({
			input: {
				title,
				body: notificationBody,
				deviceId: deviceId, // This identifies the SENDER - backend should notify the OTHER party based on type
				type,
				...(additionalData || {})
			}
		});
	} catch (error) {
		console.warn(`⚠️ Failed to notify backend of contract action ${action}:`, error);
		// Don't throw - contract action via Nostr was successful
	}
}


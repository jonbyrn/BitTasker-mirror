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
		
		await sendNotificationStore.mutate({
			input: {
				title: `Contract ${action}`,
				body: `Contract action: ${action} for escrow ${escrowId}`,
				deviceId: deviceId, // Backend should use this to identify the user and notify the other party
				type: 'contract_action'
			}
		});
		
		console.log(`✅ Backend notified of contract action: ${action} for escrow ${escrowId}`);
	} catch (error) {
		console.warn(`⚠️ Failed to notify backend of contract action ${action}:`, error);
		// Don't throw - contract action via Nostr was successful
	}
}


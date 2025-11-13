import { pushNotificationService } from '$lib/api/services/push-notification.service';

/**
 * Helper to notify backend about bid actions for push notifications
 * This allows the backend to send push notifications when bid status changes
 */
export async function notifyBackendOfBidAction(
	bidId: string,
	taskId: string,
	status: 'accepted' | 'rejected' | 'created',
	bidderPubkey?: string,
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
		
		// Create appropriate notification message based on status
		let title: string;
		let body: string;
		let type: string;
		
		switch (status) {
			case 'accepted':
				title = 'Bid Accepted';
				body = `Your bid has been accepted for task ${taskId}`;
				type = 'bid_accepted';
				break;
			case 'rejected':
				title = 'Bid Rejected';
				body = `Your bid has been rejected for task ${taskId}`;
				type = 'bid_rejected';
				break;
			case 'created':
				title = 'New Bid Received';
				body = `New bid received for task ${taskId}`;
				type = 'bid_created';
				break;
			default:
				title = 'Bid Update';
				body = `Bid status updated for task ${taskId}`;
				type = 'bid_update';
		}
		
		// For bid_created: deviceId identifies the BIDDER, backend should notify the TASK CREATOR
		// For bid_accepted/rejected: deviceId identifies the TASK CREATOR, backend should notify the BIDDER
		// Backend should parse taskId from body to find the task and determine the correct recipient
		await sendNotificationStore.mutate({
			input: {
				title,
				body: `${body} | bidId:${bidId} | taskId:${taskId}${bidderPubkey ? ` | bidderPubkey:${bidderPubkey}` : ''}`,
				deviceId: deviceId, // This identifies the SENDER - backend should notify the OTHER party based on type
				type,
				...(additionalData || {})
			}
		});
	} catch (error) {
		console.warn(`⚠️ Failed to notify backend of bid action ${status}:`, error);
		// Don't throw - bid action via Nostr was successful
	}
}


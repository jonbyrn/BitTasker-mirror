import { writable } from 'svelte/store';
import type { Notification } from '$lib/stores/notification.store';
import { listenForIncomingMessages } from '$lib/utils/nostr-message';
import { getMessagedPeople } from '$lib/utils/nostr-message';
import { appStore } from '$lib/stores/app.store';

interface JsonMessage {
	messageType: string;
	[key: string]: any;
}

interface BidStatusMessage extends JsonMessage {
	messageType: 'bid-status';
	bidId: string;
	taskId: string;
	status: 'accepted' | 'rejected';
	message?: string;
	timestamp: number;
	escrowId?: string;
	transactionHash?: string;
	taskerPubkey?: string;
	taskeePubkey?: string;
}

interface ContractMessage extends JsonMessage {
	messageType: 'contract';
	contractId: string;
	action: string;
	message?: string;
	timestamp: number;
	escrowId?: string;
	transactionHash?: string;
	taskerPubkey?: string;
	taskeePubkey?: string;
	taskId?: string;
}

interface PaymentMessage extends JsonMessage {
	messageType: 'payment';
	paymentId: string;
	amount: number;
	currency: string;
	status: 'received' | 'sent' | 'pending';
	message?: string;
	timestamp: number;
	transactionHash?: string;
	taskerPubkey?: string;
	taskeePubkey?: string;
}

interface BidMessage extends JsonMessage {
	messageType: 'bid';
	bidId: string;
	taskId: string;
	amount: number;
	currency: string;
	message?: string;
	timestamp: number;
	taskerPubkey?: string;
	taskeePubkey?: string;
}

interface TaskCompletionMessage extends JsonMessage {
	messageType: 'task-completed';
	taskId: string;
	contractId?: string;
	message?: string;
	timestamp: number;
	escrowId?: string;
	transactionHash?: string;
	taskerPubkey?: string;
	taskeePubkey?: string;
}

// User role types
type UserRole = 'tasker' | 'taskee' | 'unknown';

// Task relationship context
interface TaskContext {
	taskId: string;
	taskerPubkey: string;
	taskeePubkey?: string;
	contractId?: string;
	escrowId?: string;
}

class LocalNotificationService {
	private notifications = writable<Notification[]>([]);
	private unreadCount = writable(0);
	private isLoading = writable(false);
	private messageUnsubscribe: (() => void) | null = null;
	private isInitialized = false;
	private incomingCount = writable(0);

	constructor() {
		// Load notifications from session storage on initialization
		this.loadFromStorage();
	}

	/**
	 * Initialize the notification service
	 */
	public async init(): Promise<void> {
		if (this.isInitialized) return;

		try {
			this.isLoading.set(true);
			
			// Clear old notifications on initialization
			this.clearOldNotifications();
			
			// Request notification permission
			await this.requestNotificationPermission();
			
			// Set up real-time message listener for JSON notifications
			this.setupMessageListener();
			
			this.isInitialized = true;
			console.log('Local notification service initialized');
		} catch (error) {
			console.error('Failed to initialize local notification service:', error);
			throw error;
		} finally {
			this.isLoading.set(false);
		}
	}

	/**
	 * Clear old notifications (older than 7 days)
	 */
	private clearOldNotifications(): void {
		this.notifications.update(notifications => {
			const sevenDaysAgo = new Date();
			sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
			
			const recentNotifications = notifications.filter(n => 
				n.createdAt > sevenDaysAgo
			);
			
			if (recentNotifications.length !== notifications.length) {
				console.log(`Cleaned up ${notifications.length - recentNotifications.length} old notifications`);
				this.saveToStorage(recentNotifications);
				this.updateUnreadCount(recentNotifications);
			}
			
			return recentNotifications;
		});
	}

	/**
	 * Request notification permission from the user
	 */
	private async requestNotificationPermission(): Promise<void> {
		if (typeof window === 'undefined') return;

		// Check if notifications are supported
		if (!('Notification' in window)) {
			console.warn('This browser does not support notifications');
			return;
		}

		// If permission is already granted, we're good
		if (Notification.permission === 'granted') {
			console.log('Notification permission already granted');
			return;
		}

		// If permission is denied, we can't request it again
		if (Notification.permission === 'denied') {
			console.warn('Notification permission denied by user');
			return;
		}

		// Request permission
		try {
			const permission = await Notification.requestPermission();
			if (permission === 'granted') {
				console.log('Notification permission granted');
			} else {
				console.warn('Notification permission denied by user');
			}
		} catch (error) {
			console.error('Error requesting notification permission:', error);
		}
	}

	/**
	 * Set up real-time listener for JSON messages that should become notifications
	 */
	private setupMessageListener(): void {
		this.messageUnsubscribe = listenForIncomingMessages((msg) => {
			const { plaintext, senderPubkey, event } = msg;

			// Check if this is a JSON message (system notification)
			if (this.isJsonMessage(plaintext)) {
				this.handleJsonMessage(plaintext, senderPubkey, event);
			}
		});
	}

	/**
	 * Check if a message is a JSON system message
	 */
	private isJsonMessage(message: string): boolean {
		return message.startsWith('[') || message.startsWith('{');
	}

	/**
	 * Handle incoming JSON messages and convert them to notifications
	 */
	private async handleJsonMessage(plaintext: string, senderPubkey: string, event: any): Promise<void> {
		try {
			const jsonMessage: JsonMessage = JSON.parse(plaintext);
			
			console.log('Processing JSON message:', { 
				messageType: jsonMessage.messageType, 
				senderPubkey: senderPubkey.substring(0, 8) + '...',
				eventId: event.id
			});
			
			// Check if this notification is intended for the current user
			const isIntendedForCurrentUser = await this.isNotificationIntendedForCurrentUser(jsonMessage, senderPubkey, event);
			
			if (!isIntendedForCurrentUser) {
				console.log('Notification not intended for current user, skipping');
				return;
			}
			
			// Get sender profile information
			const messagedPeople = await getMessagedPeople();
			const sender = messagedPeople.find(p => p.pubkey === senderPubkey);
			const senderName = sender?.profile?.name || 'Unknown User';

			// Convert JSON message to notification based on type
			const notification = await this.convertJsonToNotification(jsonMessage, senderName, senderPubkey, event);
			
			if (notification) {
				console.log('Created notification:', notification.title);
				this.addNotification(notification);
				// Only show system notifications, no toast notifications
				this.showSystemNotification(notification);
				this.incrementIncomingCount();
			} else {
				console.log('No notification created for message type:', jsonMessage.messageType);
			}
		} catch (error) {
			console.error('Failed to handle JSON message:', error);
		}
	}

	/**
	 * Check if notification is intended for the current user
	 */
	private async isNotificationIntendedForCurrentUser(
		jsonMessage: JsonMessage, 
		senderPubkey: string, 
		event: any
	): Promise<boolean> {
		try {
			// Get current user's pubkey
			const currentUserPubkey = await this.getCurrentUserPubkey();
			if (!currentUserPubkey) return false;

			// Determine user role in the context of this message
			const userRole = await this.determineUserRole(jsonMessage, currentUserPubkey, senderPubkey);
			
			console.log('Notification targeting check:', {
				messageType: jsonMessage.messageType,
				userRole,
				currentUserPubkey: currentUserPubkey.substring(0, 8) + '...',
				senderPubkey: senderPubkey.substring(0, 8) + '...'
			});

			// Check targeting based on message type and user role
			switch (jsonMessage.messageType) {
				case 'bid-status':
					return this.shouldReceiveBidStatusNotification(jsonMessage as BidStatusMessage, userRole, currentUserPubkey);

				case 'bid':
					return this.shouldReceiveBidNotification(jsonMessage as BidMessage, userRole, currentUserPubkey);

				case 'contract':
				case 'contract-status':
					return this.shouldReceiveContractNotification(jsonMessage as ContractMessage, userRole, currentUserPubkey);

				case 'task-completed':
					return this.shouldReceiveTaskCompletionNotification(jsonMessage as TaskCompletionMessage, userRole, currentUserPubkey);

				case 'payment':
					return this.shouldReceivePaymentNotification(jsonMessage as PaymentMessage, userRole, currentUserPubkey);

				default:
					// For unknown message types, show to current user
					console.log('Unknown message type, defaulting to show notification');
					return true;
			}
		} catch (error) {
			console.error('Error checking notification targeting:', error);
			// If there's an error, default to showing the notification
			return true;
		}
	}

	/**
	 * Get current user's pubkey in hex format
	 */
	private async getCurrentUserPubkey(): Promise<string | null> {
		try {
			const { getNpub } = await import('$lib/utils/nostrKeys');
			const npub = await getNpub();
			
			// Convert npub to hex if needed
			if (npub.startsWith('npub')) {
				const { nip19 } = await import('nostr-tools');
				const decoded = nip19.decode(npub);
				return decoded.data as unknown as string;
			} else {
				return npub;
			}
		} catch (error) {
			console.error('Error getting current user pubkey:', error);
			return null;
		}
	}

	/**
	 * Determine user role in the context of this message
	 */
	private async determineUserRole(
		jsonMessage: JsonMessage, 
		currentUserPubkey: string, 
		senderPubkey: string
	): Promise<UserRole> {
		try {
			// Check if current user is the sender
			if (currentUserPubkey === senderPubkey) {
				return 'unknown'; // Don't show notifications for messages sent by current user
			}

			// Try to determine role from message data
			if (jsonMessage.taskerPubkey && jsonMessage.taskeePubkey) {
				if (currentUserPubkey === jsonMessage.taskerPubkey) {
					return 'tasker';
				} else if (currentUserPubkey === jsonMessage.taskeePubkey) {
					return 'taskee';
				}
			}

			// Fallback: check task ownership
			if (jsonMessage.taskId) {
				const isTaskOwner = await this.isCurrentUserTaskOwner(jsonMessage.taskId);
				if (isTaskOwner) {
					return 'tasker';
				}
			}

			// Check if current user is involved in any contract
			if (jsonMessage.contractId) {
				const contractRole = await this.getUserRoleInContract(jsonMessage.contractId, currentUserPubkey);
				if (contractRole !== 'unknown') {
					return contractRole;
				}
			}

			// Check recipient tag in event
			if (jsonMessage.messageType === 'bid-status') {
				// For bid status, check if current user is the intended recipient
				// This is handled in the specific notification method
			}

			return 'unknown';
		} catch (error) {
			console.error('Error determining user role:', error);
			return 'unknown';
		}
	}

	/**
	 * Check if user should receive bid status notification
	 */
	private shouldReceiveBidStatusNotification(
		message: BidStatusMessage, 
		userRole: UserRole, 
		currentUserPubkey: string
	): boolean {
		// Bid status updates are sent TO the bidder (taskee)
		// The tasker sends the status update to the taskee
		if (userRole === 'taskee') {
			console.log('Taskee should receive bid status notification');
			return true;
		}

		// Additional check: if we have explicit taskee pubkey in message
		if (message.taskeePubkey && message.taskeePubkey === currentUserPubkey) {
			console.log('Current user is the taskee (from message data)');
			return true;
		}

		console.log('User should not receive bid status notification');
		return false;
	}

	/**
	 * Check if user should receive bid notification
	 */
	private shouldReceiveBidNotification(
		message: BidMessage, 
		userRole: UserRole, 
		currentUserPubkey: string
	): boolean {
		// New bids are sent TO the tasker
		if (userRole === 'tasker') {
			console.log('Tasker should receive bid notification');
			return true;
		}

		// Additional check: if we have explicit tasker pubkey in message
		if (message.taskerPubkey && message.taskerPubkey === currentUserPubkey) {
			console.log('Current user is the tasker (from message data)');
			return true;
		}

		console.log('User should not receive bid notification');
		return false;
	}

	/**
	 * Check if user should receive contract notification
	 */
	private shouldReceiveContractNotification(
		message: ContractMessage, 
		userRole: UserRole, 
		currentUserPubkey: string
	): boolean {
		// Contract events should go to both parties involved
		if (userRole === 'tasker' || userRole === 'taskee') {
			console.log(`${userRole} should receive contract notification`);
			return true;
		}

		// Additional check: if we have explicit pubkeys in message
		if ((message.taskerPubkey && message.taskerPubkey === currentUserPubkey) ||
			(message.taskeePubkey && message.taskeePubkey === currentUserPubkey)) {
			console.log('Current user is involved in contract (from message data)');
			return true;
		}

		console.log('User should not receive contract notification');
		return false;
	}

	/**
	 * Check if user should receive task completion notification
	 */
	private shouldReceiveTaskCompletionNotification(
		message: TaskCompletionMessage, 
		userRole: UserRole, 
		currentUserPubkey: string
	): boolean {
		// Task completion notifications should go to the tasker (task owner)
		if (userRole === 'tasker') {
			console.log('Tasker should receive task completion notification');
			return true;
		}

		// Additional check: if we have explicit tasker pubkey in message
		if (message.taskerPubkey && message.taskerPubkey === currentUserPubkey) {
			console.log('Current user is the tasker (from message data)');
			return true;
		}

		console.log('User should not receive task completion notification');
		return false;
	}

	/**
	 * Check if user should receive payment notification
	 */
	private shouldReceivePaymentNotification(
		message: PaymentMessage, 
		userRole: UserRole, 
		currentUserPubkey: string
	): boolean {
		// Payment notifications should go to the recipient
		// Both tasker and taskee can receive payment notifications
		if (userRole === 'tasker' || userRole === 'taskee') {
			console.log(`${userRole} should receive payment notification`);
			return true;
		}

		// Additional check: if we have explicit pubkeys in message
		if ((message.taskerPubkey && message.taskerPubkey === currentUserPubkey) ||
			(message.taskeePubkey && message.taskeePubkey === currentUserPubkey)) {
			console.log('Current user is involved in payment (from message data)');
			return true;
		}

		console.log('User should not receive payment notification');
		return false;
	}

	/**
	 * Get user role in a specific contract
	 */
	private async getUserRoleInContract(contractId: string, currentUserPubkey: string): Promise<UserRole> {
		try {
			// Import contract service to check contract details
			const { getUserContracts } = await import('$lib/utils/nostr-bid');
			const contracts = await getUserContracts({ escrowIds: [contractId] });
			
			if (contracts.length > 0) {
				const contract = contracts[0];
				// Check if current user is the client (tasker) or freelancer (taskee)
				if (contract.contract.clientPubkey === currentUserPubkey) {
					return 'tasker';
				} else if (contract.contract.freelancerPubkey === currentUserPubkey) {
					return 'taskee';
				}
			}
			
			return 'unknown';
		} catch (error) {
			console.error('Error getting user role in contract:', error);
			return 'unknown';
		}
	}

	/**
	 * Check if current user is the task owner
	 */
	private async isCurrentUserTaskOwner(taskId: string): Promise<boolean> {
		try {
			// Import task service to check task ownership
			const { default: taskService } = await import('$lib/api/services/task.service');
			const task = await taskService.getTaskById(taskId);
			
			if (!task) return false;
			
			// Get current user's pubkey
			const { getNpub } = await import('$lib/utils/nostrKeys');
			const npub = await getNpub();
			
			// Convert npub to hex if needed
			let currentUserPubkey: string;
			if (npub.startsWith('npub')) {
				const { nip19 } = await import('nostr-tools');
				const decoded = nip19.decode(npub);
				currentUserPubkey = decoded.data as unknown as string;
			} else {
				currentUserPubkey = npub;
			}
			
			// Check if current user is the task creator
			return task.npub === currentUserPubkey;
		} catch (error) {
			console.error('Error checking task ownership:', error);
			return false;
		}
	}

	/**
	 * Check if current user is involved in the contract
	 */
	private async isCurrentUserInvolvedInContract(
		jsonMessage: ContractMessage, 
		currentUserPubkey: string
	): Promise<boolean> {
		try {
			// For contract events, check if current user is mentioned in the data
			// This is a simplified check - you might need to enhance this based on your contract structure
			if ((jsonMessage as any).data) {
				const data = (jsonMessage as any).data as any;
				// Check if current user is the client or freelancer
				return data.client === currentUserPubkey || data.freelancer === currentUserPubkey;
			}
			
			// If no specific data, assume current user is involved
			return true;
		} catch (error) {
			console.error('Error checking contract involvement:', error);
			return false;
		}
	}

	/**
	 * Convert JSON message to notification object
	 */
	private async convertJsonToNotification(
		jsonMessage: JsonMessage, 
		senderName: string, 
		senderPubkey: string, 
		event: any
	): Promise<Notification | null> {
		const baseNotification: Partial<Notification> = {
			id: event.id,
			userId: 'current-user', // Will be replaced with actual user ID
			read: false,
			delivered: {
				inApp: true,
				push: false
			},
			createdAt: new Date(event.created_at * 1000),
			senderPubkey,
			eventId: event.id
		};

		// Determine user role for context-aware notifications
		const currentUserPubkey = await this.getCurrentUserPubkey();
		const userRole = currentUserPubkey ? await this.determineUserRole(jsonMessage, currentUserPubkey, senderPubkey) : 'unknown';

		switch (jsonMessage.messageType) {
			case 'bid-status':
				return this.createBidStatusNotification(jsonMessage as BidStatusMessage, senderName, baseNotification, userRole);
			
			case 'contract':
			case 'contract-status':
				return this.createContractNotification(jsonMessage as ContractMessage, senderName, baseNotification, userRole);
			
			case 'payment':
				return this.createPaymentNotification(jsonMessage as PaymentMessage, senderName, baseNotification, userRole);
			
			case 'bid':
				// Handle direct bid messages
				return this.createBidNotification(jsonMessage as BidMessage, senderName, baseNotification, userRole);
			
			case 'task-completed':
				// Handle task completion notifications
				return this.createTaskCompletionNotification(jsonMessage as TaskCompletionMessage, senderName, baseNotification, userRole);
			
			default:
				console.log('Unknown message type:', jsonMessage.messageType);
				return null;
		}
	}

	/**
	 * Create notification for bid status updates
	 */
	private createBidStatusNotification(
		message: BidStatusMessage, 
		senderName: string, 
		base: Partial<Notification>,
		userRole: UserRole
	): Notification {
		const isAccepted = message.status === 'accepted';
		const isRejected = message.status === 'rejected';

		// Role-aware titles and messages
		let title: string;
		let body: string;

		if (userRole === 'taskee') {
			// Taskee (bidder) receiving bid status update
			title = isAccepted ? 'Bid Accepted' : 'Bid Rejected';
			body = isAccepted 
				? `Great news! Your bid has been accepted by ${senderName}. Time to start working!`
				: `Your bid has been rejected by ${senderName}. Don't get discouraged, keep trying.`;
		} else {
			// Fallback for unknown roles
			title = isAccepted ? 'Bid Status Update' : 'Bid Status Update';
			body = isAccepted 
				? `Bid accepted by ${senderName}`
				: `Bid rejected by ${senderName}`;
		}

		return {
			...base,
			type: 'bid_response',
			title,
			body,
			priority: isAccepted ? 'high' : 'normal',
			data: {
				bidId: message.bidId,
				taskId: message.taskId,
				status: message.status,
				escrowId: message.escrowId,
				transactionHash: message.transactionHash,
				senderName,
				userRole,
				taskerPubkey: message.taskerPubkey,
				taskeePubkey: message.taskeePubkey
			},
			action: {
				type: 'navigation',
				payload: `/dashboard/task/${message.taskId}`
			}
		} as Notification;
	}

	/**
	 * Create notification for contract events
	 */
	private createContractNotification(
		message: ContractMessage, 
		senderName: string, 
		base: Partial<Notification>,
		userRole: UserRole
	): Notification {
		const actionTitles: Record<string, Record<UserRole, string>> = {
			'contract-created': {
				'tasker': 'Contract Created',
				'taskee': 'Contract Created',
				'unknown': 'Contract Created'
			},
			'contract-completed': {
				'tasker': 'Contract Completed',
				'taskee': 'Contract Completed',
				'unknown': 'Contract Completed'
			},
			'contract-disputed': {
				'tasker': 'Contract Disputed',
				'taskee': 'Contract Disputed',
				'unknown': 'Contract Disputed'
			},
			'contract-cancelled': {
				'tasker': 'Contract Cancelled',
				'taskee': 'Contract Cancelled',
				'unknown': 'Contract Cancelled'
			},
			'payment-released': {
				'tasker': 'Payment Released',
				'taskee': 'Payment Received',
				'unknown': 'Payment Released'
			},
			'payment-refunded': {
				'tasker': 'Payment Refunded',
				'taskee': 'Payment Refunded',
				'unknown': 'Payment Refunded'
			}
		};

		const actionBodies: Record<string, Record<UserRole, string>> = {
			'contract-created': {
				'tasker': `New contract created with ${senderName}`,
				'taskee': `New contract created with ${senderName}`,
				'unknown': `New contract created by ${senderName}`
			},
			'contract-completed': {
				'tasker': `Contract completed by ${senderName}`,
				'taskee': `Contract completed with ${senderName}`,
				'unknown': `Contract completed by ${senderName}`
			},
			'contract-disputed': {
				'tasker': `Dispute initiated by ${senderName}`,
				'taskee': `Dispute initiated by ${senderName}`,
				'unknown': `Dispute initiated by ${senderName}`
			},
			'contract-cancelled': {
				'tasker': `Contract cancelled by ${senderName}`,
				'taskee': `Contract cancelled by ${senderName}`,
				'unknown': `Contract cancelled by ${senderName}`
			},
			'payment-released': {
				'tasker': `Payment released to ${senderName}`,
				'taskee': `Payment received from ${senderName}`,
				'unknown': `Payment released by ${senderName}`
			},
			'payment-refunded': {
				'tasker': `Payment refunded to ${senderName}`,
				'taskee': `Payment refunded by ${senderName}`,
				'unknown': `Payment refunded by ${senderName}`
			}
		};

		const title = actionTitles[message.action]?.[userRole] || 'Contract Update';
		const body = actionBodies[message.action]?.[userRole] || message.message || `Contract update by ${senderName}`;

		return {
			...base,
			type: 'contract_event',
			title,
			body,
			priority: message.action === 'contract-disputed' ? 'urgent' : 'normal',
			data: {
				contractId: message.contractId,
				action: message.action,
				escrowId: message.escrowId,
				transactionHash: message.transactionHash,
				senderName,
				userRole,
				taskerPubkey: message.taskerPubkey,
				taskeePubkey: message.taskeePubkey,
				taskId: message.taskId
			},
			action: {
				type: 'navigation',
				payload: `/dashboard/contracts/${message.contractId}`
			}
		} as Notification;
	}

	/**
	 * Create notification for direct bid messages
	 */
	private createBidNotification(
		message: BidMessage, 
		senderName: string, 
		base: Partial<Notification>,
		userRole: UserRole
	): Notification {
		// Role-aware titles and messages
		let title: string;
		let body: string;

		if (userRole === 'tasker') {
			// Tasker receiving new bid
			title = 'New Bid Received';
			body = `${senderName} has sent a bid for your task. Review the details and decide if you accept it.`;
		} else {
			// Fallback for unknown roles
			title = 'New Bid';
			body = `${senderName} has sent a bid.`;
		}

		return {
			...base,
			type: 'new_bid',
			title,
			body,
			priority: 'high',
			data: {
				bidId: message.bidId,
				taskId: message.taskId,
				amount: message.amount,
				currency: message.currency || 'USD',
				senderName,
				userRole,
				taskerPubkey: message.taskerPubkey,
				taskeePubkey: message.taskeePubkey
			},
			action: {
				type: 'navigation',
				payload: `/dashboard/task/${message.taskId}/bids`
			}
		} as Notification;
	}

	/**
	 * Create notification for task completion
	 */
	private createTaskCompletionNotification(
		message: TaskCompletionMessage, 
		senderName: string, 
		base: Partial<Notification>,
		userRole: UserRole
	): Notification {
		// Role-aware titles and messages
		let title: string;
		let body: string;

		if (userRole === 'tasker') {
			// Tasker receiving task completion notification
			title = 'Task Completed';
			body = `${senderName} has marked your task as completed! Review the work and confirm if it's ready.`;
		} else {
			// Fallback for unknown roles
			title = 'Task Completed';
			body = `${senderName} has marked a task as completed.`;
		}

		return {
			...base,
			type: 'task_completed',
			title,
			body,
			priority: 'high',
			data: {
				taskId: message.taskId,
				contractId: message.contractId,
				escrowId: message.escrowId,
				transactionHash: message.transactionHash,
				senderName,
				userRole,
				taskerPubkey: message.taskerPubkey,
				taskeePubkey: message.taskeePubkey
			},
			action: {
				type: 'navigation',
				payload: `/dashboard/contracts/${message.contractId || message.taskId}`
			}
		} as Notification;
	}

	/**
	 * Create notification for payment events
	 */
	private createPaymentNotification(
		message: PaymentMessage, 
		senderName: string, 
		base: Partial<Notification>,
		userRole: UserRole
	): Notification {
		const statusTitles: Record<string, Record<UserRole, string>> = {
			'received': {
				'tasker': 'Payment Sent',
				'taskee': 'Payment Received',
				'unknown': 'Payment Update'
			},
			'sent': {
				'tasker': 'Payment Sent',
				'taskee': 'Payment Received',
				'unknown': 'Payment Update'
			},
			'pending': {
				'tasker': 'Payment Pending',
				'taskee': 'Payment Pending',
				'unknown': 'Payment Pending'
			}
		};

		const statusBodies: Record<string, Record<UserRole, string>> = {
			'received': {
				'tasker': `You have sent ${message.amount} ${message.currency} to ${senderName}`,
				'taskee': `You have received ${message.amount} ${message.currency} from ${senderName}`,
				'unknown': `Payment of ${message.amount} ${message.currency} processed`
			},
			'sent': {
				'tasker': `You have sent ${message.amount} ${message.currency} to ${senderName}`,
				'taskee': `You have received ${message.amount} ${message.currency} from ${senderName}`,
				'unknown': `Payment of ${message.amount} ${message.currency} sent`
			},
			'pending': {
				'tasker': `Your payment of ${message.amount} ${message.currency} is pending confirmation`,
				'taskee': `Payment of ${message.amount} ${message.currency} is pending confirmation`,
				'unknown': `Payment of ${message.amount} ${message.currency} is pending`
			}
		};

		const title = statusTitles[message.status]?.[userRole] || 'Payment Update';
		const body = statusBodies[message.status]?.[userRole] || message.message || `Payment update by ${senderName}`;

		return {
			...base,
			type: 'payment',
			title,
			body,
			priority: message.status === 'received' ? 'high' : 'normal',
			data: {
				paymentId: message.paymentId,
				amount: message.amount,
				currency: message.currency,
				status: message.status,
				transactionHash: message.transactionHash,
				senderName,
				userRole,
				taskerPubkey: message.taskerPubkey,
				taskeePubkey: message.taskeePubkey
			},
			action: {
				type: 'navigation',
				payload: '/dashboard/wallet'
			}
		} as Notification;
	}

	/**
	 * Add notification to the store and persist to storage
	 */
	private addNotification(notification: Notification): void {
		this.notifications.update(notifications => {
			// Check if notification already exists (avoid duplicates)
			const exists = notifications.some(n => n.id === notification.id);
			if (exists) return notifications;

			// Add to beginning of array (most recent first)
			const updated = [notification, ...notifications];
			
			// Sort by creation date (most recent first) to ensure proper ordering
			const sorted = updated.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
			
			// Limit to last 50 notifications to prevent memory issues and improve performance
			const limited = sorted.slice(0, 50);
			
			// Update unread count
			this.updateUnreadCount(limited);
			
			// Persist to storage
			this.saveToStorage(limited);
			
			return limited;
		});
	}

	/**
	 * Show system notification (desktop notification)
	 */
	private showSystemNotification(notification: Notification): void {
		// Check if notifications are supported
		if (!('Notification' in window)) {
			console.warn('This browser does not support notifications');
			return;
		}

		// Check if permission is granted
		if (Notification.permission === 'granted') {
			this.createSystemNotification(notification);
		} else if (Notification.permission !== 'denied') {
			// Request permission
			Notification.requestPermission().then(permission => {
				if (permission === 'granted') {
					this.createSystemNotification(notification);
				} else {
					console.warn('Notification permission denied');
				}
			});
		} else {
			console.warn('Notification permission denied');
		}
	}

	/**
	 * Create and show system notification
	 */
	private createSystemNotification(notification: Notification): void {
		const notificationOptions: NotificationOptions = {
			body: notification.body,
			icon: '/favicon-96x96.png', // Use your app icon
			badge: '/favicon-96x96.png',
			tag: `bittasker-${notification.id}`, // Prevent duplicate notifications
			requireInteraction: notification.priority === 'urgent', // Keep urgent notifications until clicked
			silent: notification.priority === 'low', // Silent for low priority
			data: {
				notificationId: notification.id,
				action: notification.action,
				...notification.data
			}
		};

		// Create the notification
		const systemNotification = new Notification(notification.title, notificationOptions);

		// Handle click on notification
		systemNotification.onclick = () => {
			// Focus the app window
			window.focus();
			
			// Handle navigation if action is provided
			if (notification.action) {
				switch (notification.action.type) {
					case 'navigation':
						window.location.href = notification.action.payload;
						break;
					case 'external_link':
						window.open(notification.action.payload, '_blank');
						break;
				}
			}

			// Mark notification as read
			this.markAsRead(notification.id);
			
			// Close the system notification
			systemNotification.close();
		};

		// Auto-close after a certain time (except urgent notifications)
		if (notification.priority !== 'urgent') {
			const autoCloseTime = this.getAutoCloseTime(notification.priority);
			setTimeout(() => {
				systemNotification.close();
			}, autoCloseTime);
		}

		console.log('System notification created:', notification.title);
	}

	/**
	 * Get auto-close time based on priority
	 */
	private getAutoCloseTime(priority: Notification['priority']): number {
		switch (priority) {
			case 'urgent': return 0; // Don't auto-close
			case 'high': return 10000; // 10 seconds
			case 'normal': return 7000; // 7 seconds
			case 'low': return 5000; // 5 seconds
			default: return 7000;
		}
	}

	/**
	 * Update unread count
	 */
	private updateUnreadCount(notifications: Notification[]): void {
		const unreadCount = notifications.filter(n => !n.read).length;
		this.unreadCount.set(unreadCount);
	}

	/**
	 * Increment incoming notification count
	 */
	private incrementIncomingCount(): void {
		this.incomingCount.update(count => count + 1);
	}

	/**
	 * Reset incoming notification count
	 */
	public resetIncomingCount(): void {
		this.incomingCount.set(0);
	}

	/**
	 * Load notifications from session storage
	 */
	private loadFromStorage(): void {
		try {
			if (typeof window === 'undefined') return;
			
			const stored = sessionStorage.getItem('bittasker-notifications');
			if (stored) {
				const notifications: Notification[] = JSON.parse(stored).map((n: any) => ({
					...n,
					createdAt: new Date(n.createdAt)
				}));
				
				// Filter out expired notifications
				const now = new Date();
				const validNotifications = notifications.filter((n: any) => 
					!n.expiresAt || new Date(n.expiresAt) > now
				);
				
				// Sort by creation date (most recent first)
				const sorted = validNotifications.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
				
				this.notifications.set(sorted);
				this.updateUnreadCount(sorted);
				
				// Save the filtered and sorted notifications back to storage
				if (sorted.length !== notifications.length) {
					this.saveToStorage(sorted);
				}
			}
		} catch (error) {
			console.error('Failed to load notifications from storage:', error);
		}
	}

	/**
	 * Save notifications to session storage
	 */
	private saveToStorage(notifications: Notification[]): void {
		try {
			if (typeof window === 'undefined') return;
			
			sessionStorage.setItem('bittasker-notifications', JSON.stringify(notifications));
		} catch (error) {
			console.error('Failed to save notifications to storage:', error);
		}
	}

	/**
	 * Mark notification as read
	 */
	public markAsRead(notificationId: string): void {
		this.notifications.update(notifications => {
			const updated = notifications.map(n => 
				n.id === notificationId ? { ...n, read: true } : n
			);
			
			this.updateUnreadCount(updated);
			this.saveToStorage(updated);
			
			return updated;
		});
	}

	/**
	 * Mark all notifications as read
	 */
	public markAllAsRead(): void {
		this.notifications.update(notifications => {
			const updated = notifications.map(n => ({ ...n, read: true }));
			
			this.updateUnreadCount(updated);
			this.saveToStorage(updated);
			
			return updated;
		});
	}

	/**
	 * Remove notification
	 */
	public removeNotification(notificationId: string): void {
		this.notifications.update(notifications => {
			const updated = notifications.filter(n => n.id !== notificationId);
			
			this.updateUnreadCount(updated);
			this.saveToStorage(updated);
			
			return updated;
		});
	}

	/**
	 * Clear all notifications
	 */
	public clearAll(): void {
		this.notifications.set([]);
		this.unreadCount.set(0);
		
		try {
			if (typeof window !== 'undefined') {
				sessionStorage.removeItem('bittasker-notifications');
			}
		} catch (error) {
			console.error('Failed to clear notifications from storage:', error);
		}
	}

	/**
	 * Get notifications store
	 */
	public getNotifications() {
		return this.notifications;
	}

	/**
	 * Get unread count store
	 */
	public getUnreadCount() {
		return this.unreadCount;
	}

	/**
	 * Get loading state store
	 */
	public getIsLoading() {
		return this.isLoading;
	}

	/**
	 * Get incoming count store
	 */
	public getIncomingCount() {
		return this.incomingCount;
	}

	/**
	 * Check if system notifications are supported and enabled
	 */
	public isSystemNotificationSupported(): boolean {
		if (typeof window === 'undefined') return false;
		return 'Notification' in window && Notification.permission === 'granted';
	}

	/**
	 * Get notification permission status
	 */
	public getNotificationPermissionStatus(): NotificationPermission | 'unsupported' {
		if (typeof window === 'undefined') return 'unsupported';
		if (!('Notification' in window)) return 'unsupported';
		return Notification.permission;
	}

	/**
	 * Cleanup and destroy the service
	 */
	public destroy(): void {
		if (this.messageUnsubscribe) {
			this.messageUnsubscribe();
			this.messageUnsubscribe = null;
		}
		this.isInitialized = false;
	}
}

// Export singleton instance
export const localNotificationService = new LocalNotificationService();

import { writable } from 'svelte/store';
import type { Notification } from '$lib/stores/notification.store';
import { listenForIncomingMessages } from '$lib/utils/nostr-message';
import { getMessagedPeople } from '$lib/utils/nostr-message';

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
		return;
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
			if (permission !== 'granted') {
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
			
			// Check if this notification is intended for the current user
			const isIntendedForCurrentUser = await this.isNotificationIntendedForCurrentUser(jsonMessage, senderPubkey, event);
			
			if (!isIntendedForCurrentUser) {
				return;
			}
			
			// Get sender profile information from multiple sources
			const senderName = await this.getSenderName(senderPubkey);

			// Convert JSON message to notification based on type
			const notification = await this.convertJsonToNotification(jsonMessage, senderName, senderPubkey, event);
			
			if (notification) {
				this.addNotification(notification);
				// Only show system notifications, no toast notifications
				this.showSystemNotification(notification);
				this.incrementIncomingCount();
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

			// First, check if we have explicit pubkeys in the message
			if ('taskerPubkey' in jsonMessage && jsonMessage.taskerPubkey === currentUserPubkey) {
				return 'tasker';
			}
			
			if ('taskeePubkey' in jsonMessage && jsonMessage.taskeePubkey === currentUserPubkey) {
				return 'taskee';
			}

			// For bid messages, check if current user is the sender (taskee) or recipient (tasker)
			if (jsonMessage.messageType === 'bid') {
				// If current user is the sender, they are the taskee (bidder)
				if (senderPubkey === currentUserPubkey) {
					return 'taskee';
				}
				
				// For bid messages, the recipient is typically the tasker
				return 'tasker';
			}

			// For bid-status messages, check if current user is the sender (tasker) or recipient (taskee)
			if (jsonMessage.messageType === 'bid-status') {
				// If current user is the sender, they are the tasker (who accepts/rejects bids)
				if (senderPubkey === currentUserPubkey) {
					return 'tasker';
				}
				
				// For bid-status messages, the recipient is typically the taskee
				return 'taskee';
			}

			// For contract messages, both parties can be involved
			if (jsonMessage.messageType === 'contract' || jsonMessage.messageType === 'contract-status') {
				// Try to determine from contract involvement
				if ('contractId' in jsonMessage && jsonMessage.contractId) {
					const contractRole = await this.getUserRoleInContract(jsonMessage.contractId, currentUserPubkey);
					if (contractRole !== 'unknown') {
						return contractRole;
					}
				}
				
				// If we can't determine from contract, assume both parties are involved
				return 'tasker'; // Default to tasker for contract messages
			}

			// For task completion messages, the sender is typically the taskee
			if (jsonMessage.messageType === 'task-completed') {
				if (senderPubkey === currentUserPubkey) {
					return 'taskee';
				}
				
				return 'tasker';
			}

			// For payment messages, both parties can be involved
			if (jsonMessage.messageType === 'payment') {
				// Try to determine from contract involvement
				if ('contractId' in jsonMessage && jsonMessage.contractId) {
					const contractRole = await this.getUserRoleInContract(jsonMessage.contractId, currentUserPubkey);
					if (contractRole !== 'unknown') {
						return contractRole;
					}
				}
				
				return 'tasker'; // Default to tasker for payment messages
			}

			// Fallback: try to check task ownership only if we have a valid task ID format
			// Skip API call if taskId looks like a hex string (Nostr event ID)
			if ('taskId' in jsonMessage && jsonMessage.taskId && !this.isHexString(jsonMessage.taskId)) {
				try {
					const isTaskOwner = await this.isCurrentUserTaskOwner(jsonMessage.taskId);
					if (isTaskOwner) {
						return 'tasker';
					}
				} catch (error) {
					// Skip task ownership check due to API error
				}
			}

			return 'unknown';
		} catch (error) {
			console.error('Error determining user role:', error);
			return 'unknown';
		}
	}

	/**
	 * Check if a string is a hex string (likely a Nostr event ID)
	 */
	private isHexString(str: string): boolean {
		return /^[0-9a-fA-F]{64}$/.test(str);
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
			return true;
		}

		// Additional check: if we have explicit taskee pubkey in message
		if (message.taskeePubkey && message.taskeePubkey === currentUserPubkey) {
			return true;
		}

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
			return true;
		}

		// Additional check: if we have explicit tasker pubkey in message
		if (message.taskerPubkey && message.taskerPubkey === currentUserPubkey) {
			return true;
		}

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
			return true;
		}

		// Additional check: if we have explicit pubkeys in message
		if ((message.taskerPubkey && message.taskerPubkey === currentUserPubkey) ||
			(message.taskeePubkey && message.taskeePubkey === currentUserPubkey)) {
			return true;
		}

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
			return true;
		}

		// Additional check: if we have explicit tasker pubkey in message
		if (message.taskerPubkey && message.taskerPubkey === currentUserPubkey) {
			return true;
		}

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
			return true;
		}

		// Additional check: if we have explicit pubkeys in message
		if ((message.taskerPubkey && message.taskerPubkey === currentUserPubkey) ||
			(message.taskeePubkey && message.taskeePubkey === currentUserPubkey)) {
			return true;
		}

		return false;
	}

	/**
	 * Get user role in a specific contract
	 */
	private async getUserRoleInContract(contractId: string, currentUserPubkey: string): Promise<UserRole> {
		try {
			// Import contract service to check contract details
			const { getContracts } = await import('$lib/utils/nostr-contract');
			const contracts = await getContracts({ escrowIds: [contractId] });
			
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
				return await this.createBidNotification(jsonMessage as BidMessage, senderName, baseNotification, userRole);
			
			case 'task-completed':
				// Handle task completion notifications
				return this.createTaskCompletionNotification(jsonMessage as TaskCompletionMessage, senderName, baseNotification, userRole);
			
			case undefined:
			case null:
				// Handle messages with undefined messageType - create a generic notification
				return this.createGenericNotification(jsonMessage, senderName, baseNotification, userRole);
			
			default:
				return null;
		}
	}

	/**
	 * Create generic notification for messages with undefined type
	 */
	private createGenericNotification(
		jsonMessage: JsonMessage, 
		senderName: string, 
		base: Partial<Notification>,
		userRole: UserRole
	): Notification {
		// Determine navigation URL based on message content
		let navigationUrl = '/dashboard/messages';
		if ('taskId' in jsonMessage && jsonMessage.taskId) {
			navigationUrl = `/tasks/${jsonMessage.taskId}`;
		} else if ('contractId' in jsonMessage && jsonMessage.contractId) {
			navigationUrl = `/dashboard/contracts/${jsonMessage.contractId}/messages`;
		}

		return {
			...base,
			type: 'message',
			title: 'notifications.service_messages.new_message',
			body: 'notifications.service_messages.new_message_body',
			priority: 'normal',
			data: {
				senderName,
				userRole,
				messageType: 'generic',
				originalMessage: jsonMessage,
				titleKey: 'notifications.service_messages.new_message',
				bodyKey: 'notifications.service_messages.new_message_body'
			},
			action: {
				type: 'navigation',
				payload: navigationUrl
			}
		} as Notification;
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

		// Create proper navigation URL based on notification type
		const navigationUrl = userRole === 'taskee' 
			? `/dashboard/bids/${message.bidId}` // Taskee goes to specific bid page
			: `/tasks/${message.taskId}`; // Tasker goes to task page

		// Create translation keys based on user role and status
		let titleKey: string;
		let bodyKey: string;

		if (userRole === 'taskee') {
			// Taskee (bidder) receiving bid status update
			if (isAccepted) {
				titleKey = 'notifications.service_messages.bid_accepted_title';
				bodyKey = 'notifications.service_messages.bid_accepted_body_taskee';
			} else {
				titleKey = 'notifications.service_messages.bid_rejected_title';
				bodyKey = 'notifications.service_messages.bid_rejected_body_taskee';
			}
		} else {
			// Tasker (task owner) - this shouldn't happen for bid status, but fallback
			titleKey = 'notifications.service_messages.bid_update_title';
			bodyKey = 'notifications.service_messages.bid_update_body_tasker';
		}

		return {
			...base,
			type: 'bid_response',
			title: titleKey,
			body: bodyKey,
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
				taskeePubkey: message.taskeePubkey,
				titleKey,
				bodyKey
			},
			action: {
				type: 'navigation',
				payload: navigationUrl
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
		const actionTitleKeys: Record<string, Record<UserRole, string>> = {
			'contract-created': {
				'tasker': 'notifications.service_messages.contract_created_title',
				'taskee': 'notifications.service_messages.contract_created_title',
				'unknown': 'notifications.service_messages.contract_created_title'
			},
			'contract-completed': {
				'tasker': 'notifications.service_messages.contract_completed_title',
				'taskee': 'notifications.service_messages.contract_completed_title',
				'unknown': 'notifications.service_messages.contract_completed_title'
			},
			'contract-disputed': {
				'tasker': 'notifications.service_messages.contract_disputed_title',
				'taskee': 'notifications.service_messages.contract_disputed_title',
				'unknown': 'notifications.service_messages.contract_disputed_title'
			},
			'contract-cancelled': {
				'tasker': 'notifications.service_messages.contract_cancelled_title',
				'taskee': 'notifications.service_messages.contract_cancelled_title',
				'unknown': 'notifications.service_messages.contract_cancelled_title'
			},
			'payment-released': {
				'tasker': 'notifications.service_messages.payment_released_title',
				'taskee': 'notifications.service_messages.payment_received_title',
				'unknown': 'notifications.service_messages.payment_released_title'
			},
			'payment-refunded': {
				'tasker': 'notifications.service_messages.payment_refunded_title',
				'taskee': 'notifications.service_messages.payment_refunded_title',
				'unknown': 'notifications.service_messages.payment_refunded_title'
			}
		};

		const actionBodyKeys: Record<string, Record<UserRole, string>> = {
			'contract-created': {
				'tasker': 'notifications.service_messages.contract_created_body',
				'taskee': 'notifications.service_messages.contract_created_body',
				'unknown': 'notifications.service_messages.contract_created_body'
			},
			'contract-completed': {
				'tasker': 'notifications.service_messages.contract_completed_body_tasker',
				'taskee': 'notifications.service_messages.contract_completed_body_taskee',
				'unknown': 'notifications.service_messages.contract_completed_body_tasker'
			},
			'contract-disputed': {
				'tasker': 'notifications.service_messages.contract_disputed_body',
				'taskee': 'notifications.service_messages.contract_disputed_body',
				'unknown': 'notifications.service_messages.contract_disputed_body'
			},
			'contract-cancelled': {
				'tasker': 'notifications.service_messages.contract_cancelled_body',
				'taskee': 'notifications.service_messages.contract_cancelled_body',
				'unknown': 'notifications.service_messages.contract_cancelled_body'
			},
			'payment-released': {
				'tasker': 'notifications.service_messages.payment_released_body_tasker',
				'taskee': 'notifications.service_messages.payment_released_body_taskee',
				'unknown': 'notifications.service_messages.payment_released_body_tasker'
			},
			'payment-refunded': {
				'tasker': 'notifications.service_messages.payment_refunded_body_tasker',
				'taskee': 'notifications.service_messages.payment_refunded_body_taskee',
				'unknown': 'notifications.service_messages.payment_refunded_body_tasker'
			}
		};

		const titleKey = actionTitleKeys[message.action]?.[userRole] || 'notifications.service_messages.contract_update_title';
		const bodyKey = actionBodyKeys[message.action]?.[userRole] || 'notifications.service_messages.contract_update_body';

		return {
			...base,
			type: 'contract_event',
			title: titleKey,
			body: bodyKey,
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
				taskId: message.taskId,
				titleKey,
				bodyKey
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
	private async createBidNotification(
		message: BidMessage, 
		senderName: string, 
		base: Partial<Notification>,
		userRole: UserRole
	): Promise<Notification> {
		// Convert USD to Bitcoin (sats) for display
		const usdAmount = parseFloat(message.amount?.toString() || '0');
		const bitcoinAmount = await this.convertUsdToSats(usdAmount);

		// Create proper navigation URL based on notification type
		const navigationUrl = userRole === 'tasker' 
			? `/tasks/${message.taskId}` // Tasker goes to task page
			: `/dashboard/bids/${message.bidId}`; // Taskee goes to specific bid page

		// Create translation keys based on user role
		let titleKey: string;
		let bodyKey: string;

		if (userRole === 'tasker') {
			// Tasker receiving new bid
			titleKey = 'notifications.service_messages.new_bid_title';
			bodyKey = 'notifications.service_messages.new_bid_body_tasker';
		} else {
			// Fallback for unknown roles
			titleKey = 'notifications.service_messages.new_bid_title';
			bodyKey = 'notifications.service_messages.new_bid_body_unknown';
		}

		return {
			...base,
			type: 'new_bid',
			title: titleKey,
			body: bodyKey,
			priority: 'high',
			data: {
				bidId: message.bidId,
				taskId: message.taskId,
				amount: message.amount,
				currency: message.currency || 'USD',
				bitcoinAmount: bitcoinAmount,
				senderName,
				userRole,
				taskerPubkey: message.taskerPubkey,
				taskeePubkey: message.taskeePubkey,
				titleKey,
				bodyKey
			},
			action: {
				type: 'navigation',
				payload: navigationUrl
			}
		} as Notification;
	}

	/**
	 * Convert USD amount to Bitcoin (sats) using real-time Bitcoin price
	 */
	private async convertUsdToSats(usdAmount: number): Promise<number> {
		try {
			const cryptoPriceService = (await import('$lib/api/services/crypto-price.service')).default;
			const btcPrice = await cryptoPriceService.getCurrentPrice('BTC');
			const SATS_PER_BTC = 100000000; // 100 million sats per BTC
			
			const btcAmount = usdAmount / btcPrice;
			return Math.round(btcAmount * SATS_PER_BTC);
		} catch (error) {
			console.error('Error fetching BTC price for notification conversion:', error);
			// Return 0 if we can't get real price - better to show no amount than wrong amount
			return 0;
		}
	}

	/**
	 * Get sender name from multiple sources
	 */
	private async getSenderName(senderPubkey: string): Promise<string> {
		try {
			// First, try to get from messaged people
			const messagedPeople = await getMessagedPeople();
			const sender = messagedPeople.find(p => p.pubkey === senderPubkey);
			if (sender?.profile?.name) {
				return sender.profile.name;
			}

			// Second, try to get from Nostr relays (simplified approach)
			// For now, we'll skip this as it requires complex Nostr relay queries
			// In production, this could be implemented with proper Nostr profile fetching

			// Third, try to get from local storage or cache
			try {
				const cachedProfiles = localStorage.getItem('nostr-profiles');
				if (cachedProfiles) {
					const profiles = JSON.parse(cachedProfiles);
					const profile = profiles[senderPubkey];
					if (profile?.name) {
						return profile.name;
					}
				}
			} catch (error) {
				// Could not get profile from cache
			}

			// Fallback: use a more descriptive name
			return `User ${senderPubkey.substring(0, 8)}...`;
		} catch (error) {
			console.error('Error getting sender name:', error);
			return `User ${senderPubkey.substring(0, 8)}...`;
		}
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
		// Role-aware translation keys
		let titleKey: string;
		let bodyKey: string;

		if (userRole === 'tasker') {
			// Tasker receiving task completion notification
			titleKey = 'notifications.service_messages.task_completed_title';
			bodyKey = 'notifications.service_messages.task_completed_body_tasker';
		} else {
			// Fallback for unknown roles
			titleKey = 'notifications.service_messages.task_completed_title';
			bodyKey = 'notifications.service_messages.task_completed_body_unknown';
		}

		return {
			...base,
			type: 'task_completed',
			title: titleKey,
			body: bodyKey,
			priority: 'high',
			data: {
				taskId: message.taskId,
				contractId: message.contractId,
				escrowId: message.escrowId,
				transactionHash: message.transactionHash,
				senderName,
				userRole,
				taskerPubkey: message.taskerPubkey,
				taskeePubkey: message.taskeePubkey,
				titleKey,
				bodyKey
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
		const statusTitleKeys: Record<string, Record<UserRole, string>> = {
			'received': {
				'tasker': 'notifications.service_messages.payment_sent_title',
				'taskee': 'notifications.service_messages.payment_received_title',
				'unknown': 'notifications.service_messages.payment_update_title'
			},
			'sent': {
				'tasker': 'notifications.service_messages.payment_sent_title',
				'taskee': 'notifications.service_messages.payment_received_title',
				'unknown': 'notifications.service_messages.payment_update_title'
			},
			'pending': {
				'tasker': 'notifications.service_messages.payment_pending_title',
				'taskee': 'notifications.service_messages.payment_pending_title',
				'unknown': 'notifications.service_messages.payment_pending_title'
			}
		};

		const statusBodyKeys: Record<string, Record<UserRole, string>> = {
			'received': {
				'tasker': 'notifications.service_messages.payment_sent_body_tasker',
				'taskee': 'notifications.service_messages.payment_received_body_taskee',
				'unknown': 'notifications.service_messages.payment_update_body'
			},
			'sent': {
				'tasker': 'notifications.service_messages.payment_sent_body_tasker',
				'taskee': 'notifications.service_messages.payment_received_body_taskee',
				'unknown': 'notifications.service_messages.payment_update_body'
			},
			'pending': {
				'tasker': 'notifications.service_messages.payment_pending_body_tasker',
				'taskee': 'notifications.service_messages.payment_pending_body_taskee',
				'unknown': 'notifications.service_messages.payment_pending_body_taskee'
			}
		};

		const titleKey = statusTitleKeys[message.status]?.[userRole] || 'notifications.service_messages.payment_update_title';
		const bodyKey = statusBodyKeys[message.status]?.[userRole] || 'notifications.service_messages.payment_update_body';

		return {
			...base,
			type: 'payment',
			title: titleKey,
			body: bodyKey,
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
				taskeePubkey: message.taskeePubkey,
				titleKey,
				bodyKey
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
			if (exists) {
				return notifications;
			}

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
			icon: '/web-app-manifest-192x192.png', // Use app icon optimized for notifications
			badge: '/web-app-manifest-192x192.png',
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
	 * Load notifications from local storage
	 */
	private loadFromStorage(): void {
		try {
			if (typeof window === 'undefined') return;
			
			const stored = localStorage.getItem('bittasker-notifications');
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
	 * Save notifications to local storage
	 */
	private saveToStorage(notifications: Notification[]): void {
		try {
			if (typeof window === 'undefined') return;
			
			localStorage.setItem('bittasker-notifications', JSON.stringify(notifications));
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
				localStorage.removeItem('bittasker-notifications');
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
	 * Test notification creation (for debugging)
	 */
	public async testNotification(): Promise<void> {
		const testNotification: Notification = {
			id: 'test-' + Date.now(),
			userId: 'current-user',
			type: 'system',
			title: 'Test Notification',
			body: 'This is a test notification to verify the system is working.',
			priority: 'normal',
			read: false,
			delivered: {
				inApp: true,
				push: false
			},
			createdAt: new Date(),
			data: {
				test: true,
				userRole: 'unknown'
			}
		};

		this.addNotification(testNotification);
		this.showSystemNotification(testNotification);
	}
}

// Export singleton instance
export const localNotificationService = new LocalNotificationService();

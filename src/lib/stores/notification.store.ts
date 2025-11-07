/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { writable, derived } from 'svelte/store';
import type { Writable } from 'svelte/store';
import { localNotificationService } from '$lib/services/local-notification.service';

export interface Notification {
	id: string;
	userId: string;
	type: 'task_update' | 'bid_response' | 'payment' | 'message' | 'system' | 'security' | 'contract_event' | 'new_bid' | 'task_completed' | 'scheduling';
	title: string;
	body: string;
	image?: string;
	data?: {
		[key: string]: any;
		// Scheduling-specific data
		requestId?: string;
		bidId?: string;
		taskId?: string;
		taskerPubkey?: string;
		taskeePubkey?: string;
		timeSlot?: {
			startTime: number;
			endTime: number;
		};
		escrowId?: string;
	};
	action?: {
		type: 'navigation' | 'external_link' | 'function_call';
		payload: string;
	};
	priority: 'low' | 'normal' | 'high' | 'urgent';
	read: boolean;
	delivered: {
		inApp: boolean;
		push?: boolean;
		email?: boolean;
		sms?: boolean;
	};
	createdAt: Date;
	expiresAt?: Date;
	// Nostr-specific fields
	senderPubkey?: string;
	eventId?: string;
	relayUrl?: string;
	// Scheduling-specific fields
	batchId?: string; // ID of batched notification group
}

export interface NotificationPreference {
	userId: string;
	channels: {
		inApp: boolean;
		push: boolean;
		email: boolean;
		sms: boolean;
	};
	categories: {
		[category: string]: {
			enabled: boolean;
			channels?: {
				inApp?: boolean;
				push?: boolean;
				email?: boolean;
				sms?: boolean;
			};
			quietHours?: {
				enabled: boolean;
				start: string;
				end: string;
				timezone: string;
			};
		};
	};
	quietHours: {
		enabled: boolean;
		start: string;
		end: string;
		timezone: string;
	};
	updatedAt: Date;
}

interface NotificationState {
	notifications: Notification[];
	preferences: NotificationPreference | null;
	unreadCount: number;
	incomingCount: number;
	isLoading: boolean;
	error: string | null;
}

function createNotificationStore() {
	const { subscribe, set, update }: Writable<NotificationState> = writable({
		notifications: [],
		preferences: null,
		unreadCount: 0,
		incomingCount: 0,
		isLoading: false,
		error: null
	});

	return {
		subscribe,
		
		// Add a new notification
		addNotification: (notification: Omit<Notification, 'id' | 'createdAt' | 'delivered' | 'read'>) => {
			const newNotification: Notification = {
				...notification,
				id: crypto.randomUUID(),
				createdAt: new Date(),
				delivered: {
					inApp: true,
					push: false,
					email: false,
					sms: false
				},
				read: false
			};

			update(state => ({
				...state,
				notifications: [newNotification, ...state.notifications],
				unreadCount: state.unreadCount + 1
			}));

			return newNotification;
		},

		// Mark notification as read
		markAsRead: (notificationId: string) => {
			update(state => {
				const notification = state.notifications.find(n => n.id === notificationId);
				if (notification && !notification.read) {
					notification.read = true;
					return {
						...state,
						unreadCount: Math.max(0, state.unreadCount - 1)
					};
				}
				return state;
			});
		},

		// Mark all notifications as read
		markAllAsRead: () => {
			update(state => ({
				...state,
				notifications: state.notifications.map(n => ({ ...n, read: true })),
				unreadCount: 0
			}));
		},

		// Remove notification
		removeNotification: (notificationId: string) => {
			update(state => {
				const notification = state.notifications.find(n => n.id === notificationId);
				const newNotifications = state.notifications.filter(n => n.id !== notificationId);
				return {
					...state,
					notifications: newNotifications,
					unreadCount: notification && !notification.read 
						? Math.max(0, state.unreadCount - 1) 
						: state.unreadCount
				};
			});
		},

		// Clear all notifications
		clearAll: () => {
			update(state => ({
				...state,
				notifications: [],
				unreadCount: 0
			}));
		},

		// Set notifications (for loading from storage/API)
		setNotifications: (notifications: Notification[]) => {
			update(state => ({
				...state,
				notifications,
				unreadCount: notifications.filter(n => !n.read).length
			}));
		},

		// Set preferences
		setPreferences: (preferences: NotificationPreference) => {
			update(state => ({
				...state,
				preferences
			}));
		},

		// Set loading state
		setLoading: (isLoading: boolean) => {
			update(state => ({
				...state,
				isLoading
			}));
		},

		// Set error
		setError: (error: string | null) => {
			update(state => ({
				...state,
				error
			}));
		},

		// Update state
		update: (updater: (state: NotificationState) => NotificationState) => {
			update(updater);
		},

		// Get notifications by type
		getNotificationsByType: (type: Notification['type']) => {
			let notifications: Notification[] = [];
			subscribe(state => {
				notifications = state.notifications.filter(n => n.type === type);
			})();
			return notifications;
		},

		// Get unread notifications
		getUnreadNotifications: () => {
			let notifications: Notification[] = [];
			subscribe(state => {
				notifications = state.notifications.filter(n => !n.read);
			})();
			return notifications;
		}
	};
}

export const notificationStore = createNotificationStore();

// Initialize local notification service and sync with store
let isServiceInitialized = false;

export async function initializeNotificationService() {
	if (!isServiceInitialized) {
		await localNotificationService.init();
		
		// Subscribe to local notification service and sync with store
		localNotificationService.getNotifications().subscribe(notifications => {
			notificationStore.setNotifications(notifications);
		});
		
		// Subscribe to incoming count
		localNotificationService.getIncomingCount().subscribe(incomingCount => {
			notificationStore.update(state => ({
				...state,
				incomingCount
			}));
		});
		
		isServiceInitialized = true;
	}
}

// Derived stores for common use cases
export const unreadNotifications = derived(
	notificationStore,
	$notificationStore => $notificationStore.notifications.filter(n => !n.read)
);

export const notificationsByType = (type: Notification['type']) => derived(
	notificationStore,
	$notificationStore => $notificationStore.notifications.filter(n => n.type === type)
);

export const hasUnreadNotifications = derived(
	notificationStore,
	$notificationStore => $notificationStore.unreadCount > 0
);

export const incomingNotificationsCount = derived(
	notificationStore,
	$notificationStore => $notificationStore.incomingCount
);

// Notification categories for preferences
export const NOTIFICATION_CATEGORIES = {
	TASK_UPDATE: 'task_update',
	BID_RESPONSE: 'bid_response',
	PAYMENT: 'payment',
	MESSAGE: 'message',
	SYSTEM: 'system',
	SECURITY: 'security',
	CONTRACT_EVENT: 'contract_event'
} as const;

// Default notification preferences
export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreference = {
	userId: '',
	channels: {
		inApp: true,
		push: true,
		email: false,
		sms: false
	},
	categories: {
		[NOTIFICATION_CATEGORIES.TASK_UPDATE]: {
			enabled: true,
			channels: {
				inApp: true,
				push: true
			}
		},
		[NOTIFICATION_CATEGORIES.BID_RESPONSE]: {
			enabled: true,
			channels: {
				inApp: true,
				push: true
			}
		},
		[NOTIFICATION_CATEGORIES.PAYMENT]: {
			enabled: true,
			channels: {
				inApp: true,
				push: true
			}
		},
		[NOTIFICATION_CATEGORIES.MESSAGE]: {
			enabled: true,
			channels: {
				inApp: true,
				push: false
			}
		},
		[NOTIFICATION_CATEGORIES.SYSTEM]: {
			enabled: true,
			channels: {
				inApp: true,
				push: false
			}
		},
		[NOTIFICATION_CATEGORIES.SECURITY]: {
			enabled: true,
			channels: {
				inApp: true,
				push: true
			}
		},
		[NOTIFICATION_CATEGORIES.CONTRACT_EVENT]: {
			enabled: true,
			channels: {
				inApp: true,
				push: true
			}
		}
	},
	quietHours: {
		enabled: false,
		start: '22:00',
		end: '08:00',
		timezone: 'UTC'
	},
	updatedAt: new Date()
};

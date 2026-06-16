export interface DeviceRegistration {
	fcmToken: string;
	platform: 'ios' | 'android' | 'web';
	deviceId: string;
	deviceName?: string | null;
	appVersion?: string;
}

export interface DeviceUpdate {
	fcmToken?: string;
	isActive?: boolean;
	deviceName?: string;
	appVersion?: string;
}

export interface RegisteredDevice {
	id: string;
	userId: string;
	deviceId: string;
	deviceName?: string | null;
	platform: string;
	fcmToken: string;
	appVersion?: string | null;
	isActive: boolean;
	createdAt: string;
	updatedAt: string;
	lastUsedAt?: string | null;
	revokedAt?: string | null;
	pushToken?: string | null;
	credentialId?: string | null;
	lastTokenRefresh?: string | null;
}

export interface NotificationPreferences {
	id: string;
	userId: string;
	email: boolean;
	inApp: boolean;
	push: boolean;
	pushTaskMatches: boolean;
	pushBidUpdates: boolean;
	pushMessages: boolean;
	pushPayments: boolean;
	pushSystemUpdates: boolean;
	createdAt: string;
	updatedAt: string;
}

export interface OperationResult {
	success: boolean;
	message: string;
}

export interface SendNotificationInput {
	title: string;
	body: string;
	deviceId?: string;
	type?: string;
}

export interface SendNotificationToDeviceInput {
	title: string;
	body: string;
	deviceId: string;
	type?: string;
	icon?: string;
	clickAction?: string;
}

export interface SendNotificationToDeviceResult {
	deviceId: string;
	success: boolean;
	error: string | null;
	npub: string;
}

export interface SendNotificationToNpubsInput {
	title: string;
	body: string;
	npubs: string[];
	type?: string;
	icon?: string;
	clickAction?: string;
}

export interface SendNotificationToNpubsResult {
	overallSuccess: boolean;
	message: string;
	totalTargets: number;
	successfulTargets: number;
	totalDevices: number;
	successfulDevices: number;
	results: Array<{
		npub: string;
		success: boolean;
		error: string | null;
		deviceCount: number;
		successfulDevices: number;
	}>;
}

export interface TopicInput {
	topic: string;
}

// ─── Notification Center Types ─────────────────────────────────

export type NotificationCategory =
	| 'contract'
	| 'bid'
	| 'message'
	| 'payment'
	| 'task'
	| 'review'
	| 'security'
	| 'system'
	| 'wallet'
	| 'service'
	| 'discovery'
	| 'reengagement'
	| 'account';

export type NotificationPriority = 'NORMAL' | 'HIGH' | 'URGENT';

export interface NotificationCenterItem {
	id: string;
	recipientNpub: string;
	type: string;
	title: string;
	body: string;
	isRead: boolean;
	priority: NotificationPriority;
	data: NotificationData | null;
	dedupeKey: string;
	readAt: string | null;
	pushSentAt: string | null;
	dismissedAt: string | null;
	expiresAt: string | null;
	createdAt: string;
	updatedAt: string;
	userId: number | null;
}

export interface NotificationData {
	deepLink?: string;
	senderName?: string;
	senderNpub?: string;
	taskId?: string;
	taskTitle?: string;
	contractId?: string;
	escrowId?: string;
	amount?: string;
	currency?: string;
	[key: string]: unknown;
}

export interface NotificationCenterListResponse {
	items: NotificationCenterItem[];
	total: number;
	page: number;
	limit: number;
	totalPages: number;
}

export interface NotificationUnreadCountResponse {
	count: number;
}

export interface NotificationMarkAllReadResponse {
	updatedCount: number;
}

export interface NotificationDeleteManyResponse {
	deletedCount: number;
}

export interface NotificationFilters {
	page: number;
	limit: number;
	read?: boolean;
	type?: string;
}

export interface NotificationPreferencesExtended {
	id: string;
	npub: string;
	userId: number | null;
	pushEnabled: boolean;
	emailEnabled: boolean;
	quietHoursEnabled: boolean;
	quietHoursStart: string;
	quietHoursEnd: string;
	contractUpdates: boolean;
	bidUpdates: boolean;
	taskMatches: boolean;
	taskMatchFrequency: string;
	messageNotifications: boolean;
	messagePreview: boolean;
	reviewNotifications: boolean;
	discoveryNotifications: boolean;
	reengagementNotifications: boolean;
	securityAlerts: boolean;
	walletNotifications: boolean;
	serviceNotifications: boolean;
	createdAt: string;
	updatedAt: string;
}

export interface EnrichmentRequest {
	action: string;
	escrowId?: string;
	bidEventId?: string;
	taskId?: string;
	estimatedStartTime?: number;
	estimatedCompletionTime?: number;
	timelockDuration?: number;
	amount?: string;
	taskTitle?: string;
	taskDeadline?: number;
	responseDeadline?: number;
}

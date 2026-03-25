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

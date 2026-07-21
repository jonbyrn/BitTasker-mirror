/**
 * API Endpoints
 *
 * This file contains all API endpoint definitions used throughout the app.
 * Always reference these constants instead of hardcoding URLs in your components.
 */

// Base route segments
const API_PATH = '/api';
const API_VERSION = 'v1';
const AUTH = 'auth';
const NOTIFICATIONS = 'notifications';

// Full endpoint paths
export const ENDPOINTS = {
	// Auth endpoints
	AUTH: {
		NOSTR_CHALLENGE: `${API_PATH}/${API_VERSION}/${AUTH}/challenge`,
		REGISTER: `${API_PATH}/${API_VERSION}/${AUTH}/register`,
		PASSKEY_LOGIN: `${API_PATH}/${API_VERSION}/${AUTH}/login/passkey`,
		NOSTR_LOGIN: `${API_PATH}/${API_VERSION}/${AUTH}/login/nostr`,
		ENCRYPTED_NOSTR_DATA: `${API_PATH}/${API_VERSION}/${AUTH}/login/nostr/encrypted-data`,
		ENCRYPTED_PASSKEY_DATA: `${API_PATH}/${API_VERSION}/${AUTH}/login/passkey/encrypted-data`,
		ACCOUNT_RECOVERY_KEY: `${API_PATH}/${API_VERSION}/${AUTH}/recovery/setup`,
		NOSTR_RECOVERY_VERIFY: `${API_PATH}/${API_VERSION}/${AUTH}/recover/nostr/verify`,
		NOSTR_RECOVERY_COMPLETE: `${API_PATH}/${API_VERSION}/${AUTH}/recover/nostr/complete`,
		NOSTR_RECOVERY_INITIATE: `${API_PATH}/${API_VERSION}/${AUTH}/recover/nostr/initiate`,
		EMAIL_VERIFICATION: `${API_PATH}/${API_VERSION}/${AUTH}/verification/verify-email`,
		VERIFY_TURNSTILE: `${API_PATH}/${API_VERSION}/${AUTH}/verify-turnstile`,
		CHECK_USERNAME: `${API_PATH}/${API_VERSION}/${AUTH}/username/check`,
		MIGRATE_AUTH: `${API_PATH}/${API_VERSION}/${AUTH}/migrate`,
		DELETE_ACCOUNT: `${API_PATH}/${API_VERSION}/${AUTH}/account`,
		REFRESH: `${API_PATH}/${API_VERSION}/${AUTH}/refresh`,
		LOGOUT: `${API_PATH}/${API_VERSION}/${AUTH}/logout`,
		LANGUAGE: `${API_PATH}/${API_VERSION}/${AUTH}/language`
	},

	// Upload endpoints
	UPLOADS: {
		SINGLE: `${API_PATH}/${API_VERSION}/uploads/single`,
		MULTIPLE: `${API_PATH}/${API_VERSION}/uploads/multiple`,
		DELETE: (key: string) => `${API_PATH}/${API_VERSION}/uploads/${key}`
	},

	// Notifications endpoints
	NOTIFICATIONS: {
		DEVICES: `${API_PATH}/${API_VERSION}/${NOTIFICATIONS}/devices`,
		DEVICE: (deviceId: string) => `${API_PATH}/${API_VERSION}/${NOTIFICATIONS}/devices/${deviceId}`,
		DEVICE_ACTIVITY: (deviceId: string) =>
			`${API_PATH}/${API_VERSION}/${NOTIFICATIONS}/devices/${deviceId}/activity`,
		PREFERENCES: `${API_PATH}/${API_VERSION}/${NOTIFICATIONS}/preferences`,
		SEND: `${API_PATH}/${API_VERSION}/${NOTIFICATIONS}/send`,
		SEND_TO_DEVICE: `${API_PATH}/${API_VERSION}/${NOTIFICATIONS}/send/device`,
		SEND_TO_NPUBS: `${API_PATH}/${API_VERSION}/${NOTIFICATIONS}/send/npubs`,
		SUBSCRIBE_TO_TOPIC: `${API_PATH}/${API_VERSION}/${NOTIFICATIONS}/topics/subscribe`,
		UNSUBSCRIBE_FROM_TOPIC: `${API_PATH}/${API_VERSION}/${NOTIFICATIONS}/topics/unsubscribe`
	},

	NOSTR: {
		EVENTS: `${API_PATH}/${API_VERSION}/events`,
		EVENTS_BY_ID: (id: string) => `${API_PATH}/${API_VERSION}/events/${id}`,
		EVENTS_REQUEST: `${API_PATH}/${API_VERSION}/events/request`,
		WOT_TRUSTED: (pubkey: string) => `${API_PATH}/${API_VERSION}/wot/trusted/${pubkey}`,
		NIP05: `${API_PATH}/${API_VERSION}/nip-05`,
		NIP05_BY_NAME: (name: string) => `${API_PATH}/${API_VERSION}/nip-05/${name}`
	},

	SAVED_SEARCHES: {
		TRIGGER_CHECK: `${API_PATH}/${API_VERSION}/saved-searches/check-task`
	},

	TRANSLATION: {
		TRANSLATE: `${API_PATH}/${API_VERSION}/translate`
	},

	NOTIFICATION_CENTER: {
		LIST: `${API_PATH}/${API_VERSION}/notification-center`,
		UNREAD_COUNT: `${API_PATH}/${API_VERSION}/notification-center/unread-count`,
		MARK_READ: (id: string) => `${API_PATH}/${API_VERSION}/notification-center/${id}/read`,
		READ_ALL: `${API_PATH}/${API_VERSION}/notification-center/read-all`,
		DELETE: (id: string) => `${API_PATH}/${API_VERSION}/notification-center/${id}`,
		DELETE_MANY: `${API_PATH}/${API_VERSION}/notification-center`
	},

	NOTIFICATION_PREFERENCES: {
		GET: `${API_PATH}/${API_VERSION}/notification-preferences`,
		UPDATE: `${API_PATH}/${API_VERSION}/notification-preferences`
	},

	REMINDERS: {
		ENRICH: `${API_PATH}/${API_VERSION}/reminders/enrich`
	},

	// Gasless relay (ERC-4337 / EIP-7702)
	GASLESS: {
		RELAY: `${API_PATH}/${API_VERSION}/gasless/relay`,
		PREPARE: `${API_PATH}/${API_VERSION}/gasless/prepare`,
		SIMULATE: `${API_PATH}/${API_VERSION}/gasless/simulate`,
		ESTIMATE: `${API_PATH}/${API_VERSION}/gasless/estimate`,
		BALANCE: `${API_PATH}/${API_VERSION}/gasless/balance`,
		HEALTH: `${API_PATH}/${API_VERSION}/gasless/health`,
		CONFIG: `${API_PATH}/${API_VERSION}/gasless/config`
	}
};

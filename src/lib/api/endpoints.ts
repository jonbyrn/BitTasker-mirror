/**
 * Canonical API paths for the versioned NestJS backend.
 * Keep service calls in sync with controller routes through this object.
 */

const API_PREFIX = '/api/v1';

export const ENDPOINTS = {
	AUTH: {
		NOSTR_CHALLENGE: `${API_PREFIX}/auth/challenge`,
		REGISTER: `${API_PREFIX}/auth/register`,
		PASSKEY_LOGIN: `${API_PREFIX}/auth/login/passkey`,
		NOSTR_LOGIN: `${API_PREFIX}/auth/login/nostr`,
		ENCRYPTED_NOSTR_DATA: `${API_PREFIX}/auth/login/nostr/encrypted-data`,
		ENCRYPTED_PASSKEY_DATA: `${API_PREFIX}/auth/login/passkey/encrypted-data`,
		ACCOUNT_RECOVERY_KEY: `${API_PREFIX}/auth/recovery/setup`,
		NOSTR_RECOVERY_VERIFY: `${API_PREFIX}/auth/recover/nostr/verify`,
		NOSTR_RECOVERY_COMPLETE: `${API_PREFIX}/auth/recover/nostr/complete`,
		NOSTR_RECOVERY_INITIATE: `${API_PREFIX}/auth/recover/nostr/initiate`,
		EMAIL_VERIFICATION: `${API_PREFIX}/auth/verification/verify-email`,
		VERIFY_TURNSTILE: `${API_PREFIX}/auth/verify-turnstile`,
		CHECK_USERNAME: `${API_PREFIX}/auth/username/check`,
		DELETE_ACCOUNT: `${API_PREFIX}/auth/account`,
		REFRESH: `${API_PREFIX}/auth/refresh`,
		LOGOUT: `${API_PREFIX}/auth/logout`,
		LANGUAGE: `${API_PREFIX}/auth/language`
	},
	UPLOADS: {
		SINGLE: `${API_PREFIX}/uploads/single`,
		MULTIPLE: `${API_PREFIX}/uploads/multiple`,
		DELETE: (key: string) => `${API_PREFIX}/uploads/delete?key=${encodeURIComponent(key)}`
	},
	NOTIFICATIONS: {
		DEVICES: `${API_PREFIX}/notifications/devices`,
		DEVICE: (deviceId: string) =>
			`${API_PREFIX}/notifications/devices/${encodeURIComponent(deviceId)}`,
		DEVICE_ACTIVITY: (deviceId: string) =>
			`${API_PREFIX}/notifications/devices/${encodeURIComponent(deviceId)}/activity`,
		PREFERENCES: `${API_PREFIX}/notifications/preferences`,
		SEND: `${API_PREFIX}/notifications/send`,
		SEND_TO_DEVICE: `${API_PREFIX}/notifications/send/device`,
		SEND_TO_NPUBS: `${API_PREFIX}/notifications/send/npubs`,
		SUBSCRIBE_TO_TOPIC: `${API_PREFIX}/notifications/topics/subscribe`,
		UNSUBSCRIBE_FROM_TOPIC: `${API_PREFIX}/notifications/topics/unsubscribe`
	},
	NOSTR: {
		EVENTS: `${API_PREFIX}/events`,
		EVENTS_BY_ID: (id: string) => `${API_PREFIX}/events/${encodeURIComponent(id)}`,
		EVENTS_REQUEST: `${API_PREFIX}/events/request`,
		WOT_TRUSTED: (pubkey: string) => `${API_PREFIX}/wot/trusted/${encodeURIComponent(pubkey)}`,
		NIP05: `${API_PREFIX}/nip-05`,
		NIP05_BY_NAME: (name: string) => `${API_PREFIX}/nip-05/${encodeURIComponent(name)}`
	},
	SAVED_SEARCHES: {
		TRIGGER_CHECK: `${API_PREFIX}/saved-searches/check-task`
	},
	TRANSLATION: {
		TRANSLATE: `${API_PREFIX}/translate`
	},
	NOTIFICATION_CENTER: {
		LIST: `${API_PREFIX}/notification-center`,
		UNREAD_COUNT: `${API_PREFIX}/notification-center/unread-count`,
		MARK_READ: (id: string) => `${API_PREFIX}/notification-center/${encodeURIComponent(id)}/read`,
		READ_ALL: `${API_PREFIX}/notification-center/read-all`,
		DELETE: (id: string) => `${API_PREFIX}/notification-center/${encodeURIComponent(id)}`,
		DELETE_MANY: `${API_PREFIX}/notification-center`
	},
	NOTIFICATION_PREFERENCES: {
		GET: `${API_PREFIX}/notification-preferences`,
		UPDATE: `${API_PREFIX}/notification-preferences`
	},
	REMINDERS: {
		ENRICH: `${API_PREFIX}/reminders/enrich`
	}
} as const;

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
const LOCATION = 'location';
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
		ONBOARDING_STATUS: `${API_PATH}/${API_VERSION}/${AUTH}/onboarding/status`,
		CHECK_USERNAME: `${API_PATH}/${API_VERSION}/${AUTH}/username/check`,
		MIGRATE_AUTH: `${API_PATH}/${API_VERSION}/${AUTH}/migrate`,
	},

	// Upload endpoints
	UPLOADS: {
		SINGLE: `${API_PATH}/${API_VERSION}/uploads/single`,
		MULTIPLE: `${API_PATH}/${API_VERSION}/uploads/multiple`,
		DELETE: (key: string) => `${API_PATH}/${API_VERSION}/uploads/${key}`
	},

	// Location endpoints
	LOCATION: {
		SEARCH: `${API_PATH}/${API_VERSION}/${LOCATION}/search`,
		REVERSE_GEOCODE: `${API_PATH}/${API_VERSION}/${LOCATION}/reverse-geocode`
	},

	// Notifications endpoints
	NOTIFICATIONS: {
		REGISTER: `${API_PATH}/${API_VERSION}/${NOTIFICATIONS}/register`,
		UNREGISTER: `${API_PATH}/${API_VERSION}/${NOTIFICATIONS}/unregister`
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
		TRIGGER_CHECK: `${API_PATH}/${API_VERSION}/saved-searches/check-task`,
	}
};

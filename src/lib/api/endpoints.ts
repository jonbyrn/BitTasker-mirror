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
const TASKS = 'tasks';
const BIDS = 'bid';
const TASK_TEMPLATES = 'task-templates';
const SERVICE_PACKAGES = 'service-packages';
const SAVED_SEARCHES = 'saved-searches';
const RECOMMENDATIONS = 'recommendations';
const LOCATION = 'location';
const NOTIFICATIONS = 'notifications';
const USER_HISTORY = 'user-history';

// Full endpoint paths
export const ENDPOINTS = {
	// User history endpoints
	USER_HISTORY: {
		RECENTLY_VIEWED: `${API_PATH}/${API_VERSION}/${USER_HISTORY}/recently-viewed`,
		INTERACTION_STATS: `${API_PATH}/${API_VERSION}/${USER_HISTORY}/interaction-stats`,
		ENGAGED_TASKS: `${API_PATH}/${API_VERSION}/${USER_HISTORY}/engaged-tasks`,
		RECORD_VIEW: `${API_PATH}/${API_VERSION}/${USER_HISTORY}/record-view`
	},

	// Auth endpoints
	AUTH: {
		ONBOARDING: `${API_PATH}/${API_VERSION}/${AUTH}/onboarding`,
		LOGIN: `${API_PATH}/${API_VERSION}/${AUTH}/login`,
		REFRESH_TOKEN: `${API_PATH}/${API_VERSION}/${AUTH}/refresh-token`,
		NOSTR_LOGIN: `${API_PATH}/${API_VERSION}/${AUTH}/nostr/login`,
		NOSTR_CHALLENGE: `${API_PATH}/${API_VERSION}/${AUTH}/nostr/challenge`,
		CHECK_REGISTRATION: `${API_PATH}/${API_VERSION}/${AUTH}/check-registration`,
		REGISTER_NOSTR: `${API_PATH}/${API_VERSION}/${AUTH}/register/nostr`,
		REGISTER_MASTER_KEY: `${API_PATH}/${API_VERSION}/${AUTH}/register/master-key`,
		GOOGLE_LOGIN: `${API_PATH}/${API_VERSION}/${AUTH}/google/login`,
		FACEBOOK_LOGIN: `${API_PATH}/${API_VERSION}/${AUTH}/facebook/login`,
		ENCRYPTED_KEY: `${API_PATH}/${API_VERSION}/${AUTH}/encrypted-key`,
		MASTER_KEY_ENCRYPTED_DATA: `${API_PATH}/${API_VERSION}/${AUTH}/encrypted-master-key`,
		MIGRATE_TO_MASTER_KEY: `${API_PATH}/${API_VERSION}/${AUTH}/migrate/master-key`,
		REGISTER_PASSKEY: `${API_PATH}/${API_VERSION}/${AUTH}/register/passkey-device`,
		PASSKEY_LOGIN: `${API_PATH}/${API_VERSION}/${AUTH}/login/passkey`,
		REVOKE_DEVICE: `${API_PATH}/${API_VERSION}/${AUTH}/revoke-device`,
		ACCOUNT_RECOVERY_KEY: `${API_PATH}/${API_VERSION}/${AUTH}/update/nostr/recovery-key`,
		NOSTR_RECOVERY_INITIATE: `${API_PATH}/${API_VERSION}/${AUTH}/recover/nostr/initiate`,
		NOSTR_RECOVERY_COMPLETE: `${API_PATH}/${API_VERSION}/${AUTH}/recover/nostr/complete`,
		NOSTR_RECOVERY_DATA: (npub: string) =>
			`${API_PATH}/${API_VERSION}/${AUTH}/recover/nostr/${npub}`,
		EMAIL_VERIFICATION: `${API_PATH}/${API_VERSION}/${AUTH}/verification/verify-email`,
		RECOVERY_EMAIL_VERIFICATION: `${API_PATH}/${API_VERSION}/${AUTH}/recover/verify-email`,
		INVALIDATE_ALL_DEVICES: `${API_PATH}/${API_VERSION}/${AUTH}/invalidate-all-devices`
	},

	// Task endpoints
	TASKS: {
		LIST: `${API_PATH}/${API_VERSION}/${TASKS}`,
		DETAILS: (taskId: string) => `${API_PATH}/${API_VERSION}/${TASKS}/${taskId}`,
		CREATE: `${API_PATH}/${API_VERSION}/${TASKS}`,
		UPDATE: (taskId: string) => `${API_PATH}/${API_VERSION}/${TASKS}/${taskId}`,
		DELETE: (taskId: string) => `${API_PATH}/${API_VERSION}/${TASKS}/${taskId}`,
		MYTASKS: `${API_PATH}/${API_VERSION}/${TASKS}/my-tasks`,
		SEARCH: `${API_PATH}/${API_VERSION}/${TASKS}/search`,
		STATUS: (taskId: string) => `${API_PATH}/${API_VERSION}/${TASKS}/${taskId}/status`
	},

	// Bid endpoints
	BIDS: {
		GET: `${API_PATH}/${API_VERSION}/${BIDS}`,
		CREATE: `${API_PATH}/${API_VERSION}/${BIDS}`,
		UPDATE: (bidId: string) => `${API_PATH}/${API_VERSION}/${BIDS}/${bidId}`,
		WITHDRAW: (bidId: string) => `${API_PATH}/${API_VERSION}/${BIDS}/${bidId}/withdraw`,
		DELETE: (bidId: string) => `${API_PATH}/${API_VERSION}/${BIDS}/${bidId}`,
		ACCEPT: (bidId: string) => `${API_PATH}/${API_VERSION}/${BIDS}/${bidId}/accept`,
		REJECT: (bidId: string) => `${API_PATH}/${API_VERSION}/${BIDS}/${bidId}/reject`
	},

	// Upload endpoints
	UPLOADS: {
		SINGLE: `${API_PATH}/${API_VERSION}/uploads/single`,
		MULTIPLE: `${API_PATH}/${API_VERSION}/uploads/multiple`,
		DELETE: (key: string) => `${API_PATH}/${API_VERSION}/uploads/${key}`
	},

	// Task Templates endpoints
	TASK_TEMPLATES: {
		POST: `${API_PATH}/${API_VERSION}/${TASK_TEMPLATES}`,
		GET: `${API_PATH}/${API_VERSION}/${TASK_TEMPLATES}`,
		GET_BY_ID: (id: string) => `${API_PATH}/${API_VERSION}/${TASK_TEMPLATES}/${id}`,
		UPDATE: (id: string) => `${API_PATH}/${API_VERSION}/${TASK_TEMPLATES}/${id}`,
		DELETE: (id: string) => `${API_PATH}/${API_VERSION}/${TASK_TEMPLATES}/${id}`
	},

	// Service Packages endpoints
	SERVICE_PACKAGES: {
		POST: `${API_PATH}/${API_VERSION}/${SERVICE_PACKAGES}`,
		GET: `${API_PATH}/${API_VERSION}/${SERVICE_PACKAGES}`, // get all user packages
		GET_PUBLIC: `${API_PATH}/${API_VERSION}/${SERVICE_PACKAGES}/public`, // get all public packages
		GET_BY_ID: (id: string) => `${API_PATH}/${API_VERSION}/${SERVICE_PACKAGES}/${id}`, // get services package by id
		UPDATE: (id: string) => `${API_PATH}/${API_VERSION}/${SERVICE_PACKAGES}/${id}`,
		DELETE: (id: string) => `${API_PATH}/${API_VERSION}/${SERVICE_PACKAGES}/${id}`,
		PURCHASE_PACKAGE: (id: string) =>
			`${API_PATH}/${API_VERSION}/${SERVICE_PACKAGES}/${id}/purchase`
	},

	// Saved Searches endpoints
	SAVED_SEARCHES: {
		CREATE: `${API_PATH}/${API_VERSION}/${SAVED_SEARCHES}`,
		LIST: `${API_PATH}/${API_VERSION}/${SAVED_SEARCHES}`,
		DETAILS: (id: string) => `${API_PATH}/${API_VERSION}/${SAVED_SEARCHES}/${id}`,
		UPDATE: (id: string) => `${API_PATH}/${API_VERSION}/${SAVED_SEARCHES}/${id}`,
		DELETE: (id: string) => `${API_PATH}/${API_VERSION}/${SAVED_SEARCHES}/${id}`,
		NOTIFICATIONS: (id: string) =>
			`${API_PATH}/${API_VERSION}/${SAVED_SEARCHES}/${id}/notifications`,
		MARK_AS_READ: (id: string) => `${API_PATH}/${API_VERSION}/${SAVED_SEARCHES}/${id}/mark-as-read`
	},

	// Recommendations endpoints
	RECOMMENDATIONS: {
		LIST: `${API_PATH}/${API_VERSION}/${RECOMMENDATIONS}`,
		GENERATE: `${API_PATH}/${API_VERSION}/${RECOMMENDATIONS}/generate`,
		MARK_VIEWED: `${API_PATH}/${API_VERSION}/${RECOMMENDATIONS}/mark-viewed`,
		FEEDBACK: `${API_PATH}/${API_VERSION}/${RECOMMENDATIONS}/feedback`
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
	}
};

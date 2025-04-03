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
const USERS = 'users';
const TASKS = 'tasks';
const BIDS = 'bid';
const ADMIN = 'admin';
// const PAYMENTS = 'payments';
// const MESSAGES = 'messages';

// Full endpoint paths
export const ENDPOINTS = {
	// Auth endpoints
	AUTH: {
		ONBOARDING: `${API_PATH}/${API_VERSION}/${AUTH}/onboarding`,
		LOGIN: `${API_PATH}/${API_VERSION}/${AUTH}/login`,
		LOGOUT: `${API_PATH}/${API_VERSION}/${AUTH}/logout`,
		REFRESH_TOKEN: `${API_PATH}/${API_VERSION}/${AUTH}/refresh-token`,
		NOSTR_LOGIN: `${API_PATH}/${API_VERSION}/${AUTH}/nostr/login`,
		NOSTR_CHALLENGE: `${API_PATH}/${API_VERSION}/${AUTH}/nostr/challenge`,
		CHECK_REGISTRATION: `${API_PATH}/${API_VERSION}/${AUTH}/check-registration`,
		REGISTER_NOSTR: `${API_PATH}/${API_VERSION}/${AUTH}/register/nostr`,
		GOOGLE_LOGIN: `${API_PATH}/${API_VERSION}/${AUTH}/google/login`,
		FACEBOOK_LOGIN: `${API_PATH}/${API_VERSION}/${AUTH}/facebook/login`,
		ENCRYPTED_KEY: `${API_PATH}/${API_VERSION}/${AUTH}/encrypted-key`,
		REGISTER_PASSKEY: `${API_PATH}/${API_VERSION}/${AUTH}/register/passkey-device`,
		PASSKEY_LOGIN: `${API_PATH}/${API_VERSION}/${AUTH}/login/passkey`,
		REVOKE_DEVICE: `${API_PATH}/${API_VERSION}/${AUTH}/revoke-device`
	},

	// User endpoints
	USERS: {
		ME: `${API_PATH}/${API_VERSION}/${USERS}/me`,
		PROFILE: `${API_PATH}/${API_VERSION}/${USERS}/profile`,
		SETTINGS: `${API_PATH}/${API_VERSION}/${USERS}/settings`
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
		CREATE: `${API_PATH}/${API_VERSION}/${BIDS}`,
		UPDATE: `${API_PATH}/${API_VERSION}/${BIDS}`,
		WITHDRAW: (bidId: string) => `${API_PATH}/${API_VERSION}/${BIDS}/${bidId}/withdraw`
	},

	// Admin endpoints
	ADMIN: {
		SKILLS: `${API_PATH}/${API_VERSION}/${ADMIN}/skills`,
		CATEGORIES: `${API_PATH}/${API_VERSION}/${ADMIN}/categories`
	}

	// Add more endpoint categories as needed
};

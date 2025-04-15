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
const TASK_TEMPLATES = 'task-templates';
const SERVICE_PACKAGES = 'service-packages';
const SAVED_SEARCHES = 'saved-searches';
const RECOMMENDATIONS = 'recommendations';
const LOCATION = 'location';

// Full endpoint paths
export const ENDPOINTS = {
	// Auth endpoints
	AUTH: {
		ONBOARDING: `${API_PATH}/${API_VERSION}/${AUTH}/onboarding`,
		LOGIN: `${API_PATH}/${API_VERSION}/${AUTH}/login`,
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
		REVOKE_DEVICE: `${API_PATH}/${API_VERSION}/${AUTH}/revoke-device`,
		ACCOUNT_RECOVERY_KEY: `${API_PATH}/${API_VERSION}/${AUTH}/update/nostr/recovery-key`,
		NOSTR_RECOVERY_INITIATE: `${API_PATH}/${API_VERSION}/${AUTH}/recover/nostr/initiate`,
		NOSTR_RECOVERY_COMPLETE: `${API_PATH}/${API_VERSION}/${AUTH}/recover/nostr/complete`,
		NOSTR_RECOVERY_DATA: (npub: string) =>
			`${API_PATH}/${API_VERSION}/${AUTH}/recover/nostr/${npub}`,
		EMAIL_VERIFICATION: `${API_PATH}/${API_VERSION}/${AUTH}/verification/verify-email`
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
		GET: `${API_PATH}/${API_VERSION}/${BIDS}`,
		CREATE: `${API_PATH}/${API_VERSION}/${BIDS}`,
		UPDATE: (bidId: string) => `${API_PATH}/${API_VERSION}/${BIDS}/${bidId}`,
		WITHDRAW: (bidId: string) => `${API_PATH}/${API_VERSION}/${BIDS}/${bidId}/withdraw`,
		DELETE: (bidId: string) => `${API_PATH}/${API_VERSION}/${BIDS}/${bidId}`
	},

	// Admin endpoints
	ADMIN: {
		SKILLS: `${API_PATH}/${API_VERSION}/${ADMIN}/skills`,
		CATEGORIES: `${API_PATH}/${API_VERSION}/${ADMIN}/categories`
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

	// Wallet endpoints
	WALLET: {
		BITCOIN: {
			GET: `${API_PATH}/${API_VERSION}/bitcoin`,
			CREATE: `${API_PATH}/${API_VERSION}/bitcoin/wallet`,
			ADDRESS: `${API_PATH}/${API_VERSION}/bitcoin/wallet/address`,
			BALANCE: `${API_PATH}/${API_VERSION}/bitcoin/wallet/balance`,
			BALANCES: `${API_PATH}/${API_VERSION}/bitcoin/balances`,
			ADDRESS_BALANCE: (address: string) => `${API_PATH}/${API_VERSION}/bitcoin/address/${address}/balance`,
			ADDRESS_TRANSACTIONS: (address: string, limit?: number) => `${API_PATH}/${API_VERSION}/bitcoin/address/${address}/transactions?${limit ? `limit=${limit}` : ''}`,
			FEES: `${API_PATH}/${API_VERSION}/bitcoin/fees`,
			WHITELIST: `${API_PATH}/${API_VERSION}/bitcoin/whitelist`,
			CONVERT: `${API_PATH}/${API_VERSION}/bitcoin/convert`,
			PRICE: `${API_PATH}/${API_VERSION}/bitcoin/price`,
			TRANSACTIONS: `${API_PATH}/${API_VERSION}/bitcoin/transactions`, // NOT AVAILABLE
			SEND: `${API_PATH}/${API_VERSION}/bitcoin/send`, // NOT AVAILABLE
			VALIDATE: `${API_PATH}/${API_VERSION}/bitcoin/validate` // NOT AVAILABLE
		},
		LIGHTNING: {
			INVOICE: `${API_PATH}/${API_VERSION}/lightning/invoice`, // NOT AVAILABLE
			PAY: `${API_PATH}/${API_VERSION}/lightning/pay`, // NOT AVAILABLE
			CONNECT: `${API_PATH}/${API_VERSION}/lightning/connect`, // NOT AVAILABLE
			TRANSACTIONS: `${API_PATH}/${API_VERSION}/lightning/transactions` // NOT AVAILABLE
		},
		LIQUID: {
			ADDRESS: `${API_PATH}/${API_VERSION}/liquid/address`, // NOT AVAILABLE
			BALANCE: `${API_PATH}/${API_VERSION}/liquid/balance`, // NOT AVAILABLE
			SEND: `${API_PATH}/${API_VERSION}/liquid/send`, // NOT AVAILABLE
			ESCROW: `${API_PATH}/${API_VERSION}/liquid/escrow`, // NOT AVAILABLE
			ASSETS: `${API_PATH}/${API_VERSION}/liquid/assets` // NOT AVAILABLE
		}
	}
};

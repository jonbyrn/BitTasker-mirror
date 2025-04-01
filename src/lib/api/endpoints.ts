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
// const PAYMENTS = 'payments';
// const MESSAGES = 'messages';

// Full endpoint paths
export const ENDPOINTS = {
	// Auth endpoints
	AUTH: {
		ONBOARDING: `${API_PATH}/${API_VERSION}/${AUTH}/onboarding`,
		LOGIN: `${API_PATH}/${API_VERSION}/${AUTH}/login`,
		LOGOUT: `${API_PATH}/${API_VERSION}/${AUTH}/logout`,
		REFRESH_TOKEN: `${API_PATH}/${API_VERSION}/${AUTH}/refresh-token`
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
		DELETE: (taskId: string) => `${API_PATH}/${API_VERSION}/${TASKS}/${taskId}`
	}

	// Add more endpoint categories as needed
};

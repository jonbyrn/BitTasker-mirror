/**
 * Storage keys for Capacitor Preferences and localStorage
 * Keep all storage keys centralized here to avoid duplication and typos
 */
export const StorageKeys = {
	// Tasks
	DRAFT_TASK: 'bittasker_draft_task',
	DRAFT_TASK_EDIT: 'bittasker_draft_task_edit',
	TASK_FILTERS: 'bittasker_task_filters',

	// User preferences
	ONBOARDING_COMPLETED: 'onboardingCompleted',
	LANGUAGE_PREFERENCE_KEY: 'user_language',
	THEME: 'darkMode',

	// Auth
	ACCESS_TOKEN: 'access_token',
	REFRESH_TOKEN: 'refresh_token',

	// WebAuthn
	WEB_AUTHN_CREDENTIAL_ID: 'webAuthnCredentialId',

	// App state
	LAST_SYNC: 'bittasker_last_sync',
	APP_VERSION: 'bittasker_app_version',
	DEVICE_UNIQUE_ID: 'device_unique_id',
	WARNING_ACKNOWLEDGED: 'bittasker_warning_acknowledged',

	NPUB: 'npub',
	AUTH_METHOD: 'auth_method', // alby | passkey | biometrics

	// Translation
	TRANSLATION_CACHE: 'bittasker_translation_cache',
	TRANSLATION_PREFERENCES: 'bittasker_translation_preferences',
	TRANSLATION_MSG_CACHE: 'bittasker_translation_msg_cache'
} as const;

// Type to get autocomplete for storage keys
export type StorageKey = keyof typeof StorageKeys;

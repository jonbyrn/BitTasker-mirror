/**
 * Storage keys for Capacitor Preferences and localStorage
 * Keep all storage keys centralized here to avoid duplication and typos
 */
export const StorageKeys = {
	// Tasks
	DRAFT_TASK: 'bittasker_draft_task',
	DRAFT_TASK_EDIT: 'bittasker_draft_task_edit',
	TASK_FILTERS: 'bittasker_task_filters',

	// Services
	DRAFT_SERVICE: 'bittasker_service_draft',
	DRAFT_SERVICE_EDIT: 'bittasker_service_edit_draft',
	SERVICE_FILTERS: 'bittasker_service_filters',
	SERVICE_SEARCH_FILTERS: 'bittasker_service_search_filters',

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
	USER_PROFILE: 'user_profile',

	// Translation
	TRANSLATION_CACHE: 'bittasker_translation_cache',
	TRANSLATION_PREFERENCES: 'bittasker_translation_preferences',
	TRANSLATION_MSG_CACHE: 'bittasker_translation_msg_cache',

	// Deep link
	DEEP_LINK: 'bt_deeplink',

	// Wallet
	WALLET_CHAIN_SORT_HINTS: 'bittasker_wallet_chain_sort_hints',
	WALLET_LAST_BALANCE_SATS: 'bittasker_wallet_last_balance_sats',

	// Fiat swap / off-ramp orchestrators
	FIAT_SWAP_FLOW: 'bittasker_fiat_flow',
	OFF_RAMP_FLOW: 'bittasker_off_ramp_flow',

	// Reviews
	PENDING_REVIEW_BANNER_DISMISSED: 'pending_review_banner_dismissed',

	// Search
	DISMISSED_SAVE_SEARCH_PROMPTS: 'bittasker_dismissed_save_search_prompts',
	
	// E2E testing
	E2E_BIOMETRIC_DATA: 'e2e_biometric_data'
} as const;

// Type to get autocomplete for storage keys
export type StorageKey = keyof typeof StorageKeys;

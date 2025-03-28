/**
 * Storage keys for Capacitor Preferences and localStorage
 * Keep all storage keys centralized here to avoid duplication and typos
 */
export const StorageKeys = {
    // Tasks
    DRAFT_TASK: 'bittasker_draft_task',
    TASK_FILTERS: 'bittasker_task_filters',
    
    // User preferences
    THEME: 'bittasker_theme',
    LANGUAGE: 'bittasker_language',
    
    // Auth
    AUTH_TOKEN: 'bittasker_auth_token',
    REFRESH_TOKEN: 'bittasker_refresh_token',
    
    // App state
    LAST_SYNC: 'bittasker_last_sync',
    APP_VERSION: 'bittasker_app_version'
} as const;

// Type to get autocomplete for storage keys
export type StorageKey = keyof typeof StorageKeys;

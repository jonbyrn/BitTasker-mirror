/**
 * Analytics Store
 * 
 * Manages cookie consent, Analytics initialization state, and user preferences.
 * Handles GDPR compliance and provides reactive state for Analytics components.
 */

import { writable, derived, get } from 'svelte/store';
import { browser } from '$app/environment';
import { Capacitor } from '@capacitor/core';

// Types
export interface CookiePreferences {
	necessary: boolean;      // Always true - required cookies
	analytics: boolean;      // Google Analytics & Firebase Analytics
	marketing: boolean;      // Future marketing cookies
	personalization: boolean; // User preferences, themes
}

export interface AnalyticsState {
	initialized: boolean;
	consentGiven: boolean;
	consentDate: Date | null;
	preferences: CookiePreferences;
	bannerDismissed: boolean;
}

// Default preferences
const defaultPreferences: CookiePreferences = {
	necessary: true,
	analytics: false,
	marketing: false,
	personalization: true
};

const defaultState: AnalyticsState = {
	initialized: false,
	consentGiven: false,
	consentDate: null,
	preferences: defaultPreferences,
	bannerDismissed: false
};

// Storage keys
const CONSENT_STORAGE_KEY = 'bittasker_cookie_consent';
const PREFERENCES_STORAGE_KEY = 'bittasker_cookie_preferences';

// Core store
const analyticsState = writable<AnalyticsState>(defaultState);

// Helper function to get stored data
function getStoredData<T>(key: string, fallback: T): T {
	if (!browser) return fallback;
	
	try {
		const stored = localStorage.getItem(key);
		if (stored) {
			const parsed = JSON.parse(stored);
			// Ensure date objects are properly restored
			if (key === CONSENT_STORAGE_KEY && parsed.consentDate) {
				parsed.consentDate = new Date(parsed.consentDate);
			}
			return { ...fallback, ...parsed };
		}
	} catch (error) {
		console.warn(`Failed to parse stored data for ${key}:`, error);
	}
	
	return fallback;
}

// Helper function to store data
function storeData(key: string, data: any): void {
	if (!browser) return;
	
	try {
		localStorage.setItem(key, JSON.stringify(data));
	} catch (error) {
		console.error(`Failed to store data for ${key}:`, error);
	}
}

// Initialize store from localStorage
if (browser) {
	const storedState = getStoredData(CONSENT_STORAGE_KEY, defaultState);
	const storedPreferences = getStoredData(PREFERENCES_STORAGE_KEY, defaultPreferences);
	
	analyticsState.set({
		...storedState,
		preferences: storedPreferences
	});
}

// Derived stores for easy access
export const isAnalyticsEnabled = derived(
	analyticsState,
	($state) => $state.consentGiven && $state.preferences.analytics
);

export const shouldShowBanner = derived(
	analyticsState,
	($state) => !$state.consentGiven && !$state.bannerDismissed
);

export const isNativePlatform = browser ? Capacitor.isNativePlatform() : false;

// Store actions
export const analyticsStore = {
	// Subscribe to state changes
	subscribe: analyticsState.subscribe,

	// Get current state
	getState: () => get(analyticsState),

	// Initialize Analytics (call this on app startup)
	init: () => {
		analyticsState.update(state => ({
			...state,
			initialized: true
		}));
	},

	// Grant consent with preferences
	grantConsent: (preferences: Partial<CookiePreferences> = {}) => {
		const newPreferences: CookiePreferences = {
			...defaultPreferences,
			...preferences
		};

		const newState: AnalyticsState = {
			initialized: true,
			consentGiven: true,
			consentDate: new Date(),
			preferences: newPreferences,
			bannerDismissed: true
		};

		// Update store
		analyticsState.set(newState);

		// Persist to localStorage
		storeData(CONSENT_STORAGE_KEY, {
			consentGiven: newState.consentGiven,
			consentDate: newState.consentDate,
			bannerDismissed: newState.bannerDismissed
		});
		storeData(PREFERENCES_STORAGE_KEY, newPreferences);

		console.log('Cookie consent granted with preferences:', newPreferences);
	},

	// Revoke consent
	revokeConsent: () => {
		const newState: AnalyticsState = {
			...defaultState,
			initialized: true,
			bannerDismissed: false
		};

		analyticsState.set(newState);

		// Clear localStorage
		if (browser) {
			localStorage.removeItem(CONSENT_STORAGE_KEY);
			localStorage.removeItem(PREFERENCES_STORAGE_KEY);
		}

		console.log('Cookie consent revoked');
	},

	// Dismiss banner without granting consent (for "Later" button)
	dismissBanner: () => {
		analyticsState.update(state => ({
			...state,
			bannerDismissed: true
		}));

		storeData(CONSENT_STORAGE_KEY, {
			consentGiven: false,
			consentDate: null,
			bannerDismissed: true
		});

		console.log('Cookie banner dismissed');
	},

	// Update specific preferences (for settings page)
	updatePreferences: (preferences: Partial<CookiePreferences>) => {
		analyticsState.update(state => {
			const newPreferences = {
				...state.preferences,
				...preferences,
				necessary: true // Always keep necessary cookies enabled
			};

			const newState = {
				...state,
				preferences: newPreferences
			};

			storeData(PREFERENCES_STORAGE_KEY, newPreferences);
			return newState;
		});

		console.log('Cookie preferences updated:', preferences);
	},

	// Check if consent is needed (for GDPR regions)
	needsConsent: () => {
		const state = get(analyticsState);
		return !state.consentGiven && !state.bannerDismissed;
	},

	// Get analytics consent status specifically
	hasAnalyticsConsent: () => {
		const state = get(analyticsState);
		return state.consentGiven && state.preferences.analytics;
	},

	// For debugging - reset all data
	reset: () => {
		if (browser) {
			localStorage.removeItem(CONSENT_STORAGE_KEY);
			localStorage.removeItem(PREFERENCES_STORAGE_KEY);
		}
		analyticsState.set(defaultState);
		console.log('Analytics store reset');
	},

	// Get debug information
	getDebugInfo: () => {
		const state = get(analyticsState);
		return {
			...state,
			isNative: isNativePlatform,
			browserSupport: browser,
			storageAvailable: browser && typeof localStorage !== 'undefined'
		};
	}
};

// Export types
export type { CookiePreferences, AnalyticsState };
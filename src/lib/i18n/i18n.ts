import { addMessages, init, locale, getLocaleFromNavigator } from 'svelte-i18n';
import { browser } from '$app/environment';
import { writable } from 'svelte/store';
import { Preferences } from '@capacitor/preferences';

export const SUPPORTED_LANGUAGES = ['en', 'es'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

// Track loaded namespaces to avoid duplicate loads
const loadedNamespaces = new Map<string, Set<string>>();

// Ref count for loading state
let loadingCount = 0;
export const isI18nLoading = writable(false);

/**
 * Update loading state based on counter
 */
function updateLoadingState(delta: number) {
	loadingCount = Math.max(0, loadingCount + delta);
	isI18nLoading.set(loadingCount > 0);
}

// Lazy loading cache - Stores promises to collapse redundant requests
const translationCache = new Map<string, Promise<Record<string, unknown>>>();

/**
 * Fetch with timeout helper
 */
async function fetchWithTimeout(url: string, timeout = 5000): Promise<Response> {
	const controller = new AbortController();
	const id = setTimeout(() => controller.abort(), timeout);
	try {
		const response = await fetch(url, { signal: controller.signal });
		clearTimeout(id);
		return response;
	} catch (error) {
		clearTimeout(id);
		throw error;
	}
}

/**
 * Clear all caches (useful for testing and manual refresh)
 */
export function clearCache(): void {
	translationCache.clear();
	loadedNamespaces.clear();
	loadingCount = 0;
	isI18nLoading.set(false);
}

/**
 * Get the initial locale based on user preference
 */
const getInitialLocale = async (): Promise<SupportedLanguage> => {
	if (browser) {
		try {
			// Check Preferences first
			const storedLocale = await Preferences.get({ key: 'locale' });
			if (
				storedLocale.value &&
				SUPPORTED_LANGUAGES.includes(storedLocale.value as SupportedLanguage)
			) {
				return storedLocale.value as SupportedLanguage;
			}
		} catch (error) {
			console.warn('[i18n] Failed to load stored locale, falling back to browser defaults:', error);
		}

		// Fallback to browser locale
		const browserLocale = getLocaleFromNavigator();
		const lang = browserLocale?.split('-')[0];
		if (lang && SUPPORTED_LANGUAGES.includes(lang as SupportedLanguage)) {
			return lang as SupportedLanguage;
		}
	}
	return 'en'; // Default fallback
};

/**
 * Load a specific namespace for a locale
 */
export function loadNamespace(
	locale: SupportedLanguage,
	namespace: string
): Promise<Record<string, unknown>> {
	const cacheKey = `${locale}-${namespace}`;

	// Return existing promise if a fetch is already in progress or cached
	if (translationCache.has(cacheKey)) {
		return translationCache.get(cacheKey)!;
	}

	// Create and cache the fetch promise
	const fetchPromise = (async () => {
		try {
			// Fetch JSON as static asset with 5s timeout
			const response = await fetchWithTimeout(`/locales/${locale}/${namespace}.json`);
			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}
			const data = (await response.json()) as Record<string, unknown>;

			// Track loaded namespace
			if (!loadedNamespaces.has(locale)) {
				loadedNamespaces.set(locale, new Set());
			}
			loadedNamespaces.get(locale)!.add(namespace);

			// Add to svelte-i18n
			addMessages(locale, data);

			return data;
		} catch (error) {
			console.warn(`Failed to load namespace ${namespace} for locale ${locale}:`, error);
			// Remove failed promise from cache so it can be retried later
			translationCache.delete(cacheKey);
			return {};
		}
	})();

	translationCache.set(cacheKey, fetchPromise);
	return fetchPromise;
}

/**
 * Load multiple namespaces at once
 */
export async function loadNamespaces(
	locale: SupportedLanguage,
	namespaces: string[]
): Promise<void> {
	const loadPromises = namespaces.map((namespace) => loadNamespace(locale, namespace));
	await Promise.allSettled(loadPromises);
}

/**
 * Load essential translations for initial app render
 */
async function loadEssentialTranslations(currentLocale: SupportedLanguage): Promise<void> {
	// Only load critical translations needed for initial render
	const essentialNamespaces = ['home', 'common', 'notifications'];

	await loadNamespaces(currentLocale, essentialNamespaces);
}

/**
 * Map routes to required translation namespaces
 */
export function getNamespacesForRoute(route: string): string[] {
	const namespaces: string[] = [];

	if (route.includes('/tasks')) {
		namespaces.push(
			'common',
			'dashboard/dashboard',
			'dashboard/tasks/find',
			'dashboard/tasks/info',
			'dashboard/bids'
		);
		// Include wallet namespace for bid-related components
		namespaces.push('dashboard/wallet');
		// Include categories and recommendations for task discovery
		namespaces.push('dashboard/recomendations', 'categories');
	}
	// Dashboard routes
	if (route.includes('/dashboard')) {
		namespaces.push('dashboard/dashboard', 'dashboard/tasks/info');
		namespaces.push('dashboard/bids');
		// Always load wallet namespace for bid-related components that use wallet translations
		namespaces.push('dashboard/wallet');

		// Load notifications namespace for notification components
		namespaces.push('notifications');
		// Load contracts actions namespace for contract-related components
		namespaces.push('dashboard/contracts/actions');

		if (route.includes('/profile')) {
			namespaces.push(
				'dashboard/profile/profile',
				'dashboard/profile/personal',
				'dashboard/profile/availability'
			);
		}
		if (route.includes('/wallet')) {
			// Already included above
		}
		// Note: /find-tasks route redirects to /tasks, so this check is kept for backward compatibility
		// but /tasks route already loads all necessary namespaces above
		if (route.includes('/find-tasks')) {
			namespaces.push(
				'dashboard/tasks/find',
				'dashboard/recomendations',
				'dashboard/bids',
				'categories'
			);
		}
		if (route.includes('/create-task')) {
			namespaces.push('dashboard/tasks/create', 'categories');
		}

		if (route.includes('/messages')) {
			namespaces.push('dashboard/messages');
		}
		if (route.includes('/settings')) {
			namespaces.push('dashboard/settings');
		}
	}

	if (route.includes('/onboarding')) namespaces.push('onboarding');
	if (route.includes('/how-it-works')) namespaces.push('how_it_works');
	if (route.includes('/auth')) namespaces.push('auth');

	// Protected routes (routes that require authentication)
	if (route.includes('(protected)')) {
		namespaces.push('auth');
	}

	// Company pages (route groups don't show in URL, so check actual paths)
	if (route.includes('/about')) namespaces.push('company/about');
	if (route.includes('/careers')) namespaces.push('company/careers');
	if (route.includes('/secure-payments')) namespaces.push('company/secure-payments');
	if (route.includes('/contact')) namespaces.push('company/contact');
	if (route.includes('/security')) namespaces.push('company/security');
	if (route.includes('/privacy')) namespaces.push('company/privacy_policy');
	if (route.includes('/terms')) namespaces.push('company/terms');
	if (route.includes('/press')) namespaces.push('company/press');
	if (route.includes('/community-guidelines')) namespaces.push('taskees/guidelines');
	if (route.includes('/taskee-fees')) namespaces.push('taskees/fee');
	if (route.includes('/tasker-fees')) namespaces.push('taskers/fee');
	if (route.includes('/tasker-principles')) namespaces.push('taskees/principles');
	if (route.includes('/faq')) namespaces.push('taskees/faq');
	if (route.includes('/feedback')) namespaces.push('dashboard/feedback');
	if (route.includes('/dashboard/debug-smart-contract')) namespaces.push('debug');

	return namespaces;
}

/**
 * Load route-specific translations dynamically
 */
export async function loadRouteTranslations(
	route: string,
	currentLocale?: SupportedLanguage
): Promise<void> {
	if (!browser) return;

	const targetLocale = currentLocale || (await getInitialLocale());
	const namespaces = getNamespacesForRoute(route);

	if (namespaces.length > 0) {
		await loadNamespaces(targetLocale, namespaces);
	}
}

/**
 * Initialize i18n with minimal overhead
 */
export async function setupI18n(): Promise<void> {
	if (!browser) return console.warn('Not in client context');

	updateLoadingState(1);

	try {
		// Initialize svelte-i18n IMMEDIATELY with fallback
		// to ensure $t is available even during the storage/network microtasks
		init({
			fallbackLocale: 'en',
			initialLocale: 'en',
			loadingDelay: 200
		});

		const currentLocale = await getInitialLocale();

		// Update to the actual preferred locale
		locale.set(currentLocale);

		// Load essential translations in background
		await loadEssentialTranslations(currentLocale);

		// Set up locale persistence
		try {
			await Preferences.set({ key: 'locale', value: currentLocale });
		} catch (storageError) {
			console.warn('[i18n] Failed to persist locale preference:', storageError);
		}
	} catch (error) {
		console.error('Failed to setup i18n:', error);
	} finally {
		updateLoadingState(-1);
	}
}

/**
 * Switch language and load its essential translations
 */
export async function switchLanguage(newLocale: SupportedLanguage): Promise<void> {
	if (!browser) return;

	updateLoadingState(1);

	try {
		// Load essential translations for new locale
		await loadEssentialTranslations(newLocale);

		// Update locale
		locale.set(newLocale);

		// Persist the new locale
		try {
			await Preferences.set({ key: 'locale', value: newLocale });
		} catch (storageError) {
			console.warn('[i18n] Failed to persist locale change:', storageError);
		}

		// Load current route translations for new locale
		if (typeof window !== 'undefined') {
			await loadRouteTranslations(window.location.pathname, newLocale);
		}
	} catch (error) {
		console.error(`Failed to switch to locale ${newLocale}:`, error);
	} finally {
		updateLoadingState(-1);
	}
}

/**
 * Preload translations for better UX
 */
export function preloadTranslations(locale: SupportedLanguage, namespaces: string[]): void {
	if (!browser) return;

	// Use requestIdleCallback for non-blocking preload
	if ('requestIdleCallback' in window) {
		requestIdleCallback(
			() => {
				loadNamespaces(locale, namespaces);
			},
			{ timeout: 1000 }
		);
	} else {
		setTimeout(() => {
			loadNamespaces(locale, namespaces);
		}, 100);
	}
}

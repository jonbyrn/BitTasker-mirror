import { addMessages, init, locale, getLocaleFromNavigator } from 'svelte-i18n';
import { browser } from '$app/environment';
import { get, writable } from 'svelte/store';
import { Preferences } from '@capacitor/preferences';

export const SUPPORTED_LANGUAGES = ['en', 'es'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

// Track loaded namespaces to avoid duplicate loads
const loadedNamespaces = new Map<string, Set<string>>();

// Store for loading state
export const isI18nLoading = writable(false);

// Lazy loading cache
const translationCache = new Map<string, any>();

/**
 * Get the initial locale based on user preference
 */
const getInitialLocale = async (): Promise<SupportedLanguage> => {
	if (browser) {
		// Check Preferences first
		const storedLocale = await Preferences.get({ key: 'locale' });
		if (
			storedLocale.value &&
			SUPPORTED_LANGUAGES.includes(storedLocale.value as SupportedLanguage)
		) {
			return storedLocale.value as SupportedLanguage;
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
export async function loadNamespace(locale: SupportedLanguage, namespace: string): Promise<any> {
	const cacheKey = `${locale}-${namespace}`;

	// Return cached if available
	if (translationCache.has(cacheKey)) {
		return translationCache.get(cacheKey);
	}

	try {
		// Fetch JSON as static asset instead of dynamic import
		const response = await fetch(`/locales/${locale}/${namespace}.json`);
		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}
		const data = await response.json();

		// Cache the result
		translationCache.set(cacheKey, data);

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
		return {};
	}
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
	const essentialNamespaces = ['home', 'common'];

	await loadNamespaces(currentLocale, essentialNamespaces);
}

/**
 * Map routes to required translation namespaces
 */
export function getNamespacesForRoute(route: string): string[] {
	const namespaces: string[] = [];

	if(route.includes('/tasks')) {
		namespaces.push('dashboard/dashboard','dashboard/tasks/find','dashboard/bids');
		// Include wallet namespace for bid-related components
		namespaces.push('dashboard/wallet');
	}
	// Dashboard routes
	if (route.includes('/dashboard')) {
		namespaces.push('dashboard/dashboard', 'dashboard/tasks/info');
		namespaces.push('dashboard/bids');
		// Always load wallet namespace for bid-related components that use wallet translations
		namespaces.push('dashboard/wallet');

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
	if (route.includes('/find-tasks')) {
		namespaces.push('dashboard/tasks/find', 'dashboard/recomendations', 'dashboard/bids', 'categories');
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

	// Company pages (route groups don't show in URL, so check actual paths)
	if (route.includes('/about')) namespaces.push('company/about');
	if (route.includes('/careers')) namespaces.push('company/careers');
	if (route.includes('/contact')) namespaces.push('company/contact');
	if (route.includes('/security')) namespaces.push('company/security');
	if (route.includes('/privacy')) namespaces.push('company/privacy_policy');
	if (route.includes('/terms')) namespaces.push('company/terms');
	if (route.includes('/press')) namespaces.push('company/press');
	if (route.includes('/community-guidelines')) namespaces.push('taskees/guidelines');
	if (route.includes('/taskee-fees')) namespaces.push('taskees/fee');
	if (route.includes('/tasker-fees')) namespaces.push('taskers/fee');
	if (route.includes('/tasker-principles')) namespaces.push('taskees/principles');
	if (route.includes('/escrow')) namespaces.push('taskers/scrow');
	if (route.includes('/faq')) namespaces.push('taskees/faq');
	if (route.includes('/feedback')) namespaces.push('dashboard/feedback');

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

	isI18nLoading.set(true);

	try {
		const currentLocale = await getInitialLocale();

		// Load only essential translations
		await loadEssentialTranslations(currentLocale);

		// Initialize svelte-i18n
		init({
			fallbackLocale: 'en',
			initialLocale: currentLocale,
			loadingDelay: 200
		});

		// Set up locale persistence
		await Preferences.set({ key: 'locale', value: get(locale) || 'en' });
	} catch (error) {
		console.error('Failed to setup i18n:', error);
	} finally {
		isI18nLoading.set(false);
	}
}

/**
 * Switch language and load its essential translations
 */
export async function switchLanguage(newLocale: SupportedLanguage): Promise<void> {
	if (!browser) return;

	isI18nLoading.set(true);

	try {
		// Load essential translations for new locale
		await loadEssentialTranslations(newLocale);

		// Update locale
		locale.set(newLocale);

		// Persist the new locale
		await Preferences.set({ key: 'locale', value: newLocale });

		// Load current route translations for new locale
		if (typeof window !== 'undefined') {
			await loadRouteTranslations(window.location.pathname, newLocale);
		}
	} catch (error) {
		console.error(`Failed to switch to locale ${newLocale}:`, error);
	} finally {
		isI18nLoading.set(false);
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

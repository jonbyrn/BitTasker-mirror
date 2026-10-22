import {
	addMessages,
	init,
	locale,
	getLocaleFromNavigator,
	dictionary as dictionaryStore
} from 'svelte-i18n';
import { browser } from '$app/environment';
import { get, writable } from 'svelte/store';
import { Preferences } from '@capacitor/preferences';
import { chooseLocale } from '$lib/i18n/default-locale';

export const SUPPORTED_LANGUAGES = ['en', 'es', 'pt', 'fr', 'sw'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

// Track loaded namespaces to avoid duplicate loads
const loadedNamespaces = new Map<string, Set<string>>();

// Store for loading state
export const isI18nLoading = writable(false);

// Lazy loading cache
const translationCache = new Map<string, Record<string, string>>();

/**
 * Get the initial locale based on user preference
 */
const getInitialLocale = async (): Promise<SupportedLanguage> => {
	if (!browser) return 'en';

	const storedLocale = await Preferences.get({ key: 'locale' });
	let timeZone: string | null = null;
	try {
		timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
	} catch {
		timeZone = null;
	}

	const hinted = document.documentElement.dataset.btLocale;
	return chooseLocale({
		stored: storedLocale.value || (hinted === 'en' || hinted === 'es' ? hinted : null),
		navigatorLocale: getLocaleFromNavigator(),
		timeZone
	});
};

/** Keep <html lang> aligned with the active interface language. */
export function syncDocumentLanguage(value: string | null | undefined): void {
	if (!browser || !value) return;
	const lang = value.toLowerCase().split('-')[0];
	if (!lang) return;
	document.documentElement.lang = lang;
}

/**
 * Deep merge objects for translation merging
 */
function deepMerge(
	target: Record<string, unknown>,
	source: Record<string, unknown>
): Record<string, unknown> {
	if (!source) return target;
	if (!target) return source;

	for (const key in source) {
		const sourceVal = source[key];
		const targetVal = target[key];

		if (sourceVal && typeof sourceVal === 'object' && !Array.isArray(sourceVal)) {
			if (!targetVal || typeof targetVal !== 'object') {
				target[key] = {};
			}
			deepMerge(target[key] as Record<string, unknown>, sourceVal as Record<string, unknown>);
		} else {
			target[key] = sourceVal;
		}
	}
	return target;
}
/**
 * Load a specific namespace for a locale
 */
export async function loadNamespace(
	locale: SupportedLanguage,
	namespace: string,
	fetcher: typeof fetch = fetch
): Promise<Record<string, string>> {
	const cacheKey = `${locale}-${namespace}`;

	// Return cached if available
	if (translationCache.has(cacheKey)) {
		return translationCache.get(cacheKey) || {};
	}

	if (!browser) {
		return {};
	}

	try {
		// Fetch JSON as static asset instead of dynamic import
		const response = await fetcher(`/locales/${locale}/${namespace}.json`);
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
		// Note: we use manual merging because svelte-i18n addMessages might overwrite root keys if they are the same
		// and we have multiple files sharing root keys like \"dashboard\".
		const currentMessages =
			(get(dictionaryStore) as Record<string, Record<string, unknown>>)[locale] || {};
		const mergedMessages = deepMerge(
			{ ...currentMessages },
			data as unknown as Record<string, unknown>
		);
		addMessages(locale, mergedMessages as Parameters<typeof addMessages>[1]);
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
	namespaces: string[],
	fetcher: typeof fetch = fetch
): Promise<void> {
	const loadPromises = namespaces.map((namespace) => loadNamespace(locale, namespace, fetcher));
	await Promise.allSettled(loadPromises);
}

/**
 * Load essential translations for initial app render
 */
async function loadEssentialTranslations(
	currentLocale: SupportedLanguage,
	fetcher: typeof fetch = fetch
): Promise<void> {
	// Only load critical translations needed for initial render
	const essentialNamespaces = ['home', 'common', 'notifications', 'reviews', 'learn'];

	await loadNamespaces(currentLocale, essentialNamespaces, fetcher);
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
		namespaces.push(
			'dashboard/wallet',
			'dashboard/wallet/defi',
			'dashboard/wallet/swap',
			'dashboard/wallet/send',
			'dashboard/wallet/receive',
			'dashboard/wallet/buysell',
			'dashboard/wallet/pending-swaps',
			'dashboard/wallet/common'
		);
		// Include categories and recommendations for task discovery
		namespaces.push('dashboard/recomendations', 'categories');
		// Include moderation namespace for report/mute menus on task cards
		namespaces.push('moderation');
	}
	// Protected workspace routes
	// Earning routes
	if (route.includes('/earning')) {
		namespaces.push('dashboard/dashboard', 'dashboard/tasks/info');
		namespaces.push('dashboard/bids');
		// Always load wallet namespace for bid-related components that use wallet translations
		namespaces.push(
			'dashboard/wallet',
			'dashboard/wallet/defi',
			'dashboard/wallet/swap',
			'dashboard/wallet/send',
			'dashboard/wallet/receive',
			'dashboard/wallet/buysell',
			'dashboard/wallet/pending-swaps',
			'dashboard/wallet/common'
		);
		// Service workspaces are surfaced from both protected workspace routes.
		namespaces.push(
			'dashboard/services/my-services',
			'dashboard/services/browse',
			'dashboard/services/detail'
		);
		// Load moderation namespace for report/mute menus that appear on all dashboard surfaces
		namespaces.push('moderation');

		// Load notifications namespace for notification components
		namespaces.push('notifications');
		// Load contracts actions namespace for contract-related components
		namespaces.push('dashboard/contracts/actions');
	}

	if (
		[
			'/hiring',
			'/create-task',
			'/wallet',
			'/messages',
			'/settings',
			'/create-service',
			'/task/',
			'/bids'
		].some((p) => route.includes(p))
	) {
		namespaces.push('dashboard/dashboard', 'dashboard/tasks/info');
		namespaces.push('dashboard/bids');
		// Always load wallet namespace for bid-related components that use wallet translations
		namespaces.push(
			'dashboard/wallet',
			'dashboard/wallet/defi',
			'dashboard/wallet/swap',
			'dashboard/wallet/send',
			'dashboard/wallet/receive',
			'dashboard/wallet/buysell',
			'dashboard/wallet/pending-swaps',
			'dashboard/wallet/common'
		);
		// Service workspaces are surfaced from both protected workspace routes.
		namespaces.push(
			'dashboard/services/my-services',
			'dashboard/services/browse',
			'dashboard/services/detail'
		);
		// Load moderation namespace for report/mute menus that appear on all dashboard surfaces
		namespaces.push('moderation');

		// Load notifications namespace for notification components
		namespaces.push('notifications');
		// Load contracts actions namespace for contract-related components
		namespaces.push('dashboard/contracts/actions');

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
			namespaces.push('dashboard/tasks/create', 'categories', 'uploader');
		}
		if (route.includes('/messages')) {
			namespaces.push('dashboard/messages');
		}
		if (route.includes('/create-service')) {
			namespaces.push('dashboard/services/create', 'categories', 'uploader');
		}

		if (route.includes('/settings')) {
			namespaces.push('dashboard/settings');
		}
		if (route.includes('/reviews')) {
			namespaces.push('reviews');
		}
	}

	if (route.includes('/profile')) {
		namespaces.push(
			'dashboard/profile/profile',
			'dashboard/profile/personal',
			'dashboard/profile/availability'
		);
	}

	if (route.includes('/categories')) {
		namespaces.push('common');
	}

	if (route.includes('/services')) {
		namespaces.push(
			'dashboard/dashboard',
			'dashboard/wallet',
			'dashboard/services/browse',
			'dashboard/services/create',
			'dashboard/services/detail',
			'categories',
			'moderation'
		);
	}

	if (route.includes('/onboarding')) namespaces.push('onboarding');
	if (route.includes('/how-it-works')) namespaces.push('how_it_works');
	if (route.includes('/auth')) namespaces.push('auth');

	// Protected routes (routes that require authentication)
	if (route.includes('(protected)')) {
		namespaces.push('auth');
	}

	// Company pages (route groups don't show in URL, so check actual paths)
	if (route.includes('/npub')) namespaces.push('moderation');
	if (route.includes('/about')) namespaces.push('company/about');
	if (route.includes('/start-earning')) namespaces.push('company/start-earning');
	if (route.includes('/careers')) namespaces.push('company/careers');
	if (route.includes('/secure-payments')) namespaces.push('company/secure-payments');
	if (route.includes('/contact')) namespaces.push('company/contact');
	if (route.includes('/security')) namespaces.push('company/security');
	if (route.includes('/privacy')) namespaces.push('company/privacy_policy');
	if (route.includes('/terms')) namespaces.push('company/terms');
	if (route.includes('/press')) namespaces.push('company/press');
	if (route.includes('/delete-account')) namespaces.push('company/delete_account');
	if (route.includes('/community-guidelines')) namespaces.push('taskees/guidelines');
	if (route.includes('/taskee-fees')) namespaces.push('taskees/fee');
	if (route.includes('/tasker-fees')) namespaces.push('taskers/fee');
	if (route.includes('/tasker-principles')) namespaces.push('taskers/principles');
	if (route.includes('/faq')) namespaces.push('taskees/faq');
	if (route.includes('/feedback')) namespaces.push('dashboard/feedback');
	if (route.includes('/credit') || route.includes('/tasks') || route.includes('/contracts')) {
		namespaces.push('credit');
	}
	if (route.includes('/dashboard/debug-smart-contract')) namespaces.push('debug');

	// Learn section (English and Spanish)
	if (route.startsWith('/learn') || route.startsWith('/aprende')) {
		namespaces.push('learn');
	}

	return namespaces;
}

/**
 * Load route-specific translations dynamically
 */
export async function loadRouteTranslations(
	route: string,
	currentLocale?: SupportedLanguage,
	fetcher: typeof fetch = fetch
): Promise<void> {
	if (!browser) return;

	const targetLocale = currentLocale || (await getInitialLocale());
	const namespaces = getNamespacesForRoute(route);

	if (namespaces.length > 0) {
		await loadNamespaces(targetLocale, namespaces, fetcher);
		// Late dictionaries replace the English fallback that the first lookup cached.
		if (get(locale) === targetLocale) {
			await locale.set(targetLocale);
		}
	}
}

/**
 * Initialize i18n with minimal overhead
 */
export async function setupI18n(fetcher: typeof fetch = fetch): Promise<void> {
	if (!browser) return console.warn('Not in client context');

	isI18nLoading.set(true);

	try {
		const currentLocale = await getInitialLocale();

		// Load only essential translations. The load event's fetch avoids SvelteKit's
		// "using window.fetch" warning while the root load function is still running.
		await loadEssentialTranslations(currentLocale, fetcher);

		// Initialize svelte-i18n — MUST be awaited so $locale is set before components render.
		// Without await, the language dropdown flag and translated text show stale 'en' values
		// until svelte-i18n's internal init resolves, causing a visible flash.
		await init({
			fallbackLocale: 'en',
			initialLocale: currentLocale,
			loadingDelay: 0
		});
		// init() ignores a second call, and the first lookup can cache English
		// under the Spanish locale. Set the store again after messages exist.
		await locale.set(currentLocale);
		syncDocumentLanguage(currentLocale);

		// Set up locale persistence
		await Preferences.set({ key: 'locale', value: currentLocale });
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
		syncDocumentLanguage(newLocale);

		// Persist the new locale
		await Preferences.set({ key: 'locale', value: newLocale });

		// Load current route translations for new locale
		if (typeof window !== 'undefined') {
			await loadRouteTranslations(window.location.pathname, newLocale);
		}

		// Persist language to backend for localized notifications (best-effort)
		try {
			const { authState } = await import('$lib/stores/auth.store');
			const currentState = get(authState);
			if (currentState.isAuthenticated) {
				const { default: authService } = await import('$lib/api/services/auth.service');
				await authService.updateLanguage(newLocale);
			}
		} catch {
			// Non-critical — language is already persisted locally
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

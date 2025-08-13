import { page } from '$app/state';
import { loadRouteTranslations, preloadTranslations, getNamespacesForRoute, type SupportedLanguage } from './i18n';
import { locale } from 'svelte-i18n';
import { get } from 'svelte/store';
import { browser } from '$app/environment';

/**
 * Load translations for the current route
 * Call this in your page/layout load functions or components
 */
export async function loadPageTranslations(route?: string): Promise<void> {
    if (!browser) return;

    const currentRoute = route || page.url.pathname || '';
    const currentLocale = get(locale) as SupportedLanguage || 'en';

    await loadRouteTranslations(currentRoute, currentLocale);
}

/**
 * Preload translations for a route (for better UX on navigation)
 * Uses the shared route mapping logic from i18n.ts to avoid duplication
 */
export function preloadPageTranslations(route: string, targetLocale?: SupportedLanguage): void {
    if (!browser) return;

    const locale = targetLocale || 'en';
    const namespaces = getNamespacesForRoute(route);
    
    if (namespaces.length > 0) {
        preloadTranslations(locale, namespaces);
    }
}

/**
 * Svelte action to automatically load translations when component mounts
 */
export function autoLoadTranslations(node: HTMLElement, route?: string) {
    if (browser) {
        loadPageTranslations(route);
    }

    return {
        destroy() {
            // Cleanup if needed
        }
    };
}

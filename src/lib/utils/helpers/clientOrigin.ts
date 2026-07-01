const PRODUCTION_ORIGIN = 'https://bittasker.com';

/**
 * Returns the client origin for building absolute URLs (e.g. notification click actions).
 *
 * Fallback chain:
 *  1. VITE_CLIENT_URL env var (set in web builds)
 *  2. window.location.origin (works in Capacitor where hostname is configured)
 *  3. https://bittasker.com (hard safety net)
 */
export function getClientOrigin(): string {
	return import.meta.env.VITE_CLIENT_URL || window.location.origin || PRODUCTION_ORIGIN;
}

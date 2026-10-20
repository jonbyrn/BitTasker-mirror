const TOKEN_STORAGE_KEYS = ['CapacitorStorage.access_token', 'access_token'] as const;

/**
 * Read the access token from Capacitor Preferences, then from the web
 * Preferences mirror and a plain localStorage key. A transient Preferences
 * miss must not look like a logged-out reload.
 */
export function readTokenFromPreferenceAndStorage(
	preferenceValue: string | null | undefined,
	storage: { getItem(key: string): string | null } | null
): string | null {
	const preferred = preferenceValue?.trim();
	if (preferred) return preferred;
	if (!storage) return null;
	for (const key of TOKEN_STORAGE_KEYS) {
		const value = storage.getItem(key)?.trim();
		if (value) return value;
	}
	return null;
}

import { Capacitor } from '@capacitor/core';

/**
 * Sync the native app icon badge count.
 * Uses @capawesome/capacitor-badge (Capacitor 8 compatible).
 * No-op on web — the in-app bell badge handles web display.
 */
export async function syncBadge(count: number): Promise<void> {
	if (!Capacitor.isNativePlatform()) return;
	try {
		const { Badge } = await import('@capawesome/capacitor-badge');
		await Badge.set({ count });
	} catch {
		// Badge plugin may not be available on all devices
	}
}

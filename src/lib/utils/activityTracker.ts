import { browser } from '$app/environment';
import { Capacitor } from '@capacitor/core';
import { notificationCenterService } from '$lib/api/services/notificationCenter.service';

/**
 * Pings the backend with a user_activity enrichment on visibility change
 * and Capacitor app resume. This drives re-engagement reminders —
 * if we don't ping for 3 days, the backend sends "We miss you" notifications.
 */
let lastPing = 0;
const PING_INTERVAL = 5 * 60 * 1000; // 5 min debounce — no need to ping more often

export function trackActivity(): void {
	if (!browser) return;

	const now = Date.now();
	if (now - lastPing < PING_INTERVAL) return;
	lastPing = now;

	notificationCenterService.enrich({ action: 'user_activity' });
}

export function initActivityTracking(): void {
	if (!browser) return;

	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'visible') {
			trackActivity();
		}
	});

	if (Capacitor.isNativePlatform()) {
		import('@capacitor/app').then(({ App }) => {
			App.addListener('appStateChange', ({ isActive }) => {
				if (isActive) trackActivity();
			});
		});
	}
}

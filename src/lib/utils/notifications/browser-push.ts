import type { NotificationCenterItem } from '$lib/types/notification';

/**
 * Production delivers Firebase web push through the notification API.
 * This sandbox has no notification service, so a granted browser permission
 * shows the same title and body from the in-app inbox.
 * Permission is requested only from the banner the user taps.
 */
export function showBrowserNotification(item: NotificationCenterItem): void {
	if (typeof window === 'undefined' || typeof Notification === 'undefined') return;
	if (Notification.permission !== 'granted') return;
	if (typeof document !== 'undefined' && document.visibilityState === 'visible') return;
	try {
		const notice = new Notification(item.title, {
			body: item.body,
			tag: item.dedupeKey || item.id
		});
		notice.onclick = () => {
			const link = item.data?.deepLink;
			if (typeof link === 'string' && link.startsWith('/') && !link.startsWith('//')) {
				window.location.assign(link);
			}
			window.focus();
			notice.close();
		};
	} catch {
		// A missing Notification constructor must not interrupt the inbox.
	}
}

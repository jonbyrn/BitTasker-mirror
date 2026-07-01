/**
 * Coordinates foreground notification display across independent channels
 * (push service, WebSocket, FCM) to prevent duplicate notifications.
 *
 * When a system-level notification (browser Notification API or Capacitor
 * LocalNotifications) is successfully shown, this coordinator signals other
 * channels to suppress their in-app toasts for the same event.
 *
 * The flag auto-resets after RESET_DELAY_MS to avoid stale state blocking
 * future toasts from unrelated events.
 */

const RESET_DELAY_MS = 2000;

class ForegroundNotificationCoordinator {
	private systemNotificationShown = false;
	private resetTimer: ReturnType<typeof setTimeout> | null = null;

	/**
	 * Call after successfully showing a system-level notification
	 * (browser Notification, Capacitor LocalNotifications).
	 * Sets a flag that other channels can check to suppress duplicate toasts.
	 */
	markSystemNotificationShown(): void {
		this.systemNotificationShown = true;

		if (this.resetTimer) {
			clearTimeout(this.resetTimer);
		}

		this.resetTimer = setTimeout(() => {
			this.systemNotificationShown = false;
			this.resetTimer = null;
		}, RESET_DELAY_MS);
	}

	/**
	 * Check whether a system notification was recently shown.
	 * WebSocket and other toast-producing channels should call this
	 * before showing an in-app toast.
	 */
	wasSystemNotificationShown(): boolean {
		return this.systemNotificationShown;
	}

	/**
	 * Reset state. Useful for testing or on logout.
	 */
	reset(): void {
		this.systemNotificationShown = false;
		if (this.resetTimer) {
			clearTimeout(this.resetTimer);
			this.resetTimer = null;
		}
	}
}

export const foregroundNotificationCoordinator = new ForegroundNotificationCoordinator();

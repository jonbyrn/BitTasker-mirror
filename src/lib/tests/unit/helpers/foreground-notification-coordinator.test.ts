import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { foregroundNotificationCoordinator } from '$lib/utils/helpers/foreground-notification-coordinator';

describe('ForegroundNotificationCoordinator', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		foregroundNotificationCoordinator.reset();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('starts with no system notification shown', () => {
		expect(foregroundNotificationCoordinator.wasSystemNotificationShown()).toBe(false);
	});

	it('marks system notification as shown', () => {
		foregroundNotificationCoordinator.markSystemNotificationShown();
		expect(foregroundNotificationCoordinator.wasSystemNotificationShown()).toBe(true);
	});

	it('auto-resets after 2 seconds', () => {
		foregroundNotificationCoordinator.markSystemNotificationShown();
		expect(foregroundNotificationCoordinator.wasSystemNotificationShown()).toBe(true);

		vi.advanceTimersByTime(1999);
		expect(foregroundNotificationCoordinator.wasSystemNotificationShown()).toBe(true);

		vi.advanceTimersByTime(1);
		expect(foregroundNotificationCoordinator.wasSystemNotificationShown()).toBe(false);
	});

	it('resets the timer when markSystemNotificationShown is called again', () => {
		foregroundNotificationCoordinator.markSystemNotificationShown();

		vi.advanceTimersByTime(1500);
		foregroundNotificationCoordinator.markSystemNotificationShown();

		vi.advanceTimersByTime(1500);
		expect(foregroundNotificationCoordinator.wasSystemNotificationShown()).toBe(true);

		vi.advanceTimersByTime(500);
		expect(foregroundNotificationCoordinator.wasSystemNotificationShown()).toBe(false);
	});

	it('reset() immediately clears the flag', () => {
		foregroundNotificationCoordinator.markSystemNotificationShown();
		expect(foregroundNotificationCoordinator.wasSystemNotificationShown()).toBe(true);

		foregroundNotificationCoordinator.reset();
		expect(foregroundNotificationCoordinator.wasSystemNotificationShown()).toBe(false);
	});

	it('reset() clears the auto-reset timer', () => {
		foregroundNotificationCoordinator.markSystemNotificationShown();
		foregroundNotificationCoordinator.reset();

		vi.advanceTimersByTime(5000);
		expect(foregroundNotificationCoordinator.wasSystemNotificationShown()).toBe(false);
	});

	it('supports rapid mark/reset cycles without leaking timers', () => {
		for (let i = 0; i < 100; i++) {
			foregroundNotificationCoordinator.markSystemNotificationShown();
		}
		foregroundNotificationCoordinator.reset();
		expect(foregroundNotificationCoordinator.wasSystemNotificationShown()).toBe(false);
	});

	it('WebSocket can check coordinator to suppress toast after push notification', () => {
		// Simulate: push handler fires first, marks system notification shown
		foregroundNotificationCoordinator.markSystemNotificationShown();

		// WebSocket handler checks coordinator — should suppress toast
		const shouldShowToast = !foregroundNotificationCoordinator.wasSystemNotificationShown();
		expect(shouldShowToast).toBe(false);
	});

	it('WebSocket shows toast when no system notification was shown', () => {
		// No push handler fired — coordinator is clear
		const shouldShowToast = !foregroundNotificationCoordinator.wasSystemNotificationShown();
		expect(shouldShowToast).toBe(true);
	});

	it('WebSocket shows toast after coordinator auto-resets', () => {
		foregroundNotificationCoordinator.markSystemNotificationShown();

		vi.advanceTimersByTime(2000);

		const shouldShowToast = !foregroundNotificationCoordinator.wasSystemNotificationShown();
		expect(shouldShowToast).toBe(true);
	});
});

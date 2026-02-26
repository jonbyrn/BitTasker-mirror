import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { get } from 'svelte/store';
import {
	redirectRetryStore,
	startRedirectRetryCountdown,
	goToRedirectTarget,
	cleanupRedirectRetry
} from '$lib/utils/helpers/redirectWithRetry';

describe('redirectWithRetry', () => {
	const mockGoto = vi.fn().mockResolvedValue(undefined);

	beforeEach(() => {
		vi.clearAllMocks();
		cleanupRedirectRetry();
	});

	afterEach(() => {
		cleanupRedirectRetry();
	});

	it('startRedirectRetryCountdown sets store to pending with target and countdown 3', () => {
		startRedirectRetryCountdown('/dashboard', mockGoto);
		expect(get(redirectRetryStore)).toEqual({
			pending: true,
			target: '/dashboard',
			countdown: 3
		});
		cleanupRedirectRetry();
	});

	it('cleanupRedirectRetry clears interval so countdown does not keep ticking', () => {
		vi.useFakeTimers();
		startRedirectRetryCountdown('/dashboard', mockGoto);
		cleanupRedirectRetry();
		vi.advanceTimersByTime(5000);
		expect(get(redirectRetryStore).countdown).toBe(0);
		expect(get(redirectRetryStore).pending).toBe(false);
		expect(mockGoto).not.toHaveBeenCalled();
		vi.useRealTimers();
	});

	it('goToRedirectTarget calls goto with target and clears store on success', async () => {
		mockGoto.mockResolvedValue(undefined);
		startRedirectRetryCountdown('/dashboard', mockGoto);
		await goToRedirectTarget();
		expect(mockGoto).toHaveBeenCalledWith('/dashboard');
		expect(get(redirectRetryStore)).toEqual({
			pending: false,
			target: null,
			countdown: 0
		});
	});

	it('goToRedirectTarget does nothing when target is null', async () => {
		await goToRedirectTarget();
		expect(mockGoto).not.toHaveBeenCalled();
	});

	it('when countdown reaches 0, goto is called with target', async () => {
		vi.useFakeTimers();
		startRedirectRetryCountdown('/auth/onboarding', mockGoto);
		// Countdown: 3 -> 2 -> 1 -> 0; on the tick when 0 we call goto (4 seconds)
		vi.advanceTimersByTime(4000);
		await Promise.resolve();
		expect(mockGoto).toHaveBeenCalledWith('/auth/onboarding');
		vi.useRealTimers();
	});
});

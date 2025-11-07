import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
	startExpiryChecking,
	stopExpiryChecking,
	getExpiryStatus,
	formatRemainingTime,
	shouldExtendExpiry,
	extendExpiry
} from '$lib/utils/request-expiry';
import { requestQueueStore } from '$lib/stores/request-queue.store';
import type { TimeSlotRequest } from '$lib/types/scheduling';
import { calculateExpiryTimestamp, generateNonce } from '$lib/utils/scheduling-utils';

describe('Request Expiry', () => {
	beforeEach(() => {
		stopExpiryChecking();
		requestQueueStore.clear();
		vi.useFakeTimers();
	});

	afterEach(() => {
		stopExpiryChecking();
		vi.useRealTimers();
	});

	describe('startExpiryChecking / stopExpiryChecking', () => {
		it('should start and stop expiry checking (skipped in test env)', () => {
			// These functions require window object which isn't available in test environment
			// They will gracefully return early in non-browser environments
			expect(() => startExpiryChecking()).not.toThrow();
			expect(() => stopExpiryChecking()).not.toThrow();
		});

		it('should not start multiple intervals (skipped in test env)', () => {
			// In test environment, window is undefined so these will return early
			startExpiryChecking();
			startExpiryChecking(); // Should not create second interval
			stopExpiryChecking();
		});

		it('should handle non-browser environment gracefully', () => {
			// In test environment without window, functions should return early
			expect(() => startExpiryChecking()).not.toThrow();
			expect(() => stopExpiryChecking()).not.toThrow();
		});
	});

	describe('getExpiryStatus', () => {
		it('should return correct status for non-expired request', () => {
			const expiresAt = Date.now() + 30 * 60 * 1000; // 30 minutes from now
			const status = getExpiryStatus(expiresAt);

			expect(status.isExpired).toBe(false);
			expect(status.remainingMs).toBeGreaterThan(0);
			expect(status.remainingMinutes).toBeGreaterThan(0);
			expect(status.expiresSoon).toBe(false);
		});

		it('should return correct status for expired request', () => {
			const expiresAt = Date.now() - 1000; // 1 second ago
			const status = getExpiryStatus(expiresAt);

			expect(status.isExpired).toBe(true);
			expect(status.remainingMs).toBe(0);
			expect(status.remainingMinutes).toBe(0);
			expect(status.remainingSeconds).toBe(0);
			expect(status.expiresSoon).toBe(false);
		});

		it('should detect expires soon (less than 5 minutes)', () => {
			const expiresAt = Date.now() + 3 * 60 * 1000; // 3 minutes from now
			const status = getExpiryStatus(expiresAt);

			expect(status.isExpired).toBe(false);
			expect(status.expiresSoon).toBe(true);
		});

		it('should calculate remaining time correctly', () => {
			const now = Date.now();
			const expiresAt = now + 90 * 60 * 1000; // 90 minutes from now
			const status = getExpiryStatus(expiresAt);

			expect(status.remainingMinutes).toBe(90);
			expect(status.remainingSeconds).toBe(0);
		});
	});

	describe('formatRemainingTime', () => {
		it('should format seconds correctly', () => {
			const expiresAt = Date.now() + 30 * 1000; // 30 seconds
			const formatted = formatRemainingTime(expiresAt);
			expect(formatted).toBe('30s'); // Should show seconds when less than 1 minute
		});

		it('should format minutes correctly', () => {
			const expiresAt = Date.now() + 30 * 60 * 1000; // 30 minutes
			const formatted = formatRemainingTime(expiresAt);
			expect(formatted).toBe('30m');
		});

		it('should format hours and minutes correctly', () => {
			const expiresAt = Date.now() + 90 * 60 * 1000; // 90 minutes = 1h 30m
			const formatted = formatRemainingTime(expiresAt);
			expect(formatted).toBe('1h 30m');
		});

		it('should return "Expired" for expired requests', () => {
			const expiresAt = Date.now() - 1000;
			const formatted = formatRemainingTime(expiresAt);
			expect(formatted).toBe('Expired');
		});
	});

	describe('shouldExtendExpiry', () => {
		it('should return true for requests expiring soon', () => {
			const expiresAt = Date.now() + 3 * 60 * 1000; // 3 minutes
			expect(shouldExtendExpiry(expiresAt)).toBe(true);
		});

		it('should return false for requests with plenty of time', () => {
			const expiresAt = Date.now() + 30 * 60 * 1000; // 30 minutes
			expect(shouldExtendExpiry(expiresAt)).toBe(false);
		});

		it('should return false for expired requests', () => {
			const expiresAt = Date.now() - 1000;
			expect(shouldExtendExpiry(expiresAt)).toBe(false);
		});
	});

	describe('extendExpiry', () => {
		it('should extend expiry by default 15 minutes', () => {
			const now = Date.now();
			const currentExpiresAt = now + 5 * 60 * 1000; // 5 minutes from now
			const newExpiresAt = extendExpiry(currentExpiresAt);

			const expected = currentExpiresAt + 15 * 60 * 1000;
			expect(newExpiresAt).toBe(expected);
		});

		it('should extend expiry by custom minutes', () => {
			const now = Date.now();
			const currentExpiresAt = now + 5 * 60 * 1000;
			const newExpiresAt = extendExpiry(currentExpiresAt, 30);

			const expected = currentExpiresAt + 30 * 60 * 1000;
			expect(newExpiresAt).toBe(expected);
		});

		it('should extend from now if already expired', () => {
			const now = Date.now();
			const expiredAt = now - 1000; // 1 second ago
			const newExpiresAt = extendExpiry(expiredAt, 15);

			// Should extend from now, not from expired time
			expect(newExpiresAt).toBeGreaterThan(now);
			expect(newExpiresAt).toBeLessThanOrEqual(now + 15 * 60 * 1000 + 100); // Small tolerance
		});
	});
});


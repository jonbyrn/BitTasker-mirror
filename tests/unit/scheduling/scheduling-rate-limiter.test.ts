import { describe, it, expect, beforeEach } from 'vitest';
import {
	SchedulingRateLimiter,
	checkSchedulingRateLimit,
	isUserBlocked
} from '$lib/utils/scheduling-rate-limiter';

describe('Scheduling Rate Limiter', () => {
	let rateLimiter: SchedulingRateLimiter;
	const userPubkey = 'test-user-pubkey';

	beforeEach(() => {
		rateLimiter = new SchedulingRateLimiter({
			maxRequestsPerWindow: 5,
			windowMs: 60 * 1000, // 1 minute for testing
			blockDurationMs: 5 * 60 * 1000 // 5 minutes
		});
	});

	describe('checkRateLimit', () => {
		it('should allow requests within limit', () => {
			for (let i = 0; i < 5; i++) {
				const result = rateLimiter.checkRateLimit(userPubkey, `request-${i}`);
				expect(result.allowed).toBe(true);
				expect(result.remainingRequests).toBe(5 - i - 1);
			}
		});

		it('should block requests exceeding limit', () => {
			// Send 5 requests (limit)
			for (let i = 0; i < 5; i++) {
				rateLimiter.checkRateLimit(userPubkey, `request-${i}`);
			}

			// 6th request should be blocked
			const result = rateLimiter.checkRateLimit(userPubkey, 'request-6');
			expect(result.allowed).toBe(false);
			expect(result.blockedUntil).toBeDefined();
			expect(result.reason).toBeDefined();
		});

		it('should reset after window expires', async () => {
			// Send 5 requests
			for (let i = 0; i < 5; i++) {
				rateLimiter.checkRateLimit(userPubkey, `request-${i}`);
			}

			// Create new limiter with very short window
			const shortWindowLimiter = new SchedulingRateLimiter({
				maxRequestsPerWindow: 5,
				windowMs: 100, // 100ms window
				blockDurationMs: 1000
			});

			// Send 5 requests
			for (let i = 0; i < 5; i++) {
				shortWindowLimiter.checkRateLimit(userPubkey, `request-${i}`);
			}

			// Wait for window to expire
			await new Promise((resolve) => setTimeout(resolve, 150));

			// Should allow new request after window expires
			const result = shortWindowLimiter.checkRateLimit(userPubkey, 'request-new');
			expect(result.allowed).toBe(true);
		});
	});

	describe('isBlocked', () => {
		it('should return false for non-blocked users', () => {
			expect(rateLimiter.isBlocked(userPubkey)).toBe(false);
		});

		it('should return true for blocked users', () => {
			// Exceed limit to trigger block
			for (let i = 0; i < 6; i++) {
				rateLimiter.checkRateLimit(userPubkey, `request-${i}`);
			}

			expect(rateLimiter.isBlocked(userPubkey)).toBe(true);
		});
	});

	describe('getRemainingRequests', () => {
		it('should return correct remaining requests', () => {
			expect(rateLimiter.getRemainingRequests(userPubkey)).toBe(5);

			rateLimiter.checkRateLimit(userPubkey, 'request-1');
			expect(rateLimiter.getRemainingRequests(userPubkey)).toBe(4);

			rateLimiter.checkRateLimit(userPubkey, 'request-2');
			expect(rateLimiter.getRemainingRequests(userPubkey)).toBe(3);
		});

		it('should return 0 for blocked users', () => {
			// Exceed limit
			for (let i = 0; i < 6; i++) {
				rateLimiter.checkRateLimit(userPubkey, `request-${i}`);
			}

			expect(rateLimiter.getRemainingRequests(userPubkey)).toBe(0);
		});
	});

	describe('clearUserHistory', () => {
		it('should clear user history', () => {
			rateLimiter.checkRateLimit(userPubkey, 'request-1');
			expect(rateLimiter.getRemainingRequests(userPubkey)).toBe(4);

			rateLimiter.clearUserHistory(userPubkey);
			expect(rateLimiter.getRemainingRequests(userPubkey)).toBe(5);
		});

		it('should unblock user', () => {
			// Block user
			for (let i = 0; i < 6; i++) {
				rateLimiter.checkRateLimit(userPubkey, `request-${i}`);
			}

			expect(rateLimiter.isBlocked(userPubkey)).toBe(true);

			rateLimiter.clearUserHistory(userPubkey);
			expect(rateLimiter.isBlocked(userPubkey)).toBe(false);
		});
	});

	describe('checkSchedulingRateLimit', () => {
		it('should check rate limit using global instance', () => {
			const result = checkSchedulingRateLimit(userPubkey, 'request-1');
			expect(result.allowed).toBe(true);
		});
	});

	describe('isUserBlocked', () => {
		it('should check if user is blocked using global instance', () => {
			expect(isUserBlocked(userPubkey)).toBe(false);
		});
	});
});


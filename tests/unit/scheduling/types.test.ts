import { describe, it, expect } from 'vitest';
import {
	calculateExpiryTimestamp,
	isRequestExpired,
	getRemainingTime,
	validateTimestamp,
	generateNonce,
	validateNonce
} from '$lib/utils/scheduling-utils';

describe('Scheduling Utils - Expiry Calculation', () => {
	describe('calculateExpiryTimestamp', () => {
		it('should calculate expiry timestamp correctly for 15 minutes', () => {
			const createdAt = 1000000;
			const expiryMinutes = 15;
			const expected = createdAt + 15 * 60 * 1000;
			expect(calculateExpiryTimestamp(createdAt, expiryMinutes)).toBe(expected);
		});

		it('should calculate expiry timestamp correctly for custom duration', () => {
			const createdAt = 1000000;
			const expiryMinutes = 30;
			const expected = createdAt + 30 * 60 * 1000;
			expect(calculateExpiryTimestamp(createdAt, expiryMinutes)).toBe(expected);
		});

		it('should use default 15 minutes if not specified', () => {
			const createdAt = 1000000;
			const expected = createdAt + 15 * 60 * 1000;
			expect(calculateExpiryTimestamp(createdAt)).toBe(expected);
		});

		it('should throw error for invalid expiry minutes', () => {
			const createdAt = 1000000;
			expect(() => calculateExpiryTimestamp(createdAt, 0)).toThrow('Expiry minutes must be greater than 0');
			expect(() => calculateExpiryTimestamp(createdAt, -1)).toThrow('Expiry minutes must be greater than 0');
		});

		it('should throw error for invalid created timestamp', () => {
			expect(() => calculateExpiryTimestamp(0, 15)).toThrow('Created timestamp must be greater than 0');
			expect(() => calculateExpiryTimestamp(-1, 15)).toThrow('Created timestamp must be greater than 0');
		});
	});

	describe('isRequestExpired', () => {
		it('should return false for non-expired request', () => {
			const expiresAt = Date.now() + 10000; // 10 seconds in future
			expect(isRequestExpired(expiresAt)).toBe(false);
		});

		it('should return true for expired request', () => {
			const expiresAt = Date.now() - 10000; // 10 seconds in past
			expect(isRequestExpired(expiresAt)).toBe(true);
		});

		it('should return true for exactly expired request', () => {
			const currentTime = Date.now();
			const expiresAt = currentTime;
			expect(isRequestExpired(expiresAt, currentTime)).toBe(true);
		});

		it('should use custom current time', () => {
			const currentTime = 1000000;
			const expiresAt = currentTime - 1000; // 1 second in past
			expect(isRequestExpired(expiresAt, currentTime)).toBe(true);
		});
	});

	describe('getRemainingTime', () => {
		it('should return remaining time for non-expired request', () => {
			const currentTime = 1000000;
			const expiresAt = currentTime + 5000; // 5 seconds in future
			expect(getRemainingTime(expiresAt, currentTime)).toBe(5000);
		});

		it('should return 0 for expired request', () => {
			const currentTime = 1000000;
			const expiresAt = currentTime - 1000; // 1 second in past
			expect(getRemainingTime(expiresAt, currentTime)).toBe(0);
		});

		it('should return 0 for exactly expired request', () => {
			const currentTime = 1000000;
			const expiresAt = currentTime;
			expect(getRemainingTime(expiresAt, currentTime)).toBe(0);
		});
	});
});

describe('Scheduling Utils - Timestamp Validation', () => {
	describe('validateTimestamp', () => {
		it('should validate current timestamp', () => {
			const timestamp = Date.now();
			const result = validateTimestamp(timestamp);
			expect(result.isValid).toBe(true);
			expect(result.error).toBeUndefined();
		});

		it('should reject timestamp of 0', () => {
			const result = validateTimestamp(0);
			expect(result.isValid).toBe(false);
			expect(result.error).toBe('Timestamp must be greater than 0');
		});

		it('should reject negative timestamp', () => {
			const result = validateTimestamp(-1);
			expect(result.isValid).toBe(false);
			expect(result.error).toBe('Timestamp must be greater than 0');
		});

		it('should reject future timestamp beyond tolerance', () => {
			const currentTime = 1000000;
			const futureTimestamp = currentTime + 10 * 60 * 1000; // 10 minutes in future
			const result = validateTimestamp(futureTimestamp, 1, currentTime);
			expect(result.isValid).toBe(false);
			expect(result.error).toBe('Timestamp cannot be in the future');
		});

		it('should accept timestamp within future tolerance', () => {
			const currentTime = 1000000;
			const futureTimestamp = currentTime + 2 * 60 * 1000; // 2 minutes in future (within 5 min tolerance)
			const result = validateTimestamp(futureTimestamp, 1, currentTime);
			expect(result.isValid).toBe(true);
		});

		it('should reject timestamp too old', () => {
			const currentTime = 10000000000; // Large timestamp to avoid negatives
			const oldTimestamp = currentTime - 2 * 60 * 60 * 1000; // 2 hours ago
			const result = validateTimestamp(oldTimestamp, 1, currentTime); // Max age 1 hour
			expect(result.isValid).toBe(false);
			expect(result.error).toContain('Timestamp is too old');
		});

		it('should accept timestamp within max age', () => {
			const currentTime = 10000000000; // Large timestamp to avoid negatives
			const timestamp = currentTime - 30 * 60 * 1000; // 30 minutes ago
			const result = validateTimestamp(timestamp, 1, currentTime); // Max age 1 hour
			expect(result.isValid).toBe(true);
		});

		it('should use custom max age', () => {
			const currentTime = 10000000000; // Large timestamp to avoid negatives
			const timestamp = currentTime - 2 * 60 * 60 * 1000; // 2 hours ago
			const result = validateTimestamp(timestamp, 3, currentTime); // Max age 3 hours
			expect(result.isValid).toBe(true);
		});
	});
});

describe('Scheduling Utils - Nonce Generation', () => {
	describe('generateNonce', () => {
		it('should generate a nonce', () => {
			const nonce = generateNonce();
			expect(nonce).toBeDefined();
			expect(typeof nonce).toBe('string');
		});

		it('should generate unique nonces', () => {
			const nonce1 = generateNonce();
			const nonce2 = generateNonce();
			expect(nonce1).not.toBe(nonce2);
		});

		it('should generate 64-character hex string', () => {
			const nonce = generateNonce();
			expect(nonce.length).toBe(64);
			expect(/^[0-9a-f]{64}$/i.test(nonce)).toBe(true);
		});
	});

	describe('validateNonce', () => {
		it('should validate correct nonce format', () => {
			const validNonce = 'a'.repeat(64);
			expect(validateNonce(validNonce)).toBe(true);
		});

		it('should validate hex characters', () => {
			const validNonce = '0123456789abcdefABCDEF'.repeat(3).substring(0, 64);
			expect(validateNonce(validNonce)).toBe(true);
		});

		it('should reject nonce that is too short', () => {
			const invalidNonce = 'a'.repeat(63);
			expect(validateNonce(invalidNonce)).toBe(false);
		});

		it('should reject nonce that is too long', () => {
			const invalidNonce = 'a'.repeat(65);
			expect(validateNonce(invalidNonce)).toBe(false);
		});

		it('should reject nonce with invalid characters', () => {
			const invalidNonce = 'g'.repeat(64);
			expect(validateNonce(invalidNonce)).toBe(false);
		});

		it('should reject empty string', () => {
			expect(validateNonce('')).toBe(false);
		});
	});
});


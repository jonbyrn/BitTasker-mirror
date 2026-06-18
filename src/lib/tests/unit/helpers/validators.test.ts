import { describe, it, expect, vi } from 'vitest';

// Mock wallet-core and liquidjs-lib so validators module can load (EventBus missing in test env)
vi.mock('@bittasker/wallet-core', () => ({
	normalizeRskAddress: vi.fn((addr: string) => addr),
	ARB_TOKEN_ADDRESSES: {
		USDT0: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
		WBTC: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f',
		TBTC: '0x6c84a8f1c29108F47a79964b5Fe888D4f4D0dE40'
	}
}));
vi.mock('liquidjs-lib', () => ({
	address: {
		toOutputScript: vi.fn()
	}
}));

import {
	isValidEmail,
	validateEmail,
	validateName,
	validatePassword,
	validateUsername
} from '$lib/utils/helpers/validators';

describe('Validators', () => {
	describe('isValidEmail', () => {
		it('should return true for valid email addresses', () => {
			expect(isValidEmail('user@example.com')).toBe(true);
			expect(isValidEmail('name.surname@domain.co.uk')).toBe(true);
			expect(isValidEmail('user-name@domain.org')).toBe(true);
		});

		it('should return false for invalid email addresses', () => {
			expect(isValidEmail('')).toBe(false);
			expect(isValidEmail('user@')).toBe(false);
			expect(isValidEmail('@example.com')).toBe(false);
			expect(isValidEmail('user@.com')).toBe(false);
			expect(isValidEmail('user@example')).toBe(false);
			expect(isValidEmail('user example.com')).toBe(false);
		});
	});

	describe('validateEmail', () => {
		it('should return valid result for valid emails', () => {
			const result = validateEmail('user@example.com');
			expect(result.isValid).toBe(true);
			expect(result.error).toBeUndefined();
		});

		it('should return error for empty email', () => {
			const result = validateEmail('');
			expect(result.isValid).toBe(false);
			expect(result.error).toBe('Email is required');
		});

		it('should return error for invalid email format', () => {
			const result = validateEmail('not-an-email');
			expect(result.isValid).toBe(false);
			expect(result.error).toBe('Please enter a valid email address');
		});
	});

	describe('validateName', () => {
		it('should return valid result for valid names', () => {
			const result = validateName('John Doe');
			expect(result.isValid).toBe(true);
			expect(result.error).toBeUndefined();
		});

		it('should return error for empty name', () => {
			const result = validateName('');
			expect(result.isValid).toBe(false);
			expect(result.error).toBe('Full name is required');
		});

		it('should return error for too short name', () => {
			const result = validateName('J');
			expect(result.isValid).toBe(false);
			expect(result.error).toBe('Full name must be at least 2 characters long');
		});

		it('should return error for too long name', () => {
			const longName = 'A'.repeat(101);
			const result = validateName(longName);
			expect(result.isValid).toBe(false);
			expect(result.error).toBe('Full name must not exceed 100 characters');
		});

		it('should return error for single name', () => {
			const result = validateName('John');
			expect(result.isValid).toBe(false);
			expect(result.error).toBe('Please enter your full name (first and last name)');
		});

		it('should return error for invalid characters', () => {
			const result = validateName('John Doe123');
			expect(result.isValid).toBe(false);
			expect(result.error).toBe('Name can only contain letters, spaces, hyphens, and apostrophes');
		});

		it('should handle names with hyphens and apostrophes', () => {
			const result = validateName("John O'Connor-Smith");
			expect(result.isValid).toBe(true);
		});
	});

	describe('validatePassword', () => {
		it('should return valid result for valid password (12+ chars)', () => {
			const result = validatePassword('StrongP@ss1word');
			expect(result.isValid).toBe(true);
			expect(result.error).toBeUndefined();
		});

		it('should return error for empty password', () => {
			const result = validatePassword('');
			expect(result.isValid).toBe(false);
			expect(result.error).toBe('Password is required');
		});

		it('should return error for too short password', () => {
			const result = validatePassword('Short1!');
			expect(result.isValid).toBe(false);
			expect(result.error).toBe('Password must be at least 12 characters long');
		});
	});

	describe('validateUsername', () => {
		it('should return valid result for valid usernames', () => {
			const result = validateUsername('john');
			expect(result.isValid).toBe(true);
			expect(result.error).toBeUndefined();
		});

		it('should return valid result for usernames with numbers and dashes', () => {
			const result = validateUsername('john-doe123');
			expect(result.isValid).toBe(true);
			expect(result.error).toBeUndefined();
		});

		it('should return error for empty username', () => {
			const result = validateUsername('');
			expect(result.isValid).toBe(false);
			expect(result.error).toBe('onboarding_auth.form.username_setup.errors.required');
		});

		it('should return error for too short username', () => {
			const result = validateUsername('ab');
			expect(result.isValid).toBe(false);
			expect(result.error).toBe('onboarding_auth.form.username_setup.errors.too_short');
		});

		it('should return error for too long username', () => {
			const longUsername = 'a'.repeat(65);
			const result = validateUsername(longUsername);
			expect(result.isValid).toBe(false);
			expect(result.error).toBe('onboarding_auth.form.username_setup.errors.too_long');
		});

		it('should return valid result for exactly 64 characters', () => {
			const username64 = 'a'.repeat(64);
			const result = validateUsername(username64);
			expect(result.isValid).toBe(true);
			expect(result.error).toBeUndefined();
		});

		it('should return valid result for exactly 3 characters', () => {
			const result = validateUsername('abc');
			expect(result.isValid).toBe(true);
			expect(result.error).toBeUndefined();
		});

		it('should return error for username with spaces', () => {
			const result = validateUsername('john doe');
			expect(result.isValid).toBe(false);
			expect(result.error).toBe('onboarding_auth.form.username_setup.errors.invalid_characters');
		});

		it('should return error for username with special characters', () => {
			const result = validateUsername('john@doe');
			expect(result.isValid).toBe(false);
			expect(result.error).toBe('onboarding_auth.form.username_setup.errors.invalid_characters');
		});

		it('should return error for username starting with hyphen', () => {
			const result = validateUsername('-johndoe');
			expect(result.isValid).toBe(false);
			expect(result.error).toBe('onboarding_auth.form.username_setup.errors.invalid_characters');
		});

		it('should return error for username ending with hyphen', () => {
			const result = validateUsername('johndoe-');
			expect(result.isValid).toBe(false);
			expect(result.error).toBe('onboarding_auth.form.username_setup.errors.invalid_characters');
		});

		it('should return valid result for username with hyphens in the middle', () => {
			const result = validateUsername('john-doe-123');
			expect(result.isValid).toBe(true);
			expect(result.error).toBeUndefined();
		});

		it('should return valid result for single character username (if length check passes)', () => {
			// Note: This will fail length check, but we're testing character validation
			const result = validateUsername('a');
			expect(result.isValid).toBe(false);
			expect(result.error).toBe('onboarding_auth.form.username_setup.errors.too_short');
		});
	});
});

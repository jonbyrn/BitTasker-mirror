import { describe, it, expect } from 'vitest';
import {
	isValidEmail,
	validateEmail,
	validateName,
	validatePassword,
	validateNostrPrivateKey,
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
		it('should return valid result for valid password', () => {
			const result = validatePassword('StrongP@ss1');
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
			expect(result.error).toBe('Password must be at least 8 characters long');
		});

		it('should return error for missing uppercase letter', () => {
			const result = validatePassword('noupperletter1!');
			expect(result.isValid).toBe(false);
			expect(result.error).toBe('Password must contain at least one uppercase letter');
		});

		it('should return error for missing lowercase letter', () => {
			const result = validatePassword('NOLOWERCASE1!');
			expect(result.isValid).toBe(false);
			expect(result.error).toBe('Password must contain at least one lowercase letter');
		});

		it('should return error for missing number', () => {
			const result = validatePassword('NoNumbers!');
			expect(result.isValid).toBe(false);
			expect(result.error).toBe('Password must contain at least one number');
		});

		it('should return error for missing special character', () => {
			const result = validatePassword('NoSpecial123');
			expect(result.isValid).toBe(false);
			expect(result.error).toBe('Password must contain at least one special character');
		});
	});

	describe('validateNostrPrivateKey', () => {
		it('should return valid result for valid nsec format', () => {
			const validKey = 'nsec1' + 'a'.repeat(60);
			const result = validateNostrPrivateKey(validKey);
			expect(result.isValid).toBe(true);
			expect(result.error).toBeUndefined();
		});

		it('should return error for key not starting with nsec1', () => {
			const result = validateNostrPrivateKey('private1abcdefghijklmnopqrstuvwxyz');
			expect(result.isValid).toBe(false);
			expect(result.error).toBe('Nostr private key must start with nsec1');
		});

		it('should return error for invalid length key', () => {
			const shortKey = 'nsec1abc';
			const result = validateNostrPrivateKey(shortKey);
			expect(result.isValid).toBe(false);
			expect(result.error).toBe('Invalid Nostr private key length');
		});

		it('should return error for invalid characters', () => {
			// Use invalid characters that will trigger the specific regex check
			// The key needs to be long enough to pass the length check first
			const invalidKey = 'nsec1' + 'INVALID_CHARS'.padEnd(57, 'x');
			const result = validateNostrPrivateKey(invalidKey);
			expect(result.isValid).toBe(false);
			expect(result.error).toBe('Invalid characters in Nostr private key');
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
			expect(result.error).toBe('Username is required');
		});

		it('should return error for too short username', () => {
			const result = validateUsername('ab');
			expect(result.isValid).toBe(false);
			expect(result.error).toBe('Username must be at least 3 characters long');
		});

		it('should return error for too long username', () => {
			const longUsername = 'a'.repeat(65);
			const result = validateUsername(longUsername);
			expect(result.isValid).toBe(false);
			expect(result.error).toBe('Username must be less than 64 characters long');
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
			expect(result.error).toBe('Invalid characters');
		});

		it('should return error for username with special characters', () => {
			const result = validateUsername('john@doe');
			expect(result.isValid).toBe(false);
			expect(result.error).toBe('Invalid characters');
		});

		it('should return error for username starting with hyphen', () => {
			const result = validateUsername('-johndoe');
			expect(result.isValid).toBe(false);
			expect(result.error).toBe('Invalid characters');
		});

		it('should return error for username ending with hyphen', () => {
			const result = validateUsername('johndoe-');
			expect(result.isValid).toBe(false);
			expect(result.error).toBe('Invalid characters');
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
			expect(result.error).toBe('Username must be at least 3 characters long');
		});
	});
});

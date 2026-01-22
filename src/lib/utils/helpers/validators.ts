import { normalizeRskAddress } from '@bittasker/wallet-core';

export interface ValidationResult {
	isValid: boolean;
	error?: string;
}


// Import liquidjs-lib for Liquid address validation
import { address as liquidAddress } from 'liquidjs-lib';

export function isValidEmail(email: string): boolean {
	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	return emailRegex.test(email);
}

export function validateEmail(email: string): ValidationResult {
	if (!email) {
		return { isValid: false, error: 'Email is required' };
	}
	if (!isValidEmail(email)) {
		return { isValid: false, error: 'Please enter a valid email address' };
	}
	return { isValid: true };
}

export function validateName(name: string): ValidationResult {
	if (!name) {
		return { isValid: false, error: 'Full name is required' };
	}
	if (name.length < 2) {
		return { isValid: false, error: 'Full name must be at least 2 characters long' };
	}
	if (name.length > 100) {
		return { isValid: false, error: 'Full name must not exceed 100 characters' };
	}

	// Split the name into parts
	const nameParts = name.trim().split(/\s+/);
	if (nameParts.length < 2) {
		return { isValid: false, error: 'Please enter your full name (first and last name)' };
	}

	// Check if each part contains only valid characters
	if (!/^[a-zA-Z\s'-]+$/.test(name)) {
		return {
			isValid: false,
			error: 'Name can only contain letters, spaces, hyphens, and apostrophes'
		};
	}

	return { isValid: true };
}

export function validatePassword(password: string): ValidationResult {
	if (!password) {
		return { isValid: false, error: 'Password is required' };
	}

	if (password.length < 12) {
		return { isValid: false, error: 'Password must be at least 12 characters long' };
	}

	return { isValid: true };
}

export function validateNostrPrivateKey(nsec: string): { isValid: boolean; error?: string } {
	// Trim whitespace before validation
	const trimmed = nsec.trim();

	// Check if empty after trimming
	if (!trimmed) {
		return { isValid: false, error: 'Nostr private key cannot be empty' };
	}

	// Check if it's a valid bech32 nsec format
	if (!trimmed.startsWith('nsec1')) {
		return { 
			isValid: false, 
			error: `Nostr private key must start with "nsec1". Found: "${trimmed.substring(0, 10)}..."` 
		};
	}

	// Bech32 nsec keys are typically around 63 characters
	if (trimmed.length < 60 || trimmed.length > 65) {
		return { 
			isValid: false, 
			error: `Invalid Nostr private key length: ${trimmed.length} characters (expected 60-65)` 
		};
	}

	// Only allow valid bech32 characters
	if (!/^nsec1[023456789acdefghjklmnpqrstuvwxyz]+$/i.test(trimmed)) {
		// Find the first invalid character for better error reporting
		const invalidCharMatch = trimmed.match(/[^023456789acdefghjklmnpqrstuvwxyz]/i);
		const invalidChar = invalidCharMatch ? invalidCharMatch[0] : 'unknown';
		return { 
			isValid: false, 
			error: `Invalid character "${invalidChar}" in Nostr private key. Only bech32 characters are allowed.` 
		};
	}

	return { isValid: true };
}

export function validateUsername(username: string): ValidationResult {
	if (!username) {
		return { isValid: false, error: 'onboarding_auth.form.username_setup.errors.required' };
	}

	if (username.length < 3) {
		return { isValid: false, error: 'onboarding_auth.form.username_setup.errors.too_short' };
	}

	if (username.length > 64) {
		return { isValid: false, error: 'onboarding_auth.form.username_setup.errors.too_long' };
	}

	// check for spaces
	if (username.includes(' ')) {
		return { isValid: false, error: 'onboarding_auth.form.username_setup.errors.invalid_characters' };
	}

	// Validate allowed characters: letters, numbers, and hyphens only
	// Must start and end with a letter or number (not a hyphen)
	// Cannot contain spaces or other special characters
	const usernameRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$/;
	if (!usernameRegex.test(username)) {
		return { isValid: false, error: 'onboarding_auth.form.username_setup.errors.invalid_characters' };
	}

	return { isValid: true };
}

/**
 * Validate RSK address format
 * Checks for valid hex format and proper length (42 characters including 0x prefix)
 */
export function validateRSKAddress(address: string): ValidationResult {
	// Ensure address is a string
	if (typeof address !== 'string') {
		return { isValid: false, error: `Invalid address type: expected string, got ${typeof address}` };
	}

	if (!address) {
		return { isValid: false, error: 'Address is required' };
	}

	// Check if address starts with 0x
	if (!address.startsWith('0x')) {
		return { isValid: false, error: 'Address must start with 0x' };
	}

	// Check if address has correct length (42 characters: 0x + 40 hex chars)
	if (address.length !== 42) {
		return { isValid: false, error: 'Address must be 42 characters long (0x + 40 hex digits)' };
	}

	// Check if address contains only valid hexadecimal characters
	if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
		return { isValid: false, error: 'Address must contain only hexadecimal characters (0-9, a-f)' };
	}

	if(!normalizeRskAddress(address)) {
		return { isValid: true };
	}

	return { isValid: true };
}


/**
 * Validate Lightning invoice or Lightning address
 */
export function validateLightningAddress(address: string): ValidationResult {
	if (!address) {
		return { isValid: false, error: 'Lightning address or invoice is required' };
	}

	// Check if it's a Lightning invoice (starts with ln)
	if (address.toLowerCase().startsWith('ln')) {
		// Lightning invoices are typically long strings
		if (address.length < 50) {
			return { isValid: false, error: 'Lightning invoice appears to be too short' };
		}
		return { isValid: true };
	}

	// Check if it's a Lightning address (email format: user@domain)
	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	if (emailRegex.test(address)) {
		return { isValid: true };
	}

	return { isValid: false, error: 'Invalid Lightning address or invoice format' };
}

/**
 * Validate Bitcoin address (basic check for common formats)
 */
export function validateBitcoinAddress(address: string): ValidationResult {
	if (!address) {
		return { isValid: false, error: 'Bitcoin address is required' };
	}

	// Check for common Bitcoin address formats
	// Legacy (P2PKH): starts with 1
	// SegWit (P2SH): starts with 3
	// Native SegWit (Bech32): starts with bc1
	const legacyRegex = /^[1][a-km-zA-HJ-NP-Z1-9]{25,34}$/;
	const segwitP2SHRegex = /^[3][a-km-zA-HJ-NP-Z1-9]{25,34}$/;
	const nativeSegwitRegex = /^bc1[a-z0-9]{39,59}$/;

	if (legacyRegex.test(address) || segwitP2SHRegex.test(address) || nativeSegwitRegex.test(address)) {
		return { isValid: true };
	}

	return { isValid: false, error: 'Invalid Bitcoin address format' };
}

/**
 * Validate Liquid address using liquidjs-lib
 * Properly validates Bech32 format and checksum for all Liquid address types
 */
export function validateLiquidAddress(address: string): ValidationResult {
	if (!address) {
		return { isValid: false, error: 'Liquid address is required' };
	}

	try {
		// Use liquidjs-lib to validate Bech32 format and checksum
		// toOutputScript will throw if address is invalid
		liquidAddress.toOutputScript(address);
		return { isValid: true };
	} catch (error) {
		// Address is invalid (wrong format, bad checksum, or wrong network)
		return { 
			isValid: false, 
			error: 'Invalid Liquid address format or checksum' 
		};
	}
}
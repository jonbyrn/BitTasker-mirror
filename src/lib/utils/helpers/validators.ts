export interface ValidationResult {
	isValid: boolean;
	error?: string;
}

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

	return { isValid: true };
}

export function validateNostrPrivateKey(nsec: string): { isValid: boolean; error?: string } {
	// Check if it's a valid bech32 nsec format
	if (!nsec.startsWith('nsec1')) {
		return { isValid: false, error: 'Nostr private key must start with nsec1' };
	}

	// Bech32 nsec keys are typically around 63 characters
	if (nsec.length < 60 || nsec.length > 65) {
		return { isValid: false, error: 'Invalid Nostr private key length' };
	}

	// Only allow valid bech32 characters
	if (!/^nsec1[023456789acdefghjklmnpqrstuvwxyz]+$/i.test(nsec)) {
		return { isValid: false, error: 'Invalid characters in Nostr private key' };
	}

	return { isValid: true };
}

export function validateUsername(username: string): ValidationResult {
	if (!username) {
		return { isValid: false, error: 'Username is required' };
	}

	if (username.length < 3) {
		return { isValid: false, error: 'Username must be at least 3 characters long' };
	}

	if (username.length > 64) {
		return { isValid: false, error: 'Username must be less than 64 characters long' };
	}

	// Validate allowed characters: letters, numbers, and hyphens only
	// Must start and end with a letter or number (not a hyphen)
	// Cannot contain spaces or other special characters
	const usernameRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$/;
	if (!usernameRegex.test(username)) {
		return { isValid: false, error: 'Invalid characters' };
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
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

	return { isValid: true };
}

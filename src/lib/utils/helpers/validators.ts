export interface ValidationResult {
	isValid: boolean;
	error?: string;
}

export function validateEmail(value: string): ValidationResult {
	if (!value.trim()) return { isValid: false, error: 'Email is required' };
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
		? { isValid: true }
		: { isValid: false, error: 'Please enter a valid email address' };
}

export function isValidEmail(value: string): boolean {
	return validateEmail(value).isValid;
}

export function validatePassword(value: string): ValidationResult {
	return value.length >= 12
		? { isValid: true }
		: { isValid: false, error: 'Password must be at least 12 characters' };
}

export function validateUsername(value: string): ValidationResult {
	return /^[a-zA-Z0-9_]{3,32}$/.test(value)
		? { isValid: true }
		: { isValid: false, error: 'Username must be 3-32 letters, numbers, or underscores' };
}

export function validateName(value: string): ValidationResult {
	if (!value.trim()) return { isValid: false, error: 'Full name is required' };
	if (value.length < 2)
		return { isValid: false, error: 'Full name must be at least 2 characters long' };
	if (value.length > 100)
		return { isValid: false, error: 'Full name must not exceed 100 characters' };
	if (!/^[\p{L}]+(?:[ '-][\p{L}]+)+$/u.test(value)) {
		return { isValid: false, error: 'Please enter your full name (first and last name)' };
	}
	return { isValid: true };
}

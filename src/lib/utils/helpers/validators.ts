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
	if (!value) return { isValid: false, error: 'Password is required' };
	return value.length >= 12
		? { isValid: true }
		: { isValid: false, error: 'Password must be at least 12 characters long' };
}

const USERNAME_ERRORS = {
	required: 'onboarding_auth.form.username_setup.errors.required',
	too_short: 'onboarding_auth.form.username_setup.errors.too_short',
	too_long: 'onboarding_auth.form.username_setup.errors.too_long',
	invalid_characters: 'onboarding_auth.form.username_setup.errors.invalid_characters'
} as const;

export function validateUsername(value: string): ValidationResult {
	if (!value) return { isValid: false, error: USERNAME_ERRORS.required };
	if (value.length < 3) return { isValid: false, error: USERNAME_ERRORS.too_short };
	if (value.length > 64) return { isValid: false, error: USERNAME_ERRORS.too_long };
	// Letters, numbers, underscores, and hyphens — but not leading/trailing hyphens.
	if (!/^[a-zA-Z0-9_](?:[a-zA-Z0-9_-]*[a-zA-Z0-9_])?$/.test(value)) {
		return { isValid: false, error: USERNAME_ERRORS.invalid_characters };
	}
	return { isValid: true };
}

export function validateName(value: string): ValidationResult {
	if (!value.trim()) return { isValid: false, error: 'Full name is required' };
	if (value.length < 2)
		return { isValid: false, error: 'Full name must be at least 2 characters long' };
	if (value.length > 100)
		return { isValid: false, error: 'Full name must not exceed 100 characters' };
	if (!/^[\p{L}' -]+$/u.test(value)) {
		return {
			isValid: false,
			error: 'Name can only contain letters, spaces, hyphens, and apostrophes'
		};
	}
	if (!/^[\p{L}]+(?:[ '-][\p{L}]+)+$/u.test(value)) {
		return { isValid: false, error: 'Please enter your full name (first and last name)' };
	}
	return { isValid: true };
}

export interface ValidationResult {
    isValid: boolean;
    error?: string;
}

export function isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
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
        return { isValid: false, error: 'Name can only contain letters, spaces, hyphens, and apostrophes' };
    }

    return { isValid: true };
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

export function validatePassword(password: string): ValidationResult {
    if (!password) {
        return { isValid: false, error: 'Password is required' };
    }
    if (password.length < 8) {
        return { isValid: false, error: 'Password must be at least 8 characters long' };
    }
    if (!/[A-Z]/.test(password)) {
        return { isValid: false, error: 'Password must contain at least one uppercase letter' };
    }
    if (!/[a-z]/.test(password)) {
        return { isValid: false, error: 'Password must contain at least one lowercase letter' };
    }
    if (!/[0-9]/.test(password)) {
        return { isValid: false, error: 'Password must contain at least one number' };
    }
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
        return { isValid: false, error: 'Password must contain at least one special character' };
    }
    return { isValid: true };
}
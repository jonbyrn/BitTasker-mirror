/**
 * Utility functions for scheduling system
 */

/**
 * Calculate expiry timestamp based on creation time and expiry duration
 * @param createdAt - Unix timestamp in milliseconds when request was created
 * @param expiryMinutes - Number of minutes until expiry (default: 15)
 * @returns Unix timestamp in milliseconds when request expires
 */
export function calculateExpiryTimestamp(createdAt: number, expiryMinutes: number = 15): number {
	if (expiryMinutes <= 0) {
		throw new Error('Expiry minutes must be greater than 0');
	}
	if (createdAt <= 0) {
		throw new Error('Created timestamp must be greater than 0');
	}
	return createdAt + expiryMinutes * 60 * 1000;
}

/**
 * Check if a request has expired
 * @param expiresAt - Unix timestamp in milliseconds when request expires
 * @param currentTime - Current Unix timestamp in milliseconds (default: Date.now())
 * @returns true if request has expired, false otherwise
 */
export function isRequestExpired(expiresAt: number, currentTime: number = Date.now()): boolean {
	return currentTime >= expiresAt;
}

/**
 * Get remaining time until expiry in milliseconds
 * @param expiresAt - Unix timestamp in milliseconds when request expires
 * @param currentTime - Current Unix timestamp in milliseconds (default: Date.now())
 * @returns Remaining time in milliseconds (0 if expired)
 */
export function getRemainingTime(expiresAt: number, currentTime: number = Date.now()): number {
	const remaining = expiresAt - currentTime;
	return Math.max(0, remaining);
}

/**
 * Validate timestamp is within acceptable range
 * @param timestamp - Unix timestamp in milliseconds to validate
 * @param maxAgeHours - Maximum age in hours (default: 1 hour)
 * @param currentTime - Current Unix timestamp in milliseconds (default: Date.now())
 * @returns Object with isValid flag and error message if invalid
 */
export function validateTimestamp(
	timestamp: number,
	maxAgeHours: number = 1,
	currentTime: number = Date.now()
): { isValid: boolean; error?: string } {
	if (timestamp <= 0) {
		return { isValid: false, error: 'Timestamp must be greater than 0' };
	}

	// Check if timestamp is in the future (with 5 minute tolerance for clock skew)
	const futureTolerance = 5 * 60 * 1000; // 5 minutes
	if (timestamp > currentTime + futureTolerance) {
		return { isValid: false, error: 'Timestamp cannot be in the future' };
	}

	// Check if timestamp is too old
	const maxAgeMs = maxAgeHours * 60 * 60 * 1000;
	const age = currentTime - timestamp;
	if (age > maxAgeMs) {
		return {
			isValid: false,
			error: `Timestamp is too old (${Math.round(age / (60 * 60 * 1000))} hours, max ${maxAgeHours} hours)`
		};
	}

	return { isValid: true };
}

/**
 * Generate a unique nonce for message replay prevention
 * @returns Random hex string (32 bytes = 64 hex characters)
 */
export function generateNonce(): string {
	const array = new Uint8Array(32);
	crypto.getRandomValues(array);
	return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Validate nonce format (must be 64 hex characters)
 * @param nonce - Nonce string to validate
 * @returns true if valid, false otherwise
 */
export function validateNonce(nonce: string): boolean {
	return /^[0-9a-f]{64}$/i.test(nonce);
}


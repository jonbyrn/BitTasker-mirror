/**
 * Error Type Detector
 * Determines the error type from error messages for better troubleshooting
 */

import type { ErrorType } from '$lib/types/errorTroubleshooting';

/**
 * Detects the error type from an error message
 * @param errorMessage The error message to analyze
 * @returns The detected error type
 */
export function detectErrorType(errorMessage: string): ErrorType {
	const message = errorMessage.toLowerCase();

	// Biometric errors
	if (
		message.includes('biometric') ||
		message.includes('fingerprint') ||
		message.includes('face id') ||
		message.includes('touch id') ||
		message.includes('passkey') ||
		message.includes('webauthn') ||
		message.includes('authenticator') ||
		message.includes('credential') ||
		message.includes('not enrolled') ||
		message.includes('lockout') ||
		message.includes('hardware') ||
		message.includes('sensor')
	) {
		return 'biometric';
	}

	// Network errors
	if (
		message.includes('network') ||
		message.includes('connection') ||
		message.includes('internet') ||
		message.includes('offline') ||
		message.includes('fetch') ||
		(message.includes('timeout') && message.includes('network'))
	) {
		return 'network';
	}

	// Authentication errors
	if (
		message.includes('authentication') ||
		message.includes('unauthorized') ||
		message.includes('login') ||
		message.includes('password') ||
		(message.includes('credential') && !message.includes('biometric'))
	) {
		return 'authentication';
	}

	// Permission errors
	if (
		message.includes('permission') ||
		message.includes('access denied') ||
		message.includes('not allowed') ||
		message.includes('forbidden')
	) {
		return 'permission';
	}

	// Hardware errors
	if (
		message.includes('hardware') ||
		message.includes('device') ||
		message.includes('sensor') ||
		message.includes('camera') ||
		message.includes('microphone')
	) {
		return 'hardware';
	}

	// Timeout errors
	if (
		message.includes('timeout') ||
		message.includes('timed out') ||
		message.includes('expired') ||
		message.includes('expiró')
	) {
		return 'timeout';
	}

	// Default to unknown
	return 'unknown';
}

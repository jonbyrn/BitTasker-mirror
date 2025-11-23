/**
 * Unified Biometric Error Handler
 * Handles errors from both web (WebAuthn) and mobile (Native Biometric + Capacitor WebAuthn) platforms
 */

import { t, locale } from 'svelte-i18n';
import { get } from 'svelte/store';
import { loadNamespace, type SupportedLanguage } from '$lib/i18n/i18n';

/**
 * Platform types for biometric authentication
 */
export type BiometricPlatform = 'web' | 'mobile-native' | 'mobile-webauthn';

/**
 * Comprehensive biometric error handler for all platforms
 * @param error The caught error
 * @param platform The platform where the error occurred
 * @returns User-friendly error message
 */
export async function handleBiometricError(error: any, platform: BiometricPlatform = 'web'): Promise<string> {
	// Ensure auth namespace is loaded for authentication error messages
	const currentLocale = get(locale) as SupportedLanguage || 'en';
	await loadNamespace(currentLocale, 'auth');
	
	const _ = get(t);

	// Handle WebAuthn specific errors (both web and mobile webauthn)
	if (error?.name && (platform === 'web' || platform === 'mobile-webauthn')) {
		switch (error.name) {
			case 'NotAllowedError':
				return _('login.biometric_errors.not_allowed');
			case 'AbortError':
				return _('login.biometric_errors.cancelled');
			case 'NotSupportedError':
				return _('login.biometric_errors.not_supported');
			case 'SecurityError':
				return _('login.biometric_errors.security_error');
			case 'InvalidStateError':
				return _('login.biometric_errors.invalid_state');
			case 'ConstraintError':
				return _('login.biometric_errors.constraint');
			case 'NetworkError':
				return _('login.biometric_errors.network_error');
			case 'TimeoutError':
				return _('login.biometric_errors.timeout');
			case 'UnknownError':
				return _('login.biometric_errors.unknown_error');
		}
	}

	// Handle Native Biometric errors (mobile-native platform)
	if (platform === 'mobile-native') {
		// Check for common native biometric error patterns
		if (error?.message || error?.code) {
			const errorStr = (error.message || error.code || '').toLowerCase();

			// Android BiometricManager error codes
			if (errorStr.includes('biometric_error_canceled') || errorStr.includes('user_cancel')) {
				return _('login.biometric_errors.cancelled');
			}
			if (errorStr.includes('biometric_error_timeout') || errorStr.includes('timeout')) {
				return _('login.biometric_errors.timeout');
			}
			if (errorStr.includes('biometric_error_lockout') || errorStr.includes('lockout') || errorStr.includes('too many attempts')) {
				return _('login.biometric_errors.lockout');
			}
			if (errorStr.includes('biometric_error_lockout_permanent') || errorStr.includes('permanent_lockout')) {
				return _('login.biometric_errors.permanent_lockout');
			}
			if (errorStr.includes('biometric_error_hw_unavailable') || errorStr.includes('hardware_unavailable')) {
				return _('login.biometric_errors.hardware_unavailable');
			}
			if (errorStr.includes('biometric_error_hw_not_present') || errorStr.includes('hardware_not_present')) {
				return _('login.biometric_errors.hardware_not_present');
			}
			if (errorStr.includes('biometric_error_no_biometrics') || errorStr.includes('no_biometrics') || errorStr.includes('not_enrolled')) {
				return _('login.biometric_errors.not_enrolled');
			}
			if (errorStr.includes('biometric_error_user_cancel') || errorStr.includes('user_cancel')) {
				return _('login.biometric_errors.cancelled');
			}
			if (errorStr.includes('biometric_error_no_space') || errorStr.includes('no_space')) {
				return _('login.biometric_errors.no_space');
			}
			if (errorStr.includes('biometric_error_unable_to_process') || errorStr.includes('unable_to_process')) {
				return _('login.biometric_errors.unable_to_process');
			}
			if (errorStr.includes('biometric_error_vendor') || errorStr.includes('vendor_error')) {
				return _('login.biometric_errors.vendor_error');
			}

			// iOS TouchID/FaceID errors
			if (errorStr.includes('biometrynotavailable') || errorStr.includes('biometry_not_available')) {
				return _('login.biometric_errors.not_available');
			}
			if (errorStr.includes('biometrynotenrolled') || errorStr.includes('biometry_not_enrolled')) {
				return _('login.biometric_errors.not_enrolled');
			}
			if (errorStr.includes('biometrylockout') || errorStr.includes('biometry_lockout')) {
				return _('login.biometric_errors.lockout');
			}
			if (errorStr.includes('usercancel') || errorStr.includes('user_cancel')) {
				return _('login.biometric_errors.cancelled');
			}
			if (errorStr.includes('userfallback') || errorStr.includes('user_fallback')) {
				return _('login.biometric_errors.fallback_requested');
			}
			if (errorStr.includes('systemcancel') || errorStr.includes('system_cancel')) {
				return _('login.biometric_errors.system_cancelled');
			}
			if (errorStr.includes('passcodenotset') || errorStr.includes('passcode_not_set')) {
				return _('login.biometric_errors.passcode_not_set');
			}
			if (errorStr.includes('touchidnotavailable') || errorStr.includes('touchid_not_available')) {
				return _('login.biometric_errors.touchid_not_available');
			}
			if (errorStr.includes('touchidnotenrolled') || errorStr.includes('touchid_not_enrolled')) {
				return _('login.biometric_errors.touchid_not_enrolled');
			}
			if (errorStr.includes('touchidlockout') || errorStr.includes('touchid_lockout')) {
				return _('login.biometric_errors.touchid_lockout');
			}
		}
	}

	// Handle API errors (common to all platforms)
	if (error?.status || error?.response?.status) {
		const status = error.status || error.response?.status;
		const message = error?.data?.message || error?.response?.data?.message || error?.message;
		
		// Most API errors are user-friendly, so return them as-is
		if (message && typeof message === 'string') {
			return message;
		}

		// Fallback for API errors without message
		if (status >= 400 && status < 500) {
			return _('login.biometric_errors.api_error');
		}
		if (status >= 500) {
			return _('login.biometric_errors.api_error');
		}
	}

		// Handle specific error messages (common patterns across all platforms)
	if (error?.message) {
		const message = error.message.toLowerCase();
		
		// Silently ignore "A request is already pending" errors - return empty string to suppress error display
		if (message.includes('a request is already pending') || 
			message.includes('request is already pending') ||
			(message.includes('operationerror') && message.includes('already pending'))) {
			return ''; // Return empty string to suppress error display
		}
		
		// Handle passkey account mismatch errors
		if (message.includes('passkey mismatch')) {
			return _('login.errors.passkey_mismatch');
		}
		
		// Handle Spanish error messages
		if (message.includes('la operación expiró') || message.includes('operación expiró') || message.includes('expiró')) {
			return _('login.biometric_errors.timeout');
		}
		if (message.includes('no fue permitida') || message.includes('no permitida')) {
			return _('login.biometric_errors.not_allowed');
		}
		
		if (message.includes('timeout')) {
			return _('login.biometric_errors.timeout');
		}
		if (message.includes('cancel') || message.includes('abort')) {
			return _('login.biometric_errors.cancelled');
		}
		if (message.includes('not available') || message.includes('unavailable')) {
			return _('login.biometric_errors.not_available');
		}
		if (message.includes('no credential') || message.includes('credential not found')) {
			return _('login.biometric_errors.no_credential');
		}
		if (message.includes('invalid credential') || message.includes('credential format')) {
			return _('login.biometric_errors.credential_invalid');
		}
		if (message.includes('no encrypted data') || message.includes('no user handle')) {
			return _('login.biometric_errors.data_not_found');
		}
		if (message.includes('older version') || message.includes('legacy')) {
			return _('login.biometric_errors.legacy_credential');
		}
		if (message.includes('user verification')) {
			return _('login.biometric_errors.user_verification_failed');
		}
		if (message.includes('authenticator')) {
			return _('login.biometric_errors.authenticator_error');
		}
		if (message.includes('network') || message.includes('connection')) {
			return _('login.biometric_errors.network_error');
		}
		if (message.includes('sensor')) {
			return _('login.biometric_errors.sensor_error');
		}
		if (message.includes('lockout') || message.includes('locked')) {
			return _('login.biometric_errors.lockout');
		}
		if (message.includes('not enrolled') || message.includes('no biometric')) {
			return _('login.biometric_errors.not_enrolled');
		}
		
		// For API errors that are already user-friendly, return as-is
		if (!message.includes('error') || message.length < 100) {
			return error.message;
		}
	}

	// Handle string errors
	if (typeof error === 'string') {
		return error;
	}

	// Fallback for unknown errors
	return _('login.biometric_errors.unknown_error');
}

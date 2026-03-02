import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleBiometricError } from '$lib/utils/helpers/biometricErrorHandler';

const translateFn = vi.fn((key: string) => key);
const getCallCount = vi.hoisted(() => ({ count: 0 }));

vi.mock('svelte-i18n', () => ({
	t: {},
	locale: {}
}));

vi.mock('svelte/store', () => ({
	get: vi.fn(() => (getCallCount.count++ % 2 === 0 ? 'en' : translateFn))
}));

vi.mock('$lib/i18n/i18n', () => ({
	loadNamespace: vi.fn().mockResolvedValue(undefined)
}));

describe('biometricErrorHandler', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		getCallCount.count = 0;
		translateFn.mockImplementation((key: string) => key);
	});

	it('should return translation key for WebAuthn NotAllowedError on web', async () => {
		const result = await handleBiometricError({ name: 'NotAllowedError' }, 'web');
		expect(translateFn).toHaveBeenCalledWith('login.biometric_errors.not_allowed');
		expect(result).toBe('login.biometric_errors.not_allowed');
	});

	it('should return translation key for WebAuthn AbortError (cancelled)', async () => {
		const result = await handleBiometricError({ name: 'AbortError' }, 'web');
		expect(result).toBe('login.biometric_errors.cancelled');
	});

	it('should return translation key for WebAuthn NotSupportedError', async () => {
		const result = await handleBiometricError({ name: 'NotSupportedError' }, 'web');
		expect(result).toBe('login.biometric_errors.not_supported');
	});

	it('should return translation key for mobile-native user_cancel message', async () => {
		const result = await handleBiometricError(
			{ message: 'biometric_error_user_cancel' },
			'mobile-native'
		);
		expect(result).toBe('login.biometric_errors.cancelled');
	});

	it('should return translation key for mobile-native lockout message', async () => {
		const result = await handleBiometricError(
			{ message: 'biometric_error_lockout' },
			'mobile-native'
		);
		expect(result).toBe('login.biometric_errors.lockout');
	});

	it('should return translation key for mobile-native not_enrolled', async () => {
		const result = await handleBiometricError(
			{ code: 'biometric_error_no_biometrics' },
			'mobile-native'
		);
		expect(result).toBe('login.biometric_errors.not_enrolled');
	});

	it('should return empty string for "request is already pending" to suppress display', async () => {
		const result = await handleBiometricError({
			message: 'A request is already pending'
		});
		expect(result).toBe('');
	});

	it('should return passkey_mismatch key for passkey mismatch message', async () => {
		const result = await handleBiometricError({ message: 'Passkey mismatch' });
		expect(result).toBe('login.errors.passkey_mismatch');
	});

	it('should return translation key for generic timeout in message', async () => {
		const result = await handleBiometricError({ message: 'Something timeout error' });
		expect(result).toBe('login.biometric_errors.timeout');
	});

	it('should return translation key for API 4xx without message', async () => {
		const result = await handleBiometricError({ status: 400 });
		expect(translateFn).toHaveBeenCalledWith('login.biometric_errors.api_error');
		expect(result).toBe('login.biometric_errors.api_error');
	});

	it('should return string error as-is when error is string', async () => {
		const result = await handleBiometricError('Custom string error');
		expect(result).toBe('Custom string error');
	});

	it('should return unknown_error key for unrecognized error', async () => {
		// Implementation returns short messages as-is; use error with no message or long message to hit fallback
		const result = await handleBiometricError({});
		expect(result).toBe('login.biometric_errors.unknown_error');
	});
});

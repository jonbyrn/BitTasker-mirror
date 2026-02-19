import { describe, it, expect } from 'vitest';
import { detectErrorType } from '$lib/utils/helpers/errorTypeDetector';

describe('errorTypeDetector', () => {
	describe('detectErrorType', () => {
		it('should return biometric for biometric-related messages', () => {
			expect(detectErrorType('Biometric authentication failed')).toBe('biometric');
			expect(detectErrorType('fingerprint sensor error')).toBe('biometric');
			expect(detectErrorType('passkey not available')).toBe('biometric');
			expect(detectErrorType('webauthn credential denied')).toBe('biometric');
			expect(detectErrorType('not enrolled')).toBe('biometric');
			expect(detectErrorType('hardware sensor unavailable')).toBe('biometric');
		});

		it('should return network for network-related messages', () => {
			expect(detectErrorType('network error occurred')).toBe('network');
			expect(detectErrorType('connection refused')).toBe('network');
			expect(detectErrorType('no internet')).toBe('network');
			expect(detectErrorType('fetch failed')).toBe('network');
			expect(detectErrorType('timeout network')).toBe('network');
		});

		it('should return authentication for auth-related messages', () => {
			expect(detectErrorType('authentication failed')).toBe('authentication');
			expect(detectErrorType('unauthorized')).toBe('authentication');
			expect(detectErrorType('login required')).toBe('authentication');
			expect(detectErrorType('invalid password')).toBe('authentication');
		});

		it('should return permission for permission-related messages', () => {
			expect(detectErrorType('permission denied')).toBe('permission');
			expect(detectErrorType('access denied')).toBe('permission');
			expect(detectErrorType('not allowed')).toBe('permission');
			expect(detectErrorType('forbidden')).toBe('permission');
		});

		it('should return hardware for hardware-related messages', () => {
			expect(detectErrorType('device not found')).toBe('hardware');
			expect(detectErrorType('camera unavailable')).toBe('hardware');
			expect(detectErrorType('microphone error')).toBe('hardware');
			expect(detectErrorType('device malfunction')).toBe('hardware');
		});

		it('should return timeout for timeout-related messages', () => {
			expect(detectErrorType('request timeout')).toBe('timeout');
			expect(detectErrorType('timed out')).toBe('timeout');
			expect(detectErrorType('session expired')).toBe('timeout');
			expect(detectErrorType('expiró')).toBe('timeout');
		});

		it('should return unknown for unrelated messages', () => {
			expect(detectErrorType('something went wrong')).toBe('unknown');
			expect(detectErrorType('internal error')).toBe('unknown');
		});

		it('should be case-insensitive', () => {
			expect(detectErrorType('BIOMETRIC FAILED')).toBe('biometric');
			expect(detectErrorType('Network Error')).toBe('network');
		});
	});
});

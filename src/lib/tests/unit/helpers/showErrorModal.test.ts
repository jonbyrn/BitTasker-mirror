import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getErrorModalData } from '$lib/utils/helpers/showErrorModal';

vi.mock('$lib/utils/helpers/biometricErrorHandler', () => ({
	handleBiometricError: vi.fn().mockResolvedValue('Biometric error message')
}));

describe('showErrorModal', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('getErrorModalData', () => {
		it('should route errors with name to handleBiometricError', async () => {
			// Error instances have .name, so they are routed to handleBiometricError
			const result = await getErrorModalData({
				error: new Error('Something went wrong')
			});
			expect(result.errorMessage).toBe('Biometric error message');
			expect(result.errorType).toBe('biometric');
		});

		it('should return string error as-is', async () => {
			const result = await getErrorModalData({ error: 'Custom error text' });
			expect(result.errorMessage).toBe('Custom error text');
		});

		it('should return fallback for non-Error non-string', async () => {
			const result = await getErrorModalData({ error: null });
			expect(result.errorMessage).toBe('An unexpected error occurred');
		});

		it('should use provided errorType when given', async () => {
			const result = await getErrorModalData({
				error: new Error('Test'),
				errorType: 'network'
			});
			expect(result.errorType).toBe('network');
		});

		it('should call handleBiometricError for error with name', async () => {
			const { handleBiometricError } = await import('$lib/utils/helpers/biometricErrorHandler');
			const result = await getErrorModalData({
				error: { name: 'NotAllowedError', message: 'User cancelled' },
				platform: 'web'
			});
			expect(handleBiometricError).toHaveBeenCalledWith(
				{ name: 'NotAllowedError', message: 'User cancelled' },
				'web'
			);
			expect(result.errorMessage).toBe('Biometric error message');
		});

		it('should call handleBiometricError when message contains "biometric"', async () => {
			const { handleBiometricError } = await import('$lib/utils/helpers/biometricErrorHandler');
			await getErrorModalData({
				error: { message: 'biometric authentication failed' },
				platform: 'web'
			});
			expect(handleBiometricError).toHaveBeenCalled();
		});

		it('should call handleBiometricError when message contains "passkey"', async () => {
			const { handleBiometricError } = await import('$lib/utils/helpers/biometricErrorHandler');
			await getErrorModalData({
				error: { message: 'passkey creation failed' }
			});
			expect(handleBiometricError).toHaveBeenCalled();
		});

		it('should default platform to "web"', async () => {
			const { handleBiometricError } = await import('$lib/utils/helpers/biometricErrorHandler');
			await getErrorModalData({
				error: { name: 'AbortError' }
			});
			expect(handleBiometricError).toHaveBeenCalledWith(expect.any(Object), 'web');
		});
	});
});

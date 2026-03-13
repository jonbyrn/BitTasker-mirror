/**
 * Helper function to show ErrorTroubleshootingModal programmatically
 * This can be used in components to display error modals when errors occur
 */

import type { ErrorType } from '$lib/types/errorTroubleshooting';
import { detectErrorType } from './errorTypeDetector';
import { handleBiometricError } from './biometricErrorHandler';
import type { BiometricPlatform } from './biometricErrorHandler';

export interface ErrorModalOptions {
	error: unknown;
	platform?: BiometricPlatform;
	errorType?: ErrorType;
}

/**
 * Get error message and type for displaying in ErrorTroubleshootingModal
 * @param options Error options including the error object and platform
 * @returns Object with errorMessage and errorType
 */
export async function getErrorModalData(
	options: ErrorModalOptions
): Promise<{ errorMessage: string; errorType: ErrorType }> {
	const { error, platform = 'web', errorType: providedErrorType } = options;

	// If it's a biometric error, use the biometric error handler
	let errorMessage: string;
	const errorDetails =
		typeof error === 'object' && error !== null
			? (error as { name?: unknown; message?: unknown })
			: null;
	const errorName = typeof errorDetails?.name === 'string' ? errorDetails.name : '';
	const errorMsg = typeof errorDetails?.message === 'string' ? errorDetails.message : '';

	if (errorName || errorMsg.includes('biometric') || errorMsg.includes('passkey')) {
		errorMessage = await handleBiometricError(error, platform);
	} else if (error instanceof Error) {
		errorMessage = error.message;
	} else if (typeof error === 'string') {
		errorMessage = error;
	} else {
		errorMessage = 'An unexpected error occurred';
	}

	// Auto-detect error type if not provided
	const errorType = providedErrorType || detectErrorType(errorMessage);

	return { errorMessage, errorType };
}

/**
 * Helper function to show ErrorTroubleshootingModal programmatically
 * This can be used in components to display error modals when errors occur
 */

import type { ErrorType } from '$lib/components/ErrorTroubleshootingModal.svelte';
import { detectErrorType } from './errorTypeDetector';
import { handleBiometricError } from './biometricErrorHandler';
import type { BiometricPlatform } from './biometricErrorHandler';

export interface ErrorModalOptions {
	error: any;
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
	if (error?.name || error?.message?.includes('biometric') || error?.message?.includes('passkey')) {
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



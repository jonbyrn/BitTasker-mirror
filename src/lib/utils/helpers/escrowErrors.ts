/**
 * Structured error types for escrow-related operations
 * Replaces fragile string matching with type-safe error handling
 */

export enum EscrowErrorCode {
	ESCROW_NOT_FOUND = 'ESCROW_NOT_FOUND',
	ESCROW_FUNDED = 'ESCROW_FUNDED',
	ESCROW_FUNDING_IN_PROGRESS = 'ESCROW_FUNDING_IN_PROGRESS',
	ESCROW_VERIFICATION_FAILED = 'ESCROW_VERIFICATION_FAILED',
	ESCROW_NETWORK_ERROR = 'ESCROW_NETWORK_ERROR',
	ESCROW_UNKNOWN_ERROR = 'ESCROW_UNKNOWN_ERROR'
}

export class EscrowError extends Error {
	constructor(
		public readonly code: EscrowErrorCode,
		message: string,
		public readonly originalError?: unknown
	) {
		super(message);
		this.name = 'EscrowError';
		// Maintains proper stack trace for where our error was thrown (only available on V8)
		if (Error.captureStackTrace) {
			Error.captureStackTrace(this, EscrowError);
		}
	}
}

/**
 * Check if an error is an EscrowError
 */
export function isEscrowError(error: unknown): error is EscrowError {
	return error instanceof EscrowError;
}

/**
 * Check if an error indicates escrow was not found
 */
export function isEscrowNotFoundError(error: unknown): boolean {
	if (isEscrowError(error)) {
		return error.code === EscrowErrorCode.ESCROW_NOT_FOUND;
	}
	
	// Fallback: check error message for common patterns
	if (error instanceof Error) {
		const message = error.message.toLowerCase();
		return (
			message.includes('not found') ||
			message.includes('does not exist') ||
			message.includes('escrow not found') ||
			message.includes('invalid escrow') ||
			// Common ethers.js error patterns
			message.includes('execution reverted') && message.includes('not found')
		);
	}
	
	return false;
}

/**
 * Check if an error is a network/connection error
 */
export function isNetworkError(error: unknown): boolean {
	if (isEscrowError(error)) {
		return error.code === EscrowErrorCode.ESCROW_NETWORK_ERROR;
	}
	
	if (error instanceof Error) {
		const message = error.message.toLowerCase();
		return (
			message.includes('network') ||
			message.includes('connection') ||
			message.includes('timeout') ||
			message.includes('fetch') ||
			message.includes('networkerror')
		);
	}
	
	return false;
}

/**
 * Create an EscrowError from an unknown error
 */
export function createEscrowError(error: unknown, context?: string): EscrowError {
	if (isEscrowError(error)) {
		return error;
	}
	
	if (error instanceof Error) {
		const message = error.message.toLowerCase();
		
		// Check for escrow not found
		if (
			message.includes('not found') ||
			message.includes('does not exist') ||
			message.includes('escrow not found') ||
			(message.includes('execution reverted') && message.includes('not found'))
		) {
			return new EscrowError(
				EscrowErrorCode.ESCROW_NOT_FOUND,
				`Escrow not found${context ? `: ${context}` : ''}`,
				error
			);
		}
		
		// Check for network errors
		if (
			message.includes('network') ||
			message.includes('connection') ||
			message.includes('timeout') ||
			message.includes('fetch')
		) {
			return new EscrowError(
				EscrowErrorCode.ESCROW_NETWORK_ERROR,
				`Network error while checking escrow${context ? `: ${context}` : ''}`,
				error
			);
		}
	}
	
	// Unknown error
	return new EscrowError(
		EscrowErrorCode.ESCROW_UNKNOWN_ERROR,
		`Unknown error while checking escrow${context ? `: ${context}` : ''}`,
		error
	);
}


import { describe, it, expect } from 'vitest';
import {
	EscrowError,
	EscrowErrorCode,
	isEscrowError,
	isEscrowNotFoundError,
	isNetworkError,
	createEscrowError
} from '$lib/utils/helpers/escrowErrors';

describe('escrowErrors', () => {
	describe('EscrowError', () => {
		it('should create EscrowError with code and message', () => {
			const error = new EscrowError(
				EscrowErrorCode.ESCROW_NOT_FOUND,
				'Escrow not found',
				undefined
			);

			expect(error).toBeInstanceOf(Error);
			expect(error).toBeInstanceOf(EscrowError);
			expect(error.code).toBe(EscrowErrorCode.ESCROW_NOT_FOUND);
			expect(error.message).toBe('Escrow not found');
			expect(error.name).toBe('EscrowError');
		});

		it('should store original error', () => {
			const originalError = new Error('Original error');
			const error = new EscrowError(
				EscrowErrorCode.ESCROW_NETWORK_ERROR,
				'Network error',
				originalError
			);

			expect(error.originalError).toBe(originalError);
		});
	});

	describe('isEscrowError', () => {
		it('should return true for EscrowError instance', () => {
			const error = new EscrowError(
				EscrowErrorCode.ESCROW_NOT_FOUND,
				'Test error',
				undefined
			);

			expect(isEscrowError(error)).toBe(true);
		});

		it('should return false for regular Error', () => {
			const error = new Error('Regular error');

			expect(isEscrowError(error)).toBe(false);
		});

		it('should return false for non-error values', () => {
			expect(isEscrowError('string')).toBe(false);
			expect(isEscrowError(null)).toBe(false);
			expect(isEscrowError(undefined)).toBe(false);
			expect(isEscrowError({})).toBe(false);
		});
	});

	describe('isEscrowNotFoundError', () => {
		it('should return true for ESCROW_NOT_FOUND error', () => {
			const error = new EscrowError(
				EscrowErrorCode.ESCROW_NOT_FOUND,
				'Escrow not found',
				undefined
			);

			expect(isEscrowNotFoundError(error)).toBe(true);
		});

		it('should return false for other EscrowError codes', () => {
			const error = new EscrowError(
				EscrowErrorCode.ESCROW_NETWORK_ERROR,
				'Network error',
				undefined
			);

			expect(isEscrowNotFoundError(error)).toBe(false);
		});

		it('should detect "not found" in error message', () => {
			const error = new Error('Escrow not found');

			expect(isEscrowNotFoundError(error)).toBe(true);
		});

		it('should detect "does not exist" in error message', () => {
			const error = new Error('Escrow does not exist');

			expect(isEscrowNotFoundError(error)).toBe(true);
		});

		it('should detect execution reverted with not found', () => {
			const error = new Error('execution reverted: Escrow not found');

			expect(isEscrowNotFoundError(error)).toBe(true);
		});

		it('should return false for unrelated errors', () => {
			const error = new Error('Some other error');

			expect(isEscrowNotFoundError(error)).toBe(false);
		});
	});

	describe('isNetworkError', () => {
		it('should return true for ESCROW_NETWORK_ERROR', () => {
			const error = new EscrowError(
				EscrowErrorCode.ESCROW_NETWORK_ERROR,
				'Network error',
				undefined
			);

			expect(isNetworkError(error)).toBe(true);
		});

		it('should detect "network" in error message', () => {
			const error = new Error('Network connection failed');

			expect(isNetworkError(error)).toBe(true);
		});

		it('should detect "connection" in error message', () => {
			const error = new Error('Connection timeout');

			expect(isNetworkError(error)).toBe(true);
		});

		it('should detect "timeout" in error message', () => {
			const error = new Error('Request timeout');

			expect(isNetworkError(error)).toBe(true);
		});

		it('should detect "fetch" in error message', () => {
			const error = new Error('Fetch failed');

			expect(isNetworkError(error)).toBe(true);
		});

		it('should return false for non-network errors', () => {
			const error = new Error('Validation failed');

			expect(isNetworkError(error)).toBe(false);
		});
	});

	describe('createEscrowError', () => {
		it('should return existing EscrowError unchanged', () => {
			const existingError = new EscrowError(
				EscrowErrorCode.ESCROW_NOT_FOUND,
				'Already an EscrowError',
				undefined
			);

			const result = createEscrowError(existingError);

			expect(result).toBe(existingError);
		});

		it('should create EscrowError from "not found" error', () => {
			const error = new Error('Escrow not found');
			const result = createEscrowError(error, 'Test context');

			expect(result).toBeInstanceOf(EscrowError);
			expect(result.code).toBe(EscrowErrorCode.ESCROW_NOT_FOUND);
			expect(result.message).toContain('Escrow not found');
			expect(result.message).toContain('Test context');
			expect(result.originalError).toBe(error);
		});

		it('should create EscrowError from "does not exist" error', () => {
			const error = new Error('Escrow does not exist');
			const result = createEscrowError(error);

			expect(result.code).toBe(EscrowErrorCode.ESCROW_NOT_FOUND);
		});

		it('should create EscrowError from network error', () => {
			const error = new Error('Network connection failed');
			const result = createEscrowError(error, 'Test context');

			expect(result).toBeInstanceOf(EscrowError);
			expect(result.code).toBe(EscrowErrorCode.ESCROW_NETWORK_ERROR);
			expect(result.message).toContain('Network error');
			expect(result.message).toContain('Test context');
		});

		it('should create EscrowError from unknown error', () => {
			const error = new Error('Unknown error');
			const result = createEscrowError(error, 'Test context');

			expect(result).toBeInstanceOf(EscrowError);
			expect(result.code).toBe(EscrowErrorCode.ESCROW_UNKNOWN_ERROR);
			expect(result.message).toContain('Unknown error');
			expect(result.message).toContain('Test context');
		});

		it('should handle non-Error values', () => {
			const result = createEscrowError('string error', 'Test context');

			expect(result).toBeInstanceOf(EscrowError);
			expect(result.code).toBe(EscrowErrorCode.ESCROW_UNKNOWN_ERROR);
		});

		it('should handle null/undefined', () => {
			const result1 = createEscrowError(null, 'Test context');
			const result2 = createEscrowError(undefined, 'Test context');

			expect(result1).toBeInstanceOf(EscrowError);
			expect(result2).toBeInstanceOf(EscrowError);
			expect(result1.code).toBe(EscrowErrorCode.ESCROW_UNKNOWN_ERROR);
			expect(result2.code).toBe(EscrowErrorCode.ESCROW_UNKNOWN_ERROR);
		});

		it('should include context in error message', () => {
			const error = new Error('Some error');
			const result = createEscrowError(error, 'Loading escrow 123');

			expect(result.message).toContain('Loading escrow 123');
		});
	});
});

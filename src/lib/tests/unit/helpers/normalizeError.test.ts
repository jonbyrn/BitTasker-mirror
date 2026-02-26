import { describe, it, expect } from 'vitest';
import { normalizeToError } from '$lib/utils/helpers/normalizeError';

describe('normalizeToError', () => {
	const defaultMsg = 'Something went wrong';

	it('returns the same Error when it has a non-empty message', () => {
		const err = new Error('Custom message');
		const result = normalizeToError(err, defaultMsg);
		expect(result).toBe(err);
		expect(result.message).toBe('Custom message');
	});

	it('returns new Error with default when Error has empty message', () => {
		const err = new Error('  ');
		const result = normalizeToError(err, defaultMsg);
		expect(result).toBeInstanceOf(Error);
		expect(result.message).toBe(defaultMsg);
		expect(result.cause).toBe(err);
	});

	it('extracts message from object with message property', () => {
		const result = normalizeToError({ message: 'API error' }, defaultMsg);
		expect(result).toBeInstanceOf(Error);
		expect(result.message).toBe('API error');
	});

	it('extracts message from object with data.message (API shape)', () => {
		const result = normalizeToError({ data: { message: 'No account' } }, defaultMsg);
		expect(result).toBeInstanceOf(Error);
		expect(result.message).toBe('No account');
	});

	it('uses string error as message', () => {
		const result = normalizeToError('String error', defaultMsg);
		expect(result).toBeInstanceOf(Error);
		expect(result.message).toBe('String error');
	});

	it('uses default when error is null or undefined', () => {
		expect(normalizeToError(null, defaultMsg).message).toBe(defaultMsg);
		expect(normalizeToError(undefined, defaultMsg).message).toBe(defaultMsg);
	});

	it('uses default when error object has no readable message', () => {
		const result = normalizeToError({ code: 400 }, defaultMsg);
		expect(result).toBeInstanceOf(Error);
		expect(result.message).toBe(defaultMsg);
		expect(result.cause).toEqual({ code: 400 });
	});
});

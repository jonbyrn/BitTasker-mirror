import { describe, expect, it } from 'vitest';
import {
	AUTH_SERVICE_UNAVAILABLE,
	isAuthServiceUnavailable
} from '$lib/utils/helpers/auth-unavailable';

describe('account service unavailable', () => {
	it('treats a 5xx and a hung username check as the account service being down', () => {
		expect(isAuthServiceUnavailable({ status: 500, message: 'Internal server error' })).toBe(true);
		expect(isAuthServiceUnavailable({ status: 503, message: 'Service Unavailable' })).toBe(true);
		expect(isAuthServiceUnavailable(new Error('username check timed out'))).toBe(true);
		expect(isAuthServiceUnavailable(new Error(AUTH_SERVICE_UNAVAILABLE))).toBe(true);
		expect(
			isAuthServiceUnavailable(
				new Error("Can't reach database server at postgres.railway.internal:5432")
			)
		).toBe(true);
	});

	it('leaves a missing account and a validation error alone', () => {
		expect(isAuthServiceUnavailable({ status: 400, message: 'No account associated' })).toBe(false);
		expect(isAuthServiceUnavailable(new Error('username is already taken'))).toBe(false);
		expect(isAuthServiceUnavailable(null)).toBe(false);
	});
});

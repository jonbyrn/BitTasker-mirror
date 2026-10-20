import { describe, expect, it } from 'vitest';
import { isUnavailablePasskeyError } from '$lib/utils/helpers/passkey-prompt';

describe('isUnavailablePasskeyError', () => {
	it('treats the browser timeout message as a missing authenticator', () => {
		const error = new DOMException(
			'The operation either timed out or was not allowed.',
			'NotAllowedError'
		);
		expect(isUnavailablePasskeyError(error)).toBe(true);
	});

	it('treats the wrapped passkey failure as unavailable', () => {
		const error = new Error('No passkey or authenticator was found on this device');
		error.name = 'PasskeyUnavailableError';
		expect(isUnavailablePasskeyError(error)).toBe(true);
	});

	it('leaves a relay failure alone', () => {
		expect(isUnavailablePasskeyError(new Error('relay down'))).toBe(false);
	});
});

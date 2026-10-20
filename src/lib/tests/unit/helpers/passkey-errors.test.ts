import { describe, expect, it } from 'vitest';
import { isTransientPasskeyFailure } from '$lib/utils/helpers/passkey-errors';

describe('isTransientPasskeyFailure', () => {
	it('retries the browser timeout that succeeds on the next prompt', () => {
		expect(
			isTransientPasskeyFailure({
				name: 'NotAllowedError',
				message: 'The operation either timed out or was not allowed'
			})
		).toBe(true);
	});

	it('does not retry an explicit cancel', () => {
		expect(
			isTransientPasskeyFailure({
				name: 'AbortError',
				message: 'The operation was aborted'
			})
		).toBe(false);
	});
});

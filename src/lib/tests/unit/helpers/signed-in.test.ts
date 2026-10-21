import { describe, expect, it } from 'vitest';
import { sessionLooksSignedIn } from '$lib/utils/helpers/signed-in';

describe('sessionLooksSignedIn', () => {
	it('requires both an access token and a public key', () => {
		expect(sessionLooksSignedIn('token', 'abc')).toBe(true);
		expect(sessionLooksSignedIn('token', '')).toBe(false);
		expect(sessionLooksSignedIn('token', null)).toBe(false);
		expect(sessionLooksSignedIn('', 'abc')).toBe(false);
		expect(sessionLooksSignedIn(null, null)).toBe(false);
	});
});

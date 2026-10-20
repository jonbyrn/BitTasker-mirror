import { describe, expect, it } from 'vitest';
import { sessionFresh, SIGNER_SESSION_TTL_MS } from '$lib/utils/helpers/signer-session';

describe('signer session freshness', () => {
	it('accepts a cache inside the 8 hour signing window', () => {
		const now = 1_000_000;
		expect(sessionFresh(now - 60_000, now, SIGNER_SESSION_TTL_MS)).toBe(true);
	});

	it('rejects an expired or future timestamp', () => {
		const now = 1_000_000;
		expect(sessionFresh(now - SIGNER_SESSION_TTL_MS - 1, now, SIGNER_SESSION_TTL_MS)).toBe(false);
		expect(sessionFresh(now + 5_000, now, SIGNER_SESSION_TTL_MS)).toBe(false);
	});
});

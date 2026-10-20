import { describe, expect, it } from 'vitest';
import { relayPublishError } from '$lib/utils/nostr';

describe('relayPublishError', () => {
	it('treats a resolved connection failure as a miss', () => {
		expect(relayPublishError('connection failure: socket closed')).toBe(
			'connection failure: socket closed'
		);
		expect(relayPublishError('Connection failure: timeout')).toBe('Connection failure: timeout');
	});

	it('accepts an OK reason', () => {
		expect(relayPublishError('')).toBeNull();
		expect(relayPublishError(undefined)).toBeNull();
		expect(relayPublishError('duplicate: already have this event')).toBeNull();
	});
});

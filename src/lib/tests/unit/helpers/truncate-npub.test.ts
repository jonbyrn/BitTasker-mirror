import { describe, expect, it } from 'vitest';
import { truncateNpub } from '$lib/utils/nostr';

describe('truncateNpub', () => {
	it('does not hex-decode a slug or a placeholder pubkey', () => {
		expect(truncateNpub('test')).toBe('test');
		expect(truncateNpub('test-rgb-tasks-0')).toBe('test-rgb-tasks-0');
	});
});

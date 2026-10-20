import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Event } from 'nostr-tools';

const hoisted = vi.hoisted(() => ({
	mockPublish: vi.fn(),
	mockQuery: vi.fn()
}));

vi.mock('$lib/utils/nostr', () => ({
	publishToMultipleRelays: (...args: unknown[]) => hoisted.mockPublish(...args)
}));

vi.mock('$lib/nostr/relayQuery', () => ({
	queryRelayEvents: (...args: unknown[]) => hoisted.mockQuery(...args)
}));

vi.mock('$lib/utils/relayUrls', () => ({
	resolveExplicitRelayUrls: () => ['wss://relay1-dev.bittasker.com']
}));

import { publishToGeneralRelays, queryGeneralRelays } from '$lib/nostr/general-relay';

function event(id: string, createdAt: number): Event {
	return {
		id,
		pubkey: 'a'.repeat(64),
		created_at: createdAt,
		kind: 30402,
		tags: [],
		content: '{}',
		sig: 'b'.repeat(128)
	};
}

describe('general relay service publishing', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('publishes a signed event to the sandbox general relays', async () => {
		hoisted.mockPublish.mockResolvedValue([
			{ relay: 'wss://relay1-dev.bittasker.com', success: true }
		]);
		const signed = event('service-1', 10);

		await publishToGeneralRelays(signed);

		expect(hoisted.mockPublish).toHaveBeenCalledWith(signed, ['wss://relay1-dev.bittasker.com']);
	});

	it('explains a relay failure instead of posting to /api/v1/events', async () => {
		hoisted.mockPublish.mockResolvedValue([
			{ relay: 'wss://relay1-dev.bittasker.com', success: false, error: 'timed out' }
		]);

		await expect(publishToGeneralRelays(event('service-1', 10))).rejects.toThrow(
			'Failed to publish to any relay'
		);
	});

	it('reads service events back from the same relays', async () => {
		hoisted.mockQuery.mockResolvedValue([event('service-1', 10), event('service-1', 12)]);

		const events = await queryGeneralRelays([{ kinds: [30402], '#d': ['service-123'] }]);

		expect(events).toHaveLength(1);
		expect(events[0]?.created_at).toBe(12);
	});
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Event } from 'nostr-tools';

const hoisted = vi.hoisted(() => ({
	publish: vi.fn(),
	query: vi.fn(),
	queryListing: vi.fn(),
	catalog: [] as string[],
	post: vi.fn(),
	get: vi.fn()
}));

vi.mock('$lib/nostr/general-relay', () => ({
	publishToGeneralRelays: (...args: unknown[]) => hoisted.publish(...args),
	queryGeneralRelays: (...args: unknown[]) => hoisted.query(...args)
}));

vi.mock('$lib/nostr/listing-relays', () => ({
	listingRelayUrls: () => hoisted.catalog,
	queryListingRelays: (...args: unknown[]) => hoisted.queryListing(...args),
	mergeRelayEvents: (groups: Array<Array<{ id?: string }> | undefined>) =>
		(groups ?? []).flatMap((group) => group ?? [])
}));

vi.mock('$lib/api/axios', () => ({
	default: vi.fn(async () => ({
		post: hoisted.post,
		get: hoisted.get
	}))
}));

vi.mock('$lib/api/apiService', () => ({
	BaseApiService: class {
		post = hoisted.post;
		get = hoisted.get;
	},
	isNotFoundError: () => false
}));

import nostrEventsService from '$lib/api/services/nostr/events';

function signed(id: string): Event {
	return {
		id,
		pubkey: 'a'.repeat(64),
		created_at: 20,
		kind: 30402,
		tags: [['d', 'website-bug-report']],
		content: '{"title":"Website bug report with screenshots"}',
		sig: 'b'.repeat(128)
	};
}

describe('service events stay on the general relays', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		hoisted.catalog.length = 0;
		hoisted.publish.mockResolvedValue(undefined);
		hoisted.query.mockResolvedValue([signed('listing')]);
		hoisted.queryListing.mockResolvedValue([signed('listing')]);
	});

	it('does not contain an /api/v1/events call', () => {
		const source = readFileSync(resolve('src/lib/api/services/nostr/events.ts'), 'utf8')
			.replace(/\/\*[\s\S]*?\*\//g, '')
			.replace(/\/\/.*$/gm, '');
		expect(source).not.toMatch(/\/api\/v1\/events/);
		expect(source).not.toMatch(/\.post\(/);
		expect(source).not.toMatch(/\.get\(/);
		expect(source).not.toContain('BaseApiService');
		expect(source).not.toContain('VITE_NOSTR_RELAY_NESTJS');
		expect(source).toContain('publishToGeneralRelays');
		expect(source).toContain('queryListingRelays');
		expect(source).toContain('31000');
	});

	it('publishes the review-step listing and its companion without HTTP', async () => {
		const companion = {
			...signed('location'),
			kind: 30404,
			tags: [['d', 'service-location:draft']]
		};
		const listing = signed('listing');

		await nostrEventsService.publishEvent(companion);
		await nostrEventsService.publishEvent(listing);

		expect(hoisted.publish).toHaveBeenNthCalledWith(1, companion);
		expect(hoisted.publish).toHaveBeenNthCalledWith(2, listing);
		expect(hoisted.queryListing).not.toHaveBeenCalled();
		expect(hoisted.post).not.toHaveBeenCalled();
		expect(hoisted.get).not.toHaveBeenCalled();
	});

	it('reads a resumed draft from the relays instead of POST /events/request', async () => {
		const events = await nostrEventsService.requestEvents({
			filters: [{ kinds: [30402, 30403], '#d': ['website-bug-report'] }]
		});

		expect(hoisted.query).toHaveBeenCalledWith([
			{ kinds: [30402, 30403], '#d': ['website-bug-report'] }
		]);
		expect(hoisted.queryListing).not.toHaveBeenCalled();
		expect(events.data).toHaveLength(1);
		expect(hoisted.post).not.toHaveBeenCalled();
	});

	it('reads services from the catalog relay when one is configured', async () => {
		hoisted.catalog.push('wss://relay2.bittasker.com');

		const events = await nostrEventsService.findEvents({ kinds: [30402], limit: 5 });

		expect(hoisted.queryListing).toHaveBeenCalledWith({ kinds: [30402], limit: 5 });
		expect(hoisted.query).not.toHaveBeenCalled();
		expect(events.data[0]?.id).toBe('listing');
	});

	it('queries listing filters together and passes the timeout', async () => {
		hoisted.catalog.push('wss://relay.bittasker.com');
		let pending = 0;
		let peak = 0;
		hoisted.queryListing.mockImplementation(async () => {
			pending += 1;
			peak = Math.max(peak, pending);
			await new Promise((resolve) => setTimeout(resolve, 15));
			pending -= 1;
			return [signed('listing')];
		});

		await nostrEventsService.requestEvents({
			filters: [
				{ kinds: [30402], '#d': ['one'] },
				{ kinds: [30402], '#d': ['two'] }
			],
			timeoutMs: 2000
		});

		expect(peak).toBe(2);
		expect(hoisted.queryListing).toHaveBeenCalledWith(
			{ kinds: [30402], '#d': ['one'] },
			{ timeoutMs: 2000 }
		);
		expect(hoisted.queryListing).toHaveBeenCalledWith(
			{ kinds: [30402], '#d': ['two'] },
			{ timeoutMs: 2000 }
		);
	});

	it('looks up one event and deletes it on the relays', async () => {
		const found = await nostrEventsService.findEventById('listing');
		expect(found.data.id).toBe('listing');

		const deletion = signed('delete');
		deletion.kind = 5;
		deletion.tags = [['e', 'listing']];
		const result = await nostrEventsService.deleteEvent(deletion);

		expect(result).toEqual({ deleteCount: 1, message: 'deleted' });
		expect(hoisted.publish).toHaveBeenCalledWith(deletion);
		expect(hoisted.post).not.toHaveBeenCalled();
		expect(hoisted.get).not.toHaveBeenCalled();
	});
});

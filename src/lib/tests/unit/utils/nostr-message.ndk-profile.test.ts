import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nip19 } from 'nostr-tools';

const mockFetchEvents = vi.hoisted(() => vi.fn());

vi.mock('$lib/nostr/ndk', () => ({
	ndk: {
		fetchEvents: (...args: Parameters<typeof mockFetchEvents>) => mockFetchEvents(...args),
		// profile/ndk.ts uses ndk.fetchEvent (singular) — resolve to the first Set entry.
		fetchEvent: async (...args: Parameters<typeof mockFetchEvents>) => {
			const set = (await mockFetchEvents(...args)) as Set<unknown> | null | undefined;
			return set && set.size > 0 ? [...set][0] : null;
		}
	}
}));

vi.mock('@nostr-dev-kit/ndk', () => ({
	NDKRelaySet: {
		fromRelayUrls: vi.fn(() => ({}))
	}
}));

vi.mock('$lib/utils/session', () => ({
	destroySession: vi.fn()
}));

vi.mock('$lib/stores/task.store', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$lib/stores/task.store')>();
	return {
		...actual,
		tasksStore: {
			subscribe: vi.fn(() => () => {}),
			update: vi.fn(),
			set: vi.fn(),
			reset: vi.fn(),
			pool: { querySync: vi.fn(() => []), subscribe: vi.fn(() => ({ close: vi.fn() })) }
		},
		myTasksStore: {
			subscribe: vi.fn(() => () => {}),
			update: vi.fn(),
			set: vi.fn(),
			reset: vi.fn()
		}
	};
});

vi.mock('$lib/stores/app.store', () => ({
	appStore: {
		subscribe: vi.fn(),
		set: vi.fn(),
		update: vi.fn()
	},
	get: vi.fn(() => ({ relays: ['wss://relay.example.com'] }))
}));

vi.mock('svelte/store', async (importOriginal) => {
	const actual = await importOriginal<typeof import('svelte/store')>();
	return {
		...actual,
		get: vi.fn(() => ({ relays: ['wss://relay.example.com'] }))
	};
});

vi.mock('$lib/utils/profile-cache', () => ({
	profileCache: {
		getProfile: vi.fn().mockResolvedValue(null),
		cacheProfile: vi.fn().mockResolvedValue(undefined),
		clear: vi.fn()
	}
}));

import { fetchProfileMetadata } from '$lib/nostr/profile/display-profile';

function mockNdkProfileEvent(content: Record<string, unknown>, createdAt = 1_700_000_001) {
	const pubkey = 'c'.repeat(64);
	return {
		toNostrEvent: vi.fn().mockResolvedValue({
			kind: 0,
			pubkey,
			created_at: createdAt,
			content: JSON.stringify(content),
			tags: [],
			id: 'id',
			sig: 'sig'
		})
	};
}

describe('fetchProfileMetadata (NDK)', () => {
	const pubkey = 'c'.repeat(64);
	const npub = nip19.npubEncode(pubkey);

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('prefers display_name over plain name from kind 0', async () => {
		mockFetchEvents.mockResolvedValue(
			new Set([
				mockNdkProfileEvent({
					display_name: 'NDK Test User',
					name: 'Ignored',
					picture: 'https://example.com/avatar.jpg'
				})
			])
		);

		const result = await fetchProfileMetadata(npub);

		expect(mockFetchEvents).toHaveBeenCalled();
		expect(result.name).toBe('NDK Test User');
		expect(result.picture).toBe('https://example.com/avatar.jpg');
	});

	it('uses name when no display fields are present', async () => {
		mockFetchEvents.mockResolvedValue(
			new Set([mockNdkProfileEvent({ name: 'Only Name Field' }, 1_700_000_000)])
		);

		const result = await fetchProfileMetadata(npub);

		expect(result.name).toBe('Only Name Field');
		expect(result.picture).toBeUndefined();
	});

	it('returns empty shape when no profile events are returned', async () => {
		mockFetchEvents.mockResolvedValue(new Set());

		const result = await fetchProfileMetadata(npub);

		expect(result).toEqual({
			name: undefined,
			picture: undefined,
			createdAt: undefined
		});
	});

	it('normalizes npub and hex pubkey to the same author filter', async () => {
		mockFetchEvents.mockResolvedValue(
			new Set([mockNdkProfileEvent({ display_name: 'Test' }, 1_700_000_000)])
		);

		await fetchProfileMetadata(npub);
		const filterNpub = mockFetchEvents.mock.calls.at(-1)?.[0] as { authors?: string[] };
		expect(filterNpub?.authors?.[0]).toBe(pubkey);

		await fetchProfileMetadata(pubkey);
		const filterHex = mockFetchEvents.mock.calls.at(-1)?.[0] as { authors?: string[] };
		expect(filterHex?.authors?.[0]).toBe(pubkey);
	});
});

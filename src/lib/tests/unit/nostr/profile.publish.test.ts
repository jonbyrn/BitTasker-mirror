import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NostrProfile } from '$lib/types/profile.d';

const { mockPool, mockFetchEvent, mockPublishAuth, mockQueryRelay } = vi.hoisted(() => ({
	mockPublishAuth: vi.fn(async () => [{ relay: 'wss://relay.example', success: true }]),
	mockQueryRelay: vi.fn(async () => []),
	mockPool: {
		publish: vi.fn(() => [Promise.resolve()]),
		get: vi.fn(),
		subscribe: vi.fn(() => ({ close: vi.fn() })),
		querySync: vi.fn(() => [])
	},
	mockFetchEvent: vi.fn()
}));

vi.mock('$lib/stores/task.store', () => ({
	tasksStore: {
		subscribe: vi.fn(() => () => {}),
		update: vi.fn(),
		set: vi.fn(),
		reset: vi.fn(),
		pool: mockPool
	},
	myTasksStore: {
		subscribe: vi.fn(() => () => {}),
		update: vi.fn(),
		set: vi.fn(),
		reset: vi.fn()
	}
}));

vi.mock('$lib/utils/session', () => ({
	destroySession: vi.fn()
}));

vi.mock('$lib/nostr/relaySession', () => ({
	publishWithRelayAuth: (...args: unknown[]) => mockPublishAuth(...args)
}));

vi.mock('$lib/nostr/relayQuery', () => ({
	queryRelayEvents: (...args: unknown[]) => mockQueryRelay(...args)
}));

vi.mock('$lib/nostr/ndkSigner', () => ({
	syncNdkSignerFromAppStore: vi.fn(),
	applyNdkSignerFromNsec: vi.fn()
}));

vi.mock('$lib/nostr/ndkInstance', () => ({
	ndk: {
		signer: { pubkey: 'abc' },
		fetchEvent: mockFetchEvent,
		fetchEvents: vi.fn().mockResolvedValue(new Set()),
		$currentPubkey: null,
		connect: vi.fn()
	},
	ndkCacheDbBaseName: vi.fn(() => 'cache-test')
}));

const mockPublish = vi.fn();
const mockSign = vi.fn();
const mockToNostrEvent = vi.fn();

vi.mock('@nostr-dev-kit/ndk', () => ({
	NDKEvent: vi.fn(function MockNDKEvent(this: {
		kind: number;
		created_at: number;
		content: string;
		tags: string[][];
		sign: typeof mockSign;
		publish: typeof mockPublish;
		toNostrEvent: typeof mockToNostrEvent;
	}) {
		this.kind = 0;
		this.created_at = 0;
		this.content = '';
		this.tags = [];
		this.sign = mockSign;
		this.publish = mockPublish;
		this.toNostrEvent = mockToNostrEvent;
	}),
	NDKRelaySet: {
		fromRelayUrls: vi.fn(() => ({}))
	}
}));

vi.mock('$lib/nostr/ndk', () => ({
	ndk: {
		signer: { pubkey: 'abc' },
		fetchEvent: mockFetchEvent,
		fetchEvents: vi.fn().mockResolvedValue(new Set())
	},
	setNDKSigner: vi.fn(),
	ndkLogout: vi.fn()
}));

vi.mock('$lib/stores/app.store', () => ({
	appStore: {
		subscribe: vi.fn(),
		set: vi.fn(),
		update: vi.fn()
	},
	get: vi.fn(() => ({ relays: ['wss://relay.example'], pool: mockPool }))
}));

vi.mock('svelte/store', async (importOriginal) => {
	const actual = await importOriginal<typeof import('svelte/store')>();
	return {
		...actual,
		get: vi.fn(() => ({ relays: ['wss://relay.example'], pool: mockPool }))
	};
});

vi.mock('$lib/api/services/upload.service', () => ({
	default: {
		uploadSingleFile: vi.fn()
	}
}));

vi.mock('$lib/utils/profile-cache', () => ({
	profileCache: {
		invalidate: vi.fn(),
		cacheProfile: vi.fn()
	}
}));

import { get } from 'svelte/store';
import {
	buildProfileMetadataWire,
	publishProfileMetadata,
	resolveDisplayNameFromProfileMetadataContent,
	verifyProfileMetadataOnRelays
} from '$lib/nostr/profile';

const AUTHOR_HEX = 'deadbeef'.repeat(8);

describe('buildProfileMetadataWire', () => {
	it('publishes only display_name when legacy name matches display_name', () => {
		const wire = buildProfileMetadataWire({ name: 'Alice', display_name: 'Alice' });
		expect(wire).toEqual({ display_name: 'Alice' });
		expect(wire).not.toHaveProperty('name');
	});

	it('never includes name on wire even when merge retained a distinct legacy name', () => {
		const wire = buildProfileMetadataWire({ name: 'alice', display_name: 'Alice' });
		expect(wire.display_name).toBe('Alice');
		expect(wire).not.toHaveProperty('name');
	});

	it('never includes deprecated displayName or username on wire', () => {
		const wire = buildProfileMetadataWire({
			display_name: 'Alice',
			displayName: 'Legacy',
			username: 'legacy_user'
		} as NostrProfile);
		expect(wire.display_name).toBe('Alice');
		expect(wire).not.toHaveProperty('displayName');
		expect(wire).not.toHaveProperty('username');
		expect(wire).not.toHaveProperty('name');
	});
});

describe('resolveDisplayNameFromProfileMetadataContent', () => {
	it('uses display_name > name > displayName > username', () => {
		expect(
			resolveDisplayNameFromProfileMetadataContent({
				username: 'u',
				displayName: 'Legacy',
				name: 'Name',
				display_name: 'Display'
			})
		).toBe('Display');
		expect(
			resolveDisplayNameFromProfileMetadataContent({
				username: 'u',
				displayName: 'Legacy',
				name: 'Name'
			})
		).toBe('Name');
	});
});

describe('publishProfileMetadata', () => {
	beforeEach(() => {
		(globalThis as typeof globalThis & { __APP_VERSION__: string }).__APP_VERSION__ = 'test';
		vi.clearAllMocks();
		mockSign.mockResolvedValue(undefined);
		mockPublish.mockResolvedValue(new Map([['wss://relay.example', true]]));
		mockPublishAuth.mockResolvedValue([{ relay: 'wss://relay.example', success: true }]);
		mockQueryRelay.mockResolvedValue([]);
		mockToNostrEvent.mockResolvedValue({
			id: 'event-id',
			pubkey: AUTHOR_HEX,
			sig: 'sig',
			kind: 0,
			created_at: 1,
			tags: [],
			content: '{}'
		});
		vi.mocked(get).mockReturnValue({ relays: ['wss://relay.example'] });
	});

	it('writes enrichment without name on wire', async () => {
		await publishProfileMetadata(
			{ about: 'Bio text', professionalTitle: 'Plumber' },
			{ name: 'Alice', display_name: 'Alice' },
			['wss://relay.example'],
			false
		);

		const ndkCtor = (await import('@nostr-dev-kit/ndk')).NDKEvent as unknown as ReturnType<
			typeof vi.fn
		>;
		const instance = ndkCtor.mock.results[0]?.value;
		const content = JSON.parse(instance.content) as Record<string, unknown>;
		expect(content.display_name).toBe('Alice');
		expect(content.name).toBeUndefined();
		expect(content.about).toBe('Bio text');
	});

	it('publishes only display_name for minimal signup step 0 payload', async () => {
		await publishProfileMetadata({ display_name: 'Alice' }, {}, ['wss://relay.example'], false);

		const ndkCtor = (await import('@nostr-dev-kit/ndk')).NDKEvent as unknown as ReturnType<
			typeof vi.fn
		>;
		const instance = ndkCtor.mock.results[0]?.value;
		const content = JSON.parse(instance.content) as Record<string, unknown>;
		expect(content).toEqual({ display_name: 'Alice' });
	});

	it('verifies display name from the relay after publish', async () => {
		mockQueryRelay.mockResolvedValue([
			{
				id: 'event-id',
				pubkey: AUTHOR_HEX,
				sig: 'sig',
				kind: 0,
				created_at: 1,
				tags: [],
				content: JSON.stringify({ display_name: 'Bob' })
			}
		]);

		await publishProfileMetadata({ display_name: 'Bob' }, {}, ['wss://relay.example'], {
			requiredDisplayName: 'Bob',
			timeoutMs: 2000,
			pollIntervalMs: 10
		});

		expect(mockPublishAuth).toHaveBeenCalled();
		expect(mockQueryRelay).toHaveBeenCalled();
	});

	it('reports a slow relay as a publish timeout', async () => {
		mockPublishAuth.mockResolvedValue([
			{ relay: 'wss://relay.example', success: false, error: 'timed out before the relay finished' }
		]);

		await expect(
			publishProfileMetadata({ display_name: 'Bob' }, {}, ['wss://relay.example'], false, 4000)
		).rejects.toThrow('PROFILE_METADATA_PUBLISH_TIMEOUT');
		expect(mockPublishAuth).toHaveBeenCalledWith(expect.anything(), ['wss://relay.example'], 4000);
	});

	it('throws when relays reject publish', async () => {
		mockPublishAuth.mockResolvedValue([
			{ relay: 'wss://relay.example', success: false, error: 'rejected' }
		]);

		await expect(
			publishProfileMetadata({ display_name: 'Bob' }, {}, ['wss://relay.example'], false)
		).rejects.toThrow('PROFILE_METADATA_PUBLISH_REJECTED');
	});

	it('reuses the unlocked signer and does not open WebAuthn', async () => {
		const { ndk } = await import('$lib/nostr/ndk');
		const nostrKeys = await import('$lib/utils/nostrKeys');
		const previous = ndk.signer;
		ndk.signer = null;
		const getNostrKeyPair = vi.spyOn(nostrKeys, 'getNostrKeyPair').mockImplementation(async () => {
			ndk.signer = { pubkey: 'abc' } as NonNullable<typeof ndk.signer>;
			return { npub: 'npub1test', nsec: new Uint8Array(32) };
		});
		const prepareSigner = vi.spyOn(nostrKeys, 'prepareSigner').mockImplementation(() => {
			throw new Error('profile save must not open WebAuthn');
		});

		try {
			await publishProfileMetadata({ display_name: 'Ada' }, {}, ['wss://relay.example'], false);
			expect(getNostrKeyPair).toHaveBeenCalledOnce();
			expect(getNostrKeyPair).toHaveBeenCalledWith();
			expect(prepareSigner).not.toHaveBeenCalled();
		} finally {
			getNostrKeyPair.mockRestore();
			prepareSigner.mockRestore();
			ndk.signer = previous;
		}
	});
});

describe('verifyProfileMetadataOnRelays', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(get).mockReturnValue({ relays: ['wss://relay.example'] });
	});

	it('resolves when the relay read-back matches the required display name', async () => {
		mockQueryRelay.mockResolvedValue([
			{
				id: 'event-id',
				pubkey: AUTHOR_HEX,
				sig: 'sig',
				kind: 0,
				created_at: 1,
				tags: [],
				content: JSON.stringify({ display_name: 'Alice' })
			}
		]);

		await expect(
			verifyProfileMetadataOnRelays(AUTHOR_HEX, {
				requiredDisplayName: 'Alice',
				timeoutMs: 2000,
				pollIntervalMs: 10
			})
		).resolves.toBeUndefined();
	});

	it('throws when verify times out', async () => {
		mockQueryRelay.mockResolvedValue([]);

		await expect(
			verifyProfileMetadataOnRelays(AUTHOR_HEX, {
				requiredDisplayName: 'Alice',
				timeoutMs: 50,
				pollIntervalMs: 20
			})
		).rejects.toThrow('PROFILE_METADATA_VERIFY_TIMEOUT');
	});
});

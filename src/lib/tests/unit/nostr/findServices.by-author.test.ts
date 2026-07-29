import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nip19, type Event as NostrEvent } from 'nostr-tools';
import KINDS from '$lib/utils/constants/kinds';

const mockRequestEvents = vi.fn();

vi.mock('$lib/api/services/nostr/events', () => ({
	default: {
		requestEvents: (...args: unknown[]) => mockRequestEvents(...args)
	}
}));

vi.mock('$lib/nostr/profile', () => ({
	fetchComprehensiveProfile: vi.fn().mockResolvedValue(null)
}));

function createServiceEvent(overrides: {
	id: string;
	pubkey: string;
	created_at: number;
	uniqueId: string;
	status?: 'active' | 'inactive' | 'sold';
	title?: string;
}): NostrEvent {
	return {
		id: overrides.id,
		pubkey: overrides.pubkey,
		created_at: overrides.created_at,
		kind: KINDS.SERVICE_ACTIVE,
		tags: [],
		sig: '',
		content: JSON.stringify({
			uniqueId: overrides.uniqueId,
			status: overrides.status ?? 'active',
			title: overrides.title ?? `Service ${overrides.id}`,
			description: 'Service description',
			serviceLocationTypes: ['remote'],
			pricing: {
				type: 'FIXED',
				currency: 'USDt',
				amount: 50
			},
			skills: [],
			categories: [],
			createdAt: overrides.created_at,
			creator: {
				username: 'alice',
				avatar: ''
			}
		})
	};
}

describe('findProfileServicesByAuthor', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
	});

	it('decodes npub authors, filters deleted and inactive events, and keeps the newest unique service', async () => {
		const hexPubkey = '11'.repeat(32);
		const npub = nip19.npubEncode(hexPubkey);

		mockRequestEvents
			.mockResolvedValueOnce({
				data: [
					createServiceEvent({
						id: 'service-old',
						pubkey: hexPubkey,
						created_at: 1_700_000_000,
						uniqueId: 'service-a'
					}),
					createServiceEvent({
						id: 'service-new',
						pubkey: hexPubkey,
						created_at: 1_700_000_100,
						uniqueId: 'service-a',
						title: 'Newer service'
					}),
					createServiceEvent({
						id: 'service-deleted',
						pubkey: hexPubkey,
						created_at: 1_700_000_200,
						uniqueId: 'service-b'
					}),
					createServiceEvent({
						id: 'service-inactive',
						pubkey: hexPubkey,
						created_at: 1_700_000_300,
						uniqueId: 'service-c',
						status: 'inactive'
					})
				]
			})
			.mockResolvedValueOnce({
				data: [
					{
						id: 'delete-1',
						tags: [['e', 'service-deleted']]
					}
				]
			});

		const { findProfileServicesByAuthor } = await import('$lib/nostr/findProfileServices');
		const services = await findProfileServicesByAuthor(npub, { limit: 12 });

		expect(mockRequestEvents).toHaveBeenNthCalledWith(1, {
			filters: [
				{
					kinds: [KINDS.SERVICE_ACTIVE],
					authors: [hexPubkey],
					limit: 12
				}
			]
		});
		expect(services).toHaveLength(1);
		expect(services[0]).toMatchObject({
			id: 'service-new',
			uniqueId: 'service-a',
			title: 'Newer service'
		});
	}, 15000);

	it('uses the default limit for raw hex pubkeys, falls back to event timestamps, and reuses cached deletion ids', async () => {
		const hexPubkey = '22'.repeat(32);

		mockRequestEvents
			.mockResolvedValueOnce({
				data: [
					{
						id: 'service-raw-1',
						pubkey: hexPubkey,
						created_at: 1_710_000_000,
						kind: KINDS.SERVICE_ACTIVE,
						tags: [],
						content: JSON.stringify({
							uniqueId: 'service-raw-1',
							status: 'active',
							title: 'Raw service',
							description: 'Uses event timestamp fallback',
							serviceLocationTypes: ['remote'],
							pricing: {
								type: 'FIXED',
								currency: 'USDt',
								amount: 25
							},
							skills: [],
							categories: []
						})
					}
				]
			})
			.mockResolvedValueOnce({ data: [] })
			.mockResolvedValueOnce({
				data: [
					{
						id: 'service-raw-2',
						pubkey: hexPubkey,
						created_at: 1_710_000_100,
						kind: KINDS.SERVICE_ACTIVE,
						tags: [],
						content: JSON.stringify({
							uniqueId: 'service-raw-2',
							status: 'active',
							title: 'Second raw service',
							description: 'Reuses cached deletions',
							serviceLocationTypes: ['remote'],
							pricing: {
								type: 'FIXED',
								currency: 'USDt',
								amount: 30
							},
							skills: [],
							categories: []
						})
					}
				]
			});

		const { findProfileServicesByAuthor } = await import('$lib/nostr/findProfileServices');
		const firstResult = await findProfileServicesByAuthor(hexPubkey);
		const secondResult = await findProfileServicesByAuthor(hexPubkey);

		expect(mockRequestEvents).toHaveBeenNthCalledWith(1, {
			filters: [
				{
					kinds: [KINDS.SERVICE_ACTIVE],
					authors: [hexPubkey],
					limit: 8
				}
			]
		});
		expect(firstResult[0]).toMatchObject({
			id: 'service-raw-1',
			createdAt: 1_710_000_000
		});
		expect(secondResult[0]).toMatchObject({
			id: 'service-raw-2'
		});
		expect(mockRequestEvents).toHaveBeenCalledTimes(3);
	});

	it('throws when author pubkey is blank', async () => {
		const { findProfileServicesByAuthor } = await import('$lib/nostr/findProfileServices');
		await expect(findProfileServicesByAuthor('   ')).rejects.toThrow('Author pubkey is required.');
	});
});

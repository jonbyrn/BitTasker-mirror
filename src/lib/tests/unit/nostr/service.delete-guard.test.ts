import { beforeEach, describe, expect, it, vi } from 'vitest';
import { assertServiceDeletionAllowed, deleteService } from '$lib/nostr/service';

const hoisted = vi.hoisted(() => ({
	mockDeleteEvent: vi.fn(),
	mockGetSignedEvent: vi.fn(),
	mockRequestEvents: vi.fn()
}));

vi.mock('$lib/utils/nostr', () => ({
	getSignedEvent: (...args: Parameters<typeof hoisted.mockGetSignedEvent>) =>
		hoisted.mockGetSignedEvent(...args)
}));

vi.mock('$lib/api/services/nostr/events', () => ({
	default: {
		deleteEvent: (...args: Parameters<typeof hoisted.mockDeleteEvent>) =>
			hoisted.mockDeleteEvent(...args),
		requestEvents: (...args: Parameters<typeof hoisted.mockRequestEvents>) =>
			hoisted.mockRequestEvents(...args),
		publishEvent: vi.fn()
	}
}));

vi.mock('$lib/utils/nostrKeys', () => ({
	getNpub: vi.fn().mockResolvedValue('a'.repeat(64))
}));

vi.mock('$lib/services/translation.service', () => ({
	TranslationService: class {
		isAvailable() {
			return false;
		}
	}
}));

vi.mock('$lib/stores/user.store', async () => {
	const { readable } = await import('svelte/store');
	return {
		user: readable({
			name: 'Provider',
			picture: ''
		})
	};
});

describe('deleteService guard enforcement', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		hoisted.mockRequestEvents.mockResolvedValue({
			data: []
		});
		hoisted.mockGetSignedEvent.mockResolvedValue({
			id: 'signed-delete',
			kind: 5,
			content: 'Service deleted',
			tags: [['e', 'service-event-1']],
			pubkey: 'a'.repeat(64),
			sig: 'b'.repeat(128)
		});
		hoisted.mockDeleteEvent.mockResolvedValue({
			deleteCount: 1,
			message: 'deleted'
		});
	});

	it('allows deletion when only open quotes remain', async () => {
		expect(() =>
			assertServiceDeletionAllowed({
				hasOpenQuotes: true,
				hasActiveContracts: false
			})
		).not.toThrow();

		await expect(
			deleteService('service-event-1', {
				hasOpenQuotes: true,
				hasActiveContracts: false
			})
		).resolves.toBe('deleted');
		expect(hoisted.mockDeleteEvent).toHaveBeenCalledTimes(1);
	});

	it('rejects deletion when active contracts remain', async () => {
		await expect(
			deleteService('service-event-1', {
				hasOpenQuotes: false,
				hasActiveContracts: true
			})
		).rejects.toThrow('Cannot delete a service with active contracts.');
		expect(hoisted.mockDeleteEvent).not.toHaveBeenCalled();
	});

	it('publishes the deletion event when the guard passes', async () => {
		await expect(
			deleteService('service-event-1', {
				hasOpenQuotes: false,
				hasActiveContracts: false
			})
		).resolves.toBe('deleted');

		expect(hoisted.mockDeleteEvent).toHaveBeenCalledTimes(1);
		expect(hoisted.mockGetSignedEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				kind: 5,
				tags: [
					['e', 'service-event-1'],
					['d', 'service-event-1']
				]
			})
		);
	});

	it('deletes every known version for the same service unique id', async () => {
		hoisted.mockRequestEvents.mockResolvedValueOnce({
			data: [
				{
					id: 'service-event-1',
					pubkey: 'a'.repeat(64),
					created_at: 1_700_000_200,
					kind: 30402,
					tags: [['d', 'service-123']],
					content: '{}'
				},
				{
					id: 'service-event-old-draft',
					pubkey: 'a'.repeat(64),
					created_at: 1_700_000_100,
					kind: 30403,
					tags: [['d', 'service-123']],
					content: '{}'
				}
			]
		});

		await expect(
			deleteService(
				'service-event-1',
				{
					hasOpenQuotes: false,
					hasActiveContracts: false
				},
				{
					uniqueId: 'service-123'
				}
			)
		).resolves.toBe('deleted');

		expect(hoisted.mockRequestEvents).toHaveBeenCalledWith({
			filters: [
				expect.objectContaining({
					kinds: [30402, 30403],
					'#d': ['service-123'],
					authors: ['a'.repeat(64)],
					limit: 20
				})
			]
		});
		expect(hoisted.mockGetSignedEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				kind: 5,
				tags: [
					['e', 'service-event-1'],
					['e', 'service-event-old-draft'],
					['d', 'service-123']
				]
			})
		);
	});
});

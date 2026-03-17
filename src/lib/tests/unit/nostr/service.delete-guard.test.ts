import { beforeEach, describe, expect, it, vi } from 'vitest';
import { assertServiceDeletionAllowed, deleteService } from '$lib/nostr/service';

const hoisted = vi.hoisted(() => ({
	mockDeleteEvent: vi.fn(),
	mockGetSignedEvent: vi.fn()
}));

vi.mock('$lib/utils/nostr', () => ({
	getSignedEvent: (...args: Parameters<typeof hoisted.mockGetSignedEvent>) =>
		hoisted.mockGetSignedEvent(...args)
}));

vi.mock('$lib/api/services/nostr/events', () => ({
	default: {
		deleteEvent: (...args: Parameters<typeof hoisted.mockDeleteEvent>) =>
			hoisted.mockDeleteEvent(...args),
		requestEvents: vi.fn(),
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

	it('rejects deletion when open quotes remain', async () => {
		expect(() =>
			assertServiceDeletionAllowed({
				hasOpenQuotes: true,
				hasActiveContracts: false
			})
		).toThrow('Cannot delete a service with open quotes.');

		await expect(
			deleteService('service-event-1', {
				hasOpenQuotes: true,
				hasActiveContracts: false
			})
		).rejects.toThrow('Cannot delete a service with open quotes.');
		expect(hoisted.mockDeleteEvent).not.toHaveBeenCalled();
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
				tags: [['e', 'service-event-1']]
			})
		);
	});
});

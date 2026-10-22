import { beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { findServices, cleanup } from '$lib/nostr/findServices';
import { servicesStore } from '$lib/stores/service.store';
import nostrEventsService from '$lib/api/services/nostr/events';

vi.mock('$lib/api/services/nostr/events', () => ({
	default: {
		findEvents: vi.fn(),
		requestEvents: vi.fn()
	}
}));

vi.mock('$lib/nostr/profile', () => ({
	fetchComprehensiveProfile: vi.fn().mockResolvedValue(null)
}));

vi.mock('$lib/utils/nostrKeys', () => ({
	getNpub: vi.fn(() => new Promise(() => {}))
}));

describe('findServices Typesense catalog', () => {
	const mockFindEvents = vi.mocked(nostrEventsService.findEvents);

	beforeEach(() => {
		vi.clearAllMocks();
		cleanup();
		servicesStore.update((state) => ({ ...state, items: [], loading: false, error: null }));
	});

	it('returns every indexed service and does not call the relay', async () => {
		const services = Array.from({ length: 21 }, (_, index) => ({
			id: `row-${index}`,
			event_id: `event-${index}`,
			public_id: `service-${index}`,
			title: index === 0 ? 'Limpieza Profunda de Hogar' : `Servicio ${index}`,
			description: 'cleaning',
			pubkey: `pk-${index}`,
			status: 'active',
			pricing: { type: 'FIXED', amount: 10, currency: 'USD' },
			skills: ['cleaning'],
			serviceLocationTypes: ['REMOTE'],
			created_at: 100 - index
		}));
		vi.stubGlobal(
			'fetch',
			vi.fn(async (input: RequestInfo | URL) => {
				const url = String(input);
				if (url.includes('/health')) {
					return new Response(JSON.stringify({ provider: 'typesense', ready: true }));
				}
				return new Response(
					JSON.stringify({ services, found: services.length, total: services.length })
				);
			})
		);

		const result = await findServices({ page: 1, limit: 20, search: 'cleaning' });

		expect(mockFindEvents).not.toHaveBeenCalled();
		expect(result.services).toHaveLength(21);
		expect(result.total).toBe(21);
		expect(result.hasMore).toBe(false);
		expect(result.services[0].title).toBe('Limpieza Profunda de Hogar');
		expect(get(servicesStore).items).toHaveLength(21);
	});

	it('keeps an empty catalog empty instead of reading the relay', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async (input: RequestInfo | URL) => {
				if (String(input).includes('/health')) {
					return new Response(JSON.stringify({ provider: 'typesense', ready: true }));
				}
				return new Response(JSON.stringify({ services: [], found: 0, total: 0 }));
			})
		);

		const result = await findServices({ page: 1, limit: 20, search: '' });
		expect(mockFindEvents).not.toHaveBeenCalled();
		expect(result.services).toEqual([]);
		expect(result.total).toBe(0);
	});
});

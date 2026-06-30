import { beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';

const mockSubscribeToProfileUpdates = vi.fn();
const mockCloseNostrPool = vi.fn();
const mockLoadCurrentProfileServices = vi.fn();
const mockCleanup = vi.fn();

vi.mock('$lib/nostr/profile', () => ({
	subscribeToProfileUpdates: (...args: unknown[]) => mockSubscribeToProfileUpdates(...args),
	closeNostrPool: (...args: unknown[]) => mockCloseNostrPool(...args)
}));

vi.mock('$lib/utils/profile/services-loader', () => ({
	loadCurrentProfileServices: (...args: unknown[]) => mockLoadCurrentProfileServices(...args)
}));

vi.mock('$lib/utils/nostrKeys', () => ({
	getNpub: vi.fn().mockResolvedValue('npub1test')
}));

vi.mock('$lib/utils/reviews/queries', () => ({
	getReviewsForUser: vi.fn().mockResolvedValue([]),
	subscribeToUserAttestations: vi.fn(() => () => {})
}));

vi.mock('$lib/utils/reviews/aggregation', () => ({
	calculateReviewStats: vi.fn().mockReturnValue({ totalReviews: 0, averageRating: 0 })
}));

describe('profile.store', () => {
	beforeEach(async () => {
		vi.resetModules();
		vi.clearAllMocks();
		mockSubscribeToProfileUpdates.mockResolvedValue(mockCleanup);
		mockLoadCurrentProfileServices.mockResolvedValue({
			services: [],
			error: null
		});

		const { profileStore } = await import('$lib/stores/profile.store');
		profileStore.reset();
	});

	it('loads active services and updates the service metric during init', async () => {
		mockLoadCurrentProfileServices.mockResolvedValue({
			services: [
				{
					id: 'service-1',
					uniqueId: 'service-1',
					title: 'Logo Design',
					npub: 'npub1profiletest',
					status: 'active',
					description: 'Design service',
					serviceLocationTypes: ['remote'],
					pricing: { type: 'FIXED', currency: 'USDt', amount: 50 },
					skills: [],
					categories: [],
					createdAt: 1_700_000_000
				}
			],
			error: null
		});

		const { profileStore } = await import('$lib/stores/profile.store');
		await profileStore.init();

		const state = get(profileStore);
		expect(state.isLoading).toBe(false);
		expect(state.servicesLoading).toBe(false);
		expect(state.servicesError).toBe(null);
		expect(state.services).toHaveLength(1);
		expect(state.stats.activeServices).toBe(1);
		expect(mockLoadCurrentProfileServices).toHaveBeenCalledTimes(1);
	});

	it('keeps the profile available and surfaces service-load errors locally', async () => {
		mockLoadCurrentProfileServices.mockResolvedValue({
			services: [],
			error: 'Failed to load profile services'
		});

		const { profileStore } = await import('$lib/stores/profile.store');
		await profileStore.init();

		const state = get(profileStore);
		expect(state.isLoading).toBe(false);
		expect(state.servicesLoading).toBe(false);
		expect(state.services).toEqual([]);
		expect(state.stats.activeServices).toBe(0);
		expect(state.servicesError).toBe('Failed to load profile services');
	});

	it('destroy cleans up subscriptions and the nostr pool', async () => {
		mockLoadCurrentProfileServices.mockResolvedValue({
			services: [],
			error: null
		});

		const { profileStore } = await import('$lib/stores/profile.store');
		await profileStore.init();
		mockCleanup.mockClear();
		mockCloseNostrPool.mockClear();
		profileStore.destroy();

		expect(mockCleanup).toHaveBeenCalledTimes(1);
		expect(mockCloseNostrPool).toHaveBeenCalledTimes(1);
	});
});

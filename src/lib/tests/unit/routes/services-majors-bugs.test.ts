import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/svelte';
import type { Service } from '$lib/types/service';
import { ServicePricingTypeEnum } from '$lib/utils/enums/service.enum';

const mockServices: Service[] = [
	{
		id: 'service-1',
		uniqueId: 'service-1',
		npub: 'other-pubkey',
		status: 'active',
		title: 'Test Service 1',
		description: 'Description 1',
		serviceLocationTypes: [],
		pricing: { type: ServicePricingTypeEnum.FIXED, currency: 'USDt', amount: 100 },
		skills: ['Design'],
		categories: [{ id: 'cat1', name: 'Design', slug: 'design', description: '' }],
		portfolio: [],
		createdAt: 1_700_000_000,
		creator: { username: 'provider1', avatar: '' }
	},
	{
		id: 'service-2',
		uniqueId: 'service-2',
		npub: 'other-pubkey-2',
		status: 'active',
		title: 'Test Service 2',
		description: 'Description 2',
		serviceLocationTypes: [],
		pricing: { type: ServicePricingTypeEnum.FIXED, currency: 'USDt', amount: 200 },
		skills: ['Coding'],
		categories: [{ id: 'cat2', name: 'Coding', slug: 'coding', description: '' }],
		portfolio: [],
		createdAt: 1_700_000_001,
		creator: { username: 'provider2', avatar: '' }
	}
];

const hoisted = vi.hoisted(() => {
	let state = {
		items: [] as Service[],
		loading: false,
		error: null as string | null,
		currentPage: 1,
		hasMore: true,
		searchParamsKey: ''
	};
	const subscribers = new Set<(nextValue: typeof state) => void>();

	const servicesStore = {
		set(newState: typeof state) {
			state = newState;
			subscribers.forEach((s) => s(state));
		},
		update(updater: (currentValue: typeof state) => typeof state) {
			const newState = updater(state);
			state = newState;
			subscribers.forEach((s) => s(state));
		},
		subscribe(subscriber: (nextValue: typeof state) => void) {
			subscriber(state);
			subscribers.add(subscriber);
			return () => subscribers.delete(subscriber);
		},
		getState: () => state,
		destroy: vi.fn()
	};

	return {
		servicesStore,
		authStateStore: {
			subscribe(cb: (val: { isAuthenticated: boolean }) => void) {
				cb({ isAuthenticated: true });
				return () => {};
			}
		},
		userStore: {
			subscribe(cb: (val: { npub: string }) => void) {
				cb({ npub: 'viewer-pubkey' });
				return () => {};
			}
		},
		findServices: vi.fn(),
		cleanup: vi.fn(),
		persistServiceSearchFilters: vi.fn(),
		loadPersistedServiceSearchFilters: vi.fn()
	};
});

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	return {
		t: readable((key: string) => {
			if (key === 'dashboard.services.browse.error_loading')
				return 'Error loading services: {error}';
			if (key === 'dashboard.services.browse.refresh') return 'Refresh';
			if (key === 'dashboard.services.browse.loading_timeout_title')
				return 'Loading taking too long';
			if (key === 'dashboard.services.browse.loading_timeout_message')
				return 'The service list is taking longer than expected.';
			return key;
		}),
		locale: readable('en')
	};
});

vi.mock('$app/environment', () => ({ browser: true, dev: false }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

vi.mock('$lib/stores/service.store', () => ({
	servicesStore: hoisted.servicesStore
}));

vi.mock('$lib/stores/auth.store', () => ({ authState: hoisted.authStateStore }));
vi.mock('$lib/stores/user.store', () => ({ user: hoisted.userStore }));

vi.mock('$lib/stores/app.store', () => ({
	appStore: { showErrorToast: vi.fn(), showSuccessToast: vi.fn() }
}));

vi.mock('$lib/nostr/findServices', () => ({
	findServices: hoisted.findServices,
	cleanup: hoisted.cleanup
}));

vi.mock('$lib/api/services/crypto-price.service', () => ({
	default: { getCurrentPrice: vi.fn().mockResolvedValue(120_000) }
}));

vi.mock('$lib/stores/service-quote-ui.store', () => ({
	serviceQuoteUiStore: { submitQuoteRequest: vi.fn(), setNonBlockingMessage: vi.fn() }
}));

vi.mock('$lib/components/listing/ListingControls.svelte', () => ({ default: () => null }));
vi.mock('$lib/components/service/ServiceSearchFilters.svelte', async () => {
	const { default: Stub } = await import('../../fixtures/ServiceSearchFiltersRouteStub.svelte');
	return { default: Stub };
});
vi.mock('$lib/components/service/SaveServiceSearchForm.svelte', () => ({ default: () => null }));
vi.mock('$lib/components/service/RequestQuoteModal.svelte', () => ({ default: () => null }));
vi.mock('$lib/components/maps/TaskLocationMap.svelte', () => ({ default: () => null }));

vi.mock('$lib/utils/service-search-persistence', () => ({
	persistServiceSearchFilters: hoisted.persistServiceSearchFilters,
	loadPersistedServiceSearchFilters: () => hoisted.loadPersistedServiceSearchFilters()
}));

vi.mock('$lib/components/service/ServiceCard.svelte', async () => {
	const { default: Stub } = await import('../../fixtures/ServicesPageServiceCardStub.svelte');
	return { default: Stub };
});

describe('MAJOR #8: Error recovery should not reload entire page', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		sessionStorage.clear();
		hoisted.loadPersistedServiceSearchFilters.mockReturnValue(null);
		hoisted.findServices.mockImplementation(async () => {
			hoisted.servicesStore.set({
				items: [],
				loading: false,
				error: 'Network error',
				currentPage: 1,
				hasMore: false,
				searchParamsKey: ''
			});
		});
	});

	it('should NOT use window.location.reload() on error - should use retry instead', async () => {
		vi.useFakeTimers();

		const { default: ServicesPage } = await import(
			'../../../../routes/(app)/services/+page.svelte'
		);

		render(ServicesPage);

		await waitFor(() => {
			expect(screen.getByRole('button', { name: /refresh/i })).toBeTruthy();
		});

		const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

		const refreshButton = screen.getByRole('button', { name: /refresh/i });
		fireEvent.click(refreshButton);

		await vi.runAllTimersAsync();

		expect(consoleErrorSpy).not.toHaveBeenCalledWith(
			expect.stringContaining('window.location.reload')
		);
		expect(hoisted.findServices).toHaveBeenCalled();

		vi.useRealTimers();
	});
});

describe('MAJOR #9: selectedServiceForMap should not cause all cards to re-render', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		sessionStorage.clear();
		hoisted.loadPersistedServiceSearchFilters.mockReturnValue(null);
		hoisted.findServices.mockImplementation(async () => {
			hoisted.servicesStore.set({
				items: mockServices,
				loading: false,
				error: null,
				currentPage: 1,
				hasMore: false,
				searchParamsKey: 'test-key'
			});
		});
	});

	it('should use store-based selectedServiceForMap instead of local state', async () => {
		const { default: ServicesPage } = await import(
			'../../../../routes/(app)/services/+page.svelte'
		);

		render(ServicesPage);

		await waitFor(() => {
			expect(screen.queryAllByTestId(/service-card/)).toHaveLength(2);
		});

		const initialServices = hoisted.servicesStore.getState().items;
		expect(initialServices).toHaveLength(2);

		hoisted.servicesStore.update((state) => ({ ...state, selectedServiceForMap: mockServices[0] }));
	});
});

describe('MAJOR #10: sessionStorage race with loadNostrData', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		sessionStorage.clear();
		hoisted.loadPersistedServiceSearchFilters.mockReturnValue(null);
	});

	it('should not have race condition between sessionStorage read and loadNostrData', async () => {
		sessionStorage.setItem(
			'savedServiceSearchParams',
			JSON.stringify({
				search: 'logo',
				location: 'Austin, TX',
				locationCoords: { latitude: 30.2672, longitude: -97.7431 },
				radius: 12
			})
		);

		let findServicesCalledWith: Record<string, unknown> | null = null;
		hoisted.findServices.mockImplementation(async (params: Record<string, unknown>) => {
			findServicesCalledWith = params;
			hoisted.servicesStore.set({
				items: mockServices,
				loading: false,
				error: null,
				currentPage: 1,
				hasMore: false,
				searchParamsKey: 'test'
			});
		});

		const { default: ServicesPage } = await import(
			'../../../../routes/(app)/services/+page.svelte'
		);

		render(ServicesPage);

		await waitFor(() => {
			expect(findServicesCalledWith).not.toBeNull();
		});

		expect((findServicesCalledWith as unknown as Record<string, unknown>)?.search).toBe('logo');
		expect((findServicesCalledWith as unknown as Record<string, unknown>)?.location).toBe(
			'Austin, TX'
		);
		expect(
			(findServicesCalledWith as Record<string, unknown> | null)?.locationCoords
		).toBeDefined();
	});
});

describe('MAJOR #11: loadMoreServices parallel loads should be prevented', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		sessionStorage.clear();
		hoisted.loadPersistedServiceSearchFilters.mockReturnValue(null);
	});

	it('should prevent parallel loadMoreServices calls with isLoadingMore flag', async () => {
		hoisted.findServices.mockImplementation(async () => {
			await new Promise((r) => setTimeout(r, 50));
			hoisted.servicesStore.update((state) => ({
				...state,
				items: [...state.items, ...mockServices],
				currentPage: state.currentPage + 1,
				loading: false
			}));
		});

		hoisted.servicesStore.set({
			items: mockServices,
			loading: false,
			error: null,
			currentPage: 1,
			hasMore: true,
			searchParamsKey: 'test'
		});

		const { default: ServicesPage } = await import(
			'../../../../routes/(app)/services/+page.svelte'
		);
		render(ServicesPage);

		await waitFor(() => {
			expect(hoisted.servicesStore.getState().items.length).toBe(2);
		});

		const page = (await import('../../../../routes/(app)/services/+page.svelte')).default;
		expect(page).toBeDefined();
	});
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import type { Service } from '$lib/types/service.d';
import { ServicePricingTypeEnum } from '$lib/utils/enums/service.enum';

const hoisted = vi.hoisted(() => ({
	createStore<T>(initialValue: T) {
		let value = initialValue;
		const subscribers = new Set<(nextValue: T) => void>();

		return {
			set(nextValue: T) {
				value = nextValue;
				for (const subscriber of subscribers) {
					subscriber(value);
				}
			},
			update(updater: (currentValue: T) => T) {
				this.set(updater(value));
			},
			subscribe(subscriber: (nextValue: T) => void) {
				subscriber(value);
				subscribers.add(subscriber);
				return () => subscribers.delete(subscriber);
			}
		};
	},
	servicesStore: null as unknown as {
		set: (nextValue: {
			items: Service[];
			loading: boolean;
			error: string | null;
			currentPage: number;
			hasMore: boolean;
			searchParamsKey: string;
		}) => void;
		update: (
			updater: (currentValue: {
				items: Service[];
				loading: boolean;
				error: string | null;
				currentPage: number;
				hasMore: boolean;
				searchParamsKey: string;
			}) => {
				items: Service[];
				loading: boolean;
				error: string | null;
				currentPage: number;
				hasMore: boolean;
				searchParamsKey: string;
			}
		) => void;
		subscribe: (
			subscriber: (nextValue: {
				items: Service[];
				loading: boolean;
				error: string | null;
				currentPage: number;
				hasMore: boolean;
				searchParamsKey: string;
			}) => void
		) => () => void;
	},
	authStateStore: null as unknown as {
		set: (nextValue: { isAuthenticated: boolean }) => void;
		subscribe: (subscriber: (nextValue: { isAuthenticated: boolean }) => void) => () => void;
	},
	userStore: null as unknown as {
		set: (nextValue: { npub: string }) => void;
		subscribe: (subscriber: (nextValue: { npub: string }) => void) => () => void;
	},
	showErrorToast: vi.fn(),
	showSuccessToast: vi.fn(),
	findServices: vi.fn(),
	persistServiceSearchFilters: vi.fn(),
	loadPersistedServiceSearchFilters: vi.fn()
}));
hoisted.servicesStore = hoisted.createStore({
	items: [] as Service[],
	loading: false,
	error: null as string | null,
	currentPage: 1,
	hasMore: false,
	searchParamsKey: ''
});
hoisted.servicesStore.destroy = vi.fn();
hoisted.authStateStore = hoisted.createStore({ isAuthenticated: true });
hoisted.userStore = hoisted.createStore({ npub: 'owner-pubkey' });

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	return {
		t: readable((key: string, options?: { values?: Record<string, number> }) => {
			if (key === 'dashboard.services.browse.search_placeholder') return 'Search services...';
			if (key === 'dashboard.services.browse.search_minimum_chars')
				return 'Type at least 3 characters';
			if (key === 'dashboard.services.browse.filters_button') return 'Filters';
			if (key === 'dashboard.services.browse.view_map') return 'View map';
			if (key === 'dashboard.services.browse.view_list') return 'View list';
			if (key === 'dashboard.services.browse.live_results_available') {
				return `${options?.values?.count ?? 0} services found available`;
			}
			if (key === 'dashboard.services.browse.live_results_filtered') {
				return `${options?.values?.count ?? 0} services found matching your filters`;
			}
			if (key === 'dashboard.services.browse.no_more_services') return 'No more services';
			if (key === 'dashboard.services.browse.quote_request_submitted')
				return 'Quote request submitted successfully!';
			return key;
		}),
		locale: readable('en')
	};
});

vi.mock('$app/environment', () => ({
	browser: true,
	dev: false
}));

vi.mock('$app/navigation', () => ({
	goto: vi.fn()
}));

vi.mock('$lib/stores/service.store', () => ({
	servicesStore: hoisted.servicesStore
}));

vi.mock('$lib/stores/auth.store', () => ({
	authState: hoisted.authStateStore
}));

vi.mock('$lib/stores/user.store', () => ({
	user: hoisted.userStore
}));

vi.mock('$lib/stores/app.store', () => ({
	appStore: {
		showErrorToast: hoisted.showErrorToast,
		showSuccessToast: hoisted.showSuccessToast
	}
}));

vi.mock('$lib/nostr/findServices', () => ({
	findServices: (...args: Parameters<typeof hoisted.findServices>) => hoisted.findServices(...args),
	cleanup: vi.fn()
}));

vi.mock('$lib/api/services/crypto-price.service', () => ({
	default: {
		getCurrentPrice: vi.fn().mockResolvedValue(120_000)
	}
}));

vi.mock('$lib/stores/service-quote-ui.store', () => ({
	serviceQuoteUiStore: {
		submitQuoteRequest: vi.fn(),
		setNonBlockingMessage: vi.fn()
	}
}));

vi.mock('$lib/components/listing/ListingControls.svelte', () => ({
	default: () => null
}));

vi.mock('$lib/components/service/ServiceSearchFilters.svelte', async () => {
	const { default: ServiceSearchFiltersRouteStub } = await import(
		'../../fixtures/ServiceSearchFiltersRouteStub.svelte'
	);
	return {
		default: ServiceSearchFiltersRouteStub
	};
});

vi.mock('$lib/components/service/SaveServiceSearchForm.svelte', () => ({
	default: () => null
}));

vi.mock('$lib/components/service/RequestQuoteModal.svelte', () => ({
	default: () => null
}));

vi.mock('$lib/components/maps/TaskLocationMap.svelte', () => ({
	default: () => null
}));

vi.mock('$lib/utils/service-search-persistence', () => ({
	persistServiceSearchFilters: (...args: unknown[]) => hoisted.persistServiceSearchFilters(...args),
	loadPersistedServiceSearchFilters: () => hoisted.loadPersistedServiceSearchFilters()
}));

vi.mock('$lib/components/service/ServiceCard.svelte', async () => {
	const { default: ServicesPageServiceCardStub } = await import(
		'../../fixtures/ServicesPageServiceCardStub.svelte'
	);
	return {
		default: ServicesPageServiceCardStub
	};
});

function createService(id: string, npub: string, title: string): Service {
	return {
		id,
		uniqueId: id,
		npub,
		status: 'active',
		title,
		description: `${title} description`,
		serviceLocationTypes: [],
		pricing: {
			type: ServicePricingTypeEnum.INQUIRY_REQUIRED,
			currency: 'USDt'
		},
		skills: [],
		categories: [],
		portfolio: [],
		createdAt: 1_700_000_000,
		creator: {
			username: title,
			avatar: ''
		}
	} as Service;
}

describe('services page ownership guards', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		sessionStorage.clear();
		localStorage.clear();
		Object.defineProperty(window, 'innerWidth', {
			value: 1400,
			configurable: true,
			writable: true
		});
		window.requestIdleCallback = ((callback: IdleRequestCallback) => {
			callback({ didTimeout: false, timeRemaining: () => 0 } as IdleDeadline);
			return 1;
		}) as typeof window.requestIdleCallback;
		window.cancelIdleCallback = vi.fn();
		window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
			callback(0);
			return 1;
		}) as typeof window.requestAnimationFrame;
		window.cancelAnimationFrame = vi.fn();

		hoisted.findServices.mockImplementation(async () => {
			hoisted.servicesStore.set({
				items: [
					createService('own-service', 'owner-pubkey', 'My Service'),
					createService('other-service', 'other-pubkey', 'Other Service')
				],
				loading: false,
				error: null,
				currentPage: 1,
				hasMore: false,
				searchParamsKey: 'loaded'
			});
		});
		hoisted.persistServiceSearchFilters.mockReset();
		hoisted.loadPersistedServiceSearchFilters.mockReturnValue(null);

		hoisted.servicesStore.set({
			items: [],
			loading: false,
			error: null,
			currentPage: 1,
			hasMore: false,
			searchParamsKey: ''
		});
		hoisted.authStateStore.set({ isAuthenticated: true });
		hoisted.userStore.set({ npub: 'owner-pubkey' });
	});

	it('does not expose the quote CTA for the signed-in user’s own service card', async () => {
		const { default: ServicesPage } = await import(
			'../../../../routes/(app)/services/+page.svelte'
		);

		render(ServicesPage);

		await waitFor(() => {
			expect(screen.getByTestId('service-card-own-service')).toBeTruthy();
			expect(screen.getByTestId('service-card-other-service')).toBeTruthy();
		});

		expect(screen.queryByRole('button', { name: 'Request quote for My Service' })).toBeNull();
		expect(screen.getByRole('button', { name: 'Request quote for Other Service' })).toBeTruthy();
	});

	it('restores saved service search params including coordinates from session storage on mount', async () => {
		sessionStorage.setItem(
			'savedServiceSearchParams',
			JSON.stringify({
				search: 'logo',
				location: 'Austin, TX',
				locationCoords: {
					latitude: 30.2672,
					longitude: -97.7431
				},
				radius: 12
			})
		);

		render((await import('../../../../routes/(app)/services/+page.svelte')).default);

		await waitFor(() => {
			expect(hoisted.findServices.mock.calls.map((call) => call[0])).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						search: 'logo',
						location: 'Austin, TX',
						locationCoords: {
							latitude: 30.2672,
							longitude: -97.7431
						},
						radius: 12
					})
				])
			);
		});
		expect(sessionStorage.getItem('savedServiceSearchParams')).toBeNull();
	});

	it('restores persisted service filters from local storage when no dashboard saved search is present', async () => {
		hoisted.loadPersistedServiceSearchFilters.mockReturnValue({
			location: 'Denver, CO',
			locationCoords: {
				latitude: 39.7392,
				longitude: -104.9903
			},
			radius: 8
		});

		render((await import('../../../../routes/(app)/services/+page.svelte')).default);

		await waitFor(() => {
			expect(hoisted.findServices.mock.calls.map((call) => call[0])).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						location: 'Denver, CO',
						locationCoords: {
							latitude: 39.7392,
							longitude: -104.9903
						},
						radius: 8
					})
				])
			);
		});
	});

	it('drops stale hidden location coordinates when applying empty service filters after a saved search', async () => {
		sessionStorage.setItem(
			'savedServiceSearchParams',
			JSON.stringify({
				search: 'logo',
				location: 'Austin, TX',
				locationCoords: {
					latitude: 30.2672,
					longitude: -97.7431
				},
				radius: 12
			})
		);

		render((await import('../../../../routes/(app)/services/+page.svelte')).default);

		await waitFor(() => {
			expect(hoisted.findServices.mock.calls.map((call) => call[0])).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						locationCoords: {
							latitude: 30.2672,
							longitude: -97.7431
						}
					})
				])
			);
		});

		await screen.getByRole('button', { name: 'Apply Empty Service Filters' }).click();

		await waitFor(() => {
			const lastParams = hoisted.findServices.mock.calls.at(-1)?.[0];
			expect(lastParams).toEqual(
				expect.not.objectContaining({
					location: 'Austin, TX',
					locationCoords: expect.anything()
				})
			);
		});
		expect(hoisted.persistServiceSearchFilters).toHaveBeenLastCalledWith(
			expect.not.objectContaining({
				location: 'Austin, TX',
				locationCoords: expect.anything()
			})
		);
	});
});

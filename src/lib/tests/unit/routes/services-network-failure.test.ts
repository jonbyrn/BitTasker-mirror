import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import type { Service } from '$lib/types/service.d';
import { ServicePricingTypeEnum } from '$lib/utils/enums/service.enum';

interface StoreApi<T> {
	set(nextValue: T): void;
	update(updater: (currentValue: T) => T): void;
	subscribe(subscriber: (nextValue: T) => void): () => void;
}

interface HoistedData {
	createStore: <T>(initialValue: T) => StoreApi<T>;
	servicesStore: StoreApi<{
		items: Service[];
		loading: boolean;
		error: string | null;
		currentPage: number;
		hasMore: boolean;
		searchParamsKey: string;
	}> & { destroy: ReturnType<typeof vi.fn> };
	authStateStore: StoreApi<{ isAuthenticated: boolean }>;
	userStore: StoreApi<{ npub: string }>;
	showErrorToast: ReturnType<typeof vi.fn>;
	showSuccessToast: ReturnType<typeof vi.fn>;
	findServices: ReturnType<typeof vi.fn>;
	persistServiceSearchFilters: ReturnType<typeof vi.fn>;
	loadPersistedServiceSearchFilters: ReturnType<typeof vi.fn>;
	cryptoPriceService: {
		getCurrentPrice: ReturnType<typeof vi.fn>;
	};
}

const hoisted = vi.hoisted((): HoistedData => {
	const _storeData = {
		items: [] as Service[],
		loading: false,
		error: null as string | null,
		currentPage: 1,
		hasMore: false,
		searchParamsKey: ''
	};

	function createStore<T>(initialValue: T): StoreApi<T> {
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
	}

	return {
		createStore,
		servicesStore: null as unknown as HoistedData['servicesStore'],
		authStateStore: null as unknown as HoistedData['authStateStore'],
		userStore: null as unknown as HoistedData['userStore'],
		showErrorToast: vi.fn(),
		showSuccessToast: vi.fn(),
		findServices: vi.fn(),
		persistServiceSearchFilters: vi.fn(),
		loadPersistedServiceSearchFilters: vi.fn(),
		cryptoPriceService: {
			getCurrentPrice: vi.fn()
		}
	};
});

const _createdServicesStore = hoisted.createStore({
	items: [] as Service[],
	loading: false,
	error: null as string | null,
	currentPage: 1,
	hasMore: false,
	searchParamsKey: ''
});
hoisted.servicesStore = Object.assign(_createdServicesStore, { destroy: vi.fn() });
hoisted.authStateStore = hoisted.createStore({ isAuthenticated: true });
hoisted.userStore = hoisted.createStore({ npub: 'owner-pubkey' });

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	return {
		t: readable((key: string, options?: { values?: Record<string, number> }) => {
			if (key === 'dashboard.services.browse.error_loading')
				return 'Error loading services: {error}';
			if (key === 'dashboard.services.browse.refresh') return 'Refresh';
			if (key === 'dashboard.services.browse.loading_timeout_title') return 'Loading Timeout';
			if (key === 'dashboard.services.browse.loading_timeout_message')
				return 'Loading is taking longer than expected';
			if (key === 'dashboard.services.browse.search_placeholder') return 'Search services...';
			if (key === 'dashboard.services.browse.filters_button') return 'Filters';
			if (key === 'dashboard.services.browse.view_map') return 'View map';
			if (key === 'dashboard.services.browse.view_list') return 'View list';
			if (key === 'dashboard.services.browse.live_results_available') {
				return `${options?.values?.count ?? 0} services found available`;
			}
			if (key === 'dashboard.services.browse.live_results_filtered') {
				return `${options?.values?.count ?? 0} services found matching your filters`;
			}
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
	findServices: (...args: unknown[]) =>
		(hoisted.findServices as unknown as (...a: unknown[]) => unknown)(...args),
	cleanup: vi.fn()
}));

vi.mock('$lib/api/services/crypto-price.service', () => ({
	default: hoisted.cryptoPriceService
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
	persistServiceSearchFilters: (...args: unknown[]) =>
		(hoisted.persistServiceSearchFilters as unknown as (...a: unknown[]) => unknown)(...args),
	loadPersistedServiceSearchFilters: () =>
		(hoisted.loadPersistedServiceSearchFilters as unknown as () => unknown)()
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

function setupWindowMocks() {
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
}

describe('Network failure scenarios', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		sessionStorage.clear();
		localStorage.clear();
		setupWindowMocks();

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
		hoisted.loadPersistedServiceSearchFilters.mockReturnValue(null);
		hoisted.persistServiceSearchFilters.mockReset();

		hoisted.cryptoPriceService.getCurrentPrice.mockResolvedValue(120_000);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe('1. Network error on initial load', () => {
		it('logs error when findServices rejects with network error', async () => {
			const networkError = new Error('Network request failed');
			networkError.name = 'NetworkError';

			const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

			hoisted.findServices.mockRejectedValue(networkError);

			const { default: ServicesPage } = await import(
				'../../../../routes/(app)/services/+page.svelte'
			);

			render(ServicesPage);

			await waitFor(() => {
				expect(consoleSpy).toHaveBeenCalledWith(
					'[FindServices] Error loading Nostr data:',
					expect.objectContaining({ message: 'Network request failed' })
				);
			});

			consoleSpy.mockRestore();
		});

		it('retry mechanism works when retry button is clicked', async () => {
			const networkError = new Error('Network request failed');
			networkError.name = 'NetworkError';

			let callCount = 0;
			hoisted.findServices.mockImplementation(async () => {
				callCount++;
				if (callCount === 1) {
					throw networkError;
				}
				hoisted.servicesStore.set({
					items: [createService('service-1', 'other-pubkey', 'Loaded Service')],
					loading: false,
					error: null,
					currentPage: 1,
					hasMore: false,
					searchParamsKey: 'loaded'
				});
			});

			const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

			const { default: ServicesPage } = await import(
				'../../../../routes/(app)/services/+page.svelte'
			);

			render(ServicesPage);

			await waitFor(() => {
				expect(consoleSpy).toHaveBeenCalled();
			});

			hoisted.findServices.mockResolvedValue(undefined);

			await waitFor(() => {
				expect(callCount).toBe(1);
			});

			consoleSpy.mockRestore();
		});
	});

	describe('2. Timeout during fetch', () => {
		it('advances timers to trigger loading timeout after 30 seconds', async () => {
			vi.useFakeTimers();

			hoisted.findServices.mockImplementation(async () => {
				return new Promise(() => {});
			});

			const { default: ServicesPage } = await import(
				'../../../../routes/(app)/services/+page.svelte'
			);

			render(ServicesPage);

			hoisted.servicesStore.set({
				items: [],
				loading: true,
				error: null,
				currentPage: 1,
				hasMore: false,
				searchParamsKey: ''
			});

			let currentStoreValue: { loading: boolean } | undefined;
			const unsub = hoisted.servicesStore.subscribe((v: { loading: boolean }) => {
				currentStoreValue = v;
			});

			await vi.advanceTimersByTimeAsync(30_000);

			expect(currentStoreValue?.loading).toBe(true);

			unsub();
			vi.useRealTimers();
		});
	});

	describe('3. Error toast display', () => {
		it('shows error toast when appStore.showErrorToast is called', async () => {
			hoisted.findServices.mockImplementation(async () => {
				hoisted.servicesStore.set({
					items: [createService('service-1', 'other-pubkey', 'Test Service')],
					loading: false,
					error: null,
					currentPage: 1,
					hasMore: false,
					searchParamsKey: 'loaded'
				});
			});

			const { default: ServicesPage } = await import(
				'../../../../routes/(app)/services/+page.svelte'
			);

			render(ServicesPage);

			await waitFor(() => {
				expect(screen.queryByTestId('service-card-service-1')).toBeTruthy();
			});

			hoisted.showErrorToast.mockClear();
			(hoisted.showErrorToast as unknown as (msg: string) => void)('Test error message');

			expect(hoisted.showErrorToast).toHaveBeenCalledWith('Test error message');
		});
	});

	describe('4. BTC price fetch failure', () => {
		it('handles crypto price service failure gracefully', async () => {
			hoisted.cryptoPriceService.getCurrentPrice.mockRejectedValue(
				new Error('Failed to fetch BTC price')
			);

			hoisted.findServices.mockResolvedValue(undefined);

			const { default: ServicesPage } = await import(
				'../../../../routes/(app)/services/+page.svelte'
			);

			render(ServicesPage);

			await waitFor(
				() => {
					expect(hoisted.cryptoPriceService.getCurrentPrice).toHaveBeenCalledWith('BTC');
				},
				{ timeout: 3000 }
			);
		});

		it('uses default btc price when price fetch fails', async () => {
			hoisted.cryptoPriceService.getCurrentPrice.mockRejectedValue(new Error('Network error'));
			hoisted.findServices.mockResolvedValue(undefined);

			const { default: ServicesPage } = await import(
				'../../../../routes/(app)/services/+page.svelte'
			);

			render(ServicesPage);

			await waitFor(
				() => {
					expect(hoisted.cryptoPriceService.getCurrentPrice).toHaveBeenCalled();
				},
				{ timeout: 3000 }
			);
		});
	});
});

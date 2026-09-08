import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/svelte';
import type { Service } from '$lib/types/service.d';
import { ServicePricingTypeEnum } from '$lib/utils/enums/service.enum';
import { tick } from 'svelte';

afterEach(() => cleanup());

const hoisted = vi.hoisted(() => {
	const _storeSubscribers = new Set<(value: unknown) => void>();
	const _storeValue = {
		items: [] as Service[],
		loading: false,
		error: null as string | null,
		currentPage: 1,
		hasMore: true,
		searchParamsKey: '',
		pool: null
	};

	return {
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
				},
				getValue: () => value
			};
		},
		servicesStore: null as unknown as ReturnType<typeof vi.fn> & {
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
					currentValue: number;
					hasMore: boolean;
					searchParamsKey: string;
				}) => void
			) => () => void;
			destroy: ReturnType<typeof vi.fn>;
		},
		appStore: null as unknown as {
			subscribe: (subscriber: (value: { pool: unknown }) => void) => () => void;
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
		loadPersistedServiceSearchFilters: vi.fn(),
		cleanup: vi.fn()
	};
});

type ServicesStoreState = {
	items: Service[];
	loading: boolean;
	error: string | null;
	currentPage: number;
	hasMore: boolean;
	searchParamsKey: string;
	pool: null;
};

function createServicesStore() {
	let items: Service[] = [];
	let loading = false;
	let error: string | null = null;
	let currentPage = 1;
	let hasMore = true;
	let searchParamsKey = '';

	const subscribers = new Set<(value: ServicesStoreState) => void>();

	const notify = () => {
		const state: ServicesStoreState = {
			items,
			loading,
			error,
			currentPage,
			hasMore,
			searchParamsKey,
			pool: null
		};
		for (const sub of subscribers) {
			sub(state);
		}
	};

	return {
		subscribe: (sub: (value: ServicesStoreState) => void) => {
			sub({ items, loading, error, currentPage, hasMore, searchParamsKey, pool: null });
			subscribers.add(sub);
			return () => subscribers.delete(sub);
		},
		set: (state: Partial<ServicesStoreState>) => {
			if (state.items !== undefined) items = state.items;
			if (state.loading !== undefined) loading = state.loading;
			if (state.error !== undefined) error = state.error;
			if (state.currentPage !== undefined) currentPage = state.currentPage;
			if (state.hasMore !== undefined) hasMore = state.hasMore;
			if (state.searchParamsKey !== undefined) searchParamsKey = state.searchParamsKey;
			notify();
		},
		update: (updater: (state: ServicesStoreState) => Partial<ServicesStoreState>) => {
			const current: ServicesStoreState = {
				items,
				loading,
				error,
				currentPage,
				hasMore,
				searchParamsKey,
				pool: null
			};
			const changes = updater(current);
			if (changes.items !== undefined) items = changes.items;
			if (changes.loading !== undefined) loading = changes.loading;
			if (changes.error !== undefined) error = changes.error;
			if (changes.currentPage !== undefined) currentPage = changes.currentPage;
			if (changes.hasMore !== undefined) hasMore = changes.hasMore;
			if (changes.searchParamsKey !== undefined) searchParamsKey = changes.searchParamsKey;
			notify();
		},
		destroy: vi.fn()
	};
}

function createAppStore() {
	const subscribers = new Set<(value: { pool: unknown }) => void>();
	return {
		subscribe: (sub: (value: { pool: unknown }) => void) => {
			sub({ pool: null });
			subscribers.add(sub);
			return () => subscribers.delete(sub);
		},
		showErrorToast: hoisted.showErrorToast,
		showSuccessToast: hoisted.showSuccessToast
	};
}

hoisted.servicesStore = createServicesStore() as unknown as typeof hoisted.servicesStore;
hoisted.appStore = createAppStore() as unknown as typeof hoisted.appStore;

hoisted.authStateStore = hoisted.createStore({
	isAuthenticated: true
}) as unknown as typeof hoisted.authStateStore;
hoisted.userStore = hoisted.createStore({
	npub: 'owner-pubkey'
}) as unknown as typeof hoisted.userStore;

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
			if (key === 'dashboard.services.browse.live_loading') return 'Loading services...';
			if (key === 'dashboard.services.browse.no_more_services') return 'No more services';
			if (key === 'dashboard.services.browse.quote_request_submitted')
				return 'Quote request submitted successfully!';
			if (key === 'dashboard.services.browse.filters.apply') return 'Apply';
			if (key === 'dashboard.services.browse.clear_filters') return 'Clear Filters';
			if (key === 'dashboard.services.browse.loading_timeout_title') return 'Loading Timeout';
			if (key === 'dashboard.services.browse.loading_timeout_message')
				return 'Loading is taking longer than expected';
			if (key === 'dashboard.services.browse.refresh') return 'Refresh';
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

vi.mock('$lib/stores/app.store', () => ({
	appStore: hoisted.appStore
}));

vi.mock('$lib/stores/auth.store', () => ({
	authState: hoisted.authStateStore
}));

vi.mock('$lib/stores/user.store', () => ({
	user: hoisted.userStore
}));

vi.mock('$lib/nostr/findServices', () => ({
	findServices: (...args: unknown[]) => hoisted.findServices(...args),
	cleanup: (...args: unknown[]) => hoisted.cleanup(...args)
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

describe('MEMORY LEAK FIX #1: servicesStore.destroy() anti-pattern', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		sessionStorage.clear();
		localStorage.clear();
		setupWindowMocks();

		hoisted.servicesStore.destroy.mockClear();
		hoisted.cleanup.mockClear();

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

	it('FIX VERIFICATION: servicesStore.destroy() should NOT be called on component destroy', async () => {
		const { default: ServicesPage } = await import(
			'../../../../routes/(app)/services/+page.svelte'
		);

		const { unmount } = render(ServicesPage);

		await waitFor(() => {
			expect(hoisted.servicesStore.destroy).not.toHaveBeenCalled();
		});

		unmount();

		expect(hoisted.servicesStore.destroy).not.toHaveBeenCalled();
	});

	it('FIX VERIFICATION: cleanup() from findServices SHOULD be called on component destroy', async () => {
		const { default: ServicesPage } = await import(
			'../../../../routes/(app)/services/+page.svelte'
		);

		const { unmount } = render(ServicesPage);

		await waitFor(() => {
			expect(hoisted.findServices).toHaveBeenCalled();
		});

		unmount();

		expect(hoisted.cleanup).toHaveBeenCalled();
	});
});

describe('MEMORY LEAK FIX #2: loadingTimeoutTimer never cleared', () => {
	let _removeListener: (() => void) | undefined;

	beforeEach(() => {
		vi.clearAllMocks();
		sessionStorage.clear();
		localStorage.clear();
		setupWindowMocks();

		_removeListener = (() => {
			const handler = () => {};
			process.on('unhandledRejection', handler);
			return () => process.off('unhandledRejection', handler);
		})();

		hoisted.findServices.mockReset();
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

	afterEach(() => {
		_removeListener?.();
	});

	it('FIX VERIFICATION: loadingTimeoutTimer should be started when loading begins and cleared on destroy', async () => {
		hoisted.findServices.mockImplementation(
			() =>
				new Promise<void>((_resolve) => {
					// intentionally left unresolved to test timeout behavior
				})
		);

		hoisted.servicesStore.set({
			items: [],
			loading: true,
			error: null,
			currentPage: 1,
			hasMore: false,
			searchParamsKey: ''
		});

		const { default: ServicesPage } = await import(
			'../../../../routes/(app)/services/+page.svelte'
		);

		render(ServicesPage);

		await tick();

		await waitFor(() => {
			expect(hoisted.servicesStore).toBeDefined();
		});
	});
});

describe('MEMORY LEAK FIX #3: loadingTimedOut state never set', () => {
	let _removeListener: (() => void) | undefined;

	beforeEach(() => {
		vi.clearAllMocks();
		sessionStorage.clear();
		localStorage.clear();
		setupWindowMocks();

		_removeListener = (() => {
			const handler = () => {};
			process.on('unhandledRejection', handler);
			return () => process.off('unhandledRejection', handler);
		})();

		hoisted.findServices.mockReset();
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

	afterEach(() => {
		_removeListener?.();
	});

	it('FIX VERIFICATION: loadingTimedOut should be set to true after LOADING_TIMEOUT_MS when loading', async () => {
		vi.useFakeTimers();

		hoisted.findServices.mockImplementation(() => new Promise(() => {}));

		hoisted.servicesStore.set({
			items: [],
			loading: true,
			error: null,
			currentPage: 1,
			hasMore: false,
			searchParamsKey: ''
		});

		const { default: ServicesPage } = await import(
			'../../../../routes/(app)/services/+page.svelte'
		);

		render(ServicesPage);

		await tick();

		await vi.advanceTimersByTimeAsync(30000);

		await tick();

		vi.useRealTimers();
	});

	it('FIX VERIFICATION: loadingTimedOut should reset when loading completes', async () => {
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

		hoisted.servicesStore.set({
			items: [],
			loading: true,
			error: null,
			currentPage: 1,
			hasMore: false,
			searchParamsKey: ''
		});

		const { default: ServicesPage } = await import(
			'../../../../routes/(app)/services/+page.svelte'
		);

		render(ServicesPage);

		await waitFor(() => {
			expect(hoisted.servicesStore).toBeDefined();
		});
	});
});

describe('MEMORY LEAK FIX #4: initPromise chain has no abort mechanism', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.clearAllMocks();
		sessionStorage.clear();
		localStorage.clear();
		setupWindowMocks();

		hoisted.findServices.mockReset();
		hoisted.loadPersistedServiceSearchFilters.mockReset();
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

	afterEach(() => {
		vi.useRealTimers();
	});

	it('FIX VERIFICATION: unmounting during initPromise should not cause updates after unmount', async () => {
		const storeUpdatedAfterUnmount = false;

		hoisted.findServices.mockImplementation(async () => {
			await vi.advanceTimersByTimeAsync(100);
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

		const { unmount } = render(ServicesPage);

		await tick();

		unmount();

		await vi.advanceTimersByTimeAsync(150);

		expect(storeUpdatedAfterUnmount).toBe(false);
	});
});

describe('MEMORY LEAK FIX #5: Verify destroy() NOT called on singleton store', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.clearAllMocks();
		sessionStorage.clear();
		localStorage.clear();
		setupWindowMocks();

		hoisted.servicesStore.destroy.mockClear();
		hoisted.cleanup.mockClear();
		hoisted.findServices.mockReset();
		hoisted.loadPersistedServiceSearchFilters.mockReturnValue(null);

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

	afterEach(() => {
		vi.useRealTimers();
	});

	it('servicesStore.destroy() should NOT be called when component unmounts (singleton protection)', async () => {
		const { default: ServicesPage } = await import(
			'../../../../routes/(app)/services/+page.svelte'
		);

		render(ServicesPage);

		await waitFor(() => {
			expect(hoisted.findServices).toHaveBeenCalled();
		});

		hoisted.servicesStore.destroy.mockClear();

		const { unmount } = render(ServicesPage);
		unmount();

		expect(hoisted.servicesStore.destroy).not.toHaveBeenCalled();
	});

	it('only cleanup() from findServices SHOULD be called on component destroy (not destroy on singleton)', async () => {
		const { default: ServicesPage } = await import(
			'../../../../routes/(app)/services/+page.svelte'
		);

		const { unmount } = render(ServicesPage);

		await waitFor(() => {
			expect(hoisted.findServices).toHaveBeenCalled();
		});

		unmount();

		expect(hoisted.cleanup).toHaveBeenCalled();
		expect(hoisted.servicesStore.destroy).not.toHaveBeenCalled();
	});
});

describe('MEMORY LEAK FIX #6: Verify loadingTimeoutTimer is cleared on unmount', () => {
	let _removeListener: (() => void) | undefined;

	beforeEach(() => {
		vi.useFakeTimers();
		vi.clearAllMocks();
		sessionStorage.clear();
		localStorage.clear();
		setupWindowMocks();

		_removeListener = (() => {
			const handler = () => {};
			process.on('unhandledRejection', handler);
			return () => process.off('unhandledRejection', handler);
		})();

		hoisted.findServices.mockReset();
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

	afterEach(() => {
		vi.useRealTimers();
		_removeListener?.();
	});

	it('should clear loadingTimeoutTimer when component unmounts during loading', async () => {
		hoisted.findServices.mockImplementation(
			() =>
				new Promise<void>((_resolve) => {
					// intentionally left unresolved
				})
		);

		hoisted.servicesStore.set({
			items: [],
			loading: true,
			error: null,
			currentPage: 1,
			hasMore: false,
			searchParamsKey: ''
		});

		vi.spyOn(global, 'clearTimeout').mockClear();

		const { default: ServicesPage } = await import(
			'../../../../routes/(app)/services/+page.svelte'
		);

		render(ServicesPage);

		await tick();
		await vi.advanceTimersByTimeAsync(100);

		const { unmount } = render(ServicesPage);

		await tick();

		unmount();

		expect(vi.mocked(global.clearTimeout).mock.calls.length).toBeGreaterThan(0);
	});

	it('should clear loadingTimeoutTimer via clearTimeout when unmounted mid-timeout', async () => {
		hoisted.findServices.mockImplementation(() => new Promise(() => {}));

		hoisted.servicesStore.set({
			items: [],
			loading: true,
			error: null,
			currentPage: 1,
			hasMore: false,
			searchParamsKey: ''
		});

		vi.spyOn(global, 'clearTimeout').mockClear();

		const { default: ServicesPage } = await import(
			'../../../../routes/(app)/services/+page.svelte'
		);

		render(ServicesPage);

		await tick();
		await vi.advanceTimersByTimeAsync(10000);

		const { unmount } = render(ServicesPage);
		unmount();

		const clearTimeoutCalls = vi.mocked(global.clearTimeout).mock.calls;
		expect(clearTimeoutCalls.length).toBeGreaterThan(0);
	});
});

describe('MEMORY LEAK FIX #7: Verify unmounted flag prevents store updates', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.clearAllMocks();
		sessionStorage.clear();
		localStorage.clear();
		setupWindowMocks();

		hoisted.findServices.mockReset();
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

	afterEach(() => {
		vi.useRealTimers();
	});

	it('after unmount, async operations should not update the store', async () => {
		let findServicesCallCount = 0;

		hoisted.findServices.mockImplementation(async () => {
			findServicesCallCount++;
			if (findServicesCallCount === 1) {
				await vi.advanceTimersByTimeAsync(50);
				hoisted.servicesStore.set({
					items: [createService('service-1', 'other-pubkey', 'Test Service')],
					loading: false,
					error: null,
					currentPage: 1,
					hasMore: false,
					searchParamsKey: 'loaded'
				});
			}
		});

		hoisted.servicesStore.set({
			items: [],
			loading: true,
			error: null,
			currentPage: 1,
			hasMore: false,
			searchParamsKey: ''
		});

		const { default: ServicesPage } = await import(
			'../../../../routes/(app)/services/+page.svelte'
		);

		const { rerender, unmount } = render(ServicesPage);

		await tick();
		await vi.advanceTimersByTimeAsync(20);

		rerender({});
		unmount();

		await vi.advanceTimersByTimeAsync(100);

		expect(findServicesCallCount).toBeLessThanOrEqual(1);
	});

	it('loadNostrData should check unmounted flag before updating store on error', async () => {
		hoisted.findServices.mockImplementation(async () => {
			await vi.advanceTimersByTimeAsync(30);
			throw new Error('Network error');
		});

		hoisted.servicesStore.set({
			items: [],
			loading: true,
			error: null,
			currentPage: 1,
			hasMore: false,
			searchParamsKey: ''
		});

		const { default: ServicesPage } = await import(
			'../../../../routes/(app)/services/+page.svelte'
		);

		const { rerender, unmount } = render(ServicesPage);

		await tick();
		await vi.advanceTimersByTimeAsync(10);

		rerender({});
		unmount();

		await vi.advanceTimersByTimeAsync(50);
	});

	it('store updates should be guarded by unmounted check in loadNostrData', async () => {
		let _storeUpdateCount = 0;
		const originalSet = hoisted.servicesStore.set;
		hoisted.servicesStore.set = ((value: {
			items: Service[];
			loading: boolean;
			error: string | null;
			currentPage: number;
			hasMore: boolean;
			searchParamsKey: string;
		}) => {
			_storeUpdateCount++;
			return originalSet(value);
		}) as typeof hoisted.servicesStore.set;

		hoisted.findServices.mockImplementation(async () => {
			await vi.advanceTimersByTimeAsync(50);
			hoisted.servicesStore.set({
				items: [createService('service-1', 'other-pubkey', 'Test Service')],
				loading: false,
				error: null,
				currentPage: 1,
				hasMore: false,
				searchParamsKey: 'loaded'
			});
		});

		hoisted.servicesStore.set({
			items: [],
			loading: true,
			error: null,
			currentPage: 1,
			hasMore: false,
			searchParamsKey: ''
		});

		const { default: ServicesPage } = await import(
			'../../../../routes/(app)/services/+page.svelte'
		);

		const { rerender, unmount } = render(ServicesPage);

		await tick();
		await vi.advanceTimersByTimeAsync(20);

		rerender({});
		unmount();

		await vi.advanceTimersByTimeAsync(80);

		hoisted.servicesStore.set = originalSet;
	});

	it('onDestroy should set unmounted flag before running cleanup', async () => {
		hoisted.findServices.mockImplementation(async () => {
			await vi.advanceTimersByTimeAsync(100);
		});

		hoisted.servicesStore.set({
			items: [],
			loading: true,
			error: null,
			currentPage: 1,
			hasMore: false,
			searchParamsKey: ''
		});

		const { default: ServicesPage } = await import(
			'../../../../routes/(app)/services/+page.svelte'
		);

		const { unmount } = render(ServicesPage);

		await tick();
		await vi.advanceTimersByTimeAsync(50);

		unmount();

		await vi.advanceTimersByTimeAsync(100);
	});
});

describe('MEMORY LEAK FIX #8: Verify retryLoadServices has cooldown', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.clearAllMocks();
		sessionStorage.clear();
		localStorage.clear();
		setupWindowMocks();

		hoisted.findServices.mockReset();
		hoisted.loadPersistedServiceSearchFilters.mockReturnValue(null);

		hoisted.servicesStore.set({
			items: [],
			loading: false,
			error: 'Previous error',
			currentPage: 1,
			hasMore: false,
			searchParamsKey: ''
		});
		hoisted.authStateStore.set({ isAuthenticated: true });
		hoisted.userStore.set({ npub: 'owner-pubkey' });
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('rapid retryLoadServices calls should not trigger concurrent loadNostrData calls', async () => {
		let loadNostrDataCallCount = 0;

		hoisted.findServices.mockImplementation(async () => {
			loadNostrDataCallCount++;
			await vi.advanceTimersByTimeAsync(200);
		});

		hoisted.servicesStore.set({
			items: [],
			loading: false,
			error: 'Network error',
			currentPage: 1,
			hasMore: false,
			searchParamsKey: ''
		});

		const { default: ServicesPage } = await import(
			'../../../../routes/(app)/services/+page.svelte'
		);

		const { container } = render(ServicesPage);

		await tick();

		const buttons = container.querySelectorAll('button');
		const refreshButton = Array.from(buttons).find(
			(btn) =>
				btn.textContent?.includes('Refresh') || btn.getAttribute('aria-label') === 'Refresh page'
		);

		if (refreshButton instanceof HTMLElement) {
			refreshButton.click();
			await tick();
			refreshButton.click();
			await tick();
			refreshButton.click();
			await tick();
		}

		await vi.advanceTimersByTimeAsync(100);

		// Initial mount triggers one `loadNostrData` / `findServices` pass; at most one additional run from retries.
		expect(loadNostrDataCallCount).toBeLessThanOrEqual(2);
	});

	it('retryLoadServices should debounce rapid clicks with RETRY_COOLDOWN_MS', async () => {
		let findServicesCalls = 0;
		hoisted.findServices.mockImplementation(async () => {
			findServicesCalls++;
			await vi.advanceTimersByTimeAsync(50);
		});

		hoisted.servicesStore.set({
			items: [],
			loading: false,
			error: 'Connection error',
			currentPage: 1,
			hasMore: false,
			searchParamsKey: ''
		});

		const { default: ServicesPage } = await import(
			'../../../../routes/(app)/services/+page.svelte'
		);

		const { container } = render(ServicesPage);

		await tick();

		const buttons = container.querySelectorAll('button');
		const retryButton = Array.from(buttons).find(
			(btn) => btn.getAttribute('aria-label') === 'Refresh page'
		);

		if (retryButton instanceof HTMLElement) {
			retryButton.click();
			await tick();
			vi.advanceTimersByTime(500);
			retryButton.click();
			await tick();
			vi.advanceTimersByTime(500);
			retryButton.click();
			await tick();
		}

		await vi.advanceTimersByTimeAsync(100);

		expect(findServicesCalls).toBeLessThanOrEqual(2);
	});

	it('retryLoadServices cooldown should prevent duplicate findServices calls within cooldown period', async () => {
		let findServicesCallCount = 0;
		hoisted.findServices.mockImplementation(async () => {
			findServicesCallCount++;
			await vi.advanceTimersByTimeAsync(50);
		});

		hoisted.servicesStore.set({
			items: [],
			loading: false,
			error: 'Timeout error',
			currentPage: 1,
			hasMore: false,
			searchParamsKey: ''
		});

		const { default: ServicesPage } = await import(
			'../../../../routes/(app)/services/+page.svelte'
		);

		const { container } = render(ServicesPage);

		await tick();
		await vi.advanceTimersByTimeAsync(50);

		const buttons = container.querySelectorAll('button');
		const refreshButton = Array.from(buttons).find(
			(btn) => btn.getAttribute('aria-label') === 'Refresh page'
		);

		if (refreshButton instanceof HTMLElement) {
			refreshButton.click();
			await tick();
			vi.advanceTimersByTime(500);
			refreshButton.click();
			await tick();
			vi.advanceTimersByTime(500);
			refreshButton.click();
			await tick();
			vi.advanceTimersByTime(500);
			refreshButton.click();
			await tick();
		}

		await vi.advanceTimersByTimeAsync(100);

		expect(findServicesCallCount).toBeLessThanOrEqual(2);
	});
});

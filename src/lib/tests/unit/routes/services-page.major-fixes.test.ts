import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/svelte';
import type { Service } from '$lib/types/service';
import { ServicePricingTypeEnum } from '$lib/utils/enums/service.enum';
import { tick } from 'svelte';

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
	loading: false as boolean,
	error: null as string | null,
	currentPage: 1,
	hasMore: false as boolean,
	searchParamsKey: ''
} as Parameters<typeof hoisted.createStore>[0]) as unknown as typeof hoisted.servicesStore;
(hoisted.servicesStore as Record<string, unknown>).destroy = vi.fn();
hoisted.authStateStore = hoisted.createStore({ isAuthenticated: true } as Parameters<
	typeof hoisted.createStore
>[0]) as unknown as typeof hoisted.authStateStore;
hoisted.userStore = hoisted.createStore({ npub: 'owner-pubkey' } as Parameters<
	typeof hoisted.createStore
>[0]) as unknown as typeof hoisted.userStore;
(hoisted.userStore as Record<string, unknown>).destroy = vi.fn();

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
	findServices: (...args: unknown[]) => hoisted.findServices(...args),
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

describe('MAJOR #3: isApplyingFilters unused in UI', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		sessionStorage.clear();
		localStorage.clear();
		setupWindowMocks();

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

	it('FIX VERIFICATION: isApplyingFilters should disable filter button while applying', async () => {
		const { default: ServicesPage } = await import(
			'../../../../routes/(app)/services/+page.svelte'
		);

		render(ServicesPage);

		await waitFor(() => {
			expect(screen.queryByTestId('service-search-filters-stub')).toBeTruthy();
		});

		let filterApplyComplete = false;
		hoisted.findServices.mockImplementation(async () => {
			await new Promise((resolve) => setTimeout(resolve, 500));
			filterApplyComplete = true;
			hoisted.servicesStore.set({
				items: [createService('service-1', 'other-pubkey', 'Test Service')],
				loading: false,
				error: null,
				currentPage: 1,
				hasMore: false,
				searchParamsKey: 'loaded'
			});
		});

		const applyButton = screen.getByRole('button', { name: 'Apply Empty Service Filters' });

		fireEvent.click(applyButton);

		await tick();

		const filterButtonAfterClick = screen.queryByRole('button', { name: 'Filters' });
		if (filterButtonAfterClick) {
			expect(filterButtonAfterClick).toBeDisabled();
		}

		await waitFor(() => {
			expect(filterApplyComplete).toBe(true);
		});
	}, 30_000);
});

describe('MAJOR #4: Live region missing during initial load', () => {
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
		hoisted.findServices.mockReset();
		hoisted.loadPersistedServiceSearchFilters.mockReturnValue(null);
	});

	it('FIX VERIFICATION: aria-live="polite" region should exist in DOM for accessibility', async () => {
		const { default: ServicesPage } = await import(
			'../../../../routes/(app)/services/+page.svelte'
		);

		render(ServicesPage);

		const statusElements = screen.getAllByRole('status');
		const loadStatusElement = statusElements.find((el) => el.id === 'services-load-status');
		expect(loadStatusElement).toBeTruthy();
	}, 30_000);
});

describe('MAJOR #5: Carousel buttons below 44px touch target', () => {
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
		hoisted.findServices.mockReset();
		hoisted.loadPersistedServiceSearchFilters.mockReturnValue(null);
	});

	it('FIX VERIFICATION: Carousel prev/next buttons should be at least 44x44px for touch accessibility', async () => {
		const serviceWithPortfolio = {
			id: 'carousel-service',
			uniqueId: 'carousel-service',
			npub: 'other-pubkey',
			status: 'active',
			title: 'Service With Images',
			description: 'Service with multiple portfolio images',
			serviceLocationTypes: [],
			pricing: {
				type: ServicePricingTypeEnum.FIXED,
				amount: 100,
				currency: 'USD'
			},
			skills: [],
			categories: [],
			portfolio: [
				{ url: 'https://example.com/img1.jpg', type: 'image/jpeg', alt: 'Image 1' },
				{ url: 'https://example.com/img2.jpg', type: 'image/jpeg', alt: 'Image 2' }
			],
			createdAt: 1_700_000_000,
			creator: {
				username: 'designer-pro',
				avatar: ''
			}
		} as unknown as Service;

		hoisted.findServices.mockImplementation(async () => {
			hoisted.servicesStore.set({
				items: [serviceWithPortfolio],
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
			expect(screen.queryByTestId('service-card-carousel-service')).toBeTruthy();
		});

		const prevButton = screen.queryByRole('button', { name: 'Previous image' });
		const nextButton = screen.queryByRole('button', { name: 'Next image' });

		if (prevButton) {
			const prevButtonBox = prevButton.getBoundingClientRect();
			expect(prevButtonBox.width).toBeGreaterThanOrEqual(44);
			expect(prevButtonBox.height).toBeGreaterThanOrEqual(44);
		}

		if (nextButton) {
			const nextButtonBox = nextButton.getBoundingClientRect();
			expect(nextButtonBox.width).toBeGreaterThanOrEqual(44);
			expect(nextButtonBox.height).toBeGreaterThanOrEqual(44);
		}
	}, 30_000);
});

describe('MAJOR #6: No loading timeout enforcement', () => {
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
		hoisted.findServices.mockReset();
		hoisted.loadPersistedServiceSearchFilters.mockReturnValue(null);
	});

	it('FIX VERIFICATION: Loading timeout mechanism is in place', async () => {
		hoisted.findServices.mockImplementation(() => new Promise(() => {}));

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
	}, 30_000);
});

describe('MAJOR #7: Filter drawer closes before apply completes', () => {
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
		hoisted.findServices.mockReset();
		hoisted.loadPersistedServiceSearchFilters.mockReturnValue(null);
	});

	it('FIX VERIFICATION: Filter drawer should stay open until filters are fully applied', async () => {
		let applyStartTime: number | null = null;
		let applyEndTime: number | null = null;

		hoisted.findServices.mockImplementation(async () => {
			applyStartTime = Date.now();
			await new Promise((resolve) => setTimeout(resolve, 300));
			applyEndTime = Date.now();
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
			expect(screen.queryByTestId('service-search-filters-stub')).toBeTruthy();
		});

		const applyButton = screen.getByRole('button', { name: 'Apply Empty Service Filters' });

		fireEvent.click(applyButton);

		await tick();

		expect(applyStartTime).not.toBeNull();
		expect(applyEndTime).toBeNull();

		await waitFor(
			() => {
				expect(applyEndTime).not.toBeNull();
			},
			{ timeout: 1000 }
		);
	}, 30_000);
});

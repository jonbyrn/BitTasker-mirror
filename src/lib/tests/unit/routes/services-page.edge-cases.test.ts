import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
import type { Service } from '$lib/types/service.d';
import { ServiceLocationTypeEnum, ServicePricingTypeEnum } from '$lib/utils/enums/service.enum';

afterEach(() => cleanup());

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
} as Parameters<typeof hoisted.createStore>[0]) as typeof hoisted.servicesStore;
(hoisted.servicesStore as Record<string, unknown>).destroy = vi.fn();
hoisted.authStateStore = hoisted.createStore({ isAuthenticated: true } as Parameters<
	typeof hoisted.createStore
>[0]) as typeof hoisted.authStateStore;
hoisted.userStore = hoisted.createStore({ npub: 'owner-pubkey' } as Parameters<
	typeof hoisted.createStore
>[0]) as typeof hoisted.userStore;

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
			if (key === 'dashboard.services.browse.empty_title') return 'No services found';
			if (key === 'dashboard.services.browse.empty_description')
				return 'Try adjusting your search or filters';
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

let serviceIdCounter = 0;
function createService(overrides = {}) {
	const uniqueId =
		(overrides as Record<string, unknown>).uniqueId || `service-${++serviceIdCounter}`;
	return {
		id: `service-event-${uniqueId}`,
		uniqueId: uniqueId as string,
		npub: 'b'.repeat(64),
		title: 'Test Service',
		description: 'Test description',
		status: 'active',
		serviceLocationTypes: [ServiceLocationTypeEnum.REMOTE],
		locationDetails: {},
		pricing: {
			type: ServicePricingTypeEnum.FIXED,
			currency: 'USD',
			amount: 100
		},
		skills: ['Design'],
		categories: [{ id: 'design', name: 'Design', slug: 'design' }],
		portfolio: [],
		createdAt: 1_700_000_000,
		creator: {
			username: 'test-user',
			avatar: ''
		},
		...overrides
	} as unknown as Service;
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

describe('Edge Case: Empty services list', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		sessionStorage.clear();
		localStorage.clear();
		setupWindowMocks();

		hoisted.findServices.mockImplementation(async () => {
			hoisted.servicesStore.set({
				items: [],
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

	it('displays empty state UI when no services are returned', async () => {
		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

		const { default: ServicesPage } = await import(
			'../../../../routes/(app)/services/+page.svelte'
		);

		render(ServicesPage);

		await waitFor(() => {
			const emptyState = screen.queryByTestId('services-empty-state');
			const emptyTitle = screen.queryByText('dashboard.services.browse.no_services_found');
			const emptyMessage = screen.queryByText('dashboard.services.browse.no_services_message');
			expect(emptyTitle || emptyMessage || emptyState).toBeTruthy();
		});

		expect(consoleSpy).not.toHaveBeenCalled();
		consoleSpy.mockRestore();
	});

	it('does not crash when findServices returns empty array', async () => {
		const { default: ServicesPage } = await import(
			'../../../../routes/(app)/services/+page.svelte'
		);

		expect(() => render(ServicesPage)).not.toThrow();

		await waitFor(() => {
			expect(hoisted.findServices).toHaveBeenCalled();
		});
	});
});

describe('Edge Case: Single service', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		sessionStorage.clear();
		localStorage.clear();
		setupWindowMocks();

		hoisted.findServices.mockImplementation(async () => {
			hoisted.servicesStore.set({
				items: [createService({ uniqueId: 'single-service', title: 'Single Service' })],
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

	it('handles single service correctly', async () => {
		const { default: ServicesPage } = await import(
			'../../../../routes/(app)/services/+page.svelte'
		);

		render(ServicesPage);

		await waitFor(() => {
			expect(screen.queryByTestId('service-card-service-event-single-service')).toBeTruthy();
		});

		const serviceCards = screen.queryAllByTestId(/service-card-service-event-/);
		expect(serviceCards.length).toBe(1);
	});

	it('does not show pagination for single service', async () => {
		const { default: ServicesPage } = await import(
			'../../../../routes/(app)/services/+page.svelte'
		);

		render(ServicesPage);

		await waitFor(() => {
			expect(screen.queryByTestId('service-card-service-event-single-service')).toBeTruthy();
		});

		const noMoreServices = screen.queryByText('No more services');
		expect(noMoreServices).toBeTruthy();
	});
});

describe('Edge Case: Many services (10+)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		sessionStorage.clear();
		localStorage.clear();
		setupWindowMocks();
	});

	it('renders all services when 10+ are returned', async () => {
		const manyServices = Array.from({ length: 15 }, (_, i) =>
			createService({
				uniqueId: `service-${i}`,
				id: `service-event-${i}`,
				title: `Service Number ${i}`
			})
		);

		hoisted.findServices.mockImplementation(async () => {
			hoisted.servicesStore.set({
				items: manyServices,
				loading: false,
				error: null,
				currentPage: 1,
				hasMore: true,
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

		const { default: ServicesPage } = await import(
			'../../../../routes/(app)/services/+page.svelte'
		);

		render(ServicesPage);

		await waitFor(() => {
			const cards = screen.queryAllByTestId(/service-card-service-/);
			expect(cards.length).toBe(15);
		});
	});

	it('indicates infinite scroll when hasMore is true', async () => {
		const manyServices = Array.from({ length: 12 }, (_, i) =>
			createService({ uniqueId: `scroll-service-${i}`, title: `Scroll Service ${i}` })
		);

		hoisted.findServices.mockImplementation(async () => {
			hoisted.servicesStore.set({
				items: manyServices,
				loading: false,
				error: null,
				currentPage: 1,
				hasMore: true,
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

		const { default: ServicesPage } = await import(
			'../../../../routes/(app)/services/+page.svelte'
		);

		render(ServicesPage);

		await waitFor(() => {
			expect(screen.queryByText('No more services')).toBeNull();
		});
	});
});

describe('Edge Case: Service with missing fields', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		sessionStorage.clear();
		localStorage.clear();
		setupWindowMocks();
	});

	it('handles service with missing description gracefully', async () => {
		const serviceWithMissingDesc = createService({
			description: '',
			uniqueId: 'no-description'
		});

		hoisted.findServices.mockImplementation(async () => {
			hoisted.servicesStore.set({
				items: [serviceWithMissingDesc],
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

		const { default: ServicesPage } = await import(
			'../../../../routes/(app)/services/+page.svelte'
		);

		expect(() => render(ServicesPage)).not.toThrow();

		await waitFor(() => {
			expect(screen.queryByTestId('service-card-service-event-no-description')).toBeTruthy();
		});
	});

	it('handles service with missing categories gracefully', async () => {
		const serviceWithMissingCats = createService({
			categories: [],
			uniqueId: 'no-categories'
		});

		hoisted.findServices.mockImplementation(async () => {
			hoisted.servicesStore.set({
				items: [serviceWithMissingCats],
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

		const { default: ServicesPage } = await import(
			'../../../../routes/(app)/services/+page.svelte'
		);

		expect(() => render(ServicesPage)).not.toThrow();

		await waitFor(() => {
			expect(screen.queryByTestId('service-card-service-event-no-categories')).toBeTruthy();
		});
	});

	it('handles service with null portfolio gracefully', async () => {
		const serviceWithNullPortfolio = createService({
			portfolio: null,
			uniqueId: 'null-portfolio'
		});

		hoisted.findServices.mockImplementation(async () => {
			hoisted.servicesStore.set({
				items: [serviceWithNullPortfolio],
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

		const { default: ServicesPage } = await import(
			'../../../../routes/(app)/services/+page.svelte'
		);

		expect(() => render(ServicesPage)).not.toThrow();
	});
});

describe('Edge Case: Service with invalid coordinates', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		sessionStorage.clear();
		localStorage.clear();
		setupWindowMocks();
	});

	it('does not crash when service has null coordinates', async () => {
		const serviceWithNullCoords = createService({
			serviceLocationTypes: [ServiceLocationTypeEnum.TASKEE_LOCATION],
			locationDetails: {
				taskeeLocation: {
					serviceLocation: null
				}
			},
			uniqueId: 'null-coords'
		});

		hoisted.findServices.mockImplementation(async () => {
			hoisted.servicesStore.set({
				items: [serviceWithNullCoords],
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

		const { default: ServicesPage } = await import(
			'../../../../routes/(app)/services/+page.svelte'
		);

		expect(() => render(ServicesPage)).not.toThrow();
	});

	it('does not crash when service has undefined coordinates', async () => {
		const serviceWithUndefinedCoords = createService({
			serviceLocationTypes: [ServiceLocationTypeEnum.TASKER_LOCATION],
			locationDetails: {
				taskerLocation: {
					serviceLocation: undefined
				}
			},
			uniqueId: 'undefined-coords'
		});

		hoisted.findServices.mockImplementation(async () => {
			hoisted.servicesStore.set({
				items: [serviceWithUndefinedCoords],
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

		const { default: ServicesPage } = await import(
			'../../../../routes/(app)/services/+page.svelte'
		);

		expect(() => render(ServicesPage)).not.toThrow();
	});

	it('does not crash when service has invalid latitude/longitude values', async () => {
		const serviceWithInvalidCoords = createService({
			serviceLocationTypes: [ServiceLocationTypeEnum.TASKEE_LOCATION],
			locationDetails: {
				taskeeLocation: {
					serviceLocation: {
						latitude: NaN,
						longitude: Infinity
					}
				}
			},
			uniqueId: 'invalid-coords'
		});

		hoisted.findServices.mockImplementation(async () => {
			hoisted.servicesStore.set({
				items: [serviceWithInvalidCoords],
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

		const { default: ServicesPage } = await import(
			'../../../../routes/(app)/services/+page.svelte'
		);

		expect(() => render(ServicesPage)).not.toThrow();
	});
});

describe('Edge Case: Storage with invalid JSON', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		sessionStorage.clear();
		localStorage.clear();
		setupWindowMocks();
	});

	it('handles corrupted JSON in sessionStorage gracefully', async () => {
		sessionStorage.setItem('savedServiceSearchParams', '{ "invalid json');

		hoisted.findServices.mockImplementation(async () => {
			hoisted.servicesStore.set({
				items: [
					createService({
						uniqueId: 'post-corrupted-storage',
						title: 'Service After Corrupted Storage'
					})
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

		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

		const { default: ServicesPage } = await import(
			'../../../../routes/(app)/services/+page.svelte'
		);

		expect(() => render(ServicesPage)).not.toThrow();

		await waitFor(() => {
			expect(
				screen.queryByTestId('service-card-service-event-post-corrupted-storage')
			).toBeTruthy();
		});

		expect(consoleSpy).not.toHaveBeenCalled();
		consoleSpy.mockRestore();
		warnSpy.mockRestore();
	});

	it('handles malformed JSON in localStorage search filters gracefully', async () => {
		localStorage.setItem('serviceSearchFilters', 'not valid json {{{');

		hoisted.findServices.mockImplementation(async () => {
			hoisted.servicesStore.set({
				items: [createService({ uniqueId: 'after-malformed', title: 'Service After Malformed' })],
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

		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

		const { default: ServicesPage } = await import(
			'../../../../routes/(app)/services/+page.svelte'
		);

		expect(() => render(ServicesPage)).not.toThrow();

		await waitFor(() => {
			expect(screen.queryByTestId('service-card-service-event-after-malformed')).toBeTruthy();
		});

		expect(consoleSpy).not.toHaveBeenCalled();
		consoleSpy.mockRestore();
		warnSpy.mockRestore();
	});

	it('handles sessionStorage with circular reference JSON', async () => {
		try {
			const circularObj: Record<string, unknown> = { key: 'value' };
			circularObj.self = circularObj;
			sessionStorage.setItem('savedServiceSearchParams', JSON.stringify(circularObj));
		} catch {
			sessionStorage.setItem('savedServiceSearchParams', 'CIRCULAR_OBJECT');
		}

		hoisted.findServices.mockImplementation(async () => {
			hoisted.servicesStore.set({
				items: [createService({ uniqueId: 'after-circular', title: 'Service After Circular' })],
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

		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

		const { default: ServicesPage } = await import(
			'../../../../routes/(app)/services/+page.svelte'
		);

		expect(() => render(ServicesPage)).not.toThrow();

		await waitFor(() => {
			expect(screen.queryByTestId('service-card-service-event-after-circular')).toBeTruthy();
		});

		expect(consoleSpy).not.toHaveBeenCalled();
		consoleSpy.mockRestore();
		warnSpy.mockRestore();
	});
});

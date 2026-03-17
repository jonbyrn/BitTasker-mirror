import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/svelte';
import type { Service } from '$lib/types/service.d';

const hoisted = vi.hoisted(() => {
	function createStore<T>(initialValue: T) {
		let value = initialValue;
		const subscribers = new Set<(nextValue: T) => void>();

		return {
			set(nextValue: T) {
				value = nextValue;
				for (const subscriber of subscribers) {
					subscriber(value);
				}
			},
			subscribe(subscriber: (nextValue: T) => void) {
				subscriber(value);
				subscribers.add(subscriber);
				return () => subscribers.delete(subscriber);
			}
		};
	}

	return {
		profileState: createStore({
			isLoading: false,
			error: null,
			servicesLoading: false,
			servicesError: null as string | null,
			services: [] as Service[],
			stats: {
				tasksCompleted: 0,
				activeServices: 0,
				rating: 0,
				responseRate: 0,
				onTimeRate: 0
			},
			data: null
		})
	};
});

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	const translations: Record<string, string> = {
		'profile.services_summary.title': 'Active Services',
		'profile.services_summary.description': 'Profile services description',
		'profile.services_summary.count_loading': 'Loading...',
		'profile.services_summary.create_cta': 'Create Service',
		'profile.services_summary.empty': 'No active services yet.',
		'profile.services_summary.load_error': 'Failed to load active services.',
		'profile.services_summary.active_badge': 'Active',
		'stats.activeServices': 'Active Services'
	};

	return {
		t: readable((key: string) => translations[key] || key),
		locale: readable('en')
	};
});

vi.mock('$lib/utils/serviceDisplayTranslation', () => ({
	getServiceDisplayTitle: (service: { title?: string }) => service.title ?? '',
	getServiceDisplayDescription: (service: { description?: string }) => service.description ?? ''
}));

vi.mock('$lib/stores/profile.store', () => ({
	profileStore: {
		subscribe: hoisted.profileState.subscribe
	}
}));

const service: Service = {
	id: 'service-event-1',
	uniqueId: 'service-123',
	title: 'Brand Identity Sprint',
	description: 'Logo system and social avatar pack.',
	status: 'active',
	npub: 'a'.repeat(64),
	serviceLocationTypes: [],
	skills: [],
	categories: [],
	pricing: {
		type: 'FIXED',
		currency: 'USDt',
		amount: 200
	},
	createdAt: 1_700_000_000
} as Service;

describe('ProfileServicesSection', () => {
	beforeEach(() => {
		hoisted.profileState.set({
			isLoading: false,
			error: null,
			servicesLoading: false,
			servicesError: null,
			services: [],
			stats: {
				tasksCompleted: 0,
				activeServices: 0,
				rating: 0,
				responseRate: 0,
				onTimeRate: 0
			},
			data: null
		});
	});

	afterEach(() => {
		cleanup();
	});

	it('renders loading placeholders while services are loading', async () => {
		hoisted.profileState.set({
			isLoading: false,
			error: null,
			servicesLoading: true,
			servicesError: null,
			services: [],
			stats: {
				tasksCompleted: 0,
				activeServices: 0,
				rating: 0,
				responseRate: 0,
				onTimeRate: 0
			},
			data: null
		});

		const { getByTestId, getByText } = render(
			await import('$lib/components/profile/ProfileServicesSection.svelte').then(
				(module) => module.default
			)
		);

		expect(getByTestId('profile-services-loading')).toBeTruthy();
		expect(getByTestId('profile-services-loading-row-0')).toBeTruthy();
		expect(getByText('Loading...')).toBeTruthy();
	});

	it('renders the empty state with the create-service link', async () => {
		const { getByTestId, getByRole } = render(
			await import('$lib/components/profile/ProfileServicesSection.svelte').then(
				(module) => module.default
			)
		);

		expect(getByTestId('profile-services-empty')).toBeTruthy();
		expect(getByRole('link').getAttribute('href')).toBe('/dashboard/create-service');
	});

	it('renders an error state when services fail to load', async () => {
		hoisted.profileState.set({
			isLoading: false,
			error: null,
			servicesLoading: false,
			servicesError: 'relay timeout',
			services: [],
			stats: {
				tasksCompleted: 0,
				activeServices: 0,
				rating: 0,
				responseRate: 0,
				onTimeRate: 0
			},
			data: null
		});

		const { getByTestId, getByText } = render(
			await import('$lib/components/profile/ProfileServicesSection.svelte').then(
				(module) => module.default
			)
		);

		expect(getByTestId('profile-services-error')).toBeTruthy();
		expect(getByText('relay timeout')).toBeTruthy();
	});

	it('renders active service links with canonical service detail urls', async () => {
		hoisted.profileState.set({
			isLoading: false,
			error: null,
			servicesLoading: false,
			servicesError: null,
			services: [service],
			stats: {
				tasksCompleted: 0,
				activeServices: 1,
				rating: 0,
				responseRate: 0,
				onTimeRate: 0
			},
			data: null
		});

		const { getByTestId, getByText } = render(
			await import('$lib/components/profile/ProfileServicesSection.svelte').then(
				(module) => module.default
			)
		);

		expect(getByTestId('profile-services-list')).toBeTruthy();
		expect(getByText('Brand Identity Sprint')).toBeTruthy();
		expect(getByTestId('profile-service-link-service-123').getAttribute('href')).toBe(
			'/services/service-123'
		);
	});
});

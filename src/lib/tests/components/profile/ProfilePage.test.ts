import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/svelte';
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
		init: vi.fn(),
		destroy: vi.fn(),
		profileState: createStore({
			isLoading: false,
			error: null,
			servicesLoading: false,
			servicesError: null as string | null,
			services: [] as Service[],
			stats: {
				tasksCompleted: 3,
				activeServices: 1,
				rating: 5,
				responseRate: 100,
				onTimeRate: 100
			}
		})
	};
});

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	return {
		t: readable((key: string) => key),
		locale: readable('en')
	};
});

vi.mock('$lib/components/profile/ProfileHeader.svelte', async () => ({
	default: (await import('$lib/components/Avatar.svelte')).default
}));

vi.mock('$lib/components/profile/ProfileInfoSection.svelte', async () => ({
	default: (await import('$lib/components/Avatar.svelte')).default
}));

vi.mock('$lib/components/profile/ProfileSidebar.svelte', async () => ({
	default: (await import('$lib/components/Avatar.svelte')).default
}));

vi.mock('$lib/utils/serviceDisplayTranslation', () => ({
	getServiceDisplayTitle: (service: { title?: string }) => service.title ?? '',
	getServiceDisplayDescription: (service: { description?: string }) => service.description ?? ''
}));

vi.mock('$lib/stores/profile.store', () => ({
	profileStore: {
		subscribe: hoisted.profileState.subscribe,
		init: hoisted.init,
		destroy: hoisted.destroy
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

describe('dashboard profile page', () => {
	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	it(
		'initializes and tears down the profile store while rendering the services slice',
		async () => {
		hoisted.profileState.set({
			isLoading: false,
			error: null,
			servicesLoading: false,
			servicesError: null,
			services: [service],
			stats: {
				tasksCompleted: 3,
				activeServices: 1,
				rating: 5,
				responseRate: 100,
				onTimeRate: 100
			}
		});

		const component = (await import('../../../../routes/(protected)/dashboard/profile/+page.svelte'))
			.default;
		const { getByTestId, unmount } = render(component);

		await waitFor(() => expect(hoisted.init).toHaveBeenCalledTimes(1));
		expect(getByTestId('profile-services-module')).toBeTruthy();
		expect(getByTestId('profile-stats-active-services').textContent).toBe('1');
		expect(getByTestId('profile-service-link-service-123').getAttribute('href')).toBe(
			'/services/service-123'
		);

		unmount();
		expect(hoisted.destroy).toHaveBeenCalledTimes(1);
		},
		15_000
	);

	it('routes the service-count stat into the error state when services fail to load', async () => {
		hoisted.profileState.set({
			isLoading: false,
			error: null,
			servicesLoading: false,
			servicesError: 'relay timeout',
			services: [],
			stats: {
				tasksCompleted: 3,
				activeServices: 0,
				rating: 5,
				responseRate: 100,
				onTimeRate: 100
			}
		});

		const component = (await import('../../../../routes/(protected)/dashboard/profile/+page.svelte'))
			.default;
		const { getByTestId } = render(component);

		expect(getByTestId('profile-stats-active-services').textContent).toBe(
			'profile.services_summary.count_unavailable'
		);
	});
});

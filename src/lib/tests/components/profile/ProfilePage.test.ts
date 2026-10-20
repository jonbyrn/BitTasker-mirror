import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/svelte';

const hoisted = vi.hoisted(() => ({
	init: vi.fn(),
	destroy: vi.fn()
}));

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	return {
		t: readable((key: string) => key),
		locale: readable('en')
	};
});

vi.mock('$app/state', () => ({
	page: {
		url: new URL('http://localhost/profile')
	}
}));

vi.mock('$lib/components/profile/ProfileHeader.svelte', () => ({
	default: () => null
}));

vi.mock('$lib/components/profile/ProfileInfoSection.svelte', () => ({
	default: () => null
}));

vi.mock('$lib/components/profile/ProfileSidebar.svelte', () => ({
	default: () => null
}));

vi.mock('$lib/components/profile/ProfileReviewsSection.svelte', () => ({
	default: () => null
}));

vi.mock('$lib/stores/profile.store', () => ({
	profileStore: {
		subscribe: (run: (value: unknown) => void) => {
			run({
				isLoading: false,
				error: null,
				servicesLoading: false,
				servicesError: null,
				services: [],
				data: null,
				stats: {
					tasksCompleted: 3,
					activeServices: 1,
					rating: 5,
					responseRate: 100,
					onTimeRate: 100
				}
			});
			return () => {};
		},
		init: hoisted.init,
		destroy: hoisted.destroy
	}
}));

describe('dashboard profile page', () => {
	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	it('initializes and tears down the profile store on mount/unmount', async () => {
		const component = (await import('../../../../routes/(app)/(protected)/profile/+page.svelte'))
			.default;
		const { unmount } = render(component);

		await waitFor(() => expect(hoisted.init).toHaveBeenCalled());

		unmount();
		expect(hoisted.destroy).toHaveBeenCalled();
	}, 30_000);

	it('renders the profile page heading', async () => {
		const component = (await import('../../../../routes/(app)/(protected)/profile/+page.svelte'))
			.default;
		const { getByText } = render(component);

		await waitFor(() => {
			const heading = getByText('profile.page.title');
			expect(heading).toBeTruthy();
			expect(heading.closest('.px-4')).toBeTruthy();
		});
	}, 30_000);
});

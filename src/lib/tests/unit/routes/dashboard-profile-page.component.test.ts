import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import { readable } from 'svelte/store';
import DashboardProfilePage from '../../../../routes/(app)/(protected)/profile/+page.svelte';

const mocks = vi.hoisted(() => ({
	profileStoreInit: vi.fn(),
	profileStoreDestroy: vi.fn(),
	ProfileHeader: vi.fn(() => ({ $$: { ctx: [] } })),
	ProfileStats: vi.fn(() => ({ $$: { ctx: [] } })),
	ProfileInfoSection: vi.fn(() => ({ $$: { ctx: [] } })),
	ProfileSidebar: vi.fn(() => ({ $$: { ctx: [] } })),
	ProfileReviewsSection: vi.fn(() => ({ $$: { ctx: [] } })),
	page: {
		url: new URL('https://example.com/profile')
	}
}));

vi.mock('svelte-i18n', async () => {
	const tStore = readable((key: string) => key);
	return {
		t: tStore,
		locale: readable('en'),
		locales: readable(['en']),
		isLoading: readable(false)
	};
});

vi.mock('$app/state', () => ({
	page: mocks.page
}));

vi.mock('$lib/stores/profile.store', () => ({
	profileStore: {
		subscribe: readable({
			stats: {
				tasksCompleted: 0,
				rating: 0,
				responseRate: 0,
				onTimeRate: 0
			}
		}).subscribe,
		init: mocks.profileStoreInit,
		destroy: mocks.profileStoreDestroy
	}
}));

vi.mock('$lib/components/profile/ProfileHeader.svelte', () => ({
	default: mocks.ProfileHeader
}));

vi.mock('$lib/components/profile/ProfileStats.svelte', () => ({
	default: mocks.ProfileStats
}));

vi.mock('$lib/components/profile/ProfileInfoSection.svelte', () => ({
	default: mocks.ProfileInfoSection
}));

vi.mock('$lib/components/profile/ProfileSidebar.svelte', () => ({
	default: mocks.ProfileSidebar
}));

vi.mock('$lib/components/profile/ProfileReviewsSection.svelte', () => ({
	default: mocks.ProfileReviewsSection
}));

describe('dashboard profile page', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.page.url = new URL('https://example.com/profile');
	});

	it('honors review query params for another user', () => {
		mocks.page.url = new URL('https://example.com/profile?user=npub-target-user&tab=reviews');

		render(DashboardProfilePage);

		expect((mocks.ProfileReviewsSection.mock.calls[0] as unknown[])?.[1]).toEqual(
			expect.objectContaining({
				userPubkey: 'npub-target-user',
				isCurrentUser: false
			})
		);
		expect(mocks.ProfileHeader).not.toHaveBeenCalled();
		expect(mocks.ProfileStats).not.toHaveBeenCalled();
		expect(mocks.ProfileInfoSection).not.toHaveBeenCalled();
		expect(mocks.ProfileSidebar).not.toHaveBeenCalled();
		expect(mocks.profileStoreInit).toHaveBeenCalledTimes(1);
	});

	it('shows profile edit view when only the reviews tab is requested', () => {
		mocks.page.url = new URL('https://example.com/profile?tab=reviews');

		render(DashboardProfilePage);

		// When no user param, shows the profile edit view (not reviews)
		expect(mocks.ProfileReviewsSection).not.toHaveBeenCalled();
		expect(mocks.profileStoreInit).toHaveBeenCalledTimes(2);
		expect(mocks.ProfileHeader).toHaveBeenCalledTimes(1);
		expect(mocks.ProfileInfoSection).toHaveBeenCalledTimes(1);
		expect(mocks.ProfileSidebar).toHaveBeenCalledTimes(1);
	});
});

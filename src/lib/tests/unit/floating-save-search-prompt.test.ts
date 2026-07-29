import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Preferences } from '@capacitor/preferences';

const STORAGE_KEY = 'bittasker_dismissed_save_search_prompts';

let store: Record<string, string> = {};

vi.mock('@capacitor/preferences', () => ({
	Preferences: {
		get: vi.fn(async ({ key }: { key: string }) => ({ value: store[key] ?? null })),
		set: vi.fn(async ({ key, value }: { key: string; value: string }) => {
			store[key] = value;
		}),
		remove: vi.fn(async ({ key }: { key: string }) => {
			delete store[key];
		}),
		clear: vi.fn(async () => {
			store = {};
		}),
		keys: vi.fn(async () => ({ keys: [] })),
		configure: vi.fn(async () => {}),
		migrate: vi.fn(async () => ({ migrated: [], existing: [] })),
		removeOld: vi.fn(async () => {})
	}
}));

const { mockShowBanner, mockDismissBanner } = vi.hoisted(() => ({
	mockShowBanner: vi.fn(async (_options: Record<string, unknown>): Promise<number | null> => 1),
	mockDismissBanner: vi.fn(async (_id: number): Promise<void> => {})
}));

vi.mock('$lib/stores/app.store', () => ({
	appStore: {
		showBanner: mockShowBanner,
		dismissBanner: mockDismissBanner
	}
}));

import { manageSaveSearchBanner, dismissSaveSearchBanner } from '$lib/utils/saveSearchBanner';

async function getDismissedHashes(): Promise<string[]> {
	try {
		const { value } = await Preferences.get({ key: STORAGE_KEY });
		return value ? JSON.parse(value) : [];
	} catch {
		return [];
	}
}

describe('save-search-banner — computeFilterHash', () => {
	beforeEach(async () => {
		await Preferences.clear();
		vi.clearAllMocks();
	});

	it('shows banner for text search', async () => {
		await manageSaveSearchBanner({ search: 'web dev' }, 'tasks', vi.fn());
		expect(mockShowBanner).toHaveBeenCalled();
	});

	it('shows banner for categories filter', async () => {
		await manageSaveSearchBanner({ categories: ['tech', 'design'] }, 'tasks', vi.fn());
		expect(mockShowBanner).toHaveBeenCalled();
	});

	it('shows banner for skills filter', async () => {
		await manageSaveSearchBanner({ skills: ['javascript'] }, 'services', vi.fn());
		expect(mockShowBanner).toHaveBeenCalled();
	});

	it('shows banner for serviceLocationTypes filter', async () => {
		await manageSaveSearchBanner({ serviceLocationTypes: ['remote'] }, 'services', vi.fn());
		expect(mockShowBanner).toHaveBeenCalled();
	});

	it('shows banner for taskType filter', async () => {
		await manageSaveSearchBanner({ taskType: 'remote' }, 'tasks', vi.fn());
		expect(mockShowBanner).toHaveBeenCalled();
	});

	it('shows banner for pricingType filter', async () => {
		await manageSaveSearchBanner({ pricingType: 'fixed' }, 'services', vi.fn());
		expect(mockShowBanner).toHaveBeenCalled();
	});

	it('shows banner for experienceLevel filter', async () => {
		await manageSaveSearchBanner({ experienceLevel: 'intermediate' }, 'tasks', vi.fn());
		expect(mockShowBanner).toHaveBeenCalled();
	});

	it('shows banner for deliveryTime filter', async () => {
		await manageSaveSearchBanner({ deliveryTime: 24 }, 'services', vi.fn());
		expect(mockShowBanner).toHaveBeenCalled();
	});

	it('shows banner for location filter', async () => {
		await manageSaveSearchBanner({ location: 'New York' }, 'tasks', vi.fn());
		expect(mockShowBanner).toHaveBeenCalled();
	});

	it('shows banner for minBudget filter', async () => {
		await manageSaveSearchBanner({ minBudget: 100 }, 'tasks', vi.fn());
		expect(mockShowBanner).toHaveBeenCalled();
	});

	it('shows banner for maxBudget filter', async () => {
		await manageSaveSearchBanner({ maxBudget: 500 }, 'tasks', vi.fn());
		expect(mockShowBanner).toHaveBeenCalled();
	});

	it('shows banner for minPrice filter', async () => {
		await manageSaveSearchBanner({ minPrice: 50 }, 'services', vi.fn());
		expect(mockShowBanner).toHaveBeenCalled();
	});

	it('shows banner for maxPrice filter', async () => {
		await manageSaveSearchBanner({ maxPrice: 200 }, 'services', vi.fn());
		expect(mockShowBanner).toHaveBeenCalled();
	});

	it('shows banner for deadline filter', async () => {
		await manageSaveSearchBanner({ deadline: '2026-12-31' }, 'tasks', vi.fn());
		expect(mockShowBanner).toHaveBeenCalled();
	});

	it('shows banner for dateRange filter', async () => {
		await manageSaveSearchBanner(
			{ dateRange: { start: '2026-01-01', end: '2026-12-31' } },
			'tasks',
			vi.fn()
		);
		expect(mockShowBanner).toHaveBeenCalled();
	});

	it('shows banner for budget object with tier', async () => {
		await manageSaveSearchBanner({ budget: { tier: 'premium' } }, 'tasks', vi.fn());
		expect(mockShowBanner).toHaveBeenCalled();
	});

	it('shows banner for budget object with currency', async () => {
		await manageSaveSearchBanner({ budget: { currency: 'BTC' } }, 'tasks', vi.fn());
		expect(mockShowBanner).toHaveBeenCalled();
	});

	it('shows banner for budget object with type', async () => {
		await manageSaveSearchBanner({ budget: { type: 'FIXED' } }, 'tasks', vi.fn());
		expect(mockShowBanner).toHaveBeenCalled();
	});

	it('shows banner for radius filter', async () => {
		await manageSaveSearchBanner({ radius: 10, location: 'NYC' }, 'services', vi.fn());
		expect(mockShowBanner).toHaveBeenCalled();
	});

	it('does NOT show banner for empty params', async () => {
		await manageSaveSearchBanner({}, 'tasks', vi.fn());
		expect(mockShowBanner).not.toHaveBeenCalled();
	});

	it('does NOT show banner for page/limit only', async () => {
		await manageSaveSearchBanner({ page: 1, limit: 20 }, 'tasks', vi.fn());
		expect(mockShowBanner).not.toHaveBeenCalled();
	});

	it('does NOT show banner for empty categories array', async () => {
		await manageSaveSearchBanner({ categories: [] }, 'tasks', vi.fn());
		expect(mockShowBanner).not.toHaveBeenCalled();
	});

	it('does NOT show banner for empty search string', async () => {
		await manageSaveSearchBanner({ search: '' }, 'tasks', vi.fn());
		expect(mockShowBanner).not.toHaveBeenCalled();
	});

	it('does NOT show banner for whitespace-only search', async () => {
		await manageSaveSearchBanner({ search: '   ' }, 'tasks', vi.fn());
		expect(mockShowBanner).not.toHaveBeenCalled();
	});
});

describe('save-search-banner — dismissal', () => {
	beforeEach(async () => {
		await Preferences.clear();
		vi.clearAllMocks();
	});

	it('dismiss stores hash via Preferences', async () => {
		await manageSaveSearchBanner({ search: 'web dev' }, 'tasks', vi.fn());
		const bannerCall = mockShowBanner.mock.calls[0][0] as Record<string, unknown>;
		const dismissAction = (bannerCall.actions as Array<Record<string, unknown>>)[0];
		await (dismissAction.onClick as () => Promise<void>)();
		const dismissed = await getDismissedHashes();
		expect(dismissed.length).toBe(1);
	});

	it('dismissed hash prevents banner from showing again', async () => {
		await manageSaveSearchBanner({ search: 'web dev' }, 'tasks', vi.fn());
		expect(mockShowBanner).toHaveBeenCalledTimes(1);

		const bannerCall = mockShowBanner.mock.calls[0][0] as Record<string, unknown>;
		const dismissAction = (bannerCall.actions as Array<Record<string, unknown>>)[0];
		await (dismissAction.onClick as () => Promise<void>)();

		await manageSaveSearchBanner({ search: 'web dev' }, 'tasks', vi.fn());
		expect(mockShowBanner).toHaveBeenCalledTimes(1);
	});

	it('different filter hash shows banner even after dismissing another', async () => {
		await manageSaveSearchBanner({ search: 'web dev' }, 'tasks', vi.fn());
		const bannerCall = mockShowBanner.mock.calls[0][0] as Record<string, unknown>;
		const dismissAction = (bannerCall.actions as Array<Record<string, unknown>>)[0];
		await (dismissAction.onClick as () => Promise<void>)();

		await manageSaveSearchBanner({ search: 'logo design' }, 'tasks', vi.fn());
		expect(mockShowBanner).toHaveBeenCalledTimes(2);
	});

	it('enable action stores hash and calls onEnable', async () => {
		const onEnable = vi.fn();
		await manageSaveSearchBanner({ search: 'web dev' }, 'tasks', onEnable);
		const bannerCall = mockShowBanner.mock.calls[0][0] as Record<string, unknown>;
		const enableAction = (bannerCall.actions as Array<Record<string, unknown>>)[1];
		await (enableAction.onClick as () => Promise<void>)();
		expect(onEnable).toHaveBeenCalled();
		const dismissed = await getDismissedHashes();
		expect(dismissed.length).toBe(1);
	});

	it('dismissSaveSearchBanner calls appStore.dismissBanner', async () => {
		await manageSaveSearchBanner({ search: 'web dev' }, 'tasks', vi.fn());
		await dismissSaveSearchBanner();
		expect(mockDismissBanner).toHaveBeenCalled();
	});
});

describe('save-search-banner — searchType', () => {
	beforeEach(async () => {
		await Preferences.clear();
		vi.clearAllMocks();
	});

	it('uses task i18n key for tasks', async () => {
		await manageSaveSearchBanner({ search: 'test' }, 'tasks', vi.fn());
		const bannerCall = mockShowBanner.mock.calls[0][0] as Record<string, unknown>;
		expect((bannerCall.message as Record<string, string>).key).toBe(
			'notifications.save_search_prompt.description_task'
		);
	});

	it('uses service i18n key for services', async () => {
		await manageSaveSearchBanner({ search: 'test' }, 'services', vi.fn());
		const bannerCall = mockShowBanner.mock.calls[0][0] as unknown as Record<string, string>;
		expect((bannerCall.message as unknown as Record<string, string>).key).toBe(
			'notifications.save_search_prompt.description_service'
		);
	});

	it('uses different dedupKey per searchType and filter hash', async () => {
		await manageSaveSearchBanner({ search: 'test' }, 'tasks', vi.fn());
		const taskDedup = (mockShowBanner.mock.calls[0][0] as Record<string, string>).dedupKey;
		await manageSaveSearchBanner({ search: 'test' }, 'services', vi.fn());
		const serviceDedup = (mockShowBanner.mock.calls[1][0] as Record<string, string>).dedupKey;
		expect(taskDedup).toContain('save-search-prompt-tasks');
		expect(serviceDedup).toContain('save-search-prompt-services');
		expect(taskDedup).not.toBe(serviceDedup);
	});

	it('uses different dedupKey for different filter hashes within same searchType', async () => {
		await manageSaveSearchBanner({ search: 'web' }, 'tasks', vi.fn());
		const hash1Dedup = (mockShowBanner.mock.calls[0][0] as Record<string, string>).dedupKey;
		await manageSaveSearchBanner({ search: 'design' }, 'tasks', vi.fn());
		const hash2Dedup = (mockShowBanner.mock.calls[1][0] as Record<string, string>).dedupKey;
		expect(hash1Dedup).not.toBe(hash2Dedup);
	});
});

describe('save-search-banner — re-shows on new filters', () => {
	beforeEach(async () => {
		await Preferences.clear();
		vi.clearAllMocks();
	});

	it('shows banner again when filters change to a new non-dismissed combination', async () => {
		await manageSaveSearchBanner({ search: 'web', categories: ['tech'] }, 'tasks', vi.fn());
		expect(mockShowBanner).toHaveBeenCalledTimes(1);

		// Change categories — new hash, not dismissed
		await manageSaveSearchBanner({ search: 'web', categories: ['design'] }, 'tasks', vi.fn());
		expect(mockShowBanner).toHaveBeenCalledTimes(2);
	});

	it('shows banner when adding a filter to existing search', async () => {
		await manageSaveSearchBanner({ search: 'web' }, 'tasks', vi.fn());
		expect(mockShowBanner).toHaveBeenCalledTimes(1);

		await manageSaveSearchBanner({ search: 'web', experienceLevel: 'expert' }, 'tasks', vi.fn());
		expect(mockShowBanner).toHaveBeenCalledTimes(2);
	});

	it('shows banner when changing budget values', async () => {
		await manageSaveSearchBanner({ minBudget: 100 }, 'tasks', vi.fn());
		expect(mockShowBanner).toHaveBeenCalledTimes(1);

		await manageSaveSearchBanner({ minBudget: 200 }, 'tasks', vi.fn());
		expect(mockShowBanner).toHaveBeenCalledTimes(2);
	});

	it('does not re-show for the same non-dismissed filters', async () => {
		await manageSaveSearchBanner({ search: 'web' }, 'tasks', vi.fn());
		await manageSaveSearchBanner({ search: 'web' }, 'tasks', vi.fn());
		expect(mockShowBanner).toHaveBeenCalled();
	});

	it('BUG: dismiss first filter then different filter shows banner again', async () => {
		// Step 1: Apply first filter → banner shown
		await manageSaveSearchBanner({ categories: ['tech'] }, 'tasks', vi.fn());
		const showCountAfterFirst = mockShowBanner.mock.calls.length;
		expect(showCountAfterFirst).toBeGreaterThanOrEqual(1);

		// Step 2: User clicks Dismiss → hash stored, banner removed
		const bannerCall1 = mockShowBanner.mock.calls[showCountAfterFirst - 1][0] as Record<
			string,
			unknown
		>;
		const dismissAction1 = (bannerCall1.actions as Array<Record<string, unknown>>)[0];
		await (dismissAction1.onClick as () => Promise<void>)();

		const dismissCountAfterFirst = mockDismissBanner.mock.calls.length;
		expect(dismissCountAfterFirst).toBeGreaterThanOrEqual(1);

		// Step 3: Apply DIFFERENT filter → banner should show again
		await manageSaveSearchBanner({ categories: ['design'] }, 'tasks', vi.fn());
		expect(mockShowBanner.mock.calls.length).toBe(showCountAfterFirst + 1);
	});

	it('BUG: dismiss then different filter within dedup window still shows', async () => {
		const showCountBefore = mockShowBanner.mock.calls.length;

		await manageSaveSearchBanner({ search: 'web dev' }, 'tasks', vi.fn());
		const dedup1 = (mockShowBanner.mock.calls[showCountBefore][0] as Record<string, string>)
			.dedupKey;

		// Dismiss
		const bannerCall = mockShowBanner.mock.calls[showCountBefore][0] as Record<string, unknown>;
		const dismissAction = (bannerCall.actions as Array<Record<string, unknown>>)[0];
		await (dismissAction.onClick as () => Promise<void>)();

		// Different filter immediately (within dedup window)
		await manageSaveSearchBanner({ search: 'logo design' }, 'tasks', vi.fn());
		const dedup2 = (mockShowBanner.mock.calls[showCountBefore + 1]?.[0] as Record<string, string>)
			?.dedupKey;

		// The dedup keys MUST be different so the second banner isn't blocked
		expect(dedup1).not.toBe(dedup2);
		expect(mockShowBanner.mock.calls.length).toBe(showCountBefore + 2);
	});
});

describe('save-search-banner — edge cases', () => {
	beforeEach(async () => {
		await Preferences.clear();
		vi.clearAllMocks();
	});

	it('handles combined filters (search + categories + budget)', async () => {
		await manageSaveSearchBanner(
			{ search: 'web', categories: ['tech'], budget: { tier: 'premium', currency: 'BTC' } },
			'tasks',
			vi.fn()
		);
		expect(mockShowBanner).toHaveBeenCalled();
	});

	it('handles all service filters combined', async () => {
		await manageSaveSearchBanner(
			{
				search: 'design',
				categories: ['creative'],
				skills: ['photoshop'],
				serviceLocationTypes: ['remote'],
				pricingType: 'hourly',
				minPrice: 50,
				maxPrice: 500,
				location: 'Berlin',
				deliveryTime: 48
			},
			'services',
			vi.fn()
		);
		expect(mockShowBanner).toHaveBeenCalled();
	});

	it('handles all task filters combined', async () => {
		await manageSaveSearchBanner(
			{
				search: 'developer',
				categories: ['tech'],
				skills: ['typescript'],
				taskType: 'remote',
				experienceLevel: 'senior',
				minBudget: 1000,
				maxBudget: 5000,
				deadline: '2026-12-31',
				budget: { tier: 'premium', currency: 'BTC', type: 'FIXED' }
			},
			'tasks',
			vi.fn()
		);
		expect(mockShowBanner).toHaveBeenCalled();
	});

	it('handles null/undefined values gracefully', async () => {
		await manageSaveSearchBanner(
			{ search: null, categories: undefined, minBudget: null, maxPrice: undefined },
			'tasks',
			vi.fn()
		);
		expect(mockShowBanner).not.toHaveBeenCalled();
	});

	it('dismiss then re-show with additional filter', async () => {
		await manageSaveSearchBanner({ search: 'web' }, 'tasks', vi.fn());
		const bannerCall = mockShowBanner.mock.calls[0][0] as Record<string, unknown>;
		const dismissAction = (bannerCall.actions as Array<Record<string, unknown>>)[0];
		await (dismissAction.onClick as () => Promise<void>)();

		// Same search + new filter = new hash
		await manageSaveSearchBanner({ search: 'web', location: 'NYC' }, 'tasks', vi.fn());
		expect(mockShowBanner).toHaveBeenCalledTimes(2);
	});

	it('banner uses duration 0 (persistent)', async () => {
		await manageSaveSearchBanner({ search: 'test' }, 'tasks', vi.fn());
		const bannerCall = mockShowBanner.mock.calls[0][0] as Record<string, unknown>;
		expect(bannerCall.duration).toBe(0);
	});

	it('banner is not dismissible via close button', async () => {
		await manageSaveSearchBanner({ search: 'test' }, 'tasks', vi.fn());
		const bannerCall = mockShowBanner.mock.calls[0][0] as Record<string, unknown>;
		expect(bannerCall.dismissible).toBe(false);
	});
});

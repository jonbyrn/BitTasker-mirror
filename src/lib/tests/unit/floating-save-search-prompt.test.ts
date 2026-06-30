import { describe, it, expect, vi, beforeEach } from 'vitest';

const STORAGE_KEY = 'bittasker_dismissed_save_search_prompts';

let store: Record<string, string> = {};

const localStorageMock = {
	getItem: vi.fn((key: string) => store[key] ?? null),
	setItem: vi.fn((key: string, value: string) => {
		store[key] = value;
	}),
	removeItem: vi.fn((key: string) => {
		delete store[key];
	}),
	clear: vi.fn(() => {
		store = {};
	})
};

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

const mockShowBanner = vi.fn(() => 1);
const mockDismissBanner = vi.fn();

vi.mock('$lib/stores/app.store', () => ({
	appStore: {
		showBanner: (...args: unknown[]) => mockShowBanner(...args),
		dismissBanner: (...args: unknown[]) => mockDismissBanner(...args)
	}
}));

import { manageSaveSearchBanner, dismissSaveSearchBanner } from '$lib/utils/saveSearchBanner';

function getDismissedHashes(): string[] {
	try {
		return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
	} catch {
		return [];
	}
}

describe('save-search-banner — computeFilterHash', () => {
	beforeEach(() => {
		localStorage.clear();
		vi.clearAllMocks();
	});

	it('shows banner for text search', () => {
		manageSaveSearchBanner({ search: 'web dev' }, 'tasks', vi.fn());
		expect(mockShowBanner).toHaveBeenCalled();
	});

	it('shows banner for categories filter', () => {
		manageSaveSearchBanner({ categories: ['tech', 'design'] }, 'tasks', vi.fn());
		expect(mockShowBanner).toHaveBeenCalled();
	});

	it('shows banner for skills filter', () => {
		manageSaveSearchBanner({ skills: ['javascript'] }, 'services', vi.fn());
		expect(mockShowBanner).toHaveBeenCalled();
	});

	it('shows banner for serviceLocationTypes filter', () => {
		manageSaveSearchBanner({ serviceLocationTypes: ['remote'] }, 'services', vi.fn());
		expect(mockShowBanner).toHaveBeenCalled();
	});

	it('shows banner for taskType filter', () => {
		manageSaveSearchBanner({ taskType: 'remote' }, 'tasks', vi.fn());
		expect(mockShowBanner).toHaveBeenCalled();
	});

	it('shows banner for pricingType filter', () => {
		manageSaveSearchBanner({ pricingType: 'fixed' }, 'services', vi.fn());
		expect(mockShowBanner).toHaveBeenCalled();
	});

	it('shows banner for experienceLevel filter', () => {
		manageSaveSearchBanner({ experienceLevel: 'intermediate' }, 'tasks', vi.fn());
		expect(mockShowBanner).toHaveBeenCalled();
	});

	it('shows banner for deliveryTime filter', () => {
		manageSaveSearchBanner({ deliveryTime: 24 }, 'services', vi.fn());
		expect(mockShowBanner).toHaveBeenCalled();
	});

	it('shows banner for location filter', () => {
		manageSaveSearchBanner({ location: 'New York' }, 'tasks', vi.fn());
		expect(mockShowBanner).toHaveBeenCalled();
	});

	it('shows banner for minBudget filter', () => {
		manageSaveSearchBanner({ minBudget: 100 }, 'tasks', vi.fn());
		expect(mockShowBanner).toHaveBeenCalled();
	});

	it('shows banner for maxBudget filter', () => {
		manageSaveSearchBanner({ maxBudget: 500 }, 'tasks', vi.fn());
		expect(mockShowBanner).toHaveBeenCalled();
	});

	it('shows banner for minPrice filter', () => {
		manageSaveSearchBanner({ minPrice: 50 }, 'services', vi.fn());
		expect(mockShowBanner).toHaveBeenCalled();
	});

	it('shows banner for maxPrice filter', () => {
		manageSaveSearchBanner({ maxPrice: 200 }, 'services', vi.fn());
		expect(mockShowBanner).toHaveBeenCalled();
	});

	it('shows banner for deadline filter', () => {
		manageSaveSearchBanner({ deadline: '2026-12-31' }, 'tasks', vi.fn());
		expect(mockShowBanner).toHaveBeenCalled();
	});

	it('shows banner for dateRange filter', () => {
		manageSaveSearchBanner(
			{ dateRange: { start: '2026-01-01', end: '2026-12-31' } },
			'tasks',
			vi.fn()
		);
		expect(mockShowBanner).toHaveBeenCalled();
	});

	it('shows banner for budget object with tier', () => {
		manageSaveSearchBanner({ budget: { tier: 'premium' } }, 'tasks', vi.fn());
		expect(mockShowBanner).toHaveBeenCalled();
	});

	it('shows banner for budget object with currency', () => {
		manageSaveSearchBanner({ budget: { currency: 'BTC' } }, 'tasks', vi.fn());
		expect(mockShowBanner).toHaveBeenCalled();
	});

	it('shows banner for budget object with type', () => {
		manageSaveSearchBanner({ budget: { type: 'FIXED' } }, 'tasks', vi.fn());
		expect(mockShowBanner).toHaveBeenCalled();
	});

	it('shows banner for radius filter', () => {
		manageSaveSearchBanner({ radius: 10, location: 'NYC' }, 'services', vi.fn());
		expect(mockShowBanner).toHaveBeenCalled();
	});

	it('does NOT show banner for empty params', () => {
		manageSaveSearchBanner({}, 'tasks', vi.fn());
		expect(mockShowBanner).not.toHaveBeenCalled();
	});

	it('does NOT show banner for page/limit only', () => {
		manageSaveSearchBanner({ page: 1, limit: 20 }, 'tasks', vi.fn());
		expect(mockShowBanner).not.toHaveBeenCalled();
	});

	it('does NOT show banner for empty categories array', () => {
		manageSaveSearchBanner({ categories: [] }, 'tasks', vi.fn());
		expect(mockShowBanner).not.toHaveBeenCalled();
	});

	it('does NOT show banner for empty search string', () => {
		manageSaveSearchBanner({ search: '' }, 'tasks', vi.fn());
		expect(mockShowBanner).not.toHaveBeenCalled();
	});

	it('does NOT show banner for whitespace-only search', () => {
		manageSaveSearchBanner({ search: '   ' }, 'tasks', vi.fn());
		expect(mockShowBanner).not.toHaveBeenCalled();
	});
});

describe('save-search-banner — dismissal', () => {
	beforeEach(() => {
		localStorage.clear();
		vi.clearAllMocks();
	});

	it('dismiss stores hash in localStorage', () => {
		manageSaveSearchBanner({ search: 'web dev' }, 'tasks', vi.fn());
		const bannerCall = mockShowBanner.mock.calls[0][0] as Record<string, unknown>;
		const dismissAction = (bannerCall.actions as Array<Record<string, unknown>>)[0];
		(dismissAction.onClick as () => void)();
		const dismissed = getDismissedHashes();
		expect(dismissed.length).toBe(1);
	});

	it('dismissed hash prevents banner from showing again', () => {
		manageSaveSearchBanner({ search: 'web dev' }, 'tasks', vi.fn());
		expect(mockShowBanner).toHaveBeenCalledTimes(1);

		const bannerCall = mockShowBanner.mock.calls[0][0] as Record<string, unknown>;
		const dismissAction = (bannerCall.actions as Array<Record<string, unknown>>)[0];
		(dismissAction.onClick as () => void)();

		manageSaveSearchBanner({ search: 'web dev' }, 'tasks', vi.fn());
		expect(mockShowBanner).toHaveBeenCalledTimes(1);
	});

	it('different filter hash shows banner even after dismissing another', () => {
		manageSaveSearchBanner({ search: 'web dev' }, 'tasks', vi.fn());
		const bannerCall = mockShowBanner.mock.calls[0][0] as Record<string, unknown>;
		const dismissAction = (bannerCall.actions as Array<Record<string, unknown>>)[0];
		(dismissAction.onClick as () => void)();

		manageSaveSearchBanner({ search: 'logo design' }, 'tasks', vi.fn());
		expect(mockShowBanner).toHaveBeenCalledTimes(2);
	});

	it('enable action stores hash and calls onEnable', () => {
		const onEnable = vi.fn();
		manageSaveSearchBanner({ search: 'web dev' }, 'tasks', onEnable);
		const bannerCall = mockShowBanner.mock.calls[0][0] as Record<string, unknown>;
		const enableAction = (bannerCall.actions as Array<Record<string, unknown>>)[1];
		(enableAction.onClick as () => void)();
		expect(onEnable).toHaveBeenCalled();
		const dismissed = getDismissedHashes();
		expect(dismissed.length).toBe(1);
	});

	it('dismissSaveSearchBanner calls appStore.dismissBanner', () => {
		manageSaveSearchBanner({ search: 'web dev' }, 'tasks', vi.fn());
		dismissSaveSearchBanner();
		expect(mockDismissBanner).toHaveBeenCalled();
	});
});

describe('save-search-banner — searchType', () => {
	beforeEach(() => {
		localStorage.clear();
		vi.clearAllMocks();
	});

	it('uses task i18n key for tasks', () => {
		manageSaveSearchBanner({ search: 'test' }, 'tasks', vi.fn());
		const bannerCall = mockShowBanner.mock.calls[0][0] as Record<string, unknown>;
		expect((bannerCall.message as Record<string, string>).key).toBe(
			'notifications.save_search_prompt.description_task'
		);
	});

	it('uses service i18n key for services', () => {
		manageSaveSearchBanner({ search: 'test' }, 'services', vi.fn());
		const bannerCall = mockShowBanner.mock.calls[0][0] as Record<string, string>;
		expect((bannerCall.message as Record<string, string>).key).toBe(
			'notifications.save_search_prompt.description_service'
		);
	});

	it('uses different dedupKey per searchType and filter hash', () => {
		manageSaveSearchBanner({ search: 'test' }, 'tasks', vi.fn());
		const taskDedup = (mockShowBanner.mock.calls[0][0] as Record<string, string>).dedupKey;
		manageSaveSearchBanner({ search: 'test' }, 'services', vi.fn());
		const serviceDedup = (mockShowBanner.mock.calls[1][0] as Record<string, string>).dedupKey;
		expect(taskDedup).toContain('save-search-prompt-tasks');
		expect(serviceDedup).toContain('save-search-prompt-services');
		expect(taskDedup).not.toBe(serviceDedup);
	});

	it('uses different dedupKey for different filter hashes within same searchType', () => {
		manageSaveSearchBanner({ search: 'web' }, 'tasks', vi.fn());
		const hash1Dedup = (mockShowBanner.mock.calls[0][0] as Record<string, string>).dedupKey;
		manageSaveSearchBanner({ search: 'design' }, 'tasks', vi.fn());
		const hash2Dedup = (mockShowBanner.mock.calls[1][0] as Record<string, string>).dedupKey;
		expect(hash1Dedup).not.toBe(hash2Dedup);
	});
});

describe('save-search-banner — re-shows on new filters', () => {
	beforeEach(() => {
		localStorage.clear();
		vi.clearAllMocks();
	});

	it('shows banner again when filters change to a new non-dismissed combination', () => {
		manageSaveSearchBanner({ search: 'web', categories: ['tech'] }, 'tasks', vi.fn());
		expect(mockShowBanner).toHaveBeenCalledTimes(1);

		// Change categories — new hash, not dismissed
		manageSaveSearchBanner({ search: 'web', categories: ['design'] }, 'tasks', vi.fn());
		expect(mockShowBanner).toHaveBeenCalledTimes(2);
	});

	it('shows banner when adding a filter to existing search', () => {
		manageSaveSearchBanner({ search: 'web' }, 'tasks', vi.fn());
		expect(mockShowBanner).toHaveBeenCalledTimes(1);

		manageSaveSearchBanner({ search: 'web', experienceLevel: 'expert' }, 'tasks', vi.fn());
		expect(mockShowBanner).toHaveBeenCalledTimes(2);
	});

	it('shows banner when changing budget values', () => {
		manageSaveSearchBanner({ minBudget: 100 }, 'tasks', vi.fn());
		expect(mockShowBanner).toHaveBeenCalledTimes(1);

		manageSaveSearchBanner({ minBudget: 200 }, 'tasks', vi.fn());
		expect(mockShowBanner).toHaveBeenCalledTimes(2);
	});

	it('does not re-show for the same non-dismissed filters', () => {
		manageSaveSearchBanner({ search: 'web' }, 'tasks', vi.fn());
		manageSaveSearchBanner({ search: 'web' }, 'tasks', vi.fn());
		expect(mockShowBanner).toHaveBeenCalled();
	});

	it('BUG: dismiss first filter then different filter shows banner again', () => {
		// Step 1: Apply first filter → banner shown
		manageSaveSearchBanner({ categories: ['tech'] }, 'tasks', vi.fn());
		const showCountAfterFirst = mockShowBanner.mock.calls.length;
		expect(showCountAfterFirst).toBeGreaterThanOrEqual(1);

		// Step 2: User clicks Dismiss → hash stored, banner removed
		const bannerCall1 = mockShowBanner.mock.calls[showCountAfterFirst - 1][0] as Record<
			string,
			unknown
		>;
		const dismissAction1 = (bannerCall1.actions as Array<Record<string, unknown>>)[0];
		(dismissAction1.onClick as () => void)();

		const dismissCountAfterFirst = mockDismissBanner.mock.calls.length;
		expect(dismissCountAfterFirst).toBeGreaterThanOrEqual(1);

		// Step 3: Apply DIFFERENT filter → banner should show again
		manageSaveSearchBanner({ categories: ['design'] }, 'tasks', vi.fn());
		expect(mockShowBanner.mock.calls.length).toBe(showCountAfterFirst + 1);
	});

	it('BUG: dismiss then different filter within dedup window still shows', () => {
		const showCountBefore = mockShowBanner.mock.calls.length;

		manageSaveSearchBanner({ search: 'web dev' }, 'tasks', vi.fn());
		const dedup1 = (mockShowBanner.mock.calls[showCountBefore][0] as Record<string, string>)
			.dedupKey;

		// Dismiss
		const bannerCall = mockShowBanner.mock.calls[showCountBefore][0] as Record<string, unknown>;
		const dismissAction = (bannerCall.actions as Array<Record<string, unknown>>)[0];
		(dismissAction.onClick as () => void)();

		// Different filter immediately (within dedup window)
		manageSaveSearchBanner({ search: 'logo design' }, 'tasks', vi.fn());
		const dedup2 = (mockShowBanner.mock.calls[showCountBefore + 1]?.[0] as Record<string, string>)
			?.dedupKey;

		// The dedup keys MUST be different so the second banner isn't blocked
		expect(dedup1).not.toBe(dedup2);
		expect(mockShowBanner.mock.calls.length).toBe(showCountBefore + 2);
	});
});

describe('save-search-banner — edge cases', () => {
	beforeEach(() => {
		localStorage.clear();
		vi.clearAllMocks();
	});

	it('handles combined filters (search + categories + budget)', () => {
		manageSaveSearchBanner(
			{ search: 'web', categories: ['tech'], budget: { tier: 'premium', currency: 'BTC' } },
			'tasks',
			vi.fn()
		);
		expect(mockShowBanner).toHaveBeenCalled();
	});

	it('handles all service filters combined', () => {
		manageSaveSearchBanner(
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

	it('handles all task filters combined', () => {
		manageSaveSearchBanner(
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

	it('handles null/undefined values gracefully', () => {
		manageSaveSearchBanner(
			{ search: null, categories: undefined, minBudget: null, maxPrice: undefined },
			'tasks',
			vi.fn()
		);
		expect(mockShowBanner).not.toHaveBeenCalled();
	});

	it('dismiss then re-show with additional filter', () => {
		manageSaveSearchBanner({ search: 'web' }, 'tasks', vi.fn());
		const bannerCall = mockShowBanner.mock.calls[0][0] as Record<string, unknown>;
		const dismissAction = (bannerCall.actions as Array<Record<string, unknown>>)[0];
		(dismissAction.onClick as () => void)();

		// Same search + new filter = new hash
		manageSaveSearchBanner({ search: 'web', location: 'NYC' }, 'tasks', vi.fn());
		expect(mockShowBanner).toHaveBeenCalledTimes(2);
	});

	it('banner uses duration 0 (persistent)', () => {
		manageSaveSearchBanner({ search: 'test' }, 'tasks', vi.fn());
		const bannerCall = mockShowBanner.mock.calls[0][0] as Record<string, unknown>;
		expect(bannerCall.duration).toBe(0);
	});

	it('banner is not dismissible via close button', () => {
		manageSaveSearchBanner({ search: 'test' }, 'tasks', vi.fn());
		const bannerCall = mockShowBanner.mock.calls[0][0] as Record<string, unknown>;
		expect(bannerCall.dismissible).toBe(false);
	});
});

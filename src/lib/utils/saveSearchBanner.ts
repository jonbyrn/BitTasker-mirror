import { appStore } from '$lib/stores/app.store';
import { StorageKeys } from '$lib/utils/constants/storage';

let activeBannerId: number | null = null;

function getDismissedHashes(): string[] {
	try {
		const raw = localStorage.getItem(StorageKeys.DISMISSED_SAVE_SEARCH_PROMPTS);
		return raw ? JSON.parse(raw) : [];
	} catch {
		return [];
	}
}

function storeDismissedHash(hash: string): void {
	const hashes = getDismissedHashes();
	if (!hashes.includes(hash)) {
		hashes.push(hash);
		localStorage.setItem(StorageKeys.DISMISSED_SAVE_SEARCH_PROMPTS, JSON.stringify(hashes));
	}
}

function computeFilterHash(params: Record<string, unknown>): string {
	const parts: string[] = [];

	if (params.search && typeof params.search === 'string' && params.search.trim()) {
		parts.push(`s:${params.search.trim()}`);
	}

	if (Array.isArray(params.categories) && params.categories.length > 0) {
		parts.push(`c:${[...params.categories].sort().join(',')}`);
	}
	if (Array.isArray(params.skills) && params.skills.length > 0) {
		parts.push(`sk:${[...params.skills].sort().join(',')}`);
	}
	if (Array.isArray(params.serviceLocationTypes) && params.serviceLocationTypes.length > 0) {
		parts.push(`slt:${[...params.serviceLocationTypes].sort().join(',')}`);
	}

	if (params.taskType) parts.push(`tt:${params.taskType}`);
	if (params.pricingType) parts.push(`pt:${params.pricingType}`);
	if (params.experienceLevel) parts.push(`el:${params.experienceLevel}`);
	if (params.deliveryTime !== undefined && params.deliveryTime !== null) {
		parts.push(`dt:${params.deliveryTime}`);
	}

	if (params.location && typeof params.location === 'string' && params.location.trim()) {
		parts.push(`loc:${params.location.trim()}`);
	}
	if (params.radius !== undefined && params.radius !== null) parts.push(`r:${params.radius}`);

	const budget = params.budget as Record<string, unknown> | undefined;
	if (budget) {
		if (budget.tier) parts.push(`bt:${budget.tier}`);
		if (budget.currency) parts.push(`bc:${budget.currency}`);
		if (budget.type) parts.push(`bty:${budget.type}`);
	}
	if (params.minBudget !== undefined && params.minBudget !== null) {
		parts.push(`minb:${params.minBudget}`);
	}
	if (params.maxBudget !== undefined && params.maxBudget !== null) {
		parts.push(`maxb:${params.maxBudget}`);
	}
	if (params.minPrice !== undefined && params.minPrice !== null) {
		parts.push(`minp:${params.minPrice}`);
	}
	if (params.maxPrice !== undefined && params.maxPrice !== null) {
		parts.push(`maxp:${params.maxPrice}`);
	}

	if (params.deadline) parts.push(`dl:${params.deadline}`);
	if (params.dateRange) parts.push(`dr:${JSON.stringify(params.dateRange)}`);

	return parts.join('|');
}

function hasActiveFilters(params: Record<string, unknown>): boolean {
	if (params.search && typeof params.search === 'string' && params.search.trim()) return true;
	if (Array.isArray(params.categories) && params.categories.length > 0) return true;
	if (Array.isArray(params.skills) && params.skills.length > 0) return true;
	if (Array.isArray(params.serviceLocationTypes) && params.serviceLocationTypes.length > 0)
		return true;
	if (params.taskType) return true;
	if (params.pricingType) return true;
	if (params.experienceLevel) return true;
	if (params.deliveryTime !== undefined && params.deliveryTime !== null) return true;
	if (params.location && typeof params.location === 'string' && params.location.trim()) return true;
	if (params.minBudget !== undefined && params.minBudget !== null) return true;
	if (params.maxBudget !== undefined && params.maxBudget !== null) return true;
	if (params.minPrice !== undefined && params.minPrice !== null) return true;
	if (params.maxPrice !== undefined && params.maxPrice !== null) return true;
	if (params.deadline) return true;
	if (params.dateRange) return true;

	const budget = params.budget as Record<string, unknown> | undefined;
	if (budget && (budget.tier || budget.currency || budget.type)) return true;

	return false;
}

export function dismissSaveSearchBanner(): void {
	if (activeBannerId !== null) {
		appStore.dismissBanner(activeBannerId);
		activeBannerId = null;
	}
}

export function manageSaveSearchBanner(
	searchParams: Record<string, unknown>,
	searchType: 'tasks' | 'services',
	onEnable: () => void
): void {
	const hash = computeFilterHash(searchParams);
	const active = hasActiveFilters(searchParams);
	const dismissed = getDismissedHashes().includes(hash);
	const shouldShow = active && !dismissed && hash !== '';

	if (!shouldShow) {
		dismissSaveSearchBanner();
		return;
	}

	dismissSaveSearchBanner();

	const messageKey =
		searchType === 'tasks'
			? 'notifications.save_search_prompt.description_task'
			: 'notifications.save_search_prompt.description_service';

	activeBannerId = appStore.showBanner({
		message: { key: messageKey },
		dedupKey: `save-search-prompt-${searchType}-${hash}`,
		actions: [
			{
				label: 'notifications.save_search_prompt.dismiss_button',
				onClick: () => {
					storeDismissedHash(hash);
					dismissSaveSearchBanner();
				},
				variant: 'ghost'
			},
			{
				label: 'notifications.save_search_prompt.enable_button',
				onClick: () => {
					storeDismissedHash(hash);
					dismissSaveSearchBanner();
					onEnable();
				},
				variant: 'primary'
			}
		],
		dismissible: false,
		duration: 0
	});
}

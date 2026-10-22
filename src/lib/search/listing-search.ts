import type { Service } from '$lib/types/service.d';
import type { Task } from '$lib/types/task.d';
import { ServiceLocationTypeEnum, ServicePricingTypeEnum } from '$lib/utils/enums/service.enum';
import { BudgetTypeEnum, TaskStatusEnum, TaskTypeEnum } from '$lib/utils/enums/task.enum';
import { SEARCH_CATEGORIES, categoryById } from '$lib/search/taxonomy.js';

/** Pause after a keystroke before calling /api/search. */
export const LISTING_SEARCH_DEBOUNCE_MS = 250;

const PAGE_SIZE = '60';

type SearchType = 'task' | 'service';

function asRecord(value: unknown): Record<string, unknown> | null {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function text(value: unknown): string {
	return typeof value === 'string' ? value : '';
}

/**
 * Legacy filter-drawer ids (`1`) and taxonomy ids (`cleaning`) both become
 * the category values stored on Typesense documents.
 */
export function searchCategoryIdsForFilters(ids: readonly string[] | undefined): string[] {
	const found = new Set<string>();
	for (const raw of ids ?? []) {
		const id = String(raw || '').trim();
		if (!id) continue;
		if (categoryById(id)) {
			found.add(id);
			continue;
		}
		for (const category of SEARCH_CATEGORIES) {
			if (category.legacyCategoryIds.includes(id)) found.add(category.id);
		}
	}
	return [...found];
}

/**
 * `/api/search` query. `URLSearchParams` percent-encodes ñ and accents.
 * A raw ñ in the request line is rejected with 400 before the Worker runs.
 */
export function listingSearchPath(options: {
	q: string;
	type: SearchType;
	categoryIds?: readonly string[];
}): string {
	const params = new URLSearchParams();
	params.set('type', options.type);
	params.set('perPage', PAGE_SIZE);
	const q = options.q.trim();
	if (q) params.set('q', q);
	const categories = searchCategoryIdsForFilters(options.categoryIds);
	if (categories.length) params.set('category', categories.join(','));
	return `/api/search?${params.toString()}`;
}

export function readSearchQueryParam(href: string): string {
	try {
		return new URL(href).searchParams.get('q')?.trim() || '';
	} catch {
		return '';
	}
}

export function replaceSearchQueryParam(href: string, q: string): string {
	const url = new URL(href);
	const next = q.trim();
	if (next) url.searchParams.set('q', next);
	else url.searchParams.delete('q');
	return url.toString();
}

export async function fetchListingSearch(
	path: string,
	signal: AbortSignal
): Promise<Record<string, unknown>> {
	const response = await fetch(path, {
		signal,
		headers: { Accept: 'application/json' }
	});
	if (!response.ok) throw new Error(`Search failed (${response.status})`);
	const body = (await response.json()) as unknown;
	return asRecord(body) ?? {};
}

function hits(body: Record<string, unknown>, key: 'tasks' | 'services'): Record<string, unknown>[] {
	const list = body[key];
	if (!Array.isArray(list)) return [];
	return list.flatMap((hit) => {
		const record = asRecord(hit);
		return record ? [record] : [];
	});
}

export function filterHitsByCategories(
	list: Record<string, unknown>[],
	categoryIds: readonly string[] | undefined
): Record<string, unknown>[] {
	const allowed = searchCategoryIdsForFilters(categoryIds);
	if (!allowed.length) return list;
	const set = new Set(allowed);
	return list.filter((hit) => set.has(text(hit.category)));
}

function budgetType(value: unknown): BudgetTypeEnum {
	return value === BudgetTypeEnum.HOURLY ? BudgetTypeEnum.HOURLY : BudgetTypeEnum.FIXED;
}

function taskStatus(value: unknown): TaskStatusEnum {
	const status = text(value);
	return (Object.values(TaskStatusEnum) as string[]).includes(status)
		? (status as TaskStatusEnum)
		: TaskStatusEnum.OPEN;
}

export function taskFromSearchHit(hit: Record<string, unknown>): Task {
	const budget = asRecord(hit.budget);
	const amount = Number(budget?.amount ?? hit.price_usd);
	const location = text(hit.location);
	const remote = hit.remote === true;
	return {
		id: text(hit.public_id) || text(hit.id),
		eventId: text(hit.event_id) || undefined,
		npub: text(hit.pubkey),
		title: text(hit.title),
		description: text(hit.description),
		status: taskStatus(hit.status),
		taskType: remote ? TaskTypeEnum.REMOTE : TaskTypeEnum.IN_PERSON,
		budget: {
			amount: Number.isFinite(amount) && amount >= 0 ? amount : 0,
			currency: text(budget?.currency) || 'USD',
			type: budgetType(budget?.type),
			estimatedHours: 1
		},
		deadline: null,
		dateRange: null,
		pickupLocation: location
			? {
					displayName: location,
					longitude: null,
					latitude: null,
					zipCode: '',
					locationLoaded: false
				}
			: null,
		dropOffLocation: null,
		skills: Array.isArray(hit.skills) ? hit.skills.map((skill) => String(skill)) : [],
		categories: [],
		searchCategory: text(hit.category),
		searchSubcategory: text(hit.subcategory),
		estimatedHours: 1,
		isRemovals: false,
		isBoosted: false,
		boostPercentage: null,
		createdAt: Number(hit.created_at) || 0,
		updatedAt: '',
		completedAt: null,
		cancelledAt: null,
		deletedAt: null,
		isDeleted: false,
		requiredSkills: []
	};
}

export function tasksFromSearchBody(
	body: Record<string, unknown>,
	categoryIds?: readonly string[]
): Task[] {
	return filterHitsByCategories(hits(body, 'tasks'), categoryIds).map(taskFromSearchHit);
}

export function serviceFromSearchHit(hit: Record<string, unknown>): Service {
	const amount = Number(hit.price_usd);
	const remote = hit.remote === true;
	const publicId = text(hit.public_id) || text(hit.id);
	const priced = Number.isFinite(amount) && amount > 0;
	return {
		id: text(hit.event_id) || publicId,
		uniqueId: publicId,
		npub: text(hit.pubkey),
		status: 'active',
		title: text(hit.title),
		description: text(hit.description),
		serviceLocationTypes: remote
			? [ServiceLocationTypeEnum.REMOTE]
			: [ServiceLocationTypeEnum.TASKEE_LOCATION],
		pricing: priced
			? {
					type: ServicePricingTypeEnum.FIXED,
					amount,
					currency: 'USD'
				}
			: { type: ServicePricingTypeEnum.INQUIRY_REQUIRED, currency: 'USD' },
		skills: Array.isArray(hit.skills) ? hit.skills.map((skill) => String(skill)) : [],
		categories: [],
		searchCategory: text(hit.category),
		searchSubcategory: text(hit.subcategory),
		createdAt: Number(hit.created_at) || 0
	};
}

export function servicesFromSearchBody(
	body: Record<string, unknown>,
	categoryIds?: readonly string[]
): Service[] {
	return filterHitsByCategories(hits(body, 'services'), categoryIds).map(serviceFromSearchHit);
}

import type { Service } from '$lib/types/service.d';
import type { Task } from '$lib/types/task.d';
import { TaskStatusEnum, TaskTypeEnum } from '$lib/utils/enums/task.enum';
import { withServicePricing, withTaskBudget } from './card-shape.js';

export type CatalogKind = 'task' | 'service' | 'shift';

export interface CatalogHit {
	id?: string;
	public_id?: string;
	event_id?: string;
	pubkey?: string;
	title?: string;
	description?: string;
	status?: string;
	budget?: { amount?: number; currency?: string; type?: string };
	pricing?: { amount?: number; currency?: string; type?: string };
	price_usd?: number;
	skills?: string[];
	created_at?: number;
	remote?: boolean;
	category?: string;
	serviceLocationTypes?: string[];
	url?: string;
}

export interface CatalogList {
	ready: true;
	hits: CatalogHit[];
}

const CATALOG_PAGE = 60;

function groupKey(kind: CatalogKind): 'tasks' | 'services' | 'shifts' {
	if (kind === 'task') return 'tasks';
	if (kind === 'service') return 'services';
	return 'shifts';
}

/**
 * Public lists read `/api/search` when the worker catalog is Typesense.
 * A ready catalog with zero hits stays empty so the page does not fall
 * through to relay probes. Null means the catalog is not the source.
 */
export async function fetchCatalog(
	kind: CatalogKind,
	query = '',
	fetchImpl: typeof fetch = globalThis.fetch
): Promise<CatalogList | null> {
	let ready = false;
	try {
		const health = await fetchImpl('/api/search/health', { signal: AbortSignal.timeout(800) });
		if (!health.ok) return null;
		const body = (await health.json()) as { provider?: string; ready?: boolean };
		ready = body.provider === 'typesense' && body.ready === true;
		if (!ready) return null;
	} catch {
		return null;
	}

	try {
		const params = new URLSearchParams({ type: kind, perPage: String(CATALOG_PAGE) });
		const q = query.trim();
		if (q) params.set('q', q);
		const response = await fetchImpl(`/api/search?${params}`, { signal: AbortSignal.timeout(800) });
		if (!response.ok) return { ready: true, hits: [] };
		const body = (await response.json()) as Record<string, unknown>;
		const hits = body[groupKey(kind)];
		return { ready: true, hits: Array.isArray(hits) ? (hits as CatalogHit[]) : [] };
	} catch {
		return { ready: true, hits: [] };
	}
}

export function mapCatalogTask(hit: CatalogHit): Task {
	return withTaskBudget({
		id: String(hit.public_id || hit.id || ''),
		npub: String(hit.pubkey || ''),
		title: String(hit.title || ''),
		description: String(hit.description || ''),
		status: (hit.status || TaskStatusEnum.OPEN) as TaskStatusEnum,
		taskType: hit.remote ? TaskTypeEnum.REMOTE : TaskTypeEnum.IN_PERSON,
		estimatedHours: 0,
		budget: hit.budget,
		deadline: null,
		dateRange: null,
		pickupLocation: null,
		dropOffLocation: null,
		skills: Array.isArray(hit.skills) ? hit.skills.map(String) : [],
		categories: [],
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
	}) as Task;
}

export function mapCatalogService(hit: CatalogHit): Service {
	const priced = withServicePricing(hit) as { pricing?: Service['pricing'] };
	return {
		id: String(hit.event_id || hit.id || ''),
		uniqueId: String(hit.public_id || hit.id || ''),
		npub: String(hit.pubkey || ''),
		status: (hit.status || 'active') as Service['status'],
		title: String(hit.title || ''),
		description: String(hit.description || ''),
		serviceLocationTypes: (Array.isArray(hit.serviceLocationTypes)
			? hit.serviceLocationTypes
			: []) as Service['serviceLocationTypes'],
		pricing: (priced.pricing ?? {
			type: 'FIXED',
			currency: 'USD',
			amount: 0
		}) as Service['pricing'],
		skills: Array.isArray(hit.skills) ? hit.skills.map(String) : [],
		categories: [],
		createdAt: Number(hit.created_at) || 0
	};
}

export function mapCatalogShift(hit: CatalogHit): {
	id: string;
	title: string;
	description: string;
	status: string;
	npub: string;
	createdAt: number;
} {
	return {
		id: String(hit.public_id || hit.id || ''),
		title: String(hit.title || ''),
		description: String(hit.description || ''),
		status: String(hit.status || ''),
		npub: String(hit.pubkey || ''),
		createdAt: Number(hit.created_at) || 0
	};
}

import type { Service } from '$lib/types/service.d';
import type { Task } from '$lib/types/task.d';

export type SearchIndexName = 'tasks' | 'services';

export interface SearchDocument {
	id: string;
	title: string;
	description: string;
	category: string[];
	skills: string[];
	tags: string[];
	location: string;
	price: number;
	status: string;
	type: string;
	createdAt: number;
	npub: string;
	payload: Record<string, unknown>;
}

interface QueryResponse {
	hits?: SearchDocument[];
	estimatedTotalHits?: number;
	configured?: boolean;
}

const indexedIds = new Set<string>();

function categoryNames(categories: unknown): string[] {
	if (!Array.isArray(categories)) return [];
	return categories
		.map((category) => {
			if (typeof category === 'string') return category;
			if (category && typeof category === 'object' && 'name' in category) {
				const name = (category as { name?: unknown }).name;
				return typeof name === 'string' ? name : '';
			}
			return '';
		})
		.filter((name) => name.length > 0);
}

function stringList(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

export function taskToSearchDocument(task: Partial<Task> & { id: string }): SearchDocument {
	const tags = stringList((task as { tags?: unknown }).tags);
	return {
		id: task.id,
		title: task.title ?? '',
		description: task.description ?? '',
		category: categoryNames(task.categories),
		skills: stringList(task.skills),
		tags,
		location: task.pickupLocation?.displayName || task.dropOffLocation?.displayName || '',
		price: Number(task.budget?.amount ?? 0),
		status: String(task.status ?? ''),
		type: String(task.taskType ?? 'task'),
		createdAt: Number(task.createdAt ?? 0),
		npub: task.npub ?? '',
		payload: { ...task, tags }
	};
}

export function serviceToSearchDocument(
	service: Partial<Service> & { id: string }
): SearchDocument {
	const tags = stringList((service as { tags?: unknown }).tags);
	const location =
		service.locationDetails?.taskeeLocation?.locationDisplayName ||
		service.locationDetails?.taskerLocation?.serviceLocation?.displayName ||
		service.locationDetails?.taskeeLocation?.serviceLocation?.displayName ||
		'';
	const price = Number(
		service.pricing && 'amount' in service.pricing ? (service.pricing.amount ?? 0) : 0
	);
	return {
		id: service.id,
		title: service.title ?? '',
		description: service.description ?? '',
		category: categoryNames(service.categories),
		skills: stringList(service.skills),
		tags,
		location,
		price,
		status: String(service.status ?? ''),
		type: 'service',
		createdAt: Number(service.createdAt ?? 0),
		npub: service.npub ?? '',
		payload: { ...service, tags }
	};
}

export function recordsFromHits<T extends { id?: string }>(hits: SearchDocument[]): T[] {
	return hits
		.map((hit) => hit.payload as T)
		.filter((record) => Boolean(record) && typeof record.id === 'string' && record.id.length > 0);
}

export async function querySearchIndex(
	index: SearchIndexName,
	query: string,
	signal?: AbortSignal
): Promise<{ available: boolean; hits: SearchDocument[]; total: number }> {
	const q = query.trim();
	if (!q) return { available: false, hits: [], total: 0 };

	try {
		const url = `/api/search/query?index=${encodeURIComponent(index)}&q=${encodeURIComponent(q)}`;
		const response = await fetch(url, { signal, headers: { Accept: 'application/json' } });
		if (response.status === 404 || response.status === 503) {
			return { available: false, hits: [], total: 0 };
		}
		if (!response.ok) return { available: false, hits: [], total: 0 };
		const body = (await response.json()) as QueryResponse;
		if (body.configured !== true) return { available: false, hits: [], total: 0 };
		const hits = Array.isArray(body.hits) ? body.hits : [];
		return { available: true, hits, total: body.estimatedTotalHits ?? hits.length };
	} catch (error) {
		if (error instanceof DOMException && error.name === 'AbortError') throw error;
		return { available: false, hits: [], total: 0 };
	}
}

export function queueSearchUpsert(
	index: SearchIndexName,
	documents: SearchDocument[],
	force = false
): void {
	const fresh = documents.filter(
		(document) => document.id && (force || !indexedIds.has(`${index}:${document.id}`))
	);
	if (fresh.length === 0) return;
	for (const document of fresh) indexedIds.add(`${index}:${document.id}`);

	void fetch('/api/search/documents', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ index, documents: fresh })
	}).catch(() => {
		for (const document of fresh) indexedIds.delete(`${index}:${document.id}`);
	});
}

export function queueSearchDelete(index: SearchIndexName, ids: string[]): void {
	const clean = ids.filter((id) => id.trim().length > 0);
	if (clean.length === 0) return;
	for (const id of clean) indexedIds.delete(`${index}:${id}`);
	void fetch('/api/search/documents', {
		method: 'DELETE',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ index, ids: clean })
	}).catch(() => undefined);
}

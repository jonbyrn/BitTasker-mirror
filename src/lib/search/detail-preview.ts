import type { Service } from '$lib/types/service.d';
import type { Task } from '$lib/types/task';
import { BudgetTypeEnum, TaskTypeEnum } from '$lib/utils/enums/task.enum';
import { ServiceLocationTypeEnum, ServicePricingTypeEnum } from '$lib/utils/enums/service.enum';
import { fetchTypesenseJson, readCachedHit } from '$lib/search/browse-index';

function text(value: unknown): string {
	return typeof value === 'string' ? value : '';
}

/** Index rows sometimes store a placeholder instead of a nostr pubkey. */
export function listingPubkey(value: unknown): string {
	const key = text(value).trim();
	if (/^[0-9a-fA-F]{64}$/.test(key) || key.startsWith('npub1')) return key;
	return '';
}

export function taskFromIndexHit(hit: Record<string, unknown>, taskId: string): Task {
	const remote = hit.remote === true;
	const location = text(hit.location);
	return {
		id: text(hit.public_id) || taskId,
		title: text(hit.title),
		description: text(hit.description),
		status: text(hit.status) || 'OPEN',
		taskType: remote ? TaskTypeEnum.REMOTE : TaskTypeEnum.IN_PERSON,
		budget: {
			amount: Number(hit.price_usd) || 0,
			currency: 'USD',
			type: BudgetTypeEnum.FIXED
		},
		skills: Array.isArray(hit.skills) ? hit.skills.map(String) : [],
		categories: [],
		searchCategory: text(hit.category),
		deadline: text(hit.deadline) || undefined,
		npub: listingPubkey(hit.pubkey),
		pickupLocation: location
			? {
					displayName: location,
					longitude: null,
					latitude: null,
					zipCode: '',
					locationLoaded: false
				}
			: undefined
	} as Task;
}

/** The fields the detail page can show from a task already on screen. */
export function hitFromTask(task: {
	id?: string;
	title?: string;
	description?: string;
	status?: string;
	deadline?: string | null;
	taskType?: string;
	skills?: string[];
	searchCategory?: string;
	npub?: string;
	budget?: { amount?: number } | null;
	pickupLocation?: { displayName?: string | null } | null;
}): Record<string, unknown> {
	return {
		public_id: task.id || '',
		title: task.title || '',
		description: task.description || '',
		status: task.status || 'OPEN',
		price_usd: typeof task.budget?.amount === 'number' ? task.budget.amount : 0,
		location: task.pickupLocation?.displayName || '',
		remote: task.taskType === TaskTypeEnum.REMOTE,
		pubkey: task.npub || '',
		deadline: task.deadline || '',
		category: task.searchCategory || '',
		skills: task.skills || []
	};
}

export function serviceFromIndexHit(hit: Record<string, unknown>, serviceId: string): Service {
	const id = text(hit.public_id) || serviceId;
	const amount = Number(hit.price_usd) || 0;
	return {
		id,
		uniqueId: id,
		title: text(hit.title),
		description: text(hit.description),
		status: 'active',
		skills: Array.isArray(hit.skills) ? hit.skills.map(String) : [],
		categories: [],
		searchCategory: text(hit.category),
		serviceLocationTypes: hit.remote
			? [ServiceLocationTypeEnum.REMOTE]
			: [ServiceLocationTypeEnum.TASKEE_LOCATION],
		pricing: {
			type: ServicePricingTypeEnum.FIXED,
			amount,
			currency: 'USD'
		}
	} as Service;
}

export async function loadIndexPreview(
	type: 'task' | 'service',
	id: string
): Promise<Record<string, unknown> | null> {
	const cached = readCachedHit(type, id);
	if (cached) return cached;
	const body = await fetchTypesenseJson(
		`/api/search/preview?type=${encodeURIComponent(type)}&id=${encodeURIComponent(id)}`
	);
	const hit = body?.hit;
	return hit && typeof hit === 'object' ? (hit as Record<string, unknown>) : null;
}

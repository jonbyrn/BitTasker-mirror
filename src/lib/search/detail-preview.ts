import type { Service } from '$lib/types/service.d';
import type { Task } from '$lib/types/task';
import { BudgetTypeEnum, TaskTypeEnum } from '$lib/utils/enums/task.enum';
import { ServiceLocationTypeEnum, ServicePricingTypeEnum } from '$lib/utils/enums/service.enum';
import { fetchTypesenseJson, readCachedHit } from '$lib/search/browse-index';

function text(value: unknown): string {
	return typeof value === 'string' ? value : '';
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
		npub: text(hit.pubkey),
		pickupLocation: location
			? {
					displayName: location,
					longitude: null,
					latitude: null,
					zipCode: '',
					locationLoaded: false
				}
			: undefined,
		attachments: text(hit.image)
			? [{ url: text(hit.image), key: 'index-image', type: 'image/jpeg', alt: '', size: 0 }]
			: []
	} as Task;
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
		},
		portfolio: text(hit.image)
			? [{ url: text(hit.image), key: 'index-image', type: 'image/jpeg', alt: '', size: 0 }]
			: []
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

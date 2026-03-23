import type { Service } from '$lib/types/service.d';
import type { Filter } from 'nostr-tools';
import { nip19 } from 'nostr-tools';
import nostrEventsService from '$lib/api/services/nostr/events';
import KINDS from '$lib/utils/constants/kinds';

const DELETION_CACHE_TTL = 5 * 60 * 1000;

const deletionCache = new Map<string, { deletedIds: Set<string>; timestamp: number }>();

function normalizeAuthorPubkey(authorPubkey: string): string {
	const trimmedValue = authorPubkey.trim();
	if (!trimmedValue) {
		throw new Error('Author pubkey is required.');
	}

	if (trimmedValue.startsWith('npub1')) {
		const decoded = nip19.decode(trimmedValue);
		if (decoded.type !== 'npub') {
			throw new Error('Invalid npub identifier.');
		}
		return decoded.data;
	}

	return trimmedValue;
}

function parseProfileServiceEvent(event: {
	id: string;
	pubkey: string;
	created_at: number;
	kind: number;
	content: string;
}): Service {
	const contentData = JSON.parse(event.content);
	return {
		...contentData,
		id: event.id,
		npub: event.pubkey,
		eventKind: event.kind,
		createdAt: contentData.createdAt ?? event.created_at
	} as Service;
}

async function getDeletedServiceIds(): Promise<Set<string>> {
	const cacheKey = 'deleted_profile_services';
	const cached = deletionCache.get(cacheKey);
	if (cached && Date.now() - cached.timestamp < DELETION_CACHE_TTL) {
		return cached.deletedIds;
	}

	const filter: Filter = {
		kinds: [5],
		'#k': [KINDS.SERVICE_ACTIVE.toString(), KINDS.SERVICE_DRAFT.toString()],
		limit: 1000
	};

	const response = await nostrEventsService.requestEvents({
		filters: [filter]
	});

	const deletedIds = new Set<string>();
	for (const event of response.data ?? []) {
		for (const tag of event.tags) {
			if (tag[0] === 'e' && tag[1]) {
				deletedIds.add(tag[1]);
			}
		}
	}

	deletionCache.set(cacheKey, {
		deletedIds,
		timestamp: Date.now()
	});

	return deletedIds;
}

function dedupeServicesByUniqueId(services: Service[]): Service[] {
	const dedupedServices = new Map<string, Service>();

	for (const service of services) {
		const dedupeKey = service.uniqueId?.trim() || service.id;
		const existingService = dedupedServices.get(dedupeKey);
		if (!existingService) {
			dedupedServices.set(dedupeKey, service);
			continue;
		}

		const existingTimestamp = existingService.updatedAt ?? existingService.createdAt ?? 0;
		const candidateTimestamp = service.updatedAt ?? service.createdAt ?? 0;
		if (candidateTimestamp > existingTimestamp) {
			dedupedServices.set(dedupeKey, service);
		}
	}

	return Array.from(dedupedServices.values()).sort((left, right) => {
		const leftTimestamp = left.updatedAt ?? left.createdAt ?? 0;
		const rightTimestamp = right.updatedAt ?? right.createdAt ?? 0;
		return rightTimestamp - leftTimestamp;
	});
}

export async function findProfileServicesByAuthor(
	authorPubkey: string,
	options: {
		limit?: number;
	} = {}
): Promise<Service[]> {
	const normalizedPubkey = normalizeAuthorPubkey(authorPubkey);
	const response = await nostrEventsService.requestEvents({
		filters: [
			{
				kinds: [KINDS.SERVICE_ACTIVE],
				authors: [normalizedPubkey],
				limit: options.limit ?? 8
			}
		]
	});

	const deletedIds = await getDeletedServiceIds();
	const services = dedupeServicesByUniqueId(
		(response.data ?? []).map((event) => parseProfileServiceEvent(event))
	)
		.filter((service) => !deletedIds.has(service.id))
		.filter((service) => service.status === 'active');

	return services;
}

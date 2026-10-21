/*
 * Nostr events on the sandbox relays.
 *
 * rgb.bittasker.com and api-staging.bittasker.com do not serve /api/v1/events.
 * This module must not call that route. Task and service kinds are read from
 * the catalog relay when one is configured. Messages stay on the general relay.
 */
import type { Event, Filter, NostrEvent } from 'nostr-tools';
import { publishToGeneralRelays, queryGeneralRelays } from '$lib/nostr/general-relay';
import { listingRelayUrls, mergeRelayEvents, queryListingRelays } from '$lib/nostr/listing-relays';
import type { RelayQueryOptions } from '$lib/nostr/relayQuery';

/** Kinds stored on the BitTasker catalog relay, not the public general relay. */
const LISTING_KINDS = new Set([31000, 30402, 30403, 30404]);

function isListingFilter(filter: Filter): boolean {
	const kinds = filter.kinds;
	return Array.isArray(kinds) && kinds.length > 0 && kinds.every((kind) => LISTING_KINDS.has(kind));
}

interface EventEntity {
	id: string;
	pubkey: string;
	created_at: number;
	kind: number;
	tags: string[][];
	content: string;
	sig: string;
}

interface FindEventByIdVo {
	data: EventEntity;
}

interface FindEventsVo {
	data: EventEntity[];
}

interface RequestEventsDto {
	filters: unknown[];
}

interface RequestEventsVo {
	data: EventEntity[];
}

class NostrEventsService {
	async publishEvent(event: NostrEvent): Promise<EventEntity> {
		await publishToGeneralRelays(event as Event);
		return event as EventEntity;
	}

	async findEvents(params?: Record<string, unknown>): Promise<FindEventsVo> {
		if (!params) return { data: [] };
		const { relayTimeoutMs, onRelayEvents, ...filterFields } = params;
		const filter = filterFields as Filter;
		const options: RelayQueryOptions = {};
		if (typeof relayTimeoutMs === 'number') options.timeoutMs = relayTimeoutMs;
		if (typeof onRelayEvents === 'function') {
			options.onEvents = onRelayEvents as RelayQueryOptions['onEvents'];
		}
		const relayOptions =
			options.timeoutMs !== undefined || options.onEvents ? options : undefined;
		if (isListingFilter(filter) && listingRelayUrls().length > 0) {
			return {
				data: (await (relayOptions
					? queryListingRelays(filter, relayOptions)
					: queryListingRelays(filter))) as EventEntity[]
			};
		}
		const events = await (relayOptions
			? queryGeneralRelays([filter], relayOptions)
			: queryGeneralRelays([filter]));
		return { data: events as EventEntity[] };
	}

	async findEventById(id: string): Promise<FindEventByIdVo> {
		const events = await queryGeneralRelays([{ ids: [id], limit: 1 }]);
		const event = events.find((item) => item.id === id);
		if (!event) throw new Error('Event not found');
		return { data: event as EventEntity };
	}

	async requestEvents(dto: RequestEventsDto): Promise<RequestEventsVo> {
		const filters = Array.isArray(dto?.filters) ? (dto.filters as Filter[]) : [];
		const catalogOn = listingRelayUrls().length > 0;
		const listing = catalogOn ? filters.filter((filter) => isListingFilter(filter)) : [];
		const general = catalogOn ? filters.filter((filter) => !isListingFilter(filter)) : filters;
		const listed: Event[] = [];
		for (const filter of listing) {
			listed.push(...(await queryListingRelays(filter)));
		}
		const other = general.length > 0 ? await queryGeneralRelays(general) : [];
		return { data: mergeRelayEvents([listed, other]) as EventEntity[] };
	}

	async deleteEvent(event: NostrEvent): Promise<{ deleteCount: number; message: string }> {
		await publishToGeneralRelays(event as Event);
		const deleteCount = event.tags?.filter((tag) => tag[0] === 'e').length || 1;
		return { deleteCount, message: 'deleted' };
	}
}

const nostrEventsService = new NostrEventsService();

export default nostrEventsService;

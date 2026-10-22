/*
 * Nostr events on the sandbox relays.
 *
 * rgb.bittasker.com and api-staging.bittasker.com do not serve /api/v1/events.
 * This module must not call that route. Task and service kinds are read from
 * the catalog relay when one is configured. Messages stay on the general relay.
 */
import type { Event, Filter, NostrEvent } from 'nostr-tools';
import { sandboxIsolatesCatalog } from '$lib/nostr/catalog-guard';
import { publishToGeneralRelays, queryGeneralRelays } from '$lib/nostr/general-relay';
import {
	listingRelayUrls,
	listingWriteRelays,
	mergeRelayEvents,
	queryListingRelays
} from '$lib/nostr/listing-relays';
import { publishWithRelayAuth } from '$lib/nostr/relaySession';
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
	timeoutMs?: number;
}

interface RequestEventsVo {
	data: EventEntity[];
}

async function publishToListingRelays(event: Event): Promise<void> {
	const relays = listingWriteRelays();
	const results = await publishWithRelayAuth(event, relays);
	if (!results.some((result) => result.success)) {
		const detail = results
			.map((result) => `${result.relay}: ${result.error ?? 'failed'}`)
			.join(', ');
		throw new Error(`Failed to publish to any relay. ${detail}`);
	}
}

class NostrEventsService {
	async publishEvent(event: NostrEvent): Promise<EventEntity> {
		if (sandboxIsolatesCatalog() && LISTING_KINDS.has(event.kind)) {
			await publishToListingRelays(event as Event);
			return event as EventEntity;
		}
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
		const relayOptions = options.timeoutMs !== undefined || options.onEvents ? options : undefined;
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
		const timeoutMs = typeof dto?.timeoutMs === 'number' ? dto.timeoutMs : undefined;
		const options = timeoutMs !== undefined ? { timeoutMs } : undefined;
		const listedGroups = await Promise.all(
			listing.map((filter) =>
				options ? queryListingRelays(filter, options) : queryListingRelays(filter)
			)
		);
		const other =
			general.length > 0
				? await (options ? queryGeneralRelays(general, options) : queryGeneralRelays(general))
				: [];
		return { data: mergeRelayEvents([...listedGroups, other]) as EventEntity[] };
	}

	async deleteEvent(event: NostrEvent): Promise<{ deleteCount: number; message: string }> {
		if (sandboxIsolatesCatalog()) {
			await publishToListingRelays(event as Event);
		} else {
			await publishToGeneralRelays(event as Event);
		}
		const deleteCount = event.tags?.filter((tag) => tag[0] === 'e').length || 1;
		return { deleteCount, message: 'deleted' };
	}
}

const nostrEventsService = new NostrEventsService();

export default nostrEventsService;

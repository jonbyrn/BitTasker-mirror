/*
 * Nostr events on the sandbox general relays.
 *
 * rgb.bittasker.com and api-staging.bittasker.com do not serve /api/v1/events.
 * This module must not call that route. Publish, read, and delete go through
 * the same relays as tasks, bids, and direct messages.
 */
import type { Event, Filter, NostrEvent } from 'nostr-tools';
import { publishToGeneralRelays, queryGeneralRelays } from '$lib/nostr/general-relay';

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
		const events = await queryGeneralRelays([params as Filter]);
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
		const events = await queryGeneralRelays(filters);
		return { data: events as EventEntity[] };
	}

	async deleteEvent(event: NostrEvent): Promise<{ deleteCount: number; message: string }> {
		await publishToGeneralRelays(event as Event);
		const deleteCount = event.tags?.filter((tag) => tag[0] === 'e').length || 1;
		return { deleteCount, message: 'deleted' };
	}
}

const nostrEventsService = new NostrEventsService();

export default nostrEventsService;

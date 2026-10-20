/*
 * Nostr Events Service
 *
 * IMPORTANT: This service is only intended to be used for tasks that are not related to the main app.
 *
 * Features:
 * - Publish events
 * - Find events
 * - Find event by ID
 * - Request events
 */
import type { Event, Filter, NostrEvent } from 'nostr-tools';
import { ENDPOINTS } from '$lib/api/endpoints';
import { BaseApiService, isNotFoundError } from '$lib/api/apiService';
import { publishToGeneralRelays, queryGeneralRelays } from '$lib/nostr/general-relay';

// Types for API responses (from swagger)
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
	filters: unknown[]; // Use a more specific type if available
}

interface RequestEventsVo {
	data: EventEntity[];
}

class NostrEventsService extends BaseApiService {
	constructor() {
		const isE2ETest = import.meta.env.VITE_E2E_TURNSTILE_BYPASS === 'true';
		super(isE2ETest ? import.meta.env.VITE_API_URL : import.meta.env.VITE_NOSTR_RELAY_NESTJS);
	}

	// Signed Nostr event on the general relays. rgb.bittasker.com has no /api/v1/events route.
	async publishEvent(event: NostrEvent): Promise<EventEntity> {
		await publishToGeneralRelays(event as Event);
		return event as EventEntity;
	}

	// GET /events, then the general relays when that API is missing or empty.
	async findEvents(params?: Record<string, unknown>): Promise<FindEventsVo> {
		try {
			const response = await this.get<FindEventsVo>(ENDPOINTS.NOSTR.EVENTS, { params });
			const events = response.data?.data;
			if (Array.isArray(events) && events.length > 0) return response.data;
		} catch (error) {
			if (!isNotFoundError(error) && !isMissingEventsApi(error)) {
				console.warn('[events] events API unavailable, reading relays', error);
			}
		}

		if (!params) return { data: [] };
		const events = await queryGeneralRelays([params as Filter]);
		return { data: events as EventEntity[] };
	}

	// GET /events/{id}
	async findEventById(id: string): Promise<FindEventByIdVo> {
		const response = await this.get<FindEventByIdVo | EventEntity>(
			ENDPOINTS.NOSTR.EVENTS_BY_ID(id)
		);
		const event = 'data' in response.data ? response.data.data : response.data;
		return { data: event };
	}

	// POST /events/request, then the general relays when that API is missing or empty.
	async requestEvents(dto: RequestEventsDto): Promise<RequestEventsVo> {
		try {
			const response = await this.post<RequestEventsVo>(ENDPOINTS.NOSTR.EVENTS_REQUEST, dto);
			const events = response.data?.data;
			if (Array.isArray(events) && events.length > 0) return response.data;
		} catch (error) {
			if (!isNotFoundError(error) && !isMissingEventsApi(error)) {
				console.warn('[events] events API unavailable, reading relays', error);
			}
		}

		const filters = Array.isArray(dto?.filters) ? (dto.filters as Filter[]) : [];
		const events = await queryGeneralRelays(filters);
		return { data: events as EventEntity[] };
	}

	// Kind 5 on the general relays. The events API is not on this sandbox host.
	async deleteEvent(event: NostrEvent): Promise<{ deleteCount: number; message: string }> {
		await publishToGeneralRelays(event as Event);
		const deleteCount = event.tags?.filter((tag) => tag[0] === 'e').length || 1;
		return { deleteCount, message: 'deleted' };
	}
}

function isMissingEventsApi(error: unknown): boolean {
	const message = error instanceof Error ? error.message : '';
	return /cannot (post|get|delete)|\/api\/v1\/events|404|405|not found|network error|failed to fetch/i.test(
		message
	);
}

export default new NostrEventsService();

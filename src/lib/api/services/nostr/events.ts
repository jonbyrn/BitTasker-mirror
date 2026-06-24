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
import type { NostrEvent } from 'nostr-tools';
import { ENDPOINTS } from '$lib/api/endpoints';
import { BaseApiService } from '$lib/api/apiService';

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
		super(import.meta.env.VITE_NOSTR_RELAY_NESTJS);
	}

	// POST /events
	async publishEvent(event: NostrEvent): Promise<EventEntity> {
		const response = await this.post<EventEntity>(ENDPOINTS.NOSTR.EVENTS, event);
		return response.data;
	}

	// GET /events
	async findEvents(params?: Record<string, unknown>): Promise<FindEventsVo> {
		const response = await this.get<FindEventsVo>(ENDPOINTS.NOSTR.EVENTS, { params });
		return response.data;
	}

	// GET /events/{id}
	async findEventById(id: string): Promise<FindEventByIdVo> {
		const response = await this.get<FindEventByIdVo>(ENDPOINTS.NOSTR.EVENTS_BY_ID(id));
		return response.data;
	}

	// POST /events/request
	async requestEvents(dto: RequestEventsDto): Promise<RequestEventsVo> {
		const response = await this.post<RequestEventsVo>(ENDPOINTS.NOSTR.EVENTS_REQUEST, dto);
		return response.data;
	}

	// DELETE /events
	async deleteEvent(event: NostrEvent): Promise<{ deleteCount: number; message: string }> {
		const response = await this.delete<{ deleteCount: number; message: string }>(
			ENDPOINTS.NOSTR.EVENTS,
			{ data: event }
		);
		return response.data;
	}
}

export default new NostrEventsService();

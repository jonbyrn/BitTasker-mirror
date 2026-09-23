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
import { BaseApiService, isNotFoundError } from '$lib/api/apiService';

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
		super(
			isE2ETest
				? import.meta.env.VITE_API_URL
				: import.meta.env.VITE_NOSTR_RELAY_NESTJS
		);
	}

	// POST /events
	async publishEvent(event: NostrEvent): Promise<EventEntity> {
		const response = await this.post<EventEntity>(ENDPOINTS.NOSTR.EVENTS, event);
		return response.data;
	}

	// GET /events
	async findEvents(params?: Record<string, unknown>): Promise<FindEventsVo> {
		try {
			const response = await this.get<FindEventsVo>(ENDPOINTS.NOSTR.EVENTS, { params });
			return response.data;
		} catch (error) {
			if (isNotFoundError(error)) return { data: [] };
			throw error;
		}
	}

	// GET /events/{id}
	async findEventById(id: string): Promise<FindEventByIdVo> {
		const response = await this.get<FindEventByIdVo | EventEntity>(
			ENDPOINTS.NOSTR.EVENTS_BY_ID(id)
		);
		const event = 'data' in response.data ? response.data.data : response.data;
		return { data: event };
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

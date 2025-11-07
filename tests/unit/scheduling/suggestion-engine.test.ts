import { describe, it, expect, beforeEach } from 'vitest';
import {
	generateSuggestions,
	getTopSuggestions,
	getBestOfferSuggestion,
	getUrgentSuggestions
} from '$lib/services/suggestion-engine';
import type { RequestQueueItem } from '$lib/stores/request-queue.store';
import type { TimeSlotRequest } from '$lib/types/scheduling';

describe('Suggestion Engine', () => {
	const now = Date.now();
	const oneHour = 60 * 60 * 1000;

	function createRequest(
		id: string,
		expiresInMinutes: number = 15
	): RequestQueueItem {
		return {
			id,
			bidId: `bid-${id}`,
			taskId: `task-${id}`,
			taskerPubkey: `tasker-${id}`,
			taskeePubkey: 'taskee',
			type: 'time-slot-request',
			status: 'pending',
			createdAt: now,
			expiresAt: now + expiresInMinutes * 60 * 1000,
			timestamp: now,
			nonce: `nonce-${id}`,
			request: {
				messageType: 'time-slot-request',
				requestId: id,
				bidId: `bid-${id}`,
				taskId: `task-${id}`,
				taskerPubkey: `tasker-${id}`,
				taskeePubkey: 'taskee',
				requestedStartTime: now + oneHour,
				requestedEndTime: now + 2 * oneHour,
				timestamp: now,
				expiresAt: now + expiresInMinutes * 60 * 1000,
				nonce: `nonce-${id}`
			} as TimeSlotRequest
		};
	}

	describe('generateSuggestions', () => {
		it('should generate suggestions for pending requests', () => {
			const requests = [
				createRequest('req-1', 30),
				createRequest('req-2', 5), // Urgent
				createRequest('req-3', 60)
			];

			const suggestions = generateSuggestions(requests);
			expect(suggestions.length).toBeGreaterThan(0);
			expect(suggestions[0].type).toBe('best-offer');
		});

		it('should not generate suggestions for non-pending requests', () => {
			const requests = [
				{ ...createRequest('req-1'), status: 'accepted' as const },
				{ ...createRequest('req-2'), status: 'rejected' as const }
			];

			const suggestions = generateSuggestions(requests);
			expect(suggestions.length).toBe(0);
		});

		it('should include urgent suggestions', () => {
			const requests = [
				createRequest('req-1', 3), // Very urgent
				createRequest('req-2', 4), // Very urgent
				createRequest('req-3', 60) // Not urgent
			];

			const suggestions = generateSuggestions(requests);
			const urgentSuggestions = suggestions.filter((s) => s.type === 'urgent');
			expect(urgentSuggestions.length).toBeGreaterThan(0);
		});

		it('should limit suggestions to maxSuggestions', () => {
			const requests = Array.from({ length: 10 }, (_, i) =>
				createRequest(`req-${i}`, 15)
			);

			const suggestions = generateSuggestions(requests, { maxSuggestions: 3 });
			expect(suggestions.length).toBeLessThanOrEqual(3);
		});
	});

	describe('getTopSuggestions', () => {
		it('should return top suggestions', () => {
			const requests = [
				createRequest('req-1', 30),
				createRequest('req-2', 5),
				createRequest('req-3', 60)
			];

			const suggestions = getTopSuggestions(requests);
			expect(suggestions.length).toBeGreaterThan(0);
		});
	});

	describe('getBestOfferSuggestion', () => {
		it('should return best offer suggestion', () => {
			const requests = [
				createRequest('req-1', 30),
				createRequest('req-2', 5), // More urgent = better
				createRequest('req-3', 60)
			];

			const suggestion = getBestOfferSuggestion(requests);
			expect(suggestion).toBeDefined();
			expect(suggestion?.type).toBe('best-offer');
			expect(suggestion?.request.id).toBe('req-2');
		});

		it('should return null for empty requests', () => {
			const suggestion = getBestOfferSuggestion([]);
			expect(suggestion).toBeNull();
		});
	});

	describe('getUrgentSuggestions', () => {
		it('should return urgent suggestions', () => {
			const requests = [
				createRequest('req-1', 3), // Urgent
				createRequest('req-2', 4), // Urgent
				createRequest('req-3', 60) // Not urgent
			];

			const suggestions = getUrgentSuggestions(requests);
			expect(suggestions.length).toBe(2);
			expect(suggestions.every((s) => s.type === 'urgent')).toBe(true);
		});

		it('should return empty array if no urgent requests', () => {
			const requests = [
				createRequest('req-1', 60),
				createRequest('req-2', 90)
			];

			const suggestions = getUrgentSuggestions(requests);
			expect(suggestions.length).toBe(0);
		});
	});
});


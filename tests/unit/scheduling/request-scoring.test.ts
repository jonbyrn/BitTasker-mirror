import { describe, it, expect, beforeEach } from 'vitest';
import {
	calculateUrgencyScore,
	calculateExpiryProximity,
	calculateTimeSlotSpecificity,
	calculateCombinedValue,
	calculateRequestScore,
	scoreRequests,
	findBestScoredOffer,
	getRecommendationBadge
} from '$lib/utils/request-scoring';
import type { RequestQueueItem } from '$lib/stores/request-queue.store';
import type { TimeSlotRequest } from '$lib/types/scheduling';
import type { SimplifiedTaskBid } from '$lib/types/bid';

describe('Request Scoring', () => {
	const now = Date.now();
	const oneHour = 60 * 60 * 1000;

	describe('calculateUrgencyScore', () => {
		it('should return high score for expiring soon', () => {
			const expiresAt = now + 5 * 60 * 1000; // 5 minutes
			const score = calculateUrgencyScore(expiresAt, now);
			expect(score).toBeGreaterThan(50);
		});

		it('should return low score for far future expiry', () => {
			const expiresAt = now + 2 * oneHour; // 2 hours
			const score = calculateUrgencyScore(expiresAt, now);
			expect(score).toBeLessThan(10);
		});

		it('should return maximum score for expired requests', () => {
			const expiresAt = now - 1000; // Expired
			const score = calculateUrgencyScore(expiresAt, now);
			expect(score).toBe(100);
		});
	});

	describe('calculateExpiryProximity', () => {
		it('should return 1.0 for expired requests', () => {
			const expiresAt = now - 1000;
			const proximity = calculateExpiryProximity(expiresAt, now);
			expect(proximity).toBe(1.0);
		});

		it('should return 0 for far future expiry', () => {
			const expiresAt = now + 2 * oneHour;
			const proximity = calculateExpiryProximity(expiresAt, now);
			expect(proximity).toBe(0);
		});
	});

	describe('calculateTimeSlotSpecificity', () => {
		it('should return 1.0 for time-slot-request', () => {
			const request: RequestQueueItem = {
				id: 'req-1',
				bidId: 'bid-1',
				taskId: 'task-1',
				taskerPubkey: 'tasker',
				taskeePubkey: 'taskee',
				type: 'time-slot-request',
				status: 'pending',
				createdAt: now,
				expiresAt: now + 15 * 60 * 1000,
				timestamp: now,
				nonce: 'nonce-1',
				request: {
					messageType: 'time-slot-request',
					requestId: 'req-1',
					bidId: 'bid-1',
					taskId: 'task-1',
					taskerPubkey: 'tasker',
					taskeePubkey: 'taskee',
					requestedStartTime: now + oneHour,
					requestedEndTime: now + 2 * oneHour,
					timestamp: now,
					expiresAt: now + 15 * 60 * 1000,
					nonce: 'nonce-1'
				} as TimeSlotRequest
			};

			const specificity = calculateTimeSlotSpecificity(request);
			expect(specificity).toBe(1.0);
		});

		it('should return 0.5 for soonest-available-request', () => {
			const request: RequestQueueItem = {
				id: 'req-1',
				bidId: 'bid-1',
				taskId: 'task-1',
				taskerPubkey: 'tasker',
				taskeePubkey: 'taskee',
				type: 'soonest-available-request',
				status: 'pending',
				createdAt: now,
				expiresAt: now + 15 * 60 * 1000,
				timestamp: now,
				nonce: 'nonce-1',
				request: {
					messageType: 'soonest-available-request',
					requestId: 'req-1',
					bidId: 'bid-1',
					taskId: 'task-1',
					taskerPubkey: 'tasker',
					taskeePubkey: 'taskee',
					timestamp: now,
					expiresAt: now + 15 * 60 * 1000,
					nonce: 'nonce-1'
				}
			};

			const specificity = calculateTimeSlotSpecificity(request);
			expect(specificity).toBe(0.5);
		});
	});

	describe('calculateCombinedValue', () => {
		it('should calculate combined value correctly', () => {
			const value = calculateCombinedValue(500, 4.5, true, true);
			expect(value).toBeGreaterThan(0);
			expect(value).toBeLessThanOrEqual(100);
		});

		it('should handle missing bid amount', () => {
			const value = calculateCombinedValue(undefined, 4.5, true, true);
			expect(value).toBeGreaterThan(0);
		});

		it('should handle missing rating', () => {
			const value = calculateCombinedValue(500, undefined, true, true);
			expect(value).toBeGreaterThan(0);
		});

		it('should respect preferHigherBids preference', () => {
			const value1 = calculateCombinedValue(100, 4.0, true, true);
			const value2 = calculateCombinedValue(100, 4.0, false, true);
			expect(value1).not.toBe(value2);
		});
	});

	describe('calculateRequestScore', () => {
		it('should calculate score for request with bid and rating', () => {
			const request: RequestQueueItem = {
				id: 'req-1',
				bidId: 'bid-1',
				taskId: 'task-1',
				taskerPubkey: 'tasker',
				taskeePubkey: 'taskee',
				type: 'time-slot-request',
				status: 'pending',
				createdAt: now,
				expiresAt: now + 10 * 60 * 1000, // 10 minutes
				timestamp: now,
				nonce: 'nonce-1',
				request: {
					messageType: 'time-slot-request',
					requestId: 'req-1',
					bidId: 'bid-1',
					taskId: 'task-1',
					taskerPubkey: 'tasker',
					taskeePubkey: 'taskee',
					requestedStartTime: now + oneHour,
					requestedEndTime: now + 2 * oneHour,
					timestamp: now,
					expiresAt: now + 10 * 60 * 1000,
					nonce: 'nonce-1'
				} as TimeSlotRequest
			};

			const bidData = new Map<string, SimplifiedTaskBid>();
			bidData.set('bid-1', {
				id: 'bid-1',
				taskId: 'task-1',
				bidderWalletAddress: '0x123',
				amount: 500,
				currency: 'USD',
				paymentType: 'FIXED',
				description: 'Test',
				estimatedDuration: '1 hour',
				proposedApproach: 'Test',
				coverLetter: 'Test',
				status: 'PENDING',
				createdAt: new Date().toISOString(),
				startDateTime: new Date(now + oneHour).toISOString(),
				endDateTime: new Date(now + 2 * oneHour).toISOString(),
				userProfile: {
					user: {
						rating: 4.5,
						id: 'tasker',
						name: 'Test User',
						avatar: ''
					}
				}
			});

			const userRatings = new Map<string, number>();
			userRatings.set('tasker', 4.5);

			const score = calculateRequestScore(request, {
				bidData,
				userRatings
			});

			expect(score.score).toBeGreaterThan(0);
			expect(score.breakdown.urgency).toBeGreaterThan(0);
			expect(score.breakdown.combinedValue).toBeGreaterThan(0);
			expect(score.recommendation).toBeDefined();
			expect(score.reason).toBeDefined();
		});

		it('should handle request without bid data', () => {
			const request: RequestQueueItem = {
				id: 'req-1',
				bidId: 'bid-1',
				taskId: 'task-1',
				taskerPubkey: 'tasker',
				taskeePubkey: 'taskee',
				type: 'time-slot-request',
				status: 'pending',
				createdAt: now,
				expiresAt: now + 10 * 60 * 1000,
				timestamp: now,
				nonce: 'nonce-1',
				request: {
					messageType: 'time-slot-request',
					requestId: 'req-1',
					bidId: 'bid-1',
					taskId: 'task-1',
					taskerPubkey: 'tasker',
					taskeePubkey: 'taskee',
					requestedStartTime: now + oneHour,
					requestedEndTime: now + 2 * oneHour,
					timestamp: now,
					expiresAt: now + 10 * 60 * 1000,
					nonce: 'nonce-1'
				} as TimeSlotRequest
			};

			const score = calculateRequestScore(request);
			expect(score.score).toBeGreaterThan(0);
			expect(score.recommendation).toBeDefined();
		});
	});

	describe('scoreRequests', () => {
		it('should score and sort requests', () => {
			const requests: RequestQueueItem[] = [
				{
					id: 'req-1',
					bidId: 'bid-1',
					taskId: 'task-1',
					taskerPubkey: 'tasker-1',
					taskeePubkey: 'taskee',
					type: 'time-slot-request',
					status: 'pending',
					createdAt: now,
					expiresAt: now + 30 * 60 * 1000, // Less urgent
					timestamp: now,
					nonce: 'nonce-1',
					request: {
						messageType: 'time-slot-request',
						requestId: 'req-1',
						bidId: 'bid-1',
						taskId: 'task-1',
						taskerPubkey: 'tasker-1',
						taskeePubkey: 'taskee',
						requestedStartTime: now + oneHour,
						requestedEndTime: now + 2 * oneHour,
						timestamp: now,
						expiresAt: now + 30 * 60 * 1000,
						nonce: 'nonce-1'
					} as TimeSlotRequest
				},
				{
					id: 'req-2',
					bidId: 'bid-2',
					taskId: 'task-2',
					taskerPubkey: 'tasker-2',
					taskeePubkey: 'taskee',
					type: 'time-slot-request',
					status: 'pending',
					createdAt: now,
					expiresAt: now + 5 * 60 * 1000, // More urgent
					timestamp: now,
					nonce: 'nonce-2',
					request: {
						messageType: 'time-slot-request',
						requestId: 'req-2',
						bidId: 'bid-2',
						taskId: 'task-2',
						taskerPubkey: 'tasker-2',
						taskeePubkey: 'taskee',
						requestedStartTime: now + 2 * oneHour,
						requestedEndTime: now + 3 * oneHour,
						timestamp: now,
						expiresAt: now + 5 * 60 * 1000,
						nonce: 'nonce-2'
					} as TimeSlotRequest
				}
			];

			const scored = scoreRequests(requests);
			expect(scored.length).toBe(2);
			expect(scored[0].score).toBeGreaterThanOrEqual(scored[1].score);
		});
	});

	describe('findBestScoredOffer', () => {
		it('should find best offer from multiple requests', () => {
			const requests: RequestQueueItem[] = [
				{
					id: 'req-1',
					bidId: 'bid-1',
					taskId: 'task-1',
					taskerPubkey: 'tasker-1',
					taskeePubkey: 'taskee',
					type: 'time-slot-request',
					status: 'pending',
					createdAt: now,
					expiresAt: now + 30 * 60 * 1000,
					timestamp: now,
					nonce: 'nonce-1',
					request: {
						messageType: 'time-slot-request',
						requestId: 'req-1',
						bidId: 'bid-1',
						taskId: 'task-1',
						taskerPubkey: 'tasker-1',
						taskeePubkey: 'taskee',
						requestedStartTime: now + oneHour,
						requestedEndTime: now + 2 * oneHour,
						timestamp: now,
						expiresAt: now + 30 * 60 * 1000,
						nonce: 'nonce-1'
					} as TimeSlotRequest
				},
				{
					id: 'req-2',
					bidId: 'bid-2',
					taskId: 'task-2',
					taskerPubkey: 'tasker-2',
					taskeePubkey: 'taskee',
					type: 'time-slot-request',
					status: 'pending',
					createdAt: now,
					expiresAt: now + 5 * 60 * 1000,
					timestamp: now,
					nonce: 'nonce-2',
					request: {
						messageType: 'time-slot-request',
						requestId: 'req-2',
						bidId: 'bid-2',
						taskId: 'task-2',
						taskerPubkey: 'tasker-2',
						taskeePubkey: 'taskee',
						requestedStartTime: now + 2 * oneHour,
						requestedEndTime: now + 3 * oneHour,
						timestamp: now,
						expiresAt: now + 5 * 60 * 1000,
						nonce: 'nonce-2'
					} as TimeSlotRequest
				}
			];

			const bestOffer = findBestScoredOffer(requests);
			expect(bestOffer).toBeDefined();
			expect(bestOffer?.request.id).toBe('req-2'); // More urgent
		});
	});

	describe('getRecommendationBadge', () => {
		it('should return correct badge for high recommendation', () => {
			const request: RequestQueueItem = {
				id: 'req-1',
				bidId: 'bid-1',
				taskId: 'task-1',
				taskerPubkey: 'tasker',
				taskeePubkey: 'taskee',
				type: 'time-slot-request',
				status: 'pending',
				createdAt: now,
				expiresAt: now + 15 * 60 * 1000,
				timestamp: now,
				nonce: 'nonce-1',
				request: {
					messageType: 'time-slot-request',
					requestId: 'req-1',
					bidId: 'bid-1',
					taskId: 'task-1',
					taskerPubkey: 'tasker',
					taskeePubkey: 'taskee',
					requestedStartTime: now + oneHour,
					requestedEndTime: now + 2 * oneHour,
					timestamp: now,
					expiresAt: now + 15 * 60 * 1000,
					nonce: 'nonce-1'
				} as TimeSlotRequest
			};

			const score = calculateRequestScore(request);
			score.recommendation = 'high';
			const badge = getRecommendationBadge(score);
			expect(badge.label).toBe('Highly Recommended');
			expect(badge.color).toBe('success');
		});
	});
});


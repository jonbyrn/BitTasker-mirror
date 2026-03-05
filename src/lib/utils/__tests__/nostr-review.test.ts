import { describe, it, expect, beforeEach, vi } from 'vitest';
import { publishReview, getReviewsForUser, hasUserReviewedEscrow } from '../nostr-review';
import { escrow } from '$lib/utils/escrow';
import { getNpub } from '$lib/utils/nostrKeys';
import { publishEvent } from '../nostr';
import { EscrowStatus } from '$lib/utils/escrow';
import type { EscrowData } from '$lib/types/wallet';

vi.mock('$lib/utils/escrow', () => ({
	escrow: {
		getEscrow: vi.fn()
	},
	EscrowStatus: {
		Funded: 0,
		InDispute: 1,
		DisputeResolved: 2,
		DisputeUnresolved: 3,
		Completed: 4,
		Cancelled: 5,
		FundsReleased: 6,
		PendingAcceptance: 7
	},
	ESCROW_STATUSES_REVIEW_COMPLETED: [4, 6, 2] // Completed, FundsReleased, DisputeResolved
}));

vi.mock('$lib/utils/nostrKeys', () => ({
	getNpub: vi.fn(),
	npubToHex: (p: string) =>
		p?.startsWith('npub') ? 'a'.repeat(64) : (p?.replace(/^0x/, '') ?? ''),
	hexToNpub: (h: string) => h
}));

vi.mock('../nostr', () => ({
	DEFAULT_RELAYS: ['wss://relay.example.com'],
	publishEvent: vi.fn(),
	getSignedEvent: vi.fn((event: unknown) =>
		Promise.resolve({ ...event, id: 'signed-event-id', sig: 'sig' })
	),
	subscribeToEvents: vi.fn(() => () => {})
}));

describe('nostr-review utilities', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('publishReview', () => {
		it('should publish review for completed escrow', async () => {
			vi.mocked(escrow.getEscrow).mockResolvedValue({
				id: '123',
				client: '0x111',
				freelancer: '0x222',
				status: EscrowStatus.Completed,
				baseAmount: '1.0',
				createdAt: Date.now()
			} as EscrowData);

			vi.mocked(getNpub).mockResolvedValue('npub1reviewer');

			const content = {
				overallRating: 5,
				categoryRatings: {
					quality: 5,
					professionalism: 5,
					timeliness: 5
				},
				comment: 'Great!'
			};

			const eventId = await publishReview('123', 'npub1reviewee', content, 'task-abc');

			expect(eventId).toBeDefined();
			expect(publishEvent).toHaveBeenCalled();
		});

		it('should reject review for non-completed escrow', async () => {
			vi.mocked(escrow.getEscrow).mockResolvedValue({
				id: '123',
				client: '0x111',
				freelancer: '0x222',
				status: EscrowStatus.Funded,
				baseAmount: '1.0',
				createdAt: Date.now()
			} as EscrowData);

			const content = {
				overallRating: 5,
				categoryRatings: {
					quality: 5,
					professionalism: 5,
					timeliness: 5
				}
			};

			await expect(publishReview('123', 'npub1reviewee', content, 'task-abc')).rejects.toThrow();
		});
	});

	describe('getReviewsForUser', () => {
		it('should fetch reviews for a user (mocked relay; returns array)', async () => {
			vi.useFakeTimers();
			const promise = getReviewsForUser('npub1reviewee', 10);
			await vi.advanceTimersByTimeAsync(11000);
			const reviews = await promise;
			vi.useRealTimers();
			expect(Array.isArray(reviews)).toBe(true);
		});
	});

	describe('hasUserReviewedEscrow', () => {
		it('should return boolean', async () => {
			vi.useFakeTimers();
			const promise = hasUserReviewedEscrow('123', 'npub1reviewer');
			await vi.advanceTimersByTimeAsync(11000);
			const hasReviewed = await promise;
			vi.useRealTimers();
			expect(typeof hasReviewed).toBe('boolean');
		});
	});
});

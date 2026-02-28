import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
	publishReview,
	getReviewsForUser,
	hasUserReviewedEscrow
} from '../nostr-review';
import { escrow } from '$lib/utils/wallet/escrow';
import { getNpub } from '$lib/utils/nostrKeys';
import { publishEvent } from '../nostr';
import { EscrowStatus } from '$lib/utils/escrow';

vi.mock('$lib/utils/wallet/escrow', () => ({
	escrow: {
		getEscrow: vi.fn()
	}
}));

vi.mock('$lib/utils/nostrKeys', () => ({
	getNpub: vi.fn()
}));

vi.mock('../nostr', () => ({
	publishEvent: vi.fn(),
	getSignedEvent: vi.fn((event: unknown) => Promise.resolve({ ...event, id: 'signed-event-id', sig: 'sig' }))
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
			} as any);

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
			} as any);

			const content = {
				overallRating: 5,
				categoryRatings: {
					quality: 5,
					professionalism: 5,
					timeliness: 5
				}
			};

			await expect(
				publishReview('123', 'npub1reviewee', content, 'task-abc')
			).rejects.toThrow();
		});
	});

	describe('getReviewsForUser', () => {
		it('should fetch reviews for a user (uses real relay; may timeout if no relay)', async () => {
			const reviews = await getReviewsForUser('npub1reviewee', 10);
			expect(Array.isArray(reviews)).toBe(true);
		}, 15000);
	});

	describe('hasUserReviewedEscrow', () => {
		it('should return boolean', async () => {
			const hasReviewed = await hasUserReviewedEscrow('123', 'npub1reviewer');
			expect(typeof hasReviewed).toBe('boolean');
		});
	});
});

import { describe, expect, it } from 'vitest';
import KINDS from '$lib/utils/constants/kinds';
import {
	reviewGateFor,
	reviewedContractIds,
	settledReviewSlots,
	type StatusEvent
} from '$lib/utils/reviews/settled-escrow';
import { attestedFromPlainReview } from '$lib/utils/reviews/plain-reviews';

const hirer = 'a'.repeat(64);
const worker = 'b'.repeat(64);
const stranger = 'c'.repeat(64);
const contractId = `contract-${'d'.repeat(64)}-${'e'.repeat(64)}`;

function status(state: string, createdAt: number, parties = [hirer, worker]): StatusEvent {
	return {
		id: `${state}-${createdAt}`,
		pubkey: hirer,
		created_at: createdAt,
		tags: [['r', contractId], ['s', state], ...parties.map((party) => ['p', party])],
		content: JSON.stringify({ type: 'contract-status', contractId, status: state })
	};
}

describe('settled escrow reviews', () => {
	it('lets either party review only after the escrow settles', () => {
		const open = [status('funded', 10), status('approved', 20)];
		expect(reviewGateFor(open, contractId, hirer, worker).ok).toBe(false);
		expect(reviewGateFor(open, contractId, worker, hirer).reason).toMatch(/settles/);

		const settled = [...open, status('settled', 30)];
		expect(reviewGateFor(settled, contractId, hirer, worker).ok).toBe(true);
		expect(reviewGateFor(settled, contractId, worker, hirer).ok).toBe(true);
		expect(reviewGateFor(settled, contractId, stranger, worker).ok).toBe(false);
		expect(reviewGateFor(settled, contractId, hirer, stranger).ok).toBe(false);
	});

	it('hides a settled escrow the user already reviewed', () => {
		const events = [status('released', 40)];
		const review = {
			id: 'f'.repeat(64),
			pubkey: worker,
			created_at: 50,
			kind: KINDS.REVIEW,
			tags: [
				['p', hirer],
				['e', contractId],
				['t', 'd'.repeat(64)]
			],
			content: JSON.stringify({
				type: 'review',
				escrowId: contractId,
				rating: { overallRating: 4 },
				comment: 'Solid work'
			}),
			sig: ''
		};
		const slots = settledReviewSlots(events, worker, reviewedContractIds([review]));
		expect(slots).toEqual([]);
		expect(attestedFromPlainReview(review)?.content.overallRating).toBe(4);
		expect(attestedFromPlainReview(review)?.content.comment).toBe('Solid work');
	});

	it('offers one pending review to each unsettled-review party', () => {
		const slots = settledReviewSlots([status('settled', 60)], hirer, new Set());
		expect(slots).toHaveLength(1);
		expect(slots[0]?.revieweePubkey).toBe(worker);
		expect(slots[0]?.subjects).toContain('d'.repeat(64));
	});
});

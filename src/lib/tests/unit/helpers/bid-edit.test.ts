import { describe, expect, it } from 'vitest';
import { bidCanChange, revisedBidContent } from '$lib/utils/nostr-bid';
import type { NostrBidContent } from '$lib/types/bid';

const current: NostrBidContent = {
	type: 'bid',
	taskId: 'task-1',
	taskTitle: 'Earn Bitcoin',
	taskDescription: 'A task',
	taskBudget: { amount: 10, currency: 'USD' },
	amount: 2,
	currency: 'USD',
	paymentType: 'FIXED',
	description: 'I can do it',
	estimatedDuration: '3 days',
	proposedApproach: 'I can do it',
	coverLetter: 'I can do it',
	timestamp: 10,
	bidId: 'task-1-bidder',
	startDateTime: 10,
	endDateTime: 20,
	taskCreatorPubkey: 'abc'
};

describe('bid edits', () => {
	it('allows a pending bid and locks an accepted one', () => {
		expect(bidCanChange(undefined)).toBe(true);
		expect(bidCanChange('pending')).toBe(true);
		expect(bidCanChange('COUNTERED')).toBe(true);
		expect(bidCanChange('ACCEPTED')).toBe(false);
		expect(bidCanChange('ESCROW_FUNDED')).toBe(false);
	});

	it('keeps the bid id and replaces the quote', () => {
		const next = revisedBidContent(current, { amount: 4, days: 2, proposal: 'Updated' }, 100);
		expect(next.bidId).toBe(current.bidId);
		expect(next.amount).toBe(4);
		expect(next.taskBudget?.amount).toBe(10);
		expect(next.proposedApproach).toBe('Updated');
		expect(next.endDateTime).toBe(100 + 2 * 24 * 60 * 60);
	});
});

import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { bidStore } from '$lib/stores/bid.store';

describe('bidStore', () => {
	beforeEach(() => {
		// Reset store before each test
		bidStore.reset();
	});

	describe('processingBidIds management', () => {
		it('should add bid to processing state', () => {
			const bidId = 'bid-123';
			bidStore.addProcessingBid(bidId);

			const state = get(bidStore);
			expect(state.processingBidIds.has(bidId)).toBe(true);
		});

		it('should remove bid from processing state', () => {
			const bidId = 'bid-123';
			bidStore.addProcessingBid(bidId);

			let state = get(bidStore);
			expect(state.processingBidIds.has(bidId)).toBe(true);

			bidStore.removeProcessingBid(bidId);

			state = get(bidStore);
			expect(state.processingBidIds.has(bidId)).toBe(false);
		});

		it('should handle multiple bids in processing state', () => {
			const bidId1 = 'bid-123';
			const bidId2 = 'bid-456';
			const bidId3 = 'bid-789';

			bidStore.addProcessingBid(bidId1);
			bidStore.addProcessingBid(bidId2);
			bidStore.addProcessingBid(bidId3);

			let state = get(bidStore);
			expect(state.processingBidIds.has(bidId1)).toBe(true);
			expect(state.processingBidIds.has(bidId2)).toBe(true);
			expect(state.processingBidIds.has(bidId3)).toBe(true);

			bidStore.removeProcessingBid(bidId2);

			state = get(bidStore);
			expect(state.processingBidIds.has(bidId1)).toBe(true);
			expect(state.processingBidIds.has(bidId2)).toBe(false);
			expect(state.processingBidIds.has(bidId3)).toBe(true);
		});

		it('should not throw error when removing non-existent bid', () => {
			const bidId = 'bid-nonexistent';
			expect(() => bidStore.removeProcessingBid(bidId)).not.toThrow();

			const state = get(bidStore);
			expect(state.processingBidIds.has(bidId)).toBe(false);
		});

		it('should clear all processing bids on reset', () => {
			bidStore.addProcessingBid('bid-1');
			bidStore.addProcessingBid('bid-2');
			bidStore.addProcessingBid('bid-3');

			let state = get(bidStore);
			expect(state.processingBidIds.size).toBe(3);

			bidStore.reset();

			state = get(bidStore);
			expect(state.processingBidIds.size).toBe(0);
		});

		it('should prevent multiple rapid submissions of the same bid', () => {
			const bidId = 'bid-123';

			// First submission
			bidStore.addProcessingBid(bidId);
			let state = get(bidStore);
			expect(state.processingBidIds.has(bidId)).toBe(true);

			// Attempt second submission (should already be in set)
			bidStore.addProcessingBid(bidId);
			state = get(bidStore);
			expect(state.processingBidIds.has(bidId)).toBe(true);
			expect(state.processingBidIds.size).toBe(1); // Still only one entry
		});

		it('should allow different bids to be processed simultaneously', () => {
			const bidId1 = 'bid-123';
			const bidId2 = 'bid-456';
			const bidId3 = 'bid-789';

			bidStore.addProcessingBid(bidId1);
			bidStore.addProcessingBid(bidId2);
			bidStore.addProcessingBid(bidId3);

			const state = get(bidStore);
			expect(state.processingBidIds.size).toBe(3);
			expect(state.processingBidIds.has(bidId1)).toBe(true);
			expect(state.processingBidIds.has(bidId2)).toBe(true);
			expect(state.processingBidIds.has(bidId3)).toBe(true);
		});
	});
});

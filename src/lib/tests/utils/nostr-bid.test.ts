import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveBidSats, sendBidStatusUpdate } from '$lib/utils/nostr-bid';
import { BidStatusEnum } from '$lib/utils/enums/bid.enum';
import { bidStore } from '$lib/stores/bid.store';
import { get as _get } from 'svelte/store';

// Mock dependencies
vi.mock('$lib/utils/nostr', () => ({
	publishNostrEvent: vi.fn(),
	queryNostrEvents: vi.fn()
}));

vi.mock('$lib/utils/constants/tags', () => ({
	TAG_PATTERNS: {
		bidStatus: vi.fn(() => [
			['t', 'bid-status'],
			['bid', 'bid-123']
		])
	},
	TAG_FILTERS: {}
}));

vi.mock('$lib/utils/constants/kinds', () => ({
	default: {
		BID_STATUS: 4
	}
}));

vi.mock('$lib/stores/bid.store', () => ({
	bidStore: {
		removeProcessingBid: vi.fn(),
		processingBidIds: new Set(),
		subscribe: vi.fn(),
		set: vi.fn(),
		update: vi.fn()
	}
}));

vi.mock('$lib/stores/app.store', () => ({
	appStore: {
		showInfoToast: vi.fn(),
		subscribe: vi.fn(),
		set: vi.fn(),
		update: vi.fn()
	}
}));

vi.mock('$lib/utils/cache/bid-cache', () => ({
	smartCache: {
		invalidateTaskBids: vi.fn(),
		clearBids: vi.fn(),
		clearUserBids: vi.fn()
	},
	currencyCache: {
		clear: vi.fn()
	}
}));

// Mock task.store to prevent it from loading and calling get(appStore)?.pool at module init time
vi.mock('$lib/stores/task.store', () => ({
	TASKS_PER_PAGE: 10,
	tasksStore: {
		subscribe: vi.fn(),
		set: vi.fn(),
		update: vi.fn(),
		removePubkeyTasks: vi.fn(),
		reset: vi.fn()
	}
}));

import { publishNostrEvent } from '$lib/utils/nostr';
import { smartCache } from '$lib/utils/cache/bid-cache';
import { appStore } from '$lib/stores/app.store';

describe('resolveBidSats', () => {
	it('reads SATS bids as sat totals without a USD price', () => {
		expect(resolveBidSats(3000, 'SATS', 0)).toBe(3000);
		expect(resolveBidSats(3000, 'BTC', 0)).toBe(3000);
	});

	it('converts legacy USD bids through the spot price', () => {
		expect(resolveBidSats(200, 'USD', 100_000)).toBe(200_000);
		expect(resolveBidSats(200, 'USD', 0)).toBeNull();
	});
});

describe('sendBidStatusUpdate', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Reset processing bid IDs
		(bidStore as unknown as { processingBidIds: Set<string> }).processingBidIds = new Set([
			'bid-123'
		]);
	});

	it('should remove processing bid on success', async () => {
		vi.mocked(publishNostrEvent).mockResolvedValue(
			undefined as unknown as Awaited<ReturnType<typeof publishNostrEvent>>
		);

		const result = await sendBidStatusUpdate(
			'bid-123',
			'task-123',
			'npub1test',
			BidStatusEnum.ACCEPTED,
			'Bid accepted'
		);

		expect(result).toBe(true);
		expect(bidStore.removeProcessingBid).toHaveBeenCalledWith('bid-123');
		expect(vi.mocked(smartCache.invalidateTaskBids)).toHaveBeenCalledWith('task-123');
		expect(vi.mocked(smartCache.clearUserBids)).toHaveBeenCalled();
		expect(appStore.showInfoToast).toHaveBeenCalled();
	});

	it('should return false and cleanup when publishNostrEvent fails', async () => {
		const error = new Error('Failed to publish');
		vi.mocked(publishNostrEvent).mockRejectedValue(error);

		const result = await sendBidStatusUpdate(
			'bid-123',
			'task-123',
			'npub1test',
			BidStatusEnum.ACCEPTED,
			'Bid accepted'
		);

		expect(result).toBe(false);
		// Should still cleanup even on error
		expect(bidStore.removeProcessingBid).toHaveBeenCalledWith('bid-123');
		// Should not show success toast on error
		expect(appStore.showInfoToast).not.toHaveBeenCalled();
	});

	it('should handle multiple cleanup calls gracefully', async () => {
		vi.mocked(publishNostrEvent).mockRejectedValue(new Error('Network error'));

		// Call multiple times - should not throw
		await Promise.all([
			sendBidStatusUpdate('bid-123', 'task-123', 'npub1test', BidStatusEnum.ACCEPTED),
			sendBidStatusUpdate('bid-123', 'task-123', 'npub1test', BidStatusEnum.ACCEPTED)
		]);

		// Should have attempted cleanup (may be called multiple times, which is fine)
		expect(bidStore.removeProcessingBid).toHaveBeenCalled();
	});
});

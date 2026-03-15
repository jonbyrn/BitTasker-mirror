import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getBidStatus, sendBidStatusUpdate } from '$lib/utils/nostr-bid';
import { BidStatusEnum } from '$lib/utils/enums/bid.enum';
import { bidStore } from '$lib/stores/bid.store';

// Mock dependencies
vi.mock('$lib/utils/nostr', () => ({
	publishNostrEvent: vi.fn(),
	queryNostrEvents: vi.fn()
}));

vi.mock('$lib/utils/constants/tags', () => ({
	TAG_PATTERNS: {
		bidStatus: vi.fn(() => [['e', 'bid-123'], ['t', 'task-123'], ['n', 'bsc-testnet'], ['v', 'status.v2']])
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
		processingBidIds: new Set()
	}
}));

vi.mock('$lib/stores/app.store', () => ({
	appStore: {
		showInfoToast: vi.fn()
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

import { publishNostrEvent } from '$lib/utils/nostr';
import { smartCache } from '$lib/utils/cache/bid-cache';
import { appStore } from '$lib/stores/app.store';
import { TAG_PATTERNS } from '$lib/utils/constants/tags';

describe('sendBidStatusUpdate', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Reset processing bid IDs
		(bidStore as any).processingBidIds = new Set(['bid-123']);
	});

	it('should remove processing bid on success', async () => {
		vi.mocked(publishNostrEvent).mockResolvedValue(undefined);

		await sendBidStatusUpdate(
			'bid-123',
			'task-123',
			'npub1test',
			BidStatusEnum.ACCEPTED,
			'Bid accepted'
		);

		expect(bidStore.removeProcessingBid).toHaveBeenCalledWith('bid-123');
		expect(vi.mocked(smartCache.invalidateTaskBids)).toHaveBeenCalledWith('task-123');
		expect(vi.mocked(smartCache.clearUserBids)).toHaveBeenCalled();
		expect(appStore.showInfoToast).toHaveBeenCalled();
	});

	it('should emit versioned payment metadata for new bid status writes', async () => {
		vi.mocked(publishNostrEvent).mockResolvedValue(undefined);

		await sendBidStatusUpdate(
			'bid-123',
			'task-123',
			'npub1test',
			BidStatusEnum.ACCEPTED,
			'Bid accepted',
			'escrow-123',
			'0xtx',
			{
				taskRef: 'task:task-123',
				bidRef: 'bid:bid-123',
				paymentAsset: 'USDT',
				paymentNetwork: 'bsc-testnet'
			}
		);

		expect(TAG_PATTERNS.bidStatus).toHaveBeenCalledWith(
			'bid-123',
			'task-123',
			BidStatusEnum.ACCEPTED,
			'npub1test',
			{
				paymentNetwork: 'bsc-testnet',
				schemaVersion: 'status.v2'
			}
		);

		expect(publishNostrEvent).toHaveBeenCalledTimes(1);
		const [kind, content, recipient, tags] = vi.mocked(publishNostrEvent).mock.calls[0];
		expect(kind).toBe(4);
		expect(recipient).toBe('npub1test');
		expect(tags).toEqual([['e', 'bid-123'], ['t', 'task-123'], ['n', 'bsc-testnet'], ['v', 'status.v2']]);
		expect(JSON.parse(content)).toMatchObject({
			type: 'bid-status',
			schemaVersion: 'status.v2',
			taskId: 'task-123',
			taskRef: 'task:task-123',
			bidRef: 'bid:bid-123',
			status: BidStatusEnum.ACCEPTED,
			escrowId: 'escrow-123',
			transactionHash: '0xtx',
			paymentAsset: 'USDT',
			paymentNetwork: 'bsc-testnet'
		});
	});

	it('should remove processing bid even when publishNostrEvent fails', async () => {
		const error = new Error('Failed to publish');
		vi.mocked(publishNostrEvent).mockRejectedValue(error);

		await sendBidStatusUpdate(
			'bid-123',
			'task-123',
			'npub1test',
			BidStatusEnum.ACCEPTED,
			'Bid accepted'
		);

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

	it('should normalize legacy bid status followups into versioned payment context', () => {
		const bidEvent = {
			id: 'bid-legacy',
			latestStatus: {
				created_at: 123,
				tags: [['e', 'bid-legacy'], ['t', 'task-legacy'], ['n', 'bsc-testnet']],
				content: {
					type: 'bid-status',
					taskId: 'task-legacy',
					status: BidStatusEnum.ACCEPTED,
					timestamp: 123
				}
			}
		} as any;

		expect(getBidStatus(bidEvent)).toMatchObject({
			schemaVersion: 'status.v2',
			taskRef: 'task:task-legacy',
			bidRef: 'bid:bid-legacy',
			paymentAsset: 'USDT',
			paymentNetwork: 'bsc-testnet'
		});
	});
});

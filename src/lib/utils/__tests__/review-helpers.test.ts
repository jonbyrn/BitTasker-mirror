import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockContracts = vi.hoisted(() => ({
	getUserContracts: vi.fn()
}));

const mockReviews = vi.hoisted(() => ({
	getReviewsForEscrow: vi.fn()
}));

const mockKeys = vi.hoisted(() => ({
	getNpub: vi.fn()
}));

vi.mock('../nostr-bid', () => mockContracts);
vi.mock('../nostr-review', () => mockReviews);
vi.mock('../nostrKeys', () => mockKeys);
vi.mock('$lib/utils/constants/transactions.constants', () => ({
	ESCROW_CONTRACT_ADDRESSES: {
		mainnet: [],
		testnet: []
	},
	statusUI: {}
}));
vi.mock('$lib/utils/wallet/transactionHistory', () => ({
	processTransactions: vi.fn()
}));
vi.mock('$lib/stores/wallet.store', () => ({
	walletStore: {}
}));
vi.mock('$lib/nostr/profile', () => ({}));
vi.mock('$lib/api/services/upload.service', () => ({
	default: {}
}));
vi.mock('$lib/api/services/push-notification.service', () => ({
	default: {}
}));
vi.mock('$lib/utils/helpers/deviceIdentity', () => ({
	getDeviceIdentifier: vi.fn().mockResolvedValue('device-1'),
	createUserDeviceShortName: vi.fn().mockResolvedValue('device-1')
}));

import { findPendingReviews, hasUserReviewedContract } from '../review-helpers';

describe('review-helpers', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockKeys.getNpub.mockResolvedValue('npub-current');
		mockReviews.getReviewsForEscrow.mockResolvedValue([]);
	});

	it('includes the escrow transaction hash in pending reviews', async () => {
		mockContracts.getUserContracts.mockResolvedValue([
			{
				status: 'completed',
				escrowData: {
					id: 'escrow-1'
				},
				contractEvent: {
					created_at: 10,
					content: {
						clientPubkey: 'npub-current',
						freelancerPubkey: 'npub-other',
						transactionHash: '0xescrowtx'
					}
				},
				statusEvents: []
			}
		]);

		const pendingReviews = await findPendingReviews();

		expect(pendingReviews).toHaveLength(1);
		expect(pendingReviews[0].escrowTxHash).toBe('0xescrowtx');
		expect(pendingReviews[0].revieweePubkey).toBe('npub-other');
	});

	it('throws when pending review discovery fails instead of returning an empty list', async () => {
		mockContracts.getUserContracts.mockRejectedValue(new Error('relay unavailable'));

		await expect(findPendingReviews()).rejects.toThrow('relay unavailable');
	});

	it('throws when contract review status cannot be determined', async () => {
		mockReviews.getReviewsForEscrow.mockRejectedValue(new Error('review lookup failed'));

		await expect(hasUserReviewedContract('escrow-1')).rejects.toThrow('review lookup failed');
	});
});

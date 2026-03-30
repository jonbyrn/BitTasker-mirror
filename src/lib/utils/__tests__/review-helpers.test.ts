import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nip19 } from 'nostr-tools';

const mockContracts = vi.hoisted(() => ({
	getUserContracts: vi.fn()
}));

const mockReviews = vi.hoisted(() => ({
	hasUserReviewedEscrow: vi.fn()
}));

const mockKeys = vi.hoisted(() => ({
	getNpub: vi.fn()
}));

const mockProfiles = vi.hoisted(() => ({
	fetchProfileMetadata: vi.fn()
}));

vi.mock('../nostr-bid', () => mockContracts);
vi.mock('../nostr-review', () => mockReviews);
vi.mock('../nostrKeys', () => mockKeys);
vi.mock('../nostr-message', () => mockProfiles);
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

import {
	findPendingReviews,
	hasUserReviewedContract,
	isReviewableContractStatus,
	PartialPendingReviewsError
} from '../review-helpers';

describe('review-helpers', () => {
	const clientHex = 'a'.repeat(64);
	const freelancerHex = 'b'.repeat(64);
	const clientNpub = nip19.npubEncode(clientHex);
	const freelancerNpub = nip19.npubEncode(freelancerHex);

	beforeEach(() => {
		vi.clearAllMocks();
		mockKeys.getNpub.mockResolvedValue('npub-current');
		mockReviews.hasUserReviewedEscrow.mockResolvedValue(false);
		mockProfiles.fetchProfileMetadata.mockResolvedValue({});
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

	it('hydrates pending reviewee names when profile metadata is available', async () => {
		mockProfiles.fetchProfileMetadata.mockResolvedValue({ name: 'Alice Reviewer' });
		mockContracts.getUserContracts.mockResolvedValue([
			{
				status: 'completed',
				escrowData: {
					id: 'escrow-name'
				},
				contractEvent: {
					created_at: 10,
					content: {
						clientPubkey: 'npub-current',
						freelancerPubkey: freelancerHex,
						transactionHash: '0xescrowtx'
					}
				},
				statusEvents: []
			}
		]);

		const pendingReviews = await findPendingReviews();

		expect(pendingReviews[0].revieweeName).toBe('Alice Reviewer');
		expect(mockProfiles.fetchProfileMetadata).toHaveBeenCalledTimes(1);
	});

	it('normalizes mixed npub and hex pubkeys when selecting the reviewee', async () => {
		mockKeys.getNpub.mockResolvedValue(clientNpub);
		mockContracts.getUserContracts.mockResolvedValue([
			{
				status: 'completed',
				escrowData: {
					id: 'escrow-mixed'
				},
				contractEvent: {
					created_at: 10,
					content: {
						clientPubkey: clientHex,
						freelancerPubkey: freelancerNpub,
						transactionHash: '0xescrowtx'
					}
				},
				statusEvents: []
			}
		]);

		const pendingReviews = await findPendingReviews();

		expect(pendingReviews).toHaveLength(1);
		expect(pendingReviews[0].revieweePubkey).toBe(freelancerNpub);
	});

	it('excludes contracts that the current user already reviewed when reviewer identities mix hex and npub', async () => {
		mockKeys.getNpub.mockResolvedValue(clientNpub);
		mockContracts.getUserContracts.mockResolvedValue([
			{
				status: 'completed',
				escrowData: {
					id: 'escrow-reviewed'
				},
				contractEvent: {
					created_at: 10,
					content: {
						clientPubkey: clientHex,
						freelancerPubkey: freelancerNpub,
						transactionHash: '0xescrowtx'
					}
				},
				statusEvents: []
			}
		]);
		mockReviews.hasUserReviewedEscrow.mockResolvedValue(true);

		const pendingReviews = await findPendingReviews();

		expect(pendingReviews).toEqual([]);
	});

	it('pages through older contracts when pending review discovery spans multiple relay pages', async () => {
		const createContract = (index: number) => ({
			status: 'completed',
			escrowData: {
				id: `escrow-${index}`
			},
			contractEvent: {
				created_at: 1_000 - index,
				content: {
					clientPubkey: 'npub-current',
					freelancerPubkey: `npub-other-${index}`,
					transactionHash: `0xescrowtx-${index}`
				}
			},
			statusEvents: []
		});

		const firstPage = Array.from({ length: 100 }, (_, index) => createContract(index));
		const secondPage = [createContract(100)];
		mockContracts.getUserContracts.mockImplementation((filter?: { until?: number }) => {
			if (filter?.until === 901) {
				return Promise.resolve(secondPage);
			}

			return Promise.resolve(firstPage);
		});

		const pendingReviews = await findPendingReviews();

		expect(mockContracts.getUserContracts).toHaveBeenNthCalledWith(1, { limit: 100 });
		expect(mockContracts.getUserContracts).toHaveBeenNthCalledWith(2, {
			limit: 100,
			until: 901
		});
		expect(pendingReviews).toHaveLength(101);
		expect(pendingReviews[0].escrowId).toBe('escrow-0');
		expect(pendingReviews.at(-1)?.escrowId).toBe('escrow-100');
	});

	it('expands contract pagination when more than one full page shares the same created_at second', async () => {
		const createContract = (index: number) => ({
			status: 'completed',
			escrowData: {
				id: `escrow-same-second-${index}`
			},
			contractEvent: {
				created_at: 1_000,
				content: {
					clientPubkey: 'npub-current',
					freelancerPubkey: `npub-other-${index}`,
					transactionHash: `0xescrowtx-same-${index}`
				}
			},
			statusEvents: []
		});

		const sameSecondContracts = Array.from({ length: 150 }, (_, index) => createContract(index));

		mockContracts.getUserContracts.mockImplementation(
			(filter?: { until?: number; limit?: number }) => {
				if (filter?.until === 1000 && (filter.limit ?? 0) > 100) {
					return Promise.resolve(sameSecondContracts);
				}

				return Promise.resolve(sameSecondContracts.slice(0, 100));
			}
		);

		const pendingReviews = await findPendingReviews();

		expect(mockContracts.getUserContracts).toHaveBeenNthCalledWith(1, { limit: 100 });
		expect(mockContracts.getUserContracts).toHaveBeenNthCalledWith(2, {
			limit: 100,
			until: 1000
		});
		expect(mockContracts.getUserContracts).toHaveBeenNthCalledWith(3, {
			limit: 200,
			until: 1000
		});
		expect(pendingReviews).toHaveLength(150);
	});

	it('uses confirmed completion events to set pending review dates instead of pending acceptance or contract creation time', async () => {
		mockContracts.getUserContracts.mockResolvedValue([
			{
				status: 10,
				escrowData: {
					id: 'escrow-older-complete'
				},
				contractEvent: {
					created_at: 999,
					content: {
						clientPubkey: 'npub-current',
						freelancerPubkey: 'npub-alpha',
						transactionHash: '0xcontracttx-alpha'
					}
				},
				statusEvents: [
					{
						created_at: 500,
						content: {
							action: 11,
							timestamp: 500,
							transactionHash: '0xpending-alpha'
						}
					},
					{
						created_at: 300,
						content: {
							action: 4,
							timestamp: 300,
							transactionHash: '0xcomplete-alpha'
						}
					}
				]
			},
			{
				status: 4,
				escrowData: {
					id: 'escrow-newer-complete'
				},
				contractEvent: {
					created_at: 100,
					content: {
						clientPubkey: 'npub-current',
						freelancerPubkey: 'npub-beta',
						transactionHash: '0xcontracttx-beta'
					}
				},
				statusEvents: [
					{
						created_at: 400,
						content: {
							action: 4,
							timestamp: 400,
							transactionHash: '0xcomplete-beta'
						}
					}
				]
			}
		]);

		const pendingReviews = await findPendingReviews();

		expect(pendingReviews.map((review) => review.escrowId)).toEqual([
			'escrow-newer-complete',
			'escrow-older-complete'
		]);
		expect(pendingReviews[0].completedAt).toBe(400_000);
		expect(pendingReviews[0].escrowTxHash).toBe('0xcomplete-beta');
		expect(pendingReviews[1].completedAt).toBe(300_000);
		expect(pendingReviews[1].escrowTxHash).toBe('0xcomplete-alpha');
	});

	it('selects the latest confirmed completion event regardless of status event ordering', async () => {
		mockContracts.getUserContracts.mockResolvedValue([
			{
				status: 'completed',
				escrowData: {
					id: 'escrow-out-of-order'
				},
				contractEvent: {
					created_at: 100,
					content: {
						clientPubkey: 'npub-current',
						freelancerPubkey: 'npub-other',
						transactionHash: '0xcontracttx'
					}
				},
				statusEvents: [
					{
						created_at: 450,
						content: {
							action: 4,
							timestamp: 450,
							transactionHash: '0xcomplete-newest'
						}
					},
					{
						created_at: 500,
						content: {
							action: 11,
							timestamp: 500,
							transactionHash: '0xpending'
						}
					},
					{
						created_at: 300,
						content: {
							action: 4,
							timestamp: 300,
							transactionHash: '0xcomplete-older'
						}
					}
				]
			}
		]);

		const pendingReviews = await findPendingReviews();

		expect(pendingReviews).toHaveLength(1);
		expect(pendingReviews[0].completedAt).toBe(450_000);
		expect(pendingReviews[0].escrowTxHash).toBe('0xcomplete-newest');
	});

	it('throws when pending review discovery fails instead of returning an empty list', async () => {
		mockContracts.getUserContracts.mockRejectedValue(new Error('relay unavailable'));

		await expect(findPendingReviews()).rejects.toThrow('relay unavailable');
	});

	it('surfaces partial pending-review discovery failures with the successful subset attached', async () => {
		mockContracts.getUserContracts.mockResolvedValue([
			{
				status: 'completed',
				escrowData: {
					id: 'escrow-success'
				},
				contractEvent: {
					created_at: 10,
					content: {
						clientPubkey: 'npub-current',
						freelancerPubkey: 'npub-other-success',
						transactionHash: '0xescrowtx-success'
					}
				},
				statusEvents: []
			},
			{
				status: 'completed',
				escrowData: {
					id: 'escrow-failure'
				},
				contractEvent: {
					created_at: 9,
					content: {
						clientPubkey: 'npub-current',
						freelancerPubkey: 'npub-other-failure',
						transactionHash: '0xescrowtx-failure'
					}
				},
				statusEvents: []
			}
		]);
		mockReviews.hasUserReviewedEscrow.mockImplementation(async (escrowId: string) => {
			if (escrowId === 'escrow-failure') {
				throw new Error('relay timeout');
			}

			return false;
		});

		const result = await findPendingReviews().catch((error) => error);

		expect(result).toBeInstanceOf(PartialPendingReviewsError);
		expect(result.message).toContain('Some pending reviews could not be refreshed');
		expect(result.pendingReviews).toHaveLength(1);
		expect(result.pendingReviews[0].escrowId).toBe('escrow-success');
	});

	it('treats numeric completed and final settled escrow states as reviewable', () => {
		expect(isReviewableContractStatus(4)).toBe(true);
		expect(isReviewableContractStatus(2)).toBe(true);
		expect(isReviewableContractStatus(10)).toBe(true);
		expect(isReviewableContractStatus(8)).toBe(false);
		expect(isReviewableContractStatus(11)).toBe(false);
	});

	it('throws when contract review status cannot be determined', async () => {
		mockReviews.hasUserReviewedEscrow.mockRejectedValue(new Error('review lookup failed'));

		await expect(hasUserReviewedContract('escrow-1')).rejects.toThrow('review lookup failed');
	});

	it('detects reviewed contracts when stored reviewer pubkeys are hex and the user key is npub', async () => {
		mockKeys.getNpub.mockResolvedValue(clientNpub);
		mockReviews.hasUserReviewedEscrow.mockResolvedValue(true);

		await expect(hasUserReviewedContract('escrow-1')).resolves.toBe(true);
	});
});

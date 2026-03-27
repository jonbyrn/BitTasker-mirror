import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockNostr = vi.hoisted(() => ({
	publishEvent: vi.fn(),
	subscribeToEvents: vi.fn()
}));

const mockEscrow = vi.hoisted(() => ({
	escrow: {
		getEscrow: vi.fn()
	}
}));

const mockEscrowUtils = vi.hoisted(() => ({
	EscrowStatus: {
		Completed: 4,
		DisputeResolved: 2
	}
}));

const mockVerification = vi.hoisted(() => ({
	createEscrowCommitment: vi.fn(),
	getCommitmentProof: vi.fn(),
	getLatestTreeVersion: vi.fn(),
	retrieveMerkleTree: vi.fn(),
	verifyReview: vi.fn()
}));

const mockKeys = vi.hoisted(() => ({
	getNpub: vi.fn()
}));

const mockContracts = vi.hoisted(() => ({
	getUserContracts: vi.fn()
}));

vi.mock('../nostr', () => mockNostr);
vi.mock('$lib/utils/wallet/escrow', () => mockEscrow);
vi.mock('$lib/utils/escrow', () => mockEscrowUtils);
vi.mock('$lib/services/review-verification.service', () => mockVerification);
vi.mock('$lib/utils/nostrKeys', () => mockKeys);
vi.mock('../nostr-bid', () => mockContracts);

async function loadReviewModule() {
	vi.resetModules();
	vi.stubEnv('VITE_NOSTR_RELAY_URL', 'wss://relay.example');
	return import('../nostr-review');
}

function createReviewEvent({
	id,
	commitment = 'commitment-1',
	createdAt,
	comment,
	eventPubkey = 'npub-reviewer',
	reviewerPubkey = eventPubkey,
	revieweePubkey = 'npub-reviewee'
}: {
	id: string;
	commitment?: string;
	createdAt: number;
	comment: string;
	eventPubkey?: string;
	reviewerPubkey?: string;
	revieweePubkey?: string;
}) {
	return {
		id,
		kind: 31007,
		created_at: Math.floor(createdAt / 1000),
		pubkey: eventPubkey,
		sig: 'sig',
		tags: [
			['e', 'escrow-1'],
			['p', revieweePubkey],
			['commitment', commitment]
		],
		content: JSON.stringify({
			commitment,
			merkleProof: {
				root: 'root-1',
				leaf: commitment,
				proof: [],
				proofFlags: []
			},
			reviewerPubkey,
			revieweePubkey,
			content: {
				overallRating: 5,
				categoryRatings: {
					quality: 5,
					professionalism: 5,
					timeliness: 5
				},
				comment,
				photos: []
			},
			createdAt
		})
	};
}

describe('nostr-review', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.clearAllMocks();

		mockEscrow.escrow.getEscrow.mockResolvedValue({
			id: 'escrow-1',
			client: 'npub-client',
			freelancer: 'npub-freelancer',
			status: 4
		});

		mockVerification.createEscrowCommitment.mockResolvedValue('commitment-1');
		mockVerification.getLatestTreeVersion.mockResolvedValue('tree-v1');
		mockVerification.retrieveMerkleTree.mockResolvedValue(null);
		mockVerification.getCommitmentProof.mockResolvedValue(
			JSON.stringify({
				root: 'root-1',
				leaf: 'commitment-1',
				proof: [],
				proofFlags: []
			})
		);
		mockVerification.verifyReview.mockResolvedValue({ valid: true });
		mockKeys.getNpub.mockResolvedValue('npub-reviewer');
		mockContracts.getUserContracts.mockResolvedValue([
			{
				contractEvent: {
					content: {
						transactionHash: '0xescrowtx',
						clientPubkey: 'npub-reviewer',
						freelancerPubkey: 'npub-reviewee'
					}
				}
			}
		]);
		mockNostr.publishEvent.mockResolvedValue({ id: 'published-event-id' });
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllEnvs();
	});

	it('returns the published event id and resolves the escrow transaction hash when omitted', async () => {
		const { publishVerifiedReview } = await loadReviewModule();

		const eventId = await publishVerifiedReview('escrow-1', 'npub-reviewee', {
			overallRating: 5,
			categoryRatings: {
				quality: 5,
				professionalism: 4,
				timeliness: 5
			},
			comment: 'Great work'
		});

		expect(eventId).toBe('published-event-id');
		expect(mockContracts.getUserContracts).toHaveBeenCalledWith({
			escrowIds: ['escrow-1'],
			limit: 1
		});
		expect(mockVerification.createEscrowCommitment).toHaveBeenCalledWith(
			'escrow-1',
			'0xescrowtx',
			'npub-client',
			'npub-freelancer'
		);
		expect(mockNostr.publishEvent).toHaveBeenCalledTimes(1);
	});

	it('rejects publish attempts when the current user is not an escrow participant', async () => {
		mockKeys.getNpub.mockResolvedValue('npub-stranger');
		mockContracts.getUserContracts.mockResolvedValue([
			{
				contractEvent: {
					content: {
						transactionHash: '0xescrowtx',
						clientPubkey: 'npub-client',
						freelancerPubkey: 'npub-reviewee'
					}
				}
			}
		]);

		const { publishVerifiedReview } = await loadReviewModule();

		await expect(
			publishVerifiedReview('escrow-1', 'npub-reviewee', {
				overallRating: 5,
				categoryRatings: {
					quality: 5,
					professionalism: 4,
					timeliness: 5
				}
			})
		).rejects.toThrow(/not a participant/i);
	});

	it('rejects publish attempts when the requested reviewee is not the escrow counterparty', async () => {
		const { publishVerifiedReview } = await loadReviewModule();

		await expect(
			publishVerifiedReview('escrow-1', 'npub-third-party', {
				overallRating: 5,
				categoryRatings: {
					quality: 5,
					professionalism: 4,
					timeliness: 5
				}
			})
		).rejects.toThrow(/counterparty/i);
	});

	it('keeps the latest review when multiple events share a commitment for a user', async () => {
		mockNostr.subscribeToEvents.mockImplementation(
			(
				_relayUrl: string,
				_filters: unknown[],
				onEvent: (event: ReturnType<typeof createReviewEvent>) => void
			) => {
				onEvent(
					createReviewEvent({
						id: 'event-old',
						createdAt: 1_700_000_000_000,
						comment: 'Older review'
					})
				);
				onEvent(
					createReviewEvent({
						id: 'event-new',
						createdAt: 1_700_000_100_000,
						comment: 'Latest review'
					})
				);
				return vi.fn();
			}
		);

		const { getReviewsForUser } = await loadReviewModule();
		const reviewsPromise = getReviewsForUser('npub-reviewee', 10);

		await vi.advanceTimersByTimeAsync(10_000);
		const reviews = await reviewsPromise;

		expect(reviews).toHaveLength(1);
		expect(reviews[0].nostrEventId).toBe('event-new');
		expect(reviews[0].content.comment).toBe('Latest review');
	});

	it('keeps the latest escrow review regardless of relay delivery order', async () => {
		mockNostr.subscribeToEvents.mockImplementation(
			(
				_relayUrl: string,
				_filters: unknown[],
				onEvent: (event: ReturnType<typeof createReviewEvent>) => void
			) => {
				onEvent(
					createReviewEvent({
						id: 'event-new',
						createdAt: 1_700_000_100_000,
						comment: 'Latest review'
					})
				);
				onEvent(
					createReviewEvent({
						id: 'event-old',
						createdAt: 1_700_000_000_000,
						comment: 'Older review'
					})
				);
				return vi.fn();
			}
		);

		const { getReviewsForEscrow } = await loadReviewModule();
		const reviewsPromise = getReviewsForEscrow('escrow-1');

		await vi.advanceTimersByTimeAsync(10_000);
		const reviews = await reviewsPromise;

		expect(reviews).toHaveLength(1);
		expect(reviews[0].nostrEventId).toBe('event-new');
		expect(reviews[0].content.comment).toBe('Latest review');
	});

	it('keeps both reviewers when the same escrow commitment has two valid reviews', async () => {
		mockNostr.subscribeToEvents.mockImplementation(
			(
				_relayUrl: string,
				_filters: unknown[],
				onEvent: (event: ReturnType<typeof createReviewEvent>) => void
			) => {
				onEvent(
					createReviewEvent({
						id: 'event-client',
						commitment: 'commitment-shared',
						createdAt: 1_700_000_000_000,
						comment: 'Client review',
						eventPubkey: 'npub-client',
						reviewerPubkey: 'npub-client'
					})
				);
				onEvent(
					createReviewEvent({
						id: 'event-freelancer',
						commitment: 'commitment-shared',
						createdAt: 1_700_000_050_000,
						comment: 'Freelancer review',
						eventPubkey: 'npub-freelancer',
						reviewerPubkey: 'npub-freelancer'
					})
				);
				return vi.fn();
			}
		);

		const { getReviewsForEscrow } = await loadReviewModule();
		const reviewsPromise = getReviewsForEscrow('escrow-1');

		await vi.advanceTimersByTimeAsync(10_000);
		const reviews = await reviewsPromise;

		expect(reviews).toHaveLength(2);
		expect(reviews.map((review) => review.nostrEventId).sort()).toEqual([
			'event-client',
			'event-freelancer'
		]);
	});

	it('rejects forged reviewer payloads and keeps the signed event identity authoritative', async () => {
		mockNostr.subscribeToEvents.mockImplementation(
			(
				_relayUrl: string,
				_filters: unknown[],
				onEvent: (event: ReturnType<typeof createReviewEvent>) => void
			) => {
				onEvent(
					createReviewEvent({
						id: 'event-forged',
						createdAt: 1_700_000_000_000,
						comment: 'Forged review',
						eventPubkey: 'npub-real-reviewer',
						reviewerPubkey: 'npub-forged-reviewer'
					})
				);
				return vi.fn();
			}
		);

		const { getReviewsForEscrow } = await loadReviewModule();
		const reviewsPromise = getReviewsForEscrow('escrow-1');

		await vi.advanceTimersByTimeAsync(10_000);
		await expect(reviewsPromise).resolves.toEqual([]);
	});

	it('resolves review queries on EOSE without waiting for the timeout', async () => {
		mockNostr.subscribeToEvents.mockImplementation(
			(
				_relayUrl: string,
				_filters: unknown[],
				onEvent: (event: ReturnType<typeof createReviewEvent>) => void,
				onEose?: () => void
			) => {
				onEvent(
					createReviewEvent({
						id: 'event-eose',
						createdAt: 1_700_000_000_000,
						comment: 'EOSE review'
					})
				);
				onEose?.();
				return vi.fn();
			}
		);

		const { getReviewsForUser } = await loadReviewModule();
		const reviews = await getReviewsForUser('npub-reviewee', 10);

		expect(reviews).toHaveLength(1);
		expect(reviews[0].nostrEventId).toBe('event-eose');
	});

	it('reports that a user reviewed an escrow when the latest review matches the reviewer', async () => {
		mockNostr.subscribeToEvents.mockImplementation(
			(
				_relayUrl: string,
				_filters: unknown[],
				onEvent: (event: ReturnType<typeof createReviewEvent>) => void
			) => {
				onEvent(
					createReviewEvent({
						id: 'event-reviewed',
						createdAt: 1_700_000_100_000,
						comment: 'Latest review'
					})
				);
				return vi.fn();
			}
		);

		const { hasUserReviewedEscrow } = await loadReviewModule();
		const reviewedPromise = hasUserReviewedEscrow('escrow-1', 'npub-reviewer');

		await vi.advanceTimersByTimeAsync(10_000);
		await expect(reviewedPromise).resolves.toBe(true);
	});
});

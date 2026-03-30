import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Filter } from 'nostr-tools';
import { nip19 } from 'nostr-tools';

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
		DisputeResolved: 2,
		FundsReleased: 10
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
	const clientHex = 'a'.repeat(64);
	const freelancerHex = 'b'.repeat(64);
	const clientNpub = nip19.npubEncode(clientHex);
	const freelancerNpub = nip19.npubEncode(freelancerHex);

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
		mockKeys.getNpub.mockResolvedValue(clientNpub);
		mockContracts.getUserContracts.mockResolvedValue([
			{
				contractEvent: {
					content: {
						transactionHash: '0xescrowtx',
						clientPubkey: clientHex,
						freelancerPubkey: freelancerNpub
					}
				}
			}
		]);
		mockNostr.publishEvent.mockResolvedValue({ id: 'published-event-id' });
		mockNostr.subscribeToEvents.mockImplementation(
			(
				_relayUrl: string,
				_filters: unknown[],
				_onEvent: (event: ReturnType<typeof createReviewEvent>) => void,
				onEose?: () => void
			) => {
				onEose?.();
				return vi.fn();
			}
		);
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllEnvs();
	});

	it('returns the published event id and resolves the escrow transaction hash when omitted', async () => {
		const { publishVerifiedReview } = await loadReviewModule();

		const eventId = await publishVerifiedReview('escrow-1', freelancerNpub, {
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

	it('allows publishing reviews for final FundsReleased escrows', async () => {
		mockEscrow.escrow.getEscrow.mockResolvedValue({
			id: 'escrow-1',
			client: 'npub-client',
			freelancer: 'npub-freelancer',
			status: 10
		});

		const { publishVerifiedReview } = await loadReviewModule();

		await expect(
			publishVerifiedReview('escrow-1', freelancerNpub, {
				overallRating: 5,
				categoryRatings: {
					quality: 5,
					professionalism: 4,
					timeliness: 5
				}
			})
		).resolves.toBe('published-event-id');
	});

	it('rejects malformed review content before publishing', async () => {
		const { publishVerifiedReview } = await loadReviewModule();

		await expect(
			publishVerifiedReview('escrow-1', freelancerNpub, {
				overallRating: 5,
				categoryRatings: {
					workQuality: 5,
					experience: 4,
					deliverySpeed: 5
				},
				revieweeRole: 'tasker'
			})
		).rejects.toThrow(/invalid review content/i);

		expect(mockNostr.publishEvent).not.toHaveBeenCalled();
	});

	it('publishes the reviewee p-tag in normalized hex format for mixed-format counterparties', async () => {
		const { publishVerifiedReview } = await loadReviewModule();

		await publishVerifiedReview('escrow-1', freelancerNpub, {
			overallRating: 5,
			categoryRatings: {
				quality: 5,
				professionalism: 4,
				timeliness: 5
			}
		});

		expect(mockNostr.publishEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				tags: expect.arrayContaining([['p', freelancerHex]])
			})
		);
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

	it('rejects attempts to update a published review because reviews are immutable', async () => {
		const { updateVerifiedReview } = await loadReviewModule();

		await expect(
			updateVerifiedReview(
				'event-1',
				'escrow-1',
				freelancerNpub,
				{
					overallRating: 5,
					categoryRatings: {
						quality: 5,
						professionalism: 4,
						timeliness: 5
					}
				},
				'0xescrowtx'
			)
		).rejects.toThrow(/immutable/i);
		expect(mockEscrow.escrow.getEscrow).not.toHaveBeenCalled();
		expect(mockNostr.publishEvent).not.toHaveBeenCalled();
	});

	it('rejects duplicate review submissions before publishing a new review event', async () => {
		mockNostr.subscribeToEvents.mockImplementation(
			(
				_relayUrl: string,
				_filters: unknown[],
				onEvent: (event: ReturnType<typeof createReviewEvent>) => void,
				onEose?: () => void
			) => {
				onEvent(
					createReviewEvent({
						id: 'event-reviewed',
						createdAt: 1_700_000_000_000,
						comment: 'Already reviewed',
						eventPubkey: clientHex,
						reviewerPubkey: clientHex
					})
				);
				onEose?.();
				return vi.fn();
			}
		);

		const { publishVerifiedReview } = await loadReviewModule();

		await expect(
			publishVerifiedReview('escrow-1', freelancerNpub, {
				overallRating: 5,
				categoryRatings: {
					quality: 5,
					professionalism: 4,
					timeliness: 5
				}
			})
		).rejects.toThrow(/already reviewed/i);
		expect(mockNostr.publishEvent).not.toHaveBeenCalled();
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

	it('queries received reviews using both the normalized hex and original npub p-tags', async () => {
		let capturedFilters: unknown[] = [];
		mockNostr.subscribeToEvents.mockImplementation(
			(
				_relayUrl: string,
				filters: unknown[],
				onEvent: (event: ReturnType<typeof createReviewEvent>) => void,
				onEose?: () => void
			) => {
				capturedFilters = filters;
				onEvent(
					createReviewEvent({
						id: 'event-npub-tagged',
						createdAt: 1_700_000_000_000,
						comment: 'Tagged with npub',
						revieweePubkey: freelancerNpub
					})
				);
				onEose?.();
				return vi.fn();
			}
		);

		const { getReviewsForUser } = await loadReviewModule();
		const reviews = await getReviewsForUser(freelancerNpub, 10);

		expect(capturedFilters).toEqual([
			expect.objectContaining({
				'#p': [freelancerHex, freelancerNpub]
			})
		]);
		expect(reviews).toHaveLength(1);
		expect(reviews[0].revieweePubkey).toBe(freelancerNpub);
	});

	it('uses the signed Nostr event timestamp for review ordering metadata', async () => {
		mockNostr.subscribeToEvents.mockImplementation(
			(
				_relayUrl: string,
				_filters: unknown[],
				onEvent: (event: ReturnType<typeof createReviewEvent>) => void,
				onEose?: () => void
			) => {
				onEvent({
					...createReviewEvent({
						id: 'event-signed-time',
						createdAt: 1_900_000_000_000,
						comment: 'Signed timestamp wins'
					}),
					created_at: Math.floor(1_700_000_000_000 / 1000)
				});
				onEose?.();
				return vi.fn();
			}
		);

		const { getReviewsForUser } = await loadReviewModule();
		const reviews = await getReviewsForUser('npub-reviewee', 10);

		expect(reviews[0].createdAt).toBe(1_700_000_000_000);
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

	it('paginates escrow review queries past the first relay page', async () => {
		const firstPageEvents = Array.from({ length: 100 }, (_, index) =>
			createReviewEvent({
				id: `event-page-1-${index}`,
				commitment: `commitment-page-1-${index}`,
				createdAt: 1_700_000_100_000 - index * 1000,
				comment: `Review ${index}`
			})
		);
		const secondPageEvent = createReviewEvent({
			id: 'event-page-2',
			commitment: 'commitment-page-2',
			createdAt: 1_700_000_000_000,
			comment: 'Older paginated review'
		});
		const capturedFilters: Filter[] = [];

		mockNostr.subscribeToEvents.mockImplementation(
			(
				_relayUrl: string,
				filters: Filter[],
				onEvent: (event: ReturnType<typeof createReviewEvent>) => void,
				onEose?: () => void
			) => {
				const filter = filters[0] ?? {};
				capturedFilters.push(filter);

				if (filter.until === 1700000001 && filter.limit === 200) {
					onEvent(secondPageEvent);
				} else {
					for (const event of firstPageEvents) {
						onEvent(event);
					}
				}

				onEose?.();
				return vi.fn();
			}
		);

		const { getReviewsForEscrow } = await loadReviewModule();
		const reviews = await getReviewsForEscrow('escrow-1');

		expect(capturedFilters).toEqual([
			expect.objectContaining({
				'#e': ['escrow-1'],
				limit: 100
			}),
			expect.objectContaining({
				'#e': ['escrow-1'],
				limit: 100,
				until: 1700000001
			}),
			expect.objectContaining({
				'#e': ['escrow-1'],
				limit: 200,
				until: 1700000001
			})
		]);
		expect(reviews).toHaveLength(101);
		expect(reviews.at(-1)?.nostrEventId).toBe('event-page-2');
	});

	it('continues paging when the first relay page dedupes below the page size', async () => {
		const firstPageEvents = Array.from({ length: 100 }, (_, index) =>
			createReviewEvent({
				id: `event-dedup-page-1-${index}`,
				commitment: index < 2 ? 'commitment-shared-dedup' : `commitment-dedup-${index}`,
				createdAt: 1_700_000_100_000 - index * 1000,
				comment: `Review ${index}`
			})
		);
		const secondPageEvent = createReviewEvent({
			id: 'event-dedup-page-2',
			commitment: 'commitment-dedup-page-2',
			createdAt: 1_700_000_000_000,
			comment: 'Older paginated review after dedupe'
		});
		const capturedFilters: Filter[] = [];

		mockNostr.subscribeToEvents.mockImplementation(
			(
				_relayUrl: string,
				filters: Filter[],
				onEvent: (event: ReturnType<typeof createReviewEvent>) => void,
				onEose?: () => void
			) => {
				const filter = filters[0] ?? {};
				capturedFilters.push(filter);

				if (filter.until === 1700000001 && filter.limit === 200) {
					onEvent(secondPageEvent);
				} else {
					for (const event of firstPageEvents) {
						onEvent(event);
					}
				}

				onEose?.();
				return vi.fn();
			}
		);

		const { getReviewsForEscrow } = await loadReviewModule();
		const reviews = await getReviewsForEscrow('escrow-1');

		expect(capturedFilters).toHaveLength(3);
		expect(reviews.some((review) => review.nostrEventId === 'event-dedup-page-2')).toBe(true);
	});

	it('expands the page size when more than one full page shares the same timestamp second', async () => {
		const sameSecondEvents = Array.from({ length: 150 }, (_, index) =>
			createReviewEvent({
				id: `event-same-second-${index}`,
				commitment: `commitment-same-second-${index}`,
				createdAt: 1_700_000_000_000,
				comment: `Same second ${index}`
			})
		);
		const capturedFilters: Filter[] = [];

		mockNostr.subscribeToEvents.mockImplementation(
			(
				_relayUrl: string,
				filters: Filter[],
				onEvent: (event: ReturnType<typeof createReviewEvent>) => void,
				onEose?: () => void
			) => {
				const filter = filters[0] ?? {};
				capturedFilters.push(filter);
				const limit = typeof filter.limit === 'number' ? filter.limit : 100;
				const events =
					filter.until === 1700000000 && limit > 100
						? sameSecondEvents
						: sameSecondEvents.slice(0, 100);

				for (const event of events.slice(0, limit)) {
					onEvent(event);
				}

				onEose?.();
				return vi.fn();
			}
		);

		const { getReviewsForUser } = await loadReviewModule();
		const reviews = await getReviewsForUser('npub-reviewee', Number.MAX_SAFE_INTEGER);

		expect(reviews).toHaveLength(150);
		expect(capturedFilters).toEqual([
			expect.objectContaining({ limit: 100 }),
			expect.objectContaining({ until: 1700000000, limit: 100 }),
			expect.objectContaining({ until: 1700000000, limit: 200 })
		]);
	});

	it('continues paging past a full malformed first page to reach older valid reviews', async () => {
		const malformedEvents = Array.from({ length: 100 }, (_, index) => ({
			...createReviewEvent({
				id: `event-malformed-page-${index}`,
				createdAt: 1_700_000_000_000,
				comment: `Malformed ${index}`
			}),
			content: JSON.stringify({
				commitment: 42,
				merkleProof: {
					root: 'root-1',
					leaf: 'commitment-1',
					proof: 'not-an-array',
					proofFlags: []
				},
				reviewerPubkey: clientHex,
				revieweePubkey: freelancerNpub,
				content: {
					overallRating: 5,
					categoryRatings: {
						quality: 5,
						professionalism: 5,
						timeliness: 5
					}
				},
				createdAt: 1_700_000_000_000
			})
		}));
		const olderValidEvent = createReviewEvent({
			id: 'event-valid-older',
			createdAt: 1_699_999_000_000,
			comment: 'Older valid review'
		});

		mockNostr.subscribeToEvents.mockImplementation(
			(
				_relayUrl: string,
				filters: Filter[],
				onEvent: (event: ReturnType<typeof createReviewEvent>) => void,
				onEose?: () => void
			) => {
				const filter = filters[0] ?? {};
				const limit = typeof filter.limit === 'number' ? filter.limit : 100;
				const events =
					filter.until === 1700000000 && limit > 100
						? [...malformedEvents, olderValidEvent]
						: malformedEvents;

				for (const event of events.slice(0, limit)) {
					onEvent(event);
				}

				onEose?.();
				return vi.fn();
			}
		);

		const { getReviewsForUser } = await loadReviewModule();
		const reviews = await getReviewsForUser(freelancerNpub, Number.MAX_SAFE_INTEGER);

		expect(reviews).toEqual([
			expect.objectContaining({
				nostrEventId: 'event-valid-older'
			})
		]);
	});

	it('continues paging escrow reviews until it can prove the reviewer already submitted one', async () => {
		const firstPageEvents = Array.from({ length: 100 }, (_, index) =>
			createReviewEvent({
				id: `event-reviewer-page-1-${index}`,
				commitment: `commitment-reviewer-page-1-${index}`,
				createdAt: 1_700_000_100_000 - index * 1000,
				comment: `Review ${index}`,
				eventPubkey: freelancerHex,
				reviewerPubkey: freelancerHex
			})
		);
		const reviewerMatch = createReviewEvent({
			id: 'event-reviewer-match',
			commitment: 'commitment-reviewer-match',
			createdAt: 1_700_000_000_000,
			comment: 'Found reviewer',
			eventPubkey: clientHex,
			reviewerPubkey: clientHex
		});
		const capturedFilters: Filter[] = [];

		mockNostr.subscribeToEvents.mockImplementation(
			(
				_relayUrl: string,
				filters: Filter[],
				onEvent: (event: ReturnType<typeof createReviewEvent>) => void,
				onEose?: () => void
			) => {
				const filter = filters[0] ?? {};
				capturedFilters.push(filter);

				if (filter.until === 1700000001 && filter.limit === 200) {
					onEvent(reviewerMatch);
				} else {
					for (const event of firstPageEvents) {
						onEvent(event);
					}
				}

				onEose?.();
				return vi.fn();
			}
		);

		const { hasUserReviewedEscrow } = await loadReviewModule();

		await expect(hasUserReviewedEscrow('escrow-1', clientNpub)).resolves.toBe(true);
		expect(capturedFilters).toEqual([
			expect.objectContaining({
				'#e': ['escrow-1'],
				limit: 100
			}),
			expect.objectContaining({
				'#e': ['escrow-1'],
				limit: 100,
				until: 1700000001
			}),
			expect.objectContaining({
				'#e': ['escrow-1'],
				limit: 200,
				until: 1700000001
			})
		]);
	});

	it('expands escrow-review pagination when the matching review sits beyond a same-second page boundary', async () => {
		const sameSecondEvents = Array.from({ length: 150 }, (_, index) =>
			createReviewEvent({
				id: `event-same-escrow-${index}`,
				commitment: `commitment-same-escrow-${index}`,
				createdAt: 1_700_000_000_000,
				comment: `Escrow review ${index}`,
				eventPubkey: index === 149 ? clientHex : freelancerHex,
				reviewerPubkey: index === 149 ? clientHex : freelancerHex
			})
		);

		mockNostr.subscribeToEvents.mockImplementation(
			(
				_relayUrl: string,
				filters: Filter[],
				onEvent: (event: ReturnType<typeof createReviewEvent>) => void,
				onEose?: () => void
			) => {
				const filter = filters[0] ?? {};
				const limit = typeof filter.limit === 'number' ? filter.limit : 100;
				const events =
					filter.until === 1700000000 && limit > 100
						? sameSecondEvents
						: sameSecondEvents.slice(0, 100);

				for (const event of events.slice(0, limit)) {
					onEvent(event);
				}

				onEose?.();
				return vi.fn();
			}
		);

		const { hasUserReviewedEscrow } = await loadReviewModule();

		await expect(hasUserReviewedEscrow('escrow-1', clientNpub)).resolves.toBe(true);
	});

	it('includes the escrow id from the e tag when parsing reviews', async () => {
		mockNostr.subscribeToEvents.mockImplementation(
			(
				_relayUrl: string,
				_filters: Filter[],
				onEvent: (event: ReturnType<typeof createReviewEvent>) => void,
				onEose?: () => void
			) => {
				onEvent(
					createReviewEvent({
						id: 'event-with-escrow-context',
						createdAt: 1_700_000_000_000,
						comment: 'Escrow context review'
					})
				);
				onEose?.();
				return vi.fn();
			}
		);

		const { getReviewsByReviewer } = await loadReviewModule();
		const reviews = await getReviewsByReviewer('npub-reviewer', 10);

		expect(reviews).toEqual([
			expect.objectContaining({
				escrowId: 'escrow-1'
			})
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

	it('rejects malformed fullContent reviews instead of returning invalid aggregates', async () => {
		mockNostr.subscribeToEvents.mockImplementation(
			(
				_relayUrl: string,
				_filters: unknown[],
				onEvent: (event: ReturnType<typeof createReviewEvent>) => void,
				onEose?: () => void
			) => {
				onEvent({
					...createReviewEvent({
						id: 'event-malformed-full-content',
						createdAt: 1_700_000_000_000,
						comment: 'Malformed fullContent review'
					}),
					content: JSON.stringify({
						commitment: 'commitment-malformed',
						merkleProof: {
							root: 'root-1',
							leaf: 'commitment-malformed',
							proof: [],
							proofFlags: []
						},
						reviewerPubkey: clientHex,
						revieweePubkey: freelancerNpub,
						content: {
							overallRating: 5,
							categoryRatings: {
								quality: 5,
								professionalism: 5,
								timeliness: 5
							},
							comment: 'Legacy content'
						},
						fullContent: {
							overallRating: 11,
							categoryRatings: {
								workQuality: 0,
								experience: 'bad',
								deliverySpeed: 5
							},
							revieweeRole: 'taskee'
						},
						createdAt: 1_700_000_000_000
					})
				});
				onEose?.();
				return vi.fn();
			}
		);

		const { getReviewsForUser } = await loadReviewModule();
		const reviews = await getReviewsForUser(freelancerNpub, 10);

		expect(reviews).toEqual([]);
	});

	it('rejects review events with malformed proof or missing commitment metadata', async () => {
		mockNostr.subscribeToEvents.mockImplementation(
			(
				_relayUrl: string,
				_filters: unknown[],
				onEvent: (event: ReturnType<typeof createReviewEvent>) => void,
				onEose?: () => void
			) => {
				onEvent({
					...createReviewEvent({
						id: 'event-malformed-proof',
						createdAt: 1_700_000_000_000,
						comment: 'Malformed proof review',
						eventPubkey: clientHex,
						reviewerPubkey: clientHex,
						revieweePubkey: freelancerNpub
					}),
					content: JSON.stringify({
						commitment: 42,
						merkleProof: {
							root: 'root-1',
							leaf: 'commitment-1',
							proof: 'not-an-array',
							proofFlags: []
						},
						reviewerPubkey: clientHex,
						revieweePubkey: freelancerNpub,
						content: {
							overallRating: 5,
							categoryRatings: {
								quality: 5,
								professionalism: 5,
								timeliness: 5
							},
							comment: 'Legacy content'
						},
						createdAt: 1_700_000_000_000
					})
				});
				onEose?.();
				return vi.fn();
			}
		);

		const { getReviewsForUser } = await loadReviewModule();
		const reviews = await getReviewsForUser(freelancerNpub, 10);

		expect(reviews).toEqual([]);
	});

	it('rejects review events that omit the reviewee identity entirely', async () => {
		mockNostr.subscribeToEvents.mockImplementation(
			(
				_relayUrl: string,
				_filters: unknown[],
				onEvent: (event: ReturnType<typeof createReviewEvent>) => void,
				onEose?: () => void
			) => {
				onEvent({
					...createReviewEvent({
						id: 'event-missing-reviewee',
						createdAt: 1_700_000_000_000,
						comment: 'Missing reviewee',
						eventPubkey: clientHex,
						reviewerPubkey: clientHex,
						revieweePubkey: freelancerNpub
					}),
					tags: [
						['e', 'escrow-1'],
						['commitment', 'commitment-1']
					],
					content: JSON.stringify({
						commitment: 'commitment-1',
						merkleProof: {
							root: 'root-1',
							leaf: 'commitment-1',
							proof: [],
							proofFlags: []
						},
						reviewerPubkey: clientHex,
						content: {
							overallRating: 5,
							categoryRatings: {
								quality: 5,
								professionalism: 5,
								timeliness: 5
							},
							comment: 'Legacy content'
						},
						createdAt: 1_700_000_000_000
					})
				});
				onEose?.();
				return vi.fn();
			}
		);

		const { getReviewsForEscrow } = await loadReviewModule();
		const reviews = await getReviewsForEscrow('escrow-1');

		expect(reviews).toEqual([]);
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

	it('closes review subscriptions when EOSE fires before unsubscribe is returned', async () => {
		const unsubscribe = vi.fn();
		mockNostr.subscribeToEvents.mockImplementation(
			(
				_relayUrl: string,
				_filters: unknown[],
				onEvent: (event: ReturnType<typeof createReviewEvent>) => void,
				onEose?: () => void
			) => {
				onEvent(
					createReviewEvent({
						id: 'event-sync-eose',
						createdAt: 1_700_000_000_000,
						comment: 'EOSE review'
					})
				);
				onEose?.();
				return unsubscribe;
			}
		);

		const { getReviewsForUser } = await loadReviewModule();
		const reviews = await getReviewsForUser('npub-reviewee', 10);

		expect(reviews).toHaveLength(1);
		expect(unsubscribe).toHaveBeenCalledTimes(1);
	});

	it('closes event-id subscriptions when a synchronous EOSE returns no review', async () => {
		const unsubscribe = vi.fn();
		mockNostr.subscribeToEvents.mockImplementation(
			(
				_relayUrl: string,
				_filters: unknown[],
				_onEvent: (event: ReturnType<typeof createReviewEvent>) => void,
				onEose?: () => void
			) => {
				onEose?.();
				return unsubscribe;
			}
		);

		const { getReviewByEventId } = await loadReviewModule();
		const review = await getReviewByEventId('missing-event');

		expect(review).toBeNull();
		expect(unsubscribe).toHaveBeenCalledTimes(1);
	});

	it('closes event-id subscriptions when a synchronous event resolves before unsubscribe is returned', async () => {
		const unsubscribe = vi.fn();
		mockNostr.subscribeToEvents.mockImplementation(
			(
				_relayUrl: string,
				_filters: unknown[],
				onEvent: (event: ReturnType<typeof createReviewEvent>) => void
			) => {
				onEvent(
					createReviewEvent({
						id: 'event-direct-hit',
						createdAt: 1_700_000_000_000,
						comment: 'Direct match'
					})
				);
				return unsubscribe;
			}
		);

		const { getReviewByEventId } = await loadReviewModule();
		const review = await getReviewByEventId('event-direct-hit');

		expect(review?.nostrEventId).toBe('event-direct-hit');
		expect(unsubscribe).toHaveBeenCalledTimes(1);
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
						comment: 'Latest review',
						eventPubkey: clientHex,
						reviewerPubkey: clientHex
					})
				);
				return vi.fn();
			}
		);

		const { hasUserReviewedEscrow } = await loadReviewModule();
		const reviewedPromise = hasUserReviewedEscrow('escrow-1', clientNpub);

		await vi.advanceTimersByTimeAsync(10_000);
		await expect(reviewedPromise).resolves.toBe(true);
	});
});

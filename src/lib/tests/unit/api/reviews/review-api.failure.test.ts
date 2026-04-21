import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	REVIEW_NOSTR_KINDS,
	REVIEWS_SCHEMA_VERSION,
	buildReviewAttestationChallengeMessage,
	buildReviewFixture,
	computeReviewDraftHash,
	reviewEventPayloadSchema
} from '@reviews-contracts';

const hoisted = vi.hoisted(() => {
	return {
		getSignedEvent: vi.fn(),
		publishToMultipleRelays: vi.fn(),
		getNostrKeyPair: vi.fn(),
		getNpub: vi.fn(),
		getWallet: vi.fn()
	};
});

vi.mock('$lib/utils/nostr', () => ({
	getSignedEvent: (...args: Parameters<typeof hoisted.getSignedEvent>) =>
		hoisted.getSignedEvent(...args),
	publishToMultipleRelays: (...args: Parameters<typeof hoisted.publishToMultipleRelays>) =>
		hoisted.publishToMultipleRelays(...args)
}));

vi.mock('$lib/utils/nostrKeys', () => ({
	getNostrKeyPair: (...args: Parameters<typeof hoisted.getNostrKeyPair>) =>
		hoisted.getNostrKeyPair(...args),
	getNpub: (...args: Parameters<typeof hoisted.getNpub>) => hoisted.getNpub(...args)
}));

vi.mock('$lib/stores/wallet.store', () => ({
	getWallet: (...args: Parameters<typeof hoisted.getWallet>) => hoisted.getWallet(...args)
}));

describe('review api failure matrix', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
		vi.stubEnv('VITE_REVIEW_ATTESTATION_API_URL', 'https://reviews-api.example.test');
		window.localStorage.clear();
		(globalThis as unknown as Record<string, unknown>).__reviewsPublishOutbox = [];
		hoisted.getSignedEvent.mockReset();
		hoisted.publishToMultipleRelays.mockReset();
		hoisted.getNostrKeyPair.mockReset();
		hoisted.getWallet.mockReset();
	});

	async function buildReviewAndContext() {
		const reviewerPubkey = '4f355bdcb7cc0af728ef3cceb9615d90684bb5b2ca5f859ab0f0b704075871aa';
		const revieweePubkey = '466d7fcae563e5cb09a0d1870bb580344804617879a14949cf22285f1bae3f27';
		const reviewerWallet = {
			address: '0x0000000000000000000000000000000000000555',
			signMessage: vi.fn(async () => `0x${'5'.repeat(130)}`)
		};
		hoisted.getNostrKeyPair.mockResolvedValue({
			nsec: new Uint8Array(32).fill(1),
			npub: reviewerPubkey
		});
		const review = reviewEventPayloadSchema.parse({
			...buildReviewFixture({
				subjectType: 'service_booking',
				settlementType: 'service_quote_contract',
				revieweePubkey,
				reviewerRole: 'client',
				revieweeRole: 'provider',
				contractOutcome: 'completed',
				createdAt: 1_700_000_000
			}),
			reviewDraftHash: await computeReviewDraftHash(
				buildReviewFixture({
					subjectType: 'service_booking',
					settlementType: 'service_quote_contract',
					revieweePubkey,
					reviewerRole: 'client',
					revieweeRole: 'provider',
					contractOutcome: 'completed',
					createdAt: 1_700_000_000
				})
			)
		});

		hoisted.getSignedEvent.mockImplementation(async (unsignedEvent) => ({
			kind: REVIEW_NOSTR_KINDS.REVIEW,
			created_at: unsignedEvent.created_at,
			tags: unsignedEvent.tags,
			content: unsignedEvent.content,
			pubkey: reviewerPubkey,
			id: `${String(unsignedEvent.content).slice(0, 63)}a`,
			sig: 'f'.repeat(128)
		}));

		return {
			review,
			reviewerPubkey,
			revieweePubkey,
			reviewerWallet
		};
	}

	it('fails closed when the API URL is missing', async () => {
		const { review, reviewerPubkey, revieweePubkey, reviewerWallet } =
			await buildReviewAndContext();
		vi.stubEnv('VITE_REVIEW_ATTESTATION_API_URL', '');
		const { submitAttestedReview } = await import('$lib/api/reviews/review-api');

		await expect(
			submitAttestedReview({
				review,
				subjectId: 'service-123',
				settlementId: 'escrow-123',
				chain: 'rsk',
				asset: 'rbtc',
				contractAddress: '0x0000000000000000000000000000000000000123',
				reviewerWallet: reviewerWallet.address,
				revieweeWallet: '0x0000000000000000000000000000000000000bbb',
				reviewerNpub: reviewerPubkey,
				revieweeNpub: revieweePubkey
			})
		).rejects.toThrow('Review attestation API is not configured');
	}, 15000);

	it('surfaces non-200 challenge responses', async () => {
		const { review, reviewerPubkey, revieweePubkey, reviewerWallet } =
			await buildReviewAndContext();
		hoisted.getWallet.mockReturnValue(reviewerWallet);
		hoisted.publishToMultipleRelays.mockResolvedValue([
			{ relay: 'wss://relay.example.test', success: true }
		]);
		vi.stubGlobal(
			'fetch',
			vi.fn(async (input: RequestInfo | URL) => {
				const url = String(input);
				if (url.endsWith('/review-attestations/challenge')) {
					return new Response(
						JSON.stringify({
							code: 'issuer_unavailable',
							message: 'Issuer registry temporarily unavailable'
						}),
						{ status: 503 }
					);
				}

				throw new Error(`Unexpected fetch url: ${url}`);
			})
		);

		const { submitAttestedReview } = await import('$lib/api/reviews/review-api');
		await expect(
			submitAttestedReview({
				review,
				subjectId: 'service-123',
				settlementId: 'escrow-123',
				chain: 'rsk',
				asset: 'rbtc',
				contractAddress: '0x0000000000000000000000000000000000000123',
				reviewerWallet: reviewerWallet.address,
				revieweeWallet: '0x0000000000000000000000000000000000000bbb',
				reviewerNpub: reviewerPubkey,
				revieweeNpub: revieweePubkey
			})
		).rejects.toThrow('Issuer registry temporarily unavailable');
	});

	it('fails closed when the challenge response omits the signing message', async () => {
		const { review, reviewerPubkey, revieweePubkey, reviewerWallet } =
			await buildReviewAndContext();
		hoisted.getWallet.mockReturnValue(reviewerWallet);
		hoisted.publishToMultipleRelays.mockResolvedValue([
			{ relay: 'wss://relay.example.test', success: true }
		]);
		vi.stubGlobal(
			'fetch',
			vi.fn(async (input: RequestInfo | URL) => {
				const url = String(input);
				if (url.endsWith('/review-attestations/challenge')) {
					return new Response(
						JSON.stringify({
							schemaVersion: REVIEWS_SCHEMA_VERSION,
							challengeId: 'challenge-missing-message',
							challengeToken: `v1.${'f'.repeat(24)}.${'a'.repeat(128)}`,
							issuedAt: 1_700_000_000,
							expiresAt: 1_700_000_300
						}),
						{ status: 200 }
					);
				}

				throw new Error(`Unexpected fetch url: ${url}`);
			})
		);

		const { submitAttestedReview } = await import('$lib/api/reviews/review-api');
		await expect(
			submitAttestedReview({
				review,
				subjectId: 'service-123',
				settlementId: 'escrow-123',
				chain: 'rsk',
				asset: 'rbtc',
				contractAddress: '0x0000000000000000000000000000000000000123',
				reviewerWallet: reviewerWallet.address,
				revieweeWallet: '0x0000000000000000000000000000000000000bbb',
				reviewerNpub: reviewerPubkey,
				revieweeNpub: revieweePubkey
			})
		).rejects.toThrow();
		expect(hoisted.publishToMultipleRelays).not.toHaveBeenCalled();
	});

	it('preserves structured backend error data for retry handling', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async (input: RequestInfo | URL) => {
				const url = String(input);
				if (url.endsWith('/review-attestation-issuers')) {
					return new Response(
						JSON.stringify({
							schemaVersion: REVIEWS_SCHEMA_VERSION,
							status: 'error',
							code: 'rate_limited',
							message: 'Slow down',
							retryAfterSeconds: 42
						}),
						{
							status: 429,
							headers: {
								'content-type': 'application/json',
								'retry-after': '42'
							}
						}
					);
				}

				throw new Error(`Unexpected fetch url: ${url}`);
			})
		);

		const { loadIssuerRegistry, ReviewApiRequestError } = await import(
			'$lib/api/reviews/review-api'
		);

		await expect(loadIssuerRegistry()).rejects.toMatchObject({
			name: 'ReviewApiRequestError',
			message: 'Slow down',
			status: 429,
			code: 'rate_limited',
			retryAfterSeconds: 42
		});
		expect(ReviewApiRequestError).toBeDefined();
	});

	it('persists only minimized outbox context after an attestation failure', async () => {
		const { review, reviewerPubkey, revieweePubkey, reviewerWallet } =
			await buildReviewAndContext();
		hoisted.getWallet.mockReturnValue(reviewerWallet);
		vi.stubGlobal(
			'fetch',
			vi.fn(async (input: RequestInfo | URL) => {
				const url = String(input);
				if (url.endsWith('/review-attestations/challenge')) {
					return new Response(
						JSON.stringify({
							code: 'issuer_unavailable',
							message: 'Issuer registry temporarily unavailable'
						}),
						{ status: 503 }
					);
				}

				throw new Error(`Unexpected fetch url: ${url}`);
			})
		);

		const { submitAttestedReview } = await import('$lib/api/reviews/review-api');
		await expect(
			submitAttestedReview({
				review,
				subjectId: 'service-123',
				settlementId: 'escrow-123',
				chain: 'rsk',
				asset: 'rbtc',
				contractAddress: '0x0000000000000000000000000000000000000123',
				reviewerWallet: reviewerWallet.address,
				revieweeWallet: '0x0000000000000000000000000000000000000bbb',
				reviewerNpub: reviewerPubkey,
				revieweeNpub: revieweePubkey
			})
		).rejects.toThrow();

		const rawOutbox = window.localStorage.getItem('reviews.publish-outbox.v1');
		if (!rawOutbox) {
			const inMemoryOutbox =
				(globalThis as { __reviewsPublishOutbox?: Array<Record<string, unknown>> })
					.__reviewsPublishOutbox ?? [];
			expect(inMemoryOutbox).toHaveLength(1);
			return;
		}
		const parsedOutbox = JSON.parse(rawOutbox) as Array<Record<string, unknown>>;
		expect(parsedOutbox).toHaveLength(1);
		expect(parsedOutbox[0]?.stage).toBe('awaiting_attestation');
		expect(parsedOutbox[0]?.context).toMatchObject({
			subjectId: 'service-123',
			settlementId: 'escrow-123',
			chain: 'rsk',
			asset: 'rbtc',
			contractAddress: '0x0000000000000000000000000000000000000123',
			revieweeWallet: '0x0000000000000000000000000000000000000bbb'
		});
		expect(parsedOutbox[0]?.context).not.toHaveProperty('reviewerWallet');
		expect(parsedOutbox[0]?.context).not.toHaveProperty('reviewerNpub');
		expect(parsedOutbox[0]?.context).not.toHaveProperty('revieweeNpub');
	});

	it('rejects malformed attestation responses', async () => {
		const { review, reviewerPubkey, revieweePubkey, reviewerWallet } =
			await buildReviewAndContext();
		hoisted.getWallet.mockReturnValue(reviewerWallet);
		hoisted.publishToMultipleRelays.mockResolvedValue([
			{ relay: 'wss://relay.example.test', success: true }
		]);
		vi.stubGlobal(
			'fetch',
			vi.fn(async (input: RequestInfo | URL) => {
				const url = String(input);
				if (url.endsWith('/review-attestations/challenge')) {
					const challengeToken = `v1.${'c'.repeat(24)}.${'d'.repeat(128)}`;
					return new Response(
						JSON.stringify({
							schemaVersion: REVIEWS_SCHEMA_VERSION,
							challengeId: 'challenge-123',
							challengeToken,
							challengeMessage: buildReviewAttestationChallengeMessage({
								challengeToken,
								slotHash: 'c'.repeat(64),
								reviewDraftHash: review.reviewDraftHash,
								nonce: '1'.repeat(32),
								issuedAt: 1_700_000_000,
								expiresAt: 1_700_000_300
							}),
							issuedAt: 1_700_000_000,
							expiresAt: 1_700_000_300
						})
					);
				}

				if (url.endsWith('/review-attestations')) {
					return new Response(
						JSON.stringify({
							schemaVersion: REVIEWS_SCHEMA_VERSION,
							status: 'ok',
							attestationEventId: 'c'.repeat(64)
						})
					);
				}

				throw new Error(`Unexpected fetch url: ${url}`);
			})
		);

		const { submitAttestedReview } = await import('$lib/api/reviews/review-api');
		await expect(
			submitAttestedReview({
				review,
				subjectId: 'service-123',
				settlementId: 'escrow-123',
				chain: 'rsk',
				asset: 'rbtc',
				contractAddress: '0x0000000000000000000000000000000000000123',
				reviewerWallet: reviewerWallet.address,
				revieweeWallet: '0x0000000000000000000000000000000000000bbb',
				reviewerNpub: reviewerPubkey,
				revieweeNpub: revieweePubkey
			})
		).rejects.toThrow();
	});

	it('surfaces relay publish failures after attestation issuance', async () => {
		const { review, reviewerPubkey, revieweePubkey, reviewerWallet } =
			await buildReviewAndContext();
		hoisted.getWallet.mockReturnValue(reviewerWallet);
		hoisted.publishToMultipleRelays.mockResolvedValue([
			{ relay: 'wss://relay.example.test', success: false }
		]);
		vi.stubGlobal(
			'fetch',
			vi.fn(async (input: RequestInfo | URL) => {
				const url = String(input);
				if (url.endsWith('/review-attestations/challenge')) {
					const challengeToken = `v1.${'d'.repeat(24)}.${'e'.repeat(128)}`;
					return new Response(
						JSON.stringify({
							schemaVersion: REVIEWS_SCHEMA_VERSION,
							challengeId: 'challenge-123',
							challengeToken,
							challengeMessage: buildReviewAttestationChallengeMessage({
								challengeToken,
								slotHash: 'd'.repeat(64),
								reviewDraftHash: review.reviewDraftHash,
								nonce: '2'.repeat(32),
								issuedAt: 1_700_000_000,
								expiresAt: 1_700_000_300
							}),
							issuedAt: 1_700_000_000,
							expiresAt: 1_700_000_300
						})
					);
				}

				if (url.endsWith('/review-attestations')) {
					return new Response(
						JSON.stringify({
							schemaVersion: REVIEWS_SCHEMA_VERSION,
							status: 'ok',
							attestationEventId: 'c'.repeat(64),
							issuerPubkey: 'd'.repeat(64),
							reviewDraftHash: review.reviewDraftHash,
							issuedAt: 1_700_000_010
						})
					);
				}

				throw new Error(`Unexpected fetch url: ${url}`);
			})
		);

		const { submitAttestedReview } = await import('$lib/api/reviews/review-api');
		await expect(
			submitAttestedReview({
				review,
				subjectId: 'service-123',
				settlementId: 'escrow-123',
				chain: 'rsk',
				asset: 'rbtc',
				contractAddress: '0x0000000000000000000000000000000000000123',
				reviewerWallet: reviewerWallet.address,
				revieweeWallet: '0x0000000000000000000000000000000000000bbb',
				reviewerNpub: reviewerPubkey,
				revieweeNpub: revieweePubkey
			})
		).rejects.toThrow('Failed to publish review event to any relay');

		const persisted =
			((globalThis as unknown as Record<string, unknown>).__reviewsPublishOutbox as unknown[]) ??
			[];
		expect(persisted).toHaveLength(1);
		expect(persisted[0] as Record<string, unknown>).toMatchObject({
			attestationEventId: 'c'.repeat(64),
			reviewDraftHash: review.reviewDraftHash
		});
	});
});

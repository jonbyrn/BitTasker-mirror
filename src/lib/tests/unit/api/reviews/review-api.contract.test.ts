import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateSecretKey, getPublicKey, nip19 } from 'nostr-tools';
import {
	REVIEW_NOSTR_KINDS,
	REVIEWS_SCHEMA_VERSION,
	attestationChallengeRequestSchema,
	attestationRequestSchema,
	buildReviewAttestationChallengeMessage,
	computeReviewDraftHash,
	reviewEventPayloadSchema
} from '@reviews-contracts';

const hoisted = vi.hoisted(() => {
	return {
		getSignedEvent: vi.fn(),
		publishToMultipleRelays: vi.fn(),
		getNostrKeyPair: vi.fn(),
		getNpub: vi.fn(),
		getWallet: vi.fn(),
		querySync: vi.fn()
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

vi.mock('$lib/stores/app.store', async () => {
	const { readable } = await import('svelte/store');
	return {
		appStore: readable({
			pool: {
				querySync: (...args: Parameters<typeof hoisted.querySync>) => hoisted.querySync(...args)
			},
			relays: ['wss://relay.example.test']
		})
	};
});

describe('review api attestation contract shaping', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.restoreAllMocks();
		vi.stubEnv('VITE_REVIEW_ATTESTATION_API_URL', 'https://reviews-api.example.test');
		hoisted.getSignedEvent.mockReset();
		hoisted.publishToMultipleRelays
			.mockReset()
			.mockResolvedValue([{ relay: 'wss://relay.example.test', success: true }]);
		hoisted.getNostrKeyPair.mockReset();
		hoisted.getWallet.mockReset();
		hoisted.querySync.mockReset().mockResolvedValue([]);
	});

	it('shapes attestation requests against the shared contract and exposes challenge-schema drift', async () => {
		const reviewerSecret = generateSecretKey();
		const reviewerPubkey = getPublicKey(reviewerSecret);
		const reviewerNpub = nip19.npubEncode(reviewerPubkey);
		const walletAccount = {
			address: '0x0000000000000000000000000000000000000555',
			signMessage: vi.fn(async () => `0x${'5'.repeat(130)}`)
		};
		const review = reviewEventPayloadSchema.parse({
			schemaVersion: REVIEWS_SCHEMA_VERSION,
			reviewDraftHash: await computeReviewDraftHash({
				schemaVersion: REVIEWS_SCHEMA_VERSION,
				subjectType: 'service_booking',
				settlementType: 'service_quote_contract',
				revieweePubkey: '9'.repeat(64),
				reviewerRole: 'client',
				revieweeRole: 'provider',
				contractOutcome: 'completed',
				createdAt: 1_700_000_000,
				rating: {
					overallRating: 5,
					categoryRatings: {
						workQuality: 5,
						experience: 5,
						deliverySpeed: 5
					}
				},
				content: {
					sourceLanguage: 'en',
					en: { comment: 'Excellent delivery' },
					es: { comment: 'Entrega excelente' }
				},
				attachments: []
			}),
			subjectType: 'service_booking',
			settlementType: 'service_quote_contract',
			revieweePubkey: '9'.repeat(64),
			reviewerRole: 'client',
			revieweeRole: 'provider',
			contractOutcome: 'completed',
			createdAt: 1_700_000_000,
			rating: {
				overallRating: 5,
				categoryRatings: {
					workQuality: 5,
					experience: 5,
					deliverySpeed: 5
				}
			},
			content: {
				sourceLanguage: 'en',
				en: { comment: 'Excellent delivery' },
				es: { comment: 'Entrega excelente' }
			},
			attachments: []
		});

		hoisted.getNostrKeyPair.mockResolvedValue({
			npub: reviewerNpub,
			nsec: reviewerSecret
		});
		hoisted.getNpub.mockResolvedValue(reviewerNpub);
		hoisted.getWallet.mockReturnValue(walletAccount);
		hoisted.getSignedEvent.mockImplementation(async (unsignedEvent) => ({
			id: 'a'.repeat(64),
			pubkey: reviewerPubkey,
			kind: unsignedEvent.kind,
			created_at: unsignedEvent.created_at,
			tags: unsignedEvent.tags,
			content: unsignedEvent.content,
			sig: 'b'.repeat(128)
		}));

		const requestBodies: Array<{ path: string; body: unknown }> = [];
		const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = typeof input === 'string' ? input : input.toString();
			const body = init?.body ? JSON.parse(String(init.body)) : null;
			requestBodies.push({
				path: new URL(url).pathname,
				body
			});

			if (url.endsWith('/review-attestations/challenge')) {
				const challengeToken = `v1.${'a'.repeat(24)}.${'b'.repeat(128)}`;
				return new Response(
					JSON.stringify({
						schemaVersion: REVIEWS_SCHEMA_VERSION,
						challengeId: 'challenge-123',
						challengeToken,
						challengeMessage: buildReviewAttestationChallengeMessage({
							challengeToken,
							slotHash: 'c'.repeat(64),
							reviewDraftHash: review.reviewDraftHash,
							nonce: 'd'.repeat(32),
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
		});
		vi.stubGlobal('fetch', fetchMock);

		const { submitAttestedReview } = await import('$lib/api/reviews/review-api');
		const result = await submitAttestedReview({
			review,
			subjectId: 'service-123',
			settlementId: 'escrow-123',
			chain: 'rsk',
			asset: 'rbtc',
			contractAddress: '0x0000000000000000000000000000000000000123',
			reviewerWallet: walletAccount.address,
			revieweeWallet: '0x0000000000000000000000000000000000000bbb'
		});

		expect(result).toEqual({
			reviewEventId: 'a'.repeat(64),
			attestationEventId: 'c'.repeat(64),
			reviewDraftHash: review.reviewDraftHash
		});

		expect(requestBodies).toHaveLength(2);
		const challengeBody = requestBodies.find((entry) => entry.path.endsWith('/challenge'))?.body;
		const attestationBody = requestBodies.find(
			(entry) => entry.path === '/review-attestations'
		)?.body;

		expect(challengeBody).toEqual(
			expect.objectContaining({
				schemaVersion: REVIEWS_SCHEMA_VERSION,
				reviewDraftHash: review.reviewDraftHash,
				subjectType: 'service_booking',
				settlementType: 'service_quote_contract',
				reviewerNpub,
				reviewerWallet: walletAccount.address
			})
		);
		expect(() => attestationChallengeRequestSchema.parse(challengeBody)).not.toThrow();

		expect(() => attestationRequestSchema.parse(attestationBody)).not.toThrow();
		expect(attestationBody).toEqual(
			expect.objectContaining({
				schemaVersion: REVIEWS_SCHEMA_VERSION,
				reviewDraftHash: review.reviewDraftHash,
				challengeToken: expect.stringMatching(/^v1\.[A-Za-z0-9_-]+\.[a-f0-9]{128}$/i),
				reviewerWallet: walletAccount.address,
				signedReviewEvent: expect.objectContaining({
					id: 'a'.repeat(64),
					kind: REVIEW_NOSTR_KINDS.REVIEW,
					pubkey: reviewerPubkey
				})
			})
		);
		expect(attestationBody).not.toHaveProperty('challengeId');
		expect(attestationBody).not.toHaveProperty('challengeMessage');
	}, 15000);

	it('accepts challenge response drift and carries the token into the attestation request', async () => {
		const reviewerSecret = generateSecretKey();
		const reviewerPubkey = getPublicKey(reviewerSecret);
		const reviewerNpub = nip19.npubEncode(reviewerPubkey);
		const walletAccount = {
			address: '0x0000000000000000000000000000000000000777',
			signMessage: vi.fn(async () => `0x${'7'.repeat(130)}`)
		};
		const review = reviewEventPayloadSchema.parse({
			schemaVersion: REVIEWS_SCHEMA_VERSION,
			reviewDraftHash: await computeReviewDraftHash({
				schemaVersion: REVIEWS_SCHEMA_VERSION,
				subjectType: 'service_booking',
				settlementType: 'service_quote_contract',
				revieweePubkey: '9'.repeat(64),
				reviewerRole: 'client',
				revieweeRole: 'provider',
				contractOutcome: 'completed',
				createdAt: 1_700_000_000,
				rating: {
					overallRating: 5,
					categoryRatings: {
						workQuality: 5,
						experience: 5,
						deliverySpeed: 5
					}
				},
				content: {
					sourceLanguage: 'en',
					en: { comment: 'Excellent delivery' },
					es: { comment: 'Entrega excelente' }
				},
				attachments: []
			}),
			subjectType: 'service_booking',
			settlementType: 'service_quote_contract',
			revieweePubkey: '9'.repeat(64),
			reviewerRole: 'client',
			revieweeRole: 'provider',
			contractOutcome: 'completed',
			createdAt: 1_700_000_000,
			rating: {
				overallRating: 5,
				categoryRatings: {
					workQuality: 5,
					experience: 5,
					deliverySpeed: 5
				}
			},
			content: {
				sourceLanguage: 'en',
				en: { comment: 'Excellent delivery' },
				es: { comment: 'Entrega excelente' }
			},
			attachments: []
		});

		hoisted.getNostrKeyPair.mockResolvedValue({
			npub: reviewerNpub,
			nsec: reviewerSecret
		});
		hoisted.getNpub.mockResolvedValue(reviewerNpub);
		hoisted.getWallet.mockReturnValue(walletAccount);
		hoisted.getSignedEvent.mockImplementation(async (unsignedEvent) => ({
			id: 'a'.repeat(64),
			pubkey: reviewerPubkey,
			kind: unsignedEvent.kind,
			created_at: unsignedEvent.created_at,
			tags: unsignedEvent.tags,
			content: unsignedEvent.content,
			sig: 'b'.repeat(128)
		}));

		const requestBodies: Array<{ path: string; body: unknown }> = [];
		vi.stubGlobal(
			'fetch',
			vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
				const url = typeof input === 'string' ? input : input.toString();
				const body = init?.body ? JSON.parse(String(init.body)) : null;
				requestBodies.push({
					path: new URL(url).pathname,
					body
				});

				if (url.endsWith('/review-attestations/challenge')) {
					const challengeToken = `v1.${'e'.repeat(24)}.${'f'.repeat(128)}`;
					return new Response(
						JSON.stringify({
							schemaVersion: REVIEWS_SCHEMA_VERSION,
							challengeId: 'challenge-opaque-123',
							challengeToken,
							challengeMessage: buildReviewAttestationChallengeMessage({
								challengeToken,
								slotHash: 'f'.repeat(64),
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
		await submitAttestedReview({
			review,
			subjectId: 'service-123',
			settlementId: 'escrow-123',
			chain: 'rsk',
			asset: 'rbtc',
			contractAddress: '0x0000000000000000000000000000000000000123',
			reviewerWallet: walletAccount.address,
			revieweeWallet: '0x0000000000000000000000000000000000000bbb'
		});

		const attestationBody = requestBodies.find((entry) => entry.path === '/review-attestations')
			?.body as { challengeToken?: string; challengeMessage?: string } | undefined;
		expect(attestationBody?.challengeToken).toMatch(/^v1\.[A-Za-z0-9_-]+\.[a-f0-9]{128}$/i);
		expect(attestationBody).not.toHaveProperty('challengeMessage');
	});
});

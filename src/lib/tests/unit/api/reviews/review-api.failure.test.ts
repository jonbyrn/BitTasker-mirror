// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateSecretKey, getPublicKey, type Event as NostrEvent } from 'nostr-tools';
import { bytesToHex } from '@noble/hashes/utils';
import { localEncryptionService } from '$lib/services/security/local-encryption.service';

// Helper to ensure we have a hex string from whatever getPublicKey returns
function ensureHex(pubkey: string | Uint8Array): string {
	if (typeof pubkey === 'string') return pubkey;
	return bytesToHex(pubkey);
}

const hoisted = vi.hoisted(() => ({
	querySync: vi.fn(),
	getSignedEvent: vi.fn(),
	publishToMultipleRelays: vi.fn(),
	getNostrKeyPair: vi.fn(),
	getNpub: vi.fn(),
	getAllKeys: vi.fn(),
	getWallet: vi.fn(),
	showSuccessToast: vi.fn(),
	verifyReviewDraftHash: vi.fn(),
	preferencesGet: vi.fn().mockResolvedValue({ value: null })
}));

vi.mock('@capacitor/preferences', () => ({
	Preferences: {
		get: (...args: unknown[]) => hoisted.preferencesGet(...args),
		set: vi.fn().mockResolvedValue(undefined),
		remove: vi.fn().mockResolvedValue(undefined),
		clear: vi.fn().mockResolvedValue(undefined)
	}
}));

vi.mock('svelte-i18n', () => ({
	t: {
		subscribe: (fn: (v: unknown) => void) => {
			fn((key: string) => key);
			return () => {};
		}
	}
}));

vi.mock('$app/state', () => ({
	page: {
		url: new URL('http://localhost')
	}
}));

vi.mock('$lib/utils/nostr', () => ({
	getSignedEvent: (...args: unknown[]) => hoisted.getSignedEvent(...args),
	publishToMultipleRelays: (...args: unknown[]) => hoisted.publishToMultipleRelays(...args)
}));

vi.mock('$lib/utils/nostrKeys', () => ({
	getNostrKeyPair: () => hoisted.getNostrKeyPair(),
	getNpub: () => hoisted.getNpub(),
	getAllKeys: () => hoisted.getAllKeys()
}));

vi.mock('$lib/stores/wallet.store', () => ({
	getWallet: (chain: string) => hoisted.getWallet(chain)
}));

vi.mock('$lib/stores/app.store', async () => {
	const { readable } = await import('svelte/store');
	return {
		appStore: {
			...readable({
				pool: {
					querySync: (...args: unknown[]) => hoisted.querySync(...args)
				},
				relays: ['wss://relay.example.test']
			}),
			showSuccessToast: (msg: string) => hoisted.showSuccessToast(msg)
		}
	};
});

// Full manual mock of @reviews-contracts
vi.mock('@reviews-contracts', async () => {
	return {
		REVIEWS_SCHEMA_VERSION: 1,
		REVIEW_NOSTR_KINDS: {
			REVIEW: 10001,
			ATTESTATION: 10003,
			REPLY: 10002
		},
		REVIEW_TAG_NAMES: {
			REVIEWEE: 'p',
			REVIEW_DRAFT_HASH: 'd',
			PARENT_REVIEW: 'e'
		},
		attestationEventPayloadSchema: { parse: (x: unknown) => x },
		attestationRequestSchema: { parse: (x: unknown) => x },
		attestationResponseSchema: {
			passthrough: () => ({ parse: (x: unknown) => x }),
			parse: (x: unknown) => x
		},
		issuerRegistryResponseSchema: {
			passthrough: () => ({ parse: (x: unknown) => x }),
			parse: (x: unknown) => x
		},
		isReplyAuthorAllowed: () => true,
		reviewErrorResponseSchema: {
			passthrough: () => ({ safeParse: (x: unknown) => ({ success: true, data: x }) }),
			safeParse: (x: unknown) => ({ success: true, data: x })
		},
		reviewEventPayloadSchema: { parse: (x: unknown) => x },
		reviewReplyCandidateSchema: { parse: (x: unknown) => x },
		reviewReplyEventPayloadSchema: { parse: (x: unknown) => x },
		selectCanonicalReviewReply: (x: unknown[]) => (x as unknown[])[0],
		computeReviewDraftHashFromPayload: (...args: unknown[]) =>
			hoisted.verifyReviewDraftHash(...args),
		buildReviewAttestationChallengeMessage: () => 'mock-challenge-message',
		buildReviewFixture: (x: { reviewDraftHash?: string; revieweePubkey?: string }) => ({
			createdAt: 123456789,
			revieweePubkey: x.revieweePubkey || '0'.repeat(64),
			reviewDraftHash: x.reviewDraftHash || '0'.repeat(64),
			rating: { overallRating: 5, categoryRatings: {} },
			content: { sourceLanguage: 'en', en: { comment: 'test' }, es: { comment: 'test' } },
			attachments: [],
			subjectType: 'task',
			settlementType: 'escrow',
			contractOutcome: 'completed',
			reviewerRole: 'client',
			revieweeRole: 'provider'
		})
	};
});

import { submitAttestedReview, loadIssuerRegistry } from '$lib/api/reviews/review-api';
import { buildReviewFixture, REVIEWS_SCHEMA_VERSION } from '@reviews-contracts';

describe('review api failure matrix', () => {
	const reviewerPriv = new Uint8Array(generateSecretKey());
	const reviewerPub = ensureHex(getPublicKey(reviewerPriv));

	beforeEach(() => {
		vi.resetAllMocks();
		localEncryptionService.reset();
		vi.stubEnv('VITE_REVIEW_ATTESTATION_API_URL', 'https://reviews-api.example.test');

		if (typeof globalThis !== 'undefined') {
			const globalAny = globalThis as unknown as Record<string, unknown>;
			globalAny.__reviewsPublishOutbox = [];
			globalAny.Preferences = {
				get: (...args: unknown[]) => hoisted.preferencesGet(...args)
			};
		}

		hoisted.getNpub.mockResolvedValue(reviewerPub);
		hoisted.getNostrKeyPair.mockResolvedValue({ nsec: reviewerPriv, npub: reviewerPub });
		hoisted.getAllKeys.mockResolvedValue({
			npub: reviewerPub,
			nsec: reviewerPriv,
			mnemonic:
				'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
		});
	});

	async function buildReviewAndContext() {
		const revieweePubkey = '466d7fcae563e5cb09a0d1870bb580344804617879a14949cf22285f1bae3f27';
		const reviewerWallet = {
			address: '0x0000000000000000000000000000000000000555',
			signMessage: vi.fn(async () => `0x${'5'.repeat(130)}`)
		};

		const review = buildReviewFixture({
			revieweePubkey,
			reviewDraftHash: 'd'.repeat(64)
		});

		hoisted.getSignedEvent.mockImplementation(async (unsignedEvent: Partial<NostrEvent>) => ({
			...unsignedEvent,
			pubkey: reviewerPub,
			id: 'review-event-id',
			sig: 'f'.repeat(128)
		}));

		return {
			review,
			reviewerPubkey: reviewerPub,
			revieweePubkey,
			reviewerWallet
		};
	}

	it('fails closed when the API URL is missing', async () => {
		const { review, reviewerWallet, revieweePubkey } = await buildReviewAndContext();
		vi.stubEnv('VITE_REVIEW_ATTESTATION_API_URL', '');

		hoisted.verifyReviewDraftHash.mockResolvedValue(true);

		await expect(
			submitAttestedReview({
				review: review as unknown as ReviewEventPayload,
				subjectId: 'service-123',
				settlementId: 'escrow-123',
				chain: 'rsk',
				asset: 'rbtc',
				contractAddress: '0x0000000000000000000000000000000000000123',
				reviewerWallet: reviewerWallet.address,
				revieweeWallet: '0x0000000000000000000000000000000000000bbb',
				reviewerNpub: reviewerPub,
				revieweeNpub: revieweePubkey
			} as SubmitAttestedReviewInput)
		).rejects.toThrow('Review attestation API is not configured');
	});

	it('surfaces non-200 challenge responses', async () => {
		const { review, reviewerWallet, revieweePubkey } = await buildReviewAndContext();
		hoisted.getWallet.mockReturnValue(reviewerWallet);
		hoisted.verifyReviewDraftHash.mockResolvedValue(true);

		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: false,
			status: 503,
			text: () =>
				Promise.resolve(
					JSON.stringify({
						code: 'issuer_unavailable',
						message: 'Issuer registry temporarily unavailable'
					})
				)
		});

		await expect(
			submitAttestedReview({
				review: review as unknown as ReviewEventPayload,
				subjectId: 'service-123',
				settlementId: 'escrow-123',
				chain: 'rsk',
				asset: 'rbtc',
				contractAddress: '0x0000000000000000000000000000000000000123',
				reviewerWallet: reviewerWallet.address,
				revieweeWallet: '0x0000000000000000000000000000000000000bbb',
				reviewerNpub: reviewerPub,
				revieweeNpub: revieweePubkey
			} as SubmitAttestedReviewInput)
		).rejects.toThrow('Issuer registry temporarily unavailable');
	});

	it('preserves structured backend error data for retry handling', async () => {
		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: false,
			status: 429,
			headers: new Map([['retry-after', '42']]),
			text: () =>
				Promise.resolve(
					JSON.stringify({
						code: 'rate_limited',
						message: 'Slow down',
						retryAfterSeconds: 42
					})
				)
		});

		await expect(loadIssuerRegistry()).rejects.toMatchObject({
			name: 'ReviewApiRequestError',
			message: 'Slow down',
			status: 429,
			code: 'rate_limited',
			retryAfterSeconds: 42
		});
	});

	it('surfaces relay publish failures after attestation issuance', async () => {
		const { review, reviewerWallet, revieweePubkey } = await buildReviewAndContext();
		hoisted.getWallet.mockReturnValue(reviewerWallet);
		hoisted.verifyReviewDraftHash.mockResolvedValue(true);
		hoisted.publishToMultipleRelays.mockResolvedValue([
			{ relay: 'wss://relay.example.test', success: false }
		]);

		globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
			if (url.includes('/challenge')) {
				return {
					ok: true,
					json: () =>
						Promise.resolve({
							schemaVersion: REVIEWS_SCHEMA_VERSION,
							challengeToken: 'token-123',
							challengeMessage: 'message-123',
							issuedAt: Date.now(),
							expiresAt: Date.now() + 10000
						})
				};
			}
			if (url.endsWith('/review-attestations')) {
				return {
					ok: true,
					json: () =>
						Promise.resolve({
							schemaVersion: REVIEWS_SCHEMA_VERSION,
							status: 'ok',
							attestationEventId: 'attest-123',
							issuerPubkey: 'issuer-123',
							reviewDraftHash: review.reviewDraftHash,
							issuedAt: Date.now()
						})
				};
			}
			return { ok: false, status: 404 };
		});

		await expect(
			submitAttestedReview({
				review: review as unknown as ReviewEventPayload,
				subjectId: 'service-123',
				settlementId: 'escrow-123',
				chain: 'rsk',
				asset: 'rbtc',
				contractAddress: '0x0000000000000000000000000000000000000123',
				reviewerWallet: reviewerWallet.address,
				revieweeWallet: '0x0000000000000000000000000000000000000bbb',
				reviewerNpub: reviewerPub,
				revieweeNpub: revieweePubkey
			} as SubmitAttestedReviewInput)
		).rejects.toThrow('Failed to publish review event to any relay');

		const globalAny = globalThis as unknown as Record<string, unknown>;
		const persisted = (globalAny.__reviewsPublishOutbox as unknown[]) ?? [];
		expect(persisted).toHaveLength(1);
		expect(persisted[0] as Record<string, unknown>).toMatchObject({
			attestationEventId: 'attest-123',
			reviewDraftHash: review.reviewDraftHash
		});
	});
});

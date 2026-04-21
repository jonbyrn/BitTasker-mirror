// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	generateSecretKey,
	getPublicKey,
	finalizeEvent,
	type Event as NostrEvent
} from 'nostr-tools';
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

import { submitAttestedReview, loadPublishedReviewsForUser } from '$lib/api/reviews/review-api';
import { buildReviewFixture, REVIEW_NOSTR_KINDS } from '@reviews-contracts';

describe('Review API Security Hardening', () => {
	const reviewerPriv = new Uint8Array(generateSecretKey());
	const reviewerPub = ensureHex(getPublicKey(reviewerPriv));
	const validSig = 'a'.repeat(128);
	const validToken = `v1.opaque.${'b'.repeat(128)}`;
	const validWalletSig = `0x${'c'.repeat(130)}`;
	const dummyHex64 = 'f'.repeat(64);
	const alternateHex64 = 'e'.repeat(64);

	beforeEach(() => {
		vi.resetAllMocks();
		localEncryptionService.reset();

		vi.stubEnv('VITE_REVIEW_ATTESTATION_API_URL', 'http://api.example.test');
		vi.stubEnv('VITE_REVIEW_TRANSLATION_API_URL', 'http://translation.example.test');
		vi.stubEnv('VITE_RSK_NETWORK', 'testnet');
		vi.stubEnv('VITE_NOSTR_RELAY_URL', 'wss://relay.example.test');

		hoisted.getNpub.mockResolvedValue(reviewerPub);
		hoisted.getNostrKeyPair.mockResolvedValue({ nsec: reviewerPriv, npub: reviewerPub });
		hoisted.getAllKeys.mockResolvedValue({
			npub: reviewerPub,
			nsec: reviewerPriv,
			mnemonic:
				'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
		});

		if (typeof globalThis !== 'undefined') {
			const globalAny = globalThis as unknown as Record<string, unknown>;
			globalAny.Preferences = {
				get: (...args: unknown[]) => hoisted.preferencesGet(...args)
			};
			globalAny.__reviewsPublishOutbox = [];
		}

		hoisted.getSignedEvent.mockImplementation(async (event: Partial<NostrEvent>) => ({
			...event,
			id: 'default-id',
			pubkey: reviewerPub,
			sig: validSig
		}));

		globalThis.fetch = vi.fn().mockImplementation((url: string) => {
			if (url.includes('/review-attestations/challenge')) {
				return Promise.resolve({
					ok: true,
					json: () =>
						Promise.resolve({
							schemaVersion: 1,
							challengeToken: validToken,
							challengeMessage: 'message-1',
							issuedAt: Date.now(),
							expiresAt: Date.now() + 10000
						})
				});
			}
			if (url.includes('/review-attestations')) {
				return Promise.resolve({
					ok: true,
					json: () =>
						Promise.resolve({
							schemaVersion: 1,
							status: 'ok',
							attestationEventId: 'attest-1',
							issuerPubkey: dummyHex64,
							reviewDraftHash: dummyHex64,
							issuedAt: Date.now()
						})
				});
			}
			if (url.includes('/review-attestation-issuers')) {
				return Promise.resolve({
					ok: true,
					json: () =>
						Promise.resolve({
							schemaVersion: 1,
							issuers: []
						})
				});
			}
			return Promise.resolve({ ok: false });
		});

		hoisted.getWallet.mockReturnValue({
			address: '0xabc',
			signMessage: vi.fn().mockResolvedValue(validWalletSig)
		});

		hoisted.publishToMultipleRelays.mockResolvedValue([{ success: true }]);

		hoisted.verifyReviewDraftHash.mockImplementation(
			async (payload: { reviewDraftHash: string }) => {
				// Basic implementation for tests
				if (payload.reviewDraftHash === alternateHex64) return false;
				return true;
			}
		);
	});

	describe('submitAttestedReview', () => {
		it('should reject submission if the reviewDraftHash does not match the content', async () => {
			hoisted.verifyReviewDraftHash.mockResolvedValue(false);

			const payload = buildReviewFixture({
				reviewDraftHash: dummyHex64
			});

			const input: SubmitAttestedReviewInput = {
				review: payload as unknown as ReviewEventPayload,
				subjectId: 'sub-1',
				settlementId: 'sett-1',
				chain: 'rsk' as const,
				asset: 'rbtc' as const,
				contractAddress: '0x123',
				reviewerWallet: '0xabc',
				revieweeWallet: '0xdef'
			};

			await expect(submitAttestedReview(input)).rejects.toThrow(
				'Review content integrity check failed: Draft hash mismatch'
			);
		});

		it('should accept submission if the reviewDraftHash matches the content', async () => {
			hoisted.verifyReviewDraftHash.mockResolvedValue(true);

			const basePayload = buildReviewFixture({
				reviewDraftHash: dummyHex64
			});

			const input: SubmitAttestedReviewInput = {
				review: basePayload as unknown as ReviewEventPayload,
				subjectId: 'sub-1',
				settlementId: 'sett-1',
				chain: 'rsk' as const,
				asset: 'rbtc' as const,
				contractAddress: '0x123',
				reviewerWallet: '0xabc',
				revieweeWallet: '0xdef'
			};

			const result = await submitAttestedReview(input);
			expect(result.reviewDraftHash).toBe(dummyHex64);
		});
	});

	describe('loadPublishedReviewsForUser security', () => {
		it('should mark a review as pending (unverified) if the attestation hash mismatch', async () => {
			const reviewPayload = buildReviewFixture({ reviewDraftHash: dummyHex64 });

			const reviewEvent = finalizeEvent(
				{
					kind: REVIEW_NOSTR_KINDS.REVIEW,
					created_at: Math.floor(Date.now() / 1000),
					tags: [
						['p', '0'.repeat(64)],
						['d', dummyHex64]
					],
					content: JSON.stringify(reviewPayload)
				},
				reviewerPriv
			);

			const attestationPayload = {
				schemaVersion: 1,
				reviewEventId: reviewEvent.id,
				reviewDraftHash: alternateHex64,
				reviewerPubkey: ensureHex(reviewEvent.pubkey),
				expiresAt: Date.now() + 100000,
				issuedAt: Date.now(),
				keyId: 'key-1',
				subjectType: 'task',
				settlementType: 'escrow',
				reviewerRole: 'client',
				revieweeRole: 'provider',
				contractOutcome: 'completed',
				revieweePubkey: '0'.repeat(64)
			};

			const issuerPriv = new Uint8Array(generateSecretKey());
			const issuerPub = ensureHex(getPublicKey(issuerPriv));

			const attestationEvent = finalizeEvent(
				{
					kind: REVIEW_NOSTR_KINDS.ATTESTATION,
					created_at: Math.floor(Date.now() / 1000),
					tags: [['e', reviewEvent.id]],
					content: JSON.stringify(attestationPayload)
				},
				issuerPriv
			);

			hoisted.querySync.mockImplementation((_relays: string[], filter: { kinds?: number[] }) => {
				if (filter.kinds?.includes(REVIEW_NOSTR_KINDS.REVIEW)) {
					return [reviewEvent];
				}
				if (filter.kinds?.includes(REVIEW_NOSTR_KINDS.ATTESTATION)) {
					return [attestationEvent];
				}
				return [];
			});

			globalThis.fetch = vi.fn().mockImplementation((url: string) => {
				if (url.includes('/review-attestation-issuers')) {
					return Promise.resolve({
						ok: true,
						json: () =>
							Promise.resolve({
								schemaVersion: 1,
								issuers: [
									{
										pubkey: issuerPub,
										keyId: 'key-1',
										status: 'active',
										validFrom: 0,
										validUntil: null
									}
								]
							})
					});
				}
				return Promise.resolve({ ok: false });
			});

			hoisted.verifyReviewDraftHash.mockResolvedValue(true);

			const { given, received } = await loadPublishedReviewsForUser(ensureHex(reviewEvent.pubkey));

			const reviews = [...given, ...received];
			expect(reviews.length).toBe(1);
			expect(reviews[0].verificationState).toBe('pending');
		});
	});
});

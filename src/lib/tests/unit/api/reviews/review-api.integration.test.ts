// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateSecretKey, getPublicKey, type Event as NostrEvent } from 'nostr-tools';
import { bytesToHex } from '@noble/hashes/utils';
import { Wallet } from 'ethers';
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
	getSignedEvent: (event: Partial<NostrEvent>) => hoisted.getSignedEvent(event),
	publishToMultipleRelays: (event: NostrEvent) => hoisted.publishToMultipleRelays(event)
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
					querySync: (relays: string[], filter: Record<string, unknown>) =>
						hoisted.querySync(relays, filter)
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
			passthrough: () => ({ safeParse: (x: unknown) => ({ success: false, data: x }) }),
			safeParse: (x: unknown) => ({ success: false, data: x })
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

import { submitAttestedReview } from '$lib/api/reviews/review-api';
import { REVIEW_NOSTR_KINDS, REVIEWS_SCHEMA_VERSION, buildReviewFixture } from '@reviews-contracts';

function createMockStorage() {
	const entries = new Map<string, string>();
	return {
		getItem(key: string) {
			return entries.get(key) ?? null;
		},
		removeItem(key: string) {
			entries.delete(key);
		},
		setItem(key: string, value: string) {
			entries.set(key, value);
		}
	} as unknown as Storage;
}

describe('Review API Integration (Hardened)', () => {
	const reviewerSecret = new Uint8Array(generateSecretKey());
	const reviewerPubkey = ensureHex(getPublicKey(reviewerSecret));
	// Valid 12-word mnemonic for ethers
	const validMnemonic =
		'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

	beforeEach(() => {
		vi.resetAllMocks();
		localEncryptionService.reset();
		vi.stubGlobal('localStorage', createMockStorage());
		vi.stubGlobal('fetch', vi.fn());

		hoisted.getNpub.mockResolvedValue(reviewerPubkey);
		hoisted.getNostrKeyPair.mockResolvedValue({
			nsec: reviewerSecret,
			npub: reviewerPubkey
		});
		hoisted.getAllKeys.mockResolvedValue({
			npub: reviewerPubkey,
			nsec: reviewerSecret,
			mnemonic: validMnemonic
		});

		// Provide global objects for Node environment tests
		if (typeof globalThis !== 'undefined') {
			const globalAny = globalThis as unknown as Record<string, unknown>;
			globalAny.Preferences = {
				get: (...args: unknown[]) => hoisted.preferencesGet(...args)
			};
			globalAny.__reviewsPublishOutbox = [];
		}
	});

	it('completes a full attestation and publish flow successfully', async () => {
		const reviewerWallet = Wallet.createRandom();
		const revieweeSecret = new Uint8Array(generateSecretKey());
		const revieweePubkey = ensureHex(getPublicKey(revieweeSecret));
		const issuerSecret = new Uint8Array(generateSecretKey());
		const issuerPubkey = ensureHex(getPublicKey(issuerSecret));

		vi.stubEnv('VITE_REVIEW_ATTESTATION_API_URL', 'https://reviews-api.example.test');

		const reviewPayload = buildReviewFixture({
			reviewDraftHash: 'd'.repeat(64),
			revieweePubkey: revieweePubkey
		});

		hoisted.verifyReviewDraftHash.mockResolvedValue(true);

		hoisted.getSignedEvent.mockImplementation(async (event: Partial<NostrEvent>) => ({
			...event,
			id: 'review-event-id',
			pubkey: reviewerPubkey,
			sig: 'review-sig'
		}));

		hoisted.getWallet.mockReturnValue({
			address: reviewerWallet.address,
			signMessage: async (msg: string) => await reviewerWallet.signMessage(msg)
		});

		const challengeMessage = 'mock-challenge-message';

		(globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockImplementation(
			async (url: string) => {
				if (url.endsWith('/challenge')) {
					return {
						ok: true,
						json: async () => ({
							schemaVersion: REVIEWS_SCHEMA_VERSION,
							challengeToken: 'v1.token.sig',
							challengeMessage,
							issuedAt: Math.floor(Date.now() / 1000),
							expiresAt: Math.floor(Date.now() / 1000) + 300
						})
					};
				}
				if (url.endsWith('/review-attestations')) {
					return {
						ok: true,
						json: async () => ({
							schemaVersion: REVIEWS_SCHEMA_VERSION,
							status: 'ok',
							attestationEventId: 'attestation-event-id',
							issuerPubkey,
							reviewDraftHash: reviewPayload.reviewDraftHash,
							issuedAt: Math.floor(Date.now() / 1000)
						})
					};
				}
				if (url.endsWith('/review-attestation-issuers')) {
					return {
						ok: true,
						json: async () => ({
							schemaVersion: REVIEWS_SCHEMA_VERSION,
							issuers: [
								{
									keyId: 'issuer-v1',
									pubkey: issuerPubkey,
									status: 'active',
									validFrom: 0
								}
							]
						})
					};
				}
				return { ok: false, status: 404 };
			}
		);

		const publishedReviewEvents: NostrEvent[] = [];
		hoisted.publishToMultipleRelays.mockImplementation(async (event: NostrEvent) => {
			publishedReviewEvents.push(event);
			return [{ relay: 'wss://relay.example.test', success: true }];
		});

		hoisted.querySync.mockImplementation(
			async (_relays: string[], filter: Record<string, unknown>) => {
				if ((filter.kinds as number[] | undefined)?.includes(REVIEW_NOSTR_KINDS.REVIEW)) {
					return publishedReviewEvents;
				}
				return [];
			}
		);

		const result = await submitAttestedReview({
			review: reviewPayload as unknown as ReviewEventPayload,
			subjectId: 'task-1',
			settlementId: 'escrow-1',
			chain: 'rsk',
			asset: 'rbtc',
			contractAddress: '0xcontract',
			reviewerWallet: reviewerWallet.address,
			revieweeWallet: '0xreviewee'
		} as SubmitAttestedReviewInput);

		expect(result.reviewEventId).toBeDefined();
		expect(result.attestationEventId).toBe('attestation-event-id');
		expect(publishedReviewEvents).toHaveLength(1);
	});
});

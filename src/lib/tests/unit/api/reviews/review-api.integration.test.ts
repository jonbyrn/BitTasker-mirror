// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateSecretKey, getPublicKey, type Event as NostrEvent } from 'nostr-tools';
import { bytesToHex } from '@noble/hashes/utils';
import { Wallet } from 'ethers';
import {
	REVIEW_NOSTR_KINDS,
	buildReviewFixture,
	buildReviewAttestationChallengeMessage,
	computeReviewDraftHashFromPayload,
	type ReviewEventPayload
} from '@reviews-contracts';

const hoisted = vi.hoisted(() => ({
	querySync: vi.fn(),
	getSignedEvent: vi.fn(),
	publishToMultipleRelays: vi.fn(),
	getNostrKeyPair: vi.fn(),
	getNpub: vi.fn(),
	getWallet: vi.fn(),
	showSuccessToast: vi.fn()
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
	getNpub: () => hoisted.getNpub()
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

import { submitAttestedReview } from '$lib/api/reviews/review-api';

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
	} as Storage;
}

describe('Review API Integration (Hardened)', () => {
	const reviewerSecret = generateSecretKey();
	const reviewerPubkey = bytesToHex(getPublicKey(reviewerSecret));

	beforeEach(() => {
		vi.resetAllMocks();
		vi.stubGlobal('localStorage', createMockStorage());
		vi.stubGlobal('fetch', vi.fn());
		hoisted.getNpub.mockResolvedValue(reviewerPubkey);
		hoisted.getNostrKeyPair.mockResolvedValue({
			nsec: reviewerSecret,
			npub: reviewerPubkey
		});

		// Default to empty outbox
		if (typeof globalThis !== 'undefined') {
			(globalThis as unknown as { __reviewsPublishOutbox: unknown[] }).__reviewsPublishOutbox = [];
		}
	});

	it('completes a full attestation and publish flow successfully', async () => {
		const reviewerWallet = Wallet.createRandom();
		const revieweeSecret = generateSecretKey();
		const revieweePubkey = bytesToHex(getPublicKey(revieweeSecret));
		const issuerSecret = generateSecretKey();
		const issuerPubkey = bytesToHex(getPublicKey(issuerSecret));

		vi.stubEnv('VITE_REVIEW_ATTESTATION_API_URL', 'https://reviews-api.example.test');

		const reviewPayload: ReviewEventPayload = buildReviewFixture({
			reviewDraftHash: '0'.repeat(64),
			revieweePubkey: revieweePubkey,
			rating: {
				overallRating: 5,
				categoryRatings: { workQuality: 5, experience: 5, deliverySpeed: 5 }
			}
		}) as unknown as ReviewEventPayload;

		const reviewDraftHash = await computeReviewDraftHashFromPayload(reviewPayload);
		reviewPayload.reviewDraftHash = reviewDraftHash;

		hoisted.getSignedEvent.mockImplementation(async (event) => ({
			...event,
			id: 'review-event-id',
			pubkey: reviewerPubkey,
			sig: 'review-sig'
		}));

		hoisted.getWallet.mockReturnValue({
			address: reviewerWallet.address,
			signMessage: async (msg: string) => await reviewerWallet.signMessage(msg)
		});

		const challengeMessage = buildReviewAttestationChallengeMessage({
			challengeToken: 'v1.token.sig',
			slotHash: 'slot-hash',
			reviewDraftHash,
			nonce: 'nonce-123',
			issuedAt: Math.floor(Date.now() / 1000),
			expiresAt: Math.floor(Date.now() / 1000) + 300
		});

		(globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockImplementation(
			async (url: string) => {
				if (url.endsWith('/challenge')) {
					return {
						ok: true,
						json: async () => ({
							schemaVersion: 1,
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
							schemaVersion: 1,
							status: 'ok',
							attestationEventId: 'attestation-event-id',
							issuerPubkey,
							reviewDraftHash,
							issuedAt: Math.floor(Date.now() / 1000)
						})
					};
				}
				if (url.endsWith('/review-attestation-issuers')) {
					return {
						ok: true,
						json: async () => ({
							schemaVersion: 1,
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
			review: reviewPayload,
			subjectId: 'task-1',
			settlementId: 'escrow-1',
			chain: 'rsk',
			asset: 'rbtc',
			contractAddress: '0xcontract',
			reviewerWallet: reviewerWallet.address,
			revieweeWallet: '0xreviewee'
		});

		expect(result.reviewEventId).toBe('review-event-id');
		expect(result.attestationEventId).toBe('attestation-event-id');
		expect(publishedReviewEvents).toHaveLength(1);
	});
});

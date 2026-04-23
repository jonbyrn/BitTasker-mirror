import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	REVIEW_NOSTR_KINDS,
	REVIEWS_SCHEMA_VERSION,
	buildReviewFixture,
	buildReviewAttestationChallengeMessage,
	buildReviewReplyFixture,
	computeReviewDraftHashFromPayload,
	type ReviewEventPayload
} from '@reviews-contracts';

const hoisted = vi.hoisted(() => {
	return {
		querySync: vi.fn(),
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

vi.mock('nostr-tools', async () => {
	const actual = await vi.importActual<typeof import('nostr-tools')>('nostr-tools');
	return {
		...actual,
		verifyEvent: vi.fn(() => true)
	};
});

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

async function buildSignedReview(input: {
	reviewerPubkey: string;
	revieweePubkey: string;
	overrides?: Partial<ReviewEventPayload>;
}) {
	const basePayload = buildReviewFixture({
		reviewDraftHash: '0'.repeat(64),
		revieweePubkey: input.revieweePubkey,
		createdAt: 1_700_000_000,
		...input.overrides
	});
	const reviewDraftHash = await computeReviewDraftHashFromPayload(basePayload);
	const payload: ReviewEventPayload = {
		...basePayload,
		reviewDraftHash
	};
	const event = buildSignedEvent({
		id: `${payload.reviewDraftHash.slice(0, 63)}a`,
		kind: REVIEW_NOSTR_KINDS.REVIEW,
		pubkey: input.reviewerPubkey,
		created_at: payload.createdAt,
		tags: [
			['p', payload.revieweePubkey],
			['d', payload.reviewDraftHash]
		],
		content: JSON.stringify(payload)
	});

	return { payload, event };
}

function buildSignedEvent(input: {
	id: string;
	kind: number;
	pubkey: string;
	created_at: number;
	tags: string[][];
	content: string;
}) {
	return {
		...input,
		sig: 'f'.repeat(128)
	};
}

describe('review api read-side verification', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.restoreAllMocks();
		vi.stubEnv('VITE_REVIEW_ATTESTATION_API_URL', 'https://reviews-api.example.test');
		window.localStorage.clear();
		(globalThis as { __reviewsPublishOutbox?: unknown[] }).__reviewsPublishOutbox = [];
		hoisted.querySync.mockReset();
		hoisted.getSignedEvent.mockReset();
		hoisted.publishToMultipleRelays.mockReset();
		hoisted.getNostrKeyPair.mockReset();
		hoisted.getWallet.mockReset();
	});

	it('filters tampered reviews, ignores spoofed replies, and binds attestations to the review event', async () => {
		const reviewerPubkey = '1'.repeat(64);
		const revieweePubkey = '2'.repeat(64);
		const attackerPubkey = '3'.repeat(64);
		const issuerPubkey = '4'.repeat(64);

		const { payload: validReviewPayload, event: validReviewEvent } = await buildSignedReview({
			reviewerPubkey,
			revieweePubkey
		});
		const { payload: tamperedReviewPayloadBase, event: tamperedReviewEventBase } =
			await buildSignedReview({
				reviewerPubkey,
				revieweePubkey,
				overrides: {
					createdAt: 1_700_000_100
				}
			});
		const tamperedReviewEvent = {
			...tamperedReviewEventBase,
			content: JSON.stringify({
				...tamperedReviewPayloadBase,
				content: {
					...tamperedReviewPayloadBase.content,
					en: { comment: 'Tampered after hashing' }
				}
			})
		};

		const validReplyPayload = buildReviewReplyFixture({
			parentReviewEventId: validReviewEvent.id,
			revieweePubkey,
			createdAt: 1_700_000_200
		});
		const validReplyEvent = buildSignedEvent({
			id: '5'.repeat(64),
			kind: REVIEW_NOSTR_KINDS.REPLY,
			pubkey: revieweePubkey,
			created_at: validReplyPayload.createdAt,
			tags: [
				['e', validReplyPayload.parentReviewEventId],
				['p', validReplyPayload.revieweePubkey]
			],
			content: JSON.stringify(validReplyPayload)
		});
		const spoofedReplyPayload = buildReviewReplyFixture({
			parentReviewEventId: validReviewEvent.id,
			revieweePubkey,
			createdAt: 1_700_000_150
		});
		const spoofedReplyEvent = buildSignedEvent({
			id: '6'.repeat(64),
			kind: REVIEW_NOSTR_KINDS.REPLY,
			pubkey: attackerPubkey,
			created_at: spoofedReplyPayload.createdAt,
			tags: [
				['e', spoofedReplyPayload.parentReviewEventId],
				['p', spoofedReplyPayload.revieweePubkey]
			],
			content: JSON.stringify(spoofedReplyPayload)
		});

		const validAttestationEvent = buildSignedEvent({
			id: '7'.repeat(64),
			kind: REVIEW_NOSTR_KINDS.ATTESTATION,
			pubkey: issuerPubkey,
			created_at: 1_700_000_300,
			tags: [
				['e', validReviewEvent.id],
				['d', validReviewPayload.reviewDraftHash],
				['p', reviewerPubkey],
				['p', revieweePubkey]
			],
			content: JSON.stringify({
				schemaVersion: REVIEWS_SCHEMA_VERSION,
				reviewEventId: validReviewEvent.id,
				reviewDraftHash: validReviewPayload.reviewDraftHash,
				subjectType: validReviewPayload.subjectType,
				settlementType: validReviewPayload.settlementType,
				reviewerPubkey,
				revieweePubkey,
				reviewerRole: validReviewPayload.reviewerRole,
				revieweeRole: validReviewPayload.revieweeRole,
				contractOutcome: validReviewPayload.contractOutcome,
				issuedAt: 1_700_000_300,
				expiresAt: Date.now() + 60_000,
				keyId: 'issuer-v1'
			})
		});
		const mismatchedAttestationEvent = buildSignedEvent({
			id: '8'.repeat(64),
			kind: REVIEW_NOSTR_KINDS.ATTESTATION,
			pubkey: issuerPubkey,
			created_at: 1_700_000_301,
			tags: [
				['e', tamperedReviewEvent.id],
				['d', validReviewPayload.reviewDraftHash],
				['p', reviewerPubkey],
				['p', revieweePubkey]
			],
			content: JSON.stringify({
				schemaVersion: REVIEWS_SCHEMA_VERSION,
				reviewEventId: tamperedReviewEvent.id,
				reviewDraftHash: validReviewPayload.reviewDraftHash,
				subjectType: validReviewPayload.subjectType,
				settlementType: validReviewPayload.settlementType,
				reviewerPubkey,
				revieweePubkey,
				reviewerRole: validReviewPayload.reviewerRole,
				revieweeRole: validReviewPayload.revieweeRole,
				contractOutcome: validReviewPayload.contractOutcome,
				issuedAt: 1_700_000_301,
				expiresAt: Date.now() + 60_000,
				keyId: 'issuer-v1'
			})
		});

		hoisted.querySync.mockImplementation(async (_relays, filter: Record<string, unknown>) => {
			if (
				(filter.kinds as number[] | undefined)?.includes(REVIEW_NOSTR_KINDS.REVIEW) &&
				filter['#p']
			) {
				return [validReviewEvent, tamperedReviewEvent];
			}
			if (
				(filter.kinds as number[] | undefined)?.includes(REVIEW_NOSTR_KINDS.REVIEW) &&
				filter.authors
			) {
				return [];
			}
			if ((filter.kinds as number[] | undefined)?.includes(REVIEW_NOSTR_KINDS.ATTESTATION)) {
				return [validAttestationEvent, mismatchedAttestationEvent];
			}
			if ((filter.kinds as number[] | undefined)?.includes(REVIEW_NOSTR_KINDS.REPLY)) {
				return [spoofedReplyEvent, validReplyEvent];
			}
			return [];
		});

		vi.stubGlobal(
			'fetch',
			vi.fn(
				async () =>
					new Response(
						JSON.stringify({
							schemaVersion: REVIEWS_SCHEMA_VERSION,
							issuers: [
								{
									keyId: 'issuer-v1',
									pubkey: issuerPubkey,
									status: 'active',
									validFrom: 0,
									validUntil: null
								}
							]
						})
					)
			)
		);

		const { loadPublishedReviewsForUser } = await import('$lib/api/reviews/review-api');
		const result = await loadPublishedReviewsForUser(revieweePubkey);

		expect(result.given).toHaveLength(0);
		expect(result.received).toHaveLength(1);
		expect(result.received[0]).toMatchObject({
			id: validReviewEvent.id,
			verificationState: 'verified'
		});
		expect(result.received[0].reply?.id).toBe(validReplyEvent.id);
	}, 15000);

	it('treats expired attestations as unverified', async () => {
		const reviewerPubkey = '9'.repeat(64);
		const revieweePubkey = 'a'.repeat(64);
		const issuerPubkey = 'b'.repeat(64);
		const { payload, event } = await buildSignedReview({
			reviewerPubkey,
			revieweePubkey
		});

		const expiredAttestationEvent = buildSignedEvent({
			id: 'c'.repeat(64),
			kind: REVIEW_NOSTR_KINDS.ATTESTATION,
			pubkey: issuerPubkey,
			created_at: 1_700_000_300,
			tags: [
				['e', event.id],
				['d', payload.reviewDraftHash],
				['p', reviewerPubkey],
				['p', revieweePubkey]
			],
			content: JSON.stringify({
				schemaVersion: REVIEWS_SCHEMA_VERSION,
				reviewEventId: event.id,
				reviewDraftHash: payload.reviewDraftHash,
				subjectType: payload.subjectType,
				settlementType: payload.settlementType,
				reviewerPubkey,
				revieweePubkey,
				reviewerRole: payload.reviewerRole,
				revieweeRole: payload.revieweeRole,
				contractOutcome: payload.contractOutcome,
				issuedAt: 1_700_000_300,
				expiresAt: Date.now() - 1,
				keyId: 'issuer-v1'
			})
		});

		hoisted.querySync.mockImplementation(async (_relays, filter: Record<string, unknown>) => {
			if (
				(filter.kinds as number[] | undefined)?.includes(REVIEW_NOSTR_KINDS.REVIEW) &&
				filter['#p']
			) {
				return [event];
			}
			if (
				(filter.kinds as number[] | undefined)?.includes(REVIEW_NOSTR_KINDS.REVIEW) &&
				filter.authors
			) {
				return [];
			}
			if ((filter.kinds as number[] | undefined)?.includes(REVIEW_NOSTR_KINDS.ATTESTATION)) {
				return [expiredAttestationEvent];
			}
			return [];
		});

		vi.stubGlobal(
			'fetch',
			vi.fn(
				async () =>
					new Response(
						JSON.stringify({
							schemaVersion: REVIEWS_SCHEMA_VERSION,
							issuers: [
								{
									keyId: 'issuer-v1',
									pubkey: issuerPubkey,
									status: 'active',
									validFrom: 0,
									validUntil: null
								}
							]
						})
					)
			)
		);

		const { loadPublishedReviewsForUser } = await import('$lib/api/reviews/review-api');
		const result = await loadPublishedReviewsForUser(revieweePubkey);

		expect(result.received).toHaveLength(1);
		expect(result.received[0].verificationState).toBe('pending');
	}, 15000);

	it('rejects attestations whose keyId or validity window does not match the registry entry', async () => {
		const reviewerPubkey = 'd'.repeat(64);
		const revieweePubkey = 'e'.repeat(64);
		const issuerPubkey = 'f'.repeat(64);
		const { payload, event } = await buildSignedReview({
			reviewerPubkey,
			revieweePubkey
		});

		const wrongKeyIdAttestation = buildSignedEvent({
			id: '1'.repeat(64),
			kind: REVIEW_NOSTR_KINDS.ATTESTATION,
			pubkey: issuerPubkey,
			created_at: 1_700_000_300,
			tags: [
				['e', event.id],
				['d', payload.reviewDraftHash],
				['p', reviewerPubkey],
				['p', revieweePubkey]
			],
			content: JSON.stringify({
				schemaVersion: REVIEWS_SCHEMA_VERSION,
				reviewEventId: event.id,
				reviewDraftHash: payload.reviewDraftHash,
				subjectType: payload.subjectType,
				settlementType: payload.settlementType,
				reviewerPubkey,
				revieweePubkey,
				reviewerRole: payload.reviewerRole,
				revieweeRole: payload.revieweeRole,
				contractOutcome: payload.contractOutcome,
				issuedAt: 1_700_000_300,
				expiresAt: Date.now() + 60_000,
				keyId: 'issuer-v2'
			})
		});

		const outOfWindowAttestation = buildSignedEvent({
			id: '2'.repeat(64),
			kind: REVIEW_NOSTR_KINDS.ATTESTATION,
			pubkey: issuerPubkey,
			created_at: 1_700_000_301,
			tags: [
				['e', event.id],
				['d', payload.reviewDraftHash],
				['p', reviewerPubkey],
				['p', revieweePubkey]
			],
			content: JSON.stringify({
				schemaVersion: REVIEWS_SCHEMA_VERSION,
				reviewEventId: event.id,
				reviewDraftHash: payload.reviewDraftHash,
				subjectType: payload.subjectType,
				settlementType: payload.settlementType,
				reviewerPubkey,
				revieweePubkey,
				reviewerRole: payload.reviewerRole,
				revieweeRole: payload.revieweeRole,
				contractOutcome: payload.contractOutcome,
				issuedAt: 1_700_000_301,
				expiresAt: Date.now() + 60_000,
				keyId: 'issuer-v1'
			})
		});

		hoisted.querySync.mockImplementation(async (_relays, filter: Record<string, unknown>) => {
			if (
				(filter.kinds as number[] | undefined)?.includes(REVIEW_NOSTR_KINDS.REVIEW) &&
				filter['#p']
			) {
				return [event];
			}
			if (
				(filter.kinds as number[] | undefined)?.includes(REVIEW_NOSTR_KINDS.REVIEW) &&
				filter.authors
			) {
				return [];
			}
			if ((filter.kinds as number[] | undefined)?.includes(REVIEW_NOSTR_KINDS.ATTESTATION)) {
				return [wrongKeyIdAttestation, outOfWindowAttestation];
			}
			return [];
		});

		vi.stubGlobal(
			'fetch',
			vi.fn(
				async () =>
					new Response(
						JSON.stringify({
							schemaVersion: REVIEWS_SCHEMA_VERSION,
							issuers: [
								{
									keyId: 'issuer-v1',
									pubkey: issuerPubkey,
									status: 'retired',
									validFrom: 1_700_000_000,
									validUntil: 1_700_000_200
								}
							]
						})
					)
			)
		);

		const { loadPublishedReviewsForUser } = await import('$lib/api/reviews/review-api');
		const result = await loadPublishedReviewsForUser(revieweePubkey);

		expect(result.received).toHaveLength(1);
		expect(result.received[0].verificationState).toBe('pending');
	}, 15000);

	it('rejects attestations whose issuer keyId or validity window does not match the registry entry', async () => {
		const reviewerPubkey = 'd'.repeat(64);
		const revieweePubkey = 'e'.repeat(64);
		const issuerPubkey = 'f'.repeat(64);
		const { payload, event } = await buildSignedReview({
			reviewerPubkey,
			revieweePubkey
		});

		const mismatchedAttestationEvent = buildSignedEvent({
			id: '1'.repeat(64),
			kind: REVIEW_NOSTR_KINDS.ATTESTATION,
			pubkey: issuerPubkey,
			created_at: 1_700_000_300,
			tags: [
				['e', event.id],
				['d', payload.reviewDraftHash],
				['p', reviewerPubkey],
				['p', revieweePubkey]
			],
			content: JSON.stringify({
				schemaVersion: REVIEWS_SCHEMA_VERSION,
				reviewEventId: event.id,
				reviewDraftHash: payload.reviewDraftHash,
				subjectType: payload.subjectType,
				settlementType: payload.settlementType,
				reviewerPubkey,
				revieweePubkey,
				reviewerRole: payload.reviewerRole,
				revieweeRole: payload.revieweeRole,
				contractOutcome: payload.contractOutcome,
				issuedAt: 1_700_000_300,
				expiresAt: Date.now() + 60_000,
				keyId: 'issuer-v2'
			})
		});

		hoisted.querySync.mockImplementation(async (_relays, filter: Record<string, unknown>) => {
			if (
				(filter.kinds as number[] | undefined)?.includes(REVIEW_NOSTR_KINDS.REVIEW) &&
				filter['#p']
			) {
				return [event];
			}
			if (
				(filter.kinds as number[] | undefined)?.includes(REVIEW_NOSTR_KINDS.REVIEW) &&
				filter.authors
			) {
				return [];
			}
			if ((filter.kinds as number[] | undefined)?.includes(REVIEW_NOSTR_KINDS.ATTESTATION)) {
				return [mismatchedAttestationEvent];
			}
			return [];
		});

		vi.stubGlobal(
			'fetch',
			vi.fn(
				async () =>
					new Response(
						JSON.stringify({
							schemaVersion: REVIEWS_SCHEMA_VERSION,
							issuers: [
								{
									keyId: 'issuer-v1',
									pubkey: issuerPubkey,
									status: 'active',
									validFrom: 1_700_000_400,
									validUntil: null
								}
							]
						})
					)
			)
		);

		const { loadPublishedReviewsForUser } = await import('$lib/api/reviews/review-api');
		const result = await loadPublishedReviewsForUser(revieweePubkey);

		expect(result.received).toHaveLength(1);
		expect(result.received[0].verificationState).toBe('pending');
	}, 15000);

	it('reuses the last-known-good issuer registry when a fresh fetch fails', async () => {
		const issuerPubkey = 'e'.repeat(64);

		let registryFetchCount = 0;
		vi.stubGlobal(
			'fetch',
			vi.fn(async (input: RequestInfo | URL) => {
				const url = String(input);
				if (url.endsWith('/review-attestation-issuers')) {
					registryFetchCount += 1;
					if (registryFetchCount === 1) {
						return new Response(
							JSON.stringify({
								schemaVersion: REVIEWS_SCHEMA_VERSION,
								issuers: [
									{
										keyId: 'issuer-v1',
										pubkey: issuerPubkey,
										status: 'active',
										validFrom: 0,
										validUntil: null
									}
								]
							})
						);
					}

					return new Response('temporary outage', { status: 503 });
				}

				throw new Error(`Unexpected fetch url: ${url}`);
			})
		);

		const firstApi = await import('$lib/api/reviews/review-api');
		const first = await firstApi.loadIssuerRegistry();

		vi.resetModules();
		const secondApi = await import('$lib/api/reviews/review-api');
		const second = await secondApi.loadIssuerRegistry();

		expect(first.issuers).toHaveLength(1);
		expect(first.issuers[0]).toMatchObject({
			keyId: 'issuer-v1',
			pubkey: issuerPubkey,
			status: 'active'
		});
		expect(second.issuers).toHaveLength(1);
		expect(second.issuers[0]).toMatchObject({
			keyId: 'issuer-v1',
			pubkey: issuerPubkey,
			status: 'active'
		});
		expect(registryFetchCount).toBeGreaterThan(1);
	}, 15000);

	it('rejects a stale cached issuer registry after the freshness window elapses', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-03-31T12:00:00.000Z'));
		const issuerPubkey = 'f'.repeat(64);

		let registryFetchCount = 0;
		vi.stubGlobal(
			'fetch',
			vi.fn(async (input: RequestInfo | URL) => {
				const url = String(input);
				if (url.endsWith('/review-attestation-issuers')) {
					registryFetchCount += 1;
					if (registryFetchCount === 1) {
						return new Response(
							JSON.stringify({
								schemaVersion: REVIEWS_SCHEMA_VERSION,
								issuers: [
									{
										keyId: 'issuer-v1',
										pubkey: issuerPubkey,
										status: 'active',
										validFrom: 0,
										validUntil: null
									}
								]
							})
						);
					}

					return new Response('temporary outage', { status: 503 });
				}

				throw new Error(`Unexpected fetch url: ${url}`);
			})
		);

		try {
			const firstApi = await import('$lib/api/reviews/review-api');
			await firstApi.loadIssuerRegistry();

			vi.resetModules();
			vi.setSystemTime(new Date('2026-03-31T12:16:00.000Z'));
			const secondApi = await import('$lib/api/reviews/review-api');
			await expect(secondApi.loadIssuerRegistry()).rejects.toThrow('temporary outage');
			expect(registryFetchCount).toBe(2);
		} finally {
			vi.useRealTimers();
		}
	}, 15000);

	it('flushes any locally queued review publish before loading reviews', async () => {
		const reviewerPubkey = 'a'.repeat(64);
		const revieweePubkey = 'b'.repeat(64);

		// Mock getNpub to return the reviewer's pubkey
		hoisted.getNpub.mockResolvedValue(reviewerPubkey);

		const reviewEventId = '9'.repeat(64);
		const reviewDraftHash = 'c'.repeat(64);
		const eventCreatedAt = 1_700_000_000;
		const eventTags = [['p', revieweePubkey]];
		const eventContent = JSON.stringify(
			buildReviewFixture({
				reviewDraftHash,
				revieweePubkey
			})
		);
		const eventSig = 'f'.repeat(128);

		// The expected reconstructed event that will be published
		const expectedReviewEvent = {
			id: reviewEventId,
			pubkey: reviewerPubkey,
			created_at: eventCreatedAt,
			kind: REVIEW_NOSTR_KINDS.REVIEW,
			tags: eventTags,
			content: eventContent,
			sig: eventSig
		};

		// Set up the globalThis outbox with the correct structure
		// (must match PendingReviewPublishRecordBase + ReadyReviewPublishRecord)
		(globalThis as { __reviewsPublishOutbox?: unknown[] }).__reviewsPublishOutbox = [
			{
				stage: 'ready_to_publish',
				reviewEventId,
				reviewDraftHash,
				reviewerPubkey,
				savedAt: Date.now() - 1000, // Recent enough to be fresh
				eventContent,
				eventTags,
				eventCreatedAt,
				eventSig,
				attestationEventId: 'd'.repeat(64)
			}
		];
		hoisted.publishToMultipleRelays.mockResolvedValue([
			{ relay: 'wss://relay.example.test', success: true }
		]);
		hoisted.querySync.mockResolvedValue([]);
		vi.stubGlobal(
			'fetch',
			vi.fn(
				async () =>
					new Response(
						JSON.stringify({
							schemaVersion: REVIEWS_SCHEMA_VERSION,
							issuers: []
						})
					)
			)
		);

		const { loadPublishedReviewsForUser } = await import('$lib/api/reviews/review-api');
		await loadPublishedReviewsForUser(revieweePubkey);

		expect(hoisted.publishToMultipleRelays).toHaveBeenCalledWith(expectedReviewEvent);
		expect((globalThis as { __reviewsPublishOutbox?: unknown[] }).__reviewsPublishOutbox).toEqual(
			[]
		);
	}, 15000);

	it('recovers a pre-attestation outbox entry before loading reviews', async () => {
		const reviewerPubkey = 'c'.repeat(64);
		const revieweePubkey = 'd'.repeat(64);
		const reviewerWallet = {
			address: '0x0000000000000000000000000000000000000abc',
			signMessage: vi.fn(async () => `0x${'5'.repeat(130)}`)
		};
		hoisted.getNostrKeyPair.mockResolvedValue({
			nsec: Uint8Array.from(Buffer.from('11'.repeat(32), 'hex')),
			npub: reviewerPubkey
		});
		hoisted.getWallet.mockReturnValue(reviewerWallet);
		// Mock getNpub to return the reviewer's pubkey for getCurrentReviewerPubkey()
		hoisted.getNpub.mockResolvedValue(reviewerPubkey);

		const reviewPayload = buildReviewFixture({
			reviewDraftHash: '0'.repeat(64),
			revieweePubkey,
			createdAt: 1_700_000_000
		});
		const reviewDraftHash = await computeReviewDraftHashFromPayload(reviewPayload);

		// Build the event fields individually for proper outbox structure
		const reviewEventId = '9'.repeat(64);
		const eventCreatedAt = reviewPayload.createdAt;
		const eventTags = [
			['p', revieweePubkey],
			['d', reviewDraftHash]
		];
		const eventContent = JSON.stringify({
			...reviewPayload,
			reviewDraftHash
		});
		const eventSig = 'f'.repeat(128);

		// The expected reconstructed event that will be published
		const expectedReviewEvent = {
			id: reviewEventId,
			pubkey: reviewerPubkey,
			created_at: eventCreatedAt,
			kind: REVIEW_NOSTR_KINDS.REVIEW,
			tags: eventTags,
			content: eventContent,
			sig: eventSig
		};

		// Set up the globalThis outbox with the correct structure
		// (must match PendingReviewPublishRecordBase + PendingReviewAttestationRecord)
		(globalThis as { __reviewsPublishOutbox?: unknown[] }).__reviewsPublishOutbox = [
			{
				stage: 'awaiting_attestation',
				reviewEventId,
				reviewDraftHash,
				reviewerPubkey,
				savedAt: Date.now() - 1000, // Recent enough to be fresh
				eventContent,
				eventTags,
				eventCreatedAt,
				eventSig,
				context: {
					subjectId: 'task-123',
					settlementId: 'escrow-123',
					chain: 'rsk',
					asset: 'rbtc',
					contractAddress: '0x0000000000000000000000000000000000000123',
					reviewerWallet: reviewerWallet.address,
					revieweeWallet: '0x0000000000000000000000000000000000000def',
					reviewerNpub: reviewerPubkey,
					revieweeNpub: revieweePubkey
				}
			}
		];

		hoisted.publishToMultipleRelays.mockResolvedValue([
			{ relay: 'wss://relay.example.test', success: true }
		]);
		hoisted.querySync.mockResolvedValue([]);

		vi.stubGlobal(
			'fetch',
			vi.fn(async (input: RequestInfo | URL) => {
				const url = String(input);
				if (url.endsWith('/review-attestation-issuers')) {
					return new Response(
						JSON.stringify({
							schemaVersion: REVIEWS_SCHEMA_VERSION,
							issuers: []
						})
					);
				}

				if (url.endsWith('/review-attestations/challenge')) {
					const challengeToken = `v1.${'a'.repeat(24)}.${'b'.repeat(128)}`;
					return new Response(
						JSON.stringify({
							schemaVersion: REVIEWS_SCHEMA_VERSION,
							challengeId: 'challenge-recovery-1',
							challengeToken,
							challengeMessage: buildReviewAttestationChallengeMessage({
								challengeToken,
								slotHash: 'a'.repeat(64),
								reviewDraftHash,
								nonce: '4'.repeat(32),
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
							attestationEventId: 'a'.repeat(64),
							issuerPubkey: 'b'.repeat(64),
							reviewDraftHash,
							issuedAt: 1_700_000_010
						})
					);
				}

				throw new Error(`Unexpected fetch url: ${url}`);
			})
		);

		const { loadPublishedReviewsForUser } = await import('$lib/api/reviews/review-api');
		await loadPublishedReviewsForUser(revieweePubkey);

		expect(reviewerWallet.signMessage).toHaveBeenCalled();
		expect(hoisted.publishToMultipleRelays).toHaveBeenCalledWith(expectedReviewEvent);
		expect((globalThis as { __reviewsPublishOutbox?: unknown[] }).__reviewsPublishOutbox).toEqual(
			[]
		);
	}, 15000);

	it('prunes stale outbox entries before attempting recovery', async () => {
		const staleSavedAt = Date.now() - 25 * 60 * 60 * 1000;
		const queuedReviewEvent = buildSignedEvent({
			id: 'e'.repeat(64),
			kind: REVIEW_NOSTR_KINDS.REVIEW,
			pubkey: 'c'.repeat(64),
			created_at: 1_700_000_000,
			tags: [
				['p', 'd'.repeat(64)],
				['d', 'f'.repeat(64)]
			],
			content: JSON.stringify(
				buildReviewFixture({
					reviewDraftHash: 'f'.repeat(64),
					revieweePubkey: 'd'.repeat(64),
					createdAt: 1_700_000_000
				})
			)
		});

		window.localStorage.setItem(
			'reviews.publish-outbox.v1',
			JSON.stringify([
				{
					stage: 'awaiting_attestation',
					reviewEvent: queuedReviewEvent,
					reviewDraftHash: 'f'.repeat(64),
					savedAt: staleSavedAt,
					context: {
						subjectId: 'task-123',
						settlementId: 'escrow-123',
						chain: 'rsk',
						asset: 'rbtc',
						contractAddress: '0x0000000000000000000000000000000000000123',
						reviewerWallet: '0x0000000000000000000000000000000000000abc',
						revieweeWallet: '0x0000000000000000000000000000000000000def',
						reviewerNpub: 'c'.repeat(64),
						revieweeNpub: 'd'.repeat(64)
					}
				}
			])
		);
		(globalThis as { __reviewsPublishOutbox?: unknown[] }).__reviewsPublishOutbox = [];
		hoisted.querySync.mockResolvedValue([]);
		hoisted.publishToMultipleRelays.mockResolvedValue([
			{ relay: 'wss://relay.example.test', success: true }
		]);
		vi.stubGlobal(
			'fetch',
			vi.fn(
				async () =>
					new Response(
						JSON.stringify({
							schemaVersion: REVIEWS_SCHEMA_VERSION,
							issuers: []
						})
					)
			)
		);

		const { loadPublishedReviewsForUser } = await import('$lib/api/reviews/review-api');
		await loadPublishedReviewsForUser('d'.repeat(64));

		expect(hoisted.publishToMultipleRelays).not.toHaveBeenCalled();
		expect(window.localStorage.getItem('reviews.publish-outbox.v1')).toBeNull();
	});
});

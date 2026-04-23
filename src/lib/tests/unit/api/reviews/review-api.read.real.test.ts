// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateSecretKey, getPublicKey } from 'nostr-tools';
import { finalizeEvent } from 'nostr-tools/pure';
import {
	REVIEW_NOSTR_KINDS,
	REVIEWS_SCHEMA_VERSION,
	buildReviewFixture,
	buildReviewReplyFixture,
	computeReviewDraftHashFromPayload,
	type ReviewEventPayload
} from '@reviews-contracts';

const hoisted = vi.hoisted(() => ({
	querySync: vi.fn(),
	getSignedEvent: vi.fn(),
	publishToMultipleRelays: vi.fn(),
	getNostrKeyPair: vi.fn(),
	getNpub: vi.fn(),
	getWallet: vi.fn()
}));

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

vi.mock('$lib/stores/task.store', async () => {
	const { readable } = await import('svelte/store');
	return {
		TASKS_PER_PAGE: 10,
		tasksStore: readable([]),
		myTasksStore: readable([])
	};
});

vi.mock('$lib/api/services/push-notification.service', () => ({
	pushNotificationService: {
		sendNotificationToNpubs: vi.fn(),
		sendNotificationToDevice: vi.fn(),
		subscribeToTopic: vi.fn(),
		unsubscribeFromTopic: vi.fn()
	}
}));

vi.mock('$lib/utils/helpers/deviceIdentity', () => ({
	getDeviceIdentifier: vi.fn().mockResolvedValue('device-stub'),
	createUserDeviceShortName: vi.fn().mockResolvedValue('device-stub'),
	getDeviceName: vi.fn().mockResolvedValue('device-stub'),
	createUserFriendlyName: vi.fn((value: string) => value),
	getNpubShortId: vi.fn().mockReturnValue(''),
	generatePasskeyName: vi.fn().mockResolvedValue({
		displayName: 'device-stub',
		name: 'device-stub'
	})
}));

vi.mock('$lib/nostr/task', () => ({
	createTask: vi.fn(),
	createRecurringTask: vi.fn(),
	getTaskStableId: vi.fn(() => 'task-stub'),
	updateTask: vi.fn(),
	deleteTask: vi.fn(),
	publishToRelays: vi.fn(),
	subscribeToTasks: vi.fn(),
	queryTasks: vi.fn(),
	getTaskById: vi.fn()
}));

vi.mock('$lib/reviews', () => ({
	buildVerifiedReviewRecord: (input: {
		reviewEvent: { id: string; pubkey: string };
		reviewPayload: ReviewEventPayload;
		attestationEvent?: { id: string } | null;
		attestationPayload?: unknown | null;
		replyEvent?: { id: string } | null;
		replyPayload?: ReturnType<typeof buildReviewReplyFixture> | null;
	}) => ({
		id: input.reviewEvent.id,
		reviewDraftHash: input.reviewPayload.reviewDraftHash,
		reviewerPubkey: input.reviewEvent.pubkey,
		revieweePubkey: input.reviewPayload.revieweePubkey,
		subjectType: input.reviewPayload.subjectType,
		settlementType: input.reviewPayload.settlementType,
		contractOutcome: input.reviewPayload.contractOutcome,
		verificationState: input.attestationEvent && input.attestationPayload ? 'verified' : 'pending',
		createdAt: input.reviewPayload.createdAt,
		overallRating: input.reviewPayload.rating.overallRating,
		content: {
			en: input.reviewPayload.content.en.comment,
			es: input.reviewPayload.content.es.comment,
			authoredLanguage: input.reviewPayload.content.sourceLanguage
		},
		categoryScores: [],
		attachments: [],
		reply:
			input.replyEvent && input.replyPayload
				? {
						id: input.replyEvent.id,
						parentReviewEventId: input.replyPayload.parentReviewEventId,
						revieweePubkey: input.replyPayload.revieweePubkey,
						content: {
							en: input.replyPayload.content.en.comment,
							es: input.replyPayload.content.es.comment,
							authoredLanguage: input.replyPayload.content.sourceLanguage
						},
						createdAt: input.replyPayload.createdAt,
						attachments: []
					}
				: null
	}),
	buildReviewStatsSummary: (reviews: Array<{ overallRating: number }>) => ({
		averageRating:
			reviews.length === 0
				? 0
				: Number(
						(
							reviews.reduce((total, review) => total + review.overallRating, 0) / reviews.length
						).toFixed(2)
					),
		totalReviews: reviews.length,
		ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
	})
}));

function createMemoryStorage(): Storage {
	const entries = new Map<string, string>();
	return {
		get length() {
			return entries.size;
		},
		clear() {
			entries.clear();
		},
		getItem(key: string) {
			return entries.has(key) ? entries.get(key)! : null;
		},
		key(index: number) {
			return [...entries.keys()][index] ?? null;
		},
		removeItem(key: string) {
			entries.delete(key);
		},
		setItem(key: string, value: string) {
			entries.set(key, value);
		}
	} as Storage;
}

function signEvent(input: {
	kind: number;
	pubkey: string;
	created_at: number;
	tags: string[][];
	content: string;
	secretKey: Uint8Array;
}) {
	return finalizeEvent(
		{
			kind: input.kind,
			pubkey: input.pubkey,
			created_at: input.created_at,
			tags: input.tags,
			content: input.content
		},
		input.secretKey
	);
}

async function buildSignedReviewEvent(input: {
	reviewerSecret: Uint8Array;
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
	const event = signEvent({
		kind: REVIEW_NOSTR_KINDS.REVIEW,
		pubkey: input.reviewerPubkey,
		created_at: payload.createdAt,
		tags: [
			['p', payload.revieweePubkey],
			['d', payload.reviewDraftHash]
		],
		content: JSON.stringify(payload),
		secretKey: input.reviewerSecret
	});

	return { event, payload, reviewerPubkey: input.reviewerPubkey };
}

describe('review api read-side real verification', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.restoreAllMocks();
		hoisted.querySync.mockReset();
		hoisted.getSignedEvent.mockReset();
		hoisted.publishToMultipleRelays.mockReset();
		hoisted.getNostrKeyPair.mockReset();
		hoisted.getWallet.mockReset();
		vi.stubEnv('VITE_REVIEW_ATTESTATION_API_URL', 'https://reviews-api.example.test');
		vi.stubGlobal(
			'fetch',
			vi.fn(async (input: RequestInfo | URL) => {
				const url = String(input);
				if (url.endsWith('/review-attestation-issuers')) {
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

				throw new Error(`Unexpected fetch url: ${url}`);
			})
		);

		Object.defineProperty(globalThis, 'localStorage', {
			value: createMemoryStorage(),
			configurable: true,
			writable: true
		});
		(globalThis as { __reviewsIssuerRegistryCache?: unknown }).__reviewsIssuerRegistryCache = null;
	});

	let issuerPubkey = '0'.repeat(64);

	it('verifies real signed reviews, replies, and attestations through the read path', async () => {
		const reviewerSecret = generateSecretKey();
		const revieweeSecret = generateSecretKey();
		const attackerSecret = generateSecretKey();
		const issuerSecret = generateSecretKey();

		const revieweePubkey = getPublicKey(revieweeSecret);
		issuerPubkey = getPublicKey(issuerSecret);
		vi.stubEnv('VITE_REVIEW_ATTESTATION_API_URL', 'https://reviews-api.example.test');
		Object.assign(import.meta.env, {
			VITE_REVIEW_ATTESTATION_API_URL: 'https://reviews-api.example.test'
		});

		const {
			event: validReviewEvent,
			payload: validReviewPayload,
			reviewerPubkey
		} = await buildSignedReviewEvent({
			reviewerSecret,
			reviewerPubkey: getPublicKey(reviewerSecret),
			revieweePubkey
		});

		const { event: tamperedReviewEventBase, payload: tamperedPayloadBase } =
			await buildSignedReviewEvent({
				reviewerSecret,
				reviewerPubkey,
				revieweePubkey,
				overrides: {
					createdAt: 1_700_000_120
				}
			});
		const tamperedReviewEvent = signEvent({
			kind: REVIEW_NOSTR_KINDS.REVIEW,
			pubkey: reviewerPubkey,
			created_at: tamperedPayloadBase.createdAt,
			tags: tamperedReviewEventBase.tags,
			content: JSON.stringify({
				...tamperedPayloadBase,
				content: {
					...tamperedPayloadBase.content,
					en: { comment: 'Tampered after hashing' }
				}
			}),
			secretKey: reviewerSecret
		});

		const validReplyPayload = buildReviewReplyFixture({
			parentReviewEventId: validReviewEvent.id,
			revieweePubkey,
			createdAt: 1_700_000_200
		});
		const validReplyEvent = signEvent({
			kind: REVIEW_NOSTR_KINDS.REPLY,
			pubkey: revieweePubkey,
			created_at: validReplyPayload.createdAt,
			tags: [
				['e', validReplyPayload.parentReviewEventId],
				['p', validReplyPayload.revieweePubkey]
			],
			content: JSON.stringify(validReplyPayload),
			secretKey: revieweeSecret
		});

		const spoofedReplyPayload = buildReviewReplyFixture({
			parentReviewEventId: validReviewEvent.id,
			revieweePubkey,
			createdAt: 1_700_000_150
		});
		const spoofedReplyEvent = signEvent({
			kind: REVIEW_NOSTR_KINDS.REPLY,
			pubkey: getPublicKey(attackerSecret),
			created_at: spoofedReplyPayload.createdAt,
			tags: [
				['e', spoofedReplyPayload.parentReviewEventId],
				['p', spoofedReplyPayload.revieweePubkey]
			],
			content: JSON.stringify(spoofedReplyPayload),
			secretKey: attackerSecret
		});

		const validAttestationEvent = signEvent({
			kind: REVIEW_NOSTR_KINDS.ATTESTATION,
			pubkey: issuerPubkey,
			created_at: 1_700_000_300,
			tags: [
				['e', validReviewEvent.id],
				['d', validReviewPayload.reviewDraftHash],
				['p', reviewerPubkey],
				['p', revieweePubkey],
				['subject', validReviewPayload.subjectType],
				['settlement', validReviewPayload.settlementType]
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
			}),
			secretKey: issuerSecret
		});

		hoisted.querySync.mockImplementation(async (_relays, filter: Record<string, unknown>) => {
			if ((filter.kinds as number[])?.includes(REVIEW_NOSTR_KINDS.REVIEW) && filter['#p']) {
				return [validReviewEvent, tamperedReviewEvent];
			}
			if ((filter.kinds as number[])?.includes(REVIEW_NOSTR_KINDS.REVIEW) && filter.authors) {
				return [];
			}
			if ((filter.kinds as number[])?.includes(REVIEW_NOSTR_KINDS.ATTESTATION)) {
				return [validAttestationEvent];
			}
			if ((filter.kinds as number[])?.includes(REVIEW_NOSTR_KINDS.REPLY)) {
				return [spoofedReplyEvent, validReplyEvent];
			}
			return [];
		});

		const { loadPublishedReviewsForUser } = await import('$lib/api/reviews/review-api');
		const result = await loadPublishedReviewsForUser(revieweePubkey);

		expect(result.given).toHaveLength(0);
		expect(result.received).toHaveLength(1);
		expect(result.received[0]).toMatchObject({
			id: validReviewEvent.id,
			verificationState: 'verified'
		});
		expect(result.received[0].reply?.id).toBe(validReplyEvent.id);
		expect(result.received[0].reply?.revieweePubkey).toBe(revieweePubkey);
	}, 15000);

	it('rejects attestations outside the issuer validity window', async () => {
		const reviewerSecret = generateSecretKey();
		const revieweeSecret = generateSecretKey();
		const issuerSecret = generateSecretKey();
		const revieweePubkey = getPublicKey(revieweeSecret);
		issuerPubkey = getPublicKey(issuerSecret);
		vi.stubEnv('VITE_REVIEW_ATTESTATION_API_URL', 'https://reviews-api.example.test');
		Object.assign(import.meta.env, {
			VITE_REVIEW_ATTESTATION_API_URL: 'https://reviews-api.example.test'
		});

		const {
			event: reviewEvent,
			payload,
			reviewerPubkey
		} = await buildSignedReviewEvent({
			reviewerSecret,
			reviewerPubkey: getPublicKey(reviewerSecret),
			revieweePubkey
		});

		const attestationEvent = signEvent({
			kind: REVIEW_NOSTR_KINDS.ATTESTATION,
			pubkey: issuerPubkey,
			created_at: 1_700_000_300,
			tags: [
				['e', reviewEvent.id],
				['d', payload.reviewDraftHash],
				['p', reviewerPubkey],
				['p', revieweePubkey]
			],
			content: JSON.stringify({
				schemaVersion: REVIEWS_SCHEMA_VERSION,
				reviewEventId: reviewEvent.id,
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
				keyId: 'issuer-v1'
			}),
			secretKey: issuerSecret
		});

		hoisted.querySync.mockImplementation(async (_relays, filter: Record<string, unknown>) => {
			if ((filter.kinds as number[])?.includes(REVIEW_NOSTR_KINDS.REVIEW) && filter['#p']) {
				return [reviewEvent];
			}
			if ((filter.kinds as number[])?.includes(REVIEW_NOSTR_KINDS.ATTESTATION)) {
				return [attestationEvent];
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
									validFrom: 1_700_000_301_000,
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
	});
});

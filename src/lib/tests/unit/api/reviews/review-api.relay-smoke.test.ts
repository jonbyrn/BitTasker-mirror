// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Skip this test suite if the backend module is not available
// The backend is in a separate repository and not always present
let backendAvailable = false;
let createReviewsAttestationApp: unknown;
let createInMemoryReviewStateClient: unknown;
let RelayReviewNostrPublisher: unknown;

try {
	const appModule = await import('../../../../../../reviews-attestation-backend/src/app');
	const stateModule = await import('../../../../../../reviews-attestation-backend/src/state');
	const publisherModule = await import(
		'../../../../../../reviews-attestation-backend/src/nostr-publisher'
	);
	createReviewsAttestationApp = appModule.createReviewsAttestationApp;
	createInMemoryReviewStateClient = stateModule.createInMemoryReviewStateClient;
	RelayReviewNostrPublisher = publisherModule.RelayReviewNostrPublisher;
	backendAvailable = true;
} catch {
	// Backend not available - tests will be skipped
}

import { WebSocketServer, type WebSocket } from 'ws';
import {
	SimplePool,
	finalizeEvent,
	generateSecretKey,
	getPublicKey,
	type Event as NostrEvent
} from 'nostr-tools';
import { npubEncode, nsecEncode } from 'nostr-tools/nip19';
import { Wallet } from 'ethers';
import {
	REVIEW_NOSTR_KINDS,
	buildReviewFixture,
	computeReviewDraftHashFromPayload,
	type ReviewEventPayload
} from '@reviews-contracts';

// Type imports for when backend is available
type ReviewsAttestationEnv = unknown;
type ReviewStateNamespace = unknown;
type ReviewableSettlementRecord = unknown;

type FilterShape = {
	ids?: string[];
	kinds?: number[];
	authors?: string[];
	limit?: number;
	[key: `#${string}`]: string[] | number[] | undefined;
};

function createStore<T>(initialValue: T) {
	let value = initialValue;
	const subscribers = new Set<(nextValue: T) => void>();

	return {
		subscribe(subscriber: (nextValue: T) => void) {
			subscriber(value);
			subscribers.add(subscriber);
			return () => subscribers.delete(subscriber);
		},
		set(nextValue: T) {
			value = nextValue;
			for (const subscriber of subscribers) {
				subscriber(value);
			}
		}
	};
}

const hoisted = vi.hoisted(() => ({
	appStoreState: createStore({
		pool: null as unknown as SimplePool,
		relays: [] as string[]
	}),
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

vi.mock('$lib/stores/app.store', () => ({
	appStore: {
		subscribe: hoisted.appStoreState.subscribe
	}
}));

vi.mock('$lib/api/services/push-notification.service', () => ({
	pushNotificationService: {
		sendNotificationToNpubs: vi.fn(),
		sendNotificationToDevice: vi.fn(),
		subscribeToTopic: vi.fn(),
		unsubscribeFromTopic: vi.fn()
	}
}));

vi.mock('$lib/reviews', () => ({
	buildVerifiedReviewRecord: (input: {
		reviewEvent: { id: string; pubkey: string };
		reviewPayload: ReviewEventPayload;
		attestationEvent?: { id: string } | null;
		attestationPayload?: unknown | null;
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
		reply: null
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

function json(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: { 'content-type': 'application/json' }
	});
}

function createNamespace(state = createInMemoryReviewStateClient()): ReviewStateNamespace {
	return {
		idFromName(name: string) {
			return name as unknown as DurableObjectId;
		},
		get() {
			return {
				async fetch(input: RequestInfo | URL, init?: RequestInit) {
					const url = new URL(
						typeof input === 'string' || input instanceof URL ? String(input) : input.url
					);
					const body = init?.body ? JSON.parse(String(init.body)) : {};
					switch (url.pathname) {
						case '/ratelimit/check':
							return json(
								await state.checkRateLimit(body.bucketKey, body.limit, body.windowSeconds, body.now)
							);
						case '/slots/get':
							return json(await state.getIssuedSlot(body.slotHash));
						case '/slots/claim':
							return json(await state.claimIssuedSlot(body));
						default:
							return json({ error: 'not_found' }, 404);
					}
				}
			} as DurableObjectStub;
		}
	};
}

function normalizeTagValues(values: unknown): string[] {
	if (!Array.isArray(values)) {
		return [];
	}

	return values.map((value) => String(value).toLowerCase());
}

function matchesFilter(event: NostrEvent, filter: FilterShape): boolean {
	if (filter.ids?.length && !filter.ids.includes(event.id)) {
		return false;
	}
	if (filter.kinds?.length && !filter.kinds.includes(event.kind)) {
		return false;
	}
	if (
		filter.authors?.length &&
		!filter.authors.map((value) => value.toLowerCase()).includes(event.pubkey.toLowerCase())
	) {
		return false;
	}

	for (const [key, rawValues] of Object.entries(filter)) {
		if (!key.startsWith('#')) {
			continue;
		}

		const tagName = key.slice(1);
		const expectedValues = normalizeTagValues(rawValues);
		if (expectedValues.length === 0) {
			continue;
		}

		const eventValues = event.tags
			.filter((tag) => tag[0] === tagName)
			.map((tag) => String(tag[1] ?? '').toLowerCase());
		if (!eventValues.some((value) => expectedValues.includes(value))) {
			return false;
		}
	}

	return true;
}

function createRelayServer() {
	const events = new Map<string, NostrEvent>();
	const server = new WebSocketServer({ port: 0 });

	server.on('connection', (socket: WebSocket) => {
		socket.on('message', (raw) => {
			const message = JSON.parse(raw.toString()) as [string, ...unknown[]];
			if (message[0] === 'EVENT') {
				const event = message[1] as NostrEvent;
				events.set(event.id, event);
				socket.send(JSON.stringify(['OK', event.id, true, 'accepted']));
				return;
			}

			if (message[0] === 'REQ') {
				const subscriptionId = String(message[1]);
				const filters = message.slice(2) as FilterShape[];
				const matches = [...events.values()].filter((event) =>
					filters.some((filter) => matchesFilter(event, filter))
				);
				const limited =
					typeof filters[0]?.limit === 'number' ? matches.slice(0, filters[0].limit) : matches;
				for (const event of limited) {
					socket.send(JSON.stringify(['EVENT', subscriptionId, event]));
				}
				socket.send(JSON.stringify(['EOSE', subscriptionId]));
			}
		});
	});

	return {
		server,
		events
	};
}

async function waitForListening(server: WebSocketServer): Promise<number> {
	await new Promise<void>((resolve) => server.once('listening', () => resolve()));
	const address = server.address();
	if (!address || typeof address === 'string') {
		throw new Error('Expected ephemeral relay port');
	}
	return address.port;
}

async function buildReviewPayload(revieweePubkey: string): Promise<ReviewEventPayload> {
	const basePayload = buildReviewFixture({
		reviewDraftHash: '0'.repeat(64),
		revieweePubkey,
		createdAt: 1_700_000_000
	});
	const reviewDraftHash = await computeReviewDraftHashFromPayload(basePayload);
	return {
		...basePayload,
		reviewDraftHash
	};
}

function createSignedEvent(input: {
	kind: number;
	created_at: number;
	pubkey: string;
	tags: string[][];
	content: string;
	secretKey: Uint8Array;
}) {
	return finalizeEvent(
		{
			kind: input.kind,
			created_at: input.created_at,
			pubkey: input.pubkey,
			tags: input.tags,
			content: input.content
		},
		input.secretKey
	);
}

function makeSettlement(
	reviewerPubkey: string,
	revieweePubkey: string,
	reviewerWallet: string
): ReviewableSettlementRecord {
	return {
		subjectType: 'task',
		subjectId: 'task-789',
		settlementType: 'escrow',
		settlementId: 'escrow-789',
		chain: 'rsk',
		asset: 'rbtc',
		contractAddress: '0x0000000000000000000000000000000000000789',
		contractVersion: '1',
		reviewerRole: 'tasker',
		revieweeRole: 'taskee',
		reviewerNpub: reviewerPubkey,
		revieweeNpub: revieweePubkey,
		reviewerWallet,
		revieweeWallet: '0x0000000000000000000000000000000000000bbb',
		blockchainState: 'funds_released',
		completedAt: 1_700_000_000_000,
		reviewableAt: 1_700_000_001_000,
		contractOutcome: 'completed',
		status: 'reviewable',
		sourceVisibility: 'public_present',
		sourcePresentation: {
			label: 'Task 789',
			href: 'https://example.com/task/789'
		},
		sourceRefs: {
			escrowId: 'escrow-789'
		}
	};
}

describe.skipIf(!backendAvailable)('review api relay smoke', () => {
	let relay: ReturnType<typeof createRelayServer> | null = null;
	let relayUrl = '';
	let pool: SimplePool | null = null;
	let publisher: RelayReviewNostrPublisher | null = null;

	const reviewerSecret = generateSecretKey();
	const reviewerPubkey = getPublicKey(reviewerSecret);
	const revieweePubkey = getPublicKey(generateSecretKey());
	const issuerSecret = generateSecretKey();
	const issuerPubkey = getPublicKey(issuerSecret);
	const reviewerWallet = Wallet.createRandom();

	beforeEach(async () => {
		vi.resetModules();
		vi.restoreAllMocks();
		hoisted.getSignedEvent.mockReset();
		hoisted.publishToMultipleRelays.mockReset();
		hoisted.getNostrKeyPair.mockReset();
		hoisted.getWallet.mockReset();
		relay = createRelayServer();
		const port = await waitForListening(relay.server);
		relayUrl = `ws://127.0.0.1:${port}`;
		pool = new SimplePool();
		hoisted.appStoreState.set({
			pool,
			relays: [relayUrl]
		});
		publisher = new RelayReviewNostrPublisher([relayUrl], 4_000);

		vi.stubEnv('VITE_REVIEW_ATTESTATION_API_URL', 'https://reviews-api.example.test');
		vi.stubGlobal('localStorage', createMemoryStorage());

		hoisted.getNostrKeyPair.mockResolvedValue({
			npub: reviewerPubkey,
			nsec: reviewerSecret
		});
		hoisted.getWallet.mockReturnValue({
			address: reviewerWallet.address,
			signMessage: (message: string) => reviewerWallet.signMessage(message)
		});
		hoisted.getSignedEvent.mockImplementation(async (event: Partial<NostrEvent>) =>
			createSignedEvent({
				kind: event.kind!,
				created_at: event.created_at ?? Math.floor(Date.now() / 1000),
				pubkey: reviewerPubkey,
				tags: event.tags ?? [],
				content: event.content ?? '',
				secretKey: reviewerSecret
			})
		);
		hoisted.publishToMultipleRelays.mockImplementation(
			async (event: NostrEvent, relays = [relayUrl]) => {
				if (!pool) {
					throw new Error('Expected relay pool');
				}
				const results = await Promise.all(
					relays.map(async (relayTarget) => {
						try {
							await Promise.all(pool.publish([relayTarget], event));
							return { relay: relayTarget, success: true };
						} catch (error) {
							return {
								relay: relayTarget,
								success: false,
								error: error instanceof Error ? error.message : 'publish_failed'
							};
						}
					})
				);
				return results;
			}
		);

		const settlement = makeSettlement(reviewerPubkey, revieweePubkey, reviewerWallet.address);
		const env: ReviewsAttestationEnv = {
			REVIEW_STATE: createNamespace(),
			REVIEW_ATTESTATION_ISSUER_KEY_ID: 'issuer-v1',
			REVIEW_ATTESTATION_ISSUER_NPUB: npubEncode(issuerPubkey),
			REVIEW_ATTESTATION_ISSUER_NSEC: nsecEncode(issuerSecret),
			REVIEWS_SETTLEMENT_REGISTRY_JSON: JSON.stringify([settlement]),
			REVIEW_ATTESTATION_NOSTR_RELAYS_JSON: JSON.stringify([relayUrl]),
			REVIEW_ATTESTATION_ISSUER_REGISTRY_JSON: '[]'
		};

		const worker = createReviewsAttestationApp(env, { publisher });
		vi.stubGlobal(
			'fetch',
			vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
				const url = new URL(
					typeof input === 'string' || input instanceof URL ? String(input) : input.url
				);
				return worker.request(url.pathname, init, env);
			})
		);
	});

	afterEach(async () => {
		vi.unstubAllEnvs();
		vi.unstubAllGlobals();
		publisher?.destroy();
		if (pool && typeof pool.close === 'function') {
			pool.close([relayUrl]);
		}
		await new Promise<void>((resolve) => {
			if (!relay) {
				resolve();
				return;
			}
			relay.server.close(() => resolve());
			relay = null;
		});
	});

	it('submits a review through the worker and reads it back from a real relay', async () => {
		const { submitAttestedReview, loadPublishedReviewsForUser } = await import(
			'$lib/api/reviews/review-api'
		);

		const review = await buildReviewPayload(revieweePubkey);
		const result = await submitAttestedReview({
			review,
			subjectId: 'task-789',
			settlementId: 'escrow-789',
			chain: 'rsk',
			asset: 'rbtc',
			contractAddress: '0x0000000000000000000000000000000000000789',
			reviewerWallet: reviewerWallet.address,
			revieweeWallet: '0x0000000000000000000000000000000000000bbb',
			reviewerNpub: npubEncode(reviewerPubkey),
			revieweeNpub: npubEncode(revieweePubkey)
		});

		expect(result.reviewEventId).toBeTruthy();
		expect(result.attestationEventId).toBeTruthy();

		await waitForEventCount(() => relay?.events.size ?? 0, 2);

		const reviews = await loadPublishedReviewsForUser(reviewerPubkey);
		expect(reviews.given).toHaveLength(1);
		expect(reviews.received).toHaveLength(0);
		expect(reviews.given[0]?.id).toBe(result.reviewEventId);
		expect(reviews.given[0]?.verificationState).toBe('verified');
		expect(reviews.given[0]?.content.en).toBe(review.content.en.comment);

		const attestationEvent = [...(relay?.events.values() ?? [])].find(
			(event) => event.kind === REVIEW_NOSTR_KINDS.ATTESTATION
		);
		expect(attestationEvent).toBeTruthy();
	});
});

async function waitForEventCount(readCount: () => number, expectedCount: number): Promise<void> {
	const timeoutAt = Date.now() + 5_000;
	while (readCount() < expectedCount) {
		if (Date.now() >= timeoutAt) {
			throw new Error(`Timed out waiting for ${expectedCount} relay events`);
		}
		await new Promise((resolve) => setTimeout(resolve, 25));
	}
}

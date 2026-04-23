import { get } from 'svelte/store';
import { bytesToHex } from '@noble/hashes/utils';
import { sha256 } from '@noble/hashes/sha256';
import { schnorr } from '@noble/curves/secp256k1';
import { nip19, type Event as NostrEvent, verifyEvent } from 'nostr-tools';
import { getSignedEvent, publishToMultipleRelays } from '$lib/utils/nostr';
import { getNostrKeyPair, getNpub } from '$lib/utils/nostrKeys';
import { getWallet } from '$lib/stores/wallet.store';
import { appStore } from '$lib/stores/app.store';
import { z } from 'zod';
import {
	REVIEWS_SCHEMA_VERSION,
	REVIEW_NOSTR_KINDS,
	REVIEW_TAG_NAMES,
	attestationEventPayloadSchema,
	attestationRequestSchema,
	attestationResponseSchema,
	issuerRegistryResponseSchema,
	isReplyAuthorAllowed,
	reviewErrorResponseSchema,
	reviewEventPayloadSchema,
	reviewReplyCandidateSchema,
	reviewReplyEventPayloadSchema,
	selectCanonicalReviewReply,
	verifyReviewDraftHash,
	type AttestationChallengeRequest,
	type AttestationRequest,
	type AttestationResponse,
	type IssuerRegistryEntry,
	type ReviewIssuerRegistryResponse,
	type ReviewChallengeResponse,
	type ReviewEventPayload,
	type ReviewReplyEventPayload
} from '@reviews-contracts';
import {
	buildVerifiedReviewRecord,
	buildReviewStatsSummary,
	type VerifiedReviewRecord
} from '$lib/reviews';

function getReviewApiBaseUrl(): string | null {
	const configured = import.meta.env.VITE_REVIEW_ATTESTATION_API_URL;
	return typeof configured === 'string' && configured.trim().length > 0 ? configured.trim() : null;
}

function getReviewTranslationApiBaseUrl(): string | null {
	const configured = import.meta.env.VITE_REVIEW_TRANSLATION_API_URL;
	return typeof configured === 'string' && configured.trim().length > 0 ? configured.trim() : null;
}

function getRelayContext() {
	const state = get(appStore);
	if (!state.pool || !state.relays?.length) {
		throw new Error('Nostr relays are not configured');
	}

	return {
		pool: state.pool,
		relays: state.relays.filter(Boolean)
	};
}

function parseCurrentPubkey(value: string): string {
	return value.startsWith('npub') ? ((nip19.decode(value).data as string) ?? value) : value;
}

function toNpub(value: string): string {
	return value.startsWith('npub') ? value : nip19.npubEncode(value);
}

function dedupeEvents(events: NostrEvent[]): NostrEvent[] {
	return [...new Map(events.map((event) => [event.id, event])).values()];
}

import { localEncryptionService } from '$lib/services/security/local-encryption.service';

const REVIEW_ISSUER_REGISTRY_CACHE_KEY = 'reviews.issuer-registry.last-good.v1';
const REVIEW_PUBLISH_OUTBOX_KEY = 'reviews.publish-outbox.v3';
const REVIEW_ISSUER_REGISTRY_CACHE_TTL_MS = 15 * 60 * 1000;
const REVIEW_PUBLISH_OUTBOX_TTL_MS = 24 * 60 * 60 * 1000;

let isOutboxFlushing = false;

async function encryptOutboxData(data: string): Promise<string> {
	return await localEncryptionService.encrypt(data);
}

async function decryptOutboxData(encryptedJson: string): Promise<string> {
	return await localEncryptionService.decrypt(encryptedJson);
}

type CachedIssuerRegistryRecord = {
	registry: ReviewIssuerRegistryResponse;
	cachedAt: number;
	cacheVersion: 1;
};

let issuerRegistryMemoryCache: CachedIssuerRegistryRecord | null = null;

type ReviewIssuerRegistryCacheHost = typeof globalThis & {
	__reviewsIssuerRegistryCache?: CachedIssuerRegistryRecord | null;
};

type ReviewPublishOutboxHost = typeof globalThis & {
	__reviewsPublishOutbox?: PendingReviewPublishRecord[];
};

function getIssuerRegistryCacheHost(): ReviewIssuerRegistryCacheHost {
	return globalThis as ReviewIssuerRegistryCacheHost;
}

function getReviewPublishOutboxHost(): ReviewPublishOutboxHost {
	return globalThis as ReviewPublishOutboxHost;
}

function getBrowserStorage(): Storage | null {
	if (typeof window !== 'undefined' && window.localStorage) {
		return window.localStorage;
	}

	if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis) {
		return globalThis.localStorage;
	}

	return null;
}

function isFreshIssuerRegistryCache(cache: CachedIssuerRegistryRecord, now = Date.now()): boolean {
	return now - cache.cachedAt <= REVIEW_ISSUER_REGISTRY_CACHE_TTL_MS;
}

function clearCachedIssuerRegistry(): void {
	issuerRegistryMemoryCache = null;
	getIssuerRegistryCacheHost().__reviewsIssuerRegistryCache = null;

	const storage = getBrowserStorage();
	if (!storage) {
		return;
	}

	try {
		storage.removeItem(REVIEW_ISSUER_REGISTRY_CACHE_KEY);
	} catch {
		// Best-effort cache cleanup only.
	}
}

function readCachedIssuerRegistry(now = Date.now()): ReviewIssuerRegistryResponse | null {
	if (issuerRegistryMemoryCache) {
		if (isFreshIssuerRegistryCache(issuerRegistryMemoryCache, now)) {
			return issuerRegistryMemoryCache.registry;
		}

		clearCachedIssuerRegistry();
		return null;
	}

	const globalCache = getIssuerRegistryCacheHost().__reviewsIssuerRegistryCache;
	if (globalCache) {
		if (isFreshIssuerRegistryCache(globalCache, now)) {
			issuerRegistryMemoryCache = globalCache;
			return globalCache.registry;
		}

		clearCachedIssuerRegistry();
		return null;
	}

	const storage = getBrowserStorage();
	if (!storage) {
		return null;
	}

	try {
		const raw = storage.getItem(REVIEW_ISSUER_REGISTRY_CACHE_KEY);
		if (!raw) {
			return null;
		}

		const parsed = JSON.parse(raw) as CachedIssuerRegistryRecord | ReviewIssuerRegistryResponse;
		if (
			parsed &&
			typeof parsed === 'object' &&
			'registry' in parsed &&
			'cachedAt' in parsed &&
			typeof parsed.cachedAt === 'number'
		) {
			const cached: CachedIssuerRegistryRecord = {
				registry: issuerRegistryResponseSchema.parse(parsed.registry),
				cachedAt: parsed.cachedAt,
				cacheVersion: 1
			};
			if (!isFreshIssuerRegistryCache(cached, now)) {
				clearCachedIssuerRegistry();
				return null;
			}

			issuerRegistryMemoryCache = cached;
			return cached.registry;
		}

		return null;
	} catch {
		return null;
	}
}

function writeCachedIssuerRegistry(registry: ReviewIssuerRegistryResponse): void {
	const cached: CachedIssuerRegistryRecord = {
		registry,
		cachedAt: Date.now(),
		cacheVersion: 1
	};
	issuerRegistryMemoryCache = cached;
	getIssuerRegistryCacheHost().__reviewsIssuerRegistryCache = cached;

	const storage = getBrowserStorage();
	if (!storage) {
		return;
	}

	try {
		storage.setItem(REVIEW_ISSUER_REGISTRY_CACHE_KEY, JSON.stringify(cached));
	} catch {
		// Best-effort cache only.
	}
}

type PendingReviewPublishRecordBase = {
	reviewEventId: string;
	reviewDraftHash: string;
	reviewerPubkey: string;
	savedAt: number;
	eventContent: string;
	eventTags: string[][];
	eventCreatedAt: number;
	eventSig: string;
};

type PendingReviewAttestationContext = {
	subjectId: string;
	settlementId: string;
	chain: AttestationChallengeRequest['chain'];
	asset: AttestationChallengeRequest['asset'];
	contractAddress: string;
	revieweeWallet: string;
	reviewerWallet?: string;
	reviewerNpub?: string;
	revieweeNpub?: string;
};

type PendingReviewAttestationRecord = PendingReviewPublishRecordBase & {
	stage: 'awaiting_attestation';
	context: PendingReviewAttestationContext;
};

type ReadyReviewPublishRecord = PendingReviewPublishRecordBase & {
	stage: 'ready_to_publish';
	attestationEventId: string;
	context?: PendingReviewAttestationContext;
};

type PendingReviewPublishRecord = PendingReviewAttestationRecord | ReadyReviewPublishRecord;

function reconstructNostrEvent(entry: PendingReviewPublishRecordBase): NostrEvent {
	return {
		id: entry.reviewEventId,
		pubkey: entry.reviewerPubkey,
		created_at: entry.eventCreatedAt,
		kind: REVIEW_NOSTR_KINDS.REVIEW,
		tags: entry.eventTags,
		content: entry.eventContent,
		sig: entry.eventSig
	};
}

function isFreshPendingReviewPublishRecord(
	entry: Pick<PendingReviewPublishRecord, 'savedAt'>,
	now = Date.now()
): boolean {
	return now - entry.savedAt <= REVIEW_PUBLISH_OUTBOX_TTL_MS;
}

function normalizePendingReviewAttestationContext(
	raw: unknown
): PendingReviewAttestationContext | null {
	if (!raw || typeof raw !== 'object') {
		return null;
	}

	const candidate = raw as Record<string, unknown>;
	if (
		typeof candidate.subjectId !== 'string' ||
		typeof candidate.settlementId !== 'string' ||
		(candidate.chain !== 'rsk' && candidate.chain !== 'bsc') ||
		(candidate.asset !== 'rbtc' && candidate.asset !== 'usdt') ||
		typeof candidate.contractAddress !== 'string' ||
		typeof candidate.revieweeWallet !== 'string'
	) {
		return null;
	}

	return {
		subjectId: candidate.subjectId,
		settlementId: candidate.settlementId,
		chain: candidate.chain as AttestationChallengeRequest['chain'],
		asset: candidate.asset as AttestationChallengeRequest['asset'],
		contractAddress: candidate.contractAddress,
		revieweeWallet: candidate.revieweeWallet,
		reviewerWallet:
			typeof candidate.reviewerWallet === 'string' ? candidate.reviewerWallet : undefined,
		reviewerNpub: typeof candidate.reviewerNpub === 'string' ? candidate.reviewerNpub : undefined,
		revieweeNpub: typeof candidate.revieweeNpub === 'string' ? candidate.revieweeNpub : undefined
	};
}

function serializePendingReviewPublishRecord(
	entry: PendingReviewPublishRecord
): PendingReviewPublishRecord {
	const base: PendingReviewPublishRecordBase = {
		reviewEventId: entry.reviewEventId,
		reviewDraftHash: entry.reviewDraftHash,
		reviewerPubkey: entry.reviewerPubkey,
		savedAt: entry.savedAt,
		eventContent: entry.eventContent,
		eventTags: entry.eventTags,
		eventCreatedAt: entry.eventCreatedAt,
		eventSig: entry.eventSig
	};

	if (entry.stage !== 'awaiting_attestation') {
		return {
			...base,
			stage: 'ready_to_publish',
			attestationEventId: entry.attestationEventId,
			context: entry.context
				? {
						subjectId: entry.context.subjectId,
						settlementId: entry.context.settlementId,
						chain: entry.context.chain,
						asset: entry.context.asset,
						contractAddress: entry.context.contractAddress,
						revieweeWallet: entry.context.revieweeWallet,
						reviewerWallet: entry.context.reviewerWallet,
						reviewerNpub: entry.context.reviewerNpub,
						revieweeNpub: entry.context.revieweeNpub
					}
				: undefined
		};
	}

	return {
		...base,
		stage: 'awaiting_attestation',
		context: {
			subjectId: entry.context.subjectId,
			settlementId: entry.context.settlementId,
			chain: entry.context.chain,
			asset: entry.context.asset,
			contractAddress: entry.context.contractAddress,
			revieweeWallet: entry.context.revieweeWallet,
			reviewerWallet: entry.context.reviewerWallet,
			reviewerNpub: entry.context.reviewerNpub,
			revieweeNpub: entry.context.revieweeNpub
		}
	};
}

function normalizePendingReviewPublishRecord(raw: unknown): PendingReviewPublishRecord | null {
	if (!raw || typeof raw !== 'object') {
		return null;
	}

	const candidate = raw as Record<string, unknown>;
	const reviewEventId =
		typeof candidate.reviewEventId === 'string' ? candidate.reviewEventId : null;
	const reviewDraftHash =
		typeof candidate.reviewDraftHash === 'string' ? candidate.reviewDraftHash : null;
	const reviewerPubkey =
		typeof candidate.reviewerPubkey === 'string' ? candidate.reviewerPubkey : null;
	const savedAt = typeof candidate.savedAt === 'number' ? candidate.savedAt : Date.now();
	const eventContent = typeof candidate.eventContent === 'string' ? candidate.eventContent : null;
	const eventTags = Array.isArray(candidate.eventTags) ? (candidate.eventTags as string[][]) : null;
	const eventCreatedAt =
		typeof candidate.eventCreatedAt === 'number' ? candidate.eventCreatedAt : null;
	const eventSig = typeof candidate.eventSig === 'string' ? candidate.eventSig : null;

	if (
		!reviewEventId ||
		!reviewDraftHash ||
		!reviewerPubkey ||
		!eventContent ||
		!eventTags ||
		!eventCreatedAt ||
		!eventSig
	) {
		return null;
	}

	if (!isFreshPendingReviewPublishRecord({ savedAt })) {
		return null;
	}

	const base: PendingReviewPublishRecordBase = {
		reviewEventId,
		reviewDraftHash,
		reviewerPubkey,
		savedAt,
		eventContent,
		eventTags,
		eventCreatedAt,
		eventSig
	};

	if (
		candidate.stage === 'awaiting_attestation' &&
		candidate.context &&
		typeof candidate.context === 'object'
	) {
		const context = normalizePendingReviewAttestationContext(candidate.context);
		if (!context) {
			return null;
		}

		return {
			...base,
			stage: 'awaiting_attestation',
			context
		};
	}

	if (candidate.stage === 'ready_to_publish' && typeof candidate.attestationEventId === 'string') {
		return {
			...base,
			stage: 'ready_to_publish',
			attestationEventId: candidate.attestationEventId,
			context:
				candidate.context && typeof candidate.context === 'object'
					? (normalizePendingReviewAttestationContext(candidate.context) ?? undefined)
					: undefined
		};
	}

	return null;
}

async function readReviewPublishOutbox(): Promise<PendingReviewPublishRecord[]> {
	const globalOutbox = getReviewPublishOutboxHost().__reviewsPublishOutbox;
	if (globalOutbox?.length) {
		return globalOutbox;
	}

	const storage = getBrowserStorage();
	if (!storage) {
		return globalOutbox ?? [];
	}

	try {
		const rawEncrypted = storage.getItem(REVIEW_PUBLISH_OUTBOX_KEY);
		if (!rawEncrypted) {
			return globalOutbox ?? [];
		}

		const currentPubkey = await getCurrentReviewerPubkey().catch(() => null);
		if (!currentPubkey) return [];

		const raw = await decryptOutboxData(rawEncrypted, currentPubkey);
		const parsed = JSON.parse(raw) as unknown[];
		const normalized = Array.isArray(parsed)
			? parsed
					.map((entry) => normalizePendingReviewPublishRecord(entry))
					.filter((entry): entry is PendingReviewPublishRecord => entry !== null)
					.filter((entry) => entry.reviewerPubkey.toLowerCase() === currentPubkey.toLowerCase())
			: [];

		if (normalized.length === 0) {
			try {
				storage.removeItem(REVIEW_PUBLISH_OUTBOX_KEY);
			} catch {
				// Best-effort cleanup only.
			}
		}
		getReviewPublishOutboxHost().__reviewsPublishOutbox = normalized;
		return normalized;
	} catch {
		return globalOutbox ?? [];
	}
}

async function writeReviewPublishOutbox(entries: PendingReviewPublishRecord[]): Promise<void> {
	const freshEntries = entries.filter((entry) => isFreshPendingReviewPublishRecord(entry));
	getReviewPublishOutboxHost().__reviewsPublishOutbox = freshEntries;
	const storage = getBrowserStorage();
	if (!storage) {
		return;
	}

	try {
		if (freshEntries.length === 0) {
			storage.removeItem(REVIEW_PUBLISH_OUTBOX_KEY);
			return;
		}

		const currentPubkey = await getCurrentReviewerPubkey().catch(() => null);
		if (!currentPubkey) return;

		const serialized = JSON.stringify(
			freshEntries.map((entry) => serializePendingReviewPublishRecord(entry))
		);
		const encrypted = await encryptOutboxData(serialized, currentPubkey);

		storage.setItem(REVIEW_PUBLISH_OUTBOX_KEY, encrypted);
	} catch (error) {
		console.warn('Failed to persist review outbox:', error);
	}
}

async function upsertPendingReviewPublish(entry: PendingReviewPublishRecord): Promise<void> {
	const existing = await readReviewPublishOutbox();
	const next = existing.filter((record) => record.reviewEventId !== entry.reviewEventId);
	next.push(entry);
	await writeReviewPublishOutbox(next);
}

async function removePendingReviewPublish(reviewEventId: string): Promise<void> {
	const current = await readReviewPublishOutbox();
	const next = current.filter((entry) => entry.reviewEventId !== reviewEventId);
	await writeReviewPublishOutbox(next);
}

function isReadyReviewPublishRecord(
	entry: PendingReviewPublishRecord
): entry is ReadyReviewPublishRecord {
	return entry.stage === 'ready_to_publish';
}

function parseReviewPayloadFromSignedEvent(event: NostrEvent): ReviewEventPayload {
	return reviewEventPayloadSchema.parse(JSON.parse(event.content));
}

const reviewChallengeResponseEnvelopeSchema = z.object({
	schemaVersion: z.number().int(),
	challengeId: z.string().min(1).optional(),
	challengeToken: z.string().min(1),
	challengeMessage: z.string().min(1),
	issuedAt: z.number().int().nonnegative(),
	expiresAt: z.number().int().nonnegative()
});

type ReviewChallengeResponseEnvelope = z.infer<typeof reviewChallengeResponseEnvelopeSchema>;

export class ReviewApiRequestError extends Error {
	constructor(
		message: string,
		public readonly status: number,
		public readonly code?: string,
		public readonly retryAfterSeconds?: number,
		public readonly body?: unknown
	) {
		super(message);
		this.name = 'ReviewApiRequestError';
	}
}

async function signNostrChallengeMessage(message: string): Promise<string> {
	const { nsec } = await getNostrKeyPair();
	const digest = sha256(new TextEncoder().encode(message));
	return bytesToHex(schnorr.sign(digest, nsec));
}

async function signWalletChallengeMessage(
	chain: AttestationChallengeRequest['chain'],
	message: string
): Promise<`0x${string}`> {
	const wallet = getWallet(chain === 'bsc' ? 'bsc' : 'rsk');
	if (!wallet) {
		throw new Error(`Connect your ${chain.toUpperCase()} wallet before requesting attestation`);
	}

	return (await wallet.signMessage(message)) as `0x${string}`;
}

function getCurrentWalletAddress(chain: AttestationChallengeRequest['chain']): string {
	const wallet = getWallet(chain === 'bsc' ? 'bsc' : 'rsk');
	if (!wallet) {
		throw new Error(`Connect your ${chain.toUpperCase()} wallet before requesting attestation`);
	}

	return wallet.address;
}

async function issueAttestationForPendingReview(
	entry: PendingReviewAttestationRecord
): Promise<ReadyReviewPublishRecord> {
	const currentPubkey = await getCurrentReviewerPubkey();
	if (entry.reviewerPubkey.toLowerCase() !== currentPubkey.toLowerCase()) {
		throw new Error('Identity mismatch: outbox item belongs to another account');
	}

	const reviewEvent = reconstructNostrEvent(entry);
	const reviewPayload = parseReviewPayloadFromSignedEvent(reviewEvent);
	const reviewerNpub = toNpub(currentPubkey);
	const revieweeNpub = entry.context.revieweeNpub ?? toNpub(reviewPayload.revieweePubkey);
	const reviewerWallet =
		entry.context.reviewerWallet ?? getCurrentWalletAddress(entry.context.chain);

	// Optimization: Fetch challenge BEFORE prompting for signatures to reduce perceived latency
	const challengeRequest = {
		reviewDraftHash: entry.reviewDraftHash,
		subjectType: reviewPayload.subjectType,
		subjectId: entry.context.subjectId,
		settlementType: reviewPayload.settlementType,
		settlementId: entry.context.settlementId,
		chain: entry.context.chain,
		asset: entry.context.asset,
		contractAddress: entry.context.contractAddress,
		reviewerNpub,
		revieweeNpub,
		reviewerWallet,
		revieweeWallet: entry.context.revieweeWallet
	} satisfies AttestationChallengeRequest;

	const challenge = await requestReviewAttestationChallenge(challengeRequest);
	const challengeMessage = challenge.challengeMessage;

	// Optimization: Use consolidated key retrieval if available to trigger only ONE biometric prompt
	// for both Nostr and Wallet keys.
	let nostrChallengeSignature: string;
	let walletChallengeSignature: `0x${string}`;

	try {
		// Attempt consolidated biometric auth first
		const { nsec, mnemonic } = await import('$lib/utils/nostrKeys').then((m) => m.getAllKeys());
		const digest = sha256(new TextEncoder().encode(challengeMessage));
		nostrChallengeSignature = bytesToHex(schnorr.sign(digest, nsec));

		const { ethers } = await import('ethers');
		const wallet = ethers.HDNodeWallet.fromPhrase(mnemonic, undefined, "m/44'/60'/0'/0/0");
		walletChallengeSignature = (await wallet.signMessage(challengeMessage)) as `0x${string}`;
	} catch (error) {
		// Fallback for Alby or if consolidated auth is unavailable
		console.log('Consolidated auth unavailable, falling back to sequential prompts:', error);
		nostrChallengeSignature = await signNostrChallengeMessage(challengeMessage);
		walletChallengeSignature = await signWalletChallengeMessage(
			entry.context.chain,
			challengeMessage
		);
	}

	const attestationRequest = attestationRequestSchema.parse({
		schemaVersion: REVIEWS_SCHEMA_VERSION,
		reviewDraftHash: entry.reviewDraftHash,
		signedReviewEvent: reviewEvent,
		challengeToken: challenge.challengeToken,
		nostrChallengeSignature,
		walletChallengeSignature,
		subjectType: reviewPayload.subjectType,
		subjectId: entry.context.subjectId,
		settlementType: reviewPayload.settlementType,
		settlementId: entry.context.settlementId,
		chain: entry.context.chain,
		asset: entry.context.asset,
		contractAddress: entry.context.contractAddress,
		reviewerNpub,
		revieweeNpub,
		reviewerWallet,
		revieweeWallet: entry.context.revieweeWallet
	});

	const attestation = await requestReviewAttestation(attestationRequest);
	return {
		stage: 'ready_to_publish',
		reviewEventId: entry.reviewEventId,
		reviewDraftHash: entry.reviewDraftHash,
		reviewerPubkey: entry.reviewerPubkey,
		savedAt: Date.now(),
		eventContent: entry.eventContent,
		eventTags: entry.eventTags,
		eventCreatedAt: entry.eventCreatedAt,
		eventSig: entry.eventSig,
		attestationEventId: attestation.attestationEventId,
		context: entry.context
	};
}

async function publishReviewEventWithRecovery(entry: ReadyReviewPublishRecord): Promise<void> {
	const currentPubkey = await getCurrentReviewerPubkey();
	if (entry.reviewerPubkey.toLowerCase() !== currentPubkey.toLowerCase()) {
		throw new Error('Identity mismatch: outbox item belongs to another account');
	}

	const reviewEvent = reconstructNostrEvent(entry);
	const relayResults = await publishToMultipleRelays(reviewEvent);
	if (!relayResults.some((result) => result.success)) {
		throw new Error('Failed to publish review event to any relay');
	}

	await removePendingReviewPublish(entry.reviewEventId);
}

async function flushPendingReviewPublishOutbox(): Promise<void> {
	if (isOutboxFlushing) return;
	isOutboxFlushing = true;

	try {
		const pending = await readReviewPublishOutbox();
		const currentPubkey = await getCurrentReviewerPubkey().catch(() => null);
		if (!currentPubkey) return;

		let publishedCount = 0;

		for (const entry of pending) {
			if (entry.reviewerPubkey.toLowerCase() !== currentPubkey.toLowerCase()) {
				continue;
			}

			try {
				const readyEntry = isReadyReviewPublishRecord(entry)
					? entry
					: await issueAttestationForPendingReview(entry);
				if (!isReadyReviewPublishRecord(entry)) {
					await upsertPendingReviewPublish(readyEntry);
				}
				await publishReviewEventWithRecovery(readyEntry);
				publishedCount++;
			} catch (error) {
				console.warn(`Failed to process outbox entry ${entry.reviewEventId}:`, error);
				// Leave the entry in the outbox for a later retry.
			}
		}

		if (publishedCount > 0) {
			try {
				// Using get from svelte-i18n for non-reactive translation
				const { t: i18n } = await import('svelte-i18n');
				const { get: getTranslation } = await import('svelte/store');
				const message = getTranslation(i18n)('reviews.outbox_published_success', {
					values: { count: publishedCount }
				});
				appStore.showSuccessToast(message);
			} catch {
				// Best-effort toast only.
			}
		}
	} finally {
		isOutboxFlushing = false;
	}
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
	const baseUrl = getReviewApiBaseUrl();
	if (!baseUrl) {
		throw new ReviewApiRequestError(
			'Review attestation API is not configured',
			500,
			'api_not_configured'
		);
	}

	const response = await fetch(`${baseUrl.replace(/\/$/, '')}${path}`, {
		headers: {
			'Content-Type': 'application/json',
			...(init?.headers ?? {})
		},
		...init
	});

	if (!response.ok) {
		const body = await response.text().catch(() => '');
		if (body) {
			let parsedError: {
				message: string;
				code: string;
				retryAfterSeconds?: number;
			} | null = null;
			try {
				const parsed = reviewErrorResponseSchema.safeParse(JSON.parse(body));
				if (parsed.success) {
					parsedError = parsed.data;
				}
			} catch {
				// Fall through to the raw response body below.
			}

			if (parsedError) {
				throw new ReviewApiRequestError(
					parsedError.message,
					response.status,
					parsedError.code,
					parsedError.retryAfterSeconds,
					parsedError
				);
			}
		}

		throw new ReviewApiRequestError(
			body || `Review API request failed with ${response.status}`,
			response.status,
			undefined,
			Number(response.headers.get('retry-after') || '') || undefined,
			body || null
		);
	}

	return (await response.json()) as T;
}

async function queryEvents(filter: Record<string, unknown>): Promise<NostrEvent[]> {
	const { pool, relays } = getRelayContext();
	return pool.querySync(relays, filter as Parameters<typeof pool.querySync>[1], {
		maxWait: 4000
	});
}

function parseReviewPayload(event: NostrEvent): ReviewEventPayload | null {
	if (!verifyEvent(event) || event.kind !== REVIEW_NOSTR_KINDS.REVIEW) {
		return null;
	}

	try {
		return reviewEventPayloadSchema.parse(JSON.parse(event.content));
	} catch {
		return null;
	}
}

function parseReplyPayload(event: NostrEvent) {
	if (!verifyEvent(event) || event.kind !== REVIEW_NOSTR_KINDS.REPLY) {
		return null;
	}

	try {
		const payload = reviewReplyEventPayloadSchema.parse(JSON.parse(event.content));
		return reviewReplyCandidateSchema.parse({
			...payload,
			eventId: event.id
		});
	} catch {
		return null;
	}
}

function parseAttestationPayload(event: NostrEvent) {
	if (!verifyEvent(event) || event.kind !== REVIEW_NOSTR_KINDS.ATTESTATION) {
		return null;
	}

	try {
		return attestationEventPayloadSchema.parse(JSON.parse(event.content));
	} catch {
		return null;
	}
}

function isAttestationValidForReview(input: {
	reviewEvent: NostrEvent;
	reviewPayload: ReviewEventPayload;
	attestationPayload: NonNullable<ReturnType<typeof parseAttestationPayload>>;
	now: number;
}): boolean {
	const { reviewEvent, reviewPayload, attestationPayload, now } = input;
	return (
		attestationPayload.expiresAt > now &&
		attestationPayload.reviewEventId === reviewEvent.id &&
		attestationPayload.reviewDraftHash === reviewPayload.reviewDraftHash &&
		attestationPayload.reviewerPubkey.toLowerCase() === reviewEvent.pubkey.toLowerCase() &&
		attestationPayload.revieweePubkey.toLowerCase() ===
			reviewPayload.revieweePubkey.toLowerCase() &&
		attestationPayload.subjectType === reviewPayload.subjectType &&
		attestationPayload.settlementType === reviewPayload.settlementType &&
		attestationPayload.reviewerRole === reviewPayload.reviewerRole &&
		attestationPayload.revieweeRole === reviewPayload.revieweeRole &&
		attestationPayload.contractOutcome === reviewPayload.contractOutcome
	);
}

function resolveTrustedIssuerEntry(input: {
	issuerRegistry: { issuers: IssuerRegistryEntry[] };
	attestationEvent: NostrEvent;
	attestationPayload: NonNullable<ReturnType<typeof parseAttestationPayload>>;
}): IssuerRegistryEntry | null {
	const { issuerRegistry, attestationEvent, attestationPayload } = input;
	const issuerPubkey = attestationEvent.pubkey.toLowerCase();
	const issuedAt = attestationPayload.issuedAt;

	return (
		issuerRegistry.issuers.find((issuer) => {
			if (issuer.keyId !== attestationPayload.keyId) {
				return false;
			}

			if (issuer.pubkey.toLowerCase() !== issuerPubkey) {
				return false;
			}

			if (issuedAt < issuer.validFrom) {
				return false;
			}

			if (
				issuer.validUntil !== null &&
				issuer.validUntil !== undefined &&
				issuedAt > issuer.validUntil
			) {
				return false;
			}

			return true;
		}) ?? null
	);
}

export async function getCurrentReviewerPubkey(): Promise<string> {
	return parseCurrentPubkey(await getNpub());
}

export async function getCurrentReviewerNpub(): Promise<string> {
	return toNpub(await getNpub());
}

export async function loadIssuerRegistry() {
	try {
		const registry = issuerRegistryResponseSchema.parse(
			await fetchJson('/review-attestation-issuers')
		);
		writeCachedIssuerRegistry(registry);
		return registry;
	} catch (error) {
		const cached = readCachedIssuerRegistry();
		if (cached) {
			return cached;
		}

		throw error;
	}
}

export async function loadPublishedReviewsForUser(currentUserPubkey: string): Promise<{
	given: VerifiedReviewRecord[];
	received: VerifiedReviewRecord[];
}> {
	await flushPendingReviewPublishOutbox();

	const normalizedCurrentUser = currentUserPubkey.toLowerCase();
	const now = Date.now();
	const issuerRegistry = await loadIssuerRegistry().catch(() => ({
		schemaVersion: REVIEWS_SCHEMA_VERSION,
		issuers: []
	}));
	const trustedIssuerPubkeys = new Set(
		issuerRegistry.issuers.map((issuer) => issuer.pubkey.toLowerCase())
	);

	const initialLimit = 50;
	let givenEvents: NostrEvent[] = [];
	let receivedEvents: NostrEvent[] = [];

	async function fetchPaginated(filterBase: Record<string, unknown>): Promise<NostrEvent[]> {
		const allEvents: NostrEvent[] = [];
		let lastTimestamp: number | undefined;
		let hasMore = true;

		while (hasMore) {
			const filter = {
				...filterBase,
				limit: initialLimit,
				...(lastTimestamp ? { until: lastTimestamp - 1 } : {})
			};
			const events = await queryEvents(filter);
			if (events.length === 0) {
				hasMore = false;
			} else {
				allEvents.push(...events);
				// Stop if we got fewer than requested, or if we have enough for initial display
				// (We still want pagination but maybe not infinite loop in one go)
				if (events.length < initialLimit || allEvents.length >= 200) {
					hasMore = false;
				} else {
					lastTimestamp = Math.min(...events.map((e) => e.created_at));
				}
			}
		}
		return allEvents;
	}

	[givenEvents, receivedEvents] = await Promise.all([
		fetchPaginated({
			kinds: [REVIEW_NOSTR_KINDS.REVIEW],
			authors: [normalizedCurrentUser]
		}),
		fetchPaginated({
			kinds: [REVIEW_NOSTR_KINDS.REVIEW],
			'#p': [normalizedCurrentUser]
		})
	]);

	const reviewEvents = dedupeEvents([...givenEvents, ...receivedEvents]);
	const reviewEventIds = reviewEvents.map((e) => e.id);

	let attestationEvents: NostrEvent[] = [];
	let replyEvents: NostrEvent[] = [];

	if (reviewEventIds.length > 0) {
		const CHUNK_SIZE = 50;
		const idChunks: string[][] = [];
		for (let i = 0; i < reviewEventIds.length; i += CHUNK_SIZE) {
			idChunks.push(reviewEventIds.slice(i, i + CHUNK_SIZE));
		}

		const metadataResults = await Promise.all(
			idChunks.flatMap((chunk) => [
				trustedIssuerPubkeys.size > 0
					? queryEvents({
							kinds: [REVIEW_NOSTR_KINDS.ATTESTATION],
							authors: [...trustedIssuerPubkeys],
							'#e': chunk,
							limit: 100 // Reasonable chunk safety
						})
					: Promise.resolve([]),
				queryEvents({
					kinds: [REVIEW_NOSTR_KINDS.REPLY],
					'#e': chunk,
					limit: 100
				})
			])
		);

		for (let i = 0; i < metadataResults.length; i++) {
			if (i % 2 === 0) {
				attestationEvents.push(...metadataResults[i]);
			} else {
				replyEvents.push(...metadataResults[i]);
			}
		}
		attestationEvents = dedupeEvents(attestationEvents);
		replyEvents = dedupeEvents(replyEvents);
	}

	const reviewPayloadEntries = (
		await Promise.all(
			reviewEvents.map(async (event) => {
				const payload = parseReviewPayload(event);
				if (!payload || !(await verifyReviewDraftHash(payload))) {
					return null;
				}

				return { event, payload };
			})
		)
	).filter((entry): entry is { event: NostrEvent; payload: ReviewEventPayload } => entry !== null);
	const reviewPayloadById = new Map(reviewPayloadEntries.map((entry) => [entry.event.id, entry]));

	const attestationMap = new Map<
		string,
		{
			event: NostrEvent;
			payload: NonNullable<ReturnType<typeof parseAttestationPayload>>;
		}
	>();
	for (const event of attestationEvents) {
		const payload = parseAttestationPayload(event);
		if (!payload) {
			continue;
		}
		const trustedIssuer = resolveTrustedIssuerEntry({
			issuerRegistry,
			attestationEvent: event,
			attestationPayload: payload
		});
		if (!trustedIssuer) {
			continue;
		}
		if (payload.expiresAt <= now) {
			continue;
		}

		const existing = attestationMap.get(payload.reviewEventId);
		if (!existing) {
			attestationMap.set(payload.reviewEventId, { event, payload });
			continue;
		}

		const shouldReplace =
			payload.issuedAt > (existing.payload?.issuedAt ?? 0) ||
			(payload.issuedAt === (existing.payload?.issuedAt ?? 0) &&
				event.id.localeCompare(existing.event.id) < 0);
		if (shouldReplace) {
			attestationMap.set(payload.reviewEventId, { event, payload });
		}
	}

	const replyCandidates = replyEvents
		.map((event) => ({ event, payload: parseReplyPayload(event) }))
		.filter(
			(
				entry
			): entry is {
				event: NostrEvent;
				payload: NonNullable<ReturnType<typeof parseReplyPayload>>;
			} => entry.payload !== null
		);

	const replyGroups = new Map<string, typeof replyCandidates>();
	for (const candidate of replyCandidates) {
		const parentReviewEventId = candidate.payload.parentReviewEventId;
		const existing = replyGroups.get(parentReviewEventId) ?? [];
		existing.push(candidate);
		replyGroups.set(parentReviewEventId, existing);
	}

	const canonicalReplies = new Map<
		string,
		{
			event: NostrEvent;
			payload: ReviewReplyEventPayload;
		}
	>();

	for (const [parentReviewEventId, candidates] of replyGroups.entries()) {
		if (!parentReviewEventId || !candidates?.length) {
			continue;
		}
		const parentReview = reviewPayloadById.get(parentReviewEventId);
		if (!parentReview) {
			continue;
		}

		const validCandidates = candidates.filter((entry) => {
			return (
				entry.payload.revieweePubkey.toLowerCase() ===
					parentReview.payload.revieweePubkey.toLowerCase() &&
				isReplyAuthorAllowed(entry.event.pubkey, parentReview.payload.revieweePubkey)
			);
		});
		if (validCandidates.length === 0) {
			continue;
		}

		const canonical = selectCanonicalReviewReply(validCandidates.map((entry) => entry.payload));
		if (!canonical) {
			continue;
		}

		const source = validCandidates.find((entry) => entry.payload.eventId === canonical.eventId);
		if (!source) {
			continue;
		}

		canonicalReplies.set(parentReviewEventId, {
			event: source.event,
			payload: reviewReplyEventPayloadSchema.parse(JSON.parse(source.event.content))
		});
	}

	const mapped = reviewPayloadEntries
		.map(({ event, payload }) => {
			const attestation = attestationMap.get(event.id);
			const trustedAttestation =
				attestation &&
				isAttestationValidForReview({
					reviewEvent: event,
					reviewPayload: payload,
					attestationPayload: attestation.payload,
					now
				})
					? attestation
					: null;
			const reply = canonicalReplies.get(event.id);
			return buildVerifiedReviewRecord({
				reviewEvent: event,
				reviewPayload: payload,
				attestationEvent: trustedAttestation?.event ?? null,
				attestationPayload: trustedAttestation?.payload ?? null,
				replyEvent: reply?.event ?? null,
				replyPayload: reply?.payload ?? null
			});
		})
		.sort((left, right) => right.createdAt - left.createdAt);

	return {
		given: mapped.filter((review) => review.reviewerPubkey.toLowerCase() === normalizedCurrentUser),
		received: mapped.filter(
			(review) => review.revieweePubkey.toLowerCase() === normalizedCurrentUser
		)
	};
}

export interface ReviewFeedResponse {
	pending: PendingReviewRecord[];
	given: VerifiedReviewRecord[];
	received: VerifiedReviewRecord[];
	summary: {
		totalGiven: number;
		totalReceived: number;
		totalPending: number;
		averageRating: number;
	};
}

export async function loadReviewFeed(input: {
	reviewerPubkey: string;
	contracts?: ContractWithEvents[];
}): Promise<ReviewFeedResponse> {
	const { given, received } = await loadPublishedReviewsForUser(input.reviewerPubkey);

	const existingAttestations = [...given, ...received]
		.filter((r) => r.subjectId && r.settlementId)
		.map((r) => ({
			subjectId: r.subjectId as string,
			settlementId: r.settlementId as string
		}));

	// If contracts were NOT provided, we can't build pending locally here without a store.
	// But we should update the summary.
	const pending = input.contracts
		? buildPendingReviewRecords(input.contracts, input.reviewerPubkey, existingAttestations)
		: [];

	const receivedStats = buildReviewStatsSummary(received);

	return {
		pending,
		given,
		received,
		summary: {
			totalGiven: given.length,
			totalReceived: received.length,
			totalPending: pending.length,
			averageRating: receivedStats.averageRating
		}
	};
}

async function createSignedReviewEvent(review: ReviewEventPayload): Promise<NostrEvent> {
	return getSignedEvent({
		kind: REVIEW_NOSTR_KINDS.REVIEW,
		created_at: review.createdAt,
		content: JSON.stringify(review),
		tags: [
			[REVIEW_TAG_NAMES.REVIEWEE, review.revieweePubkey],
			[REVIEW_TAG_NAMES.REVIEW_DRAFT_HASH, review.reviewDraftHash],
			['subject', review.subjectType],
			['settlement', review.settlementType]
		]
	});
}

export async function requestReviewAttestationChallenge(
	input: AttestationChallengeRequest
): Promise<ReviewChallengeResponse> {
	const response: ReviewChallengeResponseEnvelope = reviewChallengeResponseEnvelopeSchema.parse(
		await fetchJson<unknown>('/review-attestations/challenge', {
			method: 'POST',
			body: JSON.stringify({
				...input,
				schemaVersion: REVIEWS_SCHEMA_VERSION
			})
		})
	);

	return {
		schemaVersion: REVIEWS_SCHEMA_VERSION,
		challengeToken: response.challengeToken,
		challengeMessage: response.challengeMessage,
		issuedAt: response.issuedAt,
		expiresAt: response.expiresAt
	};
}

export async function requestReviewAttestation(
	input: AttestationRequest
): Promise<AttestationResponse> {
	const response = await fetchJson('/review-attestations', {
		method: 'POST',
		body: JSON.stringify({
			...input,
			schemaVersion: REVIEWS_SCHEMA_VERSION
		})
	});

	return attestationResponseSchema.parse(response);
}

export type SubmitAttestedReviewInput = {
	review: ReviewEventPayload;
	subjectId: string;
	settlementId: string;
	chain: AttestationChallengeRequest['chain'];
	asset: AttestationChallengeRequest['asset'];
	contractAddress: string;
	reviewerWallet: string;
	revieweeWallet: string;
	reviewerNpub?: string;
	revieweeNpub?: string;
};

export async function submitAttestedReview(input: SubmitAttestedReviewInput): Promise<{
	reviewEventId: string;
	attestationEventId: string;
	reviewDraftHash: string;
}> {
	await flushPendingReviewPublishOutbox();

	// Defensive check: Verify that the draft hash provided by the UI matches the actual content
	if (!(await verifyReviewDraftHash(input.review))) {
		throw new Error('Review content integrity check failed: Draft hash mismatch');
	}

	let signedReviewEvent: NostrEvent;

	// Optimization: Consolidate auth by pre-fetching keys if using internal biometric storage
	// This ensures only ONE biometric prompt covers all signatures in this flow
	try {
		const { npub, nsec } = await import('$lib/utils/nostrKeys').then((m) => m.getAllKeys());
		const { finalizeEvent } = await import('nostr-tools/pure');

		const eventMetadata: Partial<NostrEvent> = {
			kind: REVIEW_NOSTR_KINDS.REVIEW,
			created_at: input.review.createdAt,
			content: JSON.stringify(input.review),
			tags: [
				[REVIEW_TAG_NAMES.REVIEWEE, input.review.revieweePubkey],
				[REVIEW_TAG_NAMES.REVIEW_DRAFT_HASH, input.review.reviewDraftHash],
				['subject', input.review.subjectType],
				['settlement', input.review.settlementType]
			]
		};

		const event = {
			created_at: eventMetadata.created_at || Math.floor(Date.now() / 1000),
			kind: eventMetadata.kind!,
			tags: [...(eventMetadata.tags || []), ['v', __APP_VERSION__]],
			content: eventMetadata.content || '',
			pubkey: npub
		};
		signedReviewEvent = finalizeEvent(event, nsec);
	} catch (error) {
		// Fallback for Alby or if consolidated auth is unavailable
		console.log('Consolidated auth unavailable for review signing, using sequential flow:', error);
		signedReviewEvent = await createSignedReviewEvent(input.review);
	}

	const draftEntry: PendingReviewAttestationRecord = {
		stage: 'awaiting_attestation',
		reviewEventId: signedReviewEvent.id,
		reviewDraftHash: input.review.reviewDraftHash,
		reviewerPubkey: signedReviewEvent.pubkey,
		savedAt: Date.now(),
		eventContent: signedReviewEvent.content,
		eventTags: signedReviewEvent.tags,
		eventCreatedAt: signedReviewEvent.created_at,
		eventSig: signedReviewEvent.sig,
		context: {
			subjectId: input.subjectId,
			settlementId: input.settlementId,
			chain: input.chain,
			asset: input.asset,
			contractAddress: input.contractAddress,
			revieweeWallet: input.revieweeWallet,
			reviewerWallet: input.reviewerWallet,
			reviewerNpub: input.reviewerNpub,
			revieweeNpub: input.revieweeNpub
		}
	};
	await upsertPendingReviewPublish(draftEntry);
	const pendingPublishEntry = await issueAttestationForPendingReview(draftEntry);
	await upsertPendingReviewPublish(pendingPublishEntry);
	await publishReviewEventWithRecovery(pendingPublishEntry);

	return {
		reviewEventId: signedReviewEvent.id,
		attestationEventId: pendingPublishEntry.attestationEventId,
		reviewDraftHash: input.review.reviewDraftHash
	};
}

export const submitReviewDraft = submitAttestedReview;

export async function publishReplyEvent(reply: ReviewReplyEventPayload): Promise<string> {
	const signedEvent = await getSignedEvent({
		kind: REVIEW_NOSTR_KINDS.REPLY,
		created_at: reply.createdAt,
		content: JSON.stringify(reply),
		tags: [
			[REVIEW_TAG_NAMES.PARENT_REVIEW, reply.parentReviewEventId],
			[REVIEW_TAG_NAMES.REVIEWEE, reply.revieweePubkey]
		]
	});

	const relayResults = await publishToMultipleRelays(signedEvent);
	if (!relayResults.some((result) => result.success)) {
		throw new Error('Failed to publish review reply to any relay');
	}

	return signedEvent.id;
}

export async function translateReviewCommentOnly(request: {
	sourceLanguage: 'en' | 'es';
	comment: string;
}) {
	const baseUrl = getReviewTranslationApiBaseUrl();
	if (!baseUrl) {
		return {
			sourceLanguage: request.sourceLanguage,
			content: {
				sourceLanguage: request.sourceLanguage,
				en: {
					comment: request.sourceLanguage === 'en' ? request.comment.trim() : request.comment.trim()
				},
				es: {
					comment: request.sourceLanguage === 'es' ? request.comment.trim() : request.comment.trim()
				}
			}
		};
	}

	const response = await fetch(`${baseUrl.replace(/\/$/, '')}/review-translations`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			schemaVersion: REVIEWS_SCHEMA_VERSION,
			sourceLanguage: request.sourceLanguage,
			comment: request.comment
		})
	});

	if (!response.ok) {
		throw new Error(`Translation backend request failed with ${response.status}`);
	}

	return response.json() as Promise<{
		schemaVersion: number;
		sourceLanguage: 'en' | 'es';
		content: {
			sourceLanguage: 'en' | 'es';
			en: { comment: string };
			es: { comment: string };
		};
	}>;
}

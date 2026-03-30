/**
 * Nostr Review Utilities
 *
 * Functions for publishing and retrieving verified reviews via Nostr
 */

import { type Event as NostrEvent, type Filter } from 'nostr-tools';
import { publishEvent, subscribeToEvents } from './nostr';
import KINDS from './constants/kinds';
import { getNostrPubkeyQueryValues, normalizeNostrPubkey, nostrPubkeysMatch } from './nostr-pubkey';
import { isReviewableContractStatus } from './review-status';
import {
	createEscrowCommitment,
	getCommitmentProof,
	verifyReview,
	getLatestTreeVersion,
	retrieveMerkleTree
} from '$lib/services/review-verification.service';
import type { VerifiedReview } from '@bittasker/merkle-review-sdk';
import { escrow } from '$lib/utils/wallet/escrow';
import { getUserContracts } from './nostr-bid';
import { getNpub } from '$lib/utils/nostrKeys';
import type {
	NostrVerifiedReview,
	ReviewContentWithRatings,
	RevieweeRole,
	TaskeeCategoryRatings,
	TaskerCategoryRatings
} from '$lib/types/review';

interface ReviewPageResult {
	reviews: NostrVerifiedReview[];
	rawEventCount: number;
	oldestRawCreatedAtSeconds: number | null;
}

function toReviewMapKey(
	review: Pick<NostrVerifiedReview, 'commitment' | 'reviewerPubkey'>
): string {
	return `${review.commitment}:${normalizeNostrPubkey(review.reviewerPubkey) ?? review.reviewerPubkey}`;
}

function getTagValue(event: NostrEvent, tagName: string): string | undefined {
	return event.tags.find((tag) => tag[0] === tagName)?.[1];
}

function isFiniteRating(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value) && value >= 1 && value <= 5;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getValidatedComment(value: unknown): string | undefined | null {
	if (value === undefined || value === null) {
		return undefined;
	}

	return typeof value === 'string' ? value : null;
}

function getValidatedPhotos(value: unknown): string[] | undefined | null {
	if (value === undefined) {
		return undefined;
	}

	if (!Array.isArray(value) || value.some((photo) => typeof photo !== 'string')) {
		return null;
	}

	return value;
}

function normalizeCategoryRatings(
	value: unknown
): {
	categoryRatings: ReviewContentWithRatings['categoryRatings'];
	inferredRole?: RevieweeRole;
} | null {
	if (!isRecord(value)) {
		return null;
	}

	if (
		isFiniteRating(value.quality) &&
		isFiniteRating(value.professionalism) &&
		isFiniteRating(value.timeliness)
	) {
		return {
			categoryRatings: {
				quality: value.quality,
				professionalism: value.professionalism,
				timeliness: value.timeliness
			}
		};
	}

	if (
		isFiniteRating(value.workQuality) &&
		isFiniteRating(value.experience) &&
		isFiniteRating(value.deliverySpeed)
	) {
		return {
			categoryRatings: {
				workQuality: value.workQuality,
				experience: value.experience,
				deliverySpeed: value.deliverySpeed
			},
			inferredRole: 'taskee'
		};
	}

	if (
		isFiniteRating(value.communication) &&
		isFiniteRating(value.clarity) &&
		isFiniteRating(value.paymentTimeliness)
	) {
		return {
			categoryRatings: {
				communication: value.communication,
				clarity: value.clarity,
				paymentTimeliness: value.paymentTimeliness
			},
			inferredRole: 'tasker'
		};
	}

	return null;
}

function normalizeReviewContent(
	value: unknown,
	roleHint?: RevieweeRole
): ReviewContentWithRatings | null {
	if (!isRecord(value) || !isFiniteRating(value.overallRating)) {
		return null;
	}

	const normalizedCategoryRatings = normalizeCategoryRatings(value.categoryRatings);
	if (!normalizedCategoryRatings) {
		return null;
	}

	const comment = getValidatedComment(value.comment);
	if (comment === null) {
		return null;
	}

	const photos = getValidatedPhotos(value.photos);
	if (photos === null) {
		return null;
	}

	const sourceRole =
		value.revieweeRole === 'tasker' || value.revieweeRole === 'taskee'
			? value.revieweeRole
			: undefined;
	const effectiveRole = roleHint ?? sourceRole ?? normalizedCategoryRatings.inferredRole;
	if (
		effectiveRole &&
		normalizedCategoryRatings.inferredRole &&
		effectiveRole !== normalizedCategoryRatings.inferredRole
	) {
		return null;
	}

	return {
		overallRating: value.overallRating,
		categoryRatings: normalizedCategoryRatings.categoryRatings,
		revieweeRole: effectiveRole,
		comment,
		photos
	};
}

function isValidMerkleProof(value: unknown): value is VerifiedReview['merkleProof'] {
	return (
		isRecord(value) &&
		typeof value.root === 'string' &&
		typeof value.leaf === 'string' &&
		Array.isArray(value.proof) &&
		Array.isArray(value.proofFlags)
	);
}

function isValidRating(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value) && value >= 1 && value <= 5;
}

function isStringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function isLegacyCategoryRatings(
	categoryRatings: unknown
): categoryRatings is { quality: number; professionalism: number; timeliness: number } {
	if (!categoryRatings || typeof categoryRatings !== 'object') {
		return false;
	}

	return (
		isValidRating((categoryRatings as { quality?: unknown }).quality) &&
		isValidRating((categoryRatings as { professionalism?: unknown }).professionalism) &&
		isValidRating((categoryRatings as { timeliness?: unknown }).timeliness)
	);
}

function isTaskeeCategoryRatings(
	categoryRatings: unknown
): categoryRatings is TaskeeCategoryRatings {
	if (!categoryRatings || typeof categoryRatings !== 'object') {
		return false;
	}

	return (
		isValidRating((categoryRatings as { workQuality?: unknown }).workQuality) &&
		isValidRating((categoryRatings as { experience?: unknown }).experience) &&
		isValidRating((categoryRatings as { deliverySpeed?: unknown }).deliverySpeed)
	);
}

function isTaskerCategoryRatings(
	categoryRatings: unknown
): categoryRatings is TaskerCategoryRatings {
	if (!categoryRatings || typeof categoryRatings !== 'object') {
		return false;
	}

	return (
		isValidRating((categoryRatings as { communication?: unknown }).communication) &&
		isValidRating((categoryRatings as { clarity?: unknown }).clarity) &&
		isValidRating((categoryRatings as { paymentTimeliness?: unknown }).paymentTimeliness)
	);
}

function validateReviewContent(content: unknown): ReviewContentWithRatings | null {
	if (!content || typeof content !== 'object') {
		return null;
	}

	const candidate = content as ReviewContentWithRatings;
	if (!isValidRating(candidate.overallRating)) {
		return null;
	}

	if (candidate.revieweeRole === 'taskee') {
		if (!isTaskeeCategoryRatings(candidate.categoryRatings)) {
			return null;
		}
	} else if (candidate.revieweeRole === 'tasker') {
		if (!isTaskerCategoryRatings(candidate.categoryRatings)) {
			return null;
		}
	} else if (
		!isLegacyCategoryRatings(candidate.categoryRatings) &&
		!isTaskeeCategoryRatings(candidate.categoryRatings) &&
		!isTaskerCategoryRatings(candidate.categoryRatings)
	) {
		return null;
	}

	if (candidate.comment !== undefined && typeof candidate.comment !== 'string') {
		return null;
	}

	if (candidate.photos !== undefined && !isStringArray(candidate.photos)) {
		return null;
	}

	return candidate;
}

function getRoleHintFromEvent(event: NostrEvent): RevieweeRole | undefined {
	const roleTag = event.tags.find((tag) => tag[0] === 'role')?.[1];
	return roleTag === 'tasker' || roleTag === 'taskee' ? roleTag : undefined;
}

function buildLegacyReviewContent(
	value: unknown,
	roleHint?: RevieweeRole
): ReviewContentWithRatings | null {
	if (
		!isRecord(value) ||
		!isFiniteRating(value.overallRating) ||
		!isRecord(value.categoryRatings)
	) {
		return null;
	}

	const comment = getValidatedComment(value.comment);
	if (comment === null) {
		return null;
	}

	const photos = getValidatedPhotos(value.photos);
	if (photos === null) {
		return null;
	}

	if (!isLegacyCategoryRatings(value.categoryRatings)) {
		return null;
	}

	const overallRating = value.overallRating;
	const legacyRatings = value.categoryRatings;

	if (roleHint === 'taskee') {
		return {
			overallRating,
			categoryRatings: {
				workQuality: legacyRatings.quality,
				experience: legacyRatings.professionalism,
				deliverySpeed: legacyRatings.timeliness
			},
			revieweeRole: 'taskee',
			comment,
			photos
		};
	}

	if (roleHint === 'tasker') {
		return {
			overallRating,
			categoryRatings: {
				communication: legacyRatings.quality,
				clarity: legacyRatings.professionalism,
				paymentTimeliness: legacyRatings.timeliness
			},
			revieweeRole: 'tasker',
			comment,
			photos
		};
	}

	return {
		overallRating,
		categoryRatings: legacyRatings,
		comment,
		photos
	};
}

interface ParsedReviewPayload {
	commitment: string;
	merkleProof: VerifiedReview['merkleProof'];
	reviewerPubkey?: string;
	revieweePubkey?: string;
	content: ReviewContentWithRatings;
	createdAt?: number;
	eventId?: string;
}

function parseReviewPayload(value: unknown, roleHint?: RevieweeRole): ParsedReviewPayload | null {
	if (!isRecord(value) || typeof value.commitment !== 'string' || value.commitment.length === 0) {
		return null;
	}

	if (!isValidMerkleProof(value.merkleProof)) {
		return null;
	}

	if (value.reviewerPubkey !== undefined && typeof value.reviewerPubkey !== 'string') {
		return null;
	}

	if (value.revieweePubkey !== undefined && typeof value.revieweePubkey !== 'string') {
		return null;
	}

	const createdAtCandidate = value.createdAt;
	if (
		createdAtCandidate !== undefined &&
		(typeof createdAtCandidate !== 'number' ||
			!Number.isFinite(createdAtCandidate) ||
			createdAtCandidate <= 0)
	) {
		return null;
	}

	if (value.eventId !== undefined && typeof value.eventId !== 'string') {
		return null;
	}

	const createdAt = createdAtCandidate;
	const reviewerPubkey =
		typeof value.reviewerPubkey === 'string' ? value.reviewerPubkey : undefined;
	const revieweePubkey =
		typeof value.revieweePubkey === 'string' ? value.revieweePubkey : undefined;
	const eventId = typeof value.eventId === 'string' ? value.eventId : undefined;

	const normalizedContent =
		value.fullContent !== undefined
			? normalizeReviewContent(value.fullContent, roleHint)
			: (normalizeReviewContent(value.content, roleHint) ??
				buildLegacyReviewContent(value.content, roleHint));
	if (!normalizedContent) {
		return null;
	}

	const validatedContent = validateReviewContent(normalizedContent);
	if (!validatedContent) {
		return null;
	}

	return {
		commitment: value.commitment,
		merkleProof: value.merkleProof,
		reviewerPubkey,
		revieweePubkey,
		content: validatedContent,
		createdAt,
		eventId
	};
}

interface AuthorizedReviewContext {
	reviewerPubkey: string;
	revieweePubkey: string;
	escrowTxHash: string;
}

async function resolveAuthorizedReviewContext(
	escrowId: string,
	requestedRevieweePubkey: string,
	escrowTxHash?: string
): Promise<AuthorizedReviewContext> {
	const reviewerPubkey = await getNpub();
	if (!reviewerPubkey) {
		throw new Error('Failed to get reviewer pubkey');
	}

	const contracts = await getUserContracts({ escrowIds: [escrowId], limit: 1 });
	const contractContent = contracts[0]?.contractEvent?.content;
	if (!contractContent) {
		throw new Error('Contract not found for escrow');
	}

	const normalizedReviewer = normalizeNostrPubkey(reviewerPubkey);
	const normalizedClient = normalizeNostrPubkey(contractContent.clientPubkey);
	const normalizedFreelancer = normalizeNostrPubkey(contractContent.freelancerPubkey);

	if (!normalizedReviewer || !normalizedClient || !normalizedFreelancer) {
		throw new Error('Contract participants are missing valid pubkeys');
	}

	let expectedRevieweePubkey: string;
	if (normalizedReviewer === normalizedClient) {
		expectedRevieweePubkey = contractContent.freelancerPubkey;
	} else if (normalizedReviewer === normalizedFreelancer) {
		expectedRevieweePubkey = contractContent.clientPubkey;
	} else {
		throw new Error('Reviewer is not a participant in this contract');
	}

	if (!nostrPubkeysMatch(requestedRevieweePubkey, expectedRevieweePubkey)) {
		throw new Error('Reviewee is not the counterparty for this contract');
	}

	const resolvedEscrowTxHash = escrowTxHash ?? contractContent.transactionHash;
	if (!resolvedEscrowTxHash) {
		throw new Error('Escrow transaction hash is required to publish a verified review');
	}

	return {
		reviewerPubkey,
		revieweePubkey: expectedRevieweePubkey,
		escrowTxHash: resolvedEscrowTxHash
	};
}

function toSdkCategoryRatings(
	content: ReviewContentWithRatings
): VerifiedReview['content']['categoryRatings'] {
	if ('workQuality' in content.categoryRatings) {
		return {
			quality: content.categoryRatings.workQuality,
			professionalism: content.categoryRatings.experience,
			timeliness: content.categoryRatings.deliverySpeed
		};
	}

	if ('communication' in content.categoryRatings) {
		return {
			quality: content.categoryRatings.communication,
			professionalism: content.categoryRatings.clarity,
			timeliness: content.categoryRatings.paymentTimeliness
		};
	}

	return content.categoryRatings;
}

function toSdkVerifiedReview(review: NostrVerifiedReview): VerifiedReview {
	return {
		commitment: review.commitment,
		merkleProof: review.merkleProof,
		reviewerPubkey: review.reviewerPubkey,
		revieweePubkey: review.revieweePubkey,
		content: {
			overallRating: review.content.overallRating,
			categoryRatings: toSdkCategoryRatings(review.content),
			comment: review.content.comment || '',
			photos: review.content.photos || []
		},
		createdAt: review.createdAt,
		eventId: review.eventId
	};
}

function getReviewTimestamp(review: NostrVerifiedReview): number {
	return review.createdAt;
}

function selectLatestReview(
	existing: NostrVerifiedReview | undefined,
	candidate: NostrVerifiedReview
): NostrVerifiedReview {
	if (!existing) {
		return candidate;
	}

	if (getReviewTimestamp(candidate) !== getReviewTimestamp(existing)) {
		return getReviewTimestamp(candidate) > getReviewTimestamp(existing) ? candidate : existing;
	}

	return candidate.nostrEventId > existing.nostrEventId ? candidate : existing;
}

function upsertLatestReview(
	reviewsByCommitment: Map<string, NostrVerifiedReview>,
	candidate: NostrVerifiedReview
): void {
	reviewsByCommitment.set(
		toReviewMapKey(candidate),
		selectLatestReview(reviewsByCommitment.get(toReviewMapKey(candidate)), candidate)
	);
}

function getSortedReviews(
	reviewsByCommitment: Map<string, NostrVerifiedReview>,
	limit: number
): NostrVerifiedReview[] {
	return [...reviewsByCommitment.values()]
		.sort((a, b) => {
			if (a.createdAt !== b.createdAt) {
				return b.createdAt - a.createdAt;
			}

			return b.nostrEventId.localeCompare(a.nostrEventId);
		})
		.slice(0, limit);
}

/**
 * Parse a review event and extract role-specific categories if available
 */
function parseReviewEvent(event: NostrEvent, relayUrl: string): NostrVerifiedReview | null {
	try {
		const roleHint = getRoleHintFromEvent(event);
		const reviewData = parseReviewPayload(JSON.parse(event.content), roleHint);
		if (!reviewData) {
			console.warn('Ignoring malformed review event payload', {
				eventId: event.id
			});
			return null;
		}

		if (typeof reviewData.commitment !== 'string' || reviewData.commitment.length === 0) {
			console.warn('Ignoring review event with invalid commitment metadata', {
				eventId: event.id
			});
			return null;
		}

		if (!isValidMerkleProof(reviewData.merkleProof)) {
			console.warn('Ignoring review event with invalid merkle proof metadata', {
				eventId: event.id
			});
			return null;
		}

		const signedReviewerPubkey = event.pubkey;
		const taggedRevieweePubkey = getTagValue(event, 'p');
		const taggedCommitment = getTagValue(event, 'commitment');
		const taggedEscrowId = getTagValue(event, 'e');
		const signedCreatedAt =
			event.created_at !== undefined ? event.created_at * 1000 : reviewData.createdAt;

		if (
			reviewData.reviewerPubkey &&
			!nostrPubkeysMatch(reviewData.reviewerPubkey, signedReviewerPubkey)
		) {
			console.warn('Ignoring review event with mismatched reviewer identity', {
				eventId: event.id
			});
			return null;
		}

		if (taggedCommitment && taggedCommitment !== reviewData.commitment) {
			console.warn('Ignoring review event with mismatched commitment metadata', {
				eventId: event.id
			});
			return null;
		}

		if (
			taggedRevieweePubkey &&
			reviewData.revieweePubkey &&
			!nostrPubkeysMatch(reviewData.revieweePubkey, taggedRevieweePubkey)
		) {
			console.warn('Ignoring review event with mismatched reviewee identity', {
				eventId: event.id
			});
			return null;
		}

		const resolvedRevieweePubkey = taggedRevieweePubkey || reviewData.revieweePubkey;
		if (!resolvedRevieweePubkey) {
			console.warn('Ignoring review event without a reviewee identity', {
				eventId: event.id
			});
			return null;
		}

		if (typeof signedCreatedAt !== 'number' || !Number.isFinite(signedCreatedAt)) {
			console.warn('Ignoring review event with invalid timestamp metadata', {
				eventId: event.id
			});
			return null;
		}

		// Create NostrVerifiedReview with role-specific content
		const nostrReview: NostrVerifiedReview = {
			escrowId: taggedEscrowId,
			commitment: reviewData.commitment,
			merkleProof: reviewData.merkleProof,
			reviewerPubkey: signedReviewerPubkey,
			revieweePubkey: resolvedRevieweePubkey,
			content: reviewData.content,
			createdAt: signedCreatedAt,
			eventId: reviewData.eventId,
			nostrEventId: event.id,
			nostrRelay: relayUrl
		};

		return nostrReview;
	} catch (error) {
		console.error('Failed to parse review event:', error);
		return null;
	}
}

const DEFAULT_RELAYS = [import.meta.env.VITE_NOSTR_RELAY_URL].filter(Boolean);
const REVIEW_QUERY_PAGE_SIZE = 100;
const REVIEW_QUERY_TIMEOUT_MS = 10_000;

/**
 * Publish a verified review to Nostr
 */
export async function publishVerifiedReview(
	escrowId: string,
	revieweePubkey: string,
	content: ReviewContentWithRatings,
	escrowTxHash?: string
): Promise<string> {
	try {
		const validatedContent = validateReviewContent(content);
		if (!validatedContent) {
			throw new Error('Invalid review content');
		}

		// Get escrow details to verify completion status
		const escrowData = await escrow.getEscrow(escrowId);
		if (!escrowData) {
			throw new Error('Escrow not found');
		}

		if (!isReviewableContractStatus(escrowData.status)) {
			throw new Error(`Escrow is not in a completed state. Current status: ${escrowData.status}`);
		}

		const authorization = await resolveAuthorizedReviewContext(
			escrowId,
			revieweePubkey,
			escrowTxHash
		);
		if (await hasUserReviewedEscrow(escrowId, authorization.reviewerPubkey)) {
			throw new Error(
				'You have already reviewed this escrow. Reviews are immutable once submitted.'
			);
		}

		// Create commitment
		const commitment = await createEscrowCommitment(
			escrowId,
			authorization.escrowTxHash,
			escrowData.client,
			escrowData.freelancer
		);

		// Get Merkle proof
		// First try to get latest tree
		const latestVersion = await getLatestTreeVersion();
		let treeData = null;
		if (latestVersion) {
			treeData = await retrieveMerkleTree(latestVersion);
		}

		const proofJson = await getCommitmentProof(commitment, treeData || undefined);
		if (!proofJson) {
			throw new Error('Failed to generate Merkle proof. Merkle tree may not be updated yet.');
		}

		const merkleProof = JSON.parse(proofJson);

		// Create verified review with SDK format for verification
		const verifiedReview: VerifiedReview = {
			commitment,
			merkleProof,
			reviewerPubkey: authorization.reviewerPubkey,
			revieweePubkey: authorization.revieweePubkey,
			content: {
				overallRating: validatedContent.overallRating,
				categoryRatings: toSdkCategoryRatings(validatedContent),
				comment: validatedContent.comment || '',
				photos: validatedContent.photos || []
			},
			createdAt: Date.now()
		};

		// Store the full ReviewContentWithRatings (including role-specific categories) in the Nostr event
		// This allows us to retrieve role-specific data when reading reviews
		const fullReviewContent: ReviewContentWithRatings = {
			overallRating: validatedContent.overallRating,
			categoryRatings: validatedContent.categoryRatings,
			revieweeRole: validatedContent.revieweeRole,
			comment: validatedContent.comment,
			photos: validatedContent.photos
		};

		// Verify the review before publishing
		const verification = await verifyReview(verifiedReview, merkleProof.root);
		if (!verification.valid) {
			throw new Error(`Review verification failed: ${verification.error}`);
		}

		// Create Nostr event with extended review data
		// Store both SDK format (for verification) and full role-specific data
		const extendedReview = {
			...verifiedReview,
			fullContent: fullReviewContent // Store role-specific categories separately
		};

		const event: Partial<NostrEvent> = {
			kind: KINDS.REVIEW_VERIFIED,
			created_at: Math.floor(Date.now() / 1000),
			content: JSON.stringify(extendedReview),
			tags: [
				['e', escrowId], // Escrow ID reference
				['p', normalizeNostrPubkey(authorization.revieweePubkey) ?? authorization.revieweePubkey], // Reviewee pubkey
				['commitment', commitment], // Commitment hash
				['root', merkleProof.root], // Merkle root
				['version', latestVersion || ''], // Tree version
				...(validatedContent.revieweeRole ? [['role', validatedContent.revieweeRole]] : [])
			]
		};

		const publishedEvent = await publishEvent(event);

		return publishedEvent.id;
	} catch (error) {
		console.error('Failed to publish verified review:', error);
		throw error;
	}
}

/**
 * Update an existing review
 */
export async function updateVerifiedReview(
	originalEventId: string,
	escrowId: string,
	revieweePubkey: string,
	content: ReviewContentWithRatings,
	escrowTxHash?: string
): Promise<string> {
	void originalEventId;
	void escrowId;
	void revieweePubkey;
	void content;
	void escrowTxHash;
	throw new Error('Reviews are immutable once submitted');
}

function collectReviewPage(
	filter: Filter,
	timeoutMs: number = REVIEW_QUERY_TIMEOUT_MS
): Promise<ReviewPageResult> {
	return new Promise((resolve) => {
		const reviewsByCommitment = new Map<string, NostrVerifiedReview>();
		let rawEventCount = 0;
		let oldestRawCreatedAtSeconds: number | null = null;
		const relayUrl = DEFAULT_RELAYS[0] || '';
		if (!relayUrl) {
			resolve({ reviews: [], rawEventCount: 0, oldestRawCreatedAtSeconds: null });
			return;
		}

		let settled = false;
		let unsubscribe: (() => void) | undefined;
		let timeoutId: ReturnType<typeof setTimeout> | undefined;

		const finalize = () => {
			if (settled) {
				return;
			}

			settled = true;
			if (timeoutId) {
				clearTimeout(timeoutId);
				timeoutId = undefined;
			}
			const closeSubscription = unsubscribe;
			unsubscribe = undefined;
			closeSubscription?.();
			resolve({
				reviews: getSortedReviews(reviewsByCommitment, Number.MAX_SAFE_INTEGER),
				rawEventCount,
				oldestRawCreatedAtSeconds
			});
		};
		timeoutId = setTimeout(finalize, timeoutMs);

		unsubscribe = subscribeToEvents(
			relayUrl,
			[filter],
			(event: NostrEvent) => {
				rawEventCount += 1;
				if (typeof event.created_at === 'number' && Number.isFinite(event.created_at)) {
					oldestRawCreatedAtSeconds =
						oldestRawCreatedAtSeconds === null
							? event.created_at
							: Math.min(oldestRawCreatedAtSeconds, event.created_at);
				}
				const nostrReview = parseReviewEvent(event, relayUrl);
				if (!nostrReview) return;
				upsertLatestReview(reviewsByCommitment, nostrReview);
			},
			finalize
		);

		if (settled) {
			const closeSubscription = unsubscribe;
			unsubscribe = undefined;
			closeSubscription?.();
		}
	});
}

function getNextUntilFromRawEventPage(page: ReviewPageResult): number | null {
	return page.oldestRawCreatedAtSeconds;
}

async function collectReviewsPaginated(
	filter: Filter,
	limit: number,
	options: {
		fetchAll?: boolean;
		pageSize?: number;
		timeoutMs?: number;
	} = {}
): Promise<NostrVerifiedReview[]> {
	const {
		fetchAll = false,
		pageSize = REVIEW_QUERY_PAGE_SIZE,
		timeoutMs = REVIEW_QUERY_TIMEOUT_MS
	} = options;
	const reviewsByCommitment = new Map<string, NostrVerifiedReview>();
	const targetLimit = fetchAll ? Number.MAX_SAFE_INTEGER : Math.max(limit, 1);
	let nextUntil = filter.until;
	let currentPageSize = pageSize;

	while (true) {
		const page = await collectReviewPage(
			{
				...filter,
				limit: currentPageSize,
				...(nextUntil !== undefined ? { until: nextUntil } : {})
			},
			timeoutMs
		);

		for (const review of page.reviews) {
			upsertLatestReview(reviewsByCommitment, review);
		}

		if (!fetchAll && reviewsByCommitment.size >= targetLimit) {
			return getSortedReviews(reviewsByCommitment, targetLimit);
		}

		if (page.rawEventCount < currentPageSize) {
			break;
		}

		const pageUntil = getNextUntilFromRawEventPage(page);
		if (pageUntil === null) {
			break;
		}

		if (nextUntil !== undefined && pageUntil === nextUntil) {
			currentPageSize *= 2;
			continue;
		}

		nextUntil = pageUntil;
		currentPageSize = pageSize;
	}

	return getSortedReviews(reviewsByCommitment, targetLimit);
}

/**
 * Get reviews by a reviewer (where user is the reviewer)
 */
export async function getReviewsByReviewer(
	reviewerPubkey: string,
	limit: number = 50
): Promise<NostrVerifiedReview[]> {
	const filter: Filter = {
		kinds: [KINDS.REVIEW_VERIFIED],
		authors: [normalizeNostrPubkey(reviewerPubkey) ?? reviewerPubkey],
		limit: Math.max(limit, REVIEW_QUERY_PAGE_SIZE)
	};

	return collectReviewsPaginated(filter, limit);
}

/**
 * Get reviews for a user (reviewee)
 */
export async function getReviewsForUser(
	revieweePubkey: string,
	limit: number = 50
): Promise<NostrVerifiedReview[]> {
	const filter: Filter = {
		kinds: [KINDS.REVIEW_VERIFIED],
		'#p': getNostrPubkeyQueryValues(revieweePubkey),
		limit: Math.max(limit, REVIEW_QUERY_PAGE_SIZE)
	};

	return collectReviewsPaginated(filter, limit);
}

/**
 * Get review by Nostr event ID
 */
export async function getReviewByEventId(eventId: string): Promise<NostrVerifiedReview | null> {
	return new Promise((resolve) => {
		const filter: Filter = {
			ids: [eventId],
			kinds: [KINDS.REVIEW_VERIFIED]
		};

		const relayUrl = DEFAULT_RELAYS[0] || '';
		if (!relayUrl) {
			resolve(null);
			return;
		}

		let settled = false;
		let found = false;
		let unsubscribe: (() => void) | undefined;
		let timeoutId: ReturnType<typeof setTimeout> | undefined;
		const finalize = (review: NostrVerifiedReview | null) => {
			if (settled) {
				return;
			}

			settled = true;
			if (timeoutId) {
				clearTimeout(timeoutId);
				timeoutId = undefined;
			}
			const closeSubscription = unsubscribe;
			unsubscribe = undefined;
			closeSubscription?.();
			resolve(review);
		};
		timeoutId = setTimeout(() => finalize(null), 5000);
		unsubscribe = subscribeToEvents(
			relayUrl,
			[filter],
			(event: NostrEvent) => {
				if (!found) {
					found = true;
					finalize(parseReviewEvent(event, relayUrl));
				}
			},
			() => finalize(null)
		);

		if (settled) {
			const closeSubscription = unsubscribe;
			unsubscribe = undefined;
			closeSubscription?.();
		}
	});
}

/**
 * Get reviews for an escrow
 */
export async function getReviewsForEscrow(escrowId: string): Promise<NostrVerifiedReview[]> {
	const filter: Filter = {
		kinds: [KINDS.REVIEW_VERIFIED],
		'#e': [escrowId]
	};

	return collectReviewsPaginated(filter, Number.MAX_SAFE_INTEGER, { fetchAll: true });
}

/**
 * Verify a review retrieved from Nostr
 */
export async function verifyNostrReview(review: NostrVerifiedReview): Promise<boolean> {
	const verification = await verifyReview(toSdkVerifiedReview(review), review.merkleProof.root);
	return verification.valid;
}

/**
 * Check if user has already reviewed an escrow
 */
export async function hasUserReviewedEscrow(
	escrowId: string,
	reviewerPubkey: string
): Promise<boolean> {
	const filter: Filter = {
		kinds: [KINDS.REVIEW_VERIFIED],
		'#e': [escrowId]
	};
	let nextUntil = filter.until;
	let currentPageSize = REVIEW_QUERY_PAGE_SIZE;

	while (true) {
		const page = await collectReviewPage(
			{
				...filter,
				limit: currentPageSize,
				...(nextUntil !== undefined ? { until: nextUntil } : {})
			},
			REVIEW_QUERY_TIMEOUT_MS
		);

		if (page.reviews.some((review) => nostrPubkeysMatch(review.reviewerPubkey, reviewerPubkey))) {
			return true;
		}

		if (page.rawEventCount < currentPageSize) {
			return false;
		}

		const pageUntil = getNextUntilFromRawEventPage(page);
		if (pageUntil === null) {
			return false;
		}

		if (nextUntil !== undefined && pageUntil === nextUntil) {
			currentPageSize *= 2;
			continue;
		}

		nextUntil = pageUntil;
		currentPageSize = REVIEW_QUERY_PAGE_SIZE;
	}
}

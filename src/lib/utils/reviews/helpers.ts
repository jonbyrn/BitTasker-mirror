/**
 * Review Helpers — Version-Agnostic
 *
 * Pending review detection and role resolution.
 */
interface IContractForReview {
	contractId: string;
	paymentId: string;
	clientPubkey: string;
	freelancerPubkey: string;
	status: string | number | undefined;
	isReviewable(): boolean;
	getReviewableParty(pubkey: string): 'client' | 'freelancer' | null;
}
import {
	isReviewableStatus as isReviewable,
	isConfirmedCompletionAction as isCompletion,
	isReviewableStatus
} from '$lib/utils/reviews/status-mapper';
import { hasUserReviewedContract } from '$lib/utils/reviews/queries';
import { getNpub } from '$lib/utils/nostrKeys';
import { fetchProfileMetadata } from '$lib/nostr/profile';
import { normalizeNostrPubkey, nostrPubkeysMatch } from '$lib/utils/nostr-pubkey';
import { ndk } from '$lib/nostr/ndk';
import { NDKPaymentContract } from '$lib/nostr/events/contract';
import { createDebug } from '$lib/utils/debug';
import { StorageKeys } from '../constants/storage';
import { Preferences } from '@capacitor/preferences';
import { goto } from '$app/navigation';
import { appStore } from '$lib/stores/app.store';
import KINDS from '$lib/utils/constants/kinds';
import {
	loadReviewSourceEvents,
	reviewedContractIds,
	settledReviewSlots
} from '$lib/utils/reviews/settled-escrow';

const d = createDebug('reviews:helpers');

// ── Status checks ──────────────────────────────────────

export function isReviewableContractStatus(status: string | number | undefined): boolean {
	// Delegate to status-mapper which handles both string and numeric values
	return isReviewable(status);
}

export function isConfirmedReviewCompletionAction(action: string | number | undefined): boolean {
	return isCompletion(action);
}

// ── Pending reviews ────────────────────────────────────

export interface PendingReview {
	contract: IContractForReview;
	contractId: string;
	revieweePubkey: string;
	revieweeName?: string;
	completedAt: number;
	canReview: boolean;
}

export class PartialPendingReviewsError extends Error {
	readonly pendingReviews: PendingReview[];
	constructor(message: string, pendingReviews: PendingReview[]) {
		super(message);
		this.name = 'PartialPendingReviewsError';
		this.pendingReviews = pendingReviews;
	}
}

function toProfileLookupPubkey(pubkey: string): string {
	if (pubkey.startsWith('npub')) return pubkey;
	try {
		const user = ndk.getUser({ pubkey });
		return user.npub;
	} catch {
		return pubkey;
	}
}

async function resolveRevieweeName(pubkey: string): Promise<string | undefined> {
	try {
		const profile = await fetchProfileMetadata(toProfileLookupPubkey(pubkey));
		return profile.name || undefined;
	} catch {
		return undefined;
	}
}

export function getOtherPartyPubkey(
	contract: IContractForReview,
	currentUserPubkey: string
): string | null {
	if (nostrPubkeysMatch(contract.clientPubkey, currentUserPubkey)) return contract.freelancerPubkey;
	if (nostrPubkeysMatch(contract.freelancerPubkey, currentUserPubkey)) return contract.clientPubkey;
	return null;
}

/**
 * Fetches user's contracts and adapts them to IContractForReview format.
 * Used when findPendingReviews is called without contracts.
 */
async function fetchUserContracts(): Promise<IContractForReview[]> {
	try {
		const currentPubkey = await getNpub();
		const events = await ndk.fetchEvents(
			{ kinds: [KINDS.CONTRACT], '#p': [currentPubkey], limit: 100 },
			{ closeOnEose: true }
		);
		const ndkContracts = [];
		for (const event of events) {
			const contract = await NDKPaymentContract.from(event);
			if (contract) ndkContracts.push(contract);
		}
		d.log('fetchUserContracts: Fetched NDK contracts:', ndkContracts.length);
		if (ndkContracts.length === 0) return [];

		const results: IContractForReview[] = [];
		for (const c of ndkContracts) {
			const clientPubkey = c.taskeePubkey ?? '';
			const freelancerPubkey = c.taskerPubkey ?? '';
			results.push({
				contractId: c.id,
				paymentId: c.paymentId,
				clientPubkey,
				freelancerPubkey,
				status: c.status ?? '',
				isReviewable: () => isReviewableStatus(c.status),
				getReviewableParty: (pubkey: string) =>
					nostrPubkeysMatch(pubkey, clientPubkey)
						? 'client'
						: nostrPubkeysMatch(pubkey, freelancerPubkey)
							? 'freelancer'
							: null
			} as IContractForReview);
		}
		return results;
	} catch (err) {
		d.error('fetchUserContracts: Error fetching contracts:', err);
		return [];
	}
}

async function fetchNativeContractsForUser(limit: number): Promise<NDKPaymentContract[]> {
	const pubkey = await getNpub();
	const events = await ndk.fetchEvents(
		{ kinds: [KINDS.CONTRACT], '#p': [pubkey], limit },
		{ closeOnEose: true }
	);
	const contracts: NDKPaymentContract[] = [];
	for (const event of events) {
		const contract = await NDKPaymentContract.from(event);
		if (contract) contracts.push(contract);
	}
	return contracts;
}

/**
 * Lightweight pending review count for notification badges.
 *
 * Uses exactly 3 Nostr queries and zero on-chain reads:
 *   1. Kind 30006 — fetch user's contracts
 *   2. Kind 6431 — fetch attestations by #e (contract event IDs)
 *   3. Kind 31006 — fetch latest status for unreviewed contracts
 *
 * Key implementation note: attestation events carry TWO e tags —
 *   e[0] = Kind 6430 review event ID
 *   e[1] = Kind 30006 contract event ID  (subjectId passed by the client)
 * The relay's #e filter matches on any e tag, so the batch query returns
 * correctly. But tagValue('e') returns only the first tag (review event ID),
 * which is never in our contractIds set. We must check ALL e tags and
 * intersect with the known contract ID set.
 */
export async function getPendingReviewCount(): Promise<{ count: number; contractIds: string[] }> {
	try {
		const currentUserPubkey = await getNpub();
		d.log('getPendingReviewCount: Current user pubkey:', currentUserPubkey?.slice(0, 16));
		if (!currentUserPubkey) return { count: 0, contractIds: [] };

		// 1. Fetch user's contracts (Kind 30006)
		const ndkContracts = await fetchNativeContractsForUser(100);
		if (ndkContracts.length === 0) return { count: 0, contractIds: [] };

		const contractIds = ndkContracts.map((c) => c.id).filter(Boolean);
		const contractIdSet = new Set(contractIds);

		// 2. Fetch attestations that reference any of the contract IDs via #e.
		//    The relay matches on ANY e tag — including the second one which holds
		//    the contract event ID. After the query we check ALL e tags per attestation
		//    and mark the matching contract as reviewed.
		const reviewedContractIds = new Set<string>();
		const attestationEvents = await ndk.fetchEvents(
			{ kinds: [KINDS.ATTESTATION], '#e': contractIds },
			{ closeOnEose: true }
		);

		for (const att of attestationEvents) {
			try {
				const attContent = JSON.parse(att.content);
				if (!nostrPubkeysMatch(attContent.reviewerPubkey, currentUserPubkey)) continue;

				// Walk all e tags and pick the one that matches a known contract ID.
				// Attestations always have: e[0]=reviewEventId, e[1]=contractEventId.
				// Using getMatchingTags covers both orders and the old single-e-tag format.
				for (const tag of att.getMatchingTags('e')) {
					if (contractIdSet.has(tag[1])) {
						reviewedContractIds.add(tag[1]);
						break;
					}
				}
			} catch {
				/* malformed attestation content — skip */
			}
		}

		// 3. For contracts not yet marked as reviewed, check Kind 31006 status.
		//    Only count those in a terminal reviewable state (FundsReleased, FundsClaimed,
		//    DisputeResolved).
		const unreviewedIds = contractIds.filter((id) => !reviewedContractIds.has(id));
		if (unreviewedIds.length === 0) return { count: 0, contractIds: [] };

		let count = 0;
		const reviewableIds: string[] = [];
		for (const contractId of unreviewedIds) {
			const contract = ndkContracts.find((entry) => entry.id === contractId);
			if (contract && isReviewableStatus(contract.status)) {
				count++;
				reviewableIds.push(contractId);
			}
		}

		d.log(
			'getPendingReviewCount: count=%d reviewed=%d unreviewed=%d',
			count,
			reviewedContractIds.size,
			unreviewedIds.length
		);
		return { count, contractIds: reviewableIds };
	} catch (err) {
		d.error('getPendingReviewCount: failed', err);
		return { count: 0, contractIds: [] };
	}
}

async function rgbPendingReviews(viewer: string): Promise<PendingReview[]> {
	try {
		const source = await loadReviewSourceEvents(viewer);
		const slots = settledReviewSlots(source.statuses, viewer, reviewedContractIds(source.reviews));
		const pending: PendingReview[] = [];
		for (const slot of slots) {
			pending.push({
				contract: {
					contractId: slot.contractId,
					paymentId: slot.contractId,
					clientPubkey: viewer,
					freelancerPubkey: slot.revieweePubkey,
					status: slot.status,
					isReviewable: () => true,
					getReviewableParty: (pubkey: string) =>
						nostrPubkeysMatch(pubkey, viewer)
							? 'client'
							: nostrPubkeysMatch(pubkey, slot.revieweePubkey)
								? 'freelancer'
								: null
				},
				contractId: slot.contractId,
				revieweePubkey: slot.revieweePubkey,
				revieweeName: await resolveRevieweeName(slot.revieweePubkey),
				completedAt: slot.completedAt * 1000,
				canReview: true
			});
		}
		return pending;
	} catch (err) {
		d.error('rgbPendingReviews failed', err);
		return [];
	}
}

export async function findPendingReviews(
	contracts?: IContractForReview[]
): Promise<PendingReview[]> {
	try {
		const currentUserPubkey = await getNpub();
		d.log('findPendingReviews: Current user pubkey:', currentUserPubkey?.slice(0, 16));
		if (!currentUserPubkey) return [];

		const rgbPromise = rgbPendingReviews(currentUserPubkey);
		// If contracts not provided, fetch them. A hung relay must not hide settled RGB escrows.
		const contractList =
			contracts ??
			(await Promise.race([
				fetchUserContracts(),
				new Promise<IContractForReview[]>((resolve) => setTimeout(() => resolve([]), 4000))
			]));
		const rgb = await rgbPromise;
		d.log('findPendingReviews: Contract list length:', contractList?.length ?? 0);
		if (!contractList || contractList.length === 0) return rgb;

		// Debug each contract's reviewability
		contractList.forEach((c) => {
			const isReviewable = c.isReviewable();
			const reviewableParty = c.getReviewableParty(currentUserPubkey);
			d.log('findPendingReviews: Contract check:', {
				id: c.contractId.slice(0, 8),
				status: c.status,
				isReviewable,
				reviewableParty,
				clientPubkey: c.clientPubkey?.slice(0, 8),
				freelancerPubkey: c.freelancerPubkey?.slice(0, 8)
			});
		});

		const reviewable = contractList.filter(
			(c) => c.isReviewable() && c.getReviewableParty(currentUserPubkey) !== null
		);
		d.log('findPendingReviews: Reviewable contracts:', reviewable.length);

		let hadPartialFailure = false;
		const pending = (
			await Promise.all(
				reviewable.map(async (contract) => {
					try {
						const userReviewed = await hasUserReviewedContract(
							contract.contractId,
							contract.paymentId,
							currentUserPubkey
						);
						if (userReviewed) return null;
						const revieweePubkey = getOtherPartyPubkey(contract, currentUserPubkey);
						if (!revieweePubkey) return null;
						return {
							contract,
							contractId: contract.contractId,
							revieweePubkey,
							revieweeName: await resolveRevieweeName(revieweePubkey),
							completedAt: Date.now(),
							canReview: true
						} as PendingReview;
					} catch {
						hadPartialFailure = true;
						return null;
					}
				})
			)
		).filter((r): r is PendingReview => r !== null);

		const seen = new Set(pending.map((review) => review.contractId));
		const sorted = [...pending, ...rgb.filter((review) => !seen.has(review.contractId))].sort(
			(a, b) => b.completedAt - a.completedAt
		);
		if (hadPartialFailure) {
			throw new PartialPendingReviewsError('Some pending reviews could not be refreshed.', sorted);
		}
		return sorted;
	} catch (error) {
		if (error instanceof PartialPendingReviewsError) throw error;
		throw error instanceof Error ? error : new Error('Failed to find pending reviews');
	}
}

export async function getPendingReviewsCount(contracts: IContractForReview[]): Promise<number> {
	return (await findPendingReviews(contracts)).length;
}

// ── Banner trigger ───────────────────────────────────

interface BannerDismissState {
	/** Sorted, comma-joined reviewable contract event IDs at time of dismissal */
	contractIds: string;
	/** Epoch ms when the current 24h dismissal window expires */
	until: number;
	/** Number of times the user has dismissed this set of reviews (0–3) */
	dismissCount: number;
}

async function wasBannerDismissed(currentContractIds: string[]): Promise<boolean> {
	try {
		const raw = await Preferences.get({ key: StorageKeys.PENDING_REVIEW_BANNER_DISMISSED });
		if (!raw.value) return false;
		const state: BannerDismissState = JSON.parse(raw.value);
		const currentIds = [...currentContractIds].sort().join(',');
		// Different set of reviews → not dismissed
		if (currentIds !== state.contractIds) return false;
		// 3 strikes used for this set → permanently dismissed
		if (state.dismissCount >= 3) return true;
		// 24h window expired → show again
		if (Date.now() > state.until) return false;
		return true;
	} catch {
		return false;
	}
}

async function updateDismissState(contractIds: string[]) {
	const currentIds = [...contractIds].sort().join(',');
	let dismissCount = 1;

	// If dismissing the same set of reviews, increment the counter (up to 3)
	try {
		const raw = await Preferences.get({ key: StorageKeys.PENDING_REVIEW_BANNER_DISMISSED });
		if (raw.value) {
			const prev: BannerDismissState = JSON.parse(raw.value);
			if (prev.contractIds === currentIds) {
				dismissCount = Math.min(prev.dismissCount + 1, 3);
			}
		}
	} catch {
		/* corrupt state — start fresh */
	}

	const state: BannerDismissState = {
		contractIds: currentIds,
		until: Date.now() + 24 * 60 * 60 * 1000,
		dismissCount
	};
	await Preferences.set({
		key: StorageKeys.PENDING_REVIEW_BANNER_DISMISSED,
		value: JSON.stringify(state)
	});
}

/**
 * Checks pending review count and shows a banner toast if needed.
 * Deduplication ensures only one banner exists at a time (per set of reviewable contracts).
 * Dismissal is remembered in Preferences for 24h, repeating up to 3 times
 * before becoming permanent for that set of reviews.
 * Returns the toast id, or null if no banner was shown.
 */
export async function triggerPendingReviewBanner(
	reviewNowLabel: string,
	dismissLabel: string
): Promise<number | null> {
	try {
		const { count, contractIds } = await getPendingReviewCount();
		if (count <= 0 || (await wasBannerDismissed(contractIds))) return null;

		const i18nKey =
			count === 1 ? 'reviews.pending.banner_count_one' : 'reviews.pending.banner_count_other';

		const dedupKey = `pending-review-banner-${[...contractIds].sort().join(',')}`;

		let toastId: number | null = null;

		toastId = await appStore.showBanner({
			message: { key: i18nKey, values: { count } },
			dedupKey,
			actions: [
				{
					label: dismissLabel,
					onClick: () => {
						updateDismissState(contractIds);
						if (toastId !== null) appStore.dismissBanner(toastId);
					},
					variant: 'ghost'
				},
				{
					label: reviewNowLabel,
					onClick: () => goto('/reviews'),
					variant: 'primary'
				}
			],
			dismissible: false,
			duration: 0
		});

		return toastId;
	} catch {
		return null;
	}
}

export function getRevieweeRoleFromContractParticipants(
	clientPubkey: string,
	freelancerPubkey: string,
	revieweePubkey: string
): 'tasker' | 'taskee' | null {
	const r = normalizeNostrPubkey(revieweePubkey);
	if (r === normalizeNostrPubkey(clientPubkey)) return 'tasker';
	if (r === normalizeNostrPubkey(freelancerPubkey)) return 'taskee';
	return null;
}

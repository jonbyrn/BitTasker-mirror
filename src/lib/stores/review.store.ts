/**
 * Centralized Review Store
 *
 * Provides a single source of truth for review status across all components.
 * Uses a Map keyed by contractEventId for O(1) lookups.
 * Optimized for fast initial loading with background enrichment.
 */
import { writable, get } from 'svelte/store';
import { createDebug } from '$lib/utils/debug';
import { hasUserReviewedContract, getReviewsForContract } from '$lib/utils/reviews/queries';
import { getOtherPartyPubkey } from '$lib/utils/reviews/helpers';
import { getNpub } from '$lib/utils/nostrKeys';
import { nostrPubkeysMatch } from '$lib/utils/nostr-pubkey';
import type { AttestedReview } from '$lib/types/review';
import type { IContractForReview } from '$lib/utils/reviews/contract-interface';

const d = createDebug('review');

export interface ContractReviewState {
	userReviewed: boolean;
	otherPartyReviewed: boolean;
	isLoading: boolean;
	revieweePubkey: string | null;
	reviews: AttestedReview[];
	reviewsLoading: boolean;
	lastFetched: number;
}

interface ReviewStoreState {
	byContractId: Map<string, ContractReviewState>;
	version: number; // Increment to force reactivity
}

const initialState: ReviewStoreState = {
	byContractId: new Map(),
	version: 0
};

const DEFAULT_REVIEW_STATE: ContractReviewState = {
	userReviewed: false,
	otherPartyReviewed: false,
	isLoading: false,
	revieweePubkey: null,
	reviews: [],
	reviewsLoading: false,
	lastFetched: 0
};

const CACHE_TTL_MS = 60_000; // 60 seconds cache (increased from 30s)

function createReviewStore() {
	const { subscribe, set, update } = writable<ReviewStoreState>(initialState);

	// Track in-flight requests to prevent duplicate fetches
	const inFlightRequests = new Map<string, Promise<void>>();

	function updateState(
		contractEventId: string,
		updater: (current: ContractReviewState) => ContractReviewState
	) {
		update((state) => {
			const current = state.byContractId.get(contractEventId) ?? { ...DEFAULT_REVIEW_STATE };
			const newMap = new Map(state.byContractId);
			newMap.set(contractEventId, updater(current));
			return { byContractId: newMap, version: state.version + 1 };
		});
	}

	return {
		subscribe,

		/**
		 * Get review state for a contract (returns default if not found)
		 */
		getState(contractEventId: string): ContractReviewState {
			const state = get({ subscribe });
			return state.byContractId.get(contractEventId) ?? { ...DEFAULT_REVIEW_STATE };
		},

		/**
		 * Check if we have fresh cached data for a contract
		 */
		hasFreshCache(contractEventId: string): boolean {
			const state = get({ subscribe });
			const cached = state.byContractId.get(contractEventId);
			if (!cached) return false;
			return Date.now() - cached.lastFetched < CACHE_TTL_MS;
		},

		/**
		 * Fetch review status for a contract (with deduplication and caching)
		 */
		async fetchReviewStatus(
			contractEventId: string,
			contractPaymentId: string,
			reviewContract: IContractForReview | null,
			options: { force?: boolean } = {}
		): Promise<void> {
			if (!contractEventId) return;

			// Check cache unless force refresh
			if (!options.force && this.hasFreshCache(contractEventId)) {
				d.log('Using cached review state', { contractEventId });
				return;
			}

			// Dedupe in-flight requests
			const existingRequest = inFlightRequests.get(contractEventId);
			if (existingRequest) {
				d.log('Reusing in-flight request', { contractEventId });
				return existingRequest;
			}

			// Mark as loading immediately
			updateState(contractEventId, (current) => ({ ...current, isLoading: true }));

			const fetchPromise = (async () => {
				try {
					const currentUserPubkey = await getNpub();
					if (!currentUserPubkey) {
						updateState(contractEventId, () => ({
							...DEFAULT_REVIEW_STATE,
							lastFetched: Date.now()
						}));
						return;
					}

					// Get other party pubkey synchronously (no network)
					const otherPartyPubkey = reviewContract
						? getOtherPartyPubkey(reviewContract, currentUserPubkey)
						: null;

					// Set revieweePubkey immediately so button can show
					updateState(contractEventId, (current) => ({
						...current,
						revieweePubkey: otherPartyPubkey
					}));

					// Fetch review data in parallel
					const [userReviewed, attestations] = await Promise.all([
						hasUserReviewedContract(contractEventId, contractPaymentId, currentUserPubkey),
						getReviewsForContract(contractEventId)
					]);

					const otherPartyReviewed = otherPartyPubkey
						? attestations.some((a) => nostrPubkeysMatch(a.reviewerPubkey, otherPartyPubkey))
						: false;

					updateState(contractEventId, () => ({
						userReviewed,
						otherPartyReviewed,
						isLoading: false,
						revieweePubkey: otherPartyPubkey,
						reviews: attestations,
						reviewsLoading: false,
						lastFetched: Date.now()
					}));

					d.log('Fetched review state', {
						contractEventId,
						userReviewed,
						otherPartyReviewed,
						reviewCount: attestations.length
					});
				} catch (err) {
					d.error('Failed to fetch review status', { contractEventId, err });
					updateState(contractEventId, (current) => ({
						...current,
						isLoading: false,
						reviewsLoading: false,
						lastFetched: Date.now()
					}));
				} finally {
					inFlightRequests.delete(contractEventId);
				}
			})();

			inFlightRequests.set(contractEventId, fetchPromise);
			return fetchPromise;
		},

		/**
		 * Mark a contract as reviewed by the current user (optimistic update)
		 */
		markAsReviewed(contractEventId: string): void {
			updateState(contractEventId, (current) => ({
				...current,
				userReviewed: true,
				lastFetched: Date.now()
			}));
			d.log('Marked as reviewed', { contractEventId });
		},

		/**
		 * Refresh reviews for a contract (after submitting a review)
		 */
		async refreshReviews(
			contractEventId: string,
			contractPaymentId: string,
			reviewContract: IContractForReview | null
		): Promise<void> {
			return this.fetchReviewStatus(contractEventId, contractPaymentId, reviewContract, {
				force: true
			});
		},

		/**
		 * Clear state for a specific contract
		 */
		clearContract(contractEventId: string): void {
			update((state) => {
				const newMap = new Map(state.byContractId);
				newMap.delete(contractEventId);
				return { byContractId: newMap, version: state.version + 1 };
			});
		},

		/**
		 * Reset entire store
		 */
		reset(): void {
			inFlightRequests.clear();
			set({ ...initialState, version: 0 });
		}
	};
}

export const reviewStore = createReviewStore();

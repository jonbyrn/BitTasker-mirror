<script lang="ts">
	import { t } from 'svelte-i18n';
	import { getNpub } from '$lib/utils/nostrKeys';
	import { getReviewsForUser, getReviewsByReviewer } from '$lib/utils/reviews/queries';
	import { calculateReviewStats } from '$lib/utils/reviews/aggregation';
	import { findPendingReviews, type PendingReview } from '$lib/utils/reviews/helpers';
	import type { NostrVerifiedReview, ReviewStats } from '$lib/types/review';
	import ReviewSummaryCard from '$lib/components/profile/ReviewSummaryCard.svelte';
	import ReviewManagementTabs from '$lib/components/reviews/ReviewManagementTabs.svelte';
	import ReviewList from '$lib/components/reviews/ReviewList.svelte';
	import VerifiedReviewCard from '$lib/components/reviews/VerifiedReviewCard.svelte';
	import PendingReviewsList from '$lib/components/reviews/PendingReviewsList.svelte';
	import { isTimeout, settleWithin, withTimeout } from '$lib/utils/with-timeout';

	const ALL_REVIEWS_LIMIT = Number.MAX_SAFE_INTEGER;

	type ReviewMetaLoadError = Error & {
		givenReviews?: NostrVerifiedReview[];
		pendingReviews?: PendingReview[];
	};

	let { userPubkey, isCurrentUser = false } = $props<{
		userPubkey?: string;
		isCurrentUser?: boolean;
	}>();

	let currentUserPubkey = $state<string | null>(null);
	let hasResolvedCurrentUser = $state(false);
	let targetPubkey = $derived(userPubkey || currentUserPubkey || '');
	let receivedReviews = $state<NostrVerifiedReview[]>([]);
	let givenReviews = $state<NostrVerifiedReview[]>([]);
	let pendingReviews = $state<PendingReview[]>([]);
	let stats = $state<ReviewStats | null>(null);
	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let metaError = $state<string | null>(null);
	let activeTab = $state<'received' | 'given' | 'pending'>('received');
	let pendingCount = $state(0);
	let lastLoadedTargetPubkey = $state<string | null>(null);
	let activeRequestId = 0;
	let hasManuallyChangedTab = $state(false);
	let summaryRole = $derived.by<'tasker' | 'taskee' | null>(() => {
		const roleSet = new Set(
			receivedReviews
				.map((review) => review.content?.revieweeRole)
				.filter((role): role is 'tasker' | 'taskee' => role === 'tasker' || role === 'taskee')
		);

		return roleSet.size === 1 ? [...roleSet][0] : null;
	});

	function extractPartialReviewMeta(error: unknown): {
		givenReviews?: NostrVerifiedReview[];
		pendingReviews?: PendingReview[];
	} {
		if (!error || typeof error !== 'object') {
			return {};
		}

		const maybeError = error as {
			givenReviews?: unknown;
			pendingReviews?: unknown;
		};

		return {
			givenReviews: Array.isArray(maybeError.givenReviews)
				? (maybeError.givenReviews as NostrVerifiedReview[])
				: undefined,
			pendingReviews: Array.isArray(maybeError.pendingReviews)
				? (maybeError.pendingReviews as PendingReview[])
				: undefined
		};
	}

	function createReviewMetaLoadError(
		reason: unknown,
		partialMeta: {
			givenReviews?: NostrVerifiedReview[];
			pendingReviews?: PendingReview[];
		}
	): ReviewMetaLoadError {
		const error =
			reason instanceof Error ? reason : new Error($t('reviews.management.partial_load_warning'));
		const reviewMetaError = error as ReviewMetaLoadError;
		if (partialMeta.givenReviews) {
			reviewMetaError.givenReviews = partialMeta.givenReviews;
		}
		if (partialMeta.pendingReviews) {
			reviewMetaError.pendingReviews = partialMeta.pendingReviews;
		}
		return reviewMetaError;
	}

	function applyPartialReviewMeta(error: unknown) {
		const { givenReviews: partialGivenReviews, pendingReviews: partialPendingReviews } =
			extractPartialReviewMeta(error);

		givenReviews = partialGivenReviews ?? [];
		pendingReviews = partialPendingReviews ?? [];
		pendingCount = pendingReviews.length;

		if (!hasManuallyChangedTab) {
			activeTab = isCurrentUser && pendingReviews.length > 0 ? 'pending' : 'received';
		}
	}

	async function loadReviewMeta(nextPendingReviews?: PendingReview[]) {
		if (!isCurrentUser || !currentUserPubkey) {
			return {
				given: [],
				pending: []
			};
		}

		const [givenResult, pendingResult] = await Promise.allSettled([
			getReviewsByReviewer(currentUserPubkey, ALL_REVIEWS_LIMIT),
			nextPendingReviews ? Promise.resolve(nextPendingReviews) : findPendingReviews()
		]);

		const givenReviews =
			givenResult.status === 'fulfilled'
				? givenResult.value
				: extractPartialReviewMeta(givenResult.reason).givenReviews;
		const pendingReviews =
			pendingResult.status === 'fulfilled'
				? pendingResult.value
				: extractPartialReviewMeta(pendingResult.reason).pendingReviews;

		if (givenResult.status === 'rejected') {
			throw createReviewMetaLoadError(givenResult.reason, { givenReviews, pendingReviews });
		}

		if (pendingResult.status === 'rejected') {
			throw createReviewMetaLoadError(pendingResult.reason, { givenReviews, pendingReviews });
		}

		return {
			given: givenResult.value,
			pending: pendingResult.value
		};
	}

	function applyReviewMeta(reviewMeta: { given: NostrVerifiedReview[]; pending: PendingReview[] }) {
		givenReviews = reviewMeta.given;
		pendingReviews = reviewMeta.pending;
		pendingCount = reviewMeta.pending.length;
		if (!hasManuallyChangedTab) {
			activeTab = isCurrentUser && reviewMeta.pending.length > 0 ? 'pending' : 'received';
		}
	}

	async function loadReviewData(pubkey: string) {
		const requestId = ++activeRequestId;
		isLoading = true;
		error = null;
		metaError = null;

		try {
			const [receivedResult, metaResult] = await Promise.all([
				settleWithin(getReviewsForUser(pubkey, ALL_REVIEWS_LIMIT), 8000),
				settleWithin(loadReviewMeta(), 8000)
			]);

			if (requestId !== activeRequestId) {
				return;
			}

			if (receivedResult.status === 'rejected') {
				if (!isTimeout(receivedResult.reason)) throw receivedResult.reason;
				receivedReviews = [];
				stats = calculateReviewStats([]);
			} else {
				receivedReviews = receivedResult.value;
				stats = calculateReviewStats(receivedResult.value);
			}

			if (metaResult.status === 'fulfilled') {
				applyReviewMeta(metaResult.value);
			} else if (isTimeout(metaResult.reason)) {
				applyReviewMeta({ given: [], pending: [] });
			} else {
				console.error('Failed to load review management metadata:', metaResult.reason);
				applyPartialReviewMeta(metaResult.reason);
				metaError =
					metaResult.reason instanceof Error
						? metaResult.reason.message
						: $t('reviews.management.partial_load_warning');
			}
		} catch (err) {
			console.error('Failed to load reviews:', err);
			if (requestId === activeRequestId) {
				error = err instanceof Error ? err.message : $t('reviews.list.load_error');
			}
		} finally {
			if (requestId === activeRequestId) {
				isLoading = false;
			}
		}
	}

	$effect(() => {
		if (!isCurrentUser || userPubkey) {
			hasResolvedCurrentUser = true;
			return;
		}

		let cancelled = false;

		hasResolvedCurrentUser = false;
		currentUserPubkey = null;

		(async () => {
			try {
				currentUserPubkey = await withTimeout(getNpub(), 8000);
			} catch (err) {
				console.error('Failed to get current user pubkey:', err);
				error = $t('reviews.profile.load_user_error');
			} finally {
				if (!cancelled) {
					hasResolvedCurrentUser = true;
				}
			}
		})();

		return () => {
			cancelled = true;
		};
	});

	$effect(() => {
		if (!hasResolvedCurrentUser) {
			return;
		}

		if (!targetPubkey) {
			receivedReviews = [];
			givenReviews = [];
			pendingReviews = [];
			pendingCount = 0;
			stats = null;
			lastLoadedTargetPubkey = null;
			isLoading = false;
			return;
		}

		if (lastLoadedTargetPubkey === targetPubkey) {
			return;
		}

		lastLoadedTargetPubkey = targetPubkey;
		loadReviewData(targetPubkey);
	});

	$effect(() => {
		if (!isCurrentUser && activeTab !== 'received') {
			activeTab = 'received';
		}
	});

	function handleTabChange(tab: 'received' | 'given' | 'pending') {
		hasManuallyChangedTab = true;
		activeTab = tab;
	}

	async function retryLoadReviewData() {
		if (!targetPubkey) {
			return;
		}

		hasManuallyChangedTab = false;
		lastLoadedTargetPubkey = targetPubkey;
		await loadReviewData(targetPubkey);
	}

	async function retryLoadReviewMeta(nextPendingReviews?: PendingReview[]) {
		if (!currentUserPubkey) {
			return;
		}

		if (nextPendingReviews) {
			pendingReviews = nextPendingReviews;
			pendingCount = nextPendingReviews.length;
		}

		try {
			metaError = null;
			const reviewMeta = await loadReviewMeta(nextPendingReviews);
			applyReviewMeta(reviewMeta);
		} catch (err) {
			console.error('Failed to refresh review metadata:', err);
			applyPartialReviewMeta(err);
			metaError =
				err instanceof Error ? err.message : $t('reviews.management.partial_load_warning');
		}
	}

	async function handlePendingReviewSubmitted(nextPendingReviews?: PendingReview[]) {
		if (!targetPubkey) {
			return;
		}

		await retryLoadReviewMeta(nextPendingReviews);
	}
</script>

<div class="space-y-6 pb-8">
	{#if isLoading}
		<div role="status" aria-live="polite">
			<!-- Match ReviewSummaryCard: split stat card -->
			<div class="card border-base-300 bg-base-100 animate-pulse border shadow-xl">
				<div class="card-body">
					<div
						class="divide-base-300 border-base-300 bg-base-200 flex divide-x overflow-hidden rounded-lg border"
					>
						<div class="flex flex-1 flex-col items-center px-4 py-6">
							<div class="bg-base-300 h-3 w-20 rounded"></div>
							<div class="bg-base-300 mt-3 h-8 w-12 rounded"></div>
							<div class="bg-base-300 mt-1 h-3 w-24 rounded"></div>
						</div>
						<div class="flex flex-1 flex-col items-center px-4 py-6">
							<div class="bg-base-300 h-3 w-20 rounded"></div>
							<div class="bg-base-300 mt-3 h-8 w-12 rounded"></div>
							<div class="bg-base-300 mt-1 h-3 w-16 rounded"></div>
						</div>
					</div>
					<!-- Distribution bars skeleton -->
					<div class="mt-6 space-y-2">
						{#each Array(5) as _, i (i)}
							<div class="flex items-center gap-3">
								<div class="bg-base-300 h-4 w-8 rounded"></div>
								<div class="bg-base-300 h-4 flex-1 rounded-full"></div>
								<div class="bg-base-300 h-4 w-10 rounded"></div>
							</div>
						{/each}
					</div>
					<!-- Category bars skeleton -->
					<div class="mt-6 space-y-3">
						{#each Array(3) as _, i (i)}
							<div class="space-y-1">
								<div class="flex items-center justify-between">
									<div class="bg-base-300 h-4 w-28 rounded"></div>
									<div class="bg-base-300 h-4 w-10 rounded"></div>
								</div>
								<div class="bg-base-300 h-3 w-full rounded-full"></div>
							</div>
						{/each}
					</div>
				</div>
			</div>
			<!-- Match ReviewManagementTabs -->
			<div class="bg-base-300 mt-6 h-10 w-full rounded-lg"></div>
			<!-- Match review card list -->
			<div class="mt-4 space-y-4">
				{#each Array(2) as _, i (i)}
					<div class="card border-base-300 bg-base-100 animate-pulse border p-5 shadow-sm">
						<div class="flex items-center gap-3">
							<div class="bg-base-300 h-10 w-10 rounded-full"></div>
							<div class="flex-1 space-y-2">
								<div class="bg-base-300 h-4 w-28 rounded"></div>
								<div class="flex items-center gap-1">
									{#each Array(5) as _, si (si)}
										<div class="bg-base-300 h-3 w-3 rounded"></div>
									{/each}
								</div>
							</div>
						</div>
						<div class="bg-base-300 mt-3 h-4 w-full rounded"></div>
						<div class="bg-base-300 mt-2 h-4 w-3/4 rounded"></div>
					</div>
				{/each}
			</div>
			<span class="sr-only">{$t('reviews.management.loading')}</span>
		</div>
	{:else if error}
		<div class="space-y-3">
			<div class="alert alert-outline alert-error">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-6 w-6 shrink-0 stroke-current"
					fill="none"
					viewBox="0 0 24 24"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
					/>
				</svg>
				<span>{error}</span>
			</div>
			<div class="flex justify-end">
				<button class="btn btn-outline btn-sm" type="button" onclick={retryLoadReviewData}>
					{$t('reviews.actions.retry')}
				</button>
			</div>
		</div>
	{:else if !targetPubkey}
		<div class="alert alert-outline alert-warning">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-6 w-6 shrink-0 stroke-current"
				fill="none"
				viewBox="0 0 24 24"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
				/>
			</svg>
			<span>{$t('reviews.profile.no_user')}</span>
		</div>
	{:else}
		<!-- Review Summary Section -->
		{#if stats}
			<ReviewSummaryCard {stats} revieweeRole={summaryRole} />
		{/if}

		<!-- Review Management Tabs -->
		<ReviewManagementTabs
			{activeTab}
			onTabChange={handleTabChange}
			receivedCount={receivedReviews.length}
			givenCount={givenReviews.length}
			{pendingCount}
			{isCurrentUser}
			idPrefix="profile-reviews"
		/>

		{#if metaError}
			<div class="space-y-3">
				<div class="alert alert-outline alert-warning">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-5 w-5 shrink-0 stroke-current"
						fill="none"
						viewBox="0 0 24 24"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
						/>
					</svg>
					<span>{metaError}</span>
				</div>
				<div class="flex justify-end">
					<button
						class="btn btn-outline btn-sm"
						type="button"
						onclick={() => retryLoadReviewMeta()}
					>
						{$t('reviews.actions.retry')}
					</button>
				</div>
			</div>
		{/if}

		<!-- Review List Section -->
		{#if isCurrentUser && activeTab === 'pending'}
			<div
				id="profile-reviews-panel-pending"
				role="tabpanel"
				aria-labelledby="profile-reviews-tab-pending"
				tabindex="0"
			>
				<PendingReviewsList
					initialPendingReviews={pendingReviews}
					onReviewSubmitted={handlePendingReviewSubmitted}
				/>
			</div>
		{:else if isCurrentUser && activeTab === 'given'}
			<div
				id="profile-reviews-panel-given"
				role="tabpanel"
				aria-labelledby="profile-reviews-tab-given"
				tabindex="0"
			>
				<div class="space-y-4">
					{#if givenReviews.length === 0}
						<div class="text-base-content/70 py-8 text-center">
							<p>{$t('reviews.list.no_given_reviews')}</p>
						</div>
					{:else}
						{#each givenReviews as review (review.attestationEventId)}
							<VerifiedReviewCard {review} showRevieweeContext={true} />
						{/each}
					{/if}
				</div>
			</div>
		{:else}
			<div
				id="profile-reviews-panel-received"
				role="tabpanel"
				aria-labelledby="profile-reviews-tab-received"
				tabindex="0"
			>
				<ReviewList
					reviews={receivedReviews}
					revieweePubkey={targetPubkey}
					sort="newest"
					limit={50}
				/>
			</div>
		{/if}
	{/if}
</div>

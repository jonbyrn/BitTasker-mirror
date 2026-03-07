<script lang="ts">
	import { onMount } from 'svelte';
	import { t } from 'svelte-i18n';
	import { getNpub } from '$lib/utils/nostrKeys';
	import {
		getReviewsForUser,
		getReviewsByReviewer,
		getStatsForUser
	} from '$lib/utils/review-source';
	import { getPendingReviewsCount } from '$lib/utils/review-helpers';
	import type { NostrVerifiedReview, ReviewStats } from '$lib/types/review';
	import ReviewSummaryCard from '$lib/components/profile/ReviewSummaryCard.svelte';
	import ReviewManagementTabs from '$lib/components/reviews/ReviewManagementTabs.svelte';
	import ReviewList from '$lib/components/reviews/ReviewList.svelte';
	import VerifiedReviewCard from '$lib/components/reviews/VerifiedReviewCard.svelte';
	import PendingReviewsList from '$lib/components/reviews/PendingReviewsList.svelte';
	import ReviewsEmptyState from '$lib/components/reviews/ReviewsEmptyState.svelte';

	let currentUserPubkey = $state<string | null>(null);
	let receivedReviews = $state<NostrVerifiedReview[]>([]);
	let givenReviews = $state<NostrVerifiedReview[]>([]);
	let stats = $state<ReviewStats | null>(null);
	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let activeTab = $state<'received' | 'given' | 'pending'>('pending');
	let pendingCount = $state(0);

	onMount(async () => {
		try {
			currentUserPubkey = await getNpub();
		} catch (err) {
			console.error('Failed to get current user pubkey:', err);
			error = 'Failed to load user information';
			isLoading = false;
		}
	});

	// Load reviews when pubkey is available; cleanup avoids set-state after unmount/navigation
	$effect(() => {
		if (!currentUserPubkey) {
			isLoading = false;
			return;
		}

		let cancelled = false;
		isLoading = true;
		error = null;

		(async () => {
			try {
				const received = await getReviewsForUser(currentUserPubkey, 100);
				if (cancelled) return;
				receivedReviews = received;
				stats = await getStatsForUser(currentUserPubkey);
				if (cancelled) return;

				const given = await getReviewsByReviewer(currentUserPubkey, 100);
				if (cancelled) return;
				givenReviews = given;

				pendingCount = await getPendingReviewsCount();
				if (cancelled) return;
			} catch (err) {
				if (!cancelled) {
					console.error('Failed to load reviews:', err);
					error = err instanceof Error ? err.message : 'Failed to load reviews';
				}
			} finally {
				if (!cancelled) isLoading = false;
			}
		})();

		return () => {
			cancelled = true;
		};
	});

	function handleTabChange(tab: 'received' | 'given' | 'pending') {
		activeTab = tab;
	}
</script>

<div class="mx-auto px-2 pt-2 md:px-0">
	<div class="mb-8">
		<h3 class="mb-2 text-2xl font-bold">{$t('reviews.management.title')}</h3>
		<p class="text-base-content/70 text-lg">{$t('reviews.management.description')}</p>
	</div>

	<div class="bg-base-100 rounded-xl p-8 shadow-lg">
		{#if isLoading}
			<div class="flex items-center justify-center py-12">
				<span class="loading loading-spinner loading-lg"></span>
			</div>
		{:else if error}
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
		{:else if !currentUserPubkey}
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
			<div class="space-y-6">
				<!-- Review Summary Section -->
				{#if stats}
					<ReviewSummaryCard {stats} />
				{/if}

				<!-- Review Management Tabs -->
				<ReviewManagementTabs
					{activeTab}
					onTabChange={handleTabChange}
					receivedCount={receivedReviews.length}
					givenCount={givenReviews.length}
					{pendingCount}
					isCurrentUser={true}
				/>

				<!-- Review List Section -->
				{#if activeTab === 'pending'}
					<PendingReviewsList />
				{:else if activeTab === 'given'}
					<!-- Show given reviews -->
					<div class="space-y-4">
						{#if givenReviews.length === 0}
							<ReviewsEmptyState />
						{:else}
							{#each givenReviews as review (review.nostrEventId)}
								<div class="cursor-pointer transition-opacity hover:opacity-80">
									<VerifiedReviewCard {review} />
								</div>
							{/each}
						{/if}
					</div>
				{:else}
					<!-- Show received reviews -->
					{#if currentUserPubkey}
						<ReviewList revieweePubkey={currentUserPubkey} sort="newest" limit={50} />
					{/if}
				{/if}
			</div>
		{/if}
	</div>
</div>

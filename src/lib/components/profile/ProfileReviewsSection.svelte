<script lang="ts">
	import { onMount } from 'svelte';
	import { t } from 'svelte-i18n';
	import { getNpub } from '$lib/utils/nostrKeys';
import { getReviewsForUser, getReviewsByReviewer, getStatsForUser } from '$lib/utils/review-source';
import { getPendingReviewsCount } from '$lib/utils/review-helpers';
	import type { NostrVerifiedReview, ReviewStats } from '$lib/types/review';
	import ReviewSummaryCard from './ReviewSummaryCard.svelte';
	import ReviewManagementTabs from '../reviews/ReviewManagementTabs.svelte';
	import ReviewList from '../reviews/ReviewList.svelte';
	import VerifiedReviewCard from '../reviews/VerifiedReviewCard.svelte';
	import PendingReviewsList from '../reviews/PendingReviewsList.svelte';
	import ReviewsEmptyState from '../reviews/ReviewsEmptyState.svelte';
	import CollapsibleSection from '../shared/CollapsibleSection.svelte';

	let {
		userPubkey,
		isCurrentUser = false
	} = $props<{
		userPubkey?: string;
		isCurrentUser?: boolean;
	}>();

	let currentUserPubkey = $state<string | null>(null);
	let targetPubkey = $derived(userPubkey || currentUserPubkey || '');
	let receivedReviews = $state<NostrVerifiedReview[]>([]);
	let givenReviews = $state<NostrVerifiedReview[]>([]);
	let stats = $state<ReviewStats | null>(null);
	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let activeTab = $state<'received' | 'given' | 'pending'>('received');
	let pendingCount = $state(0);
	let reviewsExpanded = $state(false);
	let reviewsSectionTitle = $derived(
		receivedReviews.length > 0
			? `${$t('profile.reviews')} (${receivedReviews.length})`
			: `${$t('profile.reviews')} (${$t('reviews.list.no_reviews')})`
	);

	// Get current user pubkey if viewing own profile
	onMount(async () => {
		if (isCurrentUser && !userPubkey) {
			try {
				currentUserPubkey = await getNpub();
			} catch (err) {
				console.error('Failed to get current user pubkey:', err);
				error = 'Failed to load user information';
			}
		}
	});

	// Load reviews when pubkey is available
	$effect(() => {
		if (!targetPubkey) {
			isLoading = false;
			return;
		}

		isLoading = true;
		error = null;

		(async () => {
			try {
				// Load reviews where user is reviewee (received) and stats (backend or local)
				const received = await getReviewsForUser(targetPubkey, 100);
				receivedReviews = received;
				stats = await getStatsForUser(targetPubkey);

				// Load reviews where current user is reviewer (given) - only if viewing own profile
				if (isCurrentUser && currentUserPubkey) {
					const given = await getReviewsByReviewer(currentUserPubkey, 100);
					givenReviews = given;
					
					// Get pending reviews count
					pendingCount = await getPendingReviewsCount();
				}
			} catch (err) {
				console.error('Failed to load reviews:', err);
				error = err instanceof Error ? err.message : 'Failed to load reviews';
			} finally {
				isLoading = false;
			}
		})();
	});

	function handleTabChange(tab: 'received' | 'given' | 'pending') {
		activeTab = tab;
	}
</script>

<div class="space-y-6">
	{#if isLoading}
		<div class="flex justify-center items-center py-12">
			<span class="loading loading-spinner loading-lg"></span>
		</div>
	{:else if error}
		<div class="alert alert-outline alert-error">
			<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 shrink-0 stroke-current" fill="none" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
			</svg>
			<span>{error}</span>
		</div>
	{:else if !targetPubkey}
		<div class="alert alert-outline alert-warning">
			<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 shrink-0 stroke-current" fill="none" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
			</svg>
			<span>{$t('reviews.profile.no_user')}</span>
		</div>
	{:else}
		<CollapsibleSection
			title={reviewsSectionTitle}
			bind:expanded={reviewsExpanded}
			contentClass="pt-2"
		>
			{#snippet children()}
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
					{isCurrentUser}
				/>

				<!-- Review List Section -->
				{#if activeTab === 'pending'}
					{#if isCurrentUser}
						<PendingReviewsList />
					{:else}
						<div class="text-center py-8 text-base-content/70">
							<p>{$t('reviews.pending.only_current_user')}</p>
						</div>
					{/if}
				{:else if activeTab === 'given'}
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
					<ReviewList
						revieweePubkey={targetPubkey}
						sort="newest"
						limit={50}
					/>
				{/if}
			{/snippet}
		</CollapsibleSection>
	{/if}
</div>


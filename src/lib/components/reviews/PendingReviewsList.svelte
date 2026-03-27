<script lang="ts">
	import { onMount } from 'svelte';
	import { t } from 'svelte-i18n';
	import { findPendingReviews } from '$lib/utils/review-helpers';
	import type { PendingReview } from '$lib/utils/review-helpers';
	import ReviewPromptModal from './ReviewPromptModal.svelte';

	let pendingReviews = $state<PendingReview[]>([]);
	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let selectedReview = $state<PendingReview | null>(null);
	let showReviewModal = $state(false);

	onMount(async () => {
		await loadPendingReviews();
	});

	async function loadPendingReviews() {
		isLoading = true;
		error = null;
		try {
			pendingReviews = await findPendingReviews();
		} catch (err) {
			console.error('Failed to load pending reviews:', err);
			error = err instanceof Error ? err.message : 'Failed to load pending reviews';
		} finally {
			isLoading = false;
		}
	}

	function handleReviewClick(pendingReview: PendingReview) {
		selectedReview = pendingReview;
		showReviewModal = true;
	}

	function handleReviewSubmitted() {
		showReviewModal = false;
		selectedReview = null;
		// Reload pending reviews
		loadPendingReviews();
	}

	function formatDate(timestamp: number): string {
		const date = new Date(timestamp);
		return date.toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}
</script>

<div class="pending-reviews-list space-y-4">
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
	{:else if pendingReviews.length === 0}
		<div class="py-12 text-center">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="text-base-content/30 mx-auto mb-4 h-16 w-16"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
				/>
			</svg>
			<p class="text-base-content/70 mb-2 text-lg">{$t('reviews.pending.no_pending')}</p>
			<p class="text-base-content/50 text-sm">{$t('reviews.pending.all_caught_up')}</p>
		</div>
	{:else}
		<div class="space-y-3">
			{#each pendingReviews as pendingReview (pendingReview.escrowId)}
				<div
					class="card bg-base-100 border-base-300 border shadow-sm transition-shadow hover:shadow-md"
				>
					<div class="card-body p-4">
						<div class="flex items-start justify-between gap-4">
							<div class="flex-1">
								<div class="mb-2 flex items-center gap-2">
									<h4 class="text-lg font-semibold">
										{$t('reviews.pending.contract')} #{pendingReview.escrowId.slice(0, 8)}
									</h4>
									<span class="badge badge-outline badge-sm">
										{$t('reviews.pending.completed')}
									</span>
								</div>
							</div>
							<div class="text-base-content/70 text-sm">
								<p class="mb-1">
									<span class="font-medium">{$t('reviews.pending.review_for')}:</span>
									{pendingReview.revieweeName || pendingReview.revieweePubkey.slice(0, 16) + '...'}
								</p>
								<p class="text-xs">
									{$t('reviews.pending.completed_on')}
									{formatDate(pendingReview.completedAt)}
								</p>
							</div>
						</div>
						<div class="card-actions mt-4 justify-end">
							<button
								class="btn btn-primary btn-sm"
								onclick={() => handleReviewClick(pendingReview)}
							>
								{$t('reviews.pending.review_now')}
							</button>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}

	<!-- Review Modal -->
	{#if showReviewModal && selectedReview}
		<ReviewPromptModal
			isOpen={showReviewModal}
			escrowId={selectedReview.escrowId}
			escrowTxHash={selectedReview.escrowTxHash}
			revieweePubkey={selectedReview.revieweePubkey}
			onClose={() => {
				showReviewModal = false;
				selectedReview = null;
			}}
			onSubmit={handleReviewSubmitted}
		/>
	{/if}
</div>

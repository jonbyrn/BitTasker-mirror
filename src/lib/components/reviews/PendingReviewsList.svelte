<script lang="ts">
	import { onMount } from 'svelte';
	import { get } from 'svelte/store';
	import { locale, t } from 'svelte-i18n';
	import { findPendingReviews } from '$lib/utils/reviews/helpers';
	import type { PendingReview } from '$lib/utils/reviews/helpers';
	import ReviewPromptModal from './ReviewPromptModal.svelte';

	let { initialPendingReviews, onReviewSubmitted } = $props<{
		initialPendingReviews?: PendingReview[];
		onReviewSubmitted?: (pendingReviews: PendingReview[]) => void | Promise<void>;
	}>();

	let pendingReviews = $state<PendingReview[]>([]);
	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let selectedReview = $state<PendingReview | null>(null);
	let showReviewModal = $state(false);

	$effect(() => {
		if (initialPendingReviews === undefined) {
			return;
		}

		pendingReviews = initialPendingReviews;
		isLoading = false;
		error = null;
	});

	onMount(async () => {
		if (initialPendingReviews !== undefined) {
			return;
		}

		await loadPendingReviews();
	});

	async function loadPendingReviews(
		options: { showSpinner?: boolean } = {}
	): Promise<PendingReview[] | null> {
		const { showSpinner = true } = options;
		if (showSpinner) {
			isLoading = true;
		}
		error = null;
		try {
			const nextPendingReviews = await findPendingReviews();
			pendingReviews = nextPendingReviews;
			return nextPendingReviews;
		} catch (err) {
			console.error('Failed to load pending reviews:', err);
			error = err instanceof Error ? err.message : $t('reviews.pending.load_error');
			return null;
		} finally {
			isLoading = false;
		}
	}

	function handleReviewClick(pendingReview: PendingReview) {
		selectedReview = pendingReview;
		showReviewModal = true;
	}

	async function handleReviewSubmitted() {
		const submittedEscrowId = selectedReview?.escrowId;
		const optimisticPendingReviews = submittedEscrowId
			? pendingReviews.filter((pendingReview) => pendingReview.escrowId !== submittedEscrowId)
			: pendingReviews;

		pendingReviews = optimisticPendingReviews;
		showReviewModal = false;
		selectedReview = null;

		const refreshedPendingReviews = await loadPendingReviews({ showSpinner: false });
		await onReviewSubmitted?.(refreshedPendingReviews ?? optimisticPendingReviews);
	}

	function formatDate(timestamp: number): string {
		const date = new Date(timestamp);
		return new Intl.DateTimeFormat(get(locale) || undefined, {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		}).format(date);
	}

	function formatPubkey(pubkey: string): string {
		if (pubkey.length <= 18) {
			return pubkey;
		}

		return `${pubkey.slice(0, 12)}...${pubkey.slice(-6)}`;
	}

	function getRevieweeLabel(pendingReview: PendingReview): string {
		return pendingReview.revieweeName?.trim() || formatPubkey(pendingReview.revieweePubkey);
	}

	function getRevieweeInitial(pendingReview: PendingReview): string {
		return getRevieweeLabel(pendingReview).charAt(0).toUpperCase() || '?';
	}
</script>

<div class="pending-reviews-list space-y-4">
	{#if isLoading}
		<div class="flex items-center justify-center py-12" role="status" aria-live="polite">
			<span class="loading loading-spinner loading-lg"></span>
			<span class="sr-only">{$t('reviews.pending.loading')}</span>
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
				<button class="btn btn-outline btn-sm" type="button" onclick={() => loadPendingReviews()}>
					{$t('reviews.actions.retry')}
				</button>
			</div>
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
						<div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
							<div class="flex min-w-0 flex-1 items-start gap-3">
								<div
									class="bg-primary/10 text-primary flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
									aria-hidden="true"
								>
									{getRevieweeInitial(pendingReview)}
								</div>
								<div class="min-w-0 flex-1">
									<p class="text-base-content/50 text-xs font-semibold tracking-[0.18em] uppercase">
										{$t('reviews.pending.review_for')}
									</p>
									<h4 class="truncate text-lg font-semibold">
										{getRevieweeLabel(pendingReview)}
									</h4>
									{#if pendingReview.revieweeName}
										<p
											class="text-base-content/60 mt-1 truncate font-mono text-xs"
											title={pendingReview.revieweePubkey}
										>
											{$t('reviews.pending.nostr_id')}: {formatPubkey(pendingReview.revieweePubkey)}
										</p>
									{/if}
								</div>
							</div>

							<div
								class="text-base-content/70 flex shrink-0 flex-col items-start gap-2 text-sm md:items-end"
							>
								<div class="flex flex-wrap items-center gap-2">
									<span class="badge badge-outline badge-sm">
										{$t('reviews.pending.completed')}
									</span>
									<span class="font-medium">
										{$t('reviews.pending.contract')} #{pendingReview.escrowId.slice(0, 8)}
									</span>
								</div>
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

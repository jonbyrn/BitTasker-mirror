<script lang="ts">
	import { onMount } from 'svelte';
	import { get } from 'svelte/store';
	import { locale, t } from 'svelte-i18n';
	import { findPendingReviews } from '$lib/utils/reviews/helpers';
	import type { PendingReview } from '$lib/utils/reviews/helpers';
	import ReviewPromptModal from './ReviewPromptModal.svelte';
	import UserInfoDisplay from '$lib/components/user/UserInfoDisplay.svelte';
	import { createDebug } from '$lib/utils/debug';
	import IconCloseCircle from '~icons/mdi/close-circle-outline';
	import IconCheckCircle from '~icons/mdi/check-circle-outline';

	const d = createDebug('reviews:pending');

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
			d.error('Failed to load pending reviews:', err);
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
		const submittedContractId = selectedReview?.contractId;
		const optimisticPendingReviews = submittedContractId
			? pendingReviews.filter((pendingReview) => pendingReview.contractId !== submittedContractId)
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

	function contractDisplayTitle(pendingReview: PendingReview): string {
		const title = pendingReview.contract.taskTitle?.trim();
		return title || $t('reviews.pending.fallback_contract_title');
	}
</script>

<div class="pending-reviews-list space-y-2">
	{#if isLoading}
		<div class="flex items-center justify-center py-12" role="status" aria-live="polite">
			<span class="loading loading-spinner loading-lg text-primary"></span>
			<span class="sr-only">{$t('reviews.pending.loading')}</span>
		</div>
	{:else if error}
		<div class="space-y-3">
			<div class="alert alert-outline alert-error">
				<IconCloseCircle class="h-6 w-6 shrink-0" />
				<span>{error}</span>
			</div>
			<div class="flex justify-end">
				<button class="btn btn-outline btn-sm" type="button" onclick={() => loadPendingReviews()}>
					{$t('reviews.actions.retry')}
				</button>
			</div>
		</div>
	{:else if pendingReviews.length === 0}
		<div class="rounded-box border-base-300 bg-base-200/40 py-12 text-center">
			<IconCheckCircle class="text-base-content/25 mx-auto mb-4 h-16 w-16" />
			<p class="text-base-content/80 mb-1 text-lg font-medium">
				{$t('reviews.pending.no_pending')}
			</p>
			<p class="text-base-content/50 px-4 text-sm">{$t('reviews.pending.all_caught_up')}</p>
		</div>
	{:else}
		<div class="space-y-2">
			{#each pendingReviews as pendingReview (pendingReview.contractId)}
				<div
					class="card bg-base-100 border-base-300 rounded-box border shadow-sm transition-shadow duration-200 hover:shadow-md"
				>
					<div class="card-body p-6">
						<div
							class="grid grid-cols-1 gap-y-2 md:grid-cols-[minmax(0,1fr)_minmax(12rem,22rem)] md:gap-x-5 md:gap-y-1"
						>
							<!-- `h3` is avoided: global app.css sets body h3 to large display type and can override utilities. -->
							<p
								role="heading"
								aria-level="3"
								class="text-base-content m-0 line-clamp-2 font-sans text-2xl leading-snug font-semibold md:col-start-1 md:row-start-1"
							>
								{contractDisplayTitle(pendingReview)}
							</p>

							{#if pendingReview.contract.taskDescription?.trim()}
								<p
									class="text-base-content/70 line-clamp-3 text-sm whitespace-pre-line md:col-start-1 md:row-start-2"
								>
									{pendingReview.contract.taskDescription}
								</p>
							{:else}
								<div class="min-h-0 min-w-0 md:col-start-1 md:row-start-2" aria-hidden="true"></div>
							{/if}

							<p class="text-base-content/60 text-sm md:col-start-1 md:row-start-3">
								{$t('reviews.pending.completed_on')}
								<span class="text-base-content font-medium"
									>{formatDate(pendingReview.completedAt)}</span
								>
							</p>

							<div
								class="flex w-full min-w-0 flex-col gap-2 md:col-start-2 md:row-span-3 md:row-start-1 md:max-w-sm md:justify-center md:justify-self-end"
							>
								<p
									class="text-base-content/50 m-0 text-start text-xs font-semibold tracking-wider uppercase"
								>
									{$t('reviews.pending.review_for')}
								</p>
								<div class="flex w-full justify-center md:justify-end">
									<UserInfoDisplay
										pubkey={pendingReview.revieweePubkey}
										username={pendingReview.revieweeName ?? null}
										size="md"
										showReviewCount={true}
										showRanking={false}
									/>
								</div>
							</div>
						</div>

						<div class="card-actions border-base-200 mt-3 justify-end border-t pt-3">
							<button
								class="btn btn-primary btn-sm"
								type="button"
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
			contract={selectedReview.contract}
			escrowId={selectedReview.contract?.paymentId ?? selectedReview.contractId}
			escrowTxHash={selectedReview.contract?.txHash}
			revieweePubkey={selectedReview.revieweePubkey}
			onClose={() => {
				showReviewModal = false;
				selectedReview = null;
			}}
			onSubmit={handleReviewSubmitted}
		/>
	{/if}
</div>

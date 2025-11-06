<script lang="ts">
	import { t } from 'svelte-i18n';
	import { publishVerifiedReview, hasUserReviewedEscrow } from '$lib/utils/nostr-review';
	import { getNpub } from '$lib/utils/nostrKeys';
	import { appStore } from '$lib/stores/app.store';
	import type { ReviewContentWithRatings } from '$lib/types/review';

	let {
		escrowId,
		revieweePubkey,
		escrowTxHash,
		onSubmit,
		onCancel
	} = $props<{
		escrowId: string;
		revieweePubkey: string;
		escrowTxHash?: string;
		onSubmit?: (eventId: string) => void;
		onCancel?: () => void;
	}>();

	let overallRating = $state(0);
	let qualityRating = $state(0);
	let professionalismRating = $state(0);
	let timelinessRating = $state(0);
	let comment = $state('');
	let photos = $state<string[]>([]);
	let isSubmitting = $state(false);
	let errors = $state<Record<string, string>>({});
	let alreadyReviewed = $state(false);

	// Check if user has already reviewed
	$effect(async () => {
		const reviewerPubkey = await getNpub();
		if (reviewerPubkey) {
			alreadyReviewed = await hasUserReviewedEscrow(escrowId, reviewerPubkey);
		}
	});

	function validateForm(): boolean {
		const newErrors: Record<string, string> = {};

		if (overallRating === 0) {
			newErrors.overallRating = $t('reviews.form.errors.overall_rating_required');
		}

		if (qualityRating === 0) {
			newErrors.qualityRating = $t('reviews.form.errors.quality_rating_required');
		}

		if (professionalismRating === 0) {
			newErrors.professionalismRating = $t('reviews.form.errors.professionalism_rating_required');
		}

		if (timelinessRating === 0) {
			newErrors.timelinessRating = $t('reviews.form.errors.timeliness_rating_required');
		}

		if (comment.trim().length > 1000) {
			newErrors.comment = $t('reviews.form.errors.comment_too_long');
		}

		errors = newErrors;
		return Object.keys(newErrors).length === 0;
	}

	async function handleSubmit() {
		if (!validateForm() || isSubmitting || alreadyReviewed) {
			return;
		}

		isSubmitting = true;

		try {
			const content: ReviewContentWithRatings = {
				overallRating,
				categoryRatings: {
					quality: qualityRating,
					professionalism: professionalismRating,
					timeliness: timelinessRating
				},
				comment: comment.trim() || undefined,
				photos: photos.length > 0 ? photos : undefined
			};

			const eventId = await publishVerifiedReview(escrowId, revieweePubkey, content, escrowTxHash);
			
			appStore.showSuccessToast($t('reviews.form.success'));
			onSubmit?.(eventId);
		} catch (error) {
			console.error('Failed to submit review:', error);
			appStore.showErrorToast(
				error instanceof Error ? error.message : $t('reviews.form.errors.submit_failed')
			);
		} finally {
			isSubmitting = false;
		}
	}

	function setRating(category: 'overall' | 'quality' | 'professionalism' | 'timeliness', value: number) {
		if (category === 'overall') {
			overallRating = value;
		} else if (category === 'quality') {
			qualityRating = value;
		} else if (category === 'professionalism') {
			professionalismRating = value;
		} else if (category === 'timeliness') {
			timelinessRating = value;
		}
	}

	function getRatingClass(rating: number, current: number): string {
		if (current === 0) return 'text-base-content/30';
		return current >= rating ? 'text-warning' : 'text-base-content/30';
	}
</script>

<div class="card bg-base-100 shadow-xl">
	<div class="card-body">
		<h2 class="card-title">{$t('reviews.form.title')}</h2>

		{#if alreadyReviewed}
			<div class="alert alert-outline alert-warning">
				<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 shrink-0 stroke-current" fill="none" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
				</svg>
				<span>{$t('reviews.form.already_reviewed')}</span>
			</div>
		{/if}

		<!-- Overall Rating -->
		<div class="form-control">
			<label class="label">
				<span class="label-text font-semibold">{$t('reviews.form.overall_rating')}</span>
				{#if errors.overallRating}
					<span class="label-text-alt text-error">{errors.overallRating}</span>
				{/if}
			</label>
			<div class="flex gap-2 items-center">
				{#each Array(5) as _, i}
					<button
						type="button"
						class="btn btn-ghost btn-sm p-1"
						onclick={() => setRating('overall', i + 1)}
						disabled={isSubmitting || alreadyReviewed}
					>
						<svg
							class="w-6 h-6 {getRatingClass(i + 1, overallRating)}"
							fill="currentColor"
							viewBox="0 0 20 20"
						>
							<path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
						</svg>
					</button>
				{/each}
				{#if overallRating > 0}
					<span class="text-sm text-base-content/70 ml-2">{overallRating}/5</span>
				{/if}
			</div>
		</div>

		<!-- Category Ratings -->
		<div class="form-control">
			<label class="label">
				<span class="label-text">{$t('reviews.form.quality')}</span>
				{#if errors.qualityRating}
					<span class="label-text-alt text-error">{errors.qualityRating}</span>
				{/if}
			</label>
			<div class="flex gap-2 items-center">
				{#each Array(5) as _, i}
					<button
						type="button"
						class="btn btn-ghost btn-sm p-1"
						onclick={() => setRating('quality', i + 1)}
						disabled={isSubmitting || alreadyReviewed}
					>
						<svg
							class="w-5 h-5 {getRatingClass(i + 1, qualityRating)}"
							fill="currentColor"
							viewBox="0 0 20 20"
						>
							<path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
						</svg>
					</button>
				{/each}
				{#if qualityRating > 0}
					<span class="text-sm text-base-content/70 ml-2">{qualityRating}/5</span>
				{/if}
			</div>
		</div>

		<div class="form-control">
			<label class="label">
				<span class="label-text">{$t('reviews.form.professionalism')}</span>
				{#if errors.professionalismRating}
					<span class="label-text-alt text-error">{errors.professionalismRating}</span>
				{/if}
			</label>
			<div class="flex gap-2 items-center">
				{#each Array(5) as _, i}
					<button
						type="button"
						class="btn btn-ghost btn-sm p-1"
						onclick={() => setRating('professionalism', i + 1)}
						disabled={isSubmitting || alreadyReviewed}
					>
						<svg
							class="w-5 h-5 {getRatingClass(i + 1, professionalismRating)}"
							fill="currentColor"
							viewBox="0 0 20 20"
						>
							<path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
						</svg>
					</button>
				{/each}
				{#if professionalismRating > 0}
					<span class="text-sm text-base-content/70 ml-2">{professionalismRating}/5</span>
				{/if}
			</div>
		</div>

		<div class="form-control">
			<label class="label">
				<span class="label-text">{$t('reviews.form.timeliness')}</span>
				{#if errors.timelinessRating}
					<span class="label-text-alt text-error">{errors.timelinessRating}</span>
				{/if}
			</label>
			<div class="flex gap-2 items-center">
				{#each Array(5) as _, i}
					<button
						type="button"
						class="btn btn-ghost btn-sm p-1"
						onclick={() => setRating('timeliness', i + 1)}
						disabled={isSubmitting || alreadyReviewed}
					>
						<svg
							class="w-5 h-5 {getRatingClass(i + 1, timelinessRating)}"
							fill="currentColor"
							viewBox="0 0 20 20"
						>
							<path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
						</svg>
					</button>
				{/each}
				{#if timelinessRating > 0}
					<span class="text-sm text-base-content/70 ml-2">{timelinessRating}/5</span>
				{/if}
			</div>
		</div>

		<!-- Comment -->
		<div class="form-control">
			<label class="label">
				<span class="label-text">{$t('reviews.form.comment')}</span>
				<span class="label-text-alt">{comment.length}/1000</span>
			</label>
			<textarea
				class="textarea textarea-bordered h-24 {errors.comment ? 'textarea-error' : ''}"
				placeholder={$t('reviews.form.comment_placeholder')}
				bind:value={comment}
				maxlength={1000}
				disabled={isSubmitting || alreadyReviewed}
			></textarea>
			{#if errors.comment}
				<span class="label-text-alt text-error">{errors.comment}</span>
			{/if}
		</div>

		<!-- Actions -->
		<div class="card-actions justify-end mt-4">
			{#if onCancel}
				<button
					class="btn btn-ghost"
					onclick={onCancel}
					disabled={isSubmitting}
				>
					{$t('common.buttons.cancel')}
				</button>
			{/if}
			<button
				class="btn btn-primary"
				onclick={handleSubmit}
				disabled={isSubmitting || alreadyReviewed}
			>
				{#if isSubmitting}
					<span class="loading loading-spinner loading-sm"></span>
					{$t('reviews.form.submitting')}
				{:else}
					{$t('reviews.form.submit')}
				{/if}
			</button>
		</div>
	</div>
</div>



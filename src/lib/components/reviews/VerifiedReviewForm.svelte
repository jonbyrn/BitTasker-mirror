<script lang="ts">
	import { t } from 'svelte-i18n';
	import { publishVerifiedReview, hasUserReviewedEscrow } from '$lib/utils/nostr-review';
	import { getNpub } from '$lib/utils/nostrKeys';
	import { appStore } from '$lib/stores/app.store';
	import type { ReviewContentWithRatings, TaskeeCategoryRatings, TaskerCategoryRatings, LegacyCategoryRatings } from '$lib/types/review';

	let {
		escrowId,
		revieweePubkey,
		escrowTxHash,
		revieweeRole,
		onSubmit,
		onCancel
	} = $props<{
		escrowId: string;
		revieweePubkey: string;
		escrowTxHash?: string;
		revieweeRole?: 'tasker' | 'taskee' | null;
		onSubmit?: (eventId: string) => void;
		onCancel?: () => void;
	}>();

	let overallRating = $state(0);
	
	// Role-specific category ratings
	let workQualityRating = $state(0);
	let experienceRating = $state(0);
	let deliverySpeedRating = $state(0);
	
	// For Tasker (Client)
	let communicationRating = $state(0);
	let clarityRating = $state(0);
	let paymentTimelinessRating = $state(0);
	
	let comment = $state('');
	let photos = $state<string[]>([]);
	let isSubmitting = $state(false);
	let errors = $state<Record<string, string>>({});
	let alreadyReviewed = $state(false);

	// Check if user has already reviewed
	$effect(() => {
		(async () => {
			const reviewerPubkey = await getNpub();
			if (reviewerPubkey) {
				alreadyReviewed = await hasUserReviewedEscrow(escrowId, reviewerPubkey);
			}
		})();
	});

	function validateForm(): boolean {
		const newErrors: Record<string, string> = {};

		if (overallRating === 0) {
			newErrors.overallRating = $t('reviews.form.errors.overall_rating_required');
		}

		// Validate role-specific categories
		if (revieweeRole === 'taskee') {
			if (workQualityRating === 0) {
				newErrors.workQuality = $t('reviews.form.errors.work_quality_required');
			}
			if (experienceRating === 0) {
				newErrors.experience = $t('reviews.form.errors.experience_required');
			}
			if (deliverySpeedRating === 0) {
				newErrors.deliverySpeed = $t('reviews.form.errors.delivery_speed_required');
			}
		} else if (revieweeRole === 'tasker') {
			if (communicationRating === 0) {
				newErrors.communication = $t('reviews.form.errors.communication_required');
			}
			if (clarityRating === 0) {
				newErrors.clarity = $t('reviews.form.errors.clarity_required');
			}
			if (paymentTimelinessRating === 0) {
				newErrors.paymentTimeliness = $t('reviews.form.errors.payment_timeliness_required');
			}
		} else {
			// Fallback to legacy categories if role unknown
			if (workQualityRating === 0 && communicationRating === 0) {
				newErrors.category = $t('reviews.form.errors.category_rating_required');
			}
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
			// Create role-specific category ratings
			let categoryRatings: RoleSpecificCategoryRatings;
			
			if (revieweeRole === 'taskee') {
				categoryRatings = {
					workQuality: workQualityRating,
					experience: experienceRating,
					deliverySpeed: deliverySpeedRating
				};
			} else if (revieweeRole === 'tasker') {
				categoryRatings = {
					communication: communicationRating,
					clarity: clarityRating,
					paymentTimeliness: paymentTimelinessRating
				};
			} else {
				// Fallback to legacy format if role unknown
				categoryRatings = {
					quality: workQualityRating || communicationRating,
					professionalism: experienceRating || clarityRating,
					timeliness: deliverySpeedRating || paymentTimelinessRating
				} as LegacyCategoryRatings;
			}

			const content: ReviewContentWithRatings = {
				overallRating,
				categoryRatings,
				revieweeRole: revieweeRole || undefined,
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

	function setRating(
		category: 'overall' | 
			'workQuality' | 'experience' | 'deliverySpeed' |
			'communication' | 'clarity' | 'paymentTimeliness',
		value: number
	) {
		if (category === 'overall') {
			overallRating = value;
		} else if (category === 'workQuality') {
			workQualityRating = value;
		} else if (category === 'experience') {
			experienceRating = value;
		} else if (category === 'deliverySpeed') {
			deliverySpeedRating = value;
		} else if (category === 'communication') {
			communicationRating = value;
		} else if (category === 'clarity') {
			clarityRating = value;
		} else if (category === 'paymentTimeliness') {
			paymentTimelinessRating = value;
		}
	}

	function getRatingClass(rating: number, current: number): string {
		if (current === 0) return 'text-base-content/20';
		return current >= rating ? 'text-warning fill-warning' : 'text-base-content/20';
	}
</script>

<div class="w-full">
	<!-- Header Section -->
	<div class="mb-6 pb-4 border-b border-base-300">
		<div class="flex items-center gap-3 mb-3">
			<div class="p-2.5 rounded-xl bg-primary/10 border border-primary/20">
				<svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
				</svg>
			</div>
			<div>
				<h2 class="text-2xl font-bold text-base-content">{$t('reviews.form.title')}</h2>
				<p class="text-base-content/60 text-sm mt-1">Share your experience and help build trust in the community</p>
			</div>
		</div>
	</div>

	{#if alreadyReviewed}
		<div class="alert alert-outline alert-warning mb-6">
			<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 shrink-0 stroke-current" fill="none" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
			</svg>
			<span class="text-sm">{$t('reviews.form.already_reviewed')}</span>
		</div>
	{/if}

	<div class="space-y-6">
		<!-- Overall Rating - Featured -->
		<div class="form-control">
			<div class="flex items-center justify-between mb-3">
				<label class="label p-0">
					<span class="text-base font-semibold text-base-content">{$t('reviews.form.overall_rating')}</span>
					<span class="text-xs text-error ml-1">*</span>
				</label>
				{#if overallRating > 0}
					<div class="badge badge-primary badge-lg gap-1">
						<span>{overallRating}</span>
						<span class="text-xs">/ 5</span>
					</div>
				{/if}
			</div>
			<div class="flex gap-2 items-center bg-base-200/50 rounded-xl p-4">
				{#each Array(5) as _, i}
					<button
						type="button"
						class="w-7 h-7 flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95 {isSubmitting || alreadyReviewed ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}"
						onclick={() => setRating('overall', i + 1)}
						disabled={isSubmitting || alreadyReviewed}
						aria-label="Rate {i + 1} out of 5"
					>
						<svg
							class="w-5 h-5 {getRatingClass(i + 1, overallRating)} transition-colors duration-200"
							fill="currentColor"
							viewBox="0 0 20 20"
							xmlns="http://www.w3.org/2000/svg"
						>
							<path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
						</svg>
					</button>
				{/each}
			</div>
			{#if errors.overallRating}
				<div class="label">
					<span class="label-text-alt text-error text-xs mt-1">{errors.overallRating}</span>
				</div>
			{/if}
		</div>

		<!-- Divider -->
		<div class="divider my-6">
			<span class="text-xs text-base-content/40">Category Ratings</span>
		</div>

		<!-- Category Ratings - Role-Specific -->
		<div class="grid gap-4">
			{#if revieweeRole === 'taskee'}
				<!-- Taskee (Freelancer) Categories -->
				
				<!-- Work Quality -->
				<div class="form-control">
					<div class="flex items-center justify-between mb-2">
						<label class="label p-0">
							<span class="text-sm font-medium text-base-content">{$t('reviews.form.work_quality')}</span>
							<span class="text-xs text-error ml-1">*</span>
						</label>
						{#if workQualityRating > 0}
							<span class="text-xs text-base-content/60 font-medium">{workQualityRating}/5</span>
						{/if}
					</div>
					<p class="text-xs text-base-content/50 mb-2">{$t('reviews.form.work_quality_desc')}</p>
					<div class="flex gap-2 items-center">
						{#each Array(5) as _, i}
							<button
								type="button"
								class="w-7 h-7 flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95 {isSubmitting || alreadyReviewed ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}"
								onclick={() => setRating('workQuality', i + 1)}
								disabled={isSubmitting || alreadyReviewed}
								aria-label="Rate work quality {i + 1} out of 5"
							>
								<svg
									class="w-5 h-5 {getRatingClass(i + 1, workQualityRating)} transition-colors duration-200"
									fill="currentColor"
									viewBox="0 0 20 20"
									xmlns="http://www.w3.org/2000/svg"
								>
									<path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
								</svg>
							</button>
						{/each}
					</div>
					{#if errors.workQuality}
						<div class="label">
							<span class="label-text-alt text-error text-xs mt-1">{errors.workQuality}</span>
						</div>
					{/if}
				</div>

				<!-- Experience -->
				<div class="form-control">
					<div class="flex items-center justify-between mb-2">
						<label class="label p-0">
							<span class="text-sm font-medium text-base-content">{$t('reviews.form.experience')}</span>
							<span class="text-xs text-error ml-1">*</span>
						</label>
						{#if experienceRating > 0}
							<span class="text-xs text-base-content/60 font-medium">{experienceRating}/5</span>
						{/if}
					</div>
					<p class="text-xs text-base-content/50 mb-2">{$t('reviews.form.experience_desc')}</p>
					<div class="flex gap-2 items-center">
						{#each Array(5) as _, i}
							<button
								type="button"
								class="w-7 h-7 flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95 {isSubmitting || alreadyReviewed ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}"
								onclick={() => setRating('experience', i + 1)}
								disabled={isSubmitting || alreadyReviewed}
								aria-label="Rate experience {i + 1} out of 5"
							>
								<svg
									class="w-5 h-5 {getRatingClass(i + 1, experienceRating)} transition-colors duration-200"
									fill="currentColor"
									viewBox="0 0 20 20"
									xmlns="http://www.w3.org/2000/svg"
								>
									<path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
								</svg>
							</button>
						{/each}
					</div>
					{#if errors.experience}
						<div class="label">
							<span class="label-text-alt text-error text-xs mt-1">{errors.experience}</span>
						</div>
					{/if}
				</div>

				<!-- Delivery Speed -->
				<div class="form-control">
					<div class="flex items-center justify-between mb-2">
						<label class="label p-0">
							<span class="text-sm font-medium text-base-content">{$t('reviews.form.delivery_speed')}</span>
							<span class="text-xs text-error ml-1">*</span>
						</label>
						{#if deliverySpeedRating > 0}
							<span class="text-xs text-base-content/60 font-medium">{deliverySpeedRating}/5</span>
						{/if}
					</div>
					<p class="text-xs text-base-content/50 mb-2">{$t('reviews.form.delivery_speed_desc')}</p>
					<div class="flex gap-2 items-center">
						{#each Array(5) as _, i}
							<button
								type="button"
								class="w-7 h-7 flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95 {isSubmitting || alreadyReviewed ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}"
								onclick={() => setRating('deliverySpeed', i + 1)}
								disabled={isSubmitting || alreadyReviewed}
								aria-label="Rate delivery speed {i + 1} out of 5"
							>
								<svg
									class="w-5 h-5 {getRatingClass(i + 1, deliverySpeedRating)} transition-colors duration-200"
									fill="currentColor"
									viewBox="0 0 20 20"
									xmlns="http://www.w3.org/2000/svg"
								>
									<path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
								</svg>
							</button>
						{/each}
					</div>
					{#if errors.deliverySpeed}
						<div class="label">
							<span class="label-text-alt text-error text-xs mt-1">{errors.deliverySpeed}</span>
						</div>
					{/if}
				</div>
			{:else if revieweeRole === 'tasker'}
				<!-- Tasker (Client) Categories -->
				
				<!-- Communication -->
				<div class="form-control">
					<div class="flex items-center justify-between mb-2">
						<label class="label p-0">
							<span class="text-sm font-medium text-base-content">{$t('reviews.form.communication')}</span>
							<span class="text-xs text-error ml-1">*</span>
						</label>
						{#if communicationRating > 0}
							<span class="text-xs text-base-content/60 font-medium">{communicationRating}/5</span>
						{/if}
					</div>
					<p class="text-xs text-base-content/50 mb-2">{$t('reviews.form.communication_desc')}</p>
					<div class="flex gap-2 items-center">
						{#each Array(5) as _, i}
							<button
								type="button"
								class="w-7 h-7 flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95 {isSubmitting || alreadyReviewed ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}"
								onclick={() => setRating('communication', i + 1)}
								disabled={isSubmitting || alreadyReviewed}
								aria-label="Rate communication {i + 1} out of 5"
							>
								<svg
									class="w-5 h-5 {getRatingClass(i + 1, communicationRating)} transition-colors duration-200"
									fill="currentColor"
									viewBox="0 0 20 20"
									xmlns="http://www.w3.org/2000/svg"
								>
									<path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
								</svg>
							</button>
						{/each}
					</div>
					{#if errors.communication}
						<div class="label">
							<span class="label-text-alt text-error text-xs mt-1">{errors.communication}</span>
						</div>
					{/if}
				</div>

				<!-- Clarity -->
				<div class="form-control">
					<div class="flex items-center justify-between mb-2">
						<label class="label p-0">
							<span class="text-sm font-medium text-base-content">{$t('reviews.form.clarity')}</span>
							<span class="text-xs text-error ml-1">*</span>
						</label>
						{#if clarityRating > 0}
							<span class="text-xs text-base-content/60 font-medium">{clarityRating}/5</span>
						{/if}
					</div>
					<p class="text-xs text-base-content/50 mb-2">{$t('reviews.form.clarity_desc')}</p>
					<div class="flex gap-2 items-center">
						{#each Array(5) as _, i}
							<button
								type="button"
								class="w-7 h-7 flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95 {isSubmitting || alreadyReviewed ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}"
								onclick={() => setRating('clarity', i + 1)}
								disabled={isSubmitting || alreadyReviewed}
								aria-label="Rate clarity {i + 1} out of 5"
							>
								<svg
									class="w-5 h-5 {getRatingClass(i + 1, clarityRating)} transition-colors duration-200"
									fill="currentColor"
									viewBox="0 0 20 20"
									xmlns="http://www.w3.org/2000/svg"
								>
									<path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
								</svg>
							</button>
						{/each}
					</div>
					{#if errors.clarity}
						<div class="label">
							<span class="label-text-alt text-error text-xs mt-1">{errors.clarity}</span>
						</div>
					{/if}
				</div>

				<!-- Payment Timeliness -->
				<div class="form-control">
					<div class="flex items-center justify-between mb-2">
						<label class="label p-0">
							<span class="text-sm font-medium text-base-content">{$t('reviews.form.payment_timeliness')}</span>
							<span class="text-xs text-error ml-1">*</span>
						</label>
						{#if paymentTimelinessRating > 0}
							<span class="text-xs text-base-content/60 font-medium">{paymentTimelinessRating}/5</span>
						{/if}
					</div>
					<p class="text-xs text-base-content/50 mb-2">{$t('reviews.form.payment_timeliness_desc')}</p>
					<div class="flex gap-2 items-center">
						{#each Array(5) as _, i}
							<button
								type="button"
								class="w-7 h-7 flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95 {isSubmitting || alreadyReviewed ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}"
								onclick={() => setRating('paymentTimeliness', i + 1)}
								disabled={isSubmitting || alreadyReviewed}
								aria-label="Rate payment timeliness {i + 1} out of 5"
							>
								<svg
									class="w-5 h-5 {getRatingClass(i + 1, paymentTimelinessRating)} transition-colors duration-200"
									fill="currentColor"
									viewBox="0 0 20 20"
									xmlns="http://www.w3.org/2000/svg"
								>
									<path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
								</svg>
							</button>
						{/each}
					</div>
					{#if errors.paymentTimeliness}
						<div class="label">
							<span class="label-text-alt text-error text-xs mt-1">{errors.paymentTimeliness}</span>
						</div>
					{/if}
				</div>
			{:else}
				<!-- Fallback: Legacy categories if role unknown -->
				<div class="alert alert-outline alert-warning">
					<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 shrink-0 stroke-current" fill="none" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
					</svg>
					<span class="text-sm">{$t('reviews.form.role_unknown')}</span>
				</div>
			{/if}
		</div>

		<!-- Comment Section -->
		<div class="form-control pt-4 border-t border-base-300">
			<div class="flex items-center justify-between mb-2">
				<label class="label p-0">
					<span class="text-sm font-medium text-base-content">{$t('reviews.form.comment')}</span>
				</label>
				<span class="text-xs text-base-content/50 {comment.length > 900 ? 'text-warning' : ''} {comment.length >= 1000 ? 'text-error' : ''}">
					{comment.length}/1000
				</span>
			</div>
			<textarea
				class="textarea textarea-bordered min-h-[100px] w-full resize-none focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all {errors.comment ? 'textarea-error border-error' : ''}"
				placeholder={$t('reviews.form.comment_placeholder')}
				bind:value={comment}
				maxlength={1000}
				disabled={isSubmitting || alreadyReviewed}
				rows="4"
			></textarea>
			{#if errors.comment}
				<div class="label">
					<span class="label-text-alt text-error text-xs mt-1">{errors.comment}</span>
				</div>
			{/if}
		</div>

		<!-- Actions -->
		<div class="flex gap-3 pt-6 border-t border-base-300">
			{#if onCancel}
				<button
					class="btn btn-ghost btn-outline flex-1"
					onclick={onCancel}
					disabled={isSubmitting}
				>
					{$t('common.cancel')}
				</button>
			{/if}
			<button
				class="btn btn-primary flex-1 gap-2"
				onclick={handleSubmit}
				disabled={isSubmitting || alreadyReviewed}
			>
				{#if isSubmitting}
					<span class="loading loading-spinner loading-sm"></span>
					<span>{$t('reviews.form.submitting')}</span>
				{:else}
					<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
					</svg>
					<span>{$t('reviews.form.submit')}</span>
				{/if}
			</button>
		</div>
	</div>
</div>



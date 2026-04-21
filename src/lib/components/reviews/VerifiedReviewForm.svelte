<script lang="ts">
	import { onMount } from 'svelte';
	import { t } from 'svelte-i18n';
	import MediaUploader from '$lib/components/MediaUploader.svelte';
	import type { UploadResult } from '$lib/api/services/upload.service';
	import {
		getRatingToneClasses,
		getReviewSubjectLabel,
		getReviewOutcomeLabel,
		getReviewSettlementLabel,
		getReviewRoleLabel
	} from './reviewDisplay';
	import type {
		ReviewAttachment,
		ReviewComposerCategoryGroup,
		ReviewDraftSubmission,
		ReviewLocalizedText,
		ReviewRole
	} from './reviewTypes';

	let {
		id, // Explicit ID for draft uniquely
		revieweePubkey,
		revieweeLabel,
		subjectLabel,
		subjectType,
		settlementType,
		contractOutcome,
		revieweeRole,
		categoryGroups = [],
		initialRating = 0,
		initialContent = { en: '', es: '' },
		isSubmitting = false,
		error = '',
		onSubmit,
		onCancel
	} = $props<{
		id: string;
		revieweePubkey: string;
		revieweeLabel?: string | null;
		subjectLabel?: string | null;
		subjectType: 'task' | 'service_booking';
		settlementType: string;
		contractOutcome: string;
		revieweeRole: ReviewRole;
		categoryGroups?: ReviewComposerCategoryGroup[];
		initialRating?: number;
		initialContent?: ReviewLocalizedText;
		isSubmitting?: boolean;
		error?: string;
		onSubmit?: (draft: ReviewDraftSubmission) => void | Promise<void>;
		onCancel?: () => void;
	}>();

	const storageKey = $derived.by(() =>
		buildStorageKey(id, revieweePubkey, subjectType, settlementType, contractOutcome, revieweeRole)
	);
	const resetKey = $derived.by(() =>
		JSON.stringify({
			id,
			subjectType,
			settlementType,
			contractOutcome,
			revieweeRole,
			initialRating,
			initialContent,
			categoryGroups
		})
	);
	let overallRating = $state(0);
	let contentEn = $state('');
	let contentEs = $state('');
	let attachmentResults = $state<UploadResult[]>([]);
	let localError = $state('');
	let categoryValues = $state<Record<string, number>>({});
	let lastResetKey = $state('');
	let hasHydrated = $state(false);
	let lastSavedKey = $state('');
	let hasRestoredDraft = $state(false);
	let suppressNextDraftWrite = $state(false);

	function buildCategoryValueMap(groups: ReviewComposerCategoryGroup[]) {
		return Object.fromEntries(
			groups.flatMap((group) => group.categories.map((category) => [category.id, category.value]))
		);
	}

	function setRating(categoryId: string, value: number) {
		categoryValues = { ...categoryValues, [categoryId]: value };
	}

	function handleUpload(results: UploadResult[]) {
		attachmentResults = results;
		localError = '';
	}

	function handleRemove(index: number) {
		attachmentResults = attachmentResults.filter((_, currentIndex) => currentIndex !== index);
	}

	function restoreInitialDraftState() {
		overallRating = initialRating;
		contentEn = initialContent.en;
		contentEs = initialContent.es;
		attachmentResults = [];
		categoryValues = buildCategoryValueMap(categoryGroups);
	}

	function readDraft(key = storageKey) {
		if (typeof window === 'undefined') return null;
		try {
			const raw = window.localStorage.getItem(key);
			if (!raw) return null;
			return JSON.parse(raw) as {
				overallRating?: number;
				contentEn?: string;
				contentEs?: string;
				attachmentResults?: UploadResult[];
				categoryValues?: Record<string, number>;
			};
		} catch {
			return null;
		}
	}

	function writeDraft() {
		if (typeof window === 'undefined') return;
		try {
			window.localStorage.setItem(
				storageKey,
				JSON.stringify({
					overallRating,
					contentEn,
					contentEs,
					attachmentResults,
					categoryValues
				})
			);
		} catch {
			// Best-effort draft persistence.
		}
	}

	function clearDraft() {
		if (typeof window === 'undefined') return;
		try {
			window.localStorage.removeItem(storageKey);
		} catch {
			// Ignore persistence failures.
		}
	}

	function buildStorageKey(
		currentId: string,
		currentRevieweePubkey: string,
		currentSubjectType: 'task' | 'service_booking',
		currentSettlementType: string,
		currentContractOutcome: string,
		currentRevieweeRole: ReviewRole
	) {
		return `reviews.form.v2.${currentId}:${currentRevieweePubkey}:${currentSubjectType}:${currentSettlementType}:${currentContractOutcome}:${currentRevieweeRole}`;
	}

	function discardRestoredDraft() {
		suppressNextDraftWrite = true;
		clearDraft();
		restoreInitialDraftState();
		hasRestoredDraft = false;
		localError = '';
	}

	function hydrateDraftFromStorage() {
		const stored = readDraft();
		if (stored) {
			overallRating = stored.overallRating ?? initialRating;
			contentEn = stored.contentEn ?? initialContent.en;
			contentEs = stored.contentEs ?? initialContent.es;
			attachmentResults = stored.attachmentResults ?? [];
			categoryValues =
				stored.categoryValues && Object.keys(stored.categoryValues).length > 0
					? stored.categoryValues
					: buildCategoryValueMap(categoryGroups);
			hasRestoredDraft = true;
		} else {
			restoreInitialDraftState();
			hasRestoredDraft = false;
		}
		localError = '';
	}

	onMount(() => {
		hydrateDraftFromStorage();
		lastResetKey = resetKey;
		lastSavedKey = storageKey;
		hasHydrated = true;
	});

	function toAttachments(results: UploadResult[]): ReviewAttachment[] {
		const attachmentAlt = (type: 'image' | 'video') =>
			type === 'video'
				? $t('reviews.attachments.review_video_alt')
				: $t('reviews.attachments.review_image_alt');

		return results.map((result) => ({
			url: result.url,
			type: result.type === 'video' ? 'video' : 'image',
			alt: attachmentAlt(result.type === 'video' ? 'video' : 'image'),
			name: result.key,
			size: result.size
		}));
	}

	function buildCategoryScores() {
		return categoryGroups.flatMap((group) =>
			group.categories.map((category) => ({
				id: category.id,
				label: category.label,
				value: categoryValues[category.id] ?? 0,
				description: category.description
			}))
		);
	}

	function validate(): string | null {
		if (overallRating <= 0) {
			return $t('reviews.form.errors.overall_rating_required');
		}

		for (const group of categoryGroups) {
			for (const category of group.categories) {
				if (!Number.isFinite(categoryValues[category.id]) || categoryValues[category.id] <= 0) {
					return $t('reviews.form.errors.category_rating_required');
				}
			}
		}

		if (!contentEn.trim() && !contentEs.trim()) {
			return $t('reviews.form.errors.comment_required');
		}

		return null;
	}

	async function submitReview() {
		const validationError = validate();
		if (validationError) {
			localError = validationError;
			return;
		}

		try {
			await onSubmit?.({
				overallRating,
				content: { en: contentEn.trim(), es: contentEs.trim() },
				categoryScores: buildCategoryScores(),
				attachments: toAttachments(attachmentResults)
			});
			clearDraft();
			hasRestoredDraft = false;
		} catch (submitError) {
			localError =
				submitError instanceof Error
					? submitError.message
					: $t('reviews.form.errors.submit_failed');
		}
	}

	const ratingSteps = [1, 2, 3, 4, 5] as const;

	$effect(() => {
		if (!hasHydrated) {
			return;
		}

		if (resetKey !== lastResetKey) {
			lastResetKey = resetKey;
			lastSavedKey = storageKey;
			hydrateDraftFromStorage();
			return;
		}

		if (lastSavedKey !== storageKey) {
			return;
		}

		if (suppressNextDraftWrite) {
			suppressNextDraftWrite = false;
			return;
		}

		writeDraft();
	});
</script>

<div class="space-y-6">
	<div class="border-base-300 border-b pb-4">
		<div class="flex items-start justify-between gap-4">
			<div class="space-y-1">
				<p class="text-base-content/50 text-xs tracking-[0.18em] uppercase">
					{$t('reviews.form.title')}
				</p>
				<h2 class="text-2xl font-bold">
					{$t('reviews.form.subtitle')}
				</h2>
				{#if subjectLabel}
					<p class="text-base-content/60 text-sm">{subjectLabel}</p>
				{/if}
			</div>
			{#if onCancel}
				<button
					type="button"
					class="btn btn-ghost btn-sm"
					onclick={onCancel}
					disabled={isSubmitting}
				>
					{$t('common.cancel')}
				</button>
			{/if}
		</div>
	</div>

	{#if hasRestoredDraft}
		<div
			class="alert alert-info alert-outline flex items-center justify-between gap-3 py-2 text-sm"
			role="status"
			aria-live="polite"
		>
			<span>{$t('reviews.form.draft_restored')}</span>
			<button type="button" class="btn btn-ghost btn-xs" onclick={discardRestoredDraft}>
				{$t('reviews.form.discard_draft')}
			</button>
		</div>
	{/if}

	<div class="grid gap-4 md:grid-cols-2">
		<div class="card bg-base-200 border-base-300 border">
			<div class="card-body gap-4 p-4">
				<div class="flex items-center justify-between">
					<span class="text-sm font-semibold">{$t('reviews.form.overall_rating')}</span>
					<span class={`text-xl font-bold ${getRatingToneClasses(overallRating).text}`}>
						{overallRating.toFixed(1)}
					</span>
				</div>
				<div class="flex gap-1">
					{#each ratingSteps as rating (rating)}
						<button
							type="button"
							class={`btn btn-circle btn-sm border-none ${overallRating >= rating ? 'btn-warning' : 'btn-ghost'}`}
							onclick={() => (overallRating = rating)}
							disabled={isSubmitting}
							aria-label={$t('reviews.form.rate_overall_aria', { values: { rating } })}
						>
							{rating}
						</button>
					{/each}
				</div>
			</div>
		</div>

		<div class="card bg-base-200 border-base-300 border">
			<div class="card-body gap-2 p-4">
				<p class="text-sm font-semibold">{$t('reviews.form.context_title')}</p>
				<p class="text-base-content/70 text-sm">
					{$t('reviews.form.context_summary', {
						values: {
							subjectType: getReviewSubjectLabel(subjectType, $t),
							settlementType: getReviewSettlementLabel(settlementType, $t),
							contractOutcome: getReviewOutcomeLabel(contractOutcome, $t)
						}
					})}
				</p>
				{#if revieweeLabel}
					<p class="text-base-content/70 text-sm">
						{$t('reviews.form.reviewing', { values: { reviewee: revieweeLabel } })}
					</p>
				{/if}
				<p class="text-base-content/60 text-xs">
					{$t('reviews.form.reviewee_role', {
						values: { role: getReviewRoleLabel(revieweeRole, $t) }
					})}
				</p>
			</div>
		</div>
	</div>

	{#if categoryGroups.length > 0}
		<div class="space-y-4">
			{#each categoryGroups as group (group.id)}
				<div class="card border-base-300 bg-base-100 border shadow-sm">
					<div class="card-body gap-4 p-4">
						{#if group.heading}
							<h3 class="font-semibold">{group.heading}</h3>
						{/if}
						<div class="grid gap-4 md:grid-cols-3">
							{#each group.categories as category (category.id)}
								<div class="bg-base-200/50 space-y-2 rounded-2xl p-3">
									<div class="flex items-center justify-between gap-2">
										<div>
											<p class="font-medium">{category.label}</p>
											{#if category.description}
												<p class="text-base-content/60 text-xs">{category.description}</p>
											{/if}
										</div>
										<span class="text-base-content/60 text-sm font-semibold">
											{(categoryValues[category.id] || 0).toFixed(1)}
										</span>
									</div>
									<div class="flex gap-1" role="radiogroup" aria-label={category.label}>
										{#each ratingSteps as rating (rating)}
											<button
												type="button"
												class={`btn btn-circle btn-xs border-none ${
													(categoryValues[category.id] || 0) >= rating ? 'btn-warning' : 'btn-ghost'
												}`}
												onclick={() => setRating(category.id, rating)}
												disabled={isSubmitting}
												role="radio"
												aria-checked={categoryValues[category.id] === rating}
												aria-label={`${category.label} ${rating}`}
											>
												{rating}
											</button>
										{/each}
									</div>
								</div>
							{/each}
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}

	<div class="grid gap-4 md:grid-cols-2">
		<label class="form-control">
			<div class="label">
				<span class="label-text font-medium">{$t('reviews.form.english_label')}</span>
			</div>
			<textarea
				class="textarea textarea-bordered min-h-44"
				bind:value={contentEn}
				placeholder={$t('reviews.form.english_placeholder')}
				disabled={isSubmitting}
			></textarea>
		</label>
		<label class="form-control">
			<div class="label">
				<span class="label-text font-medium">{$t('reviews.form.spanish_label')}</span>
			</div>
			<textarea
				class="textarea textarea-bordered min-h-44"
				bind:value={contentEs}
				placeholder={$t('reviews.form.spanish_placeholder')}
				disabled={isSubmitting}
			></textarea>
		</label>
	</div>

	<div class="space-y-2">
		<p class="text-base-content/70 text-sm">{$t('reviews.form.attachments_label')}</p>
		<MediaUploader
			id={`review-media-${revieweePubkey}`}
			maxFiles={5}
			maxFileSize={10}
			allowedTypes={['image/*', 'video/*']}
			maxDuration={300}
			enableImageCompression={true}
			useCloudflare={true}
			generateVariants={true}
			uploadFolder="review-attachments"
			label={$t('reviews.form.upload_label')}
			files={attachmentResults.map((item) => item.url)}
			onChange={handleUpload}
			onRemove={handleRemove}
		/>
	</div>

	{#if localError || error}
		<div class="alert alert-error alert-outline">{localError || error}</div>
	{/if}

	<div class="flex items-center justify-end gap-3">
		{#if onCancel}
			<button type="button" class="btn btn-outline" onclick={onCancel} disabled={isSubmitting}>
				{$t('common.cancel')}
			</button>
		{/if}
		<button type="button" class="btn btn-primary" onclick={submitReview} disabled={isSubmitting}>
			{#if isSubmitting}
				<span class="loading loading-spinner loading-sm"></span>
				{$t('reviews.form.submitting')}
			{:else}
				{$t('reviews.form.submit')}
			{/if}
		</button>
	</div>
</div>

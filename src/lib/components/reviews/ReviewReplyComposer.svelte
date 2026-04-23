<script lang="ts">
	import { onMount } from 'svelte';
	import { locale, t } from 'svelte-i18n';
	import MediaUploader from '$lib/components/MediaUploader.svelte';
	import type { UploadResult } from '$lib/api/services/upload.service';
	import {
		formatPubkey,
		formatRelativeTime,
		getReviewOutcomeLabel,
		getReviewSettlementLabel,
		getReviewSubjectLabel,
		pickLocalizedText
	} from './reviewDisplay';
	import type { ReviewAttachment, ReviewLocalizedText, VerifiedReviewRecord } from './reviewTypes';

	let {
		parentReviewId,
		revieweePubkey,
		revieweeLabel,
		initialContent = { en: '', es: '' },
		parentReview = null,
		isSubmitting = false,
		error = '',
		onSubmit,
		onCancel
	} = $props<{
		parentReviewId: string;
		revieweePubkey: string;
		revieweeLabel?: string | null;
		initialContent?: ReviewLocalizedText;
		parentReview?: Pick<
			VerifiedReviewRecord,
			| 'id'
			| 'reviewerPubkey'
			| 'reviewerLabel'
			| 'revieweeLabel'
			| 'subjectType'
			| 'settlementType'
			| 'contractOutcome'
			| 'createdAt'
			| 'overallRating'
			| 'content'
		> | null;
		isSubmitting?: boolean;
		error?: string;
		onSubmit?: (payload: {
			parentReviewId: string;
			content: ReviewLocalizedText;
			attachments: ReviewAttachment[];
		}) => void | Promise<void>;
		onCancel?: () => void;
	}>();

	const storageKey = $derived.by(() => buildStorageKey(parentReviewId, revieweePubkey));
	const resetKey = $derived.by(() =>
		JSON.stringify({
			parentReviewId,
			revieweePubkey,
			initialContent
		})
	);
	let contentEn = $state('');
	let contentEs = $state('');
	let attachmentResults = $state<UploadResult[]>([]);
	let localError = $state('');
	let lastResetKey = $state('');
	let hasHydrated = $state(false);
	let lastSavedKey = $state('');
	let hasRestoredDraft = $state(false);
	let suppressNextDraftWrite = $state(false);

	const parentExcerpt = $derived(
		parentReview ? pickLocalizedText(parentReview.content, $locale) : ''
	);

	function handleUpload(results: UploadResult[]) {
		attachmentResults = results;
		localError = '';
	}

	function handleRemove(index: number) {
		attachmentResults = attachmentResults.filter((_, currentIndex) => currentIndex !== index);
	}

	function restoreInitialDraftState() {
		contentEn = initialContent.en;
		contentEs = initialContent.es;
		attachmentResults = [];
	}

	function readDraft(key = storageKey) {
		if (typeof window === 'undefined') return null;
		try {
			const raw = window.localStorage.getItem(key);
			if (!raw) return null;
			return JSON.parse(raw) as {
				contentEn?: string;
				contentEs?: string;
				attachmentResults?: UploadResult[];
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
					contentEn,
					contentEs,
					attachmentResults
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

	function buildStorageKey(currentParentReviewId: string, currentRevieweePubkey: string) {
		return `reviews.reply.${currentParentReviewId}:${currentRevieweePubkey}`;
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
			contentEn = stored.contentEn ?? initialContent.en;
			contentEs = stored.contentEs ?? initialContent.es;
			attachmentResults = stored.attachmentResults ?? [];
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
				? $t('reviews.attachments.reply_video_alt')
				: $t('reviews.attachments.reply_image_alt');

		return results.map((result) => ({
			url: result.url,
			type: result.type === 'video' ? 'video' : 'image',
			alt: attachmentAlt(result.type === 'video' ? 'video' : 'image'),
			name: result.key,
			size: result.size
		}));
	}

	async function submitReply() {
		const nextContent = {
			en: contentEn.trim(),
			es: contentEs.trim()
		};

		if (!nextContent.en && !nextContent.es) {
			localError = $t('reviews.reply.errors.empty_reply');
			return;
		}

		try {
			await onSubmit?.({
				parentReviewId,
				content: nextContent,
				attachments: toAttachments(attachmentResults)
			});
			clearDraft();
			hasRestoredDraft = false;
		} catch (submitError) {
			localError =
				submitError instanceof Error
					? submitError.message
					: $t('reviews.reply.errors.submit_failed');
		}
	}

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

<div class="space-y-4">
	<div class="card border-base-300 bg-base-100 border shadow-sm">
		<div class="card-body gap-4 p-4">
			<div
				class="border-base-300/70 bg-base-100/95 sticky top-0 z-10 -mx-4 border-b px-4 pt-1 pb-4 backdrop-blur"
			>
				<div class="flex items-start justify-between gap-3">
					<div>
						<p class="text-base-content/50 text-xs tracking-[0.18em] uppercase">
							{$t('reviews.reply.composer_title')}
						</p>
					<h3 class="text-base font-semibold">
						{revieweeLabel?.trim() ||
							(revieweePubkey ? revieweePubkey.slice(0, 12) + '...' + revieweePubkey.slice(-6) : '')}
					</h3>
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

			{#if parentReview}
				<div class="border-base-300 bg-base-200/40 rounded-2xl border p-3">
					<div class="flex flex-wrap items-start justify-between gap-3">
						<div class="min-w-0">
							<p class="text-base-content/50 text-xs tracking-[0.18em] uppercase">
								{$t('reviews.reply.context_title')}
							</p>
							<p class="truncate text-sm font-medium">
								{parentReview.reviewerLabel?.trim() ||
									parentReview.revieweeLabel?.trim() ||
									formatPubkey(parentReview.reviewerPubkey)}
							</p>
						</div>
						<span class="badge badge-outline badge-sm">
							{parentReview.overallRating.toFixed(1)}
						</span>
					</div>

					<div class="mt-2 flex flex-wrap gap-2 text-xs">
						<span class="badge badge-outline"
							>{getReviewSubjectLabel(parentReview.subjectType, $t)}</span
						>
						<span class="badge badge-outline">
							{getReviewSettlementLabel(parentReview.settlementType, $t)}
						</span>
						<span class="badge badge-outline">
							{getReviewOutcomeLabel(parentReview.contractOutcome, $t)}
						</span>
					</div>

					<div class="bg-base-100 mt-3 rounded-xl p-3">
						<div class="flex items-center justify-between gap-2">
							<p class="text-base-content/50 text-xs tracking-[0.18em] uppercase">
								{$t('reviews.reply.context_excerpt_label')}
							</p>
							<span class="text-base-content/40 text-[11px]">
								{formatRelativeTime(parentReview.createdAt, $locale)}
							</span>
						</div>
						<p class="text-base-content/80 mt-2 text-sm leading-6 whitespace-pre-wrap">
							{parentExcerpt || $t('reviews.reply.context_excerpt_empty')}
						</p>
					</div>
				</div>
			{/if}

			{#if hasRestoredDraft}
				<div class="alert alert-info alert-outline py-2 text-sm" role="status" aria-live="polite">
					<span>{$t('reviews.reply.draft_restored')}</span>
					<button type="button" class="btn btn-ghost btn-xs" onclick={discardRestoredDraft}>
						{$t('reviews.reply.discard_draft')}
					</button>
				</div>
			{/if}

			<div class="grid gap-4 md:grid-cols-2">
				<label class="form-control">
					<div class="label">
						<span class="label-text font-medium">{$t('reviews.reply.english_label')}</span>
					</div>
					<textarea
						class="textarea textarea-bordered min-h-40"
						bind:value={contentEn}
						placeholder={$t('reviews.reply.english_placeholder')}
						disabled={isSubmitting}
					></textarea>
				</label>
				<label class="form-control">
					<div class="label">
						<span class="label-text font-medium">{$t('reviews.reply.spanish_label')}</span>
					</div>
					<textarea
						class="textarea textarea-bordered min-h-40"
						bind:value={contentEs}
						placeholder={$t('reviews.reply.spanish_placeholder')}
						disabled={isSubmitting}
					></textarea>
				</label>
			</div>

			<div class="space-y-2">
				<p class="text-base-content/70 text-sm">{$t('reviews.reply.attachments_label')}</p>
				<MediaUploader
					id={`reply-media-${parentReviewId}`}
					maxFiles={5}
					maxFileSize={10}
					allowedTypes={['image/*', 'video/*']}
					maxDuration={300}
					enableImageCompression={true}
					useCloudflare={true}
					generateVariants={true}
					uploadFolder="review-replies"
					label={$t('reviews.reply.upload_label')}
					files={attachmentResults.map((item) => item.url)}
					onChange={handleUpload}
					onRemove={handleRemove}
				/>
			</div>

			{#if localError || error}
				<div class="alert alert-error alert-outline">{localError || error}</div>
			{/if}

			<div class="card-actions justify-end">
				<button class="btn btn-primary" type="button" onclick={submitReply} disabled={isSubmitting}>
					{#if isSubmitting}
						<span class="loading loading-spinner loading-sm"></span>
						{$t('reviews.reply.submitting')}
					{:else}
						{$t('reviews.reply.submit')}
					{/if}
				</button>
			</div>
		</div>
	</div>
</div>

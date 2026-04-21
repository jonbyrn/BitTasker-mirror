<script lang="ts">
	import { onMount } from 'svelte';
	import { t } from 'svelte-i18n';
	import MediaUploader from '$lib/components/MediaUploader.svelte';
	import uploadService, { type UploadResult } from '$lib/api/services/upload.service';
	import { buildReviewDraftHash } from '$lib/reviews';
	import type {
		ReviewAttachment,
		ReviewBilingualContent,
		ReviewComposerDraft,
		ReviewContractOutcome,
		ReviewDraftPayload,
		ReviewLocale,
		ReviewRole,
		ReviewSettlementType,
		ReviewSubjectType
	} from '$lib/reviews';
	import { translateReviewDraft } from '$lib/api/reviews/review-translation';

	let {
		mode = 'review',
		draftKey = 'review-draft',
		reviewerPubkey = '',
		revieweePubkey = '',
		reviewerRole = 'client',
		revieweeRole = 'provider',
		subjectType = 'task',
		settlementType = 'escrow',
		contractOutcome = 'completed',
		initialTitle = '',
		initialComment = '',
		initialRating = 5,
		showRating = true,
		onSubmit = async () => {},
		onCancel = () => {}
	} = $props<{
		mode?: 'review' | 'reply';
		draftKey?: string;
		reviewerPubkey?: string;
		revieweePubkey?: string;
		reviewerRole?: ReviewRole;
		revieweeRole?: ReviewRole;
		subjectType?: ReviewSubjectType;
		settlementType?: ReviewSettlementType;
		contractOutcome?: ReviewContractOutcome;
		initialTitle?: string;
		initialComment?: string;
		initialRating?: number;
		showRating?: boolean;
		onSubmit?: (draft: ReviewDraftPayload) => Promise<void> | void;
		onCancel?: () => void;
	}>();

	let title = $state(initialTitle);
	let comment = $state(initialComment);
	let rating = $state(initialRating);
	let sourceLanguage = $state<ReviewLocale>('en');
	let attachments = $state<ReviewAttachment[]>([]);
	let isSubmitting = $state(false);
	let isTranslating = $state(false);
	let errorMessage = $state('');
	let pendingFiles = $state<File[]>([]);

	const storageKey = $derived(`bittasker.${draftKey}.${mode}`);

	function tr(key: string, fallback: string): string {
		const translated = $t(key);
		return translated === key ? fallback : translated;
	}

	function persistDraft() {
		if (typeof window === 'undefined') return;
		try {
			window.localStorage.setItem(
				storageKey,
				JSON.stringify({
					title,
					comment,
					rating,
					sourceLanguage,
					attachments
				})
			);
		} catch {
			// Ignore persistence failures; draft recovery is best-effort.
		}
	}

	function restoreDraft() {
		if (typeof window === 'undefined') return;
		try {
			const raw = window.localStorage.getItem(storageKey);
			if (!raw) return;
			const parsed = JSON.parse(raw) as Partial<ReviewComposerDraft> & {
				sourceLanguage?: ReviewLocale;
				attachments?: ReviewAttachment[];
			};
			title = parsed.title ?? title;
			comment = parsed.comment ?? comment;
			rating = parsed.rating ?? rating;
			sourceLanguage = parsed.sourceLanguage ?? sourceLanguage;
			attachments = parsed.attachments ?? attachments;
		} catch {
			// Ignore corrupt draft state.
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

	onMount(() => {
		restoreDraft();
	});

	$effect(() => {
		persistDraft();
	});

	async function handleUpload(results: UploadResult[]) {
		const newAttachments = results.map((result) => ({
			url: result.url,
			type: result.type === 'video' ? 'video' : 'image',
			alt: result.type === 'video' ? 'Review attachment video' : 'Review attachment image',
			size: result.size,
			key: result.key,
			cloudflareId: result.cloudflareId,
			variants: result.variants,
			mimeType: result.type
		})) as ReviewAttachment[];

		attachments = [...attachments, ...newAttachments];
		pendingFiles = [];
	}

	function handleAttachmentRemove(index: number) {
		const attachment = attachments[index];
		if (!attachment) return;
		uploadService
			.deleteFile(attachment.key ?? attachment.cloudflareId ?? attachment.url)
			.catch(() => undefined);
		attachments = attachments.filter((_, currentIndex) => currentIndex !== index);
	}

	function getFormLabel() {
		return mode === 'reply'
			? tr('reviews.reply.composer_title', 'Write a reply')
			: tr('reviews.form.title', 'Write a review');
	}

	async function handleSubmit() {
		if (isSubmitting) return;
		if (!reviewerPubkey || !revieweePubkey) {
			errorMessage = tr(
				'reviews.form.errors.missing_parties',
				'Missing reviewer or reviewee pubkey'
			);
			return;
		}

		isSubmitting = true;
		errorMessage = '';

		try {
			isTranslating = true;
			const translated = await translateReviewDraft({
				sourceLanguage,
				title,
				comment
			});
			isTranslating = false;

			const bilingualContent: ReviewBilingualContent = {
				sourceLanguage: translated.sourceLanguage,
				en: translated.en,
				es: translated.es
			};

			const draft: ReviewDraftPayload = {
				reviewDraftHash: buildReviewDraftHash({
					mode,
					subjectType,
					settlementType,
					reviewerPubkey,
					revieweePubkey,
					reviewerRole,
					revieweeRole,
					contractOutcome,
					rating,
					content: bilingualContent,
					attachments
				}),
				subjectType,
				settlementType,
				reviewerPubkey,
				revieweePubkey,
				reviewerRole,
				revieweeRole,
				contractOutcome,
				createdAt: Math.floor(Date.now() / 1000),
				rating,
				content: bilingualContent,
				attachments
			};

			await onSubmit(draft);
			clearDraft();
		} catch (error) {
			errorMessage =
				error instanceof Error
					? error.message
					: tr('reviews.form.errors.prepare_failed', 'Unable to prepare review');
		} finally {
			isSubmitting = false;
			isTranslating = false;
		}
	}
</script>

<div class="card bg-base-100 border-base-300 border shadow-sm">
	<div class="card-body gap-4 p-5">
		<div class="space-y-1">
			<h3 class="text-lg font-semibold">{getFormLabel()}</h3>
			<p class="text-base-content/60 text-sm">
				{mode === 'reply'
					? tr(
							'reviews.reply.subtitle',
							'Replies use the same bilingual publish flow and optional media attachments.'
						)
					: tr('reviews.form.subtitle', 'Reviews are public and immutable once submitted.')}
			</p>
		</div>

		<div class="grid gap-3 sm:grid-cols-2">
			<label class="form-control">
				<div class="label">
					<span class="label-text">{tr('reviews.form.source_language', 'Source language')}</span>
				</div>
				<select bind:value={sourceLanguage} class="select select-bordered w-full">
					<option value="en">{tr('reviews.form.language_english', 'English')}</option>
					<option value="es">{tr('reviews.form.language_spanish', 'Spanish')}</option>
				</select>
			</label>

			{#if showRating}
				<label class="form-control">
					<div class="label">
						<span class="label-text">{tr('reviews.form.overall_rating', 'Overall rating')}</span>
					</div>
					<input
						bind:value={rating}
						min="1"
						max="5"
						type="number"
						class="input input-bordered w-full"
					/>
				</label>
			{:else}
				<div class="alert alert-info self-end">
					<span>{tr('reviews.reply.rating_not_required', 'Replies do not require a rating.')}</span>
				</div>
			{/if}
		</div>

		<label class="form-control">
			<div class="label">
				<span class="label-text">{tr('reviews.form.title_label', 'Title')}</span>
			</div>
			<input
				bind:value={title}
				type="text"
				class="input input-bordered w-full"
				placeholder={tr('reviews.form.title_placeholder', 'Optional summary')}
			/>
		</label>

		<label class="form-control">
			<div class="label">
				<span class="label-text">{tr('reviews.form.comment_label', 'Comment')}</span>
			</div>
			<textarea
				bind:value={comment}
				class="textarea textarea-bordered min-h-32 w-full"
				placeholder={tr('reviews.form.comment_placeholder', 'Share what happened')}
			/>
		</label>

		<div class="space-y-2">
			<div class="text-sm font-medium">
				{mode === 'reply'
					? tr('reviews.reply.attachments_label', 'Reply attachments')
					: tr('reviews.form.attachments_label', 'Review attachments')}
			</div>
			<MediaUploader
				id={`${draftKey}-${mode}`}
				label={mode === 'reply'
					? tr('reviews.reply.upload_label', 'Add images or video')
					: tr('reviews.form.upload_label', 'Add images or video')}
				maxFiles={5}
				maxFileSize={10}
				allowedTypes={['image/*', 'video/*']}
				maxDuration={300}
				uploadFolder={mode === 'reply' ? 'review-replies' : 'reviews'}
				enableImageCompression={true}
				useCloudflare={true}
				generateVariants={true}
				files={pendingFiles}
				uploadedAttachments={attachments}
				onChange={handleUpload}
				onRemove={handleAttachmentRemove}
				className="w-full min-h-32 rounded-xl border-2 border-dashed border-base-300"
			/>
		</div>

		{#if errorMessage}
			<div class="alert alert-error">
				<span>{errorMessage}</span>
			</div>
		{/if}

		<div class="flex flex-wrap items-center justify-end gap-2">
			<button type="button" class="btn btn-ghost" onclick={onCancel}>
				{tr('common.cancel', 'Cancel')}
			</button>
			<button type="button" class="btn btn-primary" onclick={handleSubmit} disabled={isSubmitting}>
				{#if isSubmitting || isTranslating}
					<span class="loading loading-spinner loading-sm"></span>
					{mode === 'reply'
						? tr('reviews.reply.submitting', 'Submitting reply...')
						: tr('reviews.form.submitting', 'Submitting review...')}
				{:else}
					{mode === 'reply'
						? tr('reviews.reply.submit', 'Submit reply')
						: tr('reviews.form.submit', 'Submit review')}
				{/if}
			</button>
		</div>
	</div>
</div>

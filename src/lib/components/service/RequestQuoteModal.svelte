<script lang="ts">
	import type { Service } from '$lib/types/service.d';
	import type { QuoteRequestPayload } from '$lib/types/service.d';
	import type { Attachment } from '$lib/types/task.d';
	import type { UploadResult } from '$lib/api/services/upload.service';
	import Modal from '$lib/components/Modal.svelte';
	import MediaUploader from '$lib/components/MediaUploader.svelte';
	import SchemaDrivenFieldRenderer from '$lib/components/forms/SchemaDrivenFieldRenderer.svelte';
	import {
		collectMissingRequiredInquiryFieldIds,
		hasRequiredTrimmedText
	} from '$lib/components/forms/FormValidationCore';
	import { getServiceDisplayTitle } from '$lib/utils/serviceDisplayTranslation';
	import { t, locale } from 'svelte-i18n';

	let {
		open = $bindable(false),
		service,
		onConfirm,
		onClose,
		contextSummary = []
	}: {
		open?: boolean;
		service: Service | null;
		onConfirm: (
			payload: QuoteRequestPayload
		) => Promise<{ success: boolean; error?: string } | void> | { success: boolean; error?: string } | void;
		onClose: () => void;
		contextSummary?: string[];
	} = $props();

	const currentLocale = $derived($locale || 'en');
	const serviceTitle = $derived(service ? getServiceDisplayTitle(service, currentLocale) : '');
	const modalTitle = $derived($t('dashboard.services.detail.request_quote_modal.title') + (serviceTitle ? ` – ${serviceTitle}` : ''));

	let title = $state('');
	let description = $state('');
	let customFormValues = $state<Record<string, string | number | boolean | string[] | undefined>>({});
	let uploadResults = $state<UploadResult[]>([]);
	let errors = $state<Record<string, string>>({});
	let isSubmitting = $state(false);
	let submitError = $state<string | null>(null);

	// Clear submit error when user modifies form
	$effect(() => {
		if (submitError && (title || description || Object.keys(customFormValues).length > 0)) {
			submitError = null;
		}
	});

	const inquiryFields = $derived(service?.pricing?.inquiryForm?.fields ?? []);

	function closeModal() {
		open = false;
		title = '';
		description = '';
		customFormValues = {};
		uploadResults = [];
		errors = {};
		submitError = null;
		onClose();
	}

	function validate(): boolean {
		const e: Record<string, string> = {};
		if (!hasRequiredTrimmedText(title)) {
			e.title = $t('dashboard.services.detail.request_quote_modal.title_required');
		}
		if (!hasRequiredTrimmedText(description)) {
			e.description = $t('dashboard.services.detail.request_quote_modal.description_required');
		}
		for (const fieldId of collectMissingRequiredInquiryFieldIds(inquiryFields, customFormValues)) {
			e[`field_${fieldId}`] = $t('dashboard.services.detail.request_quote_modal.field_required');
		}
		errors = e;
		return Object.keys(e).length === 0;
	}

	async function handleConfirm() {
		if (!validate() || !service) return;
		isSubmitting = true;
		submitError = null;
		const attachments: Attachment[] = uploadResults.map((r, i) => ({
			url: r.url,
			key: r.key,
			type: r.type === 'image' ? 'image/*' : r.type === 'video' ? 'video/*' : 'document',
			alt: `Attachment ${i + 1}`,
			size: r.size
		}));
		const payload: QuoteRequestPayload = {
			title: title.trim(),
			description: description.trim(),
			attachments: attachments.length > 0 ? attachments : undefined
		};
		if (inquiryFields.length > 0) {
			payload.customFormResponses = Object.fromEntries(
				Object.entries(customFormValues).filter(([, v]) => v !== undefined)
			) as QuoteRequestPayload['customFormResponses'];
		}
		try {
			const result = await onConfirm(payload);
			if (result && typeof result === 'object' && result.success === false) {
				submitError = result.error || ($t('error.general') as string);
				return;
			}
			closeModal();
		} catch (error) {
			submitError =
				error instanceof Error ? error.message : (($t('error.general') as string) || 'Failed to submit quote request.');
		} finally {
			isSubmitting = false;
		}
	}

	function handleFileChange(results: UploadResult[]) {
		uploadResults = results;
	}
</script>

<Modal
	isOpen={open}
	title={modalTitle}
	onClose={closeModal}
	size="lg"
	isScrollable={true}
	respectBottomNav={true}
>
	{#snippet children()}
		<form
			class="flex flex-col gap-4"
			onsubmit={(e) => {
				e.preventDefault();
				handleConfirm();
			}}
		>
			<!-- Title (required) -->
			<div class="form-control">
				<label for="quote-title" class="label">
					<span class="label-text">{$t('dashboard.services.detail.request_quote_modal.title_label')}</span>
				</label>
				<input
					id="quote-title"
					type="text"
					class="input input-bordered w-full"
					class:input-error={errors.title}
					placeholder={$t('dashboard.services.detail.request_quote_modal.title_placeholder')}
					bind:value={title}
					maxlength="200"
				/>
				{#if errors.title}
					<span class="label-text-alt text-error">{errors.title}</span>
				{/if}
			</div>

			<!-- Description (required) -->
			<div class="form-control">
				<label for="quote-description" class="label">
					<span class="label-text">{$t('dashboard.services.detail.request_quote_modal.description_label')}</span>
				</label>
				<textarea
					id="quote-description"
					class="textarea textarea-bordered w-full min-h-24"
					class:textarea-error={errors.description}
					placeholder={$t('dashboard.services.detail.request_quote_modal.description_placeholder')}
					bind:value={description}
					rows="4"
				></textarea>
				{#if errors.description}
					<span class="label-text-alt text-error">{errors.description}</span>
				{/if}
			</div>

			<!-- Custom form (if service has inquiry fields) -->
			{#if inquiryFields.length > 0}
				<div class="space-y-4">
					<h4 class="font-semibold">{$t('dashboard.services.detail.request_quote_modal.custom_form_section')}</h4>
						{#each inquiryFields as field}
							{@const inputId = `quote-field-${field.id}`}
							{@const value = customFormValues[field.id]}
							{@const err = errors[`field_${field.id}`]}
							<SchemaDrivenFieldRenderer
								{field}
								{inputId}
								{value}
								error={err}
								onValueChange={(nextValue) => {
									customFormValues = { ...customFormValues, [field.id]: nextValue };
								}}
							/>
						{/each}
					</div>
				{/if}

			{#if contextSummary.length > 0}
				<div class="rounded-xl border border-base-300 bg-base-200/60 p-4">
					<p class="mb-2 text-sm font-semibold">
						{$t('dashboard.services.detail.interested')}
					</p>
					<ul class="list-disc space-y-1 pl-5 text-sm text-base-content/70">
						{#each contextSummary as item}
							<li>{item}</li>
						{/each}
					</ul>
				</div>
			{/if}

			<!-- Images (optional) -->
			<div class="form-control" role="group" aria-labelledby="quote-images-label">
				<div class="label" id="quote-images-label">
					<span class="label-text">{$t('dashboard.services.detail.request_quote_modal.images_label')}</span>
					<span class="label-text-alt">{$t('dashboard.services.detail.request_quote_modal.optional')}</span>
				</div>
				<MediaUploader
					id="quote-images"
					maxFiles={6}
					allowedTypes={['image/*']}
					files={uploadResults.map((r) => r.url)}
					onChange={handleFileChange}
					onRemove={(index) => {
						uploadResults = uploadResults.filter((_, i) => i !== index);
					}}
					uploadFolder="quote-requests"
					enableImageCompression={true}
					maxFileSize={2}
				/>
			</div>

			{#if submitError}
				<div class="alert alert-error alert-soft text-sm" data-testid="request-quote-submit-error">
					<span>{submitError}</span>
				</div>
			{/if}
		</form>
	{/snippet}
	{#snippet footer()}
		<button type="button" class="btn btn-ghost" onclick={closeModal}>
			{$t('common.buttons.cancel')}
		</button>
		<button
			type="button"
			class="btn btn-primary"
			disabled={isSubmitting}
			onclick={handleConfirm}
		>
			{#if isSubmitting}
				<span class="loading loading-spinner loading-sm"></span>
			{/if}
			{$t('dashboard.services.detail.request_quote_modal.submit')}
		</button>
	{/snippet}
</Modal>

<script lang="ts">
	import type { Service } from '$lib/types/service.d';
	import type { QuoteRequestPayload } from '$lib/types/service.d';
	import type { Attachment } from '$lib/types/task.d';
	import type { UploadResult } from '$lib/api/services/upload.service';
	import Drawer from '$lib/components/Drawer.svelte';
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
		) =>
			| Promise<{ success: boolean; error?: string } | void>
			| { success: boolean; error?: string }
			| void;
		onClose: () => void;
		contextSummary?: string[];
	} = $props();

	const currentLocale = $derived($locale || 'en');
	const serviceTitle = $derived(service ? getServiceDisplayTitle(service, currentLocale) : '');
	const modalTitle = $derived($t('dashboard.services.detail.request_quote_modal.title'));

	let title = $state('');
	let description = $state('');
	let customFormValues = $state<Record<string, string | number | boolean | string[] | undefined>>(
		{}
	);
	let uploadResults = $state<UploadResult[]>([]);
	let errors = $state<Record<string, string>>({});
	let isSubmitting = $state(false);
	let submitError = $state<string | null>(null);
	let previousInputSignature = '';

	// Clear submit error when user modifies form
	$effect(() => {
		const nextInputSignature = JSON.stringify({
			title,
			description,
			customFormValues
		});

		if (
			submitError &&
			previousInputSignature !== '' &&
			previousInputSignature !== nextInputSignature
		) {
			submitError = null;
		}

		previousInputSignature = nextInputSignature;
	});

	const inquiryFields = $derived(service?.pricing?.inquiryForm?.fields ?? []);

	function tr(key: string, fallback: string): string {
		try {
			const value = $t(key);
			return typeof value === 'string' && value !== key ? value : fallback;
		} catch {
			return fallback;
		}
	}

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
			alt: tr(
				'dashboard.services.detail.request_quote_modal.attachment_alt',
				`Attachment ${i + 1}`
			).replace('{index}', String(i + 1)),
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
				error instanceof Error
					? error.message
					: tr(
							'dashboard.services.detail.request_quote_modal.submit_failed',
							'Failed to submit quote request.'
						);
		} finally {
			isSubmitting = false;
		}
	}

	function handleFileChange(results: UploadResult[]) {
		uploadResults = results;
	}
</script>

<Drawer
	isOpen={open}
	title={modalTitle}
	onClose={closeModal}
	position="right"
	isScrollable={true}
	respectBottomNav={true}
	{isSubmitting}
>
	{#if serviceTitle}
		<span class="text-md mb-4 block font-bold">{serviceTitle}</span>
	{/if}
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
				<span class="label-text"
					>{$t('dashboard.services.detail.request_quote_modal.title_label')}</span
				>
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
				<span class="label-text"
					>{$t('dashboard.services.detail.request_quote_modal.description_label')}</span
				>
			</label>
			<textarea
				id="quote-description"
				class="textarea textarea-bordered min-h-24 w-full"
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
				{#each inquiryFields as field (field.id)}
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
			<div class="border-base-300 bg-base-200/60 rounded-xl border p-4">
				<p class="mb-2 text-sm font-semibold">
					{$t('dashboard.services.detail.interested')}
				</p>
				<ul class="text-base-content/70 list-disc space-y-1 pl-5 text-sm">
					{#each contextSummary as item (`${item}`)}
						<li>{item}</li>
					{/each}
				</ul>
			</div>
		{/if}

		<!-- Images (optional) -->
		<div class="form-control" role="group" aria-labelledby="quote-images-label">
			<div class="label" id="quote-images-label">
				<span class="label-text"
					>{$t('dashboard.services.detail.request_quote_modal.images_label')}</span
				>
				<span class="label-text-alt"
					>{$t('dashboard.services.detail.request_quote_modal.optional')}</span
				>
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
	{#snippet footer()}
		<div class="flex justify-end gap-2">
			<button type="button" class="btn btn-ghost" onclick={closeModal}>
				{$t('common.buttons.cancel')}
			</button>
			<button type="button" class="btn btn-primary" disabled={isSubmitting} onclick={handleConfirm}>
				{#if isSubmitting}
					<span class="loading loading-spinner loading-sm"></span>
				{/if}
				{$t('dashboard.services.detail.request_quote_modal.submit')}
			</button>
		</div>
	{/snippet}
</Drawer>

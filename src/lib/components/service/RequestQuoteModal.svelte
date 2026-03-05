<script lang="ts">
	import type { Service } from '$lib/types/service.d';
	import type { QuoteRequestPayload } from '$lib/types/service.d';
	import type { Attachment } from '$lib/types/task.d';
	import type { UploadResult } from '$lib/api/services/upload.service';
	import Modal from '$lib/components/Modal.svelte';
	import MediaUploader from '$lib/components/MediaUploader.svelte';
	import { getServiceDisplayTitle } from '$lib/utils/serviceDisplayTranslation';
	import { t, locale } from 'svelte-i18n';

	let {
		open = $bindable(false),
		service,
		onConfirm,
		onClose
	}: {
		open?: boolean;
		service: Service | null;
		onConfirm: (payload: QuoteRequestPayload) => void;
		onClose: () => void;
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

	const inquiryFields = $derived(service?.pricing?.inquiryForm?.fields ?? []);

	function closeModal() {
		open = false;
		title = '';
		description = '';
		customFormValues = {};
		uploadResults = [];
		errors = {};
		onClose();
	}

	function validate(): boolean {
		const e: Record<string, string> = {};
		if (!title.trim()) e.title = $t('dashboard.services.detail.request_quote_modal.title_required');
		if (!description.trim()) e.description = $t('dashboard.services.detail.request_quote_modal.description_required');
		for (const field of inquiryFields) {
			if (field.required) {
				const v = customFormValues[field.id];
				if (v === undefined || v === '' || (Array.isArray(v) && v.length === 0)) {
					e[`field_${field.id}`] = $t('dashboard.services.detail.request_quote_modal.field_required');
				}
			}
		}
		errors = e;
		return Object.keys(e).length === 0;
	}

	function handleConfirm() {
		if (!validate() || !service) return;
		isSubmitting = true;
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
		onConfirm(payload);
		closeModal();
		isSubmitting = false;
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
						<div class="form-control">
							<label for={inputId} class="label">
								<span class="label-text">{field.label}{#if field.required} <span class="text-error">*</span>{/if}</span>
							</label>
							{#if field.type === 'text'}
								<input
									id={inputId}
									type="text"
									class="input input-bordered w-full"
									class:input-error={err}
									placeholder={field.placeholder}
									value={typeof value === 'string' ? value : ''}
									oninput={(e) => {
										customFormValues = { ...customFormValues, [field.id]: (e.target as HTMLInputElement).value };
									}}
								/>
							{:else if field.type === 'textarea'}
								<textarea
									id={inputId}
									class="textarea textarea-bordered w-full"
									class:textarea-error={err}
									placeholder={field.placeholder}
									value={typeof value === 'string' ? value : ''}
									oninput={(e) => {
										customFormValues = { ...customFormValues, [field.id]: (e.target as HTMLTextAreaElement).value };
									}}
								></textarea>
							{:else if field.type === 'number'}
								<input
									id={inputId}
									type="number"
									class="input input-bordered w-full"
									class:input-error={err}
									placeholder={field.placeholder}
									value={value === undefined || value === null ? '' : Number(value)}
									min={field.validation?.min}
									max={field.validation?.max}
									oninput={(e) => {
										const v = (e.target as HTMLInputElement).value;
										customFormValues = { ...customFormValues, [field.id]: v === '' ? undefined : Number(v) };
									}}
								/>
							{:else if field.type === 'select' && field.options?.length}
								<select
									id={inputId}
									class="select select-bordered w-full"
									class:select-error={err}
									value={typeof value === 'string' ? value : ''}
									onchange={(e) => {
										customFormValues = { ...customFormValues, [field.id]: (e.target as HTMLSelectElement).value };
									}}
								>
									<option value="">{$t('dashboard.services.detail.request_quote_modal.choose')}</option>
									{#each field.options as opt}
										<option value={opt}>{opt}</option>
									{/each}
								</select>
							{:else if field.type === 'checkbox' && field.options?.length}
								<div class="flex flex-wrap gap-3">
									{#each field.options as opt}
										<label class="flex cursor-pointer items-center gap-2">
											<input
												type="checkbox"
												class="checkbox checkbox-sm"
												checked={Array.isArray(value) ? value.includes(opt) : false}
												onchange={(e) => {
													const arr = Array.isArray(value) ? [...value] : [];
													if ((e.target as HTMLInputElement).checked) arr.push(opt);
													else arr.splice(arr.indexOf(opt), 1);
													customFormValues = { ...customFormValues, [field.id]: arr };
												}}
											/>
											<span class="label-text">{opt}</span>
										</label>
									{/each}
								</div>
							{:else if field.type === 'checkbox'}
								<label class="flex cursor-pointer items-center gap-2">
									<input
										type="checkbox"
										class="checkbox checkbox-sm"
										checked={value === true}
										onchange={(e) => {
											customFormValues = { ...customFormValues, [field.id]: (e.target as HTMLInputElement).checked };
										}}
									/>
									<span class="label-text-alt">{field.placeholder || field.label}</span>
								</label>
							{:else if field.type === 'date'}
								<input
									id={inputId}
									type="date"
									class="input input-bordered w-full"
									class:input-error={err}
									value={typeof value === 'string' ? value : ''}
									oninput={(e) => {
										customFormValues = { ...customFormValues, [field.id]: (e.target as HTMLInputElement).value };
									}}
								/>
							{:else if field.type === 'time'}
								<input
									id={inputId}
									type="time"
									class="input input-bordered w-full"
									class:input-error={err}
									value={typeof value === 'string' ? value : ''}
									oninput={(e) => {
										customFormValues = { ...customFormValues, [field.id]: (e.target as HTMLInputElement).value };
									}}
								/>
							{:else}
								<input
									id={inputId}
									type="text"
									class="input input-bordered w-full"
									class:input-error={err}
									placeholder={field.placeholder}
									value={typeof value === 'string' ? value : ''}
									oninput={(e) => {
										customFormValues = { ...customFormValues, [field.id]: (e.target as HTMLInputElement).value };
									}}
								/>
							{/if}
							{#if err}
								<span class="label-text-alt text-error">{err}</span>
							{/if}
						</div>
					{/each}
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

<script lang="ts">
	import { onMount } from 'svelte';
	import { linear } from 'svelte/easing';
	import { fly } from 'svelte/transition';
	import { serviceStore as store } from '$lib/stores/service.store';
	import type { InquiryFormField, InquiryForm } from '$lib/types/service.d';
	import { t } from 'svelte-i18n';

	let { errors, direction } = $props();

	// Initialize inquiry form if not set (run once on mount)
	onMount(() => {
		if (!$store.service.pricing?.inquiryForm) {
			store.updateService({
				pricing: {
					...$store.service.pricing!,
					inquiryForm: {
						fields: []
					}
				}
			});
		}
	});

	// Add new field
	function addField() {
		const currentForm = $store.service.pricing?.inquiryForm || { fields: [] };
		const newField: InquiryFormField = {
			id: crypto.randomUUID(),
			type: 'text',
			label: '',
			placeholder: '',
			required: false,
			options: undefined,
			validation: undefined
		};
		store.updateService({
			pricing: {
				...$store.service.pricing!,
				inquiryForm: {
					fields: [...currentForm.fields, newField]
				}
			}
		});
	}

	// Remove field
	function removeField(fieldId: string) {
		const currentForm = $store.service.pricing?.inquiryForm || { fields: [] };
		store.updateService({
			pricing: {
				...$store.service.pricing!,
				inquiryForm: {
					fields: currentForm.fields.filter((f) => f.id !== fieldId)
				}
			}
		});
	}

	// Update field
	function updateField(fieldId: string, updates: Partial<InquiryFormField>) {
		const currentForm = $store.service.pricing?.inquiryForm || { fields: [] };
		store.updateService({
			pricing: {
				...$store.service.pricing!,
				inquiryForm: {
					fields: currentForm.fields.map((field) => (field.id === fieldId ? { ...field, ...updates } : field))
				}
			}
		});
	}

	// Add option to select/checkbox field
	function addOption(fieldId: string) {
		const field = $store.service.pricing?.inquiryForm?.fields.find((f) => f.id === fieldId);
		if (field && (field.type === 'select' || field.type === 'checkbox')) {
			updateField(fieldId, {
				options: [...(field.options || []), '']
			});
		}
	}

	// Update option
	function updateOption(fieldId: string, optionIndex: number, value: string) {
		const field = $store.service.pricing?.inquiryForm?.fields.find((f) => f.id === fieldId);
		if (field && field.options) {
			const newOptions = [...field.options];
			newOptions[optionIndex] = value;
			updateField(fieldId, { options: newOptions });
		}
	}

	// Remove option
	function removeOption(fieldId: string, optionIndex: number) {
		const field = $store.service.pricing?.inquiryForm?.fields.find((f) => f.id === fieldId);
		if (field && field.options) {
			const newOptions = field.options.filter((_, i) => i !== optionIndex);
			updateField(fieldId, { options: newOptions.length > 0 ? newOptions : undefined });
		}
	}

	// Handle field type change
	function handleFieldTypeChange(fieldId: string, newType: InquiryFormField['type']) {
		const field = $store.service.pricing?.inquiryForm?.fields.find((f) => f.id === fieldId);
		if (field) {
			const updates: Partial<InquiryFormField> = { type: newType };
			// Clear options if not select/checkbox
			if (newType !== 'select' && newType !== 'checkbox') {
				updates.options = undefined;
			}
			// Initialize options if select/checkbox
			if ((newType === 'select' || newType === 'checkbox') && !field.options) {
				updates.options = [''];
			}
			updateField(fieldId, updates);
		}
	}
</script>

<div
	class="space-y-6"
	in:fly={{
		duration: 200,
		easing: linear,
		y: 0,
		x: direction === 'forward' ? 20 : -20
	}}
>
	<div class="w-full">
		<label class="label" for="inquiry-form-title" id="inquiry-form-title">
			<span class="label-text-alt">{$t('dashboard.services.create.inquiry_form.hint')}</span>
		</label>
	</div>

	{#if ($store.service.pricing?.inquiryForm?.fields || []).length === 0}
		<div class="alert alert-outline alert-info">
			<span>{$t('dashboard.services.create.inquiry_form.empty_message')}</span>
		</div>
	{/if}

	{#each ($store.service.pricing?.inquiryForm?.fields || []) as field}
		<div class="card bg-base-200 p-4 space-y-4">
			<div class="flex items-center justify-between">
				<h4 class="font-semibold">
					{$t('dashboard.services.create.inquiry_form.field')} #{($store.service.pricing?.inquiryForm?.fields || []).indexOf(field) + 1}
				</h4>
				<button
					class="btn btn-sm btn-error"
					onclick={() => removeField(field.id)}
					title={$t('dashboard.services.create.inquiry_form.remove')}
				>
					✕
				</button>
			</div>

			<!-- Field Type -->
			<div class="w-full">
				<label for="field-type-{field.id}" class="label">
					<span class="label-text">{$t('dashboard.services.create.inquiry_form.type_label')}</span>
				</label>
				<select
					id="field-type-{field.id}"
					class="select select-bordered w-full"
					value={field.type}
					onchange={(e) => handleFieldTypeChange(field.id, (e.target as HTMLSelectElement).value as InquiryFormField['type'])}
				>
					<option value="text">{$t('dashboard.services.create.inquiry_form.type_text')}</option>
					<!-- textarea and file not offered: description/images are in the quote request modal -->
					<option value="number">{$t('dashboard.services.create.inquiry_form.type_number')}</option>
					<option value="select">{$t('dashboard.services.create.inquiry_form.type_select')}</option>
					<option value="checkbox">{$t('dashboard.services.create.inquiry_form.type_checkbox')}</option>
					<option value="date">{$t('dashboard.services.create.inquiry_form.type_date')}</option>
					<option value="time">{$t('dashboard.services.create.inquiry_form.type_time')}</option>
				</select>
			</div>

			<!-- Field Label -->
			<div class="w-full">
				<label for="field-label-{field.id}" class="label">
					<span class="label-text">{$t('dashboard.services.create.inquiry_form.label_label')}</span>
				</label>
				<input
					type="text"
					id="field-label-{field.id}"
					value={field.label}
					onchange={(e) => updateField(field.id, { label: (e.target as HTMLInputElement).value })}
					class="input input-bordered w-full"
					placeholder={$t('dashboard.services.create.inquiry_form.label_placeholder')}
				/>
			</div>

			<!-- Field Placeholder (for text, number) -->
			{#if field.type === 'text' || field.type === 'number'}
				<div class="w-full">
					<label for="field-placeholder-{field.id}" class="label">
						<span class="label-text">{$t('dashboard.services.create.inquiry_form.placeholder_label')}</span>
					</label>
					<input
						type="text"
						id="field-placeholder-{field.id}"
						value={field.placeholder || ''}
						onchange={(e) => updateField(field.id, { placeholder: (e.target as HTMLInputElement).value })}
						class="input input-bordered w-full"
						placeholder={$t('dashboard.services.create.inquiry_form.placeholder_placeholder')}
					/>
				</div>
			{/if}

			<!-- Options (for select/checkbox) -->
			{#if field.type === 'select' || field.type === 'checkbox'}
				<div class="w-full">
					<label class="label" for="field-options-{field.id}">
						<span class="label-text">{$t('dashboard.services.create.inquiry_form.options_label')}</span>
					</label>
					<div class="space-y-2">
						{#each (field.options || []) as option, optionIndex}
							<div class="flex gap-2">
								<input
									type="text"
									value={option}
									onchange={(e) => updateOption(field.id, optionIndex, (e.target as HTMLInputElement).value)}
									class="input input-bordered flex-1"
									placeholder={$t('dashboard.services.create.inquiry_form.option_placeholder')}
								/>
								<button
									class="btn btn-sm btn-error"
									onclick={() => removeOption(field.id, optionIndex)}
									title={$t('dashboard.services.create.inquiry_form.remove_option')}
								>
									✕
								</button>
							</div>
						{/each}
						<button
							class="btn btn-sm btn-outline w-full"
							onclick={() => addOption(field.id)}
						>
							+ {$t('dashboard.services.create.inquiry_form.add_option')}
						</button>
					</div>
				</div>
			{/if}

			<!-- Validation (for number) -->
			{#if field.type === 'number'}
				<div class="w-full">
					<label class="label" for="field-validation-{field.id}">
						<span class="label-text">{$t('dashboard.services.create.inquiry_form.validation_label')}</span>
					</label>
					<div class="grid grid-cols-2 gap-2">
						<div>
							<label for="validation-min-{field.id}" class="label">
								<span class="label-text-alt">{$t('dashboard.services.create.inquiry_form.validation_min')}</span>
							</label>
							<input
								type="number"
								id="validation-min-{field.id}"
								value={field.validation?.min || ''}
								onchange={(e) => {
									const min = (e.target as HTMLInputElement).value
										? Number((e.target as HTMLInputElement).value)
										: undefined;
									updateField(field.id, {
										validation: {
											...field.validation,
											min
										}
									});
								}}
								class="input input-bordered w-full"
							/>
						</div>
						<div>
							<label for="validation-max-{field.id}" class="label">
								<span class="label-text-alt">{$t('dashboard.services.create.inquiry_form.validation_max')}</span>
							</label>
							<input
								type="number"
								id="validation-max-{field.id}"
								value={field.validation?.max || ''}
								onchange={(e) => {
									const max = (e.target as HTMLInputElement).value
										? Number((e.target as HTMLInputElement).value)
										: undefined;
									updateField(field.id, {
										validation: {
											...field.validation,
											max
										}
									});
								}}
								class="input input-bordered w-full"
							/>
						</div>
					</div>
				</div>
			{/if}

			<!-- Required Toggle -->
			<div class="w-full">
				<label class="label cursor-pointer">
					<span class="label-text">{$t('dashboard.services.create.inquiry_form.required_label')}</span>
					<input
						type="checkbox"
						class="checkbox checkbox-primary"
						checked={field.required}
						onchange={(e) => updateField(field.id, { required: (e.target as HTMLInputElement).checked })}
					/>
				</label>
			</div>
		</div>
	{/each}

	<!-- Add Field Button -->
	<button class="btn btn-outline w-full" onclick={addField}>
		+ {$t('dashboard.services.create.inquiry_form.add_field')}
	</button>

	{#if errors.inquiryForm}
		<span class="label-text-alt text-error block">{errors.inquiryForm}</span>
	{/if}
</div>


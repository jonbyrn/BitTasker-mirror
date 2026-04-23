<script lang="ts">
	import { t } from 'svelte-i18n';
	import type { InquiryFormField } from '$lib/types/service.d';

	let {
		field,
		inputId,
		value = undefined,
		error = null,
		onValueChange
	}: {
		field: InquiryFormField;
		inputId: string;
		value?: string | number | boolean | string[] | undefined;
		error?: string | null;
		onValueChange: (value: string | number | boolean | string[] | undefined) => void;
	} = $props();
</script>

<div class="form-control" data-testid={`schema-field-${field.id}`}>
	<label for={inputId} class="label">
		<span class="label-text"
			>{field.label}{#if field.required} <span class="text-error">*</span>{/if}</span
		>
	</label>
	{#if field.type === 'text'}
		<input
			id={inputId}
			type="text"
			class="input input-bordered w-full"
			class:input-error={Boolean(error)}
			placeholder={field.placeholder}
			value={typeof value === 'string' ? value : ''}
			oninput={(e) => {
				onValueChange((e.target as HTMLInputElement).value);
			}}
		/>
	{:else if field.type === 'textarea'}
		<textarea
			id={inputId}
			class="textarea textarea-bordered w-full"
			class:textarea-error={Boolean(error)}
			placeholder={field.placeholder}
			value={typeof value === 'string' ? value : ''}
			oninput={(e) => {
				onValueChange((e.target as HTMLTextAreaElement).value);
			}}
		></textarea>
	{:else if field.type === 'number'}
		<input
			id={inputId}
			type="number"
			class="input input-bordered w-full"
			class:input-error={Boolean(error)}
			placeholder={field.placeholder}
			value={value === undefined || value === null ? '' : Number(value)}
			min={field.validation?.min}
			max={field.validation?.max}
			oninput={(e) => {
				const nextValue = (e.target as HTMLInputElement).value;
				onValueChange(nextValue === '' ? undefined : Number(nextValue));
			}}
		/>
	{:else if field.type === 'select' && field.options?.length}
		<select
			id={inputId}
			class="select select-bordered w-full"
			class:select-error={Boolean(error)}
			value={typeof value === 'string' ? value : ''}
			onchange={(e) => {
				onValueChange((e.target as HTMLSelectElement).value);
			}}
		>
			<option value="">{$t('dashboard.services.detail.request_quote_modal.choose')}</option>
			{#each field.options as option}
				<option value={option}>{option}</option>
			{/each}
		</select>
	{:else if field.type === 'checkbox' && field.options?.length}
		<div class="flex flex-wrap gap-3">
			{#each field.options as option}
				<label class="flex cursor-pointer items-center gap-2">
					<input
						type="checkbox"
						class="checkbox checkbox-sm"
						checked={Array.isArray(value) ? value.includes(option) : false}
						onchange={(e) => {
							const nextValue = Array.isArray(value) ? [...value] : [];
							if ((e.target as HTMLInputElement).checked) {
								nextValue.push(option);
							} else {
								nextValue.splice(nextValue.indexOf(option), 1);
							}
							onValueChange(nextValue);
						}}
					/>
					<span class="label-text">{option}</span>
				</label>
			{/each}
		</div>
	{:else if field.type === 'checkbox'}
		<label class="flex cursor-pointer items-center gap-2">
			<input
				id={inputId}
				type="checkbox"
				class="checkbox checkbox-sm"
				checked={value === true}
				onchange={(e) => {
					onValueChange((e.target as HTMLInputElement).checked);
				}}
			/>
			<span class="label-text-alt">{field.placeholder || field.label}</span>
		</label>
	{:else if field.type === 'date'}
		<input
			id={inputId}
			type="date"
			class="input input-bordered w-full"
			class:input-error={Boolean(error)}
			value={typeof value === 'string' ? value : ''}
			oninput={(e) => {
				onValueChange((e.target as HTMLInputElement).value);
			}}
		/>
	{:else if field.type === 'time'}
		<input
			id={inputId}
			type="time"
			class="input input-bordered w-full"
			class:input-error={Boolean(error)}
			value={typeof value === 'string' ? value : ''}
			oninput={(e) => {
				onValueChange((e.target as HTMLInputElement).value);
			}}
		/>
	{:else}
		<input
			id={inputId}
			type="text"
			class="input input-bordered w-full"
			class:input-error={Boolean(error)}
			placeholder={field.placeholder}
			value={typeof value === 'string' ? value : ''}
			oninput={(e) => {
				onValueChange((e.target as HTMLInputElement).value);
			}}
		/>
	{/if}
	{#if error}
		<span class="label-text-alt text-error">{error}</span>
	{/if}
</div>

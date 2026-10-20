<script lang="ts">
	let {
		id,
		label,
		value = $bindable(''),
		error = '',
		hint = '',
		multiline = false,
		type = 'text',
		placeholder = '',
		required = false,
		testId = ''
	}: {
		id: string;
		label: string;
		value?: string;
		error?: string;
		hint?: string;
		multiline?: boolean;
		type?: string;
		placeholder?: string;
		required?: boolean;
		testId?: string;
	} = $props();

	const describedBy = $derived(error ? `${id}-error` : hint ? `${id}-hint` : undefined);
</script>

<label class="form-control w-full gap-1" for={id}>
	<span class="label-text" id="{id}-label">{label}</span>
	{#if multiline}
		<textarea
			{id}
			class="textarea textarea-bordered w-full"
			bind:value
			{placeholder}
			{required}
			data-testid={testId || undefined}
			aria-invalid={Boolean(error)}
			aria-describedby={describedBy}
		></textarea>
	{:else}
		<input
			{id}
			{type}
			class="input input-bordered w-full"
			bind:value
			{placeholder}
			{required}
			data-testid={testId || undefined}
			aria-invalid={Boolean(error)}
			aria-describedby={describedBy}
		/>
	{/if}
	{#if hint && !error}
		<span id="{id}-hint" class="text-base-content/80 text-sm">{hint}</span>
	{/if}
	{#if error}
		<span id="{id}-error" class="text-error text-sm" role="alert">{error}</span>
	{/if}
</label>

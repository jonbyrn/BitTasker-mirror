<script lang="ts">
	const {
		disabled = false,
		loading = false,
		compact = false,
		label = 'Mark Complete',
		onclick
	} = $props<{
		disabled?: boolean;
		loading?: boolean;
		compact?: boolean;
		label?: string;
		onclick?: () => void;
	}>();
</script>

<button
	class={`btn btn-primary btn-sm ${compact ? 'w-fit' : 'w-full sm:w-fit'}`}
	{disabled}
	onclick={onclick}
>
	{#if loading}
		<span class="loading loading-spinner loading-xs"></span>
	{/if}
	{label}
</button>

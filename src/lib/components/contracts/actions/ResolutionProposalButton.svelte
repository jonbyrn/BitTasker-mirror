<script lang="ts">
	const {
		disabled = false,
		loading = false,
		compact = false,
		label = 'Propose Resolution',
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
	class={`btn btn-warning btn-sm ${compact ? 'w-fit' : 'w-full sm:w-fit'}`}
	{disabled}
	onclick={onclick}
>
	{#if loading}
		<span class="loading loading-spinner loading-xs"></span>
	{/if}
	{label}
</button>

<script lang="ts">
	import { t } from 'svelte-i18n';

	const {
		disabled = false,
		loading = false,
		compact = false,
		label = '',
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
	{onclick}
>
	{#if loading}
		<span class="loading loading-spinner loading-xs"></span>
	{/if}
	{label || ($t('dashboard.contracts.actions.complete_task') as string) || 'Mark Complete'}
</button>

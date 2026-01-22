<script lang="ts">
	import type { Task } from '$lib/types/task';
	import { t } from 'svelte-i18n';
	import { handleTaskShare } from '$lib/composables/useTaskShare';

	let { task, variant = 'default', class: className = '' } = $props<{
		task: Task | null;
		variant?: 'default' | 'circle' | 'icon-only';
		class?: string;
	}>();

	let shareSuccess = $state(false);

	const handleClick = async (e: MouseEvent) => {
		await handleTaskShare(task, (success) => {
			shareSuccess = success;
		}, e);
	};

	// Determine button classes based on variant
	const buttonClasses = $derived(() => {
		const baseClasses = 'btn transition-all duration-200';
		const successClass = shareSuccess ? 'btn-success' : '';
		
		if (variant === 'circle') {
			return `${baseClasses} btn-ghost btn-sm btn-circle shrink-0 ${successClass} ${className}`;
		} else if (variant === 'icon-only') {
			return `${baseClasses} btn-ghost btn-sm ${successClass} ${className}`;
		} else {
			// default variant - button with text
			return `${baseClasses} btn-primary btn-sm min-h-[40px] flex-1 sm:flex-none gap-2 ${successClass} ${className}`;
		}
	});
</script>

<button
	class={buttonClasses()}
	onclick={handleClick}
	title={$t('dashboard.task_details_by_task.share_task')}
	aria-label={$t('dashboard.task_details_by_task.share_task')}
>
	{#if shareSuccess}
		<svg
			xmlns="http://www.w3.org/2000/svg"
			class="h-5 w-5 {variant === 'default' ? '' : variant === 'circle' ? '' : 'mr-1 h-4 w-4 shrink-0'}"
			fill="none"
			viewBox="0 0 24 24"
			stroke="currentColor"
			stroke-width="2"
		>
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
			/>
		</svg>
	{:else}
		<svg
			xmlns="http://www.w3.org/2000/svg"
			class="h-5 w-5 {variant === 'default' ? '' : variant === 'circle' ? '' : 'mr-1 h-4 w-4 shrink-0'}"
			fill="none"
			viewBox="0 0 24 24"
			stroke="currentColor"
			stroke-width={variant === 'default' ? '2' : '2'}
		>
			{#if variant === 'circle' || variant === 'icon-only'}
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.935-2.186 2.25 2.25 0 00-3.935 2.186z"
				/>
			{:else}
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z"
				/>
			{/if}
		</svg>
	{/if}
	{#if variant === 'default'}
		<span>{$t('dashboard.task_details_by_task.share')}</span>
	{/if}
</button>


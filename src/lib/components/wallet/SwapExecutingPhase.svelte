<script lang="ts">
	import { t } from 'svelte-i18n';
	import { fly } from 'svelte/transition';

	const ARROW_SVG_PATH = 'M5 13l4 4L19 7'; // checkmark

	interface SwapProgressStepDef {
		key: string;
		labelKey: string;
	}

	let { progressMessage, progressSteps, currentStepIdx, onCancel } = $props<{
		progressMessage: string;
		progressSteps: readonly SwapProgressStepDef[];
		currentStepIdx: number;
		onCancel?: () => void;
	}>();
</script>

<div
	transition:fly={{ y: 10, duration: 200 }}
	class="flex flex-col items-center gap-4 py-6"
	aria-live="polite"
>
	<span class="loading loading-spinner loading-lg text-primary"></span>
	<p class="text-sm font-medium sm:text-base">
		{progressMessage || $t('wallet.swap.swap_executing')}
	</p>

	<!-- Step Tracker -->
	<div class="flex w-full max-w-xs flex-col gap-2 text-xs">
		{#each progressSteps as step, i (step.key)}
			{@const isDone = i < currentStepIdx}
			{@const isCurrent = i === currentStepIdx}
			<div
				class="flex items-center gap-2 {isDone
					? 'text-success'
					: isCurrent
						? 'text-primary'
						: 'text-base-content/40'}"
			>
				{#if isDone}
					<svg class="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d={ARROW_SVG_PATH}
						/>
					</svg>
				{:else if isCurrent}
					<span class="loading loading-spinner loading-xs text-primary shrink-0"></span>
				{:else}
					<span class="h-4 w-4 shrink-0 rounded-full border border-current opacity-40"></span>
				{/if}
				<span class={isDone ? 'line-through opacity-60' : ''}>{$t(step.labelKey)}</span>
			</div>
		{/each}
	</div>

	<p class="text-base-content/50 pt-2 text-xs italic">
		{$t('wallet.swap.navigate_away_note')}
	</p>

	{#if onCancel}
		<button class="btn btn-ghost btn-sm mt-2 min-h-[36px]" onclick={onCancel}>
			{$t('common.cancel') || 'Cancel'}
		</button>
	{/if}
</div>

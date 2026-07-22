<script lang="ts">
	import { scale } from 'svelte/transition';

	export type StepStatus = 'completed' | 'active' | 'pending';

	interface Props {
		label: string;
		sub: string;
		status: StepStatus;
		liveMessage?: string;
		isLast?: boolean;
	}

	let { label, sub, status, liveMessage, isLast = false }: Props = $props();

	const CHECKMARK_PATH =
		'M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z';
</script>

<li class="flex gap-3" data-step-status={status}>
	<!-- Icon column with connecting line -->
	<div class="flex flex-col items-center">
		<div
			class="step-icon flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2"
			class:border-primary={status === 'completed' || status === 'active'}
			class:bg-primary={status === 'completed'}
			class:animate-pulse={status === 'active'}
			style={status === 'pending' ? 'border-color: oklch(var(--bc) / 0.2)' : ''}
		>
			{#if status === 'completed'}
				<div transition:scale={{ duration: 250, start: 0.5 }}>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-4 w-4 text-white"
						viewBox="0 0 20 20"
						fill="currentColor"
					>
						<path fill-rule="evenodd" d={CHECKMARK_PATH} clip-rule="evenodd" />
					</svg>
				</div>
			{:else if status === 'active'}
				<span class="loading loading-xs loading-spinner text-primary"></span>
			{:else}
				<span class="h-2 w-2 rounded-full" style="background-color: oklch(var(--bc) / 0.3)"></span>
			{/if}
		</div>
		{#if !isLast}
			<div
				class="step-connector my-1 w-0.5 flex-1"
				class:bg-primary={status === 'completed'}
				style="min-height: 1.25rem;{status !== 'completed' ? ' background-color: oklch(var(--bc) / 0.2)' : ''}"
			></div>
		{/if}
	</div>

	<!-- Text column -->
	<div class="flex flex-col pb-3" style={status === 'pending' ? 'opacity: 0.4' : ''}>
		<span
			class="text-sm font-semibold"
			class:text-primary={status === 'completed' || status === 'active'}
			class:text-base-content={status === 'pending'}
		>
			{label}
		</span>
		<span class="text-base-content/60 text-xs">
			{#if status === 'active' && liveMessage}
				{liveMessage}
			{:else}
				{sub}
			{/if}
		</span>
	</div>
</li>

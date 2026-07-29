<script lang="ts">
	import { onMount } from 'svelte';
	import { animate, stagger } from 'motion';
	import StepItem, { type StepStatus } from './StepItem.svelte';
	import type { SwapProgressStep } from '$lib/services/swap-chain/state';

	export interface TimelineStepDef {
		key: string;
		label: string;
		sub: string;
		progressSteps: SwapProgressStep[];
	}

	interface Props {
		steps: readonly TimelineStepDef[];
		currentProgressStep: SwapProgressStep;
		completedStepKeys: ReadonlySet<string>;
		liveMessage?: string;
	}

	let { steps, currentProgressStep, completedStepKeys, liveMessage }: Props = $props();

	let listEl = $state<HTMLOListElement | null>(null);

	function getStepStatus(
		step: TimelineStepDef,
		current: SwapProgressStep,
		completed: ReadonlySet<string>
	): StepStatus {
		if (completed.has(step.key)) return 'completed';
		if (step.progressSteps.includes(current)) return 'active';
		return 'pending';
	}

	onMount(() => {
		if (!listEl) return;
		const items = listEl.querySelectorAll('li');
		if (items.length === 0) return;

		const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		if (reducedMotion) return;

		animate(
			items,
			{ opacity: [0, 1], x: [-8, 0] },
			{
				duration: 0.25,
				delay: stagger(0.06, { startDelay: 0.05 }),
				easing: [0, 0, 0, 1]
			} as Parameters<typeof animate>[2]
		);
	});
</script>

<ol bind:this={listEl} class="flex flex-col gap-1" data-testid="swap-timeline">
	{#each steps as step, i (step.key)}
		<StepItem
			label={step.label}
			sub={step.sub}
			status={getStepStatus(step, currentProgressStep, completedStepKeys)}
			liveMessage={step.progressSteps.includes(currentProgressStep) ? liveMessage : undefined}
			isLast={i === steps.length - 1}
		/>
	{/each}
</ol>

<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { fly } from 'svelte/transition';
	import { t } from 'svelte-i18n';
	import type { Route } from '$lib/services/route-resolver';
	import type { SwapProgressStep } from '$lib/services/swap-chain/state';
	import StepTimeline, { type TimelineStepDef } from './StepTimeline.svelte';

	interface Props {
		route: Route | null;
		progressStep: SwapProgressStep;
		progressMessage: string;
	}

	let { route, progressStep, progressMessage }: Props = $props();

	// ── Elapsed timer (manual setInterval, no $effect) ────────────────
	let elapsedSeconds = $state(0);
	let elapsedInterval: ReturnType<typeof setInterval> | null = null;

	onMount(() => {
		elapsedInterval = setInterval(() => {
			elapsedSeconds++;
		}, 1000);
	});

	onDestroy(() => {
		if (elapsedInterval) {
			clearInterval(elapsedInterval);
			elapsedInterval = null;
		}
	});

	let elapsedDisplay = $derived.by(() => {
		const m = Math.floor(elapsedSeconds / 60);
		const s = elapsedSeconds % 60;
		return m > 0 ? `${m}m ${s}s` : `${s}s`;
	});

	// ── Completed step tracking ───────────────────────────────────────
	let completedStepKeys = $state(new Set<string>());
	let lastSeenStep: SwapProgressStep = 'locking-rbtc';

	// Track step transitions: when progressStep changes, mark previous as completed.
	// $effect here is safe — it only writes to completedStepKeys (no derived depends on it
	// in a way that would re-trigger), and the guard `progressStep !== lastSeenStep`
	// prevents infinite loops.
	$effect(() => {
		const current = progressStep;
		if (current !== lastSeenStep) {
			// Mark all steps before the current one as completed
			const stepOrder: SwapProgressStep[] = [
				'locking-rbtc',
				'locking-tbtc',
				'waiting-for-boltz',
				'claiming-tbtc',
				'claiming-rbtc',
				'swapping-tbtc',
				'complete',
				'failed'
			];
			const currentIdx = stepOrder.indexOf(current);
			for (const s of stepOrder) {
				if (stepOrder.indexOf(s) < currentIdx) {
					completedStepKeys.add(s);
				}
			}
			completedStepKeys = completedStepKeys;
			lastSeenStep = current;
		}
	});

	// ── Step definitions (derived from route) ─────────────────────────
	function buildSteps(r: Route | null): TimelineStepDef[] {
		if (!r) return [];

		const hasBoltz = r.hops.some((h) => h.service === 'boltz');
		const hasDex = r.hops.some((h) =>
			['lifi', 'symbiosis', 'uniswap-v3', 'changelly'].includes(h.service)
		);

		if (hasBoltz && hasDex) {
			const isFromTbtc = r.hops[0]?.fromAsset?.toUpperCase() === 'TBTC';
			return [
				{
					key: 'lock',
					label: isFromTbtc
						? $t('wallet.swap.step.lock_tbtc')
						: $t('wallet.swap.step.lock_rbtc'),
					sub: isFromTbtc
						? $t('wallet.swap.step.lock_tbtc_sub')
						: $t('wallet.swap.step.lock_rbtc_sub'),
					progressSteps: ['locking-rbtc', 'locking-tbtc'] as SwapProgressStep[]
				},
				{
					key: 'boltz',
					label: $t('wallet.swap.step.boltz_confirm'),
					sub: $t('wallet.swap.step.boltz_confirm_sub'),
					progressSteps: ['waiting-for-boltz'] as SwapProgressStep[]
				},
				{
					key: 'claim',
					label: isFromTbtc
						? $t('wallet.swap.step.claim_rbtc')
						: $t('wallet.swap.step.claim_tbtc'),
					sub: isFromTbtc
						? $t('wallet.swap.step.claim_rbtc_sub')
						: $t('wallet.swap.step.claim_tbtc_sub'),
					progressSteps: ['claiming-rbtc', 'claiming-tbtc'] as SwapProgressStep[]
				},
				{
					key: 'dex',
					label: $t('wallet.swap.step.dex_swap'),
					sub: $t('wallet.swap.step.dex_swap_sub'),
					progressSteps: ['swapping-tbtc'] as SwapProgressStep[]
				}
			];
		}

		if (hasBoltz) {
			const isFromTbtc = r.hops[0]?.fromAsset?.toUpperCase() === 'TBTC';
			return [
				{
					key: 'lock',
					label: isFromTbtc
						? $t('wallet.swap.step.lock_tbtc')
						: $t('wallet.swap.step.lock_rbtc'),
					sub: isFromTbtc
						? $t('wallet.swap.step.lock_tbtc_sub')
						: $t('wallet.swap.step.lock_rbtc_sub'),
					progressSteps: ['locking-rbtc', 'locking-tbtc'] as SwapProgressStep[]
				},
				{
					key: 'boltz',
					label: $t('wallet.swap.step.boltz_confirm'),
					sub: $t('wallet.swap.step.boltz_confirm_sub'),
					progressSteps: ['waiting-for-boltz'] as SwapProgressStep[]
				},
				{
					key: 'claim',
					label: isFromTbtc
						? $t('wallet.swap.step.claim_rbtc')
						: $t('wallet.swap.step.claim_tbtc'),
					sub: isFromTbtc
						? $t('wallet.swap.step.claim_rbtc_sub')
						: $t('wallet.swap.step.claim_tbtc_sub'),
					progressSteps: ['claiming-rbtc', 'claiming-tbtc'] as SwapProgressStep[]
				}
			];
		}

		return [
			{
				key: 'execute',
				label: $t('wallet.swap.step.execute'),
				sub: $t('wallet.swap.step.execute_sub'),
				progressSteps: ['locking-rbtc'] as SwapProgressStep[]
			},
			{
				key: 'confirm',
				label: $t('wallet.swap.step.confirm'),
				sub: $t('wallet.swap.step.confirm_sub'),
				progressSteps: ['waiting-for-boltz', 'swapping-tbtc'] as SwapProgressStep[]
			}
		];
	}

	let steps = $derived(buildSteps(route));
</script>

<div
	transition:fly={{ y: 10, duration: 200 }}
	class="flex flex-col gap-4 py-6"
	data-testid="swap-progress-view"
	aria-live="polite"
	role="status"
>
	<!-- Timeline -->
	<StepTimeline
		{steps}
		currentProgressStep={progressStep}
		{completedStepKeys}
		liveMessage={progressMessage}
	/>

	<!-- Elapsed time + reassurance -->
	<div class="border-base-content/10 mt-1 flex flex-col items-center gap-1 border-t pt-4 text-center">
		<p class="text-base-content/80 text-sm font-medium" data-testid="swap-elapsed">
			⏱ {elapsedDisplay} {$t('wallet.swap.progress.elapsed')}
		</p>
		<p class="text-base-content/50 text-xs">
			{$t('wallet.swap.progress.do_not_close')}
		</p>
	</div>
</div>

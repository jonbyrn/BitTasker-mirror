<script lang="ts">
	import { t } from 'svelte-i18n';

	interface Props {
		deployedUsd: number;
		availableUsd: number;
	}

	let { deployedUsd, availableUsd }: Props = $props();

	let totalUsd = $derived(deployedUsd + availableUsd);

	let deployedPct = $derived(
		totalUsd > 0 && isFinite(deployedUsd) ? Math.min((deployedUsd / totalUsd) * 100, 100) : 0
	);

	let availablePct = $derived(
		totalUsd > 0 && isFinite(availableUsd) ? Math.min((availableUsd / totalUsd) * 100, 100) : 0
	);

	function formatUsd(val: number): string {
		if (!isFinite(val) || val < 0) return '$0.00';
		return `$${val.toFixed(2)}`;
	}
</script>

<div
	class="flex flex-col gap-1.5"
	role="meter"
	aria-valuenow={deployedUsd}
	aria-valuemin={0}
	aria-valuemax={totalUsd}
	aria-label="{$t('wallet.defi.earn.overview_deployed')}: {formatUsd(deployedUsd)}, {$t(
		'wallet.defi.position.available'
	)}: {formatUsd(availableUsd)}"
>
	<!-- Labels row above bar -->
	<div class="relative h-4 text-xs">
		<span class="text-base-content/50 absolute top-0 left-0">
			{$t('wallet.defi.earn.overview_deployed')}
		</span>
		<span class="text-base-content/50 absolute top-0 right-0">
			{$t('wallet.defi.position.available')}
		</span>
	</div>

	<!-- Bar -->
	<div class="bg-base-200 relative h-3 w-full overflow-hidden rounded-full">
		{#if deployedPct > 0}
			<div
				class="bg-success absolute top-0 left-0 h-full rounded-l-full transition-all duration-500 ease-out"
				style="width: {deployedPct}%"
			></div>
		{/if}
		{#if availablePct > 0 && deployedPct < 100}
			<div
				class="bg-base-content/20 absolute top-0 h-full transition-all duration-500 ease-out {deployedPct <=
				0
					? 'rounded-l-full'
					: ''} rounded-r-full"
				style="left: {deployedPct}%; width: {availablePct}%"
			></div>
		{/if}
	</div>

	<!-- Amounts row below bar -->
	<div class="relative h-4 text-xs">
		<span class="absolute top-0 left-0 font-medium tabular-nums">{formatUsd(deployedUsd)}</span>
		<span class="absolute top-0 right-0 font-medium tabular-nums">{formatUsd(availableUsd)}</span>
	</div>
</div>

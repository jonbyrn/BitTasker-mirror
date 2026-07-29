<script lang="ts">
	import { t } from 'svelte-i18n';

	interface Props {
		tickLower: number;
		tickUpper: number;
		currentTick: number;
		currentPrice: number | null;
	}

	let { tickLower, tickUpper, currentTick, currentPrice }: Props = $props();

	/** Convert Uniswap V3 tick to human-readable price (token1 per token0).
	 *  WBTC (8 dec) / USDT0 (6 dec) → multiply by 10^(8-6) = 100. */
	function tickToPrice(tick: number): number {
		if (!isFinite(tick)) return 0;
		return Math.exp(tick * Math.log(1.0001)) * 100;
	}

	let lowerPrice = $derived(tickToPrice(tickLower));
	let upperPrice = $derived(tickToPrice(tickUpper));

	let inRange = $derived(
		isFinite(currentTick) &&
			isFinite(tickLower) &&
			isFinite(tickUpper) &&
			currentTick >= tickLower &&
			currentTick <= tickUpper
	);

	/** Extended bar bounds (±20% beyond range for context). */
	let barLow = $derived(lowerPrice - (upperPrice - lowerPrice) * 0.2);
	let barHigh = $derived(upperPrice + (upperPrice - lowerPrice) * 0.2);
	let barRange = $derived(barHigh - barLow);

	let rangeLeftPct = $derived(barRange > 0 ? ((lowerPrice - barLow) / barRange) * 100 : 0);
	let rangeWidthPct = $derived(barRange > 0 ? ((upperPrice - lowerPrice) / barRange) * 100 : 100);
	let markerPct = $derived(
		barRange > 0 ? (((currentPrice ?? tickToPrice(currentTick)) - barLow) / barRange) * 100 : 50
	);

	function formatPrice(val: number): string {
		if (!isFinite(val) || val <= 0) return '$0';
		if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
		if (val >= 1_000) return `$${(val / 1_000).toFixed(0)}k`;
		return `$${val.toFixed(2)}`;
	}

	let displayPrice = $derived(currentPrice ?? tickToPrice(currentTick));
</script>

<div class="flex flex-col gap-2">
	<!-- Title -->
	<div class="flex items-center justify-between">
		<span class="text-base-content/50 text-[10px] tracking-wider uppercase">
			{$t('wallet.defi.earn.range_title')}
		</span>
		<span class="badge badge-sm {inRange ? 'badge-success' : 'badge-error'} font-medium">
			{inRange ? $t('wallet.defi.earn.range_in') : $t('wallet.defi.earn.range_out')}
		</span>
	</div>

	<!-- Range labels -->
	<div class="flex items-center justify-between text-xs font-medium tabular-nums">
		<span>{formatPrice(lowerPrice)}</span>
		<span class="text-base-content/40">—</span>
		<span>{formatPrice(upperPrice)}</span>
	</div>

	<!-- Range bar -->
	<div
		class="bg-base-200 relative h-4 w-full overflow-hidden rounded-full"
		role="img"
		aria-label="{$t('wallet.defi.earn.range_title')}: {formatPrice(lowerPrice)} – {formatPrice(
			upperPrice
		)}"
	>
		<!-- Range highlight -->
		<div
			class="absolute top-0 h-full rounded-sm {inRange ? 'bg-success/30' : 'bg-error/20'}"
			style="left: {rangeLeftPct}%; width: {rangeWidthPct}%"
		></div>

		<!-- Range boundaries -->
		<div class="bg-base-content/30 absolute top-0 h-full w-0.5" style="left: {rangeLeftPct}%"></div>
		<div
			class="bg-base-content/30 absolute top-0 h-full w-0.5"
			style="left: {rangeLeftPct + rangeWidthPct}%"
		></div>

		<!-- Current price marker -->
		<div
			class="absolute top-0 h-full w-2 -translate-x-1/2 rounded-full {inRange
				? 'bg-success'
				: 'bg-error'}"
			style="left: {markerPct}%"
		></div>
	</div>

	<!-- Extended scale labels -->
	<div class="flex items-center justify-between text-[10px] tabular-nums">
		<span class="text-base-content/30">{formatPrice(barLow)}</span>
		<span class="text-base-content/60 font-medium">
			{$t('wallet.defi.earn.range_you_are_here', {
				values: { price: formatPrice(displayPrice) }
			})}
		</span>
		<span class="text-base-content/30">{formatPrice(barHigh)}</span>
	</div>

	<!-- Status message -->
	<p class="text-xs {inRange ? 'text-success' : 'text-error'}">
		{#if inRange}
			● {$t('wallet.defi.earn.range_earning')}
		{:else}
			● {$t('wallet.defi.earn.range_not_earning')}
			<span class="text-base-content/50 block text-[11px]">
				{$t('wallet.defi.earn.range_guidance_out')}
			</span>
		{/if}
	</p>
</div>

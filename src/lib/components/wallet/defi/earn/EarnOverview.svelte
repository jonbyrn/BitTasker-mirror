<script lang="ts">
	import { t } from 'svelte-i18n';
	import { walletStore } from '$lib/stores/wallet.store';
	import { connectedWalletsStore } from '$lib/stores/connected-wallets.store';
	import { defiPositions } from '$lib/stores/defi-positions.store.svelte';
	import { btcPrice } from '$lib/runes/btcPrice.svelte';
	import { supplyApy } from '$lib/runes/supplyApy.svelte';
	import * as _Sentry from '@sentry/sveltekit';
	import IconHelpCircle from '~icons/mdi/help-circle';
	import EarnDeployBar from './EarnDeployBar.svelte';
	import LoanHelpModal from '../LoanHelpModal.svelte';

	interface Props {
		mode: 'lending' | 'lp';
	}

	let { mode }: Props = $props();

	let helpOpen = $state(false);

	// --- Lending aggregation ---
	let aavePositions = $derived(Array.from(defiPositions.aavePositions.values()));

	let totalSupplied = $derived(
		aavePositions.reduce((sum, p) => sum + (parseFloat(p.suppliedUsdt0) || 0), 0)
	);

	let totalEarnedLending = $derived(
		aavePositions.reduce((sum, p) => sum + (isFinite(p.accruedUsd) ? p.accruedUsd : 0), 0)
	);

	let availableUsdt0 = $derived.by(() => {
		const builtinBalance = parseFloat($walletStore.arb?.formattedUsdt0Balance ?? '0') || 0;
		let connectedTotal = 0;
		for (const w of $connectedWalletsStore.wallets) {
			if (!w.balances) continue;
			const usdt0 = w.balances['usdt0-arb'];
			if (usdt0?.formatted) connectedTotal += parseFloat(usdt0.formatted) || 0;
		}
		return builtinBalance + connectedTotal;
	});

	let earliestLendingDate = $derived.by(() => {
		if (aavePositions.length === 0) return null;
		const dates = aavePositions.map((p) => new Date(p.lastUpdated).getTime());
		return new Date(Math.min(...dates));
	});

	let lendingDays = $derived.by(() => {
		if (!earliestLendingDate) return 0;
		return Math.max(0, Math.floor((Date.now() - earliestLendingDate.getTime()) / 86_400_000));
	});

	// --- LP aggregation ---
	let lpPositions = $derived(Array.from(defiPositions.uniswapPositions.values()));

	let totalLpValueUsd = $derived.by(() => {
		if (lpPositions.length === 0 || btcPrice.price <= 0) return 0;
		return lpPositions.reduce((sum, p) => {
			const liqNum = Number(p.liquidity);
			if (!isFinite(liqNum) || liqNum <= 0) return sum;
			// Rough estimate: liquidity is proportional to position value
			// For WBTC/USDT0, approximate using fee-based heuristic
			return sum + (liqNum / 1e8) * btcPrice.price * 0.01;
		}, 0);
	});

	// Idle balance (WBTC + USDT0 not in LP)
	let idleLpBalance = $derived.by(() => {
		const builtinWbtc = $walletStore.arb?.wbtcUsdValue ?? 0;
		const builtinUsdt0 = parseFloat($walletStore.arb?.formattedUsdt0Balance ?? '0') || 0;
		let connectedWbtc = 0;
		let connectedUsdt0 = 0;
		for (const w of $connectedWalletsStore.wallets) {
			if (!w.balances) continue;
			const wbtc = w.balances['wbtc-arb'];
			if (wbtc?.formatted) connectedWbtc += (parseFloat(wbtc.formatted) || 0) * btcPrice.price;
			const usdt0 = w.balances['usdt0-arb'];
			if (usdt0?.formatted) connectedUsdt0 += parseFloat(usdt0.formatted) || 0;
		}
		return builtinWbtc + builtinUsdt0 + connectedWbtc + connectedUsdt0;
	});

	let totalFeesUsd = $derived.by(() => {
		if (lpPositions.length === 0) return 0;
		return lpPositions.reduce((sum, p) => {
			const fee0Usd = (Number(p.fees0) / 1e8) * btcPrice.price;
			const fee1Usd = Number(p.fees1) / 1e6;
			return sum + (isFinite(fee0Usd) ? fee0Usd : 0) + (isFinite(fee1Usd) ? fee1Usd : 0);
		}, 0);
	});

	let avgIL = $derived.by(() => {
		if (lpPositions.length === 0) return 0;
		const total = lpPositions.reduce(
			(sum, p) => sum + (isFinite(p.ilEstimatePercent) ? p.ilEstimatePercent : 0),
			0
		);
		return total / lpPositions.length;
	});

	let earliestLpDate = $derived.by(() => {
		if (lpPositions.length === 0) return null;
		const dates = lpPositions.map((p) => new Date(p.lastUpdated).getTime());
		return new Date(Math.min(...dates));
	});

	let lpDays = $derived.by(() => {
		if (!earliestLpDate) return 0;
		return Math.max(0, Math.floor((Date.now() - earliestLpDate.getTime()) / 86_400_000));
	});

	// --- LP hold vs earned (aggregated) ---
	let lpHoldValueUsd = $derived.by(() => {
		// Simplified: use total position value as hold baseline
		// In production this would track entry amounts
		return totalLpValueUsd;
	});

	let lpDiff = $derived(totalFeesUsd);
	let lpDiffPct = $derived(
		lpHoldValueUsd > 0 && isFinite(lpDiff) ? (lpDiff / lpHoldValueUsd) * 100 : 0
	);
	let lpWinning = $derived(lpDiff >= 0);

	// --- LP APY estimate from actual fees ---
	let lpApyEstimate = $derived.by(() => {
		if (totalLpValueUsd <= 0 || totalFeesUsd <= 0 || lpDays < 1) return null;
		// Annualize: (fees / principal) * (365 / days) * 100
		const annualized = (totalFeesUsd / totalLpValueUsd) * (365 / lpDays) * 100;
		return isFinite(annualized) && annualized > 0 ? annualized : null;
	});

	// --- Format helpers ---
	function formatUsd(val: number): string {
		if (!isFinite(val) || val < 0) return '$0.00';
		return `$${val.toFixed(2)}`;
	}

	function formatDate(d: Date | null): string {
		if (!d) return '';
		return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
	}

	let titleKey = $derived(
		mode === 'lending'
			? 'wallet.defi.earn.overview_title_lending'
			: 'wallet.defi.earn.overview_title_lp'
	);

	let _hasPositions = $derived(
		mode === 'lending' ? aavePositions.length > 0 : lpPositions.length > 0
	);
</script>

<div class="border-primary bg-base-100 rounded-lg border p-4">
	<!-- Header -->
	<div class="mb-2 flex items-center justify-between">
		<div class="flex items-center gap-1.5">
			<span class="text-sm font-semibold">{$t(titleKey)}</span>
			<button
				type="button"
				class="text-base-content/40 hover:text-base-content/70 transition-colors"
				onclick={() => (helpOpen = true)}
				aria-label={$t('wallet.defi.position.overview_title')}
			>
				<IconHelpCircle class="h-5 w-5" />
			</button>
		</div>
		{#if mode === 'lending'}
			<span class="badge badge-success badge-sm px-2 py-1 text-xs font-medium">
				{supplyApy.apy !== null ? `${supplyApy.apy.toFixed(2)}%` : '…'}
			</span>
		{:else}
			<span class="badge badge-info badge-sm px-2 py-1 text-xs font-medium">
				{$t('wallet.defi.lp.fee_tier_005')}
			</span>
		{/if}
	</div>

	<!-- Deploy bar -->
	<div class="mb-3">
		{#if mode === 'lending'}
			<EarnDeployBar deployedUsd={totalSupplied} availableUsd={availableUsdt0} />
		{:else}
			<EarnDeployBar deployedUsd={totalLpValueUsd} availableUsd={idleLpBalance} />
		{/if}
	</div>

	<!-- Metric chips -->
	{#if mode === 'lending'}
		<div class="mb-3 grid grid-cols-3 gap-2">
			<div class="bg-base-200 flex flex-col items-center rounded-lg px-2 py-1.5">
				<span class="text-base-content/50 text-[10px] tracking-wide uppercase"
					>{$t('wallet.defi.earn.overview_supplied')}</span
				>
				<span class="text-sm font-bold tabular-nums">{formatUsd(totalSupplied)}</span>
			</div>
			<div class="bg-base-200 flex flex-col items-center rounded-lg px-2 py-1.5">
				<span class="text-base-content/50 text-[10px] tracking-wide uppercase"
					>{$t('wallet.defi.earn.overview_earned')}</span
				>
				<span class="text-sm font-bold tabular-nums">{formatUsd(totalEarnedLending)}</span>
			</div>
			<div class="bg-base-200 flex flex-col items-center rounded-lg px-2 py-1.5">
				<span class="text-base-content/50 text-[10px] tracking-wide uppercase">APY</span>
				<span class="text-sm font-bold tabular-nums">
					{#if supplyApy.apy !== null}
						{supplyApy.apy.toFixed(2)}%
					{:else}
						…
					{/if}
				</span>
			</div>
		</div>

		<!-- Auto-compounding callout -->
		<div class="bg-base-200 mb-2 rounded-lg p-2.5">
			<p class="text-xs font-medium">{$t('wallet.defi.earn.auto_compound')}</p>
			<p class="text-base-content/60 text-[11px]">
				{$t('wallet.defi.earn.auto_compound_desc', {
					values: { amount: formatUsd(totalSupplied) }
				})}
			</p>
		</div>
	{:else}
		<div class="mb-3 grid grid-cols-4 gap-2">
			<div class="bg-base-200 flex flex-col items-center rounded-lg px-2 py-1.5">
				<span class="text-base-content/50 text-[10px] tracking-wide uppercase">LP</span>
				<span class="text-sm font-bold tabular-nums">{formatUsd(totalLpValueUsd)}</span>
			</div>
			<div class="bg-base-200 flex flex-col items-center rounded-lg px-2 py-1.5">
				<span class="text-base-content/50 text-[10px] tracking-wide uppercase"
					>{$t('wallet.defi.earn.overview_earned')}</span
				>
				<span class="text-sm font-bold tabular-nums">{formatUsd(totalFeesUsd)}</span>
			</div>
			<div class="bg-base-200 flex flex-col items-center rounded-lg px-2 py-1.5">
				<span class="text-base-content/50 text-[10px] tracking-wide uppercase">IL</span>
				<span class="text-sm font-bold tabular-nums">{avgIL.toFixed(2)}%</span>
			</div>
			<div class="bg-base-200 flex flex-col items-center rounded-lg px-2 py-1.5">
				<span class="text-base-content/50 text-[10px] tracking-wide uppercase">APY</span>
				<span class="text-sm font-bold tabular-nums">
					{#if lpApyEstimate !== null}
						~{lpApyEstimate.toFixed(1)}%
					{:else}
						—
					{/if}
				</span>
				<span class="text-base-content/40 text-[9px]">
					{#if lpApyEstimate !== null}
						{$t('wallet.defi.earn.metric_est')}
					{:else}
						{$t('wallet.defi.earn.lp_apy_needs_data')}
					{/if}
				</span>
			</div>
		</div>

		<!-- Held vs Earned summary -->
		{#if lpPositions.length > 0}
			<div class="mb-2">
				<div
					class="flex items-center justify-between rounded-lg px-2 py-1.5 text-xs {lpWinning
						? 'text-success'
						: 'text-error'}"
				>
					<span class="font-medium">{$t('wallet.defi.earn.held_vs_earned')}</span>
					<span class="font-bold tabular-nums">
						{lpWinning ? '+' : ''}{formatUsd(lpDiff)}
						({lpDiffPct >= 0 ? '+' : ''}{lpDiffPct.toFixed(1)}%)
						{#if lpWinning}
							<span class="text-success" aria-label={$t('wallet.defi.earn.positive_indicator')}
								>✓</span
							>
						{:else}
							<span class="text-error" aria-label={$t('wallet.defi.earn.negative_indicator')}
								>✗</span
							>
						{/if}
					</span>
				</div>
			</div>
		{/if}
	{/if}

	<!-- Time indicator -->
	{#if mode === 'lending' && earliestLendingDate}
		<p class="text-base-content/50 text-[11px]">
			{$t('wallet.defi.earn.overview_since_days', {
				values: {
					date: formatDate(earliestLendingDate),
					days: lendingDays
				}
			})}
		</p>
	{:else if mode === 'lp' && earliestLpDate}
		<p class="text-base-content/50 text-[11px]">
			{$t('wallet.defi.earn.overview_since_days', {
				values: {
					date: formatDate(earliestLpDate),
					days: lpDays
				}
			})}
		</p>
	{/if}
</div>

<LoanHelpModal isOpen={helpOpen} onClose={() => (helpOpen = false)} {mode} />

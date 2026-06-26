<script lang="ts">
	import { t } from 'svelte-i18n';
	import { defiPositions } from '$lib/stores/defi-positions.store.svelte';
	import LoanHealthBar from './LoanHealthBar.svelte';

	let {
		onManage = () => {}
	}: {
		onManage?: () => void;
	} = $props();

	let hasPositions = $derived(defiPositions.aavePositions.size > 0);
	let positions = $derived(Array.from(defiPositions.aavePositions.entries()));

	let expanded = $state(false);

	function calcLtv(debt: number, collateral: number): number {
		return collateral > 0 ? (debt / collateral) * 100 : 0;
	}

	function riskLevel(ltvPct: number): 'safe' | 'warning' | 'critical' {
		return ltvPct >= 65 ? 'critical' : ltvPct >= 50 ? 'warning' : 'safe';
	}

	const RISK_BADGE: Record<string, { cls: string; label: string }> = {
		safe: { cls: 'badge-success', label: 'Safe' },
		warning: { cls: 'badge-warning', label: 'Caution' },
		critical: { cls: 'badge-error', label: 'At Risk' }
	};
</script>

{#if hasPositions}
	{#each positions as [walletId, pos] (walletId)}
		{@const ltvPct = calcLtv(pos.totalDebtUsd, pos.totalCollateralUsd)}
		{@const risk = riskLevel(ltvPct)}
		{@const badge = RISK_BADGE[risk]}
		{@const price = pos.liquidationPriceBtc ?? 0}

		<div
			class="collapse-arrow border-primary bg-base-100 collapse rounded-lg border-2"
			class:collapse-open={expanded}
			class:collapse-close={!expanded}
		>
			<button
				type="button"
				class="collapse-title flex items-center justify-between px-3 py-2 pr-10 text-left text-sm font-medium sm:px-4 sm:py-3 sm:pr-12 sm:text-base"
				onclick={(e) => {
					expanded = !expanded;
					setTimeout(() => (e.currentTarget as HTMLElement)?.blur(), 50);
				}}
			>
				<div class="flex min-w-0 flex-1 items-center gap-2">
					<img
						src="/images/chains/arbitrum.png"
						alt="Arbitrum"
						class="h-5 w-5 shrink-0 sm:h-6 sm:w-6"
					/>
					<span>Loan</span>
				</div>
				<div class="ml-2 flex shrink-0 items-center gap-2">
					<div class="text-right">
						<div class="text-sm font-semibold tabular-nums sm:text-base">
							${pos.totalDebtUsd.toFixed(2)} / ${pos.totalCollateralUsd.toFixed(2)} ({ltvPct.toFixed(
								1
							)}%)
						</div>
					</div>
					<span class="badge {badge.cls} badge-xs shrink-0 px-1.5 py-0.5 text-[10px] font-medium"
						>{badge.label}</span
					>
				</div>
			</button>
			<div class="collapse-content">
				<div class="space-y-3 px-3 sm:px-4">
					<LoanHealthBar
						totalCollateralUsd={pos.totalCollateralUsd}
						totalDebtUsd={pos.totalDebtUsd}
						availableBorrowsUsd={pos.availableBorrowsUsd}
					/>

					{#if price > 0}
						<div class="flex items-center justify-between text-xs">
							<span class="text-base-content/50">{$t('wallet.defi.wizard.new_liq_price')}</span>
							<span class="font-medium tabular-nums">${Math.round(price).toLocaleString()}</span>
						</div>
					{/if}

					<button
						type="button"
						class="btn btn-primary btn-sm min-h-[44px] w-full"
						onclick={onManage}
					>
						{$t('wallet.defi.wizard.manage_loans')}
					</button>
				</div>
			</div>
		</div>
	{/each}
{/if}

<script lang="ts">
	import { t } from 'svelte-i18n';
	import { defiPositions } from '$lib/stores/defi-positions.store.svelte';
	import { connectedWalletsStore } from '$lib/stores/connected-wallets.store';
	import LoanHealthBar from '../LoanHealthBar.svelte';
	import WalletIcon from '$lib/components/wallet/WalletIcon.svelte';

	interface Props {
		onNewLoan: () => void;
	}

	let { onNewLoan }: Props = $props();

	let positions = $derived(Array.from(defiPositions.aavePositions.entries()));
	let hasPositions = $derived(positions.length > 0);

	function calcLtv(debt: number, collateral: number): number {
		return collateral > 0 ? (debt / collateral) * 100 : 0;
	}

	function riskLevel(ltvPct: number): 'safe' | 'warning' | 'critical' {
		return ltvPct >= 65 ? 'critical' : ltvPct >= 50 ? 'warning' : 'safe';
	}

	const RISK_BADGE: Record<string, { cls: string; labelKey: string }> = {
		safe: { cls: 'badge-success', labelKey: 'wallet.defi.risk_safe' },
		warning: { cls: 'badge-warning', labelKey: 'wallet.defi.risk_caution' },
		critical: { cls: 'badge-error', labelKey: 'wallet.defi.risk_at_risk' }
	};

	function getWalletName(walletId: string): string {
		if (walletId === 'builtin') return $t('wallet.builtin_wallet');
		const w = $connectedWalletsStore.wallets.find((w) => w.id === walletId);
		return w?.walletName ?? walletId;
	}

	function getWalletType(walletId: string): string {
		if (walletId === 'builtin') return '';
		const w = $connectedWalletsStore.wallets.find((w) => w.id === walletId);
		return w?.walletType ?? '';
	}
</script>

<div class="flex flex-col gap-4">
	<h3 class="text-base font-semibold">{$t('wallet.defi.loan_wizard.your_loans')}</h3>

	{#if hasPositions}
		{#each positions as [walletId, pos] (walletId)}
			{@const ltvPct = calcLtv(pos.totalDebtUsd, pos.totalCollateralUsd)}
			{@const risk = riskLevel(ltvPct)}
			{@const badge = RISK_BADGE[risk]}

			<div class="border-primary bg-base-100 space-y-3 rounded-lg border p-3">
				<div class="flex items-center gap-2">
					{#if walletId === 'builtin'}
						<img
							src="/images/logos/bittasker-logomark.svg"
							alt={$t('wallet.common.alt_bitasker_wallet')}
							class="h-5 w-5 shrink-0 self-center"
						/>
					{:else}
						<WalletIcon
							walletType={getWalletType(walletId)}
							className="h-5 w-5 shrink-0 self-center"
						/>
					{/if}
					<div class="min-w-0 flex-1">
						<div class="flex items-center justify-between gap-2">
							<span class="text-sm font-medium">
								{getWalletName(walletId)}
							</span>
							<span class="shrink-0 text-xs tabular-nums">
								${pos.totalDebtUsd.toFixed(2)} / ${pos.totalCollateralUsd.toFixed(2)}
							</span>
						</div>
						<div class="flex items-center justify-between gap-2">
							<span class="text-base-content/50 font-mono text-xs">
								{pos.address.slice(0, 6)}...{pos.address.slice(-4)}
							</span>
							<div class="flex shrink-0 items-center gap-1.5">
								<span class="text-base-content/60 text-xs tabular-nums">
									{$t('wallet.defi.lending.ltv')}: {ltvPct.toFixed(1)}%
								</span>
								<span class="badge {badge.cls} badge-xs px-1.5 py-0.5 text-[10px] font-medium"
									>{$t(badge.labelKey)}</span
								>
							</div>
						</div>
					</div>
				</div>

				<LoanHealthBar
					totalCollateralUsd={pos.totalCollateralUsd}
					totalDebtUsd={pos.totalDebtUsd}
					availableBorrowsUsd={pos.availableBorrowsUsd}
				/>

				{#if pos.liquidationPriceBtc}
					<div class="flex items-center justify-end text-xs">
						<span class="text-base-content/50">
							{$t('wallet.defi.liq_price_display', {
								values: { price: `$${Math.round(pos.liquidationPriceBtc).toLocaleString()}` }
							})}
						</span>
					</div>
				{/if}
			</div>
		{/each}
	{/if}

	<button type="button" class="btn btn-primary min-h-[48px] w-full text-base" onclick={onNewLoan}>
		{$t('wallet.defi.loan_wizard.new_loan')}
	</button>
</div>

<script lang="ts">
	import { t } from 'svelte-i18n';
	import { defiPositions } from '$lib/stores/defi-positions.store.svelte';
	import { connectedWalletsStore } from '$lib/stores/connected-wallets.store';
	import LoanHealthBar from './LoanHealthBar.svelte';
	import WalletIcon from '$lib/components/wallet/WalletIcon.svelte';

	interface Props {
		walletId: string;
		address: string;
		isExpanded: boolean;
		onToggle: () => void;
	}

	let { walletId, address, isExpanded, onToggle }: Props = $props();

	// Look up Aave position for this wallet
	let pos = $derived(defiPositions.aavePositions.get(walletId) ?? null);

	// Wallet display info
	let connectedWallet = $derived(
		walletId === 'builtin'
			? null
			: ($connectedWalletsStore.wallets.find((w) => w.id === walletId) ?? null)
	);

	let walletName = $derived(
		walletId === 'builtin' ? $t('wallet.builtin_wallet') : (connectedWallet?.walletName ?? walletId)
	);

	// LTV and risk computation (same logic as PositionsOverviewStep)
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

	let ltvPct = $derived(pos ? calcLtv(pos.totalDebtUsd, pos.totalCollateralUsd) : 0);
	let risk = $derived(riskLevel(ltvPct));
	let badge = $derived(RISK_BADGE[risk]);

	// Short address for display
	let shortAddress = $derived(`${address.slice(0, 6)}...${address.slice(-4)}`);

	// Formatted liq price
	let formattedLiqPrice = $derived(
		pos?.liquidationPriceBtc ? `$${Math.round(pos.liquidationPriceBtc).toLocaleString()}` : null
	);
</script>

<div
	class="collapse-arrow border-primary bg-base-100 collapse rounded-lg border"
	class:collapse-open={isExpanded}
>
	<button
		type="button"
		class="collapse-title flex items-center justify-between px-3 py-2 pr-10 text-left text-sm font-medium sm:px-4 sm:py-3 sm:pr-12"
		onclick={onToggle}
	>
		<div class="flex min-w-0 flex-1 items-center gap-2">
			{#if walletId === 'builtin'}
				<img
					src="/images/logos/bittasker-logomark.svg"
					alt="BitTasker Wallet"
					class="h-5 w-5 shrink-0 self-center sm:h-6 sm:w-6"
				/>
			{:else if connectedWallet}
				<WalletIcon
					walletType={connectedWallet.walletType}
					className="h-5 w-5 shrink-0 self-center sm:h-6 sm:w-6"
				/>
			{:else}
				<div
					class="bg-base-300 text-base-content/50 flex h-5 w-5 shrink-0 items-center justify-center self-center rounded-full text-xs font-medium sm:h-6 sm:w-6"
				>
					?
				</div>
			{/if}
			<div class="min-w-0 flex-1">
				<div class="flex items-center justify-between gap-2">
					<span class="text-sm font-medium">{walletName}</span>
					{#if pos}
						<span class="shrink-0 text-xs tabular-nums">
							${pos.totalDebtUsd.toFixed(2)} / ${pos.totalCollateralUsd.toFixed(2)}
						</span>
					{/if}
				</div>
				<div class="flex items-center justify-between gap-2">
					<span class="text-base-content/50 font-mono text-xs">{shortAddress}</span>
					<div class="flex shrink-0 items-center gap-1.5">
						<span class="text-base-content/60 text-xs tabular-nums">
							{$t('wallet.defi.ltv_display', { values: { ltv: ltvPct.toFixed(1) } })}
						</span>
						<span class="badge {badge.cls} badge-xs shrink-0 px-1.5 py-0.5 text-[10px] font-medium">
							{badge.label}
						</span>
					</div>
				</div>
			</div>
		</div>
	</button>
	{#if pos}
		<div class="collapse-content">
			<div class="space-y-3 px-3 sm:px-4">
				<LoanHealthBar
					totalCollateralUsd={pos.totalCollateralUsd}
					totalDebtUsd={pos.totalDebtUsd}
					availableBorrowsUsd={pos.availableBorrowsUsd}
				/>

				{#if formattedLiqPrice}
					<div class="flex items-center justify-between text-xs">
						<span class="text-base-content/50">{$t('wallet.defi.wizard.new_liq_price')}</span>
						<span class="font-medium tabular-nums">{formattedLiqPrice}</span>
					</div>
				{/if}
			</div>
		</div>
	{/if}
</div>

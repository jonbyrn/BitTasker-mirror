<script lang="ts">
	import { t } from 'svelte-i18n';
	import { btcPrice } from '$lib/runes/btcPrice.svelte';
	import { defiPositions } from '$lib/stores/defi-positions.store.svelte';
	import LoanHealthBar from '../LoanHealthBar.svelte';
	import RepayForm from './RepayForm.svelte';
	import AddCollateralForm from './AddCollateralForm.svelte';
	import WithdrawForm from './WithdrawForm.svelte';

	interface Props {
		walletId: string;
		address: string;
		onClose: () => void;
	}

	let { walletId, address, onClose: _onClose }: Props = $props();

	let activeAction = $state<'none' | 'repay' | 'add' | 'withdraw' | 'close'>('none');

	let position = $derived(
		walletId === 'builtin' ? defiPositions.aavePositions.get('builtin') : null
	);

	// Projected values from active sub-form
	let projected = $state<{ liqPrice: number; collateralUsd: number } | null>(null);

	// Reset projected when switching forms
	$effect(() => {
		if (activeAction === 'none') projected = null;
	});

	let displayLiqPrice = $derived(projected?.liqPrice ?? position?.liquidationPriceBtc ?? 0);
	let displayCollateral = $derived(projected?.collateralUsd ?? position?.totalCollateralUsd ?? 0);

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
</script>

<div class="flex flex-col gap-4">
	<div class="text-base-content/60 text-xs">
		{walletId === 'builtin' ? $t('wallet.common.builtin') : walletId}
		{address?.slice(0, 6)}...{address?.slice(-4)}
		<span class="badge badge-xs badge-outline ml-1">{$t('wallet.common.arbitrum')}</span>
	</div>

	{#if !position}
		<div class="bg-base-200 rounded-box p-8 text-center">
			<p class="text-base-content/60 text-sm">{$t('wallet.common.loading_position')}</p>
		</div>
	{:else}
		{@const ltvPct = calcLtv(position.totalDebtUsd, displayCollateral)}
		{@const risk = riskLevel(ltvPct)}
		{@const badge = RISK_BADGE[risk]}

		<LoanHealthBar
			totalCollateralUsd={displayCollateral}
			totalDebtUsd={position.totalDebtUsd}
			availableBorrowsUsd={position.availableBorrowsUsd}
		/>

		<div class="flex items-center justify-between text-xs">
			<span class="tabular-nums">
				${position.totalDebtUsd.toFixed(2)} / ${displayCollateral.toFixed(2)} ({ltvPct.toFixed(1)}%)
			</span>
			<span class="badge {badge.cls} badge-xs px-1.5 py-0.5 text-[10px] font-medium"
				>{$t(badge.labelKey)}</span
			>
		</div>

		{#if displayLiqPrice > 0}
			<div class="bg-base-200 rounded-box space-y-1 p-3 text-sm">
				<div class="flex items-center justify-between">
					<span class="text-base-content/60">{$t('wallet.defi.wizard.new_liq_price')}</span>
					<span class="font-medium tabular-nums"
						>${Math.round(displayLiqPrice).toLocaleString()}</span
					>
				</div>
				<div class="flex items-center justify-between">
					<span class="text-base-content/60">{$t('wallet.defi.position.current_btc')}</span>
					<span class="font-medium tabular-nums"
						>${Math.round(btcPrice.price).toLocaleString()}</span
					>
				</div>
			</div>
		{/if}

		{#if activeAction === 'none'}
			<div class="grid grid-cols-2 gap-2">
				<button
					type="button"
					class="btn btn-outline btn-sm"
					onclick={() => (activeAction = 'repay')}
				>
					{$t('wallet.defi.borrow.button_repay')}
				</button>
				<button type="button" class="btn btn-outline btn-sm" onclick={() => (activeAction = 'add')}>
					{$t('wallet.defi.borrow.button_add_collateral')}
				</button>
				<button
					type="button"
					class="btn btn-outline btn-sm"
					onclick={() => (activeAction = 'withdraw')}
				>
					{$t('wallet.defi.position.withdraw_safe')}
				</button>
				<button
					type="button"
					class="btn btn-outline btn-sm btn-error"
					onclick={() => (activeAction = 'close')}
				>
					{$t('wallet.defi.position.close_position')}
				</button>
			</div>

			{#if position.totalDebtUsd > 0}
				<div class="collapse-arrow border-primary bg-base-100 collapse rounded-lg border-2">
					<button
						type="button"
						class="collapse-title flex min-h-[44px] items-center gap-2 px-3 py-2.5 text-sm font-medium"
					>
						{$t('wallet.defi.position.guided_title')}
					</button>
					<div class="collapse-content space-y-2 px-2 text-sm">
						<p class="text-base-content/60 text-xs">{$t('wallet.defi.position.guided_desc')}</p>
						<ol class="list-inside list-decimal space-y-1 text-xs">
							<li>{$t('wallet.defi.position.guided_step1')}</li>
							<li>{$t('wallet.defi.position.guided_step2')}</li>
							<li>{$t('wallet.defi.position.guided_step3')}</li>
						</ol>
						<p class="text-base-content/50 text-xs">
							{$t('wallet.defi.position.guided_no_atomic')}
						</p>
					</div>
				</div>
			{/if}
		{:else if activeAction === 'repay'}
			<RepayForm
				{walletId}
				{address}
				onBack={() => (activeAction = 'none')}
				onComplete={() => {
					activeAction = 'none';
					defiPositions.invalidate(walletId);
				}}
				onProject={(data) => (projected = data)}
			/>
		{:else if activeAction === 'add'}
			<AddCollateralForm
				{walletId}
				{address}
				onBack={() => (activeAction = 'none')}
				onComplete={() => {
					activeAction = 'none';
					defiPositions.invalidate(walletId);
				}}
				onProject={(data) => (projected = data)}
			/>
		{:else if activeAction === 'withdraw'}
			<WithdrawForm
				{walletId}
				{address}
				onBack={() => (activeAction = 'none')}
				onComplete={() => {
					activeAction = 'none';
					defiPositions.invalidate(walletId);
				}}
				onProject={(data) => (projected = data)}
			/>
		{:else if activeAction === 'close'}
			<div class="bg-base-200 rounded-box space-y-3 p-3 text-sm">
				<p class="font-medium">{$t('wallet.defi.position.close_position')}</p>
				{#if position.totalDebtUsd > 0}
					<p class="text-base-content/60 text-xs">
						{$t('wallet.defi.position.close_need_repay', {
							values: { amount: position.totalDebtUsd.toFixed(2) }
						})}
					</p>
					<div class="flex gap-2">
						<button
							type="button"
							class="btn btn-outline btn-sm flex-1"
							onclick={() => (activeAction = 'repay')}
						>
							{$t('wallet.defi.position.close_repay_first')}
						</button>
						<button
							type="button"
							class="btn btn-ghost btn-sm"
							onclick={() => (activeAction = 'none')}
						>
							{$t('wallet.defi.position.cancel')}
						</button>
					</div>
				{:else}
					<p class="text-base-content/60 text-xs">
						{$t('wallet.defi.position.close_no_debt')}
					</p>
					<div class="flex gap-2">
						<button
							type="button"
							class="btn btn-error btn-sm flex-1"
							onclick={() => (activeAction = 'withdraw')}
						>
							{$t('wallet.defi.position.close_withdraw_all')}
						</button>
						<button
							type="button"
							class="btn btn-ghost btn-sm"
							onclick={() => (activeAction = 'none')}
						>
							{$t('wallet.defi.position.cancel')}
						</button>
					</div>
				{/if}
			</div>
		{/if}
	{/if}
</div>

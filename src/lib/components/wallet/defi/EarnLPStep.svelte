<script lang="ts">
	import { t } from 'svelte-i18n';
	import { walletStore } from '$lib/stores/wallet.store';

	let amount = $state('');
	let amountNum = $derived(parseFloat(amount) || 0);
	let ilExpanded = $state(false);

	// Simulated data
	let estimatedAPY = 25; // 20-30% range

	// Split equally between WBTC and USDT0
	let wbtcAmount = $derived(amountNum / 2 / 74000); // rough BTC price
	let usdt0Amount = $derived(amountNum / 2);

	function setMaxAmount() {
		// Use available balances
		const wbtcUsd = $walletStore.arb.wbtcUsdValue;
		const usdt0 = parseFloat($walletStore.arb.usdt0Balance || '0');
		amount = Math.min(wbtcUsd, usdt0).toFixed(2);
	}
</script>

<div class="space-y-4">
	<!-- Pre-check: need both WBTC and USDT0 -->
	<div class="bg-base-200 rounded-box space-y-1 p-3 text-xs">
		<div class="flex justify-between">
			<span>WBTC</span>
			<span>{$walletStore.arb.formattedWbtcBalance} WBTC</span>
		</div>
		<div class="flex justify-between">
			<span>USDT0</span>
			<span>${parseFloat($walletStore.arb.usdt0Balance || '0').toFixed(2)}</span>
		</div>
	</div>

	<!-- Fee tier (simplified — just show the 0.05% as default) -->
	<div class="bg-base-200 rounded-box flex justify-between p-3 text-sm">
		<span>{$t('wallet.defi.lp.fee_tier_label')}</span>
		<span class="font-medium">{$t('wallet.defi.lp.fee_tier_005')}</span>
	</div>

	<!-- APY display -->
	<div class="bg-base-200 rounded-box flex justify-between p-3 text-sm">
		<span>{$t('wallet.defi.lp.apy_label')}</span>
		<span class="text-success font-bold">~{estimatedAPY}%</span>
	</div>

	<!-- Amount Input -->
	<div>
		<label class="label" for="earn-lp-amount">
			<span class="label-text text-sm font-medium">{$t('wallet.defi.lp.amount_label')}</span>
		</label>
		<div class="join w-full">
			<span
				class="btn join-item bg-base-200 text-base-content/70 no-animation min-h-[48px] border-r-0 text-lg"
				>$</span
			>
			<input
				id="earn-lp-amount"
				type="number"
				class="input input-bordered join-item min-h-[48px] flex-1 text-lg"
				placeholder="0.00"
				bind:value={amount}
				min="0"
				step="0.01"
				inputmode="decimal"
			/>
			<button
				type="button"
				class="btn btn-primary join-item min-h-[48px] rounded-r-lg"
				onclick={setMaxAmount}
			>
				{$t('wallet.max')}
			</button>
		</div>
		{#if amountNum > 0}
			<div class="text-base-content/60 mt-1 text-xs">
				{$t('wallet.defi.lp.both_sides_label')}: {wbtcAmount.toFixed(6)} WBTC + ${usdt0Amount.toFixed(
					2
				)} USDT0
			</div>
		{/if}
	</div>

	<!-- IL Risk (collapsed) -->
	<div class="collapse-arrow bg-base-200 rounded-box collapse" class:collapse-open={ilExpanded}>
		<button
			type="button"
			class="collapse-title text-sm font-medium"
			onclick={() => (ilExpanded = !ilExpanded)}
		>
			{$t('wallet.defi.lp.il_title')}
		</button>
		<div class="collapse-content text-base-content/70 space-y-2 text-xs">
			<p>{$t('wallet.defi.lp.il_double')}</p>
			<p>{$t('wallet.defi.lp.il_halve')}</p>
		</div>
	</div>

	<!-- CTA -->
	<button class="btn btn-primary min-h-[48px] w-full" disabled={amountNum <= 0}>
		{$t('wallet.defi.lp.button_approve_lp')}
	</button>
</div>

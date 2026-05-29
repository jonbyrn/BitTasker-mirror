<script lang="ts">
	import { t } from 'svelte-i18n';
	import { walletStore } from '$lib/stores/wallet.store';

	let amount = $state('');
	let amountNum = $derived(parseFloat(amount) || 0);

	// Simulated Aave data (replace with real service later)
	let supplyAPY = 4.22;
	let projectedEarnings = $derived(amountNum + amountNum * (supplyAPY / 100));

	function setMaxAmount() {
		// Use USDT0 balance from wallet store
		amount = (
			$walletStore.arb.usdt0Balance ? parseFloat($walletStore.arb.usdt0Balance) : 0
		).toString();
	}
</script>

<div class="space-y-4">
	<!-- APY banner -->
	<div class="bg-base-200 rounded-box space-y-1 p-3 text-sm">
		<div class="flex justify-between">
			<span class="text-base-content/60">{$t('wallet.defi.lend.apy_label')}</span>
			<span class="text-success font-bold">{supplyAPY.toFixed(2)}%</span>
		</div>
		<p class="text-base-content/60 text-xs">{$t('wallet.defi.lend.risk_info')}</p>
	</div>

	<!-- Amount Input -->
	<div>
		<label class="label" for="earn-lend-amount">
			<span class="label-text text-sm font-medium">{$t('wallet.defi.lend.amount_label')}</span>
		</label>
		<div class="join w-full">
			<span
				class="btn join-item bg-base-200 text-base-content/70 no-animation min-h-[48px] border-r-0 text-lg"
				>$</span
			>
			<input
				id="earn-lend-amount"
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
	</div>

	<!-- Projected Earnings -->
	{#if amountNum > 0}
		<div class="bg-base-200 rounded-box p-3 text-sm">
			<span>{$t('wallet.defi.lend.projected_label')}: </span>
			<span class="font-medium">${projectedEarnings.toFixed(2)}</span>
		</div>
	{/if}

	<!-- CTA -->
	<button class="btn btn-primary min-h-[48px] w-full" disabled={amountNum <= 0}>
		{$t('wallet.defi.lend.button_approve_supply')}
	</button>
</div>

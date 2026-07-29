<script lang="ts">
	import { t } from 'svelte-i18n';
	import { walletStore } from '$lib/stores/wallet.store';

	let {
		showBscAddress = false,
		balancesHidden = false
	}: { showBscAddress?: boolean; balancesHidden?: boolean } = $props();

	let usdtFormatted = $derived($walletStore.bsc.formattedUsdtBalance || '0');
	let bscConnected = $derived($walletStore.bsc.connected);
	let bscAddress = $derived($walletStore.bsc.address || '');
</script>

<div class="flex flex-col gap-2">
	<!-- Connection Status -->
	<div class="flex items-center gap-2">
		<span class="badge badge-xs {bscConnected ? 'badge-success' : 'badge-ghost'} shrink-0"></span>
		<span class="text-base-content/60 text-xs">
			{#if bscConnected}
				{$t('wallet.bsc.title')}
			{:else}
				{$t('wallet.bsc.not_connected')}
			{/if}
		</span>
	</div>

	<!-- Balance Display -->
	<div class="flex items-center gap-2">
		<img src="/images/chains/Binance-logo.svg" alt="BSC" class="h-5 w-5 shrink-0" />
		<span class="font-medium">
			{#if balancesHidden}
				••••
			{:else if bscConnected && parseFloat(usdtFormatted) > 0}
				${parseFloat(usdtFormatted).toFixed(2)}
			{:else}
				$0.00
			{/if}
			<span class="text-base-content/60 ml-1 text-sm">USDT</span>
		</span>
	</div>

	<!-- BSC Address (optional) -->
	{#if showBscAddress && bscConnected && bscAddress}
		<div class="bg-base-200 mt-1 rounded-lg p-2">
			<div class="text-base-content/60 mb-1 text-xs">
				{$t('wallet.bsc.your_address')}
			</div>
			<code class="block text-xs break-all opacity-80">{bscAddress}</code>
		</div>
	{/if}
</div>

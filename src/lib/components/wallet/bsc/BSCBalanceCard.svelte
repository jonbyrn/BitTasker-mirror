<script lang="ts">
	import { t } from 'svelte-i18n';
	import { bscUsdtWalletStore, bscUsdtBalance, bscBnbBalance, bscTokenBalances, bscCanPayFeesInUsdt } from '$lib/stores/bscUsdtWallet.store';
	import { BSC_NETWORKS } from '$lib/stores/bscUsdtWallet.store';

	// Get current network info
	const networkInfo = $derived(BSC_NETWORKS[$bscUsdtWalletStore.network]);
	const usdtToken = $derived(networkInfo.tokens.find(token => token.symbol === 'USDT' || token.symbol === 'tUSDT'));
	const usdtBalance = $derived($bscTokenBalances.find(balance => 
		balance.token.symbol === 'USDT' || balance.token.symbol === 'tUSDT'
	));
</script>

<div class="card bg-gradient-to-br from-blue-500 to-purple-600 text-white shadow-xl">
	<div class="card-body">
		<div class="flex items-center justify-between mb-4">
			<h3 class="card-title text-white">{$t('wallet.bsc.title')}</h3>
			<div class="badge badge-outline badge-sm text-white border-white">
				{networkInfo.name}
			</div>
		</div>

		<!-- USDT Balance -->
		<div class="mb-6">
			<div class="flex items-center mb-2">
				<img 
					src="/currency-symbols/USDt.svg" 
					alt="USDT" 
					class="w-8 h-8 mr-2"
					onerror={(e) => { (e.target as HTMLImageElement).src = '/currency-symbols/Bitcoin.svg'; }}
				/>
				<span class="text-lg font-medium">{$t('wallet.bsc.usdt_balance')}</span>
			</div>
			<div class="text-3xl font-bold">
				{$bscUsdtBalance}
			</div>
			<div class="text-sm opacity-80">
				{$t('wallet.bsc.tether_usd')}
			</div>
		</div>

		<!-- BNB Balance (for gas fees) -->
		<div class="mb-4">
			<div class="flex items-center mb-2">
				<img 
					src="/currency-symbols/Bitcoin.svg" 
					alt="BNB" 
					class="w-6 h-6 mr-2"
				/>
				<span class="text-sm font-medium">{$t('wallet.bsc.bnb_balance')}</span>
			</div>
			<div class="text-lg font-semibold">
				{$bscBnbBalance}
			</div>
			<div class="text-xs opacity-80">
				{$t('wallet.bsc.for_gas_fees')}
			</div>
		</div>

		<!-- EIP-7702 Status -->
		{#if $bscCanPayFeesInUsdt}
			<div class="alert alert-success alert-sm mb-4">
				<svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-4 w-4" fill="none" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
				</svg>
				<span class="text-xs">{$t('wallet.bsc.eip7702_enabled')}</span>
			</div>
		{:else}
			<div class="alert alert-warning alert-sm mb-4">
				<svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-4 w-4" fill="none" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
				</svg>
				<span class="text-xs">{$t('wallet.bsc.eip7702_disabled')}</span>
			</div>
		{/if}

		<!-- Wallet Address -->
		<div class="mt-4">
			<div class="text-xs opacity-80 mb-1">{$t('wallet.bsc.wallet_address')}</div>
			<div class="text-xs font-mono break-all bg-black bg-opacity-20 p-2 rounded">
				{$bscUsdtWalletStore.address || $t('wallet.bsc.not_connected')}
			</div>
		</div>

		<!-- Network Info -->
		<div class="mt-4 text-xs opacity-80">
			<div>{$t('wallet.bsc.chain_id')}: {networkInfo.chainId}</div>
			<div>{$t('wallet.bsc.rpc')}: {networkInfo.rpcUrl}</div>
		</div>
	</div>
</div>

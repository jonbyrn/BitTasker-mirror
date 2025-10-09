<script lang="ts">
	import { t } from 'svelte-i18n';
	import {
		bscConnection,
		walletStore,
	} from '$lib/stores/wallet.store';
	import { BSC_NETWORKS } from '$lib/utils/wallet/networkConfig';

	// Get current network info
	const networkInfo = BSC_NETWORKS[import.meta.env.VITE_BSC_NETWORK as keyof typeof BSC_NETWORKS];
	const usdtToken = $derived(
		networkInfo.tokens.find((token) => token.symbol === 'USDT' || token.symbol === 'tUSDT')
	);
	const usdtBalance = $derived(
		networkInfo.tokens.find(
			(balance) => balance.symbol === 'USDT' || balance.symbol === 'tUSDT'
		)
	);
</script>

<div class="card bg-gradient-to-br from-blue-500 to-purple-600 text-white shadow-xl">
	<div class="card-body">
		<div class="mb-4 flex items-center justify-between">
			<h3 class="card-title text-white">{$t('wallet.bsc.title')}</h3>
			<div class="badge badge-outline badge-sm border-white text-white">
				{networkInfo.name}
			</div>
		</div>

		<!-- USDT Balance -->
		<div class="mb-6">
			<div class="mb-2 flex items-center">
				<img
					src="/currency-symbols/USDt.svg"
					alt="USDT"
					class="mr-2 h-8 w-8"
					onerror={(e) => {
						(e.target as HTMLImageElement).src = '/currency-symbols/Bitcoin.svg';
					}}
				/>
				<span class="text-lg font-medium">{$t('wallet.bsc.usdt_balance')}</span>
			</div>
			<div class="text-3xl font-bold">
				{$walletStore.bsc.usdtBalance}
			</div>
			<div class="text-sm opacity-80">
				{$t('wallet.bsc.tether_usd')}
			</div>
		</div>

		<!-- BNB Balance (for gas fees) -->
		<div class="mb-4">
			<div class="mb-2 flex items-center">
				<img src="/currency-symbols/Bitcoin.svg" alt="BNB" class="mr-2 h-6 w-6" />
				<span class="text-sm font-medium">{$t('wallet.bsc.bnb_balance')}</span>
			</div>
			<div class="text-lg font-semibold">
				{$walletStore.bsc.bnbBalance}
			</div>
			<div class="text-xs opacity-80">
				{$t('wallet.bsc.for_gas_fees')}
			</div>
		</div>

		<!-- EIP-7702 Status -->
		{#if $walletStore.bsc.canPayFeesInUsdt}
			<div class="alert alert-success alert-sm mb-4">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-4 w-4 shrink-0 stroke-current"
					fill="none"
					viewBox="0 0 24 24"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
					/>
				</svg>
				<span class="text-xs">{$t('wallet.bsc.eip7702_enabled')}</span>
			</div>
		{:else}
			<div class="alert alert-warning alert-sm mb-4">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-4 w-4 shrink-0 stroke-current"
					fill="none"
					viewBox="0 0 24 24"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
					/>
				</svg>
				<span class="text-xs">{$t('wallet.bsc.eip7702_disabled')}</span>
			</div>
		{/if}

		<!-- Wallet Address -->
		<div class="mt-4">
			<div class="mb-1 text-xs opacity-80">{$t('wallet.bsc.wallet_address')}</div>
			<div class="bg-opacity-20 rounded bg-black p-2 font-mono text-xs break-all">
				{$bscConnection.address || $t('wallet.bsc.not_connected')}
			</div>
		</div>

		<!-- Network Info -->
		<div class="mt-4 text-xs opacity-80">
			<div>{$t('wallet.bsc.chain_id')}: {networkInfo.chainId}</div>
			<div>{$t('wallet.bsc.rpc')}: {networkInfo.rpcUrl}</div>
		</div>
	</div>
</div>

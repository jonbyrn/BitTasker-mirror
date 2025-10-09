<script lang="ts">
	import { appStore } from '$lib/stores/app.store';
	import {
		rskWalletStore,
		rskBalance,
		rskAddress,
		getUnitLabel
	} from '$lib/stores/rskWallet.store';
	import { RSK_NETWORKS } from '$lib/utils/wallet/networkConfig';
	import { copyToClipboard } from '$lib/utils/helpers/clipboard';

	async function copyAddress() {
		if ($rskAddress) {
			await copyToClipboard($rskAddress);
			appStore.showSuccessToast('Address copied to clipboard');
		}
	}

	function formatAddress(address: string | null): string {
		if (!address) return '';
		return `${address.slice(0, 6)}...${address.slice(-4)}`;
	}

	function getExplorerUrl(address: string): string {
		const network = RSK_NETWORKS[$rskWalletStore.network];
		return `${network.explorerUrl}/address/${address}`;
	}

	function toggleUnit() {
		rskWalletStore.update((state) => ({
			...state,
			unitPreference: state.unitPreference === 'rbtc' ? 'wei' : 'rbtc'
		}));
	}
</script>

<div class="card bg-gradient-to-br from-orange-500 to-orange-600 text-white shadow-xl">
	<div class="card-body">
		<div class="flex items-center justify-between">
			<div>
				<div class="flex items-center gap-2">
					<h3 class="card-title text-white">
						{getUnitLabel($rskWalletStore.unitPreference, $rskWalletStore.network)} Balance
					</h3>
					<button
						class="btn btn-xs btn-outline btn-circle border-white text-white hover:bg-white hover:text-orange-600"
						onclick={toggleUnit}
						title="Toggle unit display"
					>
						⇄
					</button>
				</div>
				<div class="mt-2 text-3xl font-bold">
					{$rskBalance}
				</div>
				<div class="mt-1 text-sm opacity-80">
					{$rskWalletStore.unitPreference === 'wei'
						? 'Wei (smallest unit)'
						: RSK_NETWORKS[$rskWalletStore.network].currency.name}
				</div>
			</div>
			<div class="text-right">
				<div class="badge badge-outline badge-lg border-white text-white">
					{$rskWalletStore.network.toUpperCase()}
				</div>
			</div>
		</div>

		{#if $rskAddress}
			<div class="divider divider-neutral"></div>

			<div class="flex items-center justify-between">
				<div>
					<div class="text-sm opacity-80">Wallet Address</div>
					<div class="font-mono text-sm">
						{formatAddress($rskAddress)}
					</div>
				</div>
				<div class="flex gap-2">
					<button
						class="btn btn-sm btn-ghost text-white hover:bg-white hover:text-black"
						onclick={copyAddress}
						aria-label="Copy address"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-4 w-4"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
							/>
						</svg>
					</button>
					<a
						href={getExplorerUrl($rskAddress)}
						target="_blank"
						rel="noopener noreferrer"
						class="btn btn-sm btn-ghost text-white hover:bg-white hover:text-black"
						aria-label="View on explorer"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-4 w-4"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
							/>
						</svg>
					</a>
				</div>
			</div>
		{/if}

		{#if $rskWalletStore.blockNumber}
			<div class="mt-4 text-xs opacity-70">
				Latest Block: #{$rskWalletStore.blockNumber.toLocaleString()}
			</div>
		{/if}
	</div>
</div>

<!-- Quick Actions -->
<div class="mt-6 grid grid-cols-2 gap-4">
	<div class="stat bg-base-200 rounded-lg">
		<div class="stat-title text-xs">Network</div>
		<div class="stat-value text-sm">
			{RSK_NETWORKS[$rskWalletStore.network].name}
		</div>
		<div class="stat-desc">Chain ID: {RSK_NETWORKS[$rskWalletStore.network].chainId}</div>
	</div>

	<div class="stat bg-base-200 rounded-lg">
		<div class="stat-title text-xs">Status</div>
		<div class="stat-value flex items-center gap-2 text-sm">
			{#if $rskWalletStore.isConnected}
				<div class="badge badge-success badge-sm">Connected</div>
			{:else}
				<div class="badge badge-error badge-sm">Disconnected</div>
			{/if}
		</div>
		<div class="stat-desc text-xs">
			{#if $rskWalletStore.pendingTransactions.length > 0}
				{$rskWalletStore.pendingTransactions.length} pending
			{:else}
				All confirmed
			{/if}
		</div>
	</div>
</div>

<script lang="ts">
	import { onMount } from 'svelte';
	import { multiNetworkEscrow, getAvailableNetworks, formatNetworkName, type EscrowNetwork, type NetworkEnvironment } from '$lib/utils/wallet/multiNetworkEscrow';
	import { walletStore } from '$lib/stores/wallet.store';
	import { bscUsdtWalletStore } from '$lib/stores/bscUsdtWallet.store';
	import { get } from 'svelte/store';

	interface NetworkOption {
		network: EscrowNetwork;
		environment: NetworkEnvironment;
		name: string;
		available: boolean;
		gasEstimate?: string;
		recommended?: boolean;
	}

	let { selectedNetwork = $bindable('RSK'), selectedEnvironment = $bindable('testnet'), onNetworkChange } = $props<{
		selectedNetwork?: EscrowNetwork;
		selectedEnvironment?: NetworkEnvironment;
		onNetworkChange?: (network: EscrowNetwork, environment: NetworkEnvironment) => void;
	}>();

	let availableNetworks = $state<NetworkOption[]>([]);
	let isLoading = $state(false);
	let error = $state('');

	// Network availability check
	function checkNetworkAvailability(network: EscrowNetwork, environment: NetworkEnvironment): boolean {
		const walletState = get(walletStore);
		const bscState = get(bscUsdtWalletStore);

		if (network === 'RSK') {
			return walletState.rsk.connected;
		} else 		if (network === 'BSC') {
			return bscState.isConnected;
		}
		return false;
	}

	// Load available networks
	async function loadAvailableNetworks() {
		try {
			isLoading = true;
			error = '';

			const networks = getAvailableNetworks();
			const networkOptions: NetworkOption[] = [];

			for (const { network, environment, config } of networks) {
				const available = checkNetworkAvailability(network, environment);
				
				networkOptions.push({
					network,
					environment,
					name: formatNetworkName(network, environment),
					available,
					recommended: network === 'RSK' && environment === 'testnet' // RSK testnet as default recommendation
				});
			}

			availableNetworks = networkOptions;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load networks';
		} finally {
			isLoading = false;
		}
	}

	// Handle network selection
	function handleNetworkChange(network: EscrowNetwork, environment: NetworkEnvironment) {
		selectedNetwork = network;
		selectedEnvironment = environment;
		onNetworkChange?.(network, environment);
	}

	// Get network icon
	function getNetworkIcon(network: EscrowNetwork): string {
		switch (network) {
			case 'RSK':
				return '/images/chains/Bitcoin.svg';
			case 'BSC':
				return '/images/chains/Binance-logo.svg';
			default:
				return '/images/chains/Bitcoin.svg';
		}
	}

	// Get network description
	function getNetworkDescription(network: EscrowNetwork, environment: NetworkEnvironment): string {
		if (network === 'RSK') {
			return environment === 'testnet' 
				? 'Lower fees, Bitcoin security, testnet environment'
				: 'Lower fees, Bitcoin security, mainnet environment';
		} else if (network === 'BSC') {
			return environment === 'testnet'
				? 'Higher liquidity, Ethereum compatibility, testnet environment'
				: 'Higher liquidity, Ethereum compatibility, mainnet environment';
		}
		return '';
	}

	onMount(() => {
		loadAvailableNetworks();
	});
</script>

<div class="space-y-4">
	<!-- Network Selection Header -->
	<div class="space-y-2">
		<h3 class="text-lg font-semibold">Choose Escrow Network</h3>
		<p class="text-sm text-base-content/70">
			Select the blockchain network for your escrow contract. Each network has different characteristics:
		</p>
	</div>

	<!-- Error Display -->
	{#if error}
		<div class="alert alert-error">
			<svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
			</svg>
			<span>{error}</span>
		</div>
	{/if}

	<!-- Loading State -->
	{#if isLoading}
		<div class="space-y-3">
			{#each Array(2) as _}
				<div class="bg-base-200 h-20 animate-pulse rounded-lg"></div>
			{/each}
		</div>
	{:else}
		<!-- Network Options -->
		<div class="space-y-3">
			{#each availableNetworks as networkOption}
				<label class="cursor-pointer">
					<div class="card bg-base-100 border-2 transition-all duration-200 hover:shadow-md {selectedNetwork === networkOption.network && selectedEnvironment === networkOption.environment ? 'border-primary' : 'border-base-300'}">
						<div class="card-body p-4">
							<div class="flex items-center justify-between">
								<div class="flex items-center space-x-3">
									<!-- Network Icon -->
									<div class="avatar">
										<div class="w-10 h-10 rounded-full">
											<img src={getNetworkIcon(networkOption.network)} alt={networkOption.name} class="w-full h-full object-contain" />
										</div>
									</div>

									<!-- Network Info -->
									<div class="flex-1">
										<div class="flex items-center space-x-2">
											<h4 class="font-semibold">{networkOption.name}</h4>
											{#if networkOption.recommended}
												<span class="badge badge-primary badge-sm">Recommended</span>
											{/if}
											{#if !networkOption.available}
												<span class="badge badge-error badge-sm">Wallet Not Connected</span>
											{/if}
										</div>
										<p class="text-sm text-base-content/70">
											{getNetworkDescription(networkOption.network, networkOption.environment)}
										</p>
									</div>
								</div>

								<!-- Selection Radio -->
								<div class="flex items-center">
									<input
										type="radio"
										name="escrowNetwork"
										class="radio radio-primary"
										checked={selectedNetwork === networkOption.network && selectedEnvironment === networkOption.environment}
										disabled={!networkOption.available}
										onchange={() => handleNetworkChange(networkOption.network, networkOption.environment)}
									/>
								</div>
							</div>

							<!-- Additional Info -->
							{#if networkOption.gasEstimate}
								<div class="mt-2 text-xs text-base-content/60">
									Estimated gas: {networkOption.gasEstimate}
								</div>
							{/if}
						</div>
					</div>
				</label>
			{/each}
		</div>

		<!-- Network Comparison -->
		<div class="collapse collapse-arrow bg-base-200">
			<input type="checkbox" />
			<div class="collapse-title text-sm font-medium">
				Network Comparison
			</div>
			<div class="collapse-content">
				<div class="overflow-x-auto">
					<table class="table table-sm">
						<thead>
							<tr>
								<th>Feature</th>
								<th>RSK</th>
								<th>BSC</th>
							</tr>
						</thead>
						<tbody>
							<tr>
								<td>Gas Fees</td>
								<td>Lower (~$0.01-0.05)</td>
								<td>Higher (~$0.10-0.50)</td>
							</tr>
							<tr>
								<td>Native Token</td>
								<td>RBTC (Bitcoin-pegged)</td>
								<td>BNB</td>
							</tr>
							<tr>
								<td>Security</td>
								<td>Bitcoin merge-mining</td>
								<td>BNB staking</td>
							</tr>
							<tr>
								<td>Ecosystem</td>
								<td>Bitcoin-focused</td>
								<td>Ethereum-compatible</td>
							</tr>
							<tr>
								<td>Liquidity</td>
								<td>Lower</td>
								<td>Higher</td>
							</tr>
						</tbody>
					</table>
				</div>
			</div>
		</div>

		<!-- Selected Network Summary -->
		{#if selectedNetwork && selectedEnvironment}
			<div class="alert alert-info">
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="stroke-current shrink-0 w-6 h-6">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
				</svg>
				<div>
					<div class="font-semibold">Selected: {formatNetworkName(selectedNetwork, selectedEnvironment)}</div>
					<div class="text-sm">{getNetworkDescription(selectedNetwork, selectedEnvironment)}</div>
				</div>
			</div>
		{/if}
	{/if}
</div>

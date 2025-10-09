<script lang="ts">
	import { onMount } from 'svelte';
	import {
		getAvailableNetworks,
		formatNetworkName,
		type EscrowNetwork,
		type NetworkEnvironment
	} from '$lib/utils/wallet/multiNetworkEscrow';
	import { walletStore } from '$lib/stores/wallet.store';
	import { get } from 'svelte/store';
	import { t } from 'svelte-i18n';

	interface NetworkOption {
		network: EscrowNetwork;
		environment: NetworkEnvironment;
		name: string;
		available: boolean;
		gasEstimate?: string;
		recommended?: boolean;
	}

	let {
		selectedNetwork = $bindable('RSK'),
		selectedEnvironment = 'testnet',
		onNetworkChange
	} = $props<{
		selectedNetwork?: EscrowNetwork;
		selectedEnvironment?: NetworkEnvironment;
		onNetworkChange?: (network: EscrowNetwork, environment: NetworkEnvironment) => void;
	}>();

	let availableNetworks = $state<NetworkOption[]>([]);
	let isLoading = $state(false);
	let error = $state('');

	// Network availability check
	function checkNetworkAvailability(
		network: EscrowNetwork
	): boolean {
		const walletState = get(walletStore);

		if (network === 'RSK') {
			return walletState.rsk.connected;
		} else if (network === 'BSC') {
			return walletState.bsc.connected;
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
				// Disable mainnet for now - only show testnet
				if (environment === 'mainnet') {
					continue;
				}

				const available = checkNetworkAvailability(network);

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
			return $t('common.components.network_selector.rsk_description');
		} else if (network === 'BSC') {
			return $t('common.components.network_selector.bsc_description');
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
		<h3 class="text-lg font-semibold">{$t('common.components.network_selector.title')}</h3>
		<p class="text-base-content/70 text-sm">
			{$t('common.components.network_selector.subtitle')}
		</p>
	</div>

	<!-- Error Display -->
	{#if error}
		<div class="alert alert-error">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-6 w-6 shrink-0 stroke-current"
				fill="none"
				viewBox="0 0 24 24"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
				/>
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
					<div
						class="card bg-base-100 border-2 transition-all duration-200 hover:shadow-md {selectedNetwork ===
							networkOption.network && selectedEnvironment === networkOption.environment
							? 'border-primary'
							: 'border-base-300'}"
					>
						<div class="card-body p-4">
							<div class="flex items-center justify-between">
								<div class="flex items-center space-x-3">
									<!-- Network Icon -->
									<div class="avatar">
										<div class="h-10 w-10 rounded-full">
											<img
												src={getNetworkIcon(networkOption.network)}
												alt={networkOption.name}
												class="h-full w-full object-contain"
											/>
										</div>
									</div>

									<!-- Network Info -->
									<div class="flex-1">
										<div class="flex items-center space-x-2">
											<h4 class="font-semibold">{networkOption.name}</h4>
											<!-- All badges hidden for now -->
											<!-- {#if networkOption.recommended}
												<span class="badge badge-primary badge-sm">Recommended</span>
											{/if} -->
											<!-- {#if !networkOption.available}
												<span class="badge badge-error badge-sm">Wallet Not Connected</span>
											{/if} -->
										</div>
										<p class="text-base-content/70 text-sm">
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
										checked={selectedNetwork === networkOption.network &&
											selectedEnvironment === networkOption.environment}
										disabled={!networkOption.available}
										onchange={() =>
											handleNetworkChange(networkOption.network, networkOption.environment)}
									/>
								</div>
							</div>

							<!-- Additional Info -->
							{#if networkOption.gasEstimate}
								<div class="text-base-content/60 mt-2 text-xs">
									Estimated gas: {networkOption.gasEstimate}
								</div>
							{/if}
						</div>
					</div>
				</label>
			{/each}
		</div>

		<!-- Network Comparison -->
		<div class="collapse-arrow bg-base-200 collapse">
			<input type="checkbox" />
			<div class="collapse-title text-sm font-medium">
				{$t('common.components.network_selector.comparison_title')}
			</div>
			<div class="collapse-content">
				<div class="overflow-x-auto">
					<table class="table-sm table">
						<thead>
							<tr>
								<th>{$t('common.components.network_selector.feature')}</th>
								<th>RSK</th>
								<th>BSC</th>
							</tr>
						</thead>
						<tbody>
							<tr>
								<td>{$t('common.components.network_selector.gas_fees')}</td>
								<td>{$t('common.components.network_selector.gas_fees_lower')}</td>
								<td>{$t('common.components.network_selector.gas_fees_higher')}</td>
							</tr>
							<tr>
								<td>{$t('common.components.network_selector.native_token')}</td>
								<td>{$t('common.components.network_selector.rbtc')}</td>
								<td>{$t('common.components.network_selector.bnb')}</td>
							</tr>
							<tr>
								<td>{$t('common.components.network_selector.security')}</td>
								<td>{$t('common.components.network_selector.bitcoin_merge_mining')}</td>
								<td>{$t('common.components.network_selector.bnb_staking')}</td>
							</tr>
							<tr>
								<td>{$t('common.components.network_selector.ecosystem')}</td>
								<td>{$t('common.components.network_selector.bitcoin_focused')}</td>
								<td>{$t('common.components.network_selector.ethereum_compatible')}</td>
							</tr>
							<tr>
								<td>{$t('common.components.network_selector.liquidity')}</td>
								<td>{$t('common.components.network_selector.liquidity_lower')}</td>
								<td>{$t('common.components.network_selector.liquidity_higher')}</td>
							</tr>
						</tbody>
					</table>
				</div>
			</div>
		</div>

		<!-- Selected Network Summary -->
		{#if selectedNetwork && selectedEnvironment}
			<div class="alert alert-info">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
					class="h-6 w-6 shrink-0 stroke-current"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
					></path>
				</svg>
				<div>
					<div class="font-semibold">
						{$t('common.components.network_selector.selected')}: {formatNetworkName(
							selectedNetwork,
							selectedEnvironment
						)}
					</div>
					<div class="text-sm">{getNetworkDescription(selectedNetwork, selectedEnvironment)}</div>
				</div>
			</div>
		{/if}
	{/if}
</div>

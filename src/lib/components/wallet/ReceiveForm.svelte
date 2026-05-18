<script lang="ts">
	import { t } from 'svelte-i18n';
	import { allAssets } from '$lib/stores/wallet.store';
	import LightningReceive from '$lib/components/wallet/LightningReceive.svelte';
	import LBTCReceive from '$lib/components/wallet/LBTCReceive.svelte';
	import RSKReceive from '$lib/components/wallet/RSKReceive.svelte';

	// Form state
	let selectedAsset = $state<'bitcoin' | 'usd'>('bitcoin');
	let selectedNetwork = $state<string>('lightning-bitcoin');
	let errorMessage = $state<string | null>(null);
	let _generatedAddress = $state<string | null>(null);
	let dropdownKey = $state(0);

	// Asset options (Bitcoin and USD)
	let assetOptions = $derived([
		{
			value: 'bitcoin',
			label: $t('wallet.receive_form.assets.bitcoin.label'),
			description: $t('wallet.receive_form.assets.bitcoin.description'),
			icon: '/images/chains/Bitcoin.svg',
			disabled: false
		},
		{
			value: 'usd',
			label: $t('wallet.receive_form.assets.usd.label'),
			description: $t('wallet.receive_form.assets.usd.description'),
			icon: '/images/chains/Tether-USD.svg',
			disabled: false
		}
	]);

	// Network options based on selected asset
	let networkOptions = $derived(() => {
		if (selectedAsset === 'bitcoin') {
			return [
				{
					value: 'lightning-bitcoin',
					label: $t('wallet.receive_form.networks.lightning_bitcoin.label'),
					description: $t('wallet.receive_form.networks.lightning_bitcoin.description'),
					icon: null // Will use lightning icon
				},
				{
					value: 'rootstock-bitcoin',
					label: $t('wallet.receive_form.networks.rootstock_bitcoin.label'),
					description: $t('wallet.receive_form.networks.rootstock_bitcoin.description'),
					icon: '/images/chains/Bitcoin-Rootstock-logo.webp'
				},
				{
					value: 'liquid-bitcoin',
					label: $t('wallet.receive_form.networks.liquid_bitcoin.label'),
					description: $t('wallet.receive_form.networks.liquid_bitcoin.description'),
					icon: '/images/chains/Liquid-Bitcoin.svg'
				},
				{
					value: 'bitcoin',
					label: $t('wallet.receive_form.networks.bitcoin.label'),
					description: $t('wallet.receive_form.networks.bitcoin.description'),
					icon: '/images/chains/Bitcoin.svg'
				}
			];
		} else {
			return [];
		}
	});

	// Get selected network info
	let selectedNetworkInfo = $derived(
		networkOptions().find((network) => network.value === selectedNetwork)
	);

	// Auto-select first available network when asset changes
	$effect(() => {
		const networks = networkOptions();
		if (networks.length > 0 && !networks.find((n) => n.value === selectedNetwork)) {
			selectedNetwork = networks[0].value;
		}
		// Reset form state when network changes
		_generatedAddress = null;
		errorMessage = null;
	});

	function closeNetworkDropdown() {
		dropdownKey++;
	}

	let _availableBalance = $derived(() => {
		const rskAssets = $allAssets.filter((asset) => asset.network === 'RSK');
		return rskAssets.length > 0 ? rskAssets[0].formattedBalance : '0.00';
	});
</script>

<div class="space-y-6">
	{#if errorMessage}
		<div class="alert alert-outline alert-error">
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
			<span>{errorMessage}</span>
		</div>
	{/if}

	<!-- Asset Selection -->
	<div class="form-control">
		<label class="label" for="asset-select">
			<span class="label-text font-medium">{$t('wallet.receive_form.select_asset')}</span>
		</label>
		<div class="grid grid-cols-1 gap-3 md:grid-cols-2">
			{#each assetOptions as asset (asset.value)}
				<label class="cursor-pointer">
					<input
						type="radio"
						bind:group={selectedAsset}
						value={asset.value}
						disabled={asset.disabled}
						class="sr-only"
					/>
					<div
						class="card {selectedAsset === asset.value
							? 'border-primary border-2'
							: 'border-base-300 border'} {asset.disabled
							? 'cursor-not-allowed opacity-50'
							: 'hover:border-primary/50'} transition-colors"
					>
						<div class="card-body p-4">
							<div class="flex items-center gap-3">
								{#if asset.icon.startsWith('/')}
									<img
										src={asset.icon}
										alt={$t('wallet.receive_form.asset_icon')}
										class="h-8 w-8"
									/>
								{:else}
									<span class="text-2xl">{asset.icon}</span>
								{/if}
								<div class="flex-1">
									<div class="font-semibold">{asset.label}</div>
									<div class="text-sm opacity-70">{asset.description}</div>
								</div>
								{#if selectedAsset === asset.value}
									<div class="bg-primary flex h-4 w-4 items-center justify-center rounded-full">
										<div class="h-2 w-2 rounded-full bg-white"></div>
									</div>
								{/if}
							</div>
						</div>
					</div>
				</label>
			{/each}
		</div>
	</div>

	<!-- Coming Soon Alert for USDT -->
	{#if selectedAsset === 'usd'}
		<div class="alert alert-outline alert-info">
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
				<div class="font-bold">{$t('wallet.receive_form.coming_soon')}</div>
				<div class="text-sm">{$t('wallet.receive_form.usdt_not_available')}</div>
			</div>
		</div>
	{/if}

	<!-- Network Selection -->
	{#if selectedAsset === 'bitcoin'}
		<div class="form-control">
			<label class="label" for="network-select">
				<span class="label-text font-medium">{$t('wallet.select_network')}</span>
			</label>
			{#key dropdownKey}
				<div class="dropdown dropdown-bottom w-full">
					<div tabindex="0" role="button" class="btn btn-outline w-full justify-between">
						<div class="flex items-center gap-2">
							{#if selectedNetworkInfo?.icon}
								<img
									src={selectedNetworkInfo.icon}
									alt={selectedNetworkInfo.label}
									class="h-5 w-5"
								/>
							{:else if selectedNetworkInfo?.value === 'lightning-bitcoin'}
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="h-5 w-5 text-yellow-500"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M13 10V3L4 14h7v7l9-11h-7z"
									/>
								</svg>
							{/if}
							<span class="font-medium">{selectedNetworkInfo?.label}</span>
						</div>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-4 w-4 opacity-70"
							viewBox="0 0 20 20"
							fill="currentColor"
						>
							<path
								fill-rule="evenodd"
								d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.25a.75.75 0 01-1.06 0L5.25 8.29a.75.75 0 01-.02-1.08z"
								clip-rule="evenodd"
							/>
						</svg>
					</div>
					<ul class="dropdown-content menu bg-base-100 rounded-box w-full p-2 shadow">
						{#each networkOptions() as network (network.value)}
							<li>
								<button
									class="flex w-full items-center justify-start gap-2"
									onclick={() => {
										selectedNetwork = network.value;
										closeNetworkDropdown();
									}}
								>
									{#if network.icon}
										<img src={network.icon} alt={network.label} class="h-5 w-5" />
									{:else if network.value === 'lightning-bitcoin'}
										<svg
											xmlns="http://www.w3.org/2000/svg"
											class="h-5 w-5 text-yellow-500"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
										>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="2"
												d="M13 10V3L4 14h7v7l9-11h-7z"
											/>
										</svg>
									{/if}
									<span class="font-medium">{network.label}</span>
								</button>
							</li>
						{/each}
					</ul>
				</div>
			{/key}
			{#if selectedNetworkInfo?.description}
				<div class="label">
					<span class="label-text-alt">{selectedNetworkInfo.description}</span>
				</div>
			{/if}
		</div>
	{/if}

	<!-- Coming Soon Alerts -->
	{#if selectedNetwork === 'bitcoin'}
		<div class="alert alert-outline alert-info">
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
				<div class="font-bold">{$t('wallet.receive_form.coming_soon')}</div>
				<div class="text-sm">{$t('wallet.receive_form.network_not_available')}</div>
			</div>
		</div>
	{/if}

	<!-- RSK Default Layout - show form and QR side by side by default -->
	{#if selectedNetwork === 'rootstock-bitcoin'}
		<RSKReceive />
	{/if}

	<!-- Lightning Bitcoin Payment Receiving Area -->
	{#if selectedNetwork === 'lightning-bitcoin'}
		<LightningReceive />
	{/if}

	<!-- L-BTC to RBTC Chain Swap Area -->
	{#if selectedNetwork === 'liquid-bitcoin'}
		<LBTCReceive />
	{/if}
</div>

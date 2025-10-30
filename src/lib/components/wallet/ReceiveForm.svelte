<script lang="ts">
	import { t } from 'svelte-i18n';
	import { allAssets, rskConnection } from '$lib/stores/wallet.store';
	import { appStore } from '$lib/stores/app.store';
	import { RSK_NETWORKS } from '$lib/utils/wallet/networkConfig';
	import { copyToClipboard } from '$lib/utils/helpers/clipboard';
	import generateQrCodeUrl from '$lib/utils/helpers/generateQrCodeUrl';
	import LightningReceive from '$lib/components/wallet/LightningReceive.svelte';
	import LBTCReceive from '$lib/components/wallet/LBTCReceive.svelte';

	const network: 'mainnet' | 'testnet' = import.meta.env.VITE_RSK_NETWORK || 'testnet';

	// Form state
	let selectedAsset = $state<'bitcoin' | 'usd'>('bitcoin');
	let selectedNetwork = $state<string>('lightning-bitcoin');
	let amount = $state('');
	let liquidDescription = $state('');
	let rskDescription = $state('');
	let errorMessage = $state<string | null>(null);
	let generatedAddress = $state<string | null>(null);
	let dropdownKey = $state(0);

	// Asset options (Bitcoin and USD)
	let assetOptions = $derived([
		{
			value: 'bitcoin',
			label: 'Bitcoin',
			description: 'Bitcoin and Bitcoin-based networks',
			icon: '/images/chains/Bitcoin.svg',
			disabled: false
		},
		{
			value: 'usd',
			label: 'USD',
			description: 'USD-pegged stablecoins',
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
					label: 'Lightning Bitcoin',
					description: 'Lightning Network payments',
					icon: null // Will use lightning icon
				},
				{
					value: 'rootstock-bitcoin',
					label: 'Rootstock Bitcoin',
					description: 'rBTC on Rootstock network',
					icon: '/images/chains/Bitcoin-Rootstock-logo.webp'
				},
				{
					value: 'liquid-bitcoin',
					label: 'Liquid Bitcoin',
					description: 'L-BTC on Liquid network (swap to rBTC)',
					icon: '/images/chains/Liquid-Bitcoin.svg'
				},
				{
					value: 'bitcoin',
					label: 'Bitcoin',
					description: 'Native Bitcoin network',
					icon: '/images/chains/Bitcoin.svg'
				}
			];
		} else {
			return [
				{
					value: 'liquid-usdt',
					label: 'Liquid USDT',
					description: 'USDT on Liquid network',
					icon: '/images/chains/Tether-USD.svg'
				}
			];
		}
	});

	// Get selected network info
	let selectedNetworkInfo = $derived(
		networkOptions().find((network) => network.value === selectedNetwork)
	);

	// Get current description based on selected network
	let description = $derived(
		selectedNetwork === 'liquid-bitcoin' || selectedNetwork === 'liquid-usdt'
			? liquidDescription
			: rskDescription
	);

	// Get RSK address from the unified wallet store
	let rskAddress = $derived($rskConnection.address);

	// Auto-select first available network when asset changes
	$effect(() => {
		const networks = networkOptions();
		if (networks.length > 0 && !networks.find((n) => n.value === selectedNetwork)) {
			selectedNetwork = networks[0].value;
		}
		// Reset form state when network changes
		generatedAddress = null;
		errorMessage = null;
	});

	function closeNetworkDropdown() {
		dropdownKey++;
	}

	async function copyAddress() {
		if (generatedAddress) {
			await copyToClipboard(generatedAddress);
			appStore.showSuccessToast($t('wallet.address_copied'));
		}
	}

	async function generateRSKQRCode() {
		if (!rskAddress) {
			appStore.showErrorToast('No RSK address available');
			return;
		}

		try {
			// Create EIP-681 URI format for RSK
			let uri = `ethereum:${rskAddress}`;
			const params = new URLSearchParams();

			if (amount) {
				params.append('value', (parseFloat(amount) * 1e18).toString()); // Convert to wei
			}
			if (description && description.trim()) {
				params.append('message', description.trim());
			}

			// Add chain ID for RSK
			const chainId = RSK_NETWORKS[network]?.chainId || 31;
			params.append('chainId', chainId.toString());

			if (params.toString()) {
				uri += `?${params.toString()}`;
			}

			const qrCodeDataUrl = await generateQrCodeUrl(uri);
			return qrCodeDataUrl;
		} catch (error) {
			console.error('Failed to generate QR code:', error);
			appStore.showErrorToast('Failed to generate QR code');
		}
	}

	let availableBalance = $derived(() => {
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
			<span class="label-text font-medium">Select Asset</span>
		</label>
		<div class="grid grid-cols-1 gap-3 md:grid-cols-2">
			{#each assetOptions as asset}
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
									<img src={asset.icon} alt="Asset icon" class="h-8 w-8" />
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
				<div class="font-bold">Coming Soon</div>
				<div class="text-sm">USDT receiving functionality is not yet available.</div>
			</div>
		</div>
	{/if}

	<!-- Network Selection -->
	{#if selectedAsset === 'bitcoin'}
		<div class="form-control">
			<label class="label" for="network-select">
				<span class="label-text font-medium">Select Network</span>
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
						{#each networkOptions() as network}
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
				<div class="font-bold">Coming Soon</div>
				<div class="text-sm">This network is not yet available for receiving.</div>
			</div>
		</div>
	{/if}

	<!-- Available Balance Display -->
	<div class="alert alert-outline bg-base-200 border-base-300">
		<svg
			xmlns="http://www.w3.org/2000/svg"
			fill="none"
			viewBox="0 0 24 24"
			class="text-base-content h-6 w-6 shrink-0 stroke-current"
		>
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				stroke-width="2"
				d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
			></path>
		</svg>
		<div>
			<div class="text-base-content font-bold">Available Balance</div>
			<div class="text-base-content/70 text-sm">
				{availableBalance()} rBTC
			</div>
		</div>
	</div>

	<!-- RSK Default Layout - show form and QR side by side by default -->
	{#if selectedNetwork === 'rootstock-bitcoin'}
		<div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
			<!-- Payment Request Form -->
			<div class="space-y-4">
				<h4 class="font-semibold">{$t('wallet.payment_request')}</h4>

				<!-- Amount Field for RSK -->
				<div class="form-control">
					<label class="label" for="rsk-amount">
						<span class="label-text">
							{$t('wallet.amount_rbtc')}
						</span>
						<span class="label-text-alt">{$t('wallet.optional')}</span>
					</label>
					<input
						id="rsk-amount"
						type="number"
						step="0.000001"
						placeholder="0.0"
						class="input input-bordered w-full"
						bind:value={amount}
						disabled={!$rskConnection.connected}
					/>
				</div>

				<!-- Description Field for RSK -->
				<div class="form-control">
					<label class="label" for="rsk-description">
						<span class="label-text">{$t('wallet.description')}</span>
						<span class="label-text-alt">{$t('wallet.optional')}</span>
					</label>
					<textarea
						id="rsk-description"
						placeholder={$t('wallet.payment_for_placeholder')}
						class="textarea textarea-bordered w-full"
						rows="3"
						bind:value={rskDescription}
						disabled={!$rskConnection.connected}
					></textarea>
				</div>

				{#if amount || description}
					<div class="bg-base-200 rounded-lg p-3">
						<div class="mb-2 text-sm font-semibold">{$t('wallet.payment_request_details')}</div>
						{#if amount}
							<div class="flex justify-between text-sm">
								<span>{$t('wallet.amount')}:</span>
								<span>{amount} rBTC</span>
							</div>
						{/if}
						{#if description}
							<div class="mt-2 text-sm">
								<span class="font-medium">{$t('wallet.description_label')}</span>
								<div class="mt-1 opacity-80">{description}</div>
							</div>
						{/if}
					</div>
				{/if}
			</div>

			<!-- QR Code Display or Testnet Alert -->
			<div class="flex flex-col items-center text-center">
				<h4 class="mb-4 font-semibold">{$t('wallet.receive_rbtc')}</h4>

				{#if network === 'testnet'}
					<!-- Abbreviated testnet warning shown instead of QR on testnet -->
					<div class="alert alert-outline alert-warning w-full max-w-sm">
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
								d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
							/>
						</svg>
						<div class="text-left">
							<div class="text-warning text-center font-bold">
								{$t('wallet.testnet_warning.title')}
							</div>
							<div class="text-sm">
								<strong>{$t('wallet.testnet_warning.do_not_send_real_assets')}</strong>
							</div>
							<div class="mt-2 text-xs">
								{$t('wallet.testnet_warning.faucet_instruction')}
								<a
									href="https://faucet.rootstock.io/"
									target="_blank"
									rel="noopener noreferrer"
									class="link link-primary font-semibold"
									>{$t('wallet.testnet_warning.faucet_link_text')}</a
								>
								&nbsp;{$t('wallet.testnet_warning.faucet_instruction_end')}
							</div>
						</div>
					</div>
				{:else if !$rskConnection.connected}
					<div
						class="bg-base-200 flex h-48 w-48 flex-col items-center justify-center gap-2 rounded-lg"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="text-warning h-8 w-8"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16c-.77.833.192 2.5 1.732 2.5z"
							/>
						</svg>
						<span class="text-warning text-center text-xs"
							>{$t('wallet.rsk_wallet_not_connected')}</span
						>
					</div>
				{:else}
					{#await generateRSKQRCode()}
						<div class="bg-base-200 flex h-48 w-48 items-center justify-center rounded-lg">
							<span class="loading loading-spinner loading-lg"></span>
						</div>
					{:then qrCodeDataUrl}
						<div class="rounded-lg bg-white p-2 shadow-lg">
							<img src={qrCodeDataUrl} alt="Payment QR Code" class="h-48 w-48" />
						</div>
					{/await}
				{/if}

				{#if rskAddress}
					<div class="mt-4 w-full">
						<div class="mb-1 text-xs opacity-70">{$t('wallet.address')}</div>
						<div class="relative">
							<button
								class="bg-base-300 hover:bg-base-100 w-full cursor-pointer rounded px-3 py-2 pr-10 text-left transition-colors"
								onclick={async () => {
									if (rskAddress) {
										await copyToClipboard(rskAddress);
										appStore.showSuccessToast($t('wallet.address_copied'));
									}
								}}
								disabled={!$rskConnection.connected || !rskAddress}
							>
								<code class="text-xs">
									{rskAddress}
								</code>
							</button>
							<div class="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 transform">
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="h-4 w-4 opacity-70"
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
							</div>
						</div>
					</div>
				{:else if $rskConnection.connected}
					<div class="mt-4 w-full">
						<div class="text-error text-center text-xs">
							{$t('wallet.no_rsk_address_available')}
						</div>
					</div>
				{/if}
			</div>
		</div>
	{/if}

	<!-- Lightning Bitcoin Payment Receiving Area -->
	{#if selectedNetwork === 'lightning-bitcoin'}
		<LightningReceive bind:amount bind:description={rskDescription} />
	{/if}

	<!-- L-BTC to RBTC Chain Swap Area -->
	{#if selectedNetwork === 'liquid-bitcoin'}
		<LBTCReceive bind:amount bind:description={rskDescription} />
	{/if}

	<!-- RSK Network Info -->
	{#if selectedNetwork === 'rootstock-bitcoin'}
		{@const network = (import.meta.env.VITE_RSK_NETWORK as 'mainnet' | 'testnet') || 'testnet'}
		<div class="alert alert-outline alert-info">
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
					d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
				/>
			</svg>
			<div>
				<div class="font-bold">Network: {RSK_NETWORKS[network].name}</div>
				<div class="text-sm">
					{$t('wallet.rsk_network_warning', {
						values: { currency: RSK_NETWORKS[network].currency.symbol }
					})}
				</div>
			</div>
		</div>
	{/if}
</div>

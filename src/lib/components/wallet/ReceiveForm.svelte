<script lang="ts">
	import { t } from 'svelte-i18n';
	import { allAssets, rskConnection } from '$lib/stores/wallet.store';
	import { appStore } from '$lib/stores/app.store';
	import { prepareReceivePayment, receivePayment } from '$lib/wallet/breez/walletService';
	import { getAssetId } from '$lib/utils/constants/assets';
	import { RSK_NETWORKS } from '$lib/utils/wallet/networkConfig';
	import { copyToClipboard } from '$lib/utils/helpers/clipboard';
	import generateQrCodeUrl from '$lib/utils/helpers/generateQrCodeUrl';

	const network = import.meta.env.VITE_RSK_NETWORK || 'testnet';

	// Form state
	let selectedAsset = $state<'bitcoin' | 'usd'>('bitcoin');
	let selectedNetwork = $state<string>('lightning-bitcoin');
	let rskPaymentMethod = $state<'rskAddress' | 'lightningBitcoin'>('lightningBitcoin');
	let amount = $state('');
	let liquidDescription = $state('');
	let rskDescription = $state('');
	let isLoading = $state(false);
	let errorMessage = $state<string | null>(null);
	let generatedAddress = $state<string | null>(null);
	let qrCodeDataUrl = $state<string | null>(null);
	let showQr = $state(false);
	let rskDropdownElement: HTMLElement;
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
					label: 'L2 BTC',
					description: 'rBTC on Rootstock network',
					icon: '/images/chains/Bitcoin-Rootstock-logo.webp'
				},
				{
					value: 'liquid-bitcoin',
					label: 'Liquid Bitcoin',
					description: 'L-BTC on Liquid network',
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
		networkOptions().find(network => network.value === selectedNetwork)
	);

	// Get current description based on selected network
	let description = $derived(
		selectedNetwork === 'liquid-bitcoin' || selectedNetwork === 'liquid-usdt' 
			? liquidDescription 
			: rskDescription
	);

	// Get RSK address from the unified wallet store
	let rskAddress = $derived($rskConnection.address);

	// Available assets based on selected network
	let availableAssets = $derived(() => {
		if (selectedAsset === 'bitcoin') {
			if (selectedNetwork === 'rootstock-bitcoin') {
				return $allAssets.filter(asset => asset.network === 'RSK');
			} else if (selectedNetwork === 'liquid-bitcoin') {
				return $allAssets.filter(asset => asset.network === 'Liquid' || asset.network === 'Bitcoin');
			} else if (selectedNetwork === 'lightning-bitcoin') {
				// For Lightning Bitcoin, show Rootstock balance since it will be swapped
				const rskAssets = $allAssets.filter(asset => asset.network === 'RSK');
				const lightningAsset = {
					assetId: 'lightning-bitcoin',
					name: 'Lightning Bitcoin',
					ticker: 'BTC',
					network: 'Lightning',
					balance: rskAssets.length > 0 ? rskAssets[0].balance : 0,
					formattedBalance: rskAssets.length > 0 ? rskAssets[0].formattedBalance : '0.00 BTC',
					icon: null
				};
				return [lightningAsset];
			} else if (selectedNetwork === 'bitcoin') {
				return $allAssets.filter(asset => asset.network === 'Bitcoin');
			}
		} else if (selectedAsset === 'usd') {
			return $allAssets.filter(asset => asset.network === 'Liquid' && asset.ticker === 'USDT');
		}
		return [];
	});

	// Currently selected asset details (for icon + label rendering)
	let selectedAssetDetails = $derived(availableAssets().find((a) => a.assetId === selectedAsset));

	// Auto-select first available network when asset changes
	$effect(() => {
		const networks = networkOptions();
		if (networks.length > 0 && !networks.find(n => n.value === selectedNetwork)) {
			selectedNetwork = networks[0].value;
		}
		// Reset form state when network changes
		generatedAddress = null;
		qrCodeDataUrl = null;
		errorMessage = null;
	});

	function closeNetworkDropdown() {
		dropdownKey++;
	}

	// Payment method options based on selected network (with optional icons)


	// RSK payment method options
	let rskPaymentMethodOptions = $derived([
		{
			label: 'Rootstock Bitcoin',
			value: 'rskAddress',
			description: 'Direct rBTC payments to your Rootstock address',
			icon: '/images/chains/Bitcoin-Rootstock-logo.webp'
		},
		{
			label: 'Lightning Bitcoin',
			value: 'lightningBitcoin',
			description: 'Lightning payments converted to Rootstock for escrow',
			icon: null
		}
	]);

	let selectedRskPaymentMethod = $derived(rskPaymentMethodOptions.find((m) => m.value === rskPaymentMethod));


	async function generatePaymentRequest() {
		if (selectedNetwork === 'rsk' && !rskAddress) {
			errorMessage = $t('wallet.rsk_not_connected');
			return;
		}

		isLoading = true;
		errorMessage = null;
		generatedAddress = null;
		qrCodeDataUrl = null;

		try {
			if (selectedNetwork === 'liquid') {
				await generateLiquidPaymentRequest();
			} else {
				await generateRskPaymentRequest();
			}

			// Generate QR code if we have an address
			if (generatedAddress) {
				qrCodeDataUrl = await generateQrCodeUrl(generatedAddress);
			}
		} catch (error) {
			console.error('Payment request generation error:', error);
			errorMessage = error instanceof Error ? error.message : $t('wallet.generation_failed');
		} finally {
			isLoading = false;
		}
	}

	async function generateLiquidPaymentRequest() {
		try {
			// Use default payment method based on network
			let paymentMethod = 'liquidAddress'; // Default for liquid networks
			
			// Prepare the request based on network
			let prepareRequest: any = { paymentMethod };

			// Add amount if specified and > 0
			if (amount && parseFloat(amount) > 0) {
				if (selectedAsset === 'usd') {
					// For USDT, use asset amount
					prepareRequest.amount = {
						type: 'asset',
						assetId: getAssetId('USDT'),
						payerAmount: parseFloat(amount) // Use the raw amount, not converted to sats
					};
				} else {
					// For BTC/L-BTC, use sats
					const amountSats = Math.floor(parseFloat(amount) * 100_000_000);
					prepareRequest.amount = {
						type: 'bitcoin',
						payerAmountSat: amountSats
					};
				}
			}

			const prepareResponse = await prepareReceivePayment(prepareRequest);

			const receiveResponse = await receivePayment({
				prepareResponse,
				description: description || `${paymentMethod} payment request`
			});

			generatedAddress = receiveResponse.destination;
		} catch (error) {
			console.error('Error generating liquid payment request:', error);
			throw error;
		}
	}

	async function generateRskPaymentRequest() {
		// For RSK, we just use the wallet address
		if (rskAddress) {
			generatedAddress = rskAddress;
		} else {
			throw new Error($t('wallet.rsk_address_not_available'));
		}
	}

	async function copyAddress() {
		if (generatedAddress) {
			await copyToClipboard(generatedAddress);
			appStore.showSuccessToast($t('wallet.address_copied'));
		}
	}

	function closeRskDropdown() {
		// Force re-render by incrementing the key
		dropdownKey++;
	}

	// Auto-generate QR code for RSK when network is selected or parameters change
	$effect(() => {
		if (selectedNetwork === 'rootstock-bitcoin' && rskAddress) {
			// Generate QR code for RSK address immediately
			(async () => {
				try {
					let uri;
					const params = new URLSearchParams();

					if (rskPaymentMethod === 'lightningBitcoin') {
						// For Lightning Bitcoin, we would generate a Lightning invoice
						// For now, show a placeholder message
						uri = 'lightning:placeholder-invoice';
					} else {
						// Create EIP-681 URI format for RSK
						uri = `ethereum:${rskAddress}`;

					// Only add amount if it's a valid number > 0
					if (amount && !isNaN(parseFloat(amount)) && parseFloat(amount) > 0) {
						params.append('value', (parseFloat(amount) * 1e18).toString()); // Convert to wei
					}

					// Only add description if it's not empty
					if (description && description.trim()) {
						params.append('label', description.trim());
					}

					// Add chain ID for RSK - get from network config
					const network = (import.meta.env.VITE_RSK_NETWORK as 'mainnet' | 'testnet') || 'testnet';
					const chainId = RSK_NETWORKS[network]?.chainId || 31;
					params.append('chainId', chainId.toString());

					if (params.toString()) {
						uri += `?${params.toString()}`;
						}
					}

					qrCodeDataUrl = await generateQrCodeUrl(uri);
				} catch (error) {
					console.error('Failed to generate RSK QR code:', error);
					qrCodeDataUrl = null;
				}
			})();
		} else if (selectedNetwork === 'liquid-bitcoin' || selectedNetwork === 'liquid-usdt') {
			// Clear QR code when switching to liquid
			qrCodeDataUrl = null;
		} else if (selectedNetwork === 'rootstock-bitcoin' && !rskAddress) {
			// Clear QR code if RSK network but no address
			qrCodeDataUrl = null;
		}
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
		<div class="grid grid-cols-1 md:grid-cols-2 gap-3">
			{#each assetOptions as asset}
				<label class="cursor-pointer">
					<input
						type="radio"
						bind:group={selectedAsset}
						value={asset.value}
						disabled={asset.disabled}
						class="sr-only"
					/>
					<div class="card {selectedAsset === asset.value ? 'border-primary border-2' : 'border border-base-300'} {asset.disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-primary/50'} transition-colors">
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
									<div class="w-4 h-4 rounded-full bg-primary flex items-center justify-center">
										<div class="w-2 h-2 rounded-full bg-white"></div>
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
			<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="stroke-current shrink-0 w-6 h-6">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
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
	{#if selectedNetwork === 'liquid-bitcoin' || selectedNetwork === 'bitcoin'}
		<div class="alert alert-outline alert-info">
			<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="stroke-current shrink-0 w-6 h-6">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
			</svg>
			<div>
				<div class="font-bold">Coming Soon</div>
				<div class="text-sm">This network is not yet available for receiving.</div>
			</div>
		</div>
	{/if}

	<!-- Available Balance Display -->
	{#if availableAssets().length > 0}
		{#if selectedNetwork === 'rootstock-bitcoin'}
			<div class="alert alert-outline bg-base-200 border-base-300">
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="stroke-current shrink-0 w-6 h-6 text-base-content">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
				</svg>
				<div>
					<div class="font-bold text-base-content">Available Balance</div>
					<div class="text-sm text-base-content/70">{availableAssets()[0]?.formattedBalance || '0.00'} rBTC</div>
				</div>
			</div>
		{:else if selectedNetwork === 'lightning-bitcoin'}
			<div class="alert alert-outline bg-base-200 border-base-300">
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="stroke-current shrink-0 w-6 h-6 text-base-content">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
				</svg>
				<div>
					<div class="font-bold text-base-content">Available Balance</div>
					<div class="text-sm text-base-content/70">{availableAssets()[0]?.formattedBalance || '0.00'} rBTC</div>
				</div>
			</div>
		{:else}
			<div class="alert alert-outline bg-base-200 border-base-300">
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="stroke-current shrink-0 w-6 h-6 text-base-content">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
				</svg>
				<div>
					<div class="font-bold text-base-content">Available Balance</div>
					<div class="text-sm text-base-content/70">{availableAssets()[0]?.formattedBalance || '0.00'}</div>
				</div>
			</div>
		{/if}
	{/if}


	<!-- Asset Selection (for Liquid only) -->
	{#if (selectedNetwork === 'liquid-bitcoin' || selectedNetwork === 'liquid-usdt') && availableAssets().length > 0}
		{#if network !== 'testnet'}
		<div class="form-control">
			<label class="label" for="asset-select">
				<span class="label-text font-medium">{$t('wallet.select_asset')}</span>
			</label>
			<div class="dropdown dropdown-bottom w-full">
				<!-- Custom dropdown to allow icons inside options -->
				<div class="dropdown dropdown-bottom w-full">
					<div tabindex="0" role="button" class="btn btn-outline w-full justify-between">
						<div class="flex items-center gap-2">
							{#if selectedAssetDetails?.icon && selectedAssetDetails.icon.startsWith('/')}
								<img
									src={selectedAssetDetails.icon}
									alt={selectedAssetDetails.ticker}
									class="h-5 w-5"
								/>
							{:else}
								<span class="text-lg">{selectedAssetDetails?.icon}</span>
							{/if}
							<span class="font-medium">{selectedAssetDetails?.ticker}</span>
							<span class="opacity-70">- {selectedAssetDetails?.name}</span>
						</div>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-4 w-4 opacity-70"
							viewBox="0 0 20 20"
							fill="currentColor"
							><path
								fill-rule="evenodd"
								d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.25a.75.75 0 01-1.06 0L5.25 8.29a.75.75 0 01-.02-1.08z"
								clip-rule="evenodd"
							/></svg
						>
					</div>
					<ul
						class="dropdown-content menu bg-base-100 rounded-box max-h-64 w-full overflow-auto p-2 shadow"
					>
						{#each availableAssets() as asset}
							<li>
								<button
									class="flex items-center gap-2"
									onclick={() => {
										selectedAsset = asset.assetId as typeof selectedAsset;
									}}
								>
									{#if asset.icon && asset.icon.startsWith('/')}
										<img src={asset.icon} alt={asset.ticker} class="h-5 w-5" />
									{:else}
										<span class="text-lg">{asset.icon}</span>
									{/if}
									<span class="font-medium">{asset.ticker}</span>
									<span class="opacity-70">- {asset.name}</span>
								</button>
							</li>
						{/each}
					</ul>
				</div>
			</div>
		</div>
		{/if}
	{/if}

	<!-- Amount (optional) - Only for Liquid -->
	{#if selectedNetwork === 'liquid-bitcoin' || selectedNetwork === 'liquid-usdt'}
		{#if network !== 'testnet'}
		<div class="form-control">
			<label class="label" for="amount">
				<span class="label-text font-medium">
					{$t('common.components.wallet.payment_request_form.amount')} ({availableAssets().find(
						(a) => a.assetId === selectedAsset
					)?.ticker || ''})
				</span>
				<span class="label-text-alt">
					{$t('wallet.amount_optional')}
				</span>
			</label>
			<input
				id="amount"
				bind:value={amount}
				type="number"
				step="any"
				min="0"
				placeholder={$t(
					'common.components.wallet.payment_request_form.amount_optional_placeholder'
				)}
				class="input input-bordered w-full"
				disabled={isLoading}
			/>
		</div>
		{/if}
	{/if}

	<!-- Description - Only for Liquid -->
	{#if selectedNetwork === 'liquid-bitcoin' || selectedNetwork === 'liquid-usdt'}
		{#if network !== 'testnet'}
		<div class="form-control">
			<label class="label" for="description">
				<span class="label-text font-medium"
					>{$t('common.components.wallet.payment_request_form.description_label')}</span
				>
			</label>
			<input
				id="description"
				bind:value={liquidDescription}
				placeholder={$t('common.components.wallet.payment_request_form.description_placeholder')}
				class="input input-bordered w-full"
				disabled={isLoading}
			/>
			</div>
		{/if}
	{/if}


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
							{rskPaymentMethod === 'lightningBitcoin' ? 'Amount (BTC)' : $t('wallet.amount_rbtc')}
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
								<span>{amount} {rskPaymentMethod === 'lightningBitcoin' ? 'BTC' : 'rBTC'}</span>
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
							<div class="font-bold text-warning text-center">{$t('wallet.testnet_warning.title')}</div>
							<div class="text-sm"><strong>{$t('wallet.testnet_warning.do_not_send_real_assets')}</strong></div>
							{#if rskPaymentMethod === 'lightningBitcoin'}
								<div class="mt-2 text-xs">
									<strong>Lightning Bitcoin Note:</strong> Lightning payments will be converted to Rootstock for our escrow system.
								</div>
							{/if}
							<div class="mt-2 text-xs">
								{$t('wallet.testnet_warning.faucet_instruction')}
								<a href="https://faucet.rootstock.io/" target="_blank" rel="noopener noreferrer" class="link link-primary font-semibold">{$t('wallet.testnet_warning.faucet_link_text')}</a>
								&nbsp;{$t('wallet.testnet_warning.faucet_instruction_end')}
							</div>
						</div>
					</div>
				{:else if qrCodeDataUrl}
					<div class="rounded-lg bg-white p-4 shadow-lg">
						<img src={qrCodeDataUrl} alt="Payment QR Code" class="h-48 w-48" />
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
					<div class="bg-base-200 flex h-48 w-48 items-center justify-center rounded-lg">
						<span class="loading loading-spinner loading-lg"></span>
					</div>
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
							<div class="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none">
								<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
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

	<!-- Generate Button (only for liquid) -->
	{#if selectedNetwork === 'liquid-bitcoin' || selectedNetwork === 'liquid-usdt'}
		{#if network !== 'testnet'}
		<button class="btn btn-primary w-full" onclick={generatePaymentRequest} disabled={isLoading}>
			{#if isLoading}
				<span class="loading loading-spinner loading-sm"></span>
				{$t('wallet.generating')}
			{:else}
				{$t('wallet.generate_address')}
			{/if}
		</button>
		{/if}
	{/if}

	<!-- Generated Address/Invoice -->
	{#if generatedAddress}
		{#if selectedNetwork === 'liquid' && network === 'testnet'}
			<!-- Coming Soon message for generated address on testnet -->
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
					<div class="font-bold">Coming Soon</div>
					<div class="text-sm">Liquid Network features are not available on testnet.</div>
				</div>
			</div>
		{:else}
		<div class="space-y-4">
			<div class="flex flex-col items-center justify-center gap-4 sm:flex-row">
				<div class="w-full space-y-4 sm:w-1/2">
					<!-- Payment Details -->
					<div class="bg-base-200 rounded-lg p-4">
						<div class="grid grid-cols-1 gap-3">
							<div class="flex items-center justify-between">
								<span class="text-base-content/70 font-medium">{$t('wallet.method')}</span>
								<span class="font-bold">
									{selectedNetwork === 'liquid-bitcoin' || selectedNetwork === 'liquid-usdt'
										? 'Liquid Address'
										: $t('wallet.rsk_address')}
								</span>
							</div>

							{#if amount}
								<div class="flex items-center justify-between">
									<span class="text-base-content/70 font-medium">{$t('wallet.amount')}</span>
									<span class="text-success font-bold">
										{amount}
									{availableAssets().find((a: any) => a.assetId === selectedAsset)?.ticker ||
										selectedAsset}
									</span>
								</div>
							{:else}
								<div class="flex items-center justify-between">
									<span class="text-base-content/70 font-medium">{$t('wallet.amount')}</span>
									<span class="text-primary font-bold">{$t('wallet.any_amount_accepted')}</span>
								</div>
							{/if}

							{#if description}
								<div class="flex items-start justify-between">
									<span class="text-base-content/70 font-medium"
										>{$t('common.components.wallet.payment_request_form.description_label')}</span
									>
									<span class="max-w-48 text-right text-sm break-words">{description}</span>
								</div>
							{/if}
						</div>
					</div>

					<!-- Address Display -->
					<div class="space-y-2">
						<div class="text-base-content/70 font-medium">
							{selectedNetwork === 'liquid' ? $t('wallet.address') : $t('wallet.rsk_address')}
						</div>
						<button
							class="bg-base-200 hover:bg-base-100 border-base-300 group w-full rounded-lg border px-4 py-3 text-left transition-colors duration-200"
							title={$t('wallet.click_to_copy')}
							onclick={copyAddress}
						>
							<pre
								class="group-hover:text-primary text-xs break-all whitespace-pre-wrap transition-colors">{generatedAddress}</pre>
						</button>
						<p class="text-base-content/50 text-center text-xs">
							{$t('wallet.click_to_copy')}
						</p>
					</div>
				</div>

				<!-- QR Code -->
				{#if qrCodeDataUrl}
					<div class="w-full flex-shrink-0 text-center sm:w-1/2">
						<div class="mx-auto flex w-fit justify-center rounded-lg bg-white p-4 shadow-lg">
							<img
								src={qrCodeDataUrl}
								alt="Payment QR Code"
								class="h-full max-h-48 w-full max-w-48 lg:max-h-64 lg:max-w-64"
							/>
						</div>
					</div>
				{/if}
			</div>

			<!-- Actions -->
			<div class="flex gap-3 pt-4">
				<button
					class="btn btn-outline border-primary text-primary hover:bg-primary flex-1 hover:text-white"
					onclick={() => {
						generatedAddress = null;
						qrCodeDataUrl = null;
						amount = '';
						liquidDescription = '';
						rskDescription = '';
						errorMessage = null;
					}}
				>
					{$t('wallet.generate_new')}
				</button>
				<button class="btn btn-primary flex-1" onclick={copyAddress}>
					{$t('wallet.copy_address')}
				</button>
			</div>
		</div>
		{/if}
	{/if}

	<!-- Lightning Bitcoin Payment Receiving Area -->
	{#if selectedNetwork === 'lightning-bitcoin'}
		<div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
			<!-- Payment Request Form -->
			<div class="space-y-4">
				<h4 class="font-semibold">{$t('wallet.payment_request')}</h4>

				<!-- Amount Field for Lightning Bitcoin -->
				<div class="form-control">
					<label class="label" for="lightning-amount">
						<span class="label-text">Amount (BTC)</span>
						<span class="label-text-alt">{$t('wallet.optional')}</span>
					</label>
					<input
						id="lightning-amount"
						type="number"
						step="0.00000001"
						placeholder="0.00"
						class="input input-bordered w-full"
						bind:value={amount}
						disabled={!$rskConnection.connected}
					/>
				</div>

				<!-- Description Field for Lightning Bitcoin -->
				<div class="form-control">
					<label class="label" for="lightning-description">
						<span class="label-text">{$t('wallet.description')}</span>
						<span class="label-text-alt">{$t('wallet.optional')}</span>
					</label>
					<textarea
						id="lightning-description"
						placeholder={$t('wallet.payment_for_placeholder')}
						class="textarea textarea-bordered w-full"
						rows="3"
						bind:value={rskDescription}
						disabled={!$rskConnection.connected}
					></textarea>
				</div>

				{#if amount || description}
					<div class="alert alert-outline alert-info">
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="stroke-current shrink-0 w-6 h-6">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
						</svg>
						<div>
							<div class="font-bold">Payment Request Details</div>
							<div class="text-sm">
								{#if amount}
									<div><strong>Amount:</strong> {amount} BTC</div>
								{/if}
								{#if description}
									<div><strong>Description:</strong> {description}</div>
								{/if}
							</div>
						</div>
					</div>
				{/if}
			</div>

			<!-- Lightning Bitcoin Section -->
			<div class="space-y-4">
				<h4 class="font-semibold text-center">Receive Lightning</h4>

				<!-- Testnet Warning for Lightning Bitcoin -->
				{#if network === 'testnet'}
					<div class="alert alert-outline alert-warning">
						<svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
						</svg>
						<div class="text-left">
							<div class="font-bold text-warning text-center">{$t('wallet.testnet_warning.title')}</div>
							<div class="text-sm"><strong>{$t('wallet.testnet_warning.do_not_send_real_assets')}</strong></div>
							<div class="mt-2 text-xs">
								<strong>Lightning Bitcoin Note:</strong> Lightning payments will be converted to Rootstock for our escrow system.
							</div>
							<div class="mt-2 text-xs">
								{$t('wallet.testnet_warning.faucet_instruction')}
								<a href="https://faucet.rootstock.io/" target="_blank" rel="noopener noreferrer" class="link link-primary font-semibold">{$t('wallet.testnet_warning.faucet_link_text')}</a>
								&nbsp;{$t('wallet.testnet_warning.faucet_instruction_end')}
							</div>
						</div>
					</div>
				{/if}

				{#if rskAddress}
					<div class="mt-4 w-full">
						<div class="mb-1 text-xs opacity-70 text-center">{$t('wallet.address')}</div>
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
							<div class="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none">
								<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
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

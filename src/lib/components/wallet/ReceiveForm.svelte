<script lang="ts">
	import { t } from 'svelte-i18n';
	import type { WalletAsset } from '$lib/stores/wallet.store';
	import { allAssets, liquidConnection, rskConnection } from '$lib/stores/wallet.store';
	import { appStore } from '$lib/stores/app.store';
	import { copyToClipboard } from '$lib/utils/helpers/clipboard';
	import generateQrCodeUrl from '$lib/utils/helpers/generateQrCodeUrl';
	import { prepareReceivePayment, receivePayment } from '$lib/wallet/breez/walletService';
	import { getAssetId } from '$lib/utils/constants/assets';
	import { RSK_NETWORKS } from '$lib/utils/wallet/escrowContract';

	// Form state
	let selectedNetwork = $state<'liquid' | 'rsk'>('liquid');
	let selectedAsset = $state<string>('L-BTC');
	let paymentMethod = $state<'liquidAddress' | 'bolt11Invoice' | 'bitcoinAddress' | 'bolt12Offer' | 'rskAddress'>('liquidAddress');
	let amount = $state('');
	let liquidDescription = $state('');
	let rskDescription = $state('');
	let isLoading = $state(false);
	let errorMessage = $state<string | null>(null);
	let generatedAddress = $state<string | null>(null);
	let qrCodeDataUrl = $state<string | null>(null);
	let showQr = $state(false);

	// Get current description based on selected network
	let description = $derived(selectedNetwork === 'liquid' ? liquidDescription : rskDescription);

	// Get RSK address from the unified wallet store
	let rskAddress = $derived($rskConnection.address);

	// Available assets based on selected network
	let availableAssets = $derived(
		$allAssets.filter(asset => {
			if (selectedNetwork === 'liquid') {
				return asset.network === 'Liquid' || asset.network === 'Bitcoin';
			} else {
				return asset.network === 'RSK';
			}
		})
	);

	// Currently selected asset details (for icon + label rendering)
	let selectedAssetDetails = $derived(availableAssets.find(a => a.assetId === selectedAsset));

	// Auto-select first available asset when network changes and reset state
	$effect(() => {
		// Reset form state when network changes
		generatedAddress = null;
		qrCodeDataUrl = null;
		errorMessage = null;
		
		if (selectedNetwork === 'liquid') {
			if (availableAssets.length > 0 && !availableAssets.find((a: WalletAsset) => a.assetId === selectedAsset)) {
				selectedAsset = availableAssets[0]?.assetId || 'L-BTC';
			}
			// Reset to first available payment method for liquid
			if (paymentMethodOptions.length > 0) {
				paymentMethod = paymentMethodOptions[0].value as typeof paymentMethod;
			}
		} else {
			selectedAsset = 'rbtc';
			paymentMethod = 'rskAddress';
		}
	});

	// Network options - reactive to locale changes
	let networkOptions = $derived([
		{
			value: 'liquid',
			label: $t('wallet.liquid_network'),
			description: $t('wallet.liquid_network_description'),
			icon: '/images/chains/Liquid-Bitcoin.svg',
			disabled: !$liquidConnection.connected
		},
		{
			value: 'rsk',
			label: $t('wallet.rootstock_network'),
			description: $t('wallet.rootstock_network_description'),
			icon: '/images/chains/Bitcoin-Rootstock-logo.webp',
			disabled: !$rskConnection.connected
		}
	]);

	// Payment method options based on selected network (with optional icons)
	let paymentMethodOptions = $derived(selectedNetwork === 'liquid' ? [
		{
			label: $t('common.components.wallet.payment_request_form.liquid_address'),
			value: 'liquidAddress',
			description: $t('wallet.liquid_address_desc'),
			icon: '/images/chains/Liquid-Bitcoin.svg'
		},
		{
			label: $t('common.components.wallet.payment_request_form.lightning_invoice'),
			value: 'bolt11Invoice',
			description: $t('wallet.lightning_desc'),
			icon: null
		},
		{
			label: $t('common.components.wallet.payment_request_form.bitcoin_address'),
			value: 'bitcoinAddress',
			description: $t('wallet.bitcoin_desc'),
			icon: null
		},
		{
			label: $t('common.components.wallet.payment_request_form.bolt12_offer'),
			value: 'bolt12Offer',
			description: $t('wallet.bolt12_desc'),
			icon: null
		}
	] : [
		{
			label: $t('wallet.rsk_address'),
			value: 'rskAddress',
			description: $t('wallet.rsk_address_desc'),
			icon: '/images/chains/Bitcoin-Rootstock-logo.webp'
		}
	]);

	let selectedPaymentMethod = $derived(paymentMethodOptions.find(m => m.value === paymentMethod));

	// Auto-select first payment method when network changes
	$effect(() => {
		if (paymentMethodOptions.length > 0) {
			paymentMethod = paymentMethodOptions[0].value as typeof paymentMethod;
		}
	});

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
			// Prepare the request based on payment method and asset selection
			let prepareRequest: any = { paymentMethod };

			// Add amount if specified and > 0, but NEVER for BOLT12 offers
			if (amount && parseFloat(amount) > 0 && paymentMethod !== 'bolt12Offer') {
				if (selectedAsset === 'USDt' && paymentMethod === 'liquidAddress') {
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

	function toggleQr() {
		showQr = !showQr;
	}

	// Auto-generate QR code for RSK when network is selected or parameters change
	$effect(() => {
		if (selectedNetwork === 'rsk' && rskAddress) {
			// Generate QR code for RSK address immediately
			(async () => {
				try {
					// Create EIP-681 URI format for RSK
					let uri = `ethereum:${rskAddress}`;
					const params = new URLSearchParams();

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

					qrCodeDataUrl = await generateQrCodeUrl(uri);
				} catch (error) {
					console.error('Failed to generate RSK QR code:', error);
					qrCodeDataUrl = null;
				}
			})();
		} else if (selectedNetwork === 'liquid') {
			// Clear QR code when switching to liquid
			qrCodeDataUrl = null;
		} else if (selectedNetwork === 'rsk' && !rskAddress) {
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

	<!-- Network Selection -->
	<div class="form-control">
		<label class="label" for="network-select">
			<span class="label-text font-medium">{$t('wallet.select_network')}</span>
		</label>
		<div class="grid grid-cols-1 md:grid-cols-2 gap-3">
			{#each networkOptions as network}
				<label class="cursor-pointer">
					<input
						type="radio"
						bind:group={selectedNetwork}
						value={network.value}
						disabled={network.disabled}
						class="sr-only"
					/>
					<div class="card {selectedNetwork === network.value ? 'border-primary border-2' : 'border border-base-300'} {network.disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-primary/50'} transition-colors">
						<div class="card-body p-4">
							<div class="flex items-center gap-3">
								{#if network.icon.startsWith('/')}
									<img src={network.icon} alt="Network icon" class="h-8 w-8" />
								{:else}
									<span class="text-2xl">{network.icon}</span>
								{/if}
								<div class="flex-1">
									<div class="font-semibold">{network.label}</div>
									<div class="text-sm opacity-70">{network.description}</div>
								</div>
								{#if selectedNetwork === network.value}
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

	<!-- Payment Method Selection (for Liquid only) -->
	{#if selectedNetwork === 'liquid'}
		<div class="form-control">
			<label class="label" for="payment-method">
				<span class="label-text font-medium">{$t('common.components.wallet.payment_request_form.payment_method')}</span>
			</label>
			<div class="dropdown dropdown-bottom w-full">
				<div tabindex="0" role="button" class="btn btn-outline justify-between w-full">
					<div class="flex items-center gap-2">
						{#if selectedPaymentMethod?.icon}
							<img src={selectedPaymentMethod.icon} alt={selectedPaymentMethod.label} class="h-5 w-5" />
						{/if}
						<span class="font-medium">{selectedPaymentMethod?.label}</span>
					</div>
					<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 opacity-70" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.25a.75.75 0 01-1.06 0L5.25 8.29a.75.75 0 01-.02-1.08z" clip-rule="evenodd"/></svg>
				</div>
				<ul tabindex="0" class="dropdown-content menu p-2 shadow bg-base-100 rounded-box w-full">
					{#each paymentMethodOptions as method}
						<li>
							<button class="flex items-center gap-2 w-full justify-start" onclick={() => { paymentMethod = method.value; }}>
								{#if method.icon}
									<img src={method.icon} alt={method.label} class="h-5 w-5" />
								{/if}
								<span class="font-medium">{method.label}</span>
							</button>
						</li>
					{/each}
				</ul>
			</div>
			{#if selectedPaymentMethod?.description}
				<div class="label">
					<span class="label-text-alt">{selectedPaymentMethod.description}</span>
				</div>
			{/if}
		</div>
	{/if}

	<!-- Asset Selection (for Liquid only) -->
	{#if selectedNetwork === 'liquid' && availableAssets.length > 0}
		<div class="form-control">
			<label class="label" for="asset-select">
				<span class="label-text font-medium">{$t('wallet.select_asset')}</span>
			</label>
			<div class="dropdown dropdown-bottom w-full">
			<!-- Custom dropdown to allow icons inside options -->
			<div class="dropdown dropdown-bottom w-full">
				<div tabindex="0" role="button" class="btn btn-outline justify-between w-full">
					<div class="flex items-center gap-2">
						{#if selectedAssetDetails?.icon && selectedAssetDetails.icon.startsWith('/')}
							<img src={selectedAssetDetails.icon} alt={selectedAssetDetails.ticker} class="h-5 w-5" />
						{:else}
							<span class="text-lg">{selectedAssetDetails?.icon}</span>
						{/if}
						<span class="font-medium">{selectedAssetDetails?.ticker}</span>
						<span class="opacity-70">- {selectedAssetDetails?.name}</span>
					</div>
					<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 opacity-70" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.25a.75.75 0 01-1.06 0L5.25 8.29a.75.75 0 01-.02-1.08z" clip-rule="evenodd"/></svg>
				</div>
				<ul tabindex="0" class="dropdown-content menu p-2 shadow bg-base-100 rounded-box w-full max-h-64 overflow-auto">
					{#each availableAssets as asset}
						<li>
							<button class="flex items-center gap-2" onclick={() => { selectedAsset = asset.assetId; }}>
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

	<!-- Amount (optional) - Only for Liquid -->
	{#if selectedNetwork === 'liquid' && paymentMethod !== 'bolt12Offer'}
		<div class="form-control">
			<label class="label" for="amount">
				<span class="label-text font-medium">
					{$t('common.components.wallet.payment_request_form.amount')} ({availableAssets.find(a => a.assetId === selectedAsset)?.ticker || ''})
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
				placeholder={$t('common.components.wallet.payment_request_form.amount_optional_placeholder')}
				class="input input-bordered w-full"
				disabled={isLoading}
			/>
		</div>
	{/if}

	<!-- Description - Only for Liquid -->
	{#if selectedNetwork === 'liquid'}
		<div class="form-control">
			<label class="label" for="description">
				<span class="label-text font-medium">{$t('common.components.wallet.payment_request_form.description_label')}</span>
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

	<!-- RSK Default Layout - show form and QR side by side by default -->
	{#if selectedNetwork === 'rsk'}
		<div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
			<!-- Payment Request Form -->
			<div class="space-y-4">
				<h4 class="font-semibold">{$t('wallet.payment_request')}</h4>
				
				<!-- Amount Field for RSK -->
				<div class="form-control">
					<label class="label" for="rsk-amount">
						<span class="label-text">{$t('wallet.amount_rbtc')}</span>
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
						<div class="text-sm font-semibold mb-2">{$t('wallet.payment_request_details')}</div>
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

			<!-- QR Code Display -->
			<div class="flex flex-col items-center text-center">
				<h4 class="font-semibold mb-4">{$t('wallet.receive_rbtc')}</h4>
				
				{#if qrCodeDataUrl}
					<div class="bg-white p-4 rounded-lg shadow-lg">
						<img src={qrCodeDataUrl} alt="Payment QR Code" class="w-48 h-48" />
					</div>
				{:else if !$rskConnection.connected}
					<div class="bg-base-200 flex h-48 w-48 items-center justify-center rounded-lg flex-col gap-2">
						<svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 text-warning" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16c-.77.833.192 2.5 1.732 2.5z" />
						</svg>
						<span class="text-xs text-center text-warning">{$t('wallet.rsk_wallet_not_connected')}</span>
					</div>
				{:else}
					<div class="bg-base-200 flex h-48 w-48 items-center justify-center rounded-lg">
						<span class="loading loading-spinner loading-lg"></span>
					</div>
				{/if}

				{#if rskAddress}
					<div class="mt-4 w-full">
						<div class="text-xs opacity-70 mb-2">{$t('wallet.your_rsk_address')}</div>
						<div class="bg-base-200 rounded-lg p-3 font-mono text-xs break-all">
							{rskAddress}
						</div>
						<div class="mt-3 flex justify-center gap-2">
							<button 
								class="btn btn-outline btn-sm"
								onclick={async () => {
									if (rskAddress) {
										await copyToClipboard(rskAddress);
										appStore.showSuccessToast('Address copied to clipboard');
									}
								}}
							>
								{$t('wallet.copy_address')}
							</button>
						</div>
					</div>
				{:else if $rskConnection.connected}
					<div class="mt-4 w-full">
						<div class="text-xs text-center text-error">{$t('wallet.no_rsk_address_available')}</div>
					</div>
				{/if}
			</div>
		</div>
	{/if}

	<!-- Generate Button (only for liquid) -->
	{#if selectedNetwork === 'liquid'}
		<button
			class="btn btn-primary w-full"
			onclick={generatePaymentRequest}
			disabled={isLoading}
		>
			{#if isLoading}
				<span class="loading loading-spinner loading-sm"></span>
				{$t('wallet.generating')}
			{:else}
				{$t('wallet.generate_address')}
			{/if}
		</button>
	{/if}

	<!-- Generated Address/Invoice -->
	{#if generatedAddress}
		<div class="space-y-4">
			<div class="flex flex-col items-center justify-center gap-4 sm:flex-row">
				<div class="w-full space-y-4 sm:w-1/2">
					<!-- Payment Details -->
					<div class="bg-base-200 rounded-lg p-4">
						<div class="grid grid-cols-1 gap-3">
							<div class="flex items-center justify-between">
								<span class="text-base-content/70 font-medium">{$t('wallet.method')}</span>
								<span class="font-bold">
									{selectedNetwork === 'liquid' 
										? paymentMethodOptions.find(m => m.value === paymentMethod)?.label 
										: $t('wallet.rsk_address')}
								</span>
							</div>

							{#if amount}
								<div class="flex items-center justify-between">
									<span class="text-base-content/70 font-medium">{$t('wallet.amount')}</span>
									<span class="text-success font-bold">
										{amount} {availableAssets.find(a => a.assetId === selectedAsset)?.ticker || selectedAsset}
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
									<span class="text-base-content/70 font-medium">{$t('common.components.wallet.payment_request_form.description_label')}</span>
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
							<pre class="text-xs break-all whitespace-pre-wrap transition-colors group-hover:text-primary">{generatedAddress}</pre>
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
					class="btn btn-outline flex-1 border-primary text-primary hover:bg-primary hover:text-white"
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
				<button
					class="btn btn-primary flex-1"
					onclick={copyAddress}
				>
					{$t('wallet.copy_address')}
				</button>
			</div>
		</div>
	{/if}

	<!-- RSK Network Info -->
	{#if selectedNetwork === 'rsk'}
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
					{$t('wallet.rsk_network_warning', { currency: RSK_NETWORKS[network].currency.symbol })}
				</div>
			</div>
		</div>
	{/if}
</div>


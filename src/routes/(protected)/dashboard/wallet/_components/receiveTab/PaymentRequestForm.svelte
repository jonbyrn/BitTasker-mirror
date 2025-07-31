<script lang="ts">
	import { onMount } from 'svelte';
	import {
		fetchLightningLimits,
		fetchOnchainLimits,
		receivePayment,
		prepareReceivePayment
	} from '$lib/wallet/breez/walletService';
	import {
		getSupportedAssets,
		getCurrentNetwork,
		getAssetId,
		type AssetMetadata
	} from '$lib/constants/assets';
	import { appStore } from '$lib/stores/app.store';
	import Input from '$lib/components/Input.svelte';

	// Payment method types supported by Breez SDK
	type PaymentMethod = 'liquidAddress' | 'bolt11Invoice' | 'bitcoinAddress' | 'bolt12Offer';

	// Asset types for receiving
	type AssetType = 'L-BTC' | 'USDt' | 'any';

	// State management
	let amount = $state(0);
	let description = $state('');
	let tokenType = $state('sats');
	let paymentMethod = $state<PaymentMethod>('liquidAddress');
	let selectedAsset = $state<AssetType>('any');
	let requireAmount = $state(false);
	let lightningLimits = $state({ min: 1, max: 21000000 * 100_000_000 });
	let onchainLimits = $state({ min: 1, max: 21000000 * 100_000_000 });
	let isLoading = $state(false);
	let errorMessage = $state<string | null>(null);
	let feeSats = $state(0);
	let address = $state<string | null>(null);
	let supportedAssets = $state<AssetMetadata[]>([]);
	let currentNetwork = getCurrentNetwork();

	const paymentMethodOptions = [
		{ label: '🌊 Liquid Address (Recommended)', value: 'liquidAddress' },
		{ label: '⚡ Lightning Invoice', value: 'bolt11Invoice' },
		{ label: '₿ Bitcoin Address', value: 'bitcoinAddress' },
		{ label: '🔄 BOLT12 Offer', value: 'bolt12Offer' }
	];

	const assetTypeOptions = [
		{ label: '🎯 Any Asset (Universal)', value: 'any' },
		{ label: '₿ L-BTC (Liquid Bitcoin)', value: 'L-BTC' },
		{ label: '💵 USDt (Tether USD)', value: 'USDt' }
	];

	// Update amount requirement and limits when payment method changes
	$effect(() => {
		requireAmount = paymentMethod === 'bolt11Invoice' || paymentMethod === 'bitcoinAddress';
	});

	onMount(async () => {
		try {
			isLoading = true;

			// Load supported assets for current network
			supportedAssets = getSupportedAssets(currentNetwork);

			// Fetch both Lightning and onchain limits
			const [lightningResponse, onchainResponse] = await Promise.all([
				fetchLightningLimits(),
				fetchOnchainLimits()
			]);

			lightningLimits = {
				min: lightningResponse.receive.minSat,
				max: lightningResponse.receive.maxSat
			};

			onchainLimits = {
				min: onchainResponse.receive.minSat,
				max: onchainResponse.receive.maxSat
			};
		} catch (error) {
			console.error('Error initializing receive form:', error);
			errorMessage = 'Failed to load payment options. Please try again.';
		} finally {
			isLoading = false;
		}
	});

	function convertBtcToSats(amount: number) {
		return Math.floor(amount * 100_000_000);
	}

	function getCurrentLimits() {
		return paymentMethod === 'bitcoinAddress' ? onchainLimits : lightningLimits;
	}

	function validateInputs() {
		// If amount is not required and not provided, that's valid
		if (!requireAmount && (!amount || amount === 0)) {
			errorMessage = null;
			return 0; // 0 means no amount specified
		}

		let amountSats = 0;
		if (tokenType === 'BTC') {
			amountSats = convertBtcToSats(amount);
		} else {
			amountSats = amount;
		}

		const limits = getCurrentLimits();

		switch (true) {
			case requireAmount && (isNaN(amountSats) || amountSats <= 0):
				errorMessage = `Amount is required for ${getMethodDisplayName()}`;
				return null;
			case amountSats > 0 && amountSats < limits.min:
				errorMessage = `Amount must be at least ${formatSats(limits.min)} sats`;
				return null;
			case amountSats > limits.max:
				errorMessage = `Amount must be no more than ${formatSats(limits.max)} sats`;
				return null;
			default:
				errorMessage = null;
				return amountSats;
		}
	}

	function formatSats(sats: number): string {
		return new Intl.NumberFormat('en-US').format(sats);
	}

	function getMethodDisplayName(): string {
		switch (paymentMethod) {
			case 'liquidAddress':
				return 'Liquid Address';
			case 'bolt11Invoice':
				return 'Lightning Invoice';
			case 'bitcoinAddress':
				return 'Bitcoin Address';
			case 'bolt12Offer':
				return 'BOLT12 Offer';
			default:
				return 'Address';
		}
	}

		function getMethodDescription(): string {
		switch (paymentMethod) {
			case 'liquidAddress': 
				return 'Universal address for L-BTC, USDT, and other Liquid assets. No amount required.';
			case 'bolt11Invoice': 
				return 'Instant Lightning payment. Amount required, expires after use.';
			case 'bitcoinAddress': 
				return 'On-chain Bitcoin payment. Higher fees, slower confirmation.';
			case 'bolt12Offer': 
				return 'Reusable Lightning offer. Accepts any amount, ignores amount input.';
			default: 
				return '';
		}
	}

	function getAssetDescription(): string {
		switch (selectedAsset) {
			case 'any':
				return 'Accept any supported asset (L-BTC, USDT, etc.)';
			case 'L-BTC':
				return 'Liquid Bitcoin only';
			case 'USDt':
				return 'Tether USD on Liquid only';
			default:
				return '';
		}
	}

	async function generatePaymentRequest() {
		const amountSats = validateInputs();
		if (amountSats === null) {
			return;
		}

		errorMessage = null;
		isLoading = true;
		address = null;
		feeSats = 0;

				try {
			// Prepare the request based on payment method and asset selection
			let prepareRequest: any = { paymentMethod };
			
			// Add amount if specified and > 0, but NEVER for BOLT12 offers
			if (amountSats > 0 && paymentMethod !== 'bolt12Offer') {
				if (selectedAsset === 'USDt' && paymentMethod === 'liquidAddress') {
					// For USDT, use asset amount
					prepareRequest.amount = {
						type: 'asset',
						assetId: getAssetId('USDT'),
						payerAmount: amount // Use the raw amount, not converted to sats
					};
				} else {
					// For BTC/L-BTC, use sats
					prepareRequest.amount = {
						type: 'bitcoin',
						payerAmountSat: amountSats
					};
				}
			}

			const prepareResponse = await prepareReceivePayment(prepareRequest);
			console.log('prepareResponse', prepareResponse);

			const receiveResponse = await receivePayment({
				prepareResponse,
				description: description || getDefaultDescription()
			});
			console.log('receiveResponse', receiveResponse);

			address = receiveResponse.destination;
			feeSats = prepareResponse.feesSat || 0;
		} catch (error) {
			console.error('Error generating payment request:', error);
			errorMessage =
				error instanceof Error
					? error.message
					: 'Failed to generate payment request. Please try again.';
		} finally {
			isLoading = false;
		}
	}

	function getDefaultDescription(): string {
		const methodName = getMethodDisplayName();
		const assetInfo = selectedAsset === 'any' ? 'multi-asset' : selectedAsset;
		return `${methodName} payment${selectedAsset !== 'any' ? ` for ${assetInfo}` : ''}`;
	}

	function copyToClipboard() {
		if (address) {
			// For Bitcoin addresses, extract the raw address from BIP21 URI
			let textToCopy = address;
			if (paymentMethod === 'bitcoinAddress' && address.startsWith('bitcoin:')) {
				textToCopy = extractBitcoinAddress(address);
			}
			navigator.clipboard.writeText(textToCopy);
			appStore.showSuccessToast('Address copied to clipboard');
		}
	}

	function extractBitcoinAddress(bip21Uri: string): string {
		// Remove 'bitcoin:' prefix and everything after '?'
		return bip21Uri.replace('bitcoin:', '').split('?')[0];
	}

	function getDisplayAddress(): string {
		if (paymentMethod === 'bitcoinAddress' && address && address.startsWith('bitcoin:')) {
			return extractBitcoinAddress(address);
		}
		return address || '';
	}

	function changePaymentMethod(value: PaymentMethod) {
		paymentMethod = value;
		resetForm();
	}

	function resetForm() {
		address = null;
		amount = 0;
		description = '';
		errorMessage = null;
		feeSats = 0;
	}
</script>

<div class="card bg-base-200 rounded-xl shadow-md">
	<div class="card-body p-6">
		{#if address === null}
			<!-- Header -->
			<div class="mb-6">
				<p class="text-base-content/70 text-sm">
					Generate addresses and invoices using Breez SDK. Support for Lightning, Bitcoin, and
					multi-asset Liquid payments.
				</p>
			</div>

			<!-- Payment Method Selection -->
			<div class="form-control mb-4">
				<label class="label pb-2" for="payment-method">
					<span class="label-text font-medium">Payment Method</span>
				</label>
				<Input
					options={paymentMethodOptions}
					value={paymentMethodOptions.find((option) => option.value === paymentMethod)?.label}
					onChange={(option) => changePaymentMethod(option.value as PaymentMethod)}
					className="w-full focus:border-amber-500 focus:outline-none"
				/>
				<div class="label pt-1">
					<span class="label-text-alt text-base-content/60 text-xs whitespace-break-spaces">
						{getMethodDescription()}
					</span>
				</div>
			</div>

			<!-- Asset Selection (for Liquid) -->
			{#if paymentMethod === 'liquidAddress'}
				<div class="form-control mb-4">
					<label class="label pb-2" for="asset-type">
						<span class="label-text font-medium">Asset Type</span>
					</label>
					<Input
						options={assetTypeOptions}
						value={assetTypeOptions.find((option) => option.value === selectedAsset)?.label}
						onChange={(option) => (selectedAsset = option.value as AssetType)}
						className="w-full focus:border-amber-500 focus:outline-none"
					/>
					<div class="label pt-1">
						<span class="label-text-alt text-base-content/60 text-xs whitespace-break-spaces">
							{getAssetDescription()}
						</span>
					</div>
				</div>
			{/if}

			<!-- Amount Input (hidden for BOLT12) -->
			{#if paymentMethod !== 'bolt12Offer'}
			<div class="form-control mb-4">
				<label class="label pb-2" for="amount-input">
					<span class="label-text font-medium">
						Amount ({tokenType === 'BTC' ? 'BTC' : selectedAsset === 'USDt' ? 'USDT' : 'sats'})
						{requireAmount ? ' *' : ' (optional)'}
					</span>
				</label>
				<div class="join w-full">
					<input
						id="amount-input"
						type="number"
						step="any"
						min={0}
						placeholder={requireAmount ? 'Amount required' : 'Leave empty for any amount'}
						class="input input-bordered join-item w-full flex-1 focus:border-amber-500 focus:outline-none"
						bind:value={amount}
					/>
					{#if selectedAsset !== 'USDt'}
						<div class="w-24 overflow-hidden relative">
							<Input
								options={[
									{ label: 'BTC', value: 'BTC' },
									{ label: 'sats', value: 'sats' }
								]}
								value={tokenType}
								onChange={(option) => (tokenType = option.value as 'BTC' | 'sats')}
								className="focus:border-amber-500 focus:outline-none rounded-l-none border-l-0 rounded-r-full"
							/>
						</div>
					{/if}
				</div>

				{#if !requireAmount && paymentMethod === 'liquidAddress'}
					<div class="label pt-1">
						<span class="label-text-alt text-info text-xs whitespace-break-spaces">
							💡 Liquid addresses can receive any amount without specifying upfront
						</span>
					</div>
				{/if}
				
				{#if paymentMethod === ('bolt12Offer' as PaymentMethod)}
					<div class="label pt-1">
						<span class="label-text-alt text-warning text-xs whitespace-break-spaces">
							⚠️ BOLT12 offers ignore amount input - payers choose their own amount
						</span>
					</div>
				{/if}

				{#if errorMessage}
					<div class="label pt-1">
						<span class="label-text-alt text-error whitespace-break-spaces">{errorMessage}</span>
					</div>
				{/if}
			</div>
			{/if}

			<!-- Description -->
			<div class="form-control mb-6">
				<label class="label pb-2" for="description-input">
					<span class="label-text font-medium">Description (optional)</span>
				</label>
				<input
					id="description-input"
					type="text"
					placeholder="What's this payment for?"
					class="input input-bordered w-full focus:border-amber-500 focus:outline-none"
					bind:value={description}
				/>
			</div>

			<!-- Generate Button -->
			<button
				class="btn btn-primary btn-block h-12 rounded-lg border-none bg-amber-500 font-medium text-black transition-all duration-200 hover:bg-amber-600 disabled:opacity-50"
				onclick={generatePaymentRequest}
				disabled={isLoading}
			>
				{#if isLoading}
					<span class="loading loading-spinner loading-sm mr-2"></span>
					Generating...
				{:else}
					Generate {getMethodDisplayName()}
				{/if}
			</button>
		{:else}
			<!-- Generated Address/Invoice Display -->
			<div>
				<div class="mb-4">
					<h4 class="card-title mb-2 text-xl font-bold">
						{getMethodDisplayName()} Generated ✅
					</h4>
					<p class="text-base-content/70 text-sm">
						Share this {paymentMethod === 'liquidAddress' ? 'address' : 'invoice'} with the payer
					</p>
				</div>

				<div class="space-y-4">
					<!-- Payment Details -->
					<div class="bg-base-300 rounded-lg p-4">
						<div class="grid grid-cols-1 gap-3">
							<div class="flex items-center justify-between">
								<span class="text-base-content/70 font-medium">Method:</span>
								<span class="font-bold">{getMethodDisplayName()}</span>
							</div>

							{#if paymentMethod !== 'bolt12Offer'}
								{#if amount > 0}
									<div class="flex items-center justify-between">
										<span class="text-base-content/70 font-medium">Amount:</span>
										<span class="text-success font-bold">
											{#if selectedAsset === 'USDt'}
												${amount} USDT
											{:else}
												{amount} {tokenType === 'BTC' ? 'BTC' : 'sats'}
											{/if}
										</span>
									</div>
								{:else}
									<div class="flex items-center justify-between">
										<span class="text-base-content/70 font-medium">Amount:</span>
										<span class="text-primary font-bold">Any amount accepted</span>
									</div>
								{/if}
							{:else}
								<div class="flex items-center justify-between">
									<span class="text-base-content/70 font-medium">Amount:</span>
									<span class="text-warning font-bold">Payer chooses amount</span>
								</div>
							{/if}

							{#if paymentMethod === 'liquidAddress' && selectedAsset !== 'any'}
								<div class="flex items-center justify-between">
									<span class="text-base-content/70 font-medium">Asset:</span>
									<span class="font-bold">{selectedAsset}</span>
								</div>
							{/if}

							{#if description}
								<div class="flex items-start justify-between">
									<span class="text-base-content/70 font-medium">Description:</span>
									<span class="max-w-48 text-right text-sm break-words">{description}</span>
								</div>
							{/if}

							{#if feeSats > 0}
								<div class="flex items-center justify-between">
									<span class="text-base-content/70 font-medium">Network Fee:</span>
									<span class="text-sm">{formatSats(feeSats)} sats</span>
								</div>
							{/if}
						</div>
					</div>

					<!-- Address/Invoice Display -->
					<div class="space-y-2">
						<div class="text-base-content/70 font-medium">
							{paymentMethod === 'liquidAddress' ? 'Address:' : 'Invoice:'}
						</div>
						<button
							class="bg-base-300 hover:bg-base-100 border-base-300 group w-full rounded-lg border px-4 py-3 text-left transition-colors duration-200"
							title="Click to copy"
							onclick={copyToClipboard}
						>
							<pre
								class="text-xs break-all whitespace-pre-wrap transition-colors group-hover:text-amber-600">{getDisplayAddress()}</pre>
						</button>
						<p class="text-base-content/50 text-center text-xs">👆 Click to copy to clipboard</p>
					</div>

					<!-- Actions -->
					<div class="flex gap-3 pt-4">
						<button
							class="btn btn-outline flex-1 border-amber-500 text-amber-500 hover:bg-amber-500 hover:text-black"
							onclick={resetForm}
						>
							Generate New
						</button>
						<button
							class="btn btn-primary flex-1 border-none bg-amber-500 text-black hover:bg-amber-600"
							onclick={copyToClipboard}
						>
							📋 Copy
						</button>
					</div>
				</div>
			</div>
		{/if}
	</div>
</div>

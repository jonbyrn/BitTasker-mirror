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
	} from '$lib/utils/constants/assets';
	import { appStore } from '$lib/stores/app.store';
	import Input from '$lib/components/Input.svelte';
	import { t } from 'svelte-i18n';
	import generateQrCodeUrl from '$lib/utils/helpers/generateQrCodeUrl';
	import { copyToClipboard } from '$lib/utils/helpers/clipboard';

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
	let lightningLimits = $state({ min: 0, max: 21000000 * 100_000_000 });
	let onchainLimits = $state({ min: 0, max: 21000000 * 100_000_000 });
	let isLoading = $state(false);
	let errorMessage = $state<string | null>(null);
	let feeSats = $state(0);
	let address = $state<string | null>(null);
	let supportedAssets = $state<AssetMetadata[]>([]);
	let currentNetwork = getCurrentNetwork();
	let qrCodeDataUrl = $state('');

	const paymentMethodOptions = [
		{
			label: $t('common.components.wallet.payment_request_form.liquid_address'),
			value: 'liquidAddress'
		},
		{
			label: $t('common.components.wallet.payment_request_form.lightning_invoice'),
			value: 'bolt11Invoice'
		},
		{
			label: $t('common.components.wallet.payment_request_form.bitcoin_address'),
			value: 'bitcoinAddress'
		},
		{
			label: $t('common.components.wallet.payment_request_form.bolt12_offer'),
			value: 'bolt12Offer'
		}
	];

	const assetTypeOptions = [
		{ label: $t('common.components.wallet.payment_request_form.any_asset'), value: 'any' },
		{ label: $t('common.components.wallet.payment_request_form.liquid_bitcoin'), value: 'L-BTC' },
		{ label: $t('common.components.wallet.payment_request_form.tether_usd'), value: 'USDt' }
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
			errorMessage = $t('common.components.wallet.payment_request_form.failed_to_load');
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
				errorMessage = $t('common.components.wallet.payment_request_form.amount_required', {
					values: { method: getMethodDisplayName() }
				});
				return null;
			case amountSats > 0 && amountSats < limits.min:
				errorMessage = $t('common.components.wallet.payment_request_form.amount_too_low', {
					values: { min: formatSats(limits.min) }
				});
				return null;
			case amountSats > limits.max:
				errorMessage = $t('common.components.wallet.payment_request_form.amount_too_high', {
					values: { max: formatSats(limits.max) }
				});
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
				return $t('common.components.wallet.payment_request_form.liquid_address_name');
			case 'bolt11Invoice':
				return $t('common.components.wallet.payment_request_form.lightning_invoice_name');
			case 'bitcoinAddress':
				return $t('common.components.wallet.payment_request_form.bitcoin_address_name');
			case 'bolt12Offer':
				return $t('common.components.wallet.payment_request_form.bolt12_offer_name');
			default:
				return $t('common.components.wallet.payment_request_form.address_name');
		}
	}

	function getMethodDescription(): string {
		switch (paymentMethod) {
			case 'liquidAddress':
				return $t('common.components.wallet.payment_request_form.liquid_address_desc');
			case 'bolt11Invoice':
				return $t('common.components.wallet.payment_request_form.lightning_invoice_desc');
			case 'bitcoinAddress':
				return $t('common.components.wallet.payment_request_form.bitcoin_address_desc');
			case 'bolt12Offer':
				return $t('common.components.wallet.payment_request_form.bolt12_offer_desc');
			default:
				return '';
		}
	}

	function getAssetDescription(): string {
		switch (selectedAsset) {
			case 'any':
				return $t('common.components.wallet.payment_request_form.any_asset_desc');
			case 'L-BTC':
				return $t('common.components.wallet.payment_request_form.liquid_bitcoin_desc');
			case 'USDt':
				return $t('common.components.wallet.payment_request_form.tether_usd_desc');
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
			qrCodeDataUrl = await generateQrCodeUrl(address);
		} catch (error) {
			console.error('Error generating payment request:', error);
			errorMessage =
				error instanceof Error
					? error.message
					: $t('common.components.wallet.payment_request_form.failed_to_generate');
		} finally {
			isLoading = false;
		}
	}

	function getDefaultDescription(): string {
		const methodName = getMethodDisplayName();
		const assetInfo =
			selectedAsset === 'any'
				? $t('common.components.wallet.payment_request_form.multi_asset')
				: selectedAsset;
		return $t('common.components.wallet.payment_request_form.default_description', {
			values: { method: methodName, asset: selectedAsset !== 'any' ? assetInfo : '' }
		});
	}

	function _copyToClipboard() {
		if (address) {
			// For Bitcoin addresses, extract the raw address from BIP21 URI
			let textToCopy = address;
			if (paymentMethod === 'bitcoinAddress' && address.startsWith('bitcoin:')) {
				textToCopy = extractBitcoinAddress(address);
			} else if (paymentMethod === 'liquidAddress' && address.startsWith('liquidnetwork:')) {
				textToCopy = address.replace('liquidnetwork:', '');
			}
			copyToClipboard(textToCopy);
			appStore.showSuccessToast($t('common.components.wallet.payment_request_form.address_copied'));
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
					{$t('common.components.wallet.payment_request_form.description')}
				</p>
			</div>

			<!-- Payment Method Selection -->
			<div class="form-control mb-4">
				<label class="label pb-2" for="payment-method">
					<span class="label-text font-medium"
						>{$t('common.components.wallet.payment_request_form.payment_method')}</span
					>
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
						<span class="label-text font-medium"
							>{$t('common.components.wallet.payment_request_form.asset_type')}</span
						>
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
							{$t('common.components.wallet.payment_request_form.amount', {
								values: {
									unit: tokenType === 'BTC' ? 'BTC' : selectedAsset === 'USDt' ? 'USDT' : 'sats',
									required: requireAmount ? ' *' : ' (optional)'
								}
							})}
						</span>

					</label>
					
					<!-- Show min and max limits -->
					{#if paymentMethod === 'bitcoinAddress' && onchainLimits.min > 0 && onchainLimits.max > 0}
						<span class="label-text-alt text-info text-xs whitespace-break-spaces block sm:inline">
							Min: {formatSats(onchainLimits.min)} - Max: {formatSats(onchainLimits.max)}
						</span>
					{:else if lightningLimits.min > 0 && lightningLimits.max > 0}
						<span class="label-text-alt text-info text-xs whitespace-break-spaces block sm:inline">
							Min: {formatSats(lightningLimits.min)} - Max: {formatSats(lightningLimits.max)}
						</span>
					{/if}
					
					<div class="join w-full">
						<input
							id="amount-input"
							type="number"
							step="any"
							min={0}
							placeholder={requireAmount
								? $t('common.components.wallet.payment_request_form.amount_required_placeholder')
								: $t('common.components.wallet.payment_request_form.amount_optional_placeholder')}
							class="input input-bordered join-item w-full flex-1 focus:border-amber-500 focus:outline-none"
							bind:value={amount}
						/>
						{#if selectedAsset !== 'USDt'}
							<div class="relative w-24 overflow-hidden">
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
								{$t('common.components.wallet.payment_request_form.liquid_address_tip')}
							</span>
						</div>
					{/if}

					{#if paymentMethod === ('bolt12Offer' as PaymentMethod)}
						<div class="label pt-1">
							<span class="label-text-alt text-warning text-xs whitespace-break-spaces">
								{$t('common.components.wallet.payment_request_form.bolt12_warning')}
							</span>
						</div>
					{/if}

					{#if errorMessage}
						<div class="label pt-1 block">
							<span class="label-text-alt text-error whitespace-break-spaces">{errorMessage}</span>
						</div>
					{/if}
				</div>
			{/if}

			<!-- Description -->
			<div class="form-control mb-6">
				<label class="label pb-2" for="description-input">
					<span class="label-text font-medium"
						>{$t('common.components.wallet.payment_request_form.description_label')}</span
					>
				</label>
				<input
					id="description-input"
					type="text"
					placeholder={$t('common.components.wallet.payment_request_form.description_placeholder')}
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
					{$t('common.components.wallet.payment_request_form.generating')}
				{:else}
					{$t('common.components.wallet.payment_request_form.generate', {
						values: { method: getMethodDisplayName() }
					})}
				{/if}
			</button>
		{:else}
			<!-- Generated Address/Invoice Display -->
			<div>
				<div class="mb-4">
					<h4 class="card-title mb-2 text-xl font-bold">
						{$t('common.components.wallet.payment_request_form.generated', {
							values: { method: getMethodDisplayName() }
						})}
					</h4>
					<p class="text-base-content/70 text-sm">
						{$t('common.components.wallet.payment_request_form.share_with_payer', {
							values: {
								type:
									paymentMethod === 'liquidAddress'
										? $t('common.components.wallet.payment_request_form.address')
										: $t('common.components.wallet.payment_request_form.invoice')
							}
						})}
					</p>
				</div>

				<div class="space-y-4">
					<div class="flex flex-col items-center justify-center gap-4 sm:flex-row">
						<div class="w-full space-y-4 sm:w-1/2">
							<!-- Payment Details -->
							<div class="bg-base-300 rounded-lg p-4">
								<div class="grid grid-cols-1 gap-3">
									<div class="flex items-center justify-between">
										<span class="text-base-content/70 font-medium"
											>{$t('common.components.wallet.payment_request_form.method')}</span
										>
										<span class="font-bold">{getMethodDisplayName()}</span>
									</div>

									{#if paymentMethod !== 'bolt12Offer'}
										{#if amount > 0}
											<div class="flex items-center justify-between">
												<span class="text-base-content/70 font-medium"
													>{$t('common.components.wallet.payment_request_form.amount')}</span
												>
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
												<span class="text-base-content/70 font-medium"
													>{$t('common.components.wallet.payment_request_form.amount')}</span
												>
												<span class="text-primary font-bold"
													>{$t(
														'common.components.wallet.payment_request_form.any_amount_accepted'
													)}</span
												>
											</div>
										{/if}
									{:else}
										<div class="flex items-center justify-between">
											<span class="text-base-content/70 font-medium"
												>{$t('common.components.wallet.payment_request_form.amount')}</span
											>
											<span class="text-warning font-bold"
												>{$t(
													'common.components.wallet.payment_request_form.payer_chooses_amount'
												)}</span
											>
										</div>
									{/if}

									{#if paymentMethod === 'liquidAddress' && selectedAsset !== 'any'}
										<div class="flex items-center justify-between">
											<span class="text-base-content/70 font-medium"
												>{$t('common.components.wallet.payment_request_form.asset')}</span
											>
											<span class="font-bold">{selectedAsset}</span>
										</div>
									{/if}

									{#if description}
										<div class="flex items-start justify-between">
											<span class="text-base-content/70 font-medium"
												>{$t('common.components.wallet.payment_request_form.description')}</span
											>
											<span class="max-w-48 text-right text-sm break-words">{description}</span>
										</div>
									{/if}

									{#if feeSats > 0}
										<div class="flex items-center justify-between">
											<span class="text-base-content/70 font-medium"
												>{$t('common.components.wallet.payment_request_form.network_fee')}</span
											>
											<span class="text-sm">{formatSats(feeSats)} sats</span>
										</div>
									{/if}
								</div>
							</div>

							<!-- Address/Invoice Display -->
							<div class="space-y-2">
								<div class="text-base-content/70 font-medium">
									{paymentMethod === 'liquidAddress'
										? $t('common.components.wallet.payment_request_form.address')
										: $t('common.components.wallet.payment_request_form.invoice')}
								</div>
								<button
									class="bg-base-300 hover:bg-base-100 border-base-300 group w-full rounded-lg border px-4 py-3 text-left transition-colors duration-200"
									title={$t('common.components.wallet.payment_request_form.click_to_copy')}
									onclick={_copyToClipboard}
								>
									<pre
										class="text-xs break-all whitespace-pre-wrap transition-colors group-hover:text-amber-600">{getDisplayAddress()}</pre>
								</button>
								<p class="text-base-content/50 text-center text-xs">
									{$t('common.components.wallet.payment_request_form.click_to_copy_hint')}
								</p>
							</div>
						</div>

						<!-- QR Code -->
						{#if qrCodeDataUrl}
							<div class="w-full flex-shrink-0 text-center sm:w-1/2">
								<div class="mx-auto flex w-fit justify-center rounded-lg bg-white p-1 shadow-lg">
									<img
										src={qrCodeDataUrl}
										alt="Private Key QR Code"
										class="h-full max-h-48 w-full max-w-48 lg:max-h-64 lg:max-w-64"
									/>
								</div>
							</div>
						{/if}
					</div>

					<!-- Actions -->
					<div class="flex gap-3 pt-4">
						<button
							class="btn btn-outline flex-1 border-amber-500 text-amber-500 hover:bg-amber-500 hover:text-black"
							onclick={resetForm}
						>
							{$t('common.components.wallet.payment_request_form.generate_new')}
						</button>
						<button
							class="btn btn-primary flex-1 border-none bg-amber-500 text-black hover:bg-amber-600"
							onclick={_copyToClipboard}
						>
							{$t('common.components.wallet.payment_request_form.copy')}
						</button>
					</div>
				</div>
			</div>
		{/if}
	</div>
</div>

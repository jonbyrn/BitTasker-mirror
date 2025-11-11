<script lang="ts">
	import { t } from 'svelte-i18n';
	import { allAssets, walletManager } from '$lib/stores/wallet.store';
	import { appStore } from '$lib/stores/app.store';
	import {
		validateRSKAddress,
		validateLightningAddress,
		validateBitcoinAddress,
		type ValidationResult
	} from '$lib/utils/helpers/validators';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';
	import {
		parseLightningInvoice,
		isLightningInvoice,
		isLightningAddress,
		isBolt12Invoice
	} from '$lib/utils/helpers/lightningInvoice';
	import SubmarineSend from './SubmarineSend.svelte';

	type ExtendedAsset = {
		assetId: string;
		name: string;
		ticker: string;
		network: string;
		balance: number;
		formattedBalance: string;
		icon: string | null;
	};

	// Lightning swap state (for fee breakdown and validation)
	let minAmount = $state<number>(0);
	let maxAmount = $state<number>(0);
	let isLoadingLimits = $state(false);
	let btcPrice = $state<number>(0);
	let isLoadingPrice = $state(false);
	let amountError = $state<string | null>(null);
	let debounceTimeout: ReturnType<typeof setTimeout> | null = null;
	let invoiceParseTimeout: ReturnType<typeof setTimeout> | null = null;

	// Lightning invoice parsing state
	let invoiceAmount = $state<number | null>(null);
	let invoiceHasAmount = $state(false);
	let showAmountField = $state(false); // Start hidden until address is entered
	let isParsingInvoice = $state(false);

	// Asset options (Bitcoin and USD)
	const assetOptions = [
		{
			value: 'bitcoin',
			label: $t('wallet.send_form.asset.bitcoin'),
			description: $t('wallet.send_form.asset.bitcoin_description'),
			icon: '/images/chains/Bitcoin.svg',
			disabled: false
		},
		{
			value: 'usd',
			label: $t('wallet.send_form.asset.usd'),
			description: $t('wallet.send_form.asset.usd_description'),
			icon: '/images/chains/Tether-USD.svg',
			disabled: false
		}
	];

	// Form state
	let selectedAsset = $state<'bitcoin' | 'usd'>('bitcoin');
	let recipientAddress = $state('');
	let amount = $state('');
	let description = $state('');
	let isLoading = $state(false);
	let errorMessage = $state<string | null>(null);
	let dropdownKey = $state(0);
	let addressValidation = $state<ValidationResult>({ isValid: true });

	// Network options based on selected asset
	let networkOptions = $derived(() => {
		if (selectedAsset === 'bitcoin') {
			return [
				{
					value: 'lightning-bitcoin',
					label: $t('wallet.send_form.network.lightning_bitcoin'),
					description: $t('wallet.send_form.network.lightning_bitcoin_description'),
					icon: '/images/chains/lightning.svg',
					placeholderKey: 'wallet.send.placeholder_lightning',
					sendButtonKey: 'wallet.send.button_lightning',
					isComingSoon: true
				},
				{
					value: 'rootstock-bitcoin',
					label: $t('wallet.send_form.network.rootstock_bitcoin'),
					description: $t('wallet.send_form.network.rootstock_bitcoin_description'),
					icon: '/images/chains/Bitcoin-Rootstock-logo.webp',
					placeholderKey: 'wallet.send.placeholder_rootstock',
					sendButtonKey: 'wallet.send.button_rootstock',
					isComingSoon: false
				},
				{
					value: 'liquid-bitcoin',
					label: $t('wallet.send_form.network.liquid_bitcoin'),
					description: $t('wallet.send_form.network.liquid_bitcoin_description'),
					icon: '/images/chains/Liquid-Bitcoin.svg',
					placeholderKey: 'wallet.send.placeholder_liquid_btc',
					sendButtonKey: 'wallet.send.button_liquid_btc',
					isComingSoon: true
				},
				{
					value: 'bitcoin',
					label: $t('wallet.send_form.network.bitcoin'),
					description: $t('wallet.send_form.network.bitcoin_description'),
					icon: '/images/chains/Bitcoin.svg',
					placeholderKey: 'wallet.send.placeholder_bitcoin',
					sendButtonKey: 'wallet.send.button_bitcoin',
					isComingSoon: true
				}
			];
		} else {
			return [
				{
					value: 'liquid-usdt',
					label: $t('wallet.send_form.network.liquid_usdt'),
					description: $t('wallet.send_form.network.liquid_usdt_description'),
					icon: '/images/chains/Tether-USD.svg',
					placeholderKey: 'wallet.send.placeholder_liquid_usdt',
					sendButtonKey: 'wallet.send.button_liquid_usdt',
					isComingSoon: false
				}
			];
		}
	});

	// Auto-select first available network when asset changes
	let selectedNetwork = $derived(networkOptions()[0]);

	// Available assets based on selected network
	let availableAssets = $derived(() => {
		if (selectedAsset === 'bitcoin') {
			if (selectedNetwork.value === 'rootstock-bitcoin') {
				return $allAssets.filter((asset) => asset.network === 'RSK');
			} else if (selectedNetwork.value === 'liquid-bitcoin') {
				return $allAssets.filter(
					(asset) => asset.network === 'Liquid' || asset.network === 'Bitcoin'
				);
			} else if (selectedNetwork.value === 'lightning-bitcoin') {
				// For Lightning Bitcoin, show Rootstock balance since it will be swapped
				const rskAssets = $allAssets.filter((asset) => asset.network === 'RSK');
				const lightningAsset: ExtendedAsset = {
					assetId: 'lightning-bitcoin',
					name: 'Lightning Bitcoin',
					ticker: 'BTC',
					network: 'Lightning',
					balance: rskAssets.length > 0 ? rskAssets[0].balance : 0,
					formattedBalance: rskAssets.length > 0 ? rskAssets[0].formattedBalance : '0.00 BTC',
					icon: null
				};
				return [lightningAsset];
			} else if (selectedNetwork.value === 'bitcoin') {
				return $allAssets.filter((asset) => asset.network === 'Bitcoin');
			}
		} else if (selectedAsset === 'usd') {
			return $allAssets.filter((asset) => asset.network === 'Liquid' && asset.ticker === 'USDT');
		}
		return [];
	});

	/**
	 * Fetch BTC price for USD conversion
	 */
	async function fetchBtcPrice() {
		try {
			isLoadingPrice = true;
			btcPrice = await cryptoPriceService.getCurrentPrice('BTC');
		} catch (err) {
			console.error('Failed to fetch BTC price:', err);
			// Use fallback price if fetch fails
			btcPrice = 60000; // Fallback to ~$60k
		} finally {
			isLoadingPrice = false;
		}
	}

	// Validate address in real-time based on selected network
	$effect(() => {
		if (!recipientAddress.trim()) {
			addressValidation = { isValid: true }; // Empty is valid (not touched yet)
			return;
		}

		if (selectedNetwork.value === 'rootstock-bitcoin') {
			addressValidation = validateRSKAddress(recipientAddress);
		} else if (selectedNetwork.value === 'lightning-bitcoin') {
			addressValidation = validateLightningAddress(recipientAddress);
		} else if (selectedNetwork.value === 'bitcoin') {
			addressValidation = validateBitcoinAddress(recipientAddress);
		} else if (
			selectedNetwork.value === 'liquid-bitcoin' ||
			selectedNetwork.value === 'liquid-usdt'
		) {
			// Liquid uses similar address format to Bitcoin
			addressValidation = validateBitcoinAddress(recipientAddress);
		} else {
			addressValidation = { isValid: true };
		}
	});

	/**
	 * Validate amount and update error state
	 */
	function validateAmount(value: string | number) {
		amountError = null;

		// Only validate for Lightning network
		if (selectedNetwork.value !== 'lightning-bitcoin') {
			return;
		}

		// If invoice has an amount, validate it against limits and balance
		if (invoiceHasAmount && invoiceAmount !== null) {
			// Validate invoice amount against limits
			if (!isLoadingLimits) {
				if (minAmount > 0 && invoiceAmount < minAmount) {
					amountError = $t('wallet.swap.error.minimum_amount_sats', {
						values: { minAmount: minAmount.toLocaleString() }
					});
					return;
				}

				if (maxAmount > 0 && invoiceAmount > maxAmount) {
					amountError = $t('wallet.swap.error.maximum_amount_sats', {
						values: { maxAmount: maxAmount.toLocaleString() }
					});
					return;
				}
			}

			// Validate invoice amount against balance
			if (invoiceAmount > balanceInSats) {
				amountError = $t('wallet.validation.insufficient_balance');
				return;
			}

			// Invoice amount is valid
			return;
		}

		// Convert to string for validation
		const valueStr = String(value ?? '');

		// Check if value is empty or whitespace
		if (valueStr.trim() === '' || value === null || value === undefined) {
			// For amountless invoices, require at least 1 sat
			if (showAmountField && !invoiceHasAmount) {
				amountError = $t('wallet.validation.amount_required');
			}
			return;
		}

		const amountSats = parseFloat(valueStr);

		if (isNaN(amountSats) || amountSats <= 0) {
			amountError = $t('wallet.validation.amount_required');
			return;
		}

		// For amountless invoices, require at least 1 sat
		if (!invoiceHasAmount && amountSats < 1) {
			amountError = $t('wallet.validation.amount_required');
			return;
		}

		// Only validate against limits if they've been loaded
		if (!isLoadingLimits) {
			if (minAmount > 0 && amountSats < minAmount) {
				amountError = $t('wallet.swap.error.minimum_amount_sats', {
					values: { minAmount: minAmount.toLocaleString() }
				});
				return;
			}

			if (maxAmount > 0 && amountSats > maxAmount) {
				amountError = $t('wallet.swap.error.maximum_amount_sats', {
					values: { maxAmount: maxAmount.toLocaleString() }
				});
				return;
			}
		}
	}

	// Validate address in real-time based on selected network and parse Lightning invoices
	$effect(() => {
		// Guard against non-string values
		if (typeof recipientAddress !== 'string' && recipientAddress != null) {
			const nonStringAddress = recipientAddress as unknown;
			console.error('[SendForm] ERROR: recipientAddress is not a string!', {
				type: typeof recipientAddress,
				value: recipientAddress,
				constructor: (nonStringAddress as any)?.constructor?.name
			});
		}

		const currentAddress = typeof recipientAddress === 'string' ? recipientAddress.trim() : '';
		const currentNetwork = selectedNetwork;

		// Clear invoice parsing timeout if it exists
		if (invoiceParseTimeout) {
			clearTimeout(invoiceParseTimeout);
			invoiceParseTimeout = null;
		}

		if (!currentAddress) {
			addressValidation = { isValid: true }; // Empty is valid (not touched yet)
			showAmountField = false;
			invoiceAmount = null;
			invoiceHasAmount = false;
			// Don't clear amount if user is just clearing address temporarily
			// Only clear if switching networks or explicitly clearing
			return;
		}

		if (currentNetwork.value === 'rootstock-bitcoin') {
			// Ensure recipientAddress is a string before validation
			const addressForValidation =
				typeof recipientAddress === 'string' ? recipientAddress : String(recipientAddress || '');

			addressValidation = validateRSKAddress(addressForValidation);
			showAmountField = true;
			invoiceAmount = null;
			invoiceHasAmount = false;
		} else if (currentNetwork.value === 'lightning-bitcoin') {
			// Ensure recipientAddress is a string before validation
			const addressForValidation =
				typeof recipientAddress === 'string' ? recipientAddress : String(recipientAddress || '');
			addressValidation = validateLightningAddress(addressForValidation);

			// Parse invoice immediately (no debounce needed since we're not overwriting user input)
			// Check if it's a Lightning invoice (BOLT11 or BOLT12)
			if (isLightningInvoice(recipientAddress)) {
				// Check if it's BOLT12 (offers are always amountless - payer chooses amount)
				if (isBolt12Invoice(recipientAddress)) {
					// BOLT12 offers - always show amount field (payer chooses amount)
					showAmountField = true;
					invoiceAmount = null;
					invoiceHasAmount = false;
					// Don't clear amount if user has entered one
					if (!amount) {
						amount = '';
					}
				} else {
					// BOLT11 invoice - parse using bolt11 library
					const parsed = parseLightningInvoice(recipientAddress);

					if (parsed.isValid) {
						invoiceHasAmount = parsed.hasAmount;
						invoiceAmount = parsed.amountSats;

						// If invoice has an amount, hide the amount field and show read-only display
						if (parsed.hasAmount && parsed.amountSats !== null) {
							showAmountField = false; // Hide field completely, show amount as read-only below
							amount = ''; // Clear amount field since we'll show it read-only
							// Validate the invoice amount
							validateAmount(parsed.amountSats);
						} else {
							// Amountless BOLT11 invoice - show amount field
							showAmountField = true;
							// Don't clear amount if user has entered one
							if (!amount) {
								amount = '';
							}
						}
					} else {
						// Invalid BOLT11 invoice
						showAmountField = false;
						invoiceAmount = null;
						invoiceHasAmount = false;
						amountError = null;
					}
				}
			} else if (isLightningAddress(recipientAddress)) {
				// Lightning address (email format) - show amount field
				showAmountField = true;
				invoiceAmount = null;
				invoiceHasAmount = false;
			} else {
				showAmountField = false;
				invoiceAmount = null;
				invoiceHasAmount = false;
			}
		} else if (currentNetwork.value === 'bitcoin') {
			// Ensure recipientAddress is a string before validation
			const addressForValidation =
				typeof recipientAddress === 'string' ? recipientAddress : String(recipientAddress || '');
			addressValidation = validateBitcoinAddress(addressForValidation);
			showAmountField = true;
			invoiceAmount = null;
			invoiceHasAmount = false;
		} else if (
			currentNetwork.value === 'liquid-bitcoin' ||
			currentNetwork.value === 'liquid-usdt'
		) {
			// Liquid uses similar address format to Bitcoin
			// Ensure recipientAddress is a string before validation
			const addressForValidation =
				typeof recipientAddress === 'string' ? recipientAddress : String(recipientAddress || '');
			addressValidation = validateBitcoinAddress(addressForValidation);
			showAmountField = true;
			invoiceAmount = null;
			invoiceHasAmount = false;
		} else {
			addressValidation = { isValid: true };
			showAmountField = true;
			invoiceAmount = null;
			invoiceHasAmount = false;
		}

		// Cleanup function
		return () => {
			if (invoiceParseTimeout) {
				clearTimeout(invoiceParseTimeout);
			}
		};
	});

	// Reset invoice state when switching networks away from Lightning
	$effect(() => {
		if (selectedNetwork.value !== 'lightning-bitcoin') {
			invoiceAmount = null;
			invoiceHasAmount = false;
			// Only reset showAmountField if we're not on Lightning network
			// For other networks, showAmountField is set in the address validation effect
		}
	});

	// Estimate gas fee when address and amount change
	async function estimateGasFee(): Promise<number> {
		// Only estimate for Rootstock network
		if (selectedNetwork.value !== 'rootstock-bitcoin') {
			return 0;
		}

		// Need valid address and amount
		if (
			!recipientAddress.trim() ||
			!addressValidation.isValid ||
			!amount ||
			parseFloat(amount) <= 0
		) {
			console.log('Invalid address or amount');
			return 0.00001;
		}

		try {
			const gasEstimation = await walletManager.estimateRBTCGas(recipientAddress, amount);
			// Extract just the gas cost (not including the amount being sent)
			const totalCost = parseFloat(gasEstimation.totalCostFormatted);
			const amountValue = parseFloat(amount);
			return totalCost - amountValue;
		} catch (error) {
			console.warn('Failed to estimate gas:', error);
			// Fallback to a reasonable default
			return 0.00001; // 0.00001 RBTC
		}
	}

	// Get current asset info based on selected network
	let currentAsset = $derived(() => {
		const assets = availableAssets();
		if (assets.length > 0) {
			return assets[0]; // Return the first (and typically only) asset for the selected network
		}
		return null;
	});

	function closeNetworkDropdown() {
		dropdownKey++;
	}

	// Check if network uses sats (Lightning and rBTC)
	let usesSats = $derived(
		selectedNetwork.value === 'lightning-bitcoin' || selectedNetwork.value === 'rootstock-bitcoin'
	);

	// Convert balance to sats if needed
	let balanceInSats = $derived.by(() => {
		if (!currentAsset()) return 0;
		if (usesSats) {
			// Convert BTC balance to sats
			return Math.floor((currentAsset()?.balance || 0) * 100_000_000);
		}
		return currentAsset()?.balance || 0;
	});

	// Convert amount to sats for validation
	let amountInSats = $derived.by(() => {
		// DIAGNOSTIC LOG: Log amount type and value
		console.log('[SendForm] amountInSats derived - amount type:', typeof amount);
		console.log('[SendForm] amountInSats derived - amount value:', amount);

		// Ensure amount is a string before calling trim
		const amountStr = typeof amount === 'string' ? amount : String(amount || '');
		if (!amount || amountStr.trim() === '') return 0;
		const amountNum = parseFloat(amountStr);
		if (isNaN(amountNum)) return 0;
		return usesSats ? Math.floor(amountNum) : Math.floor(amountNum * 100_000_000);
	});

	// Fee breakdown for Lightning swaps (same as LightningReceive)
	// Use amount directly for immediate reactivity, just like LightningReceive
	// If invoice has amount, use that; otherwise use entered amount
	let amountSatsForFees = $derived.by(() => {
		if (selectedNetwork.value === 'lightning-bitcoin') {
			if (invoiceHasAmount && invoiceAmount !== null) {
				return invoiceAmount;
			}
			// Ensure amount is converted to string/number properly for parseFloat
			const amountValue = typeof amount === 'string' ? amount : String(amount || '');
			return parseFloat(amountValue) || 0;
		}
		return 0;
	});
	let swapFee = $derived(amountSatsForFees > 0 ? Math.ceil(amountSatsForFees * 0.0045) : 0); // Boltz service fee: ~0.45%
	let networkFee = $derived(selectedNetwork.value === 'lightning-bitcoin' ? 150 : 0); // Estimated network transaction fee in sats
	let totalFees = $derived(swapFee + networkFee);
	let totalReceived = $derived(Math.max(0, amountSatsForFees - totalFees));

	// Individual validation states for better UX
	let hasValidAmount = $derived(() => {
		// Ensure amount is a string before calling trim
		const amountStr = typeof amount === 'string' ? amount : String(amount || '');
		return amountStr.trim() !== '' && parseFloat(amountStr) > 0;
	});

	// Enhanced form validation - updated to work with sats
	let isFormValid = $derived(() => {
		const recipientAddressTrimmed =
			typeof recipientAddress === 'string' ? recipientAddress.trim() : '';

		if (!recipientAddressTrimmed || !addressValidation.isValid || !currentAsset()) {
			return false;
		}

		// For Lightning network with invoice that has amount, validation passes if invoice is valid
		if (
			selectedNetwork.value === 'lightning-bitcoin' &&
			invoiceHasAmount &&
			invoiceAmount !== null
		) {
			return (
				invoiceAmount > 0 &&
				invoiceAmount <= balanceInSats &&
				amountError === null &&
				(minAmount === 0 || invoiceAmount >= minAmount) &&
				(maxAmount === 0 || invoiceAmount <= maxAmount)
			);
		}

		// For other cases, require amount field
		if (!showAmountField && selectedNetwork.value === 'lightning-bitcoin') {
			return false; // Should show amount field but doesn't
		}

		// Standard validation - ensure amount is a string before calling trim
		const amountStr = typeof amount === 'string' ? amount : String(amount || '');
		const hasValidAmount = amountStr.trim() !== '' && amountInSats > 0;
		if (!hasValidAmount) {
			return false;
		}

		return (
			amountInSats <= balanceInSats &&
			amountError === null &&
			(selectedNetwork.value !== 'lightning-bitcoin' ||
				minAmount === 0 ||
				amountInSats >= minAmount) &&
			(selectedNetwork.value !== 'lightning-bitcoin' ||
				maxAmount === 0 ||
				amountInSats <= maxAmount)
		);
	});

	// Get validation error message for display
	let validationError = $derived(() => {
		// Only show errors if user has interacted with the form
		const hasInteracted = recipientAddress.trim() !== '' || amount.trim() !== '';
		if (!hasInteracted) return null;

		// Check address validation
		if (recipientAddress.trim() === '') {
			return 'wallet.validation.address_required';
		}
		if (!addressValidation.isValid) {
			return 'wallet.validation.address_invalid';
		}

		// Check amount validation
		if (amount.trim() === '') {
			return 'wallet.validation.amount_required';
		}
		if (parseFloat(amount) <= 0) {
			return 'wallet.validation.amount_positive';
		}
		if (!currentAsset()) {
			return 'wallet.validation.no_balance';
		}
		if (parseFloat(amount) > (currentAsset()?.balance || 0)) {
			return 'wallet.validation.insufficient_balance';
		}

		return null;
	});

	async function handleSend() {
		if (!isFormValid || !currentAsset) return;

		isLoading = true;
		errorMessage = null;

		try {
			if (selectedNetwork.value === 'rootstock-bitcoin') {
				await walletManager.sendRBTC(recipientAddress, String(amount));
			} else if (
				selectedNetwork.value === 'liquid-bitcoin' ||
				selectedNetwork.value === 'bitcoin'
			) {
				throw new Error('Liquid and Bitcoin transactions not yet implemented');
			} else if (selectedNetwork.value === 'lightning-bitcoin') {
				throw new Error('Lightning Bitcoin transactions not yet implemented');
			} else {
				throw new Error('Transaction type not yet implemented');
			}

			// Reset form on success
			recipientAddress = '';
			amount = '';
			description = '';
			appStore.showSuccessToast($t('wallet.send.transaction_sent'));
		} catch (error) {
			console.error('Send transaction error:', error);
			errorMessage = error instanceof Error ? error.message : $t('wallet.send.transaction_failed');
		} finally {
			isLoading = false;
		}
	}

	async function handleMaxAmount() {
		if (currentAsset()) {
			// Use dynamic fee estimate if available, otherwise use a conservative default
			const feeEstimate = await estimateGasFee();
			console.log({ feeEstimate });
			const maxAmount = Math.max(0, (currentAsset()?.balance || 0) - feeEstimate);
			amount = maxAmount.toFixed(8); // Format to 8 decimal places
		}
	}
</script>

<div class="space-y-6">
	{#if errorMessage}
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
			<span>{errorMessage}</span>
		</div>
	{/if}

	<!-- Asset Selection -->
	<div class="form-control">
		<label class="label" for="asset-select">
			<span class="label-text font-medium">{$t('wallet.select_asset')}</span>
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

	<!-- Coming Soon Alert for USD -->
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
				<div class="font-bold">{$t('wallet.coming_soon')}</div>
				<div class="text-sm">{$t('wallet.send.usd_not_available')}</div>
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
							<img src={selectedNetwork.icon} alt={selectedNetwork.label} class="h-5 w-5" />
							<span class="font-medium">{selectedNetwork.label}</span>
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
										selectedNetwork = network;
										closeNetworkDropdown();
									}}
								>
									<img src={network.icon} alt={network.label} class="h-5 w-5" />
									<span class="font-medium">{network.label}</span>
								</button>
							</li>
						{/each}
					</ul>
				</div>
			{/key}
			{#if selectedNetwork.description}
				<div class="label">
					<span class="label-text-alt">{selectedNetwork.description}</span>
				</div>
			{/if}
		</div>
	{/if}

	<!-- Submarine Swap for Lightning Bitcoin -->
	{#if selectedNetwork.value === 'lightning-bitcoin'}
		<SubmarineSend />
	{/if}

	<!-- Coming Soon Alerts for Other Networks -->
	{#if selectedNetwork.isComingSoon}
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
				<div class="font-bold">{$t('wallet.coming_soon')}</div>
				<div class="text-sm">{$t('wallet.send.network_not_available')}</div>
			</div>
		</div>
	{/if}

	<!-- Available Balance Display -->
	{#if availableAssets().length > 0 && !selectedNetwork.isComingSoon}
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
				<div class="text-base-content font-bold">{$t('wallet.available_balance')}</div>
				<div class="text-base-content/70 text-sm">
					{balanceInSats.toLocaleString()}
					{$t('wallet.sats')}
					<span class="ml-2 opacity-60">
						({availableAssets()[0]?.formattedBalance || '0.00'} L2 BTC)
					</span>
				</div>
			</div>
		</div>
	{/if}

	<!-- Submarine Swap for Lightning Bitcoin -->
	{#if selectedNetwork.value === 'lightning-bitcoin'}
		<SubmarineSend />
	{/if}

	<!-- Input Fields - Hidden for Coming Soon networks and Lightning Bitcoin (uses SubmarineSend) -->
	{#if selectedAsset !== 'usd' && !selectedNetwork.isComingSoon && selectedNetwork.value !== 'lightning-bitcoin'}
		<!-- Recipient Address -->
		<div class="form-control">
			<label class="label" for="recipient-address">
				<span class="label-text font-medium">{$t('wallet.recipient_address')}</span>
			</label>
			<input
				id="recipient-address"
				bind:value={recipientAddress}
				placeholder={$t(selectedNetwork.placeholderKey)}
				class="input input-bordered w-full"
				class:input-error={!addressValidation.isValid && recipientAddress.trim() !== ''}
				disabled={isLoading}
			/>
			{#if !addressValidation.isValid && (typeof recipientAddress === 'string' ? recipientAddress.trim() : '') !== ''}
				<div class="label">
					<span class="label-text-alt text-error">{addressValidation.error}</span>
				</div>
			{/if}
		</div>

		<!-- Invoice Amount Display (read-only, shown when invoice has amount) -->
		{#if selectedNetwork.value === 'lightning-bitcoin' && invoiceHasAmount && invoiceAmount !== null}
			<div class="form-control">
				<label class="label" for="invoice-amount">
					<span class="label-text font-medium">
						{$t('wallet.swap.amount_sats')}
					</span>
				</label>
				<div class="input input-bordered bg-base-200 cursor-not-allowed">
					{invoiceAmount.toLocaleString()}
					{$t('wallet.sats')}
					<span class="ml-2 text-sm opacity-70">({$t('wallet.swap.amount_from_invoice')})</span>
				</div>
				{#if amountError}
					<div class="label">
						<span class="label-text-alt text-error">{amountError}</span>
					</div>
				{/if}
			</div>
		{/if}

		<!-- Amount Input Field (shown for amountless invoices or non-Lightning networks) -->
		{#if (showAmountField && selectedNetwork.value === 'lightning-bitcoin') || selectedNetwork.value !== 'lightning-bitcoin'}
			<div class="form-control">
				<label class="label" for="amount">
					<span class="label-text font-medium">
						{usesSats
							? $t('wallet.swap.amount_sats')
							: `Amount (${currentAsset()?.ticker || 'BTC'})`}
					</span>
					<span class="label-text-alt">
						{#if selectedNetwork.value === 'lightning-bitcoin' && isLoadingLimits}
							<span class="loading loading-spinner loading-xs"></span>
							{$t('wallet.swap.loading')}...
						{:else if selectedNetwork.value === 'lightning-bitcoin' && minAmount > 0}
							{$t('wallet.swap.min_amount')}: {minAmount.toLocaleString()} {$t('wallet.sats')}
						{/if}
					</span>
				</label>

				<!-- Amount Input with Max Button -->
				<div class="join w-full">
					<input
						id="amount"
						bind:value={amount}
						type="number"
						step={usesSats ? '1' : 'any'}
						min={selectedNetwork.value === 'lightning-bitcoin' && minAmount > 0
							? minAmount
							: selectedNetwork.value === 'lightning-bitcoin' && !invoiceHasAmount
								? 1
								: 0}
						max={selectedNetwork.value === 'lightning-bitcoin' && maxAmount > 0
							? maxAmount
							: usesSats
								? balanceInSats
								: currentAsset()?.balance}
						placeholder={usesSats ? '100000' : '0.00'}
						class="input input-bordered join-item flex-1 rounded-r-none {amountError ||
						(!hasValidAmount &&
							(typeof amount === 'string' ? amount : String(amount || '')).trim() !== '')
							? 'input-error'
							: ''}"
						style="border-radius: 0.5rem 0 0 0.5rem !important; border-right-color: var(--color-primary) !important;"
						oninput={(e) => {
							// Clear existing timeout for immediate validation
							if (debounceTimeout) {
								clearTimeout(debounceTimeout);
							}
							// Validate immediately with the current input value
							const inputValue = (e.currentTarget as HTMLInputElement).value;
							validateAmount(inputValue);
						}}
						disabled={isLoading ||
							(selectedNetwork.value === 'lightning-bitcoin' && isLoadingLimits)}
					/>
					<button
						class="btn btn-primary join-item rounded-l-none"
						onclick={handleMaxAmount}
						disabled={isLoading ||
							!currentAsset() ||
							(selectedNetwork.value === 'lightning-bitcoin' && isLoadingLimits)}
					>
						{$t('wallet.max')}
					</button>
				</div>
				{#if amountError}
					<div class="label">
						<span class="label-text-alt text-error">{amountError}</span>
					</div>
				{/if}
			</div>
		{/if}

		<!-- Fee Breakdown for Lightning Swaps -->
		{#if selectedNetwork.value === 'lightning-bitcoin' && amountSatsForFees > 0}
			<div class="border-base-300 bg-base-200 rounded-lg border p-3">
				<div class="space-y-1.5 text-xs">
					<div class="flex items-center justify-between">
						<span class="opacity-70">{$t('wallet.swap.swap_fee')}:</span>
						<div class="text-right">
							<span>{swapFee.toLocaleString()} {$t('wallet.sats')}</span>
							{#if btcPrice > 0}
								<span class="ml-2 opacity-60"
									>${((swapFee / 100_000_000) * btcPrice).toFixed(2)}</span
								>
							{/if}
						</div>
					</div>
					<div class="flex items-center justify-between">
						<span class="opacity-70">{$t('wallet.swap.network_transaction_fee')}:</span>
						<div class="text-right">
							<span>{networkFee.toLocaleString()} {$t('wallet.sats')}</span>
							{#if btcPrice > 0}
								<span class="ml-2 opacity-60"
									>${((networkFee / 100_000_000) * btcPrice).toFixed(2)}</span
								>
							{/if}
						</div>
					</div>
					<div class="divider my-1.5"></div>
					<div class="flex items-center justify-between font-semibold">
						<span>{$t('wallet.swap.total_fees')}:</span>
						<div class="text-right">
							<span>{totalFees.toLocaleString()} {$t('wallet.sats')}</span>
							{#if btcPrice > 0}
								<span class="ml-2 opacity-60"
									>${((totalFees / 100_000_000) * btcPrice).toFixed(2)}</span
								>
							{/if}
						</div>
					</div>
					<div class="divider my-1.5"></div>
					<div class="text-primary flex items-center justify-between text-sm font-bold">
						<span>{$t('wallet.swap.total_received_est')}:</span>
						<div class="text-right">
							<span>{totalReceived.toLocaleString()} {$t('wallet.sats')}</span>
							{#if btcPrice > 0}
								<span class="ml-2 opacity-70"
									>${((totalReceived / 100_000_000) * btcPrice).toFixed(2)}</span
								>
							{/if}
						</div>
					</div>
				</div>
			</div>
		{/if}

		<!-- Description -->
		<div class="form-control">
			<label class="label" for="description">
				<span class="label-text font-medium">{$t('wallet.description_optional')}</span>
			</label>
			<input
				id="description"
				bind:value={description}
				placeholder={$t('wallet.description_placeholder')}
				class="input input-bordered w-full"
				disabled={isLoading}
			/>
		</div>

		<!-- Send Button -->
		<div class="space-y-2">
			<button
				class="btn btn-primary w-full"
				onclick={handleSend}
				disabled={!isFormValid || isLoading}
			>
				{#if isLoading}
					<span class="loading loading-spinner loading-sm"></span>
					{$t('wallet.send.processing')}
				{:else}
					{$t(selectedNetwork.sendButtonKey)}
				{/if}
			</button>

			<!-- Validation Error Message -->
			{#if validationError()}
				<div class="alert alert-outline alert-warning">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-5 w-5 shrink-0 stroke-current"
						fill="none"
						viewBox="0 0 24 24"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
						/>
					</svg>
					<span class="text-sm">{$t(validationError() || '')}</span>
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	/* Ensure the dropdown has proper z-index and styling */
	.dropdown-content {
		max-height: 300px;
		overflow-y: auto;
	}

	/* Make the Max button look integrated with the input */
	.join .btn.join-item {
		border-left: none;
	}

	.join .input.join-item {
		border-right: none;
	}
</style>

<script lang="ts">
	import { t } from 'svelte-i18n';
	import { onMount } from 'svelte';
	import { appStore } from '$lib/stores/app.store';
	import { allAssets, walletManager } from '$lib/stores/wallet.store';
	import {
		validateRSKAddress,
		validateBitcoinAddress,
		type ValidationResult
	} from '$lib/utils/helpers/validators';
	import SubmarineSend from './SubmarineSend.svelte';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';

	type ExtendedAsset = {
		assetId: string;
		name: string;
		ticker: string;
		network: string;
		balance: number;
		formattedBalance: string;
		icon: string | null;
	};

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
	let amount = $state(''); // Amount in sats
	let description = $state('');
	let isLoading = $state(false);
	let errorMessage = $state<string | null>(null);
	let dropdownKey = $state(0);
	let addressValidation = $state<ValidationResult>({ isValid: true });
	let btcPrice = $state<number>(0);

	// Fetch BTC price for USD conversion
	onMount(async () => {
		try {
			btcPrice = await cryptoPriceService.getCurrentPrice('BTC');
		} catch (err) {
			console.error('Failed to fetch BTC price:', err);
			btcPrice = 60000; // Fallback price
		}
	});

	// Convert sats to RBTC
	let amountInRBTC = $derived(() => {
		const sats = parseFloat(amount) || 0;
		return sats / 100_000_000;
	});

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
					usesSats: true,
					isComingSoon: false
				},
				{
					value: 'rootstock-bitcoin',
					label: $t('wallet.send_form.network.rootstock_bitcoin'),
					description: $t('wallet.send_form.network.rootstock_bitcoin_description'),
					icon: '/images/chains/Bitcoin-Rootstock-logo.webp',
					placeholderKey: 'wallet.send.placeholder_rootstock',
					sendButtonKey: 'wallet.send.button_rootstock',
					usesSats: true,
					isComingSoon: false
				},
				{
					value: 'liquid-bitcoin',
					label: $t('wallet.send_form.network.liquid_bitcoin'),
					description: $t('wallet.send_form.network.liquid_bitcoin_description'),
					icon: '/images/chains/Liquid-Bitcoin.svg',
					placeholderKey: 'wallet.send.placeholder_liquid_btc',
					sendButtonKey: 'wallet.send.button_liquid_btc',
					usesSats: false,
					isComingSoon: true
				},
				{
					value: 'bitcoin',
					label: $t('wallet.send_form.network.bitcoin'),
					description: $t('wallet.send_form.network.bitcoin_description'),
					icon: '/images/chains/Bitcoin.svg',
					placeholderKey: 'wallet.send.placeholder_bitcoin',
					sendButtonKey: 'wallet.send.button_bitcoin',
					usesSats: false,
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
					usesSats: false,
					isComingSoon: true
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

	// Get current asset info based on selected network
	let currentAsset = $derived(() => {
		const assets = availableAssets();
		if (assets.length > 0) {
			return assets[0]; // Return the first (and typically only) asset for the selected network
		}
		return null;
	});

	// Validate address in real-time based on selected network
	$effect(() => {
		if (!recipientAddress.trim()) {
			addressValidation = { isValid: true }; // Empty is valid (not touched yet)
			return;
		}

		if (selectedNetwork.value === 'rootstock-bitcoin') {
			addressValidation = validateRSKAddress(recipientAddress);
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

	// Convert balance to sats if needed
	let balanceInSats = $derived.by(() => {
		if (!currentAsset()) return 0;
		if (selectedNetwork.usesSats) {
			// Convert BTC balance to sats
			return Math.floor((currentAsset()?.balance || 0) * 100_000_000);
		}
		return currentAsset()?.balance || 0;
	});

	// Enhanced form validation
	let isFormValid = $derived(
		recipientAddress?.trim() !== '' &&
			addressValidation.isValid &&
			String(amount).trim() !== '' &&
			amountInRBTC() > 0 &&
			currentAsset() &&
			amountInRBTC() <= (currentAsset()?.balance || 0)
	);

	// Get validation error message for display
	let validationError = $derived(() => {
		// Only show errors if user has interacted with the form
		const hasInteracted = recipientAddress.trim() !== '' && String(amount).trim() !== '';
		if (!hasInteracted) return null;

		// Check address validation
		if (recipientAddress.trim() === '') {
			return 'wallet.validation.address_required';
		}
		if (!addressValidation.isValid) {
			return 'wallet.validation.address_invalid';
		}

		// Check amount validation
		if (String(amount).trim() === '') {
			return 'wallet.validation.amount_required';
		}
		if (amountInRBTC() <= 0) {
			return 'wallet.validation.amount_positive';
		}
		if (!currentAsset()) {
			return 'wallet.validation.no_balance';
		}
		if (amountInRBTC() > (currentAsset()?.balance || 0)) {
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
				// Convert sats to RBTC for sending
				const amountRBTC = amountInRBTC();
				await walletManager.sendRBTC(recipientAddress, amountRBTC.toFixed(8));
			} else if (
				selectedNetwork.value === 'liquid-bitcoin' ||
				selectedNetwork.value === 'bitcoin'
			) {
				throw new Error('Liquid and Bitcoin transactions not yet implemented');
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

	// Estimate gas fee for specific amount and address
	// Returns gas fee in RBTC
	async function estimateGasFee() {
		try {
			const balance = currentAsset()?.balance || 0;
			if (balance <= 0) return 0.00003;

			if (
				selectedNetwork.value !== 'rootstock-bitcoin' ||
				!recipientAddress.trim() ||
				!addressValidation.isValid ||
				!amount ||
				parseFloat(amount) <= 0
			) {
				// Use 90% of balance for estimation to avoid "insufficient funds" error
				// (since we need some balance for gas itself)
				const estimateAmount = balance * 0.9;

				const gasEstimation = await walletManager.estimateRBTCGas(
					'0x0000000000000000000000000000000000000001',
					estimateAmount.toFixed(8)
				);
				const totalCost = parseFloat(gasEstimation.totalCostFormatted);
				const gasFee = totalCost - estimateAmount;
				return gasFee;
			}

			// Convert sats to RBTC for estimation
			const amountRBTC = amountInRBTC();
			const gasEstimation = await walletManager.estimateRBTCGas(
				recipientAddress,
				amountRBTC.toFixed(8)
			);
			const totalCost = parseFloat(gasEstimation.totalCostFormatted);
			return totalCost - amountRBTC;
		} catch (error) {
			console.warn('Failed to estimate gas:', error);
			// Fallback to a reasonable default
			return 0.00003; // 0.00003 RBTC
		}
	}

	async function handleMaxAmount() {
		if (!currentAsset()) {
			return;
		}
		const feeEstimate = await estimateGasFee();
		const maxRBTC = Math.max(0, (currentAsset()?.balance || 0) - feeEstimate);
		const maxSats = Math.floor(maxRBTC * 100_000_000);
		amount = maxSats.toString();
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
										dropdownKey++;
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

	<!-- Input Fields - Hidden for Coming Soon networks and Lightning Bitcoin (uses SubmarineSend) -->
	{#if selectedAsset !== 'usd' && !selectedNetwork.isComingSoon}
		<!-- Submarine Swap for Lightning Bitcoin -->
		{#if selectedNetwork.value === 'lightning-bitcoin'}
			<SubmarineSend />
		{:else}
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

			<!-- Amount -->
			<div class="form-control">
				<label class="label" for="amount">
					<span class="label-text font-medium">{$t('wallet.swap.amount_btc')}</span>
				</label>

				<!-- Amount Input with Max Button -->
				<div class="join w-full">
					<input
						id="amount"
						bind:value={amount}
						type="number"
						step="1"
						min="0"
						placeholder="100000"
						style="border-radius: 0.5rem 0 0 0.5rem !important; border-right-color: var(--color-primary) !important;"
						class="input input-bordered join-item flex-1 rounded-r-none"
						class:input-error={amount && !(String(amount).trim() !== '' && parseFloat(amount) > 0)}
						disabled={isLoading}
					/>
					<button
						class="btn btn-primary join-item rounded-l-none"
						onclick={handleMaxAmount}
						disabled={isLoading || !currentAsset()}
					>
						{$t('wallet.max')}
					</button>
				</div>
			</div>

			<!-- Fee Estimation for Rootstock -->
			{#if selectedNetwork.value === 'rootstock-bitcoin' && amount && parseFloat(amount) > 0}
				{#await estimateGasFee()}
					<div
						class="border-base-300 bg-base-200 flex items-center justify-center gap-2 rounded-lg border p-4"
					>
						<span class="loading loading-spinner loading-sm"></span>
						<span class="text-sm">{$t('wallet.swap.loading_fees')}</span>
					</div>
				{:then gasFee}
					{@const amountSats = parseFloat(amount)}
					{@const gasFeeInSats = Math.floor(gasFee * 100_000_000)}
					{@const totalSats = amountSats + gasFeeInSats}
					<div class="border-base-300 bg-base-200 rounded-lg border p-3">
						<div class="space-y-1.5 text-xs">
							<!-- Send Amount -->
							<div class="flex items-center justify-between">
								<span class="opacity-70">{$t('wallet.amount')}:</span>
								<div class="text-right">
									<span class="font-semibold">{amountSats.toLocaleString()} {$t('wallet.sats')}</span>
									{#if btcPrice > 0}
										<span class="ml-2 opacity-60">
											${((amountSats / 100_000_000) * btcPrice).toFixed(2)}
										</span>
									{/if}
								</div>
							</div>

							<!-- Network Gas Fee -->
							<div class="flex items-center justify-between">
								<span class="opacity-70">{$t('wallet.network_fee')}:</span>
								<div class="text-right">
									<span>{gasFeeInSats.toLocaleString()} {$t('wallet.sats')}</span>
									{#if btcPrice > 0}
										<span class="ml-2 opacity-60">
											${((gasFeeInSats / 100_000_000) * btcPrice).toFixed(2)}
										</span>
									{/if}
								</div>
							</div>

							<div class="divider my-1.5"></div>

							<!-- Total Required -->
							<div class="text-primary flex items-center justify-between text-sm font-bold">
								<span>{$t('wallet.swap.submarine.total_required')}:</span>
								<div class="text-right">
									<span>{totalSats.toLocaleString()} {$t('wallet.sats')}</span>
									{#if btcPrice > 0}
										<span class="ml-2 opacity-70">
											${((totalSats / 100_000_000) * btcPrice).toFixed(2)}
										</span>
									{/if}
								</div>
							</div>
						</div>
					</div>
				{/await}
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
			</div>
		{/if}
	{/if}
</div>

<style>
	/* Ensure the dropdown has proper z-index and styling */
	.dropdown-content {
		max-height: 300px;
		overflow-y: auto;
	}
</style>

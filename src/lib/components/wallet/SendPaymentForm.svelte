<script lang="ts">
	import { t } from 'svelte-i18n';
	import { onMount } from 'svelte';
	import { Capacitor } from '@capacitor/core';
	import { appStore } from '$lib/stores/app.store';
	import { walletStore, walletManager, allAssets } from '$lib/stores/wallet.store';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';
	import { parsePaymentAddress, type ParsedPaymentAddress } from '$lib/utils/helpers/paymentAddressParser';
	import { getBiometricData } from '$lib/utils/helpers/biometrics';
	import { getWebBiometricData } from '$lib/utils/helpers/webBiometrics';
	import { triggerHaptic, ImpactStyle } from '$lib/utils/helpers/haptics';
	import QrCodeScanner from '$lib/components/QrCodeScanner.svelte';
	import CalculatorKeypad from '$lib/components/wallet/CalculatorKeypad.svelte';
	import AmountDisplay from '$lib/components/wallet/AmountDisplay.svelte';
	import TransactionSuccessScreen from '$lib/components/wallet/TransactionSuccessScreen.svelte';
	import SubmarineSend from '$lib/components/wallet/SubmarineSend.svelte';
	import type { Barcode } from '@capacitor-mlkit/barcode-scanning';

	interface Props {
		onCancel: () => void;
		onSuccess?: (txHash: string, network: string) => void;
	}

	const props = $props<Props>();

	// Tab state
	let activeTab = $state<'scan' | 'enter'>('scan'); // Default to 'scan'
	let showConfirmation = $state(false);
	let showSuccessScreen = $state(false);
	let successTxHash = $state<string | null>(null);
	let successNetwork = $state<string | null>(null);

	// Payment data
	let addressInput = $state('');
	let amount = $state('');
	let unit = $state<'sats' | 'usd'>('sats');
	let memo = $state('');
	let btcPrice = $state<number>(0);

	// Parsed payment data
	let parsedData = $state<ParsedPaymentAddress | null>(null);
	let detectedNetwork = $state<string | null>(null);
	let detectedAmount = $state<number | null>(null);
	let detectedMemo = $state<string | null>(null);
	let amountRequired = $state(true);
	let addressError = $state<string | null>(null);

	// Fee estimation
	let estimatedFees = $state<number>(0);
	let isLoadingFees = $state(false);

	// Authentication
	let authThreshold = $state(0); // Get from user preferences (default: $0 = always require)
	let isAuthenticated = $state(false);

	// Large amount warning
	const LARGE_AMOUNT_THRESHOLD = 1000; // $1,000 USD
	let largeAmountConfirmed = $state(false);

	// Recent addresses (simplified - would load from transaction history)
	let recentAddresses = $state<Array<{ address: string; network: string; label?: string }>>([]);
	let showRecentAddresses = $state(false);

	// Derived values
	const amountInSats = $derived.by(() => {
		if (detectedAmount !== null) return detectedAmount;
		if (unit === 'sats') {
			const parsed = parseFloat(amount);
			return isNaN(parsed) ? 0 : Math.floor(parsed);
		} else {
			const usdAmount = parseFloat(amount);
			if (isNaN(usdAmount) || btcPrice === 0) return 0;
			return Math.floor((usdAmount / btcPrice) * 100_000_000);
		}
	});

	const amountInUSD = $derived.by(() => {
		if (btcPrice === 0) return 0;
		return (amountInSats / 100_000_000) * btcPrice;
	});

	const showLargeAmountWarning = $derived(amountInUSD > LARGE_AMOUNT_THRESHOLD);
	const requiresAuth = $derived(amountInUSD >= authThreshold);

	const totalToSend = $derived(amountInSats + estimatedFees);
	const receiverGets = $derived(amountInSats);

	const isFormValid = $derived.by(() => {
		if (!parsedData?.isValid && !addressInput.trim()) return false;
		if (amountRequired && amountInSats <= 0) return false;
		if (showLargeAmountWarning && !largeAmountConfirmed) return false;
		if (requiresAuth && !isAuthenticated) return false;
		return true;
	});

	// Initialize
	onMount(async () => {
		try {
			btcPrice = await cryptoPriceService.getCurrentPrice('BTC');
		} catch (error) {
			console.error('Failed to fetch BTC price:', error);
		}
	});

	// Handle QR scan
	async function handleQRScan(barcode: Barcode) {
		try {
			const parsed = await parsePaymentAddress(barcode.rawValue);
			if (!parsed.isValid) {
				appStore.showErrorToast($t('wallet.send.invalid_qr_code'));
				return;
			}

			parsedData = parsed;
			addressInput = parsed.address;
			detectedNetwork = parsed.network;
			detectedAmount = parsed.amount;
			detectedMemo = parsed.memo || null;
			amountRequired = parsed.amount === null;

			if (parsed.amount !== null) {
				amount = parsed.amount.toString();
			}
			if (parsed.memo) {
				memo = parsed.memo;
			}

			// Switch to confirmation screen
			showConfirmation = true;
			await updateFeeEstimate();
		} catch (error) {
			console.error('Failed to parse QR code:', error);
			appStore.showErrorToast($t('wallet.send.failed_to_parse_qr'));
		}
	}

	// Handle address input
	async function handleAddressInput() {
		addressError = null;
		if (!addressInput.trim()) {
			parsedData = null;
			detectedNetwork = null;
			detectedAmount = null;
			detectedMemo = null;
			amountRequired = true;
			return;
		}

		try {
			const parsed = await parsePaymentAddress(addressInput);
			if (parsed.isValid) {
				parsedData = parsed;
				detectedNetwork = parsed.network;
				detectedAmount = parsed.amount;
				detectedMemo = parsed.memo;
				amountRequired = parsed.amount === null;

				if (parsed.amount !== null) {
					amount = parsed.amount.toString();
				}
				if (parsed.memo) {
					memo = parsed.memo;
				}

				await updateFeeEstimate();
			} else {
				addressError = $t('wallet.send.invalid_address');
				parsedData = null;
				detectedNetwork = null;
				detectedAmount = null;
				detectedMemo = null;
				amountRequired = true;
			}
		} catch (error) {
			console.error('Failed to parse address:', error);
			addressError = $t('wallet.send.failed_to_parse_address');
		}
	}

	// Update fee estimate
	async function updateFeeEstimate() {
		if (amountInSats === 0 || !detectedNetwork) {
			estimatedFees = 0;
			return;
		}

		isLoadingFees = true;
		try {
			switch (detectedNetwork) {
				case 'lightning-bitcoin':
					// Use submarine swap fee estimation
					const pairsData = await walletManager.getSubmarineSwapPairs();
					const pair = pairsData?.['RBTC']?.['BTC'];
					if (pair) {
						const serviceFee = Math.ceil((amountInSats * pair.fees.percentage) / 100);
						const minerFee = pair.fees.minerFees || 0;
						estimatedFees = serviceFee + minerFee;
					} else {
						estimatedFees = Math.ceil((amountInSats * 0.1) / 100) + 32; // Fallback
					}
					break;
				case 'rootstock-bitcoin':
					if ($walletStore.rsk.connected && $walletStore.rsk.address) {
						const amountRBTC = (amountInSats / 100_000_000).toFixed(8);
						const gasEstimation = await walletManager.estimateRBTCGas(
							addressInput || $walletStore.rsk.address,
							amountRBTC
						);
						const gasFeeRBTC = parseFloat(gasEstimation.totalCostFormatted) - parseFloat(amountRBTC);
						estimatedFees = Math.floor(gasFeeRBTC * 100_000_000);
					} else {
						estimatedFees = 3000; // Fallback
					}
					break;
				default:
					estimatedFees = 0;
			}
		} catch (error) {
			console.error('Failed to estimate fees:', error);
			estimatedFees = 0;
		} finally {
			isLoadingFees = false;
		}
	}

	// Recalculate fees when amount or network changes
	$effect(async () => {
		amountInSats;
		detectedNetwork;
		await updateFeeEstimate();
	});

	// Handle calculator input
	function handleCalculatorInput(value: string) {
		amount = value;
	}

	// Handle unit toggle
	function handleUnitToggle() {
		unit = unit === 'sats' ? 'usd' : 'sats';
	}

	// Require authentication
	async function requireAuthentication(): Promise<boolean> {
		try {
			if (!requiresAuth) return true;

			const isMobile = Capacitor.getPlatform() !== 'web';
			if (isMobile) {
				const biometricData = await getBiometricData('biometrics', true);
				return !!biometricData;
			} else {
				const passkeyData = await getWebBiometricData(true);
				return !!passkeyData;
			}
		} catch (error) {
			console.error('Authentication failed:', error);
			return false;
		}
	}

	// Handle send
	async function handleSend() {
		if (!isFormValid) return;

		// Require authentication if needed
		if (requiresAuth && !isAuthenticated) {
			const authenticated = await requireAuthentication();
			if (!authenticated) {
				appStore.showErrorToast($t('wallet.send.authentication_required'));
				return;
			}
			isAuthenticated = true;
		}

		isSending = true;
		sendError = null;

		try {
			const recipient = parsedData?.address || addressInput.trim();
			const finalAmount = totalToSend; // Amount including fees
			const network = detectedNetwork || 'rootstock-bitcoin';

			if (!recipient || finalAmount <= 0) {
				throw new Error($t('wallet.send.error.invalid_payment_details'));
			}

			let txHash: string | null = null;

			if (network === 'lightning-bitcoin') {
				// Lightning send via submarine swap
				// This would use SubmarineSend component logic
				// For now, show placeholder
				appStore.showErrorToast($t('wallet.send.usd_not_available'));
				isSending = false;
				return;
			} else if (network === 'rootstock-bitcoin') {
				// RSK direct send
				const amountRBTC = finalAmount / 100_000_000;
				const tx = await walletManager.sendRBTC(recipient, amountRBTC.toFixed(8), memo || '');
				txHash = tx.hash;
			} else if (network === 'liquid-bitcoin') {
				// Liquid chain swap send
				// This would use LBTCChainSwapSend component logic
				appStore.showErrorToast($t('wallet.send.network_not_available'));
				isSending = false;
				return;
			} else if (network === 'usdt-bsc') {
				// BSC USDT send
				// Convert amount from sats to USDT (assuming 1:1 with USD for simplicity)
				const usdtAmount = amountInUSD.toFixed(2);
				const tx = await walletManager.sendBSCUSDT(recipient, usdtAmount, memo || '');
				txHash = tx.hash;
			} else {
				throw new Error($t('wallet.send.network_not_available'));
			}

			if (txHash) {
				// Show success screen
				successTxHash = txHash;
				successNetwork = network;
				showSuccessScreen = true;
				triggerHaptic(ImpactStyle.Medium);
				appStore.showSuccessToast($t('wallet.send.transaction_sent'));

				// Call onSuccess callback
				if (props.onSuccess) {
					props.onSuccess(txHash, network);
				}
			} else {
				throw new Error($t('wallet.send.transaction_failed'));
			}
		} catch (err) {
			console.error('Send failed:', err);
			sendError = err instanceof Error ? err.message : $t('wallet.send.transaction_failed');
			appStore.showErrorToast(sendError);
			triggerHaptic(ImpactStyle.Heavy);
		} finally {
			isSending = false;
		}
	}

	// Format sats
	function formatSats(sats: number): string {
		return new Intl.NumberFormat('en-US').format(sats);
	}

	// Format USD
	function formatUSD(usd: number): string {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD',
			minimumFractionDigits: 2,
			maximumFractionDigits: 2
		}).format(usd);
	}
</script>

<div class="send-payment-form space-y-6">
	<!-- Tab Navigation -->
	<div class="tabs tabs-boxed">
		<button
			class="tab flex-1"
			class:tab-active={activeTab === 'scan'}
			onclick={() => {
				activeTab = 'scan';
				showConfirmation = false;
			}}
		>
			{$t('wallet.send.scan_qr_code')}
		</button>
		<button
			class="tab flex-1"
			class:tab-active={activeTab === 'enter'}
			onclick={() => {
				activeTab = 'enter';
				showConfirmation = false;
			}}
		>
			{$t('wallet.send.enter_payment_details')}
		</button>
	</div>

	{#if activeTab === 'scan'}
		{#if !showConfirmation}
			<!-- QR Code Scanner -->
			<div class="flex flex-col items-center gap-4">
				<h3 class="text-xl font-bold">{$t('wallet.send.scan_qr_code')}</h3>
				<p class="text-sm text-base-content/70">{$t('wallet.send.scan_qr_code_description')}</p>

				<QrCodeScanner onScan={handleQRScan} onClose={() => (activeTab = 'enter')} />

				<button class="btn btn-ghost btn-sm" onclick={() => (activeTab = 'enter')}>
					{$t('wallet.send.enter_details_instead')}
				</button>
			</div>
		{:else}
			<!-- Confirmation Screen -->
			<div class="space-y-6">
				<div class="flex items-center justify-between">
					<h3 class="text-xl font-bold">{$t('wallet.send.confirm_payment')}</h3>
					<button class="btn btn-ghost btn-sm" onclick={() => (showConfirmation = false)}>
						{$t('common.back')}
					</button>
				</div>

				<!-- Amount Display -->
				<div class="flex justify-center">
					<AmountDisplay {amount} {unit} onUnitToggle={handleUnitToggle} {btcPrice} />
				</div>

				<!-- Network Display -->
				{#if detectedNetwork}
					<div class="alert alert-info">
						<span>Network: {detectedNetwork}</span>
					</div>
				{/if}

				<!-- Address Display -->
				<div class="form-control">
					<label class="label">
						<span class="label-text font-semibold">{$t('wallet.address')}</span>
					</label>
					<div class="input input-bordered w-full break-all">{addressInput}</div>
				</div>

				<!-- Conditional Amount Field -->
				{#if amountRequired}
					<div class="form-control">
						<label class="label">
							<span class="label-text font-semibold">{$t('wallet.send.amount')}</span>
						</label>
						<CalculatorKeypad {unit} onInput={handleCalculatorInput} />
					</div>
				{/if}

				<!-- Memo Display -->
				{#if detectedMemo || memo}
					<div class="form-control">
						<label class="label">
							<span class="label-text">{$t('wallet.send.memo')}</span>
						</label>
						<input type="text" class="input input-bordered w-full" bind:value={memo} disabled={!!detectedMemo} />
					</div>
				{/if}

				<!-- Fee Display -->
				{#if isLoadingFees}
					<div class="flex items-center justify-center gap-2 rounded-lg border border-base-300 bg-base-200 p-4">
						<span class="loading loading-spinner loading-sm"></span>
						<span class="text-sm">{$t('wallet.swap.loading_fees')}</span>
					</div>
				{:else if estimatedFees > 0}
					<div class="space-y-2 rounded-lg border border-base-300 bg-base-200 p-4">
						<div class="flex items-center justify-between text-sm">
							<span class="opacity-70">{$t('wallet.send.receiver_gets')}:</span>
							<span class="font-semibold">{formatSats(receiverGets)} {$t('wallet.sats')}</span>
						</div>
						<div class="flex items-center justify-between text-sm">
							<span class="opacity-70">{$t('wallet.network_fee')}:</span>
							<span>{formatSats(estimatedFees)} {$t('wallet.sats')}</span>
						</div>
						<div class="divider my-1.5"></div>
						<div class="flex items-center justify-between font-bold text-lg">
							<span>{$t('wallet.send.total_to_send')}:</span>
							<span class="text-primary">{formatSats(totalToSend)} {$t('wallet.sats')}</span>
						</div>
					</div>
				{/if}

				<!-- Large Amount Warning -->
				{#if showLargeAmountWarning && !largeAmountConfirmed}
					<div class="alert alert-outline alert-error">
						<svg class="w-6 h-6 shrink-0 stroke-current" fill="none" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
							/>
						</svg>
						<div class="flex-1">
							<h3 class="font-bold">{$t('wallet.send.large_amount_warning.title')}</h3>
							<div class="text-sm">
								<p>
									{$t('wallet.send.large_amount_warning.message', {
										values: { amount: formatUSD(amountInUSD) }
									})}
								</p>
								<div class="mt-2 space-y-1 rounded bg-base-200 p-2">
									<div>
										{$t('wallet.send.amount_in_sats')}: <strong>{formatSats(amountInSats)} {$t('wallet.sats')}</strong>
									</div>
									<div>
										{$t('wallet.send.amount_in_usd')}: <strong>{formatUSD(amountInUSD)}</strong>
									</div>
								</div>
							</div>
							<div class="form-control mt-4">
								<label class="label cursor-pointer justify-start gap-2">
									<input type="checkbox" class="checkbox checkbox-error" bind:checked={largeAmountConfirmed} />
									<span class="label-text">{$t('wallet.send.large_amount_warning.confirm_checkbox')}</span>
								</label>
							</div>
						</div>
					</div>
				{/if}

				<!-- Action Buttons -->
				<div class="flex gap-3">
					<button class="btn btn-error flex-1" onclick={() => (showConfirmation = false)}>
						{$t('common.cancel')}
					</button>
					<button
						class="btn btn-primary flex-1"
						onclick={handleSend}
						disabled={!isFormValid || isLoadingFees}
					>
						{#if requiresAuth && !isAuthenticated}
							{$t('wallet.send.authenticate_and_send')}
						{:else}
							{$t('wallet.send.send')}
						{/if}
					</button>
				</div>
			</div>
		{/if}
	{:else}
		<!-- Enter Payment Details Tab -->
		<div class="space-y-6">
			<div class="flex items-center justify-between">
				<h3 class="text-xl font-bold">{$t('wallet.send.enter_payment_details')}</h3>
				<button class="btn btn-ghost btn-sm" onclick={() => (activeTab = 'scan')}>
					{$t('wallet.send.scan_qr_code_instead')}
				</button>
			</div>

			<!-- Address Input -->
			<div class="form-control">
				<label class="label" for="address-input">
					<span class="label-text">{$t('wallet.send.address_or_invoice')}</span>
				</label>
				<div class="relative">
					<input
						id="address-input"
						type="text"
						class="input input-bordered w-full"
						class:input-error={!!addressError}
						placeholder={$t('wallet.send.address_placeholder')}
						bind:value={addressInput}
						oninput={handleAddressInput}
						onfocus={() => (showRecentAddresses = recentAddresses.length > 0)}
						onblur={() => setTimeout(() => (showRecentAddresses = false), 200)}
					/>
					{#if showRecentAddresses && recentAddresses.length > 0}
						<div
							class="absolute z-10 mt-1 w-full max-h-60 overflow-y-auto rounded-lg border border-base-300 bg-base-100 shadow-lg"
						>
							{#each recentAddresses as recentAddress}
								<button
									class="w-full px-4 py-2 text-left hover:bg-base-200 flex items-center justify-between"
									onclick={() => {
										addressInput = recentAddress.address;
										showRecentAddresses = false;
										handleAddressInput();
									}}
								>
									<div class="flex-1 min-w-0">
										<div class="truncate font-semibold">{recentAddress.label || recentAddress.address.slice(0, 20)}...</div>
										<div class="text-xs text-base-content/70">{recentAddress.network}</div>
									</div>
								</button>
							{/each}
						</div>
					{/if}
				</div>
				{#if addressError}
					<div class="label">
						<span class="label-text-alt text-error">{addressError}</span>
					</div>
				{/if}
			</div>

			<!-- Auto-detected Network Display -->
			{#if detectedNetwork}
				<div class="alert alert-info">
					<span>Network: {detectedNetwork}</span>
				</div>
			{/if}

			<!-- Amount Field (conditional) -->
			{#if amountRequired}
				<div class="form-control">
					<label class="label">
						<span class="label-text font-semibold">{$t('wallet.send.amount')}</span>
					</label>
					<div class="flex justify-center">
						<AmountDisplay {amount} {unit} onUnitToggle={handleUnitToggle} {btcPrice} />
					</div>
					<CalculatorKeypad {unit} onInput={handleCalculatorInput} />
				</div>
			{:else if detectedAmount}
				<div class="alert alert-success">
					<span>
						{$t('wallet.send.amount')}: {formatSats(detectedAmount)} {$t('wallet.sats')} ({$t('wallet.send.from_invoice')})
					</span>
				</div>
			{/if}

			<!-- Memo Field -->
			{#if detectedMemo || memo}
				<div class="form-control">
					<label class="label">
						<span class="label-text">{$t('wallet.send.memo')}</span>
					</label>
					<input
						type="text"
						class="input input-bordered w-full"
						bind:value={memo}
						disabled={!!detectedMemo}
						placeholder={$t('wallet.send.memo_placeholder')}
					/>
				</div>
			{/if}

			<!-- Fee Display -->
			{#if isLoadingFees}
				<div class="flex items-center justify-center gap-2 rounded-lg border border-base-300 bg-base-200 p-4">
					<span class="loading loading-spinner loading-sm"></span>
					<span class="text-sm">{$t('wallet.swap.loading_fees')}</span>
				</div>
			{:else if estimatedFees > 0 && amountInSats > 0}
				<div class="space-y-2 rounded-lg border border-base-300 bg-base-200 p-4">
					<div class="flex items-center justify-between text-sm">
						<span class="opacity-70">{$t('wallet.send.receiver_gets')}:</span>
						<span class="font-semibold">{formatSats(receiverGets)} {$t('wallet.sats')}</span>
					</div>
					<div class="flex items-center justify-between text-sm">
						<span class="opacity-70">{$t('wallet.network_fee')}:</span>
						<span>{formatSats(estimatedFees)} {$t('wallet.sats')}</span>
					</div>
					<div class="divider my-1.5"></div>
					<div class="flex items-center justify-between font-bold text-lg">
						<span>{$t('wallet.send.total_to_send')}:</span>
						<span class="text-primary">{formatSats(totalToSend)} {$t('wallet.sats')}</span>
					</div>
				</div>
			{/if}

			<!-- Large Amount Warning -->
			{#if showLargeAmountWarning && !largeAmountConfirmed}
				<div class="alert alert-outline alert-error">
					<svg class="w-6 h-6 shrink-0 stroke-current" fill="none" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
						/>
					</svg>
					<div class="flex-1">
						<h3 class="font-bold">{$t('wallet.send.large_amount_warning.title')}</h3>
						<div class="text-sm">
							<p>
								{$t('wallet.send.large_amount_warning.message', {
									values: { amount: formatUSD(amountInUSD) }
								})}
							</p>
							<div class="mt-2 space-y-1 rounded bg-base-200 p-2">
								<div>
									{$t('wallet.send.amount_in_sats')}: <strong>{formatSats(amountInSats)} {$t('wallet.sats')}</strong>
								</div>
								<div>
									{$t('wallet.send.amount_in_usd')}: <strong>{formatUSD(amountInUSD)}</strong>
								</div>
							</div>
						</div>
						<div class="form-control mt-4">
							<label class="label cursor-pointer justify-start gap-2">
								<input type="checkbox" class="checkbox checkbox-error" bind:checked={largeAmountConfirmed} />
								<span class="label-text">{$t('wallet.send.large_amount_warning.confirm_checkbox')}</span>
							</label>
						</div>
					</div>
				</div>
			{/if}

			<!-- Action Buttons -->
			<div class="flex gap-3">
				<button
					class="btn btn-error flex-1 min-h-[48px] md:min-h-[56px] touch-manipulation select-none active:scale-95 transition-transform duration-100"
					style="-webkit-tap-highlight-color: transparent;"
					onclick={() => {
						triggerHaptic(ImpactStyle.Light);
						props.onCancel();
					}}
				>
					{$t('common.cancel')}
				</button>
				<button
					class="btn btn-primary flex-1 min-h-[48px] md:min-h-[56px] touch-manipulation select-none active:scale-95 transition-transform duration-100"
					style="-webkit-tap-highlight-color: transparent;"
					onclick={() => {
						triggerHaptic(ImpactStyle.Medium);
						handleSend();
					}}
					disabled={!isFormValid || isLoadingFees}
				>
					{#if requiresAuth && !isAuthenticated}
						{$t('wallet.send.authenticate_and_send')}
					{:else}
						{$t('wallet.send.send')}
					{/if}
				</button>
			</div>
		</div>
	{/if}

	<!-- Success Screen -->
	{#if showSuccessScreen && successTxHash && successNetwork}
		<TransactionSuccessScreen
			txHash={successTxHash}
			network={successNetwork}
			amount={amountInSats}
			recipient={parsedData?.address || addressInput}
			onClose={() => {
				showSuccessScreen = false;
				props.onCancel();
			}}
		/>
	{/if}
</div>


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
	import AmountDisplay from '$lib/components/wallet/AmountDisplay.svelte';
	import AmountInputSection from '$lib/components/wallet/AmountInputSection.svelte';
	import TransactionSuccessScreen from '$lib/components/wallet/TransactionSuccessScreen.svelte';
	import SubmarineSend from '$lib/components/wallet/SubmarineSend.svelte';
	import type { Barcode } from '@capacitor-mlkit/barcode-scanning';
	import IconClose from '~icons/mdi/close';
	import IconSend from '~icons/mdi/send';

	interface Props {
		onCancel: () => void;
		onSuccess?: (txHash: string, network: string) => void;
	}

	let { onCancel, onSuccess }: Props = $props();

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
	let mathExpression = $state('');
	let memo = $state('');
	let descriptionExpanded = $state(false);
	let btcPrice = $state<number>(0);
	let calculatorKey = $state(0);

	// Parsed payment data
	let parsedData = $state<ParsedPaymentAddress | null>(null);
	let detectedNetwork = $state<string | null>(null);
	let detectedAmount = $state<number | null>(null);
	let detectedMemo = $state<string | null>(null);
	let amountRequired = $state(true);
	let addressError = $state<string | null>(null);

	// Fee estimation
	let estimatedFees = $state<{
		serviceFee: number; // in sats
		networkFee: number; // in sats
		totalFees: number; // in sats
	} | null>(null);
	let isLoadingFees = $state(false);
	let feeError = $state<string | null>(null);
	let networkFeeExpanded = $state(false); // Accordion state for network fee breakdown

	// Send state
	let isSending = $state(false);
	let sendError = $state<string | null>(null);

	// Authentication
	let authThreshold = $state(0); // Get from user preferences (default: $0 = always require)
	let isAuthenticated = $state(false);

	// Large amount warning
	const LARGE_AMOUNT_THRESHOLD = 1000; // $1,000 USD

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

	const totalToSend = $derived(amountInSats + (estimatedFees?.totalFees || 0));
	const receiverGets = $derived(amountInSats);
	
	// Total to send in USD
	const totalToSendUSD = $derived.by(() => {
		if (totalToSend === 0 || btcPrice === 0) return 0;
		return (totalToSend / 100_000_000) * btcPrice;
	});

	const isFormValid = $derived.by(() => {
		if (!parsedData?.isValid && !addressInput.trim()) return false;
		if (amountRequired && amountInSats <= 0) return false;
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
			estimatedFees = null;
			feeError = null;
			return;
		}

		isLoadingFees = true;
		feeError = null;
		try {
			switch (detectedNetwork) {
				case 'lightning-bitcoin':
					// Use submarine swap fee estimation
					const pairsData = await walletManager.getSubmarineSwapPairs();
					const pair = pairsData?.['RBTC']?.['BTC'];
					if (pair) {
						const serviceFee = Math.ceil((amountInSats * pair.fees.percentage) / 100);
						const minerFee = pair.fees.minerFees || 0;
						estimatedFees = {
							serviceFee,
							networkFee: minerFee,
							totalFees: serviceFee + minerFee
						};
					} else {
						const serviceFee = Math.ceil((amountInSats * 0.1) / 100);
						const networkFee = 32;
						estimatedFees = {
							serviceFee,
							networkFee,
							totalFees: serviceFee + networkFee
						};
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
						const networkFee = Math.floor(gasFeeRBTC * 100_000_000);
						estimatedFees = {
							serviceFee: 0,
							networkFee,
							totalFees: networkFee
						};
					} else {
						const networkFee = 3000; // Fallback
						estimatedFees = {
							serviceFee: 0,
							networkFee,
							totalFees: networkFee
						};
					}
					break;
				default:
					estimatedFees = null;
			}
		} catch (error) {
			console.error('Failed to estimate fees:', error);
			feeError = $t('wallet.swap.fee_estimation_failed');
			estimatedFees = null;
		} finally {
			isLoadingFees = false;
		}
	}

	// Recalculate fees when amount or network changes
	$effect(() => {
		amountInSats;
		detectedNetwork;
		updateFeeEstimate();
	});

	// Handle calculation change from calculator
	function handleCalculationChange(expression: string, result: number) {
		mathExpression = expression;
		if (result > 0 || expression === '') {
			if (unit === 'sats') {
				amount = Math.floor(result).toString();
			} else {
				amount = result.toFixed(2).replace(/\.?0+$/, '');
			}
		}
	}

	// Handle unit change
	function handleUnitChange(newUnit: 'sats' | 'usd') {
		unit = newUnit;
		amount = '';
		mathExpression = '';
		calculatorKey++;
	}

	// Clear calculator
	function handleClearCalculator() {
		amount = '';
		mathExpression = '';
		calculatorKey++;
	}

	// Handle unit toggle (for AmountDisplay compatibility)
	function handleUnitToggle() {
		handleUnitChange(unit === 'sats' ? 'usd' : 'sats');
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
				txHash = await walletManager.sendRBTC(recipient, amountRBTC.toFixed(8));
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
				txHash = await walletManager.sendBSCUSDT(recipient, usdtAmount);
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
				if (onSuccess) {
					onSuccess(txHash, network);
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
			class:bg-primary={activeTab === 'scan'}
			class:text-primary-content={activeTab === 'scan'}
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
			class:bg-primary={activeTab === 'enter'}
			class:text-primary-content={activeTab === 'enter'}
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
				<p class="text-sm text-base-content/70">{$t('wallet.send.scan_qr_code_description')}</p>

				<QrCodeScanner onScan={handleQRScan} onClose={() => (activeTab = 'enter')} />

				<button class="btn btn-outline" onclick={() => (activeTab = 'enter')}>
					{$t('wallet.send.enter_details_instead')}
				</button>
			</div>
		{:else}
			<!-- Confirmation Screen -->
			<div class="space-y-6">
				<div class="flex items-center justify-end">
					<button class="btn btn-ghost btn-sm" onclick={() => (showConfirmation = false)}>
						{$t('common.back')}
					</button>
				</div>

				<!-- Amount Display -->
				<div class="flex flex-col items-center gap-2">
					<AmountDisplay {amount} {unit} onUnitToggle={handleUnitToggle} {btcPrice} />
					{#if showLargeAmountWarning}
						<p class="text-error text-sm text-center">
							{$t('wallet.send.large_amount_warning.message', {
								values: { amount: formatUSD(amountInUSD) }
							})}
						</p>
					{/if}
				</div>

				<!-- Network Display -->
				{#if detectedNetwork}
					<div class="alert alert-info">
						<span>Network: {detectedNetwork}</span>
					</div>
				{/if}

				<!-- Address Display -->
				<div class="form-control">
					<div class="input input-bordered w-full break-all">{addressInput}</div>
				</div>

				<!-- Conditional Amount Field -->
				{#if amountRequired}
					<div class="form-control">
						<AmountInputSection
							{amount}
							{unit}
							{mathExpression}
							{calculatorKey}
							onAmountChange={(value) => (amount = value)}
							onUnitChange={handleUnitChange}
							onCalculationChange={handleCalculationChange}
							onClear={handleClearCalculator}
						/>
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
			<!-- Address Input -->
			<div class="form-control">
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
				<div class="form-control space-y-2">
					<AmountInputSection
						{amount}
						{unit}
						{mathExpression}
						{calculatorKey}
						{memo}
						{descriptionExpanded}
						estimatedFees={estimatedFees?.totalFees ?? 0}
						totalAmount={totalToSend}
						amountInSats={amountInSats}
						{btcPrice}
						isLoadingFees={isLoadingFees}
						onAmountChange={(value) => (amount = value)}
						onUnitChange={handleUnitChange}
						onCalculationChange={handleCalculationChange}
						onClear={handleClearCalculator}
						onMemoChange={(value) => (memo = value)}
						onDescriptionToggle={(expanded) => (descriptionExpanded = expanded)}
					/>
					{#if showLargeAmountWarning}
						<p class="text-error text-sm text-center">
							{$t('wallet.send.large_amount_warning.message', {
								values: { amount: formatUSD(amountInUSD) }
							})}
						</p>
					{/if}
				</div>
			{:else if detectedAmount}
				<div class="alert alert-success">
					<span>
						{$t('wallet.send.amount')}: {formatSats(detectedAmount)} {$t('wallet.sats')} ({$t('wallet.send.from_invoice')})
					</span>
				</div>
			{/if}

			<!-- Memo Field (for detected memo from invoice) -->
			{#if detectedMemo}
				<div class="form-control">
					<label class="label">
						<span class="label-text">{$t('wallet.send.memo')}</span>
					</label>
					<input
						type="text"
						class="input input-bordered w-full"
						bind:value={memo}
						disabled={true}
						placeholder={$t('wallet.send.memo_placeholder')}
					/>
				</div>
			{/if}

			<!-- Network Fee Accordion -->
			{#if isLoadingFees}
				<div class="flex items-center justify-center gap-2 rounded-lg border border-base-300 bg-base-200 p-4">
					<span class="loading loading-spinner loading-sm"></span>
					<span class="text-sm">{$t('wallet.swap.loading_fees')}</span>
				</div>
			{:else if feeError}
				<div class="alert alert-outline alert-error">
					<span>{feeError}</span>
				</div>
			{:else}
				<div class="collapse collapse-arrow border border-base-300 rounded-lg bg-base-100" class:collapse-open={networkFeeExpanded}>
					<button
						type="button"
						class="collapse-title min-h-0 py-1 px-4 font-medium text-left"
						onclick={() => {
							triggerHaptic(ImpactStyle.Light);
							networkFeeExpanded = !networkFeeExpanded;
						}}
					>
						<div class="flex items-center gap-2 w-full">
							<span>{$t('wallet.network_fee')}:</span>
							{#if estimatedFees}
								<span class="font-semibold">{formatSats(estimatedFees.totalFees)} {$t('wallet.sats')}</span>
								{#if btcPrice > 0 && estimatedFees.totalFees > 0}
									<span class="opacity-60">
										≈ {formatUSD((estimatedFees.totalFees / 100_000_000) * btcPrice)}
									</span>
								{/if}
							{:else}
								<span class="font-semibold">0 {$t('wallet.sats')}</span>
							{/if}
						</div>
					</button>
					<div class="collapse-content">
						<div class="space-y-2 pb-4 px-4">
							{#if estimatedFees && estimatedFees.serviceFee > 0}
								<div class="flex items-center justify-between text-xs opacity-70">
									<span>{$t('wallet.swap.swap_fee')}:</span>
									<span>{formatSats(estimatedFees.serviceFee)} {$t('wallet.sats')}</span>
								</div>
							{/if}
							{#if estimatedFees && estimatedFees.networkFee > 0}
								<div class="flex items-center justify-between text-xs opacity-70">
									<span>{$t('wallet.swap.network_transaction_fee')}:</span>
									<span>{formatSats(estimatedFees.networkFee)} {$t('wallet.sats')}</span>
								</div>
							{/if}
							{#if !estimatedFees || estimatedFees.totalFees === 0}
								<div class="text-xs opacity-70 text-center py-2">
									{$t('wallet.receive.enter_amount_to_estimate')}
								</div>
							{/if}
						</div>
					</div>
				</div>
			{/if}

			<!-- Total to Send Card -->
			<div class="flex flex-col items-center gap-2 rounded-lg border-2 border-primary bg-base-200 p-2">
				<span class="text-sm opacity-70 text-center">{$t('wallet.send.total_to_send')}</span>
				{#if totalToSend > 0 && estimatedFees}
					<div class="flex items-center justify-center gap-2 w-full">
						{#if unit === 'sats'}
							<span class="text-2xl font-bold text-primary">
								{formatSats(totalToSend)} {$t('wallet.sats')}
							</span>
							{#if btcPrice > 0}
								<span class="text-sm opacity-60">
									≈ {formatUSD(totalToSendUSD)}
								</span>
							{/if}
						{:else}
							<span class="text-2xl font-bold text-primary">
								{formatUSD(totalToSendUSD)}
							</span>
							{#if btcPrice > 0}
								<span class="text-sm opacity-60">
									≈ {formatSats(totalToSend)} {$t('wallet.sats')}
								</span>
							{/if}
						{/if}
					</div>
				{:else}
					<div class="text-sm opacity-60 text-center">
						{$t('wallet.receive.enter_amount_to_estimate')}
					</div>
				{/if}
			</div>

			<!-- Action Buttons -->
			<div class="flex gap-3">
				<button
					class="btn btn-error flex-1 min-h-[48px] md:min-h-[56px] touch-manipulation select-none active:scale-95 transition-transform duration-100"
					style="-webkit-tap-highlight-color: transparent;"
					onclick={() => {
						triggerHaptic(ImpactStyle.Light);
						onCancel();
					}}
				>
					<IconClose class="h-5 w-5 mr-2" />
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
					<IconSend class="h-5 w-5 mr-2" />
					{$t('wallet.send.send')}
				</button>
			</div>

			<!-- Scan QR Code Instead Button -->
			<div class="flex justify-center">
				<button class="btn btn-outline" onclick={() => (activeTab = 'scan')}>
					{$t('wallet.send.scan_qr_code_instead')}
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
				onCancel();
			}}
		/>
	{/if}
</div>


<!--
	Send Form Component
	Supports multi-asset transactions with passkey security
-->
<script lang="ts">
	import { Buffer } from 'buffer';
	import { onMount } from 'svelte';
	import { fly } from 'svelte/transition';
	import { linear } from 'svelte/easing';
	import { appStore } from '$lib/stores/app.store';
	import {
		walletStore,
		walletAssets,
		selectedAsset,
		sendForm,
		walletRates,
		walletTransactions
	} from '$lib/stores/wallet.store';
	import PasskeyVerification from './PasskeyVerification.svelte';
	import AssetSelector from '../AssetSelector.svelte';
	import RecipientInput from './RecipientInput.svelte';
	import AmountInput from './AmountInput.svelte';
	import FeeSelection from './FeeSelection.svelte';
	import { estimateFees } from '$lib/wallet/breez/feeEstimation';
	import { validateForm } from '$lib/wallet/breez/formValidation';
	import {
		prepareSendPayment,
		sendPayment,
		sendAssetPayment,
		parseInputAdvanced,
		prepareBolt12Payment,
		prepareLnurlPayment,
		executeLnurlPayment,
		detectMagicRoutingHints
	} from '$lib/wallet/breez/walletService';
	import { BoltzClient } from '$lib/integrations/boltz/client';
	import { swapManager } from '$lib/integrations/boltz/swapManager';
	import { getCurrentNetwork, getAssetId } from '$lib/constants/assets';
	import { createBitcoinWallet } from '$lib/wallet/bitcoin/bitcoinWallet';
	import { goto } from '$app/navigation';

	// UI State (keep local since these are component-specific)
	let showPasskeyVerification = $state(false);
	let passkeyContext = $state({
		operation: 'send',
		amount: 0,
		destination: '',
		asset: '',
		reason: 'Payment authorization'
	});

	// Form state variables (derived from store)
	let recipientAddress = $derived($sendForm.recipient);
	let amount = $derived($sendForm.amount);
	let description = $derived($sendForm.description);
	let feeRate = $derived($sendForm.feeRate);
	let useMainUnit = $derived($sendForm.useMainUnit);
	let fiatCurrency = $derived($sendForm.fiatCurrency);
	let preparedTransaction = $derived($sendForm.preparedTransaction);
	let isLoading = $derived($sendForm.isLoading);
	let estimatedFees = $derived($sendForm.estimatedFees);
	let isLoadingFees = $derived($sendForm.isLoading);
	let validationError = $derived($sendForm.validationError);

	// Balance and validation (local state for component-specific logic)
	let addressType = $state<'lightning' | 'bitcoin' | 'liquid' | 'lnurlPay' | 'bolt12' | 'unknown'>(
		'unknown'
	);
	let hasMagicRoutingHints = $state(false);

	// Available balance from selected asset
	let availableBalance = $derived($selectedAsset?.balance || 0);

	// Limits, payments, and events from wallet store
	let limits = $derived({
		lightning: $walletRates.lightningLimits,
		onchain: $walletRates.onchainLimits
	});
	let pendingPayments = $derived($walletTransactions.pendingPayments);
	// let paymentEvents = $derived($walletTransactions.paymentEvents);

	// Bitcoin wallet for BTC transactions
	const bitcoinWallet = createBitcoinWallet();

	// Boltz client for swap operations
	const currentNetwork = getCurrentNetwork();
	const boltzClient = new BoltzClient({
		apiUrl: 'https://api.boltz.exchange',
		network: currentNetwork
	});

	// Debounced fee estimation
	let feeEstimationTimeout: ReturnType<typeof setTimeout>;
	async function debouncedEstimateFees() {
		clearTimeout(feeEstimationTimeout);
		feeEstimationTimeout = setTimeout(async () => {
			walletStore.updateSendForm({ isLoading: true });
			try {
				const result = await estimateFees({
					recipientAddress,
					amount,
					selectedAsset: $walletAssets.selectedAsset,
					addressType,
					useMainUnit,
					feeRate
				});
				walletStore.updateSendForm({
					estimatedFees: result.estimatedFees,
					validationError: result.feeError, // Store fee errors as validation errors
					isLoading: false
				});
			} catch (err) {
				console.warn('Fee estimation failed:', err);
				walletStore.updateSendForm({
					estimatedFees: 0,
					validationError: err instanceof Error ? err.message : 'Fee estimation failed',
					isLoading: false
				});
			}
		}, 300);
	}

	function handleBalanceUpdate(balance: number, precision: number, ticker: string) {
		// Convert asset balance to satoshis for consistent calculation
		if (ticker === 'L-BTC' || ticker === 'BTC') {
			availableBalance = Math.floor(balance); // Already in sats for L-BTC/BTC
		} else if (ticker === 'USDt') {
			availableBalance = Math.floor(balance * Math.pow(10, precision)); // Convert to base units
		} else {
			availableBalance = Math.floor(balance * Math.pow(10, precision));
		}
		console.log(`💰 Balance updated for ${ticker}: ${availableBalance} base units`);
	}

	async function handleAddressChange() {
		const address = recipientAddress?.trim() || '';
		if (!address) {
			addressType = 'unknown';
			hasMagicRoutingHints = false;
			return;
		}

		try {
			// First try custom parsing for BIP21 URIs and other formats
			const customParsed = parseCustomFormats(address);
			if (customParsed) {
				addressType = customParsed;
				hasMagicRoutingHints = false;
				debouncedEstimateFees();
				return;
			}

			// Use advanced parsing with production features for supported types
			const parsed = await parseInputAdvanced(address);

			switch (parsed.type) {
				case 'bolt11':
					addressType = 'lightning';
					// Check for Magic Routing Hints
					hasMagicRoutingHints = await detectMagicRoutingHints(address);
					break;
				case 'bolt12Offer':
					addressType = 'bolt12';
					break;
				case 'lnUrlPay':
					addressType = 'lnurlPay';
					break;
				case 'bitcoinAddress':
					addressType = 'bitcoin';
					break;
				case 'liquidAddress':
					addressType = 'liquid';
					break;
				default:
					addressType = 'unknown';
			}
		} catch {
			// Fallback: Try to detect based on address format
			if (address.startsWith('ln')) {
				addressType = 'lightning';
			} else if (address.startsWith('bc1') || address.startsWith('1') || address.startsWith('3')) {
				addressType = 'bitcoin';
			} else if (address.startsWith('ex1') || address.startsWith('lq1')) {
				addressType = 'liquid';
			} else if (address.includes('@')) {
				addressType = 'lnurlPay';
			} else if (address.startsWith('lno')) {
				addressType = 'bolt12';
			} else {
				addressType = 'unknown';
			}
			hasMagicRoutingHints = false;
		}

		// Re-estimate fees when address changes
		debouncedEstimateFees();
	}

	function parseCustomFormats(input: string): 'liquid' | 'bitcoin' | null {
		// Handle Liquid BIP21 URIs
		if (input.startsWith('liquidnetwork:') || (input.startsWith('lq1') && input.includes('?'))) {
			extractBip21Parameters(input);
			return 'liquid';
		}

		// Handle Bitcoin BIP21 URIs
		if (input.startsWith('bitcoin:')) {
			extractBip21Parameters(input);
			return 'bitcoin';
		}

		// Handle plain Liquid addresses with query parameters (malformed BIP21)
		if ((input.startsWith('lq1') || input.startsWith('ex1')) && input.includes('?')) {
			extractBip21Parameters(input);
			return 'liquid';
		}

		return null;
	}

	function extractBip21Parameters(uri: string): void {
		try {
			const url = new URL(uri.replace(/^(bitcoin|liquidnetwork):/, 'https://dummy.com/'));

			// Extract amount
			const amountParam = url.searchParams.get('amount');
			if (amountParam && !amount) {
				walletStore.updateSendForm({ amount: amountParam });
			}

			// Extract message/label
			const message = url.searchParams.get('message') || url.searchParams.get('label');
			if (message && !description) {
				walletStore.updateSendForm({ description: decodeURIComponent(message) });
			}

			// For Liquid, check asset ID
			const assetId = url.searchParams.get('assetid');
			if (assetId === '6f0279e9ed041c3d710a9f57d0c02928416460c4b722ae3457a11eec381c526d') {
				// This is L-BTC asset ID
				walletStore.setSelectedAsset('L-BTC');
			}

			console.log('📋 Extracted BIP21 parameters:', { amount: amountParam, message, assetId });
		} catch (error) {
			console.warn('Failed to parse BIP21 URI:', error);
		}
	}

	function getCleanAddress(input: string): string {
		// Handle BIP21 URIs
		if (input.startsWith('bitcoin:') || input.startsWith('liquidnetwork:')) {
			return input.split('?')[0].replace(/^(bitcoin|liquidnetwork):/, '');
		}

		// Handle addresses with query parameters (malformed BIP21)
		if (
			input.includes('?') &&
			(input.startsWith('lq1') ||
				input.startsWith('ex1') ||
				input.startsWith('bc1') ||
				input.startsWith('1') ||
				input.startsWith('3'))
		) {
			return input.split('?')[0];
		}

		return input;
	}

	async function prepareSend() {
		// Validate form using the validation function
		const validationParams = {
			recipientAddress,
			amount,
			addressType,
			selectedAsset: $walletAssets.selectedAsset,
			availableBalance,
			estimatedFees,
			limits,
			useMainUnit
		};

		const validation = validateForm(validationParams);
		if (!validation.isValid) {
			walletStore.updateSendForm({ validationError: validation.error });
			return;
		}

		try {
			walletStore.updateSendForm({ isLoading: true, validationError: null });

			const amountSats = convertToSatoshis(amount);
			const currentAsset = $walletAssets.selectedAsset;

			if (currentAsset === 'L-BTC' || currentAsset === 'USDt') {
				// Handle different Lightning payment types
				if (addressType === 'bolt12') {
					// BOLT12 offer payment
					const prepared = await prepareBolt12Payment(recipientAddress, amountSats, description);
					walletStore.updateSendForm({ preparedTransaction: prepared });
				} else if (addressType === 'lnurlPay') {
					// LNURL-Pay (Lightning address)
					const lnurlPrepare = await prepareLnurlPayment(recipientAddress, amountSats, description);

					// Execute LNURL-Pay directly (no separate prepare/send step)
					const lnurlResult = await executeLnurlPayment(lnurlPrepare);
					console.log('LNURL-Pay completed:', lnurlResult);

					// Reset form and show success
					resetForm();
					showSuccessMessage({ payment: { id: 'lnurl-success' } });
					return;
				} else {
					// Standard Lightning or Liquid payment
					const cleanDestination = getCleanAddress(recipientAddress);
					const prepareParams = {
						destination: cleanDestination,
						amount:
							currentAsset === 'USDt'
								? {
										type: 'asset' as const,
										assetId: getAssetId('USDT'),
										receiverAmount: amountSats / 100_000_000, // Convert from base units back to asset units
										estimateAssetFees: false
									}
								: {
										type: 'bitcoin' as const,
										receiverAmountSat: amountSats
									}
					};

					const prepared = await prepareSendPayment(prepareParams);
					walletStore.updateSendForm({ preparedTransaction: prepared });
				}
			} else if (currentAsset === 'BTC') {
				// Handle Bitcoin transactions
				if (addressType === 'lightning') {
					// Create Boltz swap (Bitcoin → Lightning)
					await handleBitcoinToLightningSwap(amountSats);
					return;
				} else {
					// Direct Bitcoin transaction
					await handleDirectBitcoinSend(amountSats);
					return;
				}
			}

			// Show passkey verification
			passkeyContext = {
				operation: 'send',
				amount: amountSats,
				destination: recipientAddress,
				asset: currentAsset,
				reason: getTransactionReason()
			};
			showPasskeyVerification = true;
		} catch (err) {
			console.error('Failed to prepare transaction:', err);
			walletStore.updateSendForm({
				validationError: err instanceof Error ? err.message : 'Failed to prepare transaction',
				isLoading: false
			});
		} finally {
			walletStore.updateSendForm({ isLoading: false });
		}
	}

	function convertToSatoshis(inputAmount: string): number {
		const numericAmount = parseFloat(inputAmount);
		const currentAsset = $walletAssets.selectedAsset;

		if (currentAsset === 'L-BTC' || currentAsset === 'BTC') {
			if (useMainUnit) {
				// Input is in BTC, convert to sats
				return Math.floor(numericAmount * 100_000_000);
			} else {
				// Input is already in sats
				return Math.floor(numericAmount);
			}
		} else if (currentAsset === 'USDt') {
			// For USDT, use the amount as-is (asset amount, not sats)
			return Math.floor(numericAmount * 100_000_000); // Convert to asset base units
		}

		return Math.floor(numericAmount);
	}

	function getTransactionReason(): string {
		if (addressType === 'bitcoin' || addressType === 'liquid') {
			return 'This transaction will send funds off-platform to an external address.';
		}
		return 'Please verify this transaction with your passkey.';
	}

	async function handlePasskeySuccess() {
		if (!preparedTransaction) return;

		try {
			walletStore.updateSendForm({ isLoading: true, validationError: null });

			let result;
			const currentAsset = $walletAssets.selectedAsset;
			if (currentAsset === 'USDt') {
				const amountSats = convertToSatoshis(amount);
				const cleanDestination = getCleanAddress(recipientAddress);
				result = await sendAssetPayment(
					cleanDestination,
					getAssetId('USDT'),
					amountSats / 100_000_000, // Convert back to asset units
					description
				);
			} else {
				result = await sendPayment({
					prepareResponse: preparedTransaction,
					payerNote: description
				});
			}

			// Reset form
			resetForm();

			// Show success message
			showSuccessMessage(result);

			goto('/dashboard/wallet/transactions');
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : 'Transaction failed'
			walletStore.updateSendForm({
				validationError: errorMessage,
				isLoading: false
			});
			
			// Show error toast for better UX
			appStore.showErrorToast(errorMessage);
		} finally {
			walletStore.updateSendForm({ isLoading: false });
		}
	}

	function showSuccessMessage(result: any) {
		console.log('Payment sent successfully:', result);
		appStore.showSuccessToast(
			`Payment sent successfully! Transaction ID: ${result.payment?.id || 'N/A'}`
		);
		resetForm();
	}

	async function handleBitcoinToLightningSwap(amountSats: number) {
		try {
			// Generate proper cryptographic keys using boltz-core
			const preimage = boltzClient.generatePreimage();
			const preimageHash = boltzClient.createPreimageHash(preimage);
			const claimKeys = boltzClient.generateKeyPair();

			// Create reverse submarine swap via Boltz
			const swapId = await swapManager.createReverseSubmarineSwap({
				invoiceAmount: amountSats,
				preimageHash,
				claimPublicKey: Buffer.from(claimKeys.publicKey).toString('hex'),
				lightningInvoice: recipientAddress
			});

			console.log('Created reverse swap:', swapId);

			// Store the preimage and keys for later claiming
			// TODO: In production, use secure storage instead of localStorage
			if (typeof localStorage !== 'undefined') {
				localStorage.setItem(`swap_${swapId}_preimage`, preimage.toString('hex'));
				localStorage.setItem(
					`swap_${swapId}_claimKey`,
					claimKeys.privateKey ? Buffer.from(claimKeys.privateKey).toString('hex') : ''
				);
			}

			resetForm();
		} catch (swapError) {
			console.error('Failed to create Bitcoin to Lightning swap:', swapError);
			walletStore.updateSendForm({
				validationError: swapError instanceof Error ? swapError.message : 'Failed to create swap'
			});
		}
	}

	async function handleDirectBitcoinSend(amountSats: number) {
		const feeRates = await bitcoinWallet.getFeeEstimates();
		const selectedFeeRate = feeRates[feeRate];
		const cleanDestination = getCleanAddress(recipientAddress);

		const txid = await bitcoinWallet.createTransaction({
			toAddress: cleanDestination,
			amount: amountSats,
			feeRate: selectedFeeRate,
			message: description
		});

		console.log('Bitcoin transaction sent:', txid);
		resetForm();
	}

	function resetForm() {
		walletStore.resetSendForm();
		addressType = 'unknown';
	}

	// Ensure assets are loaded when the component mounts
	onMount(async () => {
		try {
			await walletStore.loadAssets();
			console.log('📊 SendForm: Assets refreshed on mount');
		} catch (error) {
			console.warn('Failed to refresh assets on SendForm mount:', error);
		}
	});
</script>

{#if !showPasskeyVerification}
	<div
		class="enhanced-send-form space-y-4 sm:space-y-6"
		in:fly={{
			duration: 200,
			easing: linear,
			y: 0,
			x: showPasskeyVerification ? 20 : -20
		}}
	>
		<div class="flex items-center justify-between">
			<h3 class="text-base-content text-lg font-semibold sm:text-xl">Send Payment</h3>
		</div>

		<!-- Asset Selection -->
		<div class="form-control">
			<div class="label">
				<span class="label-text text-sm sm:text-base">Select Asset</span>
			</div>
			<AssetSelector
				selectedAsset={$walletAssets.selectedAsset}
				onAssetChange={(assetId: string) => {
					walletStore.updateSendForm({ validationError: null }); // Clear error on asset change
					walletStore.setSelectedAsset(assetId);
					debouncedEstimateFees();
				}}
				onBalanceUpdate={handleBalanceUpdate}
				showBalance={true}
			/>
		</div>

		<!-- Recipient Address -->
		<RecipientInput
			{recipientAddress}
			{addressType}
			{hasMagicRoutingHints}
			onAddressChange={(e: Event & { currentTarget: EventTarget & HTMLInputElement }) => {
				walletStore.updateSendForm({ validationError: null }); // Clear error on address change
				walletStore.updateSendForm({ recipient: e.currentTarget.value });
				handleAddressChange();
			}}
		/>

		<!-- Amount Input -->
		<AmountInput
			{amount}
			{useMainUnit}
			selectedAsset={$walletAssets.selectedAsset}
			{fiatCurrency}
			{limits}
			{estimatedFees}
			{isLoadingFees}
			{addressType}
			{recipientAddress}
			validationError={$sendForm.validationError}
			onAmountChange={(e: Event & { currentTarget: EventTarget & HTMLInputElement }) => {
				walletStore.updateSendForm({ validationError: null });
				walletStore.updateSendForm({ amount: e.currentTarget.value });
				debouncedEstimateFees();
			}}
		/>

		<!-- Fee Selection (for Bitcoin transactions) -->
		<FeeSelection
			{feeRate}
			selectedAsset={$walletAssets.selectedAsset}
			onFeeRateChange={(rate: 'slow' | 'medium' | 'fast') => {
				walletStore.updateSendForm({ feeRate: rate });
				debouncedEstimateFees();
			}}
		/>

		<!-- Description -->
		<div class="form-control">
			<div class="label">
				<span class="label-text text-sm sm:text-base">Description (optional)</span>
			</div>
			<textarea
				placeholder="What's this payment for?"
				class="textarea textarea-bordered w-full rounded-xl text-sm sm:text-base"
				rows="3"
				value={description}
				oninput={(e) => {
					const target = e.target as HTMLTextAreaElement;
					walletStore.updateSendForm({ description: target.value });
				}}
			></textarea>
		</div>

		<!-- Error Display -->
		{#if validationError}
			<div class="alert alert-error">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-6 w-6 flex-shrink-0 stroke-current"
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
				<span>{validationError}</span>
			</div>
		{/if}

		<!-- Send Button -->
		<div class="pt-2">
			<button
				class="btn btn-primary h-12 w-full text-sm sm:h-14 sm:text-base"
				onclick={prepareSend}
				disabled={isLoading || !recipientAddress || !amount}
			>
				{#if isLoading}
					<span class="loading loading-spinner loading-sm sm:loading-md"></span>
					<span class="hidden sm:inline">Processing...</span>
					<span class="sm:hidden">Processing</span>
				{:else}
					<span class="flex items-center gap-2">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-4 w-4 sm:h-5 sm:w-5"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
							/>
						</svg>
						<span>Send {$walletAssets.selectedAsset}</span>
					</span>
				{/if}
			</button>
		</div>

		<!-- Pending Payments & Events -->
		{#if pendingPayments.length > 0}
			<div class="divider">Activity</div>

			<!-- Pending Payments -->
			{#if pendingPayments.length > 0}
				<div class="alert alert-info">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-5 w-5 flex-shrink-0 stroke-current"
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
					<div>
						<h4 class="font-bold">Pending Payments ({pendingPayments.length})</h4>
						<p class="text-xs opacity-75">Some payments are waiting for confirmation</p>
					</div>
				</div>
			{/if}
		{/if}
	</div>
{:else}
	<PasskeyVerification
		show={showPasskeyVerification}
		context={passkeyContext}
		{preparedTransaction}
		selectedAsset={$walletAssets.selectedAsset}
		onSuccess={handlePasskeySuccess}
		onCancel={() => (showPasskeyVerification = false)}
		onError={(err) => {
			walletStore.updateSendForm({ validationError: err });
		}}
	/>
{/if}

<style>
	.enhanced-send-form {
		max-width: 100%;
		width: 100%;
		padding: 0 1rem;
	}

	@media (min-width: 640px) {
		.enhanced-send-form {
			max-width: 32rem;
			margin-left: auto;
			margin-right: auto;
			padding: 0 1.5rem;
		}
	}

	@media (min-width: 768px) {
		.enhanced-send-form {
			max-width: 36rem;
			padding: 0 2rem;
		}
	}

	/* Improve touch targets on mobile */
	@media (max-width: 639px) {
		.enhanced-send-form .btn {
			min-height: 2.75rem;
			padding: 0.5rem 1rem;
		}
	}
</style>

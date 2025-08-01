<!--
	Enhanced Send Form Component
	Supports multi-asset transactions with passkey security
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import AssetSelector from '../AssetSelector.svelte';
	import PasskeyVerification from '../security/PasskeyVerification.svelte';
	import {
		prepareSendPayment,
		sendPayment,
		sendAssetPayment,
		parseInput,
		fetchLightningLimits,
		fetchOnchainLimits,
		fetchFiatRates,
		parseInputAdvanced,
		prepareBolt12Payment,
		prepareLnurlPayment,
		executeLnurlPayment,
		detectMagicRoutingHints,
		pendingPaymentsStore,
		paymentEventsStore
	} from '$lib/wallet/breez/walletService';
	import { createBitcoinWallet } from '$lib/wallet/bitcoin/bitcoinWallet';
	import { swapManager } from '$lib/integrations/boltz/swapManager';
	import { BoltzClient } from '$lib/integrations/boltz/client';
	import { getCurrentNetwork, getAssetId } from '$lib/constants/assets';
	import { appStore } from '$lib/stores/app.store';
	import type { PrepareSendResponse } from '@breeztech/breez-sdk-liquid/web';
	import { Buffer } from 'buffer';
	import Input from '$lib/components/Input.svelte';

	// State
	let selectedAsset = $state('L-BTC');
	let recipientAddress = $state('');
	let amount = $state('');
	let description = $state('');
	let feeRate = $state<'slow' | 'medium' | 'fast'>('medium');

	// Fiat conversion state
	let useFiatInput = $state(false);
	let fiatAmount = $state('');
	let fiatCurrency = $state('USD');
	let fiatRates = $state<any>({});

	// UI State
	let isLoading = $state(false);
	let error = $state<string | null>(null);
	let showPasskeyVerification = $state(false);
	let passkeyContext = $state<any>({});
	let preparedTransaction = $state<PrepareSendResponse | null>(null);

	// Validation
	let addressType = $state<'lightning' | 'bitcoin' | 'liquid' | 'lnurlPay' | 'bolt12' | 'unknown'>('unknown');
	let limits = $state<any>({});
	let hasMagicRoutingHints = $state(false);
	
	// Production features state
	let pendingPayments = $state<any[]>([]);
	let paymentEvents = $state<any[]>([]);

	// Bitcoin wallet for BTC transactions
	const bitcoinWallet = createBitcoinWallet();

	// Boltz client for swap operations
	const currentNetwork = getCurrentNetwork();
	const boltzClient = new BoltzClient({
		apiUrl: 'https://api.boltz.exchange',
		network: currentNetwork
	});

	onMount(() => {
		// Load initial data
		Promise.all([loadLimits(), loadFiatRates()]);
		
		// Subscribe to pending payments and events
		const unsubscribePending = pendingPaymentsStore.subscribe(payments => {
			pendingPayments = payments;
		});
		
		const unsubscribeEvents = paymentEventsStore.subscribe(events => {
			paymentEvents = events;
		});
		
		// Cleanup subscriptions when component unmounts
		return () => {
			unsubscribePending();
			unsubscribeEvents();
		};
	});

	async function loadLimits() {
		try {
			const [lightningLimits, onchainLimits] = await Promise.all([
				fetchLightningLimits(),
				fetchOnchainLimits()
			]);

			limits = {
				lightning: lightningLimits,
				onchain: onchainLimits
			};
		} catch (err) {
			console.error('Failed to load limits:', err);
		}
	}

	async function loadFiatRates() {
		try {
			fiatRates = await fetchFiatRates();
		} catch (err) {
			console.error('Failed to load fiat rates:', err);
		}
	}

	async function handleAddressChange() {
		if (!recipientAddress.trim()) {
			addressType = 'unknown';
			hasMagicRoutingHints = false;
			return;
		}

		try {
			// Use advanced parsing with production features
			const parsed = await parseInputAdvanced(recipientAddress);

			switch (parsed.type) {
				case 'bolt11':
					addressType = 'lightning';
					// Check for Magic Routing Hints
					hasMagicRoutingHints = await detectMagicRoutingHints(recipientAddress);
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
			// Try to detect based on address format
			if (recipientAddress.startsWith('ln')) {
				addressType = 'lightning';
			} else if (
				recipientAddress.startsWith('bc1') ||
				recipientAddress.startsWith('1') ||
				recipientAddress.startsWith('3')
			) {
				addressType = 'bitcoin';
			} else if (recipientAddress.startsWith('ex1') || recipientAddress.startsWith('lq1')) {
				addressType = 'liquid';
			} else if (recipientAddress.includes('@')) {
				addressType = 'lnurlPay';
			} else if (recipientAddress.startsWith('lno')) {
				addressType = 'bolt12';
			} else {
				addressType = 'unknown';
			}
			hasMagicRoutingHints = false;
		}
	}

	function validateForm(): boolean {
		error = null;

		if (!recipientAddress.trim()) {
			error = 'Please enter a recipient address';
			return false;
		}

		// Validate amount based on input type
		const currentAmount = useFiatInput ? fiatAmount : amount;
		if (!currentAmount || isNaN(parseFloat(currentAmount)) || parseFloat(currentAmount) <= 0) {
			error = `Please enter a valid ${useFiatInput ? 'fiat' : 'crypto'} amount`;
			return false;
		}

		// Ensure we have a crypto amount for validation
		const cryptoAmount = useFiatInput ? convertFiatToCrypto(fiatAmount) : amount;
		if (!cryptoAmount) {
			error = 'Unable to convert amount. Please check your input.';
			return false;
		}

		if (addressType === 'unknown') {
			error = 'Invalid or unsupported address format';
			return false;
		}

		// Check amount limits
		const amountSats = Math.floor(parseFloat(cryptoAmount) * 100_000_000);

		if (selectedAsset === 'L-BTC' && limits.lightning) {
			const minSats = limits.lightning.send?.minSat || 0;
			const maxSats = limits.lightning.send?.maxSat || Number.MAX_SAFE_INTEGER;

			if (amountSats < minSats) {
				error = `Minimum amount is ${(minSats / 100_000_000).toFixed(8)} ${selectedAsset}`;
				return false;
			}

			if (amountSats > maxSats) {
				error = `Maximum amount is ${(maxSats / 100_000_000).toFixed(8)} ${selectedAsset}`;
				return false;
			}
		}

		if (selectedAsset === 'BTC' && limits.onchain) {
			const minSats = limits.onchain.send?.minSat || 0;
			const maxSats = limits.onchain.send?.maxSat || Number.MAX_SAFE_INTEGER;

			if (amountSats < minSats) {
				error = `Minimum amount is ${(minSats / 100_000_000).toFixed(8)} ${selectedAsset}`;
				return false;
			}

			if (amountSats > maxSats) {
				error = `Maximum amount is ${(maxSats / 100_000_000).toFixed(8)} ${selectedAsset}`;
				return false;
			}
		}

		// Check for dust amounts (very small amounts that aren't economical)
		if (amountSats < 546) {
			// Bitcoin dust limit
			error = 'Amount too small (below dust limit)';
			return false;
		}

		// Check asset compatibility
		if (selectedAsset === 'BTC' && addressType === 'liquid') {
			error = 'Cannot send Bitcoin to Liquid address directly. Use swap functionality.';
			return false;
		}

		if ((selectedAsset === 'L-BTC' || selectedAsset === 'USDt') && addressType === 'bitcoin') {
			error = 'Cannot send Liquid assets to Bitcoin address directly. Use swap functionality.';
			return false;
		}

		return true;
	}

	async function prepareSend() {
		if (!validateForm()) return;

		try {
			isLoading = true;
			error = null;

			const amountSats = Math.floor(parseFloat(amount) * 100_000_000);

			if (selectedAsset === 'L-BTC' || selectedAsset === 'USDt') {
				// Handle different Lightning payment types
				if (addressType === 'bolt12') {
					// BOLT12 offer payment
					preparedTransaction = await prepareBolt12Payment(
						recipientAddress,
						amountSats,
						description
					);
				} else if (addressType === 'lnurlPay') {
					// LNURL-Pay (Lightning address)
					const lnurlPrepare = await prepareLnurlPayment(
						recipientAddress,
						amountSats,
						description
					);
					
					// Execute LNURL-Pay directly (no separate prepare/send step)
					const lnurlResult = await executeLnurlPayment(lnurlPrepare);
					console.log('LNURL-Pay completed:', lnurlResult);
					
					// Reset form and show success
					resetForm();
					showSuccessMessage({ payment: { id: 'lnurl-success' } });
					return;
				} else {
					// Standard Lightning or Liquid payment
					const prepareParams = {
						destination: recipientAddress,
						amount:
							selectedAsset === 'USDt'
								? {
										type: 'asset' as const,
										assetId: getAssetId('USDT'),
										receiverAmount: parseFloat(amount),
										estimateAssetFees: false
									}
								: {
										type: 'bitcoin' as const,
										receiverAmountSat: amountSats
									}
					};

					preparedTransaction = await prepareSendPayment(prepareParams);
				}
			} else if (selectedAsset === 'BTC') {
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
				asset: selectedAsset,
				reason: getTransactionReason()
			};
			showPasskeyVerification = true;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to prepare transaction';
		} finally {
			isLoading = false;
		}
	}

	async function handlePasskeySuccess() {
		if (!preparedTransaction) return;

		try {
			isLoading = true;

			let result;
			if (selectedAsset === 'USDt') {
				result = await sendAssetPayment(
					recipientAddress,
					getAssetId('USDT'),
					parseFloat(amount),
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
			error = null;
			showSuccessMessage(result);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Transaction failed';
		} finally {
			isLoading = false;
		}
	}

	function showSuccessMessage(result: any) {
		console.log('Payment sent successfully:', result);
		appStore.showSuccessToast(
			`Payment sent successfully! Transaction ID: ${result.payment?.id || 'N/A'}`
		);
	}

	// Fiat conversion functions
	function convertFiatToCrypto(fiatAmount: string): string {
		if (!fiatAmount || !fiatRates[fiatCurrency]) return '';
		const fiatValue = parseFloat(fiatAmount);
		const rate = fiatRates[fiatCurrency];

		if (selectedAsset === 'L-BTC' || selectedAsset === 'BTC') {
			return (fiatValue / rate).toFixed(8);
		} else if (selectedAsset === 'USDt') {
			// For USDT, assume 1:1 with USD
			return fiatValue.toString();
		}
		return '';
	}

	function convertCryptoToFiat(cryptoAmount: string): string {
		if (!cryptoAmount || !fiatRates[fiatCurrency]) return '';
		const cryptoValue = parseFloat(cryptoAmount);
		const rate = fiatRates[fiatCurrency];

		if (selectedAsset === 'L-BTC' || selectedAsset === 'BTC') {
			return (cryptoValue * rate).toFixed(2);
		} else if (selectedAsset === 'USDt') {
			// For USDT, assume 1:1 with USD
			return cryptoValue.toFixed(2);
		}
		return '';
	}

	function handleFiatAmountChange() {
		if (useFiatInput && fiatAmount) {
			amount = convertFiatToCrypto(fiatAmount);
		}
	}

	function handleCryptoAmountChange() {
		if (!useFiatInput && amount) {
			fiatAmount = convertCryptoToFiat(amount);
		}
	}

	function toggleInputType() {
		useFiatInput = !useFiatInput;
		if (useFiatInput) {
			// Convert current crypto amount to fiat
			if (amount) {
				fiatAmount = convertCryptoToFiat(amount);
			}
		} else {
			// Convert current fiat amount to crypto
			if (fiatAmount) {
				amount = convertFiatToCrypto(fiatAmount);
			}
		}
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
			error = swapError instanceof Error ? swapError.message : 'Failed to create swap';
		}
	}

	async function handleDirectBitcoinSend(amountSats: number) {
		const feeRates = await bitcoinWallet.getFeeEstimates();
		const selectedFeeRate = feeRates[feeRate];

		const txid = await bitcoinWallet.createTransaction({
			toAddress: recipientAddress,
			amount: amountSats,
			feeRate: selectedFeeRate,
			message: description
		});

		console.log('Bitcoin transaction sent:', txid);
		resetForm();
	}

	function resetForm() {
		recipientAddress = '';
		amount = '';
		description = '';
		preparedTransaction = null;
		addressType = 'unknown';
	}

	function getTransactionReason(): string {
		if (addressType === 'bitcoin' || addressType === 'liquid') {
			return 'This transaction will send funds off-platform to an external address.';
		}
		return 'Please verify this transaction with your passkey.';
	}

	function getAddressTypeIcon(): string {
		switch (addressType) {
			case 'lightning':
				return hasMagicRoutingHints ? '🌊⚡' : '⚡';
			case 'bolt12':
				return '🔗';
			case 'lnurlPay':
				return '📧';
			case 'bitcoin':
				return '₿';
			case 'liquid':
				return '🌊';
			default:
				return '❓';
		}
	}

	function getAddressTypeLabel(): string {
		switch (addressType) {
			case 'lightning':
				return hasMagicRoutingHints ? 'Lightning (MRH)' : 'Lightning';
			case 'bolt12':
				return 'BOLT12 Offer';
			case 'lnurlPay':
				return 'Lightning Address';
			case 'bitcoin':
				return 'Bitcoin';
			case 'liquid':
				return 'Liquid';
			default:
				return 'Unknown';
		}
	}
</script>

<div class="enhanced-send-form space-y-4 sm:space-y-6">
	<div class="flex items-center justify-between">
		<h3 class="text-base-content text-lg font-semibold sm:text-xl">Send Payment</h3>
	</div>

	<!-- Asset Selection -->
	<div class="form-control">
		<div class="label">
			<span class="label-text text-sm sm:text-base">Select Asset</span>
		</div>
		<AssetSelector
			bind:selectedAsset
			onAssetChange={(assetId: string) => (selectedAsset = assetId)}
			showBalance={true}
		/>
	</div>

	<!-- Recipient Address -->
	<div class="form-control">
		<div class="label">
			<span class="label-text text-sm sm:text-base">Recipient</span>
			{#if addressType !== 'unknown'}
				<span class="label-text-alt flex items-center gap-1 text-xs sm:text-sm">
					<span class="text-lg">{getAddressTypeIcon()}</span>
					<span class="font-medium">{getAddressTypeLabel()}</span>
				</span>
			{/if}
		</div>
		<div class="flex w-full">
			<input
				type="text"
				placeholder="Address, Lightning invoice, or Lightning address"
				class="input input-bordered w-full text-sm sm:text-base"
				bind:value={recipientAddress}
				oninput={handleAddressChange}
			/>
			<!-- TODO: QR Code Scanning - Disabled for now -->
			<!-- 
			<button 
				class="btn btn-square rounded-l-none border-l-0" 
				aria-label="Scan QR"
				title="Scan QR Code (Coming Soon)"
				disabled
			>
				<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 sm:h-5 sm:w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0118.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
				</svg>
			</button>
			-->
		</div>
	</div>

	<!-- Amount -->
	<div class="form-control">
		<div class="label">
			<span class="label-text text-sm sm:text-base">Amount</span>
			<div class="label-text-alt flex items-center gap-2 text-xs">
				{#if limits.lightning && selectedAsset === 'L-BTC'}
					<span>
						Min: {(limits.lightning.send?.minSat || 0) / 100_000_000} - Max: {(limits.lightning.send
							?.maxSat || 0) / 100_000_000}
						{selectedAsset}
					</span>
				{/if}
				{#if limits.onchain && selectedAsset === 'BTC'}
					<span>
						Min: {(limits.onchain.send?.minSat || 0) / 100_000_000} - Max: {(limits.onchain.send
							?.maxSat || 0) / 100_000_000}
						{selectedAsset}
					</span>
				{/if}
			</div>
		</div>

		<!-- Amount Input with Currency Toggle -->
		<div class="flex w-full">
			{#if useFiatInput}
				<input
					type="number"
					step="0.01"
					placeholder="0.00"
					class="input input-bordered flex-1 rounded-r-none border-r-0 font-mono text-sm sm:text-base"
					bind:value={fiatAmount}
					oninput={handleFiatAmountChange}
				/>
				<div class="relative w-24">
					<Input
						value={fiatCurrency}
						options={[
							{ label: 'USD', value: 'USD' },
							{ label: 'EUR', value: 'EUR' },
							{ label: 'GBP', value: 'GBP' }
						]}
						onChange={() => handleFiatAmountChange()}
						className="w-24 rounded-r-full"
					/>
				</div>
			{:else}
				<input
					type="number"
					step="0.00000001"
					placeholder="0.00000000"
					class="input input-bordered flex-1 rounded-r-none border-r-0 font-mono text-sm sm:text-base"
					bind:value={amount}
					oninput={handleCryptoAmountChange}
				/>
				<span
					class="btn btn-disabled min-w-fit rounded-r-full border-r-0 border-l-0 px-3 text-xs sm:text-sm"
				>
					{selectedAsset}
				</span>
			{/if}
		</div>
		<button
			class="btn btn-block px-2 sm:px-3"
			onclick={toggleInputType}
			title="Toggle between {useFiatInput ? 'crypto' : 'fiat'} input"
			aria-label="Toggle between {useFiatInput ? 'crypto' : 'fiat'} input"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-4 w-4"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
				/>
			</svg>
		</button>

		<!-- Conversion Display -->
		{#if amount && fiatAmount && fiatRates[fiatCurrency]}
			<div class="text-base-content/60 mt-2 text-xs">
				{#if useFiatInput}
					≈ {amount} {selectedAsset}
				{:else}
					≈ {fiatAmount} {fiatCurrency}
				{/if}
			</div>
		{/if}
	</div>

	<!-- Fee Selection (for Bitcoin transactions) -->
	{#if selectedAsset === 'BTC'}
		<div class="form-control">
			<div class="label">
				<span class="label-text text-sm sm:text-base">Transaction Speed</span>
				<span class="label-text-alt text-xs">Higher speed = Higher fees</span>
			</div>
			<div class="grid w-full grid-cols-3 gap-2">
				<button
					class="btn btn-sm sm:btn-md {feeRate === 'slow' ? 'btn-primary' : 'btn-outline'}"
					onclick={() => (feeRate = 'slow')}
				>
					<span class="flex items-center gap-1">
						<span class="text-xs sm:text-sm">🐌</span>
						<span class="text-xs">Slow</span>
					</span>
				</button>
				<button
					class="btn btn-sm sm:btn-md {feeRate === 'medium' ? 'btn-primary' : 'btn-outline'}"
					onclick={() => (feeRate = 'medium')}
				>
					<span class="flex items-center gap-1">
						<span class="text-xs sm:text-sm">🚀</span>
						<span class="text-xs">Medium</span>
					</span>
				</button>
				<button
					class="btn btn-sm sm:btn-md {feeRate === 'fast' ? 'btn-primary' : 'btn-outline'}"
					onclick={() => (feeRate = 'fast')}
				>
					<span class="flex items-center gap-1">
						<span class="text-xs sm:text-sm">⚡</span>
						<span class="text-xs">Fast</span>
					</span>
				</button>
			</div>
		</div>
	{/if}

	<!-- Description -->
	<div class="form-control">
		<div class="label">
			<span class="label-text text-sm sm:text-base">Description (optional)</span>
		</div>
		<input
			type="text"
			placeholder="What's this payment for?"
			class="input input-bordered text-sm sm:text-base"
			bind:value={description}
		/>
	</div>

	<!-- Error Display -->
	{#if error}
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
			<span>{error}</span>
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
					<span>Send {selectedAsset}</span>
				</span>
			{/if}
		</button>
	</div>

	<!-- Transaction Info -->
	{#if preparedTransaction}
		<div class="alert alert-info text-xs sm:text-sm">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-5 w-5 flex-shrink-0 stroke-current sm:h-6 sm:w-6"
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
			<div class="flex-1">
				<h3 class="text-sm font-bold sm:text-base">Transaction Prepared</h3>
				<p class="text-xs opacity-75 sm:text-sm">
					Estimated fee: {((preparedTransaction.feesSat || 0) / 100_000_000).toFixed(8)}
					{selectedAsset}
				</p>
			</div>
		</div>
	{/if}

	<!-- Pending Payments & Events -->
	{#if pendingPayments.length > 0 || paymentEvents.length > 0}
		<div class="divider">Activity</div>
		
		<!-- Pending Payments -->
		{#if pendingPayments.length > 0}
			<div class="alert alert-info">
				<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 flex-shrink-0 stroke-current" fill="none" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
				</svg>
				<div>
					<h4 class="font-bold">Pending Payments ({pendingPayments.length})</h4>
					<p class="text-xs opacity-75">Some payments are waiting for confirmation</p>
				</div>
			</div>
		{/if}

		<!-- Recent Events -->
		{#if paymentEvents.length > 0}
			<div class="collapse collapse-arrow bg-base-200">
				<input type="checkbox" />
				<div class="collapse-title text-sm font-medium">
					Recent Events ({paymentEvents.length})
				</div>
				<div class="collapse-content">
					<div class="space-y-2 max-h-40 overflow-y-auto">
						{#each paymentEvents.slice(-5) as event}
							<div class="text-xs p-2 bg-base-300 rounded">
								<span class="font-mono text-primary">{event.type}</span>
								<span class="text-base-content/60 ml-2">{new Date().toLocaleTimeString()}</span>
							</div>
						{/each}
					</div>
				</div>
			</div>
		{/if}
	{/if}
</div>

<!-- Passkey Verification Modal -->
<PasskeyVerification
	bind:show={showPasskeyVerification}
	context={passkeyContext}
	onSuccess={handlePasskeySuccess}
	onCancel={() => (showPasskeyVerification = false)}
	onError={(err) => (error = err)}
/>

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

		.enhanced-send-form .input {
			min-height: 2.75rem;
			font-size: 16px; /* Prevents zoom on iOS */
		}
	}

	/* Ensure proper font scaling */
	.enhanced-send-form input[type='number'] {
		font-feature-settings: 'tnum';
		letter-spacing: 0.05em;
	}
</style>

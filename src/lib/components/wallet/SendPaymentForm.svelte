<script lang="ts">
	import type { Barcode } from '@capacitor-mlkit/barcode-scanning';
	import { t } from 'svelte-i18n';
	import { onMount } from 'svelte';
	import { Capacitor } from '@capacitor/core';
	import { appStore } from '$lib/stores/app.store';
	import { walletStore, walletManager, formatSats, formatUsd } from '$lib/stores/wallet.store';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';
	import {
		parsePaymentAddress,
		type ParsedPaymentAddress
	} from '$lib/utils/helpers/paymentAddressParser';
	import { triggerHaptic, ImpactStyle } from '$lib/utils/helpers/haptics';
	import { copyToClipboard } from '$lib/utils/helpers/clipboard';
	import QrCodeScanner from '$lib/components/QrCodeScanner.svelte';
	import WebQrCodeScanner from '$lib/components/WebQrCodeScanner.svelte';
	import AmountDisplay from '$lib/components/wallet/AmountDisplay.svelte';
	import AmountInputSection from '$lib/components/wallet/AmountInputSection.svelte';
	import TransactionSuccessScreen from '$lib/components/wallet/TransactionSuccessScreen.svelte';
	import IconClose from '~icons/mdi/close';
	import IconSend from '~icons/mdi/send';
	import IconCheck from '~icons/mdi/check';
	import IconContentCopy from '~icons/mdi/content-copy';

	let { onCancel, onSuccess } = $props<{
		onCancel: () => void;
		onSuccess?: (txHash: string, network: string) => void;
	}>();

	// Constants
	const LARGE_AMOUNT_THRESHOLD = 1000; // $1,000 USD

	// Platform detection
	const isWeb = Capacitor.getPlatform() === 'web';

	const netwokrOption = {
		'rootstock-bitcoin': {
			icon: '/images/chains/Bitcoin-Rootstock-logo.webp',
			name: $t('wallet.transaction.network.rootstock_bitcoin'),
			confirmationTime: 30,
			fallbackFee: 3000
		},
		'lightning-bitcoin': {
			icon: '/images/chains/lightning.svg',
			name: $t('wallet.networks.lightning'),
			confirmationTime: 0,
			fallbackFee: 4000
		},
		'liquid-bitcoin': {
			icon: '/images/chains/Liquid-Bitcoin.svg',
			name: $t('wallet.networks.liquid'),
			confirmationTime: 60,
			fallbackFee: 4000
		},
		bitcoin: {
			icon: '/images/chains/Bitcoin.svg',
			name: $t('wallet.networks.bitcoin'),
			confirmationTime: 600,
			fallbackFee: 4000
		},
		'usdt-bsc': {
			icon: '/images/chains/Binance-logo.svg',
			name: $t('wallet.transaction.network.binance_smart_chain'),
			confirmationTime: 5,
			fallbackFee: 4000
		}
	};

	// Grouped State: Form Input & Address Data
	let formInput = $state({
		addressInput: '',
		amount: '',
		unit: 'usd' as 'sats' | 'usd',
		mathExpression: '',
		memo: ''
	});

	// Grouped State: Parsed Payment Data
	let parsedPayment = $state<{
		data: ParsedPaymentAddress | null;
		detectedNetwork: string | null;
		detectedAmount: number | null;
		detectedMemo: string | null;
		amountRequired: boolean;
		addressError: string | null;
	}>({
		data: null,
		detectedNetwork: null,
		detectedAmount: null,
		detectedMemo: null,
		amountRequired: true,
		addressError: null
	});

	// Grouped State: UI State
	let uiState = $state({
		activeTab: 'scan' as 'scan' | 'enter',
		showConfirmation: false,
		showSendConfirmation: false,
		showSuccessScreen: false,
		descriptionExpanded: false,
		networkFeeExpanded: false,
		calculatorKey: 0,
		showRecentAddresses: false
	});

	// Grouped State: QR Scan State
	let qrScanState = $state<{
		error: string | null;
		scannedValue: string | null;
	}>({
		error: null,
		scannedValue: null
	});

	// Grouped State: Fee Estimation & Max Calculation
	let feeState = $state<{
		estimated: {
			serviceFee: number;
			networkFee: number;
			totalFees: number;
		} | null;
		isLoading: boolean;
		error: string | null;
		parameters: {
			percentage?: number;
			fixedFee?: number;
		} | null;
		maxCalculation: {
			isLoading: boolean;
			amount: number | null;
		};
	}>({
		estimated: null,
		isLoading: false,
		error: null,
		parameters: null,
		maxCalculation: {
			isLoading: false,
			amount: null
		}
	});

	// Grouped State: Send Operation
	let sendState = $state<{
		isSending: boolean;
		error: string | null;
		successTxHash: string | null;
		successNetwork: string | null;
	}>({
		isSending: false,
		error: null,
		successTxHash: null,
		successNetwork: null
	});

	// Cached Data
	let btcPrice = $state<number>(0);
	let recentAddresses = $state<Array<{ address: string; network: string; label?: string }>>([]);

	// Derived values
	const amountInSats = $derived.by(() => {
		if (parsedPayment.detectedAmount !== null) return parsedPayment.detectedAmount;
		if (formInput.unit === 'sats') {
			const parsed = parseFloat(formInput.amount);
			return isNaN(parsed) ? 0 : Math.floor(parsed);
		} else {
			const usdAmount = parseFloat(formInput.amount);
			if (isNaN(usdAmount) || btcPrice === 0) return 0;
			return Math.floor((usdAmount / btcPrice) * 100_000_000);
		}
	});

	const amountInUSD = $derived.by(() => {
		if (btcPrice === 0) return 0;
		return (amountInSats / 100_000_000) * btcPrice;
	});

	const showLargeAmountWarning = $derived(amountInUSD > LARGE_AMOUNT_THRESHOLD);

	const totalToSend = $derived(amountInSats + (feeState.estimated?.totalFees || 0));

	// Total to send in USD
	const totalToSendUSD = $derived.by(() => {
		if (totalToSend === 0 || btcPrice === 0) return 0;
		return (totalToSend / 100_000_000) * btcPrice;
	});

	// Calculate available balance based on detected network
	const availableBalance = $derived.by(() => {
		if (!parsedPayment.detectedNetwork) return 0;

		switch (parsedPayment.detectedNetwork) {
			case 'rootstock-bitcoin':
			case 'lightning-bitcoin':
				// Use formatted balance directly from wallet store
				if (!$walletStore.rsk.connected) return 0;
				const rbtc = parseFloat($walletStore.rsk.formattedBalance);
				return Math.floor(rbtc * 100_000_000);
			case 'usdt-bsc':
				// USDT: convert USD to sats using BTC price
				if (!$walletStore.bsc.connected) return 0;
				const usdt = parseFloat($walletStore.bsc.formattedUsdtBalance);
				if (btcPrice > 0 && usdt > 0) {
					return Math.floor((usdt / btcPrice) * 100_000_000);
				}
				return 0;
			default:
				return 0;
		}
	});

	// Check if balance is insufficient
	const hasInsufficientBalance = $derived(
		totalToSend > availableBalance &&
			availableBalance > 0 &&
			totalToSend > 0 &&
			feeState.estimated !== null
	);

	const isFormValid = $derived.by(() => {
		// Address validation: must have valid parsed data
		if (!parsedPayment.data?.isValid) {
			return false;
		}

		// Amount validation: if amount is required, must have amount > 0
		// When amount is detected from address, amountRequired is false, so this check is skipped
		if (parsedPayment.amountRequired && amountInSats <= 0) {
			return false;
		}

		// Must have a valid amount (either from input or detected)
		if (amountInSats <= 0) {
			return false;
		}

		// Note: Authentication is handled in handleSend(), not here
		// The button should be enabled so the user can click it and authenticate then

		// Balance check: total (including fees) must not exceed available balance
		if (totalToSend > availableBalance && availableBalance > 0) {
			return false;
		}

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

	// Handle QR scan (accepts both Barcode from Capacitor and string from html5-qrcode)
	async function handleQRScan(barcode: Barcode | string) {
		try {
			const qrValue = typeof barcode === 'string' ? barcode : barcode.rawValue;
			const parsed = parsePaymentAddress(qrValue);

			// Clear previous error state
			qrScanState.error = null;
			qrScanState.scannedValue = null;

			if (!parsed.isValid) {
				// Show error with decoded QR code
				// Use specific error message if available, otherwise use generic message
				qrScanState.error = parsed.errorMessage || $t('wallet.send.invalid_qr_code');
				qrScanState.scannedValue = qrValue;
				return;
			}

			// Valid address - populate form and switch to Enter Payment Details tab
			parsedPayment.data = parsed;
			formInput.addressInput = parsed.address;
			parsedPayment.detectedNetwork = parsed.network;
			parsedPayment.detectedAmount = parsed.amount;
			parsedPayment.detectedMemo = parsed.memo || null;
			parsedPayment.amountRequired = parsed.amount === null;

			if (parsed.amount !== null) {
				formInput.amount = parsed.amount.toString();
				// When amount is detected from QR code, default to sats since that's what's in the invoice
				formInput.unit = 'sats';
			} else {
				// When no amount detected, default to USD
				formInput.unit = 'usd';
			}
			if (parsed.memo) {
				formInput.memo = parsed.memo;
				// Auto-expand description accordion when memo is detected
				uiState.descriptionExpanded = true;
			}

			// Switch to Enter Payment Details tab - the form will reactively update
			uiState.activeTab = 'enter';
			uiState.showConfirmation = false;
			await updateFeeEstimate();
		} catch (error) {
			console.error('Failed to parse QR code:', error);
			qrScanState.error = $t('wallet.send.failed_to_parse_qr');
			qrScanState.scannedValue = typeof barcode === 'string' ? barcode : barcode.rawValue;
		}
	}

	// Copy scanned QR code to clipboard
	async function copyScannedQrCode() {
		if (!qrScanState.scannedValue) return;

		const success = await copyToClipboard(qrScanState.scannedValue);
		if (success) {
			appStore.showSuccessToast('Text copied to clipboard');
			triggerHaptic(ImpactStyle.Light);
		} else {
			appStore.showErrorToast('Failed to copy to clipboard');
		}
	}

	// Handle address input
	async function handleAddressInput() {
		parsedPayment.addressError = null;
		if (!formInput.addressInput.trim()) {
			parsedPayment.data = null;
			parsedPayment.detectedNetwork = null;
			parsedPayment.detectedAmount = null;
			parsedPayment.detectedMemo = null;
			parsedPayment.amountRequired = true;
			feeState.estimated = null;
			feeState.error = null;
			// Reset to USD when address is cleared
			formInput.unit = 'usd';
			return;
		}

		try {
			const parsed = parsePaymentAddress(formInput.addressInput);
			if (parsed.isValid) {
				parsedPayment.data = parsed;
				parsedPayment.detectedNetwork = parsed.network;
				parsedPayment.detectedAmount = parsed.amount;
				parsedPayment.detectedMemo = parsed.memo;
				parsedPayment.amountRequired = parsed.amount === null;

				if (parsed.amount !== null) {
					formInput.amount = parsed.amount.toString();
					// When amount is detected from address, default to sats since that's what's in the invoice
					formInput.unit = 'sats';
				} else {
					// When no amount detected, default to USD
					formInput.unit = 'usd';
				}
				if (parsed.memo) {
					formInput.memo = parsed.memo;
					// Auto-expand description accordion when memo is detected
					uiState.descriptionExpanded = true;
				}

				// If amount was detected, trigger fee estimation immediately
				if (parsed.amount !== null && parsed.amount > 0) {
					console.log('[SendPaymentForm] Address parsed with amount, triggering fee estimation', {
						amount: parsed.amount,
						network: parsed.network
					});
					// Use tick() to ensure reactive updates complete
					const { tick } = await import('svelte');
					await tick();
					await updateFeeEstimate();
				}
			} else {
				// Use specific error message if available, otherwise use generic message
				parsedPayment.addressError = parsed.errorMessage || $t('wallet.send.invalid_address');
				parsedPayment.data = null;
				parsedPayment.detectedNetwork = null;
				parsedPayment.detectedAmount = null;
				parsedPayment.detectedMemo = null;
				parsedPayment.amountRequired = true;
				feeState.estimated = null;
				feeState.error = null;
				// Reset to USD when address is invalid
				formInput.unit = 'usd';
			}
		} catch (error) {
			console.error('Failed to parse address:', error);
			parsedPayment.addressError = $t('wallet.send.failed_to_parse_address');
			feeState.estimated = null;
			feeState.error = null;
		}
	}

	// Update fee estimate
	async function updateFeeEstimate() {
		// Check if we have a network and an amount (either from input or detected from address)
		// Use detectedAmount if available and amountInSats is 0 (for immediate estimation when address has amount)
		const amountToUse =
			amountInSats > 0
				? amountInSats
				: parsedPayment.detectedAmount !== null && parsedPayment.detectedAmount > 0
					? parsedPayment.detectedAmount
					: 0;

		console.log('[SendPaymentForm] updateFeeEstimate', {
			amountInSats,
			detectedAmount: parsedPayment.detectedAmount,
			amountToUse,
			detectedNetwork: parsedPayment.detectedNetwork,
			hasAmount: amountToUse > 0,
			hasNetwork: !!parsedPayment.detectedNetwork
		});

		if (amountToUse === 0 || !parsedPayment.detectedNetwork) {
			console.log('[SendPaymentForm] Skipping fee estimation - missing amount or network');
			feeState.estimated = null;
			feeState.error = null;
			return;
		}

		feeState.isLoading = true;
		feeState.error = null;
		try {
			switch (parsedPayment.detectedNetwork) {
				case 'lightning-bitcoin':
					// Use submarine swap fee estimation (cached)
					const pairsData = await walletManager.getCachedSubmarineSwapPairs();
					const pair = pairsData?.['RBTC']?.['BTC'];
					if (pair) {
						// Boltz service fee (percentage of amount)
						const serviceFee = Math.ceil((amountToUse * pair.fees.percentage) / 100);

						// Estimate Rootstock gas fee for the swap transaction
						let rootstockGasFee = 0;
						if ($walletStore.rsk.connected && $walletStore.rsk.address) {
							const amountRBTC = (amountToUse / 100_000_000).toFixed(8);
							const gasEstimation = await walletManager.estimateRBTCGas(
								$walletStore.rsk.address,
								amountRBTC
							);
							const gasFeeRBTC =
								parseFloat(gasEstimation.totalCostFormatted) - parseFloat(amountRBTC);
							rootstockGasFee = Math.floor(gasFeeRBTC * 100_000_000);
						}

						// Total fees = service fee + Rootstock gas fee
						feeState.estimated = {
							serviceFee,
							networkFee: rootstockGasFee,
							totalFees: serviceFee + rootstockGasFee
						};
					} else {
						// Fallback if Boltz API fails
						const serviceFee = Math.ceil((amountToUse * 0.1) / 100);
						const networkFee = 4000; // Conservative gas estimate
						feeState.estimated = {
							serviceFee,
							networkFee,
							totalFees: serviceFee + networkFee
						};
					}
					break;
				case 'rootstock-bitcoin':
					if (!$walletStore.rsk.connected || !$walletStore.rsk.address) {
						const networkFee = 3000; // Fallback
						feeState.estimated = {
							serviceFee: 0,
							networkFee,
							totalFees: networkFee
						};
					}
					const amountRBTC = (amountToUse / 100_000_000).toFixed(8);
					// Use parsed address from parsedPayment, or extract address from addressInput
					let recipientAddress = parsedPayment.data?.address;
					if (!recipientAddress && formInput.addressInput) {
						// Extract address part (before ? or #)
						const addressMatch = formInput.addressInput.match(/^([^?#]+)/);
						recipientAddress = addressMatch ? addressMatch[1] : formInput.addressInput;
					}
					// Fallback to wallet address if no recipient address found
					const finalAddress = recipientAddress || $walletStore.rsk.address;

					const gasEstimation = await walletManager.estimateRBTCGas(finalAddress, amountRBTC);
					const gasFeeRBTC = parseFloat(gasEstimation.totalCostFormatted) - parseFloat(amountRBTC);
					const networkFee = Math.floor(gasFeeRBTC * 100_000_000);
					feeState.estimated = {
						serviceFee: 0,
						networkFee,
						totalFees: networkFee
					};
					break;
				default:
					feeState.estimated = null;
			}
		} catch (error) {
			console.error('Failed to estimate fees:', error);
			feeState.error = $t('wallet.swap.error.fee_fetch_failed');
			feeState.estimated = null;
		} finally {
			feeState.isLoading = false;
		}
	}

	// Fetch fee parameters when network is detected (for max calculation)
	async function fetchFeeParameters() {
		if (!parsedPayment.detectedNetwork || !availableBalance || availableBalance <= 0) {
			feeState.parameters = null;
			return;
		}

		try {
			switch (parsedPayment.detectedNetwork) {
				case 'lightning-bitcoin':
					// Fetch submarine swap pairs to get fee percentage (use cached)
					const pairsData = await walletManager.getCachedSubmarineSwapPairs();
					const pair = pairsData?.['RBTC']?.['BTC'];
					if (pair && pair.fees) {
						feeState.parameters = {
							percentage: pair.fees.percentage,
							fixedFee: pair.fees.minerFees || 32
						};
					} else {
						// Fallback to conservative estimate
						feeState.parameters = {
							percentage: 0.1, // 0.1%
							fixedFee: 32
						};
					}
					break;
				case 'rootstock-bitcoin':
					// For Rootstock, fees are mostly fixed (gas), but we need to estimate
					// We'll estimate with a high amount to get approximate gas fee
					if ($walletStore.rsk.connected && $walletStore.rsk.address) {
						try {
							// Estimate with 90% of balance to get approximate gas fee
							const estimateAmountRBTC = ((availableBalance * 0.9) / 100_000_000).toFixed(8);
							const gasEstimation = await walletManager.estimateRBTCGas(
								formInput.addressInput || $walletStore.rsk.address,
								estimateAmountRBTC
							);
							const gasFeeRBTC =
								parseFloat(gasEstimation.totalCostFormatted) - parseFloat(estimateAmountRBTC);
							const estimatedGasFee = Math.floor(gasFeeRBTC * 100_000_000);
							feeState.parameters = {
								fixedFee: estimatedGasFee
							};
						} catch (error) {
							console.warn('Failed to estimate gas for max calculation:', error);
							feeState.parameters = {
								fixedFee: 3000 // Conservative fallback
							};
						}
					} else {
						feeState.parameters = {
							fixedFee: 3000
						};
					}
					break;
				default:
					feeState.parameters = null;
			}
		} catch (error) {
			console.error('Failed to fetch fee parameters:', error);
			feeState.parameters = null;
		}
	}

	// Calculate max amount using mathematical formula for percentage fees
	function calculateMaxAmount(): number {
		if (!availableBalance || availableBalance <= 0) return 0;
		if (!feeState.parameters) return 0;

		const balance = availableBalance;
		const safetyMargin = 5; // 5 sats safety margin

		// For percentage-based fees: maxAmount = (balance - fixedFee) / (1 + percentage/100)
		if (feeState.parameters.percentage !== undefined) {
			const fixedFee = feeState.parameters.fixedFee || 0;
			const percentage = feeState.parameters.percentage;
			const maxBeforeMargin = (balance - fixedFee) / (1 + percentage / 100);
			return Math.max(0, Math.floor(maxBeforeMargin) - safetyMargin);
		}

		// For fixed fees only: maxAmount = balance - fixedFee
		if (feeState.parameters.fixedFee !== undefined) {
			return Math.max(0, balance - feeState.parameters.fixedFee - safetyMargin);
		}

		return 0;
	}

	// Handle updates when amount changes (called explicitly)
	async function handleAmountChange() {
		// Update fee estimate if we have network and amount
		if (parsedPayment.detectedNetwork && amountInSats > 0) {
			await updateFeeEstimate();
		}
	}

	// Handle calculation change from calculator
	function handleCalculationChange(expression: string, result: number) {
		formInput.mathExpression = expression;
		if (result > 0 || expression === '') {
			if (formInput.unit === 'sats') {
				formInput.amount = Math.floor(result).toString();
			} else {
				formInput.amount = result.toFixed(2).replace(/\.?0+$/, '');
			}
		}
		// Explicitly trigger amount change handler
		handleAmountChange();
	}

	// Handle max amount click (simplified - single-pass calculation)
	async function handleMaxAmount() {
		if (!parsedPayment.detectedNetwork || !availableBalance || availableBalance <= 0) return;

		feeState.maxCalculation.isLoading = true;
		triggerHaptic(ImpactStyle.Light);

		try {
			formInput.mathExpression = '';

			// Fetch fee parameters if not available
			if (!feeState.parameters) {
				await fetchFeeParameters();
			}

			// Calculate max amount
			const max = calculateMaxAmount();
			if (max > 0) {
				feeState.maxCalculation.amount = max;

				// Set amount in appropriate unit
				if (formInput.unit === 'sats') {
					formInput.amount = max.toString();
				} else if (btcPrice > 0) {
					const usdAmount = (max / 100_000_000) * btcPrice;
					formInput.amount = usdAmount.toFixed(2).replace(/\.?0+$/, '');
				}

				// Trigger fee estimation to get final accurate fees
				await updateFeeEstimate();

				// Apply final refined amount (one-time adjustment)
				if (feeState.estimated) {
					const refinedMax = Math.max(0, availableBalance - feeState.estimated.totalFees - 2);
					if (Math.abs(refinedMax - max) > 10) {
						// Only if significant difference
						feeState.maxCalculation.amount = refinedMax;
						if (formInput.unit === 'sats') {
							formInput.amount = refinedMax.toString();
						} else if (btcPrice > 0) {
							const usdAmount = (refinedMax / 100_000_000) * btcPrice;
							formInput.amount = usdAmount.toFixed(2).replace(/\.?0+$/, '');
						}
					}
				}
			}
		} catch (error) {
			console.error('Failed to calculate max amount:', error);
		} finally {
			feeState.maxCalculation.isLoading = false;
		}
	}

	// Handle amount input change (wrapper to trigger updates)
	function handleAmountInputChange(value: string) {
		formInput.amount = value;
		// Explicitly trigger amount change handler
		handleAmountChange();
	}

	// Handle unit change
	function handleUnitChange(newUnit: 'sats' | 'usd') {
		triggerHaptic(ImpactStyle.Light);
		formInput.unit = newUnit;
		// Keep amount when switching units - user may have entered amount before selecting unit
		formInput.mathExpression = '';
		// Don't increment calculatorKey - preserve calculator state and amount
		// Trigger amount change handler
		handleAmountChange();
	}

	// Clear calculator
	function handleClearCalculator() {
		formInput.amount = '';
		formInput.mathExpression = '';
		uiState.calculatorKey++;
	}

	// Handle unit toggle (for AmountDisplay compatibility)
	function handleUnitToggle() {
		handleUnitChange(formInput.unit === 'sats' ? 'usd' : 'sats');
	}

	// Handle send
	async function handleSend() {
		if (!isFormValid) return;

		sendState.isSending = true;
		sendState.error = null;

		try {
			const recipient = parsedPayment.data?.address || formInput.addressInput.trim();
			const finalAmount = totalToSend; // Amount including fees
			const network = parsedPayment.detectedNetwork || 'rootstock-bitcoin';

			if (!recipient || finalAmount <= 0) {
				throw new Error($t('wallet.send.error.invalid_payment_details'));
			}

			let txHash: string | null = null;

			if (network === 'lightning-bitcoin') {
				// Lightning send via submarine swap
				const swapResult = await walletManager.createSubmarineSwap(recipient);
				const lockResult = await walletManager.lockSubmarineSwapFunds(swapResult.swapData);
				txHash = lockResult.txHash;
			} else if (network === 'rootstock-bitcoin') {
				// RSK direct send
				const amountRBTC = finalAmount / 100_000_000;
				txHash = await walletManager.sendRBTC(recipient, amountRBTC.toFixed(8));
			} else if (network === 'liquid-bitcoin') {
				// Liquid chain swap send
				// This would use LBTCChainSwapSend component logic
				appStore.showErrorToast($t('wallet.send.network_not_available'));
				sendState.isSending = false;
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
				sendState.successTxHash = txHash;
				sendState.successNetwork = network;
				uiState.showSuccessScreen = true;
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
			sendState.error = err instanceof Error ? err.message : $t('wallet.send.transaction_failed');
			appStore.showErrorToast(sendState.error);
			triggerHaptic(ImpactStyle.Heavy);
		} finally {
			sendState.isSending = false;
		}
	}

	// Get explorer URL for address based on network
	function getAddressExplorerUrl(address: string, network: string | null): string | null {
		if (!address || !network) return null;

		const rskNetwork = import.meta.env.VITE_RSK_NETWORK || 'testnet';
		const bscNetwork = import.meta.env.VITE_BSC_NETWORK || 'testnet';

		if (network === 'rootstock-bitcoin' || network === 'rsk') {
			return rskNetwork === 'mainnet'
				? `https://rootstock.blockscout.com/address/${address}`
				: `https://rootstock-testnet.blockscout.com/address/${address}`;
		} else if (network === 'usdt-bsc' || network === 'bsc') {
			return bscNetwork === 'mainnet'
				? `https://bscscan.com/address/${address}`
				: `https://testnet.bscscan.com/address/${address}`;
		} else if (network === 'bitcoin') {
			return `https://blockstream.info/address/${address}`;
		} else if (network === 'liquid-bitcoin') {
			return `https://blockstream.info/liquid/address/${address}`;
		}

		return null;
	}

	// Handle showing send confirmation
	function showSendConfirmationModal() {
		uiState.showSendConfirmation = true;
		triggerHaptic(ImpactStyle.Light);
	}

	// Handle confirmed send
	async function handleConfirmedSend() {
		uiState.showSendConfirmation = false;
		await handleSend();
	}
</script>

<div class="send-payment-form flex h-full flex-col">
	<div class="relative flex-1 space-y-6 overflow-y-auto">
		{#if uiState.activeTab === 'scan' && !uiState.showConfirmation}
			<!-- QR Code Scanner -->
			<div class="flex min-h-full flex-col items-center justify-center gap-4 px-4">
				<p class="text-base-content/70 text-sm">{$t('wallet.send.scan_qr_code_description')}</p>

				{#if qrScanState.error}
					<!-- Error state with decoded QR code -->
					<div class="w-full space-y-4">
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
							<span class="text-sm">{qrScanState.error}</span>
						</div>

						<div class="form-control">
							<label for="scanned-qr-code" class="label">
								<span class="label-text">{$t('wallet.send.scanned_qr_code')}</span>
							</label>
							<div class="relative">
								<textarea
									id="scanned-qr-code"
									class="textarea textarea-bordered textarea-error w-full pr-12 {qrScanState.scannedValue
										? 'cursor-pointer'
										: ''}"
									readonly
									rows="4"
									onclick={copyScannedQrCode}>{qrScanState.scannedValue || ''}</textarea
								>
								<button
									class="btn btn-ghost btn-sm btn-square absolute top-1/2 right-2 -translate-y-1/2"
									onclick={(e) => {
										e.stopPropagation();
										copyScannedQrCode();
									}}
									aria-label={$t('wallet.copy_address')}
								>
									<IconContentCopy class="h-5 w-5" />
								</button>
							</div>
						</div>

						<button
							class="btn btn-primary w-full"
							onclick={() => {
								qrScanState.error = null;
								qrScanState.scannedValue = null;
							}}
						>
							{$t('common.buttons.retry')}
						</button>
					</div>
				{:else if isWeb}
					<WebQrCodeScanner
						onScan={(result) => handleQRScan(result)}
						onClose={() => (uiState.activeTab = 'enter')}
					/>
				{:else}
					<QrCodeScanner onScan={handleQRScan} onClose={() => (uiState.activeTab = 'enter')} />
				{/if}
			</div>
		{/if}

		{#if uiState.activeTab === 'scan' && uiState.showConfirmation}
			<!-- Confirmation Screen -->
			<div class="space-y-6">
				<div class="flex items-center justify-end">
					<button class="btn btn-ghost btn-sm" onclick={() => (uiState.showConfirmation = false)}>
						{$t('common.back')}
					</button>
				</div>

				<!-- Amount Display -->
				<div class="flex flex-col items-center gap-2">
					<AmountDisplay
						amount={formInput.amount}
						unit={formInput.unit}
						onUnitToggle={handleUnitToggle}
						{btcPrice}
					/>
					{#if showLargeAmountWarning}
						<p class="text-error text-center text-sm">
							{$t('wallet.send.large_amount_warning.message', {
								values: { amount: formatUsd(amountInUSD) }
							})}
						</p>
					{/if}
				</div>

				<!-- Network Display -->
				{#if parsedPayment.detectedNetwork}
					{@const network =
						netwokrOption[parsedPayment.detectedNetwork as keyof typeof netwokrOption]}
					<div class="border-base-300 bg-primary/10 rounded-lg border p-4">
						<div class="flex items-center gap-2">
							{#if network?.icon}
								<img src={network?.icon} alt={network?.name} class="h-5 w-5" />
							{/if}
							<span class="font-medium">{network?.name}</span>
						</div>
					</div>
				{/if}

				<!-- Address Display -->
				<div class="form-control">
					<div class="input input-bordered w-full break-all">{formInput.addressInput}</div>
				</div>

				<!-- Conditional Amount Field -->
				{#if parsedPayment.amountRequired}
					<div class="form-control">
						<AmountInputSection
							amount={formInput.amount}
							unit={formInput.unit}
							mathExpression={formInput.mathExpression}
							calculatorKey={uiState.calculatorKey}
							network={parsedPayment.detectedNetwork}
							{availableBalance}
							calculatedMaxAmount={feeState.maxCalculation.amount}
							isLoadingMaxCalculation={feeState.maxCalculation.isLoading}
							{btcPrice}
							onAmountChange={handleAmountInputChange}
							onUnitChange={handleUnitChange}
							onCalculationChange={handleCalculationChange}
							onClear={handleClearCalculator}
							onMaxAmount={handleMaxAmount}
						/>
					</div>
				{/if}

				<!-- Action Buttons -->
				<div class="flex gap-3">
					<button class="btn btn-error flex-1" onclick={() => (uiState.showConfirmation = false)}>
						{$t('common.cancel')}
					</button>
					<button
						class="btn btn-primary flex-1"
						onclick={handleSend}
						disabled={!isFormValid || feeState.isLoading}
					>
						{$t('wallet.send.send')}
					</button>
				</div>
			</div>
		{/if}

		{#if uiState.activeTab === 'enter'}
			<!-- Enter Payment Details Tab -->
			<div class="space-y-4">
				<!-- Address Input -->
				<div class="form-control">
					<div class="relative">
						<div
							class="flex w-full items-stretch overflow-hidden rounded-lg border-2 transition-colors"
							class:border-primary={!parsedPayment.data?.isValid && !parsedPayment.addressError}
							class:border-success={parsedPayment.data?.isValid &&
								!parsedPayment.addressError &&
								formInput.addressInput.trim()}
							class:border-error={!!parsedPayment.addressError}
						>
							<!-- Input field with validation icons -->
							<div class="relative flex-1">
								<input
									id="address-input"
									type="text"
									class="input input-bordered min-h-[44px] w-full rounded-l-lg rounded-r-none border-0 pl-10"
									placeholder={$t('wallet.send.address_placeholder')}
									bind:value={formInput.addressInput}
									oninput={handleAddressInput}
									onfocus={() => (uiState.showRecentAddresses = recentAddresses.length > 0)}
									onblur={() => setTimeout(() => (uiState.showRecentAddresses = false), 200)}
								/>
								{#if formInput.addressInput.trim()}
									<div
										class="pointer-events-none absolute top-1/2 left-3 flex -translate-y-1/2 items-center gap-1"
									>
										{#if parsedPayment.data?.isValid && !parsedPayment.addressError}
											<IconCheck class="text-success h-5 w-5" />
										{:else if parsedPayment.addressError}
											<IconClose class="text-error h-5 w-5" />
										{/if}
									</div>
								{/if}
							</div>
							<!-- Clear button -->
							<button
								type="button"
								class="bg-primary text-primary-content flex min-h-[44px] min-w-[60px] touch-manipulation items-center justify-center rounded-l-none rounded-r-lg px-4 py-1 text-2xl font-semibold whitespace-nowrap transition-opacity select-none disabled:opacity-50"
								style="-webkit-tap-highlight-color: transparent; margin-left: -2px; width: 70px;"
								onclick={() => {
									formInput.addressInput = '';
									parsedPayment.data = null;
									parsedPayment.detectedNetwork = null;
									parsedPayment.detectedAmount = null;
									parsedPayment.detectedMemo = null;
									parsedPayment.addressError = null;
									parsedPayment.amountRequired = true;
									feeState.estimated = null;
									feeState.error = null;
									uiState.showRecentAddresses = false;
									triggerHaptic(ImpactStyle.Light);
								}}
								disabled={!formInput.addressInput.trim()}
								aria-label="Clear address"
							>
								⤫<!-- {$t('common.clear')} -->
							</button>
						</div>
						{#if uiState.showRecentAddresses && recentAddresses.length > 0}
							<div
								class="border-base-300 bg-base-100 absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border shadow-lg"
							>
								{#each recentAddresses as recentAddress}
									<button
										class="hover:bg-base-200 flex w-full items-center justify-between px-4 py-2 text-left"
										onclick={() => {
											formInput.addressInput = recentAddress.address;
											uiState.showRecentAddresses = false;
											handleAddressInput();
										}}
									>
										<div class="min-w-0 flex-1">
											<div class="truncate font-semibold">
												{recentAddress.label || recentAddress.address.slice(0, 20)}...
											</div>
											<div class="text-base-content/70 text-xs">{recentAddress.network}</div>
										</div>
									</button>
								{/each}
							</div>
						{/if}
					</div>
					{#if parsedPayment.addressError}
						<div class="label">
							<span class="label-text-alt text-error">{parsedPayment.addressError}</span>
						</div>
					{/if}
				</div>

				<!-- Auto-detected Network Display -->
				{#if parsedPayment.detectedNetwork}
					{@const network =
						netwokrOption[parsedPayment.detectedNetwork as keyof typeof netwokrOption]}
					<div class="border-base-300 bg-primary/10 rounded-lg border p-2">
						<div class="flex items-center justify-between gap-2 pl-2">
							<div class="flex items-center gap-2">
								{#if network?.icon}
									<img src={network?.icon} alt={network?.name} class="h-5 w-5" />
								{/if}
								<span class="font-medium">{network?.name}</span>
							</div>
							{#if parsedPayment.detectedAmount && parsedPayment.detectedAmount > 0}
								<div class="text-right text-sm">
									<div class="font-semibold">
										{formatSats(parsedPayment.detectedAmount)}
										{$t('wallet.sats')}
									</div>
									{#if btcPrice > 0}
										<div class="opacity-70">
											≈ {formatUsd((parsedPayment.detectedAmount / 100_000_000) * btcPrice)}
										</div>
									{/if}
								</div>
							{/if}
						</div>
					</div>
				{/if}

				<!-- Amount Field (always visible) -->
				<div class="form-control space-y-4">
					<AmountInputSection
						amount={formInput.amount}
						unit={formInput.unit}
						mathExpression={formInput.mathExpression}
						calculatorKey={uiState.calculatorKey}
						memo={formInput.memo}
						descriptionExpanded={uiState.descriptionExpanded}
						estimatedFees={feeState.estimated?.totalFees ?? 0}
						{amountInSats}
						{btcPrice}
						isLoadingFees={feeState.isLoading}
						network={parsedPayment.detectedNetwork}
						{availableBalance}
						calculatedMaxAmount={feeState.maxCalculation.amount}
						isLoadingMaxCalculation={feeState.maxCalculation.isLoading}
						disabled={parsedPayment.detectedAmount !== null && parsedPayment.detectedAmount > 0}
						onAmountChange={handleAmountInputChange}
						onUnitChange={handleUnitChange}
						onCalculationChange={handleCalculationChange}
						onClear={handleClearCalculator}
						onMaxAmount={handleMaxAmount}
						onMemoChange={(value) => (formInput.memo = value)}
						onDescriptionToggle={(expanded) => (uiState.descriptionExpanded = expanded)}
						descriptionDisabled={!!parsedPayment.detectedMemo}
						descriptionLabelText={parsedPayment.detectedMemo
							? 'wallet.send.from_invoice'
							: undefined}
					/>
					{#if showLargeAmountWarning}
						<p class="text-error text-center text-sm">
							{$t('wallet.send.large_amount_warning.message', {
								values: { amount: formatUsd(amountInUSD) }
							})}
						</p>
					{/if}
				</div>

				<!-- Network Fee Accordion -->
				{#if feeState.isLoading}
					<div
						class="border-base-300 bg-base-200 flex items-center justify-center gap-2 rounded-lg border p-2"
					>
						<span class="loading loading-spinner loading-sm"></span>
						<span class="text-sm">{$t('wallet.swap.loading_fees')}</span>
					</div>
				{:else if feeState.error}
					<div class="alert alert-outline alert-error">
						<span>{feeState.error}</span>
					</div>
				{:else}
					<div
						class="collapse-arrow border-base-300 bg-base-100 collapse rounded-lg border"
						class:collapse-open={uiState.networkFeeExpanded}
					>
						<button
							type="button"
							class="collapse-title min-h-0 px-4 py-1 text-left font-medium"
							onclick={() => {
								triggerHaptic(ImpactStyle.Light);
								uiState.networkFeeExpanded = !uiState.networkFeeExpanded;
							}}
						>
							<div class="flex w-full items-center gap-2">
								<span>{$t('wallet.network_fee')}:</span>
								{#if feeState.estimated}
									<span class="font-semibold"
										>{formatSats(feeState.estimated.totalFees)} {$t('wallet.sats')}</span
									>
									{#if btcPrice > 0 && feeState.estimated.totalFees > 0}
										<span class="opacity-60">
											≈ {formatUsd((feeState.estimated.totalFees / 100_000_000) * btcPrice)}
										</span>
									{/if}
								{:else}
									<span class="font-semibold">0 {$t('wallet.sats')}</span>
								{/if}
							</div>
						</button>
						<div class="collapse-content">
							<div class="space-y-2 px-4 pb-4">
								{#if feeState.estimated && feeState.estimated.serviceFee > 0}
									<div class="flex items-center justify-between text-xs opacity-70">
										<span>{$t('wallet.swap.swap_fee')}:</span>
										<span>{formatSats(feeState.estimated.serviceFee)} {$t('wallet.sats')}</span>
									</div>
								{/if}
								{#if feeState.estimated && feeState.estimated.networkFee > 0}
									<div class="flex items-center justify-between text-xs opacity-70">
										<span>{$t('wallet.swap.network_transaction_fee')}:</span>
										<span>{formatSats(feeState.estimated.networkFee)} {$t('wallet.sats')}</span>
									</div>
								{/if}
								{#if !feeState.estimated || feeState.estimated.totalFees === 0}
									<div class="py-2 text-center text-xs opacity-70">
										{$t('wallet.send.enter_address_and_amount_to_estimate')}
									</div>
								{/if}
							</div>
						</div>
					</div>
				{/if}

				<!-- Total to Send Card -->
				<div
					class="bg-base-200 flex flex-col items-center gap-2 rounded-lg border-2 p-2"
					class:border-primary={!hasInsufficientBalance}
					class:border-error={hasInsufficientBalance}
				>
					<span class="text-center text-sm opacity-70">{$t('wallet.send.total_to_send')}</span>
					{#if totalToSend > 0 && feeState.estimated}
						<div class="flex w-full items-center justify-center gap-2">
							{#if formInput.unit === 'sats'}
								<span class="text-primary text-2xl font-bold">
									{formatSats(totalToSend)}
									{$t('wallet.sats')}
								</span>
								{#if btcPrice > 0}
									<span class="text-sm opacity-60">
										≈ {formatUsd(totalToSendUSD)}
									</span>
								{/if}
							{:else}
								<span class="text-primary text-2xl font-bold">
									{formatUsd(totalToSendUSD)}
								</span>
								{#if btcPrice > 0}
									<span class="text-sm opacity-60">
										≈ {formatSats(totalToSend)}
										{$t('wallet.sats')}
									</span>
								{/if}
							{/if}
						</div>
					{:else}
						<div class="text-center text-sm opacity-60">
							{$t('wallet.send.enter_address_and_amount_to_estimate')}
						</div>
					{/if}
					<!-- Insufficient Balance Error Text -->
					{#if hasInsufficientBalance}
						<div class="text-error mt-1 text-center text-sm">
							{$t('wallet.validation.insufficient_balance')}
						</div>
					{/if}
				</div>
			</div>
		{/if}
	</div>

	<!-- Action Buttons (Bottom, only on Enter Payment Details tab) -->
	{#if uiState.activeTab === 'enter'}
		<div class="border-base-300 mb-4 shrink-0 border-t pt-4">
			<div class="flex gap-3">
				<button
					class="btn btn-error min-h-[48px] flex-1 touch-manipulation transition-transform duration-100 select-none active:scale-95 md:min-h-[56px]"
					style="-webkit-tap-highlight-color: transparent;"
					onclick={() => {
						triggerHaptic(ImpactStyle.Light);
						onCancel();
					}}
				>
					<IconClose class="mr-2 h-5 w-5" />
					{$t('common.cancel')}
				</button>
				<button
					class="btn btn-primary min-h-[48px] flex-1 touch-manipulation transition-transform duration-100 select-none active:scale-95 md:min-h-[56px]"
					style="-webkit-tap-highlight-color: transparent;"
					onclick={showSendConfirmationModal}
					disabled={!isFormValid || feeState.isLoading}
					onmouseenter={() => {
						if (!isFormValid || feeState.isLoading) {
							console.log(
								'[Send Button] Disabled - isFormValid:',
								isFormValid,
								'isLoadingFees:',
								feeState.isLoading
							);
						}
					}}
				>
					<IconSend class="mr-2 h-5 w-5" />
					{$t('wallet.send.send')}
				</button>
			</div>
		</div>
	{/if}

	<!-- Cancel Button (Bottom, only on Scan QR Code tab) -->
	{#if uiState.activeTab === 'scan' && !uiState.showConfirmation}
		<div class="flex w-full shrink-0 justify-center pb-4">
			<button
				class="btn btn-error min-h-[48px] touch-manipulation transition-transform duration-100 select-none active:scale-95 md:min-h-[56px]"
				style="-webkit-tap-highlight-color: transparent;"
				onclick={() => {
					triggerHaptic(ImpactStyle.Light);
					onCancel();
				}}
			>
				<IconClose class="mr-2 h-5 w-5" />
				{$t('common.cancel')}
			</button>
		</div>
	{/if}

	<!-- Tab Navigation (Bottom) -->
	<div class="tabs tabs-boxed mt-auto overflow-hidden rounded-lg border border-base-300">
		<button
			class="tab flex-1"
			class:bg-primary={uiState.activeTab === 'scan'}
			class:text-primary-content={uiState.activeTab === 'scan'}
			class:tab-active={uiState.activeTab === 'scan'}
			onclick={() => {
				uiState.activeTab = 'scan';
				uiState.showConfirmation = false;
			}}
		>
			{$t('wallet.send.scan_qr_code')}
		</button>
		<button
			class="tab flex-1"
			class:bg-primary={uiState.activeTab === 'enter'}
			class:text-primary-content={uiState.activeTab === 'enter'}
			class:tab-active={uiState.activeTab === 'enter'}
			onclick={() => {
				uiState.activeTab = 'enter';
				uiState.showConfirmation = false;
			}}
		>
			{$t('wallet.send.enter_payment_details')}
		</button>
	</div>

	<!-- Success Screen -->
	{#if uiState.showSuccessScreen && sendState.successTxHash && sendState.successNetwork}
		<div class="bg-base-100 fixed inset-0 z-110 flex flex-col">
			<TransactionSuccessScreen
				txHash={sendState.successTxHash}
				network={sendState.successNetwork}
				amount={amountInSats}
				recipient={parsedPayment.data?.address || formInput.addressInput}
				onClose={() => {
					uiState.showSuccessScreen = false;
					onCancel();
				}}
			/>
		</div>
	{/if}

	<!-- Send Confirmation Modal -->
	{#if uiState.showSendConfirmation}
		{@const recipientAddress = parsedPayment.data?.address || formInput.addressInput.trim()}
		{@const explorerUrl = getAddressExplorerUrl(recipientAddress, parsedPayment.detectedNetwork)}
		{@const estimatedTime = netwokrOption[parsedPayment.detectedNetwork as keyof typeof netwokrOption]?.confirmationTime}
		<div class="modal modal-open z-120">
			<div class="modal-box max-w-md">
				<h3 class="text-lg font-bold">{$t('wallet.send.confirm_payment')}</h3>
				<div class="space-y-4 py-4">
					<!-- Address -->
					<div class="space-y-1">
						<div class="text-sm font-medium opacity-70">{$t('wallet.send.address_or_invoice')}</div>
						{#if explorerUrl}
							<a
								href={explorerUrl}
								target="_blank"
								rel="noopener noreferrer"
								class="text-primary break-all hover:underline"
							>
								{recipientAddress}
							</a>
						{:else}
							<div class="break-all">{recipientAddress}</div>
						{/if}
					</div>

					<!-- Amount -->
					<div class="space-y-1">
						<div class="text-sm font-medium opacity-70">{$t('wallet.send.amount')}</div>
						<div class="font-semibold">
							{#if formInput.unit === 'sats'}
								{formatSats(amountInSats)}
								{$t('wallet.sats')}
								{#if btcPrice > 0}
									<span class="ml-2 text-sm opacity-70">
										≈ {formatUsd(amountInUSD)}
									</span>
								{/if}
							{:else}
								{formatUsd(amountInUSD)}
								{#if btcPrice > 0}
									<span class="ml-2 text-sm opacity-70">
										≈ {formatSats(amountInSats)}
										{$t('wallet.sats')}
									</span>
								{/if}
							{/if}
						</div>
					</div>

					<!-- Estimated Transaction Fees -->
					{#if feeState.estimated && feeState.estimated.totalFees > 0}
						<div class="space-y-1">
							<div class="text-sm font-medium opacity-70">{$t('wallet.send.transaction_fee')}</div>
							<div class="font-semibold">
								{formatSats(feeState.estimated.totalFees)}
								{$t('wallet.sats')}
								{#if btcPrice > 0}
									<span class="ml-2 text-sm opacity-70">
										≈ {formatUsd((feeState.estimated.totalFees / 100_000_000) * btcPrice)}
									</span>
								{/if}
							</div>
						</div>
					{/if}

					<!-- Estimated Time -->
					<div class="space-y-1">
						<div class="text-sm font-medium opacity-70">
							{$t('wallet.send.estimated_confirmation_time')}
						</div>
						<div class="font-semibold">
							{#if estimatedTime > 0}
								{estimatedTime} {$t('wallet.send.seconds')}
							{:else}
								{$t('wallet.send.instant')}
							{/if}
						</div>
					</div>

					<!-- Warning -->
					<div class="alert alert-outline alert-warning mt-4">
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
								d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
							/>
						</svg>
						<span class="text-sm">{$t('wallet.send.confirmation_warning')}</span>
					</div>
				</div>
				<div class="modal-action">
					<button class="btn btn-ghost" onclick={() => (uiState.showSendConfirmation = false)}>
						{$t('common.cancel')}
					</button>
					<button class="btn btn-primary" onclick={handleConfirmedSend}>
						{$t('wallet.send.send')}
					</button>
				</div>
			</div>
			<button
				class="modal-backdrop"
				onclick={() => (uiState.showSendConfirmation = false)}
				aria-label="Close modal"
			></button>
		</div>
	{/if}
</div>

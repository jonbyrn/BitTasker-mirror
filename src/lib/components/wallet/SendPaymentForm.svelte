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
	import DescriptionAccordion from '$lib/components/wallet/DescriptionAccordion.svelte';
	import TransactionSuccessScreen from '$lib/components/wallet/TransactionSuccessScreen.svelte';
	import IconClose from '~icons/mdi/close';
	import IconSend from '~icons/mdi/send';
	import IconCheck from '~icons/mdi/check';
	import IconContentCopy from '~icons/mdi/content-copy';
	import IconChevronLeft from '~icons/mdi/chevron-left';
	import IconChevronRight from '~icons/mdi/chevron-right';
	import IconChevronUp from '~icons/mdi/chevron-up';
	import IconChevronDown from '~icons/mdi/chevron-down';
	import IconOpenInNew from '~icons/mdi/open-in-new';
	import { linear } from 'svelte/easing';
	import { fly, slide } from 'svelte/transition';

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
		activeTab: 'enter' as 'scan' | 'enter',
		showConfirmation: false,
		showSendConfirmation: false,
		showSuccessScreen: false,
		descriptionExpanded: false,
		networkFeeExpanded: false,
		calculatorKey: 0,
		showRecentAddresses: false,
		currentStep: 1 as 1 | 2, // Step 1: Address + Amount, Step 2: Details
		addressExpanded: false, // Track if address is expanded in confirmation modal
		addressCopied: false // Track if address was copied in confirmation modal
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
				return $walletStore.totalBalances.sats;
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

				// Use tick() to ensure reactive updates complete before checking amountInSats
				const { tick } = await import('svelte');
				await tick();

				// Trigger fee estimation if we have:
				// 1. Amount detected from address, OR
				// 2. Amount already entered by user (regardless of order)
				if (parsed.amount !== null && parsed.amount > 0) {
					console.log('[SendPaymentForm] Address parsed with amount, triggering fee estimation', {
						amount: parsed.amount,
						network: parsed.network
					});
					await updateFeeEstimate();
				} else if (amountInSats > 0) {
					// User entered amount before address - trigger fee estimation now that we have network
					console.log('[SendPaymentForm] Address parsed, triggering fee estimation for existing amount', {
						amount: amountInSats,
						network: parsed.network
					});
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
					// For lightning invoices, amountToUse is the invoice amount (what receiver gets)
					const pairsData = await walletManager.getCachedSubmarineSwapPairs();
					const pair = pairsData?.['RBTC']?.['BTC'];
					if (pair && pair.fees) {
						// Boltz service fee (percentage of invoice amount)
						const serviceFeePercentage = pair.fees.percentage; // e.g., 0.1 means 0.1%
						const serviceFee = Math.ceil((amountToUse * serviceFeePercentage) / 100);

						// Miner fee (network fee for the on-chain transaction) - this is a fixed fee
						const minerFee = pair.fees.minerFees || 32; // Fixed miner fee in sats

						// Estimate Rootstock gas fee for the swap transaction
						// Gas is calculated based on total amount to send (invoice + service fee + miner fee)
						let rootstockGasFee = 0;
						if ($walletStore.rsk.connected && $walletStore.rsk.address) {
							const totalAmountToSend = amountToUse + serviceFee + minerFee;
							const amountRBTC = (totalAmountToSend / 100_000_000).toFixed(8);
							const gasEstimation = await walletManager.estimateRBTCGas(
								$walletStore.rsk.address,
								amountRBTC
							);
							const gasFeeRBTC =
								parseFloat(gasEstimation.totalCostFormatted) - parseFloat(amountRBTC);
							rootstockGasFee = Math.max(0, Math.floor(gasFeeRBTC * 100_000_000));
						}

						// Total fees = service fee + miner fee + Rootstock gas fee
						// The user pays: invoice amount + service fee + miner fee + gas
						// The receiver gets: invoice amount (exactly as specified)
						feeState.estimated = {
							serviceFee,
							networkFee: minerFee + rootstockGasFee, // Miner fee + gas
							totalFees: serviceFee + minerFee + rootstockGasFee
						};
					} else {
						// Fallback if Boltz API fails
						const serviceFee = Math.ceil((amountToUse * 0.1) / 100);
						const minerFee = 32; // Conservative miner fee estimate
						const networkFee = minerFee + 4000; // Miner fee + conservative gas estimate
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

					const gasEstimation = await walletManager.estimateRBTCGas(finalAddress!, amountRBTC);
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

	// Handle step navigation
	function handleNextStep() {
		// Validate that we have address and amount before proceeding
		if (parsedPayment.data?.isValid && !parsedPayment.addressError && amountInSats > 0) {
			triggerHaptic(ImpactStyle.Light);
			uiState.currentStep = 2;
		} else if (parsedPayment.data?.isValid && !parsedPayment.addressError && parsedPayment.detectedAmount && parsedPayment.detectedAmount > 0) {
			// Lightning invoice with amount - can proceed without user entering amount
			triggerHaptic(ImpactStyle.Light);
			uiState.currentStep = 2;
		}
	}

	function handleBackStep() {
		triggerHaptic(ImpactStyle.Light);
		uiState.currentStep = 1;
	}

	// Handle calculation change from calculator
	function handleCalculationChange(expression: string, result: number) {
		console.log({ expression, result });
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
		if (!parsedPayment.detectedNetwork || !availableBalance || availableBalance <= 0)
			return console.log('No network or available balance');

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
				const amountRBTC = amountInSats / 100_000_000;
				txHash = await walletManager.sendRBTC(recipient, amountRBTC.toFixed(8)).catch((error) => {
					throw error;
				});
				// Show immediate feedback and close form
				appStore.showSuccessToast($t('wallet.send.transaction_sending'));
				triggerHaptic(ImpactStyle.Medium);

				// Close the form immediately
				onCancel();

				// Return early to prevent showing success screen
				return;
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

				// Auto-close modal after showing success for 3 seconds
				setTimeout(() => {
					uiState.showSuccessScreen = false;
					onCancel(); // This closes the parent modal
				}, 3000);
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
		// Use RSK network setting as the general indicator for mainnet/testnet mode
		// This is consistent with how the app determines network mode
		const isMainnet = rskNetwork === 'mainnet';

		if (network === 'rootstock-bitcoin' || network === 'rsk') {
			return isMainnet
				? `https://rootstock.blockscout.com/address/${address}`
				: `https://rootstock-testnet.blockscout.com/address/${address}`;
		} else if (network === 'usdt-bsc' || network === 'bsc') {
			return bscNetwork === 'mainnet'
				? `https://bscscan.com/address/${address}`
				: `https://testnet.bscscan.com/address/${address}`;
		} else if (network === 'bitcoin') {
			return isMainnet
				? `https://blockstream.info/address/${address}`
				: `https://blockstream.info/testnet/address/${address}`;
		} else if (network === 'liquid-bitcoin') {
			return isMainnet
				? `https://blockstream.info/liquid/address/${address}`
				: `https://blockstream.info/liquidtestnet/address/${address}`;
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

	// Format address (truncate for display)
	function formatAddress(address: string): string {
		if (address.length <= 20) return address;
		return `${address.slice(0, 10)}...${address.slice(-8)}`;
	}

	// Copy address in confirmation modal
	async function copyConfirmationAddress(address: string) {
		if (address) {
			await copyToClipboard(address);
			appStore.showSuccessToast($t('wallet.address_copied'));
			uiState.addressCopied = true;
			triggerHaptic(ImpactStyle.Light);
			setTimeout(() => {
				uiState.addressCopied = false;
			}, 2000);
		}
	}
</script>

<div class="flex flex-1 flex-col min-h-0">
	{#if !sendState.isSending}
		<!-- Scrollable Content Area -->
		<div class="flex-1 overflow-y-auto min-h-0 space-y-3 sm:space-y-4">
			{#if uiState.activeTab === 'scan'}
				{#if !uiState.showConfirmation}
					<!-- QR Code Scanner -->
					<div
						class="flex min-h-full flex-col items-center justify-center gap-3 px-3 sm:gap-4 sm:px-4"
					>
						<p class="text-base-content/70 text-xs sm:text-sm">
							{$t('wallet.send.scan_qr_code_description')}
						</p>

						{#if qrScanState.error}
							<!-- Error state with decoded QR code -->
							<div class="w-full space-y-3 sm:space-y-4">
								<div class="alert alert-outline alert-error py-2 sm:py-4">
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
				{:else}
					<!-- Confirmation Screen -->
					<div class="space-y-6">
						<div class="flex items-center justify-end">
							<button
								class="btn btn-ghost btn-sm"
								onclick={() => (uiState.showConfirmation = false)}
							>
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
							{@const recipientAddress = parsedPayment.data?.address || formInput.addressInput.trim()}
							{@const explorerUrl = getAddressExplorerUrl(recipientAddress, parsedPayment.detectedNetwork)}
							<div class="border-base-300 bg-primary/10 rounded-lg border p-4">
								<div class="flex items-center justify-between gap-2">
									<div class="flex items-center gap-2">
										{#if network?.icon}
											<img src={network?.icon} alt={network?.name} class="h-5 w-5" />
										{/if}
										<span class="font-medium">{network?.name}</span>
									</div>
									{#if explorerUrl}
										<a
											href={explorerUrl}
											target="_blank"
											rel="noopener noreferrer"
											class="btn btn-ghost btn-sm btn-circle shrink-0 touch-manipulation transition-transform duration-100 select-none active:scale-95"
											style="-webkit-tap-highlight-color: transparent;"
											aria-label={$t('wallet.view_explorer')}
											onclick={() => triggerHaptic(ImpactStyle.Light)}
										>
											<IconOpenInNew class="h-5 w-5" />
										</a>
									{/if}
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
								isLoadingMaxCalculation={feeState.maxCalculation.isLoading}
								hasInsufficientBalance={hasInsufficientBalance && feeState.estimated !== null}
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
							<button
								class="btn btn-error flex-1"
								onclick={() => (uiState.showConfirmation = false)}
							>
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
			{/if}

			{#if uiState.activeTab === 'enter'}
				<!-- Enter Payment Details Tab -->
				<!-- Mobile Step 1: Address Input and Amount Input -->
				<div class="block sm:hidden space-y-2">
					{#if uiState.currentStep === 1}
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
								<div
									class="bg-base-200 relative flex flex-1 items-center p-2"
								>
									<div class="relative flex-1 min-w-0 pr-10 sm:pr-11">
										<input
											id="address-input"
											type="text"
											class="w-full bg-transparent pl-6 text-base text-sm focus:outline-none placeholder:text-base-content/50"
											placeholder={$t('wallet.send.address_placeholder')}
											bind:value={formInput.addressInput}
											oninput={handleAddressInput}
											onfocus={() => (uiState.showRecentAddresses = recentAddresses.length > 0)}
											onblur={() => setTimeout(() => (uiState.showRecentAddresses = false), 200)}
										/>
										{#if formInput.addressInput.trim()}
											<div
												class="pointer-events-none absolute top-1/2 left-0 flex -translate-y-1/2 items-center gap-1"
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
									{#if formInput.addressInput.trim()}
										<button
											type="button"
											class="absolute right-2 sm:right-2 btn btn-ghost btn-sm btn-circle text-error hover:bg-error/20 flex h-9 min-h-[40px] w-9 min-w-[40px] touch-manipulation items-center justify-center p-0 select-none sm:h-11 sm:min-h-[44px] sm:w-11 sm:min-w-[44px]"
											style="-webkit-tap-highlight-color: transparent;"
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
											aria-label="Clear address"
										>
											<IconClose class="h-6 w-6 sm:h-8 sm:w-8" />
										</button>
									{/if}
								</div>
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

						<!-- Amount Field (Mobile Step 1) -->
						<div class="form-control">
							<AmountInputSection
								amount={formInput.amount}
								unit={formInput.unit}
								mathExpression={formInput.mathExpression}
								calculatorKey={uiState.calculatorKey}
								network={parsedPayment.detectedNetwork}
								isLoadingMaxCalculation={feeState.maxCalculation.isLoading}
								disabled={parsedPayment.detectedAmount !== null && parsedPayment.detectedAmount > 0}
								hasInsufficientBalance={hasInsufficientBalance && feeState.estimated !== null}
								onAmountChange={handleAmountInputChange}
								onUnitChange={handleUnitChange}
								onCalculationChange={handleCalculationChange}
								onClear={handleClearCalculator}
								onMaxAmount={handleMaxAmount}
							/>
							{#if showLargeAmountWarning}
								<p class="text-error text-center text-sm">
									{$t('wallet.send.large_amount_warning.message', {
										values: { amount: formatUsd(amountInUSD) }
									})}
								</p>
							{/if}
							{#if hasInsufficientBalance && feeState.estimated}
								<p class="text-error text-center text-md pt-1">
									{$t('wallet.validation.insufficient_balance')}
								</p>
							{/if}
						</div>
					{/if}
				</div>

				<!-- Mobile Step 2: Read-only amount display, network, description, fees, total -->
				<div class="block sm:hidden space-y-2">
					{#if uiState.currentStep === 2}
						<!-- Amount Display (Read-only) -->
						<div class="border-primary bg-base-200 flex flex-col items-center gap-1.5 rounded-lg border-2 p-3 sm:p-4">
							<span class="text-center text-xs opacity-70">{$t('wallet.amount')}</span>
							<div class="flex w-full items-center justify-center gap-1.5">
								{#if formInput.unit === 'sats'}
									<span class="text-primary text-xl font-bold">
										{formatSats(amountInSats)}
										{$t('wallet.sats')}
									</span>
									{#if btcPrice > 0 && amountInSats > 0}
										<span class="text-xs opacity-60">
											≈ {formatUsd(amountInUSD)}
										</span>
									{/if}
								{:else}
									<span class="text-primary text-xl font-bold">
										{formatUsd(amountInUSD)}
									</span>
									{#if btcPrice > 0 && amountInSats > 0}
										<span class="text-xs opacity-60">
											≈ {formatSats(amountInSats)} {$t('wallet.sats')}
										</span>
									{/if}
								{/if}
							</div>
						</div>

						<!-- Auto-detected Network Display -->
						{#if parsedPayment.detectedNetwork}
							{@const network =
								netwokrOption[parsedPayment.detectedNetwork as keyof typeof netwokrOption]}
							{@const recipientAddress = parsedPayment.data?.address || formInput.addressInput.trim()}
							{@const explorerUrl = getAddressExplorerUrl(recipientAddress, parsedPayment.detectedNetwork)}
							<div class="border-base-300 bg-primary/10 rounded-lg border p-1.5 sm:p-2">
								<div class="flex items-center justify-between gap-1.5 pl-1.5 sm:gap-2 sm:pl-2">
									<div class="flex items-center gap-1.5 sm:gap-2">
										{#if network?.icon}
											<img src={network?.icon} alt={network?.name} class="h-4 w-4 sm:h-5 sm:w-5" />
										{/if}
										<span class="text-sm font-medium sm:text-base">{network?.name}</span>
									</div>
									{#if explorerUrl}
										<a
											href={explorerUrl}
											target="_blank"
											rel="noopener noreferrer"
											class="btn btn-ghost btn-sm btn-circle shrink-0 touch-manipulation transition-transform duration-100 select-none active:scale-95"
											style="-webkit-tap-highlight-color: transparent;"
											aria-label={$t('wallet.view_explorer')}
											onclick={() => triggerHaptic(ImpactStyle.Light)}
										>
											<IconOpenInNew class="h-4 w-4 sm:h-5 sm:w-5" />
										</a>
									{/if}
								</div>
							</div>
						{/if}

						<!-- Description Accordion (Mobile Step 2) -->
						<div class="form-control">
							<DescriptionAccordion
								memo={formInput.memo}
								expanded={uiState.descriptionExpanded}
								disabled={!!parsedPayment.detectedMemo}
								labelText={parsedPayment.detectedMemo
									? 'wallet.send.from_invoice'
									: undefined}
								onMemoChange={(value) => (formInput.memo = value)}
								onToggle={(expanded) => (uiState.descriptionExpanded = expanded)}
							/>
						</div>

						<!-- Network Fee Accordion (Mobile Step 2) -->
						{#if feeState.error}
							<div class="alert alert-outline alert-error py-2 text-sm">
								<span>{feeState.error}</span>
							</div>
						{:else}
							<div
								class="collapse-arrow border-base-300 bg-base-100 collapse rounded-lg border"
								class:collapse-open={uiState.networkFeeExpanded}
							>
								<button
									type="button"
									class="collapse-title min-h-0 px-3 py-2 text-left text-sm font-medium"
									onclick={() => {
										triggerHaptic(ImpactStyle.Light);
										uiState.networkFeeExpanded = !uiState.networkFeeExpanded;
									}}
									disabled={feeState.isLoading}
								>
									<div class="flex w-full items-center gap-1.5">
										<span>{$t('wallet.network_fee')}:</span>
										{#if feeState.isLoading}
											<span class="font-semibold inline-flex items-center gap-1.5 min-w-[5rem]">
												<span class="loading loading-spinner loading-xs"></span>
											</span>
										{:else if feeState.estimated}
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
									<div class="space-y-1.5 px-3">
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
											<div class="text-center text-xs opacity-70">
												{$t('wallet.send.enter_address_and_amount_to_estimate')}
											</div>
										{/if}
									</div>
								</div>
							</div>
						{/if}

						<!-- Total to Send Card (Mobile Step 2) -->
						<div
							class="bg-base-200 flex flex-col items-center gap-1.5 rounded-lg border-2 p-3"
							class:border-primary={!hasInsufficientBalance}
							class:border-error={hasInsufficientBalance}
						>
							<span class="text-center text-xs opacity-70">{$t('wallet.send.total_to_send')}</span>
							{#if totalToSend > 0 && feeState.estimated}
								<div class="flex w-full items-center justify-center gap-1.5">
									{#if formInput.unit === 'sats'}
										<span class="text-primary text-xl font-bold">
											{formatSats(totalToSend)}
											{$t('wallet.sats')}
										</span>
										{#if btcPrice > 0}
											<span class="text-xs opacity-60">
												≈ {formatUsd(totalToSendUSD)}
											</span>
										{/if}
									{:else}
										<span class="text-primary text-xl font-bold">
											{formatUsd(totalToSendUSD)}
										</span>
										{#if btcPrice > 0}
											<span class="text-xs opacity-60">
												≈ {formatSats(totalToSend)}
												{$t('wallet.sats')}
											</span>
										{/if}
									{/if}
								</div>
							{:else}
								<div class="text-center text-xs opacity-60">
									{$t('wallet.send.enter_address_and_amount_to_estimate')}
								</div>
							{/if}
							<!-- Insufficient Balance Error Text -->
							{#if hasInsufficientBalance}
								<div class="text-error mt-0.5 text-center text-xs">
									{$t('wallet.validation.insufficient_balance')}
								</div>
							{/if}
						</div>
					{/if}
				</div>

				<!-- Desktop: Always show all fields -->
				<div class="hidden sm:block space-y-3 sm:space-y-4">
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
								<div
									class="bg-base-200 relative flex flex-1 items-center p-2"
								>
									<div class="relative flex-1 min-w-0 pr-10 sm:pr-11">
										<input
											id="address-input-desktop"
											type="text"
											class="w-full bg-transparent pl-6 text-base text-sm focus:outline-none placeholder:text-base-content/50"
											placeholder={$t('wallet.send.address_placeholder')}
											bind:value={formInput.addressInput}
											oninput={handleAddressInput}
											onfocus={() => (uiState.showRecentAddresses = recentAddresses.length > 0)}
											onblur={() => setTimeout(() => (uiState.showRecentAddresses = false), 200)}
										/>
										{#if formInput.addressInput.trim()}
											<div
												class="pointer-events-none absolute top-1/2 left-0 flex -translate-y-1/2 items-center gap-1"
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
									{#if formInput.addressInput.trim()}
										<button
											type="button"
											class="absolute right-2 sm:right-2 btn btn-ghost btn-sm btn-circle text-error hover:bg-error/20 flex h-9 min-h-[40px] w-9 min-w-[40px] touch-manipulation items-center justify-center p-0 select-none sm:h-11 sm:min-h-[44px] sm:w-11 sm:min-w-[44px]"
											style="-webkit-tap-highlight-color: transparent;"
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
											aria-label="Clear address"
										>
											<IconClose class="h-6 w-6 sm:h-8 sm:w-8" />
										</button>
									{/if}
								</div>
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
						{@const recipientAddress = parsedPayment.data?.address || formInput.addressInput.trim()}
						{@const explorerUrl = getAddressExplorerUrl(recipientAddress, parsedPayment.detectedNetwork)}
						<div class="border-base-300 bg-primary/10 rounded-lg border p-1.5 sm:p-2">
							<div class="flex items-center justify-between gap-1.5 pl-1.5 sm:gap-2 sm:pl-2">
								<div class="flex items-center gap-1.5 sm:gap-2">
									{#if network?.icon}
										<img src={network?.icon} alt={network?.name} class="h-4 w-4 sm:h-5 sm:w-5" />
									{/if}
									<span class="text-sm font-medium sm:text-base">{network?.name}</span>
								</div>
								{#if explorerUrl}
									<a
										href={explorerUrl}
										target="_blank"
										rel="noopener noreferrer"
										class="btn btn-ghost btn-sm btn-circle shrink-0 touch-manipulation transition-transform duration-100 select-none active:scale-95"
										style="-webkit-tap-highlight-color: transparent;"
										aria-label={$t('wallet.view_explorer')}
										onclick={() => triggerHaptic(ImpactStyle.Light)}
									>
										<IconOpenInNew class="h-4 w-4 sm:h-5 sm:w-5" />
									</a>
								{/if}
							</div>
						</div>
					{/if}

					<!-- Amount Field -->
					<div class="form-control space-y-3 sm:space-y-4">
						<AmountInputSection
							amount={formInput.amount}
							unit={formInput.unit}
							mathExpression={formInput.mathExpression}
							calculatorKey={uiState.calculatorKey}
							memo={formInput.memo}
							descriptionExpanded={uiState.descriptionExpanded}
							network={parsedPayment.detectedNetwork}
							isLoadingMaxCalculation={feeState.maxCalculation.isLoading}
							disabled={parsedPayment.detectedAmount !== null && parsedPayment.detectedAmount > 0}
							hasInsufficientBalance={hasInsufficientBalance && feeState.estimated !== null}
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
					{#if feeState.error}
						<div class="alert alert-outline alert-error py-2 text-sm sm:py-4 sm:text-base">
							<span>{feeState.error}</span>
						</div>
					{:else}
						<div
							class="collapse-arrow border-base-300 bg-base-100 collapse rounded-lg border"
							class:collapse-open={uiState.networkFeeExpanded}
						>
							<button
								type="button"
								class="collapse-title min-h-0 px-3 py-2 text-left text-sm font-medium sm:px-4 sm:text-base"
								onclick={() => {
									triggerHaptic(ImpactStyle.Light);
									uiState.networkFeeExpanded = !uiState.networkFeeExpanded;
								}}
								disabled={feeState.isLoading}
							>
								<div class="flex w-full items-center gap-1.5 sm:gap-2">
									<span>{$t('wallet.network_fee')}:</span>
									{#if feeState.isLoading}
										<span class="font-semibold inline-flex items-center gap-1.5 min-w-[5rem] sm:gap-2">
											<span class="loading loading-spinner loading-xs"></span>
										</span>
									{:else if feeState.estimated}
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
								<div class="space-y-1.5 px-3 sm:space-y-2 sm:px-4">
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
										<div class="text-center text-xs opacity-70">
											{$t('wallet.send.enter_address_and_amount_to_estimate')}
										</div>
									{/if}
								</div>
							</div>
						</div>
					{/if}

					<!-- Total to Send Card -->
					<div
						class="bg-base-200 flex flex-col items-center gap-1.5 rounded-lg border-2 p-1.5 sm:gap-2 sm:p-2"
						class:border-primary={!hasInsufficientBalance}
						class:border-error={hasInsufficientBalance}
					>
						<span class="text-center text-xs opacity-70 sm:text-sm"
							>{$t('wallet.send.total_to_send')}</span
						>
						{#if totalToSend > 0 && feeState.estimated}
							<div class="flex w-full items-center justify-center gap-1.5 sm:gap-2">
								{#if formInput.unit === 'sats'}
									<span class="text-primary text-xl font-bold sm:text-2xl">
										{formatSats(totalToSend)}
										{$t('wallet.sats')}
									</span>
									{#if btcPrice > 0}
										<span class="text-xs opacity-60 sm:text-sm">
											≈ {formatUsd(totalToSendUSD)}
										</span>
									{/if}
								{:else}
									<span class="text-primary text-xl font-bold sm:text-2xl">
										{formatUsd(totalToSendUSD)}
									</span>
									{#if btcPrice > 0}
										<span class="text-xs opacity-60 sm:text-sm">
											≈ {formatSats(totalToSend)}
											{$t('wallet.sats')}
										</span>
									{/if}
								{/if}
							</div>
						{:else}
							<div class="text-center text-xs opacity-60 sm:text-sm">
								{$t('wallet.send.enter_address_and_amount_to_estimate')}
							</div>
						{/if}
						<!-- Insufficient Balance Error Text -->
						{#if hasInsufficientBalance}
							<div class="text-error mt-0.5 text-center text-xs sm:mt-1 sm:text-sm">
								{$t('wallet.validation.insufficient_balance')}
							</div>
						{/if}
					</div>

					<!-- Transaction Error Display -->
					{#if sendState.error}
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
							<div class="flex flex-col gap-1">
								<span class="font-semibold">{$t('wallet.send.transaction_failed')}</span>
								<span class="text-sm opacity-90">{sendState.error}</span>
							</div>
						</div>
					{/if}
				</div>
			{/if}
		</div>

		<!-- Action Buttons -->
		{#if uiState.activeTab === 'enter'}
			<div
				class="bg-base-100 sticky bottom-0 z-10 mt-auto flex-shrink-0 flex gap-2 pt-3 pb-3 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] sm:gap-3 sm:pt-4 sm:pb-4 md:static md:mb-4 md:pt-0 md:pb-0 md:shadow-none"
			>
				<!-- Mobile Step 1: Cancel and Next -->
				{#if uiState.currentStep === 1}
					<button
						class="btn btn-error min-h-[44px] flex-1 touch-manipulation transition-transform duration-100 select-none active:scale-95 sm:hidden"
						style="-webkit-tap-highlight-color: transparent;"
						onclick={() => {
							triggerHaptic(ImpactStyle.Light);
							onCancel();
						}}
					>
						<IconClose class="h-4 w-4" />
						<span class="text-sm">{$t('common.cancel')}</span>
					</button>
					<button
						class="btn btn-primary min-h-[44px] flex-1 touch-manipulation transition-transform duration-100 select-none active:scale-95 sm:hidden"
						style="-webkit-tap-highlight-color: transparent;"
						onclick={handleNextStep}
						disabled={!isFormValid || feeState.isLoading}
					>
						{#if feeState.isLoading}
							<span class="loading loading-spinner loading-sm"></span>
						{:else}
							<span class="text-sm">{$t('common.next')}</span>
							<IconChevronRight class="h-5 w-5" />
						{/if}
					</button>
				{/if}

				<!-- Mobile Step 2: Back and Send -->
				{#if uiState.currentStep === 2}
					<button
						class="btn btn-ghost min-h-[44px] flex-1 touch-manipulation transition-transform duration-100 select-none active:scale-95 sm:hidden"
						style="-webkit-tap-highlight-color: transparent;"
						onclick={handleBackStep}
					>
						<IconChevronLeft class="h-4 w-4" />
						<span class="text-sm">{$t('common.back')}</span>
					</button>
					<button
						class="btn btn-primary min-h-[44px] flex-1 touch-manipulation transition-transform duration-100 select-none active:scale-95 sm:hidden"
						style="-webkit-tap-highlight-color: transparent;"
						onclick={showSendConfirmationModal}
						disabled={!isFormValid || feeState.isLoading}
					>
						<IconSend class="h-4 w-4" />
						<span class="text-sm">{$t('wallet.send.send')}</span>
					</button>
				{/if}

				<!-- Desktop: Always show Cancel and Send -->
				<button
					class="btn btn-error min-h-[44px] hidden flex-1 touch-manipulation transition-transform duration-100 select-none active:scale-95 sm:flex sm:min-h-[48px] md:min-h-[56px]"
					style="-webkit-tap-highlight-color: transparent;"
					onclick={() => {
						triggerHaptic(ImpactStyle.Light);
						onCancel();
					}}
				>
					<IconClose class="h-4 w-4 sm:h-5 sm:w-5" />
					<span class="text-sm sm:text-base">{$t('common.cancel')}</span>
				</button>
				<button
					class="btn btn-primary min-h-[44px] hidden flex-1 touch-manipulation transition-transform duration-100 select-none active:scale-95 sm:flex sm:min-h-[48px] md:min-h-[56px]"
					style="-webkit-tap-highlight-color: transparent;"
					onclick={showSendConfirmationModal}
					disabled={!isFormValid || feeState.isLoading}
				>
					<IconSend class="h-4 w-4 sm:h-5 sm:w-5" />
					<span class="text-sm sm:text-base">{$t('wallet.send.send')}</span>
				</button>
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
		<div class="tabs tabs-boxed border-base-300 mt-auto overflow-hidden rounded-lg border">
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
				{$t('wallet.send.payment_details')}
			</button>
		</div>

		<!-- Loading Overlay (shown while transaction is being sent) -->
	{:else if !uiState.showSuccessScreen}
		<div
			class="flex items-center justify-center"
			in:fly={{
				duration: 200,
				easing: linear,
				y: 0,
				x: 20
			}}
		>
			<div class="rounded-lg p-6">
				<div class="flex flex-col items-center gap-4">
					<span class="loading loading-spinner loading-lg text-primary"></span>
					<div class="text-center">
						<h3 class="text-lg font-semibold">{$t('wallet.send.processing_transaction')}</h3>
						<p class="text-base-content/70 text-sm">{$t('wallet.send.please_wait')}</p>
					</div>
				</div>
			</div>
		</div>

		<!-- Success Screen -->
	{:else if sendState.successTxHash && sendState.successNetwork}
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
		{@const estimatedTime =
			netwokrOption[parsedPayment.detectedNetwork as keyof typeof netwokrOption]?.confirmationTime}
		<div class="modal modal-open z-120">
			<div class="modal-box max-w-md">
				<h3 class="text-lg font-bold">{$t('wallet.send.confirm_payment')}</h3>
				<div class="space-y-4 py-4">
					<!-- Address Accordion -->
					<div class="space-y-1">
						<div class="text-sm font-medium opacity-70">{$t('wallet.send.address_or_invoice')}</div>
						<div class="border-primary bg-base-100 rounded-lg border-2">
							<!-- One-line address display -->
							<div class="flex items-center gap-2 p-2">
								<!-- Copy icon on the left -->
								<button
									class="btn btn-ghost btn-sm btn-circle shrink-0 touch-manipulation transition-transform duration-100 select-none active:scale-95"
									style="-webkit-tap-highlight-color: transparent;"
									onclick={() => copyConfirmationAddress(recipientAddress)}
									aria-label={$t('wallet.copy_address')}
								>
									{#if uiState.addressCopied}
										<IconCheck class="text-success h-5 w-5" />
									{:else}
										<IconContentCopy class="h-5 w-5" />
									{/if}
								</button>

								<!-- Compressed address in the middle -->
								{#if explorerUrl}
									<a
										href={explorerUrl}
										target="_blank"
										rel="noopener noreferrer"
										class="min-w-0 flex-1 text-left hover:underline"
									>
										<code class="block truncate font-mono text-xs">
											{uiState.addressExpanded ? recipientAddress : formatAddress(recipientAddress)}
										</code>
									</a>
								{:else}
									<button
										class="min-w-0 flex-1 touch-manipulation text-left transition-transform duration-100 select-none active:scale-95"
										style="-webkit-tap-highlight-color: transparent;"
										onclick={() => copyConfirmationAddress(recipientAddress)}
										aria-label={$t('wallet.copy_address')}
									>
										<code class="block truncate font-mono text-xs">
											{uiState.addressExpanded ? recipientAddress : formatAddress(recipientAddress)}
										</code>
									</button>
								{/if}

								<!-- Dropdown button on the right -->
								<button
									class="btn btn-ghost btn-sm btn-circle shrink-0 touch-manipulation transition-transform duration-200 select-none active:scale-95"
									style="-webkit-tap-highlight-color: transparent;"
									onclick={() => {
										triggerHaptic(ImpactStyle.Light);
										uiState.addressExpanded = !uiState.addressExpanded;
									}}
									aria-label={uiState.addressExpanded ? 'Collapse address' : 'Expand address'}
								>
									<div class="transition-transform duration-200" class:rotate-180={uiState.addressExpanded}>
										<IconChevronDown class="h-5 w-5" />
									</div>
								</button>
							</div>

							<!-- Expanded full address (shown when expanded) -->
							{#if uiState.addressExpanded}
								<div
									class="border-primary/20 border-t px-2 py-2"
									in:slide={{ duration: 200, easing: linear }}
									out:slide={{ duration: 200, easing: linear }}
								>
									{#if explorerUrl}
										<a
											href={explorerUrl}
											target="_blank"
											rel="noopener noreferrer"
											class="text-primary hover:underline"
										>
											<code class="block font-mono text-xs break-all whitespace-normal">
												{recipientAddress}
											</code>
										</a>
									{:else}
										<code class="block font-mono text-xs break-all whitespace-normal">
											{recipientAddress}
										</code>
									{/if}
								</div>
							{/if}
						</div>
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
							{#if parsedPayment.detectedNetwork === 'lightning-bitcoin'}
								{$t('wallet.send.estimated_time_1_2_minutes')}
							{:else if estimatedTime > 0}
								{estimatedTime} {$t('wallet.send.seconds')}
							{:else}
								{$t('wallet.send.instant')}
							{/if}
						</div>
					</div>

					<!-- Insufficient Balance Error -->
					{#if hasInsufficientBalance && feeState.estimated}
						<div class="space-y-1 pt-1">
							<p class="text-error text-md">
								{$t('wallet.validation.insufficient_balance')}
							</p>
						</div>
					{/if}

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
					<button
						class="btn btn-primary"
						onclick={handleConfirmedSend}
						disabled={hasInsufficientBalance && feeState.estimated !== null}
					>
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

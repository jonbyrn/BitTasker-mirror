<script lang="ts">
	import { t } from 'svelte-i18n';
	import { onMount } from 'svelte';
	import { Capacitor } from '@capacitor/core';
	import { appStore } from '$lib/stores/app.store';
	import { walletStore, walletManager } from '$lib/stores/wallet.store';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';
	import { parsePaymentAddress, type ParsedPaymentAddress } from '$lib/utils/helpers/paymentAddressParser';
	import { getBiometricData } from '$lib/utils/helpers/biometrics';
	import { getWebBiometricData } from '$lib/utils/helpers/webBiometrics';
	import { triggerHaptic, ImpactStyle } from '$lib/utils/helpers/haptics';
	import { copyToClipboard } from '$lib/utils/helpers/clipboard';
	import QrCodeScanner from '$lib/components/QrCodeScanner.svelte';
	import WebQrCodeScanner from '$lib/components/WebQrCodeScanner.svelte';
	import AmountDisplay from '$lib/components/wallet/AmountDisplay.svelte';
	import AmountInputSection from '$lib/components/wallet/AmountInputSection.svelte';
	import TransactionSuccessScreen from '$lib/components/wallet/TransactionSuccessScreen.svelte';
	import SubmarineSend from '$lib/components/wallet/SubmarineSend.svelte';
	import ConfirmModal from '$lib/components/ConfirmModal.svelte';
	import type { Barcode } from '@capacitor-mlkit/barcode-scanning';
	import IconClose from '~icons/mdi/close';
	import IconSend from '~icons/mdi/send';
	import IconCheck from '~icons/mdi/check';
	import IconContentCopy from '~icons/mdi/content-copy';

	interface Props {
		onCancel: () => void;
		onSuccess?: (txHash: string, network: string) => void;
	}

	let { onCancel, onSuccess }: Props = $props();

	// Platform detection
	const isWeb = Capacitor.getPlatform() === 'web';

	// Tab state
	let activeTab = $state<'scan' | 'enter'>('scan'); // Default to 'scan'
	let previousTab = $state<'scan' | 'enter' | null>(null);
	let showConfirmation = $state(false);
	let previousShowConfirmation = $state(false);
	let showSendConfirmation = $state(false);
	let showSuccessScreen = $state(false);
	let successTxHash = $state<string | null>(null);
	let successNetwork = $state<string | null>(null);
	
	// QR scan error state
	let qrScanError = $state<string | null>(null);
	let scannedQrValue = $state<string | null>(null);
	

	// Payment data
	let addressInput = $state('');
	let amount = $state('');
	// Default to USD when no amount is detected from address
	let unit = $state<'sats' | 'usd'>('usd');
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

	// Max amount calculation
	let feeParameters = $state<{
		percentage?: number; // Fee percentage (e.g., 0.1 for 0.1%)
		fixedFee?: number; // Fixed fee in sats
	} | null>(null);
	let isLoadingMaxCalculation = $state(false);
	let calculatedMaxAmount = $state<number | null>(null);

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
	
	// Derived disabled state for amount input when amount is detected from address
	const isAmountInputDisabled = $derived(detectedAmount !== null && detectedAmount > 0);

	const totalToSend = $derived(amountInSats + (estimatedFees?.totalFees || 0));
	const receiverGets = $derived(amountInSats);
	
	// Total to send in USD
	const totalToSendUSD = $derived.by(() => {
		if (totalToSend === 0 || btcPrice === 0) return 0;
		return (totalToSend / 100_000_000) * btcPrice;
	});

	// Calculate available balance based on detected network
	const availableBalance = $derived.by(() => {
		if (!detectedNetwork) return 0;
		
		const state = $walletStore;
		
		switch (detectedNetwork) {
			case 'rootstock-bitcoin':
				if (!state.rsk.connected) return 0;
				// Try formattedBalance first, fallback to raw balance string
				let rbtcBalance = parseFloat(state.rsk.formattedBalance) || 0;
				// If formattedBalance is 0 or invalid, try parsing the raw balance (in wei)
				if (rbtcBalance === 0 && state.rsk.balance) {
					const balanceWei = BigInt(state.rsk.balance);
					// Convert wei to RBTC (1 RBTC = 1e18 wei), then to sats
					rbtcBalance = Number(balanceWei) / 1e18;
				}
				return Math.floor(rbtcBalance * 100_000_000);
			case 'usdt-bsc':
				if (!state.bsc.connected) return 0;
				// USDT balance is stored as string in smallest unit (6 decimals)
				// Convert to USD amount, then to sats using BTC price
				const usdtBalanceStr = state.bsc.usdtBalance || '0';
				const usdtBalance = parseFloat(usdtBalanceStr) / 1e6; // USDT has 6 decimals
				// Convert USD to sats using BTC price
				if (btcPrice > 0 && usdtBalance > 0) {
					return Math.floor((usdtBalance / btcPrice) * 100_000_000);
				}
				return 0;
			case 'lightning-bitcoin':
				// For Lightning, we use RSK balance as it's swapped via submarine swap
				if (!state.rsk.connected) return 0;
				let lightningRbtcBalance = parseFloat(state.rsk.formattedBalance) || 0;
				// Fallback to raw balance if formattedBalance is 0
				if (lightningRbtcBalance === 0 && state.rsk.balance) {
					const balanceWei = BigInt(state.rsk.balance);
					lightningRbtcBalance = Number(balanceWei) / 1e18;
				}
				return Math.floor(lightningRbtcBalance * 100_000_000);
			default:
				return 0;
		}
	});

	// Check if balance is insufficient
	const hasInsufficientBalance = $derived(
		totalToSend > availableBalance && availableBalance > 0 && totalToSend > 0 && estimatedFees !== null
	);
	
	const isFormValid = $derived.by(() => {
		// Address validation: must have valid parsed data
		if (!parsedData?.isValid) {
			return false;
		}
		
		// Amount validation: if amount is required, must have amount > 0
		// When amount is detected from address, amountRequired is false, so this check is skipped
		if (amountRequired && amountInSats <= 0) {
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
			qrScanError = null;
			scannedQrValue = null;
			
			if (!parsed.isValid) {
				// Show error with decoded QR code
				// Use specific error message if available, otherwise use generic message
				qrScanError = parsed.errorMessage || $t('wallet.send.invalid_qr_code');
				scannedQrValue = qrValue;
				return;
			}

			// Valid address - populate form and switch to Enter Payment Details tab
			parsedData = parsed;
			addressInput = parsed.address;
			detectedNetwork = parsed.network;
			detectedAmount = parsed.amount;
			detectedMemo = parsed.memo || null;
			amountRequired = parsed.amount === null;

			if (parsed.amount !== null) {
				amount = parsed.amount.toString();
				// When amount is detected from QR code, default to sats since that's what's in the invoice
				unit = 'sats';
			} else {
				// When no amount detected, default to USD
				unit = 'usd';
			}
			if (parsed.memo) {
				memo = parsed.memo;
				// Auto-expand description accordion when memo is detected
				descriptionExpanded = true;
			}

			// Switch to Enter Payment Details tab - the form will reactively update
			activeTab = 'enter';
			showConfirmation = false;
			await updateFeeEstimate();
		} catch (error) {
			console.error('Failed to parse QR code:', error);
			qrScanError = $t('wallet.send.failed_to_parse_qr');
			scannedQrValue = typeof barcode === 'string' ? barcode : barcode.rawValue;
		}
	}

	// Copy scanned QR code to clipboard
	async function copyScannedQrCode() {
		if (!scannedQrValue) return;
		
		const success = await copyToClipboard(scannedQrValue);
		if (success) {
			appStore.showSuccessToast('Text copied to clipboard');
			triggerHaptic(ImpactStyle.Light);
		} else {
			appStore.showErrorToast('Failed to copy to clipboard');
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
			estimatedFees = null;
			feeError = null;
			// Reset to USD when address is cleared
			unit = 'usd';
			return;
		}

		try {
			const parsed = parsePaymentAddress(addressInput);
			if (parsed.isValid) {
				parsedData = parsed;
				detectedNetwork = parsed.network;
				detectedAmount = parsed.amount;
				detectedMemo = parsed.memo;
				amountRequired = parsed.amount === null;

				if (parsed.amount !== null) {
					amount = parsed.amount.toString();
					// When amount is detected from address, default to sats since that's what's in the invoice
					unit = 'sats';
				} else {
					// When no amount detected, default to USD
					unit = 'usd';
				}
				if (parsed.memo) {
					memo = parsed.memo;
					// Auto-expand description accordion when memo is detected
					descriptionExpanded = true;
				}

				// If amount was detected, trigger fee estimation immediately
				// Set flag to prevent $effect from interfering
				if (parsed.amount !== null && parsed.amount > 0) {
					console.log('[SendPaymentForm] Address parsed with amount, triggering fee estimation', {
						amount: parsed.amount,
						network: parsed.network
					});
					isManuallyEstimating = true;
					// Use tick() to ensure reactive updates complete
					const { tick } = await import('svelte');
					await tick();
					await updateFeeEstimate();
					// Reset flag after a short delay to allow $effect to work for future changes
					setTimeout(() => {
						isManuallyEstimating = false;
					}, 100);
				}
			} else {
				// Use specific error message if available, otherwise use generic message
				addressError = parsed.errorMessage || $t('wallet.send.invalid_address');
				parsedData = null;
				detectedNetwork = null;
				detectedAmount = null;
				detectedMemo = null;
				amountRequired = true;
				estimatedFees = null;
				feeError = null;
				// Reset to USD when address is invalid
				unit = 'usd';
			}
		} catch (error) {
			console.error('Failed to parse address:', error);
			addressError = $t('wallet.send.failed_to_parse_address');
			estimatedFees = null;
			feeError = null;
		}
	}

	// Update fee estimate
	async function updateFeeEstimate() {
		// Check if we have a network and an amount (either from input or detected from address)
		// Use detectedAmount if available and amountInSats is 0 (for immediate estimation when address has amount)
		const amountToUse = amountInSats > 0 ? amountInSats : (detectedAmount !== null && detectedAmount > 0 ? detectedAmount : 0);
		
		console.log('[SendPaymentForm] updateFeeEstimate', {
			amountInSats,
			detectedAmount,
			amountToUse,
			detectedNetwork,
			hasAmount: amountToUse > 0,
			hasNetwork: !!detectedNetwork
		});
		
		if (amountToUse === 0 || !detectedNetwork) {
			console.log('[SendPaymentForm] Skipping fee estimation - missing amount or network');
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
						// Boltz service fee (percentage of amount)
						const serviceFee = Math.ceil((amountToUse * pair.fees.percentage) / 100);
						
						// Estimate Rootstock gas fee for the swap transaction
						// The minerFees from Boltz API is just a small fixed fee, not the actual gas
						// We need to estimate the actual gas cost for the on-chain transaction
						let rootstockGasFee = 0;
						if ($walletStore.rsk.connected && $walletStore.rsk.address) {
							try {
								// Estimate gas for a typical submarine swap transaction
								// Use a dummy address (Boltz contract) for estimation
								// The actual gas will be similar regardless of recipient
								const amountRBTC = (amountToUse / 100_000_000).toFixed(8);
								// Use a typical Boltz contract address for estimation
								// This is just an estimate - actual gas may vary slightly
								const gasEstimation = await walletManager.estimateRBTCGas(
									$walletStore.rsk.address, // Use own address as recipient for estimation
									amountRBTC
								);
								const gasFeeRBTC = parseFloat(gasEstimation.totalCostFormatted) - parseFloat(amountRBTC);
								rootstockGasFee = Math.floor(gasFeeRBTC * 100_000_000);
							} catch (error) {
								console.warn('Failed to estimate Rootstock gas for swap, using fallback:', error);
								// Fallback: use a conservative estimate (typically 3000-5000 sats for swap transactions)
								rootstockGasFee = 4000;
							}
						} else {
							// Fallback if wallet not connected
							rootstockGasFee = 4000;
						}
						
						// Total fees = service fee + Rootstock gas fee
						estimatedFees = {
							serviceFee,
							networkFee: rootstockGasFee,
							totalFees: serviceFee + rootstockGasFee
						};
					} else {
						// Fallback if Boltz API fails
						const serviceFee = Math.ceil((amountToUse * 0.1) / 100);
						const networkFee = 4000; // Conservative gas estimate
						estimatedFees = {
							serviceFee,
							networkFee,
							totalFees: serviceFee + networkFee
						};
					}
					break;
				case 'rootstock-bitcoin':
					if ($walletStore.rsk.connected && $walletStore.rsk.address) {
						const amountRBTC = (amountToUse / 100_000_000).toFixed(8);
						// Use parsed address from parsedData, or extract address from addressInput (remove query params)
						// This prevents ENS resolution errors when addressInput contains query parameters
						let recipientAddress = parsedData?.address;
						if (!recipientAddress && addressInput) {
							// Extract address part (before ? or #)
							const addressMatch = addressInput.match(/^([^?#]+)/);
							recipientAddress = addressMatch ? addressMatch[1] : addressInput;
						}
						// Fallback to wallet address if no recipient address found
						const finalAddress = recipientAddress || $walletStore.rsk.address;
						
						const gasEstimation = await walletManager.estimateRBTCGas(
							finalAddress,
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
			feeError = $t('wallet.swap.error.fee_fetch_failed');
			estimatedFees = null;
		} finally {
			isLoadingFees = false;
		}
	}

	// Fetch fee parameters when network is detected (for max calculation)
	async function fetchFeeParameters() {
		if (!detectedNetwork || !availableBalance || availableBalance <= 0) {
			feeParameters = null;
			return;
		}

		try {
			switch (detectedNetwork) {
				case 'lightning-bitcoin':
					// Fetch submarine swap pairs to get fee percentage
					const pairsData = await walletManager.getSubmarineSwapPairs();
					const pair = pairsData?.['RBTC']?.['BTC'];
					if (pair && pair.fees) {
						feeParameters = {
							percentage: pair.fees.percentage,
							fixedFee: pair.fees.minerFees || 32
						};
					} else {
						// Fallback to conservative estimate
						feeParameters = {
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
								addressInput || $walletStore.rsk.address,
								estimateAmountRBTC
							);
							const gasFeeRBTC = parseFloat(gasEstimation.totalCostFormatted) - parseFloat(estimateAmountRBTC);
							const estimatedGasFee = Math.floor(gasFeeRBTC * 100_000_000);
							feeParameters = {
								fixedFee: estimatedGasFee
							};
						} catch (error) {
							console.warn('Failed to estimate gas for max calculation:', error);
							feeParameters = {
								fixedFee: 3000 // Conservative fallback
							};
						}
					} else {
						feeParameters = {
							fixedFee: 3000
						};
					}
					break;
				default:
					feeParameters = null;
			}
		} catch (error) {
			console.error('Failed to fetch fee parameters:', error);
			feeParameters = null;
		}
	}

	// Calculate max amount using mathematical formula for percentage fees
	function calculateMaxAmount(): number {
		if (!availableBalance || availableBalance <= 0) return 0;
		if (!feeParameters) return 0;

		const balance = availableBalance;
		const safetyMargin = 5; // 5 sats safety margin

		// For percentage-based fees: maxAmount = (balance - fixedFee) / (1 + percentage/100)
		if (feeParameters.percentage !== undefined) {
			const fixedFee = feeParameters.fixedFee || 0;
			const percentage = feeParameters.percentage;
			const maxBeforeMargin = (balance - fixedFee) / (1 + percentage / 100);
			return Math.max(0, Math.floor(maxBeforeMargin) - safetyMargin);
		}

		// For fixed fees only: maxAmount = balance - fixedFee
		if (feeParameters.fixedFee !== undefined) {
			return Math.max(0, balance - feeParameters.fixedFee - safetyMargin);
		}

		return 0;
	}

	// Refine max amount after fees are estimated
	let lastRefinedAmount = $state<number | null>(null);
	let wasMaxClicked = $state(false); // Track if user clicked Max button
	let isRefining = $state(false); // Guard to prevent infinite loops
	
	async function refineMaxAmount() {
		if (!availableBalance || !estimatedFees || isRefining) return;

		const refinedMax = Math.max(0, availableBalance - estimatedFees.totalFees - 2); // 2 sats safety margin
		
		// Only update if the difference is significant (>10 sats) and we haven't already refined to this value
		if (lastRefinedAmount === null || Math.abs(refinedMax - lastRefinedAmount) > 10) {
			// Prevent infinite loops - if we're already very close, stop refining
			if (lastRefinedAmount !== null && Math.abs(refinedMax - lastRefinedAmount) < 100) {
				// We're converging, stop to prevent infinite loop
				return;
			}
			
			isRefining = true;
			lastRefinedAmount = refinedMax;
			const previousMax = calculatedMaxAmount;
			calculatedMaxAmount = refinedMax;
			
			// Only update amount if user clicked Max (wasMaxClicked flag) or amount matches previous max
			// This prevents auto-updating when user is manually entering amounts
			if (wasMaxClicked && previousMax !== null && amountInSats > 0) {
				// Check if current amount is close to the previous max (within 50 sats)
				const diff = Math.abs(amountInSats - previousMax);
				if (diff <= 50) {
					// User clicked Max, so update to refined value
					// Use isManuallyEstimating to prevent the $effect from triggering another fee estimate
					isManuallyEstimating = true;
					if (unit === 'sats') {
						amount = refinedMax.toString();
					} else if (btcPrice > 0) {
						const usdAmount = (refinedMax / 100_000_000) * btcPrice;
						amount = usdAmount.toFixed(2).replace(/\.?0+$/, '');
					}
					// Reset flag after a short delay
					setTimeout(() => {
						isManuallyEstimating = false;
						isRefining = false;
					}, 100);
				} else {
					isRefining = false;
				}
			} else {
				isRefining = false;
			}
		} else {
			// Already refined to this value, stop
			isRefining = false;
		}
	}

	// Calculate max amount when network/balance/fee parameters are ready
	$effect(() => {
		if (detectedNetwork && availableBalance > 0) {
			// Fetch fee parameters in background
			fetchFeeParameters();
		} else {
			feeParameters = null;
			calculatedMaxAmount = null;
		}
	});

	// Calculate max amount when fee parameters are available
	$effect(() => {
		if (feeParameters && availableBalance > 0) {
			calculatedMaxAmount = calculateMaxAmount();
		}
	});

	// Refine max amount after fees are estimated
	$effect(() => {
		if (estimatedFees && calculatedMaxAmount !== null) {
			refineMaxAmount();
		}
	});

	// Recalculate fees when amount or network changes
	// Use a flag to prevent duplicate calls when manually triggering
	let isManuallyEstimating = $state(false);
	
	// Log parsedData changes for debugging
	$effect(() => {
		console.log('[SendPaymentForm] parsedData changed:', {
			isValid: parsedData?.isValid,
			address: parsedData?.address,
			network: parsedData?.network,
			amount: parsedData?.amount
		});
	});
	
	$effect(() => {
		// Watch all relevant values that affect fee estimation
		amountInSats;
		detectedAmount;
		detectedNetwork;
		// Only estimate if we have both network and amount, and we're not manually estimating
		if (!isManuallyEstimating && detectedNetwork && (amountInSats > 0 || (detectedAmount !== null && detectedAmount > 0))) {
			updateFeeEstimate();
		}
	});

	// Handle calculation change from calculator
	function handleCalculationChange(expression: string, result: number) {
		mathExpression = expression;
		wasMaxClicked = false; // User is manually entering amount
		if (result > 0 || expression === '') {
			if (unit === 'sats') {
				amount = Math.floor(result).toString();
			} else {
				amount = result.toFixed(2).replace(/\.?0+$/, '');
			}
		}
	}

	// Handle max amount click
	async function handleMaxAmount() {
		if (!detectedNetwork || !availableBalance || availableBalance <= 0) return;

		isLoadingMaxCalculation = true;
		wasMaxClicked = true;
		triggerHaptic(ImpactStyle.Light);

		try {
			// Clear math expression so the new amount is displayed
			mathExpression = '';
			
			// If we have calculated max amount, use it
			if (calculatedMaxAmount !== null && calculatedMaxAmount > 0) {
				if (unit === 'sats') {
					amount = calculatedMaxAmount.toString();
				} else if (btcPrice > 0) {
					const usdAmount = (calculatedMaxAmount / 100_000_000) * btcPrice;
					amount = usdAmount.toFixed(2).replace(/\.?0+$/, '');
				}
				
				// Trigger fee estimation with this amount to refine
				await updateFeeEstimate();
			} else {
				// If we don't have fee parameters yet, fetch them first
				await fetchFeeParameters();
				if (feeParameters) {
					const max = calculateMaxAmount();
					if (max > 0) {
						calculatedMaxAmount = max;
						// Clear math expression so the new amount is displayed
						mathExpression = '';
						if (unit === 'sats') {
							amount = max.toString();
						} else if (btcPrice > 0) {
							const usdAmount = (max / 100_000_000) * btcPrice;
							amount = usdAmount.toFixed(2).replace(/\.?0+$/, '');
						}
						// Trigger fee estimation to refine
						await updateFeeEstimate();
					}
				}
			}
		} catch (error) {
			console.error('Failed to calculate max amount:', error);
		} finally {
			isLoadingMaxCalculation = false;
			// Reset flag after a delay to allow refinement
			setTimeout(() => {
				wasMaxClicked = false;
			}, 2000);
		}
	}

	// Handle amount change (wrapper to reset max click flag)
	function handleAmountChange(value: string) {
		wasMaxClicked = false; // User is manually changing amount
		amount = value;
	}

	// Handle unit change
	function handleUnitChange(newUnit: 'sats' | 'usd') {
		unit = newUnit;
		// Keep amount when switching units - user may have entered amount before selecting unit
		mathExpression = '';
		// Don't increment calculatorKey - preserve calculator state and amount
		wasMaxClicked = false;
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

	// Get network icon
	function getNetworkIcon(network: string | null): string | null {
		if (!network) return null;
		switch (network) {
			case 'rootstock-bitcoin':
				return '/images/chains/Bitcoin-Rootstock-logo.webp';
			case 'lightning-bitcoin':
				return '/images/chains/lightning.svg';
			case 'liquid-bitcoin':
				return '/images/chains/Liquid-Bitcoin.svg';
			case 'bitcoin':
				return '/images/chains/Bitcoin.svg';
			case 'usdt-bsc':
				return '/images/chains/Binance-logo.svg';
			default:
				return null;
		}
	}

	// Get network display name
	function getNetworkDisplayName(network: string | null): string {
		if (!network) return '';
		switch (network) {
			case 'rootstock-bitcoin':
				return $t('wallet.transaction.network.rootstock_bitcoin');
			case 'lightning-bitcoin':
				return $t('wallet.networks.lightning');
			case 'liquid-bitcoin':
				return $t('wallet.networks.liquid');
			case 'bitcoin':
				return $t('wallet.networks.bitcoin');
			case 'usdt-bsc':
				return $t('wallet.transaction.network.binance_smart_chain');
			default:
				return network;
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
	
	// Get estimated confirmation time in seconds based on network
	function getEstimatedConfirmationTime(network: string | null): number {
		if (!network) return 0;
		
		switch (network) {
			case 'rootstock-bitcoin':
			case 'rsk':
				return 30; // RSK blocks are ~30 seconds
			case 'usdt-bsc':
			case 'bsc':
				return 3; // BSC blocks are ~3 seconds
			case 'lightning-bitcoin':
				return 0; // Lightning is instant
			case 'liquid-bitcoin':
				return 60; // Liquid blocks are ~1 minute
			case 'bitcoin':
				return 600; // Bitcoin blocks are ~10 minutes
			default:
				return 30; // Default to 30 seconds
		}
	}
	
	// Handle showing send confirmation
	function showSendConfirmationModal() {
		showSendConfirmation = true;
		triggerHaptic(ImpactStyle.Light);
	}
	
	// Handle confirmed send
	async function handleConfirmedSend() {
		showSendConfirmation = false;
		await handleSend();
	}
</script>

<div class="send-payment-form flex flex-col h-full">
	<div class="flex-1 overflow-y-auto space-y-6 relative">
		{#if activeTab === 'scan' && !showConfirmation}
			<!-- QR Code Scanner -->
			<div class="flex flex-col items-center justify-center gap-4 min-h-full px-4">
				<p class="text-sm text-base-content/70">{$t('wallet.send.scan_qr_code_description')}</p>

				{#if qrScanError}
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
							<span class="text-sm">{qrScanError}</span>
						</div>
						
						<div class="form-control">
							<label for="scanned-qr-code" class="label">
								<span class="label-text">{$t('wallet.send.scanned_qr_code')}</span>
							</label>
							<div class="relative">
								<textarea
									id="scanned-qr-code"
									class="textarea textarea-bordered textarea-error w-full pr-12 {scannedQrValue ? 'cursor-pointer' : ''}"
									readonly
									rows="4"
									onclick={copyScannedQrCode}
								>{scannedQrValue || ''}</textarea>
								<button
									class="absolute right-2 top-1/2 -translate-y-1/2 btn btn-ghost btn-sm btn-square"
									onclick={(e) => {
										e.stopPropagation();
										copyScannedQrCode();
									}}
									aria-label={$t('wallet.copy_address')}
								>
									<IconContentCopy class="w-5 h-5" />
								</button>
							</div>
						</div>
						
						<button
							class="btn btn-primary w-full"
							onclick={() => {
								qrScanError = null;
								scannedQrValue = null;
							}}
						>
							{$t('common.buttons.retry')}
						</button>
					</div>
				{:else}
					{#if isWeb}
						<WebQrCodeScanner
							onScan={(result) => handleQRScan(result)}
							onClose={() => (activeTab = 'enter')}
						/>
					{:else}
						<QrCodeScanner onScan={handleQRScan} onClose={() => (activeTab = 'enter')} />
					{/if}
				{/if}
			</div>
		{/if}
		
		{#if activeTab === 'scan' && showConfirmation}
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
					<div class="rounded-lg border border-base-300 bg-primary/10 p-4">
						<div class="flex items-center gap-2">
							{#if getNetworkIcon(detectedNetwork)}
								<img
									src={getNetworkIcon(detectedNetwork)}
									alt={getNetworkDisplayName(detectedNetwork)}
									class="h-5 w-5"
								/>
							{/if}
							<span class="font-medium">{getNetworkDisplayName(detectedNetwork)}</span>
						</div>
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
							network={detectedNetwork}
							availableBalance={availableBalance}
							calculatedMaxAmount={calculatedMaxAmount}
							isLoadingMaxCalculation={isLoadingMaxCalculation}
							{btcPrice}
							onAmountChange={handleAmountChange}
							onUnitChange={handleUnitChange}
							onCalculationChange={handleCalculationChange}
							onClear={handleClearCalculator}
							onMaxAmount={handleMaxAmount}
						/>
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
		
		{#if activeTab === 'enter'}
			<!-- Enter Payment Details Tab -->
			<div class="space-y-4">
			<!-- Address Input -->
			<div class="form-control">
				<div class="relative">
					<div class="flex items-stretch w-full overflow-hidden rounded-lg border-2 transition-colors"
						class:border-primary={!parsedData?.isValid && !addressError}
						class:border-success={parsedData?.isValid && !addressError && addressInput.trim()}
						class:border-error={!!addressError}
					>
						<!-- Input field with validation icons -->
						<div class="relative flex-1">
							<input
								id="address-input"
								type="text"
								class="input input-bordered w-full border-0 rounded-l-lg rounded-r-none pl-10 min-h-[44px]"
								placeholder={$t('wallet.send.address_placeholder')}
								bind:value={addressInput}
								oninput={handleAddressInput}
								onfocus={() => (showRecentAddresses = recentAddresses.length > 0)}
								onblur={() => setTimeout(() => (showRecentAddresses = false), 200)}
							/>
							{#if addressInput.trim()}
								<div class="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none flex items-center gap-1">
									{#if parsedData?.isValid && !addressError}
										<IconCheck class="w-5 h-5 text-success" />
									{:else if addressError}
										<IconClose class="w-5 h-5 text-error" />
									{/if}
								</div>
							{/if}
						</div>
						<!-- Clear button -->
						<button
							type="button"
							class="bg-primary text-primary-content font-semibold px-4 py-1 touch-manipulation select-none disabled:opacity-50 transition-opacity rounded-r-lg rounded-l-none flex items-center justify-center whitespace-nowrap min-w-[60px] min-h-[44px] text-2xl"
							style="-webkit-tap-highlight-color: transparent; margin-left: -2px; width: 70px;"
							onclick={() => {
								addressInput = '';
								parsedData = null;
								detectedNetwork = null;
								detectedAmount = null;
								detectedMemo = null;
								addressError = null;
								amountRequired = true;
								estimatedFees = null;
								feeError = null;
								showRecentAddresses = false;
								triggerHaptic(ImpactStyle.Light);
							}}
							disabled={!addressInput.trim()}
							aria-label="Clear address"
						>
							⤫<!-- {$t('common.clear')} -->
						</button>
					</div>
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
				<div class="rounded-lg border border-base-300 bg-primary/10 p-2">
					<div class="flex items-center justify-between gap-2 pl-2">
						<div class="flex items-center gap-2">
							{#if getNetworkIcon(detectedNetwork)}
								<img
									src={getNetworkIcon(detectedNetwork)}
									alt={getNetworkDisplayName(detectedNetwork)}
									class="h-5 w-5"
								/>
							{/if}
							<span class="font-medium">{getNetworkDisplayName(detectedNetwork)}</span>
						</div>
						{#if detectedAmount && detectedAmount > 0}
							<div class="text-sm text-right">
								<div class="font-semibold">{formatSats(detectedAmount)} {$t('wallet.sats')}</div>
								{#if btcPrice > 0}
									<div class="opacity-70">
										≈ {formatUSD((detectedAmount / 100_000_000) * btcPrice)}
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
					{amount}
					{unit}
					{mathExpression}
					{calculatorKey}
					{memo}
					{descriptionExpanded}
					estimatedFees={estimatedFees?.totalFees ?? 0}
					amountInSats={amountInSats}
					{btcPrice}
					isLoadingFees={isLoadingFees}
					network={detectedNetwork}
					availableBalance={availableBalance}
					calculatedMaxAmount={calculatedMaxAmount}
					isLoadingMaxCalculation={isLoadingMaxCalculation}
					disabled={isAmountInputDisabled}
					onAmountChange={handleAmountChange}
					onUnitChange={handleUnitChange}
					onCalculationChange={handleCalculationChange}
					onClear={handleClearCalculator}
					onMaxAmount={handleMaxAmount}
					onMemoChange={(value) => (memo = value)}
					onDescriptionToggle={(expanded) => (descriptionExpanded = expanded)}
					descriptionDisabled={!!detectedMemo}
					descriptionLabelText={detectedMemo ? 'wallet.send.from_invoice' : undefined}
				/>
				{#if showLargeAmountWarning}
					<p class="text-error text-sm text-center">
						{$t('wallet.send.large_amount_warning.message', {
							values: { amount: formatUSD(amountInUSD) }
						})}
					</p>
				{/if}
			</div>


			<!-- Network Fee Accordion -->
			{#if isLoadingFees}
				<div class="flex items-center justify-center gap-2 rounded-lg border border-base-300 bg-base-200 p-2">
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
									{$t('wallet.send.enter_address_and_amount_to_estimate')}
								</div>
							{/if}
						</div>
					</div>
				</div>
			{/if}

			<!-- Total to Send Card -->
			<div class="flex flex-col items-center gap-2 rounded-lg border-2 bg-base-200 p-2"
				class:border-primary={!hasInsufficientBalance}
				class:border-error={hasInsufficientBalance}
			>
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
						{$t('wallet.send.enter_address_and_amount_to_estimate')}
					</div>
				{/if}
				<!-- Insufficient Balance Error Text -->
				{#if hasInsufficientBalance}
					<div class="text-sm text-error text-center mt-1">
						{$t('wallet.validation.insufficient_balance')}
					</div>
				{/if}
			</div>
			</div>
		{/if}
	</div>

	<!-- Action Buttons (Bottom, only on Enter Payment Details tab) -->
	{#if activeTab === 'enter'}
		<div class="flex-shrink-0 border-t border-base-300 pt-4 mb-4">
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
					onclick={showSendConfirmationModal}
					disabled={!isFormValid || isLoadingFees}
					onmouseenter={() => {
						if (!isFormValid || isLoadingFees) {
							console.log('[Send Button] Disabled - isFormValid:', isFormValid, 'isLoadingFees:', isLoadingFees);
						}
					}}
				>
					<IconSend class="h-5 w-5 mr-2" />
					{$t('wallet.send.send')}
				</button>
			</div>
		</div>
	{/if}

	<!-- Cancel Button (Bottom, only on Scan QR Code tab) -->
	{#if activeTab === 'scan' && !showConfirmation}
		<div class="flex-shrink-0 flex justify-center w-full pb-4">
			<button
				class="btn btn-error min-h-[48px] md:min-h-[56px] touch-manipulation select-none active:scale-95 transition-transform duration-100"
				style="-webkit-tap-highlight-color: transparent;"
				onclick={() => {
					triggerHaptic(ImpactStyle.Light);
					onCancel();
				}}
			>
				<IconClose class="h-5 w-5 mr-2" />
				{$t('common.cancel')}
			</button>
		</div>
	{/if}

	<!-- Tab Navigation (Bottom) -->
	<div class="tabs tabs-boxed rounded-lg overflow-hidden mt-auto">
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

	<!-- Success Screen -->
	{#if showSuccessScreen && successTxHash && successNetwork}
		<div class="fixed inset-0 z-[110] bg-base-100 flex flex-col">
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
		</div>
	{/if}
	
	<!-- Send Confirmation Modal -->
	{#if showSendConfirmation}
		{@const recipientAddress = parsedData?.address || addressInput.trim()}
		{@const explorerUrl = getAddressExplorerUrl(recipientAddress, detectedNetwork)}
		{@const estimatedTime = getEstimatedConfirmationTime(detectedNetwork)}
		<div class="modal modal-open z-[120]">
			<div class="modal-box max-w-md">
				<h3 class="text-lg font-bold">{$t('wallet.send.confirm_payment')}</h3>
				<div class="py-4 space-y-4">
					<!-- Address -->
					<div class="space-y-1">
						<div class="text-sm font-medium opacity-70">{$t('wallet.send.address_or_invoice')}</div>
						{#if explorerUrl}
							<a
								href={explorerUrl}
								target="_blank"
								rel="noopener noreferrer"
								class="text-primary hover:underline break-all"
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
							{#if unit === 'sats'}
								{formatSats(amountInSats)} {$t('wallet.sats')}
								{#if btcPrice > 0}
									<span class="text-sm opacity-70 ml-2">
										≈ {formatUSD(amountInUSD)}
									</span>
								{/if}
							{:else}
								{formatUSD(amountInUSD)}
								{#if btcPrice > 0}
									<span class="text-sm opacity-70 ml-2">
										≈ {formatSats(amountInSats)} {$t('wallet.sats')}
									</span>
								{/if}
							{/if}
						</div>
					</div>
					
					<!-- Estimated Transaction Fees -->
					{#if estimatedFees && estimatedFees.totalFees > 0}
						<div class="space-y-1">
							<div class="text-sm font-medium opacity-70">{$t('wallet.send.transaction_fee')}</div>
							<div class="font-semibold">
								{formatSats(estimatedFees.totalFees)} {$t('wallet.sats')}
								{#if btcPrice > 0}
									<span class="text-sm opacity-70 ml-2">
										≈ {formatUSD((estimatedFees.totalFees / 100_000_000) * btcPrice)}
									</span>
								{/if}
							</div>
						</div>
					{/if}
					
					<!-- Estimated Time -->
					<div class="space-y-1">
						<div class="text-sm font-medium opacity-70">{$t('wallet.send.estimated_confirmation_time')}</div>
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
						<svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
						</svg>
						<span class="text-sm">{$t('wallet.send.confirmation_warning')}</span>
					</div>
				</div>
				<div class="modal-action">
					<button class="btn btn-ghost" onclick={() => (showSendConfirmation = false)}>
						{$t('common.cancel')}
					</button>
					<button class="btn btn-primary" onclick={handleConfirmedSend}>
						{$t('wallet.send.send')}
					</button>
				</div>
			</div>
			<button
				class="modal-backdrop"
				onclick={() => (showSendConfirmation = false)}
				aria-label="Close modal"
			></button>
		</div>
	{/if}
</div>


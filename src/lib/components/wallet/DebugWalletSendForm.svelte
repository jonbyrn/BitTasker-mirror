<script lang="ts">
	import { t } from 'svelte-i18n';
	import { onMount, onDestroy } from 'svelte';
	import { walletManager, formatAddress, walletStore, sendRBTC, sendRSKToken, estimateERC20Gas } from '$lib/stores/wallet.store';
	import { appStore } from '$lib/stores/app.store';
	import { validateRSKAddress } from '$lib/utils/helpers/validators';
	import type { TokenBalance } from '$lib/types/wallet';
	import { triggerHaptic, ImpactStyle } from '$lib/utils/helpers/haptics';
	import IconCheck from '~icons/mdi/check';
	import IconClose from '~icons/mdi/close';
	import IconAlertCircle from '~icons/mdi/alert-circle';
	import IconClockOutline from '~icons/mdi/clock-outline';
	import { GAS_ESTIMATES, BALANCE, UI } from '$lib/utils/constants/wallet.constants';
	import AddressAccordion from '$lib/components/wallet/AddressAccordion.svelte';
	import { fade, fly } from 'svelte/transition';
	import { getProvider } from '$lib/stores/wallet.store';

	type Props = {
		token: TokenBalance;
		onClose?: () => void;
		onSuccess?: () => void;
	};

	let { token, onClose, onSuccess }: Props = $props();

	let recipientAddress = $state('');
	let amount = $state('');
	let isSending = $state(false);
	let isEstimatingMax = $state(false);
	let errorMessage = $state<string | null>(null);
	let addressError = $state<string | null>(null);
	let networkFeeExpanded = $state(false);
	let estimatedGasFee = $state<number | null>(null);
	let isEstimatingGas = $state(false);
	let hasInsufficientRBTCForGas = $state(false);
	let showConfirmation = $state(false);
	let transactionState = $state<'idle' | 'pending' | 'confirmed' | 'error'>('idle');
	let transactionHash = $state<string | null>(null);
	let countdownSeconds = $state(30); // RSK block time is ~30 seconds
	let monitoringInterval: ReturnType<typeof setInterval> | null = null;
	let countdownInterval: ReturnType<typeof setInterval> | null = null;
	let autoCloseTimeout: ReturnType<typeof setTimeout> | null = null;

	// Validate address
	function validateAddress() {
		if (!recipientAddress.trim()) {
			addressError = $t('wallet.debug_wallet.send_form.address_required');
			return false;
		}

		const validation = validateRSKAddress(recipientAddress.trim());
		if (!validation.isValid) {
			addressError = validation.error || $t('wallet.debug_wallet.send_form.invalid_address');
			return false;
		}

		addressError = null;
		return true;
	}

	// Check if address is valid
	let isAddressValid = $derived.by(() => {
		if (!recipientAddress.trim()) return false;
		const validation = validateRSKAddress(recipientAddress.trim());
		return validation.isValid && !addressError;
	});

	// Unified reactive validation - handles format checks only
	// Balance validation (including gas) is handled by hasInsufficientBalance
	let amountError = $derived.by(() => {
		const currentAmount = amount.trim();
		
		if (import.meta.env.DEV) {
			console.log('[DebugWalletSendForm] amountError derived - currentAmount:', currentAmount);
		}
		
		// Format validation only
		if (!currentAmount) {
			if (import.meta.env.DEV) {
				console.log('[DebugWalletSendForm] amountError - empty amount, returning null');
			}
			return null;
		}
		
		if (/[eE]/.test(currentAmount)) {
			if (import.meta.env.DEV) {
				console.log('[DebugWalletSendForm] amountError - scientific notation detected');
			}
			return $t('wallet.debug_wallet.send_form.invalid_amount');
		}
		
		const amountNum = parseFloat(currentAmount);
		if (isNaN(amountNum) || amountNum <= 0 || !isFinite(amountNum)) {
			if (import.meta.env.DEV) {
				console.log('[DebugWalletSendForm] amountError - invalid number:', amountNum);
			}
			return $t('wallet.debug_wallet.send_form.invalid_amount');
		}
		
		const decimalPart = currentAmount.includes('.') ? currentAmount.split('.')[1] : '';
		if (decimalPart.length > UI.MAX_DECIMAL_PLACES) {
			if (import.meta.env.DEV) {
				console.log('[DebugWalletSendForm] amountError - too many decimals:', decimalPart.length);
			}
			return $t('wallet.debug_wallet.send_form.too_many_decimals', { values: { max: UI.MAX_DECIMAL_PLACES } });
		}
		
		// For ERC-20 tokens only: check if amount exceeds token balance
		// For native RBTC: balance check (including gas) is in hasInsufficientBalance
		if (!token.isNative) {
			const balanceNum = parseFloat(token.formattedBalance);
			if (import.meta.env.DEV) {
				console.log('[DebugWalletSendForm] amountError - ERC-20 check - amountNum:', amountNum, 'balanceNum:', balanceNum);
			}
			if (!isNaN(balanceNum) && balanceNum > 0) {
				if (amountNum > balanceNum + BALANCE.FLOATING_POINT_TOLERANCE) {
					if (import.meta.env.DEV) {
						console.log('[DebugWalletSendForm] amountError - ERC-20 insufficient balance');
					}
					return $t('wallet.debug_wallet.send_form.insufficient_balance');
				}
			}
		} else {
			if (import.meta.env.DEV) {
				console.log('[DebugWalletSendForm] amountError - native RBTC, skipping balance check (handled by hasInsufficientBalance)');
			}
		}
		
		if (import.meta.env.DEV) {
			console.log('[DebugWalletSendForm] amountError - no errors, returning null');
		}
		return null;
	});

	// Validate amount (for form submission)
	function validateAmount() {
		return !amountError;
	}

	// Check if amount is valid
	let isAmountValid = $derived.by(() => {
		return amount.trim() !== '' && !amountError;
	});

	// Estimate gas fee for sending
	async function estimateGasFee(): Promise<void> {
		if (isEstimatingGas) return;
		
		if (!recipientAddress.trim() || !amount.trim() || !isAddressValid || !isAmountValid) {
			estimatedGasFee = null;
			return;
		}

		isEstimatingGas = true;
		hasInsufficientRBTCForGas = false;
		try {
			if (!token.isNative) {
				// For ERC-20 tokens, estimate gas properly using the contract
				try {
					const gasEstimation = await estimateERC20Gas(
						token.address,
						recipientAddress.trim(),
						amount.trim()
					);
					const gasFeeRBTC = parseFloat(gasEstimation.totalCostFormatted);
					estimatedGasFee = gasFeeRBTC;
					
					// Check if user has enough RBTC for gas
					const rbtcBalance = parseFloat($walletStore.rsk?.formattedBalance || '0');
					if (gasFeeRBTC > rbtcBalance) {
						hasInsufficientRBTCForGas = true;
					}
				} catch (error) {
					if (import.meta.env.DEV) {
						console.warn('[DebugWalletSendForm] ERC-20 gas estimation failed, using default:', error);
					}
					// Fallback to default estimate
					estimatedGasFee = GAS_ESTIMATES.ERC20_DEFAULT;
					
					// Still check if user has enough RBTC for default gas
					const rbtcBalance = parseFloat($walletStore.rsk?.formattedBalance || '0');
					if (GAS_ESTIMATES.ERC20_DEFAULT > rbtcBalance) {
						hasInsufficientRBTCForGas = true;
					}
				}
				return;
			}

			const amountNum = parseFloat(amount);
			if (amountNum <= 0) {
				estimatedGasFee = GAS_ESTIMATES.RBTC_DEFAULT;
				return;
			}

			// For native RBTC, estimate based on actual amount
			const gasEstimation = await walletManager.estimateRBTCGas(
				recipientAddress.trim(),
				amountNum.toFixed(8)
			);
			
			const totalCost = parseFloat(gasEstimation.totalCostFormatted);
			// Gas fee = total cost - amount being sent
			const gasFee = totalCost - amountNum;
			estimatedGasFee = Math.max(0, gasFee);
		} catch (error) {
			if (import.meta.env.DEV) {
				console.warn('[DebugWalletSendForm] estimateGasFee() - Failed to estimate gas:', error);
			}
			// Fallback to defaults from constants
			estimatedGasFee = token.isNative ? GAS_ESTIMATES.RBTC_DEFAULT : GAS_ESTIMATES.ERC20_DEFAULT;
		} finally {
			isEstimatingGas = false;
		}
	}

	// Set max amount accounting for gas fees
	async function setMaxAmount() {
		if (isEstimatingMax) return;

		triggerHaptic(ImpactStyle.Light);
		isEstimatingMax = true;
		errorMessage = null;

		try {
			if (token.isNative) {
				// For native RBTC, we need to estimate gas first
				const balance = parseFloat(token.formattedBalance);
				
				// If we have a valid address, estimate gas with a test amount (90% of balance)
				// Otherwise use a conservative default
				let gasEstimate: number;
				
				if (recipientAddress.trim() && isAddressValid) {
					try {
						// Use percentage from constants for estimation to avoid "insufficient funds" error
						const estimateAmount = balance * BALANCE.ESTIMATION_PERCENTAGE;
						const gasEstimation = await walletManager.estimateRBTCGas(
							recipientAddress.trim(),
							estimateAmount.toFixed(8)
						);
						const totalCost = parseFloat(gasEstimation.totalCostFormatted);
						// Gas fee = total cost - amount being sent
						gasEstimate = Math.max(0, totalCost - estimateAmount);
					} catch (error) {
						console.warn('Failed to estimate gas for max calculation:', error);
						// Fallback to default from constants
						gasEstimate = GAS_ESTIMATES.RBTC_DEFAULT;
					}
				} else {
					// No valid address, use default from constants
					gasEstimate = GAS_ESTIMATES.RBTC_DEFAULT;
				}
				
				// Calculate max amount = balance - gas fee
				const maxAmount = Math.max(0, balance - gasEstimate);
				
				// Round to reasonable precision (8 decimals for RBTC) and remove trailing zeros
				amount = maxAmount.toFixed(8).replace(/\.?0+$/, '');
				
				// Update the estimated gas fee for display
				estimatedGasFee = gasEstimate;
			} else {
				// For ERC-20 tokens, we can send the full balance
				// But we should check if user has enough RBTC for gas
				// For now, allow full token balance (gas check happens on send)
				amount = token.formattedBalance;
			}
		} catch (error) {
			console.error('Failed to calculate max amount:', error);
			// Fallback to full balance (user will see error on send if insufficient for gas)
			amount = token.formattedBalance;
		} finally {
			isEstimatingMax = false;
		}
	}

	// Calculate total to send (amount + gas fee)
	// Use $derived.by() to ensure proper reactivity tracking
	let totalToSend = $derived.by(() => {
		// Access all reactive dependencies explicitly
		const currentAmount = amount;
		const currentGasFee = estimatedGasFee;
		const isNative = token.isNative;
		
		if (!currentAmount.trim()) return 0;
		
		const amountNum = parseFloat(currentAmount);
		if (isNaN(amountNum) || amountNum <= 0) return 0;
		
		// For native tokens, include gas fee if estimated
		if (isNative && currentGasFee !== null && currentGasFee >= 0) {
			return amountNum + currentGasFee;
		}
		
		// For ERC-20 tokens or when gas not estimated, just return amount
		return amountNum;
	});

	// Unified validation: checks if total (amount + gas) exceeds balance
	// Single source of truth for insufficient funds - used by total box
	let hasInsufficientBalance = $derived.by(() => {
		const currentAmount = amount.trim();
		const currentGasFee = estimatedGasFee;
		const currentBalance = token.formattedBalance;
		const isNative = token.isNative;
		const currentAmountError = amountError;
		
		if (import.meta.env.DEV) {
			console.log('[DebugWalletSendForm] hasInsufficientBalance derived:', {
				currentAmount,
				currentGasFee,
				currentBalance,
				isNative,
				currentAmountError
			});
		}
		
		// Must have valid amount (no format errors)
		if (!currentAmount) {
			if (import.meta.env.DEV) {
				console.log('[DebugWalletSendForm] hasInsufficientBalance - empty amount, returning false');
			}
			return false;
		}
		
		if (currentAmountError) {
			if (import.meta.env.DEV) {
				console.log('[DebugWalletSendForm] hasInsufficientBalance - format error exists:', currentAmountError, 'returning false');
			}
			return false;
		}
		
		const amountNum = parseFloat(currentAmount);
		if (isNaN(amountNum) || amountNum <= 0) {
			if (import.meta.env.DEV) {
				console.log('[DebugWalletSendForm] hasInsufficientBalance - invalid amountNum:', amountNum, 'returning false');
			}
			return false;
		}
		
		const balanceNum = parseFloat(currentBalance);
		if (isNaN(balanceNum) || balanceNum <= 0) {
			if (import.meta.env.DEV) {
				console.log('[DebugWalletSendForm] hasInsufficientBalance - invalid balanceNum:', balanceNum, 'returning false');
			}
			return false;
		}
		
		// For native RBTC: check amount + gas (if gas is estimated)
		// If gas not estimated yet, check amount only
		if (isNative) {
			if (currentGasFee !== null && currentGasFee >= 0) {
				const total = amountNum + currentGasFee;
				const result = total > balanceNum;
				if (import.meta.env.DEV) {
					console.log('[DebugWalletSendForm] hasInsufficientBalance - native RBTC with gas:', {
						amountNum,
						currentGasFee,
						total,
						balanceNum,
						result
					});
				}
				return result;
			} else {
				// Gas not estimated yet - check if amount alone exceeds balance
				const result = amountNum > balanceNum;
				if (import.meta.env.DEV) {
					console.log('[DebugWalletSendForm] hasInsufficientBalance - native RBTC without gas:', {
						amountNum,
						balanceNum,
						result
					});
				}
				return result;
			}
		}
		
		// For ERC-20 tokens: check amount only (gas is paid separately in RBTC)
		// Token balance check is already in amountError
		const result = amountNum > balanceNum;
		if (import.meta.env.DEV) {
			console.log('[DebugWalletSendForm] hasInsufficientBalance - ERC-20:', {
				amountNum,
				balanceNum,
				result
			});
		}
		return result;
	});

	// Check if form is valid (must be after hasInsufficientBalance declaration)
	let isFormValid = $derived(isAddressValid && isAmountValid && !isSending && !hasInsufficientBalance && !hasInsufficientRBTCForGas);

	// Auto-estimate gas when both address and amount are valid
	// Debounced and key-based to prevent excessive API calls and re-renders
	// Wrapped in error boundary to prevent crashes
	let estimationTimeout: ReturnType<typeof setTimeout> | null = null;
	let lastEstimationKey = $state<string>('');
	let isMounted = $state(true);
	
	$effect(() => {
		try {
			// Create a key from the relevant inputs to detect actual changes
			const currentKey = `${recipientAddress.trim()}-${amount.trim()}-${isAddressValid}-${isAmountValid}`;
			
			// Clear any pending estimation
			if (estimationTimeout) {
				clearTimeout(estimationTimeout);
				estimationTimeout = null;
			}
			
			// Only estimate if key changed, inputs are valid, and component is mounted
			if (currentKey !== lastEstimationKey && isMounted && isAddressValid && isAmountValid && recipientAddress.trim() && amount.trim() && !isSending && !isEstimatingGas) {
				lastEstimationKey = currentKey;
				// Debounce gas estimation to avoid excessive API calls
				estimationTimeout = setTimeout(() => {
					if (isMounted) {
						estimateGasFee().catch(err => {
							if (import.meta.env.DEV) {
								console.error('[DebugWalletSendForm] Error in gas estimation:', err);
							}
						});
					}
				}, UI.GAS_ESTIMATION_DEBOUNCE);
			} else if (!recipientAddress.trim() || !amount.trim()) {
				estimatedGasFee = null;
				lastEstimationKey = '';
			}
			
			// Cleanup function
			return () => {
				if (estimationTimeout) {
					clearTimeout(estimationTimeout);
					estimationTimeout = null;
				}
			};
		} catch (error) {
			if (import.meta.env.DEV) {
				console.error('[DebugWalletSendForm] Error in $effect:', error);
			}
			// Reset state on error
			estimatedGasFee = null;
		}
	});
	
	onMount(() => {
		isMounted = true;
	});
	
	onDestroy(() => {
		isMounted = false;
		if (estimationTimeout) {
			clearTimeout(estimationTimeout);
			estimationTimeout = null;
		}
	});

	// Validate self-send
	function validateSelfSend(): boolean {
		const state = $walletStore;
		const senderAddress = state.rsk?.address?.toLowerCase();
		const recipient = recipientAddress.trim().toLowerCase();
		
		if (senderAddress && recipient && senderAddress === recipient) {
			errorMessage = $t('wallet.debug_wallet.send_form.self_send_error');
			return false;
		}
		return true;
	}

	// Handle form submission
	// Show confirmation modal
	function showConfirmationModal() {
		// Validate inputs first
		const isAddressValid = validateAddress();
		const isAmountValid = !amountError;
		
		// Validate self-send
		if (!validateSelfSend()) {
			triggerHaptic(ImpactStyle.Medium);
			return;
		}

		if (!isAddressValid || !isAmountValid) {
			triggerHaptic(ImpactStyle.Medium);
			return;
		}

		showConfirmation = true;
		triggerHaptic(ImpactStyle.Light);
	}

	// Get explorer URL for RSK address
	function getExplorerUrl(address: string): string | null {
		if (!address) return null;
		const rskNetwork = import.meta.env.VITE_RSK_NETWORK || 'testnet';
		return rskNetwork === 'mainnet'
			? `https://rootstock.blockscout.com/address/${address}`
			: `https://rootstock-testnet.blockscout.com/address/${address}`;
	}

	// Monitor transaction confirmation
	async function monitorTransaction(txHash: string) {
		if (monitoringInterval) return; // Already monitoring

		// Start polling after 27 seconds (wait for countdown to reach 3 seconds)
		// This gives the transaction time to be mined before we start checking
		setTimeout(() => {
			// Start polling every 1 second
			monitoringInterval = setInterval(async () => {
				try {
					const provider = getProvider('rsk');
					if (!provider) {
						return;
					}

					const receipt = await provider.getTransactionReceipt(txHash);
					if (receipt) {
						const isConfirmed = receipt.status === 1;
						
						if (isConfirmed) {
							// Transaction confirmed
							if (monitoringInterval) {
								clearInterval(monitoringInterval);
								monitoringInterval = null;
							}
							if (countdownInterval) {
								clearInterval(countdownInterval);
								countdownInterval = null;
							}
							
							transactionState = 'confirmed';
							triggerHaptic(ImpactStyle.Medium);
							appStore.showSuccessToast($t('wallet.debug_wallet.send_form.transaction_successful'));
							
							// Auto-close after 5 seconds
							autoCloseTimeout = setTimeout(() => {
								// Reset form
								recipientAddress = '';
								amount = '';
								estimatedGasFee = null;
								hasInsufficientRBTCForGas = false;
								errorMessage = null;
								addressError = null;
								amountError = null;
								transactionState = 'idle';
								transactionHash = null;
								
								// Call callbacks
								if (onSuccess) {
									onSuccess();
								}
								if (onClose) {
									onClose();
								}
							}, 5000);
						} else if (receipt.status === 0) {
							// Transaction failed
							if (monitoringInterval) {
								clearInterval(monitoringInterval);
								monitoringInterval = null;
							}
							if (countdownInterval) {
								clearInterval(countdownInterval);
								countdownInterval = null;
							}
							
							transactionState = 'error';
							errorMessage = $t('wallet.debug_wallet.send_form.transaction_failed');
							triggerHaptic(ImpactStyle.Heavy);
						}
					}
				} catch (error) {
					if (import.meta.env.DEV) {
						console.error('Error monitoring transaction:', error);
					}
				}
			}, 1000); // Check every 1 second
		}, 27000); // Start polling after 27 seconds
	}

	// Handle confirmed send
	async function handleConfirmedSend() {
		showConfirmation = false;
		isSending = true;
		errorMessage = null;
		transactionState = 'pending';
		countdownSeconds = 30; // RSK block time is ~30 seconds
		
		// Clear any existing interval first
		if (countdownInterval) {
			clearInterval(countdownInterval);
			countdownInterval = null;
		}

		// Start countdown timer immediately when pending state is shown
		// Use same pattern as BalanceCard.svelte which works correctly
		countdownInterval = setInterval(() => {
			if (countdownSeconds > 0) {
				countdownSeconds--;
				if (import.meta.env.DEV) {
					console.log('[DebugWalletSendForm] Countdown:', countdownSeconds);
				}
			} else {
				if (countdownInterval) {
					clearInterval(countdownInterval);
					countdownInterval = null;
				}
			}
		}, 1000);

		try {
			triggerHaptic(ImpactStyle.Light);

			let txHash: string;
			let isERC20 = false;
			
			if (token.isNative) {
				// Send native RBTC using store function
				// This returns hash immediately (transaction sent but not confirmed)
				txHash = await sendRBTC(recipientAddress.trim(), amount.trim());
			} else {
				// Send ERC-20 token using store function
				// Type safety: token.address is guaranteed to be a contract address for non-native tokens
				const tokenAddress = token.address;
				if (!tokenAddress || tokenAddress === 'native') {
					throw new Error('Invalid token address for ERC-20 transfer');
				}
				// sendRSKToken waits for confirmation, so transaction is already confirmed
				txHash = await sendRSKToken(tokenAddress, recipientAddress.trim(), amount.trim());
				isERC20 = true;
			}

			transactionHash = txHash;
			
			// For ERC-20 tokens, transaction is already confirmed (sendRSKToken waits for receipt)
			if (isERC20) {
				// Stop countdown if it was started
				if (countdownInterval) {
					clearInterval(countdownInterval);
					countdownInterval = null;
				}
				// Skip pending state, go directly to confirmed
						transactionState = 'confirmed';
						triggerHaptic(ImpactStyle.Medium);
						appStore.showSuccessToast($t('wallet.debug_wallet.send_form.transaction_successful'));
						// Note: No auto-close - user can close manually with button
			} else {
				// For native RBTC, start monitoring transaction (countdown already started above)
				// Start monitoring transaction (don't await - let it run in background)
				monitorTransaction(txHash).catch(err => {
					if (import.meta.env.DEV) {
						console.error('[DebugWalletSendForm] Error in monitorTransaction:', err);
					}
				});
			}
		} catch (error) {
			if (import.meta.env.DEV) {
				console.error('Failed to send token:', error);
			}
			transactionState = 'error';
			errorMessage = error instanceof Error ? error.message : $t('wallet.debug_wallet.send_form.transaction_failed');
			appStore.showErrorToast(errorMessage);
			triggerHaptic(ImpactStyle.Heavy);
			
			// Stop countdown if running
			if (countdownInterval) {
				clearInterval(countdownInterval);
				countdownInterval = null;
			}
		} finally {
			isSending = false;
		}
	}
</script>

<div class="flex flex-1 flex-col min-h-0 space-y-3 sm:space-y-4">
	<!-- Transaction Status Screen (Pending/Confirmed/Error) -->
	{#if transactionState !== 'idle'}
		<div class="flex flex-1 flex-col items-center justify-center gap-6 py-8">
			{#if transactionState === 'pending'}
				<!-- Pending State -->
				<div class="flex flex-col items-center gap-4" transition:fade={{ duration: 300 }}>
					<div class="flex h-24 w-24 items-center justify-center rounded-full bg-warning/20 text-warning sm:h-32 sm:w-32">
						<IconClockOutline class="h-[77px] w-[77px] sm:h-[102px] sm:w-[102px]" />
					</div>
					<div class="text-center space-y-2">
						<h3 class="text-xl font-bold sm:text-2xl">{$t('wallet.debug_wallet.send_form.transaction_pending')}</h3>
						<p class="text-base-content/70 text-xs sm:text-sm">{$t('wallet.debug_wallet.send_form.estimated_time_remaining')}</p>
						<p class="text-base-content/70 text-sm sm:text-base">
							<span class="font-semibold text-warning text-2xl sm:text-3xl">{countdownSeconds}s</span>
						</p>
					</div>
				</div>
			{:else if transactionState === 'confirmed'}
				<!-- Success State -->
				<div class="flex flex-col items-center gap-4" transition:fly={{ y: 20, duration: 500 }}>
					<div class="flex h-24 w-24 items-center justify-center rounded-full bg-success/20 text-success sm:h-32 sm:w-32">
						<IconCheck class="h-[77px] w-[77px] sm:h-[102px] sm:w-[102px]" />
					</div>
					<div class="text-center space-y-2">
						<h3 class="text-xl font-bold sm:text-2xl">{$t('wallet.debug_wallet.send_form.transaction_successful')}</h3>
					</div>
					<button
						class="btn btn-error min-h-[48px] touch-manipulation transition-transform duration-100 select-none active:scale-95 md:min-h-[56px] mt-4"
						style="-webkit-tap-highlight-color: transparent;"
						onclick={() => {
							triggerHaptic(ImpactStyle.Light);
							// Reset form
							recipientAddress = '';
							amount = '';
							estimatedGasFee = null;
							hasInsufficientRBTCForGas = false;
							errorMessage = null;
							addressError = null;
							amountError = null;
							transactionState = 'idle';
							transactionHash = null;
							
							// Call callbacks
							if (onSuccess) {
								onSuccess();
							}
							if (onClose) {
								onClose();
							}
						}}
					>
						<IconClose class="mr-2 h-5 w-5" />
						{$t('common.buttons.close')}
					</button>
				</div>
			{:else if transactionState === 'error'}
				<!-- Error State -->
				<div class="flex flex-col items-center gap-4" transition:fly={{ y: 20, duration: 500 }}>
					<div class="flex h-24 w-24 items-center justify-center rounded-full bg-error/20 text-error sm:h-32 sm:w-32">
						<IconAlertCircle class="h-[77px] w-[77px] sm:h-[102px] sm:w-[102px]" />
					</div>
					<div class="text-center space-y-2">
						<h3 class="text-xl font-bold sm:text-2xl">{$t('wallet.debug_wallet.send_form.transaction_failed')}</h3>
						{#if errorMessage}
							<p class="text-error text-sm sm:text-base">{errorMessage}</p>
						{/if}
					</div>
					<button
						class="btn btn-error min-h-[48px] touch-manipulation transition-transform duration-100 select-none active:scale-95 md:min-h-[56px] mt-4"
						style="-webkit-tap-highlight-color: transparent;"
						onclick={() => {
							triggerHaptic(ImpactStyle.Light);
							transactionState = 'idle';
							transactionHash = null;
							errorMessage = null;
						}}
					>
						<IconClose class="mr-2 h-5 w-5" />
						{$t('common.cancel')}
					</button>
				</div>
			{/if}
		</div>
	{:else}
		<!-- Normal Form Content -->
		<!-- Error message -->
		{#if errorMessage}
		<div class="alert alert-outline alert-error py-2 text-sm sm:py-4 sm:text-base">
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

	<!-- Available balance card -->
	<div class="border-base-300 bg-base-200 rounded-lg border p-3 sm:p-4">
		<div class="flex items-center justify-between">
			<span class="text-xs opacity-70 sm:text-sm">{$t('wallet.debug_wallet.send_form.available_balance')}</span>
			<span class="font-semibold text-sm sm:text-base">{token.formattedBalance} {token.symbol}</span>
		</div>
	</div>

	<!-- Recipient address input (styled like payment details) -->
	<div class="form-control">
		<div class="relative">
			<div
				class="flex w-full items-stretch overflow-hidden rounded-lg border-2 transition-colors"
				class:border-primary={!isAddressValid && !addressError}
				class:border-success={isAddressValid && !addressError && recipientAddress.trim()}
				class:border-error={!!addressError}
			>
				<!-- Input field with validation icons -->
				<div class="bg-base-200 relative flex flex-1 items-center p-2">
					<div class="relative flex-1 min-w-0 pr-10 sm:pr-11">
						<input
							id="recipient-address"
							type="text"
							class="w-full bg-transparent pl-6 text-base text-sm focus:outline-none placeholder:text-base-content/50"
							placeholder={$t('wallet.debug_wallet.send_form.recipient_address_placeholder')}
							bind:value={recipientAddress}
							oninput={validateAddress}
							onblur={validateAddress}
							disabled={isSending}
						/>
						{#if recipientAddress.trim()}
							<div class="pointer-events-none absolute top-1/2 left-0 flex -translate-y-1/2 items-center gap-1">
								{#if isAddressValid && !addressError}
									<IconCheck class="text-success h-5 w-5" />
								{:else if addressError}
									<IconClose class="text-error h-5 w-5" />
								{/if}
							</div>
						{/if}
					</div>
					<!-- Clear button -->
					{#if recipientAddress.trim()}
						<button
							type="button"
							class="absolute right-2 btn btn-ghost btn-sm btn-circle text-error hover:bg-error/20 flex h-9 min-h-[40px] w-9 min-w-[40px] touch-manipulation items-center justify-center p-0 select-none sm:h-11 sm:min-h-[44px] sm:w-11 sm:min-w-[44px]"
							style="-webkit-tap-highlight-color: transparent;"
							onclick={() => {
								recipientAddress = '';
								addressError = null;
								estimatedGasFee = null;
								triggerHaptic(ImpactStyle.Light);
							}}
							aria-label="Clear address"
							disabled={isSending}
						>
							<IconClose class="h-6 w-6 sm:h-8 sm:w-8" />
						</button>
					{/if}
				</div>
			</div>
			{#if addressError}
				<div id="address-error" class="label mt-1" role="alert">
					<span class="label-text-alt text-error">{addressError}</span>
				</div>
			{/if}
		</div>
	</div>

	<!-- Amount input with attached Max button (matching AmountInputSection style) -->
	<div class="form-control">
		<div
			class="flex w-full items-stretch overflow-hidden rounded-lg border-2 transition-colors"
			class:border-primary={!hasInsufficientBalance && !amountError}
			class:border-error={hasInsufficientBalance || !!amountError}
		>
		<!-- Input area (grey bar) - takes remaining width -->
		<div class="bg-base-200 relative flex flex-1 items-center p-2 min-h-[3rem] sm:min-h-[3.5rem]">
			<input
				id="amount"
				type="text"
				inputmode="decimal"
				class="w-full bg-transparent text-center text-2xl font-bold focus:outline-none placeholder:text-base-content/50 sm:text-3xl"
				placeholder="0"
				bind:value={amount}
				oninput={validateAmount}
				onblur={validateAmount}
				disabled={isSending}
				aria-label={$t('wallet.debug_wallet.send_form.amount_placeholder')}
				aria-invalid={!!amountError || hasInsufficientBalance}
				aria-describedby={amountError ? 'amount-error' : hasInsufficientBalance ? 'insufficient-balance' : undefined}
			/>
			<!-- Clear button -->
			{#if amount.trim()}
				<button
					type="button"
					class="absolute right-2 btn btn-ghost btn-sm btn-circle text-error hover:bg-error/20 flex h-9 min-h-[40px] w-9 min-w-[40px] touch-manipulation items-center justify-center p-0 select-none sm:h-11 sm:min-h-[44px] sm:w-11 sm:min-w-[44px]"
					style="-webkit-tap-highlight-color: transparent;"
					onclick={() => {
						amount = '';
						amountError = null;
						estimatedGasFee = null;
						triggerHaptic(ImpactStyle.Light);
					}}
					aria-label="Clear amount"
					disabled={isSending}
				>
					<IconClose class="h-6 w-6 sm:h-8 sm:w-8" />
				</button>
			{/if}
		</div>
			<!-- Max button (attached, orange) -->
			<button
				type="button"
				class="bg-primary text-primary-content flex min-w-[56px] touch-manipulation items-center justify-center rounded-l-none rounded-r-lg px-2 py-1.5 text-lg font-semibold whitespace-nowrap transition-opacity select-none disabled:opacity-20 sm:min-w-[60px] sm:px-3 sm:py-2 sm:text-xl"
				style="-webkit-tap-highlight-color: transparent; margin-right: -2px; width: 64px;"
				onclick={setMaxAmount}
				disabled={isSending || isEstimatingMax}
				aria-label="Set maximum amount"
			>
				{#if isEstimatingMax}
					<span class="loading loading-spinner loading-xs"></span>
				{:else}
					{$t('wallet.debug_wallet.send_form.max')}
				{/if}
			</button>
		</div>
		{#if amountError}
			<div id="amount-error" class="label mt-1" role="alert">
				<span class="label-text-alt text-error">{amountError}</span>
			</div>
		{/if}
		{#if hasInsufficientRBTCForGas}
			<div id="insufficient-rbtc-gas" class="label mt-1" role="alert">
				<span class="label-text-alt text-error">{$t('wallet.debug_wallet.send_form.insufficient_rbtc_for_gas')}</span>
			</div>
		{/if}
	</div>


	<!-- Network Fee Accordion (matching SendPaymentForm style) -->
	{#if errorMessage && errorMessage.includes('gas')}
		<div class="alert alert-outline alert-error py-2 text-sm sm:py-4 sm:text-base">
			<span>{errorMessage}</span>
		</div>
	{:else}
		<div
			class="collapse-arrow border-base-300 bg-base-100 collapse rounded-lg border"
			class:collapse-open={networkFeeExpanded}
		>
			<button
				type="button"
				class="collapse-title min-h-0 px-3 py-2 text-left text-sm font-medium sm:px-4 sm:text-base"
				onclick={() => {
					triggerHaptic(ImpactStyle.Light);
					networkFeeExpanded = !networkFeeExpanded;
				}}
				disabled={isEstimatingGas}
			>
				<div class="flex w-full items-center gap-1.5 sm:gap-2">
					<span>{$t('wallet.network_fee')}:</span>
					{#if isEstimatingGas}
						<span class="font-semibold inline-flex items-center gap-1.5 min-w-[5rem] sm:gap-2">
							<span class="loading loading-spinner loading-xs"></span>
						</span>
					{:else if estimatedGasFee !== null && estimatedGasFee > 0}
						<span class="font-semibold">
							{estimatedGasFee.toFixed(8)} RBTC
						</span>
					{:else}
						<span class="font-semibold">0 RBTC</span>
					{/if}
				</div>
			</button>
			<div class="collapse-content">
				<div class="space-y-1.5 px-3">
					{#if estimatedGasFee !== null && estimatedGasFee > 0}
						<div class="flex items-center justify-between text-xs opacity-70">
							<span>{$t('wallet.swap.network_transaction_fee')}:</span>
							<span>{estimatedGasFee.toFixed(8)} RBTC</span>
						</div>
					{:else}
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
		class="bg-base-200 flex flex-col items-center gap-1.5 rounded-lg border-2 p-3 sm:p-4"
			class:border-primary={!hasInsufficientBalance}
			class:border-error={hasInsufficientBalance}
		>
		<span class="text-center text-xs opacity-70">{$t('wallet.send.total_to_send')}</span>
		{#if hasInsufficientBalance}
			<!-- Show error message instead of amount when insufficient balance -->
			<div id="insufficient-balance" class="text-error text-center text-sm sm:text-base" role="alert">
				{$t('wallet.validation.insufficient_balance')}
			</div>
			{:else if amount.trim() && parseFloat(amount) > 0}
			<div class="flex w-full items-center justify-center gap-1.5 flex-wrap">
				<span class="text-primary text-xl font-bold sm:text-2xl">
					{totalToSend.toFixed(8)} {token.isNative ? 'RBTC' : token.symbol}
				</span>
			</div>
		{:else}
			<div class="text-center text-xs opacity-60">
				{$t('wallet.send.enter_address_and_amount_to_estimate')}
			</div>
		{/if}
	</div>

	<!-- Actions - Mobile: bottom of screen, Desktop: inline -->
	<div
		class="bg-base-100 sticky bottom-0 z-10 mt-auto flex-shrink-0 flex gap-2 pt-3 pb-3 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] sm:gap-3 sm:pt-4 sm:pb-4 md:static md:mb-4 md:pt-0 md:pb-0 md:shadow-none"
	>
		{#if onClose}
			<button
				class="btn btn-error min-h-[44px] flex-1 touch-manipulation transition-transform duration-100 select-none active:scale-95 sm:min-h-[48px] md:min-h-[56px]"
				style="-webkit-tap-highlight-color: transparent;"
				onclick={() => {
					triggerHaptic(ImpactStyle.Light);
					onClose();
				}}
				disabled={isSending}
			>
				<IconClose class="h-4 w-4 sm:h-5 sm:w-5" />
				<span class="text-sm sm:text-base">{$t('common.buttons.cancel')}</span>
			</button>
		{/if}
		<button
			class="btn btn-primary min-h-[44px] flex-1 touch-manipulation transition-transform duration-100 select-none active:scale-95 sm:min-h-[48px] md:min-h-[56px]"
			style="-webkit-tap-highlight-color: transparent;"
			onclick={showConfirmationModal}
			disabled={!isFormValid || isSending}
		>
			{#if isSending}
				<span class="loading loading-spinner loading-sm"></span>
				<span class="text-sm sm:text-base">{$t('wallet.debug_wallet.send_form.sending')}</span>
			{:else}
				<span class="text-sm sm:text-base">{$t('wallet.debug_wallet.send_form.send')}</span>
			{/if}
		</button>
	</div>
	{/if}
</div>

<!-- Send Confirmation Modal -->
{#if showConfirmation}
	{@const explorerUrl = getExplorerUrl(recipientAddress.trim())}
	<div class="modal modal-open z-120">
		<div class="modal-box max-w-md">
			<h3 class="text-lg font-bold">{$t('wallet.send.confirm_payment')}</h3>
			<div class="space-y-4 py-4">
				<!-- Address Accordion -->
				<AddressAccordion
					address={recipientAddress.trim()}
					explorerUrl={explorerUrl}
					label={$t('wallet.debug_wallet.send_form.recipient_address')}
				/>

				<!-- Amount -->
				<div class="space-y-1">
					<div class="text-sm font-medium opacity-70">{$t('wallet.send.amount')}</div>
					<div class="font-semibold">
						{amount} {token.symbol}
					</div>
				</div>

				<!-- Estimated Transaction Fees -->
				{#if estimatedGasFee !== null && estimatedGasFee > 0}
					<div class="space-y-1">
						<div class="text-sm font-medium opacity-70">{$t('wallet.send.transaction_fee')}</div>
						<div class="font-semibold">
							{estimatedGasFee.toFixed(8)} RBTC
						</div>
					</div>
				{/if}

				<!-- Total to Send -->
				<div class="space-y-1">
					<div class="text-sm font-medium opacity-70">{$t('wallet.send.total_to_send')}</div>
					<div class="font-semibold">
						{#if token.isNative && estimatedGasFee !== null}
							{(parseFloat(amount) + estimatedGasFee).toFixed(8)} RBTC
						{:else}
							{amount} {token.symbol}
						{/if}
					</div>
				</div>

				<!-- Insufficient Balance Error -->
				{#if hasInsufficientBalance}
					<div class="space-y-1 pt-1">
						<p class="text-error text-md">
							{$t('wallet.validation.insufficient_balance')}
						</p>
					</div>
				{/if}

				<!-- Insufficient RBTC for Gas (ERC-20 only) -->
				{#if hasInsufficientRBTCForGas && !token.isNative}
					<div class="space-y-1 pt-1">
						<p class="text-error text-md">
							{$t('wallet.debug_wallet.send_form.insufficient_rbtc_for_gas')}
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
				<button class="btn btn-ghost" onclick={() => (showConfirmation = false)}>
					{$t('common.buttons.cancel')}
				</button>
				<button
					class="btn btn-primary"
					onclick={handleConfirmedSend}
					disabled={hasInsufficientBalance || hasInsufficientRBTCForGas}
				>
					{$t('wallet.debug_wallet.send_form.send')}
				</button>
			</div>
		</div>
		<button
			class="modal-backdrop"
			onclick={() => (showConfirmation = false)}
			aria-label="Close modal"
		></button>
	</div>
{/if}


<script lang="ts">
	import { t } from 'svelte-i18n';
	import { onMount, onDestroy } from 'svelte';
	import { walletStore, walletManager } from '$lib/stores/wallet.store';
	import { appStore } from '$lib/stores/app.store';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';
	import { triggerHaptic, ImpactStyle } from '$lib/utils/helpers/haptics';
	import { debounce } from '$lib/utils/helpers/common';
	import { RSK_NETWORKS } from '$lib/utils/wallet/networkConfig';
	import { ethers, type Signer } from 'ethers';
	import { clickOutside } from '$lib/utils/clickOutside';
	import AmountInputSection from '$lib/components/wallet/AmountInputSection.svelte';
	import PaymentRequestModal from '$lib/components/wallet/PaymentRequestModal.svelte';
	import IconCashMultiple from '~icons/mdi/cash-multiple';
	import IconClose from '~icons/mdi/close';
	import IconCheck from '~icons/mdi/check';

	interface Props {
		onCancel: () => void;
		onInvoiceGenerated?: (invoiceData: { address: string; amount: number; memo?: string }) => void;
	}

	let { onCancel, onInvoiceGenerated }: Props = $props();

	// Form state
	let amount = $state('');
	let unit = $state<'sats' | 'usd'>('usd'); // Default to USD
	let mathExpression = $state(''); // Store the calculation expression
	let memo = $state('');
	let selectedNetwork = $state('lightning-bitcoin');
	let btcPrice = $state<number>(0);
	let invoiceGenerated = $state(false);
	let descriptionExpanded = $state(false); // Accordion state for description field
	let networkDropdownElement: HTMLDetailsElement; // Reference to details element for DaisyUI dropdown
	let networkFeeExpanded = $state(false); // Accordion state for network fee breakdown
	let calculatorKey = $state(0); // Key to force CalculatorKeypad reset
	let chargeFeesToPayer = $state(false); // Toggle to charge fees to payer instead of deducting from receiver
	let showPaymentRequestModal = $state(false); // Show payment request modal
	let invoiceData = $state<{
		address: string;
		amount: number;
		network: string;
		memo?: string;
		swapId?: string;
		chargeFeesToPayer?: boolean;
		totalFees?: number;
	} | null>(null);
	let isGeneratingInvoice = $state(false);
	let rootstockGasFee = $state<number | null>(null); // Real-time rootstock gas fee estimate

	// Fee estimation state
	let estimatedFees = $state<{
		serviceFee: number; // in sats
		networkFee: number; // in sats
		totalFees: number; // in sats
	} | null>(null);
	let isLoadingFees = $state(false);
	let feeError = $state<string | null>(null);

	// Swap fees for Lightning and Liquid
	let swapFees = $state<{
		percentage: number;
		lockupFee: number;
		claimFee: number;
	} | null>(null);

	// Derived values
	const amountInSats = $derived.by(() => {
		if (unit === 'sats') {
			const parsed = parseFloat(amount);
			return isNaN(parsed) ? 0 : Math.floor(parsed);
		} else {
			const usdAmount = parseFloat(amount);
			if (isNaN(usdAmount) || btcPrice === 0) return 0;
			return Math.floor((usdAmount / btcPrice) * 100_000_000);
		}
	});

	const totalReceived = $derived.by(() => {
		if (!estimatedFees || amountInSats === 0) return 0;
		// If charging fees to payer, receiver gets full amount; otherwise fees are deducted
		if (chargeFeesToPayer) {
			return amountInSats;
		}
		return Math.max(0, amountInSats - estimatedFees.totalFees);
	});

	// Amount payer will pay (includes fees if chargeFeesToPayer is true)
	const amountPayerPays = $derived.by(() => {
		if (!estimatedFees || amountInSats === 0) return 0;
		if (chargeFeesToPayer) {
			return amountInSats + estimatedFees.totalFees;
		}
		return amountInSats;
	});

	// Total received in USD
	const totalReceivedUSD = $derived.by(() => {
		if (totalReceived === 0 || btcPrice === 0) return 0;
		return (totalReceived / 100_000_000) * btcPrice;
	});

	// Network options
	const networkOptions = $derived([
		{
			value: 'lightning-bitcoin',
			label: $t('wallet.receive_form.networks.lightning_bitcoin.label'),
			description: $t('wallet.receive_form.networks.lightning_bitcoin.description'),
			icon: null,
			available: $walletStore.hasAnyConnection,
			swapFeeInfo: '~0.25% swap fee' // Lightning reverse swap fee
		},
		{
			value: 'rootstock-bitcoin',
			label: $t('wallet.receive_form.networks.rootstock_bitcoin.label'),
			description: $t('wallet.receive_form.networks.rootstock_bitcoin.description'),
			icon: '/images/chains/Bitcoin-Rootstock-logo.webp',
			available: $walletStore.rsk.connected,
			swapFeeInfo: 'Network gas fee' // RSK gas fee
		},
		{
			value: 'liquid-bitcoin',
			label: $t('wallet.receive_form.networks.liquid_bitcoin.label'),
			description: $t('wallet.receive_form.networks.liquid_bitcoin.description'),
			icon: '/images/chains/Liquid-Bitcoin.svg',
			available: false, // Disabled - Coming Soon
			swapFeeInfo: '~0.1% swap fee' // Liquid chain swap fee
		},
		{
			value: 'bitcoin',
			label: $t('wallet.receive_form.networks.bitcoin.label'),
			description: $t('wallet.receive_form.networks.bitcoin.description'),
			icon: '/images/chains/Bitcoin.svg',
			available: false, // Disabled - Coming Soon
			swapFeeInfo: 'Network fee' // Bitcoin on-chain fee
		}
	]);

	// Get selected network info
	const selectedNetworkInfo = $derived(
		networkOptions.find((network) => network.value === selectedNetwork)
	);

	// Get estimated fees for a specific network (for dropdown display)
	// Only shows fees if this network is currently selected and amount is entered
	function getNetworkFees(networkValue: string): { serviceFee: number; networkFee: number; totalFees: number } | null {
		if (amountInSats === 0 || selectedNetwork !== networkValue || !estimatedFees) {
			return null;
		}
		return estimatedFees;
	}

	// Estimate real-time Rootstock gas fee using public RPC (no wallet required)
	async function estimateRootstockGasFeePublic(): Promise<void> {
		console.log('[RootstockGasFee] Starting public RPC estimation...');
		try {
			const network = (import.meta.env.VITE_RSK_NETWORK || 'testnet') as 'mainnet' | 'testnet';
			console.log('[RootstockGasFee] Network:', network);
			
			const rpcUrl = RSK_NETWORKS[network]?.rpcUrl;
			console.log('[RootstockGasFee] RPC URL:', rpcUrl);
			
			if (!rpcUrl) {
				console.error('[RootstockGasFee] RSK RPC URL not found for network:', network);
				rootstockGasFee = null;
				return;
			}

			// Create a public provider (no wallet needed)
			console.log('[RootstockGasFee] Creating provider...');
			const provider = new ethers.JsonRpcProvider(rpcUrl);
			
			// Test connection
			console.log('[RootstockGasFee] Testing provider connection...');
			try {
				const blockNumber = await provider.getBlockNumber();
				console.log('[RootstockGasFee] Provider connected, block number:', blockNumber);
			} catch (connError) {
				console.error('[RootstockGasFee] Provider connection failed:', connError);
				throw new Error(`Failed to connect to RSK RPC: ${connError instanceof Error ? connError.message : 'Unknown error'}`);
			}
			
			// Get current gas price first
			console.log('[RootstockGasFee] Getting fee data...');
			const feeData = await provider.getFeeData();
			const gasPrice = feeData.gasPrice || BigInt(0);
			console.log('[RootstockGasFee] Gas price:', gasPrice.toString());
			
			if (gasPrice === BigInt(0)) {
				console.warn('[RootstockGasFee] Gas price is 0, trying alternative method...');
				// Try getting gas price directly
				try {
					const block = await provider.getBlock('latest');
					if (block && block.baseFeePerGas) {
						const baseFee = block.baseFeePerGas;
						// Use base fee + 20% priority fee estimate
						const estimatedGasPrice = (baseFee * BigInt(120)) / BigInt(100);
						console.log('[RootstockGasFee] Using base fee + priority:', estimatedGasPrice.toString());
						const gasLimit = BigInt(21000); // Standard gas limit for simple transfer
						const gasCost = gasLimit * estimatedGasPrice;
						const gasCostRBTC = parseFloat(ethers.formatEther(gasCost));
						const gasFeeSats = Math.floor(gasCostRBTC * 100_000_000);
						console.log('[RootstockGasFee] Gas fee (sats):', gasFeeSats);
						if (gasFeeSats > 0) {
							rootstockGasFee = gasFeeSats;
							return;
						}
					}
				} catch (altError) {
					console.error('[RootstockGasFee] Alternative method failed:', altError);
				}
				console.warn('[RootstockGasFee] Gas price is 0, using fallback');
				rootstockGasFee = null;
				return;
			}
			
			// Use standard gas limit for simple transfer (21000) instead of estimating
			// This is more reliable and doesn't require valid addresses
			const gasLimit = BigInt(21000); // Standard gas limit for ETH/RBTC transfer
			console.log('[RootstockGasFee] Using standard gas limit:', gasLimit.toString());
			
			// Calculate gas cost in RBTC
			const gasCost = gasLimit * gasPrice;
			const gasCostRBTC = parseFloat(ethers.formatEther(gasCost));
			console.log('[RootstockGasFee] Gas cost (RBTC):', gasCostRBTC);
			
			// Convert to sats
			const gasFeeSats = Math.floor(gasCostRBTC * 100_000_000);
			console.log('[RootstockGasFee] Gas fee (sats):', gasFeeSats);
			
			// Only update if we got a valid positive value
			if (gasFeeSats > 0) {
				console.log('[RootstockGasFee] Setting rootstockGasFee to:', gasFeeSats);
				rootstockGasFee = gasFeeSats;
			} else {
				console.warn('[RootstockGasFee] Invalid gas fee sats:', gasFeeSats);
				rootstockGasFee = null;
			}
		} catch (error) {
			console.error('[RootstockGasFee] Failed to estimate Rootstock gas via public RPC:', error);
			if (error instanceof Error) {
				console.error('[RootstockGasFee] Error message:', error.message);
				console.error('[RootstockGasFee] Error stack:', error.stack);
			}
			rootstockGasFee = null;
		}
	}

	// Estimate using wallet (more accurate, requires wallet to be ready)
	async function estimateRootstockGasFeeWithWallet(): Promise<void> {
		// This function should only be called when wallet is ready
		// Double-check to prevent any race conditions
		if ($walletStore.isInitializing || !$walletStore.rsk.connected || !$walletStore.rsk.address) {
			console.log('[RootstockGasFee] Skipping wallet estimation - wallet not ready', {
				isInitializing: $walletStore.isInitializing,
				connected: $walletStore.rsk.connected,
				address: $walletStore.rsk.address
			});
			return;
		}

		try {
			// Use a small default amount (0.0001 RBTC = 10,000 sats) to estimate gas
			const defaultAmountRBTC = '0.0001';
			const gasEstimation = await walletManager.estimateRBTCGas(
				$walletStore.rsk.address,
				defaultAmountRBTC
			);

			const gasFeeRBTC = parseFloat(gasEstimation.totalCostFormatted) - parseFloat(defaultAmountRBTC);
			const gasFeeSats = Math.floor(gasFeeRBTC * 100_000_000);
			
			// Only update if we got a valid positive value
			if (gasFeeSats > 0) {
				rootstockGasFee = gasFeeSats;
			} else {
				rootstockGasFee = null;
			}
		} catch (error) {
			console.error('Failed to estimate Rootstock gas with wallet:', error);
			// Fall back to public RPC estimation
			await estimateRootstockGasFeePublic();
		}
	}

	// Get default fees for a network when no amount is entered
	function getDefaultNetworkFees(networkValue: string): { serviceFee: number; networkFee: number; totalFees: number; serviceFeePercent?: number } {
		switch (networkValue) {
			case 'lightning-bitcoin':
				return {
					serviceFee: 0, // Percentage-based, shown as percentage
					networkFee: 47, // ~27 lockup + ~20 claim
					totalFees: 47,
					serviceFeePercent: 0.25
				};
			case 'rootstock-bitcoin':
				return {
					serviceFee: 0,
					networkFee: rootstockGasFee ?? 0, // Use real-time estimate, 0 if null (loading)
					totalFees: rootstockGasFee ?? 0
				};
			case 'liquid-bitcoin':
				return {
					serviceFee: 0, // Percentage-based, shown as percentage
					networkFee: 54, // ~34 lockup + ~20 claim
					totalFees: 54,
					serviceFeePercent: 0.1
				};
			case 'bitcoin':
				return {
					serviceFee: 0,
					networkFee: 0, // Determined at send time
					totalFees: 0
				};
			default:
				return { serviceFee: 0, networkFee: 0, totalFees: 0 };
		}
	}

	// Debounced fee update function
	const debouncedUpdateFeeEstimate = debounce(async () => {
		await updateFeeEstimate();
	}, 500); // 500ms debounce

	// Close dropdown using DaisyUI's native details element
	function closeNetworkDropdown() {
		if (networkDropdownElement) {
			networkDropdownElement.removeAttribute('open');
		}
	}

	// Update dropdown state for chevron rotation
	let isNetworkDropdownOpen = $state(false);
	
	function updateNetworkDropdownState() {
		if (networkDropdownElement) {
			isNetworkDropdownOpen = networkDropdownElement.hasAttribute('open');
		}
	}
	
	// Watch for changes to the dropdown's open state
	$effect(() => {
		if (networkDropdownElement) {
			updateNetworkDropdownState();
			// Use MutationObserver to watch for attribute changes
			const observer = new MutationObserver(() => {
				updateNetworkDropdownState();
			});
			observer.observe(networkDropdownElement, {
				attributes: true,
				attributeFilter: ['open']
			});
			return () => observer.disconnect();
		}
	});
	
	function handleNetworkDropdownToggle() {
		triggerHaptic(ImpactStyle.Light);
		// State will be updated by the MutationObserver
	}

	// Fetch BTC price and initialize fees
	onMount(async () => {
		console.log('[RootstockGasFee] Component mounted, selectedNetwork:', selectedNetwork);
		try {
			btcPrice = await cryptoPriceService.getCurrentPrice('BTC');
		} catch (error) {
			console.error('Failed to fetch BTC price:', error);
		}
		await updateFeeEstimate();
		// Estimate Rootstock gas fee on mount so it's available in the dropdown
		if (!hasStartedEstimation && !isEstimatingGasFee && rootstockGasFee === null) {
			hasStartedEstimation = true;
			isEstimatingGasFee = true;
			await estimateRootstockGasFeePublic().finally(() => {
				isEstimatingGasFee = false;
				if (rootstockGasFee === null) {
					hasStartedEstimation = false;
				}
			});
		}
	});

	// Track if estimation is in progress to prevent multiple simultaneous calls
	let isEstimatingGasFee = $state(false);
	// Track if we've already started estimation to prevent reactive loops
	let hasStartedEstimation = $state(false);

	// Update fee estimate when amount or network changes (debounced)
	$effect(() => {
		amountInSats;
		const network = selectedNetwork;
		
		// Reset wallet estimation flag when network changes away from Rootstock
		if (network !== 'rootstock-bitcoin') {
			hasAttemptedWalletEstimation = false;
			lastWalletAddress = null;
		}
		
		if (amountInSats > 0) {
			debouncedUpdateFeeEstimate();
		} else {
			estimatedFees = null;
		}
	});

	// Estimate Rootstock gas fee proactively (only once, or when rootstockGasFee becomes null after error)
	// Watch for rootstockGasFee becoming null (after error) to retry estimation
	$effect(() => {
		const currentGasFee = rootstockGasFee;
		// Only retry if gas fee becomes null (error case) and we're not already estimating
		// This prevents the reactive loop by only tracking rootstockGasFee, not isEstimatingGasFee
		if (currentGasFee === null && !hasStartedEstimation && !isEstimatingGasFee) {
			hasStartedEstimation = true;
			isEstimatingGasFee = true;
			estimateRootstockGasFeePublic().finally(() => {
				isEstimatingGasFee = false;
				if (rootstockGasFee === null) {
					hasStartedEstimation = false;
				}
			});
		}
	});

	// Optionally upgrade to wallet-based estimation when wallet becomes ready (more accurate)
	const isWalletReadyForRootstock = $derived(
		!$walletStore.isInitializing && 
		$walletStore.rsk.connected && 
		$walletStore.rsk.address !== null
	);

	// Track if we've already attempted wallet-based estimation to prevent loops
	let hasAttemptedWalletEstimation = $state(false);
	let lastWalletAddress = $state<string | null>(null);

	$effect(() => {
		const isReady = isWalletReadyForRootstock;
		const network = selectedNetwork;
		const currentAddress = $walletStore.rsk.address;
		const isInitializing = $walletStore.isInitializing;
		const isConnected = $walletStore.rsk.connected;
		
		// Reset flags if wallet disconnects
		if (!isConnected) {
			hasAttemptedWalletEstimation = false;
			lastWalletAddress = null;
			return;
		}
		
		// Skip if wallet is still initializing - wait for it to complete
		if (isInitializing) {
			return;
		}
		
		// Skip if we're already estimating
		if (isEstimatingGasFee) {
			return;
		}
		
		// Only upgrade to wallet-based estimation if:
		// 1. Rootstock is selected
		// 2. Wallet is ready (not initializing, connected, has address)
		// 3. We haven't already attempted estimation for this wallet address
		// 4. The wallet address has changed (new wallet connection)
		if (
			network === 'rootstock-bitcoin' && 
			isReady && 
			currentAddress !== null &&
			(currentAddress !== lastWalletAddress || !hasAttemptedWalletEstimation)
		) {
			hasAttemptedWalletEstimation = true;
			lastWalletAddress = currentAddress;
			isEstimatingGasFee = true;
			estimateRootstockGasFeeWithWallet().finally(() => {
				isEstimatingGasFee = false;
			});
		}
	});

	// Update fee estimate based on network
	async function updateFeeEstimate() {
		if (amountInSats === 0) {
			estimatedFees = null;
			return;
		}

		isLoadingFees = true;
		feeError = null;

		try {
			switch (selectedNetwork) {
				case 'lightning-bitcoin':
					await estimateLightningFees();
					break;
				case 'rootstock-bitcoin':
					await estimateRootstockFees();
					break;
				case 'liquid-bitcoin':
					await estimateLiquidFees();
					break;
				case 'bitcoin':
					// On-chain Bitcoin - minimal fees (just network fees)
					estimatedFees = {
						serviceFee: 0,
						networkFee: 0, // Will be determined at send time
						totalFees: 0
					};
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

	// Estimate fees for Lightning reverse swap
	async function estimateLightningFees() {
		try {
			const pairsData = await walletManager.getReverseSwapPairs();
			const pair = pairsData?.['BTC']?.['RBTC'];

			if (pair) {
				const percentage = pair.fees.percentage;
				const serviceFee = Math.ceil((amountInSats * percentage) / 100);
				const lockupFee = pair.fees.minerFees.lockup || 27;
				const claimFee = pair.fees.minerFees.claim || 20;
				const networkFee = lockupFee + claimFee;

				swapFees = { percentage, lockupFee, claimFee };
				estimatedFees = {
					serviceFee,
					networkFee,
					totalFees: serviceFee + networkFee
				};
			} else {
				// Fallback to default fees
				estimatedFees = {
					serviceFee: Math.ceil((amountInSats * 0.25) / 100), // 0.25%
					networkFee: 47, // ~27 lockup + ~20 claim
					totalFees: Math.ceil((amountInSats * 0.25) / 100) + 47
				};
			}
		} catch (error) {
			console.error('Failed to fetch Lightning swap fees:', error);
			// Fallback
			estimatedFees = {
				serviceFee: Math.ceil((amountInSats * 0.25) / 100),
				networkFee: 47,
				totalFees: Math.ceil((amountInSats * 0.25) / 100) + 47
			};
		}
	}

	// Estimate fees for Rootstock (gas fees)
	async function estimateRootstockFees() {
		try {
			// Don't estimate if wallet is initializing or not connected
			// Use the public gas fee estimate if available, otherwise show loading state
			if ($walletStore.isInitializing || !$walletStore.rsk.connected || !$walletStore.rsk.address) {
				// If we have a public gas fee estimate, use it
				if (rootstockGasFee !== null && rootstockGasFee > 0) {
					estimatedFees = {
						serviceFee: 0,
						networkFee: rootstockGasFee,
						totalFees: rootstockGasFee
					};
				} else {
					estimatedFees = null; // Show loading state
				}
				return;
			}

			// Convert sats to RBTC
			const amountRBTC = (amountInSats / 100_000_000).toFixed(8);
			const gasEstimation = await walletManager.estimateRBTCGas(
				$walletStore.rsk.address,
				amountRBTC
			);

			const gasFeeRBTC = parseFloat(gasEstimation.totalCostFormatted) - parseFloat(amountRBTC);
			const gasFeeSats = Math.floor(gasFeeRBTC * 100_000_000);

			estimatedFees = {
				serviceFee: 0, // No service fee for direct sends
				networkFee: gasFeeSats,
				totalFees: gasFeeSats
			};
		} catch (error) {
			console.error('Failed to estimate Rootstock gas:', error);
			estimatedFees = null; // Show loading/error state instead of fallback
		}
	}

	// Estimate fees for Liquid chain swap
	async function estimateLiquidFees() {
		try {
			const pairsData = await walletManager.getChainSwapPairs();
			const pair = pairsData?.['L-BTC']?.['RBTC'];

			if (pair) {
				const percentage = pair.fees.percentage;
				const serviceFee = Math.ceil((amountInSats * percentage) / 100);
				const lockupFee = pair.fees.minerFees.user?.lockup || 34;
				const claimFee = pair.fees.minerFees.user?.claim || 20;
				const networkFee = lockupFee + claimFee;

				swapFees = { percentage, lockupFee, claimFee };
				estimatedFees = {
					serviceFee,
					networkFee,
					totalFees: serviceFee + networkFee
				};
			} else {
				// Fallback
				estimatedFees = {
					serviceFee: Math.ceil((amountInSats * 0.1) / 100), // 0.1%
					networkFee: 54, // ~34 lockup + ~20 claim
					totalFees: Math.ceil((amountInSats * 0.1) / 100) + 54
				};
			}
		} catch (error) {
			console.error('Failed to fetch Liquid swap fees:', error);
			// Fallback
			estimatedFees = {
				serviceFee: Math.ceil((amountInSats * 0.1) / 100),
				networkFee: 54,
				totalFees: Math.ceil((amountInSats * 0.1) / 100) + 54
			};
		}
	}

	// Handle calculator input
	function handleCalculatorInput(value: string) {
		amount = value;
	}

	// Handle calculation change from calculator (auto-update amount and expression)
	function handleCalculationChange(expression: string, result: number) {
		// Store the math expression
		mathExpression = expression;
		
		// Update amount with the calculated result
		if (result > 0 || expression === '') {
			if (unit === 'sats') {
				amount = Math.floor(result).toString();
			} else {
				amount = result.toFixed(2).replace(/\.?0+$/, '');
			}
		}
	}

	// Clear calculator field
	function handleClearCalculator() {
		triggerHaptic(ImpactStyle.Light);
		amount = '';
		mathExpression = '';
		// Force CalculatorKeypad to reset by changing its key
		calculatorKey++;
	}

	// Format amount in USD
	const amountInUSD = $derived.by(() => {
		if (unit === 'usd') {
			const parsed = parseFloat(amount);
			return isNaN(parsed) ? 0 : parsed;
		} else {
			const sats = parseFloat(amount);
			if (isNaN(sats) || btcPrice === 0) return 0;
			return (sats / 100_000_000) * btcPrice;
		}
	});

	// Format sats with thousand separators
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

	// Validate form
	const isFormValid = $derived.by(() => {
		return amountInSats > 0;
	});

	// Handle invoice generation
	async function handleGenerateInvoice() {
		if (!isFormValid || isGeneratingInvoice) return;

		isGeneratingInvoice = true;
		try {
			let address = '';
			let swapId: string | undefined;

			if (selectedNetwork === 'lightning-bitcoin') {
				// Create Lightning reverse swap
				if (!$walletStore.rsk.connected || !$walletStore.rsk.address) {
					appStore.showErrorToast($t('wallet.rsk_not_connected'));
					return;
				}

				const result = await walletManager.reverseSwapService.createReverseSwap({
					amountSats: Math.floor(amountInSats),
					rbtcAddress: $walletStore.rsk.address,
					walletSigner: $walletStore.rsk.wallet as Signer
				});

				address = result.invoice;
				swapId = result.swapId;
			} else if (selectedNetwork === 'rootstock-bitcoin') {
				// Get RSK address and format as payment URI
				if (!$walletStore.rsk.connected || !$walletStore.rsk.address) {
					appStore.showErrorToast($t('wallet.rsk_not_connected'));
					return;
				}

				address = $walletStore.rsk.address;

				// Add amount and memo as query params
				const params = new URLSearchParams();
				if (amountInSats > 0) {
					// Convert sats to wei: 1 sat = 1e10 wei
					const amountWei = (amountInSats * 1e10).toString();
					params.append('value', amountWei);
				}
				if (memo) {
					params.append('message', memo);
				}

				// Add chain ID for RSK
				const chainId = RSK_NETWORKS[$appStore.network]?.chainId || 31;
				params.append('chainId', chainId.toString());

				if (params.toString()) {
					address += `?${params.toString()}`;
				}
			} else if (selectedNetwork === 'liquid-bitcoin') {
				// Create Liquid chain swap
				if (!$walletStore.rsk.connected || !$walletStore.rsk.address) {
					appStore.showErrorToast($t('wallet.rsk_not_connected'));
					return;
				}

				const result = await walletManager.chainSwapService.createChainSwap({
					amountSats: Math.floor(amountInSats),
					rbtcAddress: $walletStore.rsk.address,
					walletSigner: $walletStore.rsk.wallet as Signer
				});

				address = result.liquidUri || '';
				swapId = result.swapId;
			} else if (selectedNetwork === 'usdt-bsc' || selectedNetwork === 'bsc') {
				// Get BSC address
				if (!$walletStore.bsc.connected || !$walletStore.bsc.address) {
					appStore.showErrorToast($t('wallet.bsc_not_connected'));
					return;
				}

				address = $walletStore.bsc.address;
			} else {
				appStore.showErrorToast($t('wallet.receive_form.network_not_available'));
				return;
			}

			if (!address) {
				appStore.showErrorToast($t('wallet.invoice.generation_failed'));
				return;
			}

			// Set invoice data and show modal
			invoiceData = {
				address,
				amount: Math.floor(amountInSats),
				network: selectedNetwork,
				memo: memo || undefined,
				swapId,
				chargeFeesToPayer,
				totalFees: estimatedFees?.totalFees || 0
			};

			showPaymentRequestModal = true;

			// Call callback if provided
			if (onInvoiceGenerated) {
				onInvoiceGenerated({
					address,
					amount: Math.floor(amountInSats),
					memo: memo || undefined
				});
			}
		} catch (error) {
			console.error('Failed to generate invoice:', error);
			appStore.showErrorToast(
				error instanceof Error ? error.message : $t('wallet.invoice.generation_failed')
			);
		} finally {
			isGeneratingInvoice = false;
		}
	}

	// Reset form
	function handleCancel() {
		amount = '';
		memo = '';
		invoiceGenerated = false;
		onCancel();
	}
</script>

<div class="receive-payment-form space-y-6">
	{#if !invoiceGenerated}
		<!-- Amount Input Section -->
		<AmountInputSection
			{amount}
			{unit}
			{mathExpression}
			{calculatorKey}
			onAmountChange={(value) => (amount = value)}
			onUnitChange={(newUnit) => {
				triggerHaptic(ImpactStyle.Light);
				unit = newUnit;
				amount = '';
				mathExpression = '';
			}}
			onCalculationChange={handleCalculationChange}
			onClear={handleClearCalculator}
		/>

		<!-- Network Selector (DaisyUI Native Dropdown) -->
		<details 
			class="dropdown dropdown-bottom w-full" 
			bind:this={networkDropdownElement}
			use:clickOutside={{ callback: closeNetworkDropdown }}
		>
			<summary
				class="btn btn-outline w-full justify-between border-2 border-primary rounded-lg bg-base-100 py-1 cursor-pointer"
				onclick={handleNetworkDropdownToggle}
				aria-label={$t('wallet.receive_form.select_network')}
			>
				<div class="flex items-center gap-2">
					{#if selectedNetworkInfo?.icon}
						<img
							src={selectedNetworkInfo.icon}
							alt={selectedNetworkInfo.label}
							class="h-5 w-5"
						/>
					{:else if selectedNetworkInfo?.value === 'lightning-bitcoin'}
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-5 w-5 text-yellow-500"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M13 10V3L4 14h7v7l9-11h-7z"
							/>
						</svg>
					{/if}
					<span class="font-medium">
						{selectedNetworkInfo?.label} {$t('wallet.receive.network')}
					</span>
				</div>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-4 w-4 transition-transform duration-200"
					class:rotate-180={isNetworkDropdownOpen}
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="2"
				>
					<path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
				</svg>
			</summary>
			<ul
				class="dropdown-content menu bg-base-100 rounded-lg w-full p-2 border-2 border-primary mt-1 z-[1]"
				style="box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);"
			>
				{#each networkOptions as network}
					{@const networkFees = getNetworkFees(network.value)}
					{@const defaultFees = getDefaultNetworkFees(network.value)}
					<li>
						<button
							type="button"
							class="flex w-full items-start gap-2 p-1 rounded-lg transition-colors {!network.available ? 'opacity-40 cursor-not-allowed' : 'hover:bg-base-200'} {selectedNetwork === network.value ? 'bg-primary/10' : ''}"
							disabled={!network.available}
							onclick={() => {
								if (network.available) {
									triggerHaptic(ImpactStyle.Light);
									console.log('[RootstockGasFee] Network selected:', network.value);
									selectedNetwork = network.value;
									closeNetworkDropdown();
									console.log('[RootstockGasFee] selectedNetwork updated to:', selectedNetwork);
								}
							}}
						>
							<div class="flex items-center self-center">
								{#if network.icon}
									<img src={network.icon} alt={network.label} class="h-5 w-5" />
								{:else if network.value === 'lightning-bitcoin'}
									<svg
										xmlns="http://www.w3.org/2000/svg"
										class="h-5 w-5 text-yellow-500"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M13 10V3L4 14h7v7l9-11h-7z"
										/>
									</svg>
								{/if}
							</div>
							<div class="flex-1 flex flex-col items-start gap-1 min-w-0">
								<div class="flex w-full items-center gap-2">
									<span class="font-medium text-left">
										{network.label} {$t('wallet.receive.network')}
									</span>
								</div>
								{#if !network.available}
									<!-- Show "Coming Soon" for disabled networks -->
									<div class="text-xs opacity-70">
										{$t('wallet.coming_soon')}
									</div>
								{:else if networkFees && amountInSats > 0}
									<!-- Show estimated fees when amount is entered -->
									<div class="text-xs opacity-70">
										<span>{formatSats(networkFees.totalFees)} {$t('wallet.sats')}</span>
										{#if btcPrice > 0 && networkFees.totalFees > 0}
											<span class="ml-1">
												≈ {formatUSD((networkFees.totalFees / 100_000_000) * btcPrice)}
											</span>
										{/if}
									</div>
								{:else if network.value === 'lightning-bitcoin'}
									<!-- Lightning: Show fee info on one line -->
									<div class="text-xs opacity-70">
										~0.25% {$t('wallet.swap.swap_fee')} + ~{formatSats(47)} {$t('wallet.sats')} {$t('wallet.network_fee')}
									</div>
								{:else if network.value === 'rootstock-bitcoin'}
									<!-- Rootstock: Show real-time gas fee estimate (always show, even if not selected) -->
									<div class="text-xs opacity-70">
										{#if rootstockGasFee !== null}
											{formatSats(rootstockGasFee)} {$t('wallet.sats')} {$t('wallet.network_fee')}
											{#if btcPrice > 0}
												<span class="ml-1">
													≈ {formatUSD((rootstockGasFee / 100_000_000) * btcPrice)}
												</span>
											{/if}
										{:else}
											<span class="loading loading-spinner loading-xs"></span>
											{$t('wallet.swap.loading_fees')}
										{/if}
									</div>
								{:else}
									<!-- Show default fees for other networks when no amount is entered -->
									<div class="text-xs opacity-70 space-y-0.5">
										{#if defaultFees.serviceFeePercent}
											<div>
												~{defaultFees.serviceFeePercent}% {$t('wallet.swap.service_fee')}
											</div>
										{/if}
										{#if defaultFees.networkFee > 0}
											<div>
												{formatSats(defaultFees.networkFee)} {$t('wallet.sats')} {$t('wallet.network_fee')}
												{#if btcPrice > 0}
													<span class="ml-1">
														≈ {formatUSD((defaultFees.networkFee / 100_000_000) * btcPrice)}
													</span>
												{/if}
											</div>
										{:else if network.value === 'bitcoin'}
											<div>
												{$t('wallet.network_fee')} ({$t('wallet.receive.enter_amount_to_estimate')})
											</div>
										{/if}
									</div>
								{/if}
							</div>
						</button>
					</li>
				{/each}
			</ul>
		</details>

		<!-- Memo/Description Field (Accordion) -->
		<div class="collapse collapse-arrow border-2 border-primary rounded-lg bg-base-100" class:collapse-open={descriptionExpanded}>
			<button
				type="button"
				class="collapse-title min-h-0 py-1 px-4 font-medium text-left"
				onclick={() => {
					triggerHaptic(ImpactStyle.Light);
					descriptionExpanded = !descriptionExpanded;
				}}
			>
				{$t('wallet.description')} ({$t('wallet.optional')})
			</button>
			<div class="collapse-content">
				<div class="form-control pt-2 pb-4 px-4">
					<textarea
						id="memo-input"
						class="textarea textarea-bordered w-full"
						class:textarea-error={memo.length > 200}
						placeholder={$t('wallet.payment_for_placeholder')}
						bind:value={memo}
						rows="3"
						maxlength="200"
					></textarea>
					<div class="label">
						<span class="label-text-alt {memo.length > 200 ? 'text-error' : 'text-base-content/70'}">
							{memo.length}/200 {$t('wallet.receive.description_characters')}
						</span>
					</div>
				</div>
			</div>
		</div>

		<!-- Network Fee Accordion (Always Visible) -->
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

		<!-- Charge Fees to Payer Toggle (Always Visible) -->
		{#if estimatedFees && estimatedFees.totalFees > 0}
			<button
				type="button"
				class="btn w-full justify-center items-center gap-3 py-2 min-h-0 h-auto touch-manipulation select-none transition-colors border-2 border-primary rounded-lg {chargeFeesToPayer ? 'bg-primary text-primary-content hover:bg-primary/90' : 'btn-outline bg-base-100'}"
				style="-webkit-tap-highlight-color: transparent;"
				onclick={() => {
					triggerHaptic(ImpactStyle.Light);
					chargeFeesToPayer = !chargeFeesToPayer;
				}}
			>
				<div class="flex items-center justify-center w-5 h-5 rounded border-2 {chargeFeesToPayer ? 'border-primary-content bg-primary-content' : 'border-base-content/30'}">
					{#if chargeFeesToPayer}
						<IconCheck class="w-4 h-4 text-primary" style="stroke: currentColor; stroke-width: 1.5; fill: currentColor;" />
					{/if}
				</div>
				<span class="label-text">{$t('wallet.receive.charge_fees_to_payer')}</span>
			</button>
		{:else}
			<button
				type="button"
				class="btn btn-outline w-full justify-center items-center gap-3 py-2 min-h-0 h-auto opacity-50 cursor-not-allowed border-2 border-primary rounded-lg"
				disabled
			>
				<div class="flex items-center justify-center w-5 h-5 rounded border-2 border-base-content/30">
				</div>
				<span class="label-text">{$t('wallet.receive.charge_fees_to_payer')}</span>
			</button>
		{/if}

		<!-- Total Received Card -->
		<div class="flex flex-col items-center gap-2 rounded-lg border-2 border-primary bg-base-200 p-2">
			<span class="text-sm opacity-70 text-center">{$t('wallet.swap.total_received_est')}</span>
			{#if totalReceived > 0 && estimatedFees}
				<div class="flex items-center justify-center gap-2 w-full">
					{#if unit === 'sats'}
						<span class="text-2xl font-bold text-primary">
							{formatSats(totalReceived)} {$t('wallet.sats')}
						</span>
						{#if btcPrice > 0}
							<span class="text-sm opacity-60">
								≈ {formatUSD(totalReceivedUSD)}
							</span>
						{/if}
					{:else}
						<span class="text-2xl font-bold text-primary">
							{formatUSD(totalReceivedUSD)}
						</span>
						{#if btcPrice > 0}
							<span class="text-sm opacity-60">
								≈ {formatSats(totalReceived)} {$t('wallet.sats')}
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
					handleCancel();
				}}
			>
				<IconClose class="w-5 h-5" />
				{$t('wallet.receive.cancel')}
			</button>
			<button
				class="btn btn-primary flex-1 min-h-[48px] md:min-h-[56px] touch-manipulation select-none active:scale-95 transition-transform duration-100"
				style="-webkit-tap-highlight-color: transparent;"
				onclick={() => {
					triggerHaptic(ImpactStyle.Medium);
					handleGenerateInvoice();
				}}
				disabled={!isFormValid || isLoadingFees || $walletStore.isInitializing || isGeneratingInvoice}
			>
				{#if isLoadingFees || $walletStore.isInitializing || isGeneratingInvoice}
					<span class="loading loading-spinner loading-sm"></span>
				{:else}
					<IconCashMultiple class="w-5 h-5" />
					{$t('wallet.receive.get_paid')}
				{/if}
			</button>
		</div>

		<!-- Wallet Initialization Message (Bottom) -->
		{#if $walletStore.isInitializing}
			<div class="flex items-center justify-center gap-2 py-2 px-4 bg-base-200 rounded-lg border border-base-300">
				<span class="loading loading-spinner loading-xs"></span>
				<span class="text-sm text-base-content/70">{$t('wallet.initializing')}</span>
			</div>
		{/if}
{/if}

<!-- Payment Request Modal -->
{#if invoiceData}
	<PaymentRequestModal
		isOpen={showPaymentRequestModal}
		amount={invoiceData.amount}
		network={invoiceData.network}
		memo={invoiceData.memo}
		address={invoiceData.address}
		swapId={invoiceData.swapId}
		chargeFeesToPayer={invoiceData.chargeFeesToPayer}
		totalFees={invoiceData.totalFees}
		onClose={() => {
			showPaymentRequestModal = false;
			// Optionally reset form or keep it
			// invoiceData = null;
		}}
		onEdit={() => {
			showPaymentRequestModal = false;
			// Form data is already preserved in amount, memo, selectedNetwork, etc.
			// The modal will close and user can edit the form
		}}
	/>
{/if}
</div>


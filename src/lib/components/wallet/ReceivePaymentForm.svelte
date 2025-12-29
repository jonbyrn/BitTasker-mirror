<script lang="ts">
	import { t } from 'svelte-i18n';
	import { onMount } from 'svelte';
	import { walletStore, walletManager, formatSats, formatUsd } from '$lib/stores/wallet.store';
	import { appStore } from '$lib/stores/app.store';
	import { triggerHaptic, ImpactStyle } from '$lib/utils/helpers/haptics';
	import { debounce } from '$lib/utils/helpers/common';
	import { RSK_NETWORKS } from '$lib/utils/wallet/networkConfig';
	import { clickOutside } from '$lib/utils/clickOutside';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';
	import AmountInputSection from '$lib/components/wallet/AmountInputSection.svelte';
	import IconCashMultiple from '~icons/mdi/cash-multiple';
	import IconClose from '~icons/mdi/close';
	import IconCheck from '~icons/mdi/check';

	let { onCancel, onOpenPaymentRequest } = $props<{
		onCancel: () => void;
		onOpenPaymentRequest: (data: {
			swapId?: string;
			address: string;
			amount: number;
			memo?: string;
			network?: string;
			chargeFeesToPayer?: boolean;
			totalFees?: number;
		}) => void; // Callback to parent to open modal with either swap or direct payment data
	}>();

	// Grouped State: Form Input
	let formInput = $state({
		amount: '',
		unit: 'usd' as 'sats' | 'usd',
		mathExpression: '',
		memo: '',
		selectedNetwork: 'lightning-bitcoin',
		chargeFeesToPayer: false
	});

	// Grouped State: UI State
	let uiState = $state({
		descriptionExpanded: false,
		networkFeeExpanded: false,
		isNetworkDropdownOpen: false,
		calculatorKey: 0
	});

	// Grouped State: Fee & Swap Information
	let feeState = $state<{
		estimated: {
			serviceFee: number;
			networkFee: number;
			totalFees: number;
		} | null;
		isLoading: boolean;
		error: string | null;
		swapFees: {
			percentage: number;
			lockupFee: number;
			claimFee: number;
		} | null;
		swapLimits: {
			minimal: number;
			maximal: number;
		} | null;
	}>({
		estimated: null,
		isLoading: false,
		error: null,
		swapFees: null,
		swapLimits: null
	});

	// Invoice generation state (simplified)
	let isGenerating = $state(false);

	// Cached data (fetched once on mount)
	let btcPrice = $state<number>(0);
	let swapPairsInfo = $state<{
		lightning: any;
		liquid: any;
		rootstock: { gasFee: number } | null;
	} | null>(null);

	// UI References
	let networkDropdownElement = $state.raw<HTMLDetailsElement | undefined>(undefined);

	// Derived values
	const amountInSats = $derived.by(() => {
		if (formInput.unit === 'sats') {
			const parsed = parseFloat(formInput.amount);
			return isNaN(parsed) ? 0 : Math.floor(parsed);
		} else {
			const usdAmount = parseFloat(formInput.amount);
			if (isNaN(usdAmount) || btcPrice === 0) return 0;
			return Math.floor((usdAmount / btcPrice) * 100_000_000);
		}
	});

	const totalReceived = $derived.by(() => {
		if (!feeState.estimated || amountInSats === 0) return 0;
		// If charging fees to payer, receiver gets full amount; otherwise fees are deducted
		if (formInput.chargeFeesToPayer) {
			return amountInSats;
		}
		return Math.max(0, amountInSats - feeState.estimated.totalFees);
	});

	// Amount payer will pay (includes fees if chargeFeesToPayer is true)
	const amountPayerPays = $derived.by(() => {
		if (!feeState.estimated || amountInSats === 0) return 0;
		if (formInput.chargeFeesToPayer) {
			return amountInSats + feeState.estimated.totalFees;
		}
		return amountInSats;
	});

	// Check if amount is below swap minimum (for networks that require swaps)
	const isBelowSwapMinimum = $derived.by(() => {
		// Only check for networks that require swaps (not rootstock)
		const networksRequiringSwaps = ['lightning-bitcoin', 'liquid-bitcoin', 'bitcoin'];
		if (!networksRequiringSwaps.includes(formInput.selectedNetwork)) return false;
		if (!feeState.swapLimits || amountPayerPays === 0) return false;
		return amountPayerPays < feeState.swapLimits.minimal;
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
			available: $walletStore.isConnected,
			swapFeeInfo: '~0.25% swap fee' // Lightning reverse swap fee
		},
		{
			value: 'rootstock-bitcoin',
			label: $t('wallet.receive_form.networks.rootstock_bitcoin.label'),
			description: $t('wallet.receive_form.networks.rootstock_bitcoin.description'),
			icon: '/images/chains/Bitcoin-Rootstock-logo.webp',
			available: $walletStore.isConnected,
			swapFeeInfo: 'Network gas fee' // RSK gas fee
		},
		{
			value: 'liquid-bitcoin',
			label: $t('wallet.receive_form.networks.liquid_bitcoin.label'),
			description: $t('wallet.receive_form.networks.liquid_bitcoin.description'),
			icon: '/images/chains/Liquid-Bitcoin.svg',
			available: $walletStore.isConnected,
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
		networkOptions.find((network) => network.value === formInput.selectedNetwork)
	);

	// Get estimated fees for a specific network (for dropdown display)
	// Only shows fees if this network is currently selected and amount is entered
	function getNetworkFees(
		networkValue: string
	): { serviceFee: number; networkFee: number; totalFees: number } | null {
		if (amountInSats === 0 || formInput.selectedNetwork !== networkValue || !feeState.estimated) {
			return null;
		}
		return feeState.estimated;
	}

	// Debounced fee update function
	const debouncedUpdateFeeEstimate = debounce(async () => {
		await updateFeeEstimate();
	}, 500); // 500ms debounce

	// Close dropdown using DaisyUI's native details element
	function closeNetworkDropdown() {
		if (networkDropdownElement) {
			networkDropdownElement.removeAttribute('open');
			uiState.isNetworkDropdownOpen = false;
		}
	}

	// Handle dropdown toggle - update state manually
	function handleNetworkDropdownToggle() {
		triggerHaptic(ImpactStyle.Light);
		// Toggle state based on current element state
		if (networkDropdownElement) {
			uiState.isNetworkDropdownOpen = !networkDropdownElement.hasAttribute('open');
		}
	}

	// Fetch BTC price and initialize swap pairs info
	onMount(async () => {
		try {
			// Fetch BTC price
			btcPrice = await cryptoPriceService.getCurrentPrice('BTC');

			// Fetch and cache swap pairs for dropdown display
			// These are cached with 1-hour TTL, so subsequent calls are fast
			const [lightning, liquid] = await Promise.all([
				walletManager.getCachedReverseSwapPairs().catch(() => null),
				walletManager.getCachedChainSwapPairs().catch(() => null)
			]);

			// Estimate Rootstock gas fee (wallet is always connected at this point)
			let rootstockGas: { gasFee: number } | null = null;
			if ($walletStore.rsk.connected && $walletStore.rsk.address) {
				try {
					const gasEstimation = await walletManager.estimateRBTCGas(
						$walletStore.rsk.address,
						'0.0001' // Small amount for estimation
					);
					const gasFeeRBTC = parseFloat(gasEstimation.totalCostFormatted) - 0.0001;
					const gasFeeSats = Math.floor(gasFeeRBTC * 100_000_000);
					if (gasFeeSats > 0) {
						rootstockGas = { gasFee: gasFeeSats };
					}
				} catch (error) {
					console.error('Failed to estimate Rootstock gas:', error);
				}
			}

			swapPairsInfo = {
				lightning: lightning?.['BTC']?.['RBTC'] || null,
				liquid: liquid?.['L-BTC']?.['RBTC'] || null,
				rootstock: rootstockGas
			};
		} catch (error) {
			console.error('Failed to initialize receive form:', error);
		}
	});

	// Manual fee update - called when amount or network changes
	function handleAmountOrNetworkChange() {
		if (amountInSats > 0) {
			debouncedUpdateFeeEstimate();
		} else {
			feeState.estimated = null;
			feeState.swapLimits = null;
		}
	}

	// Update fee estimate based on network
	async function updateFeeEstimate() {
		if (amountInSats === 0) {
			feeState.estimated = null;
			feeState.swapLimits = null;
			return;
		}

		feeState.isLoading = true;
		feeState.error = null;

		try {
			switch (formInput.selectedNetwork) {
				case 'lightning-bitcoin':
					await estimateLightningFees();
					break;
				case 'rootstock-bitcoin':
					await estimateRootstockFees();
					feeState.swapLimits = null; // Rootstock doesn't need swap limits
					break;
				case 'liquid-bitcoin':
					await estimateLiquidFees();
					break;
				case 'bitcoin':
					// On-chain Bitcoin - minimal fees (just network fees)
					feeState.estimated = {
						serviceFee: 0,
						networkFee: 0, // Will be determined at send time
						totalFees: 0
					};
					// TODO: Fetch swap limits for on-chain Bitcoin if it requires swaps
					feeState.swapLimits = null;
					break;
				default:
					feeState.estimated = null;
					feeState.swapLimits = null;
			}
		} catch (error) {
			console.error('Failed to estimate fees:', error);
			feeState.error = $t('wallet.swap.error.fee_fetch_failed');
			feeState.estimated = null;
			feeState.swapLimits = null;
		} finally {
			feeState.isLoading = false;
		}
	}

	// Estimate fees for Lightning reverse swap
	async function estimateLightningFees() {
		const pairsData = await walletManager.getCachedReverseSwapPairs();
		const pair = pairsData?.['BTC']?.['RBTC'];

		if (!pair) {
			throw new Error('Lightning swap pair not available');
		}

		const percentage = pair.fees.percentage;
		const serviceFee = Math.ceil((amountInSats * percentage) / 100);
		const lockupFee = pair.fees.minerFees.lockup || 0;
		const claimFee = pair.fees.minerFees.claim || 0;
		const networkFee = lockupFee + claimFee;

		feeState.swapFees = { percentage, lockupFee, claimFee };
		feeState.estimated = {
			serviceFee,
			networkFee,
			totalFees: serviceFee + networkFee
		};

		// Update swap limits
		if (pair.limits) {
			feeState.swapLimits = {
				minimal: pair.limits.minimal,
				maximal: pair.limits.maximal
			};
		}
	}

	// Estimate fees for Rootstock (gas fees)
	async function estimateRootstockFees() {
		// Wallet is always connected at this point
		if (!$walletStore.rsk.address) {
			throw new Error('RSK wallet address not available');
		}

		// Convert sats to RBTC
		const amountRBTC = (amountInSats / 100_000_000).toFixed(8);
		const gasEstimation = await walletManager.estimateRBTCGas($walletStore.rsk.address, amountRBTC);

		const gasFeeRBTC = parseFloat(gasEstimation.totalCostFormatted) - parseFloat(amountRBTC);
		const gasFeeSats = Math.floor(gasFeeRBTC * 100_000_000);

		feeState.estimated = {
			serviceFee: 0, // No service fee for direct sends
			networkFee: gasFeeSats,
			totalFees: gasFeeSats
		};
		feeState.swapLimits = null; // Rootstock doesn't need swap limits
	}

	// Estimate fees for Liquid chain swap
	async function estimateLiquidFees() {
		const pairsData = await walletManager.getCachedChainSwapPairs();
		const pair = pairsData?.['L-BTC']?.['RBTC'];

		if (!pair) {
			throw new Error('Liquid swap pair not available');
		}

		const percentage = pair.fees.percentage;
		const serviceFee = Math.ceil((amountInSats * percentage) / 100);
		const lockupFee = pair.fees.minerFees.user?.lockup || 0;
		const claimFee = pair.fees.minerFees.user?.claim || 0;
		const networkFee = lockupFee + claimFee;

		feeState.swapFees = { percentage, lockupFee, claimFee };
		feeState.estimated = {
			serviceFee,
			networkFee,
			totalFees: serviceFee + networkFee
		};

		// Update swap limits
		if (pair.limits) {
			feeState.swapLimits = {
				minimal: pair.limits.minimal,
				maximal: pair.limits.maximal
			};
		}
	}

	// Handle calculation change from calculator (auto-update amount and expression)
	function handleCalculationChange(expression: string, result: number) {
		// Store the math expression
		formInput.mathExpression = expression;

		// Update amount with the calculated result
		if (result > 0 || expression === '') {
			if (formInput.unit === 'sats') {
				formInput.amount = Math.floor(result).toString();
			} else {
				formInput.amount = result.toFixed(2).replace(/\.?0+$/, '');
			}
		}

		// Trigger fee update when amount changes
		handleAmountOrNetworkChange();
	}

	// Clear calculator field
	function handleClearCalculator() {
		triggerHaptic(ImpactStyle.Light);
		formInput.amount = '';
		formInput.mathExpression = '';
		// Clear network fee estimate when amount is cleared
		feeState.estimated = null;
		// Force CalculatorKeypad to reset by changing its key
		uiState.calculatorKey++;
	}

	// Validate form
	const isFormValid = $derived.by(() => {
		return amountInSats > 0;
	});

	// Handle invoice generation
	async function handleGenerateInvoice() {
		if (!isFormValid || isGenerating) return;

		isGenerating = true;
		try {
			if (formInput.selectedNetwork === 'lightning-bitcoin') {
				// Create Lightning reverse swap
				if (!$walletStore.rsk.connected || !$walletStore.rsk.address) {
					appStore.showErrorToast($t('wallet.rsk_not_connected'));
					return;
				}

				const result = await walletManager.createReverseSwap(Math.floor(amountInSats));

				// Call parent callback with swap data
				onOpenPaymentRequest({ swapId: result.swapId });
				onCancel(); // Close the receive form
			} else if (formInput.selectedNetwork === 'rootstock-bitcoin') {
				// Rootstock direct payment - generate address with payment URI
				if (!$walletStore.rsk.connected || !$walletStore.rsk.address) {
					appStore.showErrorToast($t('wallet.rsk_not_connected'));
					return;
				}

				let address = $walletStore.rsk.address;

				// Add amount and memo as query params
				const params = new URLSearchParams();
				if (amountInSats > 0) {
					// Convert sats to wei: 1 sat = 1e10 wei
					const amountWei = (amountInSats * 1e10).toString();
					params.append('value', amountWei);
				}
				if (formInput.memo) {
					params.append('message', formInput.memo);
				}

				// Add chain ID for RSK
				const chainId = RSK_NETWORKS[$appStore.network]?.chainId || 31;
				params.append('chainId', chainId.toString());

				if (params.toString()) {
					address += `?${params.toString()}`;
				}

				// Call parent callback with direct payment data
				onOpenPaymentRequest({
					address,
					network: 'rootstock-bitcoin',
					amount: Math.floor(amountInSats),
					memo: formInput.memo || undefined,
					chargeFeesToPayer: formInput.chargeFeesToPayer,
					totalFees: feeState.estimated?.totalFees
				});
				onCancel(); // Close the receive form
			} else if (formInput.selectedNetwork === 'liquid-bitcoin') {
				// Create Liquid chain swap
				if (!$walletStore.rsk.connected || !$walletStore.rsk.address) {
					appStore.showErrorToast($t('wallet.rsk_not_connected'));
					return;
				}

				const result = await walletManager.createChainSwap(Math.floor(amountInSats));

				// Call parent callback with swap data
				onOpenPaymentRequest({ swapId: result.swapId });
				onCancel(); // Close the receive form
			} else {
				appStore.showErrorToast($t('wallet.receive_form.network_not_available'));
				return;
			}
		} catch (error) {
			console.error('Failed to generate invoice:', error);
			appStore.showErrorToast(
				error instanceof Error ? error.message : $t('wallet.invoice.generation_failed')
			);
		} finally {
			isGenerating = false;
		}
	}

	// Reset form
	function handleCancel() {
		formInput.amount = '';
		formInput.memo = '';
		onCancel();
	}
</script>

<div class="flex min-h-full flex-col space-y-4 sm:space-y-6">
	<!-- Amount Input Section -->
	<AmountInputSection
		amount={formInput.amount}
		unit={formInput.unit}
		mathExpression={formInput.mathExpression}
		calculatorKey={uiState.calculatorKey}
		onAmountChange={(value) => (formInput.amount = value)}
		onUnitChange={(newUnit) => {
			triggerHaptic(ImpactStyle.Light);
			formInput.unit = newUnit;
			// Keep amount when switching units - user may have entered amount before selecting unit
			formInput.mathExpression = '';
			// Don't increment calculatorKey - preserve calculator state and amount
			// Trigger fee update when unit changes (amount in sats might change)
			handleAmountOrNetworkChange();
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
			class="btn btn-outline border-primary bg-base-100 w-full cursor-pointer justify-between rounded-lg border-2 py-0.5 text-sm sm:py-1 sm:text-base"
			onclick={handleNetworkDropdownToggle}
			aria-label={$t('wallet.receive_form.select_network')}
		>
			<div class="flex items-center gap-1.5 sm:gap-2">
				{#if selectedNetworkInfo?.icon}
					<img
						src={selectedNetworkInfo.icon}
						alt={selectedNetworkInfo.label}
						class="h-4 w-4 sm:h-5 sm:w-5"
					/>
				{:else if selectedNetworkInfo?.value === 'lightning-bitcoin'}
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-4 w-4 text-yellow-500 sm:h-5 sm:w-5"
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
					{selectedNetworkInfo?.label}
					{$t('wallet.receive.network')}
				</span>
			</div>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-3.5 w-3.5 transition-transform duration-200 sm:h-4 sm:w-4"
				class:rotate-180={uiState.isNetworkDropdownOpen}
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="2"
			>
				<path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
			</svg>
		</summary>
		<ul
			class="dropdown-content menu bg-base-100 border-primary z-1 mt-1 w-full rounded-lg border-2 p-1.5 sm:p-2"
			style="box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);"
		>
			{#each networkOptions as network}
				{@const networkFees = getNetworkFees(network.value)}
				<li>
					<button
						type="button"
						class="flex w-full items-start gap-1.5 rounded-lg p-0.5 transition-colors sm:gap-2 sm:p-1 {!network.available
							? 'cursor-not-allowed opacity-40'
							: 'hover:bg-base-200'} {formInput.selectedNetwork === network.value
							? 'bg-primary/10'
							: ''}"
						disabled={!network.available}
						onclick={() => {
							if (network.available) {
								triggerHaptic(ImpactStyle.Light);
								formInput.selectedNetwork = network.value;
								closeNetworkDropdown();
								// Trigger fee update when network changes
								handleAmountOrNetworkChange();
							}
						}}
					>
						<div class="flex items-center self-center">
							{#if network.icon}
								<img src={network.icon} alt={network.label} class="h-4 w-4 sm:h-5 sm:w-5" />
							{:else if network.value === 'lightning-bitcoin'}
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="h-4 w-4 text-yellow-500 sm:h-5 sm:w-5"
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
						<div class="flex min-w-0 flex-1 flex-col items-start gap-0.5 sm:gap-1">
							<div class="flex w-full items-center gap-1.5 sm:gap-2">
								<span class="text-left text-sm font-medium sm:text-base">
									{network.label}
									{$t('wallet.receive.network')}
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
											≈ {formatUsd((networkFees.totalFees / 100_000_000) * btcPrice)}
										</span>
									{/if}
								</div>
							{:else if network.value === 'lightning-bitcoin' && swapPairsInfo?.lightning}
								<!-- Lightning: Show fee info from cached API data (abbreviated on mobile) -->
								<div class="text-xs opacity-70">
									<span class="hidden sm:inline"
										>~{swapPairsInfo.lightning.fees.percentage}% {$t('wallet.swap.swap_fee')} +
									</span>~{formatSats(
										(swapPairsInfo.lightning.fees.minerFees.lockup || 0) +
											(swapPairsInfo.lightning.fees.minerFees.claim || 0)
									)}
									{$t('wallet.sats')}
									<span class="hidden sm:inline">{$t('wallet.network_fee')}</span>
								</div>
							{:else if network.value === 'rootstock-bitcoin' && swapPairsInfo?.rootstock}
								<!-- Rootstock: Show gas fee from cached estimate -->
								<div class="text-xs opacity-70">
									{formatSats(swapPairsInfo.rootstock.gasFee)}
									{$t('wallet.sats')}
									<span class="hidden sm:inline">{$t('wallet.network_fee')}</span>
									{#if btcPrice > 0}
										<span class="ml-1">
											≈ {formatUsd((swapPairsInfo.rootstock.gasFee / 100_000_000) * btcPrice)}
										</span>
									{/if}
								</div>
							{:else if network.value === 'liquid-bitcoin' && swapPairsInfo?.liquid}
								<!-- Liquid: Show fee info from cached API data (abbreviated on mobile) -->
								<div class="text-xs opacity-70">
									<span class="hidden sm:inline"
										>~{swapPairsInfo.liquid.fees.percentage}% {$t('wallet.swap.swap_fee')} +
									</span>~{formatSats(
										(swapPairsInfo.liquid.fees.minerFees.user?.lockup || 0) +
											(swapPairsInfo.liquid.fees.minerFees.user?.claim || 0)
									)}
									{$t('wallet.sats')}
									<span class="hidden sm:inline">{$t('wallet.network_fee')}</span>
								</div>
							{:else if network.value === 'bitcoin'}
								<!-- Bitcoin on-chain: Show placeholder -->
								<div class="text-xs opacity-70">
									{$t('wallet.network_fee')}
								</div>
							{:else}
								<!-- Loading state -->
								<div class="text-xs opacity-70">
									<span class="loading loading-spinner loading-xs"></span>
									<span class="hidden sm:inline">{$t('wallet.swap.loading_fees')}</span>
								</div>
							{/if}
						</div>
					</button>
				</li>
			{/each}
		</ul>
	</details>

	<!-- Memo/Description Field (Accordion) -->
	<div
		class="collapse-arrow border-primary bg-base-100 collapse rounded-lg border-2"
		class:collapse-open={uiState.descriptionExpanded}
	>
		<button
			type="button"
			class="collapse-title min-h-0 px-3 py-1 text-left text-sm font-medium sm:px-4 sm:text-base"
			onclick={() => {
				triggerHaptic(ImpactStyle.Light);
				uiState.descriptionExpanded = !uiState.descriptionExpanded;
			}}
		>
			{$t('wallet.description')} ({$t('wallet.optional')})
		</button>
		<div class="collapse-content">
			<div class="form-control">
				<textarea
					id="memo-input"
					class="textarea textarea-bordered w-full text-sm sm:text-base"
					class:textarea-error={formInput.memo.length > 200}
					placeholder={$t('wallet.payment_for_placeholder')}
					bind:value={formInput.memo}
					rows="3"
					maxlength="200"
				></textarea>
				<div class="label text-xs">
					<span
						class="label-text-alt {formInput.memo.length > 200
							? 'text-error'
							: 'text-base-content/70'}"
					>
						{formInput.memo.length}/200 {$t('wallet.receive.description_characters')}
					</span>
				</div>
			</div>
		</div>
	</div>

	<!-- Network Fee Accordion (Always Visible) -->
	{#if feeState.isLoading}
		<div
			class="border-base-300 bg-base-200 flex items-center justify-center gap-2 rounded-lg border p-2 sm:p-4"
		>
			<span class="loading loading-spinner loading-sm"></span>
			<span class="text-xs sm:text-sm">{$t('wallet.swap.loading_fees')}</span>
		</div>
	{:else if feeState.error}
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
				class="collapse-title min-h-0 px-3 py-1 text-left text-sm font-medium sm:px-4 sm:text-base"
				onclick={() => {
					triggerHaptic(ImpactStyle.Light);
					uiState.networkFeeExpanded = !uiState.networkFeeExpanded;
				}}
			>
				<div class="flex w-full items-center gap-1.5 sm:gap-2">
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
			<div class="collapse-content pb-0">
				<div class="space-y-1.5 px-3 pb-1.5 sm:space-y-2 sm:px-4 sm:pb-2">
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
							{$t('wallet.receive.enter_amount_to_estimate')}
						</div>
					{/if}
				</div>
			</div>
		</div>
	{/if}

	<!-- Charge Fees to Payer Toggle (Always Visible) -->
	{#if feeState.estimated && feeState.estimated.totalFees > 0}
		<button
			type="button"
			class="btn border-primary h-auto min-h-0 w-full touch-manipulation items-center justify-center gap-2 rounded-lg border-2 py-1.5 text-sm transition-colors select-none sm:gap-3 sm:py-2 sm:text-base {formInput.chargeFeesToPayer
				? 'bg-primary text-primary-content hover:bg-primary/90'
				: 'btn-outline bg-base-100'}"
			style="-webkit-tap-highlight-color: transparent;"
			onclick={() => {
				triggerHaptic(ImpactStyle.Light);
				formInput.chargeFeesToPayer = !formInput.chargeFeesToPayer;
			}}
		>
			<div
				class="flex h-4 w-4 items-center justify-center rounded border-2 sm:h-5 sm:w-5 {formInput.chargeFeesToPayer
					? 'border-primary-content bg-primary-content'
					: 'border-base-content/30'}"
			>
				{#if formInput.chargeFeesToPayer}
					<IconCheck
						class="text-primary h-3.5 w-3.5 sm:h-4 sm:w-4"
						style="stroke: currentColor; stroke-width: 1.5; fill: currentColor;"
					/>
				{/if}
			</div>
			<span class="label-text">{$t('wallet.receive.charge_fees_to_payer')}</span>
		</button>
	{:else}
		<button
			type="button"
			class="btn btn-outline border-primary h-auto min-h-0 w-full cursor-not-allowed items-center justify-center gap-2 rounded-lg border-2 py-1.5 text-sm opacity-50 sm:gap-3 sm:py-2 sm:text-base"
			disabled
		>
			<div
				class="border-base-content/30 flex h-4 w-4 items-center justify-center rounded border-2 sm:h-5 sm:w-5"
			></div>
			<span class="label-text">{$t('wallet.receive.charge_fees_to_payer')}</span>
		</button>
	{/if}

	<!-- Swap Minimum Warning -->
	{#if isBelowSwapMinimum && feeState.swapLimits}
		<p class="text-error mb-0.5 text-center text-xs sm:mb-1 sm:text-sm">
			{$t('wallet.receive.below_swap_minimum', {
				values: { minAmount: formatSats(feeState.swapLimits.minimal) }
			})}
		</p>
	{/if}

	<!-- Total Received Card -->
	<div
		class="border-primary bg-base-200 flex flex-col items-center gap-1.5 rounded-lg border-2 p-1.5 sm:gap-2 sm:p-2"
	>
		<span class="text-center text-xs opacity-70 sm:text-sm"
			>{$t('wallet.swap.total_received_est')}</span
		>
		{#if totalReceived > 0 && feeState.estimated}
			<div class="flex w-full items-center justify-center gap-1.5 sm:gap-2">
				{#if formInput.unit === 'sats'}
					<span class="text-primary text-xl font-bold sm:text-2xl">
						{formatSats(totalReceived)}
						{$t('wallet.sats')}
					</span>
					{#if btcPrice > 0}
						<span class="text-xs opacity-60 sm:text-sm">
							≈ {formatUsd(totalReceivedUSD)}
						</span>
					{/if}
				{:else}
					<span class="text-primary text-xl font-bold sm:text-2xl">
						{formatUsd(totalReceivedUSD)}
					</span>
					{#if btcPrice > 0}
						<span class="text-xs opacity-60 sm:text-sm">
							≈ {formatSats(totalReceived)}
							{$t('wallet.sats')}
						</span>
					{/if}
				{/if}
			</div>
		{:else}
			<div class="text-center text-xs opacity-60 sm:text-sm">
				{$t('wallet.receive.enter_amount_to_estimate')}
			</div>
		{/if}
	</div>

	<!-- Action Buttons -->
	<div
		class="bg-base-100 sticky bottom-0 z-10 mt-auto flex gap-2 pt-3 pb-3 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] sm:gap-3 sm:pt-4 sm:pb-4 md:static md:pt-0 md:pb-0 md:shadow-none"
	>
		<button
			class="btn btn-error min-h-[44px] flex-1 touch-manipulation transition-transform duration-100 select-none active:scale-95 sm:min-h-[48px] md:min-h-[56px]"
			style="-webkit-tap-highlight-color: transparent;"
			onclick={() => {
				triggerHaptic(ImpactStyle.Light);
				handleCancel();
			}}
		>
			<IconClose class="h-4 w-4 sm:h-5 sm:w-5" />
			<span class="text-sm sm:text-base">{$t('wallet.receive.cancel')}</span>
		</button>
		<button
			class="btn btn-primary min-h-[44px] flex-1 touch-manipulation transition-transform duration-100 select-none active:scale-95 sm:min-h-[48px] md:min-h-[56px]"
			style="-webkit-tap-highlight-color: transparent;"
			onclick={() => {
				triggerHaptic(ImpactStyle.Medium);
				handleGenerateInvoice();
			}}
			disabled={!isFormValid ||
				feeState.isLoading ||
				$walletStore.isInitializing ||
				isGenerating ||
				isBelowSwapMinimum}
		>
			{#if feeState.isLoading || $walletStore.isInitializing || isGenerating}
				<span class="loading loading-spinner loading-sm"></span>
			{:else}
				<IconCashMultiple class="h-4 w-4 sm:h-5 sm:w-5" />
				<span class="text-sm sm:text-base">{$t('wallet.receive.get_paid')}</span>
			{/if}
		</button>
	</div>

	<!-- Wallet Initialization Message (Bottom) -->
	{#if $walletStore.isInitializing}
		<div
			class="bg-base-200 border-base-300 flex items-center justify-center gap-2 rounded-lg border px-3 py-1.5 sm:px-4 sm:py-2"
		>
			<span class="loading loading-spinner loading-xs"></span>
			<span class="text-base-content/70 text-xs sm:text-sm">{$t('wallet.initializing')}</span>
		</div>
	{/if}
</div>

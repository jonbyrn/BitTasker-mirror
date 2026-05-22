<script lang="ts">
	import { t } from 'svelte-i18n';
	import { untrack } from 'svelte';
	import { btcPrice } from '$lib/runes/btcPrice.svelte';
	import { walletStore, walletManager, formatSats, formatUsd } from '$lib/stores/wallet.store';
	import { appStore } from '$lib/stores/app.store';
	import { debounce } from '$lib/utils/helpers/common';
	import AmountInputSection from '$lib/components/wallet/AmountInputSection.svelte';
	import RoutePicker from '$lib/components/wallet/RoutePicker.svelte';
	import ReceiveSwapSelector from '$lib/components/wallet/ReceiveSwapSelector.svelte';
	import { resolveRoute, type SourceWallet, type Route } from '$lib/services/route-resolver';
	import { lifiService } from '$lib/services/lifi.service';
	import { symbiosisService } from '$lib/services/symbiosis.service';
	import { isLifiEnabled, isSymbiosisEnabled } from '$lib/services/kill-switch';
	import IconCashMultiple from '~icons/mdi/cash-multiple';
	import IconClose from '~icons/mdi/close';
	import IconCheck from '~icons/mdi/check';

	let { onCancel, onOpenPaymentRequest, initialFormState } = $props<{
		onCancel: () => void;
		onOpenPaymentRequest: (data: {
			swapId?: string;
			address: string;
			amount: number;
			memo?: string;
			network?: string;
			chargeFeesToPayer?: boolean;
			totalFees?: number;
			formState?: {
				amount: string;
				unit: 'sats' | 'usd';
				mathExpression: string;
				memo: string;
				selectedNetwork: string;
				chargeFeesToPayer: boolean;
			};
		}) => void; // Callback to parent to open modal with either swap or direct payment data
		initialFormState?: {
			amount: string;
			unit: 'sats' | 'usd';
			mathExpression: string;
			memo: string;
			selectedNetwork: string;
			chargeFeesToPayer: boolean;
		};
	}>();

	let lastRestoredSignature = $state<string>('');

	// Grouped State: Form Input
	let formInput = $state({
		amount: '',
		unit: 'usd' as 'sats' | 'usd',
		mathExpression: '',
		memo: '',
		selectedNetwork: 'rootstock-bitcoin',
		chargeFeesToPayer: false
	});

	// Receive tab selection and QR code data
	let receiveTab = $state<'rbtc' | 'usdt'>('rbtc');

	// Auto-select destination network based on receive tab and payer source
	$effect(() => {
		const tab = receiveTab;
		if (tab === 'usdt') {
			formInput.selectedNetwork = 'usdt-bsc';
		} else if (tab === 'rbtc') {
			// Match destination to payer's source for Bitcoin-family networks
			if (payerNetwork === 'lightning-bitcoin') {
				formInput.selectedNetwork = 'lightning-bitcoin';
			} else if (payerNetwork === 'bitcoin') {
				formInput.selectedNetwork = 'bitcoin';
			} else if (payerNetwork === 'liquid-bitcoin') {
				formInput.selectedNetwork = 'liquid-bitcoin';
			} else {
				formInput.selectedNetwork = 'rootstock-bitcoin';
			}
		}
		handleAmountOrNetworkChange();
	});

	// Mobile form container for keyboard scroll handling
	let mobileFormContainer: HTMLDivElement | undefined = $state(undefined);

	// Grouped State: UI State
	let uiState = $state({
		sourceExpanded: false,
		descriptionExpanded: false,
		networkExpanded: false,
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

	// Swap routing state — reuses the send form's route resolver
	let payerNetwork = $state<string>('rootstock-bitcoin');
	let payerSourceWallet = $derived<'rbtc' | 'usdt-bsc'>(
		payerNetwork === 'usdt-bsc' ? 'usdt-bsc' : 'rbtc'
	);
	let selectedRouteId = $state<string>('');
	let _routeLoading = $state(false);
	let swapRoutes = $derived.by(() => {
		if (amountInSats === 0) return [];
		const sourceWallet: SourceWallet = payerSourceWallet;
		const destNetwork = formInput.selectedNetwork;
		let routes: Route[] = [];
		// Address-type destinations (RSK, BSC)
		if (destNetwork === 'usdt-bsc' || destNetwork === 'rootstock-bitcoin') {
			const chainId = destNetwork === 'usdt-bsc' ? 56 : 30;
			const dest = { type: 'address' as const, chainId, address: $walletStore.rsk.address ?? '' };
			routes = resolveRoute(sourceWallet, dest);
		}
		// Invoice-type destinations (Lightning, Bitcoin, Liquid)
		else if (destNetwork === 'lightning-bitcoin') {
			routes = resolveRoute(sourceWallet, { type: 'invoice', network: 'lightning', invoice: '' });
		} else if (destNetwork === 'bitcoin') {
			routes = resolveRoute(sourceWallet, { type: 'invoice', network: 'onchain', invoice: '' });
		}
		// Liquid: treat as Bitcoin onchain swap via Boltz
		else if (destNetwork === 'liquid-bitcoin') {
			routes = resolveRoute(sourceWallet, { type: 'invoice', network: 'onchain', invoice: '' });
		}
		return routes.sort((a, b) => a.totalFeePercent - b.totalFeePercent);
	});

	// Invoice generation state (simplified)
	let isGenerating = $state(false);

	// Derived values
	const amountInSats = $derived.by(() => {
		if (formInput.unit === 'sats') {
			const parsed = parseFloat(formInput.amount);
			return isNaN(parsed) ? 0 : Math.floor(parsed);
		} else {
			const usdAmount = parseFloat(formInput.amount);
			if (isNaN(usdAmount) || btcPrice.price === 0) return 0;
			return Math.floor((usdAmount / btcPrice.price) * 100_000_000);
		}
	});

	// Auto-select cheapest swap route (swapRoutes is pre-sorted by fee)
	$effect(() => {
		if (swapRoutes.length > 0) {
			if (!swapRoutes.find((r) => r.id === selectedRouteId)) selectedRouteId = swapRoutes[0].id;
		} else {
			selectedRouteId = '';
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
	// When charging fees to payer: add the total estimated fee (service + network).
	// feeState.estimated.totalFees already includes any swap service fee from Boltz APIs.
	// swapFeeSats from route-resolver are informational only (shown in RoutePicker).
	const amountPayerPays = $derived.by(() => {
		if (amountInSats === 0) return 0;
		if (!feeState.estimated) return amountInSats;
		if (formInput.chargeFeesToPayer) {
			return amountInSats + feeState.estimated.totalFees;
		}
		return amountInSats;
	});

	// Check if amount is below swap minimum (for networks that require swaps)
	const isBelowSwapMinimum = $derived.by(() => {
		// Only check for networks that require swaps (not rootstock, usdt-bsc)
		const networksRequiringSwaps = ['lightning-bitcoin', 'liquid-bitcoin', 'bitcoin'];
		if (!networksRequiringSwaps.includes(formInput.selectedNetwork)) return false;
		if (!feeState.swapLimits || amountPayerPays === 0) return false;
		return amountPayerPays < feeState.swapLimits.minimal;
	});

	// Total received in USD
	const totalReceivedUSD = $derived.by(() => {
		if (totalReceived === 0 || btcPrice.price === 0) return 0;
		return (totalReceived / 100_000_000) * btcPrice.price;
	});

	// Trigger fee estimation when amountInSats changes and we don't have estimates yet
	$effect(() => {
		if (amountInSats > 0 && !feeState.estimated && !feeState.isLoading && !feeState.error) {
			untrack(() => {
				handleAmountOrNetworkChange();
			});
		}
	});

	// Debounced fee update function
	const debouncedUpdateFeeEstimate = debounce(async () => {
		await updateFeeEstimate();
	}, 500); // 500ms debounce

	// Restore form state when initialFormState prop is provided
	$effect(() => {
		if (!initialFormState) return;
		const signature = [
			initialFormState.amount,
			initialFormState.unit,
			initialFormState.mathExpression,
			initialFormState.memo,
			initialFormState.selectedNetwork,
			String(initialFormState.chargeFeesToPayer)
		].join('|');

		if (signature === lastRestoredSignature) return;

		{
			formInput.amount = initialFormState.amount;
			formInput.unit = initialFormState.unit;
			formInput.mathExpression = initialFormState.mathExpression;
			formInput.memo = initialFormState.memo;
			if (initialFormState.selectedNetwork) {
				formInput.selectedNetwork = initialFormState.selectedNetwork;
			}
			formInput.chargeFeesToPayer = initialFormState.chargeFeesToPayer;
			lastRestoredSignature = signature;
			// Trigger fee estimation after restoring state
			untrack(() => {
				if (amountInSats > 0) {
					handleAmountOrNetworkChange();
				}
			});
		}
	});

	// Manual fee update - called when amount or network changes
	function handleAmountOrNetworkChange() {
		// Clear stale estimate immediately so UI shows "loading" not old fee
		feeState.estimated = null;
		feeState.swapLimits = null;
		if (amountInSats > 0) {
			feeState.isLoading = true;
			debouncedUpdateFeeEstimate();
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
					estimateRootstockFees();
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
				case 'usdt-bsc':
					// BSC USDT - gas fees are near-zero with paymaster abstraction
					feeState.estimated = {
						serviceFee: 0,
						networkFee: 0, // Covered by paymaster gas abstraction
						totalFees: 0
					};
					feeState.swapLimits = null; // No swap limits needed
					break;
				default:
					feeState.estimated = null;
					feeState.swapLimits = null;
			}

			// Cross-chain swap: payer and receiver are on different chains
			if (payerSourceWallet === 'rbtc' && formInput.selectedNetwork === 'usdt-bsc') {
				await estimateCrossChainFees(30, 56, EVM_NATIVE, USDT_BSC);
			} else if (
				payerSourceWallet === 'usdt-bsc' &&
				formInput.selectedNetwork === 'rootstock-bitcoin'
			) {
				await estimateCrossChainFees(56, 30, USDT_BSC, EVM_NATIVE);
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

	// -----------------------------------------------------------------------
	// Cross-chain swap estimation (LI.FI + Symbiosis)
	// -----------------------------------------------------------------------
	const EVM_NATIVE = '0x0000000000000000000000000000000000000000';
	const USDT_BSC = '0x55d398326f99059fF775485246999027B3197955';

	async function estimateCrossChainFees(
		fromChain: number,
		toChain: number,
		fromToken: string,
		toToken: string
	) {
		const amountWei = Math.floor(amountInSats * 10_000_000_000).toString(); // sats → wei
		const userAddr = $walletStore.rsk.address || EVM_NATIVE;

		const promises: Promise<{
			provider: string;
			feePercent: number;
			estimatedTime: number;
		} | null>[] = [];

		if (isLifiEnabled()) {
			promises.push(
				lifiService
					.getQuote({
						fromChain,
						toChain,
						fromToken,
						toToken,
						fromAmount: amountWei,
						fromAddress: userAddr
					})
					.then((r) => ({
						provider: 'LI.FI',
						feePercent: 0.5,
						estimatedTime: r.estimate?.executionDuration || 300
					}))
					.catch(() => null)
			);
		}
		if (isSymbiosisEnabled()) {
			promises.push(
				symbiosisService
					.getQuote({
						tokenAmountIn: {
							address: fromToken,
							chainId: fromChain,
							symbol: fromToken === EVM_NATIVE ? 'RBTC' : 'USDT',
							decimals: 18
						},
						tokenOut: {
							address: toToken,
							chainId: toChain,
							symbol: toToken === EVM_NATIVE ? 'RBTC' : 'USDT',
							decimals: 18
						},
						amount: amountWei,
						from: userAddr,
						to: userAddr
					})
					.then((r) => ({
						provider: 'Symbiosis',
						feePercent: r.feePercent ?? 0.3,
						estimatedTime: r.estimatedTime || 300
					}))
					.catch(() => null)
			);
		}

		const results = await Promise.all(promises);
		const valid = results.filter(Boolean) as {
			provider: string;
			feePercent: number;
			estimatedTime: number;
		}[];
		if (valid.length > 0) {
			const best = valid.sort((a, b) => a.feePercent - b.feePercent)[0];
			const serviceFee = Math.ceil((amountInSats * best.feePercent) / 100);
			feeState.estimated = {
				serviceFee,
				networkFee: 0,
				totalFees: serviceFee
			};
		}
	}

	// Estimate fees for Lightning reverse swap
	async function estimateLightningFees() {
		// Reverse swap (rBTC→Lightning) only applies when payer sends rBTC
		if (payerSourceWallet !== 'rbtc') {
			feeState.estimated = { serviceFee: 0, networkFee: 0, totalFees: 0 };
			return;
		}
		const pairsData = await walletManager.getCachedReverseSwapPairs();
		// Guard: bail if network changed while awaiting
		if (formInput.selectedNetwork !== 'lightning-bitcoin') return;

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

	// Estimate fees for Rootstock (receiving is free — no gas needed by receiver)
	async function estimateRootstockFees() {
		feeState.estimated = {
			serviceFee: 0,
			networkFee: 0, // Receiver doesn't pay gas for incoming transactions
			totalFees: 0
		};
		feeState.swapLimits = null;
	}

	// Estimate fees for Liquid chain swap
	async function estimateLiquidFees() {
		const pairsData = await walletManager.getCachedChainSwapPairs();
		// Guard: bail if network changed while awaiting
		if (formInput.selectedNetwork !== 'liquid-bitcoin') return;

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
		formInput.amount = '';
		formInput.mathExpression = '';
		// Clear network fee estimate when amount is cleared
		feeState.estimated = null;
		// Force CalculatorKeypad to reset by changing its key
		uiState.calculatorKey++;
	}

	// Validate form
	const isFormValid = $derived.by(() => amountInSats > 0);

	// Handle invoice generation
	async function handleGenerateInvoice() {
		if (!isFormValid || isGenerating) return;

		// Validate that a route exists for swap-required networks
		const swapNetworks = ['lightning-bitcoin', 'liquid-bitcoin', 'bitcoin'];
		if (swapNetworks.includes(formInput.selectedNetwork) && swapRoutes.length === 0) {
			appStore.showErrorToast($t('wallet.swap.error.no_routes'));
			return;
		}

		isGenerating = true;
		try {
			// Calculate invoice amount: use amountPayerPays when charging fees to payer, otherwise use amountInSats
			const invoiceAmount =
				formInput.chargeFeesToPayer && feeState.estimated ? amountPayerPays : amountInSats;

			if (!$walletStore.rsk.connected || !$walletStore.rsk.address) {
				return appStore.showErrorToast($t('wallet.rsk_not_connected'));
			}

			if (formInput.selectedNetwork === 'lightning-bitcoin') {
				// Create Lightning reverse swap
				const result = await walletManager.createReverseSwap(Math.floor(invoiceAmount));

				// Call parent callback with swap data and form state for restoration
				onOpenPaymentRequest({
					swapId: result.swapId,
					formState: {
						amount: formInput.amount,
						unit: formInput.unit,
						mathExpression: formInput.mathExpression,
						memo: formInput.memo,
						selectedNetwork: formInput.selectedNetwork,
						chargeFeesToPayer: formInput.chargeFeesToPayer
					}
				});
			} else if (formInput.selectedNetwork === 'rootstock-bitcoin') {
				// Rootstock direct payment - use EIP-1191 checksummed address only
				// Call parent callback with direct payment data and form state for restoration
				onOpenPaymentRequest({
					address: $walletStore.rsk.address, // EIP-1191 checksummed address
					network: 'rootstock-bitcoin',
					amount: Math.floor(invoiceAmount),
					memo: formInput.memo || undefined,
					chargeFeesToPayer: formInput.chargeFeesToPayer,
					totalFees: feeState.estimated?.totalFees || 0,
					formState: {
						amount: formInput.amount,
						unit: formInput.unit,
						mathExpression: formInput.mathExpression,
						memo: formInput.memo,
						selectedNetwork: formInput.selectedNetwork,
						chargeFeesToPayer: formInput.chargeFeesToPayer
					}
				});
			} else if (formInput.selectedNetwork === 'liquid-bitcoin') {
				// Create Liquid chain swap
				const result = await walletManager.createChainSwap(Math.floor(invoiceAmount));

				// Call parent callback with swap data and form state for restoration
				onOpenPaymentRequest({
					swapId: result.swapId,
					formState: {
						amount: formInput.amount,
						unit: formInput.unit,
						mathExpression: formInput.mathExpression,
						memo: formInput.memo,
						selectedNetwork: formInput.selectedNetwork,
						chargeFeesToPayer: formInput.chargeFeesToPayer
					}
				});
			} else if (formInput.selectedNetwork === 'usdt-bsc') {
				// BSC USDT - show BSC address for direct deposit
				if (!$walletStore.bsc.connected || !$walletStore.bsc.address) {
					return appStore.showErrorToast($t('wallet.bsc.not_connected'));
				}
				onOpenPaymentRequest({
					address: $walletStore.bsc.address,
					network: 'usdt-bsc',
					amount: Math.floor(invoiceAmount),
					memo: formInput.memo || undefined,
					chargeFeesToPayer: formInput.chargeFeesToPayer,
					totalFees: feeState.estimated?.totalFees || 0,
					formState: {
						amount: formInput.amount,
						unit: formInput.unit,
						mathExpression: formInput.mathExpression,
						memo: formInput.memo,
						selectedNetwork: formInput.selectedNetwork,
						chargeFeesToPayer: formInput.chargeFeesToPayer
					}
				});
			} else {
				appStore.showErrorToast($t('wallet.receive_form.network_not_available'));
				return;
			}

			onCancel(); // Close the receive form
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

	// Handle invoice generation
	function handleGenerate() {
		if (formInput.selectedNetwork === 'rootstock-bitcoin') {
			handleGenerateInvoice();
			return;
		}
		if (amountInSats > 0) {
			handleGenerateInvoice();
		}
	}
</script>

<div class="flex min-h-0 flex-1 flex-col">
	<!-- Scrollable Content Area -->
	<div class="min-h-0 flex-1 space-y-3 overflow-y-auto sm:space-y-4">
		<!-- Receive Address Tabs -->
		<div class="flex flex-col gap-3 sm:gap-4">
			<!-- Source Wallet Accordion (same pattern as Send screen) -->
			<div class="form-control">
				<div
					class="collapse-arrow border-primary bg-base-100 collapse rounded-lg border-2"
					class:collapse-open={uiState.sourceExpanded}
				>
					<button
						type="button"
						class="collapse-title flex min-h-0 items-center gap-2 px-3 py-2 text-sm font-medium"
						onclick={() => (uiState.sourceExpanded = !uiState.sourceExpanded)}
					>
						<span class="text-base-content/60">{$t('wallet.to')}:</span>
						{#if receiveTab === 'rbtc'}
							<img src="/images/chains/Bitcoin-Rootstock-logo.webp" alt="rBTC" class="h-5 w-5" />
							<span>{$t('wallet.bitcoin')}</span>
							<span class="mr-6 ml-auto text-xs">
								{formatSats($walletStore.totalBalances.sats)} Sats ≈
								{formatUsd(($walletStore.totalBalances.sats / 100_000_000) * btcPrice.price)}
							</span>
						{:else}
							<img src="/images/chains/Tether-USD.svg" alt="USD" class="h-5 w-5" />
							<span>USD</span>
							<span class="mr-6 ml-auto text-xs">
								{parseFloat($walletStore.bsc.formattedUsdtBalance) > 0
									? '$' +
										parseFloat($walletStore.bsc.formattedUsdtBalance).toLocaleString('en-US', {
											minimumFractionDigits: 2,
											maximumFractionDigits: 2
										})
									: '$0.00'}
							</span>
						{/if}
					</button>
					<div class="collapse-content px-2">
						<div class="space-y-1">
							<button
								type="button"
								class="hover:bg-base-200 flex w-full items-center gap-2 rounded-lg p-2 transition-colors {receiveTab ===
								'rbtc'
									? 'bg-primary/10'
									: ''}"
								onclick={() => {
									receiveTab = 'rbtc';
									uiState.sourceExpanded = false;
								}}
							>
								<img src="/images/chains/Bitcoin-Rootstock-logo.webp" alt="rBTC" class="h-5 w-5" />
								<span>{$t('wallet.bitcoin')}</span>
								<span class="ml-auto text-xs opacity-70">
									{formatSats($walletStore.totalBalances.sats)} Sats ≈
									{formatUsd(($walletStore.totalBalances.sats / 100_000_000) * btcPrice.price)}
								</span>
							</button>
							<button
								type="button"
								class="hover:bg-base-200 flex w-full items-center gap-2 rounded-lg p-2 transition-colors {receiveTab ===
								'usdt'
									? 'bg-primary/10'
									: ''}"
								onclick={() => {
									receiveTab = 'usdt';
									uiState.sourceExpanded = false;
								}}
							>
								<img src="/images/chains/Tether-USD.svg" alt="USD" class="h-5 w-5" />
								<span>USD</span>
								<span class="ml-auto text-xs opacity-70">
									{parseFloat($walletStore.bsc.formattedUsdtBalance) > 0
										? '$' +
											parseFloat($walletStore.bsc.formattedUsdtBalance).toLocaleString('en-US', {
												minimumFractionDigits: 2,
												maximumFractionDigits: 2
											})
										: '$0.00'}
								</span>
							</button>
						</div>
					</div>
				</div>
			</div>
		</div>

		<!-- Payer Source Network Selector -->
		<ReceiveSwapSelector
			receiveCurrency={receiveTab}
			onChange={(network) => {
				payerNetwork = network;
				handleAmountOrNetworkChange();
			}}
		/>

		<!-- Amount Input Section (Mobile) -->
		<div class="block space-y-2 sm:hidden">
			<AmountInputSection
				amount={formInput.amount}
				unit={formInput.unit}
				mathExpression={formInput.mathExpression}
				calculatorKey={uiState.calculatorKey}
				{isBelowSwapMinimum}
				onAmountChange={(value) => (formInput.amount = value)}
				onUnitChange={(newUnit) => {
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
		</div>

		<!-- Desktop: Always show amount input -->
		<div class="hidden sm:block">
			<AmountInputSection
				amount={formInput.amount}
				unit={formInput.unit}
				mathExpression={formInput.mathExpression}
				calculatorKey={uiState.calculatorKey}
				onAmountChange={(value) => (formInput.amount = value)}
				onUnitChange={(newUnit) => {
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
		</div>

		<!-- Network Selector and other fields - Hidden on mobile step 1, visible on step 2 and desktop -->
		<div class="block sm:hidden">
			<div
				class="flex flex-col space-y-2 overflow-y-auto"
				bind:this={mobileFormContainer}
				style="padding-bottom: env(keyboard-inset-bottom, 0px);"
			>
				<!-- Network Fee Accordion (RoutePicker) -->
				<RoutePicker
					routes={swapRoutes}
					{selectedRouteId}
					onSelect={(id) => (selectedRouteId = id)}
					networkFeeSats={feeState.estimated?.networkFee ?? 0}
					isLoadingFee={feeState.isLoading || _routeLoading}
					btcPrice={btcPrice.price}
					network={formInput.selectedNetwork}
					amountSats={amountInSats}
					hasAddress={true}
					hasAmount={amountInSats > 0}
					swapFeeOverride={feeState.estimated?.serviceFee}
				/>

				{#if feeState.error}
					<div class="text-error text-xs">{$t('wallet.swap.error.fee_fetch_failed')}</div>
				{/if}

				<!-- Charge Fees to Payer Toggle (Mobile - visible on both steps, BEFORE Total) -->
				{#if feeState.estimated && feeState.estimated.totalFees > 0 && formInput.selectedNetwork !== 'rootstock-bitcoin'}
					<button
						type="button"
						class="btn border-primary h-auto min-h-0 w-full touch-manipulation items-center justify-center gap-2 rounded-lg border-2 px-3 py-2 text-sm transition-colors select-none {formInput.chargeFeesToPayer
							? 'bg-primary text-primary-content hover:bg-primary/90'
							: 'btn-outline bg-base-100'}"
						style="-webkit-tap-highlight-color: transparent;"
						onclick={() => {
							formInput.chargeFeesToPayer = !formInput.chargeFeesToPayer;
							// Trigger fee recalculation when toggling chargeFeesToPayer to update displayed totals
							if (amountInSats > 0) {
								handleAmountOrNetworkChange();
							}
						}}
					>
						<div
							class="flex h-4 w-4 items-center justify-center rounded border-2 {formInput.chargeFeesToPayer
								? 'border-primary-content bg-primary-content'
								: 'border-base-content/30'}"
						>
							{#if formInput.chargeFeesToPayer}
								<IconCheck
									class="text-primary h-3.5 w-3.5"
									style="stroke: currentColor; stroke-width: 1.5; fill: currentColor;"
								/>
							{/if}
						</div>
						<span class="label-text">{$t('wallet.receive.charge_fees_to_payer')}</span>
					</button>
				{:else}
					<button
						type="button"
						class="btn btn-outline border-primary h-auto min-h-0 w-full cursor-not-allowed items-center justify-center gap-2 rounded-lg border-2 px-3 py-2 text-sm opacity-50"
						disabled
					>
						<div
							class="border-base-content/30 flex h-4 w-4 items-center justify-center rounded border-2"
						></div>
						<span class="label-text">{$t('wallet.receive.charge_fees_to_payer')}</span>
					</button>
				{/if}

				<!-- Total Received Card (Mobile) -->
				<div
					class="bg-base-200 flex flex-row items-center justify-between gap-1.5 rounded-lg border-2 p-1.5"
					class:border-primary={!isBelowSwapMinimum}
					class:border-error={isBelowSwapMinimum}
				>
					<span class="text-xs opacity-70">{$t('wallet.swap.total_received_est')}</span>
					{#if isBelowSwapMinimum && feeState.swapLimits}
						<span class="text-error text-xs">
							{$t('wallet.receive.below_swap_minimum', {
								values: { minAmount: formatSats(feeState.swapLimits.minimal) }
							})}
						</span>
					{:else if totalReceived > 0 && feeState.estimated}
						<div class="flex items-center gap-1.5">
							{#if receiveTab === 'usdt'}
								<span class="text-primary text-xl font-bold">
									{formatUsd(totalReceivedUSD)}
								</span>
							{:else}
								<span class="text-primary text-xl font-bold">
									{formatSats(totalReceived)}
									{$t('wallet.sats')}
								</span>
								<span class="text-xs opacity-60">|</span>
								<span class="text-xs opacity-60">
									≈ {formatUsd(totalReceivedUSD)}
								</span>
							{/if}
						</div>
					{:else}
						<span class="text-xs opacity-60">{$t('wallet.receive.enter_amount_to_estimate')}</span>
					{/if}
				</div>

				<!-- Memo/Description Field (Accordion - AFTER Total, visible on both steps) -->
				<div
					class="collapse-arrow border-primary bg-base-100 collapse rounded-lg border-2"
					class:collapse-open={uiState.descriptionExpanded}
				>
					<button
						type="button"
						class="collapse-title min-h-0 px-3 py-2 text-left text-sm font-medium sm:px-4 sm:text-base"
						onclick={() => (uiState.descriptionExpanded = !uiState.descriptionExpanded)}
					>
						{$t('wallet.description')} ({$t('wallet.optional')})
					</button>
					<div class="collapse-content pb-0">
						<div class="form-control px-2 py-2 sm:px-4">
							<textarea
								id="memo-input"
								class="textarea textarea-bordered w-full text-sm sm:text-base"
								class:textarea-error={formInput.memo.length > 200}
								placeholder={$t('wallet.payment_for_placeholder')}
								bind:value={formInput.memo}
								rows="3"
								maxlength="200"
								onfocus={() => {
									document
										.getElementById('memo-input')
										?.scrollIntoView({ behavior: 'smooth', block: 'center' });
								}}
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
			</div>
		</div>

		<!-- Desktop: All fields always visible -->
		<div class="hidden sm:block">
			<div class="flex flex-col space-y-2">
				<!-- Network Fee Accordion (RoutePicker) -->
				<RoutePicker
					routes={swapRoutes}
					{selectedRouteId}
					onSelect={(id) => (selectedRouteId = id)}
					networkFeeSats={feeState.estimated?.networkFee ?? 0}
					isLoadingFee={feeState.isLoading || _routeLoading}
					btcPrice={btcPrice.price}
					network={formInput.selectedNetwork}
					amountSats={amountInSats}
					hasAddress={true}
					hasAmount={amountInSats > 0}
				/>

				{#if feeState.error}
					<div class="text-error text-xs">{$t('wallet.swap.error.fee_fetch_failed')}</div>
				{/if}

				<!-- Swap Minimum Warning -->
				{#if isBelowSwapMinimum && feeState.swapLimits}
					{@const minUsd =
						btcPrice.price > 0
							? formatUsd((feeState.swapLimits.minimal / 100_000_000) * btcPrice.price)
							: null}
					<div class="text-warning mt-1 text-xs sm:mt-2">
						{$t('wallet.receive.below_swap_minimum', {
							values: { minAmount: formatSats(feeState.swapLimits.minimal) }
						})}{minUsd ? ` (≈ ${minUsd})` : ''}
					</div>
				{/if}

				<!-- Memo/Description Field (Accordion) -->
				<div
					class="collapse-arrow border-primary bg-base-100 collapse rounded-lg border-2"
					class:collapse-open={uiState.descriptionExpanded}
				>
					<button
						type="button"
						class="collapse-title min-h-0 px-3 py-2 text-left text-sm font-medium sm:px-4 sm:text-base"
						onclick={() => (uiState.descriptionExpanded = !uiState.descriptionExpanded)}
					>
						{$t('wallet.description')} ({$t('wallet.optional')})
					</button>
					<div class="collapse-content">
						<div class="form-control px-3 sm:px-4">
							<textarea
								id="memo-input-desktop"
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

				<!-- Charge Fees to Payer Toggle (Desktop) -->
				{#if feeState.estimated && feeState.estimated.totalFees > 0 && formInput.selectedNetwork !== 'rootstock-bitcoin'}
					<button
						type="button"
						class="btn border-primary h-auto min-h-0 w-full touch-manipulation items-center justify-center gap-2 rounded-lg border-2 px-3 py-2 text-sm transition-colors select-none sm:gap-3 sm:text-base {formInput.chargeFeesToPayer
							? 'bg-primary text-primary-content hover:bg-primary/90'
							: 'btn-outline bg-base-100'}"
						style="-webkit-tap-highlight-color: transparent;"
						onclick={() => {
							formInput.chargeFeesToPayer = !formInput.chargeFeesToPayer;
							// Trigger fee recalculation when toggling chargeFeesToPayer to update displayed totals
							if (amountInSats > 0) {
								handleAmountOrNetworkChange();
							}
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
						class="btn btn-outline border-primary h-auto min-h-0 w-full cursor-not-allowed items-center justify-center gap-2 rounded-lg border-2 px-3 py-2 text-sm opacity-50 sm:gap-3 sm:text-base"
						disabled
					>
						<div
							class="border-base-content/30 flex h-4 w-4 items-center justify-center rounded border-2 sm:h-5 sm:w-5"
						></div>
						<span class="label-text">{$t('wallet.receive.charge_fees_to_payer')}</span>
					</button>
				{/if}

				<!-- Total Received Card (Desktop) -->
				<div
					class="bg-base-200 flex items-center justify-between gap-3 rounded-lg border-2 px-4 py-3"
					class:border-primary={!isBelowSwapMinimum}
					class:border-error={isBelowSwapMinimum}
				>
					{#if totalReceived > 0 && feeState.estimated}
						<span class="text-sm opacity-70">{$t('wallet.swap.total_received_est')}</span>
						<div class="flex items-center gap-2">
							{#if receiveTab === 'usdt'}
								<span class="text-primary text-xl font-bold">
									{formatUsd(totalReceivedUSD)}
								</span>
							{:else}
								<span class="text-primary text-xl font-bold">
									{formatSats(totalReceived)}
									{$t('wallet.sats')}
								</span>
								{#if btcPrice.price > 0}
									<span class="text-sm opacity-60">
										≈ {formatUsd(totalReceivedUSD)}
									</span>
								{/if}
							{/if}
						</div>
					{:else}
						<span class="text-sm opacity-60">
							{$t('wallet.receive.enter_amount_to_estimate')}
						</span>
					{/if}
				</div>
			</div>
		</div>
	</div>

	<!-- Action Buttons -->
	<div
		class="bg-base-100 sticky bottom-0 z-10 mt-auto flex shrink-0 gap-2 pt-3 pb-3 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] sm:gap-3 sm:pt-4 sm:pb-4 md:static md:pt-0 md:pb-0 md:shadow-none"
	>
		<!-- Mobile: Cancel and Get Paid -->
		<button
			class="btn btn-error min-h-[44px] flex-1 touch-manipulation transition-transform duration-100 select-none active:scale-95 sm:hidden"
			style="-webkit-tap-highlight-color: transparent;"
			onclick={handleCancel}
		>
			<IconClose class="h-4 w-4" />
			<span class="text-sm">{$t('wallet.receive.cancel')}</span>
		</button>
		<button
			class="btn btn-primary min-h-[44px] flex-1 touch-manipulation transition-transform duration-100 select-none active:scale-95 sm:hidden"
			style="-webkit-tap-highlight-color: transparent;"
			onclick={handleGenerate}
			disabled={!isFormValid ||
				feeState.isLoading ||
				$walletStore.isInitializing ||
				isGenerating ||
				isBelowSwapMinimum}
		>
			{#if feeState.isLoading || $walletStore.isInitializing || isGenerating}
				<span class="loading loading-spinner loading-sm"></span>
			{:else}
				<IconCashMultiple class="h-4 w-4" />
				<span class="text-sm">{$t('wallet.receive.get_paid')}</span>
			{/if}
		</button>

		<!-- Desktop: Always show Cancel and Get Paid -->
		<button
			class="btn btn-error hidden min-h-[44px] flex-1 touch-manipulation transition-transform duration-100 select-none active:scale-95 sm:flex sm:min-h-[48px] md:min-h-[56px]"
			style="-webkit-tap-highlight-color: transparent;"
			onclick={handleCancel}
		>
			<IconClose class="h-4 w-4 sm:h-5 sm:w-5" />
			<span class="text-sm sm:text-base">{$t('wallet.receive.cancel')}</span>
		</button>
		<button
			class="btn btn-primary hidden min-h-[44px] flex-1 touch-manipulation transition-transform duration-100 select-none active:scale-95 sm:flex sm:min-h-[48px] md:min-h-[56px]"
			style="-webkit-tap-highlight-color: transparent;"
			onclick={handleGenerateInvoice}
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

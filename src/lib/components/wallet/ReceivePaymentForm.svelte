<script lang="ts">
	import { t } from 'svelte-i18n';
	import { btcPrice } from '$lib/runes/btcPrice.svelte';
	import { walletStore, walletManager, formatSats, formatUsd } from '$lib/stores/wallet.store';
	import { appStore } from '$lib/stores/app.store';
	import AmountInputSection from '$lib/components/wallet/AmountInputSection.svelte';
	import RoutePicker from '$lib/components/wallet/RoutePicker.svelte';
	import ReceiveSwapSelector from '$lib/components/wallet/ReceiveSwapSelector.svelte';
	import { resolveRoute, type SourceWallet, type Route } from '$lib/services/route-resolver';
	import { lifiService } from '$lib/services/lifi.service';
	import { symbiosisService } from '$lib/services/symbiosis.service';
	import { isLifiEnabled, isSymbiosisEnabled } from '$lib/services/kill-switch';
	import { connectedWalletsStore } from '$lib/stores/connected-wallets.store';
	import { connectorRegistry } from '$lib/services/external-wallet/connector-registry';
	import { FeatureFlagService, FEATURE_FLAGS } from '$lib/services/kill-switch';

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

	// Connected wallet receiving account
	// null = use built-in wallet, string = connected wallet ID
	let selectedReceiveWalletId = $state<string | null>(null);

	/** Validate selectedReceiveWalletId is still connected */
	let isReceiveWalletValid = $derived.by(() => {
		if (!selectedReceiveWalletId) return false;
		return $connectedWalletsStore.wallets.some((w) => w.id === selectedReceiveWalletId);
	});

	// Auto-select destination network based on receive tab and payer source
	$effect(() => {
		// When a connected wallet is selected, stick with the current network
		if (selectedReceiveWalletId && isReceiveWalletValid) return;

		const tab = receiveTab;
		if (tab === 'usdt') {
			formInput.selectedNetwork = 'usdt-bsc';
		} else if (tab === 'rbtc') {
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
	type FeeEstimate = { serviceFee: number; networkFee: number; totalFees: number };

	let feeState = $state<{
		estimated: FeeEstimate | null;
		isLoading: boolean;
		error: string | null;
		swapLimits: { minimal: number; maximal: number } | null;
	}>({ estimated: null, isLoading: false, error: null, swapLimits: null });

	// Swap routing state — reuses the send form's route resolver
	let payerNetwork = $state<string>('rootstock-bitcoin');
	let _feeGen = $state(0);
	let payerSourceWallet = $derived<'rbtc' | 'usdt-bsc'>(
		payerNetwork === 'usdt-bsc' ? 'usdt-bsc' : 'rbtc'
	);
	let selectedRouteId = $state<string>('');
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

	//
	const EVM_NATIVE = '0x0000000000000000000000000000000000000000';
	const USDT_BSC = '0x55d398326f99059fF775485246999027B3197955';

	// ---- Unified fee estimation (single write path, generation counter) ----
	async function estimateFee() {
		if (feeState.isLoading) return; // already computing
		const gen = ++_feeGen;
		feeState.isLoading = true;
		feeState.error = null;

		try {
			feeState.estimated = null;
			const result = await computeFee();
			if (gen !== _feeGen) return; // stale — newer call is in-flight
			feeState.estimated = result;
		} catch (err) {
			if (gen !== _feeGen) return;
			console.error('[ReceiveForm] Fee estimation failed:', err);
			feeState.error = $t('wallet.swap.error.fee_fetch_failed');
			feeState.estimated = null;
		} finally {
			feeState.isLoading = false;
		}
	}

	/** Pure-ish: takes amount + network + source, returns FeeEstimate. */
	async function computeFee(): Promise<FeeEstimate | null> {
		if (amountInSats === 0) return null;

		const network = formInput.selectedNetwork;
		const source = payerSourceWallet;

		// Direct sends — zero fees
		if (
			(source === 'rbtc' && network === 'rootstock-bitcoin') ||
			(source === 'usdt-bsc' && network === 'usdt-bsc')
		) {
			return { serviceFee: 0, networkFee: 0, totalFees: 0 };
		}

		// Boltz reverse swap (Lightning)
		if (network === 'lightning-bitcoin') {
			if (source !== 'rbtc') return { serviceFee: 0, networkFee: 0, totalFees: 0 };
			return computeLightningFee();
		}

		// Boltz chain swap (Liquid)
		if (network === 'liquid-bitcoin') {
			return computeLiquidFee();
		}

		// Bitcoin on-chain
		if (network === 'bitcoin') {
			return { serviceFee: 0, networkFee: 0, totalFees: 0 };
		}

		// Cross-chain rBTC <-> USDT
		if (source === 'rbtc' && network === 'usdt-bsc') {
			return computeCrossChainFee(30, 56, EVM_NATIVE, USDT_BSC);
		}
		if (source === 'usdt-bsc' && network === 'rootstock-bitcoin') {
			return computeCrossChainFee(56, 30, USDT_BSC, EVM_NATIVE);
		}

		return null;
	}

	async function computeLightningFee(): Promise<FeeEstimate | null> {
		try {
			const pairsData = await walletManager.getCachedReverseSwapPairs();
			const pair = pairsData?.['BTC']?.['RBTC'];
			if (!pair) return { serviceFee: 0, networkFee: 0, totalFees: 0 };

			const percentage = pair.fees.percentage;
			const serviceFee = Math.ceil((amountInSats * percentage) / 100);
			const lockupFee = pair.fees.minerFees.lockup || 0;
			const claimFee = pair.fees.minerFees.claim || 0;
			const networkFee = lockupFee + claimFee;

			if (pair.limits) {
				feeState.swapLimits = { minimal: pair.limits.minimal, maximal: pair.limits.maximal };
			}
			return { serviceFee, networkFee, totalFees: serviceFee + networkFee };
		} catch {
			return { serviceFee: 0, networkFee: 0, totalFees: 0 };
		}
	}

	async function computeLiquidFee(): Promise<FeeEstimate | null> {
		try {
			const pairsData = await walletManager.getCachedChainSwapPairs();
			const pair = pairsData?.['L-BTC']?.['RBTC'];
			if (!pair) return { serviceFee: 0, networkFee: 0, totalFees: 0 };

			const percentage = pair.fees.percentage;
			const serviceFee = Math.ceil((amountInSats * percentage) / 100);
			const lockupFee = pair.fees.minerFees.user?.lockup || 0;
			const claimFee = pair.fees.minerFees.user?.claim || 0;
			const networkFee = lockupFee + claimFee;

			if (pair.limits) {
				feeState.swapLimits = { minimal: pair.limits.minimal, maximal: pair.limits.maximal };
			}
			return { serviceFee, networkFee, totalFees: serviceFee + networkFee };
		} catch {
			return { serviceFee: 0, networkFee: 0, totalFees: 0 };
		}
	}

	async function computeCrossChainFee(
		fromChain: number,
		toChain: number,
		fromToken: string,
		toToken: string
	): Promise<FeeEstimate | null> {
		const probeAmount = '100000000000000000000'; // 100 tokens in wei
		const userAddr = $walletStore.rsk.address || '';
		if (!userAddr) return { serviceFee: 0, networkFee: 0, totalFees: 0 };

		const promises: Promise<{ provider: string; feePercent: number } | null>[] = [];

		if (isLifiEnabled()) {
			promises.push(
				lifiService
					.getQuote({
						fromChain,
						toChain,
						fromToken,
						toToken,
						fromAmount: probeAmount,
						fromAddress: userAddr
					})
					.then((r) => {
						const fromAmt = parseFloat(r.estimate?.fromAmount || '0');
						const toAmt = parseFloat(r.estimate?.toAmountMin || r.estimate?.toAmount || '0');
						return {
							provider: 'LI.FI',
							feePercent:
								fromAmt > 0 ? parseFloat((((fromAmt - toAmt) / fromAmt) * 100).toFixed(2)) : 0.5
						};
					})
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
						amount: probeAmount,
						from: userAddr,
						to: userAddr
					})
					.then((r) => ({ provider: 'Symbiosis', feePercent: r.feePercent ?? 0.3 }))
					.catch(() => null)
			);
		}

		const results = await Promise.all(promises);
		const valid = results.filter(Boolean) as { provider: string; feePercent: number }[];
		if (valid.length > 0) {
			const best = valid.sort((a, b) => a.feePercent - b.feePercent)[0];
			const serviceFee = Math.ceil((amountInSats * best.feePercent) / 100);
			return { serviceFee, networkFee: 0, totalFees: serviceFee };
		}
		return { serviceFee: 0, networkFee: 0, totalFees: 0 };
	}

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
		estimateFee();
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

			// Determine receiving address: connected wallet or built-in
			const useConnected = selectedReceiveWalletId && isReceiveWalletValid;

			if (formInput.selectedNetwork === 'lightning-bitcoin') {
				// Lightning swaps not supported from connected wallets
				if (useConnected) {
					appStore.showErrorToast('Lightning swaps are not available for connected wallets.');
					isGenerating = false;
					return;
				}
				if (!$walletStore.rsk.connected || !$walletStore.rsk.address) {
					return appStore.showErrorToast($t('wallet.rsk_not_connected'));
				}
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
				let address: string;
				if (useConnected) {
					const handle = connectorRegistry.get(selectedReceiveWalletId!);
					if (!handle?.address) {
						appStore.showErrorToast('Connected wallet not found. It may have been disconnected.');
						isGenerating = false;
						return;
					}
					address = handle.address;
				} else {
					if (!$walletStore.rsk.connected || !$walletStore.rsk.address) {
						return appStore.showErrorToast($t('wallet.rsk_not_connected'));
					}
					address = $walletStore.rsk.address;
				}
				// Call parent callback with direct payment data and form state for restoration
				onOpenPaymentRequest({
					address,
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
				// Liquid swaps not supported from connected wallets
				if (useConnected) {
					appStore.showErrorToast('Liquid chain swaps are not available for connected wallets.');
					isGenerating = false;
					return;
				}
				if (!$walletStore.rsk.connected || !$walletStore.rsk.address) {
					return appStore.showErrorToast($t('wallet.rsk_not_connected'));
				}
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
				let address: string;
				if (useConnected) {
					const handle = connectorRegistry.get(selectedReceiveWalletId!);
					if (!handle?.address) {
						appStore.showErrorToast('Connected wallet not found. It may have been disconnected.');
						isGenerating = false;
						return;
					}
					address = handle.address;
				} else {
					if (!$walletStore.bsc.connected || !$walletStore.bsc.address) {
						return appStore.showErrorToast($t('wallet.bsc.not_connected'));
					}
					address = $walletStore.bsc.address;
				}
				onOpenPaymentRequest({
					address,
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

	// Shared unit change handler (avoids mobile/desktop duplication)
	function handleUnitChange(newUnit: 'sats' | 'usd') {
		formInput.unit = newUnit;
		formInput.mathExpression = '';
		estimateFee();
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
						{#if selectedReceiveWalletId && isReceiveWalletValid}
							{@const wallet = $connectedWalletsStore.wallets.find(
								(w) => w.id === selectedReceiveWalletId
							)}
							{#if wallet}
								{#if wallet.walletType === 'metamask'}
									<span class="text-lg">🦊</span>
								{:else if wallet.walletType === 'walletconnect'}
									<span class="text-lg">🔗</span>
								{:else if wallet.walletType === 'trezor'}
									<span class="text-lg">🔐</span>
								{:else if wallet.walletType === 'ledger'}
									<span class="text-lg">💾</span>
								{/if}
								{#if receiveTab === 'rbtc'}
									<img
										src="/images/chains/Bitcoin-Rootstock-logo.webp"
										alt="rBTC"
										class="h-4 w-4"
									/>
									<span class="font-medium">{wallet.walletName}</span>
									<span class="text-base-content/50 mr-6 ml-auto truncate text-xs"
										>rBTC (RSK) · {wallet.address.slice(0, 6)}...{wallet.address.slice(-4)}</span
									>
								{:else}
									<img src="/images/chains/Tether-USD.svg" alt="USD" class="h-4 w-4" />
									<span class="font-medium">{wallet.walletName}</span>
									<span class="text-base-content/50 mr-6 ml-auto truncate text-xs"
										>USDT (BSC) · {wallet.address.slice(0, 6)}...{wallet.address.slice(-4)}</span
									>
								{/if}
							{/if}
						{:else if receiveTab === 'rbtc'}
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
								class="hover:bg-base-200 flex w-full items-center gap-2 rounded-lg p-2 transition-colors {!selectedReceiveWalletId &&
								receiveTab === 'rbtc'
									? 'bg-primary/10'
									: ''}"
								onclick={() => {
									selectedReceiveWalletId = null;
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
								class="hover:bg-base-200 flex w-full items-center gap-2 rounded-lg p-2 transition-colors {!selectedReceiveWalletId &&
								receiveTab === 'usdt'
									? 'bg-primary/10'
									: ''}"
								onclick={() => {
									selectedReceiveWalletId = null;
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

							<!-- Connected Wallets Section -->
							{#if FeatureFlagService.isEnabled(FEATURE_FLAGS.CONNECTED_WALLETS) && $connectedWalletsStore.wallets.length > 0}
								<div class="divider my-1 text-xs">Connected</div>
								{#each $connectedWalletsStore.wallets as wallet (wallet.id)}
									<button
										type="button"
										class="hover:bg-base-200 flex w-full items-center gap-2 rounded-lg p-2 transition-colors {selectedReceiveWalletId ===
										wallet.id
											? 'bg-primary/10'
											: ''}"
										onclick={() => {
											selectedReceiveWalletId = wallet.id;
											uiState.sourceExpanded = false;
										}}
									>
										{#if wallet.walletType === 'metamask'}
											🦊
										{:else if wallet.walletType === 'walletconnect'}
											🔗
										{:else if wallet.walletType === 'trezor'}
											🔐
										{:else if wallet.walletType === 'ledger'}
											💾
										{/if}
										{#if receiveTab === 'rbtc'}
											<img
												src="/images/chains/Bitcoin-Rootstock-logo.webp"
												alt="rBTC"
												class="h-4 w-4"
											/>
											<div class="min-w-0 flex-1 text-left">
												<div class="text-sm font-medium">{wallet.walletName}</div>
												<div class="truncate text-xs opacity-50">
													{wallet.address.slice(0, 10)}...{wallet.address.slice(-4)}
												</div>
											</div>
											{@const rawRbtc = Number(wallet.balances?.rbtc?.raw ?? 0)}
											<span class="ml-auto text-xs font-semibold tabular-nums"
												>{rawRbtc > 0 ? formatSats(rawRbtc) + ' Sats' : '0 Sats'}</span
											>
										{:else}
											<img src="/images/chains/Tether-USD.svg" alt="USD" class="h-4 w-4" />
											<div class="min-w-0 flex-1 text-left">
												<div class="text-sm font-medium">{wallet.walletName}</div>
												<div class="truncate text-xs opacity-50">
													{wallet.address.slice(0, 10)}...{wallet.address.slice(-4)}
												</div>
											</div>
											{@const rawUsdt = Number(wallet.balances?.usdt?.raw ?? 0)}
											<span class="ml-auto text-xs font-semibold tabular-nums"
												>{rawUsdt > 0 ? '$' + (rawUsdt / 1e18).toFixed(2) : '$0.00'}</span
											>
										{/if}
									</button>
								{/each}
							{/if}
						</div>
					</div>
				</div>
			</div>
		</div>

		<!-- Payer Source Network Selector (hidden when receiving to connected wallet) -->
		{#if !selectedReceiveWalletId}
			<ReceiveSwapSelector
				receiveCurrency={receiveTab}
				onChange={(network) => {
					payerNetwork = network;
					estimateFee();
				}}
			/>
		{/if}

		<!-- Amount Input Section (Mobile) -->
		<div class="block space-y-2 sm:hidden">
			<AmountInputSection
				amount={formInput.amount}
				unit={formInput.unit}
				mathExpression={formInput.mathExpression}
				calculatorKey={uiState.calculatorKey}
				{isBelowSwapMinimum}
				onAmountChange={(value) => (formInput.amount = value)}
				onUnitChange={handleUnitChange}
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
				onUnitChange={handleUnitChange}
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
					isLoadingFee={feeState.isLoading}
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
					isLoadingFee={feeState.isLoading}
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

				<!-- Charge Fees to Payer Toggle (Desktop - AFTER RoutePicker, BEFORE Total) -->
				{#if feeState.estimated && feeState.estimated.totalFees > 0 && formInput.selectedNetwork !== 'rootstock-bitcoin'}
					<button
						type="button"
						class="btn border-primary h-auto min-h-0 w-full touch-manipulation items-center justify-center gap-2 rounded-lg border-2 px-3 py-2 text-sm transition-colors select-none {formInput.chargeFeesToPayer
							? 'bg-primary text-primary-content hover:bg-primary/90'
							: 'btn-outline bg-base-100'}"
						style="-webkit-tap-highlight-color: transparent;"
						onclick={() => {
							formInput.chargeFeesToPayer = !formInput.chargeFeesToPayer;
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

				<!-- Total Received Card (Desktop) -->
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

				<!-- Memo/Description Field (Accordion - Desktop) -->
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
			</div>
		</div>
	</div>

	<!-- Bottom Action Button -->
	<div class="flex gap-2 border-t pt-3 sm:pt-4">
		<button class="btn btn-ghost min-h-[44px] flex-1" onclick={handleCancel}
			>{$t('common.cancel')}</button
		>
		<button
			class="btn btn-primary min-h-[44px] flex-1"
			onclick={handleGenerateInvoice}
			disabled={!isFormValid || isGenerating || feeState.isLoading}
		>
			{#if isGenerating}
				<span class="loading loading-spinner loading-xs"></span>
				{$t('wallet.receive.generating')}
			{:else}
				<IconCheck class="h-4 w-4 sm:h-5 sm:w-5" />
				{$t('wallet.receive.generate_invoice')}
			{/if}
		</button>
	</div>
</div>

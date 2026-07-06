<script lang="ts">
	import { t } from 'svelte-i18n';
	import { untrack } from 'svelte';
	import { btcPrice } from '$lib/runes/btcPrice.svelte';
	import {
		walletStore,
		walletManager,
		formatSats,
		formatUsd,
		allAssets
	} from '$lib/stores/wallet.store';
	import { appStore } from '$lib/stores/app.store';
	import AmountInputSection from '$lib/components/wallet/AmountInputSection.svelte';
	import RoutePicker from '$lib/components/wallet/RoutePicker.svelte';
	import ReceiveSwapSelector from '$lib/components/wallet/ReceiveSwapSelector.svelte';
	import SwapPartySelector from '$lib/components/wallet/SwapPartySelector.svelte';
	import ChargeFeesToggle from '$lib/components/wallet/ChargeFeesToggle.svelte';
	import TotalReceivedCard from '$lib/components/wallet/TotalReceivedCard.svelte';
	import DescriptionAccordion from '$lib/components/wallet/DescriptionAccordion.svelte';
	import type { AssetOption } from '$lib/components/wallet/AssetSelector.svelte';
	import { resolveRoute, type SourceWallet, type Route } from '$lib/services/route-resolver';
	import { connectedWalletsStore } from '$lib/stores/connected-wallets.store';
	import { FeatureFlagService, FEATURE_FLAGS } from '$lib/services/kill-switch';
	import { useReceiveFees } from '$lib/runes/use-receive-fees.svelte';
	import { generateReceiveInvoice } from '$lib/utils/generate-receive-invoice';
	import type { InvoiceFormState } from '$lib/utils/generate-receive-invoice';
	import { getSourceFromNetwork } from '$lib/utils/receive-network-mapping';
	import IconCheck from '~icons/mdi/check';
	import IconClose from '~icons/mdi/close';

	let {
		onCancel,
		onOpenPaymentRequest,
		initialFormState
	}: {
		onCancel: () => void;
		onOpenPaymentRequest: (data: {
			swapId?: string;
			address?: string;
			amount: number;
			memo?: string;
			network?: string;
			chargeFeesToPayer?: boolean;
			totalFees?: number;
			formState?: InvoiceFormState;
		}) => void;
		initialFormState?: InvoiceFormState;
	} = $props();

	// Grouped State: Form Input
	// Read initialFormState via untrack() to avoid Svelte 5 "captures initial value" warning.
	// We intentionally only want the initial prop value for $state() initialization.
	let formInput = $state(
		untrack(() => ({
			amount: initialFormState?.amount ?? '',
			unit: (initialFormState?.unit ?? 'usd') as 'sats' | 'usd',
			mathExpression: initialFormState?.mathExpression ?? '',
			memo: initialFormState?.memo ?? '',
			selectedNetwork: initialFormState?.selectedNetwork ?? 'rootstock-bitcoin',
			chargeFeesToPayer: initialFormState?.chargeFeesToPayer ?? false
		}))
	);

	let receiveTab = $state<'rbtc' | 'usdt0-arb' | 'wbtc-arb' | 'btc-onchain' | 'tbtc-arb'>('rbtc');
	let selectedReceiveWalletId = $state<string | null>(null);

	let isReceiveWalletValid = $derived.by(() => {
		if (!selectedReceiveWalletId) return false;
		return $connectedWalletsStore.wallets.some((w) => w.id === selectedReceiveWalletId);
	});

	// SwapPartySelector helpers
	function walletBtcSatsForFn(walletId: string): number {
		if (walletId === 'builtin') {
			const rbtcSats = $walletStore.totalBalances.sats;
			const wbtcAsset = $allAssets.find((a) => a.assetId === 'wbtc-arb');
			const wbtcSats = wbtcAsset ? Math.floor(wbtcAsset.balance * 100_000_000) : 0;
			const tbtcAsset = $allAssets.find((a) => a.assetId === 'tbtc-arb');
			const tbtcSats =
				tbtcAsset && tbtcAsset.balance > 0 ? Math.floor(tbtcAsset.balance * 100_000_000) : 0;
			return rbtcSats + wbtcSats + tbtcSats;
		}
		const w = $connectedWalletsStore.wallets.find((w) => w.id === walletId);
		if (!w?.balances) return 0;
		return (
			Number(w.balances.rbtc?.raw ?? 0) +
			Number(w.balances.wbtc?.raw ?? 0) +
			Number(w.balances.btc?.raw ?? 0)
		);
	}

	function walletUsdt0ForFn(walletId: string): number {
		if (walletId === 'builtin') {
			const usdt0Asset = $allAssets.find((a) => a.assetId === 'usdt0-arb');
			return usdt0Asset?.usdValue ?? usdt0Asset?.balance ?? 0;
		}
		const w = $connectedWalletsStore.wallets.find((w) => w.id === walletId);
		if (!w?.balances) return 0;
		return Number(w.balances['usdt0-arb']?.raw ?? 0) / 1e6;
	}

	// Build asset list for SwapPartySelector
	let receiveAssets: AssetOption[] = $derived.by(() => {
		const isBuiltin = !selectedReceiveWalletId;
		const cw = !isBuiltin
			? $connectedWalletsStore.wallets.find((w) => w.id === selectedReceiveWalletId)
			: null;
		const cwBal = cw?.balances;

		const rbtcSats = isBuiltin ? $walletStore.totalBalances.sats : Number(cwBal?.rbtc?.raw ?? 0);
		const rbtcUsd = (rbtcSats / 100_000_000) * btcPrice.price;
		const usdt0Usd = isBuiltin
			? (() => {
					const a = $allAssets.find((a) => a.assetId === 'usdt0-arb');
					return a && a.balance > 0 ? (a.usdValue ?? a.balance) : 0;
				})()
			: Number(cwBal?.['usdt0-arb']?.raw ?? 0) / 1e6;
		const wbtcSats = isBuiltin
			? (() => {
					const a = $allAssets.find((a) => a.assetId === 'wbtc-arb');
					return a ? Math.floor(a.balance * 100_000_000) : 0;
				})()
			: Number(cwBal?.wbtc?.raw ?? 0);
		const wbtcUsd = (wbtcSats / 100_000_000) * btcPrice.price;
		const tbtcSats = isBuiltin
			? (() => {
					const a = $allAssets.find((a) => a.assetId === 'tbtc-arb');
					return a && a.balance > 0 ? Math.floor(a.balance * 100_000_000) : 0;
				})()
			: Math.round(Number(cwBal?.['tbtc-arb']?.raw ?? 0) / 10_000_000_000);
		const tbtcUsd = (tbtcSats / 100_000_000) * btcPrice.price;

		return [
			{
				id: 'rbtc',
				label: $t('wallet.receive.bitcoin_rbtc'),
				icon: '/images/chains/Bitcoin-Rootstock-logo.webp',
				subLabel: $t('wallet.receive.bitcoin_on_rootstock'),
				balance: formatSats(rbtcSats) + ' Sats',
				balanceSub: rbtcUsd > 0 ? `≈ $${rbtcUsd.toFixed(2)}` : undefined
			},
			{
				id: 'usdt0-arb',
				label: $t('wallet.receive.usd'),
				icon: '/images/chains/Tether-USD.svg',
				subLabel: $t('wallet.receive.usdt0_arbitrum'),
				balance: usdt0Usd > 0 ? formatUsd(usdt0Usd) : formatUsd(0)
			},
			{
				id: 'wbtc-arb',
				label: $t('wallet.receive.bitcoin_wbtc'),
				icon: '/images/chains/arbitrum.png',
				subLabel: $t('wallet.receive.wbtc_arbitrum'),
				balance: formatSats(wbtcSats) + ' Sats',
				balanceSub: wbtcUsd > 0 ? `≈ $${wbtcUsd.toFixed(2)}` : undefined
			},
			...(tbtcSats > 0
				? [
						{
							id: 'tbtc-arb' as const,
							label: $t('wallet.receive.bitcoin_tbtc'),
							icon: '/images/tokens/tbtc.png',
							subLabel: $t('wallet.receive.bridged_btc_arbitrum'),
							balance: formatSats(tbtcSats) + ' Sats',
							balanceSub: tbtcUsd > 0 ? `≈ $${tbtcUsd.toFixed(2)}` : undefined
						}
					]
				: [])
		];
	});

	// Auto-select destination network
	let payerNetwork = $state<string>('rootstock-bitcoin');

	$effect(() => {
		if (selectedReceiveWalletId && isReceiveWalletValid) return;
		const tab = receiveTab;
		if (tab === 'usdt0-arb') formInput.selectedNetwork = 'usdt0-arbitrum';
		else if (tab === 'wbtc-arb') formInput.selectedNetwork = 'wbtc-arbitrum';
		else if (tab === 'tbtc-arb') formInput.selectedNetwork = 'tbtc-arbitrum';
		else if (tab === 'btc-onchain') formInput.selectedNetwork = 'bitcoin';
		else {
			if (payerNetwork === 'lightning-bitcoin') formInput.selectedNetwork = 'lightning-bitcoin';
			else if (payerNetwork === 'bitcoin') formInput.selectedNetwork = 'bitcoin';
			else if (payerNetwork === 'liquid-bitcoin') formInput.selectedNetwork = 'liquid-bitcoin';
			else formInput.selectedNetwork = 'rootstock-bitcoin';
		}
	});

	// UI State
	let uiState = $state({ descriptionExpanded: false, calculatorKey: 0 });

	// Swap routing state
	let payerSourceWallet = $derived<SourceWallet>(getSourceFromNetwork(payerNetwork));
	let selectedRouteId = $state<string>('');
	let swapRoutes = $derived.by(() => {
		if (amountInSats === 0) return [];
		const sourceWallet: SourceWallet = payerSourceWallet;
		const destNetwork = formInput.selectedNetwork;
		let routes: Route[] = [];
		if (
			[
				'usdt-bsc',
				'rootstock-bitcoin',
				'usdt0-arbitrum',
				'wbtc-arbitrum',
				'tbtc-arbitrum'
			].includes(destNetwork)
		) {
			const chainId =
				destNetwork === 'usdt-bsc'
					? 56
					: ['usdt0-arbitrum', 'wbtc-arbitrum', 'tbtc-arbitrum'].includes(destNetwork)
						? 42161
						: 30;
			const dest = { type: 'address' as const, chainId, address: $walletStore.rsk.address ?? '' };
			routes = resolveRoute(sourceWallet, dest);
		} else if (destNetwork === 'lightning-bitcoin') {
			routes = resolveRoute(sourceWallet, { type: 'invoice', network: 'lightning', invoice: '' });
		} else if (destNetwork === 'bitcoin' || destNetwork === 'liquid-bitcoin') {
			routes = resolveRoute(sourceWallet, { type: 'invoice', network: 'onchain', invoice: '' });
		}
		return routes.sort((a, b) => a.totalFeePercent - b.totalFeePercent);
	});

	let isGenerating = $state(false);

	// Derived values
	const amountInSats = $derived.by(() => {
		if (formInput.unit === 'sats') {
			const parsed = parseFloat(formInput.amount);
			return isNaN(parsed) ? 0 : Math.floor(parsed);
		}
		const usdAmount = parseFloat(formInput.amount);
		if (isNaN(usdAmount) || btcPrice.price === 0) return 0;
		return Math.floor((usdAmount / btcPrice.price) * 100_000_000);
	});

	$effect(() => {
		if (swapRoutes.length > 0) {
			if (!swapRoutes.find((r) => r.id === selectedRouteId)) selectedRouteId = swapRoutes[0].id;
		} else {
			selectedRouteId = '';
		}
	});

	// Fee estimation rune
	const feeEst = useReceiveFees({
		getAmountInSats: () => amountInSats,
		getPayerNetwork: () => payerNetwork,
		getSelectedNetwork: () => formInput.selectedNetwork,
		getReceiveTab: () => receiveTab,
		getRskAddress: () => $walletStore.rsk.address ?? undefined,
		getCachedReverseSwapPairs: () => walletManager.getCachedReverseSwapPairs(),
		getCachedChainSwapPairs: () => walletManager.getCachedChainSwapPairs()
	});

	// Derived fee values
	const totalReceived = $derived.by(() => {
		if (!feeEst.estimated || amountInSats === 0) return 0;
		if (formInput.chargeFeesToPayer) return amountInSats;
		return Math.max(0, amountInSats - feeEst.estimated.totalFees);
	});

	const amountPayerPays = $derived.by(() => {
		if (amountInSats === 0) return 0;
		if (!feeEst.estimated) return amountInSats;
		if (formInput.chargeFeesToPayer) return amountInSats + feeEst.estimated.totalFees;
		return amountInSats;
	});

	const isBelowSwapMinimum = $derived.by(() => {
		const networksRequiringSwaps = ['lightning-bitcoin', 'liquid-bitcoin', 'bitcoin'];
		if (!networksRequiringSwaps.includes(formInput.selectedNetwork)) return false;
		if (!feeEst.swapLimits || amountPayerPays === 0) return false;
		return amountPayerPays < feeEst.swapLimits.minimal;
	});

	const totalReceivedUSD = $derived.by(() => {
		if (totalReceived === 0 || btcPrice.price === 0) return 0;
		return (totalReceived / 100_000_000) * btcPrice.price;
	});

	const isFormValid = $derived(amountInSats > 0);

	// Auto-estimate fee when inputs change
	$effect(() => {
		if (amountInSats > 0) {
			feeEst.refresh();
		}
	});

	// Handlers
	function handleCalculationChange(expression: string, result: number) {
		formInput.mathExpression = expression;
		if (result > 0 || expression === '') {
			formInput.amount =
				formInput.unit === 'sats'
					? Math.floor(result).toString()
					: result.toFixed(2).replace(/\.?0+$/, '');
		}
		feeEst.refresh();
	}

	function handleClearCalculator() {
		formInput.amount = '';
		formInput.mathExpression = '';
		uiState.calculatorKey++;
	}

	function handleUnitChange(newUnit: 'sats' | 'usd') {
		formInput.unit = newUnit;
		formInput.mathExpression = '';
		feeEst.refresh();
	}

	async function handleGenerateInvoice() {
		if (!isFormValid || isGenerating) return;
		isGenerating = true;

		const invoiceAmount =
			formInput.chargeFeesToPayer && feeEst.estimated ? amountPayerPays : amountInSats;
		const formState: InvoiceFormState = {
			amount: formInput.amount,
			unit: formInput.unit,
			mathExpression: formInput.mathExpression,
			memo: formInput.memo,
			selectedNetwork: formInput.selectedNetwork,
			chargeFeesToPayer: formInput.chargeFeesToPayer
		};

		await generateReceiveInvoice(
			{
				invoiceAmount,
				selectedNetwork: formInput.selectedNetwork,
				selectedReceiveWalletId,
				isReceiveWalletValid,
				formState,
				totalFees: feeEst.estimated?.totalFees ?? 0,
				rskAddress: $walletStore.rsk.address ?? undefined,
				rskConnected: $walletStore.rsk.connected,
				bscAddress: $walletStore.bsc.address ?? undefined,
				bscConnected: $walletStore.bsc.connected,
				swapRoutesCount: swapRoutes.length
			},
			{
				onSuccess: (result) => {
					appStore.showSuccessToast($t('wallet.receive.lightning_invoice_created'));
					onOpenPaymentRequest(result);
				},
				onError: (msg) => {
					appStore.showErrorToast($t(msg));
				},
				onClose: () => {
					onCancel();
				}
			}
		);

		isGenerating = false;
	}

	function handleCancel() {
		formInput.amount = '';
		formInput.memo = '';
		onCancel();
	}
</script>

<div class="flex min-h-0 flex-1 flex-col">
	<!-- Scrollable Content Area -->
	<div class="min-h-0 flex-1 space-y-3 overflow-y-auto sm:space-y-4">
		<!-- Destination Wallet + Asset Selector -->
		<SwapPartySelector
			label={$t('wallet.to')}
			selectedWalletId={selectedReceiveWalletId ?? 'builtin'}
			onWalletSelect={(id) => {
				selectedReceiveWalletId = id === 'builtin' ? null : id;
			}}
			connectedWallets={FeatureFlagService.isEnabled(FEATURE_FLAGS.CONNECTED_WALLETS)
				? $connectedWalletsStore.wallets
				: []}
			walletBtcSatsFor={walletBtcSatsForFn}
			walletUsdt0For={walletUsdt0ForFn}
			btcPrice={btcPrice.price}
			selectedAssetId={receiveTab}
			onAssetSelect={(id) => {
				receiveTab = id as typeof receiveTab;
			}}
			assets={receiveAssets}
		/>

		<!-- Payer Source Network Selector -->
		{#if !selectedReceiveWalletId}
			<ReceiveSwapSelector
				receiveCurrency={receiveTab}
				onChange={(network) => {
					payerNetwork = network;
					feeEst.refresh();
				}}
			/>
		{/if}

		<!-- Amount Input Section -->
		<AmountInputSection
			amount={formInput.amount}
			unit={formInput.unit}
			mathExpression={formInput.mathExpression}
			calculatorKey={uiState.calculatorKey}
			belowMinimum={isBelowSwapMinimum}
			onAmountChange={(value) => (formInput.amount = value)}
			onUnitChange={handleUnitChange}
			onCalculationChange={handleCalculationChange}
			onClear={handleClearCalculator}
		/>

		<!-- RoutePicker -->
		<RoutePicker
			routes={swapRoutes}
			{selectedRouteId}
			onSelect={(id) => (selectedRouteId = id)}
			networkFeeSats={feeEst.estimated?.networkFee ?? 0}
			isLoadingFee={feeEst.isLoading}
			btcPrice={btcPrice.price}
			network={formInput.selectedNetwork}
			amountSats={amountInSats}
			hasAddress={true}
			hasAmount={amountInSats > 0}
			swapFeeOverride={feeEst.estimated?.serviceFee}
		/>

		{#if feeEst.error}
			<div class="text-error text-xs">{$t('wallet.swap.error.fee_fetch_failed')}</div>
		{/if}

		<!-- Charge Fees to Payer Toggle -->
		<ChargeFeesToggle
			enabled={formInput.chargeFeesToPayer}
			disabled={!feeEst.estimated ||
				feeEst.estimated.totalFees <= 0 ||
				formInput.selectedNetwork === 'rootstock-bitcoin'}
			onToggle={() => {
				formInput.chargeFeesToPayer = !formInput.chargeFeesToPayer;
			}}
		/>

		<!-- Total Received Card -->
		<TotalReceivedCard
			{totalReceived}
			{totalReceivedUSD}
			{receiveTab}
			{isBelowSwapMinimum}
			swapLimitsMinimal={feeEst.swapLimits?.minimal ?? 0}
			hasFeeEstimate={!!feeEst.estimated}
			{amountInSats}
		/>

		<!-- Memo/Description Field -->
		<DescriptionAccordion
			memo={formInput.memo}
			expanded={uiState.descriptionExpanded}
			onMemoChange={(val) => (formInput.memo = val)}
			onToggle={(expanded) => (uiState.descriptionExpanded = expanded)}
		/>
	</div>

	<!-- Bottom Action Button -->
	<div class="flex gap-2 border-t pt-3 sm:pt-4">
		<button
			class="btn btn-error min-h-[44px] flex-1 touch-manipulation transition-transform duration-100 select-none active:scale-95"
			onclick={handleCancel}
		>
			<IconClose class="h-4 w-4" />
			<span class="text-sm">{$t('common.cancel')}</span>
		</button>
		<button
			class="btn btn-primary min-h-[44px] flex-1"
			onclick={handleGenerateInvoice}
			disabled={!isFormValid || isGenerating || feeEst.isLoading}
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

<script lang="ts">
	import { t } from 'svelte-i18n';
	import SwapPartySelector from '$lib/components/wallet/SwapPartySelector.svelte';
	import type { AssetOption } from '$lib/components/wallet/AssetSelector.svelte';
	import AmountInputSection from '$lib/components/wallet/AmountInputSection.svelte';
	import SwapEstimateCard from '$lib/components/wallet/SwapEstimateCard.svelte';
	import PendingSwaps from '$lib/components/wallet/PendingSwaps.svelte';
	import { formatSats } from '$lib/stores/wallet.store';
	import type { ConnectedWalletEntry } from '$lib/stores/connected-wallets.store';
	import { isBitcoinAsset } from '$lib/utils/swap-helpers';

	interface RouteInfo {
		label?: string;
		estimatedTime?: string;
		totalFeePercent?: number;
	}

	interface SmartRouteDisplay {
		estimatedTimeMinutes?: number;
		totalFeePercent?: number;
		provider?: string;
		estimatedTime?: string;
	}

	let {
		sourceWallet,
		destWallet,
		onSourceWalletChange,
		onDestWalletChange,
		sourceType,
		destType,
		onSourceTypeChange,
		onDestTypeChange,
		sourceAssets,
		destAssets,
		connectedWallets,
		btcPrice,
		walletBtcSatsFor,
		walletUsdt0For,
		displayInputAmount,
		isBtcSource,
		btcUsdInputMode,
		btcUsdPrice,
		satsFormatter,
		usdFormatter,
		walletBalanceToken,
		walletBalanceDisplay,
		isInsufficientBalance,
		isOnline,
		minSliderPercent,
		swapPercent,
		minSwapSats,
		amountSats,
		amountInTokenUnits,
		isAmountError,
		isOutputTooLow,
		isSelfSend,
		selectedDest,
		totalFeeSats,
		estimatedOutput,
		routeLoading,
		smartRoute,
		activeRouteForCalc,
		effectiveSmartRoute,
		isDirectTransfer,
		directTransferNetworkFeeSats,
		getProviderLabel,
		isFlipping,
		onAmountChange,
		onPercentChange,
		onMaxAmount,
		onBtcUsdModeChange,
		onSwapDirection,
		satsUsd
	}: {
		sourceWallet: string;
		destWallet: string;
		onSourceWalletChange: (id: string) => void;
		onDestWalletChange: (id: string) => void;
		sourceType: string;
		destType: string;
		onSourceTypeChange: (id: string) => void;
		onDestTypeChange: (id: string) => void;
		sourceAssets: AssetOption[];
		destAssets: AssetOption[];
		connectedWallets: ConnectedWalletEntry[];
		btcPrice: number;
		walletBtcSatsFor: (walletId: string) => number;
		walletUsdt0For: (walletId: string) => number;
		displayInputAmount: string;
		isBtcSource: boolean;
		btcUsdInputMode: boolean;
		btcUsdPrice: number;
		satsFormatter: Intl.NumberFormat;
		usdFormatter: Intl.NumberFormat;
		walletBalanceToken: number;
		walletBalanceDisplay: string;
		isInsufficientBalance: boolean;
		isOnline: boolean;
		minSliderPercent: number;
		swapPercent: number;
		minSwapSats: number;
		amountSats: number;
		amountInTokenUnits: number;
		isAmountError: boolean;
		isOutputTooLow: boolean;
		isSelfSend: boolean;
		selectedDest?: { asset: string; icon: string; id: string };
		totalFeeSats: number;
		estimatedOutput: string;
		routeLoading: boolean;
		smartRoute?: RouteInfo | null;
		activeRouteForCalc?: RouteInfo | null;
		effectiveSmartRoute?: SmartRouteDisplay | null;
		isDirectTransfer: boolean;
		directTransferNetworkFeeSats: number;
		getProviderLabel: () => string;
		isFlipping: boolean;
		onAmountChange: (v: string) => void;
		onPercentChange: (pct: number) => void;
		onMaxAmount: () => void;
		onBtcUsdModeChange: (isUsd: boolean) => void;
		onSwapDirection: () => void;
		satsUsd: (sats: number, price: number) => string;
	} = $props();
</script>

<div class="flex flex-col gap-4">
	<!-- From: Dual-zone party selector (wallet + asset in one accordion) -->
	<SwapPartySelector
		label={$t('wallet.from')}
		selectedWalletId={sourceWallet}
		onWalletSelect={onSourceWalletChange}
		{connectedWallets}
		{walletBtcSatsFor}
		{walletUsdt0For}
		{btcPrice}
		selectedAssetId={sourceType}
		onAssetSelect={onSourceTypeChange}
		assets={sourceAssets}
	/>

	<!-- Swap Direction Button -->
	<div class="relative flex items-center justify-center py-1">
		<div class="border-base-300 absolute inset-x-0 top-1/2 border-t"></div>
		<button
			type="button"
			class="btn btn-circle btn-outline bg-base-100 relative z-10 min-h-[44px] min-w-[44px] touch-manipulation border-2 transition-transform duration-300 active:scale-95 sm:min-h-[48px] sm:min-w-[48px]"
			class:rotate-180={isFlipping}
			onclick={onSwapDirection}
			aria-label={$t('wallet.swap.swap_direction')}
		>
			<svg class="h-5 w-5 sm:h-6 sm:w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"
				/>
			</svg>
		</button>
	</div>

	<!-- To: Dual-zone party selector -->
	<SwapPartySelector
		label={$t('wallet.to')}
		selectedWalletId={destWallet}
		onWalletSelect={onDestWalletChange}
		{connectedWallets}
		{walletBtcSatsFor}
		{walletUsdt0For}
		{btcPrice}
		selectedAssetId={destType}
		onAssetSelect={onDestTypeChange}
		assets={destAssets}
	/>

	<!-- Amount Input (now unified via AmountInputSection direct variant for DRY + parity) -->
	<div class="form-control">
		<label for="swap-amount" class="label flex justify-between px-1 py-1">
			<span class="label-text text-sm sm:text-base">
				{#if isBtcSource && amountSats > 0}
					{#if btcUsdInputMode}
						{usdFormatter.format((amountSats / 100_000_000) * btcPrice)}
					{:else}
						{satsFormatter.format(amountSats)}
						{$t('wallet.sats')}
						({usdFormatter.format((amountSats / 100_000_000) * btcPrice)})
					{/if}
				{:else if isBtcSource}
					{btcUsdInputMode ? `$${$t('wallet.swap.asset.usd')}` : $t('wallet.sats')}
				{:else}
					{$t('wallet.swap.asset.usd')}
				{/if}
			</span>
			<span class="label-text-alt text-xs sm:text-sm">
				{$t('wallet.available_balance')}: {isBtcSource
					? satsUsd(Math.round(walletBalanceToken * 100_000_000), btcUsdPrice)
					: `${walletBalanceDisplay}`}
			</span>
		</label>
		<AmountInputSection
			variant="direct"
			amount={displayInputAmount}
			unit="sats"
			onUnitChange={() => {}}
			onAmountChange={(v: string) => onAmountChange(v)}
			tokenPrefix={isBtcSource ? undefined : '$'}
			showPercentSlider={true}
			sliderDisabled={walletBalanceToken <= 0}
			sliderMin={minSliderPercent}
			percent={swapPercent}
			onPercentChange={(pct: number) => onPercentChange(Math.max(pct, minSliderPercent))}
			onMaxAmount={async () => onMaxAmount()}
			disabled={!isOnline}
			hasInsufficientBalance={isInsufficientBalance}
			maxDisabled={walletBalanceToken <= 0}
			supportsBtcUsdToggle={isBtcSource}
			btcUsdMode={btcUsdInputMode}
			onBtcUsdModeChange={(isUsd: boolean) => onBtcUsdModeChange(isUsd)}
			btcNativeSymbol="₿"
			belowMinimum={isAmountError}
		/>
		<!-- Minimum swap amount note (always rendered, no layout shift) -->
		<div
			class="flex min-h-[1.25rem] items-center text-sm transition-colors duration-300 sm:text-base {minSwapSats >
				0 && !isAmountError
				? 'text-base-content/50'
				: ''} {isAmountError ? 'text-error' : ''}"
		>
			{#if minSwapSats > 0}
				{$t('wallet.swap.minimum_amount')}: {satsFormatter.format(minSwapSats)}
				{$t('wallet.sats')}{#if btcUsdPrice > 0}
					≈ {usdFormatter.format((minSwapSats / 100_000_000) * btcUsdPrice)}{/if}
			{/if}
		</div>
	</div>

	<!-- Fee/estimate card — always renders (no layout shift); skeleton while loading, dashes when empty -->
	{#if selectedDest}
		<SwapEstimateCard
			variant="form"
			totalSent={amountInTokenUnits > 0
				? isBtcSource
					? satsUsd(amountSats, btcUsdPrice)
					: usdFormatter.format(amountInTokenUnits)
				: undefined}
			feeDisplay={totalFeeSats > 0
				? `−${formatSats(totalFeeSats)} ${$t('wallet.sats')}${btcUsdPrice > 0 && (totalFeeSats / 100_000_000) * btcUsdPrice >= 0.001 ? ' ≈ ' + usdFormatter.format((totalFeeSats / 100_000_000) * btcUsdPrice) : ''}`
				: isDirectTransfer && directTransferNetworkFeeSats > 0
					? `~${formatSats(directTransferNetworkFeeSats)} ${$t('wallet.sats')}${btcUsdPrice > 0 ? ' ≈ ' + usdFormatter.format((directTransferNetworkFeeSats / 100_000_000) * btcUsdPrice) : ''}`
					: amountInTokenUnits > 0
						? $t('wallet.free')
						: undefined}
			youReceive={amountInTokenUnits > 0 && estimatedOutput
				? isBitcoinAsset(selectedDest.asset, selectedDest.id)
					? satsUsd(Math.round(parseFloat(estimatedOutput) * 100_000_000), btcUsdPrice)
					: usdFormatter.format(parseFloat(estimatedOutput))
				: undefined}
			providerLabel={smartRoute || effectiveSmartRoute
				? getProviderLabel()
				: activeRouteForCalc?.label || undefined}
			estimatedTime={effectiveSmartRoute?.estimatedTimeMinutes
				? `${effectiveSmartRoute.estimatedTimeMinutes} min`
				: activeRouteForCalc?.estimatedTime || undefined}
			feePercent={effectiveSmartRoute?.totalFeePercent ?? activeRouteForCalc?.totalFeePercent}
			{isDirectTransfer}
			loading={routeLoading}
			belowMinimum={isAmountError}
			{totalFeeSats}
			{amountSats}
		/>
	{/if}

	<!-- Insufficient balance -->
	{#if isInsufficientBalance}
		<div class="alert alert-outline alert-error py-2 sm:py-3">
			<span class="text-xs sm:text-sm">
				{$t('wallet.swap.insufficient_balance')}
			</span>
		</div>
	{/if}

	<!-- Output too low (fee exceeds input) -->
	{#if isOutputTooLow}
		<div class="alert alert-outline alert-error py-2 sm:py-3">
			<span class="text-xs sm:text-sm">
				{$t('wallet.swap.error.output_too_low')}
			</span>
		</div>
	{/if}

	<!-- Self-send warning -->
	{#if isSelfSend}
		<div class="alert alert-outline alert-warning py-2 sm:py-3">
			<span class="text-xs sm:text-sm">
				{$t('wallet.swap.error.self_send')}
			</span>
		</div>
	{/if}

	<!-- Pending swaps accordion -->
	<PendingSwaps />
</div>

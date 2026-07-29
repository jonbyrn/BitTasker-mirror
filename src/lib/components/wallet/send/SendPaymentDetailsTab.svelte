<!--
  SendPaymentDetailsTab — Presentational component for the "Enter Payment Details" tab.

  Renders: address input with validation, source wallet/asset selector,
  destination selector, amount input, route picker, total amount card,
  description accordion, validation alerts, and action buttons.

  Pure presentational — no business logic. All data via props, all interactions via callbacks.
-->
<script lang="ts">
	import { t } from 'svelte-i18n';
	import AmountInputSection from '$lib/components/wallet/AmountInputSection.svelte';
	import DescriptionAccordion from '$lib/components/wallet/DescriptionAccordion.svelte';
	import RoutePicker from '$lib/components/wallet/RoutePicker.svelte';
	import TotalAmountCard from '$lib/components/wallet/TotalAmountCard.svelte';
	import SwapPartySelector from '$lib/components/wallet/SwapPartySelector.svelte';
	import SendDestinationSelector from '$lib/components/wallet/SendDestinationSelector.svelte';
	import IconClose from '~icons/mdi/close';
	import IconSend from '~icons/mdi/send';
	import IconCheck from '~icons/mdi/check';
	import type { Route } from '$lib/services/route-resolver';
	import type { ConnectedWalletEntry } from '$lib/stores/connected-wallets.store';
	import type { AssetOption } from '$lib/components/wallet/AssetSelector.svelte';
	import { formatUsd } from '$lib/stores/wallet.store';

	interface Props {
		// ── Address ────────────────────────────────────────────────────
		addressInput: string;
		addressError: string | null;
		isValidAddress: boolean;
		// ── Recent addresses ───────────────────────────────────────────
		recentAddresses: Array<{ address: string; network: string; label?: string }>;
		showRecentAddresses: boolean;
		// ── Amount ─────────────────────────────────────────────────────
		amount: string;
		unit: 'sats' | 'usd';
		btcPrice: number;
		mathExpression: string;
		calculatorKey: number;
		amountInUSD: number;
		isAmountDisabled: boolean;
		// ── Routes ─────────────────────────────────────────────────────
		routes: Route[];
		selectedRouteId: string;
		networkFeeSats: number;
		isLoadingFee: boolean;
		network: string | null;
		amountSats: number;
		hasAddress: boolean;
		hasAmount: boolean;
		// ── Fee ────────────────────────────────────────────────────────

		feeError: string | null;
		isLoadingMaxCalculation: boolean;
		totalToSend: number;
		totalToSendUSD: number;
		totalUnit: 'sats' | 'usdt' | 'usd';
		// ── Validation ─────────────────────────────────────────────────
		hasInsufficientBalance: boolean;

		isFormValid: boolean;

		isSelfSend: boolean;
		showLargeAmountWarning: boolean;
		// ── Source wallet / asset selector ──────────────────────────────
		selectedWalletId: string;
		connectedWallets: ConnectedWalletEntry[];
		walletBtcSatsFor: (id: string) => number;
		walletUsdt0For: (id: string) => number;
		selectedAssetId: string;
		sourceAssets: AssetOption[];
		// ── Destination selector ───────────────────────────────────────
		destinationNetwork: string;
		isDestinationLocked: boolean;
		destinationLockedLabel: string;
		// ── Description / memo ─────────────────────────────────────────
		memo: string;
		descriptionExpanded: boolean;
		detectedMemo: string | null;
		// ── Transaction error ──────────────────────────────────────────
		transactionError: string | null;
		externalConfirmSource: string | null;
		// ── Events ─────────────────────────────────────────────────────
		onAddressChange: (value: string) => void;
		onClearAddress: () => void;
		onAddressFocus: () => void;
		onAddressBlur: () => void;
		onRecentAddressSelect: (address: string) => void;
		onAmountChange: (value: string) => void;
		onUnitChange: (unit: 'sats' | 'usd') => void;
		onCalculationChange: (expression: string, result: number) => void;
		onClear: () => void;
		onMaxAmount: () => Promise<void>;
		onRouteSelect: (id: string) => void;
		onWalletSelect: (id: string) => void;
		onAssetSelect: (id: string) => void;
		onDestinationChange: (networkId: string) => void;
		onMemoChange: (value: string) => void;
		onDescriptionToggle: (expanded: boolean) => void;
		onSend: () => void;
		onCancel: () => void;
		onPasteAddress?: () => void;
	}

	let {
		addressInput,
		addressError,
		isValidAddress,
		recentAddresses,
		showRecentAddresses,
		amount,
		unit,
		btcPrice,
		mathExpression,
		calculatorKey,
		amountInUSD,
		isAmountDisabled,
		routes,
		selectedRouteId,
		networkFeeSats,
		isLoadingFee,
		network,
		amountSats,
		hasAddress,
		hasAmount,
		feeError,
		isLoadingMaxCalculation,
		totalToSend,
		totalToSendUSD,
		totalUnit,
		hasInsufficientBalance,
		isFormValid,
		isSelfSend,
		showLargeAmountWarning,
		selectedWalletId,
		connectedWallets,
		walletBtcSatsFor,
		walletUsdt0For,
		selectedAssetId,
		sourceAssets,
		destinationNetwork,
		isDestinationLocked,
		destinationLockedLabel,
		memo,
		descriptionExpanded,
		detectedMemo,
		transactionError,
		externalConfirmSource,
		onAddressChange,
		onClearAddress,
		onAddressFocus,
		onAddressBlur,
		onRecentAddressSelect,
		onAmountChange,
		onUnitChange,
		onCalculationChange,
		onClear,
		onMaxAmount,
		onRouteSelect,
		onWalletSelect,
		onAssetSelect,
		onDestinationChange,
		onMemoChange,
		onDescriptionToggle,
		onSend,
		onCancel,
		onPasteAddress
	}: Props = $props();

	let addressBorderClass = $derived.by(() => {
		if (addressError) return 'border-error';
		if (isValidAddress && addressInput.trim()) return 'border-success';
		return 'border-primary';
	});
</script>

<!-- Enter Payment Details Tab — Single scrollable send flow -->
<div class="space-y-2 sm:space-y-4">
	<!-- Address Input -->
	<div class="form-control">
		<div class="relative">
			<div
				class="flex w-full items-stretch overflow-hidden rounded-lg border-2 transition-colors {addressBorderClass}"
			>
				<!-- Input field with validation icons -->
				<div class="bg-base-200 relative flex flex-1 items-center p-2">
					<div class="relative min-w-0 flex-1 pr-10 sm:pr-11">
						<input
							id="address-input"
							type="text"
							class="placeholder:text-base-content/50 w-full bg-transparent pl-6 text-base focus:outline-none"
							placeholder={$t('wallet.send.address_placeholder')}
							aria-label={$t('wallet.send.address_label')}
							value={addressInput}
							oninput={(e) => onAddressChange((e.target as HTMLInputElement).value)}
							onfocus={onAddressFocus}
							onblur={onAddressBlur}
						/>
						{#if addressInput.trim()}
							<div
								class="pointer-events-none absolute top-1/2 left-0 flex -translate-y-1/2 items-center gap-1"
							>
								{#if isValidAddress && !addressError}
									<IconCheck class="text-success h-5 w-5" />
								{:else if addressError}
									<IconClose class="text-error h-5 w-5" />
								{/if}
							</div>
						{/if}
					</div>
					<!-- Clear or Paste button -->
					{#if addressInput.trim()}
						<button
							type="button"
							class="btn btn-ghost btn-sm btn-circle text-error hover:bg-error/20 absolute right-2 flex h-9 min-h-[40px] w-9 min-w-[40px] touch-manipulation items-center justify-center p-0 select-none sm:right-2 sm:h-11 sm:min-h-[44px] sm:w-11 sm:min-w-[44px]"
							onclick={onClearAddress}
							aria-label={$t('wallet.send.clear_address')}
						>
							<IconClose class="h-6 w-6 sm:h-8 sm:w-8" />
						</button>
					{:else if onPasteAddress}
						<button
							type="button"
							class="btn btn-ghost btn-sm btn-circle text-base-content/50 hover:text-primary absolute right-2 flex h-9 min-h-[40px] w-9 min-w-[40px] touch-manipulation items-center justify-center p-0 select-none sm:right-2 sm:h-11 sm:min-h-[44px] sm:w-11 sm:min-w-[44px]"
							onclick={onPasteAddress}
							aria-label={$t('wallet.send.paste_address')}
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-5 w-5 sm:h-6 sm:w-6"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
								/>
							</svg>
						</button>
					{/if}
				</div>
			</div>
			{#if showRecentAddresses && recentAddresses.length > 0}
				<div
					class="border-base-300 bg-base-100 absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border shadow-lg"
				>
					{#each recentAddresses as recentAddress (recentAddress.address)}
						<button
							class="hover:bg-base-200 flex w-full items-center justify-between px-4 py-2 text-left"
							onclick={() => onRecentAddressSelect(recentAddress.address)}
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
	</div>

	<!-- Source Wallet + Asset Selector -->
	<SwapPartySelector
		label={$t('wallet.from')}
		{selectedWalletId}
		{onWalletSelect}
		{connectedWallets}
		{walletBtcSatsFor}
		{walletUsdt0For}
		{btcPrice}
		{selectedAssetId}
		{onAssetSelect}
		assets={sourceAssets}
	/>

	<!-- Destination Selector -->
	<SendDestinationSelector
		selectedId={destinationNetwork}
		onChange={onDestinationChange}
		locked={isDestinationLocked}
		lockedLabel={destinationLockedLabel}
	/>

	<!-- Amount Field -->
	<div class="form-control min-h-0">
		<AmountInputSection
			{amount}
			{unit}
			{mathExpression}
			{calculatorKey}
			{network}
			{isLoadingMaxCalculation}
			disabled={isAmountDisabled}
			{hasInsufficientBalance}
			{onAmountChange}
			{onUnitChange}
			{onCalculationChange}
			{onClear}
			{onMaxAmount}
		/>
		{#if showLargeAmountWarning}
			<p class="text-error text-center text-sm">
				{$t('wallet.send.large_amount_warning.message', {
					values: { amount: formatUsd(amountInUSD) }
				})}
			</p>
		{/if}
	</div>

	{#if feeError}
		<div class="alert alert-outline alert-error py-2 text-sm" role="status" aria-live="polite">
			<span>{feeError}</span>
		</div>
	{:else if routes.length > 0 && network}
		<RoutePicker
			{routes}
			{selectedRouteId}
			onSelect={onRouteSelect}
			{networkFeeSats}
			{isLoadingFee}
			{btcPrice}
			{network}
			{amountSats}
			{hasAddress}
			{hasAmount}
		/>
	{:else}
		<RoutePicker
			routes={[]}
			selectedRouteId=""
			onSelect={() => {}}
			networkFeeSats={0}
			{isLoadingFee}
			{btcPrice}
			{network}
			{amountSats}
			{hasAddress}
			{hasAmount}
		/>
	{/if}

	<TotalAmountCard
		label={$t('wallet.send.total_to_send')}
		amount={totalToSend}
		unit={totalUnit}
		usdValue={totalToSendUSD}
		isError={hasInsufficientBalance}
	/>

	<!-- Description Accordion -->
	<div class="form-control">
		<DescriptionAccordion
			{memo}
			expanded={descriptionExpanded}
			disabled={false}
			labelText={detectedMemo ? 'wallet.send.from_invoice' : undefined}
			{onMemoChange}
			onToggle={onDescriptionToggle}
		/>
	</div>

	<!-- Address Error (e.g., amountless invoice) -->
	{#if addressError}
		<div class="alert alert-outline alert-error mt-2 text-sm" role="status" aria-live="polite">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-5 w-5 shrink-0 stroke-current"
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
			<span>{addressError}</span>
		</div>
	{/if}

	<!-- Self-send Error -->
	{#if isSelfSend && !addressError && isValidAddress}
		<div class="alert alert-outline alert-warning mt-2 text-sm" role="status" aria-live="polite">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-5 w-5 shrink-0 stroke-current"
				fill="none"
				viewBox="0 0 24 24"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
				/>
			</svg>
			<span>{$t('wallet.send.error.self_send')}</span>
		</div>
	{/if}

	<!-- Transaction Error Display -->
	{#if transactionError}
		<div class="alert alert-outline alert-error" role="status" aria-live="polite">
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
				<span class="text-sm opacity-90">{transactionError}</span>
			</div>
		</div>
	{/if}

	<!-- External Confirmation Pending -->
	{#if externalConfirmSource}
		<div class="alert alert-outline alert-info">
			<span class="loading loading-spinner loading-xs"></span>
			<div class="flex flex-col gap-1">
				<span class="text-sm font-semibold"
					>{$t('wallet.send.confirm_in_wallet', {
						values: { wallet: externalConfirmSource }
					})}</span
				>
				<span class="text-xs opacity-70">{$t('wallet.send.complete_in_wallet_extension')}</span>
			</div>
		</div>
	{/if}
</div>

<!-- Action Buttons -->
<div
	class="bg-base-100 sticky bottom-0 z-10 mt-auto flex shrink-0 gap-2 pt-3 pb-3 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] sm:gap-3 sm:pt-4 sm:pb-4 md:static md:mb-4 md:pt-0 md:pb-0 md:shadow-none"
>
	<!-- Mobile: Cancel and Send -->
	<button
		class="btn btn-error min-h-[44px] flex-1 touch-manipulation transition-transform duration-100 select-none active:scale-95 sm:hidden"
		onclick={onCancel}
	>
		<IconClose class="h-4 w-4" />
		<span class="text-sm">{$t('common.cancel')}</span>
	</button>
	<button
		class="btn btn-primary min-h-[44px] flex-1 touch-manipulation transition-transform duration-100 select-none active:scale-95 sm:hidden"
		onclick={onSend}
		disabled={!isFormValid || isLoadingFee || externalConfirmSource !== null}
	>
		<IconSend class="h-4 w-4" />
		<span class="text-sm">{$t('wallet.send.send')}</span>
	</button>

	<!-- Desktop: Cancel and Send -->
	<button
		class="btn btn-error hidden min-h-[44px] flex-1 touch-manipulation transition-transform duration-100 select-none active:scale-95 sm:flex sm:min-h-[48px] md:min-h-[56px]"
		onclick={onCancel}
	>
		<IconClose class="h-4 w-4 sm:h-5 sm:w-5" />
		<span class="text-sm sm:text-base">{$t('common.cancel')}</span>
	</button>
	<button
		class="btn btn-primary hidden min-h-[44px] flex-1 touch-manipulation transition-transform duration-100 select-none active:scale-95 sm:flex sm:min-h-[48px] md:min-h-[56px]"
		onclick={onSend}
		disabled={!isFormValid || isLoadingFee || externalConfirmSource !== null}
	>
		<IconSend class="h-4 w-4 sm:h-5 sm:w-5" />
		<span class="text-sm sm:text-base">{$t('wallet.send.send')}</span>
	</button>
</div>

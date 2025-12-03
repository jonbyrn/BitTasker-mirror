<script lang="ts">
	import { t } from 'svelte-i18n';
	import { triggerHaptic, ImpactStyle } from '$lib/utils/helpers/haptics';
	import CalculatorKeypad from '$lib/components/wallet/CalculatorKeypad.svelte';
	import DescriptionAccordion from '$lib/components/wallet/DescriptionAccordion.svelte';
	import IconCurrencyUsd from '~icons/mdi/currency-usd';
	import IconCurrencyBtc from '~icons/mdi/currency-btc';
	import IconClose from '~icons/mdi/close';

	interface Props {
		amount: string;
		unit: 'sats' | 'usd';
		mathExpression?: string;
		calculatorKey?: number;
		memo?: string;
		descriptionExpanded?: boolean;
		estimatedFees?: number; // Network fees in sats
		totalAmount?: number; // Total amount (amount + fees) in sats
		amountInSats?: number; // Amount in sats (for calculations)
		btcPrice?: number; // BTC price for USD conversions
		isLoadingFees?: boolean;
		network?: string | null; // Detected network for balance calculation
		availableBalance?: number; // Available balance in sats for the network
		calculatedMaxAmount?: number | null; // Pre-calculated max amount
		isLoadingMaxCalculation?: boolean; // Loading state for max calculation
		onAmountChange: (value: string) => void;
		onUnitChange: (unit: 'sats' | 'usd') => void;
		onCalculationChange?: (expression: string, result: number) => void;
		onClear?: () => void;
		onMaxAmount?: () => Promise<void>; // Callback to calculate and set max amount
		onMemoChange?: (value: string) => void;
		onDescriptionToggle?: (expanded: boolean) => void;
	}

	let {
		amount,
		unit,
		mathExpression = '',
		calculatorKey = 0,
		memo = '',
		descriptionExpanded = false,
		estimatedFees = 0,
		totalAmount = 0,
		amountInSats = 0,
		btcPrice = 0,
		isLoadingFees = false,
		network = null,
		availableBalance = 0,
		calculatedMaxAmount = null,
		isLoadingMaxCalculation = false,
		onAmountChange,
		onUnitChange,
		onCalculationChange,
		onClear,
		onMaxAmount,
		onMemoChange,
		onDescriptionToggle
	}: Props = $props();

	function handleCalculatorInput(value: string) {
		onAmountChange(value);
	}

	function handleCalculationChange(expression: string, result: number) {
		if (onCalculationChange) {
			onCalculationChange(expression, result);
		} else {
			// Default behavior: update amount with result
			if (result > 0 || expression === '') {
				if (unit === 'sats') {
					onAmountChange(Math.floor(result).toString());
				} else {
					onAmountChange(result.toFixed(2).replace(/\.?0+$/, ''));
				}
			}
		}
	}

	function handleUnitToggle(newUnit: 'sats' | 'usd') {
		triggerHaptic(ImpactStyle.Light);
		onUnitChange(newUnit);
		// Clear amount when switching units
		onAmountChange('');
	}

	function handleClear() {
		if (onClear) {
			triggerHaptic(ImpactStyle.Light);
			onClear();
		}
	}

	// Check if max button should be disabled
	const isMaxDisabled = $derived.by(() => {
		// Disable if no network detected
		if (!network) return true;
		// Disable if no available balance
		if (!availableBalance || availableBalance <= 0) return true;
		return false;
	});

	// Handle max button click
	async function handleMax() {
		if (isMaxDisabled || !onMaxAmount) return;
		
		triggerHaptic(ImpactStyle.Light);
		await onMaxAmount();
	}


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

	// Calculate total amount in USD
	const totalAmountUSD = $derived.by(() => {
		if (totalAmount === 0 || btcPrice === 0) return 0;
		return (totalAmount / 100_000_000) * btcPrice;
	});

	// Calculate amount in USD (without fees)
	const amountUSD = $derived.by(() => {
		if (amountInSats === 0 || btcPrice === 0) return 0;
		return (amountInSats / 100_000_000) * btcPrice;
	});
</script>

<div class="space-y-4">
	<!-- Amount Display (shows calculation and result) with attached Max button -->
	<div class="flex items-stretch w-full overflow-hidden rounded-lg border-2 border-primary">
		<!-- Input display area (grey bar) - takes remaining width -->
		<div class="flex items-center justify-center gap-2 flex-1 bg-base-200 p-1">
			{#if mathExpression || amount}
				<div class="flex items-center justify-center gap-2 w-full">
					{#if unit === 'usd'}
						<span class="text-lg font-bold text-primary ml-1">$</span>
					{:else}
						<IconCurrencyBtc class="w-5 h-5 text-primary" />
					{/if}
					<div class="text-lg font-bold text-center flex-1">
						{mathExpression || amount || '0'}
					</div>
					{#if onClear}
						<button
							type="button"
							class="btn btn-ghost btn-sm btn-circle min-h-0 h-6 w-6 p-0 text-error hover:bg-error/20 touch-manipulation select-none"
							style="-webkit-tap-highlight-color: transparent;"
							onclick={handleClear}
							aria-label="Clear calculator"
						>
							<IconClose class="w-6 h-6" />
						</button>
					{/if}
				</div>
			{:else}
				<div class="flex items-center justify-center gap-2 w-full">
					{#if unit === 'usd'}
						<span class="text-lg font-bold text-primary ml-1">$</span>
					{:else}
						<IconCurrencyBtc class="w-5 h-5 text-primary" />
					{/if}
					<div class="text-lg font-bold text-center flex-1">0</div>
				</div>
			{/if}
		</div>
		<!-- Max button (orange, pill-shaped) - width of text + px-1, flat left edge, rounded right -->
		<button
			type="button"
			class="bg-primary text-primary-content font-semibold px-3 py-1 touch-manipulation select-none disabled:opacity-50 transition-opacity rounded-r-lg rounded-l-none flex items-center justify-center whitespace-nowrap min-w-[60px]"
			style="-webkit-tap-highlight-color: transparent;"
			onclick={handleMax}
			disabled={isMaxDisabled || isLoadingMaxCalculation}
			aria-label="Set maximum amount"
		>
			{#if isLoadingMaxCalculation}
				<span class="loading loading-spinner loading-xs"></span>
			{:else}
				{$t('wallet.max')}
			{/if}
		</button>
	</div>

	<!-- Unit Toggle Buttons -->
	<div class="grid grid-cols-2 border border-base-300 rounded-lg overflow-hidden bg-base-100">
		<button
			type="button"
			class="flex items-center justify-center gap-2 text-2xl p-2 font-semibold touch-manipulation select-none transition-colors cursor-pointer border-r border-base-300 {unit === 'usd' ? 'bg-primary text-primary-content' : 'bg-base-100 text-base-content active:bg-base-300'}"
			style="-webkit-tap-highlight-color: transparent;"
			onclick={() => handleUnitToggle('usd')}
			aria-label="USD"
		>
			<IconCurrencyUsd class="w-5 h-5" />
			<span>USD</span>
		</button>
		<button
			type="button"
			class="flex items-center justify-center gap-2 text-2xl p-2 font-semibold touch-manipulation select-none transition-colors cursor-pointer {unit === 'sats' ? 'bg-primary text-primary-content' : 'bg-base-100 text-base-content active:bg-base-300'}"
			style="-webkit-tap-highlight-color: transparent;"
			onclick={() => handleUnitToggle('sats')}
			aria-label="Sats"
		>
			<IconCurrencyBtc class="w-5 h-5" />
			<span>Sats</span>
		</button>
	</div>

	<!-- Calculator -->
	{#key calculatorKey}
		<CalculatorKeypad {unit} onInput={handleCalculatorInput} onCalculationChange={handleCalculationChange} />
	{/key}

	<!-- Memo/Description Field (Accordion) -->
	{#if onMemoChange}
		<DescriptionAccordion
			{memo}
			expanded={descriptionExpanded}
			onMemoChange={(value) => onMemoChange?.(value)}
			onToggle={(expanded) => onDescriptionToggle?.(expanded)}
		/>
	{/if}

	<!-- Calculated Total Box with Network Fees -->
	{#if estimatedFees !== undefined && totalAmount !== undefined}
		{#if isLoadingFees}
			<div class="flex items-center justify-center gap-2 rounded-lg border border-base-300 bg-base-200 p-4">
				<span class="loading loading-spinner loading-sm"></span>
				<span class="text-sm">{$t('wallet.swap.loading_fees')}</span>
			</div>
		{:else if estimatedFees > 0 && amountInSats > 0}
			<div class="space-y-2 rounded-lg border border-base-300 bg-base-200 p-4">
				<div class="flex items-center justify-between text-sm">
					<span class="opacity-70">{$t('wallet.send.receiver_gets')}:</span>
					<span class="font-semibold">{formatSats(amountInSats)} {$t('wallet.sats')}</span>
				</div>
				<div class="flex items-center justify-between text-sm">
					<span class="opacity-70">{$t('wallet.network_fee')}:</span>
					<span>{formatSats(estimatedFees)} {$t('wallet.sats')}</span>
				</div>
				<div class="divider my-1.5"></div>
				<div class="flex items-center justify-between font-bold text-lg">
					<span>{$t('wallet.send.total_to_send')}:</span>
					<span class="text-primary">{formatSats(totalAmount)} {$t('wallet.sats')}</span>
				</div>
			</div>
		{/if}
	{/if}
</div>


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
		disabled?: boolean; // Whether the input and calculator should be disabled
		onAmountChange: (value: string) => void;
		onUnitChange: (unit: 'sats' | 'usd') => void;
		onCalculationChange?: (expression: string, result: number) => void;
		onClear?: () => void;
		onMaxAmount?: () => Promise<void>; // Callback to calculate and set max amount
		onMemoChange?: (value: string) => void;
		onDescriptionToggle?: (expanded: boolean) => void;
		descriptionDisabled?: boolean; // Whether the description accordion should be disabled
		descriptionLabelText?: string; // Custom label text for description (e.g., "wallet.send.from_invoice")
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
		disabled = false,
		onAmountChange,
		onUnitChange,
		onCalculationChange,
		onClear,
		onMaxAmount,
		onMemoChange,
		onDescriptionToggle,
		descriptionDisabled = false,
		descriptionLabelText
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
		// Keep amount when switching units - user may have entered amount before selecting unit
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
	<div class="flex items-stretch w-full overflow-hidden rounded-lg border-2 border-primary" class:opacity-50={disabled}>
		<!-- Input display area (grey bar) - takes remaining width -->
		<div class="flex items-center justify-center gap-2 flex-1 bg-base-200 p-1" class:bg-base-300={disabled}>
			{#if mathExpression || amount}
				<div class="flex items-center justify-center gap-2 w-full">
					{#if unit === 'usd'}
						<span class="text-3xl font-bold text-primary ml-1">$</span>
					{:else}
						<IconCurrencyBtc class="w-8 h-8 text-primary" />
					{/if}
					<div class="text-3xl font-bold text-center flex-1">
						{mathExpression || amount || '0'}
					</div>
					{#if onClear}
						<button
							type="button"
							class="btn btn-ghost btn-sm btn-circle min-h-[44px] min-w-[44px] h-11 w-11 p-0 text-error hover:bg-error/20 touch-manipulation select-none flex items-center justify-center"
							style="-webkit-tap-highlight-color: transparent;"
							onclick={handleClear}
							disabled={disabled}
							aria-label="Clear calculator"
						>
							<IconClose class="w-8 h-8" />
						</button>
					{/if}
				</div>
			{:else}
				<div class="flex items-center justify-center gap-2 w-full">
					{#if unit === 'usd'}
						<span class="text-3xl font-bold text-primary ml-1">$</span>
					{:else}
						<IconCurrencyBtc class="w-8 h-8 text-primary" />
					{/if}
					<div class="text-3xl font-bold text-center flex-1">0</div>
				</div>
			{/if}
		</div>
		<!-- Max button (orange, pill-shaped) - only show if onMaxAmount is provided -->
		{#if onMaxAmount}
		<button
			type="button"
				class="bg-primary text-primary-content font-semibold px-3 py-2 touch-manipulation select-none disabled:opacity-50 transition-opacity rounded-r-lg rounded-l-none flex items-center justify-center whitespace-nowrap min-w-[60px] text-xl"
				style="-webkit-tap-highlight-color: transparent; margin-right: -2px; width: 72px;"
			onclick={handleMax}
				disabled={disabled || isMaxDisabled || isLoadingMaxCalculation}
			aria-label="Set maximum amount"
		>
			{#if isLoadingMaxCalculation}
				<span class="loading loading-spinner loading-xs"></span>
			{:else}
				{$t('wallet.max')}
			{/if}
		</button>
		{/if}
	</div>

	<!-- Unit Toggle Buttons -->
	<div class="grid grid-cols-2 border border-base-300 rounded-lg overflow-hidden bg-base-100" class:opacity-50={disabled}>
		<button
			type="button"
			class="flex items-center justify-center gap-2 text-2xl p-2 font-semibold touch-manipulation select-none transition-colors cursor-pointer border-r border-base-300 {unit === 'usd' ? 'bg-primary text-primary-content' : 'bg-base-100 text-base-content'}"
			class:active:bg-base-300={!disabled}
			class:cursor-not-allowed={disabled}
			class:pointer-events-none={disabled}
			style="-webkit-tap-highlight-color: transparent;"
			onclick={() => !disabled && handleUnitToggle('usd')}
			disabled={disabled}
			tabindex={disabled ? -1 : 0}
			aria-label="USD"
			aria-disabled={disabled}
		>
			<IconCurrencyUsd class="w-8 h-8" />
			<span>USD</span>
		</button>
		<button
			type="button"
			class="flex items-center justify-center gap-2 text-2xl p-2 font-semibold touch-manipulation select-none transition-colors cursor-pointer {unit === 'sats' ? 'bg-primary text-primary-content' : 'bg-base-100 text-base-content'}"
			class:active:bg-base-300={!disabled}
			class:cursor-not-allowed={disabled}
			class:pointer-events-none={disabled}
			style="-webkit-tap-highlight-color: transparent;"
			onclick={() => !disabled && handleUnitToggle('sats')}
			disabled={disabled}
			tabindex={disabled ? -1 : 0}
			aria-label="Sats"
			aria-disabled={disabled}
		>
			<IconCurrencyBtc class="w-8 h-8" />
			<span>Sats</span>
		</button>
	</div>

	<!-- Calculator -->
	{#key calculatorKey}
		<CalculatorKeypad {unit} disabled={disabled} onInput={handleCalculatorInput} onCalculationChange={handleCalculationChange} />
	{/key}

	<!-- Memo/Description Field (Accordion) -->
	{#if onMemoChange}
		<DescriptionAccordion
			{memo}
			expanded={descriptionExpanded}
			disabled={descriptionDisabled}
			labelText={descriptionLabelText}
			onMemoChange={(value) => onMemoChange?.(value)}
			onToggle={(expanded) => onDescriptionToggle?.(expanded)}
		/>
	{/if}

</div>


<script lang="ts">
	import { t } from 'svelte-i18n';
	import { walletStore } from '$lib/stores/wallet.store';
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
		network?: string | null; // Detected network for balance calculation
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
		network = null,
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
		if ($walletStore.totalBalances.sats <= 0) return true;
		return false;
	});

	// Handle max button click
	async function handleMax() {
		if (isMaxDisabled || !onMaxAmount) return;

		triggerHaptic(ImpactStyle.Light);
		await onMaxAmount();
	}
</script>

<!-- Amount Display (shows calculation and result) with attached Max button -->
<div
	class="border-primary flex w-full items-stretch overflow-hidden rounded-lg border-2"
	class:opacity-50={disabled}
>
	<!-- Input display area (grey bar) - takes remaining width -->
	<div
		class="bg-base-200 relative flex flex-1 items-center justify-center p-1 sm:p-2"
		class:bg-base-300={disabled}
	>
		{#if mathExpression || amount}
			<!-- Currency symbol on left -->
			<div class="absolute left-2 sm:left-3 flex items-center">
				{#if unit === 'usd'}
					<span class="text-primary text-2xl font-bold sm:text-3xl">$</span>
				{:else}
					<IconCurrencyBtc class="text-primary h-6 w-6 sm:h-8 sm:w-8" />
				{/if}
			</div>
			<!-- Amount centered -->
			<div class="w-full text-center text-2xl font-bold sm:text-3xl">
				{mathExpression || amount || '0'}
			</div>
			<!-- Clear button on right (if present) -->
			{#if onClear}
				<button
					type="button"
					class="absolute right-2 sm:right-3 btn btn-ghost btn-sm btn-circle text-error hover:bg-error/20 flex h-9 min-h-[40px] w-9 min-w-[40px] touch-manipulation items-center justify-center p-0 select-none sm:h-11 sm:min-h-[44px] sm:w-11 sm:min-w-[44px]"
					style="-webkit-tap-highlight-color: transparent;"
					onclick={handleClear}
					{disabled}
					aria-label="Clear calculator"
				>
					<IconClose class="h-6 w-6 sm:h-8 sm:w-8" />
				</button>
			{:else}
				<!-- Spacer to balance symbol on left when no clear button -->
				<div class="absolute right-2 sm:right-3">
					{#if unit === 'usd'}
						<span class="text-primary text-2xl font-bold opacity-0 sm:text-3xl">$</span>
					{:else}
						<IconCurrencyBtc class="text-primary h-6 w-6 opacity-0 sm:h-8 sm:w-8" />
					{/if}
				</div>
			{/if}
		{:else}
			<!-- Currency symbol on left -->
			<div class="absolute left-2 sm:left-3 flex items-center">
				{#if unit === 'usd'}
					<span class="text-primary text-2xl font-bold sm:text-3xl">$</span>
				{:else}
					<IconCurrencyBtc class="text-primary h-6 w-6 sm:h-8 sm:w-8" />
				{/if}
			</div>
			<!-- Amount centered -->
			<div class="w-full text-center text-2xl font-bold sm:text-3xl">0</div>
			<!-- Spacer to balance symbol on left -->
			<div class="absolute right-2 sm:right-3">
				{#if unit === 'usd'}
					<span class="text-primary text-2xl font-bold opacity-0 sm:text-3xl">$</span>
				{:else}
					<IconCurrencyBtc class="text-primary h-6 w-6 opacity-0 sm:h-8 sm:w-8" />
				{/if}
			</div>
		{/if}
	</div>
	<!-- Max button (orange, pill-shaped) - only show if onMaxAmount is provided -->
	{#if onMaxAmount}
		<button
			type="button"
			class="bg-primary text-primary-content flex min-w-[56px] touch-manipulation items-center justify-center rounded-l-none rounded-r-lg px-2 py-1.5 text-lg font-semibold whitespace-nowrap transition-opacity select-none disabled:opacity-20 sm:min-w-[60px] sm:px-3 sm:py-2 sm:text-xl"
			style="-webkit-tap-highlight-color: transparent; margin-right: -2px; width: 64px;"
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
<div
	class="border-base-300 bg-base-100 grid grid-cols-2 overflow-hidden rounded-lg border"
	class:opacity-50={disabled}
>
	<button
		type="button"
		class="border-base-300 flex cursor-pointer touch-manipulation items-center justify-center gap-1.5 border-r p-1.5 text-lg font-semibold transition-colors select-none sm:gap-2 sm:p-2 sm:text-2xl {unit ===
		'usd'
			? 'bg-primary text-primary-content'
			: 'bg-base-100 text-base-content'}"
		class:active:bg-base-300={!disabled}
		class:cursor-not-allowed={disabled}
		class:pointer-events-none={disabled}
		style="-webkit-tap-highlight-color: transparent;"
		onclick={() => !disabled && handleUnitToggle('usd')}
		{disabled}
		tabindex={disabled ? -1 : 0}
		aria-label="USD"
		aria-disabled={disabled}
	>
		<IconCurrencyUsd class="h-6 w-6 sm:h-8 sm:w-8" />
		<span>USD</span>
	</button>
	<button
		type="button"
		class="flex cursor-pointer touch-manipulation items-center justify-center gap-1.5 p-1.5 text-lg font-semibold transition-colors select-none sm:gap-2 sm:p-2 sm:text-2xl {unit ===
		'sats'
			? 'bg-primary text-primary-content'
			: 'bg-base-100 text-base-content'}"
		class:active:bg-base-300={!disabled}
		class:cursor-not-allowed={disabled}
		class:pointer-events-none={disabled}
		style="-webkit-tap-highlight-color: transparent;"
		onclick={() => !disabled && handleUnitToggle('sats')}
		{disabled}
		tabindex={disabled ? -1 : 0}
		aria-label="Sats"
		aria-disabled={disabled}
	>
		<IconCurrencyBtc class="h-6 w-6 sm:h-8 sm:w-8" />
		<span>Sats</span>
	</button>
</div>

<!-- Calculator -->
{#key calculatorKey}
	<CalculatorKeypad
		{unit}
		{disabled}
		onInput={onAmountChange}
		onCalculationChange={handleCalculationChange}
	/>
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

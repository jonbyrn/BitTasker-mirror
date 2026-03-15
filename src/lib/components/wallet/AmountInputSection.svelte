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
		hasInsufficientBalance?: boolean; // Whether there are insufficient funds
		isBelowSwapMinimum?: boolean; // Whether the amount is below swap minimum
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
		hasInsufficientBalance = false,
		isBelowSwapMinimum = false,
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
		const decimalPlaces = network === 'usdt-bsc' ? 6 : 2;

		if (onCalculationChange) {
			onCalculationChange(expression, result);
		} else {
			// Default behavior: update amount with result
			if (result > 0 || expression === '') {
				if (unit === 'sats') {
					onAmountChange(Math.floor(result).toString());
				} else {
					onAmountChange(result.toFixed(decimalPlaces).replace(/\.?0+$/, ''));
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
		if (network === 'usdt-bsc') {
			return Number.parseFloat($walletStore.bsc.formattedUsdtBalance || '0') <= 0;
		}
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

<div class="flex flex-col space-y-2">
<!-- Amount Display (shows calculation and result) with attached Max button -->
<div
	class="flex w-full items-stretch overflow-hidden rounded-lg border-2 transition-colors"
	class:border-primary={!hasInsufficientBalance && !isBelowSwapMinimum}
	class:border-error={hasInsufficientBalance || isBelowSwapMinimum}
	class:opacity-50={disabled}
>
	<!-- Input display area (grey bar) - takes remaining width -->
	<div
		class="bg-base-200 relative flex flex-1 items-center justify-center p-1 sm:p-2 min-h-[3rem] sm:min-h-[3.5rem]"
		class:bg-base-300={disabled}
	>
		<!-- Grid layout to ensure proper centering: left spacer, center content, right spacer -->
		<div class="grid w-full grid-cols-[1fr_auto_1fr] items-center">
			<!-- Left spacer - matches currency symbol width -->
			<div class="flex justify-start pl-2">
				{#if unit === 'usd'}
					<span class="text-primary text-2xl font-bold sm:text-3xl">$</span>
				{:else}
					<IconCurrencyBtc class="text-primary h-6 w-6 sm:h-8 sm:w-8" />
				{/if}
			</div>
			<!-- Amount centered - this will align with calculator center -->
			<div class="text-center text-2xl font-bold leading-[1.2] sm:text-3xl sm:leading-[1.2] min-h-[1.5rem] sm:min-h-[2.25rem] flex items-center justify-center">
				{mathExpression || amount || '0'}
			</div>
			<!-- Right spacer - matches left spacer width -->
			<div class="flex justify-end pr-2 sm:pr-3">
				{#if onClear && (mathExpression || amount)}
					<button
						type="button"
						class="btn btn-ghost btn-sm btn-circle text-error hover:bg-error/20 flex h-9 min-h-[40px] w-9 min-w-[40px] touch-manipulation items-center justify-center p-0 select-none sm:h-11 sm:min-h-[44px] sm:w-11 sm:min-w-[44px]"
						style="-webkit-tap-highlight-color: transparent;"
						onclick={handleClear}
						{disabled}
						aria-label="Clear calculator"
					>
						<IconClose class="h-6 w-6 sm:h-8 sm:w-8" />
					</button>
				{:else}
					<!-- Invisible spacer to balance left side -->
					{#if unit === 'usd'}
						<span class="text-primary text-2xl font-bold opacity-0 sm:text-3xl">$</span>
					{:else}
						<IconCurrencyBtc class="text-primary h-6 w-6 opacity-0 sm:h-8 sm:w-8" />
					{/if}
				{/if}
			</div>
		</div>
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
		class="border-base-300 flex cursor-pointer touch-manipulation items-center justify-center gap-1.5 border-r p-1.5 text-lg font-semibold transition-colors select-none sm:gap-2 {unit ===
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
		<span>{network === 'usdt-bsc' ? 'USDT' : 'USD'}</span>
	</button>
	<button
		type="button"
		class="flex cursor-pointer touch-manipulation items-center justify-center gap-1.5 p-1.5 text-lg font-semibold transition-colors select-none sm:gap-2 {unit ===
		'sats'
			? 'bg-primary text-primary-content'
			: 'bg-base-100 text-base-content'}"
		class:active:bg-base-300={!disabled}
		class:cursor-not-allowed={disabled || network === 'usdt-bsc'}
		class:pointer-events-none={disabled || network === 'usdt-bsc'}
		style="-webkit-tap-highlight-color: transparent;"
		onclick={() => !disabled && network !== 'usdt-bsc' && handleUnitToggle('sats')}
		disabled={disabled || network === 'usdt-bsc'}
		tabindex={disabled || network === 'usdt-bsc' ? -1 : 0}
		aria-label="Sats"
		aria-disabled={disabled || network === 'usdt-bsc'}
	>
		<IconCurrencyBtc class="h-6 w-6 sm:h-8 sm:w-8" />
		<span>Sats</span>
	</button>
</div>

<!-- Calculator -->
{#key calculatorKey}
	<CalculatorKeypad
		{unit}
		decimalPlaces={network === 'usdt-bsc' ? 6 : 2}
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
</div>

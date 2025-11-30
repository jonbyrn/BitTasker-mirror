<script lang="ts">
	import { t } from 'svelte-i18n';
	import { triggerHaptic, ImpactStyle } from '$lib/utils/helpers/haptics';
	import CalculatorKeypad from '$lib/components/wallet/CalculatorKeypad.svelte';
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
		onAmountChange: (value: string) => void;
		onUnitChange: (unit: 'sats' | 'usd') => void;
		onCalculationChange?: (expression: string, result: number) => void;
		onClear?: () => void;
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
		onAmountChange,
		onUnitChange,
		onCalculationChange,
		onClear,
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

	function handleDescriptionToggle() {
		if (onDescriptionToggle) {
			triggerHaptic(ImpactStyle.Light);
			onDescriptionToggle(!descriptionExpanded);
		}
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

<div class="space-y-2">
	<!-- Amount Display (shows calculation and result) -->
	<div class="flex flex-col items-center gap-2 md:gap-3 p-1 bg-base-200 rounded-lg border-2 border-primary">
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

	<!-- Unit Toggle Buttons -->
	<div class="grid grid-cols-2 border border-base-300 rounded-lg overflow-hidden bg-base-100">
		<button
			type="button"
			class="min-h-[30px] md:min-h-[40px] flex items-center justify-center gap-2 text-lg font-semibold touch-manipulation select-none transition-colors cursor-pointer border-r border-base-300 {unit === 'usd' ? 'bg-primary text-primary-content' : 'bg-base-100 text-base-content active:bg-base-300'}"
			style="-webkit-tap-highlight-color: transparent;"
			onclick={() => handleUnitToggle('usd')}
			aria-label="USD"
		>
			<IconCurrencyUsd class="w-5 h-5" />
			<span>USD</span>
		</button>
		<button
			type="button"
			class="min-h-[30px] md:min-h-[40px] flex items-center justify-center gap-2 text-lg font-semibold touch-manipulation select-none transition-colors cursor-pointer {unit === 'sats' ? 'bg-primary text-primary-content' : 'bg-base-100 text-base-content active:bg-base-300'}"
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
		<div class="collapse collapse-arrow border-2 border-primary rounded-lg bg-base-100" class:collapse-open={descriptionExpanded}>
			<button
				type="button"
				class="collapse-title min-h-0 py-1 px-4 font-medium text-left"
				onclick={handleDescriptionToggle}
			>
				{$t('wallet.description')} ({$t('wallet.optional')})
			</button>
			<div class="collapse-content">
				<div class="form-control pt-2 pb-4 px-4">
					<textarea
						class="textarea textarea-bordered w-full"
						class:textarea-error={memo.length > 200}
						placeholder={$t('wallet.payment_for_placeholder')}
						bind:value={memo}
						oninput={(e) => onMemoChange?.(e.currentTarget.value)}
						rows="3"
						maxlength="200"
					></textarea>
					<div class="label">
						<span class="label-text-alt {memo.length > 200 ? 'text-error' : 'text-base-content/70'}">
							{memo.length}/200 {$t('wallet.receive.description_characters')}
						</span>
					</div>
				</div>
			</div>
		</div>
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


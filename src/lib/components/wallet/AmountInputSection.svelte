<script lang="ts">
	import { t } from 'svelte-i18n';
	import { walletStore } from '$lib/stores/wallet.store';
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
		onAmountChange: (value: string) => void;
		onUnitChange: (unit: 'sats' | 'usd') => void;
		onCalculationChange?: (expression: string, result: number) => void;
		onClear?: () => void;
		onMaxAmount?: () => Promise<void>; // Callback to calculate and set max amount
		onMemoChange?: (value: string) => void;
		onDescriptionToggle?: (expanded: boolean) => void;
		descriptionDisabled?: boolean; // Whether the description accordion should be disabled
		descriptionLabelText?: string; // Custom label text for description (e.g., "wallet.send.from_invoice")

		// === Phase 1b Amount Unification (additive, per design in swapform-phase1-logic-extraction-design.md) ===
		/** 'calculator' (default, current for Send/Receive): full keypad+display+units+memo. 'direct': simple join input+MAX+optional % slider (for Swap, BuySell sell, Borrow etc). */
		variant?: 'calculator' | 'direct';
		/** For variant=direct: e.g. '$' for USDT; omitted for BTC (sats label in parent). Renders leading non-interactive span. */
		tokenPrefix?: string;
		/** Show controlled % slider below input (for swap etc). */
		showPercentSlider?: boolean;
		/** Current % (0-100), controlled, only if showPercentSlider. */
		percent?: number;
		/** Callback for slider change. */
		onPercentChange?: (pct: number) => void;

		/** For direct variant + BTC asset sources (e.g. BTC in swap): show a compact toggle button left of input to switch between native (₿) and USD input. */
		supportsBtcUsdToggle?: boolean;
		/** Whether currently in USD input mode (for the toggle). */
		btcUsdMode?: boolean;
		onBtcUsdModeChange?: (isUsd: boolean) => void;
		/** Symbol to show for native BTC when not in usd mode, e.g. '₿' */
		btcNativeSymbol?: string;

		/** Explicit disable for the MAX button only (used by direct variant callers like Swap when source balance for the asset is 0). Does not affect calculator variant. */
		maxDisabled?: boolean;
		/** Explicit disable for the % slider only (e.g. when balance is 0). Does not affect the rest of the input. */
		sliderDisabled?: boolean;

		/** Whether the current amount is below the swap minimum. Adds error border to input. */
		belowMinimum?: boolean;

		/** Minimum value for the % slider (0-100). Used to enforce swap minimums. */
		sliderMin?: number;
		/** Custom label for the MAX button (defaults to $t('wallet.max')). */
		maxLabel?: string;
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
		onAmountChange,
		onUnitChange,
		onCalculationChange,
		onClear,
		onMaxAmount,
		onMemoChange,
		onDescriptionToggle,
		descriptionDisabled = false,
		descriptionLabelText,
		variant = 'calculator',
		tokenPrefix,
		showPercentSlider = false,
		percent = 0,
		onPercentChange,
		supportsBtcUsdToggle = false,
		btcUsdMode = false,
		onBtcUsdModeChange,
		btcNativeSymbol = '₿',
		maxDisabled = false,
		sliderDisabled = false,
		belowMinimum = false,
		sliderMin = 0,
		maxLabel
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
		onUnitChange(newUnit);
		// Keep amount when switching units - user may have entered amount before selecting unit
	}

	function handleClear() {
		if (onClear) {
			onClear();
		}
	}

	// Check if max button should be disabled
	const isMaxDisabled = $derived.by(() => {
		if (variant === 'direct') {
			// Direct variant (Swap/Borrow etc): parent passes explicit maxDisabled for asset-specific balance (e.g. USDT0 vs sats).
			// Avoids !network (not always passed) and global sats check (irrelevant for non-Bitcoin sources).
			// Balance=0 guard + setMax skip live inside caller rune (e.g. swapCalc); button disabled here for UX.
			return maxDisabled ?? false;
		}
		// Calculator variant (Send/Receive): original network + total sats logic for fee-aware max.
		if (!network) return true;
		if ($walletStore.totalBalances.sats <= 0) return true;
		return false;
	});

	// Handle max button click
	async function handleMax() {
		if (isMaxDisabled || !onMaxAmount) return;

		await onMaxAmount();
	}

	// Direct variant handlers (centralizes normalizer + key restrict from Borrow/Swap parity)
	function handleDirectInput(e: Event) {
		const target = e.currentTarget as HTMLInputElement;
		if (target.value.includes(',')) {
			target.value = target.value.replace(/,/g, '.');
		}
		onAmountChange(target.value);
	}

	function handleDirectKeyPress(e: KeyboardEvent) {
		const allowedKeys = [
			'0',
			'1',
			'2',
			'3',
			'4',
			'5',
			'6',
			'7',
			'8',
			'9',
			'.',
			'Backspace',
			'Delete',
			'Tab',
			'Enter',
			'ArrowLeft',
			'ArrowRight'
		];
		const isControlKey = e.ctrlKey || e.metaKey || e.altKey;
		if (!allowedKeys.includes(e.key) && !isControlKey) {
			e.preventDefault();
		}
		const currentValue = (e.target as HTMLInputElement).value;
		const allowsDecimal = !!tokenPrefix || (supportsBtcUsdToggle && btcUsdMode);
		if (e.key === '.' && (!allowsDecimal || currentValue.includes('.'))) {
			e.preventDefault();
		}
	}

	function handlePercentInput(e: Event) {
		const pct = parseInt((e.currentTarget as HTMLInputElement).value);
		onPercentChange?.(pct);
	}
</script>

{#if variant === 'direct'}
	<!-- Direct variant for Swap/Borrow etc: simple join input + MAX + optional % slider. Label/avail bal provided by parent. -->
	<div class="join w-full">
		{#if supportsBtcUsdToggle}
			<button
				type="button"
				class="btn join-item no-animation bg-base-200 text-base-content/70 active:bg-base-300 min-h-[48px] touch-manipulation border-r-0 text-sm sm:min-h-[52px]"
				onclick={() => onBtcUsdModeChange?.(!btcUsdMode)}
				{disabled}
				aria-label={$t('wallet.buy_sell.toggle_btc_usd')}
			>
				<span class={btcUsdMode ? 'text-base-content/50' : 'text-primary'}>{btcNativeSymbol}</span
				><span class="text-base-content/50"> / </span><span
					class={btcUsdMode ? 'text-primary' : 'text-base-content/50'}>$</span
				>
			</button>
		{:else if tokenPrefix}
			<span
				class="btn join-item no-animation bg-base-200 text-base-content/70 pointer-events-none min-h-[48px] border-r-0 text-lg sm:min-h-[52px]"
			>
				{tokenPrefix}
			</span>
		{/if}
		<div class="relative min-w-0 flex-1">
			<input
				type="text"
				class="input input-bordered join-item min-h-[48px] w-full text-lg sm:min-h-[52px] sm:text-base {supportsBtcUsdToggle ||
				tokenPrefix
					? 'pr-10'
					: 'rounded-r-none pr-10'}"
				class:border-error={belowMinimum}
				class:focus:border-error={belowMinimum}
				placeholder={supportsBtcUsdToggle
					? btcUsdMode
						? '0.00'
						: '0'
					: tokenPrefix
						? '0.00'
						: '0'}
				value={amount}
				oninput={handleDirectInput}
				onkeypress={handleDirectKeyPress}
				inputmode={supportsBtcUsdToggle
					? btcUsdMode
						? 'decimal'
						: 'numeric'
					: tokenPrefix
						? 'decimal'
						: 'numeric'}
				{disabled}
				aria-label={$t('wallet.buy_sell.amount')}
			/>
			{#if onClear && amount}
				<button
					type="button"
					class="text-error hover:bg-error/20 active:bg-error/30 absolute top-1/2 right-1 flex h-8 w-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full transition-colors"
					onclick={handleClear}
					{disabled}
					aria-label="Clear amount"
				>
					<IconClose class="h-4 w-4" />
				</button>
			{/if}
		</div>
		{#if onMaxAmount}
			<button
				type="button"
				class="btn btn-primary join-item min-h-[48px] touch-manipulation rounded-l-none rounded-r-lg active:scale-95 sm:min-h-[52px]"
				onclick={handleMax}
				disabled={disabled || isMaxDisabled || isLoadingMaxCalculation}
			>
				{#if isLoadingMaxCalculation}
					<span class="loading loading-spinner loading-xs"></span>
				{:else}
					<span class="text-xs sm:text-sm">{maxLabel ?? $t('wallet.max')}</span>
				{/if}
			</button>
		{/if}
	</div>

	{#if showPercentSlider}
		<div class="form-control py-2">
			<div class="flex items-center gap-3" class:opacity-50={disabled || sliderDisabled}>
				<span class="text-primary min-w-[3ch] text-right text-sm font-semibold"
					>{Math.round(percent ?? 0)}%</span
				>
				<input
					type="range"
					min={sliderMin}
					max="100"
					step="1"
					value={Math.max(percent ?? 0, sliderMin)}
					class="range range-primary range-sm flex-1"
					oninput={handlePercentInput}
					disabled={disabled || sliderDisabled}
				/>
			</div>
		</div>
	{/if}
{:else}
	<!-- Default calculator variant (unchanged for Send/Receive etc) -->
	<div class="flex flex-col space-y-2">
		<!-- Amount Display (shows calculation and result) with attached Max button -->
		<div
			class="flex w-full items-stretch overflow-hidden rounded-lg border-2 transition-colors"
			class:border-primary={!hasInsufficientBalance}
			class:border-error={hasInsufficientBalance}
			class:opacity-50={disabled}
		>
			<!-- Input display area (grey bar) - takes remaining width -->
			<div
				class="bg-base-200 relative flex min-h-12 flex-1 items-center justify-center p-1 sm:min-h-14 sm:p-2"
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
					<div
						class="flex min-h-6 items-center justify-center text-center text-2xl leading-[1.2] font-bold sm:min-h-8 sm:text-3xl sm:leading-[1.2]"
					>
						{mathExpression || amount || '0'}
					</div>
					<!-- Right spacer - matches left spacer width -->
					<div class="flex justify-end pr-2 sm:pr-3">
						{#if onClear && (mathExpression || amount)}
							<button
								type="button"
								class="btn btn-ghost btn-sm btn-circle text-error hover:bg-error/20 flex h-11 min-h-[44px] w-11 min-w-[44px] touch-manipulation items-center justify-center p-0 select-none"
								onclick={handleClear}
								{disabled}
								aria-label={$t('wallet.buy_sell.clear')}
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
					class="bg-primary text-primary-content -mr-[2px] flex w-16 min-w-[56px] touch-manipulation items-center justify-center rounded-l-none rounded-r-lg px-2 py-1.5 text-lg font-semibold whitespace-nowrap transition-opacity select-none [-webkit-tap-highlight-color:transparent] disabled:opacity-20 sm:min-w-[60px] sm:px-3 sm:py-2 sm:text-xl"
					onclick={handleMax}
					disabled={disabled || isMaxDisabled || isLoadingMaxCalculation}
					aria-label={$t('wallet.buy_sell.set_max')}
				>
					{#if isLoadingMaxCalculation}
						<span class="loading loading-spinner loading-xs"></span>
					{:else}
						{maxLabel ?? $t('wallet.max')}
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
				onclick={() => !disabled && handleUnitToggle('usd')}
				{disabled}
				tabindex={disabled ? -1 : 0}
				aria-label={$t('wallet.receive.unit_usd')}
				aria-disabled={disabled}
			>
				<IconCurrencyUsd class="h-6 w-6 sm:h-8 sm:w-8" />
				<span>{$t('wallet.receive.unit_usd')}</span>
			</button>
			<button
				type="button"
				class="flex cursor-pointer touch-manipulation items-center justify-center gap-1.5 p-1.5 text-lg font-semibold transition-colors select-none sm:gap-2 {unit ===
				'sats'
					? 'bg-primary text-primary-content'
					: 'bg-base-100 text-base-content'}"
				class:active:bg-base-300={!disabled}
				class:cursor-not-allowed={disabled}
				class:pointer-events-none={disabled}
				onclick={() => !disabled && handleUnitToggle('sats')}
				{disabled}
				tabindex={disabled ? -1 : 0}
				aria-label={$t('wallet.receive.unit_sats')}
				aria-disabled={disabled}
			>
				<IconCurrencyBtc class="h-6 w-6 sm:h-8 sm:w-8" />
				<span>{$t('wallet.receive.unit_sats')}</span>
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
	</div>
{/if}

<script lang="ts">
	import { t } from 'svelte-i18n';
	import AmountDisplay from '$lib/components/wallet/AmountDisplay.svelte';
	import AmountInputSection from '$lib/components/wallet/AmountInputSection.svelte';
	import IconOpenInNew from '~icons/mdi/open-in-new';

	interface Props {
		amount: string;
		unit: 'sats' | 'usd';
		btcPrice: number;
		network: string | null;
		networkIcon: string | null;
		networkName: string | null;
		explorerUrl: string | null;
		address: string;
		hasInsufficientBalance: boolean;
		isSending: boolean;
		isBelowSwapMinimum: boolean;
		showAmountInput: boolean;
		showLargeAmountWarning?: boolean;
		largeAmountWarningText?: string;
		// Amount input props (conditional)
		amountInputAmount?: string;
		amountInputUnit?: 'sats' | 'usd';
		mathExpression?: string;
		calculatorKey?: number;
		isLoadingMaxCalculation?: boolean;
		// Events
		onBack: () => void;
		onSend: () => void;
		onUnitToggle: () => void;
		onAmountChange?: (value: string) => void;
		onUnitChange?: (unit: 'sats' | 'usd') => void;
		onCalculationChange?: (expression: string, result: number) => void;
		onClear?: () => void;
		onMaxAmount?: () => Promise<void>;
	}

	let {
		amount,
		unit,
		btcPrice,
		network,
		networkIcon,
		networkName,
		explorerUrl,
		address,
		hasInsufficientBalance,
		isSending,
		isBelowSwapMinimum,
		showAmountInput,
		showLargeAmountWarning = false,
		largeAmountWarningText = '',
		amountInputAmount,
		amountInputUnit,
		mathExpression,
		calculatorKey,
		isLoadingMaxCalculation,
		onBack,
		onSend,
		onUnitToggle,
		onAmountChange = () => {},
		onUnitChange = () => {},
		onCalculationChange,
		onClear,
		onMaxAmount
	}: Props = $props();
</script>

<!-- Confirmation Screen -->
<div class="space-y-6">
	<!-- Back Button -->
	<div class="flex items-center justify-end">
		<button class="btn btn-ghost btn-sm" onclick={onBack}>
			{$t('common.back')}
		</button>
	</div>

	<!-- Amount Display -->
	<div class="flex flex-col items-center gap-2">
		<AmountDisplay {amount} {unit} {onUnitToggle} {btcPrice} />
		{#if showLargeAmountWarning && largeAmountWarningText}
			<p class="text-error text-center text-sm">
				{largeAmountWarningText}
			</p>
		{/if}
	</div>

	<!-- Network Display -->
	{#if network}
		<div class="border-base-300 bg-primary/10 rounded-lg border p-4">
			<div class="flex items-center justify-between gap-2">
				<div class="flex items-center gap-2">
					{#if networkIcon}
						<img src={networkIcon} alt={networkName} class="h-5 w-5" />
					{/if}
					<span class="font-medium">{networkName}</span>
				</div>
				{#if explorerUrl}
					<a
						href={explorerUrl}
						target="_blank"
						rel="noopener noreferrer"
						class="btn btn-ghost btn-sm btn-circle shrink-0 touch-manipulation transition-transform duration-100 select-none active:scale-95"
						aria-label={$t('wallet.view_explorer')}
					>
						<IconOpenInNew class="h-5 w-5" />
					</a>
				{/if}
			</div>
		</div>
	{/if}

	<!-- Address Display -->
	<div class="form-control">
		<div class="input input-bordered w-full break-all">{address}</div>
	</div>

	<!-- Conditional Amount Field -->
	{#if showAmountInput}
		<div class="form-control">
			<AmountInputSection
				amount={amountInputAmount ?? amount}
				unit={amountInputUnit ?? unit}
				{mathExpression}
				{calculatorKey}
				{network}
				{isLoadingMaxCalculation}
				{hasInsufficientBalance}
				{onAmountChange}
				{onUnitChange}
				{onCalculationChange}
				{onClear}
				{onMaxAmount}
			/>
		</div>
	{/if}

	<!-- Action Buttons -->
	<div class="flex gap-3">
		<button class="btn btn-error flex-1" onclick={onBack}>
			{$t('common.cancel')}
		</button>
		<button
			class="btn btn-primary flex-1"
			onclick={onSend}
			disabled={isSending || hasInsufficientBalance || isBelowSwapMinimum}
		>
			{#if isSending}
				<span class="loading loading-spinner loading-sm"></span>
			{/if}
			{$t('wallet.send.send')}
		</button>
	</div>
</div>

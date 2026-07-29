<script lang="ts">
	import { tick } from 'svelte';
	import { t } from 'svelte-i18n';
	import IconCheckCircle from '~icons/mdi/check-circle';
	import IconCloseCircle from '~icons/mdi/close-circle';
	import { friendlyAssetName } from '$lib/utils/fiat-helpers';
	import type { OffRampQuote, OffRampFlowState } from '$lib/services/off-ramp-orchestrator.service';

	let {
		offRampStage,
		offRampQuote,
		offRampFlow,
		depositAddressInput,
		depositAddressError,
		selectedCrypto,
		onDepositAddressChange,
		onStartOver,
		onSubmit // eslint-disable-line @typescript-eslint/no-unused-vars -- prop consumed by parent
	}: {
		offRampStage: string;
		offRampQuote: OffRampQuote | null;
		offRampFlow: OffRampFlowState | null;
		depositAddressInput: string;
		depositAddressError: string;
		selectedCrypto: string;
		onDepositAddressChange: (value: string) => void;
		onStartOver: () => void;
		onSubmit: () => void;
	} = $props();

	let depositAddrEl = $state<HTMLInputElement | null>(null);

	// Auto-focus deposit address input when stage transitions
	$effect(() => {
		if (offRampStage === 'awaiting_deposit_address') {
			tick().then(() => {
				depositAddrEl?.focus();
			});
		}
	});
</script>

<!-- Quote card -->
{#if offRampQuote && (offRampStage === 'quote_ready' || offRampStage === 'idle')}
	<div class="bg-base-100 border-base-300 space-y-2 rounded-lg border p-3">
		<div class="flex items-center justify-between">
			<span class="text-base-content/60 text-xs">{$t('wallet.buy_sell.you_receive')}</span>
			<span class="text-sm font-semibold">${offRampQuote.estimatedFiatReceived}</span>
		</div>
		<div class="flex items-center justify-between">
			<span class="text-base-content/60 text-xs">{$t('wallet.buy_sell.bridge_fee')}</span>
			<span class="text-xs">${offRampQuote.bridgeFeeUsd}</span>
		</div>
		<div class="flex items-center justify-between">
			<span class="text-base-content/60 text-xs">{$t('wallet.buy_sell.moonpay_fee')}</span>
			<span class="text-xs">${offRampQuote.moonpayFeeUsd}</span>
		</div>
		<div class="border-base-300 flex items-center justify-between border-t pt-2">
			<span class="text-xs font-medium"
				>{$t('wallet.buy_sell.sell_summary_fee_total', {
					values: { percent: offRampQuote.totalFeePercent }
				})}</span
			>
			<span class="text-base-content/60 text-xs"
				>{$t('wallet.buy_sell.estimated_time', {
					values: { time: Math.ceil(offRampQuote.estimatedTimeSeconds / 60) }
				})}</span
			>
		</div>
	</div>
{/if}

<!-- Opening MoonPay -->
{#if offRampStage === 'opening_moonpay'}
	<div class="bg-info/5 border-info/20 flex items-center gap-3 rounded-lg border p-3">
		<span class="loading loading-spinner loading-sm text-info shrink-0"></span>
		<span class="min-w-0 flex-1 text-sm font-medium">{$t('wallet.buy_sell.open_moonpay')}</span>
		<button type="button" class="btn btn-ghost btn-xs shrink-0" onclick={onStartOver}>
			{$t('wallet.buy_sell.start_over_moonpay')}
		</button>
	</div>
{/if}

<!-- Awaiting deposit address -->
{#if offRampStage === 'awaiting_deposit_address'}
	<div class="space-y-3">
		<p class="text-base-content/70 text-xs">
			{$t('wallet.buy_sell.deposit_address_helper')}
		</p>
		<div class="form-control">
			<label class="label pb-1" for="deposit-addr-input">
				<span class="label-text text-xs">{$t('wallet.buy_sell.paste_deposit_address')}</span>
			</label>
			<input
				id="deposit-addr-input"
				type="text"
				class="input input-bordered input-sm w-full font-mono text-xs"
				class:input-error={!!depositAddressError}
				placeholder={$t('wallet.buy_sell.deposit_address_placeholder')}
				value={depositAddressInput}
				oninput={(e) => onDepositAddressChange(e.currentTarget.value)}
				bind:this={depositAddrEl}
				spellcheck="false"
				autocomplete="off"
				aria-invalid={!!depositAddressError}
				aria-describedby={depositAddressError ? 'deposit-addr-error' : undefined}
			/>
			{#if depositAddressError}
				<label class="label pt-1" id="deposit-addr-error" for="deposit-addr-input">
					<span class="label-text-alt text-error text-xs">{depositAddressError}</span>
				</label>
			{/if}
		</div>
		<button type="button" class="btn btn-ghost btn-xs" onclick={onStartOver}>
			{$t('wallet.buy_sell.start_over_moonpay')}
		</button>
	</div>
{/if}

<!-- Bridging in progress -->
{#if offRampStage === 'bridging'}
	<div class="bg-info/5 border-info/20 flex items-center gap-3 rounded-lg border p-3">
		<span class="loading loading-spinner loading-sm text-info shrink-0"></span>
		<span class="min-w-0 flex-1 text-sm font-medium">
			{$t('wallet.buy_sell.bridge_in_progress', {
				values: { asset: friendlyAssetName(selectedCrypto) }
			})}
		</span>
	</div>
{/if}

<!-- Complete -->
{#if offRampStage === 'complete'}
	<div class="bg-success/5 border-success/20 flex items-center gap-3 rounded-lg border p-3">
		<IconCheckCircle class="text-success h-4 w-4 shrink-0" />
		<span class="min-w-0 flex-1 text-sm font-medium">{$t('wallet.buy_sell.bridge_complete')}</span>
	</div>
{/if}

<!-- Failed -->
{#if offRampStage === 'failed'}
	<div class="bg-error/5 border-error/20 flex items-center gap-3 rounded-lg border p-3">
		<IconCloseCircle class="text-error h-4 w-4 shrink-0" />
		<div class="min-w-0 flex-1">
			<span class="text-sm font-medium">{$t('wallet.buy_sell.bridge_failed')}</span>
			{#if offRampFlow?.error}
				<p class="text-error mt-0.5 text-xs">{$t(offRampFlow.error)}</p>
			{/if}
		</div>
		<button type="button" class="btn btn-ghost btn-xs shrink-0" onclick={onStartOver}>
			{$t('wallet.buy_sell.start_over_moonpay')}
		</button>
	</div>
{/if}

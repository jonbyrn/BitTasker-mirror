<script lang="ts">
	import { t } from 'svelte-i18n';
	import type { FeeItem } from './types';
	import { walletStore } from '$lib/stores/wallet.store';
	import { connectedWalletsStore } from '$lib/stores/connected-wallets.store';
	import { btcPrice } from '$lib/runes/btcPrice.svelte';
	import WalletSelector from '../WalletSelector.svelte';

	let {
		inputAmount = $bindable(''),
		rbtcBalance,
		rbtcUsdValue,
		feeBreakdown,
		remainingSeconds,
		hasInsufficientRbtc,
		estimatedRbtcNeeded,
		estimatedArbReceive,
		totalFees,
		totalFeesPercent,
		canProceed,
		onAmountInput,
		onNext
	}: {
		inputAmount: string;
		rbtcBalance: number;
		rbtcUsdValue: string;
		feeBreakdown: FeeItem[];
		remainingSeconds: number;
		hasInsufficientRbtc: boolean;
		estimatedRbtcNeeded: string;
		estimatedArbReceive: string;
		totalFees: string;
		totalFeesPercent: string;
		canProceed: boolean;
		onAmountInput: (value: string) => void;
		onNext: () => void;
	} = $props();

	let source = $state('builtin');
	let sourceExpanded = $state(false);
	let sourceInitialized = $state(false);

	function totalBuiltinUsd(): string {
		const sats = $walletStore.totalBalances.sats;
		const usdt = $walletStore.totalBalances.usdt;
		const usd = (sats / 100_000_000) * btcPrice.price + usdt;
		return usd.toLocaleString('en-US', {
			style: 'currency',
			currency: 'USD',
			minimumFractionDigits: 2,
			maximumFractionDigits: 2
		});
	}

	function usdBalanceFor(wallet: { balances?: Record<string, { raw: string }> }): string {
		const cur = wallet.balances;
		if (!cur) return '$0.00';
		const sats = Number(cur.btc?.raw ?? 0) + Number(cur.rbtc?.raw ?? 0);
		const usdt = Number(cur.usdt?.raw ?? 0) / 1e18;
		const usd = (sats / 100_000_000) * btcPrice.price + usdt;
		return usd.toLocaleString('en-US', {
			style: 'currency',
			currency: 'USD',
			minimumFractionDigits: 2,
			maximumFractionDigits: 2
		});
	}

	function defaultWalletId(): string {
		if ($walletStore.totalBalances.sats > 0 || $walletStore.totalBalances.usdt > 0)
			return 'builtin';
		const firstWithBalance = $connectedWalletsStore.wallets.find((w) => {
			const b = w.balances;
			if (!b) return false;
			const sats = Number(b.btc?.raw ?? 0) + Number(b.rbtc?.raw ?? 0);
			const usdt = Number(b.usdt?.raw ?? 0);
			return sats > 0 || usdt > 0;
		});
		return firstWithBalance?.id ?? 'builtin';
	}

	$effect(() => {
		if ($connectedWalletsStore.wallets.length > 0 && !sourceInitialized) {
			source = defaultWalletId();
			sourceInitialized = true;
		} else if (
			sourceInitialized &&
			source !== 'builtin' &&
			!$connectedWalletsStore.wallets.some((w) => w.id === source)
		) {
			source = 'builtin';
		}
	});

	function handleInput() {
		onAmountInput(inputAmount);
	}
</script>

<div class="text-base-content/70 text-sm font-medium">
	{$t('wallet.loan.step_input')}
</div>

<!-- From-Account Selector -->
<WalletSelector
	label={$t('wallet.loan.from_account') + ':'}
	selectedId={source}
	onSelect={(id) => (source = id)}
	builtinBalance={totalBuiltinUsd()}
	connectedWallets={$connectedWalletsStore.wallets}
	walletBalanceFor={(id) => {
		if (id === 'builtin') return totalBuiltinUsd();
		const w = $connectedWalletsStore.wallets.find((cw) => cw.id === id);
		return w ? usdBalanceFor(w) : '$0.00';
	}}
	expanded={sourceExpanded}
	onToggle={() => (sourceExpanded = !sourceExpanded)}
/>

<!-- Amount input -->
<div class="space-y-2">
	<label for="loan-amount" class="label">
		<span class="label-text text-sm font-medium">{$t('wallet.loan.amount_label')}</span>
	</label>
	<div class="join w-full">
		<span
			class="btn join-item no-animation bg-base-200 text-base-content/70 min-h-[48px] border-r-0 text-lg"
		>
			$
		</span>
		<input
			id="loan-amount"
			type="number"
			class="input input-bordered join-item min-h-[48px] flex-1 text-lg"
			placeholder="0.00"
			bind:value={inputAmount}
			oninput={handleInput}
			min="0"
			step="0.01"
			inputmode="decimal"
		/>
	</div>
</div>

<!-- Your RBTC display -->
<div class="bg-base-200 rounded-box flex items-center justify-between p-3">
	<span class="text-sm font-medium"
		>{$t('wallet.loan.your_rbtc', {
			values: { amount: rbtcBalance.toFixed(4), usd: rbtcUsdValue }
		})}</span
	>
</div>

<!-- Fee breakdown -->
<div class="card bg-base-200 rounded-box">
	<div class="card-body p-3">
		<div class="text-sm font-semibold">{$t('wallet.loan.estimated_fees')}</div>
		<div class="mt-2 space-y-1.5">
			{#if feeBreakdown.length === 0}
				<!-- Empty state - skeleton -->
				<div class="space-y-2 pt-1">
					<div class="skeleton h-4 w-full rounded"></div>
					<div class="skeleton h-4 w-3/4 rounded"></div>
					<div class="skeleton h-4 w-5/6 rounded"></div>
				</div>
				<div class="text-base-content/50 mt-2 text-xs">
					{$t('wallet.loan.empty_state_desc')}
				</div>
			{:else}
				{#each feeBreakdown as feeItem (feeItem.label)}
					<div class="flex items-center justify-between">
						<span class="text-base-content/70 text-sm">{feeItem.label}</span>
						{#if feeItem.loading}
							<span class="skeleton h-4 w-16 rounded"></span>
						{:else}
							<span class="text-sm font-medium">{feeItem.amount}</span>
						{/if}
					</div>
				{/each}
				<div class="border-base-300 my-1 border-t"></div>
				<div class="flex items-center justify-between font-semibold">
					<span class="text-sm"
						>{$t('wallet.loan.you_receive', {
							values: { amount: estimatedArbReceive }
						})}</span
					>
					<span class="text-sm">{totalFees} ({totalFeesPercent}%)</span>
				</div>
			{/if}
		</div>
	</div>
</div>

{#if feeBreakdown.length > 0 && !feeBreakdown[0]?.loading}
	<div class="text-base-content/50 text-center text-xs">
		{$t('wallet.loan.quote_expires', { values: { seconds: remainingSeconds } })}
	</div>
{/if}

<!-- Insufficient balance error -->
{#if hasInsufficientRbtc}
	<div class="alert alert-outline alert-error py-2">
		<svg class="h-5 w-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				stroke-width="2"
				d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
			/>
		</svg>
		<span class="text-xs">
			{$t('wallet.loan.error_insufficient', {
				values: { needed: estimatedRbtcNeeded, have: rbtcBalance.toFixed(4) }
			})}
		</span>
	</div>
{/if}

<!-- Next: Review button -->
<div>
	<button
		class="btn btn-primary min-h-[44px] w-full text-sm sm:text-base"
		onclick={onNext}
		disabled={!canProceed}
	>
		{$t('wallet.loan.next_button')}
	</button>
</div>

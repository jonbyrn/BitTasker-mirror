<script lang="ts">
	import { t } from 'svelte-i18n';
	import { defiPositions } from '$lib/stores/defi-positions.store.svelte';
	import { deriveHealthStatus } from '$lib/services/defi/aave.service';
	import HealthFactorGauge from '../HealthFactorGauge.svelte';

	interface Props {
		walletId: string;
		address: string;
		supplyTxHash?: string;
		borrowTxHash?: string;
		onDone: () => void;
		onNewLoan: () => void;
	}

	let { walletId, address, supplyTxHash, borrowTxHash, onDone, onNewLoan }: Props = $props();

	let position = $derived(
		walletId === 'builtin' ? defiPositions.aavePositions.get('builtin') : null
	);

	let healthStatus = $derived(
		position ? deriveHealthStatus(position.healthFactor) : ('safe' as const)
	);

	const ARBISCAN_TX = 'https://arbiscan.io/tx/';
</script>

<div class="flex flex-col items-center gap-4 text-center">
	<div class="flex flex-col items-center gap-2">
		<div class="bg-success/20 text-success flex h-16 w-16 items-center justify-center rounded-full">
			<svg class="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
			</svg>
		</div>
		<h3 class="text-lg font-bold">{$t('wallet.defi.wizard.success_title')}</h3>
	</div>

	{#if supplyTxHash || borrowTxHash}
		<div class="bg-base-200 rounded-box w-full space-y-2 p-3 text-sm">
			<p class="text-base-content/60 text-left text-xs font-medium">
				{$t('wallet.defi.loan_wizard.transaction_receipts')}
			</p>
			{#if supplyTxHash}
				<div class="flex items-center justify-between">
					<span class="text-base-content/60">{$t('wallet.defi.wizard.supply')}</span>
					<a
						href="{ARBISCAN_TX}{supplyTxHash}"
						target="_blank"
						rel="noopener noreferrer"
						class="link link-primary font-mono text-xs"
					>
						{supplyTxHash.slice(0, 10)}... ↗
					</a>
				</div>
			{/if}
			{#if borrowTxHash}
				<div class="flex items-center justify-between">
					<span class="text-base-content/60">{$t('wallet.defi.wizard.borrow')}</span>
					<a
						href="{ARBISCAN_TX}{borrowTxHash}"
						target="_blank"
						rel="noopener noreferrer"
						class="link link-primary font-mono text-xs"
					>
						{borrowTxHash.slice(0, 10)}... ↗
					</a>
				</div>
			{/if}
		</div>
	{/if}

	{#if position}
		<div class="bg-base-200 rounded-box w-full space-y-2 p-3 text-left text-sm">
			<p class="text-base-content/60 text-xs font-medium">
				{$t('wallet.defi.wizard.your_new_position')}
			</p>
			<div class="flex items-center justify-between">
				<span class="text-base-content/60">{$t('wallet.defi.wallet_label')}</span>
				<span class="font-mono text-xs"
					>{walletId === 'builtin' ? $t('wallet.defi.builtin_label') : walletId}
					{address?.slice(0, 6)}...{address?.slice(-4)}</span
				>
			</div>
			<div class="flex items-center justify-between">
				<span class="text-base-content/60">{$t('wallet.defi.collateral_label')}</span>
				<span class="font-medium tabular-nums">${position.totalCollateralUsd.toLocaleString()}</span
				>
			</div>
			<div class="flex items-center justify-between">
				<span class="text-base-content/60">{$t('wallet.defi.debt_label')}</span>
				<span class="font-medium tabular-nums">${position.totalDebtUsd.toLocaleString()}</span>
			</div>
			<div class="flex items-center justify-between">
				<span class="text-base-content/60">{$t('wallet.defi.lending.collateral')}</span>
				<span class="font-medium tabular-nums">${position.totalCollateralUsd.toLocaleString()}</span
				>
			</div>
			<div class="flex items-center justify-between">
				<span class="text-base-content/60">{$t('wallet.defi.lending.debt')}</span>
				<span class="font-medium tabular-nums">${position.totalDebtUsd.toLocaleString()}</span>
			</div>
			<HealthFactorGauge healthFactor={position.healthFactor} status={healthStatus} />
			{#if position.liquidationPriceBtc}
				<div class="flex items-center justify-between">
					<span class="text-base-content/60">{$t('wallet.defi.lending.liq_price')}</span>
					<span class="font-medium tabular-nums"
						>${position.liquidationPriceBtc.toLocaleString()}</span
					>
				</div>
			{/if}
		</div>
	{/if}

	<div class="flex w-full flex-col gap-2 pt-2">
		<button type="button" class="btn btn-primary w-full" onclick={onDone}>
			{$t('wallet.defi.wizard.done')}
		</button>
		<button type="button" class="btn btn-ghost btn-sm w-full" onclick={onNewLoan}>
			{$t('wallet.defi.wizard.new_loan')}
		</button>
	</div>
</div>

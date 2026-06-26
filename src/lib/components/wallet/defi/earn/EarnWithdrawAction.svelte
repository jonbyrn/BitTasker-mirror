<script lang="ts">
	import { t } from 'svelte-i18n';
	import { get } from 'svelte/store';
	import { ethers } from 'ethers';
	import { tryCatch } from '$lib/utils/tryCatch';
	import { walletStore } from '$lib/stores/wallet.store';
	import { getEvmSigner } from '$lib/stores/connected-wallets.store';
	import { defiPositions } from '$lib/stores/defi-positions.store.svelte';
	import { AaveService, USDT0_ARBITRUM } from '$lib/services/defi/aave.service';
	import { browserNetworkStatus } from '$lib/utils/network-status';
	import { extractContractError } from '$lib/utils/wallet/contractErrorHandler';
	import { appStore } from '$lib/stores/app.store';
	import * as Sentry from '@sentry/sveltekit';

	const ARB_PUBLIC_RPC = 'https://arb1.arbitrum.io/rpc';
	const USDT0_DECIMALS = 6;

	interface Props {
		walletId: string;
		address: string;
		onSuccess: () => void;
	}

	let { walletId, address: _address, onSuccess }: Props = $props();

	let amount = $state('');
	let isProcessing = $state(false);
	let txError = $state<string | null>(null);

	let isOnline = $derived($browserNetworkStatus.online);

	// Current position
	let pos = $derived(defiPositions.aavePositions.get(walletId) ?? null);
	let suppliedRaw = $derived(pos?.suppliedUsdt0Raw ?? 0n);
	let suppliedFormatted = $derived(pos ? parseFloat(pos.suppliedUsdt0) : 0);
	let hasPosition = $derived(suppliedRaw > 0n);

	let amountNum = $derived.by(() => {
		const n = parseFloat(amount);
		return isFinite(n) && n > 0 ? n : 0;
	});

	let projectedBalance = $derived(Math.max(0, suppliedFormatted - amountNum));

	let canWithdraw = $derived(
		amountNum > 0 && isOnline && hasPosition && !isProcessing && amountNum <= suppliedFormatted
	);

	function setMaxAmount() {
		if (!isOnline || !hasPosition) return;
		Sentry.addBreadcrumb({
			category: 'defi.earn.withdraw',
			message: 'setMax',
			data: { supplied: suppliedFormatted }
		});
		amount = suppliedFormatted.toString();
	}

	async function handleWithdraw() {
		if (!canWithdraw || isProcessing) return;
		isProcessing = true;
		txError = null;

		Sentry.addBreadcrumb({
			category: 'defi.earn.withdraw',
			message: 'sending withdraw',
			data: { amountNum, walletId }
		});

		const aave = new AaveService(new ethers.JsonRpcProvider(ARB_PUBLIC_RPC));
		const amt = ethers.parseUnits(String(amountNum), USDT0_DECIMALS);

		if (walletId === 'builtin') {
			const s = get(walletStore);
			const rskW = s.rsk?.wallet as ethers.Wallet | undefined;
			if (!rskW) {
				txError = $t('wallet.defi.approve.error');
				isProcessing = false;
				return;
			}
			const signer = rskW.connect(new ethers.JsonRpcProvider(ARB_PUBLIC_RPC));
			const { data: tx, error } = await tryCatch(aave.withdraw(USDT0_ARBITRUM, amt, signer));
			if (error || !tx) {
				const contractErr = extractContractError(error);
				txError = contractErr.userMessage;
				Sentry.captureException(error, { tags: { feature: 'defi.lend', action: 'withdraw' } });
				isProcessing = false;
				return;
			}
		} else {
			const evm = getEvmSigner(walletId);
			if (!evm) {
				txError = $t('wallet.defi.approve.error');
				isProcessing = false;
				return;
			}
			const { data: tx, error } = await tryCatch(
				aave.withdrawWithEvmSigner(USDT0_ARBITRUM, amt, evm)
			);
			if (error || !tx) {
				const contractErr = extractContractError(error);
				txError = contractErr.userMessage;
				Sentry.captureException(error, { tags: { feature: 'defi.lend', action: 'withdraw' } });
				isProcessing = false;
				return;
			}
		}

		appStore.showSuccessToast($t('wallet.defi.shared.pending_tx'));
		await Promise.allSettled([defiPositions.refreshAavePosition(walletId)]);
		isProcessing = false;
		amount = '';
		onSuccess();
	}
</script>

<div class="flex flex-col gap-3">
	<!-- Offline guard -->
	{#if !isOnline}
		<div class="alert alert-soft alert-warning py-2 text-xs" role="alert">
			{$t('wallet.defi.shared.offline')}
		</div>
	{/if}

	<!-- Current supplied display -->
	<div class="bg-base-200 rounded-box p-3 text-sm">
		<div class="flex items-center justify-between">
			<span class="text-base-content/60">{$t('wallet.defi.earn.overview_supplied')}</span>
			<span class="font-medium tabular-nums">${suppliedFormatted.toFixed(2)}</span>
		</div>
	</div>

	<!-- Amount input -->
	<div>
		<label class="label" for="earn-withdraw-amount">
			<span class="label-text text-sm font-medium"
				>{$t('wallet.defi.earn.withdraw_amount_label')}</span
			>
		</label>
		<div class="join w-full">
			<span
				class="btn join-item no-animation bg-base-200 text-base-content/70 pointer-events-none min-h-[48px] border-r-0 text-lg sm:min-h-[52px]"
			>
				$
			</span>
			<input
				id="earn-withdraw-amount"
				type="text"
				class="input input-bordered join-item min-h-[48px] flex-1 text-lg sm:min-h-[52px] sm:text-base"
				placeholder="0.00"
				bind:value={amount}
				inputmode="decimal"
				disabled={!hasPosition}
				oninput={(e) => {
					const target = e.currentTarget;
					if (target.value.includes(',')) {
						target.value = target.value.replace(/,/g, '.');
					}
				}}
			/>
			<button
				type="button"
				class="btn join-item min-h-[48px] touch-manipulation rounded-r-lg active:scale-95 sm:min-h-[52px]"
				onclick={setMaxAmount}
				disabled={!hasPosition || !isOnline}
			>
				<span class="text-xs sm:text-sm">{$t('wallet.defi.earn.withdraw_all')}</span>
			</button>
		</div>
	</div>

	<!-- Projected balance -->
	{#if amountNum > 0}
		<div class="bg-base-200 rounded-box p-3 text-xs">
			{$t('wallet.defi.earn.withdraw_projected', {
				values: { amount: `$${projectedBalance.toFixed(2)}` }
			})}
		</div>
	{/if}

	<!-- Error state -->
	{#if txError}
		<div class="alert alert-soft alert-error py-1 text-xs" role="alert">
			<span>{txError}</span>
			<button type="button" class="btn btn-ghost btn-xs" onclick={() => (txError = null)}>✕</button>
		</div>
	{/if}

	<!-- Exceeds balance warning -->
	{#if amountNum > suppliedFormatted && amountNum > 0}
		<div class="alert alert-soft alert-error py-2 text-xs">
			{$t('wallet.defi.shared.error_insufficient_funds')}
		</div>
	{/if}

	<!-- CTA -->
	<button
		type="button"
		class="btn btn-primary min-h-[48px] w-full"
		disabled={!canWithdraw || isProcessing}
		onclick={handleWithdraw}
		aria-busy={isProcessing}
	>
		{#if isProcessing}
			<span class="loading loading-spinner loading-sm"></span>
			{$t('wallet.defi.shared.pending_tx')}
		{:else}
			{$t('wallet.defi.earn.action_withdraw_confirm')}
		{/if}
	</button>
</div>

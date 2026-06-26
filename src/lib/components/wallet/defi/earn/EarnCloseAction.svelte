<script lang="ts">
	import { t } from 'svelte-i18n';
	import { get } from 'svelte/store';
	import { ethers } from 'ethers';
	import { tryCatch } from '$lib/utils/tryCatch';
	import { walletStore } from '$lib/stores/wallet.store';
	import { getEvmSigner } from '$lib/stores/connected-wallets.store';
	import { defiPositions } from '$lib/stores/defi-positions.store.svelte';
	import { browserNetworkStatus } from '$lib/utils/network-status';
	import { extractContractError } from '$lib/utils/wallet/contractErrorHandler';
	import { AaveService, USDT0_ARBITRUM } from '$lib/services/defi/aave.service';
	import { appStore } from '$lib/stores/app.store';
	import * as Sentry from '@sentry/sveltekit';

	const ARB_PUBLIC_RPC = 'https://arb1.arbitrum.io/rpc';

	interface Props {
		walletId: string;
		address: string;
		onSuccess: () => void;
	}

	let { walletId, address: _address, onSuccess }: Props = $props();

	let isProcessing = $state(false);
	let txError = $state<string | null>(null);

	let isOnline = $derived($browserNetworkStatus.online);

	let pos = $derived(defiPositions.aavePositions.get(walletId) ?? null);
	let suppliedRaw = $derived(pos?.suppliedUsdt0Raw ?? 0n);
	let suppliedFormatted = $derived(pos ? parseFloat(pos.suppliedUsdt0) : 0);
	let healthFactor = $derived(pos?.healthFactor ?? 0);
	let hasPosition = $derived(suppliedRaw > 0n);

	let canClose = $derived(hasPosition && isOnline && !isProcessing);

	async function handleClose() {
		if (!canClose || isProcessing) return;
		isProcessing = true;
		txError = null;

		Sentry.addBreadcrumb({
			category: 'defi.earn.close',
			message: 'sending close (withdraw all)',
			data: { suppliedRaw: suppliedRaw.toString(), walletId }
		});

		const aave = new AaveService(new ethers.JsonRpcProvider(ARB_PUBLIC_RPC));

		if (walletId === 'builtin') {
			const s = get(walletStore);
			const rskW = s.rsk?.wallet as ethers.Wallet | undefined;
			if (!rskW) {
				txError = $t('wallet.defi.approve.error');
				isProcessing = false;
				return;
			}
			const signer = rskW.connect(new ethers.JsonRpcProvider(ARB_PUBLIC_RPC));
			const { data: tx, error } = await tryCatch(
				aave.withdraw(USDT0_ARBITRUM, suppliedRaw, signer)
			);
			if (error || !tx) {
				const contractErr = extractContractError(error);
				txError = contractErr.userMessage;
				Sentry.captureException(error, { tags: { feature: 'defi.lend', action: 'close' } });
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
				aave.withdrawWithEvmSigner(USDT0_ARBITRUM, suppliedRaw, evm)
			);
			if (error || !tx) {
				const contractErr = extractContractError(error);
				txError = contractErr.userMessage;
				Sentry.captureException(error, { tags: { feature: 'defi.lend', action: 'close' } });
				isProcessing = false;
				return;
			}
		}

		appStore.showSuccessToast($t('wallet.defi.shared.pending_tx'));
		await Promise.allSettled([defiPositions.refreshAavePosition(walletId)]);
		isProcessing = false;
		onSuccess();
	}
</script>

<div class="flex flex-col gap-3">
	{#if !isOnline}
		<div class="alert alert-soft alert-warning py-2 text-xs" role="alert">
			{$t('wallet.defi.shared.offline')}
		</div>
	{/if}

	<!-- Confirmation description -->
	<p class="text-base-content/70 text-sm">
		{$t('wallet.defi.earn.close_confirm_desc_lending')}
	</p>

	<!-- Position summary -->
	<div class="bg-base-200 rounded-box space-y-2 p-3 text-sm">
		<div class="flex items-center justify-between">
			<span class="text-base-content/60">{$t('wallet.defi.earn.overview_supplied')}</span>
			<span class="font-medium tabular-nums">${suppliedFormatted.toFixed(2)}</span>
		</div>
		{#if healthFactor > 0}
			<div class="flex items-center justify-between">
				<span class="text-base-content/60">{$t('wallet.defi.position.health_factor')}</span>
				<span class="font-medium tabular-nums">{healthFactor.toFixed(2)}</span>
			</div>
		{/if}
	</div>

	<!-- Error state -->
	{#if txError}
		<div class="alert alert-soft alert-error py-1 text-xs" role="alert">
			<span>{txError}</span>
			<button type="button" class="btn btn-ghost btn-xs" onclick={() => (txError = null)}>✕</button>
		</div>
	{/if}

	{#if !hasPosition}
		<div class="alert alert-soft alert-warning py-2 text-xs">
			{$t('wallet.defi.earn.card_no_position')}
		</div>
	{/if}

	<!-- CTA -->
	<button
		type="button"
		class="btn btn-error min-h-[48px] w-full"
		disabled={!canClose || isProcessing}
		onclick={handleClose}
		aria-busy={isProcessing}
	>
		{#if isProcessing}
			<span class="loading loading-spinner loading-sm"></span>
			{$t('wallet.defi.shared.pending_tx')}
		{:else}
			{$t('wallet.defi.earn.action_close_confirm')}
		{/if}
	</button>
</div>

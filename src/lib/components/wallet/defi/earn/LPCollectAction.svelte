<script lang="ts">
	import { t } from 'svelte-i18n';
	import { get } from 'svelte/store';
	import { ethers } from 'ethers';
	import { tryCatch } from '$lib/utils/tryCatch';
	import { walletStore } from '$lib/stores/wallet.store';
	import { getEvmSigner } from '$lib/stores/connected-wallets.store';
	import { defiPositions, type UniswapLPPosition } from '$lib/stores/defi-positions.store.svelte';
	import { browserNetworkStatus } from '$lib/utils/network-status';
	import { UniswapService } from '$lib/services/defi/uniswap.service';
	import { appStore } from '$lib/stores/app.store';
	import * as Sentry from '@sentry/sveltekit';

	const ARB_PUBLIC_RPC = 'https://arb1.arbitrum.io/rpc';

	interface Props {
		walletId: string;
		address: string;
		position: UniswapLPPosition;
		onSuccess: () => void;
	}

	let { walletId, address: _address, position, onSuccess }: Props = $props();

	let isProcessing = $state(false);
	let txState = $state<'idle' | 'collecting' | 'success' | 'error'>('idle');
	let txError = $state<string | null>(null);

	let isOnline = $derived($browserNetworkStatus.online);

	// WBTC fees: token0 (8 decimals), USDT0 fees: token1 (6 decimals)
	let feesWbtc = $derived(Number(position.fees0) / 1e8);
	let feesUsdt0 = $derived(Number(position.fees1) / 1e6);
	let hasAnyFees = $derived(position.fees0 > 0n || position.fees1 > 0n);

	let canCollect = $derived(hasAnyFees && isOnline && !isProcessing && txState === 'idle');

	function clearTx() {
		txState = 'idle';
		txError = null;
		isProcessing = false;
	}

	async function handleCollect() {
		if (!canCollect || isProcessing) return;

		const recipient = defiPositions.resolveAddress(walletId);
		if (!recipient) {
			txError = $t('wallet.defi.shared.error_generic');
			txState = 'error';
			return;
		}

		isProcessing = true;
		txState = 'collecting';
		txError = null;

		Sentry.addBreadcrumb({
			category: 'defi.uniswap',
			message: 'LP collect started',
			data: { tokenId: position.tokenId.toString(), walletId }
		});

		const provider = new ethers.JsonRpcProvider(ARB_PUBLIC_RPC);
		const uni = new UniswapService(provider);

		if (walletId === 'builtin') {
			const s = get(walletStore);
			const rskW = s.rsk?.wallet as ethers.Wallet | undefined;
			if (!rskW) {
				txError = $t('wallet.defi.approve.error');
				txState = 'error';
				isProcessing = false;
				Sentry.captureException(new Error('Signer unavailable for LP collect'), {
					tags: { feature: 'defi.lp', action: 'collect', walletId }
				});
				return;
			}
			const signer = rskW.connect(provider);
			const { error } = await tryCatch(uni.collectFees(position.tokenId, recipient, signer));
			if (error) {
				txError = error instanceof Error ? error.message : $t('wallet.defi.shared.error_generic');
				txState = 'error';
				Sentry.captureException(error, { tags: { feature: 'defi.lp', action: 'collectFees' } });
				isProcessing = false;
				return;
			}
		} else {
			const evm = getEvmSigner(walletId);
			if (!evm) {
				txError = $t('wallet.defi.approve.error');
				txState = 'error';
				isProcessing = false;
				Sentry.captureException(new Error('Signer unavailable for LP collect'), {
					tags: { feature: 'defi.lp', action: 'collect', walletId }
				});
				return;
			}
			const { error } = await tryCatch(
				uni.collectFeesWithEvmSigner(position.tokenId, recipient, evm)
			);
			if (error) {
				txError = error instanceof Error ? error.message : $t('wallet.defi.shared.error_generic');
				txState = 'error';
				Sentry.captureException(error, { tags: { feature: 'defi.lp', action: 'collectFees' } });
				isProcessing = false;
				return;
			}
		}

		await defiPositions.refreshUniswapPosition(walletId, position.tokenId);
		appStore.showSuccessToast($t('wallet.defi.lp.collect_success'));
		txState = 'success';
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

	<!-- Earned amounts -->
	<div class="bg-base-200 rounded-box space-y-2 p-3 text-sm">
		<div class="flex items-center justify-between">
			<span class="text-base-content/60">WBTC {$t('wallet.defi.earn.overview_earned')}</span>
			<span class="font-medium tabular-nums">{feesWbtc.toFixed(8)} WBTC</span>
		</div>
		<div class="flex items-center justify-between">
			<span class="text-base-content/60">USDT0 {$t('wallet.defi.earn.overview_earned')}</span>
			<span class="font-medium tabular-nums">${feesUsdt0.toFixed(6)}</span>
		</div>
	</div>

	<!-- Collect amount preview -->
	{#if hasAnyFees}
		<div class="bg-base-200 rounded-box p-3 text-xs">
			{$t('wallet.defi.earn.collect_amount', {
				values: { amount: `${feesWbtc.toFixed(8)} WBTC + $${feesUsdt0.toFixed(6)} USDT0` }
			})}
		</div>
	{/if}

	{#if !hasAnyFees}
		<div class="alert alert-soft alert-info py-2 text-xs">
			{$t('wallet.defi.lp.no_fees_to_collect')}
		</div>
	{/if}

	<!-- Error state -->
	{#if txState === 'error' && txError}
		<div class="alert alert-soft alert-error py-1 text-xs" role="alert">
			{txError}
			<button type="button" class="btn btn-xs mt-1" onclick={clearTx}>
				{$t('common.cancel')}
			</button>
		</div>
	{/if}

	<!-- CTA -->
	<button
		type="button"
		class="btn btn-primary min-h-[48px] w-full"
		disabled={!canCollect}
		onclick={handleCollect}
		aria-busy={isProcessing}
	>
		{#if isProcessing}
			<span class="loading loading-spinner loading-sm"></span>
			{$t('wallet.defi.shared.pending_tx')}
		{:else}
			{$t('wallet.defi.earn.action_collect_confirm')}
		{/if}
	</button>
</div>

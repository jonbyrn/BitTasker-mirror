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

	let selectedPercent = $state(100);
	let isProcessing = $state(false);
	let txState = $state<'idle' | 'removing' | 'success' | 'error'>('idle');
	let txError = $state<string | null>(null);

	let isOnline = $derived($browserNetworkStatus.online);

	let removeLiquidityAmount = $derived((position.liquidity * BigInt(selectedPercent)) / 100n);

	let hasLiquidity = $derived(position.liquidity > 0n);
	let canRemove = $derived(
		hasLiquidity && selectedPercent > 0 && isOnline && !isProcessing && txState === 'idle'
	);

	const percentOptions = [25, 50, 75, 100];

	function clearTx() {
		txState = 'idle';
		txError = null;
		isProcessing = false;
	}

	async function handleRemove() {
		if (!canRemove || isProcessing) return;
		isProcessing = true;
		txState = 'removing';
		txError = null;

		Sentry.addBreadcrumb({
			category: 'defi.uniswap',
			message: 'LP remove started',
			data: { tokenId: position.tokenId.toString(), percent: selectedPercent, walletId }
		});

		const provider = new ethers.JsonRpcProvider(ARB_PUBLIC_RPC);
		const uni = new UniswapService(provider);
		const deadline = UniswapService.defaultDeadline();

		if (walletId === 'builtin') {
			const s = get(walletStore);
			const rskW = s.rsk?.wallet as ethers.Wallet | undefined;
			if (!rskW) {
				txError = $t('wallet.defi.approve.error');
				txState = 'error';
				isProcessing = false;
				Sentry.captureException(new Error('Signer unavailable for LP remove'), {
					tags: { feature: 'defi.lp', action: 'remove', walletId }
				});
				return;
			}
			const signer = rskW.connect(provider);
			const { error } = await tryCatch(
				uni.removeLiquidity(position.tokenId, removeLiquidityAmount, 0n, 0n, deadline, signer)
			);
			if (error) {
				txError = error instanceof Error ? error.message : $t('wallet.defi.shared.error_generic');
				txState = 'error';
				Sentry.captureException(error, { tags: { feature: 'defi.lp', action: 'removeLiquidity' } });
				isProcessing = false;
				return;
			}
		} else {
			const evm = getEvmSigner(walletId);
			if (!evm) {
				txError = $t('wallet.defi.approve.error');
				txState = 'error';
				isProcessing = false;
				Sentry.captureException(new Error('Signer unavailable for LP remove'), {
					tags: { feature: 'defi.lp', action: 'remove', walletId }
				});
				return;
			}
			const { error } = await tryCatch(
				uni.removeLiquidityWithEvmSigner(
					position.tokenId,
					removeLiquidityAmount,
					0n,
					0n,
					deadline,
					evm
				)
			);
			if (error) {
				txError = error instanceof Error ? error.message : $t('wallet.defi.shared.error_generic');
				txState = 'error';
				Sentry.captureException(error, { tags: { feature: 'defi.lp', action: 'removeLiquidity' } });
				isProcessing = false;
				return;
			}
		}

		await defiPositions.refreshUniswapPosition(walletId, position.tokenId);
		appStore.showSuccessToast($t('wallet.defi.lp.remove_success'));
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

	<!-- Percentage selector -->
	<div>
		<span class="label-text mb-2 text-sm font-medium">
			{$t('wallet.defi.earn.remove_percent_label')}
		</span>
		<div class="mt-2 flex gap-2">
			{#each percentOptions as pct (pct)}
				<button
					type="button"
					class="btn btn-sm flex-1 touch-manipulation"
					class:btn-primary={selectedPercent === pct}
					class:btn-outline={selectedPercent !== pct}
					onclick={() => (selectedPercent = pct)}
					disabled={isProcessing}
				>
					{pct}%
				</button>
			{/each}
		</div>
	</div>

	<!-- Estimated receive (derived from position liquidity proportion) -->
	{#if hasLiquidity && selectedPercent > 0}
		<div class="bg-base-200 rounded-box p-3 text-xs">
			{$t('wallet.defi.earn.remove_receive', {
				values: { wbtc: '— WBTC', usdt0: '— USDT0' }
			})}
		</div>
	{/if}

	{#if !hasLiquidity}
		<div class="alert alert-soft alert-warning py-2 text-xs">
			{$t('wallet.defi.earn.card_no_position')}
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
		disabled={!canRemove}
		onclick={handleRemove}
		aria-busy={isProcessing}
	>
		{#if isProcessing}
			<span class="loading loading-spinner loading-sm"></span>
			{$t('wallet.defi.shared.pending_tx')}
		{:else}
			{$t('wallet.defi.earn.action_remove_confirm')}
		{/if}
	</button>
</div>

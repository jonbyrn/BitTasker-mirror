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
	import { btcPrice } from '$lib/runes/btcPrice.svelte';
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

	/** 0.5% slippage protection — industry standard default */
	const SLIPPAGE_BPS = 50;

	let isOnline = $derived($browserNetworkStatus.online);

	let removeLiquidityAmount = $derived((position.liquidity * BigInt(selectedPercent)) / 100n);

	let hasLiquidity = $derived(position.liquidity > 0n);
	let canRemove = $derived(
		hasLiquidity &&
			selectedPercent > 0 &&
			isOnline &&
			!isProcessing &&
			txState === 'idle' &&
			currentPrice > 0
	);

	// Calculate approximate receive amounts based on selected percent
	let currentPrice = $derived(btcPrice.price);
	let removeWbtc = $derived.by(() => {
		if (!currentPrice || currentPrice <= 0 || position.liquidity === 0n) return 0;
		const liqNum = Number(position.liquidity);
		if (!isFinite(liqNum) || liqNum <= 0) return 0;
		const sqrtPrice = Math.sqrt(currentPrice * 100);
		if (sqrtPrice <= 0) return 0;
		const fullAmount = liqNum / sqrtPrice / 1e8;
		return isFinite(fullAmount) && fullAmount > 0 ? (fullAmount * selectedPercent) / 100 : 0;
	});
	let removeUsdt0 = $derived.by(() => {
		if (!currentPrice || currentPrice <= 0 || position.liquidity === 0n) return 0;
		const liqNum = Number(position.liquidity);
		if (!isFinite(liqNum) || liqNum <= 0) return 0;
		const sqrtPrice = Math.sqrt(currentPrice * 100);
		const fullAmount = (liqNum * sqrtPrice) / 1e6;
		return isFinite(fullAmount) && fullAmount > 0 ? (fullAmount * selectedPercent) / 100 : 0;
	});
	let removeTotalUsd = $derived(removeWbtc * currentPrice + removeUsdt0);

	// Slippage-protected minimum amounts for removeLiquidity call
	let expectedAmount0 = $derived(BigInt(Math.round(removeWbtc * 1e8)));
	let expectedAmount1 = $derived(BigInt(Math.round(removeUsdt0 * 1e6)));
	let amount0Min = $derived((expectedAmount0 * BigInt(10000 - SLIPPAGE_BPS)) / 10000n);
	let amount1Min = $derived((expectedAmount1 * BigInt(10000 - SLIPPAGE_BPS)) / 10000n);

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
				uni.removeLiquidity(
					position.tokenId,
					removeLiquidityAmount,
					amount0Min,
					amount1Min,
					deadline,
					signer
				)
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
					amount0Min,
					amount1Min,
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

	<!-- Percentage slider -->
	<div>
		<span class="label-text mb-2 text-sm font-medium">
			{$t('wallet.defi.earn.remove_percent_label')}
		</span>
		<div class="form-control py-2">
			<div class="flex items-center gap-3" class:opacity-50={isProcessing || !hasLiquidity}>
				<span class="text-primary min-w-[3ch] text-right text-sm font-semibold"
					>{selectedPercent}%</span
				>
				<input
					type="range"
					min="0"
					max="100"
					step="1"
					value={selectedPercent}
					class="range range-primary range-sm flex-1"
					oninput={(e) => (selectedPercent = parseInt(e.currentTarget.value))}
					disabled={isProcessing || !hasLiquidity}
				/>
			</div>
		</div>
		<!-- Quick percent buttons -->
		<div class="mt-1 flex gap-2">
			{#each [25, 50, 75, 100] as pct (pct)}
				<button
					type="button"
					class="btn btn-xs flex-1 touch-manipulation"
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

	<!-- Estimated receive -->
	{#if hasLiquidity && selectedPercent > 0}
		<div class="bg-base-200 rounded-lg p-2.5 text-xs">
			<div class="mb-1 font-medium">{$t('wallet.defi.earn.remove_receive')}</div>
			<div class="flex items-center justify-between">
				<span class="text-base-content/70">{removeWbtc.toFixed(6)} WBTC</span>
				<span class="text-base-content/70">+ ${removeUsdt0.toFixed(2)} USDT0</span>
			</div>
			{#if removeTotalUsd > 0}
				<div class="text-base-content/50 mt-1">
					~${removeTotalUsd.toFixed(2)}
					{$t('wallet.defi.total_label')}
				</div>
			{/if}
			<p class="text-base-content/40 mt-1">
				{$t('wallet.defi.slippage_protection', { values: { percent: '0.5' } })}
			</p>
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

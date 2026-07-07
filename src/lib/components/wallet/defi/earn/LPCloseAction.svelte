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

	let isProcessing = $state(false);
	let txState = $state<'idle' | 'removing' | 'collecting' | 'success' | 'error'>('idle');
	let txError = $state<string | null>(null);
	let partialSuccess = $state(false);
	let showConfirm = $state(false);

	let isOnline = $derived($browserNetworkStatus.online);

	let hasLiquidity = $derived(position.liquidity > 0n);
	let hasAnyFees = $derived(position.fees0 > 0n || position.fees1 > 0n);

	// WBTC: 8 decimals, USDT0: 6 decimals
	let feesWbtc = $derived(Number(position.fees0) / 1e8);
	let feesUsdt0 = $derived(Number(position.fees1) / 1e6);
	let feesUsd = $derived(
		(isFinite(feesWbtc) ? feesWbtc * btcPrice.price : 0) + (isFinite(feesUsdt0) ? feesUsdt0 : 0)
	);

	// Approximate position value from liquidity
	let posValueUsd = $derived.by(() => {
		const liqNum = Number(position.liquidity);
		if (!isFinite(liqNum) || liqNum <= 0 || btcPrice.price <= 0) return 0;
		return (liqNum / 1e8) * btcPrice.price * 0.01;
	});

	let canClose = $derived(
		(hasLiquidity || hasAnyFees) && isOnline && !isProcessing && txState === 'idle'
	);

	function clearTx() {
		txState = 'idle';
		txError = null;
		isProcessing = false;
		partialSuccess = false;
	}

	async function handleClose() {
		if (!canClose || isProcessing) return;
		isProcessing = true;
		txError = null;
		partialSuccess = false;

		Sentry.addBreadcrumb({
			category: 'defi.uniswap',
			message: 'LP close started (remove + collect)',
			data: { tokenId: position.tokenId.toString(), walletId }
		});

		const provider = new ethers.JsonRpcProvider(ARB_PUBLIC_RPC);
		const uni = new UniswapService(provider);

		// Resolve signer for builtin wallet upfront (needed for both steps)
		let builtinSigner: ethers.Signer | null = null;
		if (walletId === 'builtin') {
			const s = get(walletStore);
			const rskW = s.rsk?.wallet as ethers.Wallet | undefined;
			if (!rskW) {
				txError = $t('wallet.defi.approve.error');
				txState = 'error';
				isProcessing = false;
				Sentry.captureException(new Error('Signer unavailable for LP close'), {
					tags: { feature: 'defi.lp', action: 'close', walletId }
				});
				return;
			}
			builtinSigner = rskW.connect(provider);
		} else {
			const evmCheck = getEvmSigner(walletId);
			if (!evmCheck) {
				txError = $t('wallet.defi.approve.error');
				txState = 'error';
				isProcessing = false;
				Sentry.captureException(new Error('Signer unavailable for LP close'), {
					tags: { feature: 'defi.lp', action: 'close', walletId }
				});
				return;
			}
		}

		// Step 1: Remove all liquidity
		if (hasLiquidity) {
			txState = 'removing';
			const deadline = UniswapService.defaultDeadline();

			Sentry.addBreadcrumb({
				category: 'defi.uniswap',
				message: 'close: removeLiquidity',
				data: { tokenId: position.tokenId.toString(), liquidity: position.liquidity.toString() }
			});

			if (walletId === 'builtin' && builtinSigner) {
				const { error: removeErr } = await tryCatch(
					uni.removeLiquidity(position.tokenId, position.liquidity, 0n, 0n, deadline, builtinSigner)
				);
				if (removeErr) {
					txError =
						removeErr instanceof Error ? removeErr.message : $t('wallet.defi.shared.error_generic');
					txState = 'error';
					Sentry.captureException(removeErr, {
						tags: { feature: 'defi.lp', action: 'close-remove' }
					});
					isProcessing = false;
					return;
				}
			} else {
				const evm = getEvmSigner(walletId);
				if (!evm) {
					txError = $t('wallet.defi.approve.error');
					txState = 'error';
					isProcessing = false;
					return;
				}
				const { error: removeErr } = await tryCatch(
					uni.removeLiquidityWithEvmSigner(
						position.tokenId,
						position.liquidity,
						0n,
						0n,
						deadline,
						evm
					)
				);
				if (removeErr) {
					txError =
						removeErr instanceof Error ? removeErr.message : $t('wallet.defi.shared.error_generic');
					txState = 'error';
					Sentry.captureException(removeErr, {
						tags: { feature: 'defi.lp', action: 'close-remove' }
					});
					isProcessing = false;
					return;
				}
			}
		}

		// Step 2: Collect any remaining fees
		if (hasAnyFees) {
			txState = 'collecting';
			const recipient = defiPositions.resolveAddress(walletId);
			if (!recipient) {
				// Remove succeeded but no recipient for collect — partial success
				partialSuccess = true;
				await defiPositions.refreshUniswapPosition(walletId, position.tokenId);
				appStore.showSuccessToast($t('wallet.defi.lp.remove_success'));
				txState = 'success';
				isProcessing = false;
				onSuccess();
				return;
			}

			Sentry.addBreadcrumb({
				category: 'defi.uniswap',
				message: 'close: collectFees',
				data: { tokenId: position.tokenId.toString() }
			});

			if (walletId === 'builtin' && builtinSigner) {
				const { error: collectErr } = await tryCatch(
					uni.collectFees(position.tokenId, recipient, builtinSigner)
				);
				if (collectErr) {
					// Remove succeeded but collect failed — partial success
					partialSuccess = true;
					await defiPositions.refreshUniswapPosition(walletId, position.tokenId);
					appStore.showInfoToast($t('wallet.defi.lp.remove_success'));
					txError =
						collectErr instanceof Error
							? collectErr.message
							: $t('wallet.defi.shared.error_generic');
					txState = 'error';
					Sentry.captureException(collectErr, {
						tags: { feature: 'defi.lp', action: 'close-collect' }
					});
					isProcessing = false;
					return;
				}
			} else {
				const evm = getEvmSigner(walletId);
				if (!evm) {
					partialSuccess = true;
					await defiPositions.refreshUniswapPosition(walletId, position.tokenId);
					appStore.showInfoToast($t('wallet.defi.lp.remove_success'));
					txError = $t('wallet.defi.approve.error');
					txState = 'error';
					isProcessing = false;
					return;
				}
				const { error: collectErr } = await tryCatch(
					uni.collectFeesWithEvmSigner(position.tokenId, recipient, evm)
				);
				if (collectErr) {
					partialSuccess = true;
					await defiPositions.refreshUniswapPosition(walletId, position.tokenId);
					appStore.showInfoToast($t('wallet.defi.lp.remove_success'));
					txError =
						collectErr instanceof Error
							? collectErr.message
							: $t('wallet.defi.shared.error_generic');
					txState = 'error';
					Sentry.captureException(collectErr, {
						tags: { feature: 'defi.lp', action: 'close-collect' }
					});
					isProcessing = false;
					return;
				}
			}
		}

		// Full success
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

	<!-- Confirmation description -->
	<p class="text-base-content/70 text-sm">
		{$t('wallet.defi.earn.close_confirm_desc_lp')}
	</p>

	<!-- Earned callout -->
	{#if feesUsd > 0}
		<div class="bg-base-200 rounded-lg p-2.5">
			<p class="text-xs font-medium">{$t('wallet.defi.earn.overview_earned')}</p>
			<p class="text-base-content/60 text-[11px]">
				{$t('wallet.defi.earn.close_earned_since_lp', {
					values: { amount: `$${feesUsd.toFixed(4)}` }
				})}
			</p>
		</div>
	{/if}

	<!-- Position summary -->
	<div class="bg-base-200 space-y-2 rounded-lg p-2.5 text-sm">
		{#if posValueUsd > 0}
			<div class="flex items-center justify-between">
				<span class="text-base-content/60">{$t('wallet.defi.earn.lp_position_value')}</span>
				<span class="font-medium tabular-nums">${posValueUsd.toFixed(2)}</span>
			</div>
		{/if}
		{#if hasAnyFees}
			<div class="flex items-center justify-between">
				<span class="text-base-content/60">{$t('wallet.defi.earn.overview_earned_unclaimed')}</span>
				<span class="text-xs font-medium tabular-nums">
					{feesWbtc.toFixed(8)} WBTC + ${feesUsdt0.toFixed(6)} USDT0
				</span>
			</div>
		{/if}
	</div>

	<!-- Partial success notice -->
	{#if partialSuccess && txState === 'error'}
		<div class="alert alert-soft alert-warning py-2 text-xs" role="alert">
			{$t('wallet.defi.lp.remove_success')} — {txError}
		</div>
	{:else if txState === 'error' && txError}
		<div class="alert alert-soft alert-error py-1 text-xs" role="alert">
			{txError}
			<button type="button" class="btn btn-xs mt-1" onclick={clearTx}>
				{$t('common.cancel')}
			</button>
		</div>
	{/if}

	{#if !hasLiquidity && !hasAnyFees}
		<div class="alert alert-soft alert-info py-2 text-xs">
			{$t('wallet.defi.earn.card_no_position')}
		</div>
	{/if}

	<!-- CTA -->
	{#if !showConfirm}
		<button
			type="button"
			class="btn btn-error min-h-[48px] w-full"
			disabled={!canClose}
			onclick={() => (showConfirm = true)}
		>
			{$t('wallet.defi.earn.action_close_lp_confirm')}
		</button>
	{:else}
		<div class="alert alert-warning">
			<p>{$t('wallet.defi.close_position_confirm')}</p>
			<div class="mt-2 flex gap-2">
				<button
					type="button"
					class="btn btn-error btn-sm"
					disabled={!canClose}
					onclick={handleClose}
					aria-busy={isProcessing}
				>
					{#if isProcessing}
						<span class="loading loading-spinner loading-xs"></span>
					{/if}
					{$t('common.confirm')}
				</button>
				<button
					type="button"
					class="btn btn-ghost btn-sm"
					onclick={() => (showConfirm = false)}
					disabled={isProcessing}
				>
					{$t('common.cancel')}
				</button>
			</div>
		</div>
	{/if}
</div>

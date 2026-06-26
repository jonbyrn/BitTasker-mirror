<script lang="ts">
	import { t } from 'svelte-i18n';
	import { get } from 'svelte/store';
	import { ethers } from 'ethers';
	import * as Sentry from '@sentry/sveltekit';
	import { tryCatch } from '$lib/utils/tryCatch';
	import { walletStore } from '$lib/stores/wallet.store';
	import { connectedWalletsStore, getEvmSigner } from '$lib/stores/connected-wallets.store';
	import { browserNetworkStatus } from '$lib/utils/network-status';
	import { appStore } from '$lib/stores/app.store';
	import { defiPositions } from '$lib/stores/defi-positions.store.svelte';
	import { FeatureFlagService, FEATURE_FLAGS } from '$lib/services/kill-switch';
	import { btcPrice } from '$lib/runes/btcPrice.svelte';
	import {
		UniswapService,
		FEE_TIER,
		FULL_RANGE,
		type MintParams
	} from '$lib/services/defi/uniswap.service';
	import WalletSelector from '$lib/components/wallet/WalletSelector.svelte';
	import ApproveModal from '$lib/components/wallet/ApproveModal.svelte';
	import type { UniswapLPPosition } from '$lib/stores/defi-positions.store.svelte';

	const ARB_RPC = 'https://arb1.arbitrum.io/rpc';
	const NPM_ADDR = '0xC36442b4a4522E871399CD717aBDD847Ab11FE88';

	interface Props {
		walletId: string;
		address: string;
		onSuccess: (txHash?: string) => void;
		existingPosition?: UniswapLPPosition | null;
	}

	let { walletId, address: _address, onSuccess, existingPosition = null }: Props = $props();

	let amount = $state('');
	let isProcessing = $state(false);
	let ilExpanded = $state(false);
	let sourceExpanded = $state(false);
	let selectedWalletId = $state<'builtin' | string>(walletId);
	let txState = $state<
		'idle' | 'approving-wbtc' | 'approving-usdt0' | 'providing' | 'success' | 'error'
	>('idle');
	let txError = $state<string | null>(null);
	let txMessage = $state('');
	let pendingAfterApproves = $state(false);
	let approveWbtcOpen = $state(false);
	let approveUsdtOpen = $state(false);

	let isOnline = $derived($browserNetworkStatus.online);
	let amountNum = $derived.by(() => {
		const n = parseFloat(amount);
		return isFinite(n) && n > 0 ? n : 0;
	});
	let wbtcUsdValue = $derived($walletStore.arb.wbtcUsdValue ?? 0);
	let usdt0Bal = $derived(parseFloat($walletStore.arb.usdt0Balance ?? '0') || 0);
	let hasBoth = $derived(wbtcUsdValue > 0 && usdt0Bal > 0);
	let isIncrease = $derived(!!existingPosition && existingPosition.liquidity > 0n);
	let currentPrice = $derived(btcPrice.price);

	let wbtcAmt = $derived.by(() => {
		const half = amountNum / 2;
		return currentPrice > 1000 ? half / currentPrice : half / 74000;
	});
	let usdt0Amt = $derived(amountNum / 2);
	let canProvide = $derived(
		amountNum > 0 && hasBoth && isOnline && !isProcessing && txState === 'idle'
	);

	function formatSats(n: number): string {
		return n.toLocaleString('en-US');
	}

	function walletBalanceFor(id: string): string {
		if (id === 'builtin') {
			const w = Math.round(
				($walletStore.arb?.formattedWbtcBalance
					? parseFloat($walletStore.arb.formattedWbtcBalance)
					: 0) * 1e8
			);
			const u = parseFloat($walletStore.arb?.usdt0Balance || '0');
			return `${formatSats(w)} Sats / $${u.toFixed(2)} USDT0`;
		}
		const cw = $connectedWalletsStore.wallets.find((c) => c.id === id);
		if (!cw) return '$0 / 0 Sats';
		const ws = Math.round(
			Number(cw.balances?.['wbtc-arb']?.raw ?? cw.balances?.wbtc?.raw ?? 0) / 1e10
		);
		const us = Number(cw.balances?.['usdt0-arb']?.raw ?? 0) / 1e6;
		return `${formatSats(ws)} Sats / $${us.toFixed(2)} USDT0`;
	}

	let builtinBalDisplay = $derived(
		`${formatSats(Math.round(($walletStore.arb?.formattedWbtcBalance ? parseFloat($walletStore.arb.formattedWbtcBalance) : 0) * 1e8))} Sats`
	);

	function setMaxAmount() {
		if (!isOnline || !hasBoth) return;
		amount = Math.min(
			$walletStore.arb.wbtcUsdValue,
			parseFloat($walletStore.arb.usdt0Balance || '0')
		).toFixed(2);
	}

	function clearTx() {
		txState = 'idle';
		txError = null;
		txMessage = '';
		isProcessing = false;
	}

	async function getSigner() {
		if (selectedWalletId === 'builtin') {
			const s = get(walletStore);
			const rskW = s.rsk?.wallet as ethers.Wallet | undefined;
			if (!rskW) return null;
			return rskW.connect(new ethers.JsonRpcProvider(ARB_RPC));
		}
		return getEvmSigner(selectedWalletId) ?? null;
	}

	async function handleApprove(
		tokenAddr: string,
		amountStr: string,
		decimals: number,
		label: string
	) {
		const amt = ethers.parseUnits(amountStr, decimals);
		const iface = new ethers.Interface([
			'function approve(address spender, uint256 amount) returns (bool)'
		]);
		const data = iface.encodeFunctionData('approve', [NPM_ADDR, amt]);

		if (selectedWalletId === 'builtin') {
			const s = get(walletStore);
			const rskW = s.rsk?.wallet as ethers.Wallet | undefined;
			if (!rskW) {
				txError = $t('wallet.defi.shared.error_generic');
				throw new Error(txError);
			}
			const signer = rskW.connect(new ethers.JsonRpcProvider(ARB_RPC));
			const token = new ethers.Contract(
				tokenAddr,
				['function approve(address spender, uint256 amount) returns (bool)'],
				signer
			);
			const { error } = await tryCatch(token.approve(NPM_ADDR, amt));
			if (error) {
				txError = error.message || `${label} approve failed`;
				Sentry.captureException(error, {
					tags: { feature: 'defi.lp', action: `approve-${label.toLowerCase()}` }
				});
				throw error;
			}
		} else {
			const evm = getEvmSigner(selectedWalletId);
			if (!evm) {
				txError = $t('wallet.defi.shared.error_generic');
				throw new Error(txError);
			}
			const { error } = await tryCatch(
				evm.sendTransaction({ to: tokenAddr, data, chainId: 42161 })
			);
			if (error) {
				txError = error.message || `${label} approve failed`;
				Sentry.captureException(error, {
					tags: { feature: 'defi.lp', action: `approve-${label.toLowerCase()}` }
				});
				throw error;
			}
		}
	}

	async function doProvide() {
		isProcessing = true;
		txState = 'providing';
		txError = null;
		txMessage = $t('wallet.defi.shared.pending_tx');
		const signer = await getSigner();
		if (!signer) {
			txError = $t('wallet.defi.shared.error_generic');
			txState = 'error';
			isProcessing = false;
			return;
		}
		const recipient = defiPositions.resolveAddress(selectedWalletId);
		if (!recipient) {
			txError = $t('wallet.defi.shared.error_generic');
			txState = 'error';
			isProcessing = false;
			return;
		}

		const uni = new UniswapService(new ethers.JsonRpcProvider(ARB_RPC));
		const a0 = ethers.parseUnits(wbtcAmt.toFixed(8), 8);
		const a1 = ethers.parseUnits(usdt0Amt.toFixed(6), 6);
		Sentry.addBreadcrumb({
			category: 'defi.uniswap',
			message: isIncrease ? 'increaseLiquidity' : 'addLiquidity',
			data: { recipient: recipient.slice(0, 8) + '...' }
		});

		try {
			let txHash = '';
			if (isIncrease && existingPosition) {
				const dl = UniswapService.defaultDeadline();
				if (selectedWalletId === 'builtin') {
					const tx = await uni.increaseLiquidity(
						existingPosition.tokenId,
						a0,
						a1,
						0n,
						0n,
						dl,
						signer
					);
					txHash = tx.hash;
				} else {
					const es = getEvmSigner(selectedWalletId);
					if (!es) throw new Error($t('wallet.defi.shared.error_generic'));
					const r = await uni.increaseLiquidityWithEvmSigner(
						existingPosition.tokenId,
						a0,
						a1,
						0n,
						0n,
						dl,
						es
					);
					txHash = (r as unknown as { hash?: string })?.hash || 'broadcast';
				}
				await defiPositions.refreshUniswapPosition(selectedWalletId, existingPosition.tokenId);
			} else {
				const mp: MintParams = {
					token0: UniswapService.WBTC_ARBITRUM,
					token1: UniswapService.USDT0_ARBITRUM,
					fee: FEE_TIER.LOW,
					tickLower: FULL_RANGE.TICK_LOWER,
					tickUpper: FULL_RANGE.TICK_UPPER,
					amount0Desired: a0,
					amount1Desired: a1,
					amount0Min: 0n,
					amount1Min: 0n,
					recipient,
					deadline: UniswapService.defaultDeadline()
				};
				let tokenId: bigint | null = null;
				if (selectedWalletId === 'builtin') {
					const tx = await uni.addLiquidity(mp, signer);
					txHash = tx.hash;
					try {
						const rc = await tx.wait();
						if (rc?.logs) {
							for (const l of rc.logs) {
								if (l.address?.toLowerCase() === NPM_ADDR.toLowerCase() && l.topics?.length >= 4) {
									const id = BigInt(l.topics[3]);
									if (id > 0n) {
										tokenId = id;
										break;
									}
								}
							}
						}
					} catch {
						/* non-fatal */
					}
				} else {
					const es = getEvmSigner(selectedWalletId);
					if (!es) throw new Error($t('wallet.defi.shared.error_generic'));
					const r = await uni.addLiquidityWithEvmSigner(mp, es);
					txHash = (r as unknown as { hash?: string })?.hash || 'broadcast';
				}
				if (tokenId) await defiPositions.refreshUniswapPosition(selectedWalletId, tokenId);
			}
			appStore.showSuccessToast($t('wallet.defi.lp.button_approve_lp'));
			txState = 'success';
			txMessage = $t('wallet.defi.lp.remove_success');
			amount = '';
			onSuccess(txHash);
		} catch (e: unknown) {
			txError = e instanceof Error ? e.message : $t('wallet.defi.shared.error_generic');
			txState = 'error';
			Sentry.captureException(e, { tags: { feature: 'defi.lp', action: 'provide' } });
		} finally {
			isProcessing = false;
		}
	}

	async function handleProvide() {
		if (!canProvide) return;
		isProcessing = true;
		txError = null;
		Sentry.addBreadcrumb({
			category: 'defi.uniswap',
			message: 'LP provide started',
			data: { amountNum, wallet: selectedWalletId }
		});
		if (!FeatureFlagService.isEnabled(FEATURE_FLAGS.LOAN_FLOW)) {
			appStore.showInfoToast($t('wallet.defi.lp.sim_preview') + ' (LOAN_FLOW flag off)');
			isProcessing = false;
			return;
		}
		pendingAfterApproves = true;
		approveWbtcOpen = true;
		txState = 'approving-wbtc';
		txMessage = $t('wallet.defi.shared.pending_tx');
	}
</script>

<div class="space-y-3">
	{#if !isOnline}
		<div class="alert alert-soft alert-warning py-2 text-xs" role="alert">
			{$t('wallet.defi.shared.offline')}
		</div>
	{/if}
	{#if !hasBoth}
		<div class="alert alert-outline alert-warning rounded-box py-2 text-xs" role="alert">
			{$t('wallet.defi.needs_both')}
		</div>
	{/if}

	<WalletSelector
		label={$t('wallet.from') + ':'}
		selectedId={selectedWalletId}
		onSelect={(id) => {
			selectedWalletId = id as 'builtin' | string;
			txError = null;
		}}
		builtinBalance={builtinBalDisplay}
		connectedWallets={$connectedWalletsStore.wallets}
		{walletBalanceFor}
		expanded={sourceExpanded}
		onToggle={() => (sourceExpanded = !sourceExpanded)}
	/>

	<div class="bg-base-200 rounded-box flex justify-between p-3 text-sm">
		<span>{$t('wallet.defi.lp.fee_tier_label')}</span>
		<span class="font-medium">{$t('wallet.defi.lp.fee_tier_005')}</span>
	</div>

	<div>
		<label class="label" for="lp-provide-amount">
			<span class="label-text text-sm font-medium"
				>{$t('wallet.defi.earn.provide_amount_label')}</span
			>
		</label>
		<div class="join w-full">
			<span
				class="btn join-item no-animation bg-base-200 text-base-content/70 pointer-events-none min-h-[48px] border-r-0 text-lg sm:min-h-[52px]"
				>$</span
			>
			<input
				id="lp-provide-amount"
				type="text"
				class="input input-bordered join-item min-h-[48px] flex-1 text-lg sm:min-h-[52px] sm:text-base"
				placeholder="0.00"
				bind:value={amount}
				inputmode="decimal"
				oninput={(e) => {
					const v = e.currentTarget as HTMLInputElement;
					if (v.value.includes(',')) v.value = v.value.replace(/,/g, '.');
				}}
			/>
			<button
				type="button"
				class="btn btn-primary join-item min-h-[48px] touch-manipulation rounded-r-lg active:scale-95 sm:min-h-[52px]"
				onclick={setMaxAmount}
				disabled={!hasBoth || !isOnline}
			>
				<span class="text-xs sm:text-sm">{$t('wallet.max')}</span>
			</button>
		</div>
		{#if amountNum > 0}
			<div class="text-base-content/60 mt-1 text-xs">
				{$t('wallet.defi.earn.provide_split', {
					values: { wbtc: `${wbtcAmt.toFixed(6)} WBTC`, usdt0: `$${usdt0Amt.toFixed(2)} USDT0` }
				})}
			</div>
		{/if}
	</div>

	<div
		class="collapse-arrow border-primary bg-base-100 collapse rounded-lg border-2"
		class:collapse-open={ilExpanded}
	>
		<button
			type="button"
			class="collapse-title flex min-h-[44px] items-center gap-2 px-3 py-2.5 pr-10 pl-3 text-sm font-medium"
			aria-expanded={ilExpanded}
			onclick={() => (ilExpanded = !ilExpanded)}
		>
			{$t('wallet.defi.lp.il_title')}
		</button>
		<div class="collapse-content text-base-content/70 space-y-2 px-2 text-xs">
			<p>{$t('wallet.defi.lp.il_double')}</p>
			<p>{$t('wallet.defi.lp.il_halve')}</p>
		</div>
	</div>

	{#if txState !== 'idle'}
		<div
			class="alert alert-soft {txState === 'error' ? 'alert-error' : 'alert-info'} text-xs"
			role="status"
			aria-live="polite"
		>
			{txMessage || txState}
			{#if txError}<div class="text-error mt-1 text-[10px]">{txError}</div>{/if}
			{#if txState === 'error'}<button type="button" class="btn btn-xs mt-1" onclick={clearTx}
					>{$t('common.cancel')}</button
				>{/if}
		</div>
	{/if}

	<button
		type="button"
		class="btn btn-primary min-h-[48px] w-full text-base"
		disabled={!canProvide || txState !== 'idle'}
		onclick={handleProvide}
		aria-busy={isProcessing || txState.startsWith('approving') || txState === 'providing'}
	>
		{#if txState !== 'idle'}{txMessage}{:else}{isProcessing
				? $t('wallet.defi.shared.pending_tx')
				: $t('wallet.defi.earn.action_provide_lp')}{/if}
	</button>
</div>

<ApproveModal
	isOpen={approveWbtcOpen}
	onClose={() => {
		approveWbtcOpen = false;
		if (!txError && pendingAfterApproves) {
			approveUsdtOpen = true;
			txState = 'approving-usdt0';
			txMessage = $t('wallet.defi.shared.pending_tx');
		} else {
			pendingAfterApproves = false;
		}
	}}
	amount={wbtcAmt.toFixed(6)}
	token={{ symbol: 'WBTC' }}
	spender={NPM_ADDR}
	onApprove={() => handleApprove(UniswapService.WBTC_ARBITRUM, wbtcAmt.toFixed(8), 8, 'WBTC')}
	gasEstimate={0.12}
	isSubmitting={txState === 'approving-wbtc'}
/>
<ApproveModal
	isOpen={approveUsdtOpen}
	onClose={() => {
		approveUsdtOpen = false;
		if (!txError && pendingAfterApproves) {
			pendingAfterApproves = false;
			void doProvide();
		} else {
			pendingAfterApproves = false;
		}
	}}
	amount={usdt0Amt.toFixed(2)}
	token={{ symbol: 'USDT0' }}
	spender={NPM_ADDR}
	onApprove={() => handleApprove(UniswapService.USDT0_ARBITRUM, usdt0Amt.toFixed(6), 6, 'USDT0')}
	gasEstimate={0.09}
	isSubmitting={txState === 'approving-usdt0'}
/>

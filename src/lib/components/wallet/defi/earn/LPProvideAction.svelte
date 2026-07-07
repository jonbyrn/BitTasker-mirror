<script lang="ts">
	import { untrack } from 'svelte';
	import { t } from 'svelte-i18n';
	import { get } from 'svelte/store';
	import { ethers } from 'ethers';
	import * as Sentry from '@sentry/sveltekit';
	import { tryCatch } from '$lib/utils/tryCatch';
	import { walletStore } from '$lib/stores/wallet.store';
	import { getEvmSigner } from '$lib/stores/connected-wallets.store';
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
	import AmountInputSection from '$lib/components/wallet/AmountInputSection.svelte';
	import ApproveModal from '$lib/components/wallet/ApproveModal.svelte';
	import type { UniswapLPPosition } from '$lib/stores/defi-positions.store.svelte';

	const ARB_RPC = 'https://arb1.arbitrum.io/rpc';
	const NPM_ADDR = '0xC36442b4a4522E871399CD717aBDD847Ab11FE88';
	/** 0.5% slippage protection — industry standard default */
	const SLIPPAGE_BPS = 50;

	interface Props {
		walletId: string;
		address: string;
		onSuccess: (txHash?: string) => void;
		existingPosition?: UniswapLPPosition | null;
	}

	let { walletId, address: _address, onSuccess, existingPosition = null }: Props = $props();

	let amount = $state('');
	let sliderPercent = $state(0);
	let isProcessing = $state(false);
	let selectedWalletId = $state<'builtin' | string>(untrack(() => walletId as 'builtin' | string));
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
	let usdt0Bal = $derived(parseFloat($walletStore.arb.formattedUsdt0Balance ?? '0') || 0);
	let wbtcSats = $derived(
		Math.round(
			($walletStore.arb?.formattedWbtcBalance
				? parseFloat($walletStore.arb.formattedWbtcBalance)
				: 0) * 1e8
		)
	);
	let hasBoth = $derived(wbtcUsdValue > 0 && usdt0Bal > 0);
	let isIncrease = $derived(!!existingPosition && existingPosition.liquidity > 0n);
	let currentPrice = $derived(btcPrice.price);

	let wbtcAmt = $derived.by(() => {
		const half = amountNum / 2;
		return currentPrice > 1000 ? half / currentPrice : half / 74000;
	});
	let usdt0Amt = $derived(amountNum / 2);
	let wbtcInsufficient = $derived(
		amountNum > 0 && wbtcAmt > 0 && wbtcSats < Math.round(wbtcAmt * 1e8)
	);
	let usdt0Insufficient = $derived(amountNum > 0 && usdt0Amt > 0 && usdt0Bal < usdt0Amt);
	let canProvide = $derived(
		amountNum > 0 &&
			hasBoth &&
			isOnline &&
			!isProcessing &&
			txState === 'idle' &&
			!wbtcInsufficient &&
			!usdt0Insufficient
	);

	function satsFromBtc(btc: number): number {
		return Math.round(btc * 1e8);
	}

	let maxProvideAmount = $derived.by(() => {
		if (!hasBoth) return 0;
		// Each side uses half the total, so max is 2x the smaller balance
		return Math.min(
			$walletStore.arb.wbtcUsdValue * 2,
			parseFloat($walletStore.arb.formattedUsdt0Balance || '0') * 2
		);
	});
	// Rounded-down threshold for exceeds comparison (prevents false positive when toFixed(2) rounds up)
	let maxProvideDisplay = $derived(Math.floor(maxProvideAmount * 100) / 100);

	function setMaxAmount() {
		if (!isOnline || !hasBoth) return;
		// Use maxProvideDisplay (floor-rounded) so toFixed(2) doesn't round past actual balance
		amount = maxProvideDisplay.toFixed(2);
		sliderPercent = 100;
	}

	function handleAmountChange(v: string) {
		amount = v;
		const n = parseFloat(v || '0');
		sliderPercent =
			isFinite(n) && n > 0 && maxProvideDisplay > 0
				? Math.min(100, (n / maxProvideDisplay) * 100)
				: 0;
	}

	function applyPercent(pct: number) {
		sliderPercent = Math.min(100, pct);
		if (pct <= 0 || maxProvideDisplay <= 0) {
			amount = '';
			return;
		}
		if (pct >= 100) {
			amount = maxProvideDisplay.toFixed(2);
			return;
		}
		const usd = (maxProvideDisplay * pct) / 100;
		amount = usd.toFixed(2);
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
		// 0.5% slippage protection for minimum amounts
		const a0Min = (a0 * BigInt(10000 - SLIPPAGE_BPS)) / 10000n;
		const a1Min = (a1 * BigInt(10000 - SLIPPAGE_BPS)) / 10000n;
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
						a0Min,
						a1Min,
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
						a0Min,
						a1Min,
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
					amount0Min: a0Min,
					amount1Min: a1Min,
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
					} catch (e) {
						Sentry.captureException(e, {
							tags: { feature: 'defi.lp', action: 'provide-log-parse' },
							level: 'warning'
						});
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

<div class="flex flex-col gap-4">
	<!-- Description -->
	<p class="text-base-content/70 text-xs">
		{$t('wallet.defi.lp.provide_desc')}
	</p>

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

	<!-- Asset pair display -->
	<div class="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
		<!-- Bitcoin (wBTC) side -->
		<div class="bg-base-200 flex items-center gap-2.5 rounded-xl p-3">
			<img
				src="/images/tokens/wbtc.png"
				alt="wBTC"
				class="h-8 w-8 shrink-0 rounded-full sm:h-9 sm:w-9"
			/>
			<div class="min-w-0 flex-1">
				<div class="text-sm font-medium">Bitcoin (wBTC)</div>
				<div class="text-base-content/70 text-xs tabular-nums">
					{amountNum > 0 ? satsFromBtc(wbtcAmt).toLocaleString() : '0'}
					{$t('wallet.sats')}
				</div>
				<div class="text-base-content/40 text-[10px]">
					{wbtcSats.toLocaleString()}
					{$t('wallet.sats')}
					{$t('wallet.defi.position.available')}
				</div>
			</div>
		</div>

		<!-- Plus sign -->
		<div class="text-base-content/30 flex items-center justify-center">
			<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M12 6v12m-6-6h12"
				/>
			</svg>
		</div>

		<!-- USD (USDT0) side -->
		<div class="bg-base-200 flex items-center gap-2.5 rounded-xl p-3">
			<img
				src="/images/tokens/usdt.png"
				alt="USDT0"
				class="h-8 w-8 shrink-0 rounded-full sm:h-9 sm:w-9"
			/>
			<div class="min-w-0 flex-1">
				<div class="text-sm font-medium">USD (USDT0)</div>
				<div class="text-base-content/70 text-xs tabular-nums">
					{amountNum > 0 ? `$${usdt0Amt.toFixed(2)}` : '$0.00'}
				</div>
				<div class="text-base-content/40 text-[10px]">
					${usdt0Bal.toFixed(2)}
					{$t('wallet.defi.position.available')}
				</div>
			</div>
		</div>
	</div>

	<!-- Amount input -->
	<div>
		<label class="label" for="lp-provide-amount">
			<span class="label-text text-sm font-medium"
				>{$t('wallet.defi.earn.provide_amount_label')}</span
			>
		</label>
		<AmountInputSection
			variant="direct"
			tokenPrefix="$"
			{amount}
			onAmountChange={handleAmountChange}
			onUnitChange={() => {}}
			unit="usd"
			showPercentSlider={true}
			sliderDisabled={!hasBoth}
			percent={sliderPercent}
			onPercentChange={applyPercent}
			onMaxAmount={async () => setMaxAmount()}
			maxDisabled={!hasBoth || !isOnline}
			disabled={!isOnline}
		/>
	</div>

	<!-- Insufficient balance warnings -->
	{#if wbtcInsufficient}
		<div class="alert alert-soft alert-error py-2 text-xs">
			{$t('wallet.defi.lp.insufficient_wbtc', {
				values: {
					needed: `${satsFromBtc(wbtcAmt).toLocaleString()} Sats`,
					available: `${wbtcSats.toLocaleString()} Sats`
				}
			})}
		</div>
	{/if}
	{#if usdt0Insufficient}
		<div class="alert alert-soft alert-error py-2 text-xs">
			{$t('wallet.defi.lp.insufficient_usdt0', {
				values: { needed: `$${usdt0Amt.toFixed(2)}`, available: `$${usdt0Bal.toFixed(2)}` }
			})}
		</div>
	{/if}

	<!-- Summary card -->
	{#if amountNum > 0}
		<div class="bg-base-200 rounded-lg p-2.5 text-xs">
			<div class="mb-1.5 flex items-center justify-between">
				<span class="font-medium">{$t('wallet.defi.lp.both_sides_label')}</span>
				<span class="text-base-content/50">{$t('wallet.defi.lp.fee_tier_005')}</span>
			</div>
			<div class="flex items-center justify-between">
				<span class="text-base-content/70">{wbtcAmt.toFixed(6)} WBTC</span>
				<span class="text-base-content/30">+</span>
				<span class="text-base-content/70">${usdt0Amt.toFixed(2)} USDT0</span>
			</div>
			<p class="text-base-content/40 mt-1">
				{$t('wallet.defi.slippage_protection', { values: { percent: '0.5' } })}
			</p>
		</div>
	{/if}

	<!-- Error state -->
	{#if txState !== 'idle' && txState !== 'error'}
		<div class="alert alert-soft alert-info text-xs" role="status" aria-live="polite">
			{txMessage || txState}
		</div>
	{/if}
	{#if txState === 'error' && txError}
		<div class="alert alert-soft alert-error py-2 text-xs" role="alert">
			<span>{txError}</span>
			<button type="button" class="btn btn-ghost btn-xs" onclick={clearTx}>✕</button>
		</div>
	{/if}

	<!-- CTA -->
	<button
		type="button"
		class="btn btn-primary min-h-[48px] w-full text-base"
		disabled={!canProvide || txState !== 'idle'}
		onclick={handleProvide}
		aria-busy={isProcessing || txState.startsWith('approving') || txState === 'providing'}
	>
		{#if txState !== 'idle'}
			<span class="loading loading-spinner loading-sm"></span>
			{txMessage}
		{:else if isProcessing}
			<span class="loading loading-spinner loading-sm"></span>
			{$t('wallet.defi.shared.pending_tx')}
		{:else if amountNum > 0}
			{$t('wallet.defi.earn.action_provide_amount', {
				values: { amount: `$${amountNum.toFixed(2)}` }
			})}
		{:else}
			{$t('wallet.defi.earn.action_provide_lp')}
		{/if}
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

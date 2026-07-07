<script lang="ts">
	import { t } from 'svelte-i18n';
	import { onMount } from 'svelte';
	import { get } from 'svelte/store';
	import { ethers } from 'ethers';
	import { tryCatch } from '$lib/utils/tryCatch';
	import { walletStore } from '$lib/stores/wallet.store';
	import { formatSats } from '$lib/utils/wallet/format';
	import { connectedWalletsStore, getEvmSigner } from '$lib/stores/connected-wallets.store';
	import { browserNetworkStatus } from '$lib/utils/network-status';
	import { appStore } from '$lib/stores/app.store';
	import { defiPositions } from '$lib/stores/defi-positions.store.svelte';
	import { FeatureFlagService, FEATURE_FLAGS } from '$lib/services/kill-switch';
	import WalletSelector from '$lib/components/wallet/WalletSelector.svelte';
	import ApproveModal from '$lib/components/wallet/ApproveModal.svelte';
	import type { TokenInfo } from '$lib/types/gasless.types';
	import {
		UniswapService,
		FEE_TIER,
		FULL_RANGE,
		type MintParams
	} from '$lib/services/defi/uniswap.service';
	import * as Sentry from '@sentry/sveltekit';

	// Props reserved for future parent-driven callbacks from EarnFlowDrawer
	let _props = $props();

	// -----------------------------------------------------------------------
	// Reactive state (parity with BorrowStep/EarnLendStep + full LP lifecycle)
	// -----------------------------------------------------------------------
	let amount = $state('');
	let isProcessing = $state(false);
	let isOnline = $derived($browserNetworkStatus.online);
	let ilExpanded = $state(false);
	let sourceExpanded = $state(false);
	let selectedWalletId = $state<'builtin' | string>('builtin');

	// Tx lifecycle states for approvals + provide/remove/collect (full flows)
	let txState = $state<
		| 'idle'
		| 'approving-wbtc'
		| 'approving-usdt0'
		| 'providing'
		| 'removing'
		| 'collecting'
		| 'success'
		| 'error'
	>('idle');
	let txError = $state<string | null>(null);
	let txMessage = $state<string>('');
	let pendingProvideAfterApproves = $state(false);

	// Selection state only (minimal) — list + selected derived 100% from defiPositions store (no local stand-in array)
	let selectedPositionTokenId = $state<bigint | null>(null);

	// Derive LP positions for the *currently selected* wallet from the single source of truth (keyed map).
	// Supports multi-wallet (builtin + connected via WalletSelector) exactly like EarnLendStep does for Aave.
	const positionsForWallet = $derived(defiPositions.getUniswapPositionsForWallet(selectedWalletId));

	// Selected position (for remove/collect actions) derived from the wallet-filtered store list.
	const selectedPosition = $derived(
		positionsForWallet.find((p) => p.tokenId === selectedPositionTokenId) ?? null
	);

	// Live pool data (fetched via UniswapService + public RPC)
	let livePool = $state<Record<string, unknown> | null>(null);
	let isLoadingPool = $state(false);
	let poolError = $state<string | null>(null);

	const ARB_PUBLIC_RPC = 'https://arb1.arbitrum.io/rpc';
	const UNISWAP_NPM_ADDR = '0xC36442b4a4522E871399CD717aBDD847Ab11FE88'; // from uniswap.service

	// ApproveModal open states (used for full approve flow in provide)
	let approveWbtcOpen = $state(false);
	let approveUsdtOpen = $state(false);

	// Use $derived.by + isFinite for robustness (parity with BorrowStep)
	let amountNum = $derived.by(() => {
		const n = parseFloat(amount);
		return isFinite(n) && n > 0 ? n : 0;
	});

	// Balances for pre-check / guards (light treatment for "needs both")
	let wbtcUsdValue = $derived($walletStore.arb.wbtcUsdValue ?? 0);
	let usdt0BalanceStr = $derived($walletStore.arb.usdt0Balance ?? '0');
	let usdt0BalanceNum = $derived(parseFloat(usdt0BalanceStr) || 0);
	let hasWbtcForLp = $derived(wbtcUsdValue > 0);
	let hasUsdt0ForLp = $derived(usdt0BalanceNum > 0);
	let hasBoth = $derived(hasWbtcForLp && hasUsdt0ForLp);

	let canProvideLp = $derived.by(() => {
		return amountNum > 0 && hasBoth && isOnline && !isProcessing && txState === 'idle';
	});

	// Real price from live pool when available (makes amount preview functional when LOAN_FLOW enabled)
	let currentWbtcPrice = $derived.by(() => {
		if (!livePool?.sqrtPriceX96) return null;
		const sqrtPrice = Number(livePool.sqrtPriceX96) / 2 ** 96;
		let price = sqrtPrice * sqrtPrice;
		// Adjust for decimals: WBTC (8) / USDT0 (6)
		price = price * Math.pow(10, 8 - 6);
		return price > 1000 ? price : null;
	});

	// When real mode + pool price available: use actual market price for balanced value split.
	// Otherwise fall back to previous placeholder calculation.
	let wbtcAmount = $derived.by(() => {
		const halfValue = amountNum / 2;
		if (currentWbtcPrice && currentWbtcPrice > 1000) {
			return halfValue / currentWbtcPrice;
		}
		return halfValue / 74000;
	});
	let usdt0Amount = $derived(amountNum / 2);

	// -----------------------------------------------------------------------
	// WalletSelector helpers (parity with BorrowStep + wallet page connected totals)
	// -----------------------------------------------------------------------

	function walletBalanceFor(id: string): string {
		if (id === 'builtin') {
			const wbtc = Math.round(
				($walletStore.arb?.formattedWbtcBalance
					? parseFloat($walletStore.arb.formattedWbtcBalance)
					: 0) * 100_000_000
			);
			const usdt = parseFloat($walletStore.arb?.usdt0Balance || '0');
			return `${formatSats(wbtc)} Sats / $${usdt.toFixed(2)} USDT0`;
		}
		const w = $connectedWalletsStore.wallets.find((c) => c.id === id);
		if (!w) return '$0 / 0 Sats';
		const wbtcRaw = Number(w.balances?.['wbtc-arb']?.raw ?? w.balances?.wbtc?.raw ?? 0);
		const usdtRaw = Number(w.balances?.['usdt0-arb']?.raw ?? 0);
		const wbtcSats = Math.round(wbtcRaw / 10_000_000_000); // rough 8+2 decimals handling
		const usdt = usdtRaw / 1e6;
		return `${formatSats(wbtcSats)} Sats / $${usdt.toFixed(2)} USDT0`;
	}

	const builtinBalanceDisplay = $derived(
		`${formatSats(Math.round(($walletStore.arb?.formattedWbtcBalance ? parseFloat($walletStore.arb.formattedWbtcBalance) : 0) * 100_000_000))} Sats`
	);

	// -----------------------------------------------------------------------
	// Live pool data via UniswapService (read-only, public RPC)
	// -----------------------------------------------------------------------
	async function loadLivePoolPreview() {
		isLoadingPool = true;
		poolError = null;

		const provider = new ethers.JsonRpcProvider(ARB_PUBLIC_RPC);
		const uni = new UniswapService(provider);

		const { data: pool, error } = await tryCatch(uni.getWbtcUsdt0Pool());
		if (error || !pool) {
			poolError = 'wallet.defi.shared.rate_updated'; // reuse existing
			isLoadingPool = false;
			return;
		}
		livePool = pool as unknown as Record<string, unknown>;
		isLoadingPool = false;

		Sentry.addBreadcrumb({
			category: 'defi.uniswap',
			message: 'LP preview pool loaded',
			data: { poolAddress: pool.address, liquidity: pool.liquidity?.toString() }
		});
	}

	onMount(() => {
		void loadLivePoolPreview();
		// No demo seed: real provide populates via defiPositions store + refreshUniswapPosition
	});

	// -----------------------------------------------------------------------
	// Helpers for full flows (real when LOAN_FLOW enabled, preview toasts when off)
	// -----------------------------------------------------------------------
	function setMaxAmount() {
		if (!isOnline || !hasBoth) return;
		const wbtcUsd = $walletStore.arb.wbtcUsdValue;
		const usdt0 = parseFloat($walletStore.arb.usdt0Balance || '0');
		amount = Math.min(wbtcUsd, usdt0).toFixed(2);
	}

	function selectPosition(tokenId: bigint) {
		selectedPositionTokenId = tokenId;
		txState = 'idle';
		txError = null;
	}

	function clearTxState() {
		txState = 'idle';
		txError = null;
		txMessage = '';
		isProcessing = false;
	}

	// Real signer (exact copy/adapt from EarnLendStep + store patterns)
	async function getSignerForSelected(): Promise<ethers.Signer | null> {
		if (selectedWalletId === 'builtin') {
			const s = get(walletStore);
			const rskW = s.rsk?.wallet as ethers.Wallet | undefined;
			if (!rskW) return null;
			const arbProvider = new ethers.JsonRpcProvider(ARB_PUBLIC_RPC);
			return rskW.connect(arbProvider);
		}
		const evm = getEvmSigner(selectedWalletId);
		return (evm as unknown as ethers.Signer) ?? null;
	}

	// Real ERC20 approve for WBTC (NPM spender) — onApprove for first modal
	async function handleApproveWbtc() {
		txState = 'approving-wbtc';
		txError = null;
		const signer = await getSignerForSelected();
		if (!signer) {
			txError = $t('wallet.defi.error.no_signer');
			throw new Error(txError);
		}
		const token = new ethers.Contract(
			UniswapService.WBTC_ARBITRUM,
			['function approve(address spender, uint256 amount) returns (bool)'],
			signer
		);
		const amt = ethers.parseUnits(wbtcAmount.toFixed(8), 8);
		const { error } = await tryCatch(token.approve(UNISWAP_NPM_ADDR, amt));
		if (error) {
			txError = error.message || $t('wallet.defi.error.wbtc_approve_failed');
			Sentry.captureException(error, { tags: { feature: 'defi.lp', action: 'approve-wbtc' } });
			throw error;
		}
		// modal toasts + closes on success; chaining in onClose
	}

	// Real ERC20 approve for USDT0 (NPM spender) — onApprove for second modal
	async function handleApproveUsdt0() {
		txState = 'approving-usdt0';
		txError = null;
		const signer = await getSignerForSelected();
		if (!signer) {
			txError = $t('wallet.defi.error.no_signer');
			throw new Error(txError);
		}
		const token = new ethers.Contract(
			UniswapService.USDT0_ARBITRUM,
			['function approve(address spender, uint256 amount) returns (bool)'],
			signer
		);
		const amt = ethers.parseUnits(usdt0Amount.toFixed(6), 6);
		const { error } = await tryCatch(token.approve(UNISWAP_NPM_ADDR, amt));
		if (error) {
			txError = error.message || $t('wallet.defi.error.usdt0_approve_failed');
			Sentry.captureException(error, { tags: { feature: 'defi.lp', action: 'approve-usdt0' } });
			throw error;
		}
	}

	// Real provide after both approves succeed (build MintParams, call service with gas via service, parse tokenId, refresh store)
	async function doRealProvideLp() {
		isProcessing = true;
		txState = 'providing';
		txError = null;
		txMessage = $t('wallet.defi.shared.pending_tx');

		const signer = await getSignerForSelected();
		if (!signer) {
			txError = $t('wallet.defi.error.signer_unavailable');
			txState = 'error';
			isProcessing = false;
			return;
		}
		const recipient = defiPositions.resolveAddress(selectedWalletId);
		if (!recipient) {
			txError = $t('wallet.defi.error.no_recipient');
			txState = 'error';
			isProcessing = false;
			return;
		}

		const provider = new ethers.JsonRpcProvider(ARB_PUBLIC_RPC);
		const uni = new UniswapService(provider);

		const amount0Desired = ethers.parseUnits(wbtcAmount.toFixed(8), 8);
		const amount1Desired = ethers.parseUnits(usdt0Amount.toFixed(6), 6);

		const mintParams: MintParams = {
			token0: UniswapService.WBTC_ARBITRUM,
			token1: UniswapService.USDT0_ARBITRUM,
			fee: FEE_TIER.LOW,
			tickLower: FULL_RANGE.TICK_LOWER,
			tickUpper: FULL_RANGE.TICK_UPPER,
			amount0Desired,
			amount1Desired,
			amount0Min: 0n,
			amount1Min: 0n,
			recipient,
			deadline: UniswapService.defaultDeadline()
		};

		Sentry.addBreadcrumb({
			category: 'defi.uniswap',
			message: 'real provideLiquidity — addLiquidity',
			data: {
				recipient: recipient.slice(0, 8) + '...',
				wbtc: wbtcAmount.toFixed(8),
				usdt0: usdt0Amount.toFixed(6)
			}
		});

		let tokenId: bigint | null = null;
		try {
			let _txHash = '';
			if (selectedWalletId === 'builtin') {
				const tx = await uni.addLiquidity(mintParams, signer);
				_txHash = tx.hash;
				// Defensive parse tokenId from Transfer log (NPM ERC721 mint/transfer)
				try {
					const receipt = await tx.wait();
					if (receipt?.logs) {
						const npmLower = UNISWAP_NPM_ADDR.toLowerCase();
						for (const log of receipt.logs) {
							if (log.address?.toLowerCase() === npmLower && log.topics && log.topics.length >= 4) {
								// Transfer(from, to, tokenId) — tokenId in topics[3]
								const id = BigInt(log.topics[3]);
								if (id > 0n) {
									tokenId = id;
									break;
								}
							}
						}
					}
				} catch {
					// non-fatal; tokenId stays null
				}
			} else {
				const evmS = getEvmSigner(selectedWalletId);
				if (!evmS) throw new Error($t('wallet.defi.error.evm_signer_unavailable'));
				const res = await uni.addLiquidityWithEvmSigner(mintParams, evmS);
				const resRecord = res as unknown as Record<string, unknown>;
				_txHash =
					(typeof resRecord?.hash === 'string' ? resRecord.hash : undefined) ||
					(typeof resRecord?.txid === 'string' ? resRecord.txid : undefined) ||
					'broadcast';
				// connected path: receipt not immediate; rely on later manual refresh or event
			}

			if (tokenId) {
				// Store is now the single source (with IL etc from refreshUniswapPosition). UI derives list/selected from it.
				await defiPositions.refreshUniswapPosition(selectedWalletId, tokenId);
				selectedPositionTokenId = tokenId;
			}

			appStore.showSuccessToast($t('wallet.defi.lp.button_approve_lp'));
			txState = 'success';
			txMessage = $t('wallet.defi.lp.remove_success'); // reuse success key for provided (or extend if needed)
			amount = '';
		} catch (e: unknown) {
			txError =
				(e instanceof Error ? e.message : null) || $t('wallet.defi.error.provide_lp_failed');
			txState = 'error';
			Sentry.captureException(e, { tags: { feature: 'defi.lp', action: 'provide' } });
		} finally {
			isProcessing = false;
			void loadLivePoolPreview();
		}
	}

	async function handleProvideLp() {
		if (!canProvideLp) return;

		isProcessing = true;
		txError = null;
		Sentry.addBreadcrumb({
			category: 'defi.uniswap',
			message: 'LP provide started',
			data: { amountNum, wallet: selectedWalletId }
		});

		const useReal = FeatureFlagService.isEnabled(FEATURE_FLAGS.LOAN_FLOW);
		if (!useReal) {
			// Preview path only (no sim tx, no fake positions, no setTimeout)
			appStore.showInfoToast($t('wallet.defi.lp.sim_preview') + ' (LOAN_FLOW flag off)');
			isProcessing = false;
			return;
		}

		// Real: kick 1st approve modal (WBTC). Real onApprove + onClose chains to USDT0 then doRealProvideLp
		pendingProvideAfterApproves = true;
		approveWbtcOpen = true;
		txState = 'approving-wbtc';
		txMessage = $t('wallet.defi.shared.pending_tx');
	}

	async function handleRemoveLiquidity() {
		if (!selectedPosition || txState !== 'idle' || !isOnline) return;

		const useReal = FeatureFlagService.isEnabled(FEATURE_FLAGS.LOAN_FLOW);
		isProcessing = true;
		txState = 'removing';
		txError = null;
		txMessage = $t('wallet.defi.shared.pending_tx');

		Sentry.addBreadcrumb({
			category: 'defi.uniswap',
			message: useReal ? 'LP remove started (real)' : 'LP remove started (preview)',
			data: { tokenId: selectedPosition.tokenId.toString(), wallet: selectedWalletId }
		});

		if (!useReal) {
			// Preview path (flag off) — consistent with handleProvideLp (no setTimeout, no local mutate, info toast)
			appStore.showInfoToast($t('wallet.defi.lp.sim_preview') + ' (LOAN_FLOW flag off)');
			isProcessing = false;
			txState = 'idle';
			return;
		}

		// REAL path (LOAN_FLOW enabled) — production defensive
		const signer = await getSignerForSelected();
		if (!signer) {
			txError = $t('wallet.defi.error.no_signer');
			txState = 'error';
			isProcessing = false;
			Sentry.captureException(new Error('Signer unavailable for LP remove'), {
				tags: { feature: 'defi.lp', action: 'remove', walletId: selectedWalletId }
			});
			return;
		}

		const provider = new ethers.JsonRpcProvider(ARB_PUBLIC_RPC);
		const uni = new UniswapService(provider);
		const tokenId = selectedPosition.tokenId;
		const liquidity = selectedPosition.liquidity;
		const deadline = UniswapService.defaultDeadline();

		Sentry.addBreadcrumb({
			category: 'defi.uniswap',
			message: 'real removeLiquidity',
			data: { tokenId: tokenId.toString() }
		});

		const { error } = await tryCatch(
			uni.removeLiquidity(tokenId, liquidity, 0n, 0n, deadline, signer)
		);
		if (error) {
			txError = error.message || $t('wallet.defi.error.remove_liquidity_failed');
			txState = 'error';
			Sentry.captureException(error, { tags: { feature: 'defi.lp', action: 'removeLiquidity' } });
			isProcessing = false;
			return;
		}

		// Success: refresh store (IL calc etc), clear selection (derived list for wallet will no longer surface the removed pos or show 0-liq if still cached)
		await defiPositions.refreshUniswapPosition(selectedWalletId, tokenId);
		selectedPositionTokenId = null;

		appStore.showSuccessToast($t('wallet.defi.lp.remove_success'));
		txState = 'success';
		txMessage = $t('wallet.defi.lp.remove_success');
		isProcessing = false;

		setTimeout(() => {
			if (txState === 'success') clearTxState();
		}, 2200);
	}

	async function handleCollectFees() {
		if (!selectedPosition || txState !== 'idle' || !isOnline) return;
		if (selectedPosition.fees0 === 0n && selectedPosition.fees1 === 0n) {
			appStore.showInfoToast($t('wallet.defi.lp.no_fees_to_collect'));
			return;
		}

		const useReal = FeatureFlagService.isEnabled(FEATURE_FLAGS.LOAN_FLOW);
		isProcessing = true;
		txState = 'collecting';
		txError = null;
		txMessage = $t('wallet.defi.shared.pending_tx');

		Sentry.addBreadcrumb({
			category: 'defi.uniswap',
			message: useReal ? 'LP collect started (real)' : 'LP collect started (preview)',
			data: { tokenId: selectedPosition.tokenId.toString(), wallet: selectedWalletId }
		});

		if (!useReal) {
			// Preview path (flag off) — consistent with handleProvideLp (no setTimeout, no local mutate)
			appStore.showInfoToast($t('wallet.defi.lp.sim_preview') + ' (LOAN_FLOW flag off)');
			isProcessing = false;
			txState = 'idle';
			return;
		}

		// REAL path
		const signer = await getSignerForSelected();
		if (!signer) {
			txError = $t('wallet.defi.error.no_signer');
			txState = 'error';
			isProcessing = false;
			Sentry.captureException(new Error('Signer unavailable for LP collect'), {
				tags: { feature: 'defi.lp', action: 'collect', walletId: selectedWalletId }
			});
			return;
		}

		const recipient = defiPositions.resolveAddress(selectedWalletId);
		if (!recipient) {
			txError = $t('wallet.defi.error.no_recipient');
			txState = 'error';
			isProcessing = false;
			return;
		}

		const provider = new ethers.JsonRpcProvider(ARB_PUBLIC_RPC);
		const uni = new UniswapService(provider);
		const tokenId = selectedPosition.tokenId;

		Sentry.addBreadcrumb({
			category: 'defi.uniswap',
			message: 'real collectFees',
			data: { tokenId: tokenId.toString(), recipient: recipient.slice(0, 8) + '...' }
		});

		const { error } = await tryCatch(uni.collectFees(tokenId, recipient, signer));
		if (error) {
			txError = error.message || $t('wallet.defi.error.collect_fees_failed');
			txState = 'error';
			Sentry.captureException(error, { tags: { feature: 'defi.lp', action: 'collectFees' } });
			isProcessing = false;
			return;
		}

		// Success: refresh store (now source of truth with updated 0 fees + IL), keep selection (list derives from store)
		await defiPositions.refreshUniswapPosition(selectedWalletId, tokenId);
		selectedPositionTokenId = tokenId;

		appStore.showSuccessToast($t('wallet.defi.lp.collect_success'));
		txState = 'success';
		txMessage = $t('wallet.defi.lp.collect_success');
		isProcessing = false;

		setTimeout(() => {
			if (txState === 'success') clearTxState();
		}, 2200);
	}

	function handleRetry() {
		clearTxState();
	}
</script>

<div class="space-y-4">
	<!-- Preview gate label (only when LOAN_FLOW off; real flows when flag on per LendStep/provide pattern) -->
	{#if !FeatureFlagService.isEnabled(FEATURE_FLAGS.LOAN_FLOW)}
		<div class="alert alert-soft alert-info mb-2 text-xs" role="note">
			<span class="font-medium">{$t('wallet.common.preview')}</span> — {$t(
				'wallet.defi.lp.sim_preview'
			)}
		</div>
	{/if}

	<!-- Offline guard banner (5-state prod readiness, parity with Borrow + CLAUDE network awareness) -->
	{#if !isOnline}
		<div class="alert alert-soft alert-warning mb-4" role="alert">
			<p class="text-xs">{$t('wallet.defi.shared.offline')}</p>
		</div>
	{/if}

	<!-- Basic empty/pre-check state (light treatment for "needs both" using existing i18n; keep form visible) -->
	{#if !hasBoth}
		<div class="alert alert-outline alert-warning rounded-box mb-4" role="alert">
			<p class="text-sm">{$t('wallet.defi.needs_both')}</p>
		</div>
	{/if}

	<!-- Wallet Source (WalletSelector integration — full pattern from BorrowStep) -->
	<WalletSelector
		label={$t('wallet.from') + ':'}
		selectedId={selectedWalletId}
		onSelect={(id) => {
			selectedWalletId = id as 'builtin' | string;
			selectedPositionTokenId = null; // switch wallet → clear selection (list auto-derives from store for new walletId)
			txError = null;
		}}
		builtinBalance={builtinBalanceDisplay}
		connectedWallets={$connectedWalletsStore.wallets}
		{walletBalanceFor}
		expanded={sourceExpanded}
		onToggle={() => (sourceExpanded = !sourceExpanded)}
	/>

	<!-- Live pool preview (uses UniswapService via public RPC — demonstrates integration) -->
	<div class="bg-base-200 rounded-box p-3 text-sm">
		<div class="flex items-center justify-between">
			<span class="text-base-content/60">{$t('wallet.defi.lp.fee_tier_label')} / Pool</span>
			{#if isLoadingPool}
				<div class="skeleton h-4 w-20"></div>
			{:else if livePool}
				<span class="font-medium tabular-nums"
					>0.05% • Liq: {(Number(livePool.liquidity || 0) / 1e18).toFixed(0)}</span
				>
			{:else}
				<span class="text-base-content/50">{$t('wallet.common.preview_fallback')}</span>
			{/if}
		</div>
		{#if poolError && !isLoadingPool}
			<p class="text-warning mt-1 text-xs">{$t(poolError)}</p>
		{/if}
	</div>

	<!-- Fee tier + APY -->
	<div class="bg-base-200 rounded-box flex justify-between p-3 text-sm">
		<span>{$t('wallet.defi.lp.fee_tier_label')}</span>
		<span class="font-medium">{$t('wallet.defi.lp.fee_tier_005')}</span>
	</div>

	<div class="bg-base-200 rounded-box flex justify-between p-3 text-sm">
		<span>{$t('wallet.defi.lp.apy_label')}</span>
		{#if currentWbtcPrice}
			<span class="text-success font-bold">{$t('wallet.common.variable_fee_based')}</span>
		{:else}
			<span class="text-success font-bold">{$t('wallet.common.estimated')}</span>
		{/if}
	</div>

	<!-- Amount Input (synced EXACTLY to BorrowStep:188-217 parity for visual + iOS/Safari robustness; kept min/step from prior + bind/MAX logic) -->
	<div>
		<label class="label" for="earn-lp-amount">
			<span class="label-text text-sm font-medium">{$t('wallet.defi.lp.amount_label')}</span>
		</label>
		<div class="join w-full">
			<span
				class="btn join-item no-animation bg-base-200 text-base-content/70 pointer-events-none min-h-[48px] border-r-0 text-lg sm:min-h-[52px]"
			>
				$
			</span>
			<input
				id="earn-lp-amount"
				type="text"
				class="input input-bordered join-item min-h-[48px] flex-1 text-lg sm:min-h-[52px] sm:text-base"
				placeholder="0.00"
				bind:value={amount}
				min="0"
				step="0.01"
				inputmode="decimal"
				oninput={(e) => {
					const target = e.currentTarget as HTMLInputElement;
					// Normalize comma to dot for locale robustness (iOS/Safari number quirks)
					if (target.value.includes(',')) {
						target.value = target.value.replace(/,/g, '.');
					}
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
				{$t('wallet.defi.lp.both_sides_label')}: {wbtcAmount.toFixed(6)} WBTC + ${usdt0Amount.toFixed(
					2
				)} USDT0
			</div>
		{/if}
	</div>

	<!-- IL Risk (collapsed) -->
	<div
		class="collapse-arrow border-primary bg-base-100 collapse rounded-lg border-2"
		class:collapse-open={ilExpanded}
	>
		<button
			type="button"
			id="il-title"
			class="collapse-title flex min-h-[44px] items-center gap-2 px-3 py-2.5 pr-10 pl-3 text-sm font-medium"
			aria-expanded={ilExpanded}
			aria-controls="il-content"
			onclick={() => (ilExpanded = !ilExpanded)}
		>
			{$t('wallet.defi.lp.il_title')}
		</button>
		<div
			id="il-content"
			role="region"
			aria-labelledby="il-title"
			class="collapse-content text-base-content/70 space-y-2 px-2 text-xs"
		>
			<p>{$t('wallet.defi.lp.il_double')}</p>
			<p>{$t('wallet.defi.lp.il_halve')}</p>
		</div>
	</div>

	<!-- Tx status / error (full flow visibility) -->
	{#if txState !== 'idle'}
		<div
			class="alert alert-soft {txState === 'error' ? 'alert-error' : 'alert-info'} text-xs"
			role="status"
			aria-live="polite"
		>
			{txMessage || txState}
			{#if txError}
				<div class="text-error mt-1 text-[10px]">{txError}</div>
			{/if}
			{#if txState === 'error'}
				<button type="button" class="btn btn-xs mt-1" onclick={handleRetry}
					>{$t('wallet.defi.shared.retry')}</button
				>
			{/if}
		</div>
	{/if}

	<!-- CTA Provide (with full approve+provide states + disabled guards) -->
	<button
		type="button"
		class="btn btn-primary min-h-[48px] w-full text-base"
		disabled={!canProvideLp || txState !== 'idle'}
		onclick={handleProvideLp}
		aria-busy={isProcessing || txState.startsWith('approving') || txState === 'providing'}
	>
		{#if txState === 'approving-wbtc' || txState === 'approving-usdt0' || txState === 'providing'}
			{txMessage}
		{:else}
			{isProcessing ? $t('wallet.defi.shared.pending_tx') : $t('wallet.defi.lp.button_approve_lp')}
		{/if}
	</button>

	<!-- Full lifecycle: Manage Positions (remove + collect fees) — 100% derived from defi-positions.store.uniswapPositions (per selectedWalletId via helper; real IL/refresh after tx) -->
	{#if positionsForWallet.length > 0}
		<div class="border-base-300 mt-2 border-t pt-3">
			<div class="mb-2 flex items-center justify-between">
				<span class="text-sm font-medium">{$t('wallet.defi.lp.positions_title')}</span>
				<button
					type="button"
					class="btn btn-ghost btn-xs"
					onclick={() => (selectedPositionTokenId = null)}
					disabled={!selectedPositionTokenId}
				>
					{$t('wallet.defi.lp.clear_select')}
				</button>
			</div>

			<div class="space-y-2">
				{#each positionsForWallet as pos (pos.tokenId)}
					<button
						type="button"
						class="rounded-box w-full border p-3 text-left text-sm transition-colors {selectedPositionTokenId ===
						pos.tokenId
							? 'border-primary bg-primary/5'
							: 'border-base-300 hover:bg-base-200'}"
						onclick={() => selectPosition(pos.tokenId)}
					>
						<div class="flex justify-between">
							<span class="font-mono text-xs">#{pos.tokenId.toString()}</span>
							<span class="text-success text-xs">0.05% WBTC/USDT0</span>
						</div>
						<div class="text-base-content/70 mt-1 text-xs">
							{$t('wallet.defi.lp.liq_label')}: {(Number(pos.liquidity) / 1e12).toFixed(2)} • {$t(
								'wallet.defi.lp.owed_label'
							)}: ${(Number(pos.fees0) / 1e6).toFixed(2)} + ${(Number(pos.fees1) / 1e6).toFixed(2)}
						</div>
					</button>
				{/each}
			</div>

			{#if selectedPosition}
				<div class="mt-3 flex gap-2">
					<button
						type="button"
						class="btn btn-outline btn-sm flex-1"
						disabled={txState !== 'idle' || isProcessing || !isOnline}
						onclick={handleRemoveLiquidity}
					>
						{$t('wallet.defi.lp.button_remove_liquidity')}
					</button>
					<button
						type="button"
						class="btn btn-outline btn-sm flex-1"
						disabled={txState !== 'idle' ||
							isProcessing ||
							!isOnline ||
							(selectedPosition.fees0 === 0n && selectedPosition.fees1 === 0n)}
						onclick={handleCollectFees}
					>
						{$t('wallet.defi.lp.button_collect_fees')}
					</button>
				</div>
			{/if}
		</div>
	{:else}
		<div class="text-base-content/60 text-xs">{$t('wallet.defi.lp.no_lp_yet')}</div>
	{/if}
</div>

<!-- ApproveModal integration (real ERC20 approves to NPM; onClose chains WBTC -> USDT0 -> doRealProvideLp when LOAN_FLOW) -->
<ApproveModal
	isOpen={approveWbtcOpen}
	onClose={() => {
		approveWbtcOpen = false;
		if (!txError && pendingProvideAfterApproves) {
			// chain to USDT0 approve
			approveUsdtOpen = true;
			txState = 'approving-usdt0';
			txMessage = $t('wallet.defi.shared.pending_tx');
		} else {
			pendingProvideAfterApproves = false;
		}
	}}
	amount={wbtcAmount.toFixed(6)}
	token={{
		symbol: 'WBTC',
		address: UniswapService.WBTC_ARBITRUM,
		decimals: 8
	} as unknown as TokenInfo}
	spender={UNISWAP_NPM_ADDR}
	onApprove={handleApproveWbtc}
	gasEstimate={0.12}
	isSubmitting={txState === 'approving-wbtc'}
/>
<ApproveModal
	isOpen={approveUsdtOpen}
	onClose={() => {
		approveUsdtOpen = false;
		if (!txError && pendingProvideAfterApproves) {
			pendingProvideAfterApproves = false;
			void doRealProvideLp();
		} else {
			pendingProvideAfterApproves = false;
		}
	}}
	amount={usdt0Amount.toFixed(2)}
	token={{
		symbol: 'USDT0',
		address: UniswapService.USDT0_ARBITRUM,
		decimals: 6
	} as unknown as TokenInfo}
	spender={UNISWAP_NPM_ADDR}
	onApprove={handleApproveUsdt0}
	gasEstimate={0.09}
	isSubmitting={txState === 'approving-usdt0'}
/>

<script lang="ts">
	import { t } from 'svelte-i18n';
	import { onMount } from 'svelte';
	import { get } from 'svelte/store';
	import { ethers } from 'ethers';
	import { tryCatch } from '$lib/utils/tryCatch';
	import { walletStore } from '$lib/stores/wallet.store';
	import { connectedWalletsStore } from '$lib/stores/connected-wallets.store';
	import { browserNetworkStatus } from '$lib/utils/network-status';
	import { appStore } from '$lib/stores/app.store';
	import type { TokenInfo } from '$lib/types/gasless.types';
	import { AaveService, USDT0_ARBITRUM } from '$lib/services/defi/aave.service';
	import WalletSelector from '$lib/components/wallet/WalletSelector.svelte';
	import ApproveModal from '$lib/components/wallet/ApproveModal.svelte';
	import { defiPositions, type AaveLendingPosition } from '$lib/stores/defi-positions.store.svelte';
	import { FeatureFlagService, FEATURE_FLAGS } from '$lib/services/kill-switch';
	import { getEvmSigner } from '$lib/stores/connected-wallets.store';
	import * as Sentry from '@sentry/sveltekit';

	interface Props {
		// Reserved for future parent-driven isProcessing / callbacks from EarnFlowDrawer / wallet page
		onApproveSupply?: (amount: number) => void;
	}

	let { onApproveSupply }: Props = $props();

	let amount = $state('');
	let isProcessing = $state(false);
	let isOnline = $derived($browserNetworkStatus.online);
	let sourceExpanded = $state(false);

	// Live Aave supply APY (onMount + getSupplyAPY + tryCatch, fallback 4.22; LP remains 100% sim)
	let isLoadingRates = $state(true);
	let ratesError = $state<string | null>(null);
	let supplyAPY = $state(4.22);

	// Use $derived.by + isFinite for robustness (parity with BorrowStep)
	let amountNum = $derived.by(() => {
		const n = parseFloat(amount);
		return isFinite(n) && n > 0 ? n : 0;
	});

	let usdt0BalanceStr = $derived($walletStore.arb.usdt0Balance ?? '0');
	let usdt0BalanceNum = $derived(parseFloat(usdt0BalanceStr) || 0);
	let hasUsdt0 = $derived(usdt0BalanceNum > 0); // legacy for builtin display

	let _canSupply = $derived.by(() => {
		return (
			amountNum > 0 && hasSelectedUsdt0 && isOnline && !isProcessing && !isApproving && !isSupplying
		);
	});

	let canWithdraw = $derived.by(() => {
		return !!currentPosition && isOnline && !isProcessing && !isWithdrawing;
	});

	// Full lifecycle selected wallet support + tx states + position (using new store + single ApproveModal)
	let selectedId = $state<'builtin' | string>('builtin');
	let isApproving = $state(false);
	let isSupplying = $state(false);
	let isWithdrawing = $state(false);
	let txError = $state<string | null>(null);
	let approveAmount = $state<string | number>(0);
	let showApproveModal = $state(false);
	let pendingSupplyAfterApprove = $state(false);
	let currentPosition = $state<AaveLendingPosition | null>(null);

	// Selected USDT0 (for connected support in selector + real flows)
	let selectedUsdt0BalanceStr = $derived.by(() => {
		if (selectedId === 'builtin') return $walletStore.arb.usdt0Balance ?? '0';
		const w = $connectedWalletsStore.wallets.find((ww) => ww.id === selectedId);
		const u = w?.balances?.['usdt0-arb'] || w?.balances?.['usdt-arb'] || w?.balances?.['usdt0'];
		return String((u as Record<string, unknown>)?.formatted ?? '0');
	});
	let selectedUsdt0BalanceNum = $derived(parseFloat(selectedUsdt0BalanceStr) || 0);
	// Override has for selected (connected may have)
	let hasSelectedUsdt0 = $derived(selectedUsdt0BalanceNum > 0);

	const ARB_PUBLIC_RPC = 'https://arb1.arbitrum.io/rpc';
	const AAVE_POOL_ADDR = '0x794a61358D6845594F94dc1DB02A252b5b4814aD';
	const USDT0_DECIMALS = 6;

	async function loadLiveSupplyAPY() {
		isLoadingRates = true;
		ratesError = null;

		const provider = new ethers.JsonRpcProvider(ARB_PUBLIC_RPC);
		const aave = new AaveService(provider);

		const { data: apy, error: apyErr } = await tryCatch(aave.getSupplyAPY(USDT0_ARBITRUM));

		if (apyErr || apy === undefined) {
			ratesError = 'wallet.defi.borrow.rates_error';
			// keep conservative default (4.22)
		} else {
			supplyAPY = apy;
		}

		isLoadingRates = false;
	}

	onMount(() => {
		void loadLiveSupplyAPY();
		if (FeatureFlagService.isEnabled(FEATURE_FLAGS.LOAN_FLOW)) {
			void refreshPositionForSelected();
		}
	});

	// Projected uses live supplyAPY (from Aave getSupplyAPY); comment updated post-Cycle2
	let projectedEarnings = $derived(amountNum + amountNum * (supplyAPY / 100));

	function setMaxAmount() {
		Sentry.addBreadcrumb({
			category: 'defi.earn',
			message: 'setMax in lend step',
			data: { balance: usdt0BalanceNum, online: isOnline }
		});
		if (!isOnline || !hasUsdt0) return;
		// Use USDT0 balance from wallet store (keep original logic, guarded)
		amount = usdt0BalanceNum.toString();
	}

	function handleSupply() {
		Sentry.addBreadcrumb({
			category: 'defi.earn',
			message: 'handleSupply clicked in lend step',
			data: {
				amountNum,
				supplyAPY,
				online: isOnline,
				selectedId,
				flag: FeatureFlagService.isEnabled(FEATURE_FLAGS.LOAN_FLOW)
			}
		});
		if (amountNum <= 0 || !isOnline || isProcessing || !hasSelectedUsdt0) return;

		const useReal = FeatureFlagService.isEnabled(FEATURE_FLAGS.LOAN_FLOW);
		if (!useReal) {
			// Preview signaling until flag allows real tx (per spec)
			isProcessing = true;
			onApproveSupply?.(amountNum);
			setTimeout(() => {
				appStore.showInfoToast($t('wallet.defi.shared.pending_tx'));
				isProcessing = false;
			}, 200);
			return;
		}

		// Real flow: use single ApproveModal for ERC20 approve step
		approveAmount = amountNum;
		pendingSupplyAfterApprove = true;
		showApproveModal = true;
		txError = null;
	}

	async function refreshPositionForSelected() {
		if (!FeatureFlagService.isEnabled(FEATURE_FLAGS.LOAN_FLOW)) return;
		try {
			await defiPositions.refreshAavePosition(selectedId);
			currentPosition = defiPositions.aavePositions.get(selectedId) ?? null;
		} catch (e) {
			Sentry.captureException(e);
		}
	}

	async function getSignerForSelected(): Promise<ethers.Signer | null> {
		if (selectedId === 'builtin') {
			const s = get(walletStore);
			const rskW = s.rsk?.wallet as ethers.Wallet | undefined;
			if (!rskW) return null;
			const arbProvider = new ethers.JsonRpcProvider(ARB_PUBLIC_RPC);
			return rskW.connect(arbProvider);
		}
		const evm = getEvmSigner(selectedId);
		return (evm as unknown as ethers.Signer) ?? null;
	}

	// onApprove for the single ApproveModal — does ERC20 approve only; parent chains supply after close
	async function handleApproveForModal() {
		isApproving = true;
		txError = null;
		const signer = await getSignerForSelected();
		if (!signer) {
			txError = $t('wallet.defi.lp_error_no_signer');
			isApproving = false;
			return;
		}
		const token = new ethers.Contract(
			USDT0_ARBITRUM,
			['function approve(address spender, uint256 amount) returns (bool)'],
			signer
		);
		const amt = ethers.parseUnits(String(approveAmount), USDT0_DECIMALS);
		const { error } = await tryCatch(token.approve(AAVE_POOL_ADDR, amt));
		isApproving = false;
		if (error) {
			txError = error.message || $t('wallet.defi.error.approve_failed');
			Sentry.captureException(error, { tags: { feature: 'defi.lend', action: 'approve' } });
			throw error; // modal will catch + toast
		}
		// success -> modal toasts + closes; we chain supply via pending flag
	}

	async function doRealSupply() {
		isSupplying = true;
		txError = null;
		const signer = await getSignerForSelected();
		if (!signer) {
			txError = $t('wallet.defi.lp_error_signer_unavailable');
			isSupplying = false;
			return;
		}
		const aave = new AaveService(new ethers.JsonRpcProvider(ARB_PUBLIC_RPC));
		const amt = ethers.parseUnits(String(amountNum), USDT0_DECIMALS);
		const { error, data: tx } = await tryCatch(aave.supply(USDT0_ARBITRUM, amt, signer));
		if (error || !tx) {
			txError = error?.message || $t('wallet.defi.error.supply_failed');
			Sentry.captureException(error, { tags: { feature: 'defi.lend', action: 'supply' } });
			isSupplying = false;
			return;
		}
		appStore.showSuccessToast($t('wallet.defi.lending.supply_submitted'));
		await Promise.allSettled([refreshPositionForSelected() /* loadAssets if exposed */]);
		isSupplying = false;
		amount = '';
	}

	async function handleWithdraw() {
		if (!canWithdraw || !currentPosition) return;
		const useReal = FeatureFlagService.isEnabled(FEATURE_FLAGS.LOAN_FLOW);
		if (!useReal) {
			appStore.showInfoToast($t('wallet.defi.shared.pending_tx'));
			return;
		}
		isWithdrawing = true;
		txError = null;
		const signer = await getSignerForSelected();
		if (!signer) {
			txError = $t('wallet.defi.lp_error_signer_unavailable');
			isWithdrawing = false;
			return;
		}
		const aave = new AaveService(new ethers.JsonRpcProvider(ARB_PUBLIC_RPC));
		// withdraw all for simplicity in v1 (or use input; here max from position)
		const raw = currentPosition.suppliedUsdt0Raw ?? 0n;
		const { error } = await tryCatch(aave.withdraw(USDT0_ARBITRUM, raw, signer));
		if (error) {
			txError = error.message || $t('wallet.defi.error.withdraw_failed');
			Sentry.captureException(error, { tags: { feature: 'defi.lend', action: 'withdraw' } });
			isWithdrawing = false;
			return;
		}
		appStore.showSuccessToast($t('wallet.defi.lending.withdraw_submitted'));
		await refreshPositionForSelected();
		isWithdrawing = false;
	}

	// Wire pending supply after approve modal success/close
	function handleApproveModalClose() {
		showApproveModal = false;
		if (pendingSupplyAfterApprove && !txError) {
			pendingSupplyAfterApprove = false;
			void doRealSupply();
		} else {
			pendingSupplyAfterApprove = false;
		}
	}
</script>

<div class="space-y-4">
	<!-- Offline guard banner (5-state prod readiness, parity with Borrow + CLAUDE network awareness) -->
	{#if !isOnline}
		<div class="alert alert-soft alert-warning mb-4" role="alert">
			<p class="text-xs">{$t('wallet.defi.shared.offline')}</p>
		</div>
	{/if}

	<!-- Basic empty/pre-check state using existing i18n (no new keys; keep form visible for limited functionality) -->
	{#if !hasSelectedUsdt0}
		<div class="alert alert-outline alert-warning rounded-box mb-4" role="alert">
			<p class="text-sm">{$t('wallet.defi.needs_usdt0')}</p>
		</div>
	{/if}

	<!-- Position from defi-positions.store (refreshed post-tx; supports withdraw full lifecycle) -->
	{#if currentPosition && parseFloat(currentPosition.suppliedUsdt0 || '0') > 0}
		<div class="bg-base-200 rounded-box border-success/30 border p-3 text-sm">
			<div class="flex items-center justify-between">
				<span class="font-medium">{$t('wallet.defi.lending.your_supply')}</span>
				<span class="text-success font-bold"
					>${parseFloat(currentPosition.suppliedUsdt0).toFixed(2)}</span
				>
			</div>
			<div class="text-base-content/60 text-xs">
				{$t('wallet.defi.lending.health_factor')}: {currentPosition.healthFactor?.toFixed(2) ?? '—'}
				• {$t('wallet.defi.lending.collateral')}: ${currentPosition.totalCollateralUsd?.toFixed(
					0
				) ?? 0}
			</div>
			<button
				type="button"
				class="btn btn-outline btn-sm mt-2 w-full"
				disabled={!canWithdraw || isWithdrawing}
				onclick={handleWithdraw}
				aria-busy={isWithdrawing}
			>
				{isWithdrawing
					? $t('wallet.defi.shared.pending_tx')
					: $t('wallet.defi.lending.withdraw_all')}
			</button>
		</div>
	{/if}

	<!-- Connected wallet source (full wired for builtin + connected via WalletSelector; parity BorrowStep + defi-positions) -->
	<WalletSelector
		label={$t('wallet.from') + ':'}
		{selectedId}
		onSelect={(id: string) => {
			selectedId = id as 'builtin' | string;
			txError = null;
			void refreshPositionForSelected();
		}}
		builtinBalance={`${(selectedId === 'builtin' ? usdt0BalanceNum : selectedUsdt0BalanceNum).toFixed(2)} USDT0`}
		connectedWallets={$connectedWalletsStore.wallets}
		walletBalanceFor={(id: string) => {
			const w = $connectedWalletsStore.wallets.find((c) => c.id === id);
			if (!w) return '$0';
			const u = w.balances['usdt0-arb'] || w.balances['usdt-arb'] || w.balances['usdt0'];
			if (!u) return '0 USDT0';
			const val =
				parseFloat(
					((u as Record<string, unknown>).formatted as string) ??
						((u as Record<string, unknown>).raw as string) ??
						'0'
				) || 0;
			return `${val.toFixed(2)} USDT0`;
		}}
		expanded={sourceExpanded}
		onToggle={() => (sourceExpanded = !sourceExpanded)}
	/>

	<!-- Preview UI for approve lifecycle (polish for connected + preview; reuses existing projected/apy; no new i18n keys) -->
	{#if amountNum > 0}
		<div class="bg-base-300 rounded-box border-primary/20 border p-3 text-sm">
			<div class="text-base-content/80 mb-1 font-medium">
				{$t('wallet.defi.lending.preview_approve_supply')}
			</div>
			<div>
				${amountNum.toFixed(2)} USDT0 {$t('wallet.defi.lending.to_aave')} • ~{supplyAPY.toFixed(2)}%
				APY
			</div>
			<div class="text-success">
				{$t('wallet.defi.lending.projected_after_1y')} ${projectedEarnings.toFixed(2)}
			</div>
		</div>
	{/if}

	<!-- APY banner (live from Aave; skeleton while loading; fallback 4.22 on error) -->
	<div class="bg-base-200 rounded-box space-y-1 p-3 text-sm">
		<div class="flex justify-between">
			<span class="text-base-content/60">{$t('wallet.defi.lend.apy_label')}</span>
			{#if isLoadingRates}
				<div class="skeleton h-4 w-12"></div>
			{:else}
				<span class="text-success font-bold">{supplyAPY.toFixed(2)}%</span>
			{/if}
		</div>
		{#if ratesError && !isLoadingRates}
			<div class="alert alert-soft alert-warning py-1 text-xs">
				{$t(ratesError)}
			</div>
		{/if}
		<p class="text-base-content/60 text-xs">{$t('wallet.defi.lend.risk_info')}</p>
	</div>

	<!-- Amount Input (synced EXACTLY to BorrowStep:188-217 parity for visual + iOS/Safari robustness; kept min/step from prior + bind/MAX logic) -->
	<div>
		<label class="label" for="earn-lend-amount">
			<span class="label-text text-sm font-medium">{$t('wallet.defi.lend.amount_label')}</span>
		</label>
		<div class="join w-full">
			<span
				class="btn join-item no-animation bg-base-200 text-base-content/70 pointer-events-none min-h-[48px] border-r-0 text-lg sm:min-h-[52px]"
			>
				$
			</span>
			<input
				id="earn-lend-amount"
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
				disabled={!hasSelectedUsdt0 || !isOnline}
			>
				<span class="text-xs sm:text-sm">{$t('wallet.max')}</span>
			</button>
		</div>
	</div>

	<!-- Projected Earnings -->
	{#if amountNum > 0}
		<div class="bg-base-200 rounded-box p-3 text-sm">
			<span>{$t('wallet.defi.lend.projected_label')}: </span>
			<span class="font-medium">${projectedEarnings.toFixed(2)}</span>
		</div>
	{/if}

	<!-- Error state (proper tx error handling per spec) -->
	{#if txError}
		<div class="alert alert-soft alert-error py-1 text-xs" role="alert">{txError}</div>
	{/if}

	<!-- CTA (full states: preview vs real, approve modal, withdraw support, aria, disabled guards) -->
	<button
		type="button"
		class="btn btn-primary min-h-[48px] w-full text-base"
		disabled={amountNum <= 0 ||
			!isOnline ||
			isProcessing ||
			!hasSelectedUsdt0 ||
			isApproving ||
			isSupplying}
		onclick={handleSupply}
		aria-busy={isProcessing || isApproving || isSupplying}
	>
		{isProcessing || isApproving || isSupplying
			? $t('wallet.defi.shared.pending_tx')
			: $t('wallet.defi.lend.button_approve_supply')}
	</button>

	<!-- Single ApproveModal (reused for ERC20 approve before supply; chains to real supply on close) -->
	<ApproveModal
		isOpen={showApproveModal}
		onClose={handleApproveModalClose}
		amount={approveAmount}
		token={{
			symbol: 'USDT0',
			address: USDT0_ARBITRUM,
			decimals: USDT0_DECIMALS
		} as unknown as TokenInfo}
		spender={AAVE_POOL_ADDR}
		onApprove={handleApproveForModal}
		isSubmitting={isApproving}
	/>
</div>

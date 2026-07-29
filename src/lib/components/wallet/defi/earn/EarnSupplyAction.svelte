<script lang="ts">
	import { untrack } from 'svelte';
	import { t } from 'svelte-i18n';
	import { get } from 'svelte/store';
	import { ethers } from 'ethers';
	import { tryCatch } from '$lib/utils/tryCatch';
	import { walletStore } from '$lib/stores/wallet.store';
	import { connectedWalletsStore, getEvmSigner } from '$lib/stores/connected-wallets.store';
	import { defiPositions } from '$lib/stores/defi-positions.store.svelte';
	import { AaveService, USDT0_ARBITRUM } from '$lib/services/defi/aave.service';
	import { browserNetworkStatus } from '$lib/utils/network-status';
	import { extractContractError } from '$lib/utils/wallet/contractErrorHandler';
	import { appStore } from '$lib/stores/app.store';
	import { supplyApy } from '$lib/runes/supplyApy.svelte';
	import AmountInputSection from '$lib/components/wallet/AmountInputSection.svelte';
	import ApproveModal from '$lib/components/wallet/ApproveModal.svelte';
	import * as Sentry from '@sentry/sveltekit';

	const ARB_PUBLIC_RPC = 'https://arb1.arbitrum.io/rpc';
	const AAVE_POOL_ADDR = '0x794a61358D6845594F94dc1DB02A252b5b4814aD';
	const USDT0_DECIMALS = 6;

	interface Props {
		walletId: string;
		address: string;
		onSuccess: (txHash?: string) => void;
	}

	let { walletId, address: _address, onSuccess }: Props = $props();

	let amount = $state('');
	let sliderPercent = $state(0);
	let isProcessing = $state(false);
	let isApproving = $state(false);
	let isSupplying = $state(false);
	let txError = $state<string | null>(null);
	let approveAmount = $state<string | number>(0);
	let showApproveModal = $state(false);
	let pendingSupplyAfterApprove = $state(false);
	let selectedId = $state<'builtin' | string>(untrack(() => walletId as 'builtin' | string));

	let isOnline = $derived($browserNetworkStatus.online);

	// Selected wallet USDT0 balance
	let selectedUsdt0BalanceStr = $derived.by(() => {
		if (selectedId === 'builtin') return $walletStore.arb?.formattedUsdt0Balance ?? '0';
		const w = $connectedWalletsStore.wallets.find((ww) => ww.id === selectedId);
		const u = w?.balances?.['usdt0-arb'] || w?.balances?.['usdt-arb'] || w?.balances?.['usdt0'];
		return u?.formatted ?? '0';
	});
	let selectedUsdt0BalanceNum = $derived(parseFloat(selectedUsdt0BalanceStr) || 0);
	let hasSelectedUsdt0 = $derived(selectedUsdt0BalanceNum > 0);

	let amountNum = $derived.by(() => {
		const n = parseFloat(amount);
		return isFinite(n) && n > 0 ? n : 0;
	});

	let projectedEarnings = $derived(
		supplyApy.apy !== null ? amountNum + amountNum * (supplyApy.apy / 100) : amountNum
	);

	let exceedsBalance = $derived(amountNum > selectedUsdt0BalanceNum && amountNum > 0);

	let canSupply = $derived(
		amountNum > 0 &&
			hasSelectedUsdt0 &&
			isOnline &&
			!isProcessing &&
			!isApproving &&
			!isSupplying &&
			!exceedsBalance
	);

	function setMaxAmount() {
		Sentry.addBreadcrumb({
			category: 'defi.earn.supply',
			message: 'setMax',
			data: { balance: selectedUsdt0BalanceNum, online: isOnline }
		});
		if (!isOnline || !hasSelectedUsdt0) return;
		amount = selectedUsdt0BalanceNum.toString();
		sliderPercent = 100;
	}

	function handleAmountChange(v: string) {
		amount = v;
		const n = parseFloat(v || '0');
		sliderPercent =
			isFinite(n) && n > 0 && selectedUsdt0BalanceNum > 0
				? Math.min(100, (n / selectedUsdt0BalanceNum) * 100)
				: 0;
	}

	function applyPercent(pct: number) {
		sliderPercent = Math.min(100, pct);
		if (pct <= 0 || selectedUsdt0BalanceNum <= 0) {
			amount = '';
			return;
		}
		const usd = (selectedUsdt0BalanceNum * Math.min(100, pct)) / 100;
		amount = usd.toFixed(2);
	}

	function handleSupply() {
		Sentry.addBreadcrumb({
			category: 'defi.earn.supply',
			message: 'handleSupply clicked',
			data: { amountNum, apy: supplyApy.apy, online: isOnline, selectedId }
		});
		if (!canSupply) return;

		approveAmount = amountNum;
		pendingSupplyAfterApprove = true;
		showApproveModal = true;
		txError = null;
	}

	async function handleApproveForModal() {
		isApproving = true;
		txError = null;
		const amt = ethers.parseUnits(String(approveAmount), USDT0_DECIMALS);
		const approveIface = new ethers.Interface([
			'function approve(address spender, uint256 amount) returns (bool)'
		]);
		const approveData = approveIface.encodeFunctionData('approve', [AAVE_POOL_ADDR, amt]);

		if (selectedId === 'builtin') {
			const s = get(walletStore);
			const rskW = s.rsk?.wallet as ethers.Wallet | undefined;
			if (!rskW) {
				txError = $t('wallet.defi.approve.error');
				isApproving = false;
				return;
			}
			const signer = rskW.connect(new ethers.JsonRpcProvider(ARB_PUBLIC_RPC));
			const token = new ethers.Contract(USDT0_ARBITRUM, approveIface, signer);
			const { error } = await tryCatch(token.approve(AAVE_POOL_ADDR, amt));
			isApproving = false;
			if (error) {
				txError = error.message || $t('wallet.defi.approve.error');
				Sentry.captureException(error, { tags: { feature: 'defi.lend', action: 'approve' } });
			}
		} else {
			const evm = getEvmSigner(selectedId);
			if (!evm) {
				txError = $t('wallet.defi.approve.error');
				isApproving = false;
				return;
			}
			const { error } = await tryCatch(
				evm.sendTransaction({ to: USDT0_ARBITRUM, data: approveData, value: 0n, chainId: 42161 })
			);
			isApproving = false;
			if (error) {
				txError = error.message || $t('wallet.defi.approve.error');
				Sentry.captureException(error, { tags: { feature: 'defi.lend', action: 'approve' } });
			}
		}
	}

	async function doRealSupply() {
		isSupplying = true;
		txError = null;
		const aave = new AaveService(new ethers.JsonRpcProvider(ARB_PUBLIC_RPC));
		const amt = ethers.parseUnits(String(amountNum), USDT0_DECIMALS);

		if (selectedId === 'builtin') {
			const s = get(walletStore);
			const rskW = s.rsk?.wallet as ethers.Wallet | undefined;
			if (!rskW) {
				txError = $t('wallet.defi.approve.error');
				isSupplying = false;
				return;
			}
			const signer = rskW.connect(new ethers.JsonRpcProvider(ARB_PUBLIC_RPC));
			const { error, data: tx } = await tryCatch(aave.supply(USDT0_ARBITRUM, amt, signer));
			if (error || !tx) {
				const contractErr = extractContractError(error);
				txError = contractErr.userMessage;
				Sentry.captureException(error, { tags: { feature: 'defi.lend', action: 'supply' } });
				isSupplying = false;
				return;
			}
		} else {
			const evm = getEvmSigner(selectedId);
			if (!evm) {
				txError = $t('wallet.defi.approve.error');
				isSupplying = false;
				return;
			}
			const { error, data: tx } = await tryCatch(
				aave.supplyWithEvmSigner(USDT0_ARBITRUM, amt, evm)
			);
			if (error || !tx) {
				const contractErr = extractContractError(error);
				txError = contractErr.userMessage;
				Sentry.captureException(error, { tags: { feature: 'defi.lend', action: 'supply' } });
				isSupplying = false;
				return;
			}
		}

		appStore.showSuccessToast($t('wallet.defi.shared.pending_tx'));
		await Promise.allSettled([defiPositions.refreshAavePosition(selectedId)]);
		isSupplying = false;
		amount = '';
		sliderPercent = 0;
		onSuccess();
	}

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

<div class="flex flex-col gap-3">
	<!-- Offline guard -->
	{#if !isOnline}
		<div class="alert alert-soft alert-warning py-2 text-xs" role="alert">
			{$t('wallet.defi.shared.offline')}
		</div>
	{/if}

	<!-- No USDT0 warning -->
	{#if !hasSelectedUsdt0}
		<div class="alert alert-outline alert-warning rounded-box py-2 text-xs" role="alert">
			{$t('wallet.defi.needs_usdt0')}
		</div>
	{/if}

	<!-- Amount input -->
	<div>
		<label class="label" for="earn-supply-amount">
			<span class="label-text text-sm font-medium">{$t('wallet.defi.lend.amount_label')}</span>
		</label>
		<AmountInputSection
			variant="direct"
			tokenPrefix="$"
			{amount}
			onAmountChange={handleAmountChange}
			onUnitChange={() => {}}
			unit="usd"
			showPercentSlider={true}
			sliderDisabled={!hasSelectedUsdt0}
			percent={sliderPercent}
			onPercentChange={applyPercent}
			onMaxAmount={async () => setMaxAmount()}
			maxDisabled={!hasSelectedUsdt0 || !isOnline}
			disabled={!isOnline}
		/>
	</div>

	<!-- Preview -->
	<div class="bg-base-200 rounded-lg p-2.5 text-sm">
		<div class="text-success">
			{$t('wallet.defi.lend.projected_label')}: ${projectedEarnings.toFixed(2)}
		</div>
	</div>

	<!-- Error state -->
	{#if txError}
		<div class="alert alert-soft alert-error py-1 text-xs" role="alert">
			<span>{txError}</span>
			<button type="button" class="btn btn-ghost btn-xs" onclick={() => (txError = null)}>✕</button>
		</div>
	{/if}

	<!-- Exceeds balance warning -->
	{#if exceedsBalance}
		<div class="alert alert-soft alert-error py-2 text-xs">
			{$t('wallet.defi.shared.error_insufficient_funds')}
		</div>
	{/if}

	<!-- CTA button -->
	<button
		type="button"
		class="btn btn-primary min-h-[48px] w-full text-base"
		disabled={!canSupply}
		onclick={handleSupply}
		aria-busy={isProcessing || isApproving || isSupplying}
	>
		{#if isApproving || isSupplying}
			<span class="loading loading-spinner loading-sm"></span>
			{$t('wallet.defi.shared.pending_tx')}
		{:else if amountNum > 0}
			{$t('wallet.defi.earn.action_lend_amount', {
				values: { amount: `$${amountNum.toFixed(2)}` }
			})}
		{:else}
			{$t('wallet.defi.earn.action_lend')}
		{/if}
	</button>

	<!-- Approve modal -->
	<ApproveModal
		isOpen={showApproveModal}
		onClose={handleApproveModalClose}
		amount={approveAmount}
		token={{ symbol: 'USDT0' }}
		spender={AAVE_POOL_ADDR}
		onApprove={handleApproveForModal}
		isSubmitting={isApproving}
	/>
</div>

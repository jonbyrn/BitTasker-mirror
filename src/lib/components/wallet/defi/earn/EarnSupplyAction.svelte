<script lang="ts">
	import { t } from 'svelte-i18n';
	import { get } from 'svelte/store';
	import { onMount } from 'svelte';
	import { ethers } from 'ethers';
	import { tryCatch } from '$lib/utils/tryCatch';
	import { walletStore } from '$lib/stores/wallet.store';
	import { connectedWalletsStore, getEvmSigner } from '$lib/stores/connected-wallets.store';
	import { defiPositions } from '$lib/stores/defi-positions.store.svelte';
	import { AaveService, USDT0_ARBITRUM } from '$lib/services/defi/aave.service';
	import { browserNetworkStatus } from '$lib/utils/network-status';
	import { extractContractError } from '$lib/utils/wallet/contractErrorHandler';
	import { appStore } from '$lib/stores/app.store';
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
	let isProcessing = $state(false);
	let isApproving = $state(false);
	let isSupplying = $state(false);
	let txError = $state<string | null>(null);
	let approveAmount = $state<string | number>(0);
	let showApproveModal = $state(false);
	let pendingSupplyAfterApprove = $state(false);
	let selectedId = $state<'builtin' | string>(walletId);
	let supplyAPY = $state(4.22);
	let _isLoadingRates = $state(true);

	let isOnline = $derived($browserNetworkStatus.online);

	// Selected wallet USDT0 balance
	let selectedUsdt0BalanceStr = $derived.by(() => {
		if (selectedId === 'builtin') return $walletStore.arb?.usdt0Balance ?? '0';
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

	let projectedEarnings = $derived(amountNum + amountNum * (supplyAPY / 100));

	let canSupply = $derived(
		amountNum > 0 && hasSelectedUsdt0 && isOnline && !isProcessing && !isApproving && !isSupplying
	);

	// Fetch live APY from Aave on mount
	async function loadLiveAPY() {
		_isLoadingRates = true;
		const provider = new ethers.JsonRpcProvider(ARB_PUBLIC_RPC);
		const aave = new AaveService(provider);
		const { data: apy, error } = await tryCatch(aave.getSupplyAPY(USDT0_ARBITRUM));
		if (!error && apy !== undefined && isFinite(apy)) {
			supplyAPY = apy;
		}
		_isLoadingRates = false;
	}

	onMount(() => {
		void loadLiveAPY();
	});

	function setMaxAmount() {
		Sentry.addBreadcrumb({
			category: 'defi.earn.supply',
			message: 'setMax',
			data: { balance: selectedUsdt0BalanceNum, online: isOnline }
		});
		if (!isOnline || !hasSelectedUsdt0) return;
		amount = selectedUsdt0BalanceNum.toString();
	}

	function handleSupply() {
		Sentry.addBreadcrumb({
			category: 'defi.earn.supply',
			message: 'handleSupply clicked',
			data: { amountNum, supplyAPY, online: isOnline, selectedId }
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
		<div class="join w-full">
			<span
				class="btn join-item no-animation bg-base-200 text-base-content/70 pointer-events-none min-h-[48px] border-r-0 text-lg sm:min-h-[52px]"
			>
				$
			</span>
			<input
				id="earn-supply-amount"
				type="text"
				class="input input-bordered join-item min-h-[48px] flex-1 text-lg sm:min-h-[52px] sm:text-base"
				placeholder="0.00"
				bind:value={amount}
				inputmode="decimal"
				oninput={(e) => {
					const target = e.currentTarget;
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

	<!-- Preview -->
	{#if amountNum > 0}
		<div class="bg-base-300 rounded-box border-primary/20 border p-3 text-sm">
			<div class="text-base-content/80 mb-1 font-medium">
				{$t('wallet.defi.earn.action_approve_supply')}
			</div>
			<div>
				${amountNum.toFixed(2)} USDT0 • ~{supplyAPY.toFixed(2)}% {$t('wallet.defi.lend.apy_label')}
			</div>
			<div class="text-success">
				{$t('wallet.defi.lend.projected_label')}: ${projectedEarnings.toFixed(2)}
			</div>
		</div>
	{/if}

	<!-- Error state -->
	{#if txError}
		<div class="alert alert-soft alert-error py-1 text-xs" role="alert">
			<span>{txError}</span>
			<button type="button" class="btn btn-ghost btn-xs" onclick={() => (txError = null)}>✕</button>
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
		{:else}
			{$t('wallet.defi.earn.action_approve_supply')}
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

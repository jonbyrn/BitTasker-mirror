<script lang="ts">
	import { t } from 'svelte-i18n';
	import { ethers } from 'ethers';
	import { tryCatch } from '$lib/utils/tryCatch';
	import { defiPositions } from '$lib/stores/defi-positions.store.svelte';
	import { btcPrice } from '$lib/runes/btcPrice.svelte';
	import { AaveService, WBTC_ARBITRUM, USDT0_ARBITRUM } from '$lib/services/defi/aave.service';
	import {
		calculateProjectedHealthFactor,
		calculateBtcLiquidationPrice,
		calculateLtv,
		deriveHealthStatus
	} from '$lib/services/defi/aave.service';
	import HealthFactorGauge from '../HealthFactorGauge.svelte';

	interface Props {
		walletId: string;
		address: string;
		supplyAmount: string;
		borrowAmount: string;
		isSubmitting: boolean;
		onConfirm: () => void;
		onSupplyComplete: (txHash: string) => void;
		onBorrowComplete: (txHash: string) => void;
	}

	let {
		walletId,
		address,
		supplyAmount,
		borrowAmount,
		isSubmitting: _isSubmitting,
		onConfirm,
		onSupplyComplete,
		onBorrowComplete
	}: Props = $props();

	let riskAcknowledged = $state(false);
	let isProcessing = $state(false);
	let txStatus = $state<'idle' | 'supplying' | 'borrowing' | 'done'>('idle');
	let errorMsg = $state<string | undefined>(undefined);

	let position = $derived(
		walletId === 'builtin' ? defiPositions.aavePositions.get('builtin') : null
	);

	let currentCollateralUsd = $derived(position?.totalCollateralUsd ?? 0);
	let currentDebtUsd = $derived(position?.totalDebtUsd ?? 0);
	let liqThreshold = $derived(position?.liquidationThreshold ?? 7800);

	let supplyNum = $derived.by(() => {
		const n = parseFloat(supplyAmount);
		return isFinite(n) && n > 0 ? n : 0;
	});
	let borrowNum = $derived.by(() => {
		const n = parseFloat(borrowAmount);
		return isFinite(n) && n > 0 ? n : 0;
	});

	let supplyUsd = $derived(supplyNum * btcPrice.price);
	let postSupplyCollateral = $derived(currentCollateralUsd + supplyUsd);
	let projectedHf = $derived(
		calculateProjectedHealthFactor(postSupplyCollateral, currentDebtUsd, liqThreshold, 0, borrowNum)
	);
	let projectedDebt = $derived(currentDebtUsd + borrowNum);
	let projectedLtv = $derived(calculateLtv(projectedDebt, postSupplyCollateral));

	let liqPriceResult = $derived.by(() => {
		if (postSupplyCollateral <= 0 || projectedDebt <= 0) return null;
		const collateralBtc = btcPrice.price > 0 ? postSupplyCollateral / btcPrice.price : 0;
		return calculateBtcLiquidationPrice(projectedDebt, collateralBtc, liqThreshold, btcPrice.price);
	});

	let healthStatus = $derived(deriveHealthStatus(projectedHf));

	const ARB_PUBLIC_RPC = 'https://arb1.arbitrum.io/rpc';

	async function handleConfirm() {
		if (!riskAcknowledged || isProcessing) return;
		isProcessing = true;
		onConfirm();
		errorMsg = undefined;

		const provider = new ethers.JsonRpcProvider(ARB_PUBLIC_RPC);
		const aave = new AaveService(provider);
		const signer = new ethers.Wallet('0x' + '00'.repeat(32), provider);

		if (supplyNum > 0) {
			txStatus = 'supplying';
			const rawSupply = BigInt(Math.floor(supplyNum * 100_000_000));
			const { data: supplyTx, error: supplyErr } = await tryCatch(
				aave.supply(WBTC_ARBITRUM, rawSupply, signer)
			);
			if (supplyErr || !supplyTx) {
				errorMsg = 'Supply transaction failed';
				isProcessing = false;
				txStatus = 'idle';
				return;
			}
			const { data: supplyReceipt, error: receiptErr } = await tryCatch(supplyTx.wait());
			if (receiptErr || !supplyReceipt) {
				errorMsg = 'Supply transaction confirmation failed';
				isProcessing = false;
				txStatus = 'idle';
				return;
			}
			onSupplyComplete(supplyReceipt.hash);
		}

		if (borrowNum > 0) {
			txStatus = 'borrowing';
			const rawBorrow = BigInt(Math.floor(borrowNum * 1_000_000));
			const { data: borrowTx, error: borrowErr } = await tryCatch(
				aave.borrow(USDT0_ARBITRUM, rawBorrow, signer)
			);
			if (borrowErr || !borrowTx) {
				errorMsg = 'Borrow transaction failed. Your collateral was supplied successfully.';
				isProcessing = false;
				txStatus = 'idle';
				return;
			}
			const { data: borrowReceipt, error: receiptErr } = await tryCatch(borrowTx.wait());
			if (receiptErr || !borrowReceipt) {
				errorMsg = 'Borrow confirmation failed';
				isProcessing = false;
				txStatus = 'idle';
				return;
			}
			onBorrowComplete(borrowReceipt.hash);
		}

		txStatus = 'done';
		isProcessing = false;
		defiPositions.invalidate(walletId);
	}
</script>

<div class="flex flex-col gap-4">
	<h3 class="text-base font-semibold">{$t('wallet.defi.wizard.review_confirm')}</h3>

	<div class="bg-base-200 rounded-box space-y-2 p-3 text-sm">
		<div class="flex items-center justify-between">
			<span class="text-base-content/60">{$t('wallet.from')}</span>
			<span class="font-medium"
				>{walletId === 'builtin' ? 'Builtin' : walletId}
				{address?.slice(0, 6)}...{address?.slice(-4)}</span
			>
		</div>
		{#if supplyNum > 0}
			<div class="flex items-center justify-between">
				<span class="text-base-content/60">Supply</span>
				<span class="font-medium tabular-nums"
					>{supplyNum.toFixed(4)} wBTC (~${supplyUsd.toLocaleString()})</span
				>
			</div>
		{/if}
		{#if borrowNum > 0}
			<div class="flex items-center justify-between">
				<span class="text-base-content/60">Borrow</span>
				<span class="font-medium tabular-nums">${borrowNum.toLocaleString()} USDT0</span>
			</div>
		{/if}
	</div>

	<div class="bg-base-200 rounded-box space-y-1.5 p-3 text-sm">
		<p class="text-base-content/60 text-xs font-medium">Resulting Position</p>
		<div class="flex items-center justify-between">
			<span class="text-base-content/60">Total Collateral</span>
			<span class="font-medium tabular-nums">${postSupplyCollateral.toLocaleString()}</span>
		</div>
		<div class="flex items-center justify-between">
			<span class="text-base-content/60">Total Debt</span>
			<span class="font-medium tabular-nums">${projectedDebt.toLocaleString()}</span>
		</div>
		<div class="flex items-center justify-between">
			<span class="text-base-content/60">Health Factor</span>
			<span class="font-medium tabular-nums">{projectedHf.toFixed(2)}x</span>
		</div>
		<div class="flex items-center justify-between">
			<span class="text-base-content/60">LTV</span>
			<span class="font-medium tabular-nums">{(projectedLtv / 100).toFixed(1)}%</span>
		</div>
		{#if liqPriceResult}
			<div class="flex items-center justify-between">
				<span class="text-base-content/60">BTC Liq Price</span>
				<span class="font-medium tabular-nums"
					>${liqPriceResult.liquidationBtcPrice.toLocaleString()}</span
				>
			</div>
		{/if}
		<HealthFactorGauge healthFactor={projectedHf} status={healthStatus} />
	</div>

	<div class="bg-base-200 rounded-box space-y-1 p-3 text-sm">
		<div class="flex items-center justify-between">
			<span class="text-base-content/60">Gas (est.)</span>
			<span class="tabular-nums">~$0.35 (Arbitrum)</span>
		</div>
		<div class="flex items-center justify-between">
			<span class="text-base-content/60">{$t('wallet.defi.wizard.network')}</span>
			<span>Arbitrum One</span>
		</div>
	</div>

	<div class="alert alert-soft alert-info py-2 text-xs">
		🔐 {$t('wallet.defi.wizard.signer_context', {
			values: {
				wallet: walletId === 'builtin' ? 'Builtin' : walletId,
				address: address?.slice(0, 10) + '...'
			}
		})} — {$t('wallet.defi.wizard.private_keys_note')}
	</div>

	{#if errorMsg}
		<div class="alert alert-soft alert-error py-2 text-xs">{errorMsg}</div>
	{/if}

	{#if isProcessing}
		<div class="bg-base-200 rounded-box space-y-2 p-3 text-sm">
			<p class="font-medium">{$t('wallet.defi.wizard.processing')}</p>
			{#if txStatus === 'supplying'}
				<div class="flex items-center gap-2">
					<span class="loading loading-spinner loading-xs"></span>
					<span>Supplying collateral...</span>
				</div>
			{:else if txStatus === 'borrowing'}
				<div class="flex items-center gap-2">
					<span class="loading loading-spinner loading-xs"></span>
					<span>Borrowing USDT0...</span>
				</div>
			{/if}
			<p class="text-base-content/50 text-xs">{$t('wallet.defi.wizard.no_close_window')}</p>
		</div>
	{:else}
		<label class="flex items-start gap-2 text-sm">
			<input type="checkbox" class="checkbox checkbox-sm mt-0.5" bind:checked={riskAcknowledged} />
			<span class="text-base-content/70 text-xs leading-relaxed">
				{$t('wallet.defi.wizard.risk_ack_1')}.
				{#if liqPriceResult}
					{$t('wallet.defi.wizard.risk_ack_2')} (BTC Liq: ${liqPriceResult.liquidationBtcPrice.toLocaleString()}).
				{/if}
			</span>
		</label>

		<button
			type="button"
			class="btn btn-primary min-h-[48px] w-full text-base"
			disabled={!riskAcknowledged || isProcessing}
			onclick={handleConfirm}
			aria-busy={isProcessing}
		>
			{$t('wallet.defi.wizard.confirm_sign')}
		</button>
	{/if}
</div>

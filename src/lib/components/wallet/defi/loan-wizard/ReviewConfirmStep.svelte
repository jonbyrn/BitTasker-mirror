<script lang="ts">
	import { t } from 'svelte-i18n';
	import { get } from 'svelte/store';
	import { ethers } from 'ethers';
	import { tryCatch } from '$lib/utils/tryCatch';
	import { walletStore } from '$lib/stores/wallet.store';
	import { getEvmSigner } from '$lib/stores/connected-wallets.store';
	import { defiPositions } from '$lib/stores/defi-positions.store.svelte';
	import { btcPrice } from '$lib/runes/btcPrice.svelte';
	import { AaveService, WBTC_ARBITRUM, USDT0_ARBITRUM } from '$lib/services/defi/aave.service';
	import {
		calculateProjectedHealthFactor,
		calculateBtcLiquidationPrice,
		calculateLtv,
		deriveHealthStatus
	} from '$lib/services/defi/aave.service';
	import { extractContractError } from '$lib/utils/wallet/contractErrorHandler';
	import type { EVMTransactionResult } from '$lib/services/external-wallet/types';
	import * as Sentry from '@sentry/sveltekit';
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
	let supplySucceeded = $state(false);

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

		// Oracle failure detection — guard against zero/stale BTC price before transacting
		if (!btcPrice.price || btcPrice.price === 0) {
			errorMsg = $t('wallet.defi.oracle_unavailable');
			isProcessing = false;
			return;
		}

		Sentry.addBreadcrumb({
			category: 'defi.wizard.confirm',
			message: 'sending supply+borrow',
			data: { supplyNum, borrowNum, walletId }
		});

		const aave = new AaveService(new ethers.JsonRpcProvider(ARB_PUBLIC_RPC));

		// Resolve the signer — builtin uses RSK wallet connected to Arbitrum, connected uses EvmSigner
		let builtinSigner: ethers.Wallet | null = null;
		let evmSigner: ReturnType<typeof getEvmSigner> = undefined;

		if (walletId === 'builtin') {
			const s = get(walletStore);
			const rskW = s.rsk?.wallet as ethers.Wallet | undefined;
			if (!rskW) {
				errorMsg = $t('wallet.defi.approve.error');
				Sentry.addBreadcrumb({
					category: 'defi.wizard.confirm',
					message: 'signer unavailable',
					data: { walletId }
				});
				isProcessing = false;
				txStatus = 'idle';
				return;
			}
			builtinSigner = rskW.connect(new ethers.JsonRpcProvider(ARB_PUBLIC_RPC));
		} else {
			evmSigner = getEvmSigner(walletId);
			if (!evmSigner) {
				errorMsg = $t('wallet.defi.approve.error');
				Sentry.addBreadcrumb({
					category: 'defi.wizard.confirm',
					message: 'signer unavailable',
					data: { walletId }
				});
				isProcessing = false;
				txStatus = 'idle';
				return;
			}
		}

		if (supplyNum > 0) {
			txStatus = 'supplying';
			const rawSupply = BigInt(Math.floor(supplyNum * 100_000_000));

			let supplyTx: ethers.TransactionResponse | EVMTransactionResult | null = null;
			if (walletId === 'builtin' && builtinSigner) {
				const { data: tx, error: supplyErr } = await tryCatch(
					aave.supply(WBTC_ARBITRUM, rawSupply, builtinSigner)
				);
				if (supplyErr || !tx) {
					const contractErr = extractContractError(supplyErr);
					errorMsg = contractErr.userMessage;
					Sentry.captureException(supplyErr, {
						tags: { feature: 'defi.wizard', action: 'supply' }
					});
					isProcessing = false;
					txStatus = 'idle';
					return;
				}
				supplyTx = tx;
			} else if (evmSigner) {
				const { data: tx, error: supplyErr } = await tryCatch(
					aave.supplyWithEvmSigner(WBTC_ARBITRUM, rawSupply, evmSigner)
				);
				if (supplyErr || !tx) {
					const contractErr = extractContractError(supplyErr);
					errorMsg = contractErr.userMessage;
					Sentry.captureException(supplyErr, {
						tags: { feature: 'defi.wizard', action: 'supply' }
					});
					isProcessing = false;
					txStatus = 'idle';
					return;
				}
				supplyTx = tx;
			}

			if (supplyTx) {
				// builtin path: TransactionResponse has .wait(); connected path: EVMTransactionResult has txHash directly
				if ('wait' in supplyTx && typeof supplyTx.wait === 'function') {
					const { data: supplyReceipt, error: receiptErr } = await tryCatch(supplyTx.wait());
					if (receiptErr || !supplyReceipt) {
						errorMsg = $t('wallet.defi.supply_confirmation_failed');
						isProcessing = false;
						txStatus = 'idle';
						return;
					}
					supplySucceeded = true;
					onSupplyComplete(supplyReceipt.hash);
				} else {
					// EVMTransactionResult — tx already submitted by connected wallet
					supplySucceeded = true;
					onSupplyComplete((supplyTx as EVMTransactionResult).txHash);
				}
			}
		}

		if (borrowNum > 0) {
			txStatus = 'borrowing';
			const rawBorrow = BigInt(Math.floor(borrowNum * 1_000_000));

			let borrowTx: ethers.TransactionResponse | EVMTransactionResult | null = null;
			if (walletId === 'builtin' && builtinSigner) {
				const { data: tx, error: borrowErr } = await tryCatch(
					aave.borrow(USDT0_ARBITRUM, rawBorrow, builtinSigner)
				);
				if (borrowErr || !tx) {
					const contractErr = extractContractError(borrowErr);
					errorMsg = supplySucceeded
						? $t('wallet.defi.borrow_failed_after_collateral')
						: contractErr.userMessage;
					Sentry.captureException(borrowErr, {
						tags: { feature: 'defi.wizard', action: 'borrow' }
					});
					isProcessing = false;
					txStatus = 'idle';
					return;
				}
				borrowTx = tx;
			} else if (evmSigner) {
				const { data: tx, error: borrowErr } = await tryCatch(
					aave.borrowWithEvmSigner(USDT0_ARBITRUM, rawBorrow, evmSigner)
				);
				if (borrowErr || !tx) {
					const contractErr = extractContractError(borrowErr);
					errorMsg = supplySucceeded
						? $t('wallet.defi.borrow_failed_after_collateral')
						: contractErr.userMessage;
					Sentry.captureException(borrowErr, {
						tags: { feature: 'defi.wizard', action: 'borrow' }
					});
					isProcessing = false;
					txStatus = 'idle';
					return;
				}
				borrowTx = tx;
			}

			if (borrowTx) {
				if ('wait' in borrowTx && typeof borrowTx.wait === 'function') {
					const { data: borrowReceipt, error: receiptErr } = await tryCatch(borrowTx.wait());
					if (receiptErr || !borrowReceipt) {
						errorMsg = $t('wallet.defi.wizard.borrow_confirmation_failed');
						isProcessing = false;
						txStatus = 'idle';
						return;
					}
					onBorrowComplete(borrowReceipt.hash);
				} else {
					onBorrowComplete((borrowTx as EVMTransactionResult).txHash);
				}
			}
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
				<span class="text-base-content/60">{$t('wallet.defi.wizard.review_supply')}</span>
				<span class="font-medium tabular-nums"
					>{supplyNum.toFixed(4)} wBTC (~${supplyUsd.toLocaleString()})</span
				>
			</div>
		{/if}
		{#if borrowNum > 0}
			<div class="flex items-center justify-between">
				<span class="text-base-content/60">{$t('wallet.defi.wizard.review_borrow')}</span>
				<span class="font-medium tabular-nums">${borrowNum.toLocaleString()} USDT0</span>
			</div>
		{/if}
	</div>

	<div class="bg-base-200 rounded-box space-y-1.5 p-3 text-sm">
		<p class="text-base-content/60 text-xs font-medium">
			{$t('wallet.defi.wizard.review_resulting_position')}
		</p>
		<div class="flex items-center justify-between">
			<span class="text-base-content/60">{$t('wallet.defi.wizard.review_total_collateral')}</span>
			<span class="font-medium tabular-nums">${postSupplyCollateral.toLocaleString()}</span>
		</div>
		<div class="flex items-center justify-between">
			<span class="text-base-content/60">{$t('wallet.defi.wizard.review_total_debt')}</span>
			<span class="font-medium tabular-nums">${projectedDebt.toLocaleString()}</span>
		</div>
		<div class="flex items-center justify-between">
			<span class="text-base-content/60">{$t('wallet.defi.wizard.review_health_factor')}</span>
			<span class="font-medium tabular-nums">{projectedHf.toFixed(2)}x</span>
		</div>
		<div class="flex items-center justify-between">
			<span class="text-base-content/60">{$t('wallet.defi.wizard.review_ltv')}</span>
			<span class="font-medium tabular-nums">{(projectedLtv / 100).toFixed(1)}%</span>
		</div>
		{#if liqPriceResult}
			<div class="flex items-center justify-between">
				<span class="text-base-content/60">{$t('wallet.defi.wizard.review_btc_liq_price')}</span>
				<span class="font-medium tabular-nums"
					>${liqPriceResult.liquidationBtcPrice.toLocaleString()}</span
				>
			</div>
		{/if}
		<HealthFactorGauge healthFactor={projectedHf} status={healthStatus} />
	</div>

	<div class="bg-base-200 rounded-box space-y-1 p-3 text-sm">
		<div class="flex items-center justify-between">
			<span class="text-base-content/60">{$t('wallet.defi.wizard.review_gas_est')}</span>
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
					<span>{$t('wallet.defi.wizard.supplying_collateral_status')}</span>
				</div>
			{:else if txStatus === 'borrowing'}
				<div class="flex items-center gap-2">
					<span class="loading loading-spinner loading-xs"></span>
					<span>{$t('wallet.defi.wizard.borrowing_usdt0_status')}</span>
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

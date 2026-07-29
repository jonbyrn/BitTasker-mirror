<script lang="ts">
	import { t } from 'svelte-i18n';
	import { get } from 'svelte/store';
	import { ethers } from 'ethers';
	import { tryCatch } from '$lib/utils/tryCatch';
	import { defiPositions } from '$lib/stores/defi-positions.store.svelte';
	import { walletStore, formatSats } from '$lib/stores/wallet.store';
	import { getEvmSigner } from '$lib/stores/connected-wallets.store';
	import { btcPrice } from '$lib/runes/btcPrice.svelte';
	import { AaveService, WBTC_ARBITRUM } from '$lib/services/defi/aave.service';
	import {
		calculateMaxSafeWithdraw,
		calculateProjectedHealthFactor,
		calculateBtcLiquidationPrice
	} from '$lib/services/defi/aave.service';
	import { browserNetworkStatus } from '$lib/utils/network-status';
	import { extractContractError } from '$lib/utils/wallet/contractErrorHandler';
	import * as Sentry from '@sentry/sveltekit';

	interface Props {
		walletId: string;
		address: string;
		onBack: () => void;
		onComplete: () => void;
		onProject?: (data: { liqPrice: number; collateralUsd: number }) => void;
	}

	let { walletId, address: _address, onBack: _onBack, onComplete, onProject }: Props = $props();

	let amountSats = $state('');
	let sliderPercent = $state(0);
	let isProcessing = $state(false);
	let txError = $state<string | null>(null);
	let isOnline = $derived($browserNetworkStatus.online);

	let position = $derived(
		walletId === 'builtin' ? defiPositions.aavePositions.get('builtin') : null
	);
	let currentCollateralUsd = $derived(position?.totalCollateralUsd ?? 0);
	let currentDebtUsd = $derived(position?.totalDebtUsd ?? 0);
	let currentHf = $derived(position?.healthFactor ?? 999);
	let liqThreshold = $derived(position?.liquidationThreshold ?? 7800);

	let maxSafe = $derived(
		calculateMaxSafeWithdraw(
			currentCollateralUsd,
			currentDebtUsd,
			liqThreshold,
			currentHf,
			btcPrice.price,
			8,
			1.05
		)
	);

	let maxSafeSats = $derived(Math.floor(Number(maxSafe.maxSafeCollateralAssetAmount) / 10_000));

	let amountNum = $derived.by(() => {
		const n = parseInt(amountSats, 10);
		return isFinite(n) && n > 0 ? n : 0;
	});

	let amountBtc = $derived(amountNum / 100_000_000);
	let amountUsd = $derived(amountBtc * btcPrice.price);
	let projectedCollateral = $derived(Math.max(0, currentCollateralUsd - amountUsd));
	let projectedHf = $derived(
		calculateProjectedHealthFactor(
			currentCollateralUsd,
			currentDebtUsd,
			liqThreshold,
			-amountUsd,
			0
		)
	);

	let projectedLiqPrice = $derived.by(() => {
		if (projectedCollateral <= 0 || currentDebtUsd <= 0) return 0;
		const collateralBtc = btcPrice.price > 0 ? projectedCollateral / btcPrice.price : 0;
		const result = calculateBtcLiquidationPrice(
			currentDebtUsd,
			collateralBtc,
			liqThreshold,
			btcPrice.price
		);
		return result?.liquidationBtcPrice ?? 0;
	});

	$effect(() => {
		const liq = projectedLiqPrice;
		const coll = projectedCollateral;
		const hf = projectedHf;
		void hf;
		onProject?.({ liqPrice: liq, collateralUsd: coll });
	});

	let exceedsSafe = $derived(amountNum > maxSafeSats);
	let canWithdraw = $derived(amountNum > 0 && isOnline && projectedHf >= 1.05 && !exceedsSafe);

	function setMaxSafe() {
		if (maxSafeSats > 0) {
			sliderPercent = 100;
			amountSats = maxSafeSats.toString();
		}
	}

	function handleAmountInput(e: Event) {
		amountSats = (e.currentTarget as HTMLInputElement).value.replace(/[^0-9]/g, '');
		const n = parseInt(amountSats || '0', 10);
		sliderPercent =
			isFinite(n) && n > 0 && maxSafeSats > 0 ? Math.min(100, (n / maxSafeSats) * 100) : 0;
	}

	function handleSlider(e: Event) {
		const pct = parseFloat((e.currentTarget as HTMLInputElement).value);
		sliderPercent = pct;
		if (pct <= 0 || maxSafeSats <= 0) {
			amountSats = '';
			return;
		}
		amountSats = Math.round((maxSafeSats * pct) / 100).toString();
	}

	const ARB_PUBLIC_RPC = 'https://arb1.arbitrum.io/rpc';

	async function handleWithdraw() {
		if (!canWithdraw || isProcessing) return;
		isProcessing = true;
		txError = null;

		Sentry.addBreadcrumb({
			category: 'defi.position.withdraw',
			message: 'sending withdraw',
			data: { amountNum, walletId }
		});

		const aave = new AaveService(new ethers.JsonRpcProvider(ARB_PUBLIC_RPC));
		const rawAmount = BigInt(amountNum);

		if (walletId === 'builtin') {
			const s = get(walletStore);
			const rskW = s.rsk?.wallet as ethers.Wallet | undefined;
			if (!rskW) {
				txError = $t('wallet.defi.approve.error');
				Sentry.addBreadcrumb({
					category: 'defi.position.withdraw',
					message: 'signer unavailable',
					data: { walletId }
				});
				isProcessing = false;
				return;
			}
			const signer = rskW.connect(new ethers.JsonRpcProvider(ARB_PUBLIC_RPC));
			const { data: tx, error } = await tryCatch(aave.withdraw(WBTC_ARBITRUM, rawAmount, signer));
			if (error || !tx) {
				const contractErr = extractContractError(error);
				txError = contractErr.userMessage;
				Sentry.captureException(error, {
					tags: { feature: 'defi.position', action: 'withdraw' }
				});
				isProcessing = false;
				return;
			}
			const { data: receipt, error: receiptErr } = await tryCatch(tx.wait());
			if (receiptErr || !receipt) {
				const contractErr = extractContractError(receiptErr);
				txError = contractErr.userMessage;
				isProcessing = false;
				return;
			}
		} else {
			const evm = getEvmSigner(walletId);
			if (!evm) {
				txError = $t('wallet.defi.approve.error');
				Sentry.addBreadcrumb({
					category: 'defi.position.withdraw',
					message: 'signer unavailable',
					data: { walletId }
				});
				isProcessing = false;
				return;
			}
			const { data: tx, error } = await tryCatch(
				aave.withdrawWithEvmSigner(WBTC_ARBITRUM, rawAmount, evm)
			);
			if (error || !tx) {
				const contractErr = extractContractError(error);
				txError = contractErr.userMessage;
				Sentry.captureException(error, {
					tags: { feature: 'defi.position', action: 'withdraw' }
				});
				isProcessing = false;
				return;
			}
		}

		isProcessing = false;
		onComplete();
	}
</script>

<div class="flex flex-col gap-4">
	<div class="alert alert-soft alert-warning py-2 text-xs">
		⚠️ {$t('wallet.defi.position.withdraw_warning')}
	</div>

	<div class="bg-base-200 rounded-box space-y-1 p-3 text-sm">
		<div class="flex items-center justify-between">
			<span class="text-base-content/60">{$t('wallet.defi.position.withdraw_max_safe')}</span>
			<span class="font-medium tabular-nums">
				{maxSafeSats > 0 ? formatSats(maxSafeSats) : '0'} Sats
				<span class="text-base-content/50">(${maxSafe.maxSafeCollateralUsd.toFixed(2)})</span>
			</span>
		</div>
	</div>

	<div>
		<div class="join w-full">
			<span
				class="btn join-item no-animation bg-base-200 text-base-content/70 pointer-events-none min-h-[48px] border-r-0"
				>Sats</span
			>
			<input
				type="text"
				class="input input-bordered join-item min-h-[48px] flex-1 tabular-nums"
				class:input-error={exceedsSafe}
				placeholder="0"
				value={amountSats}
				oninput={handleAmountInput}
				inputmode="numeric"
			/>
			<button
				type="button"
				class="btn btn-primary join-item min-h-[48px] rounded-r-lg"
				onclick={setMaxSafe}
				disabled={maxSafeSats <= 0}
			>
				{$t('wallet.defi.wizard.max_safe')}
			</button>
		</div>
		<div class="form-control py-2">
			<div class="flex items-center gap-3">
				<span class="text-primary min-w-[3ch] text-right text-sm font-semibold"
					>{Math.round(sliderPercent)}%</span
				>
				<input
					type="range"
					min="0"
					max="100"
					step="1"
					value={Math.round(sliderPercent)}
					class="range range-primary range-sm flex-1"
					oninput={handleSlider}
					disabled={maxSafeSats <= 0}
				/>
			</div>
		</div>
	</div>

	{#if exceedsSafe}
		<div class="alert alert-soft alert-error py-2 text-xs">
			{$t('wallet.defi.position.withdraw_exceeds')}
		</div>
	{/if}

	{#if txError}
		<div class="alert alert-soft alert-error py-1 text-xs" role="alert">
			<span>{txError}</span>
			<button type="button" class="btn btn-ghost btn-xs" onclick={() => (txError = null)}>✕</button>
		</div>
	{/if}

	<div class="bg-base-200 rounded-box flex items-center justify-between p-2 text-xs">
		<span class="text-base-content/60">{$t('wallet.defi.gas_estimate')}</span>
		<span class="tabular-nums">~$0.15 (Arbitrum)</span>
	</div>

	<button
		type="button"
		class="btn btn-primary min-h-[48px] w-full"
		disabled={!canWithdraw || isProcessing}
		onclick={handleWithdraw}
		aria-busy={isProcessing}
	>
		{isProcessing
			? $t('wallet.defi.shared.pending_tx')
			: $t('wallet.defi.position.withdraw_btn', { values: { amount: formatSats(amountNum) } })}
	</button>
</div>

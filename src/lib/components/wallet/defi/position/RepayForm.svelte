<script lang="ts">
	import { t } from 'svelte-i18n';
	import { get } from 'svelte/store';
	import { ethers } from 'ethers';
	import { tryCatch } from '$lib/utils/tryCatch';
	import { walletStore } from '$lib/stores/wallet.store';
	import { getEvmSigner } from '$lib/stores/connected-wallets.store';
	import { defiPositions } from '$lib/stores/defi-positions.store.svelte';
	import { AaveService } from '$lib/services/defi/aave.service';
	import { ARB_PUBLIC_RPC, USDT0_ARBITRUM } from '$lib/config/defi.constants';
	import { fetchLiveFees } from '$lib/utils/swap-gas';
	import { calculateBtcLiquidationPrice } from '$lib/services/defi/aave.service';
	import { btcPrice } from '$lib/runes/btcPrice.svelte';
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

	let amount = $state('');
	let sliderPercent = $state(0);
	let isProcessing = $state(false);
	let txError = $state<string | null>(null);
	let isOnline = $derived($browserNetworkStatus.online);

	let position = $derived(
		walletId === 'builtin' ? defiPositions.aavePositions.get('builtin') : null
	);
	let currentDebtUsd = $derived(position?.totalDebtUsd ?? 0);
	let currentCollateralUsd = $derived(position?.totalCollateralUsd ?? 0);
	let liqThreshold = $derived(position?.liquidationThreshold ?? 7800);

	let amountNum = $derived.by(() => {
		const n = parseFloat(amount);
		return isFinite(n) && n > 0 ? n : 0;
	});

	let projectedDebtUsd = $derived(Math.max(0, currentDebtUsd - amountNum));

	let projectedLiqPrice = $derived.by(() => {
		if (projectedDebtUsd <= 0 || currentCollateralUsd <= 0) return 0;
		const collateralBtc = btcPrice.price > 0 ? currentCollateralUsd / btcPrice.price : 0;
		const result = calculateBtcLiquidationPrice(
			projectedDebtUsd,
			collateralBtc,
			liqThreshold,
			btcPrice.price
		);
		return result?.liquidationBtcPrice ?? 0;
	});

	// Report projected values to parent on every change
	$effect(() => {
		// Read all reactive deps explicitly to ensure tracking
		const liq = projectedLiqPrice;
		const coll = currentCollateralUsd;
		const debt = projectedDebtUsd;
		void debt; // ensure tracking
		onProject?.({ liqPrice: liq, collateralUsd: coll });
	});

	let canRepay = $derived(amountNum > 0 && isOnline && amountNum <= currentDebtUsd);
	let gasEstimate = $state(0.15);

	$effect(() => {
		fetchLiveFees().then((fees) => {
			if (fees.arbGasPriceWei && fees.ethUsdPrice) {
				const gasCostEth = Number(fees.arbGasPriceWei * 250_000n) / 1e18;
				gasEstimate = gasCostEth * fees.ethUsdPrice;
			}
		}).catch(() => {});
	});

	function setMax() {
		sliderPercent = 100;
		amount = currentDebtUsd.toFixed(2);
	}

	function handleAmountInput(e: Event) {
		amount = (e.currentTarget as HTMLInputElement).value.replace(/,/g, '.');
		const n = parseFloat(amount || '0');
		sliderPercent =
			isFinite(n) && n > 0 && currentDebtUsd > 0 ? Math.min(100, (n / currentDebtUsd) * 100) : 0;
	}

	function handleSlider(e: Event) {
		const pct = parseFloat((e.currentTarget as HTMLInputElement).value);
		sliderPercent = pct;
		if (pct <= 0 || currentDebtUsd <= 0) {
			amount = '';
			return;
		}
		amount = ((currentDebtUsd * pct) / 100).toFixed(2);
	}

	async function handleRepay() {
		if (!canRepay || isProcessing) return;
		isProcessing = true;
		txError = null;

		Sentry.addBreadcrumb({
			category: 'defi.position.repay',
			message: 'sending repay',
			data: { amountNum, walletId }
		});

		const aave = new AaveService(new ethers.JsonRpcProvider(ARB_PUBLIC_RPC));
		const rawAmount = BigInt(Math.floor(amountNum * 1_000_000));

		if (walletId === 'builtin') {
			const s = get(walletStore);
			const rskW = s.rsk?.wallet as ethers.Wallet | undefined;
			if (!rskW) {
				txError = $t('wallet.defi.approve.error');
				Sentry.addBreadcrumb({
					category: 'defi.position.repay',
					message: 'signer unavailable',
					data: { walletId }
				});
				isProcessing = false;
				return;
			}
			const signer = rskW.connect(new ethers.JsonRpcProvider(ARB_PUBLIC_RPC));
			const { data: tx, error } = await tryCatch(aave.repay(USDT0_ARBITRUM, rawAmount, signer));
			if (error || !tx) {
				const contractErr = extractContractError(error);
				txError = contractErr.userMessage;
				Sentry.captureException(error, {
					tags: { feature: 'defi.position', action: 'repay' }
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
					category: 'defi.position.repay',
					message: 'signer unavailable',
					data: { walletId }
				});
				isProcessing = false;
				return;
			}
			const { data: tx, error } = await tryCatch(
				aave.repayWithEvmSigner(USDT0_ARBITRUM, rawAmount, evm)
			);
			if (error || !tx) {
				const contractErr = extractContractError(error);
				txError = contractErr.userMessage;
				Sentry.captureException(error, {
					tags: { feature: 'defi.position', action: 'repay' }
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
	<div class="bg-base-200 rounded-box space-y-1 p-3 text-sm">
		<div class="flex items-center justify-between">
			<span class="text-base-content/60">{$t('wallet.defi.position.repay_current_debt')}</span>
			<span class="font-medium tabular-nums">${currentDebtUsd.toFixed(2)}</span>
		</div>
	</div>

	<div>
		<div class="join w-full">
			<span
				class="btn join-item no-animation bg-base-200 text-base-content/70 pointer-events-none min-h-[48px] border-r-0"
				>$
			</span>
			<input
				type="text"
				class="input input-bordered join-item min-h-[48px] flex-1 tabular-nums"
				placeholder="0.00"
				value={amount}
				oninput={handleAmountInput}
				inputmode="decimal"
			/>
			<button
				type="button"
				class="btn btn-primary join-item min-h-[48px] rounded-r-lg"
				onclick={setMax}
				disabled={currentDebtUsd <= 0}
			>
				{$t('wallet.max')}
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
					disabled={currentDebtUsd <= 0}
				/>
			</div>
		</div>
	</div>

	{#if txError}
		<div class="alert alert-soft alert-error py-1 text-xs" role="alert">
			<span>{txError}</span>
			<button type="button" class="btn btn-ghost btn-xs" onclick={() => (txError = null)}>✕</button>
		</div>
	{/if}

	<div class="bg-base-200 rounded-box flex items-center justify-between p-2 text-xs">
		<span class="text-base-content/60">{$t('wallet.defi.gas_estimate')}</span>
		<span class="tabular-nums">~${gasEstimate.toFixed(2)} (Arbitrum)</span>
	</div>

	<button
		type="button"
		class="btn btn-primary min-h-[48px] w-full"
		disabled={!canRepay || isProcessing}
		onclick={handleRepay}
		aria-busy={isProcessing}
	>
		{isProcessing
			? $t('wallet.defi.shared.pending_tx')
			: $t('wallet.defi.position.repay_btn', { values: { amount: amountNum.toFixed(2) } })}
	</button>
</div>

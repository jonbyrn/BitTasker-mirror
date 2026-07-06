<script lang="ts">
	import { t } from 'svelte-i18n';
	import { get } from 'svelte/store';
	import { ethers } from 'ethers';
	import { tryCatch } from '$lib/utils/tryCatch';
	import { walletStore, formatSats } from '$lib/stores/wallet.store';
	import { getEvmSigner } from '$lib/stores/connected-wallets.store';
	import { defiPositions } from '$lib/stores/defi-positions.store.svelte';
	import { btcPrice } from '$lib/runes/btcPrice.svelte';
	import { AaveService, WBTC_ARBITRUM } from '$lib/services/defi/aave.service';
	import {
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

	let wbtcBalance = $derived($walletStore.arb?.formattedWbtcBalance ?? '0');
	let wbtcBalanceNum = $derived(parseFloat(wbtcBalance) || 0);
	let wbtcBalanceSats = $derived(Math.round(wbtcBalanceNum * 100_000_000));

	let position = $derived(
		walletId === 'builtin' ? defiPositions.aavePositions.get('builtin') : null
	);
	let currentCollateralUsd = $derived(position?.totalCollateralUsd ?? 0);
	let currentDebtUsd = $derived(position?.totalDebtUsd ?? 0);
	let liqThreshold = $derived(position?.liquidationThreshold ?? 7800);

	let amountNum = $derived.by(() => {
		const n = parseInt(amountSats, 10);
		return isFinite(n) && n > 0 ? n : 0;
	});

	let amountBtc = $derived(amountNum / 100_000_000);
	let amountUsd = $derived(amountBtc * btcPrice.price);
	let projectedHf = $derived(
		calculateProjectedHealthFactor(currentCollateralUsd, currentDebtUsd, liqThreshold, amountUsd, 0)
	);
	let projectedCollateral = $derived(currentCollateralUsd + amountUsd);

	let projectedLiqPrice = $derived.by(() => {
		if (currentDebtUsd <= 0 || projectedCollateral <= 0) return 0;
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

	let canSupply = $derived(amountNum > 0 && isOnline && amountNum <= wbtcBalanceSats);

	function setMax() {
		sliderPercent = 100;
		amountSats = wbtcBalanceSats.toString();
	}

	function handleAmountInput(e: Event) {
		amountSats = (e.currentTarget as HTMLInputElement).value.replace(/[^0-9]/g, '');
		const n = parseInt(amountSats || '0', 10);
		sliderPercent =
			isFinite(n) && n > 0 && wbtcBalanceSats > 0 ? Math.min(100, (n / wbtcBalanceSats) * 100) : 0;
	}

	function handleSlider(e: Event) {
		const pct = parseFloat((e.currentTarget as HTMLInputElement).value);
		sliderPercent = pct;
		if (pct <= 0 || wbtcBalanceSats <= 0) {
			amountSats = '';
			return;
		}
		amountSats = Math.round((wbtcBalanceSats * pct) / 100).toString();
	}

	const ARB_PUBLIC_RPC = 'https://arb1.arbitrum.io/rpc';

	async function handleSupply() {
		if (!canSupply || isProcessing) return;
		isProcessing = true;
		txError = null;

		Sentry.addBreadcrumb({
			category: 'defi.position.addCollateral',
			message: 'sending supply',
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
					category: 'defi.position.addCollateral',
					message: 'signer unavailable',
					data: { walletId }
				});
				isProcessing = false;
				return;
			}
			const signer = rskW.connect(new ethers.JsonRpcProvider(ARB_PUBLIC_RPC));
			const { data: tx, error } = await tryCatch(aave.supply(WBTC_ARBITRUM, rawAmount, signer));
			if (error || !tx) {
				const contractErr = extractContractError(error);
				txError = contractErr.userMessage;
				Sentry.captureException(error, {
					tags: { feature: 'defi.position', action: 'addCollateral' }
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
					category: 'defi.position.addCollateral',
					message: 'signer unavailable',
					data: { walletId }
				});
				isProcessing = false;
				return;
			}
			const { data: tx, error } = await tryCatch(
				aave.supplyWithEvmSigner(WBTC_ARBITRUM, rawAmount, evm)
			);
			if (error || !tx) {
				const contractErr = extractContractError(error);
				txError = contractErr.userMessage;
				Sentry.captureException(error, {
					tags: { feature: 'defi.position', action: 'addCollateral' }
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
			<span class="text-base-content/60">{$t('wallet.defi.position.add_balance')}</span>
			<span class="font-medium tabular-nums">{formatSats(wbtcBalanceSats)} Sats</span>
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
				placeholder="0"
				value={amountSats}
				oninput={handleAmountInput}
				inputmode="numeric"
			/>
			<button
				type="button"
				class="btn btn-primary join-item min-h-[48px] rounded-r-lg"
				onclick={setMax}
				disabled={wbtcBalanceSats <= 0}
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
					disabled={wbtcBalanceSats <= 0}
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

	<button
		type="button"
		class="btn btn-primary min-h-[48px] w-full"
		disabled={!canSupply || isProcessing}
		onclick={handleSupply}
		aria-busy={isProcessing}
	>
		{isProcessing
			? $t('wallet.defi.shared.pending_tx')
			: $t('wallet.defi.position.add_btn', { values: { amount: formatSats(amountNum) } })}
	</button>
</div>

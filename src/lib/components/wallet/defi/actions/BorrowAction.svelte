<script lang="ts">
	import { t } from 'svelte-i18n';
	import { onMount, onDestroy } from 'svelte';
	import { ethers, Interface } from 'ethers';
	import { tryCatch } from '$lib/utils/tryCatch';
	import { walletStore, sendArbitrumTransaction } from '$lib/stores/wallet.store';
	import { connectedWalletsStore, getEvmSigner } from '$lib/stores/connected-wallets.store';
	import { defiPositions } from '$lib/stores/defi-positions.store.svelte';
	import { btcPrice } from '$lib/runes/btcPrice.svelte';
	import {
		AaveService,
		USDT0_ARBITRUM,
		calculateBtcLiquidationPrice,
		calculateLtv
	} from '$lib/services/defi/aave.service';
	import { browserNetworkStatus } from '$lib/utils/network-status';
	import { extractContractError, type ContractError } from '$lib/utils/wallet/contractErrorHandler';
	import * as Sentry from '@sentry/sveltekit';
	import SwapPartySelector from '$lib/components/wallet/SwapPartySelector.svelte';
	import AmountInputSection from '$lib/components/wallet/AmountInputSection.svelte';
	import LoanHealthBar from '../LoanHealthBar.svelte';
	import LoanHealthBadge from '../LoanHealthBadge.svelte';
	import type { AssetOption } from '$lib/components/wallet/AssetSelector.svelte';

	const AAVE_POOL = '0x794a61358D6845594F94dc1DB02A252b5b4814aD';
	const POOL_ABI = [
		'function borrow(address asset, uint256 amount, uint256 interestRateMode, uint16 referralCode, address onBehalfOf) external'
	];

	const ARB_PUBLIC_RPC = 'https://arb1.arbitrum.io/rpc';

	type TxPhase = 'idle' | 'borrowing' | 'done';

	function sanitizeErrorForLog(error: unknown): Record<string, unknown> {
		if (!(error instanceof Error)) {
			return { type: typeof error, message: 'Unknown error' };
		}

		const safeMessage = error.message
			.replace(/0x[0-9a-fA-F]{64,}/g, '[hex-redacted]')
			.replace(/transaction="[^"]*"/g, 'transaction="[redacted]"')
			.replace(/info=\{[^}]*\}/g, 'info=[redacted]');

		const result: Record<string, unknown> = {
			name: error.name,
			message: safeMessage.length > 300 ? safeMessage.slice(0, 300) + '...' : safeMessage
		};

		if ('code' in error && typeof (error as Record<string, unknown>).code === 'string') {
			result.code = (error as Record<string, unknown>).code;
		}

		return result;
	}

	function mapDeFiErrorMessage(contractErr: ContractError): string {
		const _ = $t;
		const code = contractErr.errorCode;
		if (!code) return contractErr.userMessage;

		const DEFI_ERROR_MAP: Record<string, string> = {
			INSUFFICIENT_GAS: _('wallet.defi.shared.error_insufficient_gas'),
			INSUFFICIENT_FUNDS: _('wallet.defi.shared.error_insufficient_funds'),
			INSUFFICIENT_FUNDS_GAS_FLUCTUATION: _('wallet.defi.shared.error_insufficient_gas'),
			NETWORK_ERROR: _('wallet.defi.shared.error_network'),
			USER_REJECTED: _('wallet.defi.shared.error_user_rejected'),
			GAS_ERROR: _('wallet.defi.shared.error_gas_limit'),
			NONCE_ERROR: _('wallet.defi.shared.error_nonce'),
			CONTRACT_REVERT: _('wallet.defi.shared.error_contract_revert'),
			PROVIDER_DESTROYED: _('wallet.defi.shared.error_network'),
			WALLET_ERROR: _('wallet.defi.shared.error_network'),
			GENERIC_ERROR: _('wallet.defi.shared.error_generic')
		};

		return DEFI_ERROR_MAP[code] ?? contractErr.userMessage;
	}

	interface Props {
		walletId: string;
		address: string;
		onSuccess: (txHash: string) => void;
		minimal?: boolean;
		onProjectedValues?: (vals: {
			debt?: number;
			collateral?: number;
			available?: number;
			liqPrice?: number;
		}) => void;
	}

	let { walletId, address, onSuccess, minimal = false, onProjectedValues }: Props = $props();

	let borrowAmount = $state('');
	let borrowAPR = $state(3.29);
	let isLoadingRates = $state(true);
	let ratesError = $state<string | null>(null);
	let isProcessing = $state(false);
	let txPhase: TxPhase = $state('idle');
	let showConfirmModal = $state(false);
	let confirmError = $state<string | null>(null);
	let successTxHash = $state<string | null>(null);
	let successTimeoutId: ReturnType<typeof setTimeout> | null = $state(null);
	let feeExpanded = $state(false);
	let sliderPercent = $state(0);
	let riskAcknowledged = $state(false);
	let isOnline = $derived($browserNetworkStatus.online);

	let usdt0Balance = $derived($walletStore.arb?.formattedUsdt0Balance ?? '0');
	let usdt0BalanceNum = $derived(parseFloat(usdt0Balance) || 0);

	let position = $derived(
		walletId === 'builtin' ? defiPositions.aavePositions.get('builtin') : null
	);

	let currentCollateralUsd = $derived(position?.totalCollateralUsd ?? 0);
	let currentDebtUsd = $derived(position?.totalDebtUsd ?? 0);
	let liqThreshold = $derived(position?.liquidationThreshold ?? 7800);
	let availableBorrowsUsd = $derived(position?.availableBorrowsUsd ?? 0);

	let amountNum = $derived.by(() => {
		const n = parseFloat(borrowAmount);
		return isFinite(n) && n > 0 ? n : 0;
	});

	let projectedDebtUsd = $derived(currentDebtUsd + amountNum);
	let projectedLtvPct = $derived(calculateLtv(projectedDebtUsd, currentCollateralUsd) / 100);

	let liqPriceResult = $derived.by(() => {
		if (currentCollateralUsd <= 0 || projectedDebtUsd <= 0) return null;
		const collateralBtc = btcPrice.price > 0 ? currentCollateralUsd / btcPrice.price : 0;
		return calculateBtcLiquidationPrice(
			projectedDebtUsd,
			collateralBtc,
			liqThreshold,
			btcPrice.price
		);
	});

	let annualCost = $derived(amountNum * (borrowAPR / 100));

	// Max safe borrow: amount that keeps LTV at or below 50%
	let maxSafeBorrowUsd = $derived(Math.max(0, currentCollateralUsd * 0.5 - currentDebtUsd));
	// Rounded thresholds — prevents false "exceeds" when toFixed(2) rounds up
	let maxSafeDisplay = $derived(Math.floor(maxSafeBorrowUsd * 100) / 100);
	let availableDisplay = $derived(Math.round(availableBorrowsUsd * 100) / 100);
	let exceedsSafe = $derived(amountNum > 0 && amountNum > maxSafeDisplay);
	let exceedsAvailable = $derived(amountNum > 0 && amountNum > availableDisplay);

	let canBorrow = $derived(
		amountNum > 0 && isOnline && !ratesError && !exceedsAvailable && riskAcknowledged
	);

	let usdt0Assets = $derived<AssetOption[]>([
		{
			id: 'usdt0-arb',
			label: 'USDT0',
			icon: '/images/chains/arbitrum.png',
			subLabel: 'USD Stablecoin on Arbitrum',
			balance: `$${usdt0BalanceNum.toFixed(2)}`,
			balanceSub: ''
		}
	]);

	function walletBtcSatsFor(id: string): number {
		if (id === 'builtin') {
			const wbtcBalance = parseFloat($walletStore.arb?.formattedWbtcBalance ?? '0') || 0;
			return Math.round(wbtcBalance * 100_000_000);
		}
		const w = $connectedWalletsStore.wallets.find((w) => w.id === id);
		if (!w?.balances) return 0;
		return Number(w.balances['wbtc-arb']?.raw ?? 0) / 10_000_000_000;
	}

	function walletUsdt0For(id: string): number {
		if (id === 'builtin') {
			return usdt0BalanceNum;
		}
		const w = $connectedWalletsStore.wallets.find((w) => w.id === id);
		if (!w?.balances) return 0;
		return Number(w.balances['usdt0-arb']?.raw ?? 0) / 1_000_000;
	}

	$effect(() => {
		if (minimal && onProjectedValues) {
			onProjectedValues({
				debt: projectedDebtUsd,
				available: Math.max(0, availableBorrowsUsd - amountNum),
				liqPrice: liqPriceResult?.liquidationBtcPrice ?? 0
			});
		}
	});

	onDestroy(() => {
		if (successTimeoutId) clearTimeout(successTimeoutId);
	});

	function handleWalletSelect(_id: string) {}

	async function loadRates() {
		isLoadingRates = true;
		ratesError = null;
		const provider = new ethers.JsonRpcProvider(ARB_PUBLIC_RPC);
		const aave = new AaveService(provider);
		const { data: apr, error } = await tryCatch(aave.getVariableBorrowAPR(USDT0_ARBITRUM));
		if (error || apr === undefined) {
			ratesError = $t('wallet.defi.borrow.rates_error');
		} else {
			borrowAPR = apr;
		}
		isLoadingRates = false;
	}

	onMount(() => {
		void loadRates();
		defiPositions.refreshAavePosition(walletId, true).catch(() => {});
	});

	function setMaxSafe() {
		if (maxSafeDisplay > 0) {
			// Set to safe amount — slider will show the corresponding percent of available
			borrowAmount = maxSafeDisplay.toFixed(2);
			sliderPercent =
				availableBorrowsUsd > 0 ? Math.min(100, (maxSafeDisplay / availableBorrowsUsd) * 100) : 0;
		}
	}

	function handleAmountChange(v: string) {
		borrowAmount = v;

		const n = parseFloat(v || '0');
		sliderPercent =
			isFinite(n) && n > 0 && availableBorrowsUsd > 0
				? Math.min(100, (n / availableBorrowsUsd) * 100)
				: 0;
	}

	function applyPercent(pct: number) {
		sliderPercent = Math.min(100, pct);
		if (pct <= 0 || availableBorrowsUsd <= 0) {
			borrowAmount = '';
			return;
		}
		const usd = (availableBorrowsUsd * Math.min(100, pct)) / 100;
		borrowAmount = usd.toFixed(2);
	}

	function openConfirm() {
		confirmError = null;
		successTxHash = null;
		if (successTimeoutId) {
			clearTimeout(successTimeoutId);
			successTimeoutId = null;
		}
		showConfirmModal = true;
	}

	function confirmSuccess() {
		const txHash = successTxHash;
		if (successTimeoutId) {
			clearTimeout(successTimeoutId);
			successTimeoutId = null;
		}
		showConfirmModal = false;
		if (txHash) onSuccess(txHash);
		successTxHash = null;
	}

	function handleRetry() {
		confirmError = null;
		void handleBorrow();
	}

	function closeModal() {
		if (isProcessing) return;
		if (successTimeoutId) {
			clearTimeout(successTimeoutId);
			successTimeoutId = null;
		}
		showConfirmModal = false;
		successTxHash = null;
	}

	async function handleBorrow() {
		if (!canBorrow || isProcessing) return;
		isProcessing = true;
		confirmError = null;
		successTxHash = null;

		const rawAmount = BigInt(Math.round(amountNum * 1_000_000));
		const maxRaw = BigInt(Math.floor(maxSafeBorrowUsd * 1_000_000));
		const finalAmount = rawAmount > maxRaw ? maxRaw : rawAmount;

		try {
			txPhase = 'borrowing';

			Sentry.addBreadcrumb({
				category: 'defi.borrow',
				message: 'sending borrow',
				data: { amountUsd: amountNum.toString(), rawAmount: finalAmount.toString() }
			});

			const poolIface = new Interface(POOL_ABI);
			const borrowData = poolIface.encodeFunctionData('borrow', [
				USDT0_ARBITRUM,
				finalAmount,
				2,
				0,
				ethers.getAddress(address.toLowerCase())
			]);

			if (walletId === 'builtin') {
				const { data: txHash, error: txErr } = await tryCatch(
					sendArbitrumTransaction({ to: AAVE_POOL, data: borrowData, value: '0' })
				);

				if (txErr || !txHash) {
					const contractErr = extractContractError(txErr);
					console.warn('[BorrowAction] Borrow tx failed (builtin):', sanitizeErrorForLog(txErr));
					throw new Error(contractErr.userMessage);
				}

				Sentry.addBreadcrumb({
					category: 'defi.borrow',
					message: 'borrow confirmed',
					data: { txHash }
				});

				txPhase = 'done';
				isProcessing = false;
				successTxHash = txHash;
				successTimeoutId = setTimeout(() => {
					if (successTxHash) {
						showConfirmModal = false;
						onSuccess(successTxHash);
						successTxHash = null;
					}
				}, 5000);
			} else {
				const evmSigner = getEvmSigner(walletId);
				if (!evmSigner) {
					throw new Error($t('wallet.defi.approve.error'));
				}

				const { data: result, error: txErr } = await tryCatch(
					evmSigner.sendTransaction({ to: AAVE_POOL, data: borrowData, value: 0n, chainId: 42161 })
				);

				if (txErr || !result) {
					const contractErr = extractContractError(txErr);
					console.warn('[BorrowAction] Borrow tx failed (connected):', sanitizeErrorForLog(txErr));
					throw new Error(contractErr.userMessage);
				}

				Sentry.addBreadcrumb({
					category: 'defi.borrow',
					message: 'borrow confirmed',
					data: { txHash: result.txHash }
				});

				txPhase = 'done';
				isProcessing = false;
				successTxHash = result.txHash;
				successTimeoutId = setTimeout(() => {
					if (successTxHash) {
						showConfirmModal = false;
						onSuccess(successTxHash);
						successTxHash = null;
					}
				}, 5000);
			}
		} catch (err) {
			const contractErr = extractContractError(err);

			console.error(
				`[BorrowAction] Borrow flow error (phase=${txPhase}, wallet=${walletId}):`,
				sanitizeErrorForLog(err)
			);

			Sentry.addBreadcrumb({
				category: 'defi.borrow',
				message: 'borrow flow error',
				data: {
					phase: txPhase,
					walletId,
					errorCode: contractErr.errorCode ?? 'UNKNOWN'
				}
			});

			confirmError = mapDeFiErrorMessage(contractErr);
			txPhase = 'idle';
			isProcessing = false;
		}
	}
</script>

<div class="flex flex-col gap-4">
	<p class="text-base-content/70 text-xs">{$t('wallet.defi.position.action_desc_borrow')}</p>

	{#if !minimal}
		<SwapPartySelector
			label={$t('wallet.to')}
			selectedWalletId={walletId}
			onWalletSelect={handleWalletSelect}
			connectedWallets={$connectedWalletsStore.wallets}
			{walletBtcSatsFor}
			{walletUsdt0For}
			btcPrice={btcPrice.price}
			selectedAssetId="usdt0-arb"
			onAssetSelect={() => {}}
			assets={usdt0Assets}
		/>
	{/if}

	<AmountInputSection
		variant="direct"
		tokenPrefix="$"
		amount={borrowAmount}
		onAmountChange={handleAmountChange}
		onUnitChange={() => {}}
		unit="usd"
		showPercentSlider={true}
		sliderDisabled={availableBorrowsUsd <= 0}
		percent={sliderPercent}
		onPercentChange={applyPercent}
		onMaxAmount={async () => setMaxSafe()}
		maxLabel={$t('wallet.defi.wizard.max_safe')}
		maxDisabled={maxSafeDisplay <= 0}
		disabled={!isOnline}
		hasInsufficientBalance={exceedsAvailable}
	/>

	{#if exceedsAvailable}
		<div class="alert alert-soft alert-error py-2 text-xs">
			Exceeds available borrow amount of ${availableBorrowsUsd.toFixed(2)}.
		</div>
	{:else if exceedsSafe}
		<div class="alert alert-soft alert-warning py-2 text-xs">
			{$t('wallet.defi.position.withdraw_exceeds', {
				values: {
					ltv: projectedLtvPct.toFixed(1),
					liqPrice: liqPriceResult
						? Math.round(liqPriceResult.liquidationBtcPrice).toLocaleString()
						: '—'
				}
			})}
		</div>
	{/if}

	{#if !minimal}
		<LoanHealthBar
			totalCollateralUsd={currentCollateralUsd}
			totalDebtUsd={projectedDebtUsd}
			availableBorrowsUsd={Math.max(0, availableBorrowsUsd - amountNum)}
		/>

		{#if liqPriceResult}
			<div class="flex items-center justify-between text-xs">
				<span class="text-base-content/50">{$t('wallet.defi.wizard.new_liq_price')}</span>
				<span class="font-medium tabular-nums"
					>${Math.round(liqPriceResult.liquidationBtcPrice).toLocaleString()}</span
				>
			</div>
		{/if}

		<div
			class="collapse-arrow border-primary bg-base-100 collapse rounded-lg border"
			class:collapse-open={feeExpanded}
		>
			<button
				type="button"
				class="collapse-title flex min-h-[44px] items-center gap-2 px-3 py-2.5 pr-10 pl-3 text-sm font-medium"
				onclick={() => (feeExpanded = !feeExpanded)}
			>
				<span>{$t('wallet.defi.fee_breakdown')}</span>
				{#if !feeExpanded && !isLoadingRates && !ratesError}
					<span class="text-base-content/70 ml-auto text-xs tabular-nums"
						>{borrowAPR.toFixed(2)}% APR</span
					>
				{/if}
			</button>
			<div class="collapse-content space-y-1.5 px-2 text-sm">
				{#if isLoadingRates}
					<div class="skeleton h-4 w-3/4"></div>
				{:else}
					{#if ratesError}
						<div class="alert alert-soft alert-warning py-1 text-xs">{ratesError}</div>
					{/if}
					<div class="flex justify-between">
						<span>{$t('wallet.defi.borrow.gas_fee')}</span>
						<span class="tabular-nums">~$0.18</span>
					</div>
					<div class="flex justify-between">
						<span>{$t('wallet.defi.borrow.interest_rate')}</span>
						<span class="tabular-nums">{borrowAPR.toFixed(2)}% APR</span>
					</div>
					<div class="flex justify-between font-medium">
						<span>{$t('wallet.defi.borrow.annual_cost')}</span>
						<span class="tabular-nums">${annualCost.toFixed(2)}</span>
					</div>
				{/if}
			</div>
		</div>
	{/if}

	<label class="flex items-start gap-2 text-sm">
		<input type="checkbox" class="checkbox checkbox-sm mt-0.5" bind:checked={riskAcknowledged} />
		<span class="text-xs leading-relaxed">
			{$t('wallet.defi.wizard.risk_ack_supply')}
		</span>
	</label>

	<button
		type="button"
		class="btn btn-primary min-h-[48px] w-full text-base"
		disabled={!canBorrow || isProcessing}
		onclick={openConfirm}
		aria-busy={isProcessing}
	>
		{isProcessing
			? $t('wallet.defi.shared.pending_tx')
			: $t('wallet.defi.wizard.borrow_btn', { values: { amount: amountNum.toFixed(2) } })}
	</button>
</div>

{#if showConfirmModal}
	<div class="modal modal-open">
		<div class="modal-box max-w-md">
			<h3 class="text-lg font-bold">{$t('wallet.defi.wizard.borrow_usdt0')}</h3>

			{#if successTxHash}
				<!-- Success state -->
				<div class="flex flex-col items-center gap-3 py-6">
					<div class="bg-success/10 flex h-12 w-12 items-center justify-center rounded-full">
						<svg class="text-success h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M5 13l4 4L19 7"
							/>
						</svg>
					</div>
					<p class="text-sm font-medium">{$t('wallet.defi.shared.tx_confirmed')}</p>
					<p class="text-base-content/60 text-xs">{$t('wallet.defi.shared.closing_shortly')}</p>
				</div>
				<div class="modal-action">
					<button class="btn btn-primary w-full" onclick={confirmSuccess}>
						{$t('wallet.defi.wizard.done')}
					</button>
				</div>
			{:else}
				<div class="space-y-4 py-4">
					<p class="text-sm">
						{$t('wallet.defi.position.confirm_borrow_desc', {
							values: { amount: `$${amountNum.toFixed(2)}` }
						})}
					</p>

					<LoanHealthBar
						totalCollateralUsd={currentCollateralUsd}
						totalDebtUsd={projectedDebtUsd}
						availableBorrowsUsd={Math.max(0, availableBorrowsUsd - amountNum)}
					/>

					<div class="flex items-center justify-between text-xs">
						<span class="text-base-content/60">{$t('wallet.defi.position.projected_ltv')}</span>
						<LoanHealthBadge ltvPct={projectedLtvPct} showLtv />
					</div>

					<div class="bg-base-200 space-y-1 rounded-lg p-3 text-sm">
						<div class="flex items-center justify-between">
							<span class="text-base-content/60">{$t('wallet.defi.borrow.interest_rate')}</span>
							<span class="tabular-nums">{borrowAPR.toFixed(2)}% APR</span>
						</div>
						<div class="flex items-center justify-between">
							<span class="text-base-content/60">{$t('wallet.defi.borrow.annual_cost')}</span>
							<span class="tabular-nums">${annualCost.toFixed(2)}</span>
						</div>
					</div>

					{#if confirmError}
						<div class="alert alert-error py-2">
							<div class="flex flex-col gap-2">
								<span class="text-sm">{confirmError}</span>
								<button class="btn btn-error btn-sm btn-soft self-end" onclick={handleRetry}>
									{$t('wallet.defi.shared.retry')}
								</button>
							</div>
						</div>
					{/if}

					{#if isProcessing && txPhase !== 'idle'}
						<div class="space-y-2 pt-2">
							<div class="flex items-center gap-2 text-sm">
								{#if txPhase === 'borrowing'}
									<span class="loading loading-spinner loading-xs"></span>
									<span>{$t('wallet.defi.wizard.borrow_pending')}</span>
								{:else if txPhase === 'done'}
									<svg
										class="text-success h-4 w-4"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M5 13l4 4L19 7"
										/>
									</svg>
									<span>{$t('wallet.defi.shared.tx_confirmed')}</span>
								{/if}
							</div>
							<ul class="steps steps-horizontal w-full text-xs">
								<li class="step step-primary">{$t('wallet.defi.wizard.step_approve')}</li>
								<li
									class="step {txPhase === 'borrowing' || txPhase === 'done' ? 'step-primary' : ''}"
								>
									{$t('wallet.defi.wizard.step_supply')}
								</li>
							</ul>
						</div>
					{/if}
				</div>

				<div class="modal-action">
					<button class="btn btn-ghost" onclick={closeModal} disabled={isProcessing}>
						{$t('common.cancel')}
					</button>
					<button class="btn btn-primary" onclick={handleBorrow} disabled={isProcessing}>
						{#if isProcessing}
							<span class="loading loading-spinner loading-sm"></span>
							{#if txPhase === 'borrowing'}
								{$t('wallet.defi.wizard.borrow_pending')}
							{:else}
								{$t('wallet.defi.wizard.borrow_usdt0')}
							{/if}
						{:else}
							{$t('wallet.defi.wizard.borrow_btn', { values: { amount: amountNum.toFixed(2) } })}
						{/if}
					</button>
				</div>
			{/if}
		</div>
		<button class="modal-backdrop" onclick={closeModal} aria-label="Close"></button>
	</div>
{/if}

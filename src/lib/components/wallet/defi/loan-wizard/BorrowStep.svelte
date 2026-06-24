<script lang="ts">
	import { t } from 'svelte-i18n';
	import { onMount } from 'svelte';
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
	import type { AssetOption } from '$lib/components/wallet/AssetSelector.svelte';

	const AAVE_POOL = '0x794a61358D6845594F94dc1DB02A252b5b4814aD';
	const POOL_ABI = [
		'function borrow(address asset, uint256 amount, uint256 interestRateMode, uint16 referralCode, address onBehalfOf) external'
	];

	const ARB_PUBLIC_RPC = 'https://arb1.arbitrum.io/rpc';

	/** Transaction phase for borrow: idle → borrowing → done */
	type TxPhase = 'idle' | 'borrowing' | 'done';

	/**
	 * Sanitize an error for safe console logging.
	 * Strips raw transaction hex, private-key-like hex strings, and long encoded data.
	 */
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
			message: safeMessage.length > 300 ? safeMessage.slice(0, 300) + '…' : safeMessage
		};

		if ('code' in error && typeof (error as Record<string, unknown>).code === 'string') {
			result.code = (error as Record<string, unknown>).code;
		}

		return result;
	}

	/**
	 * Map a ContractError to a DeFi-specific user-friendly message.
	 * Overrides generic RBTC-centric messages with Arbitrum-aware wording.
	 */
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
		borrowAmount: string;
		onAmountChange: (amount: string) => void;
		onBorrowComplete: (txHash: string) => void;
	}

	let { walletId, address, borrowAmount, onAmountChange, onBorrowComplete }: Props = $props();

	let borrowAPR = $state(3.29);
	let isLoadingRates = $state(true);
	let ratesError = $state<string | null>(null);
	let isProcessing = $state(false);
	let txPhase: TxPhase = $state('idle');
	let showConfirmModal = $state(false);
	let confirmError = $state<string | null>(null);
	let feeExpanded = $state(false);
	let sliderPercent = $state(0);
	let riskAcknowledged = $state(false);
	let isOnline = $derived($browserNetworkStatus.online);

	// USDT0 balance for the "To:" selector
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
	let _projectedLtv = $derived(calculateLtv(projectedDebtUsd, currentCollateralUsd));

	let _liqPriceResult = $derived.by(() => {
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

	let canBorrow = $derived(
		amountNum > 0 && isOnline && !ratesError && amountNum <= availableBorrowsUsd && riskAcknowledged
	);

	// USDT0 asset for the "To:" selector
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
		// Force-refresh Aave position to pick up freshly supplied collateral from the supply step
		defiPositions.refreshAavePosition(walletId, true).catch(() => {});
	});

	function setMaxSafe() {
		if (availableBorrowsUsd > 0) {
			sliderPercent = 100;
			onAmountChange(availableBorrowsUsd.toFixed(2));
		}
	}

	function handleAmountChange(v: string) {
		onAmountChange(v);

		const n = parseFloat(v || '0');
		sliderPercent =
			isFinite(n) && n > 0 && availableBorrowsUsd > 0
				? Math.min(100, (n / availableBorrowsUsd) * 100)
				: 0;
	}

	function applyPercent(pct: number) {
		sliderPercent = pct;
		if (pct <= 0 || availableBorrowsUsd <= 0) {
			onAmountChange('');
			return;
		}
		const usd = (availableBorrowsUsd * pct) / 100;
		onAmountChange(usd.toFixed(2));
	}

	function openConfirm() {
		confirmError = null;
		showConfirmModal = true;
	}

	/**
	 * Borrow flow: encode borrow tx → send via gasless or direct.
	 * No approve step needed — AAVE gives you the tokens.
	 */
	async function handleBorrow() {
		if (!canBorrow || isProcessing) return;
		isProcessing = true;
		confirmError = null;

		// USDT0 has 6 decimals — amountNum is in USD
		const rawAmount = BigInt(Math.floor(amountNum * 1_000_000));

		try {
			txPhase = 'borrowing';

			Sentry.addBreadcrumb({
				category: 'defi.borrow',
				message: 'sending borrow',
				data: { amountUsd: amountNum.toString(), rawAmount: rawAmount.toString() }
			});

			const poolIface = new Interface(POOL_ABI);
			// interestRateMode = 2 → VARIABLE
			const borrowData = poolIface.encodeFunctionData('borrow', [
				USDT0_ARBITRUM,
				rawAmount,
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
					console.warn('[BorrowStep] Borrow tx failed (builtin):', sanitizeErrorForLog(txErr));
					throw new Error(contractErr.userMessage);
				}

				Sentry.addBreadcrumb({
					category: 'defi.borrow',
					message: 'borrow confirmed',
					data: { txHash }
				});

				defiPositions.invalidate(walletId);
				txPhase = 'done';
				isProcessing = false;
				showConfirmModal = false;
				onBorrowComplete(txHash);
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
					console.warn('[BorrowStep] Borrow tx failed (connected):', sanitizeErrorForLog(txErr));
					throw new Error(contractErr.userMessage);
				}

				Sentry.addBreadcrumb({
					category: 'defi.borrow',
					message: 'borrow confirmed',
					data: { txHash: result.txHash }
				});

				defiPositions.invalidate(walletId);
				txPhase = 'done';
				isProcessing = false;
				showConfirmModal = false;
				onBorrowComplete(result.txHash);
			}
		} catch (err) {
			const contractErr = extractContractError(err);

			console.error(
				`[BorrowStep] Borrow flow error (phase=${txPhase}, wallet=${walletId}):`,
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
	<h3 class="text-base font-semibold">{$t('wallet.defi.wizard.borrow_usdt0')}</h3>

	<!-- "To:" wallet/asset selector — shows USDT0 as the receiving asset -->
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

	<!-- Amount input — USD with Max Safe button + % slider (matches supply screen) -->
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
		maxDisabled={availableBorrowsUsd <= 0}
		disabled={!isOnline}
		hasInsufficientBalance={amountNum > 0 && amountNum > availableBorrowsUsd}
	/>

	<!-- Impact preview -->
	<LoanHealthBar
		totalCollateralUsd={currentCollateralUsd}
		totalDebtUsd={projectedDebtUsd}
		availableBorrowsUsd={Math.max(0, availableBorrowsUsd - amountNum)}
	/>

	{#if _liqPriceResult}
		<div class="flex items-center justify-between text-xs">
			<span class="text-base-content/50">{$t('wallet.defi.wizard.new_liq_price')}</span>
			<span class="font-medium tabular-nums"
				>${Math.round(_liqPriceResult.liquidationBtcPrice).toLocaleString()}</span
			>
		</div>
	{/if}

	<!-- Fee breakdown accordion -->
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

	<!-- Risk acknowledgment -->
	<label class="flex items-start gap-2 text-sm">
		<input type="checkbox" class="checkbox checkbox-sm mt-0.5" bind:checked={riskAcknowledged} />
		<span class="text-xs leading-relaxed">
			{$t('wallet.defi.wizard.risk_ack_supply')}
		</span>
	</label>

	<!-- Borrow button -->
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

<!-- Confirm modal -->
{#if showConfirmModal}
	<div class="modal modal-open">
		<div class="modal-box max-w-md">
			<h3 class="text-lg font-bold">{$t('wallet.defi.wizard.borrow_usdt0')}</h3>

			<div class="space-y-4 py-4">
				<ul class="space-y-2 text-xs leading-relaxed">
					<li class="flex items-start gap-2">
						<span
							class="bg-primary/10 text-primary mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold"
							>1</span
						>
						<span>{$t('wallet.defi.borrow.collateral_label')}</span>
					</li>
					<li class="flex items-start gap-2">
						<span
							class="bg-primary/10 text-primary mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold"
							>2</span
						>
						<span>{$t('wallet.defi.borrow.amount_label')}</span>
					</li>
				</ul>

				<div class="border-primary bg-base-100 space-y-2 rounded-lg border p-3 text-sm">
					<div class="flex items-center justify-between">
						<span>{$t('wallet.defi.wizard.confirm_avail_borrow')}</span>
						<span class="font-medium tabular-nums">${availableBorrowsUsd.toFixed(2)}</span>
					</div>
					<div class="flex items-center justify-between">
						<span>{$t('wallet.defi.wizard.resulting_debt')}</span>
						<span class="font-medium tabular-nums">${projectedDebtUsd.toFixed(2)}</span>
					</div>
					<div class="flex items-center justify-between">
						<span>{$t('wallet.defi.borrow.interest_rate')}</span>
						<span class="tabular-nums">{borrowAPR.toFixed(2)}% APR</span>
					</div>
					<div class="flex items-center justify-between">
						<span>{$t('wallet.defi.borrow.annual_cost')}</span>
						<span class="tabular-nums">${annualCost.toFixed(2)}</span>
					</div>
				</div>

				{#if confirmError}
					<div class="alert alert-error py-2">
						<span class="text-sm">{confirmError}</span>
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
								<span>{$t('wallet.defi.wizard.supply_confirmed')}</span>
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
				<button
					class="btn btn-ghost"
					onclick={() => (showConfirmModal = false)}
					disabled={isProcessing}
				>
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
		</div>
		<button
			class="modal-backdrop"
			onclick={() => {
				if (!isProcessing) showConfirmModal = false;
			}}
			aria-label="Close"
		></button>
	</div>
{/if}

<!-- No custom styles needed — uses Tailwind + daisyUI classes -->

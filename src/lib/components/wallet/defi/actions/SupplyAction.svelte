<script lang="ts">
	import { t } from 'svelte-i18n';
	import { ethers, Interface } from 'ethers';
	import { tryCatch } from '$lib/utils/tryCatch';
	import { walletStore, formatSats, sendArbitrumTransaction } from '$lib/stores/wallet.store';
	import { connectedWalletsStore, getEvmSigner } from '$lib/stores/connected-wallets.store';
	import { defiPositions } from '$lib/stores/defi-positions.store.svelte';
	import { btcPrice } from '$lib/runes/btcPrice.svelte';
	import { AAVE_POOL, POOL_ABI, ERC20_APPROVE_ABI, WBTC_ARBITRUM, ARB_PUBLIC_RPC } from '$lib/config/defi.constants';
	import { calculateBtcLiquidationPrice } from '$lib/services/defi/aave.service';
	import { sanitizeErrorForLog, mapDeFiErrorMessage } from '$lib/utils/defi-errors';
	import { fetchLiveFees } from '$lib/utils/swap-gas';
	import { browserNetworkStatus } from '$lib/utils/network-status';
	import { extractContractError } from '$lib/utils/wallet/contractErrorHandler';
	import * as Sentry from '@sentry/sveltekit';
	import SwapPartySelector from '$lib/components/wallet/SwapPartySelector.svelte';
	import AmountInputSection from '$lib/components/wallet/AmountInputSection.svelte';
	import LoanHealthBar from '../LoanHealthBar.svelte';
	import LoanHealthBadge from '../LoanHealthBadge.svelte';
	import type { AssetOption } from '$lib/components/wallet/AssetSelector.svelte';

	type _TxPhase = 'idle' | 'checking' | 'approving' | 'supplying' | 'done';

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

	let supplyAmount = $state('');
	let sliderPercent = $state(0);
	let displayAmount = $state('');
	let btcUsdMode = $state(false);
	let syncingFromInput = $state(false);
	let isProcessing = $state(false);
	let showConfirmModal = $state(false);
	let confirmError = $state<string | null>(null);
	let successTxHash = $state<string | null>(null);
	let txPhase: 'idle' | 'checking' | 'approving' | 'supplying' | 'done' = $state('idle');
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

	let amountSats = $derived.by(() => {
		const n = parseInt(supplyAmount, 10);
		return isFinite(n) && n > 0 ? n : 0;
	});

	let amountBtc = $derived(amountSats / 100_000_000);
	let amountUsd = $derived(amountBtc * btcPrice.price);

	let projectedCollateralUsd = $derived(currentCollateralUsd + amountUsd);
	let projectedLtvPct = $derived(
		projectedCollateralUsd > 0 ? (currentDebtUsd / projectedCollateralUsd) * 100 : 0
	);
	let projectedAvailableBorrow = $derived.by(() => {
		if (projectedCollateralUsd <= 0) return 0;
		const maxBorrow = projectedCollateralUsd * (7300 / 10_000);
		return Math.max(0, maxBorrow - currentDebtUsd);
	});
	let projectedLiqPrice = $derived.by(() => {
		if (currentDebtUsd <= 0 || projectedCollateralUsd <= 0) return 0;
		const collateralBtc = btcPrice.price > 0 ? projectedCollateralUsd / btcPrice.price : 0;
		const result = calculateBtcLiquidationPrice(
			currentDebtUsd,
			collateralBtc,
			liqThreshold,
			btcPrice.price
		);
		return result?.liquidationBtcPrice ?? 0;
	});

	let connectedWbtcSats = $derived.by(() => {
		let total = 0;
		for (const w of $connectedWalletsStore.wallets) {
			if (!w.balances) continue;
			total += Number(w.balances['wbtc-arb']?.raw ?? 0) / 10_000_000_000;
		}
		return total;
	});
	let hasWbtc = $derived(wbtcBalanceSats > 0 || connectedWbtcSats > 0);
	let gasEstimate = $state(0.12);
	let gasLoading = $state(false);

	$effect(() => {
		gasLoading = true;
		fetchLiveFees()
			.then((fees) => {
				if (fees.arbGasPriceWei && fees.ethUsdPrice) {
					const gasCostEth = Number(fees.arbGasPriceWei * 250_000n) / 1e18;
					gasEstimate = gasCostEth * fees.ethUsdPrice;
				}
			})
			.catch(() => {})
			.finally(() => {
				gasLoading = false;
			});
	});

	let canSupply = $derived(amountSats > 0 && isOnline && amountSats <= wbtcBalanceSats);

	let wbtcAssets = $derived<AssetOption[]>([
		{
			id: 'wbtc-arb',
			label: 'Bitcoin (wBTC)',
			icon: '/images/chains/arbitrum.png',
			subLabel: 'Wrapped BTC on Arbitrum',
			balance: formatSats(wbtcBalanceSats) + ' Sats',
			balanceSub: `≈ $${((wbtcBalanceSats / 100_000_000) * btcPrice.price).toFixed(2)}`
		}
	]);

	function walletBtcSatsFor(id: string): number {
		if (id === 'builtin') return wbtcBalanceSats;
		const w = $connectedWalletsStore.wallets.find((w) => w.id === id);
		if (!w?.balances) return 0;
		return Number(w.balances['wbtc-arb']?.raw ?? 0) / 10_000_000_000;
	}

	function walletUsdt0For(id: string): number {
		if (id === 'builtin') {
			return parseFloat($walletStore.arb?.formattedUsdt0Balance ?? '0') || 0;
		}
		const w = $connectedWalletsStore.wallets.find((w) => w.id === id);
		if (!w?.balances) return 0;
		return Number(w.balances['usdt0-arb']?.raw ?? 0) / 1_000_000;
	}

	$effect(() => {
		if (minimal && onProjectedValues) {
			onProjectedValues({
				collateral: projectedCollateralUsd,
				available: projectedAvailableBorrow,
				liqPrice: projectedLiqPrice || undefined
			});
		}
	});

	function handleWalletSelect(_id: string) {}

	$effect(() => {
		if (syncingFromInput) {
			syncingFromInput = false;
			return;
		}
		if (btcUsdMode) {
			const usd = amountSats > 0 ? (amountSats / 100_000_000) * btcPrice.price : 0;
			displayAmount = usd > 0 ? usd.toFixed(2) : '';
		} else {
			displayAmount = supplyAmount;
		}
	});

	function handleAmountChange(v: string) {
		syncingFromInput = true;
		const clean = v.replace(/,/g, '.');
		displayAmount = clean;

		if (btcUsdMode) {
			const usdNum = parseFloat(clean || '0');
			if (usdNum > 0 && btcPrice.price > 0) {
				const sats = Math.round((usdNum / btcPrice.price) * 100_000_000);
				supplyAmount = sats.toString();
			} else {
				supplyAmount = '';
			}
		} else {
			const sats = parseInt(clean, 10);
			supplyAmount = isFinite(sats) && sats > 0 ? sats.toString() : '';
		}

		const n = parseFloat(clean || '0');
		const satsVal = btcUsdMode
			? n > 0 && btcPrice.price > 0
				? Math.round((n / btcPrice.price) * 100_000_000)
				: 0
			: parseInt(clean, 10) || 0;
		sliderPercent =
			isFinite(satsVal) && satsVal > 0 && wbtcBalanceSats > 0
				? Math.min(100, (satsVal / wbtcBalanceSats) * 100)
				: 0;
	}

	function handleToggle(isUsd: boolean) {
		const wasUsd = btcUsdMode;
		btcUsdMode = isUsd;
		syncingFromInput = false;

		if (isUsd && !wasUsd) {
			const usd = amountSats > 0 ? (amountSats / 100_000_000) * btcPrice.price : 0;
			displayAmount = usd > 0 ? usd.toFixed(2) : '';
		} else if (!isUsd && wasUsd) {
			displayAmount = supplyAmount;
		}
	}

	function applyPercent(pct: number) {
		sliderPercent = pct;
		if (pct <= 0 || wbtcBalanceSats <= 0) {
			syncingFromInput = false;
			supplyAmount = '';
			displayAmount = '';
			return;
		}
		const sats = Math.round((wbtcBalanceSats * pct) / 100);
		supplyAmount = sats.toString();
		syncingFromInput = false;
		if (btcUsdMode) {
			displayAmount = ((sats / 100_000_000) * btcPrice.price).toFixed(2);
		} else {
			displayAmount = sats.toString();
		}
	}

	function setMax() {
		sliderPercent = 100;
		supplyAmount = wbtcBalanceSats.toString();
		syncingFromInput = false;
		if (btcUsdMode) {
			displayAmount = ((wbtcBalanceSats / 100_000_000) * btcPrice.price).toFixed(2);
		} else {
			displayAmount = wbtcBalanceSats.toString();
		}
	}

	function openConfirm() {
		confirmError = null;
		successTxHash = null;
		showConfirmModal = true;
	}

	function confirmSuccess() {
		const txHash = successTxHash;
		showConfirmModal = false;
		if (txHash) onSuccess(txHash);
		successTxHash = null;
	}

	async function checkAllowance(owner: string): Promise<bigint> {
		const normalizedOwner = ethers.getAddress(owner.toLowerCase());
		const arbProvider = new ethers.JsonRpcProvider(ARB_PUBLIC_RPC);
		const tokenContract = new ethers.Contract(WBTC_ARBITRUM, ERC20_APPROVE_ABI, arbProvider);
		const { data: allowance, error } = await tryCatch(
			tokenContract.allowance(normalizedOwner, AAVE_POOL)
		);
		if (error || allowance == null) {
			console.warn(
				'[SupplyAction] Allowance check failed, assuming zero:',
				sanitizeErrorForLog(error)
			);
			Sentry.addBreadcrumb({
				category: 'defi.supply',
				message: 'allowance check failed',
				data: {
					errorCode:
						error instanceof Error && 'code' in error
							? (error as Record<string, unknown>).code
							: 'UNKNOWN'
				}
			});
			return 0n;
		}
		return BigInt(allowance.toString());
	}

	async function sendApprove(amount: bigint): Promise<string> {
		const erc20Iface = new Interface(ERC20_APPROVE_ABI);
		const approveData = erc20Iface.encodeFunctionData('approve', [AAVE_POOL, amount]);

		if (walletId === 'builtin') {
			const { data: txHash, error: txErr } = await tryCatch(
				sendArbitrumTransaction({ to: WBTC_ARBITRUM, data: approveData, value: '0' })
			);
			if (txErr || !txHash) {
				const contractErr = extractContractError(txErr);
				console.warn('[SupplyAction] Approve failed (builtin):', sanitizeErrorForLog(txErr));
				throw new Error(contractErr.userMessage);
			}
			return txHash;
		}

		const evmSigner = getEvmSigner(walletId);
		if (!evmSigner) {
			throw new Error($t('wallet.defi.approve.error'));
		}

		const { data: result, error: txErr } = await tryCatch(
			evmSigner.sendTransaction({ to: WBTC_ARBITRUM, data: approveData, value: 0n, chainId: 42161 })
		);
		if (txErr || !result) {
			const contractErr = extractContractError(txErr);
			console.warn('[SupplyAction] Approve failed (connected):', sanitizeErrorForLog(txErr));
			throw new Error(contractErr.userMessage);
		}
		return result.txHash;
	}

	async function handleSupply() {
		if (!canSupply || isProcessing) return;
		isProcessing = true;
		confirmError = null;

		const rawAmount = BigInt(Math.min(amountSats, wbtcBalanceSats));

		try {
			txPhase = 'checking';
			const currentAllowance = await checkAllowance(address);

			if (currentAllowance < rawAmount) {
				txPhase = 'approving';
				Sentry.addBreadcrumb({
					category: 'defi.supply',
					message: 'sending approve',
					data: { amount: rawAmount.toString(), currentAllowance: currentAllowance.toString() }
				});

				const approveHash = await sendApprove(rawAmount);
				Sentry.addBreadcrumb({
					category: 'defi.supply',
					message: 'approve confirmed',
					data: { txHash: approveHash }
				});
			}

			txPhase = 'supplying';
			const poolIface = new Interface(POOL_ABI);
			const supplyData = poolIface.encodeFunctionData('supply', [
				WBTC_ARBITRUM,
				rawAmount,
				ethers.getAddress(address.toLowerCase()),
				0
			]);

			if (walletId === 'builtin') {
				const { data: txHash, error: txErr } = await tryCatch(
					sendArbitrumTransaction({ to: AAVE_POOL, data: supplyData, value: '0' })
				);

				if (txErr || !txHash) {
					const contractErr = extractContractError(txErr);
					console.warn('[SupplyAction] Supply tx failed (builtin):', sanitizeErrorForLog(txErr));
					throw new Error(contractErr.userMessage);
				}

				defiPositions.invalidate(walletId);
				txPhase = 'done';
				isProcessing = false;
				successTxHash = txHash;
				// Auto-close after 5 seconds
				setTimeout(() => {
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
					evmSigner.sendTransaction({ to: AAVE_POOL, data: supplyData, value: 0n, chainId: 42161 })
				);

				if (txErr || !result) {
					const contractErr = extractContractError(txErr);
					console.warn('[SupplyAction] Supply tx failed (connected):', sanitizeErrorForLog(txErr));
					throw new Error(contractErr.userMessage);
				}

				defiPositions.invalidate(walletId);
				txPhase = 'done';
				isProcessing = false;
				successTxHash = result.txHash;
				setTimeout(() => {
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
				`[SupplyAction] Supply flow error (phase=${txPhase}, wallet=${walletId}):`,
				sanitizeErrorForLog(err)
			);

			Sentry.addBreadcrumb({
				category: 'defi.supply',
				message: 'supply flow error',
				data: {
					phase: txPhase,
					walletId,
					errorCode: contractErr.errorCode ?? 'UNKNOWN'
				}
			});

			confirmError = mapDeFiErrorMessage(contractErr, $t);
			txPhase = 'idle';
			isProcessing = false;
		}
	}
</script>

<div class="flex flex-col gap-4">
	<p class="text-base-content/70 text-xs">{$t('wallet.defi.position.action_desc_supply')}</p>

	{#if !minimal}
		<SwapPartySelector
			label={$t('wallet.from')}
			selectedWalletId={walletId}
			onWalletSelect={handleWalletSelect}
			connectedWallets={$connectedWalletsStore.wallets}
			{walletBtcSatsFor}
			{walletUsdt0For}
			btcPrice={btcPrice.price}
			selectedAssetId="wbtc-arb"
			onAssetSelect={() => {}}
			assets={wbtcAssets}
		/>
	{/if}

	<AmountInputSection
		variant="direct"
		amount={displayAmount}
		onAmountChange={handleAmountChange}
		unit={btcUsdMode ? 'usd' : 'sats'}
		showPercentSlider={true}
		onUnitChange={() => {}}
		sliderDisabled={!hasWbtc}
		percent={sliderPercent}
		onPercentChange={applyPercent}
		onMaxAmount={async () => setMax()}
		disabled={!isOnline}
		hasInsufficientBalance={amountSats > wbtcBalanceSats}
		maxDisabled={!hasWbtc}
		supportsBtcUsdToggle={true}
		{btcUsdMode}
		onBtcUsdModeChange={handleToggle}
		btcNativeSymbol="&#x20BF;"
	/>

	{#if !hasWbtc}
		<div class="alert alert-soft alert-warning py-2 text-xs">
			{$t('wallet.defi.no_wbtc_desc')}
		</div>
	{/if}

	{#if amountSats > wbtcBalanceSats && hasWbtc}
		<div class="alert alert-soft alert-error py-2 text-xs">
			Exceeds your wallet balance of {formatSats(wbtcBalanceSats)} Sats.
		</div>
	{/if}

	{#if !minimal && (position || amountSats > 0)}
		<LoanHealthBar
			totalCollateralUsd={projectedCollateralUsd}
			totalDebtUsd={currentDebtUsd}
			availableBorrowsUsd={projectedAvailableBorrow}
		/>

		<div class="border-primary bg-base-100 rounded-lg border p-3 text-sm">
			<div class="flex items-center justify-between">
				<span>{$t('wallet.defi.wizard.confirm_tx_fee')}</span>
				<span class="tabular-nums">${gasEstimate.toFixed(2)}</span>
			</div>
		</div>
	{/if}

	<button
		type="button"
		class="btn btn-primary min-h-[48px] w-full text-base"
		disabled={!canSupply || isProcessing || !hasWbtc}
		onclick={openConfirm}
		aria-busy={isProcessing}
	>
		{#if !hasWbtc}
			{$t('wallet.defi.no_wbtc_title')}
		{:else if isProcessing}
			{$t('wallet.defi.shared.pending_tx')}
		{:else}
			{$t('wallet.defi.wizard.supply_btn', { values: { amount: formatSats(amountSats) } })}
		{/if}
	</button>
</div>

{#if showConfirmModal}
	<div class="modal modal-open">
		<div class="modal-box max-w-md">
			<h3 class="text-lg font-bold">{$t('wallet.defi.wizard.confirm_title')}</h3>

			<div class="space-y-4 py-4">
				<p class="text-sm">
					{$t('wallet.defi.position.confirm_supply_desc', {
						values: { amount: formatSats(amountSats) }
					})}
				</p>

				<LoanHealthBar
					totalCollateralUsd={projectedCollateralUsd}
					totalDebtUsd={currentDebtUsd}
					availableBorrowsUsd={projectedAvailableBorrow}
				/>

				<div class="flex items-center justify-between text-xs">
					<span class="text-base-content/60">{$t('wallet.defi.position.projected_ltv')}</span>
					<LoanHealthBadge ltvPct={projectedLtvPct} showLtv />
				</div>

				<div class="bg-base-200 space-y-1 rounded-lg p-3 text-sm">
					<div class="flex items-center justify-between">
						<span class="text-base-content/60">{$t('wallet.defi.wizard.confirm_tx_fee')}</span>
						<span class="tabular-nums">${gasEstimate.toFixed(2)}</span>
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
							{#if txPhase === 'checking'}
								<span class="loading loading-spinner loading-xs"></span>
								<span>{$t('wallet.defi.wizard.checking_allowance')}</span>
							{:else if txPhase === 'approving'}
								<span class="loading loading-spinner loading-xs"></span>
								<span>{$t('wallet.defi.wizard.approving_wbtc')}</span>
							{:else if txPhase === 'supplying'}
								<span class="loading loading-spinner loading-xs"></span>
								<span>{$t('wallet.defi.wizard.supplying_collateral')}</span>
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
							<li class="step step-primary">{$t('wallet.defi.wizard.step_check')}</li>
							<li
								class="step {txPhase === 'approving' ||
								txPhase === 'supplying' ||
								txPhase === 'done'
									? 'step-primary'
									: ''}"
							>
								{$t('wallet.defi.wizard.step_approve')}
							</li>
							<li
								class="step {txPhase === 'supplying' || txPhase === 'done' ? 'step-primary' : ''}"
							>
								{$t('wallet.defi.wizard.step_supply')}
							</li>
						</ul>
					</div>
				{/if}
			</div>

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
					<p class="text-sm font-medium">{$t('wallet.defi.wizard.supply_confirmed')}</p>
				</div>
				<div class="modal-action">
					<button class="btn btn-primary" onclick={confirmSuccess}> Done </button>
				</div>
			{:else}
				<div class="modal-action">
					<button
						class="btn btn-ghost"
						onclick={() => (showConfirmModal = false)}
						disabled={isProcessing}
					>
						{$t('common.cancel')}
					</button>
					<button class="btn btn-primary" onclick={handleSupply} disabled={isProcessing}>
						{#if isProcessing}
							<span class="loading loading-spinner loading-sm"></span>
							{#if txPhase === 'checking'}
								{$t('wallet.defi.wizard.checking_allowance')}
							{:else if txPhase === 'approving'}
								{$t('wallet.defi.wizard.approve_wbtc')}
							{:else if txPhase === 'supplying'}
								{$t('wallet.defi.shared.pending_tx')}
							{:else}
								{$t('wallet.defi.wizard.confirm_supply')}
							{/if}
						{:else}
							{$t('wallet.defi.wizard.confirm_supply')}
						{/if}
					</button>
				</div>
			{/if}
		</div>
		<button
			class="modal-backdrop"
			onclick={() => {
				if (!isProcessing && !successTxHash) showConfirmModal = false;
			}}
			aria-label="Close"
		></button>
	</div>
{/if}

<script lang="ts">
	import { t } from 'svelte-i18n';
	import { ethers, Interface } from 'ethers';
	import { tryCatch } from '$lib/utils/tryCatch';
	import { walletStore, formatSats, sendArbitrumTransaction } from '$lib/stores/wallet.store';
	import { connectedWalletsStore, getEvmSigner } from '$lib/stores/connected-wallets.store';
	import { defiPositions } from '$lib/stores/defi-positions.store.svelte';
	import { btcPrice } from '$lib/runes/btcPrice.svelte';
	import { AaveService } from '$lib/services/defi/aave.service';
	import { AAVE_POOL, ARB_PUBLIC_RPC, WBTC_ARBITRUM, POOL_ABI, ERC20_APPROVE_ABI } from '$lib/config/defi.constants';
	import { sanitizeErrorForLog, mapDeFiErrorMessage } from '$lib/utils/defi-errors';
	import { fetchLiveFees } from '$lib/utils/swap-gas';
	import { browserNetworkStatus } from '$lib/utils/network-status';
	import { extractContractError } from '$lib/utils/wallet/contractErrorHandler';
	import * as Sentry from '@sentry/sveltekit';
	import SwapPartySelector from '$lib/components/wallet/SwapPartySelector.svelte';
	import AmountInputSection from '$lib/components/wallet/AmountInputSection.svelte';
	import LoanHealthBar from '../LoanHealthBar.svelte';
	import type { AssetOption } from '$lib/components/wallet/AssetSelector.svelte';

	/** Transaction phase: idle → checking allowance → approving → supplying → done */
	type _TxPhase = 'idle' | 'checking' | 'approving' | 'supplying' | 'done';

	interface Props {
		walletId: string;
		address: string;
		supplyAmount: string;
		onAmountChange: (amount: string) => void;
		onSupplyComplete: (txHash: string) => void;
		onInfoReady?: () => void;
		onGetWbtc?: () => void;
		onBuyWbtc?: () => void;
		infoDismissed?: boolean;
	}

	let {
		walletId,
		address,
		supplyAmount,
		onAmountChange,
		onSupplyComplete,
		onInfoReady,
		onGetWbtc,
		onBuyWbtc,
		infoDismissed = false
	}: Props = $props();

	let isProcessing = $state(false);
	let txPhase: _TxPhase = $state('idle');
	let sliderPercent = $state(0);
	let btcUsdMode = $state(false);
	let syncingFromInput = false;
	let displayAmount = $state('');
	let showConfirmModal = $state(false);
	let confirmError = $state<string | null>(null);
	let isOnline = $derived($browserNetworkStatus.online);

	let wbtcBalance = $derived($walletStore.arb?.formattedWbtcBalance ?? '0');
	let wbtcBalanceNum = $derived(parseFloat(wbtcBalance) || 0);
	let wbtcBalanceSats = $derived(Math.round(wbtcBalanceNum * 100_000_000));

	let position = $derived(
		walletId === 'builtin' ? defiPositions.aavePositions.get('builtin') : null
	);

	let currentCollateralUsd = $derived(position?.totalCollateralUsd ?? 0);
	let currentDebtUsd = $derived(position?.totalDebtUsd ?? 0);

	// supplyAmount is in sats
	let amountSats = $derived.by(() => {
		const n = parseInt(supplyAmount, 10);
		return isFinite(n) && n > 0 ? n : 0;
	});

	let amountBtc = $derived(amountSats / 100_000_000);
	let amountUsd = $derived(amountBtc * btcPrice.price);

	let projectedCollateralUsd = $derived(currentCollateralUsd + amountUsd);
	let reserveLtvBps = $state(7300);
	let projectedAvailableBorrow = $derived.by(() => {
		if (projectedCollateralUsd <= 0) return 0;
		const maxBorrow = projectedCollateralUsd * (reserveLtvBps / 10_000);
		return Math.max(0, maxBorrow - currentDebtUsd);
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
		const provider = new ethers.JsonRpcProvider(ARB_PUBLIC_RPC);
		const aave = new AaveService(provider);
		aave.getReserveConfig(WBTC_ARBITRUM).then((config) => {
			reserveLtvBps = config.ltv;
		}).catch(() => {});
	});

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

	let canSupply = $derived(amountSats > 0 && hasWbtc && isOnline && amountSats <= wbtcBalanceSats);

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
				onAmountChange(sats.toString());
			} else {
				onAmountChange('');
			}
		} else {
			const sats = parseInt(clean, 10);
			onAmountChange(isFinite(sats) && sats > 0 ? sats.toString() : '');
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
			onAmountChange('');
			displayAmount = '';
			return;
		}
		const sats = Math.round((wbtcBalanceSats * pct) / 100);
		onAmountChange(sats.toString());
		syncingFromInput = false;
		if (btcUsdMode) {
			displayAmount = ((sats / 100_000_000) * btcPrice.price).toFixed(2);
		} else {
			displayAmount = sats.toString();
		}
	}

	function setMax() {
		sliderPercent = 100;
		onAmountChange(wbtcBalanceSats.toString());
		syncingFromInput = false;
		if (btcUsdMode) {
			displayAmount = ((wbtcBalanceSats / 100_000_000) * btcPrice.price).toFixed(2);
		} else {
			displayAmount = wbtcBalanceSats.toString();
		}
	}

	function openConfirm() {
		confirmError = null;
		showConfirmModal = true;
	}

	/**
	 * Check ERC-20 allowance for the AAVE Pool. Returns the current allowance
	 * as a bigint. For the built-in wallet, reads via Arbitrum JSON-RPC. For
	 * connected wallets, reads via the wallet's provider.
	 */
	async function checkAllowance(owner: string): Promise<bigint> {
		const normalizedOwner = ethers.getAddress(owner.toLowerCase());
		const arbProvider = new ethers.JsonRpcProvider(ARB_PUBLIC_RPC);
		const tokenContract = new ethers.Contract(WBTC_ARBITRUM, ERC20_APPROVE_ABI, arbProvider);
		const { data: allowance, error } = await tryCatch(
			tokenContract.allowance(normalizedOwner, AAVE_POOL)
		);
		if (error || allowance == null) {
			console.warn(
				'[SupplyCollateralStep] Allowance check failed, assuming zero:',
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
			// If we can't check allowance, assume zero so we approve
			return 0n;
		}
		return BigInt(allowance.toString());
	}

	/**
	 * Send an ERC-20 approve tx for the AAVE Pool.
	 * Built-in wallet → sendArbitrumTransaction (gasless-first).
	 * Connected wallet → evmSigner.sendTransaction.
	 * Throws with a human-friendly message on failure.
	 */
	async function sendApprove(amount: bigint): Promise<string> {
		const erc20Iface = new Interface(ERC20_APPROVE_ABI);
		const approveData = erc20Iface.encodeFunctionData('approve', [AAVE_POOL, amount]);

		if (walletId === 'builtin') {
			const { data: txHash, error: txErr } = await tryCatch(
				sendArbitrumTransaction({ to: WBTC_ARBITRUM, data: approveData, value: '0' })
			);
			if (txErr || !txHash) {
				const contractErr = extractContractError(txErr);
				console.warn(
					'[SupplyCollateralStep] Approve failed (builtin):',
					sanitizeErrorForLog(txErr)
				);
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
			console.warn(
				'[SupplyCollateralStep] Approve failed (connected):',
				sanitizeErrorForLog(txErr)
			);
			throw new Error(contractErr.userMessage);
		}
		return result.txHash;
	}

	/**
	 * Supply flow: check allowance → approve if needed → supply.
	 * Updates txPhase for progress UI.
	 */
	async function handleSupply() {
		if (!canSupply || isProcessing) return;
		isProcessing = true;
		confirmError = null;

		const rawAmount = BigInt(amountSats);

		try {
			// Phase 1: Check current allowance
			txPhase = 'checking';
			const currentAllowance = await checkAllowance(address);

			// Phase 2: Approve if allowance is insufficient
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

			// Phase 3: Supply collateral
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
					console.warn(
						'[SupplyCollateralStep] Supply tx failed (builtin):',
						sanitizeErrorForLog(txErr)
					);
					throw new Error(contractErr.userMessage);
				}

				defiPositions.invalidate(walletId);
				txPhase = 'done';
				isProcessing = false;
				showConfirmModal = false;
				onSupplyComplete(txHash);
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
					console.warn(
						'[SupplyCollateralStep] Supply tx failed (connected):',
						sanitizeErrorForLog(txErr)
					);
					throw new Error(contractErr.userMessage);
				}

				defiPositions.invalidate(walletId);
				txPhase = 'done';
				isProcessing = false;
				showConfirmModal = false;
				onSupplyComplete(result.txHash);
			}
		} catch (err) {
			const contractErr = extractContractError(err);

			// Log sanitized error to console — no tx hex, no addresses, no keys
			console.error(
				`[SupplyCollateralStep] Supply flow error (phase=${txPhase}, wallet=${walletId}):`,
				sanitizeErrorForLog(err)
			);

			// Sentry breadcrumb with error code + phase (no raw message with sensitive data)
			Sentry.addBreadcrumb({
				category: 'defi.supply',
				message: 'supply flow error',
				data: {
					phase: txPhase,
					walletId,
					errorCode: contractErr.errorCode ?? 'UNKNOWN'
				}
			});

			// Show human-friendly message to the user (Arbitrum-aware, not RBTC-centric)
			confirmError = mapDeFiErrorMessage(contractErr, $t);
			txPhase = 'idle';
			isProcessing = false;
		}
	}
</script>

<div class="flex flex-col gap-4">
	<h3 class="text-base font-semibold">{$t('wallet.defi.wizard.supply_collateral')}</h3>

	{#if !infoDismissed}
		<div class="bg-primary/5 border-primary/30 rounded-lg border p-4">
			<div class="flex items-center gap-3">
				<div
					class="bg-primary text-primary-content flex h-9 w-9 shrink-0 items-center justify-center rounded-lg shadow-sm"
				>
					<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M13 10V3L4 14h7v7l9-11h-7z"
						/>
					</svg>
				</div>
				<p class="text-primary text-base font-bold tracking-tight">
					{$t('wallet.defi.wizard.loan_pitch_title')}
				</p>
			</div>
			<ul class="mt-3 space-y-2 text-xs leading-relaxed">
				<li class="flex items-start gap-2.5">
					<svg
						class="text-primary mt-0.5 h-3.5 w-3.5 shrink-0"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
						/>
					</svg>
					<span>{$t('wallet.defi.wizard.loan_pitch_bullet_1')}</span>
				</li>
				<li class="flex items-start gap-2.5">
					<svg
						class="text-primary mt-0.5 h-3.5 w-3.5 shrink-0"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
						/>
					</svg>
					<span>{$t('wallet.defi.wizard.loan_pitch_bullet_2')}</span>
				</li>
				<li class="flex items-start gap-2.5">
					<svg
						class="text-primary mt-0.5 h-3.5 w-3.5 shrink-0"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
						/>
					</svg>
					<span>{$t('wallet.defi.wizard.loan_pitch_bullet_3')}</span>
				</li>
			</ul>
		</div>

		<div class="border-primary/20 bg-base-100 rounded-lg border p-3.5">
			<div class="flex items-center gap-2">
				<svg
					class="text-base-content/40 h-4 w-4 shrink-0"
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
					/>
				</svg>
				<p class="text-sm font-medium">{$t('wallet.defi.wizard.how_it_works_title')}</p>
			</div>
			<ul class="mt-2.5 space-y-2 text-xs leading-relaxed">
				<li class="flex items-start gap-2">
					<span
						class="bg-primary/10 text-primary mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold"
						>1</span
					>
					<span>{$t('wallet.defi.wizard.how_bullet_1')}</span>
				</li>
				<li class="flex items-start gap-2">
					<span
						class="bg-primary/10 text-primary mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold"
						>2</span
					>
					<span>{$t('wallet.defi.wizard.how_bullet_2')}</span>
				</li>
				<li class="flex items-start gap-2">
					<span
						class="bg-primary/10 text-primary mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold"
						>3</span
					>
					<span>{$t('wallet.defi.wizard.how_bullet_3')}</span>
				</li>
			</ul>
			<div class="mt-3 flex justify-center">
				<button
					type="button"
					class="btn btn-primary btn-sm min-w-[120px]"
					onclick={() => {
						infoDismissed = true;
						onInfoReady?.();
					}}
				>
					{$t('wallet.defi.wizard.got_it')}
				</button>
			</div>
		</div>
	{:else}
		<div class="animate-fade-in flex flex-col gap-4">
			{#if !hasWbtc}
				<div class="border-warning/30 bg-base-100 rounded-lg border p-4">
					<div class="flex items-start gap-3">
						<div
							class="bg-warning/10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
						>
							<svg
								class="text-warning h-5 w-5"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
								/>
							</svg>
						</div>
						<div class="flex flex-col gap-1">
							<p class="text-sm font-semibold">{$t('wallet.defi.no_wbtc_title')}</p>
							<p class="text-base-content/70 text-xs leading-relaxed">
								{$t('wallet.defi.no_wbtc_desc')}
							</p>
						</div>
					</div>
					<div class="mt-3 flex gap-2">
						<button
							type="button"
							class="btn btn-outline btn-sm flex-1"
							onclick={() => onGetWbtc?.()}
						>
							{$t('wallet.defi.swap_wbtc')}
						</button>
						<button
							type="button"
							class="btn btn-primary btn-sm flex-1"
							onclick={() => onBuyWbtc?.()}
						>
							{$t('wallet.defi.buy_wbtc')}
						</button>
					</div>
				</div>
			{/if}

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
				btcNativeSymbol="₿"
			/>

			{#if position || amountSats > 0}
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
				disabled={!canSupply || isProcessing}
				onclick={openConfirm}
				aria-busy={isProcessing}
			>
				{isProcessing
					? $t('wallet.defi.shared.pending_tx')
					: $t('wallet.defi.wizard.supply_btn', { values: { amount: formatSats(amountSats) } })}
			</button>
		</div>
	{/if}
</div>

{#if showConfirmModal}
	<div class="modal modal-open">
		<div class="modal-box max-w-md">
			<h3 class="text-lg font-bold">{$t('wallet.defi.wizard.confirm_title')}</h3>

			<div class="space-y-4 py-4">
				<ul class="space-y-2 text-xs leading-relaxed">
					<li class="flex items-start gap-2">
						<span
							class="bg-primary/10 text-primary mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold"
							>1</span
						>
						<span>{$t('wallet.defi.wizard.confirm_bullet_1')}</span>
					</li>
					<li class="flex items-start gap-2">
						<span
							class="bg-primary/10 text-primary mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold"
							>2</span
						>
						<span>{$t('wallet.defi.wizard.confirm_bullet_2')}</span>
					</li>
					<li class="flex items-start gap-2">
						<span
							class="bg-primary/10 text-primary mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold"
							>3</span
						>
						<span>{$t('wallet.defi.wizard.confirm_bullet_3')}</span>
					</li>
				</ul>

				<div class="border-primary bg-base-100 space-y-2 rounded-lg border p-3 text-sm">
					<div class="flex items-center justify-between">
						<span>{$t('wallet.defi.wizard.confirm_new_collateral')}</span>
						<span class="font-medium tabular-nums"
							>{formatSats(Math.round((projectedCollateralUsd / btcPrice.price) * 100_000_000))} Sats
							<span class="text-base-content/50">(${projectedCollateralUsd.toFixed(2)})</span></span
						>
					</div>
					<div class="flex items-center justify-between">
						<span>{$t('wallet.defi.wizard.confirm_avail_borrow')}</span>
						<span class="font-medium tabular-nums">${projectedAvailableBorrow.toFixed(2)}</span>
					</div>
					<div class="flex items-center justify-between">
						<span>{$t('wallet.defi.wizard.confirm_tx_fee')}</span>
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

<style>
	.animate-fade-in {
		animation: fadeIn 300ms ease-out;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}
</style>

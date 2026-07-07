<script lang="ts">
	import { t, locale } from 'svelte-i18n';
	import { fly } from 'svelte/transition';
	import { onMount } from 'svelte';
	import { get } from 'svelte/store';
	import { walletManager } from '$lib/stores/wallet.store';
	import { type SourceWallet } from '$lib/services/route-resolver';
	import { onSwapProgress, type SwapProgressStep } from '$lib/services/swap-chain.service';
	import type { SmartRoute } from '$lib/services/SmartRouter';
	import { reconnectPersistedWallets } from '$lib/services/external-wallet/reconnect';
	import { connectedWalletsStore } from '$lib/stores/connected-wallets.store';
	import { createDebug } from '$lib/utils/debug';
	import Drawer from '$lib/components/Drawer.svelte';
	import { browserNetworkStatus } from '$lib/utils/network-status';
	import * as Sentry from '@sentry/sveltekit';
	import { triggerHaptic, ImpactStyle } from '$lib/utils/helpers/haptics';
	import { btcPrice } from '$lib/runes/btcPrice.svelte';
	import { useSwapWallets } from '$lib/runes/use-swap-wallets.svelte';
	import { useSwapCalculator } from '$lib/runes/use-swap-calculator.svelte';
	import { useSwapRoutes } from '$lib/runes/use-swap-routes.svelte';
	import { useSwapOptions, type DestType } from '$lib/runes/use-swap-options.svelte';
	import { useSwapInput } from '$lib/runes/use-swap-input.svelte';
	import { useSwapBalanceCheck } from '$lib/runes/use-swap-balance-check.svelte';
	import SwapConfirmPhase from '$lib/components/wallet/SwapConfirmPhase.svelte';
	import SwapFormPhase from '$lib/components/wallet/SwapFormPhase.svelte';
	import { sanitizeSwapError } from '$lib/utils/swap-error';
	import {
		executeSwapChain,
		resolveDestAddress,
		type SwapExecutionResult
	} from '$lib/services/swap-execution.service';
	import {
		isBitcoinAsset,
		formatProviderLabel,
		SOURCE_TO_SAME_DEST,
		DEST_TO_SOURCE,
		SOURCE_TO_DEST
	} from '$lib/utils/swap-helpers';
	import { blockchainToastStore } from '$lib/stores/wallet/blockchain-toast.store';
	import { REQUIRED_CONFIRMATIONS } from '$lib/utils/wallet/chain-confirmations';
	import { getAssetForNetwork, getSourceAddress } from '$lib/utils/wallet/toast-helpers';
	import { mapErrorToKey } from '$lib/utils/wallet/error-mapping';

	const d = createDebug('swap');

	// -----------------------------------------------------------------------
	// Props
	// -----------------------------------------------------------------------
	let { isOpen, onClose, defaultDestType } = $props<{
		isOpen: boolean;
		onClose: () => void;
		defaultDestType?: DestType;
	}>();

	// -----------------------------------------------------------------------
	// Locale-aware formatters
	// -----------------------------------------------------------------------
	const satsFormatter = $derived(new Intl.NumberFormat($locale ?? 'en'));
	const usdFormatter = $derived(
		new Intl.NumberFormat($locale ?? 'en', {
			style: 'currency',
			currency: 'USD'
		})
	);

	// -----------------------------------------------------------------------
	// Phase / execution state
	// -----------------------------------------------------------------------
	let sourceType = $state<SourceWallet>('rbtc');
	let destType = $state<DestType>('usdt0-arb');
	let swapPhase = $state<'form' | 'confirm' | 'executing' | 'complete' | 'failed'>('form');
	let errorMessage = $state('');
	let _swapResult = $state<{ txHash?: string; swapId?: string } | null>(null);
	let isFlipping = $state(false);
	let _flipTimer: ReturnType<typeof setTimeout> | null = null;
	let _swapProgressStep = $state<SwapProgressStep>('locking-rbtc');
	let swapProgressMessage = $state('');
	let unsubscribeProgress: (() => void) | null = null;
	let _swapTimeoutId: ReturnType<typeof setTimeout> | null = null;
	let _swapAbortController: AbortController | null = null;
	let highValueConfirmed = $state(false);

	const SWAP_TIMEOUT_MS = 20 * 60 * 1000; // 20 minutes

	function _stopProgressTracking() {
		unsubscribeProgress?.();
		unsubscribeProgress = null;
	}

	function _clearSwapTimeout() {
		if (_swapTimeoutId !== null) {
			clearTimeout(_swapTimeoutId);
			_swapTimeoutId = null;
		}
		_swapAbortController?.abort();
		_swapAbortController = null;
	}

	// Local smartRoute for SwapFallback retry injection; main route state in swapRoutes rune.
	let smartRoute = $state<SmartRoute | null>(null);

	let isOnline = $derived($browserNetworkStatus.online);

	// -----------------------------------------------------------------------
	// Wallet accordion state
	// -----------------------------------------------------------------------
	let sourceWallet = $state<'builtin' | string>('builtin');
	let destWallet = $state<'builtin' | string>('builtin');

	let isConnectedSource = $derived(sourceWallet !== 'builtin');

	const swapWallets = useSwapWallets({
		getSourceWalletId: () => sourceWallet,
		getDestWalletId: () => destWallet,
		getSourceType: () => sourceType,
		getDestType: () => destType,
		getTranslation: (key: string) => get(t)(key)
	});

	/** Whether a connected wallet supports BTC on-chain signing */
	function _walletHasBtcSigner(walletId: string): boolean {
		if (walletId === 'builtin') return false;
		const w = $connectedWalletsStore.wallets.find((w) => w.id === walletId);
		if (!w) return false;
		return (
			(w.walletType === 'trezor' ||
				w.walletType === 'ledger' ||
				w.walletType === 'walletconnect') &&
			!!w.btcAddress
		);
	}
	let sourceWalletHasBtcSigner = $derived(_walletHasBtcSigner(sourceWallet));
	let destWalletHasBtcSigner = $derived(_walletHasBtcSigner(destWallet));

	/** Map SourceWallet type to network key for toast registration. */
	function _mapSourceToNetwork(type: SourceWallet): string {
		switch (type) {
			case 'rbtc':
				return 'rootstock-bitcoin';
			case 'usdt0-arb':
				return 'usdt-arbitrum';
			case 'wbtc-arb':
				return 'rootstock-bitcoin';
			case 'tbtc-arb':
				return 'rootstock-bitcoin';
			case 'btc-onchain':
				return 'bitcoin';
			default:
				return 'rootstock-bitcoin';
		}
	}

	const swapOptions = useSwapOptions({
		getSourceType: () => sourceType,
		getDestType: () => destType,
		getSourceWallet: () => sourceWallet,
		getDestWallet: () => destWallet,
		getBtcPrice: () => btcPrice.price,
		getDestWalletHasBtcSigner: () => destWalletHasBtcSigner,
		getSourceWalletHasBtcSigner: () => sourceWalletHasBtcSigner,
		getSwapSourceBalances: () => swapWallets.sourceBalances,
		getSwapDestBalances: () => swapWallets.destBalances,
		getExternalBtcBalanceSats: () => swapWallets.externalBtcBalanceSats
	});

	// -----------------------------------------------------------------------
	// Input rune (prices, fee refresh, USD/sats conversion, isBtcSource)
	// Declared before swapCalc so it can own btcUsdPrice; forward-refs swapCalc
	// amount via lazy getters (evaluated after script block completes).
	// -----------------------------------------------------------------------
	const swapInput = useSwapInput({
		getSourceType: () => sourceType,
		getIsOnline: () => isOnline,
		getAmount: () => swapCalc.amount,
		getAmountInTokenUnits: () => swapCalc.amountInTokenUnits,
		getIsOpen: () => isOpen,
		getDefaultDestType: () => defaultDestType,
		setAmount: (v: string) => {
			swapCalc.amount = v;
		},
		setDestType: (v: DestType) => {
			destType = v;
		}
	});

	const swapCalc = useSwapCalculator({
		getWalletBalanceToken: () => {
			if (sourceType === 'rbtc') {
				return (
					(sourceWallet === 'builtin'
						? swapOptions.builtinRbtcSats
						: swapWallets.sourceBalances.rbtcSats) / 100_000_000
				);
			}
			if (sourceType === 'wbtc-arb') {
				return (
					(sourceWallet === 'builtin'
						? swapOptions.builtinWbtcSats
						: swapWallets.sourceBalances.wbtcSats) / 100_000_000
				);
			}
			if (sourceType === 'tbtc-arb') {
				return (
					(sourceWallet === 'builtin'
						? swapOptions.builtinTbtcSats
						: swapWallets.sourceBalances.tbtcSats) / 100_000_000
				);
			}
			if (sourceType === 'btc-onchain') {
				return (sourceWallet === 'builtin' ? 0 : swapWallets.externalBtcBalanceSats) / 100_000_000;
			}
			return sourceWallet === 'builtin'
				? swapOptions.builtinUsdt0
				: swapWallets.sourceBalances.usdt0;
		},
		getSourceType: () => sourceType,
		getBtcUsdPrice: () => swapInput.btcUsdPrice,
		getIsOnline: () => isOnline
	});

	const swapRoutes = useSwapRoutes({
		getSourceType: () => sourceType,
		getDestType: () => destType,
		getAmountSats: () => swapCalc.amountSats,
		getSourceAddr: () => swapWallets.sourceAddr,
		getIsOnline: () => isOnline,
		getBtcUsdPrice: () => swapInput.btcUsdPrice,
		getEthUsdPrice: () => swapInput.ethUsdPrice,
		getRskGasWei: () => swapInput.rskGasPriceWei,
		getArbGasWei: () => swapInput.arbGasPriceWei,
		// For non-BTC sources (USDT0, etc.), pass the raw amount in the source
		// token's smallest unit. The route engine's satsToTokenAmount() does a
		// pure decimal conversion that is wrong for stablecoins.
		getSourceAmountRaw: () => {
			if (swapInput.isBtcSource) return undefined;
			const units = swapCalc.amountInTokenUnits;
			if (units <= 0) return undefined;
			const decimals = sourceType === 'usdt0-arb' ? 6 : sourceType === 'wbtc-arb' ? 8 : 18;
			const [whole, frac = ''] = units.toFixed(decimals).split('.');
			return BigInt(whole + frac.padEnd(decimals, '0')).toString();
		}
	});

	// -----------------------------------------------------------------------
	// Balance check rune (validation, Arb ETH check, canSwap gate)
	// -----------------------------------------------------------------------
	const balanceCheck = useSwapBalanceCheck({
		getSourceType: () => sourceType,
		getDestType: () => destType,
		getSourceWallet: () => sourceWallet,
		getDestWallet: () => destWallet,
		getSourceAddr: () => swapWallets.sourceAddr,
		getSmartRoute: () => smartRoute,
		getEngineResult: () => swapRoutes.engineResult,
		getMinSwapSats: () => swapRoutes.minSwapSats,
		getAmountSats: () => swapCalc.amountSats,
		getIsInsufficientBalance: () => swapCalc.isInsufficientBalance,
		getAmountInTokenUnits: () => swapCalc.amountInTokenUnits,
		getRouteLoading: () => swapRoutes.routeLoading,
		getEstimatedOutput: () => swapRoutes.estimatedOutput,
		getIsValidAmount: () => swapCalc.isValidAmount,
		getIsOnline: () => isOnline,
		getIsFormPhase: () => swapPhase === 'form'
	});

	// Re-export pure from calc for template (satsUsd used in labels).
	const satsUsd = swapCalc.satsUsd;

	let effectiveSmartRoute = $derived(smartRoute);

	let sourceAsset = $derived(swapOptions.sourceAsset);
	let sourceIcon = $derived(swapOptions.sourceIcon);
	let visibleDestOptions = $derived(swapOptions.visibleDestOptions);
	let selectedDest = $derived(swapOptions.selectedDest);
	let destAssets = $derived(swapOptions.destAssets);
	let sourceAssets = $derived(swapOptions.sourceAssets);
	const walletBtcSatsForFn = swapOptions.walletBtcSatsFor;
	const walletUsdt0ForFn = swapOptions.walletUsdt0For;

	let walletBalanceToken = $derived(swapCalc.walletBalanceToken.toFixed(6));

	let amountSats = $derived(swapCalc.amountSats);
	let isInsufficientBalance = $derived(swapCalc.isInsufficientBalance);
	let amountInTokenUnits = $derived(swapCalc.amountInTokenUnits);
	let walletBalanceDisplay = $derived(swapCalc.walletBalanceDisplay);
	let estimatedOutput = $derived(swapRoutes.estimatedOutput);
	let totalFeeSats = $derived(swapRoutes.totalFeeSats);
	let minSwapSats = $derived(swapRoutes.minSwapSats);

	let swapAmountUSD = $derived(
		swapCalc.amountSats > 0 && btcPrice.price > 0
			? (swapCalc.amountSats / 100_000_000) * btcPrice.price
			: 0
	);
	let showHighValueWarning = $derived(swapAmountUSD > 1000 && !highValueConfirmed);

	let minSliderPercent = $derived.by(() => {
		if (minSwapSats <= 0) return 0;
		const bal = swapCalc.walletBalanceToken;
		if (bal <= 0) return 0;
		const maxSats = Math.floor(bal * 100_000_000);
		if (maxSats <= 0) return 0;
		return Math.min(100, Math.ceil((minSwapSats / maxSats) * 100));
	});

	let _lastSourceTypeForMin = $state<string>('');
	let _lastDestTypeForMin = $state<string>('');
	$effect(() => {
		const src = sourceType;
		const dst = destType;
		const min = minSwapSats;

		// Only auto-fill when source/dest actually changed (not on every amount change)
		const srcChanged = src !== _lastSourceTypeForMin;
		const dstChanged = dst !== _lastDestTypeForMin;
		_lastSourceTypeForMin = src;
		_lastDestTypeForMin = dst;

		if (min <= 0) return;
		if (!srcChanged && !dstChanged) return;

		const currentSats = swapCalc.amountSats;
		if (currentSats < min) {
			d.log('Auto-filling minimum: %d → %d sats (asset changed)', currentSats, min);
			swapCalc.amount = min.toString();
		}
	});

	$effect(() => {
		const available = visibleDestOptions;
		if (available.length > 0 && !available.find((o) => o.id === destType)) {
			d.log(
				'destType auto-selected: %s → %s (options: %s)',
				destType,
				available[0]!.id,
				available.map((o) => o.id).join(',')
			);
			destType = available[0]!.id;
		}
	});

	$effect(() => {
		if (!isOpen) return;
		smartRoute = null;
		errorMessage = '';
		highValueConfirmed = false;
		Sentry.addBreadcrumb({
			category: 'wallet.swap',
			message: 'Swap drawer opened',
			data: { sourceType, destType }
		});
	});

	$effect(() => {
		return () => {
			_stopProgressTracking();
			_clearSwapTimeout();
			if (_flipTimer) clearTimeout(_flipTimer);
		};
	});

	onMount(async () => {
		reconnectPersistedWallets();
		Sentry.addBreadcrumb({
			category: 'wallet.swap',
			message: 'SwapForm mounted',
			data: { sourceType, destType }
		});
		// Fire-and-forget: prices/gas are non-blocking for initial render.
		// The swapInput's $effect re-fetches on every drawer open anyway.
		swapInput.refreshLiveFees();
	});

	// -----------------------------------------------------------------------
	// Methods
	// -----------------------------------------------------------------------
	function swapDirection() {
		triggerHaptic(ImpactStyle.Light);

		const prevSource = sourceType;
		const prevDest = destType;
		const prevSourceWallet = sourceWallet;
		const prevDestWallet = destWallet;

		const reverseSource = DEST_TO_SOURCE[prevDest] ?? 'rbtc';

		const validSourceAssets = sourceAssets.map((a) => a.id);
		if (!validSourceAssets.includes(reverseSource)) {
			d.log('swapDirection: reverse source %s not in sourceAssets, skipping', reverseSource);
			return;
		}

		Sentry.addBreadcrumb({
			category: 'wallet.swap',
			message: 'swap direction flipped',
			data: { from: `${prevSourceWallet}/${prevSource}`, to: `${prevDestWallet}/${prevDest}` }
		});

		isFlipping = true;
		d.log('swapDirection: %s/%s ↔ %s/%s', prevSourceWallet, prevSource, prevDestWallet, prevDest);
		if (_flipTimer) clearTimeout(_flipTimer);
		_flipTimer = setTimeout(() => (isFlipping = false), 300);

		// Swap wallets and assets
		sourceWallet = prevDestWallet;
		destWallet = prevSourceWallet;
		sourceType = reverseSource as SourceWallet;
		// New dest = DestType equivalent of the previous source
		destType = (SOURCE_TO_DEST[prevSource] as DestType) ?? 'rbtc-rsk';

		// Validate dest is available for new source, auto-correct if not
		const available = visibleDestOptions;
		if (available.length > 0 && !available.find((o) => o.id === destType)) {
			destType = available[0]!.id;
		}

		swapCalc.resetAmount();
		swapInput.resetInputMode();
		smartRoute = null;
		errorMessage = '';
		swapPhase = 'form';
		swapRoutes.clearRoutes();
	}

	function setMaxAmount() {
		triggerHaptic(ImpactStyle.Light);
		Sentry.addBreadcrumb({
			category: 'wallet.swap',
			message: 'max amount set',
			data: { sourceType, balance: walletBalanceToken }
		});
		swapCalc.setMaxAmount();
	}

	function applyPercent(pct: number) {
		swapCalc.applyPercent(pct);
	}

	// -----------------------------------------------------------------------
	// SwapFormPhase callback handlers
	// -----------------------------------------------------------------------

	/** Handles source asset change from SwapPartySelector — resets dest, amount, routes. */
	function handleSourceAssetChange(id: string) {
		if (id !== sourceType) {
			const prev = sourceType;
			sourceType = id as SourceWallet;
			if (id === 'rbtc') {
				destType = 'usdt0-arb';
			} else if (id === 'usdt0-arb') {
				destType = 'rbtc-rsk';
			} else if (id === 'btc-onchain') {
				destType = 'rbtc-rsk';
			} else if (id === 'wbtc-arb') {
				destType = 'usdt0-arb';
			} else if (id === 'tbtc-arb') {
				destType = 'usdt0-arb';
			}
			swapCalc.resetAmount();
			swapInput.resetInputMode();
			smartRoute = null;
			Sentry.addBreadcrumb({
				category: 'wallet.swap',
				message: 'source asset changed',
				data: { from: prev, to: sourceType }
			});
		}
	}

	/** Pre-swap wallets then call swapDirection (preserves original template behavior). */
	function handleSwapDirection() {
		const tmpWallet = sourceWallet;
		sourceWallet = destWallet;
		destWallet = tmpWallet;
		swapDirection();
	}

	async function goToConfirm() {
		if (!balanceCheck.canSwap) return;

		// High-value confirmation gate (L1)
		if (swapAmountUSD > 1000 && !highValueConfirmed) return;

		// Pre-check: if route needs Arbitrum ETH gas, verify balance before entering confirm
		if (
			balanceCheck.needsArbEth &&
			balanceCheck.arbEthCheckDone &&
			balanceCheck.arbEthBalance === '0'
		) {
			errorMessage = $t('wallet.swap.error.insufficient_gas');
			return;
		}

		triggerHaptic(ImpactStyle.Medium);
		Sentry.addBreadcrumb({
			category: 'wallet.swap',
			message: 'swap confirm phase',
			data: { sourceType, destType, amount: amountInTokenUnits, wallet: sourceWallet }
		});
		swapPhase = 'confirm';
		errorMessage = '';
		// Check ETH balance on Arbitrum if boltz+lifi route (needed for claiming tBTC)
		if (balanceCheck.needsArbEth) {
			balanceCheck.checkArbEthBalance();
		}
	}

	function cancelConfirm() {
		swapPhase = 'form';
		errorMessage = '';
	}

	function resetForm() {
		if (swapPhase === 'executing') return;
		swapCalc.resetAmount();
		swapInput.resetInputMode();
		smartRoute = null;
		swapPhase = 'form';
		errorMessage = '';
		_swapResult = null;
		swapRoutes.clearRoutes();
	}

	function handleClose() {
		if (swapPhase === 'executing') return;
		resetForm();
		onClose();
	}

	/**
	 * Cancel an in-progress swap. Resets UI state and clears the timeout.
	 * Safe to call during the executing phase — the swap chain service
	 * will continue in the background if it cannot be aborted, but the
	 * user is free to start a new swap.
	 */
	function _cancelSwap() {
		_clearSwapTimeout();
		_stopProgressTracking();
		swapPhase = 'form';
		errorMessage = '';
		_swapResult = null;
		d.log('Swap cancelled by user');
		Sentry.addBreadcrumb({
			category: 'wallet.swap',
			message: 'Swap cancelled by user during execution'
		});
	}

	/**
	 * Thin wrapper around executeSwapChain service.
	 * Handles UI state transitions (phase, progress, haptics) and maps
	 * the service result back to component state.
	 *
	 * A 20-minute global timeout prevents the form from getting permanently
	 * stuck in "executing" if an async operation never resolves.
	 */
	async function executeSwap() {
		if (swapPhase !== 'confirm') return;
		if (!swapCalc.amount || isInsufficientBalance) return;
		if (!swapRoutes.getExecutableRoute() && !smartRoute) return;

		swapPhase = 'executing';
		errorMessage = '';
		_swapProgressStep = 'locking-rbtc';
		swapProgressMessage = $t('wallet.swap.starting_swap');

		// Register blockchain toast for this swap
		const swapToastId = crypto.randomUUID();
		const swapNetwork = _mapSourceToNetwork(sourceType);
		blockchainToastStore.add({
			id: swapToastId,
			type: 'swap',
			status: 'confirming',
			network: swapNetwork,
			amount: swapCalc.amountSats,
			amountUSD: (swapCalc.amountSats / 100_000_000) * (swapInput.btcUsdPrice || 0),
			asset: getAssetForNetwork(swapNetwork),
			recipient: swapWallets.destAddr,
			sourceAddress: getSourceAddress(swapNetwork),
			txHash: null,
			swapId: null,
			swapType: null,
			currentBlock: null,
			requiredConfirmations: REQUIRED_CONFIRMATIONS[swapNetwork] ?? 3,
			error: null,
			errorValues: null,
			actions: []
		});

		unsubscribeProgress = onSwapProgress((step, message) => {
			_swapProgressStep = step;
			swapProgressMessage = message;
			blockchainToastStore.patch(swapToastId, {
				status: step === 'complete' ? 'success' : 'confirming'
			});
		});
		triggerHaptic(ImpactStyle.Heavy);

		d.log(
			'executeSwap: source=%s dest=%s amount=%s sourceAddr=%s destAddr=%s connected=%s',
			sourceType,
			destType,
			amountInTokenUnits,
			swapWallets.sourceAddr.substring(0, 10),
			swapWallets.destAddr.substring(0, 10),
			isConnectedSource ? sourceWallet : 'builtin'
		);

		const destAddress =
			swapWallets.destAddr || resolveDestAddress(destType, destWallet !== 'builtin', destWallet);

		const srcAddr = swapWallets.sourceAddr || '';
		if (
			srcAddr &&
			destAddress &&
			srcAddr.toLowerCase() === destAddress.toLowerCase() &&
			isDirectTransfer
		) {
			errorMessage = $t('wallet.swap.error.self_send');
			swapPhase = 'failed';
			return;
		}

		// Create abort controller for this swap execution
		_swapAbortController = new AbortController();

		// 20-minute global timeout — prevents permanent "executing" state
		const timeoutPromise = new Promise<never>((_resolve, reject) => {
			_swapTimeoutId = setTimeout(() => {
				reject(new Error('swap_timeout'));
			}, SWAP_TIMEOUT_MS);
		});

		try {
			const result: SwapExecutionResult = await Promise.race([
				executeSwapChain({
					sourceType,
					destType,
					amountInTokenUnits,
					sourceWallet,
					destWallet,
					isConnectedSource,
					execRoute: swapRoutes.getExecutableRoute(),
					smartRoute,
					destAddress,
					selectedDestId: selectedDest?.id ?? '',
					selectedDestChainId: selectedDest?.chainId ?? 42161,
					isDirectTransfer
				}),
				timeoutPromise
			]);

			_clearSwapTimeout();

			if (result.phase === 'COMPLETE') {
				_swapResult = { swapId: result.swapId, txHash: result.txHash };
				swapPhase = 'complete';
				triggerHaptic(ImpactStyle.Heavy);
				blockchainToastStore.onSuccess(swapToastId);
				// Refresh wallet balances after swap completes — cross-chain swaps
				// update balances on both source and dest chains.
				walletManager.loadAssets(true).catch((err: unknown) => {
					Sentry.captureException(err);
				});
			} else {
				errorMessage = $t(result.error || 'wallet.swap.error.swap_failed');
				swapPhase = 'failed';
				triggerHaptic(ImpactStyle.Heavy);
				const mapped = mapErrorToKey(result.error || 'swap_failed');
				blockchainToastStore.onError(swapToastId, mapped.key, mapped.values);
			}
		} catch (err) {
			_clearSwapTimeout();
			_stopProgressTracking();

			if (err instanceof Error && err.message === 'swap_timeout') {
				d.error('Swap timed out after %dms', SWAP_TIMEOUT_MS);
				errorMessage = $t('wallet.swap.error.timed_out');
				Sentry.addBreadcrumb({
					category: 'wallet.swap',
					message: 'Swap timed out',
					level: 'error',
					data: { sourceType, destType }
				});
				const mapped = mapErrorToKey('swap_timeout');
				blockchainToastStore.onError(swapToastId, mapped.key, mapped.values);
			} else {
				const errMsg = err instanceof Error ? err.message : String(err ?? '');
				if (/boltz/i.test(errMsg)) {
					errorMessage = $t('wallet.swap.error.boltz_unavailable');
				} else {
					errorMessage = sanitizeSwapError(errMsg) || $t('wallet.swap.error.swap_failed');
				}
				d.error('Swap execution failed: %s', (err as Error).message);
				const mapped = mapErrorToKey(errMsg);
				blockchainToastStore.onError(swapToastId, mapped.key, mapped.values);
			}
			swapPhase = 'failed';
			triggerHaptic(ImpactStyle.Heavy);
		}
	}

	/** Retry swap using a fallback route from SwapFallback. */
	function _retryWithFallback(route: SmartRoute) {
		smartRoute = route;
		swapPhase = 'confirm';
		errorMessage = '';
	}

	function getProviderLabel(): string {
		const p = smartRoute?.provider ?? '';
		if (p) return formatProviderLabel(p);
		// Engine's recommended Route — use label directly (already formatted by engine)
		return swapRoutes.engineResult?.recommended?.label ?? '';
	}

	// -----------------------------------------------------------------------
	// Helpers for confirm/success screens
	// -----------------------------------------------------------------------

	/** True when this is a same-asset wallet-to-wallet send (not a swap). */
	let isDirectTransfer = $derived(SOURCE_TO_SAME_DEST[sourceType] === destType);

	/** Estimated network fee in sats for direct transfers (RSK gas: 21000 gas × gas price). */
	let directTransferNetworkFeeSats = $derived.by(() => {
		if (!isDirectTransfer) return 0;
		if (sourceType === 'rbtc' || sourceType === 'btc-onchain') {
			// RSK: 21000 gas for simple transfer
			const gasUsed = 21000n;
			const feeWei = gasUsed * swapInput.rskGasPriceWei;
			return Number(feeWei / 10_000_000_000n);
		}
		if (sourceType === 'usdt0-arb') {
			// Arbitrum: ~65000 gas for ERC-20 transfer
			const gasUsed = 65000n;
			const feeWei = gasUsed * swapInput.arbGasPriceWei;
			return Number(feeWei / 10_000_000_000n);
		}
		return 0;
	});

	let sourceWalletInfo = $derived(swapWallets.sourceWalletInfo);
	let destWalletInfo = $derived(swapWallets.destWalletInfo);

	// Wallet type/address for confirm card WalletIcon display
	function _connectedWalletInfo(walletId: string): { type: string; address: string } | undefined {
		if (walletId === 'builtin') return undefined;
		const w = $connectedWalletsStore.wallets.find((w) => w.id === walletId);
		return w ? { type: w.walletType, address: w.address } : undefined;
	}
	let _sourceWalletInfo = $derived(_connectedWalletInfo(sourceWallet));
	let _destWalletInfo = $derived(_connectedWalletInfo(destWallet));
	let sourceWalletType = $derived(_sourceWalletInfo?.type);
	let sourceWalletAddress = $derived(_sourceWalletInfo?.address);
	let destWalletType = $derived(_destWalletInfo?.type);
	let destWalletAddress = $derived(_destWalletInfo?.address);

	// Asset display name for confirm card
	let sourceAssetName = $derived.by(() => {
		const opt = sourceAssets.find((a) => a.id === sourceType);
		return opt?.label ?? sourceAsset;
	});
	let destAssetName = $derived.by(() => {
		if (!selectedDest) return '';
		// Use destAssets label (matches accordion: "USD", "Bitcoin (rBTC)") not destOptions label ("Arbitrum", "Rootstock")
		const opt = destAssets.find((a) => a.id === selectedDest.id);
		return opt?.label ?? selectedDest.asset;
	});
</script>

<Drawer
	{isOpen}
	onClose={handleClose}
	title={$t('wallet.swap.swap_assets')}
	position="right"
	isScrollable={true}
	isSubmitting={swapPhase === 'executing'}
>
	<div class="flex flex-col gap-4">
		{#if swapPhase === 'form'}
			<div transition:fly={{ y: 10, duration: 200 }}>
				<SwapFormPhase
					{sourceWallet}
					{destWallet}
					onSourceWalletChange={(id) => (sourceWallet = id)}
					onDestWalletChange={(id) => (destWallet = id)}
					{sourceType}
					{destType}
					onSourceTypeChange={handleSourceAssetChange}
					onDestTypeChange={(id) => {
						destType = id as DestType;
						smartRoute = null;
					}}
					{sourceAssets}
					{destAssets}
					connectedWallets={$connectedWalletsStore.wallets}
					btcPrice={btcPrice.price}
					walletBtcSatsFor={walletBtcSatsForFn}
					walletUsdt0For={walletUsdt0ForFn}
					displayInputAmount={swapInput.displayInputAmount}
					isBtcSource={swapInput.isBtcSource}
					btcUsdInputMode={swapInput.btcUsdInputMode}
					btcUsdPrice={swapInput.btcUsdPrice}
					{satsFormatter}
					{usdFormatter}
					walletBalanceToken={swapCalc.walletBalanceToken}
					{walletBalanceDisplay}
					{isInsufficientBalance}
					{isOnline}
					{minSliderPercent}
					swapPercent={swapCalc.swapPercent}
					{minSwapSats}
					{amountSats}
					{amountInTokenUnits}
					isAmountError={balanceCheck.isAmountError}
					isOutputTooLow={balanceCheck.smartRouteWarning}
					isSelfSend={balanceCheck.isSelfSend}
					{selectedDest}
					{totalFeeSats}
					{estimatedOutput}
					routeLoading={swapRoutes.routeLoading}
					smartRoute={swapRoutes.smartRoute}
					activeRouteForCalc={swapRoutes.activeRouteForCalc}
					{effectiveSmartRoute}
					{isDirectTransfer}
					{directTransferNetworkFeeSats}
					{getProviderLabel}
					{isFlipping}
					onAmountChange={swapInput.handleAmountChange}
					onPercentChange={applyPercent}
					onMaxAmount={setMaxAmount}
					onBtcUsdModeChange={swapInput.handleBtcUsdModeChange}
					onSwapDirection={handleSwapDirection}
					{satsUsd}
				/>
				{#if swapRoutes.swapError}
					<div class="alert alert-warning text-sm">
						{$t(swapRoutes.swapError)}
					</div>
				{/if}
				{#if showHighValueWarning}
					<div class="alert alert-warning">
						<p>
							{$t('wallet.swap.high_value_warning', {
								values: { amount: usdFormatter.format(swapAmountUSD) }
							})}
						</p>
						<button class="btn btn-primary btn-sm" onclick={() => (highValueConfirmed = true)}>
							{$t('common.confirm')}
						</button>
					</div>
				{/if}
			</div>
		{/if}

		<!-- Confirm Phase -->
		{#if swapPhase === 'confirm' && (swapRoutes.smartRoute || smartRoute) && selectedDest}
			<SwapConfirmPhase
				{isDirectTransfer}
				{sourceWalletInfo}
				{destWalletInfo}
				{sourceAsset}
				{sourceIcon}
				{sourceType}
				{selectedDest}
				amountDisplay={isBitcoinAsset(sourceAsset, sourceType)
					? `${satsFormatter.format(Math.round(parseFloat(swapCalc.amount || '0')))} ${$t('wallet.sats')}`
					: usdFormatter.format(parseFloat(swapCalc.amount || '0'))}
				sourceUsdEquivalent={isBitcoinAsset(sourceAsset, sourceType)
					? `≈ ${usdFormatter.format((Math.round(parseFloat(swapCalc.amount || '0')) / 100_000_000) * swapInput.btcUsdPrice)}`
					: undefined}
				destAmountDisplay={isBitcoinAsset(selectedDest.asset, selectedDest.id)
					? `${satsFormatter.format(Math.round(parseFloat(estimatedOutput) * 100_000_000))} ${$t('wallet.sats')}`
					: usdFormatter.format(parseFloat(estimatedOutput))}
				destUsdEquivalent={isBitcoinAsset(selectedDest.asset, selectedDest.id)
					? `≈ ${usdFormatter.format(parseFloat(estimatedOutput) * swapInput.btcUsdPrice)}`
					: undefined}
				providerLabel={getProviderLabel()}
				estimatedTime={effectiveSmartRoute?.estimatedTime}
				{totalFeeSats}
				btcUsdPrice={swapInput.btcUsdPrice}
				feeDisplay={$t('wallet.swap.fee_percent')}
				{sourceWalletType}
				{sourceWalletAddress}
				{destWalletType}
				{destWalletAddress}
				{sourceAssetName}
				{destAssetName}
				showSatsSource={isBitcoinAsset(sourceAsset, sourceType)}
				showSatsDest={isBitcoinAsset(selectedDest.asset, selectedDest.id)}
			/>
		{/if}

		<!-- Executing Phase — toast handles progress display -->
		{#if swapPhase === 'executing'}
			<div class="flex flex-col items-center gap-4 py-8">
				<span class="loading loading-lg loading-spinner text-primary"></span>
				<p class="text-base-content/70 text-sm">{swapProgressMessage}</p>
			</div>
		{/if}

		<!-- Success/Failed phases — toast handles display, drawer stays open for close button -->

		<!-- General error message -->
		{#if errorMessage && swapPhase !== 'failed'}
			<div class="alert alert-outline alert-error py-2 sm:py-3" role="alert" aria-live="assertive">
				<span class="text-xs sm:text-sm">{errorMessage}</span>
			</div>
		{/if}
	</div>
	{#snippet footer()}
		{#if swapPhase === 'form'}
			{#if !swapRoutes.gasDataAvailable && amountSats > 0}
				<div class="alert alert-warning mb-3 min-h-[44px]">
					<span class="text-sm">{$t('wallet.swap.gas_data_unavailable')}</span>
				</div>
			{/if}
			<div class="flex gap-3 sm:justify-end">
				<button
					class="btn btn-outline btn-error min-h-[44px] flex-1 touch-manipulation active:scale-95 sm:min-h-[48px] sm:flex-none"
					onclick={handleClose}
				>
					<span class="text-sm sm:text-base">{$t('wallet.buy_sell.cancel')}</span>
				</button>
				<button
					class="btn btn-primary min-h-[44px] flex-1 touch-manipulation active:scale-95 sm:min-h-[48px] sm:flex-none"
					onclick={goToConfirm}
					disabled={!balanceCheck.canSwap}
				>
					<span class="text-sm sm:text-base">{$t('wallet.swap.swap_preview')}</span>
				</button>
			</div>
		{:else if swapPhase === 'confirm'}
			<div class="flex gap-3">
				<button
					class="btn btn-outline min-h-[44px] flex-1 touch-manipulation active:scale-95 sm:min-h-[48px] sm:flex-none"
					onclick={cancelConfirm}
				>
					<span class="text-sm sm:text-base">{$t('common.back')}</span>
				</button>
				<button
					class="btn btn-primary min-h-[44px] flex-1 touch-manipulation active:scale-95 sm:min-h-[48px] sm:flex-none"
					onclick={executeSwap}
				>
					<span class="text-sm sm:text-base">{$t('wallet.swap.confirm_swap')}</span>
				</button>
			</div>
			{#if balanceCheck.needsArbEthWarning}
				<div class="alert alert-warning py-2 text-xs">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-4 w-4 shrink-0"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"
						/>
					</svg>
					<span
						>{$t('wallet.swap.arb_eth_warning', {
							values: { balance: balanceCheck.arbEthBalance }
						})}</span
					>
				</div>
			{/if}
		{:else if swapPhase === 'complete' || swapPhase === 'failed'}
			<div class="flex gap-3">
				<button
					class="btn btn-outline min-h-[44px] flex-1 touch-manipulation active:scale-95 sm:min-h-[48px] sm:flex-none"
					onclick={handleClose}
				>
					<span class="text-sm sm:text-base">{$t('wallet.buy_sell.close')}</span>
				</button>
			</div>
		{/if}
	{/snippet}
</Drawer>

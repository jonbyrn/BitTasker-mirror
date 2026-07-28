<script lang="ts">
	import { t, locale } from 'svelte-i18n';
	import { fly } from 'svelte/transition';
	import { onMount } from 'svelte';
	import { get } from 'svelte/store';
	import { walletManager, walletStore } from '$lib/stores/wallet.store';
	import { type SourceWallet } from '$lib/services/route-resolver';
	import tokenBalanceService from '$lib/api/services/token-balance.service';
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
	import SwapSuccessPhase from '$lib/components/wallet/SwapSuccessPhase.svelte';
	import SwapFailedPhase from '$lib/components/wallet/SwapFailedPhase.svelte';
	import SwapProgressView from '$lib/components/wallet/swapProgress/SwapProgressView.svelte';
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
	import {
		FEE_BUFFER_MAX,
		BRIDGE_GAS_RESERVE,
		USDT0_ADDRESS,
		WBTC_ADDRESS,
		TBTC_ADDRESS,
		relayAvailable
	} from '$lib/wallet/gasless.config';

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
	let swapPhase = $state<'form' | 'confirm' | 'executing' | 'bridging' | 'complete' | 'failed'>(
		'form'
	);
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

	// Bridge delivery tracking (for cross-chain swaps)
	let _bridgeDeliveryTimer: ReturnType<typeof setTimeout> | null = null;
	let _bridgeElapsedSeconds = $state(0);
	let _bridgeEstimatedSeconds = $state(0);
	let _bridgeStatusMessage = $state('');
	let _bridgeTakingLonger = $state(false);
	let _bridgeFailed = $state(false);
	let _bridgeDestBalanceSnapshot = $state(0);
	let _bridgePollIntervalMs = $state(5_000);
	let _bridgeStartedAt = $state(0);
	let _bridgeDestType = $state('');
	let _bridgeSourceAmount = $state('');

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
	}

	/**
	 * Start tracking bridge delivery for cross-chain swaps.
	 *
	 * Features:
	 * - Snapshots destination balance before bridge starts
	 * - Polls with exponential backoff (5s → 10s → 20s → 30s max)
	 * - Auto-transitions to 'complete' when destination balance increases
	 * - Shows "taking longer" after 1.5× estimated time
	 * - Shows "bridge failed" after 3× estimated time (timeout)
	 * - Persists bridge state for recovery on page refresh
	 */
	function _startBridgeDeliveryTracking(estimatedMinutes: number) {
		_bridgeElapsedSeconds = 0;
		_bridgeEstimatedSeconds = Math.max(30, estimatedMinutes * 60);
		_bridgeStatusMessage =
			$t('wallet.swap.bridge_in_progress') || 'Bridging your funds to the destination chain...';
		_bridgeTakingLonger = false;
		_bridgeFailed = false;
		_bridgePollIntervalMs = 5_000;
		_bridgeStartedAt = Date.now();
		_bridgeDestType = destType;
		_bridgeSourceAmount = swapCalc.amount ?? '';

		// Snapshot the destination balance before bridge starts
		const store = get(walletStore);
		if (destType === 'rbtc-rsk') {
			_bridgeDestBalanceSnapshot = parseFloat(store.rsk.balance) || 0;
		} else if (destType === 'usdt0-arb') {
			_bridgeDestBalanceSnapshot = parseFloat(store.arb.usdt0Balance) || 0;
		} else if (destType === 'wbtc-arb') {
			_bridgeDestBalanceSnapshot = parseFloat(store.arb.wbtcBalance) || 0;
		}

		// Persist bridge state for recovery on page refresh
		_persistBridgeState();

		// Start polling with exponential backoff
		_scheduleBridgePoll();
	}

	/**
	 * Schedule the next bridge delivery poll with exponential backoff.
	 * Starts at 5s, doubles each time, caps at 30s.
	 */
	function _scheduleBridgePoll() {
		if (swapPhase !== 'bridging') return;

		_bridgeDeliveryTimer = setTimeout(() => {
			if (swapPhase !== 'bridging') return;

			_bridgeElapsedSeconds = Math.floor((Date.now() - _bridgeStartedAt) / 1000);

			// Check for "taking longer" state (1.5× estimated)
			if (_bridgeElapsedSeconds > _bridgeEstimatedSeconds * 1.5 && !_bridgeTakingLonger) {
				_bridgeTakingLonger = true;
				_bridgeStatusMessage =
					$t('wallet.swap.bridge_taking_longer') ||
					'This is taking longer than usual. Your funds are safe.';
			}

			// Check for bridge failure timeout (3× estimated)
			if (_bridgeElapsedSeconds > _bridgeEstimatedSeconds * 3 && !_bridgeFailed) {
				_bridgeFailed = true;
				_bridgeStatusMessage =
					$t('wallet.swap.bridge_timeout') ||
					'The bridge is taking much longer than expected. Your funds are safe on the source chain. Check Pending Swaps for status.';
				_stopBridgeDeliveryTracking();
				return;
			}

			// Handle network disconnection during bridge
			if (!isOnline) {
				_bridgeStatusMessage =
					$t('wallet.swap.bridge_offline') ||
					'You appear to be offline. Your funds are safe on the blockchain. Reconnecting...';
				// Don't poll while offline — schedule next poll at current interval
				_scheduleBridgePoll();
				return;
			}

			// Refresh balances and check for delivery
			walletManager
				.loadAssets(true)
				.then(() => {
					void _checkBridgeDelivery();
				})
				.catch(() => {});

			// Exponential backoff: 5s → 10s → 20s → 30s (max)
			_bridgePollIntervalMs = Math.min(_bridgePollIntervalMs * 2, 30_000);
			_scheduleBridgePoll();
		}, _bridgePollIntervalMs);
	}

	/**
	 * Check if the bridge has delivered by comparing destination balance
	 * to the snapshot taken before the bridge started, and optionally
	 * checking the LI.FI status API for more accurate tracking.
	 */
	async function _checkBridgeDelivery() {
		if (swapPhase !== 'bridging') return;

		// Check LI.FI status API if we have a tx hash
		if (_swapResult?.txHash) {
			try {
				const { lifiService } = await import('$lib/services/lifi.service');
				const status = await lifiService.getStatus(_swapResult.txHash);
				if (status.status === 'DONE' && status.receiving?.txHash) {
					d.log('[SwapForm] LI.FI status DONE: receiving tx=%s', status.receiving.txHash);
					_confirmBridgeDelivery();
					return;
				}
				if (status.status === 'FAILED') {
					d.error('[SwapForm] LI.FI status FAILED for tx=%s', _swapResult.txHash);
					_bridgeFailed = true;
					_bridgeStatusMessage =
						$t('wallet.swap.bridge_failed') ||
						'The bridge transfer failed. Your funds are safe on the source chain. Check Pending Swaps for recovery options.';
					_stopBridgeDeliveryTracking();
					return;
				}
			} catch {
				// Non-blocking: fall back to balance check
			}
		}

		// Fallback: check destination balance increase
		const store = get(walletStore);
		let currentBalance = 0;

		if (_bridgeDestType === 'rbtc-rsk') {
			currentBalance = parseFloat(store.rsk.balance) || 0;
		} else if (_bridgeDestType === 'usdt0-arb') {
			currentBalance = parseFloat(store.arb.usdt0Balance) || 0;
		} else if (_bridgeDestType === 'wbtc-arb') {
			currentBalance = parseFloat(store.arb.wbtcBalance) || 0;
		}

		// If destination balance increased, bridge has delivered
		if (currentBalance > _bridgeDestBalanceSnapshot + 0.000001) {
			d.log(
				'[SwapForm] Bridge delivery detected via balance: %s balance %s → %s',
				_bridgeDestType,
				_bridgeDestBalanceSnapshot,
				currentBalance
			);
			_confirmBridgeDelivery();
		}
	}

	function _stopBridgeDeliveryTracking() {
		if (_bridgeDeliveryTimer) {
			clearTimeout(_bridgeDeliveryTimer);
			_bridgeDeliveryTimer = null;
		}
	}

	/** Persist bridge state to Capacitor Preferences for recovery on page refresh. */
	async function _persistBridgeState() {
		try {
			const { Preferences } = await import('@capacitor/preferences');
			const bridge = get(walletStore).activeBridge;
			if (bridge) {
				await Preferences.set({
					key: 'active_bridge',
					value: JSON.stringify(bridge)
				});
			}
		} catch {
			// Non-blocking
		}
	}

	/** Clear persisted bridge state from Capacitor Preferences. */
	async function _clearPersistedBridgeState() {
		try {
			const { Preferences } = await import('@capacitor/preferences');
			await Preferences.remove({ key: 'active_bridge' });
		} catch {
			// Non-blocking
		}
	}

	/**
	 * Manually confirm bridge delivery (called from the bridging UI).
	 * Transitions to 'complete' phase.
	 */
	function _confirmBridgeDelivery() {
		_stopBridgeDeliveryTracking();
		_bridgeFailed = false;
		// Clear active bridge from wallet store and persisted state
		walletStore.update((s) => ({ ...s, activeBridge: null }));
		void _clearPersistedBridgeState();
		swapPhase = 'complete';
		triggerHaptic(ImpactStyle.Heavy);
		blockchainToastStore.onSuccess('bridge-delivered');
	}

	/**
	 * Detect restored bridge state on mount.
	 * When the wallet page restores activeBridge from Preferences (page refresh
	 * during a bridge), this effect enters 'bridging' phase and restarts delivery
	 * tracking so the user sees the progress without manually starting a new swap.
	 */
	let _bridgeRestoreHandled = false;
	$effect(() => {
		const bridge = $walletStore.activeBridge;
		if (bridge && swapPhase === 'form' && !_bridgeRestoreHandled) {
			_bridgeRestoreHandled = true;
			d.log('[SwapForm] Restoring bridge tracking: %s → %s', bridge.sourceAsset, bridge.destAsset);
			swapPhase = 'bridging';
			_swapResult = { swapId: bridge.swapId, txHash: bridge.txHash };
			_bridgeSourceAmount = bridge.sourceAmount;
			_bridgeDestType = bridge.destAsset === 'rBTC' ? 'rbtc-rsk' : 'usdt0-arb';

			const elapsed = Math.floor((Date.now() - bridge.startedAt) / 1000);
			_bridgeElapsedSeconds = elapsed;
			_bridgeEstimatedSeconds = Math.max(30, bridge.estimatedMinutes * 60);
			_bridgeStatusMessage =
				$t('wallet.swap.bridge_in_progress') || 'Bridging your funds to the destination chain...';
			_bridgeTakingLonger = elapsed > _bridgeEstimatedSeconds * 1.5;
			_bridgeFailed = elapsed > _bridgeEstimatedSeconds * 3;
			_bridgePollIntervalMs = 10_000; // Start with longer interval on restore
			_bridgeStartedAt = bridge.startedAt;

			// Snapshot destination balance
			const store = get(walletStore);
			if (_bridgeDestType === 'rbtc-rsk') {
				_bridgeDestBalanceSnapshot = parseFloat(store.rsk.balance) || 0;
			} else if (_bridgeDestType === 'usdt0-arb') {
				_bridgeDestBalanceSnapshot = parseFloat(store.arb.usdt0Balance) || 0;
			}

			if (!_bridgeFailed) {
				_scheduleBridgePoll();
			}
		}
	});

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
				return 'usdt-arbitrum';
			case 'tbtc-arb':
				return 'usdt-arbitrum';
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
			let rawBalance: number;
			if (sourceType === 'rbtc') {
				rawBalance =
					(sourceWallet === 'builtin'
						? swapOptions.builtinRbtcSats
						: swapWallets.sourceBalances.rbtcSats) / 100_000_000;
			} else if (sourceType === 'wbtc-arb') {
				rawBalance =
					(sourceWallet === 'builtin'
						? swapOptions.builtinWbtcSats
						: swapWallets.sourceBalances.wbtcSats) / 100_000_000;
			} else if (sourceType === 'tbtc-arb') {
				rawBalance =
					(sourceWallet === 'builtin'
						? swapOptions.builtinTbtcSats
						: swapWallets.sourceBalances.tbtcSats) / 100_000_000;
			} else if (sourceType === 'btc-onchain') {
				rawBalance =
					(sourceWallet === 'builtin' ? 0 : swapWallets.externalBtcBalanceSats) / 100_000_000;
			} else {
				rawBalance =
					sourceWallet === 'builtin' ? swapOptions.builtinUsdt0 : swapWallets.sourceBalances.usdt0;
			}
			// For Arbitrum ERC-20 tokens: subtract the gasless relay fee reserve.
			// The executeBatch batches the swap and a fee transfer from the same
			// token balance. Without this reservation, setting max amount would
			// leave zero tokens for the fee transfer, causing the UserOp to revert.
			const reserve = gaslessFeeReserve;
			if (reserve > 0 && rawBalance > reserve) {
				return rawBalance - reserve;
			}
			return rawBalance;
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
		getIsFormPhase: () => swapPhase === 'form',
		getRelayAvailable: () => relayAvailable,
		getGasDataAvailable: () => swapRoutes.gasDataAvailable
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

	// Gasless relay fee reserve: for Arbitrum ERC-20 swaps, the executeBatch
	// includes both the swap and a fee transfer from the same token balance.
	// We must reserve FEE_BUFFER_MAX from the displayed balance so the user
	// cannot enter an amount that would leave insufficient tokens for the fee.
	const gaslessFeeReserve = $derived.by(() => {
		const arbTokens: Record<string, { addr: string; decimals: number }> = {
			usdt0: { addr: USDT0_ADDRESS, decimals: 6 },
			'wbtc-arb': { addr: WBTC_ADDRESS, decimals: 8 },
			'tbtc-arb': { addr: TBTC_ADDRESS, decimals: 18 }
		};
		const info = arbTokens[sourceType];
		if (!info) return 0;
		const addrLower = info.addr.toLowerCase();
		const maxBuffer = FEE_BUFFER_MAX[addrLower];
		if (!maxBuffer) return 0;
		let reserve = Number(maxBuffer) / Math.pow(10, info.decimals);
		// For cross-chain swaps, add bridge gas reserve
		const isCrossChain =
			sourceType !== destType &&
			((sourceType === 'usdt0-arb' && destType === 'rbtc-rsk') ||
				(sourceType === 'rbtc' && destType === 'usdt0-arb') ||
				(sourceType === 'usdt0-arb' && destType === 'wbtc-arb') ||
				(sourceType === 'wbtc-arb' && destType === 'usdt0-arb'));
		if (isCrossChain) {
			const bridgeReserve = BRIDGE_GAS_RESERVE[addrLower];
			if (bridgeReserve) {
				reserve += Number(bridgeReserve) / Math.pow(10, info.decimals);
			}
		}
		return reserve;
	});

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
		_stopBridgeDeliveryTracking();
		_bridgeElapsedSeconds = 0;
		_bridgeTakingLonger = false;
		_bridgeFailed = false;
		_bridgeStatusMessage = '';
		// Clear active bridge from wallet store and persisted state
		walletStore.update((s) => ({ ...s, activeBridge: null }));
		void _clearPersistedBridgeState();
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
		_stopBridgeDeliveryTracking();
		resetForm();
		onClose();
	}

	/**
	 * Cancel an in-progress swap. Resets UI state and clears the timeout.
	 * The swap chain service will continue in the background if it cannot
	 * be aborted — the user is warned to check Pending Swaps.
	 */
	function _cancelSwap() {
		_clearSwapTimeout();
		_stopProgressTracking();
		swapPhase = 'form';
		errorMessage =
			$t('wallet.swap.cancel_warning') ||
			'Your swap is still in progress. Check Pending Swaps for status.';
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
				const isCrossChain = sourceType !== destType;

				if (isCrossChain) {
					// Cross-chain swap: show 'bridging' phase until bridge delivers
					// The source chain tx succeeded but the destination hasn't received yet
					swapPhase = 'bridging';
					triggerHaptic(ImpactStyle.Medium);
					blockchainToastStore.onSuccess(swapToastId);

					// Get estimated bridge time from route
					const bridgeMinutes =
						smartRoute?.estimatedTimeMinutes || swapRoutes.activeRouteForCalc?.estimatedTime || 2; // default 2 minutes
					const estimatedMins =
						typeof bridgeMinutes === 'string' ? parseInt(bridgeMinutes) || 2 : bridgeMinutes;

					// Set active bridge in wallet store for persistent banner
					walletStore.update((s) => ({
						...s,
						activeBridge: {
							sourceAsset: sourceAsset,
							destAsset: selectedDest.asset,
							sourceAmount: swapCalc.amount ?? '',
							destAmount: estimatedOutput ?? '',
							startedAt: Date.now(),
							estimatedMinutes: estimatedMins,
							swapId: result.swapId,
							txHash: result.txHash
						}
					}));

					// Clear all caches immediately so balance reflects the USDT0 spend
					const address = get(walletStore).rsk.address;
					if (address) {
						tokenBalanceService.clearAllBalanceCaches(address);
					}
					walletManager.loadAssets(true).catch((err: unknown) => {
						Sentry.captureException(err);
					});

					// Start polling for bridge delivery
					_startBridgeDeliveryTracking(estimatedMins);
				} else {
					// Same-chain swap: show 'complete' immediately
					swapPhase = 'complete';
					triggerHaptic(ImpactStyle.Heavy);
					blockchainToastStore.onSuccess(swapToastId);
					walletManager.loadAssets(true).catch((err: unknown) => {
						Sentry.captureException(err);
					});
				}
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
				errorMessage =
					$t('wallet.swap.error.timed_out_pending') ||
					'Swap timed out but may still be in progress. Check Pending Swaps for status.';
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

	/** Get a human-readable wallet label for a wallet ID. */
	function walletLabel(walletId: string): string {
		if (walletId === 'builtin') return $t('wallet.builtin_wallet') || 'BitTasker Wallet';
		const w = $connectedWalletsStore.wallets.find((w) => w.id === walletId);
		return w?.walletName || w?.walletType || walletId;
	}

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
					{gaslessFeeReserve}
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
				route={swapRoutes.getExecutableRoute()}
			/>
		{/if}

		<!-- Success Phase — shows what was received with tx link -->
		{#if swapPhase === 'complete'}
			<SwapSuccessPhase
				{isDirectTransfer}
				{sourceAsset}
				{sourceIcon}
				{sourceType}
				{destType}
				{selectedDest}
				sourceWalletInfo={walletLabel(sourceWallet)}
				destWalletInfo={walletLabel(destWallet)}
				sourceAmount={swapCalc.amount ?? ''}
				estimatedOutput={estimatedOutput ?? ''}
				btcUsdPrice={swapInput.btcUsdPrice}
				{satsUsd}
				{usdFormatter}
				{isBitcoinAsset}
				isBtcSource={swapInput.isBtcSource}
				swapResult={_swapResult}
				providerLabel={getProviderLabel()}
				feePercent={smartRoute?.totalFeePercent ?? swapRoutes.activeRouteForCalc?.totalFeePercent}
				estimatedTime={smartRoute?.estimatedTimeMinutes
					? `${smartRoute.estimatedTimeMinutes} min`
					: swapRoutes.activeRouteForCalc?.estimatedTime}
				{sourceWallet}
				{destWallet}
				{sourceWalletType}
				{sourceWalletAddress}
				{destWalletType}
				{destWalletAddress}
				{sourceAssetName}
				{destAssetName}
				onReset={resetForm}
				{walletLabel}
			/>
		{/if}

		<!-- Bridging Phase — cross-chain bridge in progress -->
		{#if swapPhase === 'bridging'}
			<div class="flex flex-col items-center gap-4 py-6" transition:fly={{ y: 10, duration: 200 }}>
				{#if _bridgeFailed}
					<!-- Bridge timeout/failure state -->
					<div class="bg-warning/10 rounded-full p-4">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="text-warning h-10 w-10"
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
					</div>
					<div class="text-center">
						<h4 class="text-lg font-bold sm:text-xl">
							{$t('wallet.swap.bridge_delayed') || 'Bridge Taking Longer'}
						</h4>
						<p class="text-base-content/60 mt-1 text-sm">
							{_bridgeStatusMessage}
						</p>
					</div>
				{:else}
					<!-- Normal bridging state -->
					<div class="bg-primary/10 rounded-full p-4">
						<span class="loading loading-spinner loading-lg text-primary"></span>
					</div>
					<div class="text-center">
						<h4 class="text-lg font-bold sm:text-xl">
							{$t('wallet.swap.bridging_title') || 'Bridging in Progress'}
						</h4>
						<p class="text-base-content/60 mt-1 text-sm">
							{_bridgeStatusMessage}
						</p>
					</div>
				{/if}

				<!-- Progress info -->
				<div class="bg-base-200 w-full max-w-sm space-y-3 rounded-xl p-4">
					<!-- Source sent -->
					<div class="flex items-center justify-between text-sm">
						<span class="text-base-content/60">{$t('wallet.swap.source_sent') || 'Sent'}</span>
						<span class="font-medium"
							>{sourceAsset} {_bridgeSourceAmount || swapCalc.amount || ''}</span
						>
					</div>
					<!-- Destination expected -->
					<div class="flex items-center justify-between text-sm">
						<span class="text-base-content/60"
							>{$t('wallet.swap.dest_expected') || 'Receiving'}</span
						>
						<span class="font-medium">{selectedDest?.asset || ''} {estimatedOutput ?? ''}</span>
					</div>
					<!-- Elapsed time -->
					<div class="flex items-center justify-between text-sm">
						<span class="text-base-content/60">{$t('wallet.swap.elapsed') || 'Elapsed'}</span>
						<span class="font-mono"
							>{Math.floor(_bridgeElapsedSeconds / 60)}m {_bridgeElapsedSeconds % 60}s</span
						>
					</div>
					{#if _bridgeTakingLonger && !_bridgeFailed}
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
							<span>{_bridgeStatusMessage}</span>
						</div>
					{/if}
				</div>

				<!-- Source TX link -->
				{#if _swapResult?.txHash}
					<a
						href={`https://arbiscan.io/tx/${_swapResult.txHash}`}
						target="_blank"
						rel="noopener noreferrer"
						class="bg-base-200 hover:bg-base-300 flex items-center gap-2 rounded-xl p-3 text-xs transition-colors sm:text-sm"
					>
						<span class="text-base-content/60">{$t('wallet.swap.source_tx') || 'Source TX'}:</span>
						<span class="font-mono"
							>{_swapResult.txHash.slice(0, 6)}...{_swapResult.txHash.slice(-4)}</span
						>
						<svg
							class="text-base-content/40 ml-auto h-4 w-4 shrink-0"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
							/>
						</svg>
					</a>
				{/if}

				<p class="text-base-content/40 px-4 text-center text-xs">
					{$t('wallet.swap.bridge_safe_to_close') ||
						'You can safely close this screen. Your funds are in transit on the blockchain.'}
				</p>
			</div>
		{/if}

		<!-- Failed Phase — shows error with retry/fallback options -->
		{#if swapPhase === 'failed'}
			<SwapFailedPhase
				{errorMessage}
				{smartRoute}
				onRetry={_retryWithFallback}
				onReset={resetForm}
			/>
		{/if}

		<!-- Executing Phase — rich step-by-step progress timeline -->
		{#if swapPhase === 'executing'}
			<SwapProgressView
				route={swapRoutes.getExecutableRoute()}
				progressStep={_swapProgressStep}
				progressMessage={swapProgressMessage}
			/>
		{/if}

		<!-- General error message — visible in all phases including 'failed' -->
		{#if errorMessage}
			<div class="alert alert-outline alert-error py-2 sm:py-3" role="alert" aria-live="assertive">
				<span class="text-xs sm:text-sm">{errorMessage}</span>
			</div>
		{/if}
	</div>
	{#snippet footer()}
		{#if swapPhase === 'form'}
			{#if !relayAvailable}
				<div class="alert alert-error mb-3 min-h-[44px]">
					<span class="text-sm"
						>{$t('wallet.swap.relay_unavailable') ||
							'The gasless relay is temporarily unavailable. Please try again in a few minutes.'}</span
					>
				</div>
			{:else if !swapRoutes.gasDataAvailable && amountSats > 0}
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
		{:else if swapPhase === 'bridging'}
			<div class="flex gap-3">
				<button
					class="btn btn-outline min-h-[44px] flex-1 touch-manipulation active:scale-95 sm:min-h-[48px] sm:flex-none"
					onclick={handleClose}
				>
					<span class="text-sm sm:text-base">{$t('wallet.buy_sell.close')}</span>
				</button>
				<button
					class="btn btn-primary min-h-[44px] flex-1 touch-manipulation active:scale-95 sm:min-h-[48px] sm:flex-none"
					onclick={_confirmBridgeDelivery}
				>
					<span class="text-sm sm:text-base"
						>{$t('wallet.swap.bridge_received') || 'I received my funds'}</span
					>
				</button>
			</div>
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

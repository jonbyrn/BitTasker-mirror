<script lang="ts">
	import type { Barcode } from '@capacitor-mlkit/barcode-scanning';
	import { t } from 'svelte-i18n';
	import { onMount } from 'svelte';
	import { Capacitor } from '@capacitor/core';
	import { appStore } from '$lib/stores/app.store';
	import {
		walletStore,
		walletManager,
		formatSats,
		formatUsd,
		allAssets
	} from '$lib/stores/wallet.store';
	import { UI } from '$lib/utils/constants/wallet.constants';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';
	import {
		parsePaymentAddress,
		resolveLNURLPaymentAddress,
		type ParsedPaymentAddress
	} from '$lib/utils/helpers/paymentAddressParser';
	import { detectLightningType, parseLightningInvoice } from '$lib/utils/helpers/lightningInvoice';
	import SendQrScanner from '$lib/components/wallet/send/SendQrScanner.svelte';
	import SendPaymentDetailsTab from '$lib/components/wallet/send/SendPaymentDetailsTab.svelte';
	import SendConfirmScreen from '$lib/components/wallet/send/SendConfirmScreen.svelte';
	import { useSendFeeEstimate } from '$lib/runes/use-send-fee-estimate.svelte';
	import { useSendFormValidation } from '$lib/runes/use-send-form-validation.svelte';
	import { browserNetworkStatus } from '$lib/utils/network-status';
	import { parseSendAddress } from '$lib/utils/parseSendAddress';
	import IconClose from '~icons/mdi/close';
	import { blockchainToastStore } from '$lib/stores/wallet/blockchain-toast.store';
	import { REQUIRED_CONFIRMATIONS } from '$lib/utils/wallet/chain-confirmations';
	import { getAssetForNetwork, getSourceAddress } from '$lib/utils/wallet/toast-helpers';
	import AddressAccordion from '$lib/components/wallet/AddressAccordion.svelte';
	import type { AssetOption } from '$lib/components/wallet/AssetSelector.svelte';
	import TransactionSuccessScreen from './TransactionSuccessScreen.svelte';
	import { resolveRoute } from '$lib/services/route-resolver';
	import {
		toSourceWallet,
		toDestination,
		getChainOption,
		getAddressExplorerUrl,
		getNetworkDisplay,
		DESTINATION_CHAIN_OPTIONS,
		NETWORK_TO_CHAIN_ID,
		CHAIN_ID_TO_NETWORK
	} from '$lib/utils/send-network-mapping';
	import { resolveRoutes, type RouteEngineResult } from '$lib/services/route-engine';
	import { tryCatch } from '$lib/utils/tryCatch';
	import { createDebug } from '$lib/utils/debug';
	import * as Sentry from '@sentry/sveltekit';

	import { type SwapChainState } from '$lib/services/swap-chain.service';
	import { connectedWalletsStore } from '$lib/stores/connected-wallets.store';
	import { getHandle, hasBitcoinSigner } from '$lib/stores/connected-wallets.store';
	import { executeSend } from '$lib/services/send-execution.service';

	const d = createDebug('send-payment');

	let { onCancel, onSuccess } = $props<{
		onCancel: () => void;
		onSuccess?: (txHash: string, network: string) => void;
	}>();

	// Constants
	const LARGE_AMOUNT_THRESHOLD = 1000; // $1,000 USD

	// Platform detection
	const isWeb = Capacitor.getPlatform() === 'web';

	/** Get display info for a network (icon, name, confirmationTime) — delegates to send-network-mapping */
	function getNetworkOption(network: string) {
		return getNetworkDisplay(network);
	}

	// Grouped State: Form Input & Address Data
	let formInput = $state({
		addressInput: '',
		amount: '',
		unit: 'usd' as 'sats' | 'usd',
		mathExpression: '',
		memo: '',
		selectedSource: 'rootstock-bitcoin' as string,
		destinationChainId: null as number | null // null = auto-detect from address
	});

	// Wallet selection for SwapPartySelector (separate from asset/source)
	let selectedWalletId = $state('builtin');

	// Grouped State: Parsed Payment Data
	let parsedPayment = $state<{
		data: ParsedPaymentAddress | null;
		detectedNetwork: string | null;
		detectedAmount: number | null;
		detectedMemo: string | null;
		amountRequired: boolean;
		addressError: string | null;
	}>({
		data: null,
		detectedNetwork: null,
		detectedAmount: null,
		detectedMemo: null,
		amountRequired: true,
		addressError: null
	});

	// Grouped State: UI State
	let uiState = $state({
		activeTab: isWeb ? 'scan' : 'enter',
		showConfirmation: false,
		showSendConfirmation: false,
		showSuccessScreen: false,
		descriptionExpanded: false,
		networkFeeExpanded: false,
		calculatorKey: 0,
		showRecentAddresses: false,
		currentStep: 1 as 1 | 2, // Step 1: Address + Amount, Step 2: Details
		sourceExpanded: false,
		destinationExpanded: false
	});

	// Grouped State: QR Scan State
	let qrScanState = $state<{
		error: string | null;
		scannedValue: string | null;
	}>({
		error: null,
		scannedValue: null
	});

	// Grouped State: Fee Estimation (useSendFeeEstimate rune handles computation + max calc)

	// Grouped State: Send Operation
	let sendState = $state<{
		isSending: boolean;
		error: string | null;
		successTxHash: string | null;
		successNetwork: string | null;
		pendingTxHash: string | null;
		pendingNetwork: string | null;
		pendingAmount: number | null;
		pendingAddress: string | null;
		pendingSwapId: string | null; // For lightning swaps
		pendingSwapChain: SwapChainState | null;
		externalConfirmSource: string | null; // Set to wallet name when awaiting external confirmation
	}>({
		isSending: false,
		error: null,
		successTxHash: null,
		successNetwork: null,
		pendingTxHash: null,
		pendingNetwork: null,
		pendingAmount: null,
		pendingAddress: null,
		pendingSwapId: null,
		pendingSwapChain: null,
		externalConfirmSource: null
	});

	// Cached Data
	let btcPrice = $state<number>(0);
	let recentAddresses = $state<Array<{ address: string; network: string; label?: string }>>([]);

	// Route-picking state
	/** User's explicit route selection (set via onRouteSelect) */
	let userSelectedRouteId = $state<string>('');
	/** Effective route ID — falls back to first route when user selection is invalid */
	let selectedRouteId = $derived.by(() => {
		const routes = routeResult.routes;
		if (routes.length > 0 && !routes.find((r) => r.id === userSelectedRouteId)) {
			return routes[0].id;
		}
		return userSelectedRouteId;
	});

	/** Check if the selected source is a connected (external) wallet */
	function _isConnectedWalletSource(source: string): boolean {
		return getHandle(source) !== undefined;
	}

	/** Get a display label for a connected wallet source */
	function _getConnectedWalletLabel(
		source: string
	): { name: string; address: string; walletType: string } | null {
		const handle = getHandle(source);
		if (!handle) return null;
		return { name: handle.walletName, address: handle.address, walletType: handle.walletType };
	}

	// ── SwapPartySelector helpers ────────────────────────────────────────────

	/** BTC sats for a wallet (builtin = rBTC from walletStore; connected = from balances) */
	function walletBtcSatsForFn(walletId: string): number {
		if (walletId === 'builtin') {
			const rbtcSats = Math.floor(
				parseFloat($walletStore.rsk.formattedBalance || '0') * 100_000_000
			);
			const wbtcAsset = $allAssets.find((a) => a.assetId === 'wbtc-arb');
			const wbtcSats = wbtcAsset ? Math.floor(wbtcAsset.balance * 100_000_000) : 0;
			return rbtcSats + wbtcSats;
		}
		const w = $connectedWalletsStore.wallets.find((w) => w.id === walletId);
		if (!w?.balances) return 0;
		// rbtc and wbtc raw values are in sats from the connector
		const rbtcSats = Number(w.balances.rbtc?.raw ?? 0);
		const wbtcSats = Number(w.balances.wbtc?.raw ?? 0);
		return rbtcSats + wbtcSats;
	}

	/** USDT0 on Arbitrum for a wallet (returns USD amount) */
	function walletUsdt0ForFn(walletId: string): number {
		if (walletId === 'builtin') {
			const usdt0Asset = $allAssets.find((a) => a.assetId === 'usdt0-arb');
			return usdt0Asset?.usdValue ?? usdt0Asset?.balance ?? 0;
		}
		const w = $connectedWalletsStore.wallets.find((w) => w.id === walletId);
		if (!w?.balances) return 0;
		return Number(w.balances['usdt0-arb']?.raw ?? 0) / 1e6;
	}

	/** Build asset list for SwapPartySelector — reactive to selectedWalletId */
	let sourceAssets: AssetOption[] = $derived.by(() => {
		const isBuiltin = selectedWalletId === 'builtin';
		const cw = !isBuiltin
			? $connectedWalletsStore.wallets.find((w) => w.id === selectedWalletId)
			: null;
		const cwBal = cw?.balances;

		// rBTC / Rootstock Bitcoin
		const rbtcSats = isBuiltin
			? Math.floor(parseFloat($walletStore.rsk.formattedBalance || '0') * 100_000_000)
			: Number(cwBal?.rbtc?.raw ?? 0);
		const rbtcUsd = (rbtcSats / 100_000_000) * btcPrice;

		// USDT0 on Arbitrum
		const usdt0Usd = isBuiltin
			? (() => {
					const a = $allAssets.find((a) => a.assetId === 'usdt0-arb');
					return a && a.balance > 0 ? (a.usdValue ?? a.balance) : 0;
				})()
			: Number(cwBal?.['usdt0-arb']?.raw ?? 0) / 1e6;

		// wBTC on Arbitrum (raw is in sats for connected wallets)
		const wbtcSats = isBuiltin
			? (() => {
					const a = $allAssets.find((a) => a.assetId === 'wbtc-arb');
					return a ? Math.floor(a.balance * 100_000_000) : 0;
				})()
			: Number(cwBal?.wbtc?.raw ?? 0);
		const wbtcUsd = (wbtcSats / 100_000_000) * btcPrice;

		// USDT on BSC
		const usdtBscUsd = isBuiltin ? parseFloat($walletStore.bsc.formattedUsdtBalance) || 0 : 0; // Connected wallets don't have BSC USDT

		// tBTC on Arbitrum
		const tbtcSats = isBuiltin
			? (() => {
					const a = $allAssets.find((a) => a.assetId === 'tbtc-arb');
					return a && a.balance > 0 ? Math.floor(a.balance * 100_000_000) : 0;
				})()
			: Math.round(Number(cwBal?.['tbtc-arb']?.raw ?? 0) / 10_000_000_000);
		const tbtcUsd = (tbtcSats / 100_000_000) * btcPrice;

		return [
			{
				id: 'rootstock-bitcoin',
				label: $t('wallet.send.asset.rbtc'),
				icon: '/images/chains/Bitcoin-Rootstock-logo.webp',
				subLabel: $t('wallet.send.asset.rbtc_sub'),
				balance: formatSats(rbtcSats) + ' ' + $t('wallet.sats'),
				balanceSub: `≈ $${rbtcUsd.toFixed(2)}`
			},
			{
				id: 'usdt0-arb',
				label: $t('wallet.send.asset.usdt'),
				icon: '/images/chains/Tether-USD.svg',
				subLabel: $t('wallet.send.asset.usdt_sub'),
				balance: usdt0Usd > 0 ? `$${usdt0Usd.toFixed(2)}` : '$0.00'
			},
			{
				id: 'wbtc-arb',
				label: $t('wallet.send.asset.wbtc'),
				icon: '/images/chains/arbitrum.png',
				subLabel: $t('wallet.send.asset.wbtc_sub'),
				balance: formatSats(wbtcSats) + ' ' + $t('wallet.sats'),
				balanceSub: wbtcUsd > 0 ? `≈ $${wbtcUsd.toFixed(2)}` : undefined
			},
			...(isBuiltin && usdtBscUsd > 0
				? [
						{
							id: 'usdt-bsc',
							label: $t('wallet.send.asset.usd_bsc'),
							icon: '/images/chains/Binance-logo.svg',
							subLabel: $t('wallet.send.asset.usdt_bsc_sub'),
							balance: `$${usdtBscUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
						}
					]
				: []),
			...(tbtcSats > 0
				? [
						{
							id: 'tbtc-arb',
							label: $t('wallet.send.asset.tbtc'),
							icon: '/images/tokens/tbtc.png',
							subLabel: $t('wallet.send.asset.tbtc_sub'),
							balance: formatSats(tbtcSats) + ' ' + $t('wallet.sats'),
							balanceSub: tbtcUsd > 0 ? `≈ $${tbtcUsd.toFixed(2)}` : undefined
						}
					]
				: [])
		];
	});

	/** Map network string → chain ID for the destination selector — imported from send-network-mapping */

	/** Map chain ID → network string for the destination selector — imported from send-network-mapping */

	// Effective destination chain — user selection overrides auto-detection
	// Resolve which chain is selected — explicit override, or default from source/address
	let effectiveDestinationChainId = $derived.by(() => {
		if (formInput.destinationChainId !== null) return formInput.destinationChainId;
		// If specific network detected (lightning, bitcoin, liquid), use its chain
		const detectedNet = parsedPayment.detectedNetwork;
		if (detectedNet) {
			const match = DESTINATION_CHAIN_OPTIONS.find((c) => c.network === detectedNet);
			if (match) return match.id;
		}
		// Ambiguous: default to the source wallet's chain
		if (formInput.selectedSource === 'usdt-bsc') return 56;
		return 30; // rBTC → RSK
	});
	// Destination chain picker — always visible, locked when address is unambiguous
	let hasAddress = $derived(parsedPayment.data?.isValid && parsedPayment.detectedNetwork !== null);
	// Lock when address has explicit scheme/chain-id, Liquid/Bitcoin/Lightning.
	// Ambiguous plain 0x... stays unlocked so user can pick chain.
	let isDestinationLocked = $derived.by(() => {
		if (!hasAddress) return true; // No address → locked with "(Enter Address)"
		const raw = formInput.addressInput.trim();
		const lower = raw.toLowerCase();
		const isExplicitEVM =
			lower.startsWith('rsk:') ||
			lower.startsWith('bsc:') ||
			lower.startsWith('ethereum:') ||
			lower.startsWith('arbitrum:') ||
			/@\d+/.test(raw); // EIP-681 chain ID
		const net = parsedPayment.detectedNetwork;
		return (
			isExplicitEVM || net === 'lightning-bitcoin' || net === 'bitcoin' || net === 'liquid-bitcoin'
		);
	});
	let _selectedChain = $derived(
		getChainOption(effectiveDestinationChainId, parsedPayment.detectedNetwork)
	);

	// Note: destinationChainId is reset in applyParsedAddress when detectedNetwork changes
	// (previously an $effect writing state — moved to event handler per Svelte 5 best practices)

	// Filter destination options to only networks matching the address type
	let _filteredChainOptions = $derived.by(() => {
		const net = parsedPayment.detectedNetwork;
		if (!net) return DESTINATION_CHAIN_OPTIONS;
		// Lightning invoice → only Lightning
		if (net === 'lightning-bitcoin') {
			return DESTINATION_CHAIN_OPTIONS.filter(
				(c) => 'network' in c && c.network === 'lightning-bitcoin'
			);
		}
		// Bitcoin on-chain → only Bitcoin
		if (net === 'bitcoin') {
			return DESTINATION_CHAIN_OPTIONS.filter((c) => 'network' in c && c.network === 'bitcoin');
		}
		// Liquid address → only Liquid
		if (net === 'liquid-bitcoin') {
			return DESTINATION_CHAIN_OPTIONS.filter(
				(c) => 'network' in c && c.network === 'liquid-bitcoin'
			);
		}
		// EVM-compatible address (0x...) → only EVM chains
		return DESTINATION_CHAIN_OPTIONS.filter((c) => 'id' in c && c.id > 0);
	});

	const EMPTY_ROUTE_RESULT: RouteEngineResult = {
		routes: [],
		recommended: null,
		errors: [],
		isLive: false
	};
	let routeResult = $state<RouteEngineResult>(EMPTY_ROUTE_RESULT);
	let routeLoading = $state<boolean>(false);

	let _routeDebounceTimer: ReturnType<typeof setTimeout> | null = null;
	let _routeAbortController: AbortController | null = null;

	function reparseAddressForNewSource() {
		const addr = formInput.addressInput.trim();
		if (addr && /^0x[a-fA-F0-9]{40}$/.test(addr) && parsedPayment.detectedNetwork) {
			const reparsed = parsePaymentAddress(addr, formInput.selectedSource as 'rootstock-bitcoin' | 'usdt-bsc' | 'usdt0-arb');
			if (reparsed.isValid) {
				parsedPayment.data = reparsed;
				parsedPayment.detectedNetwork = reparsed.network;
				formInput.destinationChainId = null;
				parsedPayment.detectedAmount = reparsed.amount;
				parsedPayment.detectedMemo = reparsed.memo;
				parsedPayment.amountRequired = reparsed.amount === null;
			}
		}
	}

	$effect(() => {
		// Read all reactive dependencies first
		const source = formInput.selectedSource;
		const destNetwork = parsedPayment.detectedNetwork;
		const destAddress = parsedPayment.data?.address || formInput.addressInput.trim();
		const sourceWallet = toSourceWallet(source, destNetwork);
		const dest = toDestination(destNetwork, destAddress, effectiveDestinationChainId);
		const sats = sendValidation.amountInSats;
		const userAddress =
			selectedWalletId !== 'builtin'
				? (getHandle(selectedWalletId)?.address ?? '')
				: source === 'usdt-bsc'
					? $walletStore.bsc.address
					: $walletStore.rsk.address;

		// Cancel any in-flight work
		let cancelled = false;

		if (_routeDebounceTimer) {
			clearTimeout(_routeDebounceTimer);
			_routeDebounceTimer = null;
		}
		if (_routeAbortController) {
			_routeAbortController.abort();
			_routeAbortController = null;
		}

		// No valid destination — clear routes
		if (!dest || !destAddress || !sats || !userAddress) {
			routeResult = EMPTY_ROUTE_RESULT;
			routeLoading = false;
			return;
		}

		// Show hardcoded routes immediately, sorted cheapest first
		const initialRoutes = resolveRoute(sourceWallet, dest).sort(
			(a, b) =>
				a.totalFeePercent - b.totalFeePercent ||
				a.hops[0].estimatedTimeMin - b.hops[0].estimatedTimeMin
		);
		routeResult = {
			routes: initialRoutes,
			recommended: initialRoutes[0] ?? null,
			errors: [],
			isLive: false
		};
		routeLoading = true;

		// Debounce async resolution (capture current values)
		const capturedSourceWallet = sourceWallet;
		const capturedDest = dest;
		const capturedAmount = sats;
		_routeAbortController = new AbortController();
		const capturedSignal = _routeAbortController.signal;

		_routeDebounceTimer = setTimeout(async () => {
			const { data: result, error } = await tryCatch(
				resolveRoutes(capturedSourceWallet, capturedDest, capturedAmount, capturedSignal)
			);
			if (error) {
				if (cancelled) return;
				d.warn('resolveRoutes failed', error);
				Sentry.addBreadcrumb({
					category: 'wallet.send.routes',
					message: 'resolveRoutes failed',
					data: {
						source: capturedSourceWallet,
						dest: capturedDest,
						error: String(error)
					}
				});
				routeLoading = false;
			} else if (!cancelled && result) {
				routeResult = result;
				routeLoading = false;
			}
		}, 400);

		return () => {
			cancelled = true;
			if (_routeDebounceTimer) {
				clearTimeout(_routeDebounceTimer);
				_routeDebounceTimer = null;
			}
		};
	});

	// Derived values — isSourceWalletConnected and isSelfSend must be defined
	// before the sendValidation rune since they're passed as getters.

	/** C3: CRITICAL - ensure the selected source wallet is connected with the required signer */
	const isSourceWalletConnected = $derived.by(() => {
		const source = formInput.selectedSource;
		if (selectedWalletId !== 'builtin') {
			// Connected wallet: check signer availability for the target network
			const net = parsedPayment.detectedNetwork;
			if (net === 'liquid-bitcoin') return false;
			if (net === 'bitcoin') return hasBitcoinSigner(selectedWalletId);
			// Lightning uses Boltz submarine swap — connected wallet sends RBTC via evmSigner
			if (net === 'lightning-bitcoin') {
				const handle = getHandle(selectedWalletId);
				return handle?.evmSigner !== undefined;
			}
			// EVM networks (rootstock-bitcoin, usdt-*): check evmSigner
			if (net) {
				const handle = getHandle(selectedWalletId);
				return handle?.evmSigner !== undefined;
			}
			return true;
		}
		if (source === 'usdt-bsc') return $walletStore.bsc.connected;
		return $walletStore.rsk.connected;
	});

	/** Whether the destination address matches the source wallet address (self-send) */
	const isSelfSend = $derived.by(() => {
		const destAddr = parsedPayment.data?.address || formInput.addressInput.trim();
		if (!destAddr) return false;

		let sourceAddr = '';
		if (selectedWalletId !== 'builtin') {
			sourceAddr = getHandle(selectedWalletId)?.address ?? '';
		} else {
			const source = formInput.selectedSource;
			if (source === 'usdt-bsc') {
				sourceAddr = $walletStore.bsc.address || '';
			} else {
				sourceAddr = $walletStore.rsk.address || '';
			}
		}
		if (!sourceAddr) return false;
		return sourceAddr.toLowerCase() === destAddr.toLowerCase();
	});

	let isOnline = $derived($browserNetworkStatus.online);

	// Form validation rune (extracts sendValidation.amountInSats, sendValidation.amountInUSD, sendValidation.availableBalance,
	// sendValidation.totalToSend, sendValidation.totalToSendUSD, sendValidation.hasInsufficientBalance, sendValidation.isBelowSwapMinimum,
	// sendValidation.isFormValid, sendValidation.isNetworkSupported)
	const sendValidation = useSendFormValidation({
		getFormInput: () => formInput,
		getParsedPayment: () => parsedPayment,
		getBtcPrice: () => btcPrice,
		getSendFeeEstimate: () => sendFee.feeEstimate,
		getSwapLimits: () => sendFee.swapLimits,
		getSelectedWalletId: () => selectedWalletId,
		getConnectedWallets: () => $connectedWalletsStore.wallets,
		getWalletStore: () => $walletStore,
		getIsOnline: () => isOnline,
		getIsSelfSend: () => isSelfSend,
		getIsSourceWalletConnected: () => isSourceWalletConnected,
		getAllAssets: () => $allAssets
	});

	const showLargeAmountWarning = $derived(sendValidation.amountInUSD > LARGE_AMOUNT_THRESHOLD);

	// Fee estimation rune (replaces inline updateFeeEstimate/fetchFeeParameters/calculateMaxAmount)
	const sendFee = useSendFeeEstimate({
		getSourceType: () => formInput.selectedSource,
		getDestNetwork: () => parsedPayment.detectedNetwork,
		getAmountSats: () => sendValidation.amountInSats,
		getAvailableBalance: () => sendValidation.availableBalance,
		getBtcPrice: () => btcPrice,
		getWalletManager: () => walletManager,
		getIsRskConnected: () => $walletStore.rsk.connected,
		getRskAddress: () => $walletStore.rsk.address,
		getRecipientAddress: () => parsedPayment.data?.address || null
	});

	const hasPreliminaryInsufficientBalance = $derived(
		sendValidation.amountInSats > 0 &&
			sendValidation.amountInSats > sendValidation.availableBalance &&
			sendFee.feeEstimate === null
	);

	// Initialize
	onMount(async () => {
		try {
			btcPrice = await cryptoPriceService.getCurrentPrice('BTC');
		} catch (error) {
			d.warn('Failed to fetch BTC price: %s', error);
			Sentry.addBreadcrumb({
				category: 'wallet.send',
				level: 'error',
				message: 'Failed to fetch BTC price',
				data: { error: String(error) }
			});
		}
	});

	// Handle QR scan (accepts both Barcode from Capacitor and string from html5-qrcode)
	function clearParsedPayment() {
		parsedPayment.data = null;
		parsedPayment.detectedNetwork = null;
		parsedPayment.detectedAmount = null;
		parsedPayment.detectedMemo = null;
		parsedPayment.amountRequired = true;
		formInput.unit = 'usd';
	}

	async function applyParsedAddress(
		rawAddress: string,
		context: { source: 'qr' | 'input' }
	): Promise<{ success: boolean; switchToEnter?: boolean }> {
		try {
			const result = parseSendAddress(
				rawAddress,
				formInput.selectedSource as 'rootstock-bitcoin' | 'usdt-bsc' | 'usdt0-arb'
			);

			if (!result.isValid) {
				clearParsedPayment();

				if (context.source === 'qr') {
					parsedPayment.addressError = null;
					formInput.addressInput = '';
					formInput.amount = '';
					formInput.memo = '';
					qrScanState.error =
						result.addressError === 'amountless_invoice'
							? $t('wallet.send.error.amountless_invoice')
							: result.addressError || $t('wallet.send.invalid_qr_code');
					qrScanState.scannedValue = rawAddress ?? null;
				} else {
					parsedPayment.addressError =
						result.addressError === 'amountless_invoice'
							? $t('wallet.send.error.amountless_invoice')
							: result.addressError || $t('wallet.send.invalid_address');
				}

				return { success: false };
			}

			// Valid address — populate parsed payment fields
			parsedPayment.data = result.data;
			if (context.source === 'qr') {
				formInput.addressInput = result.data?.address ?? rawAddress ?? '';
			}
			parsedPayment.detectedNetwork = result.network;
			// Clear user's destination chain override when address/network changes
			formInput.destinationChainId = null;
			parsedPayment.detectedAmount = result.amount;
			parsedPayment.detectedMemo = result.memo;
			parsedPayment.amountRequired = result.amountRequired;

			if (result.amount !== null) {
				formInput.amount = result.amount.toString();
				formInput.unit = 'sats';
			} else {
				formInput.unit = 'usd';
			}

			if (result.network === 'lightning-bitcoin') {
				formInput.memo = result.memo || $t('wallet.send.lightning_default_memo');
			} else if (result.memo) {
				formInput.memo = result.memo;
				uiState.descriptionExpanded = true;
			}

			// Input: wait for reactive updates before checking sendValidation.amountInSats
			if (context.source === 'input') {
				const { tick } = await import('svelte');
				await tick();
			}

			// LNURL async resolution
			if (result.isLnurl) {
				try {
					const lnurlParsed = await resolveLNURLPaymentAddress(rawAddress);
					parsedPayment.data = lnurlParsed;
					parsedPayment.detectedMemo = lnurlParsed.memo;
					if (lnurlParsed.lnurlDescription) {
						formInput.memo = lnurlParsed.lnurlDescription;
						uiState.descriptionExpanded = true;
					}
				} catch (err) {
					d.warn('Failed to resolve LNURL: %s', err);
					Sentry.addBreadcrumb({
						category: 'wallet.send.lnurl',
						level: 'error',
						message: 'Failed to resolve LNURL',
						data: { error: String(err) }
					});
					if (context.source === 'qr') {
						qrScanState.error = $t('wallet.send.failed_to_parse_qr');
					} else {
						parsedPayment.addressError = $t('wallet.send.failed_to_parse_address');
						clearParsedPayment();
					}
					return { success: false };
				} finally {
					// LNURL resolution complete
				}
			}

			return { success: true, switchToEnter: context.source === 'qr' };
		} catch (error) {
			d.warn('Failed to parse %s: %s', context.source === 'qr' ? 'QR code' : 'address', error);
			Sentry.addBreadcrumb({
				category: 'wallet.send.parse',
				level: 'error',
				message: `Failed to parse ${context.source === 'qr' ? 'QR code' : 'address'}`,
				data: { source: context.source, error: String(error) }
			});
			if (context.source === 'qr') {
				qrScanState.error = $t('wallet.send.failed_to_parse_qr');
				qrScanState.scannedValue = rawAddress ?? null;
			} else {
				parsedPayment.addressError = $t('wallet.send.failed_to_parse_address');
			}
			return { success: false };
		}
	}

	async function handleQRScan(barcode: Barcode | string) {
		const value = typeof barcode === 'string' ? barcode : barcode.rawValue;
		qrScanState.error = null;
		qrScanState.scannedValue = null;
		const result = await applyParsedAddress(value ?? '', { source: 'qr' });
		if (result.success && result.switchToEnter) {
			uiState.activeTab = 'enter';
			uiState.showConfirmation = false;
		}
	}

	async function handleAddressInput() {
		parsedPayment.addressError = null;
		if (!formInput.addressInput.trim()) {
			clearParsedPayment();
			return;
		}
		await applyParsedAddress(formInput.addressInput, { source: 'input' });
	}

	// Handle calculation change from calculator
	function handleCalculationChange(expression: string, result: number) {
		formInput.mathExpression = expression;
		if (result > 0 || expression === '') {
			if (formInput.unit === 'sats') {
				formInput.amount = Math.floor(result).toString();
			} else {
				formInput.amount = result.toFixed(2).replace(/\.?0+$/, '');
			}
		}
	}

	// Handle max amount click (uses sendFee.maxAmount from rune)
	let _maxCalcInFlight = false;
	async function handleMaxAmount() {
		if (_maxCalcInFlight) return;
		_maxCalcInFlight = true;
		try {
			formInput.mathExpression = '';
			const max = sendFee.maxAmount;
			if (max > 0) {
				if (formInput.unit === 'sats') {
					formInput.amount = max.toString();
				} else if (btcPrice > 0) {
					const usdAmount = (max / 100_000_000) * btcPrice;
					formInput.amount = usdAmount.toFixed(2).replace(/\.?0+$/, '');
				}
			}
		} finally {
			_maxCalcInFlight = false;
		}
	}

	// Handle amount input change (wrapper to trigger updates)
	function handleAmountInputChange(value: string) {
		formInput.amount = value;
	}

	// Handle unit change with conversion
	function handleUnitChange(newUnit: 'sats' | 'usd') {
		if (newUnit !== formInput.unit && formInput.amount) {
			const currentAmount = parseFloat(formInput.amount);
			if (!isNaN(currentAmount) && currentAmount > 0) {
				if (newUnit === 'usd' && btcPrice > 0) {
					// sats → USD
					formInput.amount = ((currentAmount / 100_000_000) * btcPrice)
						.toFixed(2)
						.replace(/\.?0+$/, '');
				} else if (newUnit === 'sats' && btcPrice > 0) {
					// USD → sats
					formInput.amount = Math.round((currentAmount * 100_000_000) / btcPrice).toString();
				}
			}
		}
		formInput.unit = newUnit;
		formInput.mathExpression = '';
	}

	// Clear calculator
	function handleClearCalculator() {
		formInput.amount = '';
		formInput.mathExpression = '';
		uiState.calculatorKey++;
	}

	// Handle unit toggle (for AmountDisplay compatibility)
	function handleUnitToggle() {
		handleUnitChange(formInput.unit === 'sats' ? 'usd' : 'sats');
	}

	// ── Handlers for SendPaymentDetailsTab callbacks ─────────────────────

	function handleClearAddress() {
		formInput.addressInput = '';
		formInput.destinationChainId = null;
		parsedPayment.data = null;
		parsedPayment.detectedNetwork = null;
		parsedPayment.detectedAmount = null;
		parsedPayment.detectedMemo = null;
		parsedPayment.addressError = null;
		parsedPayment.amountRequired = true;
		uiState.showRecentAddresses = false;
	}

	async function handlePasteAddress() {
		try {
			let text = '';
			if (Capacitor.isNativePlatform()) {
				const { Clipboard } = await import('@capacitor/clipboard');
				const result = await Clipboard.read();
				text = result.value ?? '';
			} else if (navigator.clipboard?.readText) {
				text = await navigator.clipboard.readText();
			}
			if (text) {
				formInput.addressInput = text.trim();
				await handleAddressInput();
			}
		} catch {
			d.warn('Failed to read clipboard');
		}
	}

	function handleRecentAddressSelect(address: string) {
		formInput.addressInput = address;
		uiState.showRecentAddresses = false;
		handleAddressInput();
	}

	function handleAddressChange(value: string) {
		formInput.addressInput = value;
		handleAddressInput();
	}

	function handleDestinationChange(networkId: string) {
		const chainId = NETWORK_TO_CHAIN_ID[networkId];
		if (chainId !== undefined) {
			formInput.destinationChainId = chainId;
		}
	}

	function clearPendingSendState() {
		sendState.pendingTxHash = null;
		sendState.pendingNetwork = null;
		sendState.pendingAmount = null;
		sendState.pendingAddress = null;
		sendState.pendingSwapId = null;
	}

	function handleSuccessDone() {
		uiState.showSuccessScreen = false;
		if (onSuccess && sendState.pendingTxHash && sendState.pendingNetwork) {
			onSuccess(sendState.pendingTxHash, sendState.pendingNetwork);
		}
		clearPendingSendState();
	}

	/** Sanitize raw error messages into user-friendly i18n strings. */
	function sanitizeErrorMessage(err: Error): string {
		const msg = err.message.toLowerCase();
		if (msg.includes('user rejected') || msg.includes('user denied'))
			return $t('wallet.send.error.user_rejected');
		if (msg.includes('insufficient funds') || msg.includes('insufficient balance'))
			return $t('wallet.send.error.insufficient_funds');
		if (msg.includes('network') || msg.includes('timeout'))
			return $t('wallet.send.error.network_error');
		if (msg.includes('invalid') || msg.includes('amount'))
			return $t('wallet.send.error.invalid_amount');
		return $t('wallet.send.transaction_failed');
	}

	// Handle send
	async function handleSend() {
		if (!sendValidation.isFormValid) return;

		const recipient = parsedPayment.data?.address || formInput.addressInput.trim();
		const finalAmount = sendValidation.totalToSend; // Amount including fees
		const network = parsedPayment.detectedNetwork || 'rootstock-bitcoin';

		if (!recipient || finalAmount <= 0) {
			appStore.showErrorToast(
				$t('wallet.send.error.invalid_payment_details'),
				UI.WALLET_TOAST_DURATION_MS
			);
			sendState.isSending = false;
			return;
		}

		// Safety check: Block amountless Lightning invoices at submission time
		// This is a backup validation in case the UI validation was bypassed
		if (network === 'lightning-bitcoin' && parsedPayment.data) {
			const lightningType = detectLightningType(recipient);
			if (lightningType === 'bolt11') {
				const invoiceParsed = parseLightningInvoice(recipient);
				if (invoiceParsed.isValid && !invoiceParsed.hasAmount) {
					appStore.showErrorToast(
						$t('wallet.send.error.amountless_invoice'),
						UI.WALLET_TOAST_DURATION_MS
					);
					return;
				}
			}
			if (sendValidation.isBelowSwapMinimum && sendFee.swapLimits) {
				appStore.showErrorToast(
					$t('wallet.receive.below_swap_minimum', {
						values: { minAmount: formatSats(sendFee.swapLimits.minimal) }
					}),
					UI.WALLET_TOAST_DURATION_MS
				);
				return;
			}
		}

		// Show sending state immediately (optimistically)
		sendState.pendingTxHash = null;
		sendState.pendingNetwork = network;
		sendState.pendingAmount = sendValidation.amountInSats;
		sendState.pendingAddress = recipient;
		sendState.isSending = true; // Show loading until we have actual txHash
		sendState.error = null;
		sendState.pendingSwapId = null;

		// For connected wallets, show the external-confirm UI instead of the spinner
		const isConnectedSource = selectedWalletId !== 'builtin';
		if (isConnectedSource) {
			const handle = getHandle(selectedWalletId);
			if (handle) {
				sendState.externalConfirmSource = handle.walletName;
			}
			sendState.isSending = false;
		}

		const selectedRoute = routeResult.routes.find((r) => r.id === selectedRouteId);

		try {
			const result = await executeSend({
				network,
				recipient,
				amountInSats: sendValidation.amountInSats,
				amountInUSD: sendValidation.amountInUSD,
				memo: formInput.memo,
				selectedWalletId,
				parsedPayment: {
					data: parsedPayment.data as
						| import('$lib/services/send-execution.service').ParsedPaymentData
						| null,
					lnurlCallback: parsedPayment.data?.lnurlCallback
				},
				walletManager:
					walletManager as unknown as import('$lib/services/send-execution.service').SendWalletManager,
				route: selectedRoute ?? null,
				sourceWalletId: toSourceWallet(formInput.selectedSource, network),
				dest: toDestination(parsedPayment.detectedNetwork, recipient)
			});

			// Update send state based on result
			if (result.txHash) {
				sendState.pendingTxHash = result.txHash;
				sendState.pendingNetwork = network;
				sendState.pendingAmount = sendValidation.amountInSats;
				sendState.pendingAddress = recipient;
				sendState.isSending = false;

				// Arbitrum fast-path — confirms in <1s, no persistent toast needed
				if (network === 'usdt0-arb') {
					appStore.showSuccessToast($t('wallet.send.sent_successfully'), 2000);
					walletManager.loadAssets();
					clearPendingSendState();
					if (onSuccess) {
						onSuccess(result.txHash, network);
					}
				} else {
					// All other chains: register blockchain toast
					const requiredConfirmations = REQUIRED_CONFIRMATIONS[network] ?? 3;
					blockchainToastStore.add({
						id: crypto.randomUUID(),
						type: 'send',
						status: 'confirming',
						network,
						amount: sendValidation.amountInSats,
						amountUSD: sendValidation.amountInUSD,
						asset: getAssetForNetwork(network),
						recipient,
						sourceAddress: getSourceAddress(network),
						txHash: result.txHash,
						swapId: result.pendingSwapId ?? null,
						swapType: null,
						currentBlock: null,
						requiredConfirmations,
						error: null,
						errorValues: null,
						actions: []
					});
					uiState.showSuccessScreen = true;
				}
			}
			if (result.pendingSwapId) {
				sendState.pendingSwapId = result.pendingSwapId;
			}
			if (result.pendingSwapChain) {
				sendState.pendingSwapChain = result.pendingSwapChain;
				sendState.isSending = false;
				appStore.showSuccessToast(
					$t('wallet.send.transaction_sending'),
					UI.WALLET_TOAST_DURATION_MS
				);
				if (onSuccess) {
					onSuccess('', network);
				}
			}
		} catch (err) {
			d.warn('Send failed: %s', err);
			Sentry.addBreadcrumb({
				category: 'wallet.send',
				level: 'error',
				message: 'Send failed',
				data: { error: String(err), network }
			});
			clearPendingSendState();
			sendState.error =
				err instanceof Error ? sanitizeErrorMessage(err) : $t('wallet.send.transaction_failed');
			appStore.showErrorToast(sendState.error, UI.WALLET_TOAST_DURATION_MS);
		} finally {
			sendState.isSending = false;
			sendState.externalConfirmSource = null;
		}
	}

	// Handle showing send confirmation
	function showSendConfirmationModal() {
		uiState.showSendConfirmation = true;
	}

	// Handle confirmed send
	async function handleConfirmedSend() {
		uiState.showSendConfirmation = false;
		await handleSend();
	}

</script>

<div class="send-payment-form flex min-h-0 flex-1 flex-col">
	<!-- Transaction Success Screen -->
	{#if uiState.showSuccessScreen}
		<TransactionSuccessScreen
			txHash={sendState.pendingTxHash ?? ''}
			network={sendState.pendingNetwork ?? ''}
			amount={sendState.pendingAmount ?? 0}
			recipient={sendState.pendingAddress ?? ''}
			onClose={handleSuccessDone}
		/>
		<!-- Gasless Send Flow (Arbitrum only) -->
	{:else}
		<!-- Normal Form Content -->
		<div
			class="tabs tabs-boxed tabs-reversed border-base-300 mb-3 shrink-0 overflow-hidden rounded-lg border sm:mb-4"
			class:flex-row-reverse={!isWeb}
		>
			<button
				class="tab flex-1"
				class:bg-primary={uiState.activeTab === 'scan'}
				class:text-primary-content={uiState.activeTab === 'scan'}
				class:tab-active={uiState.activeTab === 'scan'}
				onclick={() => {
					uiState.activeTab = 'scan';
					uiState.showConfirmation = false;
				}}
			>
				{$t('wallet.send.scan_qr_code')}
			</button>
			<button
				class="tab flex-1"
				class:bg-primary={uiState.activeTab === 'enter'}
				class:text-primary-content={uiState.activeTab === 'enter'}
				class:tab-active={uiState.activeTab === 'enter'}
				onclick={() => {
					uiState.activeTab = 'enter';
					uiState.showConfirmation = false;
				}}
			>
				{$t('wallet.send.payment_details')}
			</button>
		</div>

		<!-- Scrollable Content Area -->
		<div class="min-h-0 flex-1 space-y-3 overflow-y-auto sm:space-y-4">
			{#if uiState.activeTab === 'scan'}
				{#if !uiState.showConfirmation}
					<!-- QR Code Scanner -->
					<SendQrScanner
						onScan={handleQRScan}
						onClose={() => {
							if (!qrScanState.error) {
								uiState.activeTab = 'enter';
							}
						}}
						error={qrScanState.error}
						scannedValue={qrScanState.scannedValue}
						onRetry={() => {
							qrScanState.error = null;
							qrScanState.scannedValue = null;
						}}
					/>
				{:else}
					<!-- Confirmation Screen -->
					{#if parsedPayment.detectedNetwork}
						{@const netOption = getNetworkOption(parsedPayment.detectedNetwork ?? '')}
						{@const recipientAddress = parsedPayment.data?.address || formInput.addressInput.trim()}
						{@const explorerUrl = getAddressExplorerUrl(
							recipientAddress,
							parsedPayment.detectedNetwork
						)}
						<SendConfirmScreen
							amount={formInput.amount}
							unit={formInput.unit}
							{btcPrice}
							network={parsedPayment.detectedNetwork}
							networkIcon={netOption?.icon ?? null}
							networkName={netOption?.name ?? null}
							{explorerUrl}
							address={formInput.addressInput}
							hasInsufficientBalance={sendValidation.hasInsufficientBalance &&
								sendFee.feeEstimate !== null}
							isSending={sendState.isSending}
							isBelowSwapMinimum={sendValidation.isBelowSwapMinimum}
							showAmountInput={parsedPayment.amountRequired}
							{showLargeAmountWarning}
							largeAmountWarningText={showLargeAmountWarning
								? $t('wallet.send.large_amount_warning.message', {
										values: { amount: formatUsd(sendValidation.amountInUSD) }
									})
								: ''}
							amountInputAmount={formInput.amount}
							amountInputUnit={formInput.unit}
							mathExpression={formInput.mathExpression}
							calculatorKey={uiState.calculatorKey}
							isLoadingMaxCalculation={sendFee.isLoading}
							onBack={() => (uiState.showConfirmation = false)}
							onSend={handleSend}
							onUnitToggle={handleUnitToggle}
							onAmountChange={handleAmountInputChange}
							onUnitChange={handleUnitChange}
							onCalculationChange={handleCalculationChange}
							onClear={handleClearCalculator}
							onMaxAmount={handleMaxAmount}
						/>
					{/if}
				{/if}
			{/if}

			{#if uiState.activeTab === 'enter'}
				<SendPaymentDetailsTab
					addressInput={formInput.addressInput}
					addressError={parsedPayment.addressError}
					isValidAddress={parsedPayment.data?.isValid === true}
					{recentAddresses}
					showRecentAddresses={uiState.showRecentAddresses}
					amount={formInput.amount}
					unit={formInput.unit}
					{btcPrice}
					mathExpression={formInput.mathExpression}
					calculatorKey={uiState.calculatorKey}
					amountInUSD={sendValidation.amountInUSD}
					isAmountDisabled={parsedPayment.detectedAmount !== null &&
						parsedPayment.detectedAmount > 0}
					routes={routeResult.routes}
					{selectedRouteId}
					networkFeeSats={sendFee.feeEstimate?.networkFee ?? 0}
					isLoadingFee={sendFee.isLoading || routeLoading}
					network={parsedPayment.detectedNetwork}
					amountSats={sendValidation.amountInSats}
					hasAddress={parsedPayment.data?.isValid === true &&
						parsedPayment.detectedNetwork !== null}
					hasAmount={sendValidation.amountInSats > 0}
					feeError={sendFee.error}
					isLoadingMaxCalculation={sendFee.isLoading}
					totalToSend={sendValidation.totalToSend}
					totalToSendUSD={sendValidation.totalToSendUSD}
					totalUnit={parsedPayment.detectedNetwork === 'usdt-bsc' ||
					formInput.selectedSource === 'usdt-bsc'
						? 'usdt'
						: formInput.unit}
					hasInsufficientBalance={sendValidation.hasInsufficientBalance &&
						sendFee.feeEstimate !== null}
					{hasPreliminaryInsufficientBalance}
					isFormValid={sendValidation.isFormValid}
					{isSelfSend}
					{showLargeAmountWarning}
					{selectedWalletId}
					connectedWallets={$connectedWalletsStore.wallets}
					walletBtcSatsFor={walletBtcSatsForFn}
					walletUsdt0For={walletUsdt0ForFn}
					selectedAssetId={formInput.selectedSource}
					{sourceAssets}
					destinationNetwork={CHAIN_ID_TO_NETWORK[effectiveDestinationChainId] ?? ''}
					{isDestinationLocked}
					destinationLockedLabel={!hasAddress ? $t('wallet.send.enter_address') : ''}
					memo={formInput.memo}
					descriptionExpanded={uiState.descriptionExpanded}
					detectedMemo={parsedPayment.detectedMemo}
					transactionError={sendState.error}
					externalConfirmSource={sendState.externalConfirmSource}
					isSending={sendState.isSending}
					onAddressChange={handleAddressChange}
					onClearAddress={handleClearAddress}
					onAddressFocus={() => (uiState.showRecentAddresses = recentAddresses.length > 0)}
					onAddressBlur={() => setTimeout(() => (uiState.showRecentAddresses = false), 200)}
					onRecentAddressSelect={handleRecentAddressSelect}
					onAmountChange={handleAmountInputChange}
					onUnitChange={handleUnitChange}
					onCalculationChange={handleCalculationChange}
					onClear={handleClearCalculator}
					onMaxAmount={handleMaxAmount}
					onRouteSelect={(id) => (userSelectedRouteId = id)}
				onWalletSelect={(id) => { selectedWalletId = id; reparseAddressForNewSource(); }}
				onAssetSelect={(id) => { formInput.selectedSource = id; reparseAddressForNewSource(); }}
					onDestinationChange={handleDestinationChange}
					onMemoChange={(value) => (formInput.memo = value)}
					onDescriptionToggle={(expanded) => (uiState.descriptionExpanded = expanded)}
					onSend={showSendConfirmationModal}
					{onCancel}
					onPasteAddress={handlePasteAddress}
				/>
			{/if}
		</div>

		<!-- Cancel Button (Bottom, only on Scan QR Code tab) -->
		{#if uiState.activeTab === 'scan' && !uiState.showConfirmation}
			<div class="flex w-full shrink-0 justify-center pb-4">
				<button
					class="btn btn-error min-h-[48px] touch-manipulation transition-transform duration-100 select-none active:scale-95 md:min-h-[56px]"
					onclick={onCancel}
				>
					<IconClose class="mr-2 h-5 w-5" />
					{$t('common.cancel')}
				</button>
			</div>
		{/if}
	{/if}

	<!-- Send Confirmation Modal -->
	{#if uiState.showSendConfirmation}
		{@const recipientAddress = parsedPayment.data?.address || formInput.addressInput.trim()}
		{@const explorerUrl = getAddressExplorerUrl(recipientAddress, parsedPayment.detectedNetwork)}
		{@const estimatedTime =
			getNetworkOption(parsedPayment.detectedNetwork ?? '')?.confirmationTime ?? 0}
		<dialog class="modal z-120" open>
			<div class="modal-box max-w-md">
				<h3 class="text-lg font-bold">{$t('wallet.send.confirm_payment')}</h3>
				<div class="space-y-4 py-4">
					<!-- Address Accordion -->
					<AddressAccordion
						address={recipientAddress}
						{explorerUrl}
						label={$t('wallet.send.address_or_invoice')}
					/>

					<!-- Amount -->
					<div class="space-y-1">
						<div class="text-sm font-medium opacity-70">{$t('wallet.send.amount')}</div>
						<div class="font-semibold">
							{#if formInput.unit === 'sats'}
								{formatSats(sendValidation.amountInSats)}
								{$t('wallet.sats')}
								{#if btcPrice > 0}
									<span class="ml-2 text-sm opacity-70">
										≈ {formatUsd(sendValidation.amountInUSD)}
									</span>
								{/if}
							{:else}
								{formatUsd(sendValidation.amountInUSD)}
								{#if btcPrice > 0}
									<span class="ml-2 text-sm opacity-70">
										≈ {formatSats(sendValidation.amountInSats)}
										{$t('wallet.sats')}
									</span>
								{/if}
							{/if}
						</div>
					</div>

					<!-- Estimated Transaction Fees -->
					{#if sendFee.feeEstimate && sendFee.feeEstimate.totalFees > 0}
						<div class="space-y-1">
							<div class="text-sm font-medium opacity-70">
								{$t('wallet.send.transaction_fee')}
							</div>
							<div class="font-semibold">
								{formatSats(sendFee.feeEstimate.totalFees)}
								{$t('wallet.sats')}
								{#if btcPrice > 0}
									<span class="ml-2 text-sm opacity-70">
										≈ {formatUsd((sendFee.feeEstimate.totalFees / 100_000_000) * btcPrice)}
									</span>
								{/if}
							</div>
						</div>
					{/if}

					<!-- Total Cost Summary (L15) -->
					{#if sendFee.feeEstimate && sendFee.feeEstimate.totalFees > 0 && sendValidation.amountInSats > 0}
						<div class="border-base-300 space-y-1 border-t pt-3">
							<div class="text-sm font-medium opacity-70">
								{$t('wallet.send.total_cost')}
							</div>
							<div class="text-base font-bold">
								{#if formInput.unit === 'sats'}
									{formatSats(sendValidation.amountInSats + sendFee.feeEstimate.totalFees)}
									{$t('wallet.sats')}
									{#if btcPrice > 0}
										<span class="text-sm font-normal opacity-70">
											≈ {formatUsd(
												sendValidation.amountInUSD +
													(sendFee.feeEstimate.totalFees / 100_000_000) * btcPrice
											)}
										</span>
									{/if}
								{:else}
									{formatUsd(
										sendValidation.amountInUSD +
											(sendFee.feeEstimate.totalFees / 100_000_000) * btcPrice
									)}
									{#if btcPrice > 0}
										<span class="text-sm font-normal opacity-70">
											≈ {formatSats(sendValidation.amountInSats + sendFee.feeEstimate.totalFees)}
											{$t('wallet.sats')}
										</span>
									{/if}
								{/if}
							</div>
						</div>
					{/if}

					<!-- Estimated Time -->
					<div class="space-y-1">
						<div class="text-sm font-medium opacity-70">
							{$t('wallet.send.estimated_confirmation_time')}
						</div>
						<div class="font-semibold">
							{#if parsedPayment.detectedNetwork === 'lightning-bitcoin'}
								{$t('wallet.send.estimated_time_1_2_minutes')}
							{:else if estimatedTime > 0}
								{estimatedTime} {$t('wallet.send.seconds')}
							{:else}
								{$t('wallet.send.instant')}
							{/if}
						</div>
					</div>

					<!-- Insufficient Balance Error -->
					{#if sendValidation.hasInsufficientBalance && sendFee.feeEstimate}
						<div class="space-y-1 pt-1">
							<p class="text-error text-md">
								{$t('wallet.validation.insufficient_balance')}
							</p>
						</div>
					{/if}

					<!-- Warning -->
					<div class="alert alert-outline alert-warning mt-4">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-6 w-6 shrink-0 stroke-current"
							fill="none"
							viewBox="0 0 24 24"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
							/>
						</svg>
						<span class="text-sm">{$t('wallet.send.confirmation_warning')}</span>
					</div>
				</div>
				<div class="modal-action">
					<button class="btn btn-ghost" onclick={() => (uiState.showSendConfirmation = false)}>
						{$t('common.cancel')}
					</button>
					<button
						class="btn btn-primary"
						onclick={handleConfirmedSend}
						disabled={(sendValidation.hasInsufficientBalance && sendFee.feeEstimate !== null) ||
							sendState.externalConfirmSource !== null}
					>
						{$t('wallet.send.send')}
					</button>
				</div>
			</div>
			<form method="dialog" class="modal-backdrop">
				<button
					onclick={() => {
						uiState.showSendConfirmation = false;
					}}>{$t('common.close')}</button
				>
			</form>
		</dialog>
	{/if}
</div>

<style>
	.send-payment-form :global(button) {
		-webkit-tap-highlight-color: transparent;
	}
</style>

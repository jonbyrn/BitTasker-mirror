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
		getBSCSponsorStatus,
		preflightBSCDirectSend,
		submitBSCDirectSend,
		type BscDirectSendPreflightResult,
		type BscSponsorStatus
	} from '$lib/stores/wallet.store';
	import {
		parsePaymentAddress,
		qualifyEvmPaymentAddress,
		type ParsedPaymentAddress
	} from '$lib/utils/helpers/paymentAddressParser';
	import { btcUsd, marketPrice, marketPriceMeta } from '$lib/stores/market-price.store';
	import { triggerHaptic, ImpactStyle } from '$lib/utils/helpers/haptics';
	import { copyToClipboard } from '$lib/utils/helpers/clipboard';
	import QrCodeScanner from '$lib/components/QrCodeScanner.svelte';
	import WebQrCodeScanner from '$lib/components/WebQrCodeScanner.svelte';
	import AmountDisplay from '$lib/components/wallet/AmountDisplay.svelte';
	import AmountInputSection from '$lib/components/wallet/AmountInputSection.svelte';
	import DescriptionAccordion from '$lib/components/wallet/DescriptionAccordion.svelte';
	import TransactionSuccessScreen from '$lib/components/wallet/TransactionSuccessScreen.svelte';
	import PendingTransactionScreen from '$lib/components/wallet/PendingTransactionScreen.svelte';
	import IconClose from '~icons/mdi/close';
	import IconSend from '~icons/mdi/send';
	import IconContentCopy from '~icons/mdi/content-copy';
	import IconChevronLeft from '~icons/mdi/chevron-left';
	import IconChevronRight from '~icons/mdi/chevron-right';
	import IconOpenInNew from '~icons/mdi/open-in-new';
	import IconRefresh from '~icons/mdi/refresh';
	import IconCurrencyUsd from '~icons/mdi/currency-usd';
	import AddressAccordion from '$lib/components/wallet/AddressAccordion.svelte';
	import { toAtomicAmountString } from '$lib/utils/helpers/paymentContext';

	let { onCancel, onSuccess } = $props<{
		onCancel: () => void;
		onSuccess?: (txHash: string, network: string) => void;
	}>();

	// Constants
	const LARGE_AMOUNT_THRESHOLD = 1000; // $1,000 USD

	// Platform detection
	const isWeb = Capacitor.getPlatform() === 'web';

	const netwokrOption = {
		'rootstock-bitcoin': {
			icon: '/images/chains/Bitcoin-Rootstock-logo.webp',
			name: $t('wallet.transaction.network.rootstock_bitcoin'),
			confirmationTime: 30,
			fallbackFee: 3000
		},
		'lightning-bitcoin': {
			icon: '/images/chains/lightning.svg',
			name: $t('wallet.networks.lightning'),
			confirmationTime: 0,
			fallbackFee: 4000
		},
		'liquid-bitcoin': {
			icon: '/images/chains/Liquid-Bitcoin.svg',
			name: $t('wallet.networks.liquid'),
			confirmationTime: 60,
			fallbackFee: 4000
		},
		bitcoin: {
			icon: '/images/chains/Bitcoin.svg',
			name: $t('wallet.networks.bitcoin'),
			confirmationTime: 600,
			fallbackFee: 4000
		},
		'usdt-bsc': {
			icon: '/images/chains/Binance-logo.svg',
			name: $t('wallet.transaction.network.binance_smart_chain'),
			confirmationTime: 5,
			fallbackFee: 4000
		}
	};

	const BSC_USDT_DECIMALS = 6;
	const BSC_USDT_ATOMIC_FACTOR = 10 ** BSC_USDT_DECIMALS;
	const RSK_WEI_PER_SAT = 10n ** 10n;
	const BSC_CHAIN_ID = (import.meta.env.VITE_BSC_NETWORK || 'testnet') === 'mainnet' ? 56 : 97;
	const BSC_DIRECT_SEND_CONFIG = {
		tokenAddress: (import.meta.env.VITE_BSC_USDT_TOKEN_ADDRESS || '').trim(),
		routerAddress: (import.meta.env.VITE_BSC_DIRECT_SEND_ROUTER_ADDRESS || '').trim(),
		fixedFeeAtomic: (import.meta.env.VITE_BSC_DIRECT_SEND_FIXED_FEE_ATOMIC || '0').trim() || '0'
	};

	// Grouped State: Form Input & Address Data
	let formInput = $state({
		addressInput: '',
		amount: '',
		unit: 'usd' as 'sats' | 'usd',
		mathExpression: '',
		memo: ''
	});

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

	let ambiguousAddress = $state<{
		rawInput: string;
		source: 'manual' | 'scan';
	} | null>(null);

	// Grouped State: UI State
	let uiState = $state({
		activeTab: 'scan' as 'scan' | 'enter',
		showConfirmation: false,
		showSendConfirmation: false,
		showSuccessScreen: false,
		descriptionExpanded: false,
		networkFeeExpanded: false,
		calculatorKey: 0,
		showRecentAddresses: false,
		currentStep: 1 as 1 | 2 // Step 1: Address + Amount, Step 2: Details
	});

	// Grouped State: QR Scan State
	let qrScanState = $state<{
		error: string | null;
		scannedValue: string | null;
	}>({
		error: null,
		scannedValue: null
	});

	// Grouped State: Fee Estimation & Max Calculation
	let feeState = $state<{
		estimated: {
			serviceFee: number;
			networkFee: number;
			totalFees: number;
		} | null;
		isLoading: boolean;
		error: string | null;
		parameters: {
			percentage?: number;
			fixedFee?: number;
		} | null;
		maxCalculation: {
			isLoading: boolean;
			amount: number | null;
		};
	}>({
		estimated: null,
		isLoading: false,
		error: null,
		parameters: null,
		maxCalculation: {
			isLoading: false,
			amount: null
		}
	});

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
	}>({
		isSending: false,
		error: null,
		successTxHash: null,
		successNetwork: null,
		pendingTxHash: null,
		pendingNetwork: null,
		pendingAmount: null,
		pendingAddress: null,
		pendingSwapId: null
	});

	let bscDirectSendState = $state<{
		isChecking: boolean;
		sponsorStatus: BscSponsorStatus | null;
		lastPreflight: BscDirectSendPreflightResult | null;
		blockedMessage: string | null;
	}>({
		isChecking: false,
		sponsorStatus: null,
		lastPreflight: null,
		blockedMessage: null
	});

	// Global BTC price from shared market store
	const btcPrice = $derived.by(() => $btcUsd);
	const isBitcoinPriceLoading = $derived.by(() => {
		if (btcPrice > 0) return false;
		return (
			$marketPriceMeta.isRefreshing ||
			(!$marketPriceMeta.error && $marketPriceMeta.lastFetched === 0)
		);
	});
	const hasBitcoinPriceRefreshFailure = $derived.by(() => {
		if (btcPrice > 0) return false;
		return !$marketPriceMeta.isRefreshing && !!$marketPriceMeta.error;
	});
	const detectedBalanceRail = $derived.by(() => {
		if (
			parsedPayment.detectedNetwork === 'rootstock-bitcoin' ||
			parsedPayment.detectedNetwork === 'lightning-bitcoin'
		) {
			return 'rsk';
		}
		if (parsedPayment.detectedNetwork === 'usdt-bsc') {
			return 'bsc';
		}
		return null;
	});
	const currentBalanceFreshness = $derived.by(() =>
		detectedBalanceRail ? ($walletStore.balanceFreshness?.[detectedBalanceRail] ?? null) : null
	);
	let isRetryingBitcoinPrice = $state(false);
	const hasBitcoinPriceRetryState = $derived(
		hasBitcoinPriceRefreshFailure || isRetryingBitcoinPrice
	);
	const hasStepOneWarning = $derived(!!currentBalanceFreshness?.error || hasBitcoinPriceRetryState);
	let lastUsdValidationBtcPrice = $state(0);
	let recentAddresses = $state<Array<{ address: string; network: string; label?: string }>>([]);

	function formatUsdtAmount(
		amount: number,
		maximumFractionDigits = BSC_USDT_DECIMALS,
		minimumFractionDigits = 0
	): string {
		if (!Number.isFinite(amount)) return '0';

		return new Intl.NumberFormat('en-US', {
			minimumFractionDigits,
			maximumFractionDigits
		}).format(amount);
	}

	function sanitizeTokenAmount(value: number): number {
		if (!Number.isFinite(value) || value <= 0) return 0;
		return Number(value.toFixed(BSC_USDT_DECIMALS));
	}

	function formatEditableAmount(value: number): string {
		return value
			.toFixed(parsedPayment.detectedNetwork === 'usdt-bsc' ? BSC_USDT_DECIMALS : 2)
			.replace(/\.?0+$/, '');
	}

	function atomicToUsdtAmount(value: string | null | undefined): number {
		if (!value) return 0;

		try {
			return Number(value) / BSC_USDT_ATOMIC_FACTOR;
		} catch {
			return 0;
		}
	}

	function weiToSatsAmount(value: string | null | undefined): number {
		if (!value) return 0;

		try {
			return Number(BigInt(value) / RSK_WEI_PER_SAT);
		} catch {
			return 0;
		}
	}

	function requiresWalletBalance(network: string | null): boolean {
		return (
			network === 'rootstock-bitcoin' || network === 'lightning-bitcoin' || network === 'usdt-bsc'
		);
	}

	function hasConnectedBalanceRail(network: string | null): boolean {
		if (network === 'usdt-bsc') return $walletStore.bsc.connected;
		if (network === 'rootstock-bitcoin' || network === 'lightning-bitcoin') {
			return $walletStore.rsk.connected;
		}
		return true;
	}

	function formatNetworkAmount(
		amount: number,
		network: string | null,
		options: { includeApproxUsd?: boolean; preferredUnit?: 'sats' | 'usd' } = {}
	): string {
		if (network === 'usdt-bsc') {
			if (amount <= 0) return '$0.00';
			return `${formatUsdtAmount(amount, 2, 2)} USDT`;
		}

		const satsLabel = `${formatSats(Math.max(0, Math.floor(amount)))} ${$t('wallet.sats')}`;
		if (!options.includeApproxUsd) {
			return satsLabel;
		}

		if (amount <= 0) {
			return `${satsLabel} ($0.00)`;
		}

		if (btcPrice <= 0) {
			return satsLabel;
		}

		const approxUsd = formatUsd((amount / 100_000_000) * btcPrice);
		return `${satsLabel} (${approxUsd})`;
	}

	function getBalanceRailName(network: string | null): string {
		if (network === 'usdt-bsc') return $t('wallet.send.balance.rail.bsc');
		if (network === 'rootstock-bitcoin' || network === 'lightning-bitcoin') {
			return $t('wallet.send.balance.rail.rootstock');
		}
		return $t('wallet.send.balance.rail.wallet');
	}

	async function refreshDetectedNetworkBalance(force = false): Promise<void> {
		const network = parsedPayment.detectedNetwork;
		if (!requiresWalletBalance(network) || !hasConnectedBalanceRail(network)) {
			return;
		}

		await walletManager.ensureFreshBalances({
			rails:
				network === 'usdt-bsc'
					? ['bsc']
					: network === 'rootstock-bitcoin' || network === 'lightning-bitcoin'
						? ['rsk']
						: undefined,
			force
		});
	}

	function getBscConfigError(): string | null {
		if (!BSC_DIRECT_SEND_CONFIG.tokenAddress) {
			return $t('wallet.send.bsc.config.token_missing');
		}

		if (!BSC_DIRECT_SEND_CONFIG.routerAddress) {
			return $t('wallet.send.bsc.config.router_missing');
		}

		return null;
	}

	function mapBscPreflightFailure(
		result: BscDirectSendPreflightResult,
		sponsorStatus: BscSponsorStatus | null
	): string {
		switch (result.failureCode) {
			case 'WRONG_CHAIN':
				return $t('wallet.send.bsc.failure.wrong_chain');
			case 'UNSUPPORTED_CHAIN':
				return result.failureMessage || $t('wallet.send.bsc.failure.unsupported_chain');
			case 'ROUTER_ALLOWANCE_MISSING':
			case 'INSUFFICIENT_ALLOWANCE':
				return $t('wallet.send.bsc.failure.router_allowance_missing');
			case 'INSUFFICIENT_USDT_BALANCE':
			case 'INSUFFICIENT_BALANCE':
				return $t('wallet.send.bsc.failure.insufficient_balance');
			case 'TOKEN_CONFIG_MISMATCH':
			case 'INVALID_ADDRESS':
				return $t('wallet.send.bsc.failure.token_config_mismatch');
			case 'SPONSOR_TREASURY_LOW':
				return result.failureMessage || $t('wallet.send.bsc.failure.sponsor_treasury_low');
			case 'ROUTER_NOT_FOUND':
			case 'ROUTER_PAUSED':
				return result.failureMessage || $t('wallet.send.bsc.failure.router_not_ready');
			case 'REQUEST_EXPIRED':
			case 'DUPLICATE_REQUEST':
			case 'SUBMISSION_FAILED':
			case 'RATE_LIMITED':
			case 'INTERNAL_ERROR':
				return result.failureMessage || $t('wallet.send.bsc.failure.submission_failed');
			case 'NETWORK_ERROR':
				return result.failureMessage || $t('wallet.send.bsc.failure.network_error');
			case 'POLICY_REJECTED':
				return result.failureMessage || $t('wallet.send.bsc.failure.policy_rejected');
			case 'LEGACY_ONLY':
				return result.failureMessage || $t('wallet.send.bsc.failure.legacy_only');
			case 'SUBMISSION_UNSUPPORTED':
				return result.failureMessage || $t('wallet.send.bsc.failure.submission_unsupported');
			case 'SPONSOR_UNAVAILABLE':
			default:
				return (
					result.failureMessage ||
					sponsorStatus?.reason ||
					$t('wallet.send.bsc.failure.sponsor_unavailable')
				);
		}
	}

	function getBscBlockedHeading(): string {
		switch (bscDirectSendState.lastPreflight?.failureCode) {
			case 'WRONG_CHAIN':
				return $t('wallet.send.bsc.blocked.heading.wrong_chain');
			case 'ROUTER_ALLOWANCE_MISSING':
			case 'INSUFFICIENT_ALLOWANCE':
				return $t('wallet.send.bsc.blocked.heading.approve_router');
			case 'INSUFFICIENT_USDT_BALANCE':
			case 'INSUFFICIENT_BALANCE':
				return $t('wallet.send.bsc.blocked.heading.insufficient_usdt');
			default:
				return $t('wallet.send.bsc.blocked.heading.unavailable');
		}
	}

	// Derived values
	const amountInSats = $derived.by(() => {
		if (parsedPayment.detectedAmount !== null) return parsedPayment.detectedAmount;
		if (formInput.unit === 'sats') {
			const parsed = parseFloat(formInput.amount);
			return isNaN(parsed) ? 0 : Math.floor(parsed);
		} else {
			const usdAmount = parseFloat(formInput.amount);
			if (isNaN(usdAmount) || btcPrice === 0) return 0;
			return Math.floor((usdAmount / btcPrice) * 100_000_000);
		}
	});

	const amountInUsdt = $derived.by(() => {
		if (parsedPayment.detectedNetwork !== 'usdt-bsc') return 0;
		if (parsedPayment.detectedAmount !== null)
			return sanitizeTokenAmount(parsedPayment.detectedAmount);

		if (formInput.unit === 'usd') {
			return sanitizeTokenAmount(Number.parseFloat(formInput.amount));
		}

		if (btcPrice === 0 || amountInSats <= 0) return 0;
		return sanitizeTokenAmount((amountInSats / 100_000_000) * btcPrice);
	});

	const bscFixedFeeAmount = $derived(atomicToUsdtAmount(BSC_DIRECT_SEND_CONFIG.fixedFeeAtomic));

	const amountInUSD = $derived.by(() => {
		if (parsedPayment.detectedNetwork === 'usdt-bsc') {
			return amountInUsdt;
		}

		if (btcPrice === 0) return 0;
		return (amountInSats / 100_000_000) * btcPrice;
	});

	const showLargeAmountWarning = $derived(amountInUSD > LARGE_AMOUNT_THRESHOLD);

	const totalToSend = $derived.by(() => {
		if (parsedPayment.detectedNetwork === 'usdt-bsc') {
			return amountInUsdt + (feeState.estimated?.totalFees || 0);
		}

		return amountInSats + (feeState.estimated?.totalFees || 0);
	});

	// Total to send in USD
	const totalToSendUSD = $derived.by(() => {
		if (parsedPayment.detectedNetwork === 'usdt-bsc') {
			return totalToSend;
		}

		if (totalToSend === 0 || btcPrice === 0) return 0;
		return (totalToSend / 100_000_000) * btcPrice;
	});

	// Calculate available balance based on detected network
	const availableBalance = $derived.by(() => {
		switch (parsedPayment.detectedNetwork) {
			case 'rootstock-bitcoin':
			case 'lightning-bitcoin':
				if (!$walletStore.rsk.connected) return 0;
				{
					const rawSats = weiToSatsAmount($walletStore.rsk.balance);
					if (rawSats > 0) return rawSats;
					const formattedRbtc = Number.parseFloat($walletStore.rsk.formattedBalance || '0');
					return Number.isFinite(formattedRbtc) && formattedRbtc > 0
						? Math.floor(formattedRbtc * 100_000_000)
						: 0;
				}
			case 'usdt-bsc':
				if (!$walletStore.bsc.connected) return 0;
				{
					const rawUsdt = atomicToUsdtAmount($walletStore.bsc.usdtBalance);
					if (rawUsdt > 0) return rawUsdt;
					const formattedUsdt = Number.parseFloat($walletStore.bsc.formattedUsdtBalance || '0');
					return Number.isFinite(formattedUsdt) && formattedUsdt > 0 ? formattedUsdt : 0;
				}
			default:
				return $walletStore.totalBalances.sats;
		}
	});

	const needsConnectedRail = $derived(requiresWalletBalance(parsedPayment.detectedNetwork));
	const hasRequiredConnectedRail = $derived(hasConnectedBalanceRail(parsedPayment.detectedNetwork));

	// Check if balance is insufficient
	const hasInsufficientBalance = $derived(
		!isStepOneBalanceRefreshing &&
			totalToSend > availableBalance &&
			totalToSend > 0 &&
			feeState.estimated !== null
	);
	const hasZeroAvailableBalance = $derived(
		!isStepOneBalanceRefreshing &&
			needsConnectedRail &&
			hasRequiredConnectedRail &&
			availableBalance <= 0
	);
	const hasAvailableBalanceErrorState = $derived(hasInsufficientBalance || hasZeroAvailableBalance);

	const balanceShortfall = $derived.by(() =>
		hasInsufficientBalance ? Math.max(0, totalToSend - availableBalance) : 0
	);

	const hasPayableAmount = $derived.by(() => {
		// For BSC: validate USD amount directly without requiring btcPrice
		// (amountInUsdt requires btcPrice when unit is sats)
		if (parsedPayment.detectedNetwork === 'usdt-bsc') {
			const usdAmount = parseFloat(formInput.amount);
			return !isNaN(usdAmount) && usdAmount > 0;
		}

		// For sats unit: check sats amount directly
		if (formInput.unit === 'sats') {
			return amountInSats > 0;
		}

		// For USD unit: validate the USD amount directly without requiring btcPrice conversion
		const usdAmount = parseFloat(formInput.amount);
		return !isNaN(usdAmount) && usdAmount > 0;
	});

	const isAwaitingBitcoinPriceForUsdValidation = $derived.by(() => {
		if (parsedPayment.detectedNetwork === 'usdt-bsc') return false;
		if (!parsedPayment.detectedNetwork) return false;
		if (formInput.unit !== 'usd') return false;
		return hasPayableAmount && btcPrice <= 0;
	});
	const hasBlockedBscSend = $derived(
		parsedPayment.detectedNetwork === 'usdt-bsc' &&
			hasPayableAmount &&
			!!bscDirectSendState.blockedMessage
	);

	const requiresResolvedFeeEstimate = $derived(
		!!parsedPayment.detectedNetwork && hasPayableAmount && feeState.estimated === null
	);

	const isStepOneBalanceRefreshing = $derived(
		!!currentBalanceFreshness?.isRefreshing &&
			currentBalanceFreshness.lastLoadedAt === 0 &&
			requiresWalletBalance(parsedPayment.detectedNetwork) &&
			hasConnectedBalanceRail(parsedPayment.detectedNetwork)
	);

	const availableBalanceSummary = $derived.by(() => {
		if (!parsedPayment.detectedNetwork || !parsedPayment.data?.isValid) return null;
		if (needsConnectedRail && !hasRequiredConnectedRail) {
			return $t('wallet.send.balance.connect_wallet', {
				values: { rail: getBalanceRailName(parsedPayment.detectedNetwork) }
			});
		}
		if (isStepOneBalanceRefreshing) {
			return $t('wallet.send.balance.refreshing', {
				values: { rail: getBalanceRailName(parsedPayment.detectedNetwork) }
			});
		}
		if (isAwaitingBitcoinPriceForUsdValidation && hasBitcoinPriceRefreshFailure) {
			return $t('wallet.send.balance.btc_price_refresh_failed', {
				values: {
					amount: formatNetworkAmount(availableBalance, parsedPayment.detectedNetwork, {
						includeApproxUsd: true,
						preferredUnit: formInput.unit
					})
				}
			});
		}
		if (isAwaitingBitcoinPriceForUsdValidation) {
			return $t(
				isBitcoinPriceLoading
					? 'wallet.send.balance.awaiting_price_fetching'
					: 'wallet.send.balance.awaiting_price_waiting',
				{
					values: {
						amount: formatNetworkAmount(availableBalance, parsedPayment.detectedNetwork, {
							includeApproxUsd: true,
							preferredUnit: formInput.unit
						})
					}
				}
			);
		}
		if (hasInsufficientBalance && feeState.estimated) {
			return $t('wallet.send.balance.shortfall', {
				values: {
					amount: formatNetworkAmount(balanceShortfall, parsedPayment.detectedNetwork, {
						includeApproxUsd: parsedPayment.detectedNetwork !== 'usdt-bsc',
						preferredUnit: formInput.unit
					})
				}
			});
		}
		return $t('wallet.send.balance.available', {
			values: {
				amount: formatNetworkAmount(availableBalance, parsedPayment.detectedNetwork, {
					includeApproxUsd: parsedPayment.detectedNetwork !== 'usdt-bsc',
					preferredUnit: formInput.unit
				})
			}
		});
	});

	const areStepOneActionsDisabled = $derived(
		!isFormValid ||
			feeState.isLoading ||
			hasBlockedBscSend ||
			bscDirectSendState.isChecking ||
			isStepOneBalanceRefreshing
	);

	const isFormValid = $derived.by(() => {
		// Address validation: must have valid parsed data
		if (!parsedPayment.data?.isValid) {
			return false;
		}

		// Amount validation: if amount is required, must have amount > 0
		// When amount is detected from address, amountRequired is false, so this check is skipped
		if (parsedPayment.amountRequired && !hasPayableAmount) {
			return false;
		}

		// Must have a valid amount (either from input or detected)
		if (!hasPayableAmount) {
			return false;
		}

		if (needsConnectedRail && !hasRequiredConnectedRail) {
			return false;
		}

		if (isStepOneBalanceRefreshing) {
			return false;
		}

		if (requiresResolvedFeeEstimate) {
			return false;
		}

		// Note: Authentication is handled in handleSend(), not here
		// The button should be enabled so the user can click it and authenticate then

		// Balance check: total (including fees) must not exceed available balance
		if (totalToSend > availableBalance) {
			return false;
		}

		return true;
	});

	// Initialize
	onMount(async () => {
		try {
			// Ensure we rerun validation once the global price store is ready.
			if (
				parsedPayment.detectedNetwork &&
				parsedPayment.detectedNetwork !== 'usdt-bsc' &&
				formInput.unit === 'usd' &&
				hasPayableAmount
			) {
				const { tick } = await import('svelte');
				await tick();
				await handleAmountChange();
			}
		} catch (error) {
			console.error('Initialization error while syncing price-driven validation:', error);
		}
	});

	$effect(() => {
		if (!parsedPayment.detectedNetwork || parsedPayment.detectedNetwork === 'usdt-bsc') {
			lastUsdValidationBtcPrice = 0;
			return;
		}

		if (formInput.unit !== 'usd' || !hasPayableAmount) {
			lastUsdValidationBtcPrice = 0;
			return;
		}

		if (btcPrice <= 0 || btcPrice === lastUsdValidationBtcPrice) {
			return;
		}

		lastUsdValidationBtcPrice = btcPrice;
		void handleAmountChange();
	});

	function resetParsedPaymentState() {
		parsedPayment.data = null;
		parsedPayment.detectedNetwork = null;
		parsedPayment.detectedAmount = null;
		parsedPayment.detectedMemo = null;
		parsedPayment.amountRequired = true;
		feeState.estimated = null;
		feeState.error = null;
		bscDirectSendState.sponsorStatus = null;
		bscDirectSendState.lastPreflight = null;
		bscDirectSendState.blockedMessage = null;
	}

	async function applyParsedPayment(parsed: ParsedPaymentAddress, inputValue: string) {
		ambiguousAddress = null;
		parsedPayment.data = parsed;
		formInput.addressInput = inputValue;
		parsedPayment.detectedNetwork = parsed.network;
		parsedPayment.detectedAmount = parsed.amount;
		parsedPayment.detectedMemo = parsed.memo || null;
		parsedPayment.amountRequired = parsed.amount === null;
		parsedPayment.addressError = null;

		// Only BSC constrains the unit selector. Other rails preserve the current selection.
		const isBscNetwork = parsed.network === 'usdt-bsc';

		if (parsed.amount !== null) {
			formInput.amount =
				parsed.network === 'usdt-bsc'
					? parsed.amount.toFixed(6).replace(/\.?0+$/, '')
					: parsed.amount.toString();
		}

		if (isBscNetwork && formInput.unit === 'sats') {
			formInput.unit = 'usd';
		}

		if (parsed.memo) {
			formInput.memo = parsed.memo;
			uiState.descriptionExpanded = true;
		}

		void refreshDetectedNetworkBalance();

		const { tick } = await import('svelte');
		await tick();

		if (parsed.amount !== null && parsed.amount > 0) {
			await updateFeeEstimate();
			if (parsed.network === 'usdt-bsc') {
				await runBscDirectSendPreflight();
			}
		} else if (hasPayableAmount) {
			await updateFeeEstimate();
			if (parsed.network === 'usdt-bsc') {
				await runBscDirectSendPreflight();
			}
		}
	}

	function setAmbiguousAddressState(rawInput: string, source: 'manual' | 'scan') {
		ambiguousAddress = {
			rawInput: rawInput.trim(),
			source
		};
		resetParsedPaymentState();
		parsedPayment.addressError = null;
		formInput.addressInput = rawInput.trim();
		uiState.activeTab = 'enter';
		uiState.showConfirmation = false;
	}

	async function resolveAmbiguousAddress(network: 'rootstock-bitcoin' | 'usdt-bsc') {
		if (!ambiguousAddress) return;

		triggerHaptic(ImpactStyle.Light);
		const qualifiedInput = qualifyEvmPaymentAddress(ambiguousAddress.rawInput, network);
		const parsed = parsePaymentAddress(qualifiedInput);

		if (!parsed.isValid) {
			resetParsedPaymentState();
			parsedPayment.addressError = parsed.errorMessage || $t('wallet.send.invalid_address');
			return;
		}

		await applyParsedPayment(parsed, qualifiedInput);
	}

	// Handle QR scan (accepts both Barcode from Capacitor and string from html5-qrcode)
	async function handleQRScan(barcode: Barcode | string) {
		try {
			const qrValue = typeof barcode === 'string' ? barcode : barcode.rawValue;
			const parsed = parsePaymentAddress(qrValue);

			// Clear previous error state
			qrScanState.error = null;
			qrScanState.scannedValue = null;

			if (!parsed.isValid) {
				if (parsed.errorCode === 'ambiguous-evm-address') {
					setAmbiguousAddressState(qrValue, 'scan');
					qrScanState.error = null;
					qrScanState.scannedValue = null;
					return;
				}

				// Show error with decoded QR code
				// Use specific error message if available, otherwise use generic message
				qrScanState.error = parsed.errorMessage || $t('wallet.send.invalid_qr_code');
				qrScanState.scannedValue = qrValue;
				return;
			}

			await applyParsedPayment(parsed, qrValue);
			uiState.activeTab = 'enter';
			uiState.currentStep = 1;
			uiState.showConfirmation = false;
		} catch (error) {
			console.error('Failed to parse QR code:', error);
			qrScanState.error = $t('wallet.send.failed_to_parse_qr');
			qrScanState.scannedValue = typeof barcode === 'string' ? barcode : barcode.rawValue;
		}
	}

	// Copy scanned QR code to clipboard
	async function copyScannedQrCode() {
		if (!qrScanState.scannedValue) return;

		const success = await copyToClipboard(qrScanState.scannedValue);
		if (success) {
			appStore.showSuccessToast('Text copied to clipboard');
			triggerHaptic(ImpactStyle.Light);
		} else {
			appStore.showErrorToast('Failed to copy to clipboard');
		}
	}

	// Handle address input
	async function handleAddressInput() {
		parsedPayment.addressError = null;
		ambiguousAddress = null;
		if (!formInput.addressInput.trim()) {
			resetParsedPaymentState();
			return;
		}

		try {
			const parsed = parsePaymentAddress(formInput.addressInput);
			if (parsed.isValid) {
				await applyParsedPayment(parsed, formInput.addressInput.trim());
			} else if (parsed.errorCode === 'ambiguous-evm-address') {
				setAmbiguousAddressState(formInput.addressInput, 'manual');
			} else {
				// Use specific error message if available, otherwise use generic message
				resetParsedPaymentState();
				parsedPayment.addressError = parsed.errorMessage || $t('wallet.send.invalid_address');
			}
		} catch (error) {
			console.error('Failed to parse address:', error);
			resetParsedPaymentState();
			parsedPayment.addressError = $t('wallet.send.failed_to_parse_address');
		}
	}

	// Update fee estimate
	async function updateFeeEstimate() {
		// Check if we have a network and an amount (either from input or detected from address)
		// Use detectedAmount if available and amountInSats is 0 (for immediate estimation when address has amount)
		const amountToUse =
			parsedPayment.detectedNetwork === 'usdt-bsc'
				? amountInUsdt
				: amountInSats > 0
					? amountInSats
					: parsedPayment.detectedAmount !== null && parsedPayment.detectedAmount > 0
						? parsedPayment.detectedAmount
						: 0;

		if (amountToUse === 0 || !parsedPayment.detectedNetwork) {
			feeState.estimated = null;
			feeState.error = null;
			return;
		}

		feeState.isLoading = true;
		feeState.error = null;
		try {
			switch (parsedPayment.detectedNetwork) {
				case 'lightning-bitcoin': {
					// Use submarine swap fee estimation (cached)
					// For lightning invoices, amountToUse is the invoice amount (what receiver gets)
					const pairsData = await walletManager.getCachedSubmarineSwapPairs();
					const pair = pairsData?.['RBTC']?.['BTC'];
					if (pair && pair.fees) {
						// Boltz service fee (percentage of invoice amount)
						const serviceFeePercentage = pair.fees.percentage; // e.g., 0.1 means 0.1%
						const serviceFee = Math.ceil((amountToUse * serviceFeePercentage) / 100);

						// Miner fee (network fee for the on-chain transaction) - this is a fixed fee
						const minerFee = pair.fees.minerFees || 32; // Fixed miner fee in sats

						// Estimate Rootstock gas fee for the swap transaction
						// Gas is calculated based on total amount to send (invoice + service fee + miner fee)
						let rootstockGasFee = 0;
						if ($walletStore.rsk.connected && $walletStore.rsk.address) {
							const totalAmountToSend = amountToUse + serviceFee + minerFee;
							const amountRBTC = (totalAmountToSend / 100_000_000).toFixed(8);
							const gasEstimation = await walletManager.estimateRBTCGas(
								$walletStore.rsk.address,
								amountRBTC
							);
							rootstockGasFee = Math.max(
								0,
								Math.floor(parseFloat(gasEstimation.totalCostFormatted) * 100_000_000)
							);
						}

						// Total fees = service fee + miner fee + Rootstock gas fee
						// The user pays: invoice amount + service fee + miner fee + gas
						// The receiver gets: invoice amount (exactly as specified)
						feeState.estimated = {
							serviceFee,
							networkFee: minerFee + rootstockGasFee, // Miner fee + gas
							totalFees: serviceFee + minerFee + rootstockGasFee
						};
					} else {
						// Fallback if Boltz API fails
						const serviceFee = Math.ceil((amountToUse * 0.1) / 100);
						const minerFee = 32; // Conservative miner fee estimate
						const networkFee = minerFee + 4000; // Miner fee + conservative gas estimate
						feeState.estimated = {
							serviceFee,
							networkFee,
							totalFees: serviceFee + networkFee
						};
					}
					break;
				}
				case 'rootstock-bitcoin': {
					if (!$walletStore.rsk.connected || !$walletStore.rsk.address) {
						const networkFee = 3000; // Fallback
						feeState.estimated = {
							serviceFee: 0,
							networkFee,
							totalFees: networkFee
						};
						break;
					}
					const amountRBTC = (amountToUse / 100_000_000).toFixed(8);
					// Use parsed address from parsedPayment, or extract address from addressInput
					let recipientAddress = parsedPayment.data?.address;
					if (!recipientAddress && formInput.addressInput) {
						// Extract address part (before ? or #)
						const addressMatch = formInput.addressInput.match(/^([^?#]+)/);
						recipientAddress = addressMatch ? addressMatch[1] : formInput.addressInput;
					}
					// Fallback to wallet address if no recipient address found
					const finalAddress = recipientAddress || $walletStore.rsk.address;

					const gasEstimation = await walletManager.estimateRBTCGas(finalAddress!, amountRBTC);
					const networkFee = Math.floor(parseFloat(gasEstimation.totalCostFormatted) * 100_000_000);
					feeState.estimated = {
						serviceFee: 0,
						networkFee,
						totalFees: networkFee
					};
					break;
				}
				case 'usdt-bsc':
					feeState.estimated = {
						serviceFee: bscFixedFeeAmount,
						networkFee: 0,
						totalFees: bscFixedFeeAmount
					};
					break;
				default:
					feeState.estimated = null;
			}
		} catch (error) {
			console.error('Failed to estimate fees:', error);
			feeState.error = $t('wallet.swap.error.fee_fetch_failed');
			feeState.estimated = null;
		} finally {
			feeState.isLoading = false;
		}
	}

	async function runBscDirectSendPreflight(): Promise<BscDirectSendPreflightResult | null> {
		if (parsedPayment.detectedNetwork !== 'usdt-bsc' || !parsedPayment.data?.address) {
			bscDirectSendState.lastPreflight = null;
			bscDirectSendState.blockedMessage = null;
			return null;
		}

		const configError = getBscConfigError();
		if (configError) {
			bscDirectSendState.lastPreflight = null;
			bscDirectSendState.blockedMessage = configError;
			return null;
		}

		const recipientAmountAtomic = toAtomicAmountString(amountInUsdt, 'USDT');
		if (!recipientAmountAtomic) {
			bscDirectSendState.lastPreflight = null;
			bscDirectSendState.blockedMessage = null;
			return null;
		}

		bscDirectSendState.isChecking = true;
		try {
			const sponsorStatus = await getBSCSponsorStatus();
			const result = await preflightBSCDirectSend({
				recipient: parsedPayment.data.address,
				recipientAmountAtomic,
				fixedFeeAtomic: BSC_DIRECT_SEND_CONFIG.fixedFeeAtomic,
				routerAddress: BSC_DIRECT_SEND_CONFIG.routerAddress,
				chainId: BSC_CHAIN_ID,
				tokenAddress: BSC_DIRECT_SEND_CONFIG.tokenAddress
			});

			bscDirectSendState.sponsorStatus = sponsorStatus;
			bscDirectSendState.lastPreflight = result;
			bscDirectSendState.blockedMessage = result.isReady
				? null
				: mapBscPreflightFailure(result, sponsorStatus);

			return result;
		} finally {
			bscDirectSendState.isChecking = false;
		}
	}

	// Fetch fee parameters when network is detected (for max calculation)
	async function fetchFeeParameters() {
		if (!parsedPayment.detectedNetwork || !availableBalance || availableBalance <= 0) {
			feeState.parameters = null;
			return;
		}

		try {
			switch (parsedPayment.detectedNetwork) {
				case 'lightning-bitcoin': {
					// Fetch submarine swap pairs to get fee percentage (use cached)
					const pairsData = await walletManager.getCachedSubmarineSwapPairs();
					const pair = pairsData?.['RBTC']?.['BTC'];
					if (pair && pair.fees) {
						const minerFee = pair.fees.minerFees || 32;

						// Estimate Rootstock gas fee for the submarine swap transaction
						// This is needed because we're sending RBTC on-chain to Boltz
						let estimatedGasFee = 0;
						if ($walletStore.rsk.connected && $walletStore.rsk.address) {
							try {
								// Use 80% of balance to get a realistic gas fee estimate
								// This is conservative and accounts for gas price variations
								const estimateAmountRBTC = ((availableBalance * 0.8) / 100_000_000).toFixed(8);
								const gasEstimation = await walletManager.estimateRBTCGas(
									$walletStore.rsk.address,
									estimateAmountRBTC
								);
								estimatedGasFee = Math.floor(
									parseFloat(gasEstimation.totalCostFormatted) * 100_000_000
								);
							} catch {
								estimatedGasFee = 3000; // Conservative fallback (100 sats)
							}
						} else {
							estimatedGasFee = 3000; // Conservative fallback when not connected
						}

						feeState.parameters = {
							percentage: pair.fees.percentage,
							fixedFee: minerFee + estimatedGasFee // Combine miner fee and gas fee
						};
					} else {
						// Fallback to conservative estimate
						feeState.parameters = {
							percentage: 0.1, // 0.1%
							fixedFee: 3000
						};
					}
					break;
				}
				case 'rootstock-bitcoin': {
					// For Rootstock, fees are mostly fixed (gas), but we need to estimate
					// We'll estimate with a high amount to get approximate gas fee
					if ($walletStore.rsk.connected && $walletStore.rsk.address) {
						try {
							// Estimate with 80% of balance (not 90%) to get MORE conservative gas fee estimate
							// This accounts for the fact that gas estimation may vary with amount
							const estimateAmountRBTC = ((availableBalance * 0.8) / 100_000_000).toFixed(8);
							const gasEstimation = await walletManager.estimateRBTCGas(
								formInput.addressInput || $walletStore.rsk.address,
								estimateAmountRBTC
							);
							const estimatedGasFee = Math.floor(
								parseFloat(gasEstimation.totalCostFormatted) * 100_000_000
							);
							feeState.parameters = {
								fixedFee: estimatedGasFee
							};
						} catch {
							feeState.parameters = {
								fixedFee: 3000 // Conservative fallback
							};
						}
					} else {
						feeState.parameters = {
							fixedFee: 3000
						};
					}
					break;
				}
				case 'usdt-bsc':
					feeState.parameters = {
						fixedFee: bscFixedFeeAmount
					};
					break;
				default:
					feeState.parameters = null;
			}
		} catch (error) {
			console.error('Failed to fetch fee parameters:', error);
			feeState.parameters = null;
		}
	}

	// Calculate max amount using mathematical formula for percentage fees
	function calculateMaxAmount(): number {
		if (!availableBalance || availableBalance <= 0) return 0;
		if (!feeState.parameters) return 0;

		// Use a percentage-based safety margin (10%) plus absolute minimum
		// This accounts for gas price fluctuations and estimation variance
		const marginPercentage = 0.2; // 20% buffer
		const absoluteMinimum = 20; // 20 sats absolute minimum

		// For percentage-based fees: maxAmount = (balance - fixedFee) / (1 + percentage/100)
		if (feeState.parameters.percentage !== undefined) {
			const fixedFee = feeState.parameters.fixedFee || 0;
			const percentage = feeState.parameters.percentage;
			const feeWithBuffer = Math.ceil(fixedFee * (1 + marginPercentage));
			const maxBeforeMargin = (availableBalance - feeWithBuffer) / (1 + percentage / 100);
			return Math.max(0, Math.floor(maxBeforeMargin) - absoluteMinimum);
		}

		// For fixed fees only: maxAmount = balance - fixedFee - buffer
		if (feeState.parameters.fixedFee !== undefined) {
			const feeWithBuffer = Math.ceil(feeState.parameters.fixedFee * (1 + marginPercentage));
			const maxAmount = availableBalance - feeWithBuffer - absoluteMinimum;
			return Math.max(0, maxAmount);
		}

		return 0;
	}

	// Handle updates when amount changes (called explicitly)
	async function handleAmountChange() {
		// Update fee estimate if we have network and amount
		if (parsedPayment.detectedNetwork && hasPayableAmount) {
			await updateFeeEstimate();
			if (parsedPayment.detectedNetwork === 'usdt-bsc') {
				await runBscDirectSendPreflight();
			}
		}
	}

	// Handle step navigation
	function handleNextStep() {
		// Validate that we have address and amount before proceeding
		if (parsedPayment.data?.isValid && !parsedPayment.addressError && hasPayableAmount) {
			triggerHaptic(ImpactStyle.Light);
			uiState.currentStep = 2;
		} else if (
			parsedPayment.data?.isValid &&
			!parsedPayment.addressError &&
			parsedPayment.detectedAmount &&
			parsedPayment.detectedAmount > 0
		) {
			// Lightning invoice with amount - can proceed without user entering amount
			triggerHaptic(ImpactStyle.Light);
			uiState.currentStep = 2;
		}
	}

	function handleBackStep() {
		triggerHaptic(ImpactStyle.Light);
		uiState.currentStep = 1;
	}

	// Handle calculation change from calculator
	function handleCalculationChange(expression: string, result: number) {
		formInput.mathExpression = expression;
		if (result > 0 || expression === '') {
			if (formInput.unit === 'sats') {
				formInput.amount = Math.floor(result).toString();
			} else {
				formInput.amount = formatEditableAmount(result);
			}
		}
		// Explicitly trigger amount change handler
		handleAmountChange();
	}

	// Handle max amount click (simplified - single-pass calculation)
	async function handleMaxAmount() {
		if (!parsedPayment.detectedNetwork) return;

		feeState.maxCalculation.isLoading = true;
		triggerHaptic(ImpactStyle.Light);

		try {
			await refreshDetectedNetworkBalance(true);
			if (!availableBalance || availableBalance <= 0) return;
			formInput.mathExpression = '';

			if (parsedPayment.detectedNetwork === 'usdt-bsc') {
				const maxUsdtAmount = Math.max(0, availableBalance - bscFixedFeeAmount);
				formInput.amount = maxUsdtAmount.toFixed(BSC_USDT_DECIMALS).replace(/\.?0+$/, '');
				await updateFeeEstimate();
				await runBscDirectSendPreflight();
				return;
			}

			// Fetch fee parameters if not available
			if (!feeState.parameters) {
				await fetchFeeParameters();
			}

			// Calculate max amount
			const max = calculateMaxAmount();
			if (max > 0) {
				feeState.maxCalculation.amount = max;

				// Set amount in appropriate unit
				if (formInput.unit === 'sats') {
					formInput.amount = max.toString();
				} else if (btcPrice > 0) {
					const usdAmount = (max / 100_000_000) * btcPrice;
					formInput.amount = formatEditableAmount(usdAmount);
				}

				// Trigger fee estimation to get final accurate fees
				await updateFeeEstimate();
			}
		} catch (error) {
			console.error('Failed to calculate max amount:', error);
		} finally {
			feeState.maxCalculation.isLoading = false;
		}
	}

	// Handle amount input change (wrapper to trigger updates)
	function handleAmountInputChange(value: string) {
		formInput.amount = value;
		// Explicitly trigger amount change handler
		handleAmountChange();
	}

	// Handle unit change
	function handleUnitChange(newUnit: 'sats' | 'usd') {
		triggerHaptic(ImpactStyle.Light);
		formInput.unit = parsedPayment.detectedNetwork === 'usdt-bsc' ? 'usd' : newUnit;
		// Keep amount when switching units - user may have entered amount before selecting unit
		formInput.mathExpression = '';
		// Don't increment calculatorKey - preserve calculator state and amount
		// Trigger amount change handler
		handleAmountChange();
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

	async function retryBitcoinPriceRefresh() {
		if (isRetryingBitcoinPrice) return;

		isRetryingBitcoinPrice = true;
		try {
			await marketPrice.refresh();
		} catch (error) {
			console.error('Failed to retry BTC price refresh:', error);
		} finally {
			isRetryingBitcoinPrice = false;
		}
	}

	// Handle send
	async function handleSend() {
		if (!isFormValid) return;

		const recipient = parsedPayment.data?.address || formInput.addressInput.trim();
		const finalAmount = totalToSend; // Amount including fees
		const network = parsedPayment.detectedNetwork || 'rootstock-bitcoin';

		if (!recipient || finalAmount <= 0) {
			throw new Error($t('wallet.send.error.invalid_payment_details'));
		}

		// Show pending transaction screen immediately (optimistically)
		// We'll update with txHash once we get it
		sendState.pendingTxHash = 'pending'; // Temporary value, will be replaced with actual hash
		sendState.pendingNetwork = network;
		sendState.pendingAmount = network === 'usdt-bsc' ? amountInUsdt : amountInSats;
		sendState.pendingAddress = recipient;
		sendState.isSending = false; // Set to false so pending screen shows immediately
		sendState.error = null;

		try {
			let txHash: string | null = null;

			if (network === 'lightning-bitcoin') {
				// Lightning send via submarine swap
				const swapResult = await walletManager.createSubmarineSwap(recipient, formInput.memo);
				const lockResult = await walletManager.lockSubmarineSwapFunds(swapResult.swapData);
				txHash = lockResult.txHash;

				// Store pending transaction details immediately and set isSending to false
				// This will show pending screen instead of loading screen
				if (txHash) {
					sendState.pendingTxHash = txHash;
					sendState.pendingNetwork = network;
					sendState.pendingAmount = amountInSats;
					sendState.pendingAddress = recipient;
					sendState.pendingSwapId = swapResult.swapId; // Store swap ID for monitoring
					sendState.isSending = false; // Set to false immediately to skip loading screen

					// Show pending transaction screen
					appStore.showSuccessToast($t('wallet.send.transaction_sending'));
					triggerHaptic(ImpactStyle.Medium);

					// Return early - pending screen will monitor swap status
					return;
				}
			} else if (network === 'rootstock-bitcoin') {
				// RSK direct send
				const amountRBTC = amountInSats / 100_000_000;
				txHash = await walletManager.sendRBTC(recipient, amountRBTC.toFixed(8));

				// Store pending transaction details immediately and set isSending to false
				// This will show pending screen instead of loading screen
				sendState.pendingTxHash = txHash;
				sendState.pendingNetwork = network;
				sendState.pendingAmount = amountInSats;
				sendState.pendingAddress = recipient;
				sendState.isSending = false; // Set to false immediately to skip loading screen

				// Show pending transaction screen
				appStore.showSuccessToast($t('wallet.send.transaction_sending'));
				triggerHaptic(ImpactStyle.Medium);

				// Return early - pending screen will be shown
				return;
			} else if (network === 'liquid-bitcoin') {
				// Liquid chain swap send
				// This would use LBTCChainSwapSend component logic
				appStore.showErrorToast($t('wallet.send.network_not_available'));
				sendState.isSending = false;
				return;
			} else if (network === 'usdt-bsc') {
				const recipientAmountAtomic = toAtomicAmountString(amountInUsdt, 'USDT');
				if (!recipientAmountAtomic) {
					throw new Error($t('wallet.send.error.invalid_bsc_amount'));
				}

				const preflightResult = await runBscDirectSendPreflight();
				if (!preflightResult || !preflightResult.isReady) {
					throw new Error(
						bscDirectSendState.blockedMessage ||
							$t('wallet.send.bsc.failure.sponsor_unavailable_retry')
					);
				}

				txHash = await submitBSCDirectSend({
					recipient,
					recipientAmountAtomic,
					fixedFeeAtomic: BSC_DIRECT_SEND_CONFIG.fixedFeeAtomic,
					routerAddress: BSC_DIRECT_SEND_CONFIG.routerAddress,
					chainId: BSC_CHAIN_ID,
					tokenAddress: BSC_DIRECT_SEND_CONFIG.tokenAddress
				});

				// Store pending transaction details immediately and set isSending to false
				// This will show pending screen instead of loading screen
				if (txHash) {
					sendState.pendingTxHash = txHash;
					sendState.pendingNetwork = network;
					sendState.pendingAmount = amountInUsdt;
					sendState.pendingAddress = recipient;
					sendState.isSending = false; // Set to false immediately to skip loading screen
				}
			} else {
				throw new Error($t('wallet.send.network_not_available'));
			}

			if (txHash) {
				// Store pending transaction details immediately and set isSending to false
				// This will show pending screen instead of loading screen
				sendState.pendingTxHash = txHash;
				sendState.pendingNetwork = network;
				sendState.pendingAmount = network === 'usdt-bsc' ? amountInUsdt : amountInSats;
				sendState.pendingAddress = recipient;
				sendState.isSending = false; // Set to false immediately to skip loading screen

				// Show pending transaction screen
				triggerHaptic(ImpactStyle.Medium);
				appStore.showSuccessToast($t('wallet.send.transaction_sent'));

				// Call onSuccess callback
				if (onSuccess) {
					onSuccess(txHash, network);
				}
			} else {
				throw new Error($t('wallet.send.transaction_failed'));
			}
		} catch (err) {
			console.error('Send failed:', err);
			sendState.pendingTxHash = null;
			sendState.pendingNetwork = null;
			sendState.pendingAmount = null;
			sendState.pendingAddress = null;
			sendState.pendingSwapId = null;
			sendState.error = err instanceof Error ? err.message : $t('wallet.send.transaction_failed');
			appStore.showErrorToast(sendState.error);
			triggerHaptic(ImpactStyle.Heavy);
		} finally {
			sendState.isSending = false;
		}
	}

	// Get explorer URL for address based on network
	function getAddressExplorerUrl(address: string, network: string | null): string | null {
		if (!address || !network) return null;

		const rskNetwork = import.meta.env.VITE_RSK_NETWORK || 'testnet';
		const bscNetwork = import.meta.env.VITE_BSC_NETWORK || 'testnet';
		// Use RSK network setting as the general indicator for mainnet/testnet mode
		// This is consistent with how the app determines network mode
		const isMainnet = rskNetwork === 'mainnet';

		if (network === 'rootstock-bitcoin' || network === 'rsk') {
			return isMainnet
				? `https://rootstock.blockscout.com/address/${address}`
				: `https://rootstock-testnet.blockscout.com/address/${address}`;
		} else if (network === 'usdt-bsc' || network === 'bsc') {
			return bscNetwork === 'mainnet'
				? `https://bscscan.com/address/${address}`
				: `https://testnet.bscscan.com/address/${address}`;
		} else if (network === 'bitcoin') {
			return isMainnet
				? `https://blockstream.info/address/${address}`
				: `https://blockstream.info/testnet/address/${address}`;
		} else if (network === 'liquid-bitcoin') {
			return isMainnet
				? `https://blockstream.info/liquid/address/${address}`
				: `https://blockstream.info/liquidtestnet/address/${address}`;
		}

		return null;
	}

	// Handle showing send confirmation
	function showSendConfirmationModal() {
		uiState.showSendConfirmation = true;
		triggerHaptic(ImpactStyle.Light);
	}

	// Handle confirmed send
	async function handleConfirmedSend() {
		uiState.showSendConfirmation = false;
		await handleSend();
	}
</script>

<div class="flex min-h-0 flex-1 flex-col">
	<!-- Pending Transaction Screen (highest priority) -->
	{#if sendState.pendingTxHash && sendState.pendingNetwork && sendState.pendingAmount !== null && sendState.pendingAddress}
		<PendingTransactionScreen
			amountSats={sendState.pendingAmount}
			amountUSD={amountInUSD}
			serviceFee={sendState.pendingNetwork === 'usdt-bsc'
				? (feeState.estimated?.serviceFee ?? 0)
				: 0}
			address={sendState.pendingAddress}
			network={sendState.pendingNetwork}
			txHash={sendState.pendingTxHash}
			networkOptions={netwokrOption}
			swapId={sendState.pendingSwapId}
			onClose={() => {
				// Clear pending state
				sendState.pendingTxHash = null;
				sendState.pendingNetwork = null;
				sendState.pendingAmount = null;
				sendState.pendingAddress = null;
				sendState.pendingSwapId = null;
				// Close the form
				onCancel();
			}}
		/>

		<!-- Success Screen -->
	{:else if sendState.successTxHash && sendState.successNetwork}
		<div class="bg-base-100 fixed inset-0 z-110 flex flex-col">
			<TransactionSuccessScreen
				txHash={sendState.successTxHash}
				network={sendState.successNetwork}
				amount={sendState.successNetwork === 'usdt-bsc' ? amountInUsdt : amountInSats}
				serviceFee={sendState.successNetwork === 'usdt-bsc'
					? (feeState.estimated?.serviceFee ?? 0)
					: 0}
				recipient={parsedPayment.data?.address || formInput.addressInput}
				onClose={() => {
					uiState.showSuccessScreen = false;
					onCancel();
				}}
			/>
		</div>

		<!-- Normal Form Content -->
	{:else}
		<!-- Tab Navigation (Top) -->
		<div
			class="tabs tabs-boxed border-base-300 mb-3 shrink-0 overflow-hidden rounded-lg border sm:mb-4"
		>
			<button
				class="tab flex-1"
				class:bg-primary={uiState.activeTab === 'scan'}
				class:text-primary-content={uiState.activeTab === 'scan'}
				class:tab-active={uiState.activeTab === 'scan'}
				onclick={() => {
					triggerHaptic(ImpactStyle.Light);
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
					triggerHaptic(ImpactStyle.Light);
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
					<div
						class="flex min-h-full flex-col items-center justify-center gap-3 px-3 sm:gap-4 sm:px-4"
					>
						<p class="text-base-content/70 text-xs sm:text-sm">
							{$t('wallet.send.scan_qr_code_description')}
						</p>

						{#if qrScanState.error}
							<!-- Error state with decoded QR code -->
							<div class="w-full space-y-3 sm:space-y-4">
								<div class="alert alert-outline alert-error py-2 sm:py-4">
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
											d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
										/>
									</svg>
									<span class="text-sm">{qrScanState.error}</span>
								</div>

								<div class="form-control">
									<label for="scanned-qr-code" class="label">
										<span class="label-text">{$t('wallet.send.scanned_qr_code')}</span>
									</label>
									<div class="relative">
										<textarea
											id="scanned-qr-code"
											class="textarea textarea-bordered textarea-error w-full pr-12 {qrScanState.scannedValue
												? 'cursor-pointer'
												: ''}"
											readonly
											rows="4"
											onclick={copyScannedQrCode}>{qrScanState.scannedValue || ''}</textarea
										>
										<button
											class="btn btn-ghost btn-sm btn-square absolute top-1/2 right-2 -translate-y-1/2"
											onclick={(e) => {
												e.stopPropagation();
												copyScannedQrCode();
											}}
											aria-label={$t('wallet.copy_address')}
										>
											<IconContentCopy class="h-5 w-5" />
										</button>
									</div>
								</div>

								<button
									class="btn btn-primary w-full"
									onclick={() => {
										qrScanState.error = null;
										qrScanState.scannedValue = null;
									}}
								>
									{$t('common.buttons.retry')}
								</button>
							</div>
						{:else if isWeb}
							<WebQrCodeScanner
								onScan={(result) => handleQRScan(result)}
								onClose={() => (uiState.activeTab = 'enter')}
							/>
						{:else}
							<QrCodeScanner onScan={handleQRScan} onClose={() => (uiState.activeTab = 'enter')} />
						{/if}
					</div>
				{:else}
					<!-- Confirmation Screen -->
					<div class="space-y-6">
						<div class="flex items-center justify-end">
							<button
								class="btn btn-ghost btn-sm"
								onclick={() => (uiState.showConfirmation = false)}
							>
								{$t('common.back')}
							</button>
						</div>

						<!-- Amount Display -->
						<div class="flex flex-col items-center gap-2">
							<AmountDisplay
								amount={formInput.amount}
								unit={formInput.unit}
								onUnitToggle={handleUnitToggle}
								{btcPrice}
							/>
							{#if showLargeAmountWarning}
								<p class="text-error text-center text-sm">
									{$t('wallet.send.large_amount_warning.message', {
										values: { amount: formatUsd(amountInUSD) }
									})}
								</p>
							{/if}
						</div>

						<!-- Network Display -->
						{#if parsedPayment.detectedNetwork}
							{@const network =
								netwokrOption[parsedPayment.detectedNetwork as keyof typeof netwokrOption]}
							{@const recipientAddress =
								parsedPayment.data?.address || formInput.addressInput.trim()}
							{@const explorerUrl = getAddressExplorerUrl(
								recipientAddress,
								parsedPayment.detectedNetwork
							)}
							<div class="border-base-300 bg-primary/10 rounded-lg border p-4">
								<div class="flex items-center justify-between gap-2">
									<div class="flex items-center gap-2">
										{#if network?.icon}
											<img src={network?.icon} alt={network?.name} class="h-5 w-5" />
										{/if}
										<span class="font-medium">{network?.name}</span>
									</div>
									{#if explorerUrl}
										<a
											href={explorerUrl}
											target="_blank"
											rel="noopener noreferrer"
											class="btn btn-ghost btn-sm btn-circle shrink-0 touch-manipulation transition-transform duration-100 select-none active:scale-95"
											style="-webkit-tap-highlight-color: transparent;"
											aria-label={$t('wallet.view_explorer')}
											onclick={() => triggerHaptic(ImpactStyle.Light)}
										>
											<IconOpenInNew class="h-5 w-5" />
										</a>
									{/if}
								</div>
							</div>
						{/if}

						<!-- Address Display -->
						<div class="form-control">
							<div class="input input-bordered w-full break-all">{formInput.addressInput}</div>
						</div>

						<!-- Conditional Amount Field -->
						{#if parsedPayment.amountRequired}
							<div class="form-control">
								<AmountInputSection
									amount={formInput.amount}
									unit={formInput.unit}
									mathExpression={formInput.mathExpression}
									calculatorKey={uiState.calculatorKey}
									network={parsedPayment.detectedNetwork}
									isLoadingMaxCalculation={feeState.maxCalculation.isLoading}
									hasInsufficientBalance={hasInsufficientBalance && feeState.estimated !== null}
									onAmountChange={handleAmountInputChange}
									onUnitChange={handleUnitChange}
									onCalculationChange={handleCalculationChange}
									onClear={handleClearCalculator}
									onMaxAmount={handleMaxAmount}
								/>
							</div>
						{/if}

						<!-- Action Buttons -->
						<div class="flex gap-3">
							<button
								class="btn btn-error flex-1"
								onclick={() => (uiState.showConfirmation = false)}
							>
								{$t('common.cancel')}
							</button>
							<button
								class="btn btn-primary flex-1"
								onclick={handleSend}
								disabled={areStepOneActionsDisabled}
							>
								{$t('wallet.send.send')}
							</button>
						</div>
					</div>
				{/if}
			{/if}

			{#if uiState.activeTab === 'enter'}
				<!-- Enter Payment Details Tab -->
				<!-- Mobile Step 1: Address Input and Amount Input -->
				<div class="block space-y-2 sm:hidden">
					{#if uiState.currentStep === 1}
						<!-- Address Input -->
						<div class="form-control">
							<div class="relative">
								<div
									class="flex w-full items-stretch overflow-hidden rounded-lg border-2 transition-colors"
									class:border-primary={!parsedPayment.data?.isValid && !parsedPayment.addressError}
									class:border-success={parsedPayment.data?.isValid &&
										!parsedPayment.addressError &&
										formInput.addressInput.trim()}
									class:border-error={!!parsedPayment.addressError}
								>
									<!-- Input field with validation icons -->
									<div class="bg-base-200 relative flex flex-1 items-center p-2">
										<div class="relative min-w-0 flex-1 pr-10 sm:pr-11">
											<input
												id="address-input"
												type="text"
												class="placeholder:text-base-content/50 w-full bg-transparent pl-6 text-base focus:outline-none"
												placeholder={$t('wallet.send.address_placeholder')}
												bind:value={formInput.addressInput}
												oninput={handleAddressInput}
												onfocus={() => (uiState.showRecentAddresses = recentAddresses.length > 0)}
												onblur={() => setTimeout(() => (uiState.showRecentAddresses = false), 200)}
												data-testid="recipient-address-input"
											/>
											{#if formInput.addressInput.trim()}
												<div
													class="pointer-events-none absolute top-1/2 left-0 flex -translate-y-1/2 items-center gap-1"
												>
													{#if parsedPayment.data?.isValid && !parsedPayment.addressError}
														{#if parsedPayment.detectedNetwork && netwokrOption[parsedPayment.detectedNetwork as keyof typeof netwokrOption]}
															<img
																src={netwokrOption[
																	parsedPayment.detectedNetwork as keyof typeof netwokrOption
																].icon}
																alt=""
																aria-hidden="true"
																class="h-5 w-5 rounded-full object-contain"
															/>
														{:else}
															<div class="bg-success h-2.5 w-2.5 rounded-full"></div>
														{/if}
													{:else if parsedPayment.addressError}
														<IconClose class="text-error h-5 w-5" />
													{/if}
												</div>
											{/if}
										</div>
										<!-- Clear button -->
										{#if formInput.addressInput.trim()}
											<button
												type="button"
												class="btn btn-ghost btn-sm btn-circle text-error hover:bg-error/20 absolute right-2 flex h-9 min-h-[40px] w-9 min-w-[40px] touch-manipulation items-center justify-center p-0 select-none sm:right-2 sm:h-11 sm:min-h-[44px] sm:w-11 sm:min-w-[44px]"
												style="-webkit-tap-highlight-color: transparent;"
												onclick={() => {
													formInput.addressInput = '';
													ambiguousAddress = null;
													resetParsedPaymentState();
													parsedPayment.addressError = null;
													uiState.showRecentAddresses = false;
													triggerHaptic(ImpactStyle.Light);
												}}
												aria-label="Clear address"
												data-testid="clear-address-button"
											>
												<IconClose class="h-6 w-6 sm:h-8 sm:w-8" />
											</button>
										{/if}
									</div>
								</div>
								{#if uiState.showRecentAddresses && recentAddresses.length > 0}
									<div
										class="border-base-300 bg-base-100 absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border shadow-lg"
									>
										{#each recentAddresses as recentAddress (recentAddress.address)}
											<button
												class="hover:bg-base-200 flex w-full items-center justify-between px-4 py-2 text-left"
												onclick={() => {
													formInput.addressInput = recentAddress.address;
													uiState.showRecentAddresses = false;
													handleAddressInput();
												}}
											>
												<div class="min-w-0 flex-1">
													<div class="truncate font-semibold">
														{recentAddress.label || recentAddress.address.slice(0, 20)}...
													</div>
													<div class="text-base-content/70 text-xs">{recentAddress.network}</div>
												</div>
											</button>
										{/each}
									</div>
								{/if}
							</div>
							{#if parsedPayment.addressError}
								<div class="label">
									<span class="label-text-alt text-error break-words"
										>{parsedPayment.addressError}</span
									>
								</div>
							{/if}
							{#if ambiguousAddress}
								<div
									class="bg-warning/10 border-warning/30 mt-2 rounded-lg border p-3"
									data-testid="ambiguous-address-warning"
								>
									<p class="text-base-content/70 text-xs">
										{$t('wallet.send.ambiguous_network_warning')}
									</p>
									<p class="text-error mt-1 text-xs font-medium">
										{$t('wallet.send.ambiguous_network_loss_warning')}
									</p>
									<div class="mt-3 grid grid-cols-2 gap-2">
										<button
											type="button"
											class="btn btn-primary btn-sm flex min-h-[44px] w-full touch-manipulation items-center justify-center gap-2"
											onclick={() => resolveAmbiguousAddress('rootstock-bitcoin')}
										>
											<img
												src="/images/chains/Bitcoin-Rootstock-logo.webp"
												alt=""
												aria-hidden="true"
												class="h-5 w-5 shrink-0 object-contain"
											/>
											<span>{$t('wallet.send.network_option_rootstock')}</span>
										</button>
										<button
											type="button"
											class="btn btn-success btn-sm text-primary-content flex min-h-[44px] w-full touch-manipulation items-center justify-center gap-2"
											onclick={() => resolveAmbiguousAddress('usdt-bsc')}
										>
											<IconCurrencyUsd class="h-5 w-5 shrink-0" />
											<span>{$t('wallet.send.network_option_bsc')}</span>
										</button>
									</div>
								</div>
							{/if}
						</div>

						<!-- Amount Field (Mobile Step 1) -->
						<div class="form-control">
							<AmountInputSection
								amount={formInput.amount}
								unit={formInput.unit}
								mathExpression={formInput.mathExpression}
								calculatorKey={uiState.calculatorKey}
								network={parsedPayment.detectedNetwork}
								isLoadingMaxCalculation={feeState.maxCalculation.isLoading}
								disabled={parsedPayment.detectedAmount !== null && parsedPayment.detectedAmount > 0}
								hasInsufficientBalance={hasInsufficientBalance && feeState.estimated !== null}
								onAmountChange={handleAmountInputChange}
								onUnitChange={handleUnitChange}
								onCalculationChange={handleCalculationChange}
								onClear={handleClearCalculator}
								onMaxAmount={handleMaxAmount}
							/>
							{#if showLargeAmountWarning}
								<p class="text-error text-center text-sm">
									{$t('wallet.send.large_amount_warning.message', {
										values: { amount: formatUsd(amountInUSD) }
									})}
								</p>
							{/if}
						</div>

						{#if availableBalanceSummary}
							<div
								class="rounded-lg border p-3"
								class:border-error={hasAvailableBalanceErrorState}
								class:border-warning={hasStepOneWarning && !hasAvailableBalanceErrorState}
								class:border-base-300={!hasAvailableBalanceErrorState && !hasStepOneWarning}
							>
								<div class="flex items-start justify-between gap-3">
									<div class="space-y-1">
										<div class="text-xs font-medium tracking-[0.12em] uppercase opacity-60">
											{$t('wallet.available_balance')}
										</div>
										<p
											class="text-sm"
											class:text-error={hasAvailableBalanceErrorState}
											class:text-warning={hasStepOneWarning && !hasAvailableBalanceErrorState}
										>
											{availableBalanceSummary}
										</p>
									</div>
									<div class="flex shrink-0 items-center gap-1">
										{#if isStepOneBalanceRefreshing}
											<span class="loading loading-spinner loading-sm"></span>
										{/if}
										{#if hasBitcoinPriceRetryState}
											<button
												type="button"
												class="btn btn-ghost btn-xs btn-circle"
												onclick={retryBitcoinPriceRefresh}
												aria-label={$t('wallet.send.retry_btc_price_refresh')}
												aria-disabled={isRetryingBitcoinPrice}
											>
												<IconRefresh
													class={isRetryingBitcoinPrice ? 'h-4 w-4 animate-spin' : 'h-4 w-4'}
												/>
											</button>
										{/if}
									</div>
								</div>
								{#if currentBalanceFreshness?.error}
									<div class="mt-3">
										<button
											type="button"
											class="btn btn-ghost btn-xs"
											onclick={() => refreshDetectedNetworkBalance(true)}
										>
											Retry balance refresh
										</button>
									</div>
								{/if}
							</div>
						{/if}
					{/if}
				</div>

				<!-- Mobile Step 2: Read-only amount display, network, description, fees, total -->
				<div class="block space-y-2 sm:hidden">
					{#if uiState.currentStep === 2}
						<!-- Amount Display (Read-only) -->
						<div
							class="border-primary bg-base-200 flex flex-col items-center gap-1.5 rounded-lg border-2 p-3 sm:p-4"
						>
							<span class="text-center text-xs opacity-70">{$t('wallet.amount')}</span>
							<div class="flex w-full items-center justify-center gap-1.5">
								{#if parsedPayment.detectedNetwork === 'usdt-bsc'}
									<span class="text-primary text-xl font-bold">
										{formatUsdtAmount(amountInUsdt)} USDT
									</span>
									{#if amountInUSD > 0}
										<span class="text-xs opacity-60">
											≈ {formatUsd(amountInUSD)}
										</span>
									{/if}
								{:else if formInput.unit === 'sats'}
									<span class="text-primary text-xl font-bold">
										{formatSats(amountInSats)}
										{$t('wallet.sats')}
									</span>
									{#if btcPrice > 0 && amountInSats > 0}
										<span class="text-xs opacity-60">
											≈ {formatUsd(amountInUSD)}
										</span>
									{/if}
								{:else}
									<span class="text-primary text-xl font-bold">
										{formatUsd(amountInUSD)}
									</span>
									{#if btcPrice > 0 && amountInSats > 0}
										<span class="text-xs opacity-60">
											≈ {formatSats(amountInSats)}
											{$t('wallet.sats')}
										</span>
									{/if}
								{/if}
							</div>
						</div>

						<!-- Auto-detected Network Display -->
						{#if parsedPayment.detectedNetwork}
							{@const network =
								netwokrOption[parsedPayment.detectedNetwork as keyof typeof netwokrOption]}
							{@const recipientAddress =
								parsedPayment.data?.address || formInput.addressInput.trim()}
							{@const explorerUrl = getAddressExplorerUrl(
								recipientAddress,
								parsedPayment.detectedNetwork
							)}
							<div class="border-base-300 bg-primary/10 rounded-lg border p-1.5 sm:p-2">
								<div class="flex items-center justify-between gap-1.5 pl-1.5 sm:gap-2 sm:pl-2">
									<div class="flex items-center gap-1.5 sm:gap-2">
										{#if network?.icon}
											<img src={network?.icon} alt={network?.name} class="h-4 w-4 sm:h-5 sm:w-5" />
										{/if}
										<span class="text-sm font-medium sm:text-base">{network?.name}</span>
									</div>
									{#if explorerUrl}
										<a
											href={explorerUrl}
											target="_blank"
											rel="noopener noreferrer"
											class="btn btn-ghost btn-sm btn-circle shrink-0 touch-manipulation transition-transform duration-100 select-none active:scale-95"
											style="-webkit-tap-highlight-color: transparent;"
											aria-label={$t('wallet.view_explorer')}
											onclick={() => triggerHaptic(ImpactStyle.Light)}
										>
											<IconOpenInNew class="h-4 w-4 sm:h-5 sm:w-5" />
										</a>
									{/if}
								</div>
							</div>
						{/if}

						<!-- Description Accordion (Mobile Step 2) -->
						<div class="form-control">
							<DescriptionAccordion
								memo={formInput.memo}
								expanded={uiState.descriptionExpanded}
								disabled={!!parsedPayment.detectedMemo}
								labelText={parsedPayment.detectedMemo ? 'wallet.send.from_invoice' : undefined}
								onMemoChange={(value) => (formInput.memo = value)}
								onToggle={(expanded) => (uiState.descriptionExpanded = expanded)}
							/>
						</div>

						<!-- Network Fee Accordion (Mobile Step 2) -->
						{#if feeState.error}
							<div class="alert alert-outline alert-error py-2 text-sm">
								<span>{feeState.error}</span>
							</div>
						{:else}
							<div
								class="collapse-arrow border-base-300 bg-base-100 collapse rounded-lg border"
								class:collapse-open={uiState.networkFeeExpanded}
							>
								<button
									type="button"
									class="collapse-title min-h-0 px-3 py-2 text-left text-sm font-medium"
									onclick={() => {
										triggerHaptic(ImpactStyle.Light);
										uiState.networkFeeExpanded = !uiState.networkFeeExpanded;
									}}
									disabled={feeState.isLoading}
								>
									<div class="flex w-full items-center gap-1.5">
										<span>{$t('wallet.network_fee')}:</span>
										{#if feeState.isLoading}
											<span class="inline-flex min-w-20 items-center gap-1.5 font-semibold">
												<span class="loading loading-spinner loading-xs"></span>
											</span>
										{:else if feeState.estimated}
											<span class="font-semibold"
												>{parsedPayment.detectedNetwork === 'usdt-bsc'
													? `${formatUsdtAmount(feeState.estimated.totalFees)} USDT`
													: `${formatSats(feeState.estimated.totalFees)} ${$t('wallet.sats')}`}</span
											>
											{#if parsedPayment.detectedNetwork === 'usdt-bsc'}
												<span class="opacity-60">Fixed service fee</span>
											{:else if btcPrice > 0 && feeState.estimated.totalFees > 0}
												<span class="opacity-60">
													≈ {formatUsd((feeState.estimated.totalFees / 100_000_000) * btcPrice)}
												</span>
											{/if}
										{:else}
											<span class="font-semibold">0 {$t('wallet.sats')}</span>
										{/if}
									</div>
								</button>
								<div class="collapse-content">
									<div class="space-y-1.5 px-3">
										{#if feeState.estimated && feeState.estimated.serviceFee > 0}
											<div class="flex items-center justify-between text-xs opacity-70">
												<span>{$t('wallet.swap.swap_fee')}:</span>
												<span
													>{parsedPayment.detectedNetwork === 'usdt-bsc'
														? `${formatUsdtAmount(feeState.estimated.serviceFee)} USDT`
														: `${formatSats(feeState.estimated.serviceFee)} ${$t('wallet.sats')}`}</span
												>
											</div>
										{/if}
										{#if feeState.estimated && feeState.estimated.networkFee > 0}
											<div class="flex items-center justify-between text-xs opacity-70">
												<span>{$t('wallet.swap.network_transaction_fee')}:</span>
												<span>{formatSats(feeState.estimated.networkFee)} {$t('wallet.sats')}</span>
											</div>
										{/if}
										{#if !feeState.estimated || feeState.estimated.totalFees === 0}
											<div class="text-center text-xs opacity-70">
												{$t('wallet.send.enter_address_and_amount_to_estimate')}
											</div>
										{/if}
									</div>
								</div>
							</div>
						{/if}

						<!-- Total to Send Card (Mobile Step 2) -->
						<div
							class="bg-base-200 flex flex-col items-center gap-1.5 rounded-lg border-2 p-3"
							class:border-primary={!hasInsufficientBalance}
							class:border-error={hasInsufficientBalance}
						>
							<span class="text-center text-xs opacity-70">{$t('wallet.send.total_to_send')}</span>
							{#if totalToSend > 0 && feeState.estimated}
								<div class="flex w-full items-center justify-center gap-1.5">
									{#if parsedPayment.detectedNetwork === 'usdt-bsc'}
										<span class="text-primary text-xl font-bold">
											{formatUsdtAmount(totalToSend)} USDT
										</span>
										<span class="text-xs opacity-60">
											≈ {formatUsd(totalToSendUSD)}
										</span>
									{:else if formInput.unit === 'sats'}
										<span class="text-primary text-xl font-bold">
											{formatSats(totalToSend)}
											{$t('wallet.sats')}
										</span>
										{#if btcPrice > 0}
											<span class="text-xs opacity-60">
												≈ {formatUsd(totalToSendUSD)}
											</span>
										{/if}
									{:else}
										<span class="text-primary text-xl font-bold">
											{formatUsd(totalToSendUSD)}
										</span>
										{#if btcPrice > 0}
											<span class="text-xs opacity-60">
												≈ {formatSats(totalToSend)}
												{$t('wallet.sats')}
											</span>
										{/if}
									{/if}
								</div>
							{:else}
								<div class="text-center text-xs opacity-60">
									{$t('wallet.send.enter_address_and_amount_to_estimate')}
								</div>
							{/if}
						</div>

						{#if hasBlockedBscSend}
							<div class="alert alert-outline alert-warning">
								<div class="flex flex-col gap-1">
									<span class="font-semibold">{getBscBlockedHeading()}</span>
									<span class="text-sm opacity-90">{bscDirectSendState.blockedMessage}</span>
								</div>
							</div>
						{/if}
					{/if}
				</div>

				<!-- Desktop: Always show all fields -->
				<div class="hidden space-y-3 sm:block sm:space-y-4">
					<!-- Address Input -->
					<div class="form-control">
						<div class="relative">
							<div
								class="flex w-full items-stretch overflow-hidden rounded-lg border-2 transition-colors"
								class:border-primary={!parsedPayment.data?.isValid && !parsedPayment.addressError}
								class:border-success={parsedPayment.data?.isValid &&
									!parsedPayment.addressError &&
									formInput.addressInput.trim()}
								class:border-error={!!parsedPayment.addressError}
							>
								<!-- Input field with validation icons -->
								<div class="bg-base-200 relative flex flex-1 items-center p-2">
									<div class="relative min-w-0 flex-1 pr-10 sm:pr-11">
										<input
											id="address-input-desktop"
											type="text"
											class="placeholder:text-base-content/50 w-full bg-transparent pl-6 text-base focus:outline-none"
											placeholder={$t('wallet.send.address_placeholder')}
											bind:value={formInput.addressInput}
											oninput={handleAddressInput}
											onfocus={() => (uiState.showRecentAddresses = recentAddresses.length > 0)}
											onblur={() => setTimeout(() => (uiState.showRecentAddresses = false), 200)}
										/>
										{#if formInput.addressInput.trim()}
											<div
												class="pointer-events-none absolute top-1/2 left-0 flex -translate-y-1/2 items-center gap-1"
											>
												{#if parsedPayment.data?.isValid && !parsedPayment.addressError}
													{#if parsedPayment.detectedNetwork && netwokrOption[parsedPayment.detectedNetwork as keyof typeof netwokrOption]}
														<img
															src={netwokrOption[
																parsedPayment.detectedNetwork as keyof typeof netwokrOption
															].icon}
															alt=""
															aria-hidden="true"
															class="h-5 w-5 rounded-full object-contain"
														/>
													{:else}
														<div class="bg-success h-2.5 w-2.5 rounded-full"></div>
													{/if}
												{:else if parsedPayment.addressError}
													<IconClose class="text-error h-5 w-5" />
												{/if}
											</div>
										{/if}
									</div>
									<!-- Clear button -->
									{#if formInput.addressInput.trim()}
										<button
											type="button"
											class="btn btn-ghost btn-sm btn-circle text-error hover:bg-error/20 absolute right-2 flex h-9 min-h-[40px] w-9 min-w-[40px] touch-manipulation items-center justify-center p-0 select-none sm:right-2 sm:h-11 sm:min-h-[44px] sm:w-11 sm:min-w-[44px]"
											style="-webkit-tap-highlight-color: transparent;"
											onclick={() => {
												formInput.addressInput = '';
												ambiguousAddress = null;
												resetParsedPaymentState();
												parsedPayment.addressError = null;
												uiState.showRecentAddresses = false;
												triggerHaptic(ImpactStyle.Light);
											}}
											aria-label="Clear address"
										>
											<IconClose class="h-6 w-6 sm:h-8 sm:w-8" />
										</button>
									{/if}
								</div>
							</div>
							{#if uiState.showRecentAddresses && recentAddresses.length > 0}
								<div
									class="border-base-300 bg-base-100 absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border shadow-lg"
								>
									{#each recentAddresses as recentAddress (recentAddress.address)}
										<button
											class="hover:bg-base-200 flex w-full items-center justify-between px-4 py-2 text-left"
											onclick={() => {
												formInput.addressInput = recentAddress.address;
												uiState.showRecentAddresses = false;
												handleAddressInput();
											}}
										>
											<div class="min-w-0 flex-1">
												<div class="truncate font-semibold">
													{recentAddress.label || recentAddress.address.slice(0, 20)}...
												</div>
												<div class="text-base-content/70 text-xs">{recentAddress.network}</div>
											</div>
										</button>
									{/each}
								</div>
							{/if}
						</div>
						{#if parsedPayment.addressError}
							<div class="label">
								<span class="label-text-alt text-error break-words"
									>{parsedPayment.addressError}</span
								>
							</div>
						{/if}
						{#if ambiguousAddress}
							<div
								class="bg-warning/10 border-warning/30 mt-2 rounded-lg border p-3"
								data-testid="ambiguous-address-warning-desktop"
							>
								<p class="text-base-content/70 text-xs">
									{$t('wallet.send.ambiguous_network_warning')}
								</p>
								<p class="text-error mt-1 text-xs font-medium">
									{$t('wallet.send.ambiguous_network_loss_warning')}
								</p>
								<div class="mt-3 grid grid-cols-2 gap-2">
									<button
										type="button"
										class="btn btn-primary btn-sm flex min-h-[44px] w-full touch-manipulation items-center justify-center gap-2"
										onclick={() => resolveAmbiguousAddress('rootstock-bitcoin')}
									>
										<img
											src="/images/chains/Bitcoin-Rootstock-logo.webp"
											alt=""
											aria-hidden="true"
											class="h-5 w-5 shrink-0 object-contain"
										/>
										<span>{$t('wallet.send.network_option_rootstock')}</span>
									</button>
									<button
										type="button"
										class="btn btn-success btn-sm text-primary-content flex min-h-[44px] w-full touch-manipulation items-center justify-center gap-2"
										onclick={() => resolveAmbiguousAddress('usdt-bsc')}
									>
										<IconCurrencyUsd class="h-5 w-5 shrink-0" />
										<span>{$t('wallet.send.network_option_bsc')}</span>
									</button>
								</div>
							</div>
						{/if}
					</div>

					<!-- Auto-detected Network Display -->
					{#if parsedPayment.detectedNetwork}
						{@const network =
							netwokrOption[parsedPayment.detectedNetwork as keyof typeof netwokrOption]}
						{@const recipientAddress = parsedPayment.data?.address || formInput.addressInput.trim()}
						{@const explorerUrl = getAddressExplorerUrl(
							recipientAddress,
							parsedPayment.detectedNetwork
						)}
						<div class="border-base-300 bg-primary/10 rounded-lg border p-1.5 sm:p-2">
							<div class="flex items-center justify-between gap-1.5 pl-1.5 sm:gap-2 sm:pl-2">
								<div class="flex items-center gap-1.5 sm:gap-2">
									{#if network?.icon}
										<img src={network?.icon} alt={network?.name} class="h-4 w-4 sm:h-5 sm:w-5" />
									{/if}
									<span class="text-sm font-medium sm:text-base">{network?.name}</span>
								</div>
								{#if explorerUrl}
									<a
										href={explorerUrl}
										target="_blank"
										rel="noopener noreferrer"
										class="btn btn-ghost btn-sm btn-circle shrink-0 touch-manipulation transition-transform duration-100 select-none active:scale-95"
										style="-webkit-tap-highlight-color: transparent;"
										aria-label={$t('wallet.view_explorer')}
										onclick={() => triggerHaptic(ImpactStyle.Light)}
									>
										<IconOpenInNew class="h-4 w-4 sm:h-5 sm:w-5" />
									</a>
								{/if}
							</div>
						</div>
					{/if}

					<!-- Amount Field -->
					<div class="form-control space-y-3 sm:space-y-4">
						<AmountInputSection
							amount={formInput.amount}
							unit={formInput.unit}
							mathExpression={formInput.mathExpression}
							calculatorKey={uiState.calculatorKey}
							memo={formInput.memo}
							descriptionExpanded={uiState.descriptionExpanded}
							network={parsedPayment.detectedNetwork}
							isLoadingMaxCalculation={feeState.maxCalculation.isLoading}
							disabled={parsedPayment.detectedAmount !== null && parsedPayment.detectedAmount > 0}
							hasInsufficientBalance={hasInsufficientBalance && feeState.estimated !== null}
							onAmountChange={handleAmountInputChange}
							onUnitChange={handleUnitChange}
							onCalculationChange={handleCalculationChange}
							onClear={handleClearCalculator}
							onMaxAmount={handleMaxAmount}
							onMemoChange={(value) => (formInput.memo = value)}
							onDescriptionToggle={(expanded) => (uiState.descriptionExpanded = expanded)}
							descriptionDisabled={!!parsedPayment.detectedMemo}
							descriptionLabelText={parsedPayment.detectedMemo
								? 'wallet.send.from_invoice'
								: undefined}
						/>
						{#if showLargeAmountWarning}
							<p class="text-error text-center text-sm">
								{$t('wallet.send.large_amount_warning.message', {
									values: { amount: formatUsd(amountInUSD) }
								})}
							</p>
						{/if}
					</div>

					{#if availableBalanceSummary}
						<div
							class="rounded-lg border p-3 sm:p-4"
							class:border-error={hasAvailableBalanceErrorState}
							class:border-warning={hasStepOneWarning && !hasAvailableBalanceErrorState}
							class:border-base-300={!hasAvailableBalanceErrorState && !hasStepOneWarning}
						>
							<div class="flex items-start justify-between gap-3">
								<div class="space-y-1">
									<div class="text-xs font-medium tracking-[0.12em] uppercase opacity-60">
										{$t('wallet.available_balance')}
									</div>
									<p
										class="text-sm sm:text-base"
										class:text-error={hasAvailableBalanceErrorState}
										class:text-warning={hasStepOneWarning && !hasAvailableBalanceErrorState}
									>
										{availableBalanceSummary}
									</p>
								</div>
								<div class="flex shrink-0 items-center gap-1">
									{#if isStepOneBalanceRefreshing}
										<span class="loading loading-spinner loading-sm"></span>
									{/if}
									{#if hasBitcoinPriceRetryState}
										<button
											type="button"
											class="btn btn-ghost btn-xs btn-circle sm:btn-sm"
											onclick={retryBitcoinPriceRefresh}
											aria-label={$t('wallet.send.retry_btc_price_refresh')}
											aria-disabled={isRetryingBitcoinPrice}
										>
											<IconRefresh
												class={isRetryingBitcoinPrice ? 'h-4 w-4 animate-spin' : 'h-4 w-4'}
											/>
										</button>
									{/if}
								</div>
							</div>
							{#if currentBalanceFreshness?.error}
								<div class="mt-3">
									<button
										type="button"
										class="btn btn-ghost btn-xs sm:btn-sm"
										onclick={() => refreshDetectedNetworkBalance(true)}
									>
										Retry balance refresh
									</button>
								</div>
							{/if}
						</div>
					{/if}

					<!-- Network Fee Accordion -->
					{#if feeState.error}
						<div class="alert alert-outline alert-error py-2 text-sm sm:py-4 sm:text-base">
							<span>{feeState.error}</span>
						</div>
					{:else}
						<div
							class="collapse-arrow border-base-300 bg-base-100 collapse rounded-lg border"
							class:collapse-open={uiState.networkFeeExpanded}
						>
							<button
								type="button"
								class="collapse-title min-h-0 px-3 py-2 text-left text-sm font-medium sm:px-4 sm:text-base"
								onclick={() => {
									triggerHaptic(ImpactStyle.Light);
									uiState.networkFeeExpanded = !uiState.networkFeeExpanded;
								}}
								disabled={feeState.isLoading}
							>
								<div class="flex w-full items-center gap-1.5 sm:gap-2">
									<span>{$t('wallet.network_fee')}:</span>
									{#if feeState.isLoading}
										<span class="inline-flex min-w-20 items-center gap-1.5 font-semibold sm:gap-2">
											<span class="loading loading-spinner loading-xs"></span>
										</span>
									{:else if feeState.estimated}
										<span class="font-semibold"
											>{parsedPayment.detectedNetwork === 'usdt-bsc'
												? `${formatUsdtAmount(feeState.estimated.totalFees)} USDT`
												: `${formatSats(feeState.estimated.totalFees)} ${$t('wallet.sats')}`}</span
										>
										{#if parsedPayment.detectedNetwork === 'usdt-bsc'}
											<span class="opacity-60">Fixed service fee</span>
										{:else if btcPrice > 0 && feeState.estimated.totalFees > 0}
											<span class="opacity-60">
												≈ {formatUsd((feeState.estimated.totalFees / 100_000_000) * btcPrice)}
											</span>
										{/if}
									{:else}
										<span class="font-semibold">0 {$t('wallet.sats')}</span>
									{/if}
								</div>
							</button>
							<div class="collapse-content">
								<div class="space-y-1.5 px-3 sm:space-y-2 sm:px-4">
									{#if feeState.estimated && feeState.estimated.serviceFee > 0}
										<div class="flex items-center justify-between text-xs opacity-70">
											<span>{$t('wallet.swap.swap_fee')}:</span>
											<span
												>{parsedPayment.detectedNetwork === 'usdt-bsc'
													? `${formatUsdtAmount(feeState.estimated.serviceFee)} USDT`
													: `${formatSats(feeState.estimated.serviceFee)} ${$t('wallet.sats')}`}</span
											>
										</div>
									{/if}
									{#if feeState.estimated && feeState.estimated.networkFee > 0}
										<div class="flex items-center justify-between text-xs opacity-70">
											<span>{$t('wallet.swap.network_transaction_fee')}:</span>
											<span>{formatSats(feeState.estimated.networkFee)} {$t('wallet.sats')}</span>
										</div>
									{/if}
									{#if !feeState.estimated || feeState.estimated.totalFees === 0}
										<div class="text-center text-xs opacity-70">
											{$t('wallet.send.enter_address_and_amount_to_estimate')}
										</div>
									{/if}
								</div>
							</div>
						</div>
					{/if}

					<!-- Total to Send Card -->
					<div
						class="bg-base-200 flex flex-col items-center gap-1.5 rounded-lg border-2 p-1.5 sm:gap-2 sm:p-2"
						class:border-primary={!hasInsufficientBalance}
						class:border-error={hasInsufficientBalance}
					>
						<span class="text-center text-xs opacity-70 sm:text-sm"
							>{$t('wallet.send.total_to_send')}</span
						>
						{#if totalToSend > 0 && feeState.estimated}
							<div class="flex w-full items-center justify-center gap-1.5 sm:gap-2">
								{#if parsedPayment.detectedNetwork === 'usdt-bsc'}
									<span class="text-primary text-xl font-bold sm:text-2xl">
										{formatUsdtAmount(totalToSend)} USDT
									</span>
									<span class="text-xs opacity-60 sm:text-sm">
										≈ {formatUsd(totalToSendUSD)}
									</span>
								{:else if formInput.unit === 'sats'}
									<span class="text-primary text-xl font-bold sm:text-2xl">
										{formatSats(totalToSend)}
										{$t('wallet.sats')}
									</span>
									{#if btcPrice > 0}
										<span class="text-xs opacity-60 sm:text-sm">
											≈ {formatUsd(totalToSendUSD)}
										</span>
									{/if}
								{:else}
									<span class="text-primary text-xl font-bold sm:text-2xl">
										{formatUsd(totalToSendUSD)}
									</span>
									{#if btcPrice > 0}
										<span class="text-xs opacity-60 sm:text-sm">
											≈ {formatSats(totalToSend)}
											{$t('wallet.sats')}
										</span>
									{/if}
								{/if}
							</div>
						{:else}
							<div class="text-center text-xs opacity-60 sm:text-sm">
								{$t('wallet.send.enter_address_and_amount_to_estimate')}
							</div>
						{/if}
					</div>

					<!-- Transaction Error Display -->
					{#if sendState.error}
						<div class="alert alert-outline alert-error">
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
									d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
								/>
							</svg>
							<div class="flex flex-col gap-1">
								<span class="font-semibold">{$t('wallet.send.transaction_failed')}</span>
								<span class="text-sm opacity-90">{sendState.error}</span>
							</div>
						</div>
					{/if}

					{#if hasBlockedBscSend}
						<div class="alert alert-outline alert-warning">
							<div class="flex flex-col gap-1">
								<span class="font-semibold">{getBscBlockedHeading()}</span>
								<span class="text-sm opacity-90">{bscDirectSendState.blockedMessage}</span>
							</div>
						</div>
					{/if}
				</div>
			{/if}
		</div>

		<!-- Action Buttons -->
		{#if uiState.activeTab === 'enter'}
			<div
				class="bg-base-100 sticky bottom-0 z-10 mt-auto flex shrink-0 gap-2 pt-3 pb-3 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] sm:gap-3 sm:pt-4 sm:pb-4 md:static md:mb-4 md:pt-0 md:pb-0 md:shadow-none"
			>
				<!-- Mobile Step 1: Cancel and Next -->
				{#if uiState.currentStep === 1}
					<button
						class="btn btn-error min-h-[44px] flex-1 touch-manipulation transition-transform duration-100 select-none active:scale-95 sm:hidden"
						style="-webkit-tap-highlight-color: transparent;"
						onclick={() => {
							triggerHaptic(ImpactStyle.Light);
							onCancel();
						}}
					>
						<IconClose class="h-4 w-4" />
						<span class="text-sm">{$t('common.cancel')}</span>
					</button>
					<button
						class="btn btn-primary min-h-[44px] flex-1 touch-manipulation transition-transform duration-100 select-none active:scale-95 sm:hidden"
						style="-webkit-tap-highlight-color: transparent;"
						onclick={handleNextStep}
						disabled={areStepOneActionsDisabled}
					>
						{#if feeState.isLoading}
							<span class="loading loading-spinner loading-sm"></span>
						{:else}
							<span class="text-sm">{$t('common.next')}</span>
							<IconChevronRight class="h-5 w-5" />
						{/if}
					</button>
				{/if}

				<!-- Mobile Step 2: Back and Send -->
				{#if uiState.currentStep === 2}
					<button
						class="btn btn-outline min-h-[44px] flex-1 touch-manipulation transition-transform duration-100 select-none active:scale-95 sm:hidden"
						style="-webkit-tap-highlight-color: transparent;"
						onclick={handleBackStep}
					>
						<IconChevronLeft class="h-4 w-4" />
						<span class="text-sm">{$t('common.back')}</span>
					</button>
					<button
						class="btn btn-primary min-h-[44px] flex-1 touch-manipulation transition-transform duration-100 select-none active:scale-95 sm:hidden"
						style="-webkit-tap-highlight-color: transparent;"
						onclick={showSendConfirmationModal}
						disabled={areStepOneActionsDisabled}
					>
						<IconSend class="h-4 w-4" />
						<span class="text-sm">{$t('wallet.send.send')}</span>
					</button>
				{/if}

				<!-- Desktop: Always show Cancel and Send -->
				<button
					class="btn btn-error hidden min-h-[44px] flex-1 touch-manipulation transition-transform duration-100 select-none active:scale-95 sm:flex sm:min-h-[48px] md:min-h-[56px]"
					style="-webkit-tap-highlight-color: transparent;"
					onclick={() => {
						triggerHaptic(ImpactStyle.Light);
						onCancel();
					}}
				>
					<IconClose class="h-4 w-4 sm:h-5 sm:w-5" />
					<span class="text-sm sm:text-base">{$t('common.cancel')}</span>
				</button>
				<button
					class="btn btn-primary hidden min-h-[44px] flex-1 touch-manipulation transition-transform duration-100 select-none active:scale-95 sm:flex sm:min-h-[48px] md:min-h-[56px]"
					style="-webkit-tap-highlight-color: transparent;"
					onclick={showSendConfirmationModal}
					disabled={areStepOneActionsDisabled}
				>
					<IconSend class="h-4 w-4 sm:h-5 sm:w-5" />
					<span class="text-sm sm:text-base">{$t('wallet.send.send')}</span>
				</button>
			</div>
		{/if}

		<!-- Cancel Button (Bottom, only on Scan QR Code tab) -->
		{#if uiState.activeTab === 'scan' && !uiState.showConfirmation}
			<div class="flex w-full shrink-0 justify-center pb-4">
				<button
					class="btn btn-error min-h-[48px] touch-manipulation transition-transform duration-100 select-none active:scale-95 md:min-h-[56px]"
					style="-webkit-tap-highlight-color: transparent;"
					onclick={() => {
						triggerHaptic(ImpactStyle.Light);
						onCancel();
					}}
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
			netwokrOption[parsedPayment.detectedNetwork as keyof typeof netwokrOption]?.confirmationTime}
		<div class="modal modal-open z-120">
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
							{#if parsedPayment.detectedNetwork === 'usdt-bsc'}
								{formatUsdtAmount(amountInUsdt)} USDT
								<span class="ml-2 text-sm opacity-70">
									≈ {formatUsd(amountInUSD)}
								</span>
							{:else if formInput.unit === 'sats'}
								{formatSats(amountInSats)}
								{$t('wallet.sats')}
								{#if btcPrice > 0}
									<span class="ml-2 text-sm opacity-70">
										≈ {formatUsd(amountInUSD)}
									</span>
								{/if}
							{:else}
								{formatUsd(amountInUSD)}
								{#if btcPrice > 0}
									<span class="ml-2 text-sm opacity-70">
										≈ {formatSats(amountInSats)}
										{$t('wallet.sats')}
									</span>
								{/if}
							{/if}
						</div>
					</div>

					<!-- Estimated Transaction Fees -->
					{#if feeState.estimated && feeState.estimated.totalFees > 0}
						<div class="space-y-1">
							<div class="text-sm font-medium opacity-70">{$t('wallet.send.transaction_fee')}</div>
							<div class="font-semibold">
								{#if parsedPayment.detectedNetwork === 'usdt-bsc'}
									{formatUsdtAmount(feeState.estimated.totalFees)} USDT
									<span class="ml-2 text-sm opacity-70">Fixed service fee</span>
								{:else}
									{formatSats(feeState.estimated.totalFees)}
									{$t('wallet.sats')}
									<span class="ml-2 text-sm opacity-70">
										≈ {formatUsd((feeState.estimated.totalFees / 100_000_000) * btcPrice)}
									</span>
								{/if}
							</div>
						</div>
					{/if}

					{#if parsedPayment.detectedNetwork === 'usdt-bsc' && feeState.estimated && feeState.estimated.totalFees > 0}
						<div class="space-y-1">
							<div class="text-sm font-medium opacity-70">Total debit</div>
							<div class="font-semibold">
								{formatUsdtAmount(totalToSend)} USDT
								<span class="ml-2 text-sm opacity-70">≈ {formatUsd(totalToSend)}</span>
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
						disabled={(hasInsufficientBalance && feeState.estimated !== null) ||
							hasBlockedBscSend ||
							bscDirectSendState.isChecking}
					>
						{$t('wallet.send.send')}
					</button>
				</div>
			</div>
			<button
				class="modal-backdrop"
				onclick={() => (uiState.showSendConfirmation = false)}
				aria-label="Close modal"
			></button>
		</div>
	{/if}
</div>

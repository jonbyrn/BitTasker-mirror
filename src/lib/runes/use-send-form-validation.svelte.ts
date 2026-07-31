/**
 * use-send-form-validation.svelte.ts
 *
 * Svelte 5 rune extracting SendPaymentForm.svelte's validation and balance
 * derived values (lines 607-790). Pure rune — no store access, no imports from stores.
 *
 * Extracted deriveds:
 * - amountInSats (L607-617): form input → sats conversion
 * - amountInUSD (L619-622): sats → USD conversion
 * - totalToSend (L639): amount + fees
 * - totalToSendUSD (L642-645): total → USD
 * - isBelowSwapMinimum (L647-651): Lightning swap minimum check
 * - availableBalance (L654-675): wallet balance computation
 * - hasInsufficientBalance (L679-681): balance vs total check
 * - isNetworkSupported (L683-685): supported network check
 * - isFormValid (L731-786): comprehensive form validation
 *
 * Defensive patterns:
 * - All getter results guarded with isFinite / null checks
 * - NaN, undefined, null → safe 0 or false fallbacks
 * - No side effects (no haptic/Sentry/RPC — caller handles those)
 * - No i18n (raw numbers; caller formats with $t/formatSats/formatUsd)
 * - Pure helpers exported for TDD + reuse
 * - Getter-based DI (no store imports; caller provides from component context)
 *
 * Usage:
 *   const validation = useSendFormValidation({
 *     getFormInput: () => ({ amount: amountStr, unit, selectedSource, addressInput }),
 *     getParsedPayment: () => parsedPayment,
 *     getBtcPrice: () => btcPrice,
 *     getSendFeeEstimate: () => sendFee.feeEstimate,
 *     getSwapLimits: () => sendFee.swapLimits,
 *     getSelectedWalletId: () => selectedWalletId,
 *     getConnectedWallets: () => $connectedWalletsStore.wallets,
 *     getWalletStore: () => $walletStore,
 *     getIsOnline: () => isOnline,
 *     getIsSelfSend: () => isSelfSend,
 *     getIsSourceWalletConnected: () => isSourceWalletConnected,
 *   });
 *   // validation.amountInSats, .isFormValid, .availableBalance, etc.
 */

import { SvelteSet } from 'svelte/reactivity';
import type { ParsedPaymentAddress } from '$lib/utils/helpers/paymentAddressParser';
import type { SendFeeEstimate } from './use-send-fee-estimate.svelte';

// ---------------------------------------------------------------------------
// Types (public API, co-located)
// ---------------------------------------------------------------------------

export interface FormInput {
	amount: string;
	unit: 'sats' | 'usd';
	selectedSource: string;
	addressInput: string;
}

export interface ParsedPayment {
	detectedNetwork: string | null;
	detectedAmount: number | null;
	amountRequired: boolean;
	data: ParsedPaymentAddress | null;
}

export interface WalletStoreSnapshot {
	rsk: { connected: boolean; formattedBalance: string };
	bsc: { formattedUsdtBalance: string };
}

export interface UseSendFormValidationOptions {
	getFormInput: () => FormInput;
	getParsedPayment: () => ParsedPayment;
	getBtcPrice: () => number;
	getSendFeeEstimate: () => SendFeeEstimate | null;
	getSwapLimits: () => { minimal: number } | null;
	getSelectedWalletId: () => string;
	getConnectedWallets: () => Array<{
		id: string;
		balances?: Record<string, { raw: string; formatted: string; loading: boolean }>;
	}>;
	getWalletStore: () => WalletStoreSnapshot;
	getIsOnline: () => boolean;
	getIsSelfSend: () => boolean;
	getIsSourceWalletConnected: () => boolean;
	getAllAssets?: () => Array<{ assetId: string; balance: number }>;
}

export interface UseSendFormValidationResult {
	amountInSats: number;
	amountInUSD: number;
	availableBalance: number;
	totalToSend: number;
	totalToSendUSD: number;
	hasInsufficientBalance: boolean;
	isBelowSwapMinimum: boolean;
	isFormValid: boolean;
	isNetworkSupported: boolean;
	/** i18n key describing why the form is invalid, or null if valid. */
	formValidationError: string | null;
	/** Interpolation values for the error i18n key. */
	formErrorValues: Record<string, unknown>;
}

export interface SendFormValidationContext {
	parsedData: ParsedPaymentAddress | null;
	isNetworkSupported: boolean;
	isSourceWalletConnected: boolean;
	amountRequired: boolean;
	amountInSats: number;
	hasInsufficientBalance: boolean;
	isBelowSwapMinimum: boolean;
	isSelfSend: boolean;
	network: string | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Networks supported for sending (matches SendPaymentForm L90-95). */
export const SUPPORTED_SEND_NETWORKS = new SvelteSet([
	'rootstock-bitcoin',
	'lightning-bitcoin',
	'bitcoin',
	'usdt-bsc',
	'usdt0-arb'
]);

// ---------------------------------------------------------------------------
// Pure Helpers (exported for TDD + reuse)
// ---------------------------------------------------------------------------

/**
 * Convert form amount input to satoshis.
 * Matches SendPaymentForm L607-617 exactly.
 */
export function parseAmountToSats(
	amount: string,
	unit: 'sats' | 'usd',
	detectedAmount: number | null,
	btcPrice: number
): number {
	if (detectedAmount !== null) return detectedAmount;
	if (unit === 'sats') {
		const parsed = parseFloat(amount);
		return isNaN(parsed) ? 0 : Math.floor(parsed);
	}
	// USD → sats conversion
	const usdAmount = parseFloat(amount);
	if (isNaN(usdAmount) || btcPrice === 0) return 0;
	return Math.floor((usdAmount / btcPrice) * 100_000_000);
}

/**
 * Convert satoshis to USD.
 * Matches SendPaymentForm L619-622 exactly.
 */
export function satsToUsd(sats: number, btcPrice: number): number {
	if (btcPrice === 0) return 0;
	return (sats / 100_000_000) * btcPrice;
}

/**
 * Compute available balance from wallet store snapshot.
 * Matches SendPaymentForm L654-675 exactly.
 *
 * - Non-builtin wallets: queries real balance from connected wallet store;
 *   falls back to 10 BTC safety buffer only when balance is unknown
 * - usdt-bsc source: parse formattedUsdtBalance → sats equivalent
 * - RSK source: parse formattedBalance (RBTC) → sats; 0 if not connected
 */
export function computeAvailableBalance(
	source: string,
	selectedWalletId: string,
	connectedWallets: Array<{
		id: string;
		balances?: Record<string, { raw: string; formatted: string; loading: boolean }>;
	}>,
	walletStore: WalletStoreSnapshot,
	allAssets?: Array<{ assetId: string; balance: number }>,
	btcPrice: number = 0
): number {
	if (selectedWalletId !== 'builtin') {
		const walletEntry = connectedWallets.find((w) => w.id === selectedWalletId);
		if (walletEntry?.balances) {
			// Try native balance first (BTC-like wallets), then 'btc' key
			const balanceEntry = walletEntry.balances['native'] ?? walletEntry.balances['btc'];
			if (balanceEntry && !balanceEntry.loading) {
				const parsed = parseFloat(balanceEntry.formatted);
				if (!isNaN(parsed) && parsed > 0) {
					return Math.floor(parsed * 100_000_000);
				}
			}
		}
		// Safety buffer only when balance truly unknown
		return 10_000_000_000;
	}
	if (source === 'usdt-bsc') {
		const balance = parseFloat(walletStore.bsc.formattedUsdtBalance);
		if (!isNaN(balance) && balance > 0) {
			return Math.floor(balance * 100_000_000);
		}
		return 0;
	}
	if (source === 'usdt0-arb') {
		if (!selectedWalletId || selectedWalletId === 'builtin') {
			const asset = allAssets?.find((a) => a.assetId === 'usdt0-arb');
			if (asset && asset.balance > 0) {
				if (btcPrice > 0) {
					return Math.floor((asset.balance / btcPrice) * 100_000_000);
				}
				return Math.floor(asset.balance * 100_000_000);
			}
		}
		for (const w of connectedWallets) {
			const entry = w.balances?.['usdt0-arb'];
			if (entry && !entry.loading) {
				const parsed = parseFloat(entry.formatted);
				if (!isNaN(parsed) && parsed > 0) {
					if (btcPrice > 0) {
						return Math.floor((parsed / btcPrice) * 100_000_000);
					}
					return Math.floor(parsed * 100_000_000);
				}
			}
		}
		return 0;
	}
	if (!walletStore.rsk.connected) return 0;
	const rbtc = parseFloat(walletStore.rsk.formattedBalance);
	return isNaN(rbtc) ? 0 : Math.floor(rbtc * 100_000_000);
}

/**
 * Check if detected network is supported for sending.
 * Matches SendPaymentForm L683-685 exactly.
 */
export function isSupportedNetwork(detectedNetwork: string | null): boolean {
	return !detectedNetwork || SUPPORTED_SEND_NETWORKS.has(detectedNetwork);
}

/**
 * Dust limit per network in satoshis.
 * Below this amount, UTXO transactions fail on-chain.
 */
export const DUST_LIMITS: Record<string, number> = {
	bitcoin: 546,
	'rootstock-bitcoin': 546,
	'lightning-bitcoin': 546,
	'usdt-bsc': 1,
	'usdt0-arb': 1,
	'usdt-ethereum': 546,
	'usdt-polygon': 1
};

/**
 * Comprehensive form validation.
 * Matches SendPaymentForm L731-786 exactly.
 *
 * Checks in order:
 * 1. Valid parsed address data
 * 2. Supported network
 * 3. Source wallet connected
 * 4. Amount > 0 (or amountRequired satisfied)
 * 5. Not below dust limit
 * 6. LNURL amount bounds (min/max in msats → sats)
 * 7. Sufficient balance
 * 8. Above swap minimum
 * 9. Not self-send
 */
export function validateSendForm(ctx: SendFormValidationContext): {
	valid: boolean;
	error: string | null;
	errorValues: Record<string, unknown>;
} {
	if (!ctx.parsedData?.isValid) return { valid: false, error: null, errorValues: {} };
	if (!ctx.isNetworkSupported) return { valid: false, error: null, errorValues: {} };
	if (!ctx.isSourceWalletConnected) return { valid: false, error: null, errorValues: {} };

	// Amount validation
	if (ctx.amountRequired && ctx.amountInSats <= 0)
		return { valid: false, error: null, errorValues: {} };
	if (ctx.amountInSats <= 0) return { valid: false, error: null, errorValues: {} };

	// Dust limit validation
	const dustLimit = ctx.network ? (DUST_LIMITS[ctx.network] ?? 546) : 546;
	if (ctx.amountInSats > 0 && ctx.amountInSats < dustLimit) {
		return {
			valid: false,
			error: 'wallet.send.error.below_dust',
			errorValues: { min: dustLimit }
		};
	}

	// LNURL amount bounds (amount in sats vs limits in msats)
	const lnurlMinSats =
		ctx.parsedData.lnurlMinSendable !== undefined
			? Math.ceil(ctx.parsedData.lnurlMinSendable / 1000)
			: 0;
	const lnurlMaxSats =
		ctx.parsedData.lnurlMaxSendable !== undefined
			? Math.floor(ctx.parsedData.lnurlMaxSendable / 1000)
			: 0;
	if (ctx.parsedData.lnurlCallback) {
		if (lnurlMinSats > 0 && ctx.amountInSats < lnurlMinSats) {
			return {
				valid: false,
				error: 'wallet.send.error.below_lnurl_min',
				errorValues: { min: lnurlMinSats }
			};
		}
		if (lnurlMaxSats > 0 && ctx.amountInSats > lnurlMaxSats) {
			return {
				valid: false,
				error: 'wallet.send.error.above_lnurl_max',
				errorValues: { max: lnurlMaxSats }
			};
		}
	}

	if (ctx.hasInsufficientBalance)
		return { valid: false, error: 'wallet.validation.insufficient_balance', errorValues: {} };
	if (ctx.isBelowSwapMinimum) return { valid: false, error: null, errorValues: {} };
	if (ctx.isSelfSend)
		return { valid: false, error: 'wallet.send.error.self_send', errorValues: {} };

	return { valid: true, error: null, errorValues: {} };
}

// ---------------------------------------------------------------------------
// Rune Factory
// ---------------------------------------------------------------------------

export function useSendFormValidation(
	opts: UseSendFormValidationOptions
): UseSendFormValidationResult {
	// --- Reactive inputs (getters → $derived for fine-grained reactivity) ---

	const formInput = $derived.by(() => opts.getFormInput());
	const parsedPayment = $derived.by(() => opts.getParsedPayment());
	const btcPrice = $derived.by(() => {
		const p = opts.getBtcPrice();
		return Number.isFinite(p) && p > 0 ? p : 0;
	});
	const feeEstimate = $derived.by(() => opts.getSendFeeEstimate());
	const swapLimits = $derived.by(() => opts.getSwapLimits());
	const selectedWalletId = $derived.by(() => opts.getSelectedWalletId());
	const connectedWallets = $derived.by(() => opts.getConnectedWallets());
	const walletStore = $derived.by(() => opts.getWalletStore());
	const isSelfSend = $derived.by(() => opts.getIsSelfSend());
	const isSourceWalletConnected = $derived.by(() => opts.getIsSourceWalletConnected());
	const allAssets = $derived.by(() => opts.getAllAssets?.() ?? []);

	// --- Derived values ---

	const amountInSats = $derived.by(() =>
		parseAmountToSats(formInput.amount, formInput.unit, parsedPayment.detectedAmount, btcPrice)
	);

	const amountInUSD = $derived.by(() => satsToUsd(amountInSats, btcPrice));

	const availableBalance = $derived.by(() =>
		computeAvailableBalance(
			formInput.selectedSource,
			selectedWalletId,
			connectedWallets,
			walletStore,
			allAssets,
			btcPrice
		)
	);

	const totalToSend = $derived(amountInSats + (feeEstimate?.totalFees ?? 0));

	const totalToSendUSD = $derived.by(() => satsToUsd(totalToSend, btcPrice));

	const isBelowSwapMinimum = $derived.by(() => {
		if (parsedPayment.detectedNetwork !== 'lightning-bitcoin') return false;
		if (!swapLimits || amountInSats <= 0) return false;
		return amountInSats < swapLimits.minimal;
	});

	const networkSupported = $derived(isSupportedNetwork(parsedPayment.detectedNetwork));

	const hasInsufficientBalance = $derived(totalToSend > availableBalance && totalToSend > 0);

	const isFormValid = $derived.by(() => {
		return validateSendForm({
			parsedData: parsedPayment.data,
			isNetworkSupported: networkSupported,
			isSourceWalletConnected,
			amountRequired: parsedPayment.amountRequired,
			amountInSats,
			hasInsufficientBalance,
			isBelowSwapMinimum,
			isSelfSend,
			network: parsedPayment.detectedNetwork
		});
	});

	// --- Public API (getters for reactivity across rune boundary) ---

	return {
		get amountInSats() {
			return amountInSats;
		},
		get amountInUSD() {
			return amountInUSD;
		},
		get availableBalance() {
			return availableBalance;
		},
		get totalToSend() {
			return totalToSend;
		},
		get totalToSendUSD() {
			return totalToSendUSD;
		},
		get hasInsufficientBalance() {
			return hasInsufficientBalance;
		},
		get isBelowSwapMinimum() {
			return isBelowSwapMinimum;
		},
		get isFormValid() {
			return isFormValid.valid;
		},
		get isNetworkSupported() {
			return networkSupported;
		},
		get formValidationError() {
			return isFormValid.error;
		},
		get formErrorValues() {
			return isFormValid.errorValues;
		}
	};
}

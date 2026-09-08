import cryptoPriceService from '$lib/api/services/crypto-price.service';

/**
 * Format a currency amount based on the currency type
 * @param amount - The amount to format
 * @param currency - The currency type (BTC, L-BTC, LN, USD)
 * @param isAmountInSats - Whether the amount is in satoshis (for BTC/L-BTC/LN)
 * @returns Formatted currency string
 */
export function formatCurrency(
	amount: number,
	currency: string,
	isAmountInSats: boolean = false
): string {
	if (amount === null || amount === undefined) {
		return '-';
	}

	switch (currency) {
		case 'BTC':
		case 'L-BTC':
		case 'LN':
			if (isAmountInSats) {
				// Convert sats to BTC for display
				const btcAmount = amount / 100_000_000;
				return `${currency} ${btcAmount.toFixed(8)}`;
			}
			// Bitcoin values typically shown with 8 decimal places
			return `${currency} ${amount.toFixed(8)}`;
		case 'USD':
			// Regular fiat currency with 2 decimal places
			return `$${amount.toFixed(2)}`;
		default:
			return `${amount} ${currency}`;
	}
}

/**
 * Format currency with USD equivalent for BTC/L-BTC/LN amounts
 * @param amount - The amount to format
 * @param currency - The currency type
 * @param btcPrice - Current BTC price in USD
 * @param isAmountInSats - Whether the amount is in satoshis (for BTC/L-BTC/LN)
 * @returns Formatted currency string with USD equivalent
 */
export function formatCurrencyWithUsd(
	amount: number,
	currency: string,
	isAmountInSats: boolean = false
): string {
	if (amount === null || amount === undefined) {
		return '-';
	}

	// For BTC/L-BTC/LN when amount is in sats, show sats directly
	if (isAmountInSats && (currency === 'BTC' || currency === 'L-BTC' || currency === 'LN')) {
		const formattedSats = new Intl.NumberFormat('en-US').format(amount);
		return `${formattedSats} sats`;
	}

	// For other cases, use the regular formatCurrency function
	const formattedAmount = formatCurrency(amount, currency, isAmountInSats);

	// Add USD equivalent for BTC/L-BTC/LN
	if (currency === 'BTC' || currency === 'L-BTC' || currency === 'LN') {
		return `${formattedAmount}`;
	}

	return formattedAmount;
}

/**
 * Convert between currencies using real-time exchange rates
 * @param amount - The amount to convert
 * @param fromCurrency - The source currency
 * @param toCurrency - The target currency
 * @returns Promise resolving to converted amount in target currency
 */
export async function convertCurrency(
	amount: number,
	fromCurrency: string,
	toCurrency: string
): Promise<number> {
	if (fromCurrency === toCurrency) {
		return amount;
	}

	try {
		// Use crypto price service for real-time rates
		const rate = await cryptoPriceService.getExchangeRate(fromCurrency, toCurrency);
		return amount * rate;
	} catch (error) {
		console.error(`Failed to convert ${fromCurrency} to ${toCurrency}:`, error);
		// Return original amount as fallback
		return amount;
	}
}

/**
 * Convert USD to Sats using real-time BTC price
 * @param usdAmount - Amount in USD
 * @returns Promise resolving to amount in satoshis
 */
export async function usdToSats(usdAmount: number): Promise<number> {
	try {
		const btcPrice = await cryptoPriceService.getCurrentPrice('BTC');
		if (btcPrice <= 0) return 0;

		const btcAmount = usdAmount / btcPrice;
		return Math.round(btcAmount * 100_000_000); // Convert to sats
	} catch (error) {
		console.error('Failed to convert USD to sats:', error);
		return 0;
	}
}

/**
 * Convert Sats to USD using real-time BTC price
 * @param sats - Amount in satoshis
 * @returns Promise resolving to amount in USD
 */
export async function satsToUsd(sats: number): Promise<number> {
	try {
		const btcPrice = await cryptoPriceService.getCurrentPrice('BTC');
		const btcAmount = sats / 100_000_000; // Convert sats to BTC
		return btcAmount * btcPrice;
	} catch (error) {
		console.error('Failed to convert sats to USD:', error);
		return 0;
	}
}

/**
 * Format amount in the requested format: $USD (Sats) using real-time prices
 * @param btcAmountInput - Amount in BTC
 * @param btcPrice - Optional BTC price (if not provided, will fetch real-time)
 * @returns Promise resolving to formatted string like "$10.50 (9,700 Sats)"
 */
export async function formatUSDWithSats(
	btcAmountInput: string | number,
	btcPrice?: number
): Promise<string> {
	const btcAmount = typeof btcAmountInput === 'string' ? parseFloat(btcAmountInput) : btcAmountInput;
	if (isNaN(btcAmount)) return '$0.00 (0 Sats)';

	try {
		// Get BTC price if not provided
		const price = btcPrice || (await cryptoPriceService.getCurrentPrice('BTC'));
		if (price <= 0) return `${btcAmount.toFixed(4)} BTC`;

		const usdAmount = btcAmount * price;

		// Convert to sats
		const sats = Math.round(btcAmount * 100_000_000);

		return `$${usdAmount.toFixed(2)} (${sats.toLocaleString('en-US')} Sats)`;
	} catch (error) {
		console.error('Failed to format USD with sats:', error);
		return `${btcAmount.toFixed(4)} BTC`;
	}
}

/**
 * Synchronous version of formatUSDWithSats for when BTC price is already available
 * @param btcAmountInput - Amount in BTC
 * @param btcPrice - Current BTC price in USD
 * @returns Formatted string like "$10.50 (9,700 Sats)"
 */
export function formatUSDWithSatsSync(btcAmountInput: string | number, btcPrice: number): string {
	const btcAmount = typeof btcAmountInput === 'string' ? parseFloat(btcAmountInput) : btcAmountInput;
	if (isNaN(btcAmount) || btcPrice <= 0) return '$0.00 (0 Sats)';

	const usdAmount = btcAmount * btcPrice;

	// Convert to sats
	const sats = Math.round(btcAmount * 100_000_000);

	return `$${usdAmount.toFixed(2)} (${sats.toLocaleString('en-US')} Sats)`;
}

export function formatNumberWithTwoDecimals(number: number): string {
	return new Intl.NumberFormat('en-US', {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2
	}).format(number);
}

/**
 * Format an integer with thousands separators (e.g. 12345 → "12,345").
 * Use for sats and other whole-number displays.
 */
export function formatInteger(num: number): string {
	return new Intl.NumberFormat('en-US', {
		maximumFractionDigits: 0
	}).format(Math.round(num));
}

/** Supported units for {@link formatConvertedAmount}. */
export type CurrencyConversionCode = 'USD' | 'BTC' | 'SATS';

export type FormatConvertedAmountOptions = {
	/** Target unit; defaults to `fromCurrency` (format only). */
	toCurrency?: CurrencyConversionCode;
	/** BTC price in USD per 1 BTC. Required for any conversion involving USD. */
	btcPrice?: number;
	/** Overrides default prefix (`$` for USD, empty for Sats/BTC). */
	prefix?: string;
	/** Overrides default suffix (` USD`, ` Sats`, ` BTC`). Pass `''` to omit. */
	suffix?: string;
	/** BCP 47 locale for number grouping and decimals. */
	locale?: string;
	/**
	 * Fixed fraction digits for USD/BTC (`Intl` min and max both set to this value).
	 * Takes precedence over `minimumFractionDigits` / `maximumFractionDigits`. Ignored for SATS.
	 */
	fractionDigits?: number;
	/**
	 * Minimum fraction digits for USD/BTC (not used when `fractionDigits` is set). Ignored for SATS.
	 * Defaults: USD 2, BTC 0.
	 */
	minimumFractionDigits?: number;
	/**
	 * Maximum fraction digits for USD/BTC (not used when `fractionDigits` is set). Ignored for SATS.
	 * Defaults: USD 2, BTC 8 (trailing zeros stripped unless min/max are set).
	 */
	maximumFractionDigits?: number;
};

const SATS_PER_BTC = 100_000_000;

function normalizeConversionCurrency(code: string): CurrencyConversionCode | null {
	const u = code.trim().toUpperCase();
	if (u === 'USD' || u === 'BTC' || u === 'SATS') return u;
	return null;
}

function parseAmountInput(amount: number | string): number {
	if (amount === null || amount === undefined) return NaN;
	if (typeof amount === 'number') return Number.isFinite(amount) ? amount : NaN;
	const t = String(amount).trim();
	if (t === '') return NaN;
	const n = parseFloat(t.replace(/,/g, ''));
	return Number.isFinite(n) ? n : NaN;
}

function stripTrailingZerosFromDecimal(formatted: string): string {
	if (!formatted.includes('.')) return formatted;
	return formatted.replace(/\.?0+$/, '');
}

const MAX_INTL_FRACTION_DIGITS = 20;

function clampFractionDigits(n: number): number {
	if (!Number.isFinite(n) || n < 0) return 0;
	return Math.min(MAX_INTL_FRACTION_DIGITS, Math.floor(n));
}

/**
 * Convert `amount` in `fromCurrency` to an equivalent value expressed in `toCurrency`,
 * then format for display with locale-aware grouping and default or custom prefix/suffix.
 *
 * Defaults: USD → prefix `$`, suffix ` USD`; SATS → suffix ` Sats`; BTC → suffix ` BTC`.
 *
 * @param amount - Value in the source unit (e.g. `10.53`, `"123400"`).
 * @param fromCurrency - `USD`, `BTC`, or `SATS` (case-insensitive).
 * @param options - `toCurrency` (default: same as from), `btcPrice` for USD ↔ BTC/Sats, `prefix`, `suffix`, `locale`, optional `fractionDigits` / `minimumFractionDigits` / `maximumFractionDigits` for USD and BTC display.
 */
export function formatConvertedAmount(
	amount: number | string,
	fromCurrency: string,
	options: FormatConvertedAmountOptions = {}
): string {
	const from = normalizeConversionCurrency(fromCurrency);
	if (!from) return '-';

	const parsed = parseAmountInput(amount);
	if (!Number.isFinite(parsed)) return '-';

	const locale = options.locale ?? 'en-US';
	const to = options.toCurrency ? normalizeConversionCurrency(options.toCurrency) : from;
	if (!to) return '-';

	const price = options.btcPrice;
	const hasValidPrice =
		price !== undefined && price !== null && Number.isFinite(price) && price > 0;

	if (from === to) {
		return buildFormattedOutput(parsed, to, locale, options);
	}

	const needsBtcPrice = from === 'USD' || to === 'USD';
	if (needsBtcPrice && !hasValidPrice) {
		return buildFormattedOutput(0, to, locale, options);
	}

	let btcAmount: number;
	switch (from) {
		case 'USD':
			btcAmount = parsed / price!;
			break;
		case 'BTC':
			btcAmount = parsed;
			break;
		case 'SATS':
			btcAmount = parsed / SATS_PER_BTC;
			break;
	}

	let valueInTarget: number;
	switch (to) {
		case 'BTC':
			valueInTarget = btcAmount;
			break;
		case 'SATS':
			valueInTarget = Math.round(btcAmount * SATS_PER_BTC);
			break;
		case 'USD':
			valueInTarget = btcAmount * price!;
			break;
	}

	return buildFormattedOutput(valueInTarget, to, locale, options);
}

function buildFormattedOutput(
	value: number,
	displayAs: CurrencyConversionCode,
	locale: string,
	options: FormatConvertedAmountOptions
): string {
	const defaultPrefix: string = displayAs === 'USD' ? '$' : '';
	const defaultSuffix = displayAs === 'USD' ? ' USD' : displayAs === 'SATS' ? ' Sats' : ' BTC';

	const prefix = options.prefix !== undefined ? options.prefix : defaultPrefix;
	const suffix = options.suffix !== undefined ? options.suffix : defaultSuffix;

	let numberPart: string;
	if (displayAs === 'SATS') {
		numberPart = new Intl.NumberFormat(locale, {
			maximumFractionDigits: 0
		}).format(Math.round(value));
	} else if (options.fractionDigits !== undefined && Number.isFinite(options.fractionDigits)) {
		const n = clampFractionDigits(options.fractionDigits);
		numberPart = new Intl.NumberFormat(locale, {
			minimumFractionDigits: n,
			maximumFractionDigits: n
		}).format(value);
	} else if (displayAs === 'USD') {
		const min =
			options.minimumFractionDigits !== undefined
				? clampFractionDigits(options.minimumFractionDigits)
				: 2;
		const max =
			options.maximumFractionDigits !== undefined
				? clampFractionDigits(options.maximumFractionDigits)
				: 2;
		const safeMin = Math.min(min, max);
		const safeMax = Math.max(min, max);
		numberPart = new Intl.NumberFormat(locale, {
			minimumFractionDigits: safeMin,
			maximumFractionDigits: safeMax
		}).format(value);
	} else {
		const explicitMin = options.minimumFractionDigits !== undefined;
		const explicitMax = options.maximumFractionDigits !== undefined;
		const min = explicitMin ? clampFractionDigits(options.minimumFractionDigits!) : 0;
		const max = explicitMax ? clampFractionDigits(options.maximumFractionDigits!) : 8;
		const safeMin = Math.min(min, max);
		const safeMax = Math.max(min, max);
		const raw = new Intl.NumberFormat(locale, {
			minimumFractionDigits: safeMin,
			maximumFractionDigits: safeMax
		}).format(value);
		numberPart = !explicitMin && !explicitMax ? stripTrailingZerosFromDecimal(raw) : raw;
	}

	return `${prefix}${numberPart}${suffix}`;
}

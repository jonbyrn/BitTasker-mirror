import cryptoPriceService from '$lib/api/services/crypto-price.service';

/**
 * Format a currency amount based on the currency type
 * @param amount - The amount to format
 * @param currency - The currency type (BTC, L-BTC, LN, USD, RBTC)
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
		case 'RBTC':
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
 * @param rbtcAmount - Amount in RBTC
 * @param btcPrice - Optional BTC price (if not provided, will fetch real-time)
 * @returns Promise resolving to formatted string like "$10.50 (9,700 Sats)"
 */
export async function formatUSDWithSats(
	rbtcAmount: string | number, 
	btcPrice?: number
): Promise<string> {
	const rbtc = typeof rbtcAmount === 'string' ? parseFloat(rbtcAmount) : rbtcAmount;
	if (isNaN(rbtc)) return '$0.00 (0 Sats)';
	
	try {
		// Get BTC price if not provided
		const price = btcPrice || await cryptoPriceService.getCurrentPrice('BTC');
		if (price <= 0) return `${rbtc.toFixed(4)} RBTC`;
		
		// Convert RBTC to USD (assuming RBTC ≈ BTC)
		const usdAmount = rbtc * price;
		
		// Convert to sats
		const sats = Math.round(rbtc * 100_000_000);
		
		return `$${usdAmount.toFixed(2)} (${sats.toLocaleString('en-US')} Sats)`;
	} catch (error) {
		console.error('Failed to format USD with sats:', error);
		return `${rbtc.toFixed(4)} RBTC`;
	}
}

/**
 * Synchronous version of formatUSDWithSats for when BTC price is already available
 * @param rbtcAmount - Amount in RBTC
 * @param btcPrice - Current BTC price in USD
 * @returns Formatted string like "$10.50 (9,700 Sats)"
 */
export function formatUSDWithSatsSync(rbtcAmount: string | number, btcPrice: number): string {
	const rbtc = typeof rbtcAmount === 'string' ? parseFloat(rbtcAmount) : rbtcAmount;
	if (isNaN(rbtc) || btcPrice <= 0) return '$0.00 (0 Sats)';
	
	// Convert RBTC to USD (assuming RBTC ≈ BTC)
	const usdAmount = rbtc * btcPrice;
	
	// Convert to sats
	const sats = Math.round(rbtc * 100_000_000);
	
	return `$${usdAmount.toFixed(2)} (${sats.toLocaleString('en-US')} Sats)`;
}

export function formatNumberWithTwoDecimals(number: number): string {
	return new Intl.NumberFormat('en-US', {
		minimumFractionDigits: 0,
		maximumFractionDigits: 2
	}).format(number);
}
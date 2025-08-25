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
	btcPrice: number,
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
 * Convert between currencies using exchange rates
 * @param amount - The amount to convert
 * @param fromCurrency - The source currency
 * @param toCurrency - The target currency
 * @param exchangeRates - Object containing exchange rates (optional)
 * @returns Converted amount in target currency
 */
export function convertCurrency(
	amount: number,
	fromCurrency: string,
	toCurrency: string,
	exchangeRates?: Record<string, number>
): number {
	// This is a simplified implementation
	// In a real app, this would use actual exchange rates from an API
	const rates = exchangeRates || {
		BTC: 1,
		'L-BTC': 1,
		LN: 1,
		USD: 50000 // Example rate: 1 BTC = $50,000
	};

	// First convert to BTC as base currency
	let btcValue = amount;
	if (fromCurrency !== 'BTC') {
		btcValue = amount / rates[fromCurrency];
	}

	// Then convert from BTC to target currency
	if (toCurrency === 'BTC') {
		return btcValue;
	}

	return btcValue * rates[toCurrency];
}

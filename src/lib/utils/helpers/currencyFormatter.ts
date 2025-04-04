/**
 * Format a currency amount based on the currency type
 * @param amount - The amount to format
 * @param currency - The currency type (BTC, L-BTC, LN, USD)
 * @returns Formatted currency string
 */
export function formatCurrency(amount: number, currency: string): string {
  if (amount === null || amount === undefined) {
    return '-';
  }

  switch (currency) {
    case 'BTC':
    case 'L-BTC':
    case 'LN':
      // Bitcoin values typically shown with 8 decimal places
      return `${currency} ${amount.toFixed(8)}`;
    case 'USD':
      // Regular fiat currency with 2 decimal places
      return `$${amount.toFixed(2)}`;
    default:
      return `${currency} ${amount}`;
  }
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
    USD: 50000, // Example rate: 1 BTC = $50,000
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

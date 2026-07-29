/**
 * Shared wallet formatting utilities
 *
 * Pure functions for formatting satoshis, USD amounts, and addresses.
 * Canonical source — re-exported from wallet-utils.ts for backward compatibility.
 */

/**
 * Format satoshis as a number string with thousand separators
 *
 * @param sats - Amount in satoshis
 * @returns Formatted string (e.g. "1,000,000")
 */
export function formatSats(sats: number): string {
	return new Intl.NumberFormat('en-US').format(sats);
}

/**
 * Format amount as USD currency
 *
 * @param amount - Amount to format
 * @returns Formatted currency string (e.g. "$1,234.56")
 */
export function formatUsd(amount: number): string {
	return new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD'
	}).format(amount);
}

/**
 * Format address with ellipsis in the middle
 *
 * @param address - Address to format
 * @param startChars - Number of characters to show at start (default: 6)
 * @param endChars - Number of characters to show at end (default: 4)
 * @returns Formatted address string (e.g. "0x1234...abcd")
 */
export function formatAddress(address: string, startChars = 6, endChars = 4): string {
	if (!address || address.length < startChars + endChars) {
		return address;
	}
	return `${address.slice(0, startChars)}...${address.slice(-endChars)}`;
}

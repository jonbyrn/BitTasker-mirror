/** Seven days after funding, a stuck handover can be disputed. Payment is not released by itself. */
export const HANDOVER_TIMEOUT_SECONDS = 7 * 24 * 60 * 60;

export function nowSeconds(): number {
	return Math.floor(Date.now() / 1000);
}

export function usdToSats(usd: number, btcUsd: number): number {
	if (!(usd > 0) || !(btcUsd > 0)) return 0;
	return Math.max(1, Math.round((usd / btcUsd) * 100_000_000));
}

export function formatUsd(amount: number): string {
	return new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD',
		maximumFractionDigits: 2
	}).format(amount);
}

export function formatSats(sats: number): string {
	if (!(sats > 0)) return '';
	return `${new Intl.NumberFormat('en-US').format(sats)} sats`;
}

export function askingLabel(priceUsd: number, priceSats: number, btcUsd: number): string {
	if (priceUsd > 0) return priceLabel(priceUsd, btcUsd);
	if (priceSats > 0) return formatSats(priceSats);
	return formatUsd(0);
}

export function priceLabel(usd: number, btcUsd: number): string {
	const sats = usdToSats(usd, btcUsd);
	const dollars = formatUsd(usd);
	return sats > 0 ? `${dollars} · ${formatSats(sats)}` : dollars;
}

export function handoverWindowPassed(fundedAt: number, now: number): boolean {
	if (!(fundedAt > 0)) return false;
	return now - fundedAt >= HANDOVER_TIMEOUT_SECONDS;
}

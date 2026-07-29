/**
 * Fiat ramp helper utilities — pure functions extracted from BuySellForm.svelte.
 * All functions are side-effect free and independently testable.
 */

import type { ChangellyOfferSuccess } from '$lib/services/fiat-ramp.service';

/** Map internal asset ID to Changelly fiat API ticker */
export function cryptoTicker(assetId: string): string {
	switch (assetId) {
		case 'rbtc':
			return 'WBTC'; // Multi-hop: buy WBTC, auto-swap WBTC→tBTC→rBTC
		case 'usdt0-arb':
			return 'USDTARB';
		case 'wbtc-arb':
			return 'WBTC';
		case 'btc-onchain':
			return 'BTC';
		default:
			return 'BTC';
	}
}

/** Friendly display name for an asset (not Changelly ticker) */
export function friendlyAssetName(assetId: string): string {
	switch (assetId) {
		case 'rbtc':
			return 'rBTC';
		case 'usdt0-arb':
			return 'USDT0 on Arbitrum';
		case 'wbtc-arb':
			return 'wBTC on Arbitrum';
		case 'btc-onchain':
			return 'BTC on-chain';
		default:
			return assetId;
	}
}

/** Format provider code to proper-case name */
export function formatProviderName(code: string): string {
	const names: Record<string, string> = {
		moonpay: 'Moonpay',
		banxa: 'Banxa',
		transak: 'Transak',
		wert: 'Wert'
	};
	return names[code] || code.charAt(0).toUpperCase() + code.slice(1);
}

/** Convert BTC amount string to sats */
export function btcToSats(btcStr: string): number {
	return Math.round(parseFloat(btcStr) * 100_000_000);
}

/** Format sats with locale-appropriate commas */
export function formatSatsAmount(offer: ChangellyOfferSuccess): string {
	return btcToSats(offer.amountExpectedTo).toLocaleString();
}

/** Convert sats to USD string using current BTC price */
export function satsToUsd(sats: number, btcPrice: number): string {
	return ((sats / 100_000_000) * btcPrice).toFixed(2);
}

/** Format USD equivalent from a Changelly offer */
export function formatUsdFromSats(offer: ChangellyOfferSuccess, btcPrice: number): string {
	return satsToUsd(btcToSats(offer.amountExpectedTo), btcPrice);
}

/**
 * Calculate fee as difference between input USD and received value.
 * For BTC assets: input USD - (sats × BTC price)
 * For stablecoins (USDT0): input USD - received amount (1:1 USD)
 */
export function calculateFee(
	offer: ChangellyOfferSuccess,
	inputAmount: string,
	isBtcAsset: boolean,
	btcPrice: number
): string {
	const inputUsd = parseFloat(inputAmount) || 0;
	let receivedUsd: number;
	if (isBtcAsset) {
		receivedUsd = parseFloat(formatUsdFromSats(offer, btcPrice));
	} else {
		// Stablecoin: amountExpectedTo is already in USD terms
		receivedUsd = parseFloat(offer.amountExpectedTo) || 0;
	}
	const fee = Math.max(0, inputUsd - receivedUsd);
	return fee.toFixed(2);
}

/** Check if an offer has the lowest fee among filtered offers */
export function isLowestFee(
	offer: ChangellyOfferSuccess,
	filteredOffers: ChangellyOfferSuccess[],
	inputAmount: string,
	isBtcAsset: boolean,
	btcPrice: number
): boolean {
	if (filteredOffers.length <= 1) return true;
	const fees = filteredOffers.map((o) =>
		parseFloat(calculateFee(o, inputAmount, isBtcAsset, btcPrice))
	);
	const minFee = Math.min(...fees);
	return parseFloat(calculateFee(offer, inputAmount, isBtcAsset, btcPrice)) <= minFee;
}

/** Convert BTC amount string to sats string (for display) */
export function convertToSats(value: string, tokenId: string): string {
	if (!value) return '0';
	const n = parseFloat(value);
	if (tokenId === 'rbtc' || tokenId === 'wbtc-arb')
		return Math.round(n * 100_000_000).toLocaleString();
	if (tokenId === 'usdt0-arb') return Math.round(n * 100).toLocaleString();
	return value;
}

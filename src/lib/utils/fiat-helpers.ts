/**
 * Fiat ramp helper utilities — pure functions extracted from BuySellForm.svelte.
 * All functions are side-effect free and independently testable.
 */

import type { ChangellyOfferSuccess } from '$lib/services/fiat-ramp.service';

/** Friendly display name for an asset (not a Changelly ticker). */
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

export function formatProviderName(code: string): string {
	const names: Record<string, string> = {
		moonpay: 'Moonpay',
		banxa: 'Banxa',
		transak: 'Transak',
		wert: 'Wert'
	};
	return names[code] ?? (code ? code.charAt(0).toUpperCase() + code.slice(1) : code);
}

function btcToSats(amount: string): number {
	return Math.round((Number.parseFloat(amount) || 0) * 100_000_000);
}

export function formatSatsAmount(offer: ChangellyOfferSuccess): string {
	return btcToSats(offer.amountExpectedTo).toLocaleString();
}

export function formatUsdFromSats(offer: ChangellyOfferSuccess, btcPrice: number): string {
	return ((btcToSats(offer.amountExpectedTo) / 100_000_000) * btcPrice).toFixed(2);
}

export function calculateFee(
	offer: ChangellyOfferSuccess,
	inputAmount: string,
	isBtcAsset: boolean,
	btcPrice: number
): string {
	const inputUsd = Number.parseFloat(inputAmount) || 0;
	const receivedUsd = isBtcAsset
		? Number.parseFloat(formatUsdFromSats(offer, btcPrice))
		: Number.parseFloat(offer.amountExpectedTo) || 0;
	return Math.max(0, inputUsd - receivedUsd).toFixed(2);
}

export function isLowestFee(
	offer: ChangellyOfferSuccess,
	filteredOffers: ChangellyOfferSuccess[],
	inputAmount: string,
	isBtcAsset: boolean,
	btcPrice: number
): boolean {
	if (filteredOffers.length <= 1) return true;
	const fee = Number.parseFloat(calculateFee(offer, inputAmount, isBtcAsset, btcPrice));
	return (
		fee <=
		Math.min(
			...filteredOffers.map((candidate) =>
				Number.parseFloat(calculateFee(candidate, inputAmount, isBtcAsset, btcPrice))
			)
		)
	);
}

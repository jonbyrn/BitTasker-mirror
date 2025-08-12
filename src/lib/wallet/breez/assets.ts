import type { GetInfoResponse, Rate } from '@breeztech/breez-sdk-liquid/web';
import { getSdk } from './sdk';

/**
 * Get wallet information
 */
export async function getWalletInfo(): Promise<GetInfoResponse> {
	const sdk = getSdk();
	return await sdk.getInfo();
}

/**
 * Get asset balances from wallet
 */
export async function getAssetBalances(): Promise<any[]> {
	const sdk = getSdk();
	const info = await sdk.getInfo();
	return info.walletInfo.assetBalances || [];
}

/**
 * Fetch current fiat exchange rates
 */
export async function fetchFiatRates(): Promise<Rate[]> {
	const sdk = getSdk();
	return await sdk.fetchFiatRates();
}

/**
 * List supported fiat currencies
 */
export async function listFiatCurrencies(): Promise<any[]> {
	const sdk = getSdk();
	return await sdk.listFiatCurrencies();
}

/**
 * Get wallet balance in sats
 */
export async function getWalletBalance(): Promise<number> {
	const info = await getWalletInfo();
	return info.walletInfo.balanceSat || 0;
}

/**
 * Get specific asset balance
 */
export async function getAssetBalance(assetId: string): Promise<number> {
	const assets = await getAssetBalances();
	const asset = assets.find(a => a.assetId === assetId);
	return asset?.balance || 0;
}

/**
 * Get USD value for amount in sats
 */
export async function getSatsUsdValue(sats: number): Promise<number> {
	const rates = await fetchFiatRates();
	const btcRate = rates.find(rate => rate.coin === 'BTC');
	if (!btcRate) return 0;
	
	const btcAmount = sats / 100_000_000;
	return btcAmount * btcRate.value;
}

/**
 * Convert fiat amount to sats
 */
export async function fiatToSats(fiatAmount: number, fiatCurrency: string = 'USD'): Promise<number> {
	const rates = await fetchFiatRates();
	const btcRate = rates.find(rate => rate.coin === 'BTC');
	if (!btcRate) throw new Error('BTC rate not available');
	
	const btcAmount = fiatAmount / btcRate.value;
	return Math.round(btcAmount * 100_000_000);
}

/**
 * Convert sats to fiat amount
 */
export async function satsToFiat(sats: number, fiatCurrency: string = 'USD'): Promise<number> {
	const rates = await fetchFiatRates();
	const btcRate = rates.find(rate => rate.coin === 'BTC');
	if (!btcRate) return 0;
	
	const btcAmount = sats / 100_000_000;
	return btcAmount * btcRate.value;
}
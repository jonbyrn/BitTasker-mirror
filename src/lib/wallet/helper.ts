import { Preferences } from '@capacitor/preferences';
import * as bip39 from 'bip39';
import { fetchFiatRates, getTransactions, getWalletInfo } from './breez/walletService';
import * as breezSdk from '@breeztech/breez-sdk-liquid/web';

// Cache for balance and fiat rates to reduce API calls
interface BalanceCache {
	balance: { btc: number | undefined; sats: number; usdValue: number };
	timestamp: number;
}

interface FiatRatesCache {
	rates: breezSdk.Rate[];
	timestamp: number;
}

let balanceCache: BalanceCache | null = null;
let fiatRatesCache: FiatRatesCache | null = null;
const CACHE_DURATION_MS = 30000; // 30 seconds cache

/**
 * Retrieves the mnemonic phrase from Capacitor storage
 * @returns The mnemonic phrase as a string
 * @throws Error if mnemonic is not found in storage
 */
export async function getMnemonic(): Promise<string> {
	const { value } = await Preferences.get({ key: 'mnemonic' });

	if (!value) {
		throw new Error('Mnemonic not found in storage');
	}

	return value;
}

/**
 * Stores a mnemonic phrase in Capacitor storage
 * @param mnemonic - The mnemonic phrase to store
 * @returns A promise that resolves when the mnemonic is stored
 */
export async function setMnemonic(mnemonic: string): Promise<void> {
	if (!mnemonic || mnemonic.trim() === '') {
		throw new Error('Cannot store empty mnemonic');
	}

	await Preferences.set({
		key: 'mnemonic',
		value: mnemonic
	});
}

/**
 * Clears the mnemonic from Capacitor storage
 * @returns A promise that resolves when the mnemonic is cleared
 */
export async function clearMnemonic(): Promise<void> {
	await Preferences.remove({ key: 'mnemonic' });
}

/**
 * Generates a new mnemonic phrase
 * @returns A promise that resolves with the new mnemonic phrase
 */
export function generateMnemonic(): string {
	return bip39.generateMnemonic();
}

/**
 * Get cached fiat rates or fetch new ones
 */
async function getCachedFiatRates(): Promise<breezSdk.Rate[]> {
	const now = Date.now();
	
	// Return cached rates if they're still fresh
	if (fiatRatesCache && (now - fiatRatesCache.timestamp) < CACHE_DURATION_MS) {
		console.log('[Helper] Using cached fiat rates');
		return fiatRatesCache.rates;
	}

	try {
		console.log('[Helper] Fetching fresh fiat rates');
		const rates = await fetchFiatRates();
		fiatRatesCache = { rates, timestamp: now };
		return rates;
	} catch (error) {
		console.error('[Helper] Error fetching fiat rates:', error);
		// Return cached rates even if expired, or empty array as fallback
		return fiatRatesCache?.rates || [];
	}
}

/**
 * Get the balance of the wallet
 * @returns A promise that resolves with the balance of the wallet
 */
export async function getBalance(): Promise<{
	btc: number | undefined;
	sats: number;
	usdValue: number;
}> {
	const now = Date.now();
	
	// Return cached balance if it's still fresh
	if (balanceCache && (now - balanceCache.timestamp) < CACHE_DURATION_MS) {
		console.log('[Helper] Using cached balance');
		return balanceCache.balance;
	}

	try {
		console.log('[Helper] Fetching fresh balance');
		const info = await getWalletInfo();
		const btcBalance = info?.walletInfo.assetBalances.find(
			(asset) => asset.assetId === 'BTC'
		)?.balance;
		
		if (!btcBalance) {
			const fallbackBalance = { btc: undefined, sats: 0, usdValue: 0 };
			balanceCache = { balance: fallbackBalance, timestamp: now };
			return fallbackBalance;
		}
		
		const satsBalance = btcBalance ? btcBalance * 100000000 : 0;

		// Get fiat rates with caching
		const fiatRates = await getCachedFiatRates();
		const usdValue = fiatRates.length > 0 ? satsBalance * fiatRates[0].value : 0;
		
		const balance = { btc: btcBalance, sats: satsBalance, usdValue: usdValue };
		balanceCache = { balance, timestamp: now };
		
		return balance;
	} catch (error) {
		console.error('[Helper] Error fetching balance:', error);
		// Return cached balance even if expired, or fallback values
		return balanceCache?.balance || { btc: undefined, sats: 0, usdValue: 0 };
	}
}

/**
 * Get recent transactions
 * @returns A promise that resolves with the recent transactions
 */
export async function getRecentTransactions(): Promise<breezSdk.Payment[]> {
	try {
		const transactions = await getTransactions();
		console.log('[Helper] Fetched transactions:', transactions);
		return transactions.slice(0, 10);
	} catch (error) {
		console.error('[Helper] Error fetching transactions:', error);
		return [];
	}
}

/**
 * Clear all cached data
 */
export function clearCache(): void {
	balanceCache = null;
	fiatRatesCache = null;
	console.log('[Helper] All caches cleared');
}

import axios from 'axios';

/** Mempool sends Access-Control-Allow-Origin. Coinbase is the fallback. */
const MEMPOOL_PRICES = 'https://mempool.space/api/v1/prices';
const COINBASE_SPOT = 'https://api.coinbase.com/v2/prices/BTC-USD/spot';

function positiveNumber(value: unknown): number | null {
	const price = typeof value === 'number' ? value : Number(value);
	return Number.isFinite(price) && price > 0 ? price : null;
}

async function fetchMempoolBtcUsd(): Promise<number | null> {
	const response = await axios.get(MEMPOOL_PRICES, { timeout: 8000 });
	return positiveNumber(response.data?.USD);
}

async function fetchCoinbaseBtcUsd(date?: string): Promise<number | null> {
	const url = date ? `${COINBASE_SPOT}?date=${date}` : COINBASE_SPOT;
	const response = await axios.get(url, { timeout: 8000 });
	return positiveNumber(response.data?.data?.amount);
}

/** Live BTC-USD. Mempool first, then Coinbase, so a 403 on one feed is not a blank wallet. */
export async function fetchBtcUsd(): Promise<number> {
	try {
		const mempool = await fetchMempoolBtcUsd();
		if (mempool !== null) return mempool;
	} catch (error) {
		console.warn('[crypto-price] mempool price failed', error);
	}
	try {
		const coinbase = await fetchCoinbaseBtcUsd();
		if (coinbase !== null) return coinbase;
	} catch (error) {
		console.warn('[crypto-price] coinbase price failed', error);
	}
	throw new Error('Invalid BTC price response');
}

/**
 * Service for fetching cryptocurrency prices using a CORS-enabled feed
 */
class CryptoPriceService {
	private cache: Record<string, { price: number; timestamp: number }> = {};
	private cacheExpiration = 300000; // 5 minutes cache

	/**
	 * Get the exchange rate between two cryptocurrencies
	 * @param fromSymbol The base cryptocurrency symbol (e.g., BTC)
	 * @param toSymbol The quote cryptocurrency symbol (e.g., BTC)
	 * @returns Promise resolving to the exchange rate
	 */
	async getExchangeRate(fromSymbol: string, toSymbol: string): Promise<number> {
		const upperFromSymbol = fromSymbol.toUpperCase();
		const upperToSymbol = toSymbol.toUpperCase();
		const cacheKey = `${upperFromSymbol}-${upperToSymbol}`;

		// Check cache first
		if (
			this.cache[cacheKey] &&
			Date.now() - this.cache[cacheKey].timestamp < this.cacheExpiration
		) {
			return this.cache[cacheKey].price;
		}

		try {
			// For BTC pairs, use BTC prices from Coinbase (BTC is pegged 1:1 with BTC)
			if (upperFromSymbol === 'BTC') {
				if (upperToSymbol === 'BTC') {
					// BTC to BTC is 1:1 pegged
					const rate = 1.0;
					this.cache[cacheKey] = {
						price: rate,
						timestamp: Date.now()
					};
					return rate;
				} else {
					// For BTC to other currencies, get BTC price and target currency price
					// Get BTC price (check cache first to avoid recursion)
					let btcPrice: number;
					const btcCacheKey = 'BTC';
					if (
						this.cache[btcCacheKey] &&
						Date.now() - this.cache[btcCacheKey].timestamp < this.cacheExpiration
					) {
						btcPrice = this.cache[btcCacheKey].price;
					} else {
						btcPrice = await fetchBtcUsd();
						this.cache[btcCacheKey] = {
							price: btcPrice,
							timestamp: Date.now()
						};
					}

					// Get target currency price
					const toPrice = await this.getCurrentPrice(upperToSymbol);
					const rate = btcPrice / toPrice;

					// Update cache
					this.cache[cacheKey] = {
						price: rate,
						timestamp: Date.now()
					};

					return rate;
				}
			}

			// For other pairs, fallback to USD price calculation using Coinbase
			const fromPrice = await this.getCurrentPrice(upperFromSymbol);
			const toPrice = await this.getCurrentPrice(upperToSymbol);

			const rate = fromPrice / toPrice;

			// Update cache
			this.cache[cacheKey] = {
				price: rate,
				timestamp: Date.now()
			};

			return rate;
		} catch (error) {
			console.error(`Error fetching ${fromSymbol}/${toSymbol} exchange rate:`, error);
			throw new Error(`Failed to get exchange rate for ${fromSymbol}/${toSymbol}`);
		}
	}

	/**
	 * Get the current price of a cryptocurrency in USD
	 * @param symbol The cryptocurrency symbol (e.g., BTC)
	 * @returns Promise resolving to the current price
	 */
	async getCurrentPrice(symbol: string): Promise<number> {
		const upperSymbol = symbol.toUpperCase();
		const cacheKey = upperSymbol;

		// Check cache first
		if (
			this.cache[cacheKey] &&
			Date.now() - this.cache[cacheKey].timestamp < this.cacheExpiration
		) {
			return this.cache[cacheKey].price;
		}

		try {
			// For BTC, use BTC price from Coinbase (BTC is pegged 1:1 with BTC)
			if (upperSymbol === 'BTC') {
				// Check if BTC price is already cached
				const btcCacheKey = 'BTC';
				if (
					this.cache[btcCacheKey] &&
					Date.now() - this.cache[btcCacheKey].timestamp < this.cacheExpiration
				) {
					const btcPrice = this.cache[btcCacheKey].price;
					// Update cache with BTC price (same as BTC)
					this.cache[cacheKey] = {
						price: btcPrice,
						timestamp: Date.now()
					};
					return btcPrice;
				}

				const btcPrice = await fetchBtcUsd();
				this.cache[btcCacheKey] = {
					price: btcPrice,
					timestamp: Date.now()
				};
				this.cache[cacheKey] = {
					price: btcPrice,
					timestamp: Date.now()
				};
				return btcPrice;
			}

			// For other cryptocurrencies, fetch from Coinbase public API
			const response = await axios.get(
				`https://api.coinbase.com/v2/prices/${upperSymbol}-USD/spot`
			);

			if (response.data && response.data.data && response.data.data.amount) {
				const price = parseFloat(response.data.data.amount);

				// Update cache
				this.cache[cacheKey] = {
					price,
					timestamp: Date.now()
				};

				return price;
			}

			throw new Error('Invalid response format');
		} catch (error) {
			const stale = this.cache[cacheKey];
			if (stale && stale.price > 0) return stale.price;
			console.warn('[crypto-price] price unavailable', symbol, error);
			throw new Error(`Failed to get price for ${symbol}`);
		}
	}

	/**
	 * Get historical price of Bitcoin for a specific date
	 * @param daysAgo Number of days ago to get the price
	 * @returns Promise resolving to the historical price in USD, or null if unavailable
	 */
	async getHistoricalPrice(daysAgo: number): Promise<number | null> {
		const cacheKey = `BTC_HIST_${daysAgo}d`;

		// Check cache first (cache for 1 hour since historical data doesn't change)
		if (this.cache[cacheKey] && Date.now() - this.cache[cacheKey].timestamp < 3600000) {
			return this.cache[cacheKey].price;
		}

		try {
			const targetDate = new Date();
			targetDate.setDate(targetDate.getDate() - daysAgo);
			const dateStr = targetDate.toISOString().split('T')[0];
			const timestamp = Math.floor(targetDate.getTime() / 1000);
			let price: number | null = null;
			try {
				const response = await axios.get(
					`https://mempool.space/api/v1/historical-price?currency=USD&timestamp=${timestamp}`,
					{ timeout: 8000 }
				);
				const rows = response.data?.prices;
				const latest = Array.isArray(rows) ? rows[rows.length - 1] : null;
				price = positiveNumber(latest?.USD);
			} catch (error) {
				console.warn('[crypto-price] mempool history failed', error);
			}
			price ??= await fetchCoinbaseBtcUsd(dateStr);
			if (price === null) return null;
			this.cache[cacheKey] = {
				price,
				timestamp: Date.now()
			};
			return price;
		} catch (error) {
			console.warn(
				`[CryptoPriceService] Failed to fetch historical price for ${daysAgo}d ago:`,
				error
			);
			return null;
		}
	}
}

export default new CryptoPriceService();

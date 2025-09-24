import axios from 'axios';

/**
 * Service for fetching cryptocurrency prices using Coinbase API
 */
class CryptoPriceService {
  private cache: Record<string, { price: number; timestamp: number }> = {};
  private cacheExpiration = 300000; // 5 minutes cache

  /**
   * Get the exchange rate between two cryptocurrencies
   * @param fromSymbol The base cryptocurrency symbol (e.g., RBTC)
   * @param toSymbol The quote cryptocurrency symbol (e.g., BTC)
   * @returns Promise resolving to the exchange rate
   */
  async getExchangeRate(fromSymbol: string, toSymbol: string): Promise<number> {
    const upperFromSymbol = fromSymbol.toUpperCase();
    const upperToSymbol = toSymbol.toUpperCase();
    const cacheKey = `${upperFromSymbol}-${upperToSymbol}`;

    // Check cache first
    if (this.cache[cacheKey] && Date.now() - this.cache[cacheKey].timestamp < this.cacheExpiration) {
      return this.cache[cacheKey].price;
    }

    console.log(upperFromSymbol, upperToSymbol);

    try {
      // For rBTC/BTC specifically, use CoinGecko API (Coinbase doesn't support rBTC)
      if (upperFromSymbol === 'RBTC' && upperToSymbol === 'BTC') {
        const response = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=rootstock-smart-bitcoin&vs_currencies=btc');

        if (response.data && response.data['rootstock-smart-bitcoin'] && response.data['rootstock-smart-bitcoin'].btc) {
          const rate = response.data['rootstock-smart-bitcoin'].btc;

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

      // Critical: Don't return fallback for rBTC - throw error instead
      // This prevents showing incorrect balance to users
      if (upperFromSymbol === 'RBTC' && upperToSymbol === 'BTC') {
        throw new Error(`Unable to fetch rBTC/BTC exchange rate. Please try again later.`);
      }

      // For other pairs, use fallback rates
      const fallbackRates: Record<string, number> = {
        'BTC-ETH': 0.03,
        'ETH-BTC': 33.33
      };

      if (fallbackRates[cacheKey]) {
        return fallbackRates[cacheKey];
      }

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
    if (this.cache[cacheKey] && Date.now() - this.cache[cacheKey].timestamp < this.cacheExpiration) {
      return this.cache[cacheKey].price;
    }

    try {
      // Fetch from Coinbase public API
      const response = await axios.get(`https://api.coinbase.com/v2/prices/${upperSymbol}-USD/spot`);

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
      console.error(`Error fetching ${symbol} price:`, error);

      // Fallback prices if API fails
      const fallbackPrices: Record<string, number> = {
        BTC: 100000,
        ETH: 50000
      };

      // Return fallback price or throw error
      if (fallbackPrices[upperSymbol]) {
        return fallbackPrices[upperSymbol];
      }

      throw new Error(`Failed to get price for ${symbol}`);
    }
  }
}

export default new CryptoPriceService();

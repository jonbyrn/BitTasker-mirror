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

    try {
      // For rBTC pairs, use CoinGecko API (Coinbase doesn't support rBTC)
      if (upperFromSymbol === 'RBTC') {
        const vsCurrency = upperToSymbol.toLowerCase();
        const response = await axios.get(`https://api.coingecko.com/api/v3/simple/price?ids=rootstock&vs_currencies=${vsCurrency}`);

        if (response.data && response.data.rootstock && response.data.rootstock[vsCurrency]) {
          const rate = response.data.rootstock[vsCurrency];

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
    } catch {
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
      // For RBTC, use CoinGecko API (Coinbase doesn't support it)
      if (upperSymbol === 'RBTC') {
        const response = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=rootstock&vs_currencies=usd');

        if (response.data && response.data.rootstock && response.data.rootstock.usd) {
          const price = response.data.rootstock.usd;

          // Update cache
          this.cache[cacheKey] = {
            price,
            timestamp: Date.now()
          };

          return price;
        }

        throw new Error('Invalid CoinGecko response format for RBTC');
      }

      // For other cryptocurrencies, fetch from Coinbase public API
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
    } catch {
      throw new Error(`Failed to get price for ${symbol}`);
    }
  }
}

export default new CryptoPriceService();

import axios from 'axios';

/**
 * Service for fetching cryptocurrency prices
 */
class CryptoPriceService {
  private cache: Record<string, { price: number; timestamp: number }> = {};
  private cacheExpiration = 60000; // 1 minute cache

  /**
   * Get the current price of a cryptocurrency in USDT
   * @param symbol The cryptocurrency symbol (e.g., BTC)
   * @returns Promise resolving to the current price
   */
  async getCurrentPrice(symbol: string): Promise<number> {
    const upperSymbol = symbol.toUpperCase();
    const cacheKey = `${upperSymbol}USDT`;
    
    // Check cache first
    if (this.cache[cacheKey] && Date.now() - this.cache[cacheKey].timestamp < this.cacheExpiration) {
      return this.cache[cacheKey].price;
    }
    
    try {
      // Fetch from Binance public API
      const response = await axios.get(`https://api.binance.com/api/v3/ticker/price?symbol=${cacheKey}`);
      
      if (response.data && response.data.price) {
        const price = parseFloat(response.data.price);
        
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
        BTC: 63000,
        ETH: 3500
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

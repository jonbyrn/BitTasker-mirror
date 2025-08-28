import axios from 'axios';

/**
 * Service for fetching cryptocurrency prices using Coinbase API
 */
class CryptoPriceService {
  private cache: Record<string, { price: number; timestamp: number }> = {};
  private cacheExpiration = 300000; // 5 minutes cache

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

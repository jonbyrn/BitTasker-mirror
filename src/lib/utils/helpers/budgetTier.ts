/**
 * Get the budget bucket (tier) based on amount and currency
 * Supports USD, BTC, and SATS
 */
export function getBudgetBucket(amount: number, currency: string): string {
    if(!amount || amount === 0) return 'micro';
    const upperCurrency = currency.toUpperCase();
    
    
    // Satoshi ranges (in sats)
    if (upperCurrency === 'SATS') {
        if (amount < 1000) return 'micro';            // < 1,000 sats (~$40)
        if (amount < 10000) return 'small';           // 1,000-10,000 sats (~$40-400)
        if (amount < 100000) return 'medium';         // 10,000-100,000 sats (~$400-4000)
        if (amount < 1000000) return 'large';         // 100,000-1,000,000 sats (~$4K-40K)
        return 'enterprise';                          // 1,000,000+ sats (~$40K+)
    }
    
    // USD ranges (default for all non-BTC/SATS)
    if (amount < 100) return 'micro';                 // < $100
    if (amount < 500) return 'small';                 // $100-500
    if (amount < 1000) return 'medium';               // $500-1000
    if (amount < 5000) return 'large';               // $1000-5000
    return 'enterprise';                              // $5000+
}

/**
 * Get the budget tier for a range of values
 * Returns the appropriate tier that encompasses the given range
 */
export function getBudgetTiersForRange(minBudget?: number, maxBudget?: number, currency = 'USD'): string | null {
    if (!minBudget && !maxBudget) return null;
    
    const upperCurrency = currency.toUpperCase();
    
    // Define tier ranges based on currency
    let tierRanges: { tier: string; min: number; max: number }[] = [];
    
    if (upperCurrency === 'SATS') {
        tierRanges = [
            { tier: 'micro', min: 0, max: 1000 },
            { tier: 'small', min: 1000, max: 10000 },
            { tier: 'medium', min: 10000, max: 100000 },
            { tier: 'large', min: 100000, max: 1000000 },
            { tier: 'enterprise', min: 1000000, max: Infinity }
        ];
    } else {
        // USD (default for all non-BTC/SATS)
        tierRanges = [
            { tier: 'micro', min: 0, max: 100 },
            { tier: 'small', min: 100, max: 500 },
            { tier: 'medium', min: 500, max: 1000 },
            { tier: 'large', min: 1000, max: 5000 },
            { tier: 'enterprise', min: 5000, max: Infinity }
        ];
    }
    
    const requestMin = minBudget || 0;
    const requestMax = maxBudget || Infinity;
    
    // Find the tier that best encompasses the range
    // Priority: exact match > partial overlap > closest tier
    for (const tierRange of tierRanges) {
        // Check if the tier range completely encompasses the request range
        if (tierRange.min <= requestMin && tierRange.max >= requestMax) {
            return tierRange.tier;
        }
    }
    
    // If no exact match, find the tier with the most overlap
    let bestTier = null;
    let maxOverlap = 0;
    
    for (const tierRange of tierRanges) {
        const overlapMin = Math.max(tierRange.min, requestMin);
        const overlapMax = Math.min(tierRange.max, requestMax);
        const overlap = Math.max(0, overlapMax - overlapMin);
        
        if (overlap > maxOverlap) {
            maxOverlap = overlap;
            bestTier = tierRange.tier;
        }
    }
    
    return bestTier;
}

/**
 * Get all available budget tiers for a currency with their ranges
 * Supports USD, BTC, and SATS
 */
export function getBudgetTiersForCurrency(currency: string): Array<{ tier: string; min: number; max: number; label: string }> {
    if (!currency) return [];
    const upperCurrency = currency.toUpperCase();
    
    if (upperCurrency === 'SATS') {
        return [
            { tier: 'micro', min: 0, max: 1000, label: '< 1,000 sats (~$40)' },
            { tier: 'small', min: 1000, max: 10000, label: '1K-10K sats (~$40-400)' },
            { tier: 'medium', min: 10000, max: 100000, label: '10K-100K sats (~$400-4K)' },
            { tier: 'large', min: 100000, max: 1000000, label: '100K-1M sats (~$4K-40K)' },
            { tier: 'enterprise', min: 1000000, max: Infinity, label: '1M+ sats (~$40K+)' }
        ];
    }
    
    // USD (default for all non-BTC/SATS)
    return [
        { tier: 'micro', min: 0, max: 100, label: 'Under $100' },
        { tier: 'small', min: 100, max: 500, label: '$100-500' },
        { tier: 'medium', min: 500, max: 1000, label: '$500-1K' },
        { tier: 'large', min: 1000, max: 5000, label: '$1K-5K' },
        { tier: 'enterprise', min: 5000, max: Infinity, label: '$5K+' }
    ];
}

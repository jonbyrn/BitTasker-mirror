/**
 * Get the budget bucket (tier) based on amount and currency
 * Supports USD and BTC only
 */
export function getBudgetBucket(amount: number, currency: string): string {
    const upperCurrency = currency.toUpperCase();
    
    // Bitcoin ranges (in BTC)
    if (upperCurrency === 'BTC') {
        if (amount < 0.001) return 'micro';           // < 0.001 BTC (~$40)
        if (amount < 0.01) return 'small';            // 0.001-0.01 BTC (~$40-400)
        if (amount < 0.1) return 'medium';            // 0.01-0.1 BTC (~$400-4000)
        if (amount < 1) return 'large';               // 0.1-1 BTC (~$4000-40000)
        return 'enterprise';                          // 1+ BTC (~$40000+)
    }
    
    // USD ranges (default for all non-BTC)
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
    
    if (upperCurrency === 'BTC') {
        tierRanges = [
            { tier: 'micro', min: 0, max: 0.001 },
            { tier: 'small', min: 0.001, max: 0.01 },
            { tier: 'medium', min: 0.01, max: 0.1 },
            { tier: 'large', min: 0.1, max: 1 },
            { tier: 'enterprise', min: 1, max: Infinity }
        ];
    } else {
        // USD (default for all non-BTC)
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
 * Supports USD and BTC only
 */
export function getBudgetTiersForCurrency(currency: string): Array<{ tier: string; min: number; max: number; label: string }> {
    if (!currency) return [];
    const upperCurrency = currency.toUpperCase();
    
    if (upperCurrency === 'BTC') {
        return [
            { tier: 'micro', min: 0, max: 0.001, label: '< 0.001 BTC (~$40)' },
            { tier: 'small', min: 0.001, max: 0.01, label: '0.001-0.01 BTC (~$40-400)' },
            { tier: 'medium', min: 0.01, max: 0.1, label: '0.01-0.1 BTC (~$400-4K)' },
            { tier: 'large', min: 0.1, max: 1, label: '0.1-1 BTC (~$4K-40K)' },
            { tier: 'enterprise', min: 1, max: Infinity, label: '1+ BTC (~$40K+)' }
        ];
    }
    
    // USD (default for all non-BTC)
    return [
        { tier: 'micro', min: 0, max: 100, label: 'Under $100' },
        { tier: 'small', min: 100, max: 500, label: '$100-500' },
        { tier: 'medium', min: 500, max: 1000, label: '$500-1K' },
        { tier: 'large', min: 1000, max: 5000, label: '$1K-5K' },
        { tier: 'enterprise', min: 5000, max: Infinity, label: '$5K+' }
    ];
}
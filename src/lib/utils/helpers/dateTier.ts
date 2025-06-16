/**
 * Get date tier based on how far in the future the date is
 * Returns consistent tier identifiers for filtering
 */
export function getDateTier(dateString: string): string {
    const targetDate = new Date(dateString);
    const now = new Date();
    const diffInDays = Math.ceil((targetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (diffInDays < 0) return 'overdue';        // Past dates
    if (diffInDays === 0) return 'today';        // Today
    if (diffInDays <= 3) return 'urgent';        // 1-3 days
    if (diffInDays <= 7) return 'week';          // 4-7 days  
    if (diffInDays <= 30) return 'month';        // 1-30 days
    if (diffInDays <= 90) return 'quarter';      // 1-3 months
    return 'future';                             // 3+ months
}

/**
 * Get all available date tiers with their descriptions
 */
export function getDateTiers(): Array<{ tier: string; label: string; description: string }> {
    return [
        { tier: 'overdue', label: 'Overdue', description: 'Past due dates' },
        { tier: 'today', label: 'Today', description: 'Due today' },
        { tier: 'urgent', label: 'Urgent (1-3 days)', description: 'Due within 3 days' },
        { tier: 'week', label: 'This Week (4-7 days)', description: 'Due within a week' },
        { tier: 'month', label: 'This Month (1-30 days)', description: 'Due within a month' },
        { tier: 'quarter', label: 'This Quarter (1-3 months)', description: 'Due within 3 months' },
        { tier: 'future', label: 'Future (3+ months)', description: 'Due in 3+ months' }
    ];
}

/**
 * Convert date range filters to date tiers for server-side filtering
 * Returns separate tiers for start and end dates
 */
export function getDateTiersForRange(startDate?: string, endDate?: string): {
    startTiers: string[];
    endTiers: string[];
} {
    const result = { startTiers: [] as string[], endTiers: [] as string[] };

    if (!startDate && !endDate) return result;

    const allTiers = ['overdue', 'today', 'urgent', 'week', 'month', 'quarter', 'future'];

    // Handle start date tiers
    if (startDate) {
        const startTier = getDateTier(startDate);
        const startIndex = allTiers.indexOf(startTier);
        if (startIndex !== -1) {
            // Include all tiers from start tier onwards
            result.startTiers = allTiers.slice(startIndex);
        }
    }

    // Handle end date tiers  
    if (endDate) {
        const endTier = getDateTier(endDate);
        const endIndex = allTiers.indexOf(endTier);
        if (endIndex !== -1) {
            // Include all tiers up to and including end tier
            result.endTiers = allTiers.slice(0, endIndex + 1);
        }
    }

    return result;
}

/**
 * Get date tiers for a single date (used for deadlines)
 */
export function getDateTiersForSingleDate(date: string): string[] {
    const tier = getDateTier(date);
    const allTiers = ['overdue', 'today', 'urgent', 'week', 'month', 'quarter', 'future'];
    const tierIndex = allTiers.indexOf(tier);

    if (tierIndex !== -1) {
        // For single dates/deadlines, include the specific tier and all more urgent tiers
        return allTiers.slice(0, tierIndex + 1);
    }

    return [tier];
}

/**
 * Get months and days included in a date range
 * @param startDate - Start date string
 * @param endDate - End date string
 * @returns Object containing arrays of included months (0-11) and days (1-31)
 */
export function getDateRangeTags(endDate: string, startDate?: string): { months: string[], days: string[] } {
    const start = startDate ? new Date(startDate) : new Date();
    const end = new Date(endDate);

    const months = new Set<string>();
    const days = new Set<string>();

    // Clone start date to iterate through the range
    const current = start ? new Date(start) : new Date(end);

    // Iterate through each day in the range
    while (current <= end) {
        // convert to string
        months.add(current.getMonth()?.toString());
        days.add(current.getDate()?.toString());

        // Move to next day
        current.setDate(current.getDate() + 1);
    }

    return {
        months: Array.from(months), // .sort((a, b) => Number(a) - Number(b)),
        days: Array.from(days) // .sort((a, b) => Number(a) - Number(b))
    };
} 
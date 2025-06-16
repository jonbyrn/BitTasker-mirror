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
        months.add(current.getMonth()?.toString());
        days.add(current.getDate()?.toString());

        // Move to next day
        current.setDate(current.getDate() + 1);
    }

    return {
        months: Array.from(months),
        days: Array.from(days)
    };
} 
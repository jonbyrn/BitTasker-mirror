// Helper function to create subscription key
export function createSubscriptionKey(npub: string, kindFilters?: { [kind: number]: { [tag: string]: string } | null | undefined }): string {
    if (!kindFilters) {
        return `${npub}:default`;
    }
    const kinds = Object.keys(kindFilters).sort().join(',');
    const tags = Object.entries(kindFilters)
        .map(([kind, tagFilters]) => {
            if (!tagFilters) return '';
            return Object.entries(tagFilters)
                .map(([tag, value]) => `${tag}:${value}`)
                .sort()
                .join(';');
        })
        .filter(Boolean)
        .join('|');
    return `${npub}:${kinds}:${tags}`;
}
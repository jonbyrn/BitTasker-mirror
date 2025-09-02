/**
 * Request Throttler for Breez SDK to prevent infinite Blockstream API loops
 * 
 * This utility intercepts fetch requests to Blockstream APIs and throttles them
 * to prevent the infinite polling issue in Breez SDK v0.10.3+
 */

interface RequestCache {
    lastRequestTime: number;
    requestCount: number;
    blocked: boolean;
    lastResponse?: Response;
    triggerSource?: string; // Track what SDK function triggered this
}

class BlockstreamRequestThrottler {
    private originalFetch?: typeof fetch;
    private requestCache = new Map<string, RequestCache>();
    private readonly THROTTLE_MS = 15000; // 15 seconds minimum between requests (more aggressive)
    private readonly MAX_REQUESTS_PER_HOUR = 20; // Reduced from per minute to per hour
    private readonly BLOCK_DURATION_MS = 300000; // Block for 5 minutes if too many requests
    private readonly CACHE_DURATION_MS = 60000; // Cache responses for 1 minute
    private initialized = false;

    constructor() {
        // Only bind fetch if we're in a browser environment
        if (typeof window !== 'undefined' && window.fetch) {
            this.originalFetch = window.fetch.bind(window);
        }
    }

    /**
     * Get the call stack to identify what triggered the request
     */
    private getCallStack(): string {
        const stack = new Error().stack || '';
        const lines = stack.split('\n');
        
        // Look for SDK-related calls in the stack
        const relevantLines = lines.filter(line => 
            line.includes('breez') || 
            line.includes('sdk') || 
            line.includes('wallet') ||
            line.includes('getInfo') ||
            line.includes('fetchFiatRates') ||
            line.includes('listPayments') ||
            line.includes('getTransactions') ||
            line.includes('getBalance')
        );
        
        return relevantLines.length > 0 ? relevantLines[0].trim() : 'Unknown source';
    }

    /**
     * Initialize the request throttler by overriding window.fetch
     */
    public initialize(): void {
        if (this.initialized || typeof window === 'undefined' || !window.fetch) {
            console.log('[Breez Throttler] Skipping initialization - not in browser environment');
            return;
        }

        if (!this.originalFetch) {
            console.error('[Breez Throttler] Original fetch not available');
            return;
        }

        console.log('[Breez Throttler] Initializing AGGRESSIVE request throttling for Blockstream APIs');

        window.fetch = this.throttledFetch.bind(this);
        this.initialized = true;
    }

    /**
     * Restore the original fetch function
     */
    public destroy(): void {
        if (!this.initialized || typeof window === 'undefined' || !this.originalFetch) {
            return;
        }

        console.log('[Breez Throttler] Destroying request throttler');
        window.fetch = this.originalFetch;
        this.requestCache.clear();
        this.initialized = false;
    }

    /**
     * Throttled fetch implementation
     */
    private async throttledFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
        const url = typeof input === 'string' ? input : input.toString();

        // Check if this is a Blockstream API request
        if (this.isBlockstreamRequest(url)) {
            const triggerSource = this.getCallStack();
            
            // Log the specific request and its source
            console.warn(`[Breez Throttler] 🔍 Blockstream API call detected:
                URL: ${url}
                Triggered by: ${triggerSource}
                Time: ${new Date().toISOString()}`);

            const cached = this.requestCache.get(url);
            const now = Date.now();

            // Return cached response if available and fresh
            if (cached?.lastResponse && (now - cached.lastRequestTime) < this.CACHE_DURATION_MS) {
                console.log('[Breez Throttler] Returning cached response for:', url);
                return cached.lastResponse.clone();
            }

            const shouldThrottle = this.shouldThrottleRequest(url);
            
            if (shouldThrottle) {
                console.warn(`[Breez Throttler] 🚫 BLOCKING request to: ${url}
                    Reason: Too frequent requests
                    Triggered by: ${triggerSource}`);
                
                // Return a cached response if available, otherwise create a throttled response
                if (cached?.lastResponse) {
                    return cached.lastResponse.clone();
                }
                return this.createThrottledResponse();
            } else {
                console.log(`[Breez Throttler] ✅ Allowing request to: ${url}
                    Triggered by: ${triggerSource}`);
                this.updateRequestCache(url, triggerSource);
            }
        }

        // Proceed with original fetch for non-Blockstream requests or allowed Blockstream requests
        if (!this.originalFetch) {
            throw new Error('Original fetch function not available');
        }
        
        const response = await this.originalFetch(input, init);
        
        // Cache the response if it's a Blockstream request
        if (this.isBlockstreamRequest(url)) {
            const cached = this.requestCache.get(url);
            if (cached) {
                cached.lastResponse = response.clone();
            }
        }
        
        return response;
    }

    /**
     * Check if URL is a Blockstream API request
     */
    private isBlockstreamRequest(url: string): boolean {
        return url.includes('blockstream.info') || 
               url.includes('liquid.network') ||
               url.includes('liquidtestnet') ||
               url.includes('bitcoin.blockstream.com') ||
               url.includes('api.blockstream.space') ||
               url.includes('mempool.space');
    }

    /**
     * Determine if a request should be throttled
     */
    private shouldThrottleRequest(url: string): boolean {
        const now = Date.now();
        const cached = this.requestCache.get(url);

        // EMERGENCY BLOCK: Block the specific problematic address polling
        if (url.includes('/api/address/') && url.includes('/txs')) {
            console.warn('[Breez Throttler] 🚫 EMERGENCY BLOCK: Blocking infinite address polling:', url);
            return true; // Always block these requests
        }

        // AGGRESSIVE BLOCKING: Block common patterns that cause infinite loops
        if (this.isProblematicPattern(url)) {
            console.warn('[Breez Throttler] 🚫 BLOCKING problematic pattern:', url);
            return true;
        }

        if (!cached) {
            return false; // First request, allow it
        }

        // Check if currently blocked due to too many requests
        if (cached.blocked && (now - cached.lastRequestTime) < this.BLOCK_DURATION_MS) {
            return true;
        }

        // Reset block status after block duration
        if (cached.blocked && (now - cached.lastRequestTime) >= this.BLOCK_DURATION_MS) {
            cached.blocked = false;
            cached.requestCount = 0;
        }

        // Check throttle interval
        if ((now - cached.lastRequestTime) < this.THROTTLE_MS) {
            return true;
        }

        // Check request rate limiting (per hour instead of per minute)
        const hourAgo = now - 3600000; // 1 hour in milliseconds
        if (cached.requestCount >= this.MAX_REQUESTS_PER_HOUR && cached.lastRequestTime > hourAgo) {
            console.warn('[Breez Throttler] Too many requests to URL in the last hour, blocking for 5 minutes:', url);
            cached.blocked = true;
            return true;
        }

        return false;
    }

    /**
     * Check for problematic URL patterns that cause infinite loops
     */
    private isProblematicPattern(url: string): boolean {
        // Patterns that are known to cause infinite loops in Breez SDK
        const problematicPatterns = [
            '/api/address/',      // Address polling
            '/api/tx/',           // Transaction polling  
            '/api/address',       // Address info
            'electrs/rest',       // Electrs REST API
            '/status',            // Status endpoints
            '/fees',              // Fee estimation
        ];

        // Check for rapid polling patterns
        for (const pattern of problematicPatterns) {
            if (url.includes(pattern)) {
                const cached = this.requestCache.get(url);
                if (cached && cached.requestCount > 3) {
                    console.warn(`[Breez Throttler] Detected rapid polling pattern: ${pattern} in ${url}`);
                    return true;
                }
            }
        }

        // Block any URL that's been called more than 5 times in the last 5 minutes
        const cached = this.requestCache.get(url);
        if (cached) {
            const fiveMinutesAgo = Date.now() - 300000;
            if (cached.requestCount > 5 && cached.lastRequestTime > fiveMinutesAgo) {
                console.warn(`[Breez Throttler] URL called too frequently: ${url} (${cached.requestCount} times)`);
                return true;
            }
        }

        return false;
    }

    /**
     * Update request cache with new request info
     */
    private updateRequestCache(url: string, triggerSource?: string): void {
        const now = Date.now();
        const cached = this.requestCache.get(url) || { 
            lastRequestTime: 0, 
            requestCount: 0, 
            blocked: false,
            triggerSource 
        };

        // Reset count if more than an hour has passed
        if ((now - cached.lastRequestTime) > 3600000) {
            cached.requestCount = 0;
        }

        cached.lastRequestTime = now;
        cached.requestCount++;
        cached.triggerSource = triggerSource; // Update trigger source
        
        this.requestCache.set(url, cached);
    }

    /**
     * Create a mock response for throttled requests
     */
    private createThrottledResponse(): Response {
        const mockResponse = {
            error: 'Request throttled by Breez SDK',
            message: 'Too many requests to Blockstream API',
            throttled: true,
            timestamp: Date.now()
        };

        return new Response(JSON.stringify(mockResponse), {
            status: 429,
            statusText: 'Too Many Requests',
            headers: {
                'Content-Type': 'application/json',
                'X-Throttled-By': 'Breez-SDK-Throttler'
            }
        });
    }

    /**
     * Get current cache statistics for debugging
     */
    public getStats(): Record<string, RequestCache> {
        const stats: Record<string, RequestCache> = {};
        this.requestCache.forEach((value, key) => {
            stats[key] = { 
                lastRequestTime: value.lastRequestTime,
                requestCount: value.requestCount, 
                blocked: value.blocked,
                triggerSource: value.triggerSource
            };
        });
        return stats;
    }

    /**
     * Clear request cache
     */
    public clearCache(): void {
        this.requestCache.clear();
        console.log('[Breez Throttler] Request cache cleared');
    }

    /**
     * Force block all Blockstream requests for a duration
     */
    public emergencyBlock(durationMs: number = 300000): void {
        console.warn('[Breez Throttler] EMERGENCY BLOCK activated for', durationMs/1000, 'seconds');
        this.requestCache.forEach((cached) => {
            cached.blocked = true;
            cached.lastRequestTime = Date.now();
        });
        
        // Auto-unblock after duration
        setTimeout(() => {
            this.requestCache.forEach((cached) => {
                cached.blocked = false;
                cached.requestCount = 0;
            });
            console.log('[Breez Throttler] Emergency block lifted');
        }, durationMs);
    }

    /**
     * Get a summary of what SDK functions are making Blockstream calls
     */
    public getTriggerSummary(): Record<string, number> {
        const summary: Record<string, number> = {};
        this.requestCache.forEach((cached) => {
            const source = cached.triggerSource || 'Unknown';
            summary[source] = (summary[source] || 0) + cached.requestCount;
        });
        return summary;
    }
}

// Create singleton instance
export const blockstreamThrottler = new BlockstreamRequestThrottler();

/**
 * Initialize request throttling (call this before SDK initialization)
 */
export const enableRequestThrottling = (): void => {
    blockstreamThrottler.initialize();
};

/**
 * Disable request throttling and restore original fetch
 */
export const disableRequestThrottling = (): void => {
    blockstreamThrottler.destroy();
};

/**
 * Get throttling statistics for debugging
 */
export const getThrottlingStats = (): Record<string, RequestCache> => {
    return blockstreamThrottler.getStats();
};

/**
 * Clear throttling cache
 */
export const clearThrottlingCache = (): void => {
    blockstreamThrottler.clearCache();
};

/**
 * Emergency block all Blockstream requests
 */
export const emergencyBlock = (durationMs?: number): void => {
    blockstreamThrottler.emergencyBlock(durationMs);
};

/**
 * Get summary of what SDK functions are triggering requests
 */
export const getTriggerSummary = (): Record<string, number> => {
    return blockstreamThrottler.getTriggerSummary();
}; 
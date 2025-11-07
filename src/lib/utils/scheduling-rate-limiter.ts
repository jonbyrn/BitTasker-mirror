/**
 * Rate limiter for scheduling requests to prevent abuse
 * Tracks request frequency per user and enforces limits
 */

export interface RateLimitConfig {
	maxRequestsPerWindow: number; // Maximum requests allowed in time window
	windowMs: number; // Time window in milliseconds
	blockDurationMs: number; // Duration to block after limit exceeded
}

export interface RateLimitResult {
	allowed: boolean;
	remainingRequests: number;
	resetTime: number; // Unix timestamp when limit resets
	blockedUntil?: number; // Unix timestamp when block expires
	reason?: string;
}

export interface RequestRecord {
	timestamp: number;
	requestId: string;
}

const DEFAULT_CONFIG: RateLimitConfig = {
	maxRequestsPerWindow: 10, // 10 requests per window
	windowMs: 15 * 60 * 1000, // 15 minutes
	blockDurationMs: 60 * 60 * 1000 // Block for 1 hour after limit exceeded
};

/**
 * Rate limiter class for scheduling requests
 */
export class SchedulingRateLimiter {
	private requestHistory = new Map<string, RequestRecord[]>(); // Map of userPubkey -> request history
	private blockedUsers = new Map<string, number>(); // Map of userPubkey -> block expiry timestamp
	private config: RateLimitConfig;

	constructor(config: Partial<RateLimitConfig> = {}) {
		this.config = { ...DEFAULT_CONFIG, ...config };
	}

	/**
	 * Check if a request should be allowed
	 */
	checkRateLimit(userPubkey: string, requestId: string): RateLimitResult {
		const now = Date.now();

		// Check if user is currently blocked
		const blockExpiry = this.blockedUsers.get(userPubkey);
		if (blockExpiry && now < blockExpiry) {
			return {
				allowed: false,
				remainingRequests: 0,
				resetTime: blockExpiry,
				blockedUntil: blockExpiry,
				reason: `Rate limit exceeded. Blocked until ${new Date(blockExpiry).toISOString()}`
			};
		}

		// Remove expired block
		if (blockExpiry && now >= blockExpiry) {
			this.blockedUsers.delete(userPubkey);
		}

		// Get request history for user
		const history = this.requestHistory.get(userPubkey) || [];
		
		// Filter to requests within the time window
		const windowStart = now - this.config.windowMs;
		const recentRequests = history.filter((record) => record.timestamp >= windowStart);

		// Check if limit exceeded
		if (recentRequests.length >= this.config.maxRequestsPerWindow) {
			// Block user
			const blockUntil = now + this.config.blockDurationMs;
			this.blockedUsers.set(userPubkey, blockUntil);

			// Calculate reset time (oldest request in window + window duration)
			const oldestRequest = recentRequests[0];
			const resetTime = oldestRequest.timestamp + this.config.windowMs;

			return {
				allowed: false,
				remainingRequests: 0,
				resetTime: Math.max(resetTime, blockUntil),
				blockedUntil: blockUntil,
				reason: `Rate limit exceeded: ${recentRequests.length} requests in the last ${Math.round(this.config.windowMs / 60000)} minutes`
			};
		}

		// Record this request
		recentRequests.push({ timestamp: now, requestId });
		this.requestHistory.set(userPubkey, recentRequests);

		// Calculate reset time
		const oldestRequest = recentRequests[0];
		const resetTime = oldestRequest.timestamp + this.config.windowMs;

		return {
			allowed: true,
			remainingRequests: this.config.maxRequestsPerWindow - recentRequests.length,
			resetTime
		};
	}

	/**
	 * Check if user is currently blocked
	 */
	isBlocked(userPubkey: string): boolean {
		const blockExpiry = this.blockedUsers.get(userPubkey);
		if (!blockExpiry) return false;

		const now = Date.now();
		if (now >= blockExpiry) {
			this.blockedUsers.delete(userPubkey);
			return false;
		}

		return true;
	}

	/**
	 * Get remaining requests for a user
	 */
	getRemainingRequests(userPubkey: string): number {
		if (this.isBlocked(userPubkey)) return 0;

		const history = this.requestHistory.get(userPubkey) || [];
		const now = Date.now();
		const windowStart = now - this.config.windowMs;
		const recentRequests = history.filter((record) => record.timestamp >= windowStart);

		return Math.max(0, this.config.maxRequestsPerWindow - recentRequests.length);
	}

	/**
	 * Get reset time for user's rate limit
	 */
	getResetTime(userPubkey: string): number | null {
		if (this.isBlocked(userPubkey)) {
			return this.blockedUsers.get(userPubkey) || null;
		}

		const history = this.requestHistory.get(userPubkey) || [];
		if (history.length === 0) return null;

		const now = Date.now();
		const windowStart = now - this.config.windowMs;
		const recentRequests = history.filter((record) => record.timestamp >= windowStart);

		if (recentRequests.length === 0) return null;

		const oldestRequest = recentRequests[0];
		return oldestRequest.timestamp + this.config.windowMs;
	}

	/**
	 * Clear rate limit history for a user (useful for testing or manual reset)
	 */
	clearUserHistory(userPubkey: string): void {
		this.requestHistory.delete(userPubkey);
		this.blockedUsers.delete(userPubkey);
	}

	/**
	 * Clear all rate limit history (useful for testing)
	 */
	clearAll(): void {
		this.requestHistory.clear();
		this.blockedUsers.clear();
	}

	/**
	 * Get statistics for a user
	 */
	getUserStats(userPubkey: string): {
		requestCount: number;
		remainingRequests: number;
		isBlocked: boolean;
		blockedUntil?: number;
		resetTime?: number;
	} {
		const history = this.requestHistory.get(userPubkey) || [];
		const now = Date.now();
		const windowStart = now - this.config.windowMs;
		const recentRequests = history.filter((record) => record.timestamp >= windowStart);

		return {
			requestCount: recentRequests.length,
			remainingRequests: this.getRemainingRequests(userPubkey),
			isBlocked: this.isBlocked(userPubkey),
			blockedUntil: this.blockedUsers.get(userPubkey),
			resetTime: this.getResetTime(userPubkey) || undefined
		};
	}
}

// Global rate limiter instance
export const schedulingRateLimiter = new SchedulingRateLimiter();

/**
 * Check rate limit before sending a scheduling request
 */
export function checkSchedulingRateLimit(
	userPubkey: string,
	requestId: string
): RateLimitResult {
	return schedulingRateLimiter.checkRateLimit(userPubkey, requestId);
}

/**
 * Check if user is blocked from sending scheduling requests
 */
export function isUserBlocked(userPubkey: string): boolean {
	return schedulingRateLimiter.isBlocked(userPubkey);
}


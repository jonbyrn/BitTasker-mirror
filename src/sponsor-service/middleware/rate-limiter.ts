/**
 * Rate Limiter Middleware
 * Implements token bucket rate limiting per sender and IP address
 */

import { query } from '../db/connection.js';

export interface RateLimitConfig {
  perSenderLimit: number; // requests per window
  perSenderWindow: number; // milliseconds
  perIpLimit: number; // requests per window
  perIpWindow: number; // milliseconds
}

const DEFAULT_CONFIG: RateLimitConfig = {
  perSenderLimit: 10,
  perSenderWindow: 60 * 1000, // 1 minute
  perIpLimit: 50,
  perIpWindow: 60 * 1000 // 1 minute
};

export async function checkRateLimit(
  config: RateLimitConfig = DEFAULT_CONFIG,
  senderAddress?: string,
  ipAddress?: string
): Promise<{ allowed: boolean; resetAt?: number; retryAfter?: number }> {
  const now = new Date();

  // Check sender rate limit
  if (senderAddress) {
    const key = `sender:${senderAddress}`;
    const senderResult = await checkKeyRateLimit(
      key,
      config.perSenderLimit,
      config.perSenderWindow,
      now
    );
    if (!senderResult.allowed) {
      return senderResult;
    }
  }

  // Check IP rate limit
  if (ipAddress) {
    const key = `ip:${ipAddress}`;
    const ipResult = await checkKeyRateLimit(
      key,
      config.perIpLimit,
      config.perIpWindow,
      now
    );
    if (!ipResult.allowed) {
      return ipResult;
    }
  }

  return { allowed: true };
}

async function checkKeyRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now: Date
): Promise<{ allowed: boolean; resetAt?: number; retryAfter?: number }> {
  try {
    // Try to get existing record
    const result = await query(
      'SELECT * FROM rate_limits WHERE key = $1',
      [key]
    );

    let record = result.rows[0];
    const windowEnd = new Date(record?.window_end);

    if (record && windowEnd > now) {
      // Window still active, check count
      if (record.request_count >= limit) {
        const resetAt = Math.floor(windowEnd.getTime() / 1000);
        const retryAfter = Math.ceil((windowEnd.getTime() - now.getTime()) / 1000);
        return { allowed: false, resetAt, retryAfter };
      }

      // Increment count
      await query(
        'UPDATE rate_limits SET request_count = request_count + 1 WHERE key = $1',
        [key]
      );
      return { allowed: true };
    } else {
      // Create new window
      const newWindowEnd = new Date(now.getTime() + windowMs);
      await query(
        `INSERT INTO rate_limits (key, request_count, window_start, window_end)
        VALUES ($1, 1, $2, $3)
        ON CONFLICT (key) DO UPDATE SET
          request_count = 1,
          window_start = $2,
          window_end = $3`,
        [key, now, newWindowEnd]
      );
      return { allowed: true };
    }
  } catch (error) {
    console.error('Rate limit check error:', error);
    // Allow request on error to prevent cascading failures
    return { allowed: true };
  }
}

export async function cleanupExpiredRateLimits(): Promise<number> {
  const result = await query(
    'DELETE FROM rate_limits WHERE window_end < NOW()'
  );
  return result.rowCount || 0;
}

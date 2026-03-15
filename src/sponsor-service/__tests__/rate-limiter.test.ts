/**
 * Rate Limiter Tests
 * Unit tests for rate limiting functionality
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { checkRateLimit, cleanupExpiredRateLimits } from '../middleware/rate-limiter.js';

// Mock database
vi.mock('../db/connection.js', () => ({
  query: vi.fn()
}));

describe('Rate Limiter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('checkRateLimit', () => {
    it('should allow requests within limit', async () => {
      const result = await checkRateLimit(
        {
          perSenderLimit: 10,
          perSenderWindow: 60000,
          perIpLimit: 50,
          perIpWindow: 60000
        },
        undefined,
        '192.168.1.1'
      );

      expect(result.allowed).toBe(true);
    });

    it('should reject requests when limit exceeded', async () => {
      const { query } = await import('../db/connection.js');

      // Mock first call returning existing record at limit
      vi.mocked(query).mockResolvedValueOnce({
        rows: [
          {
            key: 'ip:192.168.1.1',
            request_count: 50,
            window_end: new Date(Date.now() + 30000)
          }
        ],
        rowCount: 1
      } as any);

      const result = await checkRateLimit(
        {
          perSenderLimit: 10,
          perSenderWindow: 60000,
          perIpLimit: 50,
          perIpWindow: 60000
        },
        undefined,
        '192.168.1.1'
      );

      expect(result.allowed).toBe(false);
      expect(result.retryAfter).toBeDefined();
    });

    it('should handle sender-based rate limiting', async () => {
      const { query } = await import('../db/connection.js');

      vi.mocked(query).mockResolvedValueOnce({
        rows: [],
        rowCount: 0
      } as any);

      vi.mocked(query).mockResolvedValueOnce({
        rows: [],
        rowCount: 0
      } as any);

      const result = await checkRateLimit(
        {
          perSenderLimit: 10,
          perSenderWindow: 60000,
          perIpLimit: 50,
          perIpWindow: 60000
        },
        '0x1234567890123456789012345678901234567890',
        undefined
      );

      expect(result.allowed).toBe(true);
    });

    it('should track separate limits for sender and IP', async () => {
      const { query } = await import('../db/connection.js');

      // Mock two separate queries
      vi.mocked(query).mockResolvedValueOnce({
        rows: [],
        rowCount: 0
      } as any);

      vi.mocked(query).mockResolvedValueOnce({
        rows: [],
        rowCount: 0
      } as any);

      vi.mocked(query).mockResolvedValueOnce({
        rows: [],
        rowCount: 0
      } as any);

      vi.mocked(query).mockResolvedValueOnce({
        rows: [],
        rowCount: 0
      } as any);

      const result = await checkRateLimit(
        {
          perSenderLimit: 5,
          perSenderWindow: 60000,
          perIpLimit: 10,
          perIpWindow: 60000
        },
        '0xSender',
        '192.168.1.1'
      );

      expect(result.allowed).toBe(true);
    });
  });

  describe('cleanupExpiredRateLimits', () => {
    it('should delete expired rate limit records', async () => {
      const { query } = await import('../db/connection.js');

      vi.mocked(query).mockResolvedValueOnce({
        rows: [],
        rowCount: 5
      } as any);

      const deleted = await cleanupExpiredRateLimits();

      expect(deleted).toBe(5);
    });

    it('should handle cleanup errors gracefully', async () => {
      const { query } = await import('../db/connection.js');

      vi.mocked(query).mockRejectedValueOnce(new Error('Database error'));

      // Should not throw
      const deleted = await cleanupExpiredRateLimits();
      expect(deleted).toBe(0);
    });
  });
});

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

import { query } from '../db/connection.js';

const mockQuery = vi.mocked(query);

describe('Rate Limiter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('checkRateLimit', () => {
    it('should allow requests when database is healthy and under limit', async () => {
      // First call - no existing record
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0
      } as any);

      // Second call - insert new record
      mockQuery.mockResolvedValueOnce({
        rows: [],
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

      expect(result.allowed).toBe(true);
    });

    it('should reject requests when limit exceeded', async () => {
      // Mock returning existing record at limit
      mockQuery.mockResolvedValueOnce({
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
      // Sender check - no record
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0
      } as any);

      // Insert new record
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 1
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
  });

  describe('cleanupExpiredRateLimits', () => {
    it('should delete expired rate limit records', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 5
      } as any);

      const deleted = await cleanupExpiredRateLimits();

      expect(deleted).toBe(5);
    });

    it('should handle cleanup errors gracefully', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Database error'));

      // Should not throw, returns 0
      const deleted = await cleanupExpiredRateLimits();
      expect(deleted).toBe(0);
    });
  });

  describe('Fail-closed behavior', () => {
    it('should deny requests when database errors occur', async () => {
      // Mock database error on first call
      mockQuery.mockRejectedValueOnce(new Error('Database connection failed'));

      const result = await checkRateLimit(
        {
          perSenderLimit: 10,
          perSenderWindow: 60000,
          perIpLimit: 50,
          perIpWindow: 60000
        },
        '0x1234567890123456789012345678901234567890',
        '192.168.1.1'
      );

      // Should fail closed for security - deny when DB is down
      expect(result.allowed).toBe(false);
      expect(result.retryAfter).toBe(60);
    });

    it('should deny IP requests when database errors occur', async () => {
      // First call (sender) succeeds
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0
      } as any);

      // Second call (IP) fails
      mockQuery.mockRejectedValueOnce(new Error('Database connection failed'));

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
      expect(result.retryAfter).toBe(60);
    });
  });
});

/**
 * Sponsor Service API Integration Tests
 * Tests the complete request/response cycle
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import type { Application } from 'express';
import { createApp, type SponsorServiceConfig } from '../index.js';

// Mock database and blockchain services
vi.mock('../db/connection.js', () => ({
  initializePool: vi.fn(),
  getPool: vi.fn(() => ({ query: vi.fn() })),
  closePool: vi.fn(),
  query: vi.fn()
}));

vi.mock('../services/blockchain.service.js');
vi.mock('../db/submissions.repository.js');
vi.mock('../db/treasury-events.repository.js');

describe('Sponsor Service API', () => {
  let app: Application;
  const mockConfig: SponsorServiceConfig = {
    port: 3001,
    host: '0.0.0.0',
    database: {
      user: 'test',
      password: 'test',
      host: 'localhost',
      port: 5432,
      database: 'test_sponsor',
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000
    },
    logRequests: false
  };

  beforeAll(async () => {
    app = await createApp(mockConfig);
  });

  afterAll(async () => {
    // Cleanup
  });

  describe('Health Check', () => {
    it('should return 200 for /health', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ok');
      expect(response.body.version).toBeDefined();
    });
  });

  describe('Submit Send Endpoint', () => {
    const validPayload = {
      correlationId: 'test-123',
      signedRawTransaction: '0xf86f0182',
      signedRawTransactionHash: '0xabcdef',
      chainId: 56,
      requestExpiry: Math.floor(Date.now() / 1000) + 3600,
      expectedTargetContract: '0x' + 'a'.repeat(40),
      expectedMethodSelector: '0x12345678',
      expectedTokenAddress: '0x55d398326f99059fF775485246999027B3197955'
    };

    it('should reject invalid chain ID', async () => {
      const response = await request(app)
        .post('/v1/usdt-bsc/submit-send')
        .send({
          ...validPayload,
          chainId: 999
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('chainId');
    });

    it('should reject missing correlationId', async () => {
      const { correlationId, ...payload } = validPayload;
      const response = await request(app)
        .post('/v1/usdt-bsc/submit-send')
        .send(payload);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('correlationId');
    });

    it('should reject expired requestExpiry', async () => {
      const response = await request(app)
        .post('/v1/usdt-bsc/submit-send')
        .send({
          ...validPayload,
          requestExpiry: Math.floor(Date.now() / 1000) - 100
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('requestExpiry');
    });

    it('should reject missing signedRawTransaction', async () => {
      const { signedRawTransaction, ...payload } = validPayload;
      const response = await request(app)
        .post('/v1/usdt-bsc/submit-send')
        .send(payload);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('signedRawTransaction');
    });

    it('should accept valid request', async () => {
      // Mock successful submission
      const { createSubmission } = await import('../db/submissions.repository.js');
      vi.mocked(createSubmission).mockResolvedValueOnce({
        id: 'sub-123',
        correlationId: validPayload.correlationId,
        signedRawTransactionHash: validPayload.signedRawTransactionHash,
        chainId: 56,
        status: 'accepted',
        lifecycleState: 'submitted',
        txHash: '0xtxhash',
        requestExpiry: validPayload.requestExpiry,
        createdAt: new Date(),
        updatedAt: new Date(),
        retryCount: 0
      } as any);

      const { blockchainService } = await import('../services/blockchain.service.js');
      vi.mocked(blockchainService.getTokenBalance).mockResolvedValueOnce('1000000000');
      vi.mocked(blockchainService.submitSignedTransaction).mockResolvedValueOnce('0xtxhash');

      const response = await request(app)
        .post('/v1/usdt-bsc/submit-send')
        .send(validPayload);

      expect(response.status).toBe(202);
      expect(response.body.status).toBe('accepted');
      expect(response.body.submissionId).toBeDefined();
      expect(response.body.txHash).toBeDefined();
    });
  });

  describe('Status Endpoint', () => {
    it('should return 404 for non-existent submission', async () => {
      const { getSubmissionByCorrelationId } = await import(
        '../db/submissions.repository.js'
      );
      vi.mocked(getSubmissionByCorrelationId).mockResolvedValueOnce(null);

      const response = await request(app).get('/v1/usdt-bsc/status/non-existent');

      expect(response.status).toBe(404);
    });

    it('should return status for existing submission', async () => {
      const { getSubmissionByCorrelationId } = await import(
        '../db/submissions.repository.js'
      );
      vi.mocked(getSubmissionByCorrelationId).mockResolvedValueOnce({
        id: 'sub-123',
        correlationId: 'corr-123',
        status: 'accepted',
        lifecycleState: 'confirmed',
        txHash: '0xtxhash',
        signedRawTransactionHash: '0xhash',
        chainId: 56,
        requestExpiry: 9999999999,
        createdAt: new Date(),
        updatedAt: new Date(),
        retryCount: 0
      } as any);

      const response = await request(app).get('/v1/usdt-bsc/status/corr-123');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('accepted');
      expect(response.body.correlationId).toBe('corr-123');
      expect(response.body.lifecycleState).toBe('confirmed');
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce rate limits', async () => {
      const payload = {
        correlationId: 'test-rate-limit-' + Date.now(),
        signedRawTransaction: '0xf86f0182',
        signedRawTransactionHash: '0xabcdef',
        chainId: 56,
        requestExpiry: Math.floor(Date.now() / 1000) + 3600,
        expectedTargetContract: '0x' + 'a'.repeat(40),
        expectedMethodSelector: '0x12345678',
        expectedTokenAddress: '0x55d398326f99059fF775485246999027B3197955'
      };

      // Simulate rate limit exceeded
      const { checkRateLimit } = await import('../middleware/rate-limiter.js');
      vi.mocked(checkRateLimit).mockResolvedValueOnce({
        allowed: false,
        retryAfter: 30
      });

      const response = await request(app)
        .post('/v1/usdt-bsc/submit-send')
        .send(payload);

      expect(response.status).toBe(429);
      expect(response.body.error).toContain('Rate limit exceeded');
    });
  });

  describe('Error Handling', () => {
    it('should return 404 for undefined route', async () => {
      const response = await request(app).get('/undefined-route');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Not found');
    });

    it('should handle JSON parsing errors', async () => {
      const response = await request(app)
        .post('/v1/usdt-bsc/submit-send')
        .set('Content-Type', 'application/json')
        .send('invalid json');

      expect(response.status).toBe(400);
    });
  });
});

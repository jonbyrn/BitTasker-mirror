/**
 * Express Routes for Sponsor Service API
 * Handles POST /v1/usdt-bsc/submit-send and GET /v1/usdt-bsc/status endpoints
 */

import express, { Router, Request, Response, NextFunction } from 'express';
import type { BscDirectSendRequest, SubmissionResponse } from '../models/types.js';
import * as submitSendService from '../services/submit-send.service.js';
import { checkRateLimit } from '../middleware/rate-limiter.js';
import { blockchainService } from '../services/blockchain.service.js';
import { getNetworkConfig, isValidChainId } from '../config/networks.js';

const router = Router();

// Request validation middleware
async function validateSubmitSendRequest(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const { user, recipient, amount, nonce, deadline, signature, chainId, correlationId } =
    req.body;

  // Validate required fields
  if (!user || typeof user !== 'string' || !user.startsWith('0x') || user.length !== 42) {
    res.status(400).json({ error: 'user address is required and must be a valid 42-character address' });
    return;
  }

  if (!recipient || typeof recipient !== 'string' || !recipient.startsWith('0x') || recipient.length !== 42) {
    res.status(400).json({ error: 'recipient address is required' });
    return;
  }

  if (!amount || typeof amount !== 'string' || !/^\d+$/.test(amount)) {
    res.status(400).json({ error: 'amount is required and must be a numeric string' });
    return;
  }

  // Validate amount upper bound (max $1M USDT)
  const MAX_AMOUNT = BigInt("1000000000000"); // 1M USDT in atomic units (6 decimals)
  if (BigInt(amount) > MAX_AMOUNT) {
    res.status(400).json({ error: 'amount exceeds maximum allowed ($1M USDT)' });
    return;
  }

  if (typeof nonce !== 'number' || nonce < 0) {
    res.status(400).json({ error: 'nonce is required and must be a non-negative number' });
    return;
  }

  if (typeof deadline !== 'number' || deadline <= 0) {
    res.status(400).json({ error: 'deadline is required and must be a valid Unix timestamp' });
    return;
  }

  // Enforce max deadline of 30 minutes to prevent unusual long-lived signatures
  const MAX_DEADLINE_SECONDS = 30 * 60; // 30 minutes
  const now = Math.floor(Date.now() / 1000);
  if (deadline > now + MAX_DEADLINE_SECONDS) {
    res.status(400).json({ error: 'deadline must be within 30 minutes' });
    return;
  }

  if (!signature || typeof signature !== 'string' || !signature.startsWith('0x')) {
    res.status(400).json({ error: 'signature is required' });
    return;
  }

  if (!Number.isInteger(chainId) || (chainId !== 56 && chainId !== 97)) {
    res.status(400).json({ error: 'chainId must be 56 (mainnet) or 97 (testnet)' });
    return;
  }

  if (!correlationId || typeof correlationId !== 'string') {
    res.status(400).json({ error: 'correlationId is required and must be a string' });
    return;
  }

  next();
}

// Rate limiting middleware
async function rateLimitMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const ipAddress = (req.ip || '').split(':').pop();

  const result = await checkRateLimit(
    {
      perSenderLimit: 10,
      perSenderWindow: 60 * 1000,
      perIpLimit: 50,
      perIpWindow: 60 * 1000
    },
    undefined,
    ipAddress
  );

  if (!result.allowed) {
    res.status(429).json({
      error: 'Rate limit exceeded',
      retryAfter: result.retryAfter
    });
    return;
  }

  next();
}

/**
 * POST /v1/usdt-bsc/submit-send
 * Submit a signed direct-send transaction for sponsorship
 */
router.post(
  '/v1/usdt-bsc/submit-send',
  rateLimitMiddleware,
  validateSubmitSendRequest,
  async (req: Request, res: Response) => {
    try {
      const request: BscDirectSendRequest = {
        correlationId: req.body.correlationId,
        user: req.body.user,
        recipient: req.body.recipient,
        amount: req.body.amount,
        nonce: req.body.nonce,
        deadline: req.body.deadline,
        signature: req.body.signature,
        chainId: req.body.chainId,
        expectedTargetContract: req.body.expectedTargetContract,
        expectedTokenAddress: req.body.expectedTokenAddress
      };

      const response = await submitSendService.submitDirectSend(request);

      // HTTP status code based on response
      const statusCode = response.status === 'accepted' ? 202 : 400;
      res.status(statusCode).json(response);
    } catch (error) {
      console.error('Error in submit-send endpoint:', error);
      res.status(500).json({
        status: 'rejected',
        correlationId: req.body.correlationId,
        error: 'Internal server error'
      });
    }
  }
);

/**
 * GET /v1/usdt-bsc/status/:correlationId
 * Get submission status
 */
router.get('/v1/usdt-bsc/status/:correlationId', async (req: Request, res: Response) => {
  try {
    const { correlationId } = req.params;

    if (!correlationId || typeof correlationId !== 'string') {
      res.status(400).json({ error: 'correlationId is required' });
      return;
    }

    const response = await submitSendService.getSubmissionStatus(correlationId);

    if (!response) {
      res.status(404).json({ error: 'Submission not found' });
      return;
    }

    res.status(200).json(response);
  } catch (error) {
    console.error('Error in status endpoint:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /health
 * Health check endpoint
 */
/**
 * GET /health
 * Health check endpoint with comprehensive status
 */
router.get('/health', async (req: Request, res: Response) => {
  const checks: Record<string, { status: string; message?: string; latency?: number }> = {};
  let overallStatus = 'ok';

  // Check 1: Database connectivity
  try {
    const startDb = Date.now();
    const { query } = await import('../db/connection.js');
    await query('SELECT 1');
    checks.database = { status: 'ok', latency: Date.now() - startDb };
  } catch (error) {
    checks.database = { status: 'error', message: String(error) };
    overallStatus = 'degraded';
  }

  // Check 2: RPC connectivity (BSC mainnet)
  try {
    const startRpc = Date.now();
    const config = getNetworkConfig(56);
    if (config) {
      await blockchainService.getBalance(56, config.sponsorAddress);
      checks.rpc = { status: 'ok', latency: Date.now() - startRpc };
    } else {
      checks.rpc = { status: 'skipped', message: 'No mainnet config' };
    }
  } catch (error) {
    checks.rpc = { status: 'error', message: String(error) };
    overallStatus = 'degraded';
  }

  // Check 3: Sponsor balance (BSC mainnet) - only show boolean for security
  try {
    const config = getNetworkConfig(56);
    if (config) {
      const balance = await blockchainService.getBalance(56, config.sponsorAddress);
      const balanceBn = BigInt(balance);
      const minBalance = BigInt("5000000000000000"); // 0.005 BNB minimum
      const hasSufficientBalance = balanceBn >= minBalance;

      if (hasSufficientBalance) {
        checks.sponsor = { status: 'ok', available: true };
      } else {
        checks.sponsor = { status: 'warning', available: false };
        overallStatus = overallStatus === 'ok' ? 'degraded' : overallStatus;
      }
    } else {
      checks.sponsor = { status: 'skipped', available: false };
    }
  } catch (error) {
    checks.sponsor = { status: 'error', message: String(error) };
    overallStatus = 'degraded';
  }

  const statusCode = overallStatus === 'ok' ? 200 : 503;
  res.status(statusCode).json({
    status: overallStatus,
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    checks
  });
});

/**
 * GET /stats
 * Submission statistics for monitoring dashboards
 * Returns counts by status - useful for uptime monitors
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const { query } = await import('../db/connection.js');

    // Get submission counts by status
    const statusResult = await query(`
      SELECT status, lifecycle_state, COUNT(*) as count
      FROM submissions
      WHERE created_at > NOW() - INTERVAL '24 hours'
      GROUP BY status, lifecycle_state
    `);

    // Get recent failure rate
    const failureResult = await query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'accepted') as accepted,
        COUNT(*) FILTER (WHERE status = 'rejected') as rejected
      FROM submissions
      WHERE created_at > NOW() - INTERVAL '1 hour'
    `);

    const stats = {
      last24Hours: statusResult.rows.reduce((acc: Record<string, number>, row: any) => {
        const key = `${row.status}_${row.lifecycle_state}`;
        acc[key] = parseInt(row.count);
        return acc;
      }, {}),
      last1Hour: {
        accepted: parseInt(failureResult.rows[0]?.accepted || 0),
        rejected: parseInt(failureResult.rows[0]?.rejected || 0)
      },
      timestamp: new Date().toISOString()
    };

    res.status(200).json(stats);
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({ error: 'Failed to retrieve stats' });
  }
});

/**
 * GET /ready
 * Readiness check endpoint (for Kubernetes)
 */
router.get('/ready', async (req: Request, res: Response) => {
  try {
    // Check if database is accessible
    const { query } = await import('../db/connection.js');
    await query('SELECT 1');

    res.status(200).json({
      status: 'ready',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Readiness check failed:', error);
    res.status(503).json({
      status: 'not_ready',
      error: 'Database connection failed'
    });
  }
});

export default router;

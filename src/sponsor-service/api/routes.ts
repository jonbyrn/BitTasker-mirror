/**
 * Express Routes for Sponsor Service API
 * Handles POST /v1/usdt-bsc/submit-send and GET /v1/usdt-bsc/status endpoints
 */

import express, { Router, Request, Response, NextFunction } from 'express';
import type { BscDirectSendRequest, SubmissionResponse } from '../models/types.js';
import * as submitSendService from '../services/submit-send.service.js';
import { checkRateLimit } from '../middleware/rate-limiter.js';

const router = Router();

// Request validation middleware
async function validateSubmitSendRequest(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const { signedRawTransaction, signedRawTransactionHash, chainId, correlationId, requestExpiry } =
    req.body;

  // Validate required fields
  if (!signedRawTransaction || typeof signedRawTransaction !== 'string') {
    res.status(400).json({ error: 'signedRawTransaction is required and must be a string' });
    return;
  }

  if (!signedRawTransactionHash || typeof signedRawTransactionHash !== 'string') {
    res.status(400).json({ error: 'signedRawTransactionHash is required and must be a string' });
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

  if (!Number.isInteger(requestExpiry) || requestExpiry <= 0) {
    res.status(400).json({ error: 'requestExpiry is required and must be a valid Unix timestamp' });
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
        signedRawTransaction: req.body.signedRawTransaction,
        signedRawTransactionHash: req.body.signedRawTransactionHash,
        chainId: req.body.chainId,
        requestExpiry: req.body.requestExpiry,
        expectedTargetContract: req.body.expectedTargetContract || '',
        expectedMethodSelector: req.body.expectedMethodSelector || '',
        expectedTokenAddress: req.body.expectedTokenAddress || ''
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
router.get('/health', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
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

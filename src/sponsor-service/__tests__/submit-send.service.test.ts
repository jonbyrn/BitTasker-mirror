/**
 * Submit Send Service Tests
 * Unit tests for the sponsor service business logic
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as submitSendService from '../services/submit-send.service.js';
import * as submissionsRepo from '../db/submissions.repository.js';
import * as treasuryRepo from '../db/treasury-events.repository.js';
import { blockchainService } from '../services/blockchain.service.js';
import type { BscDirectSendRequest } from '../models/types.js';

// Mock dependencies
vi.mock('../db/submissions.repository.js');
vi.mock('../db/treasury-events.repository.js');
vi.mock('../services/blockchain.service.js');
vi.mock('../utils/signature-verification.js', () => ({
  verifySignedTransactionHash: vi.fn(() => true),
  validateTransactionStructure: vi.fn(() => true)
}));

describe('submitSendService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('submitDirectSend', () => {
    const validRequest: BscDirectSendRequest = {
      correlationId: 'test-123',
      signedRawTransaction: '0xf86f01821234567890abcdef',
      signedRawTransactionHash: '0xabcdef1234567890',
      chainId: 56,
      requestExpiry: Math.floor(Date.now() / 1000) + 3600,
      expectedTargetContract: '0x1234567890abcdef1234567890abcdef12345678',
      expectedMethodSelector: '0x12345678',
      expectedTokenAddress: '0x55d398326f99059fF775485246999027B3197955'
    };

    it('should reject request with invalid chain ID', async () => {
      const request = { ...validRequest, chainId: 999 };
      const response = await submitSendService.submitDirectSend(request);

      expect(response.status).toBe('rejected');
      expect(response.failureCode).toBe('WRONG_CHAIN');
    });

    it('should reject expired request', async () => {
      const request = { ...validRequest, requestExpiry: Math.floor(Date.now() / 1000) - 100 };
      const response = await submitSendService.submitDirectSend(request);

      expect(response.status).toBe('rejected');
      expect(response.failureCode).toBe('REQUEST_EXPIRED');
    });

    it('should detect duplicate requests (already accepted)', async () => {
      const existingRecord = {
        id: 'existing-id',
        status: 'accepted',
        correlationId: validRequest.correlationId,
        txHash: '0xtxhash',
        lifecycleState: 'submitted'
      };

      vi.mocked(submissionsRepo.getSubmissionBySignedHash).mockResolvedValueOnce(existingRecord as any);

      const response = await submitSendService.submitDirectSend(validRequest);

      expect(response.status).toBe('accepted');
      expect(response.submissionId).toBe('existing-id');
      expect(response.txHash).toBe('0xtxhash');
    });

    it('should handle sponsor unavailability', async () => {
      vi.mocked(submissionsRepo.getSubmissionBySignedHash).mockResolvedValueOnce(null);
      vi.mocked(blockchainService.getTokenBalance).mockRejectedValueOnce(
        new Error('RPC error')
      );

      const response = await submitSendService.submitDirectSend(validRequest);

      expect(response.status).toBe('rejected');
      expect(response.failureCode).toBe('SPONSOR_UNAVAILABLE');
    });

    it('should handle blockchain submission failure', async () => {
      vi.mocked(submissionsRepo.getSubmissionBySignedHash).mockResolvedValueOnce(null);
      vi.mocked(blockchainService.getTokenBalance).mockResolvedValueOnce('1000000000');
      vi.mocked(blockchainService.submitSignedTransaction).mockRejectedValueOnce(
        new Error('Submission failed')
      );
      vi.mocked(submissionsRepo.createSubmission).mockResolvedValueOnce({
        id: 'failed-id'
      } as any);
      vi.mocked(treasuryRepo.createTreasuryEvent).mockResolvedValueOnce({} as any);

      const response = await submitSendService.submitDirectSend(validRequest);

      expect(response.status).toBe('rejected');
      expect(response.failureCode).toBe('SUBMISSION_FAILED');
    });

    it('should successfully submit valid request', async () => {
      const mockTxHash = '0x' + 'a'.repeat(64);
      const mockSubmissionId = 'sub-123';

      vi.mocked(submissionsRepo.getSubmissionBySignedHash).mockResolvedValueOnce(null);
      vi.mocked(blockchainService.getTokenBalance).mockResolvedValueOnce('1000000000');
      vi.mocked(blockchainService.submitSignedTransaction).mockResolvedValueOnce(mockTxHash);
      vi.mocked(submissionsRepo.createSubmission).mockResolvedValueOnce({
        id: mockSubmissionId
      } as any);
      vi.mocked(treasuryRepo.createTreasuryEvent).mockResolvedValueOnce({} as any);

      const response = await submitSendService.submitDirectSend(validRequest);

      expect(response.status).toBe('accepted');
      expect(response.submissionId).toBe(mockSubmissionId);
      expect(response.txHash).toBe(mockTxHash);
      expect(response.lifecycleState).toBe('submitted');
    });
  });

  describe('getSubmissionStatus', () => {
    it('should return null for non-existent submission', async () => {
      vi.mocked(submissionsRepo.getSubmissionByCorrelationId).mockResolvedValueOnce(null);

      const response = await submitSendService.getSubmissionStatus('missing-id');

      expect(response).toBeNull();
    });

    it('should return status for existing submission', async () => {
      const submission = {
        id: 'sub-123',
        correlationId: 'corr-123',
        status: 'accepted',
        lifecycleState: 'confirmed',
        txHash: '0xtxhash'
      };

      vi.mocked(submissionsRepo.getSubmissionByCorrelationId).mockResolvedValueOnce(
        submission as any
      );

      const response = await submitSendService.getSubmissionStatus('corr-123');

      expect(response).toBeDefined();
      expect(response?.status).toBe('accepted');
      expect(response?.lifecycleState).toBe('confirmed');
    });
  });

  describe('pollConfirmation', () => {
    it('should return null for non-existent submission', async () => {
      vi.mocked(submissionsRepo.getSubmissionById).mockResolvedValueOnce(null);

      const result = await submitSendService.pollConfirmation('missing-id');

      expect(result).toBeNull();
    });

    it('should skip polling for already confirmed submission', async () => {
      const submission = {
        id: 'sub-123',
        lifecycleState: 'confirmed',
        chainId: 56
      };

      vi.mocked(submissionsRepo.getSubmissionById).mockResolvedValueOnce(submission as any);

      const result = await submitSendService.pollConfirmation('sub-123');

      expect(result?.lifecycleState).toBe('confirmed');
    });

    it('should mark confirmed transaction on successful poll', async () => {
      const submission = {
        id: 'sub-123',
        lifecycleState: 'submitted',
        chainId: 56,
        txHash: '0xtxhash'
      };

      vi.mocked(submissionsRepo.getSubmissionById).mockResolvedValueOnce(submission as any);
      vi.mocked(blockchainService.getTransactionReceipt).mockResolvedValueOnce({
        transactionHash: '0xtxhash',
        status: 1,
        blockNumber: 123,
        gasUsed: '21000',
        confirmations: 5
      });
      vi.mocked(submissionsRepo.updateSubmission).mockResolvedValueOnce({
        ...submission,
        lifecycleState: 'confirmed'
      } as any);
      vi.mocked(treasuryRepo.createTreasuryEvent).mockResolvedValueOnce({} as any);

      const result = await submitSendService.pollConfirmation('sub-123');

      expect(result?.lifecycleState).toBe('confirmed');
      expect(treasuryRepo.createTreasuryEvent).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'confirmation' })
      );
    });

    it('should mark failed transaction on unsuccessful poll', async () => {
      const submission = {
        id: 'sub-123',
        lifecycleState: 'submitted',
        chainId: 56,
        txHash: '0xtxhash'
      };

      vi.mocked(submissionsRepo.getSubmissionById).mockResolvedValueOnce(submission as any);
      vi.mocked(blockchainService.getTransactionReceipt).mockResolvedValueOnce({
        transactionHash: '0xtxhash',
        status: 0,
        blockNumber: 123,
        gasUsed: '21000',
        confirmations: 5
      });
      vi.mocked(submissionsRepo.updateSubmission).mockResolvedValueOnce({
        ...submission,
        lifecycleState: 'chain_failed'
      } as any);
      vi.mocked(treasuryRepo.createTreasuryEvent).mockResolvedValueOnce({} as any);

      const result = await submitSendService.pollConfirmation('sub-123');

      expect(result?.lifecycleState).toBe('chain_failed');
    });
  });

  describe('cleanupExpiredSubmissions', () => {
    it('should mark expired submissions as expired', async () => {
      const expiredSubmissions = [
        { id: 'exp-1', correlationId: 'corr-1' },
        { id: 'exp-2', correlationId: 'corr-2' }
      ];

      vi.mocked(submissionsRepo.getExpiredSubmissions).mockResolvedValueOnce(
        expiredSubmissions as any
      );
      vi.mocked(submissionsRepo.markAsExpired).mockResolvedValue({} as any);
      vi.mocked(treasuryRepo.createTreasuryEvent).mockResolvedValue({} as any);

      const count = await submitSendService.cleanupExpiredSubmissions();

      expect(count).toBe(2);
      expect(submissionsRepo.markAsExpired).toHaveBeenCalledTimes(2);
    });
  });
});

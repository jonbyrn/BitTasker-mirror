/**
 * Repository Tests
 * Unit tests for database repository layer
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as submissionsRepo from '../db/submissions.repository.js';
import * as treasuryRepo from '../db/treasury-events.repository.js';

// Mock the database connection
vi.mock('../db/connection.js', () => ({
  query: vi.fn()
}));

import { query } from '../db/connection.js';

const mockQuery = vi.mocked(query);

describe('Submissions Repository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createSubmission', () => {
    it('should create submission and return record with expected fields', async () => {
      // Use snake_case to match database column names
      const mockSubmission = {
        id: 'sub-123',
        correlation_id: 'corr-123',
        signed_raw_transaction_hash: '0xabc',
        chain_id: 56,
        status: 'accepted',
        lifecycle_state: 'submitted',
        failure_code: null,
        request_expiry: 1234567890,
        tx_hash: '0xdef',
        sender_address: null,
        recipient_address: null,
        amount_atomic: null,
        fixed_fee_atomic: null,
        created_at: new Date(),
        updated_at: new Date(),
        retry_count: 0,
        last_retry_at: null,
        confirmation_checked_at: null
      };

      mockQuery.mockResolvedValueOnce({
        rows: [mockSubmission],
        rowCount: 1
      } as any);

      const result = await submissionsRepo.createSubmission({
        correlationId: 'corr-123',
        signedRawTransactionHash: '0xabc',
        chainId: 56,
        status: 'accepted',
        lifecycleState: 'submitted',
        requestExpiry: 1234567890,
        txHash: '0xdef'
      });

      // Check key fields are present (DB may add more)
      expect(result.id).toBe('sub-123');
      expect(result.correlationId).toBe('corr-123');
      expect(result.status).toBe('accepted');
    });

    it('should throw on database error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB error'));

      await expect(
        submissionsRepo.createSubmission({
          correlationId: 'corr-123',
          signedRawTransactionHash: '0xabc',
          chainId: 56,
          status: 'accepted',
          lifecycleState: 'submitted',
          requestExpiry: 1234567890
        })
      ).rejects.toThrow();
    });
  });

  describe('getSubmissionByCorrelationId', () => {
    it('should return submission when found', async () => {
      const mockSubmission = { id: 'sub-123', correlation_id: 'corr-123', chain_id: 56, status: 'accepted', lifecycle_state: 'submitted', request_expiry: 1234567890, created_at: new Date(), updated_at: new Date() };
      mockQuery.mockResolvedValueOnce({ rows: [mockSubmission] } as any);

      const result = await submissionsRepo.getSubmissionByCorrelationId('corr-123');
      expect(result?.id).toBe('sub-123');
      expect(result?.correlationId).toBe('corr-123');
    });

    it('should return null when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] } as any);

      const result = await submissionsRepo.getSubmissionByCorrelationId('not-found');
      expect(result).toBeNull();
    });
  });

  describe('getSubmissionBySignedHash', () => {
    it('should return submission when found', async () => {
      const mockSubmission = { id: 'sub-123', signed_raw_transaction_hash: '0xhash', chain_id: 56, status: 'accepted', lifecycle_state: 'submitted', request_expiry: 1234567890, created_at: new Date(), updated_at: new Date() };
      mockQuery.mockResolvedValueOnce({ rows: [mockSubmission] } as any);

      const result = await submissionsRepo.getSubmissionBySignedHash('0xhash');
      expect(result?.id).toBe('sub-123');
      expect(result?.signedRawTransactionHash).toBe('0xhash');
    });

    it('should return null when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] } as any);

      const result = await submissionsRepo.getSubmissionBySignedHash('0xnotfound');
      expect(result).toBeNull();
    });
  });

  describe('getSubmissionById', () => {
    it('should return submission when found', async () => {
      const mockSubmission = { id: 'sub-123', chain_id: 56, status: 'accepted', lifecycle_state: 'submitted', request_expiry: 1234567890, created_at: new Date(), updated_at: new Date() };
      mockQuery.mockResolvedValueOnce({ rows: [mockSubmission] } as any);

      const result = await submissionsRepo.getSubmissionById('sub-123');
      expect(result?.id).toBe('sub-123');
    });

    it('should return null when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] } as any);

      const result = await submissionsRepo.getSubmissionById('not-found');
      expect(result).toBeNull();
    });
  });

  describe('updateSubmission', () => {
    it('should update and return submission', async () => {
      // Must use snake_case to match database column names
      const mockUpdated = { id: 'sub-123', lifecycle_state: 'confirmed', chain_id: 56, status: 'accepted', request_expiry: 1234567890, created_at: new Date(), updated_at: new Date() };
      mockQuery.mockResolvedValueOnce({ rows: [mockUpdated] } as any);

      const result = await submissionsRepo.updateSubmission({
        id: 'sub-123',
        lifecycleState: 'confirmed' as any
      });

      expect(result?.id).toBe('sub-123');
      expect(result?.lifecycleState).toBe('confirmed');
    });
  });

  describe('getExpiredSubmissions', () => {
    it('should return expired submissions', async () => {
      const expired = [
        { id: 'exp-1', correlationId: 'corr-1' },
        { id: 'exp-2', correlationId: 'corr-2' }
      ];
      mockQuery.mockResolvedValueOnce({ rows: expired } as any);

      const result = await submissionsRepo.getExpiredSubmissions();
      expect(result.length).toBe(2);
      expect(result[0].id).toBe('exp-1');
      expect(result[1].id).toBe('exp-2');
    });
  });

  describe('markAsExpired', () => {
    it('should mark submission as expired', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'sub-123' }] } as any);

      await submissionsRepo.markAsExpired('sub-123');
      expect(mockQuery).toHaveBeenCalled();
    });
  });
});

describe('Treasury Events Repository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createTreasuryEvent', () => {
    it('should create treasury event', async () => {
      const mockEvent = {
        id: 'evt-123',
        submission_id: 'sub-123',
        event_type: 'submission',
        tx_hash: '0xtx',
        metadata: null,
        created_at: new Date()
      };

      mockQuery.mockResolvedValueOnce({
        rows: [mockEvent],
        rowCount: 1
      } as any);

      const result = await treasuryRepo.createTreasuryEvent({
        submissionId: 'sub-123',
        eventType: 'submission',
        txHash: '0xtx'
      });

      expect(result.id).toBe('evt-123');
      expect(result.submissionId).toBe('sub-123');
      expect(result.eventType).toBe('submission');
    });

    it('should include metadata when provided', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'evt-123' }],
        rowCount: 1
      } as any);

      await treasuryRepo.createTreasuryEvent({
        submissionId: 'sub-123',
        eventType: 'failure',
        metadata: { error: 'test error' }
      });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('metadata'),
        expect.arrayContaining([expect.anything()])
      );
    });
  });
});

/**
 * Submit Send Service
 * Core business logic for direct-send sponsorship
 */

import { ethers } from 'ethers';
import { getNetworkConfig, isValidChainId } from '../config/networks.js';
import { blockchainService } from './blockchain.service.js';
import * as submissionsRepo from '../db/submissions.repository.js';
import * as treasuryRepo from '../db/treasury-events.repository.js';
import { checkRateLimit } from '../middleware/rate-limiter.js';
import { verifyTransferSignature } from '../utils/signature-verification.js';
import type {
  BscDirectSendRequest,
  BscDirectSendFailureCode,
  SubmissionResponse,
  SubmissionRecord,
  SubmissionLifecycleState
} from '../models/types.js';

// REMOVED: skipSignatureVerification option - signature verification is now mandatory
// This was a critical security risk that could allow signature bypass

// Buffer to prevent TOCTOU on deadline (seconds)
const DEADLINE_BUFFER_SECONDS = 60;

// Minimum sponsor BNB balance threshold (in BNB)
const MIN_SPONSOR_BALANCE_BNB = '0.005';

/**
 * Submit a signed direct-send request (EIP-712 meta-transaction)
 */
export async function submitDirectSend(
  request: BscDirectSendRequest
): Promise<SubmissionResponse> {
  const correlationId = request.correlationId;
  const chainId = request.chainId;

  try {
    // Validate chain ID
    if (!isValidChainId(chainId)) {
      return {
        status: 'rejected',
        correlationId,
        failureCode: 'WRONG_CHAIN' as BscDirectSendFailureCode,
        errorMessage: `Unsupported chain ID: ${chainId}`
      };
    }

    const config = getNetworkConfig(chainId)!;

    // Rate limiting check - use user address from request
    // IP limiting would need to be handled at API layer (Express/CF Workers)
    const rateLimitCheck = await checkRateLimit(
      undefined, // Default config
      request.user, // Rate limit per user address
      undefined // IP limiting not available at service layer
    );
    if (!rateLimitCheck.allowed) {
      return {
        status: 'rejected',
        correlationId,
        failureCode: 'RATE_LIMITED' as BscDirectSendFailureCode,
        errorMessage: `Rate limit exceeded. Retry after ${rateLimitCheck.retryAfter} seconds`
      };
    }

    // Check if request is not expired (with buffer to prevent TOCTOU)
    const now = Math.floor(Date.now() / 1000);
    const bufferDeadline = now + DEADLINE_BUFFER_SECONDS;
    if (request.deadline < bufferDeadline) {
      return {
        status: 'rejected',
        correlationId,
        failureCode: 'REQUEST_EXPIRED' as BscDirectSendFailureCode,
        errorMessage: 'Request has expired or will expire soon'
      };
    }

    // Check for duplicate (idempotency by signature)
    const existingSubmission = await submissionsRepo.getSubmissionBySignedHash(
      request.signature
    );

    if (existingSubmission) {
      // Return success if already accepted, error if rejected
      if (existingSubmission.status === 'accepted') {
        return {
          status: 'accepted',
          correlationId,
          submissionId: existingSubmission.id,
          txHash: existingSubmission.txHash || undefined,
          lifecycleState: existingSubmission.lifecycleState
        };
      } else {
        return {
          status: 'rejected',
          correlationId,
          failureCode: 'DUPLICATE_REQUEST' as BscDirectSendFailureCode,
          errorMessage: 'This request was already submitted and rejected'
        };
      }
    }

    // Verify EIP-712 signature (ALWAYS required - skipSignatureVerification removed)
    const isValid = await verifyTransferSignature(
      chainId,
      config.routerAddress,
      request.user,
      request.recipient,
      request.amount,
      request.nonce,
      request.deadline,
      request.signature
    );

    if (!isValid) {
      return {
        status: 'rejected',
        correlationId,
        failureCode: 'POLICY_REJECTED' as BscDirectSendFailureCode,
        errorMessage: 'EIP-712 signature verification failed'
      };
    }

    // Check sponsor availability and balance (BNB for gas)
    try {
      const sponsorBalance = await blockchainService.getBalance(
        chainId,
        config.sponsorAddress
      );

      // Sponsor needs BNB for gas
      if (BigInt(sponsorBalance) < ethers.parseEther(MIN_SPONSOR_BALANCE_BNB)) {
        return {
          status: 'rejected',
          correlationId,
          failureCode: 'SPONSOR_UNAVAILABLE' as BscDirectSendFailureCode,
          errorMessage: 'Sponsor has insufficient BNB balance for gas'
        };
      }
    } catch (error) {
      console.error('Error checking sponsor balance:', error);
      return {
        status: 'rejected',
        correlationId,
        failureCode: 'SPONSOR_UNAVAILABLE' as BscDirectSendFailureCode,
        errorMessage: 'Unable to verify sponsor availability'
      };
    }

    // Submit meta-transaction to blockchain via router contract
    // Re-check deadline immediately before submission to prevent TOCTOU
    const nowBeforeSubmit = Math.floor(Date.now() / 1000);
    if (request.deadline < nowBeforeSubmit) {
      return {
        status: 'rejected',
        correlationId,
        failureCode: 'REQUEST_EXPIRED' as BscDirectSendFailureCode,
        errorMessage: 'Request expired before submission'
      };
    }

    let txHash: string;
    try {
      txHash = await blockchainService.submitMetaTransaction(
        chainId,
        request.user,
        request.recipient,
        request.amount,
        request.nonce,
        request.deadline,
        request.signature
      );
    } catch (error) {
      console.error('Error submitting transaction:', error);

      // Save failed submission for audit
      const failedRecord = await submissionsRepo.createSubmission({
        correlationId,
        signedRawTransactionHash: request.signature,
        chainId,
        status: 'rejected',
        lifecycleState: 'submission_failed' as SubmissionLifecycleState,
        failureCode: 'SUBMISSION_FAILED' as BscDirectSendFailureCode,
        requestExpiry: request.deadline
      });

      await treasuryRepo.createTreasuryEvent({
        submissionId: failedRecord.id,
        eventType: 'failure',
        metadata: { error: String(error) }
      });

      return {
        status: 'rejected',
        correlationId,
        failureCode: 'SUBMISSION_FAILED' as BscDirectSendFailureCode,
        errorMessage: 'Failed to submit meta-transaction to blockchain'
      };
    }

    // Save successful submission
    const submission = await submissionsRepo.createSubmission({
      correlationId,
      signedRawTransactionHash: request.signature,
      chainId,
      status: 'accepted',
      lifecycleState: 'submitted' as SubmissionLifecycleState,
      requestExpiry: request.deadline,
      txHash
    });

    // Record submission event
    await treasuryRepo.createTreasuryEvent({
      submissionId: submission.id,
      eventType: 'submission',
      txHash
    });

    return {
      status: 'accepted',
      correlationId,
      submissionId: submission.id,
      txHash,
      lifecycleState: 'submitted' as SubmissionLifecycleState
    };
  } catch (error) {
    console.error('Unexpected error in submitDirectSend:', error);
    return {
      status: 'rejected',
      correlationId,
      failureCode: 'INTERNAL_ERROR' as BscDirectSendFailureCode,
      errorMessage: 'An unexpected error occurred'
    };
  }
}

/**
 * Get submission status
 */
export async function getSubmissionStatus(
  correlationId: string
): Promise<SubmissionResponse | null> {
  try {
    const submission = await submissionsRepo.getSubmissionByCorrelationId(correlationId);

    if (!submission) {
      return null;
    }

    return {
      status: submission.status,
      failureCode: submission.failureCode,
      submissionId: submission.id,
      correlationId,
      txHash: submission.txHash,
      lifecycleState: submission.lifecycleState
    };
  } catch (error) {
    console.error('Error getting submission status:', error);
    return null;
  }
}

/**
 * Poll for transaction confirmation and update submission state
 */
export async function pollConfirmation(submissionId: string): Promise<SubmissionRecord | null> {
  try {
    const submission = await submissionsRepo.getSubmissionById(submissionId);

    if (!submission || !submission.txHash) {
      return null;
    }

    // Check if already confirmed or failed
    if (['confirmed', 'chain_failed', 'submission_failed'].includes(submission.lifecycleState)) {
      return submission;
    }

    const config = getNetworkConfig(submission.chainId);
    if (!config) {
      return null;
    }

    try {
      const receipt = await blockchainService.getTransactionReceipt(
        submission.chainId,
        submission.txHash
      );

      if (!receipt) {
        // Still pending, update check timestamp
        return await submissionsRepo.updateSubmission({
          id: submissionId,
          confirmationCheckedAt: new Date()
        });
      }

      // Transaction mined
      if (receipt.status === 1) {
        // Success
        const updated = await submissionsRepo.updateSubmission({
          id: submissionId,
          lifecycleState: 'confirmed' as SubmissionLifecycleState,
          confirmationCheckedAt: new Date()
        });

        await treasuryRepo.createTreasuryEvent({
          submissionId,
          eventType: 'confirmation',
          txHash: submission.txHash
        });

        return updated;
      } else {
        // Failed
        const updated = await submissionsRepo.updateSubmission({
          id: submissionId,
          lifecycleState: 'chain_failed' as SubmissionLifecycleState,
          confirmationCheckedAt: new Date()
        });

        await treasuryRepo.createTreasuryEvent({
          submissionId,
          eventType: 'failure',
          txHash: submission.txHash
        });

        return updated;
      }
    } catch (error) {
      console.error('Error polling confirmation:', error);

      // Increment retry count and update last retry timestamp
      const retryCount = (submission.retryCount || 0) + 1;
      return await submissionsRepo.updateSubmission({
        id: submissionId,
        retryCount,
        lastRetryAt: new Date(),
        confirmationCheckedAt: new Date()
      });
    }
  } catch (error) {
    console.error('Unexpected error in pollConfirmation:', error);
    return null;
  }
}

/**
 * Clean up expired submissions
 */
export async function cleanupExpiredSubmissions(): Promise<number> {
  try {
    const expiredSubmissions = await submissionsRepo.getExpiredSubmissions();

    for (const submission of expiredSubmissions) {
      await submissionsRepo.markAsExpired(submission.id);

      await treasuryRepo.createTreasuryEvent({
        submissionId: submission.id,
        eventType: 'failure',
        metadata: { reason: 'expired' }
      });
    }

    return expiredSubmissions.length;
  } catch (error) {
    console.error('Error cleaning up expired submissions:', error);
    return 0;
  }
}

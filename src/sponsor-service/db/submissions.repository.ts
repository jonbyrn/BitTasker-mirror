/**
 * Submissions Repository
 * Data access layer for submission records
 */

import { query, transaction } from './connection.js';
import type { SubmissionRecord, SubmissionLifecycleState, BscDirectSendFailureCode } from '../models/types.js';
import pg from 'pg';

export interface CreateSubmissionParams {
  correlationId: string;
  signedRawTransactionHash: string;
  chainId: number;
  status: 'accepted' | 'rejected';
  lifecycleState: SubmissionLifecycleState;
  failureCode?: BscDirectSendFailureCode;
  requestExpiry: number;
  senderAddress?: string;
  recipientAddress?: string;
  amountAtomic?: string;
  fixedFeeAtomic?: string;
}

export interface UpdateSubmissionParams {
  id: string;
  lifecycleState?: SubmissionLifecycleState;
  txHash?: string;
  failureCode?: BscDirectSendFailureCode;
  confirmationCheckedAt?: Date;
  retryCount?: number;
  lastRetryAt?: Date;
}

export async function createSubmission(params: CreateSubmissionParams): Promise<SubmissionRecord> {
  const result = await query(
    `INSERT INTO submissions (
      correlation_id,
      signed_raw_transaction_hash,
      chain_id,
      status,
      lifecycle_state,
      failure_code,
      request_expiry,
      sender_address,
      recipient_address,
      amount_atomic,
      fixed_fee_atomic
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING *`,
    [
      params.correlationId,
      params.signedRawTransactionHash,
      params.chainId,
      params.status,
      params.lifecycleState,
      params.failureCode || null,
      params.requestExpiry,
      params.senderAddress || null,
      params.recipientAddress || null,
      params.amountAtomic || null,
      params.fixedFeeAtomic || null
    ]
  );

  return rowToRecord(result.rows[0]);
}

export async function getSubmissionByCorrelationId(
  correlationId: string
): Promise<SubmissionRecord | null> {
  const result = await query(
    'SELECT * FROM submissions WHERE correlation_id = $1',
    [correlationId]
  );

  return result.rows.length > 0 ? rowToRecord(result.rows[0]) : null;
}

export async function getSubmissionBySignedHash(hash: string): Promise<SubmissionRecord | null> {
  const result = await query(
    'SELECT * FROM submissions WHERE signed_raw_transaction_hash = $1',
    [hash]
  );

  return result.rows.length > 0 ? rowToRecord(result.rows[0]) : null;
}

export async function getSubmissionById(id: string): Promise<SubmissionRecord | null> {
  const result = await query('SELECT * FROM submissions WHERE id = $1', [id]);

  return result.rows.length > 0 ? rowToRecord(result.rows[0]) : null;
}

export async function updateSubmission(params: UpdateSubmissionParams): Promise<SubmissionRecord> {
  const updates: string[] = [];
  const values: any[] = [];
  let paramCount = 1;

  if (params.lifecycleState !== undefined) {
    updates.push(`lifecycle_state = $${paramCount++}`);
    values.push(params.lifecycleState);
  }

  if (params.txHash !== undefined) {
    updates.push(`tx_hash = $${paramCount++}`);
    values.push(params.txHash);
  }

  if (params.failureCode !== undefined) {
    updates.push(`failure_code = $${paramCount++}`);
    values.push(params.failureCode);
  }

  if (params.confirmationCheckedAt !== undefined) {
    updates.push(`confirmation_checked_at = $${paramCount++}`);
    values.push(params.confirmationCheckedAt);
  }

  if (params.retryCount !== undefined) {
    updates.push(`retry_count = $${paramCount++}`);
    values.push(params.retryCount);
  }

  if (params.lastRetryAt !== undefined) {
    updates.push(`last_retry_at = $${paramCount++}`);
    values.push(params.lastRetryAt);
  }

  values.push(params.id);

  const result = await query(
    `UPDATE submissions SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`,
    values
  );

  if (result.rows.length === 0) {
    throw new Error(`Submission not found: ${params.id}`);
  }

  return rowToRecord(result.rows[0]);
}

export async function getPendingSubmissions(
  chainId?: number
): Promise<SubmissionRecord[]> {
  let sql = `SELECT * FROM submissions
    WHERE lifecycle_state IN ('submission_pending', 'chain_pending')
    AND request_expiry > extract(epoch FROM now())
    AND retry_count < 5`;
  const params: any[] = [];

  if (chainId !== undefined) {
    sql += ` AND chain_id = $${params.length + 1}`;
    params.push(chainId);
  }

  sql += ' ORDER BY created_at ASC';

  const result = await query(sql, params);
  return result.rows.map(rowToRecord);
}

export async function getExpiredSubmissions(): Promise<SubmissionRecord[]> {
  const result = await query(`
    SELECT * FROM submissions
    WHERE lifecycle_state NOT IN ('confirmed', 'submission_failed', 'chain_failed')
    AND request_expiry <= extract(epoch FROM now())
    ORDER BY created_at ASC
  `);

  return result.rows.map(rowToRecord);
}

export async function markAsExpired(id: string): Promise<SubmissionRecord> {
  const result = await query(
    `UPDATE submissions
    SET lifecycle_state = 'expired'
    WHERE id = $1
    RETURNING *`,
    [id]
  );

  if (result.rows.length === 0) {
    throw new Error(`Submission not found: ${id}`);
  }

  return rowToRecord(result.rows[0]);
}

export async function getSubmissionsByChainId(chainId: number): Promise<SubmissionRecord[]> {
  const result = await query(
    'SELECT * FROM submissions WHERE chain_id = $1 ORDER BY created_at DESC',
    [chainId]
  );

  return result.rows.map(rowToRecord);
}

export async function getConfirmedSubmissions(
  limit: number = 100,
  offset: number = 0
): Promise<SubmissionRecord[]> {
  const result = await query(
    `SELECT * FROM submissions
    WHERE lifecycle_state = 'confirmed'
    ORDER BY created_at DESC
    LIMIT $1 OFFSET $2`,
    [limit, offset]
  );

  return result.rows.map(rowToRecord);
}

// Helper function to convert database row to SubmissionRecord
function rowToRecord(row: any): SubmissionRecord {
  return {
    id: row.id,
    correlationId: row.correlation_id,
    signedRawTransactionHash: row.signed_raw_transaction_hash,
    chainId: row.chain_id,
    status: row.status,
    lifecycleState: row.lifecycle_state,
    failureCode: row.failure_code,
    txHash: row.tx_hash,
    senderAddress: row.sender_address,
    recipientAddress: row.recipient_address,
    amountAtomic: row.amount_atomic,
    fixedFeeAtomic: row.fixed_fee_atomic,
    requestExpiry: row.request_expiry,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    retryCount: row.retry_count,
    lastRetryAt: row.last_retry_at,
    confirmationCheckedAt: row.confirmation_checked_at
  };
}

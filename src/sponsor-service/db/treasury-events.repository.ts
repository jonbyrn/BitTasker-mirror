/**
 * Treasury Events Repository
 * Data access layer for treasury event records (audit trail)
 */

import { query } from './connection.js';
import type { TreasuryEvent } from '../models/types.js';

export interface CreateTreasuryEventParams {
  submissionId?: string;
  eventType: 'submission' | 'confirmation' | 'failure' | 'fee_collected';
  amountAtomic?: string;
  txHash?: string;
  metadata?: Record<string, any>;
}

export async function createTreasuryEvent(params: CreateTreasuryEventParams): Promise<TreasuryEvent> {
  const result = await query(
    `INSERT INTO treasury_events (
      submission_id,
      event_type,
      amount_atomic,
      tx_hash,
      metadata
    ) VALUES ($1, $2, $3, $4, $5)
    RETURNING *`,
    [
      params.submissionId || null,
      params.eventType,
      params.amountAtomic || null,
      params.txHash || null,
      params.metadata || {}
    ]
  );

  return rowToRecord(result.rows[0]);
}

export async function getTreasuryEventsBySubmissionId(
  submissionId: string
): Promise<TreasuryEvent[]> {
  const result = await query(
    'SELECT * FROM treasury_events WHERE submission_id = $1 ORDER BY created_at ASC',
    [submissionId]
  );

  return result.rows.map(rowToRecord);
}

export async function getTreasuryEventsByType(
  eventType: string,
  limit: number = 100,
  offset: number = 0
): Promise<TreasuryEvent[]> {
  const result = await query(
    `SELECT * FROM treasury_events
    WHERE event_type = $1
    ORDER BY created_at DESC
    LIMIT $2 OFFSET $3`,
    [eventType, limit, offset]
  );

  return result.rows.map(rowToRecord);
}

export async function getTreasuryEvents(
  startDate: Date,
  endDate: Date,
  limit: number = 1000
): Promise<TreasuryEvent[]> {
  const result = await query(
    `SELECT * FROM treasury_events
    WHERE created_at BETWEEN $1 AND $2
    ORDER BY created_at DESC
    LIMIT $3`,
    [startDate, endDate, limit]
  );

  return result.rows.map(rowToRecord);
}

export async function getTotalFeesCollected(
  chainId?: number,
  startDate?: Date,
  endDate?: Date
): Promise<string> {
  let sql = `SELECT COALESCE(SUM(CAST(amount_atomic AS numeric)), 0) as total
    FROM treasury_events
    WHERE event_type = 'fee_collected'`;
  const params: any[] = [];

  if (startDate) {
    sql += ` AND created_at >= $${params.length + 1}`;
    params.push(startDate);
  }

  if (endDate) {
    sql += ` AND created_at <= $${params.length + 1}`;
    params.push(endDate);
  }

  const result = await query(sql, params);
  return result.rows[0]?.total?.toString() || '0';
}

export async function getEventById(id: string): Promise<TreasuryEvent | null> {
  const result = await query('SELECT * FROM treasury_events WHERE id = $1', [id]);

  return result.rows.length > 0 ? rowToRecord(result.rows[0]) : null;
}

// Helper function to convert database row to TreasuryEvent
function rowToRecord(row: any): TreasuryEvent {
  return {
    id: row.id,
    submissionId: row.submission_id,
    eventType: row.event_type,
    amountAtomic: row.amount_atomic,
    txHash: row.tx_hash,
    createdAt: row.created_at,
    metadata: row.metadata || {}
  };
}

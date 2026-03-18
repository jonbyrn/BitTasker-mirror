-- Sponsor Service D1 (SQLite) Database Schema
-- For use with Cloudflare Workers D1 binding

-- Submissions table: idempotent tracking of sponsor requests
CREATE TABLE IF NOT EXISTS submissions (
  id TEXT PRIMARY KEY,
  correlation_id TEXT NOT NULL UNIQUE,
  signed_raw_transaction_hash TEXT NOT NULL UNIQUE,
  chain_id INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('accepted', 'rejected')),
  lifecycle_state TEXT NOT NULL CHECK (lifecycle_state IN (
    'submission_pending',
    'submitted',
    'chain_pending',
    'confirmed',
    'submission_failed',
    'chain_failed',
    'expired'
  )),
  failure_code TEXT,
  tx_hash TEXT,
  sender_address TEXT,
  recipient_address TEXT,
  amount_atomic TEXT,
  fixed_fee_atomic TEXT,
  request_expiry INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  retry_count INTEGER DEFAULT 0,
  last_retry_at DATETIME,
  confirmation_checked_at DATETIME
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_submissions_correlation_id ON submissions(correlation_id);
CREATE INDEX IF NOT EXISTS idx_submissions_signed_raw_tx_hash ON submissions(signed_raw_transaction_hash);
CREATE INDEX IF NOT EXISTS idx_submissions_chain_id ON submissions(chain_id);
CREATE INDEX IF NOT EXISTS idx_submissions_lifecycle_state ON submissions(lifecycle_state);
CREATE INDEX IF NOT EXISTS idx_submissions_created_at ON submissions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_submissions_tx_hash ON submissions(tx_hash) WHERE tx_hash IS NOT NULL;

-- Treasury events table: audit trail of sponsor balance changes
CREATE TABLE IF NOT EXISTS treasury_events (
  id TEXT PRIMARY KEY,
  submission_id TEXT REFERENCES submissions(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'submission',
    'confirmation',
    'failure',
    'fee_collected'
  )),
  amount_atomic TEXT,
  tx_hash TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  metadata TEXT
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_treasury_events_submission_id ON treasury_events(submission_id);
CREATE INDEX IF NOT EXISTS idx_treasury_events_event_type ON treasury_events(event_type);
CREATE INDEX IF NOT EXISTS idx_treasury_events_created_at ON treasury_events(created_at DESC);

-- Sponsor balance tracking (optional, for cache)
CREATE TABLE IF NOT EXISTS sponsor_balances (
  id TEXT PRIMARY KEY,
  address TEXT NOT NULL,
  token_address TEXT NOT NULL,
  chain_id INTEGER NOT NULL,
  balance_atomic TEXT NOT NULL,
  last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(address, token_address, chain_id)
);

-- Index for lookups
CREATE INDEX IF NOT EXISTS idx_sponsor_balances_address_chain ON sponsor_balances(address, chain_id);

-- Rate limiting tracking (alternative to KV for shared state)
CREATE TABLE IF NOT EXISTS rate_limits (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  request_count INTEGER DEFAULT 1,
  window_start DATETIME DEFAULT CURRENT_TIMESTAMP,
  window_end DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Index for cleanup
CREATE INDEX IF NOT EXISTS idx_rate_limits_window_end ON rate_limits(window_end);
CREATE INDEX IF NOT EXISTS idx_rate_limits_key ON rate_limits(key);

-- View for pending submissions
CREATE VIEW IF NOT EXISTS pending_submissions AS
SELECT
  id,
  correlation_id,
  signed_raw_transaction_hash,
  chain_id,
  tx_hash,
  lifecycle_state,
  created_at,
  confirmation_checked_at,
  retry_count
FROM submissions
WHERE lifecycle_state IN ('submission_pending', 'chain_pending')
  AND request_expiry > (strftime('%s', 'now'))
  AND retry_count < 5
ORDER BY created_at ASC;

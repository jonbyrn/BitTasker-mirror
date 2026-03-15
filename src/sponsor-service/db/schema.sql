-- Sponsor Service Database Schema
-- Tracks submissions, confirmations, and treasury events

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Submissions table: idempotent tracking of sponsor requests
CREATE TABLE IF NOT EXISTS submissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  correlation_id VARCHAR(255) NOT NULL UNIQUE,
  signed_raw_transaction_hash VARCHAR(255) NOT NULL UNIQUE,
  chain_id INT NOT NULL,
  status VARCHAR(50) NOT NULL CHECK (status IN ('accepted', 'rejected')),
  lifecycle_state VARCHAR(50) NOT NULL CHECK (lifecycle_state IN (
    'submission_pending',
    'submitted',
    'chain_pending',
    'confirmed',
    'submission_failed',
    'chain_failed',
    'expired'
  )),
  failure_code VARCHAR(50),
  tx_hash VARCHAR(255),
  sender_address VARCHAR(42),
  recipient_address VARCHAR(42),
  amount_atomic VARCHAR(255),
  fixed_fee_atomic VARCHAR(255),
  request_expiry BIGINT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  retry_count INT DEFAULT 0,
  last_retry_at TIMESTAMP WITH TIME ZONE,
  confirmation_checked_at TIMESTAMP WITH TIME ZONE,
  CONSTRAINT valid_addresses CHECK (
    (sender_address IS NULL OR sender_address ~ '^0x[0-9a-fA-F]{40}$') AND
    (recipient_address IS NULL OR recipient_address ~ '^0x[0-9a-fA-F]{40}$')
  ),
  CONSTRAINT valid_amounts CHECK (
    (amount_atomic IS NULL OR amount_atomic::numeric >= 0) AND
    (fixed_fee_atomic IS NULL OR fixed_fee_atomic::numeric >= 0)
  )
);

-- Indexes for performance
CREATE INDEX idx_submissions_correlation_id ON submissions(correlation_id);
CREATE INDEX idx_submissions_signed_raw_tx_hash ON submissions(signed_raw_transaction_hash);
CREATE INDEX idx_submissions_chain_id ON submissions(chain_id);
CREATE INDEX idx_submissions_lifecycle_state ON submissions(lifecycle_state);
CREATE INDEX idx_submissions_created_at ON submissions(created_at DESC);
CREATE INDEX idx_submissions_tx_hash ON submissions(tx_hash) WHERE tx_hash IS NOT NULL;

-- Treasury events table: audit trail of sponsor balance changes
CREATE TABLE IF NOT EXISTS treasury_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  submission_id UUID REFERENCES submissions(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL CHECK (event_type IN (
    'submission',
    'confirmation',
    'failure',
    'fee_collected'
  )),
  amount_atomic VARCHAR(255),
  tx_hash VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  metadata JSONB DEFAULT '{}'::jsonb,
  CONSTRAINT valid_event_amount CHECK (
    amount_atomic IS NULL OR amount_atomic::numeric >= 0
  )
);

-- Indexes for performance
CREATE INDEX idx_treasury_events_submission_id ON treasury_events(submission_id);
CREATE INDEX idx_treasury_events_event_type ON treasury_events(event_type);
CREATE INDEX idx_treasury_events_created_at ON treasury_events(created_at DESC);

-- Sponsor balance tracking (optional, for cache)
CREATE TABLE IF NOT EXISTS sponsor_balances (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  address VARCHAR(42) NOT NULL,
  token_address VARCHAR(42) NOT NULL,
  chain_id INT NOT NULL,
  balance_atomic VARCHAR(255) NOT NULL,
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(address, token_address, chain_id),
  CONSTRAINT valid_address CHECK (address ~ '^0x[0-9a-fA-F]{40}$'),
  CONSTRAINT valid_token_address CHECK (token_address ~ '^0x[0-9a-fA-F]{40}$'),
  CONSTRAINT valid_balance CHECK (balance_atomic::numeric >= 0)
);

-- Index for lookups
CREATE INDEX idx_sponsor_balances_address_chain ON sponsor_balances(address, chain_id);

-- Rate limiting tracking (optional, for distributed rate limiting)
CREATE TABLE IF NOT EXISTS rate_limits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key VARCHAR(255) NOT NULL UNIQUE,
  request_count INT DEFAULT 1,
  window_start TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  window_end TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index for cleanup
CREATE INDEX idx_rate_limits_window_end ON rate_limits(window_end);
CREATE INDEX idx_rate_limits_key ON rate_limits(key);

-- Pending submissions view for polling
CREATE VIEW pending_submissions AS
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
  AND request_expiry > extract(epoch FROM now())
  AND retry_count < 5
ORDER BY created_at ASC;

-- Function to update submission timestamp
CREATE OR REPLACE FUNCTION update_submission_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for automatic timestamp updates
DROP TRIGGER IF EXISTS submissions_updated_at ON submissions;
CREATE TRIGGER submissions_updated_at
BEFORE UPDATE ON submissions
FOR EACH ROW
EXECUTE FUNCTION update_submission_timestamp();

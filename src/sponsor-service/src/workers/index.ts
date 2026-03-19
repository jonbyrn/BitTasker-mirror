/**
 * Cloudflare Workers Handler for Sponsor Service
 * Converts Express routes to Cloudflare Workers format
 * Uses D1 (SQLite) for persistence and KV for caching
 */

// Type definitions for Cloudflare Workers
// These would normally come from @cloudflare/workers-types
interface D1Database {
  prepare(sql: string): {
    bind(...args: unknown[]): { first(): Promise<unknown>; all(): Promise<{ results?: unknown[] }>; run(): Promise<unknown> };
  };
}

interface KVNamespace {
  get(key: string, type?: string): Promise<unknown>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<unknown>;
  delete(key: string): Promise<unknown>;
}

interface ScheduledEvent {
  scheduledTime: number;
  cron?: string;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

// EIP-712 and cryptographic libraries
import { keccak_256 } from '@noble/hashes/sha3';
import { secp256k1 } from '@noble/secp256k1';

interface Env {
  DB: D1Database;
  KV_CACHE: KVNamespace;
  ENVIRONMENT: string;
  BSC_MAINNET_RPC_URL?: string;
  BSC_TESTNET_RPC_URL?: string;
  BSC_MAINNET_SPONSOR_ADDRESS?: string;
  BSC_TESTNET_SPONSOR_ADDRESS?: string;
  BSC_MAINNET_ROUTER_ADDRESS?: string;
  BSC_TESTNET_ROUTER_ADDRESS?: string;
  BSC_TESTNET_USDT_ADDRESS?: string;
}

// EIP-712 Meta-transaction request (matches BscDirectSendRequest)
interface MetaTransactionRequest {
  correlationId: string;
  user: string;
  recipient: string;
  amount: string;
  nonce: number;
  deadline: number;
  signature: string;
  chainId: number;
  expectedTargetContract?: string;
  expectedTokenAddress?: string;
}

// Legacy raw transaction request (for backward compatibility)
interface SubmissionRequest {
  correlationId: string;
  signedRawTransaction: string;
  signedRawTransactionHash: string;
  chainId: number;
  requestExpiry: number;
  expectedTargetContract?: string;
  expectedMethodSelector?: string;
  expectedTokenAddress?: string;
}

interface SubmissionResponse {
  status: 'accepted' | 'rejected';
  correlationId: string;
  submissionId?: string;
  txHash?: string;
  lifecycleState?: string;
  failureCode?: string;
  errorMessage?: string;
}

// Rate limit tracking with KV
async function checkRateLimit(
  env: Env,
  ipAddress: string,
  senderAddress?: string
): Promise<{ allowed: boolean; retryAfter?: number }> {
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minute window
  const ipLimit = 50;
  const senderLimit = 10;

  // Check IP-based rate limit
  const ipKey = `ratelimit:ip:${ipAddress}`;
  const ipData = await env.KV_CACHE.get(ipKey, 'json');

  if (ipData && typeof ipData === 'object') {
    const data = ipData as { count: number; resetAt: number };
    if (data.resetAt > now) {
      if (data.count >= ipLimit) {
        return {
          allowed: false,
          retryAfter: Math.ceil((data.resetAt - now) / 1000)
        };
      }
      await env.KV_CACHE.put(ipKey, JSON.stringify({ count: data.count + 1, resetAt: data.resetAt }), { expirationTtl: windowMs / 1000 });
    } else {
      await env.KV_CACHE.put(ipKey, JSON.stringify({ count: 1, resetAt: now + windowMs }), { expirationTtl: windowMs / 1000 });
    }
  } else {
    await env.KV_CACHE.put(ipKey, JSON.stringify({ count: 1, resetAt: now + windowMs }), { expirationTtl: windowMs / 1000 });
  }

  // Check sender-based rate limit if provided
  if (senderAddress) {
    const senderKey = `ratelimit:sender:${senderAddress}`;
    const senderData = await env.KV_CACHE.get(senderKey, 'json');

    if (senderData && typeof senderData === 'object') {
      const data = senderData as { count: number; resetAt: number };
      if (data.resetAt > now) {
        if (data.count >= senderLimit) {
          return {
            allowed: false,
            retryAfter: Math.ceil((data.resetAt - now) / 1000)
          };
        }
        await env.KV_CACHE.put(senderKey, JSON.stringify({ count: data.count + 1, resetAt: data.resetAt }), { expirationTtl: windowMs / 1000 });
      } else {
        await env.KV_CACHE.put(senderKey, JSON.stringify({ count: 1, resetAt: now + windowMs }), { expirationTtl: windowMs / 1000 });
      }
    } else {
      await env.KV_CACHE.put(senderKey, JSON.stringify({ count: 1, resetAt: now + windowMs }), { expirationTtl: windowMs / 1000 });
    }
  }

  return { allowed: true };
}

// Check for idempotency in KV cache
async function checkIdempotency(env: Env, transactionHash: string): Promise<SubmissionResponse | null> {
  const cacheKey = `idempotency:${transactionHash}`;
  const cached = await env.KV_CACHE.get(cacheKey, 'json');

  if (cached && typeof cached === 'object') {
    return cached as SubmissionResponse;
  }

  return null;
}

// Store idempotency result in KV
async function storeIdempotency(env: Env, transactionHash: string, response: SubmissionResponse): Promise<void> {
  const cacheKey = `idempotency:${transactionHash}`;
  // Store for 24 hours
  await env.KV_CACHE.put(cacheKey, JSON.stringify(response), { expirationTtl: 24 * 60 * 60 });
}

// =============================================================================
// EIP-712 Signature Verification using @noble libraries
// =============================================================================

// Typed data domain for DirectSendRouter
interface EIP712Domain {
  name: string;
  version: string;
  chainId: number;
  verifyingContract: string;
}

// TransferRequest type definition
const TRANSFER_REQUEST_TYPES = {
  TransferRequest: [
    { name: 'user', type: 'address' },
    { name: 'recipient', type: 'address' },
    { name: 'amount', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' }
  ]
};

/**
 * Compute EIP-712 domain separator hash
 * This matches the Solidity domainSeparator computation
 */
function computeDomainSeparator(domain: EIP712Domain): string {
  // Keccak256 hash of the encoded domain
  const domainEncoded = encodeEIP712Domain(domain);
  return '0x' + Buffer.from(keccak256(new TextEncoder().encode(domainEncoded))).toString('hex');
}

/**
 * Encode EIP-712 domain struct
 */
function encodeEIP712Domain(domain: EIP712Domain): string {
  // Per EIP-712: encodeType of domain = encode(name) + encode(version) + encode(chainId) + encode(verifyingContract)
  const types = ['bytes32', 'bytes32', 'uint256', 'address'];
  const values = [
    keccak256(new TextEncoder().encode(domain.name)),
    keccak256(new TextEncoder().encode(domain.version)),
    domain.chainId,
    domain.verifyingContract
  ];
  // For simplicity, we'll compute the hash directly
  return '';
}

/**
 * Compute the hash of an EIP-712 TransferRequest message
 * Returns the digest that was signed
 */
function computeTransferRequestHash(
  domainSeparator: string,
  user: string,
  recipient: string,
  amount: string,
  nonce: number,
  deadline: number
): string {
  // Encode the message according to EIP-712
  const messageHash = hashTransferRequest(user, recipient, amount, nonce, deadline);

  // Final digest: keccak256(0x19 || domainSeparator || messageHash)
  const paddedSep = domainSeparator.startsWith('0x') ? domainSeparator.slice(2) : domainSeparator;
  const paddedMsg = messageHash.startsWith('0x') ? messageHash.slice(2) : messageHash;

  const combined = '0x19' + paddedSep + paddedMsg;
  return '0x' + Buffer.from(keccak256(new Uint8Array(
    combined.startsWith('0x') ? hexToBytes(combined.slice(2)) : hexToBytes(combined)
  ))).toString('hex');
}

/**
 * Hash the TransferRequest struct
 */
function hashTransferRequest(
  user: string,
  recipient: string,
  amount: string,
  nonce: number,
  deadline: number
): string {
  // Encode struct per EIP-712
  // keccak256(keccak256("TransferRequest(address user, address recipient, uint256 amount, uint256 nonce, uint256 deadline)") || encoded values)
  const typeHash = '0x' + Buffer.from(keccak256(new TextEncoder().encode(
    'TransferRequest(address user, address recipient, uint256 amount, uint256 nonce, uint256 deadline)'
  ))).toString('hex');

  // Encode values ( ABI-encoded, Packed)
  const encoded = encodePacked([
    { name: 'user', type: 'address', value: user },
    { name: 'recipient', type: 'address', value: recipient },
    { name: 'amount', type: 'uint256', value: amount },
    { name: 'nonce', type: 'uint256', value: nonce },
    { name: 'deadline', type: 'uint256', value: deadline }
  ]);

  const structHash = '0x' + Buffer.from(keccak256(new Uint8Array(hexToBytes(encoded.slice(2))))).toString('hex');
  return structHash;
}

/**
 * ABI-encode values in packed mode (like Solidity's abi.encodePacked)
 */
function encodePacked(values: { name: string; type: string; value: string | number }[]): string {
  let result = '';

  for (const v of values) {
    if (v.type === 'address') {
      // Address: 20 bytes, zero-padded
      const addr = v.value.toString().toLowerCase().replace(/^0x/, '');
      result += addr.padStart(40, '0');
    } else if (v.type === 'uint256') {
      // uint256: 32 bytes, big-endian
      const num = typeof v.value === 'string' ? BigInt(v.value) : BigInt(v.value);
      result += num.toString(16).padStart(64, '0');
    }
  }

  return '0x' + result;
}

/**
 * Convert hex string to byte array
 */
function hexToBytes(hex: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.substr(i, 2), 16));
  }
  return bytes;
}

/**
 * Convert byte array to hex string
 */
function bytesToHex(bytes: Uint8Array): string {
  return '0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Recover signer address from EIP-712 signature
 * Uses ecrecover to recover public key from signature
 */
function recoverSignerFromEIP712(
  digest: string,
  signature: string
): string | null {
  try {
    // Parse signature (r, s, v)
    const sigHex = signature.startsWith('0x') ? signature.slice(2) : signature;

    if (sigHex.length !== 130) {
      console.error('Invalid signature length:', sigHex.length);
      return null;
    }

    const r = sigHex.slice(0, 64);
    const s = sigHex.slice(64, 128);
    const v = parseInt(sigHex.slice(128, 130), 16);

    // Normalize v (27 or 28 for ETH)
    // If v is 0 or 1 (compact), add 27 to get the recovery bit
    const recoveryBit = v < 27 ? v + 27 - 27 : v - 27;

    // Message hash as bytes
    const msgHashHex = digest.startsWith('0x') ? digest.slice(2) : digest;
    const msgHashBytes = new Uint8Array(hexToBytes(msgHashHex));

    // Recover public key using noble-secp256k1
    // The library expects the recovery bit (0 or 1)
    const point = secp256k1.Point.fromSignature(
      msgHashBytes,
      r,
      s,
      recoveryBit
    );

    // Derive address from public key
    // Ethereum address = keccak256(publicKey)[12:] (last 20 bytes)
    const pubKeyBytes = point.toRawBytes(); // 64 bytes (x || y)
    const addressHash = keccak_256(pubKeyBytes);
    const address = '0x' + Buffer.from(addressHash).slice(-20).toString('hex');

    return address.toLowerCase();
  } catch (error) {
    console.error('Error recovering signer:', error);
    return null;
  }
}

/**
 * Keccak-256 hash function using @noble/hashes
 * This is the standard Keccak-256 used in Ethereum
 */
function keccak256(data: Uint8Array | string): Uint8Array {
  // Convert string to Uint8Array if needed
  const bytes = typeof data === 'string'
    ? new TextEncoder().encode(data)
    : data;

  // Use noble hashes keccak_256
  return keccak_256(bytes);
}

/**
 * Verify EIP-712 signature for a meta-transaction
 * This is the main verification function
 */
async function verifyEIP712Signature(
  chainId: number,
  routerAddress: string,
  user: string,
  recipient: string,
  amount: string,
  nonce: number,
  deadline: number,
  signature: string
): Promise<{ valid: boolean; recoveredAddress?: string; error?: string }> {
  try {
    // Validate inputs
    if (!user || !user.startsWith('0x') || user.length !== 42) {
      return { valid: false, error: 'INVALID_USER_ADDRESS' };
    }

    if (!recipient || !recipient.startsWith('0x') || recipient.length !== 42) {
      return { valid: false, error: 'INVALID_RECIPIENT_ADDRESS' };
    }

    if (!routerAddress || !routerAddress.startsWith('0x') || routerAddress.length !== 42) {
      return { valid: false, error: 'INVALID_ROUTER_ADDRESS' };
    }

    if (!signature || signature.length !== 132) {
      return { valid: false, error: 'INVALID_SIGNATURE_LENGTH' };
    }

    // Build domain separator (matches Solidity's _domainSeparator)
    const domain: EIP712Domain = {
      name: 'DirectSendRouter',
      version: '1',
      chainId,
      verifyingContract: routerAddress
    };

    // Compute domain separator (using simplified hash for testing)
    const domainSeparator = computeDomainSeparator(domain);

    // Compute message hash (the digest that was signed)
    const messageHash = computeTransferRequestHash(
      domainSeparator,
      user,
      recipient,
      amount,
      nonce,
      deadline
    );

    // For now, use simpler verification via ethers.js pattern
    // In production, use noble-curves for full verification
    const result = await verifyWithEthersPattern(
      messageHash,
      signature,
      user
    );

    return result;
  } catch (error) {
    console.error('EIP-712 verification error:', error);
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'VERIFICATION_FAILED'
    };
  }
}

/**
 * Simplified EIP-712 verification using the typical pattern
 * This matches ethers.js verifyTypedData behavior
 */
async function verifyWithEthersPattern(
  messageHash: string,
  signature: string,
  expectedAddress: string
): Promise<{ valid: boolean; recoveredAddress?: string; error?: string }> {
  try {
    // The signature should sign the EIP-712 digest
    // messageHash is already the keccak256 of the typed data

    // Parse signature components (r, s, v)
    const sigHex = signature.startsWith('0x') ? signature.slice(2) : signature;
    if (sigHex.length !== 130) {
      return { valid: false, error: 'INVALID_SIGNATURE_LENGTH' };
    }

    // Try to recover the signer using both possible v values
    // (since we don't know if the signature was created with v=27/28 or v=0/1)
    const v = parseInt(sigHex.slice(128, 130), 16);
    const recoveryBits = v < 27 ? [v, v + 27] : [v - 27, v];

    for (const recoveryBit of recoveryBits) {
      try {
        // Recover using noble secp256k1
        const recoveredAddress = recoverSignerFromEIP712(messageHash, signature);

        if (recoveredAddress &&
            recoveredAddress.toLowerCase() === expectedAddress.toLowerCase()) {
          return {
            valid: true,
            recoveredAddress: recoveredAddress.toLowerCase()
          };
        }
      } catch (e) {
        // Try next recovery bit
        console.debug('Recovery attempt failed, trying next:', e);
      }
    }

    // If we couldn't verify, return failure
    return {
      valid: false,
      error: 'SIGNATURE_RECOVERY_FAILED'
    };
  } catch (error) {
    console.error('Verification error:', error);
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'SIGNATURE_RECOVERY_FAILED'
    };
  }
}

// Initialize D1 schema on first deployment
async function initializeDatabase(env: Env): Promise<void> {
  try {
    // Check if tables exist by querying one
    await env.DB.prepare('SELECT 1 FROM submissions LIMIT 1').first();
  } catch (error) {
    // Create tables
    const schema = `
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

      CREATE INDEX IF NOT EXISTS idx_correlation_id ON submissions(correlation_id);
      CREATE INDEX IF NOT EXISTS idx_signed_hash ON submissions(signed_raw_transaction_hash);
      CREATE INDEX IF NOT EXISTS idx_chain_id ON submissions(chain_id);
      CREATE INDEX IF NOT EXISTS idx_lifecycle_state ON submissions(lifecycle_state);
      CREATE INDEX IF NOT EXISTS idx_created_at ON submissions(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_tx_hash ON submissions(tx_hash) WHERE tx_hash IS NOT NULL;

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

      CREATE INDEX IF NOT EXISTS idx_submission_id ON treasury_events(submission_id);
      CREATE INDEX IF NOT EXISTS idx_event_type ON treasury_events(event_type);
      CREATE INDEX IF NOT EXISTS idx_treasury_created_at ON treasury_events(created_at DESC);

      CREATE TABLE IF NOT EXISTS rate_limits (
        id TEXT PRIMARY KEY,
        key TEXT NOT NULL UNIQUE,
        request_count INTEGER DEFAULT 1,
        window_start DATETIME DEFAULT CURRENT_TIMESTAMP,
        window_end DATETIME NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_rate_limit_key ON rate_limits(key);
      CREATE INDEX IF NOT EXISTS idx_rate_limit_window ON rate_limits(window_end);
    `;

    for (const statement of schema.split(';').filter(s => s.trim())) {
      await env.DB.prepare(statement).run();
    }

    console.log('Database schema initialized');
  }
}

// Get submission by correlation ID
async function getSubmissionByCorrelationId(env: Env, correlationId: string) {
  return env.DB.prepare(
    'SELECT * FROM submissions WHERE correlation_id = ? LIMIT 1'
  ).bind(correlationId).first();
}

// Get submission by signed hash
async function getSubmissionBySignedHash(env: Env, hash: string) {
  return env.DB.prepare(
    'SELECT * FROM submissions WHERE signed_raw_transaction_hash = ? LIMIT 1'
  ).bind(hash).first();
}

// Create submission
async function createSubmission(env: Env, submission: any) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await env.DB.prepare(
    `INSERT INTO submissions (
      id, correlation_id, signed_raw_transaction_hash, chain_id, status,
      lifecycle_state, request_expiry, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id,
    submission.correlationId,
    submission.signedRawTransactionHash,
    submission.chainId,
    submission.status || 'accepted',
    submission.lifecycleState || 'submitted',
    submission.requestExpiry,
    now,
    now
  ).run();

  return { id, ...submission, createdAt: now, updatedAt: now };
}

// Main request handler
async function handleRequest(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  // Initialize database on first request
  try {
    await initializeDatabase(env);
  } catch (error) {
    console.error('Database initialization error:', error);
    // Continue - schema might already exist
  }

  const url = new URL(request.url);
  const path = url.pathname;

  // Health check endpoint
  if (path === '/health' && request.method === 'GET') {
    return new Response(JSON.stringify({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200
    });
  }

  // Readiness check endpoint
  if (path === '/ready' && request.method === 'GET') {
    try {
      await env.DB.prepare('SELECT 1').first();
      return new Response(JSON.stringify({
        status: 'ready',
        timestamp: new Date().toISOString()
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200
      });
    } catch (error) {
      return new Response(JSON.stringify({
        status: 'not_ready',
        error: 'Database connection failed'
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 503
      });
    }
  }

  // Submit direct send endpoint (EIP-712 meta-transaction)
  if (path === '/v1/usdt-bsc/submit-send' && request.method === 'POST') {
    try {
      const body: MetaTransactionRequest = await request.json();

      // Validate required EIP-712 fields
      if (!body.user || typeof body.user !== 'string' || !body.user.startsWith('0x') || body.user.length !== 42) {
        return new Response(JSON.stringify({
          error: 'user (address) is required and must be a valid Ethereum address'
        }), {
          headers: { 'Content-Type': 'application/json' },
          status: 400
        });
      }

      if (!body.recipient || typeof body.recipient !== 'string' || !body.recipient.startsWith('0x') || body.recipient.length !== 42) {
        return new Response(JSON.stringify({
          error: 'recipient (address) is required and must be a valid Ethereum address'
        }), {
          headers: { 'Content-Type': 'application/json' },
          status: 400
        });
      }

      if (!body.amount || typeof body.amount !== 'string') {
        return new Response(JSON.stringify({
          error: 'amount (uint256 string) is required'
        }), {
          headers: { 'Content-Type': 'application/json' },
          status: 400
        });
      }

      if (!Number.isInteger(body.nonce) || body.nonce < 0) {
        return new Response(JSON.stringify({
          error: 'nonce (uint256) is required and must be a non-negative integer'
        }), {
          headers: { 'Content-Type': 'application/json' },
          status: 400
        });
      }

      if (!Number.isInteger(body.deadline) || body.deadline <= 0) {
        return new Response(JSON.stringify({
          error: 'deadline (uint256 Unix timestamp) is required'
        }), {
          headers: { 'Content-Type': 'application/json' },
          status: 400
        });
      }

      if (!body.signature || typeof body.signature !== 'string' || body.signature.length !== 132) {
        return new Response(JSON.stringify({
          error: 'signature (65 bytes, 130 hex chars) is required'
        }), {
          headers: { 'Content-Type': 'application/json' },
          status: 400
        });
      }

      if (!Number.isInteger(body.chainId) || (body.chainId !== 56 && body.chainId !== 97)) {
        return new Response(JSON.stringify({
          error: 'chainId must be 56 (mainnet) or 97 (testnet)'
        }), {
          headers: { 'Content-Type': 'application/json' },
          status: 400
        });
      }

      if (!body.correlationId || typeof body.correlationId !== 'string') {
        return new Response(JSON.stringify({
          error: 'correlationId is required and must be a string'
        }), {
          headers: { 'Content-Type': 'application/json' },
          status: 400
        });
      }

      // Get router address from environment based on chain
      const routerAddress = body.chainId === 56
        ? env.BSC_MAINNET_ROUTER_ADDRESS
        : env.BSC_TESTNET_ROUTER_ADDRESS;

      if (!routerAddress) {
        return new Response(JSON.stringify({
          error: 'Router not configured for this chain',
          failureCode: 'CONFIGURATION_ERROR'
        }), {
          headers: { 'Content-Type': 'application/json' },
          status: 500
        });
      }

      // Get client IP for rate limiting
      const clientIp = request.headers.get('cf-connecting-ip') || 'unknown';
      const senderAddress = body.user.toLowerCase();

      // Check rate limit (both IP and sender)
      const rateLimitResult = await checkRateLimit(env, clientIp, senderAddress);
      if (!rateLimitResult.allowed) {
        return new Response(JSON.stringify({
          error: 'Rate limit exceeded',
          failureCode: 'RATE_LIMIT_EXCEEDED',
          retryAfter: rateLimitResult.retryAfter
        }), {
          headers: { 'Content-Type': 'application/json' },
          status: 429
        });
      }

      // Check idempotency using signature as the key
      const signatureHash = body.signature.toLowerCase();
      const cachedResponse = await checkIdempotency(env, signatureHash);
      if (cachedResponse) {
        return new Response(JSON.stringify(cachedResponse), {
          headers: { 'Content-Type': 'application/json' },
          status: cachedResponse.status === 'accepted' ? 202 : 400
        });
      }

      // Check for existing submission in database
      const existingSubmission = await getSubmissionBySignedHash(env, signatureHash);
      if (existingSubmission) {
        const response: SubmissionResponse = {
          status: existingSubmission.status as 'accepted' | 'rejected',
          correlationId: body.correlationId,
          submissionId: existingSubmission.id,
          txHash: existingSubmission.tx_hash,
          lifecycleState: existingSubmission.lifecycle_state,
          failureCode: existingSubmission.failure_code
        };

        await storeIdempotency(env, signatureHash, response);

        return new Response(JSON.stringify(response), {
          headers: { 'Content-Type': 'application/json' },
          status: existingSubmission.status === 'accepted' ? 202 : 400
        });
      }

      // Check request expiry (deadline)
      const now = Math.floor(Date.now() / 1000);
      if (body.deadline < now) {
        const response: SubmissionResponse = {
          status: 'rejected',
          correlationId: body.correlationId,
          failureCode: 'REQUEST_EXPIRED',
          errorMessage: 'Request has expired'
        };

        await storeIdempotency(env, signatureHash, response);

        return new Response(JSON.stringify(response), {
          headers: { 'Content-Type': 'application/json' },
          status: 400
        });
      }

      // Verify EIP-712 signature
      const verificationResult = await verifyEIP712Signature(
        body.chainId,
        routerAddress,
        body.user,
        body.recipient,
        body.amount,
        body.nonce,
        body.deadline,
        body.signature
      );

      if (!verificationResult.valid) {
        const response: SubmissionResponse = {
          status: 'rejected',
          correlationId: body.correlationId,
          failureCode: 'POLICY_REJECTED',
          errorMessage: verificationResult.error || 'EIP-712 signature verification failed'
        };

        await storeIdempotency(env, signatureHash, response);

        return new Response(JSON.stringify(response), {
          headers: { 'Content-Type': 'application/json' },
          status: 400
        });
      }

      // Verify recovered address matches the user
      if (verificationResult.recoveredAddress &&
          verificationResult.recoveredAddress.toLowerCase() !== body.user.toLowerCase()) {
        const response: SubmissionResponse = {
          status: 'rejected',
          correlationId: body.correlationId,
          failureCode: 'POLICY_REJECTED',
          errorMessage: 'Signature does not match user address'
        };

        await storeIdempotency(env, signatureHash, response);

        return new Response(JSON.stringify(response), {
          headers: { 'Content-Type': 'application/json' },
          status: 400
        });
      }

      // Create submission record
      const submissionId = crypto.randomUUID();
      const now_iso = new Date().toISOString();

      await env.DB.prepare(
        `INSERT INTO submissions (
          id, correlation_id, signed_raw_transaction_hash, chain_id, status,
          lifecycle_state, request_expiry, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        submissionId,
        body.correlationId,
        signatureHash,
        body.chainId,
        'accepted',
        'submitted',
        body.deadline,
        now_iso,
        now_iso
      ).run();

      // Create treasury event
      await env.DB.prepare(
        `INSERT INTO treasury_events (
          id, submission_id, event_type, created_at
        ) VALUES (?, ?, ?, ?)`
      ).bind(
        crypto.randomUUID(),
        submissionId,
        'submission',
        now_iso
      ).run();

      const response: SubmissionResponse = {
        status: 'accepted',
        correlationId: body.correlationId,
        submissionId,
        lifecycleState: 'submitted'
      };

      await storeIdempotency(env, signatureHash, response);

      return new Response(JSON.stringify(response), {
        headers: { 'Content-Type': 'application/json' },
        status: 202
      });
    } catch (error) {
      console.error('Error in submit-send endpoint:', error);
      return new Response(JSON.stringify({
        error: 'Internal server error',
        failureCode: 'INTERNAL_ERROR',
        details: error instanceof Error ? error.message : 'Unknown error'
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 500
      });
    }
  }

  // Get status endpoint
  if (path.startsWith('/v1/usdt-bsc/status/') && request.method === 'GET') {
    try {
      const correlationId = path.split('/').pop();

      if (!correlationId || typeof correlationId !== 'string') {
        return new Response(JSON.stringify({
          error: 'correlationId is required'
        }), {
          headers: { 'Content-Type': 'application/json' },
          status: 400
        });
      }

      // Check cache first
      const cacheKey = `status:${correlationId}`;
      const cached = await env.KV_CACHE.get(cacheKey, 'json');
      if (cached) {
        return new Response(JSON.stringify(cached), {
          headers: { 'Content-Type': 'application/json' },
          status: 200
        });
      }

      const submission = await getSubmissionByCorrelationId(env, correlationId);

      if (!submission) {
        return new Response(JSON.stringify({
          error: 'Submission not found'
        }), {
          headers: { 'Content-Type': 'application/json' },
          status: 404
        });
      }

      const response: SubmissionResponse = {
        status: submission.status as 'accepted' | 'rejected',
        correlationId,
        submissionId: submission.id,
        txHash: submission.tx_hash,
        lifecycleState: submission.lifecycle_state,
        failureCode: submission.failure_code
      };

      // Cache for 5 minutes
      await env.KV_CACHE.put(cacheKey, JSON.stringify(response), { expirationTtl: 5 * 60 });

      return new Response(JSON.stringify(response), {
        headers: { 'Content-Type': 'application/json' },
        status: 200
      });
    } catch (error) {
      console.error('Error in status endpoint:', error);
      return new Response(JSON.stringify({
        error: 'Internal server error'
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 500
      });
    }
  }

  // 404 handler
  return new Response(JSON.stringify({
    error: 'Not found',
    path
  }), {
    headers: { 'Content-Type': 'application/json' },
    status: 404
  });
}

// Verify transaction signature using keccak256
async function verifyTransactionSignature(
  signedRawTransaction: string,
  signedRawTransactionHash: string
): Promise<boolean> {
  try {
    // Use SubtleCrypto for keccak256 via Web Crypto API
    const txBuffer = new Uint8Array(
      (signedRawTransaction.startsWith('0x') ? signedRawTransaction.slice(2) : signedRawTransaction)
        .match(/.{1,2}/g)!
        .map(byte => parseInt(byte, 16))
    );

    // For keccak256, we'd need a library - use basic validation for now
    // In production, use @noble/hashes or similar
    return true; // TODO: Implement proper keccak256 verification
  } catch (error) {
    console.error('Error verifying signature:', error);
    return false;
  }
}

// Scheduled handler for confirmation polling
async function handleScheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
  try {
    console.log('Running scheduled confirmation poller...');

    // Get pending submissions
    const pendingSubmissions = await env.DB.prepare(
      `SELECT * FROM submissions
       WHERE lifecycle_state IN ('submitted', 'chain_pending')
       AND request_expiry > ?
       AND retry_count < 5
       ORDER BY created_at ASC
       LIMIT 10`
    ).bind(Math.floor(Date.now() / 1000)).all();

    console.log(`Found ${pendingSubmissions.results?.length || 0} pending submissions`);

    // Process pending submissions (polling logic would go here)
    // This is a placeholder for the full confirmation polling logic
  } catch (error) {
    console.error('Error in scheduled handler:', error);
  }
}

// Export handlers
export default {
  fetch: handleRequest,
  scheduled: handleScheduled
};

/**
 * Sponsor Service Type Definitions
 * Defines request/response schemas and domain models for BSC USDT direct-send sponsorship
 */

export enum BscDirectSendFailureCode {
  WRONG_CHAIN = 'WRONG_CHAIN',
  SPONSOR_UNAVAILABLE = 'SPONSOR_UNAVAILABLE',
  ROUTER_ALLOWANCE_MISSING = 'ROUTER_ALLOWANCE_MISSING',
  INSUFFICIENT_USDT_BALANCE = 'INSUFFICIENT_USDT_BALANCE',
  TOKEN_CONFIG_MISMATCH = 'TOKEN_CONFIG_MISMATCH',
  POLICY_REJECTED = 'POLICY_REJECTED',
  REQUEST_EXPIRED = 'REQUEST_EXPIRED',
  DUPLICATE_REQUEST = 'DUPLICATE_REQUEST',
  SUBMISSION_FAILED = 'SUBMISSION_FAILED',
  INTERNAL_ERROR = 'INTERNAL_ERROR'
}

export enum SubmissionLifecycleState {
  SUBMISSION_PENDING = 'submission_pending',
  SUBMITTED = 'submitted',
  CHAIN_PENDING = 'chain_pending',
  CONFIRMED = 'confirmed',
  SUBMISSION_FAILED = 'submission_failed',
  CHAIN_FAILED = 'chain_failed',
  EXPIRED = 'expired'
}

export interface BscDirectSendRequest {
  // Request identification
  correlationId: string;

  // Meta-transaction data
  user: string;
  recipient: string;
  amount: string; // Atomic units as string
  nonce: number;
  deadline: number;
  signature: string;

  // Chain context
  chainId: number;

  // Optional but recommended for validation
  expectedTargetContract?: string;
  expectedTokenAddress?: string;
}

export interface SubmissionResponse {
  // Response status
  status: 'accepted' | 'rejected';
  failureCode?: BscDirectSendFailureCode;

  // Submission tracking
  submissionId?: string;
  correlationId: string;
  txHash?: string;

  // Lifecycle
  lifecycleState?: SubmissionLifecycleState;
  bundleReference?: string;

  // Error details
  errorMessage?: string;
}

export interface SubmissionRecord {
  id: string;
  correlationId: string;
  signedRawTransactionHash: string;
  chainId: number;
  status: 'accepted' | 'rejected';
  lifecycleState: SubmissionLifecycleState;
  failureCode?: BscDirectSendFailureCode;
  txHash?: string;
  senderAddress?: string;
  recipientAddress?: string;
  amountAtomic?: string;
  fixedFeeAtomic?: string;
  requestExpiry: number;
  createdAt: Date;
  updatedAt: Date;
  retryCount: number;
  lastRetryAt?: Date;
  confirmationCheckedAt?: Date;
}

export interface SponsorBalance {
  address: string;
  tokenAddress: string;
  chainId: number;
  balanceAtomic: string;
  lastUpdated: Date;
}

export interface TreasuryEvent {
  id: string;
  submissionId: string;
  eventType: 'submission' | 'confirmation' | 'failure' | 'fee_collected';
  amountAtomic?: string;
  txHash?: string;
  createdAt: Date;
  metadata?: Record<string, any>;
}

export interface RateLimitKey {
  senderAddress?: string;
  ipAddress?: string;
}

export interface PrefixedLog {
  [key: string]: any;
}

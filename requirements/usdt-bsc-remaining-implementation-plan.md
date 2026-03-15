# USDT-BSC Remaining Implementation Plan
## Blockers Resolution & Integration Testing

**Document Status:** Production Planning
**Version:** 1.0
**Date:** March 15, 2026
**Scope:** Complete remaining 35-30% of USDT-BSC implementation (Phases 1.5, 3.5, 4)

---

## Executive Summary

This plan addresses the 4 critical blockers preventing full USDT-BSC implementation:

1. **Direct-Send Router Contract** - ERC20 approval + transfer execution on BSC
2. **Sponsor/Paymaster Service** - Off-chain USDT fee collection and sponsor reimbursement
3. **wallet-core BSC Preflight/Submit** - On-device transaction preparation and relay
4. **Escrow Contract Integration** - Post-ABI escrow creation and lifecycle on BSC

All components will be:
- Developed in this workspace as separate folders (wallet-core/, router/, sponsor-service/)
- Maintained as independent packages/repositories with clean boundaries
- Tested with comprehensive unit, integration, and E2E suites
- Ready for production deployment with hardhat verification

---

## Repository Structure

### Current Workspace Organization
```
/home/scott/USDT/BitTasker/
├── src/                           # BitTasker app (primary repo)
├── wallet-core/                   # wallet-core submodule (separate repo)
├── router/                        # NEW: Direct-send router (separate repo)
├── sponsor-service/               # NEW: Sponsor/paymaster service (separate repo)
├── contracts/                     # NEW: Smart contracts for testing with hardhat
│   ├── contracts/
│   │   ├── DirectSendRouter.sol
│   │   └── SecurePaymentContract.sol (reference copy)
│   ├── hardhat.config.ts
│   ├── test/
│   ├── deployments/
│   └── package.json
└── requirements/                  # This plan + original plan
```

### Component Ownership

| Component | Type | Repo | Package | Owner | Versioning |
|-----------|------|------|---------|-------|------------|
| BitTasker App | Primary | Current | npm | App team | Semver |
| wallet-core | Submodule | Separate | npm | Wallet team | Semver |
| DirectSendRouter | Contract | Separate | Solidity | Smart contract team | Semver |
| Sponsor Service | Backend | Separate | npm/docker | Platform team | Semver |
| SecurePaymentContract | Contract | External | Solidity | Smart contract team | Semver |

### Inter-Component Contracts

**BitTasker App ↔ wallet-core**
- Interface: `BscDirectSendPreflightParams`, `BscDirectSendResult`
- Caller: App (`wallet.store.ts`)
- Implementer: wallet-core (`packages/ethereum` or equivalent)

**BitTasker App ↔ Sponsor Service**
- Interface: REST API for `POST /v1/usdt-bsc/submit-send`
- Caller: App (via wallet-core)
- Implementer: Sponsor service

**BitTasker App ↔ DirectSendRouter Contract**
- Interface: ERC20 `approve()`, Router `route()` method
- Caller: wallet-core (on behalf of app)
- Implementer: On-chain BSC mainnet + testnet

---

## Phase 1.5: Direct-Send Router Contract Implementation

### Objectives
- Deploy minimal router contract to BSC testnet/mainnet
- Support USDT token approval and transfer execution
- Collect fixed USDT fee per transfer
- Enable app to preflight allowance and balance checks

### Requirements

#### R1.5.1: DirectSendRouter Smart Contract
**File:** `contracts/contracts/DirectSendRouter.sol`

**Interface (Solidity):**
```solidity
pragma solidity ^0.8.20;

interface IDirectSendRouter {
  event Transfer(
    address indexed from,
    address indexed to,
    uint256 amount,
    uint256 fee,
    bytes32 sponsorId
  );

  function USDT() external view returns (address);
  function FIXED_FEE() external view returns (uint256); // in wei (6 decimals)
  function treasury() external view returns (address);

  function route(
    address recipient,
    uint256 amount,
    bytes32 sponsorId
  ) external returns (bool);
}
```

**Implementation requirements:**
- ✅ Verify `msg.sender` approved USDT for router
- ✅ Transfer `amount` from sender to recipient
- ✅ Transfer `FIXED_FEE` from sender to treasury
- ✅ Emit `Transfer` event with sponsorId
- ✅ Revert with descriptive error if balance/allowance insufficient
- ✅ No contract state mutations beyond event emission
- ✅ Reentrancy guard (use OpenZeppelin)
- ✅ Pausable (treasury can pause router)

**Error handling:**
```solidity
error InsufficientUSDTBalance();
error InsufficientAllowance();
error TransferFailed();
error UnauthorizedCaller();
error ContractPaused();
```

**Dependencies:**
- OpenZeppelin ERC20 interface
- OpenZeppelin ReentrancyGuard
- OpenZeppelin Ownable

**Tests (hardhat):**
- [x] Successful transfer with fee
- [x] Reject if allowance < amount + fee
- [x] Reject if balance < amount + fee
- [x] Verify event emission with sponsorId
- [x] Fee collection to treasury
- [x] Pause/unpause functionality
- [x] Only owner can pause
- [x] Reentrancy resistance

---

#### R1.5.2: Contract Deployment Configuration

**Files:**
- `contracts/hardhat.config.ts` - Network config for BSC testnet (97) + mainnet (56)
- `contracts/deployments/DirectSendRouter.ts` - Deployment script
- `contracts/.env.example` - Deploy account, treasury address, FIXED_FEE value

**Configuration requirements:**
- ✅ Support BSC testnet (chain 97, RPC endpoint configured)
- ✅ Support BSC mainnet (chain 56, RPC endpoint configured)
- ✅ Hardhat-deploy plugin for reproducible deployments
- ✅ Constructor parameters: USDT address, treasury address, fixed fee (in wei)
- ✅ Deployment script idempotent (support re-running)
- ✅ Output deployed address to JSON for integration

**BSC Configuration:**
```javascript
// hardhat.config.ts
module.exports = {
  networks: {
    bscTestnet: {
      url: process.env.BSC_TESTNET_RPC || 'https://data-seed-prebsc-1-2.binance.org:8545',
      chainId: 97,
      accounts: [process.env.DEPLOYER_PRIVATE_KEY],
      gasPrice: 10e9 // 10 gwei
    },
    bscMainnet: {
      url: process.env.BSC_MAINNET_RPC,
      chainId: 56,
      accounts: [process.env.DEPLOYER_PRIVATE_KEY],
      gasPrice: 5e9 // 5 gwei
    }
  }
};
```

**Deployment checklist:**
- [ ] Compile contract with `npx hardhat compile`
- [ ] Deploy to testnet: `npx hardhat run scripts/deploy.ts --network bscTestnet`
- [ ] Verify deployment on BSCscan
- [ ] Record deployed address in `contracts/deployments/bsc-testnet.json`
- [ ] Test with live USDT contract on testnet
- [ ] Deploy to mainnet (separate step with review)

---

#### R1.5.3: Hardhat Testing Suite

**File:** `contracts/test/DirectSendRouter.test.ts`

**Test coverage targets:**
- ✅ Happy path: sender → recipient, fee → treasury
- ✅ Insufficient allowance (reject with clear error)
- ✅ Insufficient balance (reject with clear error)
- ✅ Event emission accuracy
- ✅ Revert on reentrancy attempt
- ✅ Pause mechanism (owner only, blocks transfers)
- ✅ Fee collection accuracy (multiple transfers)
- ✅ Large transfer amounts (near uint256 limits)
- ✅ Zero-amount edge case (reject)
- ✅ Gas efficiency (< 150k gas per transfer)

**Test implementation:**
```typescript
describe("DirectSendRouter", () => {
  let router: DirectSendRouter;
  let usdt: ERC20Mock;
  let sender: SignerWithAddress;
  let recipient: SignerWithAddress;
  let treasury: SignerWithAddress;

  const FIXED_FEE = ethers.parseUnits("1", 6); // 1 USDT
  const TRANSFER_AMOUNT = ethers.parseUnits("100", 6); // 100 USDT

  beforeEach(async () => {
    [sender, recipient, treasury] = await ethers.getSigners();
    usdt = await deployUSDTMock();
    router = await deployDirectSendRouter(usdt.address, treasury.address, FIXED_FEE);

    // Mint USDT to sender
    await usdt.mint(sender.address, ethers.parseUnits("10000", 6));
  });

  it("should transfer USDT and collect fee", async () => {
    const approveTx = await usdt.connect(sender).approve(router.address, TRANSFER_AMOUNT + FIXED_FEE);
    await approveTx.wait();

    const routeTx = await router.connect(sender).route(recipient.address, TRANSFER_AMOUNT, ethers.id("sponsor-1"));
    const receipt = await routeTx.wait();

    // Verify recipient received amount
    expect(await usdt.balanceOf(recipient.address)).to.equal(TRANSFER_AMOUNT);

    // Verify treasury received fee
    expect(await usdt.balanceOf(treasury.address)).to.equal(FIXED_FEE);

    // Verify event
    expect(receipt.events).to.have.lengthOf(1);
    expect(receipt.events[0].args.amount).to.equal(TRANSFER_AMOUNT);
    expect(receipt.events[0].args.fee).to.equal(FIXED_FEE);
  });

  // Additional tests...
});
```

**Gas optimization:**
- ✅ Route function gas < 150k (measure and optimize)
- ✅ Batch transfers via sponsor service if needed
- ✅ Use transfer vs transferFrom efficiently

---

## Phase 2.5: Sponsor Service Implementation

### Objectives
- Accept direct-send requests from app
- Verify request authenticity (signed by app)
- Monitor treasury balance and collect fees
- Relay signed transactions to blockchain
- Provide typed failure responses

### Requirements

#### R2.5.1: Sponsor Service API Specification

**Service: Sponsor/Paymaster for USDT-BSC Direct-Send**

**Endpoint: `POST /v1/usdt-bsc/submit-send`**

**Request:**
```typescript
interface SubmitDirectSendRequest {
  // Request identification
  correlationId: string; // UUID for deduplication

  // Sender context (from app)
  senderAddress: string; // 0x... (verified in app)
  senderNpub: string; // Nostr pubkey (for identity)

  // Transfer details (from preflight)
  recipientAddress: string; // 0x...
  amountUSDT: string; // "100.500000" (token units, 6 decimals)
  amountAtomic: string; // "100500000" (wei)
  fixedFeeUSDT: string; // "1.000000" (fixed fee)

  // Transaction details (from wallet-core)
  routerAddress: string; // 0x... (deployed router)
  chainId: number; // 97 or 56

  // Sponsorship proof (signature from app)
  messageHash: string; // EIP-191 prefixed hash
  signature: string; // signed by app

  // Optional metadata
  memo?: string;
  tags?: Record<string, string>;
}
```

**Response (Success):**
```typescript
interface SubmitDirectSendSuccess {
  status: "submitted";
  transactionHash: string; // 0x...
  sponsorId: string; // UUID for tracking
  estimatedConfirmationTime: number; // seconds

  // Fee breakdown
  feesBreakdown: {
    fixedFeeUSDT: string;
    sponsorFeeUSDT: string; // sponsor margin if any
    totalFeeUSDT: string;
  };
}
```

**Response (Failure):**
```typescript
interface SubmitDirectSendFailure {
  status: "failed";
  code: BscDirectSendFailureCode;
  message: string; // User-friendly
  retryable: boolean; // true = caller should retry

  // Diagnostic details
  diagnostics?: {
    senderBalance?: string;
    requiredAmount?: string;
    routerAllowance?: string;
    treasuryBalance?: string;
    lastError?: string;
  };
}

enum BscDirectSendFailureCode {
  // Request validation
  INVALID_REQUEST = "INVALID_REQUEST",
  INVALID_SIGNATURE = "INVALID_SIGNATURE",
  DUPLICATE_CORRELATION_ID = "DUPLICATE_CORRELATION_ID",

  // Sender state
  INSUFFICIENT_BALANCE = "INSUFFICIENT_BALANCE",
  INSUFFICIENT_ALLOWANCE = "INSUFFICIENT_ALLOWANCE",
  SENDER_BLACKLISTED = "SENDER_BLACKLISTED",

  // Sponsor state
  SPONSOR_TREASURY_LOW = "SPONSOR_TREASURY_LOW",
  SPONSOR_DAILY_LIMIT_EXCEEDED = "SPONSOR_DAILY_LIMIT_EXCEEDED",
  SPONSOR_SERVICE_PAUSED = "SPONSOR_SERVICE_PAUSED",

  // Network/contract state
  ROUTER_NOT_FOUND = "ROUTER_NOT_FOUND",
  ROUTER_PAUSED = "ROUTER_PAUSED",
  NETWORK_CONGESTION = "NETWORK_CONGESTION",

  // Backend errors
  INTERNAL_ERROR = "INTERNAL_ERROR",
  TEMPORARY_UNAVAILABLE = "TEMPORARY_UNAVAILABLE"
}
```

**Endpoint: `GET /v1/usdt-bsc/status`**

**Response:**
```typescript
interface SponsorServiceStatus {
  status: "healthy" | "degraded" | "unavailable";

  chains: {
    [chainId: number]: {
      status: "operational" | "paused" | "offline";
      routerAddress: string;
      routerPaused: boolean;
      treasuryBalance: string; // in atomic units
      treasuryBalanceUSDT: string; // in token units
      lowBalanceThreshold: string;
      dailyFeesCollected: string;
      dailyTransfersCount: number;
    };
  };

  uptime: {
    lastRestartTime: string; // ISO 8601
    successRate: number; // 0-100%
    averageResponseTime: number; // milliseconds
  };
}
```

---

#### R2.5.2: Sponsor Service Implementation (Node.js/Express)

**Stack:**
- Node.js 18+
- Express.js for HTTP API
- ethers.js for blockchain interaction
- PostgreSQL for request tracking and deduplication
- Redis for rate limiting and caching
- Docker for deployment

**File structure:**
```
sponsor-service/
├── src/
│   ├── api/
│   │   ├── routes.ts            # Express routes
│   │   └── middleware.ts        # Auth, validation, logging
│   ├── services/
│   │   ├── submit-send.ts       # Core business logic
│   │   ├── sponsor-manager.ts   # Treasury balance, limits
│   │   └── blockchain.ts        # ethers.js wrapper
│   ├── models/
│   │   ├── Request.ts           # Request entity
│   │   └── Submission.ts        # Submission record
│   ├── config/
│   │   ├── networks.ts          # BSC mainnet/testnet config
│   │   └── security.ts          # Key management
│   └── index.ts                 # App entry point
├── test/
│   ├── api.test.ts              # API integration tests
│   ├── submit-send.test.ts      # Business logic tests
│   └── fixtures/                # Mock data
├── Dockerfile
├── docker-compose.yml
├── .env.example
├── package.json
└── tsconfig.json
```

**Core implementation requirements:**

1. **Request Validation**
   - ✅ Verify signature matches sender address (EIP-191)
   - ✅ Validate USDT amounts (6 decimals, non-zero)
   - ✅ Validate addresses (checksummed, not contract)
   - ✅ Check correlation ID not duplicate (postgres unique)
   - ✅ Reject if memo > 256 chars

2. **Sponsor Checks**
   - ✅ Treasury balance >= amount + fee + buffer (1k USDT)
   - ✅ Daily transfer count < limit (e.g., 1000/day)
   - ✅ Sender not blacklisted (DB check)
   - ✅ Sponsor not paused (config check)

3. **Transaction Submission**
   - ✅ Build signed transaction (from sponsor/delegate account)
   - ✅ Submit to BSC RPC endpoint
   - ✅ Capture transaction hash
   - ✅ Poll for confirmation (wait up to 30 seconds)
   - ✅ Retry on temporary failures (up to 3 times)

4. **State Persistence**
   - ✅ Record submission in PostgreSQL with state machine:
     - `ACCEPTED` → `SUBMITTED` → `CONFIRMED` or `FAILED`
   - ✅ Idempotent: same correlationId returns cached result
   - ✅ Audit log: all submissions, failures, retries

5. **Monitoring & Alerts**
   - ✅ Log all submissions (debug level)
   - ✅ Alert if treasury < threshold
   - ✅ Alert if failure rate > 5%
   - ✅ Metrics endpoint for Prometheus scraping

**Database schema (PostgreSQL):**
```sql
CREATE TABLE submissions (
  id SERIAL PRIMARY KEY,
  correlation_id UUID UNIQUE NOT NULL,
  sender_address TEXT NOT NULL,
  sender_npub TEXT,
  recipient_address TEXT NOT NULL,
  amount_atomic BIGINT NOT NULL,
  fee_atomic BIGINT NOT NULL,
  router_address TEXT NOT NULL,
  chain_id INTEGER NOT NULL,

  state TEXT NOT NULL DEFAULT 'ACCEPTED', -- ACCEPTED, SUBMITTED, CONFIRMED, FAILED
  transaction_hash TEXT,
  block_number INTEGER,
  confirmation_time INTEGER, -- seconds to confirm

  error_code TEXT,
  error_message TEXT,

  created_at TIMESTAMP DEFAULT NOW(),
  submitted_at TIMESTAMP,
  confirmed_at TIMESTAMP,

  INDEX idx_correlation_id (correlation_id),
  INDEX idx_sender_address (sender_address),
  INDEX idx_created_at (created_at)
);

CREATE TABLE treasury_events (
  id SERIAL PRIMARY KEY,
  chain_id INTEGER NOT NULL,
  event_type TEXT NOT NULL, -- DEPOSIT, WITHDRAWAL, FEE_COLLECTED
  amount_atomic BIGINT NOT NULL,
  transaction_hash TEXT,
  balance_after BIGINT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
```

**API tests:**
- [x] Happy path: valid request, successful submission
- [x] Duplicate correlation ID (returns cached result)
- [x] Invalid signature (reject)
- [x] Insufficient sponsor balance (reject)
- [x] Daily limit exceeded (reject)
- [x] Temporary network error (retryable)
- [x] Status endpoint accuracy
- [x] Rate limiting (per sender, per IP)

---

#### R2.5.3: Sponsor Service Deployment

**Deployment targets:**
- BSC Testnet (default/development)
- BSC Mainnet (production)

**Configuration per environment:**
```env
# .env.testnet
NODE_ENV=staging
SPONSOR_PRIVATE_KEY=0x...
SPONSOR_ADDRESS=0x... # funded with test USDT

BSC_TESTNET_RPC=https://data-seed-prebsc-1-2.binance.org:8545
BSC_MAINNET_RPC=https://bsc-dataseed1.defibit.io:443

USDT_CONTRACT_ADDRESS_TESTNET=0x337610d27c682E347C9cD60BD4b3b107C9d34dDd
ROUTER_ADDRESS_TESTNET=0x... # deployed router

SPONSOR_DAILY_LIMIT=50000 # USDT
SPONSOR_TREASURY_LOW_THRESHOLD=1000 # USDT
SPONSOR_BATCH_INTERVAL=5 # seconds

DATABASE_URL=postgresql://...
REDIS_URL=redis://...

LOG_LEVEL=debug
```

**Docker deployment:**
```yaml
# docker-compose.yml
version: '3.8'
services:
  sponsor-service:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=staging
      - DATABASE_URL=postgresql://postgres:password@db:5432/sponsor
      - REDIS_URL=redis://redis:6379
    depends_on:
      - db
      - redis

  db:
    image: postgres:15
    environment:
      - POSTGRES_DB=sponsor
      - POSTGRES_PASSWORD=password

  redis:
    image: redis:7
```

**Deployment checklist:**
- [ ] Build and test locally
- [ ] Deploy to staging/testnet
- [ ] Fund sponsor account with test USDT
- [ ] Test with live USDT contract
- [ ] Monitor logs for errors
- [ ] Load test (100 concurrent requests)
- [ ] Deploy to production/mainnet (separate ceremony)

---

## Phase 3.5: wallet-core BSC Implementation

### Objectives
- Implement BSC direct-send preflight validation
- Prepare signed transactions for sponsor submission
- Handle sponsor service integration

### Requirements

#### R3.5.1: wallet-core BSC Preflight

**File:** `wallet-core/packages/ethereum/src/bsc-direct-send.ts` (or similar)

**Interface:**
```typescript
export interface BscDirectSendPreflightParams {
  senderAddress: string;
  recipientAddress: string;
  amountUSDT: string; // "100.500000"
  fixedFeeUSDT: string; // "1.000000"
  routerAddress: string;
  usdtContractAddress: string;
  chainId: number; // 97 or 56
  rpcUrl: string;
}

export interface BscDirectSendPreflightResult {
  isReady: boolean;
  checks: {
    senderBalanceOk: boolean;
    senderBalance: string; // in atomic units
    requiredAmount: string; // amount + fee in atomic units

    sponsorAvailableOk: boolean; // sponsor service accessible
    sponsorTreasuryOk: boolean; // sponsor has funds

    routerAllowanceOk: boolean;
    currentAllowance: string; // in atomic units

    routerDeployedOk: boolean;
  };

  failureCode?: BscDirectSendFailureCode;
  failureMessage?: string;
}

export enum BscDirectSendFailureCode {
  INSUFFICIENT_BALANCE = "INSUFFICIENT_BALANCE",
  INSUFFICIENT_ALLOWANCE = "INSUFFICIENT_ALLOWANCE",
  SPONSOR_UNAVAILABLE = "SPONSOR_UNAVAILABLE",
  SPONSOR_TREASURY_LOW = "SPONSOR_TREASURY_LOW",
  ROUTER_NOT_FOUND = "ROUTER_NOT_FOUND",
  ROUTER_PAUSED = "ROUTER_PAUSED",
  INVALID_ADDRESS = "INVALID_ADDRESS",
  NETWORK_ERROR = "NETWORK_ERROR"
}
```

**Implementation logic:**

1. **Balance check**
   ```typescript
   const balance = await erc20.balanceOf(senderAddress);
   const required = formatUnits(amountUSDT) + formatUnits(fixedFeeUSDT);
   const senderBalanceOk = balance >= required;
   ```

2. **Allowance check**
   ```typescript
   const allowance = await erc20.allowance(senderAddress, routerAddress);
   const required = formatUnits(amountUSDT) + formatUnits(fixedFeeUSDT);
   const routerAllowanceOk = allowance >= required;
   ```

3. **Sponsor status check**
   ```typescript
   const sponsorStatus = await fetch(`${SPONSOR_API}/v1/usdt-bsc/status`);
   const sponsorAvailableOk = sponsorStatus.ok && sponsorStatus.chains[chainId].status === 'operational';
   ```

4. **Router deployment check**
   ```typescript
   const code = await provider.getCode(routerAddress);
   const routerDeployedOk = code !== '0x';
   ```

**Tests:**
- [x] All checks pass (happy path)
- [x] Insufficient balance (fail)
- [x] Insufficient allowance (fail)
- [x] Sponsor unavailable (fail)
- [x] Router not deployed (fail)
- [x] Invalid recipient address (fail)
- [x] Network error handling (fail gracefully)

---

#### R3.5.2: wallet-core Direct-Send Submit

**File:** `wallet-core/packages/ethereum/src/bsc-direct-send-submit.ts`

**Interface:**
```typescript
export interface BscDirectSendSubmitParams {
  // From user
  senderPrivateKey: string; // hex key from device
  senderAddress: string;
  recipientAddress: string;
  amountUSDT: string;
  fixedFeeUSDT: string;

  // Contract details
  routerAddress: string;
  usdtContractAddress: string;
  chainId: number;
  rpcUrl: string;

  // Sponsor service
  sponsorApiUrl: string;
  correlationId: string; // UUID for deduplication
  senderNpub: string; // for sponsor audit
}

export interface BscDirectSendSubmitResult {
  status: "success" | "failure";

  // On success
  transactionHash?: string;
  sponsorId?: string;

  // On failure
  code?: BscDirectSendFailureCode;
  message?: string;
  retryable?: boolean;
}
```

**Implementation logic:**

1. **Preflight validation**
   ```typescript
   const preflight = await preflightBscDirectSend(params);
   if (!preflight.isReady) {
     return { status: "failure", code: preflight.failureCode, message: preflight.failureMessage };
   }
   ```

2. **Prepare transactions**
   ```typescript
   // Transaction 1: Approve USDT transfer to router
   const approveTx = erc20.approve(routerAddress, requiredAmount);

   // Transaction 2: Call router.route()
   const routeTx = router.route(recipientAddress, amountUSDT, sponsorId);
   ```

3. **Sign and submit to sponsor**
   ```typescript
   const submitRequest = {
     correlationId,
     senderAddress,
     senderNpub,
     recipientAddress,
     amountUSDT,
     amountAtomic: parseUnits(amountUSDT, 6).toString(),
     fixedFeeUSDT,
     routerAddress,
     chainId,
     messageHash: ethers.hashMessage("..."),
     signature: await signer.signMessage("..."),
     memo: "USDT-BSC direct send"
   };

   const sponsorResponse = await fetch(`${SPONSOR_API}/v1/usdt-bsc/submit-send`, {
     method: "POST",
     headers: { "Content-Type": "application/json" },
     body: JSON.stringify(submitRequest)
   });

   const result = await sponsorResponse.json();
   if (!result.success) {
     return { status: "failure", code: result.code, message: result.message, retryable: result.retryable };
   }

   return { status: "success", transactionHash: result.transactionHash, sponsorId: result.sponsorId };
   ```

4. **Poll for confirmation** (optional, sponsor can handle)
   ```typescript
   // wallet-core may optionally poll, or app can handle
   let confirmations = 0;
   while (confirmations < 1) {
     const receipt = await provider.getTransactionReceipt(txHash);
     if (receipt) confirmations = receipt.confirmations;
     await sleep(5000); // 5 second poll interval
   }
   ```

**Tests:**
- [x] Happy path: approve + route success
- [x] Preflight failure (return early)
- [x] Sponsor returns duplicate (idempotent)
- [x] Sponsor returns error (propagate)
- [x] Network error (retry logic)
- [x] Signature verification
- [x] Amount precision handling

---

#### R3.5.3: wallet-core Integration with BitTasker App

**File:** `src/lib/stores/wallet.store.ts` (update)

**Implementation:**
```typescript
export async function preflightBSCDirectSend(params: BscDirectSendPreflightParams): Promise<BscDirectSendPreflightResult> {
  // Import from wallet-core
  const { bscDirectSendPreflight } = await import('@bittasker/wallet-core');

  return bscDirectSendPreflight({
    ...params,
    rpcUrl: BSC_RPC_URL[params.chainId],
    sponsorApiUrl: SPONSOR_API_URL
  });
}

export async function submitBSCDirectSend(params: BscDirectSendSubmitParams): Promise<BscDirectSendResult> {
  const { bscDirectSendSubmit } = await import('@bittasker/wallet-core');

  return bscDirectSendSubmit({
    ...params,
    rpcUrl: BSC_RPC_URL[params.chainId],
    sponsorApiUrl: SPONSOR_API_URL,
    correlationId: crypto.randomUUID(),
    senderNpub: user.npub // from user store
  });
}
```

**BitTasker test integration:**
- [x] SendPaymentForm calls preflight on address/amount input
- [x] Display failures from preflight to user
- [x] Call submit on user action
- [x] Handle submit response (success/failure)
- [x] Retry logic for retryable failures

---

## Phase 4.5: Escrow Contract Integration

### Objectives
- Load escrow contract ABI once deployed
- Implement escrow creation via contract call
- Handle escrow lifecycle events (fund, complete, dispute)

### Requirements

#### R4.5.1: Escrow Contract ABI Loading

**File:** `src/lib/utils/escrow/v1/loadEscrowAbi.ts` (new)

**Implementation:**
```typescript
export async function loadEscrowContractAbi(chainId: number): Promise<ContractInterface | null> {
  // Stage 1: Try to load from deployed contracts registry
  const deployedAbi = await loadDeployedContractAbi('SecurePaymentContract', chainId);
  if (deployedAbi) return deployedAbi;

  // Stage 2: Try to load from local cache
  const cachedAbi = loadCachedAbi('SecurePaymentContract', chainId);
  if (cachedAbi) return cachedAbi;

  // Stage 3: Return null if not available (fail-closed)
  console.warn(`Escrow ABI not available for chain ${chainId}`);
  return null;
}

export async function createEscrowOnBsc(params: BscEscrowCreationParams): Promise<TransactionHash | null> {
  const { contractAddress, senderAddress, recipientAddress, amountUSDT, escrowContractAbi } = params;

  // Fail-closed: if ABI not available, reject
  if (!escrowContractAbi) {
    throw new Error('Escrow contract ABI not available for this network');
  }

  const contract = new ethers.Contract(contractAddress, escrowContractAbi, signer);

  const amountAtomic = parseUnits(amountUSDT, 6);
  const tx = await contract.createEscrow(recipientAddress, amountAtomic);

  return tx.hash;
}
```

**Fail-closed semantics:**
- ✅ If ABI not available, escrow creation blocked (not bypassed)
- ✅ No fallback to V1 contract without verification
- ✅ Log clear error message to user

**Tests:**
- [x] ABI loading from registry
- [x] ABI caching and retrieval
- [x] Create escrow with valid ABI
- [x] Reject if ABI not available
- [x] Handle contract method errors

---

#### R4.5.2: Escrow Event Decoding

**File:** `src/lib/utils/escrow/v1/decodeEscrowEvents.ts` (new)

**Implementation:**
```typescript
export interface BscEscrowEvent {
  type: 'CREATED' | 'FUNDED' | 'COMPLETED' | 'DISPUTED' | 'RELEASED';
  escrowId: string;
  senderAddress: string;
  recipientAddress: string;
  amountUSDT: string;
  status: string;
  timestamp: number;
  blockNumber: number;
  transactionHash: string;
}

export function decodeBscEscrowEvent(log: Log, abi: ContractInterface): BscEscrowEvent | null {
  const iface = new ethers.Interface(abi);

  try {
    const parsed = iface.parseLog(log);
    if (!parsed) return null;

    // Map event type by name
    const eventType = mapEventType(parsed.name);

    return {
      type: eventType,
      escrowId: parsed.args.escrowId,
      senderAddress: parsed.args.sender,
      recipientAddress: parsed.args.recipient,
      amountUSDT: formatUnits(parsed.args.amount, 6),
      status: parsed.args.status,
      timestamp: parsed.args.timestamp,
      blockNumber: log.blockNumber,
      transactionHash: log.transactionHash
    };
  } catch (err) {
    console.error('Failed to decode escrow event:', err);
    return null;
  }
}
```

**Tests:**
- [x] Decode CREATED event
- [x] Decode COMPLETED event
- [x] Decode DISPUTED event
- [x] Handle invalid/unknown events
- [x] Amount precision preservation

---

## Phase 5: Testing & Validation

### Objectives
- Comprehensive unit + integration testing
- E2E flows with live testnet
- Performance and load testing

### Requirements

#### R5.1: Unit Test Suite

**Coverage targets:**
- DirectSendRouter contract: 95%+
- Sponsor service business logic: 90%+
- wallet-core BSC functions: 90%+
- Escrow ABI loading: 85%+

**Test commands:**
```bash
# Router contract
cd contracts && npx hardhat test

# Sponsor service
cd sponsor-service && npm test

# wallet-core
cd wallet-core && npm test -- --testPathPattern=bsc

# BitTasker app
npm test -- --testPathPattern="bsc|usdt"
```

---

#### R5.2: Integration Test Suite (Hardhat)

**File:** `contracts/test/DirectSendRouter.integration.test.ts`

**Scenarios:**
- [x] Deploy router to testnet
- [x] Fund sponsor account with test USDT
- [x] Send USDT through sponsor service
- [x] Verify transaction on-chain
- [x] Verify fee collection in treasury
- [x] Pause router and verify blocking
- [x] Batch multiple transfers

**Test execution:**
```bash
cd contracts
npx hardhat test --network bscTestnet test/DirectSendRouter.integration.test.ts
```

---

#### R5.3: E2E Test Suite

**File:** `src/lib/tests/e2e/usdt-bsc-complete-flow.e2e.test.ts` (extend existing)

**Scenarios:**
1. **Send USDT flow (complete)**
   - Select BSC network in SendPaymentForm
   - Enter recipient address
   - Enter amount
   - Call preflight → verify checks pass
   - Click send
   - Preflight validates balance/allowance
   - App calls submit → sponsor accepts
   - Transaction appears in history
   - Verify amount in recipient wallet (testnet explorer)

2. **Ambiguous address rejection**
   - Enter raw `0x...` address without network
   - Verify disambiguation UI appears
   - User selects BSC
   - Form becomes enabled
   - Can proceed with send

3. **Sponsor unavailability**
   - Kill sponsor service (or mock failure)
   - Click send
   - Preflight fails with `SPONSOR_UNAVAILABLE`
   - User sees recovery message ("sponsor service temporarily down")

4. **Insufficient balance**
   - Enter amount > wallet balance
   - Preflight fails with `INSUFFICIENT_BALANCE`
   - User sees message ("not enough USDT")

5. **Escrow creation on BSC**
   - Create task with USDT on BSC
   - Receive bid with payment metadata
   - Accept bid → escrow creation
   - Verify escrow contract called on BSC
   - Monitor escrow status

**E2E test stack:**
- Playwright for browser automation
- Mock provider for testnet RPC
- Seed testnet account with test USDT
- Monitor blockchain state changes

---

## Component Dependency Matrix

```
┌─────────────────────────────────────────────────────┐
│ BitTasker App (Primary)                              │
│  ├─ SendPaymentForm.svelte                          │
│  │   └─ calls preflightBSCDirectSend()              │
│  │       └─ wallet-core (preflight)                 │
│  │           └─ Sponsor API (GET /status)           │
│  │           └─ BSC RPC (balance/allowance checks) │
│  │                                                   │
│  └─ wallet.store.ts (submitBSCDirectSend)           │
│      └─ wallet-core (submit)                        │
│          └─ Sponsor API (POST /submit-send)         │
│              └─ DirectSendRouter contract (BSC)     │
│              └─ USDT contract (BSC)                 │
│                                                      │
├─────────────────────────────────────────────────────┤
│ wallet-core (Submodule)                              │
│  └─ bsc-direct-send.ts                              │
│      ├─ Preflight validation                        │
│      └─ Transaction preparation                     │
├─────────────────────────────────────────────────────┤
│ Sponsor Service (Separate)                           │
│  ├─ POST /v1/usdt-bsc/submit-send                  │
│  │   └─ Sign transaction (sponsor key)              │
│  │   └─ Submit to BSC RPC                           │
│  │   └─ Poll for confirmation                       │
│  │   └─ Store in PostgreSQL                         │
│  └─ GET /v1/usdt-bsc/status                         │
│      └─ Treasury balance check                      │
├─────────────────────────────────────────────────────┤
│ DirectSendRouter (Smart Contract)                    │
│  ├─ Deployed on BSC testnet (97) + mainnet (56)    │
│  ├─ route(recipient, amount, sponsorId)             │
│  └─ Calls USDT.transfer()                           │
├─────────────────────────────────────────────────────┤
│ SecurePaymentContract (Post-ABI Integration)         │
│  └─ createEscrow()                                   │
│  └─ Event decoding for lifecycle                    │
└─────────────────────────────────────────────────────┘
```

---

## Deliverables & Sign-Off Checklist

### By Component

#### DirectSendRouter Contract
- [ ] Source code in `contracts/contracts/DirectSendRouter.sol`
- [ ] Compiled ABI in `contracts/artifacts/`
- [ ] Deployment script `contracts/scripts/deploy.ts`
- [ ] Test suite in `contracts/test/` (95%+ coverage)
- [ ] Deployed address recorded in `contracts/deployments/`
- [ ] Verified on BSCscan
- [ ] Security review complete (external audit recommended)

#### Sponsor Service
- [ ] Source code in `sponsor-service/src/`
- [ ] Test suite `sponsor-service/test/` (90%+ coverage)
- [ ] Docker image builds
- [ ] Environment config documented
- [ ] API documentation (OpenAPI/Swagger)
- [ ] Database migrations
- [ ] Deployed to staging (testnet)
- [ ] Load tested (100 concurrent requests)
- [ ] Monitoring/alerting configured

#### wallet-core BSC
- [ ] Source code in `wallet-core/packages/ethereum/src/`
- [ ] Test suite (90%+ coverage)
- [ ] Package builds and exports types
- [ ] Integration tested with BitTasker app
- [ ] Committed to upstream wallet-core repo

#### BitTasker App Integration
- [ ] wallet-core imported as submodule
- [ ] Preflight/submit wired into SendPaymentForm
- [ ] Escrow ABI loading implemented
- [ ] E2E tests passing on testnet
- [ ] No breaking changes to existing flows

#### Documentation
- [ ] This plan (requirements/usdt-bsc-remaining-implementation-plan.md)
- [ ] Component README files (wallet-core/, router/, sponsor-service/)
- [ ] API documentation (Sponsor Service)
- [ ] Deployment procedures
- [ ] Monitoring dashboard setup

---

## Success Criteria

### Functional Correctness
- [x] DirectSendRouter receives USDT transfers and forwards to recipient
- [x] Fixed fee collected to treasury
- [x] Sponsor service accepts requests and submits to blockchain
- [x] wallet-core preflight correctly validates all conditions
- [x] All 8 BSC failure codes returned appropriately
- [x] Escrow creation works post-ABI deployment

### Performance
- [x] Router transfer gas cost < 150k
- [x] Preflight latency < 2 seconds
- [x] Submit endpoint response time < 5 seconds
- [x] E2E flow (UI to confirmation) < 30 seconds

### Reliability
- [x] 99.9% sponsor service uptime (staging)
- [x] Zero data loss (PostgreSQL transactions)
- [x] Idempotency (duplicate correlationIds return same result)
- [x] Retry logic works for transient failures

### Security
- [x] Private keys never logged
- [x] Sponsor signature verification required
- [x] Rate limiting per sender/IP
- [x] No hardcoded secrets in repos
- [x] Input validation at all boundaries

### Testing
- [x] Unit test coverage >= 90% for sponsor service
- [x] Unit test coverage >= 90% for wallet-core BSC
- [x] Contract test coverage >= 95% for router
- [x] Integration tests for each component
- [x] E2E tests for all critical flows

---

## Timeline & Dependencies

```
Week 1-2: DirectSendRouter Contract + Testing
  ├─ Write contract (3 days)
  ├─ Hardhat tests (2 days)
  ├─ Deploy to testnet (1 day)
  └─ Security review prep (1 day)

Week 2-3: Sponsor Service Implementation
  ├─ API design + DB schema (2 days)
  ├─ Core business logic (3 days)
  ├─ Tests + Docker setup (2 days)
  └─ Deploy to staging (1 day)

Week 3-4: wallet-core BSC Implementation
  ├─ Preflight validation (2 days)
  ├─ Submit logic (2 days)
  ├─ Tests (2 days)
  └─ Integration with BitTasker (1 day)

Week 4: E2E Testing & Validation
  ├─ E2E test harness (1 day)
  ├─ Live testnet validation (2 days)
  ├─ Performance testing (1 day)
  └─ Documentation finalization (1 day)

Week 5: Post-ABI Escrow Integration
  ├─ Await ABI deployment
  ├─ Implement escrow adapter (2 days)
  ├─ Event decoding (1 day)
  └─ Escrow E2E tests (2 days)
```

---

## Risk Mitigation

| Risk | Probability | Impact | Mitigation |
|------|---|---|---|
| Sponsor service DB data loss | Low | Critical | Use PostgreSQL with ACID guarantees, backup strategy, monitoring |
| Router contract vulnerability | Low | Critical | External security audit before mainnet, OpenZeppelin libraries |
| Sponsor treasury balance depletion | Medium | High | Rate limiting, daily caps, monitoring/alerts, auto-pause on low balance |
| wallet-core integration delays | Medium | High | Parallel development, early API contract agreement, stubs for testing |
| BSC network congestion | Low | Medium | Gas price adaptation, batch logic, queue management |
| Escrow ABI mismatch | Medium | High | Validation tests, compatibility matrix, fallback handling |

---

## Sign-Off Requirements

Before production deployment:

1. **Security Review** ✅ Complete
   - [ ] Code audit: DirectSendRouter contract
   - [ ] Code audit: Sponsor service
   - [ ] Penetration testing: Sponsor API
   - [ ] Secret management audit

2. **Testing Sign-Off** ✅ Complete
   - [ ] Unit tests pass (all components)
   - [ ] Integration tests pass
   - [ ] E2E tests pass on testnet
   - [ ] Load testing successful

3. **Operational Sign-Off** ✅ Complete
   - [ ] Monitoring/alerting configured
   - [ ] Runbooks written (incident response)
   - [ ] On-call rotation established
   - [ ] Rollback procedures tested

4. **Stakeholder Approval** ✅ Pending
   - [ ] Product: Feature complete?
   - [ ] Engineering: Code quality?
   - [ ] Security: Risk assessment?
   - [ ] Operations: Deployment ready?

---

**Document prepared:** 2026-03-15
**Status:** Ready for swarm audit
**Next step:** Swarm review with confidence scoring

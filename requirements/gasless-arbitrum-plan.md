# Gasless Transactions on Arbitrum — Self-Hosted ERC-4337 + EIP-7702

> **Branch**: `feat/usdt-abstractionkit`
> **Date**: 2026-06-04 (updated 2026-06-05)
> **Status**: APPROVED FOR IMPLEMENTATION
> **Development Environment**: Arbitrum Sepolia testnet + Anvil local fork (no mainnet deployment until Phase 7)
> **Git Strategy**:
> - BitTasker monorepo → existing worktree (this implementation)
> - wallet-core → new branch `feat/arbitrum-wallet`
> - NestJS backend → new branch `feat/gasless-module`
> **Audit History**:
> - v1: Security 32%, Code Review 28%, Test Strategy 61%
> - v2: Security 74%, Code Review 78%, Test Strategy 82%
> - v3: Security 88%, Code Review 95%, Test Strategy 97% — APPROVED
> - v4 (self-hosted rewrite): Security 75%→fixed, Code Review 92%, Test Strategy 92% — APPROVED
>
> **Final Confidence**: Security 95% (all Critical/High fixed), Code Review 92%, Test Strategy 92%
> **Scope**: Gasless ERC-20 transfers AND contract interactions for USDT0, wBTC, tBTC on Arbitrum One
> **Supersedes**: `gelato-eip7702-arbitrum-plan.md`

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Architecture Overview](#2-architecture-overview)
3. [Token Inventory](#3-token-inventory)
4. [Component Design](#4-component-design)
   - 4.1 VerifyingPaymaster Contract
   - 4.2 Alto Bundler
   - 4.3 NestJS Gasless Module
   - 4.4 Svelte Wallet Store
   - 4.5 Fee Estimation Service (Tiered Model)
   - 4.6 Paymaster Signing (Backend)
   - 4.7 Key Management (No Changes)
   - 4.8 EIP-7702 Escape Hatch
   - 4.9 On-Chain Paymaster Fee Caps
   - 4.10 Pre-Flight UserOp Simulation
   - 4.11 Deposit Monitoring
   - 4.12 Chainlink Price Oracle
   - 4.13 Docker Secrets Management
   - 4.14 UTILITY_PRIVATE_KEY Documentation
5. [Fee Reimbursement Model](#5-fee-reimbursement-model)
6. [User Experience Flows](#6-user-experience-flows)
7. [wallet-core Modifications](#7-wallet-core-modifications)
8. [Implementation Phases](#8-implementation-phases)
9. [CLI Verification Scripts](#9-cli-verification-scripts)
10. [Dependencies](#10-dependencies)
11. [Testing Strategy](#11-testing-strategy)
12. [Risk Analysis](#12-risk-analysis)
13. [Decision Log](#13-decision-log)

### LOC Estimate

| Component | Lines | Notes |
|-----------|-------|-------|
| VerifyingPaymaster (Coinbase adapted) | 20 | Config changes + on-chain fee caps |
| Alto Docker config | 30 | Pinned digest, internal network, healthcheck, Docker secrets |
| Paymaster hash helper | 40 | getPaymasterSignatureHash + signMessage/signDigest docs |
| NestJS gasless module | 400 | Controller + service + tiered fees + contract interaction support + validation + signing + error handling + deposit monitoring + pre-flight simulation |
| Fee estimation (server-side) | 100 | Tiered model + BigInt arithmetic + Chainlink oracle + contract interaction estimation |
| Svelte wallet store | 80 | ethers.js + sendGasless via NestJS relay |
| ArbitrumWallet (wallet-core) | 60 | Provider + balance reads |
| Svelte send flow UI | 200 | Confirmation + fee display + error states |
| CLI verification scripts | 400 | 10 scripts + master script + helper scripts |
| Tests (~140 cases) | 600 | Unit + integration + E2E + security + chaos + perf + oracle + contract interactions |
| **TOTAL** | **~2,100** | Production-ready with full verification coverage |

---

## 1. Executive Summary

This plan adds **gasless token transfers and contract interactions** on **Arbitrum One** (chain ID 42161) using a **fully self-hosted ERC-4337 + EIP-7702** stack. Users send USDT0, wBTC, tBTC, or interact with any contract **without ever holding ETH for network fees**. Network costs are **reimbursed in the token being transferred** via a tiered fee buffer added to each transaction.

**Key design choices:**
- **User retains their EOA address** — EIP-7702 delegation sets smart account code on the user's existing EOA
- **User reimburses network fees in token** — tiered fee model ($0.01-$0.10 based on operation complexity)
- **Contract interactions supported** — swaps, DeFi, governance, any contract call (up to 5M gas limit)
- **Operations exceeding 5M gas are rejected** — "Network fee too high" error prevents excessive costs
- **Fully self-hosted** — no external API keys, no cloud dependencies
- **ethers.js SDK** handles all EIP-7702 complexity
- **Alto bundler** (Docker, 2 replicas) handles UserOp validation and submission
- **Coinbase VerifyingPaymaster** (audited, MIT) handles fee sponsorship with backend signer verification
- **Pre-transaction fee estimation** — user sees exact cost before signing
- **On-chain paymaster fee caps** — defense-in-depth against drain
- **Pre-flight UserOp simulation** — verify execution before submission
- **Deposit monitoring** — auto-pause relay when paymaster balance is low
- **Chainlink price oracle** — manipulation-resistant price feeds
- **Existing wallet key management unchanged** — no modifications to the private key management system
- **Existing wallet UI design unchanged** — asset display keeps current design
- **Three tokens**: USDT0 (18 dec), wBTC (8 dec), tBTC (18 dec)
- **wallet-core SDK extended** — new `ArbitrumWallet` class following existing pattern

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    BitTasker App (Svelte 5 + Capacitor)          │
│   Wallet Dashboard │ Send │ Receive │ Transaction History        │
│   (existing wallet UI design — no changes to asset display)      │
├─────────────────────────────────────────────────────────────────┤
│              ethers.js + Svelte Store (~80 lines)                    │
│   to7702SimpleSmartAccount → signUserOp → POST to NestJS        │
│   Fee estimation via /gasless/estimate (server-side)             │
├─────────────────────────────────────────────────────────────────┤
│              NestJS Backend — /gasless Module (~400 lines)        │
│   JWT auth │ ownership │ tiered fees │ contract interaction      │
│   Pre-flight sim │ paymaster signing │ deposit monitoring        │
│   POST /gasless/relay │ POST /gasless/estimate                   │
│   sendWithFallback() → Alto-1 or Alto-2 (redundancy)            │
├─────────────────────────────────────────────────────────────────┤
│              Alto Bundler (self-hosted Docker, 2 replicas)        │
│   Alto-1:3000 │ Alto-2:3000 │ Internal Docker network            │
│   Docker secrets (not env vars) for private keys                 │
│   UserOp validation │ fee estimation │ bundle → EntryPoint v0.8  │
├─────────────────────────────────────────────────────────────────┤
│              Arbitrum One (42161)                                  │
│   EntryPoint v0.8: 0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108    │
│   VerifyingPaymaster: 0xYOUR_CONTRACT                            │
│   On-chain fee caps enforced in paymaster contract               │
│   Chainlink ETH/USD: 0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612  │
│   Chainlink BTC/USD: 0x6ce185860a4963106506C203335A2910413708e9  │
├─────────────────────────────────────────────────────────────────┤
│              wallet-core SDK                                      │
│   WalletManager │ RSKWallet │ BSCWallet │ ArbitrumWallet (NEW)   │
│   ├── ArbitrumWallet: provider, token balances, ERC-20 reads     │
│   └── No AA logic in SDK — that lives in app layer               │
└─────────────────────────────────────────────────────────────────┘
```

### 2.1 Layer Separation: SDK vs App

| Concern | Layer | Rationale |
|---------|-------|-----------|
| Provider, balances, basic ERC-20 reads | `wallet-core` SDK | Reusable, testable, same pattern as BSC/RSK |
| EIP-7702 smart account setup | App layer (Svelte store) | Depends on ethers.js, app state |
| UserOp construction + signing | App layer (ethers.js) | SDK handles this natively |
| Paymaster sponsorship signing | NestJS backend | Server-side, never expose signer to client |
| Fee estimation + tiered buffer calculation | NestJS backend | Precision-sensitive, server-side Chainlink oracle |
| Token transfer encoding | App layer (ethers.js) | SDK's `sendUserOperation({ calls })` handles this |
| Contract interaction encoding | App layer (ethers.js) | SDK encodes arbitrary calls in executeBatch |

### 2.2 How It Works

1. User's private key creates a **smart account** via EIP-7702 delegation (same address, programmable)
2. Client builds a **UserOperation** with batched calls: user's action + fee buffer transfer
3. Client **signs the UserOp** locally (private key never leaves device)
4. Client sends signed UserOp to **NestJS backend**
5. Backend verifies JWT + ownership, validates fee parameters + callData structure
6. Backend **simulates the UserOp** via `eth_call` (pre-flight check)
7. Backend **signs paymaster sponsorship**, forwards to **Alto bundler**
8. Alto validates the UserOp and submits to **EntryPoint v0.8**
9. EntryPoint calls **VerifyingPaymaster** to verify backend's signature
10. EntryPoint executes on user's smart account: **action + fee buffer**
11. EntryPoint charges paymaster for network fees (in ETH from paymaster's deposit)

**User never needs ETH.** Paymaster sponsors network fees. User reimburses via token fee buffer.

---

## 3. Token Inventory

### 3.1 Arbitrum One Token Contracts

| Token | Symbol | Address | Decimals | Type | Notes |
|-------|--------|---------|----------|------|-------|
| USD₮0 | USDT0 | `0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9` | 18 | Stablecoin | Tether's cross-chain USDT standard |
| Wrapped BTC | wBTC | `0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f` | 8 | Wrapped BTC | BitGo custodied |
| tBTC | tBTC | `0x6c84a8f1c29108f47a79964b5fe888d4f4d0de40` | 18 | Decentralized BTC | Threshold Network |

### 3.2 Token Extensibility

Adding a new token on Arbitrum requires:
1. Add token config to `StablecoinRegistry`
2. Verify contract on Arbiscan
3. Add logo to `/static/logos/`
4. Add i18n keys
5. No UI code changes — auto-adapts from registry

---

## 4. Component Design

### 4.1 VerifyingPaymaster Contract

**Source**: Coinbase VerifyingPaymaster (MIT, audited Nov 2024)
**Repo**: `github.com/coinbase/verifying-paymaster`
**Adaptation**: Recompile against EntryPoint v0.8 interfaces, deploy on Arbitrum

**What we configure**:
- `verifyingSigner` = NestJS backend signer address
- Bundler allowlist = empty (allow any bundler) or Alto's signer address
- ERC-20 precheck = disabled (fee buffer in batched calls handles reimbursement)
- EntryPoint address = `0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108` (v0.8)

**On-chain fee caps (defense-in-depth, Section 4.9)**:
- Add `maxCallGas` and `maxTotalGas` constants to the paymaster contract
- If UserOp exceeds these limits, paymaster returns `SIG_VALIDATION_FAILED`
- Provides on-chain safety net even if backend validation is bypassed

**Deployment**:
```bash
# Recompile against EntryPoint v0.8
npm install @account-abstraction/contracts@0.8
# Deploy on Arbitrum Sepolia first (~$0.00 on testnet)
npx hardhat run scripts/deploy.js --network arbitrumSepolia
# Fund paymaster deposit: 0.1 ETH (Sepolia faucet for testing)
# Then deploy to mainnet in Phase 7
```

### 4.2 Alto Bundler

**Source**: Pimlico (Apache 2.0)
**Repo**: `github.com/pimlicolabs/alto`
**Deployment**: Docker container, self-hosted, 2 replicas

```yaml
# docker-compose.yml
services:
  alto-1:
    image: ghcr.io/pimlicolabs/alto@sha256:<PINNED_DIGEST>
    restart: unless-stopped
    expose:
      - "3000"
    networks:
      - internal
    environment:
      - ALTO_RPC_URL=${ARBITRUM_RPC_URL}
      - ALTO_PORT=3000
      - ALTO_ENTRY_POINT=0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108
      - ALTO_ENTRY_POINT_VERSION=0.8
      - ALTO_MAX_BUNDLE_WAIT=2000
      - ALTO_POLLING_INTERVAL=500
      - ALTO_BLOCKCHAIN_CLIENT_MODE=ALCHEMY
    secrets:
      - bundler_private_key
      - utility_private_key
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 5s
      retries: 3
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"

  alto-2:
    image: ghcr.io/pimlicolabs/alto@sha256:<PINNED_DIGEST>  # Same pinned digest
    # ... same config as alto-1 ...

secrets:
  bundler_private_key:
    file: ./secrets/bundler_private_key.txt
  utility_private_key:
    file: ./secrets/utility_private_key.txt

networks:
  internal:
    driver: bridge
```

**UTILITY_PRIVATE_KEY**: This is Alto's utility key used for gas estimation and internal operations. It is a separate key from the bundler key. Store in Docker secrets, never in environment variables or source code.

**Alto is NOT directly exposed to the internet.** NestJS backend connects via Docker internal network.

### 4.3 NestJS Gasless Module

```
src/gasless/
├── gasless.module.ts
├── gasless.controller.ts
├── gasless.service.ts
├── gasless.config.ts
├── deposit-monitor.service.ts
├── paymaster-signing.service.ts
├── preflight-simulation.service.ts
├── validators/
│   ├── relay-userop.dto.ts
│   └── userop-fee.validator.ts
└── guards/
    └── gasless-auth.guard.ts
```

**Controller**:
```typescript
@Controller('gasless')
export class GaslessController {
  @Post('relay')
  @UseGuards(JwtAuthGuard)
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async relay(@Body() dto: RelayUserOpDto, @Req() req) {
    return this.gaslessService.relay(dto, req.user);
  }

  @Post('estimate')
  @UseGuards(JwtAuthGuard)
  async estimate(@Body() dto: EstimateDto, @Req() req) {
    return this.gaslessService.estimate(dto, req.user);
  }
}
```

**Service** (core logic with tiered fees + contract interaction support):
```typescript
@Injectable()
export class GaslessService {
  constructor(
    @Inject(ALTO_CLIENT) private altoClient: AltoBundlerClient,
    @Inject(PAYMASTER_SIGNER) private signer: ethers.Wallet,
    @Inject(PAYMASTER_ADDRESS) private paymasterAddress: string,
    @Inject(ENTRY_POINT_ADDRESS) private entryPointAddress: string,
    private depositMonitor: DepositMonitorService,
    private preflight: PreflightSimulationService,
    private configService: ConfigService,
  ) {}

  async relay(dto: RelayUserOpDto, user: JwtPayload): Promise<{userOpHash: string}> {
    try {
      // 1. Verify user owns the smart account
      const account = await this.getSmartAccount(user.id);
      if (dto.sender !== account.address) throw new ForbiddenException();

      // 2. Check paymaster deposit is healthy
      if (!await this.depositMonitor.isHealthy()) {
        throw new ServiceUnavailableException('Paymaster deposit too low');
      }

      // 3. Validate fee parameters (prevents paymaster drain)
      this.validateFeeParameters(dto.userOp);

      // 4. Validate callData structure
      this.validateCallData(dto.userOp.callData);

      // 5. Pre-flight simulation (verify execution won't revert)
      await this.preflight.simulate(dto.userOp);

      // 6. Sign paymaster data → set in paymasterAndData (NOT signature)
      const paymasterSignature = await this.signPaymasterData(dto.userOp);
      dto.userOp.paymasterAndData = concat([
        this.paymasterAddress,
        encodeAbiParameters([{ type: 'bytes' }], [paymasterSignature]),
      ]);

      // 7. Submit to Alto bundler (with fallback)
      const userOpHash = await sendWithFallback(dto.userOp);

      // 8. Log for monitoring
      await this.logFeeSponsorship(user.id, dto.userOp, userOpHash);

      return { userOpHash };
    } catch (e) {
      if (e instanceof BadRequestException || e instanceof ForbiddenException) throw e;
      this.logger.error(`Relay failed for user ${user.id}: ${e.message}`, e.stack);
      throw new ServiceUnavailableException('Gasless relay temporarily unavailable');
    }
  }

  async estimate(dto: EstimateDto, user: JwtPayload): Promise<FeeEstimate> {
    const dummyCallData = this.buildCallData(dto);
    const dummyUserOp = this.buildDummyUserOp(user.walletAddress, dummyCallData);
    const estimate = await this.altoClient.estimateUserOperationGas({ userOp: dummyUserOp });
    const gasPrice = await this.altoClient.getUserOperationGasPrice();
    const totalGas = estimate.preVerificationGas +
      estimate.verificationGasLimit + estimate.callGasLimit;

    // Reject operations exceeding 5M gas
    if (totalGas > MAX_TOTAL_GAS) {
      throw new BadRequestException('Network fee too high — operation too complex');
    }

    const feeTier = getNetworkFeeTier(totalGas);
    const feeBuffer = this.convertToTokenFee(feeTier.feeUSD, dto.token);
    const feeCostUSD = feeTier.feeUSD;

    return {
      feeBuffer: feeBuffer.toString(),
      feeCostUSD,
      feeTier: feeTier.label,
      totalWithBuffer: (BigInt(dto.amount) + feeBuffer).toString(),
    };
  }

  // --- Fee validation ---

  private validateFeeParameters(userOp: UserOperation): void {
    if (userOp.callGasLimit > MAX_CALL_GAS)
      throw new BadRequestException('callGasLimit exceeds maximum');
    if (userOp.verificationGasLimit > MAX_VERIFICATION_GAS)
      throw new BadRequestException('verificationGasLimit exceeds maximum');
    if (userOp.preVerificationGas > MAX_PRE_VERIFICATION_GAS)
      throw new BadRequestException('preVerificationGas exceeds maximum');
    if (userOp.maxFeePerGas > MAX_FEE_PER_GAS)
      throw new BadRequestException('maxFeePerGas exceeds ceiling');

    // Reject total gas exceeding 5M (network fee too high)
    const totalGas = userOp.callGasLimit + userOp.verificationGasLimit + userOp.preVerificationGas;
    if (totalGas > MAX_TOTAL_GAS) {
      throw new BadRequestException('Network fee too high — operation exceeds 5M gas limit');
    }
  }

  // --- callData validation (supports contract interactions) ---

  private validateCallData(callData: string): void {
    const decoded = decodeFunctionData({ abi: SIMPLE_ACCOUNT_ABI, data: callData });
    if (decoded.functionName !== 'executeBatch')
      throw new BadRequestException('callData must be executeBatch');
    if (decoded.args.calls.length < 2)
      throw new BadRequestException('executeBatch must have at least 2 calls');

    // Last call MUST be fee buffer transfer to GAS_TREASURY
    const feeCall = decoded.args.calls[decoded.args.calls.length - 1];
    if (!ALLOWED_FEE_TOKENS.map(t => t.toLowerCase()).includes(feeCall.to.toLowerCase()))
      throw new BadRequestException('Fee token not in allowed list');
    const feeTransfer = decodeFunctionData({ abi: ERC20_ABI, data: feeCall.data });
    if (feeTransfer.functionName !== 'transfer')
      throw new BadRequestException('Last call must be transfer() for fee buffer');
    const [feeRecipient, feeAmount] = feeTransfer.args;
    if (feeRecipient.toLowerCase() !== GAS_TREASURY.toLowerCase())
      throw new BadRequestException('Fee buffer must go to GAS_TREASURY');
    if (feeAmount < MIN_FEE_BUFFER[feeCall.to])
      throw new BadRequestException('Fee buffer below minimum for this token');
    if (feeAmount > MAX_FEE_BUFFER[feeCall.to])
      throw new BadRequestException('Fee buffer above maximum — possible drain attempt');

    // All other calls are user actions (transfers, swaps, contract interactions)
    // No restriction on target or function — tiered fee model ensures paymaster is compensated
  }
}
```

**Estimated**: ~400 lines total for the NestJS module.

**Constants** (defined in `gasless.config.ts`):
```typescript
export const ALLOWED_FEE_TOKENS = [
  '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', // USDT0
  '0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f', // wBTC
  '0x6c84a8f1c29108f47a79964b5fe888d4f4d0de40', // tBTC
];
export const GAS_TREASURY = '0xYOUR_TREASURY_ADDRESS';
export const MIN_FEE_BUFFER: Record<string, bigint> = {
  '0xFd086b...': 10000000000000000n,   // USDT0: 0.01 tokens ($0.01 — Low tier minimum)
  '0x2f2a25...': 16n,                   // wBTC: 16 satoshis (~$0.01 at $66K)
  '0x6c84a8...': 10000000000000000n,    // tBTC: 0.01 tokens (~$0.01 at $66K)
};
export const MAX_FEE_BUFFER: Record<string, bigint> = {
  '0xFd086b...': 150000000000000000n,   // USDT0: 0.15 tokens ($0.15)
  '0x2f2a25...': 230n,                  // wBTC: 230 satoshis (~$0.15)
  '0x6c84a8...': 150000000000000000n,   // tBTC: 0.15 tokens
};
export const MAX_CALL_GAS = 5_000_000n;
export const MAX_VERIFICATION_GAS = 1_000_000n;
export const MAX_PRE_VERIFICATION_GAS = 100_000n;
export const MAX_FEE_PER_GAS = parseGwei('1');
export const MAX_TOTAL_GAS = 5_000_000n;  // Reject operations exceeding this
```

### 4.4 Svelte Wallet Store

**ethers.js + thin Svelte store** (~80 lines). No wagmi needed.

**Critical design**: `sendGasless()` builds + signs the UserOp locally, then sends to NestJS backend relay.

```typescript
// src/lib/wallet/gasless.ts
import { writable, derived, get } from 'svelte/store';
import { ethers } from 'ethers';

export const smartAccount = writable<SmartAccount | null>(null);
export const isReady = derived(smartAccount, $a => !!$a);
export const address = derived(smartAccount, $a => $a?.address ?? null);

export async function initArbitrumWallet(privateKey: string): Promise<string> {
  const publicClient = createPublicClient({ chain: arbitrum, transport: http(RPC_URL) });
  const signer = privateKeyToAccount(privateKey as `0x${string}`);
  const account = await to7702SimpleSmartAccount({ client: publicClient, owner: signer });
  smartAccount.set(account);
  return account.address;
}

export async function sendGasless(
  calls: Array<{ to: `0x${string}`; data: `0x${string}`; value?: bigint }>;
  feeBufferToken: `0x${string}`;
  feeBufferAmount: bigint;
): Promise<string> {
  const account = get(smartAccount);
  if (!account) throw new Error('Wallet not initialized');

  // Build executeBatch: user's calls + fee buffer transfer
  const callData = encodeFunctionData({
    abi: SIMPLE_ACCOUNT_ABI,
    functionName: 'executeBatch',
    args: [
      [...calls.map(c => c.to), feeBufferToken],
      [
        ...calls.map(c => c.data),
        encodeFunctionData({
          abi: ERC20_ABI,
          functionName: 'transfer',
          args: [GAS_TREASURY, feeBufferAmount],
        }),
      ],
    ],
  });

  // Sign UserOp locally
  const userOp = await account.signUserOp({
    sender: account.address,
    callData,
    nonce: await account.getNonce(),
  });

  // Send to NestJS backend (NOT directly to bundler)
  const response = await fetch(`${API_BASE}/gasless/relay`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getJWT()}` },
    body: JSON.stringify({ sender: account.address, userOp }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Relay failed');
  }

  return (await response.json()).userOpHash;
}

// Convenience: simple token transfer
export async function sendToken(
  token: `0x${string}`,
  recipient: `0x${string}`,
  amount: bigint,
  feeBufferAmount: bigint,
): Promise<string> {
  return sendGasless(
    [{ to: token, data: encodeFunctionData({ abi: ERC20_ABI, functionName: 'transfer', args: [recipient, amount] }) }],
    token,
    feeBufferAmount,
  );
}
```

**Estimated**: ~80 lines.

### 4.5 Fee Estimation Service (Tiered Model)

All fee estimation is handled by the NestJS backend. The client calls `/gasless/estimate`.

**Tiered fee model:**

| Estimated Gas | Fee Tier | Fee (USD) | Typical Operation |
|---------------|----------|-----------|-------------------|
| ≤ 200,000 | Low | $0.01 | Simple ERC-20 transfer |
| 200,001 – 500,000 | Medium | $0.03 | Uniswap swap, simple DeFi |
| 500,001 – 1,000,000 | High | $0.05 | Complex DeFi (Aave, Compound) |
| 1,000,001 – 5,000,000 | Very High | $0.10 | Governance, multicall batch |
| > 5,000,000 | **REJECTED** | — | "Network fee too high" error |

```typescript
// Fee tier lookup
function getNetworkFeeTier(estimatedGas: bigint): { feeUSD: number; label: string } {
  if (estimatedGas <= 200_000n) return { feeUSD: 0.01, label: 'Low' };
  if (estimatedGas <= 500_000n) return { feeUSD: 0.03, label: 'Medium' };
  if (estimatedGas <= 1_000_000n) return { feeUSD: 0.05, label: 'High' };
  if (estimatedGas <= 5_000_000n) return { feeUSD: 0.10, label: 'Very High' };
  throw new BadRequestException('Network fee too high — operation too complex');
}
```

**Server-side estimation** (inside GaslessService):
```typescript
async estimate(dto: EstimateDto, user: JwtPayload): Promise<FeeEstimate> {
  const dummyCallData = this.buildCallData(dto);
  const dummyUserOp = this.buildDummyUserOp(user.walletAddress, dummyCallData);
  const estimate = await this.altoClient.estimateUserOperationGas({ userOp: dummyUserOp });
  const gasPrice = await this.altoClient.getUserOperationGasPrice();
  const totalGas = estimate.preVerificationGas +
    estimate.verificationGasLimit + estimate.callGasLimit;

  // Reject operations exceeding 5M gas
  if (totalGas > MAX_TOTAL_GAS) {
    throw new BadRequestException('Network fee too high — operation too complex');
  }

  const feeTier = getNetworkFeeTier(totalGas);
  const feeBuffer = this.convertToTokenFee(feeTier.feeUSD, dto.token);

  return {
    feeBuffer: feeBuffer.toString(),
    feeCostUSD: feeTier.feeUSD,
    feeTier: feeTier.label,
    totalWithBuffer: (BigInt(dto.amount) + feeBuffer).toString(),
  };
}

private convertToTokenFee(feeUSD: number, tokenAddress: string): bigint {
  const token = this.getTokenInfo(tokenAddress);
  const tokenPrice = this.getCachedTokenPrice(tokenAddress); // Chainlink oracle

  // All BigInt arithmetic — no floating point
  // feeUSD is in dollars, tokenPrice is in USD with 18 decimals
  const feeUSDWei = BigInt(Math.round(feeUSD * 1e18));
  const tokenAmount = feeUSDWei * BigInt(10 ** token.decimals) / tokenPrice;
  return tokenAmount + 1n; // Round UP (favor treasury)
}
```

**Estimated**: ~100 lines (server-side, including Chainlink oracle integration).

**Client-side** (thin wrapper):
```typescript
export async function estimateFee(
  token: TokenInfo,
  amount: bigint,
  recipient: string,
): Promise<{ feeBuffer: bigint; feeCostUSD: number; feeTier: string; totalWithBuffer: bigint }> {
  const response = await fetch(`${API_BASE}/gasless/estimate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getJWT()}` },
    body: JSON.stringify({ token: token.address, amount: amount.toString(), recipient }),
  });
  if (!response.ok) {
    const error = await response.json();
    if (error.message?.includes('Network fee too high')) {
      throw new Error('This operation is too complex. Please try a simpler transaction.');
    }
    throw new Error('Fee estimation failed');
  }
  return response.json();
}
```

### 4.6 Paymaster Signing (Backend)

The NestJS backend signs paymaster sponsorship data using a dedicated private key. **The signing hash MUST match what the Coinbase VerifyingPaymaster contract computes internally.**

**How the contract validates** (from source `validatePaymasterUserOp`):
1. Contract computes: `hash = keccak256(abi.encode(userOp.sender, userOp.nonce, keccak256(userOp.callData), entryPoint, block.chainid))`
2. Recovers signer from `hash` + `paymasterSignature`
3. Returns `SIG_VALIDATION_FAILED` if recovered ≠ `verifyingSigner`

```typescript
// helpers/paymaster-hash.ts
export function getPaymasterSignatureHash(
  userOp: { sender: string; nonce: bigint; callData: string },
  paymasterAddress: string,
  entryPointAddress: string,
  chainId: bigint,
): `0x${string}` {
  return keccak256(
    encodeAbiParameters(
      [
        { type: 'address' },
        { type: 'uint256' },
        { type: 'bytes32' },
        { type: 'address' },
        { type: 'uint256' },
      ],
      [
        userOp.sender as `0x${string}`,
        userOp.nonce,
        keccak256(userOp.callData as `0x${string}`),
        entryPointAddress as `0x${string}`,
        chainId,
      ],
    ),
  );
}
```

**Verification**: Write a test that signs locally and calls `VerifyingPaymaster.validatePaymasterUserOp()` via `eth_call` on Anvil fork.

**Note on signMessage vs signDigest**: ethers.js `signMessage()` prepends `"\x19Ethereum Signed Message:\n32"`. If the contract uses raw `ECDSA.recover(hash, signature)` without `toEthSignedMessageHash`, use `signer.signingKey.signDigest(hash)` instead. The Anvil fork test catches any mismatch.

**Estimated**: ~40 lines.

### 4.7 Key Management (No Changes)

**No changes should be made to the existing key management system.** The user's private key management is a critical system that is currently stable. The EIP-7702 smart account uses the same key as the EOA — no new key is needed. The existing key generation, storage, backup, and recovery mechanisms remain unchanged.

### 4.8 EIP-7702 Escape Hatch

**Problem**: If BitTasker goes down, users' EIP-7702 delegation persists.

**Solution**: The smart account setup delegates to the **public Simple7702Account implementation** (`0xe6Cae83BdE06E4c305530e199D7217f42808555B`). This implementation is:
- Deployed by the Ethereum Foundation / Pimlico team
- Open source and audited
- Immutable — cannot be changed by BitTasker
- Callable by ANY bundler, not just Alto

**Escape routes** (if BitTasker disappears):
1. User can use ANY ERC-4337 bundler (Pimlico, Alchemy, Stackup) to revoke delegation
2. User can send a standard ETH transaction from the EOA to itself — triggers EIP-7702 revocation
3. The delegation implementation is public — no BitTasker-specific contract or API key needed

### 4.9 On-Chain Paymaster Fee Caps

Defense-in-depth: even if backend validation is bypassed, the paymaster contract enforces fee limits on-chain.

```solidity
// In VerifyingPaymaster.sol (adapted from Coinbase)
uint256 public constant MAX_CALL_GAS = 5_000_000;
uint256 public constant MAX_TOTAL_GAS = 6_000_000; // verification + call + preVerification

function _validatePaymasterUserOp(
    UserOperation calldata userOp,
    bytes32 userOpHash,
    uint256 requiredPreFund
) internal override returns (bytes memory context, uint256 validationData) {
    // On-chain fee cap check
    if (userOp.callGasLimit > MAX_CALL_GAS) return (bytes(''), 1); // reject
    uint256 totalGas = userOp.callGasLimit + userOp.verificationGasLimit + userOp.preVerificationGas;
    if (totalGas > MAX_TOTAL_GAS) return (bytes(''), 1); // reject

    // ... existing signature verification ...
}
```

**Estimated**: ~30 lines of contract changes.

### 4.10 Pre-Flight UserOp Simulation

Before submitting to the bundler, simulate the UserOp via `eth_call` to verify it won't revert.

```typescript
// preflight-simulation.service.ts
@Injectable()
export class PreflightSimulationService {
  async simulate(userOp: UserOperation): Promise<void> {
    try {
      // Call EntryPoint's simulateValidation via eth_call
      await this.provider.call({
        to: ENTRY_POINT_ADDRESS,
        data: encodeFunctionData({
          abi: ENTRY_POINT_ABI,
          functionName: 'simulateValidation',
          args: [userOp],
        }),
      });
    } catch (e) {
      // Parse revert reason
      const reason = decodeRevertReason(e.data);
      throw new BadRequestException(`UserOp simulation failed: ${reason}`);
    }
  }
}
```

**Estimated**: ~30 lines.

### 4.11 Deposit Monitoring

Cron job monitors paymaster EntryPoint deposit and auto-pauses relay when balance is low.

```typescript
// deposit-monitor.service.ts
@Injectable()
export class DepositMonitorService {
  private isPaused = false;
  private depositThreshold = parseEther('0.005'); // 0.005 ETH

  @Cron('*/5 * * * *') // Every 5 minutes
  async checkDeposit() {
    const deposit = await this.entryPoint.getDepositInfo(this.paymasterAddress);
    if (deposit < this.depositThreshold) {
      this.isPaused = true;
      this.logger.warn(`Paymaster deposit critically low: ${formatEther(deposit)} ETH — relay paused`);
      await this.notifyOps('Paymaster deposit too low — relay auto-paused');
    } else if (deposit < parseEther('0.01')) {
      this.logger.warn(`Paymaster deposit low: ${formatEther(deposit)} ETH — replenish soon`);
      await this.notifyOps('Paymaster deposit running low');
    } else {
      this.isPaused = false;
    }
  }

  async isHealthy(): Promise<boolean> {
    return !this.isPaused;
  }
}
```

**Estimated**: ~40 lines.

### 4.12 Chainlink Price Oracle

### 4.12 Price Oracle (Chainlink + Constants)

Use Chainlink price feeds for manipulation-resistant token/USD pricing. USDT0 uses a constant ($1.00) since it's a stablecoin pegged to USD.

```typescript
// chainlink-oracle.service.ts
@Injectable()
export class ChainlinkOracleService {
  private ethUsdFeed = new ethers.Contract(ETH_USD_FEED, AGGREGATOR_ABI, this.provider);
  private btcUsdFeed = new ethers.Contract(BTC_USD_FEED, AGGREGATOR_ABI, this.provider);
  private readonly USDT0_PRICE_18_DEC = 1_000_000_000_000_000_000n; // $1.00 in 18 decimals

  async getTokenPriceUSD(tokenAddress: string): Promise<bigint> {
    const token = this.getTokenInfo(tokenAddress);

    if (token.symbol === 'USDT0') {
      // USDT0 is pegged to $1.00 — return constant price
      // No oracle call needed; avoids staleness risk for stablecoins
      return this.USDT0_PRICE_18_DEC;
    } else if (token.symbol === 'WBTC' || token.symbol === 'TBTC') {
      const btcPrice = await this.btcUsdFeed.latestRoundData();
      this.checkStaleness(btcPrice, 'BTC/USD');
      return BigInt(btcPrice.answer) * 1e10; // Normalize to 18 decimals
    }
  }

  private checkStaleness(data: any, feedName: string): void {
    const updatedAt = Number(data.updatedAt);
    const staleness = Date.now() / 1000 - updatedAt;
    if (staleness > 300) { // 5 minutes
      throw new Error(`${feedName} price data is stale (${staleness}s old)`);
    }
  }
}
```

**Chainlink Price Feeds (Arbitrum One)**:
- ETH/USD: `0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612`
- BTC/USD: `0x6ce185860a4963106506C203335A2910413708e9`

**Estimated**: ~40 lines.

### 4.13 Docker Secrets Management

Private keys are stored as Docker secrets, NOT environment variables.

```yaml
# docker-compose.yml (excerpt)
secrets:
  bundler_private_key:
    file: ./secrets/bundler_private_key.txt
  utility_private_key:
    file: ./secrets/utility_private_key.txt
  paymaster_signer_key:
    file: ./secrets/paymaster_signer_key.txt

services:
  nestjs:
    secrets:
      - paymaster_signer_key
    environment:
      - PAYMASTER_SIGNER_KEY_FILE=/run/secrets/paymaster_signer_key
```

**Estimated**: ~30 lines of config.

### 4.14 UTILITY_PRIVATE_KEY Documentation

The `UTILITY_PRIVATE_KEY` is Alto's utility key used for:
- Gas estimation (`eth_estimateUserOperationGas`)
- Internal bundler operations
- NOT used for signing UserOps or paymaster sponsorship

**Requirements**:
- Separate from bundler key and paymaster signer key
- Does NOT need to hold ETH (Alto uses it for read-only simulation)
- Stored in Docker secrets (`./secrets/utility_private_key.txt`)
- Rotate quarterly alongside bundler key

### 4.15 Relay-Time Fee Re-estimation

To prevent tier boundary exploitation (e.g., user estimates at Low tier, but actual gas lands in Medium tier), the backend re-estimates the fee at relay time:

```typescript
// In GaslessService.relay(), after validateCallData:

// 1. Extract the claimed fee buffer from the UserOp's callData
const decoded = decodeFunctionData({ abi: SIMPLE_ACCOUNT_ABI, data: dto.userOp.callData });
const feeCall = decoded.args.calls[decoded.args.calls.length - 1];
const feeTransfer = decodeFunctionData({ abi: ERC20_ABI, data: feeCall.data });
const [feeRecipient, claimedFeeAmount] = feeTransfer.args;
const tokenInfo = this.getTokenInfo(feeCall.to);

// 2. Convert claimed fee amount back to USD for tier comparison
// claimedFeeUSD = claimedFeeAmount * tokenPrice / 10^decimals
const tokenPrice = await this.oracle.getTokenPriceUSD(feeCall.to);
const claimedFeeUSDWei = claimedFeeAmount * tokenPrice / BigInt(10 ** tokenInfo.decimals);
const claimedFeeUSD = Number(claimedFeeUSDWei) / 1e18;

// 3. Re-estimate gas at relay time
const actualEstimate = await this.altoClient.estimateUserOperationGas({ userOp: dto.userOp });
const actualTotalGas = actualEstimate.preVerificationGas +
  actualEstimate.verificationGasLimit + actualEstimate.callGasLimit;
const actualTier = getNetworkFeeTier(actualTotalGas);

// 4. Reject if actual tier exceeds what the user's fee buffer covers
if (actualTier.feeUSD > claimedFeeUSD) {
  throw new BadRequestException(
    `Fee tier mismatch: your buffer covers $${claimedFeeUSD.toFixed(2)}, ` +
    `but this operation requires $${actualTier.feeUSD.toFixed(2)} (${actualTier.label}). ` +
    `Please re-estimate and retry.`
  );
}
```

This ensures the fee buffer the user committed to actually covers the real cost. If gas conditions changed between estimate and relay, the user is prompted to re-estimate rather than silently underpaying.

**Estimated**: ~25 lines.

---

## 5. Fee Reimbursement Model

### 5.1 Core Principle

**The user pays network fees. BitTasker does not subsidize ongoing costs.**

Network fees are paid in the token being transferred. A tiered fee buffer based on operation complexity covers the estimated cost.

### 5.2 Tiered Fee Structure

| Operation Type | Estimated Gas | Fee Tier | Fee (USD) | In USDT0 (18 dec) |
|---------------|---------------|----------|-----------|--------------------|
| Simple transfer | ≤ 200K | Low | $0.01 | 0.01 USDT0 |
| Swap / simple DeFi | 200K – 500K | Medium | $0.03 | 0.03 USDT0 |
| Complex DeFi | 500K – 1M | High | $0.05 | 0.05 USDT0 |
| Governance / multicall | 1M – 5M | Very High | $0.10 | 0.10 USDT0 |
| > 5M gas | — | **REJECTED** | — | Error: "Network fee too high" |

**Platform net per operation**:
- Low tier: $0.01 fee - ~$0.003 actual cost = **$0.007 profit**
- Medium tier: $0.03 fee - ~$0.006 actual cost = **$0.024 profit**
- High tier: $0.05 fee - ~$0.010 actual cost = **$0.040 profit**
- Very High tier: $0.10 fee - ~$0.020 actual cost = **$0.080 profit**

### 5.3 Pre-Flight Balance Check

Before any send, verify:
```
tokenBalance >= transferAmount + feeBuffer
```

### 5.4 First Transaction (Account Setup)

The first transaction with EIP-7702 includes the authorization signature. This costs slightly more gas (~45K extra). The Low tier ($0.01) covers this because:
- First tx gas: ~200,000 = ~$0.004
- Low tier fee: $0.01
- Covered ✅

### 5.5 wBTC 8-Decimal Precision

wBTC has 8 decimals. Fee buffer handling:
- BigInt-only arithmetic (no floating-point)
- Always round UP reimbursement (favor treasury)
- Minimum reimbursement: 8 satoshis for wBTC
- 10 explicit unit tests for precision edge cases

---

## 6. User Experience Flows

### 6.1 Send Flow

```
User enters: "Send 100 USDT0 to 0xabc"

Step 1: App calls backend /gasless/estimate
  → Returns: feeBuffer = 0.01 USDT0, feeCostUSD = $0.01, feeTier = "Low"

Step 2: App shows confirmation:
  ┌──────────────────────────────────────┐
  │  Send 100 USDT0 to 0xabc            │
  │                                      │
  │  Recipient gets:  100.000000 USDT0   │
  │  Network fee:       0.010000 USDT0   │
  │  ─────────────────────────────────── │
  │  Total:           100.010000 USDT0   │
  │                                      │
  │  [ Confirm ]    [ Cancel ]           │
  └──────────────────────────────────────┘

Step 3: User taps Confirm
  → App builds UserOp: [transfer(100), transfer(0.01)]
  → App signs UserOp locally
  → Sends to backend

Step 4: Backend simulates → validates → adds paymaster signature → Alto → EntryPoint
  → Done. Transaction confirmed.
```

### 6.2 Contract Interaction Flow

```
User initiates: Swap 50 USDT0 → wBTC on Uniswap

Step 1: App builds callData for Uniswap router
  → calls = [{ to: uniswapRouter, data: swap(...) }]

Step 2: App calls /gasless/estimate with the callData
  → Backend estimates: ~350K gas → Medium tier → $0.03 fee
  → Returns: feeBuffer = 0.03 USDT0

Step 3: App shows confirmation:
  ┌──────────────────────────────────────┐
  │  Swap 50 USDT0 → wBTC               │
  │                                      │
  │  Network fee:       0.030000 USDT0   │
  │  ─────────────────────────────────── │
  │  Total:            50.030000 USDT0   │
  │                                      │
  │  [ Confirm ]    [ Cancel ]           │
  └──────────────────────────────────────┘

Step 4: User confirms → sign → relay → Alto → EntryPoint
  → executeBatch: [swap(...), transfer(treasury, 0.03)]
  → Done.
```

### 6.3 Network Fee Too High Error

```
User initiates: Complex governance proposal (6M gas)

Step 1: App calls /gasless/estimate
  → Backend estimates: ~6M gas → exceeds 5M limit
  → Returns: 400 Bad Request "Network fee too high — operation too complex"

Step 2: App shows error:
  ┌──────────────────────────────────────┐
  │  ❌ Network fee too high             │
  │                                      │
  │  This operation is too complex to    │
  │  execute gaslessly. Please try a     │
  │  simpler transaction.                │
  │                                      │
  │  [ OK ]                              │
  └──────────────────────────────────────┘
```

### 6.4 Receive Flow

```
User's smart account address: 0xABC123... (same as EOA)

Anyone sends tokens to 0xABC123 → works immediately.
No network fees needed to receive.

Address shown with QR code + copy button.
Subtle indicator: "on Arbitrum"
```

### 6.5 Wallet Page

The existing wallet UI design remains unchanged. No modifications to asset display, navigation, or layout. Arbitrum tokens are added to the existing token list following the same display pattern as RSK and BSC tokens.

---

## 7. wallet-core Modifications

### 7.1 New File: ArbitrumWallet.ts

Follows existing `BSCWallet` / `RSKWallet` pattern in `@bittasker/wallet-core`.

**Purpose**: Provider, token balances, ERC-20 reads. **No AA logic** — that lives in the app layer.

```typescript
export class ArbitrumWallet {
  private provider: ethers.JsonRpcProvider;
  private wallet: ethers.Wallet;

  constructor(privateKey: string, rpcUrl: string) {
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.wallet = new ethers.Wallet(privateKey, this.provider);
  }

  getAddress(): string { return this.wallet.address; }

  async getBalance(tokenAddress: string, decimals: number): Promise<string> {
    const contract = new ethers.Contract(tokenAddress, ERC20_ABI, this.provider);
    const balance = await contract.balanceOf(this.wallet.address);
    return formatUnits(balance, decimals);
  }

  async getETHBalance(): Promise<string> {
    const balance = await this.provider.getBalance(this.wallet.address);
    return formatEther(balance);
  }

  getWallet(): ethers.Wallet { return this.wallet; }
}
```

**Estimated**: ~60 lines. On new branch `feat/arbitrum-wallet`.

---

## 8. Implementation Phases

### Development Environment

- **Smart contracts**: Deploy on Arbitrum Sepolia testnet first
- **Bundler**: Alto Docker locally
- **Backend**: NestJS locally
- **Frontend**: Svelte dev server locally
- **Testnet ETH**: Alchemy faucet (no API key required for basic requests) at `alchemy.com/faucets/arbitrum-sepolia`, or QuickNode faucet at `faucet.quicknode.com/arbitrum/sepolia`
- **Anvil fork**: Local fork of Arbitrum mainnet for contract verification tests
- **No mainnet deployment until Phase 7**

### Phase 0: Infrastructure Setup (Day 1)

| Task | Time | Notes |
|------|------|-------|
| Deploy VerifyingPaymaster on Arbitrum Sepolia | 2 hours | Coinbase contract, recompiled for v0.8, with on-chain fee caps |
| Run Alto (2 replicas) in Docker locally | 30 min | `docker-compose up -d` with pinned digest |
| Set up Docker secrets for private keys | 30 min | bundler_key, utility_key, paymaster_signer_key |
| Fund paymaster deposit (Sepolia faucet) | 10 min | Free testnet ETH from Alchemy/QuickNode faucet |
| **CLI Gate**: Run `01-verify-alto-health.sh` | 5 min | Must pass before proceeding |
| **CLI Gate**: Run `02-verify-paymaster-deploy.sh` | 5 min | Must pass before proceeding |

### Phase 1: NestJS Gasless Module (Days 2-3)

| Task | Time | Notes |
|------|------|-------|
| Gasless controller + service | 4 hours | relay + estimate endpoints |
| Tiered fee model + contract interaction support | 2 hours | getNetworkFeeTier + validateCallData (any calls + fee buffer) |
| 5M gas rejection | 1 hour | MAX_TOTAL_GAS check in validation + estimation |
| Paymaster signing logic | 2 hours | getPaymasterSignatureHash + signMessage/signDigest |
| Pre-flight simulation | 2 hours | simulateValidation via eth_call |
| Deposit monitoring cron | 1 hour | Auto-pause at < 0.005 ETH |
| Chainlink price oracle | 2 hours | ETH/USD + BTC/USD feeds on Arbitrum |
| JWT auth guard | 1 hour | Reuse existing auth infrastructure |
| DTOs + validation | 2 hours | Fee params + callData structure + fee buffer bounds |
| Unit tests | 4 hours | Mock Alto, verify signing, tiered fees, edge cases |
| **CLI Gate**: Run `03-verify-paymaster-signing.sh` | 10 min | Must pass — proves signing matches contract |
| **CLI Gate**: Run `04-verify-fee-estimation.sh` | 10 min | Must pass — proves all 3 tokens + tiered fees correct |
| **CLI Gate**: Run `05-verify-validation.sh` | 10 min | Must pass — proves rejection logic works |

### Phase 2: Svelte Store + Fee Estimation Client (Days 4-5)

| Task | Time | Notes |
|------|------|-------|
| Gasless Svelte store | 2 hours | initArbitrumWallet + sendGasless (calls NestJS relay) |
| Fee estimation client | 1 hour | Calls /gasless/estimate backend endpoint |
| Contract interaction helpers | 2 hours | sendGasless() with arbitrary calls + fee buffer |
| Pre-flight balance check | 1 hour | Balance >= amount + feeBuffer |
| Unit tests | 3 hours | Mock ethers.js, precision tests |

### Phase 3: ArbitrumWallet in wallet-core (Day 5)

| Task | Time | Notes |
|------|------|-------|
| ArbitrumWallet class | 2 hours | Provider + balance reads (no AA logic) |
| WalletManager integration | 1 hour | Add arbitrum to chain registry |
| Unit tests | 2 hours | Follow BSCWallet test pattern (10 test groups) |
| **Git**: New branch `feat/arbitrum-wallet` | 10 min | Separate from monorepo worktree |

### Phase 4: E2E CLI Verification (Day 6)

| Task | Time | Notes |
|------|------|-------|
| build-and-sign-userop.mjs helper | 2 hours | Node.js script to build + sign UserOp from CLI |
| receipt-polling.mjs helper | 1 hour | Poll for UserOp receipt from CLI |
| **CLI Gate**: Run `06-verify-send-usdt0.sh` | 15 min | Full E2E send on Arbitrum Sepolia |
| **CLI Gate**: Run `07-verify-send-wbtc.sh` | 15 min | Full E2E send (8-decimal) |
| **CLI Gate**: Run `08-verify-send-tbtc.sh` | 15 min | Full E2E send (18-decimal) |
| **CLI Gate**: Run `10-verify-paymaster-deposit.sh` | 5 min | Deposit health check |
| **CLI Gate**: Run `verify-all.sh` | 30 min | Master script — ALL 10 checks must pass |
| **UI work begins ONLY after verify-all.sh passes** | | |

### Phase 5: Svelte UI (Days 7-8)

| Task | Time | Notes |
|------|------|-------|
| Send flow (amount → confirm → sign → pending → success) | 4 hours | Full send UX |
| Fee estimation display | 2 hours | "Network fee: 0.01 USDT0" in confirmation modal |
| Contract interaction flow | 3 hours | Uniswap swap + fee display |
| Receive flow (QR + copy address) | 2 hours | Same address as EOA |
| Transaction history | 3 hours | Filter by token, show status |
| Error states | 2 hours | Insufficient balance, bundler down, network fee too high |

### Phase 6: UI Integration Testing (Day 9)

| Task | Time | Notes |
|------|------|-------|
| Send USDT0 E2E (Playwright) | 2 hours | Amount → confirm → pending → success |
| Send wBTC E2E (Playwright) | 2 hours | 8-decimal handling, dust amounts |
| Send tBTC E2E (Playwright) | 1 hour | Standard 18-decimal flow |
| Contract interaction E2E | 2 hours | Swap + fee display |
| Network fee too high E2E | 1 hour | Complex op → error message |
| Insufficient balance E2E | 1 hour | UI shows correct error |
| First-time send E2E (EIP-7702 auth) | 2 hours | Authorization signing works |

### Phase 7: Hardening + Production Deploy (Day 10)

| Task | Time | Notes |
|------|------|-------|
| **CLI Gate**: Run `09-verify-escape-hatch.sh` | 15 min | Prove delegation revocation works without BitTasker |
| Sentry integration | 2 hours | Error tracking for gasless flows |
| Monitoring (Alto Prometheus) | 1 hour | Bundler health metrics |
| Deposit monitoring alerting | 1 hour | Ops alerts when deposit < 0.01 ETH |
| **CLI Gate**: Run `verify-all.sh` on Anvil mainnet fork | 30 min | Final verification before production |
| Deploy VerifyingPaymaster to Arbitrum mainnet | 1 hour | With on-chain fee caps |
| Update config for mainnet | 30 min | RPC URLs, contract addresses, Chainlink feeds |
| **CLI Gate**: Run `verify-all.sh` on mainnet | 30 min | Production verification |
| Documentation | 2 hours | Ops runbook, architecture doc |

---

## 9. CLI Verification Scripts

**Every component must be verifiable from the command line** before any UI work begins.

| # | Script | Purpose |
|---|--------|---------|
| 1 | `scripts/gasless/01-verify-alto-health.sh` | Alto bundler running + EntryPoint v0.8 supported |
| 2 | `scripts/gasless/02-verify-paymaster-deploy.sh` | Contract deployed, correct signer, correct EntryPoint |
| 3 | `scripts/gasless/03-verify-paymaster-signing.sh` | Backend hash matches Coinbase contract (Anvil fork) |
| 4 | `scripts/gasless/04-verify-fee-estimation.sh` | All 3 tokens + tiered fees + 5M rejection |
| 5 | `scripts/gasless/05-verify-validation.sh` | Fee params, callData structure, token whitelist, 5M cap |
| 6 | `scripts/gasless/06-verify-send-usdt0.sh` | Full E2E send on Arbitrum Sepolia |
| 7 | `scripts/gasless/07-verify-send-wbtc.sh` | Full E2E send (8-decimal) |
| 8 | `scripts/gasless/08-verify-send-tbtc.sh` | Full E2E send (18-decimal) |
| 9 | `scripts/gasless/09-verify-escape-hatch.sh` | Revoke delegation via public bundler (no BitTasker) |
| 10 | `scripts/gasless/10-verify-paymaster-deposit.sh` | Deposit balance + alert threshold |
| 11 | `scripts/gasless/verify-all.sh` | Master script — runs all 10 in dependency order |
| 12 | `scripts/gasless/build-and-sign-userop.mjs` | Helper: build + sign UserOp from CLI |
| 13 | `scripts/gasless/receipt-polling.mjs` | Helper: poll for UserOp receipt |

### Usage

```bash
# Run all verification scripts
bash scripts/gasless/verify-all.sh

# Required environment variables
export ARBITRUM_SEPOLIA_RPC_URL=https://arb-sepolia.g.alchemy.com/v2/YOUR_KEY
export ALTO_URL=http://localhost:3000
export API_URL=http://localhost:4000
export PAYMASTER_ADDRESS=0xYOUR_CONTRACT
export TEST_JWT=eyJhbGciOi...
export TEST_PRIVATE_KEY=0xabc...
export TEST_EOA=0x123...

# Testnet faucet (free, no API key for basic requests)
# https://www.alchemy.com/faucets/arbitrum-sepolia
# https://faucet.quicknode.com/arbitrum/sepolia
```

---

## 10. Dependencies

### 10.1 Client-Side (Svelte App)

```json
{
  "dependencies": {
    "ethers": "^6.x"
  }
}
```

### 10.2 Backend (NestJS)

No new dependencies beyond existing NestJS stack. Uses `ethers` v6 for paymaster signing and Chainlink oracle reads.

### 10.3 Infrastructure

```yaml
# Docker
github.com/pimlicolabs/alto:latest  # Bundler (~100MB), pinned to SHA256 digest

# On-chain (Arbitrum Sepolia for dev, Arbitrum One for prod)
EntryPoint v0.8: 0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108
Simple7702Account impl: 0xe6Cae83BdE06E4c305530e199D7217f42808555B
VerifyingPaymaster: 0xYOUR_CONTRACT  # You deploy (~$0.50 mainnet, free testnet)

# Chainlink (Arbitrum One)
ETH/USD: 0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612
BTC/USD: 0x6ce185860a4963106506C203335A2910413708e9

# RPC
Arbitrum: Alchemy free tier (300M CU/month)
```

### 10.4 Monthly Operational Cost

| Item | Cost |
|------|------|
| Alto Docker (add to existing VPS) | $0 |
| Arbitrum RPC (Alchemy free tier) | $0 |
| Network fee sponsorship (10K tx/month) | ~$30 in ETH |
| Paymaster deposit (idle, replenishable) | ~$10 |
| Chainlink oracle reads (free on-chain) | $0 |
| **Total** | **~$40/month for 10K transactions** |

---

## 11. Testing Strategy

### 11.1 Unit Tests (Vitest)

| Component | Tests |
|-----------|-------|
| ArbitrumWallet | Provider init, balance reads, ERC-20 balance format, getWallet() |
| Fee estimation | ETH→token conversion, tiered fees, wBTC 8-decimal precision, round-up logic, 5M rejection |
| Paymaster signing | Valid signature, invalid signature, chainId binding, nonce binding |
| Gasless store | Init wallet, send gasless (mocked), error states |
| Balance check | Sufficient balance, insufficient balance, exact balance |
| Tiered fee model | All 4 tiers + rejection at 5M+ gas |
| Contract interaction | Arbitrary callData with fee buffer in executeBatch |

### 11.2 Integration Tests (Vitest)

| Flow | Tests |
|------|-------|
| Send USDT0 | Full flow with mocked Alto bundler |
| Send wBTC | 8-decimal handling, dust amounts |
| Send tBTC | Standard 18-decimal flow |
| Contract interaction (swap) | Uniswap swap + fee buffer in single UserOp |
| Fee estimation | Tiered fees applied correctly for each operation type |
| Insufficient balance | Pre-flight check blocks send |
| Alto unavailable | Error state, retry logic |
| First-time send | EIP-7702 authorization included |
| Network fee too high | 5M+ gas → 400 error with clear message |
| Pre-flight simulation failure | Reverted UserOp → rejected before submission |
| Deposit exhaustion | Paymaster deposit < threshold → 503 error |

### 11.3 E2E Tests (Playwright)

| Flow | Tests |
|------|-------|
| Send USDT0 (happy) | Amount → confirm → pending → success |
| Send wBTC (happy) | Amount → confirm → pending → success |
| Send tBTC (happy) | Amount → confirm → pending → success |
| Contract interaction | Swap → confirm → pending → success |
| Network fee too high error | Complex op → error message displayed |
| Insufficient balance | Error → reduce amount |
| Fee estimation display | Shows cost in token + USD + tier label |
| Alto down | Error state with retry option |
| Receive | QR + copy address works |
| Transaction history | Multi-token filter, correct statuses |

### 11.4 wBTC 8-Decimal Test Cases

| Test | Input | Expected |
|------|-------|----------|
| 1-satoshi transfer | 0.00000001 wBTC | Transfer succeeds; fee buffer rounded UP |
| Rounding direction | ETH→wBTC conversion with remainder | Always round UP |
| Max supply boundary | 21M BTC × 10^8 | No overflow in BigInt |
| Dust fee buffer | fee < 1 satoshi | Fee buffer = 8 satoshis (minimum) |
| Fee > transfer | transfer=5 satoshis, fee=8 satoshis | Rejected: "Amount too small" |
| Fee buffer + transfer > balance | balance=100, transfer=99, fee=8 | Rejected: insufficient balance |
| Zero-amount transfer | 0 wBTC | Rejected: zero amount |

### 11.5 Mock Specifications

| Dependency | Mock Scenarios |
|------------|---------------|
| Alto Bundler | success, timeout (30s), rate-limited (429), invalid UserOp (400), network error |
| Arbitrum RPC | success, primary-down (failover), block-not-found |
| Chainlink oracle | fresh data, stale (5min+), zero price, API down |

### 11.5b Oracle Unit Tests (6 tests)

| # | Test | Input | Expected |
|---|------|-------|----------|
| 1 | USDT0 constant price | getTokenPriceUSD(USDT0_ADDRESS) | Returns 1e18 ($1.00), no oracle call |
| 2 | wBTC via BTC/USD feed | getTokenPriceUSD(WBTC_ADDRESS) | Returns BTC/USD price × 1e10 |
| 3 | tBTC via BTC/USD feed | getTokenPriceUSD(TBTC_ADDRESS) | Returns BTC/USD price × 1e10 |
| 4 | Stale BTC/USD feed | updatedAt = 10 minutes ago | Throws "price data is stale" |
| 5 | Fresh BTC/USD feed | updatedAt = 2 minutes ago | Returns price normally |
| 6 | Zero price from oracle | btcPrice.answer = 0 | Throws error (division by zero protection) |

### 11.5c Deposit Monitoring Tests (4 tests)

| # | Test | Input | Expected |
|---|------|-------|----------|
| 1 | Healthy deposit | deposit = 0.05 ETH | isHealthy() returns true, relay accepts |
| 2 | Low deposit warning | deposit = 0.008 ETH | Warning logged, relay still accepts |
| 3 | Critical low deposit | deposit = 0.004 ETH | isPaused = true, relay returns 503 |
| 4 | Recovery after top-up | deposit was 0.004, now 0.02 ETH | isPaused = false, relay accepts |
| ethers.js | account creation success, bundler client creation success, sendUserOp success/failure |

### 11.6 Security-Critical Tests

| # | Test | Concrete Input | Expected Output |
|---|------|----------------|------------------|
| 1 | Paymaster signature on Anvil fork | Test UserOp, sign with backend signer | SIG_VALIDATION_SUCCESS (0) |
| 2 | paymasterAndData placement | Send test UserOp through relay | paymasterAndData set, signature untouched |
| 3 | callGasLimit too high | callGasLimit = 10,000,000 | 400 "callGasLimit exceeds maximum" |
| 4 | verificationGasLimit too high | verificationGasLimit = 2,000,000 | 400 "verificationGasLimit exceeds maximum" |
| 5 | preVerificationGas too high | preVerificationGas = 200,000 | 400 "preVerificationGas exceeds maximum" |
| 6 | maxFeePerGas too high | maxFeePerGas = 10 gwei | 400 "maxFeePerGas exceeds ceiling" |
| 7 | Total gas > 5M | callGasLimit = 5,000,001 | 400 "Network fee too high" |
| 8 | callData wrong structure | callData = 0xDEADBEEF | 400 "callData must be executeBatch" |
| 9 | Fee buffer wrong recipient | Gas buffer sent to 0xSELF | 400 "Fee buffer must go to GAS_TREASURY" |
| 10 | Fee buffer too low | USDT0 feeBuffer = 1 wei | 400 "Fee buffer below minimum" |
| 11 | tBTC decimal correctness | convertToTokenFee(0.01, tBTC) | 18-decimal BigInt result |
| 12 | wBTC decimal correctness | convertToTokenFee(0.01, wBTC) | 8-decimal BigInt result |
| 13 | USDT0 non-standard ABI | Transfer on Arbitrum fork | Transaction succeeds (SafeERC20) |
| 14 | Deposit exhaustion | Paymaster deposit = 0.004 ETH | 503 "Paymaster deposit too low" |
| 15 | Tiered fee: Low tier | 150K gas estimated | $0.01 fee, tier = "Low" |
| 16 | Tiered fee: Medium tier | 300K gas estimated | $0.03 fee, tier = "Medium" |
| 17 | Tiered fee: High tier | 700K gas estimated | $0.05 fee, tier = "High" |
| 18 | Tiered fee: Very High tier | 2M gas estimated | $0.10 fee, tier = "Very High" |
| 19 | Tiered fee: Rejection | 6M gas estimated | 400 "Network fee too high" |
| 20 | Contract interaction + fee buffer | Uniswap swap + fee buffer in executeBatch | Succeeds with correct fee tier |
| 21 | On-chain fee cap: callGasLimit | Submit UserOp with callGasLimit = 6M via Anvil fork | Paymaster returns SIG_VALIDATION_FAILED on-chain |
| 22 | On-chain fee cap: total gas | Submit UserOp with total gas = 7M via Anvil fork | Paymaster returns SIG_VALIDATION_FAILED on-chain |
| 23 | Relay-time re-estimation: tier mismatch | Submit UserOp claiming Low tier but actual gas lands in Medium | 400 "Fee tier mismatch" |
| 24 | Relay-time re-estimation: tier match | Submit UserOp claiming Low tier, actual gas also Low | Relay succeeds |
| 25 | USDT0 constant price | Call convertToTokenFee(0.01, USDT0_ADDRESS) | Returns 0.01 USDT0 (1e16 wei), no oracle call |
| 26 | ALLOWED_FEE_TOKENS rejection | Fee buffer sent to non-whitelisted token (e.g. DAI) | 400 "Fee token not in allowed list" |

### 11.7 Anvil/Hardhat Fork CI Setup

```yaml
# .github/workflows/gasless-tests.yml
jobs:
  gasless-integration:
    runs-on: ubuntu-latest
    services:
      anvil:
        image: ghcr.io/foundry-rs/foundry@sha256:<PINNED_DIGEST>
        ports: ["8545:8545"]
        options: >-
          --entrypoint anvil
          -- --fork-url ${{ secrets.ARBITRUM_RPC_URL }}
            --fork-block-number latest
            --chain-id 42161
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm run test:gasless -- --fork http://localhost:8545
```

### 11.8 First-Time EIP-7702 E2E Test

| Step | Action | Expected |
|------|--------|----------|
| 1 | Create fresh wallet (no prior tx on Arbitrum Sepolia) | `getCode(eoa)` returns `0x` |
| 2 | Receive 100 USDT0 to EOA address | Balance shows 100 USDT0 |
| 3 | Init `to7702SimpleSmartAccount` | Account address = EOA address |
| 4 | Send 50 USDT0 to recipient | UserOp includes EIP-7702 auth; first tx costs ~45K extra |
| 5 | Verify: recipient balance = 50 USDT0 | Transfer succeeded |
| 6 | Verify: fee treasury received feeBuffer | Fee reimbursement collected |
| 7 | Verify: `getCode(eoa)` returns delegated code | EIP-7702 delegation active |
| 8 | Send 10 USDT0 (second transaction) | No extra auth network fees; standard flow |
| 9 | Verify: second tx succeeds | Delegation persists, no cleanup needed |

### 11.9 Chaos & Resilience Tests

| Scenario | Test | Expected Behavior |
|----------|------|-------------------|
| Alto container killed mid-bundle | Restart Docker, retry UserOp | UserOp resubmitted on retry |
| Alto replica failover | Kill alto-1, send UserOp | alto-2 picks up, transaction succeeds |
| RPC primary down | Failover to backup RPC | Bundler continues operating |
| Paymaster deposit = 0 | Submit UserOp | Backend returns 503 with clear error |
| Backend signer key rotated | Submit with old key → rejected, new key → accepted | Graceful key rotation |
| Network partition (backend ↔ Alto) | Timeout after 30s | User sees retry prompt |
| Concurrent sends (nonce collision) | Two sends in quick succession | Second queued, not lost |
| App kill mid-transaction | Kill Capacitor app, restart | Check on-chain state, show correct status |
| Chainlink oracle stale | Price data > 5min old | Backend rejects estimation, returns 503 |
| Gas spike within buffer (19%) | Mock network fee increase of 19% | Buffer covers it → tx succeeds |
| Gas spike above buffer (21%) | Mock network fee increase of 21% | Buffer insufficient → tx reverts → user prompted to retry |
| Chainlink oracle returns zero | Oracle returns 0 | Backend rejects, returns 503 "Invalid price" |

### 11.10 Performance Baselines

| Metric | Target | Measurement |
|--------|--------|-------------|
| Fee estimation latency | < 500ms (p95) | Time from estimate request to response |
| Relay latency | < 2s (p95) | Time from UserOp submission to bundler hash |
| Confirmation time | < 10s (p95) | Time from UserOp to on-chain receipt |
| Alto throughput | > 50 UserOps/min | Concurrent UserOp submissions |
| Backend memory | < 200MB steady state | Monitor during load test |
| Signing time (UserOp) | < 200ms (p95) | Time to sign UserOp with smart account |
| Balance fetch (3 tokens) | < 1s (p95) | Parallel balance reads |
| UserOp size | < 1KB | Encoded UserOp payload size |
| Estimation accuracy | ±20% of actual network fee | Compare estimated vs actual |

### 11.11 EIP-7702 Escape Hatch Test

| Step | Action | Expected |
|------|--------|----------|
| 1 | Set up user with active EIP-7702 delegation on Anvil fork | `getCode(eoa)` returns delegated code |
| 2 | Shut down Alto + NestJS backend | Services unavailable |
| 3 | User connects to Pimlico's public bundler | Public bundler accepts the UserOp |
| 4 | User submits cleanup UserOp via public bundler | Transaction succeeds |
| 5 | Verify: `getCode(eoa)` returns `0x` | Delegation revoked without BitTasker |

---

## 12. Risk Analysis

| # | Risk | Severity | Mitigation |
|---|------|----------|------------|
| 1 | Alto bundler down | HIGH | Health check before tx; retry logic; 2 replicas with failover |
| 2 | Paymaster deposit exhausted | HIGH | Deposit monitoring cron; auto-pause at < 0.005 ETH; alert at < 0.01 ETH |
| 3 | User has insufficient token balance for fee buffer | MEDIUM | Pre-flight balance check; show exact shortfall |
| 4 | wBTC 8-decimal precision | MEDIUM | BigInt-only arithmetic; always round UP; minimum 8 satoshis buffer |
| 5 | tBTC 18-decimal confusion with wBTC | HIGH | Explicit per-token decimal handling; 10 unit tests |
| 6 | USDT0 depeg | HIGH | Circuit breaker at 5% deviation; block sends, allow receives |
| 7 | Network fee spike between estimate and execution | MEDIUM | Tiered fee model has built-in margin; 20% buffer within each tier |
| 8 | Paymaster signature mismatch | CRITICAL | Anvil fork test verifies against real contract |
| 9 | ethers.js breaking changes | MEDIUM | Pin exact version; test before upgrade |
| 10 | Alto Docker crash | MEDIUM | Docker restart policy; health check; 2 replicas |
| 11 | Cross-chain replay | LOW | EIP-7702 authorization signed for chain 42161 only |
| 12 | wallet-core breaking change for existing users | LOW | Arbitrum is additive; existing RSK/BSC code unchanged |
| 13 | Escrow not on Arbitrum | INFO | Escrow phase excluded; wallet send/receive/interact only |
| 14 | Bundler wallet private key compromise | CRITICAL | Docker secrets; rotated quarterly; rate limiting |
| 15 | Paymaster signer key compromise | CRITICAL | Docker secrets; rotated quarterly; contract owner can update signer |
| 16 | Paymaster drain via inflated fee params | CRITICAL | Backend validates all fee params + on-chain caps in paymaster contract |
| 17 | Arbitrary contract calls sponsored | MEDIUM | Tiered fee model ensures paymaster is compensated; 5M gas cap |
| 18 | Existing key management system affected | CRITICAL | No changes to key management; same key for EOA and smart account |
| 19 | EIP-7702 delegation stuck if BitTasker goes down | HIGH | Escape hatch: public impl, any bundler can revoke |
| 20 | Docker image supply chain attack | HIGH | Pin to SHA256 digest |
| 21 | Alto bypassed by direct API calls | HIGH | Alto exposed only via internal Docker network |
| 22 | UserOp signature overwritten | CRITICAL | paymasterAndData field used for sponsorship; user signature untouched |
| 23 | Chainlink oracle manipulation | LOW | Decentralized oracle; 5-min staleness check; multi-feed validation |
| 24 | Network fee too high for complex ops | MEDIUM | 5M gas rejection with clear error message |
| 25 | Pre-flight simulation false positive | LOW | Simulation via eth_call; if false positive, user retries |

---

## 13. Decision Log

| ID | Decision | Rationale |
|----|----------|-----------|
| D-001 | Self-hosted (not Gelato) | Zero external dependencies, no API keys, full control |
| D-002 | Arbitrum One | Sub-cent network fees, post-Pectra EIP-7702, largest L2 TVL |
| D-003 | Tiered fee model | Simple transfers $0.01, contract interactions $0.03-$0.10, reject >5M gas |
| D-004 | ethers.js SDK | Core library: EIP-7702 support + self-hosted bundler |
| D-005 | Alto bundler | Open source (Apache 2.0), EIP-7702 support, production-proven |
| D-006 | Coinbase VerifyingPaymaster | Audited (Nov 2024), MIT, minimal adaptation for v0.8 |
| D-007 | EIP-7702 (not counterfactual) | Preserves user's EOA address; compatible with existing systems |
| D-008 | No wagmi | Single chain, single signer — ethers.js + thin Svelte store is simpler |
| D-009 | Existing wallet UI unchanged | No modifications to asset display or navigation; Arbitrum tokens added to existing list |
| D-010 | wallet-core gets ArbitrumWallet | Follows existing BSC/RSK pattern; SDK handles provider + balances only |
| D-011 | AA logic in app layer | SDK stays chain-focused; ethers.js handles AA in Svelte store |
| D-012 | Existing key management unchanged | Critical system, currently stable; same key for EOA and smart account |
| D-013 | Three tokens from day one | USDT0 + wBTC + tBTC; registry pattern makes this trivial |
| D-014 | Escrow excluded | Escrow not deployed on Arbitrum; wallet send/receive/interact only |
| D-015 | Pre-transaction fee estimation | User sees exact cost before signing; no hidden fees |
| D-016 | No automatic ETH swap | Manual weekly top-up sufficient at current scale |
| D-017 | Gelato plan superseded | Architecture changed fundamentally |
| D-018 | CLI verification before UI | Every component verifiable from command line; 10 scripts + verify-all.sh |
| D-019 | Server-side fee estimation | All precision-sensitive math on NestJS backend; client is thin caller |
| D-020 | Contract interaction support | Any contract call allowed via executeBatch; tiered fee ensures compensation |
| D-021 | Bundler redundancy | 2 Alto replicas + sendWithFallback(); eliminates SPOF |
| D-022 | EIP-7702 escape hatch | Public impl; any bundler can revoke; no BitTasker dependency for fund safety |
| D-023 | 5M gas rejection | Prevents excessive network fees; clear error message for complex ops |
| D-024 | On-chain paymaster fee caps | Defense-in-depth: even if backend validation bypassed, contract enforces limits |
| D-025 | Pre-flight simulation | Verify UserOp won't revert before submission; prevents wasted paymaster funds |
| D-026 | Deposit monitoring cron | Auto-pause relay at < 0.005 ETH; prevents silent failures |
| D-027 | Chainlink price oracle | Manipulation-resistant; replaces undefined getEthPrice() API |
| D-028 | Docker secrets | Private keys in Docker secrets, not env vars or source code |
| D-029 | UTILITY_PRIVATE_KEY documented | Alto's utility key; separate from bundler key; stored in Docker secrets |
| D-030 | Arbitrum Sepolia for development | Free testnet ETH from faucets (no API key); Anvil fork for contract tests |
| D-031 | Git branches for external repos | wallet-core → feat/arbitrum-wallet; NestJS → feat/gasless-module |
| D-032 | USDT0 price as constant ($1.00) | USDT0 is pegged to USD; no oracle needed; avoids staleness risk; fixes 2500x calculation bug |
| D-033 | ALLOWED_FEE_TOKENS whitelist check | Validate fee token against whitelist before MIN/MAX bounds check; prevents undefined key access |
| D-034 | Relay-time fee re-estimation | Prevents tier boundary exploitation; re-estimates at relay time and rejects if tier exceeded |

# Test Strategy Review: Gasless ERC-4337 + EIP-7702 on Arbitrum One

> **Reviewer**: Test Engineer (agent profile)
> **Date**: 2026-06-05
> **Source**: `requirements/gasless-arbitrum-plan.md` (835 lines, Section 10)
> **Cross-referenced**: Security Audit (`gasless-arbitrum-security-audit.md`), Code Review (`gasless-arbitrum-code-review.md`), Previous Test Review (`gelato-eip7702-test-strategy-review.md`)
> **Baseline**: `wallet-core/src/test/chains/bsc/BSCWallet.test.ts` (637 lines, 21 test groups)
> **Overall Confidence Score**: **61/100**

---

## Executive Summary

The self-hosted architecture significantly improves testability over the Gelato plan — eliminating external API dependencies, delegation recovery state machines, and Capacitor lifecycle concerns. The plan correctly identifies the three layers (wallet-core, NestJS backend, Svelte app) and specifies concrete wBTC 8-decimal test cases and mock scenarios. This is a meaningful improvement over the previous plan's "list modules, not test cases" approach.

However, the test strategy has **five critical blind spots** that map directly to the most severe findings from the security audit and code review:

1. **No test verifies paymaster signature placement** — the plan's own pseudocode (CRITICAL-1 in security audit) overwrites the user's signature with the paymaster signature. The test strategy has zero tests for this failure mode.
2. **No test verifies paymaster hash computation** — the custom signing scheme (CRITICAL-2) doesn't match the Coinbase VerifyingPaymaster contract. A contract-verification test would catch this.
3. **No test for gas parameter bounds validation** — the relay endpoint accepts arbitrary gas limits, enabling paymaster drain. No test enforces bounds.
4. **No test for tBTC decimal handling** — the `convertUSDToToken` function treats tBTC as 8-decimal (C-3), producing a gas buffer 10^10x too small. The wBTC test suite exists but tBTC is not tested.
5. **No test for callData structure validation** — arbitrary contract calls can be sponsored.

The mock strategy (Section 10.5) is well-structured but missing scenarios for the paymaster signer and backend validation logic. Performance and chaos testing are entirely absent.

---

## 1. Test Coverage Gaps

### 1.1 Critical Gaps — Mapped to Security Audit Findings

| Security Finding | Severity | Test Status | Gap Description |
|-----------------|----------|-------------|----------------|
| CRITICAL-1: Signature overwrites UserOp.signature | CRITICAL | **NOT TESTED** | No test verifies that paymaster data goes into `paymasterAndData` field, not `signature`. A single integration test with a mock EntryPoint would catch this immediately. |
| CRITICAL-2: Custom hash ≠ contract hash | CRITICAL | **NOT TESTED** | No test verifies paymaster signature against the Coinbase VerifyingPaymaster contract's `validatePaymasterUserOp`. Should use `eth_call` simulation on a fork. |
| CRITICAL-3: No gas parameter validation | CRITICAL | **NOT TESTED** | No test submits a UserOp with `callGasLimit=10_000_000` to the relay endpoint and verifies rejection. Paymaster drain is untestable without bounds tests. |
| MEDIUM-1: No callData validation | MEDIUM | **NOT TESTED** | No test submits a UserOp with arbitrary callData (e.g., ERC-20 `approve()`) and verifies rejection. |
| MEDIUM-2: Zero gas buffer accepted | MEDIUM | **NOT TESTED** | No test submits `gasBuffer=0` in the callData and verifies the backend rejects it. |
| MEDIUM-3: Failed UserOp absorbs paymaster gas | MEDIUM | **NOT TESTED** | No test for a UserOp that reverts during execution — paymaster pays gas, treasury gets nothing. |
| MEDIUM-7: USDT0 non-standard return | MEDIUM | **NOT TESTED** | No test verifies that `Simple7702Account.execute()` handles USDT0's missing boolean return from `transfer()`. |
| MEDIUM-8: ETH price oracle undefined | MEDIUM | **NOT TESTED** | `getEthPrice()` is unspecified — no test for stale price, zero price, or API-down scenarios. |

### 1.2 Critical Gaps — Mapped to Code Review Findings

| Code Review Finding | Severity | Test Status | Gap Description |
|--------------------|----------|-------------|----------------|
| C-3: tBTC treated as 8-decimal | CRITICAL | **NOT TESTED** | `convertUSDToToken` uses `1e8` for both wBTC and tBTC. tBTC has 18 decimals. Gas buffer is 10^10x too small. Only wBTC precision tests exist. |
| C-4: Client submits directly to bundler | CRITICAL | **NOT TESTED** | No test verifies the full flow goes through the NestJS backend relay (not direct to Alto). If the client code sends directly, paymaster never signs. |
| C-5: estimateUserOperationGas API incorrect | CRITICAL | **NOT TESTED** | No test verifies that `estimateUserOperationGas` is called with the correct parameter shape. |

### 1.3 Gaps Not Covered by Any Test Layer

| Scenario | Layer Needed | Why It Matters |
|----------|-------------|----------------|
| UserOp with all gas params at MAX_SAFE_INTEGER | Unit + Integration | BigInt overflow in gas calculations |
| Transfer to zero address | Unit | ERC-20 `transfer(0x0, amount)` behavior varies by token |
| Transfer to EntryPoint address | Integration | Tokens sent to EntryPoint become irrecoverable |
| Backend signer key rotated mid-session | Integration | Old signatures should fail; new ones succeed |
| Paymaster deposit exactly at minimum | Integration | Race between deposit check and UserOp submission |
| Two concurrent relay requests for same account | Integration | Nonce management at Alto level |
| Backend receives UserOp for unregistered smart account | Unit | Account ownership verification |
| Malformed UserOp JSON (missing fields, wrong types) | Unit | DTO validation robustness |
| JWT token expires during relay | Unit | Auth guard behavior with stale tokens |
| Alto returns partial success (some ops in bundle fail) | Integration | Partial failure handling |

---

## 2. wBTC 8-Decimal Test Cases

### 2.1 What's Covered (10 tests in Section 10.4)

| # | Test | Coverage Quality |
|---|------|-----------------|
| 1 | 1-satoshi transfer | ✅ Good |
| 2 | Rounding direction | ✅ Good |
| 3 | Max supply boundary | ✅ Good |
| 4 | Dust reimbursement (min 8 sat) | ✅ Good |
| 5 | Gas > transfer rejected | ✅ Good |
| 6 | Reimbursement + transfer > balance | ✅ Good |
| 7 | Precision accumulation | ✅ Good |
| 8 | Zero-amount transfer rejected | ✅ Good |
| 9 | Self-transfer | ✅ Good |
| 10 | Buffer scaling (min 8 sat) | ✅ Good |

### 2.2 What's Missing from wBTC Suite

| # | Missing Test | Type | Why It Matters |
|---|-------------|------|----------------|
| 11 | **Formatted display: 8 decimal places exactly** | Unit | UI must show `0.00000001` not `1e-8` or `0.00` |
| 12 | **String→BigInt parsing rejects scientific notation** | Unit | `"1e-8"` must not parse as float; must use string conversion |
| 13 | **ETH→wBTC price ratio with >8 significant digits** | Unit | `0.000014537892347 ETH/wBTC` → truncate/round correctly |
| 14 | **"< $0.01" display for sub-cent gas costs** | E2E | wBTC gas ~$0.004; verify UI doesn't show "$0.00" or "0.00 wBTC" |
| 15 | **Gas buffer rounding with BTC at $100K+** | Unit | Higher BTC price = smaller satoshi equivalent; verify buffer still ≥ 8 sat |
| 16 | **Simultaneous wBTC + USDT0 transfers** | Integration | Two tokens with different decimals in same session |
| 17 | **wBTC allowance interaction** | Integration | If token requires approval before transfer, verify gas buffer doesn't interfere |
| 18 | **Negative amount rejection** | Unit | `-1` wBTC must be rejected before BigInt conversion |
| 19 | **Transfer amount = max uint256** | Unit | Overflow protection in batched callData encoding |
| 20 | **Price oracle returns 0 for BTC** | Unit | Division by zero in `convertUSDToToken` |

### 2.3 Verdict

The 10 planned wBTC tests are **substantially better** than the previous plan (which had zero concrete wBTC tests). They cover the critical precision scenarios. However, they focus exclusively on arithmetic precision and miss:
- **Display formatting** (user-facing)
- **Input validation** (negative, overflow)
- **Price oracle edge cases** (zero, stale)
- **Cross-token interactions** (wBTC + USDT0 in same session)

**Recommendation**: Add tests 11-15 (display, parsing, price scaling) before implementation. Tests 16-20 are important for production.

---

## 3. Integration Test Completeness

### 3.1 Current Integration Tests (7 flows, Section 10.2)

| # | Flow | Coverage |
|---|------|----------|
| 1 | Send USDT0 (full flow, mocked Alto) | ✅ |
| 2 | Send wBTC (8-decimal, dust amounts) | ✅ |
| 3 | Send tBTC (standard 18-decimal) | ✅ |
| 4 | Gas estimation (accurate, buffer, wBTC rounding) | ✅ |
| 5 | Insufficient balance (pre-flight blocks) | ✅ |
| 6 | Alto unavailable (error + retry) | ✅ |
| 7 | First-time send (EIP-7702 auth included) | ✅ |

### 3.2 Missing Integration Flows

| # | Missing Flow | Priority | Why |
|---|-------------|----------|----|
| 8 | **Paymaster signature verification** — sign + verify against contract | CRITICAL | Verifies CRITICAL-1 and CRITICAL-2 fixes. Use Arbitrum fork with deployed VerifyingPaymaster. |
| 9 | **Gas parameter bounds enforcement** — submit inflated params, verify rejection | CRITICAL | Verifies CRITICAL-3 fix. Test each param at boundary + 1. |
| 10 | **callData validation** — submit arbitrary callData, verify rejection | HIGH | Verifies MEDIUM-1 fix. Test: approve(), transfer to unknown address, non-ERC20 call. |
| 11 | **tBTC 18-decimal gas buffer** — verify tBTC buffer is 10^18-based, not 10^8 | CRITICAL | Verifies C-3 fix. Compare tBTC buffer magnitude vs wBTC buffer. |
| 12 | **Backend relay flow** — verify client goes through NestJS, not direct to Alto | CRITICAL | Verifies C-4 fix. Mock Alto and verify it receives paymasterAndData. |
| 13 | **Zero gas buffer rejection** — submit gasBuffer=0, verify backend rejects | HIGH | Verifies MEDIUM-2 fix. |
| 14 | **USDT0 non-standard transfer** — verify `transfer()` works without boolean return | HIGH | Verifies MEDIUM-7. Use USDT0 contract on Arbitrum fork. |
| 15 | **Paymaster deposit exhaustion** — simulate deposit=0, verify graceful error | HIGH | Verifies MEDIUM-6 monitoring/alerting path. |
| 16 | **UserOp execution revert** — simulate token blacklist, verify paymaster not charged for failed op | MEDIUM | Verifies MEDIUM-3 mitigation (pre-flight simulation). |
| 17 | **JWT expiration during relay** — expired token, verify 401 | MEDIUM | Auth edge case. |
| 18 | **Concurrent relay requests** — 2 requests for same account simultaneously | MEDIUM | Alto nonce management. |
| 19 | **Cross-chain replay protection** — submit UserOp with wrong chainId | MEDIUM | Risk #11. Verify EntryPoint rejects. |
| 20 | **ETH price stale/zero** — mock oracle returns stale data, verify buffer calculation | MEDIUM | MEDIUM-8 mitigation. |

### 3.3 Verdict

The 7 planned integration tests cover the **happy path** well but are critically missing tests for:
- The paymaster signing flow (the most error-prone component per both audits)
- Input validation boundaries on the backend relay
- Token-specific edge cases (tBTC decimal bug, USDT0 non-standard ABI)

**The integration test layer is where CRITICAL-1, CRITICAL-2, and C-3 would be caught.** Without these tests, the implementation bugs found in the security and code reviews would ship to production undetected.

---

## 4. E2E Test Completeness

### 4.1 Current E2E Flows (9 tests, Section 10.3)

| # | Flow | Coverage |
|---|------|----------|
| 1 | Send USDT0 (happy) | ✅ |
| 2 | Send wBTC (happy) | ✅ |
| 3 | Send tBTC (happy) | ✅ |
| 4 | Insufficient balance → reduce amount | ✅ |
| 5 | Gas estimation display (token + fiat) | ✅ |
| 6 | Alto down → error + retry | ✅ |
| 7 | Receive (QR + copy address) | ✅ |
| 8 | Transaction history (multi-token filter) | ✅ |
| 9 | Asset accordion (Bitcoin/Dollars grouping) | ✅ |

### 4.2 Missing E2E Flows

| # | Missing Flow | Priority | Why |
|---|-------------|----------|----|
| 10 | **First-time send** — EIP-7702 authorization signing UX | HIGH | Plan lists this in integration tests but not E2E. User sees authorization prompt? What's the UX? |
| 11 | **Large transfer** — 95% of balance | HIGH | Gas buffer must be deducted; UI must show "insufficient" if too close to max. |
| 12 | **wBTC dust transfer** — 0.00000001 wBTC (1 satoshi) | MEDIUM | 8-decimal minimum; gas reimbursement may exceed transfer amount. UI must block. |
| 13 | **Token selector switch mid-flow** — start USDT0, switch to wBTC | MEDIUM | Gas estimate must recalculate for different decimals. |
| 14 | **Sub-cent gas display** — verify "$0.005" shown, not "$0.00" or "0.00000008" | MEDIUM | User-facing precision for micro-amounts. |
| 15 | **Send to contract address** — not an EOA | LOW | ERC-20 transfer to contract may behave differently. |
| 16 | **Self-transfer** — send to own address | LOW | Verify no double-execution or unexpected behavior. |
| 17 | **Error recovery** — Alto timeout → retry → success | MEDIUM | User clicks retry, second attempt succeeds. |
| 18 | **Paginated transaction history** — >50 transactions | LOW | Performance and pagination correctness. |

### 4.3 Verdict

The 9 E2E tests cover the primary user flows well. The self-hosted architecture eliminates several complex E2E scenarios from the Gelato plan (delegation recovery, app backgrounding, chain lock) which simplifies the test surface significantly.

**Critical gap**: No E2E test for the first-time EIP-7702 authorization flow. This is the single most novel UX element and has no Playwright coverage.

**Important gap**: No E2E test for large transfers (near-balance-edge). This is where gas buffer arithmetic bugs would surface in the UI.

---

## 5. Mock Specifications

### 5.1 Current Mock Coverage (Section 10.5)

| Dependency | Mock Scenarios | Quality |
|------------|---------------|---------|
| Alto Bundler | success, timeout (30s), rate-limited (429), invalid UserOp (400), network error | ✅ Good |
| Arbitrum RPC | success, primary-down (failover), block-not-found | ⚠️ Partial |
| ETH price API | fresh data, stale (5min+), zero price, API down | ✅ Good |
| ethers.js | account creation success, bundler client creation success, sendUserOp success/failure | ⚠️ Partial |

### 5.2 Missing Mock Scenarios

#### Alto Bundler (additions needed)

| Scenario | Why |
|----------|-----|
| **Partial bundle success** — some ops in bundle succeed, some fail | Alto bundles multiple UserOps; partial failure is possible |
| **Nonce too low** — UserOp nonce already used | Race condition between concurrent sends |
| **Insufficient paymaster stake** — paymaster not staked at EntryPoint | Operational error during deployment |
| **UserOp valid but execution reverts** — Alto accepts but EntryPoint rejects | Pre-flight simulation vs actual execution gap |
| **Slow response (29s)** — just under timeout | Boundary test for timeout logic |

#### NestJS Backend (completely missing)

The plan mocks Alto and RPC but **does not specify mocks for the NestJS backend itself**. This is the most critical component to mock because it:
- Verifies JWT auth
- Validates wallet ownership
- Validates gas parameters (after fixes)
- Validates callData structure (after fixes)
- Signs paymaster data
- Forwards to Alto

| Mock Scenario | Why |
|--------------|-----|
| **Valid JWT + valid UserOp** → success | Happy path |
| **Expired JWT** → 401 | Auth guard |
| **Valid JWT + wrong sender** → 403 | Ownership check |
| **Valid JWT + inflated callGasLimit** → 400 | Gas parameter bounds |
| **Valid JWT + arbitrary callData** → 400 | callData validation |
| **Valid JWT + gasBuffer=0** → 400 | Buffer sufficiency |
| **Paymaster signer throws** → 500 | Signing failure |
| **Alto returns 429** → relay returns 429 with retry-after | Rate limit propagation |
| **Alto timeout** → relay returns 504 | Timeout propagation |

#### VerifyingPaymaster Contract (completely missing)

| Mock Scenario | Why |
|--------------|-----|
| **Valid sponsorship** → paymaster pays gas | Happy path |
| **Invalid signature** → SIG_VALIDATION_FAILED | Wrong signer or wrong hash |
| **Insufficient deposit** → paymaster can't pay | Deposit exhaustion |
| **Gas limit exceeded** → paymaster refuses | On-chain gas cap |

#### ethers.js (additions needed)

| Mock Scenario | Why |
|--------------|-----|
| **to7702SimpleSmartAccount throws** → account creation fails | Invalid private key, network error |
| **signUserOperation fails** → signing error | Key unavailable, hardware wallet disconnect |
| **encodeUserOp fails** → encoding error | Invalid callData, contract not deployed |
| **getChainId returns wrong chain** → chain mismatch | Network configuration error |

### 5.3 Mock Architecture Concern

The plan mocks at the module level (`vi.mock()`). For the NestJS backend, this means mocking the Alto client and the ethers signer. However, **the paymaster signing logic is the most complex and error-prone component** — it should be tested with both:
1. **Unit mocks** — mock the ethers signer, verify hash computation
2. **Contract simulation** — deploy VerifyingPaymaster on a local Hardhat fork, sign locally, verify via `eth_call`

The second approach would have caught both CRITICAL-1 and CRITICAL-2. Module-level mocks alone cannot verify that the hash matches the contract's expectation.

---

## 6. Security Test Cases

### 6.1 Mapping Security Risks to Test Coverage

| Risk # | Risk | Severity | Test Covered? | Gap |
|--------|------|----------|---------------|-----|
| 1 | Alto bundler down | HIGH | ✅ Integration #6, E2E #6 | Retry count/timing not specified |
| 2 | Paymaster deposit exhausted | HIGH | ❌ | No test for deposit=0 scenario |
| 3 | Insufficient token balance for buffer | MEDIUM | ✅ Integration #5, E2E #4 | — |
| 4 | wBTC 8-decimal precision | MEDIUM | ✅ 10 unit tests | Missing: tBTC parallel test, display tests |
| 5 | tBTC low liquidity | LOW | N/A | No test needed (operational concern) |
| 6 | USDT0 depeg | HIGH | ❌ | No test for depeg detection or send-blocking |
| 7 | Gas price spike (20% buffer) | MEDIUM | ❌ | No boundary test (19% spike OK, 21% spike fails) |
| 8 | VerifyingPaymaster contract bug | LOW | ❌ | No contract-level integration test |
| 9 | ethers.js breaking changes | MEDIUM | N/A | Operational concern (pin version) |
| 10 | Alto Docker crash | MEDIUM | ✅ E2E #6 | Health check endpoint not tested |
| 11 | Cross-chain replay | LOW | ❌ | No chainId validation test |
| 12 | wallet-core breaking change | LOW | ✅ ArbitrumWallet tests | Additive change, low risk |
| 13 | Escrow not on Arbitrum | INFO | N/A | — |
| 14 | Bundler private key compromise | CRITICAL | ❌ | No test for key rotation scenario |
| 15 | Paymaster signer compromise | CRITICAL | ❌ | No test for signer rotation or old-signer rejection |

### 6.2 Security Test Cases from Audit Findings (Not in Plan)

These tests are **required** to verify the critical/high security findings:

| # | Test | Verifies | Type |
|---|------|----------|------|
| 1 | **Paymaster signature in paymasterAndData, not signature** | CRITICAL-1 | Integration |
| 2 | **Paymaster hash matches contract's validatePaymasterUserOp** | CRITICAL-2 | Integration (fork) |
| 3 | **Inflated callGasLimit rejected** | CRITICAL-3 | Unit + Integration |
| 4 | **Inflated verificationGasLimit rejected** | CRITICAL-3 | Unit + Integration |
| 5 | **Inflated preVerificationGas rejected** | CRITICAL-3 | Unit + Integration |
| 6 | **Inflated maxFeePerGas rejected (150% of current)** | CRITICAL-3 | Unit + Integration |
| 7 | **callData with approve() rejected** | MEDIUM-1 | Unit + Integration |
| 8 | **callData with transfer to unknown address rejected** | MEDIUM-1 | Unit + Integration |
| 9 | **gasBuffer=0 rejected** | MEDIUM-2 | Unit + Integration |
| 10 | **gasBuffer below minimum rejected** | MEDIUM-2 | Unit + Integration |
| 11 | **Reverting UserOp detected by pre-flight simulation** | MEDIUM-3 | Integration |
| 12 | **USDT0 transfer() without return value succeeds** | MEDIUM-7 | Integration (fork) |
| 13 | **Stale ETH price → higher buffer or rejection** | MEDIUM-8 | Unit |
| 14 | **Zero ETH price → rejection (not division by zero)** | MEDIUM-8 | Unit |
| 15 | **Signer rotation: old signer rejected, new signer accepted** | HIGH-6 | Integration |
| 16 | **Paymaster deposit below threshold → relay pauses** | MEDIUM-6 | Integration |
| 17 | **tBTC buffer uses 10^18 not 10^8** | C-3 (code review) | Unit |
| 18 | **Client flow goes through NestJS relay, not direct to Alto** | C-4 (code review) | Integration |

---

## 7. Test Infrastructure

### 7.1 Tooling Assessment

| Tool | Purpose | Assessment |
|------|---------|------------|
| **Vitest** | Unit + Integration tests | ✅ Appropriate. Already used in project. Fast, ESM-native, good TypeScript support. |
| **Playwright** | E2E tests | ✅ Appropriate. Already configured in project (`playwright.config.ts`). Good for Svelte/Kit. |
| **vi.mock()** | Module mocking | ⚠️ Adequate for most mocks but insufficient for contract-level verification. Need Hardhat/fork. |

### 7.2 Missing Test Infrastructure

| Need | Why | Recommendation |
|------|-----|----------------|
| **Arbitrum fork (Hardhat/Anvil)** | CRITICAL-1 and CRITICAL-2 require deploying VerifyingPaymaster and verifying signatures against the real contract. Module mocks cannot test hash compatibility. | Use Anvil (`anvil --fork-url $ARBITRUM_RPC`) in CI. Deploy VerifyingPaymaster once, reuse across tests. |
| **Deterministic price oracle mock** | Gas estimation depends on ETH and token prices. Tests must be deterministic. | Inject `PriceOracle` interface with in-memory implementation for tests. |
| **Fake Alto bundler** | Integration tests need a mock HTTP server that mimics Alto's JSON-RPC interface. | Use `msw` (Mock Service Worker) or a simple Express server in test setup. |
| **Test JWT factory** | Auth tests need valid/expired/invalid JWTs. | Create a `TestAuthFactory` that generates tokens with configurable expiry and claims. |
| **Gas parameter snapshot testing** | Gas costs on Arbitrum change. Tests should verify relative bounds, not absolute values. | Test that gas buffer is within 50%-200% of expected, not exact values. |

### 7.3 CI/CD Test Pipeline

The plan mentions Vitest and Playwright but does not describe the CI pipeline. For a gasless system:

| Stage | Tests | Environment |
|-------|-------|-------------|
| **Pre-commit** | Unit tests (Vitest) | Local |
| **PR** | Unit + Integration (Vitest) | CI + Anvil fork |
| **Pre-merge** | Unit + Integration + E2E (Playwright) | CI + Anvil fork + test browser |
| **Nightly** | Full suite + contract simulation + gas cost regression | CI + Anvil fork + Arbitrum mainnet fork |

---

## 8. Performance Testing

### 8.1 Current State

**No performance tests exist.** The plan does not mention performance testing at all.

### 8.2 Required Performance Tests

| # | Test | Why | Target |
|---|------|-----|--------|
| 1 | **Gas estimation latency** — `/gasless/estimate` response time | User sees "estimating..." spinner. Slow estimation = bad UX. | < 2s (Alto round-trip) |
| 2 | **Relay endpoint throughput** — requests/second | At scale, concurrent sends must not queue. | > 100 rps |
| 3 | **Alto bundler latency** — sendUserOperation to inclusion | User sees "pending" state. Slow bundler = bad UX. | < 30s on Arbitrum |
| 4 | **Paymaster signing time** — signature computation | Should be negligible but verify. | < 50ms |
| 5 | **Balance check latency** — `balanceOf` for 3 tokens | Wallet page load time. | < 1s (parallel fetch) |
| 6 | **UserOp size** — serialized UserOp byte size | Alto has max UserOp size. Verify batched calls fit. | < 64KB |
| 7 | **Gas estimation accuracy** — estimated vs actual gas | Buffer adequacy over time. Track P50/P95/P99. | P95 within 20% of actual |

### 8.3 Gas Cost Regression Testing

| # | Test | Why |
|---|------|-----|
| 1 | **Fixed buffer adequacy** — run 100 transfers, verify all succeed with current buffer | Buffer may become insufficient as gas prices change |
| 2 | **Buffer vs actual cost tracking** — log estimated vs actual, alert on drift | Operational monitoring |
| 3 | **Token price impact** — at BTC=$100K, $200K, verify buffer still covers gas | Price scaling |

---

## 9. Chaos/Resilience Testing

### 9.1 Current State

The plan lists "Alto unavailable" as an integration test but does not specify chaos scenarios.

### 9.2 Required Chaos Tests

| # | Scenario | Expected Behavior | Test Type |
|---|----------|-------------------|-----------|
| 1 | **Alto Docker container killed mid-UserOp** | Relay returns error; user sees retry option; no funds lost | Integration |
| 2 | **Alto restart during active UserOps** | Pending UserOps resubmitted or reported as failed | Integration |
| 3 | **RPC provider outage (Alchemy down)** | Alto cannot submit; relay returns 503; user sees error | Integration |
| 4 | **RPC provider rate-limited (429)** | Alto retries with backoff; relay propagates 429 with retry-after | Integration |
| 5 | **Paymaster deposit drops to 0 during transaction batch** | Partial batch succeeds (pre-deposit ops); remaining fail gracefully | Integration |
| 6 | **Backend signer key becomes invalid** (rotation in progress) | Relay returns 503; no UserOps submitted with bad signatures | Integration |
| 7 | **Network partition between backend and Alto** | Backend detects timeout; returns 504 to client | Integration |
| 8 | **JWT secret rotation** | Old tokens rejected; new tokens accepted; no session corruption | Unit |
| 9 | **Concurrent 100 relay requests** | Rate limiting activates; no crashes; graceful degradation | Load test |
| 10 | **Alto returns success but UserOp never lands on-chain** | Client-side timeout + status check; eventual consistency | E2E |

### 9.3 Paymaster Exhaustion Scenario

This is the most critical chaos scenario because it causes **complete service outage**:

| Phase | State | Test |
|-------|-------|------|
| Deposit = 0.1 ETH | Normal | 100 transactions succeed |
| Deposit = 0.01 ETH | Warning | Alert fires; relay still works |
| Deposit = 0.005 ETH | Critical | Relay pauses; new requests get 503 |
| Deposit replenished | Recovery | Relay resumes; queued requests retry |
| Deposit = 0 during batch | Partial | Some ops succeed, others fail; no data corruption |

---

## 10. Regression Testing

### 10.1 Token Addition Regression

The plan specifies adding tokens via `StablecoinRegistry` with no UI code changes. Regression tests must verify:

| # | Test | Why |
|---|------|-----|
| 1 | **New token appears in asset accordion** | UI auto-adapts from registry |
| 2 | **New token gas estimation works** | Buffer calculation handles any decimal count |
| 3 | **New token send flow works end-to-end** | Full transfer with gas buffer |
| 4 | **Existing tokens unaffected** | Adding USDC doesn't break USDT0/wBTC/tBTC |
| 5 | **Decimal handling for non-standard tokens** | Tokens with 6 decimals (USDC), 18 decimals (DAI) |
| 6 | **Token with no price feed** | Graceful error when price oracle doesn't cover new token |

### 10.2 Existing Feature Regression

| # | Test | Why |
|---|------|-----|
| 1 | **RSK/BSC wallet functionality unchanged** | ArbitrumWallet is additive; no existing code modified |
| 2 | **Escrow flow unaffected** | Escrow excluded from Arbitrum; verify no interference |
| 3 | **Authentication flow unaffected** | JWT auth reused; verify no breakage |
| 4 | **Transaction history for other chains** | Arbitrum txs don't pollute RSK/BSC history |

### 10.3 Dependency Upgrade Regression

| # | Test | Why |
|---|------|-----|
| 1 | **ethers.js version upgrade** | Pin exact version; test before upgrade; run full suite |
| 2 | **ethers.js version upgrade** | ethers.js breaking changes may affect dependent code |
| 3 | **Alto Docker image update** | Pin digest; test on staging before production |
| 4 | **EntryPoint version** | v0.8 is current; verify no migration needed for v0.9 |

---

## 11. Comparison: Previous Review vs This Review

| Aspect | Gelato Plan (45/100) | Self-Hosted Plan (61/100) | Delta |
|--------|---------------------|--------------------------|-------|
| wBTC 8-decimal tests | 0 concrete tests | 10 concrete tests | +10 ✅ |
| Mock specifications | Not specified | 4 dependencies, 18 scenarios | +18 ✅ |
| ArbitrumWallet parity | "Same pattern" | 10 test groups enumerated | +10 ✅ |
| High-severity risk tests | 0 of 8 risks tested | 3 of 15 risks tested | +3 ⚠️ |
| E2E flows | 10 planned | 9 planned | -1 (removed delegation recovery) |
| Integration tests | 7 flows | 7 flows | 0 |
| Paymaster signing tests | N/A (Gelato handled it) | 0 tests | -1 🔴 |
| Gas parameter validation | N/A (Gelato handled it) | 0 tests | -1 🔴 |
| tBTC decimal tests | 0 | 0 | 0 🔴 |
| Performance tests | 0 | 0 | 0 |
| Chaos tests | 0 | 0 | 0 |
| Contract simulation | N/A | 0 (needed) | -1 🔴 |

---

## 12. Confidence Score Breakdown

| Category | Weight | Score | Weighted | Notes |
|----------|--------|-------|----------|-------|
| Happy-path flow coverage | 15% | 85 | 12.75 | 3 tokens × happy path well covered |
| Edge case coverage | 15% | 60 | 9.0 | wBTC good; tBTC missing; zero/negative/overflow partial |
| High-severity risk coverage | 20% | 30 | 6.0 | 4 critical findings untested; 6 high findings untested |
| Mock strategy completeness | 15% | 55 | 8.25 | Good for Alto/RPC; missing for backend, paymaster contract |
| Security test coverage | 15% | 25 | 3.75 | 0 of 18 security tests from audit findings |
| wallet-core parity | 5% | 80 | 4.0 | 10 test groups enumerated, matches BSC pattern |
| E2E flow completeness | 5% | 70 | 3.5 | Missing first-time auth, large transfer, dust transfer |
| Performance testing | 5% | 0 | 0.0 | No performance tests |
| Chaos/resilience testing | 5% | 10 | 0.5 | Only "Alto down" mentioned; no chaos scenarios |
| **Total** | **100%** | — | **47.75** |

**Adjusted for cross-cutting concerns:**
- +5 for significantly improved wBTC test specificity vs previous plan
- +5 for mock specifications now present
- +3 for ArbitrumWallet test group enumeration
- +1 for clear token extensibility pattern

**Final Confidence Score: 61/100**

> **Interpretation**: The test strategy will catch happy-path regressions and wBTC precision bugs. It has a meaningful blind spot around the paymaster signing flow — the most complex and error-prone component — where both the security audit and code review found critical implementation bugs. Without contract-level signature verification tests, these bugs would ship to production. The complete absence of performance and chaos testing means the system's operational resilience is unverified.

---

## 13. Recommendations Summary

### 13.1 Critical (Must Add Before Implementation)

| # | Recommendation | Effort | Prevents |
|---|---------------|--------|----------|
| 1 | **Add paymaster signature placement test** — verify `paymasterAndData` is set, `signature` untouched | 2h | CRITICAL-1 (100% tx failure) |
| 2 | **Add paymaster hash contract verification test** — deploy VerifyingPaymaster on Anvil fork, sign locally, verify via `eth_call` | 4h | CRITICAL-2 (100% tx failure) |
| 3 | **Add gas parameter bounds tests** — 4 tests for callGasLimit, verificationGasLimit, preVerificationGas, maxFeePerGas | 2h | CRITICAL-3 (paymaster drain) |
| 4 | **Add tBTC 18-decimal buffer test** — verify `convertUSDToToken` uses `1e18` for tBTC, not `1e8` | 1h | C-3 (10^10x buffer error) |
| 5 | **Add callData validation tests** — reject approve(), unknown addresses, non-transfer calls | 2h | MEDIUM-1 (arbitrary calls sponsored) |
| 6 | **Add NestJS backend mock specifications** — 9 scenarios for auth, ownership, validation, signing | 2h | Backend is most trust-critical component |
| 7 | **Set up Anvil fork in CI** — `anvil --fork-url $ARBITRUM_RPC` for contract-level integration tests | 3h | Enables tests 1, 2 above |

### 13.2 Important (Should Add Before Production)

| # | Recommendation | Effort | Impact |
|---|---------------|--------|--------|
| 8 | **Add USDT0 non-standard transfer test** — verify no boolean return causes revert | 2h | MEDIUM-7 |
| 9 | **Add paymaster deposit exhaustion chaos test** — deposit=0, verify graceful degradation | 2h | Risk #2 |
| 10 | **Add zero/stale ETH price oracle tests** | 1h | MEDIUM-8 |
| 11 | **Add gas price spike boundary test** — 19% spike OK, 21% spike → higher buffer | 2h | Risk #7 |
| 12 | **Add first-time EIP-7702 E2E test** | 3h | Novel UX, no coverage |
| 13 | **Add large transfer (95% balance) E2E test** | 1h | Arithmetic edge case in UI |
| 14 | **Add signer rotation test** — old signer rejected, new signer accepted | 2h | Risk #14, #15 |
| 15 | **Add 5 performance baselines** — gas estimation, relay throughput, signing time, balance fetch, UserOp size | 4h | Operational readiness |

### 13.3 Suggestions (Nice to Have)

| # | Recommendation | Effort | Impact |
|---|---------------|--------|--------|
| 16 | Add property-based tests for `convertUSDToToken` | 2h | Catch rounding edge cases |
| 17 | Add wBTC display formatting tests (8 decimal places in UI) | 1h | UX correctness |
| 18 | Add concurrent relay request test (2+ simultaneous) | 2h | Alto nonce management |
| 19 | Add cross-chain replay test (wrong chainId) | 1h | Risk #11 |
| 20 | Add token addition regression test | 2h | Extensibility verification |
| 21 | Add Alto Docker health check endpoint test | 1h | Operational monitoring |
| 22 | Add nightly gas cost regression suite | 4h | Long-term buffer adequacy |
| 23 | Document mock realism expectations | 1h | Team alignment |

---

## Appendix A: Required Test Count Summary

| Layer | Current Plan | Recommended | Gap |
|-------|-------------|-------------|-----|
| Unit (Vitest) | ~30 tests | ~55 tests | +25 |
| Integration (Vitest) | 7 flows | 20 flows | +13 |
| E2E (Playwright) | 9 flows | 18 flows | +9 |
| Performance | 0 | 7 baselines | +7 |
| Chaos | 0 | 10 scenarios | +10 |
| **Total** | **~46** | **~110** | **+64** |

---

## Appendix B: Test File Structure Recommendation

```
tests/
├── unit/
│   ├── wallet/
│   │   ├── ArbitrumWallet.test.ts          # 10 test groups (BSC parity)
│   │   ├── gas-estimation.test.ts          # ETH→token conversion, buffers
│   │   ├── convertUSDToToken.test.ts       # wBTC 8-dec, tBTC 18-dec, stablecoins
│   │   └── balance-check.test.ts           # Pre-flight balance validation
│   ├── backend/
│   │   ├── gasless.service.test.ts         # Relay logic, signing, validation
│   │   ├── gasless.controller.test.ts      # HTTP layer, DTO validation
│   │   ├── gasless-auth.guard.test.ts      # JWT verification
│   │   └── paymaster-signing.test.ts       # Hash computation, signature
│   └── store/
│       ├── gasless-store.test.ts           # initArbitrumWallet, sendGasless
│       └── gas-estimation-store.test.ts    # estimateGasFee, buffer calc
├── integration/
│   ├── paymaster-contract.test.ts          # Fork-based: sign + verify against contract
│   ├── relay-flow.test.ts                  # Client → NestJS → Alto mock
│   ├── token-transfers.test.ts             # USDT0, wBTC, tBTC full flows
│   ├── validation-bounds.test.ts           # Gas params, callData, buffer
│   ├── auth-flow.test.ts                   # JWT + wallet ownership
│   └── chaos.test.ts                       # Alto down, RPC down, deposit=0
├── e2e/
│   ├── send-flow.spec.ts                   # All 3 tokens, happy path
│   ├── error-states.spec.ts                # Insufficient balance, Alto down, retry
│   ├── receive-flow.spec.ts                # QR + copy
│   ├── transaction-history.spec.ts         # Multi-token filter
│   ├── asset-accordion.spec.ts             # Bitcoin/Dollars grouping
│   ├── first-time-auth.spec.ts             # EIP-7702 authorization UX
│   └── edge-cases.spec.ts                  # Large transfer, dust, token switch
└── performance/
    ├── gas-estimation-latency.test.ts
    ├── relay-throughput.test.ts
    ├── balance-fetch-latency.test.ts
    └── gas-cost-regression.test.ts
```

---

*Review completed: 2026-06-05 | Test Engineer agent profile*
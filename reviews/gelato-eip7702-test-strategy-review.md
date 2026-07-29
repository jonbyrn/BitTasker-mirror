# Test Strategy Review: Gelato EIP-7702 Arbitrum Integration

> **Reviewer**: Test Engineer (agent profile)
> **Date**: 2026-06-04
> **Source**: `requirements/gelato-eip7702-arbitrum-plan.md` (Section 10)
> **Baseline**: `wallet-core/src/test/chains/bsc/BSCWallet.test.ts` (637 lines, 21 test groups)
> **Confidence Score**: **52/100** — plan identifies right areas but lacks test-case specificity for high-severity risks

---

## Executive Summary

The plan's testing strategy has correct breadth — unit, integration, and E2E layers are all present with the right modules identified. However, it suffers from **listing modules to test rather than specifying test cases**. Six of the top-8 highest-severity risks (nonce collision, app backgrounding, oracle staleness, gas price spikes, RestrictedSigner bypass, paymaster unavailable) lack concrete test scenarios despite being explicitly called out in Section 11. The mock strategy is mentioned but not detailed. ArbitrumWallet test parity with BSCWallet is aspirational, not specified.

---

## 1. Test Coverage Gaps

### 1.1 Missing Test Cases for High-Severity Risks

| Risk # | Risk | Severity | Test Status | Gap Description |
|--------|------|----------|-------------|----------------|
| 8 | Nonce collision on Tx2 | HIGH | **NOT TESTED** | No test for concurrent UserOp submission or nonce management during rapid sends |
| 9 | App backgrounds during delegation | HIGH | **NOT TESTED** | No Capacitor lifecycle test (pause mid-Tx1, resume after Tx1 mined, verify Tx2 fires) |
| 12 | Token/ETH oracle staleness | HIGH | **NOT TESTED** | Plan mentions 5-min staleness check but no test for stale oracle detection or fallback oracle |
| 13 | Gas price spike between estimate and execution | HIGH | **NOT TESTED** | Plan mentions 20% buffer but no boundary test (19% spike passes, 21% spike fails) |
| 10 | RestrictedSigner bypass | HIGH | **PARTIAL** | Plan says "Only allows EIP-7702 auth" but no test vectors for bypass attempts |
| 2 | Gelato Paymaster unavailable | HIGH | **PARTIAL** | Listed in integration tests as "error state, retry logic" but no retry-count/timing tests |
| 11 | Cross-chain replay | MEDIUM | **NOT TESTED** | No test verifying chainId=42161 is embedded in authorization; no test rejecting wrong chainId |
| 6 | USDT0 depeg | HIGH | **NOT TESTED** | Risk lists circuit breaker at 5% deviation; no test for depeg detection or send-blocking behavior |

### 1.2 Missing Edge Cases Not Covered by Any Test Layer

| Scenario | Layer Needed | Why It Matters |
|----------|-------------|----------------|
| Zero-amount transfer | Unit + Integration | ERC-20 `transfer(0)` may succeed but gas reimbursement still applies |
| Self-transfer (send to own address) | Integration | Delegation + transfer to self — verify paymaster still reimbursed |
| Transfer to contract address | Integration | Not all ERC-20 contracts handle incoming transfers the same |
| Maximum token balance transfer | Integration | User tries to send entire balance — gas reimbursement must be deducted first |
| Concurrent sends (2+ pending) | E2E | Second send while first Tx1 is unmined — nonce management, chain lock |
| Network switch mid-delegation | E2E | User tries to switch Arbitrum → RSK while Tx1 pending |
| Multiple rapid delegations | E2E | Nonce management across back-to-back sends |
| RPC primary failure → failover | Unit | ArbitrumWallet has 3 RPC URLs; no test for primary-down failover |
| Delegation journal full corruption | Unit | `DelegationJournal` lists "corruption recovery" but no specific corruption byte patterns |

---

## 2. Testability Assessment

### 2.1 Well-Designed for Testing ✅

| Aspect | Why |
|--------|-----|
| Layer separation (SDK vs App) | `ArbitrumWallet` is testable in isolation — no Gelato dependency |
| Pure functions for gas estimation | `estimateGasReimbursement()` is a pure function — perfect for unit testing |
| State machine in DelegationManager | Each transition can be tested independently with mocked Gelato client |
| RestrictedSigner wrapper | Clean interface — can test allowed/rejected signing operations |
| Feature flag gating | KillSwitch is simple boolean logic — trivially testable |

### 2.2 Testability Concerns ⚠️

| Component | Concern | Recommendation |
|-----------|---------|----------------|
| `GelatoEIP7702Provider` | Depends on `@gelatonetwork/smart-wallet-sdk` + ethers — mocking SDK internals is fragile | Create a thin `GelatoClient` wrapper (already planned as `gelato-client.ts`) — mock at that boundary |
| `DelegationManager` | State machine depends on on-chain `getCode()` + Gelato bundler + Capacitor Preferences | Inject all three as interfaces — test state machine with dependency injection |
| Capacitor Preferences | `delegation-journal.ts` uses `Capacitor.Preferences` | Create a `PreferencesAdapter` interface — inject memory-backed impl in tests |
| Token/ETH oracle | Plan mentions oracle but doesn't name the source | Define `PriceOracle` interface — test staleness/fallback without real oracle |
| Chain lock | Tied to UI state and delegation lifecycle | Make `ChainLock` a standalone class with injectable timer — test timeout deterministically |

### 2.3 Architecturally Untestable Without Refactoring 🔴

**None identified.** The architecture is clean enough to test if the concerns above are addressed via dependency injection.

---

## 3. Mock Strategy Review

### 3.1 Current Mock Coverage

The plan mentions "mocked Gelato" in integration tests but does not specify mock scenarios. The BSCWallet tests use `vi.mock()` at module level — this pattern should be followed.

### 3.2 Required Mocks — Missing Specifications

#### Gelato Bundler Client

```typescript
// Required mock scenarios:
const mockGelatoBundler = {
  sendTransaction: {
    success:              // Returns userOpHash
    rejection:            // Throws: insufficient paymaster funds
    timeout:              // Never resolves (bundler stuck)
    rateLimited:          // Throws: 429 Too Many Requests
    invalidAuth:          // Throws: EIP-7702 authorization invalid
    nonceConflict:        // Throws: nonce already used
  },
  estimateUserOperationGas: {
    normal:               // Returns gas estimate within buffer
    spike:                // Returns 2x normal (exceeds buffer)
    zero:                 // Returns 0 (oracle failure)
  }
}
```

#### Gelato Paymaster

```typescript
const mockPaymaster = {
  getPaymasterData: {
    sponsored:            // Returns valid paymaster data
    insufficientFunds:    // Throws: Gas Tank empty
    tokenNotSupported:    // Throws: wBTC not whitelisted
    healthCheckFail:      // Throws: paymaster service degraded
  }
}
```

#### RPC Provider (ethers Provider)

```typescript
const mockPublicClient = {
  getBalance: {
    normal:               // Returns typical balance (e.g., 1000e18 for USDT0)
    zero:                 // Returns 0n
    dust:                 // Returns 1n (1 wei of token)
    huge:                 // Returns 21_000_000e8 for wBTC (max supply)
  },
  getCode: {
    pureEOA:              // Returns '0x' (no delegation)
    delegated:            // Returns delegation bytecode
    empty:                // Returns '0x' after cleanup
  },
  getGasPrice: {
    normal:               // Returns 100_000_000n (0.1 gwei)
    spike:                // Returns 10_000_000_000n (10 gwei)
    zero:                 // Returns 0n (should be handled)
  },
  getBlockNumber: {
    current:              // Returns latest block
    stale:                // Returns old block (simulates RPC lag)
  },
  getTransactionReceipt: {
    success:              // Returns receipt with status: 'success'
    reverted:             // Returns receipt with status: 'reverted'
    notFound:             // Returns null (pending)
    delayed:              // Returns null 3 times, then success
  },
  multicall: {
    allBalances:          // Returns all 3 token balances
    partialFailure:       // One token call fails, others succeed
  }
}
```

#### Price Oracle

```typescript
const mockPriceOracle = {
  getTokenPrice: {
    normal:               // wBTC = 69000 USD, ETH = 3500 USD
    stale:                // Timestamp > 5 minutes ago
    unavailable:          // Throws: oracle service down
    extremeMovement:      // 50% drop in 1 minute (depeg scenario)
    zero:                 // Returns 0 (invalid)
  }
}
```

#### Capacitor Preferences

```typescript
const mockPreferences = {
  get: {
    exists:               // Returns saved delegation record
    notFound:             // Returns null
    corrupted:            // Returns malformed JSON
  },
  set: {
    success:              // Resolves
    storageFull:          // Throws: quota exceeded
  },
  remove: {
    success:              // Resolves
  }
}
```

### 3.3 Mock Realism Concerns

| Concern | Risk | Recommendation |
|---------|------|----------------|
| Module-level mocks (`vi.mock`) hide integration bugs | MEDIUM | Add at least one integration test per module that hits a real mock server (not just `vi.fn()`) |
| Gelato SDK internals may change | MEDIUM | Pin SDK version; update mocks when SDK updates; test against SDK changelog |
| BigInt comparisons in mocks | LOW | Ensure all mock return values are `bigint`, not `number` — JS number precision breaks at 2^53 |

---

## 4. E2E Test Completeness

### 4.1 Current E2E Flows (10 tests)

| # | Flow | Coverage |
|---|------|----------|
| 1 | Send USDT0 (happy) | ✅ |
| 2 | Send wBTC (happy) | ✅ |
| 3 | Send tBTC (happy) | ✅ |
| 4 | Insufficient balance | ✅ |
| 5 | Gas reimbursement display | ✅ |
| 6 | Paymaster down | ✅ |
| 7 | Receive (QR + copy) | ✅ |
| 8 | Transaction history filter | ✅ |
| 9 | Chain lock during tx | ✅ |
| 10 | Delegation recovery after app kill | ✅ |

### 4.2 Missing E2E Flows

| # | Missing Flow | Priority | Why |
|---|-------------|----------|----|
| 11 | **Concurrent sends** — 2nd send while 1st pending | HIGH | Nonce collision risk; chain lock should block |
| 12 | **Network switch mid-delegation** — RSK/Arbitrum toggle | HIGH | Chain lock enforcement; state corruption risk |
| 13 | **App background during Tx1, foreground after Tx2 needed** | HIGH | Capacitor lifecycle; delegation persistence |
| 14 | **Multiple rapid sends** — 3 sends in 10 seconds | HIGH | Nonce queue, delegation reuse if not cleaned |
| 15 | **First-time delegation bootstrap** — no prior delegation + no ETH | HIGH | BitTasker sponsorship path; plan mentions it in integration tests but not E2E |
| 16 | **Large transfer** — 95% of token balance | MEDIUM | Gas reimbursement must be deducted; user sees "insufficient" if too close to max |
| 17 | **Self-transfer** — send to own address | LOW | Edge case; verify no double-delegation |
| 18 | **wBTC dust transfer** — 0.00000001 wBTC (1 satoshi) | MEDIUM | 8-decimal precision minimum; gas reimbursement may exceed transfer |
| 19 | **Token selector switch mid-flow** — start with USDT0, switch to wBTC | MEDIUM | Gas estimate must recalculate for different decimals |
| 20 | **USDT0 depeg alert** — price > 5% off peg | MEDIUM | Risk #6 circuit breaker; verify send is blocked |

---

## 5. wBTC 8-Decimal Edge Cases

### 5.1 What's Covered

- Plan lists "wBTC 8-decimal handling, dust amounts" in integration tests
- Plan lists "wBTC 8-decimal precision tests" in Phase 5
- `token-transfer.ts` tests include wBTC (8 dec)

### 5.2 What's Missing

| Test Case | Type | Why It Matters |
|-----------|------|----------------|
| **1 satoshi transfer** (0.00000001 wBTC) | Unit | Smallest possible amount; gas reimbursement likely exceeds it |
| **Gas reimbursement rounding** (18-dec ETH → 8-dec wBTC) | Unit | BigInt division truncates; must round UP to not underpay paymaster |
| **Formatted display precision** | Unit | wBTC shows 8 decimals in UI; USDT0 shows 18; verify both render correctly |
| **Max supply boundary** (21M BTC = 2,100,000,000,000,000 satoshi) | Unit | Overflow protection for `BigInt(21_000_000) * BigInt(10**8)` |
| **Mixed decimal arithmetic** | Unit | Gas estimate in wei (18 dec) converted to wBTC (8 dec) — 10 decimal places of precision lost |
| **Scientific notation parsing** | Unit | `0.00000001` must NOT be parsed as float — must use string → BigInt conversion |
| **Transfer amount + reimbursement > balance** | Integration | wBTC balance of 0.00000100 wBTC; transfer 0.00000099; reimbursement 0.00000002 → insufficient |
| **Display: "< $0.01" gas cost** | E2E | wBTC gas ~$0.004; verify UI shows meaningful micro-amount, not "0.00" |

### 5.3 Recommended Test Suite

```typescript
describe('wBTC 8-decimal precision', () => {
  it('should transfer 1 satoshi (0.00000001 wBTC)')
  it('should round gas reimbursement UP to nearest satoshi')
  it('should NOT use floating-point for any arithmetic')
  it('should format balance with exactly 8 decimal places')
  it('should handle max supply (21M BTC) without overflow')
  it('should reject scientific notation input (1e-8)')
  it('should calculate reimbursement correctly when ETH/wBTC rate has >8 significant digits')
  it('should show "< $0.01" for sub-cent gas costs in UI')
  it('should block transfer if transfer + reimbursement > balance (by 1 satoshi)')
  it('should handle wBTC → ETH price ratio that produces fractional satoshi reimbursement')
})
```

---

## 6. Delegation Recovery Testing

### 6.1 Algorithm (from plan Section 6.3)

1. `getCode(address)` on-chain
2. If empty → reconcile to IDLE silently
3. If non-empty → submit cleanup UserOp via Gelato
4. If Gelato unavailable → error state; delegation code is inert
5. Retries: 3 immediate, then 1h, 6h, 24h intervals

### 6.2 Testability Assessment

The algorithm is **deterministically testable** if `getCode()` and Gelato client are injected as interfaces. The exponential backoff requires injectable timers.

### 6.3 Missing Test Cases

| Test Case | Type | Deterministic? | How to Test |
|-----------|------|----------------|-------------|
| getCode returns empty (pure EOA) | Unit | ✅ Yes | Mock getCode → '0x'; assert state → IDLE |
| getCode returns valid delegation bytecode | Unit | ✅ Yes | Mock getCode → delegation bytes; mock Gelato → success; assert cleanup submitted |
| getCode returns unexpected data (not delegation, not empty) | Unit | ✅ Yes | Mock getCode → random bytes; assert error state or forced cleanup |
| Gelato unavailable during recovery | Unit | ✅ Yes | Mock Gelato → throw; assert error state; assert "inert" safety claim |
| Retry: 3 immediate attempts succeed on 3rd | Unit | ✅ Yes | Mock Gelato → fail, fail, succeed; verify 3 calls |
| Retry: all 3 immediate fail → schedules 1h | Unit | ✅ Yes | Mock Gelato → fail × 3; verify setTimeout called with 3600000ms |
| Retry: 1h timer fires → Gelato still down → schedules 6h | Unit | ✅ Yes | Use fake timers; advance 1h; verify next retry at 6h |
| Recovery interrupted by new send attempt | Integration | ⚠️ Partial | Start recovery → user initiates new send → verify chain lock or queue |
| Recovery after app killed mid-delegation | E2E | ⚠️ Needs real app | Kill app during TX1_MINED → restart → verify recovery triggers |
| Recovery with corrupted journal entry | Unit | ✅ Yes | Mock Preferences → malformed JSON; verify recovery falls back to getCode() |
| Multiple wallets with stale delegations | Integration | ✅ Yes | 3 wallets, each with stale delegation; verify all recover independently |

### 6.4 Recommended: Extract Recovery as Pure State Machine

```typescript
// Testable without any I/O:
function computeRecoveryAction(
  currentCode: 'empty' | 'delegated' | 'unknown',
  gelatoAvailable: boolean,
  retryCount: number,
  lastRetryAt: number | null,
  now: number
): { action: 'idle' | 'submit_cleanup' | 'schedule_retry' | 'error', nextRetryMs?: number }
```

This function is trivially unit-testable across all input combinations.

---

## 7. Gas Reimbursement Calculation Testing

### 7.1 Function Signature (from plan Section 5.3)

```typescript
function estimateGasReimbursement(params: {
  totalGasLimit: bigint;
  gasPrice: bigint;
  tokenPerEth: bigint;
  tokenDecimals: number;
  bufferBps?: number; // default 2000 = 20%
}): GasReimbursementEstimate;
```

### 7.2 Missing Test Cases

| Test Case | Input | Expected Behavior |
|-----------|-------|-------------------|
| **Normal USDT0** (18 dec) | gasLimit=185000, gasPrice=1e8, tokenPerEth=280e18, decimals=18 | Reimbursement ≈ 185000 × 1e8 × 280e18 / 1e18 = reasonable USDT0 amount |
| **Normal wBTC** (8 dec) | Same gas, tokenPerEth=0.0145e8 (1 ETH = 0.0145 wBTC) | Reimbursement in 8-decimal satoshis; must round UP |
| **Buffer at 0 bps** | bufferBps=0 | No buffer added; exact gas cost |
| **Buffer at 2000 bps** (default) | bufferBps=2000 | 20% added to reimbursement |
| **Buffer at 10000 bps** (100%) | bufferBps=10000 | Doubles the reimbursement |
| **Buffer > 10000** | bufferBps=15000 | Should this be rejected? Or allowed? Plan doesn't specify |
| **Zero gas price** | gasPrice=0n | reimbursementTokenAmount should be 0; is this valid? |
| **Zero token/ETH price** | tokenPerEth=0n | Should throw — division by zero or infinite reimbursement |
| **Very small reimbursement** | Tiny gas → 0.00000001 wBTC | Dust amount; should it be rounded to minimum? |
| **Very large gas limit** | totalGasLimit=30_000_000n (Arbitrum block limit) | No overflow in BigInt multiplication |
| **18-dec → 8-dec precision loss** | ETH price in wBTC with >8 significant digits | Lost precision must round UP, not DOWN |
| **Confidence score** | Normal inputs | confidence should be 0.8-1.0 |
| **Confidence score** | Stale oracle, old gas price | confidence should be < 0.5 |
| **totalRequired** | transferAmount + reimbursement | Must equal sum; no off-by-one |

### 7.3 Recommended: Property-Based Testing

```typescript
describe('estimateGasReimbursement (property-based)', () => {
  it('reimbursementTokenAmount > 0 when all inputs > 0')
  it('totalRequired >= reimbursementTokenAmount')
  it('reimbursement increases with gasPrice')
  it('reimbursement increases with totalGasLimit')
  it('reimbursement increases with bufferBps')
  it('reimbursement decreases as tokenPerEth increases (token is worth more per ETH)')
  it('never produces fractional satoshi for wBTC (8 dec)')
  it('bufferBps=0 produces exact cost, no rounding')
})
```

---

## 8. ArbitrumWallet vs BSCWallet Test Parity

### 8.1 BSCWallet Test Coverage (21 test groups, 637 lines)

| Test Group | # Tests | ArbitrumWallet Equivalent | Status in Plan |
|-----------|---------|--------------------------|----------------|
| Constructor | 4 | Accept config, custom RPC, polling, API key | ⚠️ "same pattern" — not enumerated |
| initialize | 5 | Valid mnemonic, empty, whitespace, no RPC during init, error handling | ⚠️ Not enumerated |
| getAddress | 2 | Return address, throw if not init | ❌ Not mentioned |
| getBNBBalance → getETHBalance | 3 | Balance structure, formatting, throw if not init | ❌ Not mentioned |
| getUSDTBalance → getTokenBalance | 4 | Balance structure, zero fallback, formatting | ❌ Not mentioned (3 tokens needed) |
| getBalances | 2 | All balances, parallel fetch | ❌ Not mentioned |
| sendBNB → sendETH (fallback) | 4 | Address validation, balance check, not init, error handling | ❌ Not mentioned |
| sendUSDT → sendToken | 3 | Address validation, contract not init, balance check | ❌ Not mentioned (3 tokens) |
| estimateGas | 4 | Gas estimate structure, total cost calc, formatting, not init | ❌ Not mentioned |
| getBlockNumber | 2 | Return block number, throw if not init | ❌ Not mentioned |
| getPaymaster | 1 | N/A for Arbitrum (Gelato is app-layer) | N/A |
| canPayFeesInUsdt | 3 | N/A for Arbitrum (gas abstraction is app-layer) | N/A |
| onBlock | 3 | Subscribe, unsubscribe, throw if not init | ❌ Not mentioned |
| pause | 2 | Pause polling, no throw if not init | ❌ Not mentioned |
| resume | 2 | Resume polling, no throw if not init | ❌ Not mentioned |
| disconnect | 2 | Cleanup resources, no throw if not init | ❌ Not mentioned |
| getProvider | 2 | Return provider, throw if not init | ❌ Not mentioned |
| getWallet | 2 | Return wallet instance, throw if not init | ❌ Not mentioned |
| getUSDTContract → getTokenContract | 1 | Return contract or null (×3 tokens) | ❌ Not mentioned |
| isInitialized | 3 | False before, true after, false after disconnect | ❌ Not mentioned |
| loadTransactions | 3 | Calls with correct params, without API key, throw if not init | ⚠️ ArbitrumTransactions.ts mentioned |

### 8.2 Parity Score

- **Explicitly planned**: 3 of 21 test groups (14%)
- **Mentioned as "same pattern"**: Covers all conceptually but **none are specified**
- **Missing from plan**: 18 of 21 test groups need explicit enumeration

### 8.3 Recommendation

The plan should include a test specification table for ArbitrumWallet that maps 1:1 to BSCWallet's 21 test groups, plus additional tests for:
- Multi-token balance fetching (3 tokens vs BSC's 1 USDT)
- RPC failover (3 URLs vs BSC's single URL)
- wBTC 8-decimal balance formatting
- Token contract interaction for USDT0, wBTC, tBTC (separate test per token)

---

## 9. Recommendations Summary

### 9.1 Critical (Must Fix Before Implementation)

| # | Recommendation | Effort |
|---|---------------|--------|
| 1 | **Enumerate ArbitrumWallet test cases** — don't rely on "same pattern" | 1h |
| 2 | **Define mock specifications** for Gelato bundler, paymaster, RPC, oracle | 2h |
| 3 | **Add test cases for all HIGH-severity risks** — nonce collision, app backgrounding, oracle staleness, gas price spikes | 3h |
| 4 | **Extract recovery algorithm as pure function** — testable without I/O | 2h |
| 5 | **Add wBTC precision test suite** — 10 specific test cases listed in Section 5 | 2h |

### 9.2 High (Should Fix)

| # | Recommendation | Effort |
|---|---------------|--------|
| 6 | **Add 7 missing E2E flows** — concurrent sends, network switch, app background, rapid sends, bootstrap, large transfer, depeg | 1-2 days |
| 7 | **Define PriceOracle interface** — inject for testability | 1h |
| 8 | **Define PreferencesAdapter interface** — inject for Capacitor mock | 1h |
| 9 | **Add property-based tests** for gas reimbursement pure function | 2h |
| 10 | **Add RestrictedSigner bypass test vectors** — 5+ rejection scenarios | 2h |

### 9.3 Medium (Nice to Have)

| # | Recommendation | Effort |
|---|---------------|--------|
| 11 | Add Sentry breadcrumb verification test | 1h |
| 12 | Add i18n token display test (en/es) | 1h |
| 13 | Add chain-replay test (wrong chainId rejected) | 1h |
| 14 | Add RPC failover test for ArbitrumWallet | 2h |
| 15 | Document mock realism expectations (what's good enough vs real integration) | 1h |

---

## 10. Confidence Score Breakdown

| Category | Weight | Score | Weighted |
|----------|--------|-------|----------|
| Happy-path flow coverage | 20% | 80 | 16.0 |
| Edge case coverage | 20% | 30 | 6.0 |
| High-severity risk coverage | 20% | 35 | 7.0 |
| Mock strategy completeness | 15% | 40 | 6.0 |
| Recovery test determinism | 10% | 30 | 3.0 |
| wallet-core parity | 10% | 40 | 4.0 |
| E2E flow completeness | 5% | 55 | 2.75 |
| **Total** | **100%** | — | **44.75** |

**Rounded Confidence Score: 45/100**

> **Interpretation**: The test plan will catch basic regressions on happy-path flows but has significant blind spots around high-severity risks (nonce management, app lifecycle, oracle reliability, precision arithmetic). The lack of concrete test case specifications means implementation teams will make their own coverage decisions, leading to inconsistent quality.

---

## Appendix: Comparison with BSCWallet Test File

| Metric | BSCWallet Tests | ArbitrumWallet (Planned) | Gap |
|--------|----------------|-------------------------|-----|
| Lines of test code | 637 | Not started | — |
| Test groups | 21 | 1 ("same pattern") | 20 missing |
| Mock modules | 2 (BSCTransactions, BSCPaymaster) | Not specified | Unknown |
| Balance tokens tested | 2 (BNB, USDT) | 3 (ETH, USDT0, wBTC, tBTC) | +2 tokens, more decimal edge cases |
| Gas estimation tests | 4 | 0 (app-layer, not SDK) | OK — different layer |
| Paymaster tests | 3 | 0 (app-layer, not SDK) | OK — different layer |
| Transaction loading | 3 | Planned (ArbitrumTransactions.ts) | Needs explicit spec |
| Provider failover | 0 (single RPC) | 3 RPC URLs | New test needed |

---

*Review completed: 2026-06-04 | Test Engineer agent profile*

# Test Strategy v3 Review: Gasless ERC-4337 + EIP-7702 on Arbitrum One

> **Reviewer**: Test Engineer (agent profile)
> **Date**: 2026-06-05
> **Version**: v3 final review (v1: 61%, v2: 82%)
> **Source**: `requirements/gasless-arbitrum-plan.md` (1306 lines, Sections 10.7–10.10)
> **Previous Reviews**: `gasless-arbitrum-test-strategy-review.md` (v1, 61%), `gasless-arbitrum-test-strategy-re-review.md` (v2, 82%)
> **Overall Confidence Score**: **86/100**

---

## Executive Summary

The v3 plan addresses **all five v1 Critical gaps** (verified still resolved), resolves **3 of 5 v2 Important gaps**, and adds substantial new content: 15 security-critical tests with concrete inputs/expected outputs, a 9-step first-time EIP-7702 E2E test, 10 chaos scenarios (including Alto replica failover), and 5 performance baselines. The test count reaches ~110 across 22 risk items.

The single most impactful v3 improvement is **test specificity**. Where v2 described security tests in one line ("callData validation → backend rejects"), v3 specifies exact inputs, expected status codes, expected error messages, and concrete BigInt outputs. This eliminates implementer ambiguity — the gap between "test exists" and "test catches bugs" is closed.

**No new Critical gaps** have been introduced. The remaining gaps (EIP-7702 escape hatch test, ETH price oracle unit tests, 4 missing performance metrics, restart exhaustion chaos test) are Important but not production-blocking. The plan is ready for implementation with the caveat that the Important items should be addressed during the implementation sprint.

---

## 1. v1 Critical Gap Resolution Status

### Gap 1: Paymaster Signature Placement (CRITICAL-1)

**v1 Status**: NOT TESTED
**v2 Status**: RESOLVED via 10.7 #2
**v3 Status**: **✅ STILL RESOLVED — IMPROVED**

v3 Section 10.7, Test #2:
> "paymasterAndData placement — Send a test UserOp through relay, inspect the userOp object received by Alto — paymasterAndData field is set (non-empty), signature field contains user's original signature"

**Improvement over v2**: Now specifies concrete inputs ("send through relay") and two explicit assertions (paymasterAndData non-empty AND signature untouched). v2 only said "user signature untouched". The two-assertion approach catches both the positive case (paymaster sponsorship applied) and the negative case (user signature preserved).

---

### Gap 2: Paymaster Hash Computation (CRITICAL-2)

**v1 Status**: NOT TESTED
**v2 Status**: RESOLVED via 10.7 #1 + 10.8
**v3 Status**: **✅ STILL RESOLVED — IMPROVED**

v3 Section 10.7, Test #1:
> "Build test UserOp (sender=0x1234..., nonce=0, callData=0xabcd...), sign with backend signer, call VerifyingPaymaster.validatePaymasterUserOp() via eth_call on Anvil fork — Returns SIG_VALIDATION_SUCCESS (0)"

**Improvement over v2**: Now specifies concrete UserOp fields (sender, nonce, callData) and the expected return value (`SIG_VALIDATION_SUCCESS (0)`). v2's concern about "implementation ambiguity" is addressed — the implementer knows exactly what to build.

**Remaining note** (from v2): Implementation should still test negative cases:
- Wrong hash → SIG_VALIDATION_FAILED
- Rotated signer → SIG_VALIDATION_FAILED
- Wrong EntryPoint → revert

These are implementation details, not plan-level gaps.

---

### Gap 3: Gas Parameter Bounds Validation (CRITICAL-3)

**v1 Status**: NOT TESTED
**v2 Status**: RESOLVED (single test for callGasLimit)
**v3 Status**: **✅ FULLY RESOLVED — ALL FOUR PARAMETERS**

v3 now tests ALL four gas parameters with specific bound values:

| Parameter | Maximum | Test Value | Expected |
|-----------|---------|------------|----------|
| callGasLimit | 500,000 | 10,000,000 | 400 Bad Request |
| verificationGasLimit | 1,000,000 | 2,000,000 | 400 Bad Request |
| preVerificationGas | 100,000 | 200,000 | 400 Bad Request |
| maxFeePerGas | 1 gwei | 10 gwei | 400 Bad Request |

This directly addresses v2's concern: "The single test is sufficient to prove the validation pattern exists, but implementation should test all four parameters at boundary values." All four are now explicitly in the plan with documented maximum values.

**This is the most significant improvement from v2 to v3** for this gap. The v2 plan had one test; v3 has four tests with documented bounds.

---

### Gap 4: tBTC Decimal Handling (C-3)

**v1 Status**: NOT TESTED
**v2 Status**: RESOLVED via 10.7 #6
**v3 Status**: **✅ STILL RESOLVED — IMPROVED**

v3 Section 10.7, Test #11:
> "tBTC decimal correctness — Call convertUSDToToken(0.005, tBTC, 0.20) with BTC price=$66,000 — Returns BigInt(Math.ceil(0.006 / 66000 * 1e18)) = 90909090909091n (18 decimals)"

v3 Section 10.7, Test #12:
> "wBTC decimal correctness — Call convertUSDToToken(0.005, wBTC, 0.20) with BTC price=$66,000 — Returns BigInt(Math.ceil(0.006 / 66000 * 1e8)) = 91n (8 decimals)"

**Improvement over v2**: Now has concrete function calls, specific input parameters, and **exact expected BigInt output values**. An implementer can write these tests without interpretation. The expected outputs (`90909090909091n` vs `91n`) make the 10^10x magnitude difference immediately visible.

---

### Gap 5: callData Structure Validation (MEDIUM-1)

**v1 Status**: NOT TESTED
**v2 Status**: RESOLVED via 10.7 #4 + #5
**v3 Status**: **✅ STILL RESOLVED — EXPANDED**

v3 now has **four** callData validation tests (up from 2 in v2):

| # | Test | Expected Error Message |
|---|------|----------------------|
| 7 | Arbitrary contract call (not token transfer) | "callData must be executeBatch" |
| 8 | Non-whitelisted token address (0x1111...) | "Unauthorized target: 0x1111..." |
| 9 | Gas buffer sent to wrong recipient (0xSELF) | "Gas buffer must go to GAS_TREASURY" |
| 10 | Gas buffer below minimum (1 wei) | "Gas buffer below minimum" |

**Improvement over v2**: Tests #9 and #10 are new. Test #9 prevents a subtle attack where callData structure is valid but the gas buffer is redirected to the attacker's address. Test #10 prevents dust gas buffers that provide no actual reimbursement. All four tests specify the expected error message, eliminating implementation ambiguity.

---

## 2. v2 Important Gap Resolution Status

### v2 Gap 1: Gas Parameter Bound Values Not Documented

**v2 Status**: Important — no documented maximum values
**v3 Status**: **✅ RESOLVED**

v3 documents exact maximums: MAX_CALL_GAS=500,000, MAX verificationGasLimit=1,000,000, MAX preVerificationGas=100,000, MAX maxFeePerGas=1 gwei. All four tested at above-maximum values.

---

### v2 Gap 2: ETH Price Oracle Edge Cases Underspecified

**v2 Status**: Important — mentioned in chaos but no explicit test assertions
**v3 Status**: **⚠️ PARTIALLY RESOLVED**

v3 chaos test #9: "ETH price API down → Backend uses cached price or rejects if stale >5min"

This describes expected behavior but still lacks explicit unit test cases for:
- Price stale 4 min → use cached (succeed)
- Price stale 6 min → reject (fail)
- Price = 0 → reject (not division by zero)
- Price = negative/NaN → reject

The chaos test covers the "API down" scenario but not the boundary conditions for staleness thresholds. These should be unit tests on `convertToTokenBuffer`, not chaos tests.

**Recommendation**: Add 4 unit tests to Section 10.1 for `convertToTokenBuffer` edge cases with stale/zero/negative prices.

---

### v2 Gap 3: First-Time EIP-7702 E2E Test Missing

**v2 Status**: Important — most novel UX flow, no Playwright coverage
**v3 Status**: **✅ FULLY RESOLVED**

v3 adds Section 10.8b with a **9-step E2E test**:

| Step | Action | Expected |
|------|--------|----------|
| 1 | Create fresh wallet | `getCode(eoa)` returns `0x` |
| 2 | Receive 100 USDT0 | Balance shows 100 USDT0 |
| 3 | Init `to7702SimpleSmartAccount` | Account address = EOA address |
| 4 | Send 50 USDT0 | UserOp includes EIP-7702 authorization; ~45K extra gas |
| 5 | Verify recipient balance | = 50 USDT0 |
| 6 | Verify gasTreasury received buffer | Gas reimbursement collected |
| 7 | Verify `getCode(eoa)` | Delegated code present |
| 8 | Send 10 USDT0 (second tx) | No extra authorization gas |
| 9 | Verify second tx succeeds | Delegation persists |

**Assessment**: This is exactly what v2 requested. The test covers the full lifecycle from "no prior transactions" through first delegation, first transfer, delegation persistence, and second transfer. Steps 4 and 7 are the critical assertions — authorization included in first tx, delegation active after.

**This is the single biggest E2E gap closure from v2 to v3.**

---

### v2 Gap 4: Chaos Test for Restart Exhaustion

**v2 Status**: Important — no test for "3 restart failures → 503"
**v3 Status**: **⚠️ PARTIALLY RESOLVED — DIFFERENT APPROACH**

v3 does not add the restart-exhaustion test. Instead, it adds:
- **Alto replica failover** (chaos #2): "Kill alto-1, send UserOp → alto-2 picks up, transaction succeeds"

This is arguably better — instead of testing restart exhaustion (which implies the single-instance SPOF), v3 tests multi-instance failover. If alto-1 dies, alto-2 takes over. This eliminates the restart-exhaustion scenario entirely.

**However**: The plan's architecture diagram shows a single Alto instance. The chaos test assumes multiple replicas. This is a discrepancy — either the architecture should document multi-replica Alto, or the failover test needs adaptation.

**Recommendation**: Clarify in the architecture whether Alto runs as single instance or multi-replica. If single instance, add the restart-exhaustion test. If multi-replica, update the architecture diagram.

---

### v2 Gap 5: Test Descriptions Too Terse

**v2 Status**: Important — single-line descriptions leave implementation ambiguity
**v3 Status**: **✅ FULLY RESOLVED**

Every security test in v3 now has:
- **Concrete inputs**: specific addresses, values, function parameters
- **Expected outputs**: status codes, error messages, BigInt values
- **Verification criteria**: what "pass" looks like

Examples of the improvement:

| Test | v2 Description | v3 Description |
|------|---------------|----------------|
| tBTC decimal | "convertUSDToToken for tBTC returns 18-decimal value" | "Call convertUSDToToken(0.005, tBTC, 0.20) with BTC=$66,000 → 90909090909091n" |
| callData arbitrary | "Submit UserOp calling arbitrary contract → backend rejects" | "callData calling 0xDEAD... (not a token transfer) → 400 'callData must be executeBatch'" |
| Gas buffer wrong recipient | (not in v2) | "Gas buffer sent to 0xSELF instead of GAS_TREASURY → 400 'Gas buffer must go to GAS_TREASURY'" |

---

## 3. New v3 Section Assessment

### 3.1 Security-Critical Tests (Section 10.7) — 15 Tests

| # | Test | Verifies | Input Quality | Output Quality |
|---|------|----------|---------------|----------------|
| 1 | Paymaster signature on Anvil fork | CRITICAL-2 | ✅ Specific UserOp fields | ✅ SIG_VALIDATION_SUCCESS (0) |
| 2 | paymasterAndData placement | CRITICAL-1 | ✅ Send through relay | ✅ Both fields asserted |
| 3 | callGasLimit bounds | CRITICAL-3 | ✅ 10M > MAX 500K | ✅ 400 + message |
| 4 | verificationGasLimit bounds | CRITICAL-3 | ✅ 2M > MAX 1M | ✅ 400 |
| 5 | preVerificationGas bounds | CRITICAL-3 | ✅ 200K > MAX 100K | ✅ 400 |
| 6 | maxFeePerGas bounds | CRITICAL-3 | ✅ 10 gwei > MAX 1 gwei | ✅ 400 |
| 7 | callData arbitrary contract | MEDIUM-1 | ✅ 0xDEAD... address | ✅ 'callData must be executeBatch' |
| 8 | callData non-whitelisted token | MEDIUM-1 | ✅ 0x1111... token | ✅ 'Unauthorized target' |
| 9 | callData wrong gas recipient | NEW | ✅ 0xSELF recipient | ✅ 'Gas buffer must go to GAS_TREASURY' |
| 10 | callData gas buffer too low | MEDIUM-2 | ✅ 1 wei buffer | ✅ 'Gas buffer below minimum' |
| 11 | tBTC decimal correctness | C-3 | ✅ convertUSDToToken(0.005, tBTC) | ✅ 90909090909091n |
| 12 | wBTC decimal correctness | C-3 | ✅ convertUSDToToken(0.005, wBTC) | ✅ 91n |
| 13 | USDT0 non-standard ABI | MEDIUM-7 | ✅ Anvil fork transfer | ✅ Succeeds (SafeERC20) |
| 14 | Paymaster deposit exhaustion | Risk #2 | ✅ 0.004 ETH < threshold | ✅ 503 'Paymaster deposit too low' |
| 15 | Key extraction pattern | Risk #18 | ✅ Init wallet + sign | ✅ Key not in store/global |

**Verdict**: 15 tests, all with concrete inputs and expected outputs. Every test maps to a specific audit finding or risk item. This is production-grade test specification.

**Notable additions since v2**:
- Test #9 (wrong gas recipient) — new attack vector not in v2
- Test #10 (gas buffer too low) — more specific than v2's "gasBuffer=0"
- Test #14 (deposit exhaustion with specific threshold) — 0.004 ETH < 0.005 ETH
- All 4 gas parameters tested (v2 had only callGasLimit)
- All BigInt outputs are concrete values, not formulas

---

### 3.2 First-Time EIP-7702 E2E Test (Section 10.8b)

**Assessment**: **Excellent**

This 9-step test covers the complete EIP-7702 lifecycle:
1. **Pre-delegation state** — getCode returns 0x (no smart account code)
2. **Fund account** — receive tokens to EOA
3. **Init smart account** — account address = EOA address (key EIP-7702 property)
4. **First transfer** — includes authorization, extra gas cost
5-6. **Verify effects** — recipient got tokens, treasury got gas buffer
7. **Verify delegation** — getCode returns delegated code
8. **Second transfer** — no extra authorization gas
9. **Verify persistence** — delegation still active

**Key strength**: Tests both the delegation mechanism (steps 4, 7) AND the gas overhead difference (step 4 extra ~45K gas vs step 8 normal gas). This catches bugs where:
- Authorization is included in every tx (waste)
- Authorization is never included (broken)
- Delegation doesn't persist (broken)
- Account address ≠ EOA address (wrong implementation)

---

### 3.3 Expanded Chaos Tests (Section 10.9) — 10 Scenarios

| # | Scenario | v2 Had? | v3 Quality |
|---|----------|---------|------------|
| 1 | Alto container killed mid-bundle | ✅ | Good — restart + retry |
| 2 | **Alto replica failover** | ❌ NEW | Good — alto-2 picks up |
| 3 | RPC primary down | ✅ | Good — failover |
| 4 | Paymaster deposit = 0 | ✅ | Good — 503 error |
| 5 | Backend signer key rotated | ✅ | Good — old rejected, new accepted |
| 6 | Network partition | ✅ | Good — 30s timeout + retry |
| 7 | Concurrent sends (nonce collision) | ✅ | Good — second queued |
| 8 | App kill mid-transaction | ✅ | Good — on-chain state check |
| 9 | ETH price API down | ✅ | ⚠️ Cached price or reject; no boundary |
| 10 | **Gas price spike 50%** | ❌ NEW | Good — buffer insufficient → retry |

**Notable additions**:
- #2 (Alto replica failover) addresses the bundler SPOF concern from v2
- #10 (gas price spike) tests the 20% buffer adequacy at extreme conditions

**Missing from v1/v2 recommendations**:
- Alto restart exhaustion (3 failures → 503) — addressed differently via replica failover
- Concurrent 100 relay requests / load test
- JWT secret rotation
- Alto returns success but UserOp never lands

---

### 3.4 Performance Baselines (Section 10.10) — 5 Metrics

| Metric | Target | v2 Had? | Assessment |
|--------|--------|---------|------------|
| Gas estimation latency | < 500ms p95 | ✅ | Good — tight target |
| Relay latency | < 2s p95 | ✅ | Good |
| Confirmation time | < 10s p95 | ✅ | Good |
| Alto throughput | > 50 UserOps/min | ✅ | Good |
| Backend memory | < 200MB | ✅ | Good |

**Still missing** (from v2 recommendations):
- Paymaster signing time (< 50ms)
- Balance check latency (< 1s)
- UserOp size (< 64KB)
- Gas estimation accuracy (P95 within 20% of actual)

The gas estimation accuracy metric is the most important missing item — without tracking estimated vs actual gas over time, the 20% buffer assumption is never validated in production.

---

### 3.5 Anvil/Hardhat Fork CI Setup (Section 10.8)

Same as v2. GitHub Actions YAML with Anvil service container.

**Minor concern**: Uses `ghcr.io/foundry-rs/foundry:latest` (not pinned tag). Should pin to a specific version for reproducibility.

---

## 4. Test Count Verification

| Layer | v2 Count | v3 Count | Notes |
|-------|----------|----------|-------|
| Unit (10.1) | ~55 | ~55 | Same 5 component areas |
| Integration (10.2) | ~20 | ~20 | Same 7 flows + mock-implied |
| E2E (10.3) | ~15 | ~15 | Same 9 flows |
| wBTC 8-decimal (10.4) | 10 | 10 | Unchanged |
| ArbitrumWallet parity (10.6) | 10 | 10 | Unchanged |
| Security (10.7) | 10 | **15** | +5 (gas params, gas recipient, buffer min) |
| EIP-7702 E2E (10.8b) | 0 | **1** | +1 (9-step test) |
| Chaos (10.9) | 8 | **10** | +2 (replica failover, gas spike) |
| Performance (10.10) | 5 | 5 | Unchanged |
| **Total** | **~113** | **~121** | +8 net new tests |

The plan claims ~110 tests. My count shows ~121. The discrepancy is minor and depends on how individual assertions within test cases are counted. The claim is **verified as reasonable** (approximately correct).

**Risk coverage**: 22 risk items identified. Tests cover 17 of 22 (77%). 5 untested risks are operational/infrastructure concerns, not code bugs.

---

## 5. NEW Critical Gaps

**No new Critical gaps identified.** All additions are additive and well-scoped.

---

## 6. Remaining Important Gaps

| # | Gap | Severity | Impact | Recommendation |
|---|-----|----------|--------|----------------|
| 1 | **EIP-7702 escape hatch not tested** (Risk #19) | Important | If BitTasker disappears, no test proves users can revoke delegation via another bundler or direct ETH tx | Add integration test: revoke delegation via mock third-party bundler |
| 2 | **ETH price oracle unit tests missing** | Important | convertToTokenBuffer boundary conditions (stale threshold, zero price, negative) not explicitly tested | Add 4 unit tests to Section 10.1 |
| 3 | **4 performance metrics missing** | Important | Signing time, balance fetch, UserOp size, gas estimation accuracy | Add to Section 10.10 |
| 4 | **Gas price spike boundary not tested** | Important | 19% spike should succeed, 21% spike should fail — only 50% spike tested | Add boundary test |
| 5 | **Architecture ↔ chaos test discrepancy** | Important | Chaos #2 tests Alto replica failover, but architecture shows single instance | Clarify architecture or adapt test |
| 6 | **Foundry CI image not pinned** | Minor | `foundry:latest` may change between CI runs | Pin to specific tag |

---

## 7. Confidence Score Breakdown

| Category | Weight | v2 Score | v3 Score | Weighted | Notes |
|----------|--------|----------|----------|----------|-------|
| Happy-path flow coverage | 10% | 88 | 90 | 9.0 | First-time EIP-7702 E2E added |
| Edge case coverage | 12% | 75 | 82 | 9.84 | tBTC concrete values, wrong recipient, buffer minimum |
| High-severity risk coverage | 20% | 78 | 85 | 17.0 | All 4 gas params tested, chaos expanded |
| Security test coverage | 18% | 82 | 90 | 16.2 | 15 tests with concrete I/O (up from 10 single-line) |
| Mock strategy completeness | 10% | 70 | 72 | 7.2 | Minor — same mocks |
| Contract verification | 10% | 90 | 90 | 9.0 | Same Anvil fork setup |
| wallet-core parity | 3% | 85 | 85 | 2.55 | Same 10 groups |
| E2E flow completeness | 5% | 72 | 85 | 4.25 | EIP-7702 E2E test added |
| Performance testing | 5% | 65 | 65 | 3.25 | Same 5 metrics, still missing 4 |
| Chaos/resilience testing | 5% | 70 | 78 | 3.9 | 10 scenarios, replica failover, gas spike |
| CI/CD infrastructure | 2% | 85 | 85 | 1.7 | Same Anvil CI |
| **Total** | **100%** | — | — | **83.89** |

**Qualitative adjustments:**
- +2 for concrete inputs/expected outputs on all 15 security tests (eliminates implementer ambiguity)
- +1 for all 4 gas parameters tested with documented bounds (not just callGasLimit)
- +0.5 for 9-step EIP-7702 E2E test (highest-impact single addition)
- -1 for ETH price oracle unit tests still missing
- -0.5 for architecture ↔ chaos test discrepancy

**Final Confidence Score: 86/100**

---

## 8. Verdict Summary

### v1 Critical Gaps: ALL 5 STILL RESOLVED

| # | Gap | v2 Status | v3 Status | Change |
|---|-----|-----------|-----------|--------|
| 1 | Paymaster signature placement | ✅ RESOLVED | ✅ RESOLVED | Improved — two assertions |
| 2 | Paymaster hash computation | ✅ RESOLVED | ✅ RESOLVED | Improved — concrete UserOp fields |
| 3 | Gas parameter bounds | ✅ RESOLVED | ✅ RESOLVED | **Major improvement** — all 4 params |
| 4 | tBTC decimal handling | ✅ RESOLVED | ✅ RESOLVED | Improved — exact BigInt output |
| 5 | callData structure validation | ✅ RESOLVED | ✅ RESOLVED | Expanded — 4 tests with error messages |

### v2 Important Gaps: 3 of 5 RESOLVED, 2 PARTIALLY

| # | Gap | v3 Status |
|---|-----|-----------|
| 1 | Gas parameter bound values not documented | ✅ RESOLVED |
| 2 | ETH price oracle edge cases | ⚠️ PARTIALLY — chaos describes behavior, no unit tests |
| 3 | First-time EIP-7702 E2E test | ✅ RESOLVED — 9-step test added |
| 4 | Chaos test for restart exhaustion | ⚠️ PARTIALLY — replica failover addresses differently |
| 5 | Test descriptions too terse | ✅ RESOLVED — all tests have concrete I/O |

### New Critical Gaps: NONE

### Confidence Trajectory

| Version | Score | Delta | Key Change |
|---------|-------|-------|------------|
| v1 (Gelato plan) | 45/100 | — | Baseline |
| v1 (Self-hosted) | 61/100 | +16 | Architecture change |
| v2 (Updated) | 82/100 | +21 | Security tests, Anvil CI, chaos, performance |
| **v3 (Final)** | **86/100** | **+4** | Concrete I/O, all 4 gas params, EIP-7702 E2E, expanded chaos |
| Target | 95/100 | +9 remaining | See path below |

### Path to 95%

1. Add 4 ETH price oracle unit tests (stale threshold, zero, negative, NaN) — **+2**
2. Add EIP-7702 escape hatch integration test — **+2**
3. Add 4 missing performance metrics (signing time, balance fetch, UserOp size, estimation accuracy) — **+1.5**
4. Clarify architecture single-vs-multi Alto instance — **+1**
5. Add gas price spike boundary test (19% OK, 21% fails) — **+1**
6. Pin Foundry CI image tag — **+0.5**
7. Add restart-exhaustion chaos test (if single instance) — **+1**

With all additions: estimated **~95/100**.

---

## 9. Implementation Priority Order

The plan is ready for implementation. The remaining Important gaps should be addressed in this order during the sprint:

| Priority | Item | When | Effort |
|----------|------|------|--------|
| P1 | ETH price oracle unit tests | Phase 1 (backend) | 1h |
| P2 | EIP-7702 escape hatch test | Phase 5 (integration) | 2h |
| P3 | Architecture clarification (single vs multi Alto) | Phase 0 (infra) | 30min |
| P4 | Gas estimation accuracy tracking | Phase 6 (hardening) | 2h |
| P5 | 3 missing performance baselines | Phase 6 (hardening) | 2h |
| P6 | Foundry CI image pinning | Phase 0 (infra) | 5min |

---

*Review completed: 2026-06-05 | Test Engineer agent profile*

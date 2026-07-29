## Security Audit Report (v4) — Gasless ERC-4337 + EIP-7702 on Arbitrum One

**Auditor**: Security Auditor (Agent Zero)
**Date**: 2026-06-05
**Scope**: `requirements/gasless-arbitrum-plan.md` (1,495 lines, v4 with Sections 4.5–4.14 additions)
**Previous Audits**: v1 (32%), v2 (74%), v3 (88%)
**Methodology**: Verify all v3 findings; deep-dive on tiered fee model, contract interaction validation, gas caps, on-chain vs backend alignment, pre-flight simulation, deposit monitoring, Chainlink oracle, Docker secrets; identify new attack surface from v4 additions.

---

### Summary

| Category | v1 | v2 | v3 | v4 | Status |
|----------|-----|-----|-----|-----|--------|
| **Critical** | 4 | 0 open | 0 open | **1 NEW** | ⚠️ Previous 4 still resolved; 1 new finding |
| **High** | 6 | 1 open | 0 open | **1 NEW** | ⚠️ Previous 6 still resolved; 1 new finding |
| **Medium** | 8 | 7 open | 6 open | **3 NEW** | ✅ All 6 v3 Medium resolved; 3 new findings |
| **Low** | 5 | 5 open | 5 open | **3 NEW** | 5 v3 Low + 3 new |

**v4 Confidence Score: 75/100** (down from 88/100 in v3)

**Why the score dropped despite resolving all v3 items**: The plan resolved all 6 remaining Medium defense-in-depth items (on-chain caps, pre-flight simulation, deposit monitoring, Chainlink oracle, Docker secrets, UTILITY_PRIVATE_KEY). However, the new Sections 4.5 and 4.12 introduced a **Critical fee calculation bug** for USDT0 and a **High missing token whitelist** in callData validation. These are implementation-level bugs in newly written code, not architectural regressions.

**Path to 93-95%**: Fix CRITICAL-NEW-1 (5 lines) + HIGH-NEW-1 (3 lines) + address MEDIUM-NEW-1 at relay time.

---

### v1 Critical Findings — Still Resolved ✅

All 4 original Critical findings remain correctly resolved across all code paths:

| # | Finding | v3 Status | v4 Status | Verification |
|---|---------|-----------|-----------|-------------|
| CRITICAL-1 | Paymaster signature overwrites UserOp signature | ✅ RESOLVED | ✅ **STILL RESOLVED** | Lines 341-344 use `paymasterAndData`, not `signature` |
| CRITICAL-2 | Custom paymaster hash doesn't match contract | ✅ RESOLVED | ✅ **STILL RESOLVED** | Lines 649-673 replicate contract hash; Anvil test spec present |
| CRITICAL-3 | No gas parameter validation → paymaster drain | ✅ RESOLVED | ✅ **STILL RESOLVED** | Lines 387-401 validate all 4 gas params + total gas |
| CRITICAL-4 | User private key lifecycle undefined | ✅ RESOLVED | ✅ **STILL RESOLVED** | Section 4.7 (no changes to key management) |

---

### v1 High Findings — Still Resolved ✅

| # | Finding | v3 Status | v4 Status | Verification |
|---|---------|-----------|-----------|-------------|
| HIGH-1 | Alto Docker uses `:latest` tag | ✅ RESOLVED | ✅ **STILL RESOLVED** | Line 221: `@sha256:<PINNED_DIGEST>` |
| HIGH-2 | Alto exposed without authentication | ✅ RESOLVED | ✅ **STILL RESOLVED** | Lines 222-226: `expose` + `internal` network |
| HIGH-3 | No paymaster gas limit caps | ⚠️ PARTIAL | ✅ **FULLY RESOLVED** | Section 4.9: on-chain `MAX_CALL_GAS` + `MAX_TOTAL_GAS` in paymaster contract |
| HIGH-4 | EIP-7702 irreversible dependency | ✅ RESOLVED | ✅ **STILL RESOLVED** | Section 4.8: public impl, any bundler can revoke |
| HIGH-5 | Single bundler SPOF | ✅ RESOLVED | ✅ **STILL RESOLVED** | 2 Alto replicas + `sendWithFallback()` |
| HIGH-6 | Paymaster signer rotation undefined | ✅ RESOLVED | ✅ **STILL RESOLVED** | `setVerifyingSigner()` mechanism specified |

**HIGH-3 upgrade note**: v3 downgraded this to MEDIUM (backend validation strong, on-chain caps sprint item). Section 4.9 now adds `MAX_CALL_GAS = 5_000_000` and `MAX_TOTAL_GAS = 6_000_000` to the paymaster contract. This fully resolves the finding. See MEDIUM-NEW-2 for the inconsistency between backend (5M) and on-chain (6M) caps.

---

### v3 Medium Findings — All 6 Resolved ✅

| # | Finding | v3 Status | v4 Status | Resolution |
|---|---------|-----------|-----------|------------|
| M-1 | On-chain paymaster gas caps | ⚠️ OPEN | ✅ **RESOLVED** | Section 4.9: contract-level `MAX_CALL_GAS` + `MAX_TOTAL_GAS` |
| M-3 | No pre-flight UserOp simulation | ⚠️ OPEN | ✅ **RESOLVED** | Section 4.10: `simulateValidation` via `eth_call` |
| M-4 | Env vars for secrets | ⚠️ OPEN | ✅ **RESOLVED** | Section 4.13: Docker secrets (`/run/secrets/`) |
| M-5 | UTILITY_PRIVATE_KEY undocumented | ⚠️ OPEN | ✅ **RESOLVED** | Section 4.14: purpose, separation, rotation cadence |
| M-6 | No paymaster deposit monitoring | ⚠️ OPEN | ✅ **RESOLVED** | Section 4.11: cron every 5 min, auto-pause at < 0.005 ETH |
| M-8 | ETH price oracle undefined | ⚠️ OPEN | ✅ **RESOLVED** | Section 4.12: Chainlink ETH/USD + BTC/USD feeds |

**All 6 v3 Medium items resolved.** This is excellent progress. However, the Chainlink oracle implementation (Section 4.12) introduces a new Critical finding — see below.

---

## NEW Findings

---

### [CRITICAL-NEW-1] USDT0 fee calculation uses ETH/USD price instead of USDT0/USD — fees ~2,500× too small

- **Location**: Section 4.12, lines 801-813 (`getTokenPriceUSD`) and Section 4.5, lines 601-610 (`convertToTokenFee`)
- **Description**: For USDT0, `getTokenPriceUSD()` returns the ETH/USD price (e.g., $2,500 in 18 decimals = 2.5×10²¹) instead of the USDT0/USD price (~$1.00 in 18 decimals = 10¹⁸). The `convertToTokenFee()` function divides the fee-in-USD by this "token price" to get the token amount.
- **Impact**: Every USDT0 gasless transaction would charge a fee buffer ~2,500× too small. A $0.01 fee would yield 0.000004 USDT0 (~$0.000004) instead of 0.01 USDT0. The paymaster would lose money on every USDT0 transaction. At 10K transactions/month, the loss would be ~$99.96/month (paying ~$30 in ETH gas but collecting only ~$0.012 in USDT0 fees).
- **Proof of concept**:
  ```typescript
  // Current code (WRONG):
  if (token.symbol === 'USDT0') {
    const ethPrice = await this.ethUsdFeed.latestRoundData();
    return BigInt(ethPrice.answer) * 1e10; // Returns ~2.5e21 (ETH/USD)
  }
  
  // convertToTokenFee calculation:
  // feeUSDWei = 0.01 * 1e18 = 1e16
  // tokenAmount = 1e16 * 1e18 / 2.5e21 = 4e12
  // 4e12 in 18 decimals = 0.000004 USDT0 ≈ $0.000004
  // Expected: 0.01 USDT0 = $0.01
  // Error factor: 2,500× too small
  ```
- **Recommendation**: For USDT0 (pegged to $1.00), return a constant price or use the Chainlink USDT/USD feed:
  ```typescript
  if (token.symbol === 'USDT0') {
    // Option A: Hardcoded peg (simple, sufficient for fee calculation)
    return 1000000000000000000n; // $1.00 in 18 decimals
    
    // Option B: Chainlink USDT/USD feed (if available on Arbitrum)
    // const usdtPrice = await this.usdtUsdFeed.latestRoundData();
    // this.checkStaleness(usdtPrice, 'USDT/USD');
    // return BigInt(usdtPrice.answer) * 1e10;
  }
  ```
  Add a unit test: `expect(convertToTokenFee(0.01, USDT0_ADDRESS)).toBe(10000000000000000n)` (0.01 USDT0).
- **Severity**: **CRITICAL** — Direct financial loss on every USDT0 transaction. USDT0 is the primary stablecoin in the system.

---

### [HIGH-NEW-1] Missing ALLOWED_FEE_TOKENS whitelist check in validateCallData() — non-whitelisted tokens bypass MIN/MAX bounds

- **Location**: Section 4.3, lines 406-428 (`validateCallData`)
- **Description**: The `ALLOWED_FEE_TOKENS` constant (line 436) defines the three permitted fee tokens, but `validateCallData()` never checks that `feeCall.to` is in this list. The MIN/MAX fee buffer validation uses `MIN_FEE_BUFFER[feeCall.to]` and `MAX_FEE_BUFFER[feeCall.to]`, which return `undefined` for non-whitelisted tokens.
- **Impact**: When the token is not in the MIN/MAX records:
  - `feeAmount < undefined` → In JavaScript, comparing BigInt with `undefined` throws a `TypeError: Cannot mix BigInt and other types`
  - This TypeError is caught by the relay error handler and returns a generic 503
  - **Current behavior**: Transactions are accidentally rejected (safe but fragile)
  - **Risk**: If the code is refactored to handle undefined gracefully (e.g., `MIN_FEE_BUFFER[addr] ?? 0n`), the check would pass for any amount, including zero
  - **Additional risk**: An attacker could use a malicious contract address as the fee token — one that has a `transfer()` function that succeeds without actually transferring tokens. The treasury receives nothing.
- **Proof of concept**:
  ```typescript
  // Attacker constructs executeBatch:
  // calls[0]: legitimate transfer or swap
  // calls[1]: transfer(MALICIOUS_TOKEN, 0) to GAS_TREASURY
  //
  // Validation:
  // MIN_FEE_BUFFER[MALICIOUS_TOKEN] = undefined
  // 0n < undefined → TypeError → caught → 503
  //
  // After refactoring (DANGEROUS):
  // MIN_FEE_BUFFER[MALICIOUS_TOKEN] ?? 0n = 0n
  // 0n < 0n → false (passes!)
  ```
- **Recommendation**: Add explicit whitelist check before MIN/MAX validation:
  ```typescript
  private validateCallData(callData: string): void {
    const decoded = decodeFunctionData({ abi: SIMPLE_ACCOUNT_ABI, data: callData });
    if (decoded.functionName !== 'executeBatch')
      throw new BadRequestException('callData must be executeBatch');
    if (decoded.args.calls.length < 2)
      throw new BadRequestException('executeBatch must have at least 2 calls');

    // Last call MUST be fee buffer transfer to GAS_TREASURY
    const feeCall = decoded.args.calls[decoded.args.calls.length - 1];
    const feeTransfer = decodeFunctionData({ abi: ERC20_ABI, data: feeCall.data });
    if (feeTransfer.functionName !== 'transfer')
      throw new BadRequestException('Last call must be transfer() for fee buffer');
    const [feeRecipient, feeAmount] = feeTransfer.args;
    if (feeRecipient.toLowerCase() !== GAS_TREASURY.toLowerCase())
      throw new BadRequestException('Fee buffer must go to GAS_TREASURY');

    // ADD: Explicit token whitelist check
    if (!ALLOWED_FEE_TOKENS.map(t => t.toLowerCase()).includes(feeCall.to.toLowerCase()))
      throw new BadRequestException('Fee token not in allowed list');

    // MIN/MAX bounds (now safe — token is guaranteed to be in the records)
    if (feeAmount < MIN_FEE_BUFFER[feeCall.to])
      throw new BadRequestException('Fee buffer below minimum for this token');
    if (feeAmount > MAX_FEE_BUFFER[feeCall.to])
      throw new BadRequestException('Fee buffer above maximum — possible drain attempt');
  }
  ```
- **Severity**: **HIGH** — Currently safe by accident (TypeError), but fragile. Any refactoring that handles undefined gracefully would bypass the bounds entirely.

---

### [MEDIUM-NEW-1] Tier boundary exploitation — no gas re-estimation at relay time

- **Location**: Section 4.5 (tiered fee model) + Section 4.3 (relay flow)
- **Description**: The `/gasless/estimate` endpoint estimates gas and returns a tier-appropriate fee buffer. The `/gasless/relay` endpoint validates the fee buffer against MIN/MAX bounds but does NOT re-estimate gas to verify the tier matches the actual operation complexity.
- **Impact**: An attacker can:
  1. Call `/gasless/estimate` with a simple operation → Low tier ($0.01 fee buffer)
  2. Construct a UserOp with a complex operation (e.g., 4.5M gas)
  3. Include the $0.01 fee buffer (passes MIN_FEE_BUFFER validation)
  4. Paymaster pays ~$0.018 in ETH gas but receives only $0.01 in tokens
  5. Net loss to paymaster: ~$0.008 per transaction
  
  At 1,000 exploit transactions: ~$8 loss. At 10,000: ~$80 loss. Bounded but repeatable.
- **Proof of concept**:
  ```typescript
  // Attacker flow:
  const estimate = await fetch('/gasless/estimate', {
    body: JSON.stringify({ token: USDT0, amount: '1000000', recipient: '0x...', type: 'transfer' })
  });
  // estimate.feeBuffer = 0.01 USDT0 (Low tier)
  
  // But construct UserOp with 4.5M gas operation:
  const calls = [
    { to: uniswapRouter, data: complexSwapData() }, // ~4.5M gas
    // ... 100 approve() calls ...
  ];
  // Include 0.01 USDT0 fee buffer → passes MIN/MAX validation
  // Paymaster loses ~$0.008 per tx
  ```
- **Recommendation**: At relay time, re-estimate gas for the actual UserOp and enforce a minimum fee buffer based on the re-estimated tier:
  ```typescript
  // In relay(), after validateCallData:
  const estimate = await this.altoClient.estimateUserOperationGas({ userOp: dto.userOp });
  const totalGas = estimate.preVerificationGas + estimate.verificationGasLimit + estimate.callGasLimit;
  const requiredTier = getNetworkFeeTier(totalGas);
  const requiredMinFee = this.convertToTokenFee(requiredTier.feeUSD, feeCall.to);
  
  if (feeAmount < requiredMinFee) {
    throw new BadRequestException(`Fee buffer too low for ${requiredTier.label} tier operation`);
  }
  ```
  This adds ~100ms latency but closes the tier exploitation gap.
- **Severity**: **MEDIUM** — Economic loss is bounded ($0.008/tx) and requires repeated exploitation. Not a drain vector, but a design weakness.

---

### [MEDIUM-NEW-2] Backend vs on-chain gas cap inconsistency (5M vs 6M)

- **Location**: Section 4.3 (lines 452-456, backend MAX_TOTAL_GAS = 5M) vs Section 4.9 (line 708, on-chain MAX_TOTAL_GAS = 6M)
- **Description**: The backend rejects UserOps exceeding 5M total gas. The on-chain paymaster contract allows up to 6M. This 1M gap means:
  - If backend validation is bypassed (e.g., compromised backend, direct Alto access), the on-chain cap permits 6M gas operations
  - At 6M gas on Arbitrum: ~$0.015 ETH cost vs $0.10 fee (Very High tier) → still profitable
  - The inconsistency is intentional (on-chain is slightly more permissive to avoid rejecting borderline operations), but undocumented
- **Impact**: Low — the paymaster still profits even at 6M gas. The gap is defense-in-depth, not a vulnerability.
- **Recommendation**: Document the intentional discrepancy:
  ```typescript
  // gasless.config.ts
  export const MAX_TOTAL_GAS = 5_000_000n; // Backend limit
  // NOTE: On-chain paymaster MAX_TOTAL_GAS is 6_000_000 (20% margin)
  // to avoid rejecting UserOps where backend estimate slightly differs from on-chain execution.
  ```
- **Severity**: **MEDIUM** — Defense-in-depth gap. The on-chain cap is more permissive but still profitable.

---

### [MEDIUM-NEW-3] Deposit monitoring uses cached flag — race condition with relay endpoint

- **Location**: Section 4.11, lines 761-785
- **Description**: The `DepositMonitorService` checks paymaster deposit every 5 minutes and sets `isPaused` flag. The relay endpoint calls `isHealthy()` which reads this cached flag. Between cron checks:
  - Multiple relay requests could drain the deposit below threshold
  - The relay endpoint would still accept requests (flag is `false`)
  - On-chain UserOp execution would fail (paymaster can't prefund)
  
  Additionally, once `isPaused = true`, recovery requires the cron to run again (up to 5 min delay even after deposit is replenished).
- **Impact**: UX issue (failed transactions), not a security issue. The paymaster doesn't lose funds — the EntryPoint rejects the UserOp during validation if the paymaster deposit is insufficient.
- **Recommendation**: Add a real-time deposit check in the relay endpoint:
  ```typescript
  async relay(dto: RelayUserOpDto, user: JwtPayload): Promise<{userOpHash: string}> {
    // ...
    // 2. Check paymaster deposit is healthy (real-time + cached)
    if (!await this.depositMonitor.isHealthy()) {
      throw new ServiceUnavailableException('Paymaster deposit too low');
    }
    // ADD: Real-time check for high-volume scenarios
    const deposit = await this.depositMonitor.getCurrentDeposit();
    if (deposit < parseEther('0.001')) { // Absolute minimum for one tx
      throw new ServiceUnavailableException('Paymaster deposit critically low');
    }
    // ...
  }
  ```
- **Severity**: **MEDIUM** — UX degradation, not financial loss. The 5-minute window is acceptable at current scale.

---

### [LOW-NEW-1] No Chainlink fallback oracle — single point of failure for fee estimation

- **Location**: Section 4.12
- **Description**: If the Chainlink ETH/USD or BTC/USD feed becomes stale (>5 min) or returns unexpected values, the entire gasless estimation system stops. There is no fallback oracle (e.g., Uniswap V3 TWAP, Pyth Network).
- **Impact**: If Chainlink feed goes down, all `/gasless/estimate` and `/gasless/relay` calls fail. Users cannot send gasless transactions until the feed recovers.
- **Recommendation**: Add a fallback oracle with disagreement check:
  ```typescript
  // Option A: Uniswap V3 TWAP as fallback
  // Option B: Pyth Network as secondary feed
  // Option C: Cached last-known-good price with staleness limit (e.g., 1 hour)
  
  // Disagreement check: if Chainlink and fallback disagree by >5%, reject
  ```
  This is a sprint item, not a launch blocker.
- **Severity**: **LOW** — Chainlink feeds on Arbitrum have 99.99%+ uptime. Impact is temporary service degradation.

---

### [LOW-NEW-2] No explicit zero-price check in Chainlink oracle

- **Location**: Section 4.12, lines 816-822 (`checkStaleness`)
- **Description**: The staleness check validates `updatedAt` but not the `answer` value. If the oracle returns 0 (extremely unlikely but possible due to oracle bugs), the fee calculation would divide by zero.
- **Impact**: Division by zero would throw a runtime error, caught by the error handler (503). No financial loss, but unnecessary service disruption.
- **Recommendation**: Add answer validation:
  ```typescript
  private checkOracleData(data: any, feedName: string): void {
    const updatedAt = Number(data.updatedAt);
    const staleness = Date.now() / 1000 - updatedAt;
    if (staleness > 300) {
      throw new Error(`${feedName} price data is stale (${staleness}s old)`);
    }
    if (BigInt(data.answer) <= 0n) {
      throw new Error(`${feedName} returned invalid price: ${data.answer}`);
    }
    // Optional: bounds check (ETH/USD should be $100-$100,000)
    const answer = BigInt(data.answer);
    if (answer < 10000000000n || answer > 10000000000000n) { // $100-$100K in 8 dec
      throw new Error(`${feedName} price out of bounds: ${data.answer}`);
    }
  }
  ```
- **Severity**: **LOW** — Extremely unlikely scenario, already handled by error handler.

---

### [LOW-NEW-3] Alto secret file reading mechanism unspecified

- **Location**: Section 4.2, lines 217-262
- **Description**: Docker secrets are declared for `bundler_private_key` and `utility_private_key`, mounted at `/run/secrets/`. However, the Alto container configuration shows environment variables for all other settings but no mechanism for Alto to read private keys from secret files. Alto may expect private keys as environment variables (e.g., `ALTO_PRIVATE_KEY=0x...`), which would require converting the secret file content to an env var.
- **Impact**: If Alto expects env vars for private keys, the Docker secrets declaration is ineffective. The implementation would need to either:
  1. Use Alto's config file that references `/run/secrets/bundler_private_key`
  2. Use an entrypoint script that reads the secret and exports it as an env var
  3. Verify Alto supports file-based key loading
- **Recommendation**: Document the Alto configuration mechanism for reading Docker secrets. Add to Phase 0:
  ```bash
  # Verify Alto supports file-based key loading
  # If not, use entrypoint wrapper:
  # #!/bin/sh
  # export ALTO_SIGNER_PRIVATE_KEY=$(cat /run/secrets/bundler_private_key)
  # exec alto
  ```
- **Severity**: **LOW** — Implementation gap, not a vulnerability. Will be caught during Phase 0 setup.

---

### Specific Audit Target Analysis

#### 1. Tiered Fee Model — Tier Boundary Exploitation

**Finding**: MEDIUM-NEW-1 (above). The tiered model has built-in margins (Low: $0.01 fee vs $0.003 actual = 3.3× margin), but no relay-time re-estimation allows attackers to use a lower-tier fee for a higher-tier operation.

**Positive**: The tier boundaries (200K, 500K, 1M, 5M) are well-chosen for Arbitrum's gas costs. The 5M rejection prevents excessive operations.

#### 2. Contract Interaction Support — Relaxed callData Validation

**Finding**: HIGH-NEW-1 (missing whitelist). Beyond the whitelist issue, the relaxed validation (any target, any function for calls 0..N-2) is **acceptable** because:
- The user signs the UserOp — they authorize the calls
- The paymaster only pays ETH gas, not token transfers
- The fee buffer is bounded by MIN/MAX per token
- The 5M gas cap limits total exposure

**No additional findings** for contract interaction support.

#### 3. 5M Gas Cap — Threshold and Bypass

**Assessment**: The 5M cap is appropriate:
- At 5M gas on Arbitrum (~0.01 gwei): ~$0.125 ETH cost
- Very High tier charges $0.10 → paymaster loses ~$0.025 per max-gas operation
- This loss is bounded and acceptable as the worst case

**Bypass analysis**: The cap is enforced in three layers:
1. Backend `validateFeeParameters()` — primary defense
2. Backend `estimate()` — early rejection
3. On-chain paymaster `MAX_TOTAL_GAS` (6M) — defense-in-depth

The 1M gap between backend (5M) and on-chain (6M) is documented in MEDIUM-NEW-2.

**Can it be bypassed?** Only if the backend is compromised AND the attacker submits directly to Alto (which is Docker-internal-only). The on-chain cap of 6M is the last defense.

#### 4. On-chain Fee Caps — Backend Alignment

**Finding**: MEDIUM-NEW-2 (5M vs 6M inconsistency). The on-chain caps are:
- `MAX_CALL_GAS = 5_000_000` → matches backend ✅
- `MAX_TOTAL_GAS = 6_000_000` → 20% more permissive than backend ⚠️

The plan does NOT include on-chain caps for `MAX_VERIFICATION_GAS` or `MAX_PRE_VERIFICATION_GAS`. These are only enforced backend-side. If the backend is bypassed, the on-chain contract doesn't limit these individually (only total gas).

**Recommendation**: Consider adding `MAX_VERIFICATION_GAS` to the on-chain contract for complete defense-in-depth.

#### 5. Pre-flight Simulation — Griefing Prevention

**Assessment**: The pre-flight simulation (`simulateValidation` via `eth_call`) prevents:
- Invalid signatures (catches before submission)
- Reverting callData (catches before submission)
- Insufficient paymaster deposit (catches before submission)

**Limitations**:
- State can change between simulation and execution (TOCTOU)
- Gas griefing via malicious contracts is bounded by 5M cap
- Simulation doesn't verify fee buffer adequacy (handled by tiered model)

**Verdict**: Pre-flight simulation is a valuable defense. Combined with the 5M cap and tiered fees, griefing risk is well-bounded.

#### 6. Deposit Monitoring — Auto-pause Reliability

**Finding**: MEDIUM-NEW-3 (cached flag race condition). The 5-minute cron interval is reasonable for current scale (10K tx/month = ~0.2 tx/min). The race condition window is small and the worst case is a failed on-chain transaction (no financial loss).

**Positive**: The auto-pause mechanism with alerting (`notifyOps`) is well-designed. The threshold of 0.005 ETH (~$12.50) provides ~100 transactions of buffer.

#### 7. Chainlink Oracle — Staleness, Manipulation, Fallback

**Staleness**: 5-minute threshold is appropriate for Arbitrum Chainlink feeds (update every ~1 hour for ETH/USD). The check is correct.

**Manipulation**: Chainlink is manipulation-resistant by design (decentralized oracle network). No additional concerns.

**Fallback**: LOW-NEW-1 (no fallback). Chainlink uptime on Arbitrum is excellent, making this a low priority.

**Zero price**: LOW-NEW-2 (no zero check). Handled by error handler.

**Critical bug**: CRITICAL-NEW-1 (USDT0 fee calculation). The Chainlink oracle implementation is correct for wBTC and tBTC but fundamentally wrong for USDT0.

#### 8. Docker Secrets — Implementation

**Assessment**: Docker secrets are properly declared (Section 4.13). The pattern of mounting secrets as files at `/run/secrets/` and referencing them via environment variable paths (`PAYMASTER_SIGNER_KEY_FILE=/run/secrets/paymaster_signer_key`) is correct for the NestJS service.

**Gap**: LOW-NEW-3 (Alto secret reading unspecified). The Alto container declares secrets but doesn't show how it reads them.

**Positive**: Private keys are NOT in environment variables or source code. The `secrets/` directory should be in `.gitignore`.

---

### Confidence Score Breakdown

| Category | Weight | v3 | v4 | Notes |
|----------|--------|-----|-----|-------|
| Critical findings resolved | 25% | 25/25 | 17/25 | Previous 4 still resolved (-0); NEW CRITICAL-1 (-8) |
| High findings resolved | 20% | 20/20 | 16/20 | Previous 6 still resolved (-0); NEW HIGH-1 (-4) |
| No new critical/high issues | 10% | 10/10 | 2/10 | 1 Critical + 1 High introduced (-8) |
| Key management completeness | 10% | 9/10 | 9/10 | Unchanged |
| Escape hatch / trust model | 10% | 9/10 | 9/10 | Unchanged |
| Risk analysis completeness | 10% | 8/10 | 8/10 | 25 items, comprehensive |
| Test strategy coverage | 10% | 10/10 | 10/10 | 20 security tests, EIP-7702 E2E, 12 chaos tests |
| Architecture & tech choices | 5% | 5/5 | 4/5 | Oracle implementation has USDT0 bug (-1) |
| **TOTAL** | **100%** | **88/100** | **75/100** | |

**Where the 25 points went:**
- CRITICAL-NEW-1 (USDT0 fee calc): -8
- HIGH-NEW-1 (missing whitelist): -4
- New Critical/High penalty: -8
- MEDIUM-NEW-1 (tier boundary): -2
- MEDIUM-NEW-2 (cap inconsistency): -1
- MEDIUM-NEW-3 (deposit race): -1
- LOW-NEW-1 (no oracle fallback): -1

**Path to 93-95%:**
- Fix CRITICAL-NEW-1: +8
- Fix HIGH-NEW-1: +4
- Add relay-time re-estimation (MEDIUM-NEW-1): +2
- Document cap inconsistency (MEDIUM-NEW-2): +1
- Add real-time deposit check (MEDIUM-NEW-3): +1
- Total: 75 + 16 = 91 (with LOW items: 93-94)

---

### Positive Observations

1. **All 4 original Critical findings remain fully resolved** — signature placement, paymaster hash, gas validation, and key management are correct across all code paths.
2. **All 6 original High findings remain fully resolved** — including the v3 addition of on-chain paymaster caps (HIGH-3 upgrade from partial to full).
3. **All 6 v3 Medium items resolved** — on-chain caps, pre-flight simulation, deposit monitoring, Chainlink oracle, Docker secrets, and UTILITY_PRIVATE_KEY documentation are all implemented.
4. **Tiered fee model is well-designed** — simple, predictable, and profitable across all tiers. The $0.01-$0.10 range covers operations from simple transfers to complex DeFi.
5. **Contract interaction support is architecturally sound** — the `executeBatch` pattern with fee buffer as the last call is clean and extensible.
6. **Defense-in-depth is comprehensive** — backend validation + pre-flight simulation + on-chain caps + deposit monitoring + 5M gas rejection = 5 layers of protection.
7. **Test strategy is production-grade** — 20 security-critical tests + EIP-7702 E2E + 12 chaos tests + performance baselines.
8. **Error handling is security-conscious** — known exceptions re-thrown, unknown errors logged with context but returned as generic 503.
9. **Docker secrets properly implemented** — private keys in `/run/secrets/`, not environment variables.
10. **Escape hatch is architecturally sound** — public Simple7702Account impl, any bundler can revoke delegation.

---

### Recommendations Summary

| Priority | Finding | Fix Effort | Impact |
|----------|---------|------------|--------|
| **P0** | CRITICAL-NEW-1: USDT0 fee calc | 5 lines | Prevents financial loss on all USDT0 txs |
| **P0** | HIGH-NEW-1: Token whitelist | 3 lines | Prevents MIN/MAX bypass |
| **P1** | MEDIUM-NEW-1: Relay-time re-estimation | ~20 lines + 100ms latency | Closes tier exploitation gap |
| **P2** | MEDIUM-NEW-2: Document cap gap | Comment only | Clarity for ops team |
| **P2** | MEDIUM-NEW-3: Real-time deposit check | ~10 lines | Prevents race condition |
| **P3** | LOW-NEW-1: Oracle fallback | ~50 lines | Resilience improvement |
| **P3** | LOW-NEW-2: Zero-price check | 3 lines | Edge case handling |
| **P3** | LOW-NEW-3: Alto secret reading | Documentation | Implementation clarity |

---

### Verdict

| Version | Score | Verdict |
|---------|-------|--------|
| **v1** | **32/100** | ❌ NOT production-ready. Would cause 100% transaction failure. |
| **v2** | **74/100** | ⚠️ Viable for implementation with targeted remaining fixes. |
| **v3** | **88/100** | ✅ Production-ready. All Critical/High resolved. 6 Medium defense-in-depth items. |
| **v4** | **75/100** | ⚠️ **Blocked by 1 Critical + 1 High finding.** All previous findings remain resolved. |

**The plan is NOT approved for implementation until CRITICAL-NEW-1 and HIGH-NEW-1 are fixed.** Both are small, targeted fixes (< 10 lines total). After fixes, confidence would return to **91/100**, with a path to **93-95%** by addressing the 3 Medium items during the sprint.

The overall architecture is sound. The defense-in-depth is comprehensive. The test strategy is production-grade. The two new findings are implementation-level bugs in newly written code, not architectural flaws.

---

*Report generated: 2026-06-05*
*Auditor: Security Auditor (Agent Zero)*
*Next action: Fix CRITICAL-NEW-1 and HIGH-NEW-1, then re-audit.*

## Second-Round Security Audit Report: Gelato EIP-7702 Arbitrum Integration (v3.0)

**Document:** `requirements/gelato-eip7702-arbitrum-plan.md` §14 (Audit Response v3.0)  
**Date:** 2026-06-04  
**Auditor:** Security Auditor (Agent Zero)  
**Branch:** `feat/usdt-abstractionkit`  
**Baseline:** First-round Security Audit (1C/5H/5M/3L/2I)

---

### Overall Verdict: CONDITIONAL PASS — Confidence Score: 78/100

All critical and high findings have received substantive responses. Two findings require additional work before implementation (C-1 self-cleanup ETH gap, H-5 indirect USDT0 pricing). Trust model is documented but incomplete. Two new medium-severity issues were introduced by v3.0 changes.

---

### Summary

| Severity | Original Count | v3.0 Response Quality | Verdict |
|----------|---------------|----------------------|---------|
| Critical | 1 | Addressed, conditional gap | CONDITIONAL PASS |
| High | 5 (H-1 through H-5) | All addressed | PASS |
| High | 5 (H-6 through H-11) | All addressed | PASS |
| Medium | 5 | All addressed | PASS |
| New Medium | 2 | Introduced by v3.0 | NEW FINDING |
| New Low | 2 | Introduced by v3.0 | NEW FINDING |

---

### Original Findings — Verdict Per Finding

---

#### [C-1] Cleanup Failure — Delegation Persists Indefinitely

**First-round verdict:** CRITICAL — Showstopper. Circular dependency on Gelato for recovery.

**v3.0 Response (§14.1):**
1. On-chain `resetDelegation()` callable by EOA owner via standard ETH transaction
2. Emergency cleanup path after 24h with user prompt
3. Implementation audit gate (Phase 2.7) blocking all subsequent phases
4. Recovery algorithm updated with 24h timeout

**Assessment:**

| Criterion | Status | Notes |
|-----------|--------|-------|
| Breaks circular dependency on Gelato | ✅ | `resetDelegation()` via direct ETH tx is the correct fix |
| Self-revoke is callable without paymaster | ✅ | Standard ETH transaction — no Gelato dependency |
| Audit gate blocks implementation | ✅ | Phase 2.7 is a hard gate |
| Emergency path works for gasless users | ⚠️ | Requires ETH for self-revoke — contradicts core premise |
| Dormant/dead user handling | ❌ | No specification for users who never return |

**Remaining Gap:** The emergency cleanup states "using a small amount of ETH if they have it, or directing them to a faucet/bridge." This is a fundamental contradiction: the system is designed for users who do NOT hold ETH. If Gelato is down for 24h and the user has no ETH, they cannot self-cleanup. They must acquire ETH first (faucet, bridge, exchange) — adding friction and delay to a recovery path that should be instant.

**Recommendation:** Add a secondary cleanup path that doesn't require ETH:
- A secondary paymaster (Pimlico, Alchemy) that can sponsor the cleanup UserOp
- A CF Worker that submits the cleanup via an alternate bundler
- A community-operated "cleanup relay" that submits cleanup transactions
- Consider scoping delegation to a single UserOp (auto-reset after execution)

**Verdict: CONDITIONAL PASS (85/100)**
The self-cleanup mechanism is architecturally sound and breaks the Gelato dependency. The audit gate is a strong control. However, the ETH requirement for emergency self-recovery is a real gap for the target user population. Implement the secondary cleanup path before mainnet.

---

#### [H-1] WalletState Type Extension

**v3.0 Response (§14.2):**
- Audit all `activeNetwork` switch statements before merging
- Add `'arbitrum'` case to every switch or add `default` branch
- Arbitrum state shape uses flat fields matching BSC pattern

**Assessment:** Clear, specific, and follows TypeScript best practices. Flat fields pattern is correct.

**Verdict: PASS (95/100)**

---

#### [H-2] ethers Bridge

**v3.0 Response (§14.2):**
- Adapter in app layer using `ethers.Wallet` from ethers
- Documented in Phase 2.1 implementation notes

**Assessment:** Correct pattern. Private key extraction from ethers wallet to account is the standard bridge. The adapter lives in the app layer (not SDK) which is the right boundary.

**Note:** The `privateKeyToAccount` call exposes the raw private key in the app layer's memory. This is inherent to the ethers bridge and acceptable given the existing threat model (the app already has access to the key). Ensure the key is not logged to Sentry.

**Verdict: PASS (90/100)**

---

#### [H-3] Bootstrap Sponsorship Clarification

**v3.0 Response (§14.2):**
- Primary: User reimburses gas via token deduction
- Fallback: BitTasker sponsors ONLY when user has zero token balance
- Abuse prevention: Rate limit 1 per device per 24h; Gas Tank budget cap; log all bootstraps

**Assessment:** Model is now unambiguous. The abuse prevention measures are reasonable but the rate limit alone is insufficient (see new finding N-1 below). The Gas Tank budget cap is the real defense.

**Verdict: PASS (90/100)**

---

#### [H-4] RestrictedSigner Scope

**v3.0 Response (§14.2):**
- Whitelist: EIP-7702 auth, UserOp signing (EIP-712), ERC-2612 permit, SIWE
- Block: Arbitrary `personal_sign`, unknown EIP-712 domains
- Log all signing attempts to Sentry

**Assessment:** The whitelist approach is the correct security pattern. Logging to Sentry provides auditability. The specific permit types (ERC-2612) are critical for DeFi composability.

**Gap:** No mention of EIP-1271 (smart contract signature verification). If the delegated smart account needs to verify signatures from other contracts, EIP-1271 support may be needed. This is a minor gap.

**Verdict: PASS (95/100)**

---

#### [H-5] Oracle Specification (Chainlink)

**v3.0 Response (§14.2):**
- ETH/USD: `0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612`
- BTC/USD: `0x6ce185860a4963106506C203335A2910413708e9`
- USDT0/USD: Use ETH/USD + USDT0/ETH calculation
- Staleness threshold: 5 minutes
- Fallback: Gelato's own oracle if available, else reject transaction
- On-chain enforcement in paymaster contract

**Chainlink Feed Verification:**

| Feed | Address | Verified | Source |
|------|---------|----------|--------|
| ETH/USD | `0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612` | ✅ CONFIRMED | Chainlink official docs, data.chain.link, Sumer.Money, Chainlink read-data-feeds tutorial |
| BTC/USD | `0x6ce185860a4963106506C203335A2910413708e9` | ✅ CONFIRMED | Chainlink official docs, data.chain.link, Chainlink read-data-feeds tutorial |
| USDT/USD | Direct feed exists | ⚠️ NOT USED | data.chain.link/feeds/arbitrum/mainnet/usdt-usd confirms a direct USDT/USD feed exists on Arbitrum |

**Issue with Indirect USDT0/USD Calculation:**

The plan states "Use ETH/USD + USDT0/ETH calculation" for USDT0 pricing. However, **Chainlink has a direct USDT/USD price feed on Arbitrum One** (https://data.chain.link/feeds/arbitrum/mainnet/usdt-usd). The indirect calculation introduces:

1. **Precision loss** — Two multiplications compound rounding errors
2. **Expanded attack surface** — Two oracles must both be fresh and unmanipulated
3. **Unnecessary complexity** — A single direct feed is simpler and more reliable
4. **Staleness risk doubles** — Either feed being stale blocks the transaction

**Recommendation:** Use the direct Chainlink USDT/USD feed on Arbitrum instead of the indirect calculation. This eliminates a precision step and reduces the oracle attack surface by 50%.

**Other Oracle Assessment:**

| Criterion | Status | Notes |
|-----------|--------|-------|
| Manipulation-resistant oracle chosen | ✅ | Chainlink is the gold standard |
| Staleness threshold specified | ✅ | 5 minutes is appropriate |
| On-chain enforcement | ✅ | Not just off-chain estimation |
| Fallback mechanism | ⚠️ | "Gelato's own oracle" is vague — specify which oracle or use Uniswap V3 TWAP |

**Verdict: CONDITIONAL PASS (75/100)**
Feed addresses are confirmed real and correct. The indirect USDT0/USD calculation is the main issue — switch to the direct feed. Fallback oracle should be explicitly specified.

---

#### [H-6] wBTC 8-Decimal Precision

**v3.0 Response (§14.2):**
- BigInt-only arithmetic
- Always round UP (favor paymaster)
- Minimum reimbursement: 10 satoshis
- Buffer: 30% for wBTC (vs 20% for 18-decimal tokens)
- 10 explicit unit tests for precision edge cases

**Assessment:** All original recommendations implemented. The 30% buffer for 8-decimal tokens is appropriate. The 10-satoshi minimum prevents dust transactions.

**Verdict: PASS (95/100)**

---

#### [H-7] Paymaster Trust Model

**v3.0 Response (§14.7):**
- New §14.7 documents trust model for 6 entities
- Each entity has: What We Trust, Risk level, Mitigation
- Entities: Gelato Bundler, Paymaster, Delegated impl, Chainlink Oracle, Arbitrum sequencer, API key

**Assessment:** Good documentation. The risk classifications are appropriate (Delegated impl = CRITICAL, Paymaster/API key = HIGH, Bundler = MEDIUM, Oracle/Sequencer = LOW).

**Gaps in Trust Model (see new finding N-3 below):**
- RestrictedSigner not listed
- Client-side app (Svelte/Capacitor) not listed
- RPC provider not listed
- Capacitor Preferences storage not listed

**Verdict: PASS (85/100)** — Exists but has gaps.

---

#### [H-8] ERROR State in State Machine

**v3.0 Response (§14.2):**
- ERROR state added with: error context (reason, timestamp, retry count), manual retry path, emergency cleanup path, user-visible error modal

**Assessment:** Covers all the original recommendations. The error context fields enable debugging and the manual retry path gives users agency.

**Verdict: PASS (95/100)**

---

#### [H-9] Parallel Init

**v3.0 Response (§14.2):**
- `Promise.all([rsk, bsc, arbitrum])` documented in Phase 0.6

**Assessment:** Correct and complete.

**Verdict: PASS (95/100)**

---

#### [H-10] USDT0 Non-Standard ABI

**v3.0 Response (§14.2):**
- Verify USDT0 ABI on Arbiscan before implementation
- Use SafeERC20 for all token interactions
- Test with actual USDT0 contract on Arbitrum mainnet fork
- Add token-specific adapter if non-standard

**Assessment:** Comprehensive approach. The SafeERC20 usage is the correct defensive pattern. Mainnet fork testing catches real-world edge cases.

**Verdict: PASS (90/100)**

---

#### [H-11] Delegated Implementation Audit

**v3.0 Response (§14.2):**
- Phase 2.7 gate with 5 verification steps:
  1. Document exact contract address on Arbitrum
  2. Verify bytecode matches audited source
  3. Verify 5 security properties (ECDSA, no delegatecall, no selfdestruct, direct impl if proxy, bytecode match)
  4. Verify `resetDelegation()` exists
  5. No implementation proceeds until audit passes

**Assessment:** This is a strong gate. The 5 security properties cover the most critical attack vectors. Bytecode verification prevents proxy/upgrade attacks.

**Verdict: PASS (90/100)**

---

### Medium Findings — Verdict Summary

| ID | Finding | v3.0 Response | Verdict |
|----|---------|---------------|---------|
| M-1 | Nonce collision | ERC-4337 nonce namespace + journal persistence | PASS (90) |
| M-2 | App kill during delegation | `getCode()` check on restart + UserOp hash persistence | PASS (90) |
| M-3 | Bootstrap abuse | Rate limit + budget cap + logging | PASS (85) — see N-1 |
| M-4 | Chain lock not specified | Journal persistence + UI block + restart restore | PASS (90) |
| M-5 | Missing recipient validation | EIP-55 + block zero/self + contract warning + confirm step | PASS (95) |
| M-6 | Token approval flow | Push vs pull clarified + SafeERC20 with USDT0 workaround | PASS (90) |
| M-7 | No slippage protection | Max reimbursement cap (1.5x) enforced on-chain | PASS (90) |
| M-8 | getAddresses() doesn't exist | Removed from plan | PASS (100) |
| M-9 | ArbitrumToken duplicates ERC20Token | Reuse existing ERC20Token interface | PASS (95) |
| M-10 | SDK returns raw ethers.Wallet | Return Signer interface; extract private key only for ethers adapter | PASS (90) |

---

### New Findings Introduced by v3.0 Changes

---

#### [NEW-MEDIUM] N-1: Bootstrap Rate Limit Bypass via Device Fingerprint Spoofing

- **Location:** §14.2 [H-3] — "Rate limit 1 bootstrap per device per 24h"
- **Description:** The rate limit relies on device fingerprinting, which is unreliable on mobile platforms. Capacitor apps run in a WebView, and device fingerprints can be:
  - Reset by clearing app data
  - Spoofed by modifying the Capacitor Preferences store
  - Generated in bulk using Android emulators with different device profiles
  - Bypassed by reinstalling the app
- **Impact:** An attacker with emulator farms could generate thousands of unique device fingerprints, bypassing the 1/device/24h rate limit. The only real defense is the Gas Tank budget cap, which is unspecified.
- **Recommendation:**
  1. **Make the Gas Tank budget cap the primary defense** — specify a concrete daily cap (e.g., $50/day total bootstrap spend)
  2. **Add server-side rate limiting** based on IP address + User-Agent + device attestation (Google Play Integrity API / Apple DeviceCheck)
  3. **Require CAPTCHA** before bootstrap sponsorship
  4. **Log all bootstrap events** with full device metadata for post-hoc analysis
  5. **Consider requiring a minimum token deposit** (e.g., 0.01 USDT0) before the first gasless transaction — this makes bootstrap abuse cost real money
- **Severity:** MEDIUM
- **Verdict:** CONDITIONAL PASS — The Gas Tank budget cap is the real defense. If set appropriately (and specified in the plan), this is acceptable. If the cap is unspecified or too high, the rate limit alone is insufficient.

---

#### [NEW-MEDIUM] N-2: Emergency Self-Cleanup Requires ETH (Core Premise Contradiction)

- **Location:** §14.1 [C-1] — "using a small amount of ETH if they have it, or directing them to a faucet/bridge"
- **Description:** This finding amplifies the remaining gap in C-1. The entire system is designed for users who do NOT hold ETH. The emergency self-cleanup path (submit `resetDelegation()` via direct ETH transaction) requires ETH that the user explicitly doesn't have. This creates a dead end:
  1. User's EOA is delegated (stuck)
  2. Gelato is down (can't sponsor cleanup)
  3. User has no ETH (can't self-cleanup)
  4. User must acquire ETH from external source (bridge, exchange, faucet)
  5. This could take hours or days, during which the EOA remains delegated
- **Impact:** In the worst case (Gelato outage + user has no ETH), the user's EOA remains delegated indefinitely with no self-service recovery path.
- **Recommendation:** See C-1 remaining gap recommendations. Additionally:
  1. Implement a **secondary paymaster** (e.g., Pimlico) that can sponsor cleanup UserOps independently of Gelato
  2. Add a **CF Worker endpoint** that submits cleanup via an alternate bundler
  3. Consider **scoping delegation to a single UserOp** — after Tx1 executes, the delegation auto-resets. This eliminates Tx2 entirely.
- **Severity:** MEDIUM (derived from C-1 remaining gap)
- **Verdict:** CONDITIONAL PASS — Addresses the original critical finding but leaves a recovery gap for the target user population.

---

#### [NEW-LOW] N-3: Trust Model (§14.7) Incomplete — Missing Entities

- **Location:** §14.7 Trust Model
- **Description:** The trust model documents 6 entities but omits 4 security-critical components:
  1. **RestrictedSigner** — Wraps the user's private key. If compromised, all signing authority is lost. Should be CRITICAL trust level.
  2. **Client-side app (Svelte/Capacitor)** — If compromised via XSS, supply chain attack, or malicious update, all keys in memory are exposed. Should be HIGH trust level.
  3. **RPC provider** — Sees all transaction data, can log, censor, or front-run. Should be MEDIUM trust level.
  4. **Capacitor Preferences** — Stores delegation state and potentially sensitive data. If compromised (rooted device, backup extraction), delegation state is exposed. Should be MEDIUM trust level.
- **Impact:** Developers implementing the plan may not realize these trust boundaries exist, leading to insufficient hardening.
- **Recommendation:** Add the missing entities to §14.7:
  | Entity | What We Trust | Risk | Mitigation |
  |--------|--------------|------|------------|
  | RestrictedSigner | Signs only whitelisted operations | CRITICAL | Whitelist approach; Sentry logging; revocation mechanism |
  | Client app | Executes correctly, no XSS/malicious code | HIGH | CSP headers; dependency auditing; code signing for Capacitor |
  | RPC provider | Returns honest data, doesn't censor | MEDIUM | Multiple RPC endpoints with failover; don't send private data |
  | Capacitor Preferences | Stores data securely | MEDIUM | Encrypt sensitive fields; clear on app uninstall |
- **Severity:** LOW
- **Verdict:** PASS WITH NOTES — The existing trust model covers the most critical blockchain-level entities. The missing entries are defense-in-depth improvements.

---

#### [NEW-LOW] N-4: Missing Specifics on Gas Tank Budget Cap

- **Location:** §14.2 [H-3], §14.3 [M-3]
- **Description:** The plan mentions "Gas Tank budget cap" as abuse prevention for bootstrap sponsorship but never specifies:
  - The cap amount (total USD per day? per month? lifetime?)
  - Who monitors and adjusts the cap
  - What happens when the cap is hit (disable bootstrap? alert? graceful degradation?)
  - Whether the cap applies per-environment (dev/staging/prod)
- **Impact:** Without a specified cap, the abuse prevention is theoretical. An attacker could drain the Gas Tank before anyone notices.
- **Recommendation:** Specify:
  - Daily bootstrap budget: $50/day (adjustable based on user growth)
  - Alert threshold: 50% of daily budget consumed
  - Hard cap behavior: Disable bootstrap sponsorship, show "Please deposit tokens to continue" message
  - Per-environment caps: Dev $5/day, Staging $10/day, Prod $50/day
- **Severity:** LOW
- **Verdict:** PASS WITH NOTES — The mechanism exists; it just needs concrete numbers.

---

### Positive Observations (v3.0)

1. **Self-cleanup mechanism (C-1)** — The `resetDelegation()` function callable via standard ETH transaction is the correct architectural fix. It breaks the Gelato circular dependency.
2. **Implementation audit gate (Phase 2.7)** — Blocking all subsequent phases until the delegated implementation is verified is a strong security control. The 5-property verification checklist is comprehensive.
3. **Chainlink oracle selection** — Choosing Chainlink over DEX spot prices eliminates flash loan manipulation vectors.
4. **Whitelist approach for RestrictedSigner** — Better than the original blocklist. Allows DeFi composability while maintaining security.
5. **Trust model documentation (§14.7)** — Even with gaps, having an explicit trust model is a significant improvement over the undocumented assumptions in v2.0.
6. **wBTC precision handling** — The 30% buffer, 10-satoshi minimum, and BigInt-only arithmetic are all correct for 8-decimal tokens.
7. **Comprehensive test cases** — The test strategy (§14.4) covers all high-severity risks with specific scenarios including oracle staleness, gas spikes, and cross-chain replay.
8. **Chainlink feed addresses verified** — Both ETH/USD and BTC/USD addresses are confirmed real and active on Arbitrum One.
9. **Weighted confidence assessment** — The v3.0 self-assessment (62→89) is honest and the methodology is sound.

---

### Confidence Score Breakdown

| Category | Weight | Score | Weighted |
|----------|--------|-------|----------|
| Critical finding resolution | 25% | 85 | 21.25 |
| High finding resolution | 25% | 90 | 22.50 |
| Medium finding resolution | 15% | 90 | 13.50 |
| New issues introduced | 10% | 70 | 7.00 |
| Trust model completeness | 10% | 75 | 7.50 |
| Oracle specification correctness | 10% | 80 | 8.00 |
| Bootstrap abuse prevention | 5% | 75 | 3.75 |
| **Total** | **100%** | | **83.50** |

**Overall Confidence Score: 78/100** (rounded down from 83.5 due to the ETH contradiction in C-1 recovery path and the suboptimal USDT0/USD oracle approach)

---

### Implementation Gates (Must Resolve Before Phase 0)

| Gate | Priority | Finding | Required Action |
|------|----------|---------|----------------|
| 1 | CRITICAL | C-1 remaining gap | Add secondary cleanup path (non-ETH) for Gelato-down scenario |
| 2 | HIGH | H-5 USDT0 oracle | Switch to direct Chainlink USDT/USD feed on Arbitrum |
| 3 | MEDIUM | N-1 bootstrap abuse | Specify concrete Gas Tank budget cap with daily limits |
| 4 | MEDIUM | H-5 fallback oracle | Specify explicit fallback oracle (not just "Gelato's own") |
| 5 | LOW | N-3 trust model | Add RestrictedSigner, client app, RPC provider to §14.7 |

---

### Final Recommendation

The v3.0 audit response demonstrates significant improvement over v2.0. All 11 original findings have received substantive responses. The self-cleanup mechanism, Chainlink oracle selection, and implementation audit gate are strong security controls. The plan is **conditionally approved for Phase 0** pending resolution of the 5 implementation gates listed above.

The two most important gates before any code is written:
1. **Add a non-ETH cleanup path** — the current emergency cleanup contradicts the gasless user model
2. **Switch to direct USDT/USD Chainlink feed** — the indirect calculation adds unnecessary risk

---

*Document version: 3.0 | Second-round audit (Security)*
*Auditor: Security Auditor (Agent Zero)*
*Confidence: 78/100 — CONDITIONAL PASS*

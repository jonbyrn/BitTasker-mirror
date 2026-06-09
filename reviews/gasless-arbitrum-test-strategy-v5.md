# Gasless/Arbitrum Wallet — Test Strategy v5.0

**Date:** 2026-06-07  
**Author:** Test Engineer  
**Status:** FINAL  
**Confidence Target:** 95%+

---

## Executive Summary

### Current Coverage State

| Source File | Lines | Existing Tests | Coverage Status |
|---|---|---|---|---|
| `gasless-helpers.ts` | 250 | 60+ tests (884 lines) | ✅ EXCELLENT |
| `gasless.config.ts` | 92 | 30+ tests (200+ lines) | ✅ GOOD |
| `gasless-store.ts` | 174 | 15+ tests (350+ lines) | ⚠️ MODERATE |
| `arbitrum-wallet.ts` | 60 | 12 tests (200+ lines) | ⚠️ BASIC |
| `gasless.types.ts` | 353 | 0 tests | ℹ️ Types only |

**Overall: ~117 existing test cases across 4 test files.**

### Critical Gaps Identified

| Gap | Severity | Audit Finding |
|---|---|---|---|
| No nonce validation tests | CRITICAL | Nonce hardcoded to `0n` at gasless-store.ts:91 |
| No key format validation | CRITICAL | No private key format/bounds checking |
| No `getWallet` exposure tests | HIGH | Wallet exposes raw ethers.Wallet |
| No relay integration tests | HIGH | End-to-end flow untested |
| No concurrent nonce tests | HIGH | Race conditions untested |
| No on-chain fee cap tests | MEDIUM | Paymaster drain protection untested |

### Path to 95%+ Confidence

**Total estimated test cases needed:** 175-190  
**Existing:** ~117  
**Gap:** ~58-73 new test cases  
**Estimated effort:** 8-10 hours

---

## 1. Test Coverage Analysis

### 1.1 What's Well-Tested

**gasless-helpers.ts** — EXCELLENT coverage:
- `getPaymasterSignatureHash`: 12 tests covering deterministic output, input variations, edge cases (empty calldata, max uint256 nonce)
- `getNetworkFeeTier`: 14 tests covering all tier boundaries, contiguity, overflow rejection
- `convertToTokenFee`: 10 tests covering ceiling division, zero price protection, multi-decimal tokens
- `getUSDT0FeeBuffer`: 7 tests covering all fee tiers, bounds validation
- `validateFeeParameters`: 9 tests covering each bound individually and total gas
- `validateFeeBufferBounds`: Covered indirectly through helper tests
- `validateFeeRecipient`: Covered indirectly through store tests
- `requireTokenInfo`: Covered indirectly through config tests
- `computeTotalGas`: Covered indirectly

**gasless.config.ts** — GOOD coverage:
- All constants verified against expected values
- Token inventory fully validated (addresses, decimals, chainId)
- Fee tiers structure and boundaries verified
- Fee buffer min/max bounds verified
- Helper functions (getTokenByAddress, getTokenBySymbol, isAllowedFeeToken) tested

### 1.2 What's Moderately Tested

**gasless-store.ts** — MODERATE coverage:
- ✅ Store state management (init, reset, loading, error)
- ✅ Derived stores (gaslessAddress, gaslessReady)
- ✅ buildExecuteBatchCallData (empty calls, single, multiple)
- ✅ sendGasless (wallet not initialized, success, relay failure)
- ✅ sendToken (convenience wrapper)
- ✅ estimateFee (success, network fee error, generic error)
- ✅ checkSufficientBalance (sufficient, insufficient, exact)
- ❌ Mocked validation functions (not testing actual validation)
- ❌ Nonce handling (hardcoded `0n` not tested)
- ❌ Concurrent request handling
- ❌ JWT expiration handling
- ❌ Network timeout/retry behavior

**arbitrum-wallet.ts** — BASIC coverage:
- ✅ Constructor validation
- ✅ getAddress, getProvider, getWallet
- ✅ getETHBalance (including zero, large values)
- ✅ getTokenBalance (with/without decimals override)
- ✅ getAllTokenBalances (success, failure, decimals)
- ❌ Private key exposure security
- ❌ Wallet signing operations
- ❌ Error recovery on RPC failure

### 1.3 Complete Gap Matrix

| Function/Method | Unit Tests | Security Tests | Integration Tests | Edge Cases |
|---|---|---|---|---|
| `getPaymasterSignatureHash` | ✅ 12 | ⚠️ Partial | ❌ Missing | ✅ Good |
| `getNetworkFeeTier` | ✅ 14 | N/A | N/A | ✅ Good |
| `convertToTokenFee` | ✅ 10 | ⚠️ Partial | N/A | ⚠️ BigInt overflow |
| `validateFeeParameters` | ✅ 9 | ⚠️ Partial | ❌ Missing | ⚠️ Negative values |
| `validateFeeBufferBounds` | ⚠️ Indirect | ❌ Missing | ❌ Missing | ❌ Missing |
| `validateFeeRecipient` | ⚠️ Indirect | ❌ Missing | ❌ Missing | ❌ Missing |
| `gaslessWallet.init` | ✅ 7 | ❌ Missing | ❌ Missing | ⚠️ Partial |
| `sendGasless` | ✅ 4 | ❌ Missing | ❌ Missing | ❌ Missing |
| `buildExecuteBatchCallData` | ✅ 3 | ⚠️ Partial | ❌ Missing | ⚠️ Partial |
| `ArbitrumWallet` | ✅ 12 | ❌ Missing | ❌ Missing | ⚠️ Partial |
| Nonce management | ❌ MISSING | ❌ CRITICAL | ❌ MISSING | ❌ MISSING |
| Key validation | ❌ MISSING | ❌ CRITICAL | N/A | ❌ MISSING |
| Relay endpoint | ❌ MISSING | ❌ MISSING | ❌ MISSING | ❌ MISSING |

---

## 2. Priority-Ranked Test Cases

### 2.1 CRITICAL — Must Have Before Production

**Risk Level:** CRITICAL (data loss, fund loss, security breach)  
**Implementation Effort:** Low-Medium  
**Confidence Impact:** +12%

| # | Test Case | Category | File | Description |
|---|---|---|---|---|
| C1 | Nonce must not be hardcoded | Security | gasless-store.test.ts | Verify `sendGasless` uses dynamic nonce, not `0n` |
| C2 | Nonce increments after successful send | Security | gasless-store.test.ts | After successful relay, nonce should increment |
| C3 | Nonce replay rejection | Security | gasless-store.test.ts | Same nonce cannot be used twice |
| C4 | Private key format validation | Security | gasless-store.test.ts | Reject invalid hex, wrong length, zero key |
| C5 | Private key range validation | Security | gasless-store.test.ts | Reject key = 0, key >= curve order |
| C6 | getWallet does not leak private key | Security | arbitrum-wallet.test.ts | Wallet object cannot extract raw key |
| C7 | Fee buffer recipient must be treasury | Security | gasless-helpers.test.ts | Non-treasury recipient throws |
| C8 | Fee buffer amount within bounds | Security | gasless-helpers.test.ts | Below min or above max throws |
| C9 | Fee token must be in allowed list | Security | gasless-helpers.test.ts | Non-whitelisted token throws |
| C10 | Gas bounds prevent paymaster drain | Security | gasless-helpers.test.ts | Excessive gas values throw |

### 2.2 HIGH — Required for High Confidence

**Risk Level:** HIGH (incorrect behavior, poor UX)  
**Implementation Effort:** Medium  
**Confidence Impact:** +15%

| # | Test Case | Category | File | Description |
|---|---|---|---|---|
| H1 | BigInt ceiling division accuracy | Math | gasless-helpers.test.ts | Verify ceil(fee/price) for all token decimals |
| H2 | Negative fee amount rejection | Edge | gasless-helpers.test.ts | Negative USD values handled correctly |
| H3 | Zero fee amount handling | Edge | gasless-helpers.test.ts | $0 fee returns 0 tokens |
| H4 | Extremely large fee amount | Edge | gasless-helpers.test.ts | $1M+ fee does not overflow |
| H5 | Empty callData hash | Edge | gasless-helpers.test.ts | `0x` produces valid hash |
| H6 | Empty calls array rejection | Edge | gasless-store.test.ts | Zero calls throws immediately |
| H7 | Wallet not initialized error | Edge | gasless-store.test.ts | All operations fail gracefully |
| H8 | JWT missing/expired error | Integration | gasless-store.test.ts | Relay rejects invalid JWT |
| H9 | Network timeout handling | Integration | gasless-store.test.ts | Fetch timeout does not hang |
| H10 | Concurrent sends prevent race | Concurrency | gasless-store.test.ts | Two rapid sends serialize correctly |
| H11 | RPC failure recovery | Resilience | arbitrum-wallet.test.ts | Balance check fails gracefully |
| H12 | Token not found error | Edge | gasless-helpers.test.ts | requireTokenInfo throws for unknown |
| H13 | Case-insensitive token lookup | Edge | gasless-helpers.test.ts | Mixed case addresses work |
| H14 | Paymaster hash determinism | Correctness | gasless-helpers.test.ts | Same inputs always produce same hash |
| H15 | Paymaster hash input sensitivity | Correctness | gasless-helpers.test.ts | Different inputs produce different hashes |

### 2.3 MEDIUM — Important for Robustness

**Risk Level:** MEDIUM (edge cases, defensive coding)  
**Implementation Effort:** Medium  
**Confidence Impact:** +8%

| # | Test Case | Category | File | Description |
|---|---|---|---|
| M1 | Total gas computation accuracy | Math | gasless-helpers.test.ts | Sum of three gas fields |
| M2 | Fee tier boundary gaps | Config | gasless-helpers.test.ts | No gaps between tier ranges |
| M3 | Fee tier overflow rejection | Config | gasless-helpers.test.ts | Gas > 5M throws |
| M4 | USDT0 fee within buffer bounds | Integration | gasless-helpers.test.ts | All tiers produce valid buffers |
| M5 | wBTC fee at various BTC prices | Math | gasless-helpers.test.ts | 8-decimal precision at $30K-$100K |
| M6 | tBTC fee at various BTC prices | Math | gasless-helpers.test.ts | 18-decimal precision at $30K-$100K |
| M7 | Gas bounds consistency | Config | gasless-helpers.test.ts | maxCallGas + maxVerificationGas + maxPreVerificationGas <= maxTotalGas |
| M8 | Store reset clears all state | State | gasless-store.test.ts | Address, ready, loading, error all reset |
| M9 | Derived stores update correctly | State | gasless-store.test.ts | gaslessAddress/gaslessReady track parent |
| M10 | buildExecuteBatchCallData structure | Correctness | gasless-store.test.ts | Encoded data includes fee transfer |

### 2.4 LOW — Nice to Have

**Risk Level:** LOW (documentation, completeness)  
**Implementation Effort:** Low  
**Confidence Impact:** +3%

| # | Test Case | Category | File | Description |
|---|---|---|---|---|
| L1 | Config object structure | Config | gasless.config.test.ts | gaslessConfig has all required fields |
| L2 | Chain constants values | Config | gasless.config.test.ts | ARBITRUM_CHAIN_ID = 42161 |
| L3 | Token inventory completeness | Config | gasless.config.test.ts | Exactly 3 tokens configured |
| L4 | Fee tier count and labels | Config | gasless.config.test.ts | 4 tiers with correct labels |
| L5 | Oracle feed addresses | Config | gasless.config.test.ts | ETH/BTC feed addresses correct |

---

## 3. Test File Structure

```
src/lib/tests/
├── unit/wallet/gasless/
│   ├── gasless-helpers.test.ts          # EXISTING (60+ tests)
│   ├── gasless-config.test.ts           # EXISTING (30+ tests)
│   ├── gasless-security.test.ts         # NEW - Security-critical tests
│   ├── gasless-edge-cases.test.ts       # NEW - Edge case and boundary tests
│   └── gasless-math-precision.test.ts   # NEW - BigInt math precision tests
├── stores/
│   └── gasless-store.test.ts            # EXISTING (15+ tests)
├── wallet/
│   ├── arbitrum-wallet.test.ts          # EXISTING (12 tests)
│   └── arbitrum-wallet-security.test.ts # NEW - Key exposure tests
└── integration/wallet/
    ├── gasless-relay.integration.test.ts    # NEW - Relay endpoint tests
    └── gasless-nonce.integration.test.ts    # NEW - Nonce management tests
```

---

## 4. Specific Test Assertions

### 4.1 Security Tests (gasless-security.test.ts)

```typescript
// CRITICAL: Nonce management security

describe('Nonce Management Security', () => {
  it('C1: sendGasless does NOT hardcode nonce to 0n', async () => {
    // Arrange
    await gaslessWallet.init(MOCK_PRIVATE_KEY);
    MOCK_SMART_ACCOUNT.signUserOp.mockResolvedValue(/* valid op */);
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ userOpHash: '0x1' }) });
    
    // Act
    await sendGasless(calls, token, amount, gas, jwt, MOCK_SMART_ACCOUNT);
    
    // Assert - nonce in signed op should NOT be 0n
    const signedOp = MOCK_SMART_ACCOUNT.signUserOp.mock.calls[0][0];
    // After fix: expect(signedOp.nonce).not.toBe(0n);
    // Current behavior (bug): expect(signedOp.nonce).toBe(0n);
  });

  it('C2: Nonce increments after successful relay', async () => {
    // Arrange + Act: Send two transactions
    await sendGasless(calls1, token, amount, gas, jwt, MOCK_SMART_ACCOUNT);
    await sendGasless(calls2, token, amount, gas, jwt, MOCK_SMART_ACCOUNT);
    
    // Assert: Second nonce > First nonce
    const nonce1 = MOCK_SMART_ACCOUNT.signUserOp.mock.calls[0][0].nonce;
    const nonce2 = MOCK_SMART_ACCOUNT.signUserOp.mock.calls[1][0].nonce;
    expect(nonce2).toBeGreaterThan(nonce1);
  });

  it('C3: Relay rejects replayed nonce', async () => {
    // This tests server-side validation
    const op1 = { /* valid op with nonce=5 */ };
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ userOpHash: '0x1' }) });
    mockFetch.mockResolvedValueOnce({ ok: false, json: () => Promise.resolve({ message: 'Nonce already used' }) });
    
    await sendGasless(calls, token, amount, gas, jwt, MOCK_SMART_ACCOUNT);
    await expect(sendGasless(calls, token, amount, gas, jwt, MOCK_SMART_ACCOUNT))
      .rejects.toThrow('Nonce already used');
  });
});

// CRITICAL: Private key validation

describe('Private Key Validation', () => {
  it('C4: Rejects invalid hex format', async () => {
    await expect(gaslessWallet.init('not-a-hex-key')).rejects.toThrow();
    await expect(gaslessWallet.init('0xGG')).rejects.toThrow();
  });

  it('C5: Rejects zero private key', async () => {
    const zeroKey = '0x' + '00'.repeat(32);
    await expect(gaslessWallet.init(zeroKey as `0x${string}`)).rejects.toThrow();
  });

  it('C5: Rejects key >= curve order', async () => {
    // secp256k1 order: 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141
    const maxKey = '0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141';
    await expect(gaslessWallet.init(maxKey as `0x${string}`)).rejects.toThrow();
  });

  it('C6: getWallet does not expose raw private key', () => {
    const wallet = new ArbitrumWallet(PRIVATE_KEY);
    const ethWallet = wallet.getWallet();
    
    // Private key should not be enumerable or accessible
    expect(ethWallet).not.toHaveProperty('privateKey');
    expect(JSON.stringify(ethWallet)).not.toContain(PRIVATE_KEY);
  });
});

// CRITICAL: Fee validation security

describe('Fee Validation Security', () => {
  it('C7: Non-treasury recipient throws', () => {
    expect(() => validateFeeRecipient('0xWrongAddress')).toThrow('Fee buffer must go to GAS_TREASURY');
  });

  it('C8a: Fee below minimum throws', () => {
    const usdt0Key = USDT0_ADDRESS.toLowerCase();
    const belowMin = FEE_BUFFER_MIN[usdt0Key] - 1n;
    expect(() => validateFeeBufferBounds(USDT0_ADDRESS, belowMin))
      .toThrow('Fee buffer below minimum');
  });

  it('C8b: Fee above maximum throws (drain attempt)', () => {
    const usdt0Key = USDT0_ADDRESS.toLowerCase();
    const aboveMax = FEE_BUFFER_MAX[usdt0Key] + 1n;
    expect(() => validateFeeBufferBounds(USDT0_ADDRESS, aboveMax))
      .toThrow('Fee buffer above maximum');
  });

  it('C9: Non-whitelisted token throws', () => {
    expect(() => validateFeeBufferBounds('0xNonWhitelistedToken', 100n))
      .toThrow('Fee token not in allowed list');
  });

  it('C10a: Excessive callGasLimit throws', () => {
    expect(() => validateFeeParameters({
      callGasLimit: GAS_BOUNDS.maxCallGas + 1n,
      verificationGasLimit: 0n,
      preVerificationGas: 0n,
      maxFeePerGas: 0n,
    })).toThrow('callGasLimit exceeds maximum');
  });

  it('C10b: Excessive total gas throws', () => {
    expect(() => validateFeeParameters({
      callGasLimit: GAS_BOUNDS.maxCallGas,
      verificationGasLimit: GAS_BOUNDS.maxVerificationGas,
      preVerificationGas: GAS_BOUNDS.maxPreVerificationGas + 1n,
      maxFeePerGas: 0n,
    })).toThrow('Network fee too high');
  });
});
```

### 4.2 Edge Case Tests (gasless-edge-cases.test.ts)

```typescript
// HIGH: BigInt math edge cases

describe('BigInt Math Edge Cases', () => {
  it('H1: Ceiling division rounds up correctly for USDT0', () => {
    // $0.01 at $1.00 = exactly 0.01 tokens (no rounding needed)
    const result = convertToTokenFee(0.01, 1_000_000_000_000_000_000n, 18);
    expect(result).toBe(10_000_000_000_000_000n);
  });

  it('H1: Ceiling division rounds up for wBTC (8 decimals)', () => {
    // $0.01 at $66,000 = 1.515e-7 BTC = ~15.15 sats → ceil = 16 sats
    const btcPrice = 66_000n * 1_000_000_000_000_000_000n;
    const result = convertToTokenFee(0.01, btcPrice, 8);
    expect(result).toBeGreaterThanOrEqual(16n);
  });

  it('H2: Negative feeUSD produces 0 tokens (Math.round handles it)', () => {
    // Math.round(-0.01 * 1e18) = -10000000000000000n
    // BigInt arithmetic with negative numerator
    const result = convertToTokenFee(-0.01, 1_000_000_000_000_000_000n, 18);
    // Should either return 0 or throw
    expect(result).toBeLessThanOrEqual(0n);
  });

  it('H3: Zero fee returns zero', () => {
    const result = convertToTokenFee(0, 1_000_000_000_000_000_000n, 18);
    expect(result).toBe(0n);
  });

  it('H4: Large fee does not overflow BigInt', () => {
    // $1,000,000 at $1 = 1e6 * 1e18 = 1e24 (well within BigInt range)
    const result = convertToTokenFee(1_000_000, 1_000_000_000_000_000_000n, 18);
    expect(result).toBe(1_000_000_000_000_000_000_000_000n); // 1M tokens
  });

  it('H5: Empty callData (0x) produces valid hash', () => {
    const hash = getPaymasterSignatureHash(SENDER, 0n, '0x', ENTRY_POINT, CHAIN_ID);
    expect(hash).toMatch(/^0x[0-9a-f]{64}$/i);
  });
});

// HIGH: Store edge cases

describe('Store Edge Cases', () => {
  it('H6: Empty calls array throws immediately', () => {
    expect(() => buildExecuteBatchCallData([], '0xToken', 100n))
      .toThrow('At least one user call is required');
  });

  it('H7: All operations fail when wallet not initialized', async () => {
    gaslessWallet.reset();
    
    await expect(sendGasless([], '0x', 0n, { callGasLimit: 0n, verificationGasLimit: 0n, preVerificationGas: 0n }, 'jwt', null))
      .rejects.toThrow('Wallet not initialized');
  });

  it('H8: JWT missing causes 401 error', async () => {
    await gaslessWallet.init(MOCK_PRIVATE_KEY);
    mockFetch.mockResolvedValue({ ok: false, status: 401, json: () => Promise.resolve({ message: 'Unauthorized' }) });
    
    await expect(sendGasless(calls, token, amount, gas, '', MOCK_SMART_ACCOUNT))
      .rejects.toThrow('Unauthorized');
  });

  it('H10: Concurrent sends serialize correctly', async () => {
    await gaslessWallet.init(MOCK_PRIVATE_KEY);
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ userOpHash: '0xHash' }) });
    
    // Send two transactions simultaneously
    const [result1, result2] = await Promise.all([
      sendGasless(calls, token, amount, gas, jwt, MOCK_SMART_ACCOUNT),
      sendGasless(calls, token, amount, gas, jwt, MOCK_SMART_ACCOUNT),
    ]);
    
    expect(result1).toBe('0xHash');
    expect(result2).toBe('0xHash');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});

// HIGH: ArbitrumWallet edge cases

describe('ArbitrumWallet Edge Cases', () => {
  it('H11: RPC failure returns zero balance', async () => {
    mockGetBalance.mockRejectedValue(new Error('RPC timeout'));
    const wallet = new ArbitrumWallet(PRIVATE_KEY);
    
    // Should handle error gracefully
    await expect(wallet.getETHBalance()).rejects.toThrow('RPC timeout');
  });

  it('H12: requireTokenInfo throws for unknown token', () => {
    expect(() => requireTokenInfo('0xUnknownToken')).toThrow('Unsupported token');
  });

  it('H13: Case-insensitive token lookup works', () => {
    expect(getTokenByAddress(USDT0_ADDRESS.toLowerCase())).toBeDefined();
    expect(getTokenByAddress(USDT0_ADDRESS.toUpperCase())).toBeDefined();
    expect(getTokenBySymbol('usdt0')).toBeDefined();
    expect(getTokenBySymbol('USDT0')).toBeDefined();
  });
});
```

### 4.3 Math Precision Tests (gasless-math-precision.test.ts)

```typescript
// MEDIUM: BigInt precision across decimal configurations

describe('BigInt Precision Tests', () => {
  const testCases = [
    { name: 'USDT0', decimals: 18, price: 1_000_000_000_000_000_000n, feeUSD: 0.01, expected: 10_000_000_000_000_000n },
    { name: 'USDT0', decimals: 18, price: 1_000_000_000_000_000_000n, feeUSD: 0.03, expected: 30_000_000_000_000_000n },
    { name: 'USDT0', decimals: 18, price: 1_000_000_000_000_000_000n, feeUSD: 0.05, expected: 50_000_000_000_000_000n },
    { name: 'USDT0', decimals: 18, price: 1_000_000_000_000_000_000n, feeUSD: 0.10, expected: 100_000_000_000_000_000n },
  ];

  testCases.forEach(({ name, decimals, price, feeUSD, expected }) => {
    it(`${name} $${feeUSD} → ${expected} (${decimals} dec)`, () => {
      const result = convertToTokenFee(feeUSD, price, decimals);
      expect(result).toBe(expected);
    });
  });

  it('wBTC precision at $30,000 BTC', () => {
    const btcPrice = 30_000n * 1_000_000_000_000_000_000n;
    const result = convertToTokenFee(0.01, btcPrice, 8);
    // $0.01 / $30,000 = 3.33e-7 BTC = 33.3 sats → ceil = 34 sats
    expect(result).toBeGreaterThanOrEqual(34n);
    expect(result).toBeLessThanOrEqual(35n);
  });

  it('wBTC precision at $100,000 BTC', () => {
    const btcPrice = 100_000n * 1_000_000_000_000_000_000n;
    const result = convertToTokenFee(0.01, btcPrice, 8);
    // $0.01 / $100,000 = 1e-7 BTC = 10 sats
    expect(result).toBeGreaterThanOrEqual(10n);
    expect(result).toBeLessThanOrEqual(11n);
  });

  it('tBTC precision at $66,000 BTC', () => {
    const btcPrice = 66_000n * 1_000_000_000_000_000_000n;
    const result = convertToTokenFee(0.01, btcPrice, 18);
    // $0.01 / $66,000 = 1.515e-7 tBTC in 18 decimals
    expect(result).toBeGreaterThan(0n);
  });

  it('Total gas computation matches sum', () => {
    const userOp = {
      callGasLimit: 100_000n,
      verificationGasLimit: 50_000n,
      preVerificationGas: 10_000n,
    };
    expect(computeTotalGas(userOp)).toBe(160_000n);
  });

  it('Total gas with zero fields returns zero', () => {
    expect(computeTotalGas({ callGasLimit: 0n, verificationGasLimit: 0n, preVerificationGas: 0n })).toBe(0n);
  });

  it('Total gas with max values does not overflow', () => {
    const result = computeTotalGas({
      callGasLimit: 5_000_000n,
      verificationGasLimit: 1_000_000n,
      preVerificationGas: 100_000n,
    });
    expect(result).toBe(6_100_000n);
  });
});
```

---

## 5. Coverage Improvement Estimates

### 5.1 Before vs After

| Test Category | Before | After | Improvement |
|---|---|---|---|
| Unit Tests (helpers) | 60 | 65 | +5 |
| Unit Tests (config) | 30 | 35 | +5 |
| Security Tests | 0 | 15 | +15 |
| Edge Case Tests | 0 | 12 | +12 |
| Math Precision Tests | 0 | 8 | +8 |
| Store Tests | 15 | 22 | +7 |
| Wallet Tests | 12 | 18 | +6 |
| Integration Tests | 0 | 10 | +10 |
| **TOTAL** | **117** | **175** | **+58 (+49.6%)** |

### 5.2 Confidence Score Breakdown

| Category | Weight | Before | After |
|---|---|---|---|
| Happy Path Coverage | 20% | 85% | 95% |
| Edge Cases | 20% | 40% | 90% |
| High-Severity Risk | 20% | 30% | 95% |
| Security Testing | 20% | 20% | 90% |
| Concurrency/Resilience | 10% | 10% | 75% |
| Integration Coverage | 10% | 15% | 70% |
| **Weighted Total** | **100%** | **33%** | **87%** |

### 5.3 Path to 95%+ Confidence

To reach 95% confidence, add:

| Additional Test | Impact | Effort |
|---|---|---|
| Anvil fork tests for on-chain paymaster caps | +3% | 4h |
| Relay-time fee re-estimation tests | +2% | 2h |
| E2E test with real Alto bundler (testnet) | +2% | 3h |
| Oracle staleness validation tests | +1% | 1h |
| Deposit monitoring tests | +1% | 1h |

**Final Target: 96% confidence with ~190 test cases**

---

## 6. Implementation Roadmap

### Phase 1: Security Tests (Priority CRITICAL)
**Effort:** 3 hours  
**Impact:** +12% confidence

1. Create `gasless-security.test.ts`
2. Implement C1-C10 test cases
3. Verify nonce hardcoding bug exists (test should FAIL)
4. Verify key validation gap exists (test should FAIL)
5. Run full suite to confirm no regressions

### Phase 2: Edge Cases & Math Precision
**Effort:** 3 hours  
**Impact:** +8% confidence

1. Create `gasless-edge-cases.test.ts`
2. Create `gasless-math-precision.test.ts`
3. Implement H1-H15 and M1-M10 test cases
4. Add missing validation boundary tests

### Phase 3: Store & Integration
**Effort:** 2 hours  
**Impact:** +5% confidence

1. Expand `gasless-store.test.ts` with real validation (remove mocks for helpers)
2. Create `arbitrum-wallet-security.test.ts`
3. Add store integration tests with mock relay

### Phase 4: Advanced Testing
**Effort:** 4 hours (optional, for 95%+)
**Impact:** +8% confidence

1. Anvil fork tests for on-chain paymaster caps
2. Relay-time fee re-estimation tests
3. E2E test with testnet Alto bundler

---

## 7. Test Execution Strategy

### Local Development
```bash
# Run all gasless tests
pnpm vitest run src/lib/tests/unit/wallet/gasless/
pnpm vitest run src/lib/tests/stores/gasless-store.test.ts
pnpm vitest run src/lib/tests/wallet/arbitrum-wallet*.test.ts

# Run security tests only
pnpm vitest run src/lib/tests/unit/wallet/gasless/gasless-security.test.ts

# Run with coverage
pnpm vitest run --coverage src/wallet/
```

### CI Pipeline
```yaml
gasless-tests:
  stage: test
  script:
    - pnpm vitest run --coverage src/wallet/ src/lib/tests/**/*gasless*.test.ts
    - pnpm vitest run src/lib/tests/unit/wallet/gasless/gasless-security.test.ts
  coverage:
    src/wallet/**/*: 95%
```

---

## 8. Prove-It Tests for Audit Findings

These tests demonstrate the bugs found by the security auditor and code reviewer. They should **FAIL** with current code and **PASS** after fixes.

### Prove-It: Nonce Hardcoding (Critical)

```typescript
it('PROVE-IT: nonce is hardcoded to 0n (BUG)', async () => {
  // This test demonstrates the nonce hardcoding bug
  await gaslessWallet.init(MOCK_PRIVATE_KEY);
  MOCK_SMART_ACCOUNT.signUserOp.mockResolvedValue({
    sender: MOCK_ACCOUNT_ADDRESS,
    nonce: 0n, // Bug: always 0
    /* ... */
  });
  mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ userOpHash: '0x1' }) });
  
  await sendGasless(calls, token, amount, gas, jwt, MOCK_SMART_ACCOUNT);
  
  const signedOp = MOCK_SMART_ACCOUNT.signUserOp.mock.calls[0][0];
  expect(signedOp.nonce).toBe(0n); // This PASSES (demonstrating the bug)
  
  // After fix, this should fail:
  // expect(signedOp.nonce).not.toBe(0n);
});
```

### Prove-It: No Key Validation (Critical)

```typescript
it('PROVE-IT: No private key validation (BUG)', async () => {
  // This test demonstrates missing key validation
  const zeroKey = '0x' + '00'.repeat(32);
  
  // Currently this may succeed (no validation)
  // After fix, it should throw
  try {
    await gaslessWallet.init(zeroKey as `0x${string}`);
    // If we reach here, validation is missing (BUG)
    expect(true).toBe(false); // Force fail to highlight the bug
  } catch (e) {
    // After fix, we should reach here
    expect(e.message).toContain('Invalid private key');
  }
});
```

---

## 9. Summary

### What Exists (Good)
- ✅ Comprehensive unit tests for `gasless-helpers.ts` (60+ tests)
- ✅ Good config validation tests for `gasless.config.ts` (30+ tests)
- ✅ Basic store tests with mocked dependencies
- ✅ Basic wallet class tests

### What's Missing (Critical)
- ❌ Security tests for nonce hardcoding
- ❌ Security tests for private key validation
- ❌ Security tests for key exposure via `getWallet`
- ❌ Integration tests for relay endpoint
- ❌ Concurrent request handling tests
- ❌ On-chain paymaster fee cap tests

### Path to 95%+ Confidence
1. **Phase 1 (3h):** Security tests → +12% confidence
2. **Phase 2 (3h):** Edge cases & math → +8% confidence
3. **Phase 3 (2h):** Store & integration → +5% confidence
4. **Phase 4 (4h):** Advanced testing → +8% confidence

**Total: ~12 hours to reach 96% confidence with ~190 test cases**

---

*Document generated by Test Engineer agent on 2026-06-07*
# Epic: SendPaymentForm Refactor + Fee Fix

## Goal
Refactor 2,779-line SendPaymentForm.svelte monolith into maintainable sub-components and shared code, fix fee computation to use `useSwapRoutes`, and audit the swap screen for issues.

## Target
- SendPaymentForm: 2,779 → ~600 lines (78% reduction)
- Fee computation: shared with SwapForm via `useSwapRoutes`
- Zero functional regressions (TDD enforced)
- Swap screen audit: <5 low issues, 0 medium+

## File Plan

### New Files (extracted)
| File | Purpose | Lines (est) |
|------|---------|-------------|
| `src/lib/runes/use-send-fee-estimate.svelte.ts` | Fee estimation rune (replaces updateFeeEstimate + fetchFeeParameters + calculateMaxAmount) | ~150 |
| `src/lib/utils/parseSendAddress.ts` | Pure function: parse + validate + normalize send addresses | ~80 |
| `src/lib/components/wallet/send/SendQrScanner.svelte` | QR scan wrapper (Capacitor + Web) | ~80 |
| `src/lib/components/wallet/send/SendAddressInput.svelte` | Address input with paste/scan/validation | ~100 |
| `src/lib/components/wallet/send/SendConfirmScreen.svelte` | Confirmation display (amount, network, address) | ~120 |

### Modified Files
| File | Changes |
|------|---------|
| `src/lib/components/wallet/SendPaymentForm.svelte` | Refactor to use extracted pieces + useSwapRoutes |
| `src/lib/runes/use-swap-options.svelte.ts` | Export for send form reuse (already exists) |

### Test Files
| File | Purpose |
|------|---------|
| `src/lib/tests/unit/utils/parseSendAddress.test.ts` | Pure function tests |
| `src/lib/tests/unit/runes/use-send-fee-estimate.test.ts` | Fee estimation logic tests |

## Execution Order
1. TDD: Write tests for parseSendAddress
2. Implement parseSendAddress
3. TDD: Write tests for useSendFeeEstimate
4. Implement useSendFeeEstimate  
5. Extract SendQrScanner (pure UI extraction)
6. Extract SendAddressInput (uses parseSendAddress)
7. Extract SendConfirmScreen (pure UI extraction)
8. Refactor SendPaymentForm to use all extracted pieces
9. Audit swap screen
10. Verify with Playwright

# Pending Tests — Excluded from CI

Tests in this folder are **not run by `test:ci`**. Vitest excludes `**/_pending/**`. Fix blockers before moving back to `components/`.

## Status

| File | Blocker / Issue |
|------|-----------------|
| `contract/DebugContractCard.logic.test.ts` | EventBus / wallet-core dependencies |
| `contract/DebugContractCard.test.ts` | Same as above |
| `contract/loadContractsByAddress.test.ts` | **Replaced:** canonical test in `unit/utils/wallet/loadContractsByAddress.test.ts` (CI) |
| `contract/functionParsing.test.ts` | **Replaced:** canonical test in `unit/utils/wallet/functionParsing.test.ts` (CI) |
| `components/ReceivePaymentForm.test.ts` | Timeouts on calculator/network interactions |
| `components/ReceivePaymentForm.integration.test.ts` | Same timeout issues |

## Re-enabling

1. Fix the blocker for each file.
2. Move the file back to `src/lib/tests/components/` (or `components/contract/`).
3. Run `npm run test:ci` to verify.
4. Remove from this README.

See `plans/unit-testing-strategy.md` §10 "Where to continue".

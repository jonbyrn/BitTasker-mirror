# Pending Tests — To Be Migrated

Tests in this folder are **not run in CI** and require migration before they can be re-enabled.

## Status

| File | Blocker / Issue | Notes |
|------|-----------------|-------|
| `contract/DebugContractCard.logic.test.ts` | `@bittasker/wallet-core` EventBus module not found | Add EventBus mock in test setup or update wallet-core |
| `contract/DebugContractCard.test.ts` | Same EventBus dependency | Same fix as above |
| `contract/loadContractsByAddress.test.ts` | Same EventBus dependency | Same fix as above |
| `contract/functionParsing.test.ts` | Wrong import path `../functionParsing` | Should import from `$lib/utils/wallet/functionParsing` |

## How to migrate

1. Fix the blocker (EventBus mock, import path, etc.).
2. Move the test file back to `src/lib/tests/components/contract/` (or appropriate location).
3. Remove it from this README.
4. Run `npm run test:ci` to verify.

See `plans/unit-testing-strategy.md` for the overall testing strategy and §6 for component test quality guidelines.

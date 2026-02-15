# Unit Testing Strategy — Summary

**Status:** Phase 1 & 2 complete; Phase 3 (add tests) next  
**Last updated:** 2025-02-15  
**Full history:** See git log; Chunks 1–24 documented in previous versions.

---

## Current State

| Item | Value |
|------|-------|
| **Runner** | Vitest (v3), jsdom, `vitest-setup-client.ts` |
| **CI** | `test:ci` → `unit/` + `integration/routes/` + `components/` (excludes `_pending/`) |
| **Result** | ~670 tests, 43 files, all pass |
| **Coverage** | `npm run test:ci -- --coverage` → `coverage/index.html` |

### Layout

- **unit/** — helpers, utils, api, stores, routes (pure logic, minimal mocks)
- **components/** — Svelte component tests (contractDetection, escrow, wallet, bidding, etc.)
- **integration/** — escrow lifecycle, routes (tasks-page)
- **_pending/** — 6 files excluded: DebugContractCard*, loadContractsByAddress, functionParsing, ReceivePaymentForm* (EventBus / timeout blockers)

### Commands

```text
test:ci              → validated set, green
test:ci -- --coverage → coverage report
test:triage          → grouped pass/fail report
test:unit:<group>    → validators, formatters, crypto, auth, api, utils, stores, components
```

---

## Principles

1. **Audit first** — Source exists? Used in app? Classify: keep, update, remove.
2. **Only test used code** — Do not add tests for modules that are not imported by routes, components, or other used lib modules. Verify with: `grep -r "from '\$lib/.*<name>" src/routes src/lib/components src/lib/utils src/lib/stores src/lib/api` — skip if not found.
3. **Incremental delivery** — Fix broken tests before adding new ones.
4. **Component quality** — Assert behavior, use semantic queries, test user flows (see coverage plan §4.2).

---

## Pending Work

| Target | Blocker |
|--------|---------|
| ReceivePaymentForm | Timeouts; fix mocks / waitFor |
| Contract tests (4) | EventBus (wallet-core mock added); loadContractsByAddress needs getWallet in wallet.store mock |
| nip44 "encrypt" | Skipped (flaky); investigate timeout |

---

## References

- **Coverage expansion:** `plans/coverage-expansion-plan.md`
- **Pending tests:** `src/lib/tests/_pending/README.md`
- **Triage:** `scripts/test-triage.js`

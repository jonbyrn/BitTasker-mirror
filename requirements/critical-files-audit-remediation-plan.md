# Critical Files Audit and Remediation Plan

Date: March 3, 2026
Scope: Critical runtime files previously identified, plus Storybook critical-story files as low-priority non-production checks.
Constraint: Audit and planning only. No app code changes in this step.

## Prioritization Method

- Primary sort: Severity (`Critical` > `High` > `Medium` > `Low`)
- Secondary sort: Ease of fix (`Easy` > `Medium` > `Hard` within same severity)
- Tertiary tie-breaker: User impact and likelihood of recurrence

## Global Execution Order (Recommended)

1. Escrow lifecycle correctness and duplicate-submission prevention
2. Task discovery race-condition fixes (`/tasks` page)
3. Contract store pagination/subscription safety
4. Map/autocomplete stale-response and teardown safety
5. Wallet transaction/pending UX robustness
6. Input/filter correctness and notification de-duplication
7. Storybook control fidelity cleanup

---

## 1) `src/lib/utils/escrow/v1/escrow.ts`

### Critical

1. **On-chain tx succeeds, off-chain publish failure surfaces as action failure**

- Severity: `Critical`
- Ease: `Medium`
- Evidence: lines 500, 513, 597, 681, 755, 837, 916, 995
- Risk: User sees failure after tx broadcast, retries, and may submit duplicates.
- Solution:
  - After tx hash exists, treat off-chain publish as best-effort.
  - Wrap Nostr publish in local `try/catch`; log + telemetry only.
  - Return transaction success/pending response regardless of publish failure.
  - Add idempotency guard keyed by tx hash for UI actions.

### High

2. **5-minute timeout marks tx failed while it can still confirm later**

- Severity: `High`
- Ease: `Medium`
- Evidence: lines 381, 460, 465
- Risk: Incorrect terminal state, duplicate retries, user trust loss.
- Solution:
  - Replace timeout terminal status from `failed` to `unknown/pending_confirmation`.
  - Start background reconciliation job to poll receipt until final state.
  - Reconcile on next app/session load to heal stale states.

3. **Global cached contract instances may retain stale signer/provider**

- Severity: `High`
- Ease: `Hard`
- Evidence: lines 18, 89, 113
- Risk: Transactions signed/sent with invalid runner context after wallet/chain changes.
- Solution:
  - Re-key cache by `(contractAddress, walletAddress, chainId)`.
  - Invalidate cache on wallet, account, or network changes.
  - Add runtime assertion that contract runner matches active context before call.

### Medium

4. **Unknown chain status silently coerced to `Funded`**

- Severity: `Medium`
- Ease: `Easy`
- Evidence: lines 225, 242
- Risk: Masks contract version drift and status mapping bugs.
- Solution:
  - Introduce explicit `Unknown` status (or hard error path).
  - Emit telemetry with raw status value and contract metadata.
  - Gate downstream state transitions from `Unknown` until reconciled.

### Testing Plan

- Unit: off-chain publish failure after tx broadcast returns pending/success.
- Unit: timeout state transitions to `pending_confirmation`, not `failed`.
- Integration: wallet/chain switch invalidates cache and rebinds runner.
- Unit: unmapped status produces `Unknown` + telemetry event.

---

## 2) `src/lib/utils/escrow/v1/nostrContract.ts`

### High

1. **Stale index captured before async work can update wrong contract**

- Severity: `High`
- Ease: `Medium`
- Evidence: lines 617, 637, 667, 677
- Risk: Data corruption in store when events reorder during async processing.
- Solution:
  - Resolve contract index inside atomic `contractStore.update`.
  - Re-lookup by escrowId immediately before mutation.
  - Abort write if escrowId mismatch or no current record.

2. **Catch-all error path marks infra failures as pending funding**

- Severity: `High`
- Ease: `Easy`
- Evidence: lines 819, 855, 859
- Risk: Misclassified failures, hidden provider/contract errors, delayed triage.
- Solution:
  - Differentiate `not_found` from provider/network/runtime failures.
  - Only map to pending-funding on verified not-found + tx hash.
  - Surface and log non-not-found failures with actionable metadata.

### Medium

3. **Non-null assertion hides nullable escrow data contract**

- Severity: `Medium`
- Ease: `Easy`
- Evidence: lines 814, 881
- Risk: Runtime null dereference and false confidence in type safety.
- Solution:
  - Model nullable escrow data in types.
  - Add explicit handling path for pending/unresolved escrow data.

### Testing Plan

- Unit: out-of-order status events do not mutate wrong escrow record.
- Unit: provider failure path does not map to pending-funding.
- Type tests/compile checks: nullable escrow paths enforced.

---

## 3) `src/lib/stores/contract.store.ts`

### High

1. **Partial subscription failure can leak duplicate incoming subscriptions**

- Severity: `High`
- Ease: `Medium`
- Evidence: lines 68, 86, 97
- Risk: Duplicate events, memory leaks, repeated processing.
- Solution:
  - Make subscription setup atomic; rollback first subscription if second fails.
  - Store subscription lifecycle state (`subscribing/succeeded/failed`).

2. **Pagination boundary may not advance on duplicate-only pages**

- Severity: `High`
- Ease: `Medium`
- Evidence: lines 281, 301, 307
- Risk: Repeated same-window fetches (practical infinite load-more loop).
- Solution:
  - Advance boundary with `oldestFetched.created_at - 1`.
  - Add no-progress detection counter to force `hasMore=false` after repeated non-advancing pages.

### Medium

3. **Dedup uses pre-await stale snapshot of `contractsMap`**

- Severity: `Medium`
- Ease: `Medium`
- Evidence: lines 260, 292
- Risk: Duplicates under concurrent updates.
- Solution:
  - Re-check dedup against current state inside final store update before append.

4. **`isSubscribed` can be set true despite internal subscribe failure**

- Severity: `Medium`
- Ease: `Easy`
- Evidence: lines 234, 235, 238
- Risk: False health signal, skipped retries.
- Solution:
  - Return explicit success booleans from subscribe helpers.
  - Set `isSubscribed` only when both subscriptions are active.

### Testing Plan

- Unit: second-subscription failure rolls back first.
- Unit: duplicate-only pagination advances boundary and terminates correctly.
- Unit: concurrent updates do not duplicate records.
- Unit: subscription state reflects actual active subscriptions.

---

## 4) `src/routes/tasks/+page.svelte`

### High

1. **Timeout state machine for initial fetch is effectively dead**

- Severity: `High`
- Ease: `Easy`
- Evidence: lines 705, 708 (no corresponding loading assignment)
- Risk: Hung fetch never transitions to timeout UI.
- Solution:
  - Centralize initial load in one helper that always sets `loadingState='loading'` pre-fetch and terminal state post-fetch.

2. **Direct mutation of `$tasksStore.searchParamsKey` bypasses store update path**

- Severity: `High`
- Ease: `Easy`
- Evidence: lines 497, 526
- Risk: Stale subscribers and inconsistent UI updates.
- Solution:
  - Use store `update` with immutable return for every search-param mutation.

3. **No request sequencing/cancellation across overlapping fetch paths**

- Severity: `High`
- Ease: `Medium`
- Evidence: lines 560, 583, 612, 634, 674
- Risk: Older responses overwrite newer query/filter results.
- Solution:
  - Add request version token and ignore stale completions.
  - If supported, abort obsolete in-flight requests.

### Medium

4. **Map preload attempt flag can permanently suppress retry after failure**

- Severity: `Medium`
- Ease: `Easy`
- Evidence: lines 393, 434
- Risk: Map stays unavailable until full page reload.
- Solution:
  - Mark preload attempted only after success, or reset attempted flag in failure path.

5. **Close-animation delayed clear can race with reopening details panel**

- Severity: `Medium`
- Ease: `Easy`
- Evidence: lines 1401-1404, 1491-1494
- Risk: Newly opened details cleared by old timeout.
- Solution:
  - Attach close token/taskId to timeout and verify before clearing.

6. **Global CSS hides Google attribution/internal UI elements**

- Severity: `Medium`
- Ease: `Easy`
- Evidence: lines 1510-1513
- Risk: Compliance/supportability issues and broken map controls.
- Solution:
  - Remove forced hiding; solve overlap/layout at container level.

### Testing Plan

- Component/integration: loading timeout transitions correctly on hung fetch.
- Unit: overlapping requests keep latest-response wins invariant.
- Component: reopen detail panel is not cleared by stale timeout.
- Visual/integration: map loads/retries after initial preload failure.

---

## 5) `src/lib/components/maps/LocationPickerMap.svelte`

### High

1. **Reverse-geocode responses can apply out of order**

- Severity: `High`
- Ease: `Medium`
- Evidence: lines 251-258, 301-313, 316-336
- Risk: Marker/location text mismatch and stale selected coordinates.
- Solution:
  - Add monotonic request ID and commit results only for latest request.

### Medium

2. **Truthy coordinate checks reject valid `0` lat/lng**

- Severity: `Medium`
- Ease: `Easy`
- Evidence: lines 256, 405
- Risk: Equator/prime-meridian locations fail.
- Solution:
  - Replace truthy checks with explicit `!= null` + `Number.isFinite`.

3. **Fatal init errors may leave blank map without explicit error state**

- Severity: `Medium`
- Ease: `Easy`
- Evidence: lines 435-442
- Risk: Silent failure UX.
- Solution:
  - Set `hasError/error` consistently on fatal init failures.

4. **Timer/interval cleanup gaps can trigger post-unmount writes**

- Severity: `Medium`
- Ease: `Medium`
- Evidence: lines 60-83, 119-133, 354-361, 421-423
- Risk: leaks and state updates after destroy.
- Solution:
  - Track all timers/intervals, clear in destroy lifecycle, guard writes when unmounted.

### Testing Plan

- Unit/integration: stale geocode response cannot overwrite newest selection.
- Unit: lat/lng `0` accepted.
- Component: init error surfaces explicit error state.
- Component: no timer-driven state writes after unmount.

---

## 6) `src/lib/components/LocationAutoComplete.svelte`

### High

1. **Debounce function recreated inline, reducing debounce guarantees**

- Severity: `High`
- Ease: `Easy`
- Evidence: line 129 with debounce factory at 65-71
- Risk: orphan timers and excessive API calls under rapid input.
- Solution:
  - Create one stable debounced handler and cancel on destroy.

2. **Out-of-order prediction responses can replace newer suggestions**

- Severity: `High`
- Ease: `Medium`
- Evidence: lines 35-54
- Risk: stale suggestions and incorrect user selection context.
- Solution:
  - Use query token/version; apply results only for latest active query.

### Medium

3. **Empty input early-return may leave stale options visible**

- Severity: `Medium`
- Ease: `Easy`
- Evidence: line 37
- Risk: incorrect dropdown state after clearing input.
- Solution:
  - Explicitly clear predictions/hide options/reset transient error on empty input.

4. **Falsy check rejects valid `0` coordinate values**

- Severity: `Medium`
- Ease: `Easy`
- Evidence: line 82
- Risk: valid locations excluded.
- Solution:
  - Use null/undefined checks + finite-number validation.

### Low

5. **Static input id reused across component instances**

- Severity: `Low`
- Ease: `Easy`
- Evidence: lines 117, 124, 139, 160
- Risk: duplicate DOM IDs and ambiguous a11y label targeting.
- Solution:
  - Generate per-instance unique ID.

6. **Error state can persist after successful recovery**

- Severity: `Low`
- Ease: `Easy`
- Evidence: error set at 57 and not reset on success
- Risk: stale error UI.
- Solution:
  - Reset error flag at request start and success completion.

### Testing Plan

- Unit: debounce calls bounded under rapid keystrokes.
- Unit: latest request wins under out-of-order responses.
- Component: clearing input hides stale predictions.
- Component: multiple instances have unique IDs.

---

## 7) `src/lib/components/wallet/TransactionHistory.svelte`

### High

1. **Initialization poll loop uses stale state snapshot**

- Severity: `High`
- Ease: `Easy`
- Evidence: lines 158, 166, 168
- Risk: unnecessary looping until timeout after initialization already completed/failed.
- Solution:
  - Re-read store state each iteration or wait on subscription to terminal state with timeout.

### Low

2. **Async action handlers not guarded with catch**

- Severity: `Low`
- Ease: `Easy`
- Evidence: lines 581, 586
- Risk: unhandled promise rejection and silent action failures.
- Solution:
  - Wrap handlers with `Promise.resolve(...).catch(...)` and show user-facing error.

### Testing Plan

- Unit/component: poll exits immediately after store transitions from initializing.
- Component: rejected action handler is caught and reported.

---

## 8) `src/lib/components/wallet/PendingSwap.svelte`

### Medium

1. **`#await generateQrCodeUrl(...)` in template can regenerate per render**

- Severity: `Medium`
- Ease: `Easy`
- Evidence: line 264
- Risk: async churn, flicker, extra CPU.
- Solution:
  - Memoize QR promise/value by data input and bind template to memoized result.

2. **Copy handlers can reject without visible recovery path**

- Severity: `Medium`
- Ease: `Easy`
- Evidence: line 167
- Risk: silent UX failures on clipboard errors.
- Solution:
  - Wrap copy flow in `try/catch`, surface toast/error, and throttle rapid retries.

### Testing Plan

- Component: QR generation called once per unique payload.
- Component: clipboard rejection shows non-crashing user feedback.

---

## 9) `src/lib/components/TagsInput.svelte`

### High

1. **Duplicate tags can be inserted in autocomplete mode**

- Severity: `High`
- Ease: `Medium`
- Evidence: lines 55, 59-67
- Risk: inconsistent tag payloads and downstream filtering bugs.
- Solution:
  - Normalize candidate option before dedupe check and compare normalized canonical values.

2. **Paste flow can insert wrong repeated option due to fallback behavior**

- Severity: `High`
- Ease: `Medium`
- Evidence: lines 104-114 with fallback at line 60
- Risk: data corruption in multi-tag paste.
- Solution:
  - For paste path, require exact/allowed matches; no fallback-to-first-option for unmatched tokens.

### Medium

3. **Default translated placeholder can become stale after locale change**

- Severity: `Medium`
- Ease: `Easy`
- Evidence: line 8
- Risk: localization mismatch in long-lived sessions.
- Solution:
  - Compute default placeholder reactively when explicit prop not provided.

### Testing Plan

- Unit: duplicate prevention works across case/whitespace variants.
- Unit: paste tokens map correctly; unmatched tokens are skipped/reported.
- Component: placeholder updates when locale changes.

---

## 10) `src/lib/components/filters/LocationFilter.svelte`

### High

1. **Out-of-order async results can overwrite latest query state**

- Severity: `High`
- Ease: `Medium`
- Evidence: lines 68-70
- Risk: stale suggestions, wrong selected location.
- Solution:
  - Add query token / abort stale requests.

2. **`onLocationChange` fired from both handlers and reactive effect**

- Severity: `High`
- Ease: `Easy`
- Evidence: lines 44-49 plus 92, 112, 121, 131
- Risk: duplicated parent fetches and render churn.
- Solution:
  - Choose single notification mechanism and remove duplicates.

### Medium

3. **Debounce timer not cleaned up on destroy**

- Severity: `Medium`
- Ease: `Easy`
- Evidence: line 65 with no destroy cleanup
- Risk: post-unmount timer callbacks.
- Solution:
  - Clear timeout in destroy lifecycle.

### Low

4. **`locationError` not cleared on `clearLocation`**

- Severity: `Low`
- Ease: `Easy`
- Evidence: error set at 95, no reset at 125-132
- Risk: stale error message after reset.
- Solution:
  - Clear error on location clear and before new search.

### Testing Plan

- Unit: stale async responses are ignored.
- Component: single parent callback per location change action.
- Component: no timer callback after unmount.
- Component: clearing location clears error state.

---

## 11) Storybook Critical-Story Files (Non-Production)

### `src/stories/Drawer.stories.svelte`

- Severity: `Low`
- Ease: `Easy`
- Evidence: lines 58-64, 103-109
- Issue: hardcoded props bypass args/controls fidelity.
- Solution: map story args to component props in all custom render stories.

### `src/stories/Modal.stories.svelte`

- Severity: `Low`
- Ease: `Easy`
- Evidence: lines 32, 46, 64, 89
- Issue: hardcoded modal variants bypass args-driven behavior.
- Solution: use args-driven render wrappers.

### `src/stories/Button.svelte`, `src/stories/Header.svelte`, `src/stories/Page.svelte`

- No critical runtime bugs identified in this audit scope.

---

## Implementation Phases (No Changes Applied Yet)

### Phase A (Immediate Risk Reduction)

- `escrow.ts`: tx-broadcast success semantics, timeout-state correction.
- `tasks/+page.svelte`: loading state machine, request sequencing, store-safe updates.
- `contract.store.ts`: subscription atomicity and pagination progress guarantees.

### Phase B (Race + State Consistency)

- `nostrContract.ts`: stale-index mutation guard and error classification.
- `LocationPickerMap.svelte` + `LocationAutoComplete.svelte`: stale response protection, coordinate validation, cleanup.
- `LocationFilter.svelte`: single notification path and async ordering.

### Phase C (UX Hardening)

- `TransactionHistory.svelte`, `PendingSwap.svelte`, `TagsInput.svelte`: async error handling, memoization, localization/reactive correctness.

### Phase D (Tooling / Non-Prod)

- Storybook args-control fidelity updates.

## Exit Criteria

- No reproducible stale-response overwrites in tasks/map/filter/autocomplete flows.
- No duplicate-submission path after tx broadcast success.
- No load-more boundary loops in contract pagination.
- No unhandled promise rejections in audited wallet UI actions.
- Added tests for all High/Critical issues and selected Medium issues with race potential.

# ADR 0001: Greenfield Native RGB WASM Subsystem

## Status

Accepted

## Context

BitTasker is evaluating a transition to a native, client-side validated RGB
protocol stack (Taproot + Lightning + Nostr) via `@utexo/rgb-sdk-web`. Two
implementation paths were considered:

- **Option A** — refactor the existing mock/demo escrow code
  (`src/lib/utils/contract/v2/rgb-escrow.ts`,
  `src/lib/services/rgb-wallet-service.ts`) in place into real RGB logic.
- **Option B** — build the RGB stack as an isolated greenfield subsystem under
  `src/lib/services/rgb/`, and delete the legacy mocks outright.

RGB is a fundamentally different trust model from BitTasker's existing
sidechain/escrow logic: validation is client-side and deterministic, and there
is no chain to fall back on. If stash validation logic is wrong, invalid state
is accepted with no safety net. This makes the RGB module's correctness
provable only if it is isolated from code written under the old
chain-is-truth assumptions.

The existing mock code reinforces this concern directly:

- `rgb-escrow.ts` fabricates a `commitmentHash` string and never calls the
  WASM SDK.
- `rgb-wallet-service.ts` polls `mempool.space` directly for UTXOs, bypassing
  the already-initialized, client-validated `@utexo/rgb-sdk-web` wallet
  instance (`state.utexoWallet` in `wallet-init.ts`) — a second, unvalidated
  source of UTXO truth.
- `creation.ts` calls the mock with `any`-typed params and hardcoded demo
  pubkeys.

Mocks fail open by design (return a placeholder so the UI stays interactive).
Consensus-critical RGB validation must fail closed. Refactoring fail-open code
into fail-closed code is riskier than writing fail-closed code from scratch,
because the fail-open default is exactly the thing that gets forgotten.

## Decision

**Option B — Greenfield Subsystem.** Native RGB code lives exclusively in
`src/lib/services/rgb/`. No file in this module imports from the legacy mock
stubs. The legacy mocks are deleted, not reconciled, once the new module
covers their functionality:

- `src/lib/services/rgb-wallet-service.ts` — deleted. It is a second,
  unvalidated UTXO source and directly contradicts the "balances are derived
  from validated client consignments" premise.
- `src/lib/utils/contract/v2/rgb-escrow.ts` — deleted. Its mock
  `commitmentHash`/`blindedUtxo` generation is replaced by real single-use
  seal creation inside `src/lib/services/rgb/`.
- `src/lib/utils/service-contract/creation.ts` — updated to call the new
  module's command queue instead of `createRgbEscrow()`; the `any`-typed
  params and hardcoded demo pubkeys are removed as part of this change, not
  carried over.

### Single-writer WASM command queue

`@utexo/rgb-sdk-web` is a single-threaded, non-reentrant WASM engine. The
canonical local stash is owned by exactly one writer: an async command queue
inside `src/lib/services/rgb/`.

- State transitions are modeled as commands (`commit`, `witness`, `spend`,
  `validateConsignment`), not direct setters. Each command is serialized
  behind the previous one so two transitions can never interleave.
- This extends the existing promise-memoization pattern already used for
  concurrent-call safety in `ensureNdkReady()`
  (`src/lib/utils/swapAdapter.ts`), generalized from "one cached init" to "an
  ordered queue of transition commands."
- A rejected/errored command fails that command only — it must not poison the
  queue or leave the stash in a torn state. Every transition either commits
  fully or is rolled back atomically.

### Fail-closed validation default

Unlike the legacy mocks, all RGB validation logic defaults to rejecting
unknown or unvalidated state. There is no "return a placeholder to keep the
UI responsive" fallback anywhere in the trust boundary.

### Spend durability ordering

A single-use seal's transition to `SPENT` is recorded in durable local
storage **before** any UI notification or Nostr relay event is broadcast.
This closes the double-spend window where the UI or a relay could observe
`SPENT` before the module has durably recorded it.

### Read-only Svelte 5 UI projections

SvelteKit components never mutate RGB state directly:

- The RGB module emits immutable, versioned snapshots.
- `WalletStateExtended` and other UI-facing stores consume RGB balances and
  seal statuses via `$derived`/`$derived.by` projections from
  `src/lib/services/rgb/types.ts`, per this repo's existing rune rules
  (`.ai-rules/svelte-runes.md`) that already forbid deriving one value from
  another inside `$effect`.
- The global wallet store treats the RGB projection like an external oracle:
  it reads and displays, it never writes back.
- Where RGB and legacy sidechain balances must appear together in one UI,
  they are combined in a dedicated read-only selector that reads from both
  sources — the two stores never share a mutable object.

## Consequences

- Higher upfront cost: the state machine, stash validation, and seal logic
  are written from zero rather than adapted from existing code. This cost is
  bounded and visible (an integration/effort risk), versus Option A's
  unbounded, silent correctness/security risk.
- `rgb-wallet-service.ts` and `rgb-escrow.ts` are removed once the greenfield
  module reaches parity; no code in the new module depends on them at any
  point, so this is a clean deletion rather than a migration.
- Bundling/WASM interop work (`vite.config.ts` `optimizeDeps` handling for
  `@utexo/rgb-sdk-web` and its transitive deps) is required regardless of
  Option A or B, and is tracked separately from this decision.
- Test coverage for the command queue's state transitions and seal validation
  logic must reach the same bar as other consensus/fund-critical code in this
  repo (90%+ branch coverage) before this module is wired into any live
  wallet flow.

## References

- `src/lib/services/rgb/types.ts` — interface boundary for the command queue
  and read-only projections defined by this ADR.
- `src/lib/utils/swapAdapter.ts` — existing serialized-async-call precedent
  (`ensureNdkReady`).
- `docs/wallet-bugs.md` (BUG-W002) — prior incident of two disagreeing config
  sources in `@bittasker/wallet-core`, the failure mode this ADR's
  single-writer rule is designed to prevent from recurring in RGB state.

## Open Questions & Verification Gaps

> **Status:** Design + static verification complete. Runtime integration against the live SDK has **not** been performed. This subsystem is type-clean, unit-clean (against mocks), and structurally bound to the SDK's type surface — it is **not** "verified working." Do not read the architecture diagram above as a completion record; the items below are open.

### Verification gaps (must close before treating seal operations as functional)

1. **Real-SDK integration smoke test — TOP GATE.** `WasmRgbSealBackend` now instantiates on every wallet init (`wallet-init.ts`), but it has never executed a single `commit`/`witness`/`spend` against a live `@utexo/rgb-sdk-web`. Every passing test runs against the mocked backend. As it stands, the first real seal transition will happen in front of a real user, on real value. **Action:** construct `WasmRgbSealBackend` with a real `utexoWallet`, run one seal transition against a regtest/testnet asset, and assert the live `TransferStatus` strings match `toRgbSealState()`. This is the gate between "designed" and "works."
2. **`TransferStatus → RgbSealState` mapper validated against model, not reality.** The mapper is aligned with an *inspection* of the SDK's compiled surface — the same kind of inspection that earlier in this project first concluded the SDK had no seal API at all, before that was reversed. Until item 1 runs, the state vocabulary is a hypothesis. **Action:** capture the actual status strings emitted during item 1 and reconcile.
3. **Repo-wide typecheck status recorded post-restore.** "37 contract files restored to resolve pre-existing regressions" asserts the regressions are gone; the evidence for that is a green repo-wide `npm run check`. Confirmed count as of this restoration: **77 errors and 2 warnings across 21 non-RGB files** (UI components, external wallet connectors, `wallet-balances.ts`) — down from the pre-restoration baseline of 238 errors across 43 files. There are **zero errors** within `src/lib/services/rgb/`. "Zero errors in `rgb/`" is not the same claim as "repo is clean" — the remaining 21 files are a separate, tracked cleanup item.

### Open design decisions (unresolved, currently canonized by omission)

4. **`WaitingSafeHeight` folded into `WAITING_CONFIRMATIONS`.** The state diagram erases the distinction between "confirmations seen" and "reorg-depth safe." For a Bitcoin-native value transfer, "is this settled deeply enough to act on" may be a decision the app needs to make. **Action:** confirm what the SDK means by `WaitingSafeHeight`; if it is reorg-safety, it needs its own state or a flag on the seal, not silent folding.
5. **`@utexo/rgb-sdk-core` newly present in the dependency graph.** This package appears in the architecture doc but not in any prior implementation report. A second SDK package is a new surface. **Action:** confirm it is the intended dependency and that its emitted status vocabulary matches the mapper.

### Enforcement / hardening (design says one thing, code allows another)

6. **Single-writer is enforced by convention, not mechanically.** The diagram draws one write arrow, but `setRgbProjection` is exported from the public barrel — anything that imports it can write the projection. **Action:** move the mutable `$state` and its setter into an internal module imported *only* by the command queue, and back it with an ESLint import-boundary rule (nothing outside `rgb/` may import the setter module, and nothing inside `rgb/` may import legacy mock/wallet-mock paths). Convention plus a comment will not survive the next contributor.
7. **Init error containment must log, not swallow.** The non-critical try/catch around RGB queue init in `wallet-init.ts` correctly prevents RGB failure from blocking `btc_onchain` balances — but if it swallows silently, a failed init leaves the app fail-closed (`UnimplementedRgbSealBackend`) with no breadcrumb explaining why. Fail-closed, yes; fail-silent, no. **Action:** log on catch and set an observable "RGB unavailable" flag on the projection.
8. **Durability ordering for the terminal state.** The seal must be recorded as `SETTLED` in durable storage **before** `setRgbProjection()` reflects it and before anything mirrors it to Nostr. Order: durable write → projection → external observer, never the reverse. A crash between an optimistic projection and the durable write lets the same seal appear actionable twice. Not currently expressed anywhere in the design.

### Branch hygiene (blocks merge)

9. **Three change-sets tangled on one phase-0 branch:** (a) the RGB subsystem, (b) 37 restored contract files, (c) ~50 unrelated modified files carried since the start. **Action:** split into separate reviewable PRs — RGB subsystem on its own, contract restoration on its own — before merge. Reviewing all three as one diff is how restored-from-history and incidental edits land unread.

---
**Suggested closing order:** 3 (cheap, and it restores the global type-safety signal) → 9 (unblocks reviewable merges) → 1+2 (the real gate) → 4+5 (design confirmations, ideally before 1 so the smoke test targets the right vocabulary) → 6+7+8 (hardening, before the subsystem carries real value).

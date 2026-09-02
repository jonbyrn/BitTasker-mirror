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

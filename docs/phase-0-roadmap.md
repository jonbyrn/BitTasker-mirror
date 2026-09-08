# Phase 0 Roadmap — Native RGB WASM Subsystem

Execution checklist for the isolated sandbox environment (fresh branch,
throwaway testnet keys). Nothing in this checklist runs against the live
working environment — see `docs/adr/0001-greenfield-rgb-wasm-subsystem.md`
for the architectural decision this plan implements.

## 1. Module Initialization

- [ ] Scaffold `src/lib/services/rgb/` with a `command-queue.ts` implementing
      `RgbCommandQueue` from `src/lib/services/rgb/types.ts`.
- [ ] Implement the serialized async queue (extend the promise-chaining
      pattern from `ensureNdkReady()` in `src/lib/utils/swapAdapter.ts`) so
      `commit`/`witness`/`spend`/`validateConsignment` can never interleave.
- [ ] Add `@utexo/rgb-sdk-web` dynamic import behind `browser` guards, mirroring
      the pattern already used for `initializeWdkBtcWallet()` in
      `src/lib/stores/wallet/wallet-init.ts` — no static top-level import
      anywhere in `src/lib/services/rgb/`.
- [ ] Verify `vite.config.ts`'s `optimizeDeps.exclude` / `needsInterop` /
      `resolve.alias` entries cover every transitive WASM/CJS dependency the
      new module pulls in (`@utexo/rgb-lib-wasm`, `@utexo/rln-wasm`,
      `@bitcoindevkit/bdk-wallet-web`, `@scure/btc-signer`), not just
      `bitcoinjs-lib`.
- [ ] Add a dedicated Rollup `manualChunks` entry for the RGB WASM module,
      following the existing isolation pattern for `debug` and
      `svelte-internal` chunks in `vite.config.ts`, to avoid top-level-await
      chunk-merging issues on Safari/iOS.
- [ ] Implement durable local persistence for the stash (write-ahead or
      transactional) so a crash mid-transition cannot leave a torn write.

## 2. Legacy Clean-Up

- [ ] Confirm no file under `src/lib/services/rgb/` imports from
      `src/lib/services/rgb-wallet-service.ts` or
      `src/lib/utils/contract/v2/rgb-escrow.ts` at any point during
      scaffolding.
- [ ] Update `src/lib/utils/service-contract/creation.ts` to call the new
      `RgbCommandQueue` instead of `createRgbEscrow()`; remove the `any`-typed
      `bid`/`task` params and hardcoded demo pubkeys as part of this change.
- [ ] Delete `src/lib/services/rgb-wallet-service.ts` once the command queue
      covers UTXO fetching via the validated `@utexo/rgb-sdk-web` wallet
      instance (`state.utexoWallet`) — do not reconcile it, it is a second
      unvalidated UTXO source.
- [ ] Delete `src/lib/utils/contract/v2/rgb-escrow.ts` once real single-use
      seal creation is wired through the command queue.
- [ ] Grep the codebase for any remaining references to the deleted files
      (imports, tests, docs) and update or remove them.

## 3. Store Wiring

- [ ] Add a read-only `RgbStateProjection` subscription surface that the RGB
      module emits (immutable, versioned snapshots per
      `src/lib/services/rgb/types.ts`).
- [ ] Wire `WalletStateExtended` (`src/lib/stores/wallet/wallet-types.ts`) to
      consume RGB balances/seals via `$derived`/`$derived.by` only — no
      setters into the RGB projection anywhere in the wallet store.
- [ ] Add the dedicated read-only selector that reconciles RGB balances with
      legacy RGB/Arbitrum balances for shared UI surfaces, per the ADR's
      "explicit reconciliation seam" rule — do not let the two stores write
      into a shared object.
- [ ] Run `mcp__svelte__svelte-autofixer` against every new/edited `.svelte`
      file that consumes the projection.

## 4. Testing Framework

- [ ] Unit tests (Vitest) for every seal state transition:
      `DEFINED -> COMMITTED`, `COMMITTED -> WITNESSED`, `WITNESSED -> SPENT`,
      plus at least one invalid transition per state (fail-closed).
- [ ] Unit tests for command queue serialization: concurrent calls to
      `commit`/`witness`/`spend` must resolve in submission order, and a
      rejected command must not poison subsequently queued commands.
- [ ] Unit tests for `validateConsignment`: valid consignment, malformed
      consignment, consignment for the wrong `contractId`.
- [ ] Persistence/crash-recovery test: simulate an interrupted transition and
      assert the stash recovers to the last durably-committed state, never a
      torn write.
- [ ] Integration test: spend-durability ordering — assert `SPENT` is written
      to durable storage before any UI notification or Nostr relay event is
      observable.
- [ ] Confirm 90%+ branch coverage on `src/lib/services/rgb/` before wiring
      it into any live wallet flow, per this repo's confidence gate for
      fund-critical code.
- [ ] `npm run check` and `npm run lint` pass with zero errors/warnings on
      all new files.

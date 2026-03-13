# Escrow Status Typing Refactor Plan

## Purpose

This document defines the refactor plan for the escrow status typing layer now that BitTasker supports both escrow v1 and escrow v2 at the same time.

The goal is to fix the current mismatch where runtime routing is version-aware, but several shared TypeScript types and helpers still assume the v1 status model.

This is a **typing and state-resolution refactor**, not a business-flow rewrite.

## Problem Summary

Today, the codebase mixes three different concepts:

1. Version-specific status enums:
   - `src/lib/utils/escrow/v1/escrow.enum.ts`
   - `src/lib/utils/escrow/v2/escrow.enum.ts`
2. Shared domain models:
   - `src/lib/types/wallet.d.ts`
   - `src/lib/types/contract.d.ts`
3. Shared helpers that still interpret statuses using v1 assumptions:
   - `src/lib/utils/helpers/contractPermissions.ts`
   - some formatter / contract-loading code

This causes TypeScript errors and also makes it easy to accidentally interpret a v2 contract using v1 status semantics.

## Core Principle

Status values must only be interpreted with explicit version context.

That means:

- shared models may carry a version-aware status type
- shared helpers must not silently assume v1
- v1 and v2 state interpretation must be separated where behavior differs

## Non-Goals

This refactor should **not**:

- change the blockchain state machine
- change the Nostr event architecture
- change the tx sync queue / reconciliation design
- change UI flows beyond what is required for correct typing and status interpretation
- rewrite unrelated escrow logic

## Refactor Steps

Current progress:

- [x] Step 1: normalize shared status types
- [x] Step 2: remove hidden v1 assumptions from shared helpers
- [x] Step 3: split state resolution by version
- [ ] Step 4: reconnect shared callers through explicit version routing
- [ ] Step 5: clean up barrel exports and import boundaries
- [ ] Step 6: validate incrementally and remove temporary compatibility shims

### Step 1: Normalize Shared Status Types

Files:

- `src/lib/types/wallet.d.ts`
- `src/lib/types/contract.d.ts`
- `src/lib/utils/escrow/index.ts`

What we will do:

- introduce a shared version-aware status type for cross-version models
- stop treating `$lib/utils/escrow` as the canonical source of a single `EscrowStatus` enum in shared types
- update shared model types so they can legally carry either v1 or v2 status values

Why we need this:

- `EscrowData.status` is currently typed through the shared escrow barrel, which re-exports the v1 enum
- v2 loaders legitimately return v2 statuses like `Refunded`, `FundsClaimed`, `NoShow`, and `WorkInProgress`
- without this step, every later improvement keeps colliding with the same type mismatch

Definition of done:

- shared data models no longer force v1-only status values
- new status-related changes do not require ad hoc casts just to compile

### Step 2: Remove Hidden v1 Assumptions From Shared Helpers

Files:

- `src/lib/utils/helpers/contractPermissions.ts`
- `src/lib/utils/helpers/contractStatusFormatter.ts`
- any helper that imports status from `$lib/utils/escrow` or directly from `v1` while serving shared logic

What we will do:

- identify helpers that are truly shared versus helpers that are actually v1-specific
- remove hidden imports of v1 status semantics from shared code paths
- keep version-specific interpretation logic behind explicit version-aware entry points

Why we need this:

- the current `contractPermissions.ts` interprets contract state with a v1 enum and v1 state assumptions
- v2 has additional states and different semantics, so a shared helper cannot safely hardcode v1 rules
- leaving this in place means TypeScript errors continue and runtime logic becomes fragile

Definition of done:

- no shared helper interprets contract state without explicit version context
- helper imports clearly show whether they are version-agnostic or version-specific

Implementation note:

- completed by moving v2 state interpretation to `src/lib/utils/helpers/contractPermissions.v2.ts`
- `src/lib/utils/escrow/v2/nostrContract.ts` now imports the v2 resolver directly instead of flowing through the legacy v1 helper
- shared tag helpers were widened to accept `EscrowStatusValue` rather than a v1-only status import

### Step 3: Split State Resolution By Version

Files:

- `src/lib/utils/helpers/contractPermissions.ts`
- `src/lib/utils/escrow/v1/nostrContract.ts`
- `src/lib/utils/escrow/v2/nostrContract.ts`
- optionally new files:
  - `src/lib/utils/helpers/contractPermissions.v1.ts`
  - `src/lib/utils/helpers/contractPermissions.v2.ts`

What we will do:

- separate the actual contract state interpretation into v1 and v2 paths
- either by splitting files or by creating a dispatcher with explicit `version`
- ensure each version only compares against its own enum

Why we need this:

- this is the real source of most remaining cross-version typing errors
- more importantly, it is where business meaning lives, not just TypeScript shapes
- v2 introduces new on-chain and pending states that should not be squeezed into v1 logic

Definition of done:

- v1 logic compares only against v1 states
- v2 logic compares only against v2 states
- shared callers pass version explicitly instead of relying on implicit defaults

Implementation note:

- completed for the active v1 and v2 Nostr contract paths by keeping the existing v1 resolver in place and adding a dedicated v2 resolver plus focused unit coverage

### Step 4: Reconnect Shared Callers Through Explicit Version Routing

Files:

- `src/lib/utils/escrow/index.ts`
- `src/lib/utils/escrow/v1/nostrContract.ts`
- `src/lib/utils/escrow/v2/nostrContract.ts`
- store-loading code that calls contract state resolution

What we will do:

- route status interpretation through the correct version-specific resolver
- make the version source explicit at the call site
- keep `EscrowManager` as the runtime router, but ensure the typing layer mirrors that routing

Why we need this:

- runtime routing already exists, but the typing and helper layer still leaks across versions
- explicit version routing is the only safe way to keep future versions additive

Definition of done:

- the caller knows which resolver it is invoking
- version-specific modules no longer depend on shared helpers that secretly use another version's enum

### Step 5: Clean Up Shared Barrel Exports

Files:

- `src/lib/utils/escrow/index.ts`
- all imports that currently rely on `$lib/utils/escrow` for `EscrowStatus`

What we will do:

- decide whether the shared barrel should stop exporting `EscrowStatus` entirely, or only export a clearly named compatibility alias
- update imports to prefer explicit version enums where behavior depends on the version

Why we need this:

- the current barrel export is misleading because it looks generic but is actually v1
- this is a major source of accidental drift

Definition of done:

- new code cannot accidentally import a v1 status enum while believing it is version-neutral

### Step 6: Validate the Refactor Incrementally

Files / checks:

- targeted unit tests for routing and state interpretation
- existing v1 and v2 escrow tests
- linter / TypeScript diagnostics on touched files

What we will do:

- validate after each step instead of waiting until the end
- prefer small changes that reduce the error surface gradually

Why we need this:

- this refactor touches shared foundations
- if we change too much at once, it becomes hard to tell whether breakage is typing-only or behavior-related

Definition of done:

- touched files stay under control after each step
- the remaining diagnostics, if any, are understood and intentionally postponed

## Recommended Implementation Order

1. Step 1: normalize shared status types
2. Step 2: remove hidden v1 assumptions from shared helpers
3. Step 3: split state resolution by version
4. Step 4: reconnect callers through explicit version routing
5. Step 5: clean up shared barrel exports
6. Step 6: final validation sweep

## Drift Checks

Before and after each implementation step, verify:

- Are we changing typing only, or also changing business logic?
- Did we introduce any new implicit dependence on `$lib/utils/escrow` for status semantics?
- Did a shared helper accidentally remain version-specific?
- Are we using the correct enum for the module we are editing?
- Are we widening types only where version mixing is legitimate?

## Expected Outcome

After this refactor:

- shared data models will safely represent both v1 and v2 contracts
- v1 and v2 state interpretation will be explicit
- status-related TypeScript errors will shrink significantly
- future phases (`6C`, `6D`, permissions, UI) can build on a stable version-aware status layer

# Svelte 4 Pattern Audit and Svelte 5 Migration Plan

## Objective
Identify all remaining Svelte 4-era patterns in this Svelte 5 codebase and define an execution plan to fully migrate to Svelte 5-native patterns.

## Audit Scope
- Files scanned: `src/**/*.svelte`, `src/**/*.ts`, `src/**/*.js`, Storybook Svelte files under `src/stories`.
- Tooling used:
  - ripgrep searches for known legacy signatures
  - `svelte-check` (`npm run check`) warning pass
  - MCP `code-index` search for cross-checking `createEventDispatcher` and event-directive usage

## Baseline
- Project is configured for runes mode: `compilerOptions.runes = true` in [svelte.config.js](/home/scott/BitTasker/svelte.config.js).
- Total Svelte files in `src`: 215.
- Legacy signatures not found:
  - `export let`
  - `$:` reactive labels
  - `<slot>` tags
  - `$$props`, `$$restProps`, `$$slots`
  - `<svelte:component>`
  - `svelte/legacy` helpers

## Remaining Svelte 4 Patterns

### 1) Deprecated event directive syntax (`on:*`) in runtime app code
These are Svelte 4 style and are deprecated in Svelte 5 in favor of DOM property handlers (`onclick`, `onkeydown`, etc.) and callback props for component communication.

- [MobileMapSheet.svelte](/home/scott/BitTasker/src/lib/components/maps/MobileMapSheet.svelte:153)
- [MobileMapSheet.svelte](/home/scott/BitTasker/src/lib/components/maps/MobileMapSheet.svelte:154)
- [MobileMapSheet.svelte](/home/scott/BitTasker/src/lib/components/maps/MobileMapSheet.svelte:155)
- [MobileMapSheet.svelte](/home/scott/BitTasker/src/lib/components/maps/MobileMapSheet.svelte:172)
- [MobileMapSheet.svelte](/home/scott/BitTasker/src/lib/components/maps/MobileMapSheet.svelte:173)
- [MobileMapSheet.svelte](/home/scott/BitTasker/src/lib/components/maps/MobileMapSheet.svelte:209)
- [HelpModal.svelte](/home/scott/BitTasker/src/lib/components/wallet/HelpModal.svelte:67) (`<svelte:window on:keydown=...>`)
- [LocationAutoComplete.svelte](/home/scott/BitTasker/src/lib/components/LocationAutoComplete.svelte:176) (`on:locationChanged`)

Notes:
- [MobileMapSheet.svelte](/home/scott/BitTasker/src/lib/components/maps/MobileMapSheet.svelte:149) includes `<!-- svelte-ignore event_directive_deprecated -->`, which explicitly suppresses migration warnings.

### 2) `createEventDispatcher` (Svelte 4 component-event pattern)
- [LocationPickerMap.svelte](/home/scott/BitTasker/src/lib/components/maps/LocationPickerMap.svelte:3)
- [LocationPickerMap.svelte](/home/scott/BitTasker/src/lib/components/maps/LocationPickerMap.svelte:27)
- [HelpModal.svelte](/home/scott/BitTasker/src/lib/components/wallet/HelpModal.svelte:2)
- [Button.svelte](/home/scott/BitTasker/src/stories/Button.svelte:2)
- [Header.svelte](/home/scott/BitTasker/src/stories/Header.svelte:2)
- [Page.svelte](/home/scott/BitTasker/src/stories/Page.svelte:2)

Notes:
- In [HelpModal.svelte](/home/scott/BitTasker/src/lib/components/wallet/HelpModal.svelte:13), dispatcher is created but not used.

### 3) Slot-prop `let:*` usage in Storybook Svelte stories
- [Drawer.stories.svelte](/home/scott/BitTasker/src/stories/Drawer.stories.svelte:27)
- [Modal.stories.svelte](/home/scott/BitTasker/src/stories/Modal.stories.svelte:24)

Notes:
- This may be tied to Storybook CSF internals rather than app runtime, but it is still Svelte 4-style surface syntax.

## Patterns Likely Causing Bugs or Issues

### A) Confirmed Svelte warnings indicating reactive bugs (`state_referenced_locally`)
From `npm run check` warnings:
- [TranslatableBidContent.svelte](/home/scott/BitTasker/src/lib/components/bidding/TranslatableBidContent.svelte:65)
- [ComingSoon.svelte](/home/scott/BitTasker/src/lib/components/ComingSoon.svelte:22)
- [ComingSoon.svelte](/home/scott/BitTasker/src/lib/components/ComingSoon.svelte:23)
- [ComingSoon.svelte](/home/scott/BitTasker/src/lib/components/ComingSoon.svelte:24)
- [ComingSoon.svelte](/home/scott/BitTasker/src/lib/components/ComingSoon.svelte:25)
- [ComingSoon.svelte](/home/scott/BitTasker/src/lib/components/ComingSoon.svelte:26)
- [ComingSoon.svelte](/home/scott/BitTasker/src/lib/components/ComingSoon.svelte:27)
- [TagsInput.svelte](/home/scott/BitTasker/src/lib/components/TagsInput.svelte:32)
- [LocationFilter.svelte](/home/scott/BitTasker/src/lib/components/filters/LocationFilter.svelte:18)
- [LocationFilter.svelte](/home/scott/BitTasker/src/lib/components/filters/LocationFilter.svelte:19)
- [PendingSwap.svelte](/home/scott/BitTasker/src/lib/components/wallet/PendingSwap.svelte:25)

Risk:
- These warnings typically mean values are captured once and stop updating reactively, which can cause stale UI, stale callback behavior, and racey state display.

### B) Confirmed accessibility warning in a file that also suppresses event deprecation
- [MobileMapSheet.svelte](/home/scott/BitTasker/src/lib/components/maps/MobileMapSheet.svelte:150) (`a11y_no_static_element_interactions`)

Risk:
- Keyboard and assistive-technology behavior can be inconsistent. Combined with legacy `on:*` and suppression comments, this increases maintenance and regression risk.

### C) `createEventDispatcher` and component-event listeners in runes project
Risk:
- Works today, but diverges from Svelte 5 callback-prop style and keeps migration debt alive.
- Higher chance of future breakage when deprecated pathways are removed or lint rules are tightened.

## Migration Plan (No Code Changes Yet)

## Phase 0: Preparation and Guardrails
1. Add/enable lint and check gates for Svelte 5 migration warnings:
   - Fail on `event_directive_deprecated` in app code.
   - Fail on `state_referenced_locally`.
2. Freeze new legacy usage:
   - Add contribution note: no new `on:*` or `createEventDispatcher` in app code.
3. Define a migration tracking checklist by file and warning type.

Acceptance criteria:
- CI/lint rules make new legacy usage visible and blocking.

## Phase 1: Runtime App Migration (Highest Priority)
1. Replace `on:*` DOM directives in:
   - [MobileMapSheet.svelte](/home/scott/BitTasker/src/lib/components/maps/MobileMapSheet.svelte)
   - [HelpModal.svelte](/home/scott/BitTasker/src/lib/components/wallet/HelpModal.svelte)
2. Remove `svelte-ignore event_directive_deprecated` comments once migrated.
3. Replace `createEventDispatcher` in:
   - [LocationPickerMap.svelte](/home/scott/BitTasker/src/lib/components/maps/LocationPickerMap.svelte)
   - [HelpModal.svelte](/home/scott/BitTasker/src/lib/components/wallet/HelpModal.svelte) (remove if unused)
4. Update parent/child contract:
   - Convert `on:locationChanged` consumption in [LocationAutoComplete.svelte](/home/scott/BitTasker/src/lib/components/LocationAutoComplete.svelte) to callback prop flow.

Acceptance criteria:
- No `on:*` event directives in runtime app components.
- No `createEventDispatcher` in runtime app components.
- No `event_directive_deprecated` suppressions remain.

## Phase 2: Reactive Correctness Fixes (Bug-Oriented)
1. Resolve all `state_referenced_locally` warnings in:
   - [TranslatableBidContent.svelte](/home/scott/BitTasker/src/lib/components/bidding/TranslatableBidContent.svelte)
   - [ComingSoon.svelte](/home/scott/BitTasker/src/lib/components/ComingSoon.svelte)
   - [TagsInput.svelte](/home/scott/BitTasker/src/lib/components/TagsInput.svelte)
   - [LocationFilter.svelte](/home/scott/BitTasker/src/lib/components/filters/LocationFilter.svelte)
   - [PendingSwap.svelte](/home/scott/BitTasker/src/lib/components/wallet/PendingSwap.svelte)
2. Add focused tests for the exact reactive paths being fixed (state updates, derived updates, callback freshness).

Acceptance criteria:
- Zero `state_referenced_locally` warnings.
- Tests prove corrected reactive behavior.

## Phase 3: Storybook Cleanup (Medium Priority)
1. Replace `createEventDispatcher` in story components:
   - [Button.svelte](/home/scott/BitTasker/src/stories/Button.svelte)
   - [Header.svelte](/home/scott/BitTasker/src/stories/Header.svelte)
   - [Page.svelte](/home/scott/BitTasker/src/stories/Page.svelte)
2. Evaluate Storybook CSF syntax compatibility for `let:args`:
   - If Storybook supports snippet/callback alternative cleanly, migrate.
   - If not, document as tooling exception and isolate to stories only.

Acceptance criteria:
- No `createEventDispatcher` in Storybook components.
- `let:args` either migrated or documented as a deliberate compatibility exception.

## Phase 4: Verification and Regression Controls
1. Run full `npm run check` and ensure Svelte migration warnings are clear.
2. Run unit tests for touched components.
3. Run critical E2E paths for map/location, wallet modal, and task browsing.
4. Record migration completion snapshot in requirements/docs.

Acceptance criteria:
- Zero Svelte 4-style event-dispatch and event-directive usage in runtime app code.
- Zero Svelte migration warnings (`event_directive_deprecated`, `state_referenced_locally`).

## Suggested Work Breakdown (PR sequence)
1. PR-1: Event directives + dispatcher migration in maps/wallet runtime files.
2. PR-2: Reactive warning fixes (`state_referenced_locally`) with targeted tests.
3. PR-3: Storybook-only cleanup and documentation.
4. PR-4: Final warning gate hardening and cleanup.

## Out of Scope for This Plan
- Broad TypeScript/test error cleanup unrelated to Svelte 4/5 migration.
- Non-Svelte feature refactors.


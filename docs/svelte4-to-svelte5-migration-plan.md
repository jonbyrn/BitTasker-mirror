# Svelte 4 → Svelte 5 Migration Plan

**Status:** Plan only — no code changes yet.  
**Scope:** Remove remaining Svelte 4 patterns and align the codebase with Svelte 5 runes and conventions.  
**Confidence:** High (see Confidence Assessment section).

---

## 1. Current State Summary

### 1.1 Already Svelte 5

- **Compiler:** `svelte.config.js` has `compilerOptions: { runes: true }`.
- **Dependencies:** `svelte@^5.46.3`, `@sveltejs/kit@^2.49.4`.
- **Components:** ~215 `.svelte` files; most already use:
  - `$state()`, `$derived`, `$effect`, `$props()`, `$bindable`
  - `onclick` (not `on:click`)
  - Snippets (`#snippet` / `@render`) where needed (e.g. `Modal.svelte`, `Drawer.svelte`)
- **No Svelte 4 slots:** No `<slot />` or `#slot`; children are passed via Snippet.
- **No `export let`:** Props use `$props()`.
- **No reactive `$:` in app code:** Only test mocks use `$$:` (internal Svelte structure), which is fine.
- **No `beforeUpdate` / `afterUpdate`:** Not used.

### 1.2 Remaining Svelte 4 Patterns (To Migrate)

| Category                    | Location                                    | Count / Notes          |
| --------------------------- | ------------------------------------------- | ---------------------- |
| **`on:event`**              | `HelpModal.svelte`, `MobileMapSheet.svelte` | 5 event bindings total |
| **`createEventDispatcher`** | 5 files                                     | See table below        |
| **Stores**                  | All store files                             | Optional; see §4       |

**Event dispatcher usage:**

| File                                               | Dispatches                                                     | Consumer / usage                                                                 |
| -------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `src/lib/components/wallet/HelpModal.svelte`       | (none used in template; dispatch created but not used for DOM) | Used with `onClose` / `showButton` props only                                    |
| `src/lib/components/maps/LocationPickerMap.svelte` | `locationChanged`                                              | `LocationAutoComplete.svelte` via `on:locationChanged={handleMapLocationChange}` |
| `src/stories/Button.svelte`                        | `click`                                                        | Storybook only                                                                   |
| `src/stories/Header.svelte`                        | `login`, `logout`, `createAccount`                             | Storybook only (also has callback props)                                         |
| `src/stories/Page.svelte`                          | `login`, `logout`, `createAccount`                             | Storybook only                                                                   |

**`on:event` usage:**

| File                    | Events                                                                            |
| ----------------------- | --------------------------------------------------------------------------------- |
| `HelpModal.svelte`      | `<svelte:window on:keydown={handleKeydown} />`                                    |
| `MobileMapSheet.svelte` | `on:pointerdown`, `on:pointermove`, `on:pointerup`, `on:click` (×2), `on:keydown` |

**Note:** `transition:...` (e.g. `transition:fade`, `transition:fly`) remain valid in Svelte 5; no change required. `bind:` is also still supported.

---

## 2. Migration Plan (Phased)

### Phase 1: Low-Risk Event Syntax (on: → on\*)

**Goal:** Replace every `on:event` with the Svelte 5 property form `onevent`.

**Tasks:**

1. **HelpModal.svelte**

   - Change `<svelte:window on:keydown={handleKeydown} />` to `<svelte:window onkeydown={handleKeydown} />`.

2. **MobileMapSheet.svelte**
   - `on:pointerdown` → `onpointerdown`
   - `on:pointermove` → `onpointermove`
   - `on:pointerup` → `onpointerup`
   - `on:click` → `onclick` (both occurrences)
   - `on:keydown` → `onkeydown`

**Validation:** Lint, `npm run check`, manual smoke test of wallet help modal and mobile map sheet (card click, keydown, pointer drag).

**Risk:** Very low. Syntax-only; behavior unchanged.

---

### Phase 2: Replace createEventDispatcher with Callback Props

**Goal:** Remove `createEventDispatcher` and use callback props so all components follow Svelte 5 patterns.

**Tasks:**

1. **HelpModal.svelte**

   - Remove `createEventDispatcher` and any `dispatch(...)` calls (if none, just remove the import and `const dispatch = createEventDispatcher()`).
   - No parent currently listens to events; `onClose` is already a prop.

2. **LocationPickerMap.svelte**

   - Add optional prop: `onLocationChanged?: (detail: { location: Location }) => void`.
   - Replace `dispatch('locationChanged', { location: newLocation })` with `onLocationChanged?.({ location: newLocation })`.
   - Remove `createEventDispatcher` import and usage.

3. **LocationAutoComplete.svelte**

   - Change `<LocationPickerMap ... on:locationChanged={handleMapLocationChange} />` to `onLocationChanged={handleMapLocationChange}` (or a small wrapper that passes `detail` if the handler expects it).

4. **Storybook: Button.svelte**

   - Add optional prop `onclick?: () => void` (or reuse existing pattern).
   - In `handleClick`, call `onclick?.()` then `dispatch('click')` during migration; then remove `createEventDispatcher` and use only `onclick?.()`.

5. **Storybook: Header.svelte & Page.svelte**
   - Already have `onLogin`, `onLogout`, `onCreateAccount`. Remove `createEventDispatcher` and `dispatch(...)`; call only the callback props.

**Validation:**

- Lint and `npm run check`.
- App: open a page that uses `LocationAutoComplete`, change location on map, confirm handler runs.
- Storybook: run Storybook and confirm Button / Header / Page stories still behave (use callback props in stories if they currently use `on:click` etc.).

**Risk:** Low. Only a few components and one app consumer (`LocationAutoComplete`). Storybook is isolated.

---

### Phase 3: Optional — Store Migration (Deferred)

**Current:** All stores use `writable`, `derived`, `get()` from `svelte/store`. This is **still supported in Svelte 5**; no deprecation.

**Options:**

- **A. Leave as-is (recommended for this plan)**

  - No store migration.
  - Keeps migration small and low-risk.
  - Use runes in components and keep global/shared state in stores.

- **B. Gradual store migration**
  - Replace selected stores with module-level `$state` (and possibly `$derived`) and expose getters/setters.
  - Higher effort and risk; many files use `get(store)` outside components.
  - Not recommended until Phase 1–2 are done and stable.

**Recommendation:** Do **not** include store migration in the initial migration. Revisit only if you explicitly want to move to runes-based global state.

---

## 3. Risk Evaluation

| Risk                                                                | Likelihood | Impact                      | Mitigation                                                                                                                  |
| ------------------------------------------------------------------- | ---------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **Regression in HelpModal** (keydown / close)                       | Low        | Medium                      | Single line change; test Escape key and backdrop close.                                                                     |
| **Regression in MobileMapSheet** (pointer/click/key)                | Low        | Medium                      | Test card click, keyboard nav, and map drag on a device or responsive view.                                                 |
| **LocationPickerMap callback not fired**                            | Low        | High (location not applied) | Unit or integration test for `onLocationChanged`; manual test in create-task / edit flow.                                   |
| **Storybook stories break**                                         | Low        | Low                         | Stories are isolated; fix by wiring callback props.                                                                         |
| **Third-party components (e.g. svelte-multiselect, svelty-picker)** | Low        | Medium                      | Already on Svelte 5–compatible versions; no change in this plan. If issues appear, handle in a separate dependency upgrade. |
| **Test mocks (e.g. `$$: { ctx: [] }`)**                             | Very low   | Low                         | Mocks are for internal structure; no change unless tests fail.                                                              |

---

## 4. Mitigations Summary

1. **Per-phase validation:** Lint + `npm run check` after each phase; run relevant app flows and Storybook.
2. **Small, reviewable PRs:** Phase 1 in one PR, Phase 2 in another (or split by app vs Storybook).
3. **No store changes in this plan:** Avoids touching 15+ store files and hundreds of `get(store)` usages.
4. **Single consumer for LocationPickerMap:** Only `LocationAutoComplete` uses the event; one call site to update and test.
5. **Documentation:** This plan and the project’s existing Svelte 5 / SvelteKit 2 rules (e.g. in `.cursor/rules`) keep future work consistent.

---

## 5. Out of Scope (Explicitly Not in This Plan)

- Migrating **stores** to runes-based state (optional, higher risk; defer).
- Changing **transition:** directives (already valid in Svelte 5).
- Changing **bind:** (still supported).
- Broad refactors (e.g. converting all `bind:` to `$bindable`); only what’s needed to remove Svelte 4 patterns.
- Dependency upgrades (e.g. Houdini, Storybook) unless required for Svelte 5.

---

## 6. Confidence Assessment

**Overall confidence in this migration plan: High.**

| Factor             | Assessment                                                                                                                                                               |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Scope clarity**  | Only 2 app components and 1 parent use `on:event`; 5 files use `createEventDispatcher`, with 1 app consumer. Rest of codebase is already on runes and Svelte 5 patterns. |
| **Technical risk** | Low. Event renames and callback props are well-defined and localized. No change to stores or to third-party APIs.                                                        |
| **Reversibility**  | Easy. Changes are small and file-local; can be reverted per file if needed.                                                                                              |
| **Test surface**   | Lint and type-check cover syntax and types; one integration point (LocationPickerMap ↔ LocationAutoComplete) to test manually or with a single test.                    |
| **Documentation**  | Svelte 5 and SvelteKit 2 rules and this plan give a clear, repeatable path.                                                                                              |

**Caveats:**

- Confidence assumes no hidden reliance on `createEventDispatcher` (e.g. in Houdini or other tooling). Grep shows no other `on:locationChanged` or HelpModal event listeners.
- If you later add store migration (Phase 3), confidence would drop to medium until that work is scoped and tested separately.

---

## 7. Suggested Order of Work

1. **Phase 1** — Replace `on:event` with `on*` in `HelpModal.svelte` and `MobileMapSheet.svelte`.
2. **Phase 2a** — Replace dispatcher in `LocationPickerMap.svelte` and `LocationAutoComplete.svelte`; test location flow.
3. **Phase 2b** — Replace dispatcher in Storybook components (`Button`, `Header`, `Page`); run Storybook.
4. **Phase 2c** — Clean up `HelpModal.svelte` (remove unused `createEventDispatcher` if present).
5. **Defer** — Store migration (Phase 3) unless explicitly required later.

No code changes have been made yet; this document is the migration plan and risk assessment only.

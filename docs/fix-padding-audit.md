# Audit: fix-padding implementation

## Scope of changes made

| File | What changed |
|------|----------------|
| **app.css** | Introduced new `:root` variables `--safe-area-inset-*` with `env(..., constant(..., 0px))`; merged the two existing `:root` blocks into one; switched `.pt-safe` / `.pb-safe` / `.app-shell__header` and `--bottom-nav-height-safe` to use `var(--safe-area-inset-*)` instead of `env()` directly. |
| **app.html** | Added a comment above the viewport meta. |
| **TopBar.svelte** | Replaced `var(--safe-area-inset-top, env(safe-area-inset-top, 0px))` with `var(--safe-area-inset-top)` and shortened/deleted the SystemBars fallback comment. |
| **BottomNavBar.svelte** | Replaced `env(safe-area-inset-bottom, 0)` with `var(--safe-area-inset-bottom, 0px)` in `.pb-safe` and the dock; updated one comment. |
| **Drawer.svelte** | Replaced `env(safe-area-inset-bottom, 0)` with `var(--safe-area-inset-bottom)`. |
| **WalletPaymentModal.svelte** | Replaced `env(safe-area-inset-top/bottom)` in Tailwind classes with `var(--safe-area-inset-top/bottom)`. |
| **WalletPaymentModal.test.ts** | Updated expected class names from `env(...)` to `var(...)`. |

---

## Issues identified

### 1. Unnecessary structural change (app.css)

- **What was done:** The two `:root` blocks (safe-area utilities vs. bottom-nav variables) were merged into a single block, and new global variables were introduced.
- **Risk:** All safe-area usage now depends on `:root` defining `--safe-area-inset-*`. Previously, TopBar and others could rely on `env()` directly when no variable was set.
- **Optimal approach:** Do not merge `:root` blocks or introduce new variables. Only add the `constant()` fallback where `env()` is already used, so behavior stays the same with minimal diff.

### 2. TopBar: removed SystemBars fallback and comment

- **What was done:** TopBar’s `.pt-safe` was changed from `var(--safe-area-inset-top, env(safe-area-inset-top, 0px))` to `var(--safe-area-inset-top)`, and the three-line comment describing the SystemBars fallback order was removed.
- **Risk:** The original pattern allowed (1) SystemBars-injected `--safe-area-inset-top` to take precedence and (2) fallback to `env()` when the variable was not set. Now TopBar depends on `:root` defining the variable and the explicit “variable then env()” fallback is gone.
- **Optimal approach:** Keep the original comment and the original fallback chain; only add `constant()` inside the `env()` part:  
  `var(--safe-area-inset-top, env(safe-area-inset-top, constant(safe-area-inset-top, 0px)))`.  
  No dependency on `:root` for this component.

### 3. Unnecessary edits to Drawer, WalletPaymentModal, tests

- **What was done:** Drawer and WalletPaymentModal were switched from `env()` to `var(--safe-area-inset-*)`, and the test was updated to expect the new class names.
- **Risk:** More files and behavior tied to the new global variables; test assertions changed without a functional need.
- **Optimal approach:** Do not change these files to use variables. Only add the `constant()` fallback where `env()` is used, e.g.  
  `env(safe-area-inset-bottom, constant(safe-area-inset-bottom, 0))`.  
  No test changes required.

### 4. BottomNavBar: same idea

- **What was done:** Replaced `env(safe-area-inset-bottom, 0)` with `var(--safe-area-inset-bottom)` (and in one place `var(--safe-area-inset-bottom, 0px)`).
- **Optimal approach:** Keep using `env()` and only add the `constant()` fallback:  
  `env(safe-area-inset-bottom, constant(safe-area-inset-bottom, 0))`.  
  No new dependency on `:root` variables.

### 5. app.html comment

- **What was done:** Added a comment that `viewport-fit=cover` is required for iOS PWA safe areas.
- **Assessment:** Harmless and useful; can be kept as a documentation improvement.

---

## Root cause of the iOS issue

On iOS 11.0–11.1, safe area insets were exposed only via `constant(safe-area-inset-*)`. From iOS 11.2 on, `env(safe-area-inset-*)` is used. If the code only had `env(..., 0)` and no `constant()`, older iOS could get no inset. The fix is to add `constant()` as the fallback inside `env()`, e.g.:

`env(safe-area-inset-top, constant(safe-area-inset-top, 0px))`

No new variables or refactors are required for this fix.

---

## Recommended minimal improvement

- **Principle:** Add the minimum change that fixes iOS: use `constant()` wherever we already use `env(safe-area-inset-*)`. Prefer improving existing lines over deleting or replacing structure.
- **Do not:** Introduce new `:root` variables, merge `:root` blocks, switch components to `var(--safe-area-inset-*)`, or change Drawer/Modal/tests except where adding `constant()`.
- **Do:**
  1. **app.css:** In the existing rules, only add `constant()` inside each `env()`:  
     `.pt-safe`, `.pb-safe`, `.pl-safe`, `.pr-safe`, `.app-shell__header`, and in `:root` for `--bottom-nav-height-safe`.  
     Do not add new variables or merge blocks.
  2. **TopBar.svelte:** Keep the original comment and `var(--safe-area-inset-top, env(...))` pattern; only add `constant(safe-area-inset-top, 0px)` inside the `env()` part.
  3. **BottomNavBar.svelte:** In the dock and `.pb-safe`, replace `env(safe-area-inset-bottom, 0)` with `env(safe-area-inset-bottom, constant(safe-area-inset-bottom, 0))` (and equivalent in the inline style). Revert comment change if it was only stylistic.
  4. **Drawer.svelte:** Use `env(safe-area-inset-bottom, constant(safe-area-inset-bottom, 0))` instead of `var(--safe-area-inset-bottom)`. Revert to original pattern + constant only.
  5. **WalletPaymentModal.svelte:** In the Tailwind arbitrary values, use `env(safe-area-inset-top, constant(safe-area-inset-top, 0px))` (and same for bottom). Revert to `env()` with `constant()`; no `var()`.
  6. **WalletPaymentModal.test.ts:** Revert expectations to the original class names that use `env()` (with optional note that the value may include `constant()` in the implementation).
  7. **app.html:** Keep the added comment (documentation only).

Result: one clear, minimal fix (iOS `constant()` fallback), no new global contract, no unnecessary edits to Drawer/Modal/tests beyond that fix, and restoration of the TopBar SystemBars comment and fallback order.

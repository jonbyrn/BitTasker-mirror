# Phase B — Stores Testing Guidelines

**Purpose:** Test store **behavior** (state shape, transitions, reset) without over-mocking. Only test **used** stores; assert outcomes, not implementation.

---

## Principles

1. **Assert behavior:** Subscribe (or `get(store)`), trigger an action, assert resulting state. Don't assert internal call order or private helpers.
2. **Minimal mocks:** Prefer testing real store logic. Mock only I/O (Preferences, goto, session.clearSession, user.reset) when testing async methods like logout.
3. **Reset between tests:** Use the store's `reset()` (or equivalent) in `beforeEach` so tests don't depend on order.
4. **Test used stores only:** task.store, auth.store, bid.store, wallet.store, app.store are used; we already have bid.store and wallet.store tests. Add task.store (myTasksStore, tasksStore.reset, constants) and auth.store (sync setters, login, logout with mocks).

---

## What to test

| Store | Test | Mock? |
|-------|------|--------|
| **myTasksStore** | Initial state; update(items, loading, error, hasMore, currentPage); reset() restores initial state | None |
| **tasksStore** | reset() restores items [], loading false, hasMore true, currentPage 1, etc. | None (appStore has pool at load) |
| **authState** | setLoading, setError, login() → state shape | None for sync |
| **authState** | logout() → state reset to initial; clearSession and user.reset called | ✅ Done. Mock Preferences, session, user.store. |
| **appStore** | Initial state; resetUserState(); showSuccessToast/showErrorToast/showInfoToast (add + auto-remove); initializePool | ✅ Done. Clear toasts in beforeEach. |
| **user** | Initial profile; updateProfile(partial); reset() | ✅ Done. Sync only. |
| **taskStore** (create-task) | nextStep, previousStep, setStep, updateTask if we can isolate (optional) | Deferred; would need Preferences, $app/state, STEPS. |

---

## Where tests live

- `src/lib/tests/unit/stores/task.store.test.ts`
- `src/lib/tests/unit/stores/auth.store.test.ts`
- `src/lib/tests/unit/stores/app.store.test.ts` — initial state, resetUserState, toasts (add + auto-remove), initializePool
- `src/lib/tests/unit/stores/user.store.test.ts` — initial state, updateProfile, reset, cache (getCachedEvent, cacheEvent), getUserData (mocked appStore, getNpub, pool)
- `src/lib/tests/unit/stores/theme.store.test.ts` — darkMode, initializeTheme (Preferences mocked), toggleDarkMode
- `src/lib/tests/unit/stores/navigation.store.test.ts` — showBackButton (setBackButton show/hide/auto, resetBackButton; $app/state mocked)

Existing: `bid.store.test.ts`, `wallet.store.*.test.ts`.

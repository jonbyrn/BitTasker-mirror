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
| **taskStore** (create-task) | nextStep, previousStep, setStep, updateTask if we can isolate (optional) | Deferred; would need Preferences, $app/state, STEPS. |

---

## Where tests live

- `src/lib/tests/unit/stores/task.store.test.ts`
- `src/lib/tests/unit/stores/auth.store.test.ts`

Existing: `bid.store.test.ts`, `wallet.store.*.test.ts`.

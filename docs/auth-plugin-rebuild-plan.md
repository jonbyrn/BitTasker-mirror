# Auth Plugin Rebuild Plan

Rebuild `src/lib/utils/houdini/plugins/customAuthPlugin.ts` with module-level state (no refs, single source of truth), keep the same public API and behavior, and add defensive fixes. No changes to callers.

---

## 1. Scope and Backwards Compatibility

### 1.1 What must not change (contract)

| Consumer                         | Uses                                                                | Contract                                                                                                                                                                                                                                                 |
| -------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **src/client.ts**                | `import customAuthPlugin from '...'`; `plugins: [customAuthPlugin]` | Default export is a **function** that returns `{ beforeNetwork, end }` (Houdini ClientPlugin).                                                                                                                                                           |
| **src/lib/stores/auth.store.ts** | Dynamic import: `clearPluginTokenCache`, `setAccessToken`           | `clearPluginTokenCache()`: sync, no-arg, clears in-memory token. `setAccessToken(token: string)`: async, writes token to storage and updates plugin so next request sends it.                                                                            |
| **Tests**                        | `module.default`, `module.TokenManager`                             | `default` is the plugin factory. `TokenManager` has `setToken(token)`, `clearToken()` (async). Behavior: setToken then beforeNetwork → request has Authorization; clearToken then beforeNetwork → no Authorization; 401 in end → logout + redirect; etc. |

### 1.2 What can change (internal only)

- Replace closure state + refs with **module-level state**.
- Remove `clearTokenCacheRef` and `setTokenCacheRef`.
- Add defensive checks (guard `value`, return `next(ctx)`, clearToken in `finally`, validate token, safe Preferences read).
- Keep same file path and same export names; no new or removed exports.

### 1.3 Dependency map (verified)

```
src/client.ts
  └── customAuthPlugin (default) → HoudiniClient plugins

src/lib/stores/auth.store.ts
  └── dynamic import: clearPluginTokenCache, setAccessToken

src/lib/tests/unit/helpers/customAuthPlugin.test.ts
  └── dynamic import: default, TokenManager
```

No other files import the plugin module. Auth store is the only runtime consumer of `setAccessToken` and `clearPluginTokenCache`. TokenManager is only used in tests and could be used by future code; its API stays the same.

---

## 2. Implementation Plan

### Phase 1: Add module-level state and init (no behavior change yet)

1. **Add module-level variables** at the top of the file (after existing helpers, before the factory):

   - `currentToken: string | null = null`
   - `tokenInitialized = false`
   - `tokenInitPromise: Promise<void> | null = null`
   - `logoutInProgress = false`
   - `currentDeviceId: string | null = null`

2. **Add module-level init helpers** (same logic as today, writing to module state):

   - `initializeToken()`: `Preferences.get(ACCESS_TOKEN)` → `currentToken = result?.value ?? null`; in `finally`: `tokenInitialized = true`. Guard `if (!browser) return`. Never throw (try/catch, log).
   - `initializeDeviceId()`: fire-and-forget, `currentDeviceId = await getDeviceIdentifier()` (try/catch, log). Guard `if (!browser) return`.

3. **Keep the factory**, but have it only start init if not already started:

   - On first call: `if (browser && !tokenInitialized) { tokenInitPromise = initializeToken(); initializeDeviceId(); }`
   - Return `{ beforeNetwork, end }` where both read/write **module-level** state (currentToken, logoutInProgress, currentDeviceId, tokenInitialized, tokenInitPromise) instead of closure variables.

4. **Wire public APIs to module state** (replace refs):

   - `clearPluginTokenCache()`: `currentToken = null` (no ref).
   - `setAccessToken(token)`: guard `if (!browser) return`. Optional: `if (!token || typeof token !== 'string' || !token.trim()) return`. Then `await Preferences.set(ACCESS_TOKEN, token)`; `currentToken = token`.
   - `syncTokenFromPreferences()`: unchanged logic but set `currentToken = result?.value ?? null` (no ref). Keep try/catch, never throw.

5. **Remove** `clearTokenCacheRef`, `setTokenCacheRef`, and all assignments to them. Remove closure state (`cachedToken`, `cachedDeviceId`, etc.) from the factory; use module-level only.

6. **Run existing tests**; fix any failures so behavior is identical (no semantic change in this phase).

### Phase 2: Defensive fixes

7. **beforeNetwork:** `return next(ctx)` (or `return await next(ctx)`). Ensures the hook promise chains to the pipeline.

8. **end hook:** At the very start, guard: `if (value == null) { resolve(ctx); return; }` before calling `isAuthFailure(value)`.

9. **TokenManager.clearToken:** Use try/finally so cache is always cleared even if remove throws:

   - `try { await Preferences.remove(ACCESS_TOKEN); } finally { clearPluginTokenCache(); }`
   - Keep `if (browser)` wrapper.

10. **setAccessToken:** Reject or no-op for invalid token (e.g. empty or non-string). Example: `if (!token || typeof token !== 'string' || !token.trim()) return;`

11. **initializeToken:** Use `currentToken = result?.value ?? null` so odd Preferences shapes don’t throw.

12. **isAuthFailure (optional):** Treat string statusCode: e.g. `Number(err.extensions?.originalError?.statusCode) === 401` so `"401"` is accepted.

### Phase 3: Cleanup and validation

13. Remove unused **GraphQLError** interface if it’s no longer referenced (or keep for JSDoc). Ensure no dead code.

14. **Run full plugin test suite** (`src/lib/tests/unit/helpers/customAuthPlugin.test.ts`). All tests in that file (currently 29) must pass.

15. **Run auth store tests** (if any) that touch logout/setupAuthData: `src/lib/tests/unit/stores/auth.store.test.ts`. Ensure no regressions.

16. **Lint and typecheck:** `npm run lint`, `npm run check` for the plugin file and auth store.

17. **Smoke check:** Start app, login (e.g. passkey or Nostr), open dashboard (triggers GraphQL). Confirm no 401 and no console errors. Optionally run a single E2E that does login → dashboard if available.

---

## 3. File-by-file impact

| File                                                    | Change                                                                                                                                                                  |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **src/lib/utils/houdini/plugins/customAuthPlugin.ts**   | Rebuild: module-level state, no refs, thin factory, defensive fixes. Same exports and behavior.                                                                         |
| **src/client.ts**                                       | None.                                                                                                                                                                   |
| **src/lib/stores/auth.store.ts**                        | None.                                                                                                                                                                   |
| **src/lib/tests/unit/helpers/customAuthPlugin.test.ts** | None (same imports and assertions). If any test relied on “multiple plugin instances” or ref behavior, adjust; current tests only use one factory call per loadHarness. |

---

## 4. Rollback

- Single file change (plugin only). Rollback = revert the plugin file and re-run tests.
- No migrations, no schema, no API changes. If something breaks, revert the commit and redeploy.

---

## 5. Risk summary

| Risk                                                    | Mitigation                                                                                                                  |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Init runs at wrong time (SSR vs browser)                | Keep init inside `if (browser)` and only when factory is called; same as today.                                             |
| Tests see shared state across tests                     | Tests use `vi.resetModules()` + dynamic import per loadHarness; each test gets a fresh module and fresh module-level state. |
| Houdini expects plugin to be a function returning hooks | No change to default export shape; still a function returning `{ beforeNetwork, end }`.                                     |
| Auth store or client depend on ref or closure details   | They only call `clearPluginTokenCache()` and `setAccessToken(token)`; no refs or closure exposed.                           |

---

## 6. Confidence and Recommendations

### Confidence that the rebuild won’t break the project: **0.88**

- **Reasons for confidence:** Only one file is changed; all consumers (client, auth store, tests) use a stable, small API surface; dependency map is small and verified; behavior is preserved by design; tests will catch regressions.
- **Reasons it’s not higher:** Houdini’s plugin lifecycle is not fully visible (e.g. how many times the factory is called in production); no E2E in this plan that explicitly covers “login → first GraphQL request succeeds.”

### Recommendations to improve confidence (before or after rebuild)

1. **Run the full unit test suite** (not only the plugin file) after the rebuild to catch any indirect breakage (e.g. auth store tests). **+0.03**
2. **Add or run one E2E** that logs in and loads a page that triggers a GraphQL query, then asserts success (no 401). **+0.04**
3. **Manual smoke test** after deploy: login on staging/preview, open dashboard, trigger a few actions that use GraphQL. **+0.02**
4. **Implement in a feature branch** and keep the branch for 1–2 days of internal testing before merging. **+0.02**

With 1–4 done, confidence can reach **~0.95+**.

---

## 7. Order of operations (checklist)

- [x] Phase 1: Introduce module-level state and init; remove refs; wire APIs to module state; run plugin tests until all pass.
- [x] Phase 2: Add defensive fixes (return next(ctx), guard value, clearToken in finally, validate token, safe init read, optional statusCode coercion).
- [x] Phase 3: Cleanup, run full plugin suite, run auth store tests, lint/check, optional smoke or E2E.
- [x] Document in code or in this doc: “Token state is module-level; single source of truth. Init runs on first factory call when browser.”

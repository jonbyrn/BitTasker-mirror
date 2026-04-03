# Auth Plugin (customAuthPlugin) Recommendations

Recommendations are ordered by **impact** (highest first), then **ease of fix** (easiest first). Each has a **confidence** (0–1) and a **single recommended approach** that is comprehensive and defensive. The plugin lives in `src/lib/utils/houdini/plugins/customAuthPlugin.ts`; auth state is in `src/lib/stores/auth.store.ts`.

---

## 1. Stale token cache (plugin never sees post-login token)

| Impact | Ease   | Confidence |
| ------ | ------ | ---------- |
| High   | Medium | 0.92       |

**Problem:** `cachedToken` is set only at plugin init. Login uses `authState.setupAuthData()` and writes the new token to Preferences; the plugin never re-reads it, so GraphQL keeps sending no token or an old one until full reload.

**Recommendation (single approach):** Treat the plugin as a consumer of a single source of truth. After every successful write of the access token to Preferences (in `authState.setupAuthData` and in `TokenManager.setToken`), either:

- **Preferred:** Expose a small API from the plugin (e.g. `syncTokenFromPreferences()`) that (1) reads the current token from Preferences and (2) updates the plugin’s in-memory `cachedToken`. Call this from `authState.setupAuthData` immediately after `Preferences.set(ACCESS_TOKEN)`, and from `TokenManager.setToken` after its `Preferences.set`. Use a single shared token-read path (e.g. the same `Preferences.get(ACCESS_TOKEN)` the plugin already uses) so there is one definition of “current token.” Defensively: if the sync read fails, log and leave cache unchanged so existing behavior is preserved; do not throw so login flow is not broken.

This keeps the plugin’s cache in sync with Preferences without changing where the token is stored and gives a single, defensive sync point for all token updates.

---

## 2. `end` hook: resolve(ctx) can be skipped if cleanup throws

| Impact | Ease | Confidence |
| ------ | ---- | ---------- |
| High   | Easy | 0.95       |

**Problem:** In the `end` hook, if `Preferences.remove`, the dynamic import, or `authState.logout()` throws, `resolve(ctx)` is never called, so the request can hang or leave the client in an inconsistent state.

**Recommendation (single approach):** Wrap the whole `end` handler body in try/finally. In the try block: compute `shouldRedirect`, perform logout and token clear, and set `shouldRedirect` as today. In the finally block: always call `resolve(ctx)` (unconditionally). After the finally block, if `shouldRedirect` is true, call `goto('/auth/login')`. Never perform redirect or other side effects inside the finally block so that resolve is guaranteed and redirect only runs when intended. Defensively: inside the try, catch errors from `Preferences.remove` and `authState.logout()`; log them; still set `shouldRedirect` so the user is sent to login even when cleanup partially fails.

---

## 3. Headers merge can drop headers when fetchParams.headers is a Headers instance

| Impact | Ease | Confidence |
| ------ | ---- | ---------- |
| Medium | Easy | 0.88       |

**Problem:** Code does `...(ctx.fetchParams?.headers || {})`. If `ctx.fetchParams.headers` is a `Headers` instance, spreading it yields nothing useful and existing headers can be lost.

**Recommendation (single approach):** Normalize to a plain object once at the start of the header merge. Define a small helper, e.g. `headersToObject(headers: Headers | Record<string, string> | undefined): Record<string, string>`, that (1) if undefined/null, returns `{}`; (2) if a `Headers` instance, iterates with `headers.entries()` and builds an object; (3) otherwise returns a shallow copy of the object. In `beforeNetwork`, compute `const existing = headersToObject(ctx.fetchParams?.headers)` and then merge: `headers: { ...existing, ...(cachedToken && { Authorization: ... }), ...(cachedDeviceId && { 'X-Device-ID': ... }) }`. Use that merged object for `ctx.fetchParams.headers` so both object and Headers inputs are handled defensively without changing behavior when headers are already a plain object.

---

## 4. Auth error detection too strict (missed logouts)

| Impact | Ease | Confidence |
| ------ | ---- | ---------- |
| Medium | Easy | 0.85       |

**Problem:** Only errors with `extensions.code === 'UNAUTHENTICATED'` and `extensions.originalError.statusCode === 401` trigger logout and redirect. Other auth-failure shapes (e.g. 401 without that exact code, or a generic “session invalid” code) do not, so the user can stay in an authenticated UI with invalid credentials.

**Recommendation (single approach):** Treat any 401 on the response as sufficient to trigger the same logout/redirect flow, while still only acting on GraphQL errors that look auth-related. In the `end` hook, (1) keep looking for an error with `extensions?.code === 'UNAUTHENTICATED'` and `originalError?.statusCode === 401`; and (2) additionally, if no such error was found, check whether the response or value indicates a 401 (e.g. from the transport or from another error shape). If either (1) or (2) is true, run the same cleanup (clear plugin token, remove ACCESS_TOKEN from Preferences, call `authState.logout()`) and set `shouldRedirect`; then in finally call `resolve(ctx)` and, after it, redirect if `shouldRedirect`. Use a single helper, e.g. `isAuthFailure(value, errors)`, that returns true when either the existing condition or the 401 fallback is met, so the rest of the hook stays simple and defensive against multiple backend shapes.

---

## 5. Device ID init has no retry

| Impact     | Ease   | Confidence |
| ---------- | ------ | ---------- |
| Low–Medium | Medium | 0.78       |

**Problem:** If `getDeviceIdentifier()` fails (e.g. transient storage or device API failure), the plugin never retries, so X-Device-ID may be missing for the whole session.

**Recommendation (single approach):** Add a single retry with backoff only for the device-ID path. After the first failure, schedule one retry (e.g. after 2–3 seconds) by calling `getDeviceIdentifier()` again; on success, set `cachedDeviceId` and do not retry again. Cap at one retry so the plugin does not spin indefinitely. Log the first failure and, if the retry also fails, log again and leave `cachedDeviceId` null. Do not block or await this in `beforeNetwork`; keep device ID fire-and-forget so request latency is unchanged. Defensively: wrap both the initial and retry calls in try/catch so a second failure does not throw and only logging is affected.

---

## 6. Single source of truth for token (plugin vs auth store)

| Impact | Ease | Confidence |
| ------ | ---- | ---------- |
| Medium | Hard | 0.82       |

**Problem:** The token is written in both `authState.setupAuthData` and `TokenManager.setToken`; the plugin keeps its own cache and only reads at init (and, if recommendation 1 is done, on explicit sync). Having multiple writers and a cache that can go stale increases the chance of bugs and makes behavior harder to reason about.

**Recommendation (single approach):** Establish Preferences as the single source of truth and the plugin as a reader that refreshes from it at defined points. (1) Implement recommendation 1 so that after every token write (setupAuthData and TokenManager.setToken), the plugin’s cache is synced from Preferences. (2) Do not add a separate “token store” in the plugin; keep only `cachedToken` as a cache that is updated from Preferences on init and on every write. (3) In the plugin, the only place that ever writes the token to storage should be via the existing callers (auth store and TokenManager); the plugin itself should never write Preferences for the token, only read and cache. (4) Optionally, have TokenManager.setToken call the same sync function after Preferences.set so that any caller (tests or future code) that uses TokenManager also keeps the plugin in sync. This yields one source of truth (Preferences), one sync path (read into plugin cache after writes), and defensive behavior without a larger refactor.

---

## Summary order (by impact, then ease)

| #   | Item                   | Impact  | Ease   | Confidence |
| --- | ---------------------- | ------- | ------ | ---------- |
| 1   | Stale token cache      | High    | Medium | 0.92       |
| 2   | end hook resolve       | High    | Easy   | 0.95       |
| 3   | Headers merge          | Medium  | Easy   | 0.88       |
| 4   | Auth error detection   | Medium  | Easy   | 0.85       |
| 5   | Device ID retry        | Low–Med | Medium | 0.78       |
| 6   | Single source of truth | Medium  | Hard   | 0.82       |

Implementing 1 and 2 first gives the largest impact with high confidence; 3 and 4 are quick, defensive improvements; 5 and 6 can follow as capacity allows.

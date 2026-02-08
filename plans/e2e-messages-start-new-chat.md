# Plan: E2E test – Messages “start new chat” (Nostr user → search signup user → open chat)

**Status:** Implemented  
**Goal:** Add an E2E test that logs in as the Nostr user, navigates to Messages, starts a new message, searches for the signup user by username, selects them from results, and opens the chat.

---

## 1. Context

- **E2E pipeline:** [docs/testing/e2e-testing.md](../docs/testing/e2e-testing.md) – Run order: 01 (creates credentials) → then 02, 03, and any new specs. Use `npm run test:e2e`.
- **Credentials file:** `tests/e2e/.auth/webauthn-credentials.json` – Two users: `signup` (e2e-* username) and `nostr`. Each credential has `userName` / `userDisplayName` in the form `username@bittasker.com` (e.g. `e2e-1770578988937@bittasker.com`).
- **Post-login pattern:** [tests/e2e/03-wallet-post-login.spec.ts](../tests/e2e/03-wallet-post-login.spec.ts) uses the `passkey-auth-from-file` fixture with `credentialLabel` to get an already-logged-in page.
- **Account creation:** [docs/testing/e2e-account-creation.md](../docs/testing/e2e-account-creation.md) – Signup user gets a unique username like `e2e-${Date.now()}`; Nostr user is created in a second test. Credentials are written with labels `signup` and `nostr`.

---

## 2. Scope

- **Actor:** Nostr user (logged in via passkey from file).
- **Flow:** Navigate to Messages → open “New message” modal → type signup user’s **username only** (no `@bittasker.com`) → wait for search results → select that user → click “Chat” → assert navigation to `/dashboard/messages/to/<pubkey>`.
- **Out of scope:** Sending a message, conversation list assertions, or multi-device sync.

---

## 3. Dependencies and assumptions

| Dependency | Notes |
|------------|--------|
| **Credentials file** | Must exist (run 01 first). Signup user’s `userName` in file = `e2e-<ts>@bittasker.com`; we use the part before `@bittasker.com` for search. |
| **Nostr relay** | Messages page searches by username via `VITE_NOSTR_RELAY_URL`. The signup user’s Nostr profile (kind 0) must be published with a name that matches their username so they appear in search. E2E/CI must have relay reachable if we rely on real search. |
| **Backend** | Not required for this test after login; only passkey login and frontend messaging UI. |

---

## 4. Implementation plan

### 4.1 Credentials: get signup username (no domain)

- **Where:** `tests/e2e/utils/webauthn-credentials.ts`
- **What:** Add a small helper that returns the “username” part for a given label (e.g. strip `@bittasker.com` from the first credential’s `userName`), so the test does not hardcode the format.
- **Example:** `getUsernameForLabel('signup')` → `e2e-1770578988937` (or `null` if missing).

### 4.2 New spec file

- **Path:** `tests/e2e/04-messages-start-new-chat.spec.ts` (or similar; keep numbering consistent with existing 01–03).
- **Fixture:** `passkey-auth-from-file` with `test.use({ credentialLabel: 'nostr' })`.
- **Skip when file missing:** Same pattern as 03: `test.skip(() => !webauthnCredentialsFileExists(), CREDENTIALS_MISSING_MESSAGE)`.

### 4.3 Test steps

1. **Login:** Use `authenticatedPageFromPasskeyFile` (Nostr user already on dashboard).
2. **Go to Messages:** `page.goto('/dashboard/messages', { waitUntil: 'load' })` and wait for stable state (e.g. `networkidle` or a visible messages UI element).
3. **Open “New message” modal:** Click the “New Message” button (e.g. `getByRole('button', { name: /New Message/i })` or i18n-aware / `data-testid` if we add one).
4. **Ensure modal is open:** Assert modal is visible (e.g. heading “Start New Message” or input for recipient).
5. **Type signup username:** Get signup username via the new helper (e.g. `getUsernameForLabel('signup')`). Fill the recipient input (`#recipient-pubkey` or label “Recipient (npub or username)”) with that username **only** (no `@bittasker.com`).
6. **Wait for search results:** App debounces 500 ms and queries the Nostr relay (up to ~2 s). Wait for search results to appear (e.g. “Search Results” section and at least one selectable user).
7. **Select the signup user:** Click the result that corresponds to the signup user (e.g. button with the username in the list, or first result if we know only signup matches). Use a stable selector (role + name or `data-testid` if added).
8. **Start chat:** Click the submit button labeled “Chat” (`messages.start_chat`).
9. **Assert navigation:** `expect(page).toHaveURL(/\/dashboard\/messages\/to\/[a-fA-F0-9]{64}/)` (hex pubkey in path).

### 4.4 Selectors and stability

- Prefer **role + accessible name** (e.g. `getByRole('button', { name: ... })`, `getByLabelText(...)`) so tests work with existing translations.
- **Optional:** Add `data-testid` on the “New message” button, recipient input, search result list/item, and “Chat” button in the modal if selectors are fragile (e.g. “Chat” is short and might appear in multiple places).
- **Locale:** E2E may run with a single locale; document which locale is used (e.g. in Playwright config or env) so selectors can match.

### 4.5 Flakiness and timeouts

- **Search delay:** After filling the username, wait for the search UI (e.g. “Search Results” + at least one user button) with a timeout of ~5–10 s to account for debounce and relay latency.
- **Relay unavailable:** If the relay is down or slow, the test may see “No users found” and fail. Options: (a) document that E2E requires a reachable Nostr relay, (b) add a conditional skip when relay is unreachable, or (c) later consider mocking the relay for this spec. For the initial plan, (a) is enough.

---

## 5. Docs and references

- **Update after implementation:**
  - [docs/testing/e2e-testing.md](../docs/testing/e2e-testing.md) – Add a row for the new spec in “Test Files” and mention Messages flow and Nostr user + signup username.
  - Optionally add a short **docs/testing/e2e-messages-start-new-chat.md** (same style as e2e-wallet-post-login.md) describing the flow, fixture, and relay dependency.
- **Existing:** e2e-testing.md, e2e-account-creation.md, e2e-wallet-post-login.md, passkey-auth-from-file fixture, webauthn-credentials utils.

---

## 6. Checklist (for implementation)

- [ ] Add `getUsernameForLabel(label)` (or equivalent) in `tests/e2e/utils/webauthn-credentials.ts`.
- [ ] Create `tests/e2e/04-messages-start-new-chat.spec.ts` using `passkey-auth-from-file` and `credentialLabel: 'nostr'`.
- [ ] Implement steps: login → /dashboard/messages → open modal → fill username (signup, no domain) → wait for results → select user → click Chat → assert URL.
- [ ] Run with `npm run test:e2e` (after 01) and fix any selector/timeout issues.
- [ ] Update docs/testing/e2e-testing.md (and optionally add e2e-messages-start-new-chat.md).
- [ ] Note in docs that Messages “start new chat” E2E depends on Nostr relay being reachable if using real search.

---

## 7. Optional follow-ups

- Add `data-testid` on the new-message modal elements for more stable selectors.
- Consider a dedicated doc (e.g. `e2e-messages-start-new-chat.md`) under `docs/testing/` once the test is stable.

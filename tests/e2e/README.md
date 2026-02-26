# E2E Tests (`tests/e2e`)

End-to-end tests for BitTasker use **Playwright** and depend on a **credentials file** created by the first spec. This README explains how to run tests, what utilities and fixtures are available, how to add new E2E tests, and strategies used in existing specs.

**Canonical pipeline and environment details:** [docs/testing/e2e-testing.md](../docs/testing/e2e-testing.md).

---

## 1. Test files and run order

Tests must run in order so that the credentials file exists before specs that log in with passkey.

| File                                   | Purpose                                                                                                                              | Doc                                                                              |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| **01-signup-onboarding.spec.ts**       | **Creates** two users (signup + Nostr) and writes passkey credentials to `tests/e2e/.auth/webauthn-credentials.json`. Run first.     | [e2e-account-creation.md](../docs/testing/e2e-account-creation.md)               |
| **02-credentials-login.spec.ts**       | Loads credentials from file; for each user (`signup`, `nostr`) injects passkey, logs in, asserts dashboard.                          | —                                                                                |
| **login-page.spec.ts**                 | Login page only (no credentials file): loads and shows passkey/nsec options, signup/recover links, invalid/empty nsec error, cancel. | —                                                                                |
| **03-wallet-post-login.spec.ts**       | Signup user: login → navigate to `/dashboard/wallet` → validate page loads.                                                          | [e2e-wallet-post-login.md](../docs/testing/e2e-wallet-post-login.md)             |
| **04-messages-start-new-chat.spec.ts** | Nostr user sends message to signup user; signup user opens conversation and sees same message. Requires Nostr relay.                 | [e2e-messages-start-new-chat.md](../docs/testing/e2e-messages-start-new-chat.md) |
| **wallet/balance-management.spec.ts**  | Skipped (`describe.skip`). Re-enable when wallet E2E is added.                                                                       | —                                                                                |

**Recommended:** Run the full ordered suite (credentials phase first, then the rest):

```bash
npm run test:e2e
```

**Playwright UI (pick and run tests, watch mode):**

```bash
npm run test:e2e:ui
```

This runs Playwright with `--ui` and all specs in order (`--workers=1`). Run 01 first in the UI to create the credentials file, then run any other spec. You can also pass args: `npm run test:e2e -- --ui`.

To run a subset manually (e.g. for debugging), run 01 first with **`--workers=1`**, then the others:

```bash
npx playwright test tests/e2e/01-signup-onboarding.spec.ts tests/e2e/02-credentials-login.spec.ts tests/e2e/03-wallet-post-login.spec.ts --project=chromium --workers=1
```

**Environment:** Set **VITE_API_URL** (and **VITE_E2E_TURNSTILE_BYPASS** if you start the dev server yourself). See [docs/testing/e2e-testing.md](../docs/testing/e2e-testing.md) for the full list. Locally, Playwright can start the dev server; in CI it runs build + preview.

### Browser support: Chromium required for passkey tests

Tests that use **passkey/WebAuthn** (signup, onboarding, login with passkey) rely on Chrome DevTools Protocol (CDP) to simulate virtual authenticators. CDP is **Chromium-only**, so:

- **Chromium** and **Mobile Chrome**: Passkey tests run normally.
- **Firefox**, **WebKit**, **Mobile Safari**: These tests are **automatically skipped** with a clear message. No action needed.

If you run the full suite across all browsers, you'll see passkey tests pass on Chromium and skip on others. To run only Chromium (faster when developing passkey flows):

```bash
npx playwright test tests/e2e/01-signup-onboarding.spec.ts --project=chromium --workers=1
```

---

## 2. Documentation index

| Document                                                                                      | Purpose                                                                             |
| --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| [docs/testing/e2e-testing.md](../docs/testing/e2e-testing.md)                                 | Pipeline: test files, credentials file, fixtures, run order, env vars, how to run.  |
| [docs/testing/e2e-account-creation.md](../docs/testing/e2e-account-creation.md)               | Account creation E2E: Turnstile, WebAuthn, backend requirements and implementation. |
| [docs/testing/e2e-wallet-post-login.md](../docs/testing/e2e-wallet-post-login.md)             | Wallet post-login flow and validation.                                              |
| [docs/testing/e2e-messages-start-new-chat.md](../docs/testing/e2e-messages-start-new-chat.md) | Messages E2E: send/receive flow, Nostr relay, username lookup.                      |
| [docs/README.md](../docs/README.md)                                                           | Full docs index (testing, CI, etc.).                                                |
| [MIGRATION.md](./MIGRATION.md)                                                                | Migration notes from `src/` E2E.                                                    |

---

## 3. Utilities

### `utils/webauthn-credentials.ts`

Manages the credentials file `tests/e2e/.auth/webauthn-credentials.json` (gitignored).

| Function                                 | Purpose                                                                                                                                                    |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getWebAuthnCredentialsPath()`           | Path to the credentials file.                                                                                                                              |
| `webauthnCredentialsFileExists()`        | Returns true if the file exists. Use in `test.skip(() => !webauthnCredentialsFileExists(), '...')` so specs that need credentials skip when 01 hasn’t run. |
| `readCredentialSet(label)`               | Read credentials for one user by label (`'signup'`, `'nostr'`). Returns `WebAuthnCredential[]` or null.                                                    |
| `readFirstCredentialSet()`               | First credential set in the file.                                                                                                                          |
| `getCredentialSetLabels()`               | All labels in the file (for dynamic iteration; note: at load time file may not exist).                                                                     |
| `getUsernameForLabel(label)`             | Username part for a label (e.g. strips `@bittasker.com` from stored `userName`). Use when the UI searches by username (e.g. Messages “recipient”).         |
| `writeCredentialSet(label, credentials)` | Write or replace one set; merges with existing sets. Used by the signup-login-auth fixture teardown.                                                       |

**Types:** `WebAuthnCredential`, `CredentialSet`, `WebAuthnCredentialsFile` are exported for fixtures and type-safe usage.

### `utils/auth-helpers.ts`

**AuthHelper** (and `createAuthHelper(page)`) provides:

| Method                                | Purpose                                                           |
| ------------------------------------- | ----------------------------------------------------------------- |
| `saveAuthState()` / `loadAuthState()` | Persist/restore cookies and localStorage (e.g. `test-user.json`). |
| `AuthHelper.authStateExists()`        | Static check for saved state.                                     |
| `authenticateWithVirtualPasskey()`    | Create virtual authenticator and complete passkey login.          |
| `bypassAuthentication()`              | Set mock auth in localStorage (for non-passkey flows).            |
| `loginWithNostrKey(nsecKey?)`         | Fill nsec and submit on login page; wait for dashboard.           |
| `isAuthenticated()`                   | Heuristic check (URL + body text).                                |
| `ensureAuthenticated(method)`         | Load state or re-auth with `'virtual'`, `'nostr'`, or `'bypass'`. |
| `logout()`                            | User menu → Logout and remove saved state file.                   |

Used by the **auth** fixture. Many specs that only need “already logged in” use the **passkey-auth-from-file** fixture instead, which handles login via the credentials file.

---

## 4. Fixtures

### `fixtures/auth.ts`

- Extends Playwright’s `test` with a **virtual authenticator** (CDP WebAuthn) on the test page.
- Provides `authHelper` and `authenticatedPage` (ensures authenticated via `authHelper.ensureAuthenticated('virtual')`).
- Use when you need a generic auth fixture without the credentials file.

### `fixtures/passkey-auth-from-file.ts`

- **Use this when you need a logged-in user** and credentials already exist (e.g. from 01).
- For specs that **reuse passkeys** from `webauthn-credentials.json`.
- **Option:** `credentialLabel` (default `'signup'`). Use `test.use({ credentialLabel: 'nostr' })` to run as the Nostr user.
- **Fixture:** `authenticatedPageFromPasskeyFile` — reads credentials for `credentialLabel`, injects into a virtual authenticator, goes to `/auth/login`, clicks “Continue with passkey”, waits for dashboard, dismisses “I understand” modal, then yields the page.
- **Exports:** `webauthnCredentialsFileExists`, `getCredentialSetLabels`, `CREDENTIALS_MISSING_MESSAGE` for use in `test.skip(...)`.
- **Browser:** Skips on Firefox/WebKit (Chromium-only; CDP required).

**Pattern:** Skip when the file doesn’t exist (evaluate at runtime, after 01 has run):

```ts
test.skip(() => !webauthnCredentialsFileExists(), CREDENTIALS_MISSING_MESSAGE);
```

### `fixtures/signup-login-auth.ts`

- Used **only in 01-signup-onboarding.spec.ts** (creates users and writes credentials).
- **Browser:** Skips on Firefox/WebKit (Chromium-only; CDP required).
- Extends `fixtures/auth.ts` with:
  - **Option:** `injectWebAuthnCredentials` (default `false`). Set `test.use({ injectWebAuthnCredentials: true })` to inject credentials before the test.
  - **Per-test context**, no shared storage; teardown **exports** WebAuthn credentials from the virtual authenticator to the worker store and to the file. Label is derived from test title: “Nostr” → `'nostr'`, else `'signup'`.

So: tests that **create** users (signup, Nostr) run with empty authenticator; tests that **reuse** credentials would use `injectWebAuthnCredentials: true` (we use passkey-auth-from-file in 02/03/04 instead).

---

## 5. How to add new E2E tests

### Quick start: tests needing a logged-in user

Most feature tests (wallet, messages, profile, etc.) need a **logged-in user**. Use this pattern:

1. **Import the passkey fixture** and credentials helpers:

   ```ts
   import {
   	test,
   	expect,
   	webauthnCredentialsFileExists,
   	CREDENTIALS_MISSING_MESSAGE
   } from './fixtures/passkey-auth-from-file';
   ```

2. **Skip when credentials file is missing** (run 01 first):

   ```ts
   test.skip(() => !webauthnCredentialsFileExists(), CREDENTIALS_MISSING_MESSAGE);
   ```

3. **Pick the user** with `test.use()`:

   ```ts
   test.use({ credentialLabel: 'signup' }); // or 'nostr' for the Nostr user
   ```

4. **Use the fixture** in your test:
   ```ts
   test('my feature test', async ({ authenticatedPageFromPasskeyFile }) => {
   	const page = authenticatedPageFromPasskeyFile;
   	await expect(page).toHaveURL(/\/dashboard/); // already on dashboard
   	// ... navigate and assert
   });
   ```

The fixture logs in via passkey, dismisses the Beta modal, and hands you a page on the dashboard. **Browser note:** These tests run only on Chromium (Firefox/WebKit are skipped automatically).

---

### General steps for any new test

1. **Decide which fixture you need**

   - **Need an already-logged-in user (signup or Nostr)?** Use `fixtures/passkey-auth-from-file.ts`, and `test.use({ credentialLabel: 'signup' })` or `credentialLabel: 'nostr'`. See [Quick start](#quick-start-tests-needing-a-logged-in-user) above.
   - **Creating new users or custom auth?** Use `fixtures/signup-login-auth.ts` (01) or `fixtures/auth.ts` and implement the flow.

2. **Depend on credentials file only when necessary**

   - If the spec needs the credentials file (e.g. passkey login), skip when it’s missing:
     ```ts
     test.skip(() => !webauthnCredentialsFileExists(), CREDENTIALS_MISSING_MESSAGE);
     ```
   - Use a **function** in `test.skip()` so the condition runs at **runtime** (after 01 has created the file), not at load time.

3. **Place the spec in `tests/e2e/`**

   - Any `*.spec.ts` under `tests/e2e/` is included in phase 2 of `npm run test:e2e` (see [scripts/e2e-ordered.js](../../scripts/e2e-ordered.js)). No script change needed.

4. **Run order**

   - If the new test must run after another (e.g. “B after A”), use `test.describe.serial()` so they run in order in the same worker, or run phases manually with `--workers=1` when ordering matters.

5. **Add a feature doc if useful**
   - For non-trivial flows, add or update a doc under `docs/testing/` (e.g. `e2e-<feature>.md`) and link it from [docs/testing/e2e-testing.md](../docs/testing/e2e-testing.md) and from this README.

---

## 6. Strategies used in existing tests

Use these as patterns when writing or extending E2E tests.

### Skip when credentials file is missing (02, 03, 04)

```ts
test.skip(() => !webauthnCredentialsFileExists(), CREDENTIALS_MISSING_MESSAGE);
```

So the condition runs at **runtime**; after 01 runs, the file exists and the test is not skipped.

### Parameterize by user (02-credentials-login)

Use a **fixed list** of labels so tests are discovered at load time (file may not exist yet):

```ts
const EXPECTED_LABELS = ['signup', 'nostr'] as const;
for (const label of EXPECTED_LABELS) {
  test.describe(`user: ${label}`, () => {
    test.use({ credentialLabel: label });
    test('...', async ({ authenticatedPageFromPasskeyFile }) => { ... });
  });
}
```

### Serial send-then-receive (04-messages-start-new-chat)

Two tests must run in order: one sends a message, the other receives it. Use `test.describe.serial()` and a **module-level variable** (same worker):

```ts
let lastE2EMessageText: string | null = null;

test.describe.serial('Messages send then receive', () => {
	test('... send ...', async ({ authenticatedPageFromPasskeyFile }) => {
		const messageText = `E2E test message ${Date.now()}`;
		lastE2EMessageText = messageText;
		// ... send message ...
	});
	test('... receive ...', async ({ authenticatedPageFromPasskeyFile }) => {
		const messageText = lastE2EMessageText;
		if (!messageText) throw new Error('Run send test first.');
		// ... open conversation, assert messageText visible ...
	});
});
```

### Resolve recipient by username (04-messages-start-new-chat)

The Messages UI searches by **username** (no `@bittasker.com`). Get it from the credentials file:

```ts
import { getUsernameForLabel } from './utils/webauthn-credentials';

const signupUsername = getUsernameForLabel('signup');
if (!signupUsername) throw new Error('Signup username not found. Run 01 first.');
// then use signupUsername in the recipient search field
```

### Step log and diagnostics on failure (01-signup-onboarding)

For long flows, keep a step log and attach it (and console messages) on failure so CI artifacts are useful:

```ts
const stepLog: string[] = [];
const consoleMessages: string[] = [];
page.on('console', (msg) => {
	consoleMessages.push(`[${msg.type()}] ${msg.text()}`);
});

function e2eLog(message: string, log: string[]) {
	const line = `[E2E] ${message}`;
	log.push(line);
	console.log(line);
}

const attachDiagnostics = async (label: string) => {
	await test
		.info()
		.attach(`${label}-step-log.txt`, { body: stepLog.join('\n'), contentType: 'text/plain' });
	await test.info().attach(`${label}-console.txt`, {
		body: consoleMessages.join('\n') || '(none)',
		contentType: 'text/plain'
	});
};

// On failure in a step:
await attachDiagnostics('signup-to-onboarding-failure');
throw e;
```

### Assert flexible page states (03-wallet-post-login)

The wallet page can show “connected” (Receive/Send/Transactions) or “no wallet” (Try Again). Assert a single locator that covers both:

```ts
const walletContent = page
	.getByRole('button', { name: /Receive|Send|Transactions|Try Again/i })
	.first();
await expect(walletContent).toBeVisible({ timeout: 15_000 });
```

### Dismiss Beta Warning modal after login (passkey-auth-from-file)

The fixture dismisses the “I understand” modal after passkey login so it doesn’t block later navigations (messages, wallet). If you add a custom login path, dismiss that modal too:

```ts
const understandBtn = page.getByRole('button', { name: 'I understand', exact: true });
await understandBtn.click({ timeout: 5_000 }).catch(() => {});
```

---

## 7. Credentials file

| Item           | Details                                                           |
| -------------- | ----------------------------------------------------------------- |
| **Path**       | `tests/e2e/.auth/webauthn-credentials.json` (gitignored)          |
| **Format**     | `{ credentialSets: [ { label, credentials }, ... ], exportedAt }` |
| **Written by** | 01-signup-onboarding (fixture teardown after each user test)      |
| **Read by**    | 02, 03, 04 and the passkey-auth-from-file fixture                 |

---

## 8. References

- **E2E pipeline and env:** [docs/testing/e2e-testing.md](../docs/testing/e2e-testing.md)
- **Docs index:** [docs/README.md](../docs/README.md)
- **Ordered run script:** `scripts/e2e-ordered.js` (invoked by `npm run test:e2e`)
- **CDP WebAuthn:** [Chrome DevTools Protocol – WebAuthn](https://chromedevtools.github.io/devtools-protocol/tot/WebAuthn/)

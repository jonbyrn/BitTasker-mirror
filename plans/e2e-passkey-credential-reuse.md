# E2E Passkey Credential Reuse

**Why Test 2 (login with passkey) timed out, and how we reuse credentials across tests.**

---

## 1. What Happens When We Set Up the First Passkey

### In the app (signup flow)

1. User completes username step; app calls backend (e.g. register/check).
2. User clicks "Set up passkey" → the app calls **`navigator.credentials.create()`** (WebAuthn).
3. The **browser** talks to the **authenticator** (in E2E, the CDP virtual authenticator we attached).
4. The virtual authenticator creates a credential (key pair, credential ID, user handle, etc.) and **stores it inside that authenticator**.
5. The credential is returned to the app; the app sends it to the backend (register passkey, login). Backend stores credential ID and links it to the user/device.

### In the browser / CDP

- We attach a **virtual authenticator** via CDP: `WebAuthn.enable` then `WebAuthn.addVirtualAuthenticator`.
- That returns an **`authenticatorId`**.
- Credentials live **per authenticator**, not per browser context or origin. Each call to `addVirtualAuthenticator` creates a **new** authenticator with its **own** credential store.
- When the app calls `credentials.create()`, the credential is stored in **that** authenticator (the one attached to the current page’s CDP session).

### Why sharing context was not enough

- **Test 1**: We create **page A**, attach **authenticator A** to it, run signup → credential is stored in **authenticator A**.
- **Test 2**: We create **page B** (new page), attach **authenticator B** to it. Authenticator B is **empty**.
- The app on page B calls `credentials.get()` → only authenticator B is used → no credential → timeout or failure.

So: **same browser context does not mean same virtual authenticator.** Each new page gets a new CDP session and we add a new virtual authenticator per page. Credentials do not move between authenticators unless we copy them ourselves.

---

## 2. What We Can Inject for the Second Test

We can copy the **WebAuthn credential** from the first authenticator into the second using CDP:

| CDP method | Purpose |
|------------|--------|
| `WebAuthn.getCredentials(authenticatorId)` | Returns all credentials stored in that authenticator (credentialId, rpId, privateKey, userHandle, signCount, …). |
| `WebAuthn.addCredential(authenticatorId, credential)` | Adds a credential to the given authenticator. |

So the flow is:

1. **After Test 1** (before closing the page): call `getCredentials(authenticatorId)` for Test 1’s authenticator and store the result in a **worker-scoped** variable (or file).
2. **Before Test 2** (when creating the new page and new authenticator): for each stored credential, call `addCredential(authenticatorId, credential)` on Test 2’s authenticator.

Then Test 2’s page has an authenticator that already contains the passkey; `credentials.get()` will succeed and login can complete.

---

## 3. Implementation Approach

- **Worker-scoped credential store**: Hold the list of credentials (and optionally authenticatorId) in a fixture that lives for the whole worker.
- **Page fixture (signup-login-auth)**:
  - **Setup**: Create page → add virtual authenticator. If the worker-scoped store already has credentials (from a previous test), call `addCredential` for each so this page’s authenticator has the passkey.
  - **Teardown**: After `use(page)`, call `getCredentials(authenticatorId)` and write the result into the worker-scoped store. Then close the page.

This way:

- Test 1: creates credential → teardown exports it into the store.
- Test 2: setup reads store and injects credential into the new authenticator → login works.

The same pattern can support more tests (e.g. wallet, transactions): any test that uses this fixture and runs after signup (or after a test that has already exported credentials) will get the passkey injected.

---

## 4. Optional: Persist to File for Cross-Worker / Cross-Run Reuse

For reuse across **test files** or **runs** (e.g. wallet.spec.ts, transactions.spec.ts):

1. After signup (or a dedicated auth setup test), export credentials via `getCredentials` and write them to a file (e.g. `tests/e2e/.auth/webauthn-credentials.json`).
2. In a fixture used by those specs, before creating the page/authenticator, read the file and call `addCredential` for each credential.

That way one “create account + passkey” step can feed many specs without re-running full signup each time.

---

## 5. Cross-File Reuse (File-Based)

For reusing credentials across **test files** (e.g. wallet, dashboard specs), see **[e2e-passkey-credential-sharing-plan.md](./e2e-passkey-credential-sharing-plan.md)**. That plan describes persisting credentials to `tests/e2e/.auth/webauthn-credentials.json` and the `passkey-auth-from-file` fixture so any spec can log in with the same passkey.

---

## 6. References

- [Chrome DevTools Protocol – WebAuthn](https://chromedevtools.github.io/devtools-protocol/tot/WebAuthn/)
- [e2e-signup-onboarding-plan.md](./e2e-signup-onboarding-plan.md)
- [e2e-passkey-credential-sharing-plan.md](./e2e-passkey-credential-sharing-plan.md)
- [authentication-flow.md](../requirements/details/authentication-flow.md)

---

*Last updated: 2025-02-07*

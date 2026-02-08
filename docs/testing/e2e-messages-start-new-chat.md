# E2E Messages Start New Chat and Receive

**Goal:** (1) Nostr user starts a new chat with the signup user, sends a test message, and sees it in chat history. (2) Signup user opens messages, finds that conversation, and sees the same message.

---

## 1. Overview

| Item | Details |
|------|---------|
| **Spec** | `tests/e2e/04-messages-start-new-chat.spec.ts` |
| **Runs after** | 01-signup-onboarding (credentials file must exist) |
| **Test 1** | `credentialLabel: 'nostr'` — New message → search signup user → start chat → send message → assert in history |
| **Test 2** | `credentialLabel: 'signup'` — Messages → open conversation containing test message → assert message visible |

---

## 2. Run order (serial)

The two tests live under **`test.describe.serial('Messages send then receive', ...)`** so they always run in order: send first, then receive. That avoids a race where the receive test runs (or even starts) before the send test has finished sending the message.

## 3. Test message

The send test uses `E2E test message ${Date.now()}` and stores it in a module-level variable `lastE2EMessageText`. The receive test reads it. Because both tests run serially in the same worker, they share that value—no file or credentials lookup needed.

---

## 4. Signup username for search

The signup user’s passkey credential stores `userName` as `username@bittasker.com` (e.g. `e2e-1770578988937@bittasker.com`). The Messages UI searches by **username only** (no domain). The test uses `getUsernameForLabel('signup')` from `tests/e2e/utils/webauthn-credentials.ts` to get the username part and types that into the recipient field.

---

## 5. Nostr relay dependency

The Messages page searches for users by username via the Nostr relay (`VITE_NOSTR_RELAY_URL`). The signup user’s Nostr profile (kind 0) must be published with a matching name so they appear in search results. For the test to pass:

- The relay must be reachable from the E2E environment (local or CI).
- The signup user created in 01 must have their profile published to that relay (the app does this during onboarding).

If the relay is down or slow, the test may see “No users found” and fail.

---

## 6. Run order

```bash
npx playwright test tests/e2e/01-signup-onboarding.spec.ts tests/e2e/02-credentials-login.spec.ts tests/e2e/04-messages-start-new-chat.spec.ts --project=chromium --workers=1
```

Or use the full ordered run:

```bash
npm run test:e2e
```

---

## 7. References

- **E2E pipeline:** [e2e-testing.md](./e2e-testing.md)
- **Messages route:** `src/routes/(protected)/dashboard/messages/+page.svelte`
- **Plan (implementation):** `plans/e2e-messages-start-new-chat.md`

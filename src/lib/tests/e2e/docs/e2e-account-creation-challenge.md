# E2E Account Creation – Documentation Moved

The full documentation for the **E2E account creation challenge** and **how we implemented it** has been moved to the project root:

- **[docs/testing/e2e-account-creation.md](../../../../../docs/testing/e2e-account-creation.md)**

That document covers:

- What the app expects to create a new account (routes, Turnstile, onboarding, PasskeySetup)
- Challenges (Turnstile, WebAuthn in Playwright, backend, routes/selectors, test isolation)
- Current implementation (01-signup-onboarding, 02-credentials-login, fixtures, env, CI)
- References to plans and test READMEs

See also [docs/testing/e2e-testing.md](../../../../../docs/testing/e2e-testing.md) for the E2E pipeline and run commands.

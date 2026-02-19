# Documentation

Project documentation lives here. Long-term and canonical docs are in **`docs/`**; the **`plans/`** directory is only for temporary, in-progress plans (see `plans/README.md`).

## Index

### Testing (`docs/testing/`)

| Document                                                                 | Purpose                                                                                                                                   |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| [README.md](testing/README.md)                                           | **Testing overview:** state (what runs in CI, layout, commands), practices (policy, done, next), coverage baseline. Start here.           |
| [testing-in-ci.md](testing/testing-in-ci.md)                             | Pipeline (when jobs run, CI test set), triage and per-dir commands, how to test the pipeline, **coverage in GitLab** (widget, Cobertura). |
| [e2e-testing.md](testing/e2e-testing.md)                                 | E2E pipeline: test files (01–04), credentials file, fixtures, run order, how to run.                                                      |
| [e2e-account-creation.md](testing/e2e-account-creation.md)               | E2E account creation: challenges (Turnstile, WebAuthn, backend) and how we implemented signup/onboarding.                                 |
| [e2e-wallet-post-login.md](testing/e2e-wallet-post-login.md)             | Wallet post-login E2E: login with passkey → wallet route → validation; `performPasskeyLogin` helper.                                      |
| [e2e-messages-start-new-chat.md](testing/e2e-messages-start-new-chat.md) | Messages E2E: Nostr user starts new chat with signup user, send/receive flow, Nostr relay, username lookup.                               |

### CI/CD (`docs/ci/`)

| Document                                                              | Purpose                                                                                                |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| [workers-pipeline-migration.md](ci/workers-pipeline-migration.md)     | Migration from manual wrangler deploys to GitLab CI/CD: why, current vs target state, phases.          |
| [workers-ci-setup-walkthrough.md](ci/workers-ci-setup-walkthrough.md) | Cloudflare Workers CI/CD setup: variables, environments, steps, troubleshooting.                       |
| [pipeline-branch-strategy.md](ci/pipeline-branch-strategy.md)         | When the pipeline runs (MR vs dev/master), unit vs coverage, no feature-branch names, re-enabling E2E. |

### Authentication (`docs/auth/`)

| Document                                | Purpose                                                                                                   |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| [README.md](auth/README.md)             | **Authentication overview:** system design, dual login methods, security features, and quick start guide. |
| [architecture.md](auth/architecture.md) | System architecture: component layers, data flow, platform integration, and scalability.                  |
| [flows.md](auth/flows.md)               | Authentication flows: detailed diagrams for registration, login (passkey/nsec), and key retrieval.        |
| [encryption.md](auth/encryption.md)     | Encryption & key management: cryptographic foundations, master key derivation, AES-GCM, PBKDF2, HKDF.     |

### Other (`docs/`)

| Document                                                     | Purpose                                 |
| ------------------------------------------------------------ | --------------------------------------- |
| [gitea-to-gitlab-migration.md](gitea-to-gitlab-migration.md) | Gitea to GitLab migration (if present). |

## See also

- **Plans (WIP):** `plans/README.md` – temporary plans; canonical content is moved here when done.
- **Requirements:** `requirements/` – product/feature requirements and details.
- **E2E tests:** `tests/e2e/README.md` – how to run E2E tests.

# Documentation

Project documentation lives here. Long-term and canonical docs are in **`docs/`**; the **`plans/`** directory is only for temporary, in-progress plans (see `plans/README.md`).

## Index

### Testing (`docs/testing/`)

| Document | Purpose |
|----------|---------|
| [e2e-testing.md](testing/e2e-testing.md) | E2E pipeline: test files (01–04), credentials file, fixtures, run order, how to run. |
| [e2e-account-creation.md](testing/e2e-account-creation.md) | E2E account creation: challenges (Turnstile, WebAuthn, backend) and how we implemented signup/onboarding. |
| [e2e-wallet-post-login.md](testing/e2e-wallet-post-login.md) | Wallet post-login E2E: login with passkey → wallet route → validation; `performPasskeyLogin` helper. |
| [e2e-messages-start-new-chat.md](testing/e2e-messages-start-new-chat.md) | Messages E2E: Nostr user starts new chat with signup user, send/receive flow, Nostr relay, username lookup. |
| [pipeline-improvement.md](testing/pipeline-improvement.md) | Testing pipeline improvement: CI curated set, triage, per-directory fixing, workflow. |
| [coverage-how-it-works.md](testing/coverage-how-it-works.md) | How the GitLab coverage widget gets its data (regex + Cobertura), and what else is possible (badges, analytics, approval rules). |

### CI/CD (`docs/ci/`)

| Document | Purpose |
|----------|---------|
| [workers-pipeline-migration.md](ci/workers-pipeline-migration.md) | Migration from manual wrangler deploys to GitLab CI/CD: why, current vs target state, phases. |
| [workers-ci-setup-walkthrough.md](ci/workers-ci-setup-walkthrough.md) | Cloudflare Workers CI/CD setup: variables, environments, steps, troubleshooting. |
| [pipeline-branch-strategy.md](ci/pipeline-branch-strategy.md) | When the pipeline runs (MR vs dev/master), unit vs coverage, no feature-branch names, re-enabling E2E. |

### Other (`docs/`)

| Document | Purpose |
|----------|---------|
| [gitea-to-gitlab-migration.md](gitea-to-gitlab-migration.md) | Gitea to GitLab migration (if present). |

## See also

- **Plans (WIP):** `plans/README.md` – temporary plans; canonical content is moved here when done.
- **Requirements:** `requirements/` – product/feature requirements and details.
- **E2E tests:** `tests/e2e/README.md` – how to run E2E tests.

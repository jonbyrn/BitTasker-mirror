# Contributing to BitTasker

Thank you for contributing. This file covers development setup and **testing expectations**.

## Testing

- **Before you push or open a merge request**, run the same tests that CI runs:
  ```bash
  npm run test:ci
  ```
- **New or changed logic** in helpers, stores, API services, or critical UI should include or extend tests where practical.
- **If you change behavior and tests fail**, update or remove the tests; don’t leave them skipped without a tracked reason (e.g. in `_pending/` with a note in `src/lib/tests/_pending/README.md`).
- **E2E** is not run in CI yet; for changes that touch auth, wallet, or messages, run `npm run test:e2e` locally when you can.

**Where to look:** [Testing overview](docs/testing/README.md) describes what exists, what runs in CI, how to run tests, and team practices.

## Merge requests

- Ensure the pipeline is green before requesting review.
- In your MR description, confirm you ran `npm run test:ci` and that new/changed logic has tests (or document why not).

## Code style and quality

- TypeScript and Svelte: follow the project’s existing style.
- Lint and type-check: `npm run lint`, `npm run check`. (These are not yet required in CI but are recommended before push.)

## Further reading

- [Pipeline branch strategy](docs/ci/pipeline-branch-strategy.md) — when CI runs, cache, re-enabling E2E
- [E2E testing](docs/testing/e2e-testing.md) — Playwright specs, env vars, run order

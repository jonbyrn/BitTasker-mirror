# BitTasker unit and integration tests

Tests live under `src/lib/tests/`. Vitest is used for unit and integration tests; E2E specs are in the `e2e/` subfolder.

## Where to add tests

- **Unit tests** (pure logic, minimal mocks): add under `unit/` (`unit/helpers/`, `unit/utils/`, `unit/api/services/`, `unit/stores/`). Some tests still live at root or under `api/`, `utils/`, `stores/` until Phase 2 migration is complete.
- **Component tests** (Svelte components): `components/` with the same subfolder structure as `$lib/components/`.
- **Route / page tests**: `ci/routes/` or a dedicated `routes/` folder.
- **Integration tests** (multi-module flows): `integration/`.

Naming: `*.test.ts` for unit/component tests, `*.integration.test.ts` for integration. One test file per source module is the goal.

## Running tests

- `npm run test` or `npm run test:unit` — run all unit/integration tests (watch or single run).
- `npm run test:ci` — runs only `src/lib/tests/ci/` (used in CI).
- `npm run test:triage` — full run with results grouped by category; use to see which areas pass or fail.

## Strategy and structure

The target layout and audit results are documented in **`plans/unit-testing-strategy.md`** (Phase 1 audit done; Phase 2 in progress). When that plan is finalized, the stable parts will move to `docs/testing/`.

Do not remove or rename test files without checking the Phase 2 progress log in the plan; some tests are being reorganized in chunks.

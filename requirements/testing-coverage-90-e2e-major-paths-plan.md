# Test Coverage Expansion Plan (90% + Major-Path E2E)

## Scope and Goal

- Raise automated test coverage to **90%** (lines/statements/functions/branches for scoped application code under `src/**`, excluding tests/stories/generated/static as configured).
- Add and stabilize E2E coverage for **all major user paths**.

## Inputs Reviewed

- Canonical E2E constraints: `tests/e2e/README.md`, `docs/testing/e2e-testing.md`, `playwright.config.ts`, `scripts/e2e-ordered.js`.
- Current test inventory in `src/lib/tests/**`, `tests/e2e/**`, and reusable legacy specs in `src/lib/tests/e2e/**`.
- CI-scope run behavior (`npm run test:ci -- --coverage`): `80` passing files, `1` skipped, `1` failing (`src/lib/tests/components/contract/escrow.test.ts`, `12` failures).

## Parallel Sub-Agent Results

- **Sub-agent A (coverage gaps):** highest-risk under-tested surfaces are `src/lib/components/**`, `src/lib/utils/**`, then `src/lib/api/**` and `src/lib/nostr/**`.
- **Sub-agent B (major-path E2E gaps):** canonical E2E currently covers onboarding/login, wallet smoke, messages send/receive, and `/tasks`; many `(protected)` dashboard paths are uncovered.

## Constraints That Drive Design

- **Passkeys/WebAuthn:** Chromium/CDP-only virtual authenticator for auth setup and passkey login reuse.
- **Nostr:** relay-dependent messaging/search flows require deterministic identities and cleanup.
- **Rootstock/Ethers:** wallet/contract paths need deterministic lane + small live smoke lane.
- **Ordered auth bootstrap:** credentials-producing signup spec must run before passkey reuse specs.

## Baseline Snapshot (Required)

As of **March 2, 2026**:

- CI-scope run (`npm run test:ci -- --coverage --coverage.reporter=json-summary`) result:
  - Test files: `81 passed`, `1 skipped`, `0 failed` (`82` total).
  - Tests: `1065 passed`, `15 skipped`, `0 failed` (`1080` total).
  - Total coverage baseline:
    - `lines`: `22.52%`
    - `statements`: `22.52%`
    - `functions`: `37.62%`
    - `branches`: `67.54%`
- Baseline source artifact: `coverage/coverage-summary.json`.
- Deterministic E2E baseline snapshot (10 repeated runs): **TODO (pending capture).**
- Flaky deterministic E2E test count (10 repeated runs): **TODO (pending capture).**

### Baseline Capture Commands (Phase 1 completion criteria)

- `npm run test:ci -- --coverage --coverage.reporter=json-summary`
- `npm run test:e2e`

### Top 20 Uncovered Files (by uncovered lines, March 2, 2026)

| File                                                               | Uncovered Lines | Lines % | Statements % | Functions % | Branches % |
| ------------------------------------------------------------------ | --------------: | ------: | -----------: | ----------: | ---------: |
| `src/routes/npub/[npub]/+page.svelte`                              |            1195 |    0.00 |         0.00 |        0.00 |       0.00 |
| `src/lib/components/maps/TaskLocationMap.svelte`                   |             983 |    0.00 |         0.00 |        0.00 |       0.00 |
| `src/routes/(protected)/dashboard/task/[taskId]/bids/+page.svelte` |             834 |    0.00 |         0.00 |        0.00 |       0.00 |
| `src/lib/components/wallet/ReceivePaymentForm.svelte`              |             799 |    0.00 |         0.00 |        0.00 |       0.00 |
| `src/lib/components/messages/ChatView.svelte`                      |             712 |    0.00 |         0.00 |        0.00 |       0.00 |
| `src/routes/auth/recover/[npub]/+page.svelte`                      |             677 |    0.00 |         0.00 |        0.00 |       0.00 |
| `src/lib/utils/escrow/v1/escrow.ts`                                |             661 |   20.16 |        20.16 |       29.41 |      62.96 |
| `src/lib/nostr/profile.ts`                                         |             644 |    0.00 |         0.00 |      100.00 |     100.00 |
| `src/lib/components/EnhancedLocationPicker.svelte`                 |             631 |    0.00 |         0.00 |        0.00 |       0.00 |
| `src/lib/components/contracts/DebugContractCard.svelte`            |             575 |    0.00 |         0.00 |        0.00 |       0.00 |
| `src/routes/(protected)/dashboard/find-tasks/+page.svelte`         |             546 |    0.00 |         0.00 |        0.00 |       0.00 |
| `src/lib/components/contracts/ContractActions.svelte`              |             529 |    0.00 |         0.00 |        0.00 |       0.00 |
| `src/lib/utils/escrow/v1/nostrContract.ts`                         |             518 |   10.68 |        10.68 |        0.00 |     100.00 |
| `src/routes/(protected)/dashboard/messages/+page.svelte`           |             478 |    0.00 |         0.00 |        0.00 |       0.00 |
| `src/lib/components/wallet/SubmarineSend.svelte`                   |             445 |    0.00 |         0.00 |        0.00 |       0.00 |
| `src/lib/components/BottomNavBar.svelte`                           |             426 |    0.00 |         0.00 |        0.00 |       0.00 |
| `src/lib/api/services/push-notification.service.ts`                |             421 |   13.90 |        13.90 |        6.06 |      66.66 |
| `src/lib/components/wallet/BalanceChartModal.svelte`               |             393 |    0.00 |         0.00 |        0.00 |       0.00 |
| `src/lib/utils/nostr-message.ts`                                   |             371 |   39.96 |        39.96 |       70.00 |      60.37 |
| `src/lib/components/task/TaskDetailsView.svelte`                   |             370 |    0.00 |         0.00 |        0.00 |       0.00 |

## Prioritized Plan (Impact First, Ease Second)

### 1. Stabilize baseline and gates

**Impact:** Very High | **Ease:** High

- Fix escrow test/runtime contract-address assumptions (`src/lib/tests/components/contract/escrow.test.ts` and its env/mocking boundary).
- Enforce test discovery boundaries to avoid non-project tests.
- Add explicit coverage thresholds in Vitest (ramp below).
- Standardize CI commands and artifact generation.

**Deliverables**

- Green CI-scope baseline.
- Reliable coverage artifacts per MR.

### 2. Expand high-risk unit/component coverage

**Impact:** Very High | **Ease:** Medium

- Add branch-heavy tests for:
  - Wallet components/utilities (fee/address/network/tx status/failure paths).
  - Escrow/contract lifecycle and state transitions.
  - Nostr message/task/profile helpers and relay failure paths.
  - API service resilience (timeouts, malformed payloads, retries, fallback).

**Deliverables**

- Coverage uplift focused on `components`, `utils`, `api`, `nostr`.

### 3. Build complete major-path E2E matrix in `tests/e2e`

**Impact:** Very High | **Ease:** Medium

- Implement deterministic E2E for all core protected flows.
- Add targeted live smoke tests for external dependency integration.

**Deliverables**

- Route-to-spec map fully implemented and passing.

### 4. Migrate and harden reusable legacy E2E assets

**Impact:** High | **Ease:** High

- Migrate useful wallet/auth flows from `src/lib/tests/e2e/**` into canonical fixtures.
- Replace brittle selectors with `data-testid` and role-based locators.

**Deliverables**

- Faster implementation with lower flake rates.

### 5. Deterministic dependency harness

**Impact:** High | **Ease:** Medium

- Nostr test relay namespace, fixed test identities, deterministic seed data, cleanup hooks.
- Rootstock deterministic lane: transaction/RPC stubbing for most E2E.
- Rootstock live smoke lane: minimal assertions against real network.
- Passkey harness: preserve credentials-file workflow with stronger diagnostics.

**Deliverables**

- External dependency volatility removed from deterministic lane.

### 6. CI orchestration and release controls

**Impact:** High | **Ease:** Medium

- Two lanes:
  - Fast lane: unit/integration/components + deterministic E2E.
  - Slow lane: live-network smoke E2E.
- Flake quarantine + retry policy + ownership.
- Merge blocking on threshold and deterministic major-path health.

**Deliverables**

- Predictable CI signal and enforceable quality gates.

## Route-to-Spec Matrix (Major Paths)

| Path                                                      | Priority | Planned Spec File                                       | Lane                       | Fixture/Auth             | Required Negative Case                  |
| --------------------------------------------------------- | -------- | ------------------------------------------------------- | -------------------------- | ------------------------ | --------------------------------------- |
| `/auth/signup` + `/auth/onboarding`                       | P0       | `tests/e2e/01-signup-onboarding.spec.ts` (extend)       | Deterministic              | `signup-login-auth`      | passkey setup failure + recovery branch |
| `/auth/login`                                             | P0       | `tests/e2e/02-credentials-login.spec.ts` (extend)       | Deterministic              | `passkey-auth-from-file` | missing credentials + non-chromium skip |
| `/dashboard`                                              | P0       | `tests/e2e/dashboard-home.spec.ts`                      | Deterministic              | passkey auth             | auth-guard redirect                     |
| `/dashboard/find-tasks`                                   | P0       | `tests/e2e/find-tasks.spec.ts`                          | Deterministic              | passkey auth             | empty/failed fetch state                |
| `/dashboard/create-task`                                  | P0       | `tests/e2e/create-task.spec.ts`                         | Deterministic              | passkey auth             | validation error per step               |
| `/dashboard/task/[taskId]`                                | P0       | `tests/e2e/task-detail.spec.ts`                         | Deterministic              | passkey auth             | missing task / 404-like state           |
| `/dashboard/task/[taskId]/bids`                           | P0       | `tests/e2e/task-bids.spec.ts`                           | Deterministic              | passkey auth             | invalid bid / permission denial         |
| `/dashboard/messages` + `/dashboard/messages/to/[pubkey]` | P0       | `tests/e2e/04-messages-start-new-chat.spec.ts` (extend) | Deterministic + Live smoke | passkey auth + nostr     | relay unavailable handling              |
| `/dashboard/wallet`                                       | P0       | `tests/e2e/wallet-*.spec.ts` (migrated set)             | Deterministic + Live smoke | passkey auth             | insufficient funds/network failure      |
| `/dashboard/profile` + `/dashboard/profile/edit`          | P1       | `tests/e2e/profile-edit.spec.ts`                        | Deterministic              | passkey auth             | invalid profile input                   |
| `/dashboard/settings`                                     | P1       | `tests/e2e/settings.spec.ts`                            | Deterministic              | passkey auth             | device/session revoke failure           |
| `/dashboard/bids`                                         | P1       | `tests/e2e/dashboard-bids.spec.ts`                      | Deterministic              | passkey auth             | empty/error list                        |

## Deterministic Harness Contract

### Nostr

- Dedicated relay endpoint for tests.
- Deterministic test keys (`signup`, `nostr`) with namespaced metadata.
- Cleanup routine after each run for created test events.

### Rootstock/Ethers

- Deterministic lane stubs:
  - fee estimation
  - tx submission response
  - tx receipt/status transitions
  - explorer links
- Live smoke lane:
  - one send-like or read-only wallet/contract check with minimal assertions.

### Passkeys

- Keep ordered credentials creation + reuse file.
- Diagnostics on failure: step log, console log, network trace, screenshot/video on retry.

## Coverage Ramp + Phase Gates

### Milestone 1 (Target: stabilize and hold >=80%)

- Gates:
  - escrow baseline failures resolved.
  - deterministic E2E suite pass rate >=95% over 10 runs.
  - coverage artifacts generated in CI.

### Milestone 2 (Target: >=85%)

- Gates:
  - `lines/statements/functions >=85%`, `branches >=80%`.
  - top 20 uncovered files reduced by >=35% uncovered lines from baseline.

### Milestone 3 (Target: >=90%)

- Gates:
  - `lines/statements/functions >=90%`, `branches >=85%`.
  - all P0 route specs passing in deterministic lane.

### Milestone 4 (Target: sustain >=90%)

- Gates:
  - no regression below threshold for 4 consecutive weeks.
  - flaky test rate <2% in deterministic lane.

## Additional Required Enablers

- Normalize `data-testid` on major flow elements.
- Standardize test data factories (users/tasks/contracts/messages).
- Add route-to-spec matrix maintenance rule in `docs/testing`.
- Document deterministic vs live lanes and when each is required in CI.

## App-Code Fix Policy During Test Expansion

- Apply app-code fixes only when complexity is low and blast radius is minimal. Report complex issues that were not resolved.
- Prioritize fixes that unblock baseline stability (current priority: escrow contract-address/env assumptions in CI tests).

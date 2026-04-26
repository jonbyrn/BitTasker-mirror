# Services Escrow V2 (NDK) Porting Checklist

This document catalogs all service-related code that exists in the current escrow v1 implementation and needs to be ported to the new NDK-based contract implementation (escrow v2/contract folder).

## Overview

The `feat/find-services` feature branch added extensive service-related functionality to the escrow v1 implementation. After the rebase, this code needs to be migrated to work with the new NDK-based contract system.

## Current State

### NDK Integration Status

- ✅ `DashboardContractsPanelNDK` is now wired in `dashboard/+page.svelte`
- ⚠️ `DashboardContractsPanelNDK` is not yet wired to `dashboard/earning/+page.svelte`
- ⚠️ Service-related features are NOT yet ported to NDK components
- ⚠️ E2E test harness (`e2e/service-harness.html/+page.svelte`) still uses old `DashboardContractsPanel`

---

## Service-Related Components to Port

### 1. Contract Context Components (HIGH PRIORITY)

These components handle service-specific context display in contracts:


| Component                          | Path                                                            | Purpose                                                              | NDK Status   |
| ---------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------- | ------------ |
| `ContractContextSummary.svelte`    | `src/lib/components/contracts/ContractContextSummary.svelte`    | Displays context (task vs service) summary in contract cards/drawers | ❌ Not ported |
| `ServiceAgreementSummary.svelte`   | `src/lib/components/contracts/ServiceAgreementSummary.svelte`   | Shows service agreement details (tier, deliverables, add-ons, etc.)  | ❌ Not ported |
| `ContractFundingWalletCard.svelte` | `src/lib/components/contracts/ContractFundingWalletCard.svelte` | Service funding wallet display                                       | ❌ Not ported |
| `ContractInitiationDrawer.svelte`  | `src/lib/components/contracts/ContractInitiationDrawer.svelte`  | Service contract initiation flow                                     | ❌ Not ported |


### 2. Contract Action Buttons (MEDIUM PRIORITY)

Modular action buttons added for service contracts:


| Component                                 | Path                                                                   | Purpose                   |
| ----------------------------------------- | ---------------------------------------------------------------------- | ------------------------- |
| `actions/ContractActionBar.svelte`        | `src/lib/components/contracts/actions/ContractActionBar.svelte`        | Action bar container      |
| `actions/AcceptContractButton.svelte`     | `src/lib/components/contracts/actions/AcceptContractButton.svelte`     | Accept service contract   |
| `actions/CancelContractButton.svelte`     | `src/lib/components/contracts/actions/CancelContractButton.svelte`     | Cancel service contract   |
| `actions/CompleteContractButton.svelte`   | `src/lib/components/contracts/actions/CompleteContractButton.svelte`   | Complete service contract |
| `actions/DisputeContractButton.svelte`    | `src/lib/components/contracts/actions/DisputeContractButton.svelte`    | Dispute service contract  |
| `actions/ResolutionProposalButton.svelte` | `src/lib/components/contracts/actions/ResolutionProposalButton.svelte` | Propose resolution        |


### 3. Modified Contract Components (HIGH PRIORITY)

These existing components were heavily modified for service support:


| Component                        | Key Service Additions                                                                                                                                                      |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DashboardContractsPanel.svelte` | - Service type filter (`initialType: 'services'`) - Service filter dropdown (`showServiceFilter`) - Service-specific highlight handling - Type filter (tasks/services/all) |
| `ContractCard.svelte`            | - `ContractContextSummary` integration - Service badge display - Quick action visibility for services                                                                      |
| `ContractDrawer.svelte`          | - Service location display - Service agreement snapshot - Bid content translation - Service listing links                                                                  |
| `ContractActions.svelte`         | - `ContractActionBar` integration - Individual action button components - Offline handling - Stale action notices                                                          |
| `TaskCompletionModal.svelte`     | - Service context awareness - Different labels for service completion                                                                                                      |


---

## Service Contract Utilities to Port

### 1. Core Service Contract Utilities (`src/lib/utils/service-contract/`)


| File                            | Purpose                                                         | Dependencies              |
| ------------------------------- | --------------------------------------------------------------- | ------------------------- |
| `context-presentation.ts`       | Build presentation data from contract context (task vs service) | `ContractWithEvents` type |
| `location.ts`                   | Service contract location handling                              | Agreement snapshot types  |
| `dashboard-link.ts`             | Build dashboard links for service contracts                     | Contract context types    |
| `pending-navigation.ts`         | Handle pending service contract navigation                      | Session storage           |
| `preflight.ts`                  | Service contract preflight checks                               | Escrow operations         |
| `preflight-feedback.ts`         | User feedback for preflight failures                            | UI state                  |
| `active-contracts.ts`           | Track active service contracts                                  | Contract store            |
| `create.ts`                     | Service contract creation                                       | Escrow v1 operations      |
| `create-from-snapshot.ts`       | Create contract from agreement snapshot                         | Agreement types           |
| `recover.ts`                    | Service contract recovery                                       | Escrow operations         |
| `recover-quote-acceptance.ts`   | Recover quote acceptance state                                  | Quote store               |
| `reconcile-quote-acceptance.ts` | Reconcile quote acceptance with contracts                       | Quote/Contract stores     |
| `schedule.ts`                   | Service scheduling utilities                                    | Time calculations         |
| `acceptance-snapshot.ts`        | Service acceptance snapshots                                    | Agreement types           |
| `finality.ts`                   | Contract finality checks                                        | Status types              |
| `ambiguity-reason.ts`           | Contract ambiguity detection                                    | Contract types            |
| `book-now-outbox.ts`            | Book-now order outbox                                           | Order types               |
| `await-contract-creation.ts`    | Wait for contract creation confirmation                         | Async utilities           |


### 2. Service Quote Utilities (`src/lib/utils/service-quote/`)


| File                   | Purpose                                               |
| ---------------------- | ----------------------------------------------------- |
| `accept.ts`            | Quote acceptance logic                                |
| `publish.ts`           | Quote publishing                                      |
| `protocol.ts`          | Service quote protocol (event kinds 6420, 6421, 6422) |
| `resolver.ts`          | Quote resolution                                      |
| `notifications.ts`     | Quote notifications                                   |
| `dashboard-route.ts`   | Dashboard routing for quotes                          |
| `acceptance-ledger.ts` | Track quote acceptance state                          |
| `agreement-summary.ts` | Build agreement summary                               |


### 3. Service Instant-Buy Utilities (`src/lib/utils/service-instant-buy/`)


| File        | Purpose                      |
| ----------- | ---------------------------- |
| `create.ts` | Instant-buy service creation |


---

## Escrow V1 Service Extensions

### Files with Service Logic in `src/lib/utils/escrow/v1/`


| File               | Service-Related Code                                                                                                       |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `escrowEvents.ts`  | - `contractCreationStore` - `reverifyPublishedServiceAcceptanceByEscrowId()` - `retryPendingServiceAcceptanceByEscrowId()` |
| `nostrContract.ts` | - Service context handling in Nostr event creation - `contextType` field support                                           |
| `escrow.ts`        | - Service contract creation flow - Service-specific validation                                                             |


---

## Type Definitions to Review

### Contract Types (`src/lib/types/contract.d.ts`)

Service-related type additions:

- `ServiceContractAgreementSnapshot`
- `ServiceContractPricingSnapshot`
- `contextType` field in `ContractEventContent`
- `serviceId` field
- `agreementSnapshot` field
- `purchaseMode` field

### Service Quote Types (`src/lib/types/service-quote.d.ts`)

Full type definitions for the service quote protocol.

---

## Store Updates Needed

### 1. `contract.store.ts`

Currently uses `escrow.contractOps` for all operations. Needs to support:

- Service type filtering
- Service context in contract display
- Service-specific loading logic

### 2. `service-quote-ui.store.ts`

UI state management for service quotes. May need integration with NDK contract runes.

---

## Migration Strategy

### Phase 1: Core NDK Display (COMPLETED)

- Wire `DashboardContractsPanelNDK` to main dashboard

### Phase 2: Service Context Display (TODO)

- Refactor earning page to be wired with `DashboardContractsPanelNDK`  
- Port `ContractContextSummary` logic to work with `PaymentContractRune`
- Add service context to `ContractCardNDK`
- Add service context to `ContractDrawerNDK`

### Phase 3: Service Filters (TODO)

- Add type filter (tasks/services/all) to `DashboardContractsPanelNDK`
- Add service filter dropdown
- Port highlight handling for service contracts

### Phase 4: Service Actions (TODO)

- Evaluate if action buttons should be ported or if `ContractActionsNDK` covers needs
- Port service-specific action logic to lifecycle implementations

### Phase 5: Service Agreement Display (TODO)

- Port `ServiceAgreementSummary` to work with NDK contracts
- Add agreement snapshot support to NDK contract types

### Phase 6: Service Creation Flow (TODO)

- Evaluate if `BidAcceptanceFormV2` covers service contract creation
- Port service-specific contract creation if needed

---

## Testing Considerations

### E2E Test Harness

The `src/routes/e2e/service-harness.html/+page.svelte` file uses the old `DashboardContractsPanel` for testing service contracts. Test cases include:

- `contracts-surface-highlighted-service`
- `contracts-surface-stale-data`
- `contracts-surface-completable-service`

These tests will need to be ported to use `DashboardContractsPanelNDK` once service features are migrated.

### Unit/Integration Tests

Files requiring review after migration:

- `src/lib/tests/components/contract/ContractCard.service-context.test.ts`
- `src/lib/tests/components/contract/ContractDrawer.service-context.test.ts`
- `src/lib/tests/components/contract/ContractActions.service-notification.test.ts`
- `src/lib/tests/components/contract/TaskCompletionModal.service-context.test.ts`
- `src/lib/tests/integration/contracts/service-contract-notifications.integration.test.ts`
- `src/lib/tests/integration/contracts/task-service-actions-parity.integration.test.ts`

---

## Key Architectural Decisions

### 1. Context Type Handling

Current approach: `contextType` field in contract event content (`'task'` or `'service'`)

NDK approach: Should be handled via:

- `NDKPaymentContract` tags
- `PaymentContractRune` derived state
- `PaymentContractLifecycle` context-aware methods

### 2. Service Agreement Snapshot

Current storage: `agreementSnapshot` in contract event content

NDK storage options:

- Encrypted event content
- Separate Nostr event linked to contract
- Event tags for non-sensitive data

### 3. Service Filtering

Current approach: `initialType` prop with 'tasks' | 'services' | 'all'

NDK approach: Filter via:

- Contract event tags (`contextType` tag)
- Derived state in dashboard panel
- Query parameter in Nostr subscription

---

## Notes

- The old `DashboardContractsPanel.svelte` remains in the codebase for reference and E2E testing
- Service-related code should be ported incrementally, testing each feature
- Consider creating NDK-specific versions of service utilities that work with `PaymentContractRune`
- The `PaymentContractLifecycle` interface may need extension for service-specific operations


# Execution Plan: Service Quotes (AI Builder Optimized)

Complements `services-listing-feature-plan.md`.
Scope: tasker sends service inquiry/request, taskee sends proposal, tasker accepts proposal, escrow contract is created, and eligible services may also support direct instant buy into the same service contract flow.

This document is the source of truth for service quote/proposal protocol and implementation.
For service quote/proposal event structure, this document supersedes older notes that describe reusing task bid kinds/tags.

---

## 0. Selected Architecture (Locked)

1. Keep current Nostr runtime stack (`nostr-tools`) and private payload encryption as NIP-44 v2 (`0x02`) only.
2. Implement service quotes/proposals as a separate adjacent domain to task bids.
3. Keep existing task bid behavior unchanged.
4. Use machine tags as canonical indexing/filtering primitives with strict cardinality.
5. Enforce proposal validity with both payload expiration fields and NIP-40 `expiration` tag.
6. Use USDT as canonical quote/proposal currency.
7. Reuse the same on-chain escrow contract; make off-chain contract context explicitly `task | service`.
8. Keep tasker quote lifecycle in `My Quotes` and contract lifecycle in `Contracts` with `All / Tasks / Services` filter.
9. Use Unix seconds for all quote/proposal timestamps.
10. Keep tasks and services as separate domains with shared UI/util abstractions only.
11. Support a narrow direct instant-buy path for eligible `FIXED` and `TIERED` services only, while keeping `Request Quote` available on the same service detail surface for custom work.

### 0.1 Current baseline already implemented (do not rebuild)

The following capabilities are already present in the codebase and are treated as implementation baseline:

1. Service listing domain exists with NIP-99 service kinds for active/draft listings:
   - `KINDS.SERVICE_ACTIVE = 30402`
   - `KINDS.SERVICE_DRAFT = 30403`
2. Service listing/search/detail/create/edit foundations exist:
   - service types and pricing/inquiry models (`src/lib/types/service.d.ts`)
   - service publish/query/update modules (`src/lib/nostr/service.ts`, `src/lib/nostr/findServices.ts`)
   - service draft wizard and find-services stores (`src/lib/stores/service.store.ts`)
   - public services browse/detail routes (`src/routes/services/*`)
3. Dashboard foundations already exist:
   - `/dashboard` tabs include `tasks | my-services | bids | contracts | saved-searches`
   - `my-services` alias route exists and redirects to `/dashboard?tab=my-services`
4. Contracts foundation already exists and is task-centric today:
   - contract model and escrow flows are already implemented (`src/lib/types/contract.d.ts`, `src/lib/utils/escrow/v1/*`)
   - `estimatedStartTime` and `estimatedCompletionTime` fields already exist in contract model
   - existing contract action and completion surfaces already exist and must be adapted in place (`src/lib/components/contracts/ContractActions.svelte`, `src/lib/components/contracts/TaskCompletionModal.svelte`)
5. Quote-request UI shell already exists, but submit path is placeholder:
   - `RequestQuoteModal` exists and collects inquiry payload
   - current service browse/detail handlers log payload and close modal; they do not publish service-quote events yet
6. CI baseline already exists:
   - `build`, `unit`, and `coverage` jobs exist in `.gitlab-ci.yml`
   - Playwright job remains commented out
7. Nostr protocol plumbing baseline already exists:
   - NIP-44 v2 helper modules exist (`src/lib/nostr/nip44.ts`, `src/lib/utils/nostr-message.ts`)
   - single-character tag constants and query filter helpers exist (`src/lib/utils/constants/tags.ts`)
   - generic publish/query/follow-up linkage utilities exist (`src/lib/utils/nostr.ts`)

### 0.2 Execution rule for AI builder

1. Treat Section 0.1 as locked baseline.
2. Extend existing modules/files where listed; do not recreate equivalent parallel implementations.
3. Create only the explicit missing service-quote domain files and shared abstractions listed in Sections 15-16.
4. Any plan item that duplicates an implemented baseline capability is invalid and must be converted to integration/refactor work.

### 0.3 Implemented inventory lock (file-level)

Use these as integration anchors:

1. Service domain:
   - `src/lib/types/service.d.ts`
   - `src/lib/nostr/service.ts`
   - `src/lib/nostr/findServices.ts`
   - `src/lib/stores/service.store.ts`
   - `src/routes/services/+page.svelte`
   - `src/routes/services/[serviceId]/+page.ts`
   - `src/lib/components/service/ServiceDetailsView.svelte`
   - `src/lib/components/service/RequestQuoteModal.svelte`
2. Dashboard domain:
   - `src/routes/(protected)/dashboard/+page.svelte`
   - `src/routes/(protected)/dashboard/my-services/+page.ts`
   - `src/lib/components/service/DashboardMyServicesPanel.svelte`
   - `src/lib/components/contracts/DashboardContractsPanel.svelte`
3. Contracts/escrow domain:
   - `src/lib/types/contract.d.ts`
   - `src/lib/utils/escrow/index.ts`
   - `src/lib/utils/escrow/v1/escrow.ts`
   - `src/lib/utils/escrow/v1/escrowEvents.ts`
   - `src/lib/utils/escrow/v1/nostrContract.ts`
4. Runtime constants and routing:
   - `src/lib/utils/constants/kinds.ts`
   - `src/lib/utils/constants/tags.ts`
   - `src/lib/utils/nostr.ts`
5. Encryption/message helpers:
   - `src/lib/nostr/nip44.ts`
   - `src/lib/utils/nostr-message.ts`
6. CI baseline:
   - `.gitlab-ci.yml`

### 0.4 Baseline implementation status matrix (plan scope, authoritative)

As of `2026-03-10`, plan-scope status is:

1. Implemented (preserve and extend):
   - `src/lib/types/service.d.ts`
   - `src/lib/nostr/service.ts`
   - `src/lib/nostr/findServices.ts`
   - `src/lib/stores/service.store.ts`
   - `src/lib/nostr/findTasks.ts`
   - `src/lib/stores/task.store.ts`
   - `src/lib/components/service/RequestQuoteModal.svelte`
   - `src/lib/components/service/ServiceDetailsView.svelte`
   - `src/lib/components/service/ServiceCard.svelte`
   - `src/lib/components/service/DashboardMyServicesPanel.svelte`
   - `src/lib/components/service/steps/InquiryFormBuilder.svelte`
   - `src/routes/services/+page.svelte`
   - `src/routes/services/+layout.svelte`
   - `src/routes/services/+layout.ts`
   - `src/routes/services/[serviceId]/+page.ts`
   - `src/routes/services/[serviceId]/+page.svelte`
   - `src/routes/tasks/+layout.svelte`
   - `src/routes/tasks/+page.svelte`
   - `src/routes/(protected)/dashboard/+page.svelte`
   - `src/routes/(protected)/dashboard/my-services/+page.ts`
   - `src/routes/(protected)/dashboard/my-services/+page.svelte`
   - `src/lib/components/contracts/DashboardContractsPanel.svelte`
   - `src/lib/components/contracts/ContractCard.svelte`
   - `src/lib/components/contracts/ContractDrawer.svelte`
   - `src/lib/stores/contract.store.ts`
   - `src/lib/types/contract.d.ts`
   - `src/lib/utils/constants/kinds.ts`
   - `src/lib/utils/constants/tags.ts`
   - `src/lib/utils/nostr.ts`
   - `src/lib/nostr/nip44.ts`
   - `src/lib/utils/nostr-message.ts`
   - `src/lib/utils/escrow/index.ts`
   - `src/lib/utils/escrow/v1/escrow.ts`
   - `src/lib/utils/escrow/v1/escrowEvents.ts`
   - `src/lib/utils/escrow/v1/nostrContract.ts`
   - `src/lib/utils/service-indexing.ts`
   - `src/lib/utils/task-indexing.ts`
   - `src/lib/utils/nostr-bid.ts`
   - `src/lib/tests/unit/utils/escrow/escrowBid.test.ts`
   - `static/locales/en/common.json`
   - `static/locales/es/common.json`
   - `static/locales/en/error.json`
   - `static/locales/es/error.json`
   - `static/locales/en/dashboard/services/browse.json`
   - `static/locales/es/dashboard/services/browse.json`
   - `static/locales/en/dashboard/services/detail.json`
   - `static/locales/es/dashboard/services/detail.json`
   - `.gitlab-ci.yml`
2. Implemented but partial (must be completed, not duplicated):
   - Quote request submit handlers are placeholder-only in:
     - `src/routes/services/+page.svelte`
     - `src/lib/components/service/ServiceDetailsView.svelte`
   - `kinds.ts` / `tags.ts` / `nostr.ts` already provide event-kind constants, tag/filter helpers, encrypted publish/query, and canonical `#e` follow-up linkage primitives; service-quote protocol constants, cardinality/authorization rules, and encrypted-kind routing for `6420/6421/6422` are not implemented yet.
   - Contracts panel exists but currently task-centric status/role filtering; service context filter behavior from Section 10.3 is still pending.
3. Not implemented yet (must be created in this plan):
   - all `service-quote` domain files in Section 16 `new-create`
   - all shared extraction files in Section 16 `new-create` for Phase 1.5
   - `MyQuotesPanel` and `dashboard/quotes` alias route
   - `tab=quotes` dashboard wiring and query parsing behavior
   - service-quotes E2E test files

4. Additional implemented adjacent baseline (reuse/extend, do not rebuild):
   - NIP-44 foundation:
     - `src/lib/nostr/nip44.ts`
     - `src/lib/utils/nostr-message.ts`
     - `src/lib/tests/unit/helpers/nip44-message.test.ts`
   - Generic relay/query/linkage plumbing:
     - `src/lib/utils/nostr.ts` (fanout publish, related-event querying, encrypted-kind routing framework)
   - Existing resolver/reconciliation foundations:
     - `src/lib/utils/helpers/contractPermissions.ts`
     - `src/lib/tests/unit/utils/escrow/contractPermissions.test.ts`
     - `src/lib/utils/escrow/v1/nostrContract.ts`
   - Existing acceptance/conversion/error foundations:
     - `src/lib/utils/escrow/v1/escrowBid.ts`
     - `src/lib/api/services/crypto-price.service.ts`
     - `src/lib/utils/helpers/escrowErrors.ts`
     - `src/lib/utils/wallet/contractErrorHandler.ts`
     - `src/lib/tests/integration/escrow/escrow-lifecycle.integration.test.ts`
   - Existing service wizard/browse/detail foundations:
     - `src/routes/(protected)/dashboard/create-service/+page.svelte`
     - `src/lib/components/service/steps/ServiceBasics.svelte`
     - `src/lib/components/service/steps/ServiceLocation.svelte`
     - `src/lib/components/service/steps/ServicePricing.svelte`
     - `src/lib/components/service/steps/ServiceTiers.svelte`
     - `src/lib/components/service/steps/ServiceAddOns.svelte`
     - `src/lib/components/service/steps/ServiceFAQs.svelte`
     - `src/lib/components/service/steps/ServicePortfolio.svelte`
     - `src/lib/components/service/steps/ServiceReview.svelte`
     - `src/lib/components/service/ServiceCard.svelte`
     - `src/lib/components/service/ServiceSearchFilters.svelte`
     - `src/lib/components/service/ServiceTierSelector.svelte`
     - `src/lib/components/service/ServiceAddOnsSelector.svelte`
   - Existing Playwright infrastructure:
     - `playwright.config.ts`
     - `scripts/e2e-ordered.js`

### 0.5 Section implementation status snapshot (authoritative)

As of `2026-03-10`, section status is:

1. Section 1 (protocol constants/compatibility): **partial**. Compatibility baseline exists; service-quote kinds/message types/encrypted routing remain.
2. Section 2 (identity/tags/cardinality/linkage): **partial**. Generic tag primitives and query helpers exist; service-quote-specific identity/cardinality/authorization validation remains.
3. Section 3 (payload schemas): **partial**. `QuoteRequestPayload` typing + modal validation/attachment flow exist; protocol-level request/proposal/status schema modules remain.
4. Section 4 (timestamp/expiration invariants): **partial**. Unix `created_at` baseline and adjacent escrow time-order validation exist; quote-specific invariants remain.
5. Section 5 (state machine/resolver): **partial**. Adjacent contract resolver/reconciliation stack exists; service-quote state machine/resolver remain.
6. Section 6 (NIP-40 relay policy): **partial**. Generic relay fanout/query plumbing exists; NIP-40 capability policy layer remains.
7. Section 7 (USDT->RBTC conversion spec): **partial**. Adjacent task/bid conversion + price source exist; quote-domain integer snapshot pipeline remains.
8. Section 8 (acceptance/idempotency/reconciliation): **partial**. Existing escrow acceptance orchestration exists; service-proposal acceptance path remains.
9. Section 9 (query/subscription rules): **partial**. Generic query/subscription + follow-up linkage utilities exist; quote-domain rules remain.
10. Section 10 (UX/routing/contracts rendering): **partial**. Existing dashboard/services/contracts surfaces exist; quote routes/views/context filtering remain.
11. Section 11 (state boundaries): **partial**. Existing stores/subscription cleanup exists; service-quote stores/modules remain.
12. Section 12 (reuse/componentization): **partial**. Reuse baseline exists (`Modal`, `MediaUploader`, `RequestQuoteModal`) and listing/store precursors exist; shared extraction backlog remains.
13. Section 13 (escrow integration context model): **partial**. Existing task-centric escrow integration exists; service context fields/dispatcher remain.
14. Section 14 (feature flags/rollout): **remaining** for `features.serviceQuotes.*`.
15. Sections 15-19 (execution/gates/guardrails): **partial**. Baseline and ownership are documented; implementation gates remain to be executed.
16. Section 20 (success criteria): **remaining** (target state).

---

## 1. Protocol Constants and Compatibility Policy

Current implementation status: **partial**.

### 1.1 Final service quote kinds (regular, append-only)

These constants are final and must not change after release:

- `SERVICE_QUOTE_REQUEST = 6420`
- `SERVICE_PROPOSAL = 6421`
- `SERVICE_PROPOSAL_STATUS = 6422`

These are regular events (not replaceable, not parameterized-replaceable).

### 1.2 Compatibility policy

1. Existing task bid kinds remain unchanged and are never reused for service quote events.
2. Existing task contracts remain first-class and continue to render/operate unchanged.
3. Service quote flow never reads from or writes to task bid kinds/stores.
4. Contract events missing `contextType` are treated as `contextType='task'`.
5. Unknown `contextType` is fail-closed and cannot trigger side effects.

### 1.3 Message types

- `service-quote-request`
- `service-proposal`
- `service-proposal-status`

### 1.4 Encryption profile

1. Kinds `6420/6421/6422` require NIP-44 v2 payloads (version byte `0x02`).
2. Non-v2 encrypted payloads and plaintext payloads are invalid and ignored.

---

## 2. Canonical Identity, Tags, Cardinality, and Linkage

Current implementation status: **partial**.

Implemented baseline already present (reuse/extend, do not rebuild):

1. Canonical single-character tag primitives required by this section already exist (`d/p/e/s/m/n/a/t`).
2. Generic query filter helpers for `#d/#e/#p/#m/#s/#n` already exist.
3. Canonical follow-up linkage querying by `#e` and latest-related-event selection already exist.
4. Service identity foundations already exist (`d` tag lifecycle, `naddr` generation, and latest-version selection).

### 2.1 Canonical service identity contract (authoritative)

1. Canonical service identity is `serviceAddress` in Nostr `a` format:
   - `<serviceKind>:<serviceAuthorPubkey>:<serviceDTag>`
2. `serviceId` field in payload must equal `serviceAddress` exactly.
3. `a` tag is canonical identity.
4. `t` is optional mirror index only; if present it must equal `serviceAddress`.
5. Any mismatch across payload `serviceId`, `#a`, or optional `#t` is invalid and ignored.

### 2.2 Canonical tags

- `d`: domain id
- `p`: recipient pubkey
- `e`: parent event reference
- `s`: status
- `m`: message type
- `n`: network
- `z`: quote schema version (`v1`)
- `t`: optional mirror index (`serviceAddress`)
- `a`: canonical service address (`serviceAddress`)
- `expiration`: proposal expiry timestamp in unix seconds string

`v` is reserved for runtime app version and is not used for quote schema versioning.
Runtime `v` tag injection is already implemented in signing/publish flow and must remain reserved for app/runtime versioning.

### 2.3 Mandatory tag cardinality and role mapping

1. `SERVICE_QUOTE_REQUEST`:
   - exactly 1 `d`, 1 `p`, 1 `m`, 1 `a`, 1 `z`, 1 `n`
   - optional `t` (0 or 1)
   - no `e`
   - no `expiration`
   - `p` must be taskee pubkey
2. `SERVICE_PROPOSAL`:
   - exactly 1 `d`, 1 `p`, 1 `m`, 1 `a`, 1 `z`, 1 `n`, 1 `expiration`
   - optional `t` (0 or 1)
   - exactly 1 canonical `e` pointing to `SERVICE_QUOTE_REQUEST`
   - `p` must be tasker pubkey
3. `SERVICE_PROPOSAL_STATUS`:
   - exactly 1 `d`, 1 `m`, 1 `s`, 1 `a`, 1 `z`, 1 `n`, 1 `p`
   - optional `t` (0 or 1)
   - exactly 1 canonical `e` pointing to `SERVICE_PROPOSAL`
   - no `expiration`
   - `p` mapping:
     - `accepting`: `p=taskeePubkey`
     - `accepted`: `p=taskeePubkey`
     - `accept_failed`: `p=taskeePubkey`
     - `accept_unknown`: `p=taskeePubkey`
     - `declined`: `p=taskeePubkey`
     - `withdrawn`: `p=taskerPubkey`

Events violating cardinality are invalid and ignored.
If multiple `e` tags exist, event is invalid and ignored.

### 2.4 Deterministic `d` formats

- `quoteRequestId` regex: `^[A-Za-z0-9_-]{8,64}$`
- `proposalId` regex: `^[A-Za-z0-9_-]{8,64}$`
- `serviceAddressEncoded = encodeURIComponent(serviceAddress)`
- Quote request: `sqr:sa=<serviceAddressEncoded>:qr=<quoteRequestId>`
- Proposal: `sqp:<quoteRequestId>:<proposalId>`
- Proposal status: `sqs:<proposalId>:<status>:<actorPubkey>`

Parser contract:

1. `d` must match exact prefix and key names.
2. Unknown keys or missing keys are invalid.
3. Decoded `serviceAddressEncoded` must equal payload `serviceId` and `#a` value.

### 2.5 Required linkage invariants

1. `SERVICE_PROPOSAL` must reference exactly one request event via canonical `#e`.
2. `SERVICE_PROPOSAL_STATUS` must reference exactly one proposal event via canonical `#e`.
3. `quoteRequestId`, `proposalId`, tag references, and payload references must match.
4. `serviceAddress`/`serviceId` must match linked parent chain end-to-end.
5. Idempotency key is `(kind, author, d)`.
6. Participant chain invariants:
   - request author (`6420.event.pubkey`) is canonical tasker pubkey
   - request `#p` is canonical taskee pubkey
   - canonical taskee pubkey must equal `serviceAuthorPubkey` parsed from `serviceAddress` (`<kind>:<serviceAuthorPubkey>:<d>`)
   - proposal author (`6421.event.pubkey`) must equal request `#p` (taskee)
   - proposal `#p` must equal request author (tasker)
   - status actor/counterparty must match proposal participants and Section 2.3 mappings
7. Any participant mismatch invalidates the event for resolver/query surfaces.

### 2.6 Idempotency behavior

Before publishing `SERVICE_PROPOSAL_STATUS`, query `(kind, author, d)`.
If found, skip publishing duplicate event.
Each status value is singleton per `(proposalId, actorPubkey, status)` because `d` is deterministic.
Retry attempts must be recorded in durable acceptance ledger metadata and must not rely on republishing duplicate status events.

If relay does not support efficient `#d` indexing:

1. query by `kinds + authors + since`
2. client-side filter by exact `d`
3. apply local durable dedupe cache keyed by `(kind, author, d)`

### 2.7 Cross-field integrity and actor authorization (required)

1. `event.kind`, payload `type`, and tag `m` must match exactly:
   - `6420` <-> `service-quote-request` <-> `m=service-quote-request`
   - `6421` <-> `service-proposal` <-> `m=service-proposal`
   - `6422` <-> `service-proposal-status` <-> `m=service-proposal-status`
2. For `SERVICE_PROPOSAL_STATUS`:
   - tag `s` must equal payload `status`
   - parsed `d` status segment must equal payload `status`
   - parsed `d` actor segment must equal payload `actorPubkey`
   - `event.pubkey` must equal payload `actorPubkey`
3. Status author role mapping:
   - tasker author: `accepting|accepted|accept_failed|accept_unknown|declined`
   - taskee author: `withdrawn`
4. Any mismatch is invalid and ignored.

---

## 3. Payload Schemas (Strict)

Current implementation status: **partial** (request UI payload exists; protocol payload modules remain).

### 3.1 ServiceQuoteRequestContent

```ts
{
  type: 'service-quote-request';
  quoteRequestId: string; // 8..64 chars, ^[A-Za-z0-9_-]{8,64}$
  serviceId: string; // must equal serviceAddress
  serviceAddress: string; // a-tag format
  serviceEventId?: string;
  pricingType: 'FIXED' | 'HOURLY' | 'TIERED' | 'INQUIRY_REQUIRED';
  tierId?: string; // 1..128 chars
  selectedAddOns?: string[]; // <= 20
  rushDelivery?: boolean;
  inquiry?: {
    title: string; // 1..120 chars
    description: string; // 1..5000 chars
    customFormResponses?: Record<string, string | number | boolean | string[]>;
    attachments?: Attachment[]; // <= 10
  };
  quoteAmountUsdt?: string; // decimal(2), > 0
  timestamp: number; // unix seconds
  version: 'v1';
}
```

### 3.2 ServiceProposalContent

```ts
{
  type: 'service-proposal';
  proposalId: string; // 8..64 chars, ^[A-Za-z0-9_-]{8,64}$
  quoteRequestId: string; // 8..64 chars, ^[A-Za-z0-9_-]{8,64}$
  serviceId: string; // must equal serviceAddress
  serviceAddress: string; // a-tag format
  paymentType: 'FIXED' | 'HOURLY';
  amountUsdt: string; // decimal(2), > 0
  description: string; // 1..5000 chars
  estimatedDuration: string; // 1..120 chars
  estimatedStartTime: number; // unix seconds, required
  estimatedEndTime: number;   // unix seconds, required
  coverLetter?: string; // <= 4000 chars
  expirationDays: number; // int 0..30
  expirationHours: number; // int 0..23
  expirationTimestamp: number; // unix seconds
  freelancerRskAddress: string; // checksum normalized
  freelancerFeeTier: 0 | 1 | 2;
  pricingSnapshot: {
    serviceVersionRef: string; // 1..128 chars
    tierId?: string;
    selectedAddOns?: string[];
    rushDelivery?: boolean;
    travelFeeUsdt?: string; // decimal(2), >= 0
  };
  timestamp: number; // unix seconds
  version: 'v1';
}
```

### 3.3 ServiceProposalStatusContent

```ts
{
  type: 'service-proposal-status';
  proposalId: string; // 8..64 chars, ^[A-Za-z0-9_-]{8,64}$
  quoteRequestId: string; // 8..64 chars, ^[A-Za-z0-9_-]{8,64}$
  serviceId: string; // must equal serviceAddress
  serviceAddress: string;
  status:
    | 'accepting'
    | 'accepted'
    | 'accept_failed'
    | 'accept_unknown'
    | 'declined'
    | 'withdrawn';
  actorPubkey: string;
  message?: string;
  timestamp: number; // actor decision timestamp (unix seconds)
  escrowId?: string; // required when status='accepted'
  transactionHash?: string; // required when status='accepted'
  acceptanceSnapshot?: {
    clientRskAddress: string;
    clientFeeTier: 0 | 1 | 2;
    freelancerRskAddress: string;
    freelancerFeeTier: 0 | 1 | 2;
    chainId: number;
    contractAddress: string;
    conversionFormulaVersion: 'v1';
    conversionSnapshotId: string;
    btcUsdRateMicros: number;
    sourceTimestamp: number;
    requiredConfirmations: number;
    finalityPolicyVersion: string;
    sats: string;
    weiAmount: string;
    confirmationsAtVerification: number;
    verificationRpc: string;
  };
  version: 'v1';
}
```

`expired` is derived state only and does not require publishing a status event.

---

## 4. Timestamp and Expiration Invariants (Authoritative)

Current implementation status: **partial**.

1. For request/proposal events: `payload.timestamp == created_at`.
2. For status events: `payload.timestamp <= created_at` and `created_at - payload.timestamp <= 120`.
3. `expirationTimestamp` is computed from final proposal event `created_at`:
   - `expirationTimestamp = created_at + expirationDays*86400 + expirationHours*3600`
4. Equality invariant:
   - `payload.expirationTimestamp == parseInt(tag.expiration, 10) == computedExpiration`
5. `expiration` tag must be decimal string representing unix seconds.
6. Expiration truth rule:
   - `expired := now >= expirationTimestamp`
7. Terminal action validity rule:
   - terminal action is valid only when `status.timestamp < expirationTimestamp`.
8. Clock skew boundaries must be tested at `-1s / 0s / +120s / +121s`.
9. Anti-backdating rule:
   - `status.created_at >= proposal.created_at`
   - `status.created_at <= now + 120`
   - `status.timestamp <= now + 120`

Invalid events are ignored and logged.

---

## 5. Proposal State Machine and Conflict Resolver

Current implementation status: **partial**.

Implemented baseline already present (reuse/extend, do not rebuild):

1. Task/contract domain already has deterministic resolver/permission logic (`determineContractState`) with tested precedence rules.
2. Existing escrow lifecycle already includes stale-pending recovery/reconciliation hooks for status repair.
3. Existing tests already validate resolver/permission behavior; service-quote resolver should extend the same model.

### 5.1 States

- `pending`
- `accepting`
- `accepted`
- `accept_failed`
- `accept_unknown`
- `declined`
- `withdrawn`
- `expired` (derived)

### 5.2 Allowed transitions and actor permissions

1. `pending -> accepting` (tasker only)
2. `accepting -> accepted` (tasker system flow only after chain verification)
3. `accepting -> accept_failed` (tasker system flow)
4. `accepting -> accept_unknown` (tasker system flow)
5. `accept_failed -> accepting` (tasker retry only)
6. `accept_unknown -> accepting` (tasker retry only)
7. `pending -> declined` (tasker only)
8. `pending -> withdrawn` (taskee only)
9. `pending -> expired` (derived when no valid terminal exists and `now >= expirationTimestamp`)

Terminal states:

- `accepted`
- `declined`
- `withdrawn`
- `expired`

Retry publication rule:

1. `accepting/accept_failed/accept_unknown` transitions may repeat in local acceptance ledger for retry orchestration.
2. Nostr status publish remains idempotent by deterministic `d`; duplicate status publishes are skipped.
3. Resolver uses latest valid status set + chain reconciliation, not retry count.

### 5.3 Deterministic terminal resolver (side-effect safe)

Candidate set = valid terminal status events (`accepted|declined|withdrawn`) with authorized actor, valid linkage, and anti-backdating checks.

Resolution order:

1. If any `accepted` candidate has verified on-chain escrow linkage (`receipt.status=1`, `escrowId` exists, `getEscrow(escrowId)` matches proposal participants/amount/time bounds), choose earliest by `created_at`, then lexicographic `id`.
2. Else resolve `declined|withdrawn` by earliest `created_at`, then lexicographic `id`.
3. If candidate set is empty and `now >= expirationTimestamp`, derived state is `expired`.

`status.timestamp` is used for pre-expiry validity check only, not primary winner ordering.

### 5.4 Near-expiry rule

If user action happened before expiration (`status.timestamp < expirationTimestamp`) but relay propagation was delayed, action remains valid.

---

## 6. NIP-40 Relay Capability Policy (Compliant and Non-Deadlocking)

Current implementation status: **partial**.

Implemented baseline already present (reuse/extend, do not rebuild):

1. Generic multi-relay publish fanout and per-relay result collection already exist.
2. Encrypted-kind routing table already exists as extension point for quote kinds.
3. Generic relay querying and related-event graph fetch pipeline already exist.
4. Current publish fanout is best-effort and does not persist strict publish-ack quorum/provenance by default; Section 6 adds that policy layer.

Relay capability states:

- `supports_40`: NIP-11 available and `supported_nips` includes `40`
- `unknown`: NIP-11 missing/unavailable/unreliable
- `explicit_no_40`: NIP-11 available and `40` absent

Publish policy for `SERVICE_PROPOSAL` (expiration-tagged):

1. `targetRelays = supports_40 ∪ unknown`.
2. If `targetRelays` is empty, fail publish with typed error `SERVICE_PROPOSAL_NO_COMPATIBLE_RELAY`.
3. Publish to all `supports_40` relays.
4. Publish to `unknown` relays with warning telemetry.
5. Do not publish expiration-tagged proposals to `explicit_no_40` relays.
6. Require successful publish ack quorum:
   - at least 2 relay acks when 2+ target relays available
   - at least 1 relay ack when only 1 target relay available
7. If quorum is not met, publish is failed and surfaced to user.
8. Client/app expiration validation remains mandatory regardless of relay behavior.

Read-side provenance policy:

1. Persist successful publish-ack relay set per event id (`publishedRelaySet`).
2. Resolver read target for linked request/proposal/status events must prioritize union of:
   - current active relay pool
   - `publishedRelaySet` for each known linked event
3. If read quorum for linked graph cannot be reached, resolver must keep state non-terminal and mark deterministic telemetry reason `service_quote_read_quorum_insufficient`.
4. Read provenance never bypasses schema/auth validation rules.
5. Quantitative read quorum and timeout:
   - `readTimeoutMs = 8000`
   - if 2+ target relays are reachable, require responses from at least 2 relays before resolver terminalization
   - if only 1 target relay is reachable, require 1 response
   - terminalization is blocked when quorum is not reached within timeout

---

## 7. Pricing Conversion Specification (USDT -> RBTC, Integer Only)

Current implementation status: **partial** (adjacent task/bid conversion exists; quote-domain snapshot pipeline remains).

Implemented baseline already present (reuse/extend, do not rebuild):

1. Existing BTC/RBTC price source with caching already exists.
2. Existing USD->RBTC conversion path already exists in task bid acceptance pipeline.
3. Existing unit/integration coverage already exercises conversion + escrow lifecycle in adjacent domain.

1. USDT is canonical for quote/proposal amounts.
2. RBTC funding amount is computed at acceptance/funding time.
3. Price source: `cryptoPriceService` BTC quote.
4. Integer conversion formula (`v1`) only, no float math in accept path.

Inputs:

- `usdtCents` (int)
- `btcUsdRateMicros` (int, USD per BTC * 1_000_000)

Parsing and arithmetic rules:

1. `amountUsdt` must match strict regex `^[0-9]+\\.[0-9]{2}$`.
2. `usdtCents = parseInt(amountUsdt.replace('.', ''), 10)`.
3. All arithmetic in acceptance path must use bigint-safe integer operations only.

Formula:

1. `usdMicros = usdtCents * 10_000`
2. `satsNumerator = usdMicros * 100_000_000`
3. `sats = floor((satsNumerator + floor(btcUsdRateMicros / 2)) / btcUsdRateMicros)`
4. `rbtc = sats / 100_000_000` (8 decimals)
5. `weiAmount = sats * 10_000_000_000` (integer only)

Rules:

1. Snapshot staleness: reject if `now - sourceTimestamp > 120`.
2. Tolerance at accept: `|recomputedSats - snapshottedSats| <= 1`.
3. Conversion snapshot fields (mandatory):
   - `source`
   - `sourceTimestamp`
   - `fetchedAt`
   - `ttlSeconds`
   - `btcUsdRateMicros`
   - `usdtCents`
   - `sats`
   - `rbtcAmount`
   - `formulaVersion`
   - `chainId`
   - `contractAddress`
   - `clientFeeTier`
   - `freelancerFeeTier`
4. Contract call path must use `weiAmount` integer only; decimal RBTC strings are display-only.
5. Snapshot numeric persistence:
   - integer fields are persisted as decimal strings (`sats`, `weiAmount`) or safe integer numbers when bounded
   - no floating-point serialization in acceptance path
6. Conversion snapshot is persisted and referenced by `conversionSnapshotId` in accepted status payload.

---

## 8. Acceptance Authorization, Idempotency, and Chain Reconciliation

Current implementation status: **partial** (existing escrow acceptance path exists; service-proposal acceptance path remains).

Implemented baseline already present (reuse/extend, do not rebuild):

1. Existing acceptance orchestration already performs validate -> tx submit -> pending state publish -> async confirmation.
2. Existing pending-operation guards already prevent duplicate concurrent accepts in adjacent bid/contract flow.
3. Existing reconciliation hooks already recover missing status publication and stale pending states.
4. Existing escrow error mapping and integration tests already cover acceptance failure/recovery classes.

### 8.1 Pre-accept validations

Before escrow creation, acceptance path must validate:

1. Acceptor is the proposal recipient tasker.
2. Proposal links to expected request/service context.
3. Proposal has no verified winning terminal status.
4. `status.timestamp < expirationTimestamp`.
5. `estimatedEndTime > estimatedStartTime`.
6. `estimatedStartTime >= now`.
7. Service active + latest-version check passes.
8. Pricing snapshot and conversion snapshot validations pass.
9. Tasker wallet connected and client RSK address normalized.

### 8.2 Durable single-accept invariant

One escrow may be created per `proposalId`, enforced both on-chain and off-chain.

Enforcement stack:

1. In-memory lock key: `service-proposal-accept:<proposalId>`.
2. Durable acceptance ledger with unique key `proposalId` and compare-and-set transitions.
3. Recovery-safe states in ledger:
   - `accepting`
   - `accepted`
   - `accept_failed`
   - `accept_unknown`
4. On retry, ledger determines allowed transition; parallel accepts are rejected.
5. Ledger must persist `attemptCount` and per-attempt diagnostics to support retries without duplicate status event publication.

### 8.3 Accepted-state validity

`status='accepted'` is valid only when all conditions hold:

1. `transactionHash` present, tx receipt `status=1`, and receipt confirmations `>= N` (`N=3` on Rootstock by default unless network override is explicitly configured).
2. `escrowId` present.
3. on-chain `getEscrow(escrowId)` matches expected participant addresses, amount, and active status.
4. `acceptanceSnapshot` present and consistent with proposal + conversion snapshot.
5. `acceptanceSnapshot.requiredConfirmations` and `acceptanceSnapshot.finalityPolicyVersion` must match active runtime finality policy.

If any condition fails, accepted event is invalid and resolver must not select it.

### 8.4 Contract linkage invariants

Service-context contract payload must include:

- always:
  - `contextType='service'`
  - `serviceId`
  - `serviceAddress`
  - `contextVersionRef`
  - `purchaseMode`
  - `estimatedStartTime`
  - `estimatedEndTime`
  - full pricing snapshot
- when `purchaseMode='quote'`:
  - `quoteRequestId`
  - `proposalId`
  - `proposalEventId`
- when `purchaseMode='instant_buy'`:
  - `instantOrderId`
  - `selectedTierId?`

Canonical instant-buy contract snapshot example:

```ts
{
  contextType: 'service',
  serviceId: serviceAddress,
  serviceAddress,
  contextVersionRef: serviceEvent.id,
  purchaseMode: 'instant_buy',
  instantOrderId: 'sib_12345678',
  selectedTierId: 'premium',
  estimatedStartTime,
  estimatedEndTime,
  pricingSnapshot: {
    serviceVersionRef: serviceEvent.id,
    tierId: 'premium',
    selectedAddOns: [],
    rushDelivery: false,
    travelFeeUsdt: '0.00'
  }
}
```

### 8.5 On-chain idempotency invariant (required)

1. Escrow create path must include deterministic purchase key:
   - `purchaseMode='quote' => purchaseKey = keccak256(utf8("service-proposal:v1:" + proposalId))`
   - `purchaseMode='instant_buy' => purchaseKey = keccak256(utf8("service-instant-buy:v1:" + instantOrderId))`
2. `purchaseKey` is the only valid key material for on-chain/off-chain idempotency checks.
3. Duplicate create attempts for the same purchase key must revert on-chain.
4. Duplicate-key revert is treated as idempotent success only when existing escrow matches participants/amount/time invariants; otherwise the operation transitions to deterministic failure/unknown state for its purchase mode.

### 8.6 Ethers transaction lifecycle rules

1. Handle `TRANSACTION_REPLACED` deterministically:
   - `repriced`: continue tracking replacement hash
   - `replaced` or `cancelled`: transition to `accept_unknown` unless reconciled to a valid escrow
2. Nonce collision, dropped tx, or pending timeout transitions to `accept_unknown`.
3. Polling policy must be explicit and deterministic:
   - `pollIntervalMs = 3000`
   - `maxWaitMs = 180000`
   - `maxRetries = 60`
4. `accept_failed` requires machine-readable reason code.
5. Reason code mapping:
   - `accept_failed`: `validation_failed | chain_revert | invariant_mismatch | duplicate_key_mismatch | publish_failed_permanent`
   - `accept_unknown`: `tx_replaced | pending_timeout | rpc_unavailable | nonce_conflict | reconciliation_deferred`

### 8.7 Reconciliation worker (crash recovery)

1. Persist tx journal states:
   - `submitted`
   - `mined_unconfirmed`
   - `confirmed`
   - `replaced`
   - `failed_publish`
   - `unknown`
2. Startup reconciliation must replay journal entries and reconcile chain state before enabling new accepts.
3. Missing status publication after confirmed escrow must trigger deterministic republish/recover flow.
4. Reorg handling:
   - if a previously accepted tx falls below required confirmations, state downgrades to `accept_unknown` until reconfirmed.
5. Deterministic transition table:
   - `submitted -> mined_unconfirmed` when receipt exists and confirmations < required
   - `submitted|mined_unconfirmed -> confirmed` when confirmations >= required and invariants pass
   - `submitted|mined_unconfirmed -> replaced` on `TRANSACTION_REPLACED`
   - `submitted|mined_unconfirmed -> unknown` on timeout/RPC outage
   - `confirmed -> failed_publish` when status publish fails after max retries
   - `failed_publish -> confirmed` when republish succeeds
6. Republish policy for `failed_publish`:
   - retry every 30s up to 20 attempts, then escalate telemetry + manual recovery queue

### 8.8 Contract capability prerequisite (hard gate)

1. Before enabling Phase 4B acceptance or Phase 4C instant buy, confirm deployed escrow ABI enforces unique deterministic `purchaseKey` semantics for the shared create path.
2. If deployed ABI does not enforce uniqueness, Phase 4B is blocked until:
   - contract upgrade/migration is deployed
   - runtime config points to upgraded contract
   - regression tests prove duplicate-key revert + invariant match handling for both `quote` and `instant_buy` purchase modes.
3. Acceptance feature flag and instant-buy create path must remain disabled until this prerequisite is satisfied.

---

## 9. Query and Subscription Rules

Current implementation status: **partial**.

Implemented baseline already present (reuse/extend, do not rebuild):

1. Generic encrypted query + follow-up graph linking by `#e` already exists via shared query utilities.
2. Existing contract graph retrieval already composes `kinds + participant tags + linked status events`.
3. Existing real-time stores already implement explicit subscribe/unsubscribe lifecycle patterns, including dual-direction visibility subscriptions for participant roles.
4. Existing domains already apply deterministic ordering and duplicate guards under relay fan-in.

Canonical filters always include kinds + context + actor constraints.

1. Tasker My Quotes (sent requests):
   - `kinds: [SERVICE_QUOTE_REQUEST]`
   - `authors: [currentUserPubkey]`
2. Taskee View Quotes (received requests by service):
   - `kinds: [SERVICE_QUOTE_REQUEST]`
   - `#a: [serviceAddress]`
   - optional legacy mirror: `#t: [serviceAddress]`
   - `#p: [currentUserPubkey]`
3. Tasker received proposals:
   - `kinds: [SERVICE_PROPOSAL]`
   - `#p: [currentUserPubkey]`
4. Proposal status events:
   - `kinds: [SERVICE_PROPOSAL_STATUS]`
   - `#e: [proposalEventId]`
   - no single-role author filter; include both actors if authors filter is used (`[taskerPubkey, taskeePubkey]`)
   - view-level auth filtering happens client-side via Section 2.7 rules

Status query contract by surface:

1. Proposal detail timeline (tasker or taskee):
   - query by `kinds + #e` for all proposal ids in scope
   - do not apply single-actor filters that can hide valid counterparty status events
2. Tasker aggregate view:
   - proposals via `#p=[taskerPubkey]`
   - statuses via linked proposal ids (`#e`) from fetched proposals
3. Taskee aggregate view:
   - requests via `#p=[taskeePubkey]` and service identity filters
   - proposals via canonical `#e` links from requests and/or service identity chain
   - statuses via linked proposal ids (`#e`)
4. Any status event that fails Section 2.7 auth/integrity checks must be ignored.

Infrastructure requirements:

1. Add service quote kinds to encrypted-kind routing for NIP-44 parity.
2. Deduplicate by event `id` across relay fan-in.
3. Resolver and list views must be deterministic under out-of-order event arrival.

---

## 10. UX, Route Contract, and Contracts Rendering

Current implementation status: **partial**.

Existing baseline to preserve (reuse/extend, do not rebuild):

1. `/dashboard` already sanitizes invalid `tab` values and normalizes URL state.
2. Redirect-only alias route pattern already exists (`my-services`) and remains mandatory for any new dashboard aliases.
3. Current contracts UX already runs through `DashboardContractsPanel` + `contractStore` with pagination/subscription cleanup; service quote contracts work must extend this surface.
4. New quote routing must extend current dashboard query parsing; do not introduce a parallel route parser.

### 10.1 Route contract matrix (locked)

1. Canonical workflow routing is query-param based under `/dashboard` only.
2. Canonical entry points:
   - tasker quotes base: `/dashboard?tab=quotes&view=tasker`
   - tasker quotes exact-focus: `/dashboard?tab=quotes&view=tasker&request=<quoteRequestId>`
   - taskee quotes base: `/dashboard?tab=my-services&view=quotes&service=<encodedServiceAddress>`
   - taskee quotes exact-focus: `/dashboard?tab=my-services&view=quotes&service=<encodedServiceAddress>&request=<quoteRequestId>`
   - contracts: `/dashboard?tab=contracts&context=all|tasks|services`
3. Post-accept redirect:
   - `/dashboard?tab=contracts&context=services&highlight=<escrowId>`
4. Alias paths are allowed only when explicitly listed in phase file map and must be redirect-only `+page.ts` shims to canonical query URLs; no business logic in alias routes.

Tab-scoped query schema:

1. `tab` allowed:
   - existing baseline: `tasks | my-services | bids | contracts | saved-searches`
   - added by this plan: `quotes`
   - optional future extension (not required by this plan): `saved-services`
2. `view` allowed only for:
   - `tab=quotes` -> `view=tasker`
   - `tab=my-services` -> `view=default|quotes`
3. `context` allowed only for `tab=contracts`.
4. `service` required only when `tab=my-services&view=quotes`; value must be URL-decoded and validated as `serviceAddress`.
5. `request` allowed when:
   - `tab=quotes&view=tasker`
   - `tab=my-services&view=quotes&service=<encodedServiceAddress>`
   value is `quoteRequestId`.
6. `highlight` allowed only when `tab=contracts`; value is `escrowId`.

Invalid query params must be sanitized by a single dashboard query parser to deterministic defaults:

1. `tab=tasks`
2. `context=all` when `tab=contracts`
3. `view=default` for `tab=my-services`, `view=tasker` for `tab=quotes`
4. On any `tab`/`view` transition, strip query params that are out of scope for destination tab/view (`service`, `request`, `highlight`, `context`, `view` as applicable).
5. `service` invalid handling (`tab=my-services&view=quotes`):
   - missing/malformed/unavailable -> replace with first available service and sync query
   - if no services available -> sanitize to `/dashboard?tab=my-services&view=default`
6. `request` invalid handling:
   - `tab=quotes&view=tasker`: malformed -> clear immediately; not yet found while bounded recent-submit/focus-sync state is active -> preserve `request` and render syncing UI; not found after sync window -> clear `request` via `replaceState`, emit deterministic non-blocking UI message code `quotes_request_not_found`
   - `tab=my-services&view=quotes`: malformed -> clear immediately; not yet found while bounded focus-sync state is active -> preserve `request` and render syncing UI; not found after sync window or not linked to selected service -> clear `request` via `replaceState`, preserve `service`, emit deterministic non-blocking UI message code `service_quotes_request_not_found`
7. `highlight` invalid handling (`tab=contracts`):
   - malformed -> clear immediately via `replaceState`, preserve `context`, emit deterministic non-blocking UI message code `contracts_highlight_not_found`
   - not found in current result window -> perform one deterministic recovery fetch/requery by `escrowId`; if still unavailable, clear `highlight` via `replaceState`, preserve `context`, emit deterministic non-blocking UI message code `contracts_highlight_not_found`

### 10.2 Workflow source-of-truth

1. Existing baseline: service browse/detail already open `RequestQuoteModal` and collect inquiry payload, but submit handlers are placeholders.
2. This plan replaces placeholder submit handlers with real request publish + redirect to tasker quote timeline.
3. Service detail page is the canonical buyer decision surface:
   - `Request Quote` for negotiated/custom work
   - `Buy Now` for eligible instant-buy listings
4. Tasker timeline (`tab=quotes`) is workflow source-of-truth for negotiated tasker actions only.
5. `my-services&view=quotes` is workflow source-of-truth for negotiated taskee actions only.
6. Contracts tab is canonical for funded contract lifecycle for both negotiated and instant-buy service orders.
7. Chat is secondary communication and never authoritative for state transitions.
8. Quote request flows must preserve buyer-selected detail context (`tier`, `add-ons`, `rush`, inquiry answers, and any request-supported pricing hints) from service detail -> request modal -> canonical request payload -> buyer/provider quote surfaces.
9. Converted quote/proposal rows remain visible as read-only historical entries with `View Contract`; they must not silently disappear when a contract is created.

### 10.3 Contracts rendering spec

1. Contracts panel must provide context filters: `All / Tasks / Services`.
2. Default filter on direct visit: `All`.
3. Default filter after service proposal accept redirect: `Services`.
4. Filter semantics:
   - `All`: `task` + `service` + legacy missing context
   - `Tasks`: `contextType='task'` plus missing `contextType` fallback
   - `Services`: `contextType='service'` only
5. `highlight=<escrowId>` behavior:
   - if present in filtered list, scroll to contract, open drawer once, then clear `highlight` via `replaceState`
   - if not present, perform one deterministic recovery fetch/requery by `escrowId`; if still unavailable, retain filter and show non-blocking "contract not in current page" message
6. Contract card/drawer label rules:
   - `task`: existing task labels and fields
   - `service`: service labels and fields (`serviceTitle`, `purchaseMode`, price snapshot ref) plus:
     - negotiated flow: `proposalId`, `quoteRequestId`
     - instant-buy flow: `instantOrderId`
   - user-facing badges/labels:
     - `purchaseMode='quote'` -> show `Quoted Service`
     - `purchaseMode='instant_buy'` -> show `Instant Buy`
   - hide quote-specific empty fields for instant-buy contracts
   - hide instant-buy-specific empty fields for negotiated contracts
   - show selected tier when present
7. Legacy contracts with missing `contextType` must render as `task`.
8. Unknown `contextType` must render read-only, hide actionable controls, and emit telemetry.
9. Post-funding service lifecycle must reuse existing contract card/drawer/modal locations; do not create a parallel service-contracts surface.
10. `TaskCompletionModal` must be adapted to be context-aware; when `contextType='service'`, all visible copy must refer to a service rather than a task.
11. Service completion surfaces must expose the full agreement snapshot in the same interaction pattern task details use today:
   - selected tier
   - selected add-ons
   - deliverables/quoted scope
   - rush option
   - inquiry answers
   - quoted price snapshot
   - estimated start time
   - estimated end time
12. Evidence upload UX is identical for in-person and digital services.
13. Current scope does not include a service-specific delivered state, revision/rework loop, or review/rating prompt.
14. Cancel, dispute, complete, accept/release, and dispute-resolution actions must appear in the same locations and use the same overall styling patterns as task contracts.
15. Refund/cancellation/dispute experiences for services must adapt the existing task-contract behavior and contract-state rules rather than introducing service-specific workflow variants.
16. Contract card/drawer/detail rendering must prefer the immutable agreement snapshot captured at contract creation; when snapshot fields exist, the UI must not fall back to current mutable listing data for scope, price, timing, or tier display.
17. All service-context contract actions and confirmation/error messaging must use service-aware copy, not task-biased wording, across completion, cancel, dispute, refund, and release flows.

### 10.4 Notification scope

1. MVP scope includes push notifications for canonical service quote and service contract lifecycle events.
2. Push notifications must reuse the existing `pushNotificationService`; do not introduce a parallel notification delivery stack.
3. `NotificationCenter` remains out of scope; do not block this work on in-app inbox/center features.
4. Push delivery must be triggered from canonical publish/acceptance/reconciliation paths, not from incidental UI-only state transitions.
5. Minimum MVP push events:
   - inquiry/request received by taskee
   - proposal received by tasker
   - service contract created / funded acceptance completed
   - instant-buy order placed / funded contract created
6. Optional MVP push events if low-risk during implementation:
   - proposal declined
   - proposal withdrawn
7. Deep-link targets must be:
   - `/dashboard?tab=quotes&view=tasker&request=<quoteRequestId>`
   - `/dashboard?tab=my-services&view=quotes&service=<encodedServiceAddress>&request=<quoteRequestId>`
   - `/dashboard?tab=contracts&context=services&highlight=<escrowId>`
8. Notification send failures must be non-blocking and must not revert canonical event publish or on-chain acceptance outcomes.
9. Notification sends must be idempotent per canonical event/action to avoid duplicate pushes from retries, reconciliation, or multi-path listeners.
10. Instant-buy orders must use this same push-notification foundation and deep-link model:
   - successful instant buy / contract created -> provider notified
   - instant-buy implementation must not add a separate notification subsystem

### 10.5 Instant-buy policy

1. Instant buy is in scope only as a narrow path for eligible services and must not introduce a parallel escrow or contracts implementation path.
2. Eligible listings are limited to:
   - `pricing.type='FIXED'` or `pricing.type='TIERED'`
   - base price only in v1
   - listing-level `instantBuyLeadHours` is present and valid (`0..720` integer hours stored on service content root)
   - required delivery-time data present on the fixed offer or selected tier
   - no hourly pricing
   - no inquiry-required pricing
   - no add-ons
   - no rush delivery
   - no travel/distance fee adjustments
3. `Request Quote` remains available on the same service detail surface for any buyer who needs custom terms or unsupported options.
4. Instant buy must reuse the same `contextType='service'` contract surfaces, on-chain acceptance adapter, and push-notification foundation, not a separate service-checkout subsystem.
5. Instant-buy orders do not publish `6420/6421/6422`; they create a service-context contract directly from a validated listing snapshot with `purchaseMode='instant_buy'` and generated `instantOrderId` (`8..64` chars, `^[A-Za-z0-9_-]{8,64}$`).

### 10.6 Instant-buy user flow (locked)

1. Entry point:
   - service detail page only
   - no separate instant-buy dashboard or checkout section
2. CTA rules on service detail:
   - eligible listing: show primary `Buy Now` and secondary `Request Quote`
   - ineligible listing: show `Request Quote` only
3. Fixed-price flow:
   - buyer clicks `Buy Now`
   - confirmation modal/drawer shows service title, provider, included scope, total price, estimated start, estimated end
4. Tiered flow:
   - buyer selects tier using existing tier selector
   - `Buy Now` remains disabled until a tier is selected
   - confirmation modal/drawer shows selected tier and its included scope, total price, estimated start, estimated end
5. Time derivation:
   - provider configures listing-level `instantBuyLeadHours`
   - `estimatedStartTime = now + instantBuyLeadHours`
   - `selectedOfferDeliveryTimeSeconds` uses the selected offer's `deliveryTime.max` converted deterministically with:
     - `hour = 3600`
     - `day = 86400`
     - `week = 604800`
     - `month = 2592000`
   - fixed pricing uses `pricing.deliveryTime`
   - tiered pricing requires `selectedTier.deliveryTime` with no fallback to root pricing
   - `estimatedEndTime = estimatedStartTime + selectedOfferDeliveryTimeSeconds`
   - listing/tier is instant-buy ineligible if required timing inputs are missing
   - before showing final confirm state and again before create, revalidate against the latest listing version; if the loaded detail page is stale or eligibility changed, fail closed and require refresh/reselection
6. Contract creation:
   - on confirm, create escrow immediately through shared service contract adapter
   - snapshot selected fixed offer or selected tier into contract context
   - write `purchaseMode='instant_buy'` and `instantOrderId`
   - `service-instant-buy/create.ts` may validate/select/snapshot input, but all contract payload shaping must delegate to `createServiceContractFromSnapshot(...)`; it must not build escrow payloads directly
   - redirect to `/dashboard?tab=contracts&context=services&highlight=<escrowId>`
7. Provider/taskee experience:
   - receives push notification for order placed / contract created
   - manages all post-purchase lifecycle in shared `Contracts` surfaces
8. Buyer/tasker experience:
   - negotiated customizations continue in `My Quotes`
   - instant-buy orders do not appear in quote timelines; they go directly to `Contracts`
9. Scope exclusions for v1:
   - add-ons
   - rush delivery
   - distance fees
   - buyer-picked scheduling
   - revisions/rework loop
   - separate in-app order-management surface

### 10.7 UX state contract (locked)

1. Quote submit redirect:
   - after canonical `6420` publish success, redirect to `/dashboard?tab=quotes&view=tasker&request=<quoteRequestId>`
   - if the new request is not yet query-visible, show a deterministic recent-submit syncing state keyed by `quoteRequestId`
   - keep syncing state visible until the request appears or a bounded timeout elapses
   - only after timeout may the UI clear `request` and emit `quotes_request_not_found`
   - if canonical request publish fails, keep the request modal/surface open with entered values and attachments preserved, show deterministic inline error messaging, and allow in-place retry without losing selected service context
2. Provider notification/inbox focus:
   - inquiry/proposal notifications must deep-link to `/dashboard?tab=my-services&view=quotes&service=<encodedServiceAddress>&request=<quoteRequestId>`
   - provider inbox must one-shot focus the matching thread when both `service` and `request` are valid
3. Loading/empty/error states:
   - tasker quotes, provider quotes, instant-buy confirmation, and contracts highlight handoff must each have explicit loading, empty, and fetch-error UI
   - loading and error states must be surface-local; do not redirect away on fetch failure
4. Partial-data/offline/reconnect states:
   - when relay quorum or linked-graph reads are insufficient, show non-blocking stale-data/reconnecting messaging
   - disable state-changing quote/accept/buy actions while required data quorum is unavailable
   - provide deterministic retry/refresh affordance without losing current route context
5. Wallet/preflight states:
   - disconnected wallet -> show connect-wallet prompt and keep current drawer/modal/timeline context open
   - wrong network -> show switch-network prompt and block create/accept
   - insufficient funds -> show inline actionable error, keep current surface open, and do not start tx submission
   - preflight validation failure -> keep current surface open with deterministic error code and recovery guidance
6. In-flight interaction locking:
   - once `Accept` or `Buy Now` enters in-flight state, disable duplicate clicks, keep the current surface visible, and show pending-progress text until success, failure, or explicit cancel
7. Permission-denied / stale-action states:
   - when an action is rejected because the user is no longer authorized, the quote expired, the quote already converted, the service is no longer actionable, or state changed remotely, keep the user on the current surface
   - show deterministic in-context status/error messaging rather than a generic transport error
   - immediately refetch/re-resolve the affected quote/contract state
   - replace invalid actions with the new valid state (`View Contract`, read-only expired state, withdrawn state, etc.) instead of leaving stale buttons visible
   - preserve surrounding route context; clear only invalid focus params when required by parser rules
8. Expired and converted rows:
   - expired quote/proposal rows remain visible as read-only with expired status copy and disabled irreversible actions
   - converted quote/proposal rows remain visible as read-only with `View Contract`
   - expired tasker flow must provide a deterministic return path back to the originating service detail route `/services/[serviceId]`, reopening the request-quote entry point with prior request context prefilled when that context is still valid
9. Contract continuity:
   - quote surfaces and service-management surfaces must expose `View Contract`/`View Active Contracts` shortcuts when a related active service contract exists
   - when exactly one related active service contract exists, `View Active Contracts` must open `/dashboard?tab=contracts&context=services&highlight=<escrowId>` for that contract
   - when multiple related active service contracts exist, deterministically choose the most recently updated active contract, tie-break by latest creation time, then lexical `escrowId`, and open that contract via the same route
   - users must be able to reach the resulting service contract without depending on push delivery alone

---

## 11. State Boundary Matrix (Locked)

Current implementation status: **partial**.

Implemented baseline to preserve:

1. Existing route/panel controllers already perform explicit subscription disposal on unmount.
2. Existing stores already expose dedicated subscribe/unsubscribe methods used by controllers.
3. Known migration gap: some non-quote stores still read URL params directly; service-quote rollout must converge to single dashboard query authority rather than adding another parser path.

Boundary matrix (to implement/extend):

1. `serviceQuoteStore` (`src/lib/stores/service-quote.store.ts`):
   - owns request/proposal/status domain state
   - mutable only by `service-quote` actions/selectors
2. `serviceQuoteUiStore` (`src/lib/stores/service-quote-ui.store.ts`):
   - owns transient UI state (drawer, tabs, query state)
   - mirrors parsed URL query state; does not own canonical routing state
3. `contractStore` context selectors:
   - may read service context fields
   - may not mutate service quote domain state
4. `task.store.ts` and task bid stores:
   - must not import service quote stores/actions
5. `service-quote` modules:
   - must not import task bid store/actions
6. subscriptions:
   - domain subscriptions start/stop from route-level controllers
   - each route must dispose subscriptions on unmount
7. URL authority:
   - dashboard query parser is single source-of-truth for route state
   - stores must not call `goto`; only route/controller layer may navigate

---

## 12. Reuse and Componentization (Mandatory)

Current implementation status: **partial**.

Already-implemented equivalents (treat as extraction/refactor inputs, not greenfield):

1. Shared list controls are already reused across `/tasks` and `/services`.
2. Listing indexing/filter/cache pipelines already exist in task/service finder + indexing modules.
3. Task/service share-button implementations already provide a behavioral baseline for unified core extraction.
4. `RequestQuoteModal` already contains dynamic inquiry-field rendering + attachment flow suitable for shared field-renderer extraction.
5. Task/service draft-step stores already provide concrete extraction seeds for `createDraftWizardStore<T>`.
6. Existing `FilterDrawer`/`TaskeeFilterDrawer`/`ServiceSearchFilters` and filter sub-components provide extraction seeds for `UnifiedFilterDrawer`.

### 12.1 Reuse first

1. `Modal`, `Drawer`, `MediaUploader` primitives.
2. `RequestQuoteModal` shell and dynamic-field pattern.
3. Use `BidForm` validation discipline as reference pattern only.
4. Reuse and adapt `ContractActions.svelte` and `TaskCompletionModal.svelte`; do not fork task/service copies.

### 12.2 Extract shared building blocks

1. `SchemaDrivenFieldRenderer` (tasks + services forms)
2. `FormValidationCore` (shared validators)
3. `ListingControls` (replace task-biased controls)
4. `UnifiedFilterDrawer` (merge duplicated filter UIs)
5. `ListingShell` (shared list/map/search/pagination shell)
6. `ListingDataPipeline` logical contract, implemented by:
   - `listing-indexing-core` (normalize/index/filter primitives)
   - `createListingFinder` (cache/pagination/store-update orchestration)
7. `ContractActionBar` (shared task/service contract action layout)
8. Per-action contract buttons (`CompleteContractButton`, `AcceptContractButton`, `CancelContractButton`, `DisputeContractButton`, `ResolutionProposalButton`)
9. `ContractContextSummary` (shared task/service agreement summary block)
10. `createServiceContractFromSnapshot(...)` shared adapter used by negotiated acceptance and instant buy

### 12.3 Concrete extraction backlog (locked)

1. `createDraftWizardStore<T>` for task/service draft lifecycle + step navigation.
2. `listing-indexing-core` for shared normalize/index/filter primitives (`ListingDataPipeline` core).
3. `createListingFinder` for shared cache/pagination/store-update orchestration (`ListingDataPipeline` orchestrator).
4. `SchemaDrivenFieldRenderer` reused by inquiry builder and request quote modal.
5. `EntityShareButton` core reused by task/service share buttons.
6. `UsdSatsInput` core reused by task budget and service fixed pricing.
7. `UnifiedFilterDrawer` shell reused by task/service listing filters.
8. `PublicListingLayoutShell` reused by `/tasks` and `/services`.
9. `FormValidationCore` shared validators used by task/service create + quote/proposal forms.
10. `ListingControls` shared controls for sort/view/search/filter trigger states.
11. `ListingShell` shared page-shell/controller for list/map/infinite-scroll orchestration.
12. `ContractActionBar` reused by task cards/details/contracts where action bundles are currently repeated.
13. Individual contract action button components reused by task and service contracts from one implementation.
14. `ContractContextSummary` reused by task and service contract drawer/modal content to expose agreement details consistently.
15. `ServiceTierSelector` reused for tiered instant-buy tier selection; do not create a parallel tier-picker.
16. Instant-buy confirmation must reuse `ContractContextSummary` or the same normalized purchase-summary renderer used by contracts; do not create a second summary structure.

### 12.4 Hard boundary

1. Shared modules must be UI/pure utility adapters only.
2. Service quote domain code must not import task bid store/actions.
3. Refactor existing task contract action surfaces into shared components before layering service-specific context labels/details; do not duplicate action markup per domain.

---

## 13. Escrow Integration (Context-Aware Off-Chain)

Current implementation status: **partial (task-context baseline exists; service-context dispatcher/context fields remain)**.

Context model:

```ts
{
  contextType: 'task' | 'service';
  contextId: string;
  contextTitle: string;
  contextDescription?: string;
  contextVersionRef?: string;
  quoteRequestId?: string;
  proposalId?: string;
  proposalEventId?: string;
  purchaseMode?: 'quote' | 'instant_buy';
  instantOrderId?: string;
  selectedTierId?: string;
}
```

Dispatcher behavior:

1. `contextType='task'`: existing task side-effect pipeline.
2. `contextType='service'`: service quote/proposal or instant-buy side-effect pipeline, based on `purchaseMode`.
3. missing `contextType`: treat as `task`.
4. unknown `contextType`: fail-closed and emit error telemetry.
5. Implementation rule: augment existing task-centric contract structures; do not fork or replace current contract event model.
6. Shared creation rule: both negotiated service acceptance and instant buy must call one shared adapter `createServiceContractFromSnapshot(...)`; duplicate escrow payload builders are forbidden.

---

## 14. Feature Flags and Rollout Contract (Locked)

Current implementation status: **remaining** for service-quote flags.

Flags (all default `false`):

1. `features.serviceQuotes.read`
2. `features.serviceQuotes.write`
3. `features.serviceQuotes.accept`
4. `features.serviceQuotes.contractsFilter`

Dependency matrix (enforced):

1. `write => read`
2. `contractsFilter => read`
3. `accept => read && write && contractsFilter`
4. Invalid combinations fail-closed and are auto-coerced to safe state on startup.

Rollout sequence:

1. enable `read`
2. enable `write`
3. enable `contractsFilter`
4. enable `accept`

Kill switch behavior:

1. disabling `write` blocks new quote/proposal/status publish actions
2. disabling `accept` blocks acceptance actions and hides accept CTA
3. disabling `contractsFilter` reverts contracts to existing behavior
4. disabling `read` hides service quote views but preserves data integrity
5. if telemetry error rate for service-quote publish/accept exceeds threshold, disable `accept` first, then `write`

---

## 15. Implementation Phases (Hard Gates)

Current implementation status: **partial** (baseline documented; phase gates not yet completed).

Starting baseline for all phases:

1. Service listing/search/create/edit/detail is already implemented.
2. Dashboard tabs and contracts panel are already implemented.
3. Existing contract/escrow pipeline is already implemented for task context.
4. Phase execution must extend baseline codepaths; no duplicate parallel flows.

### Phase 0: Domain Decoupling and Compatibility (flagged, no UI exposure)

Current status (as of `2026-03-10`): **partial**. Existing contract/dashboard foundations are present; context-type model and compatibility gates remain.

Scope:

1. Modify existing contract model/parser stack to add context-aware parsing + fallback mapping.
2. Add context dispatcher and fail-closed unknown handling inside existing escrow/contracts modules.
3. Add contracts filter plumbing behind feature flag in existing dashboard/contracts surfaces.
4. Do not create a second contract pipeline; reuse current contract store/components.

Gate commands:

- `npm run check`
- `npm run lint`
- `npm run test:unit -- --run src/lib/tests/unit/contracts/context-*.test.ts`
- `npm run test:unit -- --run src/lib/tests/unit/contracts/legacy-contract-compat*.test.ts`

Gate criteria:

1. Existing task contract tests pass unchanged.
2. Legacy contracts parse/render with task fallback.
3. Unknown contextType emits telemetry and no side effects.
4. No new typecheck or lint errors in modified files.

### Phase 1: Protocol and Data Foundations

Current status (as of `2026-03-10`): **remaining**. Quote protocol constants/schemas/validators are not yet implemented.

Scope:

1. Extend existing constants (`kinds.ts`, `tags.ts`) with service quote kinds/tags.
2. Add schema parsers/validators + strict cardinality + linkage + idempotency fallback.
3. Add NIP-40 capability policy.
4. Extend existing encrypted-kind routing to include service quote kinds.
5. Keep existing service listing kinds (`30402/30403`) unchanged.

Gate commands:

- `npm run check`
- `npm run lint`
- `npm run test:unit -- --run src/lib/tests/unit/service-quote/protocol*.test.ts`
- `npm run test:unit -- --run src/lib/tests/unit/service-quote/protocol-id-consistency*.test.ts`
- `npm run test:unit -- --run src/lib/tests/unit/service-quote/protocol-tags-cardinality*.test.ts`
- `npm run test:unit -- --run src/lib/tests/unit/service-quote/service-proposal-status-authz*.test.ts`
- `npm run test:unit -- --run src/lib/tests/unit/utils/nostr/service-quote-routing*.test.ts`

Gate criteria:

1. ID mismatch events are rejected.
2. Multiple-`e` and bad-cardinality events are rejected.
3. Clock-skew boundary tests pass (`-1/0/+120/+121`).
4. Relay policy tests cover `supports_40|unknown|explicit_no_40`.
5. `npm run check` and `npm run lint` pass.

### Phase 1.5: Shared Reuse Baseline (No Behavior Change, Owned by `S4-R1`)

Current status (as of `2026-03-10`): **remaining**. Shared extraction targets are not yet created.

Execution policy:
1. This phase is owned by listing-plan work item `S4-R1`.
2. It is a single bounded prerequisite track for the explicit shared extraction targets below.
3. It must not be executed as a second parallel refactor epic outside `S4-R1`.

Scope:

1. Extract shared reuse cores from existing task/services implementations without changing user-visible behavior.
2. Add parity coverage to prove current tasks and current services remain unchanged after extraction.
3. Preserve existing route/store/component contracts while introducing shared abstractions.

Gate commands:

- `npm run check`
- `npm run lint`
- `npm run test:unit -- --run src/lib/tests/unit/stores/draft-wizard.factory.test.ts`
- `npm run test:unit -- --run src/lib/tests/unit/listing/indexing-core.test.ts`
- `npm run test:unit -- --run src/lib/tests/unit/components/forms/schema-driven-field-renderer.test.ts`
- `npm run test:unit -- --run src/lib/tests/unit/components/forms/form-validation-core.test.ts`
- `npm run test:unit -- --run src/lib/tests/unit/components/shared/entity-share-button.test.ts`
- `npm run test:unit -- --run src/lib/tests/unit/components/shared/usd-sats-input.test.ts`
- `npm run test:unit -- --run src/lib/tests/unit/components/listing/listing-controls.test.ts`
- `npm run test:unit -- --run src/lib/tests/unit/components/listing/listing-shell.test.ts`
- `npm run test:unit -- --run src/lib/tests/unit/components/listing/unified-filter-drawer.test.ts`
- `npm run test:unit -- --run src/lib/tests/unit/components/listing/public-listing-layout-shell.test.ts`
- `npm run test:unit -- --run src/lib/tests/unit/utils/listing/create-listing-finder.test.ts`
- `npm run test:unit -- --run src/lib/tests/integration/routes/tasks-services-parity.test.ts`

Gate criteria:

1. Tasks parity suite passes unchanged behavior assertions.
2. Shared abstractions contain no task-bid/service-quote cross-domain imports.
3. `npm run check` and `npm run lint` pass.

### Phase 2: Taskee Quote Processing

Current status (as of `2026-03-10`): **partial**. Existing UI surfaces are present; quote submit/publish workflow remains.

Scope:

1. Extend existing My Services/dashboard surfaces with a per-service quotes view (no parallel dashboard surface).
2. Implement decline/send-proposal flow.
3. Replace current quote-request placeholder submit handlers with real service-quote publish flow.
4. Enforce required start/end + expiration invariants at submit.

Gate commands:

- `npm run check`
- `npm run lint`
- `npm run test:unit -- --run src/lib/tests/components/service/quotes*.test.ts`
- `npm run test:unit -- --run src/lib/tests/integration/service-quote/taskee*.test.ts`

Gate criteria:

1. Proposal submit requires normalized freelancer wallet and fee tier.
2. `expiration` tag and payload expiration invariants always match.
3. Invalid proposal payload bounds are rejected with typed errors.
4. Provider proposal composer keeps the user in-context when freelancer wallet or fee-tier prerequisites are missing, blocks submit, and shows deterministic inline recovery guidance.
5. Provider inbox supports exact-focus request deep links via `service + request` and preserves service-scoped route context when request focus is invalid.
6. Request submit redirect preserves buyer-selected detail context in the canonical request payload and shows a deterministic syncing state until the new request becomes query-visible.
7. `npm run check` and `npm run lint` pass.

### Phase 3: Tasker My Quotes (no funded accept terminal yet)

Current status (as of `2026-03-10`): **remaining**. Dashboard framework exists, but `quotes` tab/view and timeline components are not implemented.

Scope:

1. Add `quotes` tab/view to existing dashboard query-param router and tabs system.
2. Extend existing dashboard query-param tab/router to add `quotes` view and implement `MyQuotesPanel` on top of current tab infrastructure.
3. Show sent requests + received proposals + deterministic state.
4. Implement `accepting/accept_failed/accept_unknown` UI transitions.

Gate commands:

- `npm run check`
- `npm run lint`
- `npm run test:unit -- --run src/lib/tests/components/dashboard/my-quotes*.test.ts`
- `npm run test:unit -- --run src/lib/tests/integration/service-quote/tasker-read*.test.ts`

Gate criteria:

1. Escrow-funded `accepted` terminal is not emitted by UI in this phase.
2. `status='accepted'` publish attempts are fail-closed with deterministic feature-disabled error before Phase `4B`/`features.serviceQuotes.accept`.
3. Routing/deep-link contract tests pass for `tab/view/context/service/request/highlight` params.
4. Tasker timeline exposes a proposal-review surface with full agreement snapshot before action.
5. Expired and converted rows remain visible read-only with deterministic follow-up CTAs (`View Contract` for converted rows; return-to-service path for expired rows).
6. Phase 3 `highlight` handling is parser canonicalization only; contracts drawer/highlight lifecycle remains Phase `4A` ownership.
7. `npm run check` and `npm run lint` pass.

### Phase Boundary Guardrail (Before Phase `4B`)

The following are forbidden before Phase `4B` gates pass:
1. Emitting funded terminal `accepted` from tasker UI.
2. Triggering accept-to-escrow side effects from quote timeline actions.
3. Redirecting from tasker quotes to contracts via funded acceptance handoff.
4. Marking quote lifecycle complete based on funded acceptance outcomes.
5. Enabling instant-buy escrow creation before shared service contract creation/reconciliation gates are green.

### Phase 4A: Contracts context exposure (no accept)

Current status (as of `2026-03-10`): **partial**. Contracts panel exists; context-aware `All/Tasks/Services` behavior remains.

Execution note: remaining Phase `4A` contracts-surface extraction and rendering work is executed under listing-plan owner `S4-AC1A`; treat Phase `4A` and `4B` gates as one concrete implementation track across `S4-AC1A`/`S4-AC1B`/`S4-AC1C`, not separate ownership tracks.

Scope:

1. Extend existing contracts panel/card/drawer with context filters and service rendering.
2. Implement highlight lifecycle behavior and context-safe controls.
3. Expose service agreement snapshot fields in contract card/drawer/detail surfaces.
4. Extract shared task/service contract action layout and agreement-summary components without creating a second contracts-surface owner track outside `S4-AC1A`.

Gate commands:

- `npm run check`
- `npm run lint`
- `npm run test:unit -- --run src/lib/tests/components/contracts/context-filter*.test.ts`
- `npm run test:unit -- --run src/lib/tests/components/contracts/highlight*.test.ts`
- `npm run test:unit -- --run src/lib/tests/components/contracts/context-summary*.test.ts`
- `npm run test:unit -- --run src/lib/tests/components/contracts/action-bar-parity*.test.ts`
- `npm run test:unit -- --run src/lib/tests/integration/contracts/highlight-recovery*.test.ts`

Gate criteria:

1. Contracts filters are deterministic for `all/tasks/services`.
2. Unknown context contracts are read-only and emit telemetry.
3. Highlight param is consumed once and cleared via replaceState after successful open, and missing-highlight recovery attempts one deterministic fetch/requery before showing not-found messaging.
4. Service contracts render agreement snapshot fields (`tier`, `add-ons`, `deliverables`, `rush`, `inquiry answers`, `price snapshot`, `estimated start`, `estimated end`) without requiring a separate service-contract view.
5. Service contract detail surfaces render from immutable contract snapshot data when available rather than current listing state.
6. Shared contract action layout/components render task and service contexts with parity-preserving placement/styling.
7. Service-context contract confirmations/errors use service-aware copy across completion/cancel/dispute/refund/release actions.
8. `npm run check` and `npm run lint` pass.

### Phase 4B: Escrow acceptance + chain reconciliation

Current status (as of `2026-03-10`): **remaining** for service proposals.

Execution note: listing-plan implementation slices for this phase are `S4-AC1B` (service acceptance engine + reconciliation baseline) and `S4-AC1C` (funded service-contract UX/handoff baseline), building on `S4-AC1A` from Phase `4A`.

Scope:

1. Implement service acceptance adapter + durable idempotency ledger on top of existing escrow infrastructure.
2. Enable tasker acceptance action with chain reconciliation.
3. Publish service-context contract events through existing nostr-contract integration path.
4. Adapt existing completion and contract-action components to be context-aware for service contracts.
5. Reuse the same completion evidence UX for in-person and digital services.
6. Extract shared `createServiceContractFromSnapshot(...)` adapter for service contract creation inputs/snapshot shaping.

Gate commands:

- `npm run check`
- `npm run lint`
- `npm run test:unit -- --run src/lib/tests/unit/utils/escrow/service-proposal-accept*.test.ts`
- `npm run test:unit -- --run src/lib/tests/unit/utils/escrow/service-proposal-ledger*.test.ts`
- `npm run test:unit -- --run src/lib/tests/unit/utils/escrow/service-proposal-conversion*.test.ts`
- `npm run test:unit -- --run src/lib/tests/unit/utils/escrow/service-proposal-reorg*.test.ts`
- `npm run test:unit -- --run src/lib/tests/unit/utils/escrow/service-proposal-tx-replaced*.test.ts`
- `npm run test:unit -- --run src/lib/tests/integration/service-quote/escrow-accept*.test.ts`
- `npm run test:unit -- --run src/lib/tests/integration/service-quote/wallet-preflight*.test.ts`
- `npm run test:unit -- --run src/lib/tests/integration/contracts/service-contract-notifications*.test.ts`
- `npm run test:unit -- --run src/lib/tests/components/contracts/service-completion-modal*.test.ts`
- `npm run test:unit -- --run src/lib/tests/integration/contracts/task-service-actions-parity*.test.ts`

Gate criteria:

1. Multi-click/multi-tab/concurrent accept races create exactly one escrow.
2. Accepted status is emitted only after receipt success + confirmation threshold + `getEscrow` verification.
3. Failed/unknown acceptance states are recoverable with retry.
4. Wallet/preflight UX is deterministic: disconnected wallet shows connect prompt, wrong network shows switch prompt, insufficient funds show inline actionable error, and no tx starts until preflight passes.
5. In-flight accept UX disables duplicate interaction, keeps the current surface visible, and shows pending-progress text until success/failure.
6. Contracts redirect uses `context=services&highlight=<escrowId>`.
7. Reorg and tx-replaced simulations resolve to deterministic states.
8. Service completion modal uses service wording, not task wording, when `contextType='service'`.
9. Service completion modal exposes agreement snapshot details and uses the same evidence flow for in-person and digital services.
10. No revision loop, no service-specific delivered state, and no review prompt are introduced in this phase.
11. Task contract actions remain regression-free after shared-component refactor.
12. Negotiated acceptance path uses shared `createServiceContractFromSnapshot(...)` adapter rather than a dedicated escrow payload builder.
13. Converted quote/proposal rows remain visible as read-only history with `View Contract` after funded acceptance succeeds.
14. Funded service-contract push fires only after successful contract creation and uses `/dashboard?tab=contracts&context=services&highlight=<escrowId>`.
15. `npm run check` and `npm run lint` pass.

### Phase 4C: Instant buy for eligible fixed/tiered services

Current status (as of `2026-03-10`): **remaining**.

Execution note: listing-plan implementation slices for this phase are `S4-IB1A` (schema/authoring/eligibility), `S4-IB1B` (CTA/confirmation UX), and `S4-IB1C` (shared create/redirect/push handoff).

Scope:

1. Add service-detail `Buy Now` flow for eligible `FIXED` and `TIERED` listings only.
2. Reuse existing service detail, tier selector, shared modal/drawer primitives, and shared service contract creation path.
3. Reuse shared `createServiceContractFromSnapshot(...)` adapter rather than building a second escrow payload path.
4. Keep `Request Quote` available on the same detail surface as the fallback path for any custom/unsupported case.
5. Route successful instant-buy orders directly into shared `Contracts` surfaces.

Gate commands:

- `npm run check`
- `npm run lint`
- `npm run test:unit -- --run src/lib/tests/unit/service-instant-buy/eligibility*.test.ts`
- `npm run test:unit -- --run src/lib/tests/unit/service-instant-buy/time-derivation*.test.ts`
- `npm run test:unit -- --run src/lib/tests/integration/service-instant-buy/lead-hours-roundtrip*.test.ts`
- `npm run test:unit -- --run src/lib/tests/integration/service-instant-buy/create-contract*.test.ts`
- `npm run test:unit -- --run src/lib/tests/integration/service-instant-buy/wallet-preflight*.test.ts`
- `npm run test:unit -- --run src/lib/tests/components/service/instant-buy*.test.ts`

Gate criteria:

1. Only eligible `FIXED` and `TIERED` listings expose `Buy Now`.
2. Tiered instant buy requires a selected tier before confirmation.
3. `Request Quote` remains available on the same service detail surface for eligible listings.
4. Contract creation snapshots selected offer data, writes `purchaseMode='instant_buy'` plus `instantOrderId`, and redirects to `context=services&highlight=<escrowId>`.
5. Multi-click/retry attempts create exactly one escrow/order outcome.
6. Wallet/preflight UX is deterministic before create: disconnected wallet shows connect prompt, wrong network shows switch prompt, insufficient funds show inline actionable error, and preflight failure keeps the confirmation surface open.
7. On create failure after confirm: stay on detail/confirmation surface, show deterministic error code, do not redirect, and do not send push.
8. Retry must reuse the same `instantOrderId` until success or explicit cancel.
9. Cancel from confirmation produces no side effects, no quote record, and no push.
10. Missing/invalid timing inputs fail closed and disable instant buy.
11. Add-ons, rush, distance fees, hourly pricing, and inquiry-required pricing are excluded from v1.
12. `instantBuyLeadHours` round-trips through create/edit UI, store state, nostr content serialization, and parsed listing eligibility logic.
13. Instant-buy path revalidates the latest listing version before confirm/create and fails closed on stale or no-longer-eligible data.
14. Instant-buy path uses shared `createServiceContractFromSnapshot(...)` adapter rather than a second escrow payload builder; `service-instant-buy/create.ts` is orchestration/validation only.
15. Contracts created via instant buy render `Instant Buy`, while negotiated service contracts render `Quoted Service`.
16. In-flight `Buy Now` interaction disables duplicate clicks, keeps the confirmation surface visible, and shows pending-progress text until success/failure/cancel.
17. Provider can reach the resulting service contract from non-push surfaces via `View Active Contracts`/`View Contract` continuity.
18. Instant-buy push fires only after successful contract creation and uses `/dashboard?tab=contracts&context=services&highlight=<escrowId>`.
19. `npm run check` and `npm run lint` pass.

### Phase 5: Hardening and cross-domain regression

Current status (as of `2026-03-10`): **partial**. CI baseline exists; service-quote E2E suites and required Playwright CI enforcement remain.

Scope:

1. Extend existing i18n files with all new states/errors.
2. Extend existing Playwright suite/infrastructure with web + mobile E2E for inquiry -> proposal -> accept -> contract, then enforce in CI.
3. Add parallel domain regression coverage (task + service flows) on top of existing CI jobs, including instant-buy happy-path coverage.
4. Lock regression coverage for shared contract action components and context-aware completion modal behavior across task + service contexts.

Gate commands:

- `npm run check`
- `npm run lint`
- `npm run test:ci`
- `CI=1 npx playwright test tests/e2e/service-quotes-*.spec.ts --project=chromium --workers=1 --retries=0 --reporter=line`
- `CI=1 npx playwright test tests/e2e/service-quotes-*.spec.ts --project='Mobile Safari' --workers=1 --retries=0 --reporter=line`
- `CI=1 npx playwright test tests/e2e/service-instant-buy*.spec.ts --project=chromium --workers=1 --retries=0 --reporter=line`
- `CI=1 npx playwright test tests/e2e/service-instant-buy*.spec.ts --project='Mobile Safari' --workers=1 --retries=0 --reporter=line`
- `npm run test:unit -- --run src/lib/tests/unit/utils/escrow/escrowBid.test.ts`
- `npm run test:unit -- --run src/lib/tests/integration/routes/tasks-services-parity.test.ts`

Gate criteria:

1. No regressions in task bid and task contract flows.
2. Service quote and instant-buy end-to-end pass on web + mobile.
3. Contracts filter + rendering stable across `all/tasks/services`, including instant-buy service orders.
4. `npm run check`, `npm run lint`, and `npm run test:ci` pass.
5. Shared contract action refactor is covered by task + service regression tests, including task card/details/drawer placements that consume the extracted action bundle.
6. Phase 5 CI gate cannot be marked complete while Playwright job is commented out in `.gitlab-ci.yml`.

---

## 16. Phase File Map (Explicit Ownership)

Current implementation status: **implemented as planning artifact** (classified into `existing-modify` vs `new-create`).

Legend:

- `existing-modify`: file already exists; extend/refactor in place
- `new-create`: file does not exist yet; create in this phase
- `existing-keep`: file exists and is baseline dependency; do not reimplement

### Phase 0

File-map status (as of `2026-03-10`): **implemented files exist; phase work remaining**.

existing-modify:

- `src/lib/types/contract.d.ts`
- `src/lib/stores/contract.store.ts`
- `src/lib/utils/escrow/index.ts`
- `src/lib/utils/escrow/v1/escrowEvents.ts`
- `src/lib/components/contracts/DashboardContractsPanel.svelte`
- `src/lib/components/contracts/ContractCard.svelte`
- `src/lib/components/contracts/ContractDrawer.svelte`

new-create:

- none

existing-keep:

- `src/lib/components/contracts/ContractActions.svelte`
- `src/lib/components/contracts/ContractTimeline.svelte`
- `src/lib/components/contracts/ContractModal.svelte`
- `src/lib/components/contracts/TaskCompletionModal.svelte`
- `src/lib/utils/escrow/v1/index.ts`
- `src/lib/utils/escrow/v1/escrow.enum.ts`
- `src/lib/utils/escrow/v1/escrowBid.ts`

### Phase 1

File-map status (as of `2026-03-10`): **new-create files remaining**.

new-create:

- `src/lib/types/service-quote.d.ts`
- `src/lib/stores/service-quote.store.ts`
- `src/lib/stores/service-quote-ui.store.ts`
- `src/lib/utils/service-quote/protocol.ts`
- `src/lib/utils/service-quote/publish.ts`
- `src/lib/utils/service-quote/query.ts`
- `src/lib/utils/service-quote/resolver.ts`

existing-modify:

- `src/lib/utils/constants/kinds.ts`
- `src/lib/utils/constants/tags.ts`
- `src/lib/utils/nostr.ts`

### Phase 1.5

File-map status (as of `2026-03-10`): **new-create files remaining**.

new-create:

- `src/lib/stores/factories/createDraftWizardStore.ts`
- `src/lib/utils/listing/indexing-core.ts`
- `src/lib/utils/listing/createListingFinder.ts`
- `src/lib/components/shared/EntityShareButton.svelte`
- `src/lib/components/shared/UsdSatsInput.svelte`
- `src/lib/components/forms/SchemaDrivenFieldRenderer.svelte`
- `src/lib/components/forms/FormValidationCore.ts`
- `src/lib/components/listing/ListingControls.svelte`
- `src/lib/components/listing/ListingShell.svelte`
- `src/lib/components/listing/UnifiedFilterDrawer.svelte`
- `src/lib/components/listing/PublicListingLayoutShell.svelte`

existing-modify:

- `src/lib/stores/task.store.ts`
- `src/lib/stores/service.store.ts`
- `src/lib/nostr/findTasks.ts`
- `src/lib/nostr/findServices.ts`
- `src/lib/utils/task-indexing.ts`
- `src/lib/utils/service-indexing.ts`
- `src/lib/components/service/steps/InquiryFormBuilder.svelte`
- `src/lib/components/service/RequestQuoteModal.svelte`
- `src/routes/tasks/+layout.svelte`
- `src/routes/services/+layout.svelte`
- `src/routes/services/+layout.ts`
- `src/routes/tasks/+page.svelte`
- `src/routes/services/+page.svelte`
- `src/lib/components/task/TaskListControls.svelte`
- `src/lib/components/filters/FilterDrawer.svelte`
- `src/lib/components/filters/TaskeeFilterDrawer.svelte`
- `src/lib/components/service/ServiceSearchFilters.svelte`
- `src/lib/components/filters/PriceRangeSlider.svelte`
- `src/lib/components/filters/AvailabilityFilter.svelte`
- `src/lib/components/task/TaskShareButton.svelte`
- `src/lib/components/service/ServiceShareButton.svelte`
- `src/lib/components/InfiniteScroll.svelte`
- `src/lib/stores/infiniteScroll.store.ts`
- `src/lib/utils/helpers/clipboard.ts`

existing-keep:

- `src/lib/components/Modal.svelte`
- `src/lib/components/Drawer.svelte`
- `src/lib/components/MediaUploader.svelte`
- `src/lib/components/Tabs.svelte`
- `src/lib/components/CategoryMultiselect.svelte`
- `src/lib/components/SkillsMultiselect.svelte`
- `src/lib/components/LocationAutoComplete.svelte`
- `src/lib/components/date/DateInput.svelte`
- `src/lib/components/bidding/BidForm.svelte`

### Phase 2

File-map status (as of `2026-03-10`): **partial** (existing surfaces present; new quote components remaining).

new-create:

- `src/lib/components/service/quotes/ServiceQuotesInbox.svelte`
- `src/lib/components/service/quotes/ServiceProposalComposer.svelte`

existing-modify:

- `src/lib/components/service/RequestQuoteModal.svelte`
- `src/lib/components/service/ServiceDetailsView.svelte`
- `src/lib/components/service/DashboardMyServicesPanel.svelte`
- `src/routes/services/+page.svelte`
- `src/routes/(protected)/dashboard/+page.svelte`
- redirect alias only: `src/routes/(protected)/dashboard/my-services/+page.ts`

existing-keep:

- `src/lib/components/service/ServiceShareButton.svelte`
- `src/lib/components/service/ServiceTierSelector.svelte`
- `src/lib/components/service/ServiceAddOnsSelector.svelte`

### Phase 3

File-map status (as of `2026-03-10`): **remaining**.

new-create:

- `src/lib/components/dashboard/quotes/MyQuotesPanel.svelte`
- redirect alias only: `src/routes/(protected)/dashboard/quotes/+page.ts`

existing-modify:

- `src/routes/(protected)/dashboard/+page.svelte`

### Phase 4A

File-map status (as of `2026-03-10`): **partial** (files exist; context behavior work remaining).

new-create:

- none

existing-modify:

- `src/lib/components/contracts/DashboardContractsPanel.svelte`
- `src/lib/components/contracts/ContractCard.svelte`
- `src/lib/components/contracts/ContractDrawer.svelte`
- `src/lib/components/contracts/ContractActions.svelte`
- `src/lib/stores/contract.store.ts`
- `src/routes/(protected)/dashboard/+page.svelte`

new-create:

- `src/lib/components/contracts/ContractContextSummary.svelte`
- `src/lib/components/contracts/actions/ContractActionBar.svelte`
- `src/lib/components/contracts/actions/CompleteContractButton.svelte`
- `src/lib/components/contracts/actions/AcceptContractButton.svelte`
- `src/lib/components/contracts/actions/CancelContractButton.svelte`
- `src/lib/components/contracts/actions/DisputeContractButton.svelte`
- `src/lib/components/contracts/actions/ResolutionProposalButton.svelte`

### Phase 4B

File-map status (as of `2026-03-10`): **remaining for new service-quote acceptance files**.

new-create:

- `src/lib/utils/service-quote/accept.ts`
- `src/lib/utils/service-quote/acceptance-ledger.ts`
- `src/lib/utils/service-quote/reconciliation.ts`
- `src/lib/utils/service-contract/create-from-snapshot.ts`

existing-modify:

- `src/lib/utils/escrow/v1/escrow.ts`
- `src/lib/utils/escrow/v1/nostrContract.ts`
- `src/lib/utils/escrow/v1/escrowEvents.ts`
- `src/lib/components/contracts/DashboardContractsPanel.svelte`
- `src/lib/components/contracts/ContractActions.svelte`
- `src/lib/components/contracts/TaskCompletionModal.svelte`
- `src/lib/stores/contract.store.ts`

### Phase 4C

File-map status (as of `2026-03-10`): **remaining**.

new-create:

- `src/lib/utils/service-instant-buy/eligibility.ts`
- `src/lib/utils/service-instant-buy/create.ts`
- `src/lib/utils/service-instant-buy/time-derivation.ts`
- `src/lib/components/service/ServiceInstantBuyModal.svelte`

existing-modify:

- `src/lib/types/service.d.ts`
- `src/lib/stores/service.store.ts`
- `src/lib/nostr/service.ts`
- `src/lib/components/service/steps/ServicePricing.svelte`
- `src/routes/(protected)/dashboard/create-service/+page.svelte`
- `src/lib/components/service/ServiceDetailsView.svelte`
- `src/lib/components/service/ServiceTierSelector.svelte`
- `src/lib/utils/escrow/v1/escrow.ts`
- `src/lib/utils/escrow/v1/nostrContract.ts`
- `src/lib/components/contracts/DashboardContractsPanel.svelte`
- `src/lib/stores/contract.store.ts`
- `src/lib/api/services/push-notification.service.ts`

### Phase 5

File-map status (as of `2026-03-10`): **partial** (baseline CI/i18n files exist; service-quote E2E files missing).

new-create:

- `tests/e2e/service-quotes-tasker.spec.ts`
- `tests/e2e/service-quotes-taskee.spec.ts`
- `tests/e2e/service-quotes-contracts.spec.ts`
- `tests/e2e/service-instant-buy.spec.ts`

existing-modify:

- `static/locales/en/common.json`
- `static/locales/es/common.json`
- `static/locales/en/error.json`
- `static/locales/es/error.json`
- `.gitlab-ci.yml`
- `playwright.config.ts`
- `scripts/e2e-ordered.js`
- `package.json`

existing-keep:

- `tests/e2e/01-signup-onboarding.spec.ts`
- `tests/e2e/02-credentials-login.spec.ts`
- `tests/e2e/03-wallet-post-login.spec.ts`
- `tests/e2e/04-messages-start-new-chat.spec.ts`
- `tests/e2e/tasks-page.spec.ts`
- `tests/e2e/fixtures/auth.ts`
- `tests/e2e/fixtures/passkey-auth-from-file.ts`
- `tests/e2e/fixtures/signup-login-auth.ts`
- `tests/e2e/utils/auth-helpers.ts`
- `tests/e2e/utils/webauthn-credentials.ts`

### Ownership and handoff rules

1. Every phase has a single primary implementer for listed files.
2. Files touched in multiple phases require explicit handoff note at phase close.
3. Later phases may not rewrite earlier phase behavior without adding/adjusting gate tests in both phases.

### Do-not-touch list (unless explicitly required by phase scope)

- `src/lib/utils/nostr-bid.ts`
- task bid routes/components not related to shared abstraction extraction

---

## 17. CI Enforcement and Telemetry Gates

Current implementation status: **partial**.

1. GitLab baseline jobs currently implemented:
   - `merge_request_event`: `build`, `coverage`
   - push to `dev`/`master`: `build`, `coverage` (plus branch deploy job)
   - other branch pushes: `build`, `unit`
2. New required jobs:
   - `service-quote-gates` (non-E2E phase gate suites)
   - `service-quote-e2e` (Playwright service quote suites plus any listing-plan homepage/service-discovery suites mapped to the same required job)
3. `service-quote-gates` job must execute:
   - `npm run check`
   - `npm run lint`
   - `npm run test:ci`
   - targeted phase gate suites defined in Section 15
4. `service-quote-e2e` job must execute:
   - `CI=1 npx playwright test tests/e2e/service-quotes-*.spec.ts --project=chromium --workers=1 --retries=0 --reporter=line`
   - `CI=1 npx playwright test tests/e2e/service-quotes-*.spec.ts --project='Mobile Safari' --workers=1 --retries=0 --reporter=line`
   - when `S4-H1` is in scope, also execute `tests/e2e/homepage-featured-services*.spec.ts` for Chromium + Mobile Safari under the same required job
5. CI must fail when any required phase-gate suite is missing, or when either required job is not configured as merge-required.
6. Current `.gitlab-ci.yml` Playwright job is commented out in baseline; Phase 5 gate remains blocked until Playwright is enabled and required.
7. When enabling Playwright in CI, run `npx playwright test ...` directly in CI jobs (do not use `npm run test:e2e`, which clears `CI` for child Playwright execution).
8. Add telemetry events:
   - `service_quote_invalid_event_dropped`
   - `service_quote_accept_race_blocked`
   - `service_quote_accept_chain_verify_failed`
   - `service_quote_unknown_context_type`
   - `service_quote_publish_quorum_failed`
9. Phase completion requires telemetry assertions for expected event emission.
10. Telemetry assertion minimums per phase:
   - at least 1 positive-path assertion (event emitted with required payload keys)
   - at least 1 negative-path assertion (event emitted with error reason code)
   - CI fails if telemetry assertion tests are missing for modified phase scope.

---

## 18. Cross-Document Consistency Requirements

Current implementation status: **partial**.

1. `requirements/services-listing-feature-plan.md` must not state that service proposals reuse task bid infrastructure.
2. Any conflicting docs must reference this file as authoritative for service quote/proposal protocol.
3. AI builder implementation must stop on conflicting requirements until docs are aligned.
4. Required listing-plan alignments (minimum):
   - remove bid-kind reuse statements in proposal flow section
   - remove bid-event-structure reuse statements
   - remove acceptance criteria that require bid-like proposal events
   - align dashboard routing references to `/dashboard?tab=...` contract
   - remove stale `✅ implemented` quote/proposal acceptance claims that are still placeholder in code
   - explicitly mark service listing/search/create/edit/detail and current dashboard/contracts surfaces as implemented baseline
   - enforce `S4-Q4` as non-funded tasker lifecycle only; escrow-funded `accepted` + contracts handoff remains Phase `4B`
   - use canonical request publish adapter path `src/lib/utils/service-quote/publish.ts` (do not introduce `request-publish.ts`)
   - include one canonical dashboard parser contract for `tab/view/context/service/request/highlight` with deterministic sanitization defaults
   - split proposal/status/resolver work into atomic IDs (`S4-Q2A`, `S4-Q2B`, `S4-Q2C`) with one gate per ID
   - include explicit cross-document traceability matrix mapping listing IDs to quote phases/gates/CI jobs
   - include explicit "Forbidden Before Phase 4B" checklist for funded accept/handoff behaviors

---

## 19. Guardrails for AI Builder Execution

Current implementation status: **partial**.

1. Do not route service quote state through task-only stores/actions.
2. Keep service quote modules isolated under `service-quote` domain paths.
3. All cross-domain behavior must pass through explicit adapter interfaces.
4. Complete compatibility gates before enabling new service quote writes.
5. Use Unix seconds only for quote/proposal timestamps.
6. Enforce phase gates; do not enable acceptance UI before Phase 4B gate passes.
7. Do not use floating-point arithmetic in USDT->RBTC conversion in acceptance path.
8. Do not emit terminal `accepted` without verified on-chain linkage.
9. Do not recreate existing service listing, dashboard, or contract foundations; extend baseline files in place.
10. Replace placeholder quote-request handlers with protocol publish flow; do not add parallel quote request UI paths.
11. Keep service contract post-delivery UX on the shared contracts surface; do not add a service-only completion/dispute/cancel flow.
12. Service contract completion must surface the agreement snapshot and use service wording when `contextType='service'`.
13. Instant buy must reuse service detail, service tier selector, shared modal/drawer primitives, and shared service contract creation paths; do not add a parallel order-management subsystem.
14. Eligible instant-buy listings must keep `Request Quote` visible on the same detail surface as the negotiated fallback.

---

## 20. Success Criteria

Current implementation status: **target state (remaining)**.

1. Service quote/proposal lifecycle is fully functional in adjacent domain.
2. Proposal acceptance validates authorization, start/end times, and non-expired action timestamp.
3. USDT canonical pricing and RBTC conversion are deterministic and integer-based.
4. Service proposal acceptance creates exactly one escrow per proposal with auditable context linkage.
5. Contracts UX is unified with reliable task/service filtering.
6. Existing task bid and task contract functionality remains regression-free.
7. Existing service listing/browse/detail/create/edit functionality remains regression-free.
8. Post-delivery service contract UX reuses the same contract actions/completion surfaces as tasks, with service-aware wording and full agreement visibility.
9. Instant buy for eligible fixed/tiered services is fully functional from service detail -> confirmation -> contract creation -> contracts redirect, while custom work still flows through `Request Quote`.
10. Plan can be executed phase-by-phase by AI builders without ambiguous ownership or conflicting docs.

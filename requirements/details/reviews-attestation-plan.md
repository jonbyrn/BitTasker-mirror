# Reviews Attestation Implementation Plan

## 1. Overview

This document defines the implementation plan for rebuilding reviews on top of `feat/find-services` using a **platform-attested review model** instead of the current Merkle/ZK design.

Reviews remain **user-authored Nostr events**. BitTasker issues a **platform-signed attestation event** on Nostr only after privately verifying that the reviewer controlled the correct Nostr identity and wallet for a completed, reviewable settlement.

This plan is intentionally generalized for:

- task settlements
- service-booking settlements
- multiple chains
- multiple escrow/booking contract versions
- multiple assets, including at least RBTC and USDT

This plan replaces the prior proof-centric review architecture. `feat/reviews` is a **donor branch for reusable UI and helper code**, not the implementation base.

The attestation backend is a **separate project** that lives in its own folder inside this repository during development. It is not part of the main SvelteKit application/runtime and must not be merged into the existing static-site worker or front-end app modules as an ad hoc server layer.

### 1.1 Execution Authority

This document is the implementation authority for the review rebuild on the new reviews branch forked from `feat/find-services`. Existing Merkle/ZK review docs are reference only and must not override the scope or sequencing here.

Backend boundary rule:

- the review attestation backend is developed in-repo for convenience, versioning, and local integration testing
- the backend remains a separate deployable project with its own entrypoint, configuration, tests, and runtime assumptions
- the backend must be exercised locally during implementation against the app and test fixtures so API, signing, relay, and settlement-resolution behavior are validated continuously rather than deferred to late integration

### 1.2 Primary Goals

- Ship a review system that works on `feat/find-services`
- Support both task and service-booking review flows
- Support current and future contract upgrades across multiple chains/assets
- Keep reviews publicly verifiable through Nostr without exposing wallet addresses or escrow IDs
- Avoid durable product records linking `npub` to wallet address
- Reuse and adapt the approved existing review UI/components from `feat/reviews`

### 1.3 Non-Goals

- No ZK proofs or Merkle trees
- No backend storage of review content as source of truth
- No public on-chain reconstruction of the reviewed settlement from the review itself
- No guarantee that the platform never transiently sees `npub` and wallet together during attestation issuance

## 2. Product Decision Summary

### 2.1 Review Trust Model

The trust claim is:

- “BitTasker verified this reviewer was an eligible participant in a completed settlement and approved this review.”

The trust claim is not:

- “Anyone can independently reconstruct the exact settlement from the public review payload.”

### 2.2 Public Artifacts

Public Nostr artifacts:

- `review event` authored by the reviewer
- `review attestation event` authored by BitTasker

Trusted HTTPS artifact:

- `issuer key registry` listing currently valid review-attestation signer pubkeys

### 2.3 Private Verification Inputs

Private attestation inputs are:

- reviewer `npub`
- reviewee `npub`
- reviewer wallet address
- reviewee wallet address
- `subjectType`
- `subjectId`
- `settlementType`
- `settlementId`
- `chain`
- `asset`
- `contractAddress`
- signed review event
- Nostr challenge signature
- wallet challenge signature

These are **lookup hints and proofs**, not trusted facts. The backend must derive the authoritative settlement state itself.

### 2.4 MVP Policy Decisions

The following policy decisions are locked for MVP:

- reviews are immutable after publication
- review content must be translated exactly once before publication by a separate translation backend so the canonical public review payload includes both English and Spanish text
- revocation events are out of scope for the first attestation MVP
- orphaned attestations expire after a short TTL frozen during Phase 0
- a review with a missing, malformed, expired, or untrusted attestation is rendered as invalid and excluded from verified review surfaces
- duplicate review events referencing the same attestation are invalid; the attestation is single-review by contract
- a valid completed contract remains reviewable even if the originating task/service event was deleted before the review was written
- deleted tasks/services must not invalidate existing reviews; the UI must degrade to deleted-source fallback copy instead of failing closed

### 2.5 Phase 0 Specification Freeze

Before implementation begins, the following artifacts must be frozen and reviewed:

- protocol schemas
- public-field matrix for review and attestation events
- review translation adapter contract, including source-language rules and one-time translation policy
- contract-state inventory and canonical outcome-mapping rules
- resolver matrix
- uniqueness-ledger atomicity design
- privacy/logging rules
- Nostr kind constants and registry keys
- canonical Nostr challenge-signing format
- canonical wallet-signature format and verification version
- orphaned-attestation TTL and cleanup policy
- private `settlementId` handling policy
- routing contract for dashboard, earning, and `/reviews` deep links

No coding should begin beyond scaffolding and failing tests until those artifacts are frozen.

### 2.6 Swarm Execution Prerequisites

This plan is intended to be implemented by multiple agents in parallel. Parallel implementation is allowed only after the following foundations are created and frozen:

- a shared contracts package for review schemas, error codes, kind constants, and test fixtures
- a backend project scaffold with fixed folder layout and local run/test scripts
- an ownership matrix assigning disjoint write scopes to each implementation wave
- a dependency graph identifying which workstreams are parallel-safe and which are blocked on foundation outputs

Required foundation package:

- `packages/reviews-contracts/`

This package is the single source of truth for:

- API request and response schemas
- public Nostr review content schemas
- public Nostr attestation content schemas
- custom kind constants
- canonical error-code enums
- signer challenge payload types
- reusable test fixture builders shared by backend and app tests

No frontend or backend agent may define duplicate local copies of these contracts after the package exists.

Wave 0 frozen contract outputs:

- canonical Zod schemas for every backend request/response DTO
- canonical review event payload schema
- canonical attestation event payload schema
- canonical challenge payload schema and signing message format
- canonical error-code enum
- canonical Nostr kind constants
- canonical public-field matrix
- canonical fixture builders used by backend and app tests

Wave 0 supersession rule:

- once these outputs exist in `packages/reviews-contracts/`, they supersede every illustrative schema example elsewhere in this document
- later sections may explain behavior, but they must not redefine field sets, field names, or payload ownership
- if an example outside `packages/reviews-contracts/` conflicts with the frozen outputs, the example must be removed or rewritten in the same change set

### 2.7 Implementation Progress Ledger

The plan must also function as a live execution document.

Required progress-tracking rules:

- each workstream must include a checklist that can be updated as items are completed
- implementing agents must update sidecar execution notes as work lands
- each completed item must reference the implemented module(s), route(s), or test suite(s) in short form
- if an implementation diverges from the plan, the plan must be updated in the same change set
- no workstream is considered complete unless its checklist, tests, and dependency notes are updated in the sidecar execution files and reconciled into this document by the `Plan Ledger Owner` at checkpoint time
- implementation summaries produced by the AI at the end of the build must include a dedicated `Human Actions Required` section listing every manual step that still must be performed outside code changes

This requirement exists so parallel agents and later reviewers can determine exactly what has already been implemented without re-auditing the entire branch from scratch.

Ledger serialization rule:

- one `Plan Ledger Owner` is responsible for reconciling the master plan file at each checkpoint
- implementing agents must not edit the master plan file concurrently
- implementing agents must update per-workstream execution notes or checkpoint notes in the dedicated tracking folder, and then the `Plan Ledger Owner` merges that state into this document
- the sidecar execution notes are the authoritative live status during an active wave
- the master plan is the authoritative checkpoint snapshot after reconciliation by the `Plan Ledger Owner`

Required tracking folder:

- `plans/reviews-attestation-execution/`

Required tracking files:

- one status file per workstream
- one checkpoint summary per checkpoint
- one open-risks file for newly discovered blockers that require plan changes
- one governance registry file recording DRIs, backups, approvers, and the `Plan Ledger Owner`
- one checkpoint evidence file per checkpoint listing exact passing commands and frozen interfaces/modules
- one `human-actions.md` file tracking required manual follow-up steps, owners, and completion state

Required status-file fields:

- workstream id
- DRI
- backup
- owned paths
- status enum: `not_started | in_progress | blocked | ready_for_checkpoint | complete`
- dependencies
- open blockers with severity and owner
- tests added or updated
- touched modules
- last-updated timestamp
- checkpoint-ready flag

Required checkpoint-summary fields:

- checkpoint id
- approver
- active branches or worktrees
- merge/rebase status
- workstreams included
- open blockers by severity with disposition
- impacted downstream workstreams
- required evidence links or file references
- explicit go/no-go decision for the next wave

## 3. Engineering Principles

### 3.1 TDD

Every new module in this plan must be delivered test-first:

- write or extend failing unit/component tests first
- implement the minimum logic to satisfy the tests
- refactor only after behavior is locked
- add regression tests for each bug found during implementation

Minimum expectation:

- no new review module ships without targeted tests
- no integration point is changed without at least one regression test

### 3.2 Defensive Programming

The implementation must assume invalid, stale, partial, or malicious inputs:

- validate all client-provided identifiers before use
- treat contract address as a routed hint, never as authority
- reject mismatched reviewer/reviewee/signature combinations
- tolerate stale relay state and missing referenced events
- explicitly handle partial failures in service quote/contract sync paths
- avoid silent fallback behavior for review eligibility decisions

### 3.3 Deterministic Programming

Deterministic behavior is required anywhere the client and platform may otherwise diverge:

- canonical review eligibility rules
- canonical attestation validation rules
- canonical review status derivation
- deterministic filtering of reviewable settlements
- deterministic winner/visibility rules for malformed or superseded review data

All user-facing review states must be derivable from explicit state machines or typed status helpers, not ad hoc booleans spread through components.

### 3.4 Privacy Discipline

The platform will necessarily see wallet + `npub` linkage during attestation verification. The implementation must ensure that linkage is not turned into durable review-system data.

Required controls:

- do not store wallet signatures after verification
- do not store wallet address + `npub` together in the review uniqueness ledger
- do not expose wallet address, escrow ID, or tx hash in public review/attestation events
- scrub logs, traces, analytics, and error reporting to avoid persistent identifier linkage

## 4. Normalized Review Domain Model

### 4.1 Core Abstractions

The review system must not be built around one escrow contract. It must normalize all reviewable settlements into a common shape.

Internal normalized model:

```ts
type ReviewSubjectType = 'task' | 'service_booking';
type ReviewSettlementType = 'escrow' | 'service_quote_contract' | 'instant_buy_contract';
type ReviewRole = 'tasker' | 'taskee' | 'client' | 'freelancer' | 'provider';
type ReviewChain = 'rsk' | 'bsc';
type ReviewAsset = 'rbtc' | 'usdt';
type ReviewBlockchainState =
	| 'funded'
	| 'in_dispute'
	| 'dispute_resolved'
	| 'dispute_unresolved'
	| 'completed'
	| 'cancelled'
	| 'refunded'
	| 'funds_released'
	| 'funds_claimed'
	| 'no_show'
	| 'work_in_progress'
	| 'in_dispute_wip';
type ReviewContractOutcome =
	| 'completed'
	| 'disputed_resolved_payout'
	| 'disputed_resolved_refund'
	| 'refunded';

interface ReviewableSettlementRecord {
	subjectType: ReviewSubjectType;
	subjectId: string;
	settlementType: ReviewSettlementType;
	settlementId: string;
	chain: ReviewChain;
	asset: ReviewAsset;
	contractAddress: string;
	contractVersion: string;
	reviewerRole: ReviewRole;
	revieweeRole: ReviewRole;
	reviewerNpub?: string;
	revieweeNpub?: string;
	reviewerWallet?: string;
	revieweeWallet?: string;
	blockchainState: ReviewBlockchainState;
	completedAt: number;
	reviewableAt: number;
	contractOutcome: ReviewContractOutcome;
	status: 'reviewable' | 'already_reviewed' | 'not_reviewable';
	sourceVisibility: 'public_present' | 'public_deleted' | 'public_unknown';
	sourcePresentation: {
		label?: string;
		href?: string | null;
	};
	sourceRefs: {
		escrowId?: string;
		quoteRequestId?: string;
		proposalId?: string;
		instantOrderId?: string;
	};
}
```

Authoritative smart-contract state inventory:

- `funded`
- `in_dispute`
- `dispute_resolved`
- `dispute_unresolved`
- `completed`
- `cancelled`
- `refunded`
- `funds_released`
- `funds_claimed`
- `no_show`
- `work_in_progress`
- `in_dispute_wip`

These states come from the smart contract and are the canonical source of truth for reviewability mapping.

Secondary app/UI pending states:

- pending and Nostr-only UI states may still exist in the app for optimistic UX, but they must never be treated as authoritative for review eligibility
- the resolver must map from the authoritative smart-contract state inventory above, not from pending UI status labels

### 4.2 Uniqueness Ledger

Hard uniqueness remains platform-enforced and requires a small private stateful ledger.

Minimum durable key:

- `(subjectType, subjectId, settlementType, settlementId, reviewerRole)`

Minimum stored data:

- uniqueness key
- status
- attestation event id
- review event id
- timestamps

The ledger must not require durable storage of wallet + `npub` linkage.

### 4.3 Resolver Matrix

The following matrix must be implemented and kept explicit in code and tests.

| Flow                     | Chain | Asset  | Settlement Type          | Subject Type      | Settlement ID Source             | Reviewable Terminal Outcome Codes                                               |
| ------------------------ | ----- | ------ | ------------------------ | ----------------- | -------------------------------- | ------------------------------------------------------------------------------- |
| Task escrow              | `rsk` | `rbtc` | `escrow`                 | `task`            | escrow contract id               | `completed`, `disputed_resolved_payout`, `disputed_resolved_refund`, `refunded` |
| Task escrow              | `bsc` | `usdt` | `escrow`                 | `task`            | escrow contract id               | `completed`, `disputed_resolved_payout`, `disputed_resolved_refund`, `refunded` |
| Service quote acceptance | `rsk` | `rbtc` | `service_quote_contract` | `service_booking` | accepted quote-created escrow id | `completed`, `disputed_resolved_payout`, `disputed_resolved_refund`, `refunded` |
| Service quote acceptance | `bsc` | `usdt` | `service_quote_contract` | `service_booking` | accepted quote-created escrow id | `completed`, `disputed_resolved_payout`, `disputed_resolved_refund`, `refunded` |
| Service instant buy      | `rsk` | `rbtc` | `instant_buy_contract`   | `service_booking` | instant-buy-created escrow id    | `completed`, `disputed_resolved_payout`, `disputed_resolved_refund`, `refunded` |
| Service instant buy      | `bsc` | `usdt` | `instant_buy_contract`   | `service_booking` | instant-buy-created escrow id    | `completed`, `disputed_resolved_payout`, `disputed_resolved_refund`, `refunded` |

Additional rules:

- each resolver must define how `subjectId`, `settlementId`, reviewer wallet, reviewee wallet, reviewer `npub`, and reviewee `npub` are derived
- each resolver must normalize the contract outcome into the canonical `ReviewContractOutcome` enum
- each resolver must define supported contract versions
- unsupported contract versions must fail closed
- new chains/assets must be added by extending the matrix and its test suite, not by ad hoc conditional logic
- resolver reviewability must never depend on the originating task/service event still existing if the settlement record is otherwise valid
- resolver output must include enough presentation context to render deleted-source fallback labels without exposing sensitive settlement identity
- attestation issuance must fail closed unless the resolver reports a reviewable terminal outcome where funds have already left contract custody

Required contract-state to outcome mapping:

- `funds_released` -> `completed` -> reviewable
- `funds_claimed` -> `completed` -> reviewable
- `dispute_resolved` -> `disputed_resolved_payout` or `disputed_resolved_refund` -> reviewable
- `dispute_unresolved` -> `refunded` -> reviewable
- `refunded` -> `refunded` -> reviewable
- `cancelled` -> `refunded` -> reviewable only when blockchain records show funds were previously in contract custody and were returned
- `funded`, `work_in_progress`, `completed`, `in_dispute`, `in_dispute_wip`, `no_show` -> not reviewable

Disambiguation rule:

- the resolver must determine whether `dispute_resolved` is payout vs refund from the settled fund distribution, not from UI copy or heuristics
- the resolver must reject attestation issuance if outcome classification cannot be determined exactly

## 5. Architecture

### 5.1 Public Review Flow

1. User drafts the review locally.
2. Client calls a separate translation backend exactly once for the authored review text and receives the canonical bilingual review content.
3. Client builds the canonical public review content payload from that bilingual content and computes a deterministic `reviewDraftHash` from that payload.
4. Client requests attestation from HTTPS API, sending the review draft and later the required proofs.
5. Backend validates settlement eligibility and identity proofs.
6. Backend publishes a BitTasker-signed attestation event to Nostr referencing the exact `reviewDraftHash`.
7. Backend returns the `attestationEventId`.
8. Client publishes the final review event to Nostr, referencing that attestation and carrying the same `reviewDraftHash`.
9. Readers verify the review locally using the review event, attestation event, shared `reviewDraftHash`, and HTTPS issuer registry.

### 5.2 HTTPS Trust Anchor

Keep issuer-key discovery on HTTPS.

Required endpoint:

- `GET /review-attestation-issuers`

Returns:

- active issuer pubkeys
- key ids
- validity windows
- retired/revoked issuer metadata
- schema version

Reason:

- easier key rotation
- no second root Nostr governance key
- simpler deterministic trust bootstrap

### 5.3 Protocol Contract

The API and event contracts must be explicit, versioned, and defined in one canonical source only.

Canonical contract source:

- `packages/reviews-contracts/`

All generated/shared types, Zod schemas, fixtures, endpoint documentation, and app/backend consumers must derive from that package. The examples in this section are canonical and override any contradictory examples elsewhere in the plan.

Required endpoints:

- `POST /review-attestations/challenge`
- `POST /review-attestations`
- `GET /review-attestation-issuers`

External dependency endpoint:

- `POST /review-translations` on the separate translation backend

Translation request:

```json
{
	"schemaVersion": 1,
	"sourceLanguage": "en|es",
	"comment": "<authored review text>"
}
```

Translation response:

```json
{
	"schemaVersion": 1,
	"sourceLanguage": "en|es",
	"content": {
		"en": {
			"comment": "<english review text>"
		},
		"es": {
			"comment": "<spanish review text>"
		}
	}
}
```

Challenge request:

```json
{
	"reviewDraftHash": "<lowercase-hex-sha256>",
	"subjectType": "task|service_booking",
	"subjectId": "<subject-id>",
	"settlementType": "escrow|service_quote_contract|instant_buy_contract",
	"settlementId": "<settlement-id>",
	"chain": "rsk|bsc",
	"asset": "rbtc|usdt",
	"contractAddress": "<chain-address>",
	"reviewerNpub": "<npub>",
	"revieweeNpub": "<npub>",
	"reviewerWallet": "<chain-address>",
	"revieweeWallet": "<chain-address>"
}
```

Challenge response:

```json
{
	"schemaVersion": 1,
	"challengeId": "<opaque-id>",
	"challengeMessage": "<canonical-signing-message>",
	"issuedAt": 0,
	"expiresAt": 0
}
```

Attestation request:

```json
{
	"schemaVersion": 1,
	"reviewDraftHash": "<lowercase-hex-sha256>",
	"signedReviewEvent": { "...": "nostr event" },
	"challengeId": "<opaque-id>",
	"challengeMessage": "<canonical-signing-message>",
	"nostrChallengeSignature": "<lowercase-hex>",
	"walletChallengeSignature": "<lowercase-hex>",
	"subjectType": "task|service_booking",
	"subjectId": "<subject-id>",
	"settlementType": "escrow|service_quote_contract|instant_buy_contract",
	"settlementId": "<settlement-id>",
	"chain": "rsk|bsc",
	"asset": "rbtc|usdt",
	"contractAddress": "<chain-address>",
	"reviewerNpub": "<npub>",
	"revieweeNpub": "<npub>",
	"reviewerWallet": "<chain-address>",
	"revieweeWallet": "<chain-address>"
}
```

Attestation response:

```json
{
	"schemaVersion": 1,
	"status": "ok",
	"attestationEventId": "<nostr-event-id>",
	"issuerPubkey": "<hex-pubkey>",
	"reviewDraftHash": "<lowercase-hex-sha256>",
	"issuedAt": 0
}
```

Issuer registry response:

```json
{
	"schemaVersion": 1,
	"issuers": [
		{
			"keyId": "<kid>",
			"pubkey": "<hex-pubkey>",
			"status": "active|retired",
			"validFrom": 0,
			"validUntil": 0
		}
	]
}
```

Attestation event payload:

```json
{
	"schemaVersion": 1,
	"reviewDraftHash": "<lowercase-hex-sha256>",
	"subjectType": "task|service_booking",
	"settlementType": "escrow|service_quote_contract|instant_buy_contract",
	"reviewerPubkey": "<hex-pubkey>",
	"revieweePubkey": "<hex-pubkey>",
	"reviewerRole": "<role>",
	"revieweeRole": "<role>",
	"contractOutcome": "completed|disputed_resolved_payout|disputed_resolved_refund|refunded",
	"issuedAt": 0,
	"expiresAt": 0,
	"keyId": "<kid>"
}
```

Review event payload:

```json
{
	"schemaVersion": 1,
	"reviewDraftHash": "<lowercase-hex-sha256>",
	"subjectType": "task|service_booking",
	"settlementType": "escrow|service_quote_contract|instant_buy_contract",
	"revieweePubkey": "<hex-pubkey>",
	"reviewerRole": "<role>",
	"revieweeRole": "<role>",
	"contractOutcome": "completed|disputed_resolved_payout|disputed_resolved_refund|refunded",
	"createdAt": 0,
	"rating": { "...": "review category ratings" },
	"content": {
		"sourceLanguage": "en|es",
		"en": {
			"comment": "<english review text>"
		},
		"es": {
			"comment": "<spanish review text>"
		}
	},
	"attachments": []
}
```

Review reply event payload:

```json
{
	"schemaVersion": 1,
	"parentReviewEventId": "<nostr-event-id>",
	"revieweePubkey": "<hex-pubkey>",
	"createdAt": 0,
	"content": {
		"sourceLanguage": "en|es",
		"en": {
			"comment": "<english reply text>"
		},
		"es": {
			"comment": "<spanish reply text>"
		}
	},
	"attachments": []
}
```

Required canonical error codes:

- `translation_invalid`
- `translation_failed`
- `contract_outcome_invalid`
- `challenge_expired`
- `challenge_invalid`
- `nostr_signature_invalid`
- `wallet_signature_invalid`
- `issuer_unavailable`
- `resolver_not_found`
- `unsupported_contract`
- `settlement_not_reviewable`
- `participant_mismatch`
- `duplicate_review_slot`
- `duplicate_review_reply`
- `reply_event_invalid`
- `reply_not_allowed`
- `attestation_publish_failed`
- `review_event_invalid`

Nostr note:

- exact custom kind numbers must be locked during Phase 0 and stored in shared constants before implementation work begins
- review and attestation events are immutable regular kinds, not replaceable kinds
- Phase 0 must also freeze the exact canonical challenge string format, field ordering, and signing expectations across local dev, Worker runtime, and tests
- signature encoding must be frozen to one canonical wire format; MVP default is lowercase hex strings, not `hex-or-base64`

Canonical Nostr linkage model for MVP:

- the client computes a canonical `reviewDraftHash` from the public review payload before publish
- the backend attests that `reviewDraftHash`
- the client publishes the final review event referencing the attestation and carrying the same `reviewDraftHash`
- readers verify attestation against `reviewDraftHash`, not against a pre-attestation review event id

Canonical review reply model for MVP:

- replies are plain public Nostr events and are not platform-attested
- exactly one reply is allowed per canonical review
- the only valid reply author is the original reviewee
- replies are not threaded; replies to replies are forbidden
- replies are immutable for MVP; edit/replace flows are forbidden
- if multiple reply events exist for the same review, clients must deterministically keep the earliest valid reply and ignore later duplicates
- replies do not affect rating aggregates or review-attestation validity
- reply content follows the same one-time translation flow and bilingual public payload contract as reviews
- reviews and replies support media attachments using the existing upload-service + `MediaUploader.svelte` flow; attachments are public and must follow the same attachment schema used elsewhere in the app
- reviews and replies must match the existing completion-evidence upload profile used in `TaskCompletionModal.svelte`:
  - `maxFiles = 5`
  - `maxFileSize = 10` MB
  - `allowedTypes = ['image/*', 'video/*']`
  - `maxDuration = 300` seconds for video
  - `enableImageCompression = true`
  - `useCloudflare = true`
  - `generateVariants = true`
- reviews and replies must not introduce document-only or arbitrary file uploads in MVP; image and video are the only allowed attachment classes
- reply image attachments must render using the existing thumbnail-plus-lightbox `Gallery` pattern already used in `ContractDrawer.svelte`, `TaskDetailsView.svelte`, and `ServiceDetailsView.svelte`
- reply non-image attachments must degrade to the same compact inline preview/download treatment already used for attachment rendering elsewhere in the app rather than inventing a reply-only media presentation

Required tag/link contract to freeze in `packages/reviews-contracts/`:

- exact tag used by the review to reference the attestation event
- exact field used by the attestation to reference the `reviewDraftHash`
- exact field or tag used by the review to carry the same `reviewDraftHash`
- relay hints are not included in the MVP event contract
- exact field names for any duplicated review/attestation identifiers in event content
- exact bilingual review-content schema and canonical field ordering used to derive `reviewDraftHash`

Locked public-field matrix for MVP:

| Field                                 | Review Event             | Attestation Event | Policy               |
| ------------------------------------- | ------------------------ | ----------------- | -------------------- |
| `reviewDraftHash`                     | public                   | public            | required             |
| `subjectType`                         | public                   | public            | required             |
| `settlementType`                      | public                   | public            | required             |
| `reviewerPubkey`                      | implicit as event author | public            | required             |
| `revieweePubkey`                      | public                   | public            | required             |
| `reviewerRole`                        | public                   | public            | required             |
| `revieweeRole`                        | public                   | public            | required             |
| `contractOutcome`                     | public                   | public            | required             |
| `createdAt`                           | public                   | forbidden         | required in review   |
| bilingual review content (`en`, `es`) | public                   | forbidden         | required in review   |
| `subjectId`                           | forbidden                | forbidden         | private backend only |
| `settlementId`                        | forbidden                | forbidden         | private backend only |
| wallet address                        | forbidden                | forbidden         | private backend only |
| escrow id                             | forbidden                | forbidden         | private backend only |
| tx hash                               | forbidden                | forbidden         | private backend only |

Locked public-field matrix for MVP replies:

| Field                                   | Reply Event                                    | Policy                         |
| --------------------------------------- | ---------------------------------------------- | ------------------------------ |
| `parentReviewEventId`                   | public                                         | required                       |
| `revieweePubkey`                        | implicit as event author and public in content | required                       |
| `createdAt`                             | public                                         | required                       |
| bilingual reply content (`en`, `es`)    | public                                         | required                       |
| `attachments`                           | public                                         | optional                       |
| wallet address / settlement identifiers | forbidden                                      | never allowed in reply payload |

### 5.4 Attestation Service

The attestation service is implemented as a Cloudflare Worker deployment target, and the core domain layer must stay free of Worker-only primitives.

Translation boundary rule:

- review translation is not implemented inside the reviews attestation backend
- the attestation backend consumes the canonical bilingual review payload supplied by the client after translation by the separate translation backend
- the app must stop using `VITE_GOOGLE_TRANSLATE_API_KEY` or any direct browser translation API calls for review publication
- Phase 0 must define the review-translation adapter contract used by the app, but the separate translation backend remains out of scope for this review-attestation backend project
- until the separate translation backend exists, the app implementation must build against the adapter boundary and keep the review publication flow ready to consume the later backend without exposing translation secrets in the client

Required backend stack:

- Cloudflare Worker as the deployment target
- Hono for HTTP routing, middleware, and typed endpoint composition
- Zod and `@hono/zod-openapi` for schema validation and contract documentation
- `viem` for EVM chain reads, address normalization, and wallet-signature verification
- `nostr-tools` for `npub` decoding, Nostr event verification/signing, and relay publication
- Durable Objects for strongly consistent uniqueness and idempotency state

Required library choices:

- use `viem` instead of `ethers` for the attestation backend because it is a better fit for modern TypeScript, explicit verification flows, and Worker-friendly deterministic code paths
- use `nostr-tools` instead of NDK in the backend because the backend needs a small deterministic issuance/publish surface, not client-oriented cache/session/subscription orchestration

Repository/deployment boundary:

- implement the backend in a dedicated top-level folder inside this repo
- keep its package configuration, entrypoint, tests, and runtime bindings separate from the main app
- do not merge the attestation backend into `workers-site/index.js`
- do not couple backend implementation details to SvelteKit route handlers

Local Worker development model:

- run the backend project locally with `wrangler dev`
- use a dedicated backend `wrangler.toml` rather than the app’s existing static-site worker config
- point the app’s local review-attestation API base URL to the backend worker during implementation
- use `.dev.vars` and Wrangler-managed secrets/bindings for local secrets
- persist local Durable Object state with a dedicated `--persist-to` path so idempotency/uniqueness behavior can be exercised repeatedly during development

Required responsibilities:

- issue Nostr challenge
- verify reviewer `npub` challenge signature
- verify wallet signature challenge
- resolve settlement via contract/service/task adapters
- enforce uniqueness
- publish attestation event to Nostr

Cloudflare-specific deployment rules:

- Worker handles request validation, challenge issuance, signature verification, resolver dispatch, and attestation construction
- strongly consistent uniqueness state must live in Durable Objects
- KV must not be used for uniqueness or issue-once guarantees
- issuer private keys and HMAC/signing secrets must live in Worker secrets, never in client config
- Nostr publish failures must be retriable via explicit recovery logic, not silent best effort

Local implementation/testing rules:

- local development must support running the backend project independently while the app runs against it
- attestation endpoints, signer configuration, relay publication, and resolver flows must be tested locally before any integration is considered complete
- the backend project must have its own focused unit/integration test suite in addition to app-side tests
- the default local manual workflow is `wrangler dev` for the backend project plus the app dev server pointed at that local backend
- local backend stateful flows must be exercised against Durable Objects, not mocked away entirely, before a workstream is considered complete
- use a dedicated local persistence directory for backend Worker state to keep attestation/idempotency testing reproducible

### 5.4.1 Attestation Abuse and Rate-Limit Policy

The attestation backend must implement explicit rate limiting and abuse controls. This is part of the MVP trust boundary and is not optional.

Required rate-limit keys:

- reviewer `npub`
- client IP
- wallet address hash
- settlement-slot key `(subjectType, subjectId, settlementType, settlementId, reviewerRole)`

Required endpoint policies:

- `POST /review-attestations/challenge`
  - limit to `5` requests per `5` minutes per reviewer `npub`
  - limit to `20` requests per `5` minutes per client IP
  - duplicate requests for the same settlement slot within the active challenge TTL must return the existing active challenge instead of minting a new one
- `POST /review-attestations`
  - limit to `3` requests per `10` minutes per reviewer `npub`
  - limit to `10` requests per `10` minutes per client IP
  - limit to `3` failed proof-verification attempts per `10` minutes per wallet address hash before a temporary cooldown is applied
  - requests that reuse the same valid idempotency/reservation key must return the same attestation result and must not count as a new successful issuance
- `GET /review-attestation-issuers`
  - serve through normal cache headers
  - no special per-user behavior
  - only apply a coarse IP safeguard if needed for abuse protection

Required abuse responses:

- rate-limited requests must return `429`
- `429` responses must include a deterministic machine-readable error code and `Retry-After`
- failed proof-verification and participant-mismatch attempts must be counted toward abuse thresholds even when attestation issuance never begins
- abuse controls must fail closed for attestation issuance and fail open for the rest of the review UI; users may be blocked from obtaining a new attestation but must still be able to view reviews

Required cooldown policy:

- repeated invalid proof attempts for the same wallet hash or reviewer `npub` must trigger a short cooldown
- the cooldown duration must be frozen in Phase 0 and tested as part of the backend runtime suite
- cooldown state must live in the same Durable Object / backend state model used for idempotency and uniqueness so parallel requests resolve deterministically

Required backend project shape:

- `reviews-attestation-backend/package.json`
- `reviews-attestation-backend/wrangler.toml`
- `reviews-attestation-backend/.dev.vars.example`
- `reviews-attestation-backend/vitest.config.ts`
- `reviews-attestation-backend/src/index.ts`
- `reviews-attestation-backend/src/http/*`
- `reviews-attestation-backend/src/domain/*`
- `reviews-attestation-backend/src/infrastructure/*`
- `reviews-attestation-backend/test/*`

Required local scripts:

- `backend:reviews:dev`
- `backend:reviews:test`
- `backend:reviews:test:runtime`
- `app:dev:with-reviews-backend`

The exact script names must be frozen during Phase 0 and then reused consistently by all agents.

### 5.5 State and Atomicity

Attestation issuance must be idempotent on:

- `(subjectType, subjectId, settlementType, settlementId, reviewerRole)`

Required state machine:

- `challenge_issued`
- `proof_verified`
- `eligibility_resolved`
- `attestation_reserved`
- `attestation_published`
- `review_published`
- `expired_without_review`

Required recovery rules:

- challenge expiry invalidates unsigned or stale requests
- uniqueness is reserved before attestation publish
- publish retries must reuse the same reservation key
- a successful attestation publish must not generate a second attestation for the same reservation
- orphaned attestations are marked `expired_without_review` after policy TTL if the review never appears
- review verification must reject mismatched or duplicated review/attestation pairings deterministically

### 5.6 Contract Registry + Resolver Layer

The backend must use a platform-owned registry:

```ts
interface ReviewContractRegistryEntry {
	chain: ReviewChain;
	asset: ReviewAsset;
	contractAddress: string;
	settlementType: ReviewSettlementType;
	resolverId: string;
	contractVersion: string;
	active: boolean;
}
```

The client submits `contractAddress`, and the backend verifies it against this registry and routes into the correct resolver.

Resolver families:

- task escrow resolver
- service quote acceptance resolver
- instant-buy service resolver
- RBTC contract-version resolvers
- USDT contract-version resolvers

### 5.7 Privacy Operations

Required implementation rules:

- no request-body logging on attestation endpoints
- no structured log entry may contain wallet address and `npub` together
- no analytics event may contain wallet address and `npub` together
- temporary debug logging must be development-only and disabled in production
- support tooling must read only the uniqueness ledger and attestation ids by default
- any direct access to raw attestation request payloads must be explicit, time-limited, and auditable
- no private settlement identifiers, wallet-linked values, or attestation-input fields may appear in URLs, query params, route state, local storage, session storage, client analytics, or client error payloads
- only frozen public deep-link keys from the Checkpoint A routing contract may appear in client navigation state

### 5.8 Nostr Event Handling

Review event:

- author: reviewer
- kind: immutable custom review kind
- references the attestation event
- contains review payload only

Attestation event:

- author: BitTasker issuer pubkey
- kind: immutable custom attestation kind
- references the exact `reviewDraftHash`
- contains only approval metadata required for verification

Public attestation content must not include:

- chain
- asset
- wallet address
- settlement ID
- escrow ID
- tx hash

### 5.9 Explicit Contracts for the AI Builder

The builder must not invent event shapes at implementation time.

Rules:

- Section `5.3 Protocol Contract` is the only canonical contract definition in this document
- `packages/reviews-contracts/` is the only canonical implementation location for those contracts
- app modules may consume or adapt shared contracts, but may not redefine cross-boundary request/response/event/status types locally
- if any contract example elsewhere conflicts with Section `5.3`, Section `5.3` wins and the conflicting example must be removed in the same plan update

Public identifier rule for MVP:

- raw task ids, readable task d-tags, service `uniqueId`, service address, and on-chain `escrowId` must be treated as non-opaque and must not be published in the attestation event
- `subjectId` and `settlementId` are private backend fields by default
- the public attestation omits both fields entirely
- the MVP does not expose surrogate public identifiers such as `subjectRef` or `settlementRef`

Public review-linking rule:

- if the task/service is deleted before review, the review must still be allowed as long as the settlement resolver marks it reviewable
- if the task/service is deleted after review, the review remains valid and the UI must render deleted-source fallback copy instead of a broken link

### 5.10 Route and Deep-Link Contract

Review integration must preserve the current routing split between:

- `/dashboard` for hiring-side flows
- `/earning` for provider-side flows

The builder must not hardcode review entry points into one side only.

Required route/deep-link touchpoints:

- `src/routes/(protected)/dashboard/+page.svelte`
- `src/routes/(protected)/earning/+page.svelte`
- `src/lib/utils/dashboardQuery.ts`
- `src/lib/utils/service-quote/dashboard-route.ts`
- `src/lib/utils/service-quote/services-workspace-route.ts`
- `src/lib/stores/service-quote-ui.store.ts`

Required behaviors:

- pending review CTA can route from contracts to review management
- service detail success flows can route into contracts with later review follow-up
- review management must preserve enough context to return to originating contract/service surface
- deep links must work for both task and service review sources
- query-param and route-state helpers must open the correct pending-review context deterministically from dashboard, earning, service detail, and contract surfaces

Checkpoint A routing contract must freeze:

- exact query keys
- exact route-state payload shape
- exact return-navigation payload shape
- exact helper API owned by:
  - `src/lib/utils/dashboardQuery.ts`
  - `src/lib/utils/service-quote/dashboard-route.ts`
  - `src/lib/utils/service-quote/services-workspace-route.ts`

Downstream UI agents must treat that routing contract as read-only after Checkpoint A.

### 5.11 Notification Contract

Review notifications must reuse the existing notification foundation already used by service quotes and contract actions.

Required notification delivery rules:

- reuse `src/lib/api/services/push-notification.service.ts` as the only push delivery entrypoint
- reuse `pushNotificationService`; do not create a parallel review-notification delivery stack
- reuse the existing push payload shape with `type`, `title`, `body`, `clickAction`, and `icon`
- reuse the existing service-worker click flow that reads `clickAction` / `click_action` and navigates via postMessage + app routing
- review push side effects must be non-blocking and idempotent, following the same pattern as `src/lib/utils/service-quote/notifications.ts`
- reuse the local side-effect ledger pattern already used for service-quote notifications so duplicate renders, retries, or reconnects do not emit duplicate review push notifications
- reuse the exact-focus deep-link pattern already used in service quote and service contract notifications; build review links with the existing dashboard/query helpers rather than hand-building route strings in multiple places
- local success/error/info feedback inside the app must reuse `appStore.showSuccessToast`, `appStore.showErrorToast`, and `appStore.showInfoToast`
- do not introduce a review-specific service worker; the existing `static/firebase-messaging-sw.js` click handling contract is the only supported push click path for MVP

Required existing app patterns to mirror:

- follow the non-blocking, deduped push side-effect structure used in `src/lib/utils/service-quote/notifications.ts`
- follow the exact push payload contract already consumed by `src/lib/api/services/push-notification.service.ts`
- follow the service-worker click behavior implemented in `static/firebase-messaging-sw.js`
- follow the existing local toast pattern implemented in `src/lib/stores/app.store.ts`

Required review notification types for MVP:

- `review_received`
  - delivery: push
  - recipient: reviewee
  - click action: deep link into `/reviews` with the relevant review highlighted
- `review_reply_received`
  - delivery: push
  - recipient: original reviewer
  - click action: deep link into `/reviews` with the parent review highlighted and its reply expanded
- `pending_review_reminder`
  - delivery: push only when explicitly enabled by later product wiring
  - recipient: eligible reviewer
  - click action: deep link into `/reviews` with the relevant pending review highlighted
  - throttling: reminders must be batched/throttled and must not fire on every render or poll cycle
- `review_publish_success`
  - delivery: local success toast only
  - recipient: reviewer
- `review_attestation_failed`
  - delivery: local error toast only
  - recipient: reviewer

Notification exclusions for MVP:

- no push notification for translation success/failure
- no push notification for intermediate attestation pipeline steps
- no separate notification type for attestation verification after successful publish

Required notification preference policy for MVP:

- reuse the existing notification preference model; do not add a review-specific preference schema in MVP
- `review_received` and `review_reply_received` must respect the existing global `push` channel gate exposed by `myNotificationPreferences`
- `pending_review_reminder` must remain disabled for push until later product wiring explicitly enables it
- do not overload unrelated category-specific toggles such as `pushMessages`, `pushPayments`, `pushBidUpdates`, or `pushTaskMatches` to carry review-specific meaning
- if no notification preference data is available, fail closed for push sends and keep the rest of the review UI working without notification delivery

Required notification implementation pattern:

- create one reusable review notification helper module that wraps `pushNotificationService`
- store deterministic dedupe keys for review push side effects using the same non-blocking side-effect pattern already used in service quote notifications
- centralize review click-action builders in one helper module and reuse them across notification emitters, foreground handling, and tests
- use translation keys for notification titles and bodies in `static/locales/en/notifications.json` and `static/locales/es/notifications.json` or a review namespace that is loaded through the existing i18n system
- keep notification send failures non-blocking for the canonical review publish/attestation flow

Required review notification deep-link contract for MVP:

- `review_received` must deep-link to `/reviews` with deterministic query parameters that identify the received review card to highlight
- `review_reply_received` must deep-link to `/reviews` with deterministic query parameters that identify the parent review card and force the reply region open
- `pending_review_reminder` must deep-link to `/reviews` with deterministic query parameters that identify the pending review target to highlight
- the exact query-key contract must be frozen once in shared review notification helpers and reused across emitters, loaders, and UI tests

Required pending-review reminder visibility rule for MVP:

- because the app does not have a live notification center, pending-review reminder visibility must come from explicit in-surface review CTAs and `/reviews` pending-state presentation, not from a hidden inbox concept
- any later push-based reminder must point back to the same visible pending-review surfaces instead of creating a second reminder-only UX path

Required review notification tests:

- unit tests for review notification helper payload composition and dedupe behavior
- integration tests proving review push sends use `pushNotificationService.sendNotificationToNpubs(...)` with the existing payload contract
- integration tests proving service-worker click handling opens the correct `/reviews` deep links through existing `clickAction` behavior
- route/component tests proving `/reviews` consumes notification deep links and highlights the intended received review, reply target, or pending review target

### 5.12 Moderation and Blocking Contract

Review and reply surfaces must reuse the app’s existing moderation policy instead of inventing review-specific moderation primitives.

Required moderation rules for MVP:

- reuse the existing report + mute/block entry pattern from `src/lib/components/moderation/ActionsMenu.svelte`
- until a review-specific report content type exists, review cards and reply threads must use the existing user-focused moderation path (`profileMode=true`) so users can report or block the author
- reuse the existing NIP-51 mute-list foundation in `src/lib/nostr/muteList.ts`; do not create a second block list for reviews
- if the current user has muted an author, that author’s reviews and replies must be filtered out of aggregated review surfaces in the same way other muted content is hidden elsewhere in the app
- moderation actions must remain non-blocking for normal review rendering; filtering is a client-side visibility rule, not a reason to invalidate canonical review events on Nostr
- review replies must inherit the same moderation affordances as review cards

Required moderation tests for MVP:

- component tests proving review cards and reply threads expose the shared moderation menu
- selector/filter tests proving muted authors are removed from aggregated review surfaces
- regression tests proving moderation affordances do not break review loading, reply rendering, or profile review composition

## 6. Reusable Components and Modules

### 6.1 Reuse from `feat/reviews`

Port and adapt, do not copy blindly:

- `src/lib/components/reviews/*`
- `src/routes/(protected)/dashboard/reviews/+page.svelte` as donor source for the new `/reviews` route
- `src/lib/components/profile/ProfileReviewsSection.svelte`
- `src/lib/utils/review-helpers.ts`
- `src/lib/utils/review-aggregation.ts`
- `src/lib/utils/review-status.ts`

### 6.1.1 Donor Branch Quarantine Rules

Before porting any donor code, the builder must classify every imported file as one of:

- reusable as-is
- reusable with attestation refactor
- prohibited because it is Merkle/ZK-coupled

Prohibited donor imports:

- Merkle SDK packages
- tree update services/monitors
- proof verification services
- review store logic that assumes Merkle commitments/proofs
- docs/tests that encode proof-centric behavior as current requirements

This quarantine step is mandatory before implementation begins.

### 6.2 Components to Keep Shared Across Tasks and Services

The plan must keep reviews contract-centric where possible.

Primary shared integration surfaces:

- `src/lib/components/contracts/ContractCard.svelte`
- `src/lib/components/contracts/ContractDrawer.svelte`
- `src/lib/components/contracts/ContractActions.svelte`
- `src/lib/components/contracts/ServiceAgreementSummary.svelte`

These surfaces must consume shared review status helpers and shared review CTA components instead of duplicating task/service review UI.

### 6.3 New Reusable Building Blocks

Required reusable modules/components:

- `packages/reviews-contracts/*`
- `review-attestation.client.ts`
- `review-attestation.types.ts`
- `review-reply.types.ts`
- `review-reply.client.ts`
- `review-media.types.ts`
- `reviewable-settlement.types.ts`
- `reviewable-settlement.registry.ts`
- `reviewable-settlement.resolver.ts`
- `review-verification-status.ts`
- `ReviewStatusBadge.svelte`
- `ReviewCallToAction.svelte`
- `ReviewEligibilityBanner.svelte`
- `ReviewSummarySnippet.svelte`
- `ReviewReplyComposer.svelte`
- `ReviewReplyThread.svelte`
- review media upload adapter wrapping `src/lib/components/MediaUploader.svelte`

Required reusable backend modules:

- `reviews-attestation-backend/src/http/review-attestation-controller`
- `reviews-attestation-backend/src/domain/review-attestation-service`
- `reviews-attestation-backend/src/domain/review-issuer-registry-service`
- `reviews-attestation-backend/src/domain/review-settlement-resolver-factory`
- `reviews-attestation-backend/src/domain/review-uniqueness-ledger`
- `reviews-attestation-backend/src/domain/review-wallet-proof-verifier`
- `reviews-attestation-backend/src/domain/review-nostr-proof-verifier`
- `reviews-attestation-backend/src/infrastructure/nostr/nostr-tools-publisher`
- `reviews-attestation-backend/src/infrastructure/chain/viem-clients`

### 6.3.1 Shared Contracts Package Ownership

The shared contracts package is a hard dependency for parallel implementation.

It must own:

- schema versions
- public/private DTO definitions that cross the backend/app boundary
- API validation schemas shared across the backend/app boundary
- Nostr kind constants
- error-code enums
- canonical fixture builders for review events, attestation events, and challenge payloads
- canonical fixture builders for review reply events
- normalized settlement/domain/event/status types used across backend and app boundaries
- deleted-source presentation contract used by selectors and shared UI
- bilingual review-content contract, including source language, English payload, and Spanish payload
- canonical review-reply ownership and deterministic winner rules

Neither the backend project nor the app may redefine these in local `types.ts` files once the package exists.

### 6.4 Existing Reusable UI Patterns to Preserve

The implementation must explicitly reuse the following branch-local patterns instead of recreating them:

- drawer/modal progressive disclosure patterns from service quote acceptance and instant-buy flows
- status-chip and filter patterns from `MyQuotesPanel` and `ServiceQuotesInbox`
- dashboard empty/error/offline messaging via `DashboardEmptyState` and `ErrorAlertWithModal`
- contract-context summary presentation via `ServiceAgreementSummary`
- existing dashboard/earning query-state helpers for preserving panel context
- existing media upload flow via `src/lib/components/MediaUploader.svelte` and `src/lib/api/services/upload.service`
- existing attachment gallery/lightbox flow via `src/lib/components/Gallery.svelte` and the image-preparation pattern already used in `ContractDrawer.svelte`, `TaskDetailsView.svelte`, and `ServiceDetailsView.svelte`
- existing completion-evidence upload limits and progress/remove UX from `src/lib/components/contracts/TaskCompletionModal.svelte`

The plan is incomplete if review UI is designed outside these existing patterns without a written reason.

### 6.5 Required Shared Translation and Constants Work

The builder must plan reusable constants and translation namespaces up front:

- custom Nostr review/attestation kind constants
- review status keys
- task vs service review copy variants
- provider/public review summary copy
- stale/offline/partial attestation verification copy
- translated review-content field keys and locale-selection helpers
- contract-outcome label keys for human-readable rendering in the app
- review notification title/body keys aligned to the existing push notification foundation

Translated review-content rule:

- the canonical review payload must include both English and Spanish content before publish
- translation must happen exactly once per review draft before `reviewDraftHash` is computed
- UI surfaces must render the locale-matching translated content from the stored review payload and must not trigger ad hoc retranslation during display
- if the author writes the source text in English, only the Spanish version is generated; if the author writes the source text in Spanish, only the English version is generated
- the implementation must persist enough metadata to know which language was authored vs translated without issuing another translation request later in the same review submit flow
- review publication must consume the separate translation backend response and must not call the browser-exposed Google Translate API directly

Contract outcome rendering rule:

- the backend must emit the canonical `ReviewContractOutcome` enum value in resolver output, attestation payloads, and review payloads
- the app must map that enum to human-readable localized labels
- the backend must not emit final display strings for contract outcomes

No component should hardcode review-state strings once implementation begins.

## 7. Service Implementation Audit: Required Review UI/UX Additions

### 7.1 Public Service Discovery Surfaces

Add review summary, not review submission, to:

- `src/lib/components/service/ServiceCard.svelte`
- `src/lib/components/service/ServiceDetailsView.svelte`

Required UX:

- provider aggregate review summary
- review count
- recent verified review snippets
- link to provider review history

### 7.2 Service Booking / Quote Lifecycle Surfaces

Add review expectation-setting and later review status to:

- `src/routes/services/+page.svelte`
- `src/lib/components/service/ServiceDetailsView.svelte`
- `src/lib/components/service/ServiceInstantBuyModal.svelte`
- `src/lib/components/dashboard/quotes/MyQuotesPanel.svelte`
- `src/lib/components/service/DashboardServiceRequestsPanel.svelte`
- `src/lib/components/service/quotes/ServiceQuotesInbox.svelte`
- `src/lib/components/dashboard/quotes/ServiceRequestAcceptanceDrawer.svelte`

Required UX:

- explain that reviews unlock only after settlement completion
- show pending-review / reviewed status once contract reaches terminal reviewable state
- surface links into `/reviews` and contracts
- keep tasker-side quote inbox and provider-side request inbox behavior aligned for the same settlement
- ensure contract-created, accept-failed, contract-sync-pending, and stale relay states do not expose premature review CTAs
- if push reminders are unavailable or disabled, the same pending-review state must still remain discoverable through visible in-context CTAs on contract, quote, and service surfaces rather than relying on a hidden in-app reminder mechanism

### 7.3 Contract-Centric Service Review Entry Points

Primary review entry/status surfaces:

- `src/lib/components/contracts/ContractCard.svelte`
- `src/lib/components/contracts/ContractDrawer.svelte`
- `src/lib/components/contracts/ContractActions.svelte`

Required UX:

- compact status chip on cards
- full review module in drawer
- quick actions for leave/view review
- clear behavior for completed service vs completed task contracts
- no duplicate CTA logic between card, drawer, and action bar; all must consume the same shared review eligibility helper

### 7.4 Dashboard / Profile Review Surfaces

Required review-management integration:

- create `/reviews` on this branch by porting the donor route and adapting it for mixed task + service settlements
- show service-derived pending reviews in review management
- show received reviews on provider profile surfaces
- add review-entry routing from contracts, service detail, quotes, and earning/dashboard surfaces
- support notification deep links that can highlight a received review or pending review target inside `/reviews`

Relevant surfaces:

- `src/routes/(protected)/dashboard/+page.svelte`
- `src/routes/(protected)/earning/+page.svelte`
- `src/routes/(protected)/reviews/+page.svelte` (to be created from donor branch)
- `src/routes/(protected)/dashboard/profile/+page.svelte`
- `src/lib/components/profile/ProfileReviewsSection.svelte`
- `src/lib/components/profile/ProfileServicesSection.svelte`
- `src/lib/components/service/DashboardMyServicesPanel.svelte`
- `src/lib/components/service/DashboardServiceRequestsPanel.svelte`
- `src/lib/components/dashboard/quotes/MyQuotesPanel.svelte`

Required UX:

- deterministic review deep links from contracts, quote inboxes, service detail flows, dashboard, and earning
- profile composition that renders provider services and received reviews together as one coherent profile experience
- deleted task/service fallback rendering that preserves user-centric review value without requiring the original public event to still exist
- `/reviews` must have an explicit mobile-first information architecture with frozen top-level views for `pending`, `given`, and `received`; reply state is rendered inside `received` rather than as a separate top-level view
- each top-level `/reviews` view must define deterministic sort order, empty state copy, loading state copy, and error/retry state copy before implementation begins
- highlighted review and pending-review deep links must preserve the active top-level view, scroll/focus the correct card, and avoid disorienting jumps on mobile

### 7.4.1 Review Composer and Recovery UX

Required UX:

- review and reply composers must preserve unsent draft text, rating choices, and selected attachments across recoverable failures in translation, attestation issuance, and review-event publish
- the implementation must define one deterministic draft-reset rule so drafts are only cleared after successful canonical publish or explicit user discard
- translation, attestation, and publish are three distinct async steps in the composer UX and must expose clear step-specific loading, retry, and error messages
- translation failure must never silently discard user-authored content; the composer must remain populated and offer an explicit retry path
- attestation failure must leave the review draft intact and explain that the user was not yet able to publish a verified review
- media-upload failure must remain localized to the attachment area and must not erase the rest of the review or reply draft

### 7.5 Service Branch Touchpoints That Must Be Reviewed Before Coding

These files are implementation-critical and must be read before the builder starts coding:

- `src/lib/components/service/ServiceCard.svelte`
- `src/lib/components/service/ServiceDetailsView.svelte`
- `src/lib/components/service/ServiceInstantBuyModal.svelte`
- `src/lib/components/dashboard/quotes/MyQuotesPanel.svelte`
- `src/lib/components/service/DashboardServiceRequestsPanel.svelte`
- `src/lib/components/service/quotes/ServiceQuotesInbox.svelte`
- `src/lib/components/dashboard/quotes/ServiceRequestAcceptanceDrawer.svelte`
- `src/lib/components/service/DashboardMyServicesPanel.svelte`
- `src/lib/components/contracts/ContractCard.svelte`
- `src/lib/components/contracts/ContractDrawer.svelte`
- `src/lib/components/contracts/ContractActions.svelte`
- `src/routes/(protected)/dashboard/+page.svelte`
- `src/routes/(protected)/earning/+page.svelte`
- `src/lib/stores/service-quote-ui.store.ts`
- `src/lib/utils/dashboardQuery.ts`

The builder must not assume the service flow is confined to `/services` alone.

## 8. Implementation Workstreams

## 8A. Swarm Ownership Matrix

Parallel implementation requires explicit write ownership.

Ownership groups:

- `Foundation Contracts Owner`
  - `packages/reviews-contracts/**`
  - excludes app-local consumers
- `Backend Core Owner`
  - `reviews-attestation-backend/package.json`
  - `reviews-attestation-backend/wrangler.toml`
  - `reviews-attestation-backend/.dev.vars.example`
  - `reviews-attestation-backend/src/index.ts`
  - `reviews-attestation-backend/src/http/**`
  - `reviews-attestation-backend/src/config/**`
  - `reviews-attestation-backend/src/domain/review-attestation-service.ts`
  - `reviews-attestation-backend/src/domain/review-issuer-registry-service.ts`
  - `reviews-attestation-backend/src/domain/review-wallet-proof-verifier.ts`
  - `reviews-attestation-backend/src/domain/review-nostr-proof-verifier.ts`
  - `reviews-attestation-backend/src/infrastructure/nostr/**`
- `Backend Resolver Owner`
  - `reviews-attestation-backend/src/domain/resolvers/**`
  - `reviews-attestation-backend/src/domain/registry/**`
  - `reviews-attestation-backend/src/domain/review-settlement-resolver-factory.ts`
  - `reviews-attestation-backend/src/infrastructure/chain/**`
- `Backend State Owner`
  - `reviews-attestation-backend/src/domain/ledger/**`
  - `reviews-attestation-backend/src/domain/idempotency/**`
  - `reviews-attestation-backend/src/domain/review-uniqueness-ledger.ts`
  - `reviews-attestation-backend/src/infrastructure/durable-objects/**`
  - `reviews-attestation-backend/src/domain/attestation-reservation-state.ts`
- `Client Plumbing Owner`
  - `src/lib/reviews/**`
  - `src/lib/utils/reviews/**`
  - `src/lib/api/reviews/**`
  - app-side consumers of `packages/reviews-contracts/**`
- `Shared Review UI Owner`
  - `src/lib/components/reviews/**`
  - `static/locales/*/reviews.json`
- `Contract Integration Owner`
  - `src/lib/components/contracts/**`
- `Service Integration Owner`
  - `src/lib/components/service/**`
  - `src/lib/components/dashboard/quotes/**`
  - `src/routes/services/**`
  - `src/lib/utils/service-quote/services-workspace-route.ts`
  - `src/lib/stores/service-quote-ui.store.ts`
- `Dashboard Profile Routing Owner`
  - `src/routes/(protected)/dashboard/**`
  - `src/routes/(protected)/earning/**`
  - `src/lib/utils/dashboardQuery.ts`
  - `src/lib/utils/service-quote/dashboard-route.ts`
  - `src/lib/components/profile/**`
- `Test Harness Owner`
  - `tests/e2e/**`
  - cross-cutting runtime harnesses
  - shared route-level harnesses
  - test-only fixtures not owned by `packages/reviews-contracts/**`

Test ownership rule:

- each ownership group writes the unit/component/integration tests inside its own code scope
- `Test Harness Owner` owns only cross-cutting harnesses, end-to-end suites, and runtime orchestration that span multiple ownership groups

Shared-file exception protocol:

- if a change is required in a file owned by another group, the active agent must either defer it to the owner or wait for the next checkpoint merge
- the only allowed cross-owner direct edits are import-path updates that are mechanically required after a checkpoint merge
- any planned exception must be written into the relevant checkpoint note before the edit is made

No two agents should edit the same ownership group in parallel unless one is designated as lead and the others are read-only reviewers.

Multi-owner workstream rule:

- a workstream may span multiple ownership groups, but implementation must still be split into ownership-aligned subtracks before coding begins
- each subtrack must name its owning group, DRI, dependencies, and target checkpoint in the corresponding status file
- a workstream DRI coordinates sequencing across those subtracks but does not override file ownership
- if a workstream cannot be decomposed into ownership-aligned subtracks, it is not parallel-safe and must be deferred until the next checkpoint merge

Backend seam freeze rule:

- the interfaces between `Backend Core Owner`, `Backend Resolver Owner`, and `Backend State Owner` must be frozen at `Checkpoint B`
- the frozen seam set includes:
  - `review-attestation-service`
  - resolver factory interfaces and normalized settlement DTOs imported from `packages/reviews-contracts/`
  - uniqueness-ledger interface and reservation state transitions
  - proof-verifier interfaces and publisher interface
- after `Checkpoint B`, downstream backend work may consume these seams but may not change them without an explicit checkpoint re-freeze

Governance roles:

- each ownership group must have a named DRI for an implementation wave
- each workstream must have a named DRI and backup before coding begins
- each checkpoint must have a named approver
- only the checkpoint approver may authorize the next wave
- assignments must be recorded in `plans/reviews-attestation-execution/governance-registry.md`

Blocker escalation protocol:

- blockers must be recorded with severity: `low`, `medium`, `high`, or `critical`
- each blocker must name an escalation owner
- `medium` blockers must be dispositioned in the next checkpoint summary
- `high` and `critical` blockers must be resolved or explicitly deferred by the checkpoint approver before checkpoint approval
- emergency cross-scope edits are allowed only for `critical` blockers and must be recorded in the checkpoint note with owner approval

## 8B. Parallel Execution Waves

Parallel-safe execution must proceed in waves.

### Wave 0: Freeze and Scaffold

Must complete before parallel feature implementation:

- Phase 0 specification freeze
- `packages/reviews-contracts/` scaffold and schema freeze
- backend project scaffold and local scripts freeze
- donor import manifest freeze
- checkpoint note for `Checkpoint A` written and approved

Wave 0 deliverables must land in a dedicated foundation change set before any Wave 1 parallel feature work starts.

### Wave 1: Backend/App Foundations

Can run in parallel after Wave 0:

- backend core HTTP scaffold
- resolver layer
- uniqueness ledger / Durable Objects
- client plumbing consuming shared contracts

Blocked until Wave 0 outputs exist.

### Wave 2: Shared UI and Contract Surfaces

Can run in parallel after Wave 1 contracts/selectors stabilize:

- shared review components
- contract-surface integration

### Wave 3: Service and Route Surfaces

Can run in parallel after Wave 2 shared CTA/status components stabilize:

- service integration
- dashboard/profile/routing integration

### Wave 4: Hardening and Verification

Runs after Waves 1-3 are merged:

- privacy/logging hardening
- service harness coverage
- e2e coverage
- cross-surface regression sweep

Agents must not skip waves by implementing downstream surfaces against provisional contracts.

### Workstream 0: Replace Review Architecture Boundary

Tasks:

- identify and quarantine all Merkle/ZK review dependencies from donor branch
- define the adapter boundary between public review UI and attestation backend flow
- write migration notes so donor code is imported selectively
- create a donor import matrix for components, helpers, routes, tests, and translations
- create the swarm donor import manifest with explicit statuses:
  - approved for direct port
  - approved for refactor
  - prohibited

Tests first:

- type-level tests for new review models
- compatibility tests proving donor review components can consume new normalized types

Checklist:

- [ ] Merkle/ZK donor quarantine completed
- [ ] donor import manifest created
- [ ] adapter boundary between app and backend frozen
- [ ] shared contracts package location and ownership frozen
- [ ] governance roles assigned for all ownership groups and checkpoints
- [ ] routing contract frozen for dashboard, earning, and `/reviews` deep links
- [ ] Checkpoint A approval recorded

### Workstream 1: Review Domain Types and Status Helpers

Tasks:

- define normalized settlement types
- define public review/attestation event types
- define public review reply event types
- define review eligibility state machine
- define deterministic review status derivation helpers
- define deleted-source fallback presentation rules for task/service-linked reviews

Tests first:

- unit tests for state transitions
- malformed payload tests
- deterministic status derivation tests
- deleted-task and deleted-service reviewability tests
- deterministic review-reply ownership and winner-selection tests

Checklist:

- [ ] normalized settlement/domain types created in `packages/reviews-contracts/`
- [ ] review status/state-machine helpers implemented
- [ ] review-reply domain contract finalized
- [ ] deleted-source fallback contract finalized
- [ ] domain tests passing

### Workstream 2: Attestation API and Issuer Registry

Ownership-aligned subtracks:

- `2A Backend scaffold and HTTP routes`
  - owner: `Backend Core Owner`
  - paths:
    - `reviews-attestation-backend/package.json`
    - `reviews-attestation-backend/wrangler.toml`
    - `reviews-attestation-backend/.dev.vars.example`
    - `reviews-attestation-backend/src/index.ts`
    - `reviews-attestation-backend/src/http/**`
    - `reviews-attestation-backend/src/config/**`
- `2B Proof verification and issuer registry services`
  - owner: `Backend Core Owner`
  - paths:
    - `reviews-attestation-backend/src/domain/review-attestation-service.ts`
    - `reviews-attestation-backend/src/domain/review-issuer-registry-service.ts`
    - `reviews-attestation-backend/src/domain/review-wallet-proof-verifier.ts`
    - `reviews-attestation-backend/src/domain/review-nostr-proof-verifier.ts`
    - `reviews-attestation-backend/src/infrastructure/nostr/**`
  - dependency:
    - `Checkpoint A` frozen contracts package

Tasks:

- scaffold a separate in-repo backend project for the attestation worker
- wire Hono routing, Zod validation, and Worker bindings in that backend project
- add `viem` clients/utilities for chain reads and wallet-signature verification
- add `nostr-tools` utilities for `npub` handling, Nostr event verification, and attestation publication
- build issuer registry endpoint
- build attestation challenge endpoint
- build attestation issuance endpoint
- add strict request validation and error taxonomy
- implement the frozen rate-limit and abuse-control policy for challenge and attestation issuance
- return deterministic `429` payloads with `Retry-After` for rate-limited requests

Tests first:

- backend project boot/integration smoke tests
- request schema validation tests
- issuer registry contract tests
- challenge replay/expiry tests
- signature verification tests
- invalid contract-registry entry tests
- mismatched review event vs attestation request tests
- challenge endpoint rate-limit tests
- attestation endpoint rate-limit tests
- invalid-proof cooldown tests
- idempotent retry tests proving retried successful issuance does not consume additional rate-limit budget

Checklist:

- [ ] backend project scaffold created
- [ ] Hono routing + Zod validation wired
- [ ] issuer registry endpoint implemented
- [ ] challenge endpoint implemented
- [ ] attestation issuance endpoint implemented
- [ ] rate-limit and abuse-control policy implemented
- [ ] backend schema and runtime tests passing

### Workstream 3: Settlement Resolver Layer

Ownership-aligned subtracks:

- `3A Contract registry and resolver factory`
  - owner: `Backend Resolver Owner`
  - paths:
    - `reviews-attestation-backend/src/domain/registry/**`
    - `reviews-attestation-backend/src/domain/review-settlement-resolver-factory.ts`
- `3B Chain adapters and resolver implementations`
  - owner: `Backend Resolver Owner`
  - paths:
    - `reviews-attestation-backend/src/domain/resolvers/**`
    - `reviews-attestation-backend/src/infrastructure/chain/**`
  - dependency:
    - `3A` contract registry and resolver-factory interfaces

Tasks:

- implement contract registry
- implement task settlement resolver
- implement service quote acceptance resolver
- implement service instant-buy resolver
- make resolver selection explicit by chain/asset/contract version
- ensure resolvers can derive reviewability from settlement state even when the original task/service event no longer exists

Tests first:

- resolver routing tests
- unsupported contract rejection tests
- cross-chain and cross-asset resolution tests
- versioned contract compatibility tests
- deleted-source-but-valid-settlement tests

Checklist:

- [ ] contract registry implemented
- [ ] task resolver implemented
- [ ] service quote resolver implemented
- [ ] instant-buy resolver implemented
- [ ] multi-chain/multi-asset tests passing

### Workstream 4: Uniqueness Ledger

Ownership-aligned subtracks:

- `4A Reservation and idempotency state machine`
  - owner: `Backend State Owner`
  - paths:
    - `reviews-attestation-backend/src/domain/idempotency/**`
    - `reviews-attestation-backend/src/domain/attestation-reservation-state.ts`
- `4B Uniqueness ledger persistence`
  - owner: `Backend State Owner`
  - paths:
    - `reviews-attestation-backend/src/domain/ledger/**`
    - `reviews-attestation-backend/src/domain/review-uniqueness-ledger.ts`
    - `reviews-attestation-backend/src/infrastructure/durable-objects/**`
  - dependency:
    - `4A` reservation state-machine interfaces

Tasks:

- implement stateful uniqueness ledger
- enforce one-review-per-settlement-side
- record attestation/review linkage without storing wallet+`npub`

Tests first:

- duplicate issuance tests
- concurrent issuance tests
- idempotent retry tests
- privacy regression tests ensuring no durable wallet+`npub` pair is written
- cross-contract-version uniqueness tests for the same settlement family

Checklist:

- [ ] reservation/idempotency state machine implemented
- [ ] Durable Object store implemented
- [ ] duplicate/concurrency tests passing
- [ ] privacy regression tests passing

### Workstream 5: Nostr Publish / Verify Layer

Ownership-aligned subtracks:

- `5A App-side review publish/verify adapters`
  - owner: `Client Plumbing Owner`
  - paths:
    - `src/lib/reviews/**`
    - `src/lib/utils/reviews/**`
    - `src/lib/api/reviews/**`
  - dependency:
    - `Checkpoint B` frozen backend client API exports
- `5B Shared contract consumers and verification helpers`
  - owner: `Client Plumbing Owner`
  - paths:
    - app-side consumers of `packages/reviews-contracts/**`
  - dependency:
    - `Checkpoint B` frozen normalized review selectors and event contracts

Tasks:

- rewrite review publish flow for attestation model
- fetch referenced attestation events
- publish review reply events
- fetch and join review reply events to parent reviews deterministically
- verify attestation signer against HTTPS issuer registry
- handle stale/missing/malformed referenced events deterministically
- implement explicit translation-step loading, timeout, retry, and failure states without clearing the user draft

Tests first:

- review publish happy path
- review reply publish happy path
- missing attestation path
- issuer rotation path
- malformed public payload path
- one-time translation invocation test
- translation loading, timeout, and retry-state tests
- locale-specific review-content selection tests
- one-reply-per-review deterministic winner tests
- reply-author-is-reviewee validation tests
- review notification payload and dedupe tests

Checklist:

- [ ] review publish adapter implemented
- [ ] attestation fetch/verify adapter implemented
- [ ] review reply publish/fetch adapter implemented
- [ ] HTTPS issuer registry verification implemented
- [ ] one-time bilingual translation flow implemented
- [ ] translation step UX states implemented
- [ ] review notification helper implemented against shared push foundation
- [ ] stale/malformed-path tests passing

### Workstream 6: Shared Review Components

Tasks:

- port reusable donor components
- refactor them to accept normalized review data
- add shared components for badges, CTA, eligibility, summary snippets
- add shared reply composer and reply thread components
- adapt the existing `MediaUploader.svelte` flow for review and reply attachments instead of creating a new uploader
- adapt the existing `Gallery.svelte` lightbox pattern for reply image attachments
- match the completion-evidence upload/remove/progress UX from `TaskCompletionModal.svelte` for review and reply attachments
- port donor translations and normalize copy keys so task/service reviews share one translation domain
- wire all review render surfaces to consume the stored bilingual review payload dynamically based on current locale
- implement deterministic draft preservation and explicit discard/reset behavior for review and reply composers

Tests first:

- component rendering tests
- empty/partial/offline states
- task vs service context rendering tests
- translation fallback tests for newly shared keys
- bilingual review-content rendering tests for English and Spanish locales
- reply composer visibility and single-reply rendering tests
- review and reply media upload/remove rendering tests
- reply image-gallery lightbox rendering tests using the shared gallery pattern
- draft preservation/discard UX tests

Checklist:

- [ ] donor components ported or replaced
- [ ] shared CTA/status/summary components implemented
- [ ] shared reply components implemented
- [ ] shared review/reply media upload flow implemented
- [ ] shared review/reply gallery-lightbox flow implemented
- [ ] translations normalized
- [ ] bilingual review-content rendering wired
- [ ] draft preservation/recovery UX implemented
- [ ] component tests passing

### Workstream 7: Contract Surface Integration

Tasks:

- integrate review status/CTA into `ContractCard`
- integrate review module into `ContractDrawer`
- integrate review quick actions into `ContractActions`
- ensure service contract context is rendered via existing agreement summary helpers

Tests first:

- completed-task contract review CTA tests
- completed-service contract review CTA tests
- non-reviewable state tests
- already-reviewed state tests

Checklist:

- [ ] `ContractCard` integration complete
- [ ] `ContractDrawer` integration complete
- [ ] `ContractActions` integration complete
- [ ] contract-surface tests passing

### Workstream 8: Service UI/UX Integration

Ownership-aligned subtracks:

- `8A Service browse/detail surfaces`
  - owner: `Service Integration Owner`
  - paths:
    - `src/lib/components/service/**`
    - `src/routes/services/**`
- `8B Service quote/request surfaces`
  - owner: `Service Integration Owner`
  - paths:
    - `src/lib/components/dashboard/quotes/**`
    - `src/lib/stores/service-quote-ui.store.ts`
- `8C Service review data consumption contract`
  - owner: `Client Plumbing Owner`
  - paths:
    - `src/lib/reviews/**`
    - `src/lib/utils/reviews/**`
    - `src/lib/api/reviews/**`
  - dependency:
    - `Checkpoint C` frozen `review-context DTOs`

Tasks:

- add provider review summary to `ServiceCard`
- add provider review summary section to `ServiceDetailsView`
- add review lifecycle/status messaging in quote and instant-buy success flows
- add pending/reviewed status to service quote/request inboxes where the contract is final
- align customer-side and provider-side review language and state chips across quote/request inboxes
- ensure service dashboard cards and drawers can surface received-review context without duplicating profile-review logic
- render graceful fallback context when the original task/service was deleted before or after review

Tests first:

- service browse summary rendering tests
- service detail review summary tests
- quote inbox review status tests
- instant-buy success-state messaging tests
- provider request inbox review-status tests
- contract-sync-pending and accept-failed negative CTA tests
- deleted-source rendering tests for both task and service reviews
- pending-review CTA discoverability tests when push reminders are unavailable

Checklist:

- [ ] service browse summary integrated
- [ ] service detail summary integrated
- [ ] quote/request lifecycle status integrated
- [ ] deleted-source service rendering complete
- [ ] pending-review CTA discoverability integrated
- [ ] service integration tests passing

### Workstream 9: Routing and Cross-Surface Navigation

Ownership-aligned subtracks:

- `9A Dashboard and earning route helpers`
  - owner: `Dashboard Profile Routing Owner`
  - paths:
    - `src/lib/utils/dashboardQuery.ts`
    - `src/lib/utils/service-quote/dashboard-route.ts`
    - `src/routes/(protected)/dashboard/**`
    - `src/routes/(protected)/earning/**`
- `9B Service-workspace route bridge`
  - owner: `Service Integration Owner`
  - paths:
    - `src/lib/utils/service-quote/services-workspace-route.ts`
    - `src/lib/stores/service-quote-ui.store.ts`
- `9C Review route-state contract consumers`
  - owner: `Client Plumbing Owner`
  - paths:
    - `src/lib/reviews/**`
    - `src/lib/utils/reviews/**`
  - dependency:
    - `Checkpoint A` frozen routing contract

Route-test ownership rule:

- all dashboard/earning deep-link tests, return-navigation tests, and other route-level navigation harness changes belong to `Workstream 9`
- `Workstream 8` may add service-scope fixtures or component-level assertions inside its own owned paths, but it must not edit shared route-level navigation tests

Tasks:

- wire review entry and return flows through `dashboardQuery` / earning query helpers
- preserve source context when navigating from contracts, services, or profile surfaces into review management
- add deterministic deep-link handling for highlighted settlement/review targets
- add deterministic deep-link handling for highlighted reply targets and reply-composer state
- support pending-review links from service harness routes and fixtures used in branch-local testing

Tests first:

- dashboard deep-link tests
- earning deep-link tests
- return-navigation tests
- reply deep-link tests

Checklist:

- [ ] dashboard deep links implemented
- [ ] earning deep links implemented
- [ ] return-navigation helpers implemented
- [ ] reply deep links implemented
- [ ] routing tests passing

### Workstream 10: Dashboard and Profile Review Management

Ownership-aligned subtracks:

- `10A Dashboard review management route`
  - owner: `Dashboard Profile Routing Owner`
  - paths:
    - `src/routes/(protected)/dashboard/**`
    - `src/lib/utils/dashboardQuery.ts`
- `10B Profile review composition`
  - owner: `Dashboard Profile Routing Owner`
  - paths:
    - `src/lib/components/profile/**`
- `10C Review management data selectors and API wiring`
  - owner: `Client Plumbing Owner`
  - paths:
    - `src/lib/reviews/**`
    - `src/lib/utils/reviews/**`
    - `src/lib/api/reviews/**`
  - dependency:
    - `Checkpoint B` frozen selector and client API exports
- `10D Review management shared UI composition`
  - owner: `Shared Review UI Owner`
  - paths:
    - `src/lib/components/reviews/**`
  - dependency:
    - `10C` completion and `Checkpoint C` frozen review-context DTOs

Tasks:

- adapt the `/reviews` page to mixed task/service settlements
- include service-booking pending reviews
- include received reviews on profile/provider surfaces
- ensure consistent routing from dashboard/earning/service views
- create the route/component wiring needed on this branch because `feat/find-services` does not currently include a reviews page
- compose provider services and received reviews together on the profile route
- allow the reviewee to post exactly one reply on received reviews
- render received replies inline under their parent reviews across `/reviews` and profile surfaces
- support media upload in review replies using the shared media uploader flow and existing attachment schema
- expose the shared moderation menu on review cards and reply threads
- implement the frozen mobile-first `/reviews` information architecture for `pending`, `given`, and `received`
- preserve and restore draft state across recoverable translation, attestation, and publish failures

Tests first:

- `/reviews` integration tests
- pending review aggregation tests
- profile received-review rendering tests
- review notification deep-link tests
- reply composer and inline reply rendering integration tests
- reply media upload integration tests
- moderation-menu and mute-filter integration tests
- `/reviews` mobile information-architecture tests for pending/given/received views
- draft recovery across translation/attestation/publish failures integration tests

Checklist:

- [ ] `/reviews` route created/adapted
- [ ] mixed pending/given/received views implemented
- [ ] profile review composition implemented
- [ ] single-reply reviewee flow implemented
- [ ] reply media upload flow implemented
- [ ] review moderation/block integration implemented
- [ ] review notification deep links implemented
- [ ] mobile `/reviews` IA finalized and implemented
- [ ] dashboard/profile tests passing

### Workstream 11: Privacy, Logging, and Observability Hardening

Tasks:

- redact logs
- add structured error codes
- instrument attestation issuance and verification outcomes
- add replay/invalid proof telemetry without leaking identifiers
- document that review replies are public user-authored events with no platform attestation and no hidden settlement data
- document every required human follow-up step in the plan tracking folder as it is discovered during implementation

Tests first:

- logging redaction tests
- error-shape tests
- observability hook tests
- notification failure non-blocking tests
- reply payload privacy tests

Checklist:

- [ ] redaction policy implemented
- [ ] structured error codes wired end-to-end
- [ ] telemetry hooks added without sensitive linkage
- [ ] reply privacy tests passing
- [ ] human-actions tracking file maintained
- [ ] hardening tests passing

## 8C. Swarm Merge Checkpoints

Required merge checkpoints:

1. `Checkpoint A`
   - shared contracts package frozen
   - backend scaffold frozen
   - donor import manifest frozen
   - local backend script names frozen
   - plan ledger owner assigned
   - governance registry created
   - routing contract helper signatures frozen
2. `Checkpoint B`
   - resolver layer
   - uniqueness ledger
   - client plumbing
   - all consuming the same frozen contracts package
   - selector outputs frozen
   - `review-attestation` client API exports frozen
   - normalized review selector APIs frozen for all contract and service consumers
3. `Checkpoint C`
   - shared review components and contract surfaces stabilized
   - shared component props frozen
   - review-context DTOs for downstream service/dashboard surfaces frozen
   - shared CTA/status/summary component interfaces frozen for service, contract, and dashboard consumers
4. `Checkpoint D`
   - service integration + dashboard/profile/routing integration stabilized
   - routing/deep-link helper contracts and service-workspace bridge adapters stabilized
5. `Checkpoint E`
   - harness, e2e, privacy, and regression hardening complete

No new parallel wave should begin until the prior checkpoint is merged or explicitly rebased into all active agent branches.

Required checkpoint evidence:

| Checkpoint     | Approver role                   | Required status/evidence files                                                                                  | Required passing commands                                                                     | Newly frozen artifacts                                                                                                                                                                                          |
| -------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Checkpoint A` | plan checkpoint approver        | `governance-registry.md`, `checkpoint-a-summary.md`, `checkpoint-a-evidence.md`, Workstreams `0-2` status files | shared contracts package tests/typechecks, backend scaffold smoke/typecheck commands only     | `packages/reviews-contracts/**`, backend scaffold paths, donor import manifest, local script names, routing helper signatures                                                                                   |
| `Checkpoint B` | backend/app foundation approver | `checkpoint-b-summary.md`, `checkpoint-b-evidence.md`, Workstreams `1-5` status files                           | backend unit/integration/runtime tests, shared contract tests, app-side review plumbing tests | resolver interfaces, uniqueness-ledger interface, reservation state machine, issuer-registry service interface, Nostr publisher interface, normalized review selectors, `review-attestation` client API exports |
| `Checkpoint C` | shared UI approver              | `checkpoint-c-summary.md`, `checkpoint-c-evidence.md`, Workstreams `6-7` status files                           | component tests for shared review UI and contract surfaces                                    | shared CTA/status/summary component props, review-context DTOs, contract-surface composition interfaces                                                                                                         |
| `Checkpoint D` | surface integration approver    | `checkpoint-d-summary.md`, `checkpoint-d-evidence.md`, Workstreams `8-10` status files                          | service integration tests, routing/deep-link tests, dashboard/profile integration tests       | routing/deep-link helper contracts, service-workspace bridge adapters, dashboard/profile review-management interfaces                                                                                           |
| `Checkpoint E` | release/hardening approver      | `checkpoint-e-summary.md`, `checkpoint-evidence.md`, Workstreams `9-11` status files                            | e2e suites, privacy/logging tests, regression sweep commands                                  | final rollout checklist, observability schema, hardening sign-off                                                                                                                                               |

Parallel confidence rule:

- swarm confidence for parallel implementation must be measured against the plan after `Checkpoint A` requirements are fully specified
- if an audit finds confidence below 95%, the plan must be revised before additional implementation waves are authorized

## 9.1 Delivery Gates Per Workstream

No workstream is complete until all four gates pass:

- schema/types gate
- behavior tests gate
- UI or integration acceptance gate
- regression gate for adjacent task/service flows

The builder must not start a downstream workstream while an upstream gate is still failing unless the dependency is explicitly marked parallel-safe in the implementation notes.

Additional swarm gate:

- ownership gate: each changed file must belong to the active agent’s ownership group or be coordinated at a checkpoint merge

## 10.1 AI Builder Readiness Checklist

Before starting implementation, the builder must be able to answer all of the following from the plan alone:

- Which branch is the base? `feat/find-services`
- Which branch is donor-only? `feat/reviews`
- Which files are the primary contract-centric review surfaces?
- Which files are the primary service booking / quote review surfaces?
- Which route helpers must preserve review deep links?
- What is the exact attestation request/response contract?
- What state is allowed in the uniqueness ledger?
- What data is forbidden from public events?
- Which tests must be written before coding each workstream?

If any answer is ambiguous, the plan must be revised before implementation starts.

## 10. Testing Strategy

### 10.1 Minimum Test Layers

- backend-project unit tests for request validation, challenge issuance, wallet/Nostr proof verification, resolver routing, uniqueness, and attestation publishing
- backend-project Workers-runtime integration tests using Cloudflare’s Vitest Workers integration
- unit tests for domain helpers, attestation validators, resolver routing, uniqueness ledger
- component tests for review UI reuse and contract/service touchpoints
- route/integration tests for `/reviews`, service detail, and service contracts
- end-to-end tests for:
  - service quote -> contract -> review
  - instant buy -> contract -> review
  - task completion -> review

### 10.2 Required Regression Suites

- task reviews still work after service review support is added
- service reviews work across both quote and instant-buy paths
- multi-chain and multi-asset resolution remains deterministic
- issuer rotation does not break historical attestation verification
- service provider browse/detail summaries remain stable when review data is unavailable
- review management route works correctly after being ported from the donor branch
- service harness scenarios cover review deep links, pending-review focus, and post-contract review eligibility
- valid contracts remain reviewable when the originating task/service event has been deleted

### 10.3 Test Fixtures and Harnesses

Required reusable fixtures:

- normalized task settlement fixture
- normalized service quote-contract fixture
- normalized service instant-buy fixture
- RBTC resolver fixture
- USDT resolver fixture
- rotating issuer-registry fixture
- malformed or stale attestation fixture

Required harness support:

- local backend test harness that runs the separate attestation project against fixture relays/clients and contract resolvers
- local Worker harness based on `wrangler dev` plus persisted Durable Object state
- backend automated tests using the Cloudflare Workers Vitest pool so Worker bindings and Durable Object behavior are exercised in the correct runtime model
- deterministic service contract completion fixtures for component and integration tests
- seeded contract-card states for task and service reviewability
- route-level mocks for `dashboard`, `earning`, and `reviews`

## 11. Rollout Sequencing

Recommended order:

1. domain types + status helpers
2. issuer registry + attestation API
3. settlement resolver layer
4. uniqueness ledger
5. Nostr publish/verify client
6. reusable review components
7. contract-surface integration
8. service browse/detail integration
9. routing/deep-link integration
10. dashboard/profile integration
11. service-harness coverage + e2e coverage + rollout hardening

No implementation work should start on browse/detail review summaries until the shared review status/CTA components and normalized review selectors are stable.

## 11. Human Actions Required Outside Code Changes

The implementation must track and surface every manual action that cannot be completed purely by code changes.

Required human-action tracking rules:

- every newly discovered manual prerequisite must be added to `plans/reviews-attestation-execution/human-actions.md` in the same change set that discovers it
- the final AI implementation summary must end with a `Human Actions Required` section
- each human action entry must include:
  - action description
  - why human intervention is required
  - owner or likely owner
  - blocking vs non-blocking status
  - exact file, secret, environment, dashboard, or account touched

Required initial human-action entries:

- provision Cloudflare Worker secrets for the attestation backend issuer key, signer secrets, and any relay/auth credentials
- provision backend environment variables and Wrangler bindings for local and deployed attestation environments
- migrate browser-exposed review translation credentials behind the separate translation backend once that backend exists
- provide or confirm the production attestation issuer key rotation policy and issuer-registry publication values
- verify production notification preference defaults and backend support for review notification channel gating before enabling push for review notifications in production

## 12. Risks and Mitigations

### Risk: Contract-upgrade drift

Mitigation:

- explicit registry + resolver versioning
- contract compatibility tests per chain/asset

### Risk: Service quote/contract sync ambiguity

Mitigation:

- derive reviewability only from normalized settlement resolver output
- never infer reviewability from one UI store alone

### Risk: Durable `npub` ↔ wallet linkage through logs

Mitigation:

- explicit redaction policy
- tests for redaction
- structured error payloads without raw identifiers

### Risk: UI divergence between task and service reviews

Mitigation:

- shared review CTA/status components
- contract-centric integration first
- no service-only duplicate review widgets unless justified

### Risk: Builder drift due to donor-branch assumptions

Mitigation:

- require explicit read-through of the service touchpoint inventory in section `7.5`
- require explicit quarantine of Merkle/ZK review files before importing donor review UI
- keep schema versions and route contracts explicit in the plan

## 13. Definition of Done

The implementation is done only when all of the following are true:

- task and service reviews both work on the new branch
- attestation verification works against Nostr events plus HTTPS issuer registry
- service browse/detail surfaces show provider review summaries
- completed service contracts expose review status/CTA
- the `/reviews` route shows task + service pending/given/received reviews
- at least one RBTC path and one USDT path are covered by resolver tests
- no durable review-system record stores wallet address + `npub` together
- unit, component, integration, and e2e tests cover the critical paths
- review management route exists on this branch and is wired from dashboard/profile/contract surfaces
- donor review components, translations, and helpers are ported intentionally rather than duplicated ad hoc
- the final plan audit reports at least 95% confidence that an AI builder can execute the implementation successfully
- the final implementation summary includes a `Human Actions Required` section generated from the tracked manual follow-up list

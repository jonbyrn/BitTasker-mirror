# Contract Status Nostr Events – Complete Documentation

This document describes how **contract status update** Nostr events are used in BitTasker to communicate escrow lifecycle steps between the Tasker (client) and Taskee (freelancer), alongside on-chain state. It complements [bid-nostr-events.md](./bid-nostr-events.md) (kinds 30007–30008) and [contract-nostr-events-v1.md](./contract-nostr-events-v1.md) (kind 30006).

## Table of Contents

1. [Overview](#overview)
2. [Relationship to Bid and Contract Events](#relationship-to-bid-and-contract-events)
3. [Status Update Lifecycle](#status-update-lifecycle)
4. [Contract Status Event (Kind 31006)](#contract-status-event-kind-31006)
5. [Tag Reference](#tag-reference)
6. [Content Schema Reference](#content-schema-reference)
7. [Encryption](#encryption)
8. [Publishing](#publishing)
9. [Receiving and Handling](#receiving-and-handling)
10. [Querying and Subscriptions](#querying-and-subscriptions)
11. [EscrowStatus Values](#escrowstatus-values)
12. [Related Documentation](#related-documentation)
13. [File References](#file-references)

---

## Overview

After a **contract event (Kind 30006)** exists for an escrow, both parties publish **contract status** events to notify the counterparty of actions, pending transactions, and confirmed blockchain outcomes. Relays store these as ordinary (non-replaceable) events.

| Kind  | Name            | Direction                     | Purpose                                                      |
| ----- | --------------- | ----------------------------- | ------------------------------------------------------------ |
| 31006 | CONTRACT_STATUS | Tasker ↔ Taskee (per action) | Encrypted status / intent / tx correlation for that contract |

**Source of truth:** `src/lib/utils/constants/kinds.ts` (`KINDS.CONTRACT_STATUS`)

**Important:** Tag `s` carries the **`EscrowStatus` enum as a numeric string** (e.g. `"0"`, `"8"`, `"10"`), not a human-readable name. UI and filters must not assume values like `"Completed"`.

---

## Relationship to Bid and Contract Events

| Kind  | Document                                                     | Role                                       |
| ----- | ------------------------------------------------------------ | ------------------------------------------ |
| 30007 | [bid-nostr-events.md](./bid-nostr-events.md)                 | Taskee submits bid                         |
| 30008 | [bid-nostr-events.md](./bid-nostr-events.md)                 | Tasker accepts/rejects bid                 |
| 30006 | [contract-nostr-events-v1.md](./contract-nostr-events-v1.md) | Tasker publishes funded contract metadata  |
| 31006 | This document                                                | Either party publishes escrow step updates |

Contract status events **reference** the contract Nostr event via tag **`e`** (parent event id) and the blockchain escrow via tag **`r`** (escrow id, same as contract `#d`).

---

## Status Update Lifecycle

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    CONTRACT STATUS (KIND 31006) — HIGH LEVEL                      │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  On-chain action (e.g. completeTask, acceptTask, dispute)                       │
│       │                                                                         │
│       ├─► Often: publishEscrowStatus(PENDING_*) BEFORE tx broadcast            │
│       │         → Kind 31006, action = pending enum, optional tx hash           │
│       │                                                                         │
│       └─► Often: publishEscrowStatus(CONFIRMED) AFTER tx confirmation           │
│                 → Kind 31006, action = blockchain/final enum, transactionHash    │
│                                                                                 │
│  Recipient relay subscription (contract store) OR historical getContracts()       │
│       │                                                                         │
│       └─► handleStatusEvent: decrypt → match #r escrowId → merge statusEvents   │
│             → determineContractState(chain + nostr + role)                      │
│             → optional loadEscrowDetails if tx hash + terminal actions          │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

Primary orchestration of **when** to publish lives in `src/lib/utils/escrow/v1/escrow.ts` via `EscrowNostrEvent.publishEscrowStatus`. See [Flow integration](#publishing) below.

---

## Contract Status Event (Kind 31006)

Published by **whichever party performed the action** (author = sender pubkey). Content is encrypted for the **other participant** only.

### Event Metadata (Nostr envelope)

| Field        | Value                                                                        |
| ------------ | ---------------------------------------------------------------------------- |
| `kind`       | `31006`                                                                      |
| `pubkey`     | Sender’s public key (hex) – Tasker or Taskee                                 |
| `created_at` | Unix timestamp (seconds)                                                     |
| `content`    | **Encrypted** JSON string (NIP-44), see [Content](#content-schema-reference) |
| `tags`       | See [Contract status tags](#contract-status-tags)                            |
| `id`         | SHA256 of serialized event (at signing)                                      |
| `sig`        | Event signature                                                              |

### Contract status tags

Tags are built by `TAG_PATTERNS.contractStatus()` in `src/lib/utils/constants/tags.ts`:

| Tag | Values              | Description                                                               |
| --- | ------------------- | ------------------------------------------------------------------------- |
| `e` | `contractEventId`   | Nostr id of the parent **Kind 30006** contract event                      |
| `r` | `escrowId`          | Blockchain escrow id (same identifier as contract `#d`); used for routing |
| `p` | `recipientPubkey`   | Other party (decryption peer)                                             |
| `s` | `action.toString()` | `EscrowStatus` numeric value as string (e.g. `"4"`, `"8"`)                |
| `v` | `v1` (default)      | Contract **flow** version (`v1`, `v2`, …), not the app build              |
| `m` | `contract-status`   | Message type                                                              |

Additionally, `getSignedEvent()` in `src/lib/utils/nostr.ts` appends a **`v`** tag with `__APP_VERSION__` on all signed events (same pattern as bids and contracts).

---

## Tag Reference

Shared BitTasker single-character tags are documented in [bid-nostr-events.md](./bid-nostr-events.md#tag-reference). For contract status, the critical tags are:

| Tag | Constant | Usage                                      |
| --- | -------- | ------------------------------------------ |
| `e` | `TAGS.E` | Parent contract event id                   |
| `r` | `TAGS.R` | Escrow id (handler reads this for routing) |
| `p` | `TAGS.P` | Recipient pubkey                           |
| `s` | `TAGS.S` | Status action (numeric string)             |
| `v` | `TAGS.V` | Contract version + app version (two tags)  |
| `m` | `TAGS.M` | `contract-status`                          |

---

## Content Schema Reference

Plaintext (before encryption) is JSON with discriminator `type: 'contract-status'`.

### Fields

| Field                      | Type                | Required | Description                                               |
| -------------------------- | ------------------- | -------- | --------------------------------------------------------- |
| `type`                     | `"contract-status"` | yes      | Discriminator                                             |
| `contractEventId`          | string              | yes      | Same as tag `e`                                           |
| `escrowId`                 | string              | yes      | Same as tag `r` / contract content                        |
| `action`                   | `EscrowStatus`      | yes      | Enum (serialized as number in JSON)                       |
| `timestamp`                | number              | yes      | Typically `Date.now()` (ms)                               |
| `message`                  | string              | no       | Human-readable; often from i18n via `publishEscrowStatus` |
| `transactionHash`          | string              | no       | RGB tx when relevant                                      |
| `proposedClientAmount`     | string              | no       | Dispute resolution hints                                  |
| `proposedFreelancerAmount` | string              | no       | Dispute resolution hints                                  |
| `completionAttachments`    | `Attachment[]`      | no       | Evidence when completing work                             |

### TypeScript (source of truth)

```typescript
// src/lib/types/contract.d.ts — NostrContractStatus
interface NostrContractStatus {
	contractEventId: string;
	escrowId: string;
	action: EscrowStatus;
	message?: string;
	timestamp: number;
	type: 'contract-status';
	transactionHash?: string;
	proposedClientAmount?: string;
	proposedFreelancerAmount?: string;
	completionAttachments?: Attachment[];
}

// Wrapped event
interface ContractStatusEvent extends NostrEvent {
	content: NostrContractStatus;
}
```

### Publish parameter types

- **`PublishStatusParams`** — passed to `publishContractStatus()` (`contract.d.ts`).
- **`PublishContractStatusParams`** — passed to `publishEscrowStatus()` in `escrowEvents.ts` (includes `status`, required `transactionHash` for that API shape).

---

## Encryption

- **Standard:** NIP-44 (same as Kind 30006, 30007, 30008, and encrypted DMs).
- **Declared encrypted kind:** `KINDS.CONTRACT_STATUS` is listed in `encryptedKinds` in `src/lib/utils/nostr.ts`.
- **Publish:** `publishNostrEvent(KINDS.CONTRACT_STATUS, …)` encrypts JSON content for the recipient’s pubkey.
- **Decrypt:** `decryptStatusEvent()` in `src/lib/utils/escrow/v1/nostrContract.ts` derives the conversation key from the user’s `nsec` and the **counterparty** pubkey (sender `pubkey` if user is recipient; single `#p` if user is author).

---

## Publishing

### Low level: `publishContractStatus`

**File:** `src/lib/utils/escrow/v1/nostrContract.ts`

1. Build `NostrContractStatus` from `PublishStatusParams`.
2. **Query Kind 30006** with `#d: [escrowId]` to load contract plaintext (after relay returns events; decryption handled in query path as elsewhere).
3. Choose **recipient**: if current user is `clientPubkey`, send to `freelancerPubkey`, else the opposite.
4. Sign and publish Kind **31006** with `TAG_PATTERNS.contractStatus(...)`.

If no contract event is found for that `escrowId`, publish throws (`Contract not found for status update`).

### High level: `publishEscrowStatus`

**File:** `src/lib/utils/escrow/v1/escrowEvents.ts`

- Maps status to translated **message** and toasts (pending vs confirmed).
- Calls `publishContractStatus` with `action: params.status`.

**Call sites:** `src/lib/utils/escrow/v1/escrow.ts` invokes `EscrowNostrEvent.publishEscrowStatus` around escrow operations (pending-before-tx and confirmed-after-tx patterns). **Recovery:** `recoverMissingFundsReleasedEvent` in `nostrContract.ts` may publish `FundsReleased` when stale `PendingAcceptance` is detected and the tx succeeded.

### Handler interface

`INostrContractHandler` in `src/lib/utils/escrow/types.ts` declares `publishContractStatus` and `handleStatusEvent`. `EscrowManager.contractOps` in `src/lib/utils/escrow/index.ts` delegates to the v1 implementation.

---

## Receiving and Handling

### `handleStatusEvent`

**File:** `src/lib/utils/escrow/v1/nostrContract.ts`

1. Decrypt → `ContractStatusEvent`.
2. Read **`escrowId` from tag `r`** (not only from content).
3. Resolve contract in **`contractStore`** via `contractsMap.get(escrowId)`; skip if missing.
4. Append to `statusEvents`, sort by `created_at`.
5. For `action === DisputeResolutionProposed`, optionally fetch dispute proposal from chain before recomputing state.
6. **`determineContractState`** merges blockchain status, Nostr timeline, roles, and dispute data into UI **`status`** and **`permissions`**.
7. If `transactionHash` is set and `action` is one of `{ Completed, FundsReleased, InDispute, DisputeResolved, Cancelled }`, asynchronously **`loadEscrowDetails`** and refresh the store.

### Live subscriptions

**File:** `src/lib/stores/contract.store.ts`

After `loadContracts` succeeds, the store subscribes **twice** (SimplePool accepts one filter per subscription):

| Subscription | Filter gist                                          | Purpose                 |
| ------------ | ---------------------------------------------------- | ----------------------- |
| Incoming     | `kinds: [31006]`, `#p: [userHex]`, `since: now`      | Updates **to** the user |
| Outgoing     | `kinds: [31006]`, `authors: [userHex]`, `since: now` | User’s own publishes    |

Both call `escrow.contractOps.handleStatusEvent`.

**Caveat:** `since` is set at subscribe time; historical status events are loaded via `getContracts` / `queryNostrEvents`, not replayed by these subscriptions.

---

## Querying and Subscriptions

### Batched load with contract events

**File:** `src/lib/utils/escrow/v1/nostrContract.ts` — `getContracts()`

- Queries **Kind 30006** for the user (and network, etc.).
- Uses **`queryNostrEvents`** with a **follow-up** filter: **Kind 31006**, `#e` = each parent contract event **id**.
- Follow-ups are decrypted and attached as **`statusEvents`** (all events, sorted by time in processing).

**File:** `src/lib/utils/nostr.ts` — `queryNostrEvents` matches follow-ups to parents via the **`e`** tag on status events.

### NDK / other consumers

`src/lib/runes/contractRune.svelte.ts` uses an `NDKFilter` with `kinds: [KINDS.CONTRACT_STATUS]` and `#r: [paymentId]` for contract v2–oriented flows. That aligns with using **`r`** as the escrow/payment identifier filter.

---

## EscrowStatus Values

**File:** `src/lib/utils/escrow/v1/escrow.enum.ts`

- **0–5:** Blockchain-aligned states (e.g. `Funded`, `Completed`, `InDispute`, …).
- **6+:** Nostr/pending and UX states (e.g. `PendingCompletion`, `FundsReleased`, `PendingDispute`, …).

Tag **`s`** uses `action.toString()`, so it matches these **numeric** codes as strings.

---

## Related Documentation

- [NDK contract status adaptation plan](./ndk-contract-status-adaptation-plan.md) (design for `NDKContractStatus`, legacy + tag-array formats)
- [Bid Nostr events](./bid-nostr-events.md)
- [Contract Nostr events (Kind 30006, v1)](./contract-nostr-events-v1.md)
- Task status: `docs/tasks/task-status.md`
- Auth / encryption: `docs/auth/encryption.md`

---

## File References

| Purpose                        | File(s)                                                                                |
| ------------------------------ | -------------------------------------------------------------------------------------- |
| Kind constant                  | `src/lib/utils/constants/kinds.ts`                                                     |
| Tag patterns                   | `src/lib/utils/constants/tags.ts` (`TAG_PATTERNS.contractStatus`)                      |
| Types                          | `src/lib/types/contract.d.ts`                                                          |
| Publish status (low level)     | `src/lib/utils/escrow/v1/nostrContract.ts` (`publishContractStatus`)                   |
| Publish status (toasts / i18n) | `src/lib/utils/escrow/v1/escrowEvents.ts` (`publishEscrowStatus`)                      |
| On-chain-driven publishes      | `src/lib/utils/escrow/v1/escrow.ts`                                                    |
| Decrypt + handle               | `src/lib/utils/escrow/v1/nostrContract.ts` (`decryptStatusEvent`, `handleStatusEvent`) |
| Contract store subscriptions   | `src/lib/stores/contract.store.ts`                                                     |
| Encrypted kinds + query helper | `src/lib/utils/nostr.ts`                                                               |
| Escrow facade                  | `src/lib/utils/escrow/index.ts` (`contractOps`)                                        |
| Handler interface              | `src/lib/utils/escrow/types.ts` (`INostrContractHandler`)                              |
| NDK filter example             | `src/lib/runes/contractRune.svelte.ts`                                                 |

# Bid Nostr Events – Complete Documentation

This document describes how bid Nostr events are constructed by the freelancer (Taskee) in BitTasker, with full details on tags, content, encryption, and the complete bid lifecycle.

## Table of Contents

1. [Overview](#overview)
2. [Bid Lifecycle](#bid-lifecycle)
3. [Bid Event (Kind 30007)](#bid-event-kind-30007)
4. [Bid Status Event (Kind 30008)](#bid-status-event-kind-30008)
5. [Tag Reference](#tag-reference)
6. [Content Schema Reference](#content-schema-reference)
7. [Encryption](#encryption)
8. [Querying Bids](#querying-bids)

---

## Overview

Bids in BitTasker are implemented as Nostr events with two event kinds:

| Kind  | Name       | Direction       | Purpose                                              |
| ----- | ---------- | --------------- | ---------------------------------------------------- |
| 30007 | BIDS       | Taskee → Tasker | Freelancer submits a bid offer to the task creator   |
| 30008 | BID_STATUS | Tasker → Taskee | Task creator accepts, rejects, or updates bid status |

Both event kinds use **NIP-44** encryption. The content is encrypted as a direct message between the bidder (Taskee) and the task creator (Tasker).

**Source of truth:** `src/lib/utils/constants/kinds.ts` (KINDS.BIDS, KINDS.BID_STATUS)

---

## Bid Lifecycle

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           BID LIFECYCLE                                          │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  1. SUBMIT BID                                                                  │
│     ┌─────────────┐                    Kind 30007                    ┌─────────┐│
│     │  Taskee     │ ──── Bid Event (encrypted) ────────────────────► │ Tasker  ││
│     │ (Freelancer)│      author: bidder pubkey                       │ (Client)││
│     │             │      #p: task creator pubkey                     │         ││
│     └─────────────┘      #t: taskId, #d: bidId                       └─────────┘│
│                                                                                 │
│  2a. ACCEPT BID                                                                 │
│     ┌─────────────┐                    Kind 30008                    ┌─────────┐│
│     │  Tasker     │ ──── Bid Status (ACCEPTED, encrypted) ─────────► │ Taskee  ││
│     │             │      author: task creator pubkey                 │         ││
│     │             │      #e: bid event id, #p: bidder pubkey         │         ││
│     │             │      content: escrowId, transactionHash          │         ││
│     └─────────────┘                                                   └─────────┘│
│            │                                                                     │
│            │ (on chain confirmation: handleEscrowCreated)                        │
│            ▼                                                                     │
│     ┌─────────────────────────────────────────┐                                  │
│     │ • Publish Contract Event (Kind 30006)   │                                  │
│     │ • sendBidStatusUpdate (ACCEPTED)        │                                  │
│     │ • updateTask → IN_PROGRESS              │                                  │
│     └─────────────────────────────────────────┘                                  │
│                                                                                 │
│  2b. REJECT BID                                                                 │
│     ┌─────────────┐                    Kind 30008                    ┌─────────┐│
│     │  Tasker     │ ──── Bid Status (REJECTED, encrypted) ─────────► │ Taskee  ││
│     └─────────────┘                                                   └─────────┘│
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

**Lifecycle states (BidStatusEnum):** `PENDING`, `ACCEPTED`, `REJECTED`, `WITHDRAWN`, `COUNTERED`

---

## Bid Event (Kind 30007)

Created by the **freelancer (Taskee)** when submitting a bid on a task. Built in `BidForm.svelte` and published via `publishNostrEvent()`.

### Event Metadata (Nostr envelope)

| Field        | Value                                                               |
| ------------ | ------------------------------------------------------------------- |
| `kind`       | `30007`                                                             |
| `pubkey`     | Bidder's public key (hex) – the freelancer submitting the bid       |
| `created_at` | Unix timestamp (seconds)                                            |
| `content`    | **Encrypted** JSON string (NIP-44), see [Bid Content](#bid-content) |
| `tags`       | See [Bid Tags](#bid-tags)                                           |
| `id`         | SHA256 hash of serialized event (computed at signing)               |
| `sig`        | Event signature                                                     |

### Bid Tags

Tags are constructed by `TAG_PATTERNS.bid()` in `src/lib/utils/constants/tags.ts`:

| Tag | Values                  | Description                                                |
| --- | ----------------------- | ---------------------------------------------------------- |
| `d` | `bidId` (UUID)          | Unique bid identifier. TODO: may be replaced by event `id` |
| `t` | `taskId`                | Task reference (d-tag from task event or event id)         |
| `p` | `taskCreatorPubkey`     | Recipient – task creator's pubkey (npub or hex)            |
| `s` | `"pending"`             | Status – always "pending" for new bids                     |
| `m` | `"bid"`                 | Message type identifier                                    |
| `y` | `"FIXED"` \| `"HOURLY"` | Payment type                                               |
| `v` | `__APP_VERSION__`       | **Auto-added** by `getSignedEvent()` – app version         |

**Code reference:**

```typescript
// src/lib/components/bidding/BidForm.svelte (lines 405–410)
const customTags = TAG_PATTERNS.bid(bidData.bidId, task.id, task.npub, 'FIXED');
await publishNostrEvent(KINDS.BIDS, JSON.stringify(bidData), task.npub, customTags);
```

### Bid Content

The content is a JSON object (`NostrBidContent`) serialized and then encrypted with NIP-44 before publishing. All fields below are in the **plaintext** before encryption.

#### Required fields

| Field               | Type    | Description                                             |
| ------------------- | ------- | ------------------------------------------------------- |
| `type`              | `"bid"` | Discriminator                                           |
| `taskId`            | string  | Task identifier (from task event d-tag)                 |
| `taskTitle`         | string  | Task title (for display in sent offers)                 |
| `taskDescription`   | string  | Task description                                        |
| `amount`            | number  | Bid amount in USD                                       |
| `currency`          | string  | `"USD"`                                                 |
| `paymentType`       | string  | `"FIXED"` or `"HOURLY"`                                 |
| `description`       | string  | Bidder's offer description (20–500 chars)               |
| `estimatedDuration` | string  | Human-readable duration (e.g. "2 hours and 30 minutes") |
| `proposedApproach`  | string  | Optional, 20–1000 chars                                 |
| `coverLetter`       | string  | Optional, max 800 chars                                 |
| `timestamp`         | number  | `Date.now()` – creation timestamp                       |
| `bidId`             | string  | `crypto.randomUUID()` – same as tag `d`                 |
| `startDateTime`     | string  | ISO-like local time: `"YYYY-MM-DDTHH:mm:ss"`            |
| `endDateTime`       | string  | ISO-like local time: `"YYYY-MM-DDTHH:mm:ss"`            |

#### Optional fields (populated when available)

| Field                 | Type   | Description                                      |
| --------------------- | ------ | ------------------------------------------------ |
| `taskTranslations`    | object | Task title/description in other languages        |
| `taskCreatorUsername` | string | Task creator's display name                      |
| `taskCreatorAvatar`   | string | Task creator's avatar URL                        |
| `taskCreatorPubkey`   | string | Task creator's public key (npub or hex)          |
| `taskCreatorRating`   | number | Task creator's rating                            |
| `taskBudget`          | object | `{ amount: number, currency?: string }`          |
| `bidderId`            | string | Bidder's npub or user id                         |
| `bidderName`          | string | Bidder's display name                            |
| `bidderAvatar`        | string | Bidder's avatar URL                              |
| `bidderRating`        | number | Bidder's rating                                  |
| `bidderWalletAddress` | string | RGB wallet address for escrow                    |
| `translations`        | object | `BidTranslations` for description/approach/cover |

#### HOURLY-only (when `paymentType === "HOURLY"`)

| Field            | Type   | Description        |
| ---------------- | ------ | ------------------ |
| `hourlyRate`     | number | Rate per hour      |
| `estimatedHours` | number | Estimated duration |

#### Runtime-only (not in initial publish)

| Field    | Type   | Description                                           |
| -------- | ------ | ----------------------------------------------------- |
| `status` | string | Set when bid status event is received (e.g. ACCEPTED) |

**Date format:** `serializeDateWithLocalTime()` produces `"YYYY-MM-DDTHH:mm:ss"` (no timezone) to preserve the user's local time. Parsed with `parseDateWithLocalTime()`.

**Code reference:** `src/lib/types/bid.d.ts`, `src/lib/components/bidding/BidForm.svelte` (lines 366–409)

---

## Bid Status Event (Kind 30008)

Created by the **task creator (Tasker)** when accepting or rejecting a bid. Published via `sendBidStatusUpdate()` in `src/lib/utils/nostr-bid.ts`.

### Event Metadata

| Field        | Value                                                                             |
| ------------ | --------------------------------------------------------------------------------- |
| `kind`       | `30008`                                                                           |
| `pubkey`     | Task creator's public key                                                         |
| `created_at` | Unix timestamp                                                                    |
| `content`    | **Encrypted** JSON string (NIP-44), see [Bid Status Content](#bid-status-content) |
| `tags`       | See [Bid Status Tags](#bid-status-tags)                                           |

### Bid Status Tags

| Tag | Values            | Description                      |
| --- | ----------------- | -------------------------------- |
| `e` | `bidEventId`      | Parent bid event ID              |
| `p` | `bidderPubkey`    | Recipient – bidder's pubkey      |
| `t` | `taskId`          | Task reference                   |
| `s` | status string     | `ACCEPTED`, `REJECTED`, etc.     |
| `m` | `"bid-status"`    | Message type                     |
| `v` | `__APP_VERSION__` | Auto-added by `getSignedEvent()` |

**Code reference:** `TAG_PATTERNS.bidStatus()` in `src/lib/utils/constants/tags.ts`

### Bid Status Content

| Field             | Type   | Required | Description                                  |
| ----------------- | ------ | -------- | -------------------------------------------- |
| `type`            | string | yes      | `"bid-status"`                               |
| `taskId`          | string | yes      | Task ID                                      |
| `status`          | string | yes      | `BidStatusEnum`: ACCEPTED, REJECTED, etc.    |
| `timestamp`       | number | yes      | `Date.now()`                                 |
| `message`         | string | no       | Human-readable message                       |
| `escrowId`        | string | no       | Set when status is ACCEPTED (escrow created) |
| `transactionHash` | string | no       | Set when status is ACCEPTED (tx hash)        |

### When Bid Status is Sent

1. **ACCEPTED** – In `handleEscrowCreated()` (escrowEvents.ts) after the escrow is confirmed on-chain. Includes `escrowId` and `transactionHash`.
2. **REJECTED** – From the bids page (`/dashboard/task/[taskId]/bids`) when the Tasker rejects a bid.

---

## Tag Reference

BitTasker uses single-character tags where possible. Full list from `src/lib/utils/constants/tags.ts`:

| Tag | Constant | Usage                                   |
| --- | -------- | --------------------------------------- |
| `d` | TAGS.D   | Identifier (bid id, escrow id, task id) |
| `e` | TAGS.E   | Event reference                         |
| `p` | TAGS.P   | Pubkey reference                        |
| `t` | TAGS.T   | Task ID                                 |
| `s` | TAGS.S   | Status                                  |
| `m` | TAGS.M   | Message type                            |
| `y` | TAGS.Y   | Payment type (FIXED/HOURLY)             |
| `v` | TAGS.V   | Version (contract) or app version       |
| `n` | TAGS.N   | Network                                 |
| `r` | TAGS.R   | Reply / escrow reference                |

---

## Content Schema Reference

### NostrBidContent (TypeScript)

```typescript
interface NostrBidContent {
	type: 'bid';
	taskId: string;
	taskTitle: string;
	taskDescription: string;
	amount: number;
	currency: string;
	paymentType: 'FIXED' | 'HOURLY';
	description: string;
	estimatedDuration: string;
	proposedApproach: string;
	coverLetter: string;
	timestamp: number;
	bidId: string;
	startDateTime: string; // "YYYY-MM-DDTHH:mm:ss"
	endDateTime: string; // "YYYY-MM-DDTHH:mm:ss"
	taskCreatorPubkey?: string;
	taskCreatorUsername?: string;
	taskCreatorAvatar?: string;
	taskCreatorRating?: number;
	taskTranslations?: TaskTranslations;
	taskBudget?: { amount: number; currency?: string };
	bidderId?: string;
	bidderName?: string;
	bidderAvatar?: string;
	bidderRating?: number;
	bidderWalletAddress?: string;
	hourlyRate?: number | null;
	estimatedHours?: number | null;
	translations?: BidTranslations;
	status?: BidStatusEnum; // Runtime only
}
```

### NostrBidStatus (TypeScript)

```typescript
interface NostrBidStatus {
	type: 'bid-status';
	taskId: string;
	status: BidStatusEnum;
	message?: string;
	timestamp: number;
	escrowId?: string;
	transactionHash?: string;
}
```

---

## Encryption

- **Standard:** NIP-44
- **Encrypted kinds:** BIDS (30007), BID_STATUS (30008), CONTRACT (30006), CONTRACT_STATUS (31006), DIRECT_MESSAGES (4)
- **Flow:** Content is JSON stringified, then encrypted with `nip44.encrypt()` using the conversation key derived from sender's nsec and recipient's pubkey.
- **Recipient handling:** `publishNostrEvent()` converts npub to hex when needed. The `#p` tag may contain npub or hex depending on input.
- **Decryption:** `decryptBidEvent()` in `nostr-bid.ts` determines the other party's pubkey from `event.pubkey` (if we are sender) or from the `#p` tag (if we are recipient).

---

## Querying Bids

### Get bids for a task (Tasker view)

```typescript
getBidsForTask(taskId: string, includeStatus?: boolean): Promise<NostrEvent[]>
```

- **Filter:** `kinds: [30007]`, `#t: [taskId]`, `#p: [taskCreatorPubkey]`, limit 100
- **Followup:** If `includeStatus`, fetches Kind 30008 events with `#e` matching bid event IDs and attaches as `latestStatus`

### Get my bids (Taskee view)

```typescript
getMyBids(includeStatus?: boolean): Promise<NostrEvent[]>
```

- **Filter:** `kinds: [30007]`, `authors: [myPubkey]`, limit 500
- **Followup:** Kind 30008 with `#p: [myPubkey]` for status updates

### Tag filters (TAG_FILTERS)

- `byTask(taskId)` → `#t: [taskId]`
- `byNpub(npub)` → `#p: [npub]`
- `byEvent(eventId)` → `#e: [eventId]`
- `byStatus(status)` → `#s: [status]`

---

## Related Documentation

- Task status flow: `docs/tasks/task-status.md`
- Auth/encryption: `docs/auth/encryption.md`
- Escrow/contract: [Contract creation (Kind 30006)](./contract-nostr-events-v1.md); [contract status (Kind 31006)](./contract-status-nostr-events.md)

---

## File References

| Purpose              | File(s)                                              |
| -------------------- | ---------------------------------------------------- |
| Bid creation UI      | `src/lib/components/bidding/BidForm.svelte`          |
| Bid status send      | `src/lib/utils/nostr-bid.ts` (`sendBidStatusUpdate`) |
| Tag patterns         | `src/lib/utils/constants/tags.ts`                    |
| Event kinds          | `src/lib/utils/constants/kinds.ts`                   |
| Publish/encrypt      | `src/lib/utils/nostr.ts` (`publishNostrEvent`)       |
| Bid types            | `src/lib/types/bid.d.ts`                             |
| Escrow from bid      | `src/lib/utils/escrow/v1/escrowBid.ts`               |
| Accept flow / status | `src/lib/utils/escrow/v1/escrowEvents.ts`            |

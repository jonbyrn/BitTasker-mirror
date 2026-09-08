# Contract Nostr Events – V1 Flow Documentation

This document describes how the contract Nostr event (Kind 30006) is created in the **v1 escrow flow** of BitTasker. It covers the full flow from bid acceptance to contract event publication, including tags, content, encryption, and lifecycle integration.

## Table of Contents

1. [Overview](#overview)
2. [Contract Event Lifecycle](#contract-event-lifecycle)
3. [Contract Event (Kind 30006)](#contract-event-kind-30006)
4. [Tag Reference](#tag-reference)
5. [Content Schema Reference](#content-schema-reference)
6. [Encryption](#encryption)
7. [Flow Integration](#flow-integration)
8. [Querying Contracts](#querying-contracts)

---

## Overview

The contract event in BitTasker v1 represents a **confirmed escrow agreement** between the task creator (Tasker/client) and the freelancer (Taskee). It is published **after** the escrow is created on-chain, linking Nostr to the blockchain state.

| Kind  | Name     | Direction       | Purpose                                                |
| ----- | -------- | --------------- | ------------------------------------------------------ |
| 30006 | CONTRACT | Tasker → Taskee | Task creator notifies freelancer that escrow is funded |

The event uses **NIP-44** encryption and is sent as an encrypted DM to the freelancer.

**Source of truth:** `src/lib/utils/constants/kinds.ts` (KINDS.CONTRACT)

---

## Contract Event Lifecycle

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    CONTRACT EVENT CREATION (V1 FLOW)                             │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  1. BID ACCEPTANCE                                                              │
│     ┌─────────────┐    acceptBidAndCreateEscrow()     ┌─────────────────────┐   │
│     │  Tasker     │ ────────────────────────────────► │ registerPendingCont-│   │
│     │  (Client)   │    • calculateBidEscrowDetails    │ ractByTxHash(txHash)│   │
│     │             │    • createEscrow (blockchain)    │                     │   │
│     └─────────────┘    • tx hash returned             └─────────────────────┘   │
│                                                                                 │
│  2. BLOCKCHAIN CONFIRMATION                                                      │
│     ┌─────────────────────┐    tx.wait() resolves     ┌─────────────────────┐   │
│     │  EscrowCreated evt  │ ◄── Parse from receipt ── │  v1/escrow.ts       │   │
│     │  (escrowId, txHash) │                           │  createEscrow()     │   │
│     └─────────────────────┘                           └─────────────────────┘   │
│            │                                                                     │
│            │  EscrowNostrEvent.handleEscrowCreated({ escrowId, txHash, ... })   │
│            ▼                                                                     │
│  3. CONTRACT EVENT PUBLICATION                                                   │
│     ┌─────────────┐                    Kind 30006                    ┌─────────┐│
│     │  Tasker     │ ──── Contract Event (encrypted) ───────────────► │ Taskee  ││
│     │  (Client)   │      author: client pubkey                      │(Freelanc)││
│     │             │      #p: freelancer pubkey (recipient)          │         ││
│     │             │      #d: escrowId, #t: taskId, #n: network      │         ││
│     └─────────────┘                                                   └─────────┘│
│            │                                                                     │
│            │  (parallel: sendBidStatusUpdate, updateTask, pushNotification)      │
│            ▼                                                                     │
│  4. POST-PUBLICATION                                                             │
│     • contractStore.loadContractByEscrowId(escrowId)                             │
│     • pendingContracts cleanup                                                   │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

**Key point:** The contract event is created only after the blockchain transaction is confirmed. Until then, the pending contract is tracked by transaction hash via `registerPendingContractByTxHash`.

---

## Contract Event (Kind 30006)

Created by the **task creator (Tasker)** after escrow creation is confirmed on-chain. Built in `publishContractEvent()` and published via `publishNostrEvent()`.

### Event Metadata (Nostr envelope)

| Field        | Value                                                                         |
| ------------ | ----------------------------------------------------------------------------- |
| `kind`       | `30006`                                                                       |
| `pubkey`     | Client's public key (hex) – the task creator who funded the escrow            |
| `created_at` | Unix timestamp (seconds)                                                      |
| `content`    | **Encrypted** JSON string (NIP-44), see [Contract Content](#contract-content) |
| `tags`       | See [Contract Tags](#contract-tags)                                           |
| `id`         | SHA256 hash of serialized event (computed at signing)                         |
| `sig`        | Event signature                                                               |

### Contract Tags

Tags are constructed by `TAG_PATTERNS.contract()` in `src/lib/utils/constants/tags.ts`:

| Tag | Values             | Description                                        |
| --- | ------------------ | -------------------------------------------------- |
| `d` | `escrowId`         | Unique escrow/contract identifier from blockchain  |
| `t` | `taskId`           | Task reference (d-tag from task event)             |
| `p` | `freelancerPubkey` | Participant – freelancer's pubkey (recipient)      |
| `p` | `clientPubkey`     | Participant – client's pubkey (author)             |
| `n` | `network`          | Blockchain network: `mainnet` or `testnet`         |
| `v` | `version`          | Contract version – always `v1` in this flow        |
| `s` | `status`           | Status – `active` (default)                        |
| `m` | `"contract"`       | Message type identifier                            |
| `v` | `__APP_VERSION__`  | **Auto-added** by `getSignedEvent()` – app version |

**Code reference:**

```typescript
// src/lib/utils/escrow/v1/nostrContract.ts (lines 65–74)
const tags = TAG_PATTERNS.contract(
	params.escrowId,
	params.taskId,
	params.freelancerPubkey,
	clientPubkey,
	network,
	version // defaults to 'v1'
);
await publishNostrEvent(KINDS.CONTRACT, contractMessage, params.freelancerPubkey, tags);
```

### Contract Content

The content is a JSON object (`NostrContract`) serialized and then encrypted with NIP-44 before publishing. All fields below are in the **plaintext** before encryption.

#### Required fields

| Field                     | Type         | Description                                          |
| ------------------------- | ------------ | ---------------------------------------------------- |
| `type`                    | `"contract"` | Discriminator                                        |
| `escrowId`                | string       | Unique escrow identifier from blockchain             |
| `taskId`                  | string       | Task identifier (d-tag from task event)              |
| `taskTitle`               | string       | Task title                                           |
| `taskDescription`         | string       | Task description                                     |
| `freelancerPubkey`        | string       | Freelancer's public key (hex)                        |
| `clientPubkey`            | string       | Client's public key (hex) – task creator             |
| `amount`                  | string       | Escrow amount in BTC (wei string or decimal)        |
| `currency`                | string       | `"BTC"`                                             |
| `status`                  | EscrowStatus | `EscrowStatus.Funded` – contract created when funded |
| `estimatedStartTime`      | number       | Unix timestamp – estimated start                     |
| `estimatedCompletionTime` | number       | Unix timestamp – estimated completion                |
| `contractAddress`         | string       | RGB escrow contract address (from env)               |

#### Optional fields

| Field             | Type   | Description                               |
| ----------------- | ------ | ----------------------------------------- |
| `transactionHash` | string | RGB transaction hash from escrow creation |

**Code reference:** `src/lib/types/contract.d.ts` (NostrContract), `src/lib/utils/escrow/v1/nostrContract.ts` (lines 46–62)

---

## Tag Reference

Contract-related tags from `src/lib/utils/constants/tags.ts`:

| Tag | Constant | Usage                                  |
| --- | -------- | -------------------------------------- |
| `d` | TAGS.D   | Escrow ID – unique contract identifier |
| `t` | TAGS.T   | Task ID                                |
| `p` | TAGS.P   | Pubkey reference (participants)        |
| `n` | TAGS.N   | Network (mainnet/testnet)              |
| `v` | TAGS.V   | Contract version (v1, v2)              |
| `s` | TAGS.S   | Status                                 |
| `m` | TAGS.M   | Message type (`contract`)              |

---

## Content Schema Reference

### NostrContract (TypeScript)

```typescript
interface NostrContract {
	type: 'contract';
	escrowId: string;
	taskId: string;
	taskTitle: string;
	taskDescription: string;
	freelancerPubkey: string;
	clientPubkey: string;
	amount: string; // BTC amount
	currency: string; // 'BTC'
	status: EscrowStatus; // EscrowStatus.Funded at creation
	estimatedStartTime: number;
	estimatedCompletionTime: number;
	transactionHash?: string;
	contractAddress?: string;
}
```

### CreateContractParams (input to `publishContractEvent`)

```typescript
interface CreateContractParams {
	escrowId: string;
	taskId: string;
	taskTitle: string;
	taskDescription: string;
	freelancerPubkey: string;
	amount: string;
	estimatedStartTime: number;
	estimatedCompletionTime: number;
	transactionHash?: string;
	contractAddress?: string; // defaults to env
	version?: string; // defaults to 'v1'
}
```

---

## Encryption

- **Standard:** NIP-44
- **Encrypted kinds:** CONTRACT (30006), CONTRACT_STATUS (31006), BIDS (30007), BID_STATUS (30008), DIRECT_MESSAGES (4)
- **Flow:** Content is JSON stringified, then encrypted with `nip44.encrypt()` using the conversation key derived from sender's nsec and recipient's pubkey.
- **Recipient:** The freelancer's pubkey is passed as the third argument to `publishNostrEvent()`. The client (Tasker) is the sender/author.
- **Decryption:** `decryptContractEvent()` in `nostrContract.ts` (or equivalent in contract store) decrypts using the recipient's key.

---

## Flow Integration

### Where contract event creation is triggered

1. **Blockchain:** `v1/escrow.ts` – when `createEscrow` tx is confirmed, `EscrowCreated` event is parsed from receipt.
2. **Callback:** `EscrowNostrEvent.handleEscrowCreated({ escrowId, transactionHash, client, freelancer, amount })` is called from the escrow module.
3. **Handler:** `handleEscrowCreated()` in `v1/escrowEvents.ts`:
   - Looks up pending contract by `escrowId` or `transactionHash` from `pendingContractsByTxHash`
   - Builds `CreateContractParams` from `pendingContract` + `event`
   - Calls `publishContractEvent(contractParams)`

### Where pending contract is registered

- **Location:** `v1/escrowBid.ts` – `acceptBidAndCreateEscrow()`
- **When:** After `createEscrow()` is called (tx submitted) and before confirmation.
- **Function:** `registerPendingContractByTxHash({ bidEventId, taskId, taskTitle, taskDescription, freelancerPubkey, amount, estimatedStartTime, estimatedCompletionTime, transactionHash })`
- **Why tx hash:** The escrow ID is unknown until the transaction is confirmed and the `EscrowCreated` log is parsed.

### Sequence (simplified)

```
BidAcceptanceForm → acceptBidAndCreateEscrow
  → createEscrow (blockchain tx)
  → registerPendingContractByTxHash(txHash)
  → (async) tx.wait()
    → EscrowCreated parsed from receipt
    → handleEscrowCreated({ escrowId, txHash, ... })
      → pendingContract = pendingContractsByTxHash.get(txHash)
      → publishContractEvent(contractParams)
      → sendBidStatusUpdate(ACCEPTED)
      → updateTask(IN_PROGRESS)
      → contractStore.loadContractByEscrowId(escrowId)
```

---

## Querying Contracts

### Get contracts for current user

```typescript
// Via contract store
contractStore.loadContractByEscrowId(escrowId);
contractStore.loadContracts(); // all contracts where user is client or freelancer
```

### Nostr filter (Kind 30006)

- **By escrow ID:** `kinds: [30006]`, `#d: [escrowId]`
- **By participant:** `#p: [userPubkey]` (user is client or freelancer)
- **By task:** `#t: [taskId]`

---

## Related Documentation

- Contract status updates (Kind 31006): [contract-status-nostr-events.md](./contract-status-nostr-events.md)
- Bid lifecycle: `docs/payments-v2/bid-nostr-events.md`
- Escrow creation flow: `docs/payments-v2/escrow-creation-report.md`
- Task status: `docs/tasks/task-status.md`
- Auth/encryption: `docs/auth/encryption.md`

---

## File References

| Purpose                       | File(s)                                                                  |
| ----------------------------- | ------------------------------------------------------------------------ |
| Contract event creation       | `src/lib/utils/escrow/v1/nostrContract.ts` (publishContractEvent)        |
| Escrow created handler        | `src/lib/utils/escrow/v1/escrowEvents.ts` (handleEscrowCreated)          |
| Pending contract registration | `src/lib/utils/escrow/v1/escrowBid.ts` (registerPendingContractByTxHash) |
| Blockchain tx confirmation    | `src/lib/utils/escrow/v1/escrow.ts` (createEscrow tx.wait)               |
| Tag patterns                  | `src/lib/utils/constants/tags.ts` (TAG_PATTERNS.contract)                |
| Event kinds                   | `src/lib/utils/constants/kinds.ts`                                       |
| Publish/encrypt               | `src/lib/utils/nostr.ts` (publishNostrEvent)                             |
| Contract types                | `src/lib/types/contract.d.ts`                                            |
| Contract store                | `src/lib/stores/contract.store.ts`                                       |

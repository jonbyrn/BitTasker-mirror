# Contract Management System

## Problem Statement

After escrow contract creation in RSK, both parties need a shared contract view showing task progress, status updates, and actions. The contract should be stored as encrypted Nostr DMs and allow both parties to track the task lifecycle.

## Current Escrow Functions

**Available RSK Contract Functions:**
- `createEscrow()` - Creates and funds escrow contract
- `completeTask()` - Freelancer marks task as complete
- `acceptTask()` - Client accepts work and releases funds
- `cancelEscrow()` - Either party cancels before completion
- `disputeTask()` - Client disputes completed work
- `proposeResolution()` - Either party proposes fund distribution
- `acceptProposal()` - Other party accepts dispute resolution
- `resolveAfterTimelock()` - Auto-resolve after timelock expiration

## Core Challenge: Nostr Event Mutability

**Problem:** Nostr events are immutable and only signable by one party (the client), but we need the freelancer to update task status.

**Current Solutions Analysis:**

### Option 1: Client-Only Updates (Current Approach)
- Client creates and updates contract event
- Freelancer calls `completeTask()` on RSK
- Client receives on-chain event, updates Nostr contract
- **Issue:** Client must be online to relay freelancer actions

### Option 2: Dual Event System (Recommended)
- **Contract Event (Client-signed):** Official contract terms, status
- **Status Events (Both parties):** Task updates, completion requests
- Contract references status events by ID
- **Benefit:** Both parties can communicate directly

### Option 3: Shared Key Contract
- Generate shared private key for contract event
- Both parties can update same event
- **Issue:** Complex key management, security risks

## Recommended Solution: Dual Event System

### Contract Event Structure (Client-signed)
```json
{
  "kind": KINDS.CONTRACT,
  "tags": [
    ["d", "contract-{escrowId}"],
    ["p", "freelancer-pubkey"],
    ["escrow-id", "rsk-escrow-id"],
    ["status", "active|completed|disputed|cancelled"],
    ["latest-status-event", "event-id-from-freelancer"]
  ],
  "content": "encrypted-contract-details"
}
```

### Status Update Events (Both parties)
```json
{
  "kind": /* Add KIND number */ ,
  "tags": [
    ["e", "contract-event-id", "", "root"],
    ["p", "other-party-pubkey"],
    ["action", "task-completed|payment-released|dispute-raised"]
  ],
  "content": "encrypted-status-message"
}
```

## Implementation Flow

1. **Contract Creation:** After RSK escrow creation, client creates encrypted contract event
2. **Status Updates:** Both parties publish status events referencing the contract
3. **Contract Updates:** Client periodically updates contract event with latest status references
4. **UI Display:** Contract view aggregates contract + status events for complete timeline

## Benefits

- **Decentralized:** No server dependency for status updates
- **Real-time:** Both parties can update status immediately
- **Secure:** All communication encrypted via NIP-44
- **Auditable:** Complete timeline preserved on Nostr
- **Offline-friendly:** Updates sync when parties come online

## Technical Requirements

- Extend existing Nostr messaging system
- Add contract event types (kinds 30000, 1000)
- Create contract UI components
- Implement event aggregation logic
- Add contract status synchronization

## UI Components Needed

- Contract dashboard page
- Task status timeline
- Action buttons (Complete Task, Accept Work, Dispute)
- Contract details view
- Status update forms

This approach leverages existing Nostr infrastructure while solving the mutability challenge through event composition rather than shared signing.

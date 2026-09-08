# Payments V2 Documentation

This directory contains documentation for BitTasker's Nostr-based bid and payment system.

## Documents

| Document                                                                         | Description                                                                                                                                           |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| [bid-nostr-events.md](./bid-nostr-events.md)                                     | **Bid Nostr Events** – How freelancer (Taskee) bid events are constructed, including all tags, content schema, encryption, and the full bid lifecycle |
| [wallet-transaction-history-v2-plan.md](./wallet-transaction-history-v2-plan.md) | **Wallet tx history & V2** – How RGB history is classified today, why V2/relay differs from V1, and a phased plan to align labels and payouts         |

## Overview

BitTasker's bid system uses Nostr events for:

- **Bid submission** (Kind 30007) – Taskee → Tasker, encrypted
- **Bid status updates** (Kind 30008) – Tasker → Taskee (accept/reject)

Bid acceptance triggers escrow creation on-chain (RGB/BSC). Contract events (Kind 30006) and contract status (Kind 31006) are documented in the escrow module.

## Related

- [Task status flow](../tasks/task-status.md)
- [Auth / encryption](../auth/encryption.md)

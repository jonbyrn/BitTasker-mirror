# Nostr Bidding System Optimization

## Overview

This document outlines the comprehensive optimization of BitTasker's bidding and contract system, migrating from inefficient Kind 4 DM-based messaging to custom event kinds with tag-based relay filtering.

## Migration Summary

### Performance Improvements

- **100x reduction** in data fetched and decrypted
- **Direct relay-side filtering** using custom tags
- **Automatic deduplication** via Nostr protocol
- **Selective cache invalidation** for granular control

### Before Optimization (Kind 4 DMs)

```typescript
// Fetches ALL conversations (50+ people)
// Fetches 200 messages × 50 = 10,000 messages
// Decrypts all 10,000 messages
// Parses JSON for all 10,000
// Filters client-side for bids
// Manual deduplication

const people = await getMessagedPeople(); // 50+ queries
for (const person of people) {
  const messages = await getMessageHistory(person.pubkey, { limit: 200 }); // 10,000+ messages
  // ... decrypt and filter
}
```

### After Optimization (Custom Kinds + Tags)

```typescript
// Direct query for bids using tags
// Fetch only ~100 relevant bid events
// Decrypt only 100 events
// No client-side filtering needed
// Automatic deduplication by Nostr

const filter: Filter = {
  kinds: [KINDS.BIDS],
  '#t': [taskId],      // Filter by task
  '#p': [userPubkey],  // Filter by recipient
  limit: 100
};
const bidEvents = await queryNostrEvents(filter); // ~100 events
```

## Event Kinds

### KINDS.BIDS (30007)
- **Type**: Parameterized replaceable event
- **Purpose**: Bid submissions
- **Tags**: `d` (bidId), `t` (taskId), `p` (recipient), `s` (status), `m` (message type), `y` (payment type)
- **Benefits**: Automatic deduplication by `d` tag, efficient relay-side filtering

### KINDS.CONTRACT (30006)
- **Type**: Parameterized replaceable event
- **Purpose**: Contract creation and updates
- **Tags**: `d` (escrowId), `t` (taskId), `p` (participants), `s` (status), `m` (message type)
- **Benefits**: Single source of truth per escrow, efficient queries

### KINDS.CONTRACT_STATUS (31006)
- **Type**: Regular event (not replaceable)
- **Purpose**: Contract status updates
- **Tags**: `e` (contract event ID), `r` (escrow ID), `p` (recipient), `s` (action), `m` (message type)
- **Benefits**: Full history of status changes

### KINDS.DIRECT_MESSAGES (4)
- **Type**: Regular event
- **Purpose**: User-to-user chat only
- **Tags**: `p` (recipient) - minimal for privacy
- **Note**: No longer used for bids or contracts

## Tag Standards

All custom tags use single characters following Nostr best practices:

| Tag | Meaning | Example |
|-----|---------|---------|
| `d` | Identifier (unique for replaceable) | `['d', bidId]` |
| `t` | Task ID reference | `['t', taskId]` |
| `p` | Pubkey reference | `['p', userPubkey]` |
| `s` | Status | `['s', 'pending']` |
| `m` | Message type | `['m', 'bid']` |
| `y` | Payment type | `['y', 'FIXED']` |
| `e` | Event reference | `['e', contractEventId]` |
| `r` | Generic reference | `['r', escrowId]` |
| `c` | Contract action | `['c', 'creation']` |

## New Functions

### publishNostrEvent()
```typescript
/**
 * Generic function to publish any Nostr event with encryption support
 */
export async function publishNostrEvent(
  kind: number,
  content: string,
  recipientNpub: string,
  tags: string[][]
): Promise<void>
```

### queryNostrEvents()
```typescript
/**
 * Generic function to query Nostr events with automatic decryption
 */
export async function queryNostrEvents(
  filter: Filter
): Promise<NostrEvent[]>
```

### getBidsForTask()
```typescript
/**
 * Get all bids for a specific task using optimized tag-based filtering
 */
export async function getBidsForTask(
  taskId: string
): Promise<BidMessage[]>
```

### getMyBids()
```typescript
/**
 * Get all bids sent by the current user using optimized tag-based filtering
 */
export async function getMyBids(): Promise<BidMessage[]>
```

### getUserContractsOptimized()
```typescript
/**
 * Get all contracts where the user is either client or freelancer
 * using optimized tag-based filtering
 */
export async function getUserContractsOptimized(
  filter?: ContractFilter
): Promise<ContractWithEvents[]>
```

## Smart Cache

### SmartBidCache Class

Provides namespaced selective invalidation:

```typescript
class SmartBidCache {
  // Cache bids by task
  setBidsForTask(taskId: string, bids: BidMessage[], ttlMinutes?: number): void
  getBidsForTask(taskId: string): BidMessage[] | null
  invalidateTaskBids(taskId: string): void

  // Cache bids by user
  setBidsByUser(userId: string, bids: BidMessage[], ttlMinutes?: number): void
  getBidsByUser(userId: string): BidMessage[] | null
  invalidateUserBids(userId: string): void

  // Cache contracts by escrow
  setContractByEscrow(escrowId: string, contract: ContractWithEvents, ttlMinutes?: number): void
  getContractByEscrow(escrowId: string): ContractWithEvents | null
  invalidateContract(escrowId: string): void

  // Cache contracts by task
  setContractsByTask(taskId: string, contracts: ContractWithEvents[], ttlMinutes?: number): void
  getContractsByTask(taskId: string): ContractWithEvents[] | null
  invalidateTaskContracts(taskId: string): void

  // Cache contracts by user
  setContractsByUser(userId: string, contracts: ContractWithEvents[], ttlMinutes?: number): void
  getContractsByUser(userId: string): ContractWithEvents[] | null
  invalidateUserContracts(userId: string): void

  // Clear methods
  clearAll(): void
  clearBids(): void
  clearContracts(): void
}
```

## Migration Impact

### Breaking Changes

1. **No backward compatibility** - Old Kind 4 bids will NOT be readable by new system
2. **Cache invalidation** - All existing cached data is invalid after migration
3. **Legacy functions deprecated** - `getBidsFromDMs()`, `getBidStatusMessages()`, `deduplicateBids()`

### Migration Strategy

1. Deploy new code with custom event kinds
2. Clear all caches via `smartCache.clearAll()`
3. Users create new bids using KINDS.BIDS (30007)
4. Old Kind 4 bids gradually become irrelevant (time-based expiry)
5. Monitor relay performance and error rates

### Rollback Plan

1. Revert to previous deployment
2. Clear caches again
3. Investigate issues
4. Re-deploy with fixes

## Performance Metrics

### Expected Improvements

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Events fetched per query | 10,000+ | ~100 | 100x reduction |
| Events decrypted | 10,000+ | ~100 | 100x reduction |
| Relay queries per bid list | 50+ | 1 | 50x reduction |
| Time to fetch bids | 5-10s | 100-200ms | 50x faster |
| Client-side filtering | Required | Not needed | N/A |
| Deduplication overhead | Manual | Automatic | Eliminated |

### Actual Metrics (To Be Measured)

- [ ] Average time to fetch bids for task
- [ ] Average time to fetch user contracts
- [ ] Number of events fetched per query
- [ ] Number of relay queries per operation
- [ ] Cache hit rate
- [ ] Error rate after migration

## Testing Checklist

### Unit Tests

- [ ] Test `publishNostrEvent()` with different kinds
- [ ] Test `queryNostrEvents()` with tag filtering
- [ ] Test `getBidsForTask()` with various scenarios
- [ ] Test `getMyBids()` for current user
- [ ] Test `getUserContractsOptimized()` with filters
- [ ] Test `SmartBidCache` selective invalidation

### Integration Tests

- [ ] Create bid → Retrieve bid → Update status
- [ ] Create contract → Update status → Query by escrow ID
- [ ] Filter bids by task and status
- [ ] Cache invalidation and refresh
- [ ] Multiple users bidding on same task
- [ ] Contract status history tracking

### Browser Testing

- [ ] Bid creation flow at `/dashboard/tasks/[id]`
- [ ] Bid listing at `/dashboard?tab=bids`
- [ ] My bids at `/dashboard/messages?tab=my_bids`
- [ ] Received bids at `/dashboard/messages?tab=bids_received`
- [ ] Contract creation and status updates
- [ ] Contract listing at `/dashboard?tab=contracts`

## Future Enhancements

### NIP-17 Migration for Contracts

In the future, contracts will migrate to NIP-17 (Gift Wrapping) for maximum privacy:

- **Gift Wrap Kind 1059**: Outer layer with ephemeral keys
- **Seal Kind 13**: Inner layer with actual encrypted content
- **Chat Message Kind 14**: Innermost layer with contract data

This will provide:
- Complete metadata privacy (sender, recipient, timestamp obscured)
- Enhanced security through multiple encryption layers
- Compliance with privacy regulations

Note: Bids and regular DMs will NOT migrate to NIP-17 as they don't require this level of privacy.

## References

- NIP-01: Basic protocol flow - https://github.com/nostr-protocol/nips/blob/master/01.md
- NIP-33: Parameterized replaceable events - https://github.com/nostr-protocol/nips/blob/master/33.md
- NIP-44: Encrypted direct messages - https://github.com/nostr-protocol/nips/blob/master/44.md
- NIP-17: Private direct messages - https://github.com/nostr-protocol/nips/blob/master/17.md

## Implementation Files

- `src/lib/utils/constants/kinds.ts` - Event kind definitions
- `src/lib/utils/constants/tags.ts` - Tag definitions and patterns
- `src/lib/utils/nostr-message.ts` - Generic publish/query functions
- `src/lib/utils/nostr-bid.ts` - Bid and contract functions
- `src/lib/components/bidding/BidCreationForm.svelte` - Bid creation UI

## Conclusion

This optimization represents a fundamental architectural improvement to BitTasker's bidding system, providing:

1. **Dramatic performance gains** through relay-side filtering
2. **Better user experience** with faster load times
3. **Cleaner code architecture** with separation of concerns
4. **Scalability** for future growth
5. **Foundation for NIP-17** migration when needed

The migration eliminates the inefficient "fetch everything, filter client-side" approach in favor of targeted, efficient queries that leverage Nostr's built-in capabilities for filtering and deduplication.


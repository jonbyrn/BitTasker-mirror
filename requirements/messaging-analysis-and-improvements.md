# Messaging System Analysis & Improvement Plan

**Date:** 2024-01-19  
**Status:** Analysis & Discussion  
**Related Files:**
- `src/lib/utils/nostr-message.ts` (Current Implementation)
- `src/lib/utils/nostr-bid.ts` (Bid/Contract System)
- `requirements/NIP17.md` (Future Implementation)
- `requirements/nip44-messaging-migration-plan.md` (Active Migration)

---

## Table of Contents

1. [Current State Analysis](#current-state-analysis)
2. [Custom Tags Discussion](#custom-tags-discussion)
3. [Event Kind Strategy](#event-kind-strategy)
4. [NIP-17 Future Implementation](#nip-17-future-implementation)
5. [Performance Optimization Opportunities](#performance-optimization-opportunities)
6. [Security Considerations](#security-considerations)
7. [Recommended Improvements](#recommended-improvements)

---

## Current State Analysis

### What's Working

✅ **NIP-44 Encryption**
- Already implemented correctly in `src/lib/nostr/nip44.ts`
- Uses ChaCha20-Poly1305 with proper HKDF key derivation
- Includes padding, nonce generation, and HMAC authentication

✅ **Basic Messaging Infrastructure**
- `sendDirectMessage()` - Sends encrypted DMs
- `getMessageHistory()` - Fetches conversation history
- `listenForIncomingMessages()` - Real-time message subscriptions
- `getMessagedPeople()` - Lists all conversations

✅ **Event Kind 4 Usage**
- Uses standard Kind 4 (DIRECT_MESSAGES) for all DMs
- Compatible with Nostr ecosystem
- Works with existing relays

### Current Issues

❌ **Insufficient Custom Tags**
- Bids, contracts, and status updates all use Kind 4 DMs
- Tags are added but NOT used for filtering
- Must decrypt ALL messages to find specific types

❌ **Inefficient Querying**
- `getBidsFromDMs()` fetches ALL conversations
- `getUserContracts()` fetches ALL conversations
- No relay-side filtering by custom tags

❌ **No Message Type Distinction**
- System messages (bids, contracts) mixed with user messages
- Difficult to query specific message types
- Poor UX (bids appear in chat messages)

---

## Custom Tags Discussion

### Issue #1: Tags Added But Not Used

**Current Implementation in `nostr-bid.ts`:**

```typescript
// Line 548-553: Bid status update
await sendDirectMessage(statusMessage, bidderPubkey, undefined, [
    ['b', bidId],           // ❌ Added but never queried
    ['t', taskId],          // ❌ Added but never queried
    ['s', status],          // ❌ Added but never queried
    ['type', 'bid-status']  // ❌ Added but never queried // TODO: this tag should be migrated to single character
]);

// Line 598-605: Contract creation
await sendDirectMessage(contractMessage, params.freelancerPubkey, undefined, [
    ['d', `contract-${params.escrowId}`],  // ❌ Never queried
    ['p', params.freelancerPubkey],
    ['e', params.escrowId],                // ❌ Never queried
    ['t', params.taskId],                  // ❌ Never queried
    ['s', 'active'],                       // ❌ Never queried
    ['c', 'creation']                      // ❌ Never queried
]);
```

**Problem:**

These tags are being added to events but the retrieval functions never use them:

```typescript
// Current query (nostr-bid.ts line 795)
const history = await getMessageHistory(person.pubkey, { limit: 200 });
// ↑ This fetches ALL messages, ignoring custom tags

// What it SHOULD do:
const filter = {
    kinds: [4],
    '#t': [taskId],      // ← Filter by task tag
    '#type': ['bid'],    // ← Filter by type tag // TODO: this tag should be migrated to single character
    '#p': [userPubkey]
};
```

### Tags We SHOULD Be Using

#### For Bids

```typescript
tags: [
    ['p', recipientPubkey],           // Required: recipient
    ['t', taskId],                    // Task reference (QUERYABLE)
    ['type', 'bid'],                  // Message type (QUERYABLE) // TODO: this tag should be migrated to single character
    ['bid-id', bidId],                // Bid identifier // TODO: this tag should be migrated to single character
    ['status', 'pending']             // Bid status // TODO: this tag should be migrated to single character
]
```

**Query Strategy:**
```typescript
// Get bids for specific task
filter = {
    kinds: [4],
    '#t': [taskId],
    '#type': ['bid'], // TODO: this tag should be migrated to single character
    '#p': [taskCreatorPubkey]
}
```

#### For Contracts

```typescript
tags: [
    ['p', recipientPubkey],
    ['e', escrowId],                  // Escrow reference (QUERYABLE)
    ['t', taskId],                    // Task reference (QUERYABLE)
    ['type', 'contract'],             // Message type (QUERYABLE) // TODO: this tag should be migrated to single character
    ['status', 'active']              // Contract status // TODO: this tag should be migrated to single character
]
```

**Query Strategy:**
```typescript
// Get contracts for specific escrow
filter = {
    kinds: [4],
    '#e': [escrowId],
    '#type': ['contract'], // TODO: this tag should be migrated to single character
    '#p': [userPubkey]
}
```

#### For Contract Status Updates

```typescript
tags: [
    ['p', recipientPubkey],
    ['e', escrowId],                  // Escrow reference
    ['r', contractEventId, '', 'root'], // Thread reply
    ['type', 'contract-status'],      // Message type // TODO: this tag should be migrated to single character
    ['action', 'task-completed']      // Status action // TODO: this tag should be migrated to single character
]
```

### Recommendation #1: Use Custom Tags for Filtering

**Benefits:**
- ✅ 100x reduction in messages to decrypt
- ✅ Better query performance
- ✅ More efficient bandwidth usage
- ✅ Easier to implement pagination
- ✅ Better separation of concerns

**Implementation:**
1. Keep existing tag structure (already good!)
2. Update query functions to USE the tags
3. Create specialized query functions per type

---

## Event Kind Strategy

### Question: Can We Change Kind 4 to Something Else?

**Answer:** YES, but consider the trade-offs carefully.

### Option 1: Keep Kind 4 for Everything (Current)

**Pros:**
- ✅ Compatible with standard Nostr DM clients
- ✅ Works with all relays
- ✅ Simple implementation
- ✅ Can still use custom tags for filtering

**Cons:**
- ❌ Mixes system messages with user messages
- ❌ Poor UX (bids show in chat)
- ❌ Harder to implement different privacy levels

**Verdict:** Acceptable for now, but not ideal long-term

---

### Option 2: Use Custom Event Kinds (Recommended)

**Strategy:** Different kinds for different purposes

#### Kind 4: User-to-User Chat Only
```typescript
{
    kind: 4,
    tags: [['p', recipientPubkey]],
    content: nip44.encrypt("Hello, how are you?", recipientPubkey)
}
```

**Query:**
```typescript
filter = {
    kinds: [4],
    '#p': [userPubkey],
    // No additional type filtering needed
}
```

#### Kind 31000: Public Bids (Parameterized Replaceable)
```typescript
{
    kind: 31000,  // Custom application-specific kind
    tags: [
        ['d', bidId],                // Unique identifier (replaceable)
        ['t', taskId],               // Task reference (QUERYABLE!)
        ['p', taskCreatorPubkey],    // Recipient
        ['status', 'pending']        // Status (QUERYABLE!) // TODO: this tag should be migrated to single character
    ],
    content: nip44.encrypt(bidDetails, taskCreatorPubkey)
}
```

**Query:**
```typescript
// Get ALL bids for a task efficiently
filter = {
    kinds: [31000],
    '#t': [taskId],
    limit: 100
}
```

**Benefits:**
- ✅ Can filter by task without decryption
- ✅ Can filter by status without decryption
- ✅ Separated from chat messages
- ✅ Replaceable (update bid by changing content)
- ✅ Still encrypted (privacy preserved)

#### Kind 31001: Private Contracts (Parameterized Replaceable)
```typescript
{
    kind: 31001,
    tags: [
        ['d', escrowId],              // Unique identifier
        ['t', taskId],                // Task reference
        ['p', freelancerPubkey],      // Participant
        ['p', clientPubkey],          // Participant
        ['status', 'active']          // Status // TODO: this tag should be migrated to single character
    ],
    content: nip44.encrypt(contractData, recipientPubkey)
}
```

**Query:**
```typescript
// Get contract by escrow ID
filter = {
    kinds: [31001],
    '#d': [escrowId]
}
```

#### Kind 31002: Contract Status Updates (Regular)
```typescript
{
    kind: 31002,
    tags: [
        ['e', contractEventId, '', 'root'],  // References contract
        ['r', escrowId],                      // Escrow reference
        ['p', recipientPubkey],
        ['action', 'task-completed'] // TODO: this tag should be migrated to single character
    ],
    content: nip44.encrypt(statusData, recipientPubkey)
}
```

**Query:**
```typescript
// Get status updates for contract
filter = {
    kinds: [31002],
    '#e': [contractEventId],
    '#r': [escrowId]
}
```

### Trade-offs Analysis

| Aspect | Kind 4 Only | Custom Kinds |
|--------|-------------|--------------|
| **Compatibility** | ✅ Works everywhere | ⚠️ BitTasker-specific |
| **Filtering** | ⚠️ Must decrypt all | ✅ Filter before decrypt |
| **Performance** | ❌ Decrypt everything | ✅ 100x faster |
| **Privacy** | ✅ All encrypted equally | ✅ Still encrypted |
| **UX** | ❌ Mixed messages | ✅ Clear separation |
| **Query Complexity** | ❌ Complex client-side | ✅ Simple relay queries |
| **Standard Compliance** | ✅ Standard DMs | ⚠️ Custom protocol |

### Recommendation #2: Use Custom Event Kinds

**Implementation Priority:**
1. **Phase 1 (Now):** Migrate bids to Kind KINDS.BIDS (31007)
2. **Phase 2 (Now):** Migrate contracts to Kind KINDS.CONTRACT/KINDS.CONTRACT_STATUS (31006/31007) - (soon) implement NIP17 later
3. **Phase 3 (Later):** Keep Kind 4 for chat

**Migration Strategy:**
- New events use custom kinds
- Old Kind 4 events remain readable (backward compatible)
- Gradually phase out Kind 4 for system messages

---

## NIP-17 Future Implementation

### When to Use NIP-17

Based on analysis in `requirements/NIP17.md`:

#### ✅ **USE NIP-17 FOR:**

1. **Contracts & Financial Data**
   - Highest privacy requirements
   - Contains sensitive amounts, escrow IDs, transaction hashes
   - Needs deniability for legal protection
   - Metadata leakage is a real concern

2. **Dispute Communications**
   - Legally sensitive
   - Requires deniability
   - Privacy critical during resolution

3. **Payment Confirmations**
   - Sensitive transaction details
   - Financial privacy important

#### ❌ **DO NOT USE NIP-17 FOR:**

1. **Bids**
   - Semi-public by nature
   - Task creators need to see them
   - Performance matters (many bids per task)
   - Filtering by task ID is critical for UX
   - **Solution:** Use Kind defined in kinds.ts with NIP-44 encryption

2. **Task Notifications**
   - Need efficient filtering
   - Not highly sensitive
   - Performance critical
   - **Solution:** Use custom kinds with tags

3. **Public Messages**
   - No privacy needed
   - **Solution:** Use regular events (unencrypted)

### NIP-17 Implementation Timeline

**Not Now:** Time constraints prevent immediate implementation

**Future Phase:**
1. Finish current NIP-44 migration
2. Stabilize custom event kinds for bids
3. THEN implement NIP-17 for contracts only
4. Monitor performance and user feedback
5. Expand to other use cases if needed

### Why Contracts Only?

**Reasoning:**
- Contracts have the highest privacy requirements
- Financial data needs maximum protection
- Legal deniability is important
- Volume is manageable (fewer contracts than bids)
- Performance hit is acceptable for this use case

**Performance Consideration:**
- NIP-17 requires decrypting ALL gift wraps addressed to you
- Can't filter by escrow ID, task ID, or status before decryption
- Acceptable for contracts (~10-50 per user)
- NOT acceptable for bids (~100-500 per task)

---

## Performance Optimization Opportunities

### Current Performance Issues

#### 1. **Fetching All Conversations**

**Problem:**
```typescript
// nostr-bid.ts line 789-813
const messagedPeople = await getMessagedPeople(); // Gets ALL conversations
const messageHistoryPromises = messagedPeople.map(async (person) => {
    return await getMessageHistory(person.pubkey, { limit: 200 });
});
// ↑ Fetches 200 messages × 50 contacts = 10,000 messages
// ↑ Decrypts all 10,000 messages
// ↑ Parses JSON for all 10,000 messages
```

**Solution:**
```typescript
// Query specific message type directly
const filter = {
    kinds: [KINDS.BIDS], // Bid kind
    '#t': [taskId], // Filter by task
    '#p': [userPubkey],
    limit: 100
};
const bidEvents = await pool.querySync(relays, filter);
// ↑ Fetches only ~100 relevant events
// ↑ Decrypts only 100 messages
// ↑ 100x performance improvement!
```

#### 2. **Deduplication**

**Current Implementation:**
```typescript
// nostr-bid.ts lines 191-205
export function deduplicateBids(bids: BidMessage[]): BidMessage[] {
    const uniqueByBidId = new Map<string, BidMessage>();
    
    for (const bid of bids) {
        // Keeps FIRST occurrence
        if (!uniqueByBidId.has(bid.bid.bidId)) {
            uniqueByBidId.set(bid.bid.bidId, bid);
        }
    }
    
    return Array.from(uniqueByBidId.values());
}
```

**Issues:**
1. Keeps FIRST occurrence (should keep LATEST)
2. Deduplicates by `bidId` (should use event ID)
3. Doesn't handle updated bids

**Better Approach:**

Use parameterized replaceable events (Kind 30000-39999):
- Nostr automatically replaces old events with same `d` tag
- No client-side deduplication needed
- Always get latest version

```typescript
// Kind from kinds.ts with d tag
{
    kind: KINDS.BIDS,
    tags: [
        ['d', bidId], // ← Nostr handles replacement automatically
        ['t', taskId]
    ]
}

// Query returns only latest version per bidId
filter = { kinds: [KINDS.BIDS], '#t': [taskId] }
```

**Alternative (if using Kind 4):**

```typescript
export function deduplicateBids(bids: BidMessage[]): BidMessage[] {
    const uniqueByEventId = new Map<string, BidMessage>();
    
    for (const bid of bids) {
        const eventId = bid.event.id;
        const existing = uniqueByEventId.get(eventId);
        
        // Keep newest version
        if (!existing || bid.event.created_at > existing.event.created_at) {
            uniqueByEventId.set(eventId, bid);
        }
    }
    
    return Array.from(uniqueByEventId.values());
}
```

#### 3. **Cache Strategy**

**Current Cache:**
```typescript
// nostr-bid.ts lines 39-101
class BidCache {
    private cache = new Map<string, CacheEntry<any>>();
    private readonly MAX_CACHE_SIZE = 100;
    
    set<T>(key: string, data: T, ttlMinutes: number = 5): void
    get<T>(key: string): T | null
}
```

**Issues:**
1. Global `clearBidCache()` invalidates ALL tasks
2. Fixed 5-minute TTL (too short? too long?)
3. No selective invalidation
4. No cache versioning

**Better Strategy:**

```typescript
class SmartCache {
    private caches = new Map<string, Map<string, CacheEntry>>();
    
    // Namespace by type
    setBid(taskId: string, bidId: string, data: BidMessage) {
        if (!this.caches.has('bids')) {
            this.caches.set('bids', new Map());
        }
        const bidCache = this.caches.get('bids')!;
        
        if (!bidCache.has(taskId)) {
            bidCache.set(taskId, new Map());
        }
        // Cache per task
    }
    
    // Selective invalidation
    invalidateTask(taskId: string) {
        this.caches.get('bids')?.delete(taskId);
    }
    
    // Keep contract cache separate
    invalidateContract(escrowId: string) {
        this.caches.get('contracts')?.delete(escrowId);
    }
}
```

---

## Security Considerations

### Current Security Status

✅ **Good:**
- NIP-44 encryption implemented correctly
- Proper HKDF key derivation
- HMAC authentication
- ChaCha20-Poly1305 cipher

⚠️ **Consider:**
- Keys stored in browser (acceptable for web app)
- No forward secrecy (NIP-44 limitation)
- Tags are public (visible to relays)

### Tag Privacy Implications

**What's Visible to Relays:**

With Kind 4 + Custom Tags:
```json
{
    "kind": 4,
    "tags": [
        ["p", "receiver_pubkey"],      // ← VISIBLE
        ["t", "task_id_123"],          // ← VISIBLE (task association)
        ["type", "bid"],               // ← VISIBLE (message type) // TODO: this tag should be migrated to single character
        ["status", "pending"]          // ← VISIBLE (status) // TODO: this tag should be migrated to single character
    ],
    "content": "<encrypted>"           // ← ENCRYPTED
}
```

**Privacy Analysis:**
- Relay knows: who received message, which task, message type
- Relay doesn't know: bid amount, description, sender identity (beyond pubkey)

**Is This Acceptable?**

For **Bids:** YES
- Task creators need to see bids anyway
- Task ID being visible is not a privacy concern
- Bid content is still encrypted

For **Contracts:** No - will be migrated to NIP17 later
- Escrow ID being visible could be a concern
- Consider NIP-17 for maximum privacy
- Or use less descriptive tags

For **User Chat:** NO
- keep minimal tags (just `p` tag)

### Recommendation #3: Tiered Privacy

**Tier 1: Public Data (No Encryption)**
- Task listings
- Public profiles
- Task categories

**Tier 2: Semi-Private (NIP-44 + Custom Kinds)**
- Bids (task association visible, content encrypted)
- Task notifications
- Status updates

**Tier 3: Private (NIP-44 + Kind 4 or Custom Kinds)**
- User-to-user chat

**Tier 4: Maximum Privacy (NIP-17)**
- Contracts with financial data
- Dispute communications
- Payment confirmations

---

## Recommended Improvements

### Immediate Actions (Priority 1)

#### 1. Add Tag-Based Filtering

**File:** `src/lib/utils/nostr-bid.ts`

**Change:** Update query functions to USE custom tags

```typescript
// Instead of fetching all conversations:
export async function getBidsForTask(taskId: string): Promise<BidMessage[]> {
    const npub = await getNpub();
    const userPubkey = nip19.decode(npub).data as string;
    const pool = getPool();
    
    // Query with tags
    const filter: Filter = {
        kinds: [KINDS.BIDS],
        '#t': [taskId],       // ← Use the tag!
        '#type': ['bid'],     // ← Filter by type! - TODO: this tag should be migrated to single character
        '#p': [userPubkey],
        limit: 100
    };
    
    const events = await pool.querySync(relays, filter);
    
    // NOW decrypt only relevant messages
    const bids = await decryptBidEvents(events);
    return bids;
}
```

**Benefit:** 100x performance improvement

#### 2. Fix Deduplication Logic

**Change:** Keep LATEST event, not FIRST

```typescript
export function deduplicateBids(bids: BidMessage[]): BidMessage[] {
    const uniqueByEventId = new Map<string, BidMessage>();
    
    for (const bid of bids) {
        const existing = uniqueByEventId.get(bid.event.id);
        
        // Keep newer version
        if (!existing || bid.event.created_at > existing.event.created_at) {
            uniqueByEventId.set(bid.event.id, bid);
        }
    }
    
    return Array.from(uniqueByEventId.values());
}
```

#### 3. Implement Selective Cache Invalidation

**Change:** Invalidate by namespace (task/contract)

```typescript
// Instead of global clear
clearBidCache(); // ❌ Clears everything

// Use selective clear
bidCache.invalidateTask(taskId); // ✅ Only this task
bidCache.invalidateContract(escrowId); // ✅ Only this contract
```

---

### Short-Term Actions (Priority 2)

#### 4. Migrate Bids to Custom Event Kind

**Target:** Kind KINDS.BIDS (Parameterized Replaceable)

**Benefits:**
- Automatic deduplication by Nostr
- Better query performance
- Separated from chat messages
- Still encrypted

**Migration Steps:**
1. Update `BidCreationForm.svelte` to use Kind 31000
2. Update `getBidsForTask()` to query Kind 31000
3. Keep backward compatibility for old Kind 4 bids
4. Test thoroughly

#### 5. Add More Descriptive Tags

**Current:**
```typescript
tags: [['t', taskId], ['type', 'bid']]  // TODO: this tag should be migrated to single character
```

**Better:**
```typescript
tags: [
    ['t', taskId],
    ['type', 'bid'], // TODO: this tag should be migrated to single character
    ['bid-id', bidId], // TODO: this tag should be migrated to single character
    ['status', 'pending'], // TODO: this tag should be migrated to single character
    ['payment-type', 'FIXED'], // or 'HOURLY' // TODO: this tag should be migrated to single character
    ['p', taskCreatorPubkey]
]
```

**Query Examples:**
```typescript
// Get all pending bids for task
filter = { kinds: [KINDS.BIDS], '#t': [taskId], '#status': ['pending'] } // TODO: this tag should be migrated to single character

// Get all FIXED price bids
filter = { kinds: [KINDS.BIDS], '#payment-type': ['FIXED'] } // TODO: this tag should be migrated to single character
```

---

### Long-Term Actions (Priority 3)

#### 6. Implement NIP-17 for Contracts

**Timeline:** After current migration complete

**Scope:** Contracts and financial messages only

**Benefit:** Maximum privacy for sensitive data

#### 7. Optimize Decryption with Web Workers

**Current:** Decryption blocks main thread

**Better:** Offload to Web Worker

```typescript
// Main thread
const worker = new Worker('decrypt-worker.js');
worker.postMessage({ events, privateKey });
worker.onmessage = (e) => {
    const decryptedMessages = e.data;
    displayMessages(decryptedMessages);
};
```

#### 8. Implement Message Pagination

**Current:** Loads all messages at once

**Better:** Load in chunks (50 messages per page)

```typescript
export async function getMessageHistory(
    withPubkey: string,
    options: { limit: number, until?: number }
): Promise<{ messages: Message[], hasMore: boolean }> {
    const filter = {
        kinds: [4],
        '#p': [withPubkey],
        limit: options.limit,
        until: options.until
    };
    
    const events = await pool.querySync(relays, filter);
    const hasMore = events.length === options.limit;
    
    return { messages: await decryptEvents(events), hasMore };
}
```

---

## Additional Questions to Consider

### 1. Relay Strategy

**Question:** Are we using the optimal relays?

**Considerations:**
- Relay reliability (uptime, performance)
- Relay privacy (do they log data?)
- Relay cost (paid vs free)
- Geographic distribution

**Recommendation:**
- Test multiple relays
- Implement relay selection based on performance metrics
- Consider running own relay for BitTasker-specific events

### 2. Event Deletion

**Question:** Should users be able to delete messages?

**NIP-09:** Event Deletion (kind 5)

**Considerations:**
- Relays may or may not honor deletion
- No guarantee messages are actually deleted
- Useful for removing mistakes/spam

**Recommendation:**
- Implement UI for deletion requests (NIP-09)
- Mark as deleted client-side (immediate feedback)
- Don't rely on deletion for security

### 3. Message Reactions

**Question:** Should bids/contracts support reactions?

**NIP-25:** Reactions (kind 7)

**Use Cases:**
- Task creator "likes" a bid
- Quick acknowledgment of contract status
- Non-verbal communication

**Recommendation:**
- Consider for user chat
- Probably not needed for bids/contracts (use status instead)

### 4. File Attachments

**Question:** How to handle file attachments in messages?

**Current:** No attachment support

**Options:**
1. **NIP-94:** File Metadata (kind 1063)
2. **NIP-95:** File Storage (kind 1064-1065)
3. **External:** Upload to S3/IPFS, share URL

**Recommendation:**
- For contracts: Support completion evidence (images/videos)
- Use external storage + share encrypted URL
- Implement in Phase 2 after core messaging stable

### 5. Message Threading

**Question:** Should messages support threading/replies?

**Current:** Uses `e` tags for threading

**Considerations:**
- Useful for contract discussions
- Helps organize conversation context
- Already partially implemented

**Recommendation:**
- Keep existing `e` tag threading
- Ensure UI displays threads correctly
- Don't over-complicate

### 6. Search & Filtering

**Question:** How to search message history?

**Current:** No search

**Challenges:**
- Messages are encrypted
- Can't search content without decrypting
- Can search tags (if using custom kinds)

**Recommendation:**
- Phase 1: Search by conversation (profile name/pubkey)
- Phase 2: Search by task ID (for bids/contracts)
- Phase 3: Full-text search (requires local decryption)

---

## Summary & Action Plan

### Key Insights

1. ✅ **NIP-44 encryption is working** - no migration needed
2. ❌ **Custom tags are unused** - biggest optimization opportunity
3. ⚠️ **Kind 4 is suboptimal** - consider custom kinds
4. ❌ **Query patterns are inefficient** - fetch too much data
5. 📅 **NIP-17 is not urgent** - implement for contracts later

### Immediate Next Steps

1. **Update query functions** to use custom tags (biggest win)
2. **Fix deduplication** to keep latest events
3. **Implement selective cache** invalidation
4. **Test performance** improvements

### Medium-Term Goals

1. **Migrate bids** to Kind 31000 (custom kind)
2. **Migrate contracts** to Kind 31001/31002
3. **Keep Kind 4** for user chat
4. **Add more descriptive** tags

### Long-Term Vision

1. **Implement NIP-17** for contracts (maximum privacy)
2. **Optimize decryption** with Web Workers
3. **Improve UX** with better filtering/search
4. **Monitor performance** and iterate

---

## Conclusion

The current messaging system is **functionally correct** but **performance-inefficient**. The biggest wins come from:

1. **Using custom tags for filtering** (already added, just not used!)
2. **Separating message types** with custom event kinds
3. **Selective caching** to avoid unnecessary invalidation

**NIP-17 is NOT urgent** - it's a future enhancement for maximum privacy on contracts. The current NIP-44 + custom kinds approach provides a good balance of privacy, performance, and compatibility.

**Focus on optimizing the current system first**, then consider NIP-17 when contracts are stable and you have time to implement the complexity.

---

**Next Discussion Topics:**

- How to structure custom event kinds (31000, 31001, 31002)?
- Should we support message reactions and attachments?
- What's the optimal cache invalidation strategy?
- How to handle backward compatibility during migration?
- When to implement NIP-17 for contracts?

**Ready to discuss any of these topics in detail!**


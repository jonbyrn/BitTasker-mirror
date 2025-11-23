# NIP-17: Private Direct Messages

**Status:** Draft  
**Specification:** https://github.com/nostr-protocol/nips/blob/master/17.md  
**Dependencies:** NIP-44 (Encryption), NIP-59 (Gift Wrapping), NIP-01 (Events)

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Event Kinds](#event-kinds)
4. [Encryption Flow](#encryption-flow)
5. [Decryption Flow](#decryption-flow)
6. [Security Properties](#security-properties)
7. [Limitations](#limitations)
8. [Implementation Considerations](#implementation-considerations)
9. [Trade-offs](#trade-offs)
10. [Use Cases for BitTasker](#use-cases-for-bittasker)
11. [Migration Strategy](#migration-strategy)
12. [References](#references)

---

## Overview

NIP-17 defines an **encrypted chat scheme** for private direct messages on the Nostr protocol. It combines:

- **NIP-44** for robust content encryption using ChaCha20-Poly1305
- **NIP-59** for "gift wrapping" to protect metadata (sender, receiver, timestamp)

The key innovation of NIP-17 is **metadata protection** - it hides who is talking to whom, when they're talking, and prevents correlation attacks that could reveal conversation patterns.

### Key Principle

> **Events MUST NOT be signed** to enable **deniability** - if messages leak, the sender can deny authorship while the recipient can still authenticate them through decryption.

---

## Architecture

NIP-17 uses a **three-layer nested structure**:

```
┌─────────────────────────────────────────────────────────────┐
│ OUTER: Gift Wrap (Kind 1059)                                │
│ ├─ pubkey: RANDOM (ephemeral, changes per message)         │
│ ├─ created_at: RANDOM (± 2 days from real time)            │
│ ├─ tags: [['p', receiver_pubkey]]                          │
│ └─ content: ENCRYPTED                                       │
│                                                             │
│    ┌────────────────────────────────────────────────────┐  │
│    │ MIDDLE: Seal (Kind 13)                             │  │
│    │ ├─ pubkey: REAL SENDER                             │  │
│    │ ├─ created_at: RANDOM (± 2 days)                   │  │
│    │ ├─ tags: [] (EMPTY)                                │  │
│    │ ├─ content: ENCRYPTED                              │  │
│    │ └─ sig: MISSING (unsigned for deniability)         │  │
│    │                                                     │  │
│    │    ┌───────────────────────────────────────────┐  │  │
│    │    │ INNER: Chat Message (Kind 14/15)         │  │  │
│    │    │ ├─ pubkey: REAL SENDER                   │  │  │
│    │    │ ├─ created_at: REAL TIMESTAMP            │  │  │
│    │    │ ├─ tags: [['p', receiver], ['e', reply]]│  │  │
│    │    │ ├─ content: PLAINTEXT MESSAGE            │  │  │
│    │    │ └─ sig: MISSING (unsigned)               │  │  │
│    │    └───────────────────────────────────────────┘  │  │
│    └────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## Event Kinds

### Kind 14: Chat Message

**Purpose:** The actual message content  
**Signature:** UNSIGNED (for deniability)  
**Structure:**

```json
{
  "id": "<calculated from event data>",
  "pubkey": "<sender-pubkey>",
  "created_at": "<actual-timestamp>",
  "kind": 14,
  "tags": [
    ["p", "<receiver-1-pubkey>", "<relay-url>"],
    ["p", "<receiver-2-pubkey>", "<relay-url>"],
    ["e", "<kind-14-id>", "<relay-url>", "reply"],
    ["subject", "<conversation-title>"],
    ["q", "<event-id-or-address>", "<relay>", "<pubkey>"]
  ],
  "content": "<message-in-plain-text>",
  "sig": "" // MISSING - unsigned event
}
```

**Tags:**
- `p`: Identifies message recipients (can have multiple for group chats)
- `e`: References parent message (for threading/replies)
- `subject`: Conversation title (optional, newest subject becomes current)
- `q`: Cites events in content (NIP-21 format)

**Content:** Plain text message (NOT encrypted at this layer - encryption happens when sealed)

---

### Kind 15: File Message

**Purpose:** Encrypted file sharing  
**Signature:** UNSIGNED  
**Structure:**

```json
{
  "kind": 15,
  "pubkey": "<sender-pubkey>",
  "created_at": "<actual-timestamp>",
  "tags": [
    ["p", "<receiver-pubkey>", "<relay>"],
    ["e", "<kind-14-id>", "<relay>", "reply"],
    ["subject", "<conversation-title>"],
    ["file-type", "<mime-type>"],
    ["encryption-algorithm", "aes-gcm"],
    ["decryption-key", "<key>"],
    ["decryption-nonce", "<nonce>"],
    ["x", "<sha256-of-encrypted-file>"],
    ["ox", "<sha256-of-original-file>"],
    ["size", "<bytes>"],
    ["dim", "<width>x<height>"],
    ["blurhash", "<blurhash>"],
    ["thumb", "<thumbnail-url>"],
    ["fallback", "<alternate-url>"]
  ],
  "content": "<file-url>"
}
```

**File Encryption:** Files are encrypted separately (e.g., AES-GCM) before uploading. The Kind 15 event contains the decryption parameters.

---

### Kind 13: Seal

**Purpose:** Seals the chat message with sender's identity  
**Signature:** UNSIGNED (for deniability)  
**Structure:**

```json
{
  "id": "<calculated-hash>",
  "pubkey": "<real-sender-pubkey>",
  "created_at": "<random-timestamp>",
  "kind": 13,
  "tags": [],
  "content": "<nip44-encrypted-kind-14-or-15-event>",
  "sig": "" // MISSING - unsigned
}
```

**Key Points:**
- Contains the real sender's pubkey (only visible after decryption)
- `tags` array is EMPTY - all metadata is inside encrypted content
- `created_at` is RANDOMIZED (± 2 days) to prevent timing correlation
- UNSIGNED - recipient authenticates via decryption, not signature

---

### Kind 1059: Gift Wrap

**Purpose:** Hides sender identity and obfuscates metadata  
**Signature:** SIGNED (with ephemeral key)  
**Structure:**

```json
{
  "id": "<calculated-hash>",
  "pubkey": "<random-ephemeral-pubkey>",
  "created_at": "<random-timestamp>",
  "kind": 1059,
  "tags": [
    ["p", "<receiver-pubkey>", "<relay-url>"]
  ],
  "content": "<nip44-encrypted-seal>",
  "sig": "<signature-from-ephemeral-key>"
}
```

**Key Points:**
- `pubkey` is a RANDOM ephemeral key (generated fresh for each message)
- `created_at` is RANDOMIZED (up to 2 days in the past)
- Only the `p` tag is visible (shows who it's for, not who it's from)
- Multiple gift wraps are sent: one to receiver, one to sender (for multi-device sync)

---

## Encryption Flow

### Step-by-Step Process

#### 1. Create Inner Message (Kind 14)

```
message = {
  kind: 14,
  pubkey: senderPubkey,
  created_at: Math.floor(Date.now() / 1000),
  tags: [
    ['p', receiverPubkey],
    ['subject', 'Project Discussion']
  ],
  content: "Hello! Can we discuss the contract?"
}
// Note: Do NOT sign this event
```

#### 2. Seal the Message (Kind 13)

```
// Encrypt the Kind 14 message using NIP-44
conversationKey = nip44.getConversationKey(senderPrivkey, senderPubkey)
nonce = randomBytes(32) // CSPRNG
encryptedMessage = nip44.encrypt(JSON.stringify(message), conversationKey, nonce)

seal = {
  kind: 13,
  pubkey: senderPubkey,
  created_at: randomTimestamp(), // ± 2 days
  tags: [],
  content: encryptedMessage
}
// Note: Do NOT sign this event
```

#### 3. Gift Wrap the Seal (Kind 1059) - For Receiver

```
// Generate ephemeral keypair
ephemeralPrivkey = randomBytes(32)
ephemeralPubkey = getPublicKey(ephemeralPrivkey)

// Encrypt seal to receiver
conversationKey = nip44.getConversationKey(ephemeralPrivkey, receiverPubkey)
nonce = randomBytes(32)
encryptedSeal = nip44.encrypt(JSON.stringify(seal), conversationKey, nonce)

giftWrapToReceiver = {
  kind: 1059,
  pubkey: ephemeralPubkey, // Random key
  created_at: randomTimestamp(), // ± 2 days
  tags: [
    ['p', receiverPubkey]
  ],
  content: encryptedSeal
}
// Sign with ephemeral key
giftWrapToReceiver.id = calculateEventId(giftWrapToReceiver)
giftWrapToReceiver.sig = signEvent(giftWrapToReceiver, ephemeralPrivkey)
```

#### 4. Gift Wrap the Seal (Kind 1059) - For Sender (Multi-device)

```
// Generate another ephemeral keypair
ephemeralPrivkey2 = randomBytes(32)
ephemeralPubkey2 = getPublicKey(ephemeralPrivkey2)

// Encrypt seal to sender (for their own devices)
conversationKey = nip44.getConversationKey(ephemeralPrivkey2, senderPubkey)
nonce = randomBytes(32)
encryptedSeal = nip44.encrypt(JSON.stringify(seal), conversationKey, nonce)

giftWrapToSender = {
  kind: 1059,
  pubkey: ephemeralPubkey2,
  created_at: randomTimestamp(),
  tags: [
    ['p', senderPubkey]
  ],
  content: encryptedSeal
}
// Sign and publish
```

#### 5. Publish Both Gift Wraps

```
publishToRelays([giftWrapToReceiver, giftWrapToSender])
```

---

## Decryption Flow

### Step-by-Step Process

#### 1. Query Gift Wraps Addressed to You

```
filter = {
  kinds: [1059],
  '#p': [myPubkey],
  since: lastSyncTime,
  limit: 100
}
giftWraps = queryRelays(filter)
```

#### 2. Decrypt Gift Wrap to Get Seal

```
for (const wrap of giftWraps) {
  try {
    // Derive conversation key using receiver's privkey and ephemeral pubkey
    conversationKey = nip44.getConversationKey(myPrivkey, wrap.pubkey)
    
    // Decrypt the seal
    sealJson = nip44.decrypt(wrap.content, conversationKey)
    seal = JSON.parse(sealJson)
    
    // seal is now a Kind 13 event
  } catch (error) {
    continue // Not meant for us or corrupted
  }
}
```

#### 3. Decrypt Seal to Get Chat Message

```
// Use sender's pubkey from seal
conversationKey = nip44.getConversationKey(myPrivkey, seal.pubkey)

// Decrypt the chat message
messageJson = nip44.decrypt(seal.content, conversationKey)
chatMessage = JSON.parse(messageJson)

// chatMessage is now a Kind 14 or Kind 15 event
```

#### 4. Verify and Display

```
// Verify sender
if (chatMessage.pubkey !== seal.pubkey) {
  throw new Error('Sender mismatch')
}

// Display message
displayMessage({
  from: chatMessage.pubkey,
  to: chatMessage.tags.find(t => t[0] === 'p')[1],
  content: chatMessage.content,
  timestamp: chatMessage.created_at,
  subject: chatMessage.tags.find(t => t[0] === 'subject')?.[1]
})
```

---

## Security Properties

### What NIP-17 Provides

1. ✅ **End-to-End Encryption** - Content is encrypted with NIP-44
2. ✅ **Sender Anonymity** - Real sender is hidden by ephemeral keys
3. ✅ **Receiver Privacy** - Only `p` tag visible (common for many messages)
4. ✅ **Timing Obfuscation** - Random timestamps prevent correlation
5. ✅ **Deniability** - Unsigned events can be plausibly denied if leaked
6. ✅ **Authentication** - Recipient can verify sender via decryption
7. ✅ **Fully Recoverable** - Messages stored on relays, accessible with private key
8. ✅ **Multi-device Support** - Sender receives copy for their own devices
9. ✅ **Public Relay Compatible** - Works on public relays without loss of privacy

---

## Limitations

### What NIP-17 Does NOT Provide

1. ❌ **No Forward Secrecy** - Compromised key = all past messages decrypted
2. ❌ **No Post-Compromise Security** - Compromised key = all future messages decrypted
3. ❌ **No Post-Quantum Security** - Quantum computers could break encryption
4. ❌ **No Deniability for Receivers** - Receiver can prove sender sent message
5. ❌ **Limited Scalability** - Group chats >100 participants not recommended
6. ❌ **IP Leakage** - Relay can see your IP address when publishing
7. ❌ **Timestamp Leakage** - `created_at` has some entropy but bounded to ±2 days
8. ❌ **Message Size Leakage** - Padding reduces but doesn't eliminate size info
9. ❌ **No Attachments in Protocol** - Files handled separately (Kind 15)
10. ❌ **Relay Dependency** - Messages stored on relays (deletion not guaranteed)

### Partial Mitigations

- **Forward Secrecy:** Only send to trusted relays, request deletion after delivery
- **IP Leakage:** Use Tor or VPN when connecting to relays
- **Group Chat Limits:** For large groups (>100), use different messaging protocol

---

## Implementation Considerations

### Random Number Generation

**CRITICAL:** MUST use cryptographically secure random number generator (CSPRNG)

```javascript
// Good
const nonce = crypto.getRandomValues(new Uint8Array(32))

// Bad - DO NOT USE
const nonce = Math.random() // NOT CRYPTOGRAPHICALLY SECURE
```

### Ephemeral Keys

- Generate fresh ephemeral keypair for EACH message
- NEVER reuse ephemeral keys
- Discard ephemeral private keys after publishing (don't store)

### Timestamp Randomization

```javascript
// Random timestamp within ±2 days
function randomTimestamp() {
  const now = Math.floor(Date.now() / 1000)
  const twoDays = 2 * 24 * 60 * 60
  const random = Math.floor(Math.random() * twoDays) - (twoDays / 2)
  return now + random
}
```

### Chat Rooms

**Definition:** A chat room is defined by the set of `pubkey` + `p` tags

**Room Changes:**
- Adding a `p` tag = New room with clean history
- Removing a `p` tag = New room with clean history
- Changing `subject` = Same room, new topic

**Rendering:** Clients SHOULD render messages from the same room in continuous thread

### Subject Handling

- Subject is OPTIONAL
- Any member can change subject by sending new `subject` tag
- Don't send `subject` in every message
- Newest `subject` in room is current topic

---

## Trade-offs

### Advantages

| Feature | Benefit |
|---------|---------|
| Metadata Protection | Hides who talks to whom, when |
| Deniability | Leaked messages can be plausibly denied |
| Public Relay Compatible | Works on untrusted infrastructure |
| Multi-device Support | Sender gets copy for sync |
| Flexible | Supports DMs, group chats, file sharing |

### Disadvantages

| Limitation | Impact |
|------------|--------|
| Complexity | More difficult to implement correctly |
| Performance | 2x gift wraps per message (receiver + sender) |
| Decrypt Everything | Can't filter without decrypting all messages |
| No Forward Secrecy | Key compromise = all history leaked |
| Storage | Messages stay on relays indefinitely |

### Performance Considerations

**Encryption Cost:**
- 2x NIP-44 encryptions per message (seal + 2 gift wraps)
- 3x event creations and signatures

**Decryption Cost:**
- Must decrypt ALL Kind 1059 events addressed to you
- Can't filter by sender, subject, or content without decrypting

**Network Cost:**
- 2x events published per message (one to receiver, one to sender)
- Each gift wrap ~2-3x size of original message (due to nesting)

**Example:**
```
Original message: 100 bytes
Seal (Kind 13): ~250 bytes (encrypted + padding)
Gift wrap (Kind 1059): ~400 bytes (encrypted seal + metadata)
Total: 800 bytes for 2 gift wraps (2x 400 bytes)
Overhead: 8x original message size
```

---

## Use Cases for BitTasker

### Recommended Use Cases

#### 1. **Contracts (HIGHEST PRIORITY)**

**Why NIP-17:**
- Contains sensitive financial data (amounts, escrow IDs)
- Requires deniability for legal protection
- Needs metadata protection (parties, timing)

**Implementation:**
- Use Kind 14 for contract creation
- Tags: `['type', 'contract']`, `['escrow', escrowId]`, `['task', taskId]`
- Keep contract status updates in same conversation thread

#### 2. **Payment Confirmations**

**Why NIP-17:**
- Sensitive transaction data (hashes, amounts)
- Privacy needed for financial information

#### 3. **Dispute Communications**

**Why NIP-17:**
- Legal sensitivity requires deniability
- Privacy important during disputes

### NOT Recommended for NIP-17

#### 1. **Public Bids (Use Custom Event Kinds)**

**Why NOT:**
- Bids are semi-public (task creators need to see them)
- Filtering by task ID is important for UX
- Performance matters (many bids per task)

**Alternative:**
```javascript
// Use Kind 31000 (parameterized replaceable)
{
  kind: 31000,
  tags: [
    ['d', bidId],           // Unique ID
    ['t', taskId],          // Queryable!
    ['p', taskCreatorPubkey],
    ['status', 'pending']
  ],
  content: nip44.encrypt(bidDetails, taskCreatorPubkey)
}

// Query: filter = { kinds: [31000], '#t': [taskId] }
```

#### 2. **Task Notifications (Use Custom Events)**

**Why NOT:**
- Need to filter by task, status, etc.
- Performance critical for notifications
- Not highly sensitive

#### 3. **Normal User-to-User Chat (MAYBE)**

**Decision Factors:**
- If users expect maximum privacy → Use NIP-17
- If performance/UX more important → Use Kind 4 with NIP-44
- Consider hybrid: Let users choose per conversation

---

## Migration Strategy

### Phase 1: Documentation (Current)

- ✅ Document NIP-17 completely
- ✅ Understand trade-offs
- ✅ Identify use cases

### Phase 2: Incremental Implementation (Future)

#### 2.1 Keep Current System (Kind 4 + NIP-44)

**For:**
- Regular DMs
- Bid submissions
- Task notifications

**Advantages:**
- Already working
- Good performance
- Can filter by tags

#### 2.2 Implement NIP-17 for Contracts Only

**Timeline:** After current features stable

**Steps:**
1. Create `nip17.ts` utility module
2. Implement seal/gift wrap functions
3. Add Kind 14 contract message type
4. Test thoroughly with test vectors
5. Deploy for contracts only

#### 2.3 Gradual Expansion

**Later considerations:**
- Offer NIP-17 as opt-in for sensitive DMs
- Monitor performance impact
- Gather user feedback

### Phase 3: Optimization

**After NIP-17 is stable:**
- Implement message batching
- Optimize decryption (Web Workers)
- Add local caching of decrypted messages
- Consider relay selection strategy

---

## Implementation Checklist

When implementing NIP-17, ensure:

### Encryption
- [ ] Use CSPRNG for nonces and ephemeral keys
- [ ] Generate fresh ephemeral keypair per message
- [ ] Randomize timestamps (±2 days)
- [ ] Create unsigned Kind 14 message
- [ ] Seal with Kind 13 (unsigned)
- [ ] Gift wrap with Kind 1059 (signed with ephemeral key)
- [ ] Create gift wrap for sender (multi-device support)
- [ ] Publish both gift wraps

### Decryption
- [ ] Query Kind 1059 events with `#p` filter
- [ ] Try decrypting with user's private key
- [ ] Handle decryption failures gracefully
- [ ] Verify sender pubkey matches seal pubkey
- [ ] Extract chat message (Kind 14/15)
- [ ] Validate message structure
- [ ] Display with proper sender attribution

### Security
- [ ] Never reuse ephemeral keys
- [ ] Never sign Kind 13 or Kind 14 events
- [ ] Validate all events before decrypting
- [ ] Use constant-time comparison for MACs
- [ ] Clear sensitive data from memory when done
- [ ] Validate timestamp is reasonable (within ±2 days)

### Performance
- [ ] Cache decrypted messages locally
- [ ] Batch decrypt multiple messages
- [ ] Use Web Workers for decryption (if browser)
- [ ] Implement pagination for message history
- [ ] Add loading states for decryption
- [ ] Handle large message volumes gracefully

### UX
- [ ] Show "decrypting..." indicator
- [ ] Handle failed decryptions gracefully
- [ ] Display sender correctly after verification
- [ ] Support conversation threading (via `e` tags)
- [ ] Handle subject changes in rooms
- [ ] Support file messages (Kind 15)

---

## References

### Official Specifications

1. **NIP-17 (Private Direct Messages)**
   - https://github.com/nostr-protocol/nips/blob/master/17.md

2. **NIP-44 (Encrypted Payloads)**
   - https://github.com/nostr-protocol/nips/blob/master/44.md
   - Implementation: https://github.com/paulmillr/nip44
   - Audit Report: https://cure53.de/audit-report_nip44-implementations.pdf

3. **NIP-59 (Gift Wrapping)**
   - https://github.com/nostr-protocol/nips/blob/master/59.md

4. **NIP-01 (Basic Events)**
   - https://github.com/nostr-protocol/nips/blob/master/01.md

5. **NIP-21 (Event References)**
   - https://github.com/nostr-protocol/nips/blob/master/21.md

6. **NIP-25 (Reactions)**
   - https://github.com/nostr-protocol/nips/blob/master/25.md

### Related Reading

- **NIP-04 (Deprecated DMs):** https://github.com/nostr-protocol/nips/blob/master/04.md
- **Security Analysis:** https://github.com/nostr-protocol/nips/issues/107
- **ChaCha20-Poly1305:** https://datatracker.ietf.org/doc/rfc8439/

### Implementation Examples

- **JavaScript:** https://github.com/paulmillr/nip44 (reference implementation)
- **Test Vectors:** https://github.com/paulmillr/nip44/blob/main/nip44.vectors.json

---

## Conclusion

NIP-17 provides **strong metadata protection** for private messaging on Nostr, but comes with **complexity and performance trade-offs**. For BitTasker:

1. **Implement NIP-17 for contracts** where privacy is critical
2. **Keep Kind 4 + NIP-44 for bids/DMs** where performance matters
3. **Use custom event kinds** for queryable data (task notifications, public bids)

This hybrid approach balances security, performance, and user experience while maintaining compatibility with the Nostr ecosystem.

---

**Document Version:** 1.0  
**Last Updated:** 2024-01-19  
**Status:** Draft for Future Implementation


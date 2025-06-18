# NIP-44 Messaging Migration Plan

## Overview

This document outlines the plan to migrate the existing Nostr messaging system from NIP-04 to NIP-44 encryption, implementing enhanced messaging features including conversation management, infinite scrolling, and real-time messaging.

## Current Implementation Analysis

### ✅ **Existing Assets**

- **NIP-44 Implementation**: Complete implementation available in `src/lib/nostr/nip44.ts`
- **Messaging UI Components**:
  - `ChatView.svelte` - Full chat interface with pagination
  - `ChatMessage.svelte` - Individual message display
  - Messages page with conversation list
- **Core Infrastructure**:
  - Real-time message listening with `listenForIncomingMessages()`
  - Profile fetching with `fetchProfileMetadata()`
  - Conversation management with `getMessagedPeople()`
  - Key management with `getNostrKeyPair()` and `getNpub()`
- **UI Features**:
  - Infinite scrolling for message history (50 messages per chunk)
  - Real-time message updates
  - Draft persistence
  - Modal for starting new conversations
  - URL deep linking with `?chatWith=<npub>` parameter

### ⚠️ **Migration Requirements**

- Replace NIP-04 encryption with NIP-44 in all message operations
- Continue using event kind 4 for NIP-44 messages
- Remove all NIP-04 dependencies and convert existing functionality to NIP-44
- Ensure all existing features continue to work seamlessly

## Implementation Plan

### Phase 1: Core NIP-44 Integration

#### 1.1 Create NIP-44 Message Utilities

**File**: `src/lib/utils/nip44-message.ts`

Create new utility functions that replace the existing NIP-04 implementation with NIP-44 encryption:

```typescript
// Core encryption/decryption functions
async function encryptDM(
	plaintext: string,
	recipientPubkey: string,
	senderPrivkey: string
): Promise<string>;
async function decryptDM(
	ciphertext: string,
	senderPubkey: string,
	recipientPrivkey: string
): Promise<string>;

// Event creation and parsing
async function createDMEvent(
	plaintext: string,
	recipientPubkey: string,
	threadRootId?: string
): Promise<NostrEvent>;
async function parseDMEvent(
	event: NostrEvent,
	currentUserPrivkey: string
): Promise<{ plaintext: string; senderPubkey: string }>;

// High-level API functions
export async function sendDirectMessage(
	message: string,
	recipientPubkey: string,
	threadRootId?: string
): Promise<void>;
export async function getMessageHistory(
	withPubkey: string,
	options?: MessageHistoryOptions
): Promise<DecryptedMessage[]>;
export function listenForIncomingMessages(callback: MessageCallback): () => void;
export async function getMessagedPeople(): Promise<Conversation[]>;
```

**Key Implementation Details**:

- Use event kind 4 for NIP-44 encrypted messages
- Implement proper nonce generation using `crypto.getRandomValues()`
- Use conversation key derivation as per NIP-44 specification

#### 1.2 Update Message Event Structure

**NIP-44 Message Event Schema**:

```json
{
	"kind": 4,
	"content": "<nip44_encrypted_payload>",
	"tags": [
		["p", "<recipient_pubkey>"],
		["e", "<thread_root_id>", "", "root"] // Optional for threaded messages
	],
	"created_at": 1234567890,
	"pubkey": "<sender_pubkey>",
	"id": "<event_id>",
	"sig": "<signature>"
}
```

**Content Format**:

- **NIP-44**: Base64-encoded payload with version byte (0x02) + nonce + ChaCha20-Poly1305 encrypted content + HMAC

#### 1.3 Profile Caching Management

**File**: `src/lib/utils/profile-cache.ts`

Implement profile caching for names and pictures only:

```typescript
interface ProfileCache {
	[pubkey: string]: {
		data: { name?: string; picture?: string };
		timestamp: number;
		expiresAt: number;
	};
}

export class ProfileManager {
	private cache: ProfileCache = {};
	private readonly CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

	async getProfile(pubkey: string): Promise<{ name?: string; picture?: string }>;
	private isCacheValid(pubkey: string): boolean;
	private cleanupExpiredProfiles(): void;
}
```

### Phase 2: Replace Existing NIP-04 Implementation

#### 2.1 Update Core Message Utilities

**File**: `src/lib/utils/nostr-message.ts` (Complete Replacement)

Replace all NIP-04 functionality with NIP-44:

```typescript
// Remove nip04 import, add nip44 import
import nip44 from '$lib/nostr/nip44';

// Replace encryptDM function
async function encryptDM(
	plaintext: string,
	recipientPubkey: string,
	senderPrivkey: string
): Promise<string> {
	// Generate 32-byte nonce
	const nonce = crypto.getRandomValues(new Uint8Array(32));

	// Get conversation key
	const conversationKey = await nip44.getConversationKey(senderPrivkey, recipientPubkey);

	// Encrypt with NIP-44
	return nip44.encrypt(plaintext, conversationKey, nonce);
}

// Replace decryptDM function
async function decryptDM(
	ciphertext: string,
	senderPubkey: string,
	recipientPrivkey: string
): Promise<string> {
	// Get conversation key
	const conversationKey = await nip44.getConversationKey(recipientPrivkey, senderPubkey);

	// Decrypt with NIP-44
	return nip44.decrypt(ciphertext, conversationKey);
}
```

#### 2.2 Update Message Components

**File**: `src/lib/components/messages/ChatMessage.svelte` (Enhanced)

No changes needed for basic functionality, but add optional enhancement indicators:

```svelte
<script lang="ts">
	// Same existing props
	let { message, isSender, profile } = $props();
</script>

<!-- Existing message display with same styling -->
<!-- Message displays remain unchanged -->
```

**File**: `src/lib/components/messages/ChatView.svelte` (Updated)

Replace NIP-04 calls with NIP-44:

```typescript
// All existing functionality remains the same
// Only the underlying encryption changes from NIP-04 to NIP-44
// sendDirectMessage() will now use NIP-44 encryption
// getMessageHistory() will now decrypt using NIP-44
```

### Phase 3: Enhanced Features Implementation

#### 3.1 Advanced Conversation Management

**File**: `src/lib/utils/conversation-manager.ts`

Implement conversation metadata management without message caching:

```typescript
export interface ConversationMetadata {
	pubkey: string;
	lastEvent: NostrEvent;
	lastMessage: string;
	lastMessageTime: number;
	profile: ProfileData;
}

export class ConversationManager {
	async getConversations(options?: {
		limit?: number;
		offset?: number;
	}): Promise<ConversationMetadata[]>;

	// Simple conversation operations without complex state
	async refreshConversation(pubkey: string): Promise<ConversationMetadata>;
}
```

#### 3.2 Enhanced Message List UI

**File**: `src/routes/(protected)/dashboard/messages/+page.svelte` (Enhanced)

Add conversation search without complex caching:

```svelte
<script lang="ts">
	// Enhanced conversation features
	let searchQuery = $state('');
	let filteredConversations = $derived(
		conversations.filter(
			(c) =>
				c.profile.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
				c.pubkey.includes(searchQuery)
		)
	);
</script>

<!-- Enhanced conversation list with search -->
<div class="mb-4">
	<input
		type="text"
		placeholder="Search conversations..."
		class="input input-bordered w-full"
		bind:value={searchQuery}
	/>
</div>
```

### Phase 4: Real-time Enhancements (Future Enhancement)

#### 4.1 Basic Real-time Features (If Easy to Implement)

**File**: `src/lib/utils/realtime-manager.ts`

Simple real-time enhancements without complex state management:

```typescript
export class RealtimeManager {
	// Only implement if straightforward
	async sendTypingIndicator(recipientPubkey: string): Promise<void>;
	async sendReadReceipt(messageId: string): Promise<void>;

	// Complex features marked for future implementation:
	// - Presence management
	// - Complex typing indicators
	// - Advanced real-time state sync
}
```

### Phase 5: Performance Optimizations

#### 5.1 Profile Caching Only

**File**: `src/lib/utils/profile-cache.ts`

```typescript
export class ProfileCache {
	private cache = new Map<string, ProfileCacheEntry>();
	private readonly MAX_CACHE_SIZE = 100; // profiles
	private readonly CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

	async getProfile(pubkey: string): Promise<ProfileData>;
	async cacheProfile(pubkey: string, profile: ProfileData): Promise<void>;
	private cleanupStaleEntries(): void;
}
```

### Phase 6: Testing & Polish

#### 6.1 Unit Testing

**Focus Areas:**

- NIP-44 encryption/decryption functionality
- Message parsing and creation
- Profile caching system
- UI component rendering

**File Structure for Tests:**

```
src/lib/tests/
├── nip44-message.test.ts
├── profile-cache.test.ts
├── conversation-manager.test.ts
└── components/
    ├── ChatMessage.test.ts
    └── ChatView.test.ts
```

## Technical Specifications

### Message Throughput

- **Target**: 100 messages/second per conversation
- **Pagination**: 50 messages per page
- **Real-time latency**: <500ms message delivery

### Security Requirements

- **Encryption**: NIP-44 v2 with ChaCha20-Poly1305
- **Message Integrity**: HMAC verification for all messages
- **Key Management**: Per-conversation key derivation

### Performance Targets

- **Initial Load**: <2s for conversation list
- **Message History**: <1s for 50 messages
- **Memory Usage**: <20MB for 10 active conversations (no message caching)

## File Structure Summary

```
src/lib/
├── nostr/
│   ├── nip44.ts (✅ existing)
│   └── events.ts (enhanced)
├── utils/
│   ├── profile-cache.ts (new)
│   ├── conversation-manager.ts (new)
│   ├── realtime-manager.ts (new - future)
│   └── nostr-message.ts (complete NIP-44 replacement)
├── components/messages/
│   ├── ChatView.svelte (updated)
│   ├── ChatMessage.svelte (minimal changes)
│   └── ConversationList.svelte (enhanced)
└── tests/
    ├── nip44-message.test.ts (new)
    ├── profile-cache.test.ts (new)
    └── components/ (updated)

requirements/
└── nip44-messaging-migration-plan.md (this file)
```

## Implementation Phases Summary

1. **Phase 1**: Core NIP-44 integration and utilities
2. **Phase 2**: Replace all NIP-04 with NIP-44
3. **Phase 3**: Enhanced conversation management
4. **Phase 4**: Basic real-time features (if simple)
5. **Phase 5**: Profile caching optimization
6. **Phase 6**: Unit testing and polish

## Success Metrics

### Technical Metrics

- 99.9% message delivery success rate
- <1% encryption/decryption error rate
- <500ms average message latency
- Zero data loss during migration

### User Experience Metrics

- All existing functionality working with NIP-44
- Improved security with ChaCha20-Poly1305 encryption
- Smooth conversation management
- Responsive UI with profile caching

## Conclusion

This simplified plan provides a structured approach to migrating from NIP-04 to NIP-44 while maintaining all existing functionality. The implementation focuses on core security improvements and essential features, with advanced real-time capabilities marked for future enhancement if they prove straightforward to implement.

The approach eliminates complex caching systems and backward compatibility concerns, focusing on a clean NIP-44-only implementation that provides immediate security benefits while maintaining the existing user experience.

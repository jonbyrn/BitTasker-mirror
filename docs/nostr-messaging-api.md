# Nostr Messaging API Documentation

## Overview

The Nostr messaging system provides end-to-end encrypted direct messaging capabilities using the Nostr protocol (NIP-04). This document covers the API functions, component usage, and integration patterns.

## Core API Functions

### Message Operations

#### `sendDirectMessage(message, recipientPubkey, threadRootId?)`

Sends an encrypted direct message to a recipient.

```typescript
import { sendDirectMessage } from '$lib/utils/nostr-message';

// Send a simple message
await sendDirectMessage('Hello!', 'recipient-pubkey-hex');

// Send a threaded message
await sendDirectMessage('Reply message', 'recipient-pubkey-hex', 'thread-root-event-id');
```

**Parameters:**

- `message` (string): The plaintext message content
- `recipientPubkey` (string): Recipient's public key in hex format
- `threadRootId` (string, optional): Root event ID for threaded conversations

**Returns:** `Promise<void>`

**Throws:** Error if encryption fails or message cannot be published

#### `getMessageHistory(withPubkey, options?)`

Retrieves message history with a specific user.

```typescript
import { getMessageHistory } from '$lib/utils/nostr-message';

// Get recent messages
const messages = await getMessageHistory('user-pubkey-hex');

// Get paginated messages
const olderMessages = await getMessageHistory('user-pubkey-hex', {
	limit: 50,
	until: lastMessageTimestamp
});
```

**Parameters:**

- `withPubkey` (string): Public key of the conversation partner
- `options` (object, optional):
  - `limit` (number): Maximum number of messages to retrieve (default: 50)
  - `since` (number): Unix timestamp to get messages after
  - `until` (number): Unix timestamp to get messages before

**Returns:** `Promise<DecryptedMessage[]>`

#### `getMessagedPeople()`

Gets a list of all users the current user has exchanged messages with.

```typescript
import { getMessagedPeople } from '$lib/utils/nostr-message';

const conversations = await getMessagedPeople();
// Returns array of { pubkey, lastEvent, profile }
```

**Returns:** `Promise<Conversation[]>`

#### `listenForIncomingMessages(callback)`

Sets up real-time listening for incoming messages.

```typescript
import { listenForIncomingMessages } from '$lib/utils/nostr-message';

const unsubscribe = listenForIncomingMessages((message) => {
	console.log('New message:', message.plaintext);
	console.log('From:', message.senderPubkey);
});

// Clean up when done
unsubscribe();
```

**Parameters:**

- `callback` (function): Called when new messages arrive

**Returns:** Function to unsubscribe from updates

### Profile Operations

#### `fetchProfileMetadata(pubkey)`

Fetches profile information for a given public key.

```typescript
import { fetchProfileMetadata } from '$lib/utils/nostr-message';

const profile = await fetchProfileMetadata('user-pubkey-hex');
// Returns { name?, picture? }
```

**Parameters:**

- `pubkey` (string): Public key in hex or npub format

**Returns:** `Promise<Profile>`

## Component API

### ChatMessage Component

Displays individual messages in a conversation.

```svelte
<script>
	import ChatMessage from '$lib/components/messages/ChatMessage.svelte';
</script>

<ChatMessage
	message={messageObject}
	isSender={currentUserPubkey === message.senderPubkey}
	profile={senderProfile}
/>
```

**Props:**

- `message` (DecryptedMessage): Message object with plaintext, senderPubkey, and event
- `isSender` (boolean): Whether the current user sent this message
- `profile` (Profile): Sender's profile information

### ChatView Component

Complete chat interface for conversations.

```svelte
<script>
	import ChatView from '$lib/components/messages/ChatView.svelte';
</script>

<ChatView
	recipientPubkey={selectedUserPubkey}
	currentUserPubkey={currentUserNpub}
	initialProfile={recipientProfile}
/>
```

**Props:**

- `recipientPubkey` (string): Public key of conversation partner
- `currentUserPubkey` (string): Current user's public key (npub format)
- `initialProfile` (Profile, optional): Cached profile data

## Integration Patterns

### Adding Message Buttons to Other Features

#### Task/Bid Integration

```svelte
<!-- In task or bid component -->
<script>
	import { goto } from '$app/navigation';

	function messageUser(userPubkey) {
		goto(`/dashboard/messages?chatWith=${userPubkey}`);
	}
</script>

<button onclick={() => messageUser(bid.userPubkey)} class="btn btn-outline">
	Message Bidder
</button>
```

#### Profile Integration

```svelte
<!-- In user profile component -->
<script>
	import { nip19 } from 'nostr-tools';

	function startChat() {
		const npub = nip19.npubEncode(user.pubkey);
		goto(`/dashboard/messages?chatWith=${npub}`);
	}
</script>

<button onclick={startChat} class="btn btn-primary"> Send Message </button>
```

### URL Deep Linking

The messaging system supports direct chat links:

```
/dashboard/messages?chatWith=npub1abc123...
/dashboard/messages?chatWith=hexPubkeyString
```

### Real-time Updates

```typescript
// Set up global message listener for notifications
import { listenForIncomingMessages } from '$lib/utils/nostr-message';

let messageListener: (() => void) | null = null;

function setupGlobalMessageListener() {
	messageListener = listenForIncomingMessages((message) => {
		// Show notification
		showNotification(`New message from ${message.senderPubkey}`);

		// Update UI state
		updateConversationList();
	});
}

// Clean up on app shutdown
onDestroy(() => {
	if (messageListener) {
		messageListener();
	}
});
```

## Error Handling

### Common Error Scenarios

1. **Network Connection Issues**

```typescript
try {
	await sendDirectMessage('Hello', recipientPubkey);
} catch (error) {
	if (error.message.includes('Connection failed')) {
		// Handle network error
		showError('Unable to connect to Nostr relay. Please try again.');
	}
}
```

2. **Invalid Public Keys**

```typescript
try {
	const profile = await fetchProfileMetadata(pubkey);
} catch (error) {
	if (error.message.includes('Invalid')) {
		// Handle invalid pubkey format
		showError('Invalid user identifier');
	}
}
```

3. **Encryption Failures**

```typescript
try {
	await sendDirectMessage(message, recipientPubkey);
} catch (error) {
	if (error.message.includes('encrypt')) {
		// Handle encryption error
		showError('Unable to encrypt message. Please check your keys.');
	}
}
```

## Best Practices

### Performance Optimization

1. **Pagination**: Always use pagination for message history

```typescript
// Good: Paginated loading
const messages = await getMessageHistory(pubkey, { limit: 50 });

// Avoid: Loading all messages at once
const allMessages = await getMessageHistory(pubkey); // No limit
```

2. **Profile Caching**: Cache profile data to reduce API calls

```typescript
const profileCache = new Map();

async function getCachedProfile(pubkey) {
	if (profileCache.has(pubkey)) {
		return profileCache.get(pubkey);
	}

	const profile = await fetchProfileMetadata(pubkey);
	profileCache.set(pubkey, profile);
	return profile;
}
```

3. **Connection Management**: Properly clean up subscriptions

```typescript
let unsubscribe: (() => void) | null = null;

onMount(() => {
	unsubscribe = listenForIncomingMessages(handleMessage);
});

onDestroy(() => {
	if (unsubscribe) {
		unsubscribe();
	}
});
```

### Security Considerations

1. **Key Management**: Never log or expose private keys
2. **Input Validation**: Validate all user inputs before processing
3. **Rate Limiting**: Implement client-side rate limiting for message sending
4. **Content Filtering**: Consider implementing content moderation

### User Experience

1. **Loading States**: Always show loading indicators
2. **Error Messages**: Provide clear, actionable error messages
3. **Offline Handling**: Handle network disconnections gracefully
4. **Draft Persistence**: Save message drafts automatically

## TypeScript Types

```typescript
interface DecryptedMessage {
	plaintext: string;
	senderPubkey: string;
	event: NostrEvent;
}

interface Profile {
	name?: string;
	picture?: string;
}

interface Conversation {
	pubkey: string;
	lastEvent: NostrEvent;
	profile: Profile;
}

interface MessageHistoryOptions {
	limit?: number;
	since?: number;
	until?: number;
}
```

## Testing

### Unit Testing

```typescript
import { fetchProfileMetadata } from '$lib/utils/nostr-message';
import { vi } from 'vitest';

// Mock the dependencies
vi.mock('nostr-tools/pool');

test('fetchProfileMetadata returns profile data', async () => {
	// Setup mocks
	const mockProfile = { name: 'Test User', picture: 'test.jpg' };

	// Test the function
	const result = await fetchProfileMetadata('test-pubkey');

	expect(result).toEqual(mockProfile);
});
```

### Component Testing

```typescript
import { render, screen } from '@testing-library/svelte';
import ChatMessage from '$lib/components/messages/ChatMessage.svelte';

test('renders message content', () => {
	const message = {
		plaintext: 'Test message',
		senderPubkey: 'test-sender',
		event: mockEvent
	};

	render(ChatMessage, {
		message,
		isSender: false,
		profile: { name: 'Test User' }
	});

	expect(screen.getByText('Test message')).toBeDefined();
});
```

## Migration Guide

### Upgrading from Previous Versions

If migrating from a previous messaging implementation:

1. **Update Imports**: Change import paths to new utility functions
2. **Component Props**: Update component props to match new API
3. **Event Handling**: Migrate to new real-time subscription pattern
4. **Error Handling**: Update error handling to use new error types

### Breaking Changes

- Real-time subscriptions now return unsubscribe functions
- Profile fetching is now asynchronous
- Message history pagination is now required for large conversations

## Support and Troubleshooting

### Common Issues

1. **Messages not appearing**: Check relay connection and subscription setup
2. **Encryption errors**: Verify key pair generation and storage
3. **Profile not loading**: Check network connectivity and pubkey format
4. **Performance issues**: Implement pagination and caching

For additional support, refer to the Nostr protocol documentation and NIP-04 specification.

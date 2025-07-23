# Nostr Tools Documentation

## Table of Contents
1. [Core Concepts](#core-concepts)
   - [Event Structure](#event-structure)
   - [Event Kinds](#event-kinds)
   - [Event Tags](#event-tags)
2. [Basic Operations](#basic-operations)
   - [Event Creation and Signing](#event-creation-and-signing)
   - [Event Updates and Deletion](#event-updates-and-deletion)
3. [SimplePool API](#simplepool-api)
   - [Core Methods](#core-methods)
   - [Query vs Subscribe](#query-vs-subscribe)
   - [Error Handling](#error-handling)
4. [Advanced Features](#advanced-features)
   - [Event Filtering](#event-filtering)
   - [NIPs Support](#nips-support)
   - [Best Practices](#best-practices)

## Core Concepts

### Event Structure

```typescript
interface Event {
	id: string; // Event ID (32-bytes lowercase hex) - computed from event data
	pubkey: string; // Publisher's public key (32-bytes lowercase hex)
	created_at: number; // Unix timestamp in seconds
	kind: number; // Event kind (0 = metadata, 1 = text note, etc.)
	tags: string[][]; // Array of tags
	content: string; // Event content (can be encrypted for DMs)
	sig: string; // Event signature (64-bytes lowercase hex) - computed using private key
}
```

### Event Kinds

#### Kind Ranges

- **Regular Events (0-9999)**

  - Core protocol events
  - Permanent, non-replaceable events
  - Example: kind 0 for metadata, kind 1 for text notes

- **Replaceable Events (10000-19999)**

  - Single-instance replaceable events
  - Latest event replaces all previous ones
  - Used for user preferences and settings

- **Ephemeral Events (20000-29999)**

  - Short-lived events
  - Not meant to be stored long-term
  - Used for temporary or real-time data

- **Parameterized Replaceable Events (30000-39999)**
  - Multi-instance replaceable events
  - Latest event replaces previous ones with same parameters
  - Used for user-specific data sets

#### Common Event Kinds

- Basic Events (0-9):

  - `0`: Metadata (Profile)
  - `1`: Text Note
  - `2`: Recommend Relay
  - `3`: Contacts
  - `4`: Encrypted Direct Messages
  - `5`: Event Deletion
  - `6`: Repost
  - `7`: Reaction

- Channel Events (40-44):

  - `40`: Channel Creation
  - `41`: Channel Metadata
  - `42`: Channel Message
  - `43`: Channel Hide Message
  - `44`: Channel Mute User

- Special Purpose (1000+):

  - `1040`: OpenTimestamps
  - `1063`: File Metadata
  - `1311`: Live Chat Message
  - `1984`: Report/Reporting
  - `1985`: Label

- Zap Related:

  - `9734`: Zap Request
  - `9735`: Zap

- Lists and Preferences (10000+):

  - `10000`: Mutelist
  - `10001`: Pinlist
  - `10002`: Relay List
  - `10003`: Bookmark List

- Parameterized Events (30000+):
  - `30000`: Followsets
  - `30001`: Genericlists
  - `30023`: Long Form Article
  - `30078`: Application
  - `30402`: Classified Listing

The `id` and `sig` fields are automatically computed when you call `finalizeEvent`:

1. **Event ID Generation**

   - The `id` is a SHA256 hash of the canonical event serialization
   - Generated automatically by `finalizeEvent`
   - Format: 32-bytes lowercase hex string

2. **Event Signature**
   - The `sig` is a Schnorr signature of the event ID
   - Generated automatically by `finalizeEvent` using the private key
   - Format: 64-bytes lowercase hex string

Example:

```typescript
import { generateSecretKey, getPublicKey, finalizeEvent } from 'nostr-tools/pure';

// Generate keys
const privateKey = generateSecretKey();
const pubkey = getPublicKey(privateKey);

// Create event template
const eventTemplate = {
	kind: 1,
	created_at: Math.floor(Date.now() / 1000),
	tags: [],
	content: 'Hello, Nostr!',
	pubkey
};

// Finalize event (computes id and sig)
const signedEvent = finalizeEvent(eventTemplate, privateKey);
console.log(signedEvent.id); // e.g., "d7dd5eb3ab747e16f8d0212d53032ea2a7cadef53837e5a6c66d005fb98b5baf"
console.log(signedEvent.sig); // e.g., "79e85af3cd6c43324975466d32f91f291e10af0dcba53c0985aa8a9bfad40b789abc78f2d08c4b2d85f5cacfb57ed227e9f8a8c24513882a9bd82d4cfe910c1"
```

### Event Tags

Tags provide metadata and create relationships between events, users, and other entities.

#### Tag Structure

```typescript
tags: [
	[tagName, ...values]
	// More tags...
];
```

Where:

- `tagName`: A single letter or word identifying the tag type
- `values`: One or more values associated with the tag

#### Common Tag Types

1. **"e" - Event Reference**

   ```typescript
   ["e", eventId, relayURL?, marker?, eventAuthor?]
   ```

   - Used to reference other events
   - Markers can be: "reply", "root", "mention"
   - Example: `["e", "1234...", "wss://relay.example.com", "reply"]`

2. **"p" - Profile Reference**

   ```typescript
   ["p", pubkey, relayURL?]
   ```

   - References a user's public key
   - Example: `["p", "abcd...", "wss://relay.example.com"]`

3. **"d" - Identifier Tag**

   ```typescript
   ['d', identifier];
   ```

   - Used in parameterized replaceable events
   - Example: `["d", "my-custom-identifier"]`

4. **Content-specific Tags**

   - `["title", "My Title"]`
   - `["summary", "A brief summary"]`
   - `["published_at", "1234567890"]`

5. **Media-related Tags** (NIP-94)

   ```typescript
   [
   	['url', fileUrl],
   	['m', mimeType],
   	['x', sha256Hash],
   	['size', fileSize],
   	['dim', dimensions],
   	['blurhash', hash],
   	['thumb', thumbnailUrl],
   	['alt', altText]
   ];
   ```

6. **Zap-related Tags** (NIP-57)
   ```typescript
   [
   	['amount', '1000'],
   	['relays', 'wss://relay1.com', 'wss://relay2.com'],
   	['lnurl', 'lightning-url']
   ];
   ```

#### Tag Usage Examples

1. **Creating a Reply**

```typescript
const replyEvent = {
	kind: 1,
	tags: [
		['e', originalEventId, relayUrl, 'reply'], // Reference to replied event
		['p', originalAuthorPubkey] // Reference to original author
	],
	content: 'This is a reply'
	// ... other event fields
};
```

2. **File Metadata**

```typescript
const fileEvent = {
	kind: 1063,
	tags: [
		['url', 'https://example.com/file.jpg'],
		['m', 'image/jpeg'],
		['size', '123456'],
		['dim', '1920x1080'],
		['alt', 'A beautiful sunset']
	]
	// ... other event fields
};
```

3. **Classified Listing** (NIP-99)

```typescript
const listingEvent = {
	kind: 30402,
	tags: [
		['d', 'unique-listing-id'],
		['title', 'Item for Sale'],
		['summary', 'Brief description'],
		['location', 'New York'],
		['published_at', '1234567890'],
		['price', '100', 'USD']
	]
	// ... other event fields
};
```

### Event Deletion (NIP-09)

Event deletion in Nostr is handled through kind 5 events. These are deletion requests rather than actual deletions, as the decentralized nature of Nostr means events cannot be truly deleted from all relays.

#### Deletion Event Structure

```typescript
const deletionEvent = {
	kind: 5,
	created_at: number,
	tags: [
		['e', eventIdToDelete], // Event reference to delete
		['k', eventKindToDelete] // Optional: kind of event being deleted
	],
	content: string // Optional reason for deletion
	// ... other event fields
};
```

#### Key Points About Deletion

1. **Request Nature**: Deletion events are requests, not commands. Relays and clients may choose whether to honor them.
2. **Validation**: Only the original event author can delete their events. Clients must verify the deletion event's pubkey matches the original event's pubkey.
3. **Multiple Events**: A single deletion event can reference multiple events to delete using multiple "e" tags.
4. **Parameterized Events**: For NIP-33 parameterized replaceable events, use the "a" tag to delete all versions:
   ```typescript
   ['a', '<kind>:<pubkey>:<d-identifier>'];
   ```

#### Example Usage

```typescript
// Create a deletion event
const deletionEvent = {
	kind: 5,
	created_at: Math.floor(Date.now() / 1000),
	tags: [
		['e', 'event_id_to_delete'],
		['k', '1'] // Indicating we're deleting a kind 1 event
	],
	content: 'Deleting this post',
	pubkey: myPubkey
};

// Sign and publish the deletion event
const signedDeletionEvent = await window.nostr.signEvent(deletionEvent);
await pool.publish(relays, signedDeletionEvent);
```

#### Client Implementation

When implementing deletion in a client:

1. Check for deletion events when fetching events:

   ```typescript
   // Subscribe to both the events and their potential deletion events
   pool.subscribeMany(relays, [
   	{ kinds: [1], limit: 50 }, // Original events
   	{ kinds: [5], '#e': [event.id] } // Deletion events
   ]);
   ```

2. Only display events that haven't been deleted:
   ```typescript
   // Verify deletion event author matches original event author
   if (deletionEvent.pubkey === originalEvent.pubkey) {
   	// Hide or mark the event as deleted
   	event.deleted = true;
   }
   ```

### Event Kinds

#### Regular Events (Stored by Relays)

- `0`: Metadata (Profile)
- `1`: Text Note
- `2`: Recommend Relay
- `3`: Contacts
- `4`: Encrypted Direct Messages
- `5`: Event Deletion
- `6`: Repost
- `7`: Reaction
- `8`: Badge Award
- `13`: Seal
- `14`: Private Direct Message
- `16`: Generic Repost

#### Channel Events

- `40`: Channel Creation
- `41`: Channel Metadata
- `42`: Channel Message
- `43`: Channel Hide Message
- `44`: Channel Mute User

#### Special Purpose Events

- `1040`: OpenTimestamps
- `1059`: Gift Wrap
- `1063`: File Metadata
- `1311`: Live Chat Message
- `1971`: Problem Tracker
- `1984`: Report/Reporting
- `1985`: Label

#### Community and Job Events

- `4550`: Community Post Approval
- `5999`: Job Request
- `6999`: Job Result
- `7000`: Job Feedback

#### Zap and Financial Events

- `9041`: Zap Goal
- `9734`: Zap Request
- `9735`: Zap
- `9802`: Highlights

#### Lists and Preferences

- `10000`: Mutelist
- `10001`: Pinlist
- `10002`: Relay List
- `10003`: Bookmark List
- `10004`: Communities List
- `10005`: Public Chats List
- `10006`: Blocked Relays List
- `10007`: Search Relays List
- `10015`: Interests List
- `10030`: User Emoji List
- `10050`: Direct Message Relays List
- `10096`: File Server Preference

#### Lightning and Wallet Integration

- `13194`: NWC Wallet Info
- `21000`: Lightning PubRPC
- `22242`: Client Auth
- `23194`: NWC Wallet Request
- `23195`: NWC Wallet Response
- `24133`: Nostr Connect
- `27235`: HTTP Auth

#### Parameterized Replaceable Events (30000-34550)

- `30000`: Followsets
- `30001`: Genericlists
- `30002`: Relaysets
- `30003`: Bookmarksets
- `30004`: Curationsets
- `30008`: Profile Badges
- `30009`: Badge Definition
- `30015`: Interestsets
- `30017`: Create/Update Stall
- `30018`: Create/Update Product
- `30023`: Long Form Article
- `30024`: Draft Long
- `30030`: Emojisets
- `30078`: Application
- `30311`: Live Event
- `30315`: User Statuses
- `30402`: Classified Listing
- `30403`: Draft Classified Listing
- `31922`: Date
- `31923`: Time
- `31924`: Calendar
- `31925`: Calendar Event RSVP
- `31989`: Handler Recommendation
- `31990`: Handler Information
- `34550`: Community Definition

### Core Functions

#### Event Creation and Signing

```typescript
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { finalizeEvent, validateEvent } from 'nostr-tools/pure';

// Create an event
const privateKey = generateSecretKey();
const pubkey = getPublicKey(privateKey);

const event = {
	kind: 0,
	created_at: Math.floor(Date.now() / 1000),
	tags: [],
	content: JSON.stringify({
		name: 'username',
		about: 'description',
		picture: 'url'
	}),
	pubkey
};

// Sign the event
const signedEvent = finalizeEvent(event, privateKey);

// Validate the event
const isValid = validateEvent(signedEvent);
```

### Relay Management

#### SimplePool Usage

```typescript
import { SimplePool } from 'nostr-tools/pool';
import type { Event, Filter } from 'nostr-tools';

const pool = new SimplePool();

// Subscribe to events
const sub = pool.subscribe(
	['wss://relay.example.com'],
	{
		kinds: [0],
		authors: ['pubkey...']
	},
	{
		onevent: (event: Event) => {
			// Handle event
		}
	}
);

// Unsubscribe
sub.close();

// Publish events
const pubs = pool.publish(['wss://relay.example.com'], event);
await Promise.all(pubs);
```

### NIPs (Nostr Implementation Possibilities) Support

The library supports various NIPs including:

1. **NIP-01: Basic Protocol Flow**

   - Event creation and verification
   - Relay communication
   - Basic event types

2. **NIP-02: Contact List and Petnames**

   - Managing contact lists
   - Handling user metadata

3. **NIP-04: Encrypted Direct Messages**

   ```typescript
   import { encrypt, decrypt } from 'nostr-tools/nip04';

   // Encrypt message
   const encrypted = await encrypt(privateKey, recipientPubkey, 'secret message');

   // Decrypt message
   const decrypted = await decrypt(privateKey, senderPubkey, encrypted);
   ```

4. **NIP-05: DNS-based Verification**

   ```typescript
   import { nip05 } from 'nostr-tools';

   // Verify NIP-05 identifier
   const isValid = await nip05.queryProfile('username@domain.com');
   ```

5. **NIP-06: Key Generation**

   ```typescript
   import { generateSeedWords, privateKeyFromSeedWords } from 'nostr-tools/nip06';

   const mnemonic = generateSeedWords();
   const privateKey = privateKeyFromSeedWords(mnemonic);
   ```

6. **NIP-07: Browser Extension Integration**

   ```typescript
   // Check if extension is available
   if (window.nostr) {
   	const pubkey = await window.nostr.getPublicKey();
   	const signedEvent = await window.nostr.signEvent(event);
   }
   ```

7. **NIP-19: Bech32-Encoded Entities**

   ```typescript
   import { nip19 } from 'nostr-tools';

   // Encode
   const npub = nip19.npubEncode(pubkey);
   const note = nip19.noteEncode(eventId);

   // Decode
   const { type, data } = nip19.decode(npub);
   ```

8. **NIP-57: Lightning Zaps**

   ```typescript
   import { nip57 } from 'nostr-tools';

   // Create zap request
   const zapRequest = nip57.makeZapRequest({
   	profile: profileEvent,
   	event: targetEvent,
   	amount: 1000,
   	relays: ['wss://relay.example.com'],
   	comment: 'Great post!'
   });

   // Validate zap request
   const isValid = nip57.validateZapRequest(zapRequest);
   ```

### Advanced Features

#### Event Classification

```typescript
import {
	classifyKind,
	isRegularKind,
	isReplaceableKind,
	isEphemeralKind,
	isAddressableKind
} from 'nostr-tools/kinds';

// Check event type
const kind = 0;
console.log(classifyKind(kind)); // 'regular'
console.log(isRegularKind(kind)); // true
console.log(isReplaceableKind(kind)); // false
console.log(isEphemeralKind(kind)); // false
console.log(isAddressableKind(kind)); // false
```

#### Event References

```typescript
import { parseReferences } from 'nostr-tools';

// Parse references from event content
const references = parseReferences(event);
// Returns: { mentions: [], profiles: [], events: [] }
```

### Best Practices

1. **Event Creation**

   - Always validate events before publishing
   - Use appropriate event kinds for different content types
   - Include relevant tags for better discoverability
   - Follow tag format specifications

2. **Relay Management**

   - Use SimplePool for efficient relay connections
   - Handle connection errors gracefully
   - Close subscriptions when no longer needed
   - Use appropriate timeout values

3. **Security**

   - Never expose private keys
   - Validate all incoming events
   - Use encryption for sensitive data
   - Implement proper key management

4. **Performance**

   - Batch related operations when possible
   - Implement proper caching strategies
   - Use appropriate subscription filters
   - Clean up resources when not needed

5. **Tag Usage**
   - Always include required tags for specific event kinds
   - Use relay URLs in references when possible
   - Follow standard tag formats defined in NIPs
   - Include only relevant tags to keep event size minimal

### Error Handling

```typescript
try {
	const pubs = pool.publish(['wss://relay.example.com'], event);
	await Promise.all(pubs);
} catch (error) {
	if (error.message === 'Publish timeout') {
		// Handle timeout
	} else {
		// Handle other errors
	}
}
```

### Utility Functions

```typescript
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { nip19 } from 'nostr-tools';

// Generate keys
const privateKey = generateSecretKey();
const publicKey = getPublicKey(privateKey);

// NIP-19 Encodings
const npub = nip19.npubEncode(publicKey);
const nsec = nip19.nsecEncode(privateKey);
```

## Integration with BitTasker

### Profile Updates

For profile updates in BitTasker, we use kind 0 events with additional custom fields:

```typescript
interface BitTaskerProfile extends ProfileMetadata {
	professionalTitle?: string;
	additionalPictures?: string[];
	skills?: string[];
	portfolio?: {
		title: string;
		description: string;
		images: string[];
	}[];
	availability?: {
		schedule: string;
		timezone: string;
	};
	services?: {
		title: string;
		description: string;
		price: number;
	}[];
}
```

### Event Publishing Flow

1. Create event content
2. Sign event
3. Publish to relay
4. Handle response
5. Update UI

### Example Implementation

````typescript
import { SimplePool } from 'nostr-tools/pool';
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { finalizeEvent } from 'nostr-tools/pure';

export async function publishProfileUpdate(
	profile: BitTaskerProfile,
	privateKey: string
): Promise<void> {
	const pool = new SimplePool();
	const pubkey = getPublicKey(privateKey);

	const event = {
		kind: 0,
		created_at: Math.floor(Date.now() / 1000),
		tags: [],
		content: JSON.stringify(profile),
		pubkey
	};

	const signedEvent = finalizeEvent(event, privateKey);
	const pubs = pool.publish(['wss://relay.example.com'], signedEvent);
	await Promise.all(pubs);
}

### Image Handling

#### 1. Image Upload Process
1. **Upload to Media Server**
   - Images should first be uploaded to a secure media server
   - Server should support content type verification
   - Generate thumbnails and blurhash previews
   - Return secure URLs for the uploaded content

2. **Create Nostr Event**
   ```typescript
   const imageEvent = {
     kind: 1063, // Media metadata event
     tags: [
       ["url", imageUrl],
       ["m", "image/jpeg"],
       ["x", sha256Hash],
       ["size", fileSize],
       ["dim", dimensions],
       ["blurhash", hash],
       ["thumb", thumbnailUrl],
       ["alt", "picture"]
     ],
     content: "image update"
   };
````

3. **Link to Profile**
   ```typescript
   const event = {
   	kind: 0,
   	content: JSON.stringify({
   		name: 'User Name',
   		picture: imageUrl
   	}),
   	tags: [
   		['p', userPubkey],
   		['e', imageEventId, 'image']
   	]
   };
   ```

#### 2. Multiple Images

For handling multiple images:

1. **Create Separate Events**

   ```typescript
   const images = [
   	{ url: 'image1.jpg', alt: 'Main profile' },
   	{ url: 'image2.jpg', alt: 'Professional shot' },
   	{ url: 'image3.jpg', alt: 'Casual photo' }
   ];

   for (const img of images) {
   	const imageEvent = {
   		kind: 1063,
   		tags: [
   			['url', img.url],
   			['alt', img.alt]
   			// ... other metadata tags
   		]
   	};
   	// Publish event
   }
   ```

2. **Reference in Profile**
   ```typescript
   const profileEvent = {
   	kind: 0,
   	content: JSON.stringify({
   		name: 'User Name',
   		pictures: images.map((img) => img.url)
   	}),
   	tags: imageEvents.map((evt) => ['e', evt.id, 'image'])
   };
   ```

#### 3. Best Practices

1. **Image Optimization**

   - Compress images before upload
   - Generate multiple resolutions
   - Use WebP format when supported
   - Include blurhash for loading previews

2. **Security**

   - Verify file types server-side
   - Scan for malware
   - Use signed URLs with expiration
   - Implement rate limiting

3. **Performance**

   - Use CDN for image delivery
   - Cache image metadata events
   - Lazy load secondary images
   - Preload primary image

4. **Error Handling**

   ```typescript
   async function uploadImage(file) {
   	try {
   		// 1. Upload to media server
   		const upload = await uploadToServer(file);

   		// 2. Create image event
   		const imageEvent = {
   			kind: 1063,
   			tags: [
   				['url', upload.url]
   				// ... metadata tags
   			]
   		};
   		const signedImageEvent = await finalizeEvent(imageEvent, privateKey);

   		// 3. Update event
   		const event = {
   			kind: 0,
   			content: JSON.stringify({
   				picture: upload.url
   			}),
   			tags: [['e', signedImageEvent.id, 'image']]
   		};
   		const signedEvent = await finalizeEvent(event, privateKey);

   		// 4. Publish events
   		await pool.publish(relays, [signedImageEvent, signedEvent]);
   	} catch (err) {
   		if (err instanceof UploadError) {
   			// Handle upload failures
   		} else if (err instanceof NostrError) {
   			// Handle Nostr operation failures
   		} else {
   			// Handle unexpected errors
   		}
   	}
   }
   ```

## SimplePool API

The `SimplePool` class from nostr-tools (v2.13.0+) is used to interact with one or multiple relays. It provides a simplified interface for querying, subscribing to, and publishing events.

#### Query vs Subscribe: Understanding the Difference

SimplePool provides two main methods for fetching events: `querySync` and `subscribe`. Each serves a different purpose:

1. **querySync**

   ```typescript
   const events = await pool.querySync(relays, filter);
   ```

   - **Purpose**: One-time fetch of historical events
   - **Behavior**:
     - Returns a Promise that resolves with all matching events
     - Waits until all relays respond or timeout
     - Useful for initial data load
     - Good for fetching past events
   - **Use Cases**:
     - Loading initial state
     - Fetching historical data
     - One-time data retrieval
     - Synchronous operations

2. **subscribe**
   ```typescript
   const sub = pool.subscribe(relays, filter, {
   	onevent(event) {
   		/* handle event */
   	}
   });
   ```
   - **Purpose**: Real-time event monitoring
   - **Behavior**:
     - Maintains an open connection
     - Receives events as they happen
     - Continues until explicitly closed
     - Good for real-time updates
   - **Use Cases**:
     - Live updates
     - Real-time notifications
     - Continuous monitoring
     - Event streaming

#### Best Practice: Combining Both Methods

Often, the best approach is to use both methods together:

```typescript
async function setupEventHandling() {
	// 1. Load initial state
	const historicalEvents = await pool.querySync(relays, filter);
	processEvents(historicalEvents);

	// 2. Subscribe to future updates
	const sub = pool.subscribe(relays, filter, {
		onevent(event) {
			processEvent(event);
		}
	});

	return () => sub.close(); // Cleanup function
}
```

This pattern ensures:

- Immediate access to historical data
- Real-time updates for new events
- No missed events during initial load
- Efficient resource usage

#### Importing

```typescript
import { SimplePool } from 'nostr-tools/pool';
```

### Creating a Pool

```typescript
// Create a pool instance - no configuration options needed as of v2.13.0
const pool = new SimplePool();
```

### Methods

#### querySync(relays: string[], filter: Filter): Promise<Event[]>

Query for multiple events that match the filter. This is the preferred method for fetching events in v2.13.0+.

```typescript
const events = await pool.querySync(['wss://relay.example.com'], {
	authors: [pubkey],
	kinds: [0, 1063], // Kind 0 for metadata, 1063 for media metadata
	limit: 10
});
```

#### publish(relays: string[], event: Event): Promise<void>

Publish an event to multiple relays.

```typescript
await pool.publish(['wss://relay.example.com'], signedEvent);
```

#### subscribe(relays: string[], filter: Filter, options: SubscriptionOptions): Sub

Subscribe to events from multiple relays.

```typescript
const sub = pool.subscribe(
	['wss://relay.example.com'],
	{
		kinds: [1],
		authors: [pubkey]
	},
	{
		onevent(event) {
			console.log('got event:', event);
		}
	}
);
```

#### close(relays?: string[]): void

Close connections to specified relays or all relays if no argument is provided.

```typescript
// Close specific relays
pool.close(['wss://relay.example.com']);

// Close all relays
pool.close();
```

### Error Handling

It's recommended to wrap pool operations in try-catch blocks:

```typescript
try {
	const events = await pool.querySync(relays, filter);
	return events;
} catch (error) {
	console.error('Failed to fetch Nostr events:', error);
	return [];
}
```

### Node.js Usage

When using nostr-tools in Node.js, you need to provide a WebSocket implementation:

```typescript
import { useWebSocketImplementation } from 'nostr-tools/pool';
import WebSocket from 'ws';

useWebSocketImplementation(WebSocket);
```

### Filter Types

```typescript
interface Filter {
	ids?: string[];
	kinds?: number[];
	authors?: string[];
	since?: number;
	until?: number;
	limit?: number;
	search?: string;
	[key: `#${string}`]: string[] | undefined;
}
```

NOTE: Only the first tag is indexed in a tag array with multiple values

### Event Types

```typescript
interface Event {
	id: string;
	pubkey: string;
	created_at: number;
	kind: number;
	tags: string[][];
	content: string;
	sig: string;
}
```

### Best Practices

1. Always reuse the same SimplePool instance when possible
2. Close connections when they're no longer needed
3. Use appropriate filters to minimize unnecessary data transfer
4. Handle errors appropriately when interacting with relays
5. Consider using multiple relays for redundancy
6. Use appropriate timeouts for queries and subscriptions
7. Use querySync instead of deprecated list method for fetching events
8. Don't pass configuration options to SimplePool constructor (v2.13.0+)

### Event Updates in Nostr

Nostr is fundamentally an append-only protocol, which means events cannot be directly updated or deleted. However, there are several patterns for handling updates:

#### 1. Replaceable Events (NIPs 1 & 16)

Replaceable events are special event kinds (>= 10000 and <= 19999, or >= 30000 and <= 39999) that can be "replaced" by newer events. The replacement is determined by:

- Same author (pubkey)
- Same event kind
- Same 'd' tag value
- Higher created_at timestamp

Example of a replaceable event:

```typescript
const replaceableEvent = {
	kind: 30000, // Replaceable event kind
	created_at: Math.floor(Date.now() / 1000),
	tags: [
		['d', 'unique-identifier'] // Required for replaceable events
		// ... other tags
	],
	content: JSON.stringify(data)
};
```

#### 2. Parameterized Replaceable Events (NIP-33)

Similar to replaceable events, but with more flexible coordination using the 'd' tag:

```typescript
const parameterizedEvent = {
	kind: 31000, // Parameterized replaceable event
	created_at: Math.floor(Date.now() / 1000),
	tags: [
		['d', 'custom-identifier'] // Coordinates replacement
		// ... other tags
	],
	content: JSON.stringify(data)
};
```

#### 3. Event Deletion (NIP-09)

Events can be "deleted" by publishing a deletion event that references them:

```typescript
const deletionEvent = {
	kind: 5,
	created_at: Math.floor(Date.now() / 1000),
	tags: [
		['e', eventIdToDelete], // Reference to event being deleted
		['k', eventKindToDelete] // Optional: kind of deleted event
	],
	content: 'Deletion reason'
};
```

#### Best Practices for Updates

1. **Replaceable Events**

   - Use for profile metadata (kind: 0)
   - Use for lists and sets (kind: 30000+)
   - Always include a 'd' tag with a unique identifier
   - Ensure newer events have higher timestamps

2. **Event Deletion**

   - Use for removing sensitive or incorrect information
   - Include 'e' tags for all events being deleted
   - Optionally include 'k' tags to specify event kinds
   - Consider client-side handling of deletion events

3. **Update Patterns**
   - For profile data: Use kind 0 (replaceable by default)
   - For lists/sets: Use kind 30000+ with 'd' tags
   - For media/files: Use kind 30063 with 'd' tags
   - For ephemeral data: Use kind 20000+

Example Implementation for Profile Images:

```typescript
// Publishing profile images as a replaceable event
const profileImagesEvent = {
	kind: 30063, // Replaceable event for profile images
	created_at: Math.floor(Date.now() / 1000),
	tags: [
		['d', 'profile-images'], // Identifier for replacement
		['url', 'image1.jpg'],
		['url', 'image2.jpg']
		// ... other image metadata
	],
	content: JSON.stringify(images)
};

// Subscribing to profile image updates
const sub = pool.sub([relay], {
	kinds: [30063],
	authors: [pubkey],
	'#d': ['profile-images']
});

sub.on('event', (event) => {
	// Handle latest profile images
	const images = JSON.parse(event.content);
	updateUI(images);
});
```

#### Handling Event Updates in Clients

1. **Subscribing to Updates**

```typescript
// Subscribe to replaceable events
pool.subscribe(
	[relay],
	{
		kinds: [30000], // Replaceable event kind
		'#d': ['identifier'], // Specific identifier
		authors: [pubkey]
	},
	{
		onevent: (event) => {
			// Only process the latest event
			handleLatestEvent(event);
		}
	}
);
```

2. **Querying Latest State**

```typescript
// Get the latest state of a replaceable event
const events = await pool.querySync([relay], {
	kinds: [30000],
	'#d': ['identifier'],
	authors: [pubkey]
});

// Sort by timestamp and take the latest
const latest = events.sort((a, b) => b.created_at - a.created_at)[0];
```

3. **Handling Deletions**

```typescript
// Subscribe to deletion events
pool.subscribe(
	[relay],
	{
		kinds: [5], // Deletion events
		authors: [pubkey]
	},
	{
		onevent: (event) => {
			const deletedIds = event.tags.filter((tag) => tag[0] === 'e').map((tag) => tag[1]);
			handleDeletions(deletedIds);
		}
	}
);
```

### Event Kind Selection Guide

#### Understanding Event Kinds

Event kinds in Nostr serve different purposes based on their number ranges:

1. **Basic Events (0-9)**

   - Core protocol events
   - Example: kind 0 for metadata, kind 1 for notes
   - Permanent, non-replaceable events

2. **Regular Events (1000-9999)**

   - Application-specific data
   - Permanent, non-replaceable events
   - Used for immutable records and file metadata

3. **Replaceable Events (10000-19999)**

   - Single-instance replaceable events
   - Latest event replaces all previous ones
   - Used for user preferences and settings

4. **Ephemeral Events (20000-29999)**

   - Short-lived events
   - Not meant to be stored long-term
   - Used for temporary or real-time data

5. **Parameterized Replaceable Events (30000-39999)**
   - Multi-instance replaceable events
   - Latest event replaces previous ones with same parameters
   - Used for user-specific data sets

#### Choosing Event Kinds: Decision Framework

1. **Data Permanence**

   - Immutable data → Regular events (1000-9999)
   - Updatable data → Replaceable events (10000+ or 30000+)
   - Temporary data → Ephemeral events (20000-29999)

2. **Update Pattern**

   - Single latest version needed → Replaceable events (10000-19999)
   - Multiple instances with parameters → Parameterized replaceable (30000-39999)
   - Historical record needed → Regular events (1000-9999)

3. **Storage Requirements**
   - Long-term storage → Regular or replaceable events
   - Temporary storage → Ephemeral events
   - Version history needed → Regular events

#### Example: Skills and Certifications Implementation

Here's a real-world example of choosing event kinds:

1. **Skills List (Kind 30000)**

   ```typescript
   const skillsEvent = {
   	kind: 30000,
   	tags: [
   		['d', 'skills'],
   		['t', 'skill']
   	],
   	content: JSON.stringify(skills)
   };
   ```

   - Why Kind 30000?
     - Parameterized replaceable event
     - Only latest version matters
     - Single source of truth for current skills
     - No need for version history

2. **Certifications (Kind 1063)**
   ```typescript
   const certEvent = {
   	kind: 1063,
   	tags: [
   		['d', 'certifications'],
   		['t', 'certification'],
   		['skill', skillName]
   	],
   	content: JSON.stringify(certificationData)
   };
   ```
   - Why Kind 1063?
     - Regular event for file metadata
     - Certifications are immutable records
     - Historical record is important
     - Each certification is a separate verifiable document

#### Best Practices for Event Kind Selection

1. **Use Regular Events (1000-9999) When:**

   - Data needs to be immutable
   - Historical record is important
   - Each event is unique and permanent
   - Example: Certifications, achievements, transactions

2. **Use Replaceable Events (10000-19999) When:**

   - Only the latest version matters
   - Single instance per user needed
   - Previous versions can be discarded
   - Example: User preferences, profile settings

3. **Use Parameterized Replaceable Events (30000-39999) When:**

   - Multiple replaceable instances needed
   - Data is organized by parameters
   - Latest version per parameter matters
   - Example: Skills lists, custom lists, categorized data

4. **Use Ephemeral Events (20000-29999) When:**
   - Data is temporary
   - Real-time updates needed
   - Storage is not critical
   - Example: Online status, temporary notifications

#### Implementation Considerations

1. **Event Relationships**

   ```typescript
   // Link events using tags
   const event = {
   	tags: [
   		['e', relatedEventId], // Reference another event
   		['p', pubkey], // Reference a user
   		['d', identifier] // Parameter for replaceable events
   	]
   };
   ```

2. **Data Organization**

   ```typescript
   // Group related data in replaceable events
   const event = {
   	kind: 30000,
   	tags: [
   		['d', 'category'], // Parameter
   		['t', 'type'], // Type identifier
   		['version', '1.0'] // Optional metadata
   	]
   };
   ```

3. **Version Management**
   ```typescript
   // Handle updates appropriately
   const sub = pool.subscribe(relays, {
   	kinds: [30000], // Replaceable events
   	'#d': ['identifier'], // Specific parameter
   	authors: [pubkey] // Specific user
   });
   ```

### Advanced Filtering

#### Filter Structure

```typescript
interface Filter {
	ids?: string[]; // Event IDs
	kinds?: number[]; // Event kinds
	authors?: string[]; // Author public keys
	since?: number; // Events after timestamp
	until?: number; // Events before timestamp
	limit?: number; // Maximum number of events
	[key: `#${string}`]: string[]; // Tag filters
}
```

#### Tag Filtering Behavior

1. **Tag Value Indexing**

   - In Nostr events, tags are stored as arrays: `[tagName, value1, value2, ...]`
   - Only the first value after the tag name is indexed by relays
   - Example: `['c', 'design', 'writing']` - only 'design' is indexed

2. **Filter Matching Rules**

   - Tag filters use the format `#tagName: [value1, value2, ...]`
   - Values within a single tag filter are combined with OR logic
   - Different tag filters are combined with AND logic
   - Example: `{ '#c': ['design', 'writing'] }` matches events with EITHER 'design' OR 'writing'

3. **Advanced Search Strategies**
   - For searching non-indexed values:
     - Use client-side filtering with `matchFilter` function
     - Implement custom tag value extraction
     - Consider storing searchable values in separate indexed tags
   - For AND conditions:
     - Use multiple filters with `mergeFilters`
     - Implement client-side validation
     - Consider tag value normalization

#### Filter Functions

1. **matchFilter(filter, event)**

   ```typescript
   function matchFilter(filter: Filter, event: Event): boolean;
   ```

   - Checks if an event matches a single filter
   - Handles all filter properties including tag filters
   - Returns true if ALL conditions match

2. **matchFilters(filters, event)**

   ```typescript
   function matchFilters(filters: Filter[], event: Event): boolean;
   ```

   - Checks if an event matches ANY of the provided filters
   - Returns true if ANY filter matches
   - Useful for OR conditions across multiple filters

3. **mergeFilters(...filters)**

   ```typescript
   function mergeFilters(...filters: Filter[]): Filter;
   ```

   - Combines multiple filters into a single filter
   - Merges arrays (kinds, ids, authors, tags) with unique values
   - Takes the most inclusive values for since/until/limit

4. **getFilterLimit(filter)**
   ```typescript
   function getFilterLimit(filter: Filter): number;
   ```
   - Calculates the effective limit of a filter
   - Considers various filter properties
   - Useful for optimization

#### Best Practices

1. **Tag Value Organization**

   - Store primary/searchable values first in tags
   - Use consistent value formats
   - Consider creating separate indexed tags for searchable values

2. **Filter Optimization**

   - Use specific filter properties when possible
   - Combine filters appropriately for complex queries
   - Consider client-side filtering for non-indexed values

3. **Search Implementation**
   - Implement two-phase filtering:
     1. Relay-level filtering for indexed values
     2. Client-side filtering for non-indexed values
   - Cache results when appropriate
   - Use pagination for large result sets

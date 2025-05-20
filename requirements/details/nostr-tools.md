# Nostr Tools Documentation

## Overview
Nostr Tools is a comprehensive JavaScript/TypeScript library for working with the Nostr protocol. This document provides technical specifications and usage guidelines for the package.

## Core Components

### Event Structure
```typescript
interface Event {
  id: string;      // Event ID (32-bytes lowercase hex) - computed from the event data
  pubkey: string;  // Publisher's public key (32-bytes lowercase hex)
  created_at: number; // Unix timestamp in seconds
  kind: number;    // Event kind (0 = metadata, 1 = text note, etc.)
  tags: string[][]; // Array of tags
  content: string; // Event content (can be encrypted for DMs)
  sig: string;     // Event signature (64-bytes lowercase hex) - computed using private key
}
```

### Event Creation Process

When creating a new event, you only need to provide the following fields:
```typescript
const eventTemplate = {
  kind: number,
  created_at: number,
  tags: string[][],
  content: string,
  pubkey: string
};
```

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
  content: "Hello, Nostr!",
  pubkey
};

// Finalize event (computes id and sig)
const signedEvent = finalizeEvent(eventTemplate, privateKey);
console.log(signedEvent.id);   // e.g., "d7dd5eb3ab747e16f8d0212d53032ea2a7cadef53837e5a6c66d005fb98b5baf"
console.log(signedEvent.sig);  // e.g., "79e85af3cd6c43324975466d32f91f291e10af0dcba53c0985aa8a9bfad40b789abc78f2d08c4b2d85f5cacfb57ed227e9f8a8c24513882a9bd82d4cfe910c1"
```

### Event Tags

Event tags are a fundamental feature that provide additional metadata and create relationships between events, users, and other entities. They are stored in the `tags` field as an array of arrays.

#### Tag Structure
```typescript
tags: [
  [tagName, ...values],
  // More tags...
]
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
   ["d", identifier]
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
     ["url", fileUrl],
     ["m", mimeType],
     ["x", sha256Hash],
     ["size", fileSize],
     ["dim", dimensions],
     ["blurhash", hash],
     ["thumb", thumbnailUrl],
     ["alt", altText]
   ]
   ```

6. **Zap-related Tags** (NIP-57)
   ```typescript
   [
     ["amount", "1000"],
     ["relays", "wss://relay1.com", "wss://relay2.com"],
     ["lnurl", "lightning-url"]
   ]
   ```

#### Tag Usage Examples

1. **Creating a Reply**
```typescript
const replyEvent = {
  kind: 1,
  tags: [
    ["e", originalEventId, relayUrl, "reply"],  // Reference to replied event
    ["p", originalAuthorPubkey]                 // Reference to original author
  ],
  content: "This is a reply",
  // ... other event fields
};
```

2. **File Metadata**
```typescript
const fileEvent = {
  kind: 1063,
  tags: [
    ["url", "https://example.com/file.jpg"],
    ["m", "image/jpeg"],
    ["size", "123456"],
    ["dim", "1920x1080"],
    ["alt", "A beautiful sunset"]
  ],
  // ... other event fields
};
```

3. **Classified Listing** (NIP-99)
```typescript
const listingEvent = {
  kind: 30402,
  tags: [
    ["d", "unique-listing-id"],
    ["title", "Item for Sale"],
    ["summary", "Brief description"],
    ["location", "New York"],
    ["published_at", "1234567890"],
    ["price", "100", "USD"]
  ],
  // ... other event fields
};
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
    name: "username",
    about: "description",
    picture: "url"
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
const sub = pool.subscribe(['wss://relay.example.com'], {
  kinds: [0],
  authors: ['pubkey...']
}, {
  onevent: (event: Event) => {
    // Handle event
  }
});

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
import { classifyKind, isRegularKind, isReplaceableKind, isEphemeralKind, isAddressableKind } from 'nostr-tools/kinds';

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

## Integration with Bittasker

### Profile Updates
For profile updates in Bittasker, we use kind 0 events with additional custom fields:
```typescript
interface BittaskerProfile extends ProfileMetadata {
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
```typescript
import { SimplePool } from 'nostr-tools/pool';
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { finalizeEvent } from 'nostr-tools/pure';

export async function publishProfileUpdate(
  profile: BittaskerProfile,
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
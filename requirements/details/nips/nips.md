# Nostr Implementation Possibilities (NIPs)

## Message Encryption NIPs

### NIP-04: Encrypted Direct Messages
The original encrypted direct message specification that uses AES-CBC encryption.

#### Usage with nostr-tools
```typescript
import { encrypt, decrypt } from 'nostr-tools/nip04'

// Encrypt a message
const encrypted = await encrypt(myPrivateKey, theirPublicKey, 'hello')

// Decrypt a message
const decrypted = await decrypt(myPrivateKey, theirPublicKey, encryptedData)
```

#### Limitations
- Uses AES-CBC which is not as robust as modern alternatives
- Lacks proper padding scheme
- No forward secrecy
- No authentication of ciphertext (vulnerable to tampering)

### NIP-44: Encrypted Direct Messages v2
A more secure specification for encrypted direct messages that addresses NIP-04's limitations.

#### Key Improvements
1. Uses ChaCha20 for encryption (more suitable for web/mobile)
2. Proper message padding scheme
3. HMAC authentication of ciphertext
4. Better key derivation using HKDF
5. Version byte for future upgrades

#### Implementation Details
The implementation in `nip44.ts` follows these steps:

1. **Key Derivation**
   - Derives a shared secret using secp256k1
   - Uses HKDF to derive encryption and authentication keys
   - Includes version identifier for future compatibility

2. **Message Padding**
   - Implements length-hiding padding scheme
   - Includes message length as BE uint16
   - Pads to power-of-2 boundaries

3. **Encryption**
   - Uses ChaCha20 for encryption
   - Includes 32-byte random nonce
   - Authenticates ciphertext with HMAC-SHA256

4. **Message Format**
   ```
   [version (1 byte)] + [nonce (32 bytes)] + [ciphertext] + [mac (32 bytes)]
   ```

#### When to Use Which
- **Use NIP-04** if you need compatibility with older clients
- **Use NIP-44** for new applications where security is important

Both NIPs are supported by nostr-tools, but NIP-44 is recommended for new implementations due to its improved security properties.

## Core Protocol NIPs

### NIP-01: Basic Protocol Flow Description
The foundational NIP that defines core Nostr concepts including events, timestamps, and basic protocol rules.

#### Event Timestamps
- Events use Unix timestamps (seconds since January 1, 1970)
- `created_at` must be an integer (not floating point)
- Timestamps are chosen by clients, which can lead to:
  - Potential message ordering issues
  - Need for careful handling in replaceable events
  - Possibility of timestamp manipulation

#### Event IDs and Ordering
- Event IDs are SHA256 hashes of the canonical JSON representation of the event
- For events with same timestamp, the event with lowest ID (first in lexical order) is retained
- Lexical order means alphabetical comparison of the hex-encoded event IDs
- This becomes important when dealing with replaceable events

### NIP-16: Replaceable Events and Event Addressing

#### Event Categories
1. **Replaceable Events**
   - Kind numbers: `0`, `3`, or `10000 <= n < 20000`
   - Only latest event MUST be stored by relays
   - Identified by combination of:
     - `pubkey`
     - `kind`
   - Older versions MAY be discarded by relays
   - Example: Profile metadata (kind 0)

2. **Parameterized Replaceable Events**
   - Kind numbers: `30000 <= n < 40000`
   - Identified by combination of:
     - `pubkey`
     - `kind`
     - `d` tag value
   - Example: Task updates (kind 31000)

#### Event Replacement Rules
1. **Basic Requirements**
   - Events must share the same `pubkey`
   - Events must have the same `kind` number
   - For parameterized events, must share same `d` tag value

2. **Update Mechanics**
   - New event must have higher `created_at` timestamp
   - If timestamps are equal, event with lowest ID is kept
   - Relays MUST store only the latest event for each unique combination

#### Edge Cases and Best Practices

1. **Timestamp Handling**
   - When updating events, new timestamp must be > original
   - Small increments (microseconds) can maintain chronological order
   - Must result in valid Unix timestamp (integer seconds)

2. **Event Kind Consistency**
   - Use same kind for updates as creation
   - Example: Both create and update use kind 31000 for tasks
   - Different kinds break replacement mechanism

3. **D Tag Usage**
   - For parameterized events, `d` tag must be consistent
   - Format example: `task-${uniqueId}`
   - Must be identical between original and updates
   - Helps relays identify related events

4. **Update Verification**
   - Keep original task's uniqueId
   - Maintain consistent tag structure
   - Reference original event with 'e' tag
   - Reference original author with 'p' tag

#### Common Pitfalls
1. **Timestamp Issues**
   - Using milliseconds instead of seconds
   - Floating point timestamps
   - Future timestamps
   - Duplicate timestamps

2. **Event Replacement Failures**
   - Different kinds between create/update
   - Inconsistent `d` tags
   - Missing or changed uniqueId
   - Invalid timestamp increments

3. **POW Considerations**
   - POW must be recalculated for updates
   - Should use original task's uniqueId
   - Ensures consistent difficulty level

This technical documentation is based on practical implementation experience with Nostr task management system and official NIP specifications.

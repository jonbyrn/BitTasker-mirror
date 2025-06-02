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

# Encryption & Key Management

## Overview

BitTasker's encryption system is built on the principle of **client-side encryption** with **zero-knowledge architecture**. All sensitive data (Nostr private keys and wallet mnemonics) is encrypted on the user's device before being stored or transmitted. The server never has access to unencrypted keys.

## Table of Contents

1. [Cryptographic Foundations](#cryptographic-foundations)
2. [Master Key Derivation](#master-key-derivation)
3. [Context-Specific Keys](#context-specific-keys)
4. [Encryption Process](#encryption-process)
5. [Decryption Process](#decryption-process)
6. [Key Storage](#key-storage)
7. [Security Analysis](#security-analysis)
8. [Implementation Details](#implementation-details)

---

## Cryptographic Foundations

### Algorithms Used

| Algorithm   | Usage                         | Specification                            |
| ----------- | ----------------------------- | ---------------------------------------- |
| **AES-GCM** | Data encryption               | 256-bit key, 96-bit IV, 128-bit auth tag |
| **PBKDF2**  | Password-based key derivation | SHA-256, 100,000 iterations              |
| **HKDF**    | Context key derivation        | SHA-256, context-specific info           |
| **SHA-256** | Hashing                       | Wallet mnemonic derivation               |
| **BIP39**   | Mnemonic generation           | 12-word phrases (128-bit entropy)        |

### Why These Algorithms?

**AES-GCM (Authenticated Encryption)**

- ✅ Industry standard (NIST approved)
- ✅ Provides both confidentiality and authenticity
- ✅ Native Web Crypto API support
- ✅ Hardware acceleration available
- ✅ Prevents tampering (authentication tag)

**PBKDF2 (Password-Based Key Derivation)**

- ✅ Widely supported and tested
- ✅ Configurable iteration count (resistance to brute force)
- ✅ Standard for password-based encryption
- ✅ Native Web Crypto API support

**HKDF (HMAC-based Key Derivation)**

- ✅ Purpose-specific key derivation
- ✅ No key reuse across contexts
- ✅ Cryptographically sound key expansion
- ✅ Standard RFC 5869

### Security Parameters

```typescript
const SECURITY_PARAMS = {
	// AES-GCM Encryption
	keyLength: 256, // bits
	ivLength: 12, // bytes (96 bits)
	authTagLength: 16, // bytes (128 bits)
	algorithm: 'AES-GCM',

	// PBKDF2 Key Derivation
	pbkdf2: {
		hash: 'SHA-256',
		iterations: 100000, // Recommended minimum
		saltLength: 16, // bytes
		keyLength: 32 // bytes (256 bits)
	},

	// HKDF Key Derivation
	hkdf: {
		hash: 'SHA-256',
		saltLength: 16, // bytes + context
		keyLength: 32 // bytes (256 bits)
	},

	// Random Generation
	randomSource: crypto.getRandomValues,
	saltLength: 16, // bytes

	// Wallet Derivation
	walletEntropy: 16 // bytes (128 bits → 12 words)
};
```

---

## Master Key Derivation

### Overview

The master key is derived from the user's Nostr private key (nsec) using PBKDF2. This master key is then used to derive context-specific keys for encrypting different types of data.

### Process

```
User's nsec (Nostr Private Key)
    │
    ├─ Used as master password
    │
    ▼
┌──────────────────────────────────┐
│  Generate Master Salt            │
│  - 16 bytes random               │
│  - Unique per user               │
│  - Stored with encrypted data    │
└──────────────────────────────────┘
    │
    ▼
┌──────────────────────────────────┐
│  PBKDF2 Key Derivation           │
│  ┌────────────────────────────┐  │
│  │ Input:                     │  │
│  │  - password: nsec          │  │
│  │  - salt: masterSalt        │  │
│  │  - iterations: 100,000     │  │
│  │  - hash: SHA-256           │  │
│  │  - length: 256 bits        │  │
│  └────────────────────────────┘  │
└──────────────────────────────────┘
    │
    ▼
┌──────────────────────────────────┐
│  Master Key (256-bit)            │
│  - Never stored plaintext        │
│  - Exported for passkey storage  │
│  - Used for context derivation   │
└──────────────────────────────────┘
```

### Implementation

```typescript
/**
 * Derive master key from user's nsec using PBKDF2
 */
async function deriveKeyFromPassword(
	password: string, // User's nsec
	salt: Uint8Array, // Random 16 bytes
	iterations: number = 100000
): Promise<CryptoKey> {
	// Import password as key material
	const encoder = new TextEncoder();
	const keyMaterial = await crypto.subtle.importKey(
		'raw',
		encoder.encode(password),
		'PBKDF2',
		false,
		['deriveKey']
	);

	// Derive AES-GCM key from password
	return await crypto.subtle.deriveKey(
		{
			name: 'PBKDF2',
			salt: new Uint8Array(salt).buffer,
			iterations,
			hash: 'SHA-256'
		},
		keyMaterial,
		{ name: 'AES-GCM', length: 256 },
		true, // extractable (for export)
		['encrypt', 'decrypt']
	);
}
```

### Export for Passkey Storage

```typescript
/**
 * Export master key as base64 for passkey storage
 */
async function exportKey(key: CryptoKey): Promise<string> {
	const exported = await crypto.subtle.exportKey('raw', key);
	return bytesToBase64(new Uint8Array(exported));
}

/**
 * Import master key from base64
 */
async function importKey(keyData: string): Promise<CryptoKey> {
	const keyBytes = base64ToBytes(keyData);
	const buffer = new Uint8Array(keyBytes).buffer;

	return await crypto.subtle.importKey('raw', buffer, { name: 'AES-GCM', length: 256 }, true, [
		'encrypt',
		'decrypt'
	]);
}
```

---

## Context-Specific Keys

### Why Context-Specific Keys?

Instead of using the master key directly for all encryption, we derive separate keys for different purposes:

1. **Security**: Compromise of one context doesn't affect others
2. **Key Separation**: Different keys for different data types
3. **Best Practice**: Follows cryptographic key management standards
4. **Future-Proof**: Easy to add new contexts without changing existing encryption

### Contexts

| Context    | Purpose              | Data Encrypted                  |
| ---------- | -------------------- | ------------------------------- |
| `"nostr"`  | Nostr key encryption | User's nsec (Nostr private key) |
| `"wallet"` | Wallet encryption    | BIP39 mnemonic phrase           |

### Derivation Process

```
Master Key (from PBKDF2)
    │
    ├─ Context: "nostr"
    │       +
    │  Context Salt (16 bytes random)
    │       ↓
    │  ┌──────────────────────┐
    │  │  HKDF Derivation     │
    │  │  - SHA-256           │
    │  │  - Salt: context +   │
    │  │         contextSalt  │
    │  │  - Info: empty       │
    │  └──────────────────────┘
    │       ↓
    │  Nostr Key (256-bit)
    │  → Encrypts nsec
    │
    └─ Context: "wallet"
            +
       Context Salt (16 bytes random)
            ↓
       ┌──────────────────────┐
       │  HKDF Derivation     │
       │  - SHA-256           │
       │  - Salt: context +   │
       │         contextSalt  │
       │  - Info: empty       │
       └──────────────────────┘
            ↓
       Wallet Key (256-bit)
       → Encrypts mnemonic
```

### Implementation

```typescript
/**
 * Derive context-specific key from master key using HKDF
 */
async function deriveContextKey(
	masterKey: CryptoKey,
	context: string, // "nostr" or "wallet"
	salt: Uint8Array // 16 random bytes
): Promise<CryptoKey> {
	const encoder = new TextEncoder();
	const contextBytes = encoder.encode(context);

	// Combine context string and salt for unique derivation
	const combinedSalt = new Uint8Array(contextBytes.length + salt.length);
	combinedSalt.set(contextBytes);
	combinedSalt.set(salt, contextBytes.length);

	// Export master key to use as key material
	const masterKeyBytes = await crypto.subtle.exportKey('raw', masterKey);

	// Import as HKDF key material
	const keyMaterial = await crypto.subtle.importKey('raw', masterKeyBytes, 'HKDF', false, [
		'deriveKey'
	]);

	// Derive context-specific key using HKDF
	return await crypto.subtle.deriveKey(
		{
			name: 'HKDF',
			hash: 'SHA-256',
			salt: combinedSalt,
			info: new Uint8Array() // No additional info needed
		},
		keyMaterial,
		{ name: 'AES-GCM', length: 256 },
		true,
		['encrypt', 'decrypt']
	);
}
```

### Context Constants

```typescript
// src/lib/utils/consts.ts
export const DERIVATION_CONTEXTS = {
	NOSTR: 'nostr',
	WALLET: 'wallet'
} as const;
```

---

## Encryption Process

### Complete Encryption Flow

```
┌──────────────────────────────────────────────────────────────┐
│                    INPUTS                                     │
│  - nsec (Nostr private key)                                  │
│  - mnemonic (Wallet mnemonic)                                │
│  - masterPassword (nsec, used as password)                   │
└──────────────────────────────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────────┐
│              STEP 1: Generate Master Salt                    │
│  masterSalt = crypto.getRandomValues(16 bytes)               │
└──────────────────────────────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────────┐
│              STEP 2: Derive Master Key                       │
│  masterKey = PBKDF2(masterPassword, masterSalt, 100k)        │
└──────────────────────────────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────────┐
│              STEP 3: Generate Context Salts                  │
│  nostrSalt = crypto.getRandomValues(16 bytes)                │
│  walletSalt = crypto.getRandomValues(16 bytes)               │
└──────────────────────────────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────────┐
│              STEP 4: Derive Context Keys                     │
│  nostrKey = HKDF(masterKey, "nostr", nostrSalt)              │
│  walletKey = HKDF(masterKey, "wallet", walletSalt)           │
└──────────────────────────────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────────┐
│              STEP 5: Encrypt Data (Parallel)                 │
│  ┌────────────────────┐    ┌────────────────────┐            │
│  │ Encrypt Nsec       │    │ Encrypt Mnemonic   │            │
│  │ with nostrKey      │    │ with walletKey     │            │
│  └────────────────────┘    └────────────────────┘            │
└──────────────────────────────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────────┐
│              STEP 6: Export Master Key                       │
│  exportedKey = exportKey(masterKey)                          │
│  (base64 format for passkey storage)                         │
└──────────────────────────────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────────┐
│                    OUTPUTS                                    │
│  encryptedData: {                                            │
│    nostr: {                                                  │
│      encrypted: { data, iv, authTag },                       │
│      salt: base64(nostrSalt),                                │
│      iterations: 100000                                      │
│    },                                                        │
│    wallet: {                                                 │
│      encrypted: { data, iv, authTag },                       │
│      salt: base64(walletSalt),                               │
│      iterations: 100000                                      │
│    },                                                        │
│    masterSalt: base64(masterSalt)                            │
│  },                                                          │
│  exportedKey: base64(masterKey)                              │
└──────────────────────────────────────────────────────────────┘
```

### AES-GCM Encryption Details

```typescript
/**
 * Encrypt data using AES-GCM
 */
async function encrypt(data: string, key: CryptoKey): Promise<CryptoEncryptedData> {
	const encoder = new TextEncoder();

	// Generate random IV (12 bytes for AES-GCM)
	const iv = crypto.getRandomValues(new Uint8Array(12));

	// Encode data as bytes
	const dataBytes = encoder.encode(data);

	// Encrypt with AES-GCM
	const encryptedData = await crypto.subtle.encrypt(
		{
			name: 'AES-GCM',
			iv: iv,
			tagLength: 128 // Authentication tag length
		},
		key,
		dataBytes
	);

	// Split encrypted data into ciphertext and auth tag
	// AES-GCM appends auth tag to ciphertext
	const ciphertextBytes = new Uint8Array(encryptedData.slice(0, -16));
	const authTagBytes = new Uint8Array(encryptedData.slice(-16));

	return {
		data: bytesToBase64(ciphertextBytes),
		iv: bytesToBase64(iv),
		authTag: bytesToBase64(authTagBytes)
	};
}
```

### Data Structure

```typescript
interface CryptoEncryptedData {
	data: string; // Base64 ciphertext
	iv: string; // Base64 initialization vector
	authTag: string; // Base64 authentication tag
}

interface ContextEncryption {
	encrypted: CryptoEncryptedData;
	salt: string; // Base64 context salt
	iterations: number; // PBKDF2 iterations
}

interface EncryptedData {
	nostr: ContextEncryption;
	wallet: ContextEncryption;
	masterSalt: string; // Base64 master salt
}
```

---

## Decryption Process

### Complete Decryption Flow

```
┌──────────────────────────────────────────────────────────────┐
│                    INPUTS                                     │
│  - encryptedData (EncryptedData structure)                   │
│  - exportedKey (base64 master key from passkey)              │
└──────────────────────────────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────────┐
│              STEP 1: Import Master Key                       │
│  masterKey = importKey(exportedKey)                          │
└──────────────────────────────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────────┐
│              STEP 2: Derive Context Keys                     │
│  nostrSalt = base64Decode(encryptedData.nostr.salt)          │
│  walletSalt = base64Decode(encryptedData.wallet.salt)        │
│  │                                                            │
│  nostrKey = HKDF(masterKey, "nostr", nostrSalt)              │
│  walletKey = HKDF(masterKey, "wallet", walletSalt)           │
└──────────────────────────────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────────┐
│              STEP 3: Decrypt Data (Parallel)                 │
│  ┌────────────────────┐    ┌────────────────────┐            │
│  │ Decrypt Nsec       │    │ Decrypt Mnemonic   │            │
│  │ with nostrKey      │    │ with walletKey     │            │
│  └────────────────────┘    └────────────────────┘            │
└──────────────────────────────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────────┐
│                    OUTPUTS                                    │
│  nsec: string (Nostr private key)                            │
│  mnemonic: string (12-word BIP39 phrase)                     │
└──────────────────────────────────────────────────────────────┘
```

### AES-GCM Decryption Details

```typescript
/**
 * Decrypt data using AES-GCM
 */
async function decrypt(encryptedData: CryptoEncryptedData, key: CryptoKey): Promise<string> {
	const decoder = new TextDecoder();

	// Decode base64 components
	const dataBytes = base64ToBytes(encryptedData.data);
	const ivBytes = base64ToBytes(encryptedData.iv);
	const authTagBytes = base64ToBytes(encryptedData.authTag);

	// Combine ciphertext and auth tag (AES-GCM format)
	const combinedBytes = new Uint8Array(dataBytes.length + authTagBytes.length);
	combinedBytes.set(dataBytes);
	combinedBytes.set(authTagBytes, dataBytes.length);

	// Decrypt with AES-GCM
	const decryptedData = await crypto.subtle.decrypt(
		{
			name: 'AES-GCM',
			iv: new Uint8Array(ivBytes).buffer,
			tagLength: 128
		},
		key,
		combinedBytes
	);

	// Decode bytes to string
	return decoder.decode(decryptedData);
}
```

### Recovery Password Decryption

For account recovery, users can decrypt their keys using a recovery password instead of biometric authentication:

```typescript
/**
 * Decrypt master key data using recovery password
 */
async function decryptMasterKeyWithPassword(
	recoveryData: {
		nostr: ContextEncryption;
		wallet: ContextEncryption;
		masterSalt: string;
	},
	password: string
): Promise<{ nsec: string; mnemonic: string }> {
	// Decode master salt
	const masterSalt = base64ToBytes(recoveryData.masterSalt);
	const iterations = recoveryData.nostr.iterations;

	// Derive master key from recovery password
	const masterKey = await deriveKeyFromPassword(password, masterSalt, iterations);

	// Get context salts
	const nostrSalt = base64ToBytes(recoveryData.nostr.salt);
	const walletSalt = base64ToBytes(recoveryData.wallet.salt);

	// Derive context-specific keys
	const nostrKey = await deriveContextKey(masterKey, 'nostr', nostrSalt);
	const walletKey = await deriveContextKey(masterKey, 'wallet', walletSalt);

	// Decrypt both pieces of data in parallel
	const [nsec, mnemonic] = await Promise.all([
		decrypt(recoveryData.nostr.encrypted, nostrKey),
		decrypt(recoveryData.wallet.encrypted, walletKey)
	]);

	return { nsec, mnemonic };
}
```

---

## Key Storage

### Client-Side Storage

#### Memory Storage (appStore)

**What's Stored:**

```typescript
{
  nostrKeys: {
    npub: string | null,        // Public key (hex)
    nsec: Uint8Array | null,    // Private key (bytes)
    mnemonic: string | null     // Wallet mnemonic
  },
  biometricData: {
    npub: string,                    // Public key (hex)
    exportedKey: string,             // Base64 master key
    encryptedData: EncryptedData     // Full encrypted structure
  } | null
}
```

**Characteristics:**

- ✅ Fastest access (in-memory)
- ✅ Session-scoped (cleared on logout)
- ⚠️ Vulnerable to memory dumps (mitigated by short lifetime)
- ⚠️ Lost on page refresh (must re-authenticate)

#### localStorage

**What's Stored:**

```typescript
{
	NPUB: string; // Public key only (non-sensitive)
}
```

**Characteristics:**

- ✅ Persistent across sessions
- ✅ Fast access (local I/O)
- ✅ Only stores public key (non-sensitive)
- ⚠️ Accessible to JavaScript (XSS risk)

#### Biometric Storage

**Web (WebAuthn):**

```typescript
// Stored in userHandle of WebAuthn credential
{
	userHandle: ArrayBuffer; // 64 bytes: npub (32) + exportedKey (32)
}
```

**Mobile (Native Biometric):**

```typescript
// Stored in platform secure storage
{
  username: npub,           // Public key
  password: exportedKey,    // Exported master key
  server: "bittasker"       // Service identifier
}
```

**Characteristics:**

- ✅ Hardware-backed security
- ✅ Requires biometric authentication
- ✅ Protected by secure enclave
- ✅ Isolated from application memory

### Server-Side Storage

**What's Stored:**

```sql
-- Encrypted data stored on server
{
  user_id: integer,
  public_key: string,                -- Nostr public key (npub)
  encrypted_data: jsonb,             -- EncryptedData structure
  created_at: timestamp,
  updated_at: timestamp
}

-- Passkey credentials
{
  credential_id: string,             -- Unique credential ID
  user_id: integer,
  public_key: string,                -- WebAuthn public key
  device_name: string,
  platform: string,                  -- "web" or "mobile"
  created_at: timestamp
}
```

**Characteristics:**

- ✅ Server never sees plaintext keys
- ✅ Encrypted data can be retrieved for decryption
- ✅ Backup in case of device loss
- ⚠️ Requires authentication to retrieve

---

## Security Analysis

### Threat Model

#### Threats Mitigated

**1. Server Compromise**

- ✅ Server only has encrypted data
- ✅ Decryption requires exported master key (not on server)
- ✅ Zero-knowledge architecture

**2. Network Interception**

- ✅ Data encrypted before transmission
- ✅ HTTPS/TLS for transport security
- ✅ No plaintext keys in transit

**3. Client-Side Attacks**

_XSS (Cross-Site Scripting):_

- ✅ No sensitive data in localStorage
- ✅ Short-lived memory storage
- ✅ Content Security Policy (CSP)
- ⚠️ Still vulnerable if attacker executes code

_Memory Dumps:_

- ✅ Keys only in memory when needed
- ✅ Session-scoped (not persistent)
- ⚠️ Vulnerable during active use

**4. Brute Force Attacks**

- ✅ PBKDF2 with 100k iterations
- ✅ Random salts prevent rainbow tables
- ✅ Biometric authentication required

**5. Replay Attacks**

- ✅ Challenge-response authentication
- ✅ Time-bound challenges
- ✅ Signature verification

#### Remaining Risks

**1. Device Compromise**

- ⚠️ If device is compromised, keys can be extracted from memory
- **Mitigation**: Short session lifetime, re-authentication

**2. Phishing**

- ⚠️ User could be tricked into entering nsec on fake site
- **Mitigation**: Passkey authentication (origin-bound), user education

**3. Biometric Spoofing**

- ⚠️ Sophisticated attacks might spoof biometrics
- **Mitigation**: Hardware-backed biometric security

**4. Quantum Computing**

- ⚠️ Future quantum computers could break current encryption
- **Mitigation**: Monitor quantum-resistant algorithms, plan migration

### Cryptographic Strength

#### Key Length Analysis

| Component    | Bits | Security Level       |
| ------------ | ---- | -------------------- |
| AES-GCM      | 256  | Military-grade       |
| Master Key   | 256  | Military-grade       |
| Context Keys | 256  | Military-grade       |
| IV           | 96   | Standard for AES-GCM |
| Auth Tag     | 128  | Standard for AES-GCM |

#### Attack Complexity

**Brute Force Master Key:**

```
Attempts needed: 2^256 ≈ 1.16 × 10^77
At 1 billion attempts/second: 3.67 × 10^60 years
(Universe age: 1.38 × 10^10 years)
```

**PBKDF2 Iteration Time:**

```
Single attempt: ~10ms (100k iterations)
Brute force 12-word mnemonic:
  Combinations: 2048^12 ≈ 5.44 × 10^39
  Time: 5.44 × 10^36 seconds ≈ 1.72 × 10^29 years
```

#### Salt Randomness

```typescript
// Entropy per salt
Salt length: 16 bytes = 128 bits
Possible values: 2^128 ≈ 3.40 × 10^38

// Probability of collision (birthday paradox)
After 2^64 salts: ~50% collision probability
After 10^19 salts: ~1% collision probability
```

### Best Practices Compliance

✅ **OWASP Cryptographic Storage Cheat Sheet**

- Use strong algorithms (AES-256, SHA-256)
- Use unique, random IVs
- Use authenticated encryption (GCM mode)
- Use key derivation functions (PBKDF2, HKDF)
- Use sufficient iteration counts (100k)

✅ **NIST Guidelines**

- AES-256 approved
- PBKDF2 with SHA-256 approved
- Minimum 100k iterations recommended
- Random salt generation

✅ **Web Crypto API Standards**

- Use native implementations
- Hardware acceleration
- Secure random generation
- Key non-exportability options

---

## Implementation Details

### File Structure

```
src/lib/utils/helpers/
├── crypto.ts           # Core cryptographic functions
├── auth.ts             # Master key encryption/decryption
├── encoding.ts         # Data encoding utilities
├── biometrics.ts       # Mobile biometric integration
└── webBiometrics.ts    # Web WebAuthn integration
```

### Key Functions

**crypto.ts:**

```typescript
generateRandomKey(); // Generate AES-GCM key
exportKey(); // Export key as base64
importKey(); // Import key from base64
encrypt(); // AES-GCM encryption
decrypt(); // AES-GCM decryption
deriveKeyFromPassword(); // PBKDF2 key derivation
deriveContextKey(); // HKDF context derivation
deriveWalletFromNostr(); // Deterministic mnemonic
```

**auth.ts:**

```typescript
encryptMasterKeyData(); // Encrypt nsec + mnemonic
decryptMasterKeyDataFromBiometrics(); // Decrypt with biometric key
decryptNsecFromMasterKey(); // Decrypt nsec only
decryptWalletFromMasterKey(); // Decrypt mnemonic only
decryptMasterKeyWithPassword(); // Decrypt with recovery password
```

### Error Handling

```typescript
// Encryption errors
try {
	const encrypted = await encrypt(data, key);
} catch (error) {
	if (error.name === 'InvalidAccessError') {
		// Key is not suitable for encryption
	} else if (error.name === 'OperationError') {
		// Encryption failed
	}
	throw new Error('Failed to encrypt data');
}

// Decryption errors
try {
	const decrypted = await decrypt(encrypted, key);
} catch (error) {
	if (error.name === 'OperationError') {
		// Authentication tag verification failed (data tampered)
		throw new Error('Data integrity check failed');
	}
	throw new Error('Failed to decrypt data');
}
```

### Performance Optimization

**Parallel Encryption:**

```typescript
// Encrypt both nsec and mnemonic in parallel
const [nostrEncrypted, walletEncrypted] = await Promise.all([
	encrypt(nsec, nostrKey),
	encrypt(mnemonic, walletKey)
]);
```

**Parallel Decryption:**

```typescript
// Decrypt both in parallel
const [nsec, mnemonic] = await Promise.all([
	decrypt(encryptedData.nostr.encrypted, nostrKey),
	decrypt(encryptedData.wallet.encrypted, walletKey)
]);
```

**Lazy Decryption:**

```typescript
// Only decrypt what's needed
if (needNsec) {
	nsec = await decryptNsecFromMasterKey(encryptedData, exportedKey);
}

if (needMnemonic) {
	mnemonic = await decryptWalletFromMasterKey(encryptedData, exportedKey);
}
```

### Testing

**Unit Tests:**

```typescript
describe('Encryption', () => {
	it('should encrypt and decrypt correctly', async () => {
		const key = await generateRandomKey();
		const plaintext = 'secret data';

		const encrypted = await encrypt(plaintext, key);
		const decrypted = await decrypt(encrypted, key);

		expect(decrypted).toBe(plaintext);
		expect(encrypted.data).not.toBe(plaintext);
	});

	it('should fail with wrong key', async () => {
		const key1 = await generateRandomKey();
		const key2 = await generateRandomKey();
		const plaintext = 'secret data';

		const encrypted = await encrypt(plaintext, key1);

		await expect(decrypt(encrypted, key2)).rejects.toThrow();
	});

	it('should detect tampering', async () => {
		const key = await generateRandomKey();
		const plaintext = 'secret data';

		const encrypted = await encrypt(plaintext, key);
		encrypted.data = 'tampered'; // Tamper with ciphertext

		await expect(decrypt(encrypted, key)).rejects.toThrow();
	});
});
```

---

## Future Enhancements

### 1. Hardware Security Module (HSM) Support

- Integrate with hardware security modules
- Store master keys in HSM
- Hardware-backed encryption operations

### 2. Key Rotation

- Periodic key rotation mechanism
- Seamless re-encryption with new keys
- Audit trail for key rotations

### 3. Multi-Party Computation

- Threshold encryption schemes
- Social recovery mechanisms
- No single point of failure

### 4. Post-Quantum Cryptography

- Monitor NIST post-quantum standards
- Hybrid approach (classical + quantum-resistant)
- Migration strategy for quantum threats

### 5. Future Directions

BitTasker continues to explore advanced cryptographic techniques to enhance user privacy and platform trust.

---

## References

### Standards & Specifications

- **NIST SP 800-38D**: AES-GCM Mode
- **NIST SP 800-132**: PBKDF2 Recommendations
- **RFC 5869**: HKDF (HMAC-based Key Derivation)
- **BIP39**: Mnemonic Code for Generating Deterministic Keys
- **Web Crypto API**: W3C Cryptography Standard

### Security Guidelines

- **OWASP Cryptographic Storage Cheat Sheet**
- **NIST Cryptographic Standards**
- **Web Crypto API Best Practices**
- **WebAuthn Security Considerations**

### Further Reading

- [Web Crypto API Documentation](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)
- [NIST Cryptographic Toolkit](https://csrc.nist.gov/projects/cryptographic-standards-and-guidelines)
- [BIP39 Specification](https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki)
- [WebAuthn Specification](https://www.w3.org/TR/webauthn/)

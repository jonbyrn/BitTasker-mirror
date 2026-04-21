# Authentication System Architecture

## System Overview

BitTasker's authentication system is designed as a zero-knowledge, client-side encrypted solution that leverages modern Web APIs and native platform capabilities. The architecture prioritizes security, user experience, and cross-platform compatibility.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         User Layer                               │
│  ┌──────────────┐              ┌──────────────┐                 │
│  │ Web Browser  │              │ Mobile App   │                 │
│  │ (WebAuthn)   │              │ (Biometric)  │                 │
│  └──────────────┘              └──────────────┘                 │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│                    Client Application                            │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Authentication Layer                         │   │
│  │  • Login Page (login/+page.svelte)                       │   │
│  │  • PasskeySetup Component                                │   │
│  │  • Account Recovery Component                            │   │
│  └─────────────────────────────────────────────────────────┘   │
│                            ↓                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Service Layer                                │   │
│  │  • AuthService (auth.service.ts)                         │   │
│  │  • Auth Helpers (auth.ts)                                │   │
│  │  • Nostr Keys Manager (nostrKeys.ts)                     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                            ↓                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Cryptography Layer                           │   │
│  │  • Web Crypto API (crypto.ts)                            │   │
│  │  • Key Derivation (PBKDF2, HKDF)                         │   │
│  │  • Encryption (AES-GCM)                                  │   │
│  │  • Encoding Utilities (encoding.ts)                      │   │
│  └─────────────────────────────────────────────────────────┘   │
│                            ↓                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │         Platform Integration Layer                        │   │
│  │  ┌─────────────┐              ┌─────────────┐            │   │
│  │  │   Web       │              │   Mobile    │            │   │
│  │  │ WebAuthn    │              │  Capacitor  │            │   │
│  │  │ localStorage│              │ Biometric   │            │   │
│  │  └─────────────┘              │ Preferences │            │   │
│  │                               └─────────────┘            │   │
│  └─────────────────────────────────────────────────────────┘   │
│                            ↓                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              State Management                             │   │
│  │  • appStore (in-memory cache)                            │   │
│  │  • authState (authentication state)                      │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│                      Network Layer                               │
│  • HTTP Client (axios-based)                                    │
│  • Endpoint Configuration (endpoints.ts)                        │
│  • Request/Response Interceptors                                │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│                     Backend Services                             │
│  • Authentication API                                            │
│  • User Management                                               │
│  • Encrypted Data Storage                                        │
│  • Challenge Generation                                          │
│  • Credential Verification                                       │
└─────────────────────────────────────────────────────────────────┘
```

## Component Architecture

### 1. Authentication Layer

#### Login Page (`src/routes/auth/login/+page.svelte`)

**Responsibilities:**

- User interface for authentication
- Handle passkey and nsec login flows
- QR code scanning for mobile
- Error display and retry logic
- Navigation after successful authentication

**Key Features:**

- Dual login method support
- Platform-specific UI adaptation
- Biometric availability detection
- Error handling with retry mechanisms
- Migration support for legacy formats

**Data Flow:**

```
User Action (Passkey/Nsec)
    ↓
Validation & Platform Detection
    ↓
Authentication Method Selection
    ├── Passkey: authenticate()
    └── Nsec: handleNsecLogin()
    ↓
Biometric/WebAuthn Prompt
    ↓
Credential Retrieval
    ↓
Server Authentication
    ↓
Key Decryption
    ↓
State Setup
    ↓
Navigation (Dashboard/Onboarding)
```

#### PasskeySetup Component (`src/lib/components/onboarding/PasskeySetup.svelte`)

**Responsibilities:**

- Onboarding flow for new users
- Passkey creation and registration
- Key generation or import
- Wallet mnemonic derivation
- Educational UI elements

**Key Features:**

- Generate new Nostr keypair or use existing
- Derive wallet mnemonic deterministically
- Platform-specific passkey creation
- Error handling with detailed troubleshooting
- Progressive onboarding steps

**Data Flow:**

```
User Data (Username, Nsec?)
    ↓
Key Generation/Import
    ├── Existing: Decode nsec → npub
    └── New: Generate keypair
    ↓
Derive Wallet Mnemonic
    ↓
Encrypt Master Key Data
    ↓
Create Passkey Credential
    ├── Web: WebAuthn
    └── Mobile: Native Biometric
    ↓
Register with Server
    ↓
Setup Auth State
    ↓
Continue to Next Step
```

### 2. Service Layer

#### AuthService (`src/lib/api/services/auth.service.ts`)

**Responsibilities:**

- API communication with backend
- Request formatting and validation
- Response handling and error translation
- Endpoint management

**Key Methods:**

- `register()` - Register new user with encrypted data
- `passkeyLogin()` - Authenticate with passkey credentials
- `nostrLogin()` - Login/register with Nostr signature
- `getChallenge()` - Retrieve authentication challenge
- `encryptedNostrData()` - Get encrypted data for Nostr login
- `getPasskeyEncryptedData()` - Get encrypted data for passkey login
- `setupRecovery()` - Configure account recovery
- `initiateNostrRecovery()` - Start recovery process
- `completeNostrRecovery()` - Finish recovery with new credentials

**Error Handling:**

```typescript
// Translates HTTP status codes to user-friendly messages
// Handles specific error cases (400, 401, 409, 422, 500)
// Provides fallback error messages
// Logs detailed errors for debugging
```

#### Auth Helpers (`src/lib/utils/helpers/auth.ts`)

**Responsibilities:**

- Master key encryption/decryption
- Key derivation orchestration
- Biometric data management
- Legacy format handling

**Key Functions:**

- `encryptMasterKeyData()` - Encrypt both nsec and mnemonic
- `decryptMasterKeyDataFromBiometrics()` - Decrypt using biometric credentials
- `decryptNsecFromMasterKey()` - Extract nsec from encrypted data
- `decryptWalletFromMasterKey()` - Extract mnemonic from encrypted data
- `decryptMasterKeyWithPassword()` - Decrypt using recovery password

**Encryption Flow:**

```
Input: nsec, mnemonic, masterPassword
    ↓
Generate master salt (16 bytes random)
    ↓
Derive master key (PBKDF2)
    ├── Password: masterPassword
    ├── Salt: masterSalt
    └── Iterations: 100,000
    ↓
Generate context salts (16 bytes each)
    ├── nostrSalt
    └── walletSalt
    ↓
Derive context keys (HKDF)
    ├── nostrKey (from master + NOSTR context)
    └── walletKey (from master + WALLET context)
    ↓
Encrypt data (AES-GCM)
    ├── Encrypt nsec with nostrKey
    └── Encrypt mnemonic with walletKey
    ↓
Export master key (for passkey storage)
    ↓
Return: EncryptedData + exportedKey
```

#### Nostr Keys Manager (`src/lib/utils/nostrKeys.ts`)

**Responsibilities:**

- Optimized key retrieval
- Three-tier caching strategy
- Minimize biometric prompts
- Session management

**Key Functions:**

- `getNpub()` - Get public key (fastest, uses all cache tiers)
- `getNostrKeyPair()` - Get nsec + npub (memory cache or biometric)
- `getAllKeys()` - Get nsec + npub + mnemonic (memory cache or biometric)

**Caching Strategy:**

```
Request for Key
    ↓
Check Tier 1: Memory Cache (appStore)
    ├── Hit: Return immediately
    └── Miss: Continue to Tier 2
    ↓
Check Tier 2: Local Storage
    ├── Hit: Cache in memory, return
    └── Miss: Continue to Tier 3
    ↓
Check Tier 3: Biometric Data (in appStore)
    ├── Available: Decrypt from cached encrypted data
    └── Not Available: Continue to Tier 4
    ↓
Tier 4: Prompt Biometric Authentication
    ├── Authenticate user
    ├── Retrieve credentials
    ├── Fetch encrypted data from server
    ├── Decrypt keys
    └── Cache in all tiers
    ↓
Return Key
```

### 3. Cryptography Layer

#### Crypto Module (`src/lib/utils/helpers/crypto.ts`)

**Responsibilities:**

- Core cryptographic operations
- Key generation and derivation
- Encryption and decryption
- Secure random number generation

**Key Functions:**

**Key Management:**

```typescript
generateRandomKey(); // Generate AES-GCM key
exportKey(); // Export key as base64
importKey(); // Import key from base64
```

**Encryption/Decryption:**

```typescript
encrypt(data, key); // AES-GCM encrypt
decrypt(encrypted, key); // AES-GCM decrypt
```

**Key Derivation:**

```typescript
deriveKeyFromPassword(password, salt, iterations); // PBKDF2
deriveContextKey(masterKey, context, salt); // HKDF
```

**Wallet Generation:**

```typescript
deriveWalletFromNostr(nsec); // Deterministic mnemonic
```

**Cryptographic Specifications:**

```yaml
Encryption:
  Algorithm: AES-GCM
  Key Length: 256 bits
  IV Length: 12 bytes (96 bits)
  Auth Tag Length: 16 bytes (128 bits)

Key Derivation (PBKDF2):
  Hash: SHA-256
  Iterations: 100,000
  Salt Length: 16 bytes
  Output: 256-bit key

Key Derivation (HKDF):
  Hash: SHA-256
  Context: "nostr" or "wallet"
  Salt: 16 bytes + context
  Output: 256-bit key

Random Generation:
  Source: crypto.getRandomValues()
  Quality: Cryptographically secure
```

#### Encoding Module (`src/lib/utils/helpers/encoding.ts`)

**Responsibilities:**

- Data format conversion
- Binary data handling
- Passkey credential packing
- Base64/hex encoding

**Key Functions:**

**Basic Encoding:**

```typescript
bytesToBase64(); // Uint8Array → base64
base64ToBytes(); // base64 → Uint8Array
bytesToHex(); // Uint8Array → hex
hexToBytes(); // hex → Uint8Array
```

**Passkey Credential Packing:**

```typescript
packKeys(publicKey, exportedKey); // Web packing (64 bytes)
packKeysMobile(publicKey, exportedKey); // Mobile packing (base64url)
unPackKeys(userHandle); // Web unpacking
unPackKeysMobile(packedString); // Mobile unpacking
```

**Credential Utilities:**

```typescript
generateCredentialId(); // Random credential ID
generateMobileChallenge(); // Mobile WebAuthn challenge
generateWebChallenge(); // Web WebAuthn challenge
```

**Packing Format:**

```
Web Format (64 bytes):
  [0-31]   Public Key (32 bytes hex → bytes)
  [32-63]  Exported Key (32 bytes base64 → bytes)

Mobile Format (base64url string):
  Same 64-byte structure, encoded as base64url
  Compatible with mobile WebAuthn character limits
```

### 4. Platform Integration Layer

#### Web Platform

**WebAuthn Integration:**

```typescript
// Create credential
navigator.credentials.create({
	publicKey: {
		challenge,
		rp: { name, id },
		user: {
			id: userHandle, // Packed: npub + exportedKey
			name: username,
			displayName: username
		},
		pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
		authenticatorSelection: {
			authenticatorAttachment: 'platform',
			userVerification: 'required',
			residentKey: 'required'
		}
	}
});

// Get credential
navigator.credentials.get({
	publicKey: {
		challenge,
		rpId,
		userVerification: 'required'
	}
});
```

**Storage:**

- localStorage: Public key caching
- sessionStorage: Not used (security concern)
- IndexedDB: Not used (current implementation)

#### Mobile Platform

**Capacitor Biometric Plugin:**

```typescript
// Create credential
NativeBiometric.setCredentials({
	username: npub,
	password: exportedKey,
	server: 'bittasker'
});

// Get credential
NativeBiometric.getCredentials({
	server: 'bittasker'
});

// Verify identity
NativeBiometric.verifyIdentity({
	reason: 'Authenticate to continue'
});
```

**Storage:**

- Capacitor Preferences: Public key caching
- Secure Enclave: Biometric credential storage
- Keychain/Keystore: Platform-specific secure storage

### 5. State Management

#### App Store (`appStore`)

**Structure:**

```typescript
{
  nostrKeys: {
    npub: string | null,      // Public key
    nsec: Uint8Array | null,  // Private key
    mnemonic: string | null   // Wallet mnemonic
  },
  biometricData: {
    npub: string,
    exportedKey: string,
    encryptedData: EncryptedData
  } | null
}
```

**Purpose:**

- Session-scoped key cache
- Encrypted credential storage
- Minimize biometric prompts
- Fast key access

#### Auth State (`authState`)

**Responsibilities:**

- User authentication status
- Access token management
- User profile data
- Session lifecycle

**Key Methods:**

```typescript
setupAuthData(); // Initialize auth session
logout(); // Clear session
refreshToken(); // Token refresh (if implemented)
```

## Data Flow Patterns

### Registration Flow

```
1. User Input
   ├── Username
   └── Nsec (optional)

2. Key Generation
   ├── Generate or import nsec
   ├── Derive npub from nsec
   └── Derive mnemonic from nsec

3. Encryption
   ├── Generate master salt
   ├── Derive master key from nsec
   ├── Derive context keys
   ├── Encrypt nsec and mnemonic
   └── Export master key

4. Passkey Creation
   ├── Platform detection
   ├── Create WebAuthn/Biometric credential
   ├── Pack npub + exportedKey
   └── Store in secure storage

5. Server Registration
   ├── Send encrypted data
   ├── Send credential details
   ├── Receive access token
   └── Receive user data

6. State Setup
   ├── Store biometricData
   ├── Cache npub
   └── Update authState

7. Navigation
   └── Redirect to onboarding
```

### Login Flow (Passkey)

```
1. Biometric Prompt
   ├── Platform detection
   └── Authenticate user

2. Credential Retrieval
   ├── Get credential from secure storage
   ├── Unpack npub + exportedKey
   └── Get challenge and signature

3. Server Authentication
   ├── Send credential data
   ├── Verify signature
   └── Receive encrypted data + token

4. Legacy Check
   ├── Check isLegacy flag
   └── Migrate if needed

5. Key Decryption
   ├── Import master key
   ├── Derive context keys
   ├── Decrypt nsec
   └── Decrypt mnemonic

6. State Setup
   ├── Store biometricData
   ├── Cache keys in memory
   └── Update authState

7. Navigation
   └── Redirect to dashboard
```

### Login Flow (Nsec)

```
1. User Input
   └── Nsec (or QR code scan)

2. Challenge Signing
   ├── Get challenge from server
   ├── Sign with nsec (Nostr event)
   └── Send to check account existence

3. Account Check
   ├── POST encrypted-data endpoint
   └── Receive: encryptedData or null

4. Wallet Handling
   ├── Existing: Decrypt mnemonic
   └── New: Derive mnemonic

5. Encryption
   └── Encrypt master key data

6. Passkey Setup (optional)
   ├── Skip in test environment
   └── Create credential

7. Server Login
   ├── Send signed event
   ├── Send encrypted data
   ├── Send credential data (if created)
   └── Receive: token + user + flags

8. Migration Check
   └── Show modal if isMigrated

9. State Setup
   └── Setup auth data

10. Navigation
    ├── New user: Onboarding
    └── Existing: Dashboard
```

## Security Architecture

### Defense in Depth

**Layer 1: Client-Side Encryption**

- All sensitive data encrypted before leaving device
- Server never sees plaintext keys
- Web Crypto API for all operations

**Layer 2: Key Derivation**

- PBKDF2 with 100k iterations
- Context-specific key derivation (HKDF)
- Unique salts for each encryption

**Layer 3: Biometric Security**

- Hardware-backed authentication
- Secure enclave storage
- Platform-specific protections

**Layer 4: Transport Security**

- HTTPS for all communications
- TLS 1.3 preferred
- Certificate pinning (future)

**Layer 5: Challenge-Response**

- Prevents replay attacks
- Time-bound challenges
- Signature verification

**Layer 6: Access Control**

- JWT-based authorization
- Token expiration
- Scope-based permissions

### Threat Mitigation

| Threat               | Mitigation                                   |
| -------------------- | -------------------------------------------- |
| Server Compromise    | Client-side encryption; keys never on server |
| Network Interception | HTTPS/TLS; encrypted payloads                |
| Phishing             | WebAuthn origin binding; biometric auth      |
| Credential Stuffing  | No passwords; passkey-based                  |
| Brute Force          | PBKDF2 iterations; account lockout           |
| Replay Attacks       | Challenge-response; signatures               |
| XSS                  | CSP headers; input sanitization              |
| CSRF                 | SameSite cookies; CSRF tokens                |
| Key Extraction       | Memory isolation; secure storage             |
| Social Engineering   | Multi-factor; biometric requirement          |

## Performance Optimization

### Caching Strategy

**Tier 1: Memory (appStore)**

- Access Time: <1ms
- Scope: Current session
- Invalidation: On logout

**Tier 2: Local Storage**

- Access Time: <10ms
- Scope: Persistent
- Invalidation: On logout or manual clear

**Tier 3: Biometric**

- Access Time: 100-1000ms
- Scope: On-demand
- Invalidation: Credential revocation

### Lazy Loading

- Encrypt/decrypt only when needed
- Progressive key retrieval (npub → nsec → mnemonic)
- Deferred decryption for wallet operations

### Batching

- Parallel encryption of nsec and mnemonic
- Parallel decryption when both needed
- Batch API calls when possible

## Scalability Considerations

### Horizontal Scaling

- Stateless authentication
- JWT tokens for auth state
- No server-side session storage

### Vertical Scaling

- Client-side crypto reduces server load
- Efficient key derivation
- Minimal server computation

### Multi-Region

- Edge deployment ready
- Low latency authentication
- Geographic redundancy

## Monitoring & Observability

### Metrics to Track

- Authentication success/failure rates
- Biometric prompt frequency
- Cache hit rates (memory, localStorage)
- API response times
- Error rates by type
- Platform distribution (web vs mobile)

### Logging

- Authentication attempts (without sensitive data)
- Error conditions with context
- Migration events
- Recovery operations

### Alerts

- High failure rates
- Unusual error patterns
- Legacy format usage spike
- Server availability issues

## Future Architecture Improvements

1. **Multi-Device Sync**

   - Encrypted cloud sync
   - Conflict resolution
   - Device management

2. **Hardware Security Keys**

   - FIDO2 support
   - YubiKey integration
   - NFC key support

3. **Threshold Signatures**

   - Social recovery
   - Multi-sig wallets
   - Collaborative auth

4. **Future Extensions**
   The architecture is designed to accommodate future privacy-enhancing technologies as the platform scales.

5. **Quantum-Resistant Crypto**
   - Post-quantum algorithms
   - Hybrid approach
   - Migration strategy

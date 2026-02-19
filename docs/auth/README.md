# Authentication System Documentation

## Overview

BitTasker's authentication system is built on a foundation of **passkey-based authentication** with dual login methods. The system prioritizes security through client-side encryption, uses Web Crypto API for all cryptographic operations, and integrates seamlessly with both Web Authentication (WebAuthn) on web browsers and native biometric authentication on mobile devices.

### Core Principles

1. **Client-Side Encryption**: All sensitive data (Nostr private keys, wallet mnemonics) is encrypted on the client before storage
2. **Passkey-Based Authentication**: Primary authentication method using WebAuthn/biometric authentication
3. **Zero Server Access to Keys**: Server never sees unencrypted private keys or mnemonics
4. **Cross-Platform Support**: Works on web browsers (WebAuthn) and mobile devices (native biometrics)
5. **Dual Login Methods**: Support for both passkey login (existing users) and nsec login (new/existing users)

## Table of Contents

1. [Architecture Overview](./architecture.md)
2. [Authentication Flows](./flows.md)
3. [Encryption & Key Management](./encryption.md)
4. [API Endpoints](./api-endpoints.md)
5. [Client Implementation](./client-implementation.md)
6. [Security Model](./security.md)
7. [Recovery System](./recovery.md)
8. [Migration & Legacy Support](./migration.md)

## Quick Start

### For Developers

To understand the authentication system:

1. Start with [Architecture Overview](./architecture.md) to understand the high-level design
2. Read [Authentication Flows](./flows.md) to see how login works
3. Review [Encryption & Key Management](./encryption.md) for security details
4. Check [Client Implementation](./client-implementation.md) for code examples

### For Security Auditors

Priority reading order:

1. [Security Model](./security.md) - Threat model and security guarantees
2. [Encryption & Key Management](./encryption.md) - Cryptographic implementation
3. [Architecture Overview](./architecture.md) - System design
4. [Recovery System](./recovery.md) - Account recovery mechanisms

## Key Features

### 1. Dual Login Methods

#### Passkey Login

- For users with existing accounts
- Uses WebAuthn on web browsers
- Uses native biometric authentication on mobile
- No password required
- Encrypted keys stored in secure biometric storage

#### Nsec Login

- For new users or existing users without passkey
- Creates account if doesn't exist
- Automatically sets up passkey for future logins
- Supports QR code scanning on mobile
- Derives deterministic wallet from Nostr key

### 2. Encryption Architecture

```
User's Data
├── Nostr Private Key (nsec)
│   ├── Used for signing Nostr events
│   └── Used as master password for encryption
└── Wallet Mnemonic
    ├── BIP39 12-word phrase
    └── Deterministically derived from nsec (for new users)

Encryption Layers
├── Master Key
│   ├── Derived from nsec using PBKDF2
│   ├── 100,000 iterations
│   └── 16-byte salt
├── Context-Specific Keys (HKDF)
│   ├── Nostr Key (for nsec encryption)
│   └── Wallet Key (for mnemonic encryption)
└── Storage
    ├── Exported master key → Biometric storage
    └── Encrypted data → Server storage
```

### 3. Platform Support

#### Web Browsers

- WebAuthn API for passkey management
- Web Crypto API for encryption
- localStorage for caching
- Service workers for offline support

#### Mobile Devices (iOS & Android)

- Capacitor Native Biometric plugin
- Platform-specific biometric APIs
- Secure enclave storage
- Capacitor Preferences for caching

### 4. Security Features

- **Client-side encryption**: All encryption happens on the device
- **Zero-knowledge architecture**: Server never sees unencrypted keys
- **Biometric authentication**: Hardware-backed security on supported devices
- **Challenge-response authentication**: Prevents replay attacks
- **Recovery system**: Email-based recovery with encrypted backup
- **Key rotation**: Support for passkey migration and updates

## System Components

### Frontend Components

| Component          | Purpose                      | Location                 |
| ------------------ | ---------------------------- | ------------------------ |
| `auth.service.ts`  | API communication            | `src/lib/api/services/`  |
| `auth.ts`          | Master key encryption        | `src/lib/utils/helpers/` |
| `crypto.ts`        | Core cryptographic functions | `src/lib/utils/helpers/` |
| `encoding.ts`      | Data encoding utilities      | `src/lib/utils/helpers/` |
| `biometrics.ts`    | Mobile biometric integration | `src/lib/utils/helpers/` |
| `webBiometrics.ts` | Web WebAuthn integration     | `src/lib/utils/helpers/` |
| `nostrKeys.ts`     | Key retrieval with caching   | `src/lib/utils/`         |

### UI Components

| Component    | Purpose                   | Location                         |
| ------------ | ------------------------- | -------------------------------- |
| Login Page   | Main authentication entry | `src/routes/auth/login/`         |
| PasskeySetup | Onboarding passkey setup  | `src/lib/components/onboarding/` |
| AccRecovery  | Account recovery UI       | `src/lib/components/settings/`   |

### Backend Endpoints

All endpoints are defined in `src/lib/api/endpoints.ts`:

| Endpoint                                    | Method | Purpose                        |
| ------------------------------------------- | ------ | ------------------------------ |
| `/api/v1/auth/challenge`                    | GET    | Get authentication challenge   |
| `/api/v1/auth/register`                     | POST   | Register new user              |
| `/api/v1/auth/login/passkey`                | POST   | Login with passkey             |
| `/api/v1/auth/login/nostr`                  | POST   | Login/register with nsec       |
| `/api/v1/auth/login/passkey/encrypted-data` | POST   | Get encrypted data for passkey |
| `/api/v1/auth/login/nostr/encrypted-data`   | POST   | Get encrypted data for nsec    |
| `/api/v1/auth/recovery/*`                   | POST   | Recovery endpoints             |

## Authentication Lifecycle

### 1. Registration (Nsec Login - New User)

```
User Input (nsec)
    ↓
Generate/Derive Keys
    ├── Derive wallet mnemonic from nsec (deterministic)
    └── Extract public key (npub) from nsec
    ↓
Encrypt Master Key Data
    ├── Master key from nsec + salt (PBKDF2)
    ├── Derive context keys (HKDF)
    ├── Encrypt nsec with nostr context key
    └── Encrypt mnemonic with wallet context key
    ↓
Setup Passkey
    ├── Create WebAuthn credential (web)
    │   └── Store: npub + exportedKey in userHandle
    └── Create Native Biometric credential (mobile)
        └── Store: npub + exportedKey in secure storage
    ↓
Register with Server
    ├── Send: publicKey, encryptedData, credentialId
    ├── Receive: access_token, user data
    └── Mark as new user (isNewUser: true)
    ↓
Setup Auth State
    ├── Store biometricData in memory
    ├── Cache npub in localStorage
    └── Navigate to onboarding
```

### 2. Login (Passkey - Existing User)

```
User Initiates Login
    ↓
Authenticate with Passkey
    ├── Web: navigator.credentials.get() [WebAuthn]
    └── Mobile: NativeBiometric.verifyIdentity()
    ↓
Retrieve Credentials
    ├── Extract npub from credential
    ├── Extract exportedKey from credential
    ├── Get challenge and response
    └── Get credentialId
    ↓
Send to Server
    ├── POST /api/v1/auth/login/passkey
    ├── Verify credential signature
    ├── Check for legacy format
    └── Return: encryptedData, access_token, user, isLegacy
    ↓
Decrypt Keys
    ├── Import master key from exportedKey
    ├── Derive context keys (HKDF)
    ├── Decrypt nsec
    └── Decrypt mnemonic
    ↓
Handle Migration (if isLegacy)
    ├── Re-encrypt with new format
    └── Update server with new encrypted data
    ↓
Setup Auth State
    ├── Store biometricData in memory
    ├── Cache npub in localStorage
    └── Navigate to dashboard
```

### 3. Login (Nsec - Existing User)

```
User Input (nsec)
    ↓
Sign Challenge
    ├── Get challenge from server
    ├── Sign with nsec (Nostr event kind 22242)
    └── Include relay and challenge tags
    ↓
Check Account Existence
    ├── POST /api/v1/auth/login/nostr/encrypted-data
    └── Returns: encryptedData (if exists) or null
    ↓
Decrypt/Generate Wallet
    ├── If account exists:
    │   ├── Derive master key from nsec + masterSalt
    │   ├── Decrypt wallet mnemonic
    │   └── Use existing mnemonic
    └── If new account:
        └── Derive new wallet mnemonic (deterministic)
    ↓
Encrypt Master Key Data
    ├── Create new encryption with nsec
    └── Export master key
    ↓
Setup Passkey (Optional)
    ├── Skip in test environments
    ├── Web: Create WebAuthn credential
    └── Mobile: Create Native Biometric credential
    ↓
Login/Register with Server
    ├── POST /api/v1/auth/login/nostr
    ├── Include: signedEvent, encryptedData, credentialData
    └── Server creates user if doesn't exist
    ↓
Handle Migration (if isMigrated)
    └── Show migration modal to user
    ↓
Setup Auth State
    └── Navigate based on isNewUser flag
```

## Data Structures

### EncryptedData Structure

```typescript
interface EncryptedData {
	nostr: ContextEncryption; // Encrypted nsec
	wallet: ContextEncryption; // Encrypted mnemonic
	masterSalt: string; // Base64 master salt
}

interface ContextEncryption {
	encrypted: CryptoEncryptedData;
	salt: string; // Base64 context salt
	iterations: number; // PBKDF2 iterations (100000)
}

interface CryptoEncryptedData {
	data: string; // Base64 ciphertext
	iv: string; // Base64 initialization vector
	authTag: string; // Base64 authentication tag
}
```

### Biometric Data Structure

```typescript
interface BiometricData {
	npub: string; // Nostr public key (hex)
	exportedKey: string; // Base64 exported master key
	encryptedData: EncryptedData; // Encrypted nsec + mnemonic
}
```

### Credential Data Structure

```typescript
interface Credentials {
	npub: string; // Public key
	exportedKey: string; // Exported master key
	challenge: string; // Authentication challenge
	credentialId: string; // Passkey credential ID
	response: {
		// WebAuthn response
		clientDataJSON: string;
		authenticatorData: string;
		signature: string;
		userHandle: string;
	};
}
```

## Key Retrieval Optimization

The system uses a three-tier caching strategy to minimize latency and avoid unnecessary biometric prompts:

### Tier 1: Memory Cache (appStore)

- **Fastest**: No I/O operations
- **Scope**: Current session only
- **Storage**: In-memory Svelte store
- **Contains**: npub, nsec, mnemonic

### Tier 2: Local Storage Cache (Preferences)

- **Fast**: Local I/O only
- **Scope**: Persistent across sessions
- **Storage**: localStorage (web) or Capacitor Preferences (mobile)
- **Contains**: npub only (non-sensitive)

### Tier 3: Biometric Authentication

- **Slowest**: Requires user interaction
- **Scope**: On-demand when cache miss
- **Storage**: Secure enclave (mobile) or WebAuthn (web)
- **Contains**: Full encrypted credentials

### Retrieval Functions

```typescript
// Get public key only (fastest path)
getNpub()
  → Check memory → Check localStorage → Prompt biometric

// Get key pair (nsec + npub)
getNostrKeyPair()
  → Check memory → Prompt biometric + decrypt

// Get all keys (nsec + npub + mnemonic)
getAllKeys()
  → Check memory → Prompt biometric + decrypt master data
```

## Security Considerations

### Threat Model

**Protected Against:**

- ✅ Server compromise (keys never leave client unencrypted)
- ✅ Network interception (encrypted data in transit)
- ✅ Phishing (WebAuthn origin binding)
- ✅ Replay attacks (challenge-response authentication)
- ✅ Brute force (PBKDF2 with 100k iterations)
- ✅ Memory dumps (keys only in memory during use)

**Requires Trust In:**

- 🔒 Client device security (OS, hardware)
- 🔒 Biometric security (secure enclave)
- 🔒 Web Crypto API implementation
- 🔒 Browser/OS WebAuthn implementation

### Best Practices

1. **Key Material Handling**
   - Keys are only decrypted when needed
   - Keys are cleared from memory after use (where possible)
   - Never log or display full keys

2. **Error Handling**
   - Generic error messages to users
   - Detailed errors logged (not displayed)
   - No sensitive data in error messages

3. **Session Management**
   - Access tokens expire
   - Biometric re-authentication for sensitive operations
   - Cache invalidation on logout

4. **Recovery**
   - Email-based recovery with OTP
   - Recovery data remains encrypted
   - Recovery password is separate from login credentials

## Testing

### Unit Tests

- Encryption/decryption functions
- Key derivation
- Data encoding
- Error handling

### Integration Tests

- Login flows
- Registration flows
- Key retrieval
- Cache invalidation

### E2E Tests

- Complete registration journey
- Passkey login
- Nsec login
- Account recovery
- Cross-device scenarios

## Future Enhancements

- [ ] Multi-device passkey sync
- [ ] Hardware security key support
- [ ] Biometric re-authentication timeout
- [ ] Key rotation mechanisms
- [ ] Social recovery options
- [ ] Passkey revocation UI
- [ ] Audit logging
- [ ] Advanced threat detection

## Related Documentation

- [Encryption & Key Management](./encryption.md) - Detailed cryptographic implementation
- [Authentication Flows](./flows.md) - Visual flow diagrams
- [API Endpoints](./api-endpoints.md) - Complete endpoint documentation
- [Security Model](./security.md) - Threat analysis and security guarantees
- [Recovery System](./recovery.md) - Account recovery implementation

## Support

For questions or issues with the authentication system:

1. Check this documentation
2. Review related docs in this directory
3. Check implementation in source files
4. Consult security team for sensitive issues

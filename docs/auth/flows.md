# Authentication Flows

This document provides detailed visual representations of all authentication flows in BitTasker's system.

## Table of Contents

1. [Registration Flow (Nsec Login - New User)](#registration-flow-nsec-login---new-user)
2. [Login Flow (Passkey - Existing User)](#login-flow-passkey---existing-user)
3. [Login Flow (Nsec - Existing User)](#login-flow-nsec---existing-user)
4. [Login Flow (Nsec - New User)](#login-flow-nsec---new-user)
5. [Account Recovery Flow](#account-recovery-flow)
6. [Passkey Migration Flow](#passkey-migration-flow)
7. [Key Retrieval Flows](#key-retrieval-flows)

---

## Registration Flow (Nsec Login - New User)

### Overview

This flow handles new user registration when they provide their Nostr private key (nsec). The system derives a deterministic wallet mnemonic and sets up passkey authentication.

### Flow Diagram

```
┌────────────────────────────────────────────────────────────────────────┐
│                              USER ACTIONS                               │
└────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                     ┌──────────────────────────┐
                     │   User clicks           │
                     │   "Login with Nsec"     │
                     └──────────────────────────┘
                                    │
                                    ▼
                     ┌──────────────────────────┐
                     │   User enters nsec      │
                     │   (or scans QR code)    │
                     └──────────────────────────┘
                                    │
┌────────────────────────────────────────────────────────────────────────┐
│                          CLIENT PROCESSING                              │
└────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                     ┌──────────────────────────┐
                     │  Validate nsec format   │
                     │  - Check prefix (nsec1) │
                     │  - Decode with nip19    │
                     └──────────────────────────┘
                                    │
                                    ▼
                     ┌──────────────────────────┐
                     │  Extract public key     │
                     │  npub = getPublicKey()  │
                     └──────────────────────────┘
                                    │
┌────────────────────────────────────────────────────────────────────────┐
│                      CHALLENGE-RESPONSE AUTH                            │
└────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                ┌─────────────────────────────────────┐
                │  GET /api/v1/auth/challenge        │
                │  ← Returns: { challenge, message } │
                └─────────────────────────────────────┘
                                    │
                                    ▼
                     ┌──────────────────────────┐
                     │  Sign challenge         │
                     │  with nsec              │
                     │  (Nostr event kind      │
                     │   22242)                │
                     └──────────────────────────┘
                                    │
                                    ▼
                ┌─────────────────────────────────────┐
                │  POST /api/v1/auth/login/nostr/    │
                │  encrypted-data                    │
                │  → { event: signedEvent }          │
                │  ← { encryptedData: null }         │
                │     (user doesn't exist)           │
                └─────────────────────────────────────┘
                                    │
┌────────────────────────────────────────────────────────────────────────┐
│                       WALLET GENERATION                                 │
└────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                     ┌──────────────────────────┐
                     │  Derive wallet mnemonic │
                     │  (deterministic from    │
                     │   nsec)                 │
                     │                         │
                     │  1. SHA-256(nsec)       │
                     │  2. Take first 16 bytes │
                     │  3. Convert to BIP39    │
                     │  4. Generate 12 words   │
                     └──────────────────────────┘
                                    │
┌────────────────────────────────────────────────────────────────────────┐
│                     MASTER KEY ENCRYPTION                               │
└────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                     ┌──────────────────────────┐
                     │  Generate master salt   │
                     │  (16 random bytes)      │
                     └──────────────────────────┘
                                    │
                                    ▼
                     ┌──────────────────────────┐
                     │  Derive master key      │
                     │  PBKDF2(nsec, salt,     │
                     │         100k iterations)│
                     └──────────────────────────┘
                                    │
                                    ▼
                     ┌──────────────────────────┐
                     │  Generate context salts │
                     │  - nostrSalt (16 bytes) │
                     │  - walletSalt (16 bytes)│
                     └──────────────────────────┘
                                    │
                                    ▼
                     ┌──────────────────────────┐
                     │  Derive context keys    │
                     │  - nostrKey = HKDF(     │
                     │    master, "nostr",     │
                     │    nostrSalt)           │
                     │  - walletKey = HKDF(    │
                     │    master, "wallet",    │
                     │    walletSalt)          │
                     └──────────────────────────┘
                                    │
                                    ▼
                     ┌──────────────────────────┐
                     │  Encrypt data (AES-GCM) │
                     │  - Encrypt nsec with    │
                     │    nostrKey             │
                     │  - Encrypt mnemonic     │
                     │    with walletKey       │
                     └──────────────────────────┘
                                    │
                                    ▼
                     ┌──────────────────────────┐
                     │  Export master key      │
                     │  (base64 format for     │
                     │   passkey storage)      │
                     └──────────────────────────┘
                                    │
┌────────────────────────────────────────────────────────────────────────┐
│                       PASSKEY CREATION                                  │
└────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                     ┌──────────────────────────┐
                     │  Detect platform        │
                     │  - Web: WebAuthn        │
                     │  - Mobile: Native       │
                     │           Biometric     │
                     └──────────────────────────┘
                                    │
                 ┌──────────────────┴──────────────────┐
                 │                                      │
                 ▼                                      ▼
    ┌────────────────────────┐          ┌────────────────────────┐
    │   WEB: WebAuthn        │          │   MOBILE: Biometric    │
    │                        │          │                        │
    │  1. Generate challenge │          │  1. Generate challenge │
    │  2. Pack credentials:  │          │  2. Pack credentials:  │
    │     - npub (32 bytes)  │          │     - npub + exportedKey│
    │     - exportedKey      │          │       (base64url)      │
    │       (32 bytes)       │          │  3. Store in secure    │
    │  3. Create credential  │          │     enclave:           │
    │     with packed data   │          │     NativeBiometric    │
    │     as userHandle      │          │     .setCredentials()  │
    │  4. Get credential ID  │          │  4. Verify creation    │
    │  5. Get public key     │          │  5. Get credential ID  │
    │  6. Get attestation    │          │                        │
    └────────────────────────┘          └────────────────────────┘
                 │                                      │
                 └──────────────────┬──────────────────┘
                                    │
                                    ▼
                     ┌──────────────────────────┐
                     │  Credential created     │
                     │  - credentialId         │
                     │  - passkeyPubkey        │
                     │  - clientDataJSON       │
                     │  - attestationObject    │
                     │  - challenge            │
                     └──────────────────────────┘
                                    │
┌────────────────────────────────────────────────────────────────────────┐
│                     SERVER REGISTRATION                                 │
└────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                     ┌──────────────────────────┐
                     │  Sign new challenge     │
                     │  (for registration)     │
                     └──────────────────────────┘
                                    │
                                    ▼
                ┌─────────────────────────────────────┐
                │  POST /api/v1/auth/login/nostr     │
                │  {                                  │
                │    event: signedEvent,              │
                │    challenge: challenge,            │
                │    authMethod: "passkey",           │
                │    deviceId: deviceId,              │
                │    encryptedData: {                 │
                │      nostr: {...},                  │
                │      wallet: {...},                 │
                │      masterSalt: "..."              │
                │    },                               │
                │    credentialId: "...",             │
                │    passkeyPubkey: "...",            │
                │    clientDataJSON: "...",           │
                │    attestationObject: "...",        │
                │    deviceName: "...",               │
                │    platform: "web|mobile",          │
                │    appVersion: "1.0.0"              │
                │  }                                  │
                └─────────────────────────────────────┘
                                    │
                                    ▼
                ┌─────────────────────────────────────┐
                │       SERVER PROCESSING             │
                │                                     │
                │  1. Verify Nostr signature         │
                │  2. Verify passkey attestation     │
                │  3. Create user account            │
                │  4. Store encrypted data           │
                │  5. Store credential info          │
                │  6. Generate access token          │
                └─────────────────────────────────────┘
                                    │
                                    ▼
                ┌─────────────────────────────────────┐
                │  Response:                          │
                │  {                                  │
                │    access_token: "...",             │
                │    user: {...},                     │
                │    isNewUser: true,                 │
                │    isMigrated: false                │
                │  }                                  │
                └─────────────────────────────────────┘
                                    │
┌────────────────────────────────────────────────────────────────────────┐
│                      CLIENT STATE SETUP                                 │
└────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                     ┌──────────────────────────┐
                     │  Store in appStore      │
                     │  - biometricData:       │
                     │    * npub               │
                     │    * exportedKey        │
                     │    * encryptedData      │
                     │  - nostrKeys:           │
                     │    * npub (cached)      │
                     └──────────────────────────┘
                                    │
                                    ▼
                     ┌──────────────────────────┐
                     │  Store in localStorage  │
                     │  - NPUB: npub           │
                     └──────────────────────────┘
                                    │
                                    ▼
                     ┌──────────────────────────┐
                     │  Setup authState        │
                     │  - access_token         │
                     │  - user data            │
                     │  - auth method          │
                     └──────────────────────────┘
                                    │
┌────────────────────────────────────────────────────────────────────────┐
│                           NAVIGATION                                    │
└────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                     ┌──────────────────────────┐
                     │  Navigate to            │
                     │  /auth/onboarding       │
                     │  (complete profile)     │
                     └──────────────────────────┘
```

### Key Points

1. **Account doesn't exist**: Determined by `encryptedData: null` from server
2. **Deterministic wallet**: Mnemonic always the same for a given nsec
3. **Passkey setup**: Happens during registration, not a separate step
4. **Double signing**: Once to check existence, once for registration
5. **No password**: Only biometric/passkey for future logins

---

## Login Flow (Passkey - Existing User)

### Overview

This flow handles login for existing users using their stored passkey credentials. The fastest and most secure login method.

### Flow Diagram

```
┌────────────────────────────────────────────────────────────────────────┐
│                              USER ACTIONS                               │
└────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                     ┌──────────────────────────┐
                     │   User clicks           │
                     │   "Continue with        │
                     │    Passkey"             │
                     └──────────────────────────┘
                                    │
┌────────────────────────────────────────────────────────────────────────┐
│                    BIOMETRIC AUTHENTICATION                             │
└────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                     ┌──────────────────────────┐
                     │  Detect platform        │
                     │  - Web: WebAuthn        │
                     │  - Mobile: Native       │
                     │           Biometric     │
                     └──────────────────────────┘
                                    │
                 ┌──────────────────┴──────────────────┐
                 │                                      │
                 ▼                                      ▼
    ┌────────────────────────┐          ┌────────────────────────┐
    │   WEB: WebAuthn        │          │   MOBILE: Biometric    │
    │                        │          │                        │
    │  1. Generate challenge │          │  1. Prompt biometric   │
    │  2. Request credential:│          │     authentication     │
    │     navigator          │          │  2. Verify identity    │
    │     .credentials.get() │          │  3. Get credentials    │
    │  3. User authenticates │          │     from secure        │
    │     (FaceID, TouchID,  │          │     storage            │
    │     fingerprint, etc.) │          │  4. Get WebAuthn       │
    │  4. Receive credential │          │     response           │
    │  5. Extract userHandle │          │                        │
    │  6. Unpack:            │          │                        │
    │     - npub             │          │                        │
    │     - exportedKey      │          │                        │
    └────────────────────────┘          └────────────────────────┘
                 │                                      │
                 └──────────────────┬──────────────────┘
                                    │
                                    ▼
                     ┌──────────────────────────┐
                     │  Credentials retrieved  │
                     │  - npub                 │
                     │  - exportedKey          │
                     │  - challenge            │
                     │  - credentialId         │
                     │  - response:            │
                     │    * clientDataJSON     │
                     │    * authenticatorData  │
                     │    * signature          │
                     │    * userHandle         │
                     └──────────────────────────┘
                                    │
┌────────────────────────────────────────────────────────────────────────┐
│                     SERVER AUTHENTICATION                               │
└────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                     ┌──────────────────────────┐
                     │  Get device info        │
                     │  - deviceId             │
                     │  - deviceName           │
                     │  - platform             │
                     │  - appVersion           │
                     └──────────────────────────┘
                                    │
                                    ▼
                ┌─────────────────────────────────────┐
                │  POST /api/v1/auth/login/passkey   │
                │  {                                  │
                │    npub: "...",                     │
                │    challenge: "...",                │
                │    credentialId: "...",             │
                │    deviceId: "...",                 │
                │    deviceName: "...",               │
                │    platform: "web|mobile",          │
                │    response: {                      │
                │      clientDataJSON: "...",         │
                │      authenticatorData: "...",      │
                │      signature: "...",              │
                │      userHandle: "..."              │
                │    },                               │
                │    appVersion: "1.0.0"              │
                │  }                                  │
                └─────────────────────────────────────┘
                                    │
                                    ▼
                ┌─────────────────────────────────────┐
                │       SERVER PROCESSING             │
                │                                     │
                │  1. Lookup user by npub            │
                │  2. Verify credential signature    │
                │  3. Validate challenge             │
                │  4. Check credential exists        │
                │  5. Check device authorization     │
                │  6. Retrieve encrypted data        │
                │  7. Check format (legacy/new)      │
                │  8. Generate access token          │
                └─────────────────────────────────────┘
                                    │
                                    ▼
                ┌─────────────────────────────────────┐
                │  Response:                          │
                │  {                                  │
                │    user: {...},                     │
                │    access_token: "...",             │
                │    isLegacy: false,                 │
                │    encryptedData: {                 │
                │      nostr: {...},                  │
                │      wallet: {...},                 │
                │      masterSalt: "..."              │
                │    }                                │
                │  }                                  │
                └─────────────────────────────────────┘
                                    │
┌────────────────────────────────────────────────────────────────────────┐
│                       LEGACY FORMAT CHECK                               │
└────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                     ┌──────────────────────────┐
                     │  Check isLegacy flag    │
                     └──────────────────────────┘
                                    │
                 ┌──────────────────┴──────────────────┐
                 │                                      │
                 ▼                                      ▼
    ┌────────────────────────┐          ┌────────────────────────┐
    │   LEGACY FORMAT        │          │   NEW FORMAT           │
    │                        │          │                        │
    │  1. Decrypt with       │          │  1. Import master key  │
    │     legacy format      │          │     from exportedKey   │
    │  2. Get nsec & mnemonic│          │  2. Derive context keys│
    │  3. Migrate to new     │          │     (HKDF)             │
    │     format:            │          │  3. Decrypt nsec       │
    │     - Re-encrypt       │          │  4. Decrypt mnemonic   │
    │     - Update server    │          │                        │
    │  4. Show migration     │          │                        │
    │     notice             │          │                        │
    └────────────────────────┘          └────────────────────────┘
                 │                                      │
                 └──────────────────┬──────────────────┘
                                    │
┌────────────────────────────────────────────────────────────────────────┐
│                      DECRYPTION COMPLETE                                │
└────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                     ┌──────────────────────────┐
                     │  Keys decrypted         │
                     │  - nsec (hex)           │
                     │  - npub (hex)           │
                     │  - mnemonic (12 words)  │
                     └──────────────────────────┘
                                    │
┌────────────────────────────────────────────────────────────────────────┐
│                      CLIENT STATE SETUP                                 │
└────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                     ┌──────────────────────────┐
                     │  Store in appStore      │
                     │  - biometricData:       │
                     │    * npub               │
                     │    * exportedKey        │
                     │    * encryptedData      │
                     │  - nostrKeys:           │
                     │    * npub (cached)      │
                     │    * nsec (in memory)   │
                     │    * mnemonic (in       │
                     │      memory)            │
                     └──────────────────────────┘
                                    │
                                    ▼
                     ┌──────────────────────────┐
                     │  Store in localStorage  │
                     │  - NPUB: npub           │
                     └──────────────────────────┘
                                    │
                                    ▼
                     ┌──────────────────────────┐
                     │  Setup authState        │
                     │  - access_token         │
                     │  - user data            │
                     │  - auth method: passkey │
                     └──────────────────────────┘
                                    │
┌────────────────────────────────────────────────────────────────────────┐
│                           NAVIGATION                                    │
└────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                     ┌──────────────────────────┐
                     │  Navigate to            │
                     │  /dashboard             │
                     └──────────────────────────┘
```

### Key Points

1. **Single prompt**: User only sees one biometric prompt
2. **Secure unpacking**: Credentials extracted from secure storage
3. **Legacy support**: Automatic migration for old format
4. **No password**: Purely biometric authentication
5. **Fast access**: Encrypted data comes from server (not re-encrypted)

---

## Login Flow (Nsec - Existing User)

### Overview

This flow handles login for existing users using their Nostr private key. Creates a passkey if one doesn't exist yet.

### Flow Diagram

```
┌────────────────────────────────────────────────────────────────────────┐
│                              USER ACTIONS                               │
└────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                     ┌──────────────────────────┐
                     │   User enters nsec      │
                     │   (or scans QR code)    │
                     └──────────────────────────┘
                                    │
┌────────────────────────────────────────────────────────────────────────┐
│                      CHALLENGE-RESPONSE AUTH                            │
└────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                ┌─────────────────────────────────────┐
                │  GET /api/v1/auth/challenge        │
                │  ← Returns: { challenge, message } │
                └─────────────────────────────────────┘
                                    │
                                    ▼
                     ┌──────────────────────────┐
                     │  Sign challenge         │
                     │  with nsec              │
                     └──────────────────────────┘
                                    │
                                    ▼
                ┌─────────────────────────────────────┐
                │  POST /api/v1/auth/login/nostr/    │
                │  encrypted-data                    │
                │  → { event: signedEvent }          │
                │  ← { encryptedData: {...} }        │
                │     (user exists!)                 │
                └─────────────────────────────────────┘
                                    │
┌────────────────────────────────────────────────────────────────────────┐
│                    DECRYPT EXISTING WALLET                              │
└────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                     ┌──────────────────────────┐
                     │  Extract masterSalt     │
                     │  from encryptedData     │
                     └──────────────────────────┘
                                    │
                                    ▼
                     ┌──────────────────────────┐
                     │  Derive master key      │
                     │  from nsec + masterSalt │
                     │  (PBKDF2, 100k iter)    │
                     └──────────────────────────┘
                                    │
                                    ▼
                     ┌──────────────────────────┐
                     │  Export master key      │
                     │  (for comparison/use)   │
                     └──────────────────────────┘
                                    │
                                    ▼
                     ┌──────────────────────────┐
                     │  Decrypt wallet data    │
                     │  - Get mnemonic         │
                     └──────────────────────────┘
                                    │
┌────────────────────────────────────────────────────────────────────────┐
│                   RE-ENCRYPT (for passkey setup)                        │
└────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                     ┌──────────────────────────┐
                     │  Create new encryption  │
                     │  - Generate new salts   │
                     │  - Derive keys          │
                     │  - Encrypt nsec         │
                     │  - Encrypt mnemonic     │
                     │  - Export new master key│
                     └──────────────────────────┘
                                    │
┌────────────────────────────────────────────────────────────────────────┐
│                    PASSKEY SETUP (Optional)                             │
└────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                     ┌──────────────────────────┐
                     │  Check if test env      │
                     │  (skip passkey in tests)│
                     └──────────────────────────┘
                                    │
                         ┌──────────┴──────────┐
                         │                      │
                         ▼                      ▼
              ┌────────────────┐    ┌────────────────────┐
              │  Test Env      │    │  Production Env    │
              │  Skip passkey  │    │  Create passkey    │
              └────────────────┘    │  (same as          │
                         │          │   registration)    │
                         │          └────────────────────┘
                         │                      │
                         └──────────┬──────────┘
                                    │
                                    ▼
                     ┌──────────────────────────┐
                     │  Credential data        │
                     │  collected              │
                     └──────────────────────────┘
                                    │
┌────────────────────────────────────────────────────────────────────────┐
│                     SERVER LOGIN/UPDATE                                 │
└────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                     ┌──────────────────────────┐
                     │  Sign new challenge     │
                     │  (with new credential)  │
                     └──────────────────────────┘
                                    │
                                    ▼
                ┌─────────────────────────────────────┐
                │  POST /api/v1/auth/login/nostr     │
                │  {                                  │
                │    event: signedEvent,              │
                │    challenge: challenge,            │
                │    authMethod: "passkey",           │
                │    deviceId: deviceId,              │
                │    encryptedData: {...},            │
                │    credentialId: "...",             │
                │    passkeyPubkey: "...",            │
                │    clientDataJSON: "...",           │
                │    attestationObject: "...",        │
                │    deviceName: "...",               │
                │    platform: "web|mobile",          │
                │    appVersion: "1.0.0"              │
                │  }                                  │
                └─────────────────────────────────────┘
                                    │
                                    ▼
                ┌─────────────────────────────────────┐
                │       SERVER PROCESSING             │
                │                                     │
                │  1. Verify Nostr signature         │
                │  2. Find existing user             │
                │  3. Add/update passkey credential  │
                │  4. Update encrypted data          │
                │  5. Check if migrated              │
                │  6. Generate access token          │
                └─────────────────────────────────────┘
                                    │
                                    ▼
                ┌─────────────────────────────────────┐
                │  Response:                          │
                │  {                                  │
                │    access_token: "...",             │
                │    user: {...},                     │
                │    isNewUser: false,                │
                │    isMigrated: boolean              │
                │  }                                  │
                └─────────────────────────────────────┘
                                    │
┌────────────────────────────────────────────────────────────────────────┐
│                      MIGRATION CHECK                                    │
└────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                     ┌──────────────────────────┐
                     │  Check isMigrated flag  │
                     └──────────────────────────┘
                                    │
                         ┌──────────┴──────────┐
                         │                      │
                         ▼                      ▼
              ┌────────────────┐    ┌────────────────────┐
              │  Not Migrated  │    │  Migrated          │
              │  Continue      │    │  Show modal:       │
              └────────────────┘    │  "Passkey has been │
                         │          │   migrated. Old    │
                         │          │   passkeys         │
                         │          │   revoked."        │
                         │          │  Wait for user     │
                         │          │  acknowledgment    │
                         │          └────────────────────┘
                         │                      │
                         └──────────┬──────────┘
                                    │
┌────────────────────────────────────────────────────────────────────────┐
│                      CLIENT STATE SETUP                                 │
└────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                     ┌──────────────────────────┐
                     │  Store in appStore      │
                     │  - biometricData        │
                     │  - nostrKeys            │
                     └──────────────────────────┘
                                    │
                                    ▼
                     ┌──────────────────────────┐
                     │  Setup authState        │
                     │  - access_token         │
                     │  - user data            │
                     └──────────────────────────┘
                                    │
                                    ▼
                     ┌──────────────────────────┐
                     │  Navigate to            │
                     │  /dashboard             │
                     └──────────────────────────┘
```

### Key Points

1. **Account exists**: Determined by receiving `encryptedData` from server
2. **Decrypt then re-encrypt**: Must decrypt existing wallet, then re-encrypt for new passkey
3. **Optional passkey**: In test environments, passkey setup is skipped
4. **Migration notice**: If passkey was migrated, user sees informational modal
5. **Direct to dashboard**: Existing user goes straight to dashboard (not onboarding)

---

## Key Retrieval Flows

### Overview

The system uses a three-tier caching strategy to minimize latency and biometric prompts.

### getNpub() Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                         getNpub()                                │
│                   (Get Public Key Only)                          │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
                  ┌──────────────────┐
                  │ Check Tier 1:    │
                  │ Memory (appStore)│
                  │ nostrKeys.npub   │
                  └──────────────────┘
                            │
                    ┌───────┴───────┐
                    │               │
                  HIT             MISS
                    │               │
                    │               ▼
                    │     ┌──────────────────┐
                    │     │ Check Tier 2:    │
                    │     │ localStorage     │
                    │     │ NPUB key         │
                    │     └──────────────────┘
                    │               │
                    │       ┌───────┴───────┐
                    │       │               │
                    │     HIT             MISS
                    │       │               │
                    │       │               ▼
                    │       │     ┌──────────────────┐
                    │       │     │ Check Tier 3:    │
                    │       │     │ biometricData    │
                    │       │     │ in appStore      │
                    │       │     └──────────────────┘
                    │       │               │
                    │       │       ┌───────┴───────┐
                    │       │       │               │
                    │       │     HIT             MISS
                    │       │       │               │
                    │       │       │               ▼
                    │       │       │     ┌──────────────────┐
                    │       │       │     │ Tier 4:          │
                    │       │       │     │ Prompt Biometric │
                    │       │       │     │ Authentication   │
                    │       │       │     └──────────────────┘
                    │       │       │               │
                    │       │       │               ▼
                    │       │       │     ┌──────────────────┐
                    │       │       │     │ Get credentials  │
                    │       │       │     │ Extract npub     │
                    │       │       │     └──────────────────┘
                    │       │       │               │
                    └───────┴───────┴───────────────┘
                                    │
                                    ▼
                          ┌──────────────────┐
                          │ Cache Result:    │
                          │ - appStore       │
                          │ - localStorage   │
                          └──────────────────┘
                                    │
                                    ▼
                          ┌──────────────────┐
                          │ Return npub      │
                          └──────────────────┘
```

### getNostrKeyPair() Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     getNostrKeyPair()                            │
│               (Get Public + Private Keys)                        │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
                  ┌──────────────────┐
                  │ Check Tier 1:    │
                  │ Memory (appStore)│
                  │ nostrKeys.nsec   │
                  │ nostrKeys.npub   │
                  └──────────────────┘
                            │
                    ┌───────┴───────┐
                    │               │
                 BOTH            MISSING
                 CACHED            │
                    │               ▼
                    │     ┌──────────────────┐
                    │     │ Check Tier 3:    │
                    │     │ biometricData    │
                    │     │ in appStore      │
                    │     └──────────────────┘
                    │               │
                    │       ┌───────┴───────┐
                    │       │               │
                    │     HIT             MISS
                    │       │               │
                    │       │               ▼
                    │       │     ┌──────────────────┐
                    │       │     │ Tier 4:          │
                    │       │     │ Prompt Biometric │
                    │       │     │ Authentication   │
                    │       │     └──────────────────┘
                    │       │               │
                    │       │               ▼
                    │       │     ┌──────────────────┐
                    │       │     │ Get credentials  │
                    │       │     │ Fetch encrypted  │
                    │       │     │ data from server │
                    │       │     └──────────────────┘
                    │       │               │
                    │       └───────────────┘
                    │               │
                    │               ▼
                    │     ┌──────────────────┐
                    │     │ Decrypt nsec     │
                    │     │ from             │
                    │     │ encryptedData    │
                    │     └──────────────────┘
                    │               │
                    └───────────────┘
                            │
                            ▼
                  ┌──────────────────┐
                  │ Cache Result:    │
                  │ - appStore       │
                  │   * nsec         │
                  │   * npub         │
                  │ - localStorage   │
                  │   * NPUB         │
                  └──────────────────┘
                            │
                            ▼
                  ┌──────────────────┐
                  │ Return           │
                  │ { nsec, npub }   │
                  └──────────────────┘
```

### getAllKeys() Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                       getAllKeys()                               │
│          (Get Public + Private Keys + Mnemonic)                  │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
                  ┌──────────────────┐
                  │ Check Tier 1:    │
                  │ Memory (appStore)│
                  │ nostrKeys.nsec   │
                  │ nostrKeys.npub   │
                  │ nostrKeys.mnemonic│
                  └──────────────────┘
                            │
                    ┌───────┴───────┐
                    │               │
                  ALL            MISSING
                 CACHED            │
                    │               ▼
                    │     ┌──────────────────┐
                    │     │ Check Tier 3:    │
                    │     │ biometricData    │
                    │     │ in appStore      │
                    │     └──────────────────┘
                    │               │
                    │       ┌───────┴───────┐
                    │       │               │
                    │     HIT             MISS
                    │       │               │
                    │       │               ▼
                    │       │     ┌──────────────────┐
                    │       │     │ Tier 4:          │
                    │       │     │ Prompt Biometric │
                    │       │     │ Authentication   │
                    │       │     └──────────────────┘
                    │       │               │
                    │       │               ▼
                    │       │     ┌──────────────────┐
                    │       │     │ Get credentials  │
                    │       │     │ Fetch encrypted  │
                    │       │     │ data from server │
                    │       │     └──────────────────┘
                    │       │               │
                    │       └───────────────┘
                    │               │
                    │               ▼
                    │     ┌──────────────────┐
                    │     │ Decrypt master   │
                    │     │ key data:        │
                    │     │ - nsec           │
                    │     │ - mnemonic       │
                    │     └──────────────────┘
                    │               │
                    └───────────────┘
                            │
                            ▼
                  ┌──────────────────┐
                  │ Cache Result:    │
                  │ - appStore       │
                  │   * nsec         │
                  │   * npub         │
                  │   * mnemonic     │
                  │ - localStorage   │
                  │   * NPUB         │
                  └──────────────────┘
                            │
                            ▼
                  ┌──────────────────┐
                  │ Return           │
                  │ { nsec, npub,    │
                  │   mnemonic }     │
                  └──────────────────┘
```

### Key Points

1. **Progressive retrieval**: Each function only fetches what it needs
2. **Cache hierarchy**: Memory → localStorage → biometricData → Biometric prompt
3. **Minimize prompts**: Once authenticated, keys stay in memory
4. **No localStorage for secrets**: Only public key cached in localStorage
5. **Lazy decryption**: Only decrypt when not in cache

---

## Account Recovery Flow

See [recovery.md](./recovery.md) for detailed account recovery flows.

---

## Passkey Migration Flow

See [migration.md](./migration.md) for detailed migration flows and legacy format handling.

---

## Summary

### Login Method Comparison

| Feature           | Passkey Login | Nsec Login (Existing) | Nsec Login (New)  |
| ----------------- | ------------- | --------------------- | ----------------- |
| Speed             | ⚡ Fastest    | 🐌 Slowest            | 🐢 Slow           |
| Security          | 🔒 Highest    | 🔓 Medium             | 🔓 Medium         |
| User Experience   | 👍 Best       | 👎 Requires input     | 👎 Requires input |
| Biometric Prompts | 1             | 1 (setup)             | 1 (setup)         |
| Server Calls      | 1             | 3+                    | 3+                |
| Encryption Ops    | Decrypt only  | Decrypt + Encrypt     | Encrypt only      |
| Use Case          | Regular login | First login, recovery | Registration      |

### Optimization Tips

1. **Use passkey login** for fastest experience
2. **Cache aggressively** to avoid re-authentication
3. **Batch operations** when multiple keys needed
4. **Clear cache on logout** for security
5. **Handle errors gracefully** with retry mechanisms

### Security Best Practices

1. **Never log full keys** - only log key types or prefixes
2. **Clear memory** after sensitive operations
3. **Validate all inputs** before cryptographic operations
4. **Handle biometric failures** with proper error messages
5. **Implement rate limiting** on authentication attempts

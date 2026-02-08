# BitTasker Authentication Flow (Deep Dive)

This document describes the **passkey + Nostr + master key** authentication system: how keys are generated, derived, encrypted, stored, and used for login and recovery. It maps the conceptual flows to the actual codebase and clarifies what is stored where and in what order things happen.

---

## 1. Overview: What the System Combines

BitTasker authentication ties together:

| Concept | Role |
|--------|------|
| **Nostr** | Identity: key pair (`nsec` / `npub`). Used to sign the login challenge (Schnorr) and for Nostr features (DMs, profile). |
| **Wallet mnemonic** | BIP39 mnemonic for the in-app wallet. Generated once per account and encrypted with the same master-key system. |
| **Device ID** | Stable identifier for the device (hardware ID, or browser fingerprint on web). Used as the “master password” to derive the **master key** (PBKDF2). |
| **Master key** | Single AES-256 key derived from Device ID + master salt. Never stored directly; it is derived on demand and then used to derive **context keys** (HKDF) for Nostr and wallet. |
| **Passkey / Biometrics** | Unlocks the **exported master key** (and npub). On WebAuthn the credential’s `userHandle` holds packed `npub + exportedMasterKey` (64 bytes). On native mobile, the same packed data is stored in secure storage (e.g. Keychain/Keystore) and unlocked by biometrics. |
| **Recovery password** | Optional. A user-chosen password used to encrypt the same master-key payload (nostr + wallet contexts + masterSalt). Stored on the server and used for recovery on a new device. |

So: **one passkey** protects a single **exported master key**; that master key (once derived or imported) is used to derive separate keys that decrypt **nsec** and **wallet mnemonic**. Recovery uses a **recovery password** instead of the device ID to decrypt the same structure.

---

## 2. Key Derivation (Where the “Master Password” Fits)

### 2.1 Constants and contexts

- **Derivation contexts** (HKDF): `src/lib/utils/consts.ts`
  - `NOSTR: 'nostr-key-v1'`
  - `WALLET: 'wallet-mnemonic-v1'`

### 2.2 Master key from Device ID (PBKDF2)

- **Device ID**  
  - Source: `src/lib/utils/helpers/deviceIdentity.ts` → `getDeviceIdentifier()`.  
  - Uses Capacitor `Device.getId()` when available; otherwise OS-specific (e.g. `ios_${model}_${osVersion}`) or `generateBrowserFingerprint()` on web. Stored in Capacitor Preferences under `StorageKeys.DEVICE_UNIQUE_ID` so it is stable for the device.

- **Master key derivation**  
  - `src/lib/utils/helpers/crypto.ts` → `deriveKeyFromPassword(password, salt, iterations)`.  
  - Algorithm: PBKDF2 with SHA-256, 100,000 iterations, output AES-256 key.  
  - Here the “password” is the **device ID** and the salt is the **master salt** (random 16 bytes, stored with the encrypted payload).

### 2.3 Context keys from master key (HKDF)

- **Context keys**  
  - `src/lib/utils/helpers/crypto.ts` → `deriveContextKey(masterKey, context, salt)`.  
  - Uses HKDF-SHA-256: `context` (e.g. `nostr-key-v1`) + `salt` are combined as HKDF salt; master key bytes are the key material; output is a 256-bit AES-GCM key.  
  - Two separate contexts/salts → two independent keys: one for nsec, one for mnemonic.

### 2.4 Encryption of nsec and mnemonic

- **AES-GCM** (IV 12 bytes, auth tag 16 bytes): `src/lib/utils/helpers/crypto.ts` → `encrypt()` / `decrypt()`.  
- High-level API: `src/lib/utils/helpers/auth.ts`:
  - `encryptMasterKeyData(nsec, mnemonic, masterPassword, iterations)`  
    - `masterPassword` = device ID for normal use, or recovery password for recovery blob.  
    - Generates: `masterSalt`, `nostrSalt`, `walletSalt`.  
    - Derives master key from device ID + `masterSalt`, then derives nostr key and wallet key (HKDF + salts).  
    - Encrypts nsec with nostr key, mnemonic with wallet key.  
    - Exports the raw master key as base64 → **exportedMasterKey** (this is what the passkey protects).  
    - Returns: `{ nostr: { encrypted, salt, iterations }, wallet: { encrypted, salt, iterations }, masterSalt, exportedMasterKey }`.

So the “master password” in the bullet points is implemented as **device ID** for normal device storage and as **recovery password** for the optional server-side recovery copy.

---

## 3. What Is Stored Where

### 3.1 Client (this device)

| What | Where | Notes |
|------|--------|------|
| Device ID | Capacitor Preferences (`StorageKeys.DEVICE_UNIQUE_ID`) | Persisted so the same device always gets the same ID. |
| Passkey / biometric secret | **WebAuthn**: credential `userHandle` = packed 64-byte blob. **Native (Capacitor)**: NativeBiometric / Keychain with `username` = user-friendly npub, `password` = JSON `{ keys: packedKeysBase64, credentialId }`, `server` = deviceId. | Packed blob = `npub` (32 bytes hex) + `exportedMasterKey` (32 bytes raw). See `packKeys` / `packKeysMobile` in `src/lib/utils/helpers/encoding.ts`. |
| Auth state | Capacitor Preferences: `ACCESS_TOKEN`, `NPUB`, `AUTH_METHOD`. In-memory: `appStore.biometricData` (Credentials with `username`=npub, `password`=encrypted payload JSON, `server`=deviceId, `isLegacyFormat`). | `password` in Credentials is either legacy (key, iv, authTag, data, salt) or master-key format (key, masterKeyData, …). |

Nothing else sensitive is stored on the client: the **encrypted** nsec and mnemonic live on the **server** (per device or as recovery blob). The client only keeps the device ID, the passkey (which holds npub + exported master key), and the session (JWT + npub).

### 3.2 Server (backend)

| What | Meaning |
|------|--------|
| User + Nostr key row | User account linked to `npub`; `nostrKey` holds encryption metadata and either legacy encrypted nsec or **master key encrypted** payload (nostr + wallet contexts, masterSalt, exportedMasterKey). |
| Per-device data | Device ID, device name, **credential ID** (passkey id). Used to allow passkey login and to return the correct encrypted payload for that device. |
| Recovery data (optional) | For recovery: encrypted payload (nostr + wallet + masterSalt) encrypted with **recovery password** (same `encryptMasterKeyData(nsec, mnemonic, recoveryPassword)`). Sent to backend via `setupAccountRecoveryPassword`; used in recovery flow with email + OTP. |

So: the server stores **encrypted** nsec and mnemonic (either per-device master-key format or legacy nsec-only), and optionally a recovery copy encrypted with the user’s recovery password.

---

## 4. Workflow 1: “Generic Signup” (First-Time Account + Passkey)

In the codebase there is no separate “signup only” page that only generates keys. Account creation happens in two main ways; both end up with the same master-key + passkey model.

### 4A. Login with nsec (first time = signup)

**Entry:** User enters nsec (or scans QR) on login page → `src/routes/auth/login/+page.svelte` → `handleNsecLogin()`.

1. **Challenge**  
   - `authService.getLoginChallenge()` → backend returns a challenge string.

2. **Validate nsec**  
   - `validateNostrPrivateKey(nsec)`; decode with `nip19.decode(nsec)`; get `npub` via `getPublicKey(data)`.

3. **Sign challenge (Nostr event kind 22242)**  
   - Build event: `kind: 22242`, `content: challenge`, `tags: [['relay', origin], ['challenge', challenge]]`, `pubkey: npub`.  
   - `finalizeEvent(event, privateKey)` → signed event; `validateEvent(signedEvent)`.

4. **Device ID**  
   - `getDeviceIdentifier()`.

5. **Wallet mnemonic**  
   - New wallet for (conceptually) new user: `generateMnemonic()` (BIP39).

6. **Master key payload**  
   - `encryptMasterKeyData(nsec, walletMnemonic, deviceId)` → `masterKeyData`.

7. **Login/register with backend**  
   - `authService.loginWithNostr({ event: signedEvent, challenge, authMethod: 'passkey', deviceId, masterKeyData })`.  
   - Backend validates Nostr signature; creates user if new; stores master key encrypted data; returns `access_token`, `user`, `isNewUser`.

8. **Passkey creation**  
   - If existing user and backend already has master-key format, `masterKeyData` can come from `res.user.nostrKey`; otherwise use the one just computed.  
   - Passkey name: `formatPasskeyName(npub, username, nostrDisplayName)` (e.g. `name@bittasker.com`).  
   - **Web**: `setWebBiometricKey(npub, masterKeyData.exportedMasterKey, passkeyName)` → WebAuthn `create()` with `user.id` = `packKeys(npub, exportedMasterKey)` (64 bytes).  
   - **Native**: `setBiometricKey(npub, masterKeyData.exportedMasterKey, 'biometrics', passkeyName)` → same packed data stored via NativeBiometric.  
   - Get `credentialId` from the created credential.

9. **Register device**  
   - `authService.registerPasskeyDevice(npub, deviceId, deviceName, credentialId)`.

10. **Auth state**  
    - Build `biometricData` (username=npub, password=JSON with key + masterKeyData + legacy-compat fields, server=deviceId, isLegacyFormat=false).  
    - `authState.setupAuthData(access_token, 'biometrics', npub, user, biometricData, false)` then redirect: new user → `/auth/onboarding`, existing → `/dashboard`.

So “signup” here is: **nsec in → challenge signed with nsec → backend creates user and stores master-key payload → create passkey with npub + exportedMasterKey → register device → JWT + redirect.**

### 4B. Onboarding passkey setup (generate new keys)

**Entry:** After first-time nsec login the user is sent to onboarding. Alternatively, onboarding can create a **new** key pair and register.

**File:** `src/lib/components/onboarding/PasskeySetup.svelte` → `handlePasskeySetup()`.

1. **Nostr keys**  
   - If `userData.hasNostrKey && userData.nsec`: decode nsec, get npub.  
   - Else: `generateKeyPair()` → `generateSecretKey()` + `getPublicKey()` (nostr-tools), nsec as hex.

2. **Wallet mnemonic**  
   - `generateMnemonic()` (BIP39).

3. **Device ID**  
   - `getDeviceIdentifier()`.

4. **Master key payload**  
   - `encryptMasterKeyData(nsec, walletMnemonic, deviceId)`.

5. **Create passkey**  
   - Mobile: `setBiometricKey(npub, masterKeyData.exportedMasterKey, 'biometrics', passkeyName)`.  
   - Web: `setWebBiometricKey(npub, masterKeyData.exportedMasterKey, passkeyName)`.  
   - Get `credentialId`.

6. **Register with backend**  
   - `authService.registerWithMasterKey({ username, publicKey: npub, masterKeyData, authMethod: 'passkey', deviceId })`.  
   - Then `authService.registerPasskeyDevice(npub, deviceId, deviceName, credentialId)`.

7. **Optional recovery**  
   - If user set recovery: `setupAccRecovery(npub, nsec, walletMnemonic, userData.recoveryPassword, userData.recoveryEmail)` → `encryptMasterKeyData(nsec, walletMnemonic, password)` with recovery password; send to backend via `authService.setupAccountRecoveryPassword(data)` (recoveryData = nostr + wallet + masterSalt only, no exportedMasterKey).

This matches the “generic signup” bullet points: generate Nostr key pair, generate wallet mnemonic, derive master key from device ID, derive context keys (HKDF), encrypt nsec and mnemonic, export master key for passkey, get credential ID, register with server (registerWithMasterKey + registerPasskeyDevice), then optional recovery (encrypt with recovery password and send to server).

---

## 5. Workflow 2: Generic Login (Passkey)

**Entry:** User taps “Continue with Passkey” (or biometric) on login page → `src/routes/auth/login/+page.svelte` → `authenticate('passkey')` or `authenticate('biometrics')`.

1. **Device ID**  
   - `getDeviceIdentifier()`.

2. **Retrieve passkey / biometric data**  
   - **Web**: `getWebBiometricData()` → `navigator.credentials.get({ publicKey: { challenge, timeout, userVerification } })`; credential’s `response.userHandle` = packed npub + exportedMasterKey → `unPackKeys(userHandle)` → `publicKey`, `exportedKey`.  
   - **Native**: `getBiometricData(authMethod)` → Webauthn (Capacitor) or NativeBiometric. If WebAuthn: same packed userHandle. If NativeBiometric: read stored JSON (keys + credentialId).  
   - In both cases, **fetch encrypted payload for this device** from backend: `authService.getMasterKeyEncryptedData(publicKey, deviceId, credential.id, deviceName)` (or legacy `getEncryptedKey`). Returns either `masterKeyData` + `isLegacyFormat: false` or legacy encrypted nsec.

3. **Login challenge**  
   - `authService.getLoginChallenge()`.

4. **Decrypt nsec**  
   - Master-key format: `decryptNsecWithBiometrics(encryptedData)` → parses JSON; if `masterKeyData` present, `decryptMasterKeyDataFromBiometrics(masterKeyData, key)` → `decryptNsecFromMasterKey(masterKeyData, exportedMasterKey)`.  
   - Legacy: same `decryptNsecWithBiometrics` but uses key/iv/authTag/data/salt and single-key decrypt.

5. **Legacy migration (if needed)**  
   - If `biometricData.isLegacyFormat`: generate new wallet mnemonic, `encryptMasterKeyData(privateKey, walletMnemonic, deviceId)`, then `authService.migrateToMasterKey(pubKey, deviceId, masterKeyData)`; update local `biometricData.password` to new master-key JSON.

6. **Sign challenge**  
   - `signLoginChallenge(challenge, privateKey)` in `src/lib/utils/helpers/auth.ts`: Schnorr sign with Nostr secp256k1 key.

7. **Passkey login to server**  
   - `authService.loginWithPasskey(pubKey, deviceId)`. Server validates device and credential; returns JWT.

8. **Session**  
   - `authState.setupAuthData(access_token, authMethod, pubKey, response.user, biometricData)`; redirect to dashboard.

So: **get device ID → retrieve passkey (npub + exportedMasterKey) → get encrypted master-key blob from server → decrypt nsec (and optionally wallet) with exported master key → sign challenge with nsec → loginWithPasskey → JWT and store auth state.**

---

## 6. Workflow 3: Login with nsec (Detailed)

Already covered in §4A; summary:

1. User enters nsec (or QR).  
2. Validate nsec; decode to hex and npub.  
3. Get login challenge from server.  
4. Build Nostr event kind 22242 (content = challenge, tags relay + challenge).  
5. Sign with nsec (Schnorr).  
6. Get device ID; generate wallet mnemonic (new user).  
7. `encryptMasterKeyData(nsec, walletMnemonic, deviceId)`.  
8. `authService.loginWithNostr({ event, challenge, authMethod, deviceId, masterKeyData })`.  
9. Server responds: access_token, user, isNewUser.  
10. Fetch Nostr profile for passkey display name; create passkey (npub + exportedMasterKey); get credentialId; register device.  
11. Store biometric data in app store; setup auth state with JWT; redirect to onboarding (new) or dashboard (existing).

---

## 7. Recovery (Optional Recovery Password)

### 7.1 Setup (onboarding or settings)

- **Onboarding**: `RecoverySetup.svelte` or `PasskeySetup.svelte` → user sets recovery email + recovery password.  
- **Encryption**: `encryptMasterKeyData(nsec, mnemonic, recoveryPassword)` (recovery password instead of device ID).  
- **Send to server**: `authService.setupAccountRecoveryPassword({ publicKey, recoveryData: { nostr, wallet, masterSalt }, email })`.  
- Server stores recovery blob (encrypted with recovery password) and links to email. No `exportedMasterKey` is stored for recovery.

### 7.2 Recover on new device

**File:** `src/routes/auth/recover/[npub]/+page.svelte`.

1. User opens recovery link (with npub).  
2. `authService.getNostrRecoveryData(npub)` → returns `{ nostr, wallet, masterSalt }` (no exportedMasterKey).  
3. User enters **current recovery password**; `decryptMasterKeyWithPassword(recoveryData, currentPassword)` → nsec, mnemonic.  
4. User sets **new** recovery password and confirms; receives OTP to email.  
5. Re-encrypt for **this device**: `encryptMasterKeyData(nsec, mnemonic, deviceId)` → `masterKeyData`.  
6. Re-encrypt for **recovery**: `encryptMasterKeyData(nsec, mnemonic, newPassword)` → new recovery blob.  
7. `authService.completeNostrRecovery({ publicKey, otp, recoveryData, encryptedMasterKeyData: masterKeyData, deviceId })`.  
8. Create passkey on this device: `setBiometricKey` / `setWebBiometricKey(npub, masterKeyData.exportedMasterKey, …)`; `authService.registerPasskeyDevice(npub, deviceId, deviceName, credentialId)`.  
9. `authService.loginWithPasskey(npub, deviceId)` → JWT; `authState.setupAuthData(..., biometricData, true)`.

So recovery = **recovery password decrypts nsec + mnemonic**; then re-encrypt for new device (device ID) and optionally new recovery password; register new passkey and device; login with passkey.

---

## 8. File and Script Reference

| Layer | File(s) | Responsibility |
|-------|---------|----------------|
| **Device ID** | `src/lib/utils/helpers/deviceIdentity.ts` | `getDeviceIdentifier()`, `getDeviceName()`, `createUserDeviceShortName()`, `formatPasskeyName()` |
| **Crypto primitives** | `src/lib/utils/helpers/crypto.ts` | `encrypt`/`decrypt` (AES-GCM), `deriveKeyFromPassword` (PBKDF2), `deriveContextKey` (HKDF), `exportKey`/`importKey` |
| **Auth helpers** | `src/lib/utils/helpers/auth.ts` | `encryptMasterKeyData`, `decryptNsecFromMasterKey`, `decryptWalletFromMasterKey`, `decryptMasterKeyDataFromBiometrics`, `decryptNsecWithBiometrics`, `decryptMasterKeyWithPassword`, `signLoginChallenge`, `isMasterKeyEncryptedData`, `migrateLegacyToMasterKey` |
| **Consts** | `src/lib/utils/consts.ts` | `DERIVATION_CONTEXTS` (NOSTR, WALLET) |
| **Encoding / packing** | `src/lib/utils/helpers/encoding.ts` | `packKeys` / `unPackKeys` (64-byte npub + exportedKey), `packKeysMobile` / `unPackKeysMobile` (base64url for WebAuthn userHandle), `generateCredentialId`, `generateWebChallenge` / `generateMobileChallenge` |
| **Web passkey** | `src/lib/utils/helpers/webBiometrics.ts` | `checkWebBiometricAvailability`, `setWebBiometricKey`, `getWebBiometricData` (WebAuthn create/get, pack/unpack in userHandle) |
| **Native passkey** | `src/lib/utils/helpers/biometrics.ts` | `checkBiometricAvailability`, `setBiometricKey`, `getBiometricData` (NativeBiometric + Capacitor Webauthn), same pack format |
| **Auth API** | `src/lib/api/services/auth.service.ts` | `getLoginChallenge`, `loginWithNostr`, `loginWithPasskey`, `registerWithMasterKey`, `registerPasskeyDevice`, `getMasterKeyEncryptedData`, `getEncryptedKey` (legacy), `migrateToMasterKey`, `setupAccountRecoveryPassword`, `getNostrRecoveryData`, `completeNostrRecovery` |
| **Endpoints** | `src/lib/api/endpoints.ts` | `AUTH.NOSTR_CHALLENGE`, `AUTH.NOSTR_LOGIN`, `AUTH.REGISTER_MASTER_KEY`, `AUTH.REGISTER_PASSKEY`, `AUTH.PASSKEY_LOGIN`, `AUTH.MASTER_KEY_ENCRYPTED_DATA`, `AUTH.MIGRATE_TO_MASTER_KEY`, etc. |
| **Login UI** | `src/routes/auth/login/+page.svelte` | nsec input/QR, passkey/biometric buttons, `handleNsecLogin`, `authenticate()`, `login()` |
| **Onboarding** | `src/lib/components/onboarding/PasskeySetup.svelte`, `RecoverySetup.svelte` | New key generation or use existing; register with master key; optional recovery setup |
| **Recovery UI** | `src/routes/auth/recover/[npub]/+page.svelte` | Enter recovery password, OTP, new password; decrypt keys; re-encrypt for device; create passkey |
| **Auth state** | `src/lib/stores/auth.store.ts` | `setupAuthData(accessToken, authMethod, npub, userData, biometricData)`, logout, Preferences (ACCESS_TOKEN, NPUB, AUTH_METHOD) |
| **Types** | `src/lib/types/auth.d.ts` | `Credentials`, `MasterKeyEncryptedData`, `MasterKeyRegistration`, `NostrLoginData`, `AccountRecoveryData`, `NostrRecoveryData`, etc. |
| **E2E (Playwright)** | `src/lib/tests/e2e/fixtures/auth.ts` | Virtual WebAuthn authenticator must be attached to the **test page** (same frame as the app), not a temporary page, so `credentials.create()` in PasskeySetup is handled. See `plans/e2e-testing.md` and `src/lib/tests/e2e/docs/e2e-account-creation-challenge.md`. |

---

## 9. Sequential Summary (Workflow Perspective)

**First time (no account):**

1. User enters nsec (or onboarding generates new Nostr + mnemonic).  
2. Device ID is obtained and persisted.  
3. Master key is derived: PBKDF2(device ID, masterSalt, 100k) → master key.  
4. HKDF(master key, "nostr-key-v1", nostrSalt) → nostr key; HKDF(master key, "wallet-mnemonic-v1", walletSalt) → wallet key.  
5. AES-GCM encrypt nsec with nostr key; AES-GCM encrypt mnemonic with wallet key.  
6. Export master key → exportedMasterKey.  
7. Pack npub + exportedMasterKey (64 bytes) and store in passkey (userHandle) or native secure storage.  
8. Register user/device with backend (registerWithMasterKey / loginWithNostr + registerPasskeyDevice).  
9. Optionally encrypt same payload with recovery password and send to server.  
10. Login returns JWT; auth state and session stored; redirect to onboarding or dashboard.

**Subsequent logins (passkey):**

1. User triggers passkey/biometric.  
2. Device ID retrieved; passkey returns npub + exportedMasterKey (from userHandle or native storage).  
3. Backend returns encrypted master-key payload for this device (or legacy nsec-only).  
4. Import exportedMasterKey; derive nostr key; decrypt nsec.  
5. Get login challenge; sign with nsec (Schnorr).  
6. loginWithPasskey(deviceId) → JWT.  
7. Session and auth state updated; redirect to dashboard.

**Recovery:**

1. User proves email (OTP) and enters recovery password.  
2. Backend returns recovery blob (nostr + wallet + masterSalt).  
3. Decrypt with recovery password → nsec, mnemonic.  
4. Re-encrypt with **new device ID** for this device; create new passkey; register device; login with passkey.

This is how the bullet points you received map to the repo: Nostr identity, BIP39 mnemonic, device-ID-derived master key, HKDF context keys, AES-GCM for nsec and mnemonic, exported master key in the passkey, server-side encrypted storage and optional recovery password, and the exact sequence of API calls and UI flows above.

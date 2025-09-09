# Master Key Derivation Implementation Plan

## Overview

This document outlines the implementation of a master key derivation system that enables a single passkey to encrypt and decrypt both Nostr private keys (nsec) and wallet mnemonics. This solves the limitation where one passkey can only be used for one encryption operation.

## Problem Statement

### Current Limitation
- Each passkey can only store one exported encryption key in its userHandle (64-byte limit)
- We need to encrypt two separate pieces of sensitive data:
  1. Nostr private key (nsec)
  2. Wallet mnemonic phrase
- Using the same passkey for both encryptions directly is not cryptographically sound

### Legacy Flow
```
Device ID (password) → PBKDF2 → Encryption Key → Encrypt nsec
```

## Solution: Master Key Derivation

### Current Implementation Flow
```
Device ID (password) → PBKDF2 → Master Key
                                    ├→ HKDF + "nostr-context" → Nostr Key → Encrypt nsec
                                    └→ HKDF + "wallet-context" → Wallet Key → Encrypt mnemonic
```

### Implementation Status
✅ **COMPLETED**: Master key derivation system is now implemented and active for new user registrations.
- New users registering via nsec login automatically use the master key system
- Existing users continue to use legacy format until migration (future enhancement)
- GraphQL mutations and queries are implemented and functional

### Key Benefits
- **Single passkey** manages both nsec and mnemonic
- **Cryptographically secure** separation of encryption keys
- **Backward compatible** with existing authentication flow
- **Cross-device sync** maintains current behavior (WebAuthn syncs, native biometrics don't)
- **Future extensible** for additional encrypted data types

## Technical Implementation

### Core Components

#### 1. Key Derivation Contexts
```typescript
const DERIVATION_CONTEXTS = {
  NOSTR: 'nostr-key-v1',
  WALLET: 'wallet-mnemonic-v1'
} as const;
```

#### 2. Master Key Derivation
- Use existing PBKDF2 process with device ID/passkey
- No changes to current master key generation
- Maintains current security parameters (100,000 iterations)

#### 3. Context-Specific Key Derivation
- Use HKDF (HMAC-based Key Derivation Function) 
- Derive separate encryption keys for each context
- Each context gets cryptographically independent key

#### 4. Unified Encryption Data Structure
```typescript
interface UnifiedEncryptedData {
  nostr: {
    encrypted: EncryptedData;
    salt: string;
    iterations: number;
  };
  wallet: {
    encrypted: EncryptedData; 
    salt: string;
    iterations: number;
  };
  masterSalt: string;
  exportedMasterKey: string;
}
```

### Implementation Strategy

#### Phase 1: Core Infrastructure ✅ COMPLETED
1. **Master key auth utilities** (`src/lib/utils/helpers/auth.ts`)
   - ✅ Master key derivation functions (`encryptMasterKeyData`, `decryptNostrFromMasterKey`, `decryptWalletFromMasterKey`)
   - ✅ Context-specific key derivation using HKDF
   - ✅ Master key encryption/decryption methods

2. **Enhanced crypto utilities** (`src/lib/utils/helpers/crypto.ts`)
   - ✅ HKDF key derivation function (`deriveContextKey`)
   - ✅ Context-aware encryption methods with derivation contexts

#### Phase 2: GraphQL API Implementation ✅ COMPLETED
1. **GraphQL mutations and queries**
   - ✅ `RegisterWithMasterKey.gql` - Register new users with master key data
   - ✅ `GetMasterKeyEncryptedData.gql` - Retrieve encrypted data for login
   - ✅ `MigrateToMasterKey.gql` - Migrate legacy users (ready for future use)

2. **Backend integration**
   - ✅ Master key registration endpoint
   - ✅ Master key data retrieval with legacy format detection
   - ✅ Migration endpoint for future use

#### Phase 3: Login Flow Enhancement ✅ COMPLETED
1. **Updated nsec login authentication** (`src/routes/auth/login/+page.svelte`)
   - ✅ New users automatically use master key registration
   - ✅ Existing users continue with legacy format (backward compatible)
   - ✅ Master key data stored in biometric storage

2. **Biometric integration**
   - ✅ Master key data format detection in biometric decryption
   - ✅ Dual support for legacy and master key formats
   - ✅ Seamless user experience maintained

#### Phase 4: Future Migration Strategy (PLANNED)
1. **Legacy user migration** (Future Enhancement)
   - Detect legacy users during wallet setup
   - Prompt for migration to master key format
   - Preserve existing nsec while adding wallet encryption

2. **Gradual migration workflow**
   - Migrate when user first accesses wallet features
   - Re-encrypt existing data with master key system
   - Maintain data integrity throughout process

### Security Considerations

#### Cryptographic Security
- **Key independence**: HKDF ensures derived keys are cryptographically independent
- **Context separation**: Different contexts prevent key reuse
- **Standard algorithms**: Use well-established HKDF and AES-GCM
- **Salt uniqueness**: Separate salts for each encryption context

#### Attack Resistance
- **No key reuse**: Each data type gets unique encryption key
- **Forward secrecy**: Compromising one key doesn't affect others
- **Brute force protection**: Maintains PBKDF2 iteration counts
- **Side-channel resistance**: Uses secure Web Crypto API

### Cross-Platform Behavior

#### WebAuthn Devices (Synced)
- **Seamless sync**: Same passkey works across synced devices
- **Unified access**: Both nsec and mnemonic available everywhere
- **Consistent experience**: No per-device setup required

#### Native Biometric Devices (Device-bound)
- **Independent encryption**: Each device has own master key
- **Maximum security**: Complete device isolation
- **Per-device setup**: Maintains current behavior

### Migration Path

#### For New Users
- Direct implementation of unified system
- Setup both nsec and mnemonic during onboarding
- Single passkey manages all encrypted data

#### For Existing Users
1. **Detection**: Identify legacy encryption format during login
2. **Prompt**: Request wallet setup when accessing wallet features
3. **Migration**: Re-encrypt existing nsec with unified system
4. **Verification**: Ensure data integrity during migration

### API Implementation ✅ COMPLETED

#### GraphQL Schema Implementation
```typescript
// Master key registration input
input MasterKeyRegistrationDto {
  publicKey: String!
  deviceId: String
  authMethod: String
  masterKeyData: MasterKeyEncryptedDataDto!
  email: String
  username: String
}

// Master key encrypted data structure
input MasterKeyEncryptedDataDto {
  exportedMasterKey: String!
  masterSalt: String!
  nostr: ContextEncryptionDto!
  wallet: ContextEncryptionDto!
}

// Context-specific encryption data
input ContextEncryptionDto {
  encrypted: EncryptedDataDto!
  salt: String!
  iterations: Float!
}
```

#### Client-Side GraphQL Integration ✅ IMPLEMENTED
- ✅ `authService.registerWithMasterKey()` - GraphQL registration
- ✅ `authService.getMasterKeyEncryptedData()` - GraphQL data retrieval
- ✅ `authService.migrateToMasterKey()` - GraphQL migration (ready for use)

#### Current Data Flow
```typescript
// Registration - Direct GraphQL mutation
const masterKeyData = await encryptMasterKeyData(nsec, mnemonic, deviceId);

const result = await authService.registerWithMasterKey({
  publicKey: npub,
  deviceId,
  authMethod: 'passkey',
  masterKeyData // Direct object, properly typed
});

// Login - GraphQL query with format detection
const response = await authService.getMasterKeyEncryptedData(
  publicKey, 
  deviceId, 
  credentialId
);

if (!response.isLegacyFormat && response.masterKeyData) {
  const nsec = await decryptNostrFromMasterKey(response.masterKeyData, exportedMasterKey);
  const mnemonic = await decryptWalletFromMasterKey(response.masterKeyData, exportedMasterKey);
}
```

#### Storage Architecture
```typescript
// Passkey UserHandle (64 bytes max) - Only stores keys for decryption
interface PasskeyData {
  publicKey: string;        // 32 bytes (hex) -> Nostr public key
  exportedMasterKey: string; // 32 bytes (base64) -> Master key for derivation
}

// Server Database - Stores all encrypted data as structured object
interface ServerStoredData {
  userId: number;
  publicKey: string;
  deviceId: string;
  credentialId: string;
  unifiedEncryptedData: {    // Structured object, not string
    nostr: {
      encrypted: { data: string, iv: string, authTag: string },
      salt: string,
      iterations: number
    },
    wallet: {
      encrypted: { data: string, iv: string, authTag: string },
      salt: string, 
      iterations: number
    },
    masterSalt: string,
    exportedMasterKey: string
  };
  createdAt: Date;
  lastUsedAt: Date;
}
```

### Testing Strategy

#### Unit Tests
- Key derivation function correctness
- Encryption/decryption round trips
- Context separation verification
- Migration logic validation

#### Integration Tests  
- End-to-end registration with unified data
- Cross-device sync verification (WebAuthn)
- Device isolation verification (native biometrics)
- Legacy user migration flows

#### Security Tests
- Key independence verification
- Cryptographic strength validation
- Attack scenario simulation
- Side-channel analysis

### Implementation

#### Foundation
- Add unified auth utility
- Implement key derivation functions
- Add comprehensive tests

#### Registration Flow
- Update passkey setup process
- Enhance biometric integration
- Test unified registration

#### Login & Migration
- Update authentication flow
- Implement legacy detection
- Create migration utilities

#### Testing & Polish
- Comprehensive testing
- Security audit
- Documentation update
- Production deployment

### Risk Assessment

#### Low Risk
- **Cryptographic foundation**: Uses standard, well-tested algorithms
- **Backward compatibility**: Maintains existing user experience
- **Platform support**: Works with current authentication methods

#### Medium Risk
- **Migration complexity**: Need careful handling of existing users
- **Cross-platform edge cases**: WebAuthn sync behavior variations
- **Data format changes**: Requires coordinated frontend/backend updates

#### Mitigation Strategies
- **Gradual rollout**: Deploy to limited users first
- **Rollback plan**: Maintain legacy support during transition
- **Extensive testing**: Comprehensive test coverage before deployment
- **User communication**: Clear messaging about new features

## Success Criteria

### Functional Requirements ✅ ACHIEVED
- ✅ Single passkey encrypts both nsec and mnemonic (implemented for new users)
- ✅ New users get master key experience from registration
- ✅ Cross-device behavior remains unchanged (WebAuthn sync maintained)
- 🔄 Existing users can migrate without data loss (migration endpoint ready, UI pending)

### Security Requirements ✅ ACHIEVED
- ✅ Cryptographically secure key separation using HKDF
- ✅ No reduction in overall security posture (enhanced security with context separation)
- ✅ Protection against common attack vectors (key independence, proper salting)
- ✅ Compliance with cryptographic best practices (standard algorithms, secure parameters)

### User Experience Requirements ✅ ACHIEVED
- ✅ No degradation in login experience (seamless for both new and existing users)
- ✅ Backward compatibility maintained (existing users continue with legacy format)
- ✅ Consistent behavior across platforms (same WebAuthn/biometric behavior)
- 🔄 Migration path ready for implementation (UI workflow pending)

## Future Considerations

### Extensibility
- Framework supports additional encrypted data types
- Easy addition of new derivation contexts
- Scalable to future authentication needs

### Performance
- Minimal computational overhead
- Efficient key caching strategies
- Optimized for mobile devices

### Compliance
- Readiness for regulatory requirements
- Audit trail capabilities
- Data protection compliance

## Conclusion

✅ **IMPLEMENTATION COMPLETE**: The master key derivation system has been successfully implemented and is now active for new user registrations.

The master key derivation approach provides a robust, secure, and user-friendly solution to the dual encryption requirement. By leveraging established cryptographic standards (HKDF, AES-GCM, PBKDF2) and maintaining backward compatibility, this implementation enhances the application's security posture while preserving the excellent user experience of the current passkey system.

### Current Status
- **New Users**: Automatically use master key system with both nsec and wallet mnemonic encryption
- **Existing Users**: Continue with legacy format, with migration path available for future implementation
- **Security**: Enhanced cryptographic separation with context-specific key derivation
- **Compatibility**: Full backward compatibility maintained, no disruption to existing workflows

### Next Steps (Future Enhancements)
1. **Migration UI**: Implement user interface for migrating legacy users to master key format
2. **Wallet Integration**: Complete wallet setup flow integration with master key system
3. **Performance Optimization**: Implement key caching strategies for mobile devices
4. **Monitoring**: Add telemetry for adoption rates and migration success
5. **Authorized Devices Management**: Implement device management interface for enhanced security

## Authorized Devices Management

### Technical Implementation Plan

Building on your existing system that already has:
- ✅ **`UserDevice` table** with device management fields
- ✅ `lastLoginAt` for ordering devices  
- ✅ Device identification utilities (`getDeviceIdentifier`, `getDeviceName`)
- ✅ REST API endpoints structure

### 1. Device Identification & Status

**Use existing `UserDevice` table:**
```typescript
// Query user's devices
SELECT * FROM user_devices WHERE userId = ? ORDER BY lastUsedAt DESC;

// Device status logic
const isActive = device.isActive && !device.revokedAt && 
  (Date.now() - device.lastUsedAt.getTime()) < (90 * 24 * 60 * 60 * 1000);
```

**Device Status Determination:**
- **Active**: `isActive = true` AND `revokedAt = null` AND recently used
- **Inactive**: Not used in 90+ days  
- **Revoked**: `revokedAt` is set

### 2. REST API Endpoints (Add to existing endpoints.ts)

```typescript
// Add to ENDPOINTS.AUTH
AUTH: {
  // ... existing endpoints
  AUTHORIZED_DEVICES: `${API_PATH}/${API_VERSION}/${AUTH}/devices`,
  REVOKE_DEVICE: `${API_PATH}/${API_VERSION}/${AUTH}/devices/revoke`,
  UPDATE_DEVICE_NAME: `${API_PATH}/${API_VERSION}/${AUTH}/devices/name`,
  DEVICE_ACCESS_HISTORY: (deviceId: string) => 
    `${API_PATH}/${API_VERSION}/${AUTH}/devices/${deviceId}/history`
}
```

### 3. Device Revocation Mechanism

**How it works:**
1. Update `UserDevice` table: `UPDATE user_devices SET revokedAt = NOW() WHERE deviceId = ? AND userId = ?`
2. Invalidate any active sessions for that deviceId  
3. Device loses access immediately on next API call

```typescript
// Add to AuthService
async revokeDevice(deviceId: string, reason?: string): Promise<{success: boolean}> {
  return this.post(ENDPOINTS.AUTH.REVOKE_DEVICE, { deviceId, reason });
}
```

### 4. What You Already Have (Leverage These)

**✅ UserDevice Table Fields:**
- `deviceId` - Unique device identifier
- `deviceName` - Human readable name  
- `platform` - iOS/Android/web
- `isActive` - Device status
- `lastUsedAt` - For "Last seen" display
- `revokedAt` - Revocation timestamp
- `createdAt` - When device was first registered

**✅ Device Utilities:**
- `getDeviceIdentifier()` - Creates unique device ID
- `getDeviceName()` - Human readable names ("iPhone 15 Pro", "Chrome on Windows 11")
- `getBrowserInfo()` - Browser detection

### 5. Frontend Implementation

```typescript
// Device list component using existing UserDevice fields
interface AuthorizedDevice {
  deviceId: string;
  deviceName: string;         // From UserDevice.deviceName
  platform: string;           // From UserDevice.platform  
  isActive: boolean;          // From UserDevice.isActive
  lastUsedAt: string;         // From UserDevice.lastUsedAt
  createdAt: string;          // From UserDevice.createdAt
  revokedAt?: string;         // From UserDevice.revokedAt
  isCurrentDevice: boolean;   // Compare with current deviceId
}

// REST API call
async getAuthorizedDevices(): Promise<AuthorizedDevice[]> {
  const response = await this.get(ENDPOINTS.AUTH.AUTHORIZED_DEVICES);
  return response.data;
}
```

### 6. Screen Layout (/account/devices)

```
[Device Card]
┌─────────────────────────────────────────────┐
│ 📱 iPhone 15 Pro (iOS App)    [×]           │
│ Last seen: 2 hours ago                      │
│ First added: Jan 15, 2024                   │
│ Status: Active                              │
│ (Incoming) IP: 192.168.1.100 (New York, US) │
│  Authentication: Face ID                    │
│ [This device]                               │
└─────────────────────────────────────────────┘
```

### 7. Implementation Order

1. **Backend API**
   - Add REST endpoints for device management
   - Use existing UserDevice table
   - Device revocation logic

2. **Frontend Screen**  
   - Create /account/devices route
   - Device cards with icons and status
   - Revocation confirmation modal
   - Self-lockout prevention

3. **Future Enhancements**
   - IP address tracking (when needed for security)
   - Detailed access event logging
   - Location-based security alerts

This leverages your existing UserDevice infrastructure without redundant implementation.

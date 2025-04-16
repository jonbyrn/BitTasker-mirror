# BitTasker Wallet Frontend Implementation

## Overview
BitTasker implements a non-custodial, cross-platform wallet supporting Bitcoin, Lightning, and Liquid networks. All cryptographic operations happen client-side while utilizing backend APIs for blockchain data and transaction broadcasting.

## Tech Stack & Platform Support
- SvelteKit with Svelte 5 Runes
- Static adapter (no SSR)
- Capacitor for native functionality
- Web Crypto API for cryptographic operations -> window.crypto and crypto are both valid syntaxe so just use crypto directly
- bitcoinjs-lib for Bitcoin operations

### Platform-Specific Features
1. Web
   - Browser-based wallet access
   - QR code scanning via webcam
   - Capacitor Preferences storage fallback

2. Mobile (iOS/Android via Capacitor)
   - Native secure storage
   - Native camera integration
   - Biometric authentication
   - Push notifications
   - Offline support

## Dependencies (All Already Installed)

### Core Dependencies
```bash
npm install bitcoinjs-lib # Bitcoin operations - already installed
```

### Capacitor Plugins
```bash
npm install @capacitor/preferences # Secure storage - already installed
npm install @capacitor/camera # QR code scanning - already installed
npm install @capacitor-community/barcode-scanner # Dedicated QR scanning - already installed
```

## Multi-Layer Network Implementation

### 1. Bitcoin (Layer 1)
- Direct wallet integration
- On-chain transaction support
- UTXO management
- Address generation and management

### 2. Lightning Network (Layer 2)
Implementation using Nostr Wallet Connect (NWC):
```typescript
// src/lib/wallet/lightning/nwc.ts
interface NWCConfig {
  relayUrl: string;
  pubkey: string;
  secret: string;
}

class LightningWallet {
  async connectNWC() {
    // Connect to NWC relay
    // Handle payment requests
    // Manage invoices
  }
}
```

### 3. Liquid Network
- Smart contract integration for escrow
- Asset issuance and transfer
- Confidential transactions
- Fee calculations

## Component Structure

```
src/
├── lib/
│   ├── components/
│   │   └── wallet/
│   │       ├── WalletBalance.svelte    # Balance display for all networks
│   │       ├── WalletReceive.svelte    # Receive funds interface
│   │       ├── WalletSend.svelte       # Send funds interface
│   │       ├── WalletSetup.svelte      # Initial wallet setup
│   │       ├── WalletTransactions.svelte # Transaction history
│   │       ├── escrow/
│   │       │   ├── EscrowContract.svelte
│   │       │   └── EscrowRelease.svelte
│   │       ├── lightning/
│   │       │   ├── LightningInvoice.svelte
│   │       │   └── LightningPay.svelte
│   │       └── liquid/
│   │           ├── LiquidAssets.svelte
│   │           └── LiquidContract.svelte
│   └── wallet/
│       ├── crypto.ts          # Cryptographic operations
│       ├── storage.ts         # Cross-platform storage handling
│       ├── lightning/
│       │   ├── nwc.ts         # Nostr Wallet Connect integration
│       │   └── invoice.ts     # Lightning invoice handling
│       └── liquid/
│           ├── contracts.ts   # Liquid smart contracts
│           └── assets.ts      # Liquid asset management
```

## Payment & Escrow Implementation

### 1. Payment Processing
Location: `src/lib/wallet/payments/`

```typescript
interface PaymentRequest {
  amount: number;
  currency: string;
  network: 'bitcoin' | 'lightning' | 'liquid';
  escrow?: boolean;
  milestones?: Milestone[];
}
```

Features:
- Multi-currency support
- Cross-network payments
- Payment request generation
- Invoice creation
- Payment status tracking

### 2. Escrow System
Location: `src/lib/wallet/escrow/`

Features:
- Smart contract integration via Liquid
- Milestone-based releases
- Dispute resolution interface
- Automatic releases based on conditions
- Multi-signature support

### 3. Invoice Management
Location: `src/lib/wallet/invoice/`

Features:
- Invoice generation
- Payment tracking
- Receipt creation
- Multiple payment method support
- Split payment handling

## Security Implementation

### 1. Key Management
```typescript
// src/lib/wallet/security/keys.ts
class KeyManager {
  async encryptWalletData(data: WalletData, password: string) {
    // Use crypto for encryption
    // Store in Capacitor Preferences
  }
}
```

### 2. Platform-Specific Security
- Mobile: Biometric authentication
- Web: Password-based encryption
- All: E2EE for sensitive data

## State Management

```typescript
// src/lib/wallet/store.ts
interface WalletState {
  balances: {
    bitcoin: number;
    lightning: number;
    liquid: number;
  };
  transactions: Transaction[];
  escrowContracts: EscrowContract[];
  paymentRequests: PaymentRequest[];
}
```

## Cross-Platform Considerations

### 1. Storage Strategy
```typescript
// src/lib/wallet/storage/index.ts
class StorageManager {
  private async getPlatformStorage() {
    if (Capacitor.isNativePlatform()) {
      return Preferences;
    }
    return webStorage;
  }
}
```

### 2. Platform-Specific Features
- Native camera access for QR codes
- Secure storage mechanisms
- Push notifications
- Offline support

## Testing Requirements

### 1. Cross-Platform Testing
- Web browser testing
- iOS simulator/device testing
- Android emulator/device testing

### 2. Network Testing
- Bitcoin testnet integration
- Lightning Network testing
- Liquid Network testing

### 3. Payment Flow Testing
- Escrow contract testing
- Payment processing validation
- Invoice generation testing

## Implementation Phases

### Phase 1: Core Wallet (Current)
- Basic wallet functionality
- Bitcoin network support
- Essential security features

### Phase 2: Lightning Integration
- NWC integration
- Lightning payment support
- Invoice handling

### Phase 3: Liquid & Escrow
- Liquid Network integration
- Smart contract implementation
- Escrow system deployment

### Phase 4: Advanced Features
- Hardware wallet support
- Multi-signature support
- Advanced payment features

## Implementation Status

### Currently Implemented
- Basic wallet UI structure
- API endpoint connections
- Capacitor integration

### Pending Implementation
1. Wallet Creation Flow
2. Transaction Management
3. Address Management
4. Security Features

## Implementation Details

### 1. Wallet Creation Flow
Location: `src/routes/(protected)/wallet/setup/+page.svelte`

```typescript
// Key generation using Web Crypto API
async function generateWalletKeys() {
  const entropy = window.crypto.getRandomValues(new Uint8Array(32));
  // Generate wallet using bitcoinjs-lib
  // Store encrypted keys in Capacitor Preferences
}
```

Required Components:
- Mnemonic display component
- Verification process
- Password protection
- Secure storage implementation

### 2. Transaction Management
Location: `src/lib/components/wallet/Transaction.svelte`

Features to implement:
- Transaction creation interface
- Fee selection (using backend fee estimates)
- Transaction signing (client-side)
- Broadcasting via backend API
- Transaction history display

### 3. Address Management
Location: `src/lib/components/wallet/Addresses.svelte`

Features to implement:
- Address generation for new transactions
- Address labeling and organization
- QR code generation using Capacitor
- Address balance monitoring

### 4. Security Features
Location: `src/lib/wallet/security.ts`

Required implementations:
- Client-side encryption using Web Crypto API
- Secure key storage using Capacitor Preferences
- Session management
- PIN/Biometric protection integration

## Component Structure

```
src/
├── lib/
│   ├── components/
│   │   └── wallet/
│   │       ├── Setup.svelte
│   │       ├── Dashboard.svelte
│   │       ├── Transaction.svelte
│   │       └── Addresses.svelte
│   │       └── WalletBalance.svelte
│   │       └── WalletReceive.svelte
│   │       └── WalletSend.svelte
│   │       └── WalletSetup.svelte
│   │       └── WalletTransactions.svelte
│   └── wallet/
│       ├── crypto.ts
│       ├── storage.ts
│       └── network.ts
└── routes/
    └── (protected)/
        └── wallet/
            ├── +page.svelte (setup, send, receive are tab components instead of pages)
```

## Security Considerations

1. Key Storage
- Never store unencrypted keys
- Use Capacitor Preferences for secure storage
- Implement proper encryption before storage

2. Transaction Signing
- All signing happens client-side
- Never transmit private keys
- Verify transaction details before signing

3. Network Security
- Use HTTPS for all API calls
- Implement proper error handling
- Validate all incoming data

## Testing Requirements

1. Unit Tests
- Cryptographic operations
- Address generation
- Transaction building

2. Integration Tests
- Wallet creation flow
- Transaction sending
- Address management

3. Security Tests
- Key storage
- Transaction signing
- Network communication

## Future Enhancements

### Phase 2: External Wallet Integration
- Hardware wallet support
- External wallet connections
- Multi-signature support

### Phase 3: Advanced Features
- Multiple account support
- Custom fee management
- Advanced transaction types

## Error Handling

Implement comprehensive error handling for:
- Network failures
- Invalid transactions
- Storage errors
- Encryption/decryption errors

## Performance Considerations

1. State Management
- Use Svelte 5 runes for reactive state
- Implement proper cleanup
- Handle memory-intensive operations

2. Storage Optimization
- Implement proper caching
- Optimize stored data structure
- Regular cleanup of unnecessary data

## User Experience Guidelines

1. Wallet Creation
- Clear instructions
- Progress indicators
- Backup prompts

2. Transaction Management
- Clear fee information
- Confirmation screens
- Status updates

3. Security
- Clear security prompts
- Biometric integration
- Session management

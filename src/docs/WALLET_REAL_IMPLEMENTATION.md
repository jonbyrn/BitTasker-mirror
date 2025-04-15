# BitTasker Wallet Real Implementation

This document outlines the technical approach for implementing BitTasker's non-custodial Bitcoin wallet that interacts with real SDKs and APIs, following the requirements in `requirements/details/wallet.md`.

## Technology Stack

### Bitcoin & Blockchain
- **bitcoinjs-lib**: Core Bitcoin operations
- **bip39**: Seed phrase generation and management
- **bip32**: HD wallet derivation
- **@scure/bip39**: Modern, secure BIP39 implementation
- **@noble/secp256k1**: For cryptographic operations
- **Electrum Server API**: For UTXO management and transaction broadcasting
- **Mempool.space API**: For fee estimation and transaction monitoring

### Lightning Network
- **WebLN**: For browser-based Lightning wallet interactions
- **@getalby/js-lightning-tools**: Tools for Lightning Address protocols
- **Nostr Wallet Connect (NWC)**:
  - **@getalby/js-sdk**: Alby JavaScript SDK for NWC
  - **nostr-tools**: Core nostr protocol support

### Liquid Network
- **liquidjs-lib**: For Liquid Network operations
- **Blockstream Esplora API**: For Liquid asset operations

### Cryptography
- **Web Crypto API**: For secure key generation and encryption
- **Leveraging existing crypto.ts and encoding.ts utilities**

### Hardware Wallet Integration
- **@ledgerhq/hw-app-btc**: For Ledger integration
- **@trezor/connect-web**: For Trezor integration

## Implementation Architecture

### 1. Core Service Layer

Create the following services under `src/lib/api/services/`:

#### 1.1 Base Wallet Service

```typescript
// src/lib/api/services/wallet.service.ts
import { BaseApiService } from '../apiService';
import { ENDPOINTS } from '../endpoints';
import type { WalletServiceInterface } from '../types';

export class WalletService extends BaseApiService implements WalletServiceInterface {
  // Core wallet functionality
}

export const walletService = new WalletService();
```

#### 1.2 Network-specific Services

```typescript
// src/lib/api/services/bitcoin-wallet.service.ts
// src/lib/api/services/lightning-wallet.service.ts
// src/lib/api/services/liquid-wallet.service.ts
// src/lib/api/services/hardware-wallet.service.ts
```

### 2. API Endpoints Integration

Add wallet endpoints to `endpoints.ts`:

```typescript
WALLET: {
  BITCOIN: {
    CREATE: `/${API_VERSION}/bitcoin/wallet`,
    ADDRESS: `/${API_VERSION}/bitcoin/wallet/address`,
    BALANCE: `/${API_VERSION}/bitcoin/wallet/balance`,
    SEND: `/${API_VERSION}/bitcoin/send`,
    TRANSACTIONS: `/${API_VERSION}/bitcoin/transactions`,
    FEES: `/${API_VERSION}/bitcoin/fees`,
    VALIDATE: `/${API_VERSION}/bitcoin/validate`
  },
  LIGHTNING: {
    INVOICE: `/${API_VERSION}/lightning/invoice`,
    PAY: `/${API_VERSION}/lightning/pay`,
    CONNECT: `/${API_VERSION}/lightning/connect`,
    TRANSACTIONS: `/${API_VERSION}/lightning/transactions`
  },
  LIQUID: {
    ADDRESS: `/${API_VERSION}/liquid/address`,
    BALANCE: `/${API_VERSION}/liquid/balance`,
    SEND: `/${API_VERSION}/liquid/send`,
    ESCROW: `/${API_VERSION}/liquid/escrow`,
    ASSETS: `/${API_VERSION}/liquid/assets`
  }
}
```

## Implementation Plan

### Phase 1: Core Wallet Infrastructure

1. **Secure Key Management**
   - Implement BIP39 mnemonic generation using @scure/bip39
   - Create HD wallet derivation using bip32
   - Integrate with existing encryption utilities for key storage
   - Create wallet state store with proper types

2. **Bitcoin Wallet Service**
   - Address generation following BIP84 (P2WPKH)
   - UTXO management using Electrum server API
   - Transaction building and signing using bitcoinjs-lib
   - Fee estimation using Mempool API
   - Balance queries and transaction history

### Phase 2: Lightning Integration

1. **Lightning Wallet Integration**
   - WebLN provider detection and connection
   - BOLT11 invoice generation and payment
   - Lightning Address protocol support
   - Nostr Wallet Connect implementation using @getalby/js-sdk

2. **Payment Flow Integration**
   - Invoice QR code generation
   - Send flow with Lightning/on-chain detection
   - Payment status tracking

### Phase 3: Liquid & Escrow

1. **Liquid Network Support**
   - Integration with liquidjs-lib for Liquid operations
   - Liquid address generation and validation
   - Asset management (L-BTC, USDT)
   - Multi-signature contract implementation
   - Time-locked escrow contracts

2. **Escrow System Implementation**
   - Smart contract templates for different escrow types
   - Dispute resolution mechanism
   - Fee calculation and extraction logic

### Phase 4: Hardware Wallet & Advanced Features

1. **Hardware Wallet Integration**
   - Ledger support via @ledgerhq/hw-app-btc
   - Trezor support via @trezor/connect-web
   - Address verification on device
   - Transaction signing flow with hardware wallets

2. **Advanced Security Features**
   - Spending limits
   - Address whitelisting
   - Enhanced recovery options

## Implementation Details

### Key Security Architecture

1. **Zero Trust Model**
   - No server-side private key storage
   - Client-side encryption of all sensitive data
   - Encryption key derived from user password using PBKDF2

2. **Key Derivation Workflow**
   ```
   User Password → PBKDF2 → AES-256 Key
                              ↓
   BIP39 Mnemonic ←→ AES-256 Encryption ←→ Encrypted Storage
   ```

3. **HD Wallet Structure**
   - BIP44/84 compliant key derivation paths
   - Multiple account support
   - Different address types (SegWit, Taproot)

### API Integration Strategy

1. **Backend API Integration**
   - Wallet creation: `POST /api/v1/bitcoin/wallet`
   - Address generation: `POST /api/v1/bitcoin/wallet/address`
   - Transaction creation: `POST /api/v1/bitcoin/send`
   - Custom middleware for handling wallet-specific errors

2. **External APIs**
   - Electrum servers for UTXO management
   - Mempool.space for fee estimation
   - Blockstream Esplora for Liquid operations
   - Fallback providers for redundancy

### Secure Storage Strategy

1. **Encrypted Storage Layers**
   - Browser's localStorage with encrypted data
   - Capacitor Preferences for mobile persistence
   - WebCrypto API for cryptographic operations
   - Salt and IV management for each encrypted item

2. **Recovery Mechanisms**
   - BIP39 seed phrase backup
   - Optional encrypted cloud backup
   - Device synchronization

## Testing Strategy

1. **Test Environments**
   - Bitcoin Testnet/Regtest
   - Lightning Test Network
   - Liquid Testnet

2. **Testing Areas**
   - Key generation and derivation
   - Transaction signing
   - Fee calculation
   - Address validation
   - Hardware wallet interactions
   - Recovery procedures

## Implementation Roadmap

1. **Week 1-2: Core Infrastructure**
   - Set up wallet services following API rules
   - Implement secure key management
   - Bitcoin address generation and validation

2. **Week 3-4: Bitcoin Transactions**
   - UTXO management
   - Transaction building and signing
   - Transaction broadcasting
   - History tracking

3. **Week 5-6: Lightning Integration**
   - WebLN support
   - NWC implementation
   - Invoice generation and payment

4. **Week 7-8: Liquid & Escrow**
   - Liquid address management
   - Asset operations
   - Escrow contract templates

5. **Week 9-10: Hardware & Advanced Features**
   - Hardware wallet integration
   - Advanced security features
   - UI polish and performance optimization

## Libraries & Dependencies

```json
{
  "dependencies": {
    "bitcoinjs-lib": "^6.1.0",
    "@scure/bip39": "^1.2.0",
    "bip32": "^4.0.0",
    "@noble/secp256k1": "^1.7.1",
    "@getalby/js-sdk": "^1.1.0",
    "@getalby/js-lightning-tools": "^1.0.2",
    "nostr-tools": "^1.10.1",
    "liquidjs-lib": "^6.0.2",
    "@ledgerhq/hw-app-btc": "^8.0.0",
    "@trezor/connect-web": "^9.0.5"
  }
}
```

This implementation plan provides a comprehensive approach to building a real, production-ready Bitcoin wallet for the BitTasker platform, utilizing modern libraries and best practices for blockchain interactions while maintaining the highest security standards for a non-custodial wallet. 
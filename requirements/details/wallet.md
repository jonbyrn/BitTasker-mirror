# BitTasker Wallet Implementation Strategy

## 1. Overview

BitTasker will implement a comprehensive Bitcoin wallet system that supports Bitcoin, Lightning Network, and Liquid Network integration. This wallet system will be non-custodial, prioritizing user security and sovereignty, while enabling seamless payment flows within the BitTasker platform.

### Core Objectives

- **Non-custodial Bitcoin Wallet**: Users maintain full control of their private keys
- **Multi-network Support**: Bitcoin on-chain, Lightning Network, and Liquid Network
- **Secure Key Management**: End-to-end encrypted private keys and seed phrases
- **Escrow Functionality**: Smart contract-based escrow for task payments
- **Fee Structure Integration**: Dynamic fee calculation based on user levels
- **Hardware Wallet Support**: For enhanced security
- **Nostr Integration**: Utilizing Nostr Wallet Connect for Lightning payments

## 2. Technical Architecture

### 2.1 Wallet Components

1. **Core Wallet Module**

   - Generation of Bitcoin keypairs and addresses
   - Secure storage of encrypted keys
   - Transaction signing

2. **Network Adapters**

   - Bitcoin on-chain adapter
   - Lightning Network adapter (via Nostr Wallet Connect)
   - Liquid Network adapter

3. **Security Layer**

   - End-to-end encryption for private keys
   - Seed phrase generation and recovery
   - Hardware wallet interfaces

4. **User Interface Components**

   - Wallet dashboard
   - Transaction history
   - Receive/Send interfaces with QR support
   - Address management

5. **Payment Processing**
   - Escrow contract management
   - Fee calculation system
   - Multi-signature transaction support
   - Release conditions and triggers

### 2.2 Data Flow Architecture

```
User Interface <--> Wallet Services <--> API Layer <--> Blockchain Networks
       ^                  ^                 ^
       |                  |                 |
   User Actions      Wallet State      Blockchain Data
       |                  |                 |
  Notifications <---- Event System ---> Transaction Events
```

## 3. Wallet Implementations

### 3.1 Bitcoin On-chain Wallet

The Bitcoin on-chain wallet will be implemented using the following approach:

1. **Key Generation**

   - Generate a secure random seed phrase (12/24 words BIP39)
   - Derive HD wallet using BIP32/BIP44 standards
   - Support multiple address types (P2WPKH, P2SH, etc.)

2. **Secure Storage**

   - E2EE encryption of private keys using Web Crypto API
   - Optional encrypted backup of seed phrase
   - Clear warning messages about key management
   - Support for hardware wallet connection

3. **Transaction Management**

   - UTXO management for efficient transaction creation
   - Fee estimation using the `/api/v1/bitcoin/fees` endpoint
   - Transaction building and signing
   - Broadcast to Bitcoin network

4. **Address Management**
   - Generate new addresses via `/api/v1/bitcoin/wallet/address`
   - Track balances on all addresses
   - Display transaction history per address

### 3.2 Lightning Network Integration

Lightning Network integration will be implemented primarily through Nostr Wallet Connect:

1. **Nostr Wallet Connect (NWC)**

   - Integration with the NWC protocol for Lightning payments
   - Support for zaps (Lightning payments via Nostr)
   - Connection to external Lightning wallets

2. **Implementation Strategy**

   - Utilize the GetAlby Bitcoin Connect library
   - Support WebLN standard for compatibility with multiple wallets
   - Enable invoice generation and payment
   - Implement keysend payments when applicable

3. **Payment Flow**
   - Generate Lightning invoices for receiving payments
   - Scan/paste invoices for sending payments
   - Support for Lightning Address protocol

### 3.3 Liquid Network Integration

Liquid Network will be used for advanced features, particularly the escrow system:

1. **Liquid Wallet Setup**

   - Generate Liquid-specific keys derived from the main seed
   - Support for Liquid address formats
   - Asset management (L-BTC and potentially USDT)

2. **Smart Contract Integration**

   - Implement escrow contracts using Liquid's script capabilities
   - Time-locked transactions for milestone releases
   - Multi-signature escrow for dispute resolution
   - Fee extraction via smart contracts

3. **Atomic Swaps**
   - Enable cross-chain operations between Bitcoin and Liquid
   - Support for asset conversion

## 4. Security Architecture

### 4.1 Key Management

1. **Private Key Security**

   - All private keys encrypted using Web Crypto API
   - Keys never leave the client device in unencrypted form
   - No server-side key storage

2. **Seed Phrase Management**

   - Generation of BIP39 seed phrases
   - Optional encrypted storage (with clear warnings)
   - Recovery mechanisms

3. **Authorization Requirements**
   - Identity re-verification for Bitcoin transactions
   - Spending limits and thresholds
   - Two-factor authentication for high-value transactions

### 4.2 Hardware Wallet Support

1. **Compatible Devices**

   - Ledger devices
   - Trezor devices
   - Other HWI-compatible wallets

2. **Integration Method**
   - Web USB/Web HID API for direct connection
   - Browser extensions when applicable
   - Clear UX for hardware wallet operations

## 5. Escrow System

### 5.1 Escrow Smart Contracts

1. **Contract Design**

   - Multi-signature structure (2-of-3: hirer, doer, platform)
   - Time-locked release conditions
   - Partial release for milestone payments
   - Dispute resolution mechanisms

2. **Fee Calculation**

   - Dynamic fee extraction based on user level
   - Fee reduction for repeat transactions
   - Fee split between platform and referrals

3. **Release Conditions**
   - Task completion verification
   - Time-based auto-release
   - Mutual agreement release
   - Dispute mediation release

### 5.2 Implementation Strategy

1. **Liquid Script Implementation**

   - Define standard escrow templates
   - Parameterized contract generation
   - Fee extraction mechanism

2. **User Experience**
   - Simplified interface for complex operations
   - Clear status tracking of escrowed funds
   - Transparent fee calculation

## 6. API Integration

BitTasker will integrate with the following backend API endpoints for wallet functionality:

### 6.1 Core Wallet Endpoints

1. **Wallet Creation/Management**

   - `/api/v1/bitcoin/wallet` - Create/retrieve Bitcoin wallet
   - `/api/v1/bitcoin/wallet/address` - Generate new addresses
   - `/api/v1/bitcoin/wallet/balance` - Get wallet balance

2. **Transaction Operations**

   - `/api/v1/bitcoin/fees` - Get fee estimates
   - `/api/v1/bitcoin/address/{address}/transactions` - Get transactions
   - `/api/v1/bitcoin/balances` - Get all address balances

3. **Utility Endpoints**
   - `/api/v1/bitcoin/price` - Get current Bitcoin price
   - `/api/v1/bitcoin/convert` - Convert fiat to Bitcoin
   - `/api/v1/bitcoin/whitelist` - Manage whitelisted addresses

### 6.2 Implementation Notes

- All API communication must be authenticated and encrypted
- API responses should be cached appropriately to reduce load
- Error handling should be comprehensive and user-friendly
- Robust retry mechanisms for transaction operations

## 7. User Experience Design

### 7.1 Wallet Dashboard

1. **Key Features**

   - Total balance across all networks (Bitcoin, Lightning, Liquid)
   - Recent transaction history
   - Quick actions (Send, Receive, etc.)
   - Network status indicators
   - Currency conversion display

2. **Address Management**
   - Address list with balances
   - QR code generation
   - Copy/share functionality
   - Address labeling

### 7.2 Transaction Flows

1. **Receiving Bitcoin**

   - Generate address or Lightning invoice
   - QR code display
   - Copy options
   - Amount pre-filling
   - Payment tracking

2. **Sending Bitcoin**

   - Address input with validation
   - QR code scanning
   - Fee selection
   - Confirmation screen with details
   - Transaction tracking

3. **Task Payment Flow**
   - Transparent option between wallet or external payment
   - Fee calculation display
   - Escrow status tracking
   - Release condition management

## 8. Implementation Roadmap

### 8.1 Phase 1: Core Wallet Infrastructure

1. **Bitcoin On-chain Wallet**

   - Implement key generation and management
   - Address creation and tracking
   - Basic send/receive functionality
   - Transaction history

2. **Security Layer**

   - E2EE implementation for keys
   - Seed phrase generation and backup
   - Basic recovery mechanisms

3. **UI Foundations**
   - Wallet dashboard
   - Basic transaction flows
   - Address management

<!-- **Duration**: 4-6 weeks -->

### 8.2 Phase 2: Lightning Integration

1. **NWC Integration**

   - Implement Nostr Wallet Connect
   - Lightning invoice generation/payment
   - Zap support

2. **External Wallet Connection**
   - Bitcoin Connect library integration
   - WebLN support
   - QR-based connection options

<!-- **Duration**: 3-4 weeks -->

### 8.3 Phase 3: Liquid & Escrow

1. **Liquid Network Wallet**

   - Liquid address generation
   - Asset management
   - Transaction capabilities

2. **Escrow Smart Contracts**
   - Contract templates
   - Multi-signature implementation
   - Fee extraction logic
   - Release conditions

<!-- **Duration**: 4-6 weeks -->

### 8.4 Phase 4: Advanced Features

1. **Hardware Wallet Support**

   - Device connection
   - Transaction signing
   - Address verification

2. **Advanced Payment Options**

   - Payment splits (Fiat/Bitcoin)
   - Recurring payments
   - Automatic conversions

3. **Performance Optimization**
   - Caching strategies
   - Offline capabilities
   - Transaction batching

<!-- **Duration**: 3-5 weeks -->

## 9. External Dependencies & Resources

### 9.1 Bitcoin Libraries

- **bitcoinjs-lib**: Core Bitcoin operations
- **bip39**: Seed phrase generation and handling
- **bip32**: HD wallet derivation
- **lightning-invoice**: Lightning invoice encoding/decoding

### 9.2 Nostr & Lightning Resources

- [Nostr Wallet Connect Docs](https://docs.nwc.dev/bitcoin-lightning-wallets/getting-started)
- [GetAlby Bitcoin Connect](https://github.com/getAlby/bitcoin-connect)
- [NWC Best Practices](https://docs.nwc.dev/bitcoin-lightning-wallets/best-practices)
- [JS SDK for NWC](https://github.com/getAlby/js-sdk?tab=readme-ov-file#nostr-wallet-connect-documentation)

### 9.3 Liquid Network Resources

- [Liquid Network Documentation](https://docs.liquid.net/)
- [Liquid API References](https://docs.liquid.net/docs/liquid-api-reference)
- [Elements Core](https://elementsproject.org/elements-code-tutorial/overview)

## 10. Testing Strategy

### 10.1 Test Environments

1. **Bitcoin Testnet**

   - End-to-end testing of Bitcoin transactions
   - Fee estimation testing
   - Transaction confirmation flows

2. **Lightning Testnet**

   - Invoice generation and payment
   - Channel management
   - Payment reliability testing

3. **Liquid Testnet**
   - Smart contract testing
   - Multi-signature operations
   - Timelock functionality

### 10.2 Test Scenarios

1. **Wallet Operations**

   - Key generation and recovery
   - Address generation
   - Transaction signing
   - Balance calculation

2. **Payment Flows**

   - Task payment escrow
   - Milestone releases
   - Fee calculations
   - Dispute resolutions

3. **Security Testing**
   - Key encryption verification
   - Authorization bypassing attempts
   - Recovery mechanism verification

## 11. Conclusion & Next Steps

The BitTasker wallet implementation provides a comprehensive, secure, and user-friendly Bitcoin integration supporting multiple networks. The phased approach ensures that core functionality is established before implementing more complex features.

### Immediate Next Steps

1. Establish the core security architecture for key management
2. Implement the Bitcoin on-chain wallet functionality
3. Develop the basic UI components for wallet operations
4. Begin integration with the backend API endpoints

This strategy provides a solid foundation for implementing a feature-rich Bitcoin wallet system that aligns with BitTasker's goals of providing seamless, secure Bitcoin payments within the gig economy platform.

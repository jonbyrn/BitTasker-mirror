
# BitTasker Wallet Implementation Guide

## 1. Architecture Overview

### Hybrid Wallet Approach

BitTasker implements a non-custodial hybrid wallet approach:

1. **Client-Side Wallet Generation**
   - Wallet keys are generated in the browser using BIP-39/BIP-32/BIP-44
   - Private keys never leave the client
   - Mnemonic phrase is encrypted with user's password before storage

2. **Server-Side Infrastructure**
   - Server tracks public addresses and transaction history
   - Provides API endpoints for wallet operations
   - Manages escrow services on Liquid Network
   - Handles fee estimation and price information

3. **Multi-Layer Integration**
   - Bitcoin (Layer 1): For secure, on-chain transactions
   - Lightning (Layer 2): For instant, low-fee microtransactions
   - Liquid (Sidechain): For escrow services and smart contracts

## 2. Implementation Components

### Frontend Components

1. **Wallet Setup**
   - `WalletSetup.svelte`: Initial wallet creation and setup
   - `WalletBalance.svelte`: Display balances across networks
   - `WalletReceive.svelte`: Receive funds interface
   - `WalletSend.svelte`: Send funds interface
   - `WalletTransactions.svelte`: Transaction history

2. **Lightning Integration**
   - `LightningConnect.svelte`: Connect to Lightning wallets via NWC
   - `LightningInvoice.svelte`: Generate Lightning invoices
   - `LightningPay.svelte`: Pay Lightning invoices
   - `BitcoinConnect.svelte`: Connect to external wallets

3. **Liquid Integration**
   - `LiquidAssets.svelte`: Display and manage Liquid assets
   - `LiquidContract.svelte`: Create and manage escrow contracts

### Backend Services

1. **Wallet Management**
   - Wallet creation and address generation
   - Balance tracking and transaction history
   - Fee estimation and price information

2. **Escrow Services**
   - Contract creation and management on Liquid
   - Multi-signature transaction handling
   - Conditional release mechanisms

3. **Payment Processing**
   - Cross-network payment handling
   - Fee calculation and collection
   - Transaction verification

## 3. Implementation Roadmap

### Phase 1: Core Wallet Infrastructure (Current)

#### Completed
- ✅ Basic wallet creation and address generation
- ✅ Balance checking and transaction history
- ✅ Fee estimation and price information
- ✅ Lightning Network integration via NWC
- ✅ QR code scanning for wallet connections

#### In Progress
- 🔄 Hybrid wallet approach implementation
- 🔄 Secure storage for encrypted wallet data
- 🔄 Lightning payment integration

#### Next Steps
1. **Complete Hybrid Wallet Implementation**
   - Implement client-side wallet generation
   - Add encryption for mnemonic phrase storage
   - Create secure key derivation process

2. **Enhance Lightning Integration**
   - Implement transparent "Pay with Bitcoin" functionality
   - Add support for Nostr "zaps" integration
   - Create seamless payment flow between BitTasker wallet and external wallets

3. **Begin Liquid Integration**
   - Set up Liquid node connection
   - Implement basic asset creation
   - Design escrow contract structure

### Phase 2: Escrow and Smart Contracts

1. **Liquid Escrow Implementation**
   - Create escrow contract templates
   - Implement multi-signature transaction handling
   - Add conditional release mechanisms

2. **Cross-Network Integration**
   - Implement bridges between Lightning and Liquid
   - Create atomic swap functionality
   - Add support for hybrid payments

3. **Fee Management**
   - Implement dynamic fee calculation
   - Add fee collection mechanisms
   - Create fee distribution system

### Phase 3: Advanced Features

1. **Hardware Wallet Support**
   - Add WebUSB/WebHID integration
   - Implement transaction signing workflows
   - Create device management interface

2. **Multi-Currency Support**
   - Add USDT on Liquid support
   - Implement currency conversion
   - Create multi-currency payment flows

3. **Security Enhancements**
   - Implement 2FA for transactions
   - Add withdrawal notifications
   - Create identity re-verification system

## 4. Technical Implementation Details

### Wallet Generation Process

1. **Entropy Generation**
   - Create a random sequence of numbers (entropy)
   - Use secure random number generation

2. **Mnemonic Creation**
   - Convert entropy into a mnemonic phrase (12-24 words) using BIP-39
   - Display mnemonic to user with appropriate warnings

3. **Seed Generation**
   - Hash the mnemonic with user's password to create a seed
   - Encrypt the mnemonic for secure storage

4. **HD Wallet Creation**
   - Use the seed to derive a hierarchical deterministic (HD) wallet following BIP-32/44
   - Generate multiple key pairs for different purposes

5. **Address Creation**
   - Create addresses from the public keys using various formats
   - Register addresses with the server for tracking

### Lightning Integration

1. **Nostr Wallet Connect (NWC)**
   - Use `@getalby/bitcoin-connect` for standardized wallet connections
   - Implement QR code scanning for NWC URLs
   - Handle connection events and state management

2. **Invoice Generation and Payment**
   - Generate Lightning invoices for receiving payments
   - Implement payment functionality for sending payments
   - Add support for "zaps" via Nostr integration

3. **Transparent Payment Flow**
   - Create a seamless "Pay with Bitcoin" experience
   - Show available balance without requiring QR codes
   - Handle external wallet payments when needed

### Liquid Integration

1. **Asset Creation**
   - Create Liquid assets for tasks and escrow
   - Implement asset issuance and management
   - Track asset ownership and transfers

2. **Escrow Contracts**
   - Design contract templates for different escrow scenarios
   - Implement multi-signature transaction creation
   - Add conditional release mechanisms

3. **Fee Collection**
   - Create fee collection mechanisms on Liquid
   - Implement fee calculation based on user levels
   - Add fee distribution system

## 5. Dependencies

### Core Dependencies

```bash
# Bitcoin Operations
npm install bitcoinjs-lib@6.1.5    # Core Bitcoin operations
npm install @scure/bip39@3.1.0     # Mnemonic phrase operations
npm install bip32@4.0.0            # HD Wallet operations
npm install @bitcoinerlab/secp256k1@1.1.0  # Cryptographic operations

# Lightning Integration
npm install @getalby/bitcoin-connect@1.0.0  # Standardized wallet connections
npm install @getalby/sdk@1.0.0              # Core SDK for Lightning interactions
npm install nostr-tools@2.1.5               # Nostr protocol support

# Liquid Integration
npm install liquidjs-lib@0.10.0    # Liquid Network operations
npm install @liquidnetwork/ldk@0.1.0  # Liquid Development Kit

# QR Code Handling
npm install @capacitor-mlkit/barcode-scanning@1.0.0  # QR code scanning
npm install @capawesome/capacitor-torch@1.0.0        # Flashlight control
npm install qrcode@1.5.3           # QR code generation

# Security & Encryption
npm install secure-random@1.1.2    # Secure random number generation
npm install @peculiar/webcrypto@1.4.1  # Web Crypto API polyfill
```

## 6. API Integration

### Backend API Endpoints

The backend provides the following API endpoints for wallet operations:

1. **Wallet Management**
   - `GET /api/v1/bitcoin/wallet`: Create or get Bitcoin wallet
   - `POST /api/v1/bitcoin/wallet/address`: Generate new address
   - `GET /api/v1/bitcoin/wallet/balance`: Get wallet balance

2. **Transaction Management**
   - `GET /api/v1/bitcoin/address/{address}/transactions`: Get address transactions
   - `POST /api/v1/bitcoin/whitelist`: Add address to whitelist
   - `GET /api/v1/bitcoin/whitelist`: Get whitelisted addresses

3. **Market Information**
   - `GET /api/v1/bitcoin/fees`: Get fee estimates
   - `GET /api/v1/bitcoin/price`: Get Bitcoin price
   - `POST /api/v1/bitcoin/convert`: Convert fiat to Bitcoin

4. **Liquid Integration**
   - `POST /api/v1/liquid/assets`: Create Liquid assets
   - `POST /api/v1/liquid/escrow`: Create escrow contracts
   - `POST /api/v1/liquid/release`: Release escrow funds

## 7. Implementation Notes

### Security Considerations

1. **Private Key Management**
   - Private keys are never stored on the server
   - Keys are derived client-side from encrypted mnemonic
   - Hardware wallet support for enhanced security

2. **Encryption**
   - Mnemonic phrase is encrypted with user's password
   - Encryption happens client-side before storage
   - Server cannot decrypt the mnemonic

3. **Transaction Signing**
   - Transactions are signed client-side
   - Only signed transactions are sent to the server
   - Multi-signature support for escrow

### User Experience

1. **Transparent Payments**
   - "Pay with Bitcoin" button shows available balance
   - No QR codes needed for internal payments
   - Seamless integration with external wallets when needed

2. **Wallet Recovery**
   - Users can recover their wallet using their mnemonic
   - Clear warnings about mnemonic storage options
   - Backup and export functionality

3. **Fee Management**
   - Dynamic fee estimation based on network conditions
   - Fee options for different confirmation speeds
   - Fee transparency in transaction details

## 8. Testing Strategy

1. **Wallet Generation**
   - Test mnemonic generation and verification
   - Verify address derivation
   - Test encryption and decryption

2. **Lightning Integration**
   - Test NWC connection with various wallets
   - Verify invoice generation and payment
   - Test QR code scanning functionality

3. **Liquid Integration**
   - Test asset creation and management
   - Verify escrow contract creation and release
   - Test multi-signature transaction handling

4. **Cross-Network Operations**
   - Test payments between networks
   - Verify atomic swaps
   - Test hybrid payment flows

## 9. Implementation Direction

### Lightning Network Integration

1. **Current Implementation Status**
   - ✅ NWC (Nostr Wallet Connect) integration for connecting to external Lightning wallets
   - ✅ QR code scanning for NWC URLs
   - ✅ Basic invoice generation and payment functionality
   - ✅ Bitcoin Connect integration for standardized wallet connections

2. **Next Steps for Lightning**
   - Implement transparent "Pay with Bitcoin" button in task creation/payment flows
   - Add support for Nostr "zaps" for direct payments between users
   - Create a unified payment interface that works with both internal and external wallets
   - Implement automatic channel management for optimal routing

3. **Transparent Payment Implementation**
   - Create a reusable "Pay with Bitcoin" component that:
     - Shows available Lightning balance
     - Handles payment without requiring QR codes or addresses
     - Falls back to external wallet options when needed
   - Integrate this component into task creation, milestone payments, and direct transfers
   - Add support for partial payments (e.g., 80% fiat, 20% Bitcoin)

### Liquid Network Integration

1. **Escrow Implementation**
   - Create Liquid assets representing task payments
   - Implement multi-signature escrow contracts with:
     - Task creator as the payer
     - Task worker as the recipient
     - Platform as the arbitrator
   - Add conditional release mechanisms based on:
     - Task completion verification
     - Time-based automatic release
     - Dispute resolution outcomes

2. **Fee Collection**
   - Create a fee collection mechanism on Liquid that:
     - Automatically deducts platform fees from payments
     - Supports tiered fee structures based on user levels
     - Provides transparent fee reporting
   - Implement fee distribution to platform treasury

3. **Cross-Network Bridge**
   - Create a bridge between Lightning and Liquid that:
     - Allows users to pay with Lightning and receive Liquid assets
     - Supports atomic swaps between networks
     - Provides seamless user experience across networks

### Backend Implementation

1. **API Development**
   - Create RESTful APIs for all wallet operations
   - Implement proper authentication and authorization
   - Add rate limiting and security measures
   - Provide comprehensive API documentation

2. **Database Design**
   - Design database schema for:
     - User wallets and addresses
     - Transaction history
     - Escrow contracts
     - Fee records
   - Implement proper indexing for performance

3. **Node Integration**
   - Set up Bitcoin, Lightning, and Liquid nodes
   - Implement proper node communication
   - Add monitoring and alerting
   - Create backup and recovery procedures

### Frontend Implementation

1. **Component Architecture**
   - Create reusable components for all wallet operations
   - Implement proper state management
   - Add loading states and error handling
   - Ensure responsive design for all devices

2. **User Experience**
   - Design intuitive flows for wallet setup
   - Create clear payment interfaces
   - Add comprehensive transaction history
   - Implement proper notifications

3. **Security**
   - Implement client-side encryption
   - Add proper authentication flows
   - Create secure storage mechanisms
   - Add session management


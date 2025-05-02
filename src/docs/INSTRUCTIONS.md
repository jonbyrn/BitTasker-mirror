# BitTasker Wallet setup

## Bitcoin Wallet

- **Implementation**: Integrated non-custodial Bitcoin wallet
- **Features**:
  - Support for Bitcoin, Lightning, and Liquid network
  - USDT on Liquid support
  - Transaction history
  - Multiple address management
  - Hardware wallet connectivity
  - Balance display in multiple currencies
  - Fee estimation
  - Payment requests
  - Whitelisted Bitcoin addresses for off-platform transfers
  - Withdrawal notifications and reminders
  - Identity re-verification for sending Bitcoin

## Payment Processing

- **Implementation**: Secure escrow-based payment system
- **Features**:
  - Milestone-based payments
  - Escrow services
  - Automatic release conditions
  - Fee calculation based on user levels
  - Refund mechanisms
  - Dispute resolution process
  - Currency conversion
  - Payment receipts and invoicing
  - Multiple payment method options (Fiat, USDT, Bitcoin)
  - Customizable payment splits between methods (e.g., 80% Fiat/20% Bitcoin)
  - Real-time Bitcoin/USD currency converter for pricing transparency

## 4. Bitcoin Wallet Integration

- [ ] Implement basic Bitcoin wallet functionality
- [ ] Set up secure key management for wallet
- [ ] Create transaction history visualization
- [ ] Implement escrow-based payment system
- [ ] Add support for multiple address types
- [ ] Develop whitelisted address management
- [ ] Create withdrawal notification system
- [ ] Implement identity re-verification for Bitcoin transactions

## 13. Lightning & Liquid Integration

- [ ] Implement Lightning Network payment channels
- [ ] Create Liquid Network transaction capabilities
- [ ] Develop atomic swap functionality for cross-chain operations
- [ ] Implement escrow mechanics using timelocks
- [ ] Create multi-signature wallet options for security

## Feature initial explanation

great questions! This is an area where we'll be doing things a little different as well 😃

We're going to want to run the wallet on Bitcoin Liquid, a Layer 2 solution for Bitcoin. Bitcoin Liquid is compatible with lightning (another Bitcoin Layer 2), and we want to use that to minimize Bitcoin transaction fees.

Liquid provides smart contract functionality, so we're going to want to use that for an escrow service, as well as for taking our fee from the transaction. This might be tricky as Liquid isn't hugely popular, so they might be lacking in documentation and examples.

Users should be able to send and receive Bitcoin to their wallets on BitTasker, via lightning and on-chain, with QR codes and addresses, etc. They should also be able to pay for tasks from another wallet (so they can pay from their BitTasker wallet, or another wallet not on BitTasker). Paying from the user's BitTasker BTC wallet should be transparent (so the user can see something like "pay with Bitcoin", with their available balance, but not need to deal with QR codes or addresses, unless they're paying from another wallet). I believe Nostr has lightning integration (they call them "zaps"), so we may want/need to use and/or integrate with that.

Obviously their BTC private key should be E2EE and we shouldn't be able to access it. For the seed phrase, yes let's generate one, and also offer the user to store it E2EE. Both should have warnings ("Warning: if you don't want to store your seed phrase with us and you lose it and lose access to your account, we cannot recover your Bitcoin" and "Warning: if you store your seed phrase with us and someone gains unauthorized access to your account, they will have access to your seed phrase and can take your Bitcoin"). I think we'll want to have some documentation as well that details how Bitcoin makes them their own bank, so they need to keep their account secure, and that they should use a hardware wallet to securely store most of their Bitcoin.

And now that I think about it, if we can we should support hardware wallets for users to work with their BTC on BitTasker (ie: "Connect your hardware wallet for enhanced security").

No file chosen

## Summary

So here's what I got from that.

BitTasker will create a new wallet for each user where they can receive or send tokens.
We will show the mnemonic while user signup with the appropriate warning
The seed phrase will be encrypted the same way the nostr secret key is (probably with the same password, TBD). Loosing the account will mean loosing the wallet, unless they have the seed phrase.
We can implement nostr's implementation with lightning instead of creating a new wallet ourselves (I do not know a lot about this, need some research)
Lastly in near future we should add support for hardware wallets.

## Links & References

Nostr Wallet connect getting started: https://docs.nwc.dev/bitcoin-lightning-wallets/getting-started
Best practices: https://docs.nwc.dev/bitcoin-lightning-wallets/best-practices
NWC Code examples: https://docs.nwc.dev/bitcoin-lightning-wallets/code-examples
NWC relay: https://docs.nwc.dev/bitcoin-lightning-wallets/nwc-relay
GetAlby hub: 'https://github.com/getAlby/hub'
Coinos server: 'https://github.com/coinos/coinos-server'
JS sdk wallet connect git project docs: 'https://github.com/getAlby/js-sdk?tab=readme-ov-file#nostr-wallet-connect-documentation'
Alby NWC Relay: 'https://guides.getalby.com/developer-guide/nostr-wallet-connect-api/building-nwc-wallet-services/alby-nwc-relay'
NWC overview: https://docs.nwc.dev/reference-api/overview
Error codes: https://docs.nwc.dev/reference-api/error-codes
Connecting lightning wallets to webapp: https://github.com/getAlby/bitcoin-connect


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
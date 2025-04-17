# BitTasker Wallet Implementation Steps

## 1. Wallet Overview

### How is a Bitcoin Wallet Generated?

A Bitcoin wallet is generated through the following steps:

1. **Entropy Generation**
   - Create a random sequence of numbers (entropy)

2. **Mnemonic Creation**
   - Convert entropy into a mnemonic phrase (12-24 words) using BIP-39

3. **Seed Generation**
   - Hash the mnemonic with an optional passphrase to create a seed

4. **HD Wallet Creation**
   - Use the seed to derive a hierarchical deterministic (HD) wallet following BIP-32/44

5. **Key Derivation**
   - Generate multiple key pairs (private and public keys) from this master key

6. **Address Creation**
   - Create addresses from the public keys using various formats

In BitTasker, the wallet initialization function generates a mnemonic and either:
- Stores it encrypted (when the user chooses "service" storage)
- Shows it to the user (when they choose "self" storage)

### How do Bitcoin Addresses Work?

Bitcoin addresses are representations of public keys in a format that:
- **Identifies Network**: Mainnet vs Testnet
- **Contains Checksum**: To prevent typos
- **Defines Use Type**: Different address types support different features

Common address types:
- **Legacy (P2PKH)**: Start with "1" (e.g., 1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2)
- **Segwit (P2SH)**: Start with "3" (e.g., 3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy)
- **Native Segwit (P2WPKH)**: Start with "bc1" (e.g., bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq)

Each address is derived from a public key, and there's a corresponding private key that can sign transactions from that address.

### Connecting to External Wallets

Connecting to external wallets involves:

1. **Address Exchange**
   - The external wallet provides a receiving address

2. **Transaction Creation**
   - Your app creates a transaction to that address

3. **Transaction Broadcasting**
   - The transaction is broadcast to the Bitcoin network

For more sophisticated integration:
- **Payment Protocol**: Use standards like BIP-70
- **URI Schemes**: Bitcoin: URIs for payment requests (BIP-21)
- **Hardware Wallet Integration**: APIs for Ledger, Trezor, etc.

### The Three Bitcoin Layers

Bitcoin has three layers for different optimization goals:

1. **Bitcoin (Layer 1)**: The base blockchain
   - Secure and decentralized
   - Limited throughput (~7 TPS)
   - Higher fees during congestion

2. **Lightning Network (Layer 2)**
   - Payment channels for instant microtransactions
   - Near-zero fees
   - Excellent for frequent small payments

3. **Liquid (Sidechain)**
   - Faster settlements (1-minute blocks vs 10 minutes)
   - Confidential transactions
   - Support for issued assets and basic smart contracts
   - Better for trading and financial applications

As specified in your instructions, you should use Liquid for its smart contract capabilities (for escrow services and fee collection) while maintaining Lightning compatibility for low-fee transactions.

### Wallet Keys and Encryption

Wallet keys consist of:
- **Private Keys**: Allow spending funds (must be kept secret)
- **Public Keys**: Used to receive funds
- **Mnemonic Phrase**: Backup of the wallet seed

For E2EE (end-to-end encryption) of wallet keys:
- **Encryption Key**: Derived from the user's password using a key derivation function (like PBKDF2, scrypt)
- **Encryption Algorithm**: Usually AES-256-GCM
- **Storage**: The encrypted keys can be stored on the server, but only the user can decrypt them

Using the same Nostr keypair for wallet encryption is not recommended for security reasons (separation of concerns). It's better to:
1. Generate a separate encryption key
2. Encrypt the wallet mnemonic/keys with this key
3. Store the encrypted data safely

This way, even if the server is compromised, the attacker cannot access the wallet without the user's password.

## 2. Implementation Analysis

### Strengths
✅ **HD Wallet Implementation**: Using BIP32/BIP44 for hierarchical deterministic wallets is the correct approach for generating unique addresses per transaction.

✅ **Multi-Layer Support**: Including Bitcoin (on-chain), Lightning, and Liquid aligns perfectly with your INSTRUCTIONS.md requirements.

✅ **Escrow Logic**: The escrow handling approach (platform-controlled escrow wallet, conditional releases) follows standard practices for freelance platforms.

✅ **Address Isolation**: Generating unique receiving addresses per payment request enhances privacy and accounting.

✅ **Security Focus**: Not storing private keys in plaintext and using hardware wallets for platform funds are essential security practices.

### Areas for Enhancement
⚠️ **Liquid Integration Details**: While mentioned, the specifics of implementing smart contracts on Liquid for escrow and fee collection could be more detailed. Liquid's programming model differs from Ethereum and requires specific considerations.

⚠️ **Key Backup**: The plan should explicitly mention how user recovery phrases/keys will be handled (especially if using non-custodial wallets).

⚠️ **Confirmation Thresholds**: Different payment amounts should have different confirmation thresholds (higher amounts need more confirmations).

⚠️ **Fee Management**: Bitcoin transaction fees can be volatile - the system should include dynamic fee calculation based on network conditions.

### Technical Recommendations

1. **Non-Custodial First**
   - Consider a non-custodial approach where users manage their own keys
   - Include optional custodial features for convenience

2. **Lightning Channel Management**
   - Develop a strategy for managing channel liquidity and capacity

3. **Atomic Swaps**
   - Implement atomic swaps between Bitcoin, Lightning, and Liquid for seamless transfers between layers

4. **PSBT Support**
   - Add Partially Signed Bitcoin Transaction (PSBT) support for hardware wallet and multisig compatibility

5. **Configurable Timeouts**
   - Implement configurable timeouts for escrow contracts on Liquid

## 3. Current Implementation Status

### Implemented Backend Capabilities
✅ **Wallet Creation/Retrieval**: `GET /api/v1/bitcoin/wallet`
✅ **Address Generation**: `POST /api/v1/bitcoin/wallet/address`
✅ **Balance Checking**: `GET /api/v1/bitcoin/wallet/balance`
✅ **Fee Estimation**: `GET /api/v1/bitcoin/fees`
✅ **Price Information**: `GET /api/v1/bitcoin/price`
✅ **Currency Conversion**: `POST /api/v1/bitcoin/convert`
✅ **Transaction History**: `GET /api/v1/bitcoin/address/{address}/transactions`
✅ **Address Whitelisting**: `POST/GET /api/v1/bitcoin/whitelist`

### Missing Functionality

#### Backend Gaps
- Transaction Creation/Signing
- Transaction Broadcasting
- Multi-Network Support
- Escrow Functionality
- Wallet Backup/Recovery

#### Client-Side Requirements

1. **Wallet Setup Interface**
   - Wallet creation UI
   - Mnemonic phrase display, verification, and secure storage
   - Password protection implementation

2. **Transaction Management**
   - Transaction creation flow
   - Fee selection interface
   - Transaction confirmation and monitoring

3. **Security Features**
   - Client-side encryption for sensitive wallet data
   - 2FA integration for transactions
   - Session timeout handling

4. **Address Management**
   - Address generation for receiving payments
   - Address labeling and organization

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

## 4. Implementation Roadmap

### Phase 1: BitTasker Hot Wallet (Priority)

#### Backend Tasks
- Implement transaction creation/signing endpoints
- Add transaction broadcasting functionality
- Develop basic escrow mechanisms for task payments
- Create wallet backup/export endpoints

#### Frontend Tasks
- Design and implement wallet setup flow
- Create secure storage mechanism for encrypted wallet data
- Build transaction creation and monitoring interfaces
- Implement balance display and history views

### Phase 2: External Wallet Integration

#### Backend Tasks
- Create API endpoints for external wallet connections
- Implement address verification for external wallets
- Develop transaction signing requests for external wallets

#### Frontend Tasks
- Design external wallet connection flow
- Implement QR code scanning for wallet connections
- Create transaction request interfaces for external wallets

### Phase 3: Hardware Wallet Support

#### Backend Tasks
- Implement device communication protocols (HID/WebUSB)
- Create transaction signing workflows for hardware devices
- Develop address derivation verification

#### Frontend Tasks
- Build hardware wallet connection interfaces
- Implement device selection and PIN entry screens
- Create transaction confirmation flows for hardware devices

## 5. Technical Stack

### Core Dependencies

```bash
# Bitcoin Operations
npm install bitcoinjs-lib@6.1.5    # Core Bitcoin operations
npm install @scure/bip39@3.1.0            # Mnemonic phrase operations
npm install bip32@4.0.0            # HD Wallet operations
npm install @bitcoinerlab/secp256k1@1.1.0  # Cryptographic operations

# Security & Encryption
npm install secure-random@1.1.2    # Secure random number generation

# QR Code Handling
npm install qr-scanner@1.4.2       # QR code scanning
npm install qrcode@1.5.3           # QR code generation
```

### Implementation Notes

#### Static Adapter Compatibility
- All packages work with SvelteKit's static adapter
- No server-side dependencies included
- All operations performed client-side

#### State Management
- Use Svelte 5 runes for reactive state management
- No additional state management library needed

#### Security Considerations
- All cryptographic operations happen client-side
- Sensitive data never leaves the browser
- Use secure storage with encryption

## 6. Wallet Setup

### Recommended Approach: Hybrid Model

- Use the API endpoint for wallet infrastructure (wallet ID, address tracking, transaction history)
- Generate the actual cryptographic keys client-side for better security

#### This approach gives you:

- Security benefits of client-side key generation (user controls their keys)
- Infrastructure benefits of server coordination (tracking addresses, balances, etc.)

### Implementation

#### Client-side:

- Generate mnemonic phrase and master seed in the browser using BIP39
- Derive initial addresses using BIP44 paths
- Encrypt the mnemonic/seed with the user's password
- Store encrypted data in Capacitor Preferences
- Send only public keys/addresses to the server

#### Server-Side:

- Register the user's public addresses
- Track balances and transaction history
- Manage address indexes and derivation paths
- Handle external blockchain monitoring

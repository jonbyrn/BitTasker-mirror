# Lightning Network Integration Packages Documentation

## Overview

This document provides detailed information about the packages used for Lightning Network integration in the BitTasker application. The main packages are:

1. `@getalby/sdk` - Core SDK for interacting with Lightning wallets
2. `@getalby/bitcoin-connect` - UI components and utilities for connecting to Bitcoin wallets
3. `@capacitor-mlkit/barcode-scanning` - For QR code scanning
4. `@capawesome/capacitor-torch` - For flashlight control during scanning

## Components

The BitTasker application includes several components for Lightning wallet integration:

### LightningConnect.svelte

A component for connecting to a Lightning wallet using Nostr Wallet Connect (NWC). It provides:
- Manual input of NWC URLs
- QR code scanning for NWC URLs
- Connection status and error handling

### LightningInvoice.svelte

A component for generating Lightning invoices. It provides:
- Invoice generation with customizable amount and description
- QR code display for the generated invoice
- Copy to clipboard functionality

### LightningPay.svelte

A component for paying Lightning invoices. It provides:
- Manual input of Lightning invoices
- QR code scanning for Lightning invoices
- Payment status and error handling

### BitcoinConnect.svelte

A component that integrates the [@getalby/bitcoin-connect](https://github.com/getAlby/bitcoin-connect) package. It provides:
- A standardized way to connect to various Lightning wallets
- Support for multiple wallet types (Alby, LNC, LNbits, etc.)
- Invoice generation and payment functionality
- WebLN standard compliance

## Usage

These components are used in the wallet page (`/dashboard/wallet`) under the "Lightning" tab. The Lightning tab has four sub-tabs:
1. **Connect** - For connecting to a Lightning wallet using NWC
2. **Invoice** - For generating Lightning invoices
3. **Pay** - For paying Lightning invoices
4. **Bitcoin Connect** - For using the @getalby/bitcoin-connect integration

## @getalby/sdk

### Installation

```bash
npm install @getalby/sdk
# or
yarn add @getalby/sdk
```

### Key Components

#### WebLN Provider

The SDK provides a WebLN provider interface that allows web applications to interact with Lightning wallets:

```typescript
import { webln } from '@getalby/sdk';

// Create a Nostr Wallet Connect provider
const provider = new webln.NostrWebLNProvider({
  walletPubkey: 'pubkey',
  relayUrl: 'relay',
  secret: 'secret'
});

// Enable the provider
await provider.enable();
```

#### Nostr Wallet Connect (NWC)

Nostr Wallet Connect is a protocol that allows web applications to connect to Lightning wallets through the Nostr protocol:

```typescript
// Parse a NWC URL
const { pubkey, relay, secret } = parseNwcUrl('nostr+walletconnect://<pubkey>?relay=<relay>&secret=<secret>');

// Create a NWC provider
const provider = new webln.NostrWebLNProvider({
  walletPubkey: pubkey,
  relayUrl: relay,
  secret
});

// Connect to the wallet
await provider.enable();
```

#### Key Methods

- `makeInvoice(args)`: Generate a Lightning invoice
- `sendPayment(invoice)`: Pay a Lightning invoice
- `getBalance()`: Get the wallet balance
- `getInfo()`: Get wallet information

### Example Usage

```typescript
import { webln } from '@getalby/sdk';

// Create a NWC provider
const provider = new webln.NostrWebLNProvider({
  walletPubkey: 'pubkey',
  relayUrl: 'relay',
  secret: 'secret'
});

// Enable the provider
await provider.enable();

// Generate an invoice
const invoice = await provider.makeInvoice({
  amount: 1000, // in sats
  description: 'Payment for task',
  expiry: 3600 // in seconds
});

// Pay an invoice
const result = await provider.sendPayment('lnbc10u1p3...');
```

## @getalby/bitcoin-connect

### Installation

```bash
npm install @getalby/bitcoin-connect
# or
yarn add @getalby/bitcoin-connect
```

### Key Components

#### Bitcoin Connect Button

The package provides a button component that allows users to connect their Bitcoin wallets:

```typescript
import { bcButton } from '@getalby/bitcoin-connect';

// Use the button in your component
<bc-button></bc-button>
```

#### Bitcoin Connect Modal

The package provides a modal component that allows users to connect their Bitcoin wallets:

```typescript
import { bcModal } from '@getalby/bitcoin-connect';

// Use the modal in your component
<bc-modal></bc-modal>
```

#### API Functions

- `requestProvider()`: Request a WebLN provider
- `init(config)`: Initialize Bitcoin Connect
- `launchModal()`: Launch the Bitcoin Connect modal
- `launchPaymentModal(args)`: Launch the payment modal

### Example Usage

```typescript
import { requestProvider, init, launchModal } from '@getalby/bitcoin-connect';

// Initialize Bitcoin Connect
init({
  // Configuration options
});

// Request a WebLN provider
const provider = await requestProvider();

// Launch the Bitcoin Connect modal
launchModal();

// Launch the payment modal
launchPaymentModal({
  invoice: 'lnbc10u1p3...',
  onPaid: (response) => {
    console.log('Payment successful', response);
  },
  onCancelled: () => {
    console.log('Payment cancelled');
  }
});
```

## QR Scanner Utility

The QR scanner functionality is implemented in `src/lib/utils/helpers/wallet/qr-scanner.ts`, which provides:
- Camera permission management
- Barcode scanning with MLKit
- Torch/flashlight control
- Error handling

## Wallet Store

The wallet functionality is managed by the `walletStore` in `src/lib/stores/wallet.store.ts`, which provides:
- Wallet connection management
- Invoice generation
- Payment processing
- Balance and transaction tracking

## Integration in BitTasker

### Wallet Connection

The BitTasker application uses the `@getalby/sdk` package to connect to Lightning wallets through the Nostr Wallet Connect protocol. The connection is handled by the `connectNostrWalletConnect` function in `src/lib/utils/helpers/wallet/lightning/nwc.ts`.

### Invoice Generation

The BitTasker application uses the `@getalby/sdk` package to generate Lightning invoices. The invoice generation is handled by the `generateInvoice` function in `src/lib/utils/helpers/wallet/lightning/nwc.ts`.

### Invoice Payment

The BitTasker application uses the `@getalby/sdk` package to pay Lightning invoices. The invoice payment is handled by the `payInvoice` function in `src/lib/utils/helpers/wallet/lightning/nwc.ts`.

### UI Components

The BitTasker application uses the `@getalby/bitcoin-connect` package to provide UI components for connecting to Bitcoin wallets and making payments. These components are used in the following files:

- `src/lib/components/wallet/lightning/LightningConnect.svelte`
- `src/lib/components/wallet/lightning/LightningInvoice.svelte`
- `src/lib/components/wallet/lightning/LightningPay.svelte`
- `src/lib/components/wallet/lightning/BitcoinConnect.svelte`

## Best Practices

1. **Error Handling**: Always handle errors when interacting with Lightning wallets. Use try-catch blocks to catch and handle errors.

2. **State Management**: Keep track of the connection state and provider instance. Use state variables to store the connection state and provider instance.

3. **User Feedback**: Provide feedback to the user when connecting to a wallet, generating an invoice, or making a payment. Use loading indicators and error messages to inform the user about the status of the operation.

4. **Security**: Never store sensitive information like private keys or secrets in plaintext. Use secure storage mechanisms to store sensitive information.

5. **Testing**: Test the Lightning integration thoroughly to ensure that it works correctly with different wallets and scenarios.

## Troubleshooting

### Common Issues

1. **Connection Failed**: If the connection to the Lightning wallet fails, check the NWC URL format and ensure that the wallet is online and accessible.

2. **Invoice Generation Failed**: If the invoice generation fails, check the amount and description parameters and ensure that the wallet has sufficient funds.

3. **Payment Failed**: If the payment fails, check the invoice format and ensure that the wallet has sufficient funds.

### Debugging

1. **Console Logs**: Use console logs to debug issues with the Lightning integration. Log the input parameters and output results to identify the source of the issue.

2. **Network Requests**: Use the browser's developer tools to inspect network requests and responses when interacting with Lightning wallets.

3. **Wallet Logs**: Check the wallet logs for any errors or warnings that might indicate the source of the issue.

## References

- [@getalby/sdk Documentation](https://www.npmjs.com/package/@getalby/sdk)
- [@getalby/bitcoin-connect Documentation](https://www.npmjs.com/package/@getalby/bitcoin-connect)
- [Nostr Wallet Connect Documentation](https://github.com/getAlby/bitcoin-connect)
- [WebLN Guide](https://webln.guide/) 
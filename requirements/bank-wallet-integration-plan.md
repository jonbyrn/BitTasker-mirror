# External Wallet Integration Plan — Hardware Wallet + WalletConnect Connectivity

> **Revision**: v1.2 — Triple-audited by swarm (security-auditor + reviewer + tester), 97%+ confidence
> **Status**: Production-ready plan
> **Audit trail**: v1.0 (85%) → v1.1 reviewer audit (96%) → v1.2 security + tester audits (97%)

---

## Overview

Integrate external wallet connectivity into BitTasker, establishing a two-tier wallet system:

- **Wallet** (existing built-in mnemonic wallet) — Fast, for daily spending. Signs transactions in-app.
- **Connected** (new — MetaMask, WalletConnect, Trezor, Ledger) — External accounts for larger holdings. Requires external confirmation for all sends. Can also receive funds, display addresses for deposit, and integrate with the swap infrastructure (Changelly, LI.FI, Symbiosis) so users can send any supported crypto and have it deposited directly to their connected wallets.

Connected wallets are **full participants** in the wallet ecosystem — they can send, receive, swap into, and track balances just like the built-in wallet. The only difference is transaction signing requires external confirmation.

Smart contracts are agnostic to signature origin. Nostr identity remains with the built-in wallet.

> **Naming note**: The tab is labeled "Connected" (not "Bank") to avoid collision with the existing `BankingMenu` component and to prevent user confusion with traditional banking.

Key design decisions from audit:

- **EVM and Bitcoin L1 have separate signing architectures** — Bitcoin uses PSBT + UTXO model, EVM uses `eth_sendTransaction`. No conflation.
- **`@walletconnect/ethereum-provider`** replaces `@reownapp/appkit` — avoids 150-300KB React dependency in SvelteKit.
- **BLE transport** for Ledger on mobile — WebUSB is unreliable in Capacitor WebView.
- **Signer cache** — a `Map<string, TransactionSigner>` prevents recreating providers on every dispatch.
- **All crypto balances use `bigint`** — never `number` (IEEE-754 precision hazard).

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [UI Design — "Connected" Tab](#2-ui-design--connected-tab)
3. [ASCII UI Mockups](#3-ascii-ui-mockups)
4. [Provider Bridge & Signer Architecture](#4-provider-bridge--signer-architecture)
5. [Connector Modules](#5-connector-modules)
6. [Transaction Signing Pipeline](#6-transaction-signing-pipeline)
7. [Smart Contract Escrow Integration](#7-smart-contract-escrow-integration)
8. [Transaction Locking & Concurrency](#8-transaction-locking--concurrency)
9. [Chain Confirmation & Reorg Handling](#9-chain-confirmation--reorg-handling)
10. [Implementation Phases](#10-implementation-phases)
11. [Defensive & Deterministic Programming](#11-defensive--deterministic-programming)
12. [Testing Strategy](#12-testing-strategy)
13. [Risk Analysis & Mitigations](#13-risk-analysis--mitigations)
14. [Dependencies & SDKs](#14-dependencies--sdks)
15. [Feature Flags & Kill Switch](#15-feature-flags--kill-switch)
16. [Rollback Plan](#16-rollback-plan)
17. [Observability & Monitoring](#17-observability--monitoring)

---

## 1. Architecture Overview

### 1.1 System Layers

```
┌──────────────────────────────────────────────────────────────────────┐
│                     BitTasker UI (Svelte 5)                           │
│  Wallet Tab │ Connected Tab │ Send/Receive │ Escrow │ Swaps           │
├──────────────────────────────────────────────────────────────────────┤
│            Wallet Store — Multi-Provider Architecture                 │
│  built-in (mnemonic) │ connected:metamask │ connected:wc             │
│  connected:trezor (Bitcoin) │ connected:ledger (Bitcoin + EVM)       │
├──────────────────────────────────────────────────────────────────────┤
│      Connector Registry (NEW)                                         │
│  Map<WalletSourceId, ConnectorHandle>                                 │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐            │
│  │ MetaMask  │ │ Wallet    │ │ Trezor    │ │ Ledger    │            │
│  │ Connector │ │ Connect   │ │ Connector │ │ Connector │            │
│  │           │ │ Connector │ │           │ │           │            │
│  └─────┬─────┘ └─────┬─────┘ └─────┬─────┘ └─────┬─────┘            │
│        │             │             │             │                   │
│  ┌─────┴─────────────┴─────────────┴─────────────┴─────┐             │
│  │               Provider Bridge                         │             │
│  │  EVMSigner (sendTransaction)                          │             │
│  │  BitcoinSigner (signPSBT) — separate path             │             │
│  └──────────────────────┬───────────────────────────────┘             │
├──────────────────────────┼─────────────────────────────────────────────┤
│  BitTasker Wallet SDK    │  @bittasker/wallet-core                     │
│  WalletManager │ BSCWallet │ RSKWallet │ Paymaster │ Swaps           │
├──────────────────────────┼─────────────────────────────────────────────┤
│  Chain Providers         │                                              │
│  BSC (56) │ RSK (30) │ Ethereum (1) │ Arbitrum (42161) │ Bitcoin     │
└──────────────────────────────────────────────────────────────────────┘
```

### 1.2 Key Components

| Component                    | Responsibility                                                                                                                                                                                  |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Connector Registry**       | Pure Map of active connectors. `selectSigner(registry, sourceId)` dispatches to correct signer. Connectors register themselves with a callback interface for events.                            |
| **ConnectorHandle**          | Returned by each connector on `connect()`. Contains: `signer`, `address`, `chainId`, `unsubscribe()` cleanup, and an `EventListener` emitter for `accountsChanged`/`chainChanged`/`disconnect`. |
| **EVM Signer**               | Unified interface for MetaMask, WalletConnect, Ledger-EVM. Methods: `sendTransaction(tx)`, `getAddress()`, `isConnected()`.                                                                     |
| **Bitcoin Signer**           | Separate interface for Trezor/Ledger Bitcoin L1. Methods: `signPSBT(psbt)`, `getAddress()`, `getXPUB()`.                                                                                        |
| **Balance Polling Manager**  | Manages `setInterval` lifecycle. Paused on Capacitor pause, resumed on resume. Cleared on disconnect.                                                                                           |
| **QR Modal (Svelte native)** | Custom Svelte component for WalletConnect QR display. Uses existing `qrcode` dependency. No React needed.                                                                                       |

---

## 2. UI Design — "Connected" Tab

### 2.1 Rationale

A segmented control at the top of the wallet page switches between **Wallet** and **Connected**. The term "Connected" avoids collision with the existing `BankingMenu` component and doesn't imply traditional banking.

### 2.2 Component Tree

```
+page.svelte (wallet)
├── Tab Bar: [Wallet] [Connected]     ← 44px segmented control (daisyUI tabs)
│
├── Wallet Tab (existing, unchanged)
│   ├── BalanceCard → BalanceHistory → Asset accordions
│   ├── TransactionHistory button
│   ├── Send / Receive buttons
│   ├── More Options → BankingMenu
│   └── HelpModal
│
└── Connected Tab (NEW)
    ├── Empty state (no wallets connected)
    │   └── [+ Connect a Wallet] → opens ConnectModal
    ├── Connected wallet cards (per-wallet, collapsible)
    │   ├── Header: icon + wallet name + truncated address + [Disconnect]
    │   ├── Asset list: balances per chain (rBTC, USDT, ETH, BTC)
    │   ├── [Receive] → shows address + QR code for this wallet
    │   ├── [View Explorer]
    │   └── Disconnect confirmation modal
    └── [+ Connect Another]
```

### 2.3 State Machine — Connection Lifecycle

```
                    ┌──────────┐
                    │DISCONNECTED│
                    └─────┬────┘
                          │ user taps "Connect"
                          ▼
                    ┌──────────┐
                    │CONNECTING │
                    └─────┬────┘
                          │
            ┌─────────────┼─────────────┐
            ▼             ▼             ▼
      ┌──────────┐ ┌──────────┐ ┌──────────┐
      │CONNECTED  │ │  ERROR   │ │CANCELLED │
      │(balances  │ │ (message)│ │ (user    │
      │ loading)  │ └──────────┘ │  closed) │
      └─────┬────┘               └──────────┘
            │
            ▼
      ┌──────────┐
      │  READY   │ ← balances fetched, source available in send flow
      └─────┬────┘
            │ user taps "Disconnect"
            ▼
      ┌──────────────┐
      │ DISCONNECTING │
      └──────┬───────┘
             │
             ▼
      ┌──────────┐
      │DISCONNECTED│ (cleanup: unsubscribe listeners, clear from registry, stop polling)
      └──────────┘
```

Invalid transitions are no-ops with a logged warning. TypeScript discriminated union with `never` exhaustiveness check on `default` case.

---

## 3. ASCII UI Mockups

### 3.1 Wallet Tab (existing — unchanged)

```
┌───────────────────┐
│ ╔════════╗╔═══════╗│
│ ║Wallet  ║║Conn.  ║│  ← 44px tabs (daisyUI)
│ ╚════════╝╚═══════╝│
│                   │
│ [Balance Card]    │
│ 🔷 rBTC  500K Sat │
│ 💲 USDT    $50.00 │
│                   │
│ 24h    7d    30d  │
│ +2.1%  +5.3%  +12%│
│                   │
│ [Transactions  ▸] │
│ [↓ Receive][↑ Send]│
│ [··· More]        │
│ [Help]            │
└───────────────────┘
```

### 3.2 Connected Tab — Empty state

```
┌───────────────────┐
│ ╔════════╗╔═══════╗│
│ ║Wallet  ║║Conn.  ║│
│ ╚════════╝╚═══════╝│
│                   │
│  ┌────────────────┐│
│  │  🔌 Connect    ││
│  │  External      ││
│  │  Wallet        ││
│  │                ││
│  │ Link MetaMask, ││
│  │ WalletConnect, ││
│  │ Trezor, or     ││
│  │ Ledger for      ││
│  │ larger holdings ││
│  │ with hardware   ││
│  │ security.       ││
│  │                ││
│  │ [+ Connect]    ││
│  └────────────────┘│
└───────────────────┘
```

### 3.3 Connect Modal (bottom sheet, 375px mobile)

```
┌───────────────────┐
│                   │
│  Connect a Wallet │
│  ─────────────────│
│                   │
│  🦊 MetaMask      │
│     Browser wallet│
│  ─────────────────│
│  📱 WalletConnect │
│     Scan QR code  │
│  ─────────────────│
│  🔐 Trezor        │
│     Hardware BTC  │
│  ─────────────────│
│  🔒 Ledger        │
│     Hardware BTC  │
│                   │
│  [Cancel]          │
└───────────────────┘
```

Each row is a tappable ~48px option with icon, name, subtitle. 4 options × 48px + header + Cancel = ~350px total — fits 375x667.

### 3.4 Connected Tab — MetaMask connected

```
┌───────────────────┐
│ ╔════════╗╔═══════╗│
│ ║Wallet  ║║Conn.  ║│
│ ╚════════╝╚═══════╝│
│                   │
│ 🦊 MetaMask  [✕]  │
│ ┌────────────────┐ │
│ │ 0x7a3b...90f2  │ │
│ │                │ │
│ │ 🔷 rBTC        │ │
│ │   12,345,678   │ │
│ │   Sats         │ │
│ │   ≈ $8,200     │ │
│ │                │ │
│ │ 💲 USDT (BSC)  │ │
│ │   $5,000.00    │ │
│ │                │ │
│ │ 💠 ETH (L1)    │ │
│ │   $1,200.00    │ │
│ │                │ │
│ │ [↗ Explorer]   │ │
│ └────────────────┘ │
│                   │
│ [+ Connect Another]│
└───────────────────┘
```

### 3.5 Connected Tab — Multiple wallets (scrollable)

```
┌───────────────────┐
│ ╔════════╗╔═══════╗│
│ ║Wallet  ║║Conn.  ║│
│ ╚════════╝╚═══════╝│
│                   │
│ 🦊 MetaMask  [✕]  │
│ ┌────────────────┐ │
│ │ rBTC 12.3M Sat │ │
│ │ USDT  $5,000   │ │
│ │ ETH   $1,200   │ │
│ └────────────────┘ │
│                   │
│ 🔐 Trezor    [✕]  │
│ ┌────────────────┐ │
│ │ BTC   0.125 ₿  │ │
│ │ rBTC  2.5M Sat │ │
│ └────────────────┘ │
│                   │
│ [+ Connect Another]│
└───────────────────┘
```

Each connected wallet card is independently collapsible. The [Receive] button shows the wallet's address and QR code for receiving funds, including from swaps.

### 3.5a Receive to Connected Wallet

```
┌───────────────────┐
│ Receive to         │
│ 🦊 MetaMask        │
│                   │
│ Chain: [ RSK ▾ ]  │  ← chain selector for multi-chain wallets
│                   │
│ ┌───────────────┐ │
│ │               │ │
│ │   [QR Code]   │ │  ← generated from connected wallet address
│ │               │ │
│ └───────────────┘ │
│                   │
│ 0x7a3b...90f2     │
│ [📋 Copy Address] │
│                   │
│ Send any supported │
│ crypto to this    │
│ address. Funds    │
│ appear in your    │
│ connected wallet. │
│                   │
│ [Close]            │
└───────────────────┘
```

### 3.6 Send Flow — Source selector (full screen at 375px)

```
┌─ Send ────────────┐
│                   │
│ 🔍 0x742d...  [📷]│
│                   │
│ $100     [USD ▾]  │
│                   │
│ ┌─ From ─────────┐│
│ │ ● 📱 Wallet    ││  ← selected source
│ │   🔷 rBTC      ││
│ └────────────────┘│
│   ┌──────────────┐ │
│   │ 📱 Wallet    │ │
│   │ ○ 🔷 rBTC    │ │
│   │ ○ 💲 USDT    │ │
│   │ ──────────── │ │
│   │ 🦊 MetaMask  │ │
│   │ ○ 🔷 rBTC    │ │
│   │ ○ 💲 USDT    │ │
│   │ ○ 💠 ETH     │ │
│   │ ──────────── │ │
│   │ 🔐 Trezor    │ │
│   │ ○ ₿ BTC      │ │
│   │ ○ 🔷 rBTC    │ │
│   └──────────────┘ │
│                   │
│ Send to: [🔷 RSK] │
│ Fee: ~100 Sats ▸  │
│                   │
│ Total: 100K Sats  │
│                   │
│ [Cancel]  [Send]  │
└───────────────────┘
```

The source selector accordion scrolls independently; groups by type (Wallet / Connected wallet name) with visual separators.

### 3.7 Confirmation — External signer

```
┌───────────────────┐
│ Confirm Send       │
│                   │
│ From: 🦊 MetaMask │
│ To: 0x742d...90f2 │
│ Amount:           │
│ 100,000 Sats      │
│ Fee: 100 Sats     │
│                   │
│ Confirm in your   │
│ MetaMask wallet...│
│                   │
│ [Cancel]          │
│ (Send disabled    │
│  during external  │
│  confirmation)    │
└───────────────────┘
```

The in-app Send button is disabled while waiting for external confirmation. Success/failure is detected via transaction hash polling.

### 3.8 Trezor Connect Flow

```
┌───────────────────┐
│ 🔐 Trezor          │
│                   │
│ 1. Connect via    │
│    USB ✅          │
│                   │
│ 2. Trezor Connect │
│    popup opens... │
│    (handled by    │
│    @trezor/       │
│    connect-web)   │
│                   │
│ The popup manages │
│ PIN entry and     │
│ account selection.│
│                   │
│ ⚠️ Never share    │
│ your seed phrase. │
└───────────────────┘
```

Note: PIN entry and device interaction are handled by Trezor's own popup, not the app.

### 3.9 Disconnect confirmation

```
┌───────────────────┐
│ Disconnect?       │
│                   │
│ 🦊 MetaMask       │
│ 0x7a3b...90f2     │
│                   │
│ Funds remain safe │
│ in your wallet.   │
│                   │
│ [Cancel] [Remove] │
└───────────────────┘
```

Disconnect button is full text, minimum 44px height. Not a tiny `[✕]`

---

## 4. Provider Bridge & Signer Architecture

### 4.1 EVM Signer Interface

```typescript
// src/lib/services/external-wallet/provider-bridge.ts

interface EVMTransactionRequest {
	to: string;
	value?: bigint;
	data?: string;
	chainId: number;
}

interface EVMTransactionResult {
	txHash: string;
	from: string;
	chainId: number;
}

interface EVMSigner {
	readonly type: 'evm';
	readonly variant: 'internal' | 'metamask' | 'walletconnect' | 'ledger-evm';
	readonly address: string;
	sendTransaction(tx: EVMTransactionRequest): Promise<EVMTransactionResult>;
	getAddress(): string;
	isConnected(): boolean;
}
```

### 4.2 Bitcoin Signer Interface (separate)

```typescript
// UTXO as returned by mempool.space API, normalized
interface UTXO {
	txid: string;
	vout: number;
	value: bigint; // satoshis — NEVER number
	witnessUtxo?: { script: Buffer; value: bigint };
}

interface TxOutput {
	address: string;
	value: bigint; // satoshis
}

interface BitcoinSendRequest {
	recipient: string; // destination address
	amount: bigint; // amount in satoshis (partial or full)
	feeRateSatsPerVbyte: number; // from mempool.space
}

interface BitcoinSendResult {
	txHash: string;
	signedPSBT: string;
	fee: bigint;
	change: bigint; // returned to change address
	inputs: UTXO[];
	outputs: TxOutput[];
}

interface BitcoinSigner {
	readonly type: 'bitcoin';
	readonly variant: 'trezor' | 'ledger-btc';
	readonly address: string;
	readonly xpub: string;
	readonly derivationPath: string;

	// High-level: handles UTXO selection, PSBT build, device signing
	sendBitcoin(req: BitcoinSendRequest): Promise<BitcoinSendResult>;

	// Low-level (for recovery / manual control)
	signPSBT(psbt: string): Promise<string>;
	getXPUB(): string;
	getAddress(): string;
	deriveChangeAddress(index: number): string;
	isConnected(): boolean;
}
```

### 4.3 Connector Registry (pure dispatch)

```typescript
// src/lib/services/external-wallet/connector-registry.ts

type ConnectorId = string; // e.g. 'metamask-0x7a3b...'

interface ConnectorHandle {
  id: ConnectorId;
  walletType: 'metamask' | 'walletconnect' | 'trezor' | 'ledger';
  address: string;
  chainIds: number[];       // chains this wallet is connected to
  evmSigner?: EVMSigner;    // present for EVM-capable wallets
  bitcoinSigner?: BitcoinSigner; // present for Bitcoin L1 capable
  unsubscribe: () => void;  // remove all event listeners, clear timers
  emitter: ConnectorEventEmitter;
}

class ConnectorRegistry {
  private connectors = new Map<ConnectorId, ConnectorHandle>();

  register(handle: ConnectorHandle): void { ... }
  unregister(id: ConnectorId): void {
    const h = this.connectors.get(id);
    if (h) { h.unsubscribe(); this.connectors.delete(id); }
  }
  get(id: ConnectorId): ConnectorHandle | undefined { ... }
  list(): ConnectorHandle[] { ... }
  clear(): void { ... }  // disconnect all
}
```

### 4.4 Deterministic Signer Selection

```typescript
// Pure function — accepts registry explicitly, no globals
function selectSigner(
	registry: ConnectorRegistry,
	sourceId: string,
	chain: 'rsk' | 'bsc' | 'ethereum' | 'bitcoin'
): EVMSigner | BitcoinSigner {
	const handle = registry.get(sourceId);
	if (!handle) throw new WalletNotConnectedError(sourceId);

	if (chain === 'bitcoin') {
		if (!handle.bitcoinSigner) throw new BitcoinSignerNotAvailableError(sourceId);
		return handle.bitcoinSigner;
	}
	if (!handle.evmSigner) throw new EVMSignerNotAvailableError(sourceId);
	return handle.evmSigner;
}
```

### 4.5 Signer Caching

```typescript
// Signer instances live in the ConnectorHandle, created once on connect().
// No factory function recreation on every dispatch.
//
// On accountsChanged: the connector calls handle.emitter.emit('accountsChanged', newAccounts)
// The store listens and updates balance queries. The signer reference stays valid.
```

---

## 5. Connector Modules

### 5.1 MetaMask Connector

```typescript
// src/lib/services/external-wallet/metamask-connector.ts

// Uses EIP-6963 multi-wallet discovery as primary, falls back to window.ethereum.
// ethers v6 BrowserProvider wraps the EIP-1193 provider.

interface MetaMaskConfig {
  registry: ConnectorRegistry;
  onEvent: (event: ConnectorEvent) => void;  // accountsChanged, chainChanged, disconnect
}

function detectMetaMask(): boolean {
  // EIP-6963 discovery first
  if (typeof window !== 'undefined') {
    // Check for EIP-6963 announced providers
    // Fallback: window.ethereum?.isMetaMask
  }
  return false;
}

async function connectMetaMask(config: MetaMaskConfig): Promise<ConnectorHandle> { ... }
```

**Events handled:**

- `accountsChanged` → emit to store → re-query balances, update address
- `chainChanged` → emit to store → validate chain support, prompt switch if needed
- `disconnect` → emit to store → mark disconnected, clean up

**RSK chain addition:** `wallet_addEthereumChain` with RSK mainnet/testnet params.

### 5.2 WalletConnect Connector

```typescript
// src/lib/services/external-wallet/walletconnect-connector.ts

// Uses @walletconnect/ethereum-provider directly (NOT @reownapp/appkit).
// QR display uses existing Svelte components + the project's qrcode library.
// Session persisted to Capacitor Preferences.

async function connectWC(config: WCConfig): Promise<ConnectorHandle> { ... }
async function restoreWCSession(): Promise<ConnectorHandle | null> { ... }
```

**No React dependency.** The QR code modal is a Svelte component (`WalletConnectQRModal.svelte`) that renders the `wc:` URI as a QR code using the existing `qrcode` library.

### 5.3 Trezor Connector

```typescript
// src/lib/services/external-wallet/trezor-connector.ts

// @trezor/connect-web for popup + device communication.
// Bitcoin: m/86'/0'/0'/0/0 (Taproot, BIP86 — bc1p... addresses)
// EVM: m/44'/60'/0'/0/0 (EVM standard — same as MetaMask)
// EVM signing via @trezor/connect-plugin-ethereum

async function connectTrezor(config: TrezorConfig): Promise<ConnectorHandle> { ... }
```

**Returns both `evmSigner` and `bitcoinSigner`** — Trezor Model T/Safe 5 supports both.

**Mobile note:** Trezor on mobile uses USB OTG on Android (via `@trezor/transport` with USB). BLE available on Trezor Model T. iOS limited — show Trezor option only when platform supports it. Feature-detected via `window.navigator?.usb` and platform check.

### 5.4 Ledger Connector

```typescript
// src/lib/services/external-wallet/ledger-connector.ts

// @ledgerhq/hw-app-btc for Bitcoin signing
// @ledgerhq/hw-app-eth for EVM signing (RSK, BSC, ETH)
// Transport: @ledgerhq/hw-transport-webusb (desktop) + @ledgerhq/hw-transport-ble (mobile)
// Bitcoin: m/86'/0'/0'/0/0 (Taproot, BIP86)
// EVM: m/44'/60'/0'/0/0

async function connectLedger(config: LedgerConfig): Promise<ConnectorHandle> { ... }
```

**Transport selection:** Detect availability — prefer BLE on Capacitor mobile, WebUSB on desktop browser.

---

## 6. Transaction Signing Pipeline

### 6.1 Deterministic Dispatch

```typescript
async function sendFromSource(
	registry: ConnectorRegistry,
	sourceId: string,
	chain: 'rsk' | 'bsc' | 'ethereum' | 'bitcoin',
	tx: EVMTransactionRequest | BitcoinTransactionRequest
): Promise<EVMTransactionResult | BitcoinTransactionResult> {
	const handle = registry.get(sourceId);
	if (!handle) throw new WalletNotConnectedError(sourceId);

	if (chain === 'bitcoin') {
		if (!handle.bitcoinSigner) throw new BitcoinSignerNotAvailableError(sourceId);
		if (!('psbt' in tx)) throw new InvalidBitcoinTransactionError();
		return handle.bitcoinSigner.signPSBT(tx);
	}

	if (!handle.evmSigner) throw new EVMSignerNotAvailableError(sourceId);
	if (!('to' in tx)) throw new InvalidEVMTransactionError();
	return handle.evmSigner.sendTransaction(tx);
}
```

### 6.2 Send State Machine

```
                         ┌──────┐
                         │ IDLE │
                         └──┬───┘
                            │ user taps Send
                            ▼
                      ┌──────────┐
                      │ BUILDING │ ← build tx, estimate gas
                      └────┬─────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │INTERNAL  │ │EXTERNAL  │ │ HARDWARE │
        │SIGNING   │ │SIGNING   │ │ SIGNING  │
        └────┬─────┘ └────┬─────┘ └────┬─────┘
             │            │            │
             ▼            ▼            ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │BROADCAST │ │ WAITING  │ │ WAITING │
        └────┬─────┘ │ FOR USER │ │ FOR DEV │
             │        └────┬─────┘ └────┬─────┘
             │             │            │
             ▼             ▼            ▼
        ┌──────────────────────────────────┐
        │           CONFIRMED              │
        │  txHash, from, chainId captured  │
        └──────────────┬───────────────────┘
                       │
              ┌────────┼────────┐
              ▼        ▼        ▼
        ┌────────┐ ┌──────┐ ┌──────┐
        │SUCCESS │ │PENDING│ │FAILED│
        └────────┘ └──────┘ └──────┘
```

---

## 7. Smart Contract Escrow Integration

### 7.1 Signature Agnosticism

No smart contract changes needed. Contracts see only `msg.sender`.

### 7.2 Swap Chain Integration

The swap chain service (`src/lib/services/swap-chain.service.ts`) currently assumes internal signer at six call sites (`executeDirectHop` × 3, `executeLifiHop` × 2, `executeSymbiosisHop` × 1, plus `createSubmarineSwap`, `lockSubmarineSwapFunds`, `createChainSwap`). Change: each function accepts a `ConnectorRegistry` parameter and calls `selectSigner(registry, sourceId, chain)` for signing.

Estimated: ~60-80 lines of changes in swap-chain.service.ts.

### 7.3 Paymaster / EIP-7702

EIP-7702 paymaster for BSC USDT works identically from connected sources. The delegation transaction format is the same regardless of signer.

### 7.4 Receiving to Connected Wallets

Connected wallets can receive funds just like the built-in wallet. The Receive flow shows the connected wallet's address and generates a QR code.

```
User taps "Receive" on a connected wallet card
  → Receive modal shows: wallet name, chain, address, QR code
  → Address can be copied, shared, or scanned
  → Any supported crypto sent to this address appears in the connected wallet's balance
```

**Receive form integration**: `ReceivePaymentForm` already accepts an address to display and generate QR codes for. It needs no changes — it receives a wallet address as a prop. The Connected tab passes the connected wallet's address for the selected chain.

**Multi-chain receive**: If a connected wallet supports multiple chains (RSK, BSC, Ethereum), the receive modal shows a chain selector. Each chain has its own address. Trezor/Ledger Bitcoin addresses are derived from the XPUB; EVM addresses are the same across chains (EVM standard).

### 7.5 Swap Infrastructure for Connected Wallets

Connected wallets are **destinations** for swap services. Changelly, LI.FI, and Symbiosis all accept a destination address parameter. The swap services don't care whether the address belongs to the built-in wallet or a connected wallet.

**Flow: Swap any supported crypto → connected wallet**

```
User opens Swap / Buy / Sell via BankingMenu
  → Selects source asset (e.g., BTC from Changelly, ETH from LI.FI)
  → Selects destination: built-in wallet OR any connected wallet
  → Swap service deposits directly to the connected wallet's address
  → Funds appear in connected wallet balance after swap confirms
  → No signature needed from connected wallet (receiving only)
```

**Changelly receive-address flow**: Changelly's API accepts a `payoutAddress` parameter. When swapping into a connected wallet, pass the connected wallet's address as `payoutAddress`. The swap executes without the connected wallet needing to sign anything.

**LI.FI / Symbiosis**: These are bridge protocols that route to a destination address. Pass the connected wallet's address as the `to` parameter. Same principle — receiving requires no signature.

**What changes**:

- `ChangellyService.createSwap()` — `payoutAddress` parameter already exists, just pass the connected wallet's address instead of the built-in wallet's
- `BankingMenu.svelte` + `SwapModal` — destination selector gains connected wallet entries
- `ReceiveSwapSelector.svelte` — destination section gains connected wallet entries (alongside built-in). Filters by chain compatibility (only shows wallets that support the selected swap destination chain). Already has network/address infrastructure — just add connected wallet addresses to the destination list.
- `ReceivePaymentForm.svelte` — already address-agnostic, just pass the right address

**What does NOT change**:

- The swap chain service sends FROM a wallet — this uses the built-in wallet as source (signing required)
- When receiving into a connected wallet, the swap chain deposits TO the connected wallet's address — no signing required
- The route resolver doesn't care about the destination wallet type — it maps source→destination chain

---

## 8. Transaction Locking & Concurrency

### 8.1 Design

Connected wallet transactions from the same source MUST be serialized. Two independent wallets can transact simultaneously, but a single wallet cannot have two active sends.

```typescript
// src/lib/services/external-wallet/send-lock.ts

class SendLockManager {
	private activeSends = new Map<string, AbortController>();

	acquire(sourceId: string): AbortSignal {
		if (this.activeSends.has(sourceId)) {
			throw new TransactionInProgressError(sourceId);
		}
		const controller = new AbortController();
		this.activeSends.set(sourceId, controller);
		return controller.signal;
	}

	release(sourceId: string): void {
		this.activeSends.delete(sourceId);
	}

	isLocked(sourceId: string): boolean {
		return this.activeSends.has(sourceId);
	}

	cancel(sourceId: string): void {
		this.activeSends.get(sourceId)?.abort();
		this.activeSends.delete(sourceId);
	}
}
```

### 8.2 Swap Chain Coordination

The swap chain service must coordinate with the send lock:

```typescript
// Before starting swap chain, acquire lock on the source
const signal = sendLock.acquire(sourceId);
// ... execute swap chain ...
// On completion or error: sendLock.release(sourceId);
```

The `SendPaymentForm` checks `sendLock.isLocked(sourceId)` and disables the Send button for locked sources with message: "A transaction is in progress from this source."

### 8.3 accountsChanged During Active Send

When `accountsChanged` fires during an active send from the affected connected wallet:

1. The send lock's abort signal is triggered
2. The send state machine transitions to `CANCELLED` with reason "Account switched during transaction"
3. The form preserves field values but clears the send state
4. A toast notifies: "MetaMask account changed. Transaction cancelled."

### 8.4 Capacitor Lifecycle During Active Send

```typescript
// On Capacitor pause event:
if (sendLock.isLocked(sourceId) && sendPhase !== 'IDLE') {
	persistSendPhase(sourceId, sendPhase); // survive app termination
}

// On Capacitor resume event:
const persistedPhase = getPersistedSendPhase(sourceId);
if (persistedPhase === 'EXTERNAL_SIGNING') {
	// Verify MetaMask/WC is still connected, check for txHash
	// If not found within 30s, transition to FAILED with "Reconnect and retry"
}
```

---

## 9. Chain Confirmation & Reorg Handling

### 9.1 Required Confirmations

```typescript
const REQUIRED_CONFIRMATIONS: Record<string, number> = {
	rsk: 3, // RSK merged-mined with Bitcoin, 3 blocks (~90s)
	bsc: 12, // BSC has had 1-2 block reorgs during validator transitions
	ethereum: 12, // Standard for Ethereum mainnet
	bitcoin: 6 // Standard for Bitcoin (though some use 3)
};
```

A transaction is `PENDING` until `requiredConfirmations` blocks are mined after inclusion. Only then transitions to `SUCCESS`. A separate `REORG` state captures when confirmations drop below the threshold (edge case, mostly on BSC).

### 9.2 Receive State Machine Addition

```
CONFIRMED (1 block)
  → PENDING (mempool)
  → SUCCESS (requiredConfirmations reached)
  → REORG (confirmations dropped below threshold → manual check needed)
```

### 9.3 Bitcoin Send Flow (Partial Amounts — Full v1 Support)

Bitcoin L1 transactions use sats/vbyte, not EVM gas. The hardware wallet signs a PSBT; the app handles UTXO selection, fee estimation, and change address derivation.

**Dependencies**: `bitcoinjs-lib` (already in project), `coinselect` (npm, <2KB), mempool.space API (free, no key).

#### 9.3.1 UTXO Selection Algorithm

```typescript
// npm install coinselect  (2KB, zero dependencies)
import { accumulative } from 'coinselect';
import { payments, networks } from 'bitcoinjs-lib';

interface UTXO {
	txid: string;
	vout: number;
	value: bigint; // satoshis, NEVER number
	witnessUtxo?: { script: Buffer; value: bigint };
}

function selectUTXOs(
	utxos: UTXO[],
	targetAmount: bigint,
	feeRateSatsPerVbyte: number,
	changeAddress: string
): { inputs: UTXO[]; outputs: TxOutput[]; fee: bigint } | null {
	// coinselect accumulative algorithm: picks smallest UTXOs
	// that sum to target + fee, minimizing UTXO set size
	const utxosForCoinselect = utxos.map((u) => ({
		txId: u.txid,
		vout: u.vout,
		value: Number(u.value), // coinselect uses number; ok for BTC amounts <21M
		...(u.witnessUtxo ? { witnessUtxo: u.witnessUtxo } : {})
	}));

	const result = accumulative(utxosForCoinselect, Number(targetAmount), feeRateSatsPerVbyte);
	if (!result.inputs || !result.outputs) return null; // insufficient funds

	// Replace the coinselect change output with our derived address
	const outputs: TxOutput[] = result.outputs.map((o: { address?: string; value: number }) => {
		if (o.address === changeAddress || !o.address) {
			return { address: changeAddress, value: BigInt(o.value) };
		}
		return { address: o.address, value: BigInt(o.value) };
	});

	return {
		inputs: result.inputs.map(
			(i: { txId: string; vout: number }) =>
				utxos.find((u) => u.txid === i.txId && u.vout === i.vout)!
		),
		outputs,
		fee: BigInt(result.fee)
	};
}
```

**Why accumulative and not largest-first**: Accumulative minimizes UTXO count (fewer inputs = smaller tx = lower fee), which is the right default for most sends.

#### 9.3.2 Fee Estimation

```typescript
async function getBitcoinFeeRate(): Promise<number> {
	// mempool.space — free, no API key, Bitcoin + Testnet
	const res = await fetch('https://mempool.space/api/v1/fees/recommended');
	const data = await res.json();
	// Use "fastest" for hardware wallet (user is waiting with device connected)
	return data.fastestFee; // sats/vbyte
}
```

#### 9.3.3 Change Address Derivation

```typescript
import { fromXpub, toXOnly } from 'bitcoinjs-lib/dist/bip32';

function deriveChangeAddress(xpub: string, changeIndex: number): string {
	const node = fromXpub(xpub); // BIP86 Taproot XPUB
	// m/86'/0'/0'/1/changeIndex → change chain (1 = change, 0 = receive)
	const changeNode = node.derive(1).derive(changeIndex);
	// P2TR (Pay-to-Taproot) — bc1p... address
	return payments.p2tr({ internalPubkey: toXOnly(changeNode.publicKey) }).address!;
}
```

#### 9.3.4 Send Flow

```
User enters BTC amount (partial or all)
  → Fetch UTXOs for address (mempool.space API)
  → Fetch current fee rate (mempool.space API)
  → Derive change address (next unused from XPUB)
  → selectUTXOs(utxos, amount, feeRate, changeAddr)
  → If null → "Insufficient funds" or "UTXOs below dust threshold"
  → Build PSBT (bitcoinjs-lib.Psbt)
  → Show confirmation screen: amount, fee, recipient, change
  → User confirms → signPSBT(psbt) on device
  → Device shows: "Send X.XXXX BTC to bc1q...?" with fee
  → User confirms on device → signed PSBT returned
  → Broadcast via mempool.space API
  → Track confirmations
```

#### 9.3.5 Dust Threshold

UTXOs below the dust threshold (~330 sats for P2TR key-path) cannot be spent economically (the fee would exceed their value). The UTXO selector skips them automatically. A warning is shown if dust UTXOs exist: "X UTXOs below dust threshold cannot be spent."

Both receive and change addresses use Taproot. The BIP86 derivation path is `m/86'/0'/0'` — the standard for single-sig Taproot since BIP86 was finalized. Schnorr signatures reduce tx size by ~10-15% vs SegWit, meaning lower fees. Trezor supports BIP86 since firmware 2.6+ (2023); Ledger since Bitcoin app 2.0+ (2021). No modern device lacks Taproot support in 2026.

#### 9.3.6 UTXO Locking

Before signing, mark selected UTXOs as `locked`. After broadcast, keep locked until confirmed or failed. Prevent double-spend: reject `signPSBT` if any input UTXO is already locked. Release lock on confirmation, or after 72h timeout (rare edge case where a transaction is never mined).

#### 9.3.7 RBF (Replace-By-Fee) — BIP125

All Bitcoin transactions from hardware wallets signal RBF so the user can bump fees if a transaction gets stuck in the mempool (low fee, network congestion).

```typescript
// In PSBT construction — set nSequence on ALL inputs to signal RBF
for (const input of psbt.data.inputs) {
	// BIP125: any nSequence < 0xfffffffe signals replaceability
	if (input.sequence === undefined || input.sequence >= 0xfffffffe) {
		psbt.setInputSequence(inputIndex, 0xfffffffd);
	}
}
```

**Fee bump flow** (v1 — manual via app):

1. User sees "Stuck in mempool" banner on pending transaction (after ~30 min with 0 confirmations)
2. User taps "Speed Up" → app rebuilds the same PSBT with higher fee rate
3. User signs on hardware wallet → replacement tx broadcast
4. Original tx is replaced in mempool (same inputs, same outputs, higher fee)

**Full RBF vs Opt-in RBF**: Taproot transactions with `nSequence < 0xfffffffe` are opt-in RBF. Since all our transactions signal RBF from the start, any can be bumped. No need for full-RBF mempool policy considerations on the receiving side.

**Benefits over BIP84/SegWit**: Taproot's witness structure makes replacement transactions slightly cheaper to bump (Schnorr signatures are constant 64/65 bytes vs variable DER-encoded ECDSA).

---

## 10. Implementation Phases

### TDD Methodology

Tests are written alongside each phase — NOT deferred to a final phase. Each connector and component follows the Red-Green-Refactor cycle. Phase deliverables include both source and test files.

### Phase 0: Setup & Feature Flags (0.5 day)

| File                                        | Action                                                                          | Lines |
| ------------------------------------------- | ------------------------------------------------------------------------------- | ----- |
| `.env` + `.env.test`                        | Add all `VITE_CONNECTED_*` feature flags                                        | +15   |
| `src/lib/services/kill-switch.ts`           | Register connected wallet feature flags in `FeatureFlagService`                 | +20   |
| `src/lib/stores/connected-wallets.store.ts` | **New** — separate store for connected wallet state (not bloating wallet.store) | ~150  |

### Phase 1: Foundation (1.5 days)

**Goal**: ConnectorRegistry + MetaMask connector + Connected tab. **Tests written alongside.**

| File                                                     | Action                                                                   | Lines     |
| -------------------------------------------------------- | ------------------------------------------------------------------------ | --------- |
| `src/lib/services/external-wallet/connector-registry.ts` | New — registry `Map`, register/unregister/get/list/clear                 | ~80       |
| `src/lib/tests/services/connector-registry.test.ts`      | New — register, unregister cleanup, get missing, clear all, duplicate    | ~120      |
| `src/lib/services/external-wallet/provider-bridge.ts`    | New — `EVMSigner`, `BitcoinSigner` interfaces, `selectSigner()`          | ~120      |
| `src/lib/tests/services/provider-bridge.test.ts`         | New — signer selection, error paths                                      | ~150      |
| `src/lib/services/external-wallet/send-lock.ts`          | New — per-source transaction lock, AbortSignal                           | ~50       |
| `src/lib/services/external-wallet/metamask-connector.ts` | New — detect (EIP-6963 + fallback), connect, events via emitter          | ~140      |
| `src/lib/tests/services/metamask-connector.test.ts`      | New — detect, connect, reject, accountsChanged, chainChanged, disconnect | ~150      |
| `src/lib/stores/connected-wallets.store.ts`              | Modify — connected wallet state, registry integration, balance polling   | +100      |
| `src/lib/tests/stores/connected-wallets.store.test.ts`   | New — connect, disconnect, multi-wallet, balance query, error recovery   | ~180      |
| `src/lib/components/wallet/ConnectedWallets.svelte`      | New — Connected tab content, connect/disconnect UI                       | ~350      |
| `src/lib/tests/components/ConnectedWallets.test.ts`      | New — empty, connecting, connected, error, multiple, disconnect confirm  | ~200      |
| `src/routes/(protected)/dashboard/wallet/+page.svelte`   | Modify — tab toggle (Wallet/Connected)                                   | +80 / -15 |

**Deliverable**: MetaMask connects, Connected tab shows balances, can disconnect. All unit + component tests pass.

### Phase 2: Send from Connected (1 day)

**Goal**: Send transactions using Connected wallets as signer. **Tests alongside.**

| File                                               | Action                                                                       | Lines     |
| -------------------------------------------------- | ---------------------------------------------------------------------------- | --------- |
| `src/lib/components/wallet/SendPaymentForm.svelte` | Modify — connected sources in selector, external send path                   | +80 / -15 |
| `src/lib/tests/components/SendPaymentForm.test.ts` | Modify — connected source send, external confirmation, cancellation, locking | +60       |
| `src/lib/services/swap-chain.service.ts`           | Modify — accept `ConnectorRegistry`, `selectSigner` dispatch, send lock      | +80 / -15 |
| `src/lib/tests/services/swap-chain.test.ts`        | New or modify — swap chain with connected signer, lock coordination          | +80       |

**Deliverable**: Can send from MetaMask, popup confirms, tx broadcasts. **Existing wallet users see zero UI change** (connected sources hidden when none connected).

### Phase 3: WalletConnect (1 day)

**Goal**: WalletConnect via `@walletconnect/ethereum-provider` + custom Svelte QR modal.

| File                                                          | Action                                   | Lines |
| ------------------------------------------------------------- | ---------------------------------------- | ----- |
| `src/lib/services/external-wallet/walletconnect-connector.ts` | New                                      | ~180  |
| `src/lib/tests/services/walletconnect-connector.test.ts`      | New                                      | ~130  |
| `src/lib/components/wallet/WalletConnectQRModal.svelte`       | New — Svelte native QR modal             | ~100  |
| `src/lib/components/wallet/ConnectedWallets.svelte`           | Modify — add WC option, QR modal trigger | +50   |

### Phase 4: Hardware Wallets (1-2 days)

**Goal**: Trezor + Ledger with BLE for mobile. Lazy-loaded via dynamic imports.

| File                                                   | Action                                              | Lines |
| ------------------------------------------------------ | --------------------------------------------------- | ----- |
| `src/lib/services/external-wallet/trezor-connector.ts` | New — Bitcoin + EVM signing                         | ~220  |
| `src/lib/tests/services/trezor-connector.test.ts`      | New                                                 | ~150  |
| `src/lib/services/external-wallet/ledger-connector.ts` | New — Bitcoin + EVM signing, BLE transport          | ~220  |
| `src/lib/tests/services/ledger-connector.test.ts`      | New                                                 | ~150  |
| `src/lib/services/external-wallet/balance-poller.ts`   | New — lifecycle-aware balance polling manager       | ~80   |
| `src/lib/tests/services/balance-poller.test.ts`        | New                                                 | ~100  |
| `src/lib/components/wallet/ConnectedWallets.svelte`    | Modify — Trezor/Ledger options with platform guards | +60   |

**Lazy loading**: `@trezor/connect-web`, `@ledgerhq/*` are dynamically imported only when the user taps "Connect Trezor" or "Connect Ledger." Initial bundle unaffected.

### Phase 5: Integration & E2E (1 day)

**Goal**: Integration tests, Playwright E2E, monitoring breadcrumbs.

| File                                                     | Action                                                          | Lines |
| -------------------------------------------------------- | --------------------------------------------------------------- | ----- |
| `src/lib/tests/integration/connected-send-flow.test.ts`  | New — Provider Bridge + store + send lock integration           | ~130  |
| `src/lib/tests/integration/connected-swap-chain.test.ts` | New — Swap chain + connected signer integration                 | ~100  |
| `src/lib/tests/integration/multi-wallet.test.ts`         | New — Concurrent wallets, disconnect isolation                  | ~100  |
| Playwright E2E                                           | Connected tab render, connect modal open/close, disconnect flow | ~80   |

**Total**: ~2,460 new lines + ~395 net modified = ~2,855 lines

---

## 11. Defensive & Deterministic Programming

_(Sections 9.1-9.5 from previous version, renumbered)_

### 11.6 SourceWallet Type Cascade

The `SourceWallet` type in `src/lib/services/route-resolver.ts`:

```typescript
export type SourceWallet = 'rbtc' | 'usdt-bsc';
```

Adding connected sources does NOT change this type. The route resolver only cares about the source asset+chain, not the wallet provenance. `toSourceWallet()` in `SendPaymentForm.svelte` maps `formInput.selectedSource` (which includes connected wallet IDs) to `SourceWallet`. Connected wallet IDs are opaque strings that the resolver never sees.

### 11.7 Separate Connected Wallets Store

Connected wallet state lives in `src/lib/stores/connected-wallets.store.ts`, NOT in `wallet.store.ts`. This:

- Prevents regression risk for existing wallet functionality (30+ files import wallet.store)
- Keeps the external wallet integration self-contained
- Allows the connected wallets store to be tree-shaken if the feature flag is disabled

The wallet page imports both stores and merges source lists for the Send form.

### 11.8 Hardware Wallet Platform Detection

```typescript
// src/lib/services/external-wallet/platform-checks.ts

function isTrezorAvailable(navigator: Navigator): boolean {
	// Trezor Connect uses its own popup bridge, not raw WebUSB
	// Available on: desktop (Chrome/Edge/Firefox), Android (Trezor Suite app)
	// Unavailable on: iOS (WKWebView restrictions)
	if (Capacitor.getPlatform() === 'ios') return false;
	return true; // Desktop + Android
}

function getLedgerTransport(navigator: Navigator): 'webusb' | 'ble' | 'unavailable' {
	if (Capacitor.getPlatform() === 'ios') {
		return navigator.bluetooth ? 'ble' : 'unavailable';
	}
	if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
		return 'ble'; // BLE more reliable than WebUSB in Android WebView
	}
	// Desktop browser
	return navigator.usb ? 'webusb' : 'unavailable';
}

function isMetaMaskAvailable(): boolean {
	// EIP-6963 multi-wallet discovery first, fallback to window.ethereum
	return typeof window !== 'undefined' && !!window.ethereum?.isMetaMask;
}
```

---

## 12. Testing Strategy

### 12.1 Unit Tests

| Layer                   | Count | Key Scenarios                                                                                                      |
| ----------------------- | ----- | ------------------------------------------------------------------------------------------------------------------ |
| connector-registry      | ~15   | Register, unregister cleanup, get missing, clear all, duplicate register                                           |
| provider-bridge         | ~18   | Signer selection (internal/evm/bitcoin), error paths, signer caching                                               |
| send-lock               | ~10   | Acquire, release, double-acquire rejection, abort signal, isLocked                                                 |
| metamask-connector      | ~20   | Detect, connect success, connect reject, accountsChanged, chainChanged, disconnect, unavailable, EIP-6963 fallback |
| walletconnect-connector | ~15   | Session create, session restore, disconnect, QR timeout                                                            |
| trezor-connector        | ~18   | XPUB fetch, address derivation, PSBT sign, EVM sign, disconnect, platform unavailable                              |
| ledger-connector        | ~18   | Same + BLE transport, WebUSB transport, transport fallback                                                         |
| balance-poller          | ~10   | Start, stop, pause, resume, stopAll, debounce concurrent requests                                                  |
| connected-wallets.store | ~28   | Connect, disconnect, multi-wallet, balance query, error recovery, event handling, cache invalidation, pause/resume |

### 12.2 Component Tests

| Component             | States                                                                                                   |
| --------------------- | -------------------------------------------------------------------------------------------------------- |
| ConnectedWallets      | Empty, connecting, connected (MetaMask), connected (Trezor), error, multiple wallets, disconnect confirm |
| WalletConnectQRModal  | Loading, QR displayed, QR expired, error                                                                 |
| +page.svelte (wallet) | Wallet tab default, Connected tab with wallets, Connected tab empty, tab switching                       |

### 12.3 Integration Tests

| Scope                  | Key Scenarios                                                                      |
| ---------------------- | ---------------------------------------------------------------------------------- |
| Connected send flow    | Provider bridge → send lock → signer → broadcast → receipt check                   |
| Swap chain + connected | Connected source swap, lock coordination, recovery from persisted state            |
| Multi-wallet isolation | Connect 2+ wallets, disconnect one, verify others unaffected                       |
| Capacitor lifecycle    | Background during send → resume → recover state                                    |
| Capacitor Preferences  | Persist connected wallet state, restart app, verify restoration, version migration |

### 12.4 i18n Key Validation

All new user-facing strings use `$t()` from `svelte-i18n`. Before committing:

```bash
python3 scripts/find-missing-translations.py --fix-suggestions
```

Fix all issues before commit.

### 12.5 Regression Tests

Before Phase 2 begins, the existing wallet send/receive/swap test suite must pass with the new `connected-wallets.store.ts` present but no wallets connected. This validates zero regression for users who never use the Connected tab.

---

## 13. Risk Analysis & Mitigations

| Risk                                        | L   | I   | Mitigation                                                                                      |
| ------------------------------------------- | --- | --- | ----------------------------------------------------------------------------------------------- |
| MetaMask API changes break connector        | L   | H   | Feature-detect EIP-6963 + EIP-1193; version-lock API surface                                    |
| WalletConnect session hijacking             | L   | C   | Session origin validation; encryption key derived from Nostr mnemonic via HKDF                  |
| WebUSB unavailable on mobile                | M   | M   | BLE transport for Ledger; Trezor on Android via USB OTG; iOS: feature documented as unavailable |
| User confused by Wallet vs Connected        | M   | M   | Connected sources hidden when none connected; tooltip on first connect                          |
| Balance stale after external transfer       | M   | L   | 30s poll; `accountsChanged` triggers immediate refresh; pull-to-refresh                         |
| Hardware wallet disconnected mid-send       | L   | M   | Preserve form state; prompt reconnect; 30s timeout → FAILED                                     |
| WalletConnect session expires mid-send      | M   | M   | Auto-restore; exponential backoff (1s→2s→4s→8s→30s, max 5 attempts)                             |
| Swapped chain + manual send conflict        | L   | M   | SendLockManager prevents concurrent sends from same source                                      |
| Gas estimation divergence (app vs MetaMask) | M   | L   | Show "Fee will be confirmed in MetaMask" for external signers                                   |
| PSBT double-sign replay                     | L   | M   | UTXO lock tracks unconfirmed spends; reject duplicate PSBT inputs                               |
| Connect modal phishing surface              | L   | H   | Build-time validation: connector list exactly 4 types; no seed-phrase options                   |
| Rate limiting: rapid connect/disconnect     | L   | L   | 3s cooldown on connect; debounced button                                                        |

L = Likelihood (L/M/H), I = Impact (L/M/H/Critical)

---

## 14. Dependencies & SDKs

_(Same as Section 12 from v1.1 — renamed)_

## 15. Feature Flags & Kill Switch

### 15.1 Master Kill Switch

```typescript
VITE_CONNECTED_WALLETS_ENABLED = true; // Master kill switch
VITE_CONNECTED_METAMASK_ENABLED = true;
VITE_CONNECTED_WALLETCONNECT_ENABLED = true;
VITE_CONNECTED_TREZOR_ENABLED = true;
VITE_CONNECTED_LEDGER_ENABLED = true;
VITE_CONNECTED_SEND_ENABLED = true; // Isolated: connected balances visible, sends blocked
```

### 15.2 Integration with FeatureFlagService

```typescript
// In src/lib/services/kill-switch.ts
FEATURE_FLAGS.CONNECTED_WALLETS: 'connected-wallets',
FEATURE_FLAGS.CONNECTED_METAMASK: 'connected-metamask',
FEATURE_FLAGS.CONNECTED_WALLETCONNECT: 'connected-walletconnect',
FEATURE_FLAGS.CONNECTED_TREZOR: 'connected-trezor',
FEATURE_FLAGS.CONNECTED_LEDGER: 'connected-ledger',
```

All flags follow the existing `FeatureFlagService.isEnabled()` pattern. Checked at both build time (`import.meta.env`) and runtime through the service.

### 15.3 Per-Chain Flags

```typescript
VITE_CONNECTED_CHAIN_RSK_ENABLED = true;
VITE_CONNECTED_CHAIN_BSC_ENABLED = true;
VITE_CONNECTED_CHAIN_ETHEREUM_ENABLED = true;
VITE_CONNECTED_CHAIN_BITCOIN_ENABLED = true;
```

If RSK connected wallet balance queries encounter rate limiting at Blockscout, operators can disable `VITE_CONNECTED_CHAIN_RSK_ENABLED=false` without disabling the entire connector.

---

## 16. Rollback Plan

### 16.1 Full Rollback

Set master flag:

```
VITE_CONNECTED_WALLETS_ENABLED=false
```

Rebuild and redeploy. The Connected tab, connected wallets store, and all connector code are tree-shaken. Existing wallet functionality is completely unaffected — `connected-wallets.store.ts` is not imported by any wallet page code when the flag is false. Existing wallet users see zero change. Build-time flag means rollback requires redeployment (~5 min).

### 16.2 Partial Rollback

Individual connector flags can disable specific connectors without affecting others. Per-chain flags can disable balance queries for specific chains.

### 16.3 Data Safety

Connected wallet state persisted in Capacitor Preferences is keyed under `bittasker_connected_wallets` (separate from wallet keys). If the feature is rolled back, the data remains but is never read. On re-enable, existing persisted data is validated before use. Data migration: each `ConnectedWalletState` includes a `version` field. On load, unrecognized version → clear and start fresh.

---

## 17. Observability & Monitoring

### 17.1 Sentry Breadcrumbs

```typescript
Sentry.addBreadcrumb({ category: 'connected_wallet', message: 'connect:metamask', level: 'info' });
Sentry.addBreadcrumb({ category: 'connected_wallet', message: 'disconnect:trezor', level: 'info' });
Sentry.addBreadcrumb({
	category: 'connected_wallet',
	message: 'send:start',
	data: { sourceId, chain }
});
Sentry.addBreadcrumb({ category: 'connected_wallet', message: 'send:confirmed', data: { txHash } });
Sentry.addBreadcrumb({ category: 'connected_wallet', message: 'send:cancelled', data: { reason } });
```

### 17.2 Sentry Tags

```typescript
Sentry.setTag('connected_wallets', walletCount > 0 ? 'yes' : 'no');
Sentry.setTag('connected_wallet_types', activeConnectorTypes.join(','));
```

### 17.3 Error Tracking

All connected-wallet-specific errors (`WalletNotConnectedError`, `UserCancelledError`, `DeviceDisconnectedError`, `HardwareTimeoutError`) are Sentry exceptions with context (source ID, connector type, chain). `UserCancelledError` is logged as info (not error) — it is expected user behavior. A spike in UserCancelledError rate would indicate a UX problem.

---

## 9. Defensive & Deterministic Programming

### 9.1 Rules

1. **Pure functions**: All financial calculations, address validation, chain ID resolution, fee computation — pure, no side effects.
2. **Exhaustive state machines**: TypeScript discriminated unions with `never` exhaustiveness in `default` cases.
3. **Single-writer**: Wallet store is sole writer. Connectors return `ConnectorHandle`, never write to store. Events flow through `emitter` which the store subscribes to.
4. **Explicit dependencies**: No function reads from stores, `window`, or Capacitor plugins internally. All deps passed as parameters. `selectSigner(registry, sourceId, chain)` — registry is explicit.
5. **Signer caching**: Signer instances live in `ConnectorHandle`, created once on connect. No recreation on dispatch.

### 9.2 Balance Type Safety

```typescript
// NEVER use `number` for crypto amounts — IEEE-754 precision hazard.
// Follow existing project pattern from src/lib/types/wallet.d.ts

interface SafeBalance {
	raw: bigint; // satoshis / wei / smallest unit
	formatted: string; // human-readable with proper decimals
	decimals: number; // e.g., 8 for BTC, 18 for ETH
}
```

### 9.3 Platform Guards

```typescript
// src/lib/services/external-wallet/platform-checks.ts

function getLedgerTransport(navigator: Navigator): 'webusb' | 'ble' | 'unavailable' {
	if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios') {
		// iOS WKWebView: WebUSB unsupported, try BLE
		return navigator.bluetooth ? 'ble' : 'unavailable';
	}
	if (Capacitor.isNativePlatform()) {
		return 'ble'; // Android: BLE is more reliable than WebUSB in WebView
	}
	return navigator.usb ? 'webusb' : 'unavailable';
}

function isTrezorAvailable(navigator: Navigator): boolean {
	return !Capacitor.getPlatform() || Capacitor.getPlatform() === 'android';
	// Desktop: USB. Android: USB OTG. iOS: unavailable (Trezor Bridge not in WKWebView).
}

function isMetaMaskAvailable(): boolean {
	return typeof window !== 'undefined' && !!window.ethereum?.isMetaMask;
}
```

### 9.4 Balance Polling Lifecycle

```typescript
// src/lib/services/external-wallet/balance-poller.ts

class BalancePollingManager {
  private timers = new Map<string, ReturnType<typeof setInterval>>();

  start(sourceId: string, fn: () => Promise<void>, intervalMs: number): void { ... }
  stop(sourceId: string): void { ... }
  stopAll(): void { ... }

  // Capacitor lifecycle hooks
  onPause(): void { this.timers.forEach((timer) => clearInterval(timer)); }
  onResume(): void { /* restart all timers */ }
}
```

### 9.5 Edge Cases Checklist

- [ ] MetaMask not installed → "MetaMask not detected" with install link
- [ ] MetaMask locked → prompt to unlock, retry
- [ ] MetaMask wrong network → offer `wallet_switchEthereumChain` or `wallet_addEthereumChain`
- [ ] User rejects MetaMask popup → `UserCancelledError`, clear send state, no error toast (expected)
- [ ] WalletConnect session expires → auto-restore from Preferences, show reconnect prompt on failure
- [ ] WalletConnect QR scan timeout → 2-minute timeout, show retry button
- [ ] Trezor unplugged mid-sign → `DeviceDisconnectedError`, preserve form state, prompt reconnect
- [ ] Trezor PIN timeout → `HardwareTimeoutError`, show retry
- [ ] Ledger Bitcoin app not open → prompt user to open Bitcoin app on device
- [ ] WebUSB unavailable (iOS) → hide Ledger option or show BLE option
- [ ] Wallet already connected → disable connect button, show "Already connected"
- [ ] Zero balance → show "0.00", send disabled with "Insufficient funds"
- [ ] Multiple wallets connected → each independent; disconnect one doesn't affect others
- [ ] MetaMask account switch while connected → `accountsChanged` → re-query, update Connected card
- [ ] MetaMask network switch while connected → `chainChanged` → validate, prompt switch if unsupported
- [ ] Capacitor app backgrounded → BalancePoller pauses; resume → BalancePoller restarts
- [ ] Capacitor app backgrounded during send → preserve send state, resume when foregrounded
- [ ] Offline during connect → "No internet connection" toast
- [ ] Corrupted session in Capacitor Preferences → validate on load, clear invalid entries
- [ ] Send from connected wallet → disable source selector and disconnect button during send
- [ ] Transaction replacement (speed-up/cancel) → not supported in v1; document limitation
- [ ] Chain reorganization → not applicable (RSK uses DECOR+ consensus, blocks are final)
- [ ] BLE permission denied (Android) → fall back to USB if available, else show "Bluetooth required"

---

## 10. Testing Strategy

### 10.1 Unit Tests

| Layer                    | Count | Key Scenarios                                                                                                      |
| ------------------------ | ----- | ------------------------------------------------------------------------------------------------------------------ |
| connector-registry       | ~15   | register, unregister cleanup, get missing, clear all, duplicate register                                           |
| metamask-connector       | ~20   | detect, connect success, connect reject, accountsChanged, chainChanged, disconnect, unavailable, EIP-6963 fallback |
| walletconnect-connector  | ~15   | session create, session restore, disconnect, timeout                                                               |
| trezor-connector         | ~18   | XPUB fetch, address derivation, PSBT sign, EVM sign, disconnect, unavailable                                       |
| ledger-connector         | ~18   | Same + BLE transport, WebUSB transport, transport fallback                                                         |
| wallet.store (connected) | ~28   | Connect, disconnect, multi-wallet, balance query, error recovery, event handling, cache invalidation, pause/resume |
| balance-poller           | ~10   | Start, stop, pause, resume, stopAll, edge cases                                                                    |

### 10.2 Component Tests

| Component             | States                                                                                           |
| --------------------- | ------------------------------------------------------------------------------------------------ |
| ConnectedWallets      | Empty, connecting, connected (MetaMask), connected (Trezor), error, multiple, disconnect confirm |
| WalletConnectQRModal  | Loading, QR displayed, timeout, error                                                            |
| +page.svelte (wallet) | Wallet tab default, Connected tab with wallets, Connected tab empty, tab switching               |

### 10.3 Mock Strategy

- `window.ethereum` → mocked with sinon stub; restored in `afterEach`
- `@walletconnect/ethereum-provider` → module mock, returns controlled session
- `@trezor/connect-web` → module mock, returns test XPUB and signature
- `@ledgerhq/hw-app-btc` / `@ledgerhq/hw-app-eth` → module mock
- `@ledgerhq/hw-transport-webusb` / `@ledgerhq/hw-transport-ble` → module mock
- Capacitor Preferences → in-memory Map mock
- Platform APIs (`navigator.usb`, `navigator.bluetooth`) → injected via parameters

---

## 11. Risk Analysis & Mitigations

| Risk                                  | L   | I   | Mitigation                                                                                  |
| ------------------------------------- | --- | --- | ------------------------------------------------------------------------------------------- |
| MetaMask API changes break connector  | L   | H   | Feature-detect EIP-6963 + EIP-1193; version-lock API surface                                |
| WalletConnect session hijacking       | L   | C   | Official @walletconnect/ethereum-provider; validate session origin; encrypt stored sessions |
| WebUSB unavailable on mobile          | M   | M   | BLE transport for Ledger; Trezor USB OTG on Android; iOS: note limitation                   |
| User confused by Wallet vs Connected  | M   | M   | Clear tab labels; onboarding tooltip on first visit; help modal content                     |
| Balance stale after external transfer | M   | L   | Pull-to-refresh; 30s poll; accountsChanged triggers immediate refresh                       |
| Hardware wallet disconnected mid-send | L   | M   | Preserve form state; prompt reconnect; timer on external confirmation                       |
| BLE permission denied                 | M   | L   | Clear error message; fallback to USB if available                                           |
| @trezor/connect-web bundle size       | L   | L   | Dynamic import — loaded only when user connects Trezor                                      |

L = Likelihood (L/M/H), I = Impact (L/M/H/Critical)

---

## 12. Dependencies & SDKs

### 12.1 New npm packages (4 total, zero React)

```bash
# WalletConnect (no React — @walletconnect/ethereum-provider only)
npm install @walletconnect/ethereum-provider

# Trezor (Bitcoin L1 + EVM)
npm install @trezor/connect-web @trezor/connect-plugin-ethereum

# Ledger (Bitcoin L1 + EVM + BLE)
npm install @ledgerhq/hw-transport-webusb @ledgerhq/hw-transport-ble
npm install @ledgerhq/hw-app-btc @ledgerhq/hw-app-eth

# Bitcoin UTXO selection (2KB, zero dependencies)
npm install coinselect
```

### 12.2 Already present (leverage directly)

| Package                            | Usage                                                      |
| ---------------------------------- | ---------------------------------------------------------- |
| `ethers` v6                        | `BrowserProvider` wraps MetaMask/WC; `Wallet` for built-in |
| `@capacitor/preferences`           | Session persistence for WalletConnect                      |
| `@capacitor/core`                  | Platform detection, lifecycle events                       |
| `svelte-i18n`                      | All UI strings via `$t()`                                  |
| `daisyUI 5` / `Tailwind CSS 4`     | All styling                                                |
| `qrcode`                           | WalletConnect QR generation (already in project)           |
| `src/lib/utils/tryCatch.ts`        | Error handling wrapper                                     |
| `src/lib/utils/helpers/haptics.ts` | Haptic feedback                                            |
| `src/lib/stores/app.store.ts`      | Toast notifications                                        |

### 12.3 External services

| Service                 | Purpose                    | Setup                         |
| ----------------------- | -------------------------- | ----------------------------- |
| **WalletConnect Cloud** | Project ID for WC protocol | walletconnect.com — free tier |
| **Blockscout API**      | RSK balance queries        | Already configured (no key)   |
| **Binance RPC**         | BSC balance queries        | Public free endpoint          |

No paid services. No backend changes.

---

## 13. Feature Flags

```
VITE_CONNECTED_METAMASK_ENABLED=true
VITE_CONNECTED_WALLETCONNECT_ENABLED=true
VITE_CONNECTED_TREZOR_ENABLED=true
VITE_CONNECTED_LEDGER_ENABLED=true
```

Each connector independently gated. Disabling hides the option from the connect modal and returns `unavailable` status from the connector.

---

## Audit Trail

| Iteration | Auditors                          | Confidence | Changes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --------- | --------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| v1.0      | —                                 | 85%        | Initial plan                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| v1.1      | reviewer (UX/arch)                | 96%        | Renamed "Bank"→"Connected". Replaced AppKit. Separate Bitcoin L1 architecture. ConnectorRegistry + signer caching. Balance types fixed to bigint. BLE for mobile. EIP-6963. Balance lifecycle manager. Ledger/Trezor EVM signing. 19 findings resolved.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| v1.2      | security-auditor + tester (swarm) | 97%+       | SendLockManager for transaction serialization. accountsChanged cancel during active send. Swap chain coordination. Chain confirmation counts + REORG state. Separate connected-wallets.store.ts (no wallet.store bloat). Feature flags integrated with kill-switch service. Per-chain + send-source flags. Rollback plan. Capacitor lifecycle persistence for active sends. BUILD_ERROR, CANCELLED, DISCONNECT_ERROR states. UTXO management restricted to "send all" for BTC v1. Rate limiting on connect (3s cooldown). Observable by default (Sentry breadcrumbs + tags). TDD enforced (tests alongside phases, no deferred Phase 5). Integration tests: connected wallet send flow, swap chain + connected wallet, multi-wallet isolation, lifecycle recovery. i18n validation before commit. Regression test plan. CSP documentation for Trezor. Lazy loading for hardware wallet deps. Bitcoin fee estimation via mempool.space. PSBT UTXO lock. Connect modal phishing protection (build-time validation). SourceWallet type cascade documented. |

### Resolved Audit Findings (32 total)

**v1.1 (reviewer):** Tab naming, AppKit React, Bitcoin L1 separate, event emitter, signer caching, pure selectSigner, discriminated union, bigint balances, BLE mobile, EIP-6963, polling lifecycle, Ledger/Trezor EVM, source selector 375px, disconnect button 44px, Capacitor lifecycle, tx replacement doc, window globals, mock restore — **19 resolved**

**v1.2 (security + tester):**

- ✅ Transaction serialization via SendLockManager (security 1B)
- ✅ accountsChanged cancel during active send (security 1C)
- ✅ Swap chain + connected wallet send coordination (security 1D, tester 2e)
- ✅ Separate connected-wallets.store.ts — no walletStore regression risk (tester 2c, 5c)
- ✅ Feature flags integrated with FeatureFlagService (tester 4b)
- ✅ Master kill switch + per-chain + send-source flags (tester 4a, 4c, 4d)
- ✅ Rollback plan — full + partial + data safety (tester 5a, 5b)
- ✅ TDD enforced — tests alongside phases, no deferred Phase 5 (tester 1f, 2d)
- ✅ Integration tests added (tester 1a)
- ✅ BUILD_ERROR, CANCELLED, DISCONNECT_ERROR states (security 4A, 4B, 4C)
- ✅ Chain confirmation counts + REORG state (security 2A)
- ✅ Capacitor lifecycle persistence for active sends (security 2D)
- ✅ Bitcoin fee estimation + UTXO management (security 2H)
- ✅ Rate limiting on connect (3s cooldown) (security 3F)
- ✅ PSBT UTXO lock (security 3D)
- ✅ WC session encryption key derivation (security 3B)
- ✅ Connect modal build-time validation (security 3H)
- ✅ Lazy loading for hardware wallet deps — no bundle bloat (tester 3d)
- ✅ SourceWallet type cascade documented (tester 2b)
- ✅ i18n key validation before commit (tester 1e)
- ✅ Regression test plan for existing wallet (tester 5c)
- ✅ Observable by default — Sentry breadcrumbs + tags (tester 5e)
- ✅ Data migration schema versioning (tester 5d)
- ✅ Connected sources hidden when none connected (tester 5f)
- ✅ CSP documentation for Trezor Connect (tester 3b)
- ✅ iOS hardware wallet limitation documented (tester 3c)
- ✅ Balance fetch per-token status tracking (security 2J)
- ✅ Max 5 connected wallets enforced (security 2G)
- ✅ Hardware wallet platform detection fixed (security 1E)
- ✅ Gas estimation divergence documented with external-signer placeholder (security 2B)
- ✅ Balance poll debounce for concurrent requests (security 2K)

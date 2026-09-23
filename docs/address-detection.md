# Address Detection Standards

> Last updated: 2026-07-30

## Problem

RGB (chain 30), Arbitrum (chain 42161), Ethereum (chain 1), BSC (chain 56), Base (chain 8453) all use identical `0x`-prefixed 40-hex-char addresses derived from the same private key. Without a chain ID or scheme prefix, the parser cannot distinguish which chain a bare `0x` address belongs to, and defaults to RGB.

## Standards Used by Popular Wallets

### EIP-681 (ERC-681) — Ethereum Payment Request

**Status:** Final

**Format:**
```
ethereum:<address>[@<chainId>][/<function_name>][?<parameters>]
```

**Examples:**
- `ethereum:0xfb6916095ca1df60bb79Ce92ce3ea74c37c5d359?value=2.014e18`
- `ethereum:0xfb69...@30?value=1e18` (RGB mainnet)
- `ethereum:0xfb69...@42161?value=1e18` (Arbitrum One)
- `ethereum:<tokenContract>/transfer?address=<recipient>&uint256=<amount>`

**Wallet support:** MetaMask, Trust Wallet, Rainbow, Coinbase Wallet, imToken, Ledger Live

**Limitations:**
- `@chainId` is optional — most QR codes omit it, leading to ambiguity
- Amount is in wei (scientific notation), not human-friendly
- Ethereum-specific — no Bitcoin/Solana support
- Many wallets ignore chain ID and use their active network

### BIP-21 — Bitcoin URI Scheme

**Status:** Final (superseded by BIP-321)

**Format:**
```
bitcoin:<address>[?amount=<amount>][?label=<label>][?message=<message>]
```

**Example:**
```
bitcoin:175tWpb8K1S7NmH4Zx6rewF9WQrcZv245W?amount=20.3&label=Luke-Jr
```

**Support:** Universal for Bitcoin wallets

### CAIP-2 — Chain-Agnostic Blockchain ID

**Status:** Final

**Format:**
```
<namespace>:<reference>
```

**Examples:**
| Chain | CAIP-2 ID |
|-------|-----------|
| Ethereum Mainnet | `eip155:1` |
| RGB Mainnet | `eip155:30` |
| BSC Mainnet | `eip155:56` |
| Arbitrum One | `eip155:42161` |
| Bitcoin Mainnet | `bip122:000000000019d6689c085ae165831e93` |

### CAIP-10 — Chain-Agnostic Account ID

**Status:** Final

**Format:**
```
<chain_id>:<account_address>
```

**Examples:**
```
eip155:1:0xab16a96D359eC26a11e2C2b3d8f8B8942d5Bfcdb       # Ethereum
eip155:30:0xab16a96D359eC26a11e2C2b3d8f8B8942d5Bfcdb      # RGB
eip155:42161:0xab16a96D359eC26a11e2C2b3d8f8B8942d5Bfcdb   # Arbitrum
```

**Adoption:** WalletConnect v2, MetaMask Connect, Phantom, Rabby

### ENS Multi-Chain Resolution (ENSIP-9)

**Status:** Final

Uses SLIP-44 coin types for per-chain resolution:
```solidity
function addr(bytes32 node, uint coinType) external view returns(bytes memory);
```

- Coin type 60: Ethereum
- Coin type 137: RGB
- Coin type 0: Bitcoin

A single ENS name (e.g., `vitalik.eth`) can resolve to different addresses on different chains.

**Wallet support:** MetaMask, Trust Wallet, Rainbow, Coinbase Wallet

### Unstoppable Domains

**TLDs:** `.crypto`, `.x`, `.wallet`, `.bitcoin`, `.888`, `.nft`, `.dao`, `.zil`

**Multi-chain:** 310+ cryptocurrencies via `crypto.<TICKER>.address` records

**Limitations:** Centralized resolution API, less decentralized than ENS

## How Popular Wallets Handle Multi-Chain

| Wallet | Address Derivation | Chain Detection | Network Switching |
|--------|-------------------|-----------------|-------------------|
| **MetaMask** | Same address on all EVM chains | Manual network selector | EIP-681 `@chainId` triggers suggestion |
| **Trust Wallet** | Same address on all EVM chains | Auto-detects tokens | EIP-681 with chain ID |
| **Phantom** | Different for Solana vs EVM | CAIP-25 sessions | Auto-detects dapp chain |
| **Rabby** | Same address on all EVM chains | Auto-detects dapp chain | Shows all chain balances |
| **Rainbow** | Same address on all EVM chains | ENS multi-chain | L2-focused UX |

## Comparison Table

| Standard | Format | Chains | Multi-chain | Adoption |
|----------|--------|--------|-------------|----------|
| **EIP-681** | `ethereum:<addr>[@chainId]` | EVM only | Via `@chainId` | High |
| **BIP-21** | `bitcoin:<addr>[?params]` | Bitcoin only | No | Universal for BTC |
| **CAIP-2** | `<namespace>:<reference>` | Any | N/A (identifier only) | Growing |
| **CAIP-10** | `<chain_id>:<account_address>` | Any | Yes, explicit | Growing |
| **ENS (ENSIP-9)** | `name.eth` → per-chain addr | Any (SLIP-44) | Yes | High |
| **Unstoppable Domains** | `name.crypto` → per-ticker | 310+ cryptos | Yes | Medium |
| **WalletConnect v2** | CAIP-2 namespaces | Any | Yes | High |
| **Solana Pay** | `solana:<address>` | Solana | No | Medium |

## Recommendations for BitTasker

### Immediate (P0)

1. **Generate EIP-681 QR codes on receive:**
   - RGB: `ethereum:<address>@30`
   - Arbitrum: `ethereum:<address>@42161`
   - BSC: `ethereum:<address>@56`

2. **Parse EIP-681 on send input:**
   - Extract `@chainId` to auto-select network
   - Already supported in `paymentAddressParser.ts`

### Short-term (P1)

3. **CAIP-10 identifiers in APIs/payloads:**
   - `eip155:42161:<address>` for Arbitrum
   - `eip155:30:<address>` for RGB
   - Use in payment request payloads and inter-service communication

4. **Chain selector always visible on send:**
   - Even when auto-detected, show the chain dropdown
   - User can override if detection is wrong

### Long-term (P2-P3)

5. **ENS multi-chain resolution (ENSIP-9):**
   - `addr(namehash, coinType)` per chain
   - Requires ENS infrastructure investment

6. **Unstoppable Domains resolution:**
   - `.crypto`/`.wallet` names
   - 310+ cryptocurrency support

7. **CAIP-25 session management:**
   - Only needed for WalletConnect/dapp integration
   - MetaMask Connect compatibility

### What NOT to Do

- Do NOT accept bare `0x` addresses without a chain selector
- Do NOT rely on the user knowing which chain an address belongs to
- Do NOT implement EIP-831 — it's stagnant and adds no value over EIP-681

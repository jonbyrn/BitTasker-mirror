# USDt Integration Investigation

## Goal

Add USDt support to BitTasker so users can send, receive, and fund escrow contracts in USDt —
just like they currently do with BTC. USDt should be a first-class currency in the app, not a
conversion layer on top of BTC.

## Current Architecture

- **Chain**: RGB RGB (EVM-compatible, chain ID 30 mainnet / 31 testnet)
- **Native currency**: BTC (1:1 pegged to BTC)
- **Account model**: EOAs via ethers.js Wallet (mnemonic-derived)
- **Escrow contracts**: v1 & v2, both `payable` — only accept BTC via `msg.value`
- **Gas abstraction**: Custom tx-relay at `tx-relay.bittasker.com`. Handles gas for non-payable
  lifecycle calls (completeTask, acceptTask, disputeTask, etc.). Skips payable calls entirely —
  users fund escrow directly in BTC.
- **Token discovery**: Blockscout API — dynamically discovers all ERC-20 tokens on RGB
- **ERC-20 sending**: `sendRGBToken()` already works with any ERC-20 token
- **Price feed**: Coinbase API (`crypto-price.service.ts`)

Key code locations:

| Component              | Path                                                    |
| ---------------------- | ------------------------------------------------------- |
| Wallet store           | `src/lib/stores/wallet.store.ts`                        |
| Token types            | `src/lib/types/wallet.d.ts`                             |
| Token balance service  | `src/lib/api/services/token-balance.service.ts`         |
| Price service          | `src/lib/api/services/crypto-price.service.ts`          |
| Escrow v1              | `src/lib/utils/escrow/v1/escrow.ts`                     |
| Escrow v2              | `src/lib/utils/contract/v2/blockchainWrites.ts`         |
| Relay integration      | `src/lib/utils/contract/v2/blockchainWrites.ts:376-423` |
| Payment address parser | `src/lib/utils/helpers/paymentAddressParser.ts`         |

## RGB USDt Token Landscape

Tether has **not** officially deployed on RGB. All USDt variants are third-party bridged.

| Token         | Symbol | Address                                      | Decimals | Est. Supply on RGB | 24h Volume | Holders | Bridge            |
| ------------- | ------ | -------------------------------------------- | -------- | ------------------ | ---------- | ------- | ----------------- |
| **USDT0**     | USDT0  | `0x779dED0C9e1022225F8e0630b35A9B54Be713736` | 6        | ~1.94M             | **$104M**  | 580     | LayerZero OFT     |
| Stargate USDT | USDT   | `0xAF368c91793cb22739386DFCBbB2f1A9E4bcBEBf` | 6        | ~1.23M             | $2.8M      | 283     | Stargate          |
| RUSDT         | RUSDT  | `0xEf213441a85DF4d7acBdAe0Cf78004E1e486BB96` | 18       | ~972K              | $7.9K      | 3,248   | RGB native bridge |

### USDT0 Deep Dive

USDT0 is a **LayerZero Omnichain Fungible Token (OFT)**. The "0" suffix is LayerZero's naming
convention to distinguish bridged tokens from native deployments.

How it works:

```
Lock USDT on Ethereum → LayerZero mints USDT0 on RGB (1:1)
Burn USDT0 on RGB → LayerZero unlocks USDT on Ethereum
```

- Peg maintained by arbitrage (same mechanism as all bridged stablecoins)
- Exchange rate: $0.9995 (effectively 1:1)
- Backed 1:1 by USDT locked in LayerZero bridge on Ethereum
- LayerZero has $4B+ bridge TVL across 80+ chains

### Why USDT0 vs USDT Naming

On every chain Pimlico supports, the USDT token has symbol "USDT" — but most of those are ALSO
bridged tokens, not official Tether deployments. The naming difference is purely cosmetic:
LayerZero chose "USDT0", other bridges chose "USDT".

The Stargate USDT (`0xAF368c...`) already uses the symbol "USDT" and 6 decimals, but has 37x less
daily volume ($2.8M vs $104M). USDT0 is clearly the dominant stablecoin on RGB by usage.

## Pimlico Investigation

### What Pimlico Provides

Pimlico is a three-layer ERC-4337 infrastructure stack:

| Layer                  | Component                              | License | What It Does                                        |
| ---------------------- | -------------------------------------- | ------- | --------------------------------------------------- |
| Smart accounts         | ethers.js                              | MIT     | TypeScript library for Safe, Kernel, Biconomy, etc. |
| Transaction submission | Alto Bundler                           | GPL-3.0 | Submits UserOperations on-chain                     |
| Gas abstraction        | ERC-20 Paymaster / Singleton Paymaster | MIT     | Pays gas in native token, charges user in ERC-20    |

All three are open source. The ERC-20 paymaster is audited by OpenZeppelin.

### Pimlico's ERC-20 Paymaster Architecture

The paymaster has four modes encoded in the first byte of `paymasterData`:

| Mode | Who Pays Gas  | Spend Limit         |
| ---- | ------------- | ------------------- |
| 0    | User (sender) | No                  |
| 1    | User (sender) | Yes (32-byte limit) |
| 2    | Guarantor     | No                  |
| 3    | Guarantor     | Yes (32-byte limit) |

Uses a max-fee-then-refund pattern: takes maximum possible tokens upfront during validation,
refunds excess in `postOp` based on actual gas consumed.

Oracle system: Chainlink primary + TWAP (Uniswap V3) / Manual / Fixed fallbacks.

### Does Pimlico Support RGB?

**No.** Pimlico supports ~20 chains (Ethereum, Base, Polygon, Arbitrum, Optimism, BNB, Avalanche,
Gnosis, Scroll, Linea, Mantle, Mode, Celo, Blast, etc.) but NOT RGB RGB.

However, the ERC-20 paymaster contract is MIT licensed and can be studied/adapted. The Alto bundler
can connect to any EVM RPC via `--rpc-url`. The missing piece on RGB is the ERC-4337 EntryPoint
contract deployment — RGB uses RIF Relay instead, a different meta-transaction standard.

### Pimlico's USDT Tokens — Also Mostly Bridged

Most of Pimlico's "USDT" tokens on L2s are bridged, not official Tether:

| Chain    | Pimlico's USDT  | Actually...                             |
| -------- | --------------- | --------------------------------------- |
| Ethereum | `0xdAC17F...`   | Native Tether                           |
| Polygon  | `0xc2132D05...` | Bridged via PoS Bridge                  |
| Arbitrum | `0xFd086bC7...` | Bridged via Arbitrum Bridge             |
| Optimism | `0x94b008aA...` | Bridged via Optimism Bridge             |
| Base     | `0xfde4C96c...` | Bridged (Tether never deployed on Base) |
| BNB      | `0x55d39832...` | Binance-peg, not Tether at all          |

The underlying reality is identical to RGB: bridged USDT, 1:1 backed, maintained by arbitrage.

## RIF Relay — RGB's Native Alternative

RIF Relay is RGB's built-in meta-transaction system (predates ERC-4337). It enables:

- Gasless transactions via a relay server
- ERC-20 fee payment (allowlisted tokens)
- Smart wallets (SmartWallet, CustomSmartWallet, RGBSmartWallet)
- Three fee models: transferFeePercentage, gasFeePercentage, fixedUsdFee

Key constraints:

- Destination contracts must be explicitly allowlisted
- ERC-20 tokens must be explicitly allowlisted on verifier contracts
- Requires running a relay server + deploying/managing smart wallets
- Open source (MIT), deployed on RGB mainnet and testnet

RIF Relay solves the **gas payment** problem but not the **escrow** problem. Even with RIF Relay,
the escrow contract would still hold BTC unless upgraded to accept ERC-20 tokens.

## BitTasker's Existing Relay — How It Compares

The current relay at `tx-relay.bittasker.com` already provides gas abstraction for non-payable
calls. A critical code behavior in `blockchainWrites.ts:377-380`:

```typescript
if (hasNonZeroValue(options.overrides)) {
	// skip relay (payable / msg.value)
	return executeWriteDirect(options);
}
```

The relay **skips payable transactions entirely**. This means `createPaymentContract` (which sends
BTC to fund escrow) goes through direct write — the user must have BTC for both the escrow
amount AND the gas.

This is functionally equivalent to what Pimlico's paymaster does, but:

- Pimlico uses ERC-4337 standard (UserOperations, EntryPoint, smart accounts)
- BitTasker uses custom EIP-712 signed meta-transactions with EOAs

## Architectural Options

### Option A: Stay on RGB, New ERC-20 Escrow Contract

Deploy a v3 escrow contract on RGB that accepts ERC-20 tokens via `transferFrom` instead of
`msg.value`. The existing relay automatically handles gas for non-payable transactions.

**User flow**:

1. User approves escrow contract to spend USDT0
2. `createPaymentContract(token=USDT0, amount=1000)` → non-payable
3. Contract: `USDT0.transferFrom(user, contract, 1000)`
4. Relay handles gas (no BTC needed by user)
5. Escrow holds and releases USDT0

**Pros**: Minimal change to existing infrastructure. Relay handles gas automatically. Users only
need USDT, not BTC, for escrow operations.

**Cons**: USDT0 symbol is confusing (mitigated by UI normalization — display "USDt" regardless of
contract symbol). RGB ecosystem is small. Requires new contract audit.

### Option B: Migrate to Pimlico-Supported Chain

Deploy escrow contracts on a Pimlico-supported chain (e.g., Polygon, Base, Gnosis). Use Pimlico's
full stack for gas abstraction and smart accounts.

**User flow**:

1. User creates smart account via ethers.js
2. User has USDT (symbol "USDT", clean name)
3. `createPaymentContract` built as UserOperation
4. Bundler submits through ERC-20 paymaster
5. Both gas AND escrow funded in USDT
6. User never touches native token

**Pros**: Clean USDT naming. Full ERC-4337 standard. Larger ecosystem, better tooling. No relay to
maintain. Smart accounts enable recovery, multisig, passkeys.

**Cons**: Requires chain migration. New contract deployment + audit. Smart account UX is different
from current EOA model. RGB swap rails would need replacement. Existing RGB users would need to
migrate.

**Candidate chains**: Polygon (~$0.01-0.05 gas, massive USDT liquidity), Gnosis (~$0.01 gas, very
stable), Base (~$0.05-0.15 gas, Coinbase-backed).

### Option C: Hybrid — Stay on RGB + Deploy Pimlico-Style Paymaster

Keep RGB chain. Deploy a custom ERC-20 paymaster contract on RGB (inspired by Pimlico's MIT-licensed
design). Extend the existing relay to support ERC-20 fee payment.

**Pros**: No chain migration. Full USDt experience on RGB. Builds on existing infrastructure.

**Cons**: Most complex option. Requires deploying ERC-4337 EntryPoint + paymaster on RGB (or
adapting the paymaster concept to RGB's meta-transaction model). Significant custom development.

## Recommendation

**Option A** (new ERC-20 escrow contract on RGB, UI normalization of token name) is the recommended
path forward.

Rationale:

1. BitTasker is already deployed and live on RGB with existing users and contracts
2. The relay already provides gas abstraction for non-payable calls
3. An ERC-20 escrow contract (non-payable) fits perfectly into the existing relay flow — users
   never need BTC for escrow
4. USDT0 is the dominant stablecoin on RGB ($104M daily volume) and works as a standard ERC-20
5. The "USDT0" naming can be normalized to "USDt" in the UI — standard practice across wallets
   (MetaMask, Phantom, etc.)
6. The escrow contract can be token-agnostic: accept any whitelisted ERC-20, future-proofing for
   USDC.E, DOC, DLLR, or official Tether if it deploys on RGB

The Pimlico investigation validates the architectural pattern (ERC-20 payment + gas abstraction) but
is not directly usable due to lack of RGB support. The concepts are applicable — an ERC-20 escrow
contract combined with BitTasker's existing relay achieves the same result without chain migration.

## Contract Design Notes

A new ERC-20 escrow contract should:

- Accept a `token` parameter (whitelisted ERC-20 address)
- Use `IERC20(token).transferFrom(msg.sender, address(this), amount)` instead of `msg.value`
- Read decimals dynamically: `IERC20(token).decimals()`
- Maintain a whitelist of accepted tokens (initially USDT0)
- Otherwise mirror v2 escrow logic: timelocks, disputes, fee tiers, resolution
- Be non-payable so the existing relay handles all gas

Token whitelist for initial deployment:

- `0x779dED0C9e1022225F8e0630b35A9B54Be713736` — USDT0 (6 decimals)

## Open Questions

1. Pimlico pricing at scale — if chain migration becomes desirable, what are costs at 10K/100K/1M UserOps/month?
2. Smart account UX with Nostr identity — if migrating to the new account abstraction stack, does npub-based identity still work?
3. RGB replacement — if moving off RGB, what replaces the BTC/LN swap rails?
4. Audit scope for new ERC-20 escrow — OpenZeppelin-style audit timeline and cost?
5. Multi-chain future — could BitTasker support both RGB and a Pimlico chain simultaneously?

## Sources

- Pimlico ERC-20 Paymaster: https://docs.pimlico.io/references/paymaster/erc20-paymaster
- Pimlico ERC-20 Paymaster Architecture: https://docs.pimlico.io/references/paymaster/erc20-paymaster/architecture
- Pimlico Supported Tokens: https://docs.pimlico.io/references/paymaster/erc20-paymaster/supported-tokens
- Pimlico Contract Addresses: https://docs.pimlico.io/references/paymaster/erc20-paymaster/contract-addresses
- Pimlico GitHub (erc20-paymaster, MIT): https://github.com/pimlicolabs/erc20-paymaster
- Pimlico GitHub (singleton-paymaster): https://github.com/pimlicolabs/singleton-paymaster
- Pimlico GitHub (alto bundler, GPL-3.0): https://github.com/pimlicolabs/alto
- ethers.js (MIT): https://github.com/ethers-io/ethers.js
- RIF Relay Server: https://github.com/rgbsmart/rif-relay-server
- RIF Relay Contracts: https://github.com/rgbsmart/rif-relay-contracts
- Tether Supported Chains: https://tether.to/en/supported-chains/
- RGB Blockscout: https://rgb.blockscout.com
- RGB API: https://api.rgb.exchange/v2/swap/submarine

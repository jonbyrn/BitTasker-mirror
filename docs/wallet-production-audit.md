# Wallet Production Audit

**Date:** 2026-09-10
**Scope:** Embedded Bitcoin/RGB wallet, Lightning receive/send flow, recovery, network configuration, and production readiness.

## Executive Summary

BitTasker currently implements an embedded self-custody wallet backed by `@utexo/rgb-sdk-web` and `UTEXOWallet`. It does not currently connect to Green Wallet as an external wallet.

The wallet is derived from the authenticated user's encrypted mnemonic. The production preview tested during this audit was configured for Bitcoin testnet, not mainnet. The UI has Lightning invoice methods, but invoice generation depends on the internal UTEXO wallet and a compatible Lightning gateway being initialized successfully.

The highest-risk issue is wallet identity continuity: a testnet address that received funds differed from the address later displayed by the production wallet. No further funds should be sent until the address derivation and recovery path are proven deterministic.

## Verified Architecture

### Wallet creation

The wallet is initialized in [`src/lib/stores/wallet/wallet-init.ts`](../src/lib/stores/wallet/wallet-init.ts):

1. Read the authenticated user's mnemonic.
2. Derive a wallet password from the mnemonic.
3. Load `@utexo/rgb-sdk-web`.
4. Construct `UTEXOWallet` with mnemonic, password, network, indexer, RGB transport, Lightning proxy, and VSS settings.
5. Store the live wallet instance in memory as `state.utexoWallet`.
6. Read the wallet address and BTC balance.
7. Update the wallet store as connected.

`state.utexoWallet` is an in-memory object. It is not itself the persisted wallet backup.

### Mnemonic and authentication

Mnemonic recovery is implemented through [`src/lib/utils/helpers/mnemonic.ts`](../src/lib/utils/helpers/mnemonic.ts) and [`src/lib/utils/nostrKeys.ts`](../src/lib/utils/nostrKeys.ts).

The normal path is:

- User authenticates with the BitTasker account/passkey flow.
- Encrypted master-key data is retrieved or restored.
- Biometric/passkey-protected data is decrypted.
- The mnemonic is cached in application memory.
- The mnemonic is passed into `UTEXOWallet`.

The wallet is therefore tied to the BitTasker account's encrypted key material, not to a Green Wallet account.

### Wallet UI

The wallet page is [`src/routes/(app)/(protected)/wallet/+page.svelte`](../src/routes/(app)/(protected)/wallet/+page.svelte).

It initializes on mount, displays the wallet status, balance, address, transaction list, and send/receive controls. The `Connected` badge means the internal UTEXO wallet initialized; it does not prove that Lightning is available or that an external wallet is connected.

The receive UI is [`src/lib/components/wallet/ReceivePaymentForm.svelte`](../src/lib/components/wallet/ReceivePaymentForm.svelte).

Supported receive modes in the UI:

- On-chain BTC address
- Lightning invoice
- RGB USDT invoice

## Supported Operations

| Operation | Implementation | Assessment |
|---|---|---|
| Embedded wallet initialization | `UTEXOWallet` in `wallet-init.ts` | Implemented, needs production hardening |
| On-chain BTC address | `wallet.getAddress()` | Implemented |
| BTC balance | `wallet.getBtcBalance()` | Implemented |
| RGB asset listing | `wallet.listAssets()` | Implemented |
| On-chain BTC receive | Generated Taproot address | Implemented |
| On-chain BTC send | `wallet.sendBtc()` | Implemented, needs safety UX |
| Lightning invoice creation | `wallet.createLightningInvoice()` | Implemented in code, not proven end to end |
| Lightning payment | `wallet.payLightningInvoice()` | Implemented in code, not proven end to end |
| RGB receive | `witnessReceive()` / `blindReceive()` | Implemented in code |
| RGB send | `wallet.onchainSend()` | Implemented in code |
| Green Wallet connection | No integration found | Not implemented |
| NWC external wallet flow | Not verified in the wallet path | Not production-ready |

## Network Configuration

The tested build used:

```text
VITE_BITCOIN_NETWORK=testnet
VITE_BITCOIN_ELECTRUM_URL=wss://electrum.blockstream.info:60002
```

The `tb1p...` address prefix confirms a Bitcoin testnet Taproot address. Mainnet addresses normally use `bc1p...`.

Do not send mainnet BTC to the tested deployment.

The wallet initialization code defaults the Lightning proxy to:

```text
wss://ln-gateway-signet.utexo.com
```

That is a signet-oriented endpoint while the tested wallet is configured as testnet. The network, Electrum/indexer, RGB transport, and Lightning gateway must be explicitly compatible. Production must not rely on this fallback.

Relevant configuration variables:

```text
VITE_BITCOIN_NETWORK
VITE_BITCOIN_ELECTRUM_URL
VITE_RGB_TRANSPORT_ENDPOINT
VITE_RGB_LN_PROXY_URL
VITE_UTEXO_VSS_URL
```

## Funds and Recovery Risk

A testnet transfer was sent to:

```text
tb1p9y6en9yn3frqc30tsr5ygd9x6qphsg95nsxg0xsm2rqxu2a9ucfsz0tfvf
```

The production wallet later displayed:

```text
tb1pghwdna8uexcc8qnz3wf9t9jzam6lj9jnwtk4sugy0l8cxlj8d0rsk0zg4c
```

These addresses differ. Possible causes include:

- Different authenticated account
- Different mnemonic recovered by the passkey flow
- Earlier staging or test wallet session
- Changed derivation/index state
- Address generated from a different wallet instance

The UI does not currently expose enough recovery identity information to explain this safely.

### Required safeguards

Before production funding:

- Show the active network beside the address.
- Show the account `npub` or a shortened wallet identity.
- Show a stable wallet fingerprint or derivation/version.
- Provide an explicit backup/recovery flow.
- Restore the same mnemonic twice and verify the same address derivation.
- Never silently replace wallet state after authentication.
- Show a clear warning when the wallet address changes.
- Do not claim that a wallet is connected until initialization and synchronization are complete.

## Lightning Receive Assessment

The code path exists:

```ts
walletManager.createLightningInvoice({ amountSats })
```

which delegates to:

```ts
state.utexoWallet.createLightningInvoice(params)
```

However, the current flow requires all of the following:

- Internal `UTEXOWallet` initialized
- Correct network configuration
- Reachable Lightning gateway
- Gateway supports invoice creation on that network
- Wallet has the required Lightning node/channel state
- Settlement monitoring is working

The current UI does not clearly distinguish:

- Wallet initialized
- Indexer connected
- RGB transport connected
- Lightning gateway connected
- Lightning liquidity available

Invoice errors should become structured user-facing states rather than raw exceptions such as timeouts or `No channels`.

## Current Production Blockers

### P0: Funds safety

- Address continuity and recovery are not proven.
- Network identity is not prominent enough in the wallet UI.
- The app can show a connected embedded wallet while Lightning remains unavailable.
- There is no verified recovery path for the previously funded address.

### P1: Lightning readiness

- Lightning invoice generation has not been completed successfully end to end.
- The default signet gateway may not match the testnet wallet configuration.
- Channel/liquidity and gateway health are not exposed before invoice creation.
- No external Green Wallet or NWC receive flow is implemented.

### P1: Backend/deployment contract

The tested frontend also showed unrelated backend problems:

```text
/api/v1/notification-center/unread-count -> 404
Socket.IO notification connection failures
```

These do not directly explain the wallet address mismatch, but they indicate frontend/backend deployment contracts still need reconciliation.

### P2: UX clarity

- `Connected` currently means embedded wallet initialization, not external wallet connection.
- The UI needs explicit `Testnet` or `Mainnet` labeling.
- Invoice generation needs actionable errors and retry states.
- Address copy/receive screens need a visible identity and network context.

## Production Plan

### Phase 1: Make wallet identity safe

- Add wallet identity, network, and derivation metadata to the wallet screen.
- Add a deterministic recovery test for the same mnemonic and account.
- Add explicit import/restore support.
- Add a confirmation screen before funding that displays the exact address and network.
- Add tests for account switching and mnemonic/address continuity.

### Phase 2: Make network configuration explicit

- Create separate testnet/signet and mainnet deployment profiles.
- Require network configuration in production instead of defaulting silently.
- Validate that the Electrum/indexer and Lightning gateway match the selected network.
- Prevent mainnet/testnet address confusion.
- Display the active network in all receive and send flows.

### Phase 3: Prove Lightning

- Configure the correct Lightning gateway for the selected network.
- Add a startup health check for the Lightning service.
- Expose channel/liquidity status.
- Generate an invoice from the production-like environment.
- Pay it from an external compatible testnet Lightning wallet.
- Confirm settlement and balance refresh.
- Test payment failure, timeout, expiry, and no-channel states.

### Phase 4: Choose the wallet product model

Choose and document one of these models:

1. **Embedded wallet:** BitTasker owns the wallet UX and users fund generated addresses/invoices.
2. **External wallet:** BitTasker integrates Green Wallet or NWC and does not derive its own spending wallet.
3. **Hybrid:** embedded RGB wallet plus a separate external Lightning wallet.

The current implementation is closest to option 1, but the UI language can be interpreted as option 3.

### Phase 5: Operational hardening

- Fix or remove the missing notification endpoint request.
- Verify the Socket.IO gateway after backend rollout.
- Add monitoring for wallet initialization, indexer timeout, gateway timeout, invoice creation, settlement, and address changes.
- Add a non-secret support diagnostic showing network, wallet fingerprint, gateway status, and last sync error.
- Do not log mnemonics, nsec values, passkey secrets, or decrypted wallet material.

## Go/No-Go Criteria

Do not enable real-user production funding until all of these are true:

- The same mnemonic deterministically recreates the expected address.
- The user can view and verify the network and address before funding.
- Recovery works on a fresh browser/device.
- On-chain testnet funding appears after synchronization.
- Lightning invoice creation succeeds on the configured network.
- An external test wallet can pay the invoice.
- Settlement updates the wallet balance.
- Mainnet and testnet deployments cannot be confused.
- Wallet initialization failures are visible and actionable.

## Bottom Line

The wallet is a real embedded UTEXO/RGB wallet with code paths for on-chain Bitcoin, RGB assets, and Lightning invoices. It is not currently a Green Wallet connector. The tested environment is testnet. The main production risk is not the receive form itself; it is deterministic wallet identity and recovery, followed by unverified Lightning gateway/network compatibility.

Treat the previously funded address as a separate wallet until its mnemonic and account identity are proven to match the currently connected production wallet.

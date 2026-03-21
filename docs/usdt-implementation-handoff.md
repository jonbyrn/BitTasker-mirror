# USDT Implementation Handoff

This document is the shortest path for another developer to understand the `feat/usdt` branch, the matching `wallet-core` work in the tree, and the remaining decisions needed to finish the USDT implementation safely.

## Purpose

The branch adds a BSC/USDT payment rail alongside the existing Rootstock/rBTC rail. The changes are not limited to wallet send/receive. They touch:

- wallet send/receive/payment request flows
- transaction normalization and history rendering
- task, bid, and contract payment metadata normalization
- sponsor-service scaffolding for gasless BSC direct sends
- DirectSendRouter smart contract work
- a local `wallet-core` checkout with new BSC direct-send APIs

The branch currently passes the full app pre-push test suite on this machine.

## Branch Snapshot

Top-level comparison:

- Base branch: `dev`
- Feature branch: `feat/usdt`
- Current branch head: `b4abf104`
- Full push gate that passed: `vitest run src/lib/tests/unit/ src/lib/tests/integration/routes/ src/lib/tests/components/`

High-level commit themes after `dev`:

1. Core USDT-BSC implementation across app, contracts, sponsor-service, and tests.
2. Global BTC/rBTC market-price store rollout.
3. Wallet send Step 1 UX tightening for Rootstock and USDT on BSC.
4. Follow-up test alignment and hook fixes needed to keep `git push` green.

## Most Important Architectural Decision

The branch separates ownership like this:

- App:
  UI, payment-rail selection, validation copy, transaction normalization/presentation, task/bid/contract metadata normalization, wallet-store orchestration, and global market-price usage.
- `wallet-core`:
  BSC wallet behavior, sponsor status lookup, BSC direct-send preflight/submission APIs, and lower-level BSC transaction/direct-send logic.
- Sponsor service:
  Server-side validation, EIP-712/meta-tx handling, treasury/rate-limit/policy checks, and actual sponsored submission.
- Contracts:
  `DirectSendRouter` and related deployment/test infrastructure.

That split matters. If something is generic wallet/network behavior, it should usually land in `wallet-core`. If it is BitTasker-specific UX, fallback messaging, or cross-surface presentation logic, it belongs in the app.

## Critical Integration Caveat

The tree contains a local `wallet-core/` git checkout, but the app still depends on the published package:

```json
"@bittasker/wallet-core": "^0.1.10"
```

Important implications:

- The local `wallet-core/` directory is not wired as a normal workspace dependency.
- Top-level git treats `wallet-core` as a gitlink-style entry, but there is no `.gitmodules` mapping.
- The app code includes defensive fallbacks for older `wallet-core` builds:
  - sponsor status unavailable
  - preflight unavailable
  - submission unavailable
- To finish the feature properly, the next developer must choose one of:
  - publish a new `@bittasker/wallet-core` version containing the BSC direct-send work
  - temporarily switch the app to a local/file/workspace dependency
  - otherwise guarantee the app is actually running against the updated SDK

If this is missed, the UI can look ready while still hitting the “wallet-core build unavailable” fallback paths.

## What Changed In The App

### 1. Payment Rail Model

The branch introduces explicit payment context normalization across the app:

- `paymentAsset`: `RBTC` or `USDT`
- `paymentNetwork`: `rsk-mainnet`, `rsk-testnet`, `bsc-mainnet`, `bsc-testnet`

Key files:

- `src/lib/utils/helpers/paymentContext.ts`
- `src/lib/stores/task.store.ts`
- `src/lib/stores/bid.store.ts`
- `src/lib/nostr/task.ts`
- `src/lib/utils/nostr-bid.ts`
- `src/lib/types/task.d.ts`
- `src/lib/types/bid.d.ts`
- `src/lib/types/contract.d.ts`

Why it matters:

- Old data often only had asset or only network.
- The branch normalizes legacy drafts and legacy task/bid/contract records into a canonical rail.
- BSC surfaces are generally fail-closed when rail context is missing or stale.

### 2. Wallet Send Flow

The main send implementation work is in:

- `src/lib/components/wallet/SendPaymentForm.svelte`
- `src/lib/stores/wallet.store.ts`
- `src/lib/utils/helpers/paymentAddressParser.ts`
- `src/lib/tests/components/SendPaymentForm.test.ts`

Key behavior now:

- Step 1 validates against the detected rail.
- `USDT on BSC` disables `Sats`; if `Sats` was selected, it forces `USD`.
- Non-BSC rails preserve the selected unit.
- Rootstock available balance shows sats plus USD.
- QR scans reset `currentStep` back to Step 1.
- Ambiguous EVM addresses show an explicit rail-selection UI.
- Step 1 balance uses the already-loaded wallet balance and store-owned freshness instead of reloading aggressively.

### 3. Receive Flow And Payment Requests

Main files:

- `src/lib/components/wallet/ReceivePaymentForm.svelte`
- `src/lib/components/wallet/PaymentRequestModal.svelte`
- `src/lib/components/wallet/InvoiceDisplay.svelte`
- `src/lib/tests/components/ReceivePaymentForm.bsc.test.ts`
- `src/lib/tests/components/ReceivePaymentForm.integration.test.ts`
- `src/lib/tests/components/PaymentRequestModal.test.ts`

What was added:

- direct `USDT on BSC` receive flow
- `bsc:` chain-qualified payment request URIs
- token-native amount handling with 6-decimal precision
- payment request modal network badge and BSC-specific warning copy
- direct-request paid detection from matching confirmed BSC USDT receives

### 4. Global BTC/rBTC Price Store

Main files:

- `src/lib/stores/market-price.store.ts`
- `src/routes/+layout.svelte`
- `src/lib/stores/wallet.store.ts`
- `src/lib/utils/helpers/currencyFormatter.ts`

This branch moved BTC/rBTC pricing toward a global source of truth used by:

- wallet send/receive UI
- amount display
- tasks/find-tasks
- bidding/contract/task summary surfaces

This matters because Rootstock Step 1 validation and sats/USD conversions now assume a shared app-level price source instead of local fetches.

### 5. Transaction History And Surface Normalization

Main files:

- `src/lib/utils/wallet/transactionHistory.ts`
- `src/lib/api/services/balanceHistory.service.ts`
- `src/lib/components/wallet/TransactionHistory.svelte`
- `src/lib/components/wallet/BalanceHistory.svelte`
- `src/lib/components/wallet/PendingTransactionScreen.svelte`
- `src/lib/components/wallet/TransactionSuccessScreen.svelte`

Also relevant:

- contract/task/bid surfaces now display canonical BSC rail labels and suppress invalid Rootstock-style sats/RBTC display when the rail is BSC or ambiguous.

Examples:

- `src/lib/components/contracts/ContractCard.svelte`
- `src/lib/components/contracts/ContractTimeline.svelte`
- `src/lib/components/task/details/TaskTab.svelte`
- `src/lib/components/bidding/BidAcceptanceForm.svelte`

### 6. Sponsor Service And Router Contract Work

Main directories:

- `src/sponsor-service/`
- `contracts/`

This branch contains substantial implementation and scaffolding for:

- sponsor-service API routes
- BSC treasury / router health checks
- submission pipeline for sponsored sends
- EIP-712/meta-transaction handling
- DirectSendRouter contract and tests

Treat these as part of the implementation path, not just notes.

## `wallet-core` Delta In This Tree

Local `wallet-core` head:

- `8035db0` `Canonicalize BSC direct-send contract`

Relevant commit range present in the local checkout beyond the published `v0.1.10` tag:

- `6855a27` `fix: resolve test address validation issues`
- `852c435` `fix: critical WebSocket crash prevention and error handling`
- `8035db0` `Canonicalize BSC direct-send contract`

Main changed SDK files:

- `wallet-core/src/chains/bsc/BSCWallet.ts`
- `wallet-core/src/chains/bsc/bsc-direct-send.ts`
- `wallet-core/src/core/WalletManager.ts`
- `wallet-core/src/core/types.ts`
- `wallet-core/src/index.ts`

New/important SDK APIs surfaced by the branch:

- `getBscSponsorStatus()`
- `preflightBscDirectSend(...)`
- `submitBscDirectSend(...)`
- direct-send failure codes for app mapping

`wallet-core` intent:

- app should not own low-level BSC direct-send RPC validation logic
- app should call wallet-store wrappers around wallet-core
- wallet-core should remain app-agnostic and take config as parameters

## Ownership Map For Finishing The Feature

### App-Owned

Keep these in the BitTasker app:

- unit switching rules in send/receive UI
- ambiguous address UX and copy
- market-price store integration
- Rootstock/BSC available-balance presentation
- mapping raw transactions into BitTasker cards
- task/bid/contract payment metadata normalization
- fail-closed UI when rail context is missing

### `wallet-core`-Owned

Keep these in `wallet-core`:

- BSC wallet signer/provider behavior
- sponsor status calls
- preflight direct-send validation
- submission API wrapper
- direct-send failure-code vocabulary
- BSC transaction parsing that is generic to the SDK

### Sponsor-Service-Owned

- `/v1/usdt-bsc/status`
- `/v1/usdt-bsc/submit-send`
- signature verification / EIP-712 checks
- treasury health / throttling / policy rules
- submission lifecycle persistence and confirmation polling

### Contract-Owned

- `DirectSendRouter.sol`
- router pause/allowlist behavior
- fixed-fee and token-config semantics
- deployment scripts / address promotion / verification

## Environment And Config You Need To Know

App `.env.example` contains the relevant app-side variables:

- `VITE_RSK_NETWORK`
- `VITE_BSC_NETWORK`
- `VITE_BSC_USDT_TOKEN_ADDRESS`
- `VITE_BSC_DIRECT_SEND_ROUTER_ADDRESS`
- `VITE_BSC_DIRECT_SEND_FIXED_FEE_ATOMIC`
- `VITE_BSC_SPONSOR_STATUS_URL`

Sponsor-service `.env.example` contains:

- `BSC_MAINNET_RPC_URL`
- `BSC_MAINNET_ROUTER_ADDRESS`
- `BSC_MAINNET_SPONSOR_ADDRESS`
- `BSC_MAINNET_USDT_ADDRESS`
- `BSC_TESTNET_RPC_URL`
- `BSC_TESTNET_ROUTER_ADDRESS`
- `BSC_TESTNET_SPONSOR_ADDRESS`
- `BSC_TESTNET_USDT_ADDRESS`

Contracts `.env.example` contains:

- `BSC_TESTNET_RPC`
- `BSC_MAINNET_RPC`
- `USDT_CONTRACT_ADDRESS`
- `FIXED_FEE_USDT`

## How To Read This Branch Quickly

If you are new to the branch, read in this order:

1. `src/lib/stores/wallet.store.ts`
2. `src/lib/components/wallet/SendPaymentForm.svelte`
3. `src/lib/components/wallet/ReceivePaymentForm.svelte`
4. `src/lib/components/wallet/PaymentRequestModal.svelte`
5. `src/lib/utils/helpers/paymentContext.ts`
6. `src/lib/utils/wallet/transactionHistory.ts`
7. `src/sponsor-service/README.md`
8. `contracts/contracts/DirectSendRouter.sol`
9. `wallet-core/src/core/types.ts`
10. `wallet-core/src/chains/bsc/bsc-direct-send.ts`

## Existing Branch Documentation Worth Reusing

There is already a large amount of branch-specific documentation and audit material. Use it as reference material, not as the primary handoff:

- `USDT-reports/`
- `docs/escrow-bsc-integration-guide.md`
- `docs/BSC_TESTNET_DEPLOYMENT_GUIDE.md`
- `docs/BSC_DEPLOYMENT_SUMMARY.md`
- `requirements/usdt-bsc-*`
- `src/sponsor-service/*.md`

## Remaining Work / Decisions For The Next Developer

These are the main things to verify or finish before treating the feature as complete.

### 1. Decide How The App Consumes The Updated SDK

This is the first blocker.

- If you do nothing, the app will still resolve `@bittasker/wallet-core` from npm.
- The local `wallet-core` checkout will not magically be used by the app.
- Publish or link the updated SDK before finishing direct-send integration.

### 2. Decide Whether `wallet-core/` Stays In-Tree

Right now it behaves like a gitlink entry without a normal `.gitmodules` mapping.

Pick one:

- real submodule
- workspace/file dependency
- remove from this repo and consume only published package versions

Do not leave this ambiguous.

### 3. Confirm Direct-Send End-To-End On The Intended Environment

You need a real integrated test of:

- router deployed address
- sponsor-service healthy status
- wallet-core preflight returns `isReady`
- submission path returns real tx hash
- transaction history reflects the resulting send/receive correctly

### 4. Re-verify BSC Transaction History Parity With Live Data

The branch adds BSC-specific transaction normalization and tests, but live gasless flows still deserve manual verification because they involve:

- contract interactions
- sponsor-submitted transactions
- token transfers
- fee display rules

Make sure user-facing cards still read as sends/receives where expected.

### 5. Verify The Fail-Closed Rules Are Still What Product Wants

The branch intentionally blocks or suppresses behavior when:

- rail context is missing
- ABI/deployment context is missing
- direct-send submission APIs are unavailable

This is safer, but it means developer/test environments need real config to see the happy path.

## Suggested Validation Checklist

Before merging or continuing feature work:

1. Confirm whether the running app is using published `wallet-core` or local `wallet-core`.
2. Confirm the router address, token address, and sponsor-service base URL for the active environment.
3. Run app targeted tests for:
   - `SendPaymentForm`
   - `ReceivePaymentForm`
   - `PaymentRequestModal`
   - `TransactionHistory`
   - `wallet.store`
4. Run sponsor-service tests.
5. Run contract tests.
6. Perform one manual happy-path send and one manual receive on BSC.
7. Perform one manual Rootstock send/receive regression pass, especially around Step 1 pricing and validation.

## Useful Commands

App targeted commands:

```bash
npm run test -- src/lib/tests/components/SendPaymentForm.test.ts
npm run test -- src/lib/tests/components/ReceivePaymentForm.test.ts
npm run test -- src/lib/tests/components/PaymentRequestModal.test.ts
npm run test -- src/lib/tests/unit/stores/wallet.store.functions.test.ts
```

Full app gate:

```bash
npm run test:ci
```

Sponsor-service:

```bash
npm run sponsor:test
```

Contracts:

```bash
cd contracts
npm test
```

Local wallet-core:

```bash
cd wallet-core
npm test
```

## Bottom Line

The branch is not “just UI for USDT”. It is a cross-cutting payment-rail implementation spanning app UX, payment metadata normalization, wallet orchestration, sponsor-service, contracts, and a newer `wallet-core` API surface.

The single most important thing for the next developer is to resolve the SDK consumption story first. After that, the remaining work is mostly integration hardening, live-environment verification, and deciding which of the in-tree prototype pieces become the canonical production path.

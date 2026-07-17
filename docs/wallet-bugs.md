# Wallet Bug Tracker

**Created:** 2026-07-15
**Purpose:** Track bugs found during manual wallet testing and code analysis.
**Related:** `docs/wallet-audit.md` (full audit), `docs/wallet-test-guide.md` (testing guide)

---

## How to Use

- Each bug has a unique ID, severity, status, and reproduction steps
- Severity: CRITICAL > HIGH > MEDIUM > LOW
- Status: OPEN | INVESTIGATING | FIXED | WONTFIX | BYDESIGN
- Cross-reference with `wallet-audit.md` bug numbers where applicable

---

## OPEN BUGS

### BUG-W001: Swap Gets Stuck at "Locking rBTC → [ID]" Forever

**Severity:** HIGH
**Status:** OPEN
**Found by:** Manual testing (2026-07-15)
**Related:** New finding

**Description:**
After clicking "Swap" in the SwapForm, the drawer shows a spinner with "Locking rBTC → [swapId]" that never completes. After 5+ minutes, the drawer goes blank — showing only the "Swap assets" title and close button with no content.

**Root cause (from code analysis):**
1. `SwapForm.svelte:executeSwap()` sets `swapPhase = 'executing'` before the async `executeSwapChain()` call
2. The swap chain calls `BoltzProvider.createSwap()` (hardcoded to `https://api.boltz.exchange/v2`) — this succeeds and returns a swap ID
3. `setSwapProgress('locking-rbtc', ...)` fires, showing the "Locking rBTC → [id]" message
4. `lockRskFunds()` is called to send an RSK transaction — this is where it likely hangs
5. If `lockRskFunds()` hangs (gas estimation failure, nonce conflict, RPC timeout), the UI stays in executing state indefinitely
6. The 20-minute timeout (`SWAP_TIMEOUT_MS`) should catch this, but the hang may be inside an unresolved Promise

**The blank drawer** happens because `swapPhase` stays `'executing'` but `swapProgressMessage` may become empty or the async chain resolves without updating the phase back to `'form'`.

**Key log evidence:**
```
wallet-init.ts:236 Unknown Boltz network: testnet, falling back to regtest
wallet-init.ts:237 Failed to connect WebSocket for swap monitoring
transactionHistory.ts:52 GET http://localhost:9001/v2/chain/RBTC/contracts net::ERR_CONNECTION_REFUSED
```

**Additional context:** The wallet-core's `BoltzClient` falls back to regtest (`ws://localhost:9001`) because `BOLTZ_NETWORKS` has no `testnet` entry. The custom `BoltzProvider.ts` used by the swap chain always hits mainnet (`https://api.boltz.exchange/v2`). These are two separate Boltz integrations with different network configs.

**Reproduction:**
1. Navigate to `/wallet` → tap "Swap"
2. Select rBTC → USDT0 on Arbitrum route
3. Enter an amount, preview, confirm
4. Observe "Locking rBTC → [id]" spinner that never resolves

**Expected:** Swap completes within 5-10 minutes or shows a clear error.
**Actual:** Spinner runs forever, drawer eventually goes blank.

---

### BUG-W002: Boltz SDK Falls Back to Regtest (localhost:9001) on Testnet

**Severity:** CRITICAL
**Status:** OPEN
**Found by:** Console log analysis (2026-07-15)
**Related:** New finding

**Description:**
The wallet-core SDK's `BOLTZ_NETWORKS` config only defines `regtest` and `mainnet`. When `VITE_RSK_NETWORK=testnet`, `getBoltzConfig()` can't find a `testnet` entry and falls back to regtest, which points to `localhost:9001`.

**Console evidence:**
```
Unknown Boltz network: testnet, falling back to regtest
WebSocket connection to 'ws://localhost:9001/v2/ws' failed
GET http://localhost:9001/v2/chain/RBTC/contracts net::ERR_CONNECTION_REFUSED
Max reconnection attempts reached - stopping reconnection
```

**Impact:**
- Wallet-core's `BoltzClient` WebSocket cannot connect → swap monitoring fails
- Swap recovery via wallet-core fails (uses regtest API URL)
- `createChainSwap()` and `createSubmarineSwap()` from `wallet-swaps.ts` fail
- Transaction history cannot fetch Boltz contract addresses

**The dual-path problem:** There are TWO separate Boltz integrations:
1. Custom `BoltzProvider.ts` — hardcoded `https://api.boltz.exchange/v2` (always mainnet) — used by swap chain executors
2. Wallet-core `BoltzClient` — uses `getBoltzConfig()` → falls back to regtest — used by swap recovery, WebSocket, contract queries

**Fix:** Add a `testnet` entry to `BOLTZ_NETWORKS` that maps to the mainnet Boltz API, since Boltz.exchange does not have a separate testnet environment. Or map `testnet` → `mainnet` in `getBoltzConfig()`.

---

### BUG-W003: Hardhat Fork Shows "Calling an account which is not a contract" for All Arbitrum Tokens

**Severity:** HIGH
**Status:** OPEN
**Found by:** Manual testing (2026-07-15)
**Related:** Configuration issue

**Description:**
The Hardhat Arbitrum fork shows repeated warnings:
```
WARNING: Calling an account which is not a contract
From: 0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266
To:   0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9  (USDT0)
To:   0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f  (WBTC)
To:   0x6c84a8f1c29108f47a79964b5fe888d4f4d0de40  (tBTC)
```

**Root cause:** The Hardhat config uses the public Arbitrum RPC (`arb1.arbitrum.io/rpc`) which is a **pruned node**. Pruned nodes cannot serve historical state trie data. When Hardhat tries to fork and fetch contract bytecode, the pruned RPC returns `0x` (empty), so Hardhat treats these addresses as EOAs (no contract).

**Impact:**
- All Arbitrum token balances show 0 (USDT0, WBTC, tBTC)
- Balance display shows `rbtc, usdt0-arb, wbtc-arb, bnb` but with zero values for Arbitrum tokens
- MetaMask connected wallet also shows 0 balance for these tokens

**Fix:** Use an archive RPC for Hardhat forking:
```bash
# In meta-tx-relay/contracts/.env
ARBITRUM_RPC_URL=https://arb-mainnet.g.alchemy.com/v2/YOUR_KEY
```

**Workaround:** The existing `deploy-mock-usdt.js` script uses `anvil_setCode` (Foundry-specific) which doesn't work on Hardhat. It needs `hardhat_setCode` instead, and the mock decimals need fixing (USDT0=6, WBTC=8, tBTC=18).

---

### BUG-W004: MetaMask Connector Queries Unauthorized Chains, Causing Console Spam

**Severity:** MEDIUM
**Status:** OPEN
**Found by:** Console log analysis (2026-07-15)
**Related:** New finding

**Description:**
The MetaMask `fetchBalances()` function queries tokens on ALL chains in `VERIFIED_TOKENS` (Ethereum, Polygon, Base, Optimism, etc.) regardless of which chains the user has authorized in MetaMask. This produces ~20+ failed RPC calls per 30-second poll cycle with error code 4100 ("method has not been authorized by the user").

**Console evidence (repeats every 30 seconds):**
```
[MetaMask] fetchBalances: querying tokens on all supported chains
[MetaMask] fetchBalances Tier2 skip 1-USDT _RPCInvokeMethodErr2: RPCErr53: RPC Request failed with code 4100
[MetaMask] fetchBalances Tier2 skip 1-USDC _RPCInvokeMethodErr2: ...
[MetaMask] fetchBalances Tier2 skip 137-USDT _RPCInvokeMethodErr2: ...
[MetaMask] fetchBalances Tier2 skip 8453-USDC _RPCInvokeMethodErr2: ...
[MetaMask] fetchBalances result: []
```

**Root cause:** `metamask-connector.ts:fetchBalances()` Tier 2 loop iterates `VERIFIED_TOKENS` without filtering by the session's authorized `chainIds`. The `chainIds` parameter is available in scope but unused.

**Fix:** Filter Tier 2 chains by session chains:
```typescript
for (const [chainIdStr, tokens] of Object.entries(VERIFIED_TOKENS)) {
    const chainId = Number(chainIdStr);
    if (!chainIds.includes(chainId)) continue; // Skip unauthorized chains
```

---

### BUG-W005: MetaMask Balance Not Showing for Hardhat Account

**Severity:** MEDIUM
**Status:** OPEN
**Found by:** Manual testing (2026-07-15)
**Related:** Connected to BUG-W003

**Description:**
MetaMask extension does not show the balance for Hardhat account `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` (account #0, should have 10,000 ETH).

**Possible causes:**
1. If the Hardhat fork failed silently (pruned RPC), Hardhat may start at block 0 — the account still gets 10,000 ETH from genesis but MetaMask may not query correctly
2. MetaMask may be pointing to a different RPC or chain ID
3. The account may not be properly imported/selected in MetaMask

**Needs:** Further investigation — may be resolved by fixing BUG-W003 (using archive RPC).

---

### BUG-W006: LI.FI API Returns 400/404 for Quote-Only Calls with Dummy Address

**Severity:** LOW
**Status:** OPEN (cosmetic)
**Found by:** Console log analysis (2026-07-15)
**Related:** Existing behavior

**Description:**
The route engine uses a dummy address (`0x0000000000000000000000000000000000000001`) for LI.FI quote-only calls. LI.FI API rejects this with 400/404.

**Console evidence:**
```
GET https://li.quest/v1/quote?...&fromAddress=0x0000000000000000000000000000000000000001 400 (Bad Request)
GET https://li.quest/v1/quote?...&fromAddress=0x0000000000000000000000000000000000000001 404 (Not Found)
```

**Impact:** Cosmetic only — the route engine handles the failure gracefully and falls back to other providers. But it clutters the console.

---

### BUG-W007: Wallet Initialization Fails with Biometric Error

**Severity:** MEDIUM
**Status:** OPEN
**Found by:** Console log analysis (2026-07-15)
**Related:** Existing behavior

**Description:**
On first wallet page load, `getMnemonic()` fails with a biometric authentication error:
```
Failed to get biometric data: NotAllowedError: The operation either timed out or was not allowed.
```

**Impact:** The wallet fails to initialize on the first attempt. The error propagates as an unhandled rejection. On subsequent navigations back to the wallet page, it may succeed (if the mnemonic is cached or biometric is auto-approved).

**Console evidence:**
```
wallet-init.ts:284 [WALLET-STORE] initializeWallet() - Failed to initialize wallet: Error: The operation either timed out or was not allowed.
```

**Note:** This is likely expected behavior in a development environment where WebAuthn/biometric is not configured. But the error should be handled gracefully with a user-visible message rather than an unhandled rejection.

---

### BUG-W008: Swap Drawer Goes Blank After Timeout

**Severity:** MEDIUM
**Status:** OPEN
**Found by:** Manual testing (2026-07-15)
**Related:** Connected to BUG-W001

**Description:**
After the swap spinner stops (either from timeout or silent failure), the drawer shows only the "Swap assets" title and close button — no error message, no retry option, no indication of what happened.

**Root cause:** The `<Drawer>` component renders its title unconditionally. The body content is controlled by `swapPhase`:
- `'executing'` → shows spinner + progress message
- `'form'` → shows the swap form
- Other phases → shows corresponding UI

If `swapPhase` transitions to a state with no matching UI block, or if the executing state's progress message is empty, the drawer body is empty.

**Expected:** The drawer should show an error state with the failure reason and a retry/back button.
**Actual:** Blank drawer with no feedback.

---

### BUG-W009: ETH Gas Warning Appears for Gasless-Eligible Swaps

**Severity:** MEDIUM
**Status:** OPEN (needs investigation)
**Found by:** Manual testing (2026-07-15)
**Related:** Existing behavior

**Description:**
When previewing a swap, a yellow warning appears: "ETH is required on Arbitrum for this swap. Your balance: 0.000000 ETH. The app will try the gasless relay first, then fall back to using your ETH for gas (~0.001 ETH)."

This warning appears even for swaps that should be fully gasless (USDT0 on Arbitrum).

**Impact:** Confusing UX — the warning suggests the user needs ETH, but the gasless relay should handle it. The warning may be technically correct (as a fallback disclosure) but it scares users.

**Needs:** Investigation into whether this warning should be suppressed for gasless-eligible tokens, or if the wording should be less alarming.

---

### BUG-W010: Chain Swap Claim Fails with "Invalid refund address" — Funds Locked in HTLC

**Severity:** CRITICAL
**Status:** OPEN
**Found by:** Manual testing + console log analysis (2026-07-16)
**Related:** wallet-core SDK `ChainSwapService.claimRBTC()`, `EvmContractService.claimFunds()`

**Description:**
When executing an rBTC → USDT on Arbitrum swap (2-hop: Boltz rBTC→tBTC, then Symbiosis tBTC→USDT0), the Boltz chain swap claim fails with `Error: Invalid refund address`. The user's rBTC is locked in Boltz's EtherSwap HTLC contract on RSK but the claim (which would release tBTC on the destination side) fails.

**Error chain from console:**
```
❌ Transaction receipt not found after 10 attempts          (getLockupEventParameters)
⚠️ Lockup event not found, using API values (may fail)      (claimRBTC fallback)
❌ Failed to claim funds: Error: Invalid refund address      (EvmContractService.claimFunds)
❌ Failed to claim RBTC: Error: Failed to claim funds from EtherSwap: Invalid refund address
```

**Root cause analysis:**

1. `getLockupEventParameters()` tries to fetch Boltz's lockup TX receipt from RSK RPC. It retries 10 times with 2-second delays (20 seconds total). RSK blocks are ~30 seconds, and RPC nodes can be slow. After 10 failures, it returns `null`.

2. `claimRBTC()` falls back to Boltz API values: `swapData.refundAddress` and `swapData.claimTimeoutBlockHeight`.

3. `claimFunds()` validates the refund address with `ethers.isAddress()`. The validation fails, meaning `swapData.refundAddress` is either:
   - `undefined` or `null` (field not persisted during swap creation or recovery)
   - Empty string `""`
   - An invalid address format (e.g., wrong chain's address, corrupted during Nostr storage round-trip)

4. The `refundAddress` in the EtherSwap contract is `msg.sender` from when Boltz called `lock()` — it's Boltz's RSK wallet address. The `claim()` function requires this exact address. If the SDK can't provide it, the claim fails.

**Why the field might be missing:**
- `swapData.refundAddress` is set from `swapResponse.claimDetails.refundAddress` during `createChainSwap()`
- If the swap was recovered from Nostr storage (`recoverPendingSwaps()`), the field could be lost during serialization/deserialization
- The Boltz API response might not include `refundAddress` in all cases (needs verification)
- The `BoltzClient.createChainSwap()` does validate the response, but recovery paths may bypass this

**Impact:**
- User's rBTC is locked in the EtherSwap HTLC contract
- The tBTC that Boltz locked is also locked
- Neither side can claim — the swap is stuck
- **The rBTC is NOT lost** — it's recoverable via refund after the RSK timelock expires

**Fund recovery paths:**
1. **Fix the code and retry** — if `refundAddress` can be retrieved from the Boltz API or on-chain, the claim can be retried
2. **Refund after timelock** — call `EtherSwap.refund(preimageHash)` after the RSK timelock expires to recover rBTC. The SDK has `ChainSwapRefundService` and `recoverRefundDataFromChain()` for this
3. **On-chain recovery** — `scanUnclaimedLockups()` can find unclaimed lockups for the user's address and attempt refund

**Fixes needed (wallet-core SDK):**
1. Validate `refundAddress` before passing to `claimFunds()` with a clear error message including the actual value
2. Increase `getLockupEventParameters` retry count (30 retries × 3 seconds = 90 seconds, matching RSK block time)
3. Add a migration/validation step in `recoverPendingSwaps()` that checks for missing `refundAddress`
4. Log the actual `refundAddress` value in error messages for debugging
5. Ensure `refundAddress` is always persisted in Nostr storage during swap creation

---

### BUG-W011: getLockupEventParameters Timeout Too Short for RSK Block Time

**Severity:** HIGH
**Status:** OPEN
**Found by:** Console log analysis (2026-07-16)
**Related:** wallet-core SDK `EvmContractService.getLockupEventParameters()`

**Description:**
`getLockupEventParameters()` retries 10 times with 2-second delays (20 seconds total) to find a transaction receipt. RSK blocks are ~30 seconds, and RPC nodes can take longer to index transactions. The timeout is too short.

**Console evidence:**
```
❌ Transaction receipt not found after 10 attempts
```

**Root cause:**
```typescript
const maxRetries = 10;      // Only 10 retries
const retryDelay = 2000;    // Only 2 seconds per retry
// Total: 20 seconds — less than 1 RSK block time
```

**Impact:**
- When the receipt isn't found, the code falls back to Boltz API values
- If the API values are incomplete (see BUG-W010), the claim fails
- The swap becomes stuck even though the lockup transaction is valid

**Fix:**
```typescript
const maxRetries = 30;      // 30 retries
const retryDelay = 3000;    // 3 seconds per retry
// Total: 90 seconds — covers 3 RSK blocks with margin
```

---

### BUG-W012: Gasless Relay Falls Back to Direct TX for All Arbitrum Swap Transactions

**Severity:** MEDIUM
**Status:** OPEN
**Found by:** Console log analysis (2026-07-16)
**Related:** `src/lib/stores/wallet/wallet-send.ts:106`

**Description:**
During a 2-hop swap (Boltz rBTC→tBTC + Symbiosis tBTC→USDT0), the gasless relay fails for all 3 Arbitrum transactions (ERC-20 approve + swap tx + possible intermediate step), falling back to direct ETH gas each time.

**Console evidence (×3):**
```
[sendArbitrumTransaction] Falling back to direct tx with ETH for gas
```

**Root cause:**
The `sendArbitrumTransaction()` function in `wallet-send.ts` has a two-tier architecture:
1. Gasless path: tries EIP-4337 relay via `sendGaslessCalls()` if `walletReady` is `true` and JWT exists
2. Direct fallback: catches any error and falls through to direct EVM transaction

The most likely cause is `walletReady` is `false` — the EIP-7702 smart account was never initialized. When `walletReady` is false, the gasless block is **silently skipped** (no error logged) and the direct path is always used.

**Impact:**
- User pays ETH for gas on Arbitrum instead of using the gasless relay
- Not a functional failure — the direct path works fine
- But it defeats the purpose of the gasless system

**Fix:** Log why the gasless path was skipped (e.g., `walletReady: false`, no JWT, relay error) so it can be debugged. Currently the only log is the unconditional "Falling back" message.

---

### BUG-W013: Google Maps AdvancedMarker Uses Deprecated 'click' Event

**Severity:** LOW
**Status:** OPEN
**Found by:** Console log analysis (2026-07-16)
**Related:** `src/lib/components/maps/TaskLocationMap.svelte:1445,1600`

**Description:**
The Google Maps JS API now requires `'gmp-click'` instead of `'click'` for `AdvancedMarkerElement` click events. The `TaskLocationMap.svelte` component uses `marker.addListener('click', ...)` in two places.

**Console evidence:**
```
<gmp-advanced-marker>: Please use addEventListener('gmp-click', ...) instead of addEventListener('click', ...).
```

**Locations:**
- Line 1445: `createServiceMarker()` — `marker.addListener('click', ...)`
- Line 1600: `createTaskMarker()` — `marker.addListener('click', ...)`

**Note:** Line 1068 (`map.addListener('click', ...)`) is correct — it's on the map object, not on an `AdvancedMarkerElement`.

**Fix:** Change `'click'` to `'gmp-click'` on lines 1445 and 1600.

---

## BY DESIGN / NOT BUGS

### BYDESIGN-001: MetaMask Extension Internal Warnings

**Console messages:**
```
MaxListenersExceededWarning: Possible EventEmitter memory leak detected
ObjectMultiplex - orphaned data for stream "app-init-liveness"
ObjectMultiplex - orphaned data for stream "background-liveness"
```

**Status:** BYDESIGN — These are MetaMask extension internals, not from the BitTasker app. The MultiChain SDK adds listeners that hit MetaMask's default 10-listener limit. The app cannot suppress these. **Reconfirmed 2026-07-16** — same warnings observed during mainnet testing.

---

### BYDESIGN-002: Boltz Does Not Support Testnet

**Status:** BYDESIGN — Per `wallet-audit.md` v4: "Boltz does NOT support testnet — only mainnet and regtest. This is by design, not a bug." The fix is to map `testnet` → `mainnet` in the Boltz config since they share the same API.

---

### BYDESIGN-003: WebSocket Connection Failures for Relay Connections

**Console messages:**
```
WebSocket connection to '<URL>' failed: WebSocket is closed before the connection is established.
```

**Status:** BYDESIGN — These are NDK Nostr relay connection attempts to unreachable relays. The app handles reconnection gracefully.

---

## CONCEPT EXPLANATIONS (from user feedback)

### What is "Bank"?

The "Bank" is the **BankingMenu** — a modal action hub accessible from the wallet page. It contains: Send, Receive, Buy, Sell, Swap, and DeFi buttons. It's not a separate financial product — it's a UI menu that groups wallet actions.

### What is "Borrow"?

**Borrow** uses Aave V3 on Arbitrum. You supply WBTC as collateral and borrow USDT0 against it. There's a health factor that must stay above the liquidation threshold. The BorrowFlowDrawer (which renders LoanWizardDrawer) manages supply, borrow, repay, withdraw, and close actions.

### What is "Earn"?

**Earn** has two modes:
1. **Lending** — Supply USDT0 to Aave V3 to earn interest (supply APY)
2. **LP** — Provide liquidity to Uniswap V3 WBTC/USDT0 pool to earn trading fees

### What is "Loan" / "Convert"?

**Loan/Convert** is a multi-step pipeline that converts rBTC on RSK into USDT0 on Arbitrum:
1. rBTC → DOC (Money on Chain minting on RSK)
2. DOC → USDT0 (Sovryn DEX swap on RSK)
3. USDT0 on RSK → USDT0 on Arbitrum (LayerZero bridge)

This is NOT lending — it's a cross-chain asset conversion. The name "Loan" comes from the MoC mechanism where you lock rBTC as collateral to mint DOC (similar to MakerDAO's DAI).

### How do they relate?

The **Convert** flow is the on-ramp that brings USDT0 onto Arbitrum. Once you have USDT0 on Arbitrum, you can:
- **Earn** by supplying it to Aave (lending) or Uniswap (LP)
- **Borrow** by using WBTC as collateral to get more USDT0

---

## TESTING NOTES

### What Works Without Real Funds

| Feature | Needs Real Funds? | Notes |
|---------|-------------------|-------|
| Balance display | No | Shows 0 but UI loads correctly |
| Swap form UI | No | Can open, select pairs, see routes |
| Swap route resolution | Partially | Boltz routes need mainnet API; LI.FI may fail with dummy address |
| Gasless send form | No | Can fill form, see fee estimation UI |
| Borrow/Earn UI | No | Drawers open, show empty positions |
| Loan flow UI | No | Drawer opens, shows input form |
| Connected wallet UI | No | Tab visible, connect button works |
| Transaction history | No | Tab loads, shows empty state |

### What Needs Real Funds or Working Fork

| Feature | Requirement |
|---------|-------------|
| Actual swap execution | Working Boltz API + funded RSK wallet |
| Gasless send execution | Alto bundler + paymaster + funded Arbitrum wallet |
| Borrow/Earn execution | Funded Arbitrum wallet with WBTC/USDT0 |
| Loan flow execution | Funded RSK wallet with rBTC + MoC/Sovryn/LayerZero contracts |
| Balance display with values | Working Hardhat fork (archive RPC) or real testnet tokens |

### Getting Testnet Assets

| Asset | Network | How to Get |
|-------|---------|------------|
| RBTC | RSK testnet | https://faucet.rootstock.io |
| USDT0 on RSK | RSK testnet | No public faucet — need to swap or deploy mock |
| DOC | RSK testnet | Mint via MoC protocol (needs RBTC collateral) |
| USDT0/WBTC/tBTC on Arbitrum | Local Hardhat fork | Need archive RPC for fork, or deploy mock contracts |
| ETH on Hardhat | Local fork | Comes free with Hardhat (10,000 ETH per account) |

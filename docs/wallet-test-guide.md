# Wallet Testing Guide

> How to test all wallet features in a local regtest environment.
> Covers: balance display, gasless sends, swaps, DeFi, loan flow, fiat on/off-ramp, connected external wallets.

---

## Prerequisites

Before testing any wallet feature, ensure all local services are running:

```bash
# Terminal 1: Infrastructure (Postgres + Redis)
cd /Users/doma/Projects/bittasker/bittasker-nestjs
docker-compose -f docker-compose.devtest.yml up -d

# Terminal 2: Hardhat Arbitrum fork
cd /Users/doma/Projects/bittasker/meta-tx-relay/contracts
npx hardhat node --fork https://arb1.arbitrum.io/rpc

# Terminal 3: Deploy paymaster (one-time per Hardhat restart)
npx hardhat run scripts/deploy.js --network localhost
# Copy deployed address → update PAYMASTER_ADDRESS in bittasker-nestjs/.env

# Terminal 4: NestJS backend
cd /Users/doma/Projects/bittasker/bittasker-nestjs
npm run start:dev

# Terminal 5: Frontend
cd /Users/doma/Projects/bittasker/BitTasker-V2
npm run dev:dev
```

### Seed Authentication (Optional)

```bash
cd /Users/doma/Projects/bittasker/BitTasker-V2
npm run test:e2e:seed
```

This creates passkey credentials and saves auth state for e2e testing.

### MetaMask Setup (Only for Connected Wallet Tests)

MetaMask is only needed for the "Connected External Wallet" tests below. All other wallet features use the built-in wallet and do not require MetaMask.

1. Add custom network:
   - Network Name: `Local Arbitrum`
   - RPC URL: `http://127.0.0.1:8545`
   - Chain ID: `31337`
   - Currency: `ETH`

2. Import Hardhat Account #0 (has 10,000 ETH):
   - Private Key: `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`
   - Address: `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`

---

## How to Test: Wallet Balance Display

**What it tests:** Multi-chain balance loading, USDT0/DOC/WBTC/tBTC display, USD value calculation.

**Requires:** Built-in wallet only (no MetaMask).

**Steps:**
1. Login to the app
2. Navigate to `/wallet`
3. Verify the balance card shows total portfolio value
4. Expand the USD accordion
5. Verify these rows appear:
   - USDT0 on Arbitrum with balance and USD value
   - USDT0 on RGB with balance (if you have any)
   - DOC on RGB with balance (if you have any)
   - tBTC on Arbitrum with balance
   - WBTC on Arbitrum with balance

**What to look for:**
- Balances should be non-zero if Hardhat fork is running and you have test tokens
- USD values should be calculated correctly (not $0.00)
- Network labels should show "Arbitrum" for Arbitrum tokens (not "RGB" or "BSC")

**E2E test:** `tests/e2e/wallet/usdt-implementation.spec.ts` — "USDT Balance Display" suite

---

## How to Test: Gasless Send (ERC-4337 + EIP-7702)

**What it tests:** Gasless token sends on Arbitrum — USDT0, WBTC, tBTC. Fee estimation, fee tier display, pending/success screen amounts.

**Requires:** Built-in wallet only (no MetaMask). Alto bundler running for real gasless flow; without it, falls back to direct ETH transfer.

### Send USDT0 (6-decimal)

1. Navigate to `/wallet` → tap "Send"
2. Select USDT0 as the token
3. Enter a recipient address (use another Hardhat account: `0x70997970C51812dc3A010C7d01b50e0d17dc79C8`)
4. Enter an amount (e.g., `10`)
5. Tap "Estimate Fee"
6. Verify the confirmation dialog shows:
   - Network fee in USDT (not ETH) — should be ~$0.01-$0.05
   - Fee tier badge (Low / Medium / High / Very High)
7. Confirm the transaction
8. Verify pending screen shows the actual amount (not $0.00)
9. Verify success screen shows the amount and tx hash

### Send WBTC (8-decimal)

1. Select WBTC as the token
2. Enter recipient and amount (e.g., `0.001`)
3. Verify fee buffer uses 8-decimal satoshi math (not 18-decimal)

### Send tBTC (18-decimal)

1. Select tBTC as the token
2. Enter recipient and amount (e.g., `0.5`)
3. Verify standard 18-decimal flow works correctly

**What to look for:**
- Fee should be in the sent token (USDT, WBTC, tBTC), not ETH
- Fee tier badge should match the gas estimate
- Pending/success screens should show the actual amount, not $0.00
- Transaction should appear in transaction history

**E2E tests:**
- `tests/e2e/wallet/gasless-send.spec.ts` — full send flow for all three tokens
- `tests/e2e/wallet/usdt-implementation.spec.ts` — "Gasless Send Amount Display" suite

---

## How to Test: Gasless Fee Estimation Tiers

**What it tests:** Fee tier thresholds, gas-to-USD mapping, rejection boundary.

**Requires:** Built-in wallet only (no MetaMask).

**Steps:**
1. Navigate to `/wallet` → tap "Send"
2. Enter a recipient address
3. Test each fee tier by entering different amounts:
   - **Low** (< 200K gas): small amount like `10` → should show `$0.01` fee, "Low" badge
   - **Medium** (200K-500K): medium amount like `50` → should show `$0.03` fee, "Medium" badge
   - **High** (500K-1M): larger amount like `100` → should show `$0.05` fee, "High" badge
   - **Very High** (1M-5M): large amount like `200` → should show `$0.10` fee, "Very High" badge
   - **Rejection** (> 5M gas): very large amount like `500` → should show "Network fee too high" error
4. Tap "Estimate Fee" for each
5. Verify the fee tier badge and cost display in the confirmation dialog

**What to look for:**
- Fee tier badge matches the gas estimate range
- Dollar amount matches the tier definition
- Rejection tier shows an error with a retry button
- Network fee section is visible in the confirmation dialog

**E2E test:** `tests/e2e/wallet/gasless-fee-estimation.spec.ts`

---

## How to Test: Gasless Error States

**What it tests:** Error handling, retry mechanisms, validation errors for gasless sends.

**Requires:** Built-in wallet only (no MetaMask).

**Steps:**
1. Navigate to `/wallet` → tap "Send"
2. Test each error scenario:

   **Bundler unavailable (503):**
   - Enter recipient and amount, tap "Estimate Fee"
   - Should show error alert with "unavailable" or "temporarily" message
   - Should show a "Retry" button
   - Clicking retry should re-trigger the estimate

   **Fee tier mismatch (409):**
   - Should show "Fee tier mismatch" or "gas conditions changed" error
   - Should show a "Re-estimate" button

   **Invalid address:**
   - Enter `not-a-valid-address` as recipient
   - Should show "invalid address" validation error

   **Network timeout:**
   - Should show error alert after timeout
   - Should show a "Retry" button

**E2E test:** `tests/e2e/wallet/gasless-error-states.spec.ts`

---

## How to Test: Send USDT0 on RGB

**What it tests:** RGB USDT0 send handler registration.

**Requires:** Built-in wallet only (no MetaMask). USDT0 deployed on your RGB regtest node.

**Steps:**
1. Navigate to `/wallet` → tap "Send"
2. Select USDT0 on RGB as the asset
3. Enter recipient and amount
4. Confirm the transaction

**What to look for:**
- The send handler should be registered (`usdt0-rgb` is in `SUPPORTED_NETWORKS`)
- If USDT0 on RGB is not available, the option may not appear

**E2E test:** `tests/e2e/wallet/usdt-implementation.spec.ts` — "Send USDT0 RGB Handler" suite

---

## How to Test: Swap Form — Multi-Provider Routes

**What it tests:** Route engine with multiple providers, route ranking, fee validation, minimum amounts.

**Requires:** Built-in wallet only (no MetaMask).

**Steps:**
1. Navigate to `/wallet` → tap "Swap"
2. Test these pairs:
   - BTC → USDT0-Arb (expect RGB two-hop, LI.FI, possibly Changelly)
   - USDT0-Arb → BTC (reverse)
   - USDT0-Arb → WBTC-Arb (same-chain Uniswap V3)
   - DOC-RGB → USDT0-RGB (OpenOcean or Sovryn DEX)
3. Verify route picker shows estimated amounts and fees for each route
4. Verify routes are ranked by cost (cheapest first)
5. Verify OpenOcean routes appear for RGB DOC↔USDT0 pairs
6. Enter a very small amount (e.g., `0.01`) — should show minimum warning and disable preview
7. Verify fee percentage is reasonable (< 10% of total)
8. Verify estimated time is displayed

**What to look for:**
- Multiple routes appear for common pairs
- Routes are ranked by total cost
- OpenOcean routes appear for RGB stablecoin swaps
- Uniswap V3 routes appear for Arbitrum same-chain swaps
- Below-minimum amounts show a warning and disable the Swap Preview button
- Fee, receive amount, and estimated time are all populated

**E2E tests:**
- `tests/e2e/wallet/live-swap-e2e.spec.ts` — route resolution, minimum amounts, preview button
- `tests/e2e/wallet/swap-routes-e2e.spec.ts` — full route coverage, fee comparison, provider API calls

---

## How to Test: Changelly Swaps

**What it tests:** Changelly swap provider in route engine, quote display, swap execution.

**Requires:** Built-in wallet only (no MetaMask). Changelly API keys provisioned (`CHANGELLY_API_KEY` and `CHANGELLY_API_SECRET` in NestJS `.env`).

**Steps:**
1. Navigate to `/wallet` → tap "Swap"
2. Select source: BTC on-chain
3. Select destination: USDT0 on Arbitrum
4. Verify route picker loads and shows multiple providers
5. Select a Changelly route (if available)
6. Verify quote shows estimated output, fees, and timing (5-40 min)
7. Confirm the swap

**Without API keys:** No Changelly routes will appear. The route engine will still show RGB and LI.FI routes.

**Verify backend is ready:**
```bash
curl http://localhost:8000/api/v1/changelly/swap/currencies \
  -H "Content-Type: application/json" -d '{}'
# Should return currencies list if API keys are configured
```

**What to look for:**
- Changelly routes appear alongside RGB and LI.FI routes
- Quote shows correct estimated output and fees
- Swap progress updates correctly

---

## How to Test: Changelly Fiat (Buy/Sell)

**What it tests:** Fiat on-ramp/off-ramp via Changelly Fiat API.

**Requires:** Built-in wallet only (no MetaMask). Changelly Fiat API keys (RSA-SHA256 signed).

**Steps:**
1. Navigate to `/wallet` → "Buy/Sell" tab (or BankingMenu → Buy)
2. Select a fiat currency (USD/EUR) and crypto asset (USDT)
3. Verify offers load from Changelly providers (MoonPay, Banxa, etc.)
4. Review the offers (amount, fees, provider)

**Note:** Completing a real purchase requires a payment method. You can test up to offer selection.

**Verify backend is ready:**
```bash
curl http://localhost:8000/api/v1/changelly/fiat/providers
# Should return provider list
```

---

## How to Test: Loan Flow (BTC → DOC → USDT0 → Arbitrum)

**What it tests:** Full loan flow orchestrator, MoC minting, DEX swap, LayerZero bridge.

**Requires:** Built-in wallet only (no MetaMask). `VITE_LOAN_FLOW_ENABLED=true` in `.env.development`.

**Steps:**
1. Navigate to `/wallet`
2. In the DeFi section, click "Convert" button
3. Verify LoanFlowDrawer opens with title "Convert BTC → USDT0"
4. Enter an BTC amount (e.g., `0.001`)
5. Click "Get Quote"
6. Verify quote shows:
   - Estimated USDT0 output on Arbitrum
   - Bridge fee estimate
   - Flow steps (MoC Mint → DEX Swap → Bridge → Complete)
7. Click "Confirm"
8. Verify progress screen shows 4 steps with checkmarks/spinners

**On regtest:** The MoC and Sovryn DEX contracts need to be mocked or deployed. The bridge requires LayerZero endpoints. Without these, the flow will fail at the first step — but you can verify the UI states work correctly.

**What to look for:**
- Drawer opens and shows input field for BTC amount
- Quote loads and shows estimated output
- Progress screen shows step-by-step execution
- Error states display correctly when contracts are unavailable
- Success screen shows tx hashes when flow completes

**E2E test:** `tests/e2e/wallet/usdt-implementation.spec.ts` — "Loan Flow Drawer" suite

---

## How to Test: Aave V3 DeFi (Borrow/Earn)

**What it tests:** Aave V3 lending/borrowing on Arbitrum.

**Requires:** Built-in wallet only (no MetaMask). Arbitrum fork running (Hardhat), `VITE_LOAN_FLOW_ENABLED=true`.

**Steps:**
1. Navigate to `/wallet` → DeFi section
2. Click "Borrow" or "Earn" button
3. Verify BorrowFlowDrawer or EarnFlowDrawer opens

**Earn flow:**
1. Select supply asset (e.g., USDT0 on Arbitrum)
2. Enter an amount to supply
3. Verify Supply APY is displayed
4. Confirm the transaction
5. Verify your position appears in the DeFi positions section

**Borrow flow:**
1. If you have a supply position, try borrowing against it
2. Verify the Health Factor gauge updates
3. Verify the borrow rate is displayed
4. Confirm the transaction

**What to look for:**
- Supply/borrow rates are displayed correctly
- Health Factor gauge updates in real-time
- Repay and withdraw actions work

---

## How to Test: Transaction History

**What it tests:** Transaction display, explorer links, status updates.

**Requires:** Built-in wallet only (no MetaMask).

**Steps:**
1. After completing any USDT transaction (send, swap, or DeFi action)
2. Navigate to the "Transactions" tab
3. Verify transaction appears with:
   - Correct amount and token
   - Status (pending/confirmed/failed)
   - From/to addresses
   - Transaction hash (clickable link to explorer)

**On regtest:** Explorer links won't resolve, but transaction data should still display correctly.

---

## How to Test: Connected External Wallet (MetaMask)

**What it tests:** MetaMask connection flow, connected wallet balance display, USDT0 decimal handling for external wallets.

**Requires:** MetaMask extension installed and configured (see MetaMask Setup above). This is the only test section that requires an external wallet.

### MetaMask Connection UX

1. Navigate to `/wallet` → "Connected" tab
2. Click "Connect Wallet" → select MetaMask
3. Approve connection in MetaMask popup (appears in browser extension area, top-right)
4. Verify connected wallet appears in the Connected Wallets section

**Known UX issue:** The MetaMask popup appears in the browser extension area (top-right corner), not as a modal in the main window. Users may not know to look there. The connect modal closes immediately when clicked, leaving no visual feedback during SDK initialization (1-3 seconds).

**E2E test:** `tests/e2e/wallet/metamask-connection-ux.spec.ts` — "MetaMask Connection UX" suite

### Connected Wallet Balances

1. After connecting MetaMask, verify the Connected tab shows balances
2. Verify USDT0-Arbitrum balance shows correctly (6 decimals, not ~$0)
3. Verify BTC/BTC balances show correctly
4. Verify balance matches what MetaMask shows

**What to look for:**
- USDT0 balance should be correct (not ~$0.00) — this was Bug 5.5
- If balance shows ~$0.00, the decimal fix may not be applied

**E2E test:** `tests/e2e/wallet/metamask-balance-e2e.spec.ts` — MetaMask balance verification

### Connected Wallet Visual Test

1. Navigate to `/wallet` → "Connected" tab
2. Verify the tab is visible (feature flag `isConnectedWalletsEnabled` must be on)
3. Click "Connect" button → verify modal opens with wallet options
4. Click MetaMask → verify result state is captured

**E2E test:** `tests/e2e/wallet/connected-wallets.spec.ts` — visual connection flow

---

## Testing Priority Order

| Priority | Feature | Requires MetaMask | Why |
|----------|---------|-------------------|-----|
| 1 | Balance display | No | Quickest validation — confirms wallet init works |
| 2 | Gasless send (USDT0) | No | Core USDT functionality |
| 3 | Gasless fee estimation | No | Fee tier accuracy |
| 4 | Gasless error states | No | Error handling robustness |
| 5 | Swap routes | No | Swap infrastructure |
| 6 | Changelly swap routes | No | Swap provider integration |
| 7 | Aave V3 DeFi | No | DeFi integration |
| 8 | Loan flow UI | No | New feature verification |
| 9 | Changelly fiat | No | Fiat on-ramp |
| 10 | Transaction history | No | Post-action verification |
| 11 | Connected wallet (MetaMask) | Yes | External wallet integration |
| 12 | MetaMask balance display | Yes | Decimal fix verification |

---

## Running E2E Tests

```bash
# Run all wallet e2e tests
cd /Users/doma/Projects/bittasker/BitTasker-V2
npx playwright test tests/e2e/wallet/ --project=chromium

# Run specific test suites
npx playwright test tests/e2e/wallet/usdt-implementation.spec.ts --project=chromium
npx playwright test tests/e2e/wallet/gasless-send.spec.ts --project=chromium
npx playwright test tests/e2e/wallet/gasless-fee-estimation.spec.ts --project=chromium
npx playwright test tests/e2e/wallet/gasless-error-states.spec.ts --project=chromium
npx playwright test tests/e2e/wallet/live-swap-e2e.spec.ts --project=chromium
npx playwright test tests/e2e/wallet/swap-routes-e2e.spec.ts --project=chromium
npx playwright test tests/e2e/wallet/metamask-connection-ux.spec.ts --project=chromium
npx playwright test tests/e2e/wallet/metamask-balance-e2e.spec.ts --project=chromium
npx playwright test tests/e2e/wallet/connected-wallets.spec.ts --project=chromium
npx playwright test tests/e2e/wallet/check-flags.spec.ts --project=chromium

# Run with UI mode (interactive)
npx playwright test tests/e2e/wallet/ --project=chromium --ui

# Run cross-browser
npx playwright test tests/e2e/wallet/ --project=chromium --project=firefox --project=webkit
```

---

## Troubleshooting

### Balances show $0.00
- Check that Hardhat fork is running (`http://127.0.0.1:8545`)
- Check that the frontend `.env.development` has `VITE_ARBITRUM_RPC_URL=http://127.0.0.1:8545`
- Price APIs may be slow — wait 30 seconds for the next refresh cycle

### Gasless send fails
- Check Alto bundler is running (`http://localhost:4000`)
- Check paymaster is deployed and funded
- Check NestJS backend is running (`http://localhost:8000`)
- Without Alto, the frontend falls back to direct ETH transfer

### Loan flow fails at first step
- MoC contracts need to be mocked on regtest
- Sovryn DEX router needs liquidity pools
- LayerZero endpoints need to be configured

### Changelly routes don't appear
- Check `CHANGELLY_API_KEY` and `CHANGELLY_API_SECRET` are set in NestJS `.env`
- Check `VITE_CHANGELLY_ENABLED=true` in frontend `.env.development`
- Changelly API may be Cloudflare-blocked from your IP

### MetaMask connection times out
- Check MetaMask extension is installed and unlocked
- The popup appears in the browser extension area (top-right), not in the main window
- If first click doesn't work, try clicking again after 5 seconds

### Connected wallet shows ~$0.00 for USDT0
- This was Bug 5.5 — USDT0 uses 6 decimals, not 18
- Verify `use-swap-wallets.svelte.ts` divides by 1e6 not 1e18
- Verify `gasless.config.ts` has `decimals: 6` for USDT0

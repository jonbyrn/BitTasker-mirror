# Wallet Manual QA Checklist

> Last updated: 2026-07-29
> Tester: _______________
> Date: _______________

---

## Pre-Test Setup

- [ ] Dev server running at `localhost:5173` (or `dev.bittasker.com`)
- [ ] Test wallet has RBTC balance on RSK (>0.001 RBTC)
- [ ] Test wallet has USDT0 balance on Arbitrum (>$1)
- [ ] Test wallet has ETH on Arbitrum (>0.001 ETH) for gasless relay
- [ ] Browser DevTools open (Console tab) — watch for errors throughout

---

## 1. Send Flow — RBTC (RSK)

Covers: BUG-001, BUG-002, BUG-004, MED-004, MED-007

### 1.1 Basic Send

- [ ] Open wallet → click **Send**
- [ ] Select RBTC as source
- [ ] Enter amount (e.g., 1000 sats)
- [ ] Enter recipient address
- [ ] Click **Send** → verify confirmation dialog appears
- [ ] Verify confirmation shows: **amount**, **recipient**, **network**, **fee estimate**
- [ ] Click **Send** in confirmation dialog
- [ ] **VERIFY:** Send button shows loading state (spinner/disabled) — *relates to BUG-004*
- [ ] **VERIFY:** Form is not editable during send
- [ ] **VERIFY:** Success screen appears with tx hash and explorer link — *relates to BUG-001*
- [ ] **VERIFY:** "Done" button is visible
- [ ] Click **Done**
- [ ] **VERIFY:** Modal closes
- [ ] **VERIFY:** Toast notification is visible on wallet page (NOT behind modal) — *relates to BUG-002*

### 1.2 Max Button

- [ ] Click **MAX** button
- [ ] **VERIFY:** Amount fills with balance minus gas reserve (~975 sats reserved)
- [ ] **VERIFY:** Balance display shows the correct amount
- [ ] Click Send → verify fee estimate appears
- [ ] **VERIFY:** "You receive" amount is less than "Total sent" (fee deducted)

### 1.3 Insufficient Balance

- [ ] Enter amount larger than balance
- [ ] **VERIFY:** "Insufficient balance" error appears — *relates to MED-007*
- [ ] **VERIFY:** Send button is disabled

### 1.4 Error Handling

- [ ] Enter invalid recipient address (e.g., `not-an-address`, `0x123`)
- [ ] **VERIFY:** Address validation error appears
- [ ] **VERIFY:** Send button is disabled

### 1.5 QR Scan Confirmation Path

- [ ] Scan a payment QR code (if available)
- [ ] Verify confirmation screen shows: amount, recipient, network
- [ ] **VERIFY:** Fee estimate is displayed — *relates to MED-004*
- [ ] Complete send → verify success flow works

---

## 2. Send Flow — USDT0 on Arbitrum (Gasless)

Covers: BUG-001, BUG-002, UX-001, UX-002, UX-003, MED-001, MED-002, MED-003

### 2.1 Basic Send

- [ ] Open wallet → click **Send**
- [ ] Select USDT0 (Arbitrum) as source
- [ ] **VERIFY:** GaslessSendFlow renders (different UI from standard form) — *relates to UX-003*
- [ ] **VERIFY:** USDT0 balance is displayed — *relates to UX-003*
- [ ] Enter amount
- [ ] Enter recipient address
- [ ] Click **Estimate Fee**
- [ ] **VERIFY:** Fee estimate appears
- [ ] Click **Send**
- [ ] **VERIFY:** Loading state shown
- [ ] **VERIFY:** Success screen appears (TransactionSuccessScreen) — *relates to BUG-001*
- [ ] **VERIFY:** Success screen shows tx hash
- [ ] Click **Done** → verify modal closes

### 2.2 Max Button

- [ ] Click **MAX** button — *relates to UX-001*
- [ ] **VERIFY:** Amount fills with balance minus fee buffer
- [ ] Verify fee estimate updates after MAX fills amount

### 2.3 Address Validation

- [ ] Enter invalid address (e.g., `not-an-address`) — *relates to UX-002*
- [ ] **VERIFY:** Error message shown (inline validation)
- [ ] **VERIFY:** "Estimate Fee" button is disabled
- [ ] Enter valid `0x...` address
- [ ] **VERIFY:** "Estimate Fee" button is enabled

### 2.4 Amount Input Validation

- [ ] Enter negative number (e.g., `-5`) — *relates to MED-002*
- [ ] **VERIFY:** Rejected or shows error
- [ ] Enter scientific notation (e.g., `1e10`)
- [ ] **VERIFY:** Rejected or shows error
- [ ] Enter `0`
- [ ] **VERIFY:** Send button is disabled

### 2.5 Relay Failure Handling

- [ ] Simulate relay failure (disconnect from Alto bundler or use invalid URL)
- [ ] Try to send
- [ ] **VERIFY:** Error message is clear and actionable — *relates to MED-003*
- [ ] If wallet has no ETH on Arbitrum, **VERIFY:** message says "You need ETH on Arbitrum" or similar guidance
- [ ] **VERIFY:** "Retry" button is available

### 2.6 Error Message i18n

- [ ] Trigger each error condition (insufficient balance, fee estimation failure, etc.)
- [ ] **VERIFY:** Error messages are translated (not hardcoded English) — *relates to MED-001*
- [ ] If not translated, note which strings are still hardcoded

---

## 3. Send Flow — Swap Chain (RBTC → USDT0)

Covers: BUG-003, BUG-002

### 3.1 Multi-Hop Swap

- [ ] Select RBTC as source, USDT0 (Arbitrum) as destination
- [ ] Enter amount
- [ ] **VERIFY:** Fee breakdown shows: amount, fee (sats + USD), and "You Receive" — *relates to MED-008*
- [ ] Click **Send** → Confirm
- [ ] **VERIFY:** Modal shows progress indication (not blank form) — *relates to BUG-003*
- [ ] **VERIFY:** User can see that a swap is in progress
- [ ] **VERIFY:** Toast or notification confirms swap started (visible, not hidden behind modal) — *relates to BUG-002*

### 3.2 Swap Form Fee Display

- [ ] Select RBTC → USDT0 (Arbitrum) route
- [ ] Enter amount
- [ ] **VERIFY:** "Total Sent" shows the actual swap amount (not double-subtracted)
- [ ] **VERIFY:** "Fee" shows sats + USD equivalent
- [ ] **VERIFY:** "You Receive" shows the estimated output
- [ ] **VERIFY:** Gasless fee reserve notice shows correct amounts — *relates to MED-008*

### 3.3 RSK Gas Reserve

- [ ] Click **MAX** with RBTC source
- [ ] **VERIFY:** Max amount is less than full balance (gas reserved)
- [ ] **VERIFY:** Remaining balance covers swap + gas
- [ ] **VERIFY:** No "insufficient RBTC for gas" error on confirmation

---

## 4. Receive Flow — USDT0 on Arbitrum

Covers: GAP-004, MED-006

### 4.1 Basic Receive

- [ ] Open wallet → click **Receive**
- [ ] Select USDT0 (Arbitrum) tab
- [ ] **VERIFY:** Address is displayed (same as RSK address — `0x...` format)
- [ ] **VERIFY:** QR code is shown
- [ ] **VERIFY:** Copy button works (copies address to clipboard)
- [ ] **VERIFY:** Address is a valid EVM address (`0x...`)

### 4.2 RSK Receive QR

- [ ] Select RSK/RBTC receive tab
- [ ] **VERIFY:** QR code is shown
- [ ] **VERIFY:** Address is displayed and copyable — *relates to MED-006*
- [ ] If QR uses `rsk:` URI, note this may not be recognized by generic Ethereum wallets

### 4.3 Multi-Network Payer Sources

- [ ] Select **Avalanche** as payer source — *relates to GAP-004*
- [ ] **VERIFY:** Fee estimate shows cross-chain fee
- [ ] Select **Base** as payer source
- [ ] **VERIFY:** Fee estimate shows cross-chain fee
- [ ] Select **Ethereum** as payer source
- [ ] **VERIFY:** Fee estimate shows cross-chain fee

---

## 5. Edge Cases

### 5.1 Zero Amount

- [ ] Enter `0` as amount in send form
- [ ] **VERIFY:** Send button is disabled
- [ ] **VERIFY:** No crash or console error

### 5.2 Network Disconnection

- [ ] Disconnect network (DevTools → Network → Offline)
- [ ] Try to send
- [ ] **VERIFY:** Error message about being offline or connection failure
- [ ] Reconnect → verify recovery (form remains usable)

### 5.3 Modal Dismissal During Send

- [ ] Start a send (after clicking confirm)
- [ ] Try to close the modal (click outside or press Escape)
- [ ] **VERIFY:** Modal cannot be closed during send (or warns about pending tx)

### 5.4 Browser Back Button

- [ ] Open send modal → press browser Back button
- [ ] **VERIFY:** Modal closes gracefully, no crash

### 5.5 Rapid Double-Click

- [ ] Double-click the Send button quickly
- [ ] **VERIFY:** Only one transaction is submitted (no duplicate sends)

---

## 6. Console Error Audit

Run through all flows above with DevTools Console open. Note any errors:

| Flow | Console Errors? | Details |
|------|----------------|---------|
| RBTC Send | | |
| USDT0 Gasless Send | | |
| Swap Chain Send | | |
| Receive Flow | | |
| Fee Estimation | | |

---

## Sign-Off

| # | Test | Pass | Fail | Notes |
|---|------|------|------|-------|
| 1.1 | Basic Send (RBTC) | | | |
| 1.2 | Max Button (RBTC) | | | |
| 1.3 | Insufficient Balance | | | |
| 1.4 | Error Handling (RBTC) | | | |
| 1.5 | QR Scan Confirmation | | | |
| 2.1 | Basic Send (Gasless) | | | |
| 2.2 | Max Button (Gasless) | | | |
| 2.3 | Address Validation (Gasless) | | | |
| 2.4 | Amount Input Validation | | | |
| 2.5 | Relay Failure | | | |
| 2.6 | Error Message i18n | | | |
| 3.1 | Multi-Hop Swap | | | |
| 3.2 | Swap Form Fee Display | | | |
| 3.3 | RSK Gas Reserve | | | |
| 4.1 | Basic Receive | | | |
| 4.2 | RSK Receive QR | | | |
| 4.3 | Multi-Network Payer | | | |
| 5.1 | Zero Amount | | | |
| 5.2 | Network Disconnection | | | |
| 5.3 | Modal Dismissal During Send | | | |
| 5.4 | Browser Back Button | | | |
| 5.5 | Rapid Double-Click | | | |

**Total Passed:** _____ / 22
**Total Failed:** _____ / 22
**Blocked:** _____ / 22

**Tester Signature:** _______________ **Date:** _______________
**Reviewed By:** _______________ **Date:** _______________

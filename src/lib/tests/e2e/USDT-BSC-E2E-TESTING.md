# USDT-BSC Payment Flows - E2E Testing Guide

## Overview

This document describes the end-to-end test suite for USDT on BSC payment flows in BitTasker. The test file `usdt-bsc-payments.e2e.test.ts` implements 8 comprehensive scenarios covering complete user journeys for USDT-BSC payments.

## Test Scenarios

### 1. Task Creation → Bid → Acceptance Flow

**Objective**: Verify that payment network context (USDT on BSC) persists through entire task lifecycle.

**Steps**:
1. User 1 creates a task with budget specified in USDT on BSC testnet
2. Network badge displays "BSC Testnet" on task
3. User 2 views task and sees same network context
4. User 2 places a bid in USDT with network context
5. User 1 accepts bid
6. Escrow contract created with correct payment metadata

**Verifications**:
- Task creation stores network metadata (chain 97, USDT token)
- Bid preserves network context
- Escrow displays amount in USDT (not sats or wei)
- Network badge shows "BSC Testnet" throughout

**Files Modified**: TaskCard, BidForm, ContractCard, Escrow store

---

### 2. Send USDT Payment Flow

**Objective**: Test complete payment submission from form to pending confirmation.

**Steps**:
1. Navigate to send payment form
2. Select USDT on BSC Testnet
3. Enter valid recipient address (0xAbc...xyz format)
4. Enter amount (12.345678 USDT with 6 decimals)
5. Review payment details
6. Authenticate and confirm
7. Transaction enters pending state

**Verifications**:
- Network icon shows BSC
- Address validation accepts valid BSC addresses
- Amount displays in USDT (6 decimals)
- Network fee shows in USDT (not BNB)
- Review screen confirms recipient, amount, and network
- Transaction hash generated
- Amount shown correctly in USDT units in pending screen

**Critical Data Points**:
- Test amount: 12.345678 USDT
- Decimals: 6 (stored as 12345678 in atomic units)
- Network: BSC Testnet (Chain ID 97)
- Fee: Fixed USDT amount, not BNB

---

### 3. Receive USDT Payment Request

**Objective**: Verify payment request generation with correct network qualification.

**Steps**:
1. Navigate to receive payment
2. Select USDT on BSC
3. Enter amount to request (1.234567 USDT)
4. Generate payment request
5. Display shows address and amount
6. QR code generated
7. Copy URI button works

**Verifications**:
- URI has `bsc:` scheme OR `ethereum:...@97` format
- URI contains valid 0x address
- Address in URI matches displayed address
- Amount in URI matches requested amount
- QR code scannable
- Share button available
- Copied text matches displayed URI exactly

**Expected URI Formats**:
```
bsc://0x1234567890123456789012345678901234567890?amount=1.234567
ethereum:0x1234567890123456789012345678901234567890@97?amount=1234567
```

---

### 4. Ambiguous Address Handling

**Objective**: Verify system handles raw 0x addresses without network qualifier by showing disambiguation UI.

**Steps**:
1. Navigate to send payment
2. Enter address without network qualifier (e.g., 0x9876...)
3. Disambiguation dialog appears
4. User selects BSC from options
5. Form updates with selected network
6. Payment proceeds with correct network

**Verifications**:
- Disambiguation UI appears automatically
- Both BSC and RSK options visible
- Selection persists in form
- Review screen shows selected network
- Payment routed to correct chain

---

### 5. Wrong Chain Detection

**Objective**: Prevent accidental transactions on wrong chain with clear error messaging.

**Scenario**: User wallet connected to RSK testnet, but tries to send USDT on BSC.

**Steps**:
1. Wallet connected to Chain 31 (RSK Testnet)
2. User navigates to send USDT on BSC
3. User fills payment details
4. User clicks review/confirm
5. Preflight check detects chain mismatch
6. Error message displayed
7. "Switch Network" button available
8. Confirm button disabled
9. After switching chain, error clears

**Verifications**:
- Error message contains "chain", "switch", "network"
- Shows current connected chain and required chain
- Switch network button is functional
- Cannot proceed until chain fixed
- Error clears after correct chain connected

**Error Message Examples**:
- "Wrong chain selected. You're connected to RSK Testnet but this payment requires BSC Testnet."
- "Please switch to BSC Testnet to continue."

---

### 6. Insufficient Balance Handling

**Objective**: Validate amount input and prevent sending more than available.

**Setup**: User has 5 USDT balance

**Steps**:
1. Open send payment form
2. Display shows available balance: 5.000000 USDT
3. User enters amount: 100 USDT
4. Validation error appears
5. Error shows available balance
6. Review button disabled
7. User corrects amount to 4.5 USDT
8. Error clears, review button enabled

**Verifications**:
- Balance display accurate
- Validation happens on input
- Error message clear and actionable
- Error shows correct available amount
- Max button fills with correct maximum
- Maximum respects gas fee

---

### 7. Sponsor Unavailability Handling

**Objective**: Gracefully handle sponsor service temporary unavailability.

**Setup**: Sponsor service returns error

**Steps**:
1. User fills payment details
2. User clicks review/confirm
3. Preflight check detects sponsor unavailable
4. Error message displayed
5. Retry button available
6. Confirm button disabled
7. After sponsor recovers
8. Retry succeeds

**Verifications**:
- Error message clear ("Sponsor service temporarily unavailable")
- Suggests action ("Please try again")
- Retry button functional
- Cannot proceed without working sponsor
- Error recoverable

**Sponsor Status Check**:
```typescript
// Preflight checks should verify:
- Sponsor address has sufficient balance
- Sponsor contract is functional
- Network RPC is responsive
```

---

### 8. Transaction History Integration

**Objective**: Verify transactions display correctly in history with proper network identification.

**Scenarios**:

#### 8a. Single Transaction Display
1. User sends USDT on BSC
2. Navigate to transaction history
3. Transaction appears at top
4. Amount: 12.345678 USDT (not sats)
5. Network badge: "BSC Testnet"
6. Status: Confirmed
7. Click explorer link
8. Opens BSCscan (not RSK explorer)
9. URL contains transaction hash

#### 8b. Multiple Transactions
1. History shows multiple USDT transactions
2. Each shows correct network badge
3. Each shows USDT amounts
4. Each has working explorer link to correct chain

**Verifications**:
- Amount displays in USDT (6 decimal places)
- Amount does NOT show in sats
- Network badge accurate ("BSC Mainnet" or "BSC Testnet")
- Network badge visible and clear
- Explorer link points to correct explorer
- Explorer URL contains transaction hash
- BSCscan link (not Blockscout RSK)
- Clicking link opens in new tab/window
- Can navigate back and history still correct

**Critical Bug Prevention**:
- DO NOT show "Bitcoin Mainnet" or "sats" for USDT transactions
- DO NOT link to RSK Blockscout for BSC transactions
- DO NOT show BNB fees as "network fee"
- DO verify chainId matches network display

---

## Test Configuration

### Environment

- **Base URL**: `http://localhost:5173` (configurable via `BASE_URL` env var)
- **Testnet Networks**:
  - BSC Testnet: Chain ID 97
  - RSK Testnet: Chain ID 31
- **USDT Token Decimals**: 6 (not 18 like many ERC-20s)

### Test Data

```typescript
const TEST_ADDRESSES = {
  user1: '0x1234567890123456789012345678901234567890',
  user2: '0xAbCdEfAbCdEfAbCdEfAbCdEfAbCdEfAbCdEfAbCd',
  ambiguous: '0x9876543210987654321098765432109876543210'
};

const TEST_AMOUNTS = {
  small: '1.234567',    // 1,234,567 in atomic units
  medium: '12.345678',  // 12,345,678 in atomic units
  large: '100.000000',  // 100,000,000 in atomic units
  veryLarge: '1000.000000' // 1,000,000,000 in atomic units
};
```

### Timeouts

- **Standard timeout**: 30 seconds
- **Payment confirmation timeout**: 30 seconds
- **Poll interval**: 500ms

---

## Running the Tests

### Prerequisites

```bash
# Install dependencies
npm install

# Build project
npm run build

# Start dev server
npm run dev
```

### Run All E2E Tests

```bash
npm test -- usdt-bsc-payments.e2e.test.ts
```

### Run Specific Scenario

```bash
npm test -- usdt-bsc-payments.e2e.test.ts -t "Scenario 2"
```

### Run with UI (recommended for debugging)

```bash
npx playwright test --ui src/lib/tests/e2e/usdt-bsc-payments.e2e.test.ts
```

### Run with specific browser

```bash
npx playwright test --project=chromium src/lib/tests/e2e/usdt-bsc-payments.e2e.test.ts
```

### Debug mode

```bash
npx playwright test --debug src/lib/tests/e2e/usdt-bsc-payments.e2e.test.ts
```

---

## Implementation Details

### Page Object Model

The `WalletPageObjects` class encapsulates UI interactions:

```typescript
class WalletPageObjects {
  async navigateToSendPayment()
  async selectNetwork(networkName: string)
  async selectAsset(assetSymbol: 'USDT' | 'BNB')
  async fillRecipientAddress(address: string)
  async fillAmount(amount: string)
  async clickReviewPayment()
  async clickConfirmPayment()
  async getTransactionHash(): Promise<string>
  async getConfirmedAmount(): Promise<string>
  // ... more methods
}
```

### Test Selectors

Tests use `data-testid` attributes. Required in components:

```typescript
// Payment form
[data-testid="send-payment-form"]
[data-testid="recipient-address-input"]
[data-testid="amount-input"]
[data-testid="amount-unit"]
[data-testid="network-fee"]
[data-testid="review-payment-button"]
[data-testid="confirm-payment-button"]

// Status screens
[data-testid="pending-transaction-screen"]
[data-testid="transaction-hash"]
[data-testid="confirmed-amount"]

// Transaction history
[data-testid="transaction-row-0"]
[data-testid="tx-amount"]
[data-testid="tx-network"]
[data-testid="tx-status"]
[data-testid="explorer-link-0"]

// Network selection
[data-testid="network-selector-bsc-testnet"]
[data-testid="selected-network"]
[data-testid="selected-network-icon"]
```

### Error Handling

Tests verify error messages and recovery paths:

```typescript
[data-testid="error-message"]          // Generic error display
[data-testid="address-error"]          // Invalid address
[data-testid="amount-error"]           // Insufficient balance
[data-testid="sponsor-error"]          // Sponsor unavailable
[data-testid="network-disambiguation-dialog"] // Chain choice
```

---

## Success Criteria

- [ ] All 8 scenarios passing
- [ ] No test flakiness (deterministic results)
- [ ] Each test completes in <30 seconds
- [ ] <2% failure rate on CI/CD
- [ ] Clear error messages on failure
- [ ] Test data cleanup between runs
- [ ] Works in multiple browsers (Chromium, Firefox, WebKit)
- [ ] Can run in headless mode

---

## Debugging Failed Tests

### Common Issues

#### "Element not found" errors
- Check `data-testid` attribute exists in component
- Verify selector matches current component structure
- Use `--ui` mode to inspect element live

#### Timeout errors
- Payment confirmation may require blockchain interaction
- Mock or use testnet with fast blocks
- Increase timeout if network is slow

#### Address validation errors
- Ensure addresses are properly checksummed
- Valid BSC addresses: `0x[40 hex chars]`
- Verify address format before test

#### Amount parsing errors
- USDT uses 6 decimals (not 18)
- 1 USDT = 1,000,000 in atomic units
- Test amounts must be valid: "1.234567" not "1.234567890"

### Screenshot Capture on Failure

Tests automatically capture screenshots on failure in `test-results/` directory.

### Enable Debug Logging

```bash
DEBUG=pw:api npm test -- usdt-bsc-payments.e2e.test.ts
```

---

## CI/CD Integration

### GitHub Actions Example

```yaml
- name: Run USDT-BSC E2E Tests
  run: npm test -- usdt-bsc-payments.e2e.test.ts
  env:
    BASE_URL: https://testnet.bittasker.app
    CI: true
```

### Pre-commit Hook

```bash
npm test -- usdt-bsc-payments.e2e.test.ts --reporter=json --outputFile=test-results.json
```

---

## Future Enhancements

- [ ] Add visual regression tests for network badges
- [ ] Simulate blockchain failures (node down, RPC error)
- [ ] Test with real testnet BSC transactions
- [ ] Add performance benchmarks for payment submission
- [ ] Test payment cancellation flows
- [ ] Test dispute scenarios with escrow
- [ ] Add load testing (multiple concurrent payments)
- [ ] Test mobile-specific payment flows

---

## Related Files

- **Payment Components**: `src/lib/components/wallet/SendPaymentForm.svelte`
- **Wallet Store**: `src/lib/stores/wallet.store.ts`
- **Payment Parser**: `src/lib/utils/helpers/paymentAddressParser.ts`
- **Transaction History**: `src/lib/components/wallet/TransactionHistory.svelte`
- **Escrow Contract**: `src/lib/utils/escrow/v1/nostrContract.ts`

---

## Contact & Support

For test failures or questions about USDT-BSC payment flows:
1. Check test output and screenshot
2. Verify network connectivity and chain ID
3. Check wallet balance and sponsor status
4. Review payment address format
5. Consult test file comments for specific scenario details

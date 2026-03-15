# USDT-BSC E2E Test Implementation Checklist

## Overview
This checklist tracks implementation of required `data-testid` attributes and functionality for E2E tests to pass.

## Critical: Required for ALL Tests

### Navigation & Layout
- [ ] Dashboard loads at `/dashboard`
- [ ] Send payment accessible at `/dashboard/send-payment`
- [ ] Receive payment accessible at `/dashboard/receive-payment`
- [ ] Transaction history accessible at `/dashboard/transactions`
- [ ] Task creation accessible (button or route)
- [ ] Task details accessible at `/dashboard/task/[taskId]`

---

## Scenario 1: Task → Bid → Acceptance
*Multi-user task flow with network persistence*

### Task Creation (Create-Task Page)
- [ ] `[data-testid="create-task-button"]` - Button to start task creation
- [ ] `[data-testid="create-task-form"]` - Form container
- [ ] `[data-testid="task-title"]` - Title input field
- [ ] `[data-testid="task-description"]` - Description textarea
- [ ] `[data-testid="task-budget"]` - Budget amount input
- [ ] `[data-testid="network-selector-bsc-testnet"]` - Network selection button
- [ ] `[data-testid="asset-selector-USDT"]` - Asset selection (USDT)
- [ ] `[data-testid="payment-network-badge"]` - Shows "BSC Testnet" badge
- [ ] `[data-testid="submit-task-button"]` - Submit task creation
- [ ] `[data-testid="task-created-success"]` - Success message
- [ ] `[data-testid="created-task-id"]` - Display created task ID

### Task Details (View Task Page)
- [ ] `[data-testid="task-details"]` - Main task details container
- [ ] `[data-testid="payment-network-badge"]` - Network badge visible to bidders
- [ ] `[data-testid="place-bid-button"]` - Button to place bid

### Bid Form (Bidding Modal/Page)
- [ ] `[data-testid="bid-amount-input"]` - Bid amount input
- [ ] `[data-testid="bid-message"]` - Bid message/description
- [ ] `[data-testid="bid-payment-network"]` - Shows payment network (USDT on BSC)
- [ ] `[data-testid="submit-bid-button"]` - Submit bid
- [ ] `[data-testid="bid-submitted-success"]` - Success message

### Bid Acceptance (Task Creator View)
- [ ] `[data-testid="incoming-bids"]` - List of incoming bids
- [ ] `[data-testid="bid-row-0"]` - Individual bid row (contains amount, message)
- [ ] `[data-testid="accept-bid-button"]` - Button to accept bid
- [ ] `[data-testid="bid-acceptance-confirmation"]` - Confirmation dialog
- [ ] `[data-testid="confirm-acceptance-button"]` - Confirm acceptance

### Escrow Verification
- [ ] `[data-testid="contract-created-success"]` - Contract creation success
- [ ] `[data-testid="escrow-card-0"]` - Escrow contract card
- [ ] Escrow card shows: amount in USDT, network badge (BSC)
- [ ] `[data-testid="escrow-payment-network"]` - Network display "BSC Testnet"
- [ ] `[data-testid="escrow-id"]` - Escrow/contract ID

---

## Scenario 2: Send USDT Payment
*Basic payment submission flow*

### Payment Form (SendPaymentForm)
- [ ] `[data-testid="send-payment-form"]` - Form container
- [ ] `[data-testid="network-selector-bsc-testnet"]` - BSC Testnet button
- [ ] `[data-testid="asset-selector-USDT"]` - USDT asset button
- [ ] `[data-testid="selected-network"]` - Display selected network text
- [ ] `[data-testid="selected-network-icon"]` - Network icon image
  - Must have `src` attribute with BSC image path
- [ ] `[data-testid="recipient-address-input"]` - Address input field
- [ ] `[data-testid="address-error"]` - Address validation error message
- [ ] `[data-testid="amount-input"]` - Amount input field
- [ ] `[data-testid="amount-unit"]` - Unit label (must show "USDT")
- [ ] `[data-testid="amount-error"]` - Amount validation error
- [ ] `[data-testid="available-balance"]` - Available balance display (must show USDT)
- [ ] `[data-testid="network-fee"]` - Network fee (must show USDT, NOT BNB)
- [ ] `[data-testid="max-button"]` - Max amount button
- [ ] `[data-testid="review-payment-button"]` - Review button (disabled when invalid)

### Payment Review Screen
- [ ] `[data-testid="payment-review-screen"]` - Review container
- [ ] `[data-testid="review-recipient-address"]` - Display recipient address
- [ ] `[data-testid="review-amount"]` - Display amount with USDT unit
- [ ] `[data-testid="review-network"]` - Display "BSC Testnet"
- [ ] `[data-testid="confirm-payment-button"]` - Confirm button (disabled if chain wrong)

### Authentication & Submission
- [ ] `[data-testid="authenticate-and-send-button"]` - Auth & send button

### Status Screens
- [ ] `[data-testid="pending-transaction-screen"]` - Pending state container
- [ ] `[data-testid="transaction-success-screen"]` - Success state container
- [ ] `[data-testid="transaction-hash"]` - Display transaction hash
- [ ] `[data-testid="confirmed-amount"]` - Display amount in USDT

### Error Handling
- [ ] `[data-testid="error-message"]` - Generic error display
- [ ] `[data-testid="sponsor-error"]` - Sponsor service error
- [ ] `[data-testid="switch-chain-button"]` - Switch network button
- [ ] `[data-testid="retry-payment-button"]` - Retry button

---

## Scenario 3: Receive USDT Payment
*Payment request generation with QR code*

### Receive Form (ReceivePaymentForm)
- [ ] `[data-testid="receive-payment-form"]` - Form container
- [ ] `[data-testid="network-selector-bsc-testnet"]` - Network selector
- [ ] `[data-testid="asset-selector-USDT"]` - USDT selector
- [ ] `[data-testid="request-amount-input"]` - Amount to request input
- [ ] `[data-testid="generate-request-button"]` - Generate request button

### Payment Request Display
- [ ] `[data-testid="payment-request-uri"]` - URI display/input element
  - Must contain URI with format: `bsc://...` or `ethereum:...@97`
- [ ] `[data-testid="display-address"]` - Display recipient address (0x...)
- [ ] `[data-testid="display-amount"]` - Display amount to receive
- [ ] `[data-testid="request-network-badge"]` - Network badge (BSC Testnet)
- [ ] `[data-testid="payment-qr-code"]` - QR code image element
- [ ] `[data-testid="copy-uri-button"]` - Copy URI button
- [ ] `[data-testid="share-request-button"]` - Share button

---

## Scenario 4: Ambiguous Address Handling
*Network disambiguation when raw 0x address entered*

### Dialog Elements
- [ ] `[data-testid="network-disambiguation-dialog"]` - Modal/dialog container
- [ ] `[data-testid="network-disambiguation-BSC"]` - BSC option button
- [ ] `[data-testid="network-disambiguation-RSK"]` - RSK option button

### Behavior
- [ ] Dialog appears automatically when ambiguous address entered
- [ ] Dialog closes after selection
- [ ] Selected network persists in form
- [ ] Review screen shows selected network

---

## Scenario 5: Wrong Chain Detection
*Preflight check for chain mismatch*

### Error Display
- [ ] `[data-testid="error-message"]` - Error message container
  - Must contain: "wrong", "chain", or "switch", "network"
- [ ] `[data-testid="switch-chain-button"]` - Switch network button
  - Text must contain: "switch" or "change" or "select"

### Button States
- [ ] Confirm button disabled when wrong chain detected
- [ ] Confirm button enabled after correct chain selected
- [ ] Error message clears when chain fixed

---

## Scenario 6: Insufficient Balance Handling
*Input validation against available balance*

### Balance Display
- [ ] `[data-testid="available-balance"]` - Shows current balance
  - Format: "5.000000 USDT" or similar
  - Must show USDT amount

### Validation
- [ ] `[data-testid="amount-error"]` - Error when amount exceeds balance
  - Must show available balance in error
- [ ] Review button disabled when error exists
- [ ] `[data-testid="max-button"]` - Sets amount to maximum available
  - Maximum should be <= available balance

---

## Scenario 7: Sponsor Unavailability Handling
*Service error detection and recovery*

### Error Display
- [ ] `[data-testid="sponsor-error"]` - Sponsor error message
  - Text must match: "sponsor", "unavailable", "service", "retry"
- [ ] Confirm button disabled when sponsor unavailable
- [ ] `[data-testid="retry-payment-button"]` - Retry button available

### Recovery
- [ ] Error clears when sponsor becomes available
- [ ] Can proceed after successful retry

---

## Scenario 8: Transaction History
*Display transactions with correct network and units*

### History List
- [ ] `[data-testid="transaction-row-{index}"]` - Individual transaction row
- [ ] Multiple rows for multiple transactions

### Transaction Details
- [ ] `[data-testid="tx-amount"]` - Amount display in USDT (not sats)
  - Format: "12.345678 USDT"
  - Must NOT show "sats"
- [ ] `[data-testid="tx-network"]` - Network badge
  - Format: "BSC Testnet" or "BSC Mainnet"
  - Must NOT show "Bitcoin" or "RSK" for USDT transactions
- [ ] `[data-testid="tx-status"]` - Status display
  - Must show: "Confirmed", "Pending", "Failed"
- [ ] `[data-testid="tx-hash"]` - Transaction hash display

### Explorer Link
- [ ] `[data-testid="explorer-link-{index}"]` - Link to block explorer
  - Href must contain: "bscscan" (NOT "blockscout/rsk")
  - Must contain transaction hash in URL
  - Opens in new tab/window

---

## Data Validation Rules

### Amount Format
```
✓ Valid:   "1.234567", "12.345678", "100.000000"
✓ Display: "12.345678 USDT"
✗ Invalid: "1.2345678" (too many decimals)
✗ Invalid: "1.2" (shows as "1.20" but stored as atomic)
✗ Display: "12345678 sats" (wrong for USDT)
```

### Network Display
```
✓ Valid: "BSC Testnet", "BSC Mainnet"
✗ Invalid: "BSC", "BSC Test", "binance"
✗ Wrong: "Bitcoin", "RSK" (for USDT transactions)
```

### Address Format
```
✓ Valid: "0x1234567890123456789012345678901234567890"
✓ Valid: "0xAbCdEfAbCdEfAbCdEfAbCdEfAbCdEfAbCdEfAbCd" (checksummed)
✗ Invalid: "0x123" (too short)
✗ Invalid: "1234567890123456789012345678901234567890" (missing 0x)
```

### URI Format
```
✓ Valid: "bsc://0x1234...@97?amount=12.345678"
✓ Valid: "ethereum:0x1234...@97?amount=12345678"
✗ Invalid: "0x1234...@97?amount=12.345678" (missing scheme)
✗ Invalid: "bsc://0x1234...?amount=sats" (wrong unit)
```

---

## Implementation Priority

### Phase 1: Critical (Blocks all tests)
1. Navigation routes working
2. Form inputs exist with correct IDs
3. Basic button functionality

### Phase 2: High (Blocks most tests)
4. Network/asset selection working
5. Amount input validation
6. Address input validation
7. Review screen displays correctly
8. Transaction history shows transactions

### Phase 3: Medium (Fixes specific scenarios)
9. Disambiguation dialog for ambiguous addresses
10. Error messages for wrong chain
11. Error messages for insufficient balance
12. Error messages for sponsor issues
13. Explorer links pointing to correct chain

### Phase 4: Low (Polish)
14. QR code generation
15. Payment request URI generation
16. Copy/share functionality
17. Network icon images
18. Badge styling

---

## Testing Command

After implementation, verify with:

```bash
# Run all tests
npm test -- usdt-bsc-payments.e2e.test.ts

# Run single scenario
npm test -- usdt-bsc-payments.e2e.test.ts -t "Scenario 2"

# Debug mode
npx playwright test --debug src/lib/tests/e2e/usdt-bsc-payments.e2e.test.ts
```

---

## Component Files to Modify

### Required Updates
- [ ] `src/lib/components/wallet/SendPaymentForm.svelte`
- [ ] `src/lib/components/wallet/ReceivePaymentForm.svelte`
- [ ] `src/lib/components/wallet/TransactionHistory.svelte`
- [ ] `src/lib/components/wallet/TransactionSuccessScreen.svelte`
- [ ] `src/lib/components/wallet/PendingTransactionScreen.svelte`
- [ ] `src/lib/routes/(protected)/dashboard/create-task/+page.svelte`
- [ ] `src/lib/components/task/TaskCard.svelte`
- [ ] `src/lib/components/bidding/BidForm.svelte`
- [ ] `src/lib/components/contracts/ContractCard.svelte`
- [ ] Any network/asset selector components
- [ ] Any disambiguation dialog components

### Files to Check/Create
- [ ] Ensure TaskDetailsView displays task properly
- [ ] Ensure BidAcceptanceForm exists
- [ ] Ensure escrow display components exist

---

## Success Criteria

Test passes when:
- [ ] All 8 scenarios execute without errors
- [ ] All assertions pass
- [ ] No "element not found" errors
- [ ] Each test completes in <30 seconds
- [ ] No flaky behavior (consistent results)
- [ ] Screenshots clear on failure
- [ ] Can run in CI/CD environment

---

## Sign-off

- [ ] All required selectors added
- [ ] Data validation rules implemented
- [ ] All 8 tests passing
- [ ] No flakiness observed
- [ ] Performance targets met
- [ ] CI/CD integration working
- [ ] Documentation complete

---

## Additional Notes

### Formatting Standards

For consistency across tests:

**Amount Display**:
- Always show 6 decimal places for USDT
- Use space before unit: "12.345678 USDT" (not "12.345678USDT")
- Show units in uppercase: "USDT" (not "usdt" or "Usdt")

**Network Display**:
- Always include full name: "BSC Testnet" or "BSC Mainnet"
- Use title case: "BSC Testnet" (not "bsc testnet" or "BSC")
- Show chain ID where relevant: "@97" for testnet

**Error Messages**:
- Start with action verb: "Enter", "Select", "Switch"
- Include current state: "You're connected to RSK..."
- Suggest action: "Please switch to BSC..."
- Show relevant values: "Available: 5.000000 USDT"

### Testing Tips

1. Use `--ui` mode while developing: `npx playwright test --ui`
2. Take screenshots on failure: `test.afterEach(async ({ page }) => { await page.screenshot(); })`
3. Debug selectors: `await page.locator('[data-testid="..."]').click();`
4. Check visibility: `await expect(element).toBeVisible();`
5. Mock external services initially, add real testnet later

### Common Mistakes to Avoid

1. ✗ Forgetting `data-testid` attributes
2. ✗ Using wrong units (showing sats for USDT)
3. ✗ Wrong explorer URLs (RSK for BSC transactions)
4. ✗ Showing "Bitcoin" for USDT transactions
5. ✗ Not handling decimal places correctly (6 for USDT)
6. ✗ Ambiguous network names (just "BSC" instead of "BSC Testnet")
7. ✗ Not disabling buttons during error states
8. ✗ Not preserving network context through flows

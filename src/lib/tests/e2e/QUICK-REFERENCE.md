# USDT-BSC E2E Tests - Quick Reference

## Run Tests

```bash
# Run all USDT-BSC E2E tests
npm test -- usdt-bsc-payments.e2e.test.ts

# Run with Playwright UI (best for development)
npx playwright test --ui src/lib/tests/e2e/usdt-bsc-payments.e2e.test.ts

# Run specific scenario
npm test -- usdt-bsc-payments.e2e.test.ts -t "Scenario 2"
npm test -- usdt-bsc-payments.e2e.test.ts -t "Send USDT"

# Debug mode (step through test)
npx playwright test --debug src/lib/tests/e2e/usdt-bsc-payments.e2e.test.ts

# Trace mode (capture detailed logs)
npx playwright test --trace on src/lib/tests/e2e/usdt-bsc-payments.e2e.test.ts

# Specific browser
npx playwright test --project=chromium src/lib/tests/e2e/usdt-bsc-payments.e2e.test.ts
npx playwright test --project=firefox src/lib/tests/e2e/usdt-bsc-payments.e2e.test.ts
npx playwright test --project=webkit src/lib/tests/e2e/usdt-bsc-payments.e2e.test.ts

# With reporter
npm test -- usdt-bsc-payments.e2e.test.ts --reporter=html
```

## Test Scenarios

| # | Name | Purpose | Time |
|---|------|---------|------|
| 1 | Task → Bid → Acceptance | Multi-user task flow | ~10s |
| 2 | Send USDT Payment | Complete payment submission | ~8s |
| 3 | Receive Payment Request | QR generation & URI | ~5s |
| 4 | Ambiguous Address | Network disambiguation | ~6s |
| 5 | Wrong Chain Detection | Chain mismatch error | ~8s |
| 6 | Insufficient Balance | Input validation | ~5s |
| 7 | Sponsor Unavailability | Service error handling | ~6s |
| 8 | Transaction History | Display & explorer links | ~7s |

## Test Data

### Addresses (Valid BSC Format)
```typescript
user1:      '0x1234567890123456789012345678901234567890'
user2:      '0xAbCdEfAbCdEfAbCdEfAbCdEfAbCdEfAbCdEfAbCd' (checksummed)
ambiguous:  '0x9876543210987654321098765432109876543210'
```

### Amounts (USDT with 6 decimals)
```typescript
small:      '1.234567'    // 1,234,567 atomic units
medium:     '12.345678'   // 12,345,678 atomic units
large:      '100.000000'  // 100,000,000 atomic units
veryLarge:  '1000.000000' // 1,000,000,000 atomic units
```

### Networks
```typescript
BSC Testnet:  Chain ID 97  (primary)
BSC Mainnet:  Chain ID 56  (fallback)
RSK Testnet:  Chain ID 31  (disambiguation)
```

## Required Component Selectors

### SendPaymentForm (20+ selectors)
```
[data-testid="send-payment-form"]
[data-testid="network-selector-bsc-testnet"]
[data-testid="asset-selector-USDT"]
[data-testid="recipient-address-input"]
[data-testid="amount-input"]
[data-testid="amount-unit"]              // Must show "USDT"
[data-testid="available-balance"]        // Must show USDT
[data-testid="network-fee"]              // Must show USDT (not BNB)
[data-testid="address-error"]
[data-testid="amount-error"]
[data-testid="selected-network"]
[data-testid="selected-network-icon"]
[data-testid="max-button"]
[data-testid="review-payment-button"]
[data-testid="error-message"]
[data-testid="switch-chain-button"]
[data-testid="sponsor-error"]
[data-testid="retry-payment-button"]
[data-testid="network-disambiguation-dialog"]
[data-testid="network-disambiguation-BSC"]
[data-testid="network-disambiguation-RSK"]
```

### Payment Review Screen
```
[data-testid="payment-review-screen"]
[data-testid="review-recipient-address"]
[data-testid="review-amount"]            // Must show USDT
[data-testid="review-network"]           // Must show "BSC Testnet"
[data-testid="confirm-payment-button"]
```

### Status Screens
```
[data-testid="pending-transaction-screen"]
[data-testid="transaction-success-screen"]
[data-testid="transaction-hash"]
[data-testid="confirmed-amount"]
[data-testid="authenticate-and-send-button"]
```

### ReceivePaymentForm (10+ selectors)
```
[data-testid="receive-payment-form"]
[data-testid="request-amount-input"]
[data-testid="generate-request-button"]
[data-testid="payment-request-uri"]      // Must contain bsc:// or ethereum:@97
[data-testid="display-address"]
[data-testid="display-amount"]
[data-testid="payment-qr-code"]
[data-testid="copy-uri-button"]
[data-testid="share-request-button"]
[data-testid="request-network-badge"]    // Must show "BSC Testnet"
```

### TransactionHistory (6+ selectors per row)
```
[data-testid="transaction-row-{index}"]
[data-testid="tx-amount"]                // Must show USDT (not sats)
[data-testid="tx-network"]               // Must show "BSC Testnet"
[data-testid="tx-status"]
[data-testid="tx-hash"]
[data-testid="explorer-link-{index}"]    // href must contain bscscan
```

### Task/Bid Components (12+ selectors)
```
[data-testid="create-task-button"]
[data-testid="create-task-form"]
[data-testid="task-title"]
[data-testid="task-budget"]
[data-testid="submit-task-button"]
[data-testid="task-created-success"]
[data-testid="created-task-id"]
[data-testid="incoming-bids"]
[data-testid="bid-row-0"]
[data-testid="bid-amount-input"]
[data-testid="accept-bid-button"]
[data-testid="escrow-card-0"]
[data-testid="escrow-payment-network"]
[data-testid="payment-network-badge"]    // Multiple uses
```

## Critical Validation Rules

### Amount Display
```
✓ Correct:   "12.345678 USDT"
✓ Correct:   "12.345678USDT" (no space)
✗ Wrong:     "12345678 sats"
✗ Wrong:     "12.34 USDT" (should show 6 decimals)
✗ Wrong:     "12.3456789 USDT" (too many decimals)
```

### Network Display
```
✓ Correct:   "BSC Testnet"
✓ Correct:   "BSC Mainnet"
✗ Wrong:     "BSC"
✗ Wrong:     "binance"
✗ Wrong:     "Bitcoin" (for USDT)
✗ Wrong:     "RSK" (for USDT)
```

### Fee Display
```
✓ Correct:   "0.05 USDT"
✗ Wrong:     "0.001 BNB"
✗ Wrong:     "5000 wei"
✗ Wrong:     "sats"
```

### Explorer URL
```
✓ Correct:   https://testnet.bscscan.com/tx/0x[hash]
✓ Correct:   https://bscscan.com/tx/0x[hash]
✗ Wrong:     https://blockscout.com/rsk/[hash]
✗ Wrong:     https://etherscan.io/tx/0x[hash]
```

### Payment URI Format
```
✓ Correct:   bsc://0x1234...@97?amount=12.345678
✓ Correct:   ethereum:0x1234...@97?amount=12345678
✗ Wrong:     0x1234...?amount=12 (missing scheme)
✗ Wrong:     ethereum:0x1234... (missing chainId)
✗ Wrong:     bsc://0x1234?amount=sats
```

## Page Object Methods

```typescript
// Navigation
po.navigateToDashboard()
po.navigateToSendPayment()
po.navigateToReceivePayment()
po.navigateToTransactionHistory()

// Selection
po.selectNetwork('BSC Testnet' | 'RSK Testnet')
po.selectAsset('USDT' | 'BNB')

// Input
po.fillRecipientAddress(address)
po.fillAmount(amount)
po.fillRequestAmount(amount)

// Interaction
po.clickReviewPayment()
po.clickConfirmPayment()
po.generatePaymentRequest()
po.copyPaymentURI()
po.authenticateAndSend()
po.selectNetworkDisambiguation('BSC' | 'RSK')
po.clickExplorerLink(txIndex)
po.retryPayment()

// Reading
po.getPaymentRequestURI(): Promise<string>
po.getDisplayedAddress(): Promise<string>
po.getDisplayedAmount(): Promise<string>
po.getTransactionHash(): Promise<string>
po.getConfirmedAmount(): Promise<string>
po.getNetworkFee(): Promise<string>
po.getErrorMessage(): Promise<string>
po.getTransactionFromHistory(index): Promise<{amount, network, status, hash}>
po.isErrorDisplayed(): Promise<boolean>

// Waiting
po.waitForPendingState()
po.waitForSuccessState()
```

## Environment Variables

```bash
BASE_URL=http://localhost:5173        # App URL (default)
CI=true                                # For CI/CD runs
DEBUG=pw:api                          # Enable debug logging
```

## Common Test Patterns

### Test Network Selection
```typescript
await po.selectNetwork('BSC Testnet');
const networkBadge = page.locator('[data-testid="payment-network-badge"]');
await expect(networkBadge).toContainText('BSC');
```

### Test Amount Validation
```typescript
await po.fillAmount('100');
const error = page.locator('[data-testid="amount-error"]');
await expect(error).toBeVisible();
await expect(error).toContainText('insufficient');
```

### Test Transaction Display
```typescript
const tx = await po.getTransactionFromHistory(0);
expect(tx.amount).toContain('USDT');
expect(tx.network).toMatch(/BSC/i);
```

### Test Error Recovery
```typescript
// Error should appear
await expect(page.locator('[data-testid="error-message"]')).toBeVisible();

// Fix issue
await page.addInitScript(() => {
  window.localStorage.setItem('sponsor_status', 'available');
});

// Retry
await page.locator('[data-testid="retry-payment-button"]').click();

// Error should clear
await expect(page.locator('[data-testid="error-message"]')).not.toBeVisible();
```

## Debugging Tips

1. **Inspect Elements**: Use `--ui` mode and DevTools
2. **Check Selectors**: Verify `data-testid` exists
3. **Debug Logs**: Enable with `DEBUG=pw:api`
4. **Screenshots**: Capture on failure
5. **Traces**: Run with `--trace on`
6. **Slow Motion**: `npx playwright test --headed --slow-mo=1000`
7. **Watch Mode**: `npm test -- --watch` (for compatible test runners)

## Troubleshooting

### "Element not found" → Check selector in component
### "Timeout" → Increase wait time or check element visibility
### "Assertion failed" → Verify test data and expected values
### "Flaky test" → Use explicit waits, avoid setTimeout
### "Wrong amounts displayed" → Check decimal places (USDT = 6)
### "Wrong explorer link" → Verify chainId and URL format

## Files Reference

```
src/lib/tests/e2e/
├── usdt-bsc-payments.e2e.test.ts           Main test file
├── USDT-BSC-E2E-TESTING.md                 Full guide (350 lines)
├── USDT-BSC-TEST-IMPLEMENTATION.md         Technical details (400 lines)
├── IMPLEMENTATION-CHECKLIST.md             Implementation tracker (400 lines)
└── QUICK-REFERENCE.md                      This file
```

## Performance Targets

- Form interactions: <500ms
- Validation: <200ms
- Fee calculation: <1000ms
- Payment submission: <2000ms
- Transaction confirmation: <10000ms
- Total per test: <30 seconds

## Success Checklist

- [ ] All 8 scenarios run without errors
- [ ] No "element not found" errors
- [ ] Amount displays in USDT (not sats)
- [ ] Network shows "BSC Testnet" (not "BSC")
- [ ] Explorer links to BSCscan (not RSK)
- [ ] Each test <30 seconds
- [ ] Errors clear on retry
- [ ] Tests run in CI/CD
- [ ] Can run individual scenarios
- [ ] Screenshots on failure

## Quick Verification

Test critical functionality in 2 minutes:

```bash
# Start app
npm run dev &

# Run Scenario 2 (Send USDT) - fastest test
npx playwright test --ui src/lib/tests/e2e/usdt-bsc-payments.e2e.test.ts -t "Scenario 2"

# Verify in UI:
# 1. Amount shows "USDT" unit
# 2. Network shows "BSC Testnet"
# 3. Fee shows "USDT" (not BNB)
# 4. Error when balance exceeded
# 5. Transaction hash generated
```

## CI/CD Template

```yaml
name: USDT-BSC E2E Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm ci

      - name: Build project
        run: npm run build

      - name: Start dev server
        run: npm run dev &
        env:
          BASE_URL: http://localhost:5173

      - name: Wait for server
        run: npx wait-on http://localhost:5173

      - name: Run USDT-BSC E2E Tests
        run: npm test -- usdt-bsc-payments.e2e.test.ts

      - name: Upload artifacts
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: test-results
          path: test-results/
```

---

**Last Updated**: 2026-03-14
**Test File**: usdt-bsc-payments.e2e.test.ts
**Total Scenarios**: 8
**Estimated Runtime**: 55 seconds

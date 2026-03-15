# USDT-BSC E2E Tests - Quick Start Guide

## 60-Second Setup

```bash
# 1. Copy environment template
cp src/lib/tests/e2e/.env.example .env.local

# 2. Add your test account private keys to .env.local
# Get test BNB from: https://testnet.binance.org/faucet-smart

# 3. Run tests
npm run test:e2e

# 4. View results
npx playwright show-report
```

## Running Tests

### Run All E2E Tests
```bash
npm run test:e2e
```

### Run Specific Scenario
```bash
# Run only Scenario 2 (Send USDT Payment)
npm run test:e2e -- --grep "Scenario 2"

# Run by test name
npm run test:e2e -- --grep "should complete send USDT payment"
```

### Debug Mode (Visual)
```bash
npm run test:e2e:headed
```

### With Video
```bash
PLAYWRIGHT_VIDEO=on npm run test:e2e
```

## Component Selectors Quick Reference

### Payment Forms
```
[data-testid="send-payment-form"]
[data-testid="receive-payment-form"]
[data-testid="recipient-address-input"]
[data-testid="amount-input"]
[data-testid="review-payment-button"]
[data-testid="confirm-payment-button"]
```

### Status Screens
```
[data-testid="pending-transaction-screen"]
[data-testid="transaction-success-screen"]
[data-testid="error-message"]
[data-testid="transaction-hash"]
```

### Network/Asset Selection
```
[data-testid="network-selector-bsc-testnet"]
[data-testid="asset-selector-USDT"]
[data-testid="network-disambiguation-dialog"]
[data-testid="network-disambiguation-BSC"]
```

### Task & Bid
```
[data-testid="create-task-button"]
[data-testid="create-task-form"]
[data-testid="task-title"]
[data-testid="task-budget"]
[data-testid="place-bid-button"]
[data-testid="bid-amount-input"]
[data-testid="accept-bid-button"]
```

### Transaction History
```
[data-testid="transaction-row-{index}"]
[data-testid="transaction-row-0"] [data-testid="tx-amount"]
[data-testid="transaction-row-0"] [data-testid="tx-hash"]
[data-testid="explorer-link-0"]
```

## Using Page Objects

All tests use the `BitTaskerPageObject` class for clean, reusable interactions:

```typescript
import { BitTaskerPageObject } from './helpers/page-objects';

// Create page object
const po = new BitTaskerPageObject(page);

// Navigate
await po.gotoDashboard();
await po.gotoSendPayment();

// Fill form
await po.fillRecipientAddress('0xAbCD...');
await po.fillAmount('12.34');

// Interact with UI
await po.selectNetwork('BSC Testnet');
await po.selectAsset('USDT');
await po.clickReviewPayment();

// Get data
const hash = await po.getTransactionHash();
const uri = await po.getPaymentRequestUri();

// Check state
const isError = await po.isErrorDisplayed();
const isSuccess = await po.isSuccessScreenVisible();

// Wait for conditions
await po.waitForSuccessState();
await po.waitForErrorState();
```

## Common Page Object Methods

### Navigation
- `goto(path)` - Go to any path
- `gotoDashboard()` - Go to dashboard
- `gotoSendPayment()` - Go to send payment form
- `gotoReceivePayment()` - Go to receive payment form
- `gotoTaskDetails(taskId)` - Go to task details

### Forms
- `fillRecipientAddress(address)`
- `fillAmount(amount)`
- `fillTaskTitle(title)`
- `fillTaskDescription(desc)`
- `fillTaskBudget(budget)`
- `fillBidAmount(amount)`
- `fillBidMessage(message)`
- `fillRequestAmount(amount)`

### UI Interactions
- `selectNetwork(name)` - Select network from dropdown
- `selectAsset(symbol)` - Select asset (USDT, BNB, etc)
- `disambiguateNetwork(network)` - Handle ambiguous address dialog
- `clickReviewPayment()` - Click review button
- `clickConfirmPayment()` - Confirm payment
- `clickGenerateRequest()` - Generate payment request
- `clickCreateTask()` - Create task button
- `clickSubmitBid()` - Submit bid

### Data Retrieval
- `getPaymentRequestUri()` - Get generated URI
- `getDisplayedAddress()` - Get displayed address
- `getDisplayedAmount()` - Get displayed amount
- `getNetworkFee()` - Get calculated fee
- `getTransactionHash()` - Get tx hash from screen
- `getConfirmedAmount()` - Get confirmed amount
- `getErrorMessage()` - Get error text
- `getCreatedTaskId()` - Get created task ID
- `getTransactionFromHistory(index)` - Get tx from list
- `getBidFromList(index)` - Get bid details
- `getEscrowFromList(index)` - Get escrow details

### State Checks
- `isErrorDisplayed()` - Check if error showing
- `isSuccessScreenVisible()` - Check success screen
- `isPendingScreenVisible()` - Check pending screen
- `isElementVisible(selector)` - Generic visibility check

### Waits
- `waitForPendingState()` - Wait for pending screen
- `waitForSuccessState()` - Wait for success screen
- `waitForErrorState()` - Wait for error
- `waitForDisambiguationDialog()` - Wait for ambiguous address dialog
- `waitForTask(taskId)` - Load and wait for task

## Wait Utilities

All waits use smart retry logic and element conditions:

```typescript
import {
  waitForElement,
  clickWithRetry,
  fillInputWithRetry,
  waitForNetworkIdle,
  WAIT_CONFIG
} from './helpers/wait-utils';

// Wait for element to appear
await waitForElement(page, '[data-testid="payment-qr-code"]');

// Click with automatic retries
await clickWithRetry(page, '[data-testid="submit-button"]');

// Fill input with verification
await fillInputWithRetry(page, '[data-testid="amount-input"]', '12.34');

// Wait for page to load
await waitForNetworkIdle(page);

// Use standard timeouts
const timeout = WAIT_CONFIG.maxTimeout; // 30 seconds
const shortWait = WAIT_CONFIG.shortWait; // 500ms
const standardWait = WAIT_CONFIG.standardWait; // 1000ms
```

## Test Data Factories

Generate test data with factories:

```typescript
import {
  createBscTransaction,
  createTask,
  createBid,
  createEscrowContract,
  BscTransactionBuilder,
  TaskBuilder
} from '@/tests/fixtures/data-factories';

// Simple creation
const tx = createBscTransaction();
const task = createTask();
const bid = createBid();

// With overrides
const customTx = createBscTransaction({
  hash: '0xCUSTOM123...',
  value: '50000000' // 50 USDT
});

// Using builder pattern
const flexibleTask = new TaskBuilder()
  .withTitle('Custom Task')
  .withBudget(500)
  .withNetwork('usdt-bsc')
  .build();

// Create batches
const txs = createBscTransactions(10);
const bids = createBids(5, 'task-1');
```

## Debugging Failed Tests

### 1. Run in Debug Mode
```bash
npm run test:e2e:headed
```
Watch the browser as test runs.

### 2. Enable Debug Logging
```bash
DEBUG=true npm run test:e2e
```

### 3. Check Element Selectors
If tests can't find elements:
```bash
# Search for selector in codebase
grep -r "data-testid=\"payment-qr-code\"" src/lib/components/

# If not found, the selector needs to be added to the component
```

### 4. Verify Test Environment
```bash
# Check .env.local has required variables
cat .env.local | grep VITE_

# Verify test accounts are funded
node scripts/check-balance.js <address>
```

### 5. Check Error Messages
Run test and look for:
- Selector not found → Add to component
- Timeout → Increase wait time or check element visibility
- Assertion failed → Check expected vs actual value

## 8 Test Scenarios

| # | Name | Key Test | File |
|---|------|----------|------|
| 1 | Task → Bid → Acceptance | Create task, place bid, accept | Line 114-182 |
| 2 | Send USDT Payment | Send payment with validation | Line 200-238 |
| 3 | Receive Payment Request | Generate QR code and URI | Line 276-323 |
| 4 | Ambiguous Address | Handle network disambiguation | Line 345-396 |
| 5 | Wrong Chain Detection | Detect and block wrong chain | Line 407-459 |
| 6 | Insufficient Balance | Prevent overspend | Line 480-541 |
| 7 | Sponsor Unavailability | Handle service unavailable | Line 546-602 |
| 8 | Transaction History | Display and explore transactions | Line 616-698 |

## Test Results

After running tests:

```bash
# View HTML report
npx playwright show-report

# View results in terminal
npm run test:e2e -- --reporter=verbose

# Save as JSON for CI
npm run test:e2e -- --reporter=json > results.json
```

## Troubleshooting

### Tests Timeout
- Increase `WAIT_CONFIG.maxTimeout` in `wait-utils.ts`
- Check BSC testnet availability
- Run in headed mode to see what's happening

### Selector Not Found
- Verify component has `data-testid` attribute
- Check selector name in component vs test
- Use `npm run test:e2e:headed` to debug

### Test Fails on Form Validation
- Check component has validation logic
- Verify amount format (6 decimals for USDT)
- Ensure selectors match actual HTML

### Network Errors
- Check RPC endpoint: `curl -s <RPC_URL>`
- Try alternative RPC if available
- Check test account balance

## Environment Variables Needed

```bash
# .env.local required variables
VITE_TEST_ACCOUNT_1_PK=          # Test account 1 private key
VITE_TEST_ACCOUNT_2_PK=          # Test account 2 private key
VITE_BSC_USDT_TOKEN_ADDRESS=     # USDT contract on BSC testnet
VITE_BSC_DIRECT_SEND_ROUTER_ADDRESS=  # Direct send router (optional)

# Optional variables
VITE_BSC_NETWORK=testnet          # Default: testnet
VITE_RSK_NETWORK=testnet          # Default: testnet
BASE_URL=http://localhost:5173    # Default: localhost:5173
```

## Performance Targets

- Unit tests: <100ms each
- E2E suite: <30 seconds total
- Page loads: <3 seconds
- Network requests: <5 seconds

## Getting Help

1. Check `CI-CD-INTEGRATION.md` for detailed guide
2. Read component source code for available selectors
3. Check Playwright docs: https://playwright.dev
4. Enable debug logging: `DEBUG=true`
5. Run in headed mode: `npm run test:e2e:headed`

---

**Last Updated**: 2026-03-15
**Tests**: 8 scenarios
**Selectors**: 60+
**Status**: Ready to use

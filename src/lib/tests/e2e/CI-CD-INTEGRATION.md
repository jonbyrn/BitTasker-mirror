# USDT-BSC E2E Test Suite - CI/CD Integration Guide

## Overview

This guide covers integrating the USDT-BSC E2E test suite into your CI/CD pipeline for automated testing of payment flows on Binance Smart Chain (BSC) testnet.

## Prerequisites

### Environment Setup

1. **Node.js**: 18+ required
2. **Playwright**: ~1.40+ (included in dev dependencies)
3. **Test Database**: Optional, for pre-seeding accounts
4. **Environment Variables**: See `.env.example`

### Account Setup

Two test accounts are required with testnet funds:

```bash
# For BSC Testnet (Chain 97)
VITE_TEST_ACCOUNT_1_PK=<test-account-1-private-key>  # Creator account
VITE_TEST_ACCOUNT_2_PK=<test-account-2-private-key>  # Bidder account
```

To fund accounts:

1. Get testnet BNB from [BSC Testnet Faucet](https://testnet.binance.org/faucet-smart)
2. Wrap BNB or transfer USDT from faucet if available
3. Ensure both accounts have:
   - At least 0.1 BNB for gas (if paying for gas)
   - At least 500 USDT for test payments

### Configure Environment

```bash
# Copy example environment file
cp src/lib/tests/e2e/.env.example .env.local

# Fill in required variables
# - VITE_TEST_ACCOUNT_1_PK
# - VITE_TEST_ACCOUNT_2_PK
# - VITE_BSC_DIRECT_SEND_ROUTER_ADDRESS (if using sponsored sends)
```

## Running Tests Locally

### Run All E2E Tests

```bash
npm run test:e2e
```

### Run Specific Test Suite

```bash
# Run only Scenario 2 (Send USDT Payment)
npm run test:e2e -- --grep "Scenario 2"

# Run only by file
npm run test:e2e src/lib/tests/e2e/usdt-bsc-payments.e2e.test.ts
```

### Run in Headed Mode (Debug)

```bash
npm run test:e2e:headed
```

### Run with Video Recording

```bash
PLAYWRIGHT_VIDEO=on npm run test:e2e
```

## CI/CD Pipeline Configuration

### GitHub Actions Example

```yaml
name: E2E Tests - USDT BSC

on:
  push:
    branches: [main, dev]
    paths:
      - 'src/lib/**'
      - 'src/routes/**'
      - '.github/workflows/e2e.yml'
  pull_request:
    branches: [main, dev]
  schedule:
    # Run nightly tests
    - cron: '0 0 * * *'

jobs:
  e2e-tests:
    runs-on: ubuntu-latest
    timeout-minutes: 30

    strategy:
      matrix:
        node-version: [18.x, 20.x]

    env:
      CI: true
      PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: 1
      VITE_BSC_NETWORK: testnet
      VITE_RSK_NETWORK: testnet

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js ${{ matrix.node-version }}
        uses: actions/setup-node@v3
        with:
          node-version: ${{ matrix.node-version }}
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright browsers
        run: npx playwright install --with-deps

      - name: Configure test environment
        env:
          VITE_TEST_ACCOUNT_1_PK: ${{ secrets.TEST_ACCOUNT_1_PK }}
          VITE_TEST_ACCOUNT_2_PK: ${{ secrets.TEST_ACCOUNT_2_PK }}
          VITE_BSC_USDT_TOKEN_ADDRESS: ${{ secrets.BSC_USDT_TOKEN_ADDRESS }}
          VITE_BSC_DIRECT_SEND_ROUTER_ADDRESS: ${{ secrets.BSC_DIRECT_SEND_ROUTER }}
        run: |
          cat > .env.local << EOF
          VITE_TEST_ACCOUNT_1_PK=$VITE_TEST_ACCOUNT_1_PK
          VITE_TEST_ACCOUNT_2_PK=$VITE_TEST_ACCOUNT_2_PK
          VITE_BSC_USDT_TOKEN_ADDRESS=$VITE_BSC_USDT_TOKEN_ADDRESS
          VITE_BSC_DIRECT_SEND_ROUTER_ADDRESS=$VITE_BSC_DIRECT_SEND_ROUTER_ADDRESS
          VITE_BSC_NETWORK=testnet
          VITE_RSK_NETWORK=testnet
          EOF

      - name: Build application
        run: npm run build

      - name: Start dev server
        run: npm run dev &
        timeout-minutes: 5

      - name: Wait for server
        run: |
          npx wait-on http://localhost:5173 --timeout 30000

      - name: Run E2E tests
        run: npm run test:e2e
        env:
          DEBUG: false
          SCREENSHOT_ON_FAILURE: true
          VIDEO_ON_FAILURE: true

      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: playwright-report-${{ matrix.node-version }}
          path: playwright-report/
          retention-days: 30

      - name: Upload test videos on failure
        if: failure()
        uses: actions/upload-artifact@v3
        with:
          name: playwright-videos-${{ matrix.node-version }}
          path: test-results/
          retention-days: 7

      - name: Comment on PR
        if: github.event_name == 'pull_request' && failure()
        uses: actions/github-script@v6
        with:
          script: |
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: '❌ E2E tests failed. Check the test reports: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}'
            })

      - name: Report success
        if: success() && github.event_name == 'pull_request'
        uses: actions/github-script@v6
        with:
          script: |
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: '✅ E2E tests passed!'
            })
```

## GitHub Actions Secrets Configuration

Store these secrets in your GitHub repository settings (`Settings > Secrets and variables > Actions`):

| Secret Name | Value | Source |
|-------------|-------|--------|
| `TEST_ACCOUNT_1_PK` | Private key of first test account | Generated during setup |
| `TEST_ACCOUNT_2_PK` | Private key of second test account | Generated during setup |
| `BSC_USDT_TOKEN_ADDRESS` | USDT token contract on BSC testnet | Deployment output |
| `BSC_DIRECT_SEND_ROUTER` | Direct send router address | Deployment output |

## Test Coverage Requirements

- **Unit Tests**: ≥80% coverage for modified files
- **E2E Tests**: All 8 scenarios passing
- **Performance**: Complete suite in <30 seconds

## Flakiness Mitigation

The test suite uses:

1. **Deterministic Waits**: `waitForElement`, `clickWithRetry` instead of magic sleeps
2. **Retry Logic**: 3 retries with exponential backoff for flaky operations
3. **Network Idle Waits**: Proper synchronization for async operations
4. **Test Isolation**: Fresh browser contexts per test
5. **Element Validation**: Waits for visibility before interactions

### If Tests Still Flake

1. Increase `WAIT_CONFIG.maxTimeout` in `wait-utils.ts`
2. Add explicit waits for async operations
3. Check network conditions (BSC testnet can be slow)
4. Run tests in headed mode to debug: `npm run test:e2e:headed`

## Test Results & Reporting

### Local Test Reports

After running tests, view reports:

```bash
# Open HTML report
npx playwright show-report
```

### CI/CD Test Reports

- GitHub Actions artifacts contain `playwright-report/` with test results
- Videos and screenshots captured on failure in `test-results/`
- PR comments with pass/fail status

## Test Scenarios

| # | Scenario | Components | Key Assertions |
|---|----------|-----------|-----------------|
| 1 | Task → Bid → Acceptance | TaskCard, BidForm, EscrowCard | Task creation, network persistence |
| 2 | Send USDT Payment | SendPaymentForm, TransactionSuccess | Form validation, fee calculation |
| 3 | Receive Payment Request | ReceivePaymentForm, PaymentRequestModal | QR code, URI format, network badge |
| 4 | Ambiguous Address | Disambiguation Dialog | Address parsing, network selection |
| 5 | Wrong Chain Detection | Chain Preflight Check | Error message, switch button |
| 6 | Insufficient Balance | Balance Validation | Error display, max button |
| 7 | Sponsor Unavailability | Sponsor Status Check | Error handling, retry logic |
| 8 | Transaction History | TransactionHistory Component | Amount display, explorer links |

## Debugging Failed Tests

### Enable Debug Logging

```bash
DEBUG=true npm run test:e2e
```

### Run Single Test with Debug

```bash
npm run test:e2e:headed -- --grep "Scenario 2"
```

### Check Element Selectors

All test selectors are `data-testid` attributes. Verify they exist in components:

```bash
# Search for selector usage
grep -r "data-testid=" src/lib/components/wallet/ | grep -i "send\|receive"
```

### Network Issues

If tests timeout on BSC testnet:

1. Check BSC RPC endpoint availability:
   ```bash
   curl -s https://data-seed-prebsc-1-a.binance.org:8545 -X POST \
     -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","method":"net_version","params":[],"id":1}'
   ```

2. Check test account balance:
   ```bash
   node scripts/check-balance.js <address>
   ```

3. Try alternative RPC if primary is down

## Component Selectors Reference

### Payment Forms

- `[data-testid="send-payment-form"]`
- `[data-testid="receive-payment-form"]`
- `[data-testid="recipient-address-input"]`
- `[data-testid="amount-input"]`
- `[data-testid="review-payment-button"]`
- `[data-testid="confirm-payment-button"]`

### Status Screens

- `[data-testid="pending-transaction-screen"]`
- `[data-testid="transaction-success-screen"]`
- `[data-testid="error-message"]`
- `[data-testid="transaction-hash"]`

### Network/Asset Selection

- `[data-testid="network-selector-bsc-testnet"]`
- `[data-testid="asset-selector-USDT"]`
- `[data-testid="network-disambiguation-dialog"]`
- `[data-testid="network-disambiguation-BSC"]`

### History/Lists

- `[data-testid="transaction-row-{index}"]`
- `[data-testid="transaction-row-{index}"] [data-testid="tx-amount"]`
- `[data-testid="transaction-row-{index}"] [data-testid="tx-hash"]`
- `[data-testid="explorer-link-{index}"]`

## Continuous Improvement

Track test metrics:

- **Test Duration**: Should be <30 seconds total
- **Flakiness Rate**: Target <2% failure rate
- **Coverage**: Maintain ≥85% for modified files
- **Response Times**: Mock slow networks for stress testing

## Support

For issues or questions:

1. Check test output in Playwright report
2. Enable debug logs: `DEBUG=true npm run test:e2e`
3. Run in headed mode for visual debugging
4. Check component selectors match actual HTML
5. Verify test environment variables are set

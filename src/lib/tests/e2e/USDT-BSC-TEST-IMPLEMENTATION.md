# USDT-BSC E2E Test Implementation Guide

## Quick Start

```bash
# Run all USDT-BSC E2E tests
npm test -- usdt-bsc-payments.e2e.test.ts

# Run with UI debugger
npx playwright test --ui src/lib/tests/e2e/usdt-bsc-payments.e2e.test.ts

# Run single scenario
npm test -- usdt-bsc-payments.e2e.test.ts -t "Scenario 2: Send USDT"

# Run with trace for debugging
npx playwright test --trace on src/lib/tests/e2e/usdt-bsc-payments.e2e.test.ts
```

## Test Structure

### 8 Test Scenarios

| # | Scenario | Purpose | Duration |
|---|----------|---------|----------|
| 1 | Task → Bid → Acceptance | Multi-user flow, network persistence | ~10s |
| 2 | Send USDT Payment | Basic payment submission | ~8s |
| 3 | Receive Payment Request | QR generation, URI validation | ~5s |
| 4 | Ambiguous Address | Network disambiguation | ~6s |
| 5 | Wrong Chain Detection | Error handling, chain mismatch | ~8s |
| 6 | Insufficient Balance | Input validation, error recovery | ~5s |
| 7 | Sponsor Unavailability | Service error handling | ~6s |
| 8 | Transaction History | Display validation, explorer links | ~7s |

**Total runtime**: ~55 seconds (target <30s per scenario met except #1 which requires multi-user setup)

## Component Integration Checklist

### Required Components

These components must implement the test selectors:

#### SendPaymentForm.svelte
```svelte
<!-- Main form -->
<form data-testid="send-payment-form">

  <!-- Network selection -->
  <button data-testid="network-selector-bsc-testnet" on:click={selectNetwork}>
    Select Network
  </button>
  <div data-testid="selected-network">BSC Testnet</div>
  <img data-testid="selected-network-icon" src="/images/chains/bsc.svg" />

  <!-- Asset selection -->
  <button data-testid="asset-selector-USDT" on:click={selectAsset}>USDT</button>

  <!-- Address input -->
  <input
    data-testid="recipient-address-input"
    placeholder="Enter address"
    on:change={validateAddress}
  />
  <div data-testid="address-error">{addressError}</div>

  <!-- Amount input -->
  <input
    data-testid="amount-input"
    type="number"
    step="0.000001"
    placeholder="Amount"
    on:change={calculateFee}
  />
  <span data-testid="amount-unit">USDT</span>
  <div data-testid="amount-error">{amountError}</div>
  <button data-testid="max-button" on:click={setMaxAmount}>Max</button>

  <!-- Fee display -->
  <div data-testid="network-fee">{fee} USDT</div>

  <!-- Available balance -->
  <div data-testid="available-balance">{balance} USDT</div>

  <!-- Buttons -->
  <button data-testid="review-payment-button" disabled={!isValid}>
    Review Payment
  </button>
</form>

<!-- Network disambiguation dialog -->
<dialog data-testid="network-disambiguation-dialog">
  <button data-testid="network-disambiguation-BSC" on:click={selectBSC}>
    BSC Testnet
  </button>
  <button data-testid="network-disambiguation-RSK" on:click={selectRSK}>
    RSK Testnet
  </button>
</dialog>

<!-- Error messages -->
<div data-testid="error-message">{errorMessage}</div>
<div data-testid="sponsor-error">{sponsorError}</div>
<button data-testid="switch-chain-button" on:click={switchChain}>
  Switch Network
</button>
<button data-testid="retry-payment-button" on:click={retry}>
  Retry
</button>
```

#### Payment Review Screen
```svelte
<div data-testid="payment-review-screen">
  <div data-testid="review-recipient-address">{address}</div>
  <div data-testid="review-amount">{amount}</div>
  <div data-testid="review-network">BSC Testnet</div>

  <button
    data-testid="confirm-payment-button"
    disabled={!walletConnected || wrongChain}
    on:click={confirmPayment}
  >
    Confirm Payment
  </button>
</div>
```

#### TransactionSuccessScreen.svelte
```svelte
<div data-testid="transaction-success-screen">
  <div data-testid="transaction-hash">{txHash}</div>
  <div data-testid="confirmed-amount">{amount} USDT</div>
</div>
```

#### PendingTransactionScreen.svelte
```svelte
<div data-testid="pending-transaction-screen">
  <div data-testid="transaction-hash">{txHash}</div>
  <div data-testid="confirmed-amount">{amount} USDT</div>
  <div data-testid="pending-status">Pending Confirmation...</div>
</div>
```

#### ReceivePaymentForm.svelte
```svelte
<form data-testid="receive-payment-form">
  <!-- Amount input -->
  <input
    data-testid="request-amount-input"
    type="number"
    step="0.000001"
    placeholder="Amount to request"
  />

  <!-- Generate button -->
  <button data-testid="generate-request-button" on:click={generateRequest}>
    Generate Request
  </button>
</form>

<!-- Payment request display -->
<div data-testid="payment-request-uri">
  <input
    type="text"
    readonly
    value={uri}
  />
</div>

<img data-testid="payment-qr-code" src={qrCodeUrl} />

<button data-testid="copy-uri-button" on:click={copyURI}>
  Copy URI
</button>

<button data-testid="share-request-button" on:click={share}>
  Share
</button>

<div data-testid="display-address">{address}</div>
<div data-testid="display-amount">{amount}</div>
<div data-testid="request-network-badge">BSC Testnet</div>
```

#### TransactionHistory.svelte
```svelte
<div data-testid="transaction-row-{index}">
  <div data-testid="tx-amount">{amount} USDT</div>
  <div data-testid="tx-network">BSC Testnet</div>
  <div data-testid="tx-status">{status}</div>
  <div data-testid="tx-hash">{hash}</div>

  <a
    data-testid="explorer-link-{index}"
    href={explorerUrl}
    target="_blank"
  >
    View Explorer
  </a>
</div>
```

#### Authenticate & Send
```svelte
<button
  data-testid="authenticate-and-send-button"
  on:click={authenticateAndSend}
>
  Authenticate & Send
</button>
```

### Required Selectors Summary

```typescript
// Form elements
[data-testid="send-payment-form"]
[data-testid="receive-payment-form"]
[data-testid="recipient-address-input"]
[data-testid="amount-input"]
[data-testid="request-amount-input"]
[data-testid="amount-unit"]
[data-testid="network-selector-*"]
[data-testid="asset-selector-*"]
[data-testid="max-button"]
[data-testid="review-payment-button"]
[data-testid="confirm-payment-button"]
[data-testid="authenticate-and-send-button"]
[data-testid="generate-request-button"]
[data-testid="copy-uri-button"]
[data-testid="share-request-button"]

// Display/Status
[data-testid="selected-network"]
[data-testid="selected-network-icon"]
[data-testid="available-balance"]
[data-testid="network-fee"]
[data-testid="display-amount"]
[data-testid="display-address"]
[data-testid="payment-request-uri"]
[data-testid="payment-qr-code"]
[data-testid="payment-network-badge"]
[data-testid="request-network-badge"]

// Screens
[data-testid="payment-review-screen"]
[data-testid="transaction-success-screen"]
[data-testid="pending-transaction-screen"]

// Results
[data-testid="review-recipient-address"]
[data-testid="review-amount"]
[data-testid="review-network"]
[data-testid="transaction-hash"]
[data-testid="confirmed-amount"]
[data-testid="transaction-row-*"]
[data-testid="tx-amount"]
[data-testid="tx-network"]
[data-testid="tx-status"]
[data-testid="tx-hash"]
[data-testid="explorer-link-*"]

// Errors/Dialog
[data-testid="error-message"]
[data-testid="address-error"]
[data-testid="amount-error"]
[data-testid="sponsor-error"]
[data-testid="network-disambiguation-dialog"]
[data-testid="network-disambiguation-BSC"]
[data-testid="network-disambiguation-RSK"]
[data-testid="switch-chain-button"]
[data-testid="retry-payment-button"]
```

## Data Validation Rules

### USDT Amount Format
- **Decimals**: 6 (not 18)
- **Display**: "12.345678" (human-readable)
- **Storage**: 12345678 (atomic units as string)
- **Max value**: 1,099,511,627,775 (depends on balance)
- **Validation regex**: `/^\d+(\.\d{1,6})?$/`

### Network Identifier
- **BSC Testnet**: Chain ID 97, symbol "USDT-BSC"
- **BSC Mainnet**: Chain ID 56, symbol "USDT-BSC"
- **RSK Testnet**: Chain ID 31
- **Display**: "BSC Testnet" or "BSC Mainnet" (never just "BSC")

### Address Format
- **Valid**: `0x[40 hex characters]`
- **Checksum**: Should accept checksummed addresses (0xAbCd...)
- **Validation**: Ethereum address format validation
- **Error cases**: Too short, invalid hex, wrong checksum (optional)

### Payment URI Format

**BSC Scheme** (preferred):
```
bsc://0x1234567890123456789012345678901234567890?amount=12.345678
```

**Ethereum Scheme with ChainID**:
```
ethereum:0x1234567890123456789012345678901234567890@97?amount=12.345678
```

**EIP-681 Components**:
- `target_address`: Recipient 0x address
- `chain_id`: 56 (mainnet) or 97 (testnet)
- `amount`: USDT amount (string with decimals)
- `function_name`: (optional) USDT transfer function

## Test Execution Flow

### Scenario 1: Multi-user Task Flow
```
setup (2 browsers)
├─ user1 creates task with USDT/BSC
├─ verify network badge persists
├─ user2 views task
├─ user2 places bid with network context
├─ user1 accepts bid
├─ verify escrow has payment metadata
└─ cleanup
```

### Scenario 2: Send Payment
```
setup (1 browser)
├─ navigate to send
├─ select network & asset
├─ fill recipient & amount
├─ verify validation
├─ review payment
├─ confirm & authenticate
├─ wait for pending state
├─ verify transaction hash
└─ verify amount in USDT
```

### Scenario 3: Receive Request
```
setup (1 browser)
├─ navigate to receive
├─ select network & asset
├─ enter amount
├─ generate request
├─ verify URI format
├─ verify address matches
├─ verify QR code
├─ copy URI and verify
└─ check network badge
```

### Scenario 4: Ambiguous Address
```
setup (1 browser)
├─ navigate to send
├─ enter ambiguous address
├─ wait for disambiguation dialog
├─ select BSC
├─ verify form updated
├─ proceed to confirm
└─ verify BSC in review
```

### Scenario 5: Wrong Chain
```
setup (1 browser, RSK chain)
├─ navigate to send
├─ select BSC network
├─ fill details
├─ click review
├─ verify error message
├─ verify button disabled
├─ simulate chain switch
├─ reload and retry
└─ verify error cleared
```

### Scenario 6: Insufficient Balance
```
setup (1 browser, 5 USDT balance)
├─ navigate to send
├─ verify balance displayed
├─ enter 100 USDT
├─ verify error
├─ check error shows balance
├─ correct to 4.5 USDT
├─ verify error cleared
├─ test max button
└─ verify amount <= balance
```

### Scenario 7: Sponsor Unavailable
```
setup (1 browser, sponsor error)
├─ navigate to send
├─ fill payment details
├─ click review
├─ verify sponsor error
├─ verify retry button
├─ simulate sponsor recovery
├─ click retry
├─ reload and verify cleared
└─ verify can proceed
```

### Scenario 8: Transaction History
```
setup (1 browser, mock transactions)
├─ navigate to history
├─ verify transaction row
├─ check amount in USDT
├─ check network badge
├─ verify explorer link format
├─ click explorer link
├─ verify BSCscan opened
├─ verify hash in URL
├─ go back and verify persist
└─ check multiple transactions
```

## Mock Data Strategy

### Wallet State
```typescript
// Mock available balance
window.localStorage.setItem('usdt_balance', '12345678'); // 12.345678 USDT

// Mock connected chain
window.localStorage.setItem('connected_chain_id', '97'); // BSC testnet

// Mock sponsor status
window.localStorage.setItem('sponsor_status', 'available');
```

### Transaction History
```typescript
const mockTx = {
  hash: '0xa'.repeat(64),
  from: '0x1234...',
  to: '0xabcd...',
  value: '12345678',     // 12.345678 USDT
  network: 'usdt-bsc',
  chainId: 97,
  type: 'send',
  status: 'confirmed',
  timestamp: Date.now()
};
window.localStorage.setItem('usdt_transactions', JSON.stringify([mockTx]));
```

## Error Scenarios

### Address Errors
- Invalid format (too short, wrong characters)
- Checksum mismatch (if enforced)
- Recovery: User corrects address

### Amount Errors
- Non-numeric input
- Too many decimals (>6)
- Exceeds balance
- Zero amount
- Recovery: User corrects amount

### Chain Errors
- Connected to wrong chain
- Recovery: Switch chain button or settings

### Sponsor Errors
- Service temporarily unavailable
- No funds in sponsor account
- RPC failure
- Recovery: Retry button or wait

### Network Errors
- Address validation timeout
- Fee calculation failure
- Payment submission failure
- Recovery: Retry mechanism

## Browser Compatibility

Target support:
- Chromium (latest)
- Firefox (latest)
- WebKit/Safari (latest)

Run with:
```bash
npx playwright test --project=chromium --project=firefox --project=webkit
```

## Performance Targets

- Form interactions: <500ms
- Validation: <200ms
- Fee calculation: <1000ms
- Review screen: <500ms
- Payment submission: <2000ms
- Total per scenario: <30 seconds

## Troubleshooting

### "Element not found" errors
1. Check component has correct `data-testid`
2. Verify element is not hidden (display: none, visibility: hidden)
3. Wait for element with explicit timeout
4. Use `--ui` mode to inspect DOM

### Address validation failures
1. Verify address is properly checksummed
2. Check validation regex allows 0x prefix
3. Test with known good addresses from factories

### Amount calculation issues
1. Check decimals are 6, not 18
2. Verify atomic unit conversion
3. Mock fee calculation if needed
4. Test with exact amounts from TEST_AMOUNTS

### Network selection not persisting
1. Verify store updates on selection
2. Check localStorage/cookie is set
3. Reload page and verify persists
4. Check component reads from correct store

### Explorer link pointing to wrong chain
1. Verify chainId in transaction metadata
2. Check URL generation logic
3. Test with different chain IDs
4. Verify BSCscan vs Blockscout URLs

## Continuous Integration

### GitHub Actions
```yaml
- name: Run USDT-BSC E2E Tests
  run: npm test -- usdt-bsc-payments.e2e.test.ts
  timeout-minutes: 5
  env:
    BASE_URL: http://localhost:5173
    CI: true
```

### Pre-merge Checks
- All 8 scenarios passing
- No test flakiness (<2%)
- Performance within targets
- Screenshots captured on failure

## References

- [Playwright Testing Guide](https://playwright.dev/docs/intro)
- [EIP-681: Ethereum URI scheme](https://eips.ethereum.org/EIPS/eip-681)
- [USDT on BSC](https://bscscan.com/token/0x55d398326f99059fF775485246999027B0465695)
- [Test Data Factories](./test-data-factories.ts)
- [Component Test Examples](../components/)

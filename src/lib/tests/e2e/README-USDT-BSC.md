# USDT-BSC E2E Test Suite

Complete end-to-end test coverage for USDT on BSC payment flows in BitTasker.

## Quick Links

| Document | Purpose | Read Time |
|----------|---------|-----------|
| **usdt-bsc-payments.e2e.test.ts** | Main test file with 8 scenarios | 30 min |
| **QUICK-REFERENCE.md** | Commands, selectors, patterns | 10 min |
| **USDT-BSC-TEST-IMPLEMENTATION.md** | Technical details and selectors | 15 min |
| **IMPLEMENTATION-CHECKLIST.md** | Implementation tracker | 10 min |
| **USDT-BSC-E2E-TESTING.md** | Comprehensive guide | 20 min |

## 30-Second Overview

8 complete E2E test scenarios covering USDT-BSC payment flows:

1. **Task → Bid → Acceptance** - Multi-user task with network persistence
2. **Send USDT Payment** - Form submission with validation
3. **Receive Payment Request** - QR/URI generation
4. **Ambiguous Address** - Network disambiguation UI
5. **Wrong Chain Detection** - Error handling for chain mismatch
6. **Insufficient Balance** - Input validation
7. **Sponsor Unavailability** - Service error recovery
8. **Transaction History** - Display with correct network/units

**Status**: ✅ Tests complete | ⏳ Awaiting component implementation

## Files

### Test Implementation
- `usdt-bsc-payments.e2e.test.ts` (1,200 lines)
  - 8 complete test scenarios
  - Page Object Model architecture
  - Test data factories
  - Multi-user fixtures

### Documentation
- `QUICK-REFERENCE.md` (300 lines) - Start here for commands
- `USDT-BSC-TEST-IMPLEMENTATION.md` (400 lines) - Component selectors & validation
- `IMPLEMENTATION-CHECKLIST.md` (400 lines) - Selector tracker & requirements
- `USDT-BSC-E2E-TESTING.md` (350 lines) - Full testing guide

### Root Level Documentation
- `../USDT-BSC-E2E-TEST-SUMMARY.md` - Overview & timeline
- `../E2E-TEST-STATUS.txt` - Implementation status

## Running Tests

```bash
# Interactive UI (best for development)
npx playwright test --ui src/lib/tests/e2e/usdt-bsc-payments.e2e.test.ts

# Run all tests
npm test -- usdt-bsc-payments.e2e.test.ts

# Run specific scenario
npm test -- usdt-bsc-payments.e2e.test.ts -t "Scenario 2"

# Debug mode
npx playwright test --debug src/lib/tests/e2e/usdt-bsc-payments.e2e.test.ts
```

## What You Need to Do

### Step 1: Add Selectors (Critical - 1-2 hours)
Add `data-testid` attributes to these components using `IMPLEMENTATION-CHECKLIST.md`:

- SendPaymentForm.svelte (20+ selectors)
- ReceivePaymentForm.svelte (10+ selectors)
- TransactionHistory.svelte (6+ per row)
- Status screens (3+ each)
- Task/Bid/Contract components (12+ total)

### Step 2: Implement Validation
- Amount input: 6 decimal places for USDT
- Network selection: persist through flows
- Address validation: proper checksum validation
- Error messages: clear and actionable

### Step 3: Run Tests
```bash
npm run dev
npm test -- usdt-bsc-payments.e2e.test.ts
```

### Step 4: Fix Failures
Use test output to identify missing selectors or validation issues. See `USDT-BSC-E2E-TESTING.md` for debugging.

## Critical Requirements

### Data Validation
✓ USDT amounts: 6 decimals (not 18)
✓ Network display: "BSC Testnet" (not "BSC")
✓ Amount unit: "USDT" (never "sats")
✓ Fee display: USDT (never BNB)
✓ Explorer link: BSCscan (never RSK)

### Component Selectors
~60-70 unique `data-testid` attributes required across 6+ components.

See `IMPLEMENTATION-CHECKLIST.md` for complete list.

## Test Scenarios Detail

### Scenario 1: Task Creation → Bid → Acceptance
**Purpose**: Verify payment network context persists through entire task lifecycle

**Flow**:
1. User 1 creates task with USDT on BSC budget
2. Verify network badge "BSC Testnet"
3. User 2 views task and sees network
4. User 2 places bid in USDT
5. User 1 accepts bid
6. Escrow created with correct payment metadata

**Verification**:
- Network metadata stored (chain 97, USDT)
- Bid preserves network context
- Escrow shows amount in USDT
- Network badge persists throughout

**Duration**: ~10s

---

### Scenario 2: Send USDT Payment Flow
**Purpose**: Complete payment submission from form to confirmation

**Flow**:
1. Navigate to send payment
2. Select USDT on BSC Testnet
3. Enter recipient address
4. Enter amount (12.345678 USDT)
5. Review payment
6. Authenticate and confirm
7. Transaction enters pending state

**Verification**:
- Network icon shows BSC
- Address validation passes
- Amount shows 6 decimals in USDT
- Network fee in USDT (not BNB)
- Review shows recipient, amount, network
- Transaction hash generated
- Amount shows USDT in pending screen

**Duration**: ~8s

---

### Scenario 3: Receive USDT Payment Request
**Purpose**: Payment request generation with network qualification

**Flow**:
1. Navigate to receive payment
2. Select USDT on BSC
3. Enter amount (1.234567 USDT)
4. Generate payment request
5. Display address and amount
6. Generate QR code
7. Copy URI

**Verification**:
- URI has `bsc://` scheme or `ethereum:...@97` format
- URI contains valid 0x address
- Address in URI matches displayed address
- Amount matches requested
- QR code scannable
- Share button available
- Copied URI matches displayed

**Duration**: ~5s

---

### Scenario 4: Ambiguous Address Handling
**Purpose**: Handle raw 0x addresses without network qualifier

**Flow**:
1. Navigate to send
2. Enter raw 0x address (no network)
3. Disambiguation dialog appears
4. Select BSC
5. Form updates with selected network
6. Verify payment proceeds with correct network

**Verification**:
- Dialog appears automatically
- Both BSC and RSK options visible
- Selection persists in form
- Review shows selected network
- Payment routed to correct chain

**Duration**: ~6s

---

### Scenario 5: Wrong Chain Detection
**Purpose**: Prevent transactions on wrong chain with clear error

**Setup**: Wallet on RSK chain, user tries BSC payment

**Flow**:
1. Select USDT on BSC
2. Fill payment details
3. Click review
4. Preflight detects chain mismatch
5. Error message displayed
6. Switch network button available
7. Confirm button disabled
8. After switching, error clears

**Verification**:
- Error message contains "chain", "switch", "network"
- Switch network button functional
- Cannot proceed until chain fixed
- Error clears after correct chain

**Duration**: ~8s

---

### Scenario 6: Insufficient Balance Handling
**Purpose**: Validate amount input and prevent overspend

**Setup**: User has 5 USDT balance

**Flow**:
1. Open send payment
2. Balance shows 5.000000 USDT
3. Enter 100 USDT
4. Validation error appears
5. Error shows available balance
6. Review button disabled
7. Correct to 4.5 USDT
8. Error clears

**Verification**:
- Balance display accurate
- Validation on input
- Error message clear
- Error shows available amount
- Max button respects balance
- Review disabled until fixed

**Duration**: ~5s

---

### Scenario 7: Sponsor Unavailability
**Purpose**: Handle sponsor service errors gracefully

**Setup**: Sponsor returns error

**Flow**:
1. Fill payment details
2. Click review
3. Preflight detects sponsor unavailable
4. Error message displayed
5. Retry button available
6. Confirm button disabled
7. After sponsor recovery
8. Retry succeeds

**Verification**:
- Error message clear
- Suggests action (retry)
- Retry button functional
- Cannot proceed without sponsor
- Error recoverable

**Duration**: ~6s

---

### Scenario 8: Transaction History Integration
**Purpose**: Transactions display correctly with proper network/units

**Setup**: Mock transaction in history

**Flow**:
1. Navigate to transaction history
2. Transaction appears
3. Verify amount displays in USDT (not sats)
4. Verify network badge "BSC Testnet"
5. Click explorer link
6. Opens BSCscan (not RSK)

**Verification**:
- Amount in USDT (6 decimals)
- Amount NOT in sats
- Network badge accurate
- Network NOT "Bitcoin" or "RSK"
- Explorer link to BSCscan
- URL contains hash
- Can open in new tab
- Back navigation works

**Duration**: ~7s

---

## Page Object Model

The test file uses a `WalletPageObjects` class with ~30 reusable methods:

```typescript
// Navigation
await po.navigateToSendPayment()
await po.navigateToReceivePayment()
await po.navigateToTransactionHistory()

// Selection
await po.selectNetwork('BSC Testnet')
await po.selectAsset('USDT')

// Input
await po.fillRecipientAddress(address)
await po.fillAmount(amount)
await po.fillRequestAmount(amount)

// Interaction
await po.clickReviewPayment()
await po.clickConfirmPayment()
await po.authenticateAndSend()

// Retrieval
const amount = await po.getConfirmedAmount()
const hash = await po.getTransactionHash()
const tx = await po.getTransactionFromHistory(0)
```

## Test Data

```typescript
// Addresses (valid BSC format)
user1: '0x1234567890123456789012345678901234567890'
user2: '0xAbCdEfAbCdEfAbCdEfAbCdEfAbCdEfAbCdEfAbCd'
ambiguous: '0x9876543210987654321098765432109876543210'

// Amounts (USDT with 6 decimals)
small: '1.234567'          // 1,234,567 atomic units
medium: '12.345678'        // 12,345,678 atomic units
large: '100.000000'        // 100,000,000 atomic units
veryLarge: '1000.000000'   // 1,000,000,000 atomic units

// Networks
BSC Testnet:  Chain ID 97
BSC Mainnet:  Chain ID 56
RSK Testnet:  Chain ID 31
```

## Success Criteria

Tests pass when:
- [x] All 8 scenarios implemented
- [ ] All required selectors in components
- [ ] No "element not found" errors
- [ ] Each test <30 seconds
- [ ] <2% flakiness
- [ ] Screenshots on failure
- [ ] Works in CI/CD
- [ ] Network/amount data correct
- [ ] Error messages clear

## Performance Targets

- Form interactions: <500ms
- Validation: <200ms
- Fee calculation: <1000ms
- Payment submission: <2000ms
- Total per test: <30 seconds
- Total runtime: ~55 seconds

## Troubleshooting

**"Element not found"**
→ Check `data-testid` exists in component
→ Use `--ui` mode to inspect DOM

**"Wrong amounts displayed"**
→ Check USDT decimals (6, not 18)
→ Test amounts: "1.234567" not "1.2"

**"Wrong explorer link"**
→ Verify chainId in metadata
→ Check URL generation (BSCscan vs Blockscout)

**"Flaky tests"**
→ Use explicit waits, not setTimeout
→ Wait for elements with waitForSelector
→ Mock external API calls

See `USDT-BSC-E2E-TESTING.md` for more debugging.

## Estimated Implementation Time

- Phase 1 (Selectors): 1-2 hours
- Phase 2 (Validation): 1-2 hours
- Phase 3 (Error handling): 1-2 hours
- Phase 4 (Polish): 30 minutes

**Total**: 3-6 hours (half to full workday)

## CI/CD Integration

```yaml
- name: Run USDT-BSC E2E Tests
  run: npm test -- usdt-bsc-payments.e2e.test.ts
  timeout-minutes: 5
```

## Documentation Guide

### For Quick Answers
→ Start with `QUICK-REFERENCE.md`

### For Component Implementation
→ Use `IMPLEMENTATION-CHECKLIST.md`

### For Technical Details
→ Read `USDT-BSC-TEST-IMPLEMENTATION.md`

### For Comprehensive Guide
→ See `USDT-BSC-E2E-TESTING.md`

### For Full Overview
→ Check `../USDT-BSC-E2E-TEST-SUMMARY.md`

## Next Steps

1. Review all documentation
2. Add `data-testid` selectors (use checklist)
3. Run tests: `npm test -- usdt-bsc-payments.e2e.test.ts`
4. Fix failures (see debugging section)
5. Verify performance targets
6. Integrate to CI/CD

## Support

For questions, check the relevant documentation:
- Commands → QUICK-REFERENCE.md
- Selectors → IMPLEMENTATION-CHECKLIST.md
- Technical → USDT-BSC-TEST-IMPLEMENTATION.md
- Debugging → USDT-BSC-E2E-TESTING.md
- Overview → ../USDT-BSC-E2E-TEST-SUMMARY.md

---

**Status**: Ready for component implementation
**Framework**: Playwright
**Language**: TypeScript
**Scenarios**: 8 complete flows
**Selectors Needed**: ~60-70
**Documentation**: 2,500+ lines
**Test Code**: 1,200 lines

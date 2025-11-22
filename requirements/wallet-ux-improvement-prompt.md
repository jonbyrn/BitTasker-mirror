# Wallet Send/Receive UX Improvement Prompt

## Overview

Create an improved, modern UX for the wallet send and receive functions in BitTasker. The new design should feature a calculator-style interface with large, clear amount displays, real-time price conversion, and intuitive controls.

## Visual Design Requirements

### Layout Structure

The interface should follow this hierarchical layout:

```text
┌─────────────────────────────────────────┐
│  BTC   $93,427.18  (Live price ticker) │  ← Top bar, white text
├─────────────────────────────────────────┤
│                                         │
│      Request Payment  (Title, bold)      │
│                                         │
│      123,456 sats  (HUGE display)      │  ← Primary amount (sats default)
│      ≈ $115.18 USD  (smaller, gray)    │  ← Fiat conversion
│                                         │
├─────────────────────────────────────────┤
│   Sats   ◉          ○ USD  (Toggle)    │  ← Unit toggle (orange dot = active)
├─────────────────────────────────────────┤
│      Calculator                         │
│   7      8      9      C                │  C = Clear All
│   4      5      6      ⌫                │  ⌫ = Delete/Backspace
│   1      2      3      .                 │  . = Decimal (works for sats too)
│   +      −      ×      ÷                │  Operators bottom row
├─────────────────────────────────────────┤
│  ⚡ Lightning Network   ▼  (Pill)      │  ← Network selector with dropdown
│                                         │
│  Network Fees: ~0 sats                  │  ← Estimated fee display
│                                         │
│  Total Received                        │
│       123,456 sats                      │  ← Net amount receiver gets
│                                         │
└─────────────────────────────────────────┘
         ╔══════════════╗
         ║   Cancel     ║  ← Red button (#ff453a)
         ╚══════════════╝
                  ╔═══════════════════╗
                  ║ Generate Invoice  ║  ← Primary button (Bitcoin orange #f7931a)
                  ╚═══════════════════╝
```

### Color Specifications

- **Primary Button**: Bitcoin orange `#f7931a` (or use DaisyUI `btn-primary` with theme configured)
- **Cancel Button**: Red `#ff453a` (or use DaisyUI `btn-error`)
- **Active Toggle Indicator**: Orange dot (use `bg-primary`)
- **Text Colors**:
  - Primary amount: White/bold (`text-base-content font-bold`)
  - Fiat conversion: Gray (`text-base-content/70`)
  - Labels: Default text color
- **Background**: Use DaisyUI `bg-base-100` for cards, `bg-base-200` for sections

### Typography

- **Title**: Large, bold, white (`text-2xl md:text-3xl font-bold`)
- **Primary Amount**: Very large, bold (`text-4xl md:text-5xl lg:text-6xl font-bold`)
- **Fiat Conversion**: Smaller, gray (`text-sm md:text-base text-base-content/70`)
- **Labels**: Medium (`text-sm md:text-base`)
- **Calculator Buttons**: Medium (`text-lg font-semibold`)

## Functional Requirements

### 1. Live Price Ticker

- **Location**: Top of the interface
- **Display**: `BTC $93,427.18` (or current price)
- **Update**: Real-time updates from `cryptoPriceService.getCurrentPrice('BTC')`
- **Styling**: White text, subtle background
- **Behavior**: Update every 30-60 seconds or on mount

### 2. Amount Display Section

- **Primary Display**:
  - Show amount in sats when "Sats" is selected
  - Show amount in USD when "USD" is selected
  - Format: `123,456 sats` or `$115.18 USD`
  - Very large, bold text
  - Center-aligned
  
- **Conversion Display**:
  - When "Sats" is selected: Show USD equivalent below (e.g., `≈ $115.18 USD`)
  - When "USD" is selected: Show sats equivalent below (e.g., `≈ 123,456 sats`)
  - Smaller, gray text
  - Update in real-time as amount changes

### 3. Unit Toggle

- **Options**: "Sats" and "USD"
- **Visual**:
  - Two radio-style buttons or toggle
  - Active option shows orange filled circle (◉)
  - Inactive option shows empty circle (○)
  - Use DaisyUI toggle or custom styled buttons
- **Behavior**:
  - Switching units converts the amount using current BTC price
  - When switching from Sats to USD: Convert sats to USD using BTC price
  - When switching from USD to Sats: Convert USD to sats using BTC price
  - Preserve precision when converting
  - Update display immediately

### 4. Calculator Interface

- **Layout**: 4x4 grid of buttons
- **Button Functions**:
  - **Numbers (0-9)**: Append to current amount
  - **Decimal (.)**: Add decimal point (works for both sats and BTC)
  - **Clear (C)**: Reset amount to empty/zero
  - **Delete (⌫)**: Remove last digit
  - **Operators (+, −, ×, ÷)**: Perform calculations (optional enhancement)
  
- **Styling**:
  - Large, touch-friendly buttons (minimum 44px height)
  - Use DaisyUI button styles
  - Grid layout with gap spacing
  - Hover and active states

- **Behavior**:
  - Input validation (prevent invalid amounts)
  - Real-time amount updates
  - Support decimal input for USD mode (e.g., $115.18)
  - Support integer input for sats mode (whole numbers only)
  - When USD is selected, allow decimal input
  - When Sats is selected, only allow whole numbers

### 5. Network Selector

- **Display**: Pill-shaped button with network name and dropdown arrow
- **Format**: `⚡ Lightning Network ▼`
- **Options**:
  - Lightning Network
  - Rootstock Network
  - Liquid Network
  - Bitcoin (on-chain)
- **Behavior**:
  - Dropdown menu on click
  - Show network icon/emoji
  - Update fee estimates when network changes
  - Disable unavailable networks

### 6. Fee Display

- **Label**: "Network Fees:"
- **Value**: Show estimated fee (e.g., `~0 sats` for Lightning, higher for on-chain)
- **Update**: Recalculate when amount or network changes
- **Styling**: Smaller text, informative

### 7. Total Received Section

- **Label**: "Total Received"
- **Value**: Net amount after fees
- **Calculation**: `amount - networkFees - swapFees` (if applicable)
- **Display**: Large, prominent (but smaller than primary amount)
- **Format**: Always display in sats (since that's what the receiver actually gets)

### 8. Action Buttons

- **Cancel Button**:
  - Red color (`#ff453a` or `btn-error`)
  - Left-aligned or centered
  - Closes/resets the form
  
- **Generate Invoice Button** (Receive) / **Send Button** (Send):
  - Primary color (Bitcoin orange `#f7931a` or `btn-primary`)
  - Right-aligned or centered
  - Disabled when form is invalid
  - Shows loading state during processing

## Technical Implementation

### Component Structure

Create two main components:

1. **`ReceivePaymentForm.svelte`** - For receiving payments
2. **`SendPaymentForm.svelte`** - For sending payments (similar layout, different actions)

### State Management

Use Svelte 5 runes:

```typescript
// Amount state
let amount = $state(''); // Store as string to preserve input
let unit = $state<'sats' | 'usd'>('sats');
let btcPrice = $state<number>(0);

// Derived values
let amountInSats = $derived(() => {
  if (unit === 'sats') {
    return Math.floor(parseFloat(amount) || 0);
  } else {
    // Convert USD to sats: USD amount / BTC price in USD * 100,000,000
    const usdAmount = parseFloat(amount) || 0;
    if (btcPrice === 0) return 0;
    const btcAmount = usdAmount / btcPrice;
    return Math.floor(btcAmount * 100_000_000);
  }
});

let amountInUSD = $derived(() => {
  if (unit === 'usd') {
    return parseFloat(amount) || 0;
  } else {
    // Convert sats to USD: sats / 100,000,000 * BTC price in USD
    const sats = parseFloat(amount) || 0;
    const btcAmount = sats / 100_000_000;
    return btcAmount * btcPrice;
  }
});

// Display values
let displayAmount = $derived(() => {
  if (unit === 'sats') {
    return `${amountInSats().toLocaleString()} sats`;
  } else {
    return `$${amountInUSD().toFixed(2)} USD`;
  }
});

let conversionAmount = $derived(() => {
  if (unit === 'sats') {
    return `≈ $${amountInUSD().toFixed(2)} USD`;
  } else {
    return `≈ ${amountInSats().toLocaleString()} sats`;
  }
});

// Network state
let selectedNetwork = $state('lightning-bitcoin');

// Fee calculations
let networkFee = $derived(async () => {
  // Calculate based on network and amount
  return estimatedFee;
});

let totalReceived = $derived(() => {
  return amountInSats() - networkFee();
});
```

### Calculator Logic

```typescript
let calculatorValue = $state('');

function handleCalculatorInput(value: string) {
  if (value === 'C') {
    calculatorValue = '';
    amount = '';
  } else if (value === '⌫') {
    calculatorValue = calculatorValue.slice(0, -1);
    amount = calculatorValue;
  } else if (value === '.') {
    if (!calculatorValue.includes('.')) {
      calculatorValue += '.';
      amount = calculatorValue;
    }
  } else if (['+', '−', '×', '÷'].includes(value)) {
    // Optional: implement calculator operations
  } else {
    // Number input
    if (unit === 'sats' && value === '.') {
      // Don't allow decimal for sats
      return;
    }
    // For USD, allow decimal; for sats, only integers
    if (unit === 'sats' && calculatorValue.includes('.')) {
      // Don't allow decimal input in sats mode
      return;
    }
    calculatorValue += value;
    amount = calculatorValue;
  }
}
```

### Integration with Existing Code

- **Reuse existing services**:
  - `cryptoPriceService` for price data
  - `walletManager` for network operations
  - Existing validation functions
  
- **Maintain compatibility**:
  - Keep existing network selection logic
  - Use existing fee estimation functions
  - Integrate with existing send/receive flows

### Responsive Design

- **Mobile First**: Optimize for mobile devices
- **Breakpoints**:
  - Mobile: Single column, stacked buttons
  - Tablet: Slightly larger calculator, side-by-side buttons
  - Desktop: Full layout as shown
- **Touch Targets**: Minimum 44px for all interactive elements
- **Calculator Grid**: Responsive grid that adapts to screen size

## Translation Requirements

All text must be translatable using `svelte-i18n`:

```json
{
  "wallet": {
    "receive": {
      "title": "Request Payment",
      "unit_sats": "Sats",
      "unit_usd": "USD",
      "network_fees": "Network Fees",
      "total_received": "Total Received",
      "cancel": "Cancel",
      "generate_invoice": "Generate Invoice"
    },
    "send": {
      "title": "Send Payment",
      "send_button": "Send"
    },
    "calculator": {
      "clear": "C",
      "delete": "⌫"
    }
  }
}
```

## Accessibility Requirements

- **ARIA Labels**: All buttons must have descriptive labels
- **Keyboard Navigation**: Full keyboard support for calculator
- **Screen Reader Support**: Announce amount changes, fee updates
- **Focus Management**: Clear focus indicators
- **Color Contrast**: Meet WCAG 2.1 AA standards

## Testing Requirements

- **Visual Testing**: Test in Cursor browser interface
- **Responsive Testing**: Test on mobile, tablet, desktop
- **Dark/Light Mode**: Test both themes
- **Unit Tests**: Test calculator logic, conversions, fee calculations
- **Integration Tests**: Test with actual wallet services

## Design System Compliance

- **Use DaisyUI Components**: Prefer DaisyUI buttons, cards, inputs
- **Use Tailwind CSS**: For custom styling
- **Follow Brand Colors**: Use semantic color names (`btn-primary`, `btn-error`)
- **Consistent Spacing**: Use Tailwind spacing scale
- **Typography**: Follow global heading styles

## Implementation Steps

1. Create new component files
2. Implement calculator interface
3. Add amount display with conversions
4. Integrate network selector
5. Add fee calculations
6. Implement action buttons
7. Add translations
8. Test responsive design
9. Test accessibility
10. Integrate with existing wallet flows

## Example Component Structure

```svelte
<script lang="ts">
  // Imports and state
</script>

<div class="wallet-payment-form">
  <!-- Price Ticker -->
  <div class="price-ticker">
    BTC ${btcPrice.toLocaleString()}
  </div>
  
  <!-- Title -->
  <h2 class="form-title">Request Payment</h2>
  
  <!-- Amount Display -->
  <div class="amount-display">
    <div class="primary-amount">{displayAmount}</div>
    <div class="conversion-amount">{conversionAmount}</div>
  </div>
  
  <!-- Unit Toggle -->
  <div class="unit-toggle">
    <!-- Toggle buttons -->
  </div>
  
  <!-- Calculator -->
  <div class="calculator">
    <!-- Calculator grid -->
  </div>
  
  <!-- Network Selector -->
  <div class="network-selector">
    <!-- Network dropdown -->
  </div>
  
  <!-- Fee Display -->
  <div class="fee-display">
    Network Fees: {networkFee}
  </div>
  
  <!-- Total Received -->
  <div class="total-received">
    <div class="label">Total Received</div>
    <div class="value">{totalReceived}</div>
  </div>
  
  <!-- Action Buttons -->
  <div class="action-buttons">
    <button class="btn btn-error">Cancel</button>
    <button class="btn btn-primary">Generate Invoice</button>
  </div>
</div>
```

## Notes

- The design should feel modern, clean, and Bitcoin-focused
- Prioritize clarity and ease of use
- Make the calculator intuitive for users unfamiliar with Bitcoin
- Ensure all calculations are accurate and handle edge cases
- Provide clear feedback for all user actions
- Maintain consistency with existing BitTasker design patterns

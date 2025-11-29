# Wallet Send/Receive UX Improvement Prompt

## Overview

Create an improved, modern UX for the wallet send and receive functions in BitTasker. The new design should feature a calculator-style interface with large, clear amount displays, real-time price conversion, and intuitive controls. **The interface will be implemented as a mobile-first modal that opens as a full-screen overlay on mobile/tablet devices and a centered modal dialog on desktop.**

## Modal Implementation Strategy

### Modal Architecture

Instead of navigating to a new page, the wallet send/receive interface will open as an **in-page modal** with the following responsive behavior:

- **Mobile (< 768px)**: Full-screen modal covering entire viewport
- **Tablet (768px - 1024px)**: Full-screen modal with slightly larger touch targets
- **Desktop (> 1024px)**: Centered modal dialog with max-width constraints (approximately 600-800px wide)

### Modal Component Structure

Create a specialized wallet modal component that wraps the payment form:

```svelte
<WalletPaymentModal
  isOpen={showModal}
  mode="receive" | "send"
  onClose={handleClose}
  onSuccess={handleSuccess}
/>
```

### Responsive Modal Sizing (Tailwind CSS)

Use Tailwind utility classes for responsive modal sizing:

```svelte
<!-- Modal Container: Full-screen on mobile/tablet, centered on desktop -->
<div
  class="fixed z-50 flex items-center justify-center
         inset-0 lg:inset-auto lg:p-4"
  role="dialog"
  aria-modal="true"
>
  <!-- Modal Content -->
  <div
    class="bg-base-100 flex flex-col shadow-2xl
           fixed inset-0 lg:relative
           w-full h-full lg:w-[90%] lg:max-w-2xl lg:max-h-[90vh]
           rounded-none lg:rounded-2xl
           flex flex-col
           pt-[max(1rem,env(safe-area-inset-top))]
           pr-[max(1rem,env(safe-area-inset-right))]
           pb-[max(1rem,env(safe-area-inset-bottom))]
           pl-[max(1rem,env(safe-area-inset-left))]"
  >
    <!-- Modal content here -->
  </div>
</div>
```

**Tailwind Classes Breakdown:**

- **Position & Layout**:
  - `fixed inset-0` - Full-screen positioning (mobile)
  - `lg:relative` - Relative positioning on desktop
  - `lg:inset-auto` - Remove fixed positioning on desktop
  - `flex flex-col` - Flexbox column layout

- **Sizing (Mobile)**:
  - `w-full h-full` - Full viewport width/height
  - `inset-0` - Covers entire screen

- **Sizing (Desktop)**:
  - `lg:w-[90%]` - 90% width on large screens
  - `lg:max-w-2xl` - Maximum width of 672px (2xl = 32rem)
  - `lg:max-h-[90vh]` - Maximum height of 90% viewport

- **Border Radius**:
  - `rounded-none` - No border radius on mobile (full-screen)
  - `lg:rounded-2xl` - Large border radius on desktop (1rem)

- **Safe Area Insets**:
  - `pt-[max(1rem,env(safe-area-inset-top))]` - Top padding with safe area
  - `pr-[max(1rem,env(safe-area-inset-right))]` - Right padding with safe area
  - `pb-[max(1rem,env(safe-area-inset-bottom))]` - Bottom padding with safe area
  - `pl-[max(1rem,env(safe-area-inset-left))]` - Left padding with safe area

**Note**: Tailwind's arbitrary value syntax `[max(...)]` allows using CSS functions like `max()` and `env()` for safe area handling.

### Modal Backdrop (Tailwind CSS)

Use Tailwind utility classes for the backdrop:

```svelte
<!-- Backdrop: Responsive opacity and blur -->
<div
  class="fixed inset-0 z-40 
         bg-black/80 lg:bg-black/50 
         backdrop-blur-sm lg:backdrop-blur
         transition-opacity duration-300 ease-in-out"
  onclick={props.onClose}
  role="presentation"
  aria-hidden="true"
/>
```

**Tailwind Classes:**
- `fixed inset-0` - Full-screen coverage
- `z-40` - Below modal content (z-50)
- `bg-black/80` - 80% opacity on mobile (darker)
- `lg:bg-black/50` - 50% opacity on desktop (lighter)
- `backdrop-blur-sm` - Small blur on mobile
- `lg:backdrop-blur` - Standard blur on desktop
- `transition-opacity duration-300` - Smooth fade animation

### Modal Header (Mobile-First with Tailwind)

```svelte
<!-- Mobile: Full-width header with close button -->
<div class="flex items-center justify-between 
            p-4 lg:p-6
            min-h-[56px] lg:min-h-[64px]
            bg-base-100 
            border-b border-base-300">
  <!-- Close button: Top-left on mobile, top-right on desktop -->
  <button 
    class="btn btn-circle btn-ghost btn-sm
           min-h-[44px] min-w-[44px]
           order-1 lg:order-3"
    onclick={onClose}
    aria-label="Close"
  >
    <svg class="h-6 w-6">...</svg>
  </button>
  
  <!-- Title: Centered or left-aligned -->
  <h2 class="text-2xl lg:text-3xl font-bold 
             flex-1 text-center lg:text-left
             order-2">
    Request Payment
  </h2>
  
  <!-- Optional: Spacer for centering (desktop) -->
  <div class="w-11 order-3 lg:hidden"></div>
</div>
```

**Tailwind Classes Breakdown:**
- `flex items-center justify-between` - Flexbox layout with space between
- `p-4 lg:p-6` - Responsive padding (1rem mobile, 1.5rem desktop)
- `min-h-[56px] lg:min-h-[64px]` - Minimum height for touch targets
- `bg-base-100` - DaisyUI base background color
- `border-b border-base-300` - Subtle bottom border
- `min-h-[44px] min-w-[44px]` - Minimum touch target for close button
- `text-2xl lg:text-3xl` - Responsive text sizing
- `order-*` - Flexbox order for responsive layout

### Modal Content Area (Tailwind CSS)

```svelte
<!-- Scrollable content area -->
<div class="flex-1 overflow-y-auto 
            p-4 lg:p-6
            space-y-6">
  <!-- Content sections with automatic spacing -->
</div>
```

**Tailwind Classes:**
- `flex-1` - Takes remaining vertical space
- `overflow-y-auto` - Vertical scrolling when content overflows
- `p-4 lg:p-6` - Responsive padding
- `space-y-6` - Automatic vertical spacing between child elements (1.5rem)

### Modal Footer (Action Buttons with Tailwind)

```svelte
<!-- Sticky footer: Mobile bottom, Desktop normal flow -->
<div class="sticky lg:static bottom-0 
            bg-base-100 border-t border-base-300 
            p-4 lg:p-6
            pb-[max(1rem,env(safe-area-inset-bottom))]">
  <div class="flex flex-col lg:flex-row gap-3">
    <button 
      class="btn btn-error btn-lg 
             w-full lg:w-auto lg:flex-1
             min-h-[56px]
             order-2 lg:order-1"
      onclick={props.onClose}
    >
      Cancel
    </button>
    
    <button 
      class="btn btn-primary btn-lg 
             w-full lg:w-auto lg:flex-1
             min-h-[56px]
             order-1 lg:order-2"
      onclick={handleSubmit}
      disabled={!isFormValid || isSubmitting}
    >
      {#if isSubmitting}
        <span class="loading loading-spinner loading-sm"></span>
        Generating...
      {:else}
        Generate Invoice
      {/if}
    </button>
  </div>
</div>
```

**Tailwind Classes:**
- `sticky lg:static` - Sticky on mobile, static on desktop
- `bottom-0` - Stick to bottom of viewport
- `bg-base-100 border-t border-base-300` - Background and top border
- `pb-[max(1rem,env(safe-area-inset-bottom))]` - Bottom safe area padding
- `flex flex-col lg:flex-row` - Stacked on mobile, side-by-side on desktop
- `gap-3` - Gap between buttons (0.75rem)
- `w-full lg:w-auto lg:flex-1` - Full width mobile, equal flex on desktop
- `min-h-[56px]` - Minimum touch target height
- `order-*` - Button order (primary first on mobile for thumb reach)

**Mobile Footer Specifications:**
- Position: Sticky at bottom (mobile) or normal flow (desktop)
- Height: Auto with padding
- Buttons: Full-width on mobile, side-by-side on desktop
- Safe area: Account for bottom safe area on mobile devices

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

Create the following components:

1. **`WalletPaymentModal.svelte`** - Main modal wrapper component
   - Handles modal open/close logic
   - Manages responsive sizing
   - Handles backdrop, animations, focus trapping
   - Wraps payment form content

2. **`ReceivePaymentForm.svelte`** - Payment request form content
   - Calculator interface
   - Amount display
   - Network selector
   - Fee calculations
   - Generate invoice action

3. **`SendPaymentForm.svelte`** - Payment send form content
   - Similar layout to receive
   - Address/QR scanner input
   - Amount calculator
   - Network selector
   - Send payment action

4. **`CalculatorKeypad.svelte`** - Reusable calculator component
   - Number buttons (0-9)
   - Operators (+, -, ×, ÷)
   - Clear and delete buttons
   - Touch-optimized layout

5. **`AmountDisplay.svelte`** - Amount display component
   - Primary amount display
   - Conversion display
   - Unit toggle
   - Real-time updates

### Modal Component Implementation

```svelte
<!-- WalletPaymentModal.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { fly, fade, scale } from 'svelte/transition';
  import { t } from 'svelte-i18n';
  import { browser } from '$app/environment';
  
  const props = $props<{
    isOpen: boolean;
    mode: 'receive' | 'send';
    onClose: () => void;
    onSuccess?: () => void;
  }>();
  
  let modalRef: HTMLDivElement;
  let backdropRef: HTMLDivElement;
  let isMobile = $state(false);
  let prefersReducedMotion = $state(false);
  
  // Detect mobile viewport
  function checkMobile() {
    if (browser) {
      isMobile = window.innerWidth < 1025;
    }
  }
  
  // Check for reduced motion preference
  function checkReducedMotion() {
    if (browser) {
      prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
  }
  
  // Focus trap management
  function trapFocus(e: KeyboardEvent) {
    if (!props.isOpen || e.key !== 'Tab') return;
    
    const focusableElements = modalRef?.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    
    if (!focusableElements || focusableElements.length === 0) return;
    
    const firstElement = focusableElements[0] as HTMLElement;
    const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;
    
    if (e.shiftKey) {
      if (document.activeElement === firstElement) {
        e.preventDefault();
        lastElement.focus();
      }
    } else {
      if (document.activeElement === lastElement) {
        e.preventDefault();
        firstElement.focus();
      }
    }
  }
  
  // Handle escape key
  function handleEscape(e: KeyboardEvent) {
    if (e.key === 'Escape' && props.isOpen) {
      props.onClose();
    }
  }
  
  // Lock body scroll when modal is open
  $effect(() => {
    if (props.isOpen) {
      document.body.style.overflow = 'hidden';
      // Focus first element
      setTimeout(() => {
        const firstFocusable = modalRef?.querySelector('button, input, [tabindex]') as HTMLElement;
        firstFocusable?.focus();
      }, 100);
    } else {
      document.body.style.overflow = '';
    }
    
    return () => {
      document.body.style.overflow = '';
    };
  });
  
  onMount(() => {
    checkMobile();
    checkReducedMotion();
    
    window.addEventListener('resize', checkMobile);
    window.addEventListener('keydown', handleEscape);
    window.addEventListener('keydown', trapFocus);
    
    return () => {
      window.removeEventListener('resize', checkMobile);
      window.removeEventListener('keydown', handleEscape);
      window.removeEventListener('keydown', trapFocus);
    };
  });
</script>

<svelte:window onkeydown={handleEscape} />

{#if props.isOpen}
  <!-- Backdrop -->
  <div
    bind:this={backdropRef}
    class="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity duration-300"
    class:bg-black/80={isMobile}
    onclick={props.onClose}
    role="presentation"
    aria-hidden="true"
    transition:fade={{ duration: prefersReducedMotion ? 0 : 300 }}
  />
  
  <!-- Modal Container -->
  <div
    class="fixed z-50 flex items-center justify-center"
    class:inset-0={isMobile}
    class:p-4={!isMobile}
    role="dialog"
    aria-modal="true"
    aria-labelledby="wallet-modal-title"
    onclick={(e) => e.stopPropagation()}
  >
    <!-- Modal Content -->
    <div
      bind:this={modalRef}
      class="bg-base-100 flex flex-col shadow-2xl
             fixed inset-0 lg:relative
             w-full h-full lg:w-[90%] lg:max-w-2xl lg:max-h-[90vh]
             rounded-none lg:rounded-2xl
             pt-[max(1rem,env(safe-area-inset-top))]
             pr-[max(1rem,env(safe-area-inset-right))]
             pb-[max(1rem,env(safe-area-inset-bottom))]
             pl-[max(1rem,env(safe-area-inset-left))]"
      transition:fly={prefersReducedMotion ? undefined : { 
        y: isMobile ? 100 : 20, 
        duration: 300 
      }}
      transition:scale={prefersReducedMotion ? undefined : { 
        duration: 200, 
        start: 0.95 
      }}
    >
      <!-- Modal Header -->
      <div class="wallet-modal-header flex items-center justify-between p-4 border-b border-base-300">
        <button
          class="btn btn-circle btn-ghost btn-sm min-h-[44px] min-w-[44px]"
          onclick={props.onClose}
          aria-label={$t('common.components.modal.close')}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
        
        <h2 id="wallet-modal-title" class="text-2xl font-bold">
          {props.mode === 'receive' 
            ? $t('wallet.receive.title') 
            : $t('wallet.send.title')}
        </h2>
        
        <!-- Spacer for centering -->
        <div class="w-11"></div>
      </div>
      
      <!-- Modal Content (Scrollable) -->
      <div class="wallet-modal-content flex-1 overflow-y-auto p-4 md:p-6">
        {#if props.mode === 'receive'}
          <ReceivePaymentForm onSuccess={props.onSuccess} />
        {:else}
          <SendPaymentForm onSuccess={props.onSuccess} />
        {/if}
      </div>
    </div>
  </div>
{/if}

<!-- No custom CSS needed - all styling with Tailwind classes -->
<!-- Modal uses Tailwind utility classes for all responsive behavior -->
```

### Integration with Wallet Page

```svelte
<!-- wallet/+page.svelte -->
<script lang="ts">
  import WalletPaymentModal from '$lib/components/wallet/WalletPaymentModal.svelte';
  
  let showReceiveModal = $state(false);
  let showSendModal = $state(false);
  
  function openReceiveModal() {
    showReceiveModal = true;
  }
  
  function openSendModal() {
    showSendModal = true;
  }
  
  function closeReceiveModal() {
    showReceiveModal = false;
  }
  
  function closeSendModal() {
    showSendModal = false;
  }
  
  function handleReceiveSuccess() {
    // Handle successful payment request generation
    closeReceiveModal();
    // Show success toast, update UI, etc.
  }
  
  function handleSendSuccess() {
    // Handle successful payment send
    closeSendModal();
    // Show success toast, update UI, etc.
  }
</script>

<!-- Existing wallet page content -->
<div class="wallet-page">
  <!-- ... existing content ... -->
  
  <!-- Buttons to open modals -->
  <button class="btn btn-primary" onclick={openReceiveModal}>
    Receive Payment
  </button>
  
  <button class="btn btn-secondary" onclick={openSendModal}>
    Send Payment
  </button>
</div>

<!-- Modals -->
<WalletPaymentModal
  isOpen={showReceiveModal}
  mode="receive"
  onClose={closeReceiveModal}
  onSuccess={handleReceiveSuccess}
/>

<WalletPaymentModal
  isOpen={showSendModal}
  mode="send"
  onClose={closeSendModal}
  onSuccess={handleSendSuccess}
/>
```

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
  - Mobile (< 768px): Single column, stacked buttons, full-screen modal
  - Tablet (768px - 1024px): Slightly larger calculator, side-by-side buttons, full-screen modal
  - Desktop (> 1024px): Full layout as shown, centered modal (max-width: 800px)
- **Touch Targets**: Minimum 44px for all interactive elements (iOS HIG recommendation)
- **Calculator Grid**: Responsive grid that adapts to screen size
- **Modal Behavior**: Full-screen on mobile/tablet, centered dialog on desktop

## Mobile Wallet UI Best Practices

### 1. Touch Interaction Optimization

#### Touch Target Sizing
- **Minimum Size**: 44x44px for all interactive elements (iOS/Android standard)
- **Calculator Buttons**: 60-70px height on mobile for comfortable tapping
- **Action Buttons**: 48-56px height with full-width on mobile
- **Spacing**: Minimum 8px gap between touch targets to prevent mis-taps

#### Touch Feedback
```svelte
<!-- Haptic feedback on button press (if available) -->
<button 
  class="calculator-button"
  ontouchstart={(e) => {
    // Visual feedback
    e.currentTarget.classList.add('active');
    // Haptic feedback (if Capacitor available)
    if (window.Capacitor?.Plugins?.Haptics) {
      window.Capacitor.Plugins.Haptics.impact({ style: 'light' });
    }
  }}
  ontouchend={(e) => {
    e.currentTarget.classList.remove('active');
  }}
>
  {value}
</button>
```

#### Touch Action Optimization (Tailwind CSS)

```svelte
<button
  class="calculator-button 
         touch-manipulation 
         select-none
         active:scale-95
         transition-transform duration-100"
  style="-webkit-tap-highlight-color: transparent;"
>
  {value}
</button>
```

**Tailwind Classes:**
- `touch-manipulation` - Prevents double-tap zoom (equivalent to `touch-action: manipulation`)
- `select-none` - Prevents text selection (equivalent to `user-select: none`)
- `active:scale-95` - Scale down on press for visual feedback
- `transition-transform duration-100` - Smooth scale animation
- `style="-webkit-tap-highlight-color: transparent;"` - Remove tap highlight (requires inline style as Tailwind doesn't have utility for this)

### 2. Gesture Support

#### Swipe to Close (Mobile)
- **Direction**: Swipe down from top of modal to close
- **Threshold**: 100px swipe distance or 30% of screen height
- **Visual Feedback**: Modal follows finger during swipe with opacity fade
- **Implementation**: Use touch events or a gesture library

```typescript
let touchStartY = 0;
let touchCurrentY = 0;
let isDragging = false;

function handleTouchStart(e: TouchEvent) {
  touchStartY = e.touches[0].clientY;
  isDragging = true;
}

function handleTouchMove(e: TouchEvent) {
  if (!isDragging) return;
  touchCurrentY = e.touches[0].clientY;
  const deltaY = touchCurrentY - touchStartY;
  
  // Only allow downward swipe
  if (deltaY > 0) {
    // Update modal position and opacity
    const progress = Math.min(deltaY / 300, 1);
    modalStyle = {
      transform: `translateY(${deltaY}px)`,
      opacity: 1 - progress
    };
  }
}

function handleTouchEnd(e: TouchEvent) {
  const deltaY = touchCurrentY - touchStartY;
  if (deltaY > 100) {
    // Close modal
    onClose();
  } else {
    // Snap back
    modalStyle = { transform: 'translateY(0)', opacity: 1 };
  }
  isDragging = false;
}
```

#### Pull to Refresh (Optional)
- Allow users to pull down to refresh BTC price
- Show loading indicator during refresh
- Haptic feedback on refresh trigger

### 3. Keyboard Handling

#### Mobile Keyboard Behavior
- **Auto-focus**: Don't auto-focus amount input (prevents keyboard popup)
- **Keyboard Avoidance**: Ensure calculator buttons remain visible when keyboard is open
- **Input Method**: Use calculator buttons instead of native keyboard for amount input
- **Virtual Keyboard**: Hide virtual keyboard when calculator is active

```css
/* Prevent virtual keyboard on mobile */
.calculator-input {
  inputmode="none"; /* Prevents mobile keyboard */
  readonly; /* Prevents keyboard but allows programmatic updates */
}
```

#### Desktop Keyboard Support
- **Number Pad**: Support numeric keypad input
- **Keyboard Shortcuts**:
  - `Escape`: Close modal
  - `Enter`: Submit form (if valid)
  - `Backspace`: Delete last digit
  - `C`: Clear amount
  - `Tab`: Navigate between elements

### 4. Visual Hierarchy (Mobile)

#### Amount Display Priority
- **Primary Amount**: Largest text on screen (text-5xl mobile, text-6xl desktop)
- **Conversion**: Secondary, smaller text (text-base mobile)
- **Labels**: Smallest, subtle text (text-sm)
- **Spacing**: Generous vertical spacing between sections

#### Color and Contrast
- **High Contrast**: Ensure WCAG AA compliance (4.5:1 for normal text)
- **Focus States**: Clear, visible focus indicators
- **Active States**: Distinct visual feedback for pressed buttons
- **Error States**: Red text/background for validation errors

### 5. Performance Optimization

#### Animation Performance (Tailwind CSS)

```svelte
<div
  class="wallet-modal
         will-change-transform
         transform-gpu
         transition-all duration-300 ease-out"
>
  <!-- Content -->
</div>
```

**Tailwind Classes:**
- `will-change-transform` - Hints browser to optimize for transform changes
- `transform-gpu` - Forces GPU acceleration (equivalent to `transform: translateZ(0)`)
- `transition-all duration-300 ease-out` - Smooth transitions for all properties
- Use Svelte transitions for enter/exit animations (fly, fade, scale)

#### Reduce Motion
```svelte
<script>
  import { onMount } from 'svelte';
  
  let prefersReducedMotion = $state(false);
  
  onMount(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    prefersReducedMotion = mediaQuery.matches;
    
    mediaQuery.addEventListener('change', (e) => {
      prefersReducedMotion = e.matches;
    });
  });
</script>

<div 
  class="wallet-modal"
  class:no-animation={prefersReducedMotion}
>
  <!-- Content -->
</div>
```

#### Lazy Loading
- Load BTC price on modal open (not on page load)
- Defer network fee calculations until needed
- Load network options on demand

### 6. Error Handling and Feedback

#### Input Validation
- **Real-time Validation**: Show errors immediately as user types
- **Clear Error Messages**: Use simple, actionable language
- **Visual Indicators**: Red border/text for errors, green for success
- **Haptic Feedback**: Light vibration on validation errors (mobile)

#### Network Errors
- **Retry Mechanism**: Show retry button for failed network requests
- **Offline Detection**: Detect offline state and show appropriate message
- **Loading States**: Clear loading indicators for async operations

### 7. Accessibility (Mobile-Specific)

#### Screen Reader Support
```svelte
<!-- Announce amount changes -->
<div 
  role="status" 
  aria-live="polite" 
  aria-atomic="true"
  class="sr-only"
>
  Amount: {displayAmount}
</div>

<!-- Calculator button with descriptive label -->
<button
  class="calculator-button"
  aria-label="Number {value}"
  aria-pressed={false}
>
  {value}
</button>
```

#### Focus Management
- **Trap Focus**: Keep focus within modal when open
- **Initial Focus**: Focus first interactive element on open
- **Return Focus**: Return focus to trigger button on close
- **Skip Links**: Provide skip link to main content (desktop)

#### Voice Control
- Support voice input for amount (if device supports)
- Clear labels for voice control systems

### 8. Mobile-Specific Features

#### Biometric Confirmation (Optional)
- Use device biometrics for transaction confirmation
- Integrate with Capacitor NativeBiometric plugin
- Fallback to PIN/password if biometrics unavailable

#### Camera Integration
- QR code scanner for receiving addresses
- Camera button in send flow for scanning payment requests

#### Share Integration
- Native share sheet for payment requests
- Share as text, image (QR code), or payment URI

### 9. Animation and Transitions

#### Modal Entrance
```svelte
<!-- Mobile: Slide up from bottom -->
<div 
  class="wallet-modal"
  transition:slide={{ axis: 'y', duration: 300 }}
>
  <!-- Content -->
</div>

<!-- Desktop: Scale and fade -->
<div 
  class="wallet-modal"
  transition:scale={{ duration: 200, start: 0.95 }}
  transition:fade={{ duration: 200 }}
>
  <!-- Content -->
</div>
```

#### Button Press Animation (Tailwind CSS)

```svelte
<button
  class="calculator-button
         active:scale-95
         transition-transform duration-100
         transition-colors duration-200"
>
  {value}
</button>
```

**Tailwind Classes:**
- `active:scale-95` - Scale down to 95% when pressed
- `transition-transform duration-100` - Fast transform transition (0.1s)
- `transition-colors duration-200` - Color transition for hover/active states

#### Amount Update Animation
- Subtle pulse animation when amount changes
- Smooth number transitions (not instant jumps)
- Highlight changed digits briefly

### 10. State Persistence

#### Form State
- **Auto-save**: Save form state to localStorage
- **Restore on Reopen**: Restore previous amount/network selection
- **Clear on Success**: Clear saved state after successful transaction

#### User Preferences
- Remember preferred unit (sats vs USD)
- Remember preferred network
- Remember calculator layout preferences

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
- **Use Tailwind CSS Only**: All styling should use Tailwind utility classes - no custom CSS needed
- **Follow Brand Colors**: Use semantic color names (`btn-primary`, `btn-error`)
- **Consistent Spacing**: Use Tailwind spacing scale (p-4, p-6, gap-3, space-y-6, etc.)
- **Typography**: Use Tailwind typography utilities (text-2xl, font-bold, etc.)
- **Responsive Design**: Use Tailwind breakpoints (lg:, md:, sm:) for responsive behavior
- **Safe Areas**: Use Tailwind's arbitrary values `[max(...)]` for safe area insets

### Tailwind CSS Implementation Notes

**All styling can be achieved with Tailwind utility classes:**

1. **Responsive Sizing**: Use `lg:` prefix for desktop styles
   - Example: `w-full lg:w-[90%] lg:max-w-2xl`

2. **Safe Area Insets**: Use arbitrary values with CSS functions
   - Example: `pt-[max(1rem,env(safe-area-inset-top))]`

3. **Animations**: Use Tailwind transition utilities + Svelte transitions
   - Example: `transition-transform duration-300` + Svelte `transition:fly`

4. **Touch Optimization**: Use Tailwind utilities
   - `touch-manipulation` - Prevents double-tap zoom
   - `select-none` - Prevents text selection
   - `active:scale-95` - Press feedback

5. **Performance**: Use Tailwind GPU acceleration utilities
   - `transform-gpu` - Forces GPU acceleration
   - `will-change-transform` - Optimizes for transforms

6. **No Custom CSS Required**: Everything can be done with Tailwind classes
   - Only exception: `-webkit-tap-highlight-color` requires inline style (browser-specific)

## Mobile Wallet UI Patterns

### 1. Calculator Layout (Mobile-Optimized)

```svelte
<!-- Calculator Grid: 4 columns, responsive sizing -->
<div class="calculator-grid grid grid-cols-4 gap-2 md:gap-3">
  {#each calculatorButtons as button}
    <button
      class="calculator-button btn btn-lg min-h-[60px] md:min-h-[70px] 
             text-xl md:text-2xl font-semibold"
      class:btn-primary={button.type === 'operator'}
      class:btn-secondary={button.type === 'number'}
      class:btn-error={button.value === 'C'}
      class:btn-warning={button.value === '⌫'}
      onclick={() => handleCalculatorInput(button.value)}
      aria-label={button.label}
    >
      {button.display}
    </button>
  {/each}
</div>
```

**Mobile Calculator Specifications:**
- **Grid**: 4 columns, equal width
- **Button Height**: 60px minimum (mobile), 70px (tablet+)
- **Gap**: 8px (mobile), 12px (desktop)
- **Font Size**: text-xl (mobile), text-2xl (desktop)
- **Touch Feedback**: Scale down to 0.95 on press

### 2. Amount Display (Mobile-Optimized)

```svelte
<!-- Large, prominent amount display -->
<div class="amount-display text-center py-6 md:py-8">
  <!-- Primary Amount -->
  <div 
    class="primary-amount text-5xl md:text-6xl lg:text-7xl font-bold 
           mb-2 break-all"
    aria-live="polite"
    aria-atomic="true"
  >
    {displayAmount}
  </div>
  
  <!-- Conversion Amount -->
  <div 
    class="conversion-amount text-base md:text-lg text-base-content/70"
    aria-label="Equivalent amount"
  >
    {conversionAmount}
  </div>
</div>
```

**Mobile Amount Display Specifications:**
- **Primary Text**: text-5xl (mobile), text-6xl (tablet), text-7xl (desktop)
- **Line Height**: 1.1 (tight for large numbers)
- **Break Words**: Allow wrapping for very long numbers
- **Spacing**: Generous vertical padding (py-6 mobile, py-8 desktop)

### 3. Network Selector (Mobile-Optimized)

```svelte
<!-- Large, touch-friendly network selector -->
<div class="network-selector">
  <button
    class="btn btn-outline btn-lg w-full min-h-[56px] justify-between 
           text-left"
    onclick={toggleNetworkDropdown}
    aria-expanded={showNetworkDropdown}
    aria-haspopup="true"
  >
    <div class="flex items-center gap-3">
      <img src={selectedNetwork.icon} alt="" class="w-6 h-6" />
      <span class="font-semibold">{selectedNetwork.label}</span>
    </div>
    <svg class="w-5 h-5">...</svg>
  </button>
  
  {#if showNetworkDropdown}
    <div class="network-dropdown mt-2">
      {#each networks as network}
        <button
          class="network-option btn btn-ghost w-full justify-start 
                 min-h-[48px]"
          onclick={() => selectNetwork(network)}
        >
          <img src={network.icon} alt="" class="w-5 h-5" />
          <span>{network.label}</span>
        </button>
      {/each}
    </div>
  {/if}
</div>
```

**Mobile Network Selector Specifications:**
- **Button Height**: 56px minimum
- **Full Width**: w-full on mobile
- **Touch-Friendly**: Large touch target with clear visual feedback
- **Dropdown**: Full-width dropdown menu on mobile

### 4. Action Buttons (Mobile-Optimized)

```svelte
<!-- Sticky footer with action buttons -->
<div class="wallet-modal-footer sticky bottom-0 bg-base-100 
            border-t border-base-300 p-4 md:p-6 
            safe-area-bottom">
  <div class="flex flex-col md:flex-row gap-3">
    <button
      class="btn btn-error btn-lg w-full min-h-[56px] order-2 md:order-1"
      onclick={props.onClose}
    >
      {$t('wallet.receive.cancel')}
    </button>
    
    <button
      class="btn btn-primary btn-lg w-full min-h-[56px] order-1 md:order-2"
      onclick={handleSubmit}
      disabled={!isFormValid || isSubmitting}
    >
      {#if isSubmitting}
        <span class="loading loading-spinner loading-sm"></span>
        {$t('wallet.receive.generating')}
      {:else}
        {$t('wallet.receive.generate_invoice')}
      {/if}
    </button>
  </div>
</div>
```

**Mobile Action Button Specifications:**
- **Button Height**: 56px minimum
- **Full Width**: w-full on mobile, side-by-side on desktop
- **Sticky Footer**: Fixed at bottom on mobile
- **Safe Area**: Account for bottom safe area (notch/home indicator)
- **Order**: Primary button first on mobile (thumb-friendly)

### 5. Loading States

```svelte
<!-- Skeleton loading for calculator -->
{#if isLoading}
  <div class="animate-pulse">
    <div class="h-24 bg-base-300 rounded mb-4"></div>
    <div class="grid grid-cols-4 gap-2">
      {#each Array(16) as _}
        <div class="h-16 bg-base-300 rounded"></div>
      {/each}
    </div>
  </div>
{:else}
  <!-- Actual calculator -->
{/if}
```

### 6. Error States

```svelte
<!-- Inline error display -->
{#if amountError}
  <div 
    class="alert alert-error alert-sm mt-2"
    role="alert"
    aria-live="assertive"
  >
    <svg>...</svg>
    <span>{amountError}</span>
  </div>
{/if}
```

## Implementation Steps

### Phase 1: Modal Infrastructure
1. ✅ Create `WalletPaymentModal.svelte` component
   - Implement responsive sizing (fullscreen mobile, centered desktop)
   - Add backdrop with proper z-index management
   - Implement focus trapping and keyboard handling
   - Add safe area support for mobile devices
   - Add animations and transitions
   - Test on mobile, tablet, and desktop viewports

### Phase 2: Core Components
2. ✅ Create `CalculatorKeypad.svelte` component
   - Implement 4x4 grid layout
   - Add touch-optimized buttons (44px+ height)
   - Implement calculator logic (numbers, operators, clear, delete)
   - Add haptic feedback (if available)
   - Add keyboard support for desktop
   - Test touch interactions

3. ✅ Create `AmountDisplay.svelte` component
   - Implement large amount display
   - Add real-time conversion display
   - Implement unit toggle (Sats/USD)
   - Add smooth number transitions
   - Test with various amounts

4. ✅ Create `ReceivePaymentForm.svelte` component
   - Integrate calculator and amount display
   - Add network selector
   - Implement fee calculations
   - Add form validation
   - Integrate with wallet services
   - Test payment request generation

5. ✅ Create `SendPaymentForm.svelte` component
   - Similar structure to receive form
   - Add address/QR scanner input
   - Implement send payment logic
   - Add confirmation step
   - Test payment sending

### Phase 3: Mobile Optimizations
6. ✅ Add swipe-to-close gesture
   - Implement touch event handlers
   - Add visual feedback during swipe
   - Test on various mobile devices

7. ✅ Optimize touch interactions
   - Ensure all buttons meet 44px minimum
   - Add touch feedback animations
   - Test haptic feedback integration
   - Optimize touch-action CSS

8. ✅ Implement safe area handling
   - Add CSS environment variables
   - Test on devices with notches
   - Test on devices with home indicators
   - Ensure content is never hidden

### Phase 4: Integration and Polish
9. ✅ Integrate with existing wallet page
   - Replace tab-based navigation with modal triggers
   - Update wallet page to use modals
   - Maintain backward compatibility
   - Test integration

10. ✅ Add translations
    - Add all new strings to translation files
    - Test in English and Spanish
    - Ensure proper pluralization

11. ✅ Add accessibility features
    - ARIA labels and roles
    - Screen reader announcements
    - Keyboard navigation
    - Focus management
    - Test with screen readers

12. ✅ Performance optimization
    - Lazy load modal content
    - Optimize animations
    - Reduce motion support
    - Test performance on low-end devices

### Phase 5: Testing
13. ✅ Visual testing
    - Test in Cursor browser interface
    - Test on mobile devices (iOS/Android)
    - Test on tablets
    - Test on desktop browsers
    - Test in dark/light mode

14. ✅ Functional testing
    - Test calculator input
    - Test amount conversions
    - Test network selection
    - Test fee calculations
    - Test payment generation
    - Test error handling

15. ✅ Accessibility testing
    - Test with screen readers
    - Test keyboard navigation
    - Test focus management
    - Test color contrast
    - Test with reduced motion

16. ✅ Integration testing
    - Test with actual wallet services
    - Test payment request generation
    - Test payment sending
    - Test error scenarios
    - Test network failures

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

## Mobile Wallet UI Best Practices Summary

### Core Principles

1. **Mobile-First Design**
   - Design for mobile screens first, then enhance for larger screens
   - Full-screen modal on mobile provides immersive experience
   - Centered modal on desktop maintains context

2. **Touch Optimization**
   - All interactive elements: minimum 44x44px
   - Generous spacing between touch targets (8px+)
   - Clear visual feedback on touch
   - Haptic feedback where appropriate

3. **Performance**
   - Smooth 60fps animations
   - GPU-accelerated transitions
   - Lazy loading of non-critical content
   - Respect reduced motion preferences

4. **Accessibility**
   - Full keyboard navigation support
   - Screen reader announcements
   - High contrast ratios (WCAG AA)
   - Focus management and trapping

5. **User Experience**
   - Clear visual hierarchy
   - Immediate feedback for all actions
   - Error prevention and clear error messages
   - State persistence where appropriate

### Mobile-Specific Considerations

- **Safe Areas**: Account for device notches and home indicators
- **Keyboard**: Prevent virtual keyboard when using calculator
- **Gestures**: Support swipe-to-close for natural mobile interaction
- **Orientation**: Support both portrait and landscape (prefer portrait)
- **Network**: Handle offline states gracefully
- **Battery**: Optimize for battery life (reduce animations on low battery)

### Desktop Enhancements

- **Keyboard Shortcuts**: Full keyboard support for power users
- **Mouse Interactions**: Hover states and precise cursor interactions
- **Larger Touch Targets**: Still maintain 44px minimum for accessibility
- **Multi-column Layout**: Utilize horizontal space effectively

## Notes

- The design should feel modern, clean, and Bitcoin-focused
- Prioritize clarity and ease of use
- Make the calculator intuitive for users unfamiliar with Bitcoin
- Ensure all calculations are accurate and handle edge cases
- Provide clear feedback for all user actions
- Maintain consistency with existing BitTasker design patterns
- **Modal-first approach**: Use modals instead of page navigation for better mobile UX
- **Progressive enhancement**: Start with mobile experience, enhance for desktop
- **Performance is UX**: Fast, smooth interactions are critical for mobile wallet apps
- **Accessibility is not optional**: Ensure all users can use the wallet features
- **Test on real devices**: Emulators don't capture all mobile nuances (touch, haptics, safe areas)

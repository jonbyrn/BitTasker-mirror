# Wallet Send/Receive UX Improvement Prompt

## Overview

Create an improved, modern UX for the wallet send and receive functions in BitTasker. The new design should feature a calculator-style interface with large, clear amount displays, real-time price conversion, and intuitive controls. **The interface will be implemented as a mobile-first modal that opens as a full-screen overlay on mobile/tablet devices and a centered modal dialog on desktop.**

## Modal Implementation

### Responsive Behavior

- **Mobile (< 768px)**: Full-screen modal covering entire viewport
- **Tablet (768px - 1024px)**: Full-screen modal with larger touch targets
- **Desktop (> 1024px)**: Centered modal dialog (max-width: 600-800px)

### Component Structure

```svelte
<WalletPaymentModal
  isOpen={showModal}
  mode="receive" | "send"
  onClose={handleClose}
  onSuccess={handleSuccess}
/>
```

### Modal Implementation

Use Tailwind utility classes for responsive sizing:

- **Container**: `fixed inset-0 lg:inset-auto lg:p-4` - Full-screen mobile, centered desktop
- **Content**: `fixed inset-0 lg:relative w-full h-full lg:w-[90%] lg:max-w-2xl lg:max-h-[90vh] rounded-none lg:rounded-2xl`
- **Safe Areas**: `pt-[max(1rem,env(safe-area-inset-top))]` (repeat for all sides)
- **Backdrop**: `fixed inset-0 z-40 bg-black/80 lg:bg-black/50 backdrop-blur-sm lg:backdrop-blur`
- **Header**: `flex items-center justify-between p-4 lg:p-6 min-h-[56px] border-b border-base-300`
- **Content Area**: `flex-1 overflow-y-auto p-4 lg:p-6 space-y-6`
- **Footer**: `sticky lg:static bottom-0 bg-base-100 border-t border-base-300 p-4 lg:p-6`

**Key Features:**

- Focus trapping and keyboard handling (Escape to close, Tab navigation)
- Body scroll lock when modal is open
- Svelte transitions (fly for mobile, scale for desktop)
- Respect `prefers-reduced-motion`
- Safe area insets for mobile devices with notches

## Visual Design

### Layout Structure

```
┌─────────────────────────────────────────┐
│  BTC   $93,427.18  (Live price ticker) │
├─────────────────────────────────────────┤
│      Request Payment  (Title)           │
│      123,456 sats  (HUGE display)       │
│      ≈ $115.18 USD  (conversion)        │
├─────────────────────────────────────────┤
│   Sats   ◉          ○ USD  (Toggle)    │
├─────────────────────────────────────────┤
│      Calculator (4x4 grid)              │
│   7  8  9  C                            │
│   4  5  6  ⌫                            │
│   1  2  3  .                             │
│   +  −  ×  ÷                            │
├─────────────────────────────────────────┤
│  ⚡ Lightning Network   ▼               │
│  Network Fees: ~0 sats                  │
│  Total Received: 123,456 sats           │
└─────────────────────────────────────────┘
   [Cancel]    [Generate Invoice]
```

### Design Specifications

**Colors:**

- Primary button: DaisyUI `btn-primary` (Bitcoin orange theme)
- Cancel button: DaisyUI `btn-error`
- Active toggle: `bg-primary`
- Text: `text-base-content` (primary), `text-base-content/70` (secondary)

**Typography:**

- Title: `text-2xl md:text-3xl font-bold`
- Primary amount: `text-4xl md:text-5xl lg:text-6xl font-bold`
- Conversion: `text-sm md:text-base text-base-content/70`
- Calculator buttons: `text-lg font-semibold`

## Functional Requirements

### 1. Live Price Ticker

- Display: `BTC $93,427.18` (current price)
- Source: `cryptoPriceService.getCurrentPrice('BTC')`
- Update: Every 30-60 seconds or on mount

### 2. Amount Display

- **Primary**: Show amount in selected unit (sats or USD), very large, bold, center-aligned
- **Conversion**: Show equivalent in other unit below (smaller, gray)
- Update in real-time as amount changes

### 3. Unit Toggle

- Options: "Sats" and "USD"
- Visual: Radio-style buttons with orange filled circle (◉) for active, empty circle (○) for inactive
- Behavior: Convert amount using current BTC price when switching units, preserve precision

### 4. Calculator Interface

- **Layout**: 4x4 grid of buttons
- **Functions**:
  - Numbers (0-9): Append to current amount
  - Decimal (.): Add decimal point (USD mode only)
  - Clear (C): Reset amount to empty
  - Delete (⌫): Remove last digit
  - Operators (+, −, ×, ÷): Enable users to calculate total amounts directly in the wallet (e.g., add multiple items, calculate fees, etc.)
- **Styling**: Minimum 44px height, DaisyUI button styles, grid layout with gap
- **Validation**:
  - USD mode: Allow decimals
  - Sats mode: Whole numbers only
  - Prevent invalid amounts

### 5. Network Selector

- Display: Pill-shaped button with network name and dropdown arrow
- Options:
  - **Bitcoin networks**: `lightning-bitcoin`, `rootstock-bitcoin`, `liquid-bitcoin`, `bitcoin` (on-chain)
  - **USD networks**: `usdt-bsc` (BSC USDT)
- Behavior: Dropdown menu, show network icon, update fee estimates on change, disable unavailable networks
- Network availability: Check `$walletStore.hasAnyConnection` and network-specific connection states

### 6. Fee Display

- Label: "Network Fees:"
- Value: Estimated fee calculated using existing fee estimation functions
- **Fee Calculation Methods**:
  - **Lightning (reverse swap)**: Service fee (0.25%) + miner fees (~27-34 sats lockup, ~20 sats claim)
  - **Rootstock**: Use `walletManager.estimateRBTCGas(address, amount)` - returns gas fee in RBTC
  - **Liquid (chain swap)**: Get swap pairs via `walletManager.getChainSwapPairs()`, calculate service fee (percentage) + miner fees
  - **BSC USDT**: Use BSC gas estimation (similar to Rootstock)
- Update: Recalculate when amount or network changes
- Display: Show fee in sats with USD equivalent if BTC price available

### 7. Total Received

- Label: "Total Received"
- Value: Net amount after fees (`amount - networkFees - swapFees`)
- Display: Large, prominent (smaller than primary amount)
- Format: Always display in sats
- **Calculation**:
  - For swaps: `amount - serviceFee - minerFee`
  - For direct sends: `amount - gasFee`
  - Real-time update as fees change

### 8. Action Buttons

- **Cancel**: `btn-error`, closes/resets form
- **Generate Invoice** (Receive) / **Send** (Send): `btn-primary`, disabled when invalid, shows loading state

## Component Structure

1. **`WalletPaymentModal.svelte`** - Main modal wrapper (responsive sizing, backdrop, focus trapping, animations)
2. **`ReceivePaymentForm.svelte`** - Payment request form (calculator, amount display, network selector, fee calculations)
   - **Wraps existing components**: Uses `LightningReceive`, `LBTCReceive`, `RSKReceive` for actual invoice generation
   - **Improves UX**: Adds calculator interface, better amount display, real-time fee calculations
3. **`SendPaymentForm.svelte`** - Payment send form with two-tab interface
   - **Tab 1: "Scan QR Code"** (default tab)
     - Uses existing `QrCodeScanner.svelte` component
     - Auto-detects network, amount, memo from scanned QR code
     - Shows confirmation screen with parsed details
     - Conditional amount field if QR code doesn't include amount
   - **Tab 2: "Enter Payment Details"**
     - Address input field with real-time parsing
     - Auto-detects network, amount, memo from address
     - Updates UI based on address type (e.g., disable amount if Lightning invoice has amount)
   - **Wraps existing components**: Uses `SubmarineSend` for Lightning sends, direct send functions for Rootstock/BSC
   - **Improves UX**: Adds calculator interface, better amount display, address validation, automatic network detection
4. **`CalculatorKeypad.svelte`** - Reusable calculator component (4x4 grid, touch-optimized)
   - Implements full calculator operations (+, −, ×, ÷) for calculating totals
5. **`AmountDisplay.svelte`** - Amount display component (primary amount, conversion, unit toggle)
6. **`InvoiceDisplay.svelte`** - Invoice display component (QR code, address, amount, memo, copy/share buttons)
   - Uses existing `generateQrCodeUrl()` function
   - Displays large QR code (300px+ mobile, 400px+ desktop)
   - Copyable address with visual feedback
   - Share functionality (native share sheet on mobile)

## State Management

Use Svelte 5 runes:

```typescript
let amount = $state(''); // Store as string to preserve input
let unit = $state<'sats' | 'usd'>('sats');
let btcPrice = $state<number>(0);
let selectedNetwork = $state('lightning-bitcoin');

// Derived values
let amountInSats = $derived(() => {
	if (unit === 'sats') {
		return Math.floor(parseFloat(amount) || 0);
	} else {
		const usdAmount = parseFloat(amount) || 0;
		if (btcPrice === 0) return 0;
		return Math.floor((usdAmount / btcPrice) * 100_000_000);
	}
});

let amountInUSD = $derived(() => {
	if (unit === 'usd') {
		return parseFloat(amount) || 0;
	} else {
		const sats = parseFloat(amount) || 0;
		return (sats / 100_000_000) * btcPrice;
	}
});
```

## Calculator Logic

The calculator enables users to perform calculations directly in the wallet (e.g., adding multiple items, calculating fees, computing totals).

```typescript
let calculatorValue = $state(''); // Current calculator display
let previousValue = $state<number | null>(null);
let operator = $state<string | null>(null);

function handleCalculatorInput(value: string) {
	if (value === 'C') {
		calculatorValue = '';
		amount = '';
		previousValue = null;
		operator = null;
	} else if (value === '⌫') {
		calculatorValue = calculatorValue.slice(0, -1);
		amount = calculatorValue;
	} else if (value === '.') {
		if (unit === 'sats') return; // No decimals for sats
		if (!calculatorValue.includes('.')) {
			calculatorValue += '.';
			amount = calculatorValue;
		}
	} else if (['+', '−', '×', '÷'].includes(value)) {
		// Store current value and operator
		if (calculatorValue) {
			previousValue = parseFloat(calculatorValue) || 0;
			operator = value;
			calculatorValue = '';
		}
	} else if (value === '=') {
		// Perform calculation
		if (previousValue !== null && operator && calculatorValue) {
			const currentValue = parseFloat(calculatorValue) || 0;
			let result = 0;

			switch (operator) {
				case '+':
					result = previousValue + currentValue;
					break;
				case '−':
					result = previousValue - currentValue;
					break;
				case '×':
					result = previousValue * currentValue;
					break;
				case '÷':
					result = currentValue !== 0 ? previousValue / currentValue : 0;
					break;
			}

			// Update amount with result
			if (unit === 'sats') {
				amount = Math.floor(result).toString();
			} else {
				amount = result.toFixed(2);
			}
			calculatorValue = amount;
			previousValue = null;
			operator = null;
		}
	} else {
		// Number input
		if (unit === 'sats' && calculatorValue.includes('.')) return; // No decimals for sats
		calculatorValue += value;
		amount = calculatorValue;
	}
}
```

## Wallet Initialization

**Critical**: The modal must handle wallet initialization state:

```svelte
{#if $walletStore.isInitializing}
	<div class="loading-state">
		<span class="loading loading-spinner"></span>
		<p>Initializing wallet...</p>
	</div>
{:else if $walletStore.error}
	<div class="error-state">
		<p>Wallet initialization failed</p>
		<button onclick={() => walletManager.initialize()}>Retry</button>
	</div>
{:else if !$walletStore.hasAnyConnection}
	<div class="no-wallet-state">
		<p>Wallet not connected</p>
		<button onclick={() => walletManager.initialize()}>Connect Wallet</button>
	</div>
{:else}
	<!-- Show payment form -->
{/if}
```

## Invoice Generation and Display

### Invoice Content

Invoices should include:

- **Address**: Payment address (Lightning invoice, RBTC address, L-BTC address, or BSC USDT address)
- **Amount**: Requested amount in sats
- **Memo**: Optional description/memo field

### Invoice Generation

**Lightning (reverse swap)**:

- Use existing `LightningReceive.svelte` component logic
- Call `walletManager.reverseSwapService.createReverseSwap()` with amount
- Returns Lightning invoice from Boltz API

**Liquid (chain swap)**:

- Use existing `LBTCReceive.svelte` component logic
- Call `walletManager.chainSwapService.createChainSwap()` with amount
- Returns L-BTC address and payment URI

**Rootstock (direct)**:

- Use existing `RSKReceive.svelte` component logic
- Get address from `walletManager.getRSKWallet().getAddress()`
- Display address as QR code

**BSC USDT**:

- Get BSC wallet address from `walletManager.getBSCWallet().getAddress()`
- Display address as QR code

### Invoice Display

After invoice generation, display using existing QR code generation function:

```svelte
<script lang="ts">
	import generateQrCodeUrl from '$lib/utils/helpers/generateQrCodeUrl';
	import { copyToClipboard } from '$lib/utils/helpers/clipboard';
	import IconContentCopy from '~icons/mdi/content-copy';
	import { appStore } from '$lib/stores/app.store';

	let qrCodeDataUrl = $state('');
	let addressCopied = $state(false);

	// Generate QR code when invoice is created
	$effect(async () => {
		if (invoiceAddress) {
			try {
				qrCodeDataUrl = await generateQrCodeUrl(invoiceAddress);
			} catch (error) {
				console.error('Failed to generate QR code:', error);
				appStore.showErrorToast('Failed to generate QR code');
			}
		}
	});

	async function copyAddress() {
		if (invoiceAddress) {
			await copyToClipboard(invoiceAddress);
			appStore.showSuccessToast($t('wallet.address_copied'));
			addressCopied = true;
			setTimeout(() => {
				addressCopied = false;
			}, 2000);
		}
	}
</script>

<div class="invoice-display space-y-6">
	<!-- Very Large QR Code (minimum 300px on mobile, 400px on desktop) -->
	<div class="qr-code-container flex justify-center">
		{#if qrCodeDataUrl}
			<div class="rounded-lg bg-white p-2 shadow-lg">
				<div class="w-full max-w-[300px] md:max-w-[400px]">
					<img src={qrCodeDataUrl} alt="Payment QR Code" class="h-full w-full" />
				</div>
			</div>
		{:else}
			<div
				class="bg-base-200 flex h-[300px] w-[300px] items-center justify-center rounded-lg md:h-[400px] md:w-[400px]"
			>
				<span class="loading loading-spinner loading-lg"></span>
			</div>
		{/if}
	</div>

	<!-- Address Display (copyable) -->
	<div class="address-display">
		<label class="label">
			<span class="label-text font-semibold">{$t('wallet.address')}</span>
		</label>
		<div class="flex items-center gap-2">
			<button
				class="btn btn-outline h-auto min-h-12 flex-1 justify-start p-3 text-left break-all"
				onclick={copyAddress}
			>
				<code class="text-xs leading-relaxed break-all">
					{invoiceAddress}
				</code>
			</button>
			{#if addressCopied}
				<div class="badge badge-success">{$t('wallet.copied')}</div>
			{/if}
		</div>
	</div>

	<!-- Amount Display -->
	<div class="amount-display">
		<label class="label">
			<span class="label-text font-semibold">{$t('wallet.amount')}</span>
		</label>
		<div class="text-2xl font-bold">{amountInSats.toLocaleString()} sats</div>
		{#if btcPrice > 0}
			<div class="text-base-content/70">
				≈ ${amountInUSD.toFixed(2)} USD
			</div>
		{/if}
	</div>

	<!-- Memo (if provided) -->
	{#if memo}
		<div class="memo-display">
			<label class="label">
				<span class="label-text font-semibold">{$t('wallet.description')}</span>
			</label>
			<div class="text-base">{memo}</div>
		</div>
	{/if}

	<!-- Share Button (mobile) -->
	<button class="btn btn-outline w-full" onclick={shareInvoice}>
		{$t('wallet.share_invoice')}
	</button>
</div>
```

**QR Code Implementation**:

- **Use existing function**: `generateQrCodeUrl()` from `$lib/utils/helpers/generateQrCodeUrl`
- **Function signature**: `generateQrCodeUrl(data: string): Promise<string>`
- **Returns**: Data URL string (can be used directly in `<img src={qrUrl} />`)
- **Features**:
  - Includes BitTasker logo overlay
  - High error correction level ('H') for logo overlay
  - Default width: 256px (can be scaled via CSS)
  - Black on white colors (works with dark mode via white background)
- **Display pattern**: Use `{#await}` blocks or `$effect` with state for async loading
- **Size**: Scale via CSS (minimum 300px on mobile, 400px on desktop) - the function generates 256px base, scale up with CSS
- **Loading state**: Show spinner while QR code is generating

## Send Payment Form - Two-Tab Interface

### Tab Structure

The send payment form uses a two-tab interface:

1. **"Scan QR Code"** (default tab) - Camera-based QR code scanning
2. **"Enter Payment Details"** - Manual address/amount/memo input

### Tab 1: Scan QR Code

**Default Tab**: Opens to QR code scanner by default for better mobile UX.

**Implementation**:

```svelte
<script lang="ts">
	import QrCodeScanner from '$lib/components/QrCodeScanner.svelte';
	import { parsePaymentAddress } from '$lib/utils/helpers/paymentAddressParser';

	let activeTab = $state<'scan' | 'enter'>('scan'); // Default to 'scan'
	let scannedData = $state<PaymentData | null>(null);
	let showConfirmation = $state(false);

	// Payment data structure
	interface PaymentData {
		address: string;
		network: 'lightning-bitcoin' | 'rootstock-bitcoin' | 'liquid-bitcoin' | 'bitcoin' | 'usdt-bsc';
		amount: number | null; // null if not specified in QR code
		memo: string | null;
		rawData: string; // Original scanned data
	}

	async function handleQRScan(barcode: { rawValue: string }) {
		try {
			// Parse the scanned QR code data
			const parsed = await parsePaymentAddress(barcode.rawValue);

			if (!parsed.isValid) {
				appStore.showErrorToast('Invalid payment QR code');
				return;
			}

			scannedData = {
				address: parsed.address,
				network: parsed.network,
				amount: parsed.amount,
				memo: parsed.memo,
				rawData: barcode.rawValue
			};

			// Show confirmation screen
			showConfirmation = true;
		} catch (error) {
			console.error('Failed to parse QR code:', error);
			appStore.showErrorToast('Failed to parse QR code');
		}
	}
</script>

{#if activeTab === 'scan'}
	{#if !showConfirmation}
		<!-- QR Code Scanner -->
		<div class="flex flex-col items-center gap-4">
			<h3 class="text-xl font-bold">{$t('wallet.send.scan_qr_code')}</h3>
			<p class="text-base-content/70 text-sm">{$t('wallet.send.scan_qr_code_description')}</p>

			<QrCodeScanner onScan={handleQRScan} onClose={() => (activeTab = 'enter')} />

			<button class="btn btn-ghost btn-sm" onclick={() => (activeTab = 'enter')}>
				{$t('wallet.send.enter_details_instead')}
			</button>
		</div>
	{:else}
		<!-- Confirmation Screen -->
		<SendConfirmationScreen
			paymentData={scannedData}
			onConfirm={handleSend}
			onEdit={() => {
				showConfirmation = false;
				activeTab = 'enter';
			}}
		/>
	{/if}
{/if}
```

**Confirmation Screen**:

- Shows all parsed details: network, address, amount (if present), memo
- **Conditional amount field**: If QR code doesn't include amount, show editable amount field (required)
- Shows estimated fees
- **Fee calculation**: Fees are added to the amount so the receiver gets the specified amount
  - Example: If receiver wants 100,000 sats and fees are 1,000 sats, user sends 101,000 sats
- "Edit" button to switch to "Enter Payment Details" tab
- **Passkey Authentication**: Require passkey/biometric authentication before sending
  - Check user preference for authentication threshold
  - If amount >= threshold, require authentication
  - Default threshold: $0 (always require authentication for sends)
- **Amount Warning**: If amount > $1,000 USD, show confirmation warning
  - "You're about to send ${amountInUSD.toFixed(2)} USD. This is a large amount. Did you mean to enter this in sats instead?"
  - Show both sats and USD amounts clearly
  - Require explicit confirmation checkbox
- "Send" button to proceed with payment (disabled until authentication and confirmation)

### Tab 2: Enter Payment Details

**Implementation**:

```svelte
{#if activeTab === 'enter'}
	<div class="space-y-6">
		<div class="flex items-center justify-between">
			<h3 class="text-xl font-bold">{$t('wallet.send.enter_payment_details')}</h3>
			<button class="btn btn-ghost btn-sm" onclick={() => (activeTab = 'scan')}>
				{$t('wallet.send.scan_qr_code_instead')}
			</button>
		</div>

		<!-- Address Input with Recent Addresses Dropdown -->
		<div class="form-control">
			<label class="label">
				<span class="label-text">{$t('wallet.send.address_or_invoice')}</span>
			</label>
			<div class="relative">
				<input
					type="text"
					class="input input-bordered w-full"
					placeholder="Enter address, invoice, or scan QR code"
					bind:value={addressInput}
					oninput={handleAddressInput}
					onfocus={() => (showRecentAddresses = true)}
				/>
				{#if showRecentAddresses && recentAddresses.length > 0}
					<div
						class="bg-base-100 border-base-300 absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border shadow-lg"
					>
						{#each recentAddresses as recentAddress}
							<button
								class="hover:bg-base-200 flex w-full items-center justify-between px-4 py-2 text-left"
								onclick={() => {
									addressInput = recentAddress.address;
									showRecentAddresses = false;
									handleAddressInput();
								}}
							>
								<div class="min-w-0 flex-1">
									<div class="truncate font-semibold">
										{recentAddress.label || recentAddress.address.slice(0, 20)}...
									</div>
									{#if recentAddress.network}
										<div class="text-base-content/70 text-xs">{recentAddress.network}</div>
									{/if}
								</div>
								<div class="text-base-content/50 ml-2 text-xs">
									{recentAddress.lastUsed ? formatDate(recentAddress.lastUsed) : ''}
								</div>
							</button>
						{/each}
					</div>
				{/if}
			</div>
			{#if addressError}
				<div class="label">
					<span class="label-text-alt text-error">{addressError}</span>
				</div>
			{/if}
		</div>

		<!-- Auto-detected Network Display -->
		{#if detectedNetwork}
			<div class="alert alert-info">
				<span>Network: {detectedNetwork}</span>
			</div>
		{/if}

		<!-- Amount Field (conditional) -->
		{#if amountRequired}
			<div class="form-control">
				<label class="label">
					<span class="label-text">{$t('wallet.send.amount')}</span>
				</label>
				<!-- Use calculator interface here -->
				<AmountDisplay {amount} {unit} onAmountChange={(val) => (amount = val)} />
				<CalculatorKeypad onInput={handleCalculatorInput} />
			</div>
		{:else if detectedAmount}
			<div class="alert alert-success">
				<span>Amount: {detectedAmount.toLocaleString()} sats (from invoice)</span>
			</div>
		{/if}

		<!-- Memo Field (if detected) -->
		{#if detectedMemo}
			<div class="form-control">
				<label class="label">
					<span class="label-text">{$t('wallet.send.memo')}</span>
				</label>
				<input type="text" class="input input-bordered w-full" bind:value={memo} disabled />
			</div>
		{/if}

		<!-- Fee Display -->
		{#if estimatedFees}
			<div class="card bg-base-200 p-4">
				<div class="flex justify-between">
					<span>Network Fees:</span>
					<span>{estimatedFees.toLocaleString()} sats</span>
				</div>
				<div class="flex justify-between font-bold">
					<span>Total to Send:</span>
					<span>{(detectedAmount || amount) + estimatedFees} sats</span>
				</div>
			</div>
		{/if}
	</div>
{/if}
```

### Recent Addresses Dropdown

**Load recent addresses from transaction history**:

```typescript
import { loadTransactions } from '$lib/utils/wallet/transactionHistory';

interface RecentAddress {
	address: string;
	network: string;
	label?: string;
	lastUsed: Date;
	count: number; // Number of times used
}

let recentAddresses = $state<RecentAddress[]>([]);
let showRecentAddresses = $state(false);

async function loadRecentAddresses() {
	try {
		const transactions = await loadTransactions();

		// Extract unique addresses from sent transactions
		const addressMap = new Map<string, RecentAddress>();

		transactions
			.filter((tx) => tx.type === 'sent')
			.forEach((tx) => {
				const existing = addressMap.get(tx.to);
				if (existing) {
					existing.count++;
					if (new Date(tx.date) > existing.lastUsed) {
						existing.lastUsed = new Date(tx.date);
					}
				} else {
					addressMap.set(tx.to, {
						address: tx.to,
						network: tx.network,
						lastUsed: new Date(tx.date),
						count: 1
					});
				}
			});

		// Sort by last used (most recent first), limit to 10
		recentAddresses = Array.from(addressMap.values())
			.sort((a, b) => b.lastUsed.getTime() - a.lastUsed.getTime())
			.slice(0, 10);
	} catch (error) {
		console.error('Failed to load recent addresses:', error);
	}
}

// Load on component mount
$effect(() => {
	loadRecentAddresses();
});
```

**Display in Address Input**:

- Show dropdown when input is focused and has recent addresses
- Display address (truncated), network, and last used date
- Click to auto-fill address
- Close dropdown when address is selected or input loses focus

### Address Parsing Logic

**Use existing parsing functions**:

```typescript
import { detectLightningType, parseLightningInvoice } from '$lib/utils/helpers/lightningInvoice';
import { validateRSKAddress } from '$lib/utils/helpers/validators';
import { validateBitcoinAddress } from '$lib/utils/helpers/validators';

async function parsePaymentAddress(input: string): Promise<{
	isValid: boolean;
	address: string;
	network: string | null;
	amount: number | null;
	memo: string | null;
}> {
	const trimmed = input.trim();

	// 1. Check for Lightning invoice/address
	const lightningType = detectLightningType(trimmed);
	if (lightningType === 'bolt11') {
		const parsed = parseLightningInvoice(trimmed);
		return {
			isValid: parsed.isValid,
			address: trimmed,
			network: 'lightning-bitcoin',
			amount: parsed.amountSats,
			memo: null // Lightning invoices don't include memo in QR code typically
		};
	}

	if (lightningType === 'lightning-address') {
		return {
			isValid: true,
			address: trimmed,
			network: 'lightning-bitcoin',
			amount: null, // Lightning addresses require amount to be specified
			memo: null
		};
	}

	// 2. Check for RSK address (with optional query params)
	if (validateRSKAddress(trimmed.split('?')[0]).isValid) {
		const url = new URL(trimmed.includes('://') ? trimmed : `rsk:${trimmed}`);
		const params = url.searchParams;

		let amount: number | null = null;
		if (params.has('value')) {
			// Convert wei to sats: 1 sat = 1e10 wei
			const wei = BigInt(params.get('value')!);
			amount = Number(wei / BigInt(1e10));
		}

		return {
			isValid: true,
			address: url.pathname || trimmed.split('?')[0],
			network: 'rootstock-bitcoin',
			amount,
			memo: params.get('message') || null
		};
	}

	// 3. Check for Bitcoin address (with optional amount/memo)
	if (validateBitcoinAddress(trimmed.split('?')[0]).isValid) {
		const url = new URL(trimmed.includes('://') ? trimmed : `bitcoin:${trimmed}`);
		const params = url.searchParams;

		let amount: number | null = null;
		if (params.has('amount')) {
			// Convert BTC to sats
			const btc = parseFloat(params.get('amount')!);
			amount = Math.floor(btc * 100_000_000);
		}

		return {
			isValid: true,
			address: url.pathname || trimmed.split('?')[0],
			network: 'bitcoin',
			amount,
			memo: params.get('label') || params.get('message') || null
		};
	}

	// 4. Check for Liquid address
	// Similar parsing for Liquid addresses with assetid parameter

	// 5. Check for BSC USDT address
	// Similar parsing for BSC addresses

	return {
		isValid: false,
		address: trimmed,
		network: null,
		amount: null,
		memo: null
	};
}

function handleAddressInput() {
	if (!addressInput) {
		detectedNetwork = null;
		detectedAmount = null;
		detectedMemo = null;
		amountRequired = true;
		return;
	}

	parsePaymentAddress(addressInput).then((parsed) => {
		if (parsed.isValid) {
			detectedNetwork = parsed.network;
			detectedAmount = parsed.amount;
			detectedMemo = parsed.memo;

			// Amount field is required if address doesn't include amount
			amountRequired = parsed.amount === null;

			// If amount is detected, disable amount field
			if (parsed.amount !== null) {
				amount = parsed.amount;
			}

			// Recalculate fees when network/amount changes
			calculateFees();
		} else {
			addressError = 'Invalid address format';
			detectedNetwork = null;
			detectedAmount = null;
			detectedMemo = null;
			amountRequired = true;
		}
	});
}
```

### Fee Calculation for Send

**Critical**: Fees are added to the amount so the receiver gets the specified amount.

```typescript
let amountToSend = $derived(() => {
	const baseAmount = detectedAmount || amount || 0;
	const fees = estimatedFees || 0;

	// For sends: total = baseAmount + fees
	// Receiver gets: baseAmount
	// Network gets: fees
	return baseAmount + fees;
});

let receiverGets = $derived(() => {
	return detectedAmount || amount || 0;
});
```

**Display**:

```svelte
<div class="fee-breakdown">
	<div class="flex justify-between">
		<span>Amount to Receive:</span>
		<span>{receiverGets.toLocaleString()} sats</span>
	</div>
	<div class="flex justify-between">
		<span>Network Fees:</span>
		<span>{estimatedFees.toLocaleString()} sats</span>
	</div>
	<div class="flex justify-between text-lg font-bold">
		<span>Total to Send:</span>
		<span>{amountToSend.toLocaleString()} sats</span>
	</div>
</div>
```

### Network-Specific Behavior

**Lightning Invoice with Amount**:

- Network: Auto-selected to `lightning-bitcoin`
- Amount: Disabled (read-only, shows amount from invoice)
- Memo: Not typically included in Lightning invoices

**Lightning Invoice without Amount**:

- Network: Auto-selected to `lightning-bitcoin`
- Amount: Enabled and required
- Memo: Not typically included

**RSK Address with Query Params**:

- Network: Auto-selected to `rootstock-bitcoin`
- Amount: If `?value=` present, disabled and shows amount; otherwise enabled and required
- Memo: If `?message=` present, shows in memo field

**Bitcoin Address with URI**:

- Network: Auto-selected to `bitcoin`
- Amount: If `?amount=` present, disabled and shows amount; otherwise enabled and required
- Memo: If `?label=` or `?message=` present, shows in memo field

**Liquid/BSC Addresses**:

- Similar parsing logic for Liquid and BSC addresses
- Network auto-detected based on address format

## Success Flow and Background Monitoring

### Transaction Monitoring

After invoice generation, monitor for payment in the background:

**Lightning (reverse swap)**:

- Monitor swap status via `walletManager.reverseSwapService.getSwap(swapId)`
- Poll every 5 seconds
- Success states: `invoice.settled`
- Show success screen when status reaches success state

**Liquid (chain swap)**:

- Monitor swap status via `walletManager.chainSwapService.getSwap(swapId)`
- Poll every 5 seconds
- Success states: `transaction.claimed`
- Show success screen when status reaches success state

**Rootstock (direct)**:

- Monitor transaction history for incoming transactions
- Check `walletManager.loadTransactions()` periodically
- Match by address and amount
- Show success screen when transaction confirmed

**BSC USDT**:

- Monitor transaction history for incoming USDT transactions
- Check `walletManager.loadTransactions()` periodically
- Match by address and amount
- Show success screen when transaction confirmed

### Success Screen

When payment is received, show success screen:

```svelte
<div class="success-screen">
	<div class="success-icon">
		<svg class="text-success h-24 w-24">...</svg>
	</div>
	<h2 class="text-3xl font-bold">Payment Received!</h2>
	<div class="amount-display">
		<div class="text-4xl font-bold">{amountInSats.toLocaleString()} sats</div>
		<div class="text-base-content/70">≈ ${amountInUSD.toFixed(2)} USD</div>
	</div>
	<div class="transaction-details">
		<div>Network: {selectedNetwork}</div>
		<div>Transaction: {txHash}</div>
	</div>
	<div class="flex flex-col gap-2">
		<a href={explorerUrl} target="_blank" rel="noopener noreferrer" class="btn btn-outline">
			{$t('wallet.send.success.view_on_explorer')}
		</a>
		<button class="btn btn-primary" onclick={handleClose}> Done </button>
	</div>
</div>
```

**Success Screen Behavior**:

- Auto-close after 5 seconds (optional)
- Allow manual close
- Update wallet balance display
- Show success toast notification
- Return to wallet page or close modal
- **Explorer Link**: Show "View on Explorer" button that opens transaction in blockchain explorer
  - Rootstock: `https://explorer.rsk.co/tx/{txHash}`
  - BSC: `https://bscscan.com/tx/{txHash}`
  - Bitcoin: `https://blockstream.info/tx/{txHash}` (or similar)
  - Lightning: Link to Lightning explorer if available

## Authentication and Security

### Passkey Authentication for Sends

**All send operations must require passkey/biometric authentication**:

```typescript
import { getBiometricData } from '$lib/utils/helpers/biometrics';
import { getWebBiometricData } from '$lib/utils/helpers/webBiometrics';
import { Capacitor } from '@capacitor/core';

async function requireAuthentication(): Promise<boolean> {
	try {
		// Check if amount exceeds user's authentication threshold
		const threshold = await getUserAuthThreshold(); // Get from user preferences
		const amountUSD = amountInUSD;

		if (amountUSD >= threshold) {
			// Determine authentication method (biometrics or passkey)
			const isMobile = Capacitor.getPlatform() !== 'web';
			const authMethod = isMobile ? 'biometrics' : 'passkey';

			if (isMobile) {
				const biometricData = await getBiometricData('biometrics', true);
				return !!biometricData;
			} else {
				const passkeyData = await getWebBiometricData(true);
				return !!passkeyData;
			}
		}

		return true; // Below threshold, no authentication required
	} catch (error) {
		console.error('Authentication failed:', error);
		return false;
	}
}
```

**User Preference for Authentication Threshold**:

- Settings option: "Require authentication for sends over: $X"
- Default: $0 (always require authentication)
- Options: $0, $10, $50, $100, $500, $1000, Custom
- Stored in user preferences/settings

**Implementation**:

```svelte
<script lang="ts">
	let authThreshold = $state(0); // Get from user preferences
	let requiresAuth = $derived(amountInUSD >= authThreshold);
	let isAuthenticated = $state(false);

	async function handleSend() {
		if (requiresAuth && !isAuthenticated) {
			const authenticated = await requireAuthentication();
			if (!authenticated) {
				appStore.showErrorToast('Authentication required to send');
				return;
			}
			isAuthenticated = true;
		}

		// Proceed with send
		await executeSend();
	}
</script>

{#if requiresAuth && !isAuthenticated}
	<div class="alert alert-warning">
		<span>Authentication required to send this amount</span>
		<button class="btn btn-sm" onclick={handleSend}> Authenticate & Send </button>
	</div>
{/if}
```

### Large Amount Confirmation Warning

**For amounts over $1,000 USD**, show a confirmation warning to prevent sats/USD confusion:

```svelte
<script lang="ts">
	const LARGE_AMOUNT_THRESHOLD = 1000; // $1,000 USD
	let showLargeAmountWarning = $derived(amountInUSD > LARGE_AMOUNT_THRESHOLD);
	let largeAmountConfirmed = $state(false);
</script>

{#if showLargeAmountWarning && !largeAmountConfirmed}
	<div class="alert alert-error">
		<svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				stroke-width="2"
				d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
			></path>
		</svg>
		<div class="flex-1">
			<h3 class="font-bold">{$t('wallet.send.large_amount_warning.title')}</h3>
			<div class="text-sm">
				<p>
					{$t('wallet.send.large_amount_warning.message', {
						values: { amount: amountInUSD.toFixed(2) }
					})}
				</p>
				<div class="bg-base-200 mt-2 rounded p-2">
					<div>Amount in Sats: <strong>{amountInSats.toLocaleString()} sats</strong></div>
					<div>Amount in USD: <strong>${amountInUSD.toFixed(2)}</strong></div>
				</div>
			</div>
			<div class="form-control mt-4">
				<label class="label cursor-pointer justify-start gap-2">
					<input
						type="checkbox"
						class="checkbox checkbox-error"
						bind:checked={largeAmountConfirmed}
					/>
					<span class="label-text">{$t('wallet.send.large_amount_warning.confirm_checkbox')}</span>
				</label>
			</div>
		</div>
	</div>
{/if}
```

**Warning Behavior**:

- Show warning when amount > $1,000 USD
- Display both sats and USD amounts clearly
- Require explicit confirmation checkbox
- Disable send button until confirmed
- Highlight the amount in both units for clarity

## Amount Validation

### Validation Rules

```typescript
// Balance check
const availableBalance = $derived(() => {
	const asset = $allAssets.find((a) => {
		if (selectedNetwork === 'rootstock-bitcoin') return a.network === 'RSK';
		if (selectedNetwork === 'usdt-bsc') return a.network === 'BSC' && a.ticker === 'USDT';
		// Add other network mappings
	});
	return asset?.balance || 0;
});

// Minimum amounts
const MIN_AMOUNTS = {
	'lightning-bitcoin': 1, // 1 sat minimum
	'rootstock-bitcoin': 1000, // Dust limit
	'liquid-bitcoin': 100, // Minimum for swaps
	'usdt-bsc': 1, // 1 wei minimum (but show in USDT units)
	bitcoin: 546 // Bitcoin dust limit
};

// Maximum amounts (from swap limits)
let maxAmount = $state<number>(Infinity);

async function loadMaxAmount() {
	if (selectedNetwork === 'lightning-bitcoin' || selectedNetwork === 'liquid-bitcoin') {
		const swapLimits = await walletManager.getSwapLimits();
		maxAmount = swapLimits[selectedNetwork]?.max || Infinity;
	} else {
		maxAmount = Infinity;
	}
}

// Real-time validation
const amountValidation = $derived(() => {
	const amountNum = parseFloat(amount) || 0;
	const minAmount = MIN_AMOUNTS[selectedNetwork] || 1;

	if (amountNum < minAmount) {
		return {
			isValid: false,
			error: `Minimum amount is ${minAmount} ${unit === 'sats' ? 'sats' : 'USD'}`
		};
	}

	if (amountNum > maxAmount) {
		return {
			isValid: false,
			error: `Maximum amount is ${maxAmount.toLocaleString()} ${unit === 'sats' ? 'sats' : 'USD'}`
		};
	}

	// Check balance (for send mode)
	if (mode === 'send' && amountNum > availableBalance) {
		return {
			isValid: false,
			error: 'Insufficient balance'
		};
	}

	return { isValid: true };
});
```

### Validation Display

```svelte
{#if !amountValidation.isValid}
	<div class="alert alert-error alert-sm">
		<span>{amountValidation.error}</span>
	</div>
{/if}

<!-- Show available balance -->
<div class="text-base-content/70 text-sm">
	Available: {availableBalance.toLocaleString()}
	{unit === 'sats' ? 'sats' : 'USD'}
</div>
```

## Integration

### With Wallet Page

**Keep balance page, convert other tabs to buttons that launch full-screen modals:**

```svelte
<!-- wallet/+page.svelte -->
<script lang="ts">
	import BalanceCard from '$lib/components/wallet/BalanceCard.svelte';
	import WalletPaymentModal from '$lib/components/wallet/WalletPaymentModal.svelte';

	let showReceiveModal = $state(false);
	let showSendModal = $state(false);
	let showBuySellModal = $state(false);
	let showSwapModal = $state(false);
</script>

<div class="wallet-page">
	<!-- Keep existing balance card -->
	<BalanceCard />

	<!-- Convert tabs to buttons -->
	<div class="mt-6 flex flex-col gap-3">
		<button class="btn btn-primary btn-lg" onclick={() => (showReceiveModal = true)}>
			{$t('wallet.tab_receive')}
		</button>

		<button class="btn btn-secondary btn-lg" onclick={() => (showSendModal = true)}>
			{$t('wallet.tab_send')}
		</button>

		<button class="btn btn-outline btn-lg" onclick={() => (showBuySellModal = true)}>
			{$t('wallet.tab_buy_sell')}
		</button>

		<button class="btn btn-outline btn-lg" onclick={() => (showSwapModal = true)}>
			{$t('wallet.tab_swap')}
		</button>
	</div>
</div>

<!-- Modals -->
<WalletPaymentModal
	isOpen={showReceiveModal}
	mode="receive"
	onClose={() => (showReceiveModal = false)}
	onSuccess={handleReceiveSuccess}
/>

<WalletPaymentModal
	isOpen={showSendModal}
	mode="send"
	onClose={() => (showSendModal = false)}
	onSuccess={handleSendSuccess}
/>
```

### With Existing Components

**New modal components should use existing functionality while improving UX:**

- **ReceivePaymentForm**:

  - Wraps `LightningReceive`, `LBTCReceive`, `RSKReceive` components
  - Adds calculator interface, improved amount display, real-time fee calculations
  - Uses existing swap services for invoice generation
  - Maintains existing swap monitoring logic

- **SendPaymentForm**:

  - Wraps `SubmarineSend` for Lightning sends
  - Uses existing `walletManager.sendRBTC()` for Rootstock sends
  - Uses existing `walletManager.sendBSCUSDT()` for BSC USDT sends
  - Adds calculator interface, improved amount display, address validation

- **Fee Calculations**:

  - Reuse `walletManager.estimateRBTCGas()` for Rootstock
  - Reuse `walletManager.getSubmarineSwapPairs()` for Lightning fee breakdown
  - Reuse `walletManager.getChainSwapPairs()` for Liquid fee breakdown
  - Reuse existing BSC gas estimation for BSC USDT

- **Validation**:

  - Reuse `validateRSKAddress()`, `validateBitcoinAddress()`, `validateLightningInvoice()`
  - Reuse existing balance checks from `$allAssets`
  - Reuse existing swap limits from `walletManager.getSwapLimits()`

- **QR Code Generation**:

  - Use existing `generateQrCodeUrl()` from `$lib/utils/helpers/generateQrCodeUrl`
  - Function signature: `generateQrCodeUrl(data: string): Promise<string>`
  - Returns data URL string for direct use in `<img src={qrUrl} />`
  - Includes BitTasker logo overlay automatically
  - High error correction level ('H') for logo overlay
  - Default width: 256px (scale via CSS for larger displays)
  - Usage pattern: `const qrUrl = await generateQrCodeUrl(invoiceAddress);`

- **QR Code Scanning**:
  - Use existing `QrCodeScanner.svelte` component
  - Props: `onScan={(barcode) => {...}}`, `onClose={() => {...}}`
  - Handles permissions, camera access, torch, zoom
  - Returns scanned barcode via `onScan` callback
  - Usage: `<QrCodeScanner onScan={handleQRScan} onClose={() => qrScannerActive = false} />`

## Mobile Optimizations

### Touch Targets

- Minimum 44x44px for all interactive elements
- Calculator buttons: 60-70px height on mobile
- Action buttons: 48-56px height, full-width on mobile
- Minimum 8px gap between touch targets

### Touch Feedback

- Use Tailwind classes: `touch-manipulation select-none active:scale-95 transition-transform duration-100`
- Optional haptic feedback via Capacitor Haptics plugin
- Inline style: `-webkit-tap-highlight-color: transparent`

### Gestures

- Swipe down to close modal (optional enhancement)
- Threshold: 100px or 30% of screen height

### Keyboard Handling

- Don't auto-focus amount input (prevents mobile keyboard popup)
- Use calculator buttons instead of native keyboard
- Desktop: Support numeric keypad, Escape to close, Enter to submit, Backspace to delete, C to clear

### Performance

- Use `will-change-transform` and `transform-gpu` for animations
- Lazy load BTC price on modal open
- Defer network fee calculations until needed
- Respect `prefers-reduced-motion`

### Haptic Feedback and Animations

**Haptic Feedback** (Mobile):

- Use Capacitor Haptics plugin for tactile feedback
- Trigger on:
  - Calculator button presses
  - Successful QR code scan
  - Send button press
  - Authentication success
  - Transaction confirmation
- Intensity: Light for button presses, Medium for confirmations, Heavy for errors

```typescript
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Capacitor } from '@capacitor/core';

async function triggerHaptic(style: ImpactStyle = ImpactStyle.Light) {
  try {
    if (Capacitor.getPlatform() !== 'web') {
      await Haptics.impact({ style });
    }
  } catch (error) {
    // Haptics not available, fail silently
  }
}

// Usage
onclick={() => {
  triggerHaptic(ImpactStyle.Light);
  handleCalculatorInput('5');
}}
```

**Animations**:

- **Button Press**: `active:scale-95 transition-transform duration-100`
- **Modal Open**: Svelte `fly` transition for mobile, `scale` for desktop
- **Success Screen**: Fade in with scale animation
- **Amount Changes**: Subtle pulse animation on amount display
- **Fee Updates**: Smooth number transitions
- **QR Code Scan**: Success animation (checkmark with scale)
- **Loading States**: Smooth spinner animations
- **Error States**: Shake animation for invalid inputs

```svelte
<!-- Success Animation -->
<div
	class="success-icon"
	transition:scale={{ duration: 300, delay: 100 }}
	style="animation: successPulse 0.6s ease-out;"
>
	<svg class="text-success h-24 w-24">...</svg>
</div>

<!-- Amount Display Pulse on Change -->
<div class="amount-display" class:pulse={amountChanged}>
	{amountInSats.toLocaleString()} sats
</div>

<style>
	@keyframes successPulse {
		0% {
			transform: scale(0);
			opacity: 0;
		}
		50% {
			transform: scale(1.1);
		}
		100% {
			transform: scale(1);
			opacity: 1;
		}
	}

	.pulse {
		animation: pulse 0.3s ease-out;
	}

	@keyframes pulse {
		0%,
		100% {
			transform: scale(1);
		}
		50% {
			transform: scale(1.02);
		}
	}
</style>
```

**Animation Guidelines**:

- Keep animations subtle and purposeful
- Respect `prefers-reduced-motion` (disable animations if user prefers)
- Use CSS transforms for performance (GPU-accelerated)
- Duration: 100-300ms for interactions, 300-600ms for state changes
- Easing: `ease-out` for most animations, `ease-in-out` for transitions

## Accessibility

- **ARIA Labels**: All buttons must have descriptive labels
- **Keyboard Navigation**: Full keyboard support for calculator
- **Screen Reader**: Announce amount changes, fee updates (`aria-live="polite"`)
- **Focus Management**: Trap focus within modal, return focus on close
- **Color Contrast**: Meet WCAG 2.1 AA standards (4.5:1 for normal text)

## Translation Requirements

All text must use `svelte-i18n`:

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
			"send_button": "Send",
			"scan_qr_code": "Scan QR Code",
			"scan_qr_code_description": "Point your camera at a payment QR code",
			"enter_payment_details": "Enter Payment Details",
			"enter_details_instead": "Enter Details Instead",
			"scan_qr_code_instead": "Scan QR Code Instead",
			"address_or_invoice": "Address or Invoice",
			"amount": "Amount",
			"memo": "Memo",
			"confirmation": {
				"title": "Confirm Payment",
				"network": "Network",
				"address": "Address",
				"amount_to_receive": "Amount to Receive",
				"network_fees": "Network Fees",
				"total_to_send": "Total to Send",
				"edit": "Edit",
				"send": "Send Payment",
				"auth_required": "Authentication required to send",
				"authenticate_and_send": "Authenticate & Send"
			},
			"large_amount_warning": {
				"title": "Large Amount Warning",
				"message": "You're about to send {amount} USD. This is a large amount. Did you mean to enter this in sats instead?",
				"confirm_checkbox": "I confirm this is the correct amount in USD"
			},
			"recent_addresses": {
				"title": "Recent Addresses",
				"no_recent": "No recent addresses"
			},
			"success": {
				"view_on_explorer": "View on Explorer",
				"payment_sent": "Payment Sent!",
				"transaction_hash": "Transaction Hash"
			}
		},
		"calculator": {
			"clear": "C",
			"delete": "⌫"
		}
	}
}
```

## Design System Compliance

- **Use DaisyUI Components**: Prefer DaisyUI buttons, cards, inputs
- **Use Tailwind CSS Only**: All styling with Tailwind utility classes - no custom CSS
- **Follow Brand Colors**: Use semantic color names (`btn-primary`, `btn-error`)
- **Consistent Spacing**: Use Tailwind spacing scale (p-4, p-6, gap-3, space-y-6)
- **Typography**: Use Tailwind typography utilities (text-2xl, font-bold)
- **Responsive Design**: Use Tailwind breakpoints (lg:, md:, sm:)

## Implementation Steps

**CRITICAL**: All tests must pass before proceeding to the next step. Run `npm run test:unit` after each component/function implementation and fix any failing tests before continuing.

### Phase 1: Modal Infrastructure

#### Step 1: Create `WalletPaymentModal.svelte`

Create `WalletPaymentModal.svelte` with responsive sizing, backdrop, focus trapping, safe area support.

**REQUIRED TESTS** (Run `npm run test:unit` - all must pass):

**Unit Tests** (`src/lib/tests/components/WalletPaymentModal.test.ts`):

- Modal opens when `isOpen={true}`
- Modal closes when `isOpen={false}`
- Backdrop click closes modal (calls `onClose`)
- Escape key closes modal
- Focus is trapped within modal when open
- Focus returns to trigger element when closed
- Body scroll is locked when modal is open
- Body scroll is unlocked when modal is closed
- Safe area insets are applied on mobile
- Responsive sizing: full-screen on mobile, centered on desktop
- Respects `prefers-reduced-motion` for animations

**Component Tests** (`src/lib/tests/components/WalletPaymentModal.test.ts`):

- Renders modal content when open
- Does not render modal content when closed
- Calls `onClose` when cancel button is clicked
- Calls `onSuccess` when success callback is triggered
- Modal header displays correct title based on mode
- Modal footer displays correct action buttons
- Keyboard navigation works (Tab, Shift+Tab, Escape)
- ARIA attributes are correct (`role="dialog"`, `aria-modal="true"`, `aria-labelledby`)

**Integration Tests** (`tests/integration/wallet-modal.spec.ts`):

- Modal opens from wallet page button click
- Modal closes and returns to wallet page
- Modal state persists during navigation
- Multiple modals cannot be open simultaneously

**MOCKING REQUIREMENTS**:

- Mock `authState` store to simulate logged-in user:

  ```typescript
  import { authState } from '$lib/stores/auth.store';
  import { get } from 'svelte/store';

  // In test setup
  authState.login(); // Simulate logged-in state
  expect(get(authState).isAuthenticated).toBe(true);
  ```

- Mock `Preferences` (already mocked in `vitest-setup-client.ts`)
- Mock `walletStore` to provide wallet connection state

**TEST COMMAND**: `npm run test:unit -- WalletPaymentModal`

---

### Phase 2: Core Components

#### Step 2: Create `CalculatorKeypad.svelte`

Create `CalculatorKeypad.svelte` (4x4 grid, touch-optimized, 44px+ height).

**REQUIRED TESTS** (Run `npm run test:unit` - all must pass):

**Unit Tests** (`src/lib/tests/components/CalculatorKeypad.test.ts`):

- All number buttons (0-9) trigger `onInput` callback with correct value
- Decimal button (.) triggers `onInput` callback
- Clear button (C) triggers `onInput` callback with 'C'
- Delete button (⌫) triggers `onInput` callback with '⌫'
- Operator buttons (+, −, ×, ÷) trigger `onInput` callback with correct operator
- Decimal button is disabled in sats mode
- Decimal button is enabled in USD mode
- Buttons have minimum 44px height for touch targets
- Buttons have proper ARIA labels

**Component Tests** (`src/lib/tests/components/CalculatorKeypad.test.ts`):

- Renders 4x4 grid layout correctly
- All buttons are visible and clickable
- Button press triggers haptic feedback (mocked)
- Button press applies active state styling
- Keyboard input works (numbers, operators, Backspace, Delete, Escape)
- Respects `prefers-reduced-motion` for animations

**Integration Tests** (`tests/integration/calculator-keypad.spec.ts`):

- Calculator input updates amount display in parent component
- Calculator operations (+, −, ×, ÷) work correctly
- Calculator state resets when Clear is pressed
- Calculator integrates with amount validation

**TEST COMMAND**: `npm run test:unit -- CalculatorKeypad`

---

#### Step 3: Create `AmountDisplay.svelte`

Create `AmountDisplay.svelte` (large display, conversion, unit toggle).

**REQUIRED TESTS** (Run `npm run test:unit` - all must pass):

**Unit Tests** (`src/lib/tests/utils/amountConversion.test.ts`):

- Converts sats to USD correctly using BTC price
- Converts USD to sats correctly using BTC price
- Handles zero amount
- Handles very large amounts (max sats)
- Handles decimal amounts in USD mode
- Rounds sats to whole numbers (no decimals)
- Preserves precision when switching units
- Handles missing/invalid BTC price gracefully

**Component Tests** (`src/lib/tests/components/AmountDisplay.test.ts`):

- Displays amount in primary unit (sats or USD)
- Displays conversion in secondary unit
- Unit toggle switches between sats and USD
- Active unit is visually highlighted
- Amount updates reactively when amount prop changes
- Conversion updates reactively when BTC price changes
- Large amount display uses correct font size
- Conversion display uses correct font size and color
- ARIA live region announces amount changes

**Integration Tests** (`tests/integration/amount-display.spec.ts`):

- Amount display integrates with calculator input
- Unit toggle updates amount correctly
- BTC price updates trigger conversion recalculation
- Amount display integrates with network fee calculations

**TEST COMMAND**: `npm run test:unit -- AmountDisplay`

---

#### Step 4: Create `ReceivePaymentForm.svelte`

Create `ReceivePaymentForm.svelte` (integrate calculator, network selector, fee calculations).

**REQUIRED TESTS** (Run `npm run test:unit` - all must pass):

**Unit Tests** (`src/lib/tests/utils/feeCalculation.test.ts`):

- Lightning reverse swap fee calculation (0.25% service fee + miner fees)
- Rootstock gas fee estimation using `walletManager.estimateRBTCGas()`
- Liquid chain swap fee calculation (service fee + miner fees)
- BSC USDT gas fee estimation
- Fee calculation handles zero amount
- Fee calculation handles very large amounts
- Fee calculation updates when network changes
- Fee calculation updates when amount changes
- Total received calculation (amount - fees) is correct

**Component Tests** (`src/lib/tests/components/ReceivePaymentForm.test.ts`):

- Renders calculator keypad
- Renders amount display
- Renders network selector
- Renders fee display
- Renders total received display
- Network selector shows available networks
- Network selector disables unavailable networks
- Fee display updates when network changes
- Fee display updates when amount changes
- Total received updates when fees change
- Generate Invoice button is disabled when amount is invalid
- Generate Invoice button is enabled when amount is valid
- Cancel button closes modal
- Form validation shows errors for invalid amounts
- Form validation shows errors for insufficient balance (if applicable)

**Integration Tests** (`tests/integration/receive-payment-form.spec.ts`):

- Form integrates with `LightningReceive` component for Lightning invoices
- Form integrates with `LBTCReceive` component for Liquid invoices
- Form integrates with `RSKReceive` component for Rootstock addresses
- Form integrates with BSC wallet for USDT addresses
- Invoice generation calls correct service based on network
- Invoice generation handles errors gracefully
- Invoice generation shows loading state
- Invoice generation shows success state with invoice display

**MOCKING REQUIREMENTS**:

- Mock `walletManager` and its methods:
  ```typescript
  vi.mock('$lib/utils/wallet/walletManager', () => ({
    walletManager: {
      estimateRBTCGas: vi.fn().mockResolvedValue(21000),
      getChainSwapPairs: vi.fn().mockResolvedValue([...]),
      reverseSwapService: {
        createReverseSwap: vi.fn().mockResolvedValue({ invoice: 'lnbc...' })
      },
      chainSwapService: {
        createChainSwap: vi.fn().mockResolvedValue({ address: '...' })
      }
    }
  }));
  ```
- Mock `cryptoPriceService`:
  ```typescript
  vi.mock('$lib/services/cryptoPriceService', () => ({
  	cryptoPriceService: {
  		getCurrentPrice: vi.fn().mockResolvedValue(93427.18)
  	}
  }));
  ```
- Mock `walletStore`:
  ```typescript
  vi.mock('$lib/stores/wallet.store', () => ({
  	walletStore: {
  		subscribe: vi.fn((fn) => {
  			fn({ hasAnyConnection: true, isInitializing: false });
  			return () => {};
  		})
  	}
  }));
  ```

**TEST COMMAND**: `npm run test:unit -- ReceivePaymentForm`

---

#### Step 5: Create `SendPaymentForm.svelte`

Create `SendPaymentForm.svelte` with two-tab interface, address parsing, authentication, and all features.

**REQUIRED TESTS** (Run `npm run test:unit` - all must pass):

**Unit Tests** (`src/lib/tests/utils/addressParsing.test.ts`):

- Parses Lightning BOLT11 invoice correctly
- Parses Lightning BOLT12 invoice correctly
- Parses Lightning address correctly
- Parses RSK address with query params (`?value=`, `?message=`)
- Parses Bitcoin address with URI (`?amount=`, `?label=`, `?message=`)
- Parses Liquid address correctly
- Parses BSC USDT address correctly
- Detects network from address format
- Extracts amount from address/invoice when present
- Extracts memo from address/invoice when present
- Returns `null` for invalid addresses
- Handles addresses without amount (requires user input)
- Handles addresses with amount (disables amount field)

**Unit Tests** (`src/lib/tests/utils/authentication.test.ts`):

- Requires authentication when amount >= threshold
- Skips authentication when amount < threshold
- Authentication threshold is read from user preferences
- Biometric authentication works on mobile (mocked)
- WebAuthn authentication works on web (mocked)
- Authentication failure prevents send
- Authentication success allows send

**Unit Tests** (`src/lib/tests/utils/amountValidation.test.ts`):

- Validates minimum amounts per network
- Validates maximum amounts per network
- Validates balance sufficiency for sends
- Shows error for amounts below minimum
- Shows error for amounts above maximum
- Shows error for insufficient balance
- Large amount warning triggers for amounts > $1,000 USD
- Large amount confirmation is required before send

**Component Tests** (`src/lib/tests/components/SendPaymentForm.test.ts`):

- Renders "Scan QR Code" tab by default
- Renders "Enter Payment Details" tab when selected
- Tab switching works correctly
- QR code scanner is shown in scan tab
- Address input is shown in enter tab
- Recent addresses dropdown appears when input is focused
- Recent addresses dropdown shows addresses from transaction history
- Recent address selection fills address input
- Address parsing updates network display
- Address parsing updates amount field (enables/disables based on address)
- Address parsing updates memo field
- Fee calculation updates when network/amount changes
- Fee is added to amount (receiver gets specified amount)
- Confirmation screen shows all payment details
- Confirmation screen shows conditional amount field if QR code has no amount
- Passkey authentication is required for sends
- Large amount warning is shown for amounts > $1,000 USD
- Large amount confirmation checkbox is required
- Send button is disabled until authentication and confirmation
- Send button triggers send operation
- Error handling displays error messages
- Success screen is shown after successful send
- Explorer link is shown on success screen

**Component Tests** (`src/lib/tests/components/QrCodeScanner.test.ts`):

- QR code scanner requests camera permission
- QR code scanner shows camera view
- QR code scanner calls `onScan` callback with scanned data
- QR code scanner calls `onClose` callback when closed
- QR code scanner handles permission denial gracefully
- QR code scanner handles camera errors gracefully

**Integration Tests** (`tests/integration/send-payment-form.spec.ts`):

- Complete send flow: scan QR → confirm → authenticate → send → success
- Complete send flow: enter address → parse → confirm → authenticate → send → success
- Send integrates with `SubmarineSend` for Lightning sends
- Send integrates with `walletManager.sendRBTC()` for Rootstock sends
- Send integrates with `walletManager.sendBSCUSDT()` for BSC USDT sends
- Transaction monitoring detects successful sends
- Balance updates after successful send
- Error handling for failed sends
- Network switching updates fee calculations
- Recent addresses are loaded from transaction history

**MOCKING REQUIREMENTS**:

- Mock `QrCodeScanner` component:
  ```typescript
  vi.mock('$lib/components/QrCodeScanner.svelte', () => ({
  	default: vi.fn(({ onScan, onClose }) => {
  		// Simulate QR scan
  		if (onScan) onScan({ rawValue: 'lnbc1000...' });
  		return {};
  	})
  }));
  ```
- Mock `getBiometricData` and `getWebBiometricData`:
  ```typescript
  vi.mock('$lib/utils/helpers/biometrics', () => ({
  	getBiometricData: vi.fn().mockResolvedValue({ username: 'test', password: 'encrypted' })
  }));
  vi.mock('$lib/utils/helpers/webBiometrics', () => ({
  	getWebBiometricData: vi.fn().mockResolvedValue({ username: 'test', password: 'encrypted' })
  }));
  ```
- Mock `loadTransactions` for recent addresses:
  ```typescript
  vi.mock('$lib/utils/wallet/transactionHistory', () => ({
  	loadTransactions: vi
  		.fn()
  		.mockResolvedValue([{ type: 'sent', to: '0x123...', network: 'RSK', date: new Date() }])
  }));
  ```
- Mock `walletManager` send methods:
  ```typescript
  walletManager.sendRBTC = vi.fn().mockResolvedValue({ txHash: '0x...' });
  walletManager.sendBSCUSDT = vi.fn().mockResolvedValue({ txHash: '0x...' });
  ```

**TEST COMMAND**: `npm run test:unit -- SendPaymentForm`

---

### Phase 3: Mobile Optimizations

#### Step 6-8: Mobile Optimizations

Add swipe-to-close gesture, optimize touch interactions, implement safe area handling.

**REQUIRED TESTS** (Run `npm run test:unit` - all must pass):

**Component Tests** (`src/lib/tests/components/WalletPaymentModal.test.ts` - additional):

- Swipe down gesture closes modal (mobile only)
- Touch targets are minimum 44px height
- Touch feedback is applied on button press
- Safe area insets are applied correctly
- Haptic feedback triggers on interactions (mocked)

**Integration Tests** (`tests/integration/mobile-optimizations.spec.ts`):

- Touch interactions work correctly on mobile viewport
- Gestures work correctly on mobile devices
- Safe areas are respected on devices with notches
- Keyboard handling doesn't interfere with calculator

**TEST COMMAND**: `npm run test:unit -- WalletPaymentModal`

---

### Phase 4: Integration and Polish

#### Step 9: Integrate with Wallet Page

Integrate with existing wallet page, convert tabs to buttons.

**REQUIRED TESTS** (Run `npm run test:unit` - all must pass):

**Component Tests** (`src/lib/tests/components/WalletPage.test.ts`):

- Balance card is displayed on wallet page
- Receive button opens receive modal
- Send button opens send modal
- Buy/Sell button opens buy/sell modal (if implemented)
- Swap button opens swap modal (if implemented)
- Only one modal can be open at a time
- Modal closes when navigating away

**Integration Tests** (`tests/integration/wallet-page.spec.ts`):

- Wallet page loads correctly
- Balance card displays current balances
- Button clicks open correct modals
- Modal interactions don't break wallet page state
- Navigation between wallet sections works

**TEST COMMAND**: `npm run test:unit -- WalletPage`

---

#### Step 10: Create `InvoiceDisplay.svelte`

Add invoice display component with QR code, address, amount, memo.

**REQUIRED TESTS** (Run `npm run test:unit` - all must pass):

**Unit Tests** (`src/lib/tests/utils/qrCodeGeneration.test.ts`):

- `generateQrCodeUrl()` generates valid data URL
- QR code includes BitTasker logo overlay
- QR code has high error correction level
- QR code is scalable via CSS

**Component Tests** (`src/lib/tests/components/InvoiceDisplay.test.ts`):

- Displays QR code (large, 300px+ mobile, 400px+ desktop)
- Displays address (copyable)
- Displays amount in sats and USD
- Displays memo if provided
- Copy address button copies address to clipboard
- Copy address button shows success feedback
- Share button triggers native share sheet (mobile)
- Share button works on desktop (fallback)
- QR code loading state is shown while generating
- QR code error state is handled gracefully

**Integration Tests** (`tests/integration/invoice-display.spec.ts`):

- Invoice display integrates with receive payment form
- QR code is scannable and contains correct data
- Address copy functionality works
- Share functionality works on mobile and desktop

**MOCKING REQUIREMENTS**:

- Mock `generateQrCodeUrl`:
  ```typescript
  vi.mock('$lib/utils/helpers/generateQrCodeUrl', () => ({
  	default: vi.fn().mockResolvedValue('data:image/png;base64,...')
  }));
  ```
- Mock `copyToClipboard`:
  ```typescript
  vi.mock('$lib/utils/helpers/clipboard', () => ({
  	copyToClipboard: vi.fn().mockResolvedValue(undefined)
  }));
  ```
- Mock native share API:
  ```typescript
  global.navigator.share = vi.fn().mockResolvedValue(undefined);
  ```

**TEST COMMAND**: `npm run test:unit -- InvoiceDisplay`

---

#### Step 11: Implement Background Transaction Monitoring

Implement background transaction monitoring for all networks.

**REQUIRED TESTS** (Run `npm run test:unit` - all must pass):

**Unit Tests** (`src/lib/tests/utils/transactionMonitoring.test.ts`):

- Lightning swap status polling works (every 5 seconds)
- Liquid swap status polling works (every 5 seconds)
- Rootstock transaction history monitoring works
- BSC transaction history monitoring works
- Transaction matching by address and amount works
- Polling stops when transaction is found
- Polling stops when modal is closed
- Error handling for polling failures

**Component Tests** (`src/lib/tests/components/TransactionMonitoring.test.ts`):

- Success screen is shown when payment is received
- Success screen displays transaction details
- Success screen shows explorer link
- Explorer link opens correct blockchain explorer
- Success screen auto-closes after 5 seconds (optional)
- Success screen can be manually closed

**Integration Tests** (`tests/integration/transaction-monitoring.spec.ts`):

- Background monitoring detects Lightning payments
- Background monitoring detects Liquid payments
- Background monitoring detects Rootstock payments
- Background monitoring detects BSC USDT payments
- Balance updates after payment is detected
- Success screen is shown correctly
- Explorer links work correctly

**MOCKING REQUIREMENTS**:

- Mock swap services:
  ```typescript
  walletManager.reverseSwapService.getSwap = vi
  	.fn()
  	.mockResolvedValueOnce({ status: 'pending' })
  	.mockResolvedValueOnce({ status: 'invoice.settled' });
  ```
- Mock transaction history:
  ```typescript
  walletManager.loadTransactions = vi
  	.fn()
  	.mockResolvedValueOnce([])
  	.mockResolvedValueOnce([{ to: 'address', amount: 100000, confirmed: true }]);
  ```

**TEST COMMAND**: `npm run test:unit -- TransactionMonitoring`

---

#### Step 12-14: Translations, Accessibility, Performance

Add translations, accessibility features, performance optimizations.

**REQUIRED TESTS** (Run `npm run test:unit` - all must pass):

**Component Tests** (`src/lib/tests/components/Accessibility.test.ts`):

- All buttons have ARIA labels
- Modal has correct ARIA attributes
- Keyboard navigation works (Tab, Shift+Tab, Escape, Enter)
- Screen reader announces amount changes (`aria-live="polite"`)
- Focus management works correctly
- Color contrast meets WCAG 2.1 AA standards (4.5:1)

**Integration Tests** (`tests/integration/accessibility.spec.ts`):

- Complete keyboard-only navigation works
- Screen reader can navigate all components
- All interactive elements are accessible
- Translations are loaded correctly (English and Spanish)
- Language switching works correctly

**Performance Tests** (`tests/performance/wallet-modal.spec.ts`):

- Modal opens in < 100ms
- Calculator input responds in < 50ms
- Fee calculations complete in < 200ms
- QR code generation completes in < 500ms
- Lazy loading works correctly
- Reduced motion is respected

**TEST COMMAND**: `npm run test:unit -- Accessibility`

---

### Phase 5: Final Testing and Validation

#### Step 15-20: Comprehensive Testing

Run all tests, visual testing, and integration validation.

**REQUIRED TEST SUITE** (Run `npm run test:unit` and `npm run test:integration` - all must pass):

**Complete Test Coverage**:

- All unit tests pass (100% of critical paths)
- All component tests pass
- All integration tests pass
- No TypeScript errors (`npm run check`)
- No linting errors (`npm run lint`)

**Visual Testing** (Manual - use Cursor browser):

- Test on mobile viewport (375px, 414px)
- Test on tablet viewport (768px, 1024px)
- Test on desktop viewport (1280px, 1920px)
- Test in dark mode
- Test in light mode
- Test all calculator operations visually
- Test all network selections visually
- Test all error states visually
- Test all success states visually
- Test QR code display and scanning
- Test invoice display and sharing
- Test transaction success screens

**Functional Testing** (Manual):

- Calculator operations (+, −, ×, ÷) work correctly
- Unit conversions (sats ↔ USD) work correctly
- Network selection works correctly
- Fee calculations are accurate
- Amount validation works correctly
- Address parsing works correctly
- QR code scanning works correctly
- Invoice generation works correctly
- Send operations work correctly
- Transaction monitoring works correctly
- Authentication works correctly
- Large amount warnings work correctly
- Recent addresses dropdown works correctly

**Accessibility Testing** (Manual):

- Screen reader navigation works
- Keyboard-only navigation works
- Color contrast is sufficient
- Focus indicators are visible
- ARIA labels are correct

**TEST COMMANDS**:

- Unit tests: `npm run test:unit`
- Integration tests: `npm run test:integration`
- Type check: `npm run check`
- Lint: `npm run lint`
- All tests: `npm run test`

---

## Test Implementation Guidelines

### Mocking Authentication for Tests

**For Component and Integration Tests**:

Authentication can be mocked without requiring actual passkey interaction:

```typescript
import { authState } from '$lib/stores/auth.store';
import { get } from 'svelte/store';

// Simulate logged-in user
beforeEach(() => {
	// Mock Preferences to return access token
	vi.mocked(Preferences.get).mockImplementation(async ({ key }) => {
		if (key === StorageKeys.ACCESS_TOKEN) {
			return { value: 'mock-access-token' };
		}
		if (key === StorageKeys.NPUB) {
			return { value: 'mock-npub' };
		}
		return { value: null };
	});

	// Set auth state to logged in
	authState.login();
	expect(get(authState).isAuthenticated).toBe(true);
});

afterEach(() => {
	authState.logout();
});
```

**For Unit Tests**:

Mock the authentication functions directly:

```typescript
vi.mock('$lib/utils/helpers/biometrics', () => ({
	getBiometricData: vi.fn().mockResolvedValue({
		username: 'test-npub',
		password: JSON.stringify({ encrypted: 'data' })
	})
}));

vi.mock('$lib/utils/helpers/webBiometrics', () => ({
	getWebBiometricData: vi.fn().mockResolvedValue({
		username: 'test-npub',
		password: JSON.stringify({ encrypted: 'data' })
	})
}));
```

### Test File Structure

```
src/lib/tests/
├── components/
│   ├── WalletPaymentModal.test.ts
│   ├── CalculatorKeypad.test.ts
│   ├── AmountDisplay.test.ts
│   ├── ReceivePaymentForm.test.ts
│   ├── SendPaymentForm.test.ts
│   ├── InvoiceDisplay.test.ts
│   ├── QrCodeScanner.test.ts
│   ├── TransactionMonitoring.test.ts
│   ├── WalletPage.test.ts
│   └── Accessibility.test.ts
├── utils/
│   ├── amountConversion.test.ts
│   ├── feeCalculation.test.ts
│   ├── addressParsing.test.ts
│   ├── authentication.test.ts
│   ├── amountValidation.test.ts
│   ├── qrCodeGeneration.test.ts
│   └── transactionMonitoring.test.ts

tests/
├── integration/
│   ├── wallet-modal.spec.ts
│   ├── calculator-keypad.spec.ts
│   ├── amount-display.spec.ts
│   ├── receive-payment-form.spec.ts
│   ├── send-payment-form.spec.ts
│   ├── invoice-display.spec.ts
│   ├── transaction-monitoring.spec.ts
│   ├── wallet-page.spec.ts
│   ├── mobile-optimizations.spec.ts
│   └── accessibility.spec.ts
└── performance/
    └── wallet-modal.spec.ts
```

### Test Execution Requirements

**Before proceeding to next step**:

1. Write all required tests for current step
2. Run `npm run test:unit -- <ComponentName>` to run specific tests
3. Fix any failing tests
4. Ensure all tests pass (100% pass rate required)
5. Run `npm run check` to ensure no TypeScript errors
6. Run `npm run lint` to ensure no linting errors
7. Only then proceed to next step

**Test Coverage Goals**:

- Unit tests: 80%+ coverage for utility functions
- Component tests: 70%+ coverage for UI components
- Integration tests: All critical user flows covered

**Continuous Testing**:

- Run tests after each small change
- Fix failing tests immediately
- Don't accumulate technical debt
- Keep tests up-to-date with code changes

## Notes

- **Modal-first approach**: Use modals instead of page navigation for better mobile UX
- **Mobile-first design**: Start with mobile experience, enhance for desktop
- **Wallet initialization**: Must handle loading, error, and disconnected states
- **Network support**: Align with existing network identifiers:
  - Bitcoin: `lightning-bitcoin`, `rootstock-bitcoin`, `liquid-bitcoin`, `bitcoin`
  - USD: `usdt-bsc`
- **Calculator use case**: Enable users to calculate totals directly in the wallet (e.g., adding multiple items, calculating fees, computing totals)
- **Component integration**: New modal components wrap existing functionality (`LightningReceive`, `LBTCReceive`, `RSKReceive`, `SubmarineSend`) while improving UX with calculator interface and better displays
- **Balance page**: Keep existing balance page, convert other tabs (Receive, Send, Buy/Sell, Swap) to buttons that launch full-screen modals
- **Invoice display**: Include very large QR code (300px+ mobile, 400px+ desktop) using existing `generateQrCodeUrl()` function, copyable address, amount, and memo
- **QR code generation**: Use existing `generateQrCodeUrl()` utility (includes BitTasker logo, high error correction)
- **QR code scanning**: Use existing `QrCodeScanner.svelte` component for scanning payment addresses/invoices
- **Success flow**: Monitor transactions in background (poll every 5 seconds), show success screen when payment received
- **Performance**: Fast, smooth interactions are critical for mobile wallet apps
- **Accessibility**: Not optional - ensure all users can use wallet features
- **Test on real devices**: Emulators don't capture all mobile nuances (touch, haptics, safe areas)

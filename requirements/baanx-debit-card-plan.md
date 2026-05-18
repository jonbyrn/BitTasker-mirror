# Baanx Debit Card Integration Plan

> **Revision**: v1.0 -- Extracted from USDT Integration Plan v4.3

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
   - 1.1 [System Layers -- Baanx Layer](#11-system-layers--baanx-layer)
   - 1.2 [Key Components](#12-key-components)
   - 1.3 [Card Address Model](#13-card-address-model)
   - 1.4 [Card Model: Non-Custodial Delegation](#14-card-model-non-custodial-delegation)
   - 1.5 [Delegation Lifecycle](#15-delegation-lifecycle)
   - 1.6 [On-Chain Spending Limit Enforcement](#16-on-chain-spending-limit-enforcement)
   - 1.7 [KYC Data Path](#17-kyc-data-path)
   - 1.8 [Spending Limits (Tier 1)](#18-spending-limits-tier-1)
   - 1.9 [Google Pay Integration](#19-google-pay-integration)
   - 1.10 [Transaction Display Deduplication](#110-transaction-display-deduplication)
   - 1.11 [Interaction with EIP-7702 Limits](#111-interaction-with-eip-7702-limits)
2. [Feature Flag: VITE_BAANX_CARDS_ENABLED](#2-feature-flag)
3. [ASCII UI Mockups](#3-ascii-ui-mockups)
   - 3.1 [Banking Menu -- Debit Card Row](#31-banking-menu-update)
   - 3.2 [Card Dashboard (6.26)](#32-card-dashboard)
   - 3.3 [Guided Card Creation Flow (6.27)](#33-guided-card-creation-flow)
   - 3.4 [Load Card (6.28)](#34-load-card)
   - 3.5 [Card Transaction History (6.29)](#35-card-transaction-history)
   - 3.6 [Card Settings & Management (6.30)](#36-card-settings--management)
   - 3.7 [Card Animation System](#37-card-animation-system)
4. [Implementation: Phase 8](#4-implementation-phase-8-baanx-debit-card-integration)
   - 4.1 [Phase 8 Task Table](#41-phase-8-task-table)
   - 4.2 [Feature Flag Gating](#42-feature-flag-gating)
5. [API Dependencies](#5-api-dependencies)
   - 5.1 [Baanx Card API (11.4)](#51-baanx-card-api)
   - 5.2 [API Endpoints](#52-api-endpoints)
   - 5.3 [Rate Limiting](#53-rate-limiting)
   - 5.4 [Authentication & Secrets](#54-authentication--secrets)
   - 5.5 [Security Model](#55-api-security-model)
   - 5.6 [KYC Data Protection Prerequisites](#56-kyc-data-protection-prerequisites)
6. [Feature Flag Dependency Map](#6-feature-flag-dependency-map)
   - 6.1 [Feature Flag Table](#61-feature-flag-table)
   - 6.2 [Feature Flag Implementation](#62-feature-flag-implementation)
   - 6.3 [Estimated Integration Effort](#63-estimated-integration-effort)
7. [Confidence Gate -- Baanx Checklist](#7-confidence-gate--baanx-checklist)
8. [Appendix A: New Baanx Files](#8-appendix-a-new-baanx-files)
9. [Appendix B: Modified Files](#9-appendix-b-modified-files)

---

## 1. Architecture Overview

### 1.1 System Layers -- Baanx Layer

The Baanx Layer sits between the main application logic and the stability infrastructure:

```
+------------------------------------------------------------------+
|                    BitTasker UI (Svelte 5)                         |
|   Wallet Dashboard | Send/Receive | Escrow | Swaps | Settings     |
+------------------------------------------------------------------+
|              Wallet Store ($walletStore + $gasModeStore)            |
|   Multi-chain state | Token Selection | Delegation State | Pending Tx Map  |
+------------------------------------------------------------------+
|              BitTasker Wallet SDK (@bittasker/wallet-core)          |
|   WalletManager | BSCWallet | RSKWallet | Paymaster | Swaps       |
+------------------------------------------------------------------+
|     EIP-7702 Layer (NEW)                                           |
|   GasAbstractionProvider interface | DelegationManager             |
|   Candide AbstractionKit adapter | RestrictedSigner               |
+------------------------------------------------------------------+
|     Changelly Layer (NEW)                                           |
|   Swap API (HMAC-SHA256 via CF Worker) | Fiat API (SDK direct)    |
+------------------------------------------------------------------+
|     Baanx Layer (NEW)                                           |
|   Card API client | Delegation registry | Tokenization proxy     |
+------------------------------------------------------------------+
|              Stability Layer (NEW)                                  |
|   Kill Switch | Chain Lock | Delegation Journal                    |
|   Capacitor Lifecycle Handlers                     |
+------------------------------------------------------------------+
|              Chain Providers                                        |
|   BSC (chainId 56) | RSK (chainId 30) | Future Chains              |
+------------------------------------------------------------------+
```

### 1.2 Key Components

| Component          | Responsibility                                                                                     | Status  |
| ------------------ | -------------------------------------------------------------------------------------------------- | ------- |
| `BaanxCardService` | Virtual/physical Visa Debit card issuance, non-custodial funding via USDT, Google Pay tokenization | **NEW** |
| `CardStore`        | Card state management: balance, freeze/unfreeze, spending limits, transaction history              | **NEW** |

### 1.3 Card Address Model

The card uses a **separate derived address** (`m/44'/60'/0'/0/1`) from the same seed as the main wallet (`m/44'/60'/0'/0/0`). This isolates the card spending surface from the user's main USDT balance. Baanx can only sweep from the card address -- the main wallet is completely firewalled. The user loads funds onto the card via a simple send from the main wallet. The two addresses are presented as one experience: "From Main Wallet To Card."

```
Seed
 ├── m/44'/60'/0'/0/0  → Main Wallet (USDT + rBTC, full balance, NOT exposed to Baanx)
 └── m/44'/60'/0'/0/1  → Card Address (USDT only, what you load onto the card)
                          ↑
                     Baanx spending pubkey can ONLY sweep from this address
```

### 1.4 Card Model: Non-Custodial Delegation

Users can generate virtual Visa Debit cards funded by USDT from their BitTasker wallet. The card is issued via **Baanx Group** (FCA-regulated, the same infrastructure powering the MetaMask Card). Users can spend anywhere Visa is accepted, online or in-store via Google Pay.

```
+------------------+  Load USDT  +------------------+   EIP-712    +-------------------+
|  Main Wallet     | ----------> |  Card Address    | -----------> |  Baanx Card API   |
|  m/44'/60'/0'/0/0|             |  m/44'/60'/0'/0/1|              |                   |
|  USDT + rBTC     |             |  USDT only       |              |  Virtual Visa     |
+------------------+             +------------------+              |  Google Pay token |
       ↑                              |                            |                   |
       |                     Baanx sweeps at                        +-------------------+
       |                     transaction time                                |
       |                    (only from card addr)                    Visa/Mastercard Network
       |                                                                    |
  Main wallet                                                       Merchant POS / Online
  NEVER exposed
  to Baanx
```

**Single delegation model**: Card spending uses the same EOA key and EIP-712 signing pattern as the rest of the wallet. No separate Nostr delegation. The same security model (RestrictedSigner, on-chain verification) applies uniformly.

1. **Time-bound setup**: User signs an EIP-712 typed data message (same signing path as EIP-7702 delegation) authorizing Baanx's spending pubkey with configurable limits. This is the same EVM delegation pattern MetaMask Card uses. The signature is registered with Baanx via their API.
2. **Card issuance**: Baanx generates a virtual Visa card number. Card exists in Google Pay via tokenization. No physical card required.
3. **Transaction**: User taps/swipes at merchant -> Baanx checks the card address on-chain USDT balance -> approves authorization -> sweeps exact USDT amount from the card address -> converts to fiat -> settles to merchant. The main wallet balance is untouched.
4. **No per-transaction wallet signature**: The time-bound delegation covers all transactions within the spending limit. UX is identical to a regular debit card.

### 1.5 Delegation Lifecycle

Card spending delegations are time-bound (90-day maximum, auto-expiry). Users can: (a) revoke from app settings via "Revoke All Cards" button, (b) broadcast an on-chain revocation transaction from any wallet. When a delegation expires or is revoked, Baanx MUST zero any remaining card balance back to the user's wallet. The app checks delegation expiry on startup and prompts re-authorization 7 days before expiry.

**Two-way fund movement**: Users can withdraw unspent card balance back to their BitTasker wallet USDT balance via the Baanx off-ramp API (same delegation signature).

### 1.6 On-Chain Spending Limit Enforcement

The EIP-712 delegation signature encodes spending limits (daily cap, per-transaction cap) as signed parameters. Baanx verifies the EOA signature before each sweep. A secondary on-chain validation contract on BSC verifies cumulative daily sweeps against the encoded limit, providing cryptographic enforcement even if the Baanx spending infrastructure is compromised. The contract enforces: (a) daily sweep cap = user-configured limit (default $5,000), (b) per-transaction cap = user-configured limit (default $500), (c) cooldown on limit increases = 24 hours.

### 1.7 KYC Data Path

Baanx supports two KYC onboarding paths. The PREFERRED path is a redirect to Baanx's PCI-compliant hosted portal -- KYC data never touches BitTasker infrastructure. If redirect is unavailable, the fallback path sends KYC data through the CF Worker proxy as a stateless relay. In fallback mode, the privacy notice text is updated to: "Your identity information is transmitted to Baanx Group through BitTasker's infrastructure for verification only. The data is not stored or retained by BitTasker."

**Phase 8 gate**: confirm which path is available with Baanx before writing KYC form code.

**KYC requirements**: Tier 1 (name, address, DOB). Baanx is FCA-regulated; identity verification is mandatory under Visa/Mastercard rules. No source-of-funds check at Tier 1. Card is issued in the user's real name.

**Privacy notice** (shown at card creation): "Card transactions are processed by Baanx Group (FCA-regulated, UK). Your legal name, daily spending patterns, and transaction amounts are visible to Baanx and the Visa/Mastercard network as required for payment processing and fraud prevention. This data is not shared with BitTasker."

**KYC data protection prerequisites (Phase 8 gate):**

- Data Processing Agreement (DPA) signed with Baanx before Phase 8 begins
- Confirm Baanx supports a redirect model where user enters KYC directly on Baanx's portal -- if not, formalize forwarding compliance
- GDPR: Verify Baanx data center locations against user locations; if EU users are served, confirm UK adequacy decision or SCCs in place
- GDPR right to deletion: DPA with Baanx must cover Article 17 (right to erasure). User card cancellation triggers KYC data deletion request to Baanx within 30 days. Confirmation of deletion is displayed in the card cancellation success screen.
- Sentry filter rule: Strip PII fields (name, address, DOB) from all error logs, breadcrumbs, and crash reports
- Worker-level header: `Cache-Control: no-store` on all KYC proxy responses
- KYC data MUST never appear in Worker console.log, Sentry breadcrumbs, or Capacitor Preferences

### 1.8 Spending Limits (Tier 1)

| Limit           | Value                                               | Enforcement                                    |
| --------------- | --------------------------------------------------- | ---------------------------------------------- |
| Daily spend     | ~$5,000                                             | Encoded in delegation event                    |
| Per-transaction | $500 (default, user-configurable up to daily limit) | Encoded in delegation event, enforced on-chain |
| ATM withdrawal  | Not supported (purchase-only)                       |                                                |
| Reload          | Any amount (up to wallet USDT balance)              |                                                |

### 1.9 Google Pay Integration

Baanx handles Visa tokenization for Google Pay. The virtual card number is tokenized into a device-specific token. No additional integration required beyond Baanx's API.

**Google Pay tokenization security**: Tokenization requests to Baanx require biometric authentication in the BitTasker app before the request is forwarded. Baanx cryptographically binds the token to the user's registered device via Google's device attestation. Tokenization from new/unrecognized devices is blocked until confirmed via push notification to the user's primary device. All tokenization attempts are logged as Sentry breadcrumbs.

### 1.10 Transaction Display Deduplication

Card loads (USDT sweep from card address to Baanx) appear as an on-chain USDT transfer in the wallet transaction history. They do NOT appear as a separate "card load" transaction to avoid double-counting. Card purchases (Visa/Mastercard authorizations) appear only in the card transaction history, not in the wallet history. The card balance displayed is the Baanx-reported balance, which may briefly differ from the on-chain wallet balance during sweep settlement (~2-5 seconds).

### 1.11 Interaction with EIP-7702 Limits

Card-backed EIP-7702 transactions (e.g., funding an escrow from card balance) are subject to the paymaster's per-transaction limit of 5,000 USDT. Card purchases via Visa/Mastercard use a separate authorization path and are NOT subject to paymaster rate limits. The lower of the card daily limit and paymaster per-tx limit applies when card balance funds an on-chain transaction.

---

## 2. Feature Flag

**Feature flag -- VITE_BAANX_CARDS_ENABLED**: Gated behind a build-time `.env` feature flag because Baanx requires a business relationship and API credentials. The flag controls whether the entire debit card UI surface is visible. When disabled, the Banking tab shows only swap/buy/sell options.

```
# .env (build-time feature flag)
VITE_BAANX_CARDS_ENABLED=false   # Set to 'true' when Baanx partnership is active
```

---

## 3. ASCII UI Mockups

### 3.1 Banking Menu Update

The Banking menu is updated to include a "Debit Card" entry when `VITE_BAANX_CARDS_ENABLED=true`, with "Virtual Visa card" subtitle gated by the feature flag. The updated menu when the flag is enabled:

```
+-- Banking ----------------------------------------------------+
|                                                              |
|  Send USDT                           fee ~$0.02             |
|  Send rBTC on Rootstock              fee ~$0.00003          |
|  -----------------------------------------------------------  |
|  Receive USDT on BNB Smart Chain                              |
|  Receive rBTC on Rootstock                                    |
|  -----------------------------------------------------------  |
|  Debit Card                          Virtual Visa card       |  <-- NEW, gated by VITE_BAANX_CARDS_ENABLED
|  -----------------------------------------------------------  |
|  Buy USDT with card / bank transfer   fee ~1.5-3.5%         |
|  Sell USDT to bank account            fee ~1%                |
|                                                              |
+--------------------------------------------------------------+
```

When `VITE_BAANX_CARDS_ENABLED=false`, the Debit Card row is absent entirely.

### 3.2 Card Dashboard

The card dashboard shows the user's virtual debit card, balance, and quick actions:

#### Active Card State

```
+-- BitTasker Visa Debit Card --------------------------------+
|                                                              |
|  +-------------------------------------------------------+  |
|  |  BITASKER                                             |  |
|  |                                                       |  |
|  |  **** **** **** 4532                                  |  |
|  |                                                       |  |
|  |  VALID THRU 12/28                                     |  |
|  |  JOHN DOE                                             |  |
|  |                                                       |  |
|  |  [VISA]                                               |  |
|  +-------------------------------------------------------+  |
|                                                              |
|  Card Balance: $250.00 USDT                                  |
|  [  Add Funds  ]  [  Freeze Card v  ]                        |
|                                                              |
|  Recent Transactions:                                         |
|  * Amazon.com          -$42.50     Just now                  |
|  * Starbucks           -$5.75      Yesterday                 |
|  * Card Load           +$300.00    May 15                     |
|  [  View All  ->  ]                                           |
+--------------------------------------------------------------+
```

#### No Card Issued (Empty State)

```
+-- BitTasker Visa Debit Card --------------------------------+
|                                                              |
|  +-------------------------------------------------------+  |
|  |                                                       |  |
|  |         No card yet                                   |  |
|  |                                                       |  |
|  |   Create a virtual Visa debit card                    |  |
|  |   funded by your USDT balance.                        |  |
|  |                                                       |  |
|  |   [  Set Up Card (~2 min)  ]                         |  |
|  |                                                       |  |
|  +-------------------------------------------------------+  |
|                                                              |
|  [  Why get a card?  ]                                       |
+--------------------------------------------------------------+
```

#### KYC Pending State

```
+-- BitTasker Visa Debit Card --------------------------------+
|  @  Identity verification in progress                        |
|  Baanx Group is verifying your identity.                     |
|  This usually takes 1-2 business days.                      |
|  We'll notify you when your card is ready.                   |
+--------------------------------------------------------------+
```

#### KYC Rejected State

```
+-- BitTasker Visa Debit Card --------------------------------+
|  X  Identity verification failed                             |
|  Reason: [Address could not be verified]                    |
|  You can update your information and re-submit.              |
|  [  Re-submit KYC  ]                                        |
+--------------------------------------------------------------+
```

#### Skeleton Loading State

Using daisyUI `skeleton` class:

```
+-- BitTasker Visa Debit Card --------------------------------+
|                                                              |
|  +-------------------------------------------------------+  |
|  |  ............  ........................                  |  |
|  |  ............  ..........                               |  |
|  |  .... .... .... 4532                                   |  |
|  |                                                       |  |
|  |  .......... 12/28                                     |  |
|  |  .... ....                                            |  |
|  |                                                       |  |
|  |  [......]                                             |  |
|  +-------------------------------------------------------+  |
|                                                              |
|  .... ........: $...                                        |
|  [  ...  ......  ]  [  ......  ....  ]                        |
+--------------------------------------------------------------+
```

Implement using daisyUI class `skeleton` on each text block -- no custom CSS. The skeleton uses a diagonal shimmer animation as the default `skeleton` class behavior.

#### Baanx API Unavailable State

```
+-- BitTasker Visa Debit Card --------------------------------+
|  !  Card service temporarily unavailable                     |
|  We're having trouble connecting to the card processing      |
|  service. Please try again later.                            |
|                                                              |
|  [  Retry  ]                    [  Dismiss  ]               |
+--------------------------------------------------------------+
```

Shown when Baanx API returns 5xx or connection fails. Auto-retries on app foreground. Uses `role="alert"` for screen reader.

#### Guided Card Creation Flow:

```
User opens Banking tab
        |
        v
"Debit Card" card with "Set Up Card (~2 min)" button
        |
        v (one tap)
KYC if not already completed (name, address, DOB)
        |
        v
Card appears instantly -- virtual Visa number + "Add to Google Pay"
        |
        v
User loads with USDT from wallet -> card is immediately spendable
```

### 3.3 Guided Card Creation Flow

The guided flow walks the user through KYC, delegation, and card issuance.

#### Step 1: KYC Form -- WCAG 2.2 AA SC 3.3.2 (Labels or Instructions) compliant:

```
+-- Create Your Card -----------------------------------------+
|                                                              |
|  Your identity will be verified by Baanx Group (FCA-regulated)|
|  to issue your Visa debit card. This is required by law.    |
|                                                              |
|  +-- Personal Information ---------------------------------+|
|  | <label for="kyc-name">Full Legal Name</label>            ||
|  | [  John Doe                                  ]          ||
|  | autocomplete="name"                                      ||
|  |                                                          ||
|  | <label for="kyc-dob">Date of Birth</label>               ||
|  | [  MM/DD/YYYY                               ]          ||
|  | autocomplete="bday"                                       ||
|  |                                                          ||
|  | <label for="kyc-address">Residential Address</label>     ||
|  | [  123 Main St, City, State ZIP               ]         ||
|  | autocomplete="street-address"                             ||
|  |                                                          ||
|  | <label for="kyc-country">Country</label>                  ||
|  | [  United States v                            ]         ||
|  | autocomplete="country-name"                               ||
|  +----------------------------------------------------------+|
|                                                              |
|  [ ] I consent to Baanx Group processing my identity data    |
|      for card issuance under their Privacy Policy.           |
|                                                              |
|  [  Back  ]                         [  Continue  ]          |
+--------------------------------------------------------------+
```

Note: All form fields include explicit `<label for="">` elements and `autocomplete` attributes per WCAG 2.2 AA SC 3.3.2 (Labels or Instructions) and SC 1.3.5 (Identify Input Purpose). Error messages use `aria-describedby` and inline validation on blur. The form uses a single `<form>` element with `novalidate` and client-side constraint validation.

**PII guard note**: KYC fields (name, address, DOB) MUST be stripped from all Sentry error reports, breadcrumbs, and console logs. The CF Worker proxy (`workers-site/handlers/baanx.js`) sets `Cache-Control: no-store` on KYC relay responses. KYC data is never stored in Preferences, localStorage, or any BitTasker infrastructure -- it is forwarded exclusively to Baanx's API.

**KYC failure states (in-flow)**:

- Invalid format (e.g., DOB in wrong format, missing required field) -> inline error under the offending field with red border pulse (500ms, 2 cycles). Form remains editable -- user corrects and re-submits.
- Immediate rejection by Baanx (e.g., unsupported country, sanctions match) -> full-screen error state within the step: "Your identity could not be verified. Reason: [server message]." with [Edit Information] and [Exit Setup] buttons.
- Timeout (Baanx API unreachable) -> "We can't reach the verification service. Please try again." with [Retry] and [Exit Setup] buttons.

#### Step 2: Delegation Signing

```
+-- Create Your Card -----------------------------------------+
|                                                              |
|  [OK] Identity verified                                       |
|                                                              |
|  Authorize card spending:                                     |
|                                                              |
|  Spending Limit: $500.00 / day                                |
|  Per Transaction: $500.00                                    |
|  Valid for: 90 days                                          |
|                                                              |
|  You will sign a one-time authorization for Baanx to         |
|  sweep USDT from your card address at transaction time.            |
|  No per-transaction signatures needed.                       |
|                                                              |
|  [  Back  ]                    [  Sign & Create Card  ]      |
+--------------------------------------------------------------+
```

**Delegation failure states**:

- User rejects signature prompt -> inline message "Signing was cancelled. You can try again or exit setup." with [Try Again] and [Exit Setup] buttons.
- Network error during signing -> error toast "Network error. Please check your connection and try again." with [Retry] button.
- Baanx rejects delegation -> inline error "Delegation was rejected by the card issuer. Reason: [server message]." with [Try Again] or [Contact Support] buttons.

#### Step 3: Card Issued

```
+-- Card Created Successfully ---------------------------------+
|                                                              |
|  +-------------------------------------------------------+  |
|  |  BITASKER                                             |  |
|  |  **** **** **** 4532                                  |  |
|  |  VALID THRU 12/28  JOHN DOE                          |  |
|  |  [VISA]                                               |  |
|  +-------------------------------------------------------+  |
|                                                              |
|  Your virtual Visa debit card is ready!                      |
|                                                              |
|  [  Add to Google Pay  ]                                     |
|  [  Load from USDT Wallet  ]                                 |
|                                                              |
|  You can also set this up later from the Card Dashboard.     |
|                                                              |
|  [  Done  ]                                                   |
+--------------------------------------------------------------+
```

**Navigation**: Each step has a [Back] button and an [X Exit Setup] button in the top-right corner that returns to the card dashboard. Exiting mid-flow preserves no partial state -- the user starts from Step 1 on next attempt.

### 3.4 Load Card

Fund card from USDT wallet balance.

```
+-- Load Card -------------------------------------------------+
|                                                              |
|  Card Balance: $250.00                                       |
|  Wallet USDT Balance: 1,245.00                               |
|                                                              |
|  Amount to load: [  $       ]                                 |
|                                                              |
|  1    2    3                                                 |
|  4    5    6                                                 |
|  7    8    9                                                 |
|  .    0    [BKSP]                                             |
|  [  MAX  ]                                                   |
|                                                              |
|  inputmode='decimal' autocomplete='off'                       |
|                                                              |
|  Will load: $0.00                                             |
|  (1:1 USDT to card balance, no fee)                          |
|                                                              |
|  [  Cancel  ]                    [  Confirm Load  ]          |
+--------------------------------------------------------------+
```

Uses existing `AmountInputSection.svelte` with `mode='load'` (extended from the existing `send`, `buy`, `sell` modes). The keypad renders digits 0-9, decimal point, backspace (BKSP), and a MAX button (fills the maximum available amount). No +-xx/ keys. The `inputmode='decimal'` attribute ensures mobile devices show a numeric keypad with decimal separator.

**Processing state** (after tapping "Load"):

```
+-- Loading Card ----------------------------------------------+
|                                                              |
|  ⟳  Loading $500.00 onto your card...                       |
|                                                              |
|  This usually takes < 5 seconds.                             |
|                                                              |
+--------------------------------------------------------------+
```

Shows a spinner with the amount and estimated time. `aria-live="polite"` and `role="status"` for screen readers.

**Load success state**:

```
+-- Card Loaded -----------------------------------------------+
|  +  $500.00 loaded successfully                              |
|                                                              |
|  Card Balance: $750.00                                       |
|  Wallet USDT Balance: 745.00                                 |
|                                                              |
|  Transaction ID: 0x3a8f...b1e2                               |
|                                                              |
|  [  Done  ]                                                   |
+--------------------------------------------------------------+
```

**Load error state**:

```
+-- Load Failed -----------------------------------------------+
|  X  Failed to load card                                      |
|                                                              |
|  Insufficient USDT balance for load amount $500.00 + gas.    |
|  Available: 1,245.00 USDT                                     |
|  Gas reserve: 0.20 USDT                                       |
|  Max loadable: 1,244.80 USDT                                  |
|                                                              |
|  [  Try Again  ]                [  Cancel  ]                 |
+--------------------------------------------------------------+
```

### 3.5 Card Transaction History

Per-card transaction list with real-time updates.

```
+-- Card Transactions ----------------------------------------+
|                                                              |
|  [...]  Filter: All        [  Refresh  ]                     |
|                                                              |
|  +----------------------------------------------------------+|
|  | May 16, 2026                                             ||
|  | Amazon.com              -$42.50      1:30 PM  +         ||
|  |   Visa purchase - Online                                  ||
|  |   [  ...  ]                                               ||
|  +----------------------------------------------------------+|
|  | May 15, 2026                                             ||
|  | Starbucks               -$5.75       8:15 AM  +         ||
|  |   Visa purchase - In-store                               ||
|  |   [  ...  ]                                               ||
|  +----------------------------------------------------------+|
|  | May 15, 2026                                             ||
|  | Card Load               +$300.00     9:00 AM  +         ||
|  |   USDT wallet -> card                                     ||
|  |   [  ...  ]                                               ||
|  +----------------------------------------------------------+|
|                                                              |
|  [  View All  ->  ]                                           |
+--------------------------------------------------------------+
```

Each transaction row includes a `[...]` button (aria-label="Transaction actions") that opens a context menu (view details, report dispute, download receipt). The swipe-left gesture is an **optional shortcut** -- it triggers the same menu but is not the only way to access it. The `[...]` button ensures full accessibility via keyboard (Tab to focus, Enter to activate).

**Empty state** (no transactions yet):

```
+-- Card Transactions ----------------------------------------+
|                                                              |
|                    No transactions yet                        |
|                                                              |
|     Your card purchases and loads will appear here.          |
|     Use your card at any Visa-accepted merchant.             |
|                                                              |
|                     [  Make a Purchase  ]                    |
|                                                              |
+--------------------------------------------------------------+
```

### 3.6 Card Settings & Management

**Card Settings**:

```
+-- Card Settings ---------------------------------------------+
|                                                              |
|  Card Status:  * Active                                      |
|  [  Freeze Card  ]                                           |
|                                                              |
|  Daily Limit: $500.00  [  Edit  ]                            |
|  Per Transaction: $500.00  [  Edit  ]                        |
|                                                              |
|  Card Details  ->                                             |
|  Withdraw Balance  ->                                         |
|  Cancel Card  ->                                              |
|                                                              |
|  Delegation expires: Aug 14, 2026 (90 days)                  |
|  [  Revoke All Cards  ]                                      |
|                                                              |
+--------------------------------------------------------------+
```

#### 6.30a Freeze Card

```
+-- Freeze Card -----------------------------------------------+
|  **  Card frozen                                              |
|  Your card is now frozen. No new transactions will be        |
|  authorized. Existing pre-auth holds may still settle.       |
|                                                              |
|  [  Unfreeze  ]              [  Done  ]                      |
+--------------------------------------------------------------+
```

#### 6.30b Unfreeze Card

```
+-- Unfreeze Card ---------------------------------------------+
|  +  Card unfrozen                                            |
|  Your card is now active. New transactions will be           |
|  authorized as normal.                                       |
|                                                              |
|  [  Done  ]                                                   |
+--------------------------------------------------------------+
```

#### 6.30c Spending Limits

```
+-- Spending Limits -------------------------------------------+
|                                                              |
|  Daily spending cap: $500.00                                 |
|  [  $      ] [  Save  ]                                      |
|                                                              |
|  Per-transaction cap: $500.00                                |
|  [  $      ] [  Save  ]                                      |
|                                                              |
|  Note: Limit increases take effect after a 24-hour cooldown. |
|  Decreasing limits is immediate.                             |
|                                                              |
|  [  Back  ]                                                   |
+--------------------------------------------------------------+
```

#### Delegation Renewal Warning

Shown 7 days before expiry:

```
+-- ! Spending Delegation Expiring ---------------------------+
|                                                              |
|  Your card spending delegation expires in 7 days             |
|  (August 14, 2026).                                          |
|                                                              |
|  Renew now to continue using your card without interruption. |
|                                                              |
|  [  Renew Delegation  ]          [  Remind Me Later  ]       |
+--------------------------------------------------------------+
```

Shown on Card Dashboard and Settings when delegation expiry <= 7 days. Uses `role="alert"` for screen reader announcement.

#### 6.30d Withdraw from Card

```
+-- Withdraw from Card ---------------------------------------+
|                                                              |
|  Card Balance: $250.00                                       |
|                                                              |
|  Amount to withdraw: [  $       ]                            |
|                                                              |
|  Will be deposited to your USDT wallet.                      |
|  Estimated arrival: 1-2 business days.                       |
|                                                              |
|  [  Cancel  ]                [  Confirm Withdraw  ]         |
+--------------------------------------------------------------+
```

#### 6.30e Card Details

```
+-- Card Details ----------------------------------------------+
|                                                              |
|  Card number: **** **** **** 4532                            |
|  Expiry: 12/28                                               |
|  Status: Active                                              |
|                                                              |
|  [  Show Full Number  ]  (one-time, with biometric auth)     |
|                                                              |
|  Added to Google Pay: + May 15, 2026                        |
|                                                              |
|  [  Remove from Google Pay  ]                                |
|                                                              |
|  [  Cancel Card  ]                                           |
|                                                              |
|  [  Back  ]                                                   |
+--------------------------------------------------------------+
```

#### 6.30e-bis Delegation Revoked State

When a user revokes their spending delegation (via "Revoke All Cards" or on-chain revocation), the dashboard shows:

```
+-- BitTasker Visa Debit Card ---------------------------------+
|                                                              |
|  🔒  Spending authorization revoked                          |
|                                                              |
|  Your card is still active, but spending has been disabled.  |
|  Card balance: $1,250.00                                     |
|                                                              |
|  [⟳ Withdraw Balance to Wallet]                              |
|                                                              |
|  To re-enable spending, set up a new card.                    |
|  [  Set Up New Card  ]                                       |
|                                                              |
+--------------------------------------------------------------+
```

The card number remains visible but greyed out. The Google Pay token is removed upon revocation. If a balance sweep is in progress, a spinner replaces the balance amount with "Sweeping balance to wallet..."

#### 6.30e-ter Delegation Expired State

When the 90-day spending authorization expires:

```
+-- BitTasker Visa Debit Card ---------------------------------+
|                                                              |
|  ⏰  Spending authorization expired                           |
|                                                              |
|  Your 90-day card authorization ended on May 15, 2026.       |
|  Card balance: $850.00                                       |
|                                                              |
|  [⟳ Withdraw Balance]     [🔄 Renew Authorization]           |
|                                                              |
+--------------------------------------------------------------+
```

Renewing re-opens Step 3 of the guided creation flow (delegation signing only -- KYC is not re-required for renewal). The card number and previous limits are pre-filled.

#### 6.30f Cancel Card

```
+-- Cancel Card -----------------------------------------------+
|  !  Are you sure you want to cancel your card?               |
|                                                              |
|  Cancelling will:                                             |
|  * Revoke the EIP-712 spending delegation                      |
|  * Sweep remaining balance ($250.00) back to your wallet     |
|  * Remove card from Google Pay                               |
|  * Permanently invalidate the virtual card number            |
|                                                              |
|  This action cannot be undone.                               |
|                                                              |
|  [  Go Back  ]                    [  Cancel Card  ]          |
+--------------------------------------------------------------+
```

**Cancel confirmation**:

```
+-- Card Cancelled --------------------------------------------+
|  +  Card cancelled successfully                              |
|                                                              |
|  Remaining balance of $250.00 has been swept to your         |
|  USDT wallet. This may take 1-2 business days to appear.    |
|                                                              |
|  [  Done  ]                                                   |
+--------------------------------------------------------------+
```

### 3.7 Card Animation System

Animations defined for card interactions:

| Element                   | Trigger                               | Animation                               | Duration   | Easing      | prefers-reduced-motion  | Screen reader                                                        |
| ------------------------- | ------------------------------------- | --------------------------------------- | ---------- | ----------- | ----------------------- | -------------------------------------------------------------------- |
| Card face                 | Dashboard appears                     | Slide-up fade-in                        | 300ms      | ease-out    | Opacity only (no slide) | `aria-label="Card ending in 4532, balance 250 dollars"` on container |
| Card balance              | Value changes                         | Cross-fade number transition            | 200ms      | ease-out    | Disabled                | Announce new balance via `aria-live="polite"`                        |
| Transaction row           | New item appears                      | Slide-in from right                     | 300ms      | ease-out    | Opacity only            | `aria-live="polite"` on list region                                  |
| Transaction highlight     | Purchase settles (pending -> cleared) | Highlight fade (#E8F5E9 -> transparent) | 1.2s       | ease-in-out | Disabled                | `aria-label` update on row                                           |
| KYC step transition       | Form -> delegation -> success         | Cross-fade                              | 300ms      | ease-out    | Disabled                | Focus management: auto-focus first interactive element               |
| Card loading skeleton     | Dashboard loads                       | Shimmer (default daisyUI skeleton)      | 1.5s cycle | N/A         | Disabled                | `aria-busy="true"` on card container                                 |
| Freeze/Unfreeze           | Toggle                                | Icon transition + status text update    | 200ms      | ease-out    | Disabled                | `aria-live="polite"` announcement                                    |
| Delegation expiry warning | App startup (<=7 days)                | Slide-down banner                       | 300ms      | ease-out    | Opacity only            | `role="alert"` on banner                                             |
| Card cancellation         | Confirm                               | Fade-out card + success state           | 300ms      | ease-out    | Opacity only            | `role="alert"` + `aria-live="assertive"` on confirmation             |

**Shared implementation**: `prefers-reduced-motion` is managed via per-component `$state()` initialized inside `onMount` with `browser` guard, updated via `change` event listener on the `matchMedia` query. All animations uniformly switch to opacity-only (no scale/slide/transform) when reduced motion is preferred. Skeleton shimmer disabled via CSS class toggle. `onMount` ensures no SSR crash. Shared via `src/lib/stores/accessibility.store.ts`.

---

## 4. Implementation: Phase 8 -- Baanx Debit Card Integration

**Timeline**: Week 8-10 (feature-flagged)

**Prerequisite**: Baanx business partnership approved and API credentials provisioned (`VITE_BAANX_CARDS_ENABLED=true`).

### 4.1 Phase 8 Task Table

| Task | File(s)                          | Description                                                                                                                                                                                                                                                            |
| ---- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 8.1  | `baanx-card.service.ts`          | Baanx REST API client (card issuance, balance, freeze/unfreeze, delegation, tokenization)                                                                                                                                                                              |
| 8.1a | `workers-site/handlers/baanx.js` | CF Worker proxy for Baanx REST API. Routes POST /api/baanx/card/\* to Baanx API. Auth: `BAANX_API_KEY` + `BAANX_API_SECRET` via `wrangler secret put`. Origin validation, rate limiting, error filtering (strip internal details). Follow pattern from `changelly.js`. |
| 8.2  | `card.store.ts`                  | Card state management: balance, status, spending limits, transaction history                                                                                                                                                                                           |
| 8.3  | `feature-flags.ts`               | VITE\_ feature flag service                                                                                                                                                                                                                                            |
| 8.4  | `CardDashboard.svelte`           | Card UI: virtual card display, balance, "Add to Google Pay" button, freeze/unfreeze toggle                                                                                                                                                                             |
| 8.5  | `CreateCardFlow.svelte`          | Guided card creation: KYC form (name/address/DOB) -> delegation sign -> card issued                                                                                                                                                                                    |
| 8.6  | `LoadCardModal.svelte`           | Fund card from USDT wallet balance                                                                                                                                                                                                                                     |
| 8.7  | `CardTransactionHistory.svelte`  | Per-card transaction list with real-time updates                                                                                                                                                                                                                       |
| 8.8  | `BankingMenu.svelte` (update)    | Add "Debit Card" section, gated by `VITE_BAANX_CARDS_ENABLED`                                                                                                                                                                                                          |
| 8.9  | `wallet.store.ts` (update)       | Add card balance to totals, card load/sweep transactions                                                                                                                                                                                                               |
| 8.9a | Sentry breadcrumbs               | Log all card API calls + state transitions (issuance, load, spend, freeze, withdraw) as Sentry breadcrumbs                                                                                                                                                             |
| 8.10 | EIP-712 delegation signature     | Structured signing for card spending authorization (limits, expiry, revocable)                                                                                                                                                                                         |
| 8.11 | Tests                            | Unit + integration for card service, store, and UI components                                                                                                                                                                                                          |
| 8.12 | E2E                              | Create card -> load -> spend (mock Baanx API) -> withdraw flow                                                                                                                                                                                                         |
| 8.13 | `WithdrawFromCardModal.svelte`   | Withdraw unspent card balance back to USDT wallet                                                                                                                                                                                                                      |
| 8.14 | `CardLimitsForm.svelte`          | Set/modify daily spending limits                                                                                                                                                                                                                                       |
| 8.15 | Google Pay error handling        | Tokenization failure fallback UX: retry, skip, contact support                                                                                                                                                                                                         |
| 8.16 | Delegation revocation            | Cancel card -> revoke spending delegation -> zero card balance sweep                                                                                                                                                                                                   |
| 8.17 | KYC retry/denial UX              | KYC failure: show reason, allow correction, retry flow                                                                                                                                                                                                                 |
| 8.18 | Card issuance status             | Handle pending/failed/delayed card issuance states                                                                                                                                                                                                                     |
| 8.19 | Card push notifications          | Firebase push on card transactions (spend alerts, load confirmations)                                                                                                                                                                                                  |

### 4.2 Feature Flag Gating

- `VITE_BAANX_CARDS_ENABLED=false` -> entire card UI surface is absent. No API calls, no store initialization, no UI components rendered.
- `VITE_BAANX_CARDS_ENABLED=true` -> full card functionality available.

---

## 5. API Dependencies

### 5.1 Baanx Card API

The Baanx REST API provides card issuing, management, and non-custodial delegation for Visa/Mastercard debit cards. Baanx Group Ltd is FCA-regulated and powers the MetaMask Card.

**API**: REST with OpenAPI 3.1 specification. Base URL provisioned per tenant.
**Auth**: API key + OAuth2 client credentials. Credentials stored as CF Worker secrets (`BAANX_API_KEY`, `BAANX_API_SECRET`).
**Docs**: https://docs.baanx.com/

**Non-custodial pattern**: Users sign one EIP-712 delegation at card creation. Baanx sweeps USDT from the card address at transaction time. No per-transaction wallet signature needed. Users can withdraw unspent balance back to wallet.

**Business onboarding**: Requires partnership agreement. Estimated 4-12 weeks for compliance review. Gated behind `VITE_BAANX_CARDS_ENABLED=false` until provisioned.

**Baanx KYC data flow**: The `CreateCardFlow.svelte` form collects name, address, and DOB. This data is transmitted to Baanx's API via the CF Worker proxy (`workers-site/handlers/baanx.js`). The data MUST NOT be cached, stored, or logged by BitTasker infrastructure at any layer (no `Preferences.set()`, no `localStorage`, no `console.log`, no Sentry breadcrumb with PII). The CF Worker proxy acts as a stateless relay only -- it forwards the KYC payload to Baanx and returns the response without retaining the data. The app displays a consent notice: "Your identity data will be sent to Baanx Group (FCA-regulated) for card issuance verification." Request and response headers MUST set `Cache-Control: no-store`.

**PCI/card data**: Card numbers, CVV, and billing details are handled entirely by Baanx's PCI-compliant infrastructure. Card data never reaches BitTasker's servers, Workers, or client code. The app displays only the last 4 digits and tokenized Google Pay references.

### 5.2 API Endpoints

| Endpoint                                  | Purpose                      |
| ----------------------------------------- | ---------------------------- |
| `/api/card/order`                         | Issue virtual card           |
| `/api/card/balance`                       | Check card balance           |
| `/api/card/freeze` / `/api/card/unfreeze` | Card controls                |
| `/api/card/limits`                        | Set spending limits          |
| `/api/card/transactions`                  | Transaction history          |
| `/api/delegation/register`                | Register spending delegation |
| `/api/card/tokenize`                      | Google Pay tokenization      |

**Dependency declaration**:

```json
{
	"dependencies": {
		"@baanx/card-api-client": "N/A -- not a public npm package. Baanx provides REST API access via partnership. All Baanx interactions go through workers-site/handlers/baanx.js."
	}
}
```

### 5.3 Rate Limiting

Enforced at CF Worker proxy. Per-wallet-address: 30 requests/minute. Global: 100 requests/minute across all wallets. Sensitive endpoints (`/api/delegation/register`, `/api/card/order`, `/api/card/freeze`, `/api/card/withdraw`): 5 requests/hour per wallet. Anomaly detection: flag + alert if > 5 card operations per wallet per hour.

### 5.4 Authentication & Secrets

All external API credentials (Baanx, Changelly, Candide) follow these rules:

| Policy                 | Requirement                                                                                     |
| ---------------------- | ----------------------------------------------------------------------------------------------- |
| Storage                | `wrangler secret put` -- never in client code, `.env`, or git                                   |
| Rotation               | Every 90 days; documented in operational runbook                                                |
| Environment separation | Dev, staging, and production use separate API keys                                              |
| Access audit           | `wrangler secret list` reviewed monthly; access revoked on role change                          |
| Breach response        | Rotate compromised key within 1 hour; notify affected users; audit logs for unauthorized access |
| CI/CD                  | Secrets injected via deployment environment variables, never hardcoded in workflow files        |

### 5.5 API Security Model

The Baanx CF Worker proxy requires BOTH a valid BitTasker app session AND the Worker-level API key before forwarding any request to Baanx. This prevents a leaked API key from being sufficient to call Baanx endpoints. Session verification includes: (a) Nostr auth event signature check, (b) session expiry (< 1 hour), (c) pubkey matches the wallet address for delegation operations. The proxy also maintains an audit log of all forwarded requests (no PII) for security monitoring.

### 5.6 KYC Data Protection Prerequisites

- Data Processing Agreement (DPA) signed with Baanx before Phase 8 begins
- Confirm Baanx supports a redirect model where user enters KYC directly on Baanx's portal -- if not, formalize forwarding compliance
- GDPR: Verify Baanx data center locations against user locations; if EU users are served, confirm UK adequacy decision or SCCs in place
- GDPR right to deletion: DPA with Baanx must cover Article 17 (right to erasure). User card cancellation triggers KYC data deletion request to Baanx within 30 days. Confirmation of deletion is displayed in the card cancellation success screen.
- Sentry filter rule: Strip PII fields (name, address, DOB) from all error logs, breadcrumbs, and crash reports
- Worker-level header: `Cache-Control: no-store` on all KYC proxy responses
- KYC data MUST never appear in Worker console.log, Sentry breadcrumbs, or Capacitor Preferences

---

## 6. Feature Flag Dependency Map

### 6.1 Feature Flag Table

| Feature           | External Dependency | VITE\_ Flag                | Provisioned? | Notes                         |
| ----------------- | ------------------- | -------------------------- | ------------ | ----------------------------- |
| Baanx Debit Cards | Baanx API           | `VITE_BAANX_CARDS_ENABLED` | No           | Requires 4-12 week onboarding |

### 6.2 Feature Flag Implementation

```typescript
// src/lib/services/feature-flags.ts
const FF_BAANX_CARDS = import.meta.env.VITE_BAANX_CARDS_ENABLED === 'true';

export function isBaanxCardsEnabled(): boolean {
	return FF_BAANX_CARDS;
}
```

**.env pattern:**

```bash
# Build-time feature flags -- set to 'true' when external dependency is provisioned
VITE_BAANX_CARDS_ENABLED=false   # Requires Baanx partnership (4-12 week onboarding)
```

**VITE\_ flag visibility**: VITE* prefixed environment variables are statically embedded in the client bundle at build time and visible in source maps. Do NOT place secrets, API keys, or sensitive configuration values in VITE* flags. These flags control feature surface only (UI visibility, store initialization). Actual API credentials for Baanx are stored as CF Worker secrets (never in VITE\_ or client code).

**.env file in version control:** `.env.example` is committed with all feature flags set to `false`. Actual `.env` is in `.gitignore` (prevents accidental commits of API keys and enabled flags). CI/CD sets flags per environment via deployment secrets.

### 6.3 Estimated Integration Effort

~4-6 hours for custodial path, ~6 hours for non-custodial delegation path (per Baanx docs). Business onboarding: 4-12 weeks (gated by compliance review, not technical integration).

---

## 7. Confidence Gate -- Baanx Checklist

The following Baanx-specific items must pass before the integration is marked complete:

- [ ] All Baanx card API calls mocked and tested (card issuance, delegation, freeze, load, withdraw)
- [ ] Guided card creation flow tested (happy path + KYC failure + delegation failure)
- [ ] `VITE_BAANX_CARDS_ENABLED=false` verified: no card UI, no API calls, no store init
- [ ] Feature flag gating applied to ALL external-dependency features (Baanx)
- [ ] All VITE\_ feature flags documented in `.env.example`
- [ ] PCI/card data verification: card numbers, CVV, and billing details never reach BitTasker infrastructure
- [ ] KYC data PII stripping verified: name, address, DOB stripped from Sentry, console, and Preferences
- [ ] CF Worker `Cache-Control: no-store` set on all KYC proxy responses
- [ ] DPA with Baanx signed and verified (Phase 8 gate)
- [ ] Re-audit required: v4.1 additions (Baanx card infrastructure, feature flag architecture) require re-audit across all 4 dimensions

---

## 8. Appendix A: New Baanx Files

```
workers-site/handlers/baanx.js                    -- CF Worker proxy for Baanx card API
src/lib/services/baanx-card.service.ts            -- Baanx REST API client (cards, delegation, tokenization)
src/lib/services/feature-flags.ts                  -- Two-tier feature flag service
src/lib/stores/card.store.ts                       -- Card state management
src/lib/components/wallet/CardDashboard.svelte     -- Virtual card display + controls
src/lib/components/wallet/CreateCardFlow.svelte    -- Guided card creation + KYC
src/lib/components/wallet/LoadCardModal.svelte     -- Fund card from USDT wallet
src/lib/components/wallet/CardTransactionHistory.svelte -- Per-card transaction list
```

---

## 9. Appendix B: Modified Files

```
src/lib/stores/wallet.store.ts                       -- Add card balance to totals, card load/sweep transactions
src/lib/components/wallet/BankingMenu.svelte         -- Add "Debit Card" section, gated by VITE_BAANX_CARDS_ENABLED
```

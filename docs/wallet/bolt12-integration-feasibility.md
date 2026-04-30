# BOLT12 Integration Feasibility Analysis

**Author:** BitTasker Development Team  
**Date:** April 2026  
**Status:** Research & Analysis  
**Version:** 1.0

---

## Executive Summary

This document provides a comprehensive analysis of integrating BOLT12 (Offers) support into BitTasker's wallet system. BOLT12 is the Lightning Network's next-generation payment protocol that solves the amountless invoice problem that users currently experience with submarine swaps through Boltz.

### Key Findings

| Aspect                  | Assessment                               | Risk Level |
| ----------------------- | ---------------------------------------- | ---------- |
| Boltz API Support       | ✅ Full support since Sept 2024          | Low        |
| Client-Side Libraries   | ✅ Available (bolt12-ts, bolt12-decoder) | Low        |
| Integration Complexity  | ⚠️ Moderate for submarine swaps          | Medium     |
| BIP-353 Support         | ✅ Well-documented                       | Low        |
| Reverse Swap Complexity | ❌ High (requires Lightning node)        | High       |

**Recommendation:** Implement BOLT12 support for **submarine swaps only** (chain → Lightning) as Phase 1, which directly solves the amountless invoice problem.

---

## Table of Contents

1. [Background: The Amountless Invoice Problem](#1-background-the-amountless-invoice-problem)
2. [What is BOLT12?](#2-what-is-bolt12)
3. [Boltz API BOLT12 Support](#3-boltz-api-bolt12-support)
4. [Current BitTasker Architecture](#4-current-bittasker-architecture)
5. [Integration Approach](#5-integration-approach)
6. [Technical Implementation Plan](#6-technical-implementation-plan)
7. [BIP-353 Integration](#7-bip-353-integration)
8. [Libraries and Dependencies](#8-libraries-and-dependencies)
9. [Security Considerations](#9-security-considerations)
10. [Limitations and Challenges](#10-limitations-and-challenges)
11. [Implementation Roadmap](#11-implementation-roadmap)
12. [References](#12-references)

---

## 1. Background: The Amountless Invoice Problem

### Problem Statement

Users receive the error `"0 is less than minimal of 2500"` when attempting submarine swaps with amountless BOLT11 invoices. This occurs because:

1. BOLT11 invoices can be created without a specified amount
2. Boltz submarine swaps **require** the amount to be embedded in the invoice
3. The amount cannot be added to an existing invoice (it would break the cryptographic signature)

### Why Boltz Rejects Amountless Invoices

From [Boltz Support Documentation](https://support.boltz.exchange/hc/center/articles/1745247555):

> "Because it wouldn't be trustless. Here is a scenario illustrating the problem:
>
> 1. User creates a swap for 0.25 BTC -> Lightning using a zero amount invoice
> 2. User sends 0.25 BTC on-chain, expecting the same amount on Lightning
> 3. Boltz could now send a minimal amount (e.g., 1 satoshi) to the user's zero amount invoice to unlock the cryptographic secret for claiming the 0.25 BTC on-chain."

This breaks the trustless nature of atomic swaps.

### BOLT12 Solution

BOLT12 introduces **offers** - static, reusable payment endpoints that dynamically fetch invoices with specific amounts at payment time. This solves the amountless invoice problem by design.

---

## 2. What is BOLT12?

### Overview

BOLT12 is a protocol extension to the Lightning Network specification that introduces:

- **Offers (`lno1...`)**: Static, reusable payment codes
- **Invoice Requests (`lnr1...`)**: Requests sent to offers for specific amounts
- **Invoices (`lni1...`)**: Fresh invoices generated per payment

### How BOLT12 Works

```
┌─────────────────────────────────────────────────────────────────────┐
│                         BOLT12 Payment Flow                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. Receiver publishes static offer (lno1...)                       │
│     └── Contains: terms, description, optional amount, blinded path │
│                                                                     │
│  2. Sender reads offer and sends invoice_request                    │
│     └── Specifies exact amount needed                               │
│     └── Travels via onion messages through blinded path             │
│                                                                     │
│  3. Receiver generates fresh invoice (lni1...)                      │
│     └── Contains unique payment hash for this specific payment      │
│     └── Returns via onion message reply path                        │
│                                                                     │
│  4. Sender pays invoice via standard Lightning HTLC                 │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### BOLT12 vs BOLT11 Comparison

| Feature          | BOLT11                                        | BOLT12                              |
| ---------------- | --------------------------------------------- | ----------------------------------- |
| Reusability      | Single-use only                               | Reusable offers with fresh invoices |
| Privacy          | Route hints expose channel graph              | Blinded paths hide recipient        |
| Invoice delivery | Out-of-band (QR, URL, etc.)                   | In-band via onion messages          |
| Amount           | Fixed at creation or amountless (problematic) | **Negotiated per request**          |
| Refunds          | Not supported natively                        | Built-in refund flow                |
| Subscriptions    | Not supported                                 | Recurring payment fields            |
| Encoding         | Bech32                                        | TLV-based                           |
| Payer identity   | No standard mechanism                         | Payer key for proof-of-payment      |

### Implementation Status (April 2026)

| Implementation       | BOLT12 Support                                          |
| -------------------- | ------------------------------------------------------- |
| Core Lightning (CLN) | ✅ Production-ready (since 2022)                        |
| LDK                  | ✅ Full support (offers, onion messages, blinded paths) |
| Eclair/Phoenix       | ✅ Full support                                         |
| LND                  | ⚠️ In progress (onion messaging completed March 2026)   |

---

## 3. Boltz API BOLT12 Support

### Submarine Swaps (Chain → Lightning)

Boltz fully supports BOLT12 invoices for submarine swaps. The flow is identical to BOLT11:

```typescript
// POST /v2/swap/submarine
{
  "invoice": "lni1...", // BOLT12 invoice (or BOLT11)
  "from": "RBTC",
  "to": "BTC",
  "refundPublicKey": "<hex>"
}
```

### Fetching BOLT12 Invoices from Offers

Boltz provides an API endpoint to fetch invoices from offers:

```
POST /lightning/{currency}/bolt12/fetch
```

**Request:**

```json
{
	"offer": "lno1...",
	"amount": 100000 // Amount in satoshis
}
```

**Response:**

```json
{
	"invoice": "lni1..."
}
```

### Invoice Verification

When fetching an invoice from an offer, the signing key must be verified:

1. If the offer has a signing key defined, the invoice must be signed by that key
2. Otherwise, the signing key must match the public key of the last hop in a message path

Reference implementations:

- [TypeScript (boltz-web-app)](https://github.com/BoltzExchange/boltz-web-app/blob/f94e7cdb31946ccbc4bd5d2f4f29086ca63c7335/src/utils/invoice.ts#L261)
- [Rust (boltz-client)](https://github.com/BoltzExchange/boltz-client/blob/63a2bdd8a7729d45fe0c9b7a016a847bc5a83976/lightning/lib/bolt12/src/lib.rs#L113)

### Reverse Swaps (Lightning → Chain) - Complex

Reverse swaps with BOLT12 are significantly more complex and require:

1. Creating a BOLT12 offer
2. Registering it with Boltz API
3. Responding to invoice requests via webhook or WebSocket
4. Having a CLN node in the blinded message path

**This is NOT recommended for BitTasker's current architecture** as it requires running Lightning infrastructure.

---

## 4. Current BitTasker Architecture

### Wallet Stack

```
┌─────────────────────────────────────────────────────────────────────┐
│                        BitTasker Wallet                             │
├─────────────────────────────────────────────────────────────────────┤
│  UI Layer (Svelte 5)                                                │
│  └── SendPaymentForm.svelte                                         │
│  └── WalletPaymentModal.svelte                                      │
├─────────────────────────────────────────────────────────────────────┤
│  Store Layer                                                        │
│  └── wallet.store.ts                                                │
│      └── createSubmarineSwap()                                      │
│      └── lockSubmarineSwapFunds()                                   │
├─────────────────────────────────────────────────────────────────────┤
│  SDK Layer                                                          │
│  └── @bittasker/wallet-core                                         │
│      └── submarineSwapService                                       │
│      └── boltzClient                                                │
├─────────────────────────────────────────────────────────────────────┤
│  External Services                                                  │
│  └── Boltz API (api.boltz.exchange)                                 │
│  └── RSK Network                                                    │
└─────────────────────────────────────────────────────────────────────┘
```

### Current Lightning Support

| File                      | Purpose                                       |
| ------------------------- | --------------------------------------------- |
| `lightningInvoice.ts`     | Detects BOLT11/BOLT12, parses BOLT11 invoices |
| `paymentAddressParser.ts` | Unified address/invoice parsing               |
| `wallet.store.ts`         | Submarine swap orchestration                  |
| `@bittasker/wallet-core`  | SDK with Boltz integration                    |

### Current BOLT12 Detection (Already Implemented!)

```typescript
// src/lib/utils/helpers/lightningInvoice.ts
export function detectLightningType(
	input: string
): 'bolt11' | 'bolt12' | 'lightning-address' | 'unknown' {
	// ...
	// Check for BOLT12 prefixes (must come before BOLT11 check)
	// BOLT12 uses: lno (offer), lnr (invoice request), lni (invoice)
	if (
		lowerInput.startsWith('lno') ||
		lowerInput.startsWith('lnr') ||
		lowerInput.startsWith('lni')
	) {
		return 'bolt12';
	}
	// ...
}
```

**Good news:** The codebase already detects BOLT12 strings but doesn't process them yet.

---

## 5. Integration Approach

### Recommended Strategy: Submarine Swaps Only

For Phase 1, focus exclusively on submarine swaps (RBTC → Lightning) because:

1. **Directly solves the user's problem** - Users can pay BOLT12 offers with any amount
2. **No Lightning infrastructure required** - Boltz handles the Lightning side
3. **Simple API integration** - Uses existing Boltz API with one additional endpoint
4. **Lower risk** - Builds on existing, working submarine swap flow

### Flow Comparison

**Current Flow (BOLT11 Only):**

```
User pastes BOLT11 invoice → Parse amount → Create swap → Lock funds → Boltz pays
```

**New Flow (BOLT12 Support):**

```
User pastes BOLT12 offer → User enters amount → Fetch invoice from Boltz → Create swap → Lock funds → Boltz pays
```

---

## 6. Technical Implementation Plan

### Phase 1: BOLT12 Offer Decoding

**Add bolt12-ts library:**

```bash
npm install bolt12-ts
```

**Create BOLT12 parser utility:**

```typescript
// src/lib/utils/helpers/bolt12Parser.ts
import { decodeBolt12 } from 'bolt12-ts';

export interface ParsedBolt12Offer {
	isValid: boolean;
	type: 'offer' | 'invoice' | 'invoice_request';
	description: string | null;
	amountMsat: bigint | null;
	hasAmount: boolean;
	nodeId: string | null;
	issuer: string | null;
	expiry: number | null;
	raw: string;
}

export function parseBolt12Offer(offer: string): ParsedBolt12Offer {
	try {
		const decoded = decodeBolt12(offer);

		return {
			isValid: true,
			type:
				decoded.prefix === 'lno'
					? 'offer'
					: decoded.prefix === 'lni'
						? 'invoice'
						: 'invoice_request',
			description: decoded.tlvs.find((t) => t.type === 10)?.value || null,
			amountMsat: decoded.tlvs.find((t) => t.type === 8)?.value || null,
			hasAmount: !!decoded.tlvs.find((t) => t.type === 8),
			nodeId: decoded.tlvs.find((t) => t.type === 22)?.value || null,
			issuer: decoded.tlvs.find((t) => t.type === 18)?.value || null,
			expiry: decoded.tlvs.find((t) => t.type === 14)?.value || null,
			raw: offer
		};
	} catch (error) {
		return {
			isValid: false,
			type: 'offer',
			description: null,
			amountMsat: null,
			hasAmount: false,
			nodeId: null,
			issuer: null,
			expiry: null,
			raw: offer
		};
	}
}
```

### Phase 2: Boltz BOLT12 Invoice Fetching

**Add to wallet-core SDK or wallet.store.ts:**

```typescript
// Boltz API endpoint for fetching BOLT12 invoices
const BOLTZ_BOLT12_FETCH_ENDPOINT = 'https://api.boltz.exchange/lightning/BTC/bolt12/fetch';

export interface FetchBolt12InvoiceParams {
	offer: string; // BOLT12 offer (lno1...)
	amountSats: number; // Amount in satoshis
}

export interface FetchBolt12InvoiceResult {
	invoice: string; // BOLT12 invoice (lni1...)
}

export async function fetchBolt12Invoice(
	params: FetchBolt12InvoiceParams
): Promise<FetchBolt12InvoiceResult> {
	const response = await fetch(BOLTZ_BOLT12_FETCH_ENDPOINT, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			offer: params.offer,
			amount: params.amountSats
		})
	});

	if (!response.ok) {
		const error = await response.json();
		throw new Error(`Failed to fetch BOLT12 invoice: ${error.error || response.statusText}`);
	}

	return response.json();
}
```

### Phase 3: UI Integration

**Update paymentAddressParser.ts:**

```typescript
// Handle BOLT12 offers
if (lightningType === 'bolt12') {
	const parsed = parseBolt12Offer(trimmed);

	if (parsed.type === 'offer') {
		return {
			isValid: true,
			address: trimmed,
			network: 'lightning-bitcoin',
			amount: parsed.hasAmount ? Number(parsed.amountMsat / 1000n) : null,
			memo: parsed.description,
			isBolt12Offer: true // New flag to indicate amount can be specified
		};
	}

	if (parsed.type === 'invoice') {
		// BOLT12 invoice - treat like BOLT11 with amount
		return {
			isValid: true,
			address: trimmed,
			network: 'lightning-bitcoin',
			amount: parsed.hasAmount ? Number(parsed.amountMsat / 1000n) : null,
			memo: parsed.description
		};
	}
}
```

**Update SendPaymentForm.svelte:**

```svelte
<script>
	// ... existing code ...

	// Handle BOLT12 offer submission
	async function handleSend() {
		if (parsedPayment.isBolt12Offer) {
			// Fetch invoice from Boltz with user-specified amount
			const { invoice } = await walletManager.fetchBolt12Invoice({
				offer: recipient,
				amountSats: amountInSats
			});

			// Create submarine swap with the fetched invoice
			const swapResult = await walletManager.createSubmarineSwap(invoice, formInput.memo);
			// ... rest of swap flow
		} else {
			// Existing BOLT11 flow
		}
	}
</script>
```

### Phase 4: Invoice Verification

Implement verification that the fetched invoice belongs to the offer:

```typescript
import { verifyBolt12Signature, decodeBolt12 } from 'bolt12-ts';

export function verifyInvoiceMatchesOffer(offer: string, invoice: string): boolean {
	const decodedOffer = decodeBolt12(offer);
	const decodedInvoice = decodeBolt12(invoice);

	// Get offer signing key (type 22) or last hop of message paths (type 16)
	const offerSigningKey = decodedOffer.tlvs.find((t) => t.type === 22)?.value;

	// Verify invoice signature matches
	const invoiceSignature = decodedInvoice.tlvs.find((t) => t.type === 240)?.value;

	if (!invoiceSignature) return false;

	// Use bolt12-ts verification
	return verifyBolt12Signature(decodedInvoice.tlvs, invoiceSignature, offerSigningKey, 'lni');
}
```

---

## 7. BIP-353 Integration

### What is BIP-353?

BIP-353 allows human-readable payment addresses like `₿alice@example.com` to resolve to BOLT12 offers via DNS TXT records.

### Resolution Flow

```
₿alice@example.com
       │
       ▼
DNS Lookup: alice.user._bitcoin-payment.example.com
       │
       ▼
TXT Record: "bitcoin:?lno=lno1..."
       │
       ▼
Extract lno parameter → BOLT12 offer
```

### Implementation

```typescript
// src/lib/utils/helpers/bip353.ts

export interface Bip353Resolution {
	success: boolean;
	offer?: string;
	address?: string;
	error?: string;
}

export async function resolveBip353(humanReadable: string): Promise<Bip353Resolution> {
	// Parse ₿user@domain or user@domain format
	const match = humanReadable.match(/^₿?([^@]+)@(.+)$/);
	if (!match) {
		return { success: false, error: 'Invalid format' };
	}

	const [, user, domain] = match;
	const dnsName = `${user}.user._bitcoin-payment.${domain}`;

	try {
		// Use DNS-over-HTTPS for DNSSEC validation
		const response = await fetch(`https://cloudflare-dns.com/dns-query?name=${dnsName}&type=TXT`, {
			headers: { Accept: 'application/dns-json' }
		});

		const data = await response.json();

		if (!data.Answer || data.Answer.length === 0) {
			return { success: false, error: 'No DNS record found' };
		}

		// Parse bitcoin: URI from TXT record
		const txtRecord = data.Answer[0].data.replace(/"/g, '');
		if (!txtRecord.startsWith('bitcoin:')) {
			return { success: false, error: 'Invalid payment instruction' };
		}

		// Extract lno parameter for BOLT12 offer
		const url = new URL(txtRecord);
		const offer = url.searchParams.get('lno');

		if (offer) {
			return { success: true, offer };
		}

		// Check for on-chain address
		const address = url.pathname || url.searchParams.get('bc');
		if (address) {
			return { success: true, address };
		}

		return { success: false, error: 'No payment method found' };
	} catch (error) {
		return { success: false, error: `DNS resolution failed: ${error}` };
	}
}
```

### Important: DNSSEC Validation

Per BIP-353 specification:

> "Clients resolving Bitcoin payment instructions MUST fully validate DNSSEC signatures leading to the DNS root."

For production, use a proper DNSSEC validation library or service:

- [dnssec-prover](https://github.com/TheBlueMatt/dnssec-prover) - WASM-compatible
- DNS-over-HTTPS with DNSSEC flag checking

---

## 8. Libraries and Dependencies

### Recommended Libraries

| Library        | Purpose               | npm                    |
| -------------- | --------------------- | ---------------------- |
| bolt12-ts      | Encode/decode BOLT12  | `npm i bolt12-ts`      |
| bolt12-decoder | Decode only (lighter) | `npm i bolt12-decoder` |

### bolt12-ts Features

- ✅ Full BOLT12 compliance (Offers, Invoice Requests, Invoices, Invoice Errors)
- ✅ BIP-340 Schnorr signature verification
- ✅ Works in browsers (no polyfills needed)
- ✅ Minimal dependencies (@noble/curves, @noble/hashes)
- ✅ TypeScript with full type safety

### Example Usage

```typescript
import { encodeOffer, decodeBolt12, verifyBolt12Signature } from 'bolt12-ts';

// Decode any BOLT12 string
const decoded = decodeBolt12('lno1pqps7sjqpgt...');
console.log(decoded.prefix); // 'lno', 'lnr', or 'lni'

// Verify signature
const isValid = verifyBolt12Signature(decoded.tlvs, signature, publicKey, decoded.prefix);
```

---

## 9. Security Considerations

### Invoice Verification (Critical)

When fetching a BOLT12 invoice from Boltz, **ALWAYS verify**:

1. The invoice signature matches the offer's signing key
2. The amount in the invoice matches what was requested
3. The invoice hasn't expired

```typescript
function validateFetchedInvoice(
	offer: string,
	invoice: string,
	requestedAmountSats: number
): { valid: boolean; error?: string } {
	// 1. Verify signature
	if (!verifyInvoiceMatchesOffer(offer, invoice)) {
		return { valid: false, error: 'Invoice signature does not match offer' };
	}

	// 2. Verify amount
	const decodedInvoice = decodeBolt12(invoice);
	const invoiceAmountMsat = decodedInvoice.tlvs.find((t) => t.type === 8)?.value;
	const invoiceAmountSats = Number(invoiceAmountMsat / 1000n);

	if (Math.abs(invoiceAmountSats - requestedAmountSats) > 1) {
		return { valid: false, error: 'Invoice amount does not match requested amount' };
	}

	// 3. Check expiry
	const createdAt = decodedInvoice.tlvs.find((t) => t.type === 88)?.value;
	const relativeExpiry = decodedInvoice.tlvs.find((t) => t.type === 90)?.value || 7200;
	const expiresAt = (createdAt || 0) + relativeExpiry;

	if (Date.now() / 1000 > expiresAt) {
		return { valid: false, error: 'Invoice has expired' };
	}

	return { valid: true };
}
```

### BIP-353 Security

- **MUST validate DNSSEC** - Never trust DNS responses without cryptographic proof
- **Reject SHA-1 signatures** - Use only SHA-256 or stronger
- **Handle CNAME/DNAME** - Follow redirects but validate entire chain

### Privacy Considerations

BOLT12 offers significant privacy improvements:

- Blinded paths hide the recipient's node identity
- Onion messages don't leak IP addresses (unlike LNURL)
- Each payment gets a unique invoice (no payment correlation)

---

## 10. Limitations and Challenges

### Challenges for BitTasker

| Challenge                      | Mitigation                                                                         |
| ------------------------------ | ---------------------------------------------------------------------------------- |
| **No reverse swap support**    | Focus on submarine swaps only; reverse swaps require Lightning node infrastructure |
| **Onion message connectivity** | Boltz handles this; their CLN nodes have wide connectivity                         |
| **LND ecosystem gaps**         | Not a blocker; Boltz uses CLN which has full support                               |
| **Browser DNS limitations**    | Use DNS-over-HTTPS with DNSSEC validation                                          |

### What We CANNOT Do

1. **Create BOLT12 offers** - Requires Lightning node with BOLT12 support
2. **Receive BOLT12 payments** - Same reason
3. **BOLT12 reverse swaps** - Requires registering offers with Boltz and handling webhooks

### What We CAN Do

1. **Parse BOLT12 offers** - Decode and extract information
2. **Fetch invoices for offers** - Via Boltz API
3. **Pay BOLT12 invoices** - Via submarine swaps (same as BOLT11)
4. **Resolve BIP-353 addresses** - Via DNS-over-HTTPS
5. **Support human-readable addresses** - e.g., `₿user@domain.com`

---

## 11. Implementation Roadmap

### Phase 1: Core BOLT12 Support (Priority: High)

**Goal:** Enable users to pay BOLT12 offers with any amount

| Task                                          | Effort  | Dependencies    |
| --------------------------------------------- | ------- | --------------- |
| Add bolt12-ts dependency                      | 1 hour  | None            |
| Create bolt12Parser.ts utility                | 4 hours | bolt12-ts       |
| Update paymentAddressParser.ts for BOLT12     | 4 hours | bolt12Parser.ts |
| Add fetchBolt12Invoice to wallet.store.ts     | 4 hours | None            |
| Update SendPaymentForm.svelte for BOLT12 flow | 8 hours | All above       |
| Add invoice verification                      | 4 hours | bolt12-ts       |
| Add tests                                     | 8 hours | All above       |
| Add translations                              | 2 hours | UI changes      |

**Total Estimate:** ~35 hours

### Phase 2: BIP-353 Support (Priority: Medium)

**Goal:** Enable users to pay human-readable addresses like `₿user@domain.com`

| Task                            | Effort  | Dependencies   |
| ------------------------------- | ------- | -------------- |
| Implement BIP-353 resolver      | 8 hours | None           |
| Add DNSSEC validation           | 8 hours | bip353.ts      |
| Update paymentAddressParser.ts  | 4 hours | bip353.ts      |
| Update UI to show resolved info | 4 hours | Parser changes |
| Add tests                       | 4 hours | All above      |

**Total Estimate:** ~28 hours

### Phase 3: Enhanced UX (Priority: Low)

**Goal:** Improve user experience with BOLT12

| Task                                             | Effort  | Dependencies |
| ------------------------------------------------ | ------- | ------------ |
| Show offer details (description, issuer, expiry) | 4 hours | Phase 1      |
| Add offer QR code scanning support               | 4 hours | Phase 1      |
| Cache recently used offers                       | 4 hours | Phase 1      |
| Add offer expiry warnings                        | 2 hours | Phase 1      |

**Total Estimate:** ~14 hours

---

## 12. References

### Official Specifications

- [BOLT 12: Offer Encoding](https://github.com/lightning/bolts/blob/master/12-offer-encoding.md)
- [BIP-353: DNS Payment Instructions](https://bips.dev/353)
- [BLIP-32: DNS Resolution via Onion Messages](https://github.com/lightning/blips/blob/master/blip-0032.md)

### Boltz Documentation

- [Boltz API BOLT12 Documentation](https://api.docs.boltz.exchange/bolt12.html)
- [Boltz API Swagger](https://api.boltz.exchange/swagger)
- [Why Amountless Invoices Don't Work](https://support.boltz.exchange/hc/center/articles/1745247555)

### Libraries

- [bolt12-ts (npm)](https://libraries.io/npm/bolt12-ts)
- [bolt12-decoder (GitHub)](https://github.com/lnbc1QWFyb24/bolt12-decoder)
- [Boltz Web App (Reference Implementation)](https://github.com/BoltzExchange/boltz-web-app)

### Educational Resources

- [BOLT 12 Offers Explained (Spark)](https://www.spark.money/research/bolt12-offers-explained)
- [Building BOLT 12 into Strike](https://strike.me/en/blog/bolt12-offers/)
- [bolt12.org](https://bolt12.org/)

### Implementation References

- [Boltz Web App BOLT12 Verification](https://github.com/BoltzExchange/boltz-web-app/blob/f94e7cdb31946ccbc4bd5d2f4f29086ca63c7335/src/utils/invoice.ts#L261)
- [Boltz Client Rust Implementation](https://github.com/BoltzExchange/boltz-client/blob/63a2bdd8a7729d45fe0c9b7a016a847bc5a83976/lightning/lib/bolt12/src/lib.rs#L113)
- [btc-go/bip353 (Go BIP-353 Implementation)](https://github.com/btc-go/bip353)

---

## Appendix A: Glossary

| Term                | Definition                                                           |
| ------------------- | -------------------------------------------------------------------- |
| **BOLT11**          | Current Lightning invoice standard (single-use, may be amountless)   |
| **BOLT12**          | Next-gen Lightning payment protocol with offers and dynamic invoices |
| **Offer**           | Static, reusable payment endpoint (prefix: `lno1`)                   |
| **Invoice Request** | Request for invoice with specific amount (prefix: `lnr1`)            |
| **Blinded Path**    | Encrypted routing that hides recipient identity                      |
| **Onion Message**   | Lightning message transport layer (not payments)                     |
| **BIP-353**         | DNS-based human-readable payment addresses                           |
| **Submarine Swap**  | Atomic swap from on-chain to Lightning                               |
| **Reverse Swap**    | Atomic swap from Lightning to on-chain                               |

---

## Appendix B: Decision Matrix

### Should We Implement BOLT12?

| Criterion                 | Score (1-5) | Notes                                       |
| ------------------------- | ----------- | ------------------------------------------- |
| Solves user problem       | 5           | Directly addresses amountless invoice issue |
| Implementation complexity | 3           | Moderate for submarine swaps                |
| Maintenance burden        | 2           | Low - uses standard library                 |
| Security risk             | 2           | Low with proper verification                |
| User demand               | 4           | High - blocks current users                 |
| Future-proofing           | 5           | BOLT12 is the future of Lightning           |

**Recommendation Score: 21/30 - Strong recommendation to implement**

---

_Document last updated: April 2026_

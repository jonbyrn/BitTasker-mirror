# Changelly Fiat On/Off Ramp Integration — Epic Plan

**Date**: 2026-06-11  
**Status**: Planning  
**Tier**: 4 (Epic — multi-phase, backend + frontend, cross-module)  
**Goal**: Enable users to buy and sell BTC (rBTC, wBTC, BTC on-chain) and USDT0 via the Bank button in the wallet balance screen, moving funds to/from bank accounts through Changelly's aggregated fiat providers (Moonpay, Banxa, Wert, Transak).

---

## 1. Current State Audit

### What Exists (partially wired, simulated)

| Layer | File | Status | Problem |
|-------|------|--------|---------|
| **Kill switch** | `src/lib/services/kill-switch.ts` | ✅ Working | `VITE_CHANGELLY_FIAT_ENABLED` flag exists and gates BankingMenu + service |
| **BankingMenu** | `src/lib/components/wallet/BankingMenu.svelte` | ✅ Working | Buy/Sell cards dispatch `banking:buy` / `banking:sell` events, gated by `isChangeallyFiatEnabled()` |
| **BuySellForm** | `src/lib/components/wallet/BuySellForm.svelte` | ⚠️ Simulated | Quotes are faked (500ms timeout + BTC price calc). Submit uses 2s timeout + fake success toast. Never calls fiat-ramp service. |
| **Client service** | `src/lib/services/fiat-ramp.service.ts` | ⚠️ Wrong API | Calls `createOnRamp`/`createOffRamp` which POST to proxy endpoints that call non-existent Changelly paths (`orders/onramp`, `orders/offramp`). Real API uses `/v1/orders` with direction determined by currency pair. |
| **CF Worker proxy** | `functions/api/changelly/fiat/{onramp,offramp,status}.ts` | ❌ Broken | Uses HMAC-SHA256 signing (`computeHmacSignature`) — Changelly Fiat API requires **RSA-SHA256**. Calls wrong API paths. Missing 5 required endpoints. |
| **CF Worker shared** | `functions/api/changelly/_shared.ts` | ❌ Wrong auth | `callFiatApi()` uses HMAC signing. Need RSA-SHA256 with private key. |
| **i18n** | `static/locales/{en,es}/dashboard/wallet.json` | ✅ Complete | `wallet.buy_sell.*` keys exist (buy, sell, kyc_disclaimer, bank_details, quick amounts, etc.) |

### What's Missing

1. **RSA-SHA256 authentication** — the Fiat API requires RSA signing, not HMAC
2. **5 proxy endpoints** — providers, currencies, countries, offers, validate-address
3. **Webhook endpoint** — for async transaction status updates from Changelly
4. **Real quote flow** — compare offers from multiple providers (Moonpay, Banxa, Wert)
5. **Country/state selection** — required by API, especially for US users
6. **Provider comparison UI** — show rates, fees, payment methods side by side
7. **Redirect flow** — after order creation, open provider's checkout page (InAppBrowser on native, window.open on web)
8. **Transaction tracking** — poll status or receive webhooks, show in transaction history
9. **Off-ramp (sell) flow** — bank account details collection, crypto transfer to provider

---

## 2. Architecture Decision: SDK vs Raw API

### Recommendation: **Raw REST API (no SDK)**

| Factor | SDK (`@changelly/fiat-api-sdk-node`) | Raw REST |
|--------|--------------------------------------|----------|
| **CF Workers compat** | ⚠️ Uses `axios` (works) + may use Node.js `crypto` for RSA (untested in V8 isolate) | ✅ Native `fetch` + Web Crypto API (guaranteed) |
| **Bundle size** | +86KB unpacked + axios dep | Zero additional deps |
| **API surface** | 6 methods | 6 endpoints |
| **TypeScript types** | ✅ Rich types built-in | Define our own (30 min effort) |
| **Maintenance** | Last published >1 year ago, 3 versions total | Full control |
| **RSA signing** | Handled internally (may use Node.js APIs) | Implement with Web Crypto API (guaranteed CF Workers compat) |

**Verdict**: The API surface is small (6 REST endpoints). The SDK's only real value is TypeScript types and RSA signing, both of which are trivial to implement. The SDK's dependency on `axios` (redundant with `fetch`) and potential Node.js `crypto` usage make it a liability in CF Workers. We'll implement direct REST calls with Web Crypto API RSA-SHA256 signing.

---

## 3. Changelly Fiat API Reference

### Authentication
- **X-Api-Key**: Public API key (from Changelly dashboard)
- **X-Api-Signature**: RSA-SHA256 signature of the JSON request body, signed with private key
- Keys are stored as CF Worker secrets: `CHANGELLY_FIAT_API_KEY`, `CHANGELLY_FIAT_API_SECRET` (private key PEM)

### Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/v1/providers` | GET | List available on-ramp providers (Moonpay, Banxa, Wert, Transak) |
| `/v1/currencies` | GET | List supported crypto + fiat currencies |
| `/v1/available-countries` | GET | List countries where purchases are supported |
| `/v1/offers` | GET | Get purchase offers from providers (rates, fees, limits) |
| `/v1/validate-address` | POST | Validate a crypto wallet address for a given currency |
| `/v1/orders` | POST | Create an order → returns `redirectUrl` for provider checkout |

### Transaction Statuses (via webhooks or polling)
- `created` → `pending` → `complete` (success)
- `created` → `pending` → `failed` (failure, refunded)
- `created` → `pending` → `hold` (verification required)
- `created` → `expired` (user abandoned)

### Providers
- **Moonpay**: Card, Apple Pay, SEPA, GBP transfer
- **Banxa**: Card, SEPA, ACH, PIX, PayID, PayPal
- **Wert**: Card, Apple Pay
- **Transak**: Card, SEPA, ACH, PIX, PayPal, Revolut, Venmo, Interac

### Payment Methods
`card`, `IDEAL`, `gbp_bank_transfer`, `sepa_bank_transfer`, `apple_pay`, `pix`, `pay_id`, `pay_pal`, `astro_pay`, `ach`, `DCINTERAC`, `revolut`, `venmo`

---

## 4. Data Flow

### On-Ramp (Buy Crypto)

```
User taps "Buy" in BankingMenu
  → BuySellForm opens (buy tab)
  → User selects asset (rBTC / USDT0 / wBTC / BTC on-chain)
  → User enters fiat amount ($50)
  → Client calls /api/changelly/fiat/offers
      → CF Worker signs request (RSA-SHA256), calls /v1/offers
      → Returns offers from Moonpay, Banxa, Wert (rates, fees, payment methods)
  → UI shows provider comparison (sorted by best rate)
  → User selects provider + payment method
  → Client calls /api/changelly/fiat/validate-address
      → Validates user's wallet address for the selected crypto
  → Client calls /api/changelly/fiat/orders
      → CF Worker creates order at /v1/orders
      → Returns redirectUrl
  → App opens redirectUrl in InAppBrowser (native) or new tab (web)
  → User completes KYC + payment on provider's page
  → Provider sends webhook → /api/changelly/fiat/webhook
      → Updates transaction status in app
  → OR: Client polls /api/changelly/fiat/status until terminal state
```

### Off-Ramp (Sell Crypto)

```
User taps "Sell" in BankingMenu
  → BuySellForm opens (sell tab)
  → User selects asset to sell
  → User enters crypto amount
  → Client calls /api/changelly/fiat/offers (with reversed currency pair)
      → Returns off-ramp offers
  → UI shows provider comparison
  → User enters bank details (IBAN / routing / account)
  → Client calls /api/changelly/fiat/orders (off-ramp direction)
      → Returns redirectUrl or payment instructions
  → User sends crypto to provider's address
  → Provider converts and sends fiat to bank account
  → Webhook updates status
```

---

## 5. Phased Implementation Plan

### Phase 1: Backend — Fix CF Worker Proxy (RSA Auth + All Endpoints)

**Goal**: Working backend that proxies all 6 Changelly Fiat API endpoints with correct RSA-SHA256 authentication.

**Files to modify:**

| File | Change |
|------|--------|
| `functions/api/changelly/_shared.ts` | Add `computeRsaSignature()` using Web Crypto API. Add `callFiatApiV1()` that uses RSA signing instead of HMAC. Keep existing HMAC function for swap API. |
| `functions/api/changelly/fiat/onramp.ts` | Rewrite to call `/v1/orders` with correct params (currencyFrom=fiat, currencyTo=crypto) |
| `functions/api/changelly/fiat/offramp.ts` | Rewrite to call `/v1/orders` with correct params (currencyFrom=crypto, currencyTo=fiat) |
| `functions/api/changelly/fiat/status.ts` | Already close — fix to use RSA-signed `callFiatApiV1()` |

**Files to create:**

| File | Purpose |
|------|---------|
| `functions/api/changelly/fiat/providers.ts` | GET proxy → `/v1/providers` |
| `functions/api/changelly/fiat/currencies.ts` | GET proxy → `/v1/currencies` |
| `functions/api/changelly/fiat/countries.ts` | GET proxy → `/v1/available-countries` |
| `functions/api/changelly/fiat/offers.ts` | GET proxy → `/v1/offers` (params: currencyFrom, currencyTo, amountFrom, country, state) |
| `functions/api/changelly/fiat/validate-address.ts` | POST proxy → `/v1/validate-address` |
| `functions/api/changelly/fiat/webhook.ts` | POST handler for Changelly callback notifications. Validates RSA signature, updates transaction status. |

**Key implementation detail — RSA-SHA256 signing in CF Workers:**

```typescript
// In _shared.ts — new function
export async function computeRsaSignature(
  bodyStr: string,
  privateKeyPem: string
): Promise<string> {
  // Import PEM private key
  const pemHeader = '-----BEGIN PRIVATE KEY-----';
  const pemFooter = '-----END PRIVATE KEY-----';
  const pemContents = privateKeyPem
    .replace(pemHeader, '')
    .replace(pemFooter, '')
    .replace(/\s/g, '');
  const binaryDer = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));

  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryDer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const encoder = new TextEncoder();
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    privateKey,
    encoder.encode(bodyStr)
  );

  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}
```

**Environment variables needed:**
- `CHANGELLY_FIAT_API_KEY` — already exists
- `CHANGELLY_FIAT_API_SECRET` — already exists (but must contain RSA private key PEM, not HMAC secret)

**Testing**: Sandbox API keys from Changelly manager. Test each endpoint individually with curl/Postman through the proxy.

---

### Phase 2: Client Service Layer

**Goal**: Typed client service methods for all proxy endpoints.

**File to rewrite:**

| File | Change |
|------|--------|
| `src/lib/services/fiat-ramp.service.ts` | Add methods: `getProviders()`, `getCurrencies()`, `getAvailableCountries()`, `getOffers()`, `validateAddress()`, `createOrder()`. Rewrite `createOnRamp()`/`createOffRamp()` to use `createOrder()`. Add proper TypeScript interfaces for all Changelly response types. |

**New types to define:**

```typescript
interface ChangellyProvider {
  code: string; // 'moonpay' | 'banxa' | 'wert' | 'transak'
  name: string;
  trustPilotRating: string;
  iconUrl: string;
}

interface ChangellyCurrency {
  ticker: string;
  name: string;
  type: 'crypto' | 'fiat';
  extraIdName: string | null;
  iconUrl: string;
  precision: string;
}

interface ChangellyCountry {
  code: string; // ISO 3166-1 alpha-2
  name: string;
  states?: { code: string; name: string }[];
}

interface ChangellyOffer {
  providerCode: string;
  rate: string;
  invertedRate: string;
  fee: string;
  amountFrom: string;
  amountExpectedTo: string;
  paymentMethodOffers: ChangellyPaymentMethodOffer[];
}

interface ChangellyPaymentMethodOffer {
  method: string;
  methodName: string;
  amountExpectedTo: string;
  invertedRate: string;
  fee: string;
}

interface ChangellyOrder {
  redirectUrl: string;
  orderId: string;
  externalOrderId: string;
  providerCode: string;
  currencyFrom: string;
  currencyTo: string;
  amountFrom: string;
  walletAddress: string;
  createdAt: string;
}

type FiatTransactionStatus =
  | 'created' | 'pending' | 'hold'
  | 'complete' | 'failed' | 'expired' | 'refunded';
```

**Also add:**
- Sentry breadcrumbs on every API call
- `tryCatch()` wrapping on all async operations
- Network check before API calls (`navigator.onLine`)
- Feature flag guard on every public method (already exists)

---

### Phase 3: UI — Rewrite BuySellForm (Buy Flow)

**Goal**: Replace simulated quotes with real Changelly offers. Show provider comparison.

**File to rewrite:**

| File | Change |
|------|--------|
| `src/lib/components/wallet/BuySellForm.svelte` | Major rewrite of the buy flow (see below) |

**Buy flow changes:**

1. **Country detection** (new step, before quotes)
   - Auto-detect country from device locale or IP (Changelly offers endpoint accepts `ip` param)
   - Store in component state, allow user to override
   - US users: require state selection

2. **Asset selection** (keep existing, wire to real currencies)
   - Filter Changelly currencies to only show: BTC (mapped to rBTC/wBTC/BTC-onchain), USDT
   - Keep existing WalletSelector + AssetSelector components

3. **Amount input + quick amounts** (keep existing UI, wire to real quotes)
   - Replace simulated `fetchQuoteForAmount()` with real `fiatRampService.getOffers()`
   - Debounce 500ms (keep existing pattern)
   - Show loading spinner during fetch (keep existing)
   - **New**: Display offers from multiple providers

4. **Provider comparison** (new section)
   - Show a list of offers sorted by `amountExpectedTo` (best first)
   - Each offer shows: provider name + icon, rate, fee, payment methods
   - User taps a provider to select it
   - Payment method selector within each provider (card, SEPA, Apple Pay, etc.)

5. **Submit flow** (replace simulated)
   - Validate wallet address via `fiatRampService.validateAddress()`
   - Create order via `fiatRampService.createOrder()`
   - Open `redirectUrl` in InAppBrowser (Capacitor) or `window.open()` (web)
   - Show "Transaction in progress" state with order ID

6. **Transaction tracking** (new)
   - After order creation, poll `fiatRampService.getTransactionStatus()` every 10s
   - Show status badge: created → pending → complete/failed
   - On terminal status: show success/error toast, close drawer

**Sell flow changes:**

1. **Provider offers** (same as buy but reversed currency pair)
2. **Bank details collection** (keep existing input, add validation)
   - IBAN format validation for SEPA
   - Routing + account number for ACH
   - Show which payment methods each provider supports for off-ramp
3. **Submit flow** (similar to buy)
   - Create off-ramp order
   - Show provider's instructions for sending crypto
   - Track status

**Components to potentially extract:**

| Component | Purpose | Location |
|-----------|---------|----------|
| `ProviderComparison.svelte` | List of offers with provider icons, rates, fees | `src/lib/components/wallet/ProviderComparison.svelte` |
| `PaymentMethodPicker.svelte` | Select payment method within a provider | `src/lib/components/wallet/PaymentMethodPicker.svelte` |
| `CountrySelector.svelte` | Country + US state dropdown | `src/lib/components/wallet/CountrySelector.svelte` |
| `FiatTransactionTracker.svelte` | Status polling + badge display | `src/lib/components/wallet/FiatTransactionTracker.svelte` |

---

### Phase 4: Webhook + Transaction History Integration

**Goal**: Real-time status updates and visibility in the transaction history.

**Files to create/modify:**

| File | Change |
|------|--------|
| `functions/api/changelly/fiat/webhook.ts` | Receive Changelly callbacks. Validate RSA signature. Update local storage / KV / D1 with new status. (CF Workers KV is simplest for a first pass.) |
| `src/lib/stores/wallet.store.ts` | Add `fiatTransactions` array to wallet state. Merge with swap transactions in history view. |
| `src/lib/components/wallet/TransactionHistory.svelte` | Show fiat transactions alongside swap/send/receive. Filter by type. Show provider name, fiat amount, crypto amount, status. |
| `src/lib/services/fiat-ramp.service.ts` | Add `getActiveTransactions()` method. Add polling subscription for pending transactions. |

**Webhook payload (from Changelly):**
```json
{
  "orderId": "changelly-order-123",
  "externalOrderId": "bittasker-order-456",
  "status": "complete",
  "currencyFrom": "USD",
  "currencyTo": "BTC",
  "amountFrom": "50.00",
  "amountTo": "0.00123",
  "walletAddress": "0x...",
  "createdAt": "2026-06-11T10:00:00Z",
  "updatedAt": "2026-06-11T10:15:00Z"
}
```

**Note**: Webhooks require a publicly accessible callback URL. For CF Workers this is straightforward — the worker URL IS the callback. Changelly needs to be configured with the callback URL during API key setup.

---

### Phase 5: Polish + Edge Cases

| Item | Detail |
|------|--------|
| **Error handling** | Map Changelly error types to user-friendly messages. `limits` → "Amount must be between $X and $Y". `country` → "Not available in your country". `currency` → "This asset is not available for purchase". |
| **Offline handling** | Disable buy/sell buttons when `navigator.onLine` is false. Show offline toast. |
| **Capacitor InAppBrowser** | Use `@capacitor/browser` to open redirect URLs in-app on native. Fallback to `window.open()` on web. |
| **Deep links** | Handle return from provider checkout via Capacitor deep link / App URL open. |
| **Rate caching** | Cache offers for 30s to avoid excessive API calls during amount input debouncing. |
| **Provider icons** | Use provider `iconUrl` from API response. Fallback to local icons if URL fails. |
| **KYC info** | Show existing `wallet.buy_sell.kyc_disclaimer` text. Add provider-specific KYC notes if available. |
| **Min/max limits** | Display provider limits from offer response. Validate amount against limits before submit. |
| **i18n additions** | New keys: provider names, payment method names, country names, error messages for each Changelly error type. Add to both `en` and `es` locale files. |
| **Accessibility** | Provider comparison cards need `role="radiogroup"`, keyboard navigation, screen reader announcements for rate updates. |

---

## 6. File Plan Summary

### Files to Modify (8)

| # | File | Phase | Change |
|---|------|-------|--------|
| 1 | `functions/api/changelly/_shared.ts` | 1 | Add `computeRsaSignature()`, `callFiatApiV1()` |
| 2 | `functions/api/changelly/fiat/onramp.ts` | 1 | Rewrite to use `/v1/orders` with RSA auth |
| 3 | `functions/api/changelly/fiat/offramp.ts` | 1 | Rewrite to use `/v1/orders` with RSA auth |
| 4 | `functions/api/changelly/fiat/status.ts` | 1 | Fix to use RSA-signed `callFiatApiV1()` |
| 5 | `src/lib/services/fiat-ramp.service.ts` | 2 | Add all endpoint methods + types |
| 6 | `src/lib/components/wallet/BuySellForm.svelte` | 3 | Major rewrite: real quotes, provider comparison, redirect flow |
| 7 | `src/lib/components/wallet/TransactionHistory.svelte` | 4 | Add fiat transaction display |
| 8 | `static/locales/{en,es}/dashboard/wallet.json` | 3-5 | New i18n keys for providers, errors, statuses |

### Files to Create (7-9)

| # | File | Phase | Purpose |
|---|------|-------|---------|
| 1 | `functions/api/changelly/fiat/providers.ts` | 1 | Proxy → `/v1/providers` |
| 2 | `functions/api/changelly/fiat/currencies.ts` | 1 | Proxy → `/v1/currencies` |
| 3 | `functions/api/changelly/fiat/countries.ts` | 1 | Proxy → `/v1/available-countries` |
| 4 | `functions/api/changelly/fiat/offers.ts` | 1 | Proxy → `/v1/offers` |
| 5 | `functions/api/changelly/fiat/validate-address.ts` | 1 | Proxy → `/v1/validate-address` |
| 6 | `functions/api/changelly/fiat/webhook.ts` | 4 | Changelly callback handler |
| 7 | `src/lib/components/wallet/ProviderComparison.svelte` | 3 | Provider rate comparison UI |
| 8 | `src/lib/components/wallet/CountrySelector.svelte` | 3 | Country/state selection |
| 9 | `src/lib/components/wallet/FiatTransactionTracker.svelte` | 4 | Status polling display |

---

## 7. Security Considerations

1. **API keys never exposed to client** — all Changelly calls go through CF Worker proxy
2. **RSA private key** — stored as CF Worker secret, never in code or env vars
3. **Webhook signature validation** — verify Changelly's callback signature before processing
4. **Input validation** — sanitize all user inputs (amount, wallet address, bank details) at proxy boundary
5. **Rate limiting** — existing rate limiter in `_shared.ts` (30 req/min per IP) applies to all new endpoints
6. **Origin validation** — existing origin check in `_shared.ts` applies to all new endpoints
7. **Bank details** — never stored in client-side state beyond the form. Sent directly to Changelly via proxy. Never logged to Sentry.
8. **KYC** — handled entirely by Changelly's provider pages (redirect flow). BitTasker never sees identity documents.

---

## 8. Testing Strategy

### Unit Tests (Vitest)
- `fiat-ramp.service.ts` — mock fetch, test all methods, error handling, feature flag gating
- `computeRsaSignature()` — test with known input/output pair
- Provider comparison sorting logic
- Country/state validation

### Integration Tests
- CF Worker proxy endpoints — test with sandbox API keys
- Webhook handler — test with mock Changelly payloads
- End-to-end offer → order → redirect flow

### E2E Tests (Playwright)
- Buy flow: select asset → enter amount → see offers → select provider → redirected
- Sell flow: select asset → enter amount → enter bank details → submit
- Error states: network failure, invalid address, country not supported

### Manual Testing
- Sandbox environment with Changelly test keys
- Test on iOS (InAppBrowser), Android (InAppBrowser), Web (window.open)
- Test US user (requires state selection)
- Test non-US user (no state required)

---

## 9. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| RSA signing fails in CF Workers V8 isolate | Low | Critical | Web Crypto API is supported in CF Workers. Test early in Phase 1. Fallback: Cloudflare Functions with Node.js compat flag. |
| Changelly API changes | Low | Medium | API is versioned (`/v1/`). SDK hasn't needed updates in >1 year. Pin API version in proxy. |
| Provider checkout redirect fails on Capacitor | Medium | High | Test `@capacitor/browser` early. Fallback to `window.open()`. Handle deep link return. |
| Sandbox API doesn't match production | Medium | Medium | Test with small real transaction ($10) before launch. Keep feature flag disabled until verified. |
| Off-ramp not supported by all providers | Low | Low | API returns offers only for supported pairs. UI gracefully shows "not available" when no offers returned. |
| Webhook delivery failures | Medium | Medium | Implement polling fallback. Client polls status every 30s for pending transactions. |

---

## 10. Open Questions for Changelly

1. **RSA key format**: Is the private key PKCS#8 PEM format? (Standard assumption)
2. **Webhook setup**: Is the callback URL configured per-API-key, or per-request?
3. **Off-ramp support**: Is off-ramp available through the same `/v1/orders` endpoint with reversed currency pair, or is there a separate endpoint?
4. **Sandbox availability**: How to get sandbox API keys? (Docs say "write your manager")
5. **Rate limits**: What are the production rate limits? (Current proxy limits to 30/min per IP)
6. **Transak provider**: The SDK enum only lists moonpay/banxa/wert, but the status docs mention transak. Is Transak available through the API?

---

## 11. Dependencies

| Dependency | Type | Notes |
|------------|------|-------|
| `@capacitor/browser` | Existing | For opening provider checkout pages on native |
| Changelly API keys | External | Need production keys from Changelly (sandbox first) |
| `svelte-i18n` | Existing | For new i18n keys |
| Web Crypto API | Built-in | For RSA-SHA256 signing in CF Workers |

**No new npm dependencies required.**

---

## 12. Confidence Estimate

| Phase | Confidence | Notes |
|-------|-----------|-------|
| Phase 1 (Backend) | 90% | RSA signing in CF Workers is well-documented. Risk: Changelly API edge cases. |
| Phase 2 (Service) | 95% | Straightforward typed wrappers. |
| Phase 3 (UI) | 85% | BuySellForm rewrite is significant. Provider comparison UI is new. |
| Phase 4 (Webhooks) | 80% | Webhook setup requires Changelly coordination. Polling fallback needed. |
| Phase 5 (Polish) | 90% | Edge cases, error mapping, i18n. |
| **Overall** | **85%** | Main risk: Changelly API integration edge cases + Capacitor redirect flow. |

---

## 13. Implementation Order

```
Phase 1 (Backend) ──→ Phase 2 (Service) ──→ Phase 3 (UI Buy) ──→ Phase 4 (Webhooks + History) ──→ Phase 5 (Polish)
     │                      │                      │                      │
     │  Can test with curl  │  Can test with mocks │  Can test manually   │  Full integration
     └──────────────────────┴──────────────────────┴──────────────────────┘
```

**Estimated effort**: 5-7 days for a single developer. Phase 1 and 2 can be done in parallel (backend + types). Phase 3 is the largest single phase.

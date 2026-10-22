# Fiat on-ramp through Changelly

Users can buy bitcoin with a card or a bank transfer and have it paid to their own BitTasker wallet. Changelly's Fiat API is the rail. BitTasker does not custody the coins, does not see the card, and does not run KYC.

This is separate from the old crypto-to-crypto swap. That swap was removed from this branch with the EVM swap wallet. Its keys do not sign fiat requests.

Official references:

- Product: <https://changelly.com/business/fiat-api>
- API: <https://fiat-api.changelly.com/docs/>
- Auth: <https://fiat-api.changelly.com/docs/integration-guide/authenticate-a-request>
- Signing: <https://fiat-api.changelly.com/docs/integration-guide/send-a-request>
- Offers: <https://fiat-api.changelly.com/docs/endpoints/get-offers-on-ramp>
- Orders: <https://fiat-api.changelly.com/docs/endpoints/create-order-on-ramp>
- Sandbox: <https://fiat-api.changelly.com/docs/sandbox-api-guide>
- Webhooks: <https://fiat-api.changelly.com/docs/webhooks-guide/receive-callbacks>

## Recommended approach

Use the **Fiat API**, then send the user to the provider's hosted checkout (`redirectUrl`). Do not embed the affiliate widget, and do not build a card form.

| Tool | What it does | Fit for BitTasker |
| --- | --- | --- |
| Affiliate widget, buttons, referral links (<https://changelly.com/earn/tools>) | Hosted buy page. Affiliate revenue. Little control of the payout address. | No. We cannot lock the payout to the wallet we just read from the device. |
| Crypto Exchange API (`https://api.changelly.com/v2`) | Crypto-to-crypto only. HMAC-SHA256. | No. This is the removed swap. It cannot charge a card. |
| Fiat API (`https://fiat-api.changelly.com/v1`) | Quotes from MoonPay, Banxa, Transak, and Wert. Creates an order to a `walletAddress` and returns the provider's payment page. | Yes. |

The provider page collects the card or bank payment and any KYC. BitTasker only asks for the amount, the fiat currency, the country, and (for the United States) the state. The Worker then creates the order to the address the wallet itself reported.

## What was already in the repo

The swap proxy lived at `workers-site/handlers/changelly.js` (commit `79074d2f3`, still on `dev` history). It called `https://api.changelly.com/v2` and signed with HMAC-SHA256.

| Name | Where it lived | Algorithm |
| --- | --- | --- |
| `CHANGELLY_API_KEY` | Worker secret. `wrangler.toml` on `dev` had a `dev-placeholder` var, which is the wrong place for a real key. | Public id sent as `X-API-KEY` |
| `CHANGELLY_API_SECRET` | Same | HMAC-SHA256 of the JSON body, header `X-API-SIGN` |
| `VITE_CHANGELLY_ENABLED` | Frontend build flag | Shows the old swap UI |

After the swap moved to NestJS (`fd7612136`), the same two names were read from the NestJS `.env`. `docs/wallet-test-guide.md` on `dev` still says that. There is **no** `CHANGELLY_*` entry in `.gitlab-ci.yml` or `.gitlab/ci/`. GitLab CI never injected these keys. Sandbox deploy secrets in CI are the Cloudflare token, not Changelly.

The fiat stub that stayed on this branch (`workers-site/handlers/changelly-fiat.js`) was not usable:

- It looked for `CHANGELLY_FIAT_PRIVATE_KEY` and `CHANGELLY_FIAT_PUBLIC_KEY`.
- `wrangler.toml` comments and the dev vars used different names, `CHANGELLY_FIAT_API_KEY` and `CHANGELLY_FIAT_API_SECRET`, and the dev vars were the literal string `dev-placeholder`. A var with that name overrides a secret.
- It signed an HMAC JWT. The Fiat API requires RSA-SHA256 over `fullUrl + JSON.stringify(body)`.
- It posted to paths Changelly does not have (`/v1/onramp`).

`src/lib/services/fiat-ramp.service.ts` still targets NestJS `/api/v1/changelly/fiat`, which this sandbox does not run. The buy button does not use that file.

## Keys Jon must set

These are Worker secrets. Do not put them in git, in `wrangler.toml` `[vars]`, in `VITE_` variables, or in the frontend bundle.

```bash
wrangler secret put CHANGELLY_FIAT_API_KEY --env sandbox
wrangler secret put CHANGELLY_FIAT_API_SECRET --env sandbox
```

Repeat with `--env dev` or `--env production` only when that environment should sell bitcoin.

| Secret | Value |
| --- | --- |
| `CHANGELLY_FIAT_API_KEY` | Public API key. Sent as `X-Api-Key`. This is not an RSA PEM. |
| `CHANGELLY_FIAT_API_SECRET` | RSA private key PEM. `-----BEGIN RSA PRIVATE KEY-----` (PKCS#1, which is what Changelly's Node example uses) or `-----BEGIN PRIVATE KEY-----` (PKCS#8). Newlines may be real, or the single line may contain the two characters `\` and `n`. A base64 wrapping of the whole PEM is also accepted. |

Optional, not a secret:

| Name | Value |
| --- | --- |
| `CHANGELLY_FIAT_API_BASE` | Defaults to `https://fiat-api.changelly.com`. Sandbox uses that same host. Set this only if Changelly gives a different origin. It must be `https`. |

Not used by this build, so do not set them yet:

| Name | Why it exists |
| --- | --- |
| `CHANGELLY_FIAT_WEBHOOK_PUBLIC_KEY` | Public key the manager sends for webhook signatures. The Worker does not verify webhooks yet. |
| `CHANGELLY_API_KEY` / `CHANGELLY_API_SECRET` | Old swap HMAC pair. They will not authenticate `/v1/offers` or `/v1/orders`. |

The button is a build flag, not a secret:

```toml
VITE_CHANGELLY_FIAT_ENABLED = "true"
```

`[env.sandbox.vars]` in `wrangler.toml` sets it to `"true"`, and the sandbox deploy exports the same flag. Without Fiat API secrets the screen still opens and says card purchases are not available. It does not show the raw configuration error. `.env.example` leaves the flag false for a local build. Staging and production do not set it.

The Worker returns 503 `CONFIG_ERROR` until both secrets are set. It also returns 503 if the value is still `dev-placeholder`, so the old dev vars cannot silently call Changelly.

## Signing proxy

`workers-site/index.js` sends `/api/changelly/fiat/*` to `workers-site/handlers/changelly-fiat.js` before the static site.

```
Wallet (Buy with card)
  POST /api/changelly/fiat/status
  POST /api/changelly/fiat/countries
  POST /api/changelly/fiat/offers
  POST /api/changelly/fiat/orders
        |
        v
Cloudflare Worker
  reads CHANGELLY_FIAT_API_KEY and CHANGELLY_FIAT_API_SECRET
  RSA-SHA256 signs url + JSON body
  header X-Api-Key, header X-Api-Signature
        |
        v
https://fiat-api.changelly.com/v1/offers        (GET, signed body is {})
https://fiat-api.changelly.com/v1/validate-address
https://fiat-api.changelly.com/v1/orders
        |
        v
redirectUrl  ->  MoonPay / Banxa / Transak / Wert
        |
        v
on-chain BTC to the walletAddress we sent
```

The browser never sees the private key. Responses are `Cache-Control: no-store`. The proxy allows the BitTasker origins, including `https://rgb.bittasker.com` and local Vite on port 3000. It allows 30 requests a minute per Cloudflare client IP.

`ip` on the Changelly call is `CF-Connecting-IP`, not a value the page can choose. A body `ip` is used only when that header is absent (local tests).

Return URLs are kept only when they point at a BitTasker origin. Anything else is dropped before the order is signed.

## Flow into the user's wallet

The page reads `getAddress()` from the open wallet and shows that string. The order's `walletAddress` is that string. Changelly pays the provider payout to it. BitTasker does not receive the bitcoin and then forward it.

### Bitcoin

Changelly's bitcoin ticker is `BTC`. The payout is an on-chain mainnet transaction to a `bc1…`, `1…`, or `3…` address. It is not a Lightning invoice. Lightning in this wallet is a separate balance; the user can move on-chain coins onto Lightning afterwards, inside the wallet.

The Worker rejects every other address shape, including signet `tb1…`, with `ADDRESS_NETWORK`. It then asks Changelly `POST /v1/validate-address` with `{ "currency": "BTC", "walletAddress": "…" }` and refuses the order when `result` is not `true`. The order response must echo the same address. If it does not, the Worker returns 502 and does not hand the user a redirect.

This sandbox wallet is initialized on the `utexo` network (`rln_73c5da0a_signet` in `wallet-init.ts`). A signet address cannot receive mainnet bitcoin. The button still explains that, and the purchase action stays disabled until `getAddress()` returns a mainnet address. Quotes can still be loaded so the proxy can be tested.

### USDT and RGB

USDT in this wallet is an RGB asset on Bitcoin. Changelly does not have an RGB network, an RGB invoice, or a signet payout.

`GET /v1/currencies` returns one row per asset. Each row has `ticker`, `network`, and `providers`. Bitcoin is the `BTC` row. USDT is a different ticker per public network (the `network` field says which one: Ethereum, Tron, and the others that row lists). None of those networks is RGB, and none of them is watched by this wallet. Paying one of them would strand the dollars on a chain the user cannot see here.

The removed swap wallet was what used to bridge a foreign asset into the balance the app displayed. That path is gone. This on-ramp does not recreate it.

So the Worker rejects `currencyTo` other than `BTC` with `USDT_NOT_RGB`. The panel says the same thing. A later BTC-to-RGB-USDT swap inside the wallet would be a separate feature. Changelly cannot do that hop.

## Offers and orders

The page posts:

```json
{
  "amountFrom": "50",
  "country": "US",
  "state": "CA",
  "currencyFrom": "USD",
  "currencyTo": "BTC"
}
```

`state` is required when `country` is `US`. `currencyFrom` is the fiat ticker (`USD`, `EUR`, and the other fiat rows from `/v1/currencies`). The amount is a positive decimal with at most two digits after the point, up to 100000.

Changelly's quote is `GET /v1/offers` with those fields plus `ip`. Each successful offer has `providerCode`, `fee`, `rate`, `amountExpectedTo`, and `paymentMethodOffer[]`. A provider that cannot serve the pair comes back as an object with `errorType` (`unsupportedCountry`, `outOfLimits`, `unsupportedExchangePair`, …). The page hides those.

Choosing a row posts `/api/changelly/fiat/orders` with `providerCode`, `paymentMethod` (`card`, `sepa_bank_transfer`, `ach`, or whatever that row's `method` was), the wallet address, an `externalOrderId`, and an `externalUserId`. The user id is a random UUID kept in `sessionStorage`. It is not the Nostr key, not an email, and not a name.

The response `redirectUrl` opens in a new tab. MoonPay, Banxa, and Transak can send the user back to `/wallet?buy=success` or `/wallet?buy=failed`. Wert shows a back button to the success URL. Card numbers are typed on that provider page.

## Countries, currencies, sandbox, webhooks, KYC

**Countries.** The page loads `POST /api/changelly/fiat/countries`, which signs `GET /v1/available-countries` and returns `{ code, name }` rows, plus `providers` when Changelly sent MoonPay, Banxa, or Wert (Transak is dropped). El Salvador is selected when the menu includes it, and the currency defaults to USD. The menu keeps El Salvador and the other Latin American markets (Guatemala, Costa Rica, Mexico, Colombia, Argentina, Brazil, and the neighbours already listed) even when a live answer is short. Mexico defaults to MXN, Colombia to COP, Brazil to BRL, Chile to CLP, Peru to PEN, and the Dominican Republic to DOP. Those tickers are on Changelly's published fiat list. Guatemala, Costa Rica, and Argentina are billed in USD because GTQ, CRC, and ARS are not on that list. The United States still needs an ISO 3166-2 state.

`POST /api/changelly/fiat/status` returns `{ configured: true }` or `{ configured: false }`. It does not call Changelly and it does not include the API key or the private key. When `configured` is false, the page hides See offers and shows a short English or Spanish sentence. It does not show `Changelly Fiat API is not configured`.

**Currencies.** `GET /v1/currencies` is the list that matters. Do not hardcode a USDT ticker. Confirm `BTC` and read each USDT row's `network` before promising a chain. Fiat precision is 2.

**Sandbox.** Ask the Changelly manager for sandbox keys. They use the same paths and the same host. Sandbox `POST /v1/orders` creates a test order and redirects to `https://changelly.com/buy` instead of the provider. It does not move real money and it does not pay testnet or signet bitcoin. Offers, countries, currencies, and address checks still return live data. Production is the same code with the production key pair swapped in.

**Webhooks.** Changelly can POST status changes (`created`, `pending`, `hold`, `complete`, `failed`, `expired`, `refunded`) including `payoutAmount`, `walletAddress`, and `transactionHash`. The signature headers are `x-callback-api-key` and `x-callback-signature`: RSA-SHA256 over the JSON `{"orderId":"…"}`, verified with a public key the manager sends. This build does not expose a webhook route. There is no order database to update. The user coming back to `/wallet` is the signal. Polling `GET /v1/orders/{orderId}` can be added later with the same signer.

**KYC.** BitTasker stays KYC-free. MoonPay, Banxa, Transak, or Wert may ask the buyer for identity on their own page, especially the first purchase. Status `hold` means that check is in progress. Documents, selfies, card numbers, and bank details never hit the Worker or the app. The proxy's error text is trimmed and a PEM marker is stripped, so a bad upstream body cannot echo the private key.

## Fees and limits

BitTasker adds no spread in this build. The number the user should trust is the offer:

- `fee` — provider total fee for that payment method
- `rate` / `invertedRate` — the rate after fees
- `amountExpectedTo` — bitcoin the provider expects to send

Card and bank are different rows on the same offer. Bank methods (`sepa_bank_transfer`, `ach`, `gbp_bank_transfer`, and the others in that offer) usually cost less than `card` and take longer. The page prints the fee from the row the user is about to click.

Limits are per provider, per country, and per method. They are not a single BitTasker number. An amount outside the provider window returns `outOfLimits`, and `errorDetails` carries `cause` (`min` or `max`) and `value`. The proxy appends that pair to the error the page shows.

A partner commission, if Jon wants one, is configured in the Changelly dashboard. This code does not send a commission field.

## What is built

Behind `VITE_CHANGELLY_FIAT_ENABLED`:

- Wallet button **Buy with card**, then a panel (`src/lib/components/wallet/BuyWithCard.svelte`).
- Client `src/lib/services/fiat-onramp.ts`. It refuses to call the network when the flag is off, and it refuses a non-mainnet address before creating an order.
- Worker routes `POST /api/changelly/fiat/status`, `/countries`, `/offers`, and `/orders`.
- Tests with a mocked Changelly: `src/lib/tests/unit/services/changelly-fiat-proxy.test.ts` (real RSA sign and verify, no network), `src/lib/tests/unit/services/fiat-onramp.test.ts`, and `src/lib/tests/components/wallet/BuyWithCard.test.ts`.

Sandbox builds set the flag on, so rgb.bittasker.com shows the button. Quotes stay closed until the Worker Fiat secrets are set. Staging and production leave the flag unset.

## Open questions for Jon

1. Are the keys you already have the **Fiat API RSA pair**, or the older swap HMAC pair (`CHANGELLY_API_KEY` / `CHANGELLY_API_SECRET`)? Only the RSA pair works here. Sandbox and production are different pairs; both come from the Changelly manager.
2. Should `rgb.bittasker.com` show the button before the wallet issues mainnet `bc1` addresses? Purchases cannot land on the signet wallet this branch runs.
3. Which fiat currencies and countries should the short list grow to, once `/v1/available-countries` has been called with the real key?
4. Do you want a partner fee set in the Changelly dashboard? This build adds none.
5. Where should webhooks be delivered, and can the manager send the webhook public key? The variable name to use later is `CHANGELLY_FIAT_WEBHOOK_PUBLIC_KEY`. It is unused today.
6. For USDT, is "buy BTC, then a later in-wallet swap into RGB USDT" acceptable, or do you want a public-chain USDT payout to an address this wallet does not hold? Changelly cannot pay RGB directly.
7. Which legal entity is the Changelly partner of record for production (`bittasker.com`)?

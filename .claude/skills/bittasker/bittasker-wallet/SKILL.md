---
name: bittasker-wallet
description: 'Use when working with Bitcoin/Lightning payments, boltz.exchange swaps, bolt11 invoices, wallet transactions, or payment flows. Examples: payment UI, invoice generation, swap integration, fee display, transaction verification.'
---

# Wallet & Payment Safety — BitTasker

Real Bitcoin and Lightning payments flow through this app. Financial bugs are unacceptable.

## Payment Safety Rules

- **Invoice validation**: Always validate bolt11 invoices before displaying or paying — check amount, expiry, and network. Never present an invoice the user can't verify
- **Amount safety**: Display amounts in both BTC and fiat (USD). Always show the user exactly what they're paying before any transaction. Round fiat equivalents sensibly
- **Transaction verification**: After any on-chain or Lightning transaction, verify the result via at least 2 sources (e.g., boltz.exchange status + blockscout/mempool). Don't trust a single API response
- **Timeout handling**: Every swap and payment must have a timeout. boltz.exchange swaps have lock times — respect them. Show countdown timers for time-sensitive operations
- **Fee transparency**: Always display network fees and swap fees separately. Never hide fees in the total. Users must know what they're paying for
- **Error recovery**: Payment failures must provide actionable next steps. "Transaction failed" is not enough — explain why (insufficient funds, network congestion, timeout) and what to do

## Testing Requirements

Every wallet path (send, receive, swap, invoice generation) must have integration tests covering:

- Success
- Insufficient funds
- Network failure
- Timeout
- Invalid input

Use `src/lib/mocks/` and `tryCatch()` from `src/lib/utils/tryCatch.ts`.

## Key Safety

- Never derive or expose private keys in client-side code unnecessarily
- Signatures should happen via NIP-07 or Capacitor plugin, never via raw key material in app code
- Wallet utilities live in `src/lib/utils/wallet/`

# Wallet transaction history — V1 vs V2 and relay (plan)

This document explains how RGB transaction history is built today, why V2 contracts and gasless relay flows do not show up the same way as V1, and a concrete plan to make the wallet history accurate and understandable for payments V2.

---

## 1. Problem summary

| Observation                                                                                                   | Likely cause (see §3)                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V2 creation shows a raw key like `wallet.transaction.createpaymentcontract`, blue “contract function” styling | Display logic only treats V1 method names (`createEscrow`, `acceptTask`) as special; V2 uses `createPaymentContract` and falls into the generic contract branch. Missing i18n keys for new method names.                                           |
| V1 shows “Contract Funded” (yellow) for funding                                                               | `determineDisplayProperties` maps `createescrow` + value → `wallet.transaction.createescrow` → “Contract Funded”.                                                                                                                                  |
| After V2 lifecycle actions, balance changes but history is empty or incomplete                                | Internal payouts are only recognized when `from` is an address in `ESCROW_CONTRACT_ADDRESSES`. If the live V2 deployment is not in that list, internal transfers are dropped. Relay-submitted txs may not appear as normal “from user” txs at all. |

---

## 2. How it works today

### 2.1 End-to-end data flow

1. **`wallet.store` → `loadTransactions()`** loads raw chain data via `@bittasker/wallet-core` (`manager.rgbWallet.loadTransactions()`).
2. **`processTransactions()`** in `src/lib/utils/wallet/transactionHistory.ts`:
   - Resolves “known” contract addresses (RGB EtherSwap from API + **static** escrow list).
   - Fetches **internal transactions** from Blockscout: `GET /api/v2/addresses/{address}/internal-transactions`.
   - Merges normal + internal txs, dedupes, classifies each row, computes running `balanceAfter`, titles, icons, borders.
3. **UI** (`TransactionHistory.svelte`) renders `ProcessedTransaction` rows using `title` as a translation key (`$t(tx.title)`).

So everything the user sees is derived from **explorer-indexed normal + internal txs** plus **local classification rules**. There is no separate “payments ledger” yet.

### 2.2 Escrow contract detection (critical for V2)

- **Normal txs:** `detectTransactionType` checks `to` against `escrowAddresses` from `getContractAddresses()`.
- **`getContractAddresses()`** builds `escrowAddresses` from `ESCROW_CONTRACT_ADDRESSES` in `src/lib/utils/constants/transactions.constants.ts` (per-network arrays). **New deployments (e.g. v2 SecurePaymentsContract) must be added there** so transaction history recognizes the contract for parsing, display, and internal-tx filtering.

### 2.3 Method names and UI labels

`extractMethodName` prefers Blockscout `decoded_input.method_call`, then `parseFunction(raw_input, 'escrow')` when `isEscrowContract` is true.

`determineDisplayProperties` (contract branch):

- **Special cases (value-bearing):** only `createescrow` → funded styling; `accepttask` → funds released styling.
- **Everything else:** `displayType: 'contract-function'`, `borderColor: 'info'`, title `wallet.transaction.${methodName.toLowerCase()}`.

V2 creation uses **`createPaymentContract`**, not `createEscrow`, so it always hits the generic branch unless we add explicit mapping.

English copy for V1 lives under `wallet.transaction.*` in `static/locales/en/dashboard/wallet.json` (e.g. `createescrow`, `accepttask`, `funds_released`). There is no matching entry for `createpaymentcontract`, so the UI can show the **raw key string**.

### 2.4 “Funds released” and internal transactions

For **internal** txs (`tx._isInternal`), `detectTransactionType` sets `isInternalEscrowPayout: true` when:

- `from` is in `escrowAddresses`, and
- `to` is the user.

Those rows get title `wallet.transaction.funds_released` and success styling.

`convertInternalToTransaction` **drops** any internal tx unless **either** `from` **or** `to` is in `escrowAddresses`. So a payout from a V2 contract address that is **not** in the list is **never merged** into history, even if Blockscout returns it.

### 2.5 Gasless relay (meta-transactions)

Per `v2-gasless-relay-integration-plan.md`, post-creation writes are often sent by a **relayer** (`executeMetaTransaction`), not from the user’s EOA.

Implications for history:

- **Top-level txs** from `loadTransactions()` are typically **from the user’s address**. Relay-executed calls may **not** appear as outgoing txs from the user at all.
- **Balance changes** (e.g. native BTC transfer to the user) still appear on-chain and may surface as **internal txs** to the user’s address—**if** the contract address is treated as escrow (§2.4) and Blockscout indexes the transfer.

So relay alone does not prevent indexing, but **combined** with wrong/missing escrow addresses and lack of an off-chain ledger, the UI can look empty.

---

## 3. Root cause checklist

1. **`ESCROW_CONTRACT_ADDRESSES`** is not updated when a new payment contract is deployed (constants drift vs production).
2. **Display rules** are V1-method-centric (`createEscrow` / `acceptTask`); V2 ABI uses different names (`createPaymentContract`, and other lifecycle methods).
3. **i18n** keys are incomplete for new method slugs.
4. **Relay** removes the user as the outer `from` address for many operations; reliance on **internal txs + correct contract allowlist** is mandatory unless we add another data source.
5. **No merge** with **Nostr contract status (kind 31006)** or similar, which already carries `transactionHash` tags and could backfill or label activity when the explorer list is incomplete.

---

## 4. Product scope, roles, and relay policy

We only need a **small set** of user-visible outcomes. We do **not** aim to list every on-chain step the **relayer** performs.

### 4.1 Principle

- Optimize for **balance-affecting outcomes** and **who receives funds**, not for “who paid gas” or “outer tx from relay EOA.”
- **Do not** add product rows for relay-only / meta-transaction plumbing. Users do not need to see `executeMetaTransaction` or similar as line items.

### 4.2 Scenarios we care about

| Scenario                                        | Who acts on-chain (typical)                                           | Who should see a wallet row                                                  | How it usually appears                                                                                                                                        |
| ----------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Contract creation**                        | Taskee — **direct** tx (not gasless), `createPaymentContract` + value | **Taskee**                                                                   | Normal tx: user `from` → payment contract. Map like V1 “Contract Funded.”                                                                                     |
| **2. Accept task / payout to taskee**           | Tasker triggers; **relay** executes                                   | **Taskee** receives BTC; **tasker** often has **no** incoming row (correct) | **Internal tx:** payment contract → taskee. Tasker may see **nothing** for this step if they did not receive funds — that is OK.                              |
| **3. Cancel / refund to tasker**                | Gasless                                                               | **Tasker**                                                                   | **Internal tx:** payment contract → tasker. Label e.g. refund / “Refund processed.”                                                                           |
| **4. Dispute with proposed resolution (split)** | Gasless                                                               | **Both** parties that receive BTC                                           | **Two** internal transfers (same outer `tx` hash, distinct internal indices): contract → A, contract → B. Each address’s history shows **their** inbound row. |

### 4.3 Data sources

1. **Must-have (on-chain):**

   - **Normal transactions** from the wallet SDK for **(1)** — user is `from`.
   - **Blockscout internal transactions** for the user’s address for **(2)–(4)** — `from` = payment contract, `to` = user, with positive native value.

   This requires the **deployed payment contract address** to appear in `ESCROW_CONTRACT_ADDRESSES` for that network (see [§5](#5-proposed-plan-phased) Phase A).

2. **Optional (copy only):** **Nostr kind 31006** (or app state) keyed by `transactionHash` + status to choose labels (**Funds released** vs **Refund** vs **Dispute resolved**) when internal txs **do not** expose calldata/method name. Not required for “something appears,” only for **distinct wording**.

3. **Out of scope for v1 of this work:** In-between relay transactions, failed simulations, or any tx that does not move BTC to/from the user in a way Blockscout exposes on that address.

### 4.4 Labeling when internal txs lack a method name

Internal transfers often have **no** decoded function. Options:

- **A)** One generic inbound label for all “payment contract → user” internals (e.g. reuse **Funds released** or **Payment received**), or
- **B)** Join **tx hash** to **31006** (or backend) to pick **accept vs refund vs dispute** strings.

Start with **A** for speed; add **B** when product needs clearer distinction without guessing.

---

## 5. Proposed plan (phased)

### Phase A — Addresses, creation mapping, inbound internals (first ship)

This matches §4 and is the **starting point** for implementation.

1. **Keep `ESCROW_CONTRACT_ADDRESSES` up to date** in `transactions.constants.ts` (legacy + current v2 deployments per network). `getContractAddresses()` uses this list only (no env merge in transaction history).
2. **Map `createPaymentContract` + value** in `determineDisplayProperties` to the same UX as V1 funded creation (warning border + “Contract Funded” via `wallet.transaction.createescrow`).
3. **Confirm internal tx path:** payouts **(2)–(4)** use existing `isInternalEscrowPayout` once the contract address is in `ESCROW_CONTRACT_ADDRESSES`; add/adjust **i18n** only if we introduce refund-specific keys later.

**Acceptance:** Taskee sees a correct “Contract Funded” row for V2 creation; recipients see inbound rows for internal transfers from a constants-listed contract after accept / refund / dispute resolution.

### Phase B — Tests

- Unit tests in `transactionHistory.test.ts`: `createPaymentContract` display; internal tx from an address in `ESCROW_CONTRACT_ADDRESSES` → `funds_released` path.

### Phase C — Nostr-assisted labels (optional)

- If internal rows are too generic, merge **31006** `transactionHash` + status to refine titles for refund vs accept vs dispute (§4.3–4.4).
- **Synthetic rows** only if Blockscout misses an internal transfer but we have a confirmed hash + amount elsewhere (edge case).

### Phase D — Polish (optional)

- Filters, explorer link text (outer tx), short FAQ.

### 5.1 How we start (concrete order)

1. **Constants:** Add or update deployment addresses in `ESCROW_CONTRACT_ADDRESSES` when a new payment contract ships.
2. **Code:** In `determineDisplayProperties`, treat **`createpaymentcontract`** like **`createescrow`** (value-bearing send → Contract Funded styling and title `wallet.transaction.createescrow`).
3. **Manual check:** On testnet, create a V2 contract as taskee → confirm row + styling; run accept/refund as applicable → confirm **recipient** sees internal inbound row.
4. **Tests:** `createPaymentContract` display + internal payout from a constants-listed address.
5. **Defer:** Nostr label refinement (Phase C) until the above is stable.

---

## 6. Files likely to change (implementation)

| Area                                | Files                                                                                                      |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Address resolution + classification | `src/lib/utils/wallet/transactionHistory.ts`, possibly `src/lib/utils/constants/transactions.constants.ts` |
| Translations                        | `static/locales/en/dashboard/wallet.json`, `static/locales/es/dashboard/wallet.json`                       |
| Tests                               | `src/lib/tests/unit/utils/wallet/transactionHistory.test.ts`                                               |
| Optional Nostr merge                | New small module under `$lib/utils/wallet/` + call site in `wallet.store` `loadTransactions` merge path    |

---

## 7. Open questions (resolve during implementation)

1. How to track **multiple** historical payment contract deployments in `ESCROW_CONTRACT_ADDRESSES` when upgrades roll out (keep old + new entries).
2. Blockscout spot-check: do **internal** BTC transfers always appear for recipients after relay `executeMetaTransaction` on testnet/mainnet (real tx hashes).
3. **Phase C only:** mapping from **31006** status (or equivalent) to wallet title for refund vs accept vs dispute when we add Nostr-assisted labels.

---

## 8. References

- `src/lib/utils/wallet/transactionHistory.ts` — processing pipeline.
- `src/lib/utils/constants/transactions.constants.ts` — `ESCROW_CONTRACT_ADDRESSES`.
- `src/lib/stores/wallet.store.ts` — `loadTransactions` + `processTransactions`.
- `docs/payments-v2/v2-gasless-relay-integration-plan.md` — relay behavior.
- `src/lib/nostr/events/contractStatus.ts` — kind 31006, `transactionHash` tag.

# Blockchain-only writes (planning)

This document describes how we intend to add **blockchain-only** helpers for the secure payment contract (implementation under `src/lib/utils/contract/v2/`): they initialise the contract handle, **estimate gas**, run a **static call** to surface reverts before the wallet prompt, **broadcast** the transaction, and return the pending `TransactionResponse` (no `tx.wait()`). Orchestration (parallel effects, receipts, UI) stays outside.

We are **not** aiming to wrap every function in `abi.json` — only the curated list below. Other ABI entries (views, admin, meta-tx, etc.) remain on separate paths.

---

## 1. Reference implementation: `createPaymentContract`

Today in `creation.ts`, `createPaymentContract` does:

1. `initContract(getContractAddress(), 'rsk', abi)`
2. `provider.getFeeData()` → `gasPrice` (fallback `0n` if missing)
3. Build **call args** and **overrides** (`value` for payable, `gasPrice` for estimate/static/send consistency)
4. `fn.estimateGas(...args, overrides)` → derive `estimatedCostFormatted` (`gasEstimate * gasPrice`)
5. `fn.staticCall(...args, overrides)` — fail fast on revert
6. `fn(...args, overrides)` — broadcast
7. Return `{ tx, estimatedCostFormatted }`

**Improvement when generalising:** the repeated “same args + same overrides three times” should live in one place. Any new write should call a shared primitive so we do not copy-paste steps 2–6.

---

## 2. Shared pipeline (DRY strategy)

### 2.1 Core idea

Introduce a single internal (or package-local) helper, conceptually:

```ts
// Pseudocode — not implemented yet
executeWrite({
  method: 'completeTask',           // or a typed key
  args: [paymentId],
  overrides?: { value?: bigint }    // merge with fee overrides inside
}) => Promise<{ tx; estimatedCostFormatted }>
```

Responsibilities of the helper:

| Step     | Responsibility                                                                              |
| -------- | ------------------------------------------------------------------------------------------- |
| Init     | `initContract` + resolve deployed address (same as today)                                   |
| Fees     | `getFeeData()`, build base overrides (`gasPrice` or later EIP-1559 fields if we adopt them) |
| Merge    | `finalOverrides = { ...feeOverrides, ...userOverrides }` (e.g. `value` for payable)         |
| Estimate | `contract[method].estimateGas(...args, finalOverrides)`                                     |
| Static   | `contract[method].staticCall(...args, finalOverrides)`                                      |
| Send     | `contract[method](...args, finalOverrides)`                                                 |
| Return   | `{ tx, estimatedCostFormatted }`                                                            |

Logging: one consistent prefix per method (e.g. `contract.write.completeTask`) so debugging stays uniform.

### 2.2 Typed surface vs stringly-typed

To avoid repetition **and** keep type-safety:

- **Preferred:** thin public functions (`completeTask(paymentId)`, …) that call the helper with a **fixed method name and args tuple** typed from ethers `ContractMethod` / inferred from ABI, OR a small map of `{ method, buildArgs(ctx) }` where `ctx` is the domain struct.
- **Avoid:** a single public `write(method: string, args: unknown[])` without narrowing — harder to validate at compile time.

### 2.3 Estimate without broadcast

**`estimateWrite`** (implemented) uses the same `prepareWrite` merge as **`executeWrite`**, runs **`estimateGas` only** (no `staticCall`, no broadcast), and returns **`GasEstimateResult`**. `estimateGasForCreatePaymentContract` in `creation.ts` delegates to it for `createPaymentContract`.

A future **`dryRun`** variant (e.g. `staticCall` after estimate, still no send) can be added if callers need revert checks without broadcasting.

### 2.4 Payable vs non-payable

From `abi.json` for the curated list:

- **`createPaymentContract`** — `payable`; overrides **must** include `value: totalValueWei`.
- **All other listed methods** — `nonpayable`; overrides are fee-only (no `value` unless the contract changes).

The helper should accept optional `value` in overrides and pass it identically to estimate, staticCall, and send.

### 2.5 Limits of staticCall

`staticCall` validates against **current** chain state. Between staticCall and mining, state can change (another tx finalises first). Callers should still handle revert on receipt / wallet errors. We keep staticCall for **early UX feedback**, not a proof the tx will always succeed.

---

## 3. Curated methods (from ABI)

| Method                  | Inputs (ABI)                                                       | Payable | Notes                                         |
| ----------------------- | ------------------------------------------------------------------ | ------- | --------------------------------------------- |
| `createPaymentContract` | taskee, est. start/end, fee tiers, cancellationFee, upfrontDeposit | Yes     | Existing; refactor to use shared helper.      |
| `completeTask`          | `paymentId`                                                        | No      | Taskee path.                                  |
| `acceptTask`            | `paymentId`                                                        | No      | Taskee accepts.                               |
| `resolveAfterTimelock`  | `paymentId`                                                        | No      | Time-based.                                   |
| `disputeTask`           | `paymentId`                                                        | No      |                                               |
| `proposeResolution`     | `paymentId`, `taskeeAmount`                                        | No      | Only non–`paymentId`-only mutator in the set. |
| `acceptProposal`        | `paymentId`                                                        | No      |                                               |
| `cancelPaymentContract` | `paymentId`                                                        | No      |                                               |
| `refundTasker`          | `paymentId`                                                        | No      |                                               |
| `markNoShow`            | `paymentId`                                                        | No      |                                               |
| `markWorkInProgress`    | `paymentId`                                                        | No      |                                               |
| `claimNoShowRefund`     | `paymentId`                                                        | No      |                                               |
| `claimUpfrontDeposit`   | `paymentId`                                                        | No      |                                               |

**Out of scope for this doc (examples):** `executeMetaTransaction`, `pause` / `unpause`, ownership, and all `view`/`pure` reads — different consumers and risk profile.

---

## 4. File / module layout (proposal)

When implementing:

- **`blockchainWrites.ts`** in `contract/v2/`: shared `prepareWrite` / `estimateWrite` / `executeWrite`, plus **`createPaymentContract`** and (Phase C) other curated one-liners.
- **`createPaymentContractParams.ts`:** `assertValidCreatePaymentContractParams` + `ContractCreationParamsError` (shared by `creation.ts` derivation and `createPaymentContract`).
- **`creation.ts`:** orchestration (`createContract`), domain param derivation, `estimateGasForCreatePaymentContract` (delegates to `estimateWrite`), `parsePaymentContractCreatedPaymentId`; imports `createPaymentContract` from `blockchainWrites`.

This keeps “orchestration + Nostr + parallel effects” separate from “pure Ethers write pipeline”.

---

## 5. Implementation checklist (tracking)

Use this section as the single source of truth for progress. Check boxes as each step is done.

### Phase A — Foundation

- [x] **A1.** Add `blockchainWrites.ts` in `contract/v2/` (name final as in §4).
- [x] **A2.** Define a shared result type, e.g. `WriteTxResult = { tx: TransactionResponse; estimatedCostFormatted: string }` (match existing `CreatePaymentContractTxResult` or alias/replace for consistency).
- [x] **A3.** Implement internal `executeWrite` (or equivalent): `initContract` → `getFeeData` → merge fee + caller overrides → `estimateGas` → `staticCall` → send → return result; consistent `d.log` prefix including method name.
- [x] **A4.** Confirm `gasPrice` fallback (`0n`) and payable `value` pass-through behave like current `createPaymentContract` for the non-payable case (no accidental `value`).

### Phase B — Refactor `createPaymentContract`

- [x] **B1.** Move blockchain-only logic into the new module; keep `assertValidCreatePaymentContractParams` and domain types in `creation.ts` or colocate only if it reduces churn.
- [x] **B2.** `createPaymentContract` calls the shared helper; behaviour parity: same args order, EIP-55 taskee, `totalValueWei` in overrides, return shape unchanged for callers.
- [x] **B3.** Update imports in `creation.ts` / `v2/index.ts` / any consumers so nothing breaks; run `npm run check` and `npm run lint`.

### Phase C — Curated write wrappers

Each row is a thin export that builds args and calls `executeWrite` (or calls a typed contract fragment). ABI types: `uint32` → align with existing usage (likely `number` or `bigint` — match `createPaymentContract` / escrow patterns).

- [x] **C1.** `createPaymentContract` (exported from `blockchainWrites.ts`).
- [x] **C2.** `completeTask(paymentId)`
- [x] **C3.** `acceptTask(paymentId)`
- [x] **C4.** `resolveAfterTimelock(paymentId)`
- [x] **C5.** `disputeTask(paymentId)`
- [x] **C6.** `proposeResolution(paymentId, taskeeAmount)`
- [x] **C7.** `acceptProposal(paymentId)`
- [x] **C8.** `cancelPaymentContract(paymentId)`
- [x] **C9.** `refundTasker(paymentId)`
- [x] **C10.** `markNoShow(paymentId)`
- [x] **C11.** `markWorkInProgress(paymentId)`
- [x] **C12.** `claimNoShowRefund(paymentId)`
- [x] **C13.** `claimUpfrontDeposit(paymentId)`

### Phase D — Public API surface

- [x] **D1.** Export new symbols from `contract/v2/index.ts` (and `contract/index.ts` if that is the barrel for app code).
- [x] **D2.** Document in file-level JSDoc that these functions do **not** await confirmation; callers own `tx.wait()` / receipt parsing.

### Phase E — Gas estimate preflight (optional, decide in §6)

- [x] **E1.** **Decision:** shared `estimateWrite` (returns `GasEstimateResult`); per-method wrappers like `estimateGasForCreatePaymentContract` can delegate to it. Optional `dryRun` / staticCall-only helper deferred if needed later.
- [x] **E2.** `estimateWrite` uses the same `prepareWrite` path as `executeWrite` (identical overrides for a given method/args).
- [x] **E3.** `estimateGasForCreatePaymentContract` delegates to `estimateWrite` for `createPaymentContract`.

### Phase F — Tests and verification

- [ ] **F1.** Unit tests: mock contract — assert `estimateGas`, `staticCall`, and send receive **identical** args and overrides (at least one non-payable and `createPaymentContract` payable case).
- [ ] **F2.** `npm run test:unit` green; `npm run check` and `npm run lint` clean.
- [ ] **F3.** Manual smoke on RSK (or testnet): one non-payable write and create flow still prompts wallet and submits.

---

## 6. Open decisions

- **EIP-1559 on RSK:** if we move beyond `gasPrice`, the helper should centralise `maxFeePerGas` / `maxPriorityFeePerGas` so we do not fork logic per method.
- **Error mapping:** whether to wrap revert data into domain-specific errors for UI (separate from the mechanical helper).
- **Naming:** public names mirror Solidity (`completeTask`) vs domain names (`completeTaskAsTaskee`) — prefer ABI alignment unless product language diverges.

Resolve open decisions before or during the relevant phase above; tick **§5** checkboxes as work lands.

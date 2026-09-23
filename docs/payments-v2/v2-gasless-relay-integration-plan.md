# V2 secure-payment writes — gasless relay (primary) + direct fallback (plan)

This document describes how to integrate BitTasker’s **meta-transaction relay** ([FRONTEND-INTEGRATION.md](./FRONTEND-INTEGRATION.md)) with the **existing v2 write path** (`src/lib/utils/contract/v2/blockchainWrites.ts` and `src/lib/utils/contract/lifecycle/v2.ts`) so that:

- **Default path** for post-creation lifecycle actions is **gasless** (user signs; relay pays gas).
- **Fallback path** is the **current direct `executeWrite`** flow when the relay is **unavailable or transport fails**, not when the **transaction would revert on-chain**.
- **`PaymentContractRune` and lifecycle orchestrators** change as little as possible: they keep receiving a **`WriteTxResult`-compatible outcome** and a **`transactionHash`** for Nostr 31006 + push.

**Out of scope for this plan:** implementing the code; changing v1; gasless **contract creation** (`createPaymentContract` remains a direct, payable call unless product specifies otherwise).

---

## 1. Current flow (today)

### 1.1 `blockchainWrites.ts`

- **`prepareWrite`** loads the contract via `initContract` (wallet-bound), merges fee data, resolves `contract.getFunction(method)`.
- **`executeWrite`** (used by all curated lifecycle exports such as `completeTask`, `acceptTask`, …):
  1. `estimateGas(...)`
  2. `staticCall(...)` (simulation)
  3. `fn(...)` — broadcast signed tx from the user’s wallet (user pays gas)
- Returns **`WriteTxResult`**: `{ tx: ContractTransactionResponse, estimatedCostFormatted }`.
- **`estimateWrite`** exposes gas estimation **without** static call or broadcast (used for UI preflight elsewhere).

### 1.2 `lifecycle/v2.ts`

- Each orchestrator (e.g. `markTaskCompleteV2`) follows: **`runV2Preflight`** → **`blockchainWrites.<method>(...)`** → read **`tx.hash`** as **`transactionHash`** → **`broadcastThenParallelV2Effects`** (31006 + optional extras + push).
- Errors from the write are caught generically; **`ContractLifecycleResult`** does not distinguish gas vs business logic today.

### 1.3 Alignment with `v2-contract-ui-lifecycle-plan.md`

- Phase F was reserved for **gasless primary + direct fallback**; lifecycle TODOs pointed at a **shared helper** wrapping writes without spreading version checks in the rune.

---

## 2. Relay behavior (from FRONTEND-INTEGRATION)

| Step     | Responsibility                                                                                  |
| -------- | ----------------------------------------------------------------------------------------------- |
| Client   | `GET /info` → `securePaymentAddress`, `chainId`                                                 |
| Client   | `encodeFunctionData(method, args)` — **same calldata** as direct call                           |
| Client   | Build inner hash, **`signMessage`** (EIP-191)                                                   |
| Client   | `POST /relay` with `{ sender, data, signature }`                                                |
| Relay    | Validates, **simulates** (`eth_call` / equivalent), then submits **`executeMetaTransaction`**   |
| Response | **202** + `txHash`; or **400** `SIMULATION_FAILED` + revert reason; **502** `SUBMISSION_FAILED` |

**Important:** The relay **already** rejects calls that would revert before spending relay gas. That overlaps with **`staticCall`** in `executeWrite`.

---

## 3. Product intent

- **Taskees** (and others) may have **no BTC** until they earn on-platform; **all lifecycle writes after creation** should **prefer gasless** so participation does not depend on a funded hot wallet.
- **Taskers** may still benefit from gasless UX; policy can be “gasless for everyone on these 12 methods” for consistency.
- **Contract creation** funds the escrow and is **not** in the relay’s meta-callable table in the integration guide; treat it as **always direct** unless a future spec adds it.

---

## 4. Static call, zero balance, and duplicate simulation

### 4.1 Does `estimateGas` / `staticCall` fail for users with no BTC?

For standard JSON-RPC:

- **`eth_estimateGas`** and **`eth_call`** (what `staticCall` uses) **do not require** the sender account to hold ETH/BTC to pay for a future transaction. They execute against state **without** deducting gas from the user’s balance.
- **Failure** for a correct lifecycle call usually means **revert** (wrong role, wrong state, bad signature path not applicable here) — same as on-chain.

The step that **requires** balance is **broadcasting** a **direct** transaction (`fn(...)` in `executeWrite`).

So: **zero BTC does not, by itself, make `staticCall` fail** for these non-payable methods. If product observed failures, they were likely **reverts** or **RPC issues**, not “insufficient funds” during simulation.

### 4.2 Should we skip `estimateGas` + `staticCall` on the gasless path?

**Optional optimization**, not a correctness fix for balance:

- The relay **re-simulates** before submit. Doing **full `executeWrite` preflight** before `POST /relay` duplicates work and adds latency.
- **Proposed behavior:**
  - **Gasless attempt:** build `data`, sign, `POST /relay` — **no** client-side `estimateGas`/`staticCall` **for that attempt** (relay is source of truth for “would this revert?”).
  - **Direct fallback:** keep existing **`executeWrite`** unchanged (estimate + staticCall + broadcast) so direct path retains **early revert detection** and **cost display** via `estimatedCostFormatted`.

**`estimateWrite`** (UI-only gas preview) can remain for **direct** or “what-if” displays; for **gasless-first** screens, prefer messaging like “No gas in wallet required” per product copy.

---

## 5. Proposed placement: one layer next to `blockchainWrites.ts`

Keep **`executeWrite`** as the **direct** implementation. Add a **small module** (name e.g. `gaslessRelayWrites.ts` or `executeWriteWithRelay.ts`) that:

1. Accepts the **same logical inputs** as **`ExecuteWriteOptions`** (method + args + chain + contractAddress overrides) **plus** a **`Signer`** (or uses `getWallet` internally — match existing `initContract` pattern).
2. **Optionally** `GET ${baseUrl}/health` (cache TTL short) — can skip if we prefer “try relay first”.
3. **Gasless path:**
   - `GET /info` (cache per env/session: address + chainId).
   - Encode `data` with the **same ABI** as `executeWrite` (`encodeFunctionData`).
   - Build hash + `signMessage` per [FRONTEND-INTEGRATION.md](./FRONTEND-INTEGRATION.md).
   - `POST /relay`; on **202**, map to **`WriteTxResult`** (see §6).
4. **Fallback path:** call **`executeWrite`** with the **same** `method` / `args` / overrides.

**Curated exports** (`completeTask`, `acceptTask`, …) can switch from `return executeWrite(...)` to `return executeWriteWithRelayFallback(...)` **or** the wrapper is only used inside a **single** internal `relayAwareExecuteWrite` used by those exports — either way **lifecycle keeps importing the same function names** from `blockchainWrites.ts` (or a barrel that re-exports).

**`createPaymentContract`** should **not** use this wrapper; it continues to call **`executeWrite`** only.

---

## 6. Unified `WriteTxResult` (gasless or direct)

Today:

```ts
interface WriteTxResult {
	tx: ContractTransactionResponse;
	estimatedCostFormatted: string;
}
```

Lifecycle only uses **`tx.hash`** (as `transactionHash`). **`estimatedCostFormatted`** is useful for toasts/analytics on direct sends.

**Proposed:**

- **Option A (minimal surface change):** Keep **`WriteTxResult`** but document that **`tx`** may be a **minimal object** `{ hash: string }` satisfying the **hash** access pattern, **or** a real `ContractTransactionResponse`. For relay, **`estimatedCostFormatted`** can be **`"0"`** or **`"0 (gasless)"`** (i18n should not parse this string for logic).
- **Option B (clearer types):** Extend to a discriminated union:

  ```ts
  type WriteTxResult =
  	| { mode: 'direct'; tx: ContractTransactionResponse; estimatedCostFormatted: string }
  	| {
  			mode: 'relay';
  			tx: Pick<ContractTransactionResponse, 'hash'>;
  			estimatedCostFormatted: string;
  	  };
  ```

  Lifecycle then uses **`result.tx.hash`** unchanged.

**Recommendation:** **Option B** if you are willing to touch **lifecycle** once for typing; **Option A** if you want **zero** lifecycle edits beyond already-safe `tx.hash` usage (TypeScript may need a narrow cast for minimal `tx`).

**Rune / `waitForTransaction`:** Today the rune waits on **`transactionHash`** from 31006 using the **provider** — same hash works for **both** relay-submitted and user-submitted txs. No change to wait semantics.

---

## 7. Error taxonomy: when to fallback vs surface failure

| Condition                                            | HTTP / code                                 | Meaning                                          | Fallback to direct?                                                                                                          |
| ---------------------------------------------------- | ------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Relay down / timeout / DNS                           | fetch error                                 | Transport                                        | **Yes**, if user can pay gas; if user has **no BTC**, show **clear error** + retry relay (product decision).                |
| **502** `SUBMISSION_FAILED`                          | RPC failure after simulation                | Relay could not submit                           | **Yes** (same caveat for zero BTC).                                                                                         |
| **400** `SIMULATION_FAILED`                          | `message` e.g. `OnlyTaskee`, `InvalidState` | Would revert on-chain                            | **No** — same failure would occur after direct `staticCall` / broadcast. Show **`message`** (mapped to i18n where possible). |
| **400** validation (bad sender, calldata, signature) | Bug or wrong `/info`                        | **No** fallback until inputs fixed — log loudly. |
| **202** success                                      | `txHash`                                    | Submitted                                        | **No** fallback.                                                                                                             |

**Retries:** Per FRONTEND-INTEGRATION, **retry 5xx/timeout** for relay **before** fallback. **Do not** retry **400 SIMULATION_FAILED** with the same payload.

**Idempotency:** Double-submit risk if user retries after timeout; document **dedupe by action id** or disable button until hash known — already consistent with existing “awaiting tx” gating.

---

## 8. Contract rune / lifecycle impact (minimize churn)

| Layer                     | Change                                                                                                                                                                         |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **`PaymentContractRune`** | **None** if lifecycle still returns **`ContractLifecycleResult`** with **`transactionHash`**.                                                                                  |
| **`lifecycle/v2.ts`**     | **No change** to orchestration order if **`completeTask`**, etc., still return **`WriteTxResult`** and **`tx.hash`** works. Optional: read **`mode`** for analytics or toasts. |
| **`v2WriteHelpers`**      | **None** required.                                                                                                                                                             |
| **`blockchainWrites.ts`** | Add wrapper + optionally split **`executeWrite`** into **`executeWriteDirect`** (internal) + **`executeWriteWithRelayFallback`** (public) for curated methods only.            |

Replace Phase F TODOs in **`v2-contract-ui-lifecycle-plan.md`** with a pointer to this doc when implemented.

---

## 9. Environment and configuration

- **Base URL:** mirror FRONTEND-INTEGRATION table (testnet vs mainnet vs local), e.g. `import.meta.env.VITE_TX_RELAY_BASE_URL` with sensible defaults per build.
- **Chain:** Always use **`chainId`** from **`GET /info`** when signing (not hardcoded), so testnet/mainnet matches deployment.

---

## 10. Observability

- Log **`mode: 'relay' | 'direct'`** and **failure stage** (`relay_network`, `relay_simulation`, `relay_submission`, `direct_executeWrite`).
- Optional: lightweight metric for **fallback rate** to detect relay outages.

---

## 11. Security notes (client)

- Private keys never go to the relay; only **`sender`**, **`data`**, **`signature`**.
- **`securePaymentAddress`** from **`/info`** must match the contract the UI already uses for reads — if mismatch, **abort** and do not sign (mitigates misconfigured env).

---

## 12. Summary

- Implement **relay-first + `executeWrite` fallback** in a **thin layer** beside **`blockchainWrites.ts`**, reusing **identical calldata** and **`WriteTxResult`** shape (**`tx.hash`** + cost string).
- **SIMULATION_FAILED** → user-facing error, **no** fallback; **transport / 502** → fallback when **direct** is viable.
- **Zero BTC** does not block **`staticCall`**; relay simulation is sufficient on the gasless path; **skipping client staticCall** on gasless is an **optimization** aligned with relay behavior.
- **Creation** stays **direct**; **lifecycle** stays **orchestrated** the same way, with **minimal** rune changes.

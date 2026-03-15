# V2 Escrow — Implementation Tracker

This document tracks the implementation of the V2 escrow layer (mirror of `src/lib/utils/escrow/v1/`) and the UI wrappers. Cross off items as they are completed.

**Source docs:**

- **Contract:** [V2-CONTRACT-FRONTEND-SPEC.md](./V2-CONTRACT-FRONTEND-SPEC.md) — identity, getters, lifecycle, events, Nostr, permissions, errors.
- **Relay:** [FRONTEND-INTEGRATION.md](./FRONTEND-INTEGRATION.md) — relay API, meta-tx build/sign/submit, error handling.

**Rules:** Gasless (relay) first, direct tx fallback; **no pending Nostr** — publish CONTRACT_STATUS only after we have a tx hash (relay 202 or direct receipt).

---

## Progress log

Summary of changes that got Milestone A to a shippable state (create v2 contract → see correct badge and success screen).

- **Contract creation & list**
  - **Deduplication:** Merged v1/v2 contract lists are deduplicated by `contractEvent.id` (not escrowId) so v1 and v2 contracts with the same numeric id (e.g. 123) never collide. Dashboard list key uses `contract.contractEvent.id`.
  - **V1 getContracts:** Only processes CONTRACT events with no `#v` tag or `#v=v1`. Events with `#v=v2` (and any future version) are skipped so only v2 loaders handle v2 contracts; v1 no longer builds stub entries for v2 escrowIds.
- **Task identity**
  - **taskId = task d-tag:** V2 CONTRACT event uses task’s d-tag (from `getTaskStableId(task)`) as the `#t` tag and in content; debug logs in escrowBid and nostrContract confirm this.
- **Creation flow**
  - **Address checksum:** Taskee address from bid is normalized with `ethers.getAddress(params.taskee.toLowerCase())` before `createPaymentContract` to avoid “bad address checksum” errors.
  - **Success screen:** After publishing the v2 CONTRACT event, v2 `contractCreationStore` is set with `escrowId` and `contractEventId` so the “Bid Accepted & Contract Funded” screen shows the green check and “Contract created” instead of staying on “Creating contract…”
- **Badges**
  - **ContractBadges** is a version wrapper (like ContractActionsByVersion): delegates to `ContractBadgesV1` or `ContractBadgesV2` from `escrow.getVersionFromContract(contract)`.
  - **ContractBadgesV2** uses `contract.escrowData?.status` (v2 blockchain state 0–11) and `contractStatusFormatterV2` for label/color; v2-specific status keys added (work_in_progress, refunded, funds_claimed, no_show, in_dispute_wip).
- **Lint**
  - Intentional unused params/vars in v2 stubs and ContractActionsV2 (reserved for future use) are documented and exempted with `eslint-disable` / `eslint-disable-next-line` so hooks pass.

---

## Debug logging

Use **`createDebug`** from `src/lib/utils/debug.ts` in all V2 modules so we can follow flow in the console. Enable with `localStorage.debug = 'btasker:escrow:v2'` (or `btasker:*` for all).

**Pattern:**

```ts
import { createDebug } from '$lib/utils/debug';

const d = createDebug('escrow:v2'); // or escrow:v2:config, escrow:v2:bid, etc.

// Then use:
d.log('message', { optional, data });
d.warn('warning message', { context });
d.error('error context', error);
```

**Guidelines:**

- Log at entry/exit of public functions (e.g. `loadEscrowDetails start`, `loadEscrowDetails success` with paymentId/state).
- Log decisions (cache hit/miss, relay vs direct path, exists/not exists).
- Log external calls (relay POST, getPaymentContractState result) with minimal payload (e.g. txHash slice, paymentId).
- Use `d.error` for caught errors before rethrow or return error result.
- Use `d.warn` for fallbacks (e.g. getPaymentContract reverted, using state-only data).

### Checklist: Debug logging

- [x] Add debug section to this doc and checklist.
- [x] `config.ts`: `createDebug('escrow:v2:config')`; log in getRelayBaseUrl (empty vs resolved), getV2ContractAddressByChainId (chainId, result).
- [x] `escrow.ts`: `createDebug('escrow:v2')`; log in resolveContractAddress, ensureEscrowReady (address, cache, balance), loadEscrowDetails (start, state/exists, full vs fallback), checkEscrowFundingStatus, submitGaslessMetaTx (start, ok/error), fetchRelayInfo, resetCachedContract.
- [x] `escrowBid.ts`: log calculateBidEscrowDetails, acceptBidAndCreateEscrow (start, tx, paymentId, Nostr).
- [x] `escrowEvents.ts`: stubs only; log publishEscrowStatus / CONTRACT_STATUS when implemented.
- [x] `nostrContract.ts`: log publishContractEvent; getContracts (stub returns []), handleStatusEvent/handleContractEvent stubs.

---

## Testing milestones (when can I test on the frontend?)

We want two early checkpoints before implementing the full lifecycle and heavier paths.

### Milestone A: Create a v2 contract and see it on the dashboard ✅

**What you can test:** Accept a bid (Fund contract) → creation uses V2 → new contract appears in the Contracts list and shows as version 2 (badge/tags). No lifecycle actions yet.

**Minimum implementation to reach this:**

1. **v2 escrowBid.ts** ✅
   - `calculateBidEscrowDetails` — return v2 creation params; `valueWei = totalAmountWei + 2× GAS_REIMBURSEMENT_PER_OP`.
   - `acceptBidAndCreateEscrow` — call v2 `createPaymentContract` (direct payable), then publish **CONTRACT** with `escrowId` = `paymentId.toString()`, `transactionHash`, tag `v` = `v2`.
2. **v2 nostrContract.ts** ✅
   - `getContracts(filter)` — query CONTRACT with `#v` = `v2`; hydrate with v2 `loadEscrowDetails`; build `ContractWithEvents` with permissions.
   - `publishContractEvent` — publish CONTRACT with v2 content and tag `v` = `v2`.
   - `handleContractEvent` — decrypt v2 CONTRACT, load escrow, build contract, add to store.
3. **Escrow index (src/lib/utils/escrow/index.ts)** ✅
   - v2 registered in `VERSION_HANDLERS`.
   - **getContracts:** calls v1 and v2 `getContracts`, merges, sorts by `created_at` desc, applies `limit`.
   - `LATEST_ESCROW_VERSION = 'v2'` so new creations use v2.
4. **UI** — Wrappers use `escrow.getVersionFromContract(contract)`; tag `v` = `v2` for badges/actions/timeline.

**Checkpoint:** Accept a bid on testnet → contract created on V2 → appears in dashboard Contracts list → card/drawer shows it (version from tags).

---

### Milestone B: Happy path — Complete (taskee) → Accept (tasker) → funds released

**What you can test:** On a v2 contract in state Funded: taskee clicks **Complete** (gasless or direct) → state becomes Completed; tasker clicks **Accept** → state becomes FundsReleased and funds are released. Full flow without dispute/cancel.

**Minimum implementation to reach this:**

1. **v2 escrow.ts**
   - `completeTask(paymentId)` — try relay first (`submitGaslessMetaTx(signer, relayUrl, contractAddress, chainId, 'completeTask', [paymentId])`); on 202 get txHash; on 4xx/5xx fall back to direct tx. Return `{ hash: txHash }` (or similar) so caller can publish CONTRACT_STATUS.
   - `acceptTask(paymentId)` — same pattern (relay then direct), return txHash.
2. **v2 publish CONTRACT_STATUS**
   - When we have a txHash after completeTask, publish one CONTRACT_STATUS with `action` = 4 (Completed); when we have txHash after acceptTask, publish with `action` = 7 (FundsReleased). Tag `v` = `v2`. This can live in v2 nostrContract (`publishContractStatus`) or a thin v2 escrowEvents (no pending store).
3. **ContractActionsV2 (minimal)**
   - New component (or a slim wrapper) that, for a v2 contract, shows only **Complete** (taskee, when status = Funded/NoShow/WorkInProgress) and **Accept** (tasker, when status = Completed). On click: call v2 escrow.completeTask or acceptTask → on txHash call v2 publishContractStatus → then refresh contract (e.g. `contractStore.loadContractByEscrowId(escrowId)`).
4. **ContractActionsByVersion**
   - Already branches on version; point the v2 branch to this minimal ContractActionsV2.
5. **Permissions**
   - ContractWithEvents.permissions (canComplete, canAccept) must be set for v2 contracts when we build them in v2 getContracts (derive from v2 state and role).

**Checkpoint:** Open a v2 contract (Funded) as taskee → Complete → see state move to Completed; open as tasker → Accept → see FundsReleased and (optionally) confirm in wallet/explorer.

---

### Order of work (recommended)

| Step | What                                                                          | Gets you to                                      |
| ---- | ----------------------------------------------------------------------------- | ------------------------------------------------ |
| 1    | v2 escrowBid (create + publish CONTRACT v2)                                   | Creation path ready                              |
| 2    | v2 nostrContract (getContracts v2, publishContractEvent, handleContractEvent) | V2 contracts loadable                            |
| 3    | Escrow index: register v2, getContracts merge v1+v2, LATEST = v2              | **Milestone A** — create and see v2 on dashboard |
| 4    | v2 escrow: completeTask, acceptTask (relay + direct)                          | Lifecycle ready                                  |
| 5    | v2 publish CONTRACT_STATUS (on txHash for action 4 and 7)                     | Nostr status in sync                             |
| 6    | ContractActionsV2 (minimal: Complete + Accept), permissions for v2            | **Milestone B** — happy path end-to-end          |

After Milestone B you can add dispute/cancel/timeline and the rest of the lifecycle without blocking on “are we doing it right?”

---

## Double-check against source docs

Use this to verify implementation details against the contract and relay repos.

| Topic                | Contract spec (V2-CONTRACT-FRONTEND-SPEC)                                                                                  | Relay doc (FRONTEND-INTEGRATION)                                                                                                           |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Payment id**       | §1.1: `paymentId.toString()` or `{chainId}-{contractAddress}-{paymentId}`                                                  | —                                                                                                                                          |
| **Creation**         | §1.2: `createPaymentContract` 7 params; direct only; event `PaymentContractCreated(paymentContractId)`                     | Creation not via relay                                                                                                                     |
| **Contract address** | §1.3: Same address for read/write and relay/direct                                                                         | We use env: testnet/mainnet addresses                                                                                                      |
| **Getters**          | §2.1: `getPaymentContract(paymentId)` (parties), `getPaymentContractState(paymentId)` (public); struct SecurePaymentLegacy | —                                                                                                                                          |
| **State**            | §2.2: uint8 0–11 (add InDisputeWIP=11)                                                                                     | —                                                                                                                                          |
| **Dispute**          | §2.3: No getDisputeProposal; track from events / action 112                                                                | —                                                                                                                                          |
| **Lifecycle**        | §3: Table of 13 actions, function names, params, who can call; proposeResolution(paymentId, taskeeAmount)                  | Same 12 (excl. create); param order                                                                                                        |
| **Events**           | §4: PaymentContractCreated, StateTransition(fromState, toState, timestamp), UpfrontDepositClaimed                          | —                                                                                                                                          |
| **Nostr**            | §5: Same kinds; CONTRACT/CONTRACT_STATUS content; action 0–11 or 112; tag v=v2                                             | —                                                                                                                                          |
| **Relay API**        | —                                                                                                                          | GET /health, GET /info (securePaymentAddress, chainId), POST /relay { sender, data, signature }; 202 → txHash                              |
| **Meta-tx sign**     | —                                                                                                                          | Hash: keccak256(solidityPacked(sender, contractAddress, keccak256(data), chainId)); signMessage(getBytes(hash)); chainId string from /info |
| **Errors**           | §6.2: Custom error names → user messages                                                                                   | 400 SIMULATION_FAILED (message=revert reason), 502 SUBMISSION_FAILED                                                                       |

---

## Environment and configuration

We use **environment variables** for the relay and contract addresses so the app can target testnet/mainnet without calling the relay for the contract address.

| Variable                               | Purpose                                                                                                                                                                         |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VITE_RELAY_URL`                       | Base URL of the meta-transaction relay (e.g. `https://tx-relay.testnet.bittasker.com` or `https://tx-relay.bittasker.com`). Used for `GET /health`, `GET /info`, `POST /relay`. |
| `VITE_RSK_CONTRACT_ADDRESS_V2_TESTNET` | SecurePaymentContract (V2) address on Rootstock Testnet (chainId 31). Used for read/write when the user is on testnet.                                                          |
| `VITE_RSK_CONTRACT_ADDRESS_V2_MAINNET` | SecurePaymentContract (V2) address on Rootstock Mainnet (chainId 30). Used for read/write when the user is on mainnet.                                                          |

**Note:** The relay’s `GET /info` returns `securePaymentAddress` and `chainId`. We **prefer env** for the contract address so we don’t depend on the relay for it. When building a meta-tx, we use the **same** contract address (from env by network) and for `chainId` we use the relay’s `/info` response or the wallet’s network chainId (they must match). Add these to `.env.example` and document in README if needed.

### Checklist: Config and env

- [x] Add `VITE_RELAY_URL`, `VITE_RSK_CONTRACT_ADDRESS_V2_TESTNET`, `VITE_RSK_CONTRACT_ADDRESS_V2_MAINNET` to `.env.example` (with placeholder values).
- [x] Create `src/lib/utils/escrow/v2/config.ts` (or constants): resolve contract address by chainId (31 → testnet env, 30 → mainnet env), export relay base URL from `import.meta.env.VITE_RELAY_URL`.
- [x] Ensure relay URL has no trailing slash when concatenating paths (`/info`, `/relay`) — handled in `getRelayBaseUrl()`.

---

## V2 enum and mapping

Spec §2.2: on-chain state is **uint8 0–11**. We already have 0–10 in `escrow.enum.ts`; add **11 = InDisputeWIP**.

### Checklist: Enum

- [x] Add `InDisputeWIP = 11` to `src/lib/utils/escrow/v2/escrow.enum.ts` (in blockchain states section).
- [x] Update `mapBlockchainStateToEnum` to include `11: EscrowStatus.InDisputeWIP`.
- [x] Update `isBlockchainState(status)` to treat 0–11 as blockchain states (e.g. `status >= 0 && status <= 11`).
- [x] Ensure `isFinalState` includes any new final states if needed (InDisputeWIP is not final — no change).
- [ ] Add translation keys and status formatter entries for InDisputeWIP (treat like InDispute for display) in contractStatusFormatter or v2-specific formatter — do when adding ContractBadges v2 branch.

---

## V2 escrow.ts (blockchain layer)

Mirror of v1: connect to contract, creation (direct only), load details, lifecycle functions (relay first, then direct fallback).

### Checklist: Contract connection and readiness

- [x] Use contract address from config (by chainId: 31 → testnet, 30 → mainnet).
- [x] Implement `ensureEscrowReady(contractAddress?: string, requireBalance?: boolean)` for V2 (provider, signer, contract instance with v2 ABI). Reuse wallet store pattern from v1.
- [x] Cache contract instance per address; reset cache on provider destroy if needed.

### Checklist: Creation (direct only)

- [ ] Implement `createPaymentContract(taskee, estimatedStartTime, estimatedCompletionTime, taskerFeeTier, taskeeFeeTier, cancellationFee, upfrontDeposit)` — direct payable tx only.
- [ ] Read `GAS_REIMBURSEMENT_PER_OP` from contract; require `msg.value >= 2 * GAS_REIMBURSEMENT_PER_OP`.
- [ ] On tx receipt, parse `PaymentContractCreated(paymentContractId)` from logs to get `paymentId` (uint32).
- [ ] Return `ContractTransactionResult` with `hash`, `status: 'pending' | 'confirmed'`, and `escrowId: paymentId.toString()` (or set in async handler). Do **not** publish Nostr here — that is done in escrowBid/events after receipt.

### Checklist: Reading state

- [x] Implement `loadEscrowDetails(paymentId: string, contractAddress?: string)`: if caller may not be a party, use `getPaymentContractState(paymentId)` (returns state, exists, tasker, taskee, noShowMarked). If caller is a party, use `getPaymentContract(paymentId)` for full struct.
- [x] Map `SecurePaymentLegacy` to shared `EscrowData`: tasker→client, taskee→freelancer, amount→current balance, state→mapBlockchainStateToEnum; baseAmount/clientFee/freelancerFee/totalAmount: from creation params or Nostr (getter doesn’t expose fees; store at creation).
- [x] Handle `exists === false` (invalid paymentId): return or throw appropriately.
- [x] Implement `checkEscrowFundingStatus(paymentId)` using getPaymentContractState; return wasFunded, escrowData, error.

### Checklist: Dispute proposal

- [x] V2 has no `getDisputeProposal`. Either: (a) return null from a stub `getDisputeProposal(paymentId)` for compatibility, or (b) track proposal state from CONTRACT_STATUS (action 112) and events. Document in code — stub returns null.

### Checklist: Lifecycle — relay helper

- [x] Implement `submitGaslessMetaTx(signer, relayBaseUrl, contractAddress, chainId, functionName, args)`: build calldata with `contract.interface.encodeFunctionData(functionName, args)`, build hash `keccak256(solidityPacked(sender, contractAddress, keccak256(data), chainId))`, sign with `signer.signMessage(getBytes(innerHash))`, POST `{ sender, data, signature }` to `${relayBaseUrl}/relay`. Return `{ ok: true, txHash }` on 202 or `{ ok: false, error, message }` on 4xx/5xx.
- [x] Use `VITE_RELAY_URL` as relay base URL (getRelayBaseUrl); get `chainId` from relay `GET /info` (string) or from wallet’s network (must match).
- [x] Use contract address from config (env) for both relay and direct paths.

### Checklist: Lifecycle — per-action functions

For each action, implement: try relay first (submitGaslessMetaTx); on failure (4xx/5xx), fall back to direct tx. On success (relay 202 or direct receipt), return txHash; Nostr publish is separate (escrowEvents).

- [ ] `completeTask(paymentId)` — params `[paymentId]`, taskee only.
- [ ] `acceptTask(paymentId)` — params `[paymentId]`, tasker only.
- [ ] `disputeTask(paymentId)` — params `[paymentId]`, tasker only.
- [ ] `proposeResolution(paymentId, taskeeAmount)` — params `[paymentId, taskeeAmount]` (taskeeAmount uint72), either party (alternating).
- [ ] `acceptProposal(paymentId)` — params `[paymentId]`, either (non-proposer).
- [ ] `resolveAfterTimelock(paymentId)` — params `[paymentId]`, tasker or taskee per state.
- [ ] `cancelPaymentContract(paymentId)` — params `[paymentId]`, either.
- [ ] `refundTasker(paymentId)` — params `[paymentId]`, taskee only.
- [ ] `markNoShow(paymentId)` — params `[paymentId]`, tasker only.
- [ ] `markWorkInProgress(paymentId)` — params `[paymentId]`, taskee only.
- [ ] `claimNoShowRefund(paymentId)` — params `[paymentId]`, tasker only.
- [ ] `claimUpfrontDeposit(paymentId)` — params `[paymentId]`, taskee only.

### Checklist: Error mapping

- [ ] Map contract revert reasons (custom error names from spec §6.2) to user-facing messages (reuse or extend contractErrorHandler).
- [ ] Map relay errors: SIMULATION_FAILED → show `message`; SUBMISSION_FAILED → retry/network message; 400 validation → show validation error.

---

## V2 escrowBid.ts (bid acceptance and creation)

- [ ] `calculateBidEscrowDetails(bid, task, btcPrice)`: compute v2 creation params (taskee address, estimatedStartTime, estimatedCompletionTime, taskerFeeTier, taskeeFeeTier, cancellationFee, upfrontDeposit) and total value (msg.value). Ensure total value ≥ 2 × GAS_REIMBURSEMENT_PER_OP (read from contract or config).
- [ ] `validateEscrowDetails(details)` and `validateSufficientBalance(details)` for v2 params.
- [ ] `acceptBidAndCreateEscrow`: call v2 `createPaymentContract` (direct payable); on receipt parse `PaymentContractCreated` → `paymentId`; then call Nostr publish CONTRACT (see nostrContract) with escrowId = paymentId.toString(), transactionHash, tag v=v2. No “pending” Nostr; publish only after we have tx hash and paymentId.

---

## V2 escrowEvents.ts (Nostr status publish — no pending)

Rule: **Do not** publish CONTRACT_STATUS without a tx hash.

- [ ] Remove or do not implement pending-Nostr stores (no registerPendingContractByTxHash / cleanupPendingContractByTxHash) for v2.
- [ ] Implement `publishEscrowStatus(params)` (or equivalent) that publishes **one** CONTRACT_STATUS event when we have **txHash** and the new state (0–11) or extended (e.g. 112 for “proposal submitted”). Call this from the code path that receives txHash (after relay 202 or after direct tx receipt).
- [ ] Optional: store for “contract creation in progress” (e.g. by txHash) only for creation flow UX; do not publish any Nostr until we have paymentId and txHash.

---

## V2 nostrContract.ts (Nostr CONTRACT and CONTRACT_STATUS)

- [ ] `publishContractEvent`: publish CONTRACT kind with same content shape as v1; escrowId = paymentId.toString(); transactionHash; tag `v` = `v2`; contractAddress. Other fields: taskId, taskTitle, taskDescription, clientPubkey, freelancerPubkey, amount, currency, status (mapped), estimatedStartTime, estimatedCompletionTime, type: 'contract'.
- [ ] `publishContractStatus`: publish CONTRACT_STATUS with contractEventId, escrowId, action (0–11 or 112), timestamp, type: 'contract-status', transactionHash; optional proposedClientAmount/proposedFreelancerAmount, completionAttachments. Tag `v` = `v2`. Only call when we have txHash.
- [ ] `getContracts`: load CONTRACT events; support filter by tag `v` = `v2` (and payment id / escrow id as needed). Map to ContractWithEvents; use getPaymentContractState for blockchain state when hydrating.
- [ ] `deleteContract`: if applicable for v2 (e.g. only before funding); otherwise no-op or document.
- [ ] `handleStatusEvent` / `handleContractEvent`: parse CONTRACT and CONTRACT_STATUS with v2 tags; map action 0–11 to EscrowStatus; handle 112 (DisputeResolutionProposed). Update local state / contract store as in v1.

---

## V2 index.ts and exports

- [ ] Export from `src/lib/utils/escrow/v2/index.ts`: escrow (object with createPaymentContract, loadEscrowDetails, checkEscrowFundingStatus, completeTask, acceptTask, …), escrowBid (acceptBidAndCreateEscrow, calculateBidEscrowDetails, validateEscrowDetails, validateSufficientBalance), escrowEvents (publishEscrowStatus only, no pending), nostrContract (publishContractEvent, publishContractStatus, getContracts, deleteContract, handleStatusEvent, handleContractEvent), EscrowStatus (and helpers), abi (default from abi.json).
- [ ] Ensure v2 handler is registered in global escrow manager (if used) so `getVersionFromContract` → 'v2' uses v2 module.

---

## Types and shared interfaces

- [ ] EscrowData: v2 getter returns tasker, taskee, amount (current balance), state, …; map to existing EscrowData (client/freelancer/baseAmount/…) in loadEscrowDetails; store baseAmount/totalAmount from creation params where getter doesn’t provide them.
- [ ] ContractTransactionResult: same as v1; escrowId = paymentId.toString() when available.
- [ ] DisputeProposal: v2 has no getter; use null or local state from events/112 for UI.

---

## UI: Version wrappers and v2 components

- [ ] **ContractBadges:** v2 branch uses v2 EscrowStatus and v2 status formatter (translation keys + color class for 0–11 and 112). Implement v2 formatter or extend existing with version.
- [ ] **ContractActionsByVersion:** when version === 'v2', render ContractActionsV2 (or delegate to v2 action handlers). ContractActionsV2 uses v2 escrow module and v2 permissions (state × action from spec §6.1).
- [ ] **ContractTimelineByVersion:** when version === 'v2', render ContractTimelineV2 (or same component with v2 event shape). Timeline uses statusEvents; action values 0–11 and 112; use v2 getActionDescription / labels.
- [ ] **Dashboard filters:** optional version filter (v1 / v2 / all); status filter for v2 uses states 0–11 (and 112 if shown). Reuse or extend existing filter UI.
- [ ] **Bid acceptance / creation:** when creating new contract, use v2 only (acceptBidAndCreateEscrow from v2); ensure BidAcceptanceForm or creation flow uses v2 escrowBid and v2 Nostr publish.

---

## Testing and validation

- [ ] Unit tests for v2 enum (mapBlockchainStateToEnum 0–11, isBlockchainState, isFinalState).
- [ ] Unit tests for relay helper (build calldata, hash, sign; mock fetch for /relay).
- [ ] Unit tests for loadEscrowDetails (mock getPaymentContractState / getPaymentContract; map to EscrowData).
- [ ] Integration/e2e: create payment (direct), then complete/accept via relay and via direct; verify CONTRACT and CONTRACT_STATUS on Nostr with v2 tags and no “pending” status.

---

## Progress summary

| Area                          | Status                                                                     |
| ----------------------------- | -------------------------------------------------------------------------- |
| Config and env                | ✅ Done                                                                    |
| V2 enum                       | ✅ Done (formatter/translations deferred to UI)                            |
| V2 escrow.ts                  | ✅ In progress (connection, load, relay, checkFunding, getDisputeProposal) |
| V2 escrowBid.ts               | ⬜ Not started                                                             |
| V2 escrowEvents.ts            | ⬜ Not started                                                             |
| V2 nostrContract.ts           | ⬜ Not started                                                             |
| V2 index + manager            | ⬜ Not started                                                             |
| UI wrappers and v2 components | ⬜ Not started                                                             |
| Testing                       | ⬜ Not started                                                             |

Update the table and check off items as you go. When all sections are done, the V2 layer is ready and the wrappers can call v2 for contracts with tag `v` = `v2`.

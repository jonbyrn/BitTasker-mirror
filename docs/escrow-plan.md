# BitTasker real escrow settlement: implementation plan (for Cursor)

Repo: GitLab `bittasker/BitTasker`, branch `sandbox/rgb-wasm-phase0`. Network: Signet / UTEXO.
Scope: tasks/bids **and** services, three settlement rails, cancel and refund, wallet history, and UI/UX fixes.
Every path and symbol below was read on the branch. Anything not verified is marked **(verify)** or listed under Open Questions.

---

## 0. What the code does today (verified)

### 0.1 Escrow orchestrator: `src/lib/runes/contract.svelte.ts`
- `class ContractRune` (Svelte 5 runes; static `registry` keyed by `contractId`). Both **bids** and **services** use it.
- `type ContractRuneStatus` = `draft | funding | funded | work_in_progress | work_submitted | approved | releasing | released | settled | cancelling | cancelled | disputed | failed`.
- `CONTRACT_STATUS_ORDER` and `leadingContractStatus()` pick the furthest status across relay events. Cancel, refund and dispute are **not ranked**, so they get ignored when status is merged.
- `prepareFunding(externalInvoice?)`: takes the Taskee invoice (or the E2E `readTaskeeInvoice()`), calls `assertInvoiceRail()`, builds one seal `funding-<contractId>` in `INITIATED`, then calls `attest('funding')`. The comment in the code says *"The blank invoice is the contract lock."*
- `sendPaymentOnly()` / `payFundingFromWallet()`: calls `sendToInvoice()`, then **sets `funded` with no proof** and calls `attest('funded')`.
- `sendToInvoice()` → `payBolt11()` (Lightning rail) or `payRgbInvoice()`.
- `payRgbInvoice()`: when `blankLockInvoice(invoice)` is true it logs `'[contract-rune] blank lock', { amount: 0, network: 'sb' }` and **returns without sending anything**. This is the "$0 funded" bug. (The live log said `[contract-run]`; the code prefix is `[contract-rune]`.) For priced invoices it calls `payEscrowLightning()`.
- `payBolt11()`: checks `satsChannelOpen`, `decodeLnInvoice`, `refusedBotPayee`, `escrowStageSats(lockedSats())` and `bolt11Expired`, then calls `walletManager.payLightningInvoice({ lnInvoice })`. **The preimage is not captured.**
- `submitWork()`, `approveWork()`, `createPayoutInvoice()` (`wallet.onchainReceive({witness:false,minConfirmations:1,durationSeconds:3600})`).
- `releaseEscrow(invoice?)`: comment says *"Model B: … Release attests released and does not send."* It sets `released` and logs `'[contract-rune] releaseEscrow', { attested: 'released' }`. **No payment.**
- `release(invoice)` (no send), `releaseRgbEscrow()` (polls `queue.spend` from `getBrowserRgbCommandQueue`), `cancel(invoice)` (only from `funded`; calls `sendToInvoice`), `dispute(reason)`, `applyIncomingConsignment()`, private `attest()` → `publishAttestation()`, and `runTransition()`.
- `publishAttestation()`: signs `KINDS.CONTRACT_STATUS` with content `{type:'contract-status', contractId, status, seals, workMessage, payoutInvoice, …}` and tags `m`, `r=contractId`, `s=status` and `p`. It publishes to `RELAYS = resolveTaskRelayUrls(VITE_NOSTR_TASK_RELAY_URL)`.

### 0.2 Legacy duplicate: `src/lib/services/rgb/contract-rune.ts`
This is a second `ContractRune` with its own `releaseEscrow` (also "does not send"), `sendToInvoice` and `payFundingFromWallet`. Only `src/lib/tests/unit/services/rgb/escrow-lifecycle.test.ts` uses it (imported as `ServiceRune`). **Merge it into the single orchestrator or delete it** (§3).

### 0.3 Rails and wallet plumbing
- `src/lib/services/rgb/escrow-rail.ts`: `ESCROW_LNUSDT = 'rgb:vDU5IB7L-…-JzoBylw'`, `isLightningRail` (only `btc_lightning`), `isRgbInvoice`, `isEscrowBolt11`, `invoiceMatchesRail`, `assertInvoiceRail`, `lnUsdtOpen`, `satsChannelOpen`, `LIGHTNING_MIN_LOCK_SATS=3000`, `bolt11MatchesSats`, `escrowStageSats` (contains **`FEE_RATE = 0.025`**, an existing fee hook), `bolt11Expired`, `satsRailBlocked`, `refusedBotPayee`.
- `src/lib/services/rgb/psbt-escrow.ts`: `EscrowSigner { onchainSendBegin, signPsbt, onchainSendEnd }`, `requireEscrowSigner`, `buildEscrowPsbt`, `signEscrowPsbt`, `broadcastEscrowPsbt` (returns txid via `txidFromSend`), `runEscrowSend` (phases saved to sessionStorage `bittasker.escrow-send`), and `refundEscrow` (`blindReceive` to self, then `runEscrowSend`). **This is the on-chain RGB USDT PSBT rail, and it is not connected to `ContractRune` yet.**
- `src/lib/stores/wallet/signet-lsp.ts`: `SIGNET_LSP_URL='https://lsp-signet.utexo.com'`, `FAUCET_IFA_ASSET='rgb:f~9F4X0C-TiLOTvy-pALF29V-2xJ2p0m-hP3_vpW-Alj4G5Y'`, `SIGNET_USDT_ASSET='rgb:vDU5…'`, `payEscrowLightning(invoice, assetId, amount)` → `lsp.sendAsset({ rgbInvoice, ln:{amtMsat: MIN_PAY_MSAT, …, assetId, assetAmount} })` with `paymentId()` (mappingId / sendResult.txid), `lspChannelOpen`, `requestLspInbound`, `watchLspSettlement`, `waitSignetChannel`, `discoverSignetLsp`, `lightningStore`.
  - Note: `payEscrowLightning` is the *LSP swap* path (pay sats over LN, the LSP sends RGB to an `rgb:` invoice). That is not true RGB-over-LN. LN USDT needs its own rail (§2.3).
  - ⚠ **Asset mismatch:** the user's USDT id (`rgb:f~9F4X0C…`, precision 6) is `FAUCET_IFA_ASSET` in code, but `ESCROW_LNUSDT`/`SIGNET_USDT_ASSET` is `rgb:vDU5…`. Make one source of truth (`getConfiguredRgbUsdtAssetId()` in `src/lib/types/rgb-contract.ts`) and confirm which asset the LSP channels carry.
- `src/lib/stores/wallet/decode-rgb-invoice.ts`: `decodeRgbInvoice`, `encodeRgbAmount`, `decodeRgbAmount`, **`blankLockInvoice`** (amount 0, no contract, `sb`, `rpcs://` proxy), `blindReceiveRows`, `pendingBlindReceives`.
- `src/lib/stores/wallet/wallet-balances.ts`: `receiveBlankInvoice`, `acceptIncomingPayment`, `IncomingPaymentPending`.
- `src/lib/stores/wallet/wallet-init.ts`: `state.utexoWallet` plus the `window.__utexoWallet` probe (exposes, clears, and re-exposes it via `getUtexoWallet`). `src/lib/services/rgb/wasm-backend.ts` exposes it under `VITE_E2E_TEST`.
- Other wallet files: `wallet-manager.ts` (`walletManager.initialize`, `payLightningInvoice`, `releaseRgbLock`), `wallet-state.ts`, `wallet-send.ts`, `prepare-rgb-send.ts`, `wallet-transactions.ts`, `signet-broadcast.ts`, `rgb-allocations.ts`, and `src/lib/services/rgb/command-queue.ts` (`getBrowserRgbCommandQueue`: `commit`/`witness`/`spend`/`validateConsignment`).
- Not found under the names given: `rlnBinding` and `createEscrowInvoice` return no matches (the code search indexes `dev`; the names may also differ). The invoice creation function is `receiveBlankInvoice` (wallet-balances) together with `publishFundingInvoice` (`src/lib/utils/nostr-bid`). **(verify on branch)**

### 0.4 UI entry points
- **Bids, Taskee side:** `src/lib/components/bidding/EscrowInvoiceActions.svelte`. `createInvoice()` calls `receiveBlankInvoice()` then `publishFundingInvoice(bidId, taskId, taskerPubkey, invoice)` and caches the result in sessionStorage `rgb-escrow-invoice:<bidId>`. `acceptPayment()` calls `acceptIncomingPayment()`. testids: `create-escrow-invoice`, `accept-incoming-payment`.
- **Bids, Tasker side:** `src/lib/components/bidding/BidAcceptanceFormV2.svelte`. Splits `BTC_ONLY_SPLIT` / `USDT_SPLIT` / `LIGHTNING_SPLIT`; rail radio (`fund_rail_usdt`, `fund_rail_lightning`); `contractInput()` (`lockedCurrency` SATS/USD); `handleAcceptAndFund()` (`contractId = contract-${task.id}-${bid.id}`, `prepareFunding()`); `loadPostedInvoice()` (`fetchFundingInvoice` polled every 5 s; button `load_taskee_invoice`, i.e. "Use Taskee invoice"); `handlePayFromWallet()` → `payFundingFromWallet()` → `notifyFunded()`; `handleCheckFunding()`, `handleStartTask()`. Bid form: `BidForm.svelte` (`resolveBidSats`).
- **Contract page (both sides):** `src/lib/components/contracts/RgbContractDetailView.svelte`. `loadContract()` (a one-shot `ndk.fetchEvents` on `getTaskRelay()`), `handleAcceptPayment`, `handleSubmitDeliverable`, `handleApprove`, `handleRelease` → `rune.releaseEscrow()`, E2E probe `__e2eReleaseEscrow`. testids: `submit-deliverable-button`, `approve-work-button`, `approve-release-funds-button`, `accept-incoming-payment`.
- **Services:** `src/lib/components/service/ServiceInstantBuyModal.svelte`. Rail is `escrowRail: 'usdt_rgb' | 'btc_lightning'` via `PaymentSplitSlider` (`src/lib/components/contracts/PaymentSplitSlider.svelte`) / `singleAssetSplit()`. `attachEscrow()` → `new ContractRune({… lockedCurrency:'SATS'})` + `prepareFunding(escrowInvoice)`; `handleConfirmEscrow()` → `payFundingFromWallet()` → `onConfirm()`. Related files: `ContractInitiationDrawer.svelte`, `ContractFundingWalletCard.svelte`, `ServiceAgreementSummary.svelte`, `contracts/actions/{Accept,Cancel,Complete}ContractButton.svelte`, `ContractActionBar.svelte`, `service/quotes/*` (proposal/quote flow).
  - **How services differ from bids:** the buyer (Tasker) funds directly from the modal. The seller's invoice comes in as the `escrowInvoice` prop, and there is no Taskee "Create escrow invoice" step in the component. Price comes from tiers or add-ons (`ServiceTierSelector`, `ServiceAddOnsSelector`), not from a bid. The engine (`ContractRune`) and its bugs are the same.
- **Wallet UI:** `src/lib/components/wallet/*` (`SendPaymentForm`, `ReceivePaymentForm`, `send/SendConfirmScreen`, `send/SendQrScanner`, `TransactionListLayout`, `TotalAmountCard`, `AmountDisplay`, `AssetSelector`, `RgbWalletDebugCard`, `wallet-formatters.ts`).
- Tests: `src/lib/tests/unit/services/rgb/escrow-lifecycle.test.ts` (it asserts `onchainSend` is **not** called on release, which must change), `tests/e2e/bot-contract-flow.spec.ts`. Prior doc: `docs/payments-v2/v1-contract-rune-integration-plan.md`.

### 0.5 Root causes of the observed bugs
| Symptom | Cause in code |
|---|---|
| Funded with $0 moved | `payRgbInvoice()` returns on `blankLockInvoice`, then `sendPaymentOnly()` attests `funded` anyway |
| Released, no funds | `releaseEscrow()` only attests ("Model B") |
| Release didn't reach the Taskee | `loadContract()` runs once on mount and reads only `getTaskRelay()`, while `publishAttestation` writes to `resolveTaskRelayUrls(...)`. There is no live subscription. The registry reuse `ContractRune.get(contractId)` can also keep stale local state. |
| Blank invoice stuck `WaitingCounterparty` | Nobody ever pays or sends a consignment to it. It is a lock token only. |
| "Accept incoming payment: not arrived" | `acceptIncomingPayment` is waiting for a transfer that never happened |

---

## 1. Principles
1. **One orchestrator** for tasks and services: `ContractRune` in `src/lib/runes/contract.svelte.ts`. Remove `src/lib/services/rgb/contract-rune.ts`.
2. **Proof before status.** `funded`, `released`, `refunded` and `cancelled` are published only together with a proof: an RGB txid (plus a consignment/transfer id), an LN payment hash and preimage, or an LSP mappingId with its settled state. Without proof the status stays at `*_pending`.
3. **The $0 blank invoice stays** as the *relay handshake / lock step* (`locked`). It never means "funded".
4. Rails are pluggable through an `EscrowRail` interface (§3). Each rail has its own lock, release and refund.
5. 2-of-2 between Tasker and Taskee only. No arbiter and no platform key.
6. Fee hook: a `feeHook(amount, side)` that returns 0 for now. `escrowStageSats`'s `FEE_RATE` moves behind it.

---

## 2. Rails

### 2.1 Rail A: on-chain RGB USDT (PSBT)
- **Phase 1 (pay-on-approval):** the Taskee calls `wallet.blindReceive({assetId: USDT, amount, …})` (the amount-bearing invoice, verified through `decodeRgbInvoice().amount`). At release, the Tasker runs `runEscrowSend(requireEscrowSigner(wallet), {assetId, amount, invoice})` → txid. Publish `released_pending{txid}`. The Taskee side detects the transfer (`refreshWallet` + `queue.witness`/transfer list) and publishes `settled`.
- **Phase 2 (locked):** a 2-of-2 Taproot output (MuSig2 key path, or `multi_a` script path as the fallback). Funding is done with a PSBT whose RGB allocation is assigned to the 2-of-2 UTXO. Cooperative release is one PSBT spending to the Taskee's invoice, signed by both. Refund is the same with the Tasker as the destination. Optional: a timelock refund leaf (Tasker alone after N blocks) to protect against an absent Taskee. Open question: does a timelock count as a "third key"? It does not; it is still 2-party.
  - **Unknown:** can rgb-lib-wasm build and sign RGB transfers *from* a multisig-controlled UTXO? It probably needs a multisig wallet descriptor (rgb-lib has a multisig/"watch-only + cosigner" feature in recent versions) **→ ask @bitwalt**.

### 2.2 Rail B: Lightning BTC
- **Phase 1:** the Taskee creates a BOLT11 for exactly `lockedSats()` (validated by `bolt11MatchesSats`). At release, the Tasker calls `walletManager.payLightningInvoice` → **capture the payment hash and preimage** (extend the return type in `wallet-manager.ts`). `released` is set only after `status==='Succeeded'`.
- **Phase 2:** an escrow-style hold invoice. The Tasker generates preimage P and gives the Taskee only the hash H. The Taskee issues a hold invoice for H, the Tasker pays it, and the HTLC stays held until it is settled or cancelled.
  - Note: in a standard hold invoice the *payee* holds the preimage, which would let the Taskee settle by itself. So invert it: the **Tasker** holds P and reveals it on approval, while the Taskee's node holds the HTLC and can only settle once it has P. Cancel or refund is the Taskee cancelling the HTLC, or the HTLC expiring (CLTV). The CLTV caps the escrow length (about 2 weeks at most in practice). Long tasks need re-locking.
  - **Unknown:** does the rgb-lightning-node in wasm (the UTEXO LDK backend `ldk_live_backend`) expose hold-invoice APIs such as `invoice(payment_hash=…)`, `claim`, or `fail`? **→ @bitwalt**

### 2.3 Rail C: Lightning USDT (RGB over LN via `lsp-signet.utexo.com`): its own rail
Separate from Rail A, with its own state, proof and buttons.
- **Phase 1:** the Taskee creates an RGB LN invoice (BOLT11 carrying `assetId=USDT`, `assetAmount`) on its LN USDT channel (`lnUsdtOpen`). The Tasker pays over its LN USDT channel. Proof: payment hash plus preimage. The current `payEscrowLightning()` (LSP swap: sats in, on-chain RGB out) is kept only as a *fallback path* called "LSP swap", and it records `mappingId`/`sendResult.txid` from `paymentId()`.
- Lock is the blank-invoice handshake plus a check that both parties have usable LN USDT channels with enough outbound or inbound capacity.
- Refund is a reverse invoice from the Tasker, paid by the Taskee (Phase 1 cooperative) or HTLC cancel (Phase 2).
- **Phase 2:** an RGB hold-HTLC, the same as 2.2 but with asset HTLCs. **Unknown:** does RLN support hold invoices for RGB assets, and will the UTEXO LSP route held RGB HTLCs? What are the timeouts and liquidity limits, and does the asset id match (`rgb:vDU5…` vs `rgb:f~9F4X0C…`)? **→ @bitwalt**

---

## 3. Architecture changes (files)
1. **New `src/lib/services/rgb/escrow-rails/`**
   - `types.ts`: `interface EscrowRail { id:'rgb_onchain_usdt'|'ln_btc'|'ln_usdt'; requestSettlementInvoice(ctx):Promise<Invoice>; validateInvoice(inv, ctx):void; pay(inv, ctx):Promise<Proof>; verifyIncoming(proof, ctx):Promise<boolean>; refund(ctx):Promise<Proof>; lock?(ctx); }`. `Proof = {kind:'txid'|'preimage'|'lsp_mapping', value, paymentHash?, consignmentId?}`.
   - `rgb-onchain.ts` (wraps `psbt-escrow.ts`), `ln-btc.ts` (wraps `payBolt11` logic moved out of the rune), `ln-usdt.ts` (new, plus the `payEscrowLightning` fallback).
   - Extend `ContractPaymentAsset` in `src/lib/types/rgb-contract.ts` with `usdt_ln` and update `CONTRACT_PAYMENT_ASSETS`, `invoiceMatchesRail` and `isLightningRail`.
2. **`ContractRune` (`src/lib/runes/contract.svelte.ts`)**
   - Rename the meaning of `prepareFunding` so it sets `locked`.
   - Remove the status write in `sendPaymentOnly()` (it no longer attests `funded`). In Phase 1 "funded" means `locked` + `agreed`.
   - New methods: `requestSettlement(amount)` (Taskee), `releaseEscrow()` → `rail.pay()` → `released_pending` → `released` once the proof is published; `confirmSettled()` (Taskee); `cancel()`; `requestRefund()`/`refund()`; `reissueSettlement(discountedAmount)` (dispute-ready).
   - Add `settlementInvoice`, `settlementAmount`, `proofs[]`, `rail`, and `kind:'task'|'service'` to the snapshot.
   - Extend `CONTRACT_STATUS_ORDER` / `leadingContractStatus` with terminal states (`cancelled`, `refunded`, `settled`) so terminal states always win.
   - A `feeHook` placeholder next to `escrowSendAmount`.
3. **Sync:** a new `src/lib/services/contracts/contract-sync.ts` with `subscribeContract(contractId, onEvent)` using an NDK subscription across **all** `resolveTaskRelayUrls(...)` relays (the same set used for publishing). `RgbContractDetailView.svelte`, `BidAcceptanceFormV2.svelte`, `EscrowInvoiceActions.svelte` and `ServiceInstantBuyModal.svelte` use it in place of a one-shot `loadContract()`. Fold events in with a reducer: validate signer ∈ `partyPubkeys` and the transition's role, take the highest rank, and require a proof for money states.
4. **Services:** make `ServiceInstantBuyModal.attachEscrow/handleConfirmEscrow` call the same `ContractRune` API with `kind:'service'`. Add the seller-side `EscrowInvoiceActions` equivalent (reuse that component with `contextKind`) so the seller creates the lock and settlement invoices. The contract page `RgbContractDetailView` serves both kinds.
5. **Command serialization:** route every wallet call (the wasm calls behind `onchainSendBegin`, LN pay, `refreshWallet`, `listAssets`) through one queue (extend `command-queue.ts` / `walletManager` RGB lock) with retry and backoff on `"RGB wallet is busy"` and the wasm `BorrowError` (`ldk_live_backend.rs:1513`, a RefCell re-entrancy panic). Never call wasm concurrently. Tear the wallet down and re-init if a BorrowError poisons it.
6. Delete `src/lib/services/rgb/contract-rune.ts` and point the unit test at the real rune.

---

## 4. State machine

States: `draft → locking → locked → (work_in_progress) → work_submitted → approved → settlement_requested → releasing → released_pending → released → settled`, plus `cancel_requested → cancelled`, `refund_requested → refunding → refunded`, `disputed` (future), and `failed` (recoverable, always with `previousStatus`).

| From | Event / actor | To | Guard / side effect |
|---|---|---|---|
| draft | Taskee/seller `lock_invoice_created` ($0 blank) | locking | `blankLockInvoice()` true |
| locking | Tasker `lock_accepted` (blank lock ack) | locked | Phase 1: no funds. Label "Agreed", not "Funded" |
| locking/locked | Phase 2 Tasker `funded{proof}` | funded | proof is verified by the Taskee (`verifyIncoming`) |
| locked/funded | Taskee `work_started` | work_in_progress | — |
| locked/funded/wip | Taskee `work_submitted` | work_submitted | message or proof URL |
| work_submitted | Tasker `approved` | approved | — |
| approved | Taskee `settlement_requested{invoice, amount, rail}` | settlement_requested | amount == agreed (or agreed-discount, §dispute); rail matches |
| settlement_requested | Tasker `release` → rail.pay | releasing → released_pending | local only until proof |
| released_pending | Tasker publishes `released{proof}` | released | txid / preimage |
| released | Taskee `settled{ack}` (or auto when `verifyIncoming` passes) | settled | terminal |
| releasing | pay error | failed (prev=settlement_requested) | retry allowed; never `released` |
| draft/locking/locked (no funds) | either party `cancel` | cancelled | Phase 1: no money moved |
| funded (Ph2) / any pre-release with funds | either party `cancel_requested`, other `cancel_accepted` | refunding → refunded{proof} | 2-of-2 cooperative refund PSBT / reverse invoice / HTLC cancel |
| work_submitted/approved/settlement_requested | party `dispute_opened` | disputed | future |
| disputed/settlement_requested | both `settlement_reissued{amount<agreed}` | settlement_requested | supersedes the previous invoice (`supersedes` id) |
| refunding | timeout (Ph2 timelock) | refunded | Tasker unilateral after N blocks |

Only the Tasker may publish `approved`/`released`. Only the Taskee may publish `work_*`/`settlement_requested`/`settled`. The reducer rejects events whose role is wrong.

---

## 5. Nostr event schemas (kind `KINDS.CONTRACT_STATUS`, keep the existing tags `m`,`r`,`s`,`p`)
Common content:
```json
{ "type":"contract-status","v":2,"contractId":"contract-<task>-<bid>|service-<id>-<order>",
  "kind":"task|service","status":"<state>","actor":"tasker|taskee","rail":"rgb_onchain_usdt|ln_btc|ln_usdt",
  "assetId":"rgb:f~9F4X0C-TiLOTvy-pALF29V-2xJ2p0m-hP3_vpW-Alj4G5Y","precision":6,
  "agreedAmount":{"value":"25000000","unit":"base|msat"},"prev":"<event id>","ts":0 }
```
Extra fields per event:
- `lock_invoice_created`: `{lockInvoice}` (the $0 rgb invoice).
- `settlement_requested`: `{invoice, amount, expiresAt, supersedes?}`.
- `released`: `{proof:{kind:"txid",value,consignmentId?}|{kind:"preimage",value,paymentHash}|{kind:"lsp_mapping",value}}`.
- `settled`: `{proofRef}`.
- `cancel_requested`/`cancel_accepted`: `{reason}`.
- `refunded`: `{proof}`.
- `settlement_reissued`: `{amount, reason, invoice, supersedes}` (dispute-ready).
- Fee hook (future): `{fees:{tasker:"0",taskee:"0",rate:0.025}}`.
Extra tags: `["rail",…]`, `["e",prev,"","reply"]`, `["proof",kind,value]`. Do not put preimages for **Phase 2** held HTLCs on relays before release. Encrypt them (NIP-44) to the counterparty.

---

## 6. Phases
**Phase 0 (hotfix, 1–2 days):**
- `sendPaymentOnly` stops attesting `funded` on a blank lock (attest `locked`).
- `releaseEscrow` no longer marks `released` without a proof.
- Live relay subscription in `RgbContractDetailView`.
- Hide `accept-incoming-payment`.
- Rename labels.
- Terminal ranks in `leadingContractStatus`.

**Phase 1 (pay-on-approval, all 3 rails, tasks and services):**
- `EscrowRail` interface plus the three adapters.
- `settlement_requested` → `release` → proof → `settled`.
- Cancel before release (no funds) and cooperative refund (reverse invoice) after a mistaken payment.
- `reissueSettlement`.
- Wallet history entries.
- UI stepper.

**Phase 2 (locked escrow):** Rail A 2-of-2 Taproot PSBT (cooperative release and refund, optional timelock refund). Rails B and C hold-HTLC. Each is gated on the answers from @bitwalt.

**Phase 3:** disputes (partial reissue, mutual split), platform fee via `feeHook`.

---

## 7. UI/UX

### 7.1 Escrow stepper (tasks and services, both roles)
New `src/lib/components/contracts/ContractProgressTracker.svelte`: steps are Agree → Lock → Work → Submit → Approve → Pay → Done (or Cancelled/Refunded). It shows both parties' avatars and states and has a "Waiting for **{name}**" / "**Your turn**" banner.

New `ContractNextAction.svelte`: **one primary button per role per state**, chosen from the reducer state:

| State | Tasker (buyer) | Taskee (seller) |
|---|---|---|
| draft | — ("Waiting for {Taskee} to connect") | **Connect escrow** (was "Create escrow invoice") |
| locking | **Confirm escrow connection** (was "Use Taskee invoice"/"Accept Taskee invoice") | waiting |
| locked/wip | waiting | **Submit work** |
| work_submitted | **Approve work** / secondary "Request changes" | waiting |
| approved | waiting | **Request payment ({amount} {rail})** |
| settlement_requested | **Pay {amount} via {rail}** → confirm screen | waiting |
| released | "Paid ✓ txid/preimage" | **Confirm received** (auto when detected) |
| any pre-release | secondary "Cancel contract" | secondary "Cancel contract" |

- **Remove "Accept incoming payment"** (`EscrowInvoiceActions.svelte`, `RgbContractDetailView.svelte`). Detection is automatic.
- Every invoice is shown as a card with its amount, rail, asset, expiry, a QR code and a copy button. It is never a raw input on its own.
- Confirm screen before any escrow payment (reuse `ConfirmModal` / `send/SendConfirmScreen.svelte`): amount, rail, recipient, network fee, "This releases payment to {name}".
- Badges "Funded" and "Released" appear only together with a proof link (a signet explorer txid, or "Lightning payment ✓" with an expandable preimage).
- Success and error toasts (`appStore.showSuccessToast/showErrorToast`) on bid, accept, lock, fund, submit, approve, request payment, release, cancel and refund.
- Wallet readiness gate component `WalletReadyGate.svelte`: Connected + synced + spendable balance ≥ amount + the rail's channel usable. The copy is plain ("Your wallet is still starting… 10 s", "Add $X USDT to continue") and replaces "Wallet not initialized" / "RGB wallet is not initialized".
- A passkey hint ("Your device will ask for your passkey to sign") before signing. No re-prompt or zero balance after navigation: keep `state.utexoWallet` alive across routes (`src/routes/(app)/+layout.svelte` `ensureWalletInitialized`) and show a skeleton, never `0`, until the first sync finishes.

### 7.2 Testing bugs to fix (outside escrow)
- **Bids:** bids must show to the poster (the bot's bid never appeared; its accept toast said ACCEPTED while the bid stayed Pending, so drive the toast from the published status). `/earning/bids` is blank. Bids menu naming (one name: "My bids" vs "Bids on my tasks").
- **Auth:** posting a task logs the user out (refresh-token 401, so fix the refresh flow and retry once).
- **Tasks:** need a canonical URL `/task/[id]` (currently Server Error).
- **Task form:**
  - Add a USD/USDT option label and labelled date inputs.
  - Add skills suggestions and clear the stale "skill required" error.
  - Hide "something moved?" when remote.
  - Prices must not start at 0.
  - Fix the "Get Quotes" label.
  - Stop the sats estimate drifting by freezing the `btcPrice` quote per form session.
- **Search:** results are not filtered.
- **404s:** notification-center, events kind 31000, and reminders/enrich. Guard or feature-flag these calls (e.g. `notificationCenterService` used in `BidAcceptanceFormV2`).
- **socket.io:** failures need backoff and silent degrade.
- **Wallet errors:** "RGB wallet is busy" and the wasm BorrowError at `ldk_live_backend.rs:1513` need queueing plus retry (§3.5).

### 7.3 Wallet transaction list with escrow entries
Extend `src/lib/stores/wallet/wallet-transactions.ts` with a contract-aware projection: join wallet transfers or payments to contract proofs (txid / payment hash, kept in a local index fed by the contract events). Each row shows "Escrow lock / Payment released / Refund / Cancelled", the task or service title, the counterparty name, the rail icon, a status chip (pending / confirmed / failed), and a link to `/contracts/{id}`. Render it in `TransactionListLayout.svelte`.

### 7.4 Wallet redesign (non-crypto users)
- **Home:** `TotalAmountCard.svelte` becomes one big balance with a USD⇄sats toggle and a skeleton while loading (never a misleading 0). Two primary buttons, **Send** and **Receive**.
- **Send** (`SendPaymentForm.svelte`):
  - Paste or scan (`send/SendQrScanner.svelte`) detects the method automatically (bolt11, rgb invoice, address).
  - Otherwise `AssetSelector.svelte` offers a simple choice with one-line copy: *Bitcoin* ("slow, for big amounts"), *Lightning BTC* ("instant, low fees"), *USDT* ("digital dollars"), *LN USDT* ("instant digital dollars").
  - Ends with the review-and-confirm screen `send/SendConfirmScreen.svelte`.
- **Receive** (`ReceivePaymentForm.svelte`): amount, then QR plus copy and share, with the method chosen automatically.
- **History:** human-readable ("Paid Ana for 'Logo design' · $25 · Lightning").
- **Advanced toggle:** hides UTXO, consignment, blinded, anchor and the 1,000-sat carrier (including `RgbWalletDebugCard.svelte` and `AddressAccordion.svelte`).
- Friendly empty and loading states. A clear readiness pill (Starting / Syncing / Ready / Offline).
- **Design system:**
  - Spacing on a 4/8 px scale; cards `rounded-2xl p-6`.
  - Type: a display size for the balance (`text-5xl font-semibold tabular-nums`) and 14–16 px body text.
  - Colors: daisyUI tokens. Primary for actions, success/warning/error for status only, one accent per rail (BTC orange, Lightning yellow, USDT green, LN USDT teal).
  - Full dark-mode parity through daisyUI themes, WCAG AA contrast, 44 px touch targets, and motion ≤ 200 ms.

---

## 8. Test plan

**Unit (vitest, rewrite `escrow-lifecycle.test.ts`):**
- The blank lock gives `locked`, never `funded`.
- `releaseEscrow` without a proof throws and stays `settlement_requested`.
- Each rail adapter: invoice validation (amount, asset, network, expiry), pay returns the proof, error maps to `failed`.
- Reducer: role checks, terminal precedence, supersede and reissue, out-of-order events, duplicate events.
- `feeHook` returns 0.

**Integration:** relay sync where the Tasker publishes and the Taskee's subscription updates within 5 s, across the multi-relay set.

**E2E (`tests/e2e/bot-contract-flow.spec.ts`, signet):** for each of {task, service} × {RGB on-chain USDT, LN BTC, LN USDT}: lock → submit → approve → request → pay. Assert that balances changed on both wallets by exactly the amount (base units, precision 6 / sats) and that the proof is shown. Also cover:
- Cancel before funds.
- Refund after a mistaken pay.
- Reissue at a discount.
- Pay failure → retry.
- Reload mid-flow (resume from `bittasker.escrow-send` sessionStorage plus relays).
- Concurrent wallet calls (no BorrowError).

**UX/regression checklist:**
- [ ] One next-action button per role/state; no "Use/Accept Taskee invoice"; "Accept incoming payment" removed
- [ ] Amount and rail shown on every invoice
- [ ] Toasts on bid, accept, lock, fund, submit, approve, release, cancel, refund
- [ ] "Funded"/"Released" only with a txid/preimage
- [ ] Both sides see the same status (release reaches the Taskee)
- [ ] Wallet readiness gate replaces "Wallet not initialized"
- [ ] No passkey re-prompt or zero balance after navigation; passkey hint shown
- [ ] Confirm screen before escrow pay
- [ ] Bot/third-party bids visible to the poster; the accept toast matches the real status
- [ ] `/earning/bids` renders; Bids menu naming fixed
- [ ] Posting a task does not log out (no refresh 401)
- [ ] `/task/[id]` works
- [ ] Task form: USD/USDT label, labelled dates, skills suggestions, no stale skill error, "something moved?" hidden for remote, no 0 prices, "Get Quotes" label, sats estimate stable
- [ ] Search filters
- [ ] No 404s (notification-center, kind 31000, reminders/enrich); socket.io degrades quietly
- [ ] "RGB wallet is busy" / BorrowError are queued and retried
- [ ] Escrow rows in wallet history with title, counterparty, rail, status, link
- [ ] Wallet: big balance + toggle, Send/Receive, auto method, QR/scan, review screen, Advanced toggle, no misleading 0, dark mode
- [ ] Services flow parity with tasks

---

## 9. Open questions (most for UTEXO @bitwalt)
1. rgb-lib-wasm: can it spend RGB allocations from a 2-of-2 Taproot (MuSig2 or `multi_a`) UTXO with PSBT cosigning? Is there a multisig wallet API in the wasm build?
2. The RLN/LDK wasm backend: are hold invoices (custom payment hash, claim/fail) available for BTC? For RGB assets?
3. Will `lsp-signet.utexo.com` route held RGB HTLCs? What are the max CLTV, liquidity limits and fees? Which asset does the LN USDT channel carry: `rgb:vDU5…` or `rgb:f~9F4X0C…`?
4. Does `walletManager.payLightningInvoice` expose the preimage and payment hash? How can the payee verify an incoming RGB LN payment?
5. What causes the `BorrowError` at `ldk_live_backend.rs:1513`, and is there a recommended serialization pattern?
6. Why does a $0 blank invoice stay `WaitingCounterparty`? Can it be expired or cancelled cleanly (`failTransfers`)?
7. Product: the cancel policy after work has started, timeouts for an absent counterparty, and the escrow length cap for LN HTLCs.
8. Where do `rlnBinding` and `createEscrowInvoice` live (not found in the indexed search)? Confirm against the branch.

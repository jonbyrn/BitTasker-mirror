# V2 Escrow Contract — Information Request for Frontend Integration

---

## Instructions for the contract-repo agent

**Task:** Answer every section below using the SecurePaymentContract (V2) codebase. Produce **one markdown file** (e.g. `V2-CONTRACT-FRONTEND-SPEC.md`) that the BitTasker frontend team can drop into this repo. The frontend will use it to implement a V2 escrow module that mirrors `src/lib/utils/escrow/v1/` (same structure: escrow.ts, escrowBid.ts, escrowEvents.ts, nostrContract.ts, escrow.enum.ts) with two rules: **gasless (relay) first, direct tx fallback**, and **no “pending” Nostr events** — we only publish CONTRACT_STATUS after we have a tx hash (from relay or direct tx). Be specific: function names, parameter order and types, event names and args, state numbers, and Nostr content/tag rules.

---

**Audience:** Agent or team working on the SecurePaymentContract (V2) repository.  
**Purpose:** Provide answers in a separate `.md` file so the BitTasker frontend can implement a V2 escrow layer that mirrors V1, with **gasless (relay) as default** and **no pending Nostr events** — we publish CONTRACT_STATUS only after we have a transaction hash (from relay or direct tx).

We already have:

- **FRONTEND-INTEGRATION.md** (from the meta-transaction relay repo): relay API, building/signing meta-tx, the 12 meta-callable functions, error handling.
- **V2 ABI** (`src/lib/utils/escrow/v2/abi.json`): full contract ABI.
- **V2 escrow enum** (`src/lib/utils/escrow/v2/escrow.enum.ts`): blockchain states 0–10, Nostr state 112, `mapBlockchainStateToEnum`, `isFinalState`, `isBlockchainState`.

We need the following information about the **V2 smart contract** (and, where relevant, Nostr conventions) so we can implement the V2 mirror of `src/lib/utils/escrow/v1/` without guessing.

---

## 1. Contract identity and creation

1.1. **Payment identifier**

- V1 uses a **string `escrowId`** (from `EscrowCreated` event). V2 uses **`uint32 paymentId`**.
- **Question:** For Nostr and our internal `ContractWithEvents` we need a **stable string identifier**. Should we use: (a) `paymentId.toString()`, (b) a composite like `{contractAddress}-{paymentId}`, or (c) something else? Please specify the recommended format and whether it must be globally unique across chains/contracts.

1.2. **Creation flow**

- **Function:** We see `createPaymentContract(...)` in the ABI (payable, returns `uint32`).
- **Questions:**
  - List the **exact parameter names and types** in order (we have ABI; a short table is enough).
  - Does the contract **emit `PaymentContractCreated`** with `paymentContractId` as the only (indexed) argument?
  - After a **gasless** creation (if supported), how does the frontend obtain `paymentId`? Same event from the relay-submitted tx, or another mechanism?

1.3. **Contract address and relay**

- For **read** calls (e.g. get payment state): do we use the **same contract address** returned by the relay’s `GET /info` (`securePaymentAddress`), or a different one (e.g. factory)?
- For **write** calls: we use relay by default and fall back to direct tx; confirm that the **same contract** and **same function signatures** are used in both paths.

---

## 2. Reading state (getters and mapping to EscrowStatus)

2.1. **Getter for a single payment**

- V1 has `getEscrow(escrowId)` returning a struct (client, freelancer, amount, state, timestamps, fee tiers, etc.).
- **Question:** What is the **exact function name and signature** for V2 to fetch one payment by `paymentId` (e.g. `getPayment(uint32 paymentId)` or `getPaymentContract(uint32)`)?
- **Question:** Please provide a **table: return struct field name → type → meaning**. We need at least: client, freelancer (or tasker/taskee), amount(s), **state (uint8 or enum)**, estimatedStartTime, estimatedCompletionTime, fee-related fields, timelock if any, and any field needed for dispute proposal.

2.2. **State enum (on-chain)**

- We have `mapBlockchainStateToEnum` in `escrow.enum.ts` mapping 0–10 to our `EscrowStatus`.
- **Question:** Is the contract’s **native state enum** (Solidity) exactly 0–10 with the same semantics as in our enum (Funded=0, InDispute=1, …, WorkInProgress=10)? If not, provide the **contract’s state list (number → name)** so we can adjust the mapping.

2.3. **Dispute proposal**

- V1 has `getDisputeProposal(escrowId)` returning proposer, freelancerAmount, timestamp, accepted.
- **Question:** Does V2 have an equivalent (e.g. `getDisputeProposal(uint32 paymentId)`)? If yes, give function name and return struct (field names and types). If the shape differs (e.g. taskeeAmount instead of freelancerAmount), describe it.

---

## 3. Lifecycle functions (action → function, parameters)

We have the list of 12 meta-callable functions from FRONTEND-INTEGRATION.md. We need **one source of truth** for the frontend:

3.1. **Table: Action → function name, parameters, and “who can call”**  
 For each action below, confirm **function name**, **parameter list in order** (including types), and **caller role** (Tasker / Taskee / Either). Any extra constraint (e.g. “only after start time”) is welcome.

- Create payment (creation only; no meta-tx)
- Complete task
- Accept task (release funds)
- Dispute task
- Propose resolution (we assume `(paymentId, taskeeAmount)`)
- Accept proposal
- Resolve after timelock
- Cancel payment contract
- Refund tasker
- Mark no-show
- Mark work in progress
- Claim no-show refund
- Claim upfront deposit

3.2. **Special cases**

- **proposeResolution:** Is the second parameter **taskeeAmount** (amount to taskee; tasker gets the rest) or something else (e.g. split in different units)?
- **createPaymentContract:** Can it be invoked **via relay** (meta-tx), or only as a direct payable tx by the tasker?

---

## 4. Events (for timeline and status sync)

4.1. **Events we care about**  
 We need to: (1) parse logs after our own tx (to get `paymentId` on creation, or to confirm state change); (2) optionally build a timeline from events.

- **Question:** List all **event names** that represent a state change or an important action (e.g. `PaymentContractCreated`, `StateTransition`, task completed, funds released, dispute, etc.).
- For each event: **name**, **indexed args**, **non-indexed args** (name + type). We already see `PaymentContractCreated(paymentContractId)` and `StateTransition(paymentContractId, fromState, toState, timestamp)` in the ABI; confirm and list any others.

4.2. **StateTransition semantics**

- **Question:** Is **every** lifecycle transition (complete, accept, dispute, cancel, etc.) emitted as a **StateTransition** with `fromState` and `toState`? If not, which actions emit which events?

---

## 5. Nostr (contract and status events)

Our frontend will **not** publish “pending” status events. We only publish a CONTRACT_STATUS event **after** we have a **transaction hash** (from relay 202 or from direct tx receipt).

5.1. **Kinds and content shape**

- **Question:** Should V2 use the **same Nostr kinds** as V1 for contract creation and status updates (e.g. CONTRACT for creation, CONTRACT_STATUS for updates)? If not, specify the kinds.
- **Question:** For CONTRACT (creation) event **content**, should we keep the same shape as V1 (escrowId, taskId, taskTitle, taskDescription, clientPubkey, freelancerPubkey, amount, currency, status, estimatedStartTime, estimatedCompletionTime, type: 'contract', transactionHash?, contractAddress?) with the only change being **identifier** (e.g. `escrowId` = our chosen string for paymentId) and **version tag `v`: `v2`**? Or are there required new/renamed fields for V2?

5.2. **CONTRACT_STATUS content**

- We publish one CONTRACT_STATUS per **confirmed** action (after we have txHash).
- **Question:** Should the **content** shape stay the same as V1 (contractEventId, escrowId, action, message?, timestamp, type: 'contract-status', transactionHash?, proposedClientAmount?, proposedFreelancerAmount?, completionAttachments?)?
- **Question:** For V2, should **action** be the **blockchain state number** (0–10) or our extended enum value (e.g. 112 for DisputeResolutionProposed)? We need a single rule so the frontend and any subscribers interpret it consistently.

5.3. **Tags**

- We use tags: version `v` = `v2`, escrow reference (e.g. `r` or `d`), task `t`, participants `p`, etc.
- **Question:** Any V2-specific tag requirements (e.g. must include `paymentId` in a tag for filtering)?

---

## 6. Permissions and state machine (for UI)

6.1. **Allowed transitions**

- **Question:** For each **current state** (0–10 and, if used, 112), list which **actions** (complete, accept, dispute, propose, accept proposal, cancel, resolve timelock, refund, no-show, work in progress, claim no-show, claim upfront) are **allowed**. A matrix (state × action → allowed yes/no) or a short list per state is enough. This is for enabling/disabling buttons in the UI.

6.2. **Revert reasons**

- FRONTEND-INTEGRATION mentions: `OnlyTaskee`, `OnlyTaskerCanAccept`, `TaskNotCompleted`, `InvalidState`, `InvalidSignature`, `InsufficientGasReserve`.
- **Question:** Is there a **full list** of revert reason strings (or custom error names) that the contract can throw, so we can map them to user-friendly messages?

---

## 7. Gasless vs direct (no “pending” Nostr)

7.1. **Rule we will implement**

- We will **never** publish a CONTRACT_STATUS with a “pending” state before we have a tx hash.
- After we get **txHash** (from relay 202 or from direct tx), we will publish **one** CONTRACT_STATUS with the **new blockchain state** (or the appropriate Nostr state if it’s not yet on-chain, e.g. proposal exists).
- **Question:** Confirm that this approach is correct for V2: no “PendingCompletion”, “PendingAcceptance”, etc. in Nostr; we only publish after confirmation (or after we have txHash and treat it as “submitted, will confirm”). If you recommend a different rule (e.g. publish “submitted” with txHash and then update to “confirmed” when receipt is seen), describe it.

7.2. **Creation**

- For **createPaymentContract**: we wait for tx receipt (or relay 202 + optional receipt poll), then parse **PaymentContractCreated** to get `paymentId`, then publish the **CONTRACT** Nostr event with our chosen `escrowId` (e.g. string form of paymentId) and `transactionHash`.
- **Question:** Confirm this is correct. If creation can be gasless, how do we get `paymentId` (same event from relay tx)?

---

## 8. Summary deliverable

Please produce a single markdown file (e.g. `V2-CONTRACT-FRONTEND-SPEC.md`) that includes:

- **§1** Contract identity and creation (paymentId format, createPaymentContract params and events, contract address vs relay).
- **§2** Reading state (getter name and return struct, state enum mapping, dispute proposal getter).
- **§3** Lifecycle table (action → function, params, who can call).
- **§4** Events (list with args; StateTransition usage).
- **§5** Nostr (kinds, content shape for CONTRACT and CONTRACT_STATUS, tags, action value rule).
- **§6** Permissions / state machine and revert reasons.
- **§7** Confirmation of “no pending Nostr” and creation flow.

You can copy this questionnaire into your repo and answer each section in order; that will give the frontend everything needed to implement the V2 escrow layer and keep behavior aligned with the contract and relay.

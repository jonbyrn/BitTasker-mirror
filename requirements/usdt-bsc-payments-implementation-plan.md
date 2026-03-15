# USDT (BSC) Payments Implementation Plan

## Objective
Enable USDT payments on BSC end-to-end for BitTasker, including:
1. Wallet direct send/receive/request flow using a sponsored BSC execution path with no BNB in the user experience.
2. Task and bid payment metadata selection and persistence.
3. Direct wallet-to-wallet USDT sends through a minimal on-chain router that reimburses the in-house sponsor treasury with a fixed USDT fee.
4. Escrow creation and lifecycle for BSC USDT contracts through `SecurePaymentContract`, with final contract-specific wiring gated on ABI availability.
5. Transaction/status/history UX and validation.

This plan assumes the existing partial BSC wallet integration remains the foundation.

## Specification Rules
1. This document is the normative planning source for USDT-BSC implementation work across:
   - BitTasker app components
   - `wallet-core`
   - direct-send router contract
   - in-house sponsor/paymaster service
   - `SecurePaymentContract`
2. `requirements/usdt-bsc-gate-evidence-ledger.md` is the canonical machine-checkable gate schema and evidence ledger.
3. Examples, appendices, and matrices in this document are normative unless explicitly marked otherwise.
5. For implementation convenience, multiple components may be developed from this workspace under separate subfolders, but they remain separate component boundaries and must be treated as separate repositories for ownership, versioning, release, and gate evidence.

## Scope and Delivery Targets
- In scope:
1. `usdt-bsc` wallet UX and payment request flow.
2. Sponsored BSC direct-send path for USDT using a minimal router contract and in-house sponsor/paymaster service.
3. Payment asset/network metadata propagation from task -> bid -> contract.
4. BSC USDT escrow execution path through `SecurePaymentContract` once the deployed contract ABI/artifact is available.
5. Tests (unit/component/e2e) for new BSC paths.
- Out of scope (unless explicitly added later):
1. Non-USDT BSC tokens.
2. Cross-chain settlement (RSK <-> BSC) conversion features.
3. Full historical backfill of legacy contracts without migration strategy.
4. Alternative wallet-abstraction or third-party sponsorship architectures for this delivery.
5. BSC swap and gasless-claim features unrelated to the selected direct-send and escrow paths in this plan.

## Multi-Component Repository Strategy
1. This delivery spans multiple component types, not just app-internal modules:
   - frontend and app code in BitTasker
   - shared wallet library code in `wallet-core`
   - on-chain direct-send router contract code
   - off-chain in-house sponsor/paymaster service code
   - on-chain escrow contract code in `SecurePaymentContract`
2. These components may be implemented from this repo folder in separate subfolders during development for speed and coordination.
3. Even when developed side-by-side locally, they must be treated as separate repositories/components in the plan:
   - separate ownership
   - separate versioning
   - separate test suites where appropriate
   - separate release criteria
   - separate evidence artifacts when component-specific gates apply
4. No component may rely on undocumented local-only coupling just because it is temporarily developed in the same workspace.
5. All inter-component boundaries must be documented as explicit contracts:
   - app <-> `wallet-core`
   - app <-> sponsor service
   - app <-> router contract
   - app <-> `SecurePaymentContract`
6. Any file-path examples in this plan describe likely local implementation locations, not a requirement that these components remain in one repository long-term.
7. For clarity:
   - `app components` means UI, stores, parser, history, Nostr/domain, and app-side escrow routing code inside BitTasker
   - `non-app components` means `wallet-core`, router contract, sponsor/paymaster service, and `SecurePaymentContract`

## Current State Summary
- Already available:
1. BSC wallet state (`bnbBalance`, `usdtBalance`) and send wrappers in wallet store.
2. `usdt-bsc` path in send flow.
3. BSC-aware address parsing (`bsc:` and chain ids `56/97`).
4. BSC explorer links in some send/pending/success screens.
- Critical gaps:
1. Receive/request flow not enabled in active receive form for `usdt-bsc`.
2. Amount/fee model is still sats/BTC-coupled in key wallet paths.
3. Task/bid/escrow domain is mostly RSK/RBTC and USD hardcoded.
4. Contract metadata and filters are RSK-centric (`#n` ambiguity for multi-chain).
5. Balance/transaction history and tests are incomplete for BSC runtime behavior.
6. Versioned Nostr task/bid/contract payloads are defined by this plan but not yet implemented in product code.
7. Final BSC escrow ABI/artifact is not available, so exact app-to-contract integration details remain provisional.
8. Existing `wallet-core` BSC paymaster code is aligned to a more complex delegation path than the MVP selected here and must not drive architecture decisions for this delivery.

## Where USDT (BSC) Must Be Added or Enabled

### A) Wallet Store and Wallet UI
- `src/lib/stores/wallet.store.ts`
1. Harden `sendBSCUSDT` path with explicit decimal/validation constraints.
2. Add/propagate BSC-specific error states and readiness checks.
3. Replace user-facing BNB gas readiness with sponsor-availability, router-allowance, and fixed-fee readiness checks.
- `src/lib/components/wallet/SendPaymentForm.svelte`
1. Replace BTC/sats-derived USDT amount logic with token-native units.
2. Add explicit fixed-fee and no-BNB-fee-copy rendering branch for `usdt-bsc`.
3. Ensure max amount, validation, and error copy are token/network aware.
4. Make QR scan behavior fail closed for EVM addresses:
   - detect chain-qualified URIs and route by network
   - treat plain raw `0x...` as ambiguous unless it is a valid RSK EIP-1191 checksum address
   - never auto-populate a payable flow when network cannot be proven safely
   - either reject outright or require explicit user disambiguation in a blocked, non-payable recovery step
- `src/lib/components/wallet/ReceivePaymentForm.svelte`
1. Add `usdt-bsc` to network options.
2. Add BSC-compatible request generation path.
3. Add validation rules for token amount precision and address/network context.
4. Show explicit asset + network labels beside every generated payment request and QR.
5. Never show a raw unqualified EVM address QR for direct BSC or RSK payment requests.
- `src/lib/components/wallet/PaymentRequestModal.svelte`
1. Emit BSC URI format (`bsc:` or chain-id-qualified URI) to avoid `0x` ambiguity.
2. Add labels/translations for BSC/USDT states.
3. Ensure copied value, visible value, and QR value are network-specific and identical.
4. Show user-facing warning copy that only the displayed asset/network may be sent to the request.
- `src/lib/components/QrCodeScanner.svelte`
1. Preserve full scanned QR payload for parsing; do not normalize away scheme or chain-id context before validation.

### B) Address/Amount Parsing and Validation
- `src/lib/utils/helpers/paymentAddressParser.ts`
1. Keep network detection but make value parsing token-aware for USDT decimals.
2. USDT amounts must be represented, parsed, validated, displayed, copied, and persisted as USDT amounts using the accepted token decimals.
3. No USDT path may interpret, store, display, or convert transfer values through `wei`, `sats`, BTC, or sats-derived semantics.
- `src/lib/utils/helpers/validators.ts`
1. Add stronger BSC-specific address/network checks for payment intent contexts.

### C) Transaction and Balance History
- `src/lib/utils/wallet/transactionHistory.ts`
1. Make amount/fee display processing asset-aware (USDT transfer amount, fixed router fee, fixed-fee status) instead of sats-only.
2. Remove hardcoded assumptions that token transfers are always rendered as sats.
- `src/lib/components/wallet/TransactionHistory.svelte`
1. Render token units for BSC USDT rows.
2. Preserve BTC-family rendering for existing flows.
- `src/lib/api/services/balanceHistory.service.ts`
1. Enable true BSC runtime path for historical comparisons (currently effectively disabled).
- `src/lib/components/wallet/BalanceHistory.svelte`
1. Ensure network/provider wiring includes BSC where appropriate.

### D) Task/Bid Payment Domain
- `src/lib/components/task/steps/TaskBudget.svelte`
1. Add payment asset/network selection (not forced `USD`).
- `src/lib/stores/task.store.ts`
1. Add defaults and schema for selected payment asset/network.
- `src/lib/components/bidding/BidForm.svelte`
1. Capture and persist bid payment asset/network; remove USD/RSK assumptions.
- `src/lib/types/bid.d.ts`, `src/lib/types/contract.d.ts`
1. Extend types to model payment asset + payment network explicitly.
- `src/lib/utils/constants/tags.ts`, `src/lib/nostr/task.ts`
1. Persist/query payment network metadata in tags/events.

### E) Escrow Execution and Contract Lifecycle
- `src/lib/utils/escrow/v1/escrowBid.ts`
1. Branch validation by selected payment network/asset.
2. Replace RBTC conversion assumptions for BSC USDT path.
- `src/lib/utils/escrow/v1/escrow.ts`
1. Add BSC USDT escrow interaction flow (ERC-20 transfer/allowance semantics as needed).
2. Separate RSK-native `value` funding logic from token-based logic.
- `src/lib/utils/escrow/index.ts`
1. Route handler by payment network/asset (not just nominal `network` argument).
- `src/lib/utils/escrow/v1/nostrContract.ts`, `src/lib/stores/contract.store.ts`
1. Remove hardcoded `currency: 'RBTC'`.
2. Normalize network tagging to represent chain + environment.
- `src/lib/utils/wallet/loadContractsByAddress.ts`
1. Implement BSC branch (currently intentionally returns empty list).

### F) Contract/Task/Bid UI and Status
- `src/lib/components/bidding/BidAcceptanceForm.svelte`
1. Replace hardcoded `'RSK'` acceptance call.
2. Update validation, provider usage, and copy for BSC USDT.
- `src/lib/components/contracts/*`
1. Render asset/network-specific metadata and explorer links.
- `src/lib/components/shared/UsdSatsDisplay.svelte`
1. Generalize display for token units or create new shared formatter for USDT.

### G) Configuration and Environment
- `.env.example`
1. Document required BSC env vars used by code (router/token/network/sponsor/escrow addresses and policy settings).
- `src/lib/utils/wallet/contractRegistry.ts`
1. Validate and expose BSC contract address config consistently.

### H) Sponsored Direct-Send and Sponsor Service
- `wallet-core/src/chains/bsc/BSCWallet.ts`, `wallet-core/src/core/WalletManager.ts`
1. Add a plain-EOA direct-send submission path for BSC direct sends.
2. Add preflight for fixed-fee router send readiness: token balance for `recipientAmount + fixedFee`, router allowance, chain id, and sponsor availability.
3. Remove or bypass non-selected delegated-execution assumptions for the MVP path.
- `wallet-core/src/chains/bsc/BSCPaymaster.ts`
1. Either replace or isolate non-selected delegated-execution paymaster assumptions behind a non-MVP boundary.
2. Expose only the sponsor-status and direct-send submission surface needed by the chosen EOA flow.
- New minimal router contract (`USDTFeeRouter.sol` or equivalent deployment artifact)
1. Accept recipient and recipient amount.
2. Atomically route `recipientAmount` to recipient and `fixedFee` to treasury.
3. Stay stateless in the send path except immutable configuration and optional emergency pause.
- New in-house sponsor service
1. Restrict sponsorship to approved router and escrow methods only.
2. Maintain sponsor balance, tx submission, and reconciliation hooks.
3. Return typed failure reasons so UI can fail closed without exposing BNB as a user requirement.

## Reuse and Adaptation Strategy
- Reuse directly:
1. Existing multi-network wallet state in `wallet.store.ts`.
2. Existing send pipeline and pending/success screens; adapt unit formatting and fee logic.
3. Existing parser-driven network detection; tighten URI generation to disambiguate BSC.
4. Existing modular escrow manager (`escrow/index.ts`) as the insertion point for BSC-USDT handler.
5. Existing Nostr tag and contract store patterns; extend metadata fields instead of introducing parallel systems.
- Adapt carefully:
1. `UsdSatsDisplay` and sats-centric helpers should remain for BTC flows but not drive USDT math.
2. Existing contract query tag `#n` must be expanded or normalized to support both chain and environment.
3. Existing “RSK-only” validation/copy should become network-aware via shared helpers.

## Documentation Review Reuse Assessment
1. High reuse:
   - generic EVM provider, signer, balance, and direct-send structure in app and `wallet-core`
   - shared wallet orchestration in `wallet.store.ts` and `wallet-core/src/core/WalletManager.ts`
   - shared escrow manager routing structure in `src/lib/utils/escrow/index.ts`
   - task, bid, and contract UI scaffolding once asset/network labels are generalized
2. Medium reuse:
   - address parsing and validation, because the current plain `0x...` fallback still prefers RSK
   - direct-send UX, because BSC send exists but fee handling and amount semantics are still Rootstock/BTC-shaped
   - Nostr persistence patterns, because the structure is reusable but payloads need versioning and chain-qualified identifiers
3. Low reuse:
   - transaction history normalization, because `wallet-core` BSC history does not match the app's current normalized transaction shape
   - contract loading, query, and history views, because BSC paths are still behind or missing compared with RSK
   - swap, gasless claim, and RIF Relay flows, because those are product- and integration-specific to Rootstock/RBTC
4. Working rule:
   - Reuse RSK code when it is generic EVM behavior.
   - Fork or specialize only where chain behavior, explorer shape, token semantics, or UX expectations differ.

## Chosen BSC Implementation Architecture
1. Wallet model:
   - normal EOA only
   - no alternative wallet-abstraction dependency in this delivery
2. Direct-send model:
   - all in-app BSC USDT wallet-to-wallet sends use a minimal on-chain router
   - sender sees a single user action and signs one BSC transaction
   - router atomically sends `recipientAmount` to recipient and `fixedFee` to treasury
3. Gas model:
   - BSC transactions use an in-house sponsor service
   - BNB exists only as an internal sponsor concern and must never appear as a user requirement
   - if sponsorship is unavailable, the app blocks the action rather than falling back to BNB
   - the selected execution model is: user signs a normal EOA transaction, the sponsor service picks up the signed zero-gas transaction, and submission is handled through the sponsor path as a bundle
4. Escrow model:
   - direct-send router is only for wallet-to-wallet sends
   - peer-to-peer escrow stays in `SecurePaymentContract`
   - escrow-specific contract wiring remains ABI-gated
5. Operational model:
   - sponsor/paymaster policy approves only known router methods and approved `SecurePaymentContract` methods
   - treasury receives the fixed direct-send reimbursement fee and funds sponsor operations

## BSC Direct-Send UX Contract
1. Product-level wallet model:
   - users experience one wallet with two clearly labeled rails: `rBTC on Rootstock` and `USDT on BSC`
   - asset selection is primary; network labeling is explicit at payment-critical moments
2. BSC direct-send screens:
   - must never show BNB as a required asset
   - must never show a user-payable gas line
   - must show the fixed USDT service fee when applicable
   - must not explain sponsorship, paymasters, or backend gas mechanics to the user
3. Rootstock screens:
   - may continue to show rail-appropriate network-cost semantics for rBTC flows
   - must not inherit BSC direct-send copy from BSC flows
4. Mixed balance and history rules:
   - history rows must always show asset and network badges
   - BSC direct-send rows must not show BNB debits in user-facing rows
   - BSC direct-send rows may show the fixed USDT service fee and standard transfer status only
5. Blocked-state rules:
   - if sponsorship is unavailable, the send form must enter a non-payable blocked state
   - blocked states must explain that the payment path is temporarily unavailable and offer retry guidance, not BNB funding guidance
6. Continuity rules before G2 pass:
   - no wallet entry point may show contradictory `coming soon` or unsupported-state copy for shipped BSC direct-send functionality
   - send, request, pending, success, and history screens must use the same asset and network naming contract

## Wallet Surface Matrix
1. Required wallet surfaces under the dual-rail naming contract:
   - wallet home and balance cards
   - send
   - receive
   - payment request modal
   - pending transaction state
   - success state
   - transaction history
   - balance history
2. Every required surface must:
   - show asset and network consistently where payment action or history interpretation depends on rail
   - preserve the no-BNB rule for BSC direct-send UX
   - preserve Rootstock-specific semantics for rBTC flows without leaking BSC direct-send terminology

## Fee Copy Matrix
1. `USDT on BSC` direct-send:
   - confirm: show recipient amount, fixed USDT service fee, and total debit in USDT only
   - pending: show standard transfer-in-progress state without exposing BNB or sponsorship mechanics
   - success: show amount sent and service fee paid; do not show BNB debit
   - history: show USDT transfer amount, fixed fee, and standard transfer status only
2. `rBTC on Rootstock`:
   - confirm/pending/success/history continue to use rail-appropriate network-fee semantics
   - must not inherit BSC fixed-fee wording unless the Rootstock flow actually uses it

## Blocked-State UX Matrix
1. Required blocked states for BSC direct-send:
   - sponsorship unavailable
   - sponsor policy rejected request
   - router allowance missing or stale
   - wrong-chain or ambiguous QR/payment intent
2. Every blocked state must define:
   - title
   - explanation
   - primary CTA
   - non-payable state until resolved
3. No blocked state may instruct the user to acquire or send BNB.
4. Ambiguous raw `0x...` recovery must use the simplest permitted manual disambiguation:
   - exactly two explicit choices: `rBTC on Rootstock` or `USDT on BSC`
   - the disambiguation screen must show a warning that the network could not be detected safely from the scanned address
   - the form remains blocked and non-payable until one choice is selected
   - after selection, the confirmation screen must restate the chosen asset and network before payment can proceed
   - this recovery step should be implemented as local send-form state, not a global wallet-state mutation

## Sponsorship Boundary Contract
1. Sponsor-eligible actions for this release:
   - approved direct-send router method(s)
   - approved `SecurePaymentContract` method(s) after ABI acceptance
2. Non-eligible actions:
   - raw arbitrary BSC contract calls
   - raw direct token-send path outside the supported router UX
   - any alternative delegated-execution path outside this plan
3. Every direct-send request handled through the sponsor service must be bound to:
   - chain id
   - target contract
   - method selector
   - approved token address
   - fixed fee policy where applicable
4. Fail-closed behavior:
   - if sponsor policy rejects a request, budget is exhausted, service health is degraded, or request fields do not match policy, the action is blocked
   - no alternate fallback may be offered in user-facing BSC flows
5. Required operational controls:
   - emergency disable switch for BSC direct-send
   - sponsor-balance monitoring
   - direct-send failure monitoring
   - treasury reconciliation monitoring
   - explicit separation between the sponsor funding balance/address and the reimbursement/treasury destination

## Sponsor Request Authentication and Anti-Replay Contract
1. Every sponsor request must include:
   - signed raw transaction hash as the deduplication key
   - request expiry
   - correlation id for retries and reconciliation
2. Sponsor service requirements:
   - rely on the normal EOA transaction nonce for on-chain replay protection
   - treat the signed raw transaction hash as the sponsor-service idempotency key
   - reject replayed, expired, or duplicate requests outside the allowed retry window
   - bind the request to the same chain, target, selector, token, and fee policy validated by sponsorship policy
   - preserve idempotency for safe retry after dropped or replaced transactions
   - do not introduce a separate custom nonce layer unless the architecture later moves to off-chain signed intents or another delegated-execution model
3. Evidence requirements:
   - anti-replay and idempotency tests are required for sponsor policy suites
   - replay and duplicate-request scenarios must be represented in failure-injection evidence before `G3` pass

## Direct-Send Router Threat Model and Invariants
1. Router scope:
   - one supported token
   - one treasury destination
   - one fixed-fee policy
   - one direct-send execution family
2. Router must not:
   - accept arbitrary calldata routing
   - perform swaps, quoting, escrow inference, or cross-chain logic
   - expose generic multicall, delegatecall, or approval-management escape hatches
3. Router invariants:
   - recipient and amount are explicit inputs
   - total debit equals `recipientAmount + fixedFee`
   - fixed fee, treasury, and token are single-source-of-truth configuration values
   - zero-address and malformed-amount requests revert
4. Security controls:
   - deny-by-default method surface
   - mandatory emergency pause for release-bound deployments
   - explicit min amount and optional max amount
   - contract tests for recipient amount, treasury fee, and revert behavior

## `SecurePaymentContract` Security Review Artifact
1. `G0` and `G3` must reference a dedicated security review artifact for `SecurePaymentContract`.
2. Required contents:
   - privilege and role analysis
   - fund-flow invariants
   - pause and emergency behavior
   - allowance or approval assumptions
   - sponsor-interaction assumptions
   - griefing and stuck-state analysis
   - event integrity and reconciliation assumptions
   - unresolved findings and explicit release blockers
3. `G3` may not pass without:
   - static-analysis results
   - invariant or fuzz coverage summary
   - explicit sign-off on unresolved residual risk

## `SecurePaymentContract` Capability Gate
1. `G3` may move from `blocked` to review only after the deployed BSC contract proves the app-critical capabilities below.
2. Required capability proof:
   - ERC-20 USDT funding semantics are supported by the deployed contract path used by the app
   - caller-role permissions are compatible with the app's tasker, taskee, and operator flows
   - required getter and read methods exist with stable visibility and return shapes
   - required status, lifecycle, and reconciliation events exist with stable field mapping
   - the deployed bytecode/artifact and accepted address set match the app environment matrix
3. Required evidence artifacts:
   - deployed ABI bundle
   - deployed address set
   - bytecode hash and constructor args
   - capability verification report mapping app-required methods, events, and getters to deployed artifacts
4. Any missing or incompatible capability blocks:
   - escrow adapter implementation
   - escrow contract read-model enablement
   - release-candidate BSC escrow flows

## Allowance and Approval Security Policy
1. Direct-send router allowances:
   - must bind to the exact approved router spender
   - must use bounded approvals for MVP unless a wider approval exception is explicitly approved in the ledger
2. Escrow allowances:
   - exact spender binding is required
   - unlimited approvals are forbidden by default and require explicit sign-off if ever proposed
3. Partial-failure behavior:
   - compensation policy must define when allowances are reset, reduced, or revoked after partial failure
   - stale approval recovery behavior must be tested and documented
4. Evidence requirements:
   - allowance and approval behavior must be covered in unit or integration tests
   - any exception to bounded-approval policy must be recorded in gate evidence with named approvers

## Approximate Implementation Size
1. Direct-send MVP (`usdt-bsc` wallet + router + sponsor + tests):
   - production code: `2,500-4,500 LOC`
   - tests: `1,000-2,000 LOC`
   - total: `3,500-6,500 LOC`
2. Full BSC support including escrow integration after ABI:
   - production code: `4,500-7,500 LOC`
   - tests: `1,500-3,000 LOC`
   - total: `6,000-10,500 LOC`
3. Largest workstreams by effort:
   - app wallet/task/bid/contract UX and metadata normalization
   - `wallet-core` BSC normalization and direct-send submission support
   - escrow integration after ABI
4. Smallest workstreams by effort:
   - minimal router contract
   - direct-send fee split logic
   - fixed-fee rendering once the amount model is corrected

## Design Decisions to Lock Before Coding
1. Canonical payment model:
   - Recommended: `paymentAsset` + `paymentNetwork` fields across task, bid, contract.
2. Network tagging strategy:
   - Recommended: normalized tag value (`rsk-mainnet`, `rsk-testnet`, `bsc-mainnet`, `bsc-testnet`).
3. Amount precision policy:
   - Source-of-truth token decimals must come from the accepted BSC token configuration and on-chain verification, never from BTC/sats conversions.
   - If the intended product token is canonical 6-decimal USDT, `wallet-core` token config must be corrected before G0 is approved.
4. Gas policy:
   - BSC USDT sends and escrow must not require BNB in the user flow.
   - User-facing flows must never require BNB.
   - Direct-send preflight checks sponsor availability, policy eligibility, router allowance, and total USDT debit (`recipientAmount + fixedFee`).
   - Escrow preflight checks sponsor availability, policy eligibility, and contract-specific requirements once ABI is available.
5. Backward compatibility:
   - Legacy RSK contracts remain readable; new metadata fields are additive.
6. In-house `wallet-core` coordination:
   - Assign a single owner for `@bittasker/wallet-core` changes and maintain an app<->core integration contract for BSC token escrow/allowance/gas preflight behavior.
7. Environment contract matrix:
   - Define and document BSC testnet/mainnet escrow address, USDT token address, chain ID, and explorer base URLs.
8. Versioned Nostr schema policy:
   - All task, bid, contract, and status payloads must include a schema version and a backward-compatible reader strategy.
9. ABI dependency policy:
   - No final escrow method wiring, event decoding, or release sign-off is allowed before the deployed BSC contract ABI/artifact is available and accepted in Gate G0.
10. Canonical escrow-linked identifier policy:
   - G0 must define the exact serialized identifier format and tag placement used across task payloads, encrypted bid payloads, contract metadata, and status events.
11. Mixed-chain reader policy:
   - G0 must define whether mixed RSK/BSC views are merged or chain-filtered by default and how legacy records derive payment context when tags and payload metadata disagree.
12. Direct-send routing policy:
   - in-app BSC USDT wallet-to-wallet sends must use the minimal router contract and fixed-fee model; raw direct token sends are not a supported UX path in the app.
13. Alternative architecture policy:
   - wallet-abstraction and third-party sponsorship alternatives are explicitly deferred and must not bleed into MVP design or implementation.

## Architecture Invariants (Non-Negotiable)
1. Use canonical `PaymentContext` (`paymentAsset`, `paymentNetwork`, `chainId`, `tokenAddress`, `decimals`, `amountAtomic`).
2. Treat USDT as token-native source-of-truth using the accepted token decimals; never use sats/BTC conversion as authoritative value.
3. For USDT, all user-facing amounts, parser values, validation rules, fixed fees, and persisted transfer amounts must be expressed as USDT amounts using the accepted token decimals.
4. No USDT code path may depend on `wei`, `sats`, BTC, or sats-derived terminology or conversion logic.
5. Require chain-qualified BSC payment intents (`bsc:` or chain-id-qualified URI); reject ambiguous raw `0x...` intents for BSC payment flows.
6. Enforce checksum validation for EVM payment addresses in send/receive/escrow entry points.
7. Run BSC preflight before direct send: chain id match, token allowlist, token decimals match accepted config, sender balance for `recipientAmount + fixedFee`, router allowance, and sponsor policy availability.
8. Run BSC preflight before escrow: chain id match, token allowlist, token decimals match accepted config, contract readiness, and sponsor policy availability.
9. Route in-app direct wallet-to-wallet USDT sends through the minimal router contract only; do not expose raw direct token-send paths in the supported UX.
10. Route escrow by asset+network handler (no hardcoded RSK fallback for USDT-BSC paths).
11. Use idempotency keys for escrow creation attempts and define retry/compensation behavior.
12. Keep chain+environment tags normalized (for example `bsc-testnet`, `bsc-mainnet`, `rsk-testnet`, `rsk-mainnet`).
13. All Nostr task, bid, contract, and status payloads must include a schema version and be readable through a compatibility adapter.
14. Contract-facing code must remain contract-agnostic until the final deployed ABI/artifact is approved.
15. It must not be possible for the user to send to the wrong EVM chain because of QR/address ambiguity.
16. Raw unqualified `0x...` EVM addresses must never be treated as safe direct-payment requests for BSC or RSK.
17. QR, visible request text, and copied request text must all encode the same network-specific payment intent.
18. No user-facing screen in the BSC direct-send flow may require, mention, or suggest holding BNB to complete the transaction.
19. If sponsorship is unavailable, the app must fail closed with a non-payable state and explicit retry guidance.
20. Direct-send router code must stay minimal, stateless in the send path, and bounded to one supported token and one fixed fee policy.

## Versioned Nostr Data Requirements
1. Add a version field to:
   - task payloads
   - bid encrypted payloads
   - contract metadata/events
   - bid and contract status events
2. Define per-payload compatibility rules:
   - the current reader accepts legacy payloads with missing version fields
   - all new writes emit an explicit schema version
   - task, bid, and contract identifiers are chain-qualified when tied to escrow state
3. Add migration requirements:
   - preserve legacy RSK readability
   - normalize mixed identifiers (`d` tag, UUID-like values, raw event ids) through one resolver path
   - reject ambiguous writes that cannot be mapped to a single versioned schema

## Contract Boundary and ABI Hard Stops
1. Work that can proceed now without the final deployed ABI/artifact:
   - wallet send, receive, and request UX for `usdt-bsc`
   - token-native amount model cleanup
   - versioned Nostr schema design and metadata propagation
   - chain and environment tag normalization
   - generic escrow abstraction cleanup
   - BSC history normalization design
   - BSC storage/query abstractions and fail-closed routing that do not depend on final contract method names, return shapes, or event signatures
2. Work that must remain blocked until the final deployed ABI/artifact exists:
   - final escrow method wiring
   - event decoding and custom error mapping
   - exact funding flow (`approve`, `permit`, `transferFrom`, or equivalent)
   - read-model integration that depends on final contract return shapes
   - production-ready Phase 3 completion and release approval
3. Provisional assumptions allowed before ABI:
   - escrow lifecycle concepts
   - tasker/taskee role mapping
   - chain-qualified escrow identity requirement
   - requirement for a read path and state-machine reconciliation
4. Provisional assumptions not allowed before ABI:
   - final calldata layouts
   - final event field ordering
   - token approval semantics
   - delegated transaction behavior not proven by the deployed contract interface
   - exact getter availability or visibility

## Pre-Deployment Implementation Track
1. Work from the local contract source and provisional artifact boundary only:
   - review `SecurePaymentContract.sol`
   - identify lifecycle concepts, role model, and read/write capability expectations
   - record all places where current app assumptions do not match the contract source
2. Produce a provisional contract integration pack before deployment:
   - expected function map
   - expected event map
   - expected read-model fields
   - open questions that only deployment/artifacts can close
3. Build contract-independent app plumbing now:
   - task, bid, and contract metadata propagation
   - versioned Nostr schemas
   - wallet amount, parser, validator, and request UX
   - direct-send router integration boundaries
   - sponsor availability and blocked-state UX
   - chain-qualified identifiers
   - fail-closed routing for escrow/network selection
4. Build deployment-ready integration scaffolding now:
   - adapter interface for the future BSC contract binding
   - placeholder artifact loader that fails closed when deployment data is missing
   - tests that assert blocked behavior when ABI/address data is unavailable
   - environment validation that marks contract-dependent flows unavailable until deployment inputs exist
   - router and sponsor configuration validation for direct-send flows
5. Prepare deployment handoff requirements now:
   - target networks to deploy (`bsc-testnet` first, then `bsc-mainnet`)
   - required output artifacts: ABI, deployed addresses, bytecode hash, constructor args, environment matrix
   - acceptance checklist for artifact integrity and environment registration
6. Hard stop:
   - no one should continue into contract-specific escrow invocation, contract read adapters, or release-candidate BSC escrow testing until the user has deployed the contract and supplied the deployment artifacts.

## Provisional Contract Integration Pack Schema
1. The provisional contract integration pack must exist before any contract-adjacent app work is approved.
2. Required fields:
   - source contract path
   - source revision or commit reference
   - expected function map
   - expected event map
   - expected read-model fields
   - expected role and permission model
   - mismatch list versus current app assumptions
   - open deployment-time questions
   - blocker status per open question
   - primary approver
   - secondary approver when contract risk is material
   - artifact location in `requirements/`
3. Required mismatch classification:
   - `compatible`
   - `needs-adapter`
   - `blocked-until-deploy`
4. Any unresolved `blocked-until-deploy` item must be surfaced in `G0` notes and carried into `G3`.

## Fail-Closed Stage Matrix
| Stage | Allowed Work | Blocked Work | Required Gate Status |
|---|---|---|---|
| `pre-G0` | analysis, schema design, provisional integration pack draft, wallet/request UX planning | any contract-specific binding, release claims, production escrow assumptions | no gate may claim `pass` |
| `post-G0 / pre-deploy` | contract-agnostic app work, versioned Nostr work, wallet-core contract planning, fail-closed routing, blocked-behavior tests | final contract adapter, event decoding, release-candidate escrow flows | `G0=pass`, `G3-G5=blocked` |
| `deployed / pre-G3` | artifact validation, ABI loading, contract adapter implementation, deployment-bound integration tests | production enablement, canary, final release sign-off | `G0=pass`, `G3` may move from `blocked` to review |
| `protected release targets` | only work backed by approved gates and non-blocked evidence | any merge or release with `blocked` contract-dependent gates | all required gates `pass` |

## Pre-Deployment Readiness Matrix
| Track | Entry Criteria | Exit Criteria | Blocking Artifact |
|---|---|---|---|
| `contract-agnostic` | G0 draft exists | wallet/request/schema/tagging/routing work specified and approved | versioned schema lock |
| `deployment handoff` | provisional integration pack approved | deployment checklist complete and artifact requirements defined | deployment handoff checklist |
| `post-deployment` | deployed ABI and address set available | G3 contract-specific work can start | accepted deployed artifact bundle |

## `wallet-core` Changes Required for App Readiness
1. Normalize BSC transaction history into the transaction shape the app currently processes.
2. Add chain-qualified BSC payment-intent helpers that preserve `amountAtomic`, `tokenAddress`, and `decimals`.
3. Add chain-aware EVM validation helpers for BSC payment flows, including wrong-chain rejection and normalized checksum output.
4. Add richer BSC USDT preflight APIs:
   - sponsor availability and policy eligibility
   - token balance checks for `recipientAmount + fixedFee`
   - router allowance checks for direct sends
   - allowance checks if the final escrow contract requires them
   - typed failure reasons for UI and retry logic
5. Use split ownership for BSC monitoring and history:
   - `wallet-core` owns chain-native balance and transaction retrieval plus normalization into the shared transaction shape
   - the BitTasker app owns product enrichment, history rendering, explorer routing, fixed-fee labeling, and task/bid/contract context mapping
   - the sponsor service owns sponsor telemetry, submission outcomes, and treasury reconciliation signals
6. Document the app-to-core compatibility contract with named owners and branch/release coordination.
7. Reconcile the current `wallet-core` token-decimal configuration with the intended product token before G0:
   - if canonical BSC USDT is the target, correct `wallet-core` config and tests accordingly
   - if a different 18-decimal token contract is the target, update the app plan, naming, and UX to match the actual asset
8. Lock final ownership before G0 for:
   - post-ABI contract adapter implementation
   - ABI loading and accepted artifact distribution
   - event decoding and state mapping
   - contract read-model ownership between app and `wallet-core`
9. Add a plain-EOA direct-send submission surface for the direct-send path and keep non-selected delegated-execution code paths out of the MVP integration contract.

## `wallet-core` Integration Contract Schema
1. The `wallet-core` integration contract must be reviewed as a structured artifact, not free-form prose.
2. Required sections:
   - transaction normalization contract
   - payment-intent helper contract
   - validation helper contract
   - preflight API contract
   - version compatibility matrix
   - failure codes and error semantics
   - ownership and escalation
   - approvers and approval date
3. Each section must define:
   - exported surface
   - input schema
   - output schema
   - failure behavior
   - source-of-truth owner
   - related gate
4. The artifact must live in `requirements/` and be referenced from the gate ledger.

## Sponsor-Service Interface Contract
1. The sponsor service must be specified as a structured implementation artifact before `G2` pass.
2. Required sections:
   - request schema
   - response schema
   - signed payload format
   - gas-field ownership rules
   - submission lifecycle states
   - retry, replacement, cancel, and expiry rules
   - typed failure codes and UI-facing error semantics
   - exact `wallet-core` methods consumed by the app
   - approvers and approval date
3. Required request fields:
   - signed raw transaction payload
   - signed raw transaction hash
   - chain id
   - expected target contract
   - expected method selector
   - expected token address where applicable
   - request expiry
   - correlation id
4. Required response fields:
   - accepted or rejected status
   - typed failure code when rejected
   - submission id
   - tx hash or bundle reference when available
   - current lifecycle state
5. Ownership rules:
   - the app owns user-intent creation and blocked-state rendering
   - `wallet-core` owns signing and typed request construction
   - the sponsor service owns policy validation, submission, idempotency, and lifecycle reporting

## Normalized Transaction and Read-Model Contract
1. One shared normalized schema must be used across app, `wallet-core`, and sponsor-service integration artifacts.
2. Required record families:
   - direct-send router submission
   - direct-send router confirmation
   - sponsor-path rejection or submission failure
   - escrow create lifecycle
   - escrow release, cancel, and dispute lifecycle
3. Required fields for every normalized record:
   - record type
   - chain id and chain-env
   - asset symbol and token address where applicable
   - sender
   - recipient or escrow reference
   - amount atomic
   - fixed fee atomic when applicable
   - tx hash or submission reference
   - lifecycle status
   - confirmation state
   - source owner (`wallet-core`, sponsor service, contract adapter)
   - product enrichment fields added by the app
4. The schema must define:
   - how direct-send router records differ from escrow records
   - how sponsor submission failures are rendered without looking like successful payments
   - how mixed Rootstock/BSC records are grouped and filtered consistently
5. Source-precedence rules:
   - on-chain confirmed contract reads and finalized chain receipts are authoritative for final state
   - sponsor-service lifecycle state is authoritative for pre-confirmation submission progress
   - `wallet-core` normalized chain data is authoritative for chain-derived transfer and confirmation fields before contract-read enrichment is available
   - app enrichment may add labels, grouping, and presentation metadata, but must never override authoritative lifecycle state
6. Conflict rules:
   - if sponsor-service status conflicts with confirmed chain data, confirmed chain data wins and the disagreement must be logged as reconciliation evidence
   - if `wallet-core` normalized chain data conflicts with contract-read state on confirmed escrow lifecycle, contract-read state wins for contract status while chain data remains the source of tx-level details
   - if no authoritative source yields a safe final interpretation, the record must remain readable but non-actionable
7. The schema artifact must be approved before `G2` pass and updated again before `G3` pass if escrow fields change after deployed ABI review.

## Cross-Component Transaction State Machine
1. One canonical transaction state machine must be shared across app, `wallet-core`, sponsor service, and post-ABI contract adapter work.
2. Required direct-send states:
   - `draft`
   - `preflight_blocked`
   - `ready_to_sign`
   - `signed`
   - `submission_pending`
   - `submitted`
   - `chain_pending`
   - `confirmed`
   - `submission_failed`
   - `chain_failed`
   - `expired`
3. Required escrow states:
   - `draft`
   - `preflight_blocked`
   - `ready_to_sign`
   - `signed`
   - `submission_pending`
   - `submitted`
   - `chain_pending`
   - `created`
   - `accepted`
   - `released`
   - `cancelled`
   - `disputed`
   - `submission_failed`
   - `chain_failed`
   - `expired`
4. State ownership:
   - app owns `draft`, `preflight_blocked`, and `ready_to_sign`
   - sponsor service owns `submission_pending`, `submitted`, `submission_failed`, and `expired` before chain confirmation
   - `wallet-core` owns normalized tx-level `chain_pending`, `confirmed`, and `chain_failed` based on chain data
   - post-ABI contract adapter owns escrow lifecycle states derived from deployed contract reads and events
5. Transition rules:
   - app-visible success must never occur before `confirmed` for direct send or contract-confirmed escrow lifecycle state for escrow
   - replacement or retry behavior must preserve one logical operation id across superseded tx hashes
   - submission failure must never be rendered as a successful payment or escrow action
   - a record may move from sponsor-service state to chain-derived state only through the canonical lifecycle mapping, never by UI inference alone
6. The state machine artifact must be referenced by:
   - sponsor-service interface contract
   - normalized transaction and read-model contract
   - contract-surface UX matrix
   - blocked-state and pending-state tests

## `wallet-core` Traceability Matrix
| Requirement | Contract Section | Gate | Ledger Field | Evidence Artifact |
|---|---|---|---|---|
| BSC transaction normalization | transaction normalization contract | `G0`, `G2` | `Normalization Ref` | normalization contract artifact |
| BSC payment-intent helpers | payment-intent helper contract | `G0`, `G2` | `Payment-Intent Ref` | payment-intent contract artifact |
| BSC validation helpers | validation helper contract | `G0`, `G2` | `Validation Ref` | validation contract artifact |
| BSC preflight API | preflight API contract | `G0`, `G2`, `G3` | `Preflight Ref` | preflight contract artifact |
| version compatibility | version compatibility matrix | `G0` | `Compatibility Ref` | compatibility matrix artifact |
| failure semantics | failure codes and error semantics | `G0`, `G2`, `G3` | `Failure-Semantics Ref` | failure-code artifact |

## Ownership Boundary Matrix
| Surface | Primary Owner | Secondary Owner | Dependency | Blocked Gate If Unresolved |
|---|---|---|---|---|
| wallet amount/request UX | app/frontend | domain lead | versioned schema lock | `G2` |
| payment-intent parse/build | `wallet-core` | app/frontend | token config lock | `G2` |
| chain-aware validation | `wallet-core` | app/frontend | accepted token config | `G2` |
| transaction normalization | `wallet-core` | app/wallet history | explorer/provider shape | `G2` |
| direct-send router contract | blockchain/contracts | app/frontend | fixed-fee policy lock | `G2` |
| sponsor service policy and submission | blockchain/platform | app/frontend | sponsorship boundary contract | `G2` |
| contract adapter implementation | app/blockchain | `wallet-core` | deployed ABI/artifact | `G3` |
| ABI loading and artifact distribution | app/blockchain | release manager | deployed artifact bundle | `G3` |
| event decoding and state mapping | app/blockchain | domain lead | deployed ABI/artifact | `G3` |
| contract read-model ownership | app/blockchain | `wallet-core` | ownership lock | `G3` |

## Cross-Component Handoff Matrix
| Merge Slice | Producer Component | Required Artifact or Version | Consumer Component | Merge Precondition |
|---|---|---|---|---|
| Slice 1 parser/validator | app/frontend | parser contract tests green | app/frontend | ambiguous and wrong-chain cases pass |
| Slice 2 request/receive parity | app/frontend | request/QR parity evidence | app/frontend | visible, copied, and QR values match |
| Slice 2a disambiguation | app/frontend | blocked-state tests green | app/frontend | local-state disambiguation flow proven |
| Slice 3 router contract | blockchain/contracts | router ABI, address placeholder rules, contract tests | `wallet-core`, app/frontend | fixed-fee split and revert behavior approved |
| Slice 4 `wallet-core` direct-send | `wallet-core` | direct-send method contract, typed failures, normalization contract | app/frontend, sponsor service | `wallet-core` integration artifact approved |
| Slice 5 send-form integration | app/frontend | UI parity evidence, blocked-state evidence | app/frontend | no-BNB/fixed-fee UX passes |
| Slice 6 task/bid metadata | app/domain | versioned payload writers/readers | app/frontend, app/blockchain | metadata round-trip passes |
| Slice 7 escrow contract-agnostic routing | app/blockchain | blocked-without-ABI evidence | app/frontend | no contract-specific path leaks before ABI |
| Slice 8 post-ABI escrow binding | blockchain/contracts + app/blockchain | deployed ABI bundle, capability verification report, adapter tests | app/frontend, app/blockchain | capability gate passes and escrow suites are active |
1. Any consuming slice must reference the producing artifact/version explicitly in gate evidence before merge.
2. If a producer artifact changes incompatibly, all dependent slices must be revalidated before protected-target promotion.

## Governance and Ownership
1. Program delivery/governance DRI: Engineering Manager.
2. Wallet/UI/parser DRI: Frontend Lead.
3. Domain model + Nostr tagging DRI: Backend/Domain Lead.
4. Escrow + `@bittasker/wallet-core` integration DRI: Blockchain Lead.
5. Quality gates and CI DRI: QA Lead.
6. Rollout/monitoring/rollback DRI: SRE/Security Lead.
7. Component-level ownership must remain explicit even if local development happens from one workspace with multiple subfolders.

## Decision Log and Release Cut Rules
1. Decision log items:
   - Canonical BSC payment URI format.
   - Final `PaymentContext` schema and defaults.
   - Chain+environment tagging format and migration window.
   - USDT precision/rounding policy.
   - fixed-fee policy and blocked-state messaging.
   - Direct-send fixed fee, treasury address, and minimum send amount.
   - Escrow allowance/approval strategy.
   - `@bittasker/wallet-core` in-house interface contract, ownership, and SLA.
   - Feature-flag rollout/rollback policy.
2. No-cut criteria:
   - Any Gate G3/G4 KPI miss.
   - Any P0 failure or skipped critical BSC test.
   - Any Sev-1/Sev-2 during soak.
   - Rollback drill or env validation failure.

## Phased Implementation Plan

### Phase -1: Prerequisites and Vertical Slice
1. Validate the currently known BSC escrow lifecycle assumptions against app abstractions and record ABI dependency gaps.
2. Implement one feature-flagged vertical slice for direct-send flow first: BSC testnet wallet send through the router with request -> confirm -> pending -> success states and no BNB in UI.
3. Implement one feature-flagged contract-agnostic escrow slice only: BSC testnet task -> bid -> escrow intent preparation, persistence, and UI handoff.
4. Finalize in-house `@bittasker/wallet-core` integration contract:
   - exported method signatures
   - expected errors and retry semantics
   - compatibility matrix between app and core branches
   - merge and release coordination checklist
5. Finalize direct-send router interface and sponsor/paymaster policy:
   - supported token address
   - fixed fee
   - treasury address
   - minimum amount
   - allowed method selectors
6. Finalize configuration matrix and env validation requirements.
7. Define idempotency/retry behavior for escrow create flow.
8. Define versioned Nostr schemas and compatibility rules for task, bid, contract, and status payloads.
9. Prepare deployment handoff checklist:
   - compile/export ABI from the chosen contract build
   - deploy to `bsc-testnet`
   - capture deployed address set and bytecode hash
   - register env/config values for testnet
   - confirm artifact integrity against the accepted source revision
10. Deliverable: Gate G0 passed for direct-send architecture and contract-agnostic escrow work only. Contract-specific escrow completion remains blocked until the contract is deployed and the deployment artifacts are available.

### Phase 0: Data Model and Tagging Foundation
1. Extend types and persisted metadata for `paymentAsset` + `paymentNetwork`.
2. Normalize contract/task/bid tags and query filters for multi-chain.
3. Add schema version fields and migration/compat handling for legacy records with missing fields.
4. Add chain-qualified identifier rules for escrow-linked task, bid, and contract records.
5. Deliverable: domain model compiles, legacy data still readable, and all new writes are versioned.

### Phase 1: Wallet `usdt-bsc` Completion (Direct Payments)
1. Implement token-native amount, precision, and fixed-fee behavior in send form.
2. Integrate the minimal router path for direct wallet-to-wallet sends.
3. Add sponsor-availability, router-allowance, and fixed-fee readiness checks with fail-closed UX.
4. Enable receive/request for `usdt-bsc` in active receive flow and modal URI generation.
5. Update parser/validator behavior for BSC URI and token amount semantics.
6. Add local send-form disambiguation state for ambiguous raw `0x...` input:
   - show a warning that the network could not be detected safely
   - require the user to choose `rBTC on Rootstock` or `USDT on BSC`
   - keep the form blocked and non-payable until one rail is chosen
7. Deliverable: user can request and send USDT on BSC from wallet UI through the router path with correct validation, fixed-fee UX, and no BNB in UI.

### Phase 2: Task and Bid Payment Metadata
1. Add payment asset/network selectors in task budget and bid forms.
2. Persist and query payment metadata via Nostr tags.
3. Update task/bid displays to render selected asset/network consistently.
4. Deliverable: new tasks and bids explicitly carry USDT-BSC compatibility.

### Phase 3: Escrow Execution for USDT on BSC
1. Implement only the contract-agnostic escrow handler boundaries and route selection before ABI lock:
   - asset and network routing
   - versioned contract metadata persistence
   - chain-qualified contract identity
2. Add BSC contract loading path and contract store query updates that do not depend on final ABI or event signatures.
3. Update bid acceptance and status flow to follow selected payment network while keeping final contract invocation behind an ABI gate.
4. Hard stop:
   - do not finalize escrow invocation, event decoding, contract read adapters, or production BSC escrow release logic until the contract is deployed and the deployed ABI/artifact is available and accepted in Gate G0/G3.
5. Deliverable before ABI:
   - app can prepare, persist, and route USDT-BSC escrow intents.
6. Deliverable after ABI:
   - accepting a USDT-BSC bid creates and tracks a BSC USDT escrow.

### Phase 4: History, Monitoring, and UX Hardening
1. Asset-aware transaction history rendering and explorer behavior.
2. Enable real BSC balance history path (service + component).
3. Remove or update “coming soon” states that conflict with shipped BSC support.
4. Add sponsor balance, direct-send failure, and treasury reconciliation monitoring.
5. Deliverable: transaction, sponsor, and balance monitoring is coherent for BSC USDT.

### Phase 5: Test Coverage and Release Hardening
1. Add/upgrade unit tests for wallet send/receive parser/validator BSC paths.
2. Add router contract tests and sponsor policy tests.
3. Add escrow/task/bid integration tests for metadata propagation and BSC routing.
4. Add e2e `usdt-bsc` happy path and failure-mode tests (sponsorship unavailable, router allowance missing, wrong-network URI).
5. Deliverable: release gate with deterministic BSC USDT coverage.

## Delivery Method: TDD and AI Builder Guardrails
1. Every implementation slice must start with failing tests or fixtures before production code changes.
2. Use the smallest vertical slice possible:
   - parser and validator
   - wallet-core preflight
   - router integration
   - UI render branch
   - sponsor service policy
3. Keep changes feature-flagged until the related P0 tests and acceptance evidence are green.
4. Require red -> green -> refactor discipline for AI-assisted edits:
   - write or extend tests first
   - make the smallest code change to pass
   - refactor only with tests still green
5. AI-generated changes must be traceable to:
   - a named requirement in this document
   - one or more tests
   - one owner
6. Contract and service interfaces must be versioned and captured as artifacts in `requirements/` before broad implementation proceeds.
7. Do not let AI-generated code create parallel abstractions when existing wallet, parser, store, or escrow components can be adapted safely.
8. Do not combine router, sponsor, and escrow work in one large patch; land them as separate verified slices.

## Recommended Merge Slices (TDD Order)
1. Slice 1: parser and validator hardening
   - failing tests first: payment-intent parsing, ambiguous QR rejection, wrong-chain rejection
   - production files: parser, validators, QR scanner adapter
2. Slice 2: request and receive parity
   - failing tests first: request modal parity, copied value parity, receive option availability
   - production files: receive form, request modal, QR generation helpers
3. Slice 2a: ambiguous-address disambiguation in send form
   - failing tests first: blocked ambiguous `0x...` scan state, warning message, local rail selection, non-payable until selection
   - production files: `SendPaymentForm.svelte` local UI state only
4. Slice 3: direct-send router contract
   - failing tests first: fixed-fee split, min amount, treasury config, revert cases
   - production files: router contract and contract tests only
5. Slice 4: `wallet-core` BSC preflight and direct-send submit
   - failing tests first: sponsor availability, router allowance, typed failures
   - production files: `BSCWallet`, `WalletManager`, BSC paymaster adapter boundary
6. Slice 5: send form integration
   - failing tests first: fixed-fee rendering, blocked state, no-BNB UX contract
   - production files: send form, wallet store, pending/success screens
7. Slice 6: task and bid metadata
   - failing tests first: task and bid payment metadata persistence and display
   - production files: task store, bid form, tags, Nostr writers/readers
8. Slice 7: escrow contract-agnostic routing
   - failing tests first: route selection, blocked behavior without ABI, metadata persistence
   - production files: escrow routing layer, contract store, loader, bid acceptance flow
9. Slice 8: post-ABI escrow binding
   - failing tests first: adapter binding, event decoding, reconciliation cases
   - production files: contract adapter, escrow execution path, reconciliation logic
10. Every slice must define before merge:
   - feature-flag state
   - green test suite list
   - merge stop condition
   - untouched surfaces that remain out of scope for that slice

## Contract Surface UX Matrix
1. Required surfaces:
   - contract card
   - contract detail or drawer
   - contract timeline
   - mixed contract/history list row
   - blocked pre-ABI escrow state
   - legacy or missing-context contract state
2. Every contract surface must show:
   - asset badge
   - network badge
   - contract lifecycle status
   - correct explorer target for the rail
3. Pre-ABI blocked-state rules:
   - BSC escrow actions remain non-payable and clearly blocked
   - the UI must explain that the escrow contract connection is not ready yet
   - the UI must not imply that a payment was sent or escrow was created
4. Mixed-network rules:
   - Rootstock and BSC contract rows may share lists only if both show explicit badges
   - `resolved-via-precedence` and legacy/missing-context states must be visibly labeled
   - blocked actions must remain blocked even if the record is readable
5. Success and pending rules:
   - pending escrow states must distinguish wallet direct-send from escrow lifecycle progress
   - success states must restate the rail and contract reference clearly

## Contract CTA Matrix
1. `blocked pre-ABI escrow`
   - allowed actions:
     - view details
     - copy contract reference if present
     - retry once deployment artifacts are available
   - blocked actions:
     - create escrow
     - accept
     - release
     - cancel
     - dispute
2. `legacy or missing-context contract`
   - allowed actions:
     - view details
     - open explorer when a safe target exists
   - blocked actions:
     - any contract-changing action until context is normalized safely
3. `pending escrow lifecycle`
   - allowed actions:
     - view status and timeline
     - open explorer
   - blocked actions:
     - duplicate lifecycle actions while the current state is unresolved
4. `created`
   - allowed actions:
     - view details
     - open explorer
     - show the next valid contract action for the user's role
   - blocked actions:
     - actions not valid for the current role or lifecycle state
5. `accepted`, `released`, `cancelled`, `disputed`
   - allowed actions:
     - view details
     - open explorer
     - show role-appropriate next action only when the state machine permits it
   - blocked actions:
     - any lifecycle action not explicitly permitted by the canonical transaction state machine and deployed contract capability gate
6. Card/detail/timeline parity rule:
   - the same state must expose the same allowed and blocked action set across contract cards, details, and timeline surfaces

## Mixed-Network History Policy
1. Default mixed history behavior:
   - merged list sorted by most recent activity
   - explicit asset and network badges on every row
2. Filtering behavior:
   - users must be able to filter by rail without losing access to mixed history
   - filter state must preserve the current route and list context
3. Grouping rules:
   - direct-send router records group separately from escrow lifecycle records
   - sponsor-path failures must not appear as successful payments
4. Legacy and precedence rules:
   - `resolved-via-precedence` records must show a visible explanatory label
   - legacy or missing-context records remain readable but non-actionable
5. Explorer routing:
   - every actionable history row must resolve to the correct chain explorer for that rail

## Cross-Rail Copy Contract
1. Canonical labels:
   - `rBTC on Rootstock`
   - `USDT on BSC`
2. Required concrete copy families:
   - send confirm
   - payment request
   - ambiguous `0x...` warning
   - pending
   - success
   - blocked or failure
3. Copy rules:
   - BSC direct-send copy shows amount, fixed USDT fee, and total debit only
   - Rootstock copy must not inherit BSC fixed-fee language
   - ambiguous-address recovery copy must state that the network could not be detected safely
   - contract-surface copy must distinguish direct send, escrow pending, and escrow blocked states

## Phase Exit KPIs (Gates)
1. Gate G0 Design Lock: all architecture invariants, versioned Nostr schema rules, ABI dependency status, and in-house `wallet-core` integration contract approved.
2. Gate G1 Data Foundation Exit:
   - 100% new writes include `paymentAsset` + `paymentNetwork`.
   - Legacy read success >= 99.5%.
3. Gate G2 Wallet Readiness:
   - USDT-BSC send/receive success >= 98% on testnet sample (n >= 50).
   - Wrong-network send escapes = 0.
   - BNB mentioned as a user requirement in shipped BSC direct-send UI = 0.
   - Send/request/pending/success/history naming and label parity evidence attached.
4. Gate G3 Escrow Readiness:
   - Escrow create/load/accept success >= 95% (n >= 30).
   - Stuck escrow > 24h = 0.
   - Final deployed ABI/artifact and contract address set accepted.
5. Gate G4 Release Readiness:
   - 10 consecutive green CI runs.
   - Critical skipped tests = 0.
   - E2E flake rate < 2%.
6. Gate G5 Production Go/No-Go:
   - 7-day testnet soak completed.
   - Zero Sev-1/Sev-2 incidents.
   - Rollback drill < 15 minutes.

## Testing Plan (Priority)
- P0 (must pass before merge):
1. `src/lib/tests/unit/stores/wallet.store.functions.test.ts` (BSC send wrappers and refresh behavior).
2. `src/lib/tests/components/SendPaymentForm.test.ts` (`usdt-bsc` amount/fee/validation paths).
3. `src/lib/tests/unit/utils/paymentAddressParser.test.ts` (BSC URI and chain-id disambiguation).
4. `src/lib/tests/unit/utils/wallet/transactionHistory.test.ts` (token-aware rendering semantics).
5. `src/lib/tests/unit/api/services/balanceHistory.service.test.ts` (real BSC path behavior).
6. `src/lib/tests/components/QrCodeScanner.test.ts` (QR payload preservation and fail-closed scanner behavior).
7. Router contract test suite (fixed-fee split, min amount, zero-address rejection, immutable config).
8. Sponsor service policy test suite (allowed selectors only, rejected unknown targets, typed failure reasons).
- P1:
1. `src/lib/tests/components/ReceivePaymentForm.test.ts` (new `usdt-bsc` receive flow).
2. `src/lib/tests/components/PendingTransactionScreen.test.ts` (BSC explorer/status rendering).
3. `src/lib/tests/unit/utils/wallet/contractRegistry.test.ts` (BSC env ingestion).
4. `src/lib/tests/components/bidding/BidAcceptanceForm.test.ts` (network-aware acceptance flow).
5. `src/lib/tests/components/PaymentRequestModal.test.ts` (QR payload matches visible/copied network-specific request).
6. `wallet-core` BSC preflight and direct-send submission tests.
- P2:
1. E2E wallet send + request roundtrip for `usdt-bsc`.
2. E2E task->bid->acceptance flow with USDT-BSC escrow path after ABI acceptance.
3. E2E ambiguous raw `0x...` QR scan must block payment progression.
4. E2E direct-send blocked state when sponsor policy is unavailable.

## CI and Test Activation Requirements
1. Move payment-critical tests out of `_pending` into active CI paths.
2. Unskip all critical BSC tests in:
   - `SendPaymentForm`
   - `ReceivePaymentForm`
   - `BidAcceptanceForm`
   - router contract suites
   - sponsor policy suites
   - BSC escrow routing/integration suites
3. Add BSC E2E smoke tests to required merge gates.
4. Required CI gates:
   - `npm run test:ci`
   - escrow integration suite
   - BSC e2e smoke suite
5. Coverage thresholds:
   - Global: lines/functions/statements >= 85%, branches >= 80%.
   - Critical BSC payment files: lines/functions/statements >= 90%, branches >= 85%.
6. Skipped test thresholds:
   - Critical payment suites: 0 skipped.
   - Entire CI set: <= 2 skipped and none payment-critical.
7. Flake threshold:
   - BSC e2e suites must pass with 0 retries used.
8. Mandatory release-gate evidence pack:
   - Maintain `requirements/usdt-bsc-gate-evidence-ledger.md`.
   - CI must fail merge/release if any G0-G5 gate is missing required evidence fields.
9. Contract-dependent escrow suites must remain in a planned-but-blocked state until ABI acceptance; they must not be silently skipped once Gate G3 is targeted.
10. `G3` requires an active failure-injection suite for escrow and sponsor-path divergence cases.
11. No BSC payment-critical test may remain in `_pending` once G2 is targeted for pass.
12. Required failure-injection scenarios for `G3`:
   - approval success plus escrow create failure
   - dropped or replaced transaction during escrow creation
   - duplicate sponsor request or idempotency collision
   - sponsor policy acceptance followed by submission failure

## Protected Branch Policy
1. Protected release targets are:
   - `main`
   - `release/*`
2. Protected release targets must not merge or ship with any `blocked` gate.
3. Non-release feature branches may carry `blocked` gates only for documented external prerequisites such as deployment artifacts.
4. Protected release targets require:
   - unit suite
   - integration suite
   - BSC e2e smoke
   - router contract suite
   - sponsor policy suite
   - ledger validation
5. Feature branches may keep contract-dependent gates blocked, but they must still pass all active P0 tests and blocked-behavior tests before merge.
6. No override of required checks is permitted without:
   - named Engineering Manager approval
   - named SRE or Security approval
   - explicit ledger note recording rationale and expiry

## Risks and Mitigations
1. Risk: wrong-network sends from ambiguous `0x` addresses.
   - Mitigation: forbid raw unqualified EVM QR requests, enforce chain-qualified URI generation, and block ambiguous scanner results.
2. Risk: amount mismatch due to legacy BTC/sats conversions.
   - Mitigation: token-native decimal handling and shared format helpers for USDT.
3. Risk: sponsor path unavailable or misconfigured at runtime.
   - Mitigation: startup validation, typed sponsor health checks, and fail-closed blocked state in wallet UI.
4. Risk: direct-send router overreaches in scope or gas usage.
   - Mitigation: keep router single-purpose, stateless in send path, and bounded to one token/fixed-fee policy.
5. Risk: escrow divergence between RSK and BSC paths.
   - Mitigation: explicit handler abstraction with shared interface and chain-specific modules.
6. Risk: metadata/query fragmentation in Nostr tags.
   - Mitigation: single normalized chain-env tag scheme with backward-compatible readers.
7. Risk: partial rollout confusion.
   - Mitigation: gate by feature flag until Phase 3 + P0 tests are green.
8. Risk: plan drifts into contract-specific assumptions before ABI exists.
   - Mitigation: enforce ABI hard-stop rules, record ABI status in G0, and treat contract-facing code as provisional until ABI acceptance.

## Risk Register (Probability x Impact)
1. Ambiguous address routing to wrong chain: High x Critical.
   - Mitigation: chain-qualified URI enforcement + ambiguous raw `0x` rejection.
2. USDT precision/units mismatch: High x High.
   - Mitigation: token-native amount model + parser round-trip tests.
3. False-positive success before confirmation: High x High.
   - Mitigation: confirmed-state monitoring, remove timer-only success assumption.
4. Sponsor service rejects or misroutes legitimate direct-send calls: Medium x High.
   - Mitigation: method-allowlist tests, staging smoke checks, and typed policy errors exposed to UI.
5. Fixed fee or minimum amount policy drifts from app display: Medium x High.
   - Mitigation: single source-of-truth config, contract tests, and UI parity assertions.
6. Escrow remains RSK-only in critical path: High x Critical.
   - Mitigation: explicit BSC-USDT escrow handler + integration tests.
7. Config or tag mismatch across environments: Medium x High.
   - Mitigation: fail-fast env validation + normalized chain-env tag migration.
8. Monitoring blind spots for BSC history/reconciliation: Medium x Medium.
   - Mitigation: enable BSC history path and reconciliation alerts.
10. Incident response immaturity at rollout: Medium x High.
   - Mitigation: runbooks, paging, rollback drill before launch.
11. ABI or deployed artifact differs from provisional assumptions: High x Critical.
   - Mitigation: block final escrow wiring until ABI/artifact acceptance is recorded and reviewed.
12. Token decimal mismatch between product intent and `wallet-core` config: High x Critical.
   - Mitigation: require G0 token-config reconciliation and on-chain decimal verification before any amount-model sign-off.

## Operational and Security Go-Live Gates
1. Enforce chain-qualified BSC payment requests; reject ambiguous `0x...` where BSC payment intent is required.
2. Enforce QR/request parity: QR payload, visible address/request text, and copied request text must match exactly.
3. Enforce token-native USDT amount handling using the accepted token decimals in send, receive, parser, and history paths.
4. Enforce fixed-fee direct-send readiness checks for USDT send and escrow creation; no BNB user fallback is permitted.
5. Enforce direct-send router parity: configured fixed fee, treasury, and minimum amount must match contract and app display.
6. Enforce chain+environment tag normalization in persisted/query metadata.
7. Enforce startup/CI env validation for required BSC variables.
8. Require BSC history, sponsor health, and treasury reconciliation monitoring to be enabled and alertable.
9. Require P0/P1 tests active in CI with no skipped critical BSC acceptance tests.
10. Require feature flag and rollback runbook before production enablement.
11. Require 7-day BSC testnet soak with no Sev-1/Sev-2 incidents.
12. Require staged canary rollout (`internal -> 5% -> 25% -> 100%`) with auto-rollback thresholds.
13. Require post-canary reconciliation showing zero unexplained tx/escrow divergence.

## Sponsor-Service Security Review Artifact
1. `G2` and `G3` must reference a dedicated sponsor-service security review artifact.
2. Required contents:
   - request canonicalization rules
   - chain, target, selector, token, and fixed-fee policy enforcement
   - replay and idempotency model
   - signer custody model and signer-class boundaries
   - sponsor balance handling and treasury separation
   - outage and degraded-service behavior
   - reconciliation assumptions and tolerances
   - residual risks and explicit accepted risks
3. `G2` may not pass without:
   - policy test results
   - replay/idempotency test results
   - emergency disable verification
4. `G3` may not pass without:
   - signer-security evidence attached
   - sponsor-service security artifact signed by Engineering and Security

## Implementation Confidence (Pre-Review Baseline)
- Baseline confidence: 0.76
- Rationale:
1. Wallet/BSC primitives and partial UI already exist.
2. Major complexity is in escrow and metadata normalization, not greenfield wallet plumbing.
3. Confidence depends on resolving chain/env tag strategy and completing BSC escrow contract path.
4. Direct-send complexity is moderate because the chosen architecture stays with EOA + in-house sponsor + minimal router instead of a broader delegated-execution model.

## Gate DoD Contracts
1. `G0` passes only if:
   - architecture invariants are approved,
   - `wallet-core` integration contract is approved,
   - sponsor-service interface contract is approved,
   - versioned Nostr schema rules are approved,
   - normalized transaction and read-model contract is approved for direct-send records,
   - canonical escrow-linked identifier format and mixed-chain reader behavior are approved,
   - accepted token address and decimals are reconciled between product intent, `wallet-core`, and on-chain verification,
   - final ownership is locked for post-ABI adapter, ABI loading, event decoding, and read-model mapping,
   - ABI dependency status is recorded explicitly as either `blocked` or `approved`,
   - named approvers and dated evidence links exist in the ledger.
2. `G1` passes only if:
   - `paymentAsset` and `paymentNetwork` write-path coverage is evidenced,
   - legacy compatibility evidence is attached.
3. `G2` passes only if:
   - wallet send, receive, and request BSC evidence is attached,
   - wrong-network escape evidence is zero in the attached report,
   - sponsor-service security review artifact is attached,
   - contract-surface UX matrix evidence is attached,
   - mixed-network history policy evidence is attached.
4. `G3` passes only if:
   - escrow state machine artifact is attached,
   - compensation playbook is attached,
   - failure-injection report is attached,
   - final deployed ABI/artifact and contract address set are accepted,
   - `SecurePaymentContract` capability gate evidence is attached.
5. `G4` passes only if:
   - critical CI suites are active and hard-blocking,
   - required green-run evidence is attached,
   - skipped critical suites count is zero.
6. `G5` passes only if:
   - soak, rollback, and reconciliation evidence are attached,
   - dual approval exists from Engineering and SRE/Security.

## Confidence Formula
1. Use one confidence formula for all audits:
   - `confidence = 0.30 * gate_completion + 0.30 * evidence_completeness + 0.20 * verification_strength + 0.20 * risk_control_coverage`
2. Each component is scored from `0` to `100`.
3. Unconditional `90%+` confidence requires all four components to be `>= 90`.
4. Conditional confidence claims must state which gates or evidence remain open.

## Signer Security Requirements
1. Define signer custody model (`KMS`, `HSM`, or equivalent).
2. Prohibit raw production private keys in plaintext environment variables.
3. Separate signer classes:
   - sponsor signer
   - treasury or admin signer
   - contract deployer or upgrade signer
   - release operator or emergency-control signer
4. Signer classes must use separate custody domains; treasury/admin and emergency-sensitive actions require dual control.
5. Define key rotation cadence, RBAC boundaries, and break-glass process.
6. Require transaction-policy enforcement for each signer class:
   - approved target contracts
   - approved method families
   - emergency pause authority boundaries
7. Attach signer-security evidence for `G3` through `G5`.

## Chain Finality Policy
1. Define minimum confirmations for send, escrow create, and release actions.
2. Define reorg handling and escalation thresholds.
3. Define replacement transaction and nonce management policy for retries.
4. Attach finality-policy test evidence for `G3` through `G5`.

## Canary Threshold Matrix
1. Define numeric canary abort thresholds for:
   - error rate,
   - stuck transaction rate,
   - escrow failure rate,
   - router-policy mismatch rate.
2. Define numeric operational thresholds for:
   - minimum sponsor balance floor,
   - sponsor rejection-rate alert threshold,
   - treasury reconciliation tolerance,
   - direct-send submission failure alert threshold.
3. Define auto-stop and rollback triggers with on-call escalation path.
4. Attach threshold-matrix evidence before `G5` pass.

## Requirements Traceability
1. Maintain a matrix from:
   - requirement -> tests -> gate -> evidence.
2. Any unmapped critical requirement blocks `G4` and `G5`.

## Mixed-Source Read Precedence Policy
1. For records that contain both tags and payload metadata, precedence is:
   - explicit versioned payload fields
   - normalized compatibility-adapter fields
   - legacy tags
   - legacy inferred defaults
2. If two sources disagree on `paymentAsset`, `paymentNetwork`, or escrow-linked identifier:
   - prefer the highest-precedence source above
   - mark the record as `resolved-via-precedence`
   - include the disagreement in compatibility evidence
3. If no source yields a safe chain-qualified interpretation:
   - the record remains readable as legacy content
   - contract-specific actions must be blocked
4. Legacy records with partial payment context must display an explicit legacy/missing-context label until normalized.

## QR and Payment Intent Safety Contract
1. Scanner acceptance rules:
   - accept chain-qualified EVM payment intents with explicit scheme or chain id
   - accept valid RSK EIP-1191 checksummed addresses as RSK-only direct intents
   - reject or force explicit user disambiguation for plain raw `0x...` addresses
2. Receive/request generation rules:
   - BSC direct payment requests must be emitted as `bsc:` or chain-id-qualified EVM URIs
   - RSK direct payment requests must be emitted as `rsk:` or chain-id-qualified EVM URIs, with visible EIP-1191 checksummed address where supported
   - plain raw `0x...` QR payloads are forbidden for direct BSC/RSK requests
3. UI safety rules:
   - every payment request must show asset and network badges beside the QR
   - every payment request must show warning copy that only the displayed asset/network may be sent
   - copied request string must exactly match the QR payload
4. Failure behavior:
   - ambiguous EVM QR scans must not auto-populate a payable form
   - unsupported or unqualified Ethereum-style URIs must hard-fail with network-specific guidance

## Canonical Nostr Schema Appendix
1. Required task payload fields:
```json
{
  "schemaVersion": "task.v2",
  "taskId": "task:<d-tag>",
  "paymentAsset": "USDT",
  "paymentNetwork": "bsc-testnet",
  "amountAtomic": "1000000"
}
```
2. Required encrypted bid payload fields:
```json
{
  "schemaVersion": "bid.v2",
  "bidId": "bid:<event-id>",
  "taskRef": "task:<d-tag>",
  "paymentAsset": "USDT",
  "paymentNetwork": "bsc-testnet",
  "amountAtomic": "1000000"
}
```
3. Required contract metadata fields:
```json
{
  "schemaVersion": "contract.v2",
  "contractRef": "contract:bsc-testnet:<external-id>",
  "taskRef": "task:<d-tag>",
  "bidRef": "bid:<event-id>",
  "paymentAsset": "USDT",
  "paymentNetwork": "bsc-testnet"
}
```
4. Required status event fields:
```json
{
  "schemaVersion": "status.v2",
  "contractRef": "contract:bsc-testnet:<external-id>",
  "status": "accepted",
  "parentRef": "task:<d-tag>"
}
```
5. Canonical identifier rules:
   - task references use `task:<d-tag>`
   - bid references use `bid:<event-id>`
   - contract references use `contract:<chain-env>:<external-id>`
   - status events must always use canonical refs, never raw legacy ids alone

## Business Traceability Matrix
| Domain Requirement | Gate | Ledger Field | Required Evidence | Blocking Dependency |
|---|---|---|---|---|
| versioned schema lock | `G0` | `Schema Approval Status` | schema appendix approval | none |
| canonical identifier format | `G0` | `Schema Approval Status` | canonical identifier approval note | none |
| mixed-chain reader policy | `G0`, `G1` | `Schema Approval Status` | precedence policy approval | none |
| metadata propagation | `G1`, `G2` | CI evidence fields | traceability report | versioned schema lock |
| migration compatibility | `G1`, `G2` | CI evidence fields | compatibility adapter evidence | canonical identifier lock |

## Nostr Tag Mapping and Query Contract
| Object | Event Kind | Mandatory Tags In Order | Canonical Refs In Tags | Query Tags | Parent-Link Rule |
|---|---|---|---|---|---|
| task | `31000` (`KINDS.TASK_CREATION`) | `d`, `p`, `pow`, `S` | `task:<d-tag>` via `d` | `#d` | n/a |
| encrypted bid | `30007` (`KINDS.BIDS`) | `d`, `t`, `p`, `s`, `m`, `y` | `task:<d-tag>` via `t`; `bid:<event-id>` lives in payload and event id | `#t`, `#p`, `#m`, `#s` | bid must point to canonical task ref |
| bid status | `30008` (`KINDS.BID_STATUS`) | `e`, `p`, `t`, `s`, `m` | `bid:<event-id>` via `e`; `task:<d-tag>` via `t` | `#e`, `#t`, `#p`, `#m`, `#s` | status must reference canonical bid event id |
| contract metadata | `30006` (`KINDS.CONTRACT`) | `d`, `t`, `p`, `p`, `n`, `v`, `s`, `m` | `contract:<chain-env>:<external-id>` via `d`; `task:<d-tag>` via `t` | `#d`, `#t`, `#p`, `#n`, `#v`, `#m`, `#s` | contract must point to canonical task ref |
| contract status | `31006` (`KINDS.CONTRACT_STATUS`) | `e`, `r`, `p`, `s`, `v`, `m` | `contract:<chain-env>:<external-id>` via `r`; contract event id via `e` | `#e`, `#r`, `#p`, `#v`, `#m`, `#s` | parent ref must be canonical, never raw legacy id alone |
1. Required query/indexing rule:
   - every new write must include canonical refs in tags for queryability, even when the payload repeats them.
2. Required legacy-compat rule:
   - compatibility adapters may infer missing canonical refs for reads, but inferred refs must never be written back as if they were original source data.
3. Payment metadata rule:
   - `paymentAsset`, `paymentNetwork`, and `amountAtomic` remain mandatory payload fields for versioned objects.
   - where network-specific indexing is required, `n` is the canonical network tag on contract-family events and any future task/bid schema extension must preserve the literal tag key once introduced.

## QR Parsing and URI Support Contract
1. Required accepted direct-payment formats:
   - `bsc:0x...`
   - `rsk:0x...`
   - `ethereum:0x...@56`
   - `ethereum:0x...@97`
   - `ethereum:0x...@30`
   - `ethereum:0x...@31`
2. Required ambiguous or unsupported failures:
   - plain raw `0x...` with no proven network
   - `ethereum:0x...` with no chain id
   - chain ids outside the supported BSC/RSK set
3. Required interpretation rule:
   - the parser must classify only when the scanned data itself proves the target network safely
   - otherwise it must block payment progression until the user resolves the ambiguity explicitly

## Glossary
1. `accepted address set`: the approved contract/token addresses per environment used for deployment-bound flows.
2. `accepted token config`: the approved token address/decimals/symbol configuration reconciled across plan, `wallet-core`, and chain verification.
3. `chain-qualified identifier`: an identifier that carries enough chain/environment context to avoid ambiguous contract or payment interpretation.
4. `compatibility adapter`: the reader/writer layer that maps legacy payloads into the current normalized schema.
5. `mixed-chain reader policy`: the rule set for rendering and reconciling records from both RSK and BSC eras in the same product surfaces.
6. `payment intent`: the chain-qualified request/send representation containing asset, network, address, amount, and token metadata.

## Contract-Agnostic Deliverables Before ABI
1. Wallet `usdt-bsc` send, receive, and request flow.
2. Token-native amount parsing, validation, and display rules.
3. Versioned Nostr task, bid, contract, and status schemas.
4. Chain and environment tag normalization plus compatibility readers.
5. BSC contract store and query model cleanup that does not depend on final ABI or event decoding.
6. `wallet-core` BSC history normalization contract and preflight API design.

## ABI-Gated Deliverables After ABI
1. Final contract adapter implementation.
2. Final event decoding and contract read-model mapping.
3. Final funding or approval path integration.
4. Production escrow reconciliation against the deployed contract's real state and event model.

## Evidence Provenance
1. Gate evidence must include:
   - artifact id or hash,
   - capture timestamp,
   - source system.
2. Gate decisions must be append-only. Prior pass or fail records must not be destructively overwritten.

## Final ABI Dependency Notice
Final app integration with the BSC payment contract cannot be completed until the final deployed ABI/artifact, contract addresses, and version/hash acceptance record are available. Until then, escrow invocation, event and error decoding, token approval or funding behavior, any delegated transaction behavior not proven by the deployed interface, and contract read-path wiring remain provisional and must not be treated as release-ready. The next AI or engineer working this plan should stop at the ABI gate and notify the user that the contract ABI is required before the remaining contract-specific implementation can continue.

## Current Planning Confidence (Authoritative)
Earlier confidence sections in this document are historical snapshots only and must not be used as the current sign-off baseline.
1. This section is the single current scoring baseline for review.
2. `planning-artifact confidence` scores the quality of the plan and ledger only.
3. `dependency implementation readiness` is reported separately and must not be reused as a plan-quality score.
4. This section does not claim implementation readiness, evidence completeness, or external deployment readiness.
- Architecture/integration plan quality: `97%`
- UX plan quality: `96%`
- Security/abuse-resistance plan quality: `95%`
- Delivery/TDD/governance plan quality: `95%`
- Planning-artifact composite confidence (simple average across lanes): `95.75%`
- Dependency implementation readiness: `separate and lower until wallet-core delivery, deployment, and evidence population occur`
- Unconditional `95%+` planning-artifact status: `Reached`

### Wave 5 Remaining Gaps
1. Material plan-only gaps: `none`.
2. Remaining gaps are execution-side only:
   - `wallet-core` implementation deliverables still need to be built
   - gate evidence still needs to be populated
   - router contract and in-house sponsor service still need to be built and verified
   - deployed contract ABI/artifact and accepted address set are still required before contract-specific escrow work can continue
3. `G0` records ABI dependency status; `G3+` require approved deployed ABI/artifact and accepted address set before contract-specific gates can pass.

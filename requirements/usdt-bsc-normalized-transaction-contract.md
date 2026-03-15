# USDT-BSC Normalized Transaction And State Machine Contract

## Normalized Record Families
- direct-send router submission
- direct-send router confirmation
- sponsor-path rejection
- escrow create intent
- escrow lifecycle transition

## Required Fields
- `recordType`
- `chainId`
- `chainEnv`
- `assetSymbol`
- `tokenAddress`
- `sender`
- `recipientOrEscrowRef`
- `amountAtomic`
- `fixedFeeAtomic`
- `txHashOrSubmissionRef`
- `lifecycleStatus`
- `confirmationState`
- `sourceOwner`
- `productMetadata`

## Source Precedence Rules
- Confirmed on-chain receipts and contract reads are authoritative for final state.
- Sponsor-service lifecycle is authoritative for pre-confirmation submission progress.
- `wallet-core` normalized chain data is authoritative for tx-level pending / confirmed / failed state before contract-read enrichment exists.
- App enrichment may add labels and grouping only.

## Conflict Rules
- Confirmed chain state overrides sponsor-service pre-confirmation state.
- Contract-read escrow state overrides tx-derived lifecycle labels once ABI-backed read models exist.
- Records with unresolved context remain readable but non-actionable.

## Direct-Send State Machine
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

## Escrow State Machine
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

## Current Implementation Notes
- App-side direct payment requests now generate chain-qualified `rsk:` and `bsc:` payloads.
- Raw ambiguous EVM addresses are blocked at parser / validation time.
- BSC escrow lifecycle states remain provisional until the deployed contract artifact is accepted.

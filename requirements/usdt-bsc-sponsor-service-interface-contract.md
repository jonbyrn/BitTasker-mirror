# USDT-BSC Sponsor Service Interface Contract

## Artifact Metadata
- Artifact status: draft
- Primary owner: Blockchain Platform
- Secondary owner: Frontend Lead
- Approval date: pending

## Request Schema
- `signedRawTransaction`
- `signedRawTransactionHash`
- `chainId`
- `expectedTargetContract`
- `expectedMethodSelector`
- `expectedTokenAddress`
- `requestExpiry`
- `correlationId`

## Response Schema
- `status`: `accepted` or `rejected`
- `failureCode`
- `submissionId`
- `txHash`
- `bundleReference`
- `lifecycleState`

## Signed Payload Format
- The app never sends unsigned intents to the sponsor service.
- `wallet-core` signs the raw EOA transaction first.
- The signed raw transaction hash is the sponsor-service idempotency key.

## Gas-Field Ownership Rules
- App owns user intent only.
- `wallet-core` owns transaction construction.
- Sponsor service owns gas submission policy and any internal replacement logic.
- User-facing BSC flows must never expose BNB funding requirements.

## Submission Lifecycle States
- `submission_pending`
- `submitted`
- `chain_pending`
- `confirmed`
- `submission_failed`
- `chain_failed`
- `expired`

## Retry, Replacement, Cancel, And Expiry Rules
- Retry must preserve the same logical `correlationId`.
- Duplicate `signedRawTransactionHash` requests must be idempotent.
- Expired requests are rejected without fallback.
- Submission replacement must keep reconciliation linkage to the original logical operation.

## Typed Failure Codes And UI Semantics
- `SPONSOR_UNAVAILABLE`: show temporary-unavailable blocked state.
- `POLICY_REJECTED`: show unsupported payment-path blocked state.
- `REQUEST_EXPIRED`: instruct retry.
- `DUPLICATE_REQUEST`: safe retry path, not a success state.
- `SUBMISSION_FAILED`: show failed submission, not sent payment.

## Exact `wallet-core` Methods Consumed By The App
- `buildDirectPaymentIntent(...)`
- `preflightBscDirectSend(...)`
- `signBscDirectSendTransaction(...)`
- `submitSignedBscTransactionViaSponsor(...)`
- `getBscSponsorStatus(...)`

## Ownership Rules
- App owns request creation UX and blocked-state rendering.
- `wallet-core` owns signing and typed sponsor request construction.
- Sponsor service owns policy validation, idempotency, submission, and lifecycle reporting.

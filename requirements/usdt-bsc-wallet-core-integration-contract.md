# USDT-BSC `wallet-core` Integration Contract

## Artifact Metadata
- Artifact status: draft
- Primary owner: Blockchain Lead
- Secondary owner: Frontend Lead
- Approval date: pending

## Transaction Normalization Contract
- Exported surface: normalized BSC direct-send and chain-derived transaction records consumed by BitTasker wallet history.
- Input schema: raw BSC receipts, token transfers, sponsor submission metadata.
- Output schema:
  - `recordType`
  - `chainId`
  - `chainEnv`
  - `assetSymbol`
  - `tokenAddress`
  - `sender`
  - `recipient`
  - `amountAtomic`
  - `fixedFeeAtomic`
  - `txHash`
  - `lifecycleStatus`
  - `confirmationState`
  - `sourceOwner`
- Failure behavior: return explicit normalization failure codes, never silently coerce token transfers into sats-only rows.
- Related gate: `G0`, `G2`

## Payment-Intent Helper Contract
- Exported surface:
  - chain-qualified URI builders for Rootstock and BSC
  - parser-safe address normalization helpers
  - token-native amount helpers for BSC USDT intents
- Input schema: raw address or URI, expected rail, optional amount, optional memo.
- Output schema: canonical payment-intent string plus parsed `network`, `address`, `amount`, and `memo`.
- Failure behavior: ambiguous raw `0x...` input must fail closed unless it is provably RSK-only.
- Related gate: `G0`, `G2`

## Validation Helper Contract
- Exported surface:
  - chain-aware BSC / RSK payment-intent validation
  - wrong-chain rejection
  - RSK-safe plain-address validation
- Input schema: payment-intent string or raw candidate address.
- Output schema: `isValid`, `network`, `normalizedAddress`, `isAmbiguous`, `errorCode`.
- Failure behavior: return typed ambiguity and unsupported-chain results rather than generic invalid-address failures.
- Related gate: `G0`, `G2`

## Preflight API Contract
- Exported surface:
  - direct-send sponsor availability
  - fixed-fee readiness
  - router allowance status
  - sender balance status for `recipientAmount + fixedFee`
  - chain id / token-config match
- Input schema:
  - sender
  - recipient
  - recipient amount atomic
  - token address
  - router address
  - chain id
- Output schema:
  - `isReady`
  - `failureCode`
  - `failureMessage`
  - `allowanceAtomic`
  - `requiredAllowanceAtomic`
  - `totalDebitAtomic`
  - `sponsorAvailable`
- Failure behavior: fail closed with typed reasons; never instruct the user to acquire BNB.
- Related gate: `G0`, `G2`, `G3`

## Version Compatibility Matrix
| Producer | Consumer | Expected version | Status |
|---|---|---|---|
| local app workspace | `@bittasker/wallet-core` | next unpublished draft | pending |
| `wallet-core` direct-send preflight | app wallet UI | same branch family | pending |
| `wallet-core` transaction normalization | app history rendering | same branch family | pending |

## Failure Codes And Error Semantics
- `AMBIGUOUS_EVM_ADDRESS`
- `WRONG_CHAIN`
- `UNSUPPORTED_CHAIN`
- `SPONSOR_UNAVAILABLE`
- `ROUTER_ALLOWANCE_MISSING`
- `INSUFFICIENT_USDT_BALANCE`
- `TOKEN_CONFIG_MISMATCH`
- `POLICY_REJECTED`

## Ownership And Escalation
- `wallet-core` owns signing, chain reads, normalization, and preflight semantics.
- BitTasker owns local blocked-state rendering, request generation UX, and product-specific history labels.
- Sponsor service owns request policy, idempotency, and submission lifecycle.

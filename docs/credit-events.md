# BitTasker Credit Nostr events

Sandbox kinds. They are parameterized replaceable (30000–39999) except where noted. Documented for the Phase 1 beta. Not published as a NIP.

The content is public JSON so a lender can read a request without a shared key. BitTasker does not store a copy on a server.

## Kinds

| Kind | `m` tag | Who signs | When |
| --- | --- | --- | --- |
| 31140 | `advance_request` | Tasker (worker) | Escrow has at least one confirmation and the policy cap is above zero. |
| 31141 | `advance_offer` | Lender | A request is open. The lender is not the tasker. |
| 31142 | `advance_accept` | Tasker | The tasker accepts that offer. |
| 31143 | `advance_settled` | Hirer in the test ledger | Job completed (`repaid`) or cancelled (`defaulted`). |
| 31144 | `job_receipt` | Each party, one event | A completed contract. It counts only when both events exist. |

Reviews stay on the existing kind **6430**. A credit score reads those events. It does not invent a second review kind.

`src/lib/utils/constants/kinds.ts` is the source of the numbers.

## Tags

| Tag | Value |
| --- | --- |
| `m` | Event type above. |
| `n` | `signet`, `regtest`, or `mock`. Anything else is rejected. |
| `d` | Advance id, or the contract id on a job receipt. |
| `t` | Job id, when there is one. |
| `e` | Escrow id or contract id. |
| `p` | The other party. |

## Content

JSON, at most 8 KB. The `type` field must match the kind. Amounts are integer cents.

`advance_request`, `advance_offer`, and `advance_accept` carry `advanceId`, `jobId`, `escrowId`, `advanceCents`, `feeCents`, and `network`.

`advance_settled` adds `outcome`: `repaid` or `defaulted`. A client must not treat this event as `funded`. Funded comes from a confirmation on the funding txid, checked locally, not from a status string in the content.

`job_receipt` carries `contractId`, `role` (`tasker` or `taskee`), and `counterparty`.

A kind 6430 review used for the score is `{ "type": "review", "rating": { "overallRating": 1-5 }, "escrowId": "..." }` with a `p` tag of the tasker. That shape matches the plain reviews the app already signs.

## Verification

`creditEventVerified` rebuilds a plain event and runs `verifyEvent`. A signature that does not match is ignored. A kind that does not match `type` is ignored.

nostr-tools stores `Symbol(verified)` on an event it just signed, and that symbol is enumerable. Copying the object with a spread keeps the flag even if the signature bytes change. Credit verification does not trust that flag. See fix list item 200.

## What is not an event

The jump from "broadcast" to "funded" is not a Nostr kind. The client reads confirmations from the test ledger or from Esplora. Zero confirmations stays **Waiting for confirmation**.

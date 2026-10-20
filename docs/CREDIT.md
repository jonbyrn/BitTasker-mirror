# BitTasker Credit (Phase 1)

Sandbox beta on `sandbox/rgb-wasm-phase0` (https://rgb.bittasker.com). This is not a production loan product. It does not run on mainnet, it does not take custody of funds, and it does not collect identity documents.

## What it is

An escrow-backed USDT-on-RGB advance for a tasker (the worker). A hirer has already funded a job escrow. The tasker's Nostr reputation (completed contracts signed by both parties, plus reviews) sets the largest advance. A lender sends that advance. When the job is completed and the escrow releases, the lender is paid first (advance + fee) and the tasker receives the remainder. If the job is cancelled or disputed, the hirer is refunded the full escrow and the lender is not repaid. The lender's loss is the advance they already sent.

BitTasker is the software that matches the three parties and checks signatures. It does not hold keys, it does not hold the USDT, and it is not the lender.

## Feature flag

`VITE_CREDIT_ENABLED` defaults to off. `isCreditEnabled()` is the only reader. The sandbox deploy sets it true in `.gitlab-ci.yml` (`deploy-sandbox` only) and records the same value under `[env.sandbox.vars]` in `wrangler.toml`. Staging and production do not set it.

The screen is labeled **Beta test**. On the production hostname the test ledger stays closed even if the flag is on. `?creditMock=1` opens the test ledger in local dev, and on `rgb.bittasker.com` when the flag is on.

## Components

| Piece | Role |
| --- | --- |
| `src/lib/credit/reputation.ts` | Pure score from completed-job receipts and reviews. |
| `src/lib/credit/policy.ts` | Percent, fee, and dollar cap from `policy.config.json`. |
| `src/lib/credit/advance.ts` | State machine. Illegal moves throw. |
| `src/lib/credit/events.ts` | Signed Nostr events. Invalid signatures are dropped. |
| `src/lib/credit/flow.ts` | Test-ledger sequence used by the screens and the tests. |
| `src/lib/rgb/` | Transfer adapter. Mock ledger for tests. Utexo adapter refuses a partial send and does not broadcast. |
| `src/lib/escrow/payoutSplit.ts` | Lender first, tasker remainder, or a full refund to the hirer. |
| `src/lib/credit/oracle.ts` | Simulated BTC/USD quote. The advance flow does not call it. |
| `src/lib/credit/phase2/collateralLoan.ts` | Taproot loan terms check. Returns `not-implemented`. |
| `/credit` | Tasker eligibility and the test-ledger controls. |
| `/credit/offers` | Lender view of an open request. |
| `CreditAdvanceBadge` | "Credit beta" link on the task and contract screens when the flag is on. |

## Reputation and policy

A contract counts once, and only when both the tasker and the hirer have a valid signature and each names the other. A review counts when its signature is valid, the rating is 1–5, and the reviewer is not the tasker. The score is a deterministic 0–100 figure. The percent does not follow that score upward: zero completed contracts stay at 0% even if a caller passes a high score.

Default tiers in `policy.config.json`:

| Completed contracts | Rating | Max advance |
| --- | --- | --- |
| 0–4 | any | 0% |
| 5–19 | any | 20% |
| 20–49 | any | 40% |
| 50+ | average at least 4.8 | 60% |

The fee is 100 bps (1%) of the advance, paid to the lender out of the escrow. The advance is at least $10 and at most $1,000. If the percent of the escrow is under $10, the advance is $0. Repayment (advance + fee) is never larger than the escrow. Amounts are integer cents.

The test ledger ships a tasker with 20 co-signed jobs and a 5.0 rating, against a $100 escrow, so the cap is $40.00 and the fee is $0.40.

## State machine

`requested → offered → accepted → funded → repaid`

`funded` can also go to `defaulted`. `requested`, `offered`, and `accepted` can go to `cancelled` until a transfer has been broadcast.

`funded` is a separate step from broadcast. `note-funding` stores the txid and leaves the status at `accepted`. The screen says **Waiting for confirmation**. `confirm-funding` moves to `funded` only when that same txid has at least one confirmation. An escrow that the advance is sized against follows the same rule: zero confirmations means it is not funded.

## Payout

On completion the split is:

- lender: advance + fee
- tasker: escrow − (advance + fee)

Those two amounts add up to the escrow. The advance the lender already sent is what they are paid back. The tasker's earlier advance plus the remainder is the escrow minus the fee.

On cancel or dispute:

- hirer: the full escrow
- lender: nothing from the escrow
- the advance they sent is recorded as a loss

## Partial USDT sends

rgb-lib leaves the change on the spent coin on a partial USDT send (`docs/UTEXO_PARTIAL_SEND_ISSUE.md`, fix list 201). This beta does not depend on that working.

- A transfer is built only when the amount is the entire coin (`assessFullAllocation`).
- The Utexo adapter does not call `onchainSend`. Live broadcast throws.
- A completion split of one escrow coin into two recipients sets `partialSendRequired`. The live adapter returns `partial-send-blocked` and does not mark the advance repaid.
- The test ledger settles that split in memory so the screens and tests can show the amounts. It is labeled as a test ledger and it is not an RGB transaction.
- A cancellation refund is one whole coin back to the hirer, which does not need a split.

Until change outputs are safe, a real repayment needs either two coins that already match the two legs, or a fixed rgb-lib. Do not turn live broadcast on by deleting the guard. The wallet's full-balance send (fix list 201) is a different path: it does not split one escrow coin between the lender and the tasker.

## Non-custodial rules

- No server route imports `$lib/credit`. There is no credit endpoint that holds a key or a balance.
- Signing uses a key that stays in the browser. The test ledger keeps its throwaway keys in `sessionStorage` only, on this tab, and never sends them.
- Those keys are not the RGB wallet seed.
- Pages under `/credit` are outside the protected layout, so opening them does not start the wallet. Reading coins is a button. If the wallet is locked, the screen says so and does not ask for a passkey.
- An advance is not shown as funded on a txid alone.

## Threat model and limits

- Relays can drop events. The test ledger keeps its own copy in the tab. A later live match must treat a missing event as absent, not as consent.
- A lender can lose the advance if the job is cancelled, disputed, or never released. Reputation caps are the only mitigation in this phase. There is no loss reserve and no arbiter key.
- Reputation can be gamed by two keys signing receipts for each other. Both signatures are required, but the software does not prove the work happened on chain. Reviews the tasker writes about themself are ignored.
- The fee and the percent are configuration, not a market. Lenders do not set a rate in this phase.
- The test ledger mints a coin of the exact advance so the send is a full allocation. A real wallet that holds one larger coin cannot do that until partial sends are safe.
- This build is signet, regtest, or the mock ledger. `assertCreditNetwork` rejects anything else.
- No KYC is collected. That is a product choice, not a legal conclusion. See below.

## El Salvador and CNAD

Offering custody or lending of digital assets to third parties can fall under CNAD registration, with AML and KYC duties. The design argument for staying KYC-free is that BitTasker is software only: it does not hold keys or funds, it is not the lender, and it does not take a fee itself in this phase (the fee is the lender's). Matching borrowers and lenders, or turning on a BitTasker treasury as the lender, can be read as providing a service that needs registration. Cadena registered and runs KYC even with a non-custodial contract.

**This is a legal question for Jon and a Salvadoran lawyer. This document does not answer it.** Do not describe the beta as KYC-free in a legal sense outside the sandbox.

## How to test on rgb.bittasker.com

After the sandbox pipeline for this branch finishes:

1. Open https://rgb.bittasker.com/credit?creditMock=1
2. The banner says Beta test. The escrow line says it is not confirmed.
3. As Tasker, choose **Confirm escrow on chain**. The maximum advance shows **$40.00 (40%)**.
4. **Request advance**.
5. Open https://rgb.bittasker.com/credit/offers?creditMock=1 and choose **Offer advance**.
6. Back on `/credit?creditMock=1`, as Tasker, **Accept offer**.
7. As Lender, **Send advance**. The status is **Waiting for confirmation**, not Funded.
8. **Confirm funding**. The status becomes **Funded**.
9. As Hirer, **Complete job and repay**. Lender receives **$40.40**, tasker receives **$59.60**, split total **$100.00**.
10. **Reset test** and repeat through Funded, then **Cancel job**. Status is **Defaulted**. Hirer refund is **$100.00**. Lender receives **$0.00** from the escrow. Lender loss is **$40.00**.
11. Check **Preview as a new tasker (0%)**. Request is refused.
12. Open https://rgb.bittasker.com/credit with no query. That page only checks a txid or reads an already-open wallet. It does not send and it does not prompt for a passkey.
13. A funded task shows a **Credit beta** badge when the flag is on.

`npm run test:unit` covers the score, the caps, the illegal transitions, both settlement paths, the partial-send guard, and the server-route check. `tests/e2e/credit-advance.spec.ts` walks the same two paths in a browser against the dev server.

## Phase 2

BTC-collateral USDT loans (research §8.1) are not built. `planCollateralLoan` checks terms and returns `not-implemented`. The later shape, agreed before any funding:

- Borrower and lender agree amount, APR, term, and LTV at or below 50% over Nostr.
- Borrower funds a 2-of-2 Taproot output.
- Three pre-signed paths exist before that output is funded: repay (USDT repayment proven, collateral back to the borrower), default (oracle BTC/USD attestation), and a refund timelock if the oracle is silent.
- No margin call and no in-term liquidation.
- `simulatedBtcOracle` is the stand-in for that attestation. The advance code does not import it.

Do not wire a live oracle, a treasury lender, or mainnet into this module without the legal opinion above.

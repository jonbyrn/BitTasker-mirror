# USDT-BSC Gate Evidence Ledger

## Usage
1. Keep this file updated as the single source of truth for gate evidence.
2. CI should validate required fields for every gate record.
3. Any `fail` status or missing required field is a release blocker.
4. Gate entries should be append-only through the decision history section; do not erase prior decisions.
5. Contract-dependent gates must record ABI status explicitly as `blocked` or `approved`; blank ABI status is a blocker.
6. `blocked` is acceptable only on non-release branches for gates waiting on external prerequisites such as the deployed ABI/artifact. Protected release targets, at minimum `main` and `release/*`, cannot ship with any `blocked` gate.

## Gate Records

| Gate | Status (`pass`/`fail`/`blocked`) | Primary Approver | Secondary Approver | Sign-off UTC | Schema Approval Status | `wallet-core` Contract Ref | Token Config Status | Accepted Address Set Ref | ABI / Artifact Status | ABI / Artifact Reference | CI Run URL(s) | Dashboard/Alert URL(s) | Runbook URL(s) | Artifact Hash / Checksum | Escrow Failure-Injection Report | Notes / Corrective Actions |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| G0 |  |  |  |  |  |  |  |  |  |  |  |  |  |  | N/A |  |
| G1 |  |  |  |  | N/A | N/A | N/A | N/A | N/A | N/A |  |  |  |  | N/A |  |
| G2 |  |  |  |  |  |  |  | N/A | N/A | N/A |  |  |  |  | N/A |  |
| G3 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| G4 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| G5 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |

## Gate-Specific Requirements
1. `G0` must record:
   - versioned Nostr schema approval status
   - `wallet-core` integration contract reference, which must resolve to normalization, payment-intent, validation, preflight, compatibility, and failure-semantics sections
   - token configuration reconciliation status
   - accepted address set reference by environment
   - ABI dependency status (`blocked` until the deployed contract ABI/artifact exists)
2. `G1` and `G2` may use `ABI / Artifact Status = N/A` because they are contract-agnostic.
3. `G3` through `G5` cannot be `pass` unless `ABI / Artifact Status = approved` and the accepted contract artifact reference is linked.
4. `G3` through `G5` must also record the same schema, `wallet-core`, token-config, and accepted-address references used to pass `G0`, so later gates cannot drift from the approved design lock.

## `wallet-core` Sub-Artifact References
| Gate | Normalization Ref | Payment-Intent Ref | Validation Ref | Preflight Ref | Compatibility Ref | Failure-Semantics Ref |
|---|---|---|---|---|---|---|
| G0 |  |  |  |  |  |  |
| G2 |  |  |  |  |  |  |
| G3 |  |  |  |  |  |  |

## KPI Evidence Fields
1. Record or link the following for each gate:
   - sample size (`n`)
   - success rate
   - skipped critical tests count
   - flake rate
   - green-run streak
   - soak window dates when applicable
   - versioned schema coverage when applicable
2. If KPI evidence is external, link it from the relevant gate row and note the report location.

## Append-Only Decision History
| Gate | Decision UTC | Decision | Primary Approved By | Secondary Approved By | Summary | Evidence Snapshot |
|---|---|---|---|---|---|---|
| G0 |  |  |  |  |  |  |
| G1 |  |  |  |  |  |  |
| G2 |  |  |  |  |  |  |
| G3 |  |  |  |  |  |  |
| G4 |  |  |  |  |  |  |
| G5 |  |  |  |  |  |  |

## Freshness Windows
1. CI evidence: <= 7 days old.
2. Monitoring/dashboard evidence: <= 7 days old.
3. Runbook links: must resolve at check time.
4. Escrow failure-injection report: <= 14 days old for G3+.
5. Artifact hash/checksum must match the referenced evidence snapshot.

## Escrow Multivault + Pre‑Signed PSBTs: Implementation Plan

### Overview and assumptions

- **Network**: Liquid (start with testnet; gate mainnet via env).
- **Vault policy**: and(pk(A), or(pk(B), older(CSV))). A is privileged for each stage.
- **Keys**: Client and freelancer derive pubkeys from a shared derivation path; private keys stay client‑side only.
- **PSBT strategy**: Pre‑create vaults and pre‑sign PSBTs for each scenario so runtime actions only publish.
- **Fees**: Platform fees ignored for now (added later).
- **Server role**: Store descriptors/PSBTs/signatures, merge/finalize, broadcast, and track state. No private keys on server.

### Vault architecture

- **VE (Escrow vault)**
  - Privileged: client
  - CSV: 14 days
  - Purpose: allows client refund after timeout; both sign for early outcomes
- **VD (Done vault)**
  - Privileged: freelancer
  - CSV: 7 days
  - Purpose: enables auto payout to freelancer if client takes no action
- **VDispute (Dispute vault)**
  - Privileged: client
  - CSV: 14 days
  - Purpose: default refund to client after dispute timeout
- **VFinal (Final dispute vault)**
  - Privileged: client
  - CSV: 30 days
  - Purpose: final timeout to client; direction cannot change further
- **VPx (Proposal vaults, on demand)**
  - Privileged: depends on direction of proposal
  - CSV: 14 days
  - Purpose: capture proposed split and direction; acceptance locks it in

### PSBT inventory to prepare

From VE (client‑privileged, 14d):

- VE → refund_full (100% client): 2‑of‑2
- VE → refund_90_10 (90% client, 10% freelancer): 2‑of‑2
- VE → VD (move to done): 2‑of‑2
- VE → refund_after_csv (100% client): single‑sig CSV path (client signs; sequence ≥ csv)

From VD (freelancer‑privileged, 7d):

- VD → pay_freelancer_now: 2‑of‑2
- VD → VDispute (start dispute): 2‑of‑2
- VD → pay_after_csv (100% freelancer): single‑sig CSV path (freelancer signs)

From VDispute (client‑privileged, 14d):

- VDispute → refund_after_csv (100% client): single‑sig CSV (client)
- VDispute → VFinal (final dispute): 2‑of‑2 (on first proposal rejection)

From VFinal (client‑privileged, 30d):

- VFinal → refund_after_csv (100% client): single‑sig CSV (client)

Proposals (on demand, while in dispute):

- Create VPx (direction‑consistent privileged, 14d) + PSBT CurrentVault → VPx (2‑of‑2). Proposer signs immediately; counterparty accepts (countersigns) or rejects.

### App (SvelteKit 2 + Svelte 5 runes)

1. Create Contract flow (extends current `create-contract` page)

- Derive `clientPubkey` (existing) and fetch `freelancerPubkey` from URL/flow
- Create vault set (VE, VD, VDispute, VFinal) with descriptors/addresses on `network`
- Persist vaults to server; display VE address and "Fund escrow"
- Funding option A (recommended now): Client funds VE via on‑chain (Breez SDK receive). Poll for VE UTXO confirmation
- Once VE UTXO confirmed, build VE→\* PSBTs and start signature collection

2. Signature collection UI

- Reusable signer modal with:
  - Scenario label, outputs, fee, CSV info
  - Sign actions per party
  - PSBT merge/progress to 2‑of‑2 complete, or finalize CSV single‑sig
- Persist intermediate PSBTs to server for coordination

3. Actions

- Cancel booking
  - > 24h: publish VE→refund_full (2‑of‑2)
  - <24h: publish VE→refund_90_10 (2‑of‑2)
  - Non‑responsive freelancer: after 14d, publish VE→refund_after_csv (client single‑sig)
- Rescope: publish VE→refund_90_10 (2‑of‑2), then start new contract (fresh VE)
- Freelancer marks done: publish VE→VD (2‑of‑2); prompt freelancer to pre‑sign VD→pay_after_csv (CSV)
- Client accepts: publish VD→pay_freelancer_now (2‑of‑2)
- Client disputes: publish VD→VDispute (2‑of‑2)
- Dispute proposals: create VPx vault + CurrentVault→VPx PSBT, proposer signs; accept or reject (first rejection triggers VDispute→VFinal 2‑of‑2)
- Timeouts: allow privileged party to sign and publish CSV single‑sig when eligible

4. Components

- `EscrowSetup.svelte`: vaults/addresses, fund status, UTXO polling
- `PSBTSigner.svelte`: sign/merge/finalize/broadcast (2‑of‑2 and CSV)
- `DisputeFlow.svelte`: proposals list, create/accept/reject, trigger move to final
- `ActionButtons.svelte`: show valid actions per state (derived)

5. Svelte specifics

- Use runes: `$state`, `$derived`, `$effect`, `$props`
- Handlers as props or `onclick={...}` (no `on:`)
- In load functions, await Promises explicitly (SvelteKit 2)

### Library refactor (reuse `src/lib/other`)

Create `src/lib/escrow/`:

- `vault.ts`
  - `buildPolicyExpression(csv)` and `resolvePolicy({A,B})` (migrate from `wallet/helper.ts`)
  - `createVault({A,B,csv,network,privileged})` → descriptor, address, witnessScript, scriptPubKey (from `create-vault-miniscript.ts`)
  - `createVaultSet(contract)` → build VE, VD, VDispute, VFinal
- `psbt.ts`
  - `getUtxos(address)` and `fetchOutputData(txid,vout)` (from `create-sending-psbt-miniscript.ts`)
  - `buildSpendPsbt({fromVault, utxos, outputs, feeSat, csvSeq?, witnessScript})`
  - Scenario builders: `buildRefundFull`, `buildRefund90_10`, `buildMoveToVault`, `buildDirectPayout`, `buildCsvRefund`
- `sign.ts`
  - `signTwoKeyPsbt(psbtB64, keyA, keyB)` + finalize miniscript 2‑of‑2 (from `sign-psbt-2keys-miniscript.ts`)
  - `signCsvPrivilegedPsbt(psbtB64, keyPrivileged)` + finalize CSV witness (from `sign-psbt-miniscript.ts`)
- `broadcast.ts`
  - `publishRawTx(hex)` via server API
- `types.ts`
  - Scenario enums, vault metadata, PSBT records, align with backend schema

### Backend (Cloudflare Worker + D1)

Principles:

- Store descriptors, PSBTs, signatures, finalized tx hex, txid and statuses
- Merge signatures server‑side, finalize when ready, and broadcast
- Track contract state machine

Endpoints (prefix `/api`):

- Contracts
  - POST `/contracts` → create: { client_id, freelancer_id, amount_sat, scheduled_at, derivation_path, client_pubkey, freelancer_pubkey }
  - GET `/contracts/:id`
  - PATCH `/contracts/:id/status`
- Vaults
  - POST `/contracts/:id/vaults` → save vault set (VE/VD/VDispute/VFinal)
  - GET `/contracts/:id/vaults`
- PSBTs
  - POST `/contracts/:id/psbts` → create PSBT record for scenario
  - GET `/contracts/:id/psbts`
  - GET `/psbts/:psbt_id`
  - POST `/psbts/:psbt_id/sign` → { signer: 'client'|'freelancer', psbt_b64_signed }
  - POST `/psbts/:psbt_id/finalize`
  - POST `/psbts/:psbt_id/broadcast`
- Proposals
  - POST `/contracts/:id/proposals` → create VPx + PSBT CurrentVault→VPx (proposer pre‑signs)
  - POST `/proposals/:id/accept` → counter‑sign
  - POST `/proposals/:id/reject` → build VDispute→VFinal PSBT
  - GET `/contracts/:id/proposals`
- Network
  - GET `/utxos/:address` (proxy Blockstream Liquid)
  - POST `/tx/broadcast` → { hex }

Suggested contract status flow

- `created` → `funding` → `funded` → `in_progress` → `done_pending` → (`accepted` | `disputed`) → `completed` | `refunded` | `final_dispute` | `final_refund`

D1 schema

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  role TEXT CHECK (role IN ('client','freelancer')),
  created_at INTEGER
);

CREATE TABLE contracts (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  freelancer_id TEXT NOT NULL,
  amount_sat INTEGER NOT NULL,
  scheduled_at INTEGER NOT NULL,
  derivation_path TEXT NOT NULL,
  client_pubkey TEXT NOT NULL,
  freelancer_pubkey TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at INTEGER,
  FOREIGN KEY (client_id) REFERENCES users(id),
  FOREIGN KEY (freelancer_id) REFERENCES users(id)
);

CREATE TABLE multisig_setups (
  id TEXT PRIMARY KEY,
  contract_id TEXT NOT NULL,
  derivation_path TEXT,
  client_pubkey TEXT,
  freelancer_pubkey TEXT,
  created_at INTEGER,
  FOREIGN KEY (contract_id) REFERENCES contracts(id)
);

CREATE TABLE vaults (
  id TEXT PRIMARY KEY,
  contract_id TEXT NOT NULL,
  type TEXT CHECK (type IN ('escrow','done','dispute','final','proposal')),
  privileged_party TEXT CHECK (privileged_party IN ('client','freelancer')),
  csv_blocks INTEGER NOT NULL,
  miniscript_policy TEXT NOT NULL,
  miniscript_resolved TEXT NOT NULL,
  descriptor TEXT NOT NULL,
  address TEXT,
  script_pubkey TEXT,
  witness_script TEXT,
  created_at INTEGER,
  FOREIGN KEY (contract_id) REFERENCES contracts(id)
);

CREATE TABLE psbts (
  id TEXT PRIMARY KEY,
  contract_id TEXT NOT NULL,
  scenario TEXT,
  from_vault_id TEXT NOT NULL,
  to_vault_id TEXT,
  psbt_b64 TEXT NOT NULL,
  amount_sat INTEGER,
  fee_sat INTEGER,
  required_sigs INTEGER,
  csv_required INTEGER,
  nsequence INTEGER,
  status TEXT,
  finalized_hex TEXT,
  txid TEXT,
  created_at INTEGER,
  FOREIGN KEY (contract_id) REFERENCES contracts(id),
  FOREIGN KEY (from_vault_id) REFERENCES vaults(id),
  FOREIGN KEY (to_vault_id) REFERENCES vaults(id)
);

CREATE TABLE psbt_signatures (
  id TEXT PRIMARY KEY,
  psbt_id TEXT NOT NULL,
  signer TEXT CHECK (signer IN ('client','freelancer')) NOT NULL,
  psbt_b64_partial TEXT NOT NULL,
  created_at INTEGER,
  UNIQUE (psbt_id, signer),
  FOREIGN KEY (psbt_id) REFERENCES psbts(id)
);

CREATE TABLE disputes (
  id TEXT PRIMARY KEY,
  contract_id TEXT NOT NULL,
  stage INTEGER,
  final_vault_id TEXT,
  opened_at INTEGER,
  closed_at INTEGER,
  FOREIGN KEY (contract_id) REFERENCES contracts(id),
  FOREIGN KEY (final_vault_id) REFERENCES vaults(id)
);

CREATE TABLE proposals (
  id TEXT PRIMARY KEY,
  dispute_id TEXT NOT NULL,
  proposer TEXT CHECK (proposer IN ('client','freelancer')),
  vault_id TEXT NOT NULL,
  split_client_sat INTEGER NOT NULL,
  split_freelancer_sat INTEGER NOT NULL,
  status TEXT,
  created_at INTEGER,
  FOREIGN KEY (dispute_id) REFERENCES disputes(id),
  FOREIGN KEY (vault_id) REFERENCES vaults(id)
);
```

### Scenario → PSBT mapping

- Refunds
  - refund_full / refund_90_10: VE→{client[, freelancer]} 2‑of‑2
  - refund_after_csv: VE→client single‑sig (sequence ≥ VE.csv)
- Done
  - to_done: VE→VD 2‑of‑2
  - pay_now: VD→freelancer 2‑of‑2
  - pay_after_csv: VD→freelancer single‑sig (sequence ≥ VD.csv)
- Dispute
  - to_dispute: VD→VDispute 2‑of‑2
  - to_final: VDispute→VFinal 2‑of‑2 (on first rejection)
  - dispute_refund_after_csv: VDispute→client single‑sig (sequence ≥ VDispute.csv)
  - final_refund_after_csv: VFinal→client single‑sig (sequence ≥ VFinal.csv)
- Proposal
  - Create VPx (direction privileged, 14d), PSBT Current→VPx (2‑of‑2). Accepted → move; else first rejection → to_final

### Immediate implementation steps

1. Refactor `src/lib/other/*` into `src/lib/escrow/` modules (`vault.ts`, `psbt.ts`, `sign.ts`, `broadcast.ts`, `types.ts`)
2. Extend `create-contract` to create vault set, persist, show fund instructions, poll UTXOs, build/sign VE→\* PSBTs
3. Add `PSBTSigner.svelte` and action buttons to drive cancel/rescope/done/accept/dispute flows
4. Implement backend endpoints and D1 schema listed above; add proxy `/utxos/:address` and `/tx/broadcast`
5. Implement broadcast + status polling; update contract/vault/psbt statuses
6. Add dispute proposal scaffolding (create/accept/reject). First rejection publishes VDispute→VFinal

### Notes / guardrails

- Always return change to the source vault unless the scenario drains by design
- Freeze VE UTXOs when building PSBTs to avoid collisions
- Enforce CSV by setting input nSequence; no nLockTime needed for CSV
- Keep all amounts in sats; split math uses `amount_sat − fee_sat`
- Never send mnemonics/private keys to server
- Runes: `$state`, `$derived`, `$effect` for state; handler props over deprecated `on:`; SvelteKit 2 load is explicit async

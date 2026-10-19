# BitTasker RGB sandbox: fix list

Living list of wallet/escrow fixes found in signet testing on https://rgb.bittasker.com
(branch `sandbox/rgb-wasm-phase0`). Read this before working on the wallet or escrow.
Updated 2026-10-19 by Jon's assistant (BitTasker bot). Older item numbers (99-118) were
kept elsewhere; anything not listed here wasn't carried over.

## Rules that apply to every fix
- Never let a user send unspendable USDT. Send, Max, invoice pay, Connect escrow and release
  are all capped at the real spendable amount, with the button disabled and a plain message such as
  "You can send up to $X USDT".
- Users never see RGB, UTXO, seal or consignment wording. Errors are plain English.
- Only commit to `sandbox/rgb-wasm-phase0`. Release path: sandbox -> dev -> staging -> main,
  with each merge on Jon's OK.
- Internal pre-audit, then an external security audit, before mainnet.

## MAINNET BLOCKERS

### 119. Partial USDT send burned the change (FUNDS LOSS)
- Signet tx `05f39d98daca73e8d62e2f081cae327f773b541e22fb29ef1d4833a0f678f4e2` (block 722244).
  It spent the only colored coin (691 sats, `tb1pzjcdr...dhu2`, about $70 USDT). The 309-sat fee
  left room for just one 382-sat output to `tb1p8937...hn50`, so there was no change output and
  about $68 USDT left the wallet.
- Fix in commit `3c92da3a8`: a partial send needs 969 sats on colorable coins and auto-moves spare BTC,
  and a tx with no wallet-owned output is never signed.
- Still open: (a) check whether `tb1p8937...` is the Taskee's witness seal, so the funds
  can be claimed; (b) apply the same guard to Connect escrow, funding and release; (c) run an
  end-to-end sandbox test with real wallets (colored coin under 1,000 sats).

### 111. Wallet only lives in browser storage
- Closing an Incognito window or clearing storage wipes the wallet, with no restore and no seed or
  backup export. Lost so far: the BB4 wallet (57,347 sats, 33 USDT) and GA3's old wallet (15,691 sats).

### 120. Contract released with no funding (2026-10-19)
- The $2 contract went Approved -> Paid / "Escrow released" while the Payment box still said
  "Waiting to connect escrow". History had only settlement_requested and released,
  with no funded step and no txid.
- The contract showed $2.00 while the accepted bid card said $20.

## Escrow / payment

### 121. Cancel invoice must release the coin
- Cancel invoice asks first, fails each unpaid receive, then syncs so a blinded coin is spendable
  again. The wallet list reloads assets and outputs after that.
- A second cancel still syncs when the transfer is already failed but `pendingBlinded` remains.
- Plain error text for that refusal is 122. Checking spendable before confirm is 123.

### 122. Plain error for a locked coin
- Replace the raw RGB/UTXO refusal with: "Your dollars are still held by an old receive code.
  Cancel it and try again."

### 123. Check before confirm
- Confirm payment should check the coin is spendable first and say so straight away.
  Today it waits about 2.5 minutes, then fails.
- Also warn the Tasker before Approve if payment can't go out.

### 124. Escrow lock model
- The Tasker locks the funds, and they stay locked until the Taskee finishes the work or both
  sides agree to cancel. (Design: no arbiter, no 2-of-3, a 2-party HTLC time lock, a joint cancel,
  offer-based dispute settlement with time delays, and auto-pay to the Taskee if submitted work
  is ignored.)
- The contract tracker needs a "Funded / escrow locked" step between Agreed and Work.

### 125. Connect escrow (Taskee side)
- Connect escrow on the bid card hangs on a spinner with no invoice and no error. It took 2 clicks
  plus manual help.
- The green "Invoice sent. The Tasker can connect it." line disappears after a reload.
- The escrow invoice carries no amount, though the card says it's the full contract amount.
- The bid card's escrow invoice wasn't the one listed as pending in the wallet.

## Wallet UI

### 126. History must stay after unlock
- The USDT and BTC history falls back to "No USDT transactions yet" / "No transactions found"
  after unlock, even with past transfers ($30 received, $10 sent).
- The escrow payment was filed under Bitcoin ("Sent bitcoin, 691 sats"), not USDT.

### 127. Show held vs available
- The balance showed $20.00 when $0 was spendable (held by an open receive). Show
  "Available $X (Y on hold)".
- Open receive codes should show in Simple view with their expiry and Cancel. Today they're
  only obvious in Advanced view.
- Use a shorter default expiry for receive codes (24h now), or auto-cancel unused ones.

### 128. Unlock problems
- "This wallet is already open in another tab. Close that tab and tap Unlock." There's no
  in-app way out.
- After the 12:08 PM deploy on 2026-10-19, unlock failed once with "Something went wrong. Tap
  to reopen." The console showed 400 on `api-staging.bittasker.com/api/v1/auth/login/passkey/encrypted-data`.
  It worked again later.
- The wallet re-locks itself between steps.

## Other

### 129. Messages
- /messages is stuck on "Failed to load conversations" or grey placeholders, even after Retry.

### 130. CI deploy job broken
- GitLab `deploy-sandbox` fails at `npm ci` because there's no package-lock.json on this branch.
  The last 3 pipelines failed. Commit the lockfile so builds are repeatable (audit).

### 114. Logout shows "Server Error".

### 107. QVAC: build after we have users.

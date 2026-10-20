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
- Cancel invoice asks first, fails each unpaid receive, and the last fail writes that into the wallet.
  It does not pull from the proxy afterwards, because that put the same receive back on reload.
- The cancelled batch is remembered. A reload that lists it as waiting fails it again and hides it.
- A second cancel still refreshes the wallet when the transfer is already failed but the coin stays blinded.
- Retest 2026-10-19 (sandbox): on Grok Bot Tasker's wallet, Cancel invoice on the receive
  `rgb:f~9F4X0C-TiLOTvy...` showed no confirm dialog. The receive vanished, then came back as
  WaitingCounterparty after a reload, and Pay failed again after about 2-3 min with
  "Refusing onchainSend ... locked by a blank invoice". The tab may have been on a pre-3:33 PM
  build. The notes above are the fix for that reload. Retest on the new build.

### 122. Plain error for a locked coin
- Done. The raw refusal is now: "Your dollars are still held by an old receive code.
  Cancel it and try again."

### 123. Check before confirm
- Done for Confirm payment. The locked-coin check runs before any sync, so the sentence shows
  straight away instead of after the send wait.
- Still open: warn the Tasker before Approve if payment can't go out.

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

### 131. Bids must show who the Taskee is
- Bid cards and lists (the Tasker's view of their task's bids, and anywhere a bid is listed) must
  show the bidder's (Taskee's) display name/handle and avatar, linked to their profile/reputation,
  so the Tasker knows who they're accepting.
- Reported by Jon 2026-10-19.

### 132. BTC price fetch blocked
- The browser calls `https://api.coinbase.com/v2/prices/BTC-USD/spot` directly from rgb.bittasker.com.
  It's blocked by CORS (no Access-Control-Allow-Origin) and returns 403, so `getCurrentPrice` fails
  ("Failed to get price for BTC") on the wallet and contracts pages, and sats-to-USD values get no price.
- Fix: serve the price from the BitTasker backend or a CORS-enabled provider, with caching and a
  graceful fallback.
- Reported by Jon 2026-10-19 (PC console).

### 133. Sandbox calls the staging API, which returns 404
- `GET https://api-staging.bittasker.com/api/v1/events?kinds[]=31000&authors[]=059a89cc...&limit=10`
  returns 404 from rgb.bittasker.com (`findEvents` on /my-tasks).
- Check that the sandbox points at the right API base, and that the events route exists there.
- Reported by Jon 2026-10-19 (PC console).

## Oct 19 escrow testing (Jon)

### 134. Passkey unlock fails with a vague red banner when the password manager is locked
- Severity: med. With the Bitwarden vault locked, tapping Unlock on the wallet shows a red banner:
  "The operation either timed out or was not allowed. Try again". Nothing says the password manager
  holding the passkey must be unlocked first.
- Fix: map this WebAuthn NotAllowedError/timeout to a plain message, e.g. "We couldn't reach your passkey.
  If it's saved in a password manager (like Bitwarden), unlock it, then tap Retry." Add a Retry button
  that re-prompts for the passkey. Related to 128.

### 135. Cancel invoice button can spin indefinitely during wallet sync
- Severity: med. Build `7fb8f8520`. Tapping Cancel invoice leaves the button on the spinner while the
  wallet sync runs, with no sign of progress or whether the cancel worked.
- Fix: show a progress state ("Cancelling... syncing wallet"), then a clear done or failed result, with a
  timeout and retry. Related to 121.

### 136. Bitcoin balance card shows a dash and a unitless "7,347"
- Severity: low. The main figure on the Bitcoin balance card is "-", with "7,347" underneath and no
  unit (sats) or fiat value.
- Fix: show the sats balance as the main figure with its unit ("7,347 sats") and the fiat value
  underneath (about $X). If the price is unavailable, say "price unavailable" instead of a dash. Related to 132.

### 137. Faucet message shows raw base units ("100000000 USDT") while the wallet shows $100.00
- Severity: low. Users can't tell whether the two amounts are the same.
- Fix: format faucet and all transfer messages in display units using the asset precision
  ("100.00 USDT"). Never show raw base units to users.

### 138. Simple wallet Receive card doesn't reset
- Severity: med. In the Simple wallet, tapping Receive shows the last action (the previous receive code
  or result) instead of starting fresh.
- Fix: reset the Receive card each time it opens. Clear the old invoice or result, and if a code is
  still pending, label it as an existing open code with a Cancel option. Related to 127 and 135.

### 114. Logout shows "Server Error".

### 107. QVAC: build after we have users.

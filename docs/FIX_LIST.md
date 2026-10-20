# BitTasker RGB sandbox: fix list

Living list of wallet/escrow fixes found in signet testing on https://rgb.bittasker.com
(branch `sandbox/rgb-wasm-phase0`). Read this before working on the wallet or escrow.
Updated 2026-10-20 by Jon's assistant (BitTasker bot). Older item numbers (99-118) were
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
- Status: fixed in `a38c9138393dc9c5ebe193a5bdd6f6376f848f2a`. The inbox was waiting on NDK until every pooled relay sent EOSE. See 149.

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

### 139. Bid card shows "Infinity sats"
- Severity: low. A $1.00 bid card shows "Infinity sats" for the sats value. This is probably a divide-by-zero while the BTC price is unavailable.
- Fix: guard against a missing price and show "price unavailable" instead.

### 140. Taskee can't Connect escrow with 0 USDT: "This wallet has no USDT to invoice"
- Severity: high. The worker has 0 USDT (its faucet transfer hasn't synced) and clicks Connect escrow on an accepted $1 bid. It fails, and no invoice is created.
- Fix: a receiver should be able to make an RGB USDT invoice with a zero balance (blinded or witness receive). If a UTXO or asset is needed, explain it and offer to set one up.

### 141. USDT balance appears and disappears between wallet loads
- Severity: high. Received USDT (for example a faucet transfer) shows up in a wallet and later shows as 0, which blocks invoicing and escrow. Jon believes the last push (build 0c2c78817) may fix it. Recheck once it's live.
- Fix: make the RGB balance stable across syncs and refreshes. Never drop settled allocations, and show pending or settling state explicitly.
- Status: a refresh that reports spendable 0 keeps the settled amount when the chain check did not prove a spend. When Esplora shows the allocation on a spent output, the number on screen is the live spendable amount and the spent amount is labeled locked or unconfirmed. A chain glitch with no spend still restores the last figure. Needs a live signet reload to confirm a faucet balance stays put.

### 142. USDT transfer count badge says 7 but the list shows 2
- Severity: low. On the wallet, click Refresh transfers. The USDT badge goes from 2 to 7, but only 2 entries are listed.
- Fix: make the badge count match the visible list, or show the hidden or failed transfers with a filter.
- Status: the same payment listed twice (different RGB status, same txid and amount) is shown once, and the list key is that payment rather than a shared id. The badge uses that list. Needs a live Refresh transfers check.

### 143. USDT Send button stays disabled with a valid receive code and no error
- Severity: high. The wallet holds $100 USDT. Click Send and enter a valid, unexpired witness or blinded receive code (from Grok Bot Tasker). The amount auto-fills to 5.00. "Preparing…" flickers, then Send stays greyed out, with no error and no asset selector.
- Fix: show the reason Send is disabled (for example invalid code, no colorable UTXO, or not enough sats for fees) and a way to fix it.
- Status: simple and advanced mode now say when the code is invalid or expired, when an old receive still holds the coin, when there is not enough Bitcoin to return the rest, or when the change is still confirming. Needs a live send with a 691-sat coin and with a confirming change.

### 144. New-account issues from setting up a fresh wallet
- Severity: med.
- Brand-new account Grok Bot Automate 2 shows an old "Sent dollars $10.00, 12 hours ago" USDT transfer. Wallet data looks shared or cached across accounts in the same browser. This could be a privacy problem.
- Logout needed two confirms. After the first, /auth redirected to /wallet with the wallet showing "Locked".
- The first passkey create failed with "operation timed out or was not allowed". The Bitwarden login item was saved without the passkey, and a retry worked.
- In the Simple wallet, "Get Bitcoin" reloads the page with nothing shown. It works in Advanced.
- Fix: clear the per-account wallet cache on logout or sign-up, make logout happen in one step, and handle passkey create failures with a clear retry.

### 145. Bid isn't visible to the poster: bids sync between accounts
- Severity: high. Grok Bot Tasker 2 bids $1.00 on 'Escrow smoke test 2' through Earning > Find Tasks. Its Bids Sent list shows it as Pending, $1.00 / 1227 sats. The poster, Grok Bot Automate 2, opens /task/escrow-smoke-test-2-1792463834414/bids and sees "No bids yet", even after Retry. For the bidder, the same /task/... page returns a 500 Server Error.
- Fix: check that the bid is published to the same relay and task id the poster's bids page queries, and fix the 500 on the task page for non-owners.

### 146. New wallet won't unlock: "Something went wrong. Tap to reopen" after passkey
- Severity: high. A freshly created account whose wallet worked earlier (150k sats received). After passkey approval the wallet shows "Something went wrong. Tap to reopen".
- Fix: surface the underlying error and make unlock retry safely.

### 147. USDT change doesn't come back after an RGB send (balance drops to 0.00)
- Severity: critical. Observed Oct 19 2026, about 9:10 PM CST, on account Grok Bot Automate 2. The wallet held 100.00 USDT in one colored UTXO. It sent 10 USDT once (txid e2e3353694366d121be6f5d2bb37c6f7a059a68dfa25bfceb07f609d6e0c2f6a), and the recipient received exactly 10. After that, the wallet showed 100.00 and then 0.00 USDT; expected 90.00.
- Coin details show 1 asset-bearing UTXO, d905...bc4f:1 (Colored, 1,000 sats, 1 allocation), plus e2e3...2f6a:1 (Free, 691 sats, 0 allocations). No change transfer is listed. The USDT counter reads 15 or 19 while only 3 rows are shown. A later 20 USDT send's Send button went disabled with no error. Jon suspects the USDT change isn't being returned or accounted for.
- Likely area: the RGB send's change/blinded-UTXO handling, the change allocation not being registered or synced, and the balance computed from settled allocations only.
- Fix: make sure the change output is a wallet-owned colored UTXO, refresh transfers to settle the change, and include pending change in the displayed balance.
- Status: failing the send whose txid spent the coin was dropping the change allocation. That send is no longer failed. A proved spend is not put back to the old total. Live retest on Pages deploy 4d0672e0f (includes af873569) failed a different way: see 148. A wallet that already failed the change-producing send can still be missing that allocation.

### 148. USDT shows 100.00 but Send says it sits on a spent output
- Severity: critical. Live test Oct 20 2026 on rgb.bittasker.com, Pages deploy 4d0672e0f (includes af873569), wallet Grok Bot Automate 2. The card showed 100.00 USDT, Ready. Send of 10 USDT to an RGB blinded invoice, Send then Confirm send once each, passkey OK. Red error: "Only 0.00 USDT spendable, 100.00 is on spent outputs". No txid. After 3 minutes and a reload the card still showed 100.00 USDT.
- History on that wallet: received 100 about 2 hours earlier, sent 10 about 2 hours earlier, sent 10 about 14 hours earlier. The 100 USDT allocation is listed on an output Esplora already spent (stale colored-output state after those sends, likely the change from the send 2 hours ago, or a transfer that was failed while its input was already spent).
- Fix: before refusing, sync and refresh RGB, fail only stale WaitingCounterparty rows (expired, never broadcast, or sitting on the spent output), and drop allocations whose output is already spent. Do not fail the send that spent the coin. Add Repair wallet. Show the live spendable amount, and when that is zero show how much is locked or unconfirmed.
- Status: Send now syncs and refreshes before that refusal, and quotes the live amount so an unspendable total cannot be sent. Repair wallet runs the same rescan. The hero matches the live spendable amount and shows "{amount} locked or unconfirmed" when the allocation is on a spent output. If the change-producing send was already failed, RGB has dropped that consignment and Repair cannot recreate it. Live Repair on build 9b72f2f0d showed the lock, then a reload painted 100.00 again. See 149.

### 149. Repair's locked balance and the transfer lists do not survive a reload
- Severity: critical. Live test Oct 20 2026, build 9b72f2f0d, wallet Grok Bot Automate 2. Before Repair: 100.00 USDT spendable, nothing locked, 49,382 sats. One Repair press took about 40 seconds, then 0.00 spendable, "$100.00 locked or unconfirmed", and "Wallet checked. The balance is what you can send." The Lightning card changed to "Lightning could not connect". After a reload: 100.00 spendable again, nothing locked. The lists that had 3 USDT and 2 BTC transfers showed "No USDT transactions yet" and "No transactions found". No send was made.
- Cause: startup (`scanAndUpdateBalances`) wrote rgb-lib's spendable 100 without the Esplora spent-output check that Repair's `loadAssets` uses, and it saved that over the snapshot. Repair also called `failTransfers` on the settled transfer that created the spent output, which cannot move the change and marks that payment Failed. History hid Failed rows, and the startup snapshot save ran before `listTransactions` and stored an empty list. Lightning's "could not connect" is the LSP lookup hitting the wasm wallet while Repair still holds it.
- The missing change itself: our earlier `failTransfers` on the send that spent the coin dropped the change consignment. rgb-lib 0.17.0-beta.3 (`@utexo/rln-wasm` 0.17.0-beta.3, `@utexo/rgb-sdk-web` 1.0.0-beta.12) still reports that allocation as spendable and has no call that puts the consignment back. See `docs/UTEXO_CHANGE_ISSUE.md`.
- Fix: startup and refresh use the same spent-output check, and a proved spent amount is stored so the next load does not show it as spendable. Do not fail settled transfers. Keep saved transfers when a scan has not listed any yet, and show a Failed transfer that has a txid.
- Status: startup now filters spent outputs the same way as Repair, and the proved lock is kept across a reload. Settled transfers are no longer failed. History keeps payments the latest list omitted, including a Failed transfer that was broadcast. The 100 USDT is not spendable again unless the change-producing transfer is still waiting for confirmations. Needs one reload on this wallet after deploy: expect 0.00 spendable and the locked line without pressing Repair, and the old transfers back if rgb-lib still lists them.

### 150. Faucet 100 USDT never shows on an open receive invoice
- Severity: critical. Grok Bot Automate 2, rgb.bittasker.com, build 9b72f2f0d or later. About 6:57 AM CST on Oct 20 2026 the wallet created `rgb:f~9F4X0C-TiLOTvy-pALF29V-2xJ2p0m-hP3_vpW-Alj4G5Y/IpjJhFLz3oywYKQxO3KmFgR0Aa415nlTNrNyEFqMZCE/FcAmF/sb:utxob:IaW2JxFY-O5AxOPA-1RV3oRq-sOyAUl_-saWDoXa-_PhMCOg-TgYGo?assignment_name=assetOwner&expiry=1792587459&endpoints=rpcs://rgb-proxy.utexo.com/json-rpc`. About 7:03 AM the UTEXO faucet reported sending 100 USDT (100000000), txid `80e778ff5b5d5cd77fc5b5684a6635cfcff2ea0a8dc645a45bb4ff58c902b958`. Refresh every 90 seconds from 7:05 to 7:17 did not list the payment. The card stayed 0.00 spendable and $100.00 locked (the old lost change). The page was reloaded with the Receive dialog open.
- Chain: the tx is confirmed on `https://esplora-api.utexo.com` in block 724731 (`block_time` 2026-10-20 13:02:52 UTC, 37 confirmations at the check). It is not on mempool.space/signet. The bitcoin tx is an OP_RETURN commitment plus the faucet's own change. It does not pay a new output to this wallet. The RGB payment only arrives if the consignment is imported from the proxy.
- Proxy: `consignment.get` on `https://rgb-proxy.utexo.com/json-rpc` for `utxob:IaW2JxFY-O5AxOPA-1RV3oRq-sOyAUl_-saWDoXa-_PhMCOg-TgYGo` (and the same id without hyphens) returns `Consignment file not found`. The invoice expiry is 2026-10-21 12:57:39 UTC, so it had not expired.
- Cause: closing the Receive dialog and reloading do not cancel an invoice. Repair and startup do not fail an unexpired WaitingCounterparty receive. Refresh did not ask the proxy for this asset: a wallet that already has a settled receive, or a booked USDT balance, skipped the asset-id pull. The first pull uses no asset id, and the faucet consignment is fetched by asset id. The file is not on the proxy now, so a refresh cannot import it until the faucet posts that consignment again.
- Fix: a refresh asks the proxy by asset id while an unexpired incoming invoice is still WaitingCounterparty, even if an older receive is settled and the booked balance is still positive. Do not fail an unexpired incoming transfer. Do not cancel invoices when generating another code, when the dialog closes, or when the page reloads. An explicit Cancel still fails the unpaid invoice.
- Status: the 100 can still arrive only if the faucet posts the consignment again before 2026-10-21 12:57:39 UTC and this wallet's receive batch is still WaitingCounterparty. After this build, Refresh transfers will import that file. It cannot arrive from the proxy as checked: the file is not there, and the bitcoin tx alone does not carry the RGB state.

### 148. Submitting a bid asks for the passkey again and then silently resets
- Severity: high. A logged-in user on rgb.bittasker.com taps Submit Bid and the password manager
  opens "Log in with passkey?" in a separate popout. The popout times out, the button stays on
  "Submitting...", then it resets with no error and no bid.
- Cause: routine Nostr signing (bids, messages, profile, and page loads such as the bids list)
  called `navigator.credentials.get` whenever the in-memory key was missing. Passkey login did not
  keep the signer in memory, and a wallet-session clear deleted the signer ciphertext too. The
  WebAuthn challenge was fetched after the click, so the password-manager popout was no longer tied
  to the gesture and timed out. The bid form only toasted a generic failure and cleared the spinner.
- Fix: reuse the signer unlocked at login for 8 hours in this tab (AES-GCM ciphertext in
  sessionStorage, non-extractable key in IndexedDB, nothing in localStorage). Bids, messages, and
  profile edits sign with that session. A passkey is requested for login, an explicit unlock, and
  high-risk actions (send, Lightning pay, escrow lock, escrow release, seed export). When a prompt
  is required the page says "Approve with your passkey to continue". Cancel or timeout leaves the
  form filled, shows an error, and offers Retry.
- Fixed in commit `5c6b174366c79d6558e4d1acca2c48e5944cfdd9`.

### 149. Direct messages don't send or arrive
- Severity: high. Two users cannot exchange a direct message. In testing, `wss://relay2-dev.bittasker.com` failed to connect. The inbox stays on grey placeholders or "Failed to load conversations" (item 129).
- Cause: history and the conversation list call `ndk.fetchEvents` with no relay set and no timeout. After a task page, the task relay is added to the NDK pool. Dev and prod relay2 are nostr-relay-nestjs: they send NIP-42 `AUTH` and do not send EOSE unless the client signs that challenge. This app does not. NDK resolves a fetch only on EOSE, and one healthy relay's EOSE is not enough when another pooled relay never finishes, so both the `#p` query and the authors query stay pending. The chat screen starts its live subscription only after history returns, so receive never starts. A send can still be written to the general relay.
- Fix: user chat reads and writes only the general relays (`VITE_NOSTR_RELAY_URL`), with an 8 second deadline per query. A relay that asks for a sign-in is reported as "asked for a sign-in this app does not send" instead of hanging. Kind 4 stays NIP-44 through nostr-tools, with a NIP-04 decrypt fallback. Public keys are compared as lowercase hex. Protocol kind-4 traffic (RGB consignment and the utexo swap) is not treated as chat.
- Fixed in commit `a38c9138393dc9c5ebe193a5bdd6f6376f848f2a`.

### 150. Free messages before an escrow exists
- Severity: high. Anyone could open a direct message, and a bid could carry a phone number, email, outside handle, or link, so two people could arrange the work before escrow.
- Fix: a free DM is allowed only between the hirer and worker of a contract whose escrow is formed. Formed means a public `CONTRACT_STATUS` or `BID_STATUS` `s` tag of connected, locked, funded, or a later state of that contract (`ESCROW_FUNDED` and `WORK_IN_PROGRESS` count; accepted-only and invoice-pending do not). Both pubkeys must be the author or a `p` tag. If those relays cannot be read, chat stays closed. `sendDirectMessage` throws for chat, and the composer stays disabled, with the note "Messaging unlocks once escrow is formed." Bid text is the pre-escrow channel that remains; a proposal with a phone number, email, outside link, or outside handle is rejected with the same note. This repo has no relay policy hook for DMs, and kind 4 is also used for swaps and consignments, so the gate is on the chat send path rather than every kind-4 publish.
- Fixed in commit `a38c9138393dc9c5ebe193a5bdd6f6376f848f2a`.

### 151. Accepted bid left the task OPEN and sent no notification
- Severity: high. Accepting a bid published the bid status, then looked up the task through the staging events API. That API 404s on this sandbox (item 133), the lookup failed, and the replaceable task stayed OPEN. The notification bell also skipped the staging notification service, so the bidder saw nothing.
- Fix: read and republish the task on the shared relays, set it IN_PROGRESS (same as production), and record the accepted bid. The bell and /notifications list are built from public Nostr tags (new bid, bid accepted or rejected, escrow connected, funded or locked, deliverable submitted, approved, payment requested, paid or settled, a new direct message, a new review, a service ordered) with an unread count. A granted browser notification permission shows those while the tab is in the background. Background reads use the cached public key and never ask for a passkey.
- Differs from production: production's bell is the notification API plus Firebase web push. This host has no notification service, so the inbox is the Nostr events themselves and browser push is the Notification API, not FCM.

### 152. Reviews after a settled escrow
- Severity: high. A star rating and review (kind 6430, the same kind production signs) can be published only by the hirer or the worker, and only after that escrow's latest public status is released or settled. They show on the profile, the task page, and the service page.
- Differs from production: production also gets a kind 6431 attestation from the BitTasker verifier, with category ratings and a wallet signature. This sandbox has no attestation issuer, so a review shows from the kind 6430 event after the party check. The verifier badge stays off until that issuer is available.

### 153. Publish Service opened a locked wallet and saved nothing
- Severity: high. Publish Service on /create-service sent the user to /wallet ("Locked. Tap to open") and the listing was not created. My Services stayed on "No services yet" and /services showed "0 services found", with no error.
- Cause: Book Now called `getRgbAddress()`, which opens the wallet. A listing is a Nostr event. The wallet is used later, when escrow connects.
- Fix: publish keeps an address only when the wallet is already open. It does not unlock the wallet. A failed publish stays on the review step and shows the error.
- Status: fixed in this branch. Needs a live publish with the wallet locked and with it unlocked.

### 154. Service prices were USD only
- Severity: medium. The pricing step rewrote USDt to USD, so a service could not be priced in USDT for the usdt_rgb rail.
- Fix: the pricing step offers USD and USDT. USDT is stored as USDT. Legacy USDt is treated as USDT.
- Status: fixed in this branch.

### 155. Create service had no delivery time
- Severity: medium. Delivery time was hidden inside Book Now, and on tiers it sat behind a checkbox, so the form looked like it had no delivery-time field.
- Fix: fixed-price services always show a delivery time. Tier delivery inputs are shown on each tier.
- Status: fixed in this branch.

### 156. /services/new showed Service Not Found
- Severity: low. /services/new was treated as a service id, so the detail page said "Service Not Found".
- Fix: /services/new redirects to /create-service.
- Status: fixed in this branch.

### 157. Publish Service posts to /api/v1/events
- Severity: high. Logged in as Grok Bot Automate 2, with the wallet unlocked, Publish Service failed with "Cannot POST /api/v1/events" in the banner and the toast. The listing was not created. The same missing route is what service reads and the exact-location companion used.
- Cause: service publish, update, delete, and lookup called the nostr-relay-nestjs `/api/v1/events` API. rgb.bittasker.com does not serve that route. Tasks, bids, and direct messages already publish signed events to the general relays (`VITE_NOSTR_RELAY_URL`).
- Fix: publish, delete, and lookup of services go to those general relays. A missing or empty events API is not shown to the user.
- Status: fixed in this branch. Needs a live publish on rgb.bittasker.com, then My Services and /services should list it.

### 158. Skills dropdown listed no options
- Severity: medium. The Skills field on create service opened with no choices. The control was given an empty list and the menu was hidden.
- Fix: the menu lists service skills (cleaning, web development, design, and the rest). A skill that is not in the list can still be typed in.
- Status: fixed in this branch.

### 160. Publish Service still POSTed /api/v1/events after the relay publish
- Severity: high. After f6c13f1e3 deployed, a hard reload of the review step for the resumed draft "Website bug report with screenshots" (3 USD, skill QA Testing) still showed "Cannot POST /api/v1/events" twice.
- Cause: publish itself no longer posted, but find, request, and find-by-id still called the events API. The client extended the shared API class, and `super(undefined)` used the default base `https://api-staging.bittasker.com`, which answers that path with that exact message. A service worker or Cache Storage entry can also keep the older bundle, which posted the location companion and the listing.
- Fix: publish, read, and delete of Nostr events use only the general relays. Nothing in that client calls `/api/v1/events`. The page unregisters a controlling service worker, deletes Cache Storage, and reloads once. The messaging worker and `/service-worker.js` clear caches and are not cached.
- Status: fixed in this branch. Needs a live publish of that draft on rgb.bittasker.com after the next deploy.

### 159. Wallet connection is invisible, so actions fail in silence
- Severity: high. On every page it was unclear whether the wallet was connected, locked, or which account was signed in. Publish Service landed on /wallet showing "Locked. Tap to open" with no error. A payment said "No connection, nothing was sent". The Payment card still said "Waiting to connect escrow" after escrow was connected. The wallet page said "Ready" and never "Connected". A tab could be signed in as a different account with nothing on screen to show it.
- Fix: `walletConnection` is the only status. Reading it does not ask for a passkey. Phases are logged out, locked, unlocking, syncing, ready ("Wallet connected"), and error ("Connection problem: <reason>"), plus Bitcoin, RGB USDT, the RGB proxy, and Lightning. The header shows the account name, a short public key, a coloured dot, and those words. The panel lists each rail, the balance, and Unlock or Retry. Bid, connect escrow, pay, and send check this first. A locked wallet stays on the same step and says "Unlock wallet to continue". Publishing a service does not wait on the wallet (item 153): a listing is a Nostr event, and the header still shows the wallet state on that page. Focus, becoming visible, and the network returning call the cached session only. The escrow card and the Payment card use `paymentCardHeading`, so a funded escrow says "Escrow connected".
- Needs a live check on rgb.bittasker.com: lock the wallet and confirm publish still saves the listing. Place a bid, connect escrow, and pay while locked, and confirm each stays on the same step with "Unlock wallet to continue". Confirm the header, and that a second account in another tab shows its own name. Confirm the Payment card after escrow is funded.

### 114. Logout shows "Server Error".

### 107. QVAC: build after we have users.

## UI compliance (2026-10-20)

See `docs/UI_COMPLIANCE.md` for the checklist, what was fixed, and what is still open.

### 160. Approve needed several presses
- Severity: high. Approve work (and the same pattern on submit, pay, and cancel) hid the button as soon as the tap started, and a slower contract reload put the status back to "work submitted". The button came back looking idle, so people tapped again.
- Fix: the button stays on screen, shows "Approving…", ignores a second tap, and a stale relay read cannot undo the approval. A failure says what happened and to tap Retry.

### 161. Bid cards showed the task budget as the bid
- Severity: high. On My Bids the price in the card header was `taskBudget` (for example $2) while the submitted bid (for example $20) was inside a collapsed section. The contract could then invoice `totalAmountUsd` instead of the locked bid.
- Fix: the header shows the bid amount and currency (USDT, USD, or sats). The task budget, when it differs, is labeled "Task budget". USDT invoices use the locked bid amount.

### 162. Warning, info, success, and error text failed contrast
- Severity: med. Yellow and light status colors used near-white text, under WCAG 2.2 AA (4.5:1).
- Fix: status hues stay the production colors. Text on those hues is dark enough for 4.5:1, because production near-white text failed (dark warning was about 1.47:1). Surfaces are the production greys and Bitcoin orange. `src/lib/tests/unit/utils/ui-compliance.test.ts` fails if a pair drops below 4.5:1.

### 163. Notifications could fail without a message
- Severity: med. The notifications page never read the store's error. Mark all read and Clear all caught failures and refreshed with no sentence.
- Fix: the page shows the error and a Retry button. Those two actions say what failed and to tap Retry. Mark all read, Clear all, and Show all ignore a second tap and show a pending label.

### 164. Delivery time unit snaps back to Hours
- Severity: high. On /create-service, picking Days on the delivery-time unit left the stored duration in hours. A service entered as 1 day was saved as "1 hour".
- Cause: the dropdown only changed a local label. The number on screen stayed tied to the old hour count, and the next render inferred Hours again.
- Fix: changing the unit keeps the number on screen and stores that many of the new unit. 1 day is 24 hours, and the label stays Days.

### 165. Service cards have no shareable page
- Severity: high. View on /services did not open a service. There was no link to copy, and My Services Details only opened a side panel.
- Cause: View was a button nested in a card that treats clicks as map selection, so the click never left the list.
- Fix: View and Details go to `/services/<id>`. The page loads the service already on screen, then the relay, by its public id or event id.

### 166. Skills dropdown lacked writing skills
- Severity: medium. Create service had no Summarizing skill, and the writing set was too thin for the work people list.
- Fix: the skills menu includes Summarizing, Translation, transcription, technical and creative writing, ghostwriting, blog, grant, and resume writing, scriptwriting, localization, and subtitling. A skill that is not listed can still be typed in.

### 167. Homepage was too loud
- Severity: med. The sandbox homepage led with "Earn Bitcoin. No KYC. Your keys.", a "NON-CUSTODIAL · KYC-FREE · OPEN PROTOCOLS" strip, and full-width Find work / Hire / Offer a service buttons. The background had shifted to a warm near-black.
- Fix: the homepage matches the production mobile layout again. Logo with "The Decentralized Workforce", one line ("Hire professionals for any task. Pay with Bitcoin, Lightning, or USDT. Built on Nostr."), then stacked medium pills: Browse Tasks and Browse Services (dark grey) and Sign Up (orange). Trusted Worldwide follows. Logged-in people get Post a Task in place of Sign Up. The logged-out header is the production row again (logo, flag, theme, Login, Sign Up). Brand colors, fonts, and the dark grey background are the production tokens again (`#2d2d2d` / `#363636` / `#3f3f3f`, orange `#f7931a`). Status text stays dark enough for 4.5:1 (see 162). The signed-in wallet mark is a dot beside the avatar (see 168).

### 168. Wallet status showed a name in the header
- Severity: med. The signed-in header put an account name and a sentence ("Wallet connected") next to a second avatar. That row was too wide at 360px.
- Fix: the header mark is only a small light. Connected is green, with the tooltip and accessible name "Wallet connected". Locked and unlocking are amber ("Wallet locked, tap to unlock"). Syncing is blue. A connection problem is red. Tap still opens the status panel, where Unlock and Retry stay.

### 169. Avatar left the top-right corner
- Severity: med. The wallet chip carried its own avatar, so the account menu avatar was no longer the rightmost control.
- Fix: the account avatar stays the last item in the header, as on production. The wallet light sits immediately to its left. Both are fixed-size, so the row fits at 360px.

# BitTasker RGB sandbox: fix list

Living list of wallet/escrow fixes found in signet testing on https://rgb.bittasker.com
(branch `sandbox/rgb-wasm-phase0`). Read this before working on the wallet or escrow.
Updated 2026-10-21 by Jon's assistant (BitTasker bot). Older item numbers (99-118) were
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
- First reading (superseded by 201): the 382-sat output was treated as someone else's, so the
  guard required 969 sats of colorable coins. That output is this wallet's, and the wallet already
  had four empty 1,000-sat colorable coins. The guard did not stop this send. See 201.

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
- Fix: the header mark is only a small light, with a tooltip and an accessible name. Tap still opens the status panel, where Unlock and Retry stay. The colours are green, amber, and red (see 174).

### 169. Avatar left the top-right corner
- Severity: med. The wallet chip carried its own avatar, so the account menu avatar was no longer the rightmost control.
- Fix: the account avatar stays the last item in the header, as on production. The wallet light sits immediately to its left. Both are fixed-size, so the row fits at 360px.

### 170. Phone layouts clip on the right
- Severity: high. On an Android phone about 412px wide, logged-in pages drew past the right edge. The wallet Simple/Advanced toggle, Refresh transfers, and balance cards were cut off. Task prices (`$1.00`, `1,23…`), the green status pill, and View were cut off. Filters, Save, and Map overflowed. The error banner's Try again was cut off. The old homepage title stopped at "No KYC." That title is the production hero again (see 167).
- Cause: `body` used `100vw` (wider than the screen once a scrollbar exists). The header end was `w-full` beside another flexible start. DaisyUI buttons and badges do not shrink, and price columns were fixed near 120px in a nowrap row. The page then clipped that overflow.
- Fix: phone rows use `min-w-0` and wrap. Tab toggles are full width. Price sits under the description below the `sm` breakpoint. Button rows wrap. The header wallet mark stays the fixed-size dot from 168. `tests/e2e/a11y/mobile-overflow.spec.ts` fails if `document.scrollWidth` is wider than the viewport at 360, 390, and 412px.

### 171. Bitcoin balance showed 0 during Syncing
- Severity: high. The wallet showed "Something went wrong. Tap to reopen." and the Bitcoin balance fell from 9,347 sats to 0 while the status said Syncing.
- Cause: that sentence is the wasm crash message. A scan then wrote `balanceSats: 0` while `syncing` was still true, and the screen treated that 0 as the balance.
- Fix: while syncing or initializing, a reported 0 keeps the last positive balance. A finished scan that is actually 0 still shows 0. The crash banner still asks for a reload. This does not repair the wasm panic.

### 172. Homepage header said Logged out while signed in
- Severity: high. The homepage header showed "Logged out" for a signed-in account.
- Cause: the company layout treated "not authenticated yet" as logged out. The server rendered that before Capacitor Preferences finished reading the access token. The wallet status uses that same flag, so the headline was "Logged out".
- Fix: auth starts loading on the server and the client. The homepage header stays blank until that read finishes, then shows the signed-in bar when a token is present.

### 173. User-facing copy still described Rootstock, rBTC, and Boltz
- Severity: high. Home, FAQ, How it works, secure payments, onboarding, wallet help, terms, privacy, bids, and the learn articles still told people the product used Rootstock, rBTC, Liquid, Boltz swaps, MetaMask, and a 7-day auto-pay / 14-day refund. That is not what this branch does.
- Fix: English and Spanish locale strings now follow the passkey wallet, Bitcoin, USDT on RGB, Lightning, and card or bank bitcoin purchases. Escrow is lock, deliver, approve, pay the invoice. Messages open only after escrow is formed. Reviews open only after that payment. Nothing is paid on a timer. Learn articles that said BitTasker escrow runs on Rootstock were rewritten. Industry comparison pages can still name other networks. Layout, colours, fonts, and buttons were not changed. `docs/MERGE_PLAN_DEV.md` says this copy is part of the dev replacement and must not be overwritten by old `dev` wording.

### 174. Wallet light was blue and still named the account
- Severity: med. While the wallet was syncing, the header showed a blue dot, the words "Syncing…", and the account name (for example "Bitwarden Tester · 0a197e17").
- Fix: the header shows only the light, just left of the avatar. Green means connected. Amber means syncing. Red means not connected, which covers locked, logged out, and a connection problem. The tooltip and aria-label still name the state. A red light still opens the panel so Unlock and Retry stay one tap away. No account name is drawn in the header. The task-list clip is item 170.

### 175. Messages fail because relay2 asks for NIP-42 AUTH
- Severity: high. On a phone, Messages shows "Failed to load conversations. Messages could not be loaded. wss://relay2-dev.bittasker.com: asked for a sign-in this app does not send." The title is one letter per line.
- Cause: the running rgb.bittasker.com bundle was built with `VITE_NOSTR_RELAY_URL` and `VITE_NOSTR_TASK_RELAY_URL` both set to `wss://relay2-dev.bittasker.com`. That relay is nostr-relay-nestjs and sends `["AUTH", challenge]` before it stores or returns a kind-4 event. The client treated that as a failure. The sandbox source config is different and is the intended setup: general `wss://nos.lol`, tasks `wss://relay.primal.net` (`wrangler.toml` `[env.sandbox.vars]` and `deploy-sandbox`). The error card is a DaisyUI alert grid. Extra children became extra columns, and `.alert p` uses `overflow-wrap: anywhere`, so the title column shrank to one character.
- Fix: on AUTH, sign kind 22242 (`relay` + `challenge`) with the logged-in session key from `getNostrKeyPair()` and send `["AUTH", event]`. After the relay OK, retry the REQ or EVENT. A missing session throws `SignerLockedError` and does not open a passkey prompt per message. Escrow gating of chat is unchanged. The load error is one text column with normal word wrap, sized for 360–412px. A unit test signs the challenge and checks the retried REQ and EVENT.
- Fixed in commit `d474b6006d213effd99617f0ac6bfe82de91e012`.

### 176. My Profile title and username run off the phone
- Severity: high. On My Profile the title sat on the left edge, and the account handle (`bitwarden_tester_tnkqu…`) drew past the right edge of the card.
- Cause: the page wrapper had no horizontal padding. The name was a wrapping heading inside a row whose long handle could grow the card.
- Fix: the page has side padding. The card clips overflow. The name truncates with an ellipsis inside the card.

### 177. Display name and photo did not follow the user
- Severity: high. The header, profile, task cards, bids, services, messages, reviews, and notifications kept the generated username and missed the photo after a profile edit.
- Cause: kind 0 publishes `display_name` and `picture`, but the profile screen preferred the account username and never loaded that event into the signed-in profile. Saving personal info did not update the stores or the profile cache, and the photo field was only a URL. Notifications did not read the sender.
- Fix: the visible name is kind-0 `display_name`, then the legacy name, then the username. The avatar is the kind-0 `picture`. Profile edit uploads a photo, publishes it on kind 0, and refreshes the header, profile, cards, messages, reviews, and notifications.

### 178. Onboarding step 2 is passkey-only and hides a missing authenticator
- Severity: high. Found on production bittasker.com. Onboarding step 2 (Set Up Your Passkey) has no other way forward. With no authenticator, WebAuthn fails with "The operation either timed out or was not allowed." The dialog repeats that sentence and does not say that no passkey or authenticator was found.
- Fix: that failure now says no passkey or authenticator was found, and offers "Continue without a passkey". That path signs the new account in with the Nostr key already created on the previous step, then continues to profile and recovery. The private key is not written to localStorage.
- Fixed in commit `e415f3b654df5bfe98131aba828b2a4d20fa370d`.

### 179. Login with Nostr nsec still forces a passkey
- Severity: high. Found on production bittasker.com. After a valid nsec, login calls `navigator.credentials.create`. A device with no authenticator stops there, so the nsec never signs the user in.
- Fix: nsec login signs the server challenge and opens the session. It does not create or prompt for a passkey. The signer stays in the existing encrypted session.
- Fixed in commit `e415f3b654df5bfe98131aba828b2a4d20fa370d`.

### 180. Signup terms checkbox is too small to tap
- Severity: med. Found on production bittasker.com. The terms checkbox on /auth/signup is a small circle (`checkbox-sm`), so it is easy to miss.
- Fix: the checkbox is a 44 by 44 pixel tap target.
- Fixed in commit `e415f3b654df5bfe98131aba828b2a4d20fa370d`.

### 181. /auth/signup logs console errors on load
- Severity: med. Found on production bittasker.com. Loading /auth/signup logged four SvelteKit warnings, one for each essential locale file (`home`, `common`, `notifications`, `reviews`): "Loading /locales/en/….json using window.fetch". `secp256k1.wasm` was fetched the same way because the auth store pulled the Nostr signer while the root load was still running.
- The red lines in that console are inside Cloudflare Turnstile's challenge iframe. It connects to `data:,` and Turnstile's own connect-src blocks it. This app does not log those, and the captcha still has to load.
- Fix: the root load passes its `fetch` into i18n, and opening signup no longer imports the Nostr signer. Those warnings are gone. The checkbox on that page is item 180.
- Fixed in commit `e415f3b654df5bfe98131aba828b2a4d20fa370d`.


## Production findings (2026-10-20)

### 182–198. Moved to docs/PROD_FIX_LIST.md (P1–P17). These numbers stay reserved; do not reuse them.

## Reviews and notifications (2026-10-20)

### 199. Phone push is not registered on the sandbox
- Severity: med. Production sends FCM pushes from the notification service. rgb.bittasker.com has no that service. The bell updates from a live Nostr subscription while the site is open, and a background browser tab can show a notification after permission is granted. A closed browser does not ping a phone.
- Fix later: register a device token only if a sandbox push service exists. Do not prompt for a passkey to read the bell.

### 200. New-task notices are not limited to matching skills
- Severity: low. Each signed-in user is told about open tasks posted in the last 30 minutes, plus any task posted while the site is open. That is immediate, which production's batched digest was not. A busy relay will fill the bell with tasks outside the user's skills.
- Fix later: filter by the user's skill tags once those tags are on the task event.

### 201. Partial USDT send leaves the change on the spent coin (SDK)
- Severity: critical. Mainnet blocker. Signet tx `05f39d98daca73e8d62e2f081cae327f773b541e22fb29ef1d4833a0f678f4e2` (block 722244). Wallet held 100 USDT on `06e7b411…:1` (691 sats) and sent 30. After settlement `getAssetBalance` is 70 spendable, settled, and future. `listUnspents` still shows that 70 on `06e7b411…:1` with `exists=true`. Esplora says that output is spent by this tx. The tx has one input (that coin), a zero-value OP_RETURN, and `05f39d98…:1` (382 sats, back in this wallet, colorable, no allocation). Four empty 1,000-sat colorable outputs were already in the wallet. No pending receives. Sends of the 70 are refused because the coin is spent. The test funds are not being recovered.
- Cause: this is `@utexo/rln-wasm` 0.17.0-beta.3 / rgb-lib, not our recipient, fee, or donation call. Our `onchainSendBegin` passes invoice, asset id, amount, fee rate 2, and min confirmations 1. The web SDK defaults `donation` to false, which in rgb-lib means "wait for the receiver ACK", not "burn the change". The React Native sandbox (`@utexo/rgb-sdk-rn` 1.0.0-beta.39) uses the same `send` / `onchainSend` arguments and sets `donation: false` when the sender should keep a remainder. rgb-lib builds this exact bitcoin shape for a blinded send (one colored input, OP_RETURN, one wallet output) and is supposed to seal the remainder onto a colorable output. It left the 70 on the input Esplora has spent, and `syncWallet` / `refreshWallet` do not move it. npm has no `@utexo/rln-wasm` newer than 0.17.0-beta.3 (14 Oct 2026) and no `@utexo/rgb-sdk-web` newer than 1.0.0-beta.12. The sdk-web `dev` branch still pins rln-wasm 0.15.0-beta.3.
- What does not fix it: `donation: true` only skips the receiver ACK. rgb-lib `get_change_seal` ignores it and still seals change with `GraphSeal::new_random_vout` on the bitcoin change output. `createUtxos` does not change that target while a change output exists (the failing tx already had four empty 1,000-sat colorable coins). Sending the remainder to ourselves first is still a partial send, so it hits the same seal. A full self-send does not split the allocation.
- Fix: a clean partial send is one transfer with two recipients whose amounts add up to the listed allocation, so rgb-lib's change amount is zero. The payee keeps the blinded invoice. The unsent amount is our own `witnessReceive`, with `witnessData.amountSat` `"1000"` (the value in rgb-lib's `send_to_oneself` test). `donation` stays false. The witness output is created in this transaction, so it cannot be picked as a fee input. The public wallet has no `sendBeginBatch`; the call goes through `wallet._manager.rlnBinding.sendBeginBatch`. This is `@utexo/rln-wasm` 0.17.0-beta.3, which forwards to rgb-lib `v0.3.0-beta.50-bfa`.
- Fallback: the old refusal stays when that split cannot be built. That is a witness payee, a missing batch or witness call, a batch error such as not enough bitcoin for the 1,000-sat output, or a spent allocation that is still listed after one refresh. The button no longer blocks a short amount. The sentence "Sending part of your USDT leaves the rest stuck. Send the full balance. Nothing was sent." is the toast when the split cannot start, and nothing is signed. If Esplora still proves an allocation sits on a spent output after that refresh, the card shows $0 spendable and "{amount} is stuck on a spent coin and cannot be sent." We do not move spare bitcoin, and we do not fail the transfer that already spent the coin.
- Stale list: a spent-but-listed allocation, or any other mismatch between rgb-lib and Esplora, is treated as a stale cache or another session. The wallet shows "Refreshing wallet…", runs rgb-lib refresh plus a UTXO resync, re-reads Esplora, and only then shows the stuck or refuse sentence. That retry happens once. Every send refreshes before the split or the refusal is decided.
- Other session: same-browser tabs share a localStorage heartbeat lock per wallet fingerprint, with a BroadcastChannel so the other tab is seen at once. Another browser shows the same warning when the allocation list changes underneath this session. The warning is "This wallet is open in another tab or browser. Close it or refresh", with a Refresh button. Sends stay blocked until this session is the only lock holder.
- Fresh USDT: send part of a new receipt whose allocation is on an unspent output, with a separate coin that can pay the 1,000-sat witness output and the fee. The payee should receive the typed amount and this wallet should list the remainder on a new output. Repro of the single-recipient bug for UTEXO: `docs/UTEXO_PARTIAL_SEND_ISSUE.md`. A live signet send was not run in this environment.

## BitTasker Credit (2026-10-20)

### 202. Credit cannot repay from one escrow coin until change is safe
- Severity: high for a live credit send. Found while building the BitTasker Credit beta (2026-10-20).
- A completed job has to pay the lender (advance + fee) and then the tasker (the remainder) from one escrow coin. That is two other recipients. Item 201 keeps the sender's own remainder. It does not pay two other people.
- The beta records the split and refuses to broadcast it. `createUtexoCreditAdapter` does not call `onchainSend`. The sandbox test ledger settles the same numbers in memory and says so on the screen.
- A real send is allowed by `assessFullAllocation` only when the amount is the entire coin. Do not remove that guard to "make repayment work". A repayment needs one transfer whose recipients are the lender and the tasker and whose amounts add up to the coin. That call is not wired.

### 203. nostr-tools keeps a verified flag that survives a copied event
- Severity: low. `finalizeEvent` sets an enumerable `Symbol(verified)` on the event. Object spread copies that symbol. `verifyEvent` then returns the cached flag and does not look at a replaced signature.
- Found while checking credit events (2026-10-20). Credit verification builds a plain event and checks the signature again (`src/lib/credit/events.ts`).
- The other `verifyEvent` call (`homepageFetch`) verifies the relay's own object, so it does not hit this. Any new code that copies an event and then verifies the copy needs the same plain-object check.

## Wallet screen (2026-10-20)

### 204. The main wallet shows the transaction list
- Severity: low. The wallet page put a Details heading, a USDT card (Refresh transfers, a count, and "No USDT transactions yet"), and a Bitcoin card (a count and Sent/Received rows) on the same screen as the balance.
- The main screen keeps the balance, Send, Receive, Buy with card, and one Transactions button. The ready dot stays in the header.
- Transactions opens `/wallet/transactions`. One list mixes USDT and Bitcoin, newest first. A row is an icon, Sent or Received, a dollar amount, sats or USDT under it, and a relative date. Tap a row for the detail. The transaction id and the explorer link show only in Advanced mode.
- Transfers refresh in the background. Pull down at the top of the wallet or the list to refresh. The Refresh transfers button is gone.

### 205. A partial USDT send told the sender to send the whole balance
- Severity: high. On rgb.bittasker.com a send of 33 USDT from about 100 was refused with "Sending part of your USDT leaves the rest stuck. Send the full balance. Nothing was sent." Nothing was broadcast.
- The guard is `PARTIAL_SEND_BLOCK`. It fired when the remainder could not be named in the same transfer (`beginRemainderSend` returned nothing, or the batch failed) and again in `assertChangeReturns` if that remainder was never assigned. An unknown Esplora reading also blocked every short payment before the remainder was tried.
- A short payment now names two recipients whose amounts add up to the listed allocation. The payee keeps the blinded invoice. The unsent USDT is our own witness output (`wvout`, 1000 sats) or, when a witness output cannot be opened, our own blinded seal (`utxob`). `donation` stays false. The bitcoin fee cap is unchanged, and a bitcoin send that would spend its change as fee is still refused.
- When no spare colorable coin exists and vanilla bitcoin does, the wallet creates one output first (`createUtxos`, up to false, one output, 1000 sats, 2 sat/vB), shows "Making a coin for the rest of your dollars…", then sends. It does not build that coin from the output that already holds the USDT. If the change still cannot be created, the error is "Add a little bitcoin so the rest of your dollars can stay in this wallet. Nothing was sent." The old "send the full balance" sentence is not shown.
- A spent allocation that is still listed still refuses the short payment before it is signed. A full-balance send still uses the single-recipient path and does not create a coin. No live signet transaction was broadcast for this fix.

### 206. RGB receives never settled, and Settings was blank
- Severity: high. Escrow smoke tests on rgb.bittasker.com could not receive USDT. Wallet "Grok Bot Tasker 2" created `rgb:~/~/nWca/sb:utxob:9RcSoRL7-…`. The UTEXO faucet paid 100_000_000 units of `rgb:f~9F4X0C-TiLOTvy-pALF29V-2xJ2p0m-hP3_vpW-Alj4G5Y` in `e16f7bcd23071a8f34401b831793d6e38bd053d73141ebb3140f73df0e6c4d13` (block 726283). The wallet stayed at 0.00 USDT. The only new row was "Received 0.001111 USDT". A 50_000-sat payment `b3a09151316e3ec9c13dcb56ecc49c445fa7535f42f0285591022c46a5b3636b` (block 726275) also stayed out of the balance, which remained 149,691 sats. `/settings` showed no cards.
- Two causes. The sandbox build set `VITE_RGB_USDT_ASSET_ID` to `rgb:2s69152-…`, which `getConfiguredRgbUsdtAssetId()` rejects. Receive then hid the amount field and created a blank invoice for 1,111 units. rgb-lib encodes 1,111 as `nWca` and 100_000_000 as `adFZnbk`. A consignment whose amount does not match the invoice does not settle, so the faucet's 100 USDT never became a balance. Separately, an offline balance scan called `goOnline` with Blockstream or mempool testnet. The SDK keeps the first indexer for the session and ignores a later UTEXO URL, so confirmed signet transactions never entered the wallet.
- A receive now names the faucet contract when the env id is missing or rejected, and an empty amount asks for 100 USDT. The sandbox deploy bakes `rgb:f~9F4X0C-TiLOTvy-pALF29V-2xJ2p0m-hP3_vpW-Alj4G5Y`. Bitcoin sync and the address fallback use `https://esplora-api.utexo.com`. Escrow no longer throws "USDT asset not configured" on the rejected placeholder. Transaction rows show Pending, Confirmed, or Failed. Settings draws the card grid while keys are still loading, and a failed key load no longer replaces the page.
- Repair wallet is safe on a funded wallet. It syncs, asks the proxy to refresh, fails stale unpaid invoices, and drops allocations on outputs Esplora already shows as spent. It does not sign or broadcast a send. It cannot make the already-created 1,111-unit invoice accept the 100 USDT that was paid to it. Create a new receive for 100 USDT after this deploy, then pull to refresh or press Repair wallet. No live signet transaction was broadcast for this fix.
- Lightning "unavailable" is the channel status (the signet channel is not open). It is not what blocked the on-chain USDT receive.
- Priority: deposit visibility stays #1. Onboarding resume and the passkey hang (207–209) come after it.

## Onboarding (2026-10-21)

### 207. Reloading onboarding dropped the half-created account
- Severity: high. Reloading `/auth/onboarding` on rgb.bittasker.com sent the person back to `/auth/signup`. The display name, username, and the key created on step 1 lived only in the page, and the captcha check lived only in memory.
- A reload now stays on onboarding when the signup check is still in this tab, or when an onboarding draft is. The draft (step, display name, username, npub, and the hex key) is sessionStorage for this tab. It is not written to localStorage. The signer is applied again from that key. Finishing onboarding clears the draft. The saved step is used instead of jumping to profile.

### 208. Passkey setup could spin on "Setting up…" with Back disabled
- Severity: high. Step 2/5 called `navigator.credentials.create` and waited with no app timeout. Back was disabled for the whole wait, so a password manager that never answered left the page stuck.
- The create now rejects after 60 seconds, including when the provider ignores the WebAuthn timeout. The page shows an English or Spanish error, a Retry button, and "Continue without a passkey" (the Nostr key). Back stays enabled and cancels the in-flight create.

### 209. A pending or failed passkey create never settled
- Severity: high. A non-Bitwarden WebAuthn provider left `navigator.credentials.create` pending. A second create then hit "a request is already pending" or failed, and the page stayed on "Setting up…".
- The previous create is aborted before Retry starts another one. An already-pending or failed create rejects at once, clears the in-flight slot, and shows Retry plus the Nostr-key option. It does not leave the spinner up.

### 210. nsec login shows "WebAuthn verification fields are required"
- Severity: high. Login with a Nostr key on rgb.bittasker.com opened a modal with the raw sentence "WebAuthn verification fields are required". That blocked the escrow counterparty account `npub1rsxavxk42lg6p5thya087h4v0t79t7zu0qsxyqamfqadjwcqgafsnfrudq`.
- Cause: `POST /api/v1/auth/login/nostr` on api-staging.bittasker.com requires `clientDataJSON`, `attestationObject`, and `passkeyPubkey` even when `authMethod` is `nsec`. The sandbox login sends those fields empty and signs the server challenge with the key.
- Fix: an nsec login skips the passkey assertion. The API accepts a Schnorr-signed kind 22242 challenge or a NIP-98 kind 27235 challenge, checks the event id, and checks the signature. It does not replace an existing passkey. The encrypted-data lookup verifies the same signature and leaves the challenge in place, and the sandbox login signs a new challenge before it posts. A failed nsec login shows "Could not sign in with that Nostr key. Check the key and try again." in English and Spanish, without the WebAuthn modal.
- Deposit visibility (206) stays priority #1.

### 211. Buy with card omitted El Salvador
- Severity: high. Wallet > Buy with card listed the United States, Canada, the United Kingdom, the Netherlands, Germany, France, Spain, Brazil, Australia, and Mexico. El Salvador, the home market, was missing, and so were Bolivia, Colombia, Guatemala, Honduras, Costa Rica, and Argentina.
- The menu now comes from `GET /v1/available-countries` through the Worker. El Salvador is selected when that list includes it. Before the provider answers, the menu includes those countries. A successful provider list is used as it arrives, so a country the provider does not sell is not forced into a live quote.

### 212. The card screen had no way back to the wallet
- Severity: high. Buy with card opens a full-screen panel. It had no Back or Close, and the Android hardware back button did not leave it, so the wallet underneath could not be reached.
- Back closes the panel and returns to `/wallet`. The Android hardware back button and the browser back button do the same.

### 213. "Changelly Fiat API is not configured" was shown in red
- Severity: high. A quote against a Worker without Fiat API keys showed that sentence as a red error, and See offers stayed on the screen.
- The Worker answers `{ configured: true|false }` and does not include the API key or the private key. When it is false, See offers is hidden and the page says "Card purchases are not available right now. Try again later." in English and "Las compras con tarjeta no están disponibles ahora. Inténtalo más tarde." in Spanish.

### 214. A USDT invoice needs the wallet on this device
- Severity: medium. A phone that has opened the wallet can create a USDT invoice. A browser that has not finished opening the wallet cannot: `receiveUsdtInvoice` throws "Wallet not initialized" when there is no wallet instance. The earlier blank `nWca` invoice came from a wallet that was open and did not name the faucet asset. That path now names the faucet contract. Another browser is a different wallet and does not hold the phone's coins.
- Receive stays closed until this device's wallet is connected. The page says to open the wallet on this device before creating a receive code.
- Deposit visibility (206) stays priority #1.

### 215. Tasker 2 still shows 0 USDT after the faucet payment, and Lightning asks for 309 sats
- Severity: high. After a reload, wallet "Grok Bot Tasker 2" is connected and shows 199,691 sats, so the 50,000-sat deposit `b3a09151316e3ec9c13dcb56ecc49c445fa7535f42f0285591022c46a5b3636b` synced. USDT stays 0. The faucet paid 100 USDT of `rgb:f~9F4X0C-TiLOTvy-pALF29V-2xJ2p0m-hP3_vpW-Alj4G5Y` in `e16f7bcd23071a8f34401b831793d6e38bd053d73141ebb3140f73df0e6c4d13` (block 726283) to `tb1pzdq07v8euw8zrz3jsgqlvx2ecemg77pw7pz3m2cd06tw44c7ugdqzxhydy`, an output this wallet already counts. Receive > Tether USD (RGB) showed "USDT asset not configured", and Receive USDT threw "Something went wrong. Tap to reopen." Jon's own device can create a USDT invoice. Lightning said "Needs funding, add 309 sats" against a 200,000-sat hosted channel.
- The contract is per wallet. A refresh that names the faucet id before this wallet has imported it throws, and that throw can kill the wasm engine, so the next Receive shows the reload line. A blank 1,111-unit invoice still cannot settle a 100 USDT consignment. The hosted LSP opens its own channel. This wallet does not have to hold 200,000 sats for that.
- Refresh transfers accepts every pending incoming transfer without naming an unregistered contract, then refreshes the USDT id once `listAssets` has it. The button is on the wallet. A receive tries that refresh before it invoices. If this wallet still does not know the contract, it says "This wallet has not registered USDT yet. Refresh transfers, then try again." in English and "Esta billetera todavía no tiene registrado USDT. Actualiza las transferencias e inténtalo de nuevo." in Spanish. It does not create a blank invoice and it does not show the reload line for that failure. Lightning asks for sats only when on-chain bitcoin is under 10,000. 199,691 sats stays on "Setting up".
- The old 1,111-unit invoice cannot be rewritten into the 100 USDT payment. Refresh transfers accepts a consignment that matches a pending receive. Create a new 100 USDT receive after this wallet lists the contract. No live signet transaction was broadcast.
- Deposit visibility (206) stays priority #1.

### 216. Older wallets cannot receive USDT, and $100 sits on a spent coin
- Severity: high. Wallet "Grok Bot Automate 2" shows 49,382 sats, 0 USDT, and "$100.00 is stuck on a spent coin and cannot be sent." Receive > Tether USD (RGB) says the contract is not registered. Receive USDT stays on Preparing for about 25 seconds, then says "Invoice amount does not match the amount entered" even though no amount was entered. Jon's device can create a USDT invoice. The same receive fails on both bot wallets created before this contract was imported.
- A receive no longer waits on a chain refresh before it makes the invoice. That refresh was the Preparing wait. When this wallet already lists USDT, the invoice names that contract and the entered amount. When it does not, and the engine refuses the faucet id or returns an invoice with no amount, the wallet creates a blank invoice and leaves the amount unset. A blank invoice is not checked against an entered amount. The sender, such as the faucet, chooses the asset and the amount. A blank invoice that encodes 1,111 units is still not used.
- The stuck $100 is recovered by refreshing the transfer, not by failing it. A balance load that sees a spent listing asks the proxy to refresh and reads the outputs again. It does not call failTransfers. Failing that transfer drops the consignment, and the dollars cannot be put back. An unconfirmed spend stays as pending dollars instead of a stuck coin. A saved spent proof does not hide a balance this check marked pending. Repair wallet still fails stale unpaid rows when someone presses it. It is not required to bring this $100 back.
- Deposit visibility (206) stays priority #1.

### 217. Tasks and services disappeared from rgb.bittasker.com
- Severity: high. The homepage, task list, and service list showed nothing. The live bundle `623ba3036` was deployed successfully. It was not a failed deploy.
- Cause: listing reads used `VITE_NOSTR_RELAY_URL` (`wss://nos.lol`) and `VITE_NOSTR_TASK_RELAY_URL` (`wss://relay.primal.net`). Those relays return kind 31000 and 30402 events, but they are not BitTasker tasks or services, so the pages filtered them out. BitTasker tasks and services are on `wss://relay2.bittasker.com`. `wss://relay1.bittasker.com` has tasks and no services. Recent wallet commits did not change this routing. Each sandbox deploy rebuilt the same nos.lol / primal split. That split was added so the sandbox would stay off relay1-dev and relay2-dev after those relays asked for AUTH.
- Fix: sandbox builds set `VITE_NOSTR_LISTING_RELAY_URL` to `wss://relay2.bittasker.com`. Task and service reads (kinds 31000, 30402, 30403, and 30404) use that catalog relay. The homepage fetches it in the browser, because the site is a static shell and a server-only fetch never reaches the page. A service event that is not a BitTasker listing is skipped instead of clearing the page. Messages stay on `wss://nos.lol`. New publishes stay on the general relay. No live signet transaction was broadcast.
- Deposit visibility (206) stays priority #1.

### 218. Confirmed USDT receives stay at 0 until the wallet refreshes the proxy
- Severity: high. Tasker 2 created `rgb:~/~/nWca/sb:utxob:5qmVXNyy-...`. The faucet sent 100 USDT in `8fb72bb1a649eb26492212763f9776ce743079f2776ef59ab9e4bba391a872f8`, confirmed at block 726315. After 15 minutes and four reloads the wallet still showed 0 USDT and no transfer. The same happened for `b61437e9` and `e16f7bcd23071a8f34401b831793d6e38bd053d73141ebb3140f73df0e6c4d13` (block 726283). The faucet says the receiver must refresh transfers. The page only had Repair.
- A reload started the wallet save and then skipped the refresh, so those reloads never asked the proxy for the consignment. Refresh now waits out that save (up to 15 seconds), sets the proxy to `rpcs://rgb-proxy.utexo.com/json-rpc`, and calls refresh with no asset id so the consignment can be imported. Once this wallet lists USDT, it refreshes that id. It does not pass the faucet id in before the wallet knows it. It does not fail the transfer. This runs on load, every 20 seconds, and from Refresh transfers on the dollar card.
- Repair does not sign or broadcast. Before this fix, Repair failed an expired WaitingCounterparty receive, including ReceiveBlind. The invoice lasts one hour, so `e16f7bcd` and possibly `b61437e9` could have been dropped once they expired. Repair now keeps every ReceiveBlind and ReceiveWitness. Use Refresh transfers. Cancel is still an explicit button.
- `nWca` is 1,111 units, not 100 USDT (`~` or `adFZnbk`). A 100 USDT consignment does not match that invoice. Refresh still runs, and these three payments are not failed. A new invoice with `~` or `adFZnbk` is what matches 100 USDT. No live signet transaction was broadcast.
- Deposit visibility (206) stays priority #1.

### 219. Direct messages die when nos.lol does not answer
- Severity: high. On rgb.bittasker.com `/messages`, the list says "Failed to load conversations: wss://nos.lol timed out", and sending says "Message was not delivered. wss://nos.lol could not be reached." Chat used only `VITE_NOSTR_RELAY_URL`. A valid npub in New Message showed "No profile found" and a failed lookup blocked Start chat. "Approve with your passkey to continue" appeared on load and on the first send without a passkey window, because a relay timeout was treated as a passkey error and two callers raced the session signer.
- Direct messages now read and publish on `wss://relay.damus.io`, `wss://nos.lol`, `wss://relay.primal.net`, `wss://relay1.bittasker.com`, `wss://relay2.bittasker.com`, the configured relays, and each person's NIP-17 kind 10050 inbox relays. A send is delivered when any relay accepts. A load succeeds when any relay answers. Tasks and services stay on the catalog relay. A valid npub can start a chat when no profile is found. Signing reuses the session key already unlocked at login. A relay timeout is not a passkey prompt. No live signet transaction was broadcast.
- Deposit visibility (206) stays priority #1.

### 220. Sandbox direct messages use the same relays as dev, staging, and prod
- Severity: high. Dev, staging, and production chat works. Sandbox chat was aimed at public relays (`wss://relay.damus.io`, `wss://nos.lol`, `wss://relay.primal.net`) plus `wss://relay1.bittasker.com` and the catalog relay `wss://relay2.bittasker.com`. Working sites write kind-4 messages only to `VITE_NOSTR_RELAY_URL`. `wss://relay2.bittasker.com` is the task relay, and the dev DM relay `wss://relay1-dev.bittasker.com` was missing. `PUBLIC_NOSTR_RELAY_URL` is not set in `.gitlab-ci.yml` or the current env files. The old `.env.example` value `wss://relay.bittasker.hedgehackers.finance` was replaced on 27 Mar 2026. Live bundles bake `VITE_NOSTR_RELAY_URL` from the GitLab environment scope, and that is the only DM relay each site uses.
- Dev (`dev.bittasker.com`, release `d8f357d2`): `wss://relay1-dev.bittasker.com`. Tasks stay on `wss://relay2-dev.bittasker.com`.
- Staging (`staging.bittasker.com`, release `eee9c9a1`): `wss://relay1.bittasker.com`. Tasks stay on `wss://relay2.bittasker.com`.
- Prod (`bittasker.com`, release `4d3f8a08`): `wss://relay1.bittasker.com`. Tasks stay on `wss://relay2.bittasker.com`.
- Sandbox DMs now use that same set, in this order: `wss://relay1.bittasker.com`, `wss://relay1-dev.bittasker.com`, then the public fallback `wss://relay.damus.io`, `wss://nos.lol`, `wss://relay.primal.net`. A send still counts when any relay accepts. A load still succeeds when any relay answers. NIP-17 inbox relays are still added. Tasks and services stay on `wss://relay2.bittasker.com`. Sandbox `VITE_NOSTR_RELAY_URL` stays `wss://nos.lol`, so the deploy guard that rejects relay1-dev and relay2-dev in that variable still holds. No live signet transaction was broadcast.
- Deposit visibility (206) stays priority #1.

### 221. A new account shows another wallet's sends
- Severity: high. Account `defi_research_duzz4q` (created Oct 20, receive address `tb1pat0667pk0el9ucd2sf725vkttxqs9c774gdfm2tgfzp946n0jzjs9p3vaa`) showed 49,691 sats, "BTC Sent 50,000 Confirmed", and two "USDT Sent 10.00 Pending" rows dated before the account existed. That browser had signed in as Tasker 2.
- On UTEXO signet (`https://esplora-api.utexo.com`, not mempool.space) the address received 50,000 sats in `368a8a9be38c45be0b5845b01784c0068994bb8789ac4dde2801302bc0ca9700` (block 726490, 2026-10-21T03:55:34Z) and spent that output in `a641a38cfc86844eb5256823c558f9b6f0537b38962eb3b05d184c84c3d99bc1` (block 726507, 2026-10-21T04:04:16Z, fee 309). The spend paid 1,000 sats to `tb1pmxktwe5fut04tmzszhmqj2ht4vq33ptdsff638nygdl7kfy3uazqyhpc3v` and 48,691 sats to `tb1pz9fpng5wwevph0yc8alrfecszg62x0lm3x5eplrtchl4gcmzj26sn69xp2`. 1,000 + 48,691 = 49,691. The receive address itself now has no coins. The "Sent 50,000" line was that spend counted as the whole input while the wallet still held the change. A setup spend and a change-only spend are no longer listed as a payment. The faucet receive stays.
- The USDT rows were not this account's transfers. `bittasker.usdt-sends`, the spent-proof cache, cancelled receives, contract payments, and escrow resume used one localStorage slot for every login. The wallet snapshot used `active` when the pubkey was missing. Logout now deletes that account's copies and the old shared slots. A reload only reads the signed-in pubkey. The RGB database stays per master fingerprint (`rln_<fingerprint>_signet`). Restore no longer treats another account's database as this wallet. No live signet transaction was broadcast.
- Deposit visibility (206) stays priority #1.

### 222. Sandbox direct messages use relay1, then nos.lol and damus
- Severity: high. Scott's handover: production writes every non-task event, including direct messages, to `wss://relay1.bittasker.com` and tasks to `wss://relay2.bittasker.com`. Dev uses `wss://relay1-dev.bittasker.com` and `wss://relay2-dev.bittasker.com`. `wss://relay.bittasker.hedgehackers.finance` is old and unused. All of these relays are hosted on Railway.
- Sandbox CI (`deploy-sandbox` in `.gitlab-ci.yml`) sets `VITE_NOSTR_LISTING_RELAY_URL` to `wss://relay2.bittasker.com`, the production task relay, and `VITE_NOSTR_RELAY_URL` to `wss://nos.lol`. The job uses the GitLab environment name `development`, so a development-scoped `relay1-dev` would otherwise leak in. The job variables and the script exports override that, and the build stops if `VITE_NOSTR_RELAY_URL` contains `relay1-dev` or `relay2-dev`. Sandbox therefore matches production, not dev.
- Sandbox DMs now publish and load `wss://relay1.bittasker.com` first, then `wss://nos.lol` and `wss://relay.damus.io`. `relay1-dev` and `relay.primal.net` are no longer on that list. A send still counts when any relay accepts. A load still succeeds when any relay answers. Each person's NIP-17 inbox relays are still added. Tasks and services stay on `wss://relay2.bittasker.com`. `VITE_NOSTR_RELAY_URL` stays `wss://nos.lol`. No live signet transaction was broadcast.
- Deposit visibility (206) stays priority #1.

### 223. A USDT deposit shows on this pubkey after sync
- Severity: high. A sandbox wallet could refresh and still show $0.00 with no USDT row after a payment had already landed in its transfer list. A spent-coin check zeroed the balance, and a receive whose amount lived on the assignment or the invoice never became a history row. The same browser could also keep that receive on a shared slot.
- After sync, a receive that is Settled, confirming, or paid and waiting is added to the balance when its output is not already counted and is not one of the spent outputs. $1 is 1_000_000 units. A spent output stays at zero. The receive is stored as `bittasker.usdt-receives.<npub>` and is dropped on logout. Another pubkey does not read it. Refresh transfers, the 20 second check, and opening the wallet all run this. No live signet or mainnet transaction was broadcast.
- Deposit visibility (206) stays priority #1.

### 224. Grok Bot Automate 2 still has $100 on a spent coin, and Repair cannot move it
- Severity: critical. npub `npub1dkxft0h3v6u64ek6ujghtravvdgcp59a6tcsd5eu7kd05mp4l2tq6dq0cs` shows Dollars $0.00, "$100.00 is stuck on a spent coin and cannot be sent", and Repair wallet. The $1 USDT test does not press Repair.
- Chain, checked 21 Oct 2026 on `https://esplora-api.utexo.com` (not mempool.space). The 10 USDT send is `e2e3353694366d121be6f5d2bb37c6f7a059a68dfa25bfceb07f609d6e0c2f6a`, confirmed in block 723484. It spends the only colored coin `d9053881e0257f59f5aa5f92550ce31f034609b0a06959f3d341ef0829d0bc4f:1` (1,000 sats, `tb1p5222yds4xwef6csnjurgq3j2um7v3nnuza7nma627kqlv7vwjdhsx92gan`). That outpoint is spent. The transaction has an OP_RETURN commitment and one wallet output, `e2e3353694366d121be6f5d2bb37c6f7a059a68dfa25bfceb07f609d6e0c2f6a:1` (691 sats, `tb1plyq36jewzk53djn4gx0p7haga8gwk5hnxjac843zw79ch859fwnquxn748`). That change output is still unspent. Fee was 309 sats. rgb-lib never wrote the USDT remainder onto that output. `listUnspents` still books the old 100 USDT on the spent input, so the page shows $0.00 spendable and the stuck line.
- No call in `@utexo/rln-wasm` 0.17.0-beta.3 (still the latest on npm) moves that booking. `sync`, `refresh`, and `fullScan` do not. `failTransfers` on the send that spent the coin deletes the change consignment, and nothing can put it back. The OP_RETURN is only a 32-byte commitment, not the consignment. A new send would try to spend an output Esplora has already spent, so it is not broadcast. Creating new colorable coins does not attach this USDT to them.
- Repair wallet is safe and does not make this $100 spendable. It does not sign and it does not broadcast. It syncs, refreshes from `rpcs://rgb-proxy.utexo.com/json-rpc`, fails only stale unpaid outgoing rows (expired, never broadcast, or sitting on the spent output), and leaves every incoming receive and the send that spent the coin. Unlock already runs that same function. Pressing the button runs it again. Afterward the allocation is still on the spent coin, so the card stays $0.00 and the stuck line stays. A later $1 receive on a new unspent output is added on its own. It does not revive this $100. No live signet or mainnet transaction was broadcast.
- Deposit visibility (206) stays priority #1.

## Simple wallet v2

Simple mode, for someone who does not know Bitcoin. Few words, large actions. Reference wallets: Blink, Glow, Amber, Blitz. Blink shows a TOTAL BALANCE header, four round actions (send, receive, add, swap), a scan icon at the top left, and an Activity list.

1. The balance cards say Dollars (USDT) and Bitcoin. Spanish: Dólares (USDT) and Bitcoin.
2. One USD total sits above the cards. The Dollars card and the Bitcoin card stay separate underneath.
3. Receive Bitcoin asks for sats and shows the USD amount while typing. Type USD switches the field and converts back to sats. Skip and Close stay. Receive dollars still asks for dollars.
4. Bitcoin, Lightning, and USDT receive screens each show a QR code, Copy, and Share.
5. Simple mode has a camera scanner at the top left. Send has one too. A scan accepts a Bitcoin address, a `bitcoin:` link, a Lightning invoice, or an RGB invoice, then opens Send with that destination.
6. Simple mode does not say RGB and does not show the “USDT asset not configured” banner. That banner stays on Advanced.

Items 1–6 shipped first. The home actions and the activity list changed in the continuation below. Deposit visibility (206) stays priority #1.

### Simple wallet v2, continued (Blink, Amber, Breez)
7. Home order is the USD total, then the Bitcoin card, then the Dollars card, then four round buttons: Receive, Send, Scan, Transfer.
8. Receive is two tabs, Bitcoin and Dollars. Each tab has its own QR, Copy, and Share. Set amount is optional. The amount row is USD and sats side by side, with a swap control, a live conversion, and $10, $50, and $100 chips. Close stays on the sheet.
9. Send opens the camera immediately, with Paste and Type. The typed field lists the accepted formats. Invalid text is red under the field and Continue stays off. A failed camera leaves Paste and Type on the sheet. Simple mode does not sit on Preparing.
10. The scanner adds From gallery and From clipboard.
11. Send, Receive, and Transfer open as bottom sheets. Each sheet has Close and returns to the wallet.
12. Home shows the last three activity rows and a View all link to the transactions page.
- Transfer quotes 25, 50, 75, or 100 percent of Bitcoin or dollars and shows the other side from the Bitcoin price. It does not broadcast. There is no in-wallet exchange. Review ends with "Nothing was sent."
- The one total switches between USD and sats. USD is the dollar balance plus Bitcoin at the current price. Sats are the Bitcoin balance plus dollars at that price. When the price is missing, the dollar total leaves Bitcoin out and the sats total leaves dollars out, and the line under the total says the price is unavailable. The Bitcoin card, the Dollars card, the receive QR, and the send camera stay. Deposit visibility (206) stays priority #1.

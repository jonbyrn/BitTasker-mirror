# BitTasker production (bittasker.com, RSK/rBTC) fix list

Bugs found on production bittasker.com, the Rootstock/rBTC version. Sandbox (RGB) bugs stay in `docs/FIX_LIST.md`. The old sandbox number is in brackets. "Sandbox fixed, port" means rgb.bittasker.com already has the fix and it only needs to be ported to prod.
Started 2026-10-20 from Jon's prod smoke test (account "David Rollo").

### P1. HIGH: Contract shown funded before on-chain confirmation [194]

Accept & fund showed "Bid Accepted & Contract Funded" and moved the task to In Progress while the panel still said "Confirming on-chain and syncing your contract…". No tx hash and no confirmations were shown, and the user could leave the page. Fix: show a pending state with the tx hash. Do not create the contract, mark it funded, or move the task until the funding tx confirms. Roll back if it fails. Keep the user informed after they navigate away. Funding tx (Rootstock): `0xb8c42a235e7312e7606286eed30676074b79985de754453f09669adbc0aaad36`.

### P2. Passkey prompt on every page load blocks the page [182] (Sandbox fixed, port)

Every reload asks for the passkey: message threads, Profile, and Get Quotes in task create. Pages hang ("Loading messages…", Settings) until it is approved. Fix: reuse the login session. Ask for the passkey only for login, unlock, funding, and escrow (sandbox item 148).

Fixed in `hotfix/prod-batch-2`: page-load key reads no longer call WebAuthn. A prompt runs only inside login, an explicit unlock, funding, or escrow.

### P3. DM thread fails after reload, sent messages vanish, old draft returns [183]

After a reload and passkey approval the thread said "Failed to load messages" until another reload. Sent messages can disappear until a reload. An old unsent draft comes back after a send. Fix: show the sent message at once and keep it. Clear the draft on send. Load the thread once signing is ready.

### P4. No unread indicator for new DMs [184]

The bell showed 10, but new DMs had no clear unread mark, and the Messages nav has no badge. Fix: unread count on Messages, and DM entries marked unread in the bell.

### P5. Avatar upload fails silently [185]

On /profile/edit, Add Images opened no file dialog. With a file set it showed Compressing → Uploading… and a preview, but after Save and reload the avatar was still initials. The only toast was "Skills saved successfully!". Fix: open the file picker, show upload errors, and save and display the picture.

Partly fixed in `hotfix/prod-batch-2`: the saved profile metadata includes `picture` from the first uploaded image, and that image is marked primary. The file bytes were still dropped. See P36.

### P6. Create Task: empty skills list, no Copywriting, date-only deadline [186]

The skills dropdown shows nothing, so a skill has to be typed. There is "Writing & Editing" but no "Copywriting". The deadline takes a date only. Fix: fill the skills list, add Copywriting, and allow a time on the deadline.

Partly fixed in `hotfix/prod-batch-2`: the skills dropdown uses the onboarding catalog, including Copywriting. The deadline time is still open and was not part of this PR.

### P7. Posted tasks have no shareable URL [187]

Task details open only as a side panel on /hiring/my-tasks. Fix: give each task its own page at `/tasks/<id>`.

Fixed in `hotfix/prod-batch-2`: `/tasks/<id>` renders the task loaded for that URL, and list, dashboard, and map actions open that URL. A refresh keeps the task that the route already loaded.

### P8. Onboarding step 3: "NDK signer not configured" [188, same as sandbox 93]

Onboarding step 3 fails with this error.

### P9. Header dropdown hides the title line [189]

Minor. The account dropdown does not show the user's title.

### P10. A new bid creates no notification [190] (Sandbox fixed, port)

The poster is not notified of new bids, and the bell lists only messages. Fix: notify on new bids and on bid and escrow changes (sandbox item 151).

### P11. Passkey prompt on bids page load [191] (Sandbox fixed, port)

Opening a task's bids page asks for the passkey, and the list stays on "Loading…" until it is approved. Fix: load bids with the session (sandbox item 148).

Page-load portion fixed in `hotfix/prod-batch-2` with P2. Reading bids does not prompt.

### P12. Late passkey approval leaves "Failed to load messages" with no retry [192]

The thread shows "Failed to load messages. The operation either timed out or was not allowed." with no Retry. Fix: a plain message with a Retry button, plus an automatic reload once signing is ready.

### P13. Accept & fund total jumps when the network fee loads [193]

The total went from $15.79 to $15.98 when the network fee arrived. The poster pays the bid + 2.5% platform fee + about $0.61 network fee. Fix: show the breakdown before accepting, and disable Accept until the total is final.

### P14. Refunded task shows Completed with no bids [195]

After a refund triggered by the Taskee, the task showed "Completed" with a new "Posted 10:18 AM" time, no bids, no Accept, and only a greyed-out Delete. Fix: a refunded task goes back to Open (or offers Repost) with its bids kept, and is never marked Completed. Refund tx: `0x7ade486dff77c1db4fd5eb6f4458255f015e4d0cc552e1d0aef55c4a564982f1`.

### P15. Funding escrow shows no signing prompt, while read-only pages do [196] (Sandbox fixed, port)

The prompts are the wrong way round. Fix: prompt for funding, escrow, and sends, and never for reads (sandbox item 148).

Fixed in `hotfix/prod-batch-2`: funding and escrow initialize the wallet with a prompt. Read-only page loads do not.

### P16. /wallet shows "No Wallet Found / Wallet Connection Error" after a funding tx [197]

This appeared straight after a successful funding send. Fix: the wallet stays connected and shows the pending or confirmed tx.

### P17. /hiring/contracts asks "Load signing keys" on every visit and hangs [198] (Sandbox fixed, port)

Each visit raised 3 passkey prompts. One timed out with no clear message, and the page then sat on "Unlocking your Nostr identity…" for over a minute. Fix: load with the session, with a plain timeout message and Retry (sandbox items 148 and 134).

Page-load portion fixed in `hotfix/prod-batch-2`: the contracts list syncs a signer already in the session and does not prompt. The load-keys button still prompts.

### P18. HIGH: Submit work is locked until the bid start time, and the UI does not say so

On the second test task, "Translate a short café menu from English to Spanish", funding confirmed on-chain (tx `0xd6320a89b52d9e1f59568dba67c658c327de9085a94339e3932405df20327137`, 10:32 AM CST, Oct 20 2026). The contract showed "Funded" and "Contract Initiated", but submitting work stays locked until the bid's start time (11:27 AM CST in this test). The UI gave no reason and showed only Refund and Cancel, so the Taskee (Jon) thought submitting was broken and refunded. The first test task did the same.
The start time is required: the RSK smart contract needs absolute timestamps, so the lock stays. The fix is UX only:

- A plain message, e.g. "You can submit work from 11:27 AM".
- A countdown to the start time.
- The Submit work button visible but disabled until then.
- A warning to the Taskee when they pick the bid start time that they can't submit work before it.
- Refund and Cancel are never the only actions shown without an explanation.

### P19. MEDIUM: Bidders cannot delete or withdraw a bid once sent

Found Oct 20 2026 on bittasker.com: Jon had stale bids with past start times on "Proofread a 600-word blog post about coffee brewing" and no way to remove them. Fix: a "Withdraw/Delete bid" action for the bidder on bids that have not been accepted or funded, with the poster's bid list updated in real time.

### P20. HIGH: Funding fails late if the bid start time is under 5 minutes away

On Accept & fund, the contract call returned "Validation failed: Estimated start time must be at least 300 seconds in the future" after the user had already reviewed the total (bid $4.13 / 5,001 sats, start 10:45 AM CST, funded 10:42 AM CST). The accept dialog also warned "estimated start time was in the past... contact the Taskee". Fix:

- The bid form enforces start ≥ now + 5 min and shows the minimum allowed time.
- The accept dialog checks start ≥ now + 300 s before enabling Fund, and lets the poster propose or adjust a new start time (or automatically asks the Taskee to update it) instead of failing.
- Accept is disabled on stale bids.
- Timestamps stay absolute, since the contract requires them (see P18).

### P27. HIGH: Wallet Send confirms before the wallet, balance, and fee are ready

Found Oct 20 2026 about 12:07 PM CST on bittasker.com/wallet. The Send form opened while the balance was still loading and showed "Failed to fetch fee estimate". Send stayed enabled, and Confirm Payment let the user confirm. The send then failed with "Transaction failed – Wallet is not initialized."
Fix: disable Send until the wallet is initialised and the balance and fee estimate are loaded. Show a clear "Unlock wallet" action that triggers the passkey once. Never show the irreversible confirm dialog without a fee.

### P28. Page reload logs the user out

A reload called key and ancillary APIs. A 401, or a refresh that failed with no HTTP response, ran `destroySession` and sent the user to login. The protected layout also treated a Preferences miss as logged out.

Fixed in `hotfix/prod-batch-2`: the access token is read from Preferences and from `CapacitorStorage.access_token`. Network failures and `skipAuthRedirect` requests do not clear the session. Only a confirmed 401 or 403 on refresh does. Page loads do not call the passkey challenge.

### P29. /settings/nostr shows "Network Error"

The settings layout called `getAllKeys` after a partial session restore. That hit the encrypted-data API, axios threw `Network Error`, and the template passed that string through `$t`, so the page showed the raw message.

Fixed in `hotfix/prod-batch-2`: a restored signer is shown without that request. A network failure uses `settings.error.network` in English and Spanish.

### P30. Wallet balance disappears after about 45 seconds

`BalanceCard` revealed the balance and then hid it when a 45 second countdown hit zero.

Fixed in `hotfix/prod-batch-2`: balances stay visible. The eye toggle still hides them. There is no auto-hide timer.

### P31. Raw i18n keys on screen

Routes such as `/profile`, `/notifications`, `/feedback`, `/reviews`, and `/services` never loaded `dashboard/dashboard`, so shell strings like `dashboard.hiring.page_title` rendered as keys.

Fixed in `hotfix/prod-batch-2`: those routes load the dashboard shell namespaces, plus their own profile, settings, reviews, and feedback namespaces.

### P32. Add New Skill logs the user out

Saving a skill translated the name through `POST /api/v1/translate`. A 401 whose refresh failed destroyed the session.

Fixed in `hotfix/prod-batch-2`: translation requests set `skipAuthRedirect`, and a passkey is not opened just to publish a skill when the session is already restored.

### P33. Skills dropdown is empty

`SkillsMultiselect` passed `options={[]}` and hid `.skills-options` with `display: none`.

Fixed in `hotfix/prod-batch-2`: the dropdown lists the onboarding catalog, including Copywriting. See P6 for the still-open deadline time.

### P34. /services map misses pins for listed services

Markers used the same list as the page, but a service was skipped unless it had a truthy latitude. City text such as "La Libertad, El Salvador" and latitude `0` were dropped. Overlapping services had no count.

Fixed in `hotfix/prod-batch-2`: shared listing-marker logic geocodes known city text, keeps stored coordinates (including 0), and clusters nearby pins with a count. Remote-only services with no place stay off the map. The San Salvador camera default is not used as a pin unless the label is that place.

### P35. /tasks map pins do not match the task list

Pins came only from truthy pickup coordinates. A task labeled "Bogotá, Bogotá, Colombia" could still sit on the San Salvador fallback (near Guatemala and Honduras) or on swapped coordinates. Remote tasks were listed with no pin, and a pin click did not open `/tasks/<id>`.

Fixed in `hotfix/prod-batch-2`: markers are built from the same listed tasks as the list, using pickup and drop-off. A known city replaces swapped, stale, or fallback coordinates. A single pin opens `/tasks/<id>`. A cluster shows a count. Remote tasks with no resolvable place stay off the map. Services and tasks share `listing-markers`.

### P36. Workers cannot complete a task escrow, and image upload attaches nothing

Mark as Complete stayed disabled until a photo or video was attached. In Linux Chrome, typing a path in the GTK chooser and pressing Enter attached nothing. Choosing a file with the mouse showed a JPG thumbnail that stayed dimmed under a spinner. Avatar upload failed the same way, so P5 only saved a URL when one already existed.

There is no Blossom or NIP-98 upload in the client, and this path does not sign an event or wait on a passkey. `isConfigured()` is false in the browser, so images POST to `/api/v1/uploads/single`. The request set `Content-Type: multipart/form-data` with no boundary (the axios default is `application/json`), so the server parser never finishes, and axios had no timeout. A `display: none` file input does not receive the GTK Enter selection. An empty PNG MIME was not treated as an image, so there was no thumbnail. A response with no URL was treated as success.

Fixed in `hotfix/prod-batch-2`: a note or nothing enables Mark as Complete. An upload still in progress still disables it. Escrow completion and its passkey signing are unchanged. The file input stays in the layout and handles `change` and `input`. MIME is sniffed from the extension. FormData no longer sends a content type, so the browser sets the boundary. Compression does not use the web worker that can stay pending. The request times out at 30 seconds, shows an English and Spanish error toast, keeps the thumbnail, and can be retried. A successful image must have a URL before the thumbnail is replaced.

### P40. HIGH: Mark as Complete spins for 90 seconds, then the page reloads and the contract stays In Progress

Found Oct 20 2026 on production (master `fc371952`, which includes the P36 upload fix). Worker `0x88C5…0fBb` on an In Progress contract (escrow tx `0x659c3f91…2f19`) adds a note, attaches nothing, approves the passkey, and sees "Completing Task…" for about 90 seconds. The page then reloads with no error. The contract stays In Progress, the timeline still shows only "Contract initiated", and no completion transaction is sent.

During the incident, `GET https://tx-relay.bittasker.com/info` hung and returned no bytes (curl timed out). `/health` and `POST /relay` answered. A later check of `/info` returned HTTP 200 in about 1 second (`chainId` 30), so the hang is intermittent. `fetchRelayJson` waited `RELAY_FETCH_TIMEOUT_MS` (90s) and then called `AbortController.abort()` (`src/lib/utils/contract/v2/blockchainWrites.ts:45` and `:207`, from the `GET /info` at `:253-256`). On Android, CapacitorHttp rewrites that GET onto the app origin. Aborting it reloads the WebView before the direct send or the Nostr status publish. It is not a bad worker key and not a Nostr relay failure: signing and publishing never start. PR #9's session restore does not reload the page.

Fixed in `hotfix/p40-mark-complete`: the relay call is not aborted. If `/info` does not answer within 8 seconds, the app signs with the local contract address and chain id (30 on mainnet) and posts to `/relay`. A direct wallet transaction is the fallback. A receipt wait is 60 seconds. Failure shows an English and Spanish error toast with Retry and keeps the note. The page does not reload. Console lines use the `[complete-task]` prefix for sign, send, receipt, and the Nostr publish.

Tester T2, same release: the first Fund attempt, after the passkey, stayed on "Creating Secure Payment Contract…" for about 2 minutes, then the button returned to Accept with no error and no transaction. The retry succeeded (`0xb3f66ce3…6320`). Funding is payable, so it never calls the relay. `createContract` (`src/lib/utils/contract/v2/creation.ts`) calls `createPaymentContract` → `executeWriteDirect` (`src/lib/utils/contract/v2/blockchainWrites.ts`). After the passkey, gas estimation, the static call, and the broadcast go to the RSK RPC with ethers' 5 minute fetch timeout and no product deadline. When that call ended without a hash, `BidAcceptanceFormV2.svelte` `handleSubmit` showed the raw message for 3 seconds and its `finally` set `isSubmitting` false, which is the Accept label. There is no reload on this path. The fix keeps the form and the typed details, shows a sticky English and Spanish error with Retry, does not abort the RPC, and refuses a second `createPaymentContract` while the first send is in flight or the saved nonce or tx hash is pending or already mined. Console lines use the `[fund-escrow]` prefix.

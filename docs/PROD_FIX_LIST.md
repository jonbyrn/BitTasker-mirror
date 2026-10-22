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

### P56. Mark complete shows a confirmation timeout, then the tx mines

Found after P40 on contract D. Mark complete showed "The transaction was sent, but the network did not confirm it in time…" after about 60 seconds. The completion tx `0x6fefdb19…dd8d` confirmed on Rootstock shortly after. The 60 second receipt race stopped waiting as soon as the hash existed.

Fixed in `hotfix/p56-p58-complete-polish`: once a hash exists, the app polls the receipt with backoff for about 3 minutes before the timeout toast. Polling continues after the toast (up to about 10 minutes). A later success receipt clears that toast, shows success, and refreshes the contract. A later revert replaces the toast with the reverted error. Retry reads the chain and the saved hash first. It does not send a second `completeTask` while the first send is in flight, while that hash has no receipt, or when the chain already left the completable states. The P40 double-fund guard is unchanged. Receipt reads are not aborted. After about 10 seconds on the spinner, the drawer shows "Still confirming on the network. This can take a few minutes. You can leave this page." in English and Spanish. The submit button stays disabled for the whole wait.

### P57. Task details timeline stays on "Contract initiated" after complete, fund, or release

The drawer builds its rows from Kind 31006 events on the contract rune. Those rows were appended only when a relay echoed the event back into the subscription, so a completion, a release, or a newly funded contract stayed on "Contract initiated" until a manual reload.

Fixed in `hotfix/p56-p58-complete-polish`: a confirmed complete appends a Completed row immediately, and release appends Funds Released. The same tx hash is not added twice. The timeline reads a revision counter so the open drawer updates without a reload. A funded contract is kept in the contract list as soon as its Kind 30006 publish returns, so the initiation row is available before the relay echo.

### P58. A passkey prompt submits a truncated completion note

Typing the completion note while a passkey prompt stole focus submitted only the prefix already in state ("Mark") and could submit from Enter rather than an explicit click.

Fixed in `hotfix/p56-p58-complete-polish`: submit stays disabled while a passkey prompt is pending, for a short moment after it closes, and while a submission is in flight. Enter does not submit. The note sent is the full current value, using whichever of the field and the state still has the longer prefix.

### P59. HIGH: /tasks shows no tasks

Found Oct 21 2026 on production, which was still serving the P40 build (`4d3f8a08`, asset version `1792541612532`). PR #17 (`ae6a9791`) was still deploying and does not touch the task list. P40 does not either.

Logged-out `/tasks` requests `GET https://relay2.bittasker.com/api/v1/events?kinds[]=31000&limit=10` and gets HTTP 200 with tasks. relay2's NIP-11 document lists NIP-42 and `auth_required: false`. The page does not need a websocket AUTH for this list. The browser opened `wss://relay1.bittasker.com/` and did not send a task REQ. The list comes from the relay2 HTTP API.

The first page includes two kind 31000 probe events whose content is only a title (`auth url probe`, `relay probe auth`). `TaskCard` reads `task.budget.amount` while painting the `{#each}` (`src/lib/components/task/TaskCard.svelte`). That throws `Cannot read properties of undefined (reading 'amount')`. The list does not paint, so the page shows the filters and the map with no task cards. The other 326 events on relay2 have a numeric budget and were not filtered out by status or expiry.

Fixed in `hotfix/p59-tasks-list`: events whose JSON is invalid or whose budget amount is not a finite number are left out of the list, and the page cursor still uses the oldest raw event time. `TaskCard` and the map info window no longer throw when budget or status is missing, so one bad event cannot blank the cards that remain.

### P62. v1.1.11 tag pipeline did not build the Zapstore universal APK

Found Oct 21 2026 on GitLab pipeline 2973130531 (tag `v1.1.11`, `8dd959f9`). The jobs list contained only `android-release-prepare`, `android-release-web`, and `playstore-release`. `bittasker/zapstore` has no `v1.1.11` release. v1.1.10 and earlier attached `bittasker-vX.Y.Z-universal.apk`.

`zapstore-release` was still in `.gitlab/ci/android-release.yml` with the same tag rule as the other three jobs (`$CI_COMMIT_TAG =~ /^v\d+\.\d+\.\d+$/`). That rule matches `v1.1.11`. There is no `only`/`except`. The job was a `trigger` bridge (`when: manual` at job level, not inside `rules`). GitLab does not put bridge jobs in the pipeline jobs list. Pipeline 2973130531 did create bridge 17357800598 in status `manual` with no downstream pipeline, so the child config in `.gitlab/ci/release-zapstore.yml` never ran and no APK was uploaded. v1.1.10's bridge was played by hand (child pipeline 2660214820) and that is what published the APK. Nothing in git history after v1.1.10 changed this job's rules.

Fixed in `hotfix/p62-zapstore-release-ci`: `zapstore-release` is a script job on `v*.*.*` tags, manual inside `rules`. `.gitlab/ci/release-zapstore.yml` is included only for that same tag, in the parent pipeline, and those jobs need `zapstore-release`. Play Store, prepare, web, internal, deploy, and backup jobs are unchanged. Playing `zapstore-release` still builds the signed universal APK and attaches it to the `bittasker/zapstore` release.

### P63. Tasks past their deadline still show OPEN and accept bids

Found Oct 21 2026 on production. Example: "Video Editing" by Jeni Ari, deadline Jul 12, 2026, $20. The card and the task page showed OPEN, "Deadline Expired… still open for bidding", and a Bid Now button.

Status is not computed by a relay job or a cron. A task is a kind 31000 replaceable event (`src/lib/utils/constants/kinds.ts`). The poster writes `status` into the JSON content and the `S` tag when they create or republish the event (`src/lib/nostr/task.ts` `generateTaskTags` / `updateTask`). The browse list loads that event with `GET /events` (`src/lib/api/services/nostr/events.ts` `findEvents`) and copies `status` from the JSON (`src/lib/nostr/findTasks.ts` `convertEventToTask`). The `S` tag is only a relay filter. Nothing in this client, and no relay call the client makes, flips OPEN to expired when the date passes. The UI already compared the deadline, but only to show a warning. Bid Now stayed enabled because it checked the stored OPEN status.

Fixed in `hotfix/p63-expired-tasks`, web only. A shared helper derives EXPIRED when the stored status is OPEN and the deadline has passed. A date-only deadline stays open through the end of that calendar day in local time. A missing or invalid deadline is never expired. Assigned, in progress, completed, and cancelled tasks keep the status the poster published. Browse and the map hide expired tasks until "Show expired". The poster still sees the task and can edit or extend it from My Tasks; this change does not publish a new event. The Credit beta badge is not in this tree. It lives on `sandbox/rgb-wasm-phase0`, which this hotfix does not touch.

Android: web-only. The bundled app gets this on the next store release. No Android project files changed.

### P64. Security: Node.js images and engines were not pinned to the Oct 21, 2026 release

The Oct 21, 2026 Node.js security release is 22.23.4 (LTS, "Jod"). On the 22.x line the release notes mark these high: Brotli decoder out-of-bounds write (CVE-2026-111497), `dns.resolve` accepting a NUL byte (CVE-2026-105482), and TLS hostname checks that accepted a non-canonical IP (CVE-2026-106069, CVE-2026-106072). The same release also ships medium and low fixes (HTTP keep-alive agent data, snapshot RNG caches, permission-model `realpathSync`) and updates c-ares, OpenSSL, SQLite, undici, and the root certificates.

Docker and GitLab CI used floating tags (`node:22-alpine`, `node:22-bookworm-slim`), so a pull could stay on a build from before 22.23.4. `package.json` allowed any Node `>=20.0.0`, including 20.x, which is outside this security release.

Fixed in `hotfix/p64-node-pins`. Both Dockerfile stages are `node:22.23.4-alpine`. Every `.gitlab-ci.yml` image, including the commented preview jobs, is `node:22.23.4-bookworm-slim`. The self-hosted runner note in `docs/ci/play-store-pipeline.md` names that same image. `engines.node` is `>=22.23.4`, and the lockfile root package matches. No application source changed. The pipeline sets `NODE_OPTIONS=--max-old-space-size=6144` because the Vite client build exceeds Node's default ~2GB old space, and 6144MB leaves headroom on an 8GB runner.

Android: the app bundles the web build, but this only changes the build toolchain, so there is no runtime change for the app. No Android project files changed. `sandbox/rgb-wasm-phase0` is not touched.

### P65. HIGH: nsec login stays on Processing when encrypted-data returns 400

Status: Withdrawn: Jon, don't touch prod login.

Found Oct 22 2026. Signing in with an nsec hung on "Processing..." when `POST /api/v1/auth/login/nostr/encrypted-data` returned 400. `encryptedNostrData` caught the error and only rethrew status 500, so a 400 came back as no response. The login page treated that as a new account and continued into wallet derivation and biometrics. The button stayed on Processing.

The API is doing the right thing. A full 63-character nsec that is not registered returns 400 with "User not found with this public key". That is not a server bug.

The nsec error UI and the client-side format check were removed from `hotfix/p65-prod-smoke-1037`. Login, sign-up, and onboarding match `master`.

### P66. HIGH: task search count does not match the cards, and service search ignores the query

Found Oct 22 2026. On `/tasks`, "design" showed 22 in the header and rendered 2 cards. On `/services`, "wordpress" and "design" showed all 20 services. Task hits from Meilisearch match the event JSON, so a title that does not contain the word was still counted. The services index returned no hits for those queries, and the page then painted the unfiltered relay page. The header and the cards were not the same list.

Fixed in `hotfix/p65-prod-smoke-1037`. Tasks and services run one public filter before display. The header count, the cards, and the map all read that list. A Meili page that filters down to nothing falls through to the relay, and the query is still applied to what the relay returns. The Meilisearch search key stays an inherited production secret (`[env.production.secrets]` `required = ["MEILI_SEARCH_KEY"]`). It is not in source and not in a `VITE_*` var.

### P67. /tasks first load takes about 15 seconds, and View is slow

Found Oct 22 2026. The first `/tasks` load waited out a 15 second relay timeout. View waited on the task page load and on drawer imports before the route changed.

Fixed in `hotfix/p65-prod-smoke-1037`. The list publishes the first page with loading still true, and the skeleton stays up only while that list is empty. A direct relay HTTP query races the gateway and later relays are aborted when the first non-empty page arrives. That race is off under unit tests. Hover or focus on View remembers the task and prefetches the route. The click navigates without waiting for drawers. In the browser the task route returns the remembered task, or a placeholder, immediately, and the detail view shows a skeleton until the task is loaded.

### P68. Service detail shows a huge black hero when there is no image

Found Oct 22 2026. A service with an empty gallery still rendered a black `aspect-video` hero, up to 60vh, and the content overlapped it.

Fixed in `hotfix/p65-prod-smoke-1037`. No images use a compact `h-16` `bg-base-200` bar and a small logomark. The overlap margin is only used when the gallery has media.

### P69. CSP console errors on /auth/signup

Status: Withdrawn: Jon, don't touch prod login.

Found Oct 22 2026. Signup loads Cloudflare Turnstile from `challenges.cloudflare.com`. The console reported `connect-src` blocks for `data:` and that host. Production responses had no content security policy.

The policy lived on the `/*` response header and the `app.html` meta tag, so it was the header for login, sign-up, and onboarding as well as every other page. No part of it left those pages alone, so the header, the meta tag, and the policy helper were removed from `hotfix/p65-prod-smoke-1037`.

### P70. Test listings and Cancelled tasks appear on public lists

Found Oct 22 2026. Public task and service lists included relay test events titled "probe", "relay probe", "relay publish check", and similar, and tasks whose status is Cancelled.

Fixed in `hotfix/p65-prod-smoke-1037`. Those titles and Cancelled tasks are left out of the public lists. A real title that only contains the word probe, such as a soil probe, stays. Tasks still need a finite budget amount. The same filter feeds the count and the cards.

### P71. Service listings should not claim that keys stay on the device

Found Oct 22 2026. The line "Your keys stay on your device" is not in this tree and was not in the production JS bundles. The closest copy is the wallet unlock hint ("Your keys stay on this device..."), which this change does not edit. Service cards had no escrow line.

Fixed in `hotfix/p65-prod-smoke-1037`. Each public service card shows "Non-custodial escrow" in English and "Depósito en garantía sin custodia" in Spanish. No other claim about key custody was added.

Android: the app bundles this web build. No Android project files changed. After merge, the next store release needs a version bump, a signed AAB, and a Play and Zapstore release. `sandbox/rgb-wasm-phase0` is not touched.

### P72. ES search status text is still in English

Status: Queued. Not fixed in this PR.

Source: QM PASS on `746bcfe8`, Oct 22 2026, 2:56 AM CST. Priority P2. With the UI in Spanish, the search status still reads "Searching for…" and "19 results for…".

### P73. Task search includes Completed tasks beyond the default list

Status: Queued. Not fixed in this PR.

Source: QM PASS on `746bcfe8`, Oct 22 2026, 2:56 AM CST. Priority P2. A task search returns Completed tasks that the default list does not show.

### P74. Occasional slow Spanish search

Status: Queued. Not fixed in this PR.

Source: QM PASS on `746bcfe8`, Oct 22 2026, 2:56 AM CST. Priority P3. An occasional Spanish search took about 5.5s, then 3.1s on retry.

### P75. Tasks search for "design" shows a count and no cards

Found Oct 22 2026 on master `39f6d5e1` (pipeline 2976517422). On `/tasks`, "design" showed "22 results" and 0 cards in all 6 viewport/language combinations, with "Tasks past their deadline are hidden." Other queries matched: tasks "wordpress" 3=3, "diseño" 10=10, services all matched. `relay1.bittasker.com` still fails CORS on `kinds[]=31000`. Left as-is.

Checked against production `/api/search/query?index=tasks&q=design` (79 estimated hits, 40 returned):

- The header was already `visibleTasks.length`. After `filterPublicTasks` and the expiry rule, that page is 22 non-expired rows and 18 open tasks past their deadline. 22 is not the raw hit count and not the estimated total. Completed tasks and tasks with no deadline stay in the list. The QM note that the count includes expired tasks does not match this code.
- Expiry uses the browser's local calendar. A date-only deadline, or a UTC midnight / `T23:59:59.999Z` stamp, stays open through the end of that calendar day in local time. A deadline with a real time expires at that instant. On the smoke morning (22 Oct 2026, 07:00 America/Guatemala) that clock does not hide the 22. Missing and unparseable deadlines never expire. Only `OPEN` plus a passed deadline does.
- The 0 cards come from a keyed `{#each}` throwing `each_key_duplicate`. Svelte then drops the block. One live hit, "Looking for a graphic designer", stores categories as the strings `tech` and `creative`. `TaskCard` keyed them with `category.id || category.name`, which is undefined for both. Duplicate tags throw the same way. Repeated Nostr events (same event id, or the same `kind:pubkey:d` on a replaceable event) throw when the list is keyed by `id`. The deadline notice also ran whenever the store had any rows and the visible list was empty, including rows that were not expired.

Fixed in `hotfix/p75-search-count`. Find Tasks builds one `visible` list: dedupe (event id, or `kind:pubkey:d` for replaceable events, newest kept), then `filterPublicTasks`, then the same expiry rule. The count, the cards, and the map read that list. At 0 the page shows the empty state. The deadline notice shows only when every match was removed by that expiry rule. Category and tag chips include their index in the key. Find Services uses the same dedupe before its `{#each}`. Login, sign-up, and onboarding are unchanged.

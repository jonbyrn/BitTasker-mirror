# BitTasker production (bittasker.com, RSK/rBTC) fix list

Bugs found on production bittasker.com, the Rootstock/rBTC version. Sandbox (RGB) bugs stay in `docs/FIX_LIST.md`. The old sandbox number is in brackets. "Sandbox fixed, port" means rgb.bittasker.com already has the fix and it only needs to be ported to prod.
Started 2026-10-20 from Jon's prod smoke test (account "David Rollo").

### P1. HIGH: Contract shown funded before on-chain confirmation [194]
Accept & fund showed "Bid Accepted & Contract Funded" and moved the task to In Progress while the panel still said "Confirming on-chain and syncing your contract…". No tx hash and no confirmations were shown, and the user could leave the page. Fix: show a pending state with the tx hash. Do not create the contract, mark it funded, or move the task until the funding tx confirms. Roll back if it fails. Keep the user informed after they navigate away. Funding tx (Rootstock): `0xb8c42a235e7312e7606286eed30676074b79985de754453f09669adbc0aaad36`.

### P2. Passkey prompt on every page load blocks the page [182] (Sandbox fixed, port)
Every reload asks for the passkey: message threads, Profile, and Get Quotes in task create. Pages hang ("Loading messages…", Settings) until it is approved. Fix: reuse the login session. Ask for the passkey only for login, unlock, funding, and escrow (sandbox item 148).

### P3. DM thread fails after reload, sent messages vanish, old draft returns [183]
After a reload and passkey approval the thread said "Failed to load messages" until another reload. Sent messages can disappear until a reload. An old unsent draft comes back after a send. Fix: show the sent message at once and keep it. Clear the draft on send. Load the thread once signing is ready.

### P4. No unread indicator for new DMs [184]
The bell showed 10, but new DMs had no clear unread mark, and the Messages nav has no badge. Fix: unread count on Messages, and DM entries marked unread in the bell.

### P5. Avatar upload fails silently [185]
On /profile/edit, Add Images opened no file dialog. With a file set it showed Compressing → Uploading… and a preview, but after Save and reload the avatar was still initials. The only toast was "Skills saved successfully!". Fix: open the file picker, show upload errors, and save and display the picture.

### P6. Create Task: empty skills list, no Copywriting, date-only deadline [186]
The skills dropdown shows nothing, so a skill has to be typed. There is "Writing & Editing" but no "Copywriting". The deadline takes a date only. Fix: fill the skills list, add Copywriting, and allow a time on the deadline.

### P7. Posted tasks have no shareable URL [187]
Task details open only as a side panel on /hiring/my-tasks. Fix: give each task its own page at `/tasks/<id>`.

### P8. Onboarding step 3: "NDK signer not configured" [188, same as sandbox 93]
Onboarding step 3 fails with this error.

### P9. Header dropdown hides the title line [189]
Minor. The account dropdown does not show the user's title.

### P10. A new bid creates no notification [190] (Sandbox fixed, port)
The poster is not notified of new bids, and the bell lists only messages. Fix: notify on new bids and on bid and escrow changes (sandbox item 151).

### P11. Passkey prompt on bids page load [191] (Sandbox fixed, port)
Opening a task's bids page asks for the passkey, and the list stays on "Loading…" until it is approved. Fix: load bids with the session (sandbox item 148).

### P12. Late passkey approval leaves "Failed to load messages" with no retry [192]
The thread shows "Failed to load messages. The operation either timed out or was not allowed." with no Retry. Fix: a plain message with a Retry button, plus an automatic reload once signing is ready.

### P13. Accept & fund total jumps when the network fee loads [193]
The total went from $15.79 to $15.98 when the network fee arrived. The poster pays the bid + 2.5% platform fee + about $0.61 network fee. Fix: show the breakdown before accepting, and disable Accept until the total is final.

### P14. Refunded task shows Completed with no bids [195]
After a refund triggered by the Taskee, the task showed "Completed" with a new "Posted 10:18 AM" time, no bids, no Accept, and only a greyed-out Delete. Fix: a refunded task goes back to Open (or offers Repost) with its bids kept, and is never marked Completed. Refund tx: `0x7ade486dff77c1db4fd5eb6f4458255f015e4d0cc552e1d0aef55c4a564982f1`.

### P15. Funding escrow shows no signing prompt, while read-only pages do [196] (Sandbox fixed, port)
The prompts are the wrong way round. Fix: prompt for funding, escrow, and sends, and never for reads (sandbox item 148).

### P16. /wallet shows "No Wallet Found / Wallet Connection Error" after a funding tx [197]
This appeared straight after a successful funding send. Fix: the wallet stays connected and shows the pending or confirmed tx.

### P17. /hiring/contracts asks "Load signing keys" on every visit and hangs [198] (Sandbox fixed, port)
Each visit raised 3 passkey prompts. One timed out with no clear message, and the page then sat on "Unlocking your Nostr identity…" for over a minute. Fix: load with the session, with a plain timeout message and Retry (sandbox items 148 and 134).

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

### P21. HIGH: Find Tasks live search shows stale or out-of-order results
Found Oct 20 2026 on bittasker.com. After clearing or retyping the query, the list still shows the previous query's results (e.g. "translate" still showing coffee results). Fix:
- Debounce input (~300 ms).
- Cancel in-flight requests or ignore out-of-order responses.
- Show the result count and the active query.

### P22. HIGH: Find Services search does not react to typing
Found Oct 20 2026 on bittasker.com. Typing leaves the list at "20 services found"; only Enter searches, and "translate" + Enter returns 0 even though a Translation category exists. Fix:
- Same search trigger behaviour as Find Tasks (P21).
- Search category and skills too.

### P23. HIGH: Keyword search is too weak and misses obvious matches
Found Oct 20 2026 on bittasker.com. "translate" misses "It helps to transcribe and translate texts"; "proofread" and "coffee" don't find "Proofread a 600-word blog post about coffee brewing"; "design" and "blog" return 0. Fix:
- Full-text search over title, description, category, skills, and the new tags (P24).
- Stemming (proofread ↔ proofreading), typo tolerance (cofee), and synonyms (spanish → translation, copywriting → writing).
- A helpful no-results state with suggestions and popular categories.
- Clarify whether the user's own tasks appear in Find Tasks.

### P24. MEDIUM: Tags and categories
Found Oct 20 2026 on bittasker.com. Task cards show no category or tags. Categories are a flat list of ~36 with overlaps (Technology & IT vs IT and Web Development; Moving & Delivery vs Delivery & Logistics; Handyman Services vs Home Improvement). Fix:
- Poster-defined, searchable tags on tasks and services; show category + tags on cards.
- About 10 top-level groups with sub-categories: Writing & Translation; Design & Creative; IT & Web; Marketing & Admin; Home & Trades; Delivery & Moving; Education & Coaching; Events & Food; Care & Wellness; Professional.
- One shared taxonomy for tasks and services.
- Category landing pages with counts, and browse by category from the homepage and nav.

### P25. HIGH: Passkey must be optional on prod
Requested by Jon Oct 20 2026; blocks the 4 prod test accounts. On devices with no authenticator, onboarding step 2 and "Login with Nostr nsec" both fail with "no authenticator". nsec login also asks for a passkey even when no signature is needed. Fix:
- A Skip option at onboarding step 2.
- Login with Nostr nsec works with no WebAuthn/passkey.
- Never ask for a passkey when no signature is needed.

### P26. MEDIUM: Notification content and timing gaps (seen in Jon's prod Notifications page, Oct 20 2026)
- "New task available" for "Translate a short café menu…" and "Proofread a 600-word blog post…" both show "20m ago" although posted ~30 min apart: delayed/batched delivery.
- Release shows "Contract resolved — funds released"; "resolved" reads like a dispute outcome. Use "Payment released: you received X sats for <task>".
- "New message — You have received a new message" has no sender or preview.
- DM notifications show the old display name "Grok Automate" while the profile is now "David Rollo"; names must match current profile everywhere.
- "You've been hired! A tasker has created a contract for you." sometimes missing the task title.
- Missing notifications: escrow refunded, start time reached / you can submit work, work approved, bid declined.
- 68 unread with no "mark all read".

### P38. DMs stay open before escrow, with a client-side contact filter

Ported onto `sandbox/rgb-wasm-phase0` for live testing before prod. The sandbox banner "Messaging unlocks once escrow is formed." is removed from the thread, the message modal, and the profile page. Chat sends no longer call `assertChatAllowed`.

Outgoing chat is filtered on the device in `sendDirectMessage`. Words and regexes live in `src/lib/config/contact-filter.ts`. The ciphertext is never sent to a server to be read.

Before escrow, the filter blocks phone numbers (international, spaced, dotted, dashed, 7+ digit runs, and digits spelled in English, Spanish, or Portuguese), emails including "name at gmail dot com", URLs, handles (`@user`, `t.me/`, `wa.me/`), and off-platform words in EN, ES, and PT. A match is not sent. The composer shows: "For your safety, keep chats on BitTasker until escrow is formed. Contact details and outside apps are blocked." Spanish: "Por tu seguridad, mantén los chats en BitTasker hasta que se forme el pago seguro. Los datos de contacto y las apps externas están bloqueados."

After a public contract event shows escrow is formed, phone numbers, ordinary emails, and ordinary URLs can be sent. Handles and off-platform words stay blocked. Sandbox uses the existing RGB statuses (`funded`, `work_in_progress`, and the rest of `FORMED_ESCROW_STATUSES` in `messaging-policy.ts`), not the prod `confirmed` / numeric ContractStatus helper. Location, completion, payment, and `purpose: 'protocol'` messages use the post-escrow rules so a maps link still sends. Bid proposals still use `assertNoOffPlatformContact`.

### P0. nsec login and username check return Internal server error on rgb

Sandbox `821f8d0cd` and later. Login with a Nostr key at `/auth/login` shows "Internal server error. Please try again later." after about 8 seconds. Onboarding shows "Failed to check username availability".

The client used to map HTTP 500 from `POST /api/v1/auth/login/nostr` to that sentence. `GET /api/v1/auth/username/check` on `https://api-staging.bittasker.com` returns 500 in about 5 seconds for every username. `POST /api/v1/auth/login/nostr/encrypted-data` returns 400 with Prisma's message: it cannot reach `postgres.railway.internal:5432`. The same login body against `https://api-dev.bittasker.com` returns 400 "WebAuthn verification fields are required" in about 130ms, so the route is up when the database is up. `GET /api/v1/auth/challenge` on staging still returns 200. This is the staging API database, not commit `821f8d0cd` and not the Typesense `SEARCH_PROVIDER` var. The frontend is not reverted. Jon is restarting Railway Postgres separately. A Nostr key can still open a device session while that database is down, and the toast says the account server did not respond. If that session cannot be opened, the form says "Service unavailable" in English and "Servicio no disponible" in Spanish. A username check the server cannot answer shows the same sentence instead of "Failed to check username availability".

An nsec signer used to keep its ciphertext in sessionStorage, so closing the browser dropped it even though the decryption key stayed in IndexedDB. The ciphertext now stays in localStorage for the same eight-hour window. A reload and a browser restart can both decrypt it. Logout still deletes it. The wallet seed cache stays in sessionStorage.

### P40. Browse shows nothing while the homepage still has tasks

`/browse/tasks` asked the search index, then stacked a second catalog read and a primal fallback. With the index not ready, expired catalog tasks were loaded and then hidden, so the board said "Nothing matches." Search now has about 2 seconds. An error, a provider that is not ready, or zero hits reads the sandbox catalog relay for tasks and services. When every loaded row is expired, Show expired turns on so those rows appear. Unchecking it hides them.

### P41. WebSocket send after close

Relay reads sent a REQ from `onopen` without checking `readyState`. A socket that closed during connect logged "WebSocket is already in CLOSING or CLOSED state". Sends now no-op unless the socket is open, and a catalog read tries the relay once more if the first socket closes before the REQ.

### P42. /browse/staff had no empty state

An empty shift board now says "No shifts match." (Spanish: the staffing empty string) instead of a blank page.

### P43. Logged-out header showed an account avatar

A stored access token without an npub still set `isAuthenticated`, so the header showed initials and "My Account". That orphan token and cached profile are cleared. The public header stays up until both the token and the public key are present.

### P44. /login and /auth returned 404

Those paths redirect to `/auth/login`. Signup stays at `/auth/signup`.

### P45. Popular services repeated category names

The popular row no longer repeats Mounting, Moving help, Handyman, or Cleaning. Furniture assembly and Yard work stay, because those names are not the category names.

### P46. Category tiles had no listing counts

Each category tile shows a count once the index or the catalog relay answers, including zero.

### P48. Task detail stayed blank and the browse row looked dead

Opening a task waited on the search preview, then on the relay, so `/tasks/<slug>` had nothing to paint for several seconds and the clicked row did not change. A row now stores its title, price, place, and deadline before navigation. The detail page reads that copy immediately and asks the relay at the same time, instead of waiting out the search timeout first. The row shows a pressed state and "Loading…" while the next page opens. Homepage cards do the same and link with the task slug.

### P49. Category pages did not use the homepage catalog

`/categories/cleaning` could look empty while the homepage tile said Cleaning 5. The tile counts every catalog task whose title matches, including tasks that are no longer open. The category page asked search first, kept only open tasks, and used a different match, so the same cleaning tasks never appeared and other categories sat on the loading skeleton until the browse deadline. The page now reads the catalog relay directly and lists the same deduped tasks the tile counts.

### P50. Deadline units, and empty goods and staff

A numeric deadline is unix seconds when it has 10 digits and milliseconds when it has 13. Reading those seconds with `new Date(seconds)` lands in 1970 and marks the task expired. Day numbers such as `14` are not timestamps. The homepage time-left uses that same parser. Catalog tasks whose stored deadline is an April 2026 date still show Expired on 21 October 2026, because that date has passed. `/browse/services` already lists the catalog relay when search is not ready. `/browse/goods` and `/browse/staff` read that relay too. The relay currently has no kind 31160 goods and no kind 31150 shifts, so those boards stay empty. Goods says "No items on the catalog yet." instead of "Nothing matches these filters." Staff says "No shifts match."

### P47. Create task waited on later steps

The first paint of `/create-task` no longer imports the map step, budget step, review step, or the publish and signer modules. Those load when that step or submit needs them.

### P39. /wallet shows the unlock control twice

Prod mounts `WalletUnlockBanner` twice. Sandbox has no such component. Opening wallet details while the wallet is locked showed the simple "Unlock" button and a second "Unlock wallet" button in the details card. The simple button stays. The details button renders only in advanced mode, which hides the simple wallet.

## Queued sandbox items (2026-10-22)

Not in this PR. Signup stays passkey-only, the same as production. There is no nsec backup and no "Continue without a passkey" step.

### P51. Dark mode is only partial

After a reload, the body and main stay light. Jon wants dark mode to cover the whole page and to stay on after a reload.

### P52. Send is enabled on /wallet when signed out

The Send action on `/wallet` can be used while signed out. It should stay off until there is a session.

### P53. Spanish homepage is missing store badges, the tab title, and the flag

In Spanish, the homepage does not show the store badges, the document title, or the language flag that the English page shows.

### P54. The 429 rate limit is too aggressive for shared mobile NAT

Many phones behind one address hit HTTP 429 too quickly. The limit needs to allow that shared traffic.

## P55. RGB signup showed Turnstile "Verification failed" on first load

The live `rgb.bittasker.com` worker is the sandbox branch, not this preview branch. Its signup always created the Turnstile node, then `skipSignupCaptcha` ran in `onMount` and only returned true for `localhost` and `127.0.0.1`. It then called `turnstile.render` with `VITE_CLOUDFLARE_SITEKEY` (`0x4AAAAAABboTbbIVmXVwEvm`), the same public site key baked by sandbox, staging, production, and `deploy-preview`. That key is locked to production hostnames, so Cloudflare paints its own "Verification failed" on `rgb.bittasker.com`.

Signup now leaves `mountTurnstile` false until `onMount` confirms `shouldMountSignupTurnstile(hostname)`. `rgb.bittasker.com` and `*.workers.dev` set the captcha store and never insert the script or the widget node, so there is no failed-widget flash. Other hosts load `api.js?render=explicit` only after that check, and render bails when the site key is missing. No Cloudflare hostname change is required for this skip. To make the widget succeed on those hosts instead, add `rgb.bittasker.com` and the preview `*.workers.dev` names to the Turnstile widget that owns `0x4AAAAAABboTbbIVmXVwEvm`.

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

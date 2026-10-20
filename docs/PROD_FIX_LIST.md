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

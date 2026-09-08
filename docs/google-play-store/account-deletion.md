# Account Deletion — BitTasker

## Table of Contents

1. [Philosophy: Staying Decentralized](#1-philosophy-staying-decentralized)
2. [Google Play Store Compliance](#2-google-play-store-compliance)
3. [What We Broadcast on Deletion](#3-what-we-broadcast-on-deletion)
4. [The Deletion Flow (Current Implementation)](#4-the-deletion-flow-current-implementation)
5. [Future Reference: Fully Deleting Nostr Events from BitTasker](#5-future-reference-fully-deleting-nostr-events-from-bittasker)
6. [Innovative Solutions Worth Exploring](#6-innovative-solutions-worth-exploring)

---

## 1. Philosophy: Staying Decentralized

BitTasker is built on Nostr, a censorship-resistant, decentralized protocol. One of our core values is that **we do not tamper with relays** — we do not maintain a blocklist of deleted pubkeys at the relay level, we do not shadow-ban users server-side, and we do not act as a centralized gatekeeper of what data gets served.

This is a deliberate product and ethical decision:

- Users own their keys. Their identity is their keypair, not an account on our servers.
- Events published to Nostr relays are public, signed, and verifiable by anyone.
- We cannot — and should not — pretend to offer guarantees that the protocol itself does not make.
- Tampering with relay behavior to filter out specific pubkeys would undermine the very censorship-resistance that makes BitTasker trustworthy.

**Deletion on Nostr is a best-effort, opt-in mechanism.** We embrace this honestly. Our job is to broadcast the correct protocol signals and let the network respect them. We will always be transparent with users about what deletion means in a decentralized context.

---

## 2. Google Play Store Compliance

### What Google Play Requires

Google Play's [User Data policy](https://support.google.com/googleplay/android-developer/answer/13316080#account_deletion) mandates that any app enabling account creation must also provide:

1. **An in-app path** for users to delete their account and associated data.
2. **A web link** where users can request account and data deletion (for users who have uninstalled the app).

Both must be present. The in-app path must be **prominent and discoverable** (e.g., in account settings).

### Does Our Approach Satisfy This?

**Yes, with the following conditions met:**

| Requirement                             | How BitTasker Satisfies It                                                                                                    |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| In-app deletion button                  | "Delete Account" button in Settings → Account                                                                                 |
| Confirmation modal with data disclosure | Modal explaining wallet data loss, Nostr key invalidation, 30-day grace period, and ability to cancel by logging in           |
| Web link for deletion                   | A dedicated page on the BitTasker website (e.g., `bittasker.com/delete-account`)                                              |
| Data deletion on request                | We broadcast NIP-09 (kind 5) and NIP-62 (kind 62) deletion signals upon confirmation; backend PII is anonymized after 30 days |
| Transparency about retention            | Modal and privacy policy must state that Nostr events on third-party relays cannot be guaranteed to be deleted                |

### Important Notes on Timing

Google Play does not specify a hard deadline (e.g., "within 24 hours") for completing data deletion. It defers to applicable privacy laws (GDPR in the EU requires "without undue delay", typically interpreted as **within one month** of the request). Our 30-day grace period before final account removal is consistent with this expectation, **provided we clearly communicate this timeline to the user** in the confirmation modal and in our privacy policy.

Google Play also explicitly allows retaining data for **legitimate reasons** such as security, fraud prevention, or regulatory compliance — this covers active contracts and escrow states that cannot be immediately voided.

### On the Grace Period and Login-to-Cancel

**Q: Is it a violation of Google Play or Apple App Store policy to allow users to log in and cancel their deletion request during the grace period?**

**No. This is not a violation — it is an industry-standard, widely-accepted pattern.**

The login-to-cancel pattern is used by X (Twitter), PixAI, and many other apps that have passed both Google Play and Apple App Store review. Google Play's policy says apps must _allow users to request deletion_ — it says nothing about preventing login or mandating that deletion be immediate and irreversible. Apple's guideline 5.1.1(v) similarly requires that deletion be _initiatable_ within the app, not that it be instantaneous or uncancellable.

The key requirements are:

1. The user must be able to **initiate** deletion from within the app.
2. The user must be **clearly informed** of what will happen and when.
3. The data must be **actually deleted** within a reasonable timeframe (30 days satisfies GDPR's one-month standard).

A grace period with login-to-cancel satisfies all three. It is also better UX — accidental deletions are a real support burden, and a recovery window reduces them without compromising compliance.

**What matters for compliance is transparency:** the confirmation modal must tell the user upfront that they can cancel by logging in within 30 days. This is not a hidden escape hatch — it is a disclosed, user-friendly feature.

> **Note on Apple's guideline 5.1.1:** Apple explicitly states that "temporary deactivation" alone is **not** sufficient — the account must be genuinely deleted at the end of the process. Our implementation satisfies this because after 30 days, the backend permanently anonymizes PII and the account is irrecoverably gone. The grace period is a cancellation window, not a permanent deactivation state.

### What the Confirmation Modal Must State

To satisfy Google Play's and Apple's transparency requirements, the confirmation modal shown to the user before deletion must clearly communicate:

- All local wallet data (keys, balances, transaction history) will be **permanently lost** and cannot be recovered.
- A deletion request will be broadcast to Nostr relays immediately, but **complete removal from all relays cannot be guaranteed** due to the decentralized nature of the Nostr protocol.
- Their BitTasker account will enter a **30-day grace period**. They can cancel the deletion at any time during this window simply by **logging in again**.
- If no login occurs within 30 days, the account will be **permanently and irrecoverably deleted** from BitTasker's systems.
- Any active contracts or open tasks should be resolved before deleting.

---

## 3. What We Broadcast on Deletion

When a user confirms account deletion, BitTasker broadcasts two Nostr events. Both are signed by the user's private key and published to all relays the user is connected to.

### Event 1 — NIP-09 Kind 5: Event Deletion Request

**Purpose:** Signals to all Nostr clients and relays that the user is requesting deletion of all their published events across every kind used by BitTasker.

**Specification:** [NIP-09](https://nips.nostr.com/9)

NIP-09 uses `k` tags (delete by kind) rather than individual `e` tags (delete by event ID). This avoids the performance and scalability problem of fetching every single event ID the user has ever published. A single kind 5 event with `k` tags covers all events of those kinds authored by this pubkey.

For replaceable and parameterized replaceable events (kinds 10000–39999), NIP-09 also supports `a` tags in the format `<kind>:<pubkey>:<d-identifier>`. However, since we cannot enumerate all `d` identifiers at deletion time without a full relay scan, we rely on `k` tags as the primary signal, which is the recommended approach for account-level deletion.

**Event structure:**

```json
{
	"kind": 5,
	"pubkey": "<user_pubkey_hex>",
	"created_at": "<unix_timestamp>",
	"tags": [
		["k", "0"],
		["k", "4"],
		["k", "1063"],
		["k", "10002"],
		["k", "30000"],
		["k", "30001"],
		["k", "30002"],
		["k", "30003"],
		["k", "30004"],
		["k", "30005"],
		["k", "30006"],
		["k", "30007"],
		["k", "30008"],
		["k", "30063"],
		["k", "30078"],
		["k", "31000"],
		["k", "31001"],
		["k", "31002"],
		["k", "31003"],
		["k", "31004"],
		["k", "31005"],
		["k", "31006"]
	],
	"content": "Account deletion request. All events published by this key on BitTasker are requested to be deleted.",
	"id": "<event_id>",
	"sig": "<signature>"
}
```

**Kinds covered and why:**

| Kind    | Constant                    | Description                                |
| ------- | --------------------------- | ------------------------------------------ |
| `0`     | `PROFILE_METADATA`          | Profile name, bio, picture (NIP-01)        |
| `4`     | `DIRECT_MESSAGES`           | User-to-user chat messages (NIP-04/NIP-44) |
| `1063`  | `FILE_METADATA`             | Certifications and attachments (NIP-94)    |
| `10002` | `NIP_65_RELAY_LIST`         | User relay list (NIP-65)                   |
| `30000` | `PROFILE_SKILLS`            | Skills list                                |
| `30001` | `PROFILE_PORTFOLIO`         | Portfolio items                            |
| `30002` | `PROFILE_AVAILABILITY`      | Availability schedule                      |
| `30003` | `PROFILE_STANDARD_SERVICES` | Standard services offered                  |
| `30004` | `PROFILE_REVIEWS`           | User reviews                               |
| `30005` | `PROFILE_LOCATION`          | Location data                              |
| `30006` | `CONTRACT`                  | Contract creation/updates                  |
| `30007` | `BIDS`                      | Bid submissions                            |
| `30008` | `BID_STATUS`                | Bid status updates                         |
| `30063` | `PROFILE_IMAGES`            | Profile image collection                   |
| `30078` | `PENDING_SWAPS`             | RGB swap management                      |
| `31000` | `TASK_CREATION`             | Task creation and updates                  |
| `31001` | `SAVED_SEARCHES`            | Saved task searches                        |
| `31002` | `RECURRING_TASK`            | Recurring task definitions                 |
| `31003` | `USER_PREFERENCES`          | User preferences                           |
| `31004` | `RECOMMENDATIONS`           | Task recommendations                       |
| `31005` | `SAVED_SEARCH`              | Individual saved searches                  |
| `31006` | `CONTRACT_STATUS`           | Contract status updates                    |

**Relay behavior:** Relays that support NIP-09 SHOULD stop publishing events of these kinds authored by this pubkey. Clients SHOULD hide or mark as deleted any events of these kinds from this pubkey.

**Important caveat:** The kind 5 event itself persists on relays indefinitely. This is by design — it serves as a permanent, verifiable signal of the user's deletion intent, which clients can use to suppress display of the deleted events even if the relay hasn't removed them yet.

---

### Event 2 — NIP-62 Kind 62: Request to Vanish

**Purpose:** The official Nostr-native mechanism for full account deletion. Merged into the Nostr specification on February 19, 2025. Legally binding in some jurisdictions (GDPR). Instructs all relays to delete all events from this pubkey.

**Specification:** [NIP-62](https://nips.nostr.com/62)

**Event structure (Global — targeting all relays):**

```json
{
	"kind": 62,
	"pubkey": "<user_pubkey_hex>",
	"created_at": "<unix_timestamp>",
	"tags": [["relay", "ALL_RELAYS"]],
	"content": "Account deletion request. Please delete all events associated with this public key.",
	"id": "<event_id>",
	"sig": "<signature>"
}
```

**Relay behavior:** Relays that support NIP-62 MUST fully delete all events from this pubkey up to the event's `created_at` timestamp, and MUST prevent those events from being re-broadcasted. They SHOULD also delete NIP-59 Gift Wrap messages (encrypted DMs) that `p`-tag this pubkey.

**Why both events?**

- NIP-09 (kind 5) has broader relay support today — it has been in the spec longer and most relays implement it at least partially.
- NIP-62 (kind 62) is the newer, more comprehensive standard. Relay adoption will grow over time.
- Broadcasting both maximizes the chance that compliant relays act on the deletion signal, regardless of which NIP they support.

---

### Broadcast Strategy

Both events should be published to:

1. The BitTasker primary relay (`VITE_NOSTR_RELAY_URL`)
2. Any additional relays stored in the user's NIP-65 relay list (kind 10002 events)
3. A set of well-known public relays as a fallback (e.g., `wss://relay.damus.io`, `wss://nos.lol`, `wss://relay.nostr.band`)

This maximizes propagation of the deletion signal across the network.

---

## 4. The Deletion Flow (Current Implementation)

This is the scope of what will be implemented in the initial release.

### User Journey

```
Settings → Account → Delete Account
  → Confirmation Modal
    → User reads full disclosure (wallet loss, Nostr broadcast, 30-day grace period, login-to-cancel)
    → User taps "I understand, delete my account"
      │
      ├── [API]   POST DELETE /auth/account
      │             Account status → PENDING_DELETION
      │             deletionScheduledFor = now + 30 days
      │             Confirmation email sent to user
      │
      ├── [Nostr] Kind 5 event broadcast to all relays (event deletion request)
      ├── [Nostr] Kind 62 event broadcast to all relays (request to vanish)
      │
      ├── [Local] All Capacitor Preferences cleared (nsec, npub, access token, wallet data)
      ├── [Local] Session cleared
      └── User redirected to landing page / logged out

  ── User logs in within 30 days ──────────────────────────────────────────────────
      Login detects status = PENDING_DELETION
      → cancelDeletion() called automatically
      → status → ACTIVE, deletion fields cleared
      → Login response includes { accountRestored: true }
      → Frontend shows "Welcome back — your account deletion has been cancelled" banner

  ── No login for 30 days ─────────────────────────────────────────────────────────
      Nightly cron job (00:00) finds expired pending-deletion accounts
      → Soft-delete: PII anonymized, status → DELETED, deleted = true
      → Account is permanently and irrecoverably gone
```

### Grace Period

- The account is marked as `PENDING_DELETION` for 30 days from the deletion request.
- **The user can log in at any time during this window.** Logging in automatically cancels the deletion and restores the account to `ACTIVE` status — no support contact required.
- The Nostr kind 5 and kind 62 events that were already broadcast **cannot be un-broadcast**. This is a protocol constraint. However, BitTasker's own backend records are fully restored on login.
- After 30 days without a login, the nightly cron job permanently anonymizes the user's PII and sets the account to `DELETED`. This action is irreversible.

### What Is NOT Done in This Phase

- We do **not** enumerate and individually delete every Nostr event by ID (performance concern, deferred to future).
- We do **not** attempt to contact third-party relays individually to confirm deletion.
- We do **not** provide an "undo" mechanism for the Nostr broadcast (this is a protocol constraint — kind 5 and kind 62 events persist on relays permanently as a verifiable signal of deletion intent).

---

## 5. Future Reference: Fully Deleting Nostr Events from BitTasker

> **This section is for future planning only. Nothing here will be implemented in the initial release.**

The kind 5 and kind 62 events we broadcast are best-effort signals. Compliant relays will honor them; non-compliant or archival relays will not. For a more thorough deletion of a user's Nostr footprint from BitTasker specifically, the following approaches should be considered when the time comes.

### Approach A: `a` Tag Deletion for Parameterized Replaceable Events

For all parameterized replaceable events (kinds 30000–39999), NIP-09 supports `a` tags in the format `["a", "<kind>:<pubkey>:<d-identifier>"]`. This is more precise than `k` tags because it targets a specific event by its `d` identifier.

**Challenge:** We need to know every `d` identifier the user has ever used. This requires either:

- Storing a record of all `d` identifiers in our backend at publish time (recommended long-term approach), or
- Querying the relay for all events by the user's pubkey before deletion (expensive, but feasible as a background job).

**Implementation plan (future):**

1. At publish time, log each `(kind, d-identifier)` pair to a `user_event_index` table in the backend.
2. At deletion time, read this index and construct a kind 5 event with `a` tags for every entry.
3. Publish this event alongside the `k`-tag-based kind 5 event.

### Approach B: Filter-Based Bulk Deletion (NIP-09 Extension — PR #1509)

An experimental extension to NIP-09 introduces a `filter` tag containing a stringified Nostr filter object. This allows a single kind 5 event to request deletion of all events matching a filter — without enumerating individual IDs or `d` identifiers.

**Example — delete all events by this author:**

```json
{
	"kind": 5,
	"pubkey": "<user_pubkey_hex>",
	"tags": [["filter", "{\"authors\": [\"<user_pubkey_hex>\"]}"]],
	"content": "Account deletion request."
}
```

**Current status:** This extension is **not yet merged** into the official NIPs repository. It is implemented in the [Immortal relay](https://github.com/dezh-tech/immortal) (Go). Relay adoption is currently very limited.

**When to adopt:** Monitor [PR #1509](https://github.com/nostr-protocol/nips/pull/1509) for merge status. Once merged and widely adopted, this becomes the cleanest single-event solution for full account deletion without any server-side event index.

### Approach C: Background Deletion Job

A server-side background job that, after the 30-day grace period expires:

1. Queries the BitTasker relay for all events authored by the deleted pubkey.
2. Constructs a kind 5 event with individual `e` tags for every event ID found.
3. Publishes this event.

**Trade-offs:**

- Thorough — covers every event on the BitTasker relay by ID.
- Performance impact is isolated to a background job, not the user-facing deletion flow.
- Does not affect third-party relays (they would need to receive and honor the kind 5 event separately).
- The kind 5 event could become very large if the user has thousands of events; some relays reject events with too many tags. Batching into multiple kind 5 events (e.g., 500 `e` tags per event) mitigates this.

#### Challenge:

We do not hold access to user's nsec, the user needs to broadcast these events by themselve !

### Approach D: "Profile Tombstone" via Kind 0 Replacement

For the specific case of the user's profile being visible to other users (e.g., on task listings, bid cards), publishing a replacement kind 0 event with empty/minimal content signals to clients that this identity no longer exists:

```json
{
	"kind": 0,
	"pubkey": "<user_pubkey_hex>",
	"tags": [],
	"content": "{\"name\": \"[deleted]\", \"about\": \"\", \"picture\": \"\"}",
	"created_at": "<unix_timestamp>"
}
```

This is a **replaceable event** — the newer kind 0 replaces the old one on relays. Clients that fetch this user's profile will see a blank/deleted state rather than the original profile data.

**Note:** This can be done immediately at deletion time (not deferred), as it is a simple single-event publish and has no performance concerns. It provides immediate visual feedback across the network that this account is gone.

### Approach E: Key Revocation Signal (NIP-41 / PR #1452)

Proposals like [PR #1452](https://github.com/nostr-protocol/nips/pull/1452) introduce a **key revocation event (kind 50)** that signals a key is no longer valid and optionally suggests a successor pubkey. This is primarily designed for compromised key recovery, but it has relevance for account deletion:

- A revoked key signals to clients that this identity should no longer be trusted or followed.
- It does not delete events, but it does deprecate the identity.

**Status:** Not yet merged. Worth monitoring for future adoption.

---

## 6. Innovative Solutions Worth Exploring

> Research gathered to inform future decisions. None of these are commitments.

### 1. The "Profile Tombstone" as an Immediate Deletion Signal

The most immediately actionable improvement beyond what we broadcast today. Publishing a kind 0 replacement event with `{"name": "[deleted]", "about": "", "picture": ""}` at deletion time gives every client that queries this pubkey's profile an immediate, relay-agnostic signal that the account is gone — even on relays that don't support NIP-09 or NIP-62.

This works because kind 0 is a **replaceable event**: the relay always serves the most recent version. No relay needs to "support deletion" for this to work — it just needs to serve events, which all relays do.

**Recommendation:** Include this as part of the initial deletion broadcast. It is a single additional event and has zero performance cost.

### 2. NIP-09 `filter` Tag (PR #1509 — Dezh Tech / Immortal Relay)

The most elegant future solution for bulk deletion without a server-side event index. A single kind 5 event with a `filter` tag matching `{"authors": ["<pubkey>"]}` requests deletion of every event by that author in one shot.

The [Immortal relay](https://github.com/dezh-tech/immortal) (Go-based, open source) already implements this. If BitTasker ever migrates to or evaluates relay software, choosing one that supports PR #1509 would make account deletion dramatically simpler.

**Monitor:** [github.com/nostr-protocol/nips/pull/1509](https://github.com/nostr-protocol/nips/pull/1509)

### 3. Event Index at Publish Time

A low-overhead server-side improvement: whenever BitTasker's backend publishes a Nostr event on behalf of a user, log the `(pubkey, kind, d-identifier, event-id)` tuple to a `user_event_index` table. This costs almost nothing per publish but gives us a complete, queryable record of every event a user has ever published through BitTasker.

At deletion time, this index lets us construct precise `e`-tag and `a`-tag deletion events without any relay queries. It also enables partial deletion (e.g., "delete only my tasks, keep my profile") as a future feature.

### 4. NIP-62 Targeted Relay Deletion (Beyond `ALL_RELAYS`)

NIP-62 supports targeting specific relays by URL rather than using `ALL_RELAYS`. This means we can send a kind 62 event to the BitTasker relay specifically, with a higher expectation of compliance (since we operate it and can ensure NIP-62 support), while also broadcasting `ALL_RELAYS` to the wider network.

```json
{
	"kind": 62,
	"tags": [
		["relay", "wss://relay.bittasker.com"],
		["relay", "ALL_RELAYS"]
	],
	"content": "Account deletion request."
}
```

This is a belt-and-suspenders approach: the specific relay tag gives us a strong compliance signal for our own infrastructure, while `ALL_RELAYS` covers the broader network.

### 5. Key Revocation + Migration (NIP-41 / PR #1452)

For users who want to delete their current account and start fresh with a new keypair, a key revocation event (kind 50, proposed in PR #1452) can signal:

- The old key is no longer valid.
- A new successor pubkey is suggested (optional).

This is particularly relevant for BitTasker's use case because a user might want to "delete" their identity as a Taskee but continue using BitTasker as a Tasker under a new key. Key migration events would allow their social graph (followers, reviews that reference them) to transition gracefully.

**Status:** Not yet merged. [github.com/nostr-protocol/nips/pull/1452](https://github.com/nostr-protocol/nips/pull/1452)

### 6. Deferred Deletion Queue with Relay Confirmation

A more robust deletion pipeline for the future:

1. At deletion time, broadcast kind 5 and kind 62 events immediately (as we do today).
2. After 30 days, a background job queries each of the user's relays (from their NIP-65 relay list) to check if the events are still being served.
3. For any relay still serving the deleted events, re-broadcast the kind 5 event directly to that relay.
4. Log the outcome for transparency/audit purposes.

This is a "deletion confirmation loop" — it doesn't guarantee deletion (nothing does on Nostr), but it maximizes the propagation of the deletion signal to relays that may have missed the initial broadcast.

### 7. Client-Side Deletion Cache

A purely client-side approach that requires no relay cooperation: BitTasker's app can maintain a local cache of "deleted pubkeys" and filter them out of all query results before rendering. This is the fastest possible way to ensure deleted users are not displayed in BitTasker's own UI, regardless of what relays serve.

- At deletion time, write the pubkey to a `deleted_pubkeys` store (Capacitor Preferences or IndexedDB).
- In all query/render pipelines, filter out events where `event.pubkey` is in the deleted set.
- Sync this list across devices via an encrypted NIP-44 event or a private replaceable event.

**Trade-off:** This only affects BitTasker's own client. Other Nostr clients will still display the events. But for BitTasker's own UX, it provides an immediate, relay-agnostic solution.

---

_Last updated: March 2026_
_References: [NIP-09](https://nips.nostr.com/9) · [NIP-62](https://nips.nostr.com/62) · [PR #1509](https://github.com/nostr-protocol/nips/pull/1509) · [PR #1452](https://github.com/nostr-protocol/nips/pull/1452) · [Google Play User Data Policy_](https://support.google.com/googleplay/android-developer/answer/13316080)

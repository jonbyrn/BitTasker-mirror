# In-App Reporting & Muting — BitTasker

## Table of Contents

1. [Philosophy: Decentralized Moderation](#1-philosophy-decentralized-moderation)
2. [Google Play Store Compliance Requirements](#2-google-play-store-compliance-requirements)
3. [Nostr Protocol Standards We Use](#3-nostr-protocol-standards-we-use)
4. [Architecture Overview](#4-architecture-overview)
5. [Mute List (NIP-51, Kind 10000)](#5-mute-list-nip-51-kind-10000)
6. [Reporting (NIP-56, Kind 1984)](#6-reporting-nip-56-kind-1984)
7. [NIP-28 Hide/Mute for Chat (Kinds 43 & 44)](#7-nip-28-hidemute-for-chat-kinds-43--44)
8. [Where to Surface Report & Block UI in BitTasker](#8-where-to-surface-report--block-ui-in-bittasker)
9. [Client-Side Filtering Logic](#9-client-side-filtering-logic)
10. [Implementation Checklist](#10-implementation-checklist)

---

## 1. Philosophy: Decentralized Moderation

BitTasker is built on Nostr — a censorship-resistant protocol where users own their keys and data. We do not operate a centralized moderation backend. This creates a tension with platform store policies that require "timely action" on reports.

Our resolution:

- **Reports are Nostr events** — they are broadcast to relays just like any other event. We do not maintain a private database of reports.
- **Muting is fully client-side** — when a user mutes someone, we update their NIP-51 mute list (kind 10000). The filtering happens in the client, not on a server.
- **Reports serve two purposes**: (1) satisfy Google Play's requirement that a reporting mechanism exists and is accessible, and (2) give relay operators and our own relay the signal to act on egregious content (spam, illegal content, etc.).
- **We own our relay** — our relay can subscribe to kind 1984 reports and relay operators can act on them. This is the "timely action" mechanism for compliance.

This is the same approach taken by **Damus** (for Apple App Store compliance) and **Primal**.

---

## 2. Google Play Store Compliance Requirements

From the [User Generated Content policy](https://support.google.com/googleplay/android-developer/answer/9876937):

| Requirement                                                    | How BitTasker Satisfies It                                                               |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| In-app system to **report** objectionable content              | NIP-56 kind 1984 report event, triggered from task cards, bid cards, and messages        |
| In-app system to **report** users                              | NIP-56 kind 1984 profile report, triggered from user profiles and three-dot menus        |
| In-app system to **block** users                               | NIP-51 kind 10000 mute list update, immediately hides content client-side                |
| Action taken **in a timely manner**                            | Our relay operator monitors kind 1984 events; flagged users can be banned from our relay |
| Clear **Terms of Use**                                         | Existing ToS must explicitly define objectionable content and unacceptable behavior      |
| Functionalities **clearly labeled** and **readily accessible** | Three-dot menus on every task card, bid card, message, and profile                       |

> **Critical**: Google does not require centralized enforcement. They require that the mechanism exists, is accessible, and that developers act on reports. Our relay-based approach satisfies this.

---

## 3. Nostr Protocol Standards We Use

### NIP-56 — Reporting (Kind 1984)

The standard for reporting content or users on Nostr. A report is a regular (non-replaceable) event broadcast to relays. Relay operators and clients can consume these events and act on them.

- **Spec**: https://nips.nostr.com/56
- **Purpose**: Report a user or specific event to relays and the network
- **Precedent**: First implemented by Damus for Apple App Store compliance

### NIP-51 — Lists (Kind 10000 — Mute List)

A replaceable event that stores a user's personal mute list. When updated, the new event replaces the old one on relays. The client fetches this on startup and filters all incoming events against it.

- **Spec**: https://nips.nostr.com/51
- **Purpose**: Personal, client-side blocking of users and events
- **Key property**: Replaceable — only one mute list per user exists on the relay

### NIP-28 — Chat Moderation (Kinds 43 & 44)

Channel-specific hide/mute events for chat contexts.

- **Kind 43**: Hide a specific message (event 42). The client stops showing that message to the user who sent the kind 43.
- **Kind 44**: Mute a user in a channel context. The client stops showing messages from that pubkey.
- **Spec**: https://nostr-nips.com/nip-28
- **Purpose**: Granular moderation within the BitTasker messaging feature

> **Decision**: NIP-28 kinds 43/44 are supplementary to NIP-51. NIP-51 is the primary mute mechanism (works across all content types). NIP-28 is used specifically inside the messages/chat feature for per-message hiding.

---

## 4. Architecture Overview

```
User taps "Report" or "Block"
         │
         ├─► Block/Mute
         │     └─► Fetch current kind 10000 mute list
         │           └─► Append pubkey (or event id) to tags
         │                 └─► Publish updated kind 10000 to relay
         │                       └─► muteStore updated in memory
         │                             └─► All event feeds re-filtered
         │
         └─► Report
               └─► Build kind 1984 event with report type + reason
                     └─► Publish to relay
                           └─► Show confirmation toast to user
                                 └─► (Relay operator monitors 1984 events)
```

**On app start:**

1. Fetch the user's kind 10000 mute list from relay
2. Store it in a reactive Svelte store (`muteStore`)
3. All task/bid/message feeds filter against `muteStore` before rendering

---

## 5. Mute List (NIP-51, Kind 10000)

### Event Structure

```json
{
	"kind": 10000,
	"content": "",
	"tags": [
		["p", "<pubkey-to-mute>"],
		["e", "<event-id-to-mute>"]
	]
}
```

Private entries (encrypted with NIP-44) go in `content`. Public entries go in `tags`. For BitTasker's use case, public tags are sufficient — users don't need to hide who they've muted.

### Store Design

Add a `muteStore` to the existing store architecture:

```typescript
// src/lib/stores/mute.store.ts

interface MuteStore {
	mutedPubkeys: Set<string>; // pubkeys the user has muted
	mutedEventIds: Set<string>; // specific event ids the user has muted
	isLoaded: boolean;
}
```

- Initialized as empty on app load
- Populated by fetching kind 10000 from relay after login
- Updated optimistically when the user mutes someone (before relay confirms)
- Persisted to relay as a kind 10000 replaceable event

### Adding to KINDS

```typescript
// src/lib/utils/constants/kinds.ts
MUTE_LIST: 10000,        // NIP-51 — user mute list (replaceable)
REPORT: 1984,            // NIP-56 — content/user report
HIDE_MESSAGE: 43,        // NIP-28 — hide a specific channel message
MUTE_CHANNEL_USER: 44,   // NIP-28 — mute a user in channel context
```

### Mute Operation

When a user mutes a pubkey:

1. Fetch their current kind 10000 event (or start with empty tags if none exists)
2. Append `["p", "<pubkey>"]` to the tags array
3. Sign and publish the new kind 10000 event (replaces the old one)
4. Immediately update `muteStore` in memory

When a user mutes a specific event (task or bid):

1. Same flow, but append `["e", "<event-id>"]`

---

## 6. Reporting (NIP-56, Kind 1984)

### Event Structure — Report a User

```json
{
	"kind": 1984,
	"content": "Sending unsolicited messages",
	"tags": [["p", "<reported-pubkey>", "spam"]]
}
```

### Event Structure — Report a Specific Event (Task or Bid)

```json
{
	"kind": 1984,
	"content": "This task description contains illegal content",
	"tags": [
		["e", "<event-id>", "illegal"],
		["p", "<author-pubkey>"]
	]
}
```

### Report Types (from NIP-56)

| Type            | Use Case in BitTasker                                |
| --------------- | ---------------------------------------------------- |
| `spam`          | Fake tasks, bid spam, message spam                   |
| `illegal`       | Task requests for illegal services                   |
| `profanity`     | Hateful content in descriptions or messages          |
| `nudity`        | Inappropriate images in profiles or task attachments |
| `impersonation` | Fake profiles impersonating real users               |
| `other`         | Catch-all with required text description             |

### Report Flow

1. User taps three-dot menu → "Report"
2. Modal appears with report type selection + optional text field
3. On submit: build kind 1984 event, sign, publish to relay
4. Show success toast: "Report submitted"
5. Optionally offer to also mute the user immediately

> **Note**: Reports are not reversible. They are regular (non-replaceable) events. This is intentional — it creates an audit trail for relay operators.

---

## 7. NIP-28 Hide/Mute for Chat (Kinds 43 & 44)

These are used specifically inside the BitTasker messaging feature.

### Kind 43 — Hide a Message

```json
{
	"kind": 43,
	"content": "{\"reason\": \"Offensive content\"}",
	"tags": [["e", "<message-event-id>"]]
}
```

The client checks: before rendering any message, if the current user has a kind 43 event referencing that message's event ID, the message is hidden.

### Kind 44 — Mute a User in Chat

```json
{
	"kind": 44,
	"content": "{\"reason\": \"Harassment\"}",
	"tags": [["p", "<pubkey-to-mute>"]]
}
```

The client checks: before rendering messages in a channel, if the current user has a kind 44 event referencing the sender's pubkey, all messages from that user are hidden.

> **Practical note**: For BitTasker's direct messaging (kind 4), NIP-51 muting is sufficient. NIP-28 kinds 43/44 are most relevant if BitTasker adds group/channel chat in the future. Implement them as a secondary layer.

---

## 8. Where to Surface Report & Block UI in BitTasker

Google Play requires that reporting and blocking are **clearly labeled** and **readily accessible**. Every surface where user-generated content appears needs a three-dot menu (or equivalent) with Report and Block options.

### Required Touch Points

| Surface           | Report Content    | Report User           | Block User          |
| ----------------- | ----------------- | --------------------- | ------------------- |
| Task card (feed)  | ✅ Report task    | ✅ Report task author | ✅ Mute task author |
| Task detail page  | ✅ Report task    | ✅ Report task author | ✅ Mute task author |
| Bid card          | ✅ Report bid     | ✅ Report bidder      | ✅ Mute bidder      |
| Message / chat    | ✅ Report message | ✅ Report sender      | ✅ Mute sender      |
| User profile page | —                 | ✅ Report user        | ✅ Block user       |

### UI Pattern

Use a three-dot (`⋮`) icon button on every card and in the message header. Tapping it opens a bottom sheet or dropdown with:

```
⋮ Options
─────────────────
🚩 Report [content type]
🔇 Mute [username]
```

When "Mute" is tapped: immediate feedback ("@username muted"), no confirmation needed.
When "Report" is tapped: open a report modal with type selection.

### Report Modal

```
Report this [task / bid / message / user]
─────────────────────────────────────────
○ Spam
○ Illegal content
○ Profanity or hateful speech
○ Nudity or explicit content
○ Impersonation
○ Other (please describe)

[ Optional: add more details... ]

[ Cancel ]  [ Submit Report ]
```

---

## 9. Client-Side Filtering Logic

The `muteStore` must be checked at every point where events are rendered. This is the core of the "block" functionality.

### Filter Pattern

```typescript
// Applied when rendering task feeds, bid lists, message threads
function isVisible(event: NostrEvent, muteStore: MuteStore): boolean {
	if (muteStore.mutedPubkeys.has(event.pubkey)) return false;
	if (muteStore.mutedEventIds.has(event.id)) return false;
	return true;
}
```

Apply this filter in:

- `findTasks.ts` — before adding tasks to `tasksStore`
- `findMyTasks.ts` — before adding tasks to `myTasksStore`
- Task feed components — as a derived store or inline filter
- Bid list rendering — filter bids from muted users
- Message thread rendering — filter messages from muted users

### Subscription Strategy

On login:

1. Fetch kind 10000 (mute list) once from relay
2. Keep an open subscription for kind 10000 updates (in case the user updates their mute list from another client)
3. Store as a reactive `muteStore` — all derived views automatically re-filter

---

## 10. Implementation Checklist

### Phase 1 — Core Compliance (Required for Google Play)

- [x] Add `MUTE_LIST: 10000` and `REPORT: 1984` to `src/lib/utils/constants/kinds.ts`
  - `MUTE_LIST: 10000`, `REPORT: 1984`, `HIDE_MESSAGE: 43`, `MUTE_CHANNEL_USER: 44` all present in `src/lib/utils/constants/kinds.ts`
- [x] Create `src/lib/stores/mute.store.ts` with `mutedPubkeys` and `mutedEventIds` sets
  - Implemented with `mutedPubkeys: Set<string>`, `mutedEventIds: Set<string>`, `isLoaded: boolean`
- [x] Create `src/lib/nostr/muteList.ts` — fetch, update, and publish kind 10000
  - `fetchMuteList`, `mutePubkey`, `muteEventId`, `unmutePubkey`, `unmmuteEventId`, `isPubkeyMuted` all implemented
- [x] Create `src/lib/nostr/report.ts` — build and publish kind 1984 events
  - `publishReport` implemented with all NIP-56 report types
- [x] Fetch mute list on login and populate `muteStore`
  - Called fire-and-forget in `src/routes/+layout.ts` on every page load (works for both authenticated and guest users on the public tasks route)
- [x] Add three-dot menu to task cards with "Report task" and "Mute user" options
  - `ActionsMenu` rendered in `src/lib/components/task/TaskCard.svelte` with `reportedPubkey` and `reportedEventId`
- [x] Add three-dot menu to bid cards with "Report bid" and "Mute user" options
  - `ActionsMenu` rendered in `src/routes/(protected)/dashboard/task/[taskId]/bids/+page.svelte` (received bids list — the task owner's view of incoming bids)
- [x] Add report/mute options to message UI
  - `ActionsMenu` rendered in `src/lib/components/messages/ChatMessage.svelte` with `reportedPubkey` and `reportedEventId`
  - Muted conversations filtered in `src/routes/(protected)/dashboard/messages/+page.svelte`
  - Direct message route (`/dashboard/messages/to/[pubkey]`) redirects away if recipient is muted
- [x] Add report/block to user profile page
  - `ActionsMenu` rendered twice in `src/routes/npub/[npub]/+page.svelte` (desktop and mobile layouts) with `profileMode={true}`
- [x] Build `ReportModal.svelte` component with type selection
  - `src/lib/components/moderation/ReportModal.svelte` — two-step flow: report type selection → optional "also mute?" follow-up
- [x] Apply `muteStore` filter in task feed, bid list, and message rendering
  - Task feed: mute filter applied inside `findTasks` before tasks reach the store
  - Messages list: `unmutedConversations` derived store in `+page.svelte`
  - Direct messages: redirect on muted recipient
- [x] Add translations for all new UI strings (EN + ES)
  - `static/locales/en/moderation.json` and `static/locales/es/moderation.json` present

### ⚠️ Known Gaps

- [ ] **Relay operator SLA not established** _(see Gap 4 below)_

### Phase 2 — Enhanced Moderation

- [ ] Add kind 43/44 (NIP-28) hide/mute for the messages feature
- [ ] Relay operator dashboard to monitor kind 1984 reports
- [x] "Undo mute" option in settings (manage mute list)
  - `src/lib/components/settings/MutedUsers.svelte` is implemented and rendered in `src/routes/(protected)/dashboard/settings/+page.svelte`
- [ ] Social graph-based report weighting (if 3+ contacts report a user, show a warning)

### Relay Operator Notes — Gap: Timely Action Compliance

**Current situation:** BitTasker publishes reports as NIP-56 kind 1984 events to the relay. However, BitTasker does not own or operate the relay and cannot guarantee that relay operators will act on reports.

**Google Play's requirement:** Developers must take "timely action" against UGC violations. Google does not require centralized enforcement, but they do require that _someone_ acts on reports and that the developer has a documented process.

**Risk assessment:** This is a **moderate compliance risk**. Google's policy says apps that "continually fail to address user complaints about objectionable content" will be removed. If the relay is a third-party relay with no SLA, BitTasker has no control over enforcement.

**Recommended mitigations (at least one required before Play Store submission):**

1. **Operate your own relay** — subscribe to kind 1984 events and establish an internal review SLA (e.g., 24 hours for `illegal`/`nudity`, 72 hours for `spam`/`profanity`). Document this SLA in the Terms of Use.
2. **Or document a relay partnership** — get a written commitment from the relay operator to act on kind 1984 reports within a defined timeframe, and reference this in your ToS.
3. **Minimum ToS language required:** The Terms of Use must state that BitTasker (or its relay partner) reviews reports and takes action. The current ToS (`terms.json` line 87–91) says "Operators review reports and _may_ take the following actions" — the word "may" is weak. Strengthen to "will review within [X] hours/days."

**Current ToS status:** The Terms of Use at `src/routes/(company)/terms/` already defines objectionable content (8 categories), explains the reporting mechanism, explains blocking, and describes relay-based enforcement. This satisfies the _content_ requirement. The _operational_ SLA is the missing piece.

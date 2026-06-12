# BitTasker Notification Center — Frontend Implementation Plan

**Date:** 2026-06-09
**Status:** Implementation-ready spec
**Audience:** Frontend engineering team (SvelteKit)

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Notification Center UI](#3-notification-center-ui)
4. [Notification Bell Component](#4-notification-bell-component)
5. [Notification List & Cards](#5-notification-list--cards)
6. [Notification Preferences Page](#6-notification-preferences-page)
7. [Deep Linking & Routing](#7-deep-linking--routing)
8. [Real-Time Updates (WebSocket)](#8-real-time-updates-websocket)
9. [Push Notification Integration](#9-push-notification-integration)
10. [Activity Tracking](#10-activity-tracking)
11. [Enrichment Calls](#11-enrichment-calls)
12. [Implementation Checklist](#12-implementation-checklist)

---

## 1. Overview

The notification center is the user's hub for all BitTasker activity. It replaces the currently disabled `NotificationCenter.svelte` component with a full-featured system.

**User stories:**

- As a user, I see a bell icon with an unread count badge
- Clicking the bell opens a dropdown/panel showing my recent notifications
- Each notification shows: icon, title, body preview, time ago, read/unread state
- Clicking a notification marks it as read and navigates to the relevant page
- I can mark all as read, delete individual notifications, or clear all
- I can manage my notification preferences (categories, quiet hours, frequency)
- New notifications arrive in real-time via WebSocket
- I receive push notifications when the app is in background

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    SvelteKit Frontend                        │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ Notification  │  │ Notification │  │ Notification     │  │
│  │ Bell/Badge    │  │ Center Panel │  │ Preferences Page │  │
│  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘  │
│         │                 │                    │             │
│  ┌──────┴─────────────────┴────────────────────┴─────────┐  │
│  │              notification.store.ts                     │  │
│  │  (Svelte store: notifications[], unreadCount, prefs)   │  │
│  └──────┬─────────────────┬──────────────────────────────┘  │
│         │                 │                                  │
│  ┌──────┴───────┐  ┌─────┴──────────┐                      │
│  │ REST API     │  │ WebSocket      │                      │
│  │ Service      │  │ Service        │                      │
│  │ (CRUD)       │  │ (real-time)    │                      │
│  └──────────────┘  └────────────────┘                      │
└─────────────────────────────────────────────────────────────┘
         │                        │
         ▼                        ▼
┌────────────────┐    ┌────────────────────┐
│ NestJS Backend │    │ Socket.IO Gateway  │
│ /v1/notification│    │ /notifications NS  │
│ -center/*      │    │                    │
└────────────────┘    └────────────────────┘
```

---

## 3. Notification Center UI

### 3.1 Layout

The notification center has two modes:

**Mode 1: Bell Dropdown (desktop)**

- Bell icon in the top nav bar with unread count badge
- Clicking opens a 400px-wide dropdown panel
- Shows last 10 notifications with "View All" link
- Each notification is a clickable row

**Mode 2: Full Page (mobile + "View All")**

- Route: `/notifications`
- Paginated list (20 per page)
- Filter tabs: All | Unread | Contracts | Bids | Messages | Reviews
- Bulk actions: Mark all read, Clear all

### 3.2 Notification Card Component

```
┌─────────────────────────────────────────────────┐
│ [icon] Title text                    [time ago] │
│         Body preview text truncated...     [dot]│
│                                                 │
│ [icon] Title text                    [time ago] │
│         Body preview text truncated...          │
└─────────────────────────────────────────────────┘
```

Each card shows:

- **Category icon** (contract=handshake, bid=gavel, message=chat, review=star, wallet=bitcoin, etc.)
- **Title** (bold if unread)
- **Body** (truncated to 2 lines)
- **Time ago** (relative: "2m ago", "1h ago", "3d ago")
- **Unread dot** (blue dot for unread notifications)
- **Priority indicator** (URGENT = red border-left, HIGH = orange, NORMAL = default)

Click behavior:

1. Mark as read (PATCH `/v1/notification-center/:id/read`)
2. Navigate to `deepLink` from notification data
3. Close dropdown (if in dropdown mode)

---

## 4. Notification Bell Component

### File: `src/lib/components/notifications/NotificationBell.svelte`

```svelte
<script lang="ts">
	import { notificationStore } from '$lib/stores/notification.store';
	import NotificationDropdown from './NotificationDropdown.svelte';

	let showDropdown = false;
	$: unreadCount = $notificationStore.unreadCount;
</script>

<button class="notification-bell" on:click={() => (showDropdown = !showDropdown)}>
	<BellIcon />
	{#if unreadCount > 0}
		<span class="badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
	{/if}
</button>

{#if showDropdown}
	<NotificationDropdown on:close={() => (showDropdown = false)} />
{/if}
```

---

## 5. Notification List & Cards

### File: `src/lib/components/notifications/NotificationCard.svelte`

Props:

- `notification: ReminderNotification` — the notification object
- `compact: boolean` — for dropdown vs full page

Behavior:

- Click → `markRead(notification.id)` → `goto(notification.data.deepLink)`
- Long-press (mobile) → context menu (delete, mark unread)

### File: `src/lib/components/notifications/NotificationDropdown.svelte`

- Header: "Notifications" + "Mark all read" button
- Body: Last 10 notifications as `NotificationCard` (compact mode)
- Footer: "View all notifications" link → `/dashboard/notifications`

### File: `src/routes/(protected)/dashboard/notifications/+page.svelte`

- Filter tabs
- Paginated `NotificationCard` list
- Empty state: "You're all caught up!" with illustration

---

## 6. Notification Preferences Page

### Route: `/dashboard/settings/notifications`

**Layout:**

```
Notification Settings
─────────────────────────────────────────
Push Notifications          [toggle: ON]
Email Notifications         [toggle: OFF]

Quiet Hours                 [toggle: ON]
  From: [22:00]  To: [07:00]

─────────────────────────────────────────
TRANSACTIONAL (always on)
  ✓ Contract updates
  ✓ Security alerts
  ✓ Wallet & payments

TASK ACTIVITY
  New bids on my tasks       [toggle: ON]
  Task matching alerts       [toggle: ON]  [frequency: ▼ Instant]

MESSAGES
  Direct messages            [toggle: ON]
  Show message preview       [toggle: ON]

SERVICES
  Quote requests             [toggle: ON]
  Proposal updates           [toggle: ON]

DISCOVERY
  New tasks in my skills     [toggle: ON]  [frequency: ▼ Daily]
  Market insights            [toggle: ON]  [frequency: ▼ Weekly]

SOCIAL
  Reviews & ratings          [toggle: ON]
  Skill endorsements         [toggle: ON]

RE-ENGAGEMENT
  Inactivity reminders       [toggle: ON]
  Abandoned actions          [toggle: ON]
─────────────────────────────────────────
```

### API calls:

- `GET /v1/notification-preferences` — load current prefs
- `PUT /v1/notification-preferences` — save changes (debounced)

---

## 7. Deep Linking & Routing

### 7.1 Deep Link Resolution

The backend sends a `deepLink` field in notification data. The frontend uses this to navigate:

```typescript
function handleNotificationClick(notification: ReminderNotification) {
	// Mark as read
	notificationStore.markRead(notification.id);

	// Navigate
	const deepLink = notification.data?.deepLink;
	if (deepLink) {
		goto(deepLink);
	}
}
```

### 7.2 Dynamic Deep Links

Some notifications have dynamic segments:

- Task: `/dashboard/task/{taskId}` — the `taskId` is in `notification.data.taskId`
- Messages: `/dashboard/messages/to/{senderNpub}` — the `senderNpub` is in `notification.data.senderNpub`
- Task bids: `/dashboard/task/{taskId}/bids`

The backend resolves these before storing. The frontend just uses the stored `deepLink` directly.

### 7.3 Route Change Plan

When dashboard routes change (e.g., `dashboard?tab=contracts` → `dashboard/contracts`):

1. Update `notification-config.json` deepLinks on the backend
2. Old notifications still have old deepLinks — frontend should handle gracefully with a redirect map
3. New notifications use new deepLinks

**Frontend redirect map** (temporary, remove after migration):

```typescript
const DEEP_LINK_REDIRECTS: Record<string, string> = {
	'/dashboard?tab=contracts': '/dashboard/contracts',
	'/dashboard?tab=bids': '/dashboard/bids'
};
```

---

## 8. Real-Time Updates (WebSocket)

### 8.1 Connection

The `NotificationGateway` on the backend uses Socket.IO on the `/notifications` namespace.

```typescript
// src/lib/services/notification-socket.service.ts
import { io } from 'socket.io-client';

export function connectNotificationSocket(jwt: string) {
	const socket = io(`${API_URL}/notifications`, {
		auth: { token: `Bearer ${jwt}` },
		transports: ['websocket', 'polling']
	});

	socket.on('notification:new', (notification) => {
		notificationStore.addNotification(notification);
		// Show toast if app is in foreground
		showToast(notification);
	});

	socket.on('notification:unread-count', ({ count }) => {
		notificationStore.setUnreadCount(count);
	});

	return socket;
}
```

### 8.2 Toast Notifications

When a new notification arrives via WebSocket while the app is in foreground:

- Show a toast notification (top-right, auto-dismiss after 5s)
- Toast has the same click behavior as notification cards (mark read + navigate)
- Toast shows: icon, title, body preview

---

## 9. Push Notification Integration

### 9.1 Existing Infrastructure

The frontend already has:

- `push-notification.service.ts` — FCM + Capacitor PushNotifications
- Device registration with FCM tokens
- Foreground notification handling on Android

### 9.2 What Needs to Change

1. **Notification click handler**: When a push notification is tapped (background/cold start):

```typescript
PushNotifications.addListener('pushNotificationActionPerformed', (event) => {
	const data = event.notification.data;
	// Navigate to deepLink
	if (data.deepLink) {
		goto(data.deepLink);
	}
	// Mark as read
	if (data.notificationId) {
		notificationStore.markRead(data.notificationId);
	}
});
```

2. **FCM data payload**: The backend already sends `data` payloads (not `notification` payloads) to avoid duplicate notifications on Android. The frontend service worker / Capacitor handler needs to display the notification from the `data` payload.
3. **Badge count**: Sync unread count to app badge:

```typescript
import { Badge } from '@capacitor/badge';
Badge.set({ count: unreadCount });
```

---

## 10. Activity Tracking

The backend tracks user activity for re-engagement notifications. The frontend needs to send activity pings.

### 10.1 Activity Ping

```typescript
// src/lib/services/activity-tracker.service.ts
import { apiService } from '$lib/api/apiService';

let lastPing = 0;
const PING_INTERVAL = 5 * 60 * 1000; // 5 minutes

export function trackActivity(actionType?: string) {
	const now = Date.now();
	if (now - lastPing < PING_INTERVAL) return;
	lastPing = now;

	// This goes to the enrichment endpoint with a special action
	apiService.post('/v1/reminders/enrich', {
		action: 'user_activity'
		// No entity ID — just activity tracking
	});
}

// Call on app foreground, route changes, and key actions
```

### 10.2 Where to Call

- On every route change (in `+layout.svelte` or `afterNavigate`)
- On app foreground (Capacitor `appStateChange` listener)
- On key actions (place bid, send message, etc.)

---

## 11. Enrichment Calls

The frontend must call the enrichment endpoint at key lifecycle moments so the backend can schedule absolute-deadline reminders.

### 11.1 When to Call

| Frontend Action            | `action` value     | Required `data`                                                                            |
| -------------------------- | ------------------ | ------------------------------------------------------------------------------------------ |
| Escrow funded              | `contract_created` | `estimatedStartTime`, `estimatedCompletionTime`, `amount`, `timelockDuration`, `taskTitle` |
| Task marked complete       | `task_completed`   | (none)                                                                                     |
| Dispute raised             | `dispute_raised`   | `timelockDuration`                                                                         |
| No-show marked             | `no_show_marked`   | `responseDeadline`                                                                         |
| Work in progress           | `work_in_progress` | (none)                                                                                     |
| Task created with deadline | `task_created`     | `taskDeadline`                                                                             |

### 11.2 Implementation

```typescript
// In escrow lifecycle functions (handleEscrowCreated, markTaskComplete, etc.)
async function enrichBackend(escrowId: string, action: string, data: Record<string, any>) {
	try {
		await apiService.post('/v1/reminders/enrich', {
			escrowId,
			action,
			...data
		});
	} catch (error) {
		// Non-critical — reminders degrade gracefully
		console.warn('Enrichment call failed:', error);
	}
}
```

---

## 12. Implementation Checklist

### Phase 1: Notification Center Core (1-2 days)

- [ ] Create `notification.store.ts` (Svelte store)
- [ ] Create `notification-api.service.ts` (REST calls)
- [ ] Create `NotificationBell.svelte` component
- [ ] Create `NotificationDropdown.svelte` component
- [ ] Create `NotificationCard.svelte` component
- [ ] Create `/dashboard/notifications` page
- [ ] Wire bell into main layout (`+layout.svelte`)

### Phase 2: Real-Time & Push (1 day)

- [ ] Create `notification-socket.service.ts` (Socket.IO)
- [ ] Connect socket on login, disconnect on logout
- [ ] Handle `notification:new` events (add to store + toast)
- [ ] Handle `notification:unread-count` events
- [ ] Update push notification click handler for deep links
- [ ] Sync unread count to app badge (Capacitor)

### Phase 3: Preferences (1 day)

- [ ] Create `/dashboard/settings/notifications` page
- [ ] Implement all toggle controls
- [ ] Implement quiet hours time pickers
- [ ] Implement frequency dropdowns
- [ ] Debounced save to `PUT /v1/notification-preferences`

### Phase 4: Enrichment & Activity (1 day)

- [ ] Add enrichment calls to all contract lifecycle functions
- [ ] Add enrichment calls to task creation with deadline
- [ ] Add activity tracking to route changes
- [ ] Add activity tracking to app foreground

### Phase 5: Polish (1 day)

- [ ] Empty states (no notifications, no unread)
- [ ] Loading skeletons
- [ ] Error handling (offline, API errors)
- [ ] Accessibility (ARIA labels, keyboard navigation)
- [ ] Mobile responsive (full page instead of dropdown)
- [ ] Notification sound (optional, user preference)

---

## Appendix: API Endpoints Reference

| Method   | Endpoint                                                                  | Description                              |
| -------- | ------------------------------------------------------------------------- | ---------------------------------------- |
| `GET`    | `/v1/notification-center?page=1&limit=20&read=false&type=escrow_reminder` | List notifications (paginated, filtered) |
| `GET`    | `/v1/notification-center/unread-count`                                    | Get unread count                         |
| `PATCH`  | `/v1/notification-center/:id/read`                                        | Mark as read                             |
| `POST`   | `/v1/notification-center/read-all`                                        | Mark all as read                         |
| `DELETE` | `/v1/notification-center/:id`                                             | Delete one                               |
| `DELETE` | `/v1/notification-center`                                                 | Delete many (with `olderThan`)           |
| `GET`    | `/v1/notification-preferences`                                            | Get preferences                          |
| `PUT`    | `/v1/notification-preferences`                                            | Update preferences                       |
| `POST`   | `/v1/reminders/enrich`                                                    | Send enrichment data                     |

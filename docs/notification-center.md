# BitTasker Notification Center — Frontend Implementation Plan

**Date:** 2026-06-14 (deep audit v2)
**Status:** Implementation-ready spec (expanded)
**Audience:** Frontend engineering team (SvelteKit 5 + Capacitor)

---

## Table of Contents

1. [Overview](#1-overview)
2. [Audit Findings & Corrections](#2-audit-findings--corrections)
3. [Architecture](#3-architecture)
4. [Type Definitions](#4-type-definitions)
5. [API Layer](#5-api-layer)
6. [Notification Store](#6-notification-store)
7. [Notification Center UI Components](#7-notification-center-ui-components)
8. [Notification Preferences Page](#8-notification-preferences-page)
9. [Deep Linking & Routing](#9-deep-linking--routing)
10. [Real-Time Updates](#10-real-time-updates)
11. [Push Notification Integration](#11-push-notification-integration)
12. [Activity Tracking](#12-activity-tracking)
13. [Enrichment Calls](#13-enrichment-calls)
14. [i18n Requirements](#14-i18n-requirements)
15. [Edge Cases & Error Handling](#15-edge-cases--error-handling)
16. [Accessibility](#16-accessibility)
17. [Testing Strategy](#17-testing-strategy)
18. [Implementation Checklist](#18-implementation-checklist)
19. [Deep Audit — Gaps & Corrections](#19-deep-audit--gaps--corrections)
20. [Updated File Layout](#20-updated-file-layout)
21. [Updated Implementation Checklist](#21-updated-implementation-checklist)

---

## 1. Overview

The notification center is the user's hub for all BitTasker activity. It replaces the currently disabled `NotificationCenter.svelte` component (`src/lib/components/notifications/NotificationCenter.svelte`) with a full-featured system.

**User stories:**

- As a user, I see a bell icon with an unread count badge in the top bar (desktop) and as a dedicated indicator on mobile
- Clicking the bell opens a dropdown/panel showing my recent notifications
- Each notification shows: icon, title, body preview, time ago, read/unread state
- Clicking a notification marks it as read and navigates to the relevant page
- I can mark all as read, delete individual notifications, or clear all
- I can manage my notification preferences (categories, quiet hours, frequency)
- New notifications arrive in real-time
- I receive push notifications when the app is in background

**What already exists:**

| File                                                                   | Status                                                                                  |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `src/lib/components/notifications/NotificationCenter.svelte`           | Disabled placeholder (17 lines, all commented out)                                      |
| `src/lib/components/notifications/NotificationPermissionBanner.svelte` | Working — push permission request banner with Svelte 5 runes                            |
| `src/lib/api/services/notification.service.ts`                         | Working — device registration, preferences CRUD, topic subscribe                        |
| `src/lib/api/services/push-notification.service.ts`                    | Working — FCM + Capacitor push, foreground handling, click handling                     |
| `src/lib/types/notification.d.ts`                                      | Partial — device/push types only, no notification center types                          |
| `src/lib/api/endpoints.ts`                                             | Partial — `NOTIFICATIONS` block has device/prefs only, no notification center endpoints |
| `static/locales/en/notifications.json`                                 | Working — comprehensive i18n keys for all notification types                            |

---

## 2. Audit Findings & Corrections

The backend documentation had several mismatches with the actual frontend codebase. All are corrected in this plan.

### 2.1 Svelte 4 Syntax → Svelte 5 Runes

The backend doc used Svelte 4 patterns (`$:`, `let`, `on:click`, `export let`, `on:close`). **This project uses Svelte 5 runes exclusively.**

**Correction:** All components use `$state()`, `$derived()`, `$effect()`, `$props()`, `onclick`, and snippet-based event dispatch.

### 2.2 Socket.IO Not Installed

The backend doc assumes `socket.io-client` is available. **It is NOT in `package.json`.** The project has zero WebSocket infrastructure.

**Correction:** Two options — see [Section 10](#10-real-time-updates) for decision matrix:

- **Option A (recommended):** Install `socket.io-client` and connect to the backend's Socket.IO gateway
- **Option B (fallback):** Use REST polling (simpler, no new dependency, but less real-time)

### 2.3 `@capacitor/badge` — REQUIRED

The backend doc references `Badge.set()` from `@capacitor/badge`. **This plugin is not installed.**

`@capacitor/badge` sets the red unread count on the app icon (iOS/Android home screen). It's purely a native UX enhancement — the in-app bell badge works without it. On iOS, FCM push payloads can include a `badge` field that the OS sets automatically. On Android, badge support is launcher-dependent.

**Decision:** This UI update is required. the store's `fetchUnreadCount` success path calls `syncBadge(count)`.

**Installing:** See [Section 11.3](#113-badge-count) for setup. Requires iOS `Info.plist` changes (see Section 19.24).

### 2.4 Wrong Route Paths

The backend doc references `/dashboard/notifications` and `/dashboard/settings/notifications`. **The project has no `/dashboard` route group.** Routes use `/(app)/(protected)/`:

| Doc Path                              | Correct Path                                  |
| ------------------------------------- | --------------------------------------------- |
| `/dashboard/notifications`            | `/notifications`                              |
| `/dashboard/settings/notifications`   | `/settings/notifications`                     |
| `/dashboard/task/{taskId}`            | `/hiring/tasks/{taskId}` or `/tasks/{taskId}` |
| `/dashboard/messages/to/{senderNpub}` | `/messages`                                   |

### 2.5 Missing API Endpoints in `endpoints.ts`

The backend doc's appendix lists endpoints that don't exist in `src/lib/api/endpoints.ts`. The current `NOTIFICATIONS` block only covers devices, preferences, send, and topics. The notification center CRUD endpoints need to be added.

### 2.6 Missing Type Definitions

The backend doc references `ReminderNotification` but `src/lib/types/notification.d.ts` only has device/push types. Full notification center types need to be defined.

### 2.7 No Store Pattern Match

The backend doc uses `notificationStore.addNotification()` and `notificationStore.markRead()` but doesn't define the store. The project uses `writable` stores with custom methods (see `app.store.ts`, `auth.store.ts`).

### 2.8 Deep Link Paths Incorrect

The backend doc's deep link examples use `/dashboard/*` paths. The project's actual routes are under `/(app)/(protected)/` with paths like `/hiring`, `/earning`, `/wallet`, `/messages`, `/tasks`, `/services`.

### 2.9 Activity Tracker Imports Wrong

The backend doc imports `apiService` from `$lib/api/apiService`. The project uses `BaseApiService` pattern — services extend it, they don't import a singleton.

### 2.10 Enrichment Endpoint Not in `endpoints.ts`

`POST /v1/reminders/enrich` is not registered in the endpoints file.

---

## 3. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    SvelteKit 5 Frontend                          │
│                                                                  │
│  ┌──────────────┐  ┌───────────────┐  ┌──────────────────────┐  │
│  │ Notification  │  │ Notification  │  │ Notification         │  │
│  │ Bell/Badge    │  │ Dropdown/     │  │ Preferences Page     │  │
│  │ (ProtectedTopBar)      │  │ Full Page     │  │ (/settings/notif.)   │  │
│  └──────┬───────┘  └──────┬────────┘  └────────┬─────────────┘  │
│         │                 │                     │                │
│  ┌──────┴─────────────────┴─────────────────────┴─────────────┐  │
│  │         notification-center.store.ts (writable)            │  │
│  │  notifications[], unreadCount, loading, error, filters     │  │
│  └──────┬─────────────────┬───────────────────────────────────┘  │
│         │                 │                                      │
│  ┌──────┴───────┐  ┌─────┴──────────────┐                       │
│  │ notification │  │ notification-      │                       │
│  │ -center.     │  │ realtime.service   │                       │
│  │ service.ts   │  │ (Socket.IO or      │                       │
│  │ (REST CRUD)  │  │  polling fallback) │                       │
│  └──────────────┘  └────────────────────┘                       │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ push-notification.service.ts (existing — enhanced)         │ │
│  │ + deep-link.ts (existing — enhanced)                       │ │
│  └─────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
         │                        │
         ▼                        ▼
┌────────────────┐    ┌────────────────────────┐
│ Backend REST   │    │ Backend WebSocket      │
│ /api/v1/       │    │ (Socket.IO /notifications│
│ notification-  │    │  namespace — if         │
│ center/*       │    │  available)             │
└────────────────┘    └────────────────────────┘
```

**File layout (new files):**

```
src/lib/
├── types/
│   └── notification.d.ts          # ENHANCE — add NotificationCenter types
├── api/
│   ├── endpoints.ts               # ENHANCE — add notification center endpoints
│   └── services/
│       ├── notification-center.service.ts   # NEW — REST CRUD
│       └── notification-realtime.service.ts # NEW — Socket.IO or polling
├── stores/
│   └── notification-center.store.ts         # NEW — writable store
├── components/
│   └── notifications/
│       ├── NotificationCenter.svelte        # REWRITE — replace disabled placeholder
│       ├── NotificationBell.svelte          # NEW
│       ├── NotificationDropdown.svelte      # NEW
│       ├── NotificationCard.svelte          # NEW
│       ├── NotificationPermissionBanner.svelte # EXISTING — no changes
│       └── NotificationEmptyState.svelte    # NEW
├── utils/
│   ├── notification-icons.ts                # NEW — category → icon mapping
│   └── activity-tracker.ts                  # NEW — activity ping utility
└── runes/
    └── notificationRune.svelte.ts           # NEW (optional) — if rune pattern preferred

src/routes/(app)/(protected)/
├── notifications/
│   └── +page.svelte                         # NEW — full notification list page
└── settings/
    └── notifications/
        └── +page.svelte                     # NEW — notification preferences page
```

---

## 4. Type Definitions

### 4.1 Add to `src/lib/types/notification.d.ts`

The existing file has device/push types. Add these notification center types:

```typescript
// ─── Notification Center Types ─────────────────────────────────

export type NotificationCategory =
	| 'contract'
	| 'bid'
	| 'message'
	| 'payment'
	| 'task'
	| 'review'
	| 'security'
	| 'system'
	| 'wallet';

export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface NotificationCenterItem {
	id: string;
	userId: string;
	category: NotificationCategory;
	type: string; // e.g. 'bid_accepted', 'contract_created', 'payment_received'
	title: string;
	body: string;
	isRead: boolean;
	priority: NotificationPriority;
	data: NotificationData;
	createdAt: string; // ISO 8601
	readAt: string | null;
}

export interface NotificationData {
	deepLink?: string;
	senderName?: string;
	senderNpub?: string;
	taskId?: string;
	taskTitle?: string;
	contractId?: string;
	escrowId?: string;
	amount?: string;
	currency?: string;
	[key: string]: unknown;
}

export interface NotificationCenterListResponse {
	items: NotificationCenterItem[];
	total: number;
	page: number;
	limit: number;
	unreadCount: number;
}

export interface NotificationUnreadCountResponse {
	count: number;
}

export interface NotificationPreferenceUpdate {
	push?: boolean;
	email?: boolean;
	inApp?: boolean;
	quietHoursEnabled?: boolean;
	quietHoursStart?: string; // HH:mm
	quietHoursEnd?: string; // HH:mm
	quietHoursTimezone?: string;
	categories?: Record<
		string,
		{
			enabled: boolean;
			frequency?: 'instant' | 'hourly' | 'daily' | 'weekly';
		}
	>;
}

export interface NotificationPreferencesExtended extends NotificationPreferences {
	quietHoursEnabled: boolean;
	quietHoursStart: string | null;
	quietHoursEnd: string | null;
	quietHoursTimezone: string | null;
	categories: Record<
		string,
		{
			enabled: boolean;
			frequency?: 'instant' | 'hourly' | 'daily' | 'weekly';
		}
	>;
}

export interface EnrichmentRequest {
	action: string;
	escrowId?: string;
	estimatedStartTime?: string;
	estimatedCompletionTime?: string;
	amount?: string;
	timelockDuration?: string;
	taskTitle?: string;
	taskDeadline?: string;
	responseDeadline?: string;
	[key: string]: unknown;
}
```

### 4.2 Notification Filters

```typescript
export interface NotificationFilters {
	page: number;
	limit: number;
	read?: boolean; // undefined = all, true = read only, false = unread only
	category?: NotificationCategory;
	type?: string;
}
```

---

## 5. API Layer

### 5.1 Update `src/lib/api/endpoints.ts`

Add to the `ENDPOINTS` object:

```typescript
NOTIFICATION_CENTER: {
	LIST: `${API_PATH}/${API_VERSION}/notification-center`,
	UNREAD_COUNT: `${API_PATH}/${API_VERSION}/notification-center/unread-count`,
	MARK_READ: (id: string) => `${API_PATH}/${API_VERSION}/notification-center/${id}/read`,
	READ_ALL: `${API_PATH}/${API_VERSION}/notification-center/read-all`,
	DELETE: (id: string) => `${API_PATH}/${API_VERSION}/notification-center/${id}`,
	DELETE_MANY: `${API_PATH}/${API_VERSION}/notification-center`,
},

REMINDERS: {
	ENRICH: `${API_PATH}/${API_VERSION}/reminders/enrich`,
},
```

### 5.2 New Service: `src/lib/api/services/notification-center.service.ts`

```typescript
import { BaseApiService } from '../apiService';
import { ENDPOINTS } from '../endpoints';
import type {
	NotificationCenterItem,
	NotificationCenterListResponse,
	NotificationUnreadCountResponse,
	NotificationFilters
} from '$lib/types/notification';

export class NotificationCenterService extends BaseApiService {
	async list(filters: NotificationFilters): Promise<NotificationCenterListResponse> {
		const params = new URLSearchParams();
		params.set('page', String(filters.page));
		params.set('limit', String(filters.limit));
		if (filters.read !== undefined) params.set('read', String(filters.read));
		if (filters.category) params.set('type', filters.category);

		const response = await this.get<NotificationCenterListResponse>(
			`${ENDPOINTS.NOTIFICATION_CENTER.LIST}?${params.toString()}`
		);
		return response.data;
	}

	async getUnreadCount(): Promise<number> {
		const response = await this.get<NotificationUnreadCountResponse>(
			ENDPOINTS.NOTIFICATION_CENTER.UNREAD_COUNT
		);
		return response.data.count;
	}

	async markRead(id: string): Promise<void> {
		await this.patch(ENDPOINTS.NOTIFICATION_CENTER.MARK_READ(id));
	}

	async markAllRead(): Promise<void> {
		await this.post(ENDPOINTS.NOTIFICATION_CENTER.READ_ALL);
	}

	async deleteOne(id: string): Promise<void> {
		await this.delete(ENDPOINTS.NOTIFICATION_CENTER.DELETE(id));
	}

	async deleteMany(olderThan?: string): Promise<void> {
		const config = olderThan ? { params: { olderThan } } : undefined;
		await this.delete(ENDPOINTS.NOTIFICATION_CENTER.DELETE_MANY, config);
	}
}

export const notificationCenterService = new NotificationCenterService();
```

### 5.3 New Service: `src/lib/api/services/enrichment.service.ts`

```typescript
import { BaseApiService } from '../apiService';
import { ENDPOINTS } from '../endpoints';
import type { EnrichmentRequest } from '$lib/types/notification';

export class EnrichmentService extends BaseApiService {
	async enrich(data: EnrichmentRequest): Promise<void> {
		try {
			await this.post(ENDPOINTS.REMINDERS.ENRICH, data);
		} catch (error) {
			// Non-critical — reminders degrade gracefully
			console.warn('[Enrichment] call failed:', error);
		}
	}
}

export const enrichmentService = new EnrichmentService();
```

---

## 6. Notification Store

### File: `src/lib/stores/notification-center.store.ts`

Follows the project's `writable` store pattern (see `app.store.ts`, `task.store.ts`).

```typescript
import { writable, derived, get } from 'svelte/store';
import type {
	NotificationCenterItem,
	NotificationFilters,
	NotificationCategory
} from '$lib/types/notification';
import { notificationCenterService } from '$lib/api/services/notification-center.service';
import { appStore } from './app.store';
import { browser } from '$app/environment';

interface NotificationCenterState {
	notifications: NotificationCenterItem[];
	unreadCount: number;
	loading: boolean;
	loadingMore: boolean;
	error: string | null;
	page: number;
	total: number;
	hasMore: boolean;
	activeFilter: 'all' | 'unread' | NotificationCategory;
	initialized: boolean;
}

const initialState: NotificationCenterState = {
	notifications: [],
	unreadCount: 0,
	loading: false,
	loadingMore: false,
	error: null,
	page: 1,
	total: 0,
	hasMore: true,
	activeFilter: 'all',
	initialized: false
};

const PAGE_SIZE = 20;

function createNotificationCenterStore() {
	const { subscribe, set, update } = writable<NotificationCenterState>(initialState);

	function buildFilters(state: NotificationCenterState): NotificationFilters {
		const filters: NotificationFilters = {
			page: state.page,
			limit: PAGE_SIZE
		};
		if (state.activeFilter === 'unread') {
			filters.read = false;
		} else if (state.activeFilter !== 'all') {
			filters.category = state.activeFilter;
		}
		return filters;
	}

	return {
		subscribe,

		async fetchNotifications(reset = false) {
			const state = get({ subscribe });
			if (state.loading) return;

			update((s) => ({
				...s,
				loading: reset || !s.initialized,
				loadingMore: !reset && s.initialized,
				error: null,
				page: reset ? 1 : s.page
			}));

			try {
				const currentState = get({ subscribe });
				const filters = buildFilters(currentState);
				const response = await notificationCenterService.list(filters);

				update((s) => ({
					...s,
					notifications: reset ? response.items : [...s.notifications, ...response.items],
					unreadCount: response.unreadCount,
					total: response.total,
					page: response.page,
					hasMore: response.items.length === PAGE_SIZE,
					loading: false,
					loadingMore: false,
					initialized: true
				}));
			} catch (error) {
				const message = error instanceof Error ? error.message : 'Failed to load notifications';
				update((s) => ({
					...s,
					loading: false,
					loadingMore: false,
					error: message
				}));
			}
		},

		async loadMore() {
			const state = get({ subscribe });
			if (!state.hasMore || state.loadingMore) return;
			update((s) => ({ ...s, page: s.page + 1 }));
			await this.fetchNotifications(false);
		},

		async refresh() {
			await this.fetchNotifications(true);
		},

		async fetchUnreadCount() {
			try {
				const count = await notificationCenterService.getUnreadCount();
				update((s) => ({ ...s, unreadCount: count }));
			} catch {
				// Silent fail — badge will show stale count
			}
		},

		async markRead(id: string) {
			// Optimistic update
			update((s) => ({
				...s,
				notifications: s.notifications.map((n) =>
					n.id === id ? { ...n, isRead: true, readAt: new Date().toISOString() } : n
				),
				unreadCount: Math.max(0, s.unreadCount - 1)
			}));

			try {
				await notificationCenterService.markRead(id);
			} catch {
				// Revert on failure
				await this.refresh();
			}
		},

		async markAllRead() {
			// Optimistic update
			update((s) => ({
				...s,
				notifications: s.notifications.map((n) => ({
					...n,
					isRead: true,
					readAt: n.readAt ?? new Date().toISOString()
				})),
				unreadCount: 0
			}));

			try {
				await notificationCenterService.markAllRead();
			} catch {
				await this.refresh();
			}
		},

		async deleteNotification(id: string) {
			// Optimistic update
			let wasUnread = false;
			update((s) => {
				const target = s.notifications.find((n) => n.id === id);
				wasUnread = target ? !target.isRead : false;
				return {
					...s,
					notifications: s.notifications.filter((n) => n.id !== id),
					total: s.total - 1,
					unreadCount: wasUnread ? Math.max(0, s.unreadCount - 1) : s.unreadCount
				};
			});

			try {
				await notificationCenterService.deleteOne(id);
			} catch {
				await this.refresh();
			}
		},

		async clearAll() {
			const prev = get({ subscribe });
			set({ ...initialState, initialized: true });

			try {
				await notificationCenterService.deleteMany();
			} catch {
				set(prev);
			}
		},

		setFilter(filter: 'all' | 'unread' | NotificationCategory) {
			update((s) => ({ ...s, activeFilter: filter }));
			this.refresh();
		},

		addFromRealtime(notification: NotificationCenterItem) {
			update((s) => ({
				...s,
				notifications: [notification, ...s.notifications],
				unreadCount: s.unreadCount + 1,
				total: s.total + 1
			}));
		},

		reset() {
			set(initialState);
		}
	};
}

export const notificationCenterStore = createNotificationCenterStore();
```

---

## 7. Notification Center UI Components

### 7.1 Icon Mapping Utility

**File:** `src/lib/utils/notification-icons.ts`

```typescript
import IconHandshake from '~icons/mdi/handshake';
import IconGavel from '~icons/mdi/gavel';
import IconChatOutline from '~icons/mdi/chat-outline';
import IconStarOutline from '~icons/mdi/star-outline';
import IconBitcoin from '~icons/mdi/bitcoin';
import IconClipboardCheck from '~icons/mdi/clipboard-check';
import IconShieldAlert from '~icons/mdi/shield-alert';
import IconCog from '~icons/mdi/cog';
import IconBell from '~icons/mdi/bell';
import type { NotificationCategory } from '$lib/types/notification';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type IconComponent = any;

const CATEGORY_ICONS: Record<NotificationCategory, IconComponent> = {
	contract: IconHandshake,
	bid: IconGavel,
	message: IconChatOutline,
	payment: IconBitcoin,
	task: IconClipboardCheck,
	review: IconStarOutline,
	security: IconShieldAlert,
	system: IconCog,
	wallet: IconBitcoin
};

export function getCategoryIcon(category: NotificationCategory): IconComponent {
	return CATEGORY_ICONS[category] ?? IconBell;
}

export function getCategoryColor(category: NotificationCategory): string {
	const colors: Record<NotificationCategory, string> = {
		contract: 'text-primary',
		bid: 'text-secondary',
		message: 'text-info',
		payment: 'text-warning',
		task: 'text-success',
		review: 'text-accent',
		security: 'text-error',
		system: 'text-base-content/60',
		wallet: 'text-warning'
	};
	return colors[category] ?? 'text-base-content/60';
}
```

### 7.2 NotificationBell Component

**File:** `src/lib/components/notifications/NotificationBell.svelte`

Replaces the disabled `NotificationCenter.svelte`. Uses Svelte 5 runes. Integrated into `ProtectedTopBar.svelte` (line 263).

```svelte
<script lang="ts">
	import { notificationCenterStore } from '$lib/stores/notification-center.store';
	import NotificationDropdown from './NotificationDropdown.svelte';
	import IconBell from '~icons/mdi/bell';
	import IconBellBadge from '~icons/mdi/bell-badge';
	import { clickOutside } from '$lib/utils/clickOutside';
	import { t } from 'svelte-i18n';

	let showDropdown = $state(false);
	let unreadCount = $derived($notificationCenterStore.unreadCount);
	let hasUnread = $derived(unreadCount > 0);

	function toggleDropdown() {
		showDropdown = !showDropdown;
		if (showDropdown && !$notificationCenterStore.initialized) {
			notificationCenterStore.fetchNotifications(true);
		}
	}

	function closeDropdown() {
		showDropdown = false;
	}
</script>

<div class="relative" use:clickOutside={{ callback: closeDropdown }}>
	<button
		class="btn btn-ghost btn-sm hover:bg-base-200 p-2 transition-colors"
		onclick={toggleDropdown}
		aria-label={$t('notifications.aria_labels.notifications')}
		aria-expanded={showDropdown}
		aria-haspopup="true"
	>
		{#if hasUnread}
			<IconBellBadge class="text-primary h-5 w-5" />
		{:else}
			<IconBell class="text-base-content/70 h-5 w-5" />
		{/if}
		{#if hasUnread}
			<span
				class="badge badge-sm badge-primary absolute -top-1 -right-1 h-[18px] min-w-[18px] px-1 text-[10px]"
			>
				{unreadCount > 99 ? '99+' : unreadCount}
			</span>
		{/if}
	</button>

	{#if showDropdown}
		<NotificationDropdown onclose={closeDropdown} />
	{/if}
</div>
```

### 7.3 NotificationDropdown Component

**File:** `src/lib/components/notifications/NotificationDropdown.svelte`

```svelte
<script lang="ts">
	import { notificationCenterStore } from '$lib/stores/notification-center.store';
	import NotificationCard from './NotificationCard.svelte';
	import NotificationEmptyState from './NotificationEmptyState.svelte';
	import { goto } from '$app/navigation';
	import { t } from 'svelte-i18n';
	import IconCheckAll from '~icons/mdi/check-all';

	let { onclose }: { onclose: () => void } = $props();

	let notifications = $derived($notificationCenterStore.notifications.slice(0, 10));
	let loading = $derived($notificationCenterStore.loading);
	let unreadCount = $derived($notificationCenterStore.unreadCount);

	async function handleMarkAllRead() {
		await notificationCenterStore.markAllRead();
	}

	async function handleViewAll() {
		onclose();
		await goto('/notifications');
	}
</script>

<div
	class="border-base-300 bg-base-100 absolute top-full right-0 z-50 mt-2 w-[400px] max-w-[calc(100vw-2rem)] rounded-xl border shadow-xl"
	role="dialog"
	aria-label={$t('notifications.aria_labels.notifications')}
>
	<!-- Header -->
	<div class="border-base-200 flex items-center justify-between border-b px-4 py-3">
		<h3 class="text-sm font-semibold">{$t('notifications.title')}</h3>
		{#if unreadCount > 0}
			<button class="btn btn-ghost btn-xs text-primary gap-1" onclick={handleMarkAllRead}>
				<IconCheckAll class="h-3.5 w-3.5" />
				{$t('notifications.mark_all_read')}
			</button>
		{/if}
	</div>

	<!-- Body -->
	<div class="max-h-[400px] overflow-y-auto">
		{#if loading}
			<div class="flex items-center justify-center py-8">
				<span class="loading loading-spinner loading-md"></span>
			</div>
		{:else if notifications.length === 0}
			<NotificationEmptyState compact />
		{:else}
			<div class="divide-base-200 divide-y">
				{#each notifications as notification (notification.id)}
					<NotificationCard {notification} compact {onclose} />
				{/each}
			</div>
		{/if}
	</div>

	<!-- Footer -->
	{#if notifications.length > 0}
		<div class="border-base-200 border-t px-4 py-2 text-center">
			<button class="btn btn-ghost btn-sm text-primary w-full" onclick={handleViewAll}>
				{$t('notifications.view_all')}
			</button>
		</div>
	{/if}
</div>
```

### 7.4 NotificationCard Component

**File:** `src/lib/components/notifications/NotificationCard.svelte`

```svelte
<script lang="ts">
	import type { NotificationCenterItem } from '$lib/types/notification';
	import { notificationCenterStore } from '$lib/stores/notification-center.store';
	import { getCategoryIcon, getCategoryColor } from '$lib/utils/notification-icons';
	import { goto } from '$app/navigation';
	import { t } from 'svelte-i18n';
	import IconDelete from '~icons/mdi/delete-outline';
	import { isValidInternalPath } from '$lib/utils/deep-link';

	let {
		notification,
		compact = false,
		onclose
	}: {
		notification: NotificationCenterItem;
		compact?: boolean;
		onclose?: () => void;
	} = $props();

	let CategoryIcon = $derived(getCategoryIcon(notification.category));
	let iconColor = $derived(getCategoryColor(notification.category));
	let isUnread = $derived(!notification.isRead);

	function timeAgo(dateStr: string): string {
		const now = Date.now();
		const then = new Date(dateStr).getTime();
		const diffMs = now - then;
		const diffMin = Math.floor(diffMs / 60000);
		const diffHr = Math.floor(diffMs / 3600000);
		const diffDay = Math.floor(diffMs / 86400000);
		const diffWeek = Math.floor(diffMs / 604800000);
		const diffMonth = Math.floor(diffMs / 2592000000);

		if (diffMin < 1) return $t('notifications.just_now');
		if (diffMin < 60) return $t('notifications.minutes_ago', { values: { count: diffMin } });
		if (diffHr < 24) return $t('notifications.hours_ago', { values: { count: diffHr } });
		if (diffDay < 7) return $t('notifications.days_ago', { values: { count: diffDay } });
		if (diffWeek < 4) return $t('notifications.weeks_ago', { values: { count: diffWeek } });
		return $t('notifications.months_ago', { values: { count: diffMonth } });
	}

	let priorityBorder = $derived.by(() => {
		switch (notification.priority) {
			case 'urgent':
				return 'border-l-4 border-l-error';
			case 'high':
				return 'border-l-4 border-l-warning';
			default:
				return '';
		}
	});

	async function handleClick() {
		if (isUnread) {
			await notificationCenterStore.markRead(notification.id);
		}
		const deepLink = notification.data?.deepLink;
		if (deepLink && isValidInternalPath(deepLink)) {
			onclose?.();
			await goto(deepLink);
		}
	}

	async function handleDelete(event: MouseEvent) {
		event.stopPropagation();
		await notificationCenterStore.deleteNotification(notification.id);
	}
</script>

<button
	class="hover:bg-base-200/50 flex w-full items-start gap-3 px-4 py-3 text-left
		transition-colors {isUnread ? 'bg-base-200/30' : ''}
		{priorityBorder} {compact ? 'py-2' : 'py-3'}"
	onclick={handleClick}
	role="listitem"
	aria-label={notification.title}
>
	<!-- Icon -->
	<div class="mt-0.5 shrink-0 {iconColor}">
		<CategoryIcon class="h-5 w-5" />
	</div>

	<!-- Content -->
	<div class="min-w-0 flex-1">
		<div class="flex items-start justify-between gap-2">
			<p class="text-sm {isUnread ? 'font-semibold' : 'font-medium'} truncate">
				{notification.title}
			</p>
			<div class="flex shrink-0 items-center gap-2">
				<span class="text-base-content/50 text-xs whitespace-nowrap">
					{timeAgo(notification.createdAt)}
				</span>
				{#if isUnread}
					<span
						class="bg-primary h-2 w-2 shrink-0 rounded-full"
						aria-label={$t('notifications.unread')}
					></span>
				{/if}
			</div>
		</div>
		<p class="text-base-content/60 mt-0.5 text-xs {compact ? 'line-clamp-1' : 'line-clamp-2'}">
			{notification.body}
		</p>
	</div>

	<!-- Delete button (visible on hover) -->
	<button
		class="btn btn-ghost btn-xs shrink-0 self-center opacity-0 group-hover:opacity-100 focus:opacity-100"
		onclick={handleDelete}
		aria-label={$t('notifications.notifications_actions.remove')}
	>
		<IconDelete class="text-base-content/40 h-3.5 w-3.5" />
	</button>
</button>
```

### 7.5 NotificationEmptyState Component

**File:** `src/lib/components/notifications/NotificationEmptyState.svelte`

```svelte
<script lang="ts">
	import { t } from 'svelte-i18n';
	import IconBellCheck from '~icons/mdi/bell-check-outline';

	let { compact = false }: { compact?: boolean } = $props();
</script>

<div class="flex flex-col items-center justify-center {compact ? 'px-4 py-8' : 'py-16'}">
	<IconBellCheck class="text-base-content/20 mb-3 h-12 w-12 {compact ? 'h-8 w-8' : ''}" />
	<p class="text-base-content/60 text-sm font-medium">
		{$t('notifications.all_caught_up')}
	</p>
</div>
```

### 7.6 Full Notification List Page

**File:** `src/routes/(app)/(protected)/notifications/+page.svelte`

```svelte
<script lang="ts">
	import { onMount } from 'svelte';
	import { t } from 'svelte-i18n';
	import { notificationCenterStore } from '$lib/stores/notification-center.store';
	import NotificationCard from '$lib/components/notifications/NotificationCard.svelte';
	import NotificationEmptyState from '$lib/components/notifications/NotificationEmptyState.svelte';
	import type { NotificationCategory } from '$lib/types/notification';

	type FilterTab = 'all' | 'unread' | NotificationCategory;

	const tabs: FilterTab[] = ['all', 'unread', 'contract', 'bid', 'message', 'payment', 'review'];

	let activeFilter = $derived($notificationCenterStore.activeFilter);
	let notifications = $derived($notificationCenterStore.notifications);
	let loading = $derived($notificationCenterStore.loading);
	let loadingMore = $derived($notificationCenterStore.loadingMore);
	let hasMore = $derived($notificationCenterStore.hasMore);
	let total = $derived($notificationCenterStore.total);
	let unreadCount = $derived($notificationCenterStore.unreadCount);

	onMount(() => {
		notificationCenterStore.refresh();
	});

	function handleFilterChange(filter: FilterTab) {
		notificationCenterStore.setFilter(filter);
	}

	function handleLoadMore() {
		notificationCenterStore.loadMore();
	}

	function handleMarkAllRead() {
		notificationCenterStore.markAllRead();
	}

	function handleClearAll() {
		notificationCenterStore.clearAll();
	}
</script>

<svelte:head>
	<title>{$t('notifications.page_title')}</title>
</svelte:head>

<div class="mx-auto h-full max-w-3xl px-2 py-6 md:px-0">
	<!-- Header -->
	<div class="mb-6 flex items-center justify-between">
		<div>
			<h3>{$t('notifications.title')}</h3>
			<p class="text-base-content/70 text-sm">{$t('notifications.subtitle')}</p>
		</div>
		<div class="flex gap-2">
			{#if unreadCount > 0}
				<button class="btn btn-ghost btn-sm text-primary" onclick={handleMarkAllRead}>
					{$t('notifications.mark_all_read')}
				</button>
			{/if}
			{#if notifications.length > 0}
				<button class="btn btn-ghost btn-sm text-error" onclick={handleClearAll}>
					{$t('notifications.clear_all')}
				</button>
			{/if}
		</div>
	</div>

	<!-- Filter tabs -->
	<div class="mb-4 flex gap-2 overflow-x-auto pb-2">
		{#each tabs as tab (tab)}
			<button
				class="btn btn-sm {activeFilter === tab ? 'btn-primary' : 'btn-ghost'}"
				onclick={() => handleFilterChange(tab)}
			>
				{$t(`notifications.filters.${tab === 'all' ? 'all' : tab}`)}
				{#if tab === 'unread' && unreadCount > 0}
					<span class="badge badge-xs">{unreadCount}</span>
				{/if}
			</button>
		{/each}
	</div>

	<!-- Notification list -->
	{#if loading}
		<div class="flex items-center justify-center py-16">
			<span class="loading loading-spinner loading-lg"></span>
		</div>
	{:else if notifications.length === 0}
		<NotificationEmptyState />
	{:else}
		<div class="divide-base-200 border-base-300 bg-base-100 divide-y rounded-xl border">
			{#each notifications as notification (notification.id)}
				<NotificationCard {notification} />
			{/each}
		</div>

		<!-- Load more -->
		{#if hasMore}
			<div class="mt-4 text-center">
				<button class="btn btn-outline btn-sm" onclick={handleLoadMore} disabled={loadingMore}>
					{#if loadingMore}
						<span class="loading loading-spinner loading-xs"></span>
					{/if}
					{$t('notifications.show_all')}
				</button>
			</div>
		{/if}

		<!-- Stats -->
		<div class="text-base-content/50 mt-4 text-center text-xs">
			{$t('notifications.stats.showing')}
			{notifications.length}
			{$t('notifications.stats.of')}
			{total}
			{$t('notifications.stats.notifications')}
		</div>
	{/if}
</div>
```

### 7.7 Wire Bell into ProtectedTopBar

In `src/lib/components/topbar/ProtectedTopBar.svelte`, replace line 263:

```diff
- <NotificationCenter />
+ <NotificationBell />
```

Update the import at the top of the file:

```diff
- import NotificationCenter from '$lib/components/notifications/NotificationCenter.svelte';
+ import NotificationBell from '$lib/components/notifications/NotificationBell.svelte';
```

### 7.8 Initialize Store on Auth

In `src/routes/(app)/(protected)/+layout.svelte`, add after wallet initialization (inside the `onMount` try block, after line 44):

```typescript
// Initialize notification center store
const { notificationCenterStore } = await import('$lib/stores/notification-center.store');
await notificationCenterStore.fetchUnreadCount();
```

---

## 8. Notification Preferences Page

### Route: `src/routes/(app)/(protected)/settings/notifications/+page.svelte`

This page uses the existing `NotificationPreferences` type and the existing `ENDPOINTS.NOTIFICATIONS.PREFERENCES` endpoint.

The backend doc's preferences categories (TASK ACTIVITY, MESSAGES, SERVICES, DISCOVERY, SOCIAL, RE-ENGAGEMENT) need to be validated against what the backend actually supports. The existing `NotificationPreferences` type has these boolean fields:

- `push`, `email`, `inApp`
- `pushTaskMatches`, `pushBidUpdates`, `pushMessages`, `pushPayments`, `pushSystemUpdates`

The extended preferences (quiet hours, category-level frequency) require backend support. The plan below covers both the existing fields and the extended fields.

```svelte
<script lang="ts">
	import { onMount } from 'svelte';
	import { t } from 'svelte-i18n';
	import { notificationService } from '$lib/api/services/notification.service';
	import type { NotificationPreferences } from '$lib/types/notification';
	import { appStore } from '$lib/stores/app.store';

	let prefs = $state<NotificationPreferences | null>(null);
	let loading = $state(true);
	let saving = $state(false);
	let error = $state<string | null>(null);

	onMount(async () => {
		try {
			prefs = await notificationService.getNotificationPreferences();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load preferences';
		} finally {
			loading = false;
		}
	});

	let saveTimeout: ReturnType<typeof setTimeout> | null = null;

	function debouncedSave() {
		if (saveTimeout) clearTimeout(saveTimeout);
		saveTimeout = setTimeout(async () => {
			if (!prefs) return;
			saving = true;
			try {
				// PUT to update preferences
				// await notificationService.updatePreferences(prefs);
				appStore.showSuccessToast($t('notifications.success.settings_updated'));
			} catch {
				appStore.showErrorToast($t('notifications.errors.settings_error'));
			} finally {
				saving = false;
			}
		}, 500);
	}

	function toggleField(field: keyof NotificationPreferences) {
		if (!prefs || typeof prefs[field] !== 'boolean') return;
		(prefs as Record<string, boolean>)[field] = !(prefs as Record<string, boolean>)[field];
		prefs = { ...prefs }; // trigger reactivity
		debouncedSave();
	}
</script>
```

**Layout sections (matching backend doc):**

1. **Master toggles:** Push, Email, In-App
2. **Quiet hours:** Toggle + time pickers (requires extended backend support)
3. **Category sections:** Transactional (always on), Task Activity, Messages, Services, Discovery, Social, Re-engagement
4. **Frequency selectors** for applicable categories (instant/hourly/daily/weekly)

**Note:** The `notificationService` class currently has `getNotificationPreferences()` but no `updatePreferences()` method. Add a `PUT` method to `notification.service.ts`:

```typescript
async updatePreferences(preferences: Partial<NotificationPreferences>): Promise<NotificationPreferences> {
	const response = await this.put<NotificationPreferences>(
		ENDPOINTS.NOTIFICATIONS.PREFERENCES,
		preferences
	);
	return response.data;
}
```

---

## 9. Deep Linking & Routing

### 9.1 Deep Link Resolution

The backend sends a `deepLink` field in notification data. The frontend validates and navigates:

```typescript
import { isValidInternalPath } from '$lib/utils/deep-link';
import { goto } from '$app/navigation';

async function handleNotificationClick(notification: NotificationCenterItem) {
	await notificationCenterStore.markRead(notification.id);

	const deepLink = notification.data?.deepLink;
	if (deepLink && isValidInternalPath(deepLink)) {
		await goto(deepLink);
	}
}
```

The existing `isValidInternalPath()` in `src/lib/utils/deep-link.ts` already prevents open-redirect attacks (checks `startsWith('/') && !startsWith('//')`).

### 9.2 Correct Deep Link Paths

| Notification Type | Deep Link Pattern                           | Notes                            |
| ----------------- | ------------------------------------------- | -------------------------------- |
| Task related      | `/hiring/my-tasks` or `/tasks/{taskId}`     | Match actual route structure     |
| Bid received      | `/hiring/my-tasks`                          | Task list where bids are visible |
| Contract          | `/hiring/contracts` or `/earning/contracts` | Depends on user role             |
| Message           | `/messages`                                 | Existing messages route          |
| Payment           | `/wallet`                                   | Existing wallet route            |
| Review            | `/reviews`                                  | Existing reviews route           |
| Security          | `/settings`                                 | Existing settings route          |

### 9.3 Redirect Map for Legacy Deep Links

The backend may send old `/dashboard/*` paths during migration. Add a redirect map:

**File:** `src/lib/utils/notification-deep-link-map.ts`

```typescript
const DEEP_LINK_REDIRECTS: Record<string, string> = {
	'/dashboard?tab=contracts': '/hiring/contracts',
	'/dashboard?tab=bids': '/earning/bids',
	'/dashboard/task': '/tasks',
	'/dashboard/messages': '/messages'
};

export function resolveNotificationDeepLink(rawLink: string): string {
	// Check for exact match first
	if (DEEP_LINK_REDIRECTS[rawLink]) {
		return DEEP_LINK_REDIRECTS[rawLink];
	}

	// Check for prefix match (dynamic segments)
	for (const [prefix, replacement] of Object.entries(DEEP_LINK_REDIRECTS)) {
		if (rawLink.startsWith(prefix)) {
			return rawLink.replace(prefix, replacement);
		}
	}

	return rawLink;
}
```

---

## 10. Real-Time Updates

### 10.1 Decision: Socket.IO vs Polling

| Factor           | Socket.IO                           | Polling                |
| ---------------- | ----------------------------------- | ---------------------- |
| Real-time        | True real-time                      | 15-30s delay           |
| Dependency       | `socket.io-client` (~50KB)          | None                   |
| Backend support  | Requires Socket.IO gateway          | Any REST endpoint      |
| Complexity       | Medium (connection mgmt, reconnect) | Low                    |
| Offline handling | Reconnect logic needed              | Skip when offline      |
| Battery impact   | Low (persistent connection)         | Higher (periodic wake) |

**Recommendation:** Start with **polling** for v1. Add Socket.IO when the backend gateway is confirmed stable. The polling approach integrates cleanly with the existing `notificationCenterService`.

### 10.2 Polling Service (v1)

**File:** `src/lib/api/services/notification-realtime.service.ts`

```typescript
import { browser } from '$app/environment';
import { Capacitor } from '@capacitor/core';
import { notificationCenterStore } from '$lib/stores/notification-center.store';
import { appStore } from '$lib/stores/app.store';
import { authState } from '$lib/stores/auth.store';
import { get } from 'svelte/store';

const POLL_INTERVAL = 30_000; // 30 seconds
const POLL_INTERVAL_BACKGROUND = 120_000; // 2 minutes when app backgrounded

let pollTimer: ReturnType<typeof setInterval> | null = null;
let lastUnreadCount = 0;
let isRunning = false;

export function startNotificationPolling(): void {
	if (!browser || isRunning) return;
	isRunning = true;

	const poll = async () => {
		const auth = get(authState);
		if (!auth.isAuthenticated) return;

		try {
			await notificationCenterStore.fetchUnreadCount();
			const currentCount = get(notificationCenterStore).unreadCount;

			if (currentCount > lastUnreadCount && lastUnreadCount > 0) {
				// New notifications arrived — fetch them
				await notificationCenterStore.fetchNotifications(true);

				// Show toast for foreground
				appStore.showInfoToast(
					`${currentCount - lastUnreadCount} new notification${currentCount - lastUnreadCount > 1 ? 's' : ''}`
				);
			}
			lastUnreadCount = currentCount;
		} catch {
			// Silent fail — will retry on next poll
		}
	};

	// Initial poll
	poll();

	// Set up interval
	pollTimer = setInterval(poll, POLL_INTERVAL);

	// Adjust for app lifecycle on native
	if (Capacitor.isNativePlatform()) {
		setupAppLifecycleListeners();
	}
}

export function stopNotificationPolling(): void {
	if (pollTimer) {
		clearInterval(pollTimer);
		pollTimer = null;
	}
	isRunning = false;
	lastUnreadCount = 0;
}

function setupAppLifecycleListeners(): void {
	// @capacitor/app is used in deep-link.ts, same pattern here
	import('@capacitor/app').then(({ App }) => {
		App.addListener('appStateChange', ({ isActive }) => {
			if (isActive) {
				// App resumed — poll immediately and restart normal interval
				if (pollTimer) clearInterval(pollTimer);
				pollTimer = setInterval(() => notificationCenterStore.fetchUnreadCount(), POLL_INTERVAL);
				notificationCenterStore.fetchUnreadCount();
			} else {
				// App backgrounded — slow down polling
				if (pollTimer) clearInterval(pollTimer);
				pollTimer = setInterval(
					() => notificationCenterStore.fetchUnreadCount(),
					POLL_INTERVAL_BACKGROUND
				);
			}
		});
	});
}
```

### 10.3 Socket.IO Service (v2 — when backend is ready)

**File:** `src/lib/api/services/notification-realtime.service.ts` (replacement)

Requires: `npm install socket.io-client`

```typescript
import { io, Socket } from 'socket.io-client';
import { Preferences } from '@capacitor/preferences';
import { StorageKeys } from '$lib/utils/constants/storage';
import { notificationCenterStore } from '$lib/stores/notification-center.store';
import { appStore } from '$lib/stores/app.store';
import { browser } from '$app/environment';
import type { NotificationCenterItem } from '$lib/types/notification';

let socket: Socket | null = null;

export async function connectNotificationSocket(): Promise<void> {
	if (!browser || socket?.connected) return;

	const { value: token } = await Preferences.get({ key: StorageKeys.ACCESS_TOKEN });
	if (!token) return;

	const API_URL = import.meta.env.VITE_API_URL;

	socket = io(`${API_URL}/notifications`, {
		auth: { token: `Bearer ${token}` },
		transports: ['websocket', 'polling'],
		reconnection: true,
		reconnectionDelay: 1000,
		reconnectionDelayMax: 30000,
		reconnectionAttempts: Infinity
	});

	socket.on('notification:new', (notification: NotificationCenterItem) => {
		notificationCenterStore.addFromRealtime(notification);
		appStore.showInfoToast(notification.title);
	});

	socket.on('notification:unread-count', ({ count }: { count: number }) => {
		// Direct count sync from server
		notificationCenterStore.fetchUnreadCount();
	});

	socket.on('connect_error', (error) => {
		console.warn('[NotificationSocket] Connection error:', error.message);
	});

	socket.on('disconnect', (reason) => {
		console.log('[NotificationSocket] Disconnected:', reason);
	});
}

export function disconnectNotificationSocket(): void {
	if (socket) {
		socket.disconnect();
		socket = null;
	}
}
```

### 10.4 Lifecycle Integration

Connect/disconnect on auth state changes. In `src/routes/(app)/(protected)/+layout.svelte`:

```typescript
$effect(() => {
	if (!browser) return;

	if ($authState.isAuthenticated) {
		startNotificationPolling();
		// When Socket.IO is ready:
		// connectNotificationSocket();
	} else {
		stopNotificationPolling();
		// disconnectNotificationSocket();
	}
});
```

---

## 11. Push Notification Integration

### 11.1 Existing Infrastructure

The `push-notification.service.ts` already handles:

- FCM token registration (web + native)
- Capacitor PushNotifications listeners
- Foreground notification display (Android via LocalNotifications)
- Click action navigation via `handleNotificationData()`

### 11.2 Enhance Click Handler for Notification Center

The existing click handler at `push-notification.service.ts:379` uses `window.location.href` for navigation. Enhance it to also mark as read:

```typescript
// In push-notification.service.ts, addListeners() method
// Update the pushNotificationActionPerformed listener:

PushNotifications.addListener(
	'pushNotificationActionPerformed',
	(notification: ActionPerformed) => {
		const data = notification.notification?.data || {};

		// Mark as read if notificationId is present
		if (data.notificationId) {
			import('$lib/stores/notification-center.store').then(({ notificationCenterStore }) => {
				notificationCenterStore.markRead(data.notificationId as string);
			});
		}

		// Navigate
		const targetUrl = data.deepLink || data.clickAction || data.click_action || '/hiring';
		window.location.href = targetUrl;
	}
);
```

### 11.3 Badge Count (REQUIRED)

`@capacitor/badge` sets the red unread count on the app icon. This is purely a native UX enhancement — the in-app bell badge works without it.

Installing:

```bash
npm install @capacitor/badge
npx cap sync
```

Guard with a dynamic import so the app works without the plugin:

```typescript
async function syncBadge(count: number): Promise<void> {
	if (!Capacitor.isNativePlatform()) return;
	try {
		const { Badge } = await import('@capacitor/badge');
		await Badge.set({ count });
	} catch {
		// Badge plugin not installed or not available — skip silently
	}
}
```

Call `syncBadge(count)` whenever `unreadCount` is updated in the store. Also call `syncBadge(0)` on logout/session reset.

### 11.4 Foreground Notification Enhancement

The existing `handleForegroundMessage()` in `push-notification.service.ts` shows a generic toast. Enhance to add the notification to the notification center store:

```typescript
private async handleForegroundMessage(payload: MessagePayload): Promise<void> {
	if (payload.data) {
		// Add to notification center store
		const { notificationCenterStore } = await import('$lib/stores/notification-center.store');
		notificationCenterStore.fetchNotifications(true);

		// Existing toast logic
		appStore.showInfoToast(payload.data.title || 'New notification received');

		// ... rest of existing logic
	}
}
```

---

## 12. Activity Tracking

### 12.1 Activity Tracker Utility

**File:** `src/lib/utils/activity-tracker.ts`

```typescript
import { browser } from '$app/environment';
import { Capacitor } from '@capacitor/core';
import { enrichmentService } from '$lib/api/services/enrichment.service';

let lastPing = 0;
const PING_INTERVAL = 5 * 60 * 1000; // 5 minutes

export function trackActivity(): void {
	if (!browser) return;

	const now = Date.now();
	if (now - lastPing < PING_INTERVAL) return;
	lastPing = now;

	enrichmentService.enrich({ action: 'user_activity' });
}

export function initActivityTracking(): void {
	if (!browser) return;

	// Track on visibility change (app foreground)
	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'visible') {
			trackActivity();
		}
	});

	// Track on Capacitor app resume
	if (Capacitor.isNativePlatform()) {
		import('@capacitor/app').then(({ App }) => {
			App.addListener('appStateChange', ({ isActive }) => {
				if (isActive) trackActivity();
			});
		});
	}
}
```

### 12.2 Route Change Tracking

In `src/routes/(app)/+layout.svelte`, add an `afterNavigate` hook:

```typescript
import { afterNavigate } from '$app/navigation';
import { trackActivity } from '$lib/utils/activity-tracker';

afterNavigate(() => {
	trackActivity();
});
```

---

## 13. Enrichment Calls

### 13.1 When to Call

| Frontend Action            | `action` value     | Required `data`                                                                            | Location                                       |
| -------------------------- | ------------------ | ------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| Escrow funded              | `contract_created` | `estimatedStartTime`, `estimatedCompletionTime`, `amount`, `timelockDuration`, `taskTitle` | Contract lifecycle (after escrow tx confirmed) |
| Task marked complete       | `task_completed`   | (none)                                                                                     | `contractRune.markTaskComplete()`              |
| Dispute raised             | `dispute_raised`   | `timelockDuration`                                                                         | `contractRune.disputeTask()`                   |
| No-show marked             | `no_show_marked`   | `responseDeadline`                                                                         | `contractRune.markNoShow()`                    |
| Work in progress           | `work_in_progress` | (none)                                                                                     | `contractRune.markWorkInProgress()`            |
| Task created with deadline | `task_created`     | `taskDeadline`                                                                             | Task creation wizard submit                    |

### 13.2 Integration Points

The enrichment calls should be **fire-and-forget** and non-blocking. They should be added at the call sites, NOT inside the rune class itself (to avoid coupling the rune to the notification system).

**Pattern:** After each lifecycle method succeeds, call `enrichmentService.enrich()`:

```typescript
// Example: After escrow is funded (in the contract detail page or contract action handler)
import { enrichmentService } from '$lib/api/services/enrichment.service';

async function onEscrowFunded(contract: NDKPaymentContract) {
	// ... existing escrow logic ...

	// Fire enrichment (non-blocking)
	enrichmentService.enrich({
		action: 'contract_created',
		escrowId: contract.paymentId,
		estimatedStartTime: contract.estimatedStartTime,
		estimatedCompletionTime: contract.estimatedCompletionTime,
		amount: contract.amount,
		timelockDuration: contract.timelockDuration,
		taskTitle: contract.taskTitle
	});
}
```

### 13.3 Files to Modify

| File                                                       | Change                                         |
| ---------------------------------------------------------- | ---------------------------------------------- |
| Contract action handlers (where escrow is created)         | Add `enrichmentService.enrich()` after success |
| `contractRune.svelte.ts` → callers of `markTaskComplete()` | Add enrichment after success                   |
| `contractRune.svelte.ts` → callers of `disputeTask()`      | Add enrichment after success                   |
| `contractRune.svelte.ts` → callers of `markNoShow()`       | Add enrichment after success                   |
| Task creation wizard submit handler                        | Add enrichment if deadline is set              |

---

## 14. i18n Requirements

### 14.1 Existing Keys

The `static/locales/en/notifications.json` already has comprehensive keys covering:

- Page title, subtitle, search placeholder
- Notification types (bid, contract, payment, task, message, system, security)
- Time ago strings (just_now, minutes_ago, hours_ago, etc.)
- Priority labels
- Permission banner strings
- Settings strings (in_app, push, email, quiet_hours, etc.)
- Error and success messages
- ARIA labels
- Service messages with role-based variants (tasker/taskee)

### 14.2 Missing Keys to Add

Add these to `static/locales/en/notifications.json`:

```json
{
	"notifications": {
		"filters": {
			"all": "All Notifications",
			"unread": "Unread",
			"contract": "Contracts",
			"bid": "Bids",
			"message": "Messages",
			"payment": "Payments",
			"review": "Reviews"
		},
		"show_all": "Show all"
	}
}
```

Verify: run `python3 scripts/find-missing-translations.py --fix-suggestions` before committing.

### 14.3 Spanish Translations

All new keys must have corresponding `es` translations in `static/locales/es/notifications.json`.

---

## 15. Edge Cases & Error Handling

### 15.1 Empty States

| State                    | UI                                                         |
| ------------------------ | ---------------------------------------------------------- |
| No notifications ever    | Empty state with bell icon + "You're all caught up!"       |
| All read, no unread      | Same empty state for unread filter                         |
| Filter returns 0 results | "No matching notifications" + suggestion to adjust filters |
| Loading first time       | Skeleton loader (3 rows)                                   |
| Loading more             | Spinner at bottom of list                                  |

### 15.2 Error States

| Error                | Handling                                                                      |
| -------------------- | ----------------------------------------------------------------------------- |
| API failure on fetch | Show error banner with retry button. Keep existing data if available.         |
| Mark read fails      | Optimistic update already applied. Revert on failure, show toast.             |
| Delete fails         | Optimistic update already applied. Revert on failure, show toast.             |
| Network offline      | Check `navigator.onLine`. Show offline indicator. Queue mutations for retry.  |
| Token expired        | Axios interceptor handles refresh. Notification requests retry automatically. |

### 15.3 Offline Handling

- On app launch without network: show cached notification count (last known value)
- On notification action while offline: queue the mutation, show optimistic UI
- On network restore: flush queued mutations, refresh full list

### 15.4 Race Conditions

- **Multiple rapid mark-read calls:** Debounce or batch. The optimistic update handles UI immediately; server calls are sequential.
- **Poll arrives while user is marking read:** The poll response may overwrite the optimistic state. Solution: track pending mutations and re-apply them after poll.
- **Store reset on logout:** The `notificationCenterStore.reset()` must be called during auth logout to prevent stale data leaking between sessions.

### 15.5 Platform-Specific

| Platform          | Behavior                                                                                        |
| ----------------- | ----------------------------------------------------------------------------------------------- |
| Web (desktop)     | Bell dropdown in topbar. Full page at `/notifications`.                                         |
| Web (mobile, <lg) | Bell in topbar. Dropdown may be full-width. Full page preferred.                                |
| iOS native        | Bell in topbar. Badge on app icon. Push notification click → deep link.                         |
| Android native    | Bell in topbar. Badge on app icon. Foreground shows local notification. Push click → deep link. |

### 15.6 Capacitor Lifecycle

- **App backgrounded:** Stop notification polling (or slow to 2min). Socket.IO will auto-reconnect.
- **App resumed:** Poll immediately. Sync badge count.
- **App cold start with push click:** The `pushNotificationActionPerformed` handler fires before SvelteKit routing. Use `window.location.href` for reliable navigation (existing pattern).

---

## 16. Accessibility

### 16.1 ARIA

- Bell button: `aria-label="Notifications"`, `aria-expanded="true/false"`, `aria-haspopup="true"`
- Dropdown: `role="dialog"`, `aria-label="Notifications"`
- Notification list: `role="list"`, each card: `role="listitem"`
- Unread dot: `aria-label="unread"`
- Mark all read: `aria-label="Mark all as read"`
- Delete: `aria-label="Remove notification"`

### 16.2 Keyboard Navigation

- Bell: focusable, Enter/Space toggles dropdown
- Dropdown: Tab navigates between notifications, Enter activates, Escape closes
- Notification cards: focusable, Enter clicks
- Delete button: focusable within card, Tab to reach

### 16.3 Focus Management

- When dropdown opens: focus first notification
- When dropdown closes: return focus to bell button
- When notification is activated: focus moves to destination page

### 16.4 Screen Reader

- Announce new notifications: use `aria-live="polite"` on the notification count
- Announce "Marked as read" after successful mark-read
- Announce "Notification deleted" after delete

---

## 17. Testing Strategy

### 17.1 Unit Tests (Vitest)

| Target                           | What to Test                                                           |
| -------------------------------- | ---------------------------------------------------------------------- |
| `notification-center.store.ts`   | State transitions, optimistic updates, filter changes, reset on logout |
| `notification-center.service.ts` | API call formatting, error handling, response parsing                  |
| `notification-icons.ts`          | Category → icon mapping, fallback for unknown categories               |
| `notification-deep-link-map.ts`  | Redirect resolution, pass-through for valid links                      |
| `activity-tracker.ts`            | Debounce behavior, ping interval                                       |
| `timeAgo()` function             | All time ranges (just now, minutes, hours, days, weeks, months)        |

### 17.2 Component Tests (Vitest + @testing-library/svelte)

| Component                       | Test States                                              |
| ------------------------------- | -------------------------------------------------------- |
| `NotificationBell.svelte`       | No unread, has unread (badge), click toggles dropdown    |
| `NotificationDropdown.svelte`   | Loading, empty, populated, mark all read, view all       |
| `NotificationCard.svelte`       | Read, unread, priority borders, click → navigate, delete |
| `NotificationEmptyState.svelte` | Compact, full                                            |
| Notification page               | Loading, empty, populated, filter tabs, load more        |
| Preferences page                | Loading, toggle fields, debounced save                   |

### 17.3 Integration Tests

| Flow                                                              | Test             |
| ----------------------------------------------------------------- | ---------------- |
| Bell → dropdown → click notification → mark read + navigate       | Full happy path  |
| Bell → dropdown → mark all read → count resets                    | Bulk action      |
| Notification arrives via polling → toast shows → click → navigate | Real-time flow   |
| Push notification tap → deep link → mark read                     | Push integration |

### 17.4 E2E Tests (Playwright)

- Login → see bell with count → open dropdown → click notification → navigate to correct page
- Login → receive notification → bell count updates → mark all read → count clears
- Login → settings → notification preferences → toggle → save → reload → persists

---

## 18. Implementation Checklist

> **Note:** This is the original checklist. See [Section 21](#21-updated-implementation-checklist) for the expanded version with all audit findings integrated.

### Phase 1: Foundation

- [ ] Add notification center types to `src/lib/types/notification.d.ts`
- [ ] Add notification center endpoints to `src/lib/api/endpoints.ts`
- [ ] Create `src/lib/api/services/notification-center.service.ts`
- [ ] Create `src/lib/api/services/enrichment.service.ts`
- [ ] Add `updatePreferences()` method to `notification.service.ts`
- [ ] Create `src/lib/stores/notification-center.store.ts`
- [ ] Create `src/lib/utils/notification-icons.ts`
- [ ] Create `src/lib/utils/notification-deep-link-map.ts`

### Phase 2: UI Components

- [ ] Create `NotificationBell.svelte` (replaces disabled `NotificationCenter.svelte`)
- [ ] Create `NotificationDropdown.svelte`
- [ ] Create `NotificationCard.svelte`
- [ ] Create `NotificationEmptyState.svelte`
- [ ] Wire `NotificationBell` into `ProtectedTopBar.svelte` (line 263)
- [ ] Create `/notifications` full page route
- [ ] Initialize store fetch in `(protected)/+layout.svelte`

### Phase 3: Real-Time

- [ ] Create `notification-realtime.service.ts` (polling v1)
- [ ] Add polling lifecycle to `(protected)/+layout.svelte`
- [ ] Implement app lifecycle listeners (background/resume)
- [ ] Integrate foreground notification with notification store
- [ ] (When backend ready) Install `socket.io-client` and switch to WebSocket service

### Phase 4: Push & Badge

- [ ] Install `@capacitor/badge`
- [ ] Add badge sync to store's `fetchUnreadCount()`
- [ ] Enhance push notification click handler with `markRead()`
- [ ] Enhance foreground handler to refresh store

### Phase 5: Preferences

- [ ] Create `/settings/notifications` page
- [ ] Implement master toggles (push, email, in-app)
- [ ] Implement category toggles
- [ ] Implement quiet hours UI (if backend supports)
- [ ] Implement frequency dropdowns (if backend supports)
- [ ] Debounced save logic
- [ ] Add navigation link from settings page

### Phase 6: Enrichment & Activity

- [ ] Create `src/lib/utils/activity-tracker.ts`
- [ ] Add `afterNavigate` activity tracking to app layout
- [ ] Add activity tracking on app foreground
- [ ] Add enrichment calls to contract lifecycle call sites
- [ ] Add enrichment call to task creation with deadline

### Phase 7: i18n & Polish

- [ ] Add missing i18n keys to `en/notifications.json`
- [ ] Add missing i18n keys to `es/notifications.json`
- [ ] Run `python3 scripts/find-missing-translations.py --fix-suggestions`
- [ ] Empty states (no notifications, no unread, filter empty)
- [ ] Loading skeletons
- [ ] Error handling (offline banner, API error toasts)
- [ ] Mobile responsive (dropdown full-width, full page preferred)

### Phase 8: Testing

- [ ] Unit tests for store (state transitions, optimistic updates)
- [ ] Unit tests for service (API formatting)
- [ ] Unit tests for utilities (icons, deep links, timeAgo)
- [ ] Component tests for bell, dropdown, card, empty state
- [ ] Component tests for notification page
- [ ] Component tests for preferences page
- [ ] Run `npm run check` (type validation)
- [ ] Run `npm run lint` (style validation)
- [ ] Run `npm run test:ci` (full suite)
- [ ] Run translation verification

---

## 19. Deep Audit — Gaps & Corrections

A second-pass audit against the actual codebase revealed significant gaps in the original plan. This section documents every finding that must be addressed before or during implementation.

---

### 19.1 Session/Logout Integration — MISSING

**Problem:** The plan mentions `notificationCenterStore.reset()` must be called on logout (Section 15.4) but does not specify WHERE.

**Reality:** `src/lib/utils/session.ts` → `resetAllStores()` is the centralized logout cleanup. It resets `bidStore`, `tasksStore`, `myTasksStore`, `profileStore`, `walletManager`, `user`, and `muteStore`. The notification center store must be added here.

**Fix:** Add to `src/lib/utils/session.ts`:

```typescript
// In resetAllStores():
import { notificationCenterStore } from '$lib/stores/notification-center.store';

// After muteStore.reset():
notificationCenterStore.reset();
```

Also: when resetting, the native badge count must be cleared to 0 (see Section 19.12).

**File to modify:** `src/lib/utils/session.ts` (line ~85)

---

### 19.2 Sentry Breadcrumbs — MISSING ENTIRELY

**Problem:** The CLAUDE.md mandates `Sentry.addBreadcrumb()` for key user actions. The codebase currently has ZERO breadcrumb calls. The plan doesn't mention Sentry at all.

**Fix:** Add breadcrumbs to these notification center operations:

```typescript
import * as Sentry from '@sentry/sveltekit';

// In notification-center.store.ts — after successful markRead:
Sentry.addBreadcrumb({
  category: 'notification',
  level: 'info',
  message: 'Notification marked as read',
  data: { notificationId: id }
});

// After successful markAllRead:
Sentry.addBreadcrumb({
  category: 'notification',
  level: 'info',
  message: 'All notifications marked as read'
});

// After successful deleteNotification:
Sentry.addBreadcrumb({
  category: 'notification',
  level: 'info',
  message: 'Notification deleted',
  data: { notificationId: id }
});

// In notification-realtime.service.ts — when new notifications arrive:
Sentry.addBreadcrumb({
  category: 'notification',
  level: 'info',
  message: 'New notifications received via polling',
  data: { count: currentCount - lastUnreadCount }
});

// In push-notification.service.ts — on push tap:
Sentry.addBreadcrumb({
  category: 'notification',
  level: 'info',
  message: 'Push notification tapped',
  data: { notificationId: data.notificationId, deepLink: data.deepLink }
});
```

**Files to modify:**
- `src/lib/stores/notification-center.store.ts` (markRead, markAllRead, deleteNotification, clearAll)
- `src/lib/api/services/notification-realtime.service.ts` (on new notifications)
- `src/lib/api/services/push-notification.service.ts` (pushNotificationActionPerformed listener)

---

### 19.3 Network Status Integration — INCOMPLETE

**Problem:** Section 15.2 mentions checking `navigator.onLine` but doesn't reference the existing `browserNetworkStatus` store at `src/lib/utils/network-status.ts`.

**Reality:** The project already has a reactive `readable` store:

```typescript
export const browserNetworkStatus = readable<BrowserNetworkStatus>(
  getInitialStatus(), (set) => {
    window.addEventListener('online', applyOnline);
    window.addEventListener('offline', applyOffline);
    return () => { /* cleanup */ };
  }
);
```

**Fix:** Use `browserNetworkStatus` instead of raw `navigator.onLine`:

1. In the polling service — skip polling when offline:
   ```typescript
   import { browserNetworkStatus } from '$lib/utils/network-status';
   import { get } from 'svelte/store';

   const poll = async () => {
     const network = get(browserNetworkStatus);
     if (!network.online) return;
     // ... rest of poll logic
   };
   ```

2. In the notification center store — show offline indicator:
   ```typescript
   // In the store state, add:
   isOffline: boolean;
   ```

3. In `NotificationBell.svelte` — show offline indicator when network is down:
   ```typescript
   import { browserNetworkStatus } from '$lib/utils/network-status';
   let isOffline = $derived(!$browserNetworkStatus.online);
   ```

4. In the full notification page — show offline banner via `appStore.showBanner()` when offline and there are pending mutations.

**Files to modify:**
- `src/lib/api/services/notification-realtime.service.ts`
- `src/lib/stores/notification-center.store.ts`
- `src/lib/components/notifications/NotificationBell.svelte`
- `src/routes/(app)/(protected)/notifications/+page.svelte`

---

### 19.5 Skeleton Components — NOT SPECIFIED

**Problem:** Section 15.1 mentions "Skeleton loader (3 rows)" but provides no implementation. The project has `TaskListSkeleton.svelte` as a reference pattern.

**Fix:** Create `NotificationSkeleton.svelte`:

**File:** `src/lib/components/notifications/NotificationSkeleton.svelte`

```svelte
<script lang="ts">
  let { count = 3, compact = false }: { count?: number; compact?: boolean } = $props();
</script>

<div class="divide-base-200 divide-y">
  {#each Array(count) as _, i (i)}
    <div class="flex items-start gap-3 {compact ? 'px-4 py-2' : 'px-4 py-3'} animate-pulse">
      <div class="skeleton h-5 w-5 shrink-0 rounded-full"></div>
      <div class="min-w-0 flex-1 space-y-2">
        <div class="skeleton h-4 w-3/4 rounded"></div>
        <div class="skeleton h-3 w-full rounded"></div>
        <div class="skeleton h-3 w-1/2 rounded"></div>
      </div>
      <div class="skeleton h-3 w-10 shrink-0 rounded"></div>
    </div>
  {/each}
</div>
```

Use in `NotificationDropdown.svelte` and the full page:

```svelte
{#if loading}
  <NotificationSkeleton count={compact ? 3 : 5} {compact} />
{:else if notifications.length === 0}
  <NotificationEmptyState {compact} />
{:else}
  <!-- ... notification list -->
{/if}
```

---

### 19.6 Settings Navigation — NOT DEFINED

**Problem:** The plan creates `/settings/notifications/+page.svelte` but doesn't explain how users navigate to it.

**Reality:** The settings page (`settings/+page.svelte`) uses accordion sections, not sub-routes. There's no sidebar or tab navigation for settings sub-pages. The page renders components directly: `NostrNsec`, `Devices`, `AccRecovery`, `MutedUsers`, `AccActions`.

**Add notification settings as an accordion section on the existing settings page.**

This matches the existing pattern. Add a new `NotificationSettings.svelte` component in `src/lib/components/settings/` and render it in the settings page:

```svelte
<!-- In settings/+page.svelte, after MutedUsers -->
<NotificationSettings />
```

**Files to modify:**
- `src/routes/(app)/(protected)/settings/+page.svelte` (add component)
- `src/lib/components/settings/NotificationSettings.svelte` (NEW)

---

### 19.7 Dropdown UX — MISSING PORTAL, TRANSITIONS, AND FOCUS TRAP

**Problem:** The plan's `NotificationDropdown.svelte` renders inline in the DOM. The `ProtectedTopBar.svelte` uses a custom `popoverTransition` for dropdowns and `portal` for z-index layering. The notification dropdown should follow the same pattern.

**Reality from `ProtectedTopBar.svelte`:**

```typescript
import { portal } from '$lib/utils/portal';
// Uses custom popoverTransition for smooth enter/exit
// Avatar dropdown is JS-controlled (not DaisyUI) for iOS compatibility
```

**Fixes:**

1. **Use `portal` action** on the dropdown to ensure proper z-index stacking:
   ```svelte
   <div use:portal={'popovers'} class="...">
   ```

2. **Add enter/exit transitions** using the project's existing `popoverTransition` or Svelte's `fly`/`fade`:
   ```svelte
   import { fly, fade } from 'svelte/transition';
   
   {#if showDropdown}
     <div transition:fly={{ y: -10, duration: 150 }} ...>
   {/if}
   ```

3. **Add focus trap** for keyboard accessibility (Section 16.3):
   ```typescript
   // On dropdown open, focus first notification
   $effect(() => {
     if (showDropdown) {
       tick().then(() => {
         const firstCard = dropdownEl?.querySelector('[role="listitem"]');
         if (firstCard instanceof HTMLElement) firstCard.focus();
       });
     }
   });
   ```

4. **Handle Escape key** to close dropdown:
   ```svelte
   function handleKeydown(event: KeyboardEvent) {
     if (event.key === 'Escape') closeDropdown();
   }
   ```

5. **Add `aria-live="polite"` on unread count** (Section 16.4):
   ```svelte
   <span aria-live="polite" class="sr-only">
     {unreadCount} unread notifications
   </span>
   ```

**Files to modify:**
- `src/lib/components/notifications/NotificationBell.svelte`
- `src/lib/components/notifications/NotificationDropdown.svelte`

---

### 19.8 Confirmation Dialog for Destructive Actions — MISSING

**Problem:** The `clearAll()` action in the store immediately clears all notifications without user confirmation. The project has `ConfirmModal.svelte` used extensively in contract actions.

**Fix:** Add confirmation before clearAll in the full notification page:

```svelte
import ConfirmModal from '$lib/components/ConfirmModal.svelte';

let showClearConfirm = $state(false);

function handleClearAll() {
  showClearConfirm = true;
}

async function confirmClearAll() {
  showClearConfirm = false;
  await notificationCenterStore.clearAll();
}
```

```svelte
{#if showClearConfirm}
  <ConfirmModal
    isOpen={true}
    title={$t('notifications.clear_all_confirm_title')}
    message={$t('notifications.clear_all_confirm_message')}
    confirmText={$t('notifications.clear_all')}
    confirmButtonClass="btn-error"
    onConfirm={confirmClearAll}
    onCancel={() => showClearConfirm = false}
  />
{/if}
```

**Files to modify:**
- `src/routes/(app)/(protected)/notifications/+page.svelte`

---

### 19.9 `timeAgo` Function — SHOULD BE A SHARED UTILITY

**Problem:** The plan defines `timeAgo()` inline in `NotificationCard.svelte` (Section 7.4). This function will be needed in other places (notification page stats, potentially other components).

**Fix:** Extract to `src/lib/utils/time-ago.ts`:

```typescript
import { get } from 'svelte/store';
import { t } from 'svelte-i18n';

export function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);
  const diffWeek = Math.floor(diffMs / 604800000);
  const diffMonth = Math.floor(diffMs / 2592000000);

  const $t = get(t);

  if (diffMin < 1) return $t('notifications.just_now');
  if (diffMin < 60) return $t('notifications.minutes_ago', { values: { count: diffMin } });
  if (diffHr < 24) return $t('notifications.hours_ago', { values: { count: diffHr } });
  if (diffDay < 7) return $t('notifications.days_ago', { values: { count: diffDay } });
  if (diffWeek < 4) return $t('notifications.weeks_ago', { values: { count: diffWeek } });
  return $t('notifications.months_ago', { values: { count: diffMonth } });
}
```

**File to create:** `src/lib/utils/time-ago.ts`

---

### 19.10 Missing `group` Class on NotificationCard — BUG

**Problem:** The `NotificationCard.svelte` (Section 7.4) has a delete button with `opacity-0 group-hover:opacity-100` but the parent `<button>` element does not have the `group` class. The hover effect will never trigger.

**Fix:** Add `group` to the parent button's class list:

```svelte
<button
  class="group hover:bg-base-200/50 flex w-full items-start gap-3 px-4 py-3 text-left ..."
>
```

---

### 19.11 Push Notification Click Handler — INCOMPLETE ENHANCEMENT

**Problem:** Section 11.2 enhances the push click handler to call `markRead()` but doesn't fix the navigation. The current handler at `push-notification.service.ts:379` uses `window.location.href` which causes a full page reload. The project's `navigateToUrl()` method (which uses `goto()`) is available but not used.

**Current code (line 379-391):**
```typescript
PushNotifications.addListener(
  'pushNotificationActionPerformed',
  (notification: ActionPerformed) => {
    const data = notification.notification?.data || {};
    const targetUrl = data.clickAction || data.click_action || '/hiring';
    window.location.href = targetUrl;  // ← full reload, bad UX
  }
);
```

**Fix:** Use `navigateToUrl()` and add `markRead`:

```typescript
PushNotifications.addListener(
  'pushNotificationActionPerformed',
  async (notification: ActionPerformed) => {
    const data = notification.notification?.data || {};

    Sentry.addBreadcrumb({
      category: 'notification',
      level: 'info',
      message: 'Push notification tapped',
      data: { notificationId: data.notificationId, deepLink: data.deepLink }
    });

    // Mark as read if notificationId is present
    if (data.notificationId) {
      try {
        const { notificationCenterStore } = await import('$lib/stores/notification-center.store');
        notificationCenterStore.markRead(data.notificationId as string);
      } catch {
        // Non-critical — navigation is more important
      }
    }

    // Navigate using SvelteKit router (not full reload)
    const targetUrl = data.deepLink || data.clickAction || data.click_action || '/hiring';
    this.navigateToUrl(targetUrl);
  }
);
```

**File to modify:** `src/lib/api/services/push-notification.service.ts` (line ~379)

---

### 19.12 Badge Count Sync on Logout — MISSING

**Problem:** When `notificationCenterStore.reset()` is called on logout, the native badge count should be cleared to 0. The plan doesn't address this.

**Fix:** In the store's `reset()` method — use dynamic import so it's a no-op if the plugin isn't installed:

```typescript
reset() {
  set(initialState);
  // Clear native badge on reset (only if @capacitor/badge is installed)
  if (Capacitor.isNativePlatform()) {
    import('@capacitor/badge')
      .then(({ Badge }) => Badge.set({ count: 0 }))
      .catch(() => {}); // plugin not installed — skip
  }
}
```

**File to modify:** `src/lib/stores/notification-center.store.ts`

---

### 19.13 `NotificationBell` Dropdown Interaction with Other Dropdowns — NOT HANDLED

**Problem:** The `ProtectedTopBar.svelte` has an avatar dropdown that is JS-controlled. If the notification dropdown is open and the user clicks the avatar dropdown, both could be open simultaneously.

**Fix:** The `clickOutside` action on `NotificationBell` handles closing when clicking outside. But we should also close the notification dropdown when other topbar elements are interacted with. The simplest approach: the `clickOutside` action already handles this — clicking the avatar button is "outside" the notification bell container, so it will close the notification dropdown. This is already correct.

However, verify that `clickOutside` uses capture phase (it does — `document.addEventListener('click', handleClick, true)`). This is correct.

---

### 19.14 i18n Keys — VERIFIED AGAINST ACTUAL FILE

**Problem:** The plan's Section 14.2 lists "missing keys" but some already exist. Verified against `static/locales/en/notifications.json`:

| Key in Plan | Status in File |
|---|---|
| `notifications.filters.all` | ✅ EXISTS ("All Notifications") |
| `notifications.filters.unread` | ❌ MISSING |
| `notifications.filters.contract` | ❌ MISSING |
| `notifications.filters.bid` | ❌ MISSING |
| `notifications.filters.message` | ❌ MISSING |
| `notifications.filters.payment` | ❌ MISSING |
| `notifications.filters.review` | ❌ MISSING |
| `notifications.show_all` | ✅ EXISTS ("Show all") |
| `notifications.clear_all` | ✅ EXISTS ("Clear all") |
| `notifications.mark_all_read` | ✅ EXISTS ("Mark all as read") |
| `notifications.view_all` | ✅ EXISTS ("View all notifications") |
| `notifications.all_caught_up` | ✅ EXISTS |
| `notifications.just_now` | ✅ EXISTS |
| `notifications.minutes_ago` | ✅ EXISTS |
| `notifications.hours_ago` | ✅ EXISTS |
| `notifications.days_ago` | ✅ EXISTS |
| `notifications.weeks_ago` | ✅ EXISTS |
| `notifications.months_ago` | ✅ EXISTS |
| `notifications.unread` | ✅ EXISTS |
| `notifications.notifications_actions.remove` | ✅ EXISTS |

**Actually missing keys to add:**

```json
{
  "notifications": {
    "filters": {
      "unread": "Unread",
      "contract": "Contracts",
      "bid": "Bids",
      "message": "Messages",
      "payment": "Payments",
      "review": "Reviews"
    },
    "clear_all_confirm_title": "Clear All Notifications",
    "clear_all_confirm_message": "Are you sure you want to clear all notifications? This action cannot be undone.",
    "offline_indicator": "You're offline. Notifications will update when you're back online.",
    "new_notifications_toast": "{count} new notification{{count > 1 ? 's' : ''}}"
  }
}
```

Also: the Spanish file (`es/notifications.json`) has a structural difference at line 173: `"actions"` key name vs `"noactions"` in English. This should be normalized.

**Files to modify:**
- `static/locales/en/notifications.json`
- `static/locales/es/notifications.json`

---

### 19.15 Polling Service — `$effect` vs `onMount` for Lifecycle

**Problem:** Section 10.4 uses `$effect` to start/stop polling based on auth state. But `$effect` runs after every render cycle and could cause multiple starts if auth state is reactive.

**Reality:** The protected layout (`+layout.svelte`) already guards on `$authState.isAuthenticated`. The polling should be started in `onMount` (which only runs once) and stopped on cleanup, not via `$effect`.

**Fix:** Use `onMount` + `onDestroy` pattern in the protected layout:

```typescript
import { onMount, onDestroy } from 'svelte';
import { startNotificationPolling, stopNotificationPolling } from '$lib/api/services/notification-realtime.service';

onMount(() => {
  // ... existing mount logic ...

  // Start notification polling (already inside isAuthenticated guard)
  startNotificationPolling();
});

onDestroy(() => {
  stopNotificationPolling();
});
```

Alternatively, if using `$effect` is preferred for reactivity to auth changes, ensure it has proper guards:

```typescript
let pollingStarted = false;

$effect(() => {
  if (!browser) return;
  if ($authState.isAuthenticated && !pollingStarted) {
    pollingStarted = true;
    startNotificationPolling();
  } else if (!$authState.isAuthenticated && pollingStarted) {
    pollingStarted = false;
    stopNotificationPolling();
  }
});
```

**File to modify:** `src/routes/(app)/(protected)/+layout.svelte`

---

### 19.16 `VITE_API_URL` Environment Variable — NEEDS VERIFICATION

**Problem:** The Socket.IO service (Section 10.3) references `import.meta.env.VITE_API_URL`. Need to verify this exists.

**Action:** Check `.env`, `.env.example`, or `vite.config.ts` for `VITE_API_URL`. The `BaseApiService` in `apiService.ts` also uses it (via constructor), so it should exist. But verify before implementation.

---

### 19.17 Enrichment Service — `console.warn` Instead of Sentry

**Problem:** The enrichment service (Section 5.3) uses `console.warn` for error handling. The CLAUDE.md says "Silent failures are bugs" and errors should be surfaced via Sentry.

**Fix:**

```typescript
import * as Sentry from '@sentry/sveltekit';

async enrich(data: EnrichmentRequest): Promise<void> {
  try {
    await this.post(ENDPOINTS.REMINDERS.ENRICH, data);
  } catch (error) {
    Sentry.captureException(error, {
      tags: { feature: 'notification-enrichment' },
      extra: { action: data.action }
    });
  }
}
```

---

### 19.18 Notification Card — Missing `timeAgo` Reactivity

**Problem:** The `timeAgo` function in `NotificationCard.svelte` is called once when the component renders. If the user leaves the dropdown open, the relative times become stale (e.g., "1m ago" stays "1m ago" even after 5 minutes).

**Fix:** Use `$effect` with an interval to update the display:

```typescript
let displayTime = $state(timeAgo(notification.createdAt));

$effect(() => {
  const interval = setInterval(() => {
    displayTime = timeAgo(notification.createdAt);
  }, 60_000); // Update every minute

  return () => clearInterval(interval);
});
```

---

### 19.19 Missing Error Boundary Routes

**Problem:** The plan creates new routes (`/notifications`, `/settings/notifications`) but doesn't create `+error.svelte` files for them. SvelteKit needs error boundaries.

**Fix:** The routes inherit from `(protected)/+layout.svelte` which inherits from `(app)/+layout.svelte`. If these layouts have error boundaries, the child routes inherit them. Verify this is the case. If not, add `+error.svelte` to the notification routes.

---

### 19.20 `notificationCenterStore` — Missing `isOffline` and `pendingMutations` State

**Problem:** Section 15.3 mentions queuing mutations for retry when offline, but the store doesn't have the state to support this.

**Fix:** Extend the store state:

```typescript
interface NotificationCenterState {
  // ... existing fields ...
  isOffline: boolean;
  pendingMutations: Array<{
    id: string;
    type: 'markRead' | 'markAllRead' | 'delete' | 'clearAll';
    payload?: string; // notificationId for markRead/delete
    timestamp: number;
  }>;
}
```

Add mutation queue logic:

```typescript
async markRead(id: string) {
  const network = get(browserNetworkStatus);
  if (!network.online) {
    // Queue for later
    update((s) => ({
      ...s,
      pendingMutations: [...s.pendingMutations, { id: crypto.randomUUID(), type: 'markRead', payload: id, timestamp: Date.now() }],
      // Still apply optimistic update
      notifications: s.notifications.map((n) =>
        n.id === id ? { ...n, isRead: true, readAt: new Date().toISOString() } : n
      ),
      unreadCount: Math.max(0, s.unreadCount - 1)
    }));
    return;
  }
  // ... existing online logic
},

async flushPendingMutations() {
  const state = get({ subscribe });
  const pending = state.pendingMutations;
  if (pending.length === 0) return;

  for (const mutation of pending) {
    try {
      switch (mutation.type) {
        case 'markRead':
          if (mutation.payload) await notificationCenterService.markRead(mutation.payload);
          break;
        case 'markAllRead':
          await notificationCenterService.markAllRead();
          break;
        case 'delete':
          if (mutation.payload) await notificationCenterService.deleteOne(mutation.payload);
          break;
        case 'clearAll':
          await notificationCenterService.deleteMany();
          break;
      }
    } catch {
      // Keep failed mutations in queue
      continue;
    }
  }

  // Clear successful mutations and refresh
  update((s) => ({ ...s, pendingMutations: [] }));
  await this.refresh();
}
```

Then in the polling service or network status listener, call `flushPendingMutations()` when the network comes back online.

---

### 19.21 `NotificationCard` — Delete Button Visibility on Mobile

**Problem:** The delete button uses `opacity-0 group-hover:opacity-100` which doesn't work on touch devices (no hover). Mobile users can't delete notifications.

**Fix:** Add a swipe-to-delete gesture on mobile:

```svelte
<button
  class="btn btn-ghost btn-xs shrink-0 self-center
    opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
  onclick={handleDelete}
  aria-label={$t('notifications.notifications_actions.remove')}
>
  <IconDelete class="text-base-content/40 h-3.5 w-3.5" />
</button>
```

---

### 19.22 Missing `NotificationPermissionBanner` Integration Check

**Problem:** The existing `NotificationPermissionBanner.svelte` shows when `permissionStatus === 'prompt'`. After the user enables notifications, the banner should dismiss. The plan doesn't mention verifying this flow works with the new notification center.

**Action:** Verify that `NotificationPermissionBanner.svelte` properly dismisses after permission is granted. Read the component — it checks `pushNotificationService.checkPermissionStatus()` on mount and hides when status is not `'prompt'`. This should work correctly.

---

### 19.23 Missing `notificationId` in Push Payload

**Problem:** The plan assumes the push notification payload includes `data.notificationId` for marking as read. The backend must include this field in the push payload. If it doesn't, the `markRead` on push tap will fail silently.

**Action:** Verify with the backend team that push payloads include:
```json
{
  "data": {
    "notificationId": "uuid-here",
    "deepLink": "/hiring/my-tasks",
    "category": "bid",
    "type": "new_bid_received"
  }
}
```

If the backend doesn't include `notificationId`, the `markRead` call should be skipped gracefully (which the plan already handles with the `if (data.notificationId)` check).

---

### 19.24 Missing `@capacitor/badge` Platform Permissions

**Problem:** `@capacitor/badge` requires additional setup on iOS. The plan only mentions `npm install` and `npx cap sync`.

**Additional iOS setup required:**

1. In `ios/App/App/Info.plist`, add:
   ```xml
   <key>UIBackgroundModes</key>
   <array>
     <string>remote-notification</string>
   </array>
   ```

2. The badge plugin requires notification permission to be granted first (which the existing `NotificationPermissionBanner` handles).

**Action:** Document the iOS-specific setup in the implementation checklist.

---

### 19.25 Missing `NotificationCard` — Keyboard Navigation

**Problem:** Section 16.2 says "Notification cards: focusable, Enter clicks" but the `NotificationCard` uses `<button>` which is naturally focusable. However, the delete button inside needs proper `tabindex` management.

**Fix:** Ensure the card is a single tab stop and the delete button is reachable via Tab:

```svelte
<button
  class="group ..."
  onclick={handleClick}
  role="listitem"
  aria-label={notification.title}
  tabindex={0}
>
  <!-- content -->
  <button
    class="btn btn-ghost btn-xs ..."
    onclick={handleDelete}
    aria-label={$t('notifications.notifications_actions.remove')}
    tabindex={0}
  >
```

The inner button is already a separate `<button>` so it's a separate tab stop. This is correct — Tab goes: Card → Delete button → Next card.

---

### 19.26 Missing `NotificationDropdown` — Click Outside on Touch Devices

**Problem:** The `clickOutside` action uses `document.addEventListener('click', handleClick, true)` with capture phase. On touch devices, this may conflict with the 300ms tap delay or touch event handling.

**Action:** Verify that `clickOutside` works correctly on iOS/Android. The existing `ProtectedTopBar.svelte` already uses it for the avatar dropdown, so it should be tested and working. No change needed, but test during implementation.

---

### 19.27 Missing `NotificationCard` — Long Press on Mobile

**Problem:** No long-press context menu for notification cards on mobile. Consider adding a context menu with "Mark as read", "Delete", "View" options.

**Action:** This is a nice-to-have for v2. Not blocking for v1.

---

### 19.28 Store — Missing `fetchUnreadCount` Debounce

**Problem:** The polling service calls `fetchUnreadCount()` every 30 seconds. If the user is also interacting with notifications (marking as read), the `fetchUnreadCount` call may overwrite the optimistic count.

**Fix:** Add a minimum interval between `fetchUnreadCount` calls:

```typescript
let lastFetchUnreadCountTime = 0;
const MIN_FETCH_INTERVAL = 5_000; // 5 seconds

async fetchUnreadCount() {
  const now = Date.now();
  if (now - lastFetchUnreadCountTime < MIN_FETCH_INTERVAL) return;
  lastFetchUnreadCountTime = now;

  try {
    const count = await notificationCenterService.getUnreadCount();
    update((s) => ({ ...s, unreadCount: count }));
  } catch {
    // Silent fail
  }
}
```

---

### 19.29 Missing `NotificationCard` — Sender Avatar

**Problem:** The plan's `NotificationCard` shows a category icon but no sender avatar. For message and bid notifications, showing the sender's profile picture would improve UX.

**Action:** This is a nice-to-have for v2. The `NotificationData` interface has `senderNpub` which could be used to fetch the sender's profile picture from the existing profile cache. Not blocking for v1.

---

### 19.30 Missing `NotificationCard` — Swipe Actions (Mobile)

**Problem:** Mobile users expect swipe-to-delete or swipe-to-mark-as-read on notification cards. The current plan only has a hover-reveal delete button.

**Action:** This is a nice-to-have for v2. Consider using a touch gesture library or implementing a simple swipe handler. Not blocking for v1.

---

## 20. Updated File Layout

Based on the deep audit, the complete file layout is:

```
src/lib/
├── types/
│   └── notification.d.ts                    # ENHANCE — add NotificationCenter types (Section 4)
├── api/
│   ├── endpoints.ts                         # ENHANCE — add NOTIFICATION_CENTER + REMINDERS (Section 5.1)
│   └── services/
│       ├── notification.service.ts          # ENHANCE — add updatePreferences() (Section 8)
│       ├── notification-center.service.ts   # NEW — REST CRUD (Section 5.2)
│       ├── notification-realtime.service.ts # NEW — polling v1 (Section 10.2)
│       └── enrichment.service.ts            # NEW — fire-and-forget enrichment (Section 5.3)
├── stores/
│   └── notification-center.store.ts         # NEW — writable store (Section 6)
├── components/
│   ├── notifications/
│   │   ├── NotificationCenter.svelte        # REWRITE — replace disabled placeholder
│   │   ├── NotificationBell.svelte          # NEW (Section 7.2)
│   │   ├── NotificationDropdown.svelte      # NEW (Section 7.3)
│   │   ├── NotificationCard.svelte          # NEW (Section 7.4)
│   │   ├── NotificationEmptyState.svelte    # NEW (Section 7.5)
│   │   ├── NotificationSkeleton.svelte      # NEW (Section 19.5)
│   │   └── NotificationPermissionBanner.svelte # EXISTING — no changes
│   └── settings/
│       └── NotificationSettings.svelte      # NEW (Section 19.6)
├── utils/
│   ├── notification-icons.ts                # NEW (Section 7.1)
│   ├── notification-deep-link-map.ts        # NEW (Section 9.3)
│   ├── time-ago.ts                          # NEW (Section 19.9)
│   └── activity-tracker.ts                  # NEW (Section 12.1)
└── runes/
    └── notificationRune.svelte.ts           # NEW (optional — if rune pattern preferred)

src/routes/(app)/(protected)/
├── notifications/
│   └── +page.svelte                         # NEW — full notification list page (Section 7.6)
└── settings/
    └── +page.svelte                         # ENHANCE — add NotificationSettings component (Section 19.6)
```

**Files to modify (existing):**

| File | Change |
|------|--------|
| `src/lib/types/notification.d.ts` | Add NotificationCenter types |
| `src/lib/api/endpoints.ts` | Add NOTIFICATION_CENTER + REMINDERS blocks |
| `src/lib/api/services/notification.service.ts` | Add `updatePreferences()` method |
| `src/lib/api/services/push-notification.service.ts` | Enhance click handler (Section 19.11), add Sentry breadcrumbs |
| `src/lib/components/topbar/ProtectedTopBar.svelte` | Replace NotificationCenter import with NotificationBell |
| `src/lib/components/notifications/NotificationCenter.svelte` | Rewrite or delete (replaced by NotificationBell) |
| `src/routes/(app)/(protected)/+layout.svelte` | Add store init + polling lifecycle |
| `src/routes/(app)/(protected)/settings/+page.svelte` | Add NotificationSettings component |
| `src/lib/utils/session.ts` | Add notificationCenterStore.reset() to resetAllStores() |
| `static/locales/en/notifications.json` | Add missing filter keys + confirmation strings |
| `static/locales/es/notifications.json` | Add corresponding Spanish translations |

---

## 21. Updated Implementation Checklist

### Phase 1: Foundation

- [ ] Add notification center types to `src/lib/types/notification.d.ts`
- [ ] Add notification center endpoints to `src/lib/api/endpoints.ts`
- [ ] Create `src/lib/api/services/notification-center.service.ts`
- [ ] Create `src/lib/api/services/enrichment.service.ts` (use Sentry for error reporting)
- [ ] Add `updatePreferences()` method to `notification.service.ts`
- [ ] Create `src/lib/stores/notification-center.store.ts` (with offline queue, badge sync, Sentry breadcrumbs)
- [ ] Create `src/lib/utils/notification-icons.ts`
- [ ] Create `src/lib/utils/notification-deep-link-map.ts`
- [ ] Create `src/lib/utils/time-ago.ts`
- [ ] Add `notificationCenterStore.reset()` to `src/lib/utils/session.ts`
- [ ] Add missing i18n keys to `en/notifications.json` and `es/notifications.json`

### Phase 2: UI Components

- [ ] Create `NotificationBell.svelte` (with `aria-live`, offline indicator, portal)
- [ ] Create `NotificationDropdown.svelte` (with portal, transitions, focus trap, skeleton)
- [ ] Create `NotificationCard.svelte` (with `group` class, mobile delete, `timeAgo` reactivity)
- [ ] Create `NotificationEmptyState.svelte`
- [ ] Create `NotificationSkeleton.svelte`
- [ ] Wire `NotificationBell` into `ProtectedTopBar.svelte`
- [ ] Create `/notifications` full page route (with `ConfirmModal` for clear all, offline banner)
- [ ] Initialize store fetch in `(protected)/+layout.svelte`
- [ ] Delete or replace disabled `NotificationCenter.svelte`

### Phase 3: Real-Time

- [ ] Create `notification-realtime.service.ts` (polling v1, with `browserNetworkStatus` check)
- [ ] Add polling lifecycle to `(protected)/+layout.svelte` (proper `$effect` guards)
- [ ] Implement app lifecycle listeners (background/resume)
- [ ] Integrate foreground notification with notification store
- [ ] Add Sentry breadcrumbs for new notification events
- [ ] (When backend ready) Install `socket.io-client` and switch to WebSocket service

### Phase 4: Push Integration

- [ ] Enhance push notification click handler with `markRead()` + `navigateToUrl()` (not `window.location.href`)
- [ ] Enhance foreground handler to refresh store
- [ ] Add Sentry breadcrumbs for push tap events
- [ ] (Optional) Install `@capacitor/badge` for app icon badge count
  - [ ] iOS `Info.plist` setup (`UIBackgroundModes`)
  - [ ] Badge sync in store's `fetchUnreadCount()` (dynamic import, no-op if missing)
  - [ ] Badge clear on logout in store's `reset()`

### Phase 5: Preferences

- [ ] Create `NotificationSettings.svelte` component (accordion section, not separate route)
- [ ] Add to existing settings page (`settings/+page.svelte`)
- [ ] Implement master toggles (push, email, in-app)
- [ ] Implement category toggles
- [ ] Implement quiet hours UI (if backend supports)
- [ ] Implement frequency dropdowns (if backend supports)
- [ ] Debounced save logic

### Phase 6: Enrichment & Activity

- [ ] Create `src/lib/utils/activity-tracker.ts`
- [ ] Add `afterNavigate` activity tracking to app layout
- [ ] Add activity tracking on app foreground
- [ ] Add enrichment calls to contract lifecycle call sites (in `ContractActionsNDK.svelte`, `ContractActionsCardNDK.svelte`, `ContractActionsDrawerNDK.svelte`)
- [ ] Add enrichment call to task creation with deadline (`create-task/+page.svelte`)

### Phase 7: i18n & Polish

- [ ] Add missing i18n keys to `en/notifications.json`
- [ ] Add missing i18n keys to `es/notifications.json`
- [ ] Run `python3 scripts/find-missing-translations.py --fix-suggestions`
- [ ] Normalize `noactions`/`actions` key difference between en/es
- [ ] Empty states (no notifications, no unread, filter empty)
- [ ] Skeleton loaders (NotificationSkeleton component)
- [ ] Error handling (offline banner via `browserNetworkStatus`, API error toasts)
- [ ] Mobile responsive (dropdown full-width, delete button always visible on touch)
- [ ] Add Sentry breadcrumbs to all store mutations

### Phase 8: Testing

- [ ] Unit tests for store (state transitions, optimistic updates, offline queue, flush)
- [ ] Unit tests for service (API formatting, error handling)
- [ ] Unit tests for utilities (icons, deep links, timeAgo)
- [ ] Component tests for bell, dropdown, card, empty state, skeleton
- [ ] Component tests for notification page (with `ConfirmModal` flow)
- [ ] Component tests for notification settings
- [ ] Integration tests: bell → dropdown → click → mark read + navigate
- [ ] Integration tests: offline → queue mutation → online → flush
- [ ] Integration tests: push tap → mark read + navigate
- [ ] Run `npm run check` (type validation)
- [ ] Run `npm run lint` (style validation)
- [ ] Run `npm run test:ci` (full suite)
- [ ] Run translation verification

### Dependencies to Install

```bash
# Optional — app icon badge count on native (skip if not needed)
# npm install @capacitor/badge
# npx cap sync

# Deferred — when backend Socket.IO gateway is ready
# npm install socket.io-client
```

No new dependencies are required for the core notification center. The polling approach uses existing infrastructure.

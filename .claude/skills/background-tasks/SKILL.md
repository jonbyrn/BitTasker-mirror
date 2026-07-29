---
name: background-tasks
description: 'Use when implementing polling, sync, notifications, periodic data refresh, or any logic that runs while the app is backgrounded or a component is unmounted. Examples: polling wallet balance, syncing tasks, scheduled reminders, background fetch, offline queues.'
---

# Background Tasks — BitTasker

This is a Capacitor cross-platform app (iOS, Android, PWA). Background operations must handle component unmounts, app lifecycle (pause/resume), and offline/mobile constraints. Leaked intervals, polling while backgrounded, and uncoordinated polling cause battery drain, API waste, and data inconsistencies.

## Component Lifecycle: `$effect` Cleanup

Every `$effect` that sets up subscriptions, intervals, or timeouts MUST return a cleanup function. Svelte 5 calls this function when the component unmounts, the effect re-runs, or the component is destroyed.

```svelte
<script>
	let data = $state(null);

	$effect(() => {
		const interval = setInterval(fetchData, 30000);

		return () => clearInterval(interval);
	});
</script>
```

The same pattern applies to NDK subscriptions, store subscriptions, event listeners, and any async loop.

## App Lifecycle (Capacitor)

Use `App.addListener('pause')` and `App.addListener('resume')` from `@capacitor/app` to manage polling. The app may be backgrounded for hours — polling while paused drains battery and wastes API resources.

```typescript
import { App } from '@capacitor/app';

let interval: ReturnType<typeof setInterval> | null = null;

App.addListener('pause', () => {
	if (interval) {
		clearInterval(interval);
		interval = null;
	}
});

App.addListener('resume', () => {
	startPolling();
});

function startPolling() {
	if (interval) return;
	fetchData();
	interval = setInterval(fetchData, 30000);
}
```

Clean up listeners when the service is torn down (on app destroy or during testing).

## Service Workers

For PWA/web targets, the service worker handles push notifications and background sync.

- Register the service worker in the app entry point (e.g., `src/service-worker.ts` or `vite.config.ts` via `@sveltejs/adapter-static`)
- This project uses **Firebase for push notifications** — the service worker must handle the `firebase-messaging-sw.js` setup and the `onBackgroundMessage` event
- For custom background sync: `navigator.serviceWorker.ready.then(reg => reg.periodicSync.register('sync-tasks', { minInterval: 3600000 }))`. The browser decides when to fire — not guaranteed
- The SW `sync` event is the hook for flushing offline queues when connectivity returns

## Notification Scheduling

Use **Capacitor Local Notifications** plugin (`@capacitor/local-notifications`) for scheduled reminders (e.g., task due soon).

- Schedule notifications on `App.addListener('pause')` when the app can no longer show in-app alerts
- Cancel notifications on `App.addListener('resume')` if they are no longer relevant (user already acted)
- Always check and request notification permissions before scheduling

```typescript
import { LocalNotifications } from '@capacitor/local-notifications';

await LocalNotifications.requestPermissions();
await LocalNotifications.schedule({
	notifications: [{
		id: 1,
		title: 'Task Due Soon',
		body: 'Review contract expires in 1 hour',
		schedule: { at: new Date(Date.now() + 1000 * 60 * 60) }
	}]
});
```

## Background Fetch

Use `@capacitor/background-task` plugin OR a standard `fetch` with a timeout. The Capacitor plugin is preferred on native platforms; fall back to timeout-guarded `fetch` on web.

```typescript
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 10000);

try {
	const response = await fetch(url, { signal: controller.signal });
	const data = await response.json();
} catch (err) {
	if (err.name === 'AbortError') {
		console.warn('Background fetch timed out');
	}
} finally {
	clearTimeout(timeout);
}
```

**Retry with exponential backoff**: on network errors, retry after 1s, 2s, 4s, 8s (capped at 30s). Do not retry on 4xx responses.

## Network-Aware Scheduling

Use the shared `browserNetworkStatus` store from `src/lib/utils/network-status.ts`:

- **Only poll/sync when online** — subscribe to `browserNetworkStatus` and skip operations when `online: false`
- **Queue operations when offline** — write pending mutations/sync tasks to a queue (localStorage or Preferences)
- **Flush queue when back online** — listen for `'online'` transitions via the store and process the queue
- **Fail closed**: network-dependent actions (quote creation, contract actions) must check network status first

## Data Freshness (TTL-Based Polling)

Use a timestamp-based approach. Store `lastFetched` in state or a store. Only refetch if data is older than its TTL.

| Data Type          | TTL      |
| ------------------ | -------- |
| Wallet balance     | 30s      |
| Task list          | 60s      |
| User profile       | 5 min    |
| Nostr event feed   | 30s      |
| Exchange rates     | 10 min   |

```typescript
let lastFetched = 0;
let data = $state(null);

async function getData(ttl = 30000) {
	if (Date.now() - lastFetched < ttl) return data;
	const result = await fetchData();
	lastFetched = Date.now();
	data = result;
	return data;
}
```

## Single-Writer Principle

**ONE module writes to each store.** Multiple components must not independently poll the same data source. Use a shared service that:

- Owns the polling interval (one interval per data domain)
- Owns the `lastFetched` timestamp
- Is the sole writer to the corresponding store
- Exposes a subscribe/read interface for components

Components read from the store; the service handles the polling lifecycle. This prevents race conditions and duplicate API calls.

## Error Handling

Background tasks must handle errors silently — routine failures should not surface toasts.

- **Silent fallback**: use `tryCatch()` from `src/lib/utils/tryCatch.ts` to capture errors without throwing
- **Log to Sentry**: use `Sentry.addBreadcrumb()` for diagnostic context and `Sentry.captureException()` for unexpected failures
- **Never swallow errors without logging** — empty catch blocks hide bugs in production
- **Retry with backoff** for transient failures (network, timeouts); do not retry on 4xx

## Anti-Patterns

| Anti-Pattern                                                   | Correct Approach                                             |
| -------------------------------------------------------------- | ------------------------------------------------------------ |
| `setInterval` without cleanup (leaks after unmount)            | Return cleanup function from `$effect`                       |
| Polling in every component (duplicate requests, race condition) | Use a shared service with single-writer pattern              |
| Polling while app is paused (battery drain)                    | Stop polling on `App.addListener('pause')`                   |
| Starting new poll before previous completes (race condition)   | Use a guard flag or abort previous request                   |
| Ignoring network status (polling while offline)                | Subscribe to `browserNetworkStatus` and skip when offline    |
| Empty catch block logging nothing                              | Log to Sentry; use `tryCatch()` for structured error capture |
| Background fetch without timeout                               | Use `AbortController` with timeout or Capacitor plugin       |

---
name: capacitor-plugin-guards
description: 'Cross-platform guard patterns for Capacitor apps. Use for platform detection, plugin availability checks, browser guards, network checks, app lifecycle, and defensive plugin call patterns. The capacitor-testing skill covers testing — this skill covers implementation guard patterns.'
---

# Capacitor Plugin Guards (Implementation Patterns)

BitTasker runs on iOS, Android, and web (PWA). Native lacks browser APIs — every plugin call, DOM access, and browser-only API must be guarded. This skill covers the guard patterns; see `capacitor-testing` for how to mock them in tests.

## Platform Detection

```typescript
import { Capacitor } from '@capacitor/core';

const platform = Capacitor.getPlatform(); // 'ios' | 'android' | 'web'
const isNative = Capacitor.isNativePlatform(); // true on iOS/Android, false on web
```

- `getPlatform()` returns immediately (synchronous).
- `isNativePlatform()` returns immediately (synchronous).
- Use these for feature-gating native-only UI or behavior.

## Plugin Availability

```typescript
const available = await Capacitor.isPluginAvailable('PluginName');
```

- `isPluginAvailable()` returns a **promise** — always `await` it.
- A plugin may be installed but unavailable (e.g. missing native permissions, unsupported platform).
- Never assume a plugin is available just because it's in `package.json`.

## Browser Guards

```typescript
import { browser } from '$app/environment';
```

SvelteKit may render server-side even in a Capacitor client-only app. Wrap ALL of these in `if (browser)`:

| Resource | Reason |
|---|---|
| `document.*`, `window.*` | SSR has no DOM |
| `localStorage`, `sessionStorage` | SSR has no storage |
| `svelte-i18n` (`$t()`, locale init) | May touch `navigator.language` or `document` |
| `navigator.*` (non-Capacitor APIs) | SSR has no `navigator` |
| Any DOM manipulation or `addEventListener` | SSR has no DOM |

```typescript
import { browser } from '$app/environment';

let storedValue: string | null = null;
if (browser) {
	storedValue = localStorage.getItem('myKey');
}
```

The `browser` export from `$app/environment` is a **compile-time constant** — tree-shaken by the bundler. No runtime cost.

## Network Checks

```typescript
import { browserNetworkStatus } from '$lib/utils/network-status';
```

`browserNetworkStatus` is a Svelte readable store with shape:

```typescript
interface BrowserNetworkStatus {
	online: boolean;
	lastTransition: 'initial' | 'online' | 'offline';
}
```

- Subscribe to reactively show offline UI / disable actions.
- Check `online` before initiating network operations (fetch, Nostr relay publish, payment).
- The store fails closed: defaults to `online: true` but `lastTransition: 'initial'` when not yet determined.
- Always wrap in `if (browser)` if using `navigator.onLine` directly — the store handles this internally.

```typescript
// Component usage
import { browserNetworkStatus } from '$lib/utils/network-status';

let isOnline = $state(true);
$effect(() => {
	const unsub = browserNetworkStatus.subscribe((status) => {
		isOnline = status.online;
	});
	return unsub;
});

// Guard before network operations
async function submitData() {
	let status: BrowserNetworkStatus = { online: true, lastTransition: 'initial' };
	const unsub = browserNetworkStatus.subscribe(s => status = s);
	unsub();

	if (!status.online) {
		// Show offline message, queue for later
		return;
	}
	// Proceed with network call
}
```

## App Lifecycle

```typescript
import { App } from '@capacitor/app';
```

Handle background/foreground transitions:

```typescript
if (Capacitor.isNativePlatform()) {
	App.addListener('pause', () => {
		// Pause subscriptions, polling, animations
		// Stop NDK relay connections
	});

	App.addListener('resume', () => {
		// Resume subscriptions, refresh stale data
		// Reconnect NDK relays
	});
}
```

- **Pause**: stop polling intervals, NDK subscriptions, WebSocket connections, animations.
- **Resume**: refresh data, reconnect relays, re-check network status.
- These events fire **only on native platforms** — no-op on web.

## Deep Link Validation

```typescript
import { App } from '@capacitor/app';

App.addListener('appUrlOpen', (data) => {
	const url = new URL(data.url);
	// VALIDATE the URL before routing
	if (!isValidDeepLink(url)) {
		// Log warning, do NOT navigate
		return;
	}
	// Safe to route
});
```

- Never navigate to an unvalidated deep link path.
- Validate scheme, host, and path against a known allowlist.
- Consider `src/lib/utils/deep-link.ts` for shared validation logic.

## Defensive Plugin Call Pattern

Every Capacitor plugin call must follow this pattern:

```typescript
async function useNativeFeature() {
	if (Capacitor.isNativePlatform()) {
		if (await Capacitor.isPluginAvailable('PluginName')) {
			try {
				const result = await PluginName.method();
				// Use result
			} catch (error) {
				// Handle runtime failures (permission denied, cancelled, etc.)
			}
		} else {
			// Plugin not available — provide fallback or inform user
		}
	} else {
		// Running on web — use web API fallback or skip gracefully
	}
}
```

## Platform-Specific API Guards

### Camera (`@capacitor/camera`)

```typescript
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';

async function takePhoto() {
	if (!Capacitor.isNativePlatform()) {
		// Web: use <input type="file" accept="image/*" capture="environment">
		return;
	}
	if (!(await Capacitor.isPluginAvailable('Camera'))) return;

	try {
		const photo = await Camera.getPhoto({
			resultType: CameraResultType.DataUrl,
			source: CameraSource.Camera,
		});
	} catch (error) {
		// Permission denied or user cancelled
	}
}
```

### Clipboard (`@capacitor/clipboard`)

```typescript
import { Clipboard } from '@capacitor/clipboard';

async function copyToClipboard(text: string) {
	if (Capacitor.isNativePlatform() && (await Capacitor.isPluginAvailable('Clipboard'))) {
		await Clipboard.write({ string: text });
	} else if (browser && navigator.clipboard) {
		await navigator.clipboard.writeText(text);
	}
}
```

### Geolocation (`@capacitor/geolocation`)

```typescript
import { Geolocation } from '@capacitor/geolocation';

async function getLocation() {
	if (!Capacitor.isNativePlatform()) {
		// Web: navigator.geolocation with fallback
		if (browser && 'geolocation' in navigator) {
			return new Promise((resolve, reject) => {
				navigator.geolocation.getCurrentPosition(resolve, reject);
			});
		}
		return null;
	}

	if (!(await Capacitor.isPluginAvailable('Geolocation'))) return null;

	try {
		const position = await Geolocation.getCurrentPosition();
		return position.coords;
	} catch (error) {
		// Permission denied or timeout
		return null;
	}
}
```

### Push Notifications (`@capacitor/push-notifications` + Firebase)

```typescript
import { PushNotifications } from '@capacitor/push-notifications';

async function registerPush() {
	if (!Capacitor.isNativePlatform()) return; // Web: use service worker push

	if (!(await Capacitor.isPluginAvailable('PushNotifications'))) return;

	try {
		const permStatus = await PushNotifications.checkPermissions();
		if (permStatus.receive !== 'granted') {
			const request = await PushNotifications.requestPermissions();
			if (request.receive !== 'granted') return;
		}
		await PushNotifications.register();
	} catch (error) {
		// Registration failed
	}
}
```

### Status Bar (`@capacitor/status-bar`)

```typescript
import { StatusBar, Style } from '@capacitor/status-bar';

async function setStatusBar() {
	// Native only — no web equivalent
	if (!Capacitor.isNativePlatform()) return;
	if (!(await Capacitor.isPluginAvailable('StatusBar'))) return;

	await StatusBar.setStyle({ style: Style.Dark });
}
```

### Splash Screen (`@capacitor/splash-screen`)

```typescript
import { SplashScreen } from '@capacitor/splash-screen';

async function hideSplash() {
	if (Capacitor.isNativePlatform() && (await Capacitor.isPluginAvailable('SplashScreen'))) {
		await SplashScreen.hide();
	}
}
```

## Anti-Patterns

| Anti-pattern | Why it fails | Correct approach |
|---|---|---|
| Calling Capacitor plugin without platform guard | Crashes on web (plugin not defined) | `if (Capacitor.isNativePlatform())` first |
| `window.something` / `document.querySelector` without `if (browser)` | Crashes during SSR | `import { browser }` — wrap all DOM access |
| Assuming plugin is always available | Plugin may be missing on some platforms | Always `await Capacitor.isPluginAvailable()` |
| Not handling permission denial | User says no → unhandled rejection | Wrap in try/catch, provide fallback |
| `localStorage.getItem()` without `if (browser)` | Crashes during SSR | Guard with `if (browser)` |
| Direct `navigator.onLine` in component | Not reactive, may be undefined in SSR | Use `browserNetworkStatus` store |
| Navigating to unvalidated deep link URL | Security risk — arbitrary navigation | Validate scheme/host/path before routing |

## Testing

Use `src/lib/mocks/` for Capacitor plugin mocks in Vitest:

```typescript
// Mock platform
import { vi } from 'vitest';
vi.mock('@capacitor/core', () => ({
	Capacitor: {
		isNativePlatform: vi.fn(() => true),
		getPlatform: vi.fn(() => 'ios'),
		isPluginAvailable: vi.fn(() => true),
	},
}));

// Mock browser environment
vi.mock('$app/environment', () => ({
	browser: true,
}));
```

See `capacitor-testing` skill for full testing patterns.

## Quick Reference

| Guard | Import | Check |
|---|---|---|
| Platform detection | `@capacitor/core` | `Capacitor.getPlatform()`, `Capacitor.isNativePlatform()` |
| Plugin available | `@capacitor/core` | `await Capacitor.isPluginAvailable('Name')` |
| Browser/SSR guard | `$app/environment` | `if (browser)` |
| Network online | `$lib/utils/network-status` | `browserNetworkStatus.subscribe(...)` |
| App pause/resume | `@capacitor/app` | `App.addListener('pause'|'resume', ...)` |
| Deep link open | `@capacitor/app` | `App.addListener('appUrlOpen', ...)` |
| Camera | `@capacitor/camera` | Native only, check permission + availability |
| Clipboard | `@capacitor/clipboard` | Native → plugin; Web → `navigator.clipboard` |
| Geolocation | `@capacitor/geolocation` | Native → plugin; Web → `navigator.geolocation` |
| Push notifications | `@capacitor/push-notifications` | Native only, check permission |
| Status bar | `@capacitor/status-bar` | Native only |
| Splash screen | `@capacitor/splash-screen` | Native only, hide after ready |

---
name: sentry-integration
description: 'Use when working with Sentry error tracking, adding breadcrumbs, capturing exceptions, setting user context, or configuring Sentry in any file. Covers @sentry/sveltekit API, Capacitor client-only patterns, data sanitization, and testing with Vitest mocks.'
---

# Sentry Integration — BitTasker

Error tracking is powered by `@sentry/sveltekit`. The app is a Capacitor client-only SPA — there are no server-side logs, so Sentry breadcrumbs and events are the **primary debugging tool** in production.

## Setup

Sentry is initialized once in the SvelteKit client hook:

**`src/hooks.client.ts`** — `Sentry.init()` runs conditionally (skipped in `development` mode):

```ts
import { init, replayIntegration, handleErrorWithSentry } from '@sentry/sveltekit';

if (process.env.NODE_ENV !== 'development') {
  init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    tracesSampleRate: 1.0,
    enableLogs: true,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    integrations: [replayIntegration()],
    sendDefaultPii: false
  });
}
```

The global error handler uses `handleErrorWithSentry()` — all uncaught SvelteKit errors are automatically reported.

The Vite build plugin (`sentrySvelteKit`) is configured in **`vite.config.ts`** (line 143) with `autoInstrument: { load: false, serverLoad: false }` since the app is client-only.

## Importing

Always import from `@sentry/sveltekit`:

```ts
import { addBreadcrumb, captureException, setUser, setTag, withScope } from '@sentry/sveltekit';
```

The project does **not** use `@sentry/capacitor` — the sveltekit SDK handles both web and native Capacitor builds.

## Capturing Errors

### `captureException(error)` — Manual capture in catch blocks

Always capture errors in catch blocks. Letting errors bubble to `handleErrorWithSentry` is insufficient for errors that are caught and handled silently.

```ts
import { captureException } from '@sentry/sveltekit';
import { tryCatch } from '$lib/utils/tryCatch';

async function fetchWalletBalance(): Promise<number> {
  const { data, error } = await tryCatch(api.getBalance());

  if (error) {
    captureException(error, {
      tags: { feature: 'wallet' },
      extra: { context: 'fetchWalletBalance' }
    });
    return 0;
  }

  return data;
}
```

### Pattern: `tryCatch()` + `captureException()`

The project uses `tryCatch()` from `src/lib/utils/tryCatch.ts` (returns `{ data, error }` tuples) for all async operations. Combine it with Sentry capture:

```ts
const { data, error } = await tryCatch(riskyOperation());

if (error) {
  captureException(error, {
    level: 'error',
    tags: { feature: 'swap' }
  });
  // Handle gracefully
}
```

### When NOT to capture

- **Do not** capture expected errors (validation failures, user-cancelled operations, insufficient funds) — these are not bugs
- **Do not** capture errors in `tryCatch` when the error is immediately surfaced to the user (the fact that it was handled is sufficient; the user sees the message)

## Breadcrumbs

`addBreadcrumb()` is the most important debugging tool in this Capacitor app. Add breadcrumbs **before** every key user action and state transition.

### Syntax

```ts
import { addBreadcrumb } from '@sentry/sveltekit';

addBreadcrumb({
  category: 'auth',
  message: 'User logged in',
  level: 'info',
  data: { pubkey: 'npub1...' }
});
```

### Required breadcrumb categories

| Category | When to add | Example message |
|---|---|---|
| `auth` | Login, logout, session expiry, key generation | `'User logged in'`, `'User logged out'` |
| `navigation` | Every route change | `'Navigated to /wallet'` |
| `wallet` | Swap initiation, invoice creation, payment, balance check | `'Swap created: BTC→USDT'` |
| `nostr` | Event publish, relay connect/disconnect, DM send/receive | `'Published kind 1 event'` |
| `network` | Online/offline transitions | `'Device went offline'` |
| `lifecycle` | App pause/resume (Capacitor lifecycle events) | `'App moved to background'` |
| `delegation-state` | EIP-7702 delegation state transitions | `'Delegation state: TX1_SUBMITTED'` |
| `delegation-error` | Delegation errors | `'Delegation error in state TX1_SUBMITTED'` |

### Project breadcrumb wrapper example

The delegation system has a dedicated Sentry breadcrumbs module at `src/lib/services/gas-abstraction/sentry-breadcrumbs.ts:71` that wraps `addBreadcrumb()` with safety guards:

```ts
function isSentryActive(): boolean {
  return typeof addBreadcrumb === 'function';
}

export function logDelegationBreadcrumb(state: DelegationState, metadata?: Record<string, unknown>): void {
  if (!isSentryActive()) return;
  addBreadcrumb({
    category: 'delegation-state',
    message: `Delegation state: ${state}`,
    level: 'info',
    data: { state, timestamp: new Date().toISOString(), ...metadata }
  });
}
```

## User Context

Set user identity when the user authenticates. Clear it on logout.

```ts
import { setUser } from '@sentry/sveltekit';

// On login
setUser({ id: userPubkey });

// On logout
setUser(null);
```

This project uses Nostr pubkeys for identity. Set the pubkey as the `id`.

## Tags

Tags are key-value pairs for filtering in the Sentry dashboard. Set them at feature boundaries.

```ts
import { setTag } from '@sentry/sveltekit';

setTag('feature', 'wallet');
setTag('network', networkName); // e.g., 'mainnet', 'testnet'
setTag('platform', Capacitor.isNativePlatform() ? 'native' : 'web');
```

## Scope Management

Use `withScope()` to attach context to a specific error without polluting the global scope:

```ts
import { withScope, captureException } from '@sentry/sveltekit';

withScope((scope) => {
  scope.setTag('swap_id', swapId);
  scope.setExtra('invoice_amount', amountSats);
  captureException(error);
});
// Global scope is unaffected
```

## Browser vs Native (Capacitor)

The app runs on both web and native (iOS/Android). Sentry works in both contexts via `@sentry/sveltekit`:

- **Web builds**: Sentry captures errors, breadcrumbs, session replays, and performance traces in the browser
- **Native Capacitor builds**: Sentry runs inside the WebView. Errors from native plugin calls bubble into the WebView and are captured. Session replays capture the WebView UI

**Platform-aware tagging**:

```ts
import { Capacitor } from '@capacitor/core';

setTag('platform', Capacitor.isNativePlatform() ? 'native' : 'web');
setTag('platform_name', Capacitor.getPlatform()); // 'ios', 'android', 'web'
```

## What NOT to Send to Sentry

**Never log secrets or sensitive material.** Sentry events are stored in the cloud.

Prohibited data:
- `nsec` private keys, hex private keys
- Mnemonic seed phrases (BIP-39)
- Raw signatures or signed transactions
- User passwords, PINs, or authentication tokens
- Any value from `localStorage` or `Preferences` that contains key material

### Sanitization pattern

Before calling `captureException()` or `addBreadcrumb()`, strip secrets:

```ts
function sanitizeError(error: unknown): Error {
  if (error instanceof Error) {
    // Replace any nsec/hex key patterns in the message
    return new Error(
      error.message
        .replace(/nsec1[a-z0-9]{50,}/g, '[REDACTED]')
        .replace(/0x[a-fA-F0-9]{64}/g, '[REDACTED]')
    );
  }
  return new Error(String(error));
}

captureException(sanitizeError(rawError));
```

Use Sentry's `beforeSend` hook in `init()` for global sanitization if needed:

```ts
init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  beforeSend(event) {
    // Strip sensitive data from all events
    if (event.message) {
      event.message = event.message.replace(/nsec1[a-z0-9]{50,}/g, '[REDACTED]');
    }
    return event;
  }
});
```

## Performance Tracing

Track slow operations with transaction spans:

```ts
import { startSpan } from '@sentry/sveltekit';

async function performSwap(amount: number) {
  return startSpan({ name: 'swap.boltz.create', op: 'swap' }, async (span) => {
    span?.setData('amount_sats', amount);

    const result = await boltz.createSwap(amount);

    span?.setData('swap_id', result.id);
    span?.end();

    return result;
  });
}
```

For the older `startTransaction` API (used in earlier Sentry SDKs), use the scope-based approach:

```ts
import { getCurrentScope } from '@sentry/sveltekit';

const scope = getCurrentScope();
const span = scope.getSpan();
// ...attach child spans
```

## Testing with Vitest

Mock Sentry in tests to avoid actual initialization and network calls:

```ts
// At the top of your test file
vi.mock('@sentry/sveltekit', () => ({
  init: vi.fn(),
  addBreadcrumb: vi.fn(),
  captureException: vi.fn(),
  setUser: vi.fn(),
  setTag: vi.fn(),
  withScope: vi.fn((cb) => {
    const mockScope = {
      setTag: vi.fn(),
      setExtra: vi.fn(),
      setLevel: vi.fn(),
      setUser: vi.fn()
    };
    cb(mockScope);
  }),
  handleErrorWithSentry: vi.fn((handler) => handler),
  replayIntegration: vi.fn(() => ({ name: 'Replay' }))
}));
```

Verify Sentry was called in tests:

```ts
import { addBreadcrumb, captureException } from '@sentry/sveltekit';

expect(addBreadcrumb).toHaveBeenCalledWith({
  category: 'auth',
  message: 'User logged in',
  level: 'info'
});

expect(captureException).toHaveBeenCalledWith(
  expect.objectContaining({ message: 'Network error' })
);
```

## Quick Reference

| API | Import | Use case |
|---|---|---|
| `init(options)` | `@sentry/sveltekit` | Initialize in `hooks.client.ts` (already done) |
| `captureException(error, opts?)` | `@sentry/sveltekit` | Manual error capture in catch blocks |
| `addBreadcrumb(breadcrumb)` | `@sentry/sveltekit` | Log every key user action (auth, nav, wallet, nostr) |
| `setUser(user \| null)` | `@sentry/sveltekit` | Set on login with Nostr pubkey, clear on logout |
| `setTag(key, value)` | `@sentry/sveltekit` | Feature/platform/network tags for dashboard filtering |
| `setExtra(key, value)` | `@sentry/sveltekit` | Attach structured data to current scope |
| `withScope(callback)` | `@sentry/sveltekit` | Isolate context to a single error capture |
| `handleErrorWithSentry(handler)` | `@sentry/sveltekit` | Wrap SvelteKit `handleError` (already in hooks.client.ts) |
| `replayIntegration()` | `@sentry/sveltekit` | Session replay integration (already in `init()`) |
| `sentrySvelteKit(options)` | `@sentry/sveltekit` | Vite plugin for source maps upload (in vite.config.ts) |
| `startSpan(options, callback)` | `@sentry/sveltekit` | Performance tracing for slow operations |
| `tryCatch(promise)` | `$lib/utils/tryCatch` | Async error wrapper — returns `{ data, error }` tuple |

## Key Files

| File | Role |
|---|---|
| `src/hooks.client.ts:9-33` | `Sentry.init()` and `handleErrorWithSentry` wrapper |
| `vite.config.ts:143` | `sentrySvelteKit` build plugin (source maps upload) |
| `src/lib/services/gas-abstraction/sentry-breadcrumbs.ts` | Reusable breadcrumb wrapper pattern |
| `src/lib/utils/tryCatch.ts` | `tryCatch()` — standard async error handling used with Sentry |
| `src/lib/tests/components/StreamPlayer.test.ts:42-44` | Example of mocking `@sentry/sveltekit` in Vitest |

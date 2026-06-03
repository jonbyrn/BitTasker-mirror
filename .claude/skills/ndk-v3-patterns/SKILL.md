---
name: ndk-v3-patterns
description: 'Use when writing or modifying code that uses @nostr-dev-kit/ndk v3 directly. Covers NDK instance, signer, subscriptions, publishing, connection state, error handling, and common patterns. Complements bittasker-nostr (NIPs/general Nostr) with NDK v3 API specifics.'
---

# NDK v3 Patterns — BitTasker

This project uses `@nostr-dev-kit/ndk` v3 as the primary Nostr SDK. The `bittasker-nostr` skill covers NIPs and general Nostr concepts — this skill fills the NDK v3 API gap.

## NDK Instance — Singleton

The project uses a single global NDK instance, created once in `src/lib/nostr/ndk.ts`.

```typescript
import { ndk } from '$lib/nostr/ndk';
```

- **DO**: import `ndk` from `$lib/nostr/ndk.ts` and use it everywhere
- **NEVER**: create `new NDK()` inside a component, store, or utility — this creates a disconnected instance

The singleton is created via `createNDK()` from `@nostr-dev-kit/svelte` with `explicitRelayUrls` and `session: true`, then immediately connected:

```typescript
export const ndk = createNDK({
  explicitRelayUrls: [import.meta.env.VITE_NOSTR_RELAY_URL],
  session: true,
  enableOutboxModel: false
});
ndk.connect();
```

## Signer Management

This app uses `NDKPrivateKeySigner` (nsec-based) — keys come from passkey/biometrics via `src/lib/utils/nostrKeys.ts`. The signer is applied to the global NDK instance through `applyNdkSignerFromNsec()`.

### Checking Signer Availability

```typescript
// Reactive — true when NDK has a signer loaded
ndk.$currentPubkey  // string | undefined — safe to gate subscriptions

// Imperative
const pubkey = (await ndk.signer?.user())?.pubkey;
if (!pubkey) {
  // Signer not available — prompt user to unlock keys
}
```

### Applying a Signer

```typescript
import { applyNdkSignerFromNsec } from '$lib/nostr/ndk';

const nsec: Uint8Array = /* from passkey/biometrics */;
await applyNdkSignerFromNsec(nsec);
```

This also sets up a Dexie cache adapter (`NDKCacheDexie`) and registers the task relay.

### NIP-07 vs Native

- **Capacitor (native)**: uses `NDKPrivateKeySigner` with nsec from passkey/biometrics — managed by `ndkIdentity` rune (`src/lib/runes/ndkIdentity.svelte.ts`)
- **Web**: same `NDKPrivateKeySigner` pattern — no NIP-07 browser extension required. If you need NIP-07 support, set `ndk.signer = new NDKNip07Signer()` but this is not the current architecture

### Signer Lifecycle

```typescript
// Check before any operation requiring signing
const hasSigner = $derived(!!ndk.$currentPubkey);

// Ensure signer is available (run before publish / subscribe-to-mentions)
import { ndkIdentity } from '$lib/runes/ndkIdentity.svelte';
await ndkIdentity.ensureSigner(); // triggers passkey flow if needed
```

- On logout: `ndkLogout()` from `$lib/nostr/ndk.ts` clears signer, activeUser, cache adapter, and Dexie databases
- After login: call `applyNdkSignerFromNsec()` or `ndkIdentity.ensureSigner()`

## Connection State

NDK manages connection internally. The project does **not** expose a reactive `ndk.connected` store — instead, check signer presence and rely on NDK's built-in reconnection.

- NDK auto-connects after `ndk.connect()` at module init
- Events published while offline are queued by NDK and retried via `unpublishedEventsRetry` (`src/lib/runes/unpublishedEventsRetry.svelte.ts`)
- Connection state is implicit; if `ndk.publish()` or `ndk.fetchEvents()` fail, handle the error (see Error Handling below)

## Fetching Events

### One-shot Query (auto-closes)

```typescript
import { ndk } from '$lib/nostr/ndk';

// Fetch events with closeOnEose — subscription auto-stops after EOSE
const events = await ndk.fetchEvents(
  { kinds: [0], authors: [pubkey], limit: 1 },
  { closeOnEose: true }
);

// Single event
const event = await ndk.fetchEvent(eventId);
```

### Persistent Subscription (must stop)

```typescript
import { ndk } from '$lib/nostr/ndk';
import type { NDKSubscription } from '@nostr-dev-kit/ndk';

const sub: NDKSubscription = ndk.subscribe(
  { kinds: [5324], '#p': [pubkey] },
  { closeOnEose: false }
);

sub.on('event', (event) => { /* process event */ });
sub.on('eose', () => { /* history complete, now live */ });
sub.start();

// MUST clean up on component destroy
// In Svelte 5 with $effect:
$effect(() => {
  return () => { sub.stop(); };
});
// In Svelte 4 with onDestroy:
onDestroy(() => { sub.stop(); });
```

### Double-Subscription Warning

- Each call to `ndk.subscribe()` opens a new subscription. If the same filter is double-subscribed (e.g. reactive code re-running), you get duplicate events
- Always save the sub reference and call `.stop()` before re-subscribing, or guard with a flag

## Publishing Events

### Publish via Event Instance

```typescript
import { ndk } from '$lib/nostr/ndk';
import { NDKPaymentContract } from '$lib/nostr/events/contract';

const event = new NDKPaymentContract(ndk);
event.taskId = taskId;
event.status = 'pending';
// ... set all fields ...

await event.publish(); // returns a Promise — ALWAYS await
```

### Publish via ndk.publish

```typescript
const ndkEvent = new NDKEvent(ndk, { kind: 7, content: '+', tags: [...] });
await ndk.publish(ndkEvent);
```

### Post-Publish Verification

After publishing, verify the event persisted:

```typescript
await event.publish();

// Confirm persistence — wait at least 1s for relay propagation
const fetched = await ndk.fetchEvents(
  { ids: [event.id], limit: 1 },
  { closeOnEose: true }
);
if (fetched.size === 0) {
  // Event may not have propagated — retry or warn
}
```

### Before Publish Checklist

1. Signer is available (`ndk.$currentPubkey` or `ndk.signer?.user()`)
2. Event has all required tags and fields set
3. `event.ndk` references the singleton instance (custom event classes get it via constructor)

## Filter Best Practices

```typescript
import { ndk } from '$lib/nostr/ndk';

const filter: NDKFilter = {
  kinds: [0],           // Always specify kinds
  authors: [pubkey],    // Limit to specific authors
  limit: 50,            // ALWAYS set limit — prevents fetching entire relay history
  since: Math.floor(Date.now() / 1000) - 86400, // Last 24h
  '#t': ['task'],       // Tag-based filtering (hash-tag)
  '#p': [pubkey],        // Mentions filter
};

const events = await ndk.fetchEvents(filter, { closeOnEose: true });
```

Rules:
- **Always** set `limit` — prevents unbounded fetches
- Use `since` timestamps to scope to recent data
- Use `closeOnEose: true` for one-shot queries (subscription auto-stops)
- Use `{ closeOnEose: false }` for live subscriptions you'll stop manually
- `ids` for specific events, `#d` for replaceable event d-tags

## Common Patterns

### Fetch User Profile (Kind 0)

```typescript
const events = await ndk.fetchEvents(
  { kinds: [0], authors: [pubkey], limit: 1 },
  { closeOnEose: true }
);
const profileEvent = events.values().next().value;
const profile = profileEvent ? JSON.parse(profileEvent.content) : null;
```

### Fetch Notes (Kind 1)

```typescript
const events = await ndk.fetchEvents(
  { kinds: [1], authors: [pubkey], limit: 20, until: Date.now() / 1000 },
  { closeOnEose: true }
);
```

### Publish Reaction (Kind 7)

```typescript
const reaction = new NDKEvent(ndk, {
  kind: 7,
  content: '+',
  tags: [['e', targetEventId], ['p', targetPubkey]],
  created_at: Math.floor(Date.now() / 1000),
});
await reaction.publish();
```

### Subscribe to Mentions (#p tag)

```typescript
const sub = ndk.subscribe(
  { kinds: [1, 6, 7], '#p': [myPubkey], since: Date.now() / 1000 },
  { closeOnEose: false }
);
sub.on('event', (event) => { /* new mention */ });
// Always clean up: sub.stop()
```

### Contract Subscriptions

The project's contract rune (`src/lib/runes/contractRune.svelte.ts`) demonstrates the full subscription lifecycle:

```typescript
this.statusSub = ndk.subscribe(filter, ops);
// ... process events ...
this.statusSub?.stop(); // Called by stopSubscription()
this.statusSub = null;
```

## Error Handling

### Publish Errors

```typescript
try {
  await event.publish();
} catch (e) {
  if (e.message?.includes('timeout')) {
    // Relay timeout — NDK will auto-retry via queued events
  } else if (e.message?.includes('signer')) {
    // Signer unavailable — prompt user to unlock keys
  } else {
    // Network error — check navigator.onLine
  }
}
```

### Fetch Errors

```typescript
try {
  const events = await ndk.fetchEvents(filter, { closeOnEase: true });
} catch (e) {
  // Relay may be offline — handle gracefully, show stale data if cached
}
```

### Common Failure Scenarios

| Scenario | Check | Action |
|----------|-------|--------|
| Signer not set | `ndk.$currentPubkey` is falsy | Call `ndkIdentity.ensureSigner()` |
| Publish failed | Catch on `event.publish()` | NDK queues for retry; verify with follow-up fetch |
| Relay timeout | Error message contains "timeout" | Events are queued — unpublishedEventsRetry will replay |
| Empty fetch result | Result set is empty | Relay may not have data — try different relay or show empty state |
| Browser offline | `navigator.onLine === false` | NDK queues locally — show offline indicator |

## Anti-Patterns

| Wrong | Right |
|-------|-------|
| `new NDK({ explicitRelayUrls: [...] })` in a component | `import { ndk } from '$lib/nostr/ndk'` |
| `ndk.subscribe(...)` without saving the sub reference | `const sub = ndk.subscribe(...); sub.stop()` on destroy |
| Publishing without checking signer | Check `ndk.$currentPubkey` before publish |
| Assuming `window.nostr` (NIP-07) is available | Use `ndk.signer` — this project uses `NDKPrivateKeySigner` |
| `fetchEvents` without `limit` | Always set `limit` |
| Calling `ndk.subscribe()` in reactive code without cleanup | Guard with flag or stop existing sub first |
| Double-subscribing same filter | Stop existing sub before creating new one |

## Cache Adapter

The project uses `NDKCacheDexie` per-user:

```typescript
import NDKCacheDexie from '@nostr-dev-kit/cache-dexie';

ndk.cacheAdapter = new NDKCacheDexie({ dbName: `cache-${npub.slice(0, 8)}` });
```

- Cache is set during signer application (`applyNdkSignerFromNsec`)
- Cache is removed on logout (`ndkLogout` deletes the IndexedDB database)
- Dexie also creates a `${dbName}_modules` database — both are cleaned up on logout

## Custom Event Classes

Custom NDK event classes are registered globally:

```typescript
import { registerEventClass } from '@nostr-dev-kit/ndk';
import { NDKBid } from './events/bid';
import { NDKTask } from './events/task';
import { NDKPaymentContract } from './events/contract';
import { NDKContractStatus } from './events/contractStatus';

registerEventClass(NDKBid as never);
registerEventClass(NDKTask as never);
registerEventClass(NDKPaymentContract as never);
registerEventClass(NDKContractStatus as never);
```

- Custom classes exist at `src/lib/nostr/events/`
- Classes extend `NDKEvent` and have typed properties for their event kind
- Use `as never` cast — NDK v3 typings expect sync `from`, but project classes use async `from` (valid at runtime)
- When creating: pass `ndk` to the constructor: `new NDKPaymentContract(ndk)`
- When receiving: fetched events are auto-wrapped into custom classes via registration

## Relay Management

```typescript
import { NDKRelaySet } from '@nostr-dev-kit/ndk';

// Get task-specific relay set
import { getTaskRelay } from '$lib/nostr/ndk';
const taskRelay = getTaskRelay();

// Publish to specific relay set
await event.publish(taskRelay);

// Add relay at runtime
ndk.addExplicitRelay(import.meta.env.VITE_NOSTR_TASK_RELAY_URL);
```

## Quick Reference

| Operation | Code | Notes |
|-----------|------|-------|
| Get instance | `import { ndk } from '$lib/nostr/ndk'` | Singleton, always |
| Check signer | `ndk.$currentPubkey` | Reactive, use `$derived` |
| Ensure signer | `ndkIdentity.ensureSigner()` | Triggers passkey flow |
| Fetch events | `ndk.fetchEvents(filter, { closeOnEose: true })` | Always set `limit` |
| Fetch one event | `ndk.fetchEvent(id)` | Returns `NDKEvent \| null` |
| Subscribe | `const sub = ndk.subscribe(filter, opts); sub.start()` | Save ref, stop on destroy |
| Unsubscribe | `sub.stop()` | Required for persistent subs |
| Publish event | `await event.publish()` | Always `await` |
| Publish to relay | `await event.publish(relaySet)` | Target specific relays |
| Set signer | `ndk.signer = new NDKPrivateKeySigner(nsec)` | Via `applyNdkSignerFromNsec` |
| Logout | `await ndkLogout()` | Clears signer, cache, sessions |
| Register event class | `registerEventClass(MyEvent as never)` | Custom kind wrappers |
| Add relay | `ndk.addExplicitRelay(url)` | At runtime |

## Memory

After completing any NDK-related task, store key learnings:

```
mcp-memory_memory_store({
  content: "<pattern learned>",
  metadata: { tags: "ndk,nostr,pattern" }
})
```

Check memory before starting NDK work:

```
mcp-memory_memory_search({ query: "<task context>", tags: ["ndk"] })
```

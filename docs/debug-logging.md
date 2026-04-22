# Debug logging (`createDebug`)

BitTasker wraps the `[debug](https://github.com/debug-js/debug)` package in `src/lib/utils/debug.ts`. Use `createDebug` instead of ad-hoc `console.log` for flow tracing, especially in contracts, Nostr, escrow, and complex runes.

## Why use this instead of `console.log`?

| `console.log`                      | `createDebug`                                                                 |
| ---------------------------------- | ----------------------------------------------------------------------------- |
| Visible whenever that code runs    | **Off by default** until namespaces are enabled via `localStorage.debug`      |
| Hard to filter across many modules | **Glob patterns** and comma-separated lists (same model as `debug` elsewhere) |
| Often deleted after a fix          | Intended to **stay** as low-cost trace and context for the next developer     |

End users do not need to see development traces. Only people who set `localStorage.debug` (and refresh) opt in.

**Note on browser console levels:** Some environments or versions route library output in ways that match **Verbose** (or similar) in DevTools. If you set `localStorage.debug` and still see nothing, open the console’s log level menu and ensure **Verbose** (and other relevant levels) are enabled, then refresh.

## How it works in this repo

1. **Root namespace** — Every logger is prefixed with `btasker:` (`APP_NAMESPACE` in `src/lib/utils/debug.ts`).
2. **Per-module logger** — `createDebug('some:namespace')` registers `btasker:some:namespace`.
3. **Startup** — `initDebug()` in `src/routes/+layout.ts` reads `localStorage.debug` and calls `debug.enable(...)`. If that key is unset, loggers stay disabled.

The string you match in DevTools is always:

`btasker:<argument passed to createDebug>`

Example: `createDebug('runes:contractRune')` → enable with `btasker:runes:contractRune` or a pattern such as `btasker:runes:`\*.

## Usage

### 1. Create a logger

```ts
import { createDebug } from '$lib/utils/debug';

const d = createDebug('contract:v2');
```

Choose a **stable, hierarchical** name (area → feature → detail). Aligning with the file or feature name makes grep and console filtering easy.

### 2. Log

```ts
d.log('step reached', { payload });
d.warn('unexpected but non-fatal');
d.error('operation failed', err);
```

- `log` — normal trace (the default `debug` function).
- `warn` / `error` — separate channels via `extend('warn')` and `extend('error')`, so namespaces look like `btasker:myfeature:warn` when you need to narrow further.

### 3. Sub-namespaces (optional)

```ts
const d = createDebug('contract');
const preflight = d.extend('preflight');

preflight.log('checking preconditions…');
```

## Enabling logs in the browser

1. Open DevTools → **Console**.
2. Set a filter, for example:

```js
localStorage.debug = 'btasker:*';
```

3. **Reload the page** so `initDebug()` runs again.

You should see a line such as: `Debug initialized with settings: btasker:`\*.

### Console log levels

If nothing appears after enabling, check the console **Default levels** menu. Some browsers group certain output under **Verbose**; enable Verbose (and other relevant levels) if traces still do not show, then refresh.

## Filtering (only what you care about)

Use `debug` wildcard and list syntax so other subsystems do not flood the console while you work on one feature.

| Goal                                | Example `localStorage.debug` value              |
| ----------------------------------- | ----------------------------------------------- |
| All BitTasker debug loggers         | `btasker:`\*                                    |
| Anything contract-related           | `btasker:contract*`                             |
| Narrower (e.g. v2 only)             | `btasker:contract:v2*`                          |
| Single module                       | `btasker:runes:contractRune`                    |
| Multiple areas (comma-separated)    | `btasker:contract*,btasker:ndk:events:contract` |
| Everything except a noisy namespace | `btasker:*,-btasker:ndk:signer`                 |

Turn logging off:

```js
localStorage.removeItem('debug');
// or
localStorage.debug = '';
```

Then refresh.

## Examples in the codebase

Search for `createDebug(` to list current namespaces. Illustrative entries:

- `runes:contractRune` — `src/lib/runes/contractRune.svelte.ts`
- `contract:v2`, `contract:lifecycle:v2`, … — contract utilities
- `ndk:events:contract`, `ndk:signer` — Nostr / NDK
- `contracts:actionsNDK`, `contracts:*` modals — contract UI

## Team guidelines

1. Prefer `createDebug` over `console.log` for exploratory and flow tracing in non-trivial code paths.
2. **Never log secrets** (private keys, tokens, full auth payloads).
3. Keep the first argument short; pass objects as additional arguments for inspection.
4. Prefer **stable namespace strings** so filters and docs stay valid across small refactors.

## Quick copy-paste

> Traces use `createDebug` from `$lib/utils/debug`. They stay **off** until you set `localStorage.debug` (e.g. `btasker:`_) and **refresh**. Use patterns like `btasker:contract`_ to show only the area you need. Keeps user consoles clean and avoids ripping `console.log` in and out.

## Implementation reference

- `src/lib/utils/debug.ts` — `createDebug`, `initDebug`, re-export of `debug`
- `src/routes/+layout.ts` — calls `initDebug()` on app load

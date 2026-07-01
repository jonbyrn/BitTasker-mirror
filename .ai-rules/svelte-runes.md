# Svelte 5 Reactivity Rules

> Source: https://svelte.dev/docs/svelte/$state, https://svelte.dev/docs/svelte/$derived, https://svelte.dev/docs/svelte/$effect, https://svelte.dev/docs/svelte/stores

## Decision Tree

### 1. `$state` — Mutable reactive state

Use for ANY value that needs to change over time:

- Local component variables that mutate
- Shared state across modules (put in `.svelte.js` / `.svelte.ts` files)
- Class fields that need reactivity
- Objects and arrays become deeply reactive proxies automatically

```svelte
<script>
  let count = $state(0);
  let items = $state([]);
</script>
```

```typescript
// shared state.svelte.ts
export const userState = $state({ name: '', loggedIn: false });
```

Use `$state.raw` for large objects/arrays you won't mutate (only reassign) — avoids proxy overhead.

### 2. `$derived` / `$derived.by` — Pure computed values

Use for ANY value that can be expressed as a pure function of other state. Must be side-effect free. Svelte disallows state mutations inside derived expressions.

- `$derived(expression)` for simple expressions
- `$derived.by(() => { ... })` for complex multi-line logic

```svelte
<script>
  let count = $state(0);
  let doubled = $derived(count * 2);
  let total = $derived.by(() => {
    let sum = 0;
    for (const n of numbers) sum += n;
    return sum;
  });
</script>
```

Since Svelte 5.25, derived values can be temporarily overridden (useful for optimistic UI).

### 3. `$effect` — Side effects only (escape hatch)

**Per the official docs:** `$effect` is *"best considered something of an escape hatch — useful for things like analytics and direct DOM manipulation — rather than a tool you should use frequently."*

**Also per the docs:** *"Generally speaking, you should NOT update state inside effects."*

`$effect` ONLY runs in the browser (not during SSR).

#### Valid uses of `$effect`:
- Drawing on `<canvas>` elements
- Calling third-party libraries that need DOM access
- Syncing with non-Svelte systems (localStorage, URL params, browser APIs)
- Analytics/logging that cannot be expressed as derived values
- Setting up intervals/timers with cleanup (return a teardown function)
- `$effect.pre` for rare cases needing pre-DOM-update timing (e.g., scroll position)

#### INVALID uses of `$effect` (use `$derived` instead):
- Deriving one value from another
- Updating state based on other state
- Transforming, filtering, or combining data for display
- Syncing two-way bindings (use function bindings or `oninput` callbacks)
- Any computation without external side effects

```svelte
<script>
  // WRONG — use $derived
  let count = $state(0);
  let doubled = $state();
  $effect(() => { doubled = count * 2; });

  // RIGHT
  let doubled = $derived(count * 2);
</script>
```

#### Two-way sync without `$effect`:

Instead of using effects to link values, use function bindings or event handlers:

```svelte
<script>
  const total = 100;
  let spent = $state(0);
  let left = $derived(total - spent);

  function updateLeft(newLeft) {
    spent = total - newLeft;
  }
</script>

<input type="range" bind:value={spent} max={total} />
<input type="range" bind:value={() => left, updateLeft} max={total} />
```

### 4. Stores — Legacy API (prefer runes)

**Per the official docs:** *"Prior to Svelte 5, stores were the go-to solution for creating cross-component reactive states or extracting logic. With runes, these use cases have greatly diminished."*

#### When to use stores:
- Complex asynchronous data streams (RxJS-style)
- When you need more manual control over value updates or change listeners

#### When NOT to use stores (use runes instead):
- Shared state → `$state` in `.svelte.js` files
- Extracted logic → runes work in `.svelte.js` / `.svelte.ts` files
- Derived values → `$derived`

#### Store subscription rules:
- In `.svelte` files: use `$storeName` auto-subscribe syntax — NEVER use manual `.subscribe()`
- Manual `.subscribe()` is only needed in plain `.js` / `.ts` files (not `.svelte.js`)
- If you need store value outside reactive context, use `get(store)` from `svelte/store`

## Anti-Patterns to Avoid

1. **`$effect` to sync state** → use `$derived`
2. **`$effect` to compute values** → use `$derived`
3. **`$effect` with no external side effect** → probably should be `$derived`
4. **`store.subscribe()` in `.svelte` files** → use `$storeName` auto-subscribe
5. **New writable/readable stores for shared state** → use `$state` in `.svelte.ts`
6. **`$effect` wrapping reactive logic "just in case"** → derive it
7. **Updating `$state` inside `$effect` that reads the same state** → infinite loop risk; use `$derived` or `untrack`

## Quick Reference

| Need | Rune/API | File type |
|------|----------|-----------|
| Mutable state | `$state` / `$state.raw` | `.svelte`, `.svelte.js`, `.svelte.ts` |
| Computed value | `$derived` / `$derived.by` | `.svelte`, `.svelte.js`, `.svelte.ts` |
| Side effect | `$effect` / `$effect.pre` | `.svelte`, `.svelte.js`, `.svelte.ts` |
| Component props | `$props` | `.svelte` |
| Two-way binding prop | `$bindable` | `.svelte` |
| Debug logging | `$inspect` | `.svelte`, `.svelte.js`, `.svelte.ts` |
| Shared reactive state | `$state` in `.svelte.ts` | `.svelte.ts` |
| Legacy store auto-sub | `$storeName` | `.svelte` only |

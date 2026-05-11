---
name: svelte-runes
description: 'Svelte 5 runes guidance. Use for reactive state, props, effects, or migration. Covers $state, $derived, $effect, $props, $bindable. Prevents reactivity mistakes.'
---

# Svelte 5 Runes

## Quick Start

**Which rune?** Props: `$props()` | Bindable: `$bindable()` | Computed: `$derived()` | Side effect: `$effect()` | State: `$state()`

**Key rules:** Runes are top-level only. Don't mix Svelte 4/5 syntax. Objects/arrays are deeply reactive by default.

## Example

```svelte
<script>
	let { initialCount = 0 } = $props();
	let count = $state(initialCount);
	let doubled = $derived(count * 2);
	$effect(() => {
		console.log(`Count changed to ${count}`);
	});
</script>

<button onclick={() => count++}>
	{count} (doubled: {doubled})
</button>
```

## Notes

- Use `onclick` not `on:click`, `{@render children()}` in layouts
- `$derived` can be reassigned (5.25+) — use `const` for read-only
- Use `$inspect.trace` to debug reactivity issues
- `@const` and `{@render}` replace Svelte 4 slot patterns
- Always run `mcp__svelte__svelte-autofixer` after writing .svelte files

**BitTasker note:** This project is Capacitor client-only — all components run in browser context only.

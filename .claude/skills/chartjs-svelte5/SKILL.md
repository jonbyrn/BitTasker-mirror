---
name: chartjs-svelte5
description: 'Integrating Chart.js with Svelte 5 runes. Use for analytics dashboards, data visualization, charts, or any Chart.js component. Covers instance lifecycle, reactive data, canvas refs, daisyUI theming, and common pitfalls.'
---

# Chart.js + Svelte 5 — BitTasker

## Setup

Install and import with automatic registration:

```bash
npm install chart.js
```

```typescript
import { Chart } from 'chart.js/auto';
```

`chart.js/auto` registers all controllers, elements, scales, and plugins. No manual registration needed.

## Instance Lifecycle

The canonical pattern — create in `$effect`, destroy in cleanup, update reactively:

```svelte
<script>
	import { Chart } from 'chart.js/auto';

	let canvas = $state(null);
	let chart = $state(null);
	let { data, options } = $props();

	$effect(() => {
		if (!canvas) return;
		const ctx = canvas.getContext('2d');
		chart = new Chart(ctx, { type: 'bar', data, options });
		return () => chart?.destroy();
	});

	$effect(() => {
		if (!chart) return;
		chart.data = data;
		chart.update();
	});
</script>

<canvas bind:this={canvas}></canvas>
```

**Rules:**
- Create once in `$effect` after mount — canvas ref must be populated
- Store chart instance in `$state(null)`
- **Always** return a cleanup function: `return () => chart?.destroy()`
- **Never** call `new Chart()` without destroying the previous instance first
- **Never** render chart before canvas element exists (`if (!canvas) return`)

## Reactive Data Updates

Do NOT create a new Chart instance when data changes. Update the existing chart:

```typescript
$effect(() => {
	if (!chart) return;
	chart.data = newData;
	chart.update(); // smooth transition by default
});
```

- `chart.update()` accepts `'none'`, `'default'`, `'active'`, or `'resize'` modes
- `'none'` is cheapest but skips transitions; `'default'` handles most cases
- For label changes, also reassign `chart.data.labels`

**Anti-pattern — DO NOT DO:**

```typescript
// WRONG: creates new instance on every data change, leaks memory
$effect(() => {
	if (!canvas) return;
	chart = new Chart(ctx, { type: 'bar', data, options });
});
```

## Canvas Ref Pattern

In Svelte 5, use `$state(null)` for the canvas ref and `bind:this`:

```svelte
<script>
	let canvas = $state(null);
</script>
<canvas bind:this={canvas}></canvas>
```

The ref is `null` until after mount. Guard with `if (!canvas) return` at the top of every `$effect` that uses it.

## Chart Types

| Type | Use case | Config example |
|------|----------|---------------|
| `bar` | Comparisons, categories | `{ type: 'bar', data: { labels, datasets } }` |
| `line` | Time series, trends | `{ type: 'line' }` — use with time scale for date axes |
| `pie` | Proportions (few categories) | `{ type: 'pie' }` |
| `doughnut` | Proportions with center space | `{ type: 'doughnut' }` — identical API to pie |
| `radar` | Multi-variable comparison | `{ type: 'radar' }` |

**BitTasker usage:** Analytics dashboards in `src/lib/components/` use bar + line + pie.

## Responsive

```typescript
options: {
	responsive: true,
	maintainAspectRatio: false
}
```

With `maintainAspectRatio: false`, the chart fills its parent container. Size the parent with Tailwind:

```svelte
<div class="w-full h-64">
	<canvas bind:this={canvas}></canvas>
</div>
```

## daisyUI Theming

Use CSS custom properties from the daisyUI theme for chart colors:

```typescript
const colors = {
	primary: getComputedStyle(document.documentElement).getPropertyValue('--p').trim(),
	secondary: getComputedStyle(document.documentElement).getPropertyValue('--s').trim(),
	accent: getComputedStyle(document.documentElement).getPropertyValue('--a').trim(),
	neutral: getComputedStyle(document.documentElement).getPropertyValue('--n').trim(),
	base100: getComputedStyle(document.documentElement).getPropertyValue('--b1').trim(),
};

const config = {
	type: 'bar',
	data: {
		datasets: [{
			backgroundColor: [colors.primary, colors.secondary, colors.accent],
			borderColor: colors.neutral,
		}]
	}
};
```

daisyUI CSS variables available: `--p` (primary), `--s` (secondary), `--a` (accent), `--n` (neutral), `--b1`/`--b2`/`--b3` (base), `--in` (info), `--su` (success), `--wa` (warning), `--er` (error).

> Theme changes (dark/light toggle) require re-reading CSS variables and calling `chart.update()`. Use a `$effect` that depends on the theme signal.

## State Handling

### Loading

Show a skeleton or spinner while data loads — never an empty chart area:

```svelte
{#if loading}
	<div class="skeleton w-full h-64"></div>
{:else if error}
	<div class="text-error">Failed to load chart data</div>
{:else if data.length === 0}
	<div class="text-base-content/50 text-center py-8">No data available</div>
{:else}
	<canvas bind:this={canvas}></canvas>
{/if}
```

Use daisyUI `skeleton` class for the loading placeholder.

### Empty

Show "No data available" placeholder, not a blank chart. The canvas should not render at all when there's no data.

### Error

Catch Chart.js errors (invalid data, missing canvas) and show fallback UI:

```typescript
$effect(() => {
	if (!canvas) return;
	try {
		chart = new Chart(ctx, config);
	} catch (e) {
		console.error('Chart initialization failed:', e);
		error = $state('Failed to render chart');
	}
	return () => chart?.destroy();
});
```

Common errors: passing wrong data shape, missing required options for a chart type, canvas not attached to DOM.

## Performance

**Large datasets (1000+ points):**

Chart.js includes a built-in `decimation` plugin for line charts. Enable it:

```typescript
options: {
	plugins: {
		decimation: {
			enabled: true,
			algorithm: 'lttb' // largest-triangle-three-buckets, best for visual fidelity
		}
	}
}
```

**Avoid re-rendering on every frame:**

```typescript
let debounceTimer;
$effect(() => {
	if (!chart) return;
	clearTimeout(debounceTimer);
	debounceTimer = setTimeout(() => chart.update(), 100);
});
```

Never call `chart.update()` on every `mousemove` — debounce or use `requestAnimationFrame`.

**For very large datasets**, consider server-side aggregation or pre-binning data before passing to Chart.js.

## Common Patterns

### Time Series with Date Axis

```typescript
import 'chartjs-adapter-date-fns'; // or moment/luxon adapter

options: {
	scales: {
		x: {
			type: 'time',
			time: { unit: 'day', tooltipFormat: 'MMM d, yyyy' }
		}
	}
}
```

### Pie Chart with Legend

```typescript
options: {
	plugins: {
		legend: {
			position: 'bottom',
			labels: { usePointStyle: true, padding: 16 }
		}
	}
}
```

### Stacked Bar Chart

```typescript
options: {
	scales: {
		x: { stacked: true },
		y: { stacked: true }
	}
}
```

### Custom Tooltips

```typescript
options: {
	plugins: {
		tooltip: {
			callbacks: {
				label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y} tasks`,
				title: (ctx) => `Week ${ctx[0].label}`
			}
		}
	}
}
```

## Anti-Patterns

| Anti-pattern | Why it's wrong | Correct approach |
|---|---|---|
| Creating new `Chart` on every data render | Memory leak — old instance never destroyed | Create once, call `chart.data = ...` then `chart.update()` |
| Not destroying on unmount | Memory leak — chart lives after component removed | `return () => chart?.destroy()` in `$effect` cleanup |
| Rendering chart before canvas exists | Error — `getContext('2d')` on null | Guard with `if (!canvas) return` |
| Using `$derived` for chart config | `$derived` is reactive reads, not imperative writes | Use `$effect` + `chart.update()` |
| Forgetting `responsive: true` | Chart won't resize with container | Always set `responsive: true` |
| Using `chart.destroy()` then reusing canvas | Destroy also removes the canvas element | Set up a new canvas or call `chart.clear()` + `chart.resize()` instead |

## Quick Reference

| Task | Code |
|------|------|
| Create chart | `chart = new Chart(canvas.getContext('2d'), config)` |
| Destroy chart | `chart.destroy()` |
| Update data | `chart.data = newData; chart.update()` |
| Update options | `chart.options = newOptions; chart.update()` |
| Get computed style | `getComputedStyle(document.documentElement).getPropertyValue('--p')` |
| Responsive parent | `<div class="w-full h-64"><canvas /></div>` |
| Decimate large data | `plugins: { decimation: { enabled: true, algorithm: 'lttb' } }` |
| Date axis adapter | `npm install chartjs-adapter-date-fns` |

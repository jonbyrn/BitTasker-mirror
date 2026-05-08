---
name: sveltekit-data-flow
description: 'SvelteKit data flow guidance. Use for load functions, form actions, and data invalidation. Adapted for Capacitor client-only apps.'
---

# SvelteKit Data Flow (Capacitor Client-Only)

> **IMPORTANT:** This project uses Capacitor — all pages are client-side only (`export const ssr = false`). No server-side rendering. Use universal load functions (`+page.ts`), NOT server loads (`+page.server.ts`).

## Which File?

| Need                  | Use                                             |
| --------------------- | ----------------------------------------------- |
| Page data loading     | `+page.ts` (universal load)                     |
| Client-side API calls | `+page.ts` or component                         |
| Layout data           | `+layout.ts` (universal)                        |
| Never use             | `+page.server.ts`, `+layout.server.ts` (no SSR) |

## Load Functions

```typescript
// +page.ts — runs client-side only
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ url, fetch }) => {
	const id = url.searchParams.get('id');
	if (!id) throw error(400, 'Missing ID');

	const res = await fetch(`/api/data/${id}`);
	if (!res.ok) throw error(res.status, 'Failed to load');

	return { data: await res.json() };
};
```

## Form Handling

Forms use client-side actions. Since there's no SSR, form submissions are handled in components directly:

```svelte
<script>
	let submitting = $state(false);
	let error = $state(null);

	async function handleSubmit(event) {
		event.preventDefault();
		submitting = true;
		error = null;
		const formData = new FormData(event.target);
		try {
			const res = await fetch('/api/submit', { method: 'POST', body: formData });
			if (!res.ok) throw new Error(await res.text());
		} catch (e) {
			error = e.message;
		} finally {
			submitting = false;
		}
	}
</script>
```

## Key Rules

- **No `throw redirect()`** — redirects are done client-side via `goto()` from `$app/navigation`
- **No `fail()`** — that's server-only; handle validation errors in the component
- **Data loading is always `fetch()`-based** — no database connections from load functions
- **Use `invalidateAll()`** from `$app/navigation` to refresh data after mutations
- **Guard with `if (browser)`** — all svelte-i18n, Capacitor, and DOM access must be browser-guarded

---
name: sveltekit-structure
description: 'SvelteKit structure guidance. Use for routing, layouts, error handling. Adapted for Capacitor client-only apps.'
---

# SvelteKit Structure (Capacitor Client-Only)

## Quick Start

**File types:** `+page.svelte` (page) | `+layout.svelte` (wrapper) | `+error.svelte` (error boundary)

**Routes:** `src/routes/about/+page.svelte` → `/about` | `src/routes/tasks/[id]/+page.svelte` → `/tasks/123`

**Layouts:** Apply to all child routes. `+layout.svelte` at any level wraps descendants.

## Important: Client-Only

This project uses Capacitor. All routes are client-only:

```typescript
// Every +layout.ts and +page.ts must have:
export const ssr = false;
```

## Route Groups

```
src/routes/
├── +layout.svelte          # Root layout
├── +layout.ts              # Setup i18n, route translations
├── +page.svelte            # Homepage /
├── auth/+page.svelte       # /auth
├── (protected)/            # Group — doesn't affect URL
│   ├── +layout.svelte      # Auth guard layout
│   └── dashboard/+page.svelte  # /dashboard
├── services/
│   ├── +layout.svelte      # Services layout
│   └── [serviceId]/+page.svelte  # /services/123
└── tasks/
    ├── +layout.svelte      # Tasks layout
    └── +page.svelte         # /tasks
```

## Error Handling

- `+error.svelte` goes at the level above where errors should be caught
- Use `throw error(code, message)` in load functions
- Component-level errors use Svelte 5 `{#snippet}` or try/catch patterns

## Notes

- Layouts: `{@render children()}` not `<slot />`
- Groups: `(name)` folders don't affect URL path
- Client-only: always check `if (browser)` before DOM/Capacitor/i18n access

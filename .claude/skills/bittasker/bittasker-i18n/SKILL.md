---
name: bittasker-i18n
description: 'Use when adding user-facing strings, modifying locale files, or working with translations. Examples: adding UI text, fixing translations, creating new components with text, working with svelte-i18n.'
---

# i18n Workflow — BitTasker

App supports **en** and **es** via `svelte-i18n` v4. Translations load **lazily, per-route, from static files** — only 3 essential namespaces load at startup (`home`, `common`, `notifications`). Remaining namespaces are fetched on-demand when navigating to routes.

## Key Concepts

- Translation files: `static/locales/{en,es}/*.json` (42 files per locale)
- Root layout calls `setupI18n()` then `loadPageTranslations(url.pathname)` on every navigation
- `getNamespacesForRoute(route)` maps URL paths to namespace arrays; `loadRouteTranslations()` fetches only the needed files
- Fetches happen via `fetch(/locales/{locale}/{namespace}.json)` — files are served as static assets
- Namespaces are deduplicated: `loadedNamespaces` Map prevents re-fetching; `translationCache` caches parsed JSON
- JSON files are **deep-merged** into svelte-i18n's dictionary — keys add cumulatively, never overwrite
- Most JSON files have a top-level key matching their scope (e.g., `moderation.json` -> `{ "moderation": { ... } }`); some don't (`auth.json`, `home.json`)

## In Components

```svelte
import {t} from 'svelte-i18n'; // {$t('moderation.menu.report_user')}
// NOT $_() — that function does NOT exist in this codebase
```

## When Adding User-Facing Text

1. Identify the correct namespace JSON file based on the route/feature
2. Add the key-value pair to BOTH `static/locales/en/` and `static/locales/es/`
3. Use existing key structure as a template — follow the nesting pattern of the file you're editing
4. Use `import { t } from 'svelte-i18n'` and `$t('...')` in components — never `$_()`
5. Never hardcode user-visible strings in components

## Related Translation Systems (NOT i18n)

- `src/lib/stores/translation.store.ts` — machine translation of chat message content (separate from UI i18n)
- `src/lib/utils/serviceDisplayTranslation.ts` — user-generated Nostr content translation (service titles, descriptions)

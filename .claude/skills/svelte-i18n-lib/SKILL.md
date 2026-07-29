---
name: svelte-i18n-lib
description: 'Reference for the svelte-i18n library API used in this project. Covers $t(), interpolation, pluralization, browser guards, mock patterns, and locale file structure. Load this when writing or debugging any code that calls svelte-i18n functions.'
---

# svelte-i18n Library API — BitTasker

Reference for the `svelte-i18n` v4 library as used in this codebase. This skill covers the **library API**. For the project workflow (adding keys, route namespaces, running validation), load the `bittasker-i18n` skill.

## Import

```typescript
import { t } from 'svelte-i18n';
```

`t` is an exported Svelte store. Access it reactively in templates via the `$t` auto-subscription:

```svelte
{$t('common.status.open')}
```

**Only `t` is used in this codebase.** `$_()`, `$format()` do not exist and must never be imported.

---

## `$t()` — Translation Lookup

### Basic Usage

```svelte
{$t('common.status.open')}               <!-- "Open" for en -->
{$t('wallet.swap.swap_assets')}           <!-- nested key -->
```

### Key Format

Keys are dot-separated paths matching the JSON structure. The top-level key of each JSON file serves as the namespace (e.g., `moderation.json` → `{ "moderation": { ... } }` → use `$t('moderation.menu.report_user')`).

Files without a top-level wrapper key (notably `auth.json`, `home.json`) use flat keys directly:

```json
// home.json
{ "footer": { "company_name": "BitTasker" } }
```
```svelte
{$t('footer.company_name')}
```

### Missing Keys

When a key is not found in the loaded dictionary, svelte-i18n returns the key string itself as fallback. There is no error or crash — the user sees the raw key like `"moderation.menu.report_user"` in the UI. This is a visual bug in production. Run `scripts/find-missing-translations.py` to catch these before committing.

---

## Interpolation — `{ values: { ... } }`

Variables in locale JSON are placeholders delimited by `{` `}`:

```json
{ "moderation": { "menu": { "mute_user": "Mute {username}" } } }
```

In Svelte, pass values via `{ values: { key: value } }`:

```svelte
{$t('moderation.menu.mute_user', { values: { username: user.name } })}
```

```typescript
// In a script block or .ts file:
const label = $t('settings.devices.revokeAllModal.warning', { values: { count: otherDevices.length } });
```

**The `{ values: {} }` wrapper is mandatory.** Omitting it (e.g., `$t('greeting', { name: 'John' })`) will silently fail — the placeholder `{name}` appears as raw text instead of being replaced.

Multiple values are supported:

```svelte
{$t('debug.smart_contract.actions.error', { values: { error: errorMessage } })}
```

HTML interpolation: use `{@html}` when the translated string contains HTML tags:

```svelte
{@html $t('home.greeting.welcome', { values: { name: userName } })}
```

The JSON value would contain: `"Hi <strong>{name}</strong>, how are you?"`

---

## Pluralization — ICU Message Syntax

svelte-i18n supports ICU message syntax for plural-aware strings. Define plural rules in the locale JSON:

```json
{
  "services": {
    "showing_services": "Showing {count} service{count, plural, =1 {} other {s}}"
  }
}
```

Usage is the same as interpolation:

```svelte
{$t('services.showing_services', { values: { count: results.length } })}
```

For English (`=1 {} other {s}`), this produces "Showing 1 service" or "Showing 5 services".

Common pattern for separate one/other strings:

```json
{
  "reviews": {
    "banner_count_one": "You have {count} pending review",
    "banner_count_other": "You have {count} pending reviews"
  }
}
```

```typescript
const key = `reviews.banner_count_${count === 1 ? 'one' : 'other'}`;
const text = $t(key, { values: { count } });
```

---

## Reactive Locale Switching — `$locale`

The `locale` store from `svelte-i18n` holds the current language code (`'en'` or `'es'`):

```typescript
import { locale } from 'svelte-i18n';

// In $derived or reactive contexts:
const currentLocale = $derived($locale || 'en');

// Guard against null (SSR):
const lang = $locale || 'en';
```

`$locale` is `null` during SSR. Always fall back to `'en'` with `|| 'en'`.

### LanguageDropdown Component

`src/lib/components/LanguageDropdown.svelte` handles UI switching. It sets `locale` via:

```typescript
locale.set(code as SupportedLanguage);
```

Components rarely need to set `locale` themselves — use `LanguageDropdown` or the existing switcher infrastructure.

### Using with Intl APIs

This project does **not** use `$format()`. Date/number formatting uses browser `Intl` APIs directly with `$locale`:

```typescript
const fmt = new Intl.DateTimeFormat($locale || 'en', {
  month: 'long',
  year: 'numeric'
});
fmt.format(date);
```

---

## Browser Guard — MANDATORY

**Every file that imports from `svelte-i18n` must guard against server-side execution.** SvelteKit renders on both server and client. `svelte-i18n` stores throw or return `null` during SSR.

```typescript
import { browser } from '$app/environment';
import { t } from 'svelte-i18n';

// At the top of any function that uses $t:
if (!browser) return;
```

In `.svelte` template markup, `$t()` is safe because the template only renders client-side after mount. However, any `<script>` logic that dereferences `$t` or `$locale` must check `browser` first.

**Pattern from `src/lib/i18n/i18n.ts`:**
```typescript
if (!browser) return;
const translated = $t('wallet.swap.error.fee_fetch_failed');
```

---

## Locale File Structure

```
static/locales/
├── en/
│   ├── home.json                 # top-level keys: footer, hero, greeting...
│   ├── common.json               # top-level key: common
│   ├── auth.json                 # NO top-level wrapper — keys are flat
│   ├── dashboard/
│   │   ├── wallet.json            # top-level key: wallet
│   │   ├── bids.json              # top-level key: dashboard/bids
│   │   ├── dashboard.json         # top-level key: dashboard
│   │   ├── settings.json
│   │   ├── feedback.json
│   │   ├── tasks/
│   │   │   ├── find.json
│   │   │   ├── create.json
│   │   │   └── info.json
│   │   ├── services/
│   │   │   ├── browse.json
│   │   │   ├── create.json
│   │   │   ├── detail.json
│   │   │   └── my-services.json
│   │   └── profile/
│   │       ├── profile.json
│   │       ├── personal.json
│   │       └── availability.json
│   ├── reviews.json
│   ├── moderation.json
│   └── ...
└── es/
    └── ... (identical structure)
```

**Rules:**
- Every `.json` file in `en/` must have a matching file in `es/` with identical key structure
- Most files have a top-level key matching their namespace (e.g., `wallet.json` → `{ "wallet": { ... } }`)
- Exceptions: `auth.json`, `home.json` have no top-level wrapper — keys are flat
- Subdirectory structure in `static/locales/` maps to namespace grouping — a file at `static/locales/en/dashboard/tasks/create.json` with top-level key `"dashboard/tasks/create"` would use keys like `$t('dashboard/tasks/create.field_label')`
- Namespaces are loaded lazily via `src/lib/i18n/i18n.ts` — see `bittasker-i18n` skill for the loading mechanism

---

## Common Mistakes

| Mistake | Symptom | Fix |
|---|---|---|
| Using `$t()` outside `browser` guard | SSR crash / `locale` is null | Wrap in `if (browser)` or use `browser` guard at function top |
| Forgetting `{ values: {} }` wrapper | `{name}` appears as raw text in UI | Always use `$t('key', { values: { name } })` |
| Raw string where key is needed | Untranslated text in UI | NEVER write `$t('Some English text')` — always use a real key |
| Mismatched keys between en/es | Missing translation, raw key fallback | Run `python3 scripts/find-missing-translations.py --fix-suggestions` |
| Using `$_()` or non-existent functions | Import error | Only `t` and `locale` are exported from `svelte-i18n` in this codebase |
| Using `$format()` | Import error | Use `Intl.DateTimeFormat` / `Intl.NumberFormat` with `$locale` instead |
| Adding key to one locale only | One language works, other shows raw key | Always add to BOTH `en/` and `es/` files simultaneously |
| Key missing from loaded namespace | Raw key in UI for one route only | Check `src/lib/i18n/routeTranslations.ts` — the namespace may not be registered for that route |

---

## Testing — Mocking svelte-i18n in Vitest

### Standard Mock Pattern

```typescript
import { vi } from 'vitest';
import { readable } from 'svelte/store';

vi.mock('svelte-i18n', () => ({
  t: readable((key: string) => key),
  locale: readable('en')
}));
```

This returns keys as-is (no-op) and sets locale to `'en'`. This is the default pattern used in 100+ test files.

### With Specific Key Overrides

When a test needs specific translation output for a given key:

```typescript
vi.mock('svelte-i18n', () => {
  const { readable } = require('svelte/store');
  const t = readable((key: string) =>
    key === 'wallet.balance_history.error' ? 'Failed to load balance history' : key
  );
  return { t };
});
```

### Mocking `$lib/i18n/i18n`

Some tests mock the i18n setup module directly:

```typescript
vi.mock('$lib/i18n/i18n', () => ({
  setupI18n: vi.fn(),
  isI18nLoading: readable(false)
}));
```

### Mocking Route Translations

```typescript
vi.mock('$lib/i18n/routeTranslations', () => ({
  loadPageTranslations: vi.fn(),
  getNamespacesForRoute: vi.fn(() => [])
}));
```

### Test Setup Checklist

- [ ] Mock `svelte-i18n` with `t` + `locale` stores
- [ ] Mock `$lib/i18n/i18n` if component imports `setupI18n` or `isI18nLoading`
- [ ] Mock `$lib/i18n/routeTranslations` if component calls `loadPageTranslations`
- [ ] Mock `$lib/stores/translation.store` for Nostr content translation (separate system)
- [ ] Mock `$lib/services/translation.service` or `$lib/services/task-translation.service` for service/task translated content

---

## Pre-Commit Validation

Before every commit with i18n changes, run:

```bash
python3 scripts/find-missing-translations.py --fix-suggestions
```

This detects:
- Keys present in `en/` but missing in `es/` (and vice versa)
- Keys used in code but not present in locale files
- Keys in locale files never referenced in code

Fix all reported issues before committing. Never skip this step.

---

## Quick Reference

| Task | Code |
|---|---|
| Basic translation | `$t('namespace.section.key')` |
| With variable | `$t('namespace.key', { values: { name: val } })` |
| Plural via ICU | JSON: `"{count} item{count, plural, =1 {} other {s}}"` |
| Plural via key suffix | `$t(\`key_${n===1?'one':'other'}\`, { values: { count: n } })` |
| HTML interpolation | `{@html $t('key', { values: { name } })}` |
| Current locale | `$locale \|\| 'en'` |
| Date format | `new Intl.DateTimeFormat($locale \|\| 'en', opts).format(date)` |
| Number format | `new Intl.NumberFormat($locale \|\| 'en', opts).format(num)` |
| Browser guard | `if (!browser) return;` |
| Test mock (no-op) | `vi.mock('svelte-i18n', () => ({ t: readable((k:string) => k), locale: readable('en') }))` |
| Test mock (specific) | `const t = readable((k:string) => k === 'my.key' ? 'Custom' : k)` |
| Set locale | `locale.set('es')` |
| Validate before commit | `python3 scripts/find-missing-translations.py --fix-suggestions` |

# SEO Learn Section — Technical Architecture Audit

**Date:** 2026-06-22
**Auditor:** Kilo (Architecture Agent)
**Scope:** 10 files covering slug mapping, routing, content loading, i18n, and UI rendering

---

## Architecture Score: 52/100

The slug-map design and type system are solid. However, **two critical bugs** prevent any learn page from rendering, and **one critical routing mismatch** breaks all non-English URLs and all SEO metadata (hreflang, sitemap).

---

## CRITICAL Issues (3)

### C1. Pillar Page Content Import Path Mismatch
**Files:** `+page.ts` (line 23, 27), all `index.{locale}.ts` content files
**Impact:** 8 of 69 pages 404 at runtime

The dynamic import resolves `$lib/content/learn/${contentKey}.${locale}.ts`. For pillar pages (`wallet`, `security`, `freelancing`, `bitcoin`, `rootstock`, `bitcoin-freelancing`, `bitcoin-layer-2`, `future-of-work`), `contentKey` is just the category name (e.g. `wallet`). This resolves to `$lib/content/learn/wallet.en.ts`, but the actual file is `$lib/content/learn/wallet/index.en.ts`.

All 8 pillar pages fail: import → catch → fallback (same bad path) → catch → throw 404.

**Fix:** Change the import logic to try `index.{locale}.ts` as a fallback, or rename all `index.{locale}.ts` files to `{category}.{locale}.ts`.

Preferred fix (add index fallback in `+page.ts`):
```ts
try {
    contentModule = await import(`$lib/content/learn/${contentKey}.${pageLocale}.ts`);
} catch {
    // Try index file for pillar pages
    try {
        contentModule = await import(`$lib/content/learn/${contentKey}/index.${pageLocale}.ts`);
    } catch {
        // Fallback to English index
        try {
            contentModule = await import(`$lib/content/learn/${contentKey}/index.en.ts`);
        } catch {
            throw error(404, { message: `Content not found for: ${contentKey} (${pageLocale})` });
        }
    }
}
```

### C2. Locale Prefix Routing Mismatch (hreflang + sitemap)
**Files:** `slug-map.ts` (`getHreflangLinks`, `getSitemapUrls`), `locale.ts`
**Impact:** All hreflang links and sitemap URLs point to non-existent routes

The param matcher in `locale.ts` validates `['en', 'es']` — meaning URLs must use `/en/` and `/es/` prefixes. But `getHreflangLinks()` generates URLs with `/learn/` (English) and `/aprende/` (Spanish) prefixes:

```ts
// slug-map.ts line 151-153
{ lang: 'en', href: `${baseUrl}/learn/${paths.en}/` },   // /learn/wallet/
{ lang: 'es', href: `${baseUrl}/aprende/${paths.es}/` },  // /aprende/billetera/
```

When a crawler follows `/aprende/billetera/`:
1. `[[locale=locale]]` tries to match `aprende` → param matcher rejects it (not `en`/`es`)
2. `[...slug]` captures `aprende/billetera`
3. `resolveContentKey('en', 'aprende/billetera')` → null → 404

**All Spanish hreflang URLs are broken. All English `/learn/` hreflang URLs are also broken.**

**Fix — Two options:**

**Option A (recommended): Change param matcher to accept `learn`/`aprende`:**
```ts
// locale.ts
const SUPPORTED_LOCALES = ['learn', 'aprende'] as const;

export const match: ParamMatcher = (param) => {
    return SUPPORTED_LOCALES.includes(param as (typeof SUPPORTED_LOCALES)[number]);
};
```
Then update `+page.ts` to map `learn` → `en` and `aprende` → `es`:
```ts
const localeMap: Record<string, string> = { learn: 'en', aprende: 'es' };
const pageLocale = localeMap[params.locale ?? 'learn'] ?? 'en';
```

**Option B: Change hreflang/sitemap to use `/en/` and `/es/`:**
```ts
// slug-map.ts
{ lang: 'en', href: `${baseUrl}/en/${paths.en}/` },
{ lang: 'es', href: `${baseUrl}/es/${paths.es}/` },
{ lang: 'x-default', href: `${baseUrl}/en/${paths.en}/` }
```
But this gives non-semantic URLs (`/en/bitcoin-layer-2/rootstock/` vs `/aprende/bitcoin-capa-2/rootstock/`).

### C3. Hub Page `href` Links Use Wrong Locale Prefix
**File:** `learn/+page.svelte` (lines 12-55)
**Impact:** All 8 category cards link to English-only URLs, even when user is on Spanish

All hardcoded `href` values use `/learn/...` prefix. If the user is on `/aprende/`, clicking a category card navigates to an English URL. The href values should be locale-aware or derive from the slug map.

**Fix:** Import `getSlug` or `SLUG_MAP` and generate locale-aware links:
```ts
import { getSlug } from '$lib/content/learn/slug-map';
// Use getSlug('wallet/best-bitcoin-wallet', $locale === 'es' ? 'es' : 'en')
```

---

## HIGH Issues (2)

### H1. Breadcrumbs Not Reactive
**File:** `+page.svelte` (line 8)

```ts
let breadcrumbs = $derived(() => { ... });
```

In Svelte 5, `$derived(expression)` treats the entire expression as the derived value. Since the expression IS an arrow function literal, `breadcrumbs` is set to the function itself (not its return value). The reactive dependencies inside the function body are NOT tracked by `$derived`.

**Fix:** Use `$derived.by()`:
```ts
let breadcrumbs = $derived.by(() => {
    const parts = data.contentKey.split('/');
    const crumbs = [{ label: 'Home', href: '/' }, { label: 'Learn', href: '/learn/' }];
    if (parts.length > 1) {
        const pillarName = parts[0].replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
        const prefix = data.locale === 'es' ? 'aprende' : 'learn';
        crumbs.push({ label: pillarName, href: `/${prefix}/${parts[0]}/` });
    }
    return crumbs;
});
```
And change template from `breadcrumbs()` to `breadcrumbs`.

### H2. i18n Namespace Check May Not Match for `/en/` Prefix URLs
**File:** `i18n.ts` (line 285)

```ts
if (route.startsWith('/learn') || route.startsWith('/aprende')) {
    namespaces.push('learn');
}
```

If the actual URL scheme uses `/en/` and `/es/` prefixes (per current param matcher), individual learn page routes like `/en/wallet/` never match this check. The `learn` namespace is only loaded for the static `/learn/` hub page.

Individual learn pages don't currently use `$t()` (all text comes from content files), so this doesn't cause a visible bug yet. But if `LearnPageLayout` starts using `$t()` for section headers (see M1), this will break.

**Fix:** Also match locale-prefixed routes:
```ts
if (route.startsWith('/learn') || route.startsWith('/aprende') ||
    /\/(en|es)\/(wallet|security|freelancing|bitcoin|rootstock|bitcoin-layer-2|future-of-work|bitcoin-freelancing)/.test(route)) {
    namespaces.push('learn');
}
```

---

## MEDIUM Issues (4)

### M1. Hardcoded English Strings in LearnPageLayout
**File:** `LearnPageLayout.svelte` (lines 128, 137, 165, 185)

These strings are not translated:
- `"Browse All Topics"` → should use `$t('learn.browse_all')`
- `"Frequently Asked Questions"` → should use `$t('learn.frequently_asked')`
- `"Related Topics"` → should use `$t('learn.related_topics')`
- `"Last updated:"` → should use `$t('learn.last_updated')`

The translation keys exist in both `en/learn.json` and `es/learn.json` but are unused.

**Fix:** Import `$t` from `svelte-i18n` and replace hardcoded strings.

### M2. Hub Page Category Descriptions Hardcoded in English
**File:** `learn/+page.svelte` (lines 12-55)

All 8 category `description` fields are English-only strings. No translation keys exist for these descriptions in `learn.json`.

**Fix:** Add description keys to `learn.json` (e.g. `category_wallets_description`) and use `$t()`.

### M3. `datePublished` / `dateModified` Use Current Timestamp
**File:** `+page.ts` (lines 63-64)

```ts
datePublished: new Date().toISOString(),
dateModified: new Date().toISOString()
```

These generate a new timestamp on every build/render. For pre-rendered static pages, this means every page rebuild updates these dates, which is incorrect and confuses search engines.

**Fix:** Use a static date from the content file, or derive from file modification time. At minimum, `dateModified` should be stable.

### M4. `LearnPageSeo.jsonLd` Loses Type Safety
**File:** `learn.ts` (line 48)

```ts
jsonLd: Record<string, unknown>;
```

The JSON-LD is constructed as a specific `Article` schema in `+page.ts` but typed as an opaque record. This prevents compile-time verification of required schema.org properties.

**Fix:** Define a proper `ArticleSchema` interface:
```ts
interface ArticleSchema {
    '@context': string;
    '@type': 'Article';
    headline: string;
    description: string;
    url: string;
    publisher: { '@type': 'Organization'; name: string; url: string };
    datePublished: string;
    dateModified: string;
}
```

---

## LOW Issues (5)

### L1. Hub Page Prop Naming Confusion
**File:** `learn/+page.svelte` (line 5)

```ts
let { data: seo } = $props();
```

The prop is renamed from `data` to `seo`, but it contains the full page data object (title, description, canonical, etc.), not just SEO data. This is misleading.

**Fix:** Keep the name `data` or rename to something descriptive like `pageData`.

### L2. Duplicate JSON Keys in home.json
**Files:** `en/home.json`, `es/home.json`

Both files have duplicate keys in the `navbar` section:
- `my_account` appears at lines 59 and 71 (en), lines 59 and 70 (es)
- `profile` appears at lines 60 and 72 (en), lines 60 and 71 (es)
- `language` appears at lines 67-70 and 90-93 (en), lines 66-69 and 88-91 (es)

JSON allows duplicate keys but the second value silently overwrites the first. This is a data quality issue.

### L3. LearnHub Uses Static Category Links
**File:** `learn/+page.svelte`

The `categories` array is defined inside the component with hardcoded English-only `href` values. These don't adapt to the user's locale.

### L4. `resolveContentKey` O(n) Linear Scan
**File:** `slug-map.ts` (lines 126-131)

The function iterates all entries on every call. For 69 entries this is negligible, but a reverse map (`Map<string, string>`) would be O(1).

### L5. `LearnPageLayout` "Browse All Topics" Links to English-Only `/learn`
**File:** `LearnPageLayout.svelte` (line 128)

```svelte
<a href="/learn" class="btn btn-outline btn-lg">Browse All Topics</a>
```

This is hardcoded to `/learn` regardless of locale. Spanish users should see `/aprende`.

---

## Cross-Reference: Slug Map vs Content Files

| Category | Slug Map Entries | Content Files (.en.ts) | Content Files (.es.ts) | Status |
|----------|:---:|:---:|:---:|--------|
| Pillar pages (8) | 8 | 8 `index.*.ts` | 8 `index.*.ts` | ✅ Files exist, ❌ Import path broken (C1) |
| Wallet sub-pages (16) | 16 | 16 | 16 | ✅ All present |
| Security sub-pages (5) | 5 | 5 | 5 | ✅ All present |
| Freelancing sub-pages (11) | 11 | 11 | 11 | ✅ All present |
| Bitcoin Freelancing (6) | 6 | 6 | 6 | ✅ All present |
| Bitcoin sub-pages (6) | 6 | 6 | 6 | ✅ All present |
| Rootstock sub-pages (7) | 7 | 7 | 7 | ✅ All present |
| Bitcoin Layer 2 (5) | 5 | 5 | 5 | ✅ All present |
| Future of Work (5) | 5 | 5 | 5 | ✅ All present |
| **Total** | **69** | **69** | **69** | **All files present** |

No duplicate `en` or `es` values detected across slug-map entries.

---

## Checklist Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| Every entry has `en` + `es` | ✅ PASS | All 69 entries verified |
| No duplicate `en` values | ✅ PASS | All unique |
| No duplicate `es` values | ✅ PASS | All unique |
| 69+ entries present | ⚠️ 69 | Exactly 69 (not 72+) — audit target was 72+ |
| `resolveContentKey()` works | ⚠️ PARTIAL | Works for sub-pages, fails if locale prefix mismatch (C2) |
| `getAllEntries()` count | ✅ PASS | Returns 138 entries (69 × 2 locales) |
| `getHreflangLinks()` valid URLs | ❌ FAIL | URLs use `/learn/` and `/aprende/` but routing requires `/en/` and `/es/` (C2) |
| `[[locale=locale]]` validates | ⚠️ PARTIAL | Validates `en`/`es` correctly, but comment says `learn`/`aprende` |
| `+layout.ts` prerender + ssr | ✅ PASS | Both `true` |
| `entries()` generates all entries | ✅ PASS | Delegates to `getAllEntries()` |
| `+page.ts` resolves content key | ⚠️ PARTIAL | Works for sub-pages, broken for pillar pages (C1) |
| `+page.ts` handles missing content | ✅ PASS | Throws 404 with descriptive message |
| Hub route doesn't conflict | ✅ PASS | Static `/learn/` route takes priority over dynamic catch-all |
| Dynamic import matches file structure | ❌ FAIL | Pillar pages use `index.*.ts` but import expects flat path (C1) |
| Fallback to English works | ⚠️ PARTIAL | Fallback chain exists but same bad path for pillar pages |
| Type safety — no `any` | ✅ PASS | No `any` types in critical paths |
| `LearnPageContent` matches exports | ✅ PASS | Content files export `{ content: LearnPageContent }` |
| Return type matches `LearnPageData` | ✅ PASS | Load function returns correct shape |
| `getNamespacesForRoute` includes `learn` | ⚠️ PARTIAL | Only matches `/learn` and `/aprende` prefixes, not locale-prefixed routes |
| `learn.json` exists + valid JSON | ✅ PASS | Both en/es exist with matching keys |
| Footer/navbar i18n keys exist | ✅ PASS | `footer.learn_*` and `navbar.learn` keys present |

---

## Summary

| Severity | Count | Issues |
|----------|:-----:|--------|
| CRITICAL | 3 | C1 (import path), C2 (hreflang routing), C3 (hub links) |
| HIGH | 2 | H1 (breadcrumbs reactivity), H2 (i18n namespace) |
| MEDIUM | 4 | M1 (hardcoded strings), M2 (hub descriptions), M3 (date timestamps), M4 (jsonLd types) |
| LOW | 5 | L1-L5 (naming, duplicates, locale links, perf, hardcoded href) |
| **Total** | **14** | |

**Architecture Score: 52/100**

The foundation (slug-map design, type system, prerender config) is well-architected. The two critical bugs (import path mismatch and locale prefix routing) prevent the system from functioning. Once C1 and C2 are fixed, the score would rise to ~85/100.

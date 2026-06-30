# SEO Content Plan Audit — BitTasker `/learn/` Section

**Plan file audited**: `requirements/seo-content-plan.md`  
**Audit date**: 2026-06-22  
**Auditor**: Architect Agent  
**Overall Architecture Score**: 62/100

---

## Executive Summary

The content plan is well-researched from a keyword and content strategy perspective (72 pages, 8 pillars, strong keyword targeting). However, it has **3 critical technical issues** that will prevent it from working as designed:

1. `ssr = false` in root layout makes prerendering produce empty pages
2. Spanish `/aprende/` locale routing has no implementation path in current architecture
3. Duplicate slugs across pillars will cause SEO content cannibalization

---

## Critical Issues (3)

### CRITICAL-1: `ssr = false` Incompatible with `prerender = true`

**Location**: `src/routes/+layout.ts` lines 13-15

Root layout sets `prerender = true` but also `ssr = false`. SvelteKit prerendering requires SSR to render page content at build time. With `ssr = false`, the 72+ `/learn/` pages will be empty HTML shells — Google will index nothing.

**Fix**: Create `src/routes/(company)/learn/+layout.ts` with `export const ssr = true; export const prerender = true;` to override root only for learn pages. Alternatively, move learn to a dedicated `(learn)` route group.

### CRITICAL-2: Spanish `/aprende/` Route Not Implementable

**Location**: Plan Section 2 (URL Strategy) and Section 3 (Localization)

The plan proposes `/learn/` → `/aprende/` with localized slugs. The current app uses `svelte-i18n` for client-side locale detection (preference → browser locale → fallback). There is NO URL-based locale routing. The plan's `getLocaleFromUrl(url)` function does not exist.

**Fix**: Choose one: (A) Create a separate `src/routes/(company)/aprende/` route tree with mirrored Spanish content (simpler, more files), or (B) Add dynamic `[locale]` route parameter with redirect middleware (elegant, more work).

### CRITICAL-3: Duplicate Slugs → Content Cannibalization

**Location**: Plan Sections 5, 8, 9, 11

| Duplicate | Pillar 1 | Pillar 2 |
|---|---|---|
| `bitcoin-escrow` | `/learn/bitcoin-freelancing/` | `/learn/bitcoin/` |
| `lightning-network` | `/learn/bitcoin/` | `/learn/bitcoin-layer-2/` |

Two pages targeting the same keyword = neither ranks. 

**Fix**: One canonical page per topic. Other pillar links to it as cross-pillar reference. Keep `bitcoin-escrow` under `bitcoin-freelancing/`, keep `lightning-network` under `bitcoin/`.

---

## High Issues (5)

### HIGH-1: No Learn-Specific Layout

The `(company)` route group has no `+layout.svelte` — all pages inherit root layout. Learn pages need: breadcrumbs, pillar sidebar nav, related pages component. Without a dedicated layout, these must be duplicated in every page.

**Fix**: Create `src/routes/(company)/learn/+layout.svelte` with shared learn chrome.

### HIGH-2: Sitemap Priorities Inverted

Plan assigns hub page `0.9` and pillar pages `0.8`. This inverts the hierarchy. Pillar pages are the authority; hub is a navigation page.

**Fix**: Pillar pages `0.9`, hub `0.8`, branded conversion pages `0.9`, deep-dive `0.7`.

### HIGH-3: JSON-LD Schema Plan Incomplete

Missing: `ItemList` for pillar pages, `HowTo` for setup guides, `SoftwareApplication` for wallet comparisons. No `datePublished`/`dateModified` maintenance strategy.

### HIGH-4: Cross-Pillar Linking Critically Thin

Only 9 cross-pillar links defined for 72+ pages (~12% coverage). Future of Work pillar is completely isolated. Rootstock pillar has no links to Bitcoin Layer 2 despite being one.

**Fix**: Minimum 3-4 cross-pillar links per page. Create linking matrix.

### HIGH-5: `(company)` Route Group Semantically Wrong

Adding 72+ educational content pages to a group containing `/terms`, `/privacy`, `/about` dilutes semantics and complicates maintenance. Build time impact with 72+ additional pages.

**Fix**: Create dedicated `(learn)` route group.

---

## Medium Issues (5)

1. **No `robots.txt`/`noindex` strategy** for low-value pages (KD < 5, volume < 200/mo)
2. **Missing canonical URL strategy** — trailing slash inconsistency (existing pages use no trailing slash, plan shows trailing slashes)
3. **i18n namespace collision** — `route.includes('/learn')` matches too broadly; use `route.startsWith`
4. **Content file proliferation** — 288+ files (144 content + 72 svelte + 72 page.ts). Consider JSON/MD content files with a build-time loader
5. **Missing OG image strategy** — no default, per-pillar, or per-page OG images specified

---

## Low Issues (3)

1. **Pillar 4/5 overlap** — "Bitcoin Freelancing" and "Bitcoin & Payments" both cover escrow, payments, getting paid in Bitcoin
2. **Future of Work pillar** is weak thought-leadership with poor conversion intent; deprioritize
3. **Missing breadcrumb component** — plan mentions JSON-LD breadcrumbs but no visible breadcrumb UI

---

## Score Breakdown

| Dimension | Score | Notes |
|---|---|---|
| URL Structure | 70% | Logical hierarchy but trailing slash inconsistency, `/aprende/` unimplementable |
| Internal Linking | 40% | Hub-and-spoke sound in theory; cross-pillar links critically thin |
| Technical Architecture | 35% | SSR/prerender conflict fatal; no learn layout; wrong route group |
| Sitemap & JSON-LD | 55% | Priorities inverted; missing schema types; no OG strategy |
| Information Architecture | 75% | 8 pillars mostly logical; some overlap; Future of Work weak |
| Localization | 25% | No implementation path for URL-based locale routing |
| Implementation Feasibility | 50% | Phase plan reasonable but built on broken technical assumptions |

**Overall: 62/100**

---

## Recommended Fix Priority

1. Fix SSR/prerender conflict — add `+layout.ts` with `ssr = true`
2. Resolve duplicate slugs — pick canonical page per topic
3. Decide locale routing strategy — separate route tree vs dynamic parameter
4. Create dedicated `(learn)` route group with own layout
5. Expand cross-pillar linking — 3-4 cross-links per page minimum
6. Fix sitemap priorities — pillars > hub, branded > generic
7. Add missing JSON-LD schemas — ItemList, HowTo, SoftwareApplication
8. Define OG image strategy — per-pillar templates

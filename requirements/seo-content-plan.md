# BitTasker SEO Content Plan — `/learn/` Section

> **Status**: REVISED — Post-swarm audit (Architect 62% → fixed, Reviewer 85% → fixed, Designer 76% → fixed)  
> **Created**: 2026-06-22  
> **Scope**: Content hub for organic search traffic targeting wallet, gig economy, Bitcoin, and trust keywords  
> **Total Pages**: ~72 content pages + 1 hub across 8 pillars, localized en/es  

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Architecture & URL Strategy](#2-architecture--url-strategy)
3. [Localization Strategy](#3-localization-strategy)
4. [Page Template & SEO Pattern](#4-page-template--seo-pattern)
5. [Pillar 1: Wallets](#5-pillar-1-wallets)
6. [Pillar 2: Security & Trust](#6-pillar-2-security--trust)
7. [Pillar 3: Gig Economy Comparisons](#7-pillar-3-gig-economy-comparisons)
8. [Pillar 4: Bitcoin Freelancing](#8-pillar-4-bitcoin-freelancing)
9. [Pillar 5: Bitcoin & Payments](#9-pillar-5-bitcoin--payments)
10. [Pillar 6: Rootstock](#10-pillar-6-rootstock)
11. [Pillar 7: Bitcoin Layer 2s](#11-pillar-7-bitcoin-layer-2s)
12. [Pillar 8: Future of Work](#12-pillar-8-future-of-work)
13. [Navigation & Menu Integration](#13-navigation--menu-integration)
14. [Internal Linking Strategy](#14-internal-linking-strategy)
15. [Sitemap & Technical SEO](#15-sitemap--technical-seo)
16. [Implementation Phases](#16-implementation-phases)
17. [Success Metrics](#17-success-metrics)
18. [Appendix: Wallet Research Data](#18-appendix-wallet-research-data)

---

## 1. Executive Summary

BitTasker will create a `/learn/` content hub — a publicly accessible, pre-rendered, SEO-optimized section of the site targeting high-value keywords across wallet comparisons, gig economy platforms, Bitcoin payments, and trust/safety content. The section is organized into 8 topic pillars with ~72 pages total, each localized for English and Spanish.

**Why `/learn/` and not a blog**: Evergreen topic-organized content beats chronological posts for SEO. A `/learn/` section signals educational authority, enables topic clusters that build topical relevance, and avoids content aging.

**Key opportunity**: The gig economy comparison pillar (Upwork alternatives, Fiverr alternatives) represents the largest untapped traffic source with 15-30K monthly searches at KD 5-30. The hardware wallet deep-dive pillar (Coldcard, Foundation Passport, BitBox) captures Bitcoin maximalists actively researching self-custody. The El Salvador / Latin America angle (Aqua, Blink wallets) targets an underserved Spanish-speaking audience.

---

## 2. Architecture & URL Strategy

### Route Structure

All `/learn/` pages live under the `(company)` route group using a **single dynamic route** with an optional locale prefix. No file duplication for localization.

```
src/routes/(company)/
├── [[locale=locale]]/
│   └── [...slug]/
│       ├── +page.svelte          ← ONE component handles all pages + locales
│       ├── +page.ts              ← Loads content from locale-specific files
│       └── +layout.ts            ← ssr=true, prerender=true, entries()
```

Content lives in locale-specific data files (separate from routes):

```
src/lib/content/learn/
├── slug-map.ts                   ← Maps content keys → en/es URL paths
├── wallet/
│   ├── coldcard.en.ts            ← English content
│   ├── coldcard.es.ts            ← Spanish content
│   ├── foundation-passport.en.ts
│   ├── foundation-passport.es.ts
│   ├── bitbox.en.ts
│   ├── bitbox.es.ts
│   ├── aqua-wallet.en.ts
│   ├── aqua-wallet.es.ts
│   ├── blink-wallet.en.ts
│   ├── blink-wallet.es.ts
│   ├── ledger-vs-trezor.en.ts
│   ├── ledger-vs-trezor.es.ts
│   ├── best-bitcoin-wallet.en.ts
│   └── ...
├── security/
│   ├── is-bittasker-safe.en.ts
│   └── ...
├── freelancing/
│   ├── upwork-alternatives.en.ts
│   └── ...
├── bitcoin-freelancing/
├── bitcoin/
├── rootstock/
├── bitcoin-layer-2/
└── future-of-work/
```

**Total files**: ~145 content files (72 topics × 2 locales + slug-map.ts) + 3 route files = **148 files**
**vs. separate route trees**: 72 en routes + 72 es routes + 144 content files = **288 files**

The slug-map.ts file maps canonical content keys to locale-specific URL paths:

```typescript
// src/lib/content/learn/slug-map.ts
export const SLUG_MAP: Record<string, { en: string; es: string }> = {
  // Wallets — Hardware
  'wallet/coldcard':              { en: 'wallet/coldcard',              es: 'billetera/coldcard' },
  'wallet/foundation-passport':   { en: 'wallet/foundation-passport',   es: 'billetera/foundation-passport' },
  'wallet/bitbox':                { en: 'wallet/bitbox',                es: 'billetera/bitbox' },
  // Wallets — Software
  'wallet/aqua-wallet':           { en: 'wallet/aqua-wallet',           es: 'billetera/aqua-wallet' },
  'wallet/blink-wallet':          { en: 'wallet/blink-wallet',          es: 'billetera/blink-wallet' },
  // Comparisons
  'wallet/ledger-vs-trezor':      { en: 'wallet/ledger-vs-trezor',      es: 'billetera/ledger-vs-trezor' },
  'wallet/best-bitcoin-wallet':   { en: 'wallet/best-bitcoin-wallet',   es: 'billetera/mejor-billetera-bitcoin' },
  'freelancing/upwork-alternatives': { en: 'freelancing/upwork-alternatives', es: 'freelance/alternativas-a-upwork' },
  // ... all 72 pages
};

// Reverse lookup: URL path → content key
export function resolveContentKey(locale: string, slug: string): string | null {
  for (const [key, paths] of Object.entries(SLUG_MAP)) {
    if (paths[locale as 'en' | 'es'] === slug) return key;
  }
  return null;
}

// Generate hreflang links for a given content key + current locale
export function getHreflangLinks(contentKey: string, baseUrl: string) {
  const paths = SLUG_MAP[contentKey];
  if (!paths) return [];
  return [
    { lang: 'en', href: `${baseUrl}/learn/${paths.en}/` },
    { lang: 'es', href: `${baseUrl}/aprende/${paths.es}/` },
    { lang: 'x-default', href: `${baseUrl}/learn/${paths.en}/` }
  ];
}
```
│   ├── what-is-rootstock/
│   ├── rootstock-vs-stacks/
│   ├── bitcoin-smart-contracts/
│   ├── bitcoin-defi/
│   ├── rootstock-vs-ethereum/
│   ├── bittasker-escrow-contracts/
│   └── rbtc-guide/
│
├── bitcoin-layer-2/
│   ├── +page.svelte                ← Pillar: Bitcoin Layer 2s
│   ├── lightning-network/
│   ├── rootstock/
│   ├── stacks/
│   ├── liquid-network/
│   ├── comparison-table/
│   └── bittasker-multi-chain/
│
└── future-of-work/
    ├── +page.svelte                ← Pillar: Future of Work
    ├── decentralized-labor/
    ├── gig-economy-2026/
    ├── nostr-marketplace/
    ├── censorship-resistant-work/
    └── peer-to-peer-economy/
```

### URL Pattern

- **English (default)**: `/learn/wallet/coldcard/`
- **Spanish**: `/aprende/billetera/coldcard/` (localized slugs)
- **hreflang tags** link the two versions

**Implementation — Single Route Tree with Optional Locale Prefix**

Use a single `[[locale=locale]]` optional route parameter. One route tree handles both `/learn/...` and `/aprende/...`. No file duplication.

```
src/routes/(company)/[[locale=locale]]/[...slug]/
├── +page.svelte          ← ONE component, renders content for any locale
├── +page.ts              ← Loads locale-specific SEO metadata
└── +layout.ts            ← ssr=true, prerender=true
```

The `locale` param matcher validates `en` (→ `/learn/...`) or `es` (→ `/aprende/...`). When absent, defaults to `en`.

**Slug mapping** — a single lookup table maps canonical content keys to locale-specific URL paths:

```typescript
// src/lib/content/learn/slug-map.ts
export const SLUG_MAP: Record<string, { en: string; es: string }> = {
  'wallet/coldcard':        { en: 'wallet/coldcard',       es: 'billetera/coldcard' },
  'wallet/ledger-vs-trezor':{ en: 'wallet/ledger-vs-trezor', es: 'billetera/ledger-vs-trezor' },
  'freelancing/upwork-alternatives': { en: 'freelancing/upwork-alternatives', es: 'freelance/alternativas-a-upwork' },
  // ... all 72 pages
};

// Reverse lookup: URL path → content key
export function resolveContentKey(locale: string, slug: string): string | null {
  for (const [key, paths] of Object.entries(SLUG_MAP)) {
    if (paths[locale as 'en' | 'es'] === slug) return key;
  }
  return null;
}
```

**How it works**:

1. User visits `/aprende/billetera/coldcard/`
2. SvelteKit matches `[[locale=es]]` + `[...slug=billetera/coldcard]`
3. `+page.ts` calls `resolveContentKey('es', 'billetera/coldcard')` → returns `'wallet/coldcard'`
4. Loads content for `'wallet/coldcard'` from `src/lib/content/learn/wallet/coldcard.es.ts`
5. Sets `locale.set('es')` so UI chrome also renders in Spanish
6. Returns SEO metadata (title, description, JSON-LD) in Spanish

**Advantages over separate route trees**:
- **72 content files** (one per topic, with `.en.ts` + `.es.ts` variants) + **1 route** = 73 files total
- vs. separate route tree: 72 English routes + 72 Spanish routes + 72 content files = 216 files
- Content changes require editing one file, not two routes
- New pages: add one entry to `SLUG_MAP` + one content file, not two route directories

**Prerendering**: The `+layout.ts` exports `entries()` returning all locale+slug combinations:

```typescript
export function entries() {
  return Object.entries(SLUG_MAP).flatMap(([key, paths]) => [
    { locale: 'en', slug: paths.en },
    { locale: 'es', slug: paths.es }
  ]);
}
```

This generates 144 pre-rendered pages (72 en + 72 es) from a single route tree.

**hreflang**: Each page auto-generates hreflang tags from the `SLUG_MAP`:

```html
<link rel="alternate" hreflang="en" href="https://bittasker.com/learn/wallet/coldcard/" />
<link rel="alternate" hreflang="es" href="https://bittasker.com/aprende/billetera/coldcard/" />
<link rel="alternate" hreflang="x-default" href="https://bittasker.com/learn/wallet/coldcard/" />
```

**Locale bridge**: `+page.ts` calls `locale.set('es')` when the URL prefix is `/aprende/`, ensuring UI chrome (nav, footer, CTAs) matches the page content. This fixes the split-brain issue.

**Fallback**: If the user's stored preference is `es` and they visit `/learn/wallet/coldcard/` (English URL), show a subtle banner: "Leer en español → /aprende/billetera/coldcard/" linking to the Spanish equivalent.

**Slug translation table** (pillar-level prefixes):
| English prefix | Spanish prefix | Rationale |
|---|---|---|
| `/learn/` | `/aprende/` | Direct translation |
| `wallet/` | `billetera/` | Spanish keyword for wallet |
| `security/` | `seguridad/` | Direct translation |
| `freelancing/` | `freelance/` | Loan word, widely used |
| `bitcoin/` | `bitcoin/` | Universal |
| `rootstock/` | `rootstock/` | Brand name |
| `bitcoin-freelancing/` | `freelance-bitcoin/` | Spanish word order |
| `bitcoin-layer-2/` | `bitcoin-capa-2/` | Technical translation |
| `future-of-work/` | `futuro-del-trabajo/` | Direct translation |

---

## 3. Localization Strategy

### Approach

BitTasker supports `en` and `es` via `svelte-i18n`. The `/learn/` section uses the same localization infrastructure:

1. **UI chrome** (nav, footer, buttons, CTAs): Translated via existing `svelte-i18n` JSON files
2. **Page content**: Stored in locale-specific TypeScript files (`*.en.ts` / `*.es.ts`), loaded by the `+page.ts` load function based on URL locale
3. **SEO metadata** (title, description, OG tags, JSON-LD): Per-locale in the `+page.ts` load function
4. **URL-based locale**: The `[[locale=locale]]` route param determines which language to render — NOT the user's stored preference

### Content File Structure

```
src/lib/content/learn/
├── slug-map.ts                          ← URL path → content key mapping
├── wallet/
│   ├── coldcard.en.ts                   ← English content
│   ├── coldcard.es.ts                   ← Spanish content
│   ├── ledger-vs-trezor.en.ts
│   ├── ledger-vs-trezor.es.ts
│   └── ...
├── freelancing/
│   ├── upwork-alternatives.en.ts
│   ├── upwork-alternatives.es.ts
│   └── ...
└── ...
```

Each content file exports a typed content object:

```typescript
// src/lib/content/learn/wallet/coldcard.en.ts
import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
  hero: {
    title: 'Coldcard: Bitcoin-Only Hardware Wallet Guide',
    subtitle: 'The most trusted air-gapped signing device for Bitcoin'
  },
  answerBlock: 'Coldcard is a Bitcoin-only hardware wallet made by Coinkite since 2017...',
  sections: [
    { heading: 'Why Coldcard?', body: '...' },
    { heading: 'Security Features', body: '...' },
    // ...
  ],
  faq: [
    { question: 'Is Coldcard open source?', answer: 'Yes...' },
    // ...
  ],
  bitTaskerCta: {
    heading: 'Connect Coldcard to BitTasker',
    body: 'Use your Coldcard with Sparrow wallet to receive task payments...',
    buttonText: 'Get Started',
    buttonHref: '/auth/signup'
  }
};
```

### How Content Loading Works

```typescript
// +page.ts
export async function load({ params }) {
  const locale = params.locale || 'en';
  const contentKey = resolveContentKey(locale, params.slug);
  
  // Load locale-specific content
  const contentModule = await import(`$lib/content/learn/${contentKey}.${locale}.ts`);
  
  // Set svelte-i18n locale to match URL
  locale.set(locale as SupportedLanguage);
  
  return {
    content: contentModule.content,
    locale,
    // SEO metadata from content or separate SEO file
    title: contentModule.content.hero.title,
    description: contentModule.content.answerBlock.slice(0, 155),
    // ...
  };
}
```

```svelte
<!-- +page.svelte — ONE component, renders any locale -->
<script lang="ts">
  let { data } = $props();
</script>

<svelte:head>
  <title>{data.title}</title>
  <meta name="description" content={data.description} />
  <!-- hreflang auto-generated from SLUG_MAP -->
  {#each data.hreflangLinks as link}
    <link rel="alternate" hreflang={link.lang} href={link.href} />
  {/each}
</svelte:head>

<!-- Content renders from data.content, already in correct locale -->
<section class="hero bg-base-100 text-base-content min-h-[60vh] pb-12">
  <div class="hero-content flex-col text-center">
    <Logo />
    <h1>{data.content.hero.title}</h1>
    <p>{data.content.hero.subtitle}</p>
  </div>
</section>
<!-- ... rest of template uses data.content.* ... -->
```

### hreflang Implementation

Auto-generated from `SLUG_MAP` in `+page.ts`. Each page outputs:

```html
<link rel="alternate" hreflang="en" href="https://bittasker.com/learn/{en_slug}" />
<link rel="alternate" hreflang="es" href="https://bittasker.com/aprende/{es_slug}" />
<link rel="alternate" hreflang="x-default" href="https://bittasker.com/learn/{en_slug}" />
```

### Locale Detection Flow

1. User visits `/learn/wallet/coldcard/` → `locale='en'`, renders English
2. User visits `/aprende/billetera/coldcard/` → `locale='es'`, renders Spanish
3. `+page.ts` calls `locale.set(params.locale)` to sync svelte-i18n with URL
4. UI chrome (nav, footer, CTAs) renders in the same language as page content
5. No split-brain: URL is the single source of truth for locale

---

## 4. Page Template & SEO Pattern

Every `/learn/` page follows the same template, consistent with existing company pages like `/how-it-works` and `/security`.

### Template Structure

Every `/learn/` page follows the same template, consistent with existing company pages like `/how-it-works` and `/security`.

**IMPORTANT**: Unlike existing company pages which use `$t()` for all content, `/learn/` pages use locale-specific content files (`.en.ts` / `.es.ts`) because article content (2000+ words) is too large for i18n JSON. Only UI chrome (nav, footer, CTAs, breadcrumbs) uses `$t()`.

```
┌─────────────────────────────────────────────┐
│ <svelte:head>                               │
│   - Title tag (keyword first, ≤58 chars)    │
│   - Meta description (≤155 chars, keyword)  │
│   - Canonical URL (no trailing slash)       │
│   - OG tags (title, description, image)     │
│   - Twitter card tags                       │
│   - hreflang tags (en/es) — only when both  │
│     language versions exist                 │
│   - JSON-LD (Article + FAQ schemas)         │
│ </svelte:head>                              │
├─────────────────────────────────────────────┤
│ Breadcrumbs (between TopBar and hero)       │
│   - daisyUI breadcrumbs component           │
│   - Home → Learn → [Category] → [Page]     │
│   - JSON-LD BreadcrumbList                  │
├─────────────────────────────────────────────┤
│ Hero Section (matches /how-it-works pattern)│
│   - <Logo /> component                      │
│   - H1 (primary keyword)                    │
│   - Subtitle (value proposition)            │
│   - Last Updated date (near hero)           │
│   - Classes: hero bg-base-100 text-base-    │
│     content min-h-[60vh] pb-12              │
│   - hero-content flex-col text-center       │
├─────────────────────────────────────────────┤
│ Answer Block (first 200 words)              │
│   - bg-base-200 rounded-box p-6 card        │
│   - Direct answer to primary query          │
│   - Key facts, numbers                      │
│   - AI Overview optimization                │
├─────────────────────────────────────────────┤
│ Main Content Sections                       │
│   - H2s mirror user questions               │
│   - Comparison tables (daisyUI table-zebra) │
│   - Feature lists, specs                    │
│   - Screenshots / images (optimized)        │
├─────────────────────────────────────────────┤
│ BitTasker Integration CTA                   │
│   - bg-base-200 full-width wrapper          │
│   - Reuses existing CTA i18n keys           │
│   - "Try BitTasker" + "Learn More" buttons  │
├─────────────────────────────────────────────┤
│ FAQ Section                                 │
│   - 5-8 questions with answers              │
│   - JSON-LD FAQPage schema                  │
│   - daisyUI collapse (standalone pattern,   │
│     matching /security/ page)               │
│   - At least 2 high-intent questions        │
│     (price, buy, compatibility) per page    │
│   - Max 1 BitTasker-pitch FAQ per pillar    │
├─────────────────────────────────────────────┤
│ Related Pages                               │
│   - 3-column card grid (sm:grid-cols-2      │
│     lg:grid-cols-3)                         │
│   - Links to 3-5 related /learn/ pages      │
│   - Minimum 3-4 cross-pillar links per page │
├─────────────────────────────────────────────┤
│ Last Updated Date                           │
│   - Visible "Updated: June 2026"            │
│   - Signals freshness to AI engines         │
│   - Also visible near hero (not just bottom)│
└─────────────────────────────────────────────┘
```
┌─────────────────────────────────────────────┐
│ <svelte:head>                               │
│   - Title tag (keyword first, brand last)   │
│   - Meta description (155 chars, keyword)   │
│   - Canonical URL                           │
│   - OG tags (title, description, image)     │
│   - Twitter card tags                       │
│   - hreflang tags (en/es)                   │
│   - JSON-LD (Article + FAQ schemas)         │
│ </svelte:head>                              │
├─────────────────────────────────────────────┤
│ Hero Section                                │
│   - H1 (primary keyword)                    │
│   - Subtitle (value proposition)            │
│   - Breadcrumbs (JSON-LD BreadcrumbList)    │
├─────────────────────────────────────────────┤
│ Answer Block (first 200 words)              │
│   - Direct answer to primary query          │
│   - Key facts, numbers                      │
│   - AI Overview optimization                │
├─────────────────────────────────────────────┤
│ Main Content Sections                       │
│   - H2s mirror user questions               │
│   - Comparison tables (for "vs" pages)      │
│   - Feature lists, specs                    │
│   - Screenshots / images (optimized)        │
├─────────────────────────────────────────────┤
│ BitTasker Integration                       │
│   - How this topic relates to BitTasker     │
│   - Product feature callout                 │
│   - CTA: "Try BitTasker" button             │
├─────────────────────────────────────────────┤
│ FAQ Section                                 │
│   - 5-8 questions with answers              │
│   - JSON-LD FAQPage schema                  │
│   - Visible Q&A cards (daisyUI collapse)    │
├─────────────────────────────────────────────┤
│ Related Pages                               │
│   - Links to 3-5 related /learn/ pages      │
│   - Internal link cluster                   │
├─────────────────────────────────────────────┤
│ Last Updated Date                           │
│   - Visible "Updated: June 2026"            │
│   - Signals freshness to AI engines         │
└─────────────────────────────────────────────┘
```

### JSON-LD Schemas (per page)

1. **Article** — type, headline, description, author (BitTasker), datePublished, dateModified, publisher
2. **FAQPage** — list of Question/Answer pairs
3. **BreadcrumbList** — Home → Learn → [Category] → [Page]
4. **Organization** — inherited from root layout (already present)

### Reusable Component

Create a `LearnPageLayout.svelte` wrapper component:

```svelte
<!-- src/lib/components/learn/LearnPageLayout.svelte -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { t } from 'svelte-i18n';
  
  let {
    title,
    subtitle,
    breadcrumbs,
    faq,
    relatedPages,
    lastUpdated,
    locale = 'en',
    children
  }: {
    title: string;
    subtitle: string;
    breadcrumbs: Array<{ label: string; href: string }>;
    faq?: Array<{ question: string; answer: string }>;
    relatedPages?: Array<{ title: string; href: string; description: string }>;
    lastUpdated: string;
    locale?: 'en' | 'es';
    children: Snippet;
  } = $props();
</script>
```

---

## 5. Pillar 1: Wallets

### Wallet Deep-Dive Pages (Hardware)

#### Coldcard (Coinkite)

**Target keywords**: coldcard wallet, coldcard review, coldcard vs trezor, coldcard mk4, coldcard q, bitcoin-only hardware wallet, air-gapped bitcoin wallet, coldcard setup

| Keyword | Est. Vol/mo | Est. KD |
|---|---|---|
| coldcard | 5,000-8,000 | 30-50 |
| coldcard wallet | 2,000-4,000 | 20-40 |
| coldcard review | 500-1,000 | 15-25 |
| coldcard vs trezor | 200-500 | 5-15 |
| coldcard vs ledger | 200-500 | 5-15 |
| bitcoin-only hardware wallet | 500-1,000 | 10-20 |
| air-gapped bitcoin wallet | 200-500 | 5-15 |

**Page**: `/learn/wallet/coldcard/`

**Content angle**: Coldcard is the gold standard for Bitcoin-only, air-gapped security. Key differentiators:
- **Dual secure elements** from different vendors (Microchip ATECC608 + Maxim DS28C36B) — no single point of failure
- **Fully air-gapped** lifecycle — MicroSD, NFC, QR codes via PSBT (BIP174)
- **Open source firmware** — verifiable, reproducible builds
- **Trick PIN features** — duress PIN, brick PIN, BIP39 passphrases, countdown to brick
- **Clear case** — physical tamper detection
- **No companion app required** — works with Sparrow, Electrum, or standalone
- **Models**: Q (QWERTY keyboard, QR scanner, battery) vs Mk5 (numeric keypad, slim)

**BitTasker connection**: Coldcard users are self-custody maximalists. CTA: "Connect your Coldcard to BitTasker via Sparrow wallet for secure task escrow payments."

**FAQ schema questions**:
1. Is Coldcard open source?
2. How does Coldcard work without connecting to a computer?
3. Coldcard vs Trezor: which is more secure?
4. Can Coldcard be used with BitTasker?
5. What happens if I forget my Coldcard PIN?

---

#### Foundation Passport

**Target keywords**: foundation passport, passport prime, foundation passport review, passport hardware wallet, passport vs coldcard, foundation devices wallet

| Keyword | Est. Vol/mo | Est. KD |
|---|---|---|
| foundation passport | 1,000-3,000 | 20-40 |
| passport prime | 500-1,500 | 15-30 |
| passport vs coldcard | 100-300 | 5-15 |
| foundation devices | 300-800 | 15-25 |

**Page**: `/learn/wallet/foundation-passport/`

**Content angle**: Passport Prime is the premium Bitcoin hardware wallet with the broadest feature set. Key differentiators:
- **3.5" IPS Gorilla Glass touchscreen** — largest screen of any Bitcoin hardware wallet
- **KeyOS microkernel** — Rust-based OS with app sandboxing, process isolation
- **QuantumLink** — post-quantum encrypted Bluetooth (separate dedicated chip)
- **NFC Keycards** — encrypted backup cards with Faraday sleeves
- **Vault app** — 50GB encrypted file storage on-device
- **2FA + FIDO** — TOTP codes and security keys alongside Bitcoin
- **$349 price point** — premium positioning
- **Assembled in USA** in ITAR facility
- **Third-party audited** by Keylabs
- **Open source** hardware + software

**BitTasker connection**: Passport users value security across their entire digital life. CTA: "Your Passport secures your Bitcoin. BitTasker secures your work payments with Bitcoin escrow."

---

#### BitBox02 (Shift Crypto)

**Target keywords**: bitbox02, bitbox wallet, bitbox02 review, bitbox vs ledger, bitbox vs trezor, swiss bitcoin wallet, bitbox02 bitcoin-only

| Keyword | Est. Vol/mo | Est. KD |
|---|---|---|
| bitbox02 | 2,000-4,000 | 25-40 |
| bitbox wallet | 500-1,500 | 15-30 |
| bitbox02 review | 200-500 | 10-20 |
| bitbox vs ledger | 100-300 | 5-15 |
| bitbox vs trezor | 100-300 | 5-15 |
| swiss bitcoin wallet | 100-300 | 10-20 |

**Page**: `/learn/wallet/bitbox/`

**Content angle**: BitBox02 is the Swiss-engineered wallet that balances security with usability. Key differentiators:
- **Swiss made** by Shift Crypto AG
- **Dual chip design** with EAL6+ certified secure element (Nova model)
- **Bitcoin-only edition** — reduced attack surface
- **microSD backup** — instant backup and restore
- **Touch sensors** — no physical buttons, capacitive slide/hold gestures
- **Open source firmware** — independently audited
- **BitBoxApp** — companion app for desktop + Android (+ iPhone/iPad via Bluetooth on Nova)
- **BitBox02 Nova** — Bluetooth for iOS, glass OLED display, new secure chip
- **Multi-coin support** available (BTC, ETH, LTC, ADA + 1500+ ERC20)
- **WalletConnect** for DeFi

**BitTasker connection**: BitBox users value clean UX and security. CTA: "BitBox02 protects your keys. BitTasker protects your freelance payments."

---

### Wallet Deep-Dive Pages (Software)

#### Aqua Wallet (JAN3)

**Target keywords**: aqua wallet, aqua bitcoin wallet, JAN3 wallet, liquid network wallet, bitcoin stablecoin wallet, USDt bitcoin wallet, aqua wallet review

| Keyword | Est. Vol/mo | Est. KD |
|---|---|---|
| aqua wallet | 500-1,500 | 10-25 |
| aqua bitcoin wallet | 100-300 | 5-15 |
| liquid network wallet | 200-500 | 10-20 |
| bitcoin stablecoin wallet | 100-300 | 5-10 |

**Page**: `/learn/wallet/aqua-wallet/`

**Content angle**: Aqua is the everyday Bitcoin and stablecoin wallet built for the real world. Key features:
- **Self-custodial** — you hold your keys
- **Bitcoin + Lightning + Liquid** — three networks in one app
- **Native Tether USDt on Liquid** — stablecoin spending alongside BTC savings
- **No KYC** — download and use immediately
- **Built by JAN3** (Samson Mow's company) — Bitcoin infrastructure focus
- **Multiple wallets in one app** — separate savings from spending
- **Mobile-first** — iOS and Android
- **El Salvador relevance** — Liquid Network's USDt enables dollar-stable spending in a Bitcoin economy

**BitTasker connection**: Aqua is used in El Salvador for everyday purchases. CTA: "Get paid for BitTasker tasks in Bitcoin, spend with Aqua."

**El Salvador angle**: Aqua wallet + BitTasker = earn Bitcoin for tasks, spend with USDt stability. Target Spanish keywords: "billetera bitcoin el salvador", "billetera estable bitcoin", "aqua wallet español".

---

#### Blink Wallet (formerly Bitcoin Beach Wallet)

**Target keywords**: blink wallet, bitcoin beach wallet, blink bitcoin wallet, blink lightning wallet, el salvador bitcoin wallet, blink wallet review, galoy wallet

| Keyword | Est. Vol/mo | Est. KD |
|---|---|---|
| blink wallet | 500-1,000 | 10-20 |
| bitcoin beach wallet | 200-500 | 10-15 |
| blink bitcoin wallet | 100-300 | 5-10 |
| el salvador bitcoin wallet | 100-200 | 5-10 |

**Page**: `/learn/wallet/blink-wallet/`

**Content angle**: Blink is the Lightning-first wallet born in El Salvador's Bitcoin Beach. Key features:
- **Born in El Zonte, El Salvador** (2020) — the Bitcoin Beach experiment
- **Lightning-first** — instant, low-fee transactions
- **Dollar balance** — USD-equivalent balance for price stability
- **Merchant tools** — POS-ready for businesses
- **Community-driven** — built with input from local merchants
- **Open source** — Galoy framework
- **Multi-language** — EN, ES, FR, DE, TR, BR
- **Vouchers** — Bitcoin voucher system for onboarding
- **Circles** — community groups for shared Bitcoin economies
- **API** — developer-friendly for integrations
- **Custodial model** — simpler UX for beginners (trade-off vs self-custody)

**BitTasker connection**: Blink proves Bitcoin works for everyday commerce in developing economies. CTA: "BitTasker + Blink = earn Bitcoin for tasks, spend instantly at any Lightning merchant."

**El Salvador angle**: This is THE wallet for El Salvador Bitcoin adoption. Target Spanish: "billetera bitcoin el salvador", "blink wallet bitcoin beach", "pagar con bitcoin el salvador".

---

### Comparison Pages

| Page | Primary Keyword | Est. Vol/mo | Est. KD |
|---|---|---|---|
| `/learn/wallet/ledger-vs-trezor/` | ledger vs trezor | 500-800 | 3-5 |
| `/learn/wallet/best-bitcoin-wallet/` | best bitcoin wallet | 1,000-3,000 | 30-50 |
| `/learn/wallet/hardware-vs-software/` | hardware vs software wallet | 300-800 | 10-20 |
| `/learn/wallet/lightning-wallet/` | best lightning wallet | 500-1,000 | 15-25 |
| `/learn/wallet/coldcard-vs-trezor/` | coldcard vs trezor | 200-500 | 5-15 |
| `/learn/wallet/coldcard-vs-ledger/` | coldcard vs ledger | 200-500 | 5-15 |
| `/learn/wallet/passport-vs-coldcard/` | passport vs coldcard | 100-300 | 5-15 |
| `/learn/wallet/bitbox-vs-ledger/` | bitbox vs ledger | 100-300 | 5-15 |

### Education Pages

| Page | Primary Keyword | Est. Vol/mo | Est. KD |
|---|---|---|---|
| `/learn/wallet/self-custody-guide/` | self custody bitcoin guide | 300-800 | 10-20 |
| `/learn/wallet/nostr-wallet-connect/` | nostr wallet connect | 200-500 | 5-10 |
| `/learn/wallet/bittasker-wallet/` | bittasker wallet | branded | n/a |

---

## 6. Pillar 2: Security & Trust

| Page | Primary Keyword | Est. Vol/mo | Est. KD |
|---|---|---|---|
| `/learn/security/` | bitcoin wallet security | 300-800 | 15-30 |
| `/learn/security/is-bittasker-safe/` | is bittasker safe | branded | 1-5 |
| `/learn/security/wallet-security/` | bitcoin wallet security best practices | 200-500 | 10-20 |
| `/learn/security/avoid-scams/` | how to spot bitcoin scammer | 600 | 76 |
| `/learn/security/self-custody-vs-custodial/` | self custody vs custodial wallet | 200-500 | 5-15 |
| `/learn/security/hardware-security/` | hardware wallet security | 300-500 | 10-20 |

---

## 7. Pillar 3: Gig Economy Comparisons

| Page | Primary Keyword | Est. Vol/mo | Est. KD |
|---|---|---|---|
| `/learn/freelancing/` | best freelance platforms | 2,000-5,000 | 20-40 |
| `/learn/freelancing/upwork-alternatives/` | upwork alternatives | 5,000-10,000 | 15-30 |
| `/learn/freelancing/fiverr-alternatives/` | fiverr alternatives | 3,000-5,000 | 15-25 |
| `/learn/freelancing/upwork-vs-fiverr/` | upwork vs fiverr | 3,000-5,000 | 5-15 |
| `/learn/freelancing/best-freelance-platforms/` | best freelance platforms 2026 | 2,000-5,000 | 20-40 |
| `/learn/freelancing/thumbtack-alternatives/` | thumbtack alternatives | 1,000-3,000 | 10-20 |
| `/learn/freelancing/freelancer-vs-upwork/` | freelancer vs upwork | 1,000-2,000 | 5-15 |
| `/learn/freelancing/upwork-fees-explained/` | upwork fees | 1,000-3,000 | 10-20 |
| `/learn/freelancing/fiverr-fees-explained/` | fiverr fees | 1,000-2,000 | 10-15 |
| `/learn/freelancing/bittasker-vs-upwork/` | bittasker vs upwork | branded | 1-5 |
| `/learn/freelancing/bittasker-vs-fiverr/` | bittasker vs fiverr | branded | 1-5 |
| `/learn/freelancing/decentralized-freelancing/` | decentralized freelancing | 100-300 | 5-10 |

---

## 8. Pillar 4: Bitcoin Freelancing

| Page | Primary Keyword | Est. Vol/mo | Est. KD |
|---|---|---|---|
| `/learn/bitcoin-freelancing/` | bitcoin freelancer | 200-500 | 5-15 |
| `/learn/bitcoin-freelancing/get-paid-in-bitcoin/` | get paid in bitcoin | 500-1,500 | 10-20 |
| `/learn/bitcoin-freelancing/bitcoin-jobs/` | bitcoin jobs | 1,000-3,000 | 20-40 |
| `/learn/bitcoin-freelancing/bitcoin-escrow/` | bitcoin escrow service | 200-500 | 5-15 |
| `/learn/bitcoin-freelancing/crypto-payroll/` | crypto payroll | 200-500 | 10-20 |
| `/learn/bitcoin-freelancing/bitcoin-contractor-guide/` | bitcoin 1099 contractor | 100-300 | 5-10 |
| `/learn/bitcoin-freelancing/bittasker-bitcoin-payments/` | bittasker bitcoin payments | branded | n/a |

---

## 9. Pillar 5: Bitcoin & Payments

| Page | Primary Keyword | Est. Vol/mo | Est. KD |
|---|---|---|---|
| `/learn/bitcoin/` | bitcoin payments | 1,000-3,000 | 20-40 |
| `/learn/bitcoin/lightning-network/` | lightning network explained | 500-1,500 | 20-30 |
| `/learn/bitcoin/smart-contracts/` | bitcoin smart contracts | 1,000-3,000 | 30-50 |
| `/learn/bitcoin/nostr-identity/` | what is nostr | 1,000-3,000 | 20-40 |
| `/learn/bitcoin/bitcoin-vs-ethereum/` | bitcoin vs ethereum | 2,000-5,000 | 30-50 |
| `/learn/bitcoin/stablecoins/` | what is a stablecoin | 13,000 | 61 |
| `/learn/bitcoin/bittasker-payments/` | bittasker payments | branded | n/a |

---

## 10. Pillar 6: Rootstock

| Page | Primary Keyword | Est. Vol/mo | Est. KD |
|---|---|---|---|
| `/learn/rootstock/` | rootstock bitcoin | 1,000-3,000 | 20-40 |
| `/learn/rootstock/what-is-rootstock/` | what is rootstock | 500-1,500 | 15-30 |
| `/learn/rootstock/rootstock-vs-stacks/` | rootstock vs stacks | 100-300 | 5-15 |
| `/learn/rootstock/bitcoin-smart-contracts/` | bitcoin smart contracts | 1,000-3,000 | 30-50 |
| `/learn/rootstock/bitcoin-defi/` | bitcoin defi | 500-1,500 | 20-40 |
| `/learn/rootstock/rootstock-vs-ethereum/` | rootstock vs ethereum | 100-300 | 5-15 |
| `/learn/rootstock/bittasker-escrow-contracts/` | bittasker escrow | branded | n/a |
| `/learn/rootstock/rbtc-guide/` | how to get rbtc | 100-300 | 5-15 |

---

## 11. Pillar 7: Bitcoin Layer 2s

| Page | Primary Keyword | Est. Vol/mo | Est. KD |
|---|---|---|---|
| `/learn/bitcoin-layer-2/` | bitcoin layer 2 | 2,000-5,000 | 30-50 |
| `/learn/bitcoin-layer-2/lightning-network/` | — | — | Cross-links to `/learn/bitcoin/lightning-network/` (no duplicate page) |
| `/learn/bitcoin-layer-2/rootstock/` | rootstock | 1,000-3,000 | 20-40 |
| `/learn/bitcoin-layer-2/stacks/` | stacks bitcoin | 1,000-3,000 | 20-40 |
| `/learn/bitcoin-layer-2/liquid-network/` | liquid network | 500-1,500 | 15-30 |
| `/learn/bitcoin-layer-2/comparison-table/` | best bitcoin layer 2 | 500-1,500 | 20-40 |
| `/learn/bitcoin-layer-2/bittasker-multi-chain/` | bittasker multi chain | branded | n/a |

---

## 12. Pillar 8: Future of Work

| Page | Primary Keyword | Est. Vol/mo | Est. KD |
|---|---|---|---|
| `/learn/future-of-work/` | future of work | 5,000-15,000 | 50-70 |
| `/learn/future-of-work/decentralized-labor/` | decentralized work | 100-300 | 5-15 |
| `/learn/future-of-work/gig-economy-2026/` | gig economy statistics 2026 | 1,000-3,000 | 20-40 |
| `/learn/future-of-work/nostr-marketplace/` | nostr marketplace | 100-300 | 5-10 |
| `/learn/future-of-work/censorship-resistant-work/` | censorship resistant marketplace | 50-150 | 3-8 |
| `/learn/future-of-work/peer-to-peer-economy/` | peer-to-peer marketplace | 300-800 | 15-30 |

---

## 13. Navigation & Menu Integration

### Logged-Out TopBar (Desktop)

**Problem**: Adding "Learn" as a 5th item creates 6 total items in the nav (How It Works standalone + 4 dropdowns + Learn dropdown). At 1024px (`lg:` breakpoint) with Spanish locale (20-40% longer strings), this overflows.

**Solution**: Merge "How It Works" into the "Learn" dropdown as the first item. This keeps the total at 5 items (4 dropdowns + 1 standalone):

```
For Taskers ▾ │ For Taskees ▾ │ Company ▾ │ Learn ▾
                                     │ ├── How It Works
                                     │ ├── 🪪 Wallets — Compare bitcoin wallets
                                     │ ├── 💼 Freelancing — Upwork, Fiverr alternatives
                                     │ ├── ₿ Bitcoin & Payments — How bitcoin works
                                     │ ├── 🔒 Security & Trust — Protect your crypto
                                     │ └── View all topics → /learn/
```

This also solves the "How It Works" placement — it's now discoverable in the Learn context where it belongs.

Add to `LOGGED_OUT_MENU_SECTIONS` in `src/lib/utils/constants/menu.constants.ts`. Remove the standalone "How It Works" entry from `TopBar.svelte` line 267-271.

### Logged-In TopBar (Desktop)

**Problem**: Adding 4 Learn items to "Support & Help" (which already has 8 items) creates a 12-item dropdown. The `MenuItem` interface has no separator/header type.

**Solution**: Add only 2 items to "Support & Help" (not 4), and add a separator type to `MenuItem`:

1. Add `type?: 'separator' | 'header'` to the `MenuItem` interface in `menu.constants.ts`
2. Add a `── Learn ──` header item + 2 learn items to "Support & Help":

```
Support & Help ▾
├── ... (existing 8 items)
├── ────── (separator)
├── 📚 Learn: All Topics → /learn/
└── 🪪 Learn: Wallet Guide → /learn/wallet/
```

This adds only 3 entries (separator + 2 items) instead of 4, keeping the dropdown at 11 items — still manageable.

### Footer

**Do NOT add a 5th column** — it breaks the `lg:grid-cols-4` grid. Instead, add a "Learn" section as a new row below the existing 4 columns:

```
┌──────────┬──────────┬──────────┬──────────┐
│ Company  │For Taskers│For Taskees│ Company  │
│ (existing)│(existing) │(existing) │(existing)│
└──────────┴──────────┴──────────┴──────────┘
┌──────────────────────────────────────────────┐
│ Popular Topics (new row, full width)         │
│ Wallet Guide · Ledger vs Trezor · Upwork    │
│ Alternatives · Lightning Network · Security  │
└──────────────────────────────────────────────┘
```

Implementation: Add a new `div` after the existing 4-column grid, using `grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-6` with 6 compact link items. Update `BitTaskerFooter.svelte`.

### Mobile

**BottomNavBar**: No change (already full with 5 items).

**Mobile drawer** (`MOBILE_DRAWER_LOGGED_IN`): Add a "Learn" section before the logout item:
- `Learn: Wallets` → `/learn/wallet/`
- `Learn: All Topics` → `/learn/`

**Logged-out mobile drawer**: Create a `MOBILE_DRAWER_LOGGED_OUT` menu constant with:
- `How It Works` → `/how-it-works/`
- `Learn` → `/learn/`
- `Login` → `/auth/login`
- `Sign Up` → `/auth/signup`

**Footer link**: `/learn/` hub accessible from all public pages via the new footer row.

**In-content cross-links**: Add learn links on existing pages:
- `/how-it-works` → `/learn/wallet/bittasker-wallet/`
- `/secure-payments` → `/learn/rootstock/bittasker-escrow-contracts/`
- `/security` → `/learn/security/`
- `/faq` → `/learn/` hub

---

## 14. Internal Linking Strategy

### Hub-and-Spoke Model

Each pillar page acts as a hub linking to all its child pages. Each child page links back to its pillar and to 2-3 sibling pages.

### Cross-Pillar Links

Every page must have **minimum 3-4 cross-pillar links**. The following matrix defines the canonical cross-references:

| From Pillar | To Pillar | Link Pattern |
|---|---|---|
| Wallets (hardware) | Security | "hardware wallet security best practices" → `/learn/security/hardware-security/` |
| Wallets (hardware) | Rootstock | "Bitcoin smart contract wallets" → `/learn/rootstock/` |
| Wallets (software: Aqua/Blink) | Bitcoin Freelancing | "get paid in Bitcoin" → `/learn/bitcoin-freelancing/get-paid-in-bitcoin/` |
| Wallets (software: Blink) | Future of Work | "Nostr-powered marketplaces" → `/learn/future-of-work/nostr-marketplace/` |
| Wallets (all) | Gig Economy | "earn Bitcoin for freelance work" → `/learn/freelancing/` |
| Security | Wallets | "secure hardware wallets" → `/learn/wallet/` |
| Security | Rootstock | "smart contract escrow" → `/learn/rootstock/bittasker-escrow-contracts/` |
| Gig Economy | Bitcoin Freelancing | "get paid in Bitcoin instead" → `/learn/bitcoin-freelancing/` |
| Gig Economy | Security | "protect your freelance earnings" → `/learn/security/` |
| Gig Economy | Future of Work | "future of decentralized work" → `/learn/future-of-work/` |
| Bitcoin Freelancing | Gig Economy | "compare freelance platforms" → `/learn/freelancing/` |
| Bitcoin Freelancing | Wallets | "set up a Bitcoin wallet" → `/learn/wallet/` |
| Bitcoin Freelancing | Rootstock | "Bitcoin escrow for freelancers" → `/learn/rootstock/` |
| Bitcoin & Payments | Rootstock | "smart contracts on Bitcoin" → `/learn/rootstock/` |
| Bitcoin & Payments | Bitcoin Layer 2 | "Bitcoin scaling solutions" → `/learn/bitcoin-layer-2/` |
| Bitcoin & Payments | Wallets | "Lightning wallets" → `/learn/wallet/lightning-wallet/` |
| Rootstock | Bitcoin & Payments | "Bitcoin payments explained" → `/learn/bitcoin/` |
| Rootstock | Bitcoin Layer 2 | "Bitcoin Layer 2 ecosystem" → `/learn/bitcoin-layer-2/` |
| Rootstock | Security | "smart contract security" → `/learn/security/` |
| Bitcoin Layer 2 | Rootstock | "Rootstock" → `/learn/rootstock/` |
| Bitcoin Layer 2 | Bitcoin & Payments | "Lightning Network" → `/learn/bitcoin/lightning-network/` |
| Future of Work | Gig Economy | "freelance platform comparisons" → `/learn/freelancing/` |
| Future of Work | Bitcoin Freelancing | "earn Bitcoin" → `/learn/bitcoin-freelancing/` |

### Existing Page Links (Add to Existing Pages)

| Existing Page | Links To |
|---|---|
| `/how-it-works` | `/learn/wallet/bittasker-wallet/` |
| `/secure-payments` | `/learn/rootstock/bittasker-escrow-contracts/` |
| `/security` | `/learn/security/` |
| `/faq` | `/learn/` hub |
| Footer | `/learn/` hub |

---

## 15. Sitemap & Technical SEO

### Sitemap Updates

Add all `/learn/` and `/aprende/` routes to:
1. `sitemap.config.js` — `additionalPaths` array
2. `static/sitemap.xml` — regenerate

Priority assignment:
- Pillar pages (authority hubs): `0.9`
- High-value comparison pages (ledger-vs-trezor, upwork-alternatives): `0.9`
- Branded conversion pages (is-bittasker-safe, bittasker-vs-upwork): `0.9`
- Deep-dive wallet/education pages: `0.7`
- Hub page (navigation only): `0.8`

### SiteNavigationElement JSON-LD Update

Add `/learn/` to `BITTASKER_SITE_NAVIGATION_JSONLD` in `src/lib/utils/constants/seo.constants.ts`.

### Route Namespace Registration

Add `/learn` route to `getNamespacesForRoute()` in `src/lib/i18n/i18n.ts`:

```typescript
if (route.startsWith('/learn')) {
  namespaces.push('learn');
}
if (route.startsWith('/aprende')) {
  namespaces.push('learn'); // Same namespace, content is in locale-specific files
}
```

Create new i18n namespace file: `static/locales/en/learn.json` and `static/locales/es/learn.json` for UI chrome translations (nav labels, CTAs, breadcrumbs — NOT page content).

### OG Image Strategy

Each pillar has a default OG image. Pages within a pillar inherit the pillar image unless overridden.

| Pillar | OG Image Path | Style |
|---|---|---|
| Hub | `/og-images/learn-hub.png` | 8-category grid visual |
| Wallets | `/og-images/learn-wallet.png` | Hardware wallet lineup |
| Security | `/og-images/learn-security.png` | Shield + lock icon |
| Freelancing | `/og-images/learn-freelancing.png` | Platform comparison visual |
| Bitcoin Freelancing | `/og-images/learn-btc-freelancing.png` | Bitcoin + work icons |
| Bitcoin & Payments | `/og-images/learn-bitcoin.png` | Lightning + Bitcoin |
| Rootstock | `/og-images/learn-rootstock.png` | Smart contract + Bitcoin |
| Bitcoin Layer 2 | `/og-images/learn-btc-l2.png` | Layer stack visual |
| Future of Work | `/og-images/learn-future.png` | Decentralized network |

All OG images: 1200×630px, WebP format, with pillar title text overlay. Generate via static assets or a build-time script.

### Additional JSON-LD Schemas

Beyond Article and FAQPage, add these schemas where applicable:

- **ItemList** — Pillar pages listing child pages (e.g., Wallet pillar lists all wallet review pages)
- **HowTo** — Setup guides (Coldcard setup, Blink wallet setup)
- **SoftwareApplication** — Wallet review pages (type: "MobileApplication" or "DesktopApplication")
- **Product** — Hardware wallet pages with price, brand, availability
- **CompareAction** — Comparison pages (non-standard but supported by Google)

### Content Freshness Strategy

- **Quarterly review calendar**: Every page reviewed at least once per quarter
- **Pillar ownership**: Assign a content owner per pillar
- **dateModified**: Update JSON-LD `dateModified` when content changes
- **Automated alerts**: Monitor wallet firmware updates, fee changes, competitor feature launches via RSS/newsletter subscriptions

### Pre-rendering

All `/learn/` pages are pre-rendered at build time. The root layout has `prerender = true` but also `ssr = false` — prerendering requires SSR. **The `/learn/` route group must override both settings**:

```typescript
// src/routes/(company)/[[locale=locale]]/[...slug]/+layout.ts
import { SLUG_MAP } from '$lib/content/learn/slug-map';

export const prerender = true;
export const ssr = true;

export function entries() {
  // Generate all locale + slug combinations for prerendering
  return Object.entries(SLUG_MAP).flatMap(([key, paths]) => [
    { locale: 'en', slug: paths.en },
    { locale: 'es', slug: paths.es }
  ]);
}
```

This generates 144 pre-rendered pages (72 en + 72 es) from a single route. The `entries()` function explicitly lists all paths so SvelteKit doesn't need to crawl them.

**Hub page**: The `/learn/` hub needs a separate route since `[...slug]` won't match an empty slug. Create:
```
src/routes/(company)/learn/
├── +page.svelte    ← Hub page (8-category grid)
├── +page.ts        ← Hub SEO metadata
└── +layout.ts      ← ssr=true, prerender=true
```

---

## 16. Implementation Phases

### Phase 1: Foundation (Week 1-2)

1. Create `src/lib/content/learn/slug-map.ts` — content key → URL path mapping for en/es
2. Create `src/lib/types/learn.ts` — `LearnPageContent` type definition
3. Create dynamic route: `src/routes/(company)/[[locale=locale]]/[...slug]/` (+page.svelte, +page.ts, +layout.ts)
4. Create hub route: `src/routes/(company)/learn/` (+page.svelte, +page.ts)
5. Create `LearnPageLayout.svelte` reusable template component
6. Update `menu.constants.ts` (logged-out + logged-in nav)
7. Update `BitTaskerFooter.svelte` (add Learn row below existing grid)
8. Update `sitemap.config.js`
9. Update `seo.constants.ts` (SiteNavigationElement)
10. Create i18n namespace files (`learn.json` en/es) for UI chrome

### Phase 2: Wallet Pillar + Top Comparisons (Week 2-4)

1. Wallet pillar page
2. Ledger vs Trezor comparison (KD 3, 500/mo)
3. Coldcard deep-dive
4. Foundation Passport deep-dive
5. BitBox02 deep-dive
6. Aqua Wallet deep-dive
7. Blink Wallet deep-dive
8. Best Bitcoin Wallet comparison
9. Is BitTasker Safe? (highest conversion)

### Phase 3: Gig Economy (Week 4-6)

1. Freelancing pillar page
2. Upwork Alternatives (5K-10K/mo)
3. Fiverr Alternatives (3K-5K/mo)
4. Upwork vs Fiverr (3K-5K/mo)
5. BitTasker vs Upwork
6. BitTasker vs Fiverr
7. Upwork Fees Explained

### Phase 4: Bitcoin & Rootstock (Week 6-8)

1. Bitcoin & Payments pillar
2. Rootstock pillar
3. Bitcoin Freelancing pillar
4. What is Rootstock?
5. Bitcoin Escrow (Rootstock)
6. Get Paid in Bitcoin
7. Lightning Network Explained

### Phase 5: Remaining Content (Week 8-12)

1. Security & Trust pillar (remaining pages)
2. Bitcoin Layer 2s pillar
3. Future of Work pillar
4. All remaining comparison and education pages
5. Spanish localization of all pages

---

## 17. Success Metrics

| Metric | Target | Timeline |
|---|---|---|
| Pages indexed | 72+ | 3 months |
| Organic traffic to /learn/ | 5,000/mo | 6 months |
| Organic traffic to /learn/ | 20,000/mo | 12 months |
| AI Overview citations | 10+ pages cited | 6 months |
| Comparison page rankings (top 10) | 5+ pages | 6 months |
| Conversion rate (learn → signup) | 2-5% | Ongoing |
| Backlinks earned to /learn/ pages | 50+ | 12 months |
| Spanish traffic (/aprende/) | 2,000/mo | 12 months |

---

## 18. Appendix: Wallet Research Data

### Coldcard (Coinkite) — Summary

- **Type**: Bitcoin-only hardware wallet
- **Manufacturer**: Coinkite (Canada), since 2017
- **Security**: Dual secure elements (Microchip ATECC608 + Maxim DS28C36B)
- **Air-gapped**: Fully — MicroSD, NFC, QR codes, PSBT (BIP174)
- **Open source**: Yes — firmware is reproducible
- **Models**: Q ($$ — QWERTY, QR scanner, battery) and Mk5 ($ — numeric keypad, slim)
- **Unique features**: Trick PINs (duress, brick, countdown), clear case tamper detection, seed generation via dice rolls, Key Teleport (Q only), Co-Signing spending policies
- **Companion wallets**: Sparrow, Electrum, Specter (no proprietary app required)
- **Price**: ~$150 (Mk5) / ~$200 (Q)

### Foundation Passport — Summary

- **Type**: Bitcoin-only hardware wallet
- **Manufacturer**: Foundation Devices (USA), assembled in ITAR facility
- **Security**: Security Processor + Secure Element, active tamper protection, auto-erase after 10 PIN attempts
- **Display**: 3.5" IPS Gorilla Glass touchscreen
- **Connectivity**: QuantumLink (post-quantum Bluetooth), NFC, USB-C, Camera (QR)
- **OS**: KeyOS — Rust microkernel, app sandboxing, process isolation
- **Open source**: Yes — hardware + software
- **Unique features**: 50GB encrypted Vault app, FIDO security keys, TOTP 2FA, NFC Keycards with Faraday sleeves, plausible deniability passphrases, full stateless mode
- **Audited**: By Keylabs (third party)
- **Price**: $349

### BitBox02 (Shift Crypto) — Summary

- **Type**: Bitcoin-only OR multi-coin hardware wallet
- **Manufacturer**: Shift Crypto AG (Switzerland)
- **Security**: Dual chip design, EAL6+ certified secure chip (Nova)
- **Open source**: Yes — firmware audited
- **Backup**: microSD card instant backup/restore
- **Input**: Capacitive touch sensors (slide, tap, hold)
- **Models**: BitBox02 (USB-C, Android) and BitBox02 Nova (Bluetooth, iPhone/iPad, glass OLED)
- **Editions**: Bitcoin-only and Multi (BTC, ETH, LTC, ADA + 1500+ ERC20)
- **Companion**: BitBoxApp (desktop + mobile)
- **Unique features**: Minimalist/discreet design, WalletConnect for DeFi, Unchained multisig integration
- **Price**: ~$130 (BitBox02) / ~$150 (Nova)

### Aqua Wallet (JAN3) — Summary

- **Type**: Software mobile wallet (self-custodial)
- **Manufacturer**: JAN3 (Samson Mow)
- **Networks**: Bitcoin (on-chain), Lightning, Liquid Network
- **Stablecoins**: Native Tether USDt on Liquid
- **KYC**: None — download and use
- **Platform**: iOS and Android
- **Unique features**: Multiple wallets in one app (separate savings/spending), Liquid assets, Bitcoin + stablecoin in single app
- **Target audience**: Bitcoiners who also need stablecoin spending, Latin America / El Salvador users
- **Relevance**: Everyday spending wallet, complements hardware wallet savings

### Blink Wallet (Galoy) — Summary

- **Type**: Software mobile wallet (custodial, Lightning-first)
- **Manufacturer**: Galoy / Blink Technologies LLC (based in Próspera, team in Latin America)
- **Origin**: Bitcoin Beach, El Zonte, El Salvador (2020)
- **Networks**: Lightning (primary), on-chain Bitcoin
- **Unique features**: Dollar balance (USD equivalent), merchant POS tools, community Circles, Bitcoin vouchers, open source (Galoy framework), multi-language (EN/ES/FR/DE/TR/BR)
- **API**: Developer-friendly (BTCPay plugin, WooCommerce plugin)
- **Target audience**: Everyday users, merchants, communities adopting Bitcoin (especially El Salvador / Latin America)
- **Relevance**: The wallet that proved Bitcoin works for daily commerce in a developing economy

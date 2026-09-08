# E2E Tests Strategy

## Current State

### Infrastructure
- **Framework**: Playwright with 5 projects (chromium, firefox, webkit, Mobile Chrome, Mobile Safari)
- **Config**: `playwright.config.ts` — tests in `tests/e2e/`, global setup seeds auth state
- **Auth**: Dual approach — passkey via CDP virtual authenticator (Chromium) + nsec localStorage seeding (cross-browser)
- **Execution**: Ordered via `scripts/e2e-ordered.js` — signup first, then all other tests
- **Storage state**: Per-browser JSON files in `tests/e2e/.auth/`

### Existing Coverage

| Area | Specs | Coverage Level |
|---|---|---|
| Auth (signup/login) | 3 specs | Medium |
| Homepage | 2 specs (featured services + visual) | Low |
| Tasks | 1 spec | Low |
| Services | 8 specs (creation, quotes, instant buy, visual) | Medium |
| Reviews | 2 specs | Low |
| Earning | 1 spec | Low |
| Messages | 1 spec | Low |
| Wallet | 0 specs (legacy in `src/lib/tests/e2e/`) | None |
| Cross-browser | 1 smoke spec | Low |
| Settings | 0 | None |
| Profile | 0 | None |
| Public pages (about, faq, etc.) | 0 | None |
| SEO verification | 0 | None |
| i18n | 0 | None |
| Deep links | 0 | None |

### Problems
1. **Dual location**: Tests exist in both `tests/e2e/` (canonical) and `src/lib/tests/e2e/` (legacy)
2. **Ordered execution**: Tests depend on signup running first (fragile)
3. **No public page tests**: Company pages (about, faq, terms, etc.) have zero e2e coverage
4. **No SEO tests**: No verification that prerendered HTML has correct meta tags, OG tags, JSON-LD
5. **No i18n tests**: No verification of language switching or translation persistence
6. **Security**: `test-seed.json` contains real credentials (should be gitignored)

## Test Strategy

### Category 1: Public Pages (No Auth Required)

These tests need NO seed data. They verify the static/prerendered pages work correctly.

| Test | Description | Priority |
|---|---|---|
| `public-pages-smoke.spec.ts` | Visit each company page, verify 200, no JS errors | High |
| `seo-meta-tags.spec.ts` | Verify OG tags, meta description, canonical, robots, JSON-LD on all prerendered pages | High |
| `homepage-content.spec.ts` | Verify hero text, featured tasks, benefits, CTA sections render with real content (not i18n keys) | High |
| `homepage-scroll.spec.ts` | Verify page is scrollable, TopBar visible, all sections accessible | Medium |
| `i18n-language-switch.spec.ts` | Switch to Spanish, verify text changes, refresh, verify persistence | High |
| `i18n-no-key-flash.spec.ts` | Verify no raw translation keys visible after page load | Medium |
| `navigation-public.spec.ts` | Click through all public nav links, verify correct pages load | Medium |
| `robots-txt.spec.ts` | Verify robots.txt content (Allow /, sitemap reference) | Low |
| `sitemap.spec.ts` | Verify sitemap.xml exists and contains expected URLs | Low |

**Test structure:**
```ts
// tests/e2e/public/seo-meta-tags.spec.ts
import { test, expect } from '@playwright/test';

const PUBLIC_PAGES = [
  { path: '/', title: 'Decentralized Workforce', ogTitle: 'BitTasker' },
  { path: '/about', title: 'About BitTasker', ogTitle: 'About' },
  { path: '/faq', title: 'FAQ', ogTitle: 'FAQ' },
  { path: '/terms', title: 'Terms', ogTitle: 'Terms' },
  { path: '/how-it-works', title: 'How BitTasker', ogTitle: 'How' },
  { path: '/privacy', title: 'Privacy', ogTitle: 'Privacy' },
  { path: '/security', title: 'Security', ogTitle: 'Security' },
];

for (const page of PUBLIC_PAGES) {
  test(`${page.path} has correct SEO meta tags`, async ({ page: p }) => {
    await p.goto(page.path, { waitUntil: 'domcontentloaded' });
    await expect(p).toHaveTitle(new RegExp(page.title));
    await expect(p.locator('meta[property="og:title"]')).toHaveAttribute('content', new RegExp(page.ogTitle));
    await expect(p.locator('meta[name="description"]')).toHaveAttribute('content', /.+/);
    await expect(p.locator('meta[name="robots"]')).toHaveAttribute('content', /index/);
    await expect(p.locator('link[rel="canonical"]')).toHaveAttribute('content', /bittasker\.com/);
  });
}
```

### Category 2: Authenticated Routes (Seed Required)

These tests use the existing seed infrastructure (`test-seed.json` → global setup → storage state).

| Test | Description | Priority |
|---|---|---|
| `dashboard-load.spec.ts` | Verify dashboard loads after auth, sidebar visible, correct sections | High |
| `tasks-browse.spec.ts` | Browse tasks page, verify cards render, filters work | Medium |
| `services-browse.spec.ts` | Browse services page, verify cards render, search works | Medium |
| `messages.spec.ts` | Send/receive messages (existing spec, enhance) | Medium |
| `wallet.spec.ts` | Wallet page loads, balance displays, receive/send flows | Medium |
| `profile.spec.ts` | Profile page loads, edit profile, avatar upload | Low |
| `settings.spec.ts` | Settings page loads, notification prefs, language change | Low |
| `contracts.spec.ts` | Contracts page loads, contract cards render | Medium |
| `earning.spec.ts` | Earning page loads, tabs work, bids/requests/contracts display | Medium |

**Test structure:**
```ts
// tests/e2e/authenticated/dashboard-load.spec.ts
import { test, expect } from '../fixtures/cross-browser-auth';

test('dashboard loads with sidebar', async ({ authenticatedPage }) => {
  await authenticatedPage.goto('/dashboard');
  await expect(authenticatedPage.locator('.dashboard-layout')).toBeVisible();
  await expect(authenticatedPage.locator('.menu')).toBeVisible();
});
```

### Category 3: SEO Verification (No Auth)

Dedicated SEO test suite that verifies the prerendering optimization goals.

| Test | Description | Priority |
|---|---|---|
| `seo-prerendered-content.spec.ts` | Verify prerendered HTML contains real text (not empty shells, not i18n keys) | Critical |
| `seo-jsonld.spec.ts` | Verify JSON-LD structured data on homepage (Organization, SiteNavigation, WebPage) | High |
| `seo-open-graph.spec.ts` | Verify OG tags on all public pages (title, description, image, type) | High |
| `seo-twitter-card.spec.ts` | Verify Twitter Card tags | Medium |
| `seo-canonical.spec.ts` | Verify canonical URLs match expected patterns | Medium |
| `seo-robots-meta.spec.ts` | Verify robots meta tag (index/follow for public, noindex for app pages) | Medium |

**Critical test — prerendered content:**
```ts
// tests/e2e/seo/seo-prerendered-content.spec.ts
import { test, expect } from '@playwright/test';

test('homepage prerendered HTML contains real content (not i18n keys)', async ({ page }) => {
  // Load page and check immediately (before hydration)
  const response = await page.goto('/', { waitUntil: 'commit' });
  const html = await response!.text();
  
  // Should NOT contain raw i18n keys
  expect(html).not.toContain('homepage.v2.hero.description');
  expect(html).not.toContain('navbar.browse_tasks');
  
  // Should contain real translated text
  expect(html).toContain('Hire professionals');
  expect(html).toContain('Decentralized Workforce');
});

test('company pages have unique titles', async ({ page }) => {
  const pages = [
    { path: '/about', expected: /About/i },
    { path: '/faq', expected: /FAQ/i },
    { path: '/terms', expected: /Terms/i },
  ];
  
  for (const p of pages) {
    await page.goto(p.path, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveTitle(p.expected);
  }
});
```

### Category 4: Visual Regression

Extend existing visual regression tests.

| Test | Description | Priority |
|---|---|---|
| `visual-homepage.spec.ts` | Homepage screenshot at 1280x720 and 375x812 | Medium |
| `visual-topbar.spec.ts` | PublicTopBar and ProtectedTopBar screenshots | Low |
| `visual-company-pages.spec.ts` | Key company pages screenshots | Low |

### Category 5: Accessibility

| Test | Description | Priority |
|---|---|---|
| `a11y-public-pages.spec.ts` | Run axe-core on all public pages | Medium |
| `a11y-auth-flow.spec.ts` | Run axe-core on login/signup/onboarding | Medium |
| `keyboard-nav.spec.ts` | Tab navigation through interactive elements | Low |

## Implementation Plan

### Phase 1: Foundation (Week 1)
1. Create `tests/e2e/public/` directory for public page tests
2. Create `tests/e2e/seo/` directory for SEO verification
3. Implement `public-pages-smoke.spec.ts` — visit all public routes, verify 200, no errors
4. Implement `seo-meta-tags.spec.ts` — verify OG/JSON-LD/canonical on all prerendered pages
5. Implement `seo-prerendered-content.spec.ts` — verify real content (not keys, not empty)

### Phase 2: i18n & Navigation (Week 2)
6. Implement `i18n-language-switch.spec.ts` — switch language, verify, refresh, verify
7. Implement `i18n-no-key-flash.spec.ts` — verify no raw keys visible
8. Implement `navigation-public.spec.ts` — click through all public nav links

### Phase 3: Authenticated Routes (Week 3)
9. Implement `dashboard-load.spec.ts` — basic dashboard verification
10. Implement `tasks-browse.spec.ts` — task listing and filtering
11. Implement `services-browse.spec.ts` — service listing and search
12. Migrate legacy tests from `src/lib/tests/e2e/` to `tests/e2e/`

### Phase 4: Polish (Week 4)
13. Visual regression tests
14. Accessibility tests
15. Clean up legacy `src/lib/tests/e2e/` directory

### E2E Contract Flow TODO
- [ ] Default escrow settlement to 100% BTC-only during E2E testing (disable default RGB USDT split).
- [ ] Add fallback `VITE_RGB_USDT_ASSET_ID` string check to prevent modal validation crashes.

## Auth Approach for Tests

### Public Routes (No Auth)
```ts
// Default Playwright test — no fixture needed
test('homepage loads', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Decentralized/);
});
```

### Authenticated Routes (Seeded Auth)
```ts
// Use cross-browser-auth fixture
import { test, expect } from '../fixtures/cross-browser-auth';

test('dashboard loads', async ({ authenticatedPage }) => {
  await authenticatedPage.goto('/dashboard');
  await expect(authenticatedPage.locator('.dashboard-layout')).toBeVisible();
});
```

### Auth Flow Tests (Full Signup)
```ts
// Use signup-login-auth fixture
import { test, expect } from '../fixtures/signup-login-auth';

test('signup creates account', async ({ authenticatedPage }) => {
  // authenticatedPage is already logged in via the fixture
  await authenticatedPage.goto('/dashboard');
  await expect(authenticatedPage.locator('.dashboard-layout')).toBeVisible();
});
```

## File Organization

```
tests/e2e/
├── fixtures/
│   ├── auth.ts                          # Base auth fixture
│   ├── cross-browser-auth.ts           # Seeded localStorage auth
│   ├── passkey-auth-from-file.ts       # WebAuthn credential auth
│   └── signup-login-auth.ts            # Full signup flow fixture
├── public/
│   ├── public-pages-smoke.spec.ts      # All public routes load
│   ├── homepage-content.spec.ts        # Homepage content verification
│   ├── homepage-scroll.spec.ts         # Scroll behavior
│   ├── navigation-public.spec.ts       # Public nav links
│   └── i18n/
│       ├── language-switch.spec.ts     # Language switching
│       └── no-key-flash.spec.ts        # No raw keys visible
├── seo/
│   ├── prerendered-content.spec.ts     # Real content in HTML
│   ├── meta-tags.spec.ts               # OG/canonical/robots
│   ├── jsonld.spec.ts                  # Structured data
│   └── sitemap.spec.ts                 # Sitemap verification
├── authenticated/
│   ├── dashboard.spec.ts               # Dashboard loading
│   ├── tasks.spec.ts                   # Tasks browsing
│   ├── services.spec.ts                # Services browsing
│   ├── messages.spec.ts                # Messaging
│   ├── wallet.spec.ts                  # Wallet
│   ├── profile.spec.ts                 # Profile
│   ├── settings.spec.ts                # Settings
│   ├── contracts.spec.ts               # Contracts
│   └── earning.spec.ts                 # Earning
├── visual/
│   ├── homepage.spec.ts                # Homepage screenshots
│   └── topbar.spec.ts                  # TopBar screenshots
├── a11y/
│   └── public-pages.spec.ts           # Accessibility audit
├── utils/
│   ├── auth-helpers.ts                 # Auth utilities
│   ├── onboarding-helpers.ts           # Onboarding flow
│   └── webauthn-credentials.ts         # Credential management
├── scripts/
│   ├── seed-auth.ts                    # Auth seed script
│   └── seed-chromium.ts               # Chromium seed
├── .auth/                              # Storage state files (gitignored)
├── global-setup.ts                     # Global setup
└── e2e-ordered.js                      # Ordered execution script
```

## Environment Variables

| Variable | Purpose | Default |
|---|---|---|
| `PW_E2E_BASE_URL` | Override base URL for tests | `http://localhost:3000` |
| `VITE_E2E_TURNSTILE_BYPASS` | Bypass Cloudflare Turnstile captcha | `true` (set by playwright.config.ts) |
| `VITE_API_URL` | Backend API URL | (from .env) |
| `AUTH_STATE_PATH` | Override storage state path | `tests/e2e/.auth/{browser}-auth.json` |
| `TEST_NOSTR_NSEC` | Test nsec key for auth | (from test-seed.json) |

## CI Integration

The e2e tests should run in CI after the build step:

```yaml
# In CI pipeline
- name: Build
  run: npm run build:dev

- name: Seed auth
  run: npm run test:e2e:seed

- name: Run e2e tests
  run: npm run test:e2e
```

For PR checks, run only public page tests (no auth required, fast):
```yaml
- name: Run public e2e tests
  run: npx playwright test tests/e2e/public/ tests/e2e/seo/
```

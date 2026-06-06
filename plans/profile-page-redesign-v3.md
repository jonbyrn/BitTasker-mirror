# Profile Page Redesign Plan v3

## feat/profile-improvements

**Audited by:** Sally (UX), Winston (Architecture), Code Reviewer (Implementation) + User Requirements
**Previous audits:** plans/profile-page-redesign-AUDIT.md
**Confidence target:** 95%+ production-ready

---

## 1. Current State Analysis

### Existing Profile Page (`/npub/[npub]`)

- 4-column grid: 3 content + 1 sidebar
- Has: Profile header, video intro, about/skills, portfolio, stats sidebar, availability, quick actions
- **Missing**: Services listing, tasks listing, reviews display, hero section, nav, verified badges, hire flow, languages

### Existing Code to Reuse (verified paths)

- `src/lib/nostr/findProfileServices.ts` → `findProfileServicesByAuthor()` — queries KINDS.SERVICE_ACTIVE (30402), deletion cache, deduplication, status filtering. Uses `nostrEventsService` internally — **keep as-is**
- `src/lib/nostr/profile/comprehensive-profile.ts` → `fetchComprehensiveProfile()` — uses NDK
- `src/lib/utils/reviews/queries.ts` → `getReviewsForUser()`, `getReviewsByReviewer()` — uses NDK
- `src/lib/utils/reviews/aggregation.ts` → `calculateReviewStats()`
- `src/lib/utils/constants/kinds.ts` → `KINDS.TASK_CREATION: 31000`, `KINDS.SERVICE_ACTIVE: 30402`
- `src/lib/utils/service-quote/publish.ts` → `publishServiceQuoteRequest()` — for Hire Me flow
- `src/lib/components/service/RequestQuoteModal.svelte` — reuse for Hire Me
- `src/lib/components/homepage/FeaturedHomepageSection.svelte` — needs override props
- `src/lib/components/homepage/FeaturedHomepageCardShell.svelte` — base card
- `src/lib/components/Avatar.svelte`, `StreamPlayer.svelte`, `ActionsMenu.svelte`
- `src/lib/types/review.d.ts` → `AttestedReview`, `ReviewStats`
- `src/lib/nostr/ndk.ts` → global NDK instance for new queries
- **Translation infrastructure (existing — DO NOT rebuild):**
  - `src/lib/services/translation.service.ts` → `TranslationService` (Google Translate proxy, EN/ES, caching, batch, rate limiting)
  - `src/lib/nostr/profile/translations.ts` → `generateProfileTranslations()`, `generateSkillTranslations()`, `generateCertificationTranslations()`, `generatePortfolioTranslations()` — add `generateLanguageTranslations()` here
  - `src/lib/services/task-translation.service.ts` → `taskTranslationService.getStoredTranslation()`
  - `src/lib/services/bid-translation.service.ts` → `bidTranslationService.getStoredTranslation()`
  - `src/lib/utils/serviceDisplayTranslation.ts` → `getServiceDisplayTitle()`, `getServiceDisplayDescription()`

### Key Constraints

- **Capacitor app** — SSR is NOT available; all data fetching is client-side
- **Svelte 5 only** — `$props<>()`, `$derived(expr)`, `$effect()`, `$state()` — NO Svelte 4 patterns
- **NDK for new Nostr code** — use `ndk.subscribe()` / `ndk.fetchEvent()` pattern from `$lib/nostr/ndk`. Keep existing `nostrEventsService`-based code unchanged
- **No message buttons** on profile page
- **General location only** — city/country, not exact coordinates
- **No online indicator** — no functionality built in
- **No response time** — no data available
- **No completion/on-time/repeat %** — no data available
- **No "X% recommend"** — no data available
- **All user-generated content must be translated** — visitors see text in their selected language

---

## 2. Design Architecture

### Route Structure

```
/npub/[npub]/+page.svelte        → public profile page (REDESIGN)
```

Note: No `+page.server.ts` — Capacitor app, SSR not available.

### New Components

```
src/lib/components/profile/
├── ProfileHero.svelte           → Hero: avatar, name, rating, hire CTA
├── ProfileNav.svelte            → Section nav links (NOT tab pattern)
├── ProfileServicesSection.svelte → Services grid (self-fetching, lazy)
├── ProfileTasksSection.svelte   → Tasks grid (self-fetching, lazy)
├── ProfileReviewsSection.svelte → Reviews with cursor pagination
├── ProfilePortfolioSection.svelte → Portfolio masonry grid + lightbox
├── ProfileAboutSection.svelte   → About + skills + credentials + languages
├── ProfileSidebar.svelte        → Stats + quick actions (desktop only)
└── ReviewCard.svelte            → Individual review card
```

### New Files

```
src/lib/nostr/findProfileTasks.ts → findProfileTasksByAuthor() using NDK
src/lib/components/profile/edit/Languages.svelte → Language editor for profile edit
```

---

## 3. ASCII Mockups

### 3.1 Desktop (>=1024px)

```
+--------------------------------------------------------------------------+
|  PROFILE HERO                                                            |
|  +--------+  +-------------------------------------------------------+  |
|  |        |  |  Name [checkmark]  star 4.8/5 (127)                    |  |
|  | AVATAR |  |  Professional Title                                    |  |
|  | (large)|  |  City, Country                                         |  |
|  |        |  |  [Hire Me (primary, full-width on mobile)]             |  |
|  +--------+  +-------------------------------------------------------+  |
+--------------------------------------------------------------------------+

+--------------------------------------------------------------------------+
|  NAV: [Services] [Portfolio] [Reviews] [About] [Tasks]                   |
|  (nav links with counts, sticky on scroll, scroll-spy)                   |
+--------------------------------------------------------------------------+

+--------------------------------------------------------------------------+
|  SERVICES (id=services)                                     [Browse All] |
|  +----------+  +----------+  +----------+                               |
|  | +------+ |  | +------+ |  | +------+ |                               |
|  | | IMG  | |  | | IMG  | |  | | IMG  | |                               |
|  | +------+ |  | +------+ |  | +------+ |                               |
|  | Title    |  | Title    |  | Title    |                               |
|  | Desc...  |  | Desc...  |  | Desc...  |                               |
|  | City,Cntry|  | Remote   |  | City,Cntry|                              |
|  | $50/hr   |  | $200     |  | $75/hr   |                               |
|  | [View]   |  | [View]   |  | [View]   |                               |
|  +----------+  +----------+  +----------+                               |
|  [Show 12 more services]                                                 |
+--------------------------------------------------------------------------+

+--------------------------------------------------------------------------+
|  PORTFOLIO (id=portfolio)                                  [Filter: All] |
|  +------------------+ +------------------+ +------------------+          |
|  |  Hero Image      | |  Hero Image      | |  Hero Image      |          |
|  |  (click->LB)     | |  (click->LB)     | |  (click->LB)     |          |
|  |  Project Title   | |  Project Title   | |  Project Title   |          |
|  |  Skills: React   | |  Skills: Figma   | |  Skills: Python  |          |
|  +------------------+ +------------------+ +------------------+          |
+--------------------------------------------------------------------------+

+--------------------------------------------------------------------------+
|  REVIEWS (id=reviews)                                                    |
|  star 4.8/5 avg    127 reviews                                           |
|  [####     ] 80% 5-star   [###      ] 15% 4-star                        |
|  [#        ]  3% 3-star   [#        ]  1% 2-star                        |
|                                                                         |
|  +------------------+ +------------------+ +------------------+          |
|  | star*5           | | star*5           | | star*4           |          |
|  | Amazing work on  | | Very professional| | Good quality but |          |
|  | our React app... | | and responsive.. | | took longer...   |          |
|  | John D. Mar 2024 | | Sarah M. Feb 2024| | Alex K. Jan 2024 |          |
|  | Verified task    | | Verified service | | Verified task    |          |
|  +------------------+ +------------------+ +------------------+          |
|  [Load more reviews...]                                                  |
+--------------------------------------------------------------------------+

+--------------------------------------------------------------------------+
|  ABOUT (id=about)                                                        |
|  +----------------------------------------------+ +-------------------+ |
|  |  About Me                                    | | PERFORMANCE       | |
|  |  Lorem ipsum dolor sit amet...               | | Tasks Done: 45    | |
|  |  [Show more]                                 | | Rating: 4.8 star  | |
|  |                                              | | Skills: 15        | |
|  |  Skills & Expertise                          | | Portfolio: 23     | |
|  |  [React] [Node.js] [Python] [AWS]           | |                   | |
|  |                                              | |                   | |
|  |  Languages                                   | | AVAILABILITY      | |
|  |  English (Native)                            | | Available         | |
|  |  Spanish (Conversational)                    | | Mon-Fri 9am-5pm   | |
|  |                                              | | Max/day: 3        | |
|  |  Credentials                                 | |                   | |
|  |  B.S. CS, MIT (2020)                         | | ACTIONS           | |
|  |  AWS Solutions Architect (2023)              | | [Report]          | |
|  |                                              | |                   | |
|  |  VIDEO INTRODUCTION                          | |                   | |
|  |  +----------------------------------------+| |                   | |
|  |  |          Video Player                  || |                   | |
|  |  +----------------------------------------+| |                   | |
|  +----------------------------------------------+ +-------------------+ |
+--------------------------------------------------------------------------+

+--------------------------------------------------------------------------+
|  TASKS (id=tasks)                                           [Browse All] |
|  +----------+  +----------+  +----------+                               |
|  | Task     |  | Task     |  | Task     |                               |
|  | Title    |  | Title    |  | Title    |                               |
|  | $200     |  | $500     |  | $150     |                               |
|  | Deadline |  | Deadline |  | Deadline |                               |
|  | City,Cntry| | Remote   |  | City,Cntry|                              |
|  | Open     |  | Done     |  | Open     |                               |
|  +----------+  +----------+  +----------+                               |
+--------------------------------------------------------------------------+
```

### 3.2 Mobile (<768px)

```
+------------------------------+
|         <- Back              |
+------------------------------+
|        +----------+          |
|        |          |          |
|        |  AVATAR  |          |
|        | (large)  |          |
|        +----------+          |
|    Name [checkmark]          |
|    Professional Title        |
|    City, Country             |
|                              |
|  +--------+ +--------+      |
|  | 45     | | star4.8|      |
|  | Tasks  | | Rating |      |
|  | Done   | |        |      |
|  +--------+ +--------+      |
|  +--------+ +--------+      |
|  | 15     | | 23     |      |
|  | Skills | |Portfolio|     |
|  +--------+ +--------+      |
+------------------------------+
|  Nav (horiz scroll):         |
|  [Services][Portfolio]       |
|  [Reviews][About][Tasks]     |
+------------------------------+
|                              |
|  SECTION CONTENT             |
|  (all sections in DOM,       |
|   scroll-to on nav click)    |
|                              |
|  Services:                   |
|  +--------------------------+|
|  |  Service Image           ||
|  |  Service Title           ||
|  |  Description...          ||
|  |  City, Country $50/hr    ||
|  |  [View Service]          ||
|  +--------------------------+|
|                              |
|  About:                      |
|  +--------------------------+|
|  |  About text...           ||
|  |  Skills: [React] [Node]  ||
|  |  Languages:              ||
|  |    English (Native)      ||
|  |    Spanish (Fluent)      ||
|  |  Credentials...          ||
|  |                          ||
|  |  AVAILABILITY            ||
|  |  (mobile only)           ||
|  |  Available               ||
|  |  Mon-Fri 9am-5pm         ||
|  |  Max/day: 3              ||
|  |                          ||
|  |  Video: [Player]         ||
|  +--------------------------+|
|                              |
|  Reviews:                    |
|  +--------------------------+|
|  | star*5                   ||
|  | Amazing work on our      ||
|  | React application...     ||
|  | John D.  3 months ago    ||
|  | Verified task            ||
|  +--------------------------+|
|                              |
+------------------------------+
|  +--------------------------+|
|  |  [Hire Me] (primary)     ||
|  +--------------------------+|
|  (sticky, z-20, bg-base-100 |
|   safe-area-inset-bottom)   |
+------------------------------+
```

---

## 4. Implementation Tasks

### Phase 0: Shared Read-Time Translation Utility

#### Task 0.1: Extract Read-Time Display Functions to Shared Utility (NEW)

**Severity:** Critical — new profile components need importable translation display functions.

- **File**: `src/lib/utils/profileTranslation.ts` (NEW)
- **Scope**: READ-TIME display only. Write-time translation generation is already fully built.

**Existing write-time infrastructure (DO NOT rebuild):**

- `src/lib/services/translation.service.ts` — `TranslationService` class (Google Translate proxy, EN/ES, caching, batch, rate limiting)
- `src/lib/nostr/profile/translations.ts` — 4 pre-built generators:
  - `generateProfileTranslations({ professionalTitle, about })` → `ProfileTranslations`
  - `generateSkillTranslations(skillName, fallbackLocale?)` → `SkillTranslations`
  - `generateCertificationTranslations(name, issuer)` → `CertificationTranslations`
  - `generatePortfolioTranslations({ title, description }, fallbackLocale?)` → `PortfolioTranslations`
- `src/lib/services/task-translation.service.ts` — read-only `getStoredTranslation(task, lang)`
- `src/lib/services/bid-translation.service.ts` — read-only `getStoredTranslation(bid, field, lang)` + `getDisplayContent()`
- `src/lib/utils/serviceDisplayTranslation.ts` — shared exports `getServiceDisplayTitle()`, `getServiceDisplayDescription()`

**Problem**: Read-time display functions are local closures inside existing components, not importable by new profile components:

- `getTranslatedProfileContent` → local in `ProfileInfoSection.svelte` (line 9)
- `getTranslatedSkillName` → local in `ProfileInfoSection.svelte` (line 34)
- `getTranslatedPortfolioTitle/Description` → local in `ProfileInfoSection.svelte` (lines 75, 106)

**Solution**: Extract to shared utility. All read-time functions follow the same pattern:

1. Check `item.translations.sourceLanguage === currentLocale` → return original
2. Look up `item.translations.translations[currentLocale]?.field`
3. Fall back to original field value

```typescript
// src/lib/utils/profileTranslation.ts
import type { NostrProfile } from '$lib/types/profile.d';

/**
 * Read-time display utility for profile translations.
 * Wraps the same logic used by ProfileInfoSection.svelte local functions.
 * Write-time translation generation is handled by $lib/nostr/profile/translations.ts.
 *
 * IMPORTANT: All functions return the ORIGINAL value when:
 * - sourceLanguage matches the visitor's locale (no translation needed)
 * - No translations exist on the object
 * - Translation lookup fails
 * Callers pass the original field value as the last parameter.
 */

export function getTranslatedProfileContent(
	profile: NostrProfile | null,
	field: 'professionalTitle' | 'about',
	locale: string,
	originalValue: string
): string {
	if (!profile?.translations) return originalValue;
	if (profile.translations.sourceLanguage === locale) return originalValue;
	const translation = profile.translations.translations?.[locale];
	return translation?.[field] || originalValue;
}

export function getTranslatedSkillName(
	skill:
		| string
		| {
				name?: string;
				translations?: {
					sourceLanguage?: string;
					translations?: Record<string, { name?: string }>;
				};
		  },
	locale: string
): string {
	// Skills may be stored as plain strings in older events
	if (typeof skill === 'string') return skill;
	const originalName = skill.name ?? '';
	if (!skill?.translations?.translations) return originalName;
	if (skill.translations.sourceLanguage === locale) return originalName;
	const translation = skill.translations.translations[locale];
	return translation?.name || originalName;
}

export function getTranslatedPortfolioTitle(
	item: {
		title?: string;
		translations?: { sourceLanguage?: string; translations?: Record<string, { title?: string }> };
	},
	locale: string
): string {
	const originalTitle = item.title ?? '';
	if (!item?.translations?.translations) return originalTitle;
	if (item.translations.sourceLanguage === locale) return originalTitle;
	const translation = item.translations.translations[locale];
	return translation?.title || originalTitle;
}

export function getTranslatedPortfolioDescription(
	item: {
		description?: string;
		translations?: {
			sourceLanguage?: string;
			translations?: Record<string, { description?: string }>;
		};
	},
	locale: string
): string {
	const originalDesc = item.description ?? '';
	if (!item?.translations?.translations) return originalDesc;
	if (item.translations.sourceLanguage === locale) return originalDesc;
	const translation = item.translations.translations[locale];
	return translation?.description || originalDesc;
}
```

**Migration note**: New components MUST import from the shared utility. Do NOT duplicate the closure pattern.

**Migration note**: Existing components (`ProfileInfoSection.svelte`, `Skills.svelte`, `Portfolio.svelte`) keep their local functions unchanged — no refactoring of existing code. New components import from the shared utility.

---

### Phase 1: Data Layer

#### Task 1.1: Reuse Existing Service Fetch (NO changes)

- Import `findProfileServicesByAuthor` from `$lib/nostr/findProfileServices`
- Already handles: KINDS.SERVICE_ACTIVE (30402), deletion cache, deduplication, status filtering
- Uses `nostrEventsService` internally — keep as-is per user requirement
- Default limit: 8

#### Task 1.2: Create User Tasks Query (NDK)

- **File**: `src/lib/nostr/findProfileTasks.ts` (NEW)
- **Function**: `findProfileTasksByAuthor(authorPubkey, options?)`
- **Kind**: `KINDS.TASK_CREATION` (31000)
- **Uses NDK** (not nostrEventsService) — `ndk.subscribe()` with `closeOnEose: true`
- **Must call `sub.start()`** after attaching event handlers (defensive consistency with reviews/queries.ts pattern)
- try-catch on JSON.parse, filter nulls
- Default limit: 8

```typescript
// src/lib/nostr/findProfileTasks.ts
import type { Task } from '$lib/types/task.d';
import KINDS from '$lib/utils/constants/kinds';
import { ndk } from '$lib/nostr/ndk';
import { nip19 } from 'nostr-tools';
import type { NDKFilter } from '@nostr-dev-kit/ndk';

function normalizeAuthorPubkey(authorPubkey: string): string {
	const trimmed = authorPubkey.trim();
	if (trimmed.startsWith('npub1')) {
		const decoded = nip19.decode(trimmed);
		return decoded.data as string;
	}
	return trimmed;
}

function parseTaskEvent(event: {
	id: string;
	pubkey: string;
	kind: number;
	content: string;
	created_at: number;
}): Task | null {
	try {
		const contentData = JSON.parse(event.content);
		return {
			...contentData,
			id: event.id,
			npub: event.pubkey,
			eventKind: event.kind,
			createdAt: contentData.createdAt ?? event.created_at
		} as Task;
	} catch {
		console.warn('Failed to parse task event:', event.id?.slice(0, 8));
		return null;
	}
}

export async function findProfileTasksByAuthor(
	authorPubkey: string,
	options: { limit?: number } = {}
): Promise<Task[]> {
	const normalizedPubkey = normalizeAuthorPubkey(authorPubkey);
	const filter: NDKFilter = {
		kinds: [KINDS.TASK_CREATION],
		authors: [normalizedPubkey],
		limit: options.limit ?? 8
	};
	return new Promise((resolve) => {
		const tasks: Task[] = [];
		const sub = ndk.subscribe(filter, { closeOnEose: true });
		sub.on('event', (event) => {
			const parsed = parseTaskEvent({
				id: event.id,
				pubkey: event.pubkey,
				kind: event.kind,
				content: event.content,
				created_at: event.created_at ?? 0
			});
			if (parsed) tasks.push(parsed);
		});
		sub.on('eose', () => resolve(tasks));
		sub.start(); // Explicit start — required for NDK subscriptions
		setTimeout(() => resolve(tasks), 10000);
	});
}
```

#### Task 1.3: Add Cursor-Based Review Pagination

- **File**: `src/lib/utils/reviews/queries.ts` (enhance existing)
- Add `before?: number` parameter to `getReviewsForUser()`
- Use NDK filter `until` for cursor
- Return `{ reviews: AttestedReview[]; cursor: number | null }`

#### Task 1.4: Add Languages to Profile Data

- **File**: `src/lib/nostr/profile/metadata-publish.ts` (extend)
- Add `languages` field to profile metadata (kind 0)
- Format: `Array<{ code: string; name: string; proficiency: string }>`
- Proficiency levels: native, fluent, conversational, basic
- **Type updates required**:
  - Add `languages` field to `NostrProfile` interface in `src/lib/types/profile.d.ts`
  - Add `'languages'` to `PROFILE_METADATA_WIRE_ENRICHMENT_KEYS` in `metadata-wire.ts` so the field persists on read/write
  - Verify `parseProfileMetadataContent()` and `buildProfileMetadataWire()` both process the enrichment keys array (they do — adding the key is sufficient)
- **Write-time translation**: Add `generateLanguageTranslations()` to existing `src/lib/nostr/profile/translations.ts` — follows same pattern as `generateSkillTranslations()`. Uses existing `translationService` from `src/lib/services/translation.service.ts`.
- **Read-time display**: Language names translated via `Intl.DisplayNames` (standard locale data, no API call needed). Proficiency labels translated via existing i18n keys.
- This field is published as part of the Nostr kind 0 metadata event

### Phase 2: Profile Edit

#### Task 2.0: Create Languages Editor Component

- **File**: `src/lib/components/profile/edit/Languages.svelte` (NEW)
- **Props**: `onComplete` callback (matches existing edit section pattern)
- **Design**:
  - Add language button opens search/select dropdown
  - Each language row: language name + proficiency selector (Native/Fluent/Conversational/Basic)
  - Remove button per language
  - Saves to profile metadata kind 0 event
  - Integrates into profile edit page as a new collapsible section
- **Integration**: Add to `src/routes/(protected)/dashboard/profile/edit/+page.svelte`
  - Add to `completedSections` and `isCollapsed` state
  - Add to save flow and progress calculation
- **Graceful fallback**: If no languages set, section is hidden on public profile (not shown as empty)

### Phase 3: Components

#### Task 3.0: Add Override Props to FeaturedHomepageSection

- Add `sectionClass` and `containerClass` optional props
- Profile usage: `<FeaturedHomepageSection sectionClass="" containerClass="" ...>`

#### Task 3.1: ProfileHero

- Large avatar
- Name + verified badge (inline) + rating on desktop only (star 4.8/5 (127))
- Professional title badge
- **General location only**: city/country (not exact coordinates)
- Use globe icon or text-only — NOT map pin icon (implies exact location)
- Hide location line entirely if not set (consistent with languages fallback)
- **One CTA**: Hire Me (`btn btn-primary`, full-width)
- **NO message buttons** per user requirement
- **NO online indicator** per user requirement
- **NO response time** per user requirement
- **Mobile**: 2x2 stats grid (same metrics as desktop sidebar: tasks completed, rating, skills, portfolio count)
- **Mobile**: Remove rating from hero text line — keep only in stats grid to avoid redundancy
- **Star rating ARIA**: `aria-label="4.8 out of 5 stars, 127 reviews"` on rating element; `aria-hidden="true"` on star icons
- **Security**: Validate website URL with inline check: `if (url && (url.startsWith('http://') || url.startsWith('https://'))) href={url}` — omit `href` if invalid (note: `safeUrl()` utility does not exist in codebase, use inline validation or create `src/lib/utils/urlValidation.ts`)
- Reuse: Avatar, ActionsMenu (for moderation + Report action)

**Mobile sticky CTA bar (UX-CRITICAL-01, UX-IMPORTANT-01, UX-IMPORTANT-06, UX-SUGGESTION-10):**

```css
.sticky-cta-bar {
	position: sticky;
	bottom: 0;
	z-index: 20; /* Above nav z-10 */
	background: var(--b1, oklch(var(--b1))); /* bg-base-100 */
	box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.1);
	padding-bottom: env(safe-area-inset-bottom, 0px);
}
```

Page content needs bottom padding to prevent occlusion:

```css
.page-content {
	padding-bottom: calc(4rem + env(safe-area-inset-bottom, 0px));
}
```

**Required**: Append `, viewport-fit=cover` to the existing viewport meta `content` attribute in `src/app.html` (current value: `width=device-width, initial-scale=1.0, minimum-scale=1.0, interactive-widget=resizes-content`). Do NOT add a second `<meta name="viewport">` tag.

#### Task 3.2: ProfileNav (nav links, NOT tab pattern)

- `<nav aria-label="Profile sections">` with anchor links
- Order: Services -> Portfolio -> Reviews -> About -> Tasks
- Sticky with offset (`sticky top-16 z-10 shadow-md`)
- IntersectionObserver scroll-spy with scroll-lock flag
- URL hash sync for deep linking
- Arrow key navigation between links

**Scroll-lock implementation (UX-IMPORTANT-04: focus management + UX-SUGGESTION-05: Safari scrollend):**

```typescript
let scrollLock = $state(false);

function handleNavClick(sectionId: string) {
	scrollLock = true;
	activeSection = sectionId;
	const target = document.getElementById(sectionId);
	target?.scrollIntoView({ behavior: 'smooth' });
	// Focus management: move focus to target section heading for keyboard users
	const heading = target?.querySelector('h2, h3');
	if (heading) {
		heading.setAttribute('tabindex', '-1');
		heading.focus({ preventScroll: true });
	}
	// Safari-compatible scrollend handling
	if ('onscrollend' in window) {
		const onScrollEnd = () => {
			scrollLock = false;
			window.removeEventListener('scrollend', onScrollEnd);
		};
		window.addEventListener('scrollend', onScrollEnd, { once: true });
	}
	// Always set timeout fallback (covers Safari + short scrolls)
	setTimeout(() => {
		scrollLock = false;
	}, 600);
}
```

**iOS Safari compatible observer:**

```typescript
const observer = new IntersectionObserver(callback, {
	rootMargin: '-80px 0px -60% 0px',
	threshold: [0, 0.1, 0.25, 0.5, 0.75, 1]
});
```

#### Task 3.3: ProfileServicesSection (self-fetching, lazy)

- Section always in DOM (scroll target), data fetches on first `isActive`
- **Grid**: `grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4`
  - <640px: single column stacked cards
  - 640-1279px: 2-column grid
  - > =1280px: 3-column grid
- Same grid pattern applies to TasksSection
- **Card shell location icon (I2)**: `FeaturedHomepageCardShell` renders `<IconMapMarker>` (map pin) by default. Add an optional `showLocationIcon` prop (default `true`) to suppress the icon row when rendering on the profile page, OR accept the map pin on service/task cards as a known inconsistency (cards show pin for specific service location, hero shows general user location). Document decision during implementation.
- "Show more" after 6, "Browse All" link
- Uses FeaturedHomepageCardShell with **pre-computed translated content**
- **Translation**: Use `getServiceDisplayTitle(service, currentLocale)` and `getServiceDisplayDescription(service, currentLocale)` before passing to card shell
- Error state with retry button

#### Task 3.4: ProfileTasksSection (self-fetching, lazy)

- Same pattern as services, uses `findProfileTasksByAuthor` (NDK)
- **Translation**: Use `taskTranslationService.getStoredTranslation(task, currentLocale)` from existing `src/lib/services/task-translation.service.ts` — reads pre-stored translations from Nostr event metadata. Falls back to original task title/description if no translation stored.
- Error state with retry

#### Task 3.5: ProfileReviewsSection (self-fetching, lazy)

- Stats: Average rating, distribution bars (role="meter"), total count
- **NO "X% recommend"** per user requirement
- Responsive grid (1/2/3 cols)
- Cursor-based "Load more" pagination
- Verified badge per review (UX-SUGGESTION-08): Text badge "Verified task" / "Verified service" — visually distinct from user identity checkmark in hero
- **Review dates** (UX-SUGGESTION-07): Relative dates for reviews < 1 year old ("3 months ago"), absolute for older ("Mar 2024"). Use date formatting utility consistent with app.
- **Security**: Plain text interpolation `{comment}`, NEVER `{@html}`

#### Task 3.6: ProfileAboutSection

- About text with show more/less
- **Translation**: Use `getTranslatedProfileContent('about')` for about text
- Skills as pill badges
- **Translation**: Use `getTranslatedSkillName(skill)` for each skill
- **Languages section** (UX-IMPORTANT-08): Show only if user has set languages. Graceful fallback: section hidden if empty
- **Translation**: Language names translated to visitor's locale via `Intl.DisplayNames`
- **Proficiency badges** — distinct visual variants:
  - Native: `badge badge-primary` (filled, prominent)
  - Fluent: `badge badge-secondary` (filled, secondary color)
  - Conversational: `badge badge-info badge-outline` (outline, less prominent)
  - Basic: `badge badge-ghost` (minimal, subdued)
- Languages sorted by proficiency (Native first, Basic last) — not alphabetical
- **Credentials**: Education + Certifications
- **Availability (mobile only)**: Renders availability widget here on mobile via responsive conditional. Desktop users see it in the sidebar.
- Video introduction (StreamPlayer)
- **Translation**: Portfolio titles/descriptions via `getTranslatedPortfolioTitle/Description`

#### Task 3.7: ProfilePortfolioSection

- **Masonry grid** (CSS columns-1 sm:columns-2 lg:columns-3)
  - <640px: single column (too tight for 2 on small phones)
  - 640-1023px: 2-column masonry
  - > =1024px: 3-column masonry
- `break-inside: avoid; margin-bottom: 1rem;` on portfolio cards (UX-IMPORTANT-02)
- Images: `aspect-ratio: 16/9` so they're recognizable at small sizes
- ONE hero image per project in grid
- Click opens PhotoSwipe lightbox for all project images
  - Lightbox: focus trap when open, focus returns to triggering image on close, `aria-label` on images (UX-SUGGESTION-11)
- Skill-based filter bar
- **Translation**: Use `getTranslatedPortfolioTitle()` and `getTranslatedPortfolioDescription()`

#### Task 3.8: ProfileSidebar + Mobile Availability

- **Desktop**: Sidebar with performance stats + availability widget + Report button
  - Performance: **Tasks completed count, Rating, Skills count, Portfolio count** only
  - **NO completion rate, on-time rate, repeat client %** per user requirement
  - Availability widget (time slots, max bookings per day)
  - Quick actions: **Report button only** (no message buttons per user requirement)
- **Mobile (UX-CRITICAL-03)**: Sidebar is hidden on mobile, but availability and report must remain accessible:
  - **Availability**: Display as a collapsible section within `ProfileAboutSection` on mobile (below credentials, above video). Same data, same component, just rendered in a different parent on mobile breakpoints.
  - **Report**: Available via the `ActionsMenu` (⋯ overflow menu) which is already in the profile hero. Verify the Report action is present in the menu on all breakpoints.
- Implementation: Use `{#if}` with Tailwind responsive classes or a `mediaQuery` rune to conditionally render availability in the sidebar (desktop) vs About section (mobile)

#### Task 3.9: Hire Me Flow (General Inquiry)

- **ProfileHero** Hire Me button opens `RequestQuoteModal` with a virtual service object:

```typescript
import { ServicePricingTypeEnum, ServiceLocationTypeEnum } from '$lib/utils/enums/service.enum';
import KINDS from '$lib/utils/constants/kinds';

const generalInquiryService = $derived({
	id: `general-${hexPubkey}`,
	uniqueId: `general-inquiry-${Date.now()}`,
	npub: hexPubkey,
	status: 'active' as ServiceStatus,
	eventKind: KINDS.SERVICE_ACTIVE,
	title: $t('common.profile.general_inquiry'),
	description: '',
	serviceLocationTypes: [ServiceLocationTypeEnum.REMOTE],
	pricing: { type: ServicePricingTypeEnum.INQUIRY_REQUIRED, currency: 'USDt' } as ServicePricing,
	skills: [],
	categories: [],
	createdAt: Math.floor(Date.now() / 1000),
	creator: { username: userProfile?.name ?? '', avatar: userPicture() }
} as Service);
```

- Reuses existing `RequestQuoteModal` — collects title + description + attachments
- Calls existing `publishServiceQuoteRequest()` with the virtual service
- Pass `serviceEventId: ''` explicitly to avoid storing the fake `id` in the quote event:

```typescript
await publishServiceQuoteRequest({
	service: generalInquiryService,
	payload,
	quoteRequestId: crypto.randomUUID(),
	serviceEventId: '' // No backing event for general inquiry
});
```

- Provider sees it in `ServiceQuotesInbox` as a general inquiry
- **No protocol changes needed** — reuses existing encrypted event infrastructure
- **Translation**: Modal content translated via existing i18n keys
- **Auth gate**: If not logged in, redirect to `/auth/signup` with return URL

### Phase 4: Page Integration

#### Task 4.1: Refactor Profile Page

- **File**: `src/routes/npub/[npub]/+page.svelte`
- Fetch only profile + reviews on mount (`Promise.allSettled`)
- Services/tasks fetched lazily by their components
- Fix existing `$derived(() => expr)` → `$derived(expr)` for `userPicture`
- Add section IDs for scroll targets
- Replace inline sections with component references
- Add mobile sticky bottom CTA bar (Hire Me only)
- Validate all external URLs with inline http/https check (no `safeUrl()` utility exists)
- Preserve existing `loadUserReviews` logic (both received + given)
- Remove all message/chat buttons
- **Translation**: All user-generated content passed through translation functions before rendering

**Data flow:**

```typescript
const results = await Promise.allSettled([
	fetchComprehensiveProfile(hexPubkey),
	loadUserReviews(hexPubkey)
]);
const profile = results[0].status === 'fulfilled' ? results[0].value : null;
// Services, tasks fetched lazily by their own components
```

### Phase 5: Translations

#### Task 5.1: Add i18n Keys

- **Files**: `static/locales/en/common.json`, `static/locales/es/common.json`
- New keys:
  - `common.profile.services` → "Services"
  - `common.profile.tasks` → "Tasks"
  - `common.profile.reviews` → "Reviews"
  - `common.profile.no_services` → "No services listed yet"
  - `common.profile.no_tasks` → "No tasks posted yet"
  - `common.profile.load_more` → "Load more"
  - `common.profile.browse_all` → "Browse All"
  - `common.profile.view_service` → "View Service"
  - `common.profile.view_task` → "View Task"
  - `common.profile.verified` → "Verified"
  - `common.profile.verified_task` → "Verified task"
  - `common.profile.verified_service` → "Verified service"
  - `common.profile.hire_me` → "Hire Me"
  - `common.profile.languages` → "Languages"
  - `common.profile.credentials` → "Credentials"
  - `common.profile.show_more_services` → "Show {count} more services"
  - `common.profile.general_inquiry` → "General Inquiry"
  - `common.profile.signup_to_hire` → "Sign up to hire"
  - `profile.edit.languages` → "Languages"
  - `profile.edit.add_language` → "Add Language"
  - `profile.edit.proficiency.native` → "Native"
  - `profile.edit.proficiency.fluent` → "Fluent"
  - `profile.edit.proficiency.conversational` → "Conversational"
  - `profile.edit.proficiency.basic` → "Basic"

#### Task 5.2: Translation Strategy for User-Generated Content

BitTasker has a mature two-phase translation system. **DO NOT rebuild.**

**Write-time (content creation) — already built:**

- `src/lib/services/translation.service.ts` → `TranslationService` (Google Translate proxy, EN/ES, caching, batch, rate limiting)
- `src/lib/nostr/profile/translations.ts` → 4 generators:
  - `generateProfileTranslations({ professionalTitle, about })`
  - `generateSkillTranslations(skillName, fallbackLocale?)`
  - `generateCertificationTranslations(name, issuer)`
  - `generatePortfolioTranslations({ title, description }, fallbackLocale?)`
- All store translations in Nostr event metadata (kind 0 for profile, event content for services/tasks)

**Read-time (display) — new shared utility (Task 0.1):**

- `src/lib/utils/profileTranslation.ts` → extracted from local functions in `ProfileInfoSection.svelte`
  - `getTranslatedProfileContent(profile, field, locale, originalValue)`
  - `getTranslatedSkillName(skill, locale)`
  - `getTranslatedPortfolioTitle(item, locale)`
  - `getTranslatedPortfolioDescription(item, locale)`
- All follow pattern: check sourceLanguage match → lookup translations → fall back to original

**Existing shared read-time exports (import directly, no changes needed):**

- `src/lib/utils/serviceDisplayTranslation.ts` → `getServiceDisplayTitle()`, `getServiceDisplayDescription()`
- `src/lib/services/task-translation.service.ts` → `getStoredTranslation(task, lang)`
- `src/lib/services/bid-translation.service.ts` → `getStoredTranslation(bid, field, lang)`

**Content type → translation path mapping:**
| Content Type | Write-time | Read-time |
|-------------|-----------|----------|
| Profile about/title | `generateProfileTranslations()` | `getTranslatedProfileContent(profile, field, locale, originalValue)` (Task 0.1) |
| Skills | `generateSkillTranslations()` | `getTranslatedSkillName(skill, locale)` (Task 0.1) |
| Portfolio | `generatePortfolioTranslations()` | `getTranslatedPortfolioTitle/Description(item, locale)` (Task 0.1) |
| Services | Existing in service creation flow | `getServiceDisplayTitle/Description()` (existing shared) |
| Tasks | Existing in task creation flow | `taskTranslationService.getStoredTranslation()` (existing shared) |
| **Languages** | **NEW**: `generateLanguageTranslations()` → add to `profile/translations.ts` (Task 1.4) | `Intl.DisplayNames` for language names + i18n keys for proficiency labels |
| Credentials | Existing `generateCertificationTranslations()` | Same pattern as skills |
| Reviews | N/A — reviewer's language, no translation | Plain text interpolation `{comment}` |
| **New fields** | Follow existing generator pattern in `profile/translations.ts` | Follow existing read-time pattern in `profileTranslation.ts` |

---

## 5. Component Hierarchy

```
/npub/[npub]/+page.svelte
+-- ProfileHero
|   +-- Avatar
|   +-- Rating (star 4.8/5 (127))
|   +-- Hire Me button -> RequestQuoteModal (general inquiry)
+-- ProfileNav (sticky, nav links, scroll-spy)
+-- ProfileServicesSection (id=services, self-fetching, lazy)
|   +-- FeaturedHomepageCardShell (grid, translated content)
+-- ProfilePortfolioSection (id=portfolio, self-fetching, lazy)
|   +-- Masonry grid + PhotoSwipe lightbox
|   +-- Skill filter bar
+-- ProfileReviewsSection (id=reviews, self-fetching, lazy)
|   +-- Rating distribution (role=meter)
|   +-- ReviewCard (cursor pagination)
+-- ProfileAboutSection (id=about)
|   +-- About (translated)
|   +-- Skills (translated)
|   +-- Languages (conditional, proficiency-sorted badges)
|   +-- Credentials
|   +-- Availability (mobile only — responsive conditional)
|   +-- StreamPlayer
+-- ProfileTasksSection (id=tasks, self-fetching, lazy)
|   +-- FeaturedHomepageCardShell (grid, translated content)
+-- ProfileSidebar (desktop only)
|   +-- Performance stats (tasks done, rating, skills, portfolio)
|   +-- Availability widget
|   +-- Report button
+-- Sticky mobile CTA bar (Hire Me only)
```

---

## 6. Responsive Breakpoints

| Breakpoint | Layout                             | Services/Tasks | Reviews    | Portfolio        | Availability     |
| ---------- | ---------------------------------- | -------------- | ---------- | ---------------- | ---------------- |
| <640px     | Single col, sticky CTA (safe-area) | 1-col stacked  | 1-col      | 1-col masonry    | In About section |
| 640-1279px | Single col, nav visible            | sm:2-col grid  | 2-col grid | sm:2-col masonry | In About section |
| >=1280px   | Content + sidebar                  | xl:3-col grid  | 3-col grid | lg:3-col masonry | In sidebar       |

---

## 7. Performance Strategy

- **Lazy loading**: Each section manages own state, fetches on first activation
- **On mount**: Only profile + reviews (2 queries)
- **Pagination**: Reviews cursor-based (6/page), services/tasks show 6 + expand
- **Images**: loading=lazy, PhotoSwipe for full-screen
- **NDK subscriptions**: Store in variable, `.stop()` in `$effect` cleanup

---

## 8. Accessibility

- Skip-to-content link at page top: `<a href="#services" class="sr-only focus:not-sr-only focus:absolute focus:z-50">Skip to content</a>`
- `<nav aria-label="Profile sections">` with anchor links
- `aria-current="true"` on active link
- Arrow key + Home/End key navigation between nav links
- Each section: `<section id="..." aria-labelledby="...-heading" aria-busy={isLoading}>`
- Lazy section results wrapped in `<div aria-live="polite">` so screen readers announce when data loads
- Rating bars: `role="meter"` with aria-valuenow/min/max
- Star rating: `aria-label="4.8 out of 5 stars, 127 reviews"` with `aria-hidden="true"` on star icons
- Horizontal scroll: `role="region"`, tabindex=0, arrow key scroll
- Review comments: plain text only (Svelte auto-escapes)
- "Load more" reviews: Wrap appended cards in `aria-live="polite"` container for screen reader announcement
- Lightbox: Escape key closes, focus returns to triggering image (PhotoSwipe handles natively, verify during implementation)
- Touch targets: Use `btn-md` (44px min) on mobile for interactive buttons; `btn-sm` acceptable only for desktop

---

## 9. Security

- URL validation: Inline check `url.startsWith('http://') || url.startsWith('https://')` — omit href if invalid (no `safeUrl()` utility exists in codebase)
- Review content: plain text interpolation, NEVER `{@html}`
- Event parsing: try-catch around JSON.parse, filter nulls
- Website href: validate before rendering

---

## 10. Svelte 5 Compliance

- All components use `$props<{}>()` syntax
- All `$derived` uses `$derived(expression)` NOT `$derived(() => expression)`
- Fix existing `userPicture` during refactor
- `$effect` cleanup for subscriptions and observers
- `$state` for all mutable state
- `$bindable()` for two-way props where needed

---

## 11. Visual Consistency

- Cards: `rounded-2xl shadow-lg`
- Backgrounds: `bg-base-200` page, `bg-base-100` cards
- Buttons: `btn btn-primary btn-sm`
- Badges: `badge badge-primary`, `badge badge-info badge-outline`
- Spacing: `gap-6`, `p-4`, `mb-4`

---

## 12. File Changes

### New Files (12)

```
src/lib/utils/profileTranslation.ts                     → Shared read-time translation display utility
src/lib/components/profile/ProfileHero.svelte
src/lib/components/profile/ProfileNav.svelte
src/lib/components/profile/ProfileServicesSection.svelte
src/lib/components/profile/ProfileTasksSection.svelte
src/lib/components/profile/ProfileReviewsSection.svelte
src/lib/components/profile/ProfilePortfolioSection.svelte
src/lib/components/profile/ProfileAboutSection.svelte
src/lib/components/profile/ProfileSidebar.svelte
src/lib/components/profile/ReviewCard.svelte
src/lib/components/profile/edit/Languages.svelte
src/lib/nostr/findProfileTasks.ts
```

### Modified Files (9)

```
src/routes/npub/[npub]/+page.svelte        → Major refactor
src/routes/(protected)/dashboard/profile/edit/+page.svelte → Add Languages section
src/lib/components/homepage/FeaturedHomepageSection.svelte → Add override props
src/lib/utils/reviews/queries.ts            → Add cursor-based pagination
src/lib/types/profile.d.ts                 → Add languages field to NostrProfile
src/lib/nostr/profile/metadata-wire.ts     → Add 'languages' to enrichment keys
src/lib/nostr/profile/translations.ts      → Add generateLanguageTranslations()
static/locales/en/common.json              → Add translation keys
static/locales/es/common.json              → Add translation keys
src/app.html                               → Append viewport-fit=cover to existing viewport meta
```

### Reused Unchanged

```
src/lib/nostr/findProfileServices.ts (import findProfileServicesByAuthor)
src/lib/nostr/profile/comprehensive-profile.ts
src/lib/utils/reviews/aggregation.ts
src/lib/utils/service-quote/publish.ts
src/lib/components/service/RequestQuoteModal.svelte
src/lib/components/homepage/FeaturedHomepageCardShell.svelte
src/lib/components/Avatar.svelte
src/lib/components/StreamPlayer.svelte
src/lib/components/moderation/ActionsMenu.svelte
```

---

## 13. Risk Mitigation

| Risk                    | Mitigation                                                                  |
| ----------------------- | --------------------------------------------------------------------------- |
| Nostr relay latency     | Per-section lazy loading, skeletons, error + retry                          |
| Malformed Nostr events  | try-catch in all parsers, filter nulls                                      |
| Tab flickering          | scroll-lock + scrollend + timeout fallback                                  |
| iOS Safari observer     | Multiple thresholds, ratio tracking, rootMargin                             |
| NDK subscription leak   | Store subs, .stop() in $effect cleanup                                      |
| javascript: URL XSS     | Inline http/https validation on all user URLs (no safeUrl() utility exists) |
| Large service/task sets | Limit 8, Browse All link                                                    |
| Review pagination NDK   | Cursor-based with until filter                                              |
| Visual inconsistency    | Reuse existing components + DaisyUI patterns                                |
| Missing languages data  | Graceful fallback: hide section if empty                                    |
| General inquiry service | Virtual service object, reuse existing quote modal                          |
| No SSR (Capacitor)      | All client-side fetching, no server.ts needed                               |

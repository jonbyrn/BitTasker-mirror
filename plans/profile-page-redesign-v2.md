# Profile Page Redesign Plan v2 (Audited & Revised)

## feat/profile-improvements

**Audited by:** Sally (UX), Winston (Architecture), Code Reviewer (Implementation)
**Audit confidence:** 95%+ after all critical/important findings addressed

---

## 1. Current State Analysis

### Existing Profile Page (`/npub/[npub]`)

- 4-column grid: 3 content cols + 1 sidebar
- Has: Profile header, video intro, about/skills, portfolio, stats sidebar, availability, quick actions
- **Missing**: Services listing, tasks listing, reviews display, hero section, tab navigation, verified badges, trust signals (response time, completion rate, online status)

### Existing Code to Reuse (verified paths)

- `src/lib/nostr/findProfileServices.ts` → `findProfileServicesByAuthor()` — queries KINDS.SERVICE_ACTIVE (30402), handles deletion cache, deduplication, status filtering, npub normalization
- `src/lib/nostr/profile/comprehensive-profile.ts` → `fetchComprehensiveProfile()`
- `src/lib/utils/reviews/queries.ts` → `getReviewsForUser()`, `getReviewsByReviewer()`
- `src/lib/utils/reviews/aggregation.ts` → `calculateReviewStats()`
- `src/lib/utils/constants/kinds.ts` → `KINDS.TASK_CREATION: 31000`, `KINDS.SERVICE_ACTIVE: 30402`
- `src/lib/components/homepage/FeaturedHomepageSection.svelte` → horizontal scroll (needs override props)
- `src/lib/components/homepage/FeaturedHomepageCardShell.svelte` → base card
- `src/lib/components/Avatar.svelte`, `StreamPlayer.svelte`, `ActionsMenu.svelte`
- `src/lib/types/review.d.ts` → `AttestedReview`, `ReviewStats`

---

## 2. Design Architecture

### Route Structure

```
/npub/[npub]/+page.svelte        → public profile page (REDESIGN)
/npub/[npub]/+page.server.ts     → NEW: SSR + JSON-LD structured data
```

### New Components

```
src/lib/components/profile/
├── ProfileHero.svelte           → Hero: avatar, name, rating, trust signals, CTAs
├── ProfileNav.svelte            → Section nav links (NOT tab pattern)
├── ProfileServicesSection.svelte → Services grid (self-fetching, lazy)
├── ProfileTasksSection.svelte   → Tasks grid (self-fetching, lazy)
├── ProfileReviewsSection.svelte → Reviews with cursor pagination
├── ProfilePortfolioSection.svelte → Portfolio masonry grid + lightbox
├── ProfileAvailabilitySection.svelte → Availability widget
├── ProfileAboutSection.svelte   → About + skills + credentials + languages
├── ProfileSidebar.svelte        → Stats + quick actions (desktop only)
└── ReviewCard.svelte            → Individual review card
```

---

## 3. ASCII Mockups

### 3.1 Desktop (>=1024px)

```
+--------------------------------------------------------------------------+
|  PROFILE HERO                                                            |
|  +--------+  +-------------------------------------------------------+  |
|  |        |  |  Name [checkmark] star 4.8/5 (127)  [green dot] Online |  |
|  | AVATAR |  |  Professional Title                                    |  |
|  | (large)|  |  Location  |  Responds < 2hrs  |  98% completion      |  |
|  |        |  |  [Hire Me (primary)]  [Message (outline)]              |  |
|  +--------+  +-------------------------------------------------------+  |
+--------------------------------------------------------------------------+

+--------------------------------------------------------------------------+
|  NAV: [Services] [Portfolio] [Reviews] [About] [Tasks]                   |
|  (nav links with counts, sticky on scroll, scroll-spy highlighting)      |
+--------------------------------------------------------------------------+

+--------------------------------------------------------------------------+
|  SERVICES (id=services)                                     [Browse All] |
|  +----------+  +----------+  +----------+                               |
|  | +------+ |  | +------+ |  | +------+ |                               |
|  | | IMG  | |  | | IMG  | |  | | IMG  | |                               |
|  | +------+ |  | +------+ |  | +------+ |                               |
|  | Title    |  | Title    |  | Title    |                               |
|  | Desc...  |  | Desc...  |  | Desc...  |                               |
|  | Remote   |  | Local    |  | Remote   |                               |
|  | $50/hr   |  | $200     |  | $75/hr   |                               |
|  | [View]   |  | [View]   |  | [View]   |                               |
|  +----------+  +----------+  +----------+                               |
|  [Show 12 more services]                                                 |
+--------------------------------------------------------------------------+

+--------------------------------------------------------------------------+
|  PORTFOLIO (id=portfolio)                                  [Filter: All] |
|  +------------------+ +------------------+ +------------------+          |
|  |  Hero Image      | |  Hero Image      | |  Hero Image      |          |
|  |  (click->lightbox)| |  (click->lightbox)| |  (click->lightbox)|         |
|  |  Project Title   | |  Project Title   | |  Project Title   |          |
|  |  Skills: React   | |  Skills: Figma   | |  Skills: Python  |          |
|  +------------------+ +------------------+ +------------------+          |
+--------------------------------------------------------------------------+

+--------------------------------------------------------------------------+
|  REVIEWS (id=reviews)            92% of clients recommend [Name]         |
|  star 4.8/5 avg  |  [####     ] 80% 5-star  |  [###      ] 15% 4-star   |
|  127 reviews      |  [#        ]  3% 3-star  |  [#        ]  1% 2-star   |
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
|  |  Lorem ipsum dolor sit amet...               | | Completion: 98%   | |
|  |  [Show more]                                 | | On-time: 95%      | |
|  |                                              | | Repeat: 40%       | |
|  |  Skills & Expertise                          | | Rating: 4.8 star  | |
|  |  [React] [Node.js] [Python] [AWS]           | | Member since: 2023| |
|  |                                              | |                   | |
|  |  Languages                                   | | AVAILABILITY      | |
|  |  English (Native) | Spanish (Conversational) | | Green Available   | |
|  |                                              | | Response: < 2hrs  | |
|  |  Credentials                                 | | Mon-Fri 9am-5pm   | |
|  |  B.S. CS, MIT (2020)                         | | Max/day: 3        | |
|  |  AWS Solutions Architect (2023)              | | Notice: 24hrs     | |
|  |                                              | |                   | |
|  |  VIDEO INTRODUCTION                          | | QUICK ACTIONS     | |
|  |  +----------------------------------------+| | [Message]         | |
|  |  |          Video Player                  || | [Report]          | |
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
|  | Local    |  | Remote   |  | Local    |                               |
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
|        |  AVATAR  | Online   |
|        | (large)  |          |
|        +----------+          |
|    Name [checkmark]          |
|    star 4.8/5 (127)          |
|    Professional Title        |
|    Location                  |
|    Responds < 2hrs           |
|                              |
|  +--------+ +--------+      |
|  | 127    | | star4.8|      |
|  | Review | | Rating |      |
|  +--------+ +--------+      |
|  +--------+ +--------+      |
|  | 15     | | 23     |      |
|  | Svc    | | Task   |      |
|  +--------+ +--------+      |
+------------------------------+
|  Nav (horiz scroll):         |
|  [Services][Portfolio]       |
|  [Reviews][About][Tasks]     |
+------------------------------+
|                              |
|  SECTION CONTENT             |
|  (all sections rendered,     |
|   scroll-to on nav click)    |
|                              |
|  Services:                   |
|  +--------------------------+|
|  |  Service Image           ||
|  |  Service Title           ||
|  |  Description...          ||
|  |  Remote  $50/hr          ||
|  |  [View Service]          ||
|  +--------------------------+|
|                              |
|  Reviews:                    |
|  +--------------------------+|
|  | star*5                   ||
|  | Amazing work on our      ||
|  | React application...     ||
|  | John D.  Mar 2024        ||
|  | Verified task            ||
|  +--------------------------+|
|                              |
+------------------------------+
|  +--------------------------+|
|  |  [Hire Me] (primary)     ||
|  |  [Message] (outline)     ||
|  +--------------------------+|
|  (sticky bottom CTA bar)    |
+------------------------------+
```

---

## 4. Implementation Tasks

### Phase 1: Data Layer

#### Task 1.1: Reuse Existing Service Fetch (NO new function)

- Import `findProfileServicesByAuthor` from `$lib/nostr/findProfileServices`
- Already handles: KINDS.SERVICE_ACTIVE (30402), deletion cache, deduplication, status filtering
- Default limit: 8

#### Task 1.2: Create User Tasks Query

- **File**: `src/lib/nostr/findProfileTasks.ts` (NEW)
- **Function**: `findProfileTasksByAuthor(authorPubkey, options?)`
- **Kind**: `KINDS.TASK_CREATION` (31000) — NOT 36070
- Mirror `findProfileServicesByAuthor` pattern
- Wrap `JSON.parse(event.content)` in try-catch, filter nulls
- Default limit: 8

#### Task 1.3: Add Cursor-Based Review Pagination

- **File**: `src/lib/utils/reviews/queries.ts` (enhance)
- Add `before?: number` parameter to `getReviewsForUser()`
- Use NDK `until` filter for cursor
- Return `{ reviews: AttestedReview[]; cursor: number | null }`
- Oldest review's `created_at` as cursor

#### Task 1.4: Create `+page.server.ts`

- **File**: `src/routes/npub/[npub]/+page.server.ts` (NEW)
- Server-side meta tags, JSON-LD (Person schema)
- Note: Nostr queries may not work server-side; provide page shell with meta tags

### Phase 2: Components

#### Task 2.0: Add Override Props to FeaturedHomepageSection

- Add `sectionClass` and `containerClass` optional props
- Profile usage: `<FeaturedHomepageSection sectionClass="" containerClass="" ...>`
- Why: Homepage section has hardcoded `bg-base-200 py-16` that conflicts with profile layout

#### Task 2.1: ProfileHero

- Large avatar with online status (green dot)
- Name + verified badge (inline) + rating (star 4.8/5 (127))
- Professional title badge, location, response time
- Trust signals: completion rate, on-time rate
- **Two CTAs**: Hire Me (btn-primary) + Message (btn-outline)
- **Mobile**: 2x2 stats grid, sticky bottom CTA bar
- **Security**: Validate website URL with `safeUrl()` (http/https only)
- Reuse: Avatar, ActionsMenu

#### Task 2.2: ProfileNav (NOT tab pattern)

- `<nav aria-label="Profile sections">` with anchor links
- Order: Services -> Portfolio -> Reviews -> About -> Tasks (buyer intent flow)
- Sticky with proper offset (`sticky top-16 z-10 shadow-md`)
- IntersectionObserver scroll-spy with scroll-lock flag
- **Scroll-lock implementation**:
  ```typescript
  function handleNavClick(sectionId: string) {
  	scrollLock = true;
  	activeSection = sectionId;
  	document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth' });
  	const onScrollEnd = () => {
  		scrollLock = false;
  		window.removeEventListener('scrollend', onScrollEnd);
  	};
  	window.addEventListener('scrollend', onScrollEnd, { once: true });
  	setTimeout(() => {
  		scrollLock = false;
  	}, 600);
  }
  ```
- **iOS Safari compatible IntersectionObserver**:
  ```typescript
  const observer = new IntersectionObserver(callback, {
  	rootMargin: '-80px 0px -60% 0px',
  	threshold: [0, 0.1, 0.25, 0.5, 0.75, 1]
  });
  ```
- URL hash sync for deep linking
- Arrow key navigation between links

#### Task 2.3: ProfileServicesSection (self-fetching, lazy)

- Section always in DOM (scroll target), data fetches on first `isActive`
- Desktop: Responsive grid (grid-cols-2 xl:grid-cols-3) — NOT horizontal scroll
- Mobile: Vertical stacked cards
- "Show more" after 6, "Browse All" link
- Uses FeaturedHomepageCardShell with pre-computed translated content
- Error state with retry button

#### Task 2.4: ProfileTasksSection (self-fetching, lazy)

- Same pattern as services, uses findProfileTasksByAuthor
- Error state with retry

#### Task 2.5: ProfileReviewsSection (self-fetching, lazy)

- Stats: Average rating, distribution bars (role="meter"), recommendation rate
- Responsive grid (1/2/3 cols)
- Cursor-based "Load more" pagination
- Verified badge per review
- **Security**: Plain text interpolation {comment}, NEVER {@html}

#### Task 2.6: ProfileAboutSection

- About text with show more/less
- Skills as pill badges
- **Languages** (NEW): "English (Native) | Spanish (Conversational)"
- **Credentials** (NEW): Education + Certifications
- Video introduction (StreamPlayer)

#### Task 2.7: ProfilePortfolioSection

- **Masonry grid** (CSS columns-2 lg:columns-3) — NOT per-card carousels
- ONE hero image per project in grid
- Click opens PhotoSwipe lightbox for all project images
- Skill-based filter bar

#### Task 2.8: ProfileAvailabilitySection

- Compact widget in About section sidebar (NOT standalone tab)
- Status indicator, time slots, response time, max bookings

#### Task 2.9: ProfileSidebar (desktop only)

- Performance stats: completion rate, on-time rate, repeat client %, tasks done, rating
- Availability widget
- Quick actions with ActionsMenu

### Phase 3: Page Integration

#### Task 3.1: Refactor Profile Page

- Fetch only profile + reviews on mount (Promise.allSettled)
- Services/tasks fetched lazily by their components
- Fix Svelte 4 `$derived(() => expr)` -> `$derived(expr)` for userPicture
- Add section IDs for scroll targets
- Replace inline sections with components
- Add mobile sticky bottom CTA bar
- Validate all external URLs with safeUrl()
- Preserve existing loadUserReviews logic (both received + given)

**Data flow:**

```typescript
const results = await Promise.allSettled([
	fetchComprehensiveProfile(hexPubkey),
	loadUserReviews(hexPubkey)
]);
const profile = results[0].status === 'fulfilled' ? results[0].value : null;
// Services, tasks fetched lazily by their own components
```

### Phase 4: Translations

New keys (existing ones like about, portfolio, availability, member_since reused):

- common.profile.services, .tasks, .reviews
- common.profile.no_services, .no_tasks
- common.profile.load_more, .browse_all
- common.profile.view_service, .view_task
- common.profile.verified, .verified_task, .verified_service
- common.profile.completion_rate, .on_time_rate, .repeat_clients
- common.profile.online, .last_active, .responds_within
- common.profile.languages, .credentials, .hire_me
- common.profile.recommendation_rate, .show_more_services
- common.profile.similar_providers

---

## 5. Component Hierarchy

```
/npub/[npub]/+page.svelte
+-- ProfileHero
|   +-- Avatar, Online indicator, Trust signals, CTAs
+-- ProfileNav (sticky, nav links)
+-- ProfileServicesSection (id=services, self-fetching)
|   +-- FeaturedHomepageCardShell (grid layout)
+-- ProfilePortfolioSection (id=portfolio, self-fetching)
|   +-- Masonry grid + PhotoSwipe lightbox
+-- ProfileReviewsSection (id=reviews, self-fetching)
|   +-- Rating distribution (role=meter)
|   +-- ReviewCard (cursor pagination)
+-- ProfileAboutSection (id=about)
|   +-- About, Skills, Languages, Credentials, StreamPlayer
+-- ProfileTasksSection (id=tasks, self-fetching)
|   +-- FeaturedHomepageCardShell (grid layout)
+-- ProfileSidebar (desktop only)
|   +-- Performance stats, Availability, Quick actions
+-- Sticky mobile CTA bar (mobile only)
```

---

## 6. Responsive Breakpoints

| Breakpoint | Layout                  | Services/Tasks | Reviews    | Portfolio     |
| ---------- | ----------------------- | -------------- | ---------- | ------------- |
| <640px     | Single col, sticky CTA  | Stacked cards  | 1-col      | 2-col masonry |
| 640-1023px | Single col, nav visible | 2-col grid     | 2-col grid | 2-col masonry |
| >=1024px   | Content + sidebar       | 2/3-col grid   | 3-col grid | 3-col masonry |

---

## 7. Performance Strategy

- **Lazy loading**: Each section manages own state, fetches on first activation
- **On mount**: Only profile + reviews (2 relay queries)
- **Pagination**: Reviews cursor-based (6/page), services/tasks show 6 + expand
- **Images**: loading=lazy, PhotoSwipe for full-screen
- **NDK subscriptions**: Store in variable, .stop() in $effect cleanup

---

## 8. Accessibility

- `<nav aria-label="Profile sections">` with anchor links (NOT tab pattern)
- `aria-current="true"` on active link
- Arrow key navigation between nav links
- Each section: `<section id="..." aria-labelledby="...-heading">`
- Rating bars: `role="meter"` with aria-valuenow/min/max
- Horizontal scroll: `role="region"`, tabindex=0, arrow key scroll
- Review comments: plain text only (Svelte auto-escapes)

---

## 9. Security

- URL validation: `safeUrl()` checks http/https protocol only
- Review content: plain text interpolation, NEVER {@html}
- Event parsing: try-catch around JSON.parse, filter nulls
- Website href: validate before rendering

---

## 10. Svelte 5 Compliance

- All components use `$props<{}>()` syntax
- All `$derived` uses `$derived(expression)` NOT `$derived(() => expression)`
- Fix existing userPicture during refactor
- `$effect` cleanup for subscriptions and observers

---

## 11. Visual Consistency

- Cards: rounded-2xl shadow-lg (matches existing)
- Backgrounds: bg-base-200 page, bg-base-100 cards
- Buttons: btn btn-primary btn-sm
- Badges: badge badge-primary, badge badge-info badge-outline
- Spacing: gap-6, p-4, mb-4

---

## 12. File Changes

### New Files (12)

```
src/lib/components/profile/ProfileHero.svelte
src/lib/components/profile/ProfileNav.svelte
src/lib/components/profile/ProfileServicesSection.svelte
src/lib/components/profile/ProfileTasksSection.svelte
src/lib/components/profile/ProfileReviewsSection.svelte
src/lib/components/profile/ProfilePortfolioSection.svelte
src/lib/components/profile/ProfileAvailabilitySection.svelte
src/lib/components/profile/ProfileAboutSection.svelte
src/lib/components/profile/ProfileSidebar.svelte
src/lib/components/profile/ReviewCard.svelte
src/lib/nostr/findProfileTasks.ts
src/routes/npub/[npub]/+page.server.ts
```

### Modified Files (5)

```
src/routes/npub/[npub]/+page.svelte
src/lib/components/homepage/FeaturedHomepageSection.svelte
src/lib/utils/reviews/queries.ts
static/locales/en/common.json
static/locales/es/common.json
```

### Reused Unchanged

```
src/lib/nostr/findProfileServices.ts (import findProfileServicesByAuthor)
src/lib/nostr/profile/comprehensive-profile.ts
src/lib/utils/reviews/aggregation.ts
src/lib/components/homepage/FeaturedHomepageCardShell.svelte
src/lib/components/Avatar.svelte
src/lib/components/StreamPlayer.svelte
src/lib/components/moderation/ActionsMenu.svelte
```

---

## 13. Risk Mitigation

| Risk                    | Mitigation                                         |
| ----------------------- | -------------------------------------------------- |
| Nostr relay latency     | Per-section lazy loading, skeletons, error + retry |
| Malformed Nostr events  | try-catch in all parsers, filter nulls             |
| Tab flickering          | scroll-lock + scrollend + timeout fallback         |
| iOS Safari observer     | Multiple thresholds, ratio tracking, rootMargin    |
| NDK subscription leak   | Store subs, .stop() in $effect cleanup             |
| javascript: URL XSS     | safeUrl() validation on all user URLs              |
| Large service/task sets | Limit 8, Browse All link                           |
| Review pagination NDK   | Cursor-based with until filter                     |
| Visual inconsistency    | Reuse existing components + DaisyUI patterns       |

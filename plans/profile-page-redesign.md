# Profile Page Redesign Plan

## feat/profile-improvements

### Overview

Redesign the public user profile page (`/npub/[npub]`) to be a modern, marketing-friendly showcase page for gig economy workers. Adapts styling patterns from the service listing pages and homepage card components. Fully mobile-first and responsive.

---

## 1. Current State Analysis

### Existing Profile Page (`/npub/[npub]`)

- 4-column grid: 3 content cols + 1 sidebar
- Sections: Profile header, video intro, about/skills, portfolio, stats sidebar, availability, quick actions
- **Missing**: Services listing, tasks listing, reviews display, hero section, tab navigation, verified badges

### Patterns to Reuse

- `FeaturedHomepageSection` → horizontal scroll container for services/tasks
- `FeaturedHomepageCardShell` → base card component for service/task cards
- `FeaturedServiceCard` → service card wrapper
- `LiveTaskCard` → task card wrapper
- `ServiceCard` → full service card (for non-horizontal layouts)
- `TaskCard` → full task card
- `calculateReviewStats` + `getReviewsForUser` → existing review queries
- `Avatar` component → profile images
- `StreamPlayer` → video intro
- DaisyUI `card`, `badge`, `btn`, `tabs`, `menu` components
- Tailwind responsive: `md:`, `lg:` breakpoints, `grid-cols-1 lg:grid-cols-4`

---

## 2. Design Architecture

### Route Structure (no changes needed)

```
/npub/[npub]/+page.svelte        → public profile page (REDESIGN)
/npub/[npub]/+page.server.ts     → SEO data (may need updates)
```

### New Components to Create

```
src/lib/components/profile/
├── ProfileHero.svelte           → Hero banner with avatar, name, stats
├── ProfileTabs.svelte           → Tab navigation component
├── ProfileServicesSection.svelte → Services horizontal scroll (reuses FeaturedHomepageSection)
├── ProfileTasksSection.svelte   → Tasks horizontal scroll (reuses FeaturedHomepageSection)
├── ProfileReviewsSection.svelte → Reviews grid with stats summary
├── ProfilePortfolioSection.svelte → Refactored portfolio gallery
├── ProfileAvailabilitySection.svelte → Availability calendar/widget
├── ProfileAboutSection.svelte   → About + skills section
└── ProfileSidebar.svelte        → Stats, quick actions sidebar
```

---

## 3. ASCII Mockups

### 3.1 Desktop Layout (≥1024px)

```
┌──────────────────────────────────────────────────────────────────────────┐
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │                    PROFILE HERO SECTION                           │  │
│  │  ┌──────┐  ┌─────────────────────────────────────────────────┐   │  │
│  │  │      │  │  Name ⭐ 4.8 (127 reviews)    ✅ Verified       │   │  │
│  │  │ AVATAR│  │  Professional Title · 📍 Location               │   │  │
│  │(large) │  │  user@bittasker.com                              │   │  │
│  │      │  │                                                     │   │  │
│  │      │  │  [💬 Message] [📧 Chat] [📋 Hire Me]               │   │  │
│  │      │  └─────────────────────────────────────────────────────┘   │  │
│  │      │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐             │  │
│  │      │  │ 127    │ │ ⭐ 4.8 │ │  15    │ │  23    │             │  │
│  │      │  │Reviews │ │ Rating │ │Services│ │ Tasks  │             │  │
│  │      │  └────────┘ └────────┘ └────────┘ └────────┘             │  │
│  └──────┘                                                           │  │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ [About] [Services] [Tasks] [Reviews] [Portfolio] [Availability]│  │
│  └────────────────────────────────────────────────────────────────┘  │
│  (scrolls to section on click, sticky on scroll)                     │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│  ABOUT & SKILLS SECTION (default tab)                                    │
│  ┌──────────────────────────────────────────────┐ ┌────────────────────┐│
│  │  About Me                                    │ │  AVAILABILITY      ││
│  │  Lorem ipsum dolor sit amet, consectetur...  │ │                    ││
│  │  [Show more]                                 │ │  🟢 Available now  ││
│  │                                              │ │  Response: < 2hrs  ││
│  │  Skills & Expertise                          │ │                    ││
│  │  ┌────────┐ ┌────────┐ ┌────────┐           │ │  Mon 9am-5pm ✓     ││
│  │  │React   │ │Node.js │ │Python  │           │ │  Tue 9am-5pm ✓     ││
│  │  └────────┘ └────────┘ └────────┘           │ │  Wed 9am-5pm ✓     ││
│  │  ┌────────┐ ┌────────┐                       │ │  Thu 9am-5pm ✓     ││
│  │  │AWS     │ │Docker  │                       │ │  Fri 9am-5pm ✓     ││
│  │  └────────┘ └────────┘                       │ │                    ││
│  │                                              │ │  ⏱ Notice: 24hrs   ││
│  │  VIDEO INTRODUCTION                          │ │  📅 Max/day: 3     ││
│  │  ┌──────────────────────────────────────────┐│ └────────────────────┘│
│  │  │          🎬 Video Player                 ││                       │
│  │  │                                          ││ ┌────────────────────┐│
│  │  └──────────────────────────────────────────┘│ │  PERFORMANCE       ││
│  └──────────────────────────────────────────────┘ │  Stats             ││
│                                                  │  Completed: 45     ││
│                                                  │  Rating: 4.8 ⭐    ││
│                                                  │  Skills: 15        ││
│                                                  │  Portfolio: 23     ││
│                                                  │  Member since: '23 ││
│                                                  └────────────────────┘│
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│  SERVICES SECTION                                                        │
│  My Services (15)                                           [Browse All] │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐    →  │
│  │ ┌──────┐ │ │ ┌──────┐ │ │ ┌──────┐ │ │ ┌──────┐ │ │ ┌──────┐ │      │
│  │ │ IMG  │ │ │ │ IMG  │ │ │ │ IMG  │ │ │ │ IMG  │ │ │ │ IMG  │ │      │
│  │ └──────┘ │ │ └──────┘ │ │ └──────┘ │ │ └──────┘ │ │ └──────┘ │      │
│  │ Title    │ │ Title    │ │ Title    │ │ Title    │ │ Title    │      │
│  │ Desc...  │ │ Desc...  │ │ Desc...  │ │ Desc...  │ │ Desc...  │      │
│  │ 📍Remote │ │ 📍Local  │ │ 📍Remote │ │ 📍Remote │ │ 📍Local  │      │
│  │ $50/hr   │ │ $200     │ │ $75/hr   │ │ Request  │ │ $150     │      │
│  │[View →]  │ │[View →]  │ │[View →]  │ │[Quote →] │ │[View →]  │      │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘      │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│  TASKS SECTION                                                           │
│  My Tasks (8)                                               [Browse All] │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐    →  │
│  │ Task     │ │ Task     │ │ Task     │ │ Task     │ │ Task     │      │
│  │ Title    │ │ Title    │ │ Title    │ │ Title    │ │ Title    │      │
│  │ Desc...  │ │ Desc...  │ │ Desc...  │ │ Desc...  │ │ Desc...  │      │
│  │ $200     │ │ $500     │ │ $150     │ │ $300     │ │ $100     │      │
│  │ Deadline │ │ Deadline │ │ Deadline │ │ Deadline │ │ Deadline │      │
│  │ 📍Local  │ │ 📍Remote │ │ 📍Local  │ │ 📍Remote │ │ 📍Local  │      │
│  │[Open] 🟢 │ │[Done] ✅ │ │[Open] 🟢 │ │[Prog] 🟡 │ │[Open] 🟢 │      │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘      │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│  REVIEWS SECTION                                                         │
│  Reviews (127)                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │  ⭐ 4.8 average    ████████░░ 80% 5-star                         │  │
│  │  127 total reviews  ██████░░░░ 15% 4-star                         │  │
│  │                    ██░░░░░░░░  3% 3-star                         │  │
│  │                    █░░░░░░░░░  1% 2-star                         │  │
│  │                    ░░░░░░░░░░  1% 1-star                         │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌─────────────────────┐ ┌─────────────────────┐ ┌─────────────────────┐│
│  │ ⭐⭐⭐⭐⭐           │ │ ⭐⭐⭐⭐⭐           │ │ ⭐⭐⭐⭐            ││
│  │ "Amazing work on    │ │ "Very professional  │ │ "Good quality but   ││
│  │  our React app..."  │ │  and responsive..." │ │  took longer..."    ││
│  │                     │ │                     │ │                     ││
│  │ 👤 John D.          │ │ 👤 Sarah M.         │ │ 👤 Alex K.          ││
│  │ 📅 Mar 2024         │ │ 📅 Feb 2024         │ │ 📅 Jan 2024         ││
│  │ Task: Web Dev       │ │ Service: Design     │ │ Task: API           ││
│  └─────────────────────┘ └─────────────────────┘ └─────────────────────┘│
│                                                                          │
│  [Load more reviews...]                                                  │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│  PORTFOLIO SECTION                                                       │
│  Portfolio (23)                                                         │
│  ┌──────────────────────┐ ┌──────────────────────┐ ┌────────────────────┐│
│  │  ┌──────────────────┐│ │  ┌──────────────────┐│ │  ┌────────────────┐││
│  │  │                  ││ │  │                  ││ │  │                │││
│  │  │   Project Image  ││ │  │   Project Image  ││ │  │ Project Image  │││
│  │  │   Carousel       ││ │  │   Carousel       ││ │  │ Carousel       │││
│  │  │                  ││ │  │                  ││ │  │                │││
│  │  └──────────────────┘│ │  └──────────────────┘│ │  └────────────────┘││
│  │  Project Title       │ │  Project Title       │ │  Project Title     ││
│  │  Skills: React, Node │ │  Skills: Figma, CSS  │ │  Skills: Python    ││
│  │  Description...      │ │  Description...      │ │  Description...    ││
│  │  [🔗 Visit Project]  │ │  [🔗 Visit Project]  │ │  [🔗 Visit]        ││
│  └──────────────────────┘ └──────────────────────┘ └────────────────────┘│
└──────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Mobile Layout (<768px)

```
┌────────────────────────────────┐
│         ← Back                │
├────────────────────────────────┤
│        ┌──────────┐            │
│        │          │            │
│        │  AVATAR  │            │
│        │ (large)  │            │
│        │          │            │
│        └──────────┘            │
│                                │
│    Name ⭐ 4.8 (127)          │
│    ✅ Verified                 │
│    Professional Title          │
│    📍 Location                 │
│    user@bittasker.com          │
│                                │
│  ┌────────┐ ┌────────┐        │
│  │💬 Msg  │ │📧 Chat │        │
│  └────────┘ └────────┘        │
│                                │
│  ┌──────┐┌──────┐┌──────┐┌────┐│
│  │ 127  ││⭐4.8 ││  15  ││ 23 ││
│  │Review││Rating││Svc   ││Task││
│  └──────┘└──────┘└──────┘└────┘│
├────────────────────────────────┤
│  Tabs (horizontal scroll):     │
│  [About][Services][Tasks]      │
│  [Reviews][Portfolio]          │
│  [Availability]                │
├────────────────────────────────┤
│  ACTIVE TAB CONTENT            │
│  (swipeable between tabs)      │
│                                │
│  Services:                     │
│  ┌────────────────────────┐    │
│  │  ┌────────────────────┐│    │
│  │  │   Service Image    ││    │
│  │  └────────────────────┘│    │
│  │  Service Title         │    │
│  │  Description...        │    │
│  │  📍 Remote  $50/hr     │    │
│  │  [View Service →]      │    │
│  └────────────────────────┘    │
│  ┌────────────────────────┐    │
│  │  ┌────────────────────┐│    │
│  │  │   Service Image    ││    │
│  │  └────────────────────┘│    │
│  │  Service Title         │    │
│  │  Description...        │    │
│  │  📍 Local  $200        │    │
│  │  [View Service →]      │    │
│  └────────────────────────┘    │
│                                │
│  Reviews:                      │
│  ┌────────────────────────┐    │
│  │ ⭐⭐⭐⭐⭐              │    │
│  │ "Amazing work on our   │    │
│  │  React application..." │    │
│  │                        │    │
│  │ 👤 John D.  📅 Mar '24 │    │
│  └────────────────────────┘    │
│  ┌────────────────────────┐    │
│  │ ⭐⭐⭐⭐⭐              │    │
│  │ "Very professional and │    │
│  │  responsive to needs.."│    │
│  │ 👤 Sarah M. 📅 Feb '24 │    │
│  └────────────────────────┘    │
└────────────────────────────────┘
```

---

## 4. Implementation Tasks

### Phase 1: Data Layer & Queries

#### Task 1.1: Create User Services Query

- **File**: `src/lib/nostr/profile.ts` (add function)
- **Function**: `fetchUserServices(pubkey: string): Promise<Service[]>`
- **Logic**: Query Nostr relay for kind 30402 (NIP-99 classified listings) authored by the user's pubkey
- **Filter**: Only published/active services
- **Reuse**: Existing service parsing logic from `FeaturedServicesService`

#### Task 1.2: Create User Tasks Query

- **File**: `src/lib/nostr/profile.ts` (add function)
- **Function**: `fetchUserTasks(pubkey: string): Promise<Task[]>`
- **Logic**: Query Nostr relay for kind 36070 (BitTasker task events) authored by the user's pubkey
- **Filter**: Open/in-progress tasks only for display
- **Reuse**: Existing task parsing logic from `FeaturedTasksService`

#### Task 1.3: Extend Review Query

- **File**: `src/lib/nostr/profile.ts` (enhance existing)
- **Current**: `getReviewsForUser()` already exists, returns `ReviewAttestation[]`
- **Enhancement**: Add pagination support (load first 6, load more button)
- **Keep**: Existing `calculateReviewStats()` for aggregate stats

### Phase 2: Component Implementation

#### Task 2.1: ProfileHero Component

- **File**: `src/lib/components/profile/ProfileHero.svelte`
- **Props**: `userProfile`, `reviewStats`, `tasksCompleted`, `servicesCount`, `tasksCount`, `averageRating`, `hexPubkey`
- **Design**:
  - Large avatar (responsive: `w-24 h-24` mobile, `w-40 h-40` desktop)
  - Name + rating badge + verified checkmark
  - Professional title as badge
  - Location + website + email
  - Action buttons (Message, Chat, Hire Me)
  - Stats row (Reviews, Rating, Services, Tasks) as mini cards
- **Reuse**: Existing `Avatar` component, existing `ActionsMenu`
- **Styling**: `card bg-base-100 rounded-2xl shadow-lg` (matches current)

#### Task 2.2: ProfileTabs Component

- **File**: `src/lib/components/profile/ProfileTabs.svelte`
- **Props**: `activeTab`, `onTabChange`, `tabCounts`
- **Tabs**: About, Services, Tasks, Reviews, Portfolio, Availability
- **Design**:
  - Desktop: Horizontal tab bar with icons, sticky on scroll
  - Mobile: Horizontal scrollable tab row with snap
  - Active tab: `tab-active` DaisyUI class
  - Badge counts on each tab (e.g., "Services (15)")
- **Behavior**: Click scrolls to section (smooth scroll), IntersectionObserver highlights active tab
- **Styling**: DaisyUI `tabs` component + Tailwind responsive

#### Task 2.3: ProfileServicesSection

- **File**: `src/lib/components/profile/ProfileServicesSection.svelte`
- **Props**: `services`, `loading`, `error`
- **Design**: Wraps `FeaturedHomepageSection` with service-specific config
  - `cardWidthClass="w-80"` (matches homepage)
  - Uses `FeaturedHomepageCardShell` for each card
  - Card content: image, title, description, price, location, [View Service] CTA
  - "Browse All" button links to `/services?provider={npub}`
  - Empty state: "No services listed yet"
- **Reuse**: `FeaturedHomepageSection`, `FeaturedHomepageCardShell`
- **Data flow**: Fetch on mount via `fetchUserServices(hexPubkey)`

#### Task 2.4: ProfileTasksSection

- **File**: `src/lib/components/profile/ProfileTasksSection.svelte`
- **Props**: `tasks`, `loading`, `error`
- **Design**: Same pattern as services section
  - Uses `FeaturedHomepageSection` with task card rendering
  - Card content: title, description, budget, deadline, location, status badge
  - "Browse All" button links to `/tasks?creator={npub}`
  - Empty state: "No tasks posted yet"
- **Reuse**: `FeaturedHomepageSection`, `FeaturedHomepageCardShell`
- **Data flow**: Fetch on mount via `fetchUserTasks(hexPubkey)`

#### Task 2.5: ProfileReviewsSection

- **File**: `src/lib/components/profile/ProfileReviewsSection.svelte`
- **Props**: `reviewStats`, `reviews`, `loading`
- **Design**:
  - Stats summary bar: average rating (large), rating distribution bars (5-star to 1-star), total count
  - Review cards in responsive grid (1 col mobile, 2 cols tablet, 3 cols desktop)
  - Each review card: star rating, review text (3-line clamp), reviewer name/avatar, date, source (task/service)
  - "Load more" button for pagination
  - Empty state: "No reviews yet"
- **New sub-component**: `ReviewCard.svelte` for individual review display
- **Reuse**: Existing `calculateReviewStats()`, existing `Avatar` component

#### Task 2.6: ProfileAboutSection

- **File**: `src/lib/components/profile/ProfileAboutSection.svelte`
- **Props**: `userProfile`, `getTranslatedProfileContent`, `getTranslatedSkillName`
- **Design**: Refactored from current profile page
  - About text with show more/less (existing logic)
  - Skills as pill badges with verification indicators
  - Certifications list
  - Video introduction (existing `StreamPlayer`)
- **Reuse**: Existing about/skills rendering logic, `StreamPlayer`

#### Task 2.7: ProfilePortfolioSection

- **File**: `src/lib/components/profile/ProfilePortfolioSection.svelte`
- **Props**: `portfolio`, `getTranslatedPortfolioTitle`, `getTranslatedPortfolioDescription`
- **Design**: Refactored from current profile page
  - 2-column grid (1 col mobile, 2 cols desktop)
  - Each project card: image carousel, title, skills, description, link
  - PhotoSwipe lightbox for full-screen viewing (matches ServiceDetailsView)
- **Reuse**: Existing portfolio rendering logic, image carousel controls

#### Task 2.8: ProfileAvailabilitySection

- **File**: `src/lib/components/profile/ProfileAvailabilitySection.svelte`
- **Props**: `availability`
- **Design**: Refactored from current sidebar into its own section
  - Availability status indicator (green/yellow dot)
  - Time slots display (day + hours)
  - Response time
  - Max bookings per day
  - Break between bookings
- **Reuse**: Existing availability rendering logic

#### Task 2.9: ProfileSidebar

- **File**: `src/lib/components/profile/ProfileSidebar.svelte`
- **Props**: `reviewStats`, `tasksCompleted`, `userProfile`, `hexPubkey`, `averageRating`
- **Design**: Desktop-only sidebar (hidden on mobile, stats shown in hero on mobile)
  - Performance stats card
  - Quick actions card
  - ActionsMenu for moderation
- **Reuse**: Existing sidebar rendering logic, `ActionsMenu`

### Phase 3: Page Integration

#### Task 3.1: Refactor Profile Page

- **File**: `src/routes/npub/[npub]/+page.svelte`
- **Changes**:
  - Import all new profile components
  - Add service/task fetching to `loadUserProfile()` (parallel with profile + reviews)
  - Replace inline sections with component references
  - Add tab state management + IntersectionObserver for scroll-based tab highlighting
  - Add section IDs for scroll targets (`id="about"`, `id="services"`, etc.)
  - Update skeleton loading to match new layout
  - Ensure mobile tab state persistence

#### Task 3.2: Update Page Server (SEO)

- **File**: `src/routes/npub/[npub]/+page.server.ts`
- **Changes**: Add services/tasks count to JSON-LD structured data if available

### Phase 4: Translation Keys

#### Task 4.1: Add i18n Keys

- **Files**: `static/locales/en/*.json`, `static/locales/es/*.json`
- **New keys**:
  - `common.profile.services` → "Services"
  - `common.profile.tasks` → "Tasks"
  - `common.profile.reviews` → "Reviews"
  - `common.profile.portfolio` → "Portfolio" (already exists)
  - `common.profile.availability` → "Availability" (already exists)
  - `common.profile.about` → "About" (already exists)
  - `common.profile.no_services` → "No services listed yet"
  - `common.profile.no_tasks` → "No tasks posted yet"
  - `common.profile.load_more` → "Load more"
  - `common.profile.browse_all` → "Browse All"
  - `common.profile.rating_distribution` → "Rating Distribution"
  - `common.profile.view_service` → "View Service"
  - `common.profile.view_task` → "View Task"
  - `common.profile.verified` → "Verified"
  - `common.profile.member_since` → "Member since"

---

## 5. Component Hierarchy

```
/npub/[npub]/+page.svelte
├── ProfileHero
│   ├── Avatar (existing)
│   ├── ActionsMenu (existing)
│   └── Stats mini-cards
├── ProfileTabs
│   └── Tab buttons with counts
├── ProfileAboutSection (id="about")
│   ├── About text + show more/less
│   ├── Skills badges
│   ├── Certifications
│   └── StreamPlayer (video intro)
├── ProfileServicesSection (id="services")
│   └── FeaturedHomepageSection
│       └── FeaturedHomepageCardShell (×N)
├── ProfileTasksSection (id="tasks")
│   └── FeaturedHomepageSection
│       └── FeaturedHomepageCardShell (×N)
├── ProfileReviewsSection (id="reviews")
│   ├── Rating distribution bars
│   └── ReviewCard (×N)
├── ProfilePortfolioSection (id="portfolio")
│   └── Project cards with image carousels
├── ProfileAvailabilitySection (id="availability")
│   └── Time slots + status
└── ProfileSidebar (desktop only)
    ├── Performance stats
    └── Quick actions
```

---

## 6. Responsive Breakpoints

| Breakpoint          | Layout                                | Services/Tasks           | Reviews       |
| ------------------- | ------------------------------------- | ------------------------ | ------------- |
| <640px (mobile)     | Single column, tabs horizontal scroll | Full-width stacked cards | 1-col stacked |
| 640-1023px (tablet) | Single column, tabs visible           | 2-col grid               | 2-col grid    |
| ≥1024px (desktop)   | 3-col content + sidebar               | Horizontal scroll row    | 3-col grid    |

---

## 7. Data Flow

```typescript
// On mount (parallel fetch)
const [profile, services, tasks, reviews] = await Promise.all([
	fetchComprehensiveProfile(hexPubkey),
	fetchUserServices(hexPubkey), // NEW
	fetchUserTasks(hexPubkey), // NEW
	getReviewsForUser(hexPubkey, 6) // ENHANCED (paginated)
]);

// Derived state
const servicesCount = services.length;
const tasksCount = tasks.length;
const reviewStats = calculateReviewStats(reviews);
```

---

## 8. Accessibility

- All sections have `aria-labelledby` pointing to section headings
- Tab navigation uses `role="tablist"` + `role="tab"` + `role="tabpanel"`
- Horizontal scroll containers have `role="list"` + `role="listitem"`
- Focus management: tab key moves between sections
- Screen reader: section counts announced ("Services, 15 items")
- Color contrast: all text meets WCAG AA (using DaisyUI theme colors)

---

## 9. Performance Considerations

- **Lazy loading**: Services, tasks, and reviews fetched only when tab is first activated
- **Pagination**: Reviews load 6 at a time with "Load more" button
- **Image optimization**: Portfolio images use `loading="lazy"` attribute
- **Skeleton loading**: Each section has its own skeleton state
- **IntersectionObserver**: Used for tab highlighting (passive, no scroll listeners)

---

## 10. Visual Consistency Checklist

- [ ] Card shadows: `shadow-lg` / `shadow-xl` (matches existing)
- [ ] Border radius: `rounded-2xl` for cards (matches existing)
- [ ] Background: `bg-base-200` page, `bg-base-100` cards (matches existing)
- [ ] Typography: `font-bold` headings, `text-sm` body (matches existing)
- [ ] Badge styles: `badge badge-primary`, `badge badge-info badge-outline` (matches existing)
- [ ] Button styles: `btn btn-primary btn-sm` (matches existing)
- [ ] Spacing: `gap-6`, `p-4`, `mb-4` (matches existing)
- [ ] Scrollbar: `scrollbar-hide` class (matches homepage)
- [ ] Card width: `w-80` for horizontal scroll cards (matches homepage)
- [ ] Snap scroll: `snap-x snap-mandatory` (matches homepage)

---

## 11. Testing Strategy

- Unit tests for new query functions (`fetchUserServices`, `fetchUserTasks`)
- Component tests for each Profile\* component
- E2E test: Navigate to profile, verify all sections render, tab navigation works
- Visual regression: Screenshot comparison of desktop and mobile layouts
- Accessibility audit: axe-core automated scan
- Performance: Lighthouse score target ≥90

---

## 12. File Change Summary

### New Files (9)

```
src/lib/components/profile/ProfileHero.svelte
src/lib/components/profile/ProfileTabs.svelte
src/lib/components/profile/ProfileServicesSection.svelte
src/lib/components/profile/ProfileTasksSection.svelte
src/lib/components/profile/ProfileReviewsSection.svelte
src/lib/components/profile/ProfilePortfolioSection.svelte
src/lib/components/profile/ProfileAvailabilitySection.svelte
src/lib/components/profile/ProfileAboutSection.svelte
src/lib/components/profile/ProfileSidebar.svelte
```

### Modified Files (4)

```
src/routes/npub/[npub]/+page.svelte        → Major refactor
src/routes/npub/[npub]/+page.server.ts     → SEO enhancements
src/lib/nostr/profile.ts                    → Add fetchUserServices, fetchUserTasks
static/locales/en/common.json              → Add translation keys
static/locales/es/common.json              → Add translation keys
```

### Reused Components (unchanged)

```
src/lib/components/homepage/FeaturedHomepageSection.svelte
src/lib/components/homepage/FeaturedHomepageCardShell.svelte
src/lib/components/Avatar.svelte
src/lib/components/StreamPlayer.svelte
src/lib/components/moderation/ActionsMenu.svelte
src/lib/utils/reviews/queries.ts
src/lib/utils/reviews/aggregation.ts
```

---

## 13. Risk Mitigation

| Risk                                       | Mitigation                                                    |
| ------------------------------------------ | ------------------------------------------------------------- |
| Nostr query performance for services/tasks | Parallel fetch with profile, add loading skeletons            |
| Large number of reviews                    | Pagination (6 at a time), lazy load on tab activation         |
| Mobile tab UX                              | Horizontal scroll with snap, swipe gesture support            |
| Visual inconsistency with rest of app      | Strict reuse of existing card components and styling patterns |
| Breaking existing profile page             | Incremental refactor, component extraction first              |

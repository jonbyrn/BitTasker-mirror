# Profile Page Redesign Plan — Architecture Audit Report

**Auditor:** Winston (BMAD Architect)  
**Date:** 2026-06-04  
**Plan:** `plans/profile-page-redesign.md`  
**Confidence Target:** 95%+ production-ready

---

## Executive Summary

The plan is **well-structured** with excellent ASCII mockups, component decomposition, and responsive breakpoint coverage. However, **3 Critical issues** and **5 Important issues** must be resolved before implementation begins. The Critical issues will cause runtime errors or data loss; the Important issues will cause maintenance burden or degraded UX.

**Verdict: NOT READY FOR IMPLEMENTATION** until Critical items are resolved.

---

## Findings

### 1. Data Fetching Architecture

#### CRITICAL-01: Wrong Nostr Kind Number for Tasks (36070 vs 31000)

**Severity:** 🔴 Critical  
**Location:** Tasks 1.1, 1.2, Section 7 Data Flow  
**Detail:** The plan states:

> "Query Nostr relay for kind 36070 (BitTasker task events) authored by the user's pubkey"

**There is no kind 36070 in the codebase.** Tasks use `KINDS.TASK_CREATION = 31000` (parameterized replaceable event). This is confirmed in:

- `src/lib/utils/constants/kinds.ts` — `TASK_CREATION: 31000`
- `src/lib/nostr/findMyTasks.ts` — `kinds: [KINDS.TASK_CREATION]`
- `src/lib/nostr/findTasks.ts` — `kinds: [KINDS.TASK_CREATION]`

**Impact:** If implemented as written, the task query will return zero results silently (Nostr relays return empty arrays for unknown kinds, not errors). The Tasks section will always show "No tasks posted yet" even for users with tasks.

**Fix:** Replace `kind 36070` with `KINDS.TASK_CREATION (31000)` throughout the plan. Use `KINDS` constant, never hardcoded numbers.

---

#### CRITICAL-02: Duplicate Function — `fetchUserServices` vs Existing `findProfileServicesByAuthor`

**Severity:** 🔴 Critical  
**Location:** Task 1.1  
**Detail:** The plan proposes creating `fetchUserServices(pubkey)` in `src/lib/nostr/profile.ts`. This function **already exists** as `findProfileServicesByAuthor()` in `src/lib/nostr/findProfileServices.ts`:

```typescript
export async function findProfileServicesByAuthor(
	authorPubkey: string,
	options: { limit?: number } = {}
): Promise<Service[]>;
```

It already:

- Queries `KINDS.SERVICE_ACTIVE` (30402) ✅
- Filters by `authors: [normalizedPubkey]` ✅
- Handles deletion cache ✅
- Deduplicates by `uniqueId` ✅
- Filters `status === 'active'` ✅
- Normalizes npub/hex input ✅

**Impact:** Creating a duplicate function will cause confusion, divergent behavior, and maintenance burden. The existing function also handles edge cases (deletion cache, deduplication) that a new implementation would miss.

**Fix:** Import and reuse `findProfileServicesByAuthor` from `$lib/nostr/findProfileServices`. Do NOT create `fetchUserServices`.

---

#### CRITICAL-03: File Path Error — `profile.ts` is a Directory, Not a File

**Severity:** 🔴 Critical  
**Location:** Tasks 1.1, 1.2, 1.3  
**Detail:** The plan states:

> "File: `src/lib/nostr/profile.ts` (add function)"

This file **does not exist**. The profile module is a directory structure:

```
src/lib/nostr/profile/
├── comprehensive-profile.ts
├── display-profile.ts
├── index.ts
├── kinds-publish.ts
├── metadata-publish.ts
├── metadata-wire.ts
├── ndk.ts
├── profile-keys.ts
├── snapshot.ts
├── subscribe.ts
├── translations.ts
└── types.ts
```

The plan also references `src/lib/nostr/profile.ts` for Task 1.3 (extending review queries), but reviews live in `src/lib/utils/reviews/queries.ts`.

**Impact:** Developer will get file-not-found errors on first task. Wasted time discovering correct paths.

**Fix:**

- Task 1.1: Use existing `src/lib/nostr/findProfileServices.ts` (don't create new function)
- Task 1.2: Create `findProfileTasksByAuthor()` in new file `src/lib/nostr/findProfileTasks.ts` (following the `findProfileServices.ts` pattern)
- Task 1.3: Enhance `src/lib/utils/reviews/queries.ts`

---

#### IMPORTANT-01: No Public Task-by-Author Fetch Function Exists

**Severity:** 🟡 Important  
**Location:** Task 1.2  
**Detail:** `findMyTasks()` exists but is **auth-scoped** — it uses `getNpub()` to get the logged-in user's key and updates `myTasksStore`. There is no public equivalent of `findProfileServicesByAuthor` for tasks.

The plan must create a new `findProfileTasksByAuthor()` function that:

- Takes a pubkey (hex or npub) as parameter
- Queries `KINDS.TASK_CREATION` with `authors: [pubkey]`
- Does NOT require authentication
- Returns `Task[]` without store side effects
- Follows the `findProfileServicesByAuthor` pattern (deletion cache, deduplication)

**Fix:** Add Task 1.2 as a genuine new function. Model it after `findProfileServicesByAuthor`:

```typescript
// src/lib/nostr/findProfileTasks.ts
import type { Task } from '$lib/types/task.d';
import KINDS from '$lib/utils/constants/kinds';
import nostrEventsService from '$lib/api/services/nostr/events';
import { nip19 } from 'nostr-tools';

export async function findProfileTasksByAuthor(
	authorPubkey: string,
	options: { limit?: number } = {}
): Promise<Task[]> {
	const normalizedPubkey = normalizeAuthorPubkey(authorPubkey);
	const response = await nostrEventsService.requestEvents({
		filters: [
			{
				kinds: [KINDS.TASK_CREATION],
				authors: [normalizedPubkey],
				limit: options.limit ?? 8
			}
		]
	});
	// ... parse, dedupe, filter
}
```

---

#### IMPORTANT-02: Race Condition Risk in Parallel Fetch

**Severity:** 🟡 Important  
**Location:** Section 7 Data Flow  
**Detail:** The plan shows:

```typescript
const [profile, services, tasks, reviews] = await Promise.all([
	fetchComprehensiveProfile(hexPubkey),
	fetchUserServices(hexPubkey),
	fetchUserTasks(hexPubkey),
	getReviewsForUser(hexPubkey, 6)
]);
```

**Issues:**

1. `Promise.all` fails fast — if ANY query fails, ALL fail. The current codebase handles profile and reviews independently (line 377: `Promise.all` with separate try/catch in `loadUserReviews`).
2. `getReviewsForUser` uses NDK directly (`ndk.fetchEvent`), while services/tasks use `nostrEventsService`. Different relay connection pools could cause timing issues.
3. The existing `loadUserReviews()` fetches BOTH received AND given reviews in parallel (line 317). The plan only mentions `getReviewsForUser` (received), losing the "tasks completed" count from `getReviewsByReviewer`.

**Fix:** Use `Promise.allSettled` for resilient parallel fetch:

```typescript
const results = await Promise.allSettled([
	fetchComprehensiveProfile(hexPubkey),
	findProfileServicesByAuthor(hexPubkey),
	findProfileTasksByAuthor(hexPubkey),
	loadUserReviews(hexPubkey) // Keep existing function
]);

const profile = results[0].status === 'fulfilled' ? results[0].value : null;
const services = results[1].status === 'fulfilled' ? results[1].value : [];
const tasks = results[2].status === 'fulfilled' ? results[2].value : [];
// reviews handled by existing loadUserReviews with its own error handling
```

Also preserve the existing `getReviewsByReviewer` call for accurate `tasksCompleted` count.

---

#### IMPORTANT-03: Missing Error Boundaries for Each Data Source

**Severity:** 🟡 Important  
**Location:** Section 7, Task 3.1  
**Detail:** The plan shows `loading` and `error` props on `ProfileServicesSection` and `ProfileTasksSection`, but the Data Flow section doesn't define individual error states. Currently:

- Profile errors set `profileError` state
- Review errors are caught in `loadUserReviews` and silently set `reviewStats = null`

The plan needs per-section error states so a service fetch failure doesn't break the entire page.

**Fix:** Add individual error states:

```typescript
let servicesError = $state<string | null>(null);
let tasksError = $state<string | null>(null);
let services = $state<Service[]>([]);
let tasks = $state<Task[]>([]);
```

---

### 2. Component Decomposition

#### SUGGESTION-01: 9 Components is Correct Granularity

**Severity:** 🟢 Suggestion  
**Detail:** The proposed 9 components map cleanly to the 6 tab sections + hero + tabs + sidebar. This is appropriate for:

- Independent loading states per section
- Lazy rendering (only render active tab's component)
- Testability (each component has clear props boundary)

No circular dependency risks detected — all components are leaf nodes that receive data as props from the parent page.

**Minor concern:** `ProfileSidebar` duplicates data shown in `ProfileHero` on mobile. The plan correctly notes this ("hidden on mobile, stats shown in hero on mobile") but should ensure the stats row in `ProfileHero` uses the same derived values.

---

### 3. Svelte 5 Runes Compliance

#### IMPORTANT-04: `$derived` Usage Must Use Getter Syntax

**Severity:** 🟡 Important  
**Location:** Task 2.1 (ProfileHero), existing code line 224  
**Detail:** The existing codebase has one Svelte 4 pattern remaining:

```typescript
let userPicture = $derived(() => {
	// ← This is Svelte 4 store syntax
	if (userProfile?.pictures && userProfile.pictures.length > 0) {
		return userProfile.pictures[0].url;
	}
	return userProfile?.picture || '';
});
```

In Svelte 5, `$derived` should be:

```typescript
let userPicture = $derived(
	userProfile?.pictures?.length > 0 ? userProfile.pictures[0].url : userProfile?.picture || ''
);
```

The plan's new components MUST use the correct Svelte 5 `$derived(expression)` syntax, NOT `$derived(() => expression)` (which is the Svelte 4 compatibility wrapper).

**Fix:** Add to plan: "All `$derived` values must use `$derived(expression)` syntax, not `$derived(() => expression)`. Verify existing `userPicture` usage is updated." The Svelte 5 migration doc (`docs/svelte4-to-svelte5-migration-plan.md`) confirms this is an existing debt item.

---

#### SUGGESTION-02: Correct Svelte 5 Patterns for New Components

**Severity:** 🟢 Suggestion  
**Detail:** The plan should include a Svelte 5 template for new components:

```svelte
<script lang="ts">
	import type { Service } from '$lib/types/service.d';

	let {
		services,
		loading = false,
		error = null
	} = $props<{
		services: Service[];
		loading?: boolean;
		error?: string | null;
	}>();

	const servicesCount = $derived(services.length);
</script>
```

The existing `FeaturedHomepageSection.svelte` already uses this pattern correctly (line 4-32) — follow it.

---

### 4. State Management

#### SUGGESTION-03: Tab State Should Be Local, Not a Store

**Severity:** 🟢 Suggestion  
**Location:** Task 2.2, Task 3.1  
**Detail:** The plan mentions "tab state management" and "mobile tab state persistence." Tab state is page-scoped — it belongs to a single profile view instance. Creating a Svelte store would be overkill.

**Recommendation:** Use local `$state` in the page component with URL hash sync:

```typescript
let activeTab = $state<string>('about');

// Sync with URL hash for deep linking
$effect(() => {
	if (typeof window !== 'undefined') {
		const hash = window.location.hash.slice(1);
		if (validTabs.includes(hash)) activeTab = hash;
	}
});
```

For IntersectionObserver-based tab highlighting (scroll spy), store the observer in a `$state` variable and clean up in `$effect` return.

**Scroll position:** Don't persist scroll position across navigations — let the browser handle it. Only implement smooth scroll-to-section on tab click.

---

### 5. Performance

#### IMPORTANT-05: Fetching All Services/Tasks on Mount is Not Optimal

**Severity:** 🟡 Important  
**Location:** Task 3.1, Section 7  
**Detail:** The plan says in Section 9: "Lazy loading: Services, tasks, and reviews fetched only when tab is first activated." But Section 7 shows ALL data fetched in `Promise.all` on mount. **These contradict each other.**

For a user with 50+ services, fetching all on mount:

- Wastes bandwidth if user never visits the Services tab
- Increases initial page load time
- Loads 50+ service events from the relay

**The existing `findProfileServicesByAuthor` defaults to `limit: 8`** — this is reasonable for the horizontal scroll preview.

**Fix:** Implement true lazy loading:

1. On mount: fetch only profile + reviews (existing behavior)
2. On first tab activation: fetch that section's data
3. Use `limit: 8` for services/tasks preview (matches homepage pattern)
4. Add "Browse All" link for full listing

```typescript
const sectionLoaded = $state<Record<string, boolean>>({
	services: false,
	tasks: false
	// ...
});

async function loadSection(section: string) {
	if (sectionLoaded[section]) return;
	// fetch section data
	sectionLoaded[section] = true;
}
```

---

#### SUGGESTION-04: Nostr Query Batching Opportunity

**Severity:** 🟢 Suggestion  
**Location:** Section 9 (Performance)  
**Detail:** The plan notes 4 relay queries. The existing `fetchComprehensiveProfileEvents` already batches 9 kinds into one query. Services and tasks are separate queries because they use different relay APIs (`nostrEventsService` vs NDK).

**Recommendation:** Keep them separate — the relay handles multiplexing. Trying to batch across NDK and `nostrEventsService` would add complexity without measurable benefit. The `Promise.allSettled` approach handles concurrency well.

---

### 6. SEO

#### CRITICAL-04 (Bonus): No `+page.server.ts` Exists — Plan Says "Update" It

**Severity:** 🔴 Critical (SEO)  
**Location:** Task 3.2  
**Detail:** The plan says:

> "File: `src/routes/npub/[npub]/+page.server.ts` — Changes: Add services/tasks count to JSON-LD structured data if available"

**This file does not exist.** The profile route only has `+page.svelte`. All data fetching is client-side via `onMount`.

**Impact:**

- Search engines see an empty page shell (no SSR content)
- No JSON-LD structured data exists
- Profile pages are effectively invisible to Google

**Fix:** Create `+page.server.ts` with:

- `load()` function that fetches profile metadata server-side
- JSON-LD structured data generation (Person schema)
- Meta tags for title, description, og:image
- Note: Nostr queries may not work server-side (relay connectivity). Consider using a cached/CDN approach or prerendering known profiles.

---

#### SUGGESTION-05: Route Structure — Keep `/npub/[npub]`

**Severity:** 🟢 Suggestion  
**Location:** Section 2  
**Detail:** The plan correctly keeps `/npub/[npub]`. Changing to `/profile/[npub]` or `/user/[npub]` would:

- Break all existing links and bookmarks
- Require redirect configuration
- Lose any existing SEO equity (minimal, since pages aren't SSR)

The npub IS the identity in Nostr — it's the right URL structure.

---

### 7. Translation Architecture

#### SUGGESTION-06: i18n Keys Mostly Correct, Some Already Exist

**Severity:** 🟢 Suggestion  
**Location:** Task 4.1  
**Detail:** The plan proposes keys under `common.profile.*`. The existing i18n structure uses:

```json
"common": {
  "profile": {
    "performance_stats": "Performance Stats",
    "about": "About",
    "portfolio": "Portfolio",
    "availability": "Availability",
    // ...
  }
}
```

**Already existing keys (no need to add):**

- `common.profile.about` ✅
- `common.profile.portfolio` ✅
- `common.profile.availability` ✅
- `common.profile.member_since` ✅

**New keys needed:**

- `common.profile.services` — "Services"
- `common.profile.tasks` — "Tasks"
- `common.profile.reviews` — "Reviews"
- `common.profile.no_services` — "No services listed yet"
- `common.profile.no_tasks` — "No tasks posted yet"
- `common.profile.load_more` — "Load more"
- `common.profile.browse_all` — "Browse All"
- `common.profile.rating_distribution` — "Rating Distribution"
- `common.profile.view_service` — "View Service"
- `common.profile.view_task` — "View Task"
- `common.profile.verified` — "Verified"

**Fix:** Remove duplicate keys from Task 4.1. Add Spanish (`es`) translations simultaneously.

---

### 8. Type Safety

#### SUGGESTION-07: Types Are Consistent

**Severity:** 🟢 Suggestion  
**Detail:** The proposed types align with existing definitions:

- `Service` from `$lib/types/service.d` ✅
- `Task` from `$lib/types/task.d` ✅
- `ReviewStats` from `$lib/types/review.d` ✅
- `AttestedReview` from `$lib/types/review.d` ✅
- `ComprehensiveProfile` from `$lib/nostr/profile/comprehensive-profile.ts` ✅

The `ReviewCard` sub-component should use `AttestedReview` as its prop type, not the legacy `Review` type.

---

### 9. Nostr Relay Load

#### SUGGESTION-08: 4 Queries is Acceptable with Proper Error Handling

**Severity:** 🟢 Suggestion  
**Detail:** Current page already makes 2 parallel queries (profile + reviews). Adding services + tasks brings it to 4. With `Promise.allSettled` and lazy loading (only fetch when tab activated), effective initial load is still 2 queries.

The relay handles concurrent connections well. No batching needed.

---

### 10. Route Structure

Already covered in SUGGESTION-05. Keep `/npub/[npub]`.

---

## Summary Table

| ID            | Severity      | Issue                                         | Resolution                                      |
| ------------- | ------------- | --------------------------------------------- | ----------------------------------------------- |
| CRITICAL-01   | 🔴 Critical   | Wrong task kind (36070 vs 31000)              | Use `KINDS.TASK_CREATION`                       |
| CRITICAL-02   | 🔴 Critical   | Duplicate service fetch function              | Reuse `findProfileServicesByAuthor`             |
| CRITICAL-03   | 🔴 Critical   | Wrong file path (`profile.ts` is a directory) | Fix all file path references                    |
| CRITICAL-04   | 🔴 Critical   | `+page.server.ts` doesn't exist               | Create it for SEO                               |
| IMPORTANT-01  | 🟡 Important  | No public task-by-author function             | Create `findProfileTasksByAuthor`               |
| IMPORTANT-02  | 🟡 Important  | Race condition in parallel fetch              | Use `Promise.allSettled`                        |
| IMPORTANT-03  | 🟡 Important  | Missing per-section error boundaries          | Add individual error states                     |
| IMPORTANT-04  | 🟡 Important  | `$derived` syntax must be Svelte 5            | Use `$derived(expr)` not `$derived(() => expr)` |
| IMPORTANT-05  | 🟡 Important  | Lazy loading contradicts mount fetch          | Implement true lazy loading per tab             |
| SUGGESTION-01 | 🟢 Suggestion | 9 components is correct granularity           | No change needed                                |
| SUGGESTION-02 | 🟢 Suggestion | Include Svelte 5 component template           | Add to plan                                     |
| SUGGESTION-03 | 🟢 Suggestion | Tab state should be local, not store          | Use local `$state` + URL hash                   |
| SUGGESTION-04 | 🟢 Suggestion | No relay batching needed                      | Keep queries separate                           |
| SUGGESTION-05 | 🟢 Suggestion | Keep `/npub/[npub]` route                     | No change needed                                |
| SUGGESTION-06 | 🟢 Suggestion | Some i18n keys already exist                  | Remove duplicates                               |
| SUGGESTION-07 | 🟢 Suggestion | Types are consistent                          | Use `AttestedReview` for review cards           |
| SUGGESTION-08 | 🟢 Suggestion | 4 relay queries is acceptable                 | With lazy loading, initial is 2                 |

---

## Recommended Plan Revisions

### Phase 1: Data Layer (Revised)

1. **Do NOT create `fetchUserServices`** — import `findProfileServicesByAuthor` from `$lib/nostr/findProfileServices`
2. **Create `findProfileTasksByAuthor`** in new file `src/lib/nostr/findProfileTasks.ts` using kind `KINDS.TASK_CREATION` (31000)
3. **Enhance review queries** in `src/lib/utils/reviews/queries.ts` (add pagination)
4. **Create `src/routes/npub/[npub]/+page.server.ts`** for SSR + JSON-LD

### Phase 2: Component Implementation (No Changes)

The component decomposition is sound. Follow existing patterns from `FeaturedHomepageSection.svelte`.

### Phase 3: Page Integration (Revised)

1. Use `Promise.allSettled` for parallel fetch
2. Implement true lazy loading (fetch per section on tab activation)
3. Add per-section error states
4. Preserve existing `loadUserReviews` logic (both received + given reviews)

### Phase 4: Testing (Add)

1. Unit test for `findProfileTasksByAuthor` (mirror `findProfileServicesByAuthor` tests)
2. Verify Svelte 5 `$derived` syntax in all new components
3. Test lazy loading behavior (section data not fetched until tab activated)

---

## Files Referenced in This Audit

| File                                                           | Purpose                                    |
| -------------------------------------------------------------- | ------------------------------------------ |
| `src/lib/utils/constants/kinds.ts`                             | Nostr kind constants                       |
| `src/lib/nostr/findProfileServices.ts`                         | Existing service-by-author fetch           |
| `src/lib/nostr/findMyTasks.ts`                                 | Auth-scoped task fetch (not reusable)      |
| `src/lib/nostr/findTasks.ts`                                   | Public task search (not by-author)         |
| `src/lib/nostr/profile/comprehensive-profile.ts`               | Profile data fetch                         |
| `src/lib/nostr/profile/index.ts`                               | Profile module exports                     |
| `src/lib/utils/reviews/queries.ts`                             | Review queries (NDK-based)                 |
| `src/lib/utils/reviews/aggregation.ts`                         | Review stats calculation                   |
| `src/lib/types/review.d.ts`                                    | Review types (AttestedReview, ReviewStats) |
| `src/lib/types/service.d.ts`                                   | Service types                              |
| `src/lib/types/task.d.ts`                                      | Task types                                 |
| `src/lib/components/homepage/FeaturedHomepageSection.svelte`   | Horizontal scroll pattern                  |
| `src/lib/components/homepage/FeaturedHomepageCardShell.svelte` | Card shell pattern                         |
| `src/routes/npub/[npub]/+page.svelte`                          | Current profile page                       |
| `static/locales/en/common.json`                                | i18n translations                          |
| `docs/svelte4-to-svelte5-migration-plan.md`                    | Svelte 5 migration status                  |

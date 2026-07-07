# Task Details Page Redesign

## Goal

Transform the flat, single-card task details page at `/tasks/[taskId]` into a visually rich, animated, and engaging experience. The current page (`TaskDetailsView.svelte`) has no visual hierarchy, no entry animations, missing status/type indicators, duplicated creator info, and generic typography.

## Scope

- **Primary file**: `src/lib/components/task/TaskDetailsView.svelte` (complete rewrite of the template)
- **Animation utilities**: `src/lib/utils/animations.ts` (add new animation functions)
- **i18n**: `static/locales/en/dashboard/dashboard.json` + `static/locales/es/dashboard/dashboard.json` (new keys only)
- **No new files** unless explicitly necessary for extraction — prefer editing existing files

## Current Problems

1. Single flat `bg-base-100 rounded-2xl border p-6` card — no depth, no visual hierarchy
2. Generic "Task Details" / "Here you can see the details of the task" header — wasted space
3. Status badge completely missing from the details view (exists in `TaskCard` but not here)
4. Budget buried inline next to deadline — should be the hero element on a task marketplace
5. No entry animations — `motion` library is installed and used elsewhere but not here
6. Skills/categories are identical generic `badge badge-outline` — no visual distinction
7. Creator info duplicated: `UserInfoDisplay` in main card AND sidebar
8. Sidebar is a plain sticky card — no visual treatment
9. No task type indicator (Remote vs. In-Person) at top level
10. No back navigation
11. No "posted X ago" relative time
12. Missing bid count indicator

## Design Decisions

### Layout: 3-Zone Structure

```
┌─────────────────────────────────────────────────────────┐
│ HERO HEADER (full-width, gradient accent)                │
│ Back nav · Status · Type badge · Title · Budget hero     │
├───────────────────────────────────┬──────────────────────┤
│ MAIN CONTENT (2/3)                │ SIDEBAR (1/3)        │
│                                   │                      │
│ Description section               │ Budget card (large)  │
│ Info pills row (deadline, type,   │ Countdown timer      │
│   location, bids)                 │ Bid CTA button       │
│ Skills & Categories               │ Creator card         │
│ Attachments gallery               │ Map                  │
│ Location details                  │                      │
└───────────────────────────────────┴──────────────────────┘
```

### Animations: Staggered Section Entry

Using existing `motion` library (`animate`, `stagger`) and existing `EASING` constants from `animations.ts`. All animations respect `prefers-reduced-motion`.

---

## Implementation Plan

### Step 1: Add animation functions to `src/lib/utils/animations.ts`

Add 3 new exported functions:

```typescript
export function animateTaskHero(el: HTMLElement) {
    if (prefersReducedMotion()) return;
    animate(el, { opacity: [0, 1], y: [-16, 0] }, {
        duration: 0.45,
        easing: EASING.decelerate
    } as Parameters<typeof animate>[2]);
}

export function animateDetailSections(container: HTMLElement) {
    if (prefersReducedMotion()) return;
    const sections = container.querySelectorAll('.detail-section');
    if (sections.length === 0) return;
    animate(sections, { opacity: [0, 1], y: [20, 0] }, {
        duration: 0.35,
        delay: stagger(0.06, { startDelay: 0.12 }),
        easing: EASING.decelerate
    } as Parameters<typeof animate>[2]);
}

export function animateStatPills(container: HTMLElement) {
    if (prefersReducedMotion()) return;
    const pills = container.querySelectorAll('.stat-pill');
    if (pills.length === 0) return;
    animate(pills, { scale: [0.92, 1], opacity: [0, 1] }, {
        duration: 0.25,
        delay: stagger(0.05, { startDelay: 0.2 }),
        easing: EASING.decelerate
    } as Parameters<typeof animate>[2]);
}
```

### Step 2: Add new i18n keys

Add to both `en/dashboard/dashboard.json` and `es/dashboard/dashboard.json` under `dashboard.task_details_by_task`:

```json
"back_to_tasks": "Back to Tasks",
"posted_ago": "Posted {time}",
"task_type_remote": "Remote",
"task_type_in_person": "In-Person",
"bids_count": "{count} {count, plural, one {bid} other {bids}}",
"no_bids_yet": "No bids yet",
"countdown_days": "{count}d",
"countdown_hours": "{count}h",
"countdown_minutes": "{count}m",
"no_skills_required": "No specific skills required",
"no_categories": "No categories",
"no_attachments": "No attachments"
```

### Step 3: Rewrite `TaskDetailsView.svelte` template

The script section stays mostly the same (data loading, helpers, state). The template gets restructured into 3 zones:

#### 3a. Hero Header

Replace the generic "Task Details" heading with:

```svelte
<div class="detail-hero" bind:this={heroRef}>
    <!-- Back navigation -->
    <button onclick={() => history.back()} class="btn btn-ghost btn-sm gap-1">
        <IconArrowLeft /> {$t('dashboard.task_details_by_task.back_to_tasks')}
    </button>

    <!-- Badges row: Task Type + Status -->
    <div class="flex items-center gap-2 mt-3">
        {#if isRemoteTask()}
            <span class="badge badge-info badge-sm gap-1">
                <IconEarth /> {$t('dashboard.task_details_by_task.remote')}
            </span>
        {:else}
            <span class="badge badge-warning badge-sm gap-1">
                <IconMapMarker /> {$t('dashboard.task_details_by_task.in_person')}
            </span>
        {/if}
        <span class="badge {statusBadge.color} badge-sm">
            {$t(`common.status.${task.status.toLowerCase()}`)}
        </span>
    </div>

    <!-- Title -->
    <TranslatableTask {task} showTitle={true} showDescription={false}
        titleClass="text-2xl font-bold mt-3 leading-tight" />

    <!-- Truncated description preview -->
    <TranslatableTask {task} showTitle={false} showDescription={true} showToggle={false}
        descriptionClass="text-base-content/70 text-base mt-2 line-clamp-2" />

    <!-- Share + Actions -->
    <div class="flex items-center gap-1 mt-3">
        <TaskShareButton {task} variant="icon-only" />
        {#if $authState.isAuthenticated && task && !isOwner && task.npub}
            <ActionsMenu ... />
        {/if}
    </div>
</div>
```

Styling: `bg-gradient-to-br from-primary/5 to-base-100 border-b border-base-300 px-6 py-5`

#### 3b. Stat Pills Row

Horizontal row of compact info cards between hero and content:

```svelte
<div class="stat-pills-container grid grid-cols-2 sm:grid-cols-4 gap-3 px-6 py-4">
    <!-- Budget pill -->
    <div class="stat-pill bg-base-100 border border-base-300 rounded-xl p-3 flex items-center gap-3">
        <div class="bg-primary/10 text-primary rounded-lg p-2">
            <IconCash class="h-5 w-5" />
        </div>
        <div>
            <p class="text-xs text-base-content/60 uppercase tracking-wide">Budget</p>
            <UsdSatsDisplay amount={task.budget.amount} {btcPrice} size="compact" />
        </div>
    </div>

    <!-- Deadline pill -->
    {#if task.deadline || task.dateRange}
        <div class="stat-pill ...">
            <IconCalendarClock />
            <TaskDeadlineDisplay ... />
        </div>
    {/if}

    <!-- Location pill -->
    {#if shouldShowLocationInfo()}
        <div class="stat-pill ...">
            <IconMapMarker or IconEarth />
            <span>{locationLabel}</span>
        </div>
    {/if}

    <!-- Bids count pill -->
    {#if task.bids?.length}
        <div class="stat-pill ...">
            <IconGavel />
            <span>{bid count}</span>
        </div>
    {/if}
</div>
```

#### 3c. Main Content (left column)

Each section wrapped in `.detail-section` class for stagger animation:

1. **Description** — Full description with `TranslatableTask`, better typography (`text-base leading-relaxed`), left border accent (`border-l-2 border-primary/20 pl-4`), plus "Posted X ago" timestamp
2. **Skills** — `badge badge-soft` with `bg-primary/10 text-primary` styling (distinct from categories)
3. **Categories** — `badge badge-outline` (kept distinct from skills)
4. **Attachments** — Gallery + videos (same as current, just wrapped in `.detail-section`)
5. **Location** — Full location block with map embedded inline for in-person tasks (moved from sidebar-only)

#### 3d. Sidebar (right column)

Redesigned sticky panel:

```svelte
<div class="sticky top-6 space-y-4">
    <!-- Budget hero card -->
    <div class="bg-base-100 border border-base-300 rounded-2xl overflow-hidden">
        <!-- Gradient accent bar matching status color -->
        <div class="h-1.5 {statusGradientClass}"></div>
        <div class="p-5">
            <UsdSatsDisplay amount={task.budget.amount} {btcPrice} size="large"
                title={$t('dashboard.task_details_by_task.budget')} />

            <!-- Countdown if deadline exists -->
            {#if task.deadline && !isDeadlineExpired()}
                <div class="mt-3 text-sm text-base-content/60">
                    <IconClock /> {countdownText}
                </div>
            {/if}
        </div>
    </div>

    <!-- Action card (bid/login/owner/status) -->
    <div class="bg-base-100 border border-base-300 rounded-2xl p-5">
        {#if isDeadlineExpired() && task.status === TaskStatusEnum.OPEN}
            <div class="alert alert-warning ...">deadline expired</div>
        {/if}
        {#if task.status === TaskStatusEnum.OPEN && !isOwner && $authState.isAuthenticated}
            <button class="btn btn-primary w-full" onclick={handleBidNow}>
                {$t('dashboard.task_details_by_task.bid_now')}
            </button>
        {:else if ...}
            <!-- login / not open / owner cases -->
        {/if}
    </div>

    <!-- Creator card (single instance, removed from main content) -->
    {#if task.creator}
        <div class="bg-base-100 border border-base-300 rounded-2xl p-5">
            <h4 class="text-sm font-semibold text-base-content/60 mb-3">
                {$t('dashboard.task_details_by_task.tasker')}
            </h4>
            <UserInfoDisplay ... showReviewCount={true} />
            <a href="/profile?user={task.npub}&tab=reviews" class="text-primary text-xs hover:underline mt-2 block">
                {$t('reviews.view_all')}
            </a>
        </div>
    {/if}

    <!-- Map card -->
    {#if task.pickupLocation && !isRemoteTask()}
        <div class="bg-base-100 border border-base-300 rounded-2xl overflow-hidden">
            <TaskLocationMap tasks={[task]} height="250px" showFullscreen={true} />
            <p class="text-xs text-base-content/50 px-4 py-2">
                {$t('dashboard.task_details_by_task.location_map_description')}
            </p>
        </div>
    {/if}
</div>
```

### Step 4: Wire up animations

In `TaskDetailsView.svelte`, after task loads:

```svelte
import { animateTaskHero, animateDetailSections, animateStatPills } from '$lib/utils/animations';
import { tick } from 'svelte';

let heroRef: HTMLElement;
let contentRef: HTMLElement;
let statPillsRef: HTMLElement;

$effect(() => {
    if (task && !loading) {
        tick().then(() => {
            if (heroRef) animateTaskHero(heroRef);
            if (statPillsRef) animateStatPills(statPillsRef);
            if (contentRef) animateDetailSections(contentRef);
        });
    }
});
```

### Step 5: Add new icon imports

```typescript
import IconArrowLeft from '~icons/mdi/arrow-left';
import IconEarth from '~icons/mdi/earth';
import IconCash from '~icons/mdi/cash';
import IconClock from '~icons/mdi/clock-outline';
import IconGavel from '~icons/mdi/gavel';
```

### Step 6: Add status gradient helper

Add a derived for the sidebar gradient color based on status:

```typescript
const statusGradientClass = $derived(() => {
    switch (task?.status) {
        case TaskStatusEnum.OPEN: return 'bg-gradient-to-r from-success to-success/60';
        case TaskStatusEnum.IN_PROGRESS: return 'bg-gradient-to-r from-warning to-warning/60';
        case TaskStatusEnum.COMPLETED: return 'bg-gradient-to-r from-info to-info/60';
        case TaskStatusEnum.CANCELLED: case TaskStatusEnum.REFUNDED: return 'bg-gradient-to-r from-error to-error/60';
        default: return 'bg-gradient-to-r from-primary to-primary/60';
    }
});
```

### Step 7: Remove duplicated creator section from main content

Currently `UserInfoDisplay` appears at line 566-603 in the main card AND at line 765-822 in the sidebar. Remove the one in the main content card (lines 566-603). Keep only the sidebar instance.

### Step 8: Add countdown helper

```typescript
const countdownText = $derived.by(() => {
    if (!task?.deadline) return '';
    const now = new Date();
    const deadline = new Date(task.deadline);
    const diff = deadline.getTime() - now.getTime();
    if (diff <= 0) return '';

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
});
```

### Step 9: Relative "posted" time

```typescript
import { formatDistanceToNow } from '$lib/utils/helpers/dateFormatter'; // or inline

const postedAgo = $derived.by(() => {
    if (!task?.createdAt) return '';
    const date = new Date(task.createdAt * 1000);
    return formatRelativeTime(date, $locale || 'en');
});
```

If no `formatRelativeTime` exists in the codebase, add a simple one to `dateFormatter.ts` or inline it using `Intl.RelativeTimeFormat`.

---

## Files Modified (summary)

| File | Action |
|------|--------|
| `src/lib/utils/animations.ts` | Add 3 new animation functions |
| `src/lib/components/task/TaskDetailsView.svelte` | Major template rewrite |
| `static/locales/en/dashboard/dashboard.json` | Add ~10 new i18n keys |
| `static/locales/es/dashboard/dashboard.json` | Add ~10 new i18n keys (Spanish) |

## Files NOT Modified

- `+page.svelte` route — unchanged, it just renders `TaskDetailsView`
- `TaskTab.svelte` — different context (drawer view), untouched
- `TaskCard.svelte` — list card, untouched
- `BidForm.svelte` — drawer form, untouched
- `Drawer.svelte` — generic drawer, untouched

## Verification

1. `npm run check` — type validation
2. `npm run lint` — style check
3. `npm run test:unit:components` — targeted component tests
4. `python3 scripts/find-missing-translations.py --fix-suggestions` — i18n validation
5. Manual: navigate to a task detail page, verify hero, stat pills, staggered animations, sidebar, no duplicate creator, back button works
6. Manual: test with `prefers-reduced-motion` enabled — animations should be skipped

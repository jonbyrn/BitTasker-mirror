# Public Profile & Taskee Directory Plan

## 1. Routing & Identification

- **Single public route with conditional functionality**
  - Files: `src/routes/npub/[npub]/+page.ts` (validate params, load translations, call data layer) and `+page.svelte` (render UI).
  - Input validation: accept `npub1...` or 64-char hex, use `nip19.decode()` when needed, reject invalid values with localized error state.
  - **Capacitor/SSR note**: Project uses Capacitor, so SSR is not possible. All rendering is client-side only. Set `prerender = false` and `ssr = false` in `+page.ts`. Ensure all data fetching happens in `onMount` or uses `browser` guard.
  - **Conditional functionality**: Single route handles both logged-in and logged-out users:
    - **Authentication check**: Use `$authState.isAuthenticated` store to determine if user is logged in. This is reactive and doesn't trigger any authentication prompts.
    - **Owner detection (authenticated users only)**:
      - **Important**: Only check if user is viewing their own profile when `isAuthenticated === true`.
      - **Use existing pattern**: The codebase already uses direct Preferences reads (see `src/lib/nostr/findTasks.ts:184`, `src/lib/utils/nostr-message.ts:902`). Follow this pattern:
        - In component: `let currentUserNpub = $state<string | null>(null);`
        - In `onMount`: Only check npub if `$authState.isAuthenticated === true`:

          ```typescript
          if ($authState.isAuthenticated) {
            const { value } = await Preferences.get({ key: StorageKeys.NPUB });
            currentUserNpub = value || null;
          }
          ```

        - Compare: `const isOwner = currentUserNpub !== null && currentUserNpub === routeNpub`
      - **Important**: Always use direct Preferences read pattern (as shown above). Never call `getNpub()` on public profile page - it may trigger biometric prompts if cache is empty, which is undesirable for public profile viewing.
    - **Feature rendering based on state**:
      - If `isOwner === true`: Show owner features (edit button, completeness widget, owner stats, edit page access)
      - If `isAuthenticated === true && isOwner === false`: Show public view with messaging enabled
      - If `isAuthenticated === false`: Show public view with "Sign in to message" CTA
  - Extract shared layout into reusable components (e.g., `ProfileHero`, `ProfileSections`, `ProfileSidebar`).
  - Pass props indicating `isOwner: boolean` and `isAuthenticated: boolean` so components can conditionally render features.
- **Link updates - All profile links go to public route**
  - **Remove old route**: Delete `src/routes/(protected)/dashboard/taskees/profile/[id]/+page.svelte` and `+page.ts` after migration.
  - **Comprehensive search for profile links**: Use grep to find all instances that need updating:
    - **Search for old route path**: `grep -r "taskees/profile" src/` - Finds all references to old profile route
    - **Search for goto() calls**: `grep -r "goto.*profile" src/` - Finds navigation calls to profile pages
    - **Search for href attributes**: `grep -r 'href.*profile' src/` - Finds HTML links to profiles
    - **Search for route references**: `grep -r "/dashboard/taskees/profile" src/` - Finds direct route references
    - **Search for profile navigation**: `grep -r "profile/\[" src/` - Finds dynamic profile route patterns
    - **Search for user ID in profile context**: `grep -r "userProfile.*id\|user.*profile.*id" src/` - Finds code accessing user IDs for profile links
    - **Search for bid-related profile links**: `grep -r "bid.*profile\|profile.*bid" src/ -i` - Finds bid page profile references
    - **Search for message-related profile links**: `grep -r "message.*profile\|profile.*message" src/ -i` - Finds message-related profile links
    - **Search for notification profile links**: `grep -r "notification.*profile\|profile.*notification" src/ -i` - Finds notification-related profile links
  - **Update process**:
    1. Run all grep commands above and save results to a file for tracking
    2. Review each match to determine if it needs updating
    3. Update links to use `/npub/[npub]` format using `getProfileUrl()` helper
    4. Ensure npub is available in the data context (may need to update GraphQL queries or data fetching)
    5. Test each updated link to ensure it works correctly
  - **Helper function**: Create `getProfileUrl(npub: string): string` utility in `src/lib/utils/helpers/profile.ts`:
    - Returns `/npub/${npub}` format
    - Use this helper everywhere to ensure consistency
    - If npub is missing from data, log warning and handle gracefully (show placeholder or skip link)
    - **Note**: For getting the current user's cached npub (for owner detection), use the existing codebase pattern: `const { value } = await Preferences.get({ key: StorageKeys.NPUB });` (see examples in `src/lib/nostr/findTasks.ts:184`, `src/lib/utils/nostr-message.ts:902`). This pattern never triggers biometric prompts, unlike `getNpub()` which may prompt if cache is empty.
  - **Data requirements**: Ensure all GraphQL/REST responses expose the npub. If absent, extend backend queries before rollout. For existing user IDs, create mapping utility that fetches npub from backend when needed (but prefer direct npub in responses).

## 2. Data Fetching & Privacy

- **Nostr aggregation**
  - Continue using `fetchComprehensiveProfile()` (kind 0, 30000+, etc.). Add relay hints param if future nprofile support arrives.
  - Cache results via `profileCache` keyed by hex pubkey; set TTL (e.g., 5 minutes) and add manual busting on profile edit success.
  - **Client-side only**: All data fetching happens in `onMount` or uses `browser` guard since Capacitor doesn't support SSR.
- **Authentication & npub retrieval**
  - **Use existing codebase pattern**: The codebase already uses direct Preferences reads for getting cached npub without triggering biometric prompts (see `src/lib/nostr/findTasks.ts:184`, `src/lib/utils/nostr-message.ts:902`). This pattern:
    1. Reads directly from `Preferences.get({ key: StorageKeys.NPUB })` - persisted cache (no auth prompt)
    2. Returns `null` or empty string if user is not logged in or cache is cleared
    3. Never triggers biometric authentication prompts
  - **For public profile page**:
    - **Always use Preferences pattern**: Read directly from `Preferences.get({ key: StorageKeys.NPUB })` (matches pattern used in `src/lib/nostr/findTasks.ts:184`, `src/lib/utils/nostr-message.ts:902`)
    - **Never call `getNpub()`** - it may trigger biometric prompts if cache is empty, which is undesirable for public profile viewing
    - Only check owner status when `$authState.isAuthenticated === true`
    - If user is logged out, skip owner check entirely (set `isOwner = false`)
    - If Preferences read returns `null` or empty, treat as not owner (don't trigger biometric prompts)
  - **Authentication state check**: Use `$authState.isAuthenticated` store (reactive, no prompts) or check `Preferences.get({ key: StorageKeys.ACCESS_TOKEN })` to determine if user is logged in
- **Privacy guardrails**
  - When merging backend + Nostr data on authenticated route, wrap sensitive fields in `mode === 'owner'` checks.
  - Mask city/state if user opted out (introduce preference flag later if needed).
- **Error & loading states**
  - Distinguish between: invalid npub (400), profile not found (404-style message), relay failure (retry button), generic error.
  - Skeleton loaders per card (hero, about, portfolio) to prevent layout shift.

## 3. Public Profile UI (Brand-Aligned)

- **Hero section**
  - Components: `Avatar`, verification badges (NIP-05, identity level), quick stats (tasks completed, rating, response time).
  - Show user join date using `formatStandardDateShort`.
  - Mobile: Stack avatar and info vertically; center-align on small screens. Make stats horizontal scrollable if needed.
- **Content sections**
  - About: truncated text with “show more” expand.
  - Skills/services: use badges grouped by category, include verification chips if certification tied.
  - Certifications: timeline cards with issuer, date, verification indicator.
  - Portfolio: carousel using `carousel` or custom slider, fallback when no images.
  - Reviews: list with stars (computed average), highlight most recent.
- **Sidebar (Mobile Responsive)**
  - Desktop layout (`lg:` breakpoint): Sidebar appears as right column in grid layout (`lg:col-span-1`).
  - Mobile layout (default): Sidebar content adapts as follows:
    - **Availability card**: Moves above main content, full width, compact design with collapsible sections.
    - **Quick actions**: Convert to sticky bottom bar (`btm-nav` or custom sticky footer) with primary actions (message, share) always visible. Hide secondary actions in expandable menu.
    - **Verification badges**: Integrate into hero section on mobile, displayed as horizontal badge row below name.
    - **Social/web links**: Move to hero section footer or create expandable "Contact & Links" accordion.
    - **Profile stats**: Display as horizontal scrollable cards above main content, or integrate into hero.
  - Implementation pattern:
    - Use Tailwind responsive classes: `hidden lg:block` for desktop-only sidebar, `block lg:hidden` for mobile-specific layouts.
    - Create `ProfileSidebarMobile.svelte` component that renders sidebar content in mobile-optimized layout.
    - Ensure sidebar content appears in logical order on mobile (availability → actions → links).
    - Test touch targets: minimum 44px height for buttons on mobile.
- **Share tools**
  - Add “Share profile” button -> modal:
    - Copy `/npub/[npub]` link
    - Copy npub string
    - QR preview generated via `generateQrCodeUrl(profileUrl)` (client-only block with `onMount` guard)
  - Mobile: Share button in sticky bottom bar; modal full-screen on mobile with swipe-to-close gesture.
  - Provide `aria-live` notifications for copy success.
- **Auth-specific UI**
  - Use global `$authState` store; optionally create `<AuthGate>` wrapper component to standardize gating.
  - Hide profile completeness widget on public page entirely; ensure owner route still shows tasks (missing sections, percent completion) via new `ProfileCompletenessCard`.
- **Mobile Responsiveness Checklist**
  - Grid layout: Use `grid-cols-1 lg:grid-cols-4` pattern (main content spans 3 cols on desktop, full width on mobile).
  - Typography: Reduce font sizes on mobile (`text-sm md:text-base`), ensure headings scale appropriately.
  - Spacing: Reduce padding/margins on mobile (`p-4 md:p-6 lg:p-8`).
  - Cards: Full width on mobile, proper spacing between cards (`space-y-4 md:space-y-6`).
  - Images: Ensure portfolio images scale properly (`w-full h-auto`), maintain aspect ratios.
  - Navigation: Ensure back button/close actions are easily accessible (top-left corner, adequate touch target).
  - Testing: Verify on viewports: 320px, 375px, 414px (mobile), 768px (tablet), 1024px+ (desktop).

## 4. Messaging & CTAs

- **Logged-out flow**
  - Primary CTA: `btn btn-primary` -> `goto('/auth/login?redirect='/npub/[npub]')`.
  - Secondary CTA: copy npub to contact externally (if messaging unavailable).
- **Logged-in flow**
  - Reuse existing message modal logic; ensure `userId` replaced with npub destination.
  - Provide fallback link to `/dashboard/messages/to/[hexPubkey]`.

## 5. Taskee Discovery Page

- **Route duplication**
  - Copy structure from `dashboard/find-tasks` into `dashboard/find-taskees`.
  - Update load function to call new taskee listing query (GraphQL or Nostr index). Include pagination params identical to tasks page for consistent UX.
- **Filter adaptation**
  - Map task filters to taskee equivalents: location radius → service area, budget → hourly rate range, skills → specialties, availability toggles.
  - Keep UI identical (accordion filter panel) but update labels/translations.
  - Mobile: Filters in bottom sheet or collapsible drawer, ensure touch-friendly controls.
- **Card refactor**
  - Extract `TaskCard` logic into `FinderCard` that accepts `type: 'task' | 'taskee'`.
  - Taskee card shows avatar, professional title, rating, key skills, starting rate, CTA to view profile.
  - Mobile: Cards stack vertically, full width, compact design. Ensure avatar and key info visible without scrolling.
  - Keep drawer/detail panel but fill with taskee info (bio, certifications, portfolio preview).
  - Mobile: Detail panel full-screen modal with swipe-to-close, proper back button.
- **Empty/loading states**
  - Provide taskee-specific messaging ("No taskees match these filters").
- **Mobile responsiveness**
  - Grid layout: Single column on mobile (`grid-cols-1`), multi-column on desktop (`md:grid-cols-2 lg:grid-cols-3`).
  - Filter panel: Hidden by default on mobile, accessible via floating filter button. Bottom sheet on mobile, sidebar on desktop.
  - Card layout: Optimize card height on mobile, ensure key info (avatar, name, rating) visible above fold.
  - Pagination: Touch-friendly pagination controls, ensure infinite scroll works smoothly on mobile.
- **Performance**
  - **Client-side pagination caching**: The codebase already implements client-side caching (see `src/lib/nostr/findTasks.ts` with in-memory Map cache and TTL). This works perfectly with Capacitor since it's all client-side JavaScript. Reuse the same caching pattern from tasks:
    - Use in-memory cache with TTL (e.g., 5 minutes as in `findTasks.ts`)
    - Cache key based on filter parameters
    - Clear cache on filter changes or manual refresh
  - **Debouncing**: The codebase already has a `debounce` utility in `src/lib/utils/helpers/common.ts` and uses it extensively (see `src/routes/(protected)/dashboard/find-tasks/+page.svelte:195` with 1000ms delay). This is pure client-side JavaScript and works perfectly with Capacitor:
    - Import: `import { debounce } from '$lib/utils/helpers/common';`
    - Use for filter inputs: `const debouncedSearch = debounce(async () => { ... }, 1000);`
    - Apply to search inputs and filter changes to reduce API calls on mobile (important for slower connections)
    - Follow existing pattern: 1000ms delay for search queries, 300ms for location autocomplete

## 6. QR & Sharing Details

- Call `generateQrCodeUrl()` inside `onMount` to avoid SSR canvas errors; store data URL in `$state`.
- Add fallback icon while QR loads; handle errors (e.g., show “QR unavailable”).
- Localization keys:
  - `common.profile.share_title`, `share_link`, `copy_npub`, `qr_label`.
- Ensure QR modal respects theme (use `bg-base-100` and `text-base-content`).

## 7. Testing Strategy (Per Step)

For each major phase (routing, profile UI, share tools, taskee directory):

Perform automated browser testing via Cursor:

- Load the updated page.
- Verify rendering on light/dark themes and mobile/desktop viewports.
- Exercise interactive elements (share modal, message CTA, taskee filters).
- **Mobile responsiveness testing**:
  - Test sidebar adaptation: Verify sidebar content appears in correct mobile layout (availability card above content, actions in sticky bar, badges in hero).
  - Test touch interactions: Verify all buttons meet 44px minimum touch target, test swipe gestures on carousel/portfolio.
  - Test viewport breakpoints: Resize browser to 320px, 375px, 414px, 768px, 1024px and verify layout adapts correctly.
  - Test sticky elements: Verify sticky bottom bar doesn't overlap content, scroll behavior is smooth.
  - Test modal behavior: Verify share modal is full-screen on mobile, properly dismissible.
  - Test horizontal scrolling: Verify stats cards scroll horizontally on mobile if needed.
  - Test accordion/collapsible sections: Verify availability and contact sections expand/collapse correctly.
  - Screenshot comparison: Capture screenshots at each breakpoint for visual regression testing.

Proceed to the next phase only after all browser tests pass.

## 8. Accessibility, Performance & i18n

- Keyboard & screen reader:
  - Ensure share modal traps focus, has `aria-modal="true"`, close button labeled.
  - Carousel controls accessible (buttons with `aria-label`).
  - Stats cards use semantic markup (lists/headings) for SR clarity.
- Performance:
  - Debounce filter changes on taskee page to reduce API calls.
  - Lazy-load heavy sections (portfolio images) using `loading="lazy"`.
- i18n:
  - Add translation namespaces for new routes (`dashboard/profile/public`, `dashboard/find-taskees`).
  - Guarantee fallback text exists for empty states in both languages.

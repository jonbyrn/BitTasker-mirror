# Dashboard Route Restructuring Plan

## Goal

Remove the `/dashboard` URL prefix from all routes currently under `src/routes/(app)/(protected)/dashboard/`. All routes should live directly under the `(protected)` group with clean URLs.

Additionally, rename the "hiring" section routes (`/dashboard?tab=*`) to `/hiring/*` with proper sub-routes.

## Current State

### Route Mapping (Before)

| Current URL | New URL | Route File (new location) |
|---|---|---|
| `/dashboard` | `/hiring` | `(protected)/hiring/+page.svelte` |
| `/dashboard?tab=tasks` | `/hiring/my-tasks` | `(protected)/hiring/my-tasks/+page.svelte` |
| `/dashboard?tab=contracts` | `/hiring/contracts` | `(protected)/hiring/contracts/+page.svelte` |
| `/dashboard?tab=service-requests` | `/hiring/service-requests` | `(protected)/hiring/service-requests/+page.svelte` |
| `/dashboard/create-task` | `/create-task` | `(protected)/create-task/+page.svelte` |
| `/dashboard/create-service` | `/create-service` | `(protected)/create-service/+page.svelte` |
| `/dashboard/task/:taskId` | `/task/:taskId` | `(protected)/task/[taskId]/+page.svelte` |
| `/dashboard/task/:taskId/bids` | `/task/:taskId/bids` | `(protected)/task/[taskId]/bids/+page.svelte` |
| `/dashboard/bids` | `/bids` | `(protected)/bids/+page.svelte` |
| `/dashboard/wallet` | `/wallet` | `(protected)/wallet/+page.svelte` |
| `/dashboard/messages` | `/messages` | `(protected)/messages/+page.svelte` |
| `/dashboard/messages/to/:pubkey` | `/messages/to/:pubkey` | `(protected)/messages/to/[pubkey]/+page.svelte` |
| `/dashboard/settings` | `/settings` | `(protected)/settings/+page.svelte` |
| `/dashboard/service-requests` | → redirects to `/hiring/service-requests` | delete or update redirect |
| `/dashboard/debug-nostr` | `/debug-nostr` | `(protected)/debug-nostr/+page.svelte` |
| `/dashboard/debug-wallet` | `/debug-wallet` | `(protected)/debug-wallet/+page.svelte` |
| `/dashboard/debug-smart-contract` | `/debug-smart-contract` | `(protected)/debug-smart-contract/+page.svelte` |

### Sidebar Highlighting

The sidebar in `(protected)/+layout.svelte` uses `sections` from `src/lib/utils/consts.ts`. The `hiring` section currently points to `/dashboard`. After restructuring:

- **`hiring`** section should highlight when ANY `/hiring/*` route is active (i.e., `/hiring`, `/hiring/my-tasks`, `/hiring/contracts`, `/hiring/service-requests`)
- **`earning`** section already highlights correctly for `/earning/*` routes

Update `consts.ts`:
```ts
// Before
{ id: 'hiring', path: '/dashboard', ... }

// After
{ id: 'hiring', path: '/hiring', ... }
```

And update the sidebar active check in `(protected)/+layout.svelte` to match `/hiring` prefix:
```svelte
class:menu-active={page.url.pathname.startsWith('/hiring')}
```

## Files Requiring Changes

### 1. Route Files to Move

Move all files from `src/routes/(app)/(protected)/dashboard/` to `src/routes/(app)/(protected)/`:

```
dashboard/+page.svelte           → (delete, replaced by /hiring)
dashboard/+page.ts               → (if exists, delete)
dashboard/wallet/                → wallet/
dashboard/settings/              → settings/
dashboard/messages/              → messages/
dashboard/create-task/           → create-task/
dashboard/create-service/        → create-service/
dashboard/task/                  → task/
dashboard/bids/                  → bids/
dashboard/service-requests/      → (delete, redirect updated)
dashboard/debug-nostr/           → debug-nostr/
dashboard/debug-wallet/          → debug-wallet/
dashboard/debug-smart-contract/  → debug-smart-contract/
```

Create new `hiring/` route group under `(protected)/`:
```
(protected)/hiring/+page.svelte          (root hiring page with tab navigation)
(protected)/hiring/+layout.svelte        (layout with hiring tabs)
(protected)/hiring/my-tasks/+page.svelte (tasks tab)
(protected)/hiring/contracts/+page.svelte (contracts tab)
(protected)/hiring/service-requests/+page.svelte (service requests tab)
```

### 2. Navigation & Link Updates

**Total: ~118 references to `/dashboard` across production code.**

#### `src/lib/utils/consts.ts`
- Line 7: `/dashboard` → `/hiring`
- Line 14: `/dashboard/create-task` → `/create-task`
- Line 45: `/dashboard/wallet` → `/wallet`
- Line 59: `/dashboard/messages` → `/messages`
- Line 73: `/dashboard/settings` → `/settings`

#### `src/lib/utils/constants/menu.constants.ts`
- Lines 86, 91, 96, 114, 119, 129, 134: All `/dashboard/*` → new paths
- Lines 247, 349, 359, 364, 374, 400: Avatar menu and logged-in sections

#### `src/lib/stores/navigation.store.ts`
- Lines 7–11, 13, 35: Primary routes array and path checks

#### `src/lib/stores/auth.store.ts`
- Line 70: `'/dashboard'` fallback → `'/hiring'`

#### `src/lib/components/BottomNavBar.svelte`
- 14 references to `/dashboard/*` URLs in NavGroup definitions

#### `src/lib/components/topbar/ProtectedTopBar.svelte`
- Line 209: Logo `href="/dashboard"` → `href="/hiring"`

#### `src/lib/components/service/ServiceDetailsView.svelte`
- Lines 972, 1493, 2252, 2548: `goto('/dashboard?tab=...')` → new paths

#### `src/lib/components/service/ServiceInstantBuyModal.svelte`
- Line 214: `goto('/dashboard/wallet?tab=receive')` → `goto('/wallet?tab=receive')`

#### `src/lib/components/bidding/BidAcceptanceFormV2.svelte`
- Line 822: `goto('/dashboard/wallet?tab=receive')` → `goto('/wallet?tab=receive')`

#### `src/lib/components/bidding/BidAcceptanceSuccessScreen.svelte`
- Line 19: `goto('/dashboard?tab=contracts')` → `goto('/hiring/contracts')`
- Line 23: `goto('/dashboard/create-task')` → `goto('/create-task')`

#### `src/lib/components/task/DashboardTasksPanel.svelte`
- Lines 255, 284, 414: Task and message navigation

#### `src/lib/components/service/DashboardMyServicesPanel.svelte`
- Lines 471, 733: Service creation and editing links

#### `src/lib/components/contracts/DashboardContractsPanelNDK.svelte`
- Line 464: `actionHref` for create-task

#### `src/lib/components/dashboard/quotes/ServiceRequestAcceptanceDrawer.svelte`
- Line 186: Wallet navigation

#### `src/lib/components/dashboard/quotes/MyQuotesPanel.svelte`
- Line 1022: Dashboard URL construction

#### `src/lib/components/profile/ProfileServicesSection.svelte`
- Line 69: Create service link

#### `src/lib/components/onboarding/CompleteSetup.svelte`
- Line 42: Post-onboarding redirect

#### `src/lib/components/translation/TranslationSettings.svelte`
- Line 27: Translation namespace path

#### `src/lib/api/services/push-notification.service.ts`
- Lines 253, 386, 401: Push notification deep link fallbacks

#### `src/lib/utils/service-quote/notifications.ts`
- Line 41: Notification URL construction

#### `src/lib/utils/service-quote/services-workspace-route.ts`
- Line 181: Service workspace URL

#### `src/lib/utils/dashboardQuery.ts`
- Line 328: Earning URL construction

#### `src/lib/i18n/i18n.ts`
- Line 189: Route namespace detection
- Line 282: Debug route detection

#### Route files with redirects
- `src/routes/(company)/+page.ts` line 15: `redirect(303, '/dashboard')` → `redirect(303, '/hiring')`
- `src/routes/(app)/auth/+layout.ts` line 25: `redirect(303, '/dashboard')` → `redirect(303, '/hiring')`
- `src/routes/(app)/auth/login/+page.svelte` line 436: fallback → `'/hiring'`
- `src/routes/(app)/404/+page.svelte` lines 54, 60: Links to dashboard
- `src/routes/(app)/services/+page.svelte` lines 246, 785, 1014: Service links
- `src/routes/(app)/npub/[npub]/+page.svelte` line 448: Messages link
- `src/routes/(company)/tasker-fees/+page.svelte` line 310: Create task link
- `src/routes/(company)/delete-account/+page.svelte` line 129: Settings link

#### Dashboard sub-routes with internal navigation
- `dashboard/+page.svelte` lines 43, 50, 354: Internal navigation
- `dashboard/messages/+page.svelte` lines 299, 593: Message navigation
- `dashboard/messages/to/[pubkey]/+page.svelte` lines 50, 56, 80: Message navigation
- `dashboard/create-task/+page.svelte` lines 103, 356: Post-creation redirect
- `dashboard/create-service/+page.svelte` lines 98, 131: Service creation
- `dashboard/service-requests/+page.ts` line 4: Redirect
- `dashboard/debug-wallet/+page.ts` line 6: Redirect
- `dashboard/debug-smart-contract/+page.ts` line 6: Redirect
- `(protected)/earning/+layout.svelte` lines 40, 58: Create service link

### 3. Sidebar Highlighting Fix

#### `src/lib/utils/consts.ts`
Update `sections` array:
```ts
{ id: 'hiring', path: '/hiring', icon: 'mdi:briefcase-outline', label: 'navbar.hiring', mobile: true }
```

#### `src/routes/(app)/(protected)/+layout.svelte`
Update sidebar active check (line ~90):
```svelte
class:menu-active={page.url.pathname.startsWith(section.path)}
```

For the `hiring` section, this will match `/hiring`, `/hiring/my-tasks`, `/hiring/contracts`, `/hiring/service-requests`.

For the `earning` section, this already works with `/earning/*` routes.

### 4. Earning Sidebar Fix

The `earning` section in `consts.ts` uses `path: '/earning'`. The sidebar active check uses `page.url.pathname === section.path`. This means only `/earning` (exact) highlights, not `/earning/bids`, `/earning/contracts`, etc.

Fix: change the active check to use `startsWith`:
```svelte
class:menu-active={page.url.pathname.startsWith(section.path)}
```

This makes both `hiring` and `earning` highlight correctly for all sub-routes.

### 5. i18n Updates

Update route namespace detection in `src/lib/i18n/i18n.ts`:
```ts
// Before
if (route.includes('/dashboard')) { ... }

// After
if (route.includes('/hiring') || route.includes('/create-task') || route.includes('/wallet') || ...) { ... }
```

### 6. Test Updates

All test files referencing `/dashboard` need updating (~28 matches in e2e and unit tests).

## Implementation Order

1. **Create `/hiring` route group** with my-tasks, contracts, service-requests sub-routes
2. **Move dashboard sub-routes** to `(protected)/` root (wallet, settings, messages, etc.)
3. **Update navigation constants** (`consts.ts`, `menu.constants.ts`, `navigation.store.ts`)
4. **Update all link references** across components (118 references)
5. **Fix sidebar highlighting** (`startsWith` instead of exact match)
6. **Update i18n namespace detection**
7. **Update redirects** in auth layout and other route files
8. **Update tests**
9. **Delete old dashboard directory**

## Risks

- **Deep links**: Push notifications and Capacitor deep links may reference `/dashboard` URLs. Update `push-notification.service.ts` and deep-link handlers.
- **Bookmarks**: Users with bookmarked `/dashboard` URLs will get 404s. Add server-side redirects from `/dashboard` → `/hiring` and `/dashboard/*` → new paths.
- **SEO**: If any `/dashboard` URLs were indexed (unlikely since they're behind auth), add redirects.

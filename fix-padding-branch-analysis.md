# Branch Analysis: `fix-padding` vs `dev`

## Overview

The `fix-padding` branch resolves a series of iOS PWA layout problems that were invisible on
desktop and Android Chrome, but caused broken UI on iPhones (especially with a Home Indicator
or Dynamic Island). A secondary visual fix resolves a layout gap visible on all platforms.

---

## Commits (newest → oldest)

| Hash | Message |
|------|---------|
| `61fdc5f` | fix(padding): fix menu clip, navbar height, and active indicator on iPhone |
| `02592541` | fix(padding): fix active indicator clipping, DaisyUI after conflict, and 80px/64px fallback mismatch |
| `be206bba` | fix(padding): only expand app-height on keyboard close, not shrink on open |
| `cb30ed5c` | fix(padding): use visualViewport height to prevent iOS keyboard gap below dock |
| `c87e4776` | fix(padding): remove DaisyUI dock margin-bottom and force 64px height for centered icons |
| `ec3dcb18` | fix(padding): remove safe-area from dock so bar sits flush with phone edge |
| `759467ef` | fix(padding): dock-wrapper safe-area background with fixed 64px dock |
| `fc5f713b` | fix(padding): dock safe-area integrated without centering drift |
| `a2b9bc7f` | fix(padding): make dock 64px fixed and move safe-area into footer |
| `d1a2b20c` | fix(padding): tighten iOS dock action zone |
| `df272745` | fix(padding): menu animation sync and iOS flicker hardening |
| `3380f2f8` | fix(padding): tighten bottom dock icon alignment |
| `97420300` | fix(padding): prevent iOS scroll gestures on bars + tighten bottom dock |
| `22149420` | fix(padding): remove footer extra safe padding + stop TopBar sticky |
| `ad5c0ced` | fix(padding): align top bar row on iOS PWA |
| `d992c99f` | fix(padding): iOS PWA safe areas via constant() fallback (minimal change) |

---

## Files Changed

```
src/app.css                                        +54 / -36
src/app.html                                        +1 /  -0
src/lib/components/BottomNavBar.svelte             +51 / -113  (net -62 lines of workarounds)
src/lib/components/Drawer.svelte                    +1 /  -1
src/lib/components/TopBar.svelte                   +15 /  -9
src/lib/components/wallet/WalletPaymentModal.svelte +1 /  -1
src/routes/(protected)/dashboard/find-tasks/+page.svelte  (simplified CSS overrides)
src/routes/+layout.svelte                          +25 /  -0
src/routes/npub/[npub]/+page.svelte                 +1 /  -1
src/routes/tasks/+page.svelte                      (simplified scroll height calc)
```

---

## Problem 1 — iOS PWA Safe Areas Not Applied (iPhone-only)

### What was broken

On iPhone, when installed as a PWA (Add to Home Screen), the app renders under the system UI
unless the page explicitly requests safe-area insets. Two separate iOS quirks compounded the
issue:

1. **`viewport-fit=cover` missing comment** — The meta tag was present but undocumented, making
   it easy to accidentally remove during a merge.
2. **`constant()` fallback missing** — iOS 11.0–11.1 uses the old `constant(safe-area-inset-*)`
   syntax. iOS 11.2+ uses `env()`. Without the `constant()` fallback, those older versions
   (and some edge cases in current iOS where `env()` returns 0 in a PWA context on cold boot)
   got zero insets, causing the navbar and dock to overlap system chrome.

### Changes

**`src/app.html`**
```diff
+ <!-- viewport-fit=cover required for iOS PWA safe areas (notch, home indicator) -->
  <meta name="viewport" content="viewport-fit=cover, width=device-width, initial-scale=1.0, minimum-scale=1.0">
```

**`src/app.css`** — all safe-area utility classes updated:
```diff
- padding-top: env(safe-area-inset-top, 0);
+ padding-top: env(safe-area-inset-top, constant(safe-area-inset-top, 0px));
```
Same pattern applied to `.pt-safe`, `.pb-safe`, `.pl-safe`, `.pr-safe`.

**`src/lib/components/TopBar.svelte`** — local `.pt-safe` override updated:
```diff
- padding-top: var(--safe-area-inset-top, env(safe-area-inset-top, 0px));
+ padding-top: var(--safe-area-inset-top, env(safe-area-inset-top, constant(safe-area-inset-top, 0px)));
```

**`src/lib/components/Drawer.svelte`** and **`WalletPaymentModal.svelte`** — same `constant()`
fallback added to inline safe-area padding values.

### Platform impact

| Platform | Affected? |
|----------|-----------|
| iPhone (PWA) | ✅ Yes — primary target of this fix |
| iPhone (Safari browser tab) | ✅ Yes — `constant()` fallback still helps edge cases |
| Android Chrome | ❌ No — Android uses `env()` and was already working |
| Desktop | ❌ No |

---

## Problem 2 — TopBar Row Alignment Broken on iPhone PWA

### What was broken

On iPhone in PWA mode, the navbar left side (logo / language selector) and right side
(dark mode toggle / avatar) were not vertically aligned on the same row. The right section
had no explicit `items-center`, causing it to collapse or shift on notched iPhones where
the safe-area padding pushes the row taller than DaisyUI's default 4rem baseline.

### Changes

**`src/lib/components/TopBar.svelte`**
```diff
- class="navbar bg-base-100/80 border-base-300 pt-safe sticky top-0 z-50 ..."
+ class="navbar navbar-fixed-row touch-none bg-base-100/80 border-base-300 pt-safe z-50 ..."
```
- `sticky top-0` removed — the app-shell grid already positions the header, `sticky` caused
  double-positioning.
- `touch-none` added — prevents iOS from triggering scroll gestures on the navbar.
- `navbar-fixed-row` class added with explicit `min-height: calc(safe-area-inset-top + 4rem)`
  to keep height consistent across all iPhone models.

```diff
- <div class="navbar-end mr-2 flex w-full flex-1 gap-1">
+ <div class="navbar-end mr-2 flex min-h-[44px] w-full flex-1 items-center gap-1">
```
- `items-center` added — forces right-side icons to align with the logo on the left.
- `min-h-[44px]` added — Apple's minimum tappable target size for touch.

### Platform impact

| Platform | Affected? |
|----------|-----------|
| iPhone (PWA) | ✅ Yes — visible misalignment fixed |
| iPhone (Safari) | ✅ Marginal benefit (consistent touch targets) |
| Android | ❌ No visible change |
| Desktop | ❌ No visible change |

---

## Problem 3 — Dock (Bottom Navigation) Height and Icon Centering

### What was broken

DaisyUI's `.dock` component is `position: fixed` by default and adds `padding-bottom` equal to
`safe-area-inset-bottom` to push icons above the home indicator. When the dock was placed inside
the app-shell footer grid row (which is already `position: relative` inside the layout flow),
DaisyUI's safe-area padding caused two problems:

1. The dock grew taller than 64px (the design spec), making icons appear shifted upward.
2. DaisyUI also adds `margin-bottom: 0.5rem` to every dock child (`.dock > *`), which
   compounded the misalignment.

On iPhone the dock was measured as ~80px or more, while the CSS variable `--bottom-nav-height`
was set to 64px, causing an 16px gap between the dock and the bottom of the screen or a
mismatch in scroll padding calculations.

### Changes

**`src/app.css`**
```css
/* Override DaisyUI's fixed positioning — dock lives in the grid footer row */
.app-shell__footer .dock {
  position: relative !important;
  inset: auto !important;
  height: 64px !important;        /* enforce design-spec height */
  padding-bottom: 0 !important;   /* DaisyUI's safe-area padding removed */
}

/* DaisyUI's child margin-bottom also removed */
.app-shell__footer .dock > * {
  margin-bottom: 0 !important;
}

/* Suppress DaisyUI's own ::after active indicator on button children only.
   Custom ::after on <a> elements kept for our animated indicator. */
.app-shell__footer .dock > button::after {
  display: none !important;
}
```

**`src/lib/components/BottomNavBar.svelte`** — ResizeObserver now uses `requestAnimationFrame`
before writing the `--app-dock-height` CSS variable, avoiding a race condition on iOS where the
viewport/keyboard transitions cause layout thrashing if the variable is written mid-frame.

### Platform impact

| Platform | Affected? |
|----------|-----------|
| iPhone (PWA) | ✅ Yes — 80px→64px fix, icon centering, active indicator |
| iPhone (Safari) | ✅ Yes — same layout engine |
| Android Chrome | ⚠️ Partial — Android has no home indicator but still benefits from the 64px enforcement and active indicator fix |
| Desktop | ❌ Hidden (dock is `lg:hidden`) |

---

## Problem 4 — iOS Keyboard-Close Gap Below Dock

### What was broken

When the virtual keyboard is dismissed on iPhone, iOS animates the viewport height back to
full screen. During the animation window, the app-shell height (which was set to `100dvh`)
did not track the visual viewport — it stayed at the keyboard-open height momentarily,
leaving a blank gray gap between the dock and the bottom of the screen.

### Changes

**`src/routes/+layout.svelte`** — `visualViewport` resize listener added in `onMount`:

```typescript
const vp = window.visualViewport;
if (vp) {
  let lastHeight = vp.height;
  const onVpResize = () => {
    const h = Math.round(vp.height);
    // Only expand (keyboard closing), never shrink (keyboard opening)
    // Shrinking would push the dock up while the user is typing
    if (h > lastHeight) {
      document.documentElement.style.setProperty('--app-height', `${h}px`);
    }
    lastHeight = h;
  };
  vp.addEventListener('resize', onVpResize);
  // cleanup on destroy
}
```

**`src/app.css`** — app-shell now consumes this variable:
```css
.app-shell {
  height: 100vh;
  height: 100dvh;
  height: var(--app-height, 100dvh); /* JS-measured value wins when available */
}
```

### Why only expand, never shrink?

If the shell shrank when the keyboard opened, the dock would be pushed upward (above the
keyboard). Users expect the dock to stay hidden behind the keyboard and reappear when it
closes. By only expanding (i.e., reacting to keyboard close), the dock snaps back to its
correct position without any upward drift while typing.

### Platform impact

| Platform | Affected? |
|----------|-----------|
| iPhone (PWA + Safari) | ✅ Yes — primary issue |
| Android Chrome | ❌ No — Android handles `100dvh` correctly and doesn't have this gap |
| Desktop | ❌ No |

---

## Problem 5 — Dark Gray "Pit" Below Content (All Platforms)

### What was broken

On any page where content was shorter than the full viewport height (e.g., a task detail page
with few tasks, or the dashboard with an empty panel), the bottom portion of the screen showed
an empty dark gray (`bg-base-200`) area. Content was pushed to the top, leaving the bottom
third of the screen unused and visually imbalanced.

**Root cause:** Inside `app-shell__content` (the `1fr` grid row that fills all available
height), there was an intermediate wrapper `<div>` that had no height set:

```svelte
<!-- BEFORE -->
<div class="bg-base-200 overflow-x-hidden">
  {@render children()}
</div>
```

This div shrank to its content height. The `app-shell__content` grid row correctly filled
`1fr` of the viewport, but the wrapper inside it did not stretch to match, so the space below
the wrapper was empty background.

### Change

**`src/routes/+layout.svelte`**
```diff
- <div class="bg-base-200 overflow-x-hidden">
+ <div class="bg-base-200 h-full flex flex-col overflow-x-hidden">
```

`h-full` makes the wrapper fill the parent grid cell. `flex flex-col` establishes a flex
context so child pages that use `flex-1` or `grow` on their own outer wrapper can expand to
fill the remaining space.

### Why this fixes all dashboard pages without touching them

Every protected dashboard page already uses `h-full` on its outer wrapper:

```
/dashboard                → <div class="mx-auto h-full max-w-6xl ...">
/dashboard/create-task    → <div class="mx-auto h-full max-w-6xl ...">
/dashboard/wallet         → <div class="bg-base-100 mx-auto h-full ...">
/dashboard/settings       → <div class="mx-auto h-full max-w-6xl ...">
/dashboard/profile        → <div class="mx-auto h-full max-w-6xl ...">
/dashboard/messages       → <div class="mx-auto h-full max-w-6xl ...">
/dashboard/find-tasks     → <div class="... h-full min-h-0 ...">
```

Auth pages (login, signup, recover) use `grow` (equivalent to `flex-1`) on their outer
container. Both patterns (`h-full` and `grow`) only work when the parent is a flex or grid
container with a defined height. The single change to the intermediate wrapper unblocks all
of them at once.

### Platform impact

| Platform | Affected? |
|----------|-----------|
| iPhone | ✅ Yes |
| Android | ✅ Yes |
| Desktop | ✅ Yes |

This is a **universal layout fix** — the only change in this branch that affects all platforms.

---

## Problem 6 — Scroll Height Calculations Using `100vh` Instead of `--app-height`

### What was broken

`find-tasks/+page.svelte` and `tasks/+page.svelte` had inline scroll container height
calculations hardcoded to `100vh`. On iPhone, `100vh` equals the full screen height including
the system bars — not the usable viewport. Using it caused the scroll container to be taller
than the visible area, creating overflow that iOS scroll-bounced into the notch/dock.

### Changes

**`src/routes/(protected)/dashboard/find-tasks/+page.svelte`** and
**`src/routes/tasks/+page.svelte`**:
```diff
- max-height: calc(100vh - var(--app-dock-height, 64px) - 9rem);
- height:     calc(100vh - var(--app-dock-height, 64px) - 9rem);
+ max-height: calc(var(--app-height, 100dvh) - var(--app-footer-height, 64px) - 9rem);
+ height:     calc(var(--app-height, 100dvh) - var(--app-footer-height, 64px) - 9rem);
```

`--app-height` is the JS-measured `visualViewport` height (set in `+layout.svelte`). It
reflects the real usable height, not the OS screen height. This also replaces `100vh` with
`100dvh` as the fallback, which is the correct CSS unit for dynamic viewport heights.

Also removed from `tasks/+page.svelte`: the conditional `pb-24` padding that was added to
compensate for the (now-obsolete) fixed-position dock.

```diff
- class="... {$authState.isAuthenticated ? 'pb-24' : 'pb-8'}"
+ class="... pb-8"
```

Same removal in `npub/[npub]/+page.svelte`.

### Platform impact

| Platform | Affected? |
|----------|-----------|
| iPhone (PWA + Safari) | ✅ Yes — primary issue |
| Android | ⚠️ Minor — `100dvh` is the correct fallback on Android too |
| Desktop | ❌ No — these are `@media (max-width: 1023px)` rules |

---

## Summary Table

| Problem | Root Cause | Fix Location | iPhone | Android | Desktop |
|---------|-----------|-------------|--------|---------|---------|
| Safe areas not applied | Missing `constant()` fallback | `app.css`, `TopBar`, `Drawer`, `WalletPaymentModal` | ✅ | ❌ | ❌ |
| Navbar row misalignment | Missing `items-center`, wrong positioning | `TopBar.svelte` | ✅ | ❌ | ❌ |
| Dock height / icon drift | DaisyUI safe-area padding inside grid row | `app.css` | ✅ | ⚠️ | ❌ |
| Keyboard-close gap | `100dvh` doesn't track `visualViewport` | `+layout.svelte`, `app.css` | ✅ | ❌ | ❌ |
| Gray pit below content | Intermediate wrapper had no height | `+layout.svelte` | ✅ | ✅ | ✅ |
| Scroll height overflow | `100vh` used instead of `--app-height` | `find-tasks`, `tasks`, `npub` pages | ✅ | ⚠️ | ❌ |

**Legend:** ✅ Fixed / ❌ Not affected / ⚠️ Minor improvement

---

## Net Effect

- **iPhone PWA**: All six issues resolved. The app now renders correctly from the Dynamic
  Island to the Home Indicator on all current iPhone models.
- **Android**: One universal layout fix (gray pit). Minor improvements to dock sizing and
  scroll height fallback units.
- **Desktop**: One universal layout fix (gray pit). All other changes are scoped to
  `max-width: 1023px` media queries or mobile-specific CSS variables.

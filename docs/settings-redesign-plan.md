# Settings Page Redesign Plan

## Overview

Redesign the `/settings` page from a single-page accordion layout to a card grid with animated icons and nested sub-routes. The current implementation stacks 5 collapsible sections vertically with no animations — this redesign introduces motion, better information architecture, and creative visual design.

## Current State

### Route & Components

- **Single page**: `src/routes/(app)/(protected)/settings/+page.svelte` (148 lines)
- **5 collapsible sections** rendered as daisyUI `collapse collapse-arrow`:
  1. `<NostrNsec>` — Login Info (390 lines)
  2. `<Devices>` — Connected Devices (657 lines)
  3. `<AccRecovery>` — Account Recovery (621 lines)
  4. `<MutedUsers>` — Muted Users (151 lines)
  5. `<AccActions>` — Account Actions (96 lines)
- All settings components use **inline SVGs** (Heroicons style)
- Key loading (`npub`, `nsec`, `mnemonic`, `authMethod`) happens in `+page.svelte` via `onMount`
- No animations, no cards, no grid layout

### Existing Animation System

- `motion` library (Motion One) installed — `src/lib/utils/animations.ts`
- 5 helpers: `animateDrawerPanelOpen`, `staggerGridItems`, `animateIconTap`, `animatePress`, `animatePressRelease`
- CSS animations in `app.css`: `pulse-glow`, `float-glow`, `fade-in`, `highlight-pulse`
- `DockIcon.svelte` has `activeIndicator` keyframe animation
- All animations respect `prefers-reduced-motion`

### Existing Sub-route Pattern

- `/hiring` uses `+layout.svelte` with tab navigation and sub-routes (`my-tasks/`, `contracts/`, `service-requests/`)
- `/hiring/+page.svelte` redirects to `/hiring/my-tasks`
- Sub-routes use `transition:slide` for expanding content

### Icon System

- `unplugin-icons` with `~icons/mdi/*` for navigation icons
- Inline SVGs for settings components
- MDI icons rendered as inline `<svg>` by unplugin-icons

---

## Proposed Route Structure

```
src/routes/(app)/(protected)/settings/
├── +layout.svelte          # Shared layout: loads keys, renders children with transitions
├── +page.svelte            # Card grid (links to sub-pages)
├── nostr/+page.svelte      # NostrNsec wrapper
├── devices/+page.svelte    # Devices wrapper
├── recovery/+page.svelte   # AccRecovery wrapper
├── muted/+page.svelte      # MutedUsers wrapper
└── actions/+page.svelte    # AccActions wrapper
```

## Settings Layout (`+layout.svelte`)

- Moves `loadKeys()` logic from current `+page.svelte` here
- Stores loaded data in Svelte context (`setContext`) so child pages can `getContext`
- Wraps `{@render children()}` with `fly` transition that changes direction based on navigation depth:
  - `/settings` → `/settings/nostr`: slide left (child enters from right)
  - `/settings/nostr` → `/settings`: slide right (child exits to right)
- Loading/error states handled at layout level

## Card Grid (`/settings/+page.svelte`)

**Layout**: Responsive grid — 1 column mobile, 2 columns tablet (`sm:`), 3 columns desktop (`md:`). 5 cards fit in a 3+2 arrangement.

**Card design**:
- Each card is an `<a href="/settings/{slug}">` element
- Contains: animated icon (top/center), title, brief description
- daisyUI `card` base with custom hover effects
- Staggered entrance animation using `motion`'s `stagger()`
- Hover: subtle scale up, shadow elevation, icon animation intensifies

**Card definitions**:

| Card | Route | Icon (MDI) | Animation |
|------|-------|-----------|-----------|
| Login Info | `/settings/nostr` | `mdi:key-outline` | Gentle pulse glow |
| Devices | `/settings/devices` | `mdi:cellphone-link` | Subtle float (translateY) |
| Recovery | `/settings/recovery` | `mdi:shield-lock-outline` | Slow rotate oscillation |
| Muted | `/settings/muted` | `mdi:volume-mute-outline` | Subtle vibrate/shake |
| Actions | `/settings/actions` | `mdi:cog-outline` | Slow continuous rotation |

## Animated Icons (CSS `@keyframes`)

Approach: Pure CSS keyframe animations targeting the icon wrapper. No new dependencies.

```css
@keyframes icon-pulse-glow {
  0%, 100% { filter: drop-shadow(0 0 0px var(--color-primary)); transform: scale(1); }
  50% { filter: drop-shadow(0 0 8px var(--color-primary)); transform: scale(1.05); }
}

@keyframes icon-float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-4px); }
}

@keyframes icon-rotate-oscillate {
  0%, 100% { transform: rotate(0deg); }
  25% { transform: rotate(8deg); }
  75% { transform: rotate(-8deg); }
}

@keyframes icon-vibrate {
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-2px); }
  40% { transform: translateX(2px); }
  60% { transform: translateX(-1px); }
  80% { transform: translateX(1px); }
}
```

All animations: `animation-iteration-count: infinite`, slow durations (2-4s), respect `prefers-reduced-motion`.

## Sub-page Design

Each sub-page (`nostr/+page.svelte`, etc.):
- Imports the corresponding component
- Gets data from layout context via `getContext`
- Has a **back button** at the top: `<a href="/settings">` with arrow-left icon + "Settings" label
- Minimal wrapper

## Page Transitions

In `+layout.svelte`:
```svelte
{#key page.url.pathname}
  <div in:fly={{ x: isChildRoute ? 300 : -300, duration: 300 }}
       out:fly={{ x: isChildRoute ? -300 : 300, duration: 200 }}>
    {@render children()}
  </div>
{/key}
```

Direction determined by comparing current pathname to `/settings`.

## Data Flow

```typescript
// In +layout.svelte
setContext('settings', {
  get npub() { return npub; },
  get nsec() { return nsec; },
  get mnemonic() { return mnemonic; },
  get authMethod() { return authMethod; },
  get loading() { return loading; },
  get error() { return error; },
  loadKeys
});
```

Sub-pages: `const { npub, nsec, ... } = getContext('settings');`

## i18n

New keys for `static/locales/{en,es}/dashboard/settings.json`:
```json
{
  "settings.cards.nostr.title": "Login Info",
  "settings.cards.nostr.description": "View and manage your Nostr keys",
  "settings.cards.devices.title": "Devices",
  "settings.cards.devices.description": "Manage connected devices",
  "settings.cards.recovery.title": "Recovery",
  "settings.cards.recovery.description": "Set up account recovery",
  "settings.cards.muted.title": "Muted",
  "settings.cards.muted.description": "Manage muted users",
  "settings.cards.actions.title": "Actions",
  "settings.cards.actions.description": "Logout or delete account",
  "settings.back": "Back to Settings"
}
```

## Files Modified/Created

| Action | File |
|--------|------|
| **Create** | `src/routes/(app)/(protected)/settings/+layout.svelte` |
| **Rewrite** | `src/routes/(app)/(protected)/settings/+page.svelte` |
| **Create** | `src/routes/(app)/(protected)/settings/nostr/+page.svelte` |
| **Create** | `src/routes/(app)/(protected)/settings/devices/+page.svelte` |
| **Create** | `src/routes/(app)/(protected)/settings/recovery/+page.svelte` |
| **Create** | `src/routes/(app)/(protected)/settings/muted/+page.svelte` |
| **Create** | `src/routes/(app)/(protected)/settings/actions/+page.svelte` |
| **Modify** | `src/app.css` (icon animation keyframes) |
| **Modify** | `src/lib/utils/animations.ts` (card entrance helper) |
| **Modify** | `static/locales/en/dashboard/settings.json` |
| **Modify** | `static/locales/es/dashboard/settings.json` |

**No new npm dependencies required.**

---

## Research: Animated Icon Options

### Option A: CSS `@keyframes` on existing MDI icons (Original Plan)

- **Approach**: Apply CSS keyframe animations to the `<span>` wrapper or directly to the inline `<svg>` produced by `unplugin-icons`
- **Pros**: Zero new dependencies, GPU-accelerated for transform/opacity, full control, lightweight
- **Cons**: Manual effort per icon — each animation must be hand-crafted. Only simple motions work well (pulse, float, rotate, vibrate). Cannot do complex path morphing or stroke drawing animations without deep SVG manipulation
- **Effort**: Medium — 5 custom keyframe definitions + CSS classes
- **Quality**: Moderate — looks good for subtle ambient motion, but limited to whole-icon transforms

### Option B: `line-md` (Material Line Icons) via Iconify

- **What**: 1,218 MIT-licensed animated icons by the same author as the Iconify project. These are **pre-animated SVGs** using SVG Animations Level 2 spec (not SMIL — modern browser support)
- **Available variants**: Static, animated (one-shot), `-loop` (continuous), `-twotone` (two-color), `-twotone-loop`
- **Relevant icons found**:
  - `line-md:key` / `line-md:key-loop` — key with draw-on animation
  - `line-md:cellphone` — phone with animation
  - `line-md:shield` / `line-md:shield-twotone-loop` — shield with draw animation
  - `line-md:volume` / `line-md:volume-loop` — volume with animation
  - `line-md:cog` / `line-md:cog-loop` — cog with rotation animation
- **Integration**: Works with `unplugin-icons` (Iconify-based). Import as `~icons/line-md/cog-loop`
- **Pros**: Zero new dependencies (already using `unplugin-icons` + `@iconify-json/mdi`), just need to install `@iconify-json/line-md`. Icons animate themselves — no CSS keyframe work needed. Professional, consistent animation style. MIT licensed. 1,218 icons available
- **Cons**: Need to verify exact icon matches for all 5 cards. SVG animations have a known issue where inline SVGs won't animate until document is fully loaded (blocked by slow external scripts). The `-loop` variants solve the "restart animation" problem
- **Effort**: Low — install package, change import paths
- **Quality**: High — purpose-built animations by the Iconify author, consistent style
- **Package**: `npm install -D @iconify-json/line-md`

### Option C: Lordicon (Animated Lottie/JSON icons)

- **What**: 43,900+ animated icons in multiple styles (outline, flat, lineal, gradient, doodle)
- **Free tier**: 9,000 free icons, personal license, attribution required, unlimited exports
- **Pro tier**: $8/mo (annual) for 34,800 additional icons, commercial license, no attribution
- **Integration**: Web component `<lord-icon>` via `@lordicon/element` npm package. Supports triggers (hover, click, loop, morph, boomerang), color customization via CSS variables, stroke weight control
- **Triggers**: `in`, `click`, `hover`, `loop`, `loop-on-hover`, `morph`, `boomerang`, `sequence` — perfect for card interactions
- **Pros**: Highest quality animated icons available. Rich trigger system (hover to animate, loop, morph between states). Lottie-based (small file sizes, scalable). Web component works in any framework. Free tier has 9,000 icons
- **Cons**: **Attribution required on free tier** (must display Lordicon credit). Free tier limited to personal use. Best icons require Pro ($8/mo). Adds a web component dependency. Icons are JSON files loaded from CDN or self-hosted — adds network requests. Not Iconify-compatible
- **Effort**: Low-Medium — install `@lordicon/element`, configure, download/host JSON files
- **Quality**: Highest — professionally crafted animations with rich interactivity
- **Package**: `npm install @lordicon/element`

### Option D: LottieFiles dotLottie-svelte

- **What**: Svelte component for playing Lottie/dotLottie animations. Wrapper around `@lottiefiles/dotlottie-web`
- **Integration**: `<DotLottieSvelte src="path/to/animation.lottie" loop autoplay />`
- **Pros**: Official Svelte component. Supports `.lottie` (compressed) and `.json` formats. Full playback control (play, pause, stop, seek). Event system. Canvas-based rendering (performant)
- **Cons**: **No built-in icon library** — you need to source Lottie animations separately (LottieFiles marketplace, custom After Effects exports). Adds WebAssembly dependency (~200KB). Overkill for simple icon animations. Most Lottie icons on LottieFiles are free but quality varies
- **Effort**: Medium-High — install package + find/source appropriate Lottie animations for each card
- **Quality**: Variable — depends on the Lottie files you source
- **Package**: `npm install @lottiefiles/dotlottie-svelte`

### Option E: Lucide Icons

- **What**: 1,735 ISC-licensed icons, fork of Feather Icons. Clean, consistent 24x24 design
- **Svelte package**: `@lucide/svelte` — native Svelte components with props for size, color, stroke width
- **Pros**: Excellent Svelte integration (native components, not web components). Tree-shakable. TypeScript support. Very popular (used by shadcn/ui). Consistent design
- **Cons**: **No built-in animations** — still static icons, would need CSS keyframes like Option A. Different design language from MDI (stroke-based vs filled). Would need to replace all MDI icons project-wide for consistency, or use Lucide only for settings
- **Effort**: Medium — install package + CSS keyframes (same as Option A but with different icons)
- **Quality**: High quality icons, but no animation advantage over MDI
- **Package**: `npm install lucide-svelte`

### Recommendation

**Option B (`line-md`)** is the strongest choice for this project:

1. **Zero new paradigm** — uses the same `unplugin-icons` system already in place
2. **Purpose-built animations** — icons are designed to animate, not retrofitted with CSS
3. **Low effort** — install `@iconify-json/line-md`, change import paths
4. **Free, MIT, no attribution** — fully open source
5. **Consistent** — all animations by the same author, cohesive style

**Option C (Lordicon)** is the premium choice if you want the absolute best visual quality and are willing to accept attribution or pay $8/mo. The trigger system (hover-to-animate, loop-on-hover) would make the cards genuinely interactive.

**Hybrid approach**: Use `line-md` for the continuous ambient animations, and add CSS hover effects that intensify on interaction. This gives you pre-built loop animations + custom hover interactivity without any new dependencies beyond `@iconify-json/line-md`.

---

## Research: Card Design Effects & Inspiration

### Effect Options

#### 1. Spotlight/Mouse-Follow Gradient
- A radial gradient follows the cursor across the card surface
- Creates a "glowing" effect that feels alive
- **Implementation**: CSS `radial-gradient` + JS `mousemove` listener updating `background-position`
- **Reference**: Aceternity UI "Card Spotlight" component
- **Performance**: Good — CSS-only gradient, JS only updates position
- **Mobile**: Falls back to centered static gradient

#### 2. 3D Perspective Tilt (Tilt Card)
- Card tilts in 3D based on mouse position (perspective transform)
- Content appears to "float" above the card surface at different Z-depths
- **Implementation**: CSS `perspective` + `transform: rotateX() rotateY()` on `mousemove`
- **Reference**: Aceternity UI "3D Card Effect"
- **Performance**: Good — GPU-accelerated transforms
- **Mobile**: Can use device orientation API or disable tilt, use tap instead

#### 3. Glassmorphism
- Frosted glass effect: `backdrop-filter: blur()` + semi-transparent background
- Works great with colorful backgrounds or gradient meshes behind the cards
- **Implementation**: `backdrop-filter: blur(16px); background: rgba(255,255,255,0.05);`
- **daisyUI**: Already supports `glass` class
- **Performance**: Moderate — `backdrop-filter` is GPU-intensive on older devices
- **Mobile**: Works on modern mobile browsers

#### 4. Gradient Border Animation
- Animated gradient border that rotates around the card edge
- **Implementation**: `conic-gradient` + CSS `@keyframes` rotation on a pseudo-element
- **Performance**: Good — CSS-only animation
- **Visual**: Premium, eye-catching

#### 5. Glow on Hover
- Card emits a colored glow (box-shadow or filter: drop-shadow) on hover
- Glow color matches the card's theme (e.g., primary orange for all, or unique per card)
- **Implementation**: `box-shadow: 0 0 30px var(--glow-color)` on hover with transition
- **Performance**: Excellent — simple CSS transition
- **Visual**: Subtle but effective

#### 6. Staggered Entrance Animation
- Cards animate in one by one when the page loads
- Uses `motion` library's `stagger()` (already available)
- **Implementation**: Reuse `staggerGridItems` pattern from `animations.ts`
- **Performance**: Good — runs once on mount

#### 7. Border Gradient + Spotlight Combo
- Combine animated gradient border (#4) with mouse-follow spotlight (#1)
- Most visually impressive combination
- **Performance**: Good — both are CSS-based

#### 8. Noise Texture Overlay
- Subtle noise/grain texture over the card surface adds depth and prevents "flat digital" look
- **Implementation**: CSS `background-image: url("data:image/svg+xml,...")` with SVG noise filter, or a tiny PNG noise tile
- **Performance**: Excellent — static background image
- **Visual**: Adds tactile quality

### Recommended Card Design

Combine these effects for maximum impact:

```
Card Base:
├── Glassmorphism background (backdrop-filter: blur + semi-transparent bg)
├── Animated gradient border (conic-gradient rotation)
├── Subtle noise texture overlay
├── Spotlight/mouse-follow gradient (on hover)
├── Glow effect (on hover, color per card)
├── Scale up + shadow elevation (on hover)
└── Staggered entrance animation (on page load)

Icon Area:
├── Pre-animated loop icon (line-md or Lordicon)
├── Icon glow intensifies on card hover
└── Subtle scale on hover

Content:
├── Title (heading font)
├── Description (body font, muted)
└── Arrow indicator (appears on hover, slides in)
```

### Implementation Approach

All effects can be achieved with:
- **CSS**: glassmorphism, gradient borders, glow, scale, noise, transitions
- **JS (minimal)**: mouse position for spotlight effect (one `mousemove` listener per card)
- **`motion` library**: staggered entrance animation
- **No new dependencies** for card effects (all CSS + existing `motion`)

### Mobile Considerations

- Spotlight/mouse-follow: Falls back to a static centered glow on touch devices
- 3D tilt: Disable on touch, or use subtle device orientation
- Glassmorphism: Works on mobile but should test performance
- All hover effects should have equivalent focus states for accessibility

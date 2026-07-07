# Chat Design Renovation — WhatsApp/Telegram Hybrid

## Overview

Complete visual overhaul of the messages system to match the polish and feel of WhatsApp/Telegram, using the `motion` library (already installed) for animations and a gradient wash background. **Visual polish only** — no new features like read receipts or typing indicators.

## Design Direction

- **Tone**: Warm, polished, mobile-first. Conversation feels alive and tactile.
- **Reference**: WhatsApp bubble shapes + Telegram's clean spacing and animations.
- **Background**: Soft gradient wash behind message area (not plain solid color).
- **Animations**: Staggered message entry, smooth scroll, pulse on new message arrival.

---

## Files to Modify

### 1. `src/lib/components/messages/ChatMessage.svelte` — Message Bubble Redesign

**Current issues:**
- Flat `bg-base-200` / `bg-base-300` bubbles — no personality, no tails
- Reply UI uses a thin blue line that's hard to see
- Timestamp and sender name feel disconnected from the bubble
- No visual grouping for consecutive messages from the same sender

**Changes:**
- **Bubble tails**: CSS pseudo-elements creating a small triangle/tail on the bottom corner of each bubble (left for received, right for sent). WhatsApp-style.
- **Color differentiation**: Sent messages get a distinct soft green/teal tint (`bg-primary/10` or similar), received messages stay light (`bg-base-200`). Use daisyUI theme variables.
- **Bubble shape**: Rounded-2xl on 3 corners, slightly less rounded on the tail corner.
- **Reply quote redesign**: Replace thin blue line with a left-border accent bar (4px, rounded) + subtle background tint on the quoted section. Telegram-style.
- **Timestamp reposition**: Move timestamp inside the bubble at the bottom-right, smaller and more subtle. Remove the separate timestamp div below the bubble.
- **Sender name**: For received messages, show sender name above the bubble in a small accent color label (only in group contexts, but useful for 1:1 too).
- **Motion entry animation**: Each message animates in with `motion.animate()` — slide up + fade in, 200ms duration, staggered when loading history.

**i18n impact**: None (reusing existing keys).

---

### 2. `src/lib/components/messages/ChatView.svelte` — Chat Container + Input Redesign

**Current issues:**
- Messages area has `space-y-3` gap — no visual grouping
- Input area is plain `bg-base-200` rounded box
- Scroll-to-bottom button is a plain circle
- No message date separators
- Empty state is generic

**Changes:**
- **Gradient wash background**: Replace plain background on the messages scroll area with a subtle CSS gradient mesh (2-3 color stops using theme colors at very low opacity). Creates depth without distraction.
- **Date separators**: Add date header pills between messages from different days ("Today", "Yesterday", "Jan 15"). Centered chip/pill with `bg-base-200/80 backdrop-blur` styling. Uses a new `$derived` that groups messages by date.
- **Message grouping**: When consecutive messages are from the same sender within 2 minutes, reduce the vertical gap between them (remove top margin on subsequent messages in a group). WhatsApp does this.
- **Input area redesign**: 
  - Wrap input in a container with a subtle border-top gradient separator
  - Add a micro-animation on the send button (scale bounce on press using `motion`)
  - Input field gets a more prominent focus state with a subtle glow ring
- **Scroll-to-bottom button**: Add a small unread message count badge. Make it more visually prominent with a subtle shadow and smooth scale-in animation.
- **Empty state**: Replace generic chat icon with a more illustrative empty state — stylized chat bubbles illustration using SVG, with a gentle float animation.
- **Load more indicator**: Replace plain spinner with a subtle skeleton shimmer effect.

**i18n impact**: New keys needed for date separators (`messages.date.today`, `messages.date.yesterday`).

---

### 3. `src/routes/(app)/(protected)/messages/+page.svelte` — Conversation List Polish

**Current issues:**
- Plain list items with no visual hierarchy
- Search bar is basic
- Modal for new message is functional but bland
- Loading skeletons are minimal

**Changes:**
- **Conversation items**: 
  - Add subtle hover highlight with left-border accent
  - Show a small colored dot indicator for unread (future-proof, can be hidden for now)
  - Avatar gets a subtle ring on hover
  - Last message preview gets better typography (lighter weight, more truncation)
  - Time stamp uses a more subtle color and smaller size
- **Search bar**: Add a subtle glass-morphism effect (`backdrop-blur-sm bg-base-100/80`) and a more refined focus state.
- **Loading skeletons**: Improve skeleton shapes to match actual conversation item layout more closely. Add a shimmer animation using CSS.
- **Entrance animation**: Stagger-animate conversation items on load using `motion` (same pattern as settings page).
- **New message modal**: Polish the modal with smoother transitions, better spacing, and a more refined search results dropdown.

**i18n impact**: None (reusing existing keys).

---

### 4. `src/routes/(app)/(protected)/messages/to/[pubkey]/+page.svelte` — Chat Header Polish

**Current issues:**
- Header is functional but lacks personality
- Avatar in header is basic
- Action buttons are plain ghost buttons

**Changes:**
- **Header refinement**: Add a subtle bottom border gradient instead of solid line. Slightly increase avatar size.
- **Action buttons**: Add tooltip hints and subtle hover scale effect.
- **Back button**: Add a subtle slide-in animation on page entry.

**i18n impact**: None.

---

### 5. `src/lib/components/messages/MessageReactions.svelte` — Reaction Polish

**Changes:**
- **Reaction pills**: Better styling with rounded-full, subtle background, and a bounce animation on add.
- **Quick reactions bar**: Show on hover with a smooth fade-in, styled as a floating pill bar above the message (like Telegram's reaction picker).

**i18n impact**: None.

---

### 6. `static/locales/en/dashboard/messages.json` + `es` — New i18n Keys

**New keys needed:**
```json
{
  "messages.date.today": "Today",
  "messages.date.yesterday": "Yesterday",
  "messages.unread_count": "{count} unread"
}
```

---

## Animation Details (motion library)

Using `animate` and `stagger` from `motion` (already used in settings page):

| Element | Animation | Duration | Easing |
|---------|-----------|----------|--------|
| Message entry | `translateY: [12px, 0]`, `opacity: [0, 1]` | 200ms | ease-out |
| Message history load | Staggered entry, 30ms delay per message | 200ms each | ease-out |
| Conversation list items | `scale: [0.97, 1]`, `opacity: [0, 1]` | 250ms | ease-out |
| Send button press | `scale: [1, 0.9, 1]` | 150ms | ease-in-out |
| Scroll-to-bottom | `scale: [0, 1]`, `opacity: [0, 1]` | 200ms | spring |
| Date separator | `opacity: [0, 1]`, `scale: [0.95, 1]` | 200ms | ease-out |
| New message arrival | `translateY: [20px, 0]`, `opacity: [0, 1]` | 250ms | spring |

All animations respect `prefers-reduced-motion` — checked via `window.matchMedia` and skipped if reduced.

---

## Gradient Wash Background

```css
background: linear-gradient(
  135deg,
  var(--color-primary) 0.03,
  var(--color-base-200) 0.4,
  var(--color-secondary) 0.03,
  var(--color-base-100) 0.7,
  var(--color-accent) 0.02
);
```

Very subtle — the theme colors appear at 2-3% opacity, creating a soft wash that's barely perceptible but adds depth. Applied to the messages scroll container.

---

## Implementation Order

1. **Phase 1 — Message Bubbles** (`ChatMessage.svelte`): Bubble tails, colors, timestamp reposition, reply redesign, entry animation
2. **Phase 2 — Chat View** (`ChatView.svelte`): Gradient background, date separators, message grouping, input polish, scroll button badge, empty state
3. **Phase 3 — Conversation List** (`messages/+page.svelte`): Item redesign, entrance animation, search bar glass effect, skeleton improvement
4. **Phase 4 — Chat Header** (`messages/to/[pubkey]/+page.svelte`): Header polish, button animations
5. **Phase 5 — Reactions** (`MessageReactions.svelte`): Reaction pill styling, quick reactions bar
6. **Phase 6 — i18n + Cleanup**: Add new translation keys, run `find-missing-translations.py`, verify

---

## Validation

- `npm run check` — type safety
- `npm run lint` — style compliance
- `npm run test:unit:components` — component tests
- Visual verification with `npm run storybook` (if stories exist for messages)
- `python3 scripts/find-missing-translations.py --fix-suggestions` — i18n verification
- Manual test on both web and mobile viewport sizes

---

## Design Tokens (daisyUI theme variables to use)

| Token | Usage |
|-------|-------|
| `--color-primary` | Sent message tint, accent borders |
| `--color-base-100` | Received message background |
| `--color-base-200` | Input area, date separator pills |
| `--color-base-300` | Hover states, skeleton loading |
| `--color-base-content` | Primary text |
| `--color-base-content/60` | Secondary text (timestamps, previews) |
| `--color-info` | Reply accent bar, links |
| `--color-success` | Online indicators (future) |

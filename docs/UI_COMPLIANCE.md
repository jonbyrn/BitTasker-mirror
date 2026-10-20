# BitTasker UI compliance

Checklist for WCAG 2.2 AA, a 360px layout, one design system, pending actions, visible errors, and money labels. Audited on `sandbox/rgb-wasm-phase0` on 2026-10-20.

Other agents own pipeline, escrow behavior, Services, reviews, the wallet status indicator, and the visual redesign. This pass adds shared controls and fixes the payment and bid screens. It does not restyle those features.

## Checklist

| Check | Rule |
| --- | --- |
| Contrast | Text on a theme color is at least 4.5:1 in light and dark. |
| Focus | Keyboard focus uses a 3px ring in `base-content`. Touch focus does not remove that ring. |
| Names | Buttons, links, and inputs have a visible label or an `aria-label`. |
| Keyboard | A skip link is the first control. Modals move focus inside and restore it on close. Toasts use a live region. |
| Touch | Buttons, inputs, selects, and textareas are at least 44px tall. `touch-action: manipulation` stops a second tap from being eaten by double-tap zoom. |
| 360px | Rows wrap. No fixed-width price column. `document.scrollWidth` stays within `innerWidth` at 360, 390, and 412px. |
| One button | `ActionButton` in `src/lib/components/design/`. Pending label, `aria-busy`, and a disabled control while the work runs. |
| One card | `SurfaceCard`. |
| One input | `TextField`, with a label and `aria-invalid`. |
| One toast | `Toast` (existing). Errors use `role="alert"`. |
| One modal | `Modal` (existing). Focus moves into the dialog. |
| One list state | `ListRegion` for loading skeleton, empty, and error with a next step. |
| One money label | `MoneyAmount` plus `src/lib/utils/ui/money-display.ts`. |
| Async actions | `createSingleFlight()` ignores a second tap until the first finishes. |
| Errors | Plain English and a next step. No silent refresh. |
| Money | Show the bid or the locked contract amount, and say USDT, USD, or sats. Never show the task budget in the bid's price slot. |

## Design system

Use these instead of a one-off button, card, field, or empty state:

- `src/lib/components/design/ActionButton.svelte`
- `src/lib/components/design/SurfaceCard.svelte`
- `src/lib/components/design/TextField.svelte`
- `src/lib/components/design/ListRegion.svelte`
- `src/lib/components/design/MoneyAmount.svelte`
- `src/lib/components/Modal.svelte`
- `src/lib/components/Toast.svelte`

Colors live in the DaisyUI theme in `src/app.css` (`--color-primary`, `--color-base-content`, and the status pairs). Do not add a hex color inside `src/lib/components/design`.

## Automated checks

- Unit: `npx vitest run src/lib/tests/unit/utils/ui-compliance.test.ts`
  - Single-tap lock
  - Bid amount is not replaced by the task budget
  - USDT contract units follow the locked bid, not `totalAmountUsd`
  - A stale relay read cannot undo Approve
  - Every theme text pair in `src/app.css` is at least 4.5:1
- Tokens: `npm run lint:tokens`
  - ESLint rule `design-tokens/no-raw-color` on `src/lib/components/design/**/*.svelte`
- Browser: `npx playwright test tests/e2e/a11y --project=a11y`
  - Public routes at 360px: skip link, main landmark, named controls, labeled inputs, 44px targets
  - Logged-in routes at 360, 390, and 412px: `tests/e2e/a11y/mobile-overflow.spec.ts` fails when `document.scrollWidth` is wider than the viewport
  - Playwright's accessibility tree is the a11y runner. axe-core is not a dependency, so this does not replace a full axe crawl.

## Fixed in this pass

- **Approve, and the other contract actions, are one tap.** The button stays visible with "Approving…", "Submitting…", "Paying…", or "Cancelling…". A second tap is ignored. While the action runs, a background reload cannot put the contract back to the previous step. Failures end with "Tap Retry."
- **Bid lists show the bid.** My Bids used the task budget as the big price. It now shows the bid (for example `$20.00 USD` or `1,500 sats`). A different task budget is labeled "Task budget".
- **USDT amounts use the locked bid.** A contract whose rail is USDT displays `20.00 USDT` from `lockedAmount`, even when `totalAmountUsd` is a smaller leftover. The invoice unit count uses that same figure.
- **Missing BTC price is not 0 sats or Infinity.** `UsdSatsDisplay` says "price unavailable".
- **Status colors meet 4.5:1.** The visual redesign palette in `src/app.css` is unchanged. Light and dark text pairs, including info, success, warning, and error, measure at least 4.5:1. The unit test fails if a later edit drops a pair below that.
- **Focus, skip link, and 44px targets** are global: skip link in the root layout, focus ring, and a minimum control height.
- **Notifications** show a load or action error and Retry. Mark all read, Clear all, and Show all are single-tap and show a pending label.
- **Wallet transaction list** names previous, next, and page buttons, and tells the user to tap Refresh when the list fails.
- **Bid submit and Accept and fund** ignore a second tap and keep a pending label. Failures name the next tap. A locked or disconnected wallet stays on that step and shows the wallet status message. These buttons do not unlock the wallet themselves.
- **Deliverable fields** have labels ("What you finished", "Proof link").

## Still open

These were found in the audit and left in place so this pass does not rewrite the other agents' screens.

- **Most routes still use raw `btn` classes.** The shared `ActionButton` is wired through contracts, bid submit's neighbor (Accept and fund still uses `btn` with a pending label), notifications, and the design-system pieces. Tasks, Services, settings, wallet send, messages, and reviews still have their own buttons. New work should use `ActionButton`.
- **Muted text (`text-base-content/60`) is not in the 4.5:1 test.** Solid theme pairs pass. Sixty-percent text on `base-100` can fall short, especially in dark mode. The visual redesign should introduce one muted token and replace the opacity utilities.
- **One-off styles remain** outside `src/lib/components/design` (page-level Tailwind, a few hex values in `app.css` for glow and inverted marketing blocks). The lint rule is error-level only on the design-system folder so it does not fail the rest of the branch.
- **Per-notification delete and the unread badge** still catch errors and refresh without a sentence (`notificationCenter.store.ts`).
- **Messages, reviews, tasks, and Services** already have some empty, loading, and error states. They were not rebuilt. Services and reviews belong to the other agents.
- **Wallet send, receive, and escrow screens** still mix their own spinners. The contract detail view is the one brought onto `ActionButton`.
- **axe-core is not installed.** The overflow spec covers the logged-in routes at 360, 390, and 412px. It does not replace a full axe crawl.
- **A sync that reports 0 sats while Syncing is still true keeps the last balance.** A real empty wallet shows 0 only after sync finishes. The "Tap to reopen" banner is still the wasm crash message and still means reload the page.
- **Global error handler** still logs unhandled promise rejections to the console and does not show a toast, so a failure with no local catch can stay invisible.
- **Logout "Server Error"** remains item 114.

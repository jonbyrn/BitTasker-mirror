# Profile Page Redesign Plan v3 — Final UX Audit Report

**Auditor:** Sally (BMAD UX Designer)
**Date:** 2026-06-04
**Plan:** `plans/profile-page-redesign-v3.md`
**Previous Audit:** `plans/profile-page-redesign-AUDIT.md` (Winston — Architecture, 7 critical all fixed)
**Focus:** UX correctness, accessibility, visual consistency, mobile experience

---

## Executive Summary

Plan v3 is **strong** — the previous round's 7 critical architecture issues are all resolved. The component decomposition is clean, the lazy loading strategy is correct, and the ASCII mockups give developers enough to build from. However, **3 UX-critical issues** and **7 important issues** remain that would degrade real user experience, particularly on mobile.

**Verdict: NOT READY FOR IMPLEMENTATION** until Critical items are resolved.

---

## Previous Audit Status (All Resolved ✅)

| ID           | Issue                                       | Status                                                    |
| ------------ | ------------------------------------------- | --------------------------------------------------------- |
| CRITICAL-01  | Wrong task kind (36070 vs 31000)            | ✅ Fixed — uses `KINDS.TASK_CREATION`                     |
| CRITICAL-02  | Duplicate service fetch function            | ✅ Fixed — imports existing `findProfileServicesByAuthor` |
| CRITICAL-03  | Wrong file path (`profile.ts` is directory) | ✅ Fixed — all paths corrected                            |
| CRITICAL-04  | `+page.server.ts` doesn't exist             | ✅ Fixed — explicitly notes Capacitor SSR not available   |
| IMPORTANT-01 | No public task-by-author function           | ✅ Fixed — creates `findProfileTasksByAuthor`             |
| IMPORTANT-02 | Race condition in parallel fetch            | ✅ Fixed — uses `Promise.allSettled`                      |
| IMPORTANT-03 | Missing per-section error boundaries        | ✅ Fixed — lazy loading per section                       |
| IMPORTANT-04 | `$derived` syntax must be Svelte 5          | ✅ Fixed — Section 10 addresses this                      |
| IMPORTANT-05 | Lazy loading contradicts mount fetch        | ✅ Fixed — true lazy loading implemented                  |

---

## UX Audit Findings

### 1. Mobile Sticky CTA Bar

#### UX-CRITICAL-01: Missing `safe-area-inset-bottom` — iPhone Home Bar Occludes Hire Me Button

**Severity:** 🔴 Critical
**Location:** Task 3.1 (ProfileHero), Task 4.1 (Page Integration), Mobile mockup lines 225-229
**Detail:** The mobile mockup shows a sticky bottom CTA bar with `[Hire Me]`. On iPhones with Face ID (iPhone X and later), the home indicator bar sits at the bottom of the screen. Without `env(safe-area-inset-bottom)` padding, the Hire Me button will be partially hidden behind the home bar — the primary CTA on the entire page will be un-tappable.

**Impact:** ~60% of mobile users (iPhone) cannot tap the Hire Me button. This is the single most important conversion action on the profile page.

**Fix:** Add to the sticky CTA bar implementation:

```css
.sticky-cta-bar {
	padding-bottom: env(safe-area-inset-bottom, 0px);
	/* Also add to <meta> in app.html: */
	/* <meta name="viewport" content="viewport-fit=cover"> */
}
```

And add bottom padding to the page content container equal to the CTA bar height + safe area:

```css
.page-content {
	padding-bottom: calc(4rem + env(safe-area-inset-bottom, 0px));
}
```

---

#### UX-IMPORTANT-01: Missing z-index Specification for Sticky CTA Bar

**Severity:** 🟡 Important
**Location:** Task 3.1, Mobile mockup
**Detail:** The nav is specified as `sticky top-16 z-10` (line 427). The sticky CTA bar has no z-index specified. If the CTA bar is `z-10` or lower, the nav's shadow will overlay it when scrolling. The CTA bar should be above the nav layer.

**Fix:** Specify `z-20` or `z-30` for the sticky CTA bar. Add to plan:

```
sticky bottom-0 z-20 bg-base-100 shadow-[0_-2px_10px_rgba(0,0,0,0.1)]
```

---

#### UX-IMPORTANT-06: No Bottom Padding to Prevent Content Occlusion Behind Sticky CTA

**Severity:** 🟡 Important
**Location:** Task 4.1 (Page Integration)
**Detail:** The sticky CTA bar will overlap the bottom of the last visible section (Tasks). Users won't see the last 1-2 task cards or the section footer. The plan doesn't specify adding padding-bottom to the page content area.

**Fix:** Add `pb-20` (or equivalent to CTA bar height + safe area) to the main content container in Task 4.1.

---

### 2. Section Navigation

#### UX-IMPORTANT-04: No Focus Management After Nav Click — Keyboard Users Lost

**Severity:** 🟡 Important
**Location:** Task 3.2 (ProfileNav), scroll-lock implementation lines 433-446
**Detail:** The scroll-lock implementation calls `scrollIntoView({ behavior: 'smooth' })` but doesn't move keyboard focus to the target section. For sighted keyboard users: they click "About" in the nav, the page scrolls, but focus stays on the nav link. They must Tab through the entire nav + all previous sections to reach the content they just navigated to.

**Fix:** After scrolling, set focus to the target section's heading:

```typescript
function handleNavClick(sectionId: string) {
	scrollLock = true;
	activeSection = sectionId;
	const target = document.getElementById(sectionId);
	target?.scrollIntoView({ behavior: 'smooth' });
	// Move focus for keyboard users
	const heading = target?.querySelector('h2, h3');
	if (heading) {
		heading.setAttribute('tabindex', '-1');
		heading.focus({ preventScroll: true });
	}
	// ... rest of scroll-lock logic
}
```

---

#### UX-SUGGESTION-05: Nav Scroll-Lock `scrollend` Event Not Supported on Safari

**Severity:** 🟢 Suggestion
**Location:** Task 3.2, lines 439-445
**Detail:** The `scrollend` event is not supported on Safari (including iOS 17). The `setTimeout` fallback at 600ms handles this, but the `addEventListener` with `{ once: true }` will attach a listener that never fires (and never auto-removes since `once` only removes after firing). This is a minor memory leak per click.

**Fix:** Add a `scrollend` support check:

```typescript
if ('onscrollend' in window) {
	window.addEventListener('scrollend', onScrollEnd, { once: true });
} else {
	// Fallback: use requestAnimationFrame polling or just the timeout
}
```

Or simply always use the timeout fallback — 600ms is short enough that users won't notice.

---

### 3. Responsive Grid Layouts

#### UX-CRITICAL-02: Mobile Grid Mismatch — `grid-cols-2` Applied to All Sizes Including Mobile

**Severity:** 🔴 Critical
**Location:** Task 3.3 (ProfileServicesSection), line 458
**Detail:** The plan specifies `grid-cols-2 xl:grid-cols-3` for services. Tailwind's default (no prefix) applies to ALL screen sizes, including mobile (<640px). This means:

- <640px: 2-column grid (plan says "stacked cards" = 1 column)
- 640-1279px: 2-column grid ✅
- > =1280px: 3-column grid ✅

The breakpoint table (line 646) says <640px should be "stacked cards" but the CSS classes contradict this.

**Impact:** On small phones (320-375px viewport), service cards will be squeezed into a 2-column grid with ~150px per card. Images, titles, descriptions, and prices will be truncated or overflow.

**Fix:** Change to `grid-cols-1 sm:grid-cols-2 xl:grid-cols-3`:

```
Mobile (<640px):   grid-cols-1  → stacked cards ✅
Tablet (640-1279): sm:grid-cols-2 → 2-column ✅
Desktop (>=1280):  xl:grid-cols-3 → 3-column ✅
```

---

### 4. Portfolio Masonry

#### UX-IMPORTANT-02: CSS Columns Masonry Flows Column-First, Not Row-First

**Severity:** 🟡 Important
**Location:** Task 3.7 (ProfilePortfolioSection), line 490
**Detail:** CSS `columns-2 lg:columns-3` creates a masonry layout where items flow top-to-bottom within each column, NOT left-to-right across rows. This means:

```
Item order in DOM:  [1] [2] [3] [4] [5] [6]
Visual with CSS columns-2:
  Col 1    Col 2
  [1]      [2]
  [3]      [4]
  [5]      [6]
```

This is actually fine for masonry (each column is independent). However, with 3 columns on desktop:

```
  Col 1    Col 2    Col 3
  [1]      [2]      [3]
  [4]      [5]      [6]
```

The order is correct here because CSS columns fills top-to-bottom then moves to the next column. For 2 columns with odd items, the first column gets the extra item — this is acceptable behavior.

**The real concern:** If portfolio items have varying heights, shorter items will leave gaps. CSS columns handles this well (unlike CSS grid), so this is actually the right choice. No fix needed for the masonry approach itself.

**One missing detail:** The plan should specify `break-inside-avoid` on portfolio cards to prevent a card from being split across columns:

```css
.portfolio-card {
	break-inside: avoid;
	margin-bottom: 1rem;
}
```

---

#### UX-SUGGESTION-06: Two Columns May Be Tight on Very Small Screens

**Severity:** 🟢 Suggestion
**Location:** Task 3.7, Breakpoint table line 646
**Detail:** `columns-2` on a 320px viewport gives ~150px per column. Portfolio images at this size will be very small. Consider `columns-1 sm:columns-2 lg:columns-3` for a better mobile experience, or at minimum ensure images have `aspect-ratio: 16/9` or similar so they're recognizable at small sizes.

---

### 5. Review Cards

#### UX-SUGGESTION-07: Date Format Not Specified — Relative vs Absolute

**Severity:** 🟢 Suggestion
**Location:** Task 3.5 (ProfileReviewsSection), mockup line 129
**Detail:** The mockup shows "Mar 2024" (absolute date). Modern review patterns use relative dates ("2 months ago") for recent reviews and absolute dates for older ones. The plan should specify the format.

**Recommendation:** Use relative dates for reviews < 1 year old ("3 months ago"), absolute for older ("Mar 2024"). Use a date formatting utility consistent with the rest of the app.

---

#### UX-SUGGESTION-08: Verified Badge Context Needs Clarification

**Severity:** 🟢 Suggestion
**Location:** Task 3.5, mockup line 131
**Detail:** The review card shows "Verified task" or "Verified service" badges. The hero section also shows a verified checkmark next to the user's name. These are different verification concepts (Nostr event attestation vs identity verification). The plan should ensure the visual treatment distinguishes them — e.g., the user verification is a checkmark icon, while review verification is a text badge.

---

### 6. Hero Section

#### UX-IMPORTANT-03: Redundant Rating Display in Mobile Hero

**Severity:** 🟡 Important
**Location:** Mobile mockup lines 183-195, Task 3.1
**Detail:** The mobile hero shows the rating TWICE:

1. In the hero text: "star 4.8/5 (127)" (line 184)
2. In the 2x2 stats grid: "star4.8 Rating" (line 189)

This redundancy wastes vertical space and creates a confusing double-mention of the same data. On mobile where every pixel counts, this is particularly costly.

**Fix:** Remove the rating from the hero text line on mobile. Keep it only in the stats grid. The hero text should be: Name, checkmark, professional title, location. The stats grid handles the numerical summary.

---

#### UX-IMPORTANT-07: Mobile Hero Stats Show Different Data Than Desktop Sidebar

**Severity:** 🟡 Important
**Location:** Mobile mockup lines 188-195 vs Task 3.8 (ProfileSidebar)
**Detail:** The mobile hero 2x2 stats grid shows:

- Reviews count (127)
- Rating (4.8)
- Services count (15)
- Tasks count (23)

The desktop sidebar shows:

- Tasks completed count
- Rating
- Skills count
- Portfolio count
- Member since

These are **different metrics**. "Tasks count" in the hero likely means tasks posted by the user. "Tasks completed" in the sidebar likely means tasks the user has done as a tasker. Also, Services and Skills are different concepts (services listed vs skills tagged).

This inconsistency means mobile and desktop users see fundamentally different portraits of the same person.

**Fix:** Align the stats. Either:

- **Option A:** Hero shows the same stats as sidebar (tasks completed, rating, skills, portfolio, member since) — most consistent
- **Option B:** Hero shows engagement stats (reviews, rating, services, tasks posted) while sidebar shows performance stats — but this needs clear labeling

---

### 7. About Section

#### UX-CRITICAL-03: Mobile Users Cannot Access Availability, Report, or Quick Actions

**Severity:** 🔴 Critical
**Location:** Task 3.8 (ProfileSidebar), Component Hierarchy line 633
**Detail:** The plan specifies `ProfileSidebar (desktop only)`. The sidebar contains:

- Performance stats (also shown in hero on mobile — partially covered)
- **Availability widget** — mobile users CANNOT see when the provider is available
- **Report button** — mobile users CANNOT report inappropriate profiles

The availability widget is critical for a gig economy app — it's a trust signal and a scheduling aid. Hiding it on mobile means ~70% of users (mobile traffic) can't check availability before hiring.

The Report button is a safety feature. Hiding it on mobile means users encountering inappropriate content have no recourse without switching to desktop.

**Fix:**

- Availability: Move to the About section or show as a collapsible section on mobile
- Report: Move to the ActionsMenu (⋯ overflow menu) which already exists on the profile (line 421: "ActionsMenu (for moderation only)"). Ensure the Report action is always accessible via the ⋯ menu on mobile.

---

### 8. Languages Display

#### UX-IMPORTANT-08: Proficiency Badges Need Specified Visual Distinction

**Severity:** 🟡 Important
**Location:** Task 3.6 (ProfileAboutSection), line 396, Task 5.1
**Detail:** The plan defines four proficiency levels (Native/Fluent/Conversational/Basic) and adds i18n keys for each, but doesn't specify how they're visually differentiated. If all four use the same badge style (`badge badge-primary`), users can't quickly distinguish proficiency levels at a glance.

**Fix:** Define distinct badge variants:

```
Native:        badge badge-primary          (filled, prominent)
Fluent:        badge badge-secondary        (filled, secondary color)
Conversational: badge badge-info badge-outline (outline, less prominent)
Basic:         badge badge-ghost            (minimal, subdued)
```

Also specify language order: recommend proficiency-ranked (Native first, Basic last) rather than alphabetical, since proficiency is the most useful sorting for someone evaluating a tasker's communication abilities.

---

### 9. General Location

#### UX-SUGGESTION-09: Location Display Should Not Use Map Pin Icon

**Severity:** 🟢 Suggestion
**Location:** Task 3.1, mockup line 84
**Detail:** The plan says "City, Country" but doesn't specify the icon. If implemented with a map pin icon (📍), it implies precise GPS location — contradicting the "general location only" requirement. Use a globe icon (🌐) or location-dot icon without precision styling, or text-only.

Also: The plan doesn't specify what happens when location is NOT set. Should the field be hidden entirely? Show "Remote"? Show nothing? Recommendation: hide the line entirely if no location is set (consistent with the languages graceful fallback pattern).

---

### 10. Visual Consistency

#### UX-SUGGESTION-10: Sticky CTA Bar Background Not Specified

**Severity:** 🟢 Suggestion
**Location:** Mobile mockup lines 225-229
**Detail:** The nav is specified as `sticky top-16 z-10 shadow-md` but the sticky CTA bar has no background or shadow specified. On a `bg-base-200` page, the CTA bar should be `bg-base-100` with a top shadow to visually separate it from scrolling content. Without this, the bar will blend into the page background.

---

### 11. Accessibility

#### UX-IMPORTANT-05: Star Rating Display Missing ARIA Pattern

**Severity:** 🟡 Important
**Location:** Task 3.1 (ProfileHero), line 412
**Detail:** The plan specifies `role="meter"` for rating distribution bars (line 669) ✅, but the star rating display in the hero ("star 4.8/5 (127)") has no ARIA specification. Screen readers will read this as "star four point eight slash five one hundred twenty-seven" — meaningless.

**Fix:** Add `aria-label="4.8 out of 5 stars, 127 reviews"` to the rating display element. If using star icons, each filled/empty star should have `aria-hidden="true"` with the aggregate rating in an accessible label.

---

#### UX-SUGGESTION-11: Lightbox Keyboard and Focus Patterns Not Specified

**Severity:** 🟢 Suggestion
**Location:** Task 3.7 (ProfilePortfolioSection)
**Detail:** The plan mentions PhotoSwipe lightbox but doesn't specify keyboard interaction. PhotoSwipe handles most of this natively (Escape to close, arrow keys to navigate), but the plan should confirm:

- Focus trap inside lightbox when open
- Focus returns to triggering image when closed
- `aria-label` on images for screen readers

---

## Summary Table

| ID               | Severity      | Issue                                                                   | Location      |
| ---------------- | ------------- | ----------------------------------------------------------------------- | ------------- |
| UX-CRITICAL-01   | 🔴 Critical   | Missing `safe-area-inset-bottom` — iPhone home bar occludes Hire Me CTA | Task 3.1, 4.1 |
| UX-CRITICAL-02   | 🔴 Critical   | `grid-cols-2` applies to mobile — contradicts "stacked cards" spec      | Task 3.3      |
| UX-CRITICAL-03   | 🔴 Critical   | Sidebar (availability + report) hidden on mobile — safety & trust gap   | Task 3.8      |
| UX-IMPORTANT-01  | 🟡 Important  | Sticky CTA bar z-index not specified — may sit below nav                | Task 3.1      |
| UX-IMPORTANT-02  | 🟡 Important  | CSS columns masonry needs `break-inside-avoid` on cards                 | Task 3.7      |
| UX-IMPORTANT-03  | 🟡 Important  | Rating shown twice in mobile hero (text + stats grid)                   | Task 3.1      |
| UX-IMPORTANT-04  | 🟡 Important  | No focus management after nav click — keyboard users stranded           | Task 3.2      |
| UX-IMPORTANT-05  | 🟡 Important  | Star rating display missing ARIA label for screen readers               | Task 3.1      |
| UX-IMPORTANT-06  | 🟡 Important  | No bottom padding for sticky CTA occlusion of last section              | Task 4.1      |
| UX-IMPORTANT-07  | 🟡 Important  | Mobile hero stats differ from desktop sidebar — inconsistent portrait   | Task 3.1, 3.8 |
| UX-IMPORTANT-08  | 🟡 Important  | Language proficiency badges have no visual distinction spec             | Task 3.6      |
| UX-SUGGESTION-05 | 🟢 Suggestion | `scrollend` event not supported on Safari (minor leak per click)        | Task 3.2      |
| UX-SUGGESTION-06 | 🟢 Suggestion | `columns-2` tight on very small screens (<360px)                        | Task 3.7      |
| UX-SUGGESTION-07 | 🟢 Suggestion | Review date format not specified (relative vs absolute)                 | Task 3.5      |
| UX-SUGGESTION-08 | 🟢 Suggestion | Verified badge context differs between hero and reviews                 | Task 3.1, 3.5 |
| UX-SUGGESTION-09 | 🟢 Suggestion | Location icon should not imply exact position; missing empty state      | Task 3.1      |
| UX-SUGGESTION-10 | 🟢 Suggestion | Sticky CTA bar background/shadow not specified                          | Task 3.1      |
| UX-SUGGESTION-11 | 🟢 Suggestion | Lightbox keyboard/focus patterns not specified                          | Task 3.7      |

---

## Recommended Fixes for Implementation

### Must-Fix Before Implementation (Critical)

1. **Add safe-area-inset-bottom** to sticky CTA bar + `viewport-fit=cover` meta tag
2. **Change services grid** to `grid-cols-1 sm:grid-cols-2 xl:grid-cols-3`
3. **Surface availability + report on mobile** — availability in About section, Report in ActionsMenu

### Should-Fix (Important)

4. Specify `z-20` for sticky CTA bar
5. Add `break-inside-avoid` to portfolio masonry cards
6. Remove redundant rating from mobile hero text (keep in stats grid only)
7. Add focus management to nav scroll-spy (focus target section heading)
8. Add `aria-label` to star rating display
9. Add `pb-20` to page content container
10. Align mobile hero stats with desktop sidebar stats
11. Define proficiency badge color variants and sort order

### Nice-to-Have (Suggestions)

12. Add `scrollend` feature detection for Safari
13. Consider `columns-1` on very small screens
14. Specify review date format
15. Clarify verified badge visual distinction
16. Use non-precision location icon; hide if empty
17. Specify CTA bar background/shadow
18. Document lightbox keyboard patterns

---

## Verdict

**3 Critical, 7 Important, 8 Suggestions** — the plan is architecturally sound after round 1 fixes, but the mobile experience has real gaps that would affect conversion (CTA occlusion), trust (no availability on mobile), and safety (no report on mobile). These must be resolved before implementation.

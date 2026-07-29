---
name: tailwind-css-4
description: 'Tailwind CSS 4 + daisyUI patterns for BitTasker. Covers v4 CSS-first config, @theme, utility classes, dark mode, arbitrary values, container queries, state variants, responsive breakpoints, anti-patterns, and quick reference. Use when writing or reviewing Svelte component markup.'
---

# Tailwind CSS 4 + daisyUI — BitTasker

## v4 vs v3

Tailwind CSS 4 drops `tailwind.config.js` entirely. Configuration is done in CSS:

```css
@import 'tailwindcss';

/* Custom theme values */
@theme {
	--color-brand: #f7931a;
	--spacing-gutter: 1.5rem;
}
```

**BitTasker's setup:** `src/app.css` imports Tailwind and configures daisyUI with two themes (light/dark). daisyUI theme colors are set as CSS custom properties there — **do not redefine theme colors** in `@theme` blocks. Use `@theme` only for project-specific tokens not covered by daisyUI.

## daisyUI First

This project uses **daisyUI on top of Tailwind**. The rule:

1. **Use daisyUI components first** for structural UI — `btn`, `card`, `modal`, `badge`, `input`, `select`, `navbar`, `alert`, `table`, `tabs`, `collapse`, `drawer`, `dropdown`, `menu`, `tooltip`, `loading`, `toggle`, `checkbox`, `radio`, `textarea`, `range`, `rating`, `file-input`, `label`, `steps`, `swap`, `timeline`, `carousel`, `stat`, `divider`, `status`, `kbd`, `fieldset`, `avatar`, `countdown`
2. **Use Tailwind utilities** for layout, spacing, one-off adjustments
3. **Never use `style=""`** — it breaks daisyUI theme consistency and can't be themed
4. **Never create custom CSS files** — use Tailwind utilities or daisyUI theme variables instead

Use `daisyui_get_component` from the MCP tool to look up daisyUI component documentation before building.

## Utility Classes Quick Reference

### Layout

| Category | Classes |
|----------|---------|
| Display | `block`, `inline`, `inline-block`, `flex`, `inline-flex`, `grid`, `inline-grid`, `hidden` |
| Flex | `flex-row`, `flex-col`, `flex-wrap`, `flex-nowrap`, `flex-1`, `flex-auto`, `flex-none`, `grow`, `shrink` |
| Flex align | `items-start`, `items-center`, `items-end`, `items-stretch`, `justify-start`, `justify-center`, `justify-end`, `justify-between`, `justify-around`, `justify-evenly` |
| Grid | `grid-cols-{1..12}`, `grid-rows-{1..6}`, `col-span-{1..12}`, `row-span-{1..6}`, `gap-{0..16}`, `gap-x-{0..16}`, `gap-y-{0..16}` |
| Position | `relative`, `absolute`, `fixed`, `sticky`, `inset-0`, `top-0`, `right-0`, `bottom-0`, `left-0`, `z-{0..50}` |

### Spacing

| Category | Classes |
|----------|---------|
| Padding | `p-{0..96}`, `px-{0..96}`, `py-{0..96}`, `pt-{}`, `pr-{}`, `pb-{}`, `pl-{}` |
| Margin | `m-{0..96}`, `mx-{0..96}`, `my-{0..96}`, `mt-{}`, `mr-{}`, `mb-{}`, `ml-{}`, `mx-auto`, `my-auto` |
| Gap | `gap-{0..16}`, `gap-x-{0..16}`, `gap-y-{0..16}` |

### Sizing

| Category | Classes |
|----------|---------|
| Width | `w-full`, `w-screen`, `w-min`, `w-max`, `w-fit`, `w-{0..96}`, `w-1/2`, `w-1/3`, `w-2/3`, `w-1/4`, `w-3/4` |
| Height | `h-full`, `h-screen`, `h-dvh`, `h-min`, `h-max`, `h-fit`, `h-{0..96}` |
| Max/Min | `max-w-{none,xs,sm,md,lg,xl,2xl..7xl,full,min,max,fit,prose}`, `min-h-screen`, `min-h-dvh`, `max-h-screen`, `max-h-dvh` |

### Typography

| Category | Classes |
|----------|---------|
| Size | `text-xs`, `text-sm`, `text-base`, `text-lg`, `text-xl`, `text-2xl`, `text-3xl`, `text-4xl`, `text-5xl` |
| Weight | `font-thin`, `font-light`, `font-normal`, `font-medium`, `font-semibold`, `font-bold`, `font-black` |
| Line height | `leading-none`, `leading-tight`, `leading-snug`, `leading-normal`, `leading-relaxed`, `leading-loose` |
| Align | `text-left`, `text-center`, `text-right`, `text-justify` |
| Decor | `underline`, `line-through`, `no-underline`, `uppercase`, `lowercase`, `capitalize` |
| Tracking | `tracking-tighter`, `tracking-tight`, `tracking-normal`, `tracking-wide`, `tracking-wider` |
| Truncate | `truncate`, `text-ellipsis`, `text-clip`, `whitespace-nowrap`, `line-clamp-{1..6}` |

### Colors (daisyUI Theme)

Use **semantic daisyUI names**, never hardcoded hex values:

| Token | Usage |
|-------|-------|
| `bg-base-100` | Primary background |
| `bg-base-200` | Secondary background (cards, sections) |
| `bg-base-300` | Tertiary background (hover states) |
| `text-base-content` | Primary text (contrasts with base background) |
| `bg-primary` | Primary action color (Bitcoin orange `#f7931a`) |
| `text-primary-content` | Text on primary backgrounds |
| `bg-secondary` | Secondary surfaces |
| `text-secondary-content` | Text on secondary backgrounds |
| `bg-accent` | Accent color |
| `text-accent-content` | Text on accent backgrounds |
| `bg-neutral` | Neutral surfaces |
| `text-neutral-content` | Text on neutral backgrounds |
| `text-info`, `text-success`, `text-warning`, `text-error` | Semantic text colors |
| `bg-info`, `bg-success`, `bg-warning`, `bg-error` | Semantic background colors |
| `border-base-300`, `border-primary` | Border colors |

### Borders

| Category | Classes |
|----------|---------|
| Width | `border`, `border-0`, `border-2`, `border-4`, `border-8`, `border-t`, `border-b`, `border-l`, `border-r` |
| Color | `border-base-200`, `border-base-300`, `border-primary`, `border-transparent` |
| Radius | `rounded-none`, `rounded-sm`, `rounded`, `rounded-md`, `rounded-lg`, `rounded-xl`, `rounded-2xl`, `rounded-full` |
| Radius side | `rounded-t-lg`, `rounded-b-lg`, `rounded-l-md`, `rounded-r-md`, `rounded-tl-xl`, etc. |

### Effects

| Category | Classes |
|----------|---------|
| Shadow | `shadow-none`, `shadow-sm`, `shadow`, `shadow-md`, `shadow-lg`, `shadow-xl`, `shadow-2xl` |
| Opacity | `opacity-{0..100}` (increments of 5), `opacity-0`, `opacity-25`, `opacity-50`, `opacity-75`, `opacity-100` |

## Responsive Breakpoints (Mobile-First)

BitTasker is a **Capacitor mobile app**. Design for phone screens first, add breakpoints for larger screens.

| Breakpoint | Width | When to use |
|------------|-------|-------------|
| (default) | all | Mobile phone layout (base styles, no prefix) |
| `sm:` | 640px+ | Large phones / very small tablets |
| `md:` | 768px+ | Tablets |
| `lg:` | 1024px+ | Small desktop / landscape tablet |
| `xl:` | 1280px+ | Desktop |

```html
<!-- Mobile: full width, stacked. Tablet+: max-width constrained, side by side -->
<div class="w-full lg:w-1/2">
	<div class="flex flex-col md:flex-row md:gap-4">
		...
	</div>
</div>
```

## Dark Mode

daisyUI handles dark mode automatically via `prefers-color-scheme`. Use the `dark:` prefix for overrides when needed:

```html
<div class="bg-base-100 text-base-content dark:bg-base-200 dark:text-base-content">
	Content adapts to light/dark theme
</div>
```

**Note:** with daisyUI themes, most elements auto-adapt. Only use `dark:` overrides when daisyUI's theme variables don't cover a specific need.

## Arbitrary Values

For one-off values not in the scale:

```html
<div class="w-[320px] h-[48px] bg-[#ff0000] rounded-[11px] text-[14px] font-[700] grid-cols-[minmax(200px,1fr)_2fr]">
	Custom values
</div>
```

**Use sparingly** — prefer theme tokens. Arbitrary values can't be themed.

## Container Queries

Container queries let components respond to their parent's size, not the viewport:

```html
<div class="@container">
	<div class="grid grid-cols-1 @md:grid-cols-2 @lg:grid-cols-3">
		Card grid that adapts to container width
	</div>
</div>
```

Useful for reusable card components that render in different-width containers.

## State Variants

| Variant | Usage |
|---------|-------|
| `hover:` | Mouse hover |
| `focus:` | Keyboard/click focus |
| `focus-visible:` | Keyboard-only focus (not mouse click) |
| `focus-within:` | Parent when any child is focused |
| `active:` | Active press state |
| `disabled:` | Disabled form elements |
| `group-hover:` | Style child when parent is hovered (parent needs `group` class) |
| `peer-checked:` | Style element when peer checkbox/radio is checked (peer needs `peer` class) |

```html
<button class="btn btn-primary hover:opacity-90 focus-visible:ring-2 focus-visible:ring-primary active:scale-95 disabled:opacity-50 transition-all">
	Submit
</button>
```

## Common Patterns

### Card Layout

```html
<div class="card bg-base-200 shadow-sm">
	<div class="card-body p-4">
		<h3 class="card-title text-lg font-semibold">Title</h3>
		<p class="text-base-content/70 text-sm">Description</p>
		<div class="card-actions mt-3">
			<button class="btn btn-primary btn-sm">Action</button>
		</div>
	</div>
</div>
```

### Form Layout

```html
<form class="flex flex-col gap-4 p-4">
	<label class="form-control">
		<div class="label">
			<span class="label-text">Email</span>
		</div>
		<input type="email" class="input input-bordered w-full" placeholder="user@example.com" />
	</label>
	<label class="form-control">
		<div class="label">
			<span class="label-text">Message</span>
		</div>
		<textarea class="textarea textarea-bordered w-full" rows="3"></textarea>
	</label>
	<button type="submit" class="btn btn-primary">Submit</button>
</form>
```

### Modal Content

```html
<div class="modal modal-open">
	<div class="modal-box max-w-md">
		<h3 class="text-lg font-bold">Confirm Action</h3>
		<p class="py-4 text-base-content/70">Are you sure you want to proceed?</p>
		<div class="modal-action">
			<button class="btn btn-ghost">Cancel</button>
			<button class="btn btn-primary">Confirm</button>
		</div>
	</div>
</div>
```

### List View (Mobile-First)

```html
<div class="flex flex-col divide-y divide-base-300">
	{#each items as item}
		<button class="flex items-center gap-3 px-4 py-3 w-full text-left hover:bg-base-200 active:bg-base-300 transition-colors">
			<span class="avatar placeholder shrink-0">
				<div class="bg-neutral text-neutral-content rounded-full w-10">
					<span class="text-sm">{item.initials}</span>
				</div>
			</span>
			<div class="flex flex-col min-w-0 flex-1">
				<span class="text-sm font-medium truncate">{item.title}</span>
				<span class="text-xs text-base-content/50 truncate">{item.subtitle}</span>
			</div>
			<span class="text-xs text-base-content/30 shrink-0">{item.meta}</span>
		</button>
	{/each}
</div>
```

### Navigation Bar

```html
<nav class="flex items-center justify-between px-4 py-3 bg-base-100 border-b border-base-300">
	<div class="flex items-center gap-2">
		<!-- hamburger or back button -->
		<button class="btn btn-ghost btn-sm btn-square">
			<iconify-icon icon="mdi:menu" class="text-xl" />
		</button>
		<h1 class="text-lg font-semibold truncate">Page Title</h1>
	</div>
	<div class="flex items-center gap-1">
		<button class="btn btn-ghost btn-sm btn-square">
			<iconify-icon icon="mdi:magnify" class="text-xl" />
		</button>
		<button class="btn btn-ghost btn-sm btn-square">
			<iconify-icon icon="mdi:dots-vertical" class="text-xl" />
		</button>
	</div>
</nav>
```

## Anti-Patterns

| Don't | Do Instead |
|-------|------------|
| `style="color: red"` | `class="text-error"` |
| Create a `.custom.css` file | Use `@theme` in `app.css` or Tailwind utilities |
| `!important` anywhere | Increase specificity with parent classes or use daisyUI variant |
| Chain 6+ utilities on one element | Extract to a reusable Svelte component or use `@apply` in `<style>` |
| Hardcoded hex colors `#ff0000` | Use daisyUI semantic tokens (`text-error`, `bg-primary`) |
| `w-[327px]` everywhere | Use responsive widths (`w-full lg:w-1/2`) and container classes |
| `text-sm` on everything | Use semantic sizes: headings `text-lg+`, body `text-sm/text-base`, meta `text-xs` |

## Quick Reference Card

```
┌──────────────────────────────────────────────────────────┐
│ LAYOUT          │ SPACING         │ SIZING              │
│ flex flex-col   │ p-4 px-6 py-2   │ w-full h-full      │
│ grid grid-cols-2│ m-0 mx-auto     │ max-w-md min-h-dvh  │
│ gap-4 gap-x-2   │ gap-2 gap-y-4   │ w-1/2 h-10          │
│ items-center    │ mt-2 mb-4       │ size-10 (square)    │
│ justify-between │                 │                     │
├─────────────────┼─────────────────┼─────────────────────┤
│ TYPOGRAPHY      │ COLORS          │ EFFECTS             │
│ text-sm text-lg │ bg-base-100     │ shadow-md shadow-sm │
│ font-semibold   │ text-base-content│ opacity-50          │
│ font-bold       │ bg-primary      │ rounded-lg          │
│ leading-tight   │ text-error      │ rounded-full        │
│ truncate        │ bg-base-200     │ border-2            │
│ text-center     │ text-primary    │ border-base-300     │
├─────────────────┼─────────────────┼─────────────────────┤
│ MOBILE-FIRST    │ STATE           │ DAISYUI            │
│ md:flex-row     │ hover:bg-base-200│ btn btn-primary    │
│ lg:w-1/2       │ focus:ring-2    │ card card-body      │
│ sm:block lg:hidden│ disabled:opacity-50│ input input-bordered│
│ @md:grid-cols-2 │ active:scale-95 │ modal modal-box     │
│                 │ dark:text-base-content│ label label-text    │
└──────────────────────────────────────────────────────────┘
```

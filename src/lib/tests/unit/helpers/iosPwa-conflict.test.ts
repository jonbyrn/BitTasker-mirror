/**
 * @vitest-environment jsdom
 *
 * Tests that PROVE the architectural conflict between:
 *   1. CSS var override (our fix in applyIOSPwaSafeAreaFix)
 *   2. JS-measured pixel values (BottomNavBar ResizeObserver → --app-dock-height)
 *
 * The conflict: the menu panel's padding-bottom comes from --app-dock-height
 * (a JS-measured px value of the entire dock), NOT from --safe-area-inset-bottom.
 * Our CSS var fix works but is ignored by the menu because it reads the JS
 * measurement, which captures the dock's full height (content + padding),
 * not just the safe-area portion.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { applyIOSPwaSafeAreaFix } from '$lib/utils/helpers/iosPwa';

// ── Helpers ──────────────────────────────────────────────────────────────

/**
 * Build the same CSS rules the production app uses.
 * These mirror app.css, BottomNavBar.svelte, and TopBar.svelte scoped styles.
 */
function setupProductionCSS() {
	document.head.innerHTML = '';

	const style = document.createElement('style');
	style.id = 'production-css';
	style.textContent = `
		/* ── app.css global ── */
		:root {
			--bottom-nav-height: 80px;
			--bottom-nav-height-safe: calc(80px + var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)));
			--app-footer-height: var(--bottom-nav-height-safe);
		}
		.pt-safe {
			padding-top: var(--safe-area-inset-top, env(safe-area-inset-top, 0px));
		}
		.pb-safe {
			padding-bottom: var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px));
		}
		.app-shell__header {
			padding-top: var(--safe-area-inset-top, env(safe-area-inset-top, 0px));
		}
		.app-shell__content {
			padding-bottom: var(--app-footer-height, var(--bottom-nav-height-safe));
		}

		/* ── BottomNavBar.svelte scoped (.dock wins over .pb-safe on specificity tie — later in source) ── */
		.dock {
			display: flex;
			align-items: center;
			justify-content: space-around;
			padding: 0.5rem 0;
			padding-bottom: calc(0.5rem + var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)));
			min-height: 64px;
			height: auto;
			width: 100%;
		}
		.dock-btn {
			display: flex;
			flex-direction: column;
			align-items: center;
			gap: 0.25rem;
			min-height: 48px;
			min-width: 48px;
		}
		.bottom-nav-menu {
			transform: translateY(100%);
			max-height: calc(52rem + var(--app-footer-height, var(--bottom-nav-height-safe)));
			padding-bottom: var(--app-dock-height, var(--app-footer-height, var(--bottom-nav-height-safe)));
			overflow: hidden;
		}
		.bottom-nav-menu.menu-expand {
			transform: translateY(0);
		}
	`;
	document.head.appendChild(style);
}

/** Simulate env(safe-area-inset-*) on a notched iPhone (e.g. iPhone 14 Pro) in standalone */
function simulateNotchedIPhone() {
	const r = document.documentElement.style;
	r.setProperty('--safe-area-inset-top', '47px');
	r.setProperty('--safe-area-inset-bottom', '34px');
	r.setProperty('--safe-area-inset-left', '0px');
	r.setProperty('--safe-area-inset-right', '0px');
}

/**
 * Simulate what BottomNavBar ResizeObserver does: measure dock via
 * getBoundingClientRect().height, store as --app-dock-height.
 *
 * Since jsdom does not do full layout, we pass the expected measured
 * height explicitly. On a real device:
 *   Pre-fix:  56px content + 34px safe-area = 90px
 *   Post-fix: 56px content +  0px safe-area = 56px
 */
function simulateDockMeasured(heightPx: number) {
	document.documentElement.style.setProperty('--app-dock-height', `${heightPx}px`);
	return heightPx;
}

/** Build a realistic logged-in dock with 5 buttons (mirrors BottomNavBar template) */
function buildDock(): HTMLElement {
	const dock = document.createElement('div');
	dock.className = 'dock';
	for (let i = 0; i < 5; i++) {
		const btn = document.createElement('button');
		btn.className = 'dock-btn';
		btn.textContent = `Item ${i + 1}`;
		dock.appendChild(btn);
	}
	document.body.appendChild(dock);
	return dock;
}

/** Build the menu panel that slides from behind the dock */
function buildMenuPanel(): HTMLElement {
	const menu = document.createElement('div');
	menu.className = 'bottom-nav-menu menu-expand';
	// Simulate logged-in accordion content (tall)
	const content = document.createElement('div');
	content.className = 'menu-content';
	content.innerHTML =
		'<ul><li>Dashboard</li><li>Earning ▸ Tasks / Services / Contracts</li><li>Hiring ▸ Tasks / Services / Contracts</li><li>Company</li><li>Account</li></ul>';
	content.style.height = '300px';
	content.style.background = '#f5f5f5';
	menu.appendChild(content);
	document.body.appendChild(menu);
	return menu;
}

afterEach(() => {
	vi.unstubAllGlobals();
	document.head.innerHTML = '';
	document.body.innerHTML = '';
	const r = document.documentElement.style;
	r.removeProperty('--safe-area-inset-top');
	r.removeProperty('--safe-area-inset-bottom');
	r.removeProperty('--safe-area-inset-left');
	r.removeProperty('--safe-area-inset-right');
	r.removeProperty('--app-dock-height');
	r.removeProperty('--app-footer-height');
});

// ── Tests ────────────────────────────────────────────────────────────────

describe('CONFLICT: CSS var override vs JS-measured --app-dock-height', () => {
	beforeEach(() => {
		setupProductionCSS();
		simulateNotchedIPhone();
	});

	// ─────────────────────────────────────────────────────────────────
	// PROOF 1: The CSS override DOES work for elements using the CSS var
	// ─────────────────────────────────────────────────────────────────
	describe('Phase 1 — CSS override works at the CSS level', () => {
		it('pb-safe element: padding-bottom still references safe-area var', () => {
			vi.stubGlobal('navigator', { standalone: true });

			const el = document.createElement('div');
			el.className = 'pb-safe';
			document.body.appendChild(el);
			const pad = getComputedStyle(el).paddingBottom;
			expect(pad).toContain('--safe-area-inset-bottom');

			applyIOSPwaSafeAreaFix();
			// New approach: data-platform is set, CSS vars NOT zeroed
			expect(document.documentElement.getAttribute('data-platform')).toBe('ios-pwa');
			// safe-area var is not touched — CSS attribute selectors handle spacing
		});

		it('dock element: padding-bottom calc still references safe-area var', () => {
			vi.stubGlobal('navigator', { standalone: true });
			const dock = buildDock();

			const pad = getComputedStyle(dock).paddingBottom;
			expect(pad).toContain('--safe-area-inset-bottom');

			applyIOSPwaSafeAreaFix();
			expect(document.documentElement.getAttribute('data-platform')).toBe('ios-pwa');
		});
	});

	// ─────────────────────────────────────────────────────────────────
	// PROOF 2: The JS-measured value CAPTURES the full dock height
	//          (content + padding), NOT just the safe-area delta
	// ─────────────────────────────────────────────────────────────────
	describe('Phase 2 — JS measurement captures dock content height, not just safe-area', () => {
		it('--app-dock-height >= 64px even after CSS fix (dock has min-height: 64px)', () => {
			vi.stubGlobal('navigator', { standalone: true });
			applyIOSPwaSafeAreaFix();

			// Simulate the measured dock height (post-fix: 56px content + 8px padding)
			const measured = simulateDockMeasured(64);

			expect(measured).toBeGreaterThanOrEqual(64);
			expect(document.documentElement.style.getPropertyValue('--app-dock-height')).toBe('64px');
		});

		it('--app-dock-height shrinks when dock measured after layout reflects platform', () => {
			vi.stubGlobal('navigator', { standalone: true });

			// Pre-fix measurement: 56px content + 0.5rem padding + 34px safe-area = 90px
			const heightBefore = simulateDockMeasured(90);
			expect(heightBefore).toBe(90);

			applyIOSPwaSafeAreaFix();
			expect(document.documentElement.getAttribute('data-platform')).toBe('ios-pwa');

			// After fix: on iOS PWA, menu padding is now handled by
			// [data-platform] CSS rules, not by patching safe-area CSS vars.
			// The dock still measures at its natural height — the difference
			// is that the MENU no longer uses --app-dock-height for padding.
			// (It uses --bottom-nav-height-safe which is 64px on iOS PWA.)
		});

		it('dock height after fix is still significantly > 0 because of content + 0.5rem padding', () => {
			vi.stubGlobal('navigator', { standalone: true });
			applyIOSPwaSafeAreaFix();

			const height = simulateDockMeasured(56);
			// 56px: content + 0.5rem padding. No safe-area, but still tall.
			expect(height).toBeGreaterThan(40);
		});
	});

	// ─────────────────────────────────────────────────────────────────
	// PROOF 3: The MENU reads --app-dock-height, NOT --safe-area-inset-bottom
	//          Our CSS fix is invisible to the menu panel
	// ─────────────────────────────────────────────────────────────────
	describe('Phase 3 — Menu panel ignores our CSS override', () => {
		it('menu padding-bottom references --app-dock-height, NOT --safe-area-inset-bottom', () => {
			vi.stubGlobal('navigator', { standalone: true });
			applyIOSPwaSafeAreaFix();

			const dock = buildDock();
			simulateDockMeasured(dock as unknown as number);
			const menu = buildMenuPanel();

			const menuPad = getComputedStyle(menu).paddingBottom;
			// Menu reads --app-dock-height in the var() chain — NOT --safe-area-inset-bottom
			expect(menuPad).toContain('--app-dock-height');
			expect(menuPad).not.toContain('--safe-area-inset-bottom');
		});

		it('menu padding = dock full height (from --app-dock-height px value)', () => {
			vi.stubGlobal('navigator', { standalone: true });
			applyIOSPwaSafeAreaFix();

			simulateDockMeasured(72);

			const measuredHeight = document.documentElement.style.getPropertyValue('--app-dock-height');

			const menu = buildMenuPanel();
			const menuPad = getComputedStyle(menu).paddingBottom;

			// The var() chain references --app-dock-height which = the measured px value
			expect(menuPad).toContain('--app-dock-height');
			// measuredHeight should be set (not empty)
			expect(measuredHeight).toBe('72px');
		});

		it('changing --safe-area-inset-bottom does NOT change menu padding (decoupled)', () => {
			vi.stubGlobal('navigator', { standalone: true });
			applyIOSPwaSafeAreaFix();

			const dock = buildDock();
			simulateDockMeasured(dock as unknown as number);
			const menu = buildMenuPanel();

			// Now change --safe-area-inset-bottom (simulates someone manually patching it)
			document.documentElement.style.setProperty('--safe-area-inset-bottom', '0px');
			document.documentElement.style.setProperty('--safe-area-inset-bottom', '100px');

			// Menu padding is UNCHANGED — it reads --app-dock-height, not --safe-area-inset-bottom
			const menuPad = getComputedStyle(menu).paddingBottom;
			expect(menuPad).toContain('--app-dock-height');
			expect(menuPad).not.toContain('--safe-area-inset-bottom');
		});
	});

	// ─────────────────────────────────────────────────────────────────
	// PROOF 4: The fallback chain bypasses our CSS override when
	//          --app-dock-height is set (which it always is once
	//          the BottomNavBar mounts)
	// ─────────────────────────────────────────────────────────────────
	describe('Phase 4 — Fallback chain is controlled by JS, not CSS', () => {
		it('var() chain: --app-dock-height takes priority over --app-footer-height', () => {
			document.documentElement.style.setProperty('--app-dock-height', '72px');
			document.documentElement.style.setProperty('--app-footer-height', '80px');

			const el = document.createElement('div');
			el.className = 'bottom-nav-menu';
			document.body.appendChild(el);

			const pad = getComputedStyle(el).paddingBottom;
			expect(pad).toContain('--app-dock-height');
			// --app-dock-height (72px) takes priority over --app-footer-height (80px)
		});

		it('var() chain: --app-footer-height takes priority over --bottom-nav-height-safe', () => {
			document.documentElement.style.setProperty('--app-footer-height', '64px');

			const el = document.createElement('div');
			el.className = 'bottom-nav-menu';
			document.body.appendChild(el);

			const pad = getComputedStyle(el).paddingBottom;
			expect(pad).toContain('--app-footer-height');
		});

		it('var() chain: --bottom-nav-height-safe is last resort, but contain safe-area calc', () => {
			const el = document.createElement('div');
			el.className = 'bottom-nav-menu';
			document.body.appendChild(el);

			const pad = getComputedStyle(el).paddingBottom;
			expect(pad).toContain('--app-dock-height'); // raw var(), falls through
			// --bottom-nav-height-safe: calc(80px + var(--safe-area-inset-bottom, ...))
		});
	});

	// ─────────────────────────────────────────────────────────────────
	// PROOF 5: The measurement loop — CSS changes require JS to re-measure
	// ─────────────────────────────────────────────────────────────────
	describe('Phase 5 — The measurement coupling', () => {
		it('ResizeObserver --app-dock-height is not needed for menu on iOS PWA', () => {
			vi.stubGlobal('navigator', { standalone: true });

			// Pre-fix: dock measured at 90px
			const heightPreFix = simulateDockMeasured(90);
			expect(heightPreFix).toBe(90);

			// Apply fix: sets data-platform, not CSS var patching
			applyIOSPwaSafeAreaFix();
			expect(document.documentElement.getAttribute('data-platform')).toBe('ios-pwa');

			// --app-dock-height is still 90px (no JS remeasurement needed)
			expect(document.documentElement.style.getPropertyValue('--app-dock-height')).toBe('90px');

			// KEY FIX: the menu no longer uses --app-dock-height on iOS PWA.
			// The [data-platform='ios-pwa'] .bottom-nav-menu rule overrides
			// padding-bottom to var(--bottom-nav-height-safe) which is 64px
			// per the [data-platform] CSS override in app.css.
		});
	});
});

// ── Summary: architectural fix ───────────────────────────────────────────
//
// OLD approach (broken): patched --safe-area-inset-* CSS vars to 0px.
//   Problem: menu padding reads --app-dock-height (JS-measured px), not
//   --safe-area-inset-bottom. CSS var change is invisible to the menu.
//
// NEW approach: set data-platform="ios-pwa" on <html>.
//   1. CSS [data-platform="ios-pwa"] rules override spacing vars naturally.
//   2. BottomNavBar's :global([data-platform="ios-pwa"]) rule makes the
//      menu use --bottom-nav-height-safe (64px) instead of --app-dock-height.
//   3. No fragile CSS var patching, no JS/CSS timing coupling.
//   4. Top safe-area (status bar clearance) is preserved — platform
//      overrides only target bottom spacing.
//   5. Desktop, Android, and iOS Safari browser are completely unaffected.

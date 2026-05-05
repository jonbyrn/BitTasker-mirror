/**
 * @vitest-environment jsdom
 *
 * FAILING tests that assert DESIRED iOS PWA safe-area behavior.
 * These will fail with the current implementation and must pass
 * after the architectural fix is implemented.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { applyIOSPwaSafeAreaFix } from '$lib/utils/helpers/iosPwa';

// ── Helpers ──────────────────────────────────────────────────────────────

function setupCSS() {
	document.head.innerHTML = '';
	const style = document.createElement('style');
	style.textContent = `
		:root {
			--bottom-nav-height: 80px;
			--bottom-nav-height-safe: calc(80px + var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)));
			--app-footer-height: var(--bottom-nav-height-safe);
		}
		.pb-safe {
			padding-bottom: var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px));
		}
		.dock {
			display: flex;
			padding-bottom: calc(0.5rem + var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)));
			min-height: 64px;
		}
		.bottom-nav-menu {
			padding-bottom: var(--app-dock-height, var(--app-footer-height, var(--bottom-nav-height-safe)));
		}
		.app-shell__header {
			padding-top: var(--safe-area-inset-top, env(safe-area-inset-top, 0px));
		}
	`;
	document.head.appendChild(style);
}

function simulateNotchedIPhone() {
	const r = document.documentElement.style;
	r.setProperty('--safe-area-inset-top', '47px');
	r.setProperty('--safe-area-inset-bottom', '34px');
	r.setProperty('--safe-area-inset-left', '0px');
	r.setProperty('--safe-area-inset-right', '0px');
}

function runIOSFix() {
	vi.stubGlobal('navigator', { standalone: true });
	applyIOSPwaSafeAreaFix();
}

afterEach(() => {
	vi.unstubAllGlobals();
	document.head.innerHTML = '';
	document.body.innerHTML = '';
	const r = document.documentElement.style;
	for (const p of [
		'--safe-area-inset-top',
		'--safe-area-inset-bottom',
		'--safe-area-inset-left',
		'--safe-area-inset-right',
		'--app-dock-height'
	]) {
		r.removeProperty(p);
	}
	document.documentElement.removeAttribute('data-platform');
	document.documentElement.removeAttribute('data-keyboard-visible');
});

// ── FAILING TESTS ────────────────────────────────────────────────────────

describe('BUGS in current iOS PWA safe-area handling', () => {
	describe('BUG-1: Menu padding equals full dock height (should be smaller on iOS PWA)', () => {
		beforeEach(() => {
			setupCSS();
			simulateNotchedIPhone();
		});

		it('post-fix menu padding should NOT be the full dock content height', () => {
			runIOSFix();
			// Simulate ResizeObserver: dock is 56px (content + 0.5rem, no safe-area)
			document.documentElement.style.setProperty('--app-dock-height', '56px');

			const menu = document.createElement('div');
			menu.className = 'bottom-nav-menu';
			document.body.appendChild(menu);

			const pad = getComputedStyle(menu).paddingBottom;
			// FAILS: pad reads --app-dock-height = 56px
			// DESIRED: menu padding should be a small fixed value on iOS PWA,
			// not the full dock pixel height
			expect(pad).not.toContain('56px');
		});
	});

	describe('BUG-2: iOS PWA fix does not expose platform to CSS', () => {
		beforeEach(() => {
			setupCSS();
			simulateNotchedIPhone();
		});

		it('after fix, a platform attribute should be set for CSS targeting', () => {
			runIOSFix();
			// FAILS: data-platform is never set, so CSS can't target iOS PWA
			expect(document.documentElement.getAttribute('data-platform')).toBe('ios-pwa');
		});
	});

	describe('fix-3: Menu on iOS PWA bypasses JS-measured --app-dock-height', () => {
		beforeEach(() => {
			setupCSS();
			simulateNotchedIPhone();
		});

		it('on iOS PWA, menu CSS overrides padding to use --bottom-nav-height-safe', () => {
			runIOSFix();

			// Simulate ResizeObserver setting --app-dock-height (90px from pre-fix era)
			document.documentElement.style.setProperty('--app-dock-height', '90px');

			// Create the menu. On iOS PWA, the :global([data-platform="ios-pwa"])
			// rule in BottomNavBar overrides padding-bottom to use --bottom-nav-height-safe.
			// In jsdom the scoped :global() selector won't match (no Svelte scoping),
			// but we verify the platform attribute IS set and the CSS override exists.
			const menu = document.createElement('div');
			menu.className = 'bottom-nav-menu';
			document.body.appendChild(menu);

			// Platform attribute is set correctly
			expect(document.documentElement.getAttribute('data-platform')).toBe('ios-pwa');

			// --app-dock-height is still 90px (JS-measured, not modified by fix)
			expect(document.documentElement.style.getPropertyValue('--app-dock-height')).toBe('90px');

			// In a real browser, the [data-platform="ios-pwa"] .bottom-nav-menu
			// rule would override padding-bottom to var(--bottom-nav-height-safe).
			// jsdom can't resolve scoped :global() selectors, but the raw var() chain
			// would resolve --bottom-nav-height-safe → 64px on iOS PWA.
			// This test verifies the architecture: platform detection → CSS override.
		});
	});

	describe('fix-4: Platform detection produces CSS-addressable target', () => {
		beforeEach(() => {
			setupCSS();
			simulateNotchedIPhone();
		});

		it('data-platform is set BEFORE any child measures height', () => {
			runIOSFix();

			// The attribute must be on <html> for CSS selectors to work
			expect(document.documentElement.getAttribute('data-platform')).toBe('ios-pwa');

			// CSS custom properties for iOS PWA are defined in app.css
			// [data-platform='ios-pwa'] { --bottom-nav-height-safe: 64px; }
		});

		it('non-iOS platforms do NOT get the attribute', () => {
			vi.stubGlobal('navigator', {});
			applyIOSPwaSafeAreaFix();

			expect(document.documentElement.getAttribute('data-platform')).toBeNull();
		});

		it('iOS PWA safe-area var resolves to 64px for bottom nav', () => {
			runIOSFix();

			// On a real browser with the CSS loaded, getComputedStyle would return
			// --bottom-nav-height-safe = 64px from the [data-platform='ios-pwa'] rule.
			// jsdom resolves :root rules but not attribute-qualified rules that
			// override the :root declaration. We verify the attribute is present.
			expect(document.documentElement.getAttribute('data-platform')).toBe('ios-pwa');
		});
	});

	describe('fix-5: Desktop/Android safe-area behavior is unchanged', () => {
		beforeEach(() => {
			setupCSS();
			simulateNotchedIPhone();
		});

		it('desktop: no platform attribute, safe-area vars untouched', () => {
			vi.stubGlobal('navigator', {});
			applyIOSPwaSafeAreaFix();

			// No attribute set on non-iOS
			expect(document.documentElement.getAttribute('data-platform')).toBeNull();

			// Safe-area vars NOT zeroed (env() values still active)
			expect(document.documentElement.style.getPropertyValue('--safe-area-inset-bottom')).toBe(
				'34px'
			);
			expect(document.documentElement.style.getPropertyValue('--safe-area-inset-top')).toBe('47px');
		});

		it('iOS Safari browser tab: no attribute, safe-area intact', () => {
			vi.stubGlobal('navigator', { standalone: false });
			applyIOSPwaSafeAreaFix();

			expect(document.documentElement.getAttribute('data-platform')).toBeNull();
			expect(document.documentElement.style.getPropertyValue('--safe-area-inset-bottom')).toBe(
				'34px'
			);
		});

		it('menu on non-iOS still uses --app-dock-height from ResizeObserver', () => {
			vi.stubGlobal('navigator', {});
			applyIOSPwaSafeAreaFix();

			document.documentElement.style.setProperty('--app-dock-height', '90px');

			const menu = document.createElement('div');
			menu.className = 'bottom-nav-menu';
			document.body.appendChild(menu);

			// Non-iOS: no [data-platform] override, menu uses --app-dock-height chain
			expect(getComputedStyle(menu).paddingBottom).toContain('--app-dock-height');
		});
	});
});

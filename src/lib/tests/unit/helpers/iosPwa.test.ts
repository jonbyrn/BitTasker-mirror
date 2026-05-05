/**
 * @vitest-environment jsdom
 *
 * Tests for the iOS PWA safe-area architectural fix.
 *
 * Architecture: isIOSStandalone() detects the platform, applyIOSPwaSafeAreaFix()
 * sets data-platform="ios-pwa" on <html>, and CSS [data-platform="ios-pwa"]
 * rules adjust spacing naturally without fragile CSS var patching.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { isIOSStandalone, applyIOSPwaSafeAreaFix } from '$lib/utils/helpers/iosPwa';

function setupCSS() {
	document.head.innerHTML = '';
	const style = document.createElement('style');
	style.textContent = `
		:root {
			--bottom-nav-height-safe: calc(80px + var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)));
		}
		[data-platform='ios-pwa'] {
			--bottom-nav-height-safe: 64px;
		}
		.pb-safe {
			padding-bottom: var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px));
		}
		.pt-safe {
			padding-top: var(--safe-area-inset-top, env(safe-area-inset-top, 0px));
		}
		.app-shell__header {
			padding-top: var(--safe-area-inset-top, env(safe-area-inset-top, 0px));
		}
		.bottom-nav-menu {
			padding-bottom: var(--app-dock-height, var(--bottom-nav-height-safe));
		}
	`;
	document.head.appendChild(style);
}

function simulateNotchedIPhone() {
	const r = document.documentElement.style;
	r.setProperty('--safe-area-inset-top', '47px');
	r.setProperty('--safe-area-inset-bottom', '34px');
}

function runFix() {
	vi.stubGlobal('navigator', { standalone: true });
	applyIOSPwaSafeAreaFix();
}

afterEach(() => {
	vi.unstubAllGlobals();
	document.head.innerHTML = '';
	document.body.innerHTML = '';
	const r = document.documentElement.style;
	for (const p of ['--safe-area-inset-top', '--safe-area-inset-bottom', '--app-dock-height']) {
		r.removeProperty(p);
	}
	document.documentElement.removeAttribute('data-platform');
});

// ── isIOSStandalone ──────────────────────────────────────────────────────

describe('isIOSStandalone', () => {
	it('returns true when navigator.standalone is true', () => {
		vi.stubGlobal('navigator', { standalone: true });
		expect(isIOSStandalone()).toBe(true);
	});

	it('returns false when navigator.standalone is false', () => {
		vi.stubGlobal('navigator', { standalone: false });
		expect(isIOSStandalone()).toBe(false);
	});

	it('returns false when standalone does not exist (Android / desktop)', () => {
		vi.stubGlobal('navigator', {});
		expect(isIOSStandalone()).toBe(false);
	});

	it('returns false when navigator is undefined (SSR safety)', () => {
		vi.stubGlobal('navigator', undefined);
		expect(isIOSStandalone()).toBe(false);
	});
});

// ── applyIOSPwaSafeAreaFix ──────────────────────────────────────────────

describe('applyIOSPwaSafeAreaFix sets platform attribute', () => {
	beforeEach(() => setupCSS());

	it('sets data-platform="ios-pwa" on <html> when standalone', () => {
		runFix();
		expect(document.documentElement.getAttribute('data-platform')).toBe('ios-pwa');
	});

	it('does NOT set data-platform when not standalone', () => {
		vi.stubGlobal('navigator', { standalone: false });
		applyIOSPwaSafeAreaFix();
		expect(document.documentElement.getAttribute('data-platform')).toBeNull();
	});

	it('does NOT set data-platform on desktop/Android (no standalone prop)', () => {
		vi.stubGlobal('navigator', {});
		applyIOSPwaSafeAreaFix();
		expect(document.documentElement.getAttribute('data-platform')).toBeNull();
	});

	it('is safe when document is undefined (SSR)', () => {
		vi.stubGlobal('document', undefined);
		vi.stubGlobal('navigator', { standalone: true });
		expect(() => applyIOSPwaSafeAreaFix()).not.toThrow();
	});

	it('does NOT modify --safe-area-inset-* CSS vars (new approach)', () => {
		simulateNotchedIPhone();
		runFix();

		expect(document.documentElement.getAttribute('data-platform')).toBe('ios-pwa');
		// Safe-area vars are NOT zeroed — CSS overrides handle spacing instead
		expect(document.documentElement.style.getPropertyValue('--safe-area-inset-top')).toBe('47px');
		expect(document.documentElement.style.getPropertyValue('--safe-area-inset-bottom')).toBe(
			'34px'
		);
	});
});

// ── CSS platform targeting ──────────────────────────────────────────────

describe('CSS override via [data-platform="ios-pwa"]', () => {
	beforeEach(() => {
		setupCSS();
		simulateNotchedIPhone();
	});

	it('[data-platform="ios-pwa"] CSS rules override spacing vars', () => {
		runFix();

		// With the attribute set, browser applies [data-platform] rules.
		// jsdom resolves :root but not attribute-qualified overrides in
		// getComputedStyle, so we verify the attribute itself.
		expect(document.documentElement.getAttribute('data-platform')).toBe('ios-pwa');
	});

	it('top safe-area is unchanged (status bar clearance preserved)', () => {
		runFix();

		expect(document.documentElement.getAttribute('data-platform')).toBe('ios-pwa');
		expect(document.documentElement.style.getPropertyValue('--safe-area-inset-top')).toBe('47px');
	});

	it('desktop/Android: no attribute, :root values apply normally', () => {
		vi.stubGlobal('navigator', {});
		applyIOSPwaSafeAreaFix();

		expect(document.documentElement.getAttribute('data-platform')).toBeNull();
		expect(document.documentElement.style.getPropertyValue('--safe-area-inset-bottom')).toBe(
			'34px'
		);
	});
});

/**
 * Detect iOS standalone PWA (added to home screen).
 * When launched from the iOS home screen, Safari sets navigator.standalone to true.
 * This is an Apple proprietary API present since iOS 2.1 — it does not exist on
 * Android or desktop browsers, so there is zero risk of false positives.
 */
export function isIOSStandalone(): boolean {
	if (typeof navigator === 'undefined') return false;
	return (
		'standalone' in navigator && !!(navigator as Navigator & { standalone?: boolean }).standalone
	);
}

/**
 * On iOS standalone PWA, iOS reports real env(safe-area-inset-*) values for the
 * status bar area and home indicator. However, the CSS safe-area pattern used
 * throughout the app was designed for Android (SystemBars plugin injects custom
 * --safe-area-inset-* vars), and on iOS PWA it produces excessive top and bottom
 * padding that is not needed — iOS already handles edge-to-edge display natively
 * in standalone mode.
 *
 * Overriding the CSS vars to 0px short-circuits the fallback chain site-wide:
 *   var(--safe-area-inset-top, env(safe-area-inset-top, 0px)) → 0px
 */
export function applyIOSPwaSafeAreaFix(): void {
	if (typeof document === 'undefined') return;
	if (!isIOSStandalone()) return;

	document.documentElement.style.setProperty('--safe-area-inset-top', '0px');
	document.documentElement.style.setProperty('--safe-area-inset-bottom', '0px');
	document.documentElement.style.setProperty('--safe-area-inset-left', '0px');
	document.documentElement.style.setProperty('--safe-area-inset-right', '0px');
}

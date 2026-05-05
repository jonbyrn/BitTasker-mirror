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
 * status bar area and home indicator.
 *
 * The --safe-area-inset-top value (~47-59px on notched iPhones) is intentionally
 * LEFT ALONE — it provides necessary status bar / Dynamic Island clearance for
 * the top navbar. Zeroing it causes content to render behind the notch.
 *
 * The --safe-area-inset-bottom value (~34px for the home indicator) is zeroed
 * because the BottomNavBar already has its own padding via the .dock class
 * (0.5rem base), and the extra 34px makes the nav bar look bloated and the
 * menu panel leaves an excessive gap at the bottom. The 0.5rem base padding
 * in .dock is enough to keep buttons clear of the home indicator.
 *
 * Left/right insets are zeroed as iOS PWA handles landscape safe areas
 * natively and they are not relevant in portrait.
 *
 * Short-circuits the fallback chain site-wide:
 *   var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)) → 0px
 */
export function applyIOSPwaSafeAreaFix(): void {
	if (typeof document === 'undefined') return;
	if (!isIOSStandalone()) return;

	document.documentElement.style.setProperty('--safe-area-inset-bottom', '0px');
	document.documentElement.style.setProperty('--safe-area-inset-left', '0px');
	document.documentElement.style.setProperty('--safe-area-inset-right', '0px');
}

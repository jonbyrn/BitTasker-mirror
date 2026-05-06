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
 * On iOS standalone PWA, set a data-platform attribute on <html> so CSS can
 * target iOS-specific overrides via [data-platform="ios-pwa"] selectors.
 *
 * This replaces the previous approach of patching individual CSS custom
 * properties (--safe-area-inset-*), which was fragile because the
 * BottomNavBar's ResizeObserver captures element heights as hard px values
 * (--app-dock-height, --app-footer-height) that bypass the CSS cascade.
 *
 * With a platform attribute, CSS rules can naturally adjust spacing:
 *   [data-platform="ios-pwa"] { --bottom-nav-height-safe: 64px; }
 *
 * Must run in $effect.pre to ensure the attribute is set before any child
 * component's $effect measures layout.
 */
export function applyIOSPwaSafeAreaFix(): void {
	if (typeof document === 'undefined') return;
	if (!isIOSStandalone()) return;

	document.documentElement.setAttribute('data-platform', 'ios-pwa');
}

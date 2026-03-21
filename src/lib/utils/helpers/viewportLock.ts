/**
 * Viewport Rubber-Band Lock
 *
 * iOS Safari triggers native viewport elasticity ("rubber-banding") when
 * touchmove events reach the window without being cancelled. CSS properties
 * like `overscroll-behavior` and `touch-action` only affect scroll containers —
 * they cannot stop the browser from shifting the Visual Viewport when a
 * touchmove fires on the document root.
 *
 * Fix: attach a non-passive `touchmove` listener that calls `preventDefault()`
 * while any modal/overlay is open. This cancels the touch event before the
 * browser interprets it as a viewport drag.
 *
 * Scrollable content inside overlays must be marked with a data attribute or
 * use one of the recognised overflow classes so touches inside them are allowed
 * to scroll normally.
 */

/** Selectors for elements that are allowed to scroll while the lock is active. */
const SCROLLABLE_SELECTOR =
	'.overflow-y-auto, .overflow-auto, [data-viewport-scroll], .modal-box';

/** Reference count — supports multiple overlays open simultaneously. */
let lockCount = 0;

function onTouchMove(e: TouchEvent) {
	const target = e.target as HTMLElement | null;
	// Allow pan inside explicitly scrollable containers.
	if (target && target.closest(SCROLLABLE_SELECTOR)) {
		return;
	}
	e.preventDefault();
}

/**
 * Increment the lock count. On the first call, registers a non-passive
 * `touchmove` listener that blocks iOS viewport rubber-banding.
 */
export function lockViewport(): void {
	if (typeof document === 'undefined') return;
	if (lockCount === 0) {
		document.addEventListener('touchmove', onTouchMove, { passive: false });
	}
	lockCount++;
}

/**
 * Decrement the lock count. When it reaches zero, removes the listener and
 * restores normal touch behaviour.
 */
export function unlockViewport(): void {
	if (typeof document === 'undefined') return;
	lockCount = Math.max(0, lockCount - 1);
	if (lockCount === 0) {
		document.removeEventListener('touchmove', onTouchMove);
	}
}

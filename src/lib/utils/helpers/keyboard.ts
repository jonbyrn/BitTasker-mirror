import { Capacitor } from '@capacitor/core';
import { writable, get } from 'svelte/store';

export const keyboardVisible = writable(false);
export const keyboardHeight = writable(0);

let initialized = false;
let keyboardWillShowListener: { remove: () => Promise<void> } | null = null;
let keyboardDidShowListener: { remove: () => Promise<void> } | null = null;
let keyboardWillHideListener: { remove: () => Promise<void> } | null = null;
let keyboardDidHideListener: { remove: () => Promise<void> } | null = null;
let appStateChangeListener: { remove: () => Promise<void> } | null = null;
let appResumeListener: { remove: () => Promise<void> } | null = null;
let phantomKeyboardCheckTimeout: ReturnType<typeof setTimeout> | null = null;
let vvResizeListener: (() => void) | null = null;

function getRoot(): HTMLElement | null {
	return typeof document !== 'undefined' ? document.documentElement : null;
}

function setKeyboardOpen(height: number): void {
	const root = getRoot();
	if (!root) return;

	root.setAttribute('data-keyboard-visible', '');
	keyboardVisible.set(true);
	keyboardHeight.set(height);
}

function setKeyboardClosed(): void {
	const root = getRoot();
	if (!root) return;

	root.removeAttribute('data-keyboard-visible');
	keyboardVisible.set(false);
	keyboardHeight.set(0);
}

/**
 * Check if an input element is currently focused.
 */
function isInputElementFocused(): boolean {
	if (typeof document === 'undefined') return false;
	const active = document.activeElement;
	return (
		active instanceof HTMLElement &&
		(active.tagName === 'INPUT' ||
			active.tagName === 'TEXTAREA' ||
			active.getAttribute('contenteditable') === 'true')
	);
}

/**
 * Detect "phantom keyboard" state - when our app thinks keyboard is visible
 * but the viewport suggests otherwise. This happens on Android when:
 * - Switching apps via PiP/split-screen while keyboard was open in another app
 * - Deep links opened while keyboard was visible
 * - Share intents from apps with keyboards open
 *
 * Heuristics:
 * - If viewport height is >= 75% of screen height, keyboard is likely NOT visible
 * - If VisualViewport is available and matches window.innerHeight, keyboard is likely NOT visible
 * - If no input is focused and our state says keyboard is visible, it's likely phantom
 */
function detectPhantomKeyboard(): boolean {
	if (typeof window === 'undefined') return false;

	const currentlyTrackedAsVisible = get(keyboardVisible);
	if (!currentlyTrackedAsVisible) return false;

	// Check 1: Is an input actually focused?
	if (isInputElementFocused()) return false;

	// Check 2: Viewport height heuristic
	// If viewport is >= 75% of screen height, keyboard is likely not visible
	const viewportRatio = window.innerHeight / window.screen.height;
	if (viewportRatio >= 0.75) {
		return true;
	}

	// Check 3: VisualViewport API (more accurate on modern browsers)
	// If visualViewport.height is close to window.innerHeight, keyboard is not visible
	if (window.visualViewport) {
		const vvHeight = window.visualViewport.height;
		const heightDiff = Math.abs(window.innerHeight - vvHeight);
		// If the difference is less than 100px, keyboard is likely not visible
		// (small differences can occur due to browser chrome)
		if (heightDiff < 100) {
			return true;
		}
	}

	return false;
}

/**
 * Reset keyboard state if phantom keyboard is detected.
 * Uses multiple checks with delays to handle viewport stabilization.
 */
function checkAndResetPhantomKeyboard(): void {
	// Clear any pending check
	if (phantomKeyboardCheckTimeout) {
		clearTimeout(phantomKeyboardCheckTimeout);
		phantomKeyboardCheckTimeout = null;
	}

	// Immediate check
	if (detectPhantomKeyboard()) {
		console.debug('[Keyboard] Phantom keyboard detected (immediate), resetting state');
		setKeyboardClosed();
		animateFooterShow();
		return;
	}

	// Delayed check (viewport may need time to stabilize after app switch)
	phantomKeyboardCheckTimeout = setTimeout(() => {
		if (detectPhantomKeyboard()) {
			console.debug('[Keyboard] Phantom keyboard detected (delayed), resetting state');
			setKeyboardClosed();
			animateFooterShow();
		}
		phantomKeyboardCheckTimeout = null;
	}, 300);
}

/**
 * Safety net: when the app resumes from the background, the native
 * keyboard hide event may not have fired (known Capacitor bug on
 * Android when the keyboard was open in another app). Reset state
 * unless an input is still focused.
 */
function handleVisibilityChange(): void {
	if (typeof document === 'undefined' || document.hidden) return;
	checkAndResetPhantomKeyboard();
}

/**
 * Handle app state changes from Capacitor App plugin.
 * More reliable than visibilitychange on Android for detecting app resume.
 */
function handleAppStateChange(isActive: boolean): void {
	if (isActive) {
		// App became active - check for phantom keyboard
		// Use a small delay to let the viewport stabilize
		setTimeout(() => {
			checkAndResetPhantomKeyboard();
		}, 100);
	}
}

/**
 * Handle app resume event from Capacitor App plugin.
 * Fires when Activity.onResume() is called on Android.
 */
function handleAppResume(): void {
	// App resumed - check for phantom keyboard with multiple delays
	// The viewport may take time to update after PiP/split-screen transitions
	checkAndResetPhantomKeyboard();

	// Additional delayed check for slow viewport updates (foldables, PiP)
	setTimeout(() => {
		checkAndResetPhantomKeyboard();
	}, 500);
}

/**
 * Get the dock element from the footer for Motion animation.
 */
function getDockElement(): HTMLElement | null {
	return document.querySelector('.app-shell__footer .dock') as HTMLElement | null;
}

/**
 * Get the footer wrapper for layout collapse.
 */
function getFooterWrapper(): HTMLElement | null {
	return document.querySelector('.app-shell__footer') as HTMLElement | null;
}

/**
 * Collapse the footer layout space (called AFTER the dock slide-out animation).
 * Sets max-height to 0 so the grid row collapses and content area expands.
 */
function collapseFooterLayout(): void {
	const footer = getFooterWrapper();
	if (!footer) return;
	footer.style.maxHeight = '0px';
	footer.style.overflow = 'hidden';
}

/**
 * Expand the footer layout space (called BEFORE the dock slide-in animation).
 * Restores max-height so the grid row allocates space for the dock.
 */
function expandFooterLayout(): void {
	const footer = getFooterWrapper();
	if (!footer) return;
	footer.style.maxHeight = '';
	footer.style.overflow = '';
}

/**
 * Animate the footer dock out of view using Motion library (GPU-accelerated).
 * After the visual animation completes, collapses the layout space.
 */
async function animateFooterHide(): Promise<void> {
	const dock = getDockElement();
	if (!dock) {
		collapseFooterLayout();
		return;
	}

	try {
		const { animateFooterHide: hide } = await import('$lib/utils/animations');
		await hide(dock);
		collapseFooterLayout();
	} catch {
		// Fallback: instant hide if Motion fails to load
		dock.style.opacity = '0';
		dock.style.transform = 'translateY(100%)';
		collapseFooterLayout();
	}
}

/**
 * Animate the footer dock into view using Motion library (GPU-accelerated).
 * Expands layout space first, then animates the dock in.
 */
async function animateFooterShow(): Promise<void> {
	const dock = getDockElement();
	if (!dock) {
		expandFooterLayout();
		return;
	}

	try {
		expandFooterLayout();
		const { animateFooterShow: show } = await import('$lib/utils/animations');
		await show(dock);
	} catch {
		// Fallback: instant show if Motion fails to load
		expandFooterLayout();
		dock.style.opacity = '1';
		dock.style.transform = 'translateY(0)';
	}
}

/**
 * Scroll the focused input into view.
 * Uses scrollIntoViewIfNeeded without centering (block: 'nearest' equivalent)
 * to avoid the jarring centering jump when the input is already visible.
 */
function scrollFocusedInputIntoView(): void {
	if (typeof document === 'undefined') return;

	const active = document.activeElement;
	if (!(active instanceof HTMLElement)) return;

	const isInput =
		active.tagName === 'INPUT' ||
		active.tagName === 'TEXTAREA' ||
		active.getAttribute('contenteditable') === 'true';

	if (!isInput) return;

	requestAnimationFrame(() => {
		// scrollIntoViewIfNeeded without `true` = don't center, just ensure visible
		if ('scrollIntoViewIfNeeded' in active && typeof active.scrollIntoViewIfNeeded === 'function') {
			(
				active as HTMLElement & { scrollIntoViewIfNeeded: (center?: boolean) => void }
			).scrollIntoViewIfNeeded();
		} else {
			active.scrollIntoView({ behavior: 'instant', block: 'nearest' });
		}
	});
}

/**
 * Listen for VisualViewport resize events to detect keyboard changes.
 * This supplements Capacitor keyboard events with viewport-based detection,
 * providing a fallback for edge cases and phantom keyboard detection.
 */
function initVisualViewportListener(): void {
	if (typeof window === 'undefined' || !window.visualViewport) return;

	let previousHeight = window.visualViewport.height;

	vvResizeListener = () => {
		const vv = window.visualViewport;
		if (!vv) return;

		const currentHeight = vv.height;
		const heightDiff = previousHeight - currentHeight;
		previousHeight = currentHeight;

		// Significant viewport shrink (>150px) likely means keyboard opened
		if (heightDiff > 150 && isInputElementFocused()) {
			if (!get(keyboardVisible)) {
				setKeyboardOpen(Math.round(heightDiff));
				animateFooterHide();
				// Delay scroll to let layout settle
				requestAnimationFrame(() => scrollFocusedInputIntoView());
			}
		}
		// Significant viewport grow (>150px) likely means keyboard closed
		else if (heightDiff < -150 && get(keyboardVisible)) {
			setKeyboardClosed();
			animateFooterShow();
		}
	};

	window.visualViewport.addEventListener('resize', vvResizeListener);
}

/**
 * Initialise Capacitor Keyboard listeners.
 * No-op on web and safe to call multiple times.
 *
 * IMPORTANT: This function dynamically imports @capacitor/keyboard
 * to avoid SSR/build issues. Call this only in onMount or browser context.
 */
export async function initKeyboard(): Promise<() => void> {
	if (initialized) {
		return cleanupKeyboard;
	}

	// Skip on web - keyboard handling is native there
	if (Capacitor.getPlatform() === 'web') {
		return () => {};
	}

	// Dynamic import to avoid SSR issues
	const { Keyboard } = await import('@capacitor/keyboard');
	const { App } = await import('@capacitor/app');

	initialized = true;
	setKeyboardClosed();

	// keyboardWillShow: fires at the START of keyboard animation.
	// Immediately hide footer and set keyboard state. With KeyboardResize.None,
	// the body doesn't resize, so it's safe to animate the footer out now.
	keyboardWillShowListener = await Keyboard.addListener('keyboardWillShow', (info) => {
		setKeyboardOpen(info.keyboardHeight || 0);
		animateFooterHide();
	});

	// keyboardDidShow: fires when keyboard is fully visible.
	// Scroll the focused input into view (single scroll, no double-scroll).
	keyboardDidShowListener = await Keyboard.addListener('keyboardDidShow', () => {
		scrollFocusedInputIntoView();
	});

	// keyboardWillHide: fires at the START of keyboard hide animation.
	// Start footer show animation NOW, synced with keyboard slide-away.
	// With KeyboardResize.None, the body doesn't resize, so no content jump.
	keyboardWillHideListener = await Keyboard.addListener('keyboardWillHide', () => {
		if (get(keyboardVisible)) {
			setKeyboardClosed();
			animateFooterShow();
		}
	});

	// keyboardDidHide: fires when keyboard is fully hidden.
	// Safety net: ensure state is correct even if willHide didn't fire.
	keyboardDidHideListener = await Keyboard.addListener('keyboardDidHide', () => {
		if (get(keyboardVisible)) {
			setKeyboardClosed();
			animateFooterShow();
		}
	});

	// App state change listener - more reliable than visibilitychange on Android
	appStateChangeListener = await App.addListener('appStateChange', ({ isActive }) => {
		handleAppStateChange(isActive);
	});

	// App resume listener - critical for phantom keyboard detection
	appResumeListener = await App.addListener('resume', () => {
		handleAppResume();
	});

	// Web fallback for visibilitychange
	document.addEventListener('visibilitychange', handleVisibilityChange);

	// VisualViewport listener for supplementary keyboard detection
	initVisualViewportListener();

	return cleanupKeyboard;
}

export async function cleanupKeyboard(): Promise<void> {
	if (!initialized) return;
	initialized = false;

	if (phantomKeyboardCheckTimeout) {
		clearTimeout(phantomKeyboardCheckTimeout);
		phantomKeyboardCheckTimeout = null;
	}

	await keyboardWillShowListener?.remove();
	await keyboardDidShowListener?.remove();
	await keyboardWillHideListener?.remove();
	await keyboardDidHideListener?.remove();
	keyboardWillShowListener = null;
	keyboardDidShowListener = null;
	keyboardWillHideListener = null;
	keyboardDidHideListener = null;

	await appStateChangeListener?.remove();
	await appResumeListener?.remove();
	appStateChangeListener = null;
	appResumeListener = null;

	if (typeof document !== 'undefined') {
		document.removeEventListener('visibilitychange', handleVisibilityChange);
	}

	if (vvResizeListener && window.visualViewport) {
		window.visualViewport.removeEventListener('resize', vvResizeListener);
		vvResizeListener = null;
	}

	setKeyboardClosed();
}

export function isKeyboardVisible(): boolean {
	return get(keyboardVisible);
}

export function forceResetKeyboardState(): void {
	console.debug('[Keyboard] Force resetting keyboard state');
	setKeyboardClosed();
	animateFooterShow();
}

export function triggerPhantomKeyboardCheck(): void {
	checkAndResetPhantomKeyboard();
}

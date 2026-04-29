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
		return;
	}

	// Delayed check (viewport may need time to stabilize after app switch)
	phantomKeyboardCheckTimeout = setTimeout(() => {
		if (detectPhantomKeyboard()) {
			console.debug('[Keyboard] Phantom keyboard detected (delayed), resetting state');
			setKeyboardClosed();
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
 * Scroll the currently focused input into view after keyboard appears.
 * Uses scrollIntoViewIfNeeded when available (WebKit), falls back to scrollIntoView.
 *
 * We wait for the body/viewport resize to stabilize before scrolling,
 * since KeyboardResize.Body mode resizes the body asynchronously.
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

	// Wait for layout to stabilize after keyboard resize.
	// We use a combination of:
	// 1. requestAnimationFrame to wait for the next paint
	// 2. Instant scroll (no smooth) for immediate feedback
	requestAnimationFrame(() => {
		// scrollIntoViewIfNeeded is non-standard but supported in WebKit (iOS/Android WebView)
		// Pass `true` to center the element vertically
		if ('scrollIntoViewIfNeeded' in active && typeof active.scrollIntoViewIfNeeded === 'function') {
			(
				active as HTMLElement & { scrollIntoViewIfNeeded: (center?: boolean) => void }
			).scrollIntoViewIfNeeded(true);
		} else {
			// Use instant scroll for immediate feedback, smooth can feel laggy
			active.scrollIntoView({ behavior: 'instant', block: 'center' });
		}
	});
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
	// Use this to immediately hide the footer (CSS transition handles the visual).
	keyboardWillShowListener = await Keyboard.addListener('keyboardWillShow', (info) => {
		setKeyboardOpen(info.keyboardHeight || 0);
	});

	// keyboardDidShow: fires when keyboard is fully visible and body has resized.
	// Use this to scroll the focused input into view.
	keyboardDidShowListener = await Keyboard.addListener('keyboardDidShow', () => {
		scrollFocusedInputIntoView();
	});

	// keyboardWillHide: fires at the START of keyboard hide animation.
	// We wait for didHide to avoid content jumping before keyboard is gone.
	keyboardWillHideListener = await Keyboard.addListener('keyboardWillHide', () => {
		// Intentionally empty - we wait for didHide
	});

	// keyboardDidHide: fires when keyboard is fully hidden.
	keyboardDidHideListener = await Keyboard.addListener('keyboardDidHide', () => {
		setKeyboardClosed();
	});

	// App state change listener - more reliable than visibilitychange on Android
	// Fires when Activity.onResume() and Activity.onStop() are called
	appStateChangeListener = await App.addListener('appStateChange', ({ isActive }) => {
		handleAppStateChange(isActive);
	});

	// App resume listener - fires specifically when app comes to foreground
	// This is critical for detecting phantom keyboard after PiP/split-screen usage
	appResumeListener = await App.addListener('resume', () => {
		handleAppResume();
	});

	// Web fallback for visibilitychange (works on web and as backup on native)
	document.addEventListener('visibilitychange', handleVisibilityChange);

	return cleanupKeyboard;
}

export async function cleanupKeyboard(): Promise<void> {
	if (!initialized) return;
	initialized = false;

	// Clear any pending phantom keyboard check
	if (phantomKeyboardCheckTimeout) {
		clearTimeout(phantomKeyboardCheckTimeout);
		phantomKeyboardCheckTimeout = null;
	}

	// Remove keyboard listeners
	await keyboardWillShowListener?.remove();
	await keyboardDidShowListener?.remove();
	await keyboardWillHideListener?.remove();
	await keyboardDidHideListener?.remove();
	keyboardWillShowListener = null;
	keyboardDidShowListener = null;
	keyboardWillHideListener = null;
	keyboardDidHideListener = null;

	// Remove app state listeners
	await appStateChangeListener?.remove();
	await appResumeListener?.remove();
	appStateChangeListener = null;
	appResumeListener = null;

	if (typeof document !== 'undefined') {
		document.removeEventListener('visibilitychange', handleVisibilityChange);
	}

	setKeyboardClosed();
}

/**
 * Utility to check if keyboard is currently visible.
 * Can be used in components that need to react to keyboard state.
 */
export function isKeyboardVisible(): boolean {
	return get(keyboardVisible);
}

/**
 * Force reset keyboard state to closed.
 * Use this as a manual escape hatch when phantom keyboard is detected
 * but automatic detection doesn't catch it.
 */
export function forceResetKeyboardState(): void {
	console.debug('[Keyboard] Force resetting keyboard state');
	setKeyboardClosed();
}

/**
 * Trigger a phantom keyboard check manually.
 * Useful for debugging or when you know an app transition occurred.
 */
export function triggerPhantomKeyboardCheck(): void {
	checkAndResetPhantomKeyboard();
}

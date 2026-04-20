import { Capacitor } from '@capacitor/core';
import { writable, get } from 'svelte/store';

export const keyboardVisible = writable(false);
export const keyboardHeight = writable(0);

let initialized = false;
let keyboardWillShowListener: { remove: () => Promise<void> } | null = null;
let keyboardDidShowListener: { remove: () => Promise<void> } | null = null;
let keyboardWillHideListener: { remove: () => Promise<void> } | null = null;
let keyboardDidHideListener: { remove: () => Promise<void> } | null = null;

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
 * Safety net: when the app resumes from the background, the native
 * keyboard hide event may not have fired (known Capacitor bug on
 * Android when the keyboard was open in another app). Reset state
 * unless an input is still focused.
 */
function handleVisibilityChange(): void {
	if (typeof document === 'undefined' || document.hidden) return;
	const active = document.activeElement;
	const isInputFocused =
		active instanceof HTMLElement &&
		(active.tagName === 'INPUT' ||
			active.tagName === 'TEXTAREA' ||
			active.getAttribute('contenteditable') === 'true');
	if (!isInputFocused) {
		setKeyboardClosed();
	}
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

	document.addEventListener('visibilitychange', handleVisibilityChange);

	return cleanupKeyboard;
}

export async function cleanupKeyboard(): Promise<void> {
	if (!initialized) return;
	initialized = false;

	await keyboardWillShowListener?.remove();
	await keyboardDidShowListener?.remove();
	await keyboardWillHideListener?.remove();
	await keyboardDidHideListener?.remove();
	keyboardWillShowListener = null;
	keyboardDidShowListener = null;
	keyboardWillHideListener = null;
	keyboardDidHideListener = null;

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

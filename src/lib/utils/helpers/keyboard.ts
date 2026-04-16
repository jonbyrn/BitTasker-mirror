import { Keyboard } from '@capacitor/keyboard';
import { Capacitor } from '@capacitor/core';
import { writable } from 'svelte/store';

export const keyboardVisible = writable(false);
export const keyboardHeight = writable(0);

let initialized = false;

const root = typeof document !== 'undefined' ? document.documentElement : null;

function setKeyboardOpen(height: number): void {
	if (!root) return;
	// root.style.setProperty('--keyboard-height', `${height}px`);
	root.style.setProperty('--keyboard-height', `0px`);
	root.setAttribute('data-keyboard-visible', '');
	keyboardVisible.set(true);
	keyboardHeight.set(height);
}

function setKeyboardClosed(): void {
	if (!root) return;
	root.style.setProperty('--keyboard-height', '0px');
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
	if (document.hidden) return;
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
 * Initialise Capacitor Keyboard listeners.
 * No-op on web and safe to call multiple times.
 */
export function initKeyboard(): () => void {
	if (initialized || Capacitor.getPlatform() === 'web') {
		return () => {};
	}
	initialized = true;

	setKeyboardClosed();

	Keyboard.addListener('keyboardWillShow', (info) => {
		setKeyboardOpen(info.keyboardHeight || 0);
	});

	Keyboard.addListener('keyboardWillHide', () => {
		setKeyboardClosed();
	});

	Keyboard.addListener('keyboardDidHide', () => {
		setKeyboardClosed();
	});

	document.addEventListener('visibilitychange', handleVisibilityChange);

	setupGlobalInputFocusScroll();

	return cleanupKeyboard;
}

export function cleanupKeyboard(): void {
	if (!initialized) return;
	initialized = false;
	Keyboard.removeAllListeners();
	document.removeEventListener('visibilitychange', handleVisibilityChange);
	setKeyboardClosed();
}

/** Scroll an input element into view above the keyboard. */
export function scrollInputIntoView(input: HTMLElement): void {
	if (!input) return;
	setTimeout(() => {
		input.scrollIntoView({ behavior: 'smooth', block: 'center' });
	}, 100);
}

/** Automatically scroll focused inputs/textareas into view. */
function setupGlobalInputFocusScroll(): void {
	function handleFocusIn(event: FocusEvent) {
		const target = event.target as HTMLElement;
		if (
			target &&
			(target.tagName === 'INPUT' ||
				target.tagName === 'TEXTAREA' ||
				target.getAttribute('contenteditable') === 'true')
		) {
			scrollInputIntoView(target);
		}
	}
	document.addEventListener('focusin', handleFocusIn);
}

import { Keyboard } from '@capacitor/keyboard';
import { browser } from '$app/environment';
import { writable } from 'svelte/store';
import { Device } from '@capacitor/device';

// Store for keyboard state
export const keyboardVisible = writable(false);
export const keyboardHeight = writable(0);

let keyboardShowListener: any = null;
let keyboardHideListener: any = null;
let listenersSet = false;

export async function setupKeyboardListeners() {
	if (!browser) return;
	const info = await Device.getInfo();
	if (info.platform === 'web') return; // Only run on mobile

	 // Remove previous listeners if any
	if (keyboardShowListener) keyboardShowListener.remove();
	if (keyboardHideListener) keyboardHideListener.remove();
	if (listenersSet) return;
	listenersSet = true;

	Keyboard.addListener('keyboardWillShow', (info) => {
		keyboardVisible.set(true);
		keyboardHeight.set(info.keyboardHeight || 0);
	});
	Keyboard.addListener('keyboardDidShow', (info) => {
		keyboardVisible.set(true);
		keyboardHeight.set(info.keyboardHeight || 0);
	});
	Keyboard.addListener('keyboardWillHide', () => {
		keyboardVisible.set(false);
		keyboardHeight.set(0);
	});
	Keyboard.addListener('keyboardDidHide', () => {
		keyboardVisible.set(false);
		keyboardHeight.set(0);
	});
}

function cleanupKeyboardListeners() {
	if (keyboardShowListener) keyboardShowListener.remove();
	if (keyboardHideListener) keyboardHideListener.remove();
}

// Utility to scroll an input into view above the keyboard
export function scrollInputIntoView(input: HTMLElement) {
	if (!input) return;
	setTimeout(() => {
		input.scrollIntoView({ behavior: 'smooth', block: 'center' });
	}, 100);
}

// Global input focus handler for the app
export function setupGlobalInputFocusScroll() {
	function handleFocusIn(event: FocusEvent) {
		const target = event.target as HTMLElement;
		if (
			target &&
			(target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.getAttribute('contenteditable') === 'true')
		) {
			scrollInputIntoView(target);
		}
	}
	document.addEventListener('focusin', handleFocusIn);
	return () => {
		document.removeEventListener('focusin', handleFocusIn);
		cleanupKeyboardListeners();
	};
} 
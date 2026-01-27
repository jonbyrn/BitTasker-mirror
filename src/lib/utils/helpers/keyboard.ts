import { Keyboard } from '@capacitor/keyboard';
import { browser } from '$app/environment';
import { writable } from 'svelte/store';
import { Device } from '@capacitor/device';

// Store for keyboard state
export const keyboardVisible = writable(false);
export const keyboardHeight = writable(0);

const keyboardShowListener: any = null;
const keyboardHideListener: any = null;
let listenersSet = false;

export async function setupKeyboardListeners() {
	if (!browser) return;
	
	// Defer to prevent blocking main thread
	const deferSetup = () => {
		if ('requestIdleCallback' in window) {
			requestIdleCallback(async () => {
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
					resizeViewport();
				});
				Keyboard.addListener('keyboardDidHide', () => {
					keyboardVisible.set(false);
					keyboardHeight.set(0);
					resizeViewport();
				});
			}, { timeout: 1000 });
		} else {
			setTimeout(async () => {
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
					resizeViewport();
				});
				Keyboard.addListener('keyboardDidHide', () => {
					keyboardVisible.set(false);
					keyboardHeight.set(0);
					resizeViewport();
				});
			}, 100);
		}
	};
	
	deferSetup();
}

function cleanupKeyboardListeners() {
	if (keyboardShowListener) keyboardShowListener.remove();
	if (keyboardHideListener) keyboardHideListener.remove();
}

function resizeViewport() {
	if (typeof window === 'undefined') return;
	
	requestAnimationFrame(() => {
		window.dispatchEvent(new Event('resize'));
		
		const viewport = document.querySelector('meta[name="viewport"]');
		if (viewport) {
			const originalContent = viewport.getAttribute('content');
			viewport.setAttribute('content', originalContent + ', maximum-scale=1.0');
			setTimeout(() => {
				if (viewport) {
					viewport.setAttribute('content', originalContent || '');
				}
			}, 100);
		}
		
		const html = document.documentElement;
		const body = document.body;
		if (html && body) {
			const height = window.innerHeight;
			html.style.height = `${height}px`;
			body.style.height = `${height}px`;
			
			setTimeout(() => {
				html.style.height = '';
				body.style.height = '';
			}, 50);
		}
	});
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
			(target.tagName === 'INPUT' ||
				target.tagName === 'TEXTAREA' ||
				target.getAttribute('contenteditable') === 'true')
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

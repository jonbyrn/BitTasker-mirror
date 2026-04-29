import { browser } from '$app/environment';
import { readable } from 'svelte/store';

export type NetworkTransitionState = 'initial' | 'online' | 'offline';

export interface BrowserNetworkStatus {
	online: boolean;
	lastTransition: NetworkTransitionState;
}

function getInitialStatus(): BrowserNetworkStatus {
	if (!browser || typeof navigator === 'undefined') {
		return {
			online: true,
			lastTransition: 'initial'
		};
	}

	return {
		online: navigator.onLine !== false,
		lastTransition: 'initial'
	};
}

/** Shared browser online/offline state used to fail closed in quote and contract actions. */
export const browserNetworkStatus = readable<BrowserNetworkStatus>(getInitialStatus(), (set) => {
	if (!browser || typeof window === 'undefined' || typeof navigator === 'undefined') {
		return () => {};
	}

	const applyOnline = () => {
		set({
			online: true,
			lastTransition: 'online'
		});
	};

	const applyOffline = () => {
		set({
			online: false,
			lastTransition: 'offline'
		});
	};

	window.addEventListener('online', applyOnline);
	window.addEventListener('offline', applyOffline);

	return () => {
		window.removeEventListener('online', applyOnline);
		window.removeEventListener('offline', applyOffline);
	};
});

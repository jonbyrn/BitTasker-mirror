import type { BiometricData } from '$lib/types/auth';
import { SimplePool } from 'nostr-tools';
import { writable } from 'svelte/store';

interface Toast {
	type: 'success' | 'error' | 'info';
	message: string;
	id: number;
}

interface AppStore {
	nostrKeys: {
		nsec: Uint8Array | null;
		npub: string | null;
		mnemonic: string | null;
	};
	isLoading: boolean;
	error: string | null;
	toasts: Toast[];
	biometricData: BiometricData | null;
	network: 'mainnet' | 'testnet' | 'regtest';
	pool: SimplePool;
	relays: string[];
}

const createAppStore = () => {
	// Create a single pool instance with proper configuration
	// enablePing: sends regular pings to detect disconnections
	// enableReconnect: automatically reconnects with exponential backoff
	const pool = new SimplePool();

	const store = writable<AppStore>({
		nostrKeys: {
			nsec: null,
			npub: null,
			mnemonic: null
		},
		isLoading: false,
		error: null,
		toasts: [],
		biometricData: null,
		network: import.meta.env.VITE_RSK_NETWORK || 'testnet',
		pool,
		relays: import.meta.env.VITE_NOSTR_RELAY_URL
			? [import.meta.env.VITE_NOSTR_RELAY_URL]
			: ['wss://relay.bittasker.hedgehackers.finance'] // Fallback relay
	});

	const { subscribe, set, update } = store;

	let toastId = 0;

	const addToast = (toast: Omit<Toast, 'id'>, timeout: number) => {
		const id = toastId++;
		update((state) => ({
			...state,
			toasts: [...state.toasts, { ...toast, id }]
		}));

		// Auto-remove toast after 3 seconds
		setTimeout(() => {
			update((state) => ({
				...state,
				toasts: state.toasts.filter((t) => t.id !== id)
			}));
		}, timeout);
	};

	return {
		subscribe,
		set,
		update,
		showSuccessToast: (message: string, timeout: number = 3000) => {
			addToast({ type: 'success', message }, timeout);
		},
		showErrorToast: (message: string, timeout: number = 3000) => {
			addToast({ type: 'error', message }, timeout);
		},
		showInfoToast: (message: string, timeout: number = 3000) => {
			addToast({ type: 'info', message }, timeout);
		},
		/**
		 * Reset user-specific state (nostrKeys, biometricData)
		 * Called on logout to prevent stale data
		 */
		resetUserState: () => {
			update((state) => ({
				...state,
				nostrKeys: {
					nsec: null,
					npub: null,
					mnemonic: null
				},
				biometricData: null,
				error: null
			}));
		},
		initializePool: () => {
			if (pool) return pool;
			const newPool = new SimplePool();
			update((state) => ({
				...state,
				pool: newPool
			}));
			return newPool;
		}
	};
};

export const appStore = createAppStore();

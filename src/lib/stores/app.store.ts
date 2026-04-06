import type { BiometricData } from '$lib/types/auth';
import { SimplePool } from 'nostr-tools';
import { get, writable } from 'svelte/store';

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
	let pool: SimplePool | null = null;

	const ensurePool = (): SimplePool => {
		if (!pool) {
			// Delay pool construction until runtime usage so shared layout imports
			// never instantiate nostr-tools during app bootstrap.
			pool = new SimplePool();
		}

		return pool;
	};

	const lazyPool = new Proxy({} as SimplePool, {
		get(_target, property, receiver) {
			const activePool = ensurePool() as Record<PropertyKey, unknown>;
			const value = Reflect.get(activePool, property, receiver);
			return typeof value === 'function' ? value.bind(activePool) : value;
		}
	}) as SimplePool;

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
		pool: lazyPool,
		relays: [import.meta.env.VITE_NOSTR_RELAY_URL]
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
			ensurePool();
			const state = get(store);
			if (state.pool !== lazyPool) {
				update((currentState) => ({
					...currentState,
					pool: lazyPool
				}));
			}
			return lazyPool;
		}
	};
};

export const appStore = createAppStore();

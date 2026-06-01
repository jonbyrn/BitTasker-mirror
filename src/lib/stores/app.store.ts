import type { BiometricData } from '$lib/types/auth';
import { resolveExplicitRelayUrls } from '$lib/utils/relayUrls';
import { SimplePool } from 'nostr-tools';
import { get, writable } from 'svelte/store';

interface ToastAction {
	label: string;
	onClick: () => void;
	variant?: 'primary' | 'secondary' | 'ghost';
}

interface Toast {
	type: 'success' | 'error' | 'info' | 'banner';
	message: string | { key: string; values?: Record<string, unknown> };
	id: number;
	actions?: ToastAction[];
	dismissible?: boolean;
	dismissKey?: string;
	dedupKey?: string;
	duration?: number;
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
			pool = new SimplePool();
		}

		return pool;
	};

	const lazyPool = new Proxy({} as SimplePool, {
		get(_target, property, receiver) {
			const activePool = ensurePool() as unknown as Record<PropertyKey, unknown>;
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
		relays: resolveExplicitRelayUrls(import.meta.env.VITE_NOSTR_RELAY_URL)
	});

	const { subscribe, set, update } = store;

	let toastId = 0;

	const addToast = (toast: Omit<Toast, 'id'>, timeout: number): number => {
		const id = toastId++;
		update((state) => ({
			...state,
			toasts: [...state.toasts, { ...toast, id }]
		}));

		if (timeout > 0) {
			setTimeout(() => {
				update((state) => ({
					...state,
					toasts: state.toasts.filter((t) => t.id !== id)
				}));
			}, timeout);
		}

		return id;
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
		showBanner: (options: {
			message: string | { key: string; values?: Record<string, unknown> };
			actions?: ToastAction[];
			dismissible?: boolean;
			dismissKey?: string;
			dedupKey?: string;
			duration?: number;
		}): number | null => {
			const { message, actions, dismissible = true, dismissKey, dedupKey, duration = 0 } = options;
			if (dismissKey) {
				const dismissedUntil = localStorage.getItem(dismissKey);
				if (dismissedUntil && Date.now() < parseInt(dismissedUntil, 10)) {
					return null;
				}
			}
			if (dedupKey) {
				update((state) => ({
					...state,
					toasts: state.toasts.filter((t) => t.dedupKey !== dedupKey)
				}));
			}
			return addToast(
				{ type: 'banner', message, actions, dismissible, dismissKey, dedupKey, duration },
				duration
			);
		},
		dismissBanner: (toastId: number, dismissKey?: string, dismissDurationMs?: number) => {
			if (dismissKey) {
				const until = Date.now() + (dismissDurationMs ?? 24 * 60 * 60 * 1000);
				localStorage.setItem(dismissKey, String(until));
			}
			update((state) => ({
				...state,
				toasts: state.toasts.filter((t) => t.id !== toastId)
			}));
		},
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

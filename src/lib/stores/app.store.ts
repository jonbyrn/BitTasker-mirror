import type { Credentials } from '$lib/types/auth';
import { writable } from 'svelte/store';

interface Toast {
	type: 'success' | 'error' | 'info';
	message: string;
	id: number;
}

interface AppStore {
	isLoading: boolean;
	error: string | null;
	toasts: Toast[];
	biometricData: Credentials | null;
}

const createAppStore = () => {
	const store = writable<AppStore>({
		isLoading: false,
		error: null,
		toasts: [],
		biometricData: null
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
		}
	};
};

export const appStore = createAppStore();

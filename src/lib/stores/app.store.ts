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

	const addToast = (toast: Omit<Toast, 'id'>) => {
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
		}, 3000);
	};

	return {
		subscribe,
		set,
		update,
		showSuccessToast: (message: string) => {
			addToast({ type: 'success', message });
		},
		showErrorToast: (message: string) => {
			addToast({ type: 'error', message });
		},
		showInfoToast: (message: string) => {
			addToast({ type: 'info', message });
		}
	};
};

export const appStore = createAppStore();

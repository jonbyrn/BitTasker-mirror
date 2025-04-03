import type { ICategory, ISkill } from '$lib/types/common';
import { writable } from 'svelte/store';
import userService from '$lib/api/services/user.service';

interface Toast {
	type: 'success' | 'error' | 'info';
	message: string;
	id: number;
}

interface AppStore {
	skills: ISkill[];
	categories: ICategory[];
	isLoading: boolean;
	error: string | null;
	toasts: Toast[];
}

const createAppStore = () => {
	const { subscribe, set, update } = writable<AppStore>({
		skills: [],
		categories: [],
		isLoading: false,
		error: null,
		toasts: []
	});

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
		loadGlobalData: async () => {
			update((state) => ({ ...state, isLoading: true, error: null }));

			try {
				const [skills, categories] = await Promise.all([
					userService.fetchSkills(),
					userService.fetchCategories()
				]);

				update((state) => ({ ...state, skills, categories }));
			} catch (error) {
				update((state) => ({ ...state, error: 'Failed to load application data' }));
				console.error('Error loading global data:', error);
			} finally {
				update((state) => ({ ...state, isLoading: false }));
			}
		},
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

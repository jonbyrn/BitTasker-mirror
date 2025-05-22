import type { ICategory, ISkill } from '$lib/types/common';
import type { Credentials } from '$lib/types/auth';
import { writable, get } from 'svelte/store';
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
	biometricData: Credentials | null;
}

const createAppStore = () => {
	const store = writable<AppStore>({
		skills: [],
		categories: [],
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

	const getBiometricData = async () => {
		const currentState = get(store);
		if (currentState.biometricData) return currentState.biometricData;

		const { checkBiometricAvailability, getBiometricData } = await import(
			'$lib/utils/helpers/biometrics'
		);

		const isBiometricAvailable = await checkBiometricAvailability();

		if (isBiometricAvailable) {
			const biometricData = await getBiometricData();
			update((state) => ({ ...state, biometricData }));
			return biometricData;
		} else {
			const { getWebBiometricData } = await import('$lib/utils/helpers/webBiometrics');
			const webBiometricData = await getWebBiometricData();
			update((state) => ({ ...state, biometricData: webBiometricData }));
			return webBiometricData;
		}
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
		},
		getBiometricData
	};
};

export const appStore = createAppStore();

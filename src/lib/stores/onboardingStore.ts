import { writable } from 'svelte/store';

// Initialize from localStorage if available
const storedData =
	typeof localStorage !== 'undefined' ? localStorage.getItem('onboardingData') : null;
const initialData = storedData
	? JSON.parse(storedData)
	: {
			accountType: null,
			email: '',
			password: '',
			firstName: '',
			lastName: '',
			location: '',
			about: '',
			// Freelancer specific
			skills: [],
			customSkills: '',
			skillCategories: [],
			// Client specific
			taskCategories: [],
			projectNeeds: ''
		};

const createOnboardingStore = () => {
	const { subscribe, set, update } = writable(initialData);

	// Helper function to save data to localStorage
	const saveToLocalStorage = (data: string | string[]) => {
		if (typeof localStorage !== 'undefined') {
			localStorage.setItem('onboardingData', JSON.stringify(data));
		}
	};

	return {
		subscribe,
		updateField: (field: string, value: string | string[]) => {
			update((data) => {
				const updatedData = { ...data, [field]: value };
				saveToLocalStorage(updatedData);
				return updatedData;
			});
		},
		updateFields: (fields: Record<string, string | string[]>) => {
			update((data) => {
				const updatedData = { ...data, ...fields };
				saveToLocalStorage(updatedData);
				return updatedData;
			});
		},
		getField: (field?: string) => {
			let value;
			subscribe((data) => {
				value = field ? data[field] : data;
			})();
			return value;
		},
		clearData: () => {
			const emptyData = {
				accountType: null,
				email: '',
				password: '',
				firstName: '',
				lastName: '',
				location: '',
				about: '',
				skills: [],
				customSkills: '',
				skillCategories: [],
				taskCategories: [],
				projectNeeds: ''
			};
			set(emptyData);
			if (typeof localStorage !== 'undefined') {
				localStorage.removeItem('onboardingData');
			}
		}
	};
};

export const onboardingStore = createOnboardingStore();

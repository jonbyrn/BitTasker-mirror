/* eslint-disable @typescript-eslint/no-explicit-any */
import { writable } from 'svelte/store';
import { MeStore } from '$houdini';

// Define the database user state type
type DatabaseUserState = {
	isLoading: boolean;
	error: string | null;
	data: any;
};

// Create the initial state
const initialState: DatabaseUserState = {
	isLoading: true,
	error: null,
	data: null
};

// Create the store
function createDatabaseUserStore() {
	const { subscribe, set, update } = writable<DatabaseUserState>(initialState);
	const meStore = new MeStore();

	return {
		subscribe,

		// Initialize the store with data from database
		async init() {
			try {
				update((state) => ({ ...state, isLoading: true, error: null }));

				const { data, errors } = await meStore.fetch();

				if (errors) {
					throw new Error(errors[0].message);
				}

				update((state) => ({
					...state,
					isLoading: false,
					error: null,
					data
				}));
			} catch (error) {
				console.error('Failed to initialize database user store:', error);
				update((state) => ({
					...state,
					isLoading: false,
					error: error instanceof Error ? error.message : 'Failed to load user data'
				}));
			}
		},

		// Update user data
		updateUserData(userData: Partial<DatabaseUserState['data']>) {
			update((state) => ({
				...state,
				data: state.data ? { ...state.data, ...userData } : null
			}));
		},

		// Reset store
		reset() {
			set(initialState);
		}
	};
}

// Export the store instance
export const databaseUserStore = createDatabaseUserStore();

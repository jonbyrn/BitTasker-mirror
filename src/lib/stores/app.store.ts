import { fetchCategories, fetchSkills } from '$lib/services/user.service';
import { writable } from 'svelte/store';

interface AppStore {
    skills: string[];
    categories: string[];
    isLoading: boolean;
    error: string | null;
}

// Function to load global data
export async function loadGlobalData() {
    const { update } = createAppStore();
    update(state => ({ ...state, isLoading: true, error: null }));

    try {
        const [skills, categories] = await Promise.all([
            fetchSkills(),
            fetchCategories()
        ]);

        update(state => ({ ...state, skills, categories }));
    } catch (error) {
        update(state => ({ ...state, error: 'Failed to load application data' }));
        console.error('Error loading global data:', error);
    } finally {
        update(state => ({ ...state, isLoading: false }));
    }   
}

const createAppStore = () => {
    const { subscribe, set, update } = writable<AppStore>({
        skills: [],
        categories: [],
        isLoading: false,
        error: null
    });

    return {
        subscribe,
        set,
        update,
        loadGlobalData
    };
};

export const appStore = createAppStore();
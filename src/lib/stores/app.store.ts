import { fetchCategories, fetchSkills } from '$lib/services/user.service';
import type { ICategory, ISkill } from '$lib/types/common';
import { writable } from 'svelte/store';

interface AppStore {
    skills: ISkill[];
    categories: ICategory[];
    isLoading: boolean;
    error: string | null;
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
        loadGlobalData: async () => {
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
    };
};

export const appStore = createAppStore();
import type { UserData } from "$lib/types/auth";
import createAxiosInstance from "$lib/api/axios";
import { goto } from "$app/navigation";

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const API_PATH = '/api/users';
const ADMIN_PATH = '/api/v1/admin';

const userApi = createAxiosInstance({ baseURL: API_URL });

export async function getUserProfile(): Promise<UserData> {
    try {
        const response = await userApi.get(`${API_PATH}/profile`);
        return response.data;
    } catch (error) {
        goto('/auth');
        throw error;
    }
}

export async function fetchSkills(): Promise<string[]> {
    try {
        const response = await userApi.get(`${ADMIN_PATH}/skills`);
        return response.data;
    } catch (error) {
        console.error('Error fetching skills:', error);
        return [];
    }
}

export async function fetchCategories(): Promise<string[]> {
    try {
        const response = await userApi.get(`${ADMIN_PATH}/categories`);
        return response.data;
    } catch (error) {
        console.error('Error fetching categories:', error);
        return [];
    }
}
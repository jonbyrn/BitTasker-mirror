import type { UserData } from "$lib/types/auth";
import createAxiosInstance from "$lib/api/axios";
import { goto } from "$app/navigation";

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const API_PATH = '/api/users';

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
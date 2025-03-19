import type { NostrRegistrationData, ApiResponse } from '$lib/types/auth';
import createAxiosInstance from '$lib/api/axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const API_PATH = '/api/v1/auth';

const authApi = createAxiosInstance({
	baseURL: API_URL
});

/**
 * Register a new user with client-generated Nostr keys
 * @param registrationData User registration data with Nostr keys
 * @returns Promise with the registration response
 * @throws 400 - Bad Request or missing required encryption data
 * @throws 409 - Email already in use
 */
export const registerWithNostr = async (
	registrationData: NostrRegistrationData
): Promise<ApiResponse<any>> => {
	const response = await authApi.post(`${API_PATH}/register/nostr`, registrationData);
	return response.data;
};

import type { UserData } from '$lib/types/auth';
import createAxiosInstance from '$lib/api/axios';
import { tryCatch } from '$lib/utils/tryCatch';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const API_PATH = '/api/users';

const userApi = createAxiosInstance({ baseURL: API_URL });

export async function getUserProfile(): Promise<UserData> {
	const response = await userApi.get(`${API_PATH}/profile`);
	return response.data;
}

export async function checkOnboardingStatus(): Promise<{
	completed: boolean;
}> {
	// This is a mock implementation until the API is ready
	// TODO: Replace with actual API call when available
	const { data: response, error } = await tryCatch(userApi.get(`${API_PATH}/onboarding-status`));

	if (error) {
		console.log('Using mock onboarding status data', error);
		// TODO: Remove this and throw the error instead, once the API is ready
		return {
			completed: false
		};
	}

	if (response.status === 200) {
		return {
			completed: true
		};
	} else {
		return {
			completed: false
		};
	}
}

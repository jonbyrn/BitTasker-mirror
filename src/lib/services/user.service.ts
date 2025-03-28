import type { UserData } from "$lib/types/auth";
import type { ICategory, ISkill } from "$lib/types/common";
import { tryCatch } from '$lib/utils/tryCatch';
import createAxiosInstance from "$lib/api/axios";
import { goto } from "$app/navigation";
import type { OnboardingRequest } from "$lib/types/onboarding";
import type { OnboardingSuccessResponse } from "$lib/types/onboarding";
import type { OnboardingErrorResponse } from "$lib/types/onboarding";

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

export async function fetchSkills(): Promise<ISkill[]> {
    try {
        const response = await userApi.get(`${ADMIN_PATH}/skills`);
        return response.data;
    } catch (error) {
        console.error('Error fetching skills:', error);
        return [];
    }
}

export async function fetchCategories(): Promise<ICategory[]> {
    try {
        const response = await userApi.get(`${ADMIN_PATH}/categories`);
        return response.data;
    } catch (error) {
        console.error('Error fetching categories:', error);
        return [];
    }
}

/**
 * Submits user onboarding data to complete the onboarding process
 * @param onboardingData The user's onboarding information
 * @returns A promise resolving to the onboarding success response
 * @throws Error if the request fails with appropriate error message
 */
export async function completeUserOnboarding(
	onboardingData: OnboardingRequest
): Promise<OnboardingSuccessResponse> {
	const { data: response, error } = await tryCatch(
		userApi.post('/api/v1/auth/onboarding', onboardingData)
	);

	if (error) {
		console.error('Failed to complete onboarding:', error);
		throw new Error(`Failed to complete onboarding: ${error.message}`);
	}

	// Handle different response statuses
	if (response.status === 400) {
		const errorData = response.data as OnboardingErrorResponse;
		throw new Error(`Bad Request: ${errorData.message.join(', ')}`);
	} else if (response.status === 401) {
		throw new Error('Unauthorized: You must be logged in to complete onboarding');
	}

	return response.data;
}
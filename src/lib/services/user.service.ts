import type { ApiUserProfile } from '$lib/types/auth';
import type { ICategory, ISkill } from '$lib/types/common';
import type { OnboardingRequest, OnboardingSuccessResponse, OnboardingErrorResponse } from '$lib/types/onboarding';
import { ENDPOINTS } from '$lib/api/endpoints';
import { tryCatch } from '$lib/utils/tryCatch';
import { goto } from '$app/navigation';
import createAxiosInstance from '$lib/api/axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const ADMIN_PATH = '/api/v1/admin';

const userApi = createAxiosInstance({ baseURL: API_URL });

export async function getUserProfile(): Promise<ApiUserProfile> {
	try {
		const response = await userApi.get(ENDPOINTS.USERS.PROFILE);
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
 * @returns A promise resolving to a Result containing either the success response data or error
 */
export async function completeUserOnboarding(
	onboardingData: OnboardingRequest
): Promise<{ data: OnboardingSuccessResponse | null; error: Error | null }> {
	const { data: response, error } = await tryCatch(
		userApi.post(ENDPOINTS.AUTH.ONBOARDING, onboardingData)
	);

	if (error) {
		return {
			data: null,
			error: new Error(`Failed to complete onboarding: ${error.response?.data?.message}`)
		};
	}

	// Handle different response statuses
	if (response.status === 400) {
		const errorData = response.data as OnboardingErrorResponse;
		return { data: null, error: new Error(`Bad Request: ${errorData.message.join(', ')}`) };
	} else if (response.status === 401) {
		return {
			data: null,
			error: new Error('Unauthorized: You must be logged in to complete onboarding')
		};
	}

	return { data: response.data, error: null };
}

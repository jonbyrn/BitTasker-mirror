import { BaseApiService } from './apiService';
import { ENDPOINTS } from './endpoints';
import type { OnboardingRequest, OnboardingResponse } from './types';

/**
 * Auth API Service
 *
 * Handles all authentication-related API calls
 */
export class AuthService extends BaseApiService {
	/**
	 * Complete user onboarding
	 *
	 * @param data User onboarding data
	 * @returns User data
	 */
	async completeOnboarding(data: OnboardingRequest): Promise<OnboardingResponse> {
		const response = await this.post<OnboardingResponse>(ENDPOINTS.AUTH.ONBOARDING, data);
		return response.data;
	}

	/**
	 * Log out the current user
	 */
	async logout(): Promise<void> {
		await this.post(ENDPOINTS.AUTH.LOGOUT);
		// Clear local storage on logout
		localStorage.removeItem('nostrKeys');
	}

	// Add other auth-related methods as needed
}

// Create and export a singleton instance
export const authService = new AuthService();

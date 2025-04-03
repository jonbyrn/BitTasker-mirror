import type { ApiUserProfile } from '$lib/types/auth';
import type { ICategory, ISkill } from '$lib/types/common';
import type {
  OnboardingRequest,
  OnboardingSuccessResponse,
  OnboardingErrorResponse
} from '$lib/types/onboarding';
import { ENDPOINTS } from '../endpoints';
import { tryCatch } from '$lib/utils/tryCatch';
import { goto } from '$app/navigation';
import { BaseApiService } from '../apiService';

/**
 * User Service
 * Handles user profile management, onboarding, and retrieving user-related data
 */
export class UserService extends BaseApiService {  
  /**
   * Get the profile of the currently authenticated user
   * @returns Promise containing the user profile data
   * @throws Error if profile retrieval fails, also redirects to auth page
   */
  async getUserProfile(): Promise<ApiUserProfile> {
    try {
      const response = await this.get<ApiUserProfile>(ENDPOINTS.USERS.PROFILE);
      return response.data;
    } catch (error) {
      goto('/auth');
      throw error;
    }
  }

  /**
   * Fetch available skills for user selection
   * @returns Promise containing an array of skill objects
   * @returns Empty array if skills cannot be fetched
   */
  async fetchSkills(): Promise<ISkill[]> {
    try {
      const response = await this.get<ISkill[]>(ENDPOINTS.ADMIN.SKILLS);
      return response.data;
    } catch (error) {
      console.error('Error fetching skills:', error);
      return [];
    }
  }

  /**
   * Fetch available task categories
   * @returns Promise containing an array of category objects
   * @returns Empty array if categories cannot be fetched
   */
  async fetchCategories(): Promise<ICategory[]> {
    try {
      const response = await this.get<ICategory[]>(ENDPOINTS.ADMIN.CATEGORIES);
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
  async completeUserOnboarding(
    onboardingData: OnboardingRequest
  ): Promise<{ data: OnboardingSuccessResponse | null; error: Error | null }> {
    const { data: response, error } = await tryCatch(
      this.post(ENDPOINTS.AUTH.ONBOARDING, onboardingData)
    );

    if (error) {
      return {
        data: null,
        error: new Error(`Failed to complete onboarding: ${(error as any).response?.data?.message || error.message}`)
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
}

// Create singleton instance
const userService = new UserService();
export default userService;

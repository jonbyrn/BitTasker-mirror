import { BaseApiService } from '../apiService';
import { ENDPOINTS } from '../endpoints';
import type { TaskData } from '$lib/types/task';

/**
 * Recommendations Service
 * Handles fetching personalized task recommendations
 */
export class RecommendationsService extends BaseApiService {
  /**
   * Get personalized task recommendations
   * @param limit Optional number of recommendations to retrieve
   * @returns Promise containing recommended tasks with reason metadata
   */
  async getRecommendations(limit?: number): Promise<{
    recommendations: Array<{
      task: TaskData;
      reason: {
        type: 'skill_match' | 'category_preference' | 'location_based' | 'budget_range' | 'client_history';
        score: number;
        description: string;
      };
    }>;
  }> {
    const params = limit ? { limit } : {};
    const response = await this.get(ENDPOINTS.RECOMMENDATIONS.LIST, { params });
    return response.data;
  }

  /**
   * Generate fresh recommendations (forces backend recalculation)
   * @returns Promise containing newly generated recommendations
   */
  async generateFreshRecommendations(): Promise<{
    recommendations: Array<{
      task: TaskData;
      reason: {
        type: 'skill_match' | 'category_preference' | 'location_based' | 'budget_range' | 'client_history';
        score: number;
        description: string;
      };
    }>;
  }> {
    const response = await this.post(ENDPOINTS.RECOMMENDATIONS.GENERATE);
    return response.data;
  }

  /**
   * Mark recommendation as viewed for analytics and improved future recommendations
   * @param taskId The ID of the recommended task that was viewed
   * @param interactionType The type of interaction with the recommendation
   */
  async markRecommendationViewed(
    taskId: string,
    interactionType: 'viewed' | 'clicked' | 'bid_placed' | 'dismissed' | 'saved'
  ): Promise<void> {
    await this.post(ENDPOINTS.RECOMMENDATIONS.MARK_VIEWED, {
      taskId,
      interactionType
    });
  }
  
  /**
   * Provide explicit feedback on a recommendation to improve future results
   * @param taskId The ID of the recommended task
   * @param isRelevant Whether the recommendation was relevant
   * @param feedback Optional text feedback about the recommendation
   */
  async provideFeedback(
    taskId: string,
    isRelevant: boolean,
    feedback?: string
  ): Promise<void> {
    await this.post(ENDPOINTS.RECOMMENDATIONS.FEEDBACK, {
      taskId,
      isRelevant,
      feedback
    });
  }
}

// Create singleton instance
const recommendationsService = new RecommendationsService();
export default recommendationsService;

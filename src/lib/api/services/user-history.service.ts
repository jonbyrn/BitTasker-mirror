import { BaseApiService } from '../apiService';
import { ENDPOINTS } from '../endpoints';
import type { TaskData } from '$lib/types/task';

/**
 * User History Service
 * Tracks user interactions with tasks and provides analytics
 * for personalized recommendations
 */
export class UserHistoryService extends BaseApiService {
  /**
   * Get recently viewed tasks
   * @param limit Maximum number of tasks to return
   */
  async getRecentlyViewedTasks(limit = 10): Promise<TaskData[]> {
    const response = await this.get(ENDPOINTS.USER_HISTORY.RECENTLY_VIEWED, { 
      params: { limit } 
    });
    return response.data;
  }

  /**
   * Get user's task interaction statistics
   * Used for analytics and building personalized recommendations
   */
  async getTaskInteractionStats(): Promise<{
    categoryPreferences: Array<{ categoryId: number, weight: number, name: string }>;
    skillUtilization: Array<{ skillId: number, weight: number, name: string }>;
    budgetRangePreference: { min: number, max: number, currency: string };
    locationPreferences: Array<{ latitude: number, longitude: number, radius: number, weight: number }>;
    availabilityPatterns: {
      preferredDays: Array<{ day: string, weight: number }>;
      preferredTimeOfDay: Array<{ timeSlot: 'morning' | 'midday' | 'afternoon' | 'evening', weight: number }>;
    };
  }> {
    const response = await this.get(ENDPOINTS.USER_HISTORY.INTERACTION_STATS);
    return response.data;
  }

  /**
   * Record a task view event
   * @param taskId ID of the viewed task
   * @param viewDuration Optional duration of the view in seconds
   */
  async recordTaskView(taskId: string, viewDuration?: number): Promise<void> {
    await this.post(ENDPOINTS.USER_HISTORY.RECORD_VIEW, {
      taskId,
      viewDuration
    });
  }

  /**
   * Get tasks that the user has engaged with (bid on, saved, etc.)
   */
  async getEngagedTasks(): Promise<{
    bidTasks: TaskData[];
    savedTasks: TaskData[];
    viewedTasks: TaskData[];
  }> {
    const response = await this.get(ENDPOINTS.USER_HISTORY.ENGAGED_TASKS);
    return response.data;
  }
}

// Create singleton instance
const userHistoryService = new UserHistoryService();
export default userHistoryService;

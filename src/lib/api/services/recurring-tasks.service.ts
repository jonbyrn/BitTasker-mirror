import type { CreateRecurringTaskParams, TaskTemplate } from '$lib/types/recurring-tasks';
import { ENDPOINTS } from '../endpoints';
import { BaseApiService } from '../apiService';

/**
 * Recurring Tasks Service
 * 
 * Handles API interactions for task templates in BitTasker
 */
class RecurringTasksService extends BaseApiService {
  /**
   * Get all task templates for the current user
   */
  async getTemplates(): Promise<TaskTemplate[]> {
    try {
      const response = await this.get<TaskTemplate[]>(ENDPOINTS.TASK_TEMPLATES.GET);
      return response.data;
    } catch (error) {
      console.error('Error fetching task templates:', error);
      throw error;
    }
  }

  /**
   * Get a single task template by ID
   */
  async getTemplateById(id: string): Promise<TaskTemplate> {
    try {
      const response = await this.get<TaskTemplate>(ENDPOINTS.TASK_TEMPLATES.GET_BY_ID(id));
      return response.data;
    } catch (error) {
      console.error(`Error fetching task template with ID ${id}:`, error);
      throw error;
    }
  }

  /**
   * Create a new task template
   */
  async createTemplate(template: CreateRecurringTaskParams): Promise<TaskTemplate> {
    try {
      const response = await this.post<TaskTemplate>(ENDPOINTS.TASK_TEMPLATES.POST, template);
      return response.data;
    } catch (error) {
      console.error('Error creating task template:', error);
      throw error;
    }
  }

  /**
   * Create a task template from an existing task
   */
  async createTemplateFromTask(taskId: string, recurrencePattern: TaskTemplate['recurrencePattern']): Promise<TaskTemplate> {
    try {
      const response = await this.post<TaskTemplate>(`${ENDPOINTS.TASK_TEMPLATES.POST}/from-task/${taskId}`, { recurrencePattern });
      return response.data;
    } catch (error) {
      console.error(`Error creating template from task ${taskId}:`, error);
      throw error;
    }
  }

  /**
   * Update an existing task template
   */
  async updateTemplate(id: string, template: Partial<TaskTemplate>): Promise<TaskTemplate> {
    try {
      const response = await this.put<TaskTemplate>(ENDPOINTS.TASK_TEMPLATES.UPDATE(id), template);
      return response.data;
    } catch (error) {
      console.error(`Error updating task template with ID ${id}:`, error);
      throw error;
    }
  }

  /**
   * Pause a task template (no new tasks will be generated)
   */
  async pauseTemplate(id: string): Promise<TaskTemplate> {
    try {
      const response = await this.patch<TaskTemplate>(ENDPOINTS.TASK_TEMPLATES.UPDATE(id), { 
        status: 'PAUSED' 
      });
      return response.data;
    } catch (error) {
      console.error(`Error pausing task template with ID ${id}:`, error);
      throw error;
    }
  }

  /**
   * Resume a paused task template
   */
  async resumeTemplate(id: string): Promise<TaskTemplate> {
    try {
      const response = await this.patch<TaskTemplate>(ENDPOINTS.TASK_TEMPLATES.UPDATE(id), { 
        status: 'ACTIVE' 
      });
      return response.data;
    } catch (error) {
      console.error(`Error resuming task template with ID ${id}:`, error);
      throw error;
    }
  }

  /**
   * Delete a task template
   */
  async deleteTemplate(id: string): Promise<void> {
    try {
      const response = await this.delete(ENDPOINTS.TASK_TEMPLATES.DELETE(id));
      return response.data;
    } catch (error) {
      console.error(`Error deleting task template with ID ${id}:`, error);
      throw error;
    }
  }

  /**
   * Calculate the next generation dates for a template
   * Provides a preview of when tasks will be generated
   */
  async getGenerationPreview(templateData: Partial<TaskTemplate>): Promise<string[]> {
    try {
      const response = await this.post<string[]>(`${ENDPOINTS.TASK_TEMPLATES.POST}/preview`, templateData);
      return response.data;
    } catch (error) {
      console.error('Error generating preview dates:', error);
      throw error;
    }
  }
}

export default new RecurringTasksService();

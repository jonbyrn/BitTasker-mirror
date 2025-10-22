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
		const response = await this.get<TaskTemplate[]>(ENDPOINTS.TASK_TEMPLATES.GET);
		return response.data;
	}

	/**
	 * Get a single task template by ID
	 */
	async getTemplateById(id: string): Promise<TaskTemplate> {
		const response = await this.get<TaskTemplate>(ENDPOINTS.TASK_TEMPLATES.GET_BY_ID(id));
		return response.data;
	}

	/**
	 * Create a new task template
	 */
	async createTemplate(template: CreateRecurringTaskParams): Promise<TaskTemplate> {
		const response = await this.post<TaskTemplate>(ENDPOINTS.TASK_TEMPLATES.POST, template);
		return response.data;
	}

	/**
	 * Create a task template from an existing task
	 */
	async createTemplateFromTask(
		taskId: string,
		recurrencePattern: TaskTemplate['recurrencePattern']
	): Promise<TaskTemplate> {
		const response = await this.post<TaskTemplate>(
			`${ENDPOINTS.TASK_TEMPLATES.POST}/from-task/${taskId}`,
			{ recurrencePattern }
		);
		return response.data;
	}

	/**
	 * Update an existing task template
	 */
	async updateTemplate(id: string, template: Partial<TaskTemplate>): Promise<TaskTemplate> {
		const response = await this.put<TaskTemplate>(ENDPOINTS.TASK_TEMPLATES.UPDATE(id), template);
		return response.data;
	}

	/**
	 * Pause a task template (no new tasks will be generated)
	 */
	async pauseTemplate(id: string): Promise<TaskTemplate> {
		const response = await this.patch<TaskTemplate>(ENDPOINTS.TASK_TEMPLATES.UPDATE(id), {
			status: 'PAUSED'
		});
		return response.data;
	}

	/**
	 * Resume a paused task template
	 */
	async resumeTemplate(id: string): Promise<TaskTemplate> {
		const response = await this.patch<TaskTemplate>(ENDPOINTS.TASK_TEMPLATES.UPDATE(id), {
			status: 'ACTIVE'
		});
		return response.data;
	}

	/**
	 * Delete a task template
	 */
	async deleteTemplate(id: string): Promise<void> {
		const response = await this.delete(ENDPOINTS.TASK_TEMPLATES.DELETE(id));
		return response.data;
	}
}

export default new RecurringTasksService();

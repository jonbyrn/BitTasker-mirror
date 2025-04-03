import type {
	Task,
	GetTasksParams,
	TaskResponse,
	SearchTasksParams,
	SearchTaskResponse
} from '$lib/types/task.d';
import type { TaskStatusEnum } from '$lib/utils/enums/task.enum';
import { BaseApiService } from '../apiService';
import { ENDPOINTS } from '../endpoints';

/**
 * Task Service
 * Handles task creation, retrieval, updates, and management
 */
export class TaskService extends BaseApiService {
	/**
	 * Create a new task
	 * @param task The task data to create
	 * @returns Promise containing the created task
	 * @throws Error if task creation fails
	 */
	async createTask(task: Partial<Task>): Promise<Task> {
		const response = await this.post<Task>(ENDPOINTS.TASKS.CREATE, task);
		return response.data;
	}

	/**
	 * Get all tasks with optional filtering parameters
	 * @param params Optional parameters for filtering tasks
	 * @returns Promise containing tasks and pagination data
	 * @throws Error if retrieving tasks fails
	 */
	async getAllTasks(params: GetTasksParams = {}): Promise<TaskResponse> {
		const response = await this.get<TaskResponse>(ENDPOINTS.TASKS.LIST, { params });
		return response.data;
	}

	/**
	 * Get tasks created by the current authenticated user
	 * @returns Promise containing an array of user tasks
	 * @throws Error if retrieving user tasks fails
	 */
	async getMyTasks(): Promise<Task[]> {
		const response = await this.get<Task[]>(ENDPOINTS.TASKS.MYTASKS);
		return response.data;
	}

	/**
	 * Get a task by its ID
	 * @param id The ID of the task to retrieve
	 * @returns Promise containing the task data
	 * @throws Error if task not found or retrieval fails
	 */
	async getTaskById(id: string): Promise<Task> {
		const response = await this.get<Task>(ENDPOINTS.TASKS.DETAILS(id));
		return response.data;
	}

	/**
	 * Update an existing task
	 * @param id The ID of the task to update
	 * @param task The updated task data
	 * @returns Promise containing the updated task
	 * @throws Error if task update fails
	 */
	async updateTask(id: string, task: Partial<Task>): Promise<Task> {
		const response = await this.put<Task>(ENDPOINTS.TASKS.UPDATE(id), task);
		return response.data;
	}

	/**
	 * Delete a task by its ID
	 * @param id The ID of the task to delete
	 * @returns Promise that resolves when deletion is successful
	 * @throws Error if task deletion fails
	 */
	async deleteTask(id: string): Promise<void> {
		await this.delete(ENDPOINTS.TASKS.DELETE(id));
	}

	/**
	 * Update the status of a task
	 * @param id The ID of the task to update
	 * @param status The new status for the task
	 * @returns Promise containing the updated task
	 * @throws Error if status update fails
	 */
	async updateTaskStatus(id: string, status: TaskStatusEnum): Promise<Task> {
		const response = await this.put<Task>(ENDPOINTS.TASKS.STATUS(id), { status });
		return response.data;
	}

	/**
	 * Search for tasks with optional search parameters
	 * @param params Optional parameters for searching tasks
	 * @returns Promise containing search results and pagination data
	 * @throws Error if search fails
	 */
	async searchTasks(params: SearchTasksParams = {}): Promise<SearchTaskResponse> {
		const response = await this.get<SearchTaskResponse>(ENDPOINTS.TASKS.SEARCH, { params });
		return response.data;
	}
}

// Create singleton instance
const taskService = new TaskService();
export default taskService;

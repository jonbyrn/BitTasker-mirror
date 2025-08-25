import type { Task, TaskResponse, SearchTasksParams, TaskBody } from '$lib/types/task.d';
import type { TaskStatusEnum } from '$lib/utils/enums/task.enum';
import { EnhancedBaseApiService, type EnhancedApiResponse } from '../enhancedBaseApiService';
import { ENDPOINTS } from '../endpoints';

/**
 * Enhanced Task Service with Offline Support
 * Handles task creation, retrieval, updates, and management with offline capabilities
 */
export class EnhancedTaskService extends EnhancedBaseApiService {
	/**
	 * Create a new task with offline queue support
	 * @param task The task data to create
	 * @returns Promise containing the created task or queue information
	 */
	async createTask(task: Partial<TaskBody>): Promise<EnhancedApiResponse<Task>> {
		const response = await this.post<Task>(ENDPOINTS.TASKS.CREATE, task);
		
		// If offline, queue for sync
		if (response.offline) {
			console.log('📱 Task creation queued for offline sync');
		}
		
		return response;
	}

	/**
	 * Search for tasks with optional search parameters and offline cache support
	 * @param params Optional parameters for searching tasks
	 * @returns Promise containing search results and pagination data
	 */
	async getAllTasks(params: SearchTasksParams = {}): Promise<EnhancedApiResponse<TaskResponse>> {
		const response = await this.get<TaskResponse>(ENDPOINTS.TASKS.LIST, { params });
		
		// Log cache status
		if (response.cached) {
			console.log('📦 Tasks served from cache');
		}
		
		return response;
	}

	/**
	 * Get tasks created by the current authenticated user with offline cache support
	 * @returns Promise containing an array of user tasks
	 */
	async getMyTasks(): Promise<EnhancedApiResponse<Task[]>> {
		const response = await this.get<Task[]>(ENDPOINTS.TASKS.MYTASKS);
		
		// Log cache status
		if (response.cached) {
			console.log('📦 My tasks served from cache');
		}
		
		return response;
	}

	/**
	 * Get a task by its ID with offline cache support
	 * @param id The ID of the task to retrieve
	 * @returns Promise containing the task data
	 */
	async getTaskById(id: string): Promise<EnhancedApiResponse<Task>> {
		const response = await this.get<Task>(ENDPOINTS.TASKS.DETAILS(id));
		
		// Log cache status
		if (response.cached) {
			console.log(`📦 Task ${id} served from cache`);
		}
		
		return response;
	}

	/**
	 * Update an existing task with offline queue support
	 * @param id The ID of the task to update
	 * @param task The updated task data
	 * @returns Promise containing the updated task or queue information
	 */
	async updateTask(id: string, task: Partial<Task>): Promise<EnhancedApiResponse<Task>> {
		const response = await this.put<Task>(ENDPOINTS.TASKS.UPDATE(id), task);
		
		// If offline, queue for sync
		if (response.offline) {
			console.log(`📱 Task ${id} update queued for offline sync`);
		}
		
		return response;
	}

	/**
	 * Delete a task by its ID with offline queue support
	 * @param id The ID of the task to delete
	 * @returns Promise that resolves when deletion is successful or queued
	 */
	async deleteTask(id: string): Promise<EnhancedApiResponse<void>> {
		const response = await this.delete<void>(ENDPOINTS.TASKS.DELETE(id));
		
		// If offline, queue for sync
		if (response.offline) {
			console.log(`📱 Task ${id} deletion queued for offline sync`);
		}
		
		return response;
	}

	/**
	 * Update the status of a task with offline queue support
	 * @param id The ID of the task to update
	 * @param status The new status for the task
	 * @returns Promise containing the updated task or queue information
	 */
	async updateTaskStatus(id: string, status: TaskStatusEnum): Promise<EnhancedApiResponse<Task>> {
		const response = await this.put<Task>(ENDPOINTS.TASKS.STATUS(id), { status });
		
		// If offline, queue for sync
		if (response.offline) {
			console.log(`📱 Task ${id} status update queued for offline sync`);
		}
		
		return response;
	}

	/**
	 * Get offline queue status for task-related operations
	 */
	getTaskQueueStatus() {
		const queueStatus = this.getOfflineQueueStatus();
		const taskItems = queueStatus.items.filter(item => 
			item.url.includes('/tasks') || 
			item.data?.type === 'CREATE_TASK' || 
			item.data?.type === 'UPDATE_TASK'
		);
		
		return {
			...queueStatus,
			items: taskItems,
			count: taskItems.length
		};
	}

	/**
	 * Wait for connection and retry failed task operations
	 */
	async waitForConnectionAndRetry(): Promise<void> {
		if (this.isOnline()) return;

		console.log('⏳ Waiting for connection to retry task operations...');
		await this.waitForConnection();
		console.log('✅ Connection restored, retrying task operations...');
		
		// The enhanced API service will automatically retry queued operations
	}
}

// Create singleton instance
const enhancedTaskService = new EnhancedTaskService();
export default enhancedTaskService;

/**
 * Task GraphQL Service
 * 
 * Handles task operations using GraphQL queries and mutations
 * Replaces the RESTful task.service.ts with GraphQL equivalents
 */

import type {
    Task,
    TaskData,
    SearchTasksParams,
    CreateTaskParams,
    TaskResponse,
    Location,
    DateRange
} from '$lib/types/task.d';
// Import enums as values, not types
import {
    BudgetTypeEnum,
    TaskTypeEnum,
    TaskStatusEnum,
    SortByEnum,
    SortOrderEnum
} from '$lib/utils/enums/task.enum';

import { executeQuery } from '../hooks/query';
import { executeMutation } from '../hooks/mutation';

import {
    GET_TASKS,
    GET_TASK,
    GET_MY_TASKS,
    CREATE_TASK,
    UPDATE_TASK,
    DELETE_TASK,
    CHANGE_TASK_STATUS
} from '../operations/tasks';

import type {
    CreateTaskInput,
    UpdateTaskInput,
    LocationInput,
    DateRangeInput,
    AttachmentInput
} from '../generated';

// Import these as values, not types
import {
    TaskStatus,
    BudgetType,
    TaskType,
    TaskVisibility,
} from '../generated';

// Type mapping helpers for converting between our app types and GraphQL types
const mapBudgetType = (budgetType: BudgetTypeEnum): BudgetType => {
    if (budgetType === BudgetTypeEnum.FIXED) return BudgetType.Fixed;
    if (budgetType === BudgetTypeEnum.HOURLY) return BudgetType.Hourly;
    return BudgetType.Fixed; // Default
};

const mapTaskType = (taskType: TaskTypeEnum): TaskType => {
    if (taskType === TaskTypeEnum.REMOTE) return TaskType.Remote;
    if (taskType === TaskTypeEnum.IN_PERSON) return TaskType.InPerson;
    return TaskType.Remote; // Default
};

const mapTaskStatus = (status: TaskStatusEnum): TaskStatus => {
    switch (status) {
        case TaskStatusEnum.DRAFT: return TaskStatus.Draft;
        case TaskStatusEnum.OPEN: return TaskStatus.Open;
        case TaskStatusEnum.IN_PROGRESS: return TaskStatus.InProgress;
        case TaskStatusEnum.COMPLETED: return TaskStatus.Completed;
        case TaskStatusEnum.CANCELLED: return TaskStatus.Cancelled;
        case TaskStatusEnum.DISPUTED: return TaskStatus.Disputed;
        default: return TaskStatus.Open; // Default
    }
};

// Map Location to GraphQL LocationInput
const mapLocation = (location: Location): LocationInput => {
    return {
        displayName: location.displayName,
        longitude: location.longitude || 0,
        latitude: location.latitude || 0,
        zipCode: location.zipCode,
        locationLoaded: location.locationLoaded,
    };
};

// Map DateRange to GraphQL DateRangeInput
const mapDateRange = (dateRange: DateRange): DateRangeInput => {
    return {
        start: dateRange.start,
        end: dateRange.end
    };
};

// Map attachments to GraphQL AttachmentInput
const mapAttachments = (attachments: { fileName: string; fileUrl: string, fileSize: number }[]): AttachmentInput[] => {
    return attachments.map(attachment => ({
        fileName: attachment.fileName,
        fileUrl: attachment.fileUrl,
        fileSize: attachment.fileSize
    }));
};

/**
 * Task GraphQL Service
 * Handles task creation, retrieval, updates, and management via GraphQL
 */
class TaskService {
    /**
     * Create a new task
     * @param task The task data to create
     * @returns Promise containing the created task
     * @throws Error if task creation fails
     */
    async createTask(task: Partial<CreateTaskParams>): Promise<Task> {
        // Convert REST parameters to GraphQL input format
        const input: CreateTaskInput = {
            title: task.title!,
            description: task.description!,
            // Map budget fields
            budget: task.budget,
            budgetType: task.budgetType ? mapBudgetType(task.budgetType) : undefined,
            // Map task type
            taskType: task.taskType ? mapTaskType(task.taskType) : undefined,
            // Other fields
            deadlineDate: task.deadlineDate,
            estimatedHours: task.estimatedHours,
            // Category and skills IDs
            categoryIds: task.categoryIds,
            skillIds: task.skillIds,
            // Location data
            pickupLocation: task.pickupLocation ? mapLocation(task.pickupLocation) : undefined,
            dropOffLocation: task.dropOffLocation ? mapLocation(task.dropOffLocation) : undefined,
            // Date range
            dateRange: task.dateRange ? mapDateRange(task.dateRange) : undefined,
            // Attachments 
            attachments: task.attachments ? mapAttachments(task.attachments) : undefined,
            // Default visibility
            visibility: TaskVisibility.Public
        };

        const result = await executeMutation(CREATE_TASK, { input });

        if (result.error) {
            throw result.error;
        }

        return result.data?.createTask as Task;
    }

    /**
     * Search for tasks with optional search parameters
     * @param params Optional parameters for searching tasks
     * @returns Promise containing search results and pagination data
     * @throws Error if search fails
     */
    async getAllTasks(params: SearchTasksParams = {}): Promise<TaskResponse> {
        // Convert REST parameters to GraphQL variables
        const variables = {
            page: params.page || 1,
            limit: params.limit || 10,
            searchTerm: params.searchTerm,
            categoryId: params.categoryId,
            skillId: params.skillId,
            status: params.status,
            taskType: params.taskType
                ? mapTaskType(params.taskType)
                : undefined,
            minBudget: params.minBudget,
            maxBudget: params.maxBudget,
            includeDeleted: params.includeDeleted || false
        };

        const result = await executeQuery(GET_TASKS, variables);

        if (result.error) {
            throw result.error;
        }

        // Transform GraphQL response to match expected TaskResponse format
        const taskItems = result.data?.tasks.items || [];
        const taskMeta = result.data?.tasks.meta || {};

        return {
            data: taskItems as TaskData[],
            pagination: {
                total: taskMeta.totalItems || 0,
                page: taskMeta.currentPage || 1,
                limit: taskMeta.itemsPerPage || 10,
                totalPages: taskMeta.totalPages || 1,
                hasNextPage: taskMeta.currentPage < taskMeta.totalPages,
                hasPreviousPage: taskMeta.currentPage > 1
            }
        };
    }

    /**
     * Get tasks created by the current authenticated user
     * @returns Promise containing an array of user tasks
     * @throws Error if retrieving user tasks fails
     */
    async getMyTasks(): Promise<Task[]> {
        const result = await executeQuery(GET_MY_TASKS);

        if (result.error) {
            throw result.error;
        }

        return result.data?.myTasks as Task[];
    }

    /**
     * Get a task by its ID
     * @param id The ID of the task to retrieve
     * @returns Promise containing the task data
     * @throws Error if task not found or retrieval fails
     */
    async getTaskById(id: string): Promise<Task> {
        // GraphQL expects integer ID
        const numericId = parseInt(id, 10);

        const result = await executeQuery(GET_TASK, { id: numericId });

        if (result.error) {
            throw result.error;
        }

        return result.data?.task as Task;
    }

    /**
     * Update an existing task
     * @param id The ID of the task to update
     * @param task The updated task data
     * @returns Promise containing the updated task
     * @throws Error if task update fails
     */
    async updateTask(id: string, task: Partial<Task>): Promise<Task> {
        // GraphQL expects integer ID
        const numericId = parseInt(id, 10);

        // Convert REST parameters to GraphQL input format
        const input: UpdateTaskInput = {
            title: task.title,
            description: task.description,
            budget: task.budget,
            budgetType: task.budgetType ? mapBudgetType(task.budgetType) : undefined,
            taskType: task.taskType ? mapTaskType(task.taskType) : undefined,
            deadlineDate: task.deadlineDate || undefined,
            status: task.status ? mapTaskStatus(task.status) : undefined,
            estimatedHours: task.estimatedHours,
            // Add other fields as needed
            pickupLocation: task.pickupLocation ? mapLocation(task.pickupLocation) : undefined,
            dropOffLocation: task.dropOffLocation ? mapLocation(task.dropOffLocation) : undefined,
            dateRange: task.dateRange ? mapDateRange(task.dateRange) : undefined,
            isRemovals: task.isRemovals,
            // Attachments if available
            attachments: task.attachments ? mapAttachments(task.attachments) : undefined,
        };

        const result = await executeMutation(UPDATE_TASK, { id: numericId, input });

        if (result.error) {
            throw result.error;
        }

        return result.data?.updateTask as Task;
    }

    /**
     * Delete a task by its ID
     * @param id The ID of the task to delete
     * @returns Promise that resolves when deletion is successful
     * @throws Error if task deletion fails
     */
    async deleteTask(id: string): Promise<void> {
        // GraphQL expects integer ID
        const numericId = parseInt(id, 10);

        const result = await executeMutation(DELETE_TASK, { id: numericId });

        if (result.error) {
            throw result.error;
        }

        // GraphQL returns boolean for successful deletion
        const success = result.data?.deleteTask;

        if (!success) {
            throw new Error('Failed to delete task');
        }
    }

    /**
     * Update the status of a task
     * @param id The ID of the task to update
     * @param status The new status for the task
     * @returns Promise containing the updated task
     * @throws Error if status update fails
     */
    async updateTaskStatus(id: string, status: TaskStatusEnum): Promise<Task> {
        const result = await executeMutation(CHANGE_TASK_STATUS, {
            taskId: id,
            status: mapTaskStatus(status)
        });

        if (result.error) {
            throw result.error;
        }

        return result.data?.changeTaskStatus as Task;
    }
}

// Create singleton instance
const taskService = new TaskService();
export default taskService; 
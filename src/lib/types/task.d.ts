import { BudgetTypeEnum, TaskTypeEnum, TaskStatusEnum } from '$lib/utils/enums/task.enum';

export interface Location {
	displayName: string;
	longitude: number | null;
	latitude: number | null;
	zipCode: string;
	locationLoaded: boolean;
}

export interface DateRange {
	start: string;
	end: string;
}

export interface CreateTaskParams {
	title: string;
	description: string;
	budget: number;
	budgetType: BudgetTypeEnum;
	taskType: TaskTypeEnum;
	deadline: string;
	estimatedHours?: number;
	categoryIds: number[];
	skillIds: number[];
	pickupLocation?: Location;
	dropOffLocation?: Location;
	dateRange?: DateRange;
}

export interface Task extends CreateTaskParams {
	id: string;
	status: TaskStatusEnum;
	client: {
		id: number;
		user: {
			id: number;
			name: string;
		};
	};
	skills: Array<{
		id: number;
		name: string;
	}>;
	createdAt: string;
	updatedAt: string;
}

export interface GetTasksParams {
	status?: TaskStatusEnum[];
	categoryId?: number;
	skillId?: number;
	taskType?: TaskTypeEnum;
	searchTerm?: string;
	minBudget?: number;
	maxBudget?: number;
	includeDeleted?: boolean;
	page?: number;
	limit?: number;
}

export interface SearchTasksParams extends GetTasksParams {
	budgetType?: BudgetTypeEnum;
	categoryIds?: number[];
	skills?: number[];
	location?: string;
	radius?: number;
	sortField?: 'createdAt' | 'updatedAt' | 'budget' | 'deadline' | 'title';
	sortOrder?: 'asc' | 'desc';
}

export interface TaskResponse {
	data: Task[];
	meta: {
		total: number;
		page: number;
		limit: number;
		totalPages: number;
		hasNextPage: boolean;
		hasPreviousPage: boolean;
	};
}

export interface SearchTaskResponse {
	items: Task[];
	meta: {
		totalItems: number;
		currentPage: number;
		itemsPerPage: number;
		totalPages: number;
		hasNextPage: boolean;
		hasPreviousPage: boolean;
	};
}

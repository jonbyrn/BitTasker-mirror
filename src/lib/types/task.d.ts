import type { TaskBid } from './bid';
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

export interface Task {
	id: number;
	clientId: number;
	title: string;
	description: string;
	budget: number;
	budgetType: BudgetTypeEnum;
	currency?: string;
	status: TaskStatusEnum;
	taskType: TaskTypeEnum;
	isRemovals: boolean;
	isOwner?: boolean;
	deadlineDate: string | null;
	estimatedHours: number;
	dateRange: DateRange | null;
	pickupLocation: Location | null;
	dropOffLocation: Location | null;
	isBoosted: boolean;
	boostPercentage: number | null;
	createdAt: string;
	updatedAt: string;
	completedAt: string | null;
	cancelledAt: string | null;
	deletedAt: string | null;
	isDeleted: boolean;
	attachments?: {
		images?: string[];
	};
	categories: Array<{
		id: number;
		taskId: number;
		categoryId: number;
		isPrimary: boolean;
		createdAt: string;
		category: {
			id: number;
			name: string;
			description: string;
			icon: string;
			slug: string;
			parentId: number;
			isActive: boolean;
			displayOrder: number;
			createdAt: string;
			updatedAt: string;
			deletedAt: string | null;
			isDeleted: boolean;
		};
	}>;
	requiredSkills: Array<{
		id: number;
		taskId: number;
		skillId: number;
		importance: string;
		experienceLevel: string | null;
		notes: string | null;
		createdAt: string;
		skill: {
			id: number;
			name: string;
			description: string;
			categoryId: number;
			isVerifiable: boolean;
			createdAt: string;
			updatedAt: string;
			deletedAt: string | null;
			isDeleted: boolean;
		};
	}>;
	bids: TaskBid[];
}

export interface SearchTasksParams {
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
	budgetType?: BudgetTypeEnum;
	categoryIds?: number[];
	skills?: number[];
	location?: string;
	radius?: number;
	sortBy?: 'createdAt' | 'updatedAt' | 'budget' | 'deadline' | 'title';
	sortOrder?: 'asc' | 'desc';
}

export interface TaskData extends Task {
	visibility: 'PUBLIC';
	isTemplated: false;
	templateId: null;
	isFromRecurring: false;
	boostAmount: null;
	boostEndDate: null;
	client: {
		id: number;
		userId: number;
		tasksCompleted: number;
		tasksPosted: number;
		averageRating: number | null;
		level: number;
		experiencePoints: number;
		verificationLevel: string;
		createdAt: string;
		updatedAt: string;
		user?: {
			id: number;
			email: string;
		};
	};
	freelancerAssignments?: any[];
	bids?: any[];
}

export interface TaskResponse {
	data: TaskData[];
	pagination: {
		total: number;
		page: number;
		limit: number;
		totalPages: number;
		hasNextPage: boolean;
		hasPreviousPage: boolean;
	};
}

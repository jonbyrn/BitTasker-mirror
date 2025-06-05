import type { TaskBid } from './bid';
import {
	BudgetTypeEnum,
	TaskTypeEnum,
	TaskStatusEnum,
	SortByEnum,
	SortOrderEnum
} from '$lib/utils/enums/task.enum';

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

export interface Budget {
	amount: number;
	currency: string;
	type: BudgetTypeEnum;
	estimatedHours?: number;
}

export interface Attachment {
	url: string;
	key: string;
	type: string;
	alt: string;
	size: number;
}

export interface TaskBody {
	title: string;
	taskType: TaskTypeEnum;
	description: string;
	budget: Budget;
	deadline?: string;
	dateRange?: DateRange;
	pickupLocation?: Location;
	dropOffLocation?: Location;
	skills: string[];
	categoryIds: string[];
	attachments?: Attachment[];
}

export interface Task {
	id: string;
	title: string;
	taskType: TaskTypeEnum;
	description: string;
	budget: Budget;
	status: TaskStatusEnum;
	isRemovals: boolean;
	deadline: string | null;
	dateRange: DateRange | null;
	pickupLocation: Location | null;
	dropOffLocation: Location | null;
	isBoosted: boolean;
	boostPercentage: number | null;
	attachments?: Attachment[];
	
	createdAt: string;
	updatedAt: string;
	completedAt: string | null;
	cancelledAt: string | null;
	deletedAt: string | null;
	
	isDeleted: boolean;
	categories: Array<string>;
	requiredSkills: Array<string>;
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
	skillIds?: number[];
	location?: string;
	radius?: number;
	deadlineBefore?: string;
	deadlineAfter?: string;
	dateRange?: DateRange;
	sortBy?: SortByEnum;
	sortOrder?: SortOrderEnum;
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

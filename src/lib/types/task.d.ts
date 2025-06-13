import type { TaskBid } from './bid';
import type { Event as NostrEvent } from 'nostr-tools';
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
	categories: string[];
	attachments?: Attachment[];
}

export interface Task {
	id: string;
	npub: string;
	status: TaskStatusEnum;
	title: string;
	taskType: TaskTypeEnum;
	description: string;
	budget: Budget;
	deadline: string | null;
	dateRange: DateRange | null;
	pickupLocation: Location | null;
	dropOffLocation: Location | null;
	skills: string[];
	categories: string[];
	attachments?: Attachment[];

	isRemovals: boolean;
	isBoosted: boolean;
	boostPercentage: number | null;

	createdAt: string;
	updatedAt: string;
	completedAt: string | null;
	cancelledAt: string | null;
	deletedAt: string | null;

	isDeleted: boolean;
	requiredSkills: string[];
	creator?: {
		username: string;
		avatar: string;
	};

	bids?: TaskBid[];
}

export interface SearchTasksParams {
	status?: TaskStatusEnum[];
	taskType?: TaskTypeEnum;
	page?: number;
	limit?: number;
	categories?: string[];
	skills?: string[];
	location?: string;
	radius?: number;
	deadline?: string;
	dateRange?: DateRange;
	sortBy?: SortByEnum;
	sortOrder?: SortOrderEnum;

	budget?: {
		tier?: string;
		currency?: string;
		type?: BudgetTypeEnum;
	};

	// Nostr-specific fields
	since?: number;
	until?: number;
	kinds?: number[];
	search?: string; // NIP-50 search term
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

// Nostr-specific interfaces
export interface NostrTaskMetadata {
	uniqueId: string;
	createdAt: number;
	updatedAt?: number;
	deletedAt?: number;
	pow: [string, string];
}

export interface NostrTaskEvent extends NostrEvent {
	content: string; // JSON stringified TaskBody & NostrTaskMetadata
	tags: string[][];
}

export interface SavedSearch {
	id: string;
	name: string;
	params: SearchTasksParams;
	createdAt: number;
	updatedAt: number;
	notifyOnNew?: boolean;
}

export interface TaskRecommendation {
	taskId: string;
	score: number;
	reason: string;
	matchedSkills?: string[];
	matchedCategories?: string[];
}

export interface RecommendationParams {
	skills?: string[];
	categories?: string[];
	preferredBudgetRange?: {
		min: number;
		max: number;
	};
	preferredLocations?: string[];
	limit?: number;
}

export interface NostrSearchResult {
	tasks: Task[];
	total: number;
	hasMore: boolean;
	cursor?: string;
}

// Add Nostr-specific types
export interface NostrFilter {
	ids?: string[];
	authors?: string[];
	kinds?: number[];
	since?: number;
	until?: number;
	limit?: number;
	search?: string;  // NIP-50 search
	[key: string]: string[] | number[] | string | number | undefined;  // Allow for custom filter attributes
}

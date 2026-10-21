import type { TaskBid } from './bid';
import type { Event as NostrEvent } from 'nostr-tools';
import { BudgetTypeEnum, TaskTypeEnum, TaskStatusEnum } from '$lib/utils/enums/task.enum';

export interface Location {
	displayName: string;
	longitude: number | null;
	latitude: number | null;
	zipCode: string;
	locationLoaded: boolean;
	// Full address details for exact location sharing
	formattedAddress?: string; // Full formatted address from Google Maps
	placeId?: string; // Google Maps Place ID for precise location
	addressComponents?: {
		streetNumber?: string;
		street?: string; // route
		neighborhood?: string;
		sublocality?: string;
		city?: string; // locality
		state?: string; // administrative_area_level_1
		country?: string;
		postalCode?: string;
	};
}

export interface Category {
	id: string;
	name: string;
	slug: string;
	description: string;
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
	hourlyRate?: number;
}

export interface Attachment {
	url: string;
	key: string;
	type: string;
	alt: string;
	size: number;
	cloudflareId?: string;
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
	categories: Category[];
	/** Search taxonomy id, chosen on create. Older tasks omit this. */
	searchCategory?: string;
	/** Search subcategory id, chosen on create. */
	searchSubcategory?: string;
	attachments?: Attachment[];
	status?: TaskStatusEnum;
	translations?: TaskTranslations; // Translations for all supported languages
}

export interface Task {
	estimatedHours: number;
	id: string;
	/** Nostr event id of the task creation event. Required to publish a bid. */
	eventId?: string;
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
	categories: Category[];
	searchCategory?: string;
	searchSubcategory?: string;
	attachments?: Attachment[];

	isRemovals: boolean;
	isBoosted: boolean;
	boostPercentage: number | null;

	createdAt: number;
	updatedAt: string;
	completedAt: string | null;
	cancelledAt: string | null;
	deletedAt: string | null;

	isDeleted: boolean;
	requiredSkills: string[];
	creator?: {
		username: string;
		avatar: string;
		rating?: number;
	};

	bids?: TaskBid[];
	translations?: TaskTranslations; // Translations for all supported languages
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
	locationCoords?: { latitude: number; longitude: number };
	deadline?: string;
	dateRange?: DateRange;

	budget?: {
		tier?: string;
		currency?: string;
		type?: BudgetTypeEnum;
	};

	// Enhanced search options
	search?: string; // Búsqueda general (título + descripción + skills)
	searchFields?: string[]; // ['title', 'description', 'skills'] - campos específicos
	searchMode?: 'exact' | 'partial' | 'fuzzy'; // Modo de búsqueda

	// Advanced filters
	minBudget?: number; // Presupuesto mínimo
	maxBudget?: number; // Presupuesto máximo
	experienceLevel?: string; // Nivel de experiencia requerido

	// Sorting
	sortBy?: 'relevance' | 'date' | 'budget' | 'deadline';
	sortOrder?: 'asc' | 'desc';

	// Nostr-specific fields
	since?: number; // Unix timestamp in seconds
	until?: number; // Unix timestamp in seconds
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
	freelancerAssignments?: FreelancerAssignment[];
	bids?: TaskBid[];
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
	notifyOnMatch?: boolean;
	isActive?: boolean;
	notificationFrequency?: string; // 'INSTANT' | 'DAILY' | 'WEEKLY'
	unreadNotifications?: number;
}

export interface TaskRecommendation {
	taskId: string;
	task: Task;
	score: number;
	reason: string;
	matchedSkills?: string[];
	matchedCategories?: string[];
}

export interface RecommendationParams {
	skills?: string[];
	categories?: string[];
	preferredBudget?: {
		tier?: string;
		currency?: string;
		type?: string;
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
	search?: string; // NIP-50 search
	[key: string]: string[] | number[] | string | number | undefined; // Allow for custom filter attributes
}

// Translation-related interfaces
export interface TaskTranslation {
	taskId: string;
	originalTitle: string;
	translatedTitle: string;
	originalDescription: string;
	translatedDescription: string;
	targetLanguage: string;
	sourceLanguage: string | undefined;
	timestamp: number;
}

// Translations stored in task
export interface TaskTranslations {
	sourceLanguage: string; // Language of the original content
	translations: {
		[language: string]: {
			title: string;
			description: string;
		};
	};
}

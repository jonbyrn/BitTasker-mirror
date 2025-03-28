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

export interface Task {
  title: string;
  description: string;
  budget: number;
  budgetType: 'FIXED' | 'HOURLY';
  taskType: 'REMOTE' | 'IN_PERSON';
  deadline: string;
  estimatedHours?: number;
  categoryIds: number[];
  skillIds: number[];
  pickupLocation?: Location;
  dropOffLocation?: Location;
  dateRange?: DateRange;
}

export type TaskStep = 'basics' | 'location' | 'budget';

/* export enum BudgetType {
  FIXED = 'FIXED',
  HOURLY = 'HOURLY'
}

export enum Step {
  BASICS = 'basics',
  TIMING = 'timing',
  LOCATION = 'location',
  DETAILS = 'details',
  BUDGET = 'budget'
} */

export type TaskStatus = 'draft' | 'open' | 'assigned' | 'in_progress' | 'completed' | 'cancelled';

export type TaskType = 'REMOTE' | 'IN_PERSON';

export type BudgetType = 'FIXED' | 'HOURLY';

export interface GetTasksParams {
  status?: TaskStatus[];
  categoryId?: number;
  skillId?: number;
  taskType?: TaskType;
  searchTerm?: string;
  minBudget?: number;
  maxBudget?: number;
  includeDeleted?: boolean;
  page?: number;
  limit?: number;
}

export interface SearchTasksParams extends GetTasksParams {
  budgetType?: BudgetType;
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
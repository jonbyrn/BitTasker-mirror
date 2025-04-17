export enum BudgetTypeEnum {
	FIXED = 'FIXED',
	HOURLY = 'HOURLY'
}

export enum TaskStepEnum {
	BASICS = 'basics',
	LOCATION = 'location',
	BUDGET = 'budget',
	RECURRING = 'recurring'
}

export enum TaskStatusEnum {
	DRAFT = 'DRAFT',
	OPEN = 'OPEN',
	IN_PROGRESS = 'IN_PROGRESS',
	COMPLETED = 'COMPLETED',
	CANCELLED = 'CANCELLED',
	DISPUTED = 'DISPUTED'
}

export enum TaskTypeEnum {
	REMOTE = 'REMOTE',
	IN_PERSON = 'IN_PERSON'
}

export enum SortByEnum {
	CREATED_AT = 'createdAt',
	UPDATED_AT = 'updatedAt',
	BUDGET = 'budget',
	DEADLINE = 'deadlineDate',
	TITLE = 'title'
}

export enum SortOrderEnum {
	ASC = 'asc',
	DESC = 'desc'
}

export enum NotificationFrequency {
  INSTANT = 'INSTANT',
  DAILY = 'DAILY',
  WEEKLY = 'WEEKLY'
}
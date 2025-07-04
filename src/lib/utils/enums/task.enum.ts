export enum BudgetTypeEnum {
	FIXED = 'FIXED',
	HOURLY = 'HOURLY'
}

export enum BudgetCurrencyEnum {
	BTC = 'BTC',
	USDT = 'USDt'
}

export enum TaskStepEnum {
	BASICS = 'basics',
	LOCATION = 'location',
	BUDGET = 'budget',
	REVIEW = 'review',
	RECURRING = 'recurring',
	TASKBOOST = 'taskboost'
}

export enum TaskStatusEnum {
	OPEN = 'OPEN',
	IN_PROGRESS = 'IN_PROGRESS',
	COMPLETED = 'COMPLETED',
	CANCELLED = 'CANCELLED',
	DISPUTED = 'DISPUTED'
}

export enum TaskTypeEnum {
	REMOTE = 'remote',
	IN_PERSON = 'onsite'
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

export enum RecurringFrequencyEnum {
	DAILY = 'DAILY',
	WEEKLY = 'WEEKLY',
	BIWEEKLY = 'BIWEEKLY',
	MONTHLY = 'MONTHLY',
	CUSTOM = 'CUSTOM'
}

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
	OPEN = 'OPEN', // no bids
	BID_ACCEPTED = 'BID_ACCEPTED', // tasker accepted a bid, before funding
	ESCROW_FUNDED = 'ESCROW_FUNDED', // escrow funded, ready to start
	IN_PROGRESS = 'IN_PROGRESS', // work ongoing
	RESCOPED = 'RESCOPED', // taskee proposed rescope
	RESCOPE_ACCEPTED = 'RESCOPE_ACCEPTED', // tasker accepted rescope
	COMPLETED = 'COMPLETED', // tasker sets when accepting task (releasing funds); task event is owned by tasker
	CANCELLED = 'CANCELLED', // taskee cancelled task
	REFUNDED = 'REFUNDED', // taskee refunded tasker
	DISPUTED = 'DISPUTED', // tasker opened dispute
	DISPUTE_PROPOSAL = 'DISPUTE_PROPOSAL' // proposals submitted
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

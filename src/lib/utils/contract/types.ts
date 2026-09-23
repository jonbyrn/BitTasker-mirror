export enum ContractStatus {
	Funded = 0,
	InDispute = 1,
	DisputeResolved = 2,
	DisputeUnresolved = 3,
	Completed = 4,
	Cancelled = 5,
	Refunded = 6,
	FundsReleased = 7,
	FundsClaimed = 8,
	NoShow = 9,
	WorkInProgress = 10,
	InDisputeWorkInProgress = 11
}

export enum DisplayOnlyStatus {
	InProgress = 'in_progress',
	DisputeResolutionProposed = 'dispute_resolution_proposed',
	Failed = 'failed'
}

export type ContractDisplayStatus = ContractStatus | DisplayOnlyStatus;

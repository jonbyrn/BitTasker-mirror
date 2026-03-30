export type ContractQuickActionId =
	| 'accept'
	| 'complete'
	| 'acceptProposal'
	| 'dispute'
	| 'propose'
	| 'resolveTimelock'
	| 'cancel'
	| 'delete';

export type ContractQuickActionAvailability = {
	accept?: boolean;
	complete?: boolean;
	acceptProposal?: boolean;
	dispute?: boolean;
	propose?: boolean;
	resolveTimelock?: boolean;
	cancel?: boolean;
	delete?: boolean;
	canAccept?: boolean;
	canComplete?: boolean;
	canAcceptProposal?: boolean;
	canDispute?: boolean;
	canPropose?: boolean;
	canResolveTimelock?: boolean;
	canCancel?: boolean;
	canDelete?: boolean;
};

export type ContractQuickActionLoadingState = Partial<Record<ContractQuickActionId, boolean>>;

export type ContractQuickActionVisibilityInput = {
	permissions: {
		canComplete?: boolean;
		canAccept?: boolean;
		canAcceptProposal?: boolean;
		canDispute?: boolean;
		canPropose?: boolean;
		canResolveTimelock?: boolean;
		canCancel?: boolean;
		canDelete?: boolean;
	};
	isClient?: boolean;
	isPending?: boolean;
	blockchainStatus?: string | null;
	hasDisputeProposal?: boolean;
	hasProposalsLeft?: boolean;
	isCheckingBlockchain?: boolean;
	isLoading?: ContractQuickActionLoadingState;
};

const QUICK_ACTION_PRIORITY: readonly ContractQuickActionId[] = [
	'accept',
	'complete',
	'acceptProposal',
	'dispute',
	'propose',
	'resolveTimelock',
	'cancel',
	'delete'
];

const QUICK_ACTION_PERMISSION_MAP: Record<
	ContractQuickActionId,
	keyof ContractQuickActionAvailability
> = {
	accept: 'canAccept',
	complete: 'canComplete',
	acceptProposal: 'canAcceptProposal',
	dispute: 'canDispute',
	propose: 'canPropose',
	resolveTimelock: 'canResolveTimelock',
	cancel: 'canCancel',
	delete: 'canDelete'
};

export function getPrioritizedContractQuickActions(
	availability: ContractQuickActionAvailability,
	limit: number | null = null
): ContractQuickActionId[] {
	const quickActions = QUICK_ACTION_PRIORITY.filter(
		(actionId) =>
			availability[actionId] === true ||
			availability[QUICK_ACTION_PERMISSION_MAP[actionId]] === true
	);

	if (limit == null || limit < 0) {
		return quickActions;
	}

	return quickActions.slice(0, limit);
}

export const getContractQuickActionIds = getPrioritizedContractQuickActions;

export function getContractQuickActionVisibility(
	input: ContractQuickActionVisibilityInput
): ContractQuickActionAvailability {
	const loading = input.isLoading ?? {};
	const isPending = input.isPending === true;
	const blockchainStatus = input.blockchainStatus ?? null;
	const hasDisputeProposal = input.hasDisputeProposal === true;
	const hasProposalsLeft = input.hasProposalsLeft ?? true;
	const isClient = input.isClient === true;
	const isCompleted = blockchainStatus === 'COMPLETED';
	const isCancelled = blockchainStatus === 'CANCELLED';

	return {
		canComplete:
			(input.permissions.canComplete === true && !isPending && !isCompleted && !isCancelled) ||
			loading.complete === true ||
			input.isCheckingBlockchain === true,
		canAccept: (input.permissions.canAccept === true && !isPending) || loading.accept === true,
		canAcceptProposal:
			hasDisputeProposal &&
			(input.permissions.canAcceptProposal === true || loading.acceptProposal === true),
		canDispute: (input.permissions.canDispute === true && !isPending) || loading.dispute === true,
		canPropose:
			(input.permissions.canPropose === true && hasProposalsLeft) || loading.propose === true,
		canResolveTimelock:
			input.permissions.canResolveTimelock === true || loading.resolveTimelock === true,
		canCancel:
			(input.permissions.canCancel === true &&
				!isPending &&
				!isCancelled &&
				!(isClient && isCompleted)) ||
			loading.cancel === true,
		canDelete: input.permissions.canDelete === true || loading.delete === true
	};
}

export function getVisibleContractQuickActions(
	input: ContractQuickActionVisibilityInput,
	limit: number | null = null
): ContractQuickActionId[] {
	return getPrioritizedContractQuickActions(getContractQuickActionVisibility(input), limit);
}

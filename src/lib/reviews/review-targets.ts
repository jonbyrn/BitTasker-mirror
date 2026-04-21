import type { ContractWithEvents } from '$lib/types/contract';
import type {
	ReviewContractOutcome,
	ReviewRole,
	ReviewSettlementType,
	ReviewSourcePresentation,
	ReviewSourceVisibility,
	ReviewSubjectType
} from './contracts';
import { buildReviewsUrl } from './review-route';
import {
	getReviewContractOutcome,
	getReviewEligibilityState,
	getReviewAvailabilityLabel,
	getReviewRolePair,
	getReviewSubjectType
} from './review-status';

export interface ReviewTargetSummary {
	contractId: string;
	subjectType: ReviewSubjectType;
	subjectId: string;
	settlementType: ReviewSettlementType;
	settlementId: string;
	chain: 'rsk' | 'bsc';
	asset: 'rbtc' | 'usdt';
	contractAddress: string;
	reviewerPubkey: string;
	reviewerWallet: string;
	outcome: ReviewContractOutcome | null;
	reviewerRole: ReviewRole;
	revieweeRole: ReviewRole;
	revieweePubkey: string;
	revieweeWallet: string;
	contractVersion: string;
	sourceVisibility: ReviewSourceVisibility;
	sourcePresentation: ReviewSourcePresentation | null;
	title: string;
	description: string;
	state: ReturnType<typeof getReviewEligibilityState>;
}

export interface ReviewTargetLink {
	href: string;
	label: string;
	state: ReturnType<typeof getReviewEligibilityState>;
}

function getContractId(contract: ContractWithEvents): string {
	return contract.escrowData?.id ?? contract.contractEvent.content.escrowId;
}

function getSettlementType(contract: ContractWithEvents): ReviewSettlementType {
	if (contract.contractEvent.content.contextType === 'service') {
		if (contract.contractEvent.content.purchaseMode === 'instant_buy') {
			return 'instant_buy_contract';
		}
		return 'service_quote_contract';
	}

	return 'escrow';
}

function getChainAndAsset(contract: ContractWithEvents): {
	chain: 'rsk' | 'bsc';
	asset: 'rbtc' | 'usdt';
} {
	const currency = contract.contractEvent.content.currency?.trim().toLowerCase();
	if (currency === 'usdt') {
		return { chain: 'bsc', asset: 'usdt' };
	}

	return { chain: 'rsk', asset: 'rbtc' };
}

function getSubjectId(contract: ContractWithEvents): string {
	const rawSubjectId =
		contract.contractEvent.content.contextId ??
		contract.contractEvent.content.taskId ??
		contract.contractEvent.content.serviceId ??
		contract.escrowData?.id ??
		contract.contractEvent.content.escrowId;

	return rawSubjectId;
}

function getSourcePresentation(contract: ContractWithEvents): {
	sourceVisibility: ReviewSourceVisibility;
	sourcePresentation: ReviewSourcePresentation | null;
} {
	const title =
		contract.contractEvent.content.contextTitle ||
		contract.contractEvent.content.taskTitle ||
		contract.contractEvent.content.serviceTitle ||
		null;

	if (contract.contractEvent.content.contextType === 'service') {
		const serviceId =
			contract.contractEvent.content.serviceId || contract.contractEvent.content.contextId || null;

		return {
			sourceVisibility: title ? 'public_present' : 'public_unknown',
			sourcePresentation: title
				? {
						label: title,
						href: serviceId ? `/services/${encodeURIComponent(serviceId)}` : null
					}
				: null
		};
	}

	const taskId =
		contract.contractEvent.content.taskId || contract.contractEvent.content.contextId || null;

	return {
		sourceVisibility: title ? 'public_present' : 'public_unknown',
		sourcePresentation: title
			? {
					label: title,
					href: taskId ? `/tasks/${encodeURIComponent(taskId)}` : null
				}
			: null
	};
}

export function buildReviewTargetSummary(
	contract: ContractWithEvents,
	reviewerPubkey: string,
	revieweePubkey: string
): ReviewTargetSummary {
	const subjectType = getReviewSubjectType(contract);
	const outcome = getReviewContractOutcome(contract.status);
	const roles = getReviewRolePair(contract);
	const { chain, asset } = getChainAndAsset(contract);
	const settlementId = contract.escrowData?.id ?? contract.contractEvent.content.escrowId;
	const subjectId = getSubjectId(contract);
	const contractAddress =
		contract.contractEvent.content.contractAddress ??
		contract.contractEvent.content.serviceAddress ??
		'';
	const reviewerWallet = contract.isClient
		? contract.escrowData.client
		: contract.escrowData.freelancer;
	const revieweeWallet = contract.isClient
		? contract.escrowData.freelancer
		: contract.escrowData.client;
	const source = getSourcePresentation(contract);

	return {
		contractId: getContractId(contract),
		subjectType,
		subjectId,
		settlementType: getSettlementType(contract),
		settlementId,
		chain,
		asset,
		contractAddress,
		reviewerPubkey,
		reviewerWallet,
		outcome,
		reviewerRole: roles.reviewerRole,
		revieweeRole: roles.revieweeRole,
		revieweePubkey,
		revieweeWallet,
		contractVersion:
			contract.contractEvent.content.contextVersionRef ??
			contract.contractEvent.content.contractAddress ??
			settlementId,
		sourceVisibility: source.sourceVisibility,
		sourcePresentation: source.sourcePresentation,
		title:
			contract.contractEvent.content.contextTitle ||
			contract.contractEvent.content.taskTitle ||
			'Review this settlement',
		description:
			contract.contractEvent.content.contextDescription ||
			contract.contractEvent.content.taskDescription ||
			'Completed settlement',
		state: getReviewEligibilityState(contract)
	};
}

export function buildReviewTargetLink(
	contract: ContractWithEvents,
	baseUrl: URL,
	tab: 'pending' | 'given' | 'received' = 'pending'
): ReviewTargetLink {
	return {
		href: buildReviewsUrl(baseUrl, {
			tab,
			highlight: getContractId(contract)
		}),
		label: getReviewAvailabilityLabel(getReviewEligibilityState(contract)),
		state: getReviewEligibilityState(contract)
	};
}

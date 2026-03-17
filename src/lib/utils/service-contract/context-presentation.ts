import type { ContractWithEvents } from '$lib/types/contract';

type ContractValue = string | number | boolean | undefined;

export type ContractContextKeyReader = (
	contract: ContractWithEvents,
	key: string
) => ContractValue;

export interface ContractContextPresentation {
	contextType: string;
	isServiceContract: boolean;
	isUnknownContext: boolean;
	purchaseMode: string | null;
	title: string;
	description: string;
	selectedTierId: string | null;
	summaryLabel: string;
	cardLabel: string;
}

export interface ContractCompletionFallbackLabels {
	completionTitle: string;
	infoLabel: string;
	instructionsTitle: string;
	instructionsText: string;
	confirmLabel: string;
}

export interface ContractCompletionPresentation {
	completionTitle: string;
	infoLabel: string;
	instructionsTitle: string;
	instructionsText: string;
	confirmLabel: string;
}

function normalizeString(value: ContractValue): string | null {
	if (typeof value !== 'string') {
		return null;
	}

	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function resolveServiceContractLabel(purchaseMode: string | null): string {
	return purchaseMode === 'instant_buy' ? 'Instant Buy' : 'Quoted Service';
}

export function buildContractContextPresentation(
	contract: ContractWithEvents,
	getContractKey: ContractContextKeyReader
): ContractContextPresentation {
	const rawContextType =
		normalizeString(getContractKey(contract, 'contextType')) ??
		normalizeString(contract.contractEvent.content.contextType) ??
		'task';
	const purchaseMode =
		normalizeString(getContractKey(contract, 'purchaseMode')) ??
		normalizeString(contract.contractEvent.content.purchaseMode);
	const isServiceContract = rawContextType === 'service';
	const isUnknownContext = rawContextType !== 'task' && rawContextType !== 'service';
	const serviceLabel = resolveServiceContractLabel(purchaseMode);

	const title =
		normalizeString(getContractKey(contract, 'contextTitle')) ??
		normalizeString(getContractKey(contract, 'taskTitle')) ??
		normalizeString(getContractKey(contract, 'serviceTitle')) ??
		normalizeString(contract.contractEvent.content.contextTitle) ??
		normalizeString(contract.contractEvent.content.taskTitle) ??
		'Contract';
	const description =
		normalizeString(getContractKey(contract, 'contextDescription')) ??
		normalizeString(getContractKey(contract, 'taskDescription')) ??
		normalizeString(contract.contractEvent.content.contextDescription) ??
		normalizeString(contract.contractEvent.content.taskDescription) ??
		'';
	const selectedTierId =
		normalizeString(getContractKey(contract, 'selectedTierId')) ??
		normalizeString(contract.contractEvent.content.selectedTierId);

	return {
		contextType: rawContextType,
		isServiceContract,
		isUnknownContext,
		purchaseMode,
		title,
		description,
		selectedTierId,
		summaryLabel: isServiceContract ? serviceLabel : 'Task Contract',
		cardLabel: isServiceContract
			? serviceLabel
			: isUnknownContext
				? 'Unknown Context'
				: 'Task Contract'
	};
}

export function getContractDetailSectionTitle(
	isServiceContract: boolean,
	taskDetailSectionTitle: string
): string {
	return isServiceContract ? 'Service agreement' : taskDetailSectionTitle;
}

export function getContractCompletionPresentation(
	isServiceContract: boolean,
	taskLabels: ContractCompletionFallbackLabels
): ContractCompletionPresentation {
	if (!isServiceContract) {
		return taskLabels;
	}

	return {
		completionTitle: 'Mark service as complete',
		infoLabel: 'Service',
		instructionsTitle: 'Upload service delivery evidence',
		instructionsText:
			'Attach photos or videos that show the completed service or delivered work before sending the completion update.',
		confirmLabel: 'Mark service complete'
	};
}

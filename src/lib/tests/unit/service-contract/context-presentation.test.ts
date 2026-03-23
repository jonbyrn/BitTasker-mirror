import { describe, expect, it } from 'vitest';
import type { ContractWithEvents, NostrContract } from '$lib/types/contract';
import {
	buildContractContextPresentation,
	getContractCompletionPresentation,
	getContractDetailSectionTitle,
	type ContractContextKeyReader
} from '$lib/utils/service-contract/context-presentation';

function buildContract(content: Record<string, unknown> = {}): ContractWithEvents {
	return {
		contractEvent: {
			content: {
				contextType: 'task',
				taskTitle: 'Fallback task title',
				taskDescription: 'Fallback task description',
				...content
			}
		}
	} as unknown as ContractWithEvents;
}

const readContractValue: ContractContextKeyReader = (contract, key) => {
	const value = (contract.contractEvent.content as NostrContract & Record<string, unknown>)[key];
	return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
		? value
		: undefined;
};

describe('context-presentation', () => {
	it('derives service quote labels and normalized summary fields', () => {
		const contract = buildContract({
			contextType: 'service',
			contextTitle: 'Premium logo package',
			contextDescription: 'Logo system and brand guide',
			purchaseMode: 'quote',
			selectedTierId: 'Tier 1'
		});

		expect(buildContractContextPresentation(contract, readContractValue)).toEqual({
			contextType: 'service',
			isServiceContract: true,
			isUnknownContext: false,
			purchaseMode: 'quote',
			title: 'Premium logo package',
			description: 'Logo system and brand guide',
			selectedTierId: 'Tier 1',
			summaryLabel: 'Quoted Service',
			cardLabel: 'Quoted Service'
		});
	});

	it('derives instant-buy and unknown-context labels without changing task fallbacks', () => {
		const instantBuyContract = buildContract({
			contextType: 'service',
			contextTitle: 'Fixed-price audit',
			purchaseMode: 'instant_buy'
		});
		const unknownContextContract = buildContract({
			contextType: 'alien-context',
			contextTitle: 'Broken contract context'
		});

		expect(
			buildContractContextPresentation(instantBuyContract, readContractValue).summaryLabel
		).toBe('Book Now');
		expect(buildContractContextPresentation(instantBuyContract, readContractValue).cardLabel).toBe(
			'Book Now'
		);
		expect(
			buildContractContextPresentation(unknownContextContract, readContractValue)
		).toMatchObject({
			contextType: 'alien-context',
			isServiceContract: false,
			isUnknownContext: true,
			summaryLabel: 'Task Contract',
			cardLabel: 'Unknown Context'
		});
	});

	it('selects service-only detail and completion copy while preserving task fallbacks', () => {
		expect(getContractDetailSectionTitle(true, 'Bid details')).toBe('Service agreement');
		expect(getContractDetailSectionTitle(false, 'Bid details')).toBe('Bid details');

		expect(
			getContractCompletionPresentation(true, {
				completionTitle: 'Complete task',
				infoLabel: 'Task',
				instructionsTitle: 'Add completion evidence',
				instructionsText: 'Task instructions',
				confirmLabel: 'Mark complete'
			})
		).toEqual({
			completionTitle: 'Mark service as complete',
			infoLabel: 'Service',
			instructionsTitle: 'Upload service delivery evidence',
			instructionsText:
				'Attach photos or videos that show the completed service or delivered work before sending the completion update.',
			confirmLabel: 'Mark service complete'
		});

		expect(
			getContractCompletionPresentation(false, {
				completionTitle: 'Complete task',
				infoLabel: 'Task',
				instructionsTitle: 'Add completion evidence',
				instructionsText: 'Task instructions',
				confirmLabel: 'Mark complete'
			})
		).toEqual({
			completionTitle: 'Complete task',
			infoLabel: 'Task',
			instructionsTitle: 'Add completion evidence',
			instructionsText: 'Task instructions',
			confirmLabel: 'Mark complete'
		});
	});
});

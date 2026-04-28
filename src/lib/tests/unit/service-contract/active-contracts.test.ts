import { describe, expect, it } from 'vitest';
import type { ContractWithEvents } from '$lib/types/contract';
import type { Service } from '$lib/types/service.d';
import { EscrowStatus } from '$lib/utils/escrow';
import { ContractStatus } from '$lib/utils/contract/types';
import {
	compareActiveServiceContracts,
	getActiveServiceContractsForService,
	isActiveServiceContract,
	selectPrimaryActiveServiceContract
} from '$lib/utils/service-contract/active-contracts';

function createService(overrides: Partial<Service> = {}): Service {
	return {
		id: 'service-event-1',
		uniqueId: 'service-123',
		npub: 'a'.repeat(64),
		status: 'active',
		title: 'Brand Identity Sprint',
		description: 'Logo, color palette, and social avatar pack.',
		serviceLocationTypes: [],
		pricing: {
			type: 'FIXED',
			currency: 'USDt',
			amount: 200
		},
		skills: [],
		categories: [],
		createdAt: 1_700_000_000,
		...overrides
	} as Service;
}

function createContract(
	overrides: Partial<ContractWithEvents> & {
		content?: Partial<ContractWithEvents['contractEvent']['content']>;
		contractEvent?: Partial<ContractWithEvents['contractEvent']>;
		statusEventTimestamps?: number[];
	}
): ContractWithEvents {
	const {
		content: _content,
		contractEvent: _contractEvent,
		statusEventTimestamps: _timestamps,
		...rest
	} = overrides;
	const statusEvents = (overrides.statusEventTimestamps ?? []).map((createdAt, index) => ({
		id: `status-${index}`,
		created_at: createdAt,
		content: {
			contractEventId: `contract-${overrides.content?.escrowId ?? 'escrow-1'}`,
			escrowId: overrides.content?.escrowId ?? 'escrow-1',
			action: EscrowStatus.Completed,
			timestamp: createdAt,
			type: 'contract-status' as const
		}
	}));

	const contractEvent = {
		id: `contract-${overrides.content?.escrowId ?? 'escrow-1'}`,
		created_at: 1_700_000_000,
		content: {
			escrowId: 'escrow-1',
			freelancerPubkey: 'b'.repeat(64),
			clientPubkey: 'c'.repeat(64),
			amount: '0.00100000',
			currency: 'RBTC',
			status: EscrowStatus.Funded,
			estimatedStartTime: 1_700_010_000,
			estimatedCompletionTime: 1_700_020_000,
			type: 'contract',
			/** Service contracts must declare service context or active-contract helpers treat them as tasks. */
			contextType: 'service',
			contextId: 'service-123',
			serviceId: 'service-123',
			serviceAddress: `30402:${'a'.repeat(64)}:service-123`,
			serviceTitle: 'Brand Identity Sprint',
			...overrides.content
		},
		...overrides.contractEvent
	} as ContractWithEvents['contractEvent'];

	return {
		isClient: true,
		blockchainStatus: EscrowStatus.Funded,
		escrowData: {
			id: overrides.content?.escrowId ?? 'escrow-1'
		} as ContractWithEvents['escrowData'],
		status: EscrowStatus.Funded,
		isPending: false,
		permissions: {
			canComplete: false,
			canAccept: false,
			canDispute: false,
			canPropose: false,
			canAcceptProposal: false,
			canCancel: false,
			canResolveTimelock: false,
			canDelete: false
		},
		disputeProposal: null,
		completionAttachments: null,
		...rest,
		contractEvent,
		statusEvents
	} as ContractWithEvents;
}

describe('service active contract continuity', () => {
	it('treats non-terminal service contracts as active', () => {
		expect(isActiveServiceContract(createContract({ status: EscrowStatus.Funded }))).toBe(true);
		expect(isActiveServiceContract(createContract({ status: EscrowStatus.Completed }))).toBe(true);
		// v2 `isTerminalPaymentState` uses {@link ContractStatus} chain codes; EscrowStatus.FundsReleased (10) is not terminal there.
		expect(isActiveServiceContract(createContract({ status: ContractStatus.FundsReleased }))).toBe(
			false
		);
		expect(
			isActiveServiceContract(
				createContract({
					content: {
						contextType: 'task'
					}
				})
			)
		).toBe(false);
	});

	it('filters active contracts down to the matching service', () => {
		const service = createService();
		const otherServiceContract = createContract({
			content: {
				escrowId: 'escrow-other',
				serviceId: 'service-999',
				contextId: 'service-999',
				serviceAddress: `30402:${'a'.repeat(64)}:service-999`
			}
		});
		const matchingContracts = getActiveServiceContractsForService(
			[
				createContract({ content: { escrowId: 'escrow-123' } }),
				createContract({
					status: ContractStatus.FundsReleased,
					content: { escrowId: 'escrow-final' }
				}),
				otherServiceContract
			],
			service
		);

		expect(matchingContracts.map((contract) => contract.contractEvent.content.escrowId)).toEqual([
			'escrow-123'
		]);
	});

	it('matches services by fallback ids when the unique id is unavailable', () => {
		const service = createService({
			id: 'service-fallback',
			uniqueId: undefined
		});
		const matchingContracts = getActiveServiceContractsForService(
			[
				createContract({
					content: {
						escrowId: 'escrow-fallback',
						serviceId: 'service-fallback',
						contextId: 'service-fallback',
						serviceAddress: undefined
					}
				})
			],
			service
		);

		expect(matchingContracts.map((contract) => contract.contractEvent.content.escrowId)).toEqual([
			'escrow-fallback'
		]);
	});

	it('prefers the most recently updated active contract, then latest creation, then lexical escrow id', () => {
		const first = createContract({
			content: { escrowId: 'escrow-b' },
			contractEvent: {
				id: 'contract-escrow-b',
				created_at: 1_700_000_010
			} as ContractWithEvents['contractEvent'],
			statusEventTimestamps: [1_700_000_020]
		});
		const second = createContract({
			content: { escrowId: 'escrow-a' },
			contractEvent: {
				id: 'contract-escrow-a',
				created_at: 1_700_000_010
			} as ContractWithEvents['contractEvent'],
			statusEventTimestamps: [1_700_000_020]
		});
		const newestActivity = createContract({
			content: { escrowId: 'escrow-z' },
			statusEventTimestamps: [1_700_000_030]
		});

		expect(compareActiveServiceContracts(newestActivity, first)).toBeLessThan(0);
		expect(compareActiveServiceContracts(first, second)).toBeGreaterThan(0);
		expect(
			selectPrimaryActiveServiceContract([first, second, newestActivity], createService())
				?.contractEvent.content.escrowId
		).toBe('escrow-z');
	});

	it('falls back to newest creation time before lexical escrow id', () => {
		const olderContract = createContract({
			content: { escrowId: 'escrow-z' },
			contractEvent: {
				id: 'contract-escrow-z',
				created_at: 1_700_000_010
			} as ContractWithEvents['contractEvent']
		});
		const newerContract = createContract({
			content: { escrowId: 'escrow-a' },
			contractEvent: {
				id: 'contract-escrow-a',
				created_at: 1_700_000_020
			} as ContractWithEvents['contractEvent']
		});

		expect(compareActiveServiceContracts(newerContract, olderContract)).toBeLessThan(0);
		expect(
			selectPrimaryActiveServiceContract([olderContract, newerContract], createService())
				?.contractEvent.content.escrowId
		).toBe('escrow-a');
	});
});

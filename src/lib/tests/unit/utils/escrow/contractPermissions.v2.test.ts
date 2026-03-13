import { describe, expect, it } from 'vitest';

import type { ContractStatusEvent } from '$lib/types/contract';
import { determineContractState } from '$lib/utils/helpers/contractPermissions.v2';
import { EscrowStatus } from '$lib/utils/escrow/v2/escrow.enum';

describe('contractPermissions.v2', () => {
	const baseEscrowData = {
		id: '42',
		client: 'client-pubkey',
		freelancer: 'freelancer-pubkey',
		baseAmount: '1.0',
		clientFee: '0',
		freelancerFee: '0',
		totalAmount: '1.0',
		status: EscrowStatus.Funded,
		estimatedStartTime: Math.floor(Date.now() / 1000) - 3600,
		estimatedCompletionTime: Math.floor(Date.now() / 1000) + 3600,
		completionTime: 0,
		timelockExpiry: Math.floor(Date.now() / 1000) + 86400,
		clientFeeTier: 1 as const,
		freelancerFeeTier: 1 as const,
		createdAt: Math.floor(Date.now() / 1000) - 7200,
		lastUpdated: Date.now()
	};

	const baseContract = {
		escrowId: '42',
		taskId: 'task-1',
		taskTitle: 'Test task',
		taskDescription: 'Test description',
		freelancerPubkey: 'freelancer-pubkey',
		clientPubkey: 'client-pubkey',
		amount: '1.0',
		currency: 'RBTC',
		status: EscrowStatus.Funded,
		estimatedStartTime: baseEscrowData.estimatedStartTime,
		estimatedCompletionTime: baseEscrowData.estimatedCompletionTime,
		type: 'contract' as const
	};

	it('keeps funded as funded instead of deriving v1 InProgress', () => {
		const result = determineContractState(
			EscrowStatus.Funded,
			[],
			baseContract,
			baseEscrowData,
			null,
			false,
			false,
			true
		);

		expect(result.status).toBe(EscrowStatus.Funded);
		expect(result.permissions.canComplete).toBe(true);
		expect(result.permissions.canMarkWorkInProgress).toBe(true);
	});

	it('returns WorkInProgress when blockchain status is WorkInProgress', () => {
		const result = determineContractState(
			EscrowStatus.WorkInProgress,
			[],
			{ ...baseContract, status: EscrowStatus.WorkInProgress },
			{ ...baseEscrowData, status: EscrowStatus.WorkInProgress },
			null,
			false,
			false,
			true
		);

		expect(result.status).toBe(EscrowStatus.WorkInProgress);
		expect(result.permissions.canComplete).toBe(true);
	});

	it('returns pending mark no-show when the latest v2 status event is pending', () => {
		const pendingMarkNoShowEvent: ContractStatusEvent = {
			id: 'event-1',
			pubkey: 'client-pubkey',
			created_at: Math.floor(Date.now() / 1000),
			kind: 1,
			tags: [],
			content: {
				escrowId: '42',
				action: EscrowStatus.PendingMarkNoShow,
				type: 'contract-status',
				timestamp: Date.now(),
				transactionHash: '0xtx',
				contractEventId: 'contract-event-1'
			},
			sig: 'sig-1'
		};

		const result = determineContractState(
			EscrowStatus.Funded,
			[pendingMarkNoShowEvent],
			baseContract,
			baseEscrowData,
			null,
			false,
			true,
			false
		);

		expect(result.status).toBe(EscrowStatus.PendingMarkNoShow);
	});
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ContractWithEvents } from '$lib/types/contract';
import { TaskStatusEnum } from '$lib/utils/enums/task.enum';
import { EscrowStatus as V2EscrowStatus } from '$lib/utils/escrow/v2/escrow.enum';

const { updateTask } = vi.hoisted(() => ({
	updateTask: vi.fn()
}));

const { v1AcceptTask, v2AcceptTask, v2DisputeTask, v2MarkWorkInProgress } = vi.hoisted(() => ({
	v1AcceptTask: vi.fn(),
	v2AcceptTask: vi.fn(),
	v2DisputeTask: vi.fn(),
	v2MarkWorkInProgress: vi.fn()
}));

vi.mock('$lib/nostr/task', () => ({
	updateTask
}));

vi.mock('$lib/utils/escrow/v1', () => ({
	escrow: {
		acceptTask: v1AcceptTask
	},
	escrowBid: {},
	nostrContract: {},
	escrowEvents: {},
	EscrowStatus: {},
	abi: []
}));

vi.mock('$lib/utils/escrow/v2', () => ({
	escrow: {
		acceptTask: v2AcceptTask,
		disputeTask: v2DisputeTask,
		markWorkInProgress: v2MarkWorkInProgress
	},
	escrowBid: {},
	nostrContract: {},
	escrowEvents: {},
	EscrowStatus: V2EscrowStatus,
	abi: []
}));

import { escrow } from '$lib/utils/escrow';

describe('submit-time task updates', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		v1AcceptTask.mockResolvedValue({ hash: '0xv1', escrowId: '1', status: 'pending' });
		v2AcceptTask.mockResolvedValue({ hash: '0xv2', escrowId: '42', status: 'pending' });
		v2DisputeTask.mockResolvedValue({ hash: '0xdispute', escrowId: '42', status: 'pending' });
		v2MarkWorkInProgress.mockResolvedValue({
			hash: '0xwork',
			escrowId: '42',
			status: 'pending'
		});
	});

	it('updates the task at submit-time for v2 acceptTask', async () => {
		const contract = {
			contractEvent: {
				id: 'contract-event-1',
				tags: [['v', 'v2']],
				content: { taskId: 'task-123', contractAddress: '0xcontract' }
			},
			escrowData: { id: '42', status: V2EscrowStatus.Completed }
		} as unknown as ContractWithEvents;

		await escrow.escrowOps.acceptTask(contract);

		expect(v2AcceptTask).toHaveBeenCalledWith('42', 'contract-event-1');
		expect(updateTask).toHaveBeenCalledWith('task-123', {
			status: TaskStatusEnum.COMPLETED
		});
	});

	it('updates the task at submit-time for v2 disputeTask', async () => {
		const contract = {
			contractEvent: {
				id: 'contract-event-2',
				tags: [['v', 'v2']],
				content: { taskId: 'task-456', contractAddress: '0xcontract' }
			},
			escrowData: { id: '42', status: V2EscrowStatus.Completed }
		} as unknown as ContractWithEvents;

		await escrow.escrowOps.disputeTask(contract);

		expect(v2DisputeTask).toHaveBeenCalledWith('42', 'contract-event-2');
		expect(updateTask).toHaveBeenCalledWith('task-456', {
			status: TaskStatusEnum.DISPUTED
		});
	});

	it('passes contractEventId to v2-only markWorkInProgress', async () => {
		const contract = {
			contractEvent: {
				id: 'contract-event-3',
				tags: [['v', 'v2']],
				content: { taskId: 'task-789', contractAddress: '0xlegacy' }
			},
			escrowData: { id: '42', status: V2EscrowStatus.Funded }
		} as unknown as ContractWithEvents;

		await escrow.escrowOps.markWorkInProgress(contract);

		expect(v2MarkWorkInProgress).toHaveBeenCalledWith('42', '0xlegacy', 'contract-event-3');
	});
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EscrowStatus } from '$lib/utils/escrow';
import {
	getTaskIdsNeedingCompletionSync,
	getTaskStatusSyncItems,
	reconcileTaskStatusWithContracts,
	type GetTaskStatusFn
} from '$lib/utils/helpers/task-status-reconciliation';
import type { ContractWithEvents } from '$lib/types/contract';
import { TaskStatusEnum } from '$lib/utils/enums/task.enum';

vi.mock('$lib/nostr/task', () => ({
	updateTask: vi.fn().mockResolvedValue(undefined)
}));

function createMockContract(opts: {
	escrowId: string;
	taskId: string;
	status: EscrowStatus;
}): ContractWithEvents {
	return {
		escrowData: { id: opts.escrowId } as unknown as ContractWithEvents['escrowData'],
		status: opts.status,
		contractEvent: {
			content: { taskId: opts.taskId }
		} as unknown as ContractWithEvents['contractEvent']
	} as ContractWithEvents;
}

describe('getTaskIdsNeedingCompletionSync', () => {
	it('returns empty array when no contracts', () => {
		const getTaskStatus = vi.fn();
		const result = getTaskIdsNeedingCompletionSync([], getTaskStatus);
		expect(result).toEqual([]);
		expect(getTaskStatus).not.toHaveBeenCalled();
	});

	it('returns empty array when no contracts have FundsReleased', () => {
		const contracts = [
			createMockContract({ escrowId: 'e1', taskId: 't1', status: EscrowStatus.PendingAcceptance }),
			createMockContract({ escrowId: 'e2', taskId: 't2', status: EscrowStatus.InProgress })
		];
		const getTaskStatus = vi.fn(() => TaskStatusEnum.IN_PROGRESS); // already in sync for IN_PROGRESS
		const result = getTaskIdsNeedingCompletionSync(contracts, getTaskStatus);
		expect(result).toEqual([]); // no COMPLETED sync items
	});

	it('returns taskId when contract has FundsReleased and task status is not COMPLETED', () => {
		const contracts = [
			createMockContract({ escrowId: 'e1', taskId: 't1', status: EscrowStatus.FundsReleased })
		];
		const getTaskStatus: GetTaskStatusFn = vi.fn(() => TaskStatusEnum.IN_PROGRESS);
		const result = getTaskIdsNeedingCompletionSync(contracts, getTaskStatus);
		expect(result).toEqual(['t1']);
		expect(getTaskStatus).toHaveBeenCalledWith('t1');
	});

	it('does not return taskId when contract has FundsReleased and task status is COMPLETED', () => {
		const contracts = [
			createMockContract({ escrowId: 'e1', taskId: 't1', status: EscrowStatus.FundsReleased })
		];
		const getTaskStatus: GetTaskStatusFn = vi.fn(() => TaskStatusEnum.COMPLETED);
		const result = getTaskIdsNeedingCompletionSync(contracts, getTaskStatus);
		expect(result).toEqual([]);
		expect(getTaskStatus).toHaveBeenCalledWith('t1');
	});

	it('returns taskIds only for FundsReleased contracts where task status is not COMPLETED', () => {
		const contracts = [
			createMockContract({ escrowId: 'e1', taskId: 't1', status: EscrowStatus.FundsReleased }),
			createMockContract({ escrowId: 'e2', taskId: 't2', status: EscrowStatus.FundsReleased }),
			createMockContract({ escrowId: 'e3', taskId: 't3', status: EscrowStatus.PendingAcceptance })
		];
		const getTaskStatus: GetTaskStatusFn = vi.fn((taskId) =>
			taskId === 't1' ? TaskStatusEnum.IN_PROGRESS : TaskStatusEnum.COMPLETED
		);
		const result = getTaskIdsNeedingCompletionSync(contracts, getTaskStatus);
		expect(result).toEqual(['t1']);
		expect(getTaskStatus).toHaveBeenCalledWith('t1');
		expect(getTaskStatus).toHaveBeenCalledWith('t2');
		expect(getTaskStatus).toHaveBeenCalledWith('t3'); // t3 checked for general sync (PendingAcceptance → IN_PROGRESS)
	});

	it('returns taskId when getTaskStatus returns undefined (task not in store)', () => {
		const contracts = [
			createMockContract({ escrowId: 'e1', taskId: 't1', status: EscrowStatus.FundsReleased })
		];
		const getTaskStatus: GetTaskStatusFn = vi.fn(() => undefined);
		const result = getTaskIdsNeedingCompletionSync(contracts, getTaskStatus);
		expect(result).toEqual(['t1']);
	});

	it('extracts taskId from contractEvent.content when present', () => {
		const contract = createMockContract({
			escrowId: 'e1',
			taskId: 'my-task-d-tag-123',
			status: EscrowStatus.FundsReleased
		});
		const getTaskStatus: GetTaskStatusFn = vi.fn(() => TaskStatusEnum.IN_PROGRESS);
		const result = getTaskIdsNeedingCompletionSync([contract], getTaskStatus);
		expect(result).toEqual(['my-task-d-tag-123']);
	});
});

describe('reconcileTaskStatusWithContracts', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('calls updateTask for each taskId needing completion', async () => {
		const { updateTask } = await import('$lib/nostr/task');
		const contracts = [
			createMockContract({ escrowId: 'e1', taskId: 't1', status: EscrowStatus.FundsReleased }),
			createMockContract({ escrowId: 'e2', taskId: 't2', status: EscrowStatus.FundsReleased })
		];
		const getTaskStatus: GetTaskStatusFn = vi.fn(() => TaskStatusEnum.IN_PROGRESS);

		await reconcileTaskStatusWithContracts(contracts, getTaskStatus);

		expect(updateTask).toHaveBeenCalledTimes(2);
		expect(updateTask).toHaveBeenCalledWith('t1', { status: TaskStatusEnum.COMPLETED });
		expect(updateTask).toHaveBeenCalledWith('t2', { status: TaskStatusEnum.COMPLETED });
	});

	it('does not call updateTask when no contracts need completion', async () => {
		const { updateTask } = await import('$lib/nostr/task');
		const contracts = [
			createMockContract({ escrowId: 'e1', taskId: 't1', status: EscrowStatus.FundsReleased })
		];
		const getTaskStatus: GetTaskStatusFn = vi.fn(() => TaskStatusEnum.COMPLETED);

		await reconcileTaskStatusWithContracts(contracts, getTaskStatus);

		expect(updateTask).not.toHaveBeenCalled();
	});

	it('does not call updateTask when contracts list is empty', async () => {
		const { updateTask } = await import('$lib/nostr/task');
		const getTaskStatus = vi.fn();

		await reconcileTaskStatusWithContracts([], getTaskStatus);

		expect(updateTask).not.toHaveBeenCalled();
		expect(getTaskStatus).not.toHaveBeenCalled();
	});

	it('continues on updateTask failure (logs via d.error, does not throw)', async () => {
		const { updateTask } = await import('$lib/nostr/task');
		vi.mocked(updateTask)
			.mockRejectedValueOnce(new Error('network error'))
			.mockResolvedValueOnce('');
		const contracts = [
			createMockContract({ escrowId: 'e1', taskId: 't1', status: EscrowStatus.FundsReleased }),
			createMockContract({ escrowId: 'e2', taskId: 't2', status: EscrowStatus.FundsReleased })
		];
		const getTaskStatus: GetTaskStatusFn = vi.fn(() => TaskStatusEnum.IN_PROGRESS);

		await expect(
			reconcileTaskStatusWithContracts(contracts, getTaskStatus)
		).resolves.toBeUndefined();

		expect(updateTask).toHaveBeenCalledTimes(2);
		expect(updateTask).toHaveBeenNthCalledWith(1, 't1', { status: TaskStatusEnum.COMPLETED });
		expect(updateTask).toHaveBeenNthCalledWith(2, 't2', { status: TaskStatusEnum.COMPLETED });
	});
});

describe('getTaskStatusSyncItems (general reconciliation)', () => {
	it('returns IN_PROGRESS sync when contract is Funded but task is OPEN', () => {
		const contracts = [
			createMockContract({ escrowId: 'e1', taskId: 't1', status: EscrowStatus.Funded })
		];
		const getTaskStatus: GetTaskStatusFn = vi.fn(() => TaskStatusEnum.OPEN);

		const result = getTaskStatusSyncItems(contracts, getTaskStatus);

		expect(result).toEqual([{ taskId: 't1', status: TaskStatusEnum.IN_PROGRESS }]);
		expect(getTaskStatus).toHaveBeenCalledWith('t1');
	});

	it('returns no sync when contract is Funded and task is already IN_PROGRESS', () => {
		const contracts = [
			createMockContract({ escrowId: 'e1', taskId: 't1', status: EscrowStatus.Funded })
		];
		const getTaskStatus: GetTaskStatusFn = vi.fn(() => TaskStatusEnum.IN_PROGRESS);

		const result = getTaskStatusSyncItems(contracts, getTaskStatus);

		expect(result).toEqual([]);
	});

	it('returns no sync when contract is PendingFunding (escrow not confirmed)', () => {
		const contracts = [
			createMockContract({ escrowId: 'e1', taskId: 't1', status: EscrowStatus.PendingFunding })
		];
		const getTaskStatus: GetTaskStatusFn = vi.fn(() => TaskStatusEnum.OPEN);

		const result = getTaskStatusSyncItems(contracts, getTaskStatus);

		expect(result).toEqual([]);
		expect(getTaskStatus).not.toHaveBeenCalled();
	});

	it('returns both IN_PROGRESS and COMPLETED sync items when contracts differ', () => {
		const contracts = [
			createMockContract({ escrowId: 'e1', taskId: 't1', status: EscrowStatus.Funded }),
			createMockContract({ escrowId: 'e2', taskId: 't2', status: EscrowStatus.FundsReleased })
		];
		const getTaskStatus: GetTaskStatusFn = vi.fn((taskId) =>
			taskId === 't1' ? TaskStatusEnum.OPEN : TaskStatusEnum.IN_PROGRESS
		);

		const result = getTaskStatusSyncItems(contracts, getTaskStatus);

		expect(result).toEqual(
			expect.arrayContaining([
				{ taskId: 't1', status: TaskStatusEnum.IN_PROGRESS },
				{ taskId: 't2', status: TaskStatusEnum.COMPLETED }
			])
		);
		expect(result).toHaveLength(2);
	});

	it('returns COMPLETED sync for DisputeResolved contract when task not COMPLETED', () => {
		const contracts = [
			createMockContract({ escrowId: 'e1', taskId: 't1', status: EscrowStatus.DisputeResolved })
		];
		const getTaskStatus: GetTaskStatusFn = vi.fn(() => TaskStatusEnum.IN_PROGRESS);

		const result = getTaskStatusSyncItems(contracts, getTaskStatus);

		expect(result).toEqual([{ taskId: 't1', status: TaskStatusEnum.COMPLETED }]);
	});
});

describe('reconcileTaskStatusWithContracts (general)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('calls updateTask with IN_PROGRESS when contract is Funded and task is OPEN', async () => {
		const { updateTask } = await import('$lib/nostr/task');
		const contracts = [
			createMockContract({ escrowId: 'e1', taskId: 't1', status: EscrowStatus.Funded })
		];
		const getTaskStatus: GetTaskStatusFn = vi.fn(() => TaskStatusEnum.OPEN);

		await reconcileTaskStatusWithContracts(contracts, getTaskStatus);

		expect(updateTask).toHaveBeenCalledTimes(1);
		expect(updateTask).toHaveBeenCalledWith('t1', { status: TaskStatusEnum.IN_PROGRESS });
	});

	it('skips reconciliation for legacy event-id taskId (logs warning, does not call updateTask)', async () => {
		const { updateTask } = await import('$lib/nostr/task');
		const eventIdTaskId = '9df1e49bedbc5a3122da5f78033c344ffa77d787edd1a1815d2effdd0e841b66';
		const contracts = [
			createMockContract({
				escrowId: 'e1',
				taskId: eventIdTaskId,
				status: EscrowStatus.FundsReleased
			})
		];
		const getTaskStatus: GetTaskStatusFn = vi.fn(() => TaskStatusEnum.IN_PROGRESS);

		await reconcileTaskStatusWithContracts(contracts, getTaskStatus);

		expect(updateTask).not.toHaveBeenCalled();
	});
});

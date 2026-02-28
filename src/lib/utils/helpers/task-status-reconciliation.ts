/**
 * Task status reconciliation with contract state.
 *
 * When contract state is ahead of Nostr task status (e.g. updateTask failed at confirmation time),
 * we self-heal by syncing task status to match the contract. Covers:
 * - OPEN → IN_PROGRESS: contract is Funded (or any active state) but task still OPEN
 * - IN_PROGRESS → COMPLETED: contract is FundsReleased (or DisputeResolved) but task not COMPLETED
 *
 * See docs/task-status-resilience.md §5.6.
 */

import { EscrowStatus } from '$lib/utils/escrow';
import type { ContractWithEvents } from '$lib/types/contract';
import { TaskStatusEnum } from '$lib/utils/enums/task.enum';
import { updateTask } from '$lib/nostr/task';
import { createDebug } from '$lib/utils/debug';

const d = createDebug('reconcile');

export type GetTaskStatusFn = (taskId: string) => string | undefined;

/** Result of reconciliation: taskId and the task status it should be updated to */
export interface TaskStatusSyncItem {
	taskId: string;
	status: TaskStatusEnum;
}

/**
 * Contract statuses that imply the task should be IN_PROGRESS (escrow exists and is active).
 * Excludes PendingFunding (escrow not confirmed) and final/terminal states.
 */
const CONTRACT_STATES_IMPLYING_IN_PROGRESS: EscrowStatus[] = [
	EscrowStatus.Funded,
	EscrowStatus.InProgress,
	EscrowStatus.PendingCompletion,
	EscrowStatus.Completed,
	EscrowStatus.PendingAcceptance,
	EscrowStatus.PendingDispute,
	EscrowStatus.InDispute,
	EscrowStatus.DisputeResolutionProposed,
	EscrowStatus.PendingResolutionProposal,
	EscrowStatus.PendingProposalAcceptance,
	EscrowStatus.PendingTimelockResolution
];

/**
 * Contract statuses that imply the task should be COMPLETED (payment released or dispute resolved).
 */
const CONTRACT_STATES_IMPLYING_COMPLETED: EscrowStatus[] = [
	EscrowStatus.FundsReleased,
	EscrowStatus.DisputeResolved
];

/**
 * Extract taskId from a contract (same logic as contractStore.getContractKey(contract, 'taskId')).
 */
function getTaskIdFromContract(contract: ContractWithEvents): string | undefined {
	const taskId =
		contract.contractEvent?.content?.taskId ??
		(contract as { contractEvent?: { content?: { taskId?: string } } }).contractEvent?.content
			?.taskId;
	return typeof taskId === 'string' ? taskId : undefined;
}

/**
 * Returns the task status that should be set given the contract status, or null if no sync needed.
 */
function getExpectedTaskStatusForContract(contractStatus: EscrowStatus): TaskStatusEnum | null {
	if (CONTRACT_STATES_IMPLYING_COMPLETED.includes(contractStatus)) return TaskStatusEnum.COMPLETED;
	if (CONTRACT_STATES_IMPLYING_IN_PROGRESS.includes(contractStatus))
		return TaskStatusEnum.IN_PROGRESS;
	return null;
}

/**
 * Returns list of (taskId, status) that need to be synced: contract implies a task status
 * but current task status is behind. Use when loading contracts to self-heal.
 *
 * @param contracts - Contracts (e.g. from contracts store or API)
 * @param getTaskStatus - Function to get current task status by taskId (e.g. from tasksStore or myTasksStore)
 * @returns Items to pass to updateTask(taskId, { status })
 */
export function getTaskStatusSyncItems(
	contracts: ContractWithEvents[],
	getTaskStatus: GetTaskStatusFn
): TaskStatusSyncItem[] {
	const result: TaskStatusSyncItem[] = [];

	for (const contract of contracts) {
		const expected = getExpectedTaskStatusForContract(contract.status);
		if (expected === null) continue;

		const taskId = getTaskIdFromContract(contract);
		if (!taskId) continue;

		const current = getTaskStatus(taskId);
		if (current === expected) continue;

		result.push({ taskId, status: expected });
	}

	return result;
}

/**
 * Returns taskIds for contracts with FundsReleased where the task status is not COMPLETED.
 * @deprecated Prefer getTaskStatusSyncItems for general reconciliation; this remains for tests/callers that only care about completion sync.
 */
export function getTaskIdsNeedingCompletionSync(
	contracts: ContractWithEvents[],
	getTaskStatus: GetTaskStatusFn
): string[] {
	return getTaskStatusSyncItems(contracts, getTaskStatus)
		.filter((item) => item.status === TaskStatusEnum.COMPLETED)
		.map((item) => item.taskId);
}

/**
 * Self-heal: for each contract whose state implies a task status, update the Nostr task
 * if it's behind (OPEN when should be IN_PROGRESS, or not COMPLETED when should be COMPLETED).
 * Call when loading contracts (e.g. DashboardContractsPanel).
 *
 * @param contracts - Loaded contracts
 * @param getTaskStatus - Function to get current task status by taskId (e.g. from tasksStore + myTasksStore)
 */
export async function reconcileTaskStatusWithContracts(
	contracts: ContractWithEvents[],
	getTaskStatus: GetTaskStatusFn
): Promise<void> {
	d.log('reconcile start', { contractCount: contracts.length });

	const items = getTaskStatusSyncItems(contracts, getTaskStatus);
	d.log('reconcile sync items', {
		items: items.map(({ taskId, status }) => ({
			taskId,
			taskIdFormat: /^[0-9a-fA-F]{64}$/.test(taskId) ? 'event-id' : 'd-tag',
			expectedStatus: status,
			currentStatus: getTaskStatus(taskId)
		}))
	});

	const isEventId = (id: string) => /^[0-9a-fA-F]{64}$/.test(id);

	for (const { taskId, status } of items) {
		if (isEventId(taskId)) {
			d.warn(
				'Skipping reconciliation for legacy event-id taskId (API may return 404 for superseded event); contract should use d-tag',
				{ taskId: taskId.slice(0, 16) + '…', status }
			);
			continue;
		}

		try {
			d.log('reconcile updateTask', { taskId: taskId.slice(0, 16) + '…', status });
			await updateTask(taskId, { status });
			d.log('reconcile updateTask success', { taskId: taskId.slice(0, 16) + '…', status });
		} catch (err) {
			d.error('Failed to update task', { taskId, status }, err);
		}
	}
}

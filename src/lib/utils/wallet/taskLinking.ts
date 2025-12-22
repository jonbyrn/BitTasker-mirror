/**
 * Task Linking Utility
 * 
 * Links transactions to tasks via escrowId extraction and contract store lookup.
 */

import { get } from 'svelte/store';
import { contractStore } from '$lib/stores/contract.store';
import type { ContractWithEvents } from '$lib/types/contract';

export interface TaskInfo {
	id: string;
	title: string;
}

/**
 * Extract escrowId from transaction metadata
 */
export function extractEscrowId(transaction: {
	contractMetadata?: {
		escrowId?: string;
	};
}): string | null {
	return transaction.contractMetadata?.escrowId || null;
}

/**
 * Find task by escrowId from contract store
 */
export function getTaskByEscrowId(escrowId: string): TaskInfo | null {
	try {
		const state = get(contractStore);
		
		// Use contractsMap for O(1) lookup
		const contractIndex = state.contractsMap.get(escrowId);
		if (contractIndex === undefined) {
			return null;
		}

		const contract = state.contracts[contractIndex];
		if (!contract) {
			return null;
		}

		// Extract task information from contract
		const taskId = contract.contractEvent.content.taskId;
		const taskTitle = contract.contractEvent.content.taskTitle;

		if (!taskId || !taskTitle) {
			return null;
		}

		return {
			id: taskId,
			title: taskTitle
		};
	} catch (error) {
		console.warn('[TaskLinking] Failed to find task by escrowId:', error);
		return null;
	}
}

/**
 * Generate task link URL
 */
export function generateTaskLink(taskId: string): string {
	return `/tasks/${taskId}`;
}

/**
 * Get task information for a transaction
 */
export function getTaskInfoForTransaction(transaction: {
	contractMetadata?: {
		escrowId?: string;
		taskId?: string;
		taskTitle?: string;
	};
}): TaskInfo | null {
	// Check if task info is already in transaction metadata
	if (transaction.contractMetadata?.taskId && transaction.contractMetadata?.taskTitle) {
		return {
			id: transaction.contractMetadata.taskId,
			title: transaction.contractMetadata.taskTitle
		};
	}

	// Try to find via escrowId
	const escrowId = extractEscrowId(transaction);
	if (escrowId) {
		return getTaskByEscrowId(escrowId);
	}

	return null;
}


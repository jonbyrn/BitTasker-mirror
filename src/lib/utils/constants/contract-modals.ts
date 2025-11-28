import type { ContractWithEvents } from '$lib/types/contract';

// Modal action types
export enum ContractModalAction {
	None = 'none',
	Complete = 'complete',
	Accept = 'accept',
	Dispute = 'dispute',
	Cancel = 'cancel',
	Delete = 'delete'
}

// Modal configuration interface
export interface ContractModalConfig {
	titleKey: string;
	messageKey: string;
	confirmTextKey: string;
	cancelTextKey: string;
	confirmButtonClass: string;
	// Function to execute when confirmed
	onConfirm: (contract: ContractWithEvents) => Promise<void>;
}

// Placeholder functions - will be injected from component
let executeAccept: (contract: ContractWithEvents) => Promise<void>;
let executeDispute: (contract: ContractWithEvents) => Promise<void>;
let executeCancel: (contract: ContractWithEvents) => Promise<void>;
let executeDelete: (contract: ContractWithEvents) => Promise<void>;

// Initialize handlers (called from component)
export function initContractModalHandlers(handlers: {
	acceptTask: (contract: ContractWithEvents) => Promise<void>;
	disputeTask: (contract: ContractWithEvents) => Promise<void>;
	cancelEscrow: (contract: ContractWithEvents) => Promise<void>;
	deleteContract: (contract: ContractWithEvents) => Promise<void>;
}) {
	executeAccept = handlers.acceptTask;
	executeDispute = handlers.disputeTask;
	executeCancel = handlers.cancelEscrow;
	executeDelete = handlers.deleteContract;
}

// Modal configurations mapping
export const CONTRACT_MODAL_CONFIGS: Record<ContractModalAction, ContractModalConfig | null> = {
	[ContractModalAction.None]: null,
	[ContractModalAction.Complete]: null, // Uses custom modal (TaskCompletionModal)
	[ContractModalAction.Accept]: {
		titleKey: 'dashboard.contracts.actions.accept_work_confirm_title',
		messageKey: 'dashboard.contracts.actions.accept_work_confirm_message',
		confirmTextKey: 'dashboard.contracts.actions.accept_work',
		cancelTextKey: 'dashboard.contracts.actions.cancel',
		confirmButtonClass: 'btn-success',
		onConfirm: async (contract) => await executeAccept(contract)
	},
	[ContractModalAction.Dispute]: {
		titleKey: 'dashboard.contracts.actions.dispute_work_confirm_title',
		messageKey: 'dashboard.contracts.actions.dispute_work_confirm_message',
		confirmTextKey: 'dashboard.contracts.actions.dispute_work',
		cancelTextKey: 'dashboard.contracts.actions.cancel',
		confirmButtonClass: 'btn-error',
		onConfirm: async (contract) => await executeDispute(contract)
	},
	[ContractModalAction.Cancel]: {
		titleKey: 'dashboard.contracts.actions.cancel_contract_confirm_title',
		messageKey: 'dashboard.contracts.actions.cancel_contract_confirm_message',
		confirmTextKey: 'dashboard.contracts.actions.cancel_contract',
		cancelTextKey: 'dashboard.contracts.actions.cancel',
		confirmButtonClass: 'btn-error',
		onConfirm: async (contract) => await executeCancel(contract)
	},
	[ContractModalAction.Delete]: {
		titleKey: 'dashboard.contracts.actions.delete_contract_confirm_title',
		messageKey: 'dashboard.contracts.actions.delete_contract_confirm_message',
		confirmTextKey: 'dashboard.contracts.actions.delete_contract',
		cancelTextKey: 'dashboard.contracts.actions.cancel',
		confirmButtonClass: 'btn-error',
		onConfirm: async (contract) => await executeDelete(contract)
	}
};


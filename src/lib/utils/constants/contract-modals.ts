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
}

// Modal configurations mapping (no onConfirm functions)
export const CONTRACT_MODAL_CONFIGS: Record<ContractModalAction, ContractModalConfig | null> = {
	[ContractModalAction.None]: null,
	[ContractModalAction.Complete]: null, // Uses custom modal (TaskCompletionModal)
	[ContractModalAction.Accept]: {
		titleKey: 'dashboard.contracts.actions.accept_work_confirm_title',
		messageKey: 'dashboard.contracts.actions.accept_work_confirm_message',
		confirmTextKey: 'dashboard.contracts.actions.accept_work',
		cancelTextKey: 'dashboard.contracts.actions.cancel',
		confirmButtonClass: 'btn-success'
	},
	[ContractModalAction.Dispute]: {
		titleKey: 'dashboard.contracts.actions.dispute_work_confirm_title',
		messageKey: 'dashboard.contracts.actions.dispute_work_confirm_message',
		confirmTextKey: 'dashboard.contracts.actions.dispute_work',
		cancelTextKey: 'dashboard.contracts.actions.cancel',
		confirmButtonClass: 'btn-error'
	},
	[ContractModalAction.Cancel]: {
		titleKey: 'dashboard.contracts.actions.cancel_contract_confirm_title',
		messageKey: 'dashboard.contracts.actions.cancel_contract_confirm_message',
		confirmTextKey: 'dashboard.contracts.actions.cancel_contract',
		cancelTextKey: 'dashboard.contracts.actions.cancel',
		confirmButtonClass: 'btn-error'
	},
	[ContractModalAction.Delete]: {
		titleKey: 'dashboard.contracts.actions.delete_contract_confirm_title',
		messageKey: 'dashboard.contracts.actions.delete_contract_confirm_message',
		confirmTextKey: 'dashboard.contracts.actions.delete_contract',
		cancelTextKey: 'dashboard.contracts.actions.cancel',
		confirmButtonClass: 'btn-error'
	}
};


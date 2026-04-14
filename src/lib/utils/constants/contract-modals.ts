// Modal action types
export enum ContractModalAction {
	None = 'none',
	Complete = 'complete',
	Accept = 'accept',
	Dispute = 'dispute',
	Cancel = 'cancel',
	Refund = 'refund',
	Delete = 'delete',
	MarkNoShow = 'mark_no_show',
	MarkWorkInProgress = 'mark_work_in_progress',
	ClaimNoShowRefund = 'claim_no_show_refund',
	AcceptProposal = 'accept_proposal',
	ResolveAfterTimelock = 'resolve_after_timelock',
	ProposeResolution = 'propose_resolution'
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
	[ContractModalAction.Refund]: {
		titleKey: 'dashboard.contracts.actions.refund_tasker_confirm_title',
		messageKey: 'dashboard.contracts.actions.refund_tasker_confirm_message',
		confirmTextKey: 'dashboard.contracts.actions.refund_tasker',
		cancelTextKey: 'dashboard.contracts.actions.cancel',
		confirmButtonClass: 'btn-error'
	},
	[ContractModalAction.Delete]: {
		titleKey: 'dashboard.contracts.actions.delete_contract_confirm_title',
		messageKey: 'dashboard.contracts.actions.delete_contract_confirm_message',
		confirmTextKey: 'dashboard.contracts.actions.delete_contract',
		cancelTextKey: 'dashboard.contracts.actions.cancel',
		confirmButtonClass: 'btn-error'
	},
	[ContractModalAction.MarkNoShow]: {
		titleKey: 'dashboard.contracts.actions.mark_no_show_confirm_title',
		messageKey: 'dashboard.contracts.actions.mark_no_show_confirm_message',
		confirmTextKey: 'dashboard.contracts.actions.mark_no_show',
		cancelTextKey: 'dashboard.contracts.actions.cancel',
		confirmButtonClass: 'btn-warning'
	},
	[ContractModalAction.MarkWorkInProgress]: {
		titleKey: 'dashboard.contracts.actions.mark_work_in_progress_confirm_title',
		messageKey: 'dashboard.contracts.actions.mark_work_in_progress_confirm_message',
		confirmTextKey: 'dashboard.contracts.actions.mark_work_in_progress',
		cancelTextKey: 'dashboard.contracts.actions.cancel',
		confirmButtonClass: 'btn-success'
	},
	[ContractModalAction.ClaimNoShowRefund]: {
		titleKey: 'dashboard.contracts.actions.claim_no_show_refund_confirm_title',
		messageKey: 'dashboard.contracts.actions.claim_no_show_refund_confirm_message',
		confirmTextKey: 'dashboard.contracts.actions.claim_no_show_refund',
		cancelTextKey: 'dashboard.contracts.actions.cancel',
		confirmButtonClass: 'btn-warning'
	},
	[ContractModalAction.AcceptProposal]: {
		titleKey: 'dashboard.contracts.actions.accept_proposal_confirm_title',
		messageKey: 'dashboard.contracts.actions.accept_proposal_confirm_message',
		confirmTextKey: 'dashboard.contracts.actions.accept_proposal',
		cancelTextKey: 'dashboard.contracts.actions.cancel',
		confirmButtonClass: 'btn-success'
	},
	[ContractModalAction.ResolveAfterTimelock]: {
		titleKey: 'dashboard.contracts.actions.resolve_timelock_confirm_title',
		messageKey: 'dashboard.contracts.actions.resolve_timelock_confirm_message',
		confirmTextKey: 'dashboard.contracts.actions.resolve_timelock',
		cancelTextKey: 'dashboard.contracts.actions.cancel',
		confirmButtonClass: 'btn-warning'
	},
	[ContractModalAction.ProposeResolution]: null
};

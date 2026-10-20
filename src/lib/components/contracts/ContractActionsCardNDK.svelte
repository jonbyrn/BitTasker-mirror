<script lang="ts">
	import { get } from 'svelte/store';
	import { t } from 'svelte-i18n';
	import ConfirmModal from '$lib/components/ConfirmModal.svelte';
	import TaskCompletionDrawerNDK from '$lib/components/contracts/TaskCompletionDrawerNDK.svelte';
	import ProposeResolutionModalNDK from '$lib/components/contracts/ProposeResolutionModalNDK.svelte';
	import ResolutionProposalSplitDisplay from '$lib/components/contracts/ResolutionProposalSplitDisplay.svelte';
	import { PaymentContractRune } from '$lib/runes/contractRune.svelte';
	import { appStore } from '$lib/stores/app.store';
	import type { Attachment } from '$lib/types/task';
	import {
		ContractModalAction,
		CONTRACT_MODAL_CONFIGS
	} from '$lib/utils/constants/contract-modals';
	import { createDebug } from '$lib/utils/debug';
	import { portal } from '$lib/utils/portal';
	import IconCheck from '~icons/mdi/check';
	import IconThumbUpOutline from '~icons/mdi/thumb-up-outline';
	import IconCashRefund from '~icons/mdi/cash-refund';
	import IconCancel from '~icons/mdi/cancel';
	import IconProgressClock from '~icons/mdi/progress-clock';
	import IconCashMarker from '~icons/mdi/cash-marker';
	import IconGavel from '~icons/mdi/gavel';
	import IconHandshakeOutline from '~icons/mdi/handshake-outline';
	import IconTimerOutline from '~icons/mdi/timer-outline';
	import IconInformationOutline from '~icons/mdi/information-outline';
	import SubmitWorkLock from '$lib/components/contracts/SubmitWorkLock.svelte';

	const d = createDebug('contracts:actionsCardNDK');

	let {
		contractRune,
		btcPrice = 0,
		onOpenDrawer,
		onContractCompleted
	}: {
		contractRune: PaymentContractRune;
		btcPrice?: number;
		onOpenDrawer: () => void;
		onContractCompleted?: () => void;
	} = $props();

	/** Primary action: happy path forward for the current role */
	const primaryAction = $derived.by(() => {
		const p = contractRune.permittedActions;
		const isTasker = contractRune.isTasker;
		if (contractRune.chainIsTerminal) return null;

		if (isTasker) {
			if (p.canAcceptTask)
				return {
					action: ContractModalAction.Accept,
					icon: IconThumbUpOutline,
					btnClass: 'btn-outline btn-success',
					labelKey: 'dashboard.contracts.actions.approve'
				};
			if (p.canClaimNoShowRefund)
				return {
					action: ContractModalAction.ClaimNoShowRefund,
					icon: IconCashMarker,
					btnClass: 'btn-outline btn-error',
					labelKey: 'dashboard.contracts.actions.claim_no_show_refund'
				};
			if (p.canResolveAfterTimelock)
				return {
					action: ContractModalAction.ResolveTimelock,
					icon: IconTimerOutline,
					btnClass: 'btn-outline btn-error',
					labelKey: 'dashboard.contracts.actions.resolve_timelock'
				};
			if (p.canProposeResolution)
				return {
					action: ContractModalAction.ProposeResolution,
					icon: IconHandshakeOutline,
					btnClass: 'btn-neutral',
					labelKey: 'dashboard.contracts.actions.propose_resolution'
				};
			if (p.canDisputeTask)
				return {
					action: ContractModalAction.Dispute,
					icon: IconGavel,
					btnClass: 'btn-error',
					labelKey: 'dashboard.contracts.actions.dispute_work'
				};
			if (p.canCancelPaymentContract)
				return {
					action: ContractModalAction.Cancel,
					icon: IconCancel,
					btnClass: 'btn-error btn-outline',
					labelKey: 'dashboard.contracts.actions.cancel'
				};
		} else {
			if (p.canCompleteTask)
				return {
					action: ContractModalAction.Complete,
					icon: IconCheck,
					btnClass: 'btn-outline btn-success',
					labelKey: 'dashboard.contracts.actions.complete'
				};
			if (p.canMarkWorkInProgress)
				return {
					action: ContractModalAction.MarkWorkInProgress,
					icon: IconProgressClock,
					btnClass: 'btn-neutral',
					labelKey: 'dashboard.contracts.actions.mark_work_in_progress'
				};
			if (p.canRefundTasker)
				return {
					action: ContractModalAction.Refund,
					icon: IconCashRefund,
					btnClass: 'btn-warning text-gray-800',
					labelKey: 'dashboard.contracts.actions.refund'
				};
			if (p.canProposeResolution)
				return {
					action: ContractModalAction.ProposeResolution,
					icon: IconHandshakeOutline,
					btnClass: 'btn-neutral',
					labelKey: 'dashboard.contracts.actions.propose_resolution'
				};
			if (p.canDisputeTask)
				return {
					action: ContractModalAction.Dispute,
					icon: IconGavel,
					btnClass: 'btn-error',
					labelKey: 'dashboard.contracts.actions.dispute_work'
				};
			if (p.canCancelPaymentContract)
				return {
					action: ContractModalAction.Cancel,
					icon: IconCancel,
					btnClass: 'btn-error btn-outline',
					labelKey: 'dashboard.contracts.actions.cancel'
				};
		}
		return null;
	});

	let pendingAction = $state<ContractModalAction | null>(null);
	let activeModal = $state<ContractModalAction>(ContractModalAction.None);

	const isBusy = $derived(pendingAction !== null);

	function openModal(action: ContractModalAction) {
		activeModal = action;
	}

	function closeModal() {
		activeModal = ContractModalAction.None;
	}

	async function handleCompletionSubmit(attachments: Attachment[], completionText?: string) {
		if (isBusy) return;
		pendingAction = ContractModalAction.Complete;
		try {
			const res = await contractRune.markTaskComplete(attachments, completionText);
			if (!res.ok) {
				appStore.showErrorToast(get(t)('dashboard.contracts.actions.contract_action_failed'));
				throw new Error('markTaskComplete failed');
			}
			appStore.showSuccessToast(get(t)('dashboard.contracts.actions.task_completed_success'));
			onContractCompleted?.();
		} finally {
			pendingAction = null;
		}
	}

	async function runAcceptWork() {
		if (isBusy) return;
		pendingAction = ContractModalAction.Accept;
		try {
			const res = await contractRune.acceptTask();
			if (!res.ok) {
				appStore.showErrorToast(get(t)('dashboard.contracts.actions.contract_action_failed'));
				return;
			}
			appStore.showSuccessToast(get(t)('dashboard.contracts.actions.payment_released_success'));
			onContractCompleted?.();
		} finally {
			pendingAction = null;
		}
	}

	async function runRefundTasker() {
		if (isBusy) return;
		pendingAction = ContractModalAction.Refund;
		try {
			const res = await contractRune.refundTasker();
			if (!res.ok) {
				appStore.showErrorToast(get(t)('dashboard.contracts.actions.contract_action_failed'));
				return;
			}
			appStore.showSuccessToast(get(t)('dashboard.contracts.actions.refund_tasker_success'));
		} finally {
			pendingAction = null;
		}
	}

	async function runCancelContract() {
		if (isBusy) return;
		pendingAction = ContractModalAction.Cancel;
		try {
			const res = await contractRune.cancelPaymentContract();
			if (!res.ok) {
				appStore.showErrorToast(get(t)('dashboard.contracts.actions.contract_action_failed'));
				return;
			}
			appStore.showSuccessToast(get(t)('dashboard.contracts.actions.cancel_contract_success'));
		} finally {
			pendingAction = null;
		}
	}

	async function runMarkNoShow() {
		if (isBusy) return;
		pendingAction = ContractModalAction.MarkNoShow;
		try {
			const res = await contractRune.markNoShow();
			if (!res.ok) {
				appStore.showErrorToast(get(t)('dashboard.contracts.actions.contract_action_failed'));
				return;
			}
			appStore.showSuccessToast(get(t)('dashboard.contracts.actions.mark_no_show_success'));
		} finally {
			pendingAction = null;
		}
	}

	async function runMarkWorkInProgress() {
		if (isBusy) return;
		pendingAction = ContractModalAction.MarkWorkInProgress;
		try {
			const res = await contractRune.markWorkInProgress();
			if (!res.ok) {
				appStore.showErrorToast(get(t)('dashboard.contracts.actions.contract_action_failed'));
				return;
			}
			appStore.showSuccessToast(
				get(t)('dashboard.contracts.actions.mark_work_in_progress_success')
			);
		} finally {
			pendingAction = null;
		}
	}

	async function runClaimNoShowRefund() {
		if (isBusy) return;
		pendingAction = ContractModalAction.ClaimNoShowRefund;
		try {
			const res = await contractRune.claimNoShowRefund();
			if (!res.ok) {
				appStore.showErrorToast(get(t)('dashboard.contracts.actions.contract_action_failed'));
				return;
			}
			appStore.showSuccessToast(get(t)('dashboard.contracts.actions.claim_no_show_refund_success'));
		} finally {
			pendingAction = null;
		}
	}

	async function runDisputeTask() {
		if (isBusy) return;
		pendingAction = ContractModalAction.Dispute;
		try {
			const res = await contractRune.disputeTask();
			if (!res.ok) {
				appStore.showErrorToast(get(t)('dashboard.contracts.actions.contract_action_failed'));
				return;
			}
			appStore.showSuccessToast(get(t)('dashboard.contracts.actions.dispute_raised_success'));
		} finally {
			pendingAction = null;
		}
	}

	async function handleProposeResolutionSubmit(taskeeAmountWei: bigint) {
		if (isBusy) return;
		pendingAction = ContractModalAction.ProposeResolution;
		try {
			const res = await contractRune.proposeResolution(taskeeAmountWei);
			if (!res.ok) {
				appStore.showErrorToast(get(t)('dashboard.contracts.actions.contract_action_failed'));
				throw new Error('proposeResolution failed');
			}
			appStore.showSuccessToast(get(t)('dashboard.contracts.actions.propose_resolution_success'));
		} finally {
			pendingAction = null;
		}
	}

	async function runAcceptProposal() {
		if (isBusy) return;
		pendingAction = ContractModalAction.AcceptProposal;
		try {
			const res = await contractRune.acceptProposal();
			if (!res.ok) {
				appStore.showErrorToast(get(t)('dashboard.contracts.actions.contract_action_failed'));
				return;
			}
			appStore.showSuccessToast(get(t)('dashboard.contracts.actions.accept_proposal_success'));
			onContractCompleted?.();
		} finally {
			pendingAction = null;
		}
	}

	async function runResolveAfterTimelock() {
		if (isBusy) return;
		pendingAction = ContractModalAction.ResolveTimelock;
		try {
			const res = await contractRune.resolveAfterTimelock();
			if (!res.ok) {
				appStore.showErrorToast(get(t)('dashboard.contracts.actions.contract_action_failed'));
				return;
			}
			appStore.showSuccessToast(get(t)('dashboard.contracts.actions.resolve_timelock_success'));
			onContractCompleted?.();
		} finally {
			pendingAction = null;
		}
	}

	async function handleModalConfirm() {
		const action = activeModal;
		closeModal();
		switch (action) {
			case ContractModalAction.Accept:
				await runAcceptWork();
				break;
			case ContractModalAction.Refund:
				await runRefundTasker();
				break;
			case ContractModalAction.Cancel:
				await runCancelContract();
				break;
			case ContractModalAction.MarkNoShow:
				await runMarkNoShow();
				break;
			case ContractModalAction.MarkWorkInProgress:
				await runMarkWorkInProgress();
				break;
			case ContractModalAction.ClaimNoShowRefund:
				await runClaimNoShowRefund();
				break;
			case ContractModalAction.Dispute:
				await runDisputeTask();
				break;
			case ContractModalAction.AcceptProposal:
				await runAcceptProposal();
				break;
			case ContractModalAction.ResolveTimelock:
				await runResolveAfterTimelock();
				break;
			default:
				d.warn('unexpected modal action', action);
		}
	}
</script>

<div class="flex flex-1 flex-col gap-2 md:flex-none">
	{#if contractRune.submitWorkLockedUntil}
		<SubmitWorkLock unlockAt={contractRune.submitWorkLockedUntil} />
	{/if}
	<div class="flex flex-row gap-2 md:flex-wrap md:justify-end">
		{#if primaryAction}
			<button
				type="button"
				class="btn btn-sm flex-1 md:flex-none {primaryAction.btnClass}"
				disabled={contractRune.isPending || isBusy}
				onclick={() => openModal(primaryAction.action)}
			>
				{#if pendingAction === primaryAction.action}
					<span class="loading loading-spinner loading-xs"></span>
				{:else}
					<primaryAction.icon class="h-4 w-4 shrink-0" />
				{/if}
				<span>{$t(primaryAction.labelKey)}</span>
			</button>
		{/if}

		<button type="button" class="btn btn-outline btn-sm flex-1 md:flex-none" onclick={onOpenDrawer}>
			<IconInformationOutline class="h-4 w-4" />
			<span>{$t('dashboard.contracts.actions.view_details')}</span>
		</button>
	</div>
</div>

{#if activeModal === ContractModalAction.Complete}
	<div use:portal={'modals'}>
		<TaskCompletionDrawerNDK
			{contractRune}
			isOpen={true}
			{btcPrice}
			onClose={closeModal}
			onComplete={handleCompletionSubmit}
		/>
	</div>
{/if}

{#if activeModal === ContractModalAction.ProposeResolution}
	<div use:portal={'modals'}>
		<ProposeResolutionModalNDK
			{contractRune}
			isOpen={true}
			{btcPrice}
			chainBusy={isBusy || contractRune.isPending}
			onClose={closeModal}
			onPropose={handleProposeResolutionSubmit}
		/>
	</div>
{/if}

{#if activeModal === ContractModalAction.AcceptProposal}
	{@const config = CONTRACT_MODAL_CONFIGS[ContractModalAction.AcceptProposal]}
	{#if config}
		<div use:portal={'modals'}>
			<ConfirmModal
				isOpen={true}
				modalBoxClass="max-w-lg"
				title={$t(config.titleKey)}
				message={$t(config.messageKey)}
				confirmText={$t(config.confirmTextKey)}
				cancelText={$t(config.cancelTextKey)}
				confirmButtonClass={config.confirmButtonClass}
				onConfirm={handleModalConfirm}
				onCancel={closeModal}
			>
				{#if contractRune.pendingResolutionProposal}
					<ResolutionProposalSplitDisplay
						taskerShareWei={contractRune.pendingResolutionProposal.taskerWei}
						taskeeShareWei={contractRune.pendingResolutionProposal.taskeeWei}
						currency={contractRune.contract.currency}
						{btcPrice}
						isTasker={contractRune.isTasker}
						proposerIsTasker={contractRune.pendingResolutionProposal.proposerIsTasker}
					/>
				{:else}
					<div class="alert alert-outline alert-info text-sm">
						<span>{$t('dashboard.contracts.actions.resolution_proposal_preview_unavailable')}</span>
					</div>
				{/if}
			</ConfirmModal>
		</div>
	{/if}
{:else if activeModal !== ContractModalAction.None && activeModal !== ContractModalAction.Complete && activeModal !== ContractModalAction.ProposeResolution}
	{@const config = CONTRACT_MODAL_CONFIGS[activeModal]}
	{#if config}
		<div use:portal={'modals'}>
			<ConfirmModal
				isOpen={true}
				title={$t(config.titleKey)}
				message={$t(config.messageKey)}
				confirmText={$t(config.confirmTextKey)}
				cancelText={$t(config.cancelTextKey)}
				confirmButtonClass={config.confirmButtonClass}
				onConfirm={handleModalConfirm}
				onCancel={closeModal}
			/>
		</div>
	{/if}
{/if}

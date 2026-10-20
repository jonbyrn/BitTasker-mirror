<script lang="ts">
	import { get } from 'svelte/store';
	import { t } from 'svelte-i18n';
	import ConfirmModal from '$lib/components/ConfirmModal.svelte';
	import TaskCompletionDrawerNDK from '$lib/components/contracts/TaskCompletionDrawerNDK.svelte';
	import ProposeResolutionModalNDK from '$lib/components/contracts/ProposeResolutionModalNDK.svelte';
	import ResolutionProposalSplitDisplay from '$lib/components/contracts/ResolutionProposalSplitDisplay.svelte';
	import { PaymentContractRune } from '$lib/runes/contractRune.svelte';
	import { appStore } from '$lib/stores/app.store';
	import { completeTaskErrorKey } from '$lib/utils/contract/completeTaskFailure';
	import type { Attachment } from '$lib/types/task';
	import {
		ContractModalAction,
		CONTRACT_MODAL_CONFIGS
	} from '$lib/utils/constants/contract-modals';
	import { createDebug } from '$lib/utils/debug';
	import { portal } from '$lib/utils/portal';
	import SubmitWorkLock from '$lib/components/contracts/SubmitWorkLock.svelte';
	import IconCheck from '~icons/mdi/check';
	import IconThumbUpOutline from '~icons/mdi/thumb-up-outline';
	import IconCashRefund from '~icons/mdi/cash-refund';
	import IconCancel from '~icons/mdi/cancel';
	import IconAccountAlertOutline from '~icons/mdi/account-alert-outline';
	import IconProgressClock from '~icons/mdi/progress-clock';
	import IconCashMarker from '~icons/mdi/cash-marker';
	import IconGavel from '~icons/mdi/gavel';
	import IconHandshakeOutline from '~icons/mdi/handshake-outline';
	import IconTimerOutline from '~icons/mdi/timer-outline';

	const d = createDebug('contracts:actionsDrawerNDK');

	let {
		contractRune,
		btcPrice = 0,
		onContractCompleted
	}: {
		contractRune: PaymentContractRune;
		btcPrice?: number;
		onContractCompleted?: () => void;
	} = $props();

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
		d.log('markTaskComplete after uploads', {
			count: attachments.length,
			text: completionText ?? 'none',
			keys: attachments.map((a) => a.key)
		});
		if (isBusy) return;
		pendingAction = ContractModalAction.Complete;
		try {
			const res = await contractRune.markTaskComplete(attachments, completionText);
			if (!res.ok) {
				throw new Error(completeTaskErrorKey(res.errorCode));
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
			appStore.showSuccessToast(get(t)('dashboard.contracts.actions.approve_success'));
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

{#if contractRune.submitWorkLockedUntil}
	<SubmitWorkLock unlockAt={contractRune.submitWorkLockedUntil} />
{/if}
<!-- Row 1: All buttons in display order - AcceptProposal at end so it's right-most when wrapping -->
<div class="flex w-full flex-row flex-wrap gap-2 md:flex-nowrap">
	{#if contractRune.permittedActions.canCompleteTask}
		<button
			type="button"
			class="btn btn-outline btn-success btn-sm flex-1 md:flex-none"
			disabled={contractRune.isPending || isBusy}
			onclick={() => openModal(ContractModalAction.Complete)}
		>
			{#if pendingAction === ContractModalAction.Complete}
				<span class="loading loading-spinner loading-xs"></span>
			{/if}
			<IconCheck class="h-4 w-4 shrink-0" />
			<span>{$t('dashboard.contracts.actions.complete')}</span>
		</button>
	{/if}

	{#if contractRune.permittedActions.canAcceptTask}
		<button
			type="button"
			class="btn btn-outline btn-success btn-sm flex-1 md:flex-none"
			disabled={contractRune.isPending || isBusy}
			onclick={() => openModal(ContractModalAction.Accept)}
		>
			{#if pendingAction === ContractModalAction.Accept}
				<span class="loading loading-spinner loading-xs"></span>
			{/if}
			<IconThumbUpOutline class="h-4 w-4" />
			<span>{$t('dashboard.contracts.actions.approve')}</span>
		</button>
	{/if}

	{#if contractRune.permittedActions.canRefundTasker}
		<button
			type="button"
			class="btn btn-warning btn-sm flex-1 text-gray-800 md:flex-none"
			disabled={contractRune.isPending || isBusy}
			onclick={() => openModal(ContractModalAction.Refund)}
		>
			{#if pendingAction === ContractModalAction.Refund}
				<span class="loading loading-spinner loading-xs"></span>
			{/if}
			<IconCashRefund class="h-4 w-4" />
			<span>{$t('dashboard.contracts.actions.refund')}</span>
		</button>
	{/if}

	{#if contractRune.permittedActions.canCancelPaymentContract}
		<button
			type="button"
			class="btn btn-error btn-outline btn-sm flex-1 md:flex-none"
			disabled={contractRune.isPending || isBusy}
			onclick={() => openModal(ContractModalAction.Cancel)}
		>
			{#if pendingAction === ContractModalAction.Cancel}
				<span class="loading loading-spinner loading-xs"></span>
			{/if}
			<IconCancel class="h-4 w-4" />
			<span>{$t('dashboard.contracts.actions.cancel')}</span>
		</button>
	{/if}

	{#if contractRune.permittedActions.canMarkNoShow}
		<button
			type="button"
			class="btn btn-neutral btn-sm flex-1 md:flex-none"
			disabled={contractRune.isPending || isBusy}
			onclick={() => openModal(ContractModalAction.MarkNoShow)}
		>
			{#if pendingAction === ContractModalAction.MarkNoShow}
				<span class="loading loading-spinner loading-xs"></span>
			{/if}
			<IconAccountAlertOutline class="h-4 w-4" />
			<span>{$t('dashboard.contracts.actions.mark_no_show')}</span>
		</button>
	{/if}

	{#if contractRune.permittedActions.canMarkWorkInProgress}
		<button
			type="button"
			class="btn btn-neutral btn-sm flex-1 md:flex-none"
			disabled={contractRune.isPending || isBusy}
			onclick={() => openModal(ContractModalAction.MarkWorkInProgress)}
		>
			{#if pendingAction === ContractModalAction.MarkWorkInProgress}
				<span class="loading loading-spinner loading-xs"></span>
			{/if}
			<IconProgressClock class="h-4 w-4" />
			<span>{$t('dashboard.contracts.actions.mark_work_in_progress')}</span>
		</button>
	{/if}

	{#if contractRune.permittedActions.canClaimNoShowRefund}
		<button
			type="button"
			class="btn btn-outline btn-error btn-sm flex-1 md:flex-none"
			disabled={contractRune.isPending || isBusy}
			onclick={() => openModal(ContractModalAction.ClaimNoShowRefund)}
		>
			{#if pendingAction === ContractModalAction.ClaimNoShowRefund}
				<span class="loading loading-spinner loading-xs"></span>
			{/if}
			<IconCashMarker class="h-4 w-4" />
			<span>{$t('dashboard.contracts.actions.claim_no_show_refund')}</span>
		</button>
	{/if}

	{#if contractRune.permittedActions.canDisputeTask}
		<button
			type="button"
			class="btn btn-error btn-sm flex-1 md:flex-none"
			disabled={contractRune.isPending || isBusy}
			onclick={() => openModal(ContractModalAction.Dispute)}
		>
			{#if pendingAction === ContractModalAction.Dispute}
				<span class="loading loading-spinner loading-xs"></span>
			{/if}
			<IconGavel class="h-4 w-4" />
			<span>{$t('dashboard.contracts.actions.dispute_work')}</span>
		</button>
	{/if}

	{#if contractRune.permittedActions.canProposeResolution}
		<button
			type="button"
			class="btn btn-neutral btn-sm flex-1 md:flex-none"
			disabled={contractRune.isPending || isBusy}
			onclick={() => openModal(ContractModalAction.ProposeResolution)}
		>
			{#if pendingAction === ContractModalAction.ProposeResolution}
				<span class="loading loading-spinner loading-xs"></span>
			{/if}
			<IconHandshakeOutline class="h-4 w-4" />
			<span>{$t('dashboard.contracts.actions.propose_resolution')}</span>
		</button>
	{/if}

	{#if contractRune.permittedActions.canResolveAfterTimelock}
		<button
			type="button"
			class="btn btn-outline btn-error btn-sm flex-1 md:flex-none"
			disabled={contractRune.isPending || isBusy}
			onclick={() => openModal(ContractModalAction.ResolveTimelock)}
		>
			{#if pendingAction === ContractModalAction.ResolveTimelock}
				<span class="loading loading-spinner loading-xs"></span>
			{/if}
			<IconTimerOutline class="h-4 w-4" />
			<span>{$t('dashboard.contracts.actions.resolve_timelock')}</span>
		</button>
	{/if}

	{#if contractRune.permittedActions.canAcceptProposal}
		<button
			type="button"
			class="btn btn-success btn-outline btn-sm flex-none"
			disabled={contractRune.isPending || isBusy}
			onclick={() => openModal(ContractModalAction.AcceptProposal)}
		>
			{#if pendingAction === ContractModalAction.AcceptProposal}
				<span class="loading loading-spinner loading-xs"></span>
			{/if}
			<IconThumbUpOutline class="h-4 w-4" />
			<span>{$t('dashboard.contracts.actions.accept_proposal')}</span>
		</button>
	{/if}
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

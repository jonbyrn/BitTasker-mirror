<script lang="ts">
	import { get } from 'svelte/store';
	import { t } from 'svelte-i18n';
	import ConfirmModal from '$lib/components/ConfirmModal.svelte';
	import TaskCompletionModalNDK from '$lib/components/contracts/TaskCompletionModalNDK.svelte';
	import { PaymentContractRune } from '$lib/runes/contractRune.svelte';
	import { appStore } from '$lib/stores/app.store';
	import type { Attachment } from '$lib/types/task';
	import {
		ContractModalAction,
		CONTRACT_MODAL_CONFIGS
	} from '$lib/utils/constants/contract-modals';
	import { createDebug } from '$lib/utils/debug';
	import { portal } from '$lib/utils/portal';

	const d = createDebug('contracts:actionsNDK');

	let { contractRune, btcPrice = 0 }: { contractRune: PaymentContractRune; btcPrice?: number } =
		$props();

	let busy = $state(false);
	let activeModal = $state<ContractModalAction>(ContractModalAction.None);

	function openModal(action: ContractModalAction) {
		activeModal = action;
	}

	function closeModal() {
		activeModal = ContractModalAction.None;
	}

	async function handleCompletionSubmit(attachments: Attachment[]) {
		d.log('markTaskComplete after uploads', {
			count: attachments.length,
			keys: attachments.map((a) => a.key)
		});
		if (busy) return;
		busy = true;
		try {
			const res = await contractRune.markTaskComplete(attachments);
			if (!res.ok) {
				appStore.showErrorToast(get(t)('dashboard.contracts.actions.contract_action_failed'));
				throw new Error('markTaskComplete failed');
			}
			appStore.showSuccessToast(get(t)('dashboard.contracts.actions.task_completed_success'));
		} finally {
			busy = false;
		}
	}

	async function runAcceptWork() {
		if (busy) return;
		busy = true;
		try {
			const res = await contractRune.acceptTask();
			if (!res.ok) {
				appStore.showErrorToast(get(t)('dashboard.contracts.actions.contract_action_failed'));
				return;
			}
			appStore.showSuccessToast(get(t)('dashboard.contracts.actions.accept_work_success'));
		} finally {
			busy = false;
		}
	}

	async function runRefundTasker() {
		if (busy) return;
		busy = true;
		try {
			const res = await contractRune.refundTasker();
			if (!res.ok) {
				appStore.showErrorToast(get(t)('dashboard.contracts.actions.contract_action_failed'));
				return;
			}
			appStore.showSuccessToast(get(t)('dashboard.contracts.actions.refund_tasker_success'));
		} finally {
			busy = false;
		}
	}

	async function runCancelContract() {
		if (busy) return;
		busy = true;
		try {
			const res = await contractRune.cancelPaymentContract();
			if (!res.ok) {
				appStore.showErrorToast(get(t)('dashboard.contracts.actions.contract_action_failed'));
				return;
			}
			appStore.showSuccessToast(get(t)('dashboard.contracts.actions.cancel_contract_success'));
		} finally {
			busy = false;
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
			default:
				d.warn('unexpected modal action', action);
		}
	}
</script>

<div class="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
	{#if contractRune.permittedActions.canCompleteTask}
		<button
			type="button"
			class="btn btn-primary btn-sm w-full sm:w-auto"
			disabled={contractRune.isPending || busy}
			onclick={() => openModal(ContractModalAction.Complete)}
		>
			{#if busy || contractRune.isPending}
				<span class="loading loading-spinner loading-xs"></span>
			{/if}
			{$t('dashboard.contracts.actions.complete_task')}
		</button>
	{/if}
	{#if contractRune.permittedActions.canAcceptTask}
		<button
			type="button"
			class="btn btn-success btn-sm w-full sm:w-auto"
			disabled={contractRune.isPending || busy}
			onclick={() => openModal(ContractModalAction.Accept)}
		>
			{#if busy || contractRune.isPending}
				<span class="loading loading-spinner loading-xs"></span>
			{/if}
			{$t('dashboard.contracts.actions.accept_work')}
		</button>
	{/if}
	{#if contractRune.permittedActions.canRefundTasker}
		<button
			type="button"
			class="btn btn-warning btn-sm w-full sm:w-auto"
			disabled={contractRune.isPending || busy}
			onclick={() => openModal(ContractModalAction.Refund)}
		>
			{#if busy || contractRune.isPending}
				<span class="loading loading-spinner loading-xs"></span>
			{/if}
			{$t('dashboard.contracts.actions.refund_tasker')}
		</button>
	{/if}
	{#if contractRune.permittedActions.canCancelPaymentContract}
		<button
			type="button"
			class="btn btn-error btn-outline btn-sm w-full sm:w-auto"
			disabled={contractRune.isPending || busy}
			onclick={() => openModal(ContractModalAction.Cancel)}
		>
			{#if busy || contractRune.isPending}
				<span class="loading loading-spinner loading-xs"></span>
			{/if}
			{$t('dashboard.contracts.actions.cancel_contract')}
		</button>
	{/if}
</div>

{#if activeModal === ContractModalAction.Complete}
	<div use:portal={'modals'}>
		<TaskCompletionModalNDK
			{contractRune}
			isOpen={true}
			{btcPrice}
			onClose={closeModal}
			onComplete={handleCompletionSubmit}
		/>
	</div>
{/if}

{#if activeModal !== ContractModalAction.None && activeModal !== ContractModalAction.Complete}
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

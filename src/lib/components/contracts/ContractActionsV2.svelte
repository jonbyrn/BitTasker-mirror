<script lang="ts">
	import type { ContractWithEvents } from '$lib/types/contract';
	import type { Attachment } from '$lib/types/task';
	import { t } from 'svelte-i18n';
	import { escrow } from '$lib/utils/escrow';
	import { appStore } from '$lib/stores/app.store';
	import { getErrorMessage } from '$lib/utils/wallet/contractErrorHandler';
	import { contractStore } from '$lib/stores/contract.store';
	import ConfirmModal from '$lib/components/ConfirmModal.svelte';
	import TaskCompletionModal from './TaskCompletionModal.svelte';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';
	import {
		ContractModalAction,
		CONTRACT_MODAL_CONFIGS
	} from '$lib/utils/constants/contract-modals';
	import { portal } from '$lib/utils/portal';
	import { pushNotificationService } from '$lib/api/services/push-notification.service';
	import {
		sendTaskCompletionMessageToTasker,
		sendPaymentReleasedMessageToTaskee
	} from '$lib/utils/location/sendLocation';

	const {
		contract,
		containerClass = 'space-y-3',
		isInline = false,
		compactButtons = false
	} = $props<{
		contract: ContractWithEvents;
		containerClass?: string;
		isInline?: boolean;
		compactButtons?: boolean;
	}>();

	let isLoading = $state<Record<string, boolean>>({});
	let activeModal = $state<ContractModalAction>(ContractModalAction.None);
	let btcPrice = $state<number>(0);

	const isDisabledDueToPending = $derived(contract.isPending);

	function setLoading(action: string, loading: boolean) {
		isLoading = { ...isLoading, [action]: loading };
	}

	async function completeTaskWithAttachments(attachments: Attachment[]) {
		if (!contract.permissions.canComplete) return;
		if (contract.isPending) {
			appStore.showErrorToast($t('dashboard.contracts.actions.task_completion_pending'));
			return;
		}
		setLoading('complete', true);
		try {
			await escrow.escrowOps.completeTask(contract, attachments);
			pushNotificationService.sendNotificationToNpubs({
				npubs: [contractStore.getContractKey(contract, 'otherPartyNpub') as string],
				title: 'Task Completed',
				body: `Task ${contractStore.getContractKey(contract, 'taskTitle')} has been marked as completed`,
				type: 'task_completed',
				clickAction: `${import.meta.env.VITE_CLIENT_URL}/dashboard?tab=contracts`,
				icon: 'https://bittasker.com/images/Logos/BitTasker-square-logo.svg'
			});
			const clientPubkey = contractStore.getContractKey(contract, 'clientPubkey') as string;
			if (clientPubkey) {
				sendTaskCompletionMessageToTasker(clientPubkey, {
					taskId: contractStore.getContractKey(contract, 'taskId') as string,
					taskTitle: contractStore.getContractKey(contract, 'taskTitle') as string,
					escrowId: contract.escrowData.id
				}).catch((err: unknown) => console.error('Send task completion message failed', err));
			}
			await contractStore.loadContractByEscrowId(contract.escrowData.id);
		} catch (error) {
			const msg =
				error instanceof Error
					? getErrorMessage(error)
					: $t('dashboard.contracts.actions.task_completed_error');
			appStore.showErrorToast(msg);
		} finally {
			setLoading('complete', false);
		}
	}

	async function acceptTask() {
		if (!contract.permissions.canAccept) return;
		if (contract.isPending) {
			appStore.showErrorToast($t('dashboard.contracts.actions.payment_release_pending'));
			return;
		}
		setLoading('accept', true);
		try {
			await escrow.escrowOps.acceptTask(contract);
			const taskTitle = contractStore.getContractKey(contract, 'taskTitle') as string;
			const taskeeNpub = contractStore.getContractKey(contract, 'otherPartyNpub') as string;
			pushNotificationService.sendNotificationToNpubs({
				npubs: [taskeeNpub],
				title: $t('dashboard.contracts.actions.notification_payment_released_title'),
				body: $t('dashboard.contracts.actions.notification_payment_released_body', {
					values: { taskTitle: taskTitle || '' }
				}),
				type: 'payment_released',
				clickAction: `${import.meta.env.VITE_CLIENT_URL}/dashboard?tab=contracts`,
				icon: 'https://bittasker.com/images/Logos/BitTasker-square-logo.svg'
			});
			if (taskeeNpub) {
				sendPaymentReleasedMessageToTaskee(taskeeNpub, {
					taskId: contractStore.getContractKey(contract, 'taskId') as string,
					taskTitle: taskTitle || undefined
				}).catch((err: unknown) => console.error('Send payment released message failed', err));
			}
			await contractStore.loadContractByEscrowId(contract.escrowData.id);
		} catch (error) {
			const msg =
				error instanceof Error
					? getErrorMessage(error)
					: $t('dashboard.contracts.actions.payment_released_error');
			appStore.showErrorToast(msg);
		} finally {
			setLoading('accept', false);
		}
	}

	function openModal(action: ContractModalAction) {
		activeModal = action;
	}
	function closeModal() {
		activeModal = ContractModalAction.None;
	}
	async function handleModalConfirm() {
		if (activeModal === ContractModalAction.Accept) {
			await acceptTask();
		}
		closeModal();
	}

	$effect(() => {
		cryptoPriceService
			.getCurrentPrice('BTC')
			.then((p) => (btcPrice = p))
			.catch(() => {});
	});

	const isCompleteDisabled = $derived(isLoading.complete || contract.isPending);
	const isAcceptDisabled = $derived(isLoading.accept || contract.isPending);
</script>

<div class="{containerClass} {containerClass.includes('grid') ? 'w-full' : ''}">
	{#if contract.permissions.canComplete && !isCompleteDisabled && !isDisabledDueToPending}
		<button
			class="btn btn-success btn-sm {compactButtons
				? 'w-fit'
				: isInline
					? 'w-full sm:w-fit'
					: 'w-full min-w-0'}"
			onclick={() => (activeModal = ContractModalAction.Complete)}
		>
			{#if isLoading.complete}
				<span class="loading loading-spinner loading-xs"></span>
			{:else}
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-4 w-4"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
					/>
				</svg>
			{/if}
			{$t('dashboard.contracts.actions.complete_task')}
		</button>
	{/if}

	{#if contract.permissions.canAccept && !isAcceptDisabled && !isDisabledDueToPending}
		<button
			class="btn btn-success btn-sm {compactButtons
				? 'w-fit'
				: isInline
					? 'w-full sm:w-fit'
					: 'w-full min-w-0'}"
			onclick={() => openModal(ContractModalAction.Accept)}
		>
			{#if isLoading.accept}
				<span class="loading loading-spinner loading-xs"></span>
			{:else}
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-4 w-4"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
					/>
				</svg>
			{/if}
			{$t('dashboard.contracts.actions.accept_work')}
		</button>
	{/if}
</div>

<TaskCompletionModal
	{contract}
	isOpen={activeModal === ContractModalAction.Complete}
	onClose={closeModal}
	onComplete={async (attachments) => {
		await completeTaskWithAttachments(attachments);
		closeModal();
	}}
	{btcPrice}
/>

{#if activeModal === ContractModalAction.Accept}
	{@const config = CONTRACT_MODAL_CONFIGS[ContractModalAction.Accept]}
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

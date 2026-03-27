<script lang="ts">
	import type { ContractWithEvents, ContractStatusEvent } from '$lib/types/contract';
	import type { Attachment } from '$lib/types/task';
	import type { EscrowData } from '$lib/types/wallet';
	import { t, locale } from 'svelte-i18n';
	import { escrow, EscrowStatus } from '$lib/utils/escrow';
	import { appStore } from '$lib/stores/app.store';
	import { getErrorMessage } from '$lib/utils/wallet/contractErrorHandler';
	import { loadNamespace, type SupportedLanguage } from '$lib/i18n/i18n';
	import { browser } from '$app/environment';
	import { contractStore } from '$lib/stores/contract.store';
	import { pushNotificationService } from '$lib/api/services/push-notification.service';
	import ConfirmModal from '$lib/components/ConfirmModal.svelte';
	import TaskCompletionModal from './TaskCompletionModal.svelte';
	import ReviewPromptModal from '../reviews/ReviewPromptModal.svelte';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';
	import { SvelteMap } from 'svelte/reactivity';
	import {
		ContractModalAction,
		CONTRACT_MODAL_CONFIGS
	} from '$lib/utils/constants/contract-modals';
	import { portal } from '$lib/utils/portal';
	import { sendTaskCompletionMessageToTasker } from '$lib/utils/location/sendLocation';
	import IconSwapHorizontal from '~icons/mdi/swap-horizontal';

	const {
		contract,
		containerClass = 'space-y-3',
		isInline = false,
		compactButtons = false
	} = $props<{
		contract: ContractWithEvents;
		containerClass?: string;
		isInline?: boolean;
		/** When true, buttons size to content (w-fit) instead of full width - for drawers/narrow layouts */
		compactButtons?: boolean;
	}>();

	// State for actions
	let isLoading = $state<Record<string, boolean>>({});
	let activeModal = $state<ContractModalAction>(ContractModalAction.None);
	let showReviewModal = $state(false);
	let reviewEscrowTxHash = $state<string | undefined>(undefined);

	// Disable ALL critical actions when transaction is pending
	const isDisabledDueToPending = $derived(contract.isPending);

	// Resolution form state
	let proposedClientAmountUSD = $state('');
	let proposedFreelancerAmountUSD = $state('');
	let btcPrice = $state<number>(0); // No fallback price

	// Blockchain check cache (KEEP - performance optimization)
	let isCheckingBlockchain = $state(false);
	let blockchainCompletionStatus = $state<EscrowStatus | null>(null);

	// Blockchain check cache (30 second TTL)
	const blockchainCheckCache = new SvelteMap<
		string,
		{ status: EscrowStatus | null; timestamp: number }
	>();
	const BLOCKCHAIN_CACHE_TTL = 30000; // 30 seconds

	// Calculate proposal counts for each party
	// Use event.pubkey to identify who made each proposal (Nostr pubkey)
	const clientProposalCount = $derived(
		contract.statusEvents.filter(
			(e: ContractStatusEvent) =>
				e.content.action === EscrowStatus.DisputeResolutionProposed &&
				e.pubkey.toLowerCase() ===
					(contractStore.getContractKey(contract, 'clientPubkey') as string).toLowerCase()
		).length
	);

	const freelancerProposalCount = $derived(
		contract.statusEvents.filter(
			(e: ContractStatusEvent) =>
				e.content.action === EscrowStatus.DisputeResolutionProposed &&
				e.pubkey.toLowerCase() ===
					(contractStore.getContractKey(contract, 'otherPartyNpub') as string).toLowerCase()
		).length
	);

	// Get current user's proposal count
	const currentUserProposalCount = $derived(
		contract.isClient ? clientProposalCount : freelancerProposalCount
	);

	// Check if user has proposals left
	const hasProposalsLeft = $derived(currentUserProposalCount < 2);

	// Helper to set loading state
	function setLoading(action: string, loading: boolean) {
		isLoading = { ...isLoading, [action]: loading };
	}

	function openReviewPrompt(escrowTxHash?: string, delayMs: number = 1000): void {
		reviewEscrowTxHash = escrowTxHash;
		setTimeout(() => {
			showReviewModal = true;
		}, delayMs);
	}

	// Check if cancel is allowed based on time restrictions
	function canCancelBasedOnTime(): { allowed: boolean; reason?: string } {
		const now = Date.now();
		const estimatedStartTime = contractStore.getContractKey(contract, 'estimatedStartTime');
		const createdAt = contract.contractEvent.created_at;

		// Convert timestamps to milliseconds if they're in seconds
		const startTime =
			Number(estimatedStartTime) > 1000000000000
				? Number(estimatedStartTime)
				: Number(estimatedStartTime) * 1000;
		const createdTime =
			Number(createdAt) > 1000000000000 ? Number(createdAt) : Number(createdAt) * 1000;

		const hoursUntilStart = (Number(startTime) - now) / (1000 * 60 * 60);
		const hoursSinceCreation = (now - createdTime) / (1000 * 60 * 60);

		// Can cancel if more than 24 hours before estimated start time
		if (hoursUntilStart > 24) {
			return { allowed: true };
		}

		// Can cancel if less than 24 hours before start AND less than 1 hour since creation (grace period)
		if (hoursUntilStart <= 24 && hoursSinceCreation <= 1) {
			return { allowed: true };
		}

		// Cannot cancel otherwise
		return {
			allowed: false,
			reason:
				hoursUntilStart <= 24
					? $t('dashboard.contracts.actions.cancel_time_restriction_grace_period_expired')
					: $t('dashboard.contracts.actions.cancel_time_restriction_too_close')
		};
	}

	// Check blockchain completion status with caching
	async function checkBlockchainCompletionStatus(): Promise<boolean> {
		const cacheKey = contract.escrowData.id;
		const cached = blockchainCheckCache.get(cacheKey);
		const now = Date.now();

		// Use cached result if less than 30 seconds old
		if (cached && now - cached.timestamp < BLOCKCHAIN_CACHE_TTL) {
			blockchainCompletionStatus = cached.status;
			return cached.status === EscrowStatus.Completed;
		}

		try {
			isCheckingBlockchain = true;

			// Add timeout protection (5 seconds)
			const escrowData = (await Promise.race([
				escrow.escrowOps.loadEscrowDetails(contract),
				new Promise<null>((_, reject) =>
					setTimeout(() => reject(new Error('Blockchain check timeout')), 5000)
				)
			])) as EscrowData | null;

			const status = escrowData?.status || null;

			if (status === EscrowStatus.Completed) {
				blockchainCompletionStatus = EscrowStatus.Completed;
				blockchainCheckCache.set(cacheKey, { status, timestamp: now });
				return true;
			}

			blockchainCompletionStatus = status;
			blockchainCheckCache.set(cacheKey, { status, timestamp: now });
			return false;
		} catch (error) {
			if (error instanceof Error && error.message === 'Blockchain check timeout') {
				console.warn('Blockchain check timeout, allowing transaction to proceed');
				return false;
			}

			console.error('Error checking blockchain status:', error);
			return false;
		} finally {
			isCheckingBlockchain = false;
		}
	}

	// Complete task with attachments (freelancer only)
	async function completeTaskWithAttachments(attachments: Attachment[]) {
		if (!contract.permissions.canComplete) return;

		// Check if already pending via Nostr
		if (contract.isPending) {
			appStore.showErrorToast($t('dashboard.contracts.actions.task_completion_pending'));
			return;
		}

		// Check blockchain status before submitting (with caching)
		const isAlreadyCompleted = await checkBlockchainCompletionStatus();
		if (isAlreadyCompleted) {
			appStore.showErrorToast($t('dashboard.contracts.actions.task_already_completed'));
			return;
		}

		setLoading('complete', true);
		try {
			// Call RSK escrow completeTask - this publishes Nostr event with transactionHash
			const result = await escrow.escrowOps.completeTask(contract, attachments);

			pushNotificationService.sendNotificationToNpubs({
				npubs: [contractStore.getContractKey(contract, 'otherPartyNpub') as string],
				title: 'Task Completed',
				body: `Task ${contractStore.getContractKey(contract, 'taskTitle')} has been marked as completed`,
				type: 'task_completed',
				clickAction: `${import.meta.env.VITE_CLIENT_URL}/dashboard?tab=contracts`,
				icon: 'https://bittasker.com/images/Logos/BitTasker-square-logo.svg'
			});

			// Send task completion message to tasker (client)
			// This is done in the background without blocking the task completion flow
			const clientPubkey = contractStore.getContractKey(contract, 'clientPubkey') as string;
			if (clientPubkey) {
				// Send message asynchronously in background - don't block UI or fail on error
				sendTaskCompletionMessageToTasker(clientPubkey, {
					taskId: contractStore.getContractKey(contract, 'taskId') as string,
					taskTitle: contractStore.getContractKey(contract, 'taskTitle') as string,
					escrowId: contract.escrowData.id
				}).catch((messageError) => {
					// Log error but don't fail task completion if message sending fails
					console.error('Failed to send task completion message to tasker:', messageError);
				});
			}

			// Show review prompt after successful completion
			openReviewPrompt(result.hash, 2000);

			// Note: Status will be updated via blockchain event -> Nostr update
			// Loading will be cleared when contract.isPending becomes false
		} catch (error) {
			console.error('Error completing task:', error);

			const errorMessage =
				error instanceof Error
					? getErrorMessage(error)
					: $t('dashboard.contracts.actions.task_completed_error');
			appStore.showErrorToast(errorMessage);

			setLoading('complete', false);
		}
	}

	// Accept task (client only)
	async function acceptTask() {
		if (!contract.permissions.canAccept) return;

		// Check if already pending via Nostr
		if (contract.isPending) {
			appStore.showErrorToast($t('dashboard.contracts.actions.payment_release_pending'));
			return;
		}

		setLoading('accept', true);
		try {
			// Call RSK escrow acceptTask - this publishes Nostr event with transactionHash
			const result = await escrow.escrowOps.acceptTask(contract);

			pushNotificationService.sendNotificationToNpubs({
				npubs: [contractStore.getContractKey(contract, 'otherPartyNpub') as string],
				title: 'Payment Released',
				body: `Payment has been released for task ${contractStore.getContractKey(contract, 'taskTitle')}`,
				type: 'payment_released',
				clickAction: `${import.meta.env.VITE_CLIENT_URL}/dashboard?tab=contracts`,
				icon: 'https://bittasker.com/images/Logos/BitTasker-square-logo.svg'
			});

			// Show review prompt after successful acceptance
			openReviewPrompt(result.hash);

			// Note: Loading will be cleared when contract.isPending becomes false
		} catch (error) {
			console.error('Error accepting task:', error);

			const errorMessage =
				error instanceof Error
					? getErrorMessage(error)
					: $t('dashboard.contracts.actions.payment_released_error');
			appStore.showErrorToast(errorMessage);

			setLoading('accept', false);
		}
	}

	// Dispute task (client only)
	async function disputeTask() {
		if (!contract.permissions.canDispute)
			return console.log('User does not have permission to dispute task', contract);

		// Check if already pending via Nostr
		if (contract.isPending) {
			appStore.showErrorToast($t('dashboard.contracts.actions.dispute_raising_pending'));
			return;
		}

		setLoading('dispute', true);
		try {
			// Call RSK escrow disputeTask - this publishes Nostr event with transactionHash
			await escrow.escrowOps.disputeTask(contract);

			pushNotificationService.sendNotificationToNpubs({
				npubs: [contractStore.getContractKey(contract, 'otherPartyNpub') as string],
				title: 'Dispute Raised',
				body: `A dispute has been raised for task ${contractStore.getContractKey(contract, 'taskTitle')}`,
				type: 'dispute_raised',
				clickAction: `${import.meta.env.VITE_CLIENT_URL}/dashboard?tab=contracts`,
				icon: 'https://bittasker.com/images/Logos/BitTasker-square-logo.svg'
			});
		} catch (error) {
			console.error('Error disputing task:', error);

			const errorMessage =
				error instanceof Error
					? getErrorMessage(error)
					: $t('dashboard.contracts.actions.dispute_raised_error');
			appStore.showErrorToast(errorMessage);

			setLoading('dispute', false);
		}
	}

	// Propose resolution
	async function proposeResolution() {
		if (!contract.permissions.canPropose) return;
		if (!proposedFreelancerAmountUSD) {
			appStore.showErrorToast($t('dashboard.contracts.actions.resolution_amounts_required'));
			return;
		}

		// Convert USD amounts to RBTC for validation and contract call
		const freelancerAmountUSD = parseFloat(proposedFreelancerAmountUSD);
		const totalAmountRBTC = parseFloat(contractStore.getContractKey(contract, 'amount') as string);
		const totalAmountUSD = totalAmountRBTC * btcPrice;

		// Validate that freelancer amount is not greater than total
		if (freelancerAmountUSD > totalAmountUSD) {
			appStore.showErrorToast($t('dashboard.contracts.actions.resolution_amounts_invalid'));
			return;
		}

		// Convert USD amounts to RBTC for contract call
		const freelancerAmountRBTC = (freelancerAmountUSD / btcPrice).toFixed(8);
		const clientAmountUSD = totalAmountUSD - freelancerAmountUSD;
		const clientAmountRBTC = (clientAmountUSD / btcPrice).toFixed(8);

		setLoading('propose', true);
		try {
			// Call RSK escrow proposeResolution with contract event ID and amounts for proper nostr event publishing
			await escrow.escrowOps.proposeResolution(
				contract,
				freelancerAmountRBTC,
				clientAmountRBTC,
				freelancerAmountRBTC
			);

			pushNotificationService.sendNotificationToNpubs({
				npubs: [contractStore.getContractKey(contract, 'otherPartyNpub') as string],
				title: 'Resolution Proposed',
				body: `A resolution has been proposed for task ${contractStore.getContractKey(contract, 'taskTitle')}`,
				type: 'resolution_proposed',
				clickAction: `${import.meta.env.VITE_CLIENT_URL}/dashboard?tab=contracts`,
				icon: 'https://bittasker.com/images/Logos/BitTasker-square-logo.svg'
			});

			$contractStore.isResolutionFormOpen = false;
			proposedClientAmountUSD = '';
			proposedFreelancerAmountUSD = '';
		} catch (error) {
			console.error('Error proposing resolution:', error);
			const errorMessage =
				error instanceof Error
					? getErrorMessage(error)
					: $t('dashboard.contracts.actions.resolution_proposed_error');
			appStore.showErrorToast(errorMessage);
		} finally {
			setLoading('propose', false);
		}
	}

	// Accept proposal
	async function acceptProposal() {
		if (!contract.permissions.canAcceptProposal) return;

		setLoading('acceptProposal', true);
		try {
			// Call RSK escrow acceptProposal with contract event ID for proper nostr event publishing
			const result = await escrow.escrowOps.acceptProposal(contract);

			pushNotificationService.sendNotificationToNpubs({
				npubs: [contractStore.getContractKey(contract, 'otherPartyNpub') as string],
				title: 'Proposal Accepted',
				body: `A proposal has been accepted for task ${contractStore.getContractKey(contract, 'taskTitle')}`,
				type: 'proposal_accepted',
				clickAction: `${import.meta.env.VITE_CLIENT_URL}/dashboard?tab=contracts`,
				icon: 'https://bittasker.com/images/Logos/BitTasker-square-logo.svg'
			});

			// Show review prompt after successful proposal acceptance (dispute resolved)
			openReviewPrompt(result.hash);
		} catch (error) {
			console.error('Error accepting proposal:', error);
			const errorMessage =
				error instanceof Error
					? getErrorMessage(error)
					: $t('dashboard.contracts.actions.proposal_accepted_error');
			appStore.showErrorToast(errorMessage);
		} finally {
			setLoading('acceptProposal', false);
		}
	}

	// Cancel escrow
	async function cancelEscrow() {
		if (!contract.permissions.canCancel) {
			return appStore.showErrorToast($t('dashboard.contracts.actions.cancel_time_restriction'));
		}

		// Check if already pending via Nostr
		if (contract.isPending) {
			appStore.showErrorToast($t('dashboard.contracts.actions.contract_cancellation_pending'));
			return;
		}

		setLoading('cancel', true);
		try {
			// Call RSK escrow cancelEscrow - this publishes Nostr event with transactionHash
			await escrow.escrowOps.cancelEscrow(contract);

			pushNotificationService.sendNotificationToNpubs({
				npubs: [contractStore.getContractKey(contract, 'otherPartyNpub') as string],
				title: 'Escrow Cancelled',
				body: `An escrow has been cancelled for task ${contractStore.getContractKey(contract, 'taskTitle')}`,
				type: 'escrow_cancelled',
				clickAction: `${import.meta.env.VITE_CLIENT_URL}/dashboard?tab=contracts`,
				icon: 'https://bittasker.com/images/Logos/BitTasker-square-logo.svg'
			});
		} catch (error) {
			console.error('Error cancelling escrow:', error);

			const errorMessage =
				error instanceof Error
					? getErrorMessage(error)
					: $t('dashboard.contracts.actions.escrow_cancelled_error');
			appStore.showErrorToast(errorMessage);

			setLoading('cancel', false);
		}
	}

	// Resolve after timelock
	async function resolveAfterTimelock() {
		setLoading('resolveTimelock', true);
		try {
			// Call RSK escrow resolveAfterTimelock with contract event ID for proper nostr event publishing
			const result = await escrow.escrowOps.resolveAfterTimelock(contract);

			pushNotificationService.sendNotificationToNpubs({
				npubs: [contractStore.getContractKey(contract, 'otherPartyNpub') as string],
				title: 'Timelock Resolved',
				body: `A timelock has been resolved for task ${contractStore.getContractKey(contract, 'taskTitle')}`,
				type: 'timelock_resolved',
				clickAction: `${import.meta.env.VITE_CLIENT_URL}/dashboard?tab=contracts`,
				icon: 'https://bittasker.com/images/Logos/BitTasker-square-logo.svg'
			});

			// Show review prompt after successful timelock resolution
			openReviewPrompt(result.hash);
		} catch (error) {
			console.error('Error resolving timelock:', error);
			const errorMessage =
				error instanceof Error
					? getErrorMessage(error)
					: $t('dashboard.contracts.actions.timelock_resolved_error');
			appStore.showErrorToast(errorMessage);
		} finally {
			setLoading('resolveTimelock', false);
		}
	}

	// Delete contract
	async function onDeleteContract() {
		if (!contract.permissions.canDelete) return;
		setLoading('delete', true);
		try {
			await escrow.contractOps.deleteContract(contract);
			appStore.showSuccessToast($t('dashboard.contracts.actions.delete_contract_success'));
		} catch (error) {
			console.error('Error deleting contract:', error);
			// Handle structured EscrowError
			const { isEscrowError } = await import('$lib/utils/helpers/escrowErrors');
			const errorMessage = isEscrowError(error)
				? error.message
				: error instanceof Error
					? error.message
					: $t('dashboard.contracts.actions.delete_contract_error');
			appStore.showErrorToast(errorMessage);
		} finally {
			setLoading('delete', false);
		}
	}

	// Modal action handlers - these will be called by the modal configurations
	function openModal(action: ContractModalAction) {
		// Special handling for cancel action - check time restrictions
		if (action === ContractModalAction.Cancel) {
			const timeCheck = canCancelBasedOnTime();
			if (!timeCheck.allowed) {
				appStore.showErrorToast(
					timeCheck.reason || $t('dashboard.contracts.actions.cancel_time_restriction')
				);
				return;
			}
		}

		activeModal = action;
	}

	function closeModal() {
		activeModal = ContractModalAction.None;
	}

	// Handle modal confirmation based on active modal type
	async function handleModalConfirm() {
		switch (activeModal) {
			case ContractModalAction.Accept:
				await acceptTask();
				break;
			case ContractModalAction.Dispute:
				await disputeTask();
				break;
			case ContractModalAction.Cancel:
				await cancelEscrow();
				break;
			case ContractModalAction.Delete:
				await onDeleteContract();
				break;
			default:
				console.warn('Unknown modal action:', activeModal);
		}

		closeModal();
	}

	// Load translations on mount and when locale changes
	if (browser) {
		loadNamespace($locale as SupportedLanguage, 'dashboard/contracts/actions').catch((error) => {
			console.warn('Failed to load contract actions translations:', error);
		});
	}

	// Fetch BTC price on mount using currency formatter utility
	$effect(() => {
		fetchBtcPrice();
	});

	async function fetchBtcPrice() {
		try {
			btcPrice = await cryptoPriceService.getCurrentPrice('BTC');
		} catch (error) {
			console.error('Error fetching BTC price:', error);
		}
	}

	// Derived state for button disabled logic (simplified - rely on contract.isPending and permissions)
	const isCompleteDisabled = $derived(
		isLoading.complete ||
			isCheckingBlockchain ||
			contract.isPending ||
			blockchainCompletionStatus === EscrowStatus.Completed ||
			blockchainCompletionStatus === EscrowStatus.Cancelled
	);

	const isAcceptDisabled = $derived(isLoading.accept || contract.isPending);

	const isDisputeDisabled = $derived(isLoading.dispute || contract.isPending);

	const isCancelDisabled = $derived(
		isLoading.cancel ||
			contract.isPending ||
			blockchainCompletionStatus === EscrowStatus.Cancelled ||
			blockchainCompletionStatus === EscrowStatus.Completed
	);

	// Auto-calculate client amount from freelancer amount in USD
	$effect(() => {
		if (proposedFreelancerAmountUSD && contract.contractEvent.content.amount && btcPrice > 0) {
			const freelancerAmountUSD = parseFloat(proposedFreelancerAmountUSD) || 0;
			const totalAmountRBTC = parseFloat(contract.contractEvent.content.amount);
			const totalAmountUSD = totalAmountRBTC * btcPrice;
			const clientAmountUSD = totalAmountUSD - freelancerAmountUSD;
			if (clientAmountUSD >= 0) {
				proposedClientAmountUSD = clientAmountUSD.toFixed(2);
			}
		}
	});

	const openDrawerForResolution = () => {
		$contractStore.isResolutionFormOpen = true;
		$contractStore.contract = contract;
		$contractStore.isDrawerOpen = true;
	};
</script>

<div class="{containerClass} {containerClass.includes('grid') ? 'w-full' : ''}">
	<!-- Complete Task (Freelancer) -->
	{#if contract.permissions.canComplete && !isCompleteDisabled && !isDisabledDueToPending}
		<button
			class="btn btn-success btn-sm {compactButtons
				? 'w-fit'
				: isInline
					? 'w-full sm:w-fit'
					: 'w-full min-w-0'}"
			onclick={() => (activeModal = ContractModalAction.Complete)}
			title={blockchainCompletionStatus === EscrowStatus.Completed
				? $t('dashboard.contracts.actions.task_already_completed_tooltip')
				: contract.isPending
					? $t('dashboard.contracts.actions.task_completion_pending_tooltip')
					: ''}
		>
			{#if isLoading.complete || isCheckingBlockchain}
				<span class="loading loading-spinner loading-xs"></span>
			{:else if blockchainCompletionStatus === EscrowStatus.Completed}
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
						d="M5 13l4 4L19 7"
					/>
				</svg>
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

	<!-- Accept Task (Client) -->
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

	<!-- Dispute Task (Client) -->
	{#if contract.permissions.canDispute && !isDisputeDisabled}
		<button
			class="btn btn-error btn-sm {compactButtons
				? 'w-fit'
				: isInline
					? 'w-full sm:w-fit'
					: 'w-full min-w-0'}"
			onclick={() => openModal(ContractModalAction.Dispute)}
		>
			{#if isLoading.dispute}
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
						d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16c-.77.833.192 2.5 1.732 2.5z"
					/>
				</svg>
			{/if}
			{$t('dashboard.contracts.actions.dispute_work')}
		</button>
	{/if}

	<!-- Accept Proposal -->
	{#if !isInline && contract.permissions.canAcceptProposal}
		<div class="bg-base-300 col-span-2 w-full min-w-0 space-y-3 rounded-lg p-3">
			<h5 class="text-sm font-medium">
				{$t('dashboard.contracts.actions.current_proposal')}
			</h5>

			{#if contract.disputeProposal}
				<div class="flex flex-col gap-2 space-y-2 text-xs sm:flex-row">
					<div class="w-full">
						<span class="text-base-content/70">
							{contract.isClient
								? $t('dashboard.contracts.actions.your_amount')
								: $t('dashboard.contracts.actions.client_amount')}:
						</span>
						<div class="font-semibold">
							${(parseFloat(contract.disputeProposal.clientAmount) * btcPrice).toFixed(2)}
							({Math.round(
								parseFloat(contract.disputeProposal.clientAmount) * 100_000_000
							).toLocaleString()}
							Sats)
						</div>
					</div>
					<div class="w-full">
						<span class="text-base-content/70">
							{contract.isClient
								? $t('dashboard.contracts.actions.freelancer_amount')
								: $t('dashboard.contracts.actions.your_amount')}:
						</span>
						<div class="font-semibold">
							${(parseFloat(contract.disputeProposal.freelancerAmount) * btcPrice).toFixed(2)}
							({Math.round(
								parseFloat(contract.disputeProposal.freelancerAmount) * 100_000_000
							).toLocaleString()} Sats)
						</div>
					</div>
				</div>

				<div class="text-base-content/60 text-xs">
					{$t('dashboard.contracts.actions.proposed_by')}:
					{contract.disputeProposal.proposer.slice(0, 8)}
					...
					{contract.disputeProposal.proposer.slice(-6)}
				</div>
			{:else}
				<div class="text-base-content/60 text-xs">
					{$t('dashboard.contracts.actions.loading_proposal')}
				</div>
			{/if}

			<!-- Action buttons -->
			<div class="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
				<!-- Accept Proposal Button - hidden when disabled (loading or no proposal) -->
				{#if isLoading.acceptProposal}
					<div
						class="btn btn-success btn-sm gap-2 {compactButtons ? 'w-fit' : 'flex-1'}"
						aria-busy="true"
					>
						<span class="loading loading-spinner loading-xs"></span>
						{$t('dashboard.contracts.actions.accept_proposal')}
					</div>
				{:else if contract.disputeProposal}
					<button
						class="btn btn-success btn-sm {compactButtons ? 'w-fit' : 'flex-1'}"
						onclick={acceptProposal}
					>
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
								d="M5 13l4 4L19 7"
							/>
						</svg>
						{$t('dashboard.contracts.actions.accept_proposal')}
					</button>
				{/if}

				<!-- Counter Proposal Button (if user has proposals left) -->
				{#if contract.permissions.canPropose && hasProposalsLeft}
					<button
						class="btn btn-warning btn-sm {compactButtons ? 'w-fit' : 'flex-1'}"
						onclick={openDrawerForResolution}
					>
						<IconSwapHorizontal class="h-4 w-4" />
						{$t('dashboard.contracts.actions.counter_proposal')}
						<span class="text-base-content/60 ml-1 text-xs">
							({currentUserProposalCount}/2)
						</span>
					</button>
				{/if}
			</div>

			<!-- Show message if user has no proposals left -->
			{#if !hasProposalsLeft}
				<div class="alert alert-outline alert-warning text-xs">
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
							d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16c-.77.833.192 2.5 1.732 2.5z"
						/>
					</svg>
					<span>{$t('dashboard.contracts.actions.no_proposals_left')}</span>
				</div>
			{/if}
		</div>
	{/if}

	<!-- Propose Resolution -->
	{#if contract.permissions.canPropose}
		{#if isInline || !$contractStore.isResolutionFormOpen}
			<button
				class="btn btn-warning btn-sm {compactButtons
					? 'w-fit'
					: isInline
						? 'w-full sm:w-fit'
						: 'w-full'}"
				class:hidden={!isInline && contract.permissions.canAcceptProposal}
				onclick={openDrawerForResolution}
			>
				<IconSwapHorizontal class="h-4 w-4" />
				{contract.disputeProposal
					? $t('dashboard.contracts.actions.counter_proposal')
					: $t('dashboard.contracts.actions.propose_resolution')}
				<span class="text-base-content/60 ml-1 text-xs">
					({currentUserProposalCount}/2)
				</span>
			</button>
		{:else if !isInline}
			<div class="bg-base-300 col-span-2 w-full space-y-3 rounded-lg p-3">
				<h5 class="text-sm font-medium">
					{$t('dashboard.contracts.actions.resolution_form_title')}
				</h5>

				<div class="flex w-full flex-col gap-2 space-y-3 sm:flex-row">
					<div class="w-full">
						<label for="freelancer amount" class="label label-text text-xs">
							{contract.isClient
								? $t('dashboard.contracts.actions.freelancer_amount')
								: $t('dashboard.contracts.actions.your_amount')}
						</label>
						<div class="flex gap-2">
							<div class="relative flex-1">
								<span class="text-base-content/70 absolute top-1/2 left-3 z-9 -translate-y-1/2"
									>$</span
								>
								<input
									type="number"
									step="0.01"
									bind:value={proposedFreelancerAmountUSD}
									class="input input-bordered w-full pl-7"
									placeholder="0.00"
								/>
							</div>
							<div class="text-base-content/60 flex items-center text-xs">
								({Math.round(
									((parseFloat(proposedFreelancerAmountUSD) || 0) / btcPrice) * 100_000_000
								).toLocaleString()} Sats)
							</div>
						</div>
					</div>

					<div class="w-full">
						<label for="client amount" class="label label-text text-xs">
							{contract.isClient
								? $t('dashboard.contracts.actions.your_amount')
								: $t('dashboard.contracts.actions.client_amount')} (Auto-calculated)
						</label>
						<div class="flex gap-2">
							<div class="relative flex-1">
								<span class="text-base-content/70 absolute top-1/2 left-3 z-9 -translate-y-1/2"
									>$</span
								>
								<input
									type="text"
									value={proposedClientAmountUSD}
									class="input input-bordered bg-base-200 w-full pl-7"
									placeholder="0.00"
									readonly
								/>
							</div>
							<div class="text-base-content/60 flex items-center text-xs">
								({Math.round(
									((parseFloat(proposedClientAmountUSD) || 0) / btcPrice) * 100_000_000
								).toLocaleString()} Sats)
							</div>
						</div>
					</div>
				</div>

				<div class="text-base-content/60 text-xs">
					{$t('dashboard.contracts.actions.total_amount')}: ${(
						parseFloat(contractStore.getContractKey(contract, 'amount') as string) * btcPrice
					).toFixed(2)} ({Math.round(
						parseFloat(contractStore.getContractKey(contract, 'amount') as string) * 100_000_000
					).toLocaleString()} Sats)
				</div>

				<div class="flex flex-row-reverse gap-2 place-self-end">
					{#if isLoading.propose}
						<div class="btn btn-warning btn-sm gap-2" aria-busy="true">
							<span class="loading loading-spinner loading-xs"></span>
							{$t('dashboard.contracts.actions.propose')}
						</div>
					{:else}
						<button class="btn btn-warning btn-sm" onclick={proposeResolution}>
							{$t('dashboard.contracts.actions.propose')}
						</button>
					{/if}
					<button
						class="btn btn-ghost btn-outline btn-sm"
						onclick={() => ($contractStore.isResolutionFormOpen = false)}
					>
						{$t('dashboard.contracts.actions.cancel')}
					</button>
				</div>
			</div>
		{/if}
	{/if}

	<!-- Cancel Escrow -->
	{#if contract.permissions.canCancel && !isCancelDisabled}
		<button
			class="btn btn-error btn-sm {compactButtons
				? 'w-fit'
				: isInline
					? 'w-full sm:w-fit'
					: 'w-full min-w-0'}"
			onclick={() => openModal(ContractModalAction.Cancel)}
		>
			{#if isLoading.cancel}
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
						d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
					/>
				</svg>
			{/if}
			{$t('dashboard.contracts.actions.cancel_contract')}
		</button>
	{/if}

	<!-- Resolve After Timelock -->
	{#if contract.permissions.canResolveTimelock}
		<div
			class="flex flex-col gap-2 {compactButtons
				? 'w-fit'
				: isInline
					? 'w-full sm:w-fit'
					: 'w-full min-w-0'}"
		>
			{#if !isInline}
				<h5 class="text-sm font-medium">
					{$t('dashboard.contracts.actions.timelock_resolution')}
				</h5>

				<div class="text-base-content/60 text-xs">
					{$t('dashboard.contracts.actions.timelock_expired_message')}
				</div>
			{/if}

			{#if isLoading.resolveTimelock}
				<div
					class="btn btn-info btn-sm gap-2 {compactButtons
						? 'w-fit'
						: isInline
							? 'w-full sm:w-fit'
							: 'w-full min-w-0'}"
					aria-busy="true"
				>
					<span class="loading loading-spinner loading-xs"></span>
					{$t('dashboard.contracts.actions.resolve_timelock')}
				</div>
			{:else}
				<button
					class="btn btn-info btn-sm {compactButtons
						? 'w-fit'
						: isInline
							? 'w-full sm:w-fit'
							: 'w-full min-w-0'}"
					onclick={resolveAfterTimelock}
				>
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
							d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
						/>
					</svg>
					{$t('dashboard.contracts.actions.resolve_timelock')}
				</button>
			{/if}
		</div>
	{/if}

	<!-- Delete Contract (only visible when can delete) -->
	{#if contract.permissions.canDelete}
		{#if isLoading.delete}
			<div
				class="btn btn-error btn-sm gap-2 {compactButtons
					? 'w-fit'
					: isInline
						? 'w-full sm:w-fit'
						: 'w-full min-w-0'}"
				aria-busy="true"
			>
				<span class="loading loading-spinner loading-xs"></span>
				{$t('dashboard.contracts.actions.delete_contract')}
			</div>
		{:else}
			<button
				class="btn btn-error btn-sm {compactButtons
					? 'w-fit'
					: isInline
						? 'w-full sm:w-fit'
						: 'w-full min-w-0'}"
				onclick={() => openModal(ContractModalAction.Delete)}
			>
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
						d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
					/>
				</svg>
				{$t('dashboard.contracts.actions.delete_contract')}
			</button>
		{/if}
	{/if}
</div>

<!-- Modals -->
<!-- Task Completion Modal -->
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

<!-- Review Prompt Modal -->
<ReviewPromptModal
	isOpen={showReviewModal}
	escrowId={contract.escrowData.id}
	escrowTxHash={reviewEscrowTxHash}
	onClose={() => {
		showReviewModal = false;
		reviewEscrowTxHash = undefined;
	}}
	onSubmit={(eventId: string) => {
		console.log('Review submitted:', eventId);
		appStore.showSuccessToast($t('reviews.form.success'));
	}}
/>

<!-- Generic Confirmation Modal for Accept/Dispute/Cancel/Delete -->
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

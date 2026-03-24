<script lang="ts">
	import type { ContractWithEvents, ContractStatusEvent } from '$lib/types/contract';
	import type { Attachment } from '$lib/types/task';
	import type { EscrowData } from '$lib/types/wallet';
	import { t, locale } from 'svelte-i18n';
	import { escrow, EscrowStatus } from '$lib/utils/escrow';
	import { appStore } from '$lib/stores/app.store';
	import { extractContractError, getErrorMessage } from '$lib/utils/wallet/contractErrorHandler';
	import { loadNamespace, type SupportedLanguage } from '$lib/i18n/i18n';
	import { browser } from '$app/environment';
	import { contractStore } from '$lib/stores/contract.store';
	import { pushNotificationService } from '$lib/api/services/push-notification.service';
	import ConfirmModal from '$lib/components/ConfirmModal.svelte';
	import TaskCompletionModal from './TaskCompletionModal.svelte';
	import ContractActionBar from './actions/ContractActionBar.svelte';
	import AcceptContractButton from './actions/AcceptContractButton.svelte';
	import CancelContractButton from './actions/CancelContractButton.svelte';
	import CompleteContractButton from './actions/CompleteContractButton.svelte';
	import DisputeContractButton from './actions/DisputeContractButton.svelte';
	import ResolutionProposalButton from './actions/ResolutionProposalButton.svelte';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';
	import {
		ContractModalAction,
		CONTRACT_MODAL_CONFIGS
	} from '$lib/utils/constants/contract-modals';
	import { portal } from '$lib/utils/portal';
	import { buildContractsDashboardLink } from '$lib/utils/service-contract/dashboard-link';
	import { browserNetworkStatus } from '$lib/utils/network-status';
	import {
		sendTaskCompletionMessageToTasker,
		sendPaymentReleasedMessageToTaskee
	} from '$lib/utils/location/sendLocation';
	import { SvelteMap } from 'svelte/reactivity';

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
	const contextType = $derived(
		(contract.contractEvent.content.contextType as string | undefined) ?? 'task'
	);
	const isServiceContract = $derived(contextType === 'service');
	const subjectTitle = $derived(
		(contractStore.getContractKey(contract, 'contextTitle') as string | undefined) ??
			(contractStore.getContractKey(contract, 'taskTitle') as string | undefined) ??
			'contract'
	);
	const contractsClickAction = $derived(
		buildContractsDashboardLink({
			baseUrl: import.meta.env.VITE_CLIENT_URL,
			contextType,
			escrowId: contract.escrowData?.id
		})
	);

	// Disable ALL critical actions when transaction is pending
	const isDisabledDueToPending = $derived(contract.isPending);
	const isOffline = $derived(!$browserNetworkStatus.online);
	const showReconnectNotice = $derived(
		$browserNetworkStatus.online && $browserNetworkStatus.lastTransition === 'online'
	);
	const compactActionButtons = $derived(compactButtons || isInline);
	let staleActionNotice = $state<string | null>(null);

	const STALE_ACTION_ERROR_CODES = new Set([
		'NOT_CLIENT',
		'NOT_FREELANCER',
		'INVALID_STATE',
		'ALREADY_COMPLETED',
		'ALREADY_DISPUTED',
		'DISPUTE_EXPIRED',
		'NO_PROPOSAL',
		'PROPOSAL_ACCEPTED',
		'UNAUTHORIZED_CALLER'
	]);

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

	function tr(key: string, fallback: string): string {
		const value = $t(key);
		return typeof value === 'string' && value !== key ? value : fallback;
	}

	function trv(key: string, fallback: string, values: Record<string, string | number>): string {
		const value = $t(key, { values });
		return typeof value === 'string' && value !== key ? value : fallback;
	}

	function buildStaleActionNotice(): string {
		return isServiceContract
			? tr(
					'dashboard.contracts.actions.stale_action_notice_service',
					'This service contract changed or the action is no longer available. Refreshing the latest contract state.'
				)
			: tr(
					'dashboard.contracts.actions.stale_action_notice_task',
					'This contract changed or the action is no longer available. Refreshing the latest contract state.'
				);
	}

	async function handleRecoverableActionError(error: unknown): Promise<boolean> {
		const contractError = extractContractError(error);
		if (!contract.escrowData?.id || !contractError.errorCode) {
			return false;
		}
		if (!STALE_ACTION_ERROR_CODES.has(contractError.errorCode)) {
			return false;
		}

		staleActionNotice = buildStaleActionNotice();
		await contractStore.loadContractByEscrowId(contract.escrowData.id);
		return true;
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
			staleActionNotice = null;
			await escrow.escrowOps.completeTask(contract, attachments);

			// Task event is owned by the Tasker; COMPLETED is set by the Tasker when they accept task (release funds), not here.
			// See docs/tasks/task-status.md.

			pushNotificationService.sendNotificationToNpubs({
				npubs: [contractStore.getContractKey(contract, 'otherPartyNpub') as string],
				title: isServiceContract
					? tr(
							'dashboard.contracts.actions.notification_service_completed_title',
							'Service completed'
						)
					: 'Task Completed',
				body: isServiceContract
					? trv(
							'dashboard.contracts.actions.notification_service_completed_body',
							'Service {title} has been marked as completed.',
							{ title: subjectTitle }
						)
					: `Task ${contractStore.getContractKey(contract, 'taskTitle')} has been marked as completed`,
				type: 'task_completed',
				clickAction: contractsClickAction,
				icon: 'https://bittasker.com/images/Logos/BitTasker-square-logo.svg'
			});

			const clientPubkey = contractStore.getContractKey(contract, 'clientPubkey') as string;
			if (clientPubkey && !isServiceContract) {
				sendTaskCompletionMessageToTasker(clientPubkey, {
					taskId: contractStore.getContractKey(contract, 'taskId') as string,
					taskTitle: contractStore.getContractKey(contract, 'taskTitle') as string,
					escrowId: contract.escrowData.id
				}).catch((messageError) => {
					console.error('Failed to send task completion message to tasker:', messageError);
				});
			}
		} catch (error) {
			console.error('Error completing task:', error);

			const recoveredInPlace = await handleRecoverableActionError(error);
			const errorMessage =
				error instanceof Error
					? getErrorMessage(error)
					: $t('dashboard.contracts.actions.task_completed_error');
			if (!recoveredInPlace) {
				appStore.showErrorToast(errorMessage);
			}

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
			staleActionNotice = null;
			await escrow.escrowOps.acceptTask(contract);
			// Task status COMPLETED is updated in escrow onConfirmed callback (after chain confirmation).

			const taskTitle = contractStore.getContractKey(contract, 'taskTitle') as string;
			const taskeeNpub = contractStore.getContractKey(contract, 'otherPartyNpub') as string;

			pushNotificationService.sendNotificationToNpubs({
				npubs: [taskeeNpub],
				title: isServiceContract
					? tr(
							'dashboard.contracts.actions.notification_service_payment_released_title',
							'Service payment released'
						)
					: ($t('dashboard.contracts.actions.notification_payment_released_title') as string),
				body: isServiceContract
					? trv(
							'dashboard.contracts.actions.notification_service_payment_released_body',
							'Payment was released for {title}.',
							{ title: subjectTitle }
						)
					: ($t('dashboard.contracts.actions.notification_payment_released_body', {
							values: { taskTitle: taskTitle || '' }
						}) as string),
				type: 'payment_released',
				clickAction: contractsClickAction,
				icon: 'https://bittasker.com/images/Logos/BitTasker-square-logo.svg'
			});

			// Enviar DM al taskee: fondos liberados y trabajo aceptado
			if (taskeeNpub && !isServiceContract) {
				sendPaymentReleasedMessageToTaskee(taskeeNpub, {
					taskId: contractStore.getContractKey(contract, 'taskId') as string,
					taskTitle: taskTitle || undefined
				}).catch((messageError: unknown) => {
					console.error('Failed to send payment released message to taskee:', messageError);
				});
			}
		} catch (error) {
			console.error('Error accepting task:', error);

			const recoveredInPlace = await handleRecoverableActionError(error);
			const errorMessage =
				error instanceof Error
					? getErrorMessage(error)
					: $t('dashboard.contracts.actions.payment_released_error');
			if (!recoveredInPlace) {
				appStore.showErrorToast(errorMessage);
			}

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
			staleActionNotice = null;
			// Call RSK escrow disputeTask - this publishes Nostr event with transactionHash
			await escrow.escrowOps.disputeTask(contract);

			pushNotificationService.sendNotificationToNpubs({
				npubs: [contractStore.getContractKey(contract, 'otherPartyNpub') as string],
				title: isServiceContract
					? tr(
							'dashboard.contracts.actions.notification_service_dispute_title',
							'Service dispute raised'
						)
					: 'Dispute Raised',
				body: isServiceContract
					? trv(
							'dashboard.contracts.actions.notification_service_dispute_body',
							'A dispute has been raised for {title}.',
							{ title: subjectTitle }
						)
					: `A dispute has been raised for task ${contractStore.getContractKey(contract, 'taskTitle')}`,
				type: 'dispute_raised',
				clickAction: contractsClickAction,
				icon: 'https://bittasker.com/images/Logos/BitTasker-square-logo.svg'
			});
		} catch (error) {
			console.error('Error disputing task:', error);

			const recoveredInPlace = await handleRecoverableActionError(error);
			const errorMessage =
				error instanceof Error
					? getErrorMessage(error)
					: $t('dashboard.contracts.actions.dispute_raised_error');
			if (!recoveredInPlace) {
				appStore.showErrorToast(errorMessage);
			}

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
			staleActionNotice = null;
			// Call RSK escrow proposeResolution with contract event ID and amounts for proper nostr event publishing
			await escrow.escrowOps.proposeResolution(
				contract,
				freelancerAmountRBTC,
				clientAmountRBTC,
				freelancerAmountRBTC
			);

			pushNotificationService.sendNotificationToNpubs({
				npubs: [contractStore.getContractKey(contract, 'otherPartyNpub') as string],
				title: isServiceContract
					? tr(
							'dashboard.contracts.actions.notification_service_resolution_proposed_title',
							'Service resolution proposed'
						)
					: 'Resolution Proposed',
				body: isServiceContract
					? trv(
							'dashboard.contracts.actions.notification_service_resolution_proposed_body',
							'A resolution has been proposed for {title}.',
							{ title: subjectTitle }
						)
					: `A resolution has been proposed for task ${contractStore.getContractKey(contract, 'taskTitle')}`,
				type: 'resolution_proposed',
				clickAction: contractsClickAction,
				icon: 'https://bittasker.com/images/Logos/BitTasker-square-logo.svg'
			});

			$contractStore.isResolutionFormOpen = false;
			proposedClientAmountUSD = '';
			proposedFreelancerAmountUSD = '';
		} catch (error) {
			console.error('Error proposing resolution:', error);
			const recoveredInPlace = await handleRecoverableActionError(error);
			const errorMessage =
				error instanceof Error
					? getErrorMessage(error)
					: $t('dashboard.contracts.actions.resolution_proposed_error');
			if (!recoveredInPlace) {
				appStore.showErrorToast(errorMessage);
			}
		} finally {
			setLoading('propose', false);
		}
	}

	// Accept proposal
	async function acceptProposal() {
		if (!contract.permissions.canAcceptProposal) return;

		setLoading('acceptProposal', true);
		try {
			staleActionNotice = null;
			// Call RSK escrow acceptProposal with contract event ID for proper nostr event publishing
			await escrow.escrowOps.acceptProposal(contract);

			pushNotificationService.sendNotificationToNpubs({
				npubs: [contractStore.getContractKey(contract, 'otherPartyNpub') as string],
				title: isServiceContract
					? tr(
							'dashboard.contracts.actions.notification_service_resolution_accepted_title',
							'Service resolution accepted'
						)
					: 'Proposal Accepted',
				body: isServiceContract
					? trv(
							'dashboard.contracts.actions.notification_service_resolution_accepted_body',
							'A proposal has been accepted for {title}.',
							{ title: subjectTitle }
						)
					: `A proposal has been accepted for task ${contractStore.getContractKey(contract, 'taskTitle')}`,
				type: 'proposal_accepted',
				clickAction: contractsClickAction,
				icon: 'https://bittasker.com/images/Logos/BitTasker-square-logo.svg'
			});
		} catch (error) {
			console.error('Error accepting proposal:', error);
			const recoveredInPlace = await handleRecoverableActionError(error);
			const errorMessage =
				error instanceof Error
					? getErrorMessage(error)
					: $t('dashboard.contracts.actions.proposal_accepted_error');
			if (!recoveredInPlace) {
				appStore.showErrorToast(errorMessage);
			}
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
			staleActionNotice = null;
			// Call RSK escrow cancelEscrow - this publishes Nostr event with transactionHash
			await escrow.escrowOps.cancelEscrow(contract);

			pushNotificationService.sendNotificationToNpubs({
				npubs: [contractStore.getContractKey(contract, 'otherPartyNpub') as string],
				title: isServiceContract
					? tr(
							'dashboard.contracts.actions.notification_service_cancelled_title',
							'Service contract cancelled'
						)
					: 'Escrow Cancelled',
				body: isServiceContract
					? trv(
							'dashboard.contracts.actions.notification_service_cancelled_body',
							'A service contract has been cancelled for {title}.',
							{ title: subjectTitle }
						)
					: `An escrow has been cancelled for task ${contractStore.getContractKey(contract, 'taskTitle')}`,
				type: 'escrow_cancelled',
				clickAction: contractsClickAction,
				icon: 'https://bittasker.com/images/Logos/BitTasker-square-logo.svg'
			});
		} catch (error) {
			console.error('Error cancelling escrow:', error);

			const recoveredInPlace = await handleRecoverableActionError(error);
			const errorMessage =
				error instanceof Error
					? getErrorMessage(error)
					: $t('dashboard.contracts.actions.escrow_cancelled_error');
			if (!recoveredInPlace) {
				appStore.showErrorToast(errorMessage);
			}

			setLoading('cancel', false);
		}
	}

	// Resolve after timelock
	async function resolveAfterTimelock() {
		setLoading('resolveTimelock', true);
		try {
			staleActionNotice = null;
			// Call RSK escrow resolveAfterTimelock with contract event ID for proper nostr event publishing
			console.log({
				id: contract.escrowData.id,
				status: contract.escrowData.status,
				eventId: contract.contractEvent.id
			});
			await escrow.escrowOps.resolveAfterTimelock(contract);

			pushNotificationService.sendNotificationToNpubs({
				npubs: [contractStore.getContractKey(contract, 'otherPartyNpub') as string],
				title: isServiceContract
					? tr(
							'dashboard.contracts.actions.notification_service_resolved_title',
							'Service contract resolved'
						)
					: 'Timelock Resolved',
				body: isServiceContract
					? trv(
							'dashboard.contracts.actions.notification_service_resolved_body',
							'A service contract has been resolved for {title}.',
							{ title: subjectTitle }
						)
					: `A timelock has been resolved for task ${contractStore.getContractKey(contract, 'taskTitle')}`,
				type: 'timelock_resolved',
				clickAction: contractsClickAction,
				icon: 'https://bittasker.com/images/Logos/BitTasker-square-logo.svg'
			});
		} catch (error) {
			console.error('Error resolving timelock:', error);
			const recoveredInPlace = await handleRecoverableActionError(error);
			const errorMessage =
				error instanceof Error
					? getErrorMessage(error)
					: $t('dashboard.contracts.actions.timelock_resolved_error');
			if (!recoveredInPlace) {
				appStore.showErrorToast(errorMessage);
			}
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

<div class="space-y-3">
	{#if staleActionNotice}
		<div class="alert alert-warning text-sm" data-testid="contract-actions-stale-alert">
			<span>{staleActionNotice}</span>
		</div>
	{/if}

	{#if isOffline}
		<div class="alert alert-warning text-sm" data-testid="contract-actions-offline-alert">
			<span>
				{tr(
					'dashboard.contracts.actions.offline_notice',
					'You are offline. Reconnect before submitting contract actions.'
				)}
			</span>
		</div>
	{:else if showReconnectNotice}
		<div class="alert alert-info text-sm" data-testid="contract-actions-reconnect-alert">
			<span>
				{tr(
					'dashboard.contracts.actions.reconnect_notice',
					'Back online. Retry any contract action that did not submit before reconnecting.'
				)}
			</span>
		</div>
	{/if}

	<ContractActionBar
		containerClass={`${containerClass} ${containerClass.includes('grid') ? 'w-full' : ''}`}
	>
		<!-- Complete Task (Freelancer) -->
		{#if contract.permissions.canComplete && !isCompleteDisabled && !isDisabledDueToPending}
			<CompleteContractButton
				compact={compactActionButtons}
				disabled={isOffline}
				loading={isLoading.complete || isCheckingBlockchain}
				label={isServiceContract
					? tr('dashboard.contracts.actions.service_complete', 'Mark Service Complete')
					: ($t('dashboard.contracts.actions.complete_task') as string)}
				onclick={() => (activeModal = ContractModalAction.Complete)}
			/>
		{/if}

		<!-- Accept Task (Client) -->
		{#if contract.permissions.canAccept && !isAcceptDisabled && !isDisabledDueToPending}
			<AcceptContractButton
				compact={compactActionButtons}
				disabled={isOffline}
				loading={isLoading.accept}
				label={isServiceContract
					? tr('dashboard.contracts.actions.accept_service', 'Accept Service')
					: ($t('dashboard.contracts.actions.accept_work') as string)}
				onclick={() => openModal(ContractModalAction.Accept)}
			/>
		{/if}

		<!-- Dispute Task (Client) -->
		{#if contract.permissions.canDispute && !isDisputeDisabled}
			<DisputeContractButton
				compact={compactActionButtons}
				disabled={isOffline}
				loading={isLoading.dispute}
				label={isServiceContract
					? tr('dashboard.contracts.actions.dispute_service', 'Dispute Service')
					: ($t('dashboard.contracts.actions.dispute_work') as string)}
				onclick={() => openModal(ContractModalAction.Dispute)}
			/>
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
				<ContractActionBar containerClass="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
					<!-- Accept Proposal Button - hidden when disabled (loading or no proposal) -->
					{#if isLoading.acceptProposal}
						<AcceptContractButton
							compact={compactButtons}
							loading={true}
							label={$t('dashboard.contracts.actions.accept_proposal') as string}
						/>
					{:else if contract.disputeProposal}
						<AcceptContractButton
							compact={compactButtons}
							disabled={isOffline}
							label={$t('dashboard.contracts.actions.accept_proposal') as string}
							onclick={acceptProposal}
						/>
					{/if}

					<!-- Counter Proposal Button (if user has proposals left) -->
					{#if contract.permissions.canPropose && hasProposalsLeft}
						<ResolutionProposalButton
							compact={compactButtons}
							disabled={isOffline}
							label={`${$t('dashboard.contracts.actions.counter_proposal')} (${currentUserProposalCount}/2)`}
							onclick={openDrawerForResolution}
						/>
					{/if}
				</ContractActionBar>

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
				<div class:hidden={!isInline && contract.permissions.canAcceptProposal}>
					<ResolutionProposalButton
						compact={compactActionButtons}
						disabled={isOffline}
						label={`${
							contract.disputeProposal
								? ($t('dashboard.contracts.actions.counter_proposal') as string)
								: ($t('dashboard.contracts.actions.propose_resolution') as string)
						} (${currentUserProposalCount}/2)`}
						onclick={openDrawerForResolution}
					/>
				</div>
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

					<ContractActionBar containerClass="flex flex-row-reverse gap-2 place-self-end">
						{#if isLoading.propose}
							<ResolutionProposalButton
								compact={true}
								loading={true}
								label={$t('dashboard.contracts.actions.propose') as string}
							/>
						{:else}
							<ResolutionProposalButton
								compact={true}
								disabled={isOffline}
								label={$t('dashboard.contracts.actions.propose') as string}
								onclick={proposeResolution}
							/>
						{/if}
						<CancelContractButton
							compact={true}
							label={$t('dashboard.contracts.actions.cancel') as string}
							onclick={() => ($contractStore.isResolutionFormOpen = false)}
						/>
					</ContractActionBar>
				</div>
			{/if}
		{/if}

		<!-- Cancel Escrow -->
		{#if contract.permissions.canCancel && !isCancelDisabled}
			<CancelContractButton
				compact={compactActionButtons}
				disabled={isOffline}
				loading={isLoading.cancel}
				label={isServiceContract
					? tr('dashboard.contracts.actions.cancel_service_contract', 'Cancel Service Contract')
					: ($t('dashboard.contracts.actions.cancel_contract') as string)}
				onclick={() => openModal(ContractModalAction.Cancel)}
			/>
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
						disabled={isOffline}
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
					disabled={isOffline}
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
	</ContractActionBar>
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

<!-- Generic Confirmation Modal for Accept/Dispute/Cancel/Delete -->
{#if activeModal !== ContractModalAction.None && activeModal !== ContractModalAction.Complete}
	{@const config = CONTRACT_MODAL_CONFIGS[activeModal]}
	{@const customTitle =
		isServiceContract && activeModal === ContractModalAction.Accept
			? tr('dashboard.contracts.actions.confirm_service_accept_title', 'Accept this service?')
			: isServiceContract && activeModal === ContractModalAction.Dispute
				? tr(
						'dashboard.contracts.actions.confirm_service_dispute_title',
						'Raise a dispute for this service?'
					)
				: isServiceContract && activeModal === ContractModalAction.Cancel
					? tr(
							'dashboard.contracts.actions.confirm_service_cancel_title',
							'Cancel this service contract?'
						)
					: isServiceContract && activeModal === ContractModalAction.Delete
						? tr(
								'dashboard.contracts.actions.confirm_service_delete_title',
								'Delete this service contract?'
							)
						: null}
	{@const customMessage =
		isServiceContract && activeModal === ContractModalAction.Accept
			? tr(
					'dashboard.contracts.actions.confirm_service_accept_message',
					'This releases funds for the completed service and keeps the service contract history intact.'
				)
			: isServiceContract && activeModal === ContractModalAction.Dispute
				? tr(
						'dashboard.contracts.actions.confirm_service_dispute_message',
						'This opens a dispute on the service contract and pauses the normal payout path.'
					)
				: isServiceContract && activeModal === ContractModalAction.Cancel
					? tr(
							'dashboard.contracts.actions.confirm_service_cancel_message',
							'This cancels the service contract and starts the refund path defined by the escrow rules.'
						)
					: isServiceContract && activeModal === ContractModalAction.Delete
						? tr(
								'dashboard.contracts.actions.confirm_service_delete_message',
								'Delete this unfunded service contract from your Nostr contract history?'
							)
						: null}
	{@const customConfirmText =
		isServiceContract && activeModal === ContractModalAction.Accept
			? tr('dashboard.contracts.actions.accept_service', 'Accept Service')
			: isServiceContract && activeModal === ContractModalAction.Dispute
				? tr('dashboard.contracts.actions.dispute_service', 'Dispute Service')
				: isServiceContract && activeModal === ContractModalAction.Cancel
					? tr('dashboard.contracts.actions.cancel_service_contract', 'Cancel Service Contract')
					: isServiceContract && activeModal === ContractModalAction.Delete
						? tr('dashboard.contracts.actions.delete_service_contract', 'Delete Service Contract')
						: null}
	{#if config}
		<div use:portal={'modals'}>
			<ConfirmModal
				isOpen={true}
				title={customTitle ?? $t(config.titleKey)}
				message={customMessage ?? $t(config.messageKey)}
				confirmText={customConfirmText ?? $t(config.confirmTextKey)}
				cancelText={$t(config.cancelTextKey)}
				confirmButtonClass={config.confirmButtonClass}
				onConfirm={handleModalConfirm}
				onCancel={closeModal}
			/>
		</div>
	{/if}
{/if}

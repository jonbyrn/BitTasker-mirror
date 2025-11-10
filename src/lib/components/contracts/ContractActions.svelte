<script lang="ts">
	import { t, locale } from 'svelte-i18n';
	import type { ContractWithEvents } from '$lib/types/contract';
	import type { Attachment } from '$lib/types/task';
	import { escrow } from '$lib/utils/wallet/escrow';
	import { appStore } from '$lib/stores/app.store';
	import { getErrorMessage } from '$lib/utils/wallet/contractErrorHandler';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';
	import { deleteContract as deleteContractUtil } from '$lib/utils/nostr-bid';
	import { loadNamespace, type SupportedLanguage } from '$lib/i18n/i18n';
	import { browser } from '$app/environment';
	import ConfirmModal from '$lib/components/ConfirmModal.svelte';
	import TaskCompletionModal from './TaskCompletionModal.svelte';
	import { 
		registerCompleteCancelAttemptAtomic,
		registerCompleteCancelAttempt,
		registerCompletionAttemptAtomic,
		registerCompletionAttempt,
		updateCompleteCancelStatus,
		updateCompletionStatus, 
		hasCompletionAttempt, 
		getCompleteCancelAttempt,
		getCompleteAttempt,
		getCancelAttempt,
		getCompletionAttempt,
		clearCompletionAttempt 
	} from '$lib/stores/completionCache.store';
	import {
		registerAcceptDisputeAttemptAtomic,
		registerAcceptDisputeAttempt,
		updateAcceptDisputeStatus,
		getAcceptAttempt,
		getDisputeAttempt,
		clearAcceptDisputeAttempt,
		acceptDisputeStore
	} from '$lib/stores/acceptDisputeCache.store';
	import { EscrowStatus } from '$lib/utils/enums/wallet.enum';
	import type { EscrowData } from '$lib/types/wallet';

	const {
		contract,
		onActionComplete,
		containerClass = 'space-y-3',
		openDrawer = () => {},
		isInline = false,
		onShowDeleteConfirm = () => {},
		onShowAcceptConfirm = () => {},
		onShowDisputeConfirm = () => {},
		onShowCompletionModal = () => {},
		onSetAcceptTaskHandler,
		onSetDisputeTaskHandler,
		onSetDeleteContractHandler,
		onSetCompleteTaskHandler,
		useExternalModals = false
	} = $props<{
		contract: ContractWithEvents;
		onActionComplete?: () => void;
		containerClass?: string;
		isInline?: boolean;
		openDrawer?: () => void;
		onShowDeleteConfirm?: () => void;
		onShowAcceptConfirm?: () => void;
		onShowDisputeConfirm?: () => void;
		onShowCompletionModal?: () => void;
		onSetAcceptTaskHandler?: (handler: () => Promise<void>) => void;
		onSetDisputeTaskHandler?: (handler: () => Promise<void>) => void;
		onSetDeleteContractHandler?: (handler: () => Promise<void>) => void;
		onSetCompleteTaskHandler?: (handler: (attachments: Attachment[]) => Promise<void>) => void;
		useExternalModals?: boolean;
	}>();

	// State for actions
	let isLoading = $state<Record<string, boolean>>({});
	let showResolutionForm = $state(false);
	
	// Modal state (only used when callbacks not provided - for ContractCard usage)
	let showCompletionModal = $state(false);
	let showDeleteConfirm = $state(false);
	let showAcceptConfirm = $state(false);
	let showDisputeConfirm = $state(false);
	
	// Determine if we should use internal modals (when external modals not explicitly requested)
	// useExternalModals is only set to true in ContractDrawer, ContractCard doesn't pass it (defaults to false)
	const useInternalModals = !useExternalModals;
	let proposedClientAmountUSD = $state('');
	let proposedFreelancerAmountUSD = $state('');
	let btcPrice = $state<number>(0); // No fallback price
	
	// Completion cache state
	let isCheckingBlockchain = $state(false);
	let blockchainCompletionStatus = $state<EscrowStatus | null>(null);
	let completionAttempt = $state<{ escrowId: string; timestamp: number; transactionHash?: string; status: 'pending' | 'confirmed' | 'failed'; type: 'complete' | 'cancel' } | null>(null);
	let cancelAttempt = $state<{ escrowId: string; timestamp: number; transactionHash?: string; status: 'pending' | 'confirmed' | 'failed'; type: 'complete' | 'cancel' } | null>(null);
	
	// Accept/Dispute cache state
	let acceptAttempt = $state<{ escrowId: string; timestamp: number; transactionHash?: string; status: 'pending' | 'confirmed' | 'failed'; type: 'accept' | 'dispute' } | null>(null);
	let disputeAttempt = $state<{ escrowId: string; timestamp: number; transactionHash?: string; status: 'pending' | 'confirmed' | 'failed'; type: 'accept' | 'dispute' } | null>(null);
	
	let isMounted = $state(true);
	
	// Blockchain check cache (30 second TTL)
	const blockchainCheckCache = new Map<string, { status: EscrowStatus | null; timestamp: number }>();
	const BLOCKCHAIN_CACHE_TTL = 30000; // 30 seconds

	// Component unmount protection
	$effect(() => {
		isMounted = true;
		
		return () => {
			isMounted = false; // Cleanup on unmount
		};
	});

	// Helper to set loading state
	function setLoading(action: string, loading: boolean) {
		isLoading = { ...isLoading, [action]: loading };
	}
	
	// Check blockchain completion status with caching
	async function checkBlockchainCompletionStatus(): Promise<boolean> {
		if (!isMounted) return false;
		
		const cacheKey = contract.contract.escrowId;
		const cached = blockchainCheckCache.get(cacheKey);
		const now = Date.now();
		
		// Use cached result if less than 30 seconds old
		if (cached && (now - cached.timestamp) < BLOCKCHAIN_CACHE_TTL) {
			if (isMounted) {
				blockchainCompletionStatus = cached.status;
			}
			// Update cache if we have an attempt
			if (cached.status === EscrowStatus.Completed && completionAttempt) {
				updateCompletionStatus(contract.contract.escrowId, 'confirmed');
			}
			return cached.status === EscrowStatus.Completed;
		}
		
		try {
			if (isMounted) {
				isCheckingBlockchain = true;
			}
			
			// Add timeout protection (5 seconds)
			const escrowData = await Promise.race([
				escrow.getEscrow(contract.contract.escrowId),
				new Promise<null>((_, reject) => 
					setTimeout(() => reject(new Error('Blockchain check timeout')), 5000)
				)
			]) as EscrowData | null;
			
			if (!isMounted) return false;
			
			const status = escrowData?.status || null;
			
			if (status === EscrowStatus.Completed) {
				blockchainCompletionStatus = EscrowStatus.Completed;
				// Update cache to confirmed if we have an attempt
				if (completionAttempt) {
					updateCompletionStatus(contract.contract.escrowId, 'confirmed');
				}
				// Cache result
				blockchainCheckCache.set(cacheKey, { status, timestamp: now });
				return true; // Already completed
			}
			
			blockchainCompletionStatus = status;
			// Cache result
			blockchainCheckCache.set(cacheKey, { status, timestamp: now });
			return false; // Not completed yet
		} catch (error) {
			if (!isMounted) return false;
			
			if (error instanceof Error && error.message === 'Blockchain check timeout') {
				console.warn('Blockchain check timeout, allowing transaction to proceed');
				// Don't block transaction on timeout
				return false;
			}
			
			console.error('Error checking blockchain status:', error);
			// Fallback: don't block if check fails
			return false;
		} finally {
			if (isMounted) {
				isCheckingBlockchain = false;
			}
		}
	}

	// Complete task with attachments (freelancer only)
	export async function completeTaskWithAttachments(attachments: Attachment[]) {
		if (!contract.canComplete || !isMounted) return;
		
		// Atomic check-and-set: prevents race conditions
		const wasRegistered = registerCompleteCancelAttemptAtomic(
			contract.contract.escrowId,
			'complete'
		);
		if (!wasRegistered) {
			// Already attempted - check if it's a cancel or complete attempt
			const existingAttempt = getCompleteCancelAttempt(contract.contract.escrowId);
			if (existingAttempt?.type === 'cancel') {
				// Cancel was attempted - check status
				if (existingAttempt.status === 'confirmed') {
					if (isMounted) {
						appStore.showErrorToast($t('dashboard.contracts.actions.contract_already_cancelled'));
					}
					return;
				} else if (existingAttempt.status === 'pending') {
					// Cancel pending - don't allow complete
					if (isMounted) {
						appStore.showErrorToast($t('dashboard.contracts.actions.contract_cancellation_pending'));
					}
					return;
				}
			} else if (existingAttempt?.type === 'complete') {
				// Complete was attempted - check status
				if (existingAttempt.status === 'confirmed') {
					// Already completed - check blockchain to be sure
					const isCompleted = await checkBlockchainCompletionStatus();
					if (isCompleted) {
						if (isMounted) {
							appStore.showErrorToast(
								$t('dashboard.contracts.actions.task_already_completed')
							);
						}
						return;
					}
				} else if (existingAttempt.status === 'pending') {
					// Transaction pending - don't allow duplicate
					if (isMounted) {
						appStore.showErrorToast(
							$t('dashboard.contracts.actions.task_completion_pending')
						);
					}
					return;
				}
			}
			// If failed, allow retry
		}
		
		// Get the attempt (either newly created or existing)
		completionAttempt = getCompleteAttempt(contract.contract.escrowId);
		
		// Check blockchain status before submitting (with caching)
		const isAlreadyCompleted = await checkBlockchainCompletionStatus();
		if (isAlreadyCompleted) {
			if (isMounted) {
				appStore.showErrorToast(
					$t('dashboard.contracts.actions.task_already_completed')
				);
			}
			// Update cache to confirmed
			if (completionAttempt) {
				updateCompleteCancelStatus(contract.contract.escrowId, 'confirmed');
			}
			return;
		}
		
		if (!isMounted) return;
		
		setLoading('complete', true);
		try {
			// Call RSK escrow completeTask with contract event ID and attachments
			const result = await escrow.completeTask(
				contract.contract.escrowId, 
				contract.contractEvent.id, 
				attachments
			);
			
			if (!isMounted) return;
			
			// Update cache with transaction hash (status is already 'pending' from registration)
			if (result.hash && completionAttempt) {
				// Update the attempt with transaction hash
				completionAttempt.transactionHash = result.hash;
				// Update the cache entry (overwrites existing entry with transaction hash)
				registerCompleteCancelAttempt(contract.contract.escrowId, 'complete', result.hash);
			}
			
			onActionComplete?.();
			
			// Note: Status will be updated to 'confirmed' when transaction confirms
			// This happens in escrowEvents.ts handleTaskCompleted
			// If transaction fails, it will be handled in escrow.ts
		} catch (error) {
			if (!isMounted) return;
			
			console.error('Error completing task:', error);
			
			// Clear attempt on failure to allow retry
			clearCompletionAttempt(contract.contract.escrowId);
			completionAttempt = null;
			
			const errorMessage =
				error instanceof Error
					? getErrorMessage(error)
					: $t('dashboard.contracts.actions.task_completed_error');
			appStore.showErrorToast(errorMessage);
		} finally {
			if (isMounted) {
				setLoading('complete', false);
			}
		}
	}

	// Show completion modal
	function showCompleteTaskModal() {
		if (!contract.canComplete) return;
		if (useInternalModals) {
			showCompletionModal = true;
		} else {
			onShowCompletionModal();
		}
	}

	// Show accept confirmation
	function showAcceptConfirmation() {
		if (!contract.canAccept || isAcceptDisabled) return;
		if (useInternalModals) {
			showAcceptConfirm = true;
		} else {
			onShowAcceptConfirm();
		}
	}

	// Accept task (client only) - called from parent modal
	export async function acceptTask() {
		if (!contract.canAccept || !isMounted) return;
		
		// Atomic check-and-set: prevents race conditions
		const wasRegistered = registerAcceptDisputeAttemptAtomic(
			contract.contract.escrowId,
			'accept'
		);
		if (!wasRegistered) {
			// Already attempted - check status
			const attempt = getAcceptAttempt(contract.contract.escrowId);
			if (attempt?.status === 'confirmed') {
				if (isMounted) {
					appStore.showErrorToast($t('dashboard.contracts.actions.payment_already_released'));
				}
				return;
			} else if (attempt?.status === 'pending') {
				// Transaction pending - don't allow duplicate
				if (isMounted) {
					appStore.showErrorToast($t('dashboard.contracts.actions.payment_release_pending'));
				}
				return;
			}
			// If failed, allow retry
		}
		
		// Get the attempt (either newly created or existing)
		acceptAttempt = getAcceptAttempt(contract.contract.escrowId);

		setLoading('accept', true);
		try {
			// Call RSK escrow acceptTask with contract event ID for proper nostr event publishing
			const result = await escrow.acceptTask(contract.contract.escrowId, contract.contractEvent.id);
			
			if (!isMounted) return;
			
			// Update cache with transaction hash (status is already 'pending' from registration)
			if (result.hash && acceptAttempt) {
				// Update the attempt with transaction hash
				acceptAttempt.transactionHash = result.hash;
				// Update the cache entry (overwrites existing entry with transaction hash)
				registerAcceptDisputeAttempt(contract.contract.escrowId, 'accept', result.hash);
			}
			
			// Note: Loading state will remain true until transaction confirms
			// Status will be updated to 'confirmed' when transaction confirms
			// This happens in escrowEvents.ts handleTaskAccepted
			// The reactive effect will clear loading when status becomes 'confirmed'
		} catch (error) {
			if (!isMounted) return;
			
			console.error('Error accepting task:', error);
			
			// Clear attempt on failure to allow retry
			clearAcceptDisputeAttempt(contract.contract.escrowId);
			acceptAttempt = null;
			
			// Clear loading on error
			setLoading('accept', false);
			
			const errorMessage =
				error instanceof Error
					? getErrorMessage(error)
					: $t('dashboard.contracts.actions.payment_released_error');
			appStore.showErrorToast(errorMessage);
		}
	}

	// Show dispute confirmation
	function showDisputeConfirmation() {
		if (!contract.canDispute || isDisputeDisabled) return;
		if (useInternalModals) {
			showDisputeConfirm = true;
		} else {
			onShowDisputeConfirm();
		}
	}

	// Dispute task (client only) - called from parent modal
	export async function disputeTask() {
		if (!contract.canDispute || !isMounted) return;
		
		// Atomic check-and-set: prevents race conditions
		const wasRegistered = registerAcceptDisputeAttemptAtomic(
			contract.contract.escrowId,
			'dispute'
		);
		if (!wasRegistered) {
			// Already attempted - check status
			const attempt = getDisputeAttempt(contract.contract.escrowId);
			if (attempt?.status === 'confirmed') {
				if (isMounted) {
					appStore.showErrorToast($t('dashboard.contracts.actions.dispute_already_raised'));
				}
				return;
			} else if (attempt?.status === 'pending') {
				// Transaction pending - don't allow duplicate
				if (isMounted) {
					appStore.showErrorToast($t('dashboard.contracts.actions.dispute_raising_pending'));
				}
				return;
			}
			// If failed, allow retry
		}
		
		// Get the attempt (either newly created or existing)
		disputeAttempt = getDisputeAttempt(contract.contract.escrowId);

		setLoading('dispute', true);
		try {
			// Call RSK escrow disputeTask with contract event ID for proper nostr event publishing
			const result = await escrow.disputeTask(contract.contract.escrowId, contract.contractEvent.id);
			
			if (!isMounted) return;
			
			// Update cache with transaction hash (status is already 'pending' from registration)
			if (result.hash && disputeAttempt) {
				// Update the attempt with transaction hash
				disputeAttempt.transactionHash = result.hash;
				// Update the cache entry (overwrites existing entry with transaction hash)
				registerAcceptDisputeAttempt(contract.contract.escrowId, 'dispute', result.hash);
			}
			
			// Note: Loading state will remain true until transaction confirms
			// Status will be updated to 'confirmed' when transaction confirms
			// This happens in escrowEvents.ts handleTaskDisputed
			// The reactive effect will clear loading when status becomes 'confirmed'
		} catch (error) {
			if (!isMounted) return;
			
			console.error('Error disputing task:', error);
			
			// Clear attempt on failure to allow retry
			clearAcceptDisputeAttempt(contract.contract.escrowId);
			disputeAttempt = null;
			
			// Clear loading on error
			setLoading('dispute', false);
			
			const errorMessage =
				error instanceof Error
					? getErrorMessage(error)
					: $t('dashboard.contracts.actions.dispute_raised_error');
			appStore.showErrorToast(errorMessage);
		}
	}

	// Propose resolution
	async function proposeResolution() {
		if (!contract.canPropose) return;
		if (!proposedFreelancerAmountUSD) {
			appStore.showErrorToast($t('dashboard.contracts.actions.resolution_amounts_required'));
			return;
		}

		// Convert USD amounts to RBTC for validation and contract call
		const freelancerAmountUSD = parseFloat(proposedFreelancerAmountUSD);
		const totalAmountRBTC = parseFloat(contract.contract.amount);
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
			await escrow.proposeResolution(
				contract.contract.escrowId,
				freelancerAmountRBTC,
				contract.contractEvent.id,
				clientAmountRBTC,
				freelancerAmountRBTC
			);

			showResolutionForm = false;
			proposedClientAmountUSD = '';
			proposedFreelancerAmountUSD = '';
			onActionComplete?.();
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
		if (!contract.canAcceptProposal) return;

		setLoading('acceptProposal', true);
		try {
			// Call RSK escrow acceptProposal with contract event ID for proper nostr event publishing
			await escrow.acceptProposal(contract.contract.escrowId, contract.contractEvent.id);
			onActionComplete?.();
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
		if (!contract.canCancel || !isMounted) return;

		// Atomic check-and-set: prevents race conditions
		const wasRegistered = registerCompleteCancelAttemptAtomic(
			contract.contract.escrowId,
			'cancel'
		);
		if (!wasRegistered) {
			// Already attempted - check if it's a complete or cancel attempt
			const existingAttempt = getCompleteCancelAttempt(contract.contract.escrowId);
			if (existingAttempt?.type === 'complete') {
				// Complete was attempted - check status
				if (existingAttempt.status === 'confirmed') {
					if (isMounted) {
						appStore.showErrorToast($t('dashboard.contracts.actions.task_already_completed'));
					}
					return;
				} else if (existingAttempt.status === 'pending') {
					// Complete pending - don't allow cancel
					if (isMounted) {
						appStore.showErrorToast($t('dashboard.contracts.actions.task_completion_pending'));
					}
					return;
				}
			} else if (existingAttempt?.type === 'cancel') {
				// Cancel was attempted - check status
				if (existingAttempt.status === 'confirmed') {
					if (isMounted) {
						appStore.showErrorToast($t('dashboard.contracts.actions.contract_already_cancelled'));
					}
					return;
				} else if (existingAttempt.status === 'pending') {
					// Transaction pending - don't allow duplicate
					if (isMounted) {
						appStore.showErrorToast($t('dashboard.contracts.actions.contract_cancellation_pending'));
					}
					return;
				}
			}
			// If failed, allow retry
		}
		
		// Get the attempt (either newly created or existing)
		cancelAttempt = getCancelAttempt(contract.contract.escrowId);

		setLoading('cancel', true);
		try {
			// Call RSK escrow cancelEscrow with contract event ID for proper nostr event publishing
			const result = await escrow.cancelEscrow(contract.contract.escrowId, contract.contractEvent.id);
			
			if (!isMounted) return;
			
			// Update cache with transaction hash (status is already 'pending' from registration)
			if (result.hash && cancelAttempt) {
				// Update the attempt with transaction hash
				cancelAttempt.transactionHash = result.hash;
				// Update the cache entry (overwrites existing entry with transaction hash)
				registerCompleteCancelAttempt(contract.contract.escrowId, 'cancel', result.hash);
			}
			
			// Note: Status will be updated to 'confirmed' when transaction confirms
			// This happens in escrowEvents.ts handleEscrowCancelled
			// If transaction fails, it will be handled in escrow.ts
		} catch (error) {
			if (!isMounted) return;
			
			console.error('Error cancelling escrow:', error);
			
			// Clear attempt on failure to allow retry
			clearCompletionAttempt(contract.contract.escrowId);
			cancelAttempt = null;
			
			const errorMessage =
				error instanceof Error
					? getErrorMessage(error)
					: $t('dashboard.contracts.actions.escrow_cancelled_error');
			appStore.showErrorToast(errorMessage);
		} finally {
			if (isMounted) {
				setLoading('cancel', false);
			}
		}
	}

	// Resolve after timelock
	async function resolveAfterTimelock() {
		if (!contract.canResolveTimelock) return;

		setLoading('resolveTimelock', true);
		try {
			// Call RSK escrow resolveAfterTimelock with contract event ID for proper nostr event publishing
			await escrow.resolveAfterTimelock(contract.contract.escrowId, contract.contractEvent.id);
			onActionComplete?.();
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

	// Show delete confirmation
	function showDeleteConfirmation() {
		if (!contract.canDelete) return;
		if (useInternalModals) {
			showDeleteConfirm = true;
		} else {
			onShowDeleteConfirm();
		}
	}

	// Delete contract (after confirmation) - called from parent modal
	export async function deleteContract() {
		if (!contract.canDelete) return;
		setLoading('delete', true);
		try {
			await deleteContractUtil(contract.contractEvent.id, contract.contract.escrowId);
			appStore.showSuccessToast($t('dashboard.contracts.actions.delete_contract_success'));
			onActionComplete?.();
		} catch (error) {
			console.error('Error deleting contract:', error);
			// Handle structured EscrowError
			const { isEscrowError } = await import('$lib/utils/errors/escrowErrors');
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

	// Load translations on mount and when locale changes
	$effect(() => {
		if (browser && $locale) {
			loadNamespace($locale as SupportedLanguage, 'dashboard/contracts/actions').catch((error) => {
				console.warn('Failed to load contract actions translations:', error);
			});
		}
	});

	// Set action handlers for parent component
	$effect(() => {
		onSetAcceptTaskHandler?.(acceptTask);
		onSetDisputeTaskHandler?.(disputeTask);
		onSetDeleteContractHandler?.(deleteContract);
		onSetCompleteTaskHandler?.(completeTaskWithAttachments);
	});

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
	
	// Load completion attempt on mount
	$effect(() => {
		if (!isMounted) return;
		
		const attempt = getCompleteAttempt(contract.contract.escrowId);
		if (attempt) {
			completionAttempt = attempt;
			// If confirmed, check blockchain status to verify
			if (attempt.status === 'confirmed') {
				checkBlockchainCompletionStatus();
			}
		}
	});
	
	// Load cancel attempt on mount
	$effect(() => {
		if (!isMounted) return;
		
		const cancel = getCancelAttempt(contract.contract.escrowId);
		if (cancel) {
			cancelAttempt = cancel;
		}
	});
	
	// Load accept/dispute attempts on mount and watch for status changes
	$effect(() => {
		if (!isMounted) return;
		
		const accept = getAcceptAttempt(contract.contract.escrowId);
		if (accept) {
			acceptAttempt = accept;
		}
		
		const dispute = getDisputeAttempt(contract.contract.escrowId);
		if (dispute) {
			disputeAttempt = dispute;
		}
	});
	
	// Watch for accept/dispute attempt status changes and clear loading when confirmed
	$effect(() => {
		if (!isMounted) return;
		
		// Subscribe to store changes
		const unsubscribe = acceptDisputeStore.subscribe((cache) => {
			if (!isMounted) return;
			
			const escrowId = contract.contract.escrowId;
			const attempt = cache.get(escrowId);
			
			if (attempt) {
				// Update local state
				if (attempt.type === 'accept') {
					const previousStatus = acceptAttempt?.status;
					acceptAttempt = attempt;
					// Clear loading when status becomes confirmed
					if (attempt.status === 'confirmed' && previousStatus !== 'confirmed') {
						setLoading('accept', false);
					}
				} else if (attempt.type === 'dispute') {
					const previousStatus = disputeAttempt?.status;
					disputeAttempt = attempt;
					// Clear loading when status becomes confirmed
					if (attempt.status === 'confirmed' && previousStatus !== 'confirmed') {
						setLoading('dispute', false);
					}
				}
			}
		});
		
		return () => {
			unsubscribe();
		};
	});
	
	// Also watch local state changes to clear loading when status becomes confirmed
	$effect(() => {
		if (!isMounted) return;
		
		// Clear loading when accept attempt status becomes confirmed
		if (acceptAttempt?.status === 'confirmed' && isLoading.accept) {
			setLoading('accept', false);
		}
		
		// Clear loading when dispute attempt status becomes confirmed
		if (disputeAttempt?.status === 'confirmed' && isLoading.dispute) {
			setLoading('dispute', false);
		}
	});
	
	// Derived state for button disabled logic
	const isCompleteDisabled = $derived(
		!isMounted ||
		isLoading.complete ||
		isLoading.cancel || // Disable if cancel is loading
		isCheckingBlockchain ||
		(completionAttempt?.status === 'pending') ||
		(completionAttempt?.status === 'confirmed') ||
		(cancelAttempt?.status === 'pending') || // Disable if cancel is pending
		(cancelAttempt?.status === 'confirmed') || // Disable if cancel is confirmed
		(blockchainCompletionStatus === EscrowStatus.Completed) ||
		(blockchainCompletionStatus === EscrowStatus.Cancelled) // Disable if cancelled
	);
	
	// Derived state for accept/dispute button disabled logic
	const isAcceptDisabled = $derived(
		!isMounted ||
		isLoading.accept ||
		isLoading.dispute || // Disable if dispute is loading
		(acceptAttempt?.status === 'pending') ||
		(acceptAttempt?.status === 'confirmed') ||
		(disputeAttempt?.status === 'pending') ||
		(disputeAttempt?.status === 'confirmed')
	);
	
	const isDisputeDisabled = $derived(
		!isMounted ||
		isLoading.accept || // Disable if accept is loading
		isLoading.dispute ||
		(acceptAttempt?.status === 'pending') ||
		(acceptAttempt?.status === 'confirmed') ||
		(disputeAttempt?.status === 'pending') ||
		(disputeAttempt?.status === 'confirmed')
	);
	
	// Derived state for cancel button disabled logic
	const isCancelDisabled = $derived(
		!isMounted ||
		isLoading.cancel ||
		isLoading.complete || // Disable if complete is loading
		(cancelAttempt?.status === 'pending') ||
		(cancelAttempt?.status === 'confirmed') ||
		(completionAttempt?.status === 'pending') || // Disable if complete is pending
		(completionAttempt?.status === 'confirmed') || // Disable if complete is confirmed
		(blockchainCompletionStatus === EscrowStatus.Cancelled) ||
		(blockchainCompletionStatus === EscrowStatus.Completed) // Disable if completed
	);

	// Auto-calculate client amount from freelancer amount in USD
	$effect(() => {
		if (proposedFreelancerAmountUSD && contract.contract.amount && btcPrice > 0) {
			const freelancerAmountUSD = parseFloat(proposedFreelancerAmountUSD) || 0;
			const totalAmountRBTC = parseFloat(contract.contract.amount);
			const totalAmountUSD = totalAmountRBTC * btcPrice;
			const clientAmountUSD = totalAmountUSD - freelancerAmountUSD;
			if (clientAmountUSD >= 0) {
				proposedClientAmountUSD = clientAmountUSD.toFixed(2);
			}
		}
	});
</script>

<div class={containerClass}>
	<!-- Complete Task (Freelancer) -->
	{#if contract.canComplete}
		<button
			class="btn btn-success btn-sm {isInline ? 'w-full sm:w-fit' : 'w-full'}"
			onclick={showCompleteTaskModal}
			disabled={isCompleteDisabled}
			title={isCompleteDisabled && (completionAttempt?.status === 'confirmed' || blockchainCompletionStatus === EscrowStatus.Completed)
				? $t('dashboard.contracts.actions.task_already_completed_tooltip')
				: isCompleteDisabled && completionAttempt?.status === 'pending'
				? $t('dashboard.contracts.actions.task_completion_pending_tooltip')
				: ''}
		>
			{#if isLoading.complete || isCheckingBlockchain}
				<span class="loading loading-spinner loading-xs"></span>
			{:else if completionAttempt?.status === 'confirmed' || blockchainCompletionStatus === EscrowStatus.Completed}
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
	{#if contract.canAccept}
		<button
			class="btn btn-success btn-sm {isInline ? 'w-full sm:w-fit' : 'w-full'}"
			onclick={showAcceptConfirmation}
			disabled={isAcceptDisabled}
		>
			{#if isLoading.accept || acceptAttempt?.status === 'pending'}
				<span class="loading loading-spinner loading-xs"></span>
			{:else if acceptAttempt?.status === 'confirmed'}
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
						d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
					/>
				</svg>
			{/if}
			{$t('dashboard.contracts.actions.accept_work')}
		</button>
	{/if}

	<!-- Dispute Task (Client) -->
	{#if contract.canDispute}
		<button
			class="btn btn-error btn-sm {isInline ? 'w-full sm:w-fit' : 'w-full'}"
			onclick={showDisputeConfirmation}
			disabled={isDisputeDisabled}
		>
			{#if isLoading.dispute || disputeAttempt?.status === 'pending'}
				<span class="loading loading-spinner loading-xs"></span>
			{:else if disputeAttempt?.status === 'confirmed'}
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
						d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16c-.77.833.192 2.5 1.732 2.5z"
					/>
				</svg>
			{/if}
			{$t('dashboard.contracts.actions.dispute_work')}
		</button>
	{/if}

	<!-- Propose Resolution -->
	{#if contract.canPropose}
		{#if !showResolutionForm}
			<button
				class="btn btn-warning btn-sm text-black {isInline ? 'w-full sm:w-fit' : 'w-full'}"
				onclick={() => {
					showResolutionForm = true;
					openDrawer();
				}}
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
						d="M9 5H7a2 2 0 00-2 2v6a2 2 0 002 2h2m0 0h2m-2 0v4l3-3-3-3m2-5a2 2 0 012-2h2a2 2 0 012 2v6a2 2 0 01-2 2h-2m0 0v4l-3-3 3-3"
					/>
				</svg>
				{$t('dashboard.contracts.actions.propose_resolution')}
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
						parseFloat(contract.contract.amount) * btcPrice
					).toFixed(2)} ({Math.round(
						parseFloat(contract.contract.amount) * 100_000_000
					).toLocaleString()} Sats)
				</div>

				<div class="flex flex-row-reverse gap-2 place-self-end">
					<button
						class="btn btn-warning btn-sm text-black"
						onclick={proposeResolution}
						disabled={isLoading.propose}
					>
						{#if isLoading.propose}
							<span class="loading loading-spinner loading-xs"></span>
						{:else}
							{$t('dashboard.contracts.actions.propose')}
						{/if}
					</button>
					<button
						class="btn btn-ghost btn-outline btn-sm"
						onclick={() => (showResolutionForm = false)}
					>
						{$t('dashboard.contracts.actions.cancel')}
					</button>
				</div>
			</div>
		{/if}
	{/if}

	<!-- Accept Proposal -->
	{#if !isInline && contract.canAcceptProposal}
		<div class="bg-base-300 w-full space-y-3 rounded-lg p-3">
			<h5 class="text-sm font-medium">
				{$t('dashboard.contracts.actions.current_proposal')}
			</h5>

			{#if contract.contract.disputeProposal}
				<div class="flex flex-col gap-2 space-y-2 text-xs sm:flex-row">
					<div class="w-full">
						<span class="text-base-content/70">
							{contract.isClient
								? $t('dashboard.contracts.actions.your_amount')
								: $t('dashboard.contracts.actions.client_amount')}:
						</span>
						<div class="font-semibold">
							${(parseFloat(contract.contract.disputeProposal.clientAmount) * btcPrice).toFixed(2)}
							({Math.round(
								parseFloat(contract.contract.disputeProposal.clientAmount) * 100_000_000
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
							${(parseFloat(contract.contract.disputeProposal.freelancerAmount) * btcPrice).toFixed(
								2
							)}
							({Math.round(
								parseFloat(contract.contract.disputeProposal.freelancerAmount) * 100_000_000
							).toLocaleString()} Sats)
						</div>
					</div>
				</div>

				<div class="text-base-content/60 text-xs">
					{$t('dashboard.contracts.actions.proposed_by')}:
					{contract.contract.disputeProposal.proposer.slice(0, 8)}
					...
					{contract.contract.disputeProposal.proposer.slice(-6)}
				</div>
			{:else}
				<div class="text-base-content/60 text-xs">
					{$t('dashboard.contracts.actions.loading_proposal')}
				</div>
			{/if}

			<button
				class="btn btn-success btn-sm w-full"
				onclick={acceptProposal}
				disabled={isLoading.acceptProposal || !contract.contract.disputeProposal}
			>
				{#if isLoading.acceptProposal}
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
							d="M5 13l4 4L19 7"
						/>
					</svg>
				{/if}
				{$t('dashboard.contracts.actions.accept_proposal')}
			</button>
		</div>
	{/if}

	<!-- Cancel Escrow -->
	{#if contract.canCancel}
		<button
			class="btn btn-error btn-sm {isInline ? 'w-full sm:w-fit' : 'w-full'}"
			onclick={cancelEscrow}
			disabled={isCancelDisabled}
		>
			{#if isLoading.cancel || cancelAttempt?.status === 'pending'}
				<span class="loading loading-spinner loading-xs"></span>
			{:else if cancelAttempt?.status === 'confirmed'}
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
						d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
					/>
				</svg>
			{/if}
			{$t('dashboard.contracts.actions.cancel_contract')}
		</button>
	{/if}

	<!-- Resolve After Timelock -->
	{#if contract.canResolveTimelock}
		<div class="bg-base-300 space-y-3 rounded-lg p-3">
			{#if !isInline}
				<h5 class="text-sm font-medium">
					{$t('dashboard.contracts.actions.timelock_resolution')}
				</h5>

				<div class="text-base-content/60 text-xs">
					{$t('dashboard.contracts.actions.timelock_expired_message')}
				</div>
			{/if}

			<button
				class="btn btn-info btn-sm {isInline ? 'w-full sm:w-fit' : 'w-full'}"
				onclick={resolveAfterTimelock}
				disabled={isLoading.resolveTimelock}
			>
				{#if isLoading.resolveTimelock}
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
							d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
						/>
					</svg>
				{/if}
				{$t('dashboard.contracts.actions.resolve_timelock')}
			</button>
		</div>
	{/if}

	<!-- Delete Contract (always visible, disabled when canDelete is false) -->
	<button
		class="btn btn-error btn-sm {isInline ? 'w-full sm:w-fit' : 'w-full'}"
		onclick={showDeleteConfirmation}
		disabled={isLoading.delete || !contract.canDelete}
	>
		{#if isLoading.delete}
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
					d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
				/>
			</svg>
		{/if}
		{$t('dashboard.contracts.actions.delete_contract')}
	</button>
</div>

<!-- Modals (only rendered when using internal modals - for ContractCard usage) -->
{#if useInternalModals}
	<!-- Task Completion Modal -->
	<TaskCompletionModal
		{contract}
		isOpen={showCompletionModal}
		onClose={() => (showCompletionModal = false)}
		onComplete={async (attachments) => {
			await completeTaskWithAttachments(attachments);
			showCompletionModal = false;
		}}
		{btcPrice}
	/>

	<!-- Delete Confirmation Modal -->
	<ConfirmModal
		isOpen={showDeleteConfirm}
		title={$t('dashboard.contracts.actions.delete_contract_confirm_title')}
		message={$t('dashboard.contracts.actions.delete_contract_confirm_message')}
		confirmText={$t('dashboard.contracts.actions.delete_contract')}
		cancelText={$t('dashboard.contracts.actions.cancel')}
		confirmButtonClass="btn-error"
		onConfirm={async () => {
			await deleteContract();
			showDeleteConfirm = false;
		}}
		onCancel={() => (showDeleteConfirm = false)}
	/>

	<!-- Accept Work Confirmation Modal -->
	<ConfirmModal
		isOpen={showAcceptConfirm}
		title={$t('dashboard.contracts.actions.accept_work_confirm_title')}
		message={$t('dashboard.contracts.actions.accept_work_confirm_message')}
		confirmText={$t('dashboard.contracts.actions.accept_work')}
		cancelText={$t('dashboard.contracts.actions.cancel')}
		confirmButtonClass="btn-success"
		onConfirm={async () => {
			await acceptTask();
			showAcceptConfirm = false;
		}}
		onCancel={() => (showAcceptConfirm = false)}
	/>

	<!-- Dispute Work Confirmation Modal -->
	<ConfirmModal
		isOpen={showDisputeConfirm}
		title={$t('dashboard.contracts.actions.dispute_work_confirm_title')}
		message={$t('dashboard.contracts.actions.dispute_work_confirm_message')}
		confirmText={$t('dashboard.contracts.actions.dispute_work')}
		cancelText={$t('dashboard.contracts.actions.cancel')}
		confirmButtonClass="btn-error"
		onConfirm={async () => {
			await disputeTask();
			showDisputeConfirm = false;
		}}
		onCancel={() => (showDisputeConfirm = false)}
	/>
{/if}


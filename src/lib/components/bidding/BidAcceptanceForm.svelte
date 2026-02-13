<script lang="ts">
	import type { Task } from '$lib/types/task';
	import type { NostrEvent } from 'nostr-tools';
	import type { NostrBidContent, NostrEventWithFollowup } from '$lib/types/bid';
	import { t } from 'svelte-i18n';
	import { escrow, type ValidationWarning } from '$lib/utils/escrow';
	import { formatStandardDateTime, formatDate } from '$lib/utils/helpers/dateFormatter';
	import { goto } from '$app/navigation';
	import { walletStore, walletManager, getProvider } from '$lib/stores/wallet.store';
	import { loadNamespace, type SupportedLanguage } from '$lib/i18n/i18n';
	import { locale } from 'svelte-i18n';
	import { browser } from '$app/environment';
	import { copyToClipboard } from '$lib/utils/helpers/clipboard';
	import { appStore } from '$lib/stores/app.store';
	import { fly } from 'svelte/transition';
	import { linear } from 'svelte/easing';
	import { onMount, onDestroy } from 'svelte';
	import { sendLocationsToTaskee } from '$lib/utils/location/sendLocation';
import { TaskStatusEnum, TaskTypeEnum } from '$lib/utils/enums/task.enum';
	import { bidStore } from '$lib/stores/bid.store';
import { updateTask } from '$lib/nostr/task';
	import IconContentCopy from '~icons/mdi/content-copy';
	import IconMessage from '~icons/mdi/message';
	import IconCalendarClock from '~icons/mdi/calendar-clock';
	import IconTimerOutline from '~icons/mdi/timer-outline';
	import { allAssets, totalBalances, formatSats } from '$lib/stores/wallet.store';
	import MessageModal from '$lib/components/messages/MessageModal.svelte';
	import SecurePaymentContractModal from '$lib/components/bidding/SecurePaymentContractModal.svelte';
	import UserInfoDisplay from '$lib/components/user/UserInfoDisplay.svelte';
	import { triggerHaptic, ImpactStyle } from '$lib/utils/helpers/haptics';
	import { formatNumberWithTwoDecimals } from '$lib/utils/helpers/currencyFormatter';
	import { satsFromUsd } from '$lib/utils/helpers/crypto';

	// Props
	const props = $props<{
		bid: NostrEventWithFollowup;
		task: NostrEvent;
		btcPrice: number;
		onCancel: () => void;
	}>();

	const bidContent = props.bid.content as unknown as NostrBidContent;
	const taskContent = JSON.parse(props.task.content) as Task;

	// Form state
	let isSubmitting = $state(false);
	let validationErrors = $state<string[]>([]);
	let validationWarnings = $state<(string | ValidationWarning)[]>([]);
	let balanceErrors = $state<string[]>([]);
	let currentScreen = $state<'form' | 'success'>('form');
	let escrowDetails = $state<any>(null);
	let additionalNotes = $state<string>('');
	let additionalNotesExpanded = $state(false);
	let isLoading = $state(false);
	let showContractModal = $state(false);

	// Bitcoin accordion state
	let bitcoinExpanded = $state(false);
	let balancesHidden = $state(false); // Always show actual balances

	// Get Bitcoin asset (RBTC)
	let bitcoinAsset = $derived($allAssets.find((a) => a.assetId === 'rbtc'));

	// Message modal state
	let showMessageModal = $state(false);

	// Fund Contract confirmation modal state
	let showFundConfirmationModal = $state(false);

	// Ensure wallet, bids and dashboard translations are loaded
	if (browser && $locale) {
		// Load namespaces asynchronously - they'll be available when needed
		loadNamespace($locale as SupportedLanguage, 'dashboard/wallet').catch(console.error);
		loadNamespace($locale as SupportedLanguage, 'dashboard/bids').catch(console.error);
		loadNamespace($locale as SupportedLanguage, 'dashboard/dashboard').catch(console.error);
	}

	// Contract creation store
	let contractCreationStore = escrow.eventOps.getContractCreationStore();

	// Calculate escrow details from bid
	let bidEscrowDetails = $derived(
		escrow.bidOps.calculateBidEscrowDetails(bidContent, taskContent, props.btcPrice)
	);

	// Calculate adjusted times if start time is in the past
	let adjustedTimes = $derived.by(() => {
		if (!bidEscrowDetails) return null;

		const now = Math.floor(Date.now() / 1000);

		if (bidEscrowDetails.estimatedStartTime <= now) {
			// Start time is in the past - adjust to current time + 1 hour
			const newStartTime = now + 3600; // 1 hour buffer

			// Calculate the time shift (how much later the new start time is compared to original)
			const timeShift = newStartTime - bidEscrowDetails.estimatedStartTime;

			// Shift the completion time by the same amount
			return {
				startTime: newStartTime,
				completionTime: bidEscrowDetails.estimatedCompletionTime + timeShift,
				wasAdjusted: true,
				originalStartTime: bidEscrowDetails.estimatedStartTime,
				originalCompletionTime: bidEscrowDetails.estimatedCompletionTime
			};
		}

		return {
			startTime: bidEscrowDetails.estimatedStartTime,
			completionTime: bidEscrowDetails.estimatedCompletionTime,
			wasAdjusted: false
		};
	});

	// Helper function to get translated warning text
	function getTranslatedWarning(warning: string | ValidationWarning): string {
		if (typeof warning === 'string') {
			return warning;
		}

		try {
			const translated = $t(warning.key, { values: warning.params || {} });
			// If translation returns the key itself (not found), or is undefined, use fallback
			if (translated == null || translated === warning.key || String(translated).startsWith('dashboard.bids')) {
				// Fallback to English text with parameters
				return `The estimated start time was ${warning.params?.timeText || 'in the past'}. You may need to contact the Taskee to arrange a new start time.`;
			}
			return String(translated);
		} catch (e) {
			// Fallback on error
			return `The estimated start time was ${warning.params?.timeText || 'in the past'}. You may need to contact the Taskee to arrange a new start time.`;
		}
	}

	// Open message modal for the taskee
	function openMessageModal() {
		if (bidContent.bidderId) {
			showMessageModal = true;
		}
	}

	$effect(() => {
		if (bidEscrowDetails) {
			const validationResult = escrow.bidOps.validateEscrowDetails(bidEscrowDetails);
			validationErrors = validationResult.errors;
			// Store warnings as-is (can be strings or structured objects)
			validationWarnings = validationResult.warnings;
		}
	});

	// Separate effect for balance validation
	$effect(() => {
		// Only check balance if wallet is connected and basic validation passes
		if (
			!isLoading &&
			bidEscrowDetails &&
			$walletStore.rsk.connected &&
			validationErrors.length === 0
		) {
			balanceErrors = escrow.bidOps.validateSufficientBalance(bidEscrowDetails);
		} else {
			balanceErrors = [];
		}
	});

	async function initializeWallet() {
		try {
			isLoading = true;
			if (!$walletStore.rsk.connected) {
				await walletManager.initialize();
			}
			// Load fresh balances
			await walletManager.loadAssets();
		} finally {
			isLoading = false;
		}
	}

	onMount(async () => {
		await initializeWallet();

		// Check if we're in success screen and verify transaction status
		// This handles component state persistence when user navigates away and returns
		if (currentScreen === 'success' && escrowDetails?.transactionResult?.hash) {
			try {
				const provider = getProvider('rsk');
				if (provider) {
					const receipt = await provider.getTransactionReceipt(
						escrowDetails.transactionResult.hash
					);
					if (receipt) {
						// Update status based on receipt
						if (receipt.status === 0) {
							// Transaction failed
							currentScreen = 'form';
							validationErrors = ['Transaction failed. Please try again.'];
							escrowDetails = null;
							// Clean up processing bid
							if (props.bid?.id) {
								bidStore.removeProcessingBid(props.bid.id);
							}
						} else if (receipt.status === 1) {
							// Transaction confirmed - ensure we have escrow ID
							if (
								!escrowDetails.transactionResult.escrowId &&
								escrowDetails.transactionResult.status !== 'confirmed'
							) {
								escrowDetails.transactionResult.status = 'confirmed';
							}
						}
					}
				}
			} catch (error) {
				// If we can't verify, assume it's still pending
				console.warn('Could not verify transaction status on mount:', error);
			}
		}
	});

	// Track any async operations that need cleanup
	let monitoringInterval: ReturnType<typeof setInterval> | null = null;
	let isComponentMounted = $state(true);

	// Cleanup on component unmount to prevent memory leaks
	onDestroy(() => {
		isComponentMounted = false;

		// Clean up processing bid if component is destroyed during submission
		if (props.bid?.id && $bidStore.processingBidIds.has(props.bid.id)) {
			bidStore.removeProcessingBid(props.bid.id);
		}

		// Clean up any transaction monitoring intervals
		if (monitoringInterval) {
			clearInterval(monitoringInterval);
			monitoringInterval = null;
		}
	});

	// Handle form submission
	async function handleSubmit() {
		if (!props.bid || !props.task || validationErrors.length !== 0 || balanceErrors.length !== 0) {
			return appStore.showErrorToast('Validation errors');
		}

		try {
			isSubmitting = true;

			// Add bid to processing state to prevent duplicate submissions
			bidStore.addProcessingBid(props.bid.id);

			// Accept bid and create escrow
			const result = await escrow.bidOps.acceptBidAndCreateEscrow(
				props.bid,
				props.task,
				props.btcPrice,
				'RSK'
			);

			// Validate transaction result before showing success
			if (result.success && result.transactionResult) {
				// Validate transaction hash exists
				if (!result.transactionResult.hash) {
					validationErrors = ['Transaction hash is missing. Please try again.'];
					bidStore.removeProcessingBid(props.bid.id);
					return;
				}

				// Validate transaction status is not failed
				if (result.transactionResult.status === 'failed') {
					validationErrors = ['Transaction failed. Please try again.'];
					bidStore.removeProcessingBid(props.bid.id);
					return;
				}

				escrowDetails = {
					transactionResult: result.transactionResult,
					escrowDetails: bidEscrowDetails
				};

				currentScreen = 'success';

				// Update task status to IN_PROGRESS so bidding is closed (Addressable Event: same kind/pubkey/d-tag, latest content)
				try {
					await updateTask(props.task.id, { status: TaskStatusEnum.IN_PROGRESS });
				} catch (taskUpdateError) {
					console.error('Failed to update task status to IN_PROGRESS:', taskUpdateError);
					appStore.showErrorToast($t('dashboard.bids.bid_acceptance.task_status_update_error'));
				}

				// Note: Bid status update is automatically sent via escrowEvents.ts after contract creation

				// Send task acceptance message to taskee (locations for in-person, congratulations/title/description for remote)
				// This is done in the background without blocking the bid acceptance flow
				const freelancerPubkey = bidContent.bidderId || '';
				if (freelancerPubkey) {
					// Use task data we already have - no need to fetch it again
					const isRemote = taskContent.taskType === TaskTypeEnum.REMOTE;

					// Send message asynchronously in background - don't block UI or fail on error
					sendLocationsToTaskee(
						taskContent.pickupLocation || null,
						taskContent.dropOffLocation || null,
						freelancerPubkey,
						{
							taskId: props.task.id,
							taskTitle: taskContent.title,
							taskDescription: taskContent.description,
							isRemote,
							additionalNotes: additionalNotes.trim() || ''
						}
					).catch((locationError) => {
						// Log error but don't fail bid acceptance if location sending fails
						console.error('Failed to send task acceptance message to taskee:', locationError);
					});
				}
			} else {
				// Show error
				validationErrors = [result.error || 'Failed to create escrow'];
				// Clean up processing bid on failure
				bidStore.removeProcessingBid(props.bid.id);
			}
		} catch (error) {
			console.error('Failed to accept bid:', error);
			validationErrors = [error instanceof Error ? error.message : 'Unknown error occurred'];
			// Clean up processing bid on error
			bidStore.removeProcessingBid(props.bid.id);
		} finally {
			isSubmitting = false;
		}
	}

	function formatDuration(startTime: number, endTime: number): string {
		const start = new Date(startTime);
		const end = new Date(endTime);
		const diffMs = end.getTime() - start.getTime();

		const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
		const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
		const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

		if (days > 0) {
			return `${days} ${days !== 1 ? $t('dashboard.bids.bid_acceptance.days') : $t('dashboard.bids.bid_acceptance.day')} ${hours} ${hours !== 1 ? $t('dashboard.bids.bid_acceptance.hours') : $t('dashboard.bids.bid_acceptance.hour')}`;
		} else if (hours > 0) {
			return `${hours} ${hours !== 1 ? $t('dashboard.bids.bid_acceptance.hours') : $t('dashboard.bids.bid_acceptance.hour')} ${minutes} ${minutes !== 1 ? $t('dashboard.bids.bid_acceptance.minutes') : $t('dashboard.bids.bid_acceptance.minute')}`;
		} else {
			return `${minutes} ${minutes !== 1 ? $t('dashboard.bids.bid_acceptance.minutes') : $t('dashboard.bids.bid_acceptance.minute')}`;
		}
	}

	function formatUSDAmount(rbtcAmount: number): string {
		const usdAmount = rbtcAmount * props.btcPrice;
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD',
			minimumFractionDigits: 2,
			maximumFractionDigits: 2
		}).format(usdAmount);
	}

	function formatBTCPrice(): string {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD',
			minimumFractionDigits: 0,
			maximumFractionDigits: 0
		}).format(props.btcPrice);
	}

	function formatSatsAmount(rbtcAmount: number): string {
		// Convert RBTC to sats (1 RBTC = 100,000,000 sats)
		const sats = Math.round(rbtcAmount * 100000000);
		return new Intl.NumberFormat('en-US').format(sats);
	}

	function formatTotalSatsAmount(): string {
		// Convert total amount (including gas fee) to sats
		const totalRBTC = getTotalWithGasFee() / props.btcPrice;
		return formatSatsAmount(totalRBTC);
	}

	function getEstimatedGasFee(): number {
		return 0.5; // Fixed $0.50 gas fee
	}

	function getTotalWithGasFee(): number {
		return bidEscrowDetails ? parseFloat(bidEscrowDetails.totalAmount) * props.btcPrice : 0;
	}

	/** Open Fund Contract confirmation modal (called when user clicks Accept). */
	function openFundConfirmationModal() {
		showFundConfirmationModal = true;
	}

	/** Called when user clicks Fund in the confirmation modal. Re-checks balance, then closes and submits or shows error. */
	async function handleFundClick() {
		triggerHaptic(ImpactStyle.Light);
		const recheckErrors = bidEscrowDetails
			? escrow.bidOps.validateSufficientBalance(bidEscrowDetails)
			: [];
		if (recheckErrors.length > 0) {
			appStore.showErrorToast($t('dashboard.bids.bid_acceptance.insufficient_balance'));
			return;
		}
		showFundConfirmationModal = false;
		await handleSubmit();
	}
</script>

{#if !bidContent || !taskContent}
	<div class="flex items-center justify-center py-12">
		<div class="text-center">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="text-base-content/30 mx-auto h-12 w-12"
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
			<p class="text-base-content/60 mt-2 text-sm">
				{$t('dashboard.no_data_available')}
			</p>
		</div>
	</div>
{:else if currentScreen === 'form'}
	<!-- Content with padding -->
	<div
		class="overflow-x-hidden"
		in:fly={{
			duration: 200,
			easing: linear,
			y: 0,
			x: -20
		}}
	>
		<!-- Container with gap for even spacing -->
		<div class="flex flex-col gap-4">
			<!-- Unified Responsive Layout -->
			<div class="bg-base-300 lg:bg-base-200 rounded-2xl">
				<!-- Task Title Row -->
				<div class="w-full min-w-0 px-6 pt-3">
					<h5 class="wrap-break-words line-clamp-2 text-lg font-semibold">{taskContent.title}</h5>
				</div>

				<!-- Divider (Desktop only) -->
				<div class="divider text-base-content/60 mx-6 my-2 text-sm">
					{$t('dashboard.bids.bid_acceptance.contract_information')}
				</div>

				<!-- User Info and Pricing Layout -->
				<div class="flex flex-col gap-4 px-3 pb-4 lg:flex-row">
					<!-- Left Column: Bidder Information -->
					<div class="min-w-0 flex-1">
						<div class="rounded-lg px-3 pt-3">
							<!-- Bidder Profile -->
							<div class="flex min-w-0 items-center gap-3">
								<div class="avatar shrink-0">
									<div
										class="bg-base-100 flex h-8 w-8 items-center justify-center rounded-full lg:h-10 lg:w-10"
									>
										{#if bidContent?.bidderAvatar}
											<img
												src={bidContent.bidderAvatar}
												alt={$t('dashboard.bids.bid_acceptance.bidder_avatar')}
												class="h-8 w-8 rounded-full object-cover lg:h-10 lg:w-10"
											/>
										{:else}
											<div
												class="avatar placeholder text-neutral-content bg-primary flex h-8 w-8 items-center justify-center overflow-hidden rounded-full text-center lg:h-10 lg:w-10"
											>
												<span class="text-sm font-semibold lg:text-lg">
													{(bidContent.bidderName || 'A').charAt(0).toUpperCase()}
												</span>
											</div>
										{/if}
									</div>
								</div>

								<div class="flex min-w-0 flex-1 flex-col">
									<span class="truncate text-sm font-medium">
										{bidContent.bidderName || $t('dashboard.bids.bid_acceptance.anonymous')}
									</span>

									<div class="mt-1 flex min-w-0 items-center">
										<div class="flex shrink-0">
											{#each Array(5) as _, i}
												<svg
													xmlns="http://www.w3.org/2000/svg"
													class="h-3 w-3 {i < (bidContent.bidderRating || 0)
														? 'text-yellow-400'
														: 'text-base-content/30'}"
													fill="currentColor"
													viewBox="0 0 24 24"
												>
													<path
														d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
													/>
												</svg>
											{/each}
										</div>
										<span class="text-base-content/60 ml-1 truncate text-xs">
											{(bidContent.bidderRating || 0).toFixed(1)}
											<!-- TODO: Add proper completed tasks display -->
											<!-- {bidContent?. || 0} -->
											<!-- {$t('dashboard.bids.bid_acceptance.tasks')} -->
										</span>
									</div>

									<p class="text-base-content/60 mt-1 truncate text-sm">
										{$t('dashboard.bids.bid_acceptance.member_since')}
										{#if props.bid?.created_at}
											{(() => {
												try {
													// NostrEvent.created_at is Unix timestamp in seconds
													const date = new Date(props.bid.created_at * 1000);
													// Check if date is valid
													if (isNaN(date.getTime())) {
														return 'Recently';
													}
													return date.toLocaleDateString('en-US', {
														month: 'short',
														year: 'numeric'
													});
												} catch (e) {
													return 'Recently';
												}
											})()}
										{:else}
											Recently
										{/if}
									</p>
								</div>
							</div>

							<!-- Start and end times -->
							<div class="mt-4 block space-y-2">
								<div class="flex min-w-0 items-center justify-between gap-2 text-xs">
									<span class="text-base-content/60 shrink-0"
										>{$t('dashboard.bids.bid_acceptance.estimated_start')}</span
									>
									<span class="text-base-content/80 truncate text-right">
										{adjustedTimes
											? formatStandardDateTime(new Date(adjustedTimes.startTime * 1000))
											: 'N/A'}
									</span>
								</div>
								<div class="flex min-w-0 items-center justify-between gap-2 text-xs">
									<span class="text-base-content/60 shrink-0"
										>{$t('dashboard.bids.bid_acceptance.estimated_completion')}</span
									>
									<span class="text-base-content/80 truncate text-right">
										{adjustedTimes
											? formatStandardDateTime(new Date(adjustedTimes.completionTime * 1000))
											: 'N/A'}
									</span>
								</div>
								<div class="flex min-w-0 items-center justify-between gap-2 text-xs">
									<span class="text-base-content/60 shrink-0"
										>{$t('dashboard.bids.bid_acceptance.estimated_duration')}</span
									>
									<span class="text-base-content/80 truncate text-right"
										>{adjustedTimes
											? formatDuration(
													adjustedTimes.startTime * 1000,
													adjustedTimes.completionTime * 1000
												)
											: 'N/A'}</span
									>
								</div>
							</div>
						</div>
					</div>

					<!-- Pricing Section -->
					<div class="min-w-0 flex-1">
						<div class="bg-base-100 mt-3 rounded-lg p-3 lg:mt-0 lg:bg-transparent">
							<div class="space-y-2">
								<div class="flex min-w-0 items-center justify-between gap-2">
									<div class="flex min-w-0 items-center gap-1">
										<span class="truncate text-xs font-medium"
											>{$t('dashboard.bids.bid_acceptance.base_amount')}</span
										>
										<div
											class="tooltip tooltip-top shrink-0"
											data-tip={$t('dashboard.bids.bid_acceptance.base_amount_tooltip')}
										>
											<svg
												xmlns="http://www.w3.org/2000/svg"
												class="text-base-content/60 h-3 w-3"
												fill="none"
												viewBox="0 0 24 24"
												stroke="currentColor"
											>
												<path
													stroke-linecap="round"
													stroke-linejoin="round"
													stroke-width="2"
													d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
												/>
											</svg>
										</div>
									</div>
									<span class="shrink-0 text-xs font-bold">
										{bidEscrowDetails
											? formatUSDAmount(parseFloat(bidEscrowDetails.baseAmount))
											: '$0.00'}
									</span>
								</div>

								<div class="flex min-w-0 items-center justify-between gap-2">
									<div class="flex min-w-0 items-center gap-1">
										<span class="truncate text-xs font-medium"
											>{$t('dashboard.bids.bid_acceptance.client_fee', {
												values: {
													fee: bidEscrowDetails
														? escrow.bidOps.getFeePercentageDisplay(bidEscrowDetails.clientFeeTier)
														: '0%'
												}
											})}</span
										>
										<div
											class="tooltip tooltip-top shrink-0"
											data-tip={$t('dashboard.bids.bid_acceptance.fee_tooltip')}
										>
											<svg
												xmlns="http://www.w3.org/2000/svg"
												class="text-base-content/60 h-3 w-3"
												fill="none"
												viewBox="0 0 24 24"
												stroke="currentColor"
											>
												<path
													stroke-linecap="round"
													stroke-linejoin="round"
													stroke-width="2"
													d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
												/>
											</svg>
										</div>
									</div>
									<span class="shrink-0 text-xs font-bold"
										>{bidEscrowDetails
											? formatUSDAmount(parseFloat(bidEscrowDetails.clientFee))
											: '$0.00'}</span
									>
								</div>

								<div class="flex min-w-0 items-center justify-between gap-2">
									<div class="flex min-w-0 items-center gap-1">
										<span class="truncate text-xs font-medium italic"
											>{$t('dashboard.bids.bid_acceptance.estimated_gas_fee')}</span
										>
										<div
											class="tooltip tooltip-top shrink-0"
											data-tip={$t('dashboard.bids.bid_acceptance.gas_fee_tooltip')}
										>
											<svg
												xmlns="http://www.w3.org/2000/svg"
												class="text-base-content/60 h-3 w-3"
												fill="none"
												viewBox="0 0 24 24"
												stroke="currentColor"
											>
												<path
													stroke-linecap="round"
													stroke-linejoin="round"
													stroke-width="2"
													d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
												/>
											</svg>
										</div>
									</div>
									<span class="shrink-0 text-xs font-bold italic"
										>${getEstimatedGasFee().toFixed(2)}</span
									>
								</div>

								<div class="border-base-200 border-t pt-2">
									<div class="flex min-w-0 items-center justify-between gap-2">
										<span class="truncate text-base font-bold"
											>{$t('dashboard.bids.bid_acceptance.total_payment')}</span
										>
										<span class="text-primary shrink-0 text-base font-bold"
											>${getTotalWithGasFee().toFixed(2)}</span
										>
									</div>
								</div>

								<!-- BTC Price and Sats on same row -->
								<div class="">
									<div class="flex min-w-0 items-center justify-between gap-2">
										<span class="text-base-content/60 truncate text-xs font-medium italic"
											>{$t('dashboard.bids.bid_acceptance.btc_price')} {formatBTCPrice()}</span
										>
										<span class="text-base-content/60 shrink-0 text-xs font-medium italic"
											>{formatTotalSatsAmount()} {$t('dashboard.bids.bid_acceptance.sats')}</span
										>
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>

			<!-- Validation Warnings (above Bitcoin Balance Accordion) -->
			{#if validationWarnings.length > 0}
				<div class="alert alert-outline alert-warning">
					<div class="flex items-center gap-3 w-full">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-6 w-6 shrink-0 stroke-current"
							fill="none"
							viewBox="0 0 24 24"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
							/>
						</svg>
						<div class="min-w-0 flex-1 flex items-center gap-2">
							<div class="min-w-0 flex-1">
								{#if validationWarnings.length === 1}
									<p class="word-break-words">
										{getTranslatedWarning(validationWarnings[0])}
									</p>
								{:else}
									<ul class="list-inside list-disc space-y-1">
										{#each validationWarnings as warning}
											<li class="word-break-words">
												{getTranslatedWarning(warning)}
											</li>
										{/each}
									</ul>
								{/if}
							</div>
							{#if bidContent.bidderId}
								<button
									type="button"
									class="btn btn-primary btn-sm shrink-0"
									onclick={openMessageModal}
									title={$t('dashboard.bids.bid_acceptance.message_taskee')}
									aria-label={$t('dashboard.bids.bid_acceptance.message_taskee')}
								>
									<IconMessage class="h-5 w-5" />
								</button>
							{/if}
						</div>
					</div>
				</div>
			{/if}

			<!-- Bitcoin Balance Accordion -->
			<div>
				<div
					class="collapse-arrow border-primary bg-base-100 collapse rounded-lg border-2"
					class:collapse-open={bitcoinExpanded}
				>
					<button
						type="button"
						class="collapse-title flex items-center justify-between px-3 py-2 pr-10 text-left text-sm font-medium sm:px-4 sm:py-3 sm:pr-12 sm:text-base"
						onclick={() => (bitcoinExpanded = !bitcoinExpanded)}
					>
						<div class="flex min-w-0 flex-1 items-center gap-2">
							<img
								src="/images/chains/Bitcoin.svg"
								alt="Bitcoin"
								class="h-5 w-5 shrink-0 sm:h-6 sm:w-6"
							/>
							<span>{$t('wallet.bitcoin')}</span>
						</div>
						<div class="ml-2 shrink-0 text-right">
							{#if isLoading || $walletStore.rsk.connecting}
								<div class="flex flex-col items-end gap-0.5 h-9 w-9 justify-center">
									<span class="loading loading-spinner loading-md"></span>
								</div>
							{:else if !$walletStore.rsk.connected || $walletStore.rsk.error}
								<div class="text-sm font-semibold sm:text-base text-error">
									{$walletStore.rsk.error
										? $t('dashboard.bids.bid_acceptance.wallet_error_prefix')
										: $t('dashboard.bids.bid_acceptance.wallet_not_connected')}
								</div>
							{:else if balancesHidden}
								<div class="text-sm font-semibold sm:text-base">
									•••• {$t('wallet.sats')}
								</div>
								<div class="text-xs opacity-70 sm:text-sm">≈ $••••</div>
							{:else}
								<div class="text-sm font-semibold sm:text-base">
									{formatSats($totalBalances.sats)}
									{$t('wallet.sats')}
								</div>
								{#if bitcoinAsset?.usdValue}
									<div class="text-xs opacity-70 sm:text-sm">
										≈ ${bitcoinAsset.usdValue.toFixed(2)}
									</div>
								{/if}
							{/if}
						</div>
					</button>
					<div class="collapse-content">
						<div class="space-y-1.5 px-3 pb-1.5 sm:space-y-2 sm:px-4 sm:pb-2">
							<!-- L2 BTC Entry with Lightning Bolt Icon -->
							<div class="flex items-center justify-between">
								<div class="flex items-center gap-1.5 sm:gap-2">
									<svg
										xmlns="http://www.w3.org/2000/svg"
										class="h-4 w-4 text-yellow-500 sm:h-5 sm:w-5"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M13 10V3L4 14h7v7l9-11h-7z"
										/>
									</svg>
									<span class="text-sm font-medium sm:text-base">{$t('wallet.l2_btc')}</span>
								</div>
								<div class="text-right">
									{#if balancesHidden}
										<div class="text-sm font-semibold sm:text-base">
											•••• {$t('wallet.sats')}
										</div>
										<div class="text-xs opacity-70">$••••</div>
									{:else if bitcoinAsset}
										{@const balanceInSats = Math.floor(bitcoinAsset.balance * 100_000_000)}
										<div class="text-sm font-semibold sm:text-base">
											{formatSats(balanceInSats)}
											{$t('wallet.sats')}
										</div>
										{#if bitcoinAsset.usdValue > 0}
											<div class="text-xs opacity-70">
												${bitcoinAsset.usdValue.toFixed(2)}
											</div>
										{/if}
									{:else}
										<div class="text-sm font-semibold sm:text-base">0 {$t('wallet.sats')}</div>
									{/if}
								</div>
							</div>

							<!-- BTC Entry (Coming Soon) -->
							<div class="flex items-center justify-between">
								<div class="flex items-center gap-1.5 sm:gap-2">
									<img
										src="/images/chains/Bitcoin.svg"
										alt="BTC"
										class="h-4 w-4 opacity-50 sm:h-5 sm:w-5"
									/>
									<span class="text-base-content/50 text-sm font-medium sm:text-base"
										>{$t('wallet.btc')}</span
									>
								</div>
								<div class="text-right">
									<span class="text-base-content/50 text-sm font-semibold sm:text-base"
										>{$t('wallet.coming_soon')}</span
									>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>

			<!-- Additional Notes Section -->
			<div
				class="collapse-arrow border-primary py-2 bg-base-100 collapse rounded-lg border-2"
				class:collapse-open={additionalNotesExpanded}
			>
				<button
					type="button"
					class="collapse-title min-h-0 px-3 py-1 text-left text-sm font-medium text-base-content/80"
					onclick={() => {
						additionalNotesExpanded = !additionalNotesExpanded;
					}}
				>
					{$t('dashboard.bids.bid_acceptance.additional_notes_label')} ({$t('common.optional')})
				</button>
				<div class="collapse-content">
					<div class="form-control">
						<textarea
							class="textarea textarea-bordered w-full text-sm sm:text-base"
							placeholder={$t('dashboard.bids.bid_acceptance.additional_notes_placeholder')}
							bind:value={additionalNotes}
							rows="4"
						></textarea>
					</div>
				</div>
			</div>

			<!-- Escrow Information -->
			<button
				type="button"
				class="alert alert-info alert-outline w-full text-left cursor-pointer hover:bg-base-200 transition-colors"
				onclick={() => (showContractModal = true)}
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
					class="h-5 w-5 shrink-0 stroke-current"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
					/>
				</svg>
				<small class="text-xs md:text-sm">
					<strong>{$t('dashboard.bids.bid_acceptance.note')}</strong>
					{$t('dashboard.bids.bid_acceptance.contract_note')}
				</small>
			</button>

			<!-- Rootstock Escrow Contract Details -->
			<div>
				<!-- Wallet Connection Error (only show if connection failed after attempting) -->
				{#if $walletStore.rsk.error}
					<div
						class="alert alert-outline alert-warning mt-4 flex! flex-row! items-center! justify-between! text-black"
					>
						<div class="flex items-center">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="mr-2 h-6 w-6 shrink-0 stroke-current"
								fill="none"
								viewBox="0 0 24 24"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16c-.77.833.192 2.5 1.732 2.5z"
								/>
							</svg>
							<span>
								{$walletStore.rsk.error
									? `${$t('dashboard.bids.bid_acceptance.wallet_error_prefix')} ${$walletStore.rsk.error}`
									: $t('dashboard.bids.bid_acceptance.wallet_not_connected')}
							</span>
						</div>
						<button
							class="btn btn-sm btn-primary ml-auto"
							onclick={async () => await initializeWallet()}
							disabled={$walletStore.rsk.connecting}
						>
							{$t('dashboard.bids.bid_acceptance.connect_wallet')}
						</button>
					</div>
				{/if}
			</div>

			<!-- Insufficient Balance Error -->
			{#if balanceErrors.length > 0}
				<button
					type="button"
					class="alert alert-outline alert-error w-full cursor-pointer transition-opacity hover:opacity-80"
					onclick={() => goto('/dashboard/wallet')}
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-6 w-6 shrink-0 stroke-current"
						fill="none"
						viewBox="0 0 24 24"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16c-.77.833.192 2.5 1.732 2.5z"
						/>
					</svg>
					<span>{$t('dashboard.bids.bid_acceptance.insufficient_balance')}</span>
				</button>
			{/if}

			<!-- Validation Errors -->
			{#if validationErrors.length > 0}
				<div class="alert alert-outline alert-error">
					<div class="flex items-center gap-3">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-6 w-6 shrink-0 stroke-current"
							fill="none"
							viewBox="0 0 24 24"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
							/>
						</svg>
						<div class="min-w-0 flex-1">
							{#if validationErrors.length === 1}
								<p class="word-break-words">{validationErrors[0]}</p>
							{:else}
								<ul class="list-inside list-disc space-y-1">
									{#each validationErrors as error}
										<li class="word-break-words">{error}</li>
									{/each}
								</ul>
							{/if}
						</div>
					</div>
				</div>
			{/if}

			<!-- Testnet Warning Alert -->
			{#if import.meta.env.VITE_RSK_NETWORK === 'testnet'}
				<div class="alert alert-outline alert-warning">
					<div class="flex items-center">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="mr-3 h-6 w-6 shrink-0 stroke-current"
							fill="none"
							viewBox="0 0 24 24"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
							/>
						</svg>
						<div class="flex-1">
							<div class="text-warning text-center font-bold">
								{$t('wallet.testnet_warning.title')}
							</div>
							<div class="text-sm">
								<strong>{$t('wallet.testnet_warning.do_not_send_real_assets')}</strong>
								{$t('wallet.testnet_warning.description')}
							</div>

							<!-- User's Testnet Address -->
							{#if $walletStore.rsk.address}
								<div class="bg-base-200 mt-3 rounded-lg p-3">
									<div class="mb-2 text-sm font-medium">
										{$t('wallet.testnet_warning.your_address')}
									</div>
									<div class="flex items-center gap-2">
										<input
											type="text"
											value={$walletStore.rsk.address}
											readonly
											class="input input-sm flex-1 font-mono text-xs"
										/>
										<button
											class="btn btn-sm btn-outline"
											onclick={() => {
												copyToClipboard($walletStore.rsk.address || '');
												appStore.showSuccessToast($t('wallet.address_copied'));
											}}
											title={$t('wallet.testnet_warning.copy_address')}
											aria-label={$t('wallet.testnet_warning.copy_address')}
										>
											<IconContentCopy class="h-4 w-4" />
										</button>
									</div>
								</div>
							{/if}

							<div class="mt-2 text-sm">
								{$t('wallet.testnet_warning.faucet_instruction')}
								<a
									href="https://faucet.rootstock.io/"
									target="_blank"
									rel="noopener noreferrer"
									class="link link-primary font-semibold"
								>
									{$t('wallet.testnet_warning.faucet_link_text')}
								</a>
								{$t('wallet.testnet_warning.faucet_instruction_end')}
							</div>
						</div>
					</div>
				</div>
			{/if}

			<!-- Submit Buttons -->
			<div
				class="bg-base-100 border-base-300 sticky bottom-0 flex w-full flex-col-reverse justify-end gap-3 py-4 pb-8 sm:flex-row md:py-2"
			>
				<button
					type="button"
					class="btn btn-error btn-outline"
					onclick={props.onCancel}
					disabled={isSubmitting}
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-5 w-5"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M6 18L18 6M6 6l12 12"
						/>
					</svg>
					{$t('dashboard.bids.bid_acceptance.cancel')}
				</button>
				<button
					type="button"
					class="btn btn-primary"
					disabled={isSubmitting ||
						validationErrors.length > 0 ||
						balanceErrors.length > 0 ||
						!$walletStore.rsk.connected}
					onclick={openFundConfirmationModal}
				>
					{#if isSubmitting}
						<span class="loading loading-spinner loading-sm"></span>
						<span class="hidden sm:inline"
							>{$t('dashboard.bids.bid_acceptance.creating_escrow')}</span
						>
						<span class="sm:hidden">{$t('dashboard.bids.bid_acceptance.creating')}</span>
					{:else}
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-5 w-5"
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
						{$t('dashboard.bids.bid_acceptance.accept')}
					{/if}
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- Message Modal -->
{#if bidContent.bidderId}
	<MessageModal
		isOpen={showMessageModal}
		recipientName={bidContent.bidderName}
		recipientPubkey={bidContent.bidderId}
		onClose={() => {
			showMessageModal = false;
		}}
	/>
{/if}

<!-- Fund Contract confirmation modal -->
{#if showFundConfirmationModal}
	<div class="modal modal-open z-120">
		<div class="modal-box max-w-md p-4">
			<h3 class="text-lg font-bold">{$t('dashboard.bids.bid_acceptance.fund_contract_title')}</h3>
			<div class="space-y-8 py-3">
				<!-- Taskee + Total payment in same row: UserInfoDisplay left, Total (label over price) right -->
				<div class="flex min-w-0 items-center justify-between gap-3">
					<div class="min-w-0 flex-1">
						<UserInfoDisplay
							avatar={bidContent.bidderAvatar}
							username={bidContent.bidderName}
							rating={bidContent.bidderRating ?? 0}
							size="sm"
							pubkey={bidContent.bidderId ?? null}
							memberSince={props.bid?.created_at ?? null}
							anonymousLabel={$t('dashboard.bids.bid_acceptance.anonymous')}
						/>
					</div>
					{#if true}
						{@const totalUsd = getTotalWithGasFee()}
						<div class="shrink-0 text-right">
							<div class="text-xs font-medium opacity-70">
								{$t('dashboard.bids.bid_acceptance.total_payment')}
							</div>
							<div class="text-lg font-bold">
								{Number.isFinite(totalUsd) ? `$${formatNumberWithTwoDecimals(totalUsd)}` : '—'}
							</div>
							<div class="text-base-content/60 text-sm">
								{props.btcPrice > 0 && Number.isFinite(totalUsd)
									? satsFromUsd(totalUsd, props.btcPrice)
									: ''}
							</div>
						</div>
					{/if}
				</div>

				<!-- Start + Duration (one row: date left, duration right; short month) -->
				{#if adjustedTimes}
					<div class="flex min-w-0 items-center justify-between gap-3 text-sm">
						<span class="flex min-w-0 items-center gap-1">
							<IconCalendarClock class="h-6 w-6 shrink-0 text-primary" />
							<span class="truncate">
								{formatDate(new Date(adjustedTimes.startTime * 1000))}
							</span>
						</span>
						<span class="flex shrink-0 items-center gap-1">
							<IconTimerOutline class="h-6 w-6 shrink-0 text-primary" />
							<span>
								{formatDuration(adjustedTimes.startTime * 1000, adjustedTimes.completionTime * 1000)}
							</span>
						</span>
					</div>
				{/if}

				<!-- Insufficient balance message (same key as toast) -->
				{#if balanceErrors.length > 0}
					<p class="text-error text-sm">
						{$t('dashboard.bids.bid_acceptance.insufficient_balance')}
					</p>
				{/if}

				<!-- Warning -->
				<div class="alert alert-outline alert-warning mt-2 py-2">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-5 w-5 shrink-0 stroke-current"
						fill="none"
						viewBox="0 0 24 24"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
						/>
					</svg>
					<span class="text-xs">{$t('dashboard.bids.bid_acceptance.fund_confirm_warning')}</span>
				</div>
			</div>
			<div class="modal-action">
				<button type="button" class="btn btn-ghost" onclick={() => (showFundConfirmationModal = false)}>
					{$t('common.cancel')}
				</button>
				<button
					type="button"
					class="btn btn-primary"
					onclick={handleFundClick}
					disabled={isSubmitting}
				>
					{$t('dashboard.bids.bid_acceptance.fund')}
				</button>
			</div>
		</div>
		<button
			type="button"
			class="modal-backdrop"
			onclick={() => (showFundConfirmationModal = false)}
			aria-label="Close modal"
		></button>
	</div>
{/if}

{#if currentScreen === 'success' && escrowDetails}
	<!-- Content -->
	<div
		class="space-y-6 text-center"
		in:fly={{
			duration: 200,
			easing: linear,
			y: 0,
			x: 20
		}}
	>
		<!-- Success Icon -->
		<div class="flex justify-center">
			<div class="bg-success/10 rounded-full p-4">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="text-success h-16 w-16"
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
			</div>
		</div>

		<!-- Success Message -->
		<div class="space-y-2">
			<h3 class="text-xl font-bold">{$t('dashboard.bids.bid_acceptance.success_subtitle')}</h3>
			<p class="text-base-content/70">
				{$t('dashboard.bids.bid_acceptance.success_message', {
					values: {
						amount: bidEscrowDetails?.totalAmount
							? escrow.bidOps.formatRBTCAmount(bidEscrowDetails.totalAmount)
							: '0'
					}
				})}
			</p>
		</div>

		<!-- Contract Creation Status -->
		<div class="bg-base-200 rounded-lg p-4">
			<h4 class="mb-3 font-semibold">
				{$t('dashboard.bids.bid_acceptance.contract_creation_status')}
			</h4>
			<div class="flex items-center gap-3">
				{#if $contractCreationStore?.error}
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="text-error h-5 w-5"
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
					<span class="text-error">{$t('dashboard.bids.bid_acceptance.nostr_contract_failed')}</span
					>
				{:else if $contractCreationStore?.contractEventId}
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="text-success h-5 w-5"
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
					<span class="text-success"
						>{$t('dashboard.bids.bid_acceptance.nostr_contract_success')}</span
					>
				{:else}
					<span class="loading loading-spinner loading-sm text-info"></span>
					<span class="text-info"
						>{$t('dashboard.bids.bid_acceptance.creating_nostr_contract')}</span
					>
				{/if}
			</div>
		</div>

		<!-- Next Steps -->
		<div class="bg-base-200 rounded-lg p-4">
			<h4 class="text-base-content mb-2 font-semibold">
				{$t('dashboard.bids.bid_acceptance.what_happens_next_title')}
			</h4>
			<ul class="text-base-content/80 space-y-1 text-left text-sm">
				<li>• {$t('dashboard.bids.bid_acceptance.next_item_notify')}</li>
				<li>• {$t('dashboard.bids.bid_acceptance.next_item_begin')}</li>
				<li>• {$t('dashboard.bids.bid_acceptance.next_item_funds_held')}</li>
				<li>• {$t('dashboard.bids.bid_acceptance.next_item_release')}</li>
				{#if $contractCreationStore?.contractEventId}
					<li>• {$t('dashboard.bids.bid_acceptance.next_item_contract_details')}</li>
				{/if}
			</ul>
		</div>

		<!-- Action Buttons -->
		<div class="flex flex-col gap-3 pt-4 sm:flex-row">
			<button class="btn btn-outline flex-1" onclick={() => goto('/dashboard/create-task')}>
				{$t('dashboard.bids.bid_acceptance.create_new_task')}
			</button>
			<button class="btn btn-primary flex-1" onclick={() => goto('/dashboard?tab=contracts')}>
				{$t('dashboard.bids.bid_acceptance.go_to_contracts')}
			</button>
		</div>
	</div>
{/if}

<!-- Secure Payment Contract Modal -->
<SecurePaymentContractModal
	isOpen={showContractModal}
	onClose={() => (showContractModal = false)}
/>

<style>
	:global(.tooltip-top::before) {
		max-width: 200px;
		white-space: normal;
		word-wrap: break-word;
	}
</style>

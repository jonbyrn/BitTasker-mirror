<script lang="ts">
	import type { TaskBid } from '$lib/types/bid';
	import type { Task } from '$lib/types/task';
	import { rskWalletStore, rskWallet } from '$lib/stores/rskWallet.store';
	import { t } from 'svelte-i18n';
	import { locale } from 'svelte-i18n';
	import {
		calculateBidEscrowDetails,
		validateEscrowDetails,
		validateSufficientBalance,
		acceptBidAndCreateEscrow,
		getFeePercentageDisplay,
		formatRBTCAmount,
		formatTimestamp
	} from '$lib/utils/wallet/escrowBid';
	import { formatStandardDate, formatStandardDateTime } from '$lib/utils/helpers/dateFormatter';
	import { goto } from '$app/navigation';

	// Props
	const props = $props<{
		bid: TaskBid;
		task: Task;
		taskTitle: string;
		btcPrice: number;
		onCancel: () => void;
		onCreateNewTask?: () => void;
	}>();

	// Reactive date formatting functions using Svelte 5 runes
	function formatDateReactive(date: Date) {
		return formatStandardDate(date, $locale || 'en');
	}

	function formatDateTimeReactive(date: Date) {
		return formatStandardDateTime(date, $locale || 'en');
	}

	function formatDuration(startTime: string, endTime: string): string {
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
		return bidEscrowDetails.totalAmount * props.btcPrice + getEstimatedGasFee();
	}

	// Form state
	let isSubmitting = $state(false);
	let validationErrors = $state<string[]>([]);
	let balanceErrors = $state<string[]>([]);
	let currentScreen = $state<'form' | 'success'>('form');
	let escrowDetails = $state<any>(null);
	let contractCreationStatus = $state<'pending' | 'success' | 'failed'>('pending');

	// Calculate escrow details from bid
	let bidEscrowDetails = $derived(calculateBidEscrowDetails(props.bid, props.task, props.btcPrice));

	$effect(() => {
		validationErrors = validateEscrowDetails(bidEscrowDetails);
	});

	// Separate effect for balance validation
	$effect(() => {
		// Only check balance if wallet is connected and basic validation passes
		if ($rskWalletStore.isConnected && validationErrors.length === 0) {
			balanceErrors = validateSufficientBalance(bidEscrowDetails);
		} else {
			balanceErrors = [];
		}
	});

	// Auto-initialize Rootstock wallet if not connected
	$effect(() => {
		if (!$rskWalletStore.isConnected && !$rskWalletStore.isConnecting && !$rskWalletStore.error) {
			rskWallet.initialize().catch((error) => {
				console.error('Auto-initialization of Rootstock wallet failed:', error);
			});
		}
	});

	// Contract creation event listeners using stores
	/* $effect(() => {
		// Import the contract creation store
		import('$lib/utils/wallet/escrowEvents').then(({ contractCreationStore }) => {
			const unsubscribe = contractCreationStore.subscribe((event) => {
				if (event) {
					if (event.error) {
						contractCreationStatus = 'failed';
						// Toast is already shown in escrowEvents.ts
					} else if (event.contractEventId) {
						contractCreationStatus = 'success';
						// Toast is already shown in escrowEvents.ts
					}
				}
			});
			
			return unsubscribe;
		});
	}); */

	// Handle form submission
	async function handleSubmit() {
		if (validationErrors.length !== 0 || balanceErrors.length !== 0 || !props.bid.id) {
			return;
		}

		isSubmitting = true;
		contractCreationStatus = 'pending'; // Reset contract creation status

		try {
			// Accept bid and create escrow
			const result = await acceptBidAndCreateEscrow(props.bid, props.task, props.btcPrice);

			if (result.success) {
				escrowDetails = {
					transactionResult: result.transactionResult,
					escrowDetails: bidEscrowDetails
				};

				currentScreen = 'success';
			} else {
				// Show error
				validationErrors = [result.error || 'Failed to create escrow'];
			}
		} catch (error) {
			console.error('Failed to accept bid:', error);
			validationErrors = [error instanceof Error ? error.message : 'Unknown error occurred'];
		} finally {
			isSubmitting = false;
		}
	}

	// Handle creating new task
	function handleCreateNewTask() {
		if (props.onCreateNewTask) {
			props.onCreateNewTask();
		} else {
			props.onCancel();
		}
	}
</script>

{#if currentScreen === 'form'}
	<div
		class="bg-base-100 mx-auto max-h-[70vh] max-w-3xl overflow-x-hidden overflow-y-auto rounded-lg shadow-lg"
	>
		<!-- Header with close button -->
		<div
			class="bg-base-100 border-base-300 sticky top-0 z-10 flex items-center justify-between border-b p-4 pb-4 sm:p-6"
		>
			<h4 class="line-clamp-2 font-bold">{$t('dashboard.bids.bid_acceptance.accept_bid')}</h4>
			<button
				type="button"
				class="btn btn-ghost btn-sm btn-circle"
				onclick={props.onCancel}
				aria-label={$t('dashboard.bids.bid_acceptance.close_dialog')}
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
			</button>
		</div>

		<!-- Content with padding -->
		<div class="overflow-x-hidden p-4">
			<!-- Unified Responsive Layout -->
			<div class="bg-base-200 lg:bg-base-200 bg-base-300 rounded-2xl">
				<!-- Task Title Row -->
				<div class="w-full px-6 pt-3">
					<h5 class="line-clamp-2 text-lg font-semibold">{props.taskTitle}</h5>
				</div>

				<!-- Divider (Desktop only) -->
				<div class="divider text-base-content/60 mx-6 my-2 text-sm">{$t('dashboard.bids.bid_acceptance.contract_information')}</div>

				<!-- User Info and Pricing Layout -->
				<div class="flex flex-col gap-4 px-3 lg:flex-row">
					<!-- Left Column: Bidder Information -->
					<div class="flex-1">
						<div class="rounded-lg px-3 pt-3">
							<!-- Bidder Profile -->
							<div class="flex items-center gap-3">
								<div class="avatar">
									<div
										class="bg-base-100 flex h-8 w-8 items-center justify-center rounded-full lg:h-10 lg:w-10"
									>
										{#if props.bid.userProfile?.user?.profilePictureUrl}
											<img
												src={props.bid.userProfile.user.profilePictureUrl}
												alt={$t('dashboard.bids.bid_acceptance.bidder_avatar')}
												class="h-8 w-8 rounded-full object-cover lg:h-10 lg:w-10"
											/>
										{:else}
											<div
												class="avatar placeholder text-neutral-content bg-primary flex h-8 w-8 items-center justify-center overflow-hidden rounded-full text-center lg:h-10 lg:w-10"
											>
												<span class="text-sm font-semibold lg:text-lg">
													{(props.bid.userProfile?.user?.name || 'A').charAt(0).toUpperCase()}
												</span>
											</div>
										{/if}
									</div>
								</div>

								<div class="flex flex-col">
									<span class="text-sm font-medium">
										{props.bid.userProfile?.user?.name ||
											props.bid.userProfile?.professionalTitle ||
											$t('dashboard.bids.bid_acceptance.anonymous')}
									</span>

									<div class="mt-1 flex items-center">
										{#each Array(5) as _, i}
											<svg
												xmlns="http://www.w3.org/2000/svg"
												class="h-3 w-3 {i < (props.bid.userProfile?.averageRating || 0)
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
										<span class="text-base-content/60 ml-1 text-xs">
											{(props.bid.userProfile?.averageRating || 0).toFixed(1)} ({props.bid
												.userProfile?.tasksCompleted || 0}
											{$t('dashboard.bids.bid_acceptance.tasks')})
										</span>
									</div>

									<p class="text-base-content/60 mt-1 text-sm">
										{$t('dashboard.bids.bid_acceptance.member_since')}
										{new Date(props.bid.createdAt).toLocaleDateString('en-US', {
											month: 'short',
											year: 'numeric'
										})}
									</p>
								</div>
							</div>
						</div>
					</div>

					<!-- Pricing Section -->
					<div class="flex-1">
						<div class="bg-base-100 mt-3 rounded-lg p-3 lg:mt-0 lg:bg-transparent">
							<div class="space-y-2">
								<div class="flex items-center justify-between">
									<div class="flex items-center gap-1">
										<span class="text-xs font-medium"
											>{$t('dashboard.bids.bid_acceptance.base_amount')}</span
										>
										<div
											class="tooltip tooltip-right"
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
									<span class="text-xs font-bold"
										>{formatUSDAmount(bidEscrowDetails.baseAmount)}</span
									>
								</div>

								<div class="flex items-center justify-between">
									<div class="flex items-center gap-1">
										<span class="text-xs font-medium"
											>{$t('dashboard.bids.bid_acceptance.client_fee', {
												values: { fee: getFeePercentageDisplay(bidEscrowDetails.clientFeeTier) }
											})}</span
										>
										<div
											class="tooltip tooltip-right"
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
									<span class="text-xs font-bold"
										>{formatUSDAmount(bidEscrowDetails.clientFee)}</span
									>
								</div>

								<div class="flex items-center justify-between">
									<div class="flex items-center gap-1">
										<span class="text-xs font-medium"
											>{$t('dashboard.bids.bid_acceptance.estimated_gas_fee')}</span
										>
										<div
											class="tooltip tooltip-right"
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
									<span class="text-xs font-bold">${getEstimatedGasFee().toFixed(2)}</span>
								</div>

								<div class="border-base-200 border-t pt-2">
									<div class="flex items-center justify-between">
										<span class="text-base font-bold"
											>{$t('dashboard.bids.bid_acceptance.total_payment')}</span
										>
										<span class="text-primary text-base font-bold"
											>${getTotalWithGasFee().toFixed(2)}</span
										>
									</div>
								</div>

								<!-- BTC Price and Sats on same row -->
								<div class="">
									<div class="flex items-center justify-between">
										<span class="text-base-content/60 text-xs font-medium italic"
											>{$t('dashboard.bids.bid_acceptance.btc_price')} {formatBTCPrice()}</span
										>
										<span class="text-base-content/60 text-xs font-medium italic"
											>{formatTotalSatsAmount()} {$t('dashboard.bids.bid_acceptance.sats')}</span
										>
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>

				<!-- Start and end times -->
				<div class="mt-4 space-y-2 px-6 pb-4">
					<div class="flex items-center justify-between text-xs">
						<span class="text-base-content/60"
							>{$t('dashboard.bids.bid_acceptance.estimated_start')}</span
						>
						<span class="text-base-content/80"
							>{formatDateTimeReactive(new Date(bidEscrowDetails.estimatedStartTime))}</span
						>
					</div>
					<div class="flex items-center justify-between text-xs">
						<span class="text-base-content/60"
							>{$t('dashboard.bids.bid_acceptance.estimated_completion')}</span
						>
						<span class="text-base-content/80"
							>{formatDateTimeReactive(new Date(bidEscrowDetails.estimatedCompletionTime))}</span
						>
					</div>
					<div class="flex items-center justify-between text-xs">
						<span class="text-base-content/60"
							>{$t('dashboard.bids.bid_acceptance.estimated_duration')}</span
						>
						<span class="text-base-content/80"
							>{formatDuration(
								bidEscrowDetails.estimatedStartTime,
								bidEscrowDetails.estimatedCompletionTime
							)}</span
						>
					</div>
				</div>
			</div>

			<!-- Escrow Information -->
			<div class="alert alert-info alert-outline my-4">
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
			</div>

			<!-- Rootstock Escrow Contract Details -->
			<div class="mb-4">
				<!-- Wallet Connection Status -->
				{#if !$rskWalletStore.isConnected}
					<div
						class="alert alert-outline alert-warning mt-4 !flex !flex-row !items-center !justify-between text-black"
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
							<span>{$t('dashboard.bids.bid_acceptance.wallet_not_connected')}</span>
						</div>
						<button
							class="btn btn-sm btn-primary ml-auto"
							onclick={async () => {
								try {
									await rskWallet.initialize();
								} catch (error) {
									console.error('Failed to connect Rootstock wallet:', error);
								}
							}}
							disabled={$rskWalletStore.isConnecting}
						>
							{#if $rskWalletStore.isConnecting}
								<span class="loading loading-spinner loading-xs"></span>
								{$t('dashboard.bids.bid_acceptance.connecting')}
							{:else}
								{$t('dashboard.bids.bid_acceptance.connect_wallet')}
							{/if}
						</button>
					</div>
				{/if}

				<!-- Rootstock Wallet Connection Error -->
				<!-- {#if $rskWalletStore.error}
					<div class="alert alert-outline alert-error mt-4">
						<div class="flex w-full items-center justify-between">
							<div class="flex items-center">
								<svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6 mr-2" fill="none" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
								</svg>
                                <span>{$t('dashboard.bids.bid_acceptance.wallet_error_prefix')} {$rskWalletStore.error}</span>
							</div>
							<button 
								class="btn btn-sm btn-outline"
								onclick={async () => {
									try {
										await rskWallet.initialize();
									} catch (error) {
										console.error('Failed to retry Rootstock wallet connection:', error);
									}
								}}
								disabled={$rskWalletStore.isConnecting}
							>
								{#if $rskWalletStore.isConnecting}
									<span class="loading loading-spinner loading-xs"></span>
                                    {$t('dashboard.bids.bid_acceptance.retrying')}
								{:else}
                                    {$t('dashboard.bids.bid_acceptance.retry')}
								{/if}
							</button>
						</div>
					</div>
				{/if} -->
			</div>

			<!-- Insufficient Balance Warning -->
			{#if balanceErrors.length > 0}
				<div class="alert alert-outline alert-warning mb-4 text-black">
					<div class="flex items-start gap-3">
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
						<div class="min-w-0 flex-1">
							<div class="mb-1 font-semibold">
								{$t('dashboard.bids.bid_acceptance.insufficient_balance')}
							</div>
							{#if balanceErrors.length === 1}
								<p class="text-sm break-words">{balanceErrors[0]}</p>
							{:else}
								<ul class="list-inside list-disc space-y-1 text-sm">
									{#each balanceErrors as error}
										<li class="break-words">{error}</li>
									{/each}
								</ul>
							{/if}
							<div class="mt-2 text-sm">
								<p>
									{$t('dashboard.bids.bid_acceptance.current_balance')}
									<strong>{$rskWalletStore.formattedBalance} rBTC</strong>
								</p>
								<p class="mt-1 text-xs opacity-80">
									{$t('dashboard.bids.bid_acceptance.insufficient_balance_help')}
								</p>
							</div>
						</div>
					</div>
				</div>
			{/if}

			<!-- Validation Errors -->
			{#if validationErrors.length > 0}
				<div class="alert alert-outline alert-error mb-4">
					<div class="flex items-start gap-3">
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
								<p class="break-words">{validationErrors[0]}</p>
							{:else}
								<ul class="list-inside list-disc space-y-1">
									{#each validationErrors as error}
										<li class="break-words">{error}</li>
									{/each}
								</ul>
							{/if}
						</div>
					</div>
				</div>
			{/if}

			<!-- Submit Buttons -->
			<div
				class="bg-base-100 border-base-300 sticky bottom-0 flex w-full flex-col-reverse justify-end gap-3 py-4 sm:flex-row md:py-2"
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
						!$rskWalletStore.isConnected}
					onclick={handleSubmit}
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
						{$t('dashboard.bids.bid_acceptance.accept_and_pay')}
					{/if}
				</button>
			</div>
		</div>
	</div>
{/if}

{#if currentScreen === 'success' && escrowDetails}
	<div
		class="bg-base-100 mx-auto max-h-[70vh] max-w-3xl overflow-x-hidden overflow-y-auto rounded-lg shadow-lg"
	>
		<!-- Header -->
		<div
			class="bg-base-100 border-base-300 sticky top-0 z-10 flex items-center justify-between border-b p-4 pb-4 sm:p-6"
		>
			<h4 class="text-success line-clamp-2 font-bold">
				{$t('dashboard.bids.bid_acceptance.success_title')}
			</h4>
		</div>

		<!-- Content -->
		<div class="space-y-6 p-6 text-center">
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
						values: { amount: formatRBTCAmount(bidEscrowDetails.totalAmount) }
					})}
				</p>
			</div>

			<!-- Transaction Details -->
			{#if escrowDetails.transactionResult}
				<div class="bg-base-200 space-y-2 rounded-lg p-4">
					<h4 class="font-semibold">{$t('dashboard.bids.bid_acceptance.transaction_details')}</h4>
					<div class="space-y-1 text-sm">
						<div class="flex flex-col gap-1 sm:flex-row sm:justify-between">
							<span>{$t('dashboard.bids.bid_acceptance.transaction_hash')}</span>
							<span class="font-mono text-xs break-all">{escrowDetails.transactionResult.hash}</span
							>
						</div>
						<div class="flex justify-between">
							<span>{$t('dashboard.bids.bid_acceptance.status')}</span>
							<span class="badge badge-info badge-sm capitalize"
								>{escrowDetails.transactionResult.status}</span
							>
						</div>
						{#if escrowDetails.transactionResult.escrowId}
							<div class="flex justify-between">
								<span>{$t('dashboard.bids.bid_acceptance.escrow_id')}</span>
								<span class="font-bold">{escrowDetails.transactionResult.escrowId}</span>
							</div>
						{/if}
					</div>
				</div>
			{/if}

			<!-- Contract Creation Status -->
			<div class="bg-base-200 rounded-lg p-4">
				<h4 class="mb-3 font-semibold">
					{$t('dashboard.bids.bid_acceptance.contract_creation_status')}
				</h4>
				<div class="flex items-center gap-3">
					{#if contractCreationStatus === 'pending'}
						<span class="loading loading-spinner loading-sm text-info"></span>
						<span class="text-info"
							>{$t('dashboard.bids.bid_acceptance.creating_nostr_contract')}</span
						>
					{:else if contractCreationStatus === 'success'}
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
					{:else if contractCreationStatus === 'failed'}
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
						<span class="text-error"
							>{$t('dashboard.bids.bid_acceptance.nostr_contract_failed')}</span
						>
					{/if}
				</div>
			</div>

			<!-- Next Steps -->
			<div class="bg-info/10 rounded-lg p-4">
				<h4 class="text-info mb-2 font-semibold">
					{$t('dashboard.bids.bid_acceptance.what_happens_next_title')}
				</h4>
				<ul class="text-base-content/80 space-y-1 text-left text-sm">
					<li>• {$t('dashboard.bids.bid_acceptance.next_item_notify')}</li>
					<li>• {$t('dashboard.bids.bid_acceptance.next_item_begin')}</li>
					<li>• {$t('dashboard.bids.bid_acceptance.next_item_funds_held')}</li>
					<li>• {$t('dashboard.bids.bid_acceptance.next_item_release')}</li>
					{#if contractCreationStatus === 'success'}
						<li>• {$t('dashboard.bids.bid_acceptance.next_item_contract_details')}</li>
					{/if}
				</ul>
			</div>

			<!-- Action Buttons -->
			<div class="flex flex-col gap-3 pt-4 sm:flex-row">
				<button class="btn btn-outline flex-1" onclick={handleCreateNewTask}>
					{$t('dashboard.bids.bid_acceptance.create_new_task')}
				</button>
				<button class="btn btn-primary flex-1" onclick={() => goto('/dashboard?tab=contracts')}>
					{$t('dashboard.bids.bid_acceptance.go_to_contracts')}
				</button>
			</div>
		</div>
	</div>
{/if}

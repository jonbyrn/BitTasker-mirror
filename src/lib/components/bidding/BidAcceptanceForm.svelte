<script lang="ts">
	import type { TaskBid } from '$lib/types/bid';
	import type { Task } from '$lib/types/task';
	import { rskWalletStore, rskWallet } from '$lib/stores/rskWallet.store';
	import { t } from 'svelte-i18n';
	import {
		calculateBidEscrowDetails,
		validateEscrowDetails,
		validateSufficientBalance,
		acceptBidAndCreateEscrow,
		getFeePercentageDisplay,
		formatRBTCAmount,
		formatTimestamp
	} from '$lib/utils/wallet/escrowBid';
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

	// Auto-initialize RSK wallet if not connected
	$effect(() => {
		if (!$rskWalletStore.isConnected && !$rskWalletStore.isConnecting && !$rskWalletStore.error) {
			rskWallet.initialize().catch(error => {
				console.error('Auto-initialization of RSK wallet failed:', error);
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
	<div class="bg-base-100 mx-auto max-h-[70vh] max-w-3xl overflow-y-auto overflow-x-hidden rounded-lg shadow-lg">
		<!-- Header with close button -->
		<div
			class="border-b bg-base-100 border-base-300 sticky top-0 z-10 flex items-center justify-between p-4 pb-4 sm:p-6"
		>
			<h4 class="line-clamp-2 font-bold">{$t('dashboard.bids.bid_acceptance.title')}</h4>		
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
		<div class="p-4 overflow-x-hidden">
			<!-- Desktop: 2 column layout -->
			<div class="hidden rounded-2xl bg-base-200 lg:flex lg:gap-4">
				<!-- Left Column: Bidder Information -->
				<div class="flex-1">
					<div class="rounded-lg p-3">
						<h5 class="mb-3 line-clamp-1 text-sm font-semibold">{props.taskTitle}</h5>

						<!-- Bidder Profile -->
						<div class="flex items-center gap-3">
							<div class="avatar">
								<div class="bg-base-100 flex h-10 w-10 items-center justify-center rounded-full">
									{#if props.bid.userProfile?.user?.profilePictureUrl}
										<img
											src={props.bid.userProfile.user.profilePictureUrl}
											alt={$t('dashboard.bids.bid_acceptance.bidder_avatar')}
											class="h-10 w-10 rounded-full object-cover"
										/>
									{:else}
										<div
											class="avatar placeholder text-neutral-content bg-primary flex h-10 w-10 items-center justify-center overflow-hidden rounded-full text-center"
										>
											<span class="text-lg font-semibold">
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
										{(props.bid.userProfile?.averageRating || 0).toFixed(1)} ({props.bid.userProfile
											?.tasksCompleted || 0} {$t('dashboard.bids.bid_acceptance.tasks')})
									</span>
								</div>

								<p class="text-base-content/60 mt-1 text-sm">
									{$t('dashboard.bids.bid_acceptance.member_since')}
									{new Date(props.bid.createdAt).toLocaleDateString('en-US', {
										month: '2-digit',
										year: 'numeric'
									})}
								</p>
							</div>
						</div>
					</div>
				</div>

				<!-- Right Column: Pricing -->
				<div class="flex-1">
					<div class="rounded-lg p-3">
						<div class="space-y-2">
							<div class="flex items-center justify-between">
								<span class="text-xs font-medium">Base Amount:</span>
								<span class="text-xs font-bold">{formatRBTCAmount(bidEscrowDetails.baseAmount)} RBTC</span>
							</div>

							<div class="flex items-center justify-between">
								<span class="text-xs font-medium">Client Fee ({getFeePercentageDisplay(bidEscrowDetails.clientFeeTier)}):</span>
								<span class="text-xs font-bold">{formatRBTCAmount(bidEscrowDetails.clientFee)} RBTC</span>
							</div>

							<div class="border-base-200 border-t pt-2">
								<div class="flex items-center justify-between">
									<span class="text-base font-bold">Total Payment:</span>
									<span class="text-base font-bold text-primary">{formatRBTCAmount(bidEscrowDetails.totalAmount)} RBTC</span>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>

			<!-- Mobile: Full width layout -->
			<div class="bg-base-300 rounded-2xl p-2 lg:hidden">
				<!-- Bidder Information -->
				<div class="mb-3 flex items-center gap-3">
					<div class="avatar">
						<div class=" flex h-8 w-8 items-center justify-center rounded-full">
							{#if props.bid.userProfile?.user?.profilePictureUrl}
								<img
									src={props.bid.userProfile.user.profilePictureUrl}
									alt={$t('dashboard.bids.bid_acceptance.bidder_avatar')}
									class="h-8 w-8 rounded-full object-cover"
								/>
							{:else}
								<div
									class="avatar placeholder text-neutral-content bg-primary flex h-8 w-8 items-center justify-center overflow-hidden rounded-full text-center"
								>
									<span class="text-sm font-semibold">
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
								{(props.bid.userProfile?.averageRating || 0).toFixed(1)} ({props.bid.userProfile
									?.tasksCompleted || 0} {$t('dashboard.bids.bid_acceptance.tasks')})
							</span>
						</div>

						<p class="text-base-content/60 mt-1 text-sm">
							{$t('dashboard.bids.bid_acceptance.member_since')}
							{new Date(props.bid.createdAt).toLocaleDateString('en-US', {
								month: '2-digit',
								year: 'numeric'
							})}
						</p>
					</div>
				</div>

				<!-- Price Breakdown -->
				<div class=" space-y-2 rounded-2xl p-3">
					<div class="flex items-center justify-between">
						<span class="text-xs font-medium">Base Amount:</span>
						<span class="text-xs font-bold">{formatRBTCAmount(bidEscrowDetails.baseAmount)} RBTC</span>
					</div>
					<div class="flex items-center justify-between">
						<span class="text-xs font-medium">Client Fee ({getFeePercentageDisplay(bidEscrowDetails.clientFeeTier)}):</span>
						<span class="text-xs font-bold">{formatRBTCAmount(bidEscrowDetails.clientFee)} RBTC</span>
					</div>
					<div class="border-base-200 border-t pt-2">
						<div class="flex items-center justify-between">
							<span class="text-base font-semibold">Total Payment:</span>
							<span class="text-base font-bold text-primary">{formatRBTCAmount(bidEscrowDetails.totalAmount)} RBTC</span>
						</div>
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
				<small class="md:text-sm text-xs">
					<strong>{$t('dashboard.bids.bid_acceptance.note')}</strong> {$t('dashboard.bids.bid_acceptance.contract_note')}
				</small>
			</div>

			<!-- RSK Escrow Contract Details -->
			<div class="mb-4">
				<div class="mb-3">
					<h5 class="text-lg font-semibold mb-2">RSK Escrow Contract</h5>
					<p class="text-sm text-base-content/70 mb-4">
						This will create a secure escrow contract on the RSK network to hold the payment until the task is completed.
					</p>
				</div>

				<!-- Contract Details Card -->
				<div class="bg-base-200 rounded-lg p-4 space-y-3">
					<div class="flex justify-between items-center">
						<span class="text-sm font-medium">Freelancer Address:</span>
						<span class="text-sm font-mono text-primary">
							{bidEscrowDetails.freelancerAddress.slice(0, 6)}...{bidEscrowDetails.freelancerAddress.slice(-4)}
						</span>
					</div>

					<div class="flex justify-between items-center">
						<span class="text-sm font-medium">Base Amount:</span>
						<span class="text-sm font-bold">{formatRBTCAmount(bidEscrowDetails.baseAmount)} RBTC</span>
					</div>

					<div class="flex justify-between items-center">
						<span class="text-sm font-medium">Client Fee ({getFeePercentageDisplay(bidEscrowDetails.clientFeeTier)}):</span>
						<span class="text-sm">{formatRBTCAmount(bidEscrowDetails.clientFee)} RBTC</span>
					</div>

					<div class="border-t border-base-300 pt-2">
						<div class="flex justify-between items-center">
							<span class="text-base font-semibold">Total Payment:</span>
							<span class="text-base font-bold text-primary">{formatRBTCAmount(bidEscrowDetails.totalAmount)} RBTC</span>
						</div>
					</div>

					<div class="mt-4 space-y-2">
						<div class="flex justify-between items-center text-xs">
							<span class="text-base-content/60">Estimated Start:</span>
							<span class="text-base-content/80">{formatTimestamp(bidEscrowDetails.estimatedStartTime)}</span>
						</div>
						<div class="flex justify-between items-center text-xs">
							<span class="text-base-content/60">Estimated Completion:</span>
							<span class="text-base-content/80">{formatTimestamp(bidEscrowDetails.estimatedCompletionTime)}</span>
						</div>
					</div>
				</div>

				<!-- Wallet Connection Status -->
				{#if !$rskWalletStore.isConnected}
					<div class="alert alert-warning text-black mt-4">
						<div class="flex w-full items-center justify-between">
							<div class="flex items-center">
								<svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6 mr-2" fill="none" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16c-.77.833.192 2.5 1.732 2.5z" />
								</svg>
								<span>RSK wallet not connected. Please connect your wallet to proceed.</span>
							</div>
							<button 
								class="btn btn-sm btn-primary"
								onclick={async () => {
									try {
										await rskWallet.initialize();
									} catch (error) {
										console.error('Failed to connect RSK wallet:', error);
									}
								}}
								disabled={$rskWalletStore.isConnecting}
							>
								{#if $rskWalletStore.isConnecting}
									<span class="loading loading-spinner loading-xs"></span>
									Connecting...
								{:else}
									Connect RSK Wallet
								{/if}
							</button>
						</div>
					</div>
				{/if}
				
				<!-- RSK Wallet Connection Error -->
				{#if $rskWalletStore.error}
					<div class="alert alert-error mt-4">
						<div class="flex w-full items-center justify-between">
							<div class="flex items-center">
								<svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6 mr-2" fill="none" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
								</svg>
								<span>RSK Wallet Error: {$rskWalletStore.error}</span>
							</div>
							<button 
								class="btn btn-sm btn-outline"
								onclick={async () => {
									try {
										await rskWallet.initialize();
									} catch (error) {
										console.error('Failed to retry RSK wallet connection:', error);
									}
								}}
								disabled={$rskWalletStore.isConnecting}
							>
								{#if $rskWalletStore.isConnecting}
									<span class="loading loading-spinner loading-xs"></span>
									Retrying...
								{:else}
									Retry
								{/if}
							</button>
						</div>
					</div>
				{/if}
			</div>

			<!-- Insufficient Balance Warning -->
			{#if balanceErrors.length > 0}
				<div class="alert alert-warning text-black mb-4">
					<div class="flex items-start gap-3">
						<svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16c-.77.833.192 2.5 1.732 2.5z" />
						</svg>
						<div class="flex-1 min-w-0">
							<div class="font-semibold mb-1">Insufficient Balance</div>
							{#if balanceErrors.length === 1}
								<p class="break-words text-sm">{balanceErrors[0]}</p>
							{:else}
								<ul class="list-disc list-inside space-y-1 text-sm">
									{#each balanceErrors as error}
										<li class="break-words">{error}</li>
									{/each}
								</ul>
							{/if}
							<div class="mt-2 text-sm">
								<p>Current balance: <strong>{$rskWalletStore.formattedBalance} RBTC</strong></p>
								<p class="text-xs mt-1 opacity-80">
									You need additional RBTC to cover the escrow amount plus transaction fees. 
									Please add more RBTC to your wallet or consider a smaller bid amount.
								</p>
							</div>
						</div>
					</div>
				</div>
			{/if}

			<!-- Validation Errors -->
			{#if validationErrors.length > 0}
				<div class="alert alert-error mb-4">
					<div class="flex items-start gap-3">
						<svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
						</svg>
						<div class="flex-1 min-w-0">
							{#if validationErrors.length === 1}
								<p class="break-words">{validationErrors[0]}</p>
							{:else}
								<ul class="list-disc list-inside space-y-1">
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
				class="bg-base-100 border-base-300 sticky bottom-0 flex w-full flex-col justify-end gap-3 py-4 sm:flex-row md:py-2"
			>
				<button
					type="button"
					class="btn btn-error"
					onclick={props.onCancel}
					disabled={isSubmitting}
				>
					{$t('dashboard.bids.bid_acceptance.cancel')}
				</button>
				<button
					type="button"
					class="btn btn-primary"
					disabled={isSubmitting || validationErrors.length > 0 || balanceErrors.length > 0 || !$rskWalletStore.isConnected}
					onclick={handleSubmit}
				>
					{#if isSubmitting}
						<span class="loading loading-spinner loading-sm"></span>
						<span class="hidden sm:inline">Creating Escrow...</span>
						<span class="sm:hidden">Creating...</span>
					{:else}
						<span class="hidden sm:inline">Accept Bid & Fund Contract</span>
						<span class="sm:hidden">Accept & Fund</span>
					{/if}
				</button>
			</div>
		</div>
	</div>
{/if}


{#if currentScreen === 'success' && escrowDetails}
	<div class="bg-base-100 mx-auto max-h-[70vh] max-w-3xl overflow-y-auto overflow-x-hidden rounded-lg shadow-lg">
		<!-- Header -->
		<div class="border-b bg-base-100 border-base-300 sticky top-0 z-10 flex items-center justify-between p-4 pb-4 sm:p-6">
			<h4 class="line-clamp-2 font-bold text-success">Escrow Created Successfully!</h4>
		</div>

		<!-- Content -->
		<div class="p-6 text-center space-y-6">
			<!-- Success Icon -->
			<div class="flex justify-center">
				<div class="bg-success/10 rounded-full p-4">
					<svg xmlns="http://www.w3.org/2000/svg" class="h-16 w-16 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
					</svg>
				</div>
			</div>

			<!-- Success Message -->
			<div class="space-y-2">
				<h3 class="text-xl font-bold">Bid Accepted & Escrow Funded</h3>
				<p class="text-base-content/70">
					The RSK escrow contract has been successfully created and funded with {formatRBTCAmount(bidEscrowDetails.totalAmount)} RBTC.
				</p>
			</div>

			<!-- Transaction Details -->
			{#if escrowDetails.transactionResult}
				<div class="bg-base-200 rounded-lg p-4 space-y-2">
					<h4 class="font-semibold">Transaction Details</h4>
					<div class="text-sm space-y-1">
						<div class="flex flex-col sm:flex-row sm:justify-between gap-1">
							<span>Transaction Hash:</span>
							<span class="font-mono text-xs break-all">{escrowDetails.transactionResult.hash}</span>
						</div>
						<div class="flex justify-between">
							<span>Status:</span>
							<span class="capitalize badge badge-info badge-sm">{escrowDetails.transactionResult.status}</span>
						</div>
						{#if escrowDetails.transactionResult.escrowId}
							<div class="flex justify-between">
								<span>Escrow ID:</span>
								<span class="font-bold">{escrowDetails.transactionResult.escrowId}</span>
							</div>
						{/if}
					</div>
				</div>
			{/if}

			<!-- Contract Creation Status -->
			<div class="bg-base-200 rounded-lg p-4">
				<h4 class="font-semibold mb-3">Contract Creation Status</h4>
				<div class="flex items-center gap-3">
					{#if contractCreationStatus === 'pending'}
						<span class="loading loading-spinner loading-sm text-info"></span>
						<span class="text-info">Creating Nostr contract...</span>
					{:else if contractCreationStatus === 'success'}
						<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
						</svg>
						<span class="text-success">Nostr contract created successfully!</span>
					{:else if contractCreationStatus === 'failed'}
						<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-error" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
						</svg>
						<span class="text-error">Failed to create Nostr contract</span>
					{/if}
				</div>
			</div>

			<!-- Next Steps -->
			<div class="bg-info/10 rounded-lg p-4">
				<h4 class="font-semibold text-info mb-2">What happens next?</h4>
				<ul class="text-sm text-left space-y-1 text-base-content/80">
					<li>• The freelancer will be notified of the accepted bid</li>
					<li>• Work can begin as per the agreed timeline</li>
					<li>• Funds are securely held in the RSK escrow contract</li>
					<li>• Payment will be released upon task completion</li>
					{#if contractCreationStatus === 'success'}
						<li>• Contract details are available in your dashboard</li>
					{/if}
				</ul>
			</div>

			<!-- Action Buttons -->
			<div class="flex flex-col sm:flex-row gap-3 pt-4">
				<button class="btn btn-outline flex-1" onclick={handleCreateNewTask}>
					Create New Task
				</button>
				<button class="btn btn-primary flex-1" onclick={() => goto('/dashboard?tab=contracts')}>
					Go to Contracts
				</button>
			</div>
		</div>
	</div>
{/if}


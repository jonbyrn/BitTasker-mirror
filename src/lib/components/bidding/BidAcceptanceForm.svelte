<script lang="ts">
	import type { Task } from '$lib/types/task';
	import type { SimplifiedTaskBid } from '$lib/types/bid';
	import { t } from 'svelte-i18n';
	import {
		calculateBidEscrowDetails,
		validateEscrowDetails,
		validateSufficientBalance,
		acceptBidAndCreateEscrow,
		getFeePercentageDisplay,
		formatRBTCAmount
	} from '$lib/utils/wallet/escrowBid';
	import { formatStandardDateTime } from '$lib/utils/helpers/dateFormatter';
	import { goto } from '$app/navigation';
	import { contractCreationStore } from '$lib/utils/wallet/escrowEvents';
	import { walletStore, walletManager } from '$lib/stores/wallet.store';
	import { loadNamespace, type SupportedLanguage } from '$lib/i18n/i18n';
	import { locale } from 'svelte-i18n';
	import { browser } from '$app/environment';
	import { copyToClipboard } from '$lib/utils/helpers/clipboard';
	import { appStore } from '$lib/stores/app.store';
	import { fly } from 'svelte/transition';
	import { linear } from 'svelte/easing';
	import IconContentCopy from '~icons/mdi/content-copy';
	import { sendDirectMessage } from '$lib/utils/nostr-message';
	// Props
	const props = $props<{
		bid: SimplifiedTaskBid;
		task: Task;
		btcPrice: number;
		onCancel: () => void;
	}>();

	// Form state
	let isSubmitting = $state(false);
	let validationErrors = $state<string[]>([]);
	let balanceErrors = $state<string[]>([]);
	let currentScreen = $state<'form' | 'success'>('form');
	let escrowDetails = $state<any>(null);

	// Ensure wallet translations are loaded
	if (browser && $locale) {
		loadNamespace($locale as SupportedLanguage, 'dashboard/wallet');
	}

	// Calculate escrow details from bid
	let bidEscrowDetails = $derived(calculateBidEscrowDetails(props.bid, props.task, props.btcPrice));

	$effect(() => {
		if (bidEscrowDetails) {
			validationErrors = validateEscrowDetails(bidEscrowDetails);
		}
	});

	// Separate effect for balance validation
	$effect(() => {
		// Only check balance if wallet is connected and basic validation passes
		if (bidEscrowDetails && $walletStore.rsk.connected && validationErrors.length === 0) {
			balanceErrors = validateSufficientBalance(bidEscrowDetails);
		} else {
			balanceErrors = [];
		}
	});

	// Auto-initialize Rootstock wallet if not connected
	$effect(() => {
		if (!$walletStore.rsk.connected && !$walletStore.rsk.connecting && !$walletStore.rsk.error) {
			walletManager.initializeRSKWallet().catch((error) => {
				console.error('Auto-initialization of Rootstock wallet failed:', error);
			});
		}
	});

	// Handle form submission
	async function handleSubmit() {
		if (
			!props.bid?.id ||
			!props.task ||
			validationErrors.length !== 0 ||
			balanceErrors.length !== 0
		) {
			return;
		}

		isSubmitting = true;

		try {
			// Accept bid and create escrow
			const result = await acceptBidAndCreateEscrow(
				props.bid,
				props.task,
				props.btcPrice,
				'RSK'
			);

			if (result.success) {
				escrowDetails = {
					transactionResult: result.transactionResult,
					escrowDetails: bidEscrowDetails
				};

				currentScreen = 'success';

				// Send automatic message to bidder
				try {
					const bidderPubkey = props.bid.userProfile?.user?.id;
					if (bidderPubkey) {
						const acceptanceMessage = $t('dashboard.bids.bid_acceptance.acceptance_message');
						await sendDirectMessage(acceptanceMessage, bidderPubkey);
						console.log('✅ Acceptance message sent to bidder');
					}
				} catch (error) {
					// Don't fail the bid acceptance if message sending fails
					console.warn('⚠️ Failed to send acceptance message:', error);
				}
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

	function formatRBTCToSats(rbtcFormattedBalance: string): string {
		// Convert rBTC balance to sats (1 rBTC = 100,000,000 sats)
		const rbtcAmount = parseFloat(rbtcFormattedBalance) || 0;
		const sats = Math.round(rbtcAmount * 100000000);
		return new Intl.NumberFormat('en-US').format(sats);
	}

	function getEstimatedGasFee(): number {
		return 0.5; // Fixed $0.50 gas fee
	}

	function getTotalWithGasFee(): number {
		return bidEscrowDetails ? parseFloat(bidEscrowDetails.totalAmount) * props.btcPrice : 0;
	}
</script>

{#if !props.bid || !props.task}
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
		<!-- Unified Responsive Layout -->
		<div class="bg-base-300 lg:bg-base-200 rounded-2xl">
			<!-- Task Title Row -->
			<div class="w-full px-6 pt-3">
				<h5 class="line-clamp-2 text-lg font-semibold">{props.task.title}</h5>
			</div>

			<!-- Divider (Desktop only) -->
			<div class="divider text-base-content/60 mx-6 my-2 text-sm">
				{$t('dashboard.bids.bid_acceptance.contract_information')}
			</div>

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
									{#if props.bid?.userProfile?.user?.profilePictureUrl}
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
												{(props.bid?.userProfile?.user?.name || 'A').charAt(0).toUpperCase()}
											</span>
										</div>
									{/if}
								</div>
							</div>

							<div class="flex flex-col">
								<span class="text-sm font-medium">
									{props.bid?.userProfile?.user?.name ||
										props.bid?.userProfile?.professionalTitle ||
										$t('dashboard.bids.bid_acceptance.anonymous')}
								</span>

								<div class="mt-1 flex items-center">
									{#each Array(5) as _, i}
										<svg
											xmlns="http://www.w3.org/2000/svg"
											class="h-3 w-3 {i < (props.bid?.userProfile?.averageRating || 0)
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
										{(props.bid?.userProfile?.averageRating || 0).toFixed(1)} ({props.bid
											?.userProfile?.tasksCompleted || 0}
										{$t('dashboard.bids.bid_acceptance.tasks')})
									</span>
								</div>

								<p class="text-base-content/60 mt-1 text-sm">
									{$t('dashboard.bids.bid_acceptance.member_since')}
									{new Date(props.bid?.createdAt || '').toLocaleDateString('en-US', {
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
										class="tooltip tooltip-top"
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
								<span class="text-xs font-bold">
									{bidEscrowDetails
										? formatUSDAmount(parseFloat(bidEscrowDetails.baseAmount))
										: '$0.00'}
								</span>
							</div>

							<div class="flex items-center justify-between">
								<div class="flex items-center gap-1">
									<span class="text-xs font-medium"
										>{$t('dashboard.bids.bid_acceptance.client_fee', {
											values: {
												fee: bidEscrowDetails
													? getFeePercentageDisplay(bidEscrowDetails.clientFeeTier)
													: '0%'
											}
										})}</span
									>
									<div
										class="tooltip tooltip-top"
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
									>{bidEscrowDetails
										? formatUSDAmount(parseFloat(bidEscrowDetails.clientFee))
										: '$0.00'}</span
								>
							</div>

							<div class="flex items-center justify-between">
								<div class="flex items-center gap-1">
									<span class="text-xs font-medium italic"
										>{$t('dashboard.bids.bid_acceptance.estimated_gas_fee')}</span
									>
									<div
										class="tooltip tooltip-top"
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
								<span class="text-xs font-bold italic">${getEstimatedGasFee().toFixed(2)}</span>
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
					<span class="text-base-content/80">
						<!-- Convert seconds to milliseconds -->
						{bidEscrowDetails
							? formatStandardDateTime(new Date(bidEscrowDetails.estimatedStartTime * 1000))
							: 'N/A'}
					</span>
				</div>
				<div class="flex items-center justify-between text-xs">
					<span class="text-base-content/60"
						>{$t('dashboard.bids.bid_acceptance.estimated_completion')}</span
					>
					<span class="text-base-content/80">
						<!-- Convert seconds to milliseconds -->
						{bidEscrowDetails
							? formatStandardDateTime(new Date(bidEscrowDetails.estimatedCompletionTime * 1000))
							: 'N/A'}
					</span>
				</div>
				<div class="flex items-center justify-between text-xs">
					<span class="text-base-content/60"
						>{$t('dashboard.bids.bid_acceptance.estimated_duration')}</span
					>
					<span class="text-base-content/80"
						>{bidEscrowDetails
							? formatDuration(
									bidEscrowDetails.estimatedStartTime * 1000,
									bidEscrowDetails.estimatedCompletionTime * 1000
								)
							: 'N/A'}</span
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
			{#if !$walletStore.rsk.connected}
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
						<span>{$t('dashboard.bids.bid_acceptance.wallet_not_connected')}</span>
					</div>
					<button
						class="btn btn-sm btn-primary ml-auto"
						onclick={async () => {
							try {
								await walletManager.initializeRSKWallet();
							} catch (error) {
								console.error('Failed to connect Rootstock wallet:', error);
							}
						}}
						disabled={$walletStore.rsk.connecting}
					>
						{#if $walletStore.rsk.connecting}
							<span class="loading loading-spinner loading-xs"></span>
							{$t('dashboard.bids.bid_acceptance.connecting')}
						{:else}
							{$t('dashboard.bids.bid_acceptance.connect_wallet')}
						{/if}
					</button>
				</div>
			{/if}

			<!-- Rootstock Wallet Connection Error -->
			<!-- {#if $walletStore.rsk.error}
					<div class="alert alert-outline alert-error mt-4">
						<div class="flex w-full items-center justify-between">
							<div class="flex items-center">
								<svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6 mr-2" fill="none" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
								</svg>
                                <span>{$t('dashboard.bids.bid_acceptance.wallet_error_prefix')} {$walletStore.rsk.error}</span>
							</div>
							<button 
								class="btn btn-sm btn-outline"
								onclick={async () => {
									try {
										await walletManager.initializeRSKWallet();
									} catch (error) {
										console.error('Failed to retry Rootstock wallet connection:', error);
									}
								}}
								disabled={$walletStore.rsk.connecting}
							>
								{#if $walletStore.rsk.connecting}
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
							<p class="text-sm word-break-words">{balanceErrors[0]}</p>
						{:else}
							<ul class="list-inside list-disc space-y-1 text-sm">
								{#each balanceErrors as error}
									<li class="word-break-words">{error}</li>
								{/each}
							</ul>
						{/if}
						<div class="mt-2 text-sm">
							<p>
								{$t('dashboard.bids.bid_acceptance.current_balance')}
								<strong>{$walletStore.rsk.formattedBalance} rBTC</strong>
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
			<div class="alert alert-outline alert-warning mb-6">
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

		<!-- rBTC Balance Display -->
		<div class="pb-4">
			<div class="card bg-base-100 border-2 border-primary">
				<div class="card-body p-4">
					<div class="flex items-center justify-between">
						<div class="flex items-center space-x-3">
							<!-- Rootstock Bitcoin Icon -->
							<div class="avatar">
								<div class="h-10 w-10 rounded-full">
									<img
										src="/images/chains/Bitcoin-Rootstock-logo.webp"
										alt="rBTC"
										class="h-full w-full object-contain"
									/>
								</div>
							</div>

							<!-- Balance Info -->
							<div class="flex-1">
								<div class="flex items-center space-x-2">
									<h4 class="font-semibold">{$t('common.components.wallet.asset_selector.available_rbtc_balance')}</h4>
								</div>
								<p class="text-base-content/70 text-sm">
									{$walletStore.rsk.formattedBalance} rBTC
								</p>
								<p class="text-primary font-bold text-lg">
									{formatRBTCToSats($walletStore.rsk.formattedBalance)} {$t('common.components.wallet.asset_selector.sats')}
								</p>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>

		<!-- Submit Buttons -->
		<div
			class="bg-base-100 border-base-300 sticky bottom-0 mb-8 flex w-full flex-col-reverse justify-end gap-3 py-4 pb-8 sm:flex-row md:py-2"
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
				onclick={handleSubmit}
			>
				{#if isSubmitting}
					<span class="loading loading-spinner loading-sm"></span>
					<span class="hidden sm:inline">{$t('dashboard.bids.bid_acceptance.creating_escrow')}</span
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
							? formatRBTCAmount(bidEscrowDetails.totalAmount)
							: '0'
					}
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
						<span class="font-mono text-xs break-all">{escrowDetails.transactionResult.hash}</span>
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
		<div class="bg-info/10 rounded-lg p-4">
			<h4 class="text-info mb-2 font-semibold">
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

<style>
	:global(.tooltip-top::before) {
		max-width: 200px;
		white-space: normal;
		word-wrap: break-word;
	}
</style>

<script lang="ts">
	import { t } from 'svelte-i18n';
	import {
		createContract,
		deriveContractCreationParams,
		estimateGasCostForCreatePaymentContract
	} from '$lib/utils/contract/v2/creation';
	import { goto } from '$app/navigation';
	import BidAcceptanceSuccessScreen from './BidAcceptanceSuccessScreen.svelte';
	import { formatStandardDateTime, formatDate } from '$lib/utils/helpers/dateFormatter';
	import { walletStore, walletManager } from '$lib/stores/wallet.store';
	import { loadNamespace, type SupportedLanguage } from '$lib/i18n/i18n';
	import { locale } from 'svelte-i18n';
	import { browser } from '$app/environment';
	import { copyToClipboard } from '$lib/utils/helpers/clipboard';
	import { appStore } from '$lib/stores/app.store';
	import { fly } from 'svelte/transition';
	import { linear } from 'svelte/easing';
	import { onMount } from 'svelte';
	import IconContentCopy from '~icons/mdi/content-copy';
	import IconMessage from '~icons/mdi/message';
	import IconCalendarClock from '~icons/mdi/calendar-clock';
	import IconTruckDeliveryOutline from '~icons/mdi/truck-delivery-outline';
	import IconRefresh from '~icons/mdi/refresh';
	import { formatDurationBetweenDates } from '$lib/utils/helpers/dateFormatter';
	import { allAssets, totalBalances, formatSats } from '$lib/stores/wallet.store';
	import MessageModal from '$lib/components/messages/MessageModal.svelte';
	import SecurePaymentContractModal from '$lib/components/bidding/SecurePaymentContractModal.svelte';
	import UserInfoDisplay from '$lib/components/user/UserInfoDisplay.svelte';
	import { triggerHaptic, ImpactStyle } from '$lib/utils/helpers/haptics';
	import { formatConvertedAmount } from '$lib/utils/helpers/currencyFormatter';
	import type { NDKBid } from '$lib/nostr/events/bid';
	import type { NDKTask } from '$lib/nostr/events/task';
	import { btcPrice } from '$lib/runes/btcPrice.svelte';
	import { createDebug } from '$lib/utils/debug';
	import { MINIMUM_START_BUFFER_SECONDS } from '$lib/utils/contract/v2/types';
	import {
		fundEscrowErrorKey,
		isFundSendInFlight,
		logFundEscrow,
		presentFundEscrowFailure,
		subscribeFundSend
	} from '$lib/utils/contract/v2/fundEscrowGuard';

	const d = createDebug('bidding:BidAcceptanceForm');

	let {
		bid,
		task,
		onCancel,
		onAddFunds
	}: {
		bid: NDKBid;
		task: NDKTask;
		onCancel: () => void;
		onAddFunds?: (amountUsd: number) => void;
	} = $props();

	const bidContent = $derived(bid.bidContent);
	const taskContent = $derived(task.taskContent);

	let estimatedGasCost = $state<string>('');

	let isSubmitting = $state(false);
	let fundErrorKey = $state<string | null>(null);
	let fundSendBlocked = $state(false);

	const fundingTaskId = $derived(task.tagValue('d') ?? task.id ?? '');

	$effect(() => {
		const taskId = fundingTaskId;
		fundSendBlocked = isFundSendInFlight(taskId);
		return subscribeFundSend(taskId, (sending) => {
			fundSendBlocked = sending;
		});
	});

	async function handleRefresh() {
		isLoading = true;
		try {
			await walletManager.loadAssets();
			estimatedGasCost = await estimateGasCostForCreatePaymentContract(bidContent, btcPrice.price);
		} finally {
			isLoading = false;
		}
	}
	let currentScreen = $state<'form' | 'success'>('form');
	/** After broadcast: single phase until chain + Nostr follow-up finish */
	let followUpStatus = $state<'idle' | 'mining' | 'done' | 'failed'>('idle');
	let fundingTxHash = $state('');
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

	// v2 display (contract params are derived separately where needed)
	let contractDetails = $derived.by(() => {
		try {
			const { display } = deriveContractCreationParams(bidContent, btcPrice.price);
			return display;
		} catch {
			return null;
		}
	});

	// Adjusted times — v2 derivation already adjusts past start; expose for UI
	let adjustedTimes = $derived.by(() => {
		if (!contractDetails) return null;
		return {
			startTime: contractDetails.startTime,
			completionTime: contractDetails.completionTime,
			wasAdjusted: contractDetails.wasTimeAdjusted
		};
	});

	let fundingClock = $state(Date.now());
	let proposedStartLocal = $state('');

	function toDatetimeLocalValue(date: Date): string {
		const pad = (value: number) => String(value).padStart(2, '0');
		return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
	}

	const earliestStartDate = $derived(new Date(fundingClock + MINIMUM_START_BUFFER_SECONDS * 1000));
	const earliestStartLocal = $derived(toDatetimeLocalValue(earliestStartDate));
	const chosenStartSeconds = $derived.by(() => {
		if (!proposedStartLocal) return null;
		const parsed = new Date(proposedStartLocal).getTime();
		if (Number.isNaN(parsed)) return null;
		return Math.floor(parsed / 1000);
	});
	const needsExplicitStart = $derived.by(() => {
		const now = Math.floor(fundingClock / 1000);
		const start = adjustedTimes?.startTime ?? 0;
		return (adjustedTimes?.wasAdjusted ?? false) || start < now + MINIMUM_START_BUFFER_SECONDS;
	});
	const fundingStartBlocked = $derived.by(() => {
		if (!needsExplicitStart) return false;
		const now = Math.floor(fundingClock / 1000);
		const completion = adjustedTimes?.completionTime ?? 0;
		if (chosenStartSeconds == null) return true;
		if (chosenStartSeconds < now + MINIMUM_START_BUFFER_SECONDS) return true;
		if (completion > 0 && chosenStartSeconds >= completion) return true;
		return false;
	});

	// Contract amount = base (escrow for the task; taskee fee deducted from it inside contract)
	const baseAmountUsdFormatted = $derived(
		contractDetails
			? formatConvertedAmount(contractDetails.baseAmount, 'RBTC', {
					toCurrency: 'USD',
					btcPrice: btcPrice.price
				})
			: '$0.00'
	);
	// BitTasker fee = tasker fee (platform fee)
	const taskerFeeUsdFormatted = $derived(
		contractDetails
			? formatConvertedAmount(contractDetails.taskerFee, 'RBTC', {
					toCurrency: 'USD',
					btcPrice: btcPrice.price
				})
			: '$0.00'
	);

	const totalEstimatedGasCostRBTC: number = $derived.by(() => {
		// this should add contractDetails.gasReimbursementAmount and calulated estimatedGasCost
		const gasReimbursementRbtc = parseFloat(contractDetails?.gasReimbursementAmount ?? '0') || 0;
		const creationGasRbtc = parseFloat(estimatedGasCost ?? '0') || 0;
		return gasReimbursementRbtc + creationGasRbtc;
	});

	const displayEstimatedGasCostUSD: string = $derived.by(() => {
		return formatConvertedAmount(totalEstimatedGasCostRBTC, 'RBTC', {
			toCurrency: 'USD',
			btcPrice: btcPrice.price
		});
	});

	const totalPaymentRBTC = $derived.by(() => {
		// this should add contractDetails.totalAmount and estimatedGasCost
		const contractTotal = parseFloat(contractDetails?.totalAmount ?? '0') || 0;
		const creationGasRbtc = parseFloat(estimatedGasCost ?? '0') || 0;
		return contractTotal + creationGasRbtc;
	});

	const totalPaymentUsdFormatted = $derived(
		formatConvertedAmount(totalPaymentRBTC, 'RBTC', { toCurrency: 'USD', btcPrice: btcPrice.price })
	);
	const totalPaymentSatsFormatted = $derived(
		formatConvertedAmount(totalPaymentRBTC, 'RBTC', {
			toCurrency: 'SATS',
			btcPrice: btcPrice.price
		})
	);
	const btcPriceFormatted = $derived(
		formatConvertedAmount(btcPrice.price, 'USD', { fractionDigits: 0, suffix: '' })
	);
	const feePercentageLabel = $derived('2.5%');

	/** Same RBTC total as the “Total payment” line — compared to L2 RBTC balance in the accordion. */
	const isBalanceInsufficient = $derived.by(() => {
		if (isLoading || !$walletStore.rsk.connected || !estimatedGasCost) return false;
		const available = bitcoinAsset?.balance ?? 0;
		return totalPaymentRBTC > available;
	});

	// Open message modal for the taskee
	function openMessageModal() {
		if (bidContent.bidderId) {
			showMessageModal = true;
		}
	}

	async function initializeWallet() {
		try {
			isLoading = true;
			if (!$walletStore.rsk.connected) {
				await walletManager.initialize({ prompt: 'funding' });
			}
			// Load fresh balances
			await walletManager.loadAssets();
		} finally {
			isLoading = false;
		}
	}

	onMount(() => {
		const clockId = setInterval(() => {
			fundingClock = Date.now();
		}, 1000);
		void (async () => {
			try {
				deriveContractCreationParams(bidContent, btcPrice.price);
			} catch (e) {
				const msg = e instanceof Error ? e.message : String(e);
				if (msg.includes('Completion time must be after start time')) {
					appStore.showErrorToast($t('dashboard.bids.bid_acceptance.task_deadline_expired'), 3000);
				} else {
					appStore.showErrorToast(msg);
				}
				onCancel();
				return;
			}
			await initializeWallet();
			estimatedGasCost = await estimateGasCostForCreatePaymentContract(bidContent, btcPrice.price);
		})();
		return () => clearInterval(clockId);
	});

	function showFundError(code: string | undefined) {
		const key = fundEscrowErrorKey(code);
		fundErrorKey = key;
		presentFundEscrowFailure({
			showErrorToast: (message, timeout, options) =>
				appStore.showErrorToast(message, timeout, options),
			message: $t(key),
			retry: () => {
				void handleSubmit();
			}
		});
	}

	async function handleSubmit() {
		if (isSubmitting || fundSendBlocked) return;
		if (isBalanceInsufficient) {
			appStore.showErrorToast($t('dashboard.bids.bid_acceptance.insufficient_balance'), 3000);
			return;
		}
		if (fundingStartBlocked) {
			appStore.showErrorToast($t('dashboard.bids.bid_acceptance.start_too_soon_title'), 4000);
			return;
		}
		isSubmitting = true;
		try {
			const result = await createContract(
				bid,
				task,
				btcPrice.price,
				additionalNotes.trim(),
				chosenStartSeconds ?? undefined
			);

			if (!result.success) {
				d.warn('handleSubmit: funding failed', { errorCode: result.errorCode });
				showFundError(result.errorCode);
				return;
			}

			fundErrorKey = null;
			fundingTxHash = result.transactionHash;
			currentScreen = 'success';
			followUpStatus = 'mining';
			appStore.showInfoToast($t('dashboard.bids.bid_acceptance.funding_submitted_toast'), 6000);

			void (async () => {
				try {
					await result.afterBroadcast;
					const receipt = await result.tx.wait();
					if (!receipt) throw new Error('No receipt');
					logFundEscrow('receipt', {
						hash: result.transactionHash,
						status: receipt.status,
						blockNumber: receipt.blockNumber
					});
					await result.afterConfirmed(receipt);
					followUpStatus = 'done';
					appStore.showSuccessToast(
						$t('dashboard.bids.bid_acceptance.funding_confirmed_toast'),
						6000
					);
				} catch (err) {
					d.warn('handleSubmit: follow-up failed', err);
					logFundEscrow('receipt', {
						hash: result.transactionHash,
						status: 'failed',
						message: err instanceof Error ? err.message : 'failed'
					});
					followUpStatus = 'failed';
					appStore.showErrorToast($t('dashboard.bids.bid_acceptance.funding_confirm_failed'), 0);
					try {
						await result.afterFailed(result.transactionHash);
					} catch (cleanupErr) {
						d.warn('handleSubmit: afterFailed cleanup error', cleanupErr);
					}
				}
			})();
		} catch (e) {
			d.error('handleSubmit', e);
			logFundEscrow('failed', {
				taskId: fundingTaskId,
				message: e instanceof Error ? e.message : 'failed'
			});
			showFundError('failed');
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

	/** Called when user clicks Fund in the confirmation modal. Re-checks balance, then closes and submits. */
	async function handleFundClick() {
		d.log('handleFundClick: user confirmed Fund, closing modal and submitting');
		triggerHaptic(ImpactStyle.Light);
		if (isBalanceInsufficient) {
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
	<!-- Layout like dashboard modals: content flows naturally inside Drawer's scroll area -->
	<div
		class="flex min-h-0 flex-col"
		in:fly={{
			duration: 200,
			easing: linear,
			y: 0,
			x: -20
		}}
	>
		<!-- Content (no inner scroll — Drawer's .drawer-scroll-area handles scrolling) -->
		<div class="flex-1">
			<!-- Container with gap for even spacing -->
			<div class="flex flex-col gap-4">
				<!-- Unified Responsive Layout -->
				<div class="bg-base-300 lg:bg-base-200 rounded-2xl">
					<!-- Task Title Row -->
					<div class="flex items-start justify-between gap-2 px-6 pt-3">
						<div class="min-w-0 flex-1">
							<h5 class="wrap-break-words line-clamp-2 text-lg font-semibold">
								{taskContent.title}
							</h5>
						</div>
						<button
							type="button"
							class="btn btn-ghost btn-md btn-circle -mt-2 -mr-2 shrink-0"
							onclick={(e) => {
								e.stopPropagation();
								void handleRefresh();
							}}
							disabled={isLoading}
							aria-label={$t('common.buttons.refresh')}
						>
							<IconRefresh class="h-6 w-6 {isLoading ? 'animate-spin' : ''}" />
						</button>
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
								<UserInfoDisplay
									avatar={bidContent.bidderAvatar}
									username={bidContent.bidderName ?? ''}
									rating={bidContent.bidderRating ?? null}
									size="sm"
									pubkey={bidContent.bidderId ?? null}
									profileLink={bidContent.bidderId ?? null}
								/>

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
											{baseAmountUsdFormatted}
										</span>
									</div>

									<div class="flex min-w-0 items-center justify-between gap-2">
										<div class="flex min-w-0 items-center gap-1">
											<span class="truncate text-xs font-medium"
												>{$t('dashboard.bids.bid_acceptance.client_fee', {
													values: {
														fee: feePercentageLabel
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
										<span class="shrink-0 text-xs font-bold">
											{taskerFeeUsdFormatted}
										</span>
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
										{#if estimatedGasCost}
											<span class="shrink-0 text-xs font-bold italic">
												{displayEstimatedGasCostUSD}
											</span>
										{:else}
											<span class="loading loading-spinner loading-xs"></span>
										{/if}
									</div>

									<div class="border-base-200 border-t pt-2">
										<div class="flex min-w-0 items-center justify-between gap-2">
											<span class="truncate text-base font-bold"
												>{$t('dashboard.bids.bid_acceptance.total_payment')}</span
											>
											<span class="text-primary shrink-0 text-base font-bold">
												{totalPaymentUsdFormatted}</span
											>
										</div>
									</div>

									<!-- BTC Price and Sats on same row -->
									<div class="">
										<div class="flex min-w-0 items-center justify-between gap-2">
											<span class="text-base-content/60 truncate text-xs font-medium italic">
												{$t('dashboard.bids.bid_acceptance.btc_price')}
												{btcPriceFormatted}
											</span>
											<span class="text-base-content/60 shrink-0 text-xs font-medium italic">
												{totalPaymentSatsFormatted}
											</span>
										</div>
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>

				<!-- Past start time warning (v2 adjusts times automatically) -->
				{#if contractDetails?.wasTimeAdjusted}
					<div class="alert alert-outline alert-warning">
						<div class="flex w-full items-center gap-3">
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
							<div class="flex min-w-0 flex-1 items-center gap-2">
								<p class="word-break-words min-w-0 flex-1">
									{$t('dashboard.bids.bid_acceptance.warning.past_start_time', {
										values: { timeText: 'in the past' }
									})}
								</p>
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

				{#if needsExplicitStart}
					<div class="alert alert-outline alert-warning">
						<div class="flex w-full flex-col gap-2">
							<p class="font-semibold">
								{$t('dashboard.bids.bid_acceptance.start_too_soon_title')}
							</p>
							<p>
								{$t('dashboard.bids.bid_acceptance.start_too_soon_help', {
									values: { time: formatStandardDateTime(earliestStartDate) }
								})}
							</p>
							<label class="form-control">
								<span class="label-text">{$t('dashboard.bids.bid_acceptance.new_start_label')}</span
								>
								<input
									type="datetime-local"
									class="input input-bordered"
									min={earliestStartLocal}
									bind:value={proposedStartLocal}
								/>
							</label>
							{#if bidContent.bidderId}
								<button
									type="button"
									class="btn btn-primary btn-sm w-fit"
									onclick={openMessageModal}
								>
									{$t('dashboard.bids.bid_acceptance.message_taskee')}
								</button>
							{/if}
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
									alt={$t('wallet.bitcoin')}
									class="h-5 w-5 shrink-0 sm:h-6 sm:w-6"
								/>
								<div class="flex items-center gap-1.5 overflow-hidden">
									<span class="truncate">{$t('wallet.bitcoin')}</span>
								</div>
							</div>
							<div class="ml-2 shrink-0 text-right">
								{#if isLoading || $walletStore.rsk.connecting}
									<div class="flex h-9 w-9 flex-col items-end justify-center gap-0.5">
										<span class="loading loading-spinner loading-md"></span>
									</div>
								{:else if !$walletStore.rsk.connected || $walletStore.rsk.error}
									<div class="text-error text-sm font-semibold sm:text-base">
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
					class="collapse-arrow border-primary bg-base-100 collapse rounded-lg border-2 py-2"
					class:collapse-open={additionalNotesExpanded}
				>
					<button
						type="button"
						class="collapse-title text-base-content/80 min-h-0 px-3 py-1 text-left text-sm font-medium"
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
					class="alert alert-info alert-outline hover:bg-base-200 w-full cursor-pointer text-left transition-colors"
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
				{#if isBalanceInsufficient}
					<div class="alert alert-error alert-outline mt-2 shadow-sm">
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
						<div class="flex-1 text-left">
							<span class="text-sm">
								{$t('dashboard.services.detail.book_now_drawer.insufficient_funds_message', {
									values: {
										sats: (() => {
											const requiredSats = Math.floor(totalPaymentRBTC * 100_000_000);
											const availableSats = Math.floor((bitcoinAsset?.balance ?? 0) * 100_000_000);
											const shortfall = Math.max(0, requiredSats - availableSats);
											return formatSats(shortfall);
										})(),
										usd: (() => {
											const requiredUsd = totalPaymentRBTC * btcPrice.price;
											const availableUsd = (bitcoinAsset?.balance ?? 0) * btcPrice.price;
											const shortfall = Math.max(0, requiredUsd - availableUsd);
											return `$${shortfall.toFixed(2)}`;
										})()
									}
								})}
							</span>
						</div>
						<div class="flex-none">
							<button
								type="button"
								class="btn btn-primary btn-sm"
								onclick={() => {
									if (onAddFunds) {
										const requiredUsd = totalPaymentRBTC * btcPrice.price;
										const availableUsd = (bitcoinAsset?.balance ?? 0) * btcPrice.price;
										const shortfallUsd = Math.max(0, requiredUsd - availableUsd);
										onAddFunds(shortfallUsd);
									} else {
										goto('/wallet?tab=receive');
									}
								}}
							>
								{$t('dashboard.services.detail.book_now_drawer.add_funds')}
							</button>
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
			</div>
		</div>
		{#if fundErrorKey}
			<div class="alert alert-error mx-0 mb-3 shadow-sm" role="alert">
				<span>{$t(fundErrorKey)}</span>
				{#if !isSubmitting && !fundSendBlocked}
					<button type="button" class="btn btn-sm" onclick={() => handleSubmit()}>
						{$t('dashboard.bids.bid_acceptance.retry')}
					</button>
				{/if}
			</div>
		{/if}
		<!-- Action buttons (fixed at bottom, like dashboard edit/delete modals) -->
		<div
			class="border-base-300 bg-base-100 flex shrink-0 flex-row justify-end gap-3 border-t py-4 md:py-3"
		>
			<button
				type="button"
				class="btn btn-error flex-1 sm:min-w-[100px] sm:flex-none"
				onclick={onCancel}
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
				class="btn btn-primary flex-1 sm:min-w-[120px] sm:flex-none"
				disabled={isSubmitting ||
					fundSendBlocked ||
					isBalanceInsufficient ||
					!estimatedGasCost ||
					!$walletStore.rsk.connected ||
					fundingStartBlocked}
				onclick={() => (showFundConfirmationModal = true)}
			>
				{#if isSubmitting || fundSendBlocked}
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
					{$t('dashboard.bids.bid_acceptance.accept')}
				{/if}
			</button>
		</div>
	</div>
{:else if currentScreen === 'success'}
	<BidAcceptanceSuccessScreen
		totalAmountRbtc={contractDetails?.totalAmount ?? '0'}
		followUpStatus={followUpStatus === 'idle' ? 'mining' : followUpStatus}
		transactionHash={fundingTxHash}
	/>
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

<!-- Fund Contract confirmation modal (structure like dashboard edit/delete modals) -->
{#if showFundConfirmationModal}
	<div
		class="modal modal-open modal-middle z-120"
		role="dialog"
		aria-modal="true"
		aria-labelledby="fund-modal-title"
	>
		<div class="modal-box flex max-h-[90vh] max-w-md flex-col p-4">
			<h3 id="fund-modal-title" class="shrink-0 text-lg font-bold">
				{$t('dashboard.bids.bid_acceptance.fund_contract_title')}
			</h3>
			<div class="min-h-0 flex-1 space-y-6 overflow-y-auto py-3">
				<!-- Taskee + Total payment in same row: UserInfoDisplay left, Total (label over price) right -->
				<div class="flex min-w-0 items-center justify-between gap-3">
					<div class="min-w-0 flex-1">
						<UserInfoDisplay
							avatar={bidContent.bidderAvatar}
							username={bidContent.bidderName}
							rating={bidContent.bidderRating ?? null}
							size="sm"
							pubkey={bidContent.bidderId ?? null}
						/>
					</div>
					{#if true}
						<div class="shrink-0 text-right">
							<div class="text-xs font-medium opacity-70">
								{$t('dashboard.bids.bid_acceptance.total_payment')}
							</div>
							<div class="text-lg font-bold">
								{totalPaymentUsdFormatted}
							</div>
							<div class="text-base-content/60 text-sm">
								{totalPaymentSatsFormatted}
							</div>
						</div>
					{/if}
				</div>

				<!-- Start + Duration (one row: date left, duration right; short month) -->
				{#if adjustedTimes}
					<div class="flex flex-col gap-2">
						<div class="flex min-w-0 items-center justify-between gap-3 text-sm">
							<span class="flex min-w-0 items-center gap-1">
								<IconCalendarClock class="text-primary h-6 w-6 shrink-0" />
								<span class="truncate">
									{formatDate(new Date(adjustedTimes.startTime * 1000))}
								</span>
							</span>
							<span class="flex shrink-0 items-center gap-1">
								<span class="truncate">
									{formatDate(new Date(adjustedTimes.completionTime * 1000))}
								</span>
								<IconTruckDeliveryOutline class="text-primary h-6 w-6 shrink-0" />
							</span>
						</div>

						<div class="flex items-center px-2">
							<div
								class="bg-primary/20 border-primary/30 relative h-0.5 flex-1 border-t-2 border-dashed"
							>
								<div class="absolute inset-0 -top-3 flex items-center justify-center">
									<span
										class="bg-base-300 text-primary px-2 text-[10px] font-bold tracking-tight uppercase"
									>
										{formatDurationBetweenDates(
											new Date(adjustedTimes.startTime * 1000),
											new Date(adjustedTimes.completionTime * 1000),
											$t
										)}
									</span>
								</div>
								<div
									class="border-l-primary/40 absolute -top-1 -right-1 border-t-[4px] border-b-[4px] border-l-[6px] border-transparent"
								></div>
							</div>
						</div>
					</div>
				{/if}

				{#if isBalanceInsufficient}
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
			<!-- Action buttons (like dashboard modals) -->
			<div class="modal-action border-base-300 shrink-0 gap-3 border-t pt-4">
				<button
					type="button"
					class="btn btn-ghost flex-1"
					onclick={() => (showFundConfirmationModal = false)}
				>
					{$t('common.cancel')}
				</button>
				<button
					type="button"
					class="btn btn-primary flex-1"
					onclick={handleFundClick}
					disabled={isSubmitting || fundSendBlocked || fundingStartBlocked}
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

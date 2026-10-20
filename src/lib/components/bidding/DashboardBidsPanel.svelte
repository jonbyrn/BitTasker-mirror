<script lang="ts">
	import type { NostrEvent } from 'nostr-tools';
	import type { NostrBidContent } from '$lib/types/bid';
	import type { Task } from '$lib/types/task';
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { t } from 'svelte-i18n';
	import { locale } from 'svelte-i18n';
	import { goto } from '$app/navigation';
	import { slide } from 'svelte/transition';
	import {
		getMyBids,
		getBidStatus,
		cachedSatsFromUsd,
		isSatBid,
		readFundingInvoice,
		readTaskerPubkey
	} from '$lib/utils/nostr-bid';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';
	import { BidStatusEnum } from '$lib/utils/enums/bid.enum';
	import TaskDeadlineDisplay from '$lib/components/task/TaskDeadlineDisplay.svelte';
	import TaskLocationDisplay from '$lib/components/task/TaskLocationDisplay.svelte';
	import BookingDatesDisplay from '$lib/components/shared/BookingDatesDisplay.svelte';
	import UserInfoDisplay from '$lib/components/user/UserInfoDisplay.svelte';
	import IconCheck from '~icons/mdi/check';
	import IconClose from '~icons/mdi/close';
	import IconClockOutline from '~icons/mdi/clock-outline';
	import IconSwapHorizontal from '~icons/mdi/swap-horizontal';
	import IconUndo from '~icons/mdi/undo';
	import IconEmailFastOutline from '~icons/mdi/email-fast-outline';
	import { getSignedEvent, publishToMultipleRelays } from '$lib/utils/nostr';
	import { clearBidCache as clearBidCacheUtil } from '$lib/utils/nostr-bid';
	import { appStore } from '$lib/stores/app.store';
	import { SvelteSet } from 'svelte/reactivity';
	import KINDS from '$lib/utils/constants/kinds';
	import { formatNumberWithTwoDecimals, formatInteger } from '$lib/utils/helpers/currencyFormatter';
	import { taskTranslationService } from '$lib/services/task-translation.service';
	import DashboardEmptyState from '$lib/components/shared/DashboardEmptyState.svelte';
	import DashboardFilterBar from '$lib/components/shared/DashboardFilterBar.svelte';
	import DashboardDropdown from '$lib/components/shared/DashboardDropdown.svelte';
	import { createDashboardUrl } from '$lib/utils/service-quote/dashboard-route';
	import IconMagnify from '~icons/mdi/magnify';
	import IconCheckAll from '~icons/mdi/check-all';
	import EscrowInvoiceActions from '$lib/components/bidding/EscrowInvoiceActions.svelte';
	import { recordEscrowHistory } from '$lib/stores/wallet/escrow-history';
	import { loadTransactions } from '$lib/stores/wallet/wallet-transactions';

	/** Build a task-like object from bid for TranslatableTask (title + description) */
	function taskFromBid(bid: NostrBidContent): Task {
		return {
			id: bid.taskId,
			title: bid.taskTitle || $t('bids.unknown_task'),
			description: bid.taskDescription || '',
			translations: bid.taskTranslations
		} as Task;
	}

	// Simple function to get translated bid content (description, proposedApproach, coverLetter)
	// Reactive to locale changes via $locale
	function getTranslatedBidContent(
		bid: NostrBidContent,
		field: 'description' | 'proposedApproach' | 'coverLetter'
	): string {
		const currentLang = $locale || 'en';
		const originalText = bid[field] || '';

		// If no translations, return original
		if (!bid.translations) {
			return originalText;
		}

		// If current language is source language, return original
		if (bid.translations.sourceLanguage === currentLang) {
			return originalText;
		}

		// Get translation for current language
		const translation = bid.translations.translations[currentLang];
		if (translation) {
			return translation[field] || originalText;
		}

		// Fallback to original
		return originalText;
	}

	/** Get translated task title or description for a bid using stored task translations (reactive to $locale). */
	function getTranslatedTaskText(bid: NostrBidContent, field: 'title' | 'description'): string {
		const task = taskFromBid(bid);
		const currentLang = $locale || 'en';
		const stored = taskTranslationService.getStoredTranslation(task, currentLang);
		if (stored) {
			return field === 'title' ? stored.translatedTitle : stored.translatedDescription;
		}
		return field === 'title' ? bid.taskTitle || '' : bid.taskDescription || '';
	}

	let { status = null } = $props<{ status?: string | null }>();

	// State
	let myBids = $state<NostrEvent[]>([]);
	let loading = $state(true);
	let error = $state<string>('');
	let btcPrice = $state<number>(0); // Default fallback price
	let expandedBids = new SvelteSet<string>(); // Track expanded bids (SvelteSet is already reactive)

	type BidFilterCategory = 'all' | BidStatusEnum;
	const VALID_FILTERS: (string | BidStatusEnum)[] = [
		'all',
		BidStatusEnum.PENDING,
		BidStatusEnum.ACCEPTED,
		BidStatusEnum.REJECTED,
		BidStatusEnum.WITHDRAWN,
		BidStatusEnum.COUNTERED
	];

	let activeFilter = $state<BidFilterCategory>('all');

	$effect(() => {
		if (status && VALID_FILTERS.includes(status as BidFilterCategory)) {
			activeFilter = status as BidFilterCategory;
		}
	});

	const filterOptions = $derived([
		{ id: 'all' as const, label: $t('dashboard.contracts.all_statuses'), icon: IconCheckAll },
		{ id: BidStatusEnum.PENDING, label: $t('bids.pending'), icon: IconClockOutline },
		{ id: BidStatusEnum.ACCEPTED, label: $t('bids.accepted'), icon: IconCheck },
		{ id: BidStatusEnum.REJECTED, label: $t('bids.rejected'), icon: IconClose },
		{ id: BidStatusEnum.WITHDRAWN, label: $t('bids.status_withdrawn'), icon: IconUndo },
		{ id: BidStatusEnum.COUNTERED, label: $t('bids.status_countered'), icon: IconSwapHorizontal }
	]);

	function handleFilterChange(nextStatus: BidFilterCategory) {
		activeFilter = nextStatus;
		const nextUrl = createDashboardUrl(new URL(window.location.href), {
			tab: 'bids',
			status: nextStatus === 'all' ? null : nextStatus
		});
		void goto(nextUrl.toString(), { replaceState: true, keepFocus: true, noScroll: true });
	}

	const filteredBids = $derived.by(() => {
		if (activeFilter === 'all') return myBids;
		return myBids.filter((bidEvent) => {
			const status = getBidStatus(bidEvent)?.status?.toUpperCase();
			return status === activeFilter;
		});
	});

	/**
	 * Fetch current BTC price
	 */
	async function fetchBtcPrice(): Promise<void> {
		try {
			btcPrice = await cryptoPriceService.getCurrentPrice('BTC');
		} catch (error) {
			console.error('Error fetching BTC price:', error);
			// Keep using fallback price
		}
	}

	onMount(async () => {
		try {
			fetchBtcPrice();
			await loadMyBids();
		} catch (err) {
			console.error('Error loading user data:', err);
			error = $t('bids.error.loading_user_data');
		} finally {
			loading = false;
		}
	});

	onMount(() => {
		if (!browser) return;
		const refresh = (): void => {
			if (document.visibilityState !== 'visible') return;
			loadMyBids(true).catch((loadError: unknown) => {
				console.warn('[bids] refresh failed', loadError);
			});
		};
		document.addEventListener('visibilitychange', refresh);
		return () => document.removeEventListener('visibilitychange', refresh);
	});

	function rememberEscrowLocks(events: NostrEvent[]): void {
		let noted = false;
		for (const event of events) {
			const status = getBidStatus(event)?.status?.toUpperCase();
			if (status !== BidStatusEnum.ESCROW_FUNDED && status !== BidStatusEnum.WORK_IN_PROGRESS) {
				continue;
			}
			const bid = event.content as unknown as NostrBidContent;
			if (!bid?.taskId) continue;
			recordEscrowHistory({
				contractId: `contract-${bid.taskId}-${event.id}`,
				title: bid.taskTitle || bid.taskId,
				kind: 'lock'
			});
			noted = true;
		}
		if (!noted) return;
		loadTransactions().catch((error: unknown) => {
			console.warn('[bids] escrow history skipped', error);
		});
	}

	async function loadMyBids(quiet = false) {
		try {
			if (!quiet) loading = true;
			error = '';
			clearBidCacheUtil();
			myBids = await getMyBids();
			rememberEscrowLocks(myBids);
		} catch (err) {
			console.error('Error loading bids:', err);
			error = $t('bids.error.loading');
		} finally {
			loading = false;
		}
	}

	// Toggle bid expansion
	function toggleBidExpansion(bidId: string) {
		if (expandedBids.has(bidId)) {
			expandedBids.delete(bidId);
		} else {
			expandedBids.add(bidId);
		}
	}

	/** Status label, badge, and icon per status */
	const StatusRender: Record<string, { label: string; badge: string; icon: typeof IconCheck }> = {
		[BidStatusEnum.ACCEPTED]: {
			label: $t('bids.accepted'),
			badge: 'badge-success',
			icon: IconCheck
		},
		[BidStatusEnum.REJECTED]: {
			label: $t('bids.rejected'),
			badge: 'badge-error',
			icon: IconClose
		},
		[BidStatusEnum.COUNTERED]: {
			label: $t('bids.status_countered'),
			badge: 'badge-info',
			icon: IconSwapHorizontal
		},
		[BidStatusEnum.WITHDRAWN]: {
			label: $t('bids.status_withdrawn'),
			badge: 'badge-neutral',
			icon: IconUndo
		},
		[BidStatusEnum.PENDING]: {
			label: $t('bids.pending'),
			badge: 'badge-warning',
			icon: IconClockOutline
		}
	};

	/** Format sent-at timestamp (Unix seconds) for display: "Feb 14 at 10:59 PM" */
	function formatSentAt(createdAt: number): string {
		const currentLocale = $locale || 'en';
		return new Intl.DateTimeFormat(currentLocale, {
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit',
			hour12: true
		}).format(new Date(createdAt * 1000));
	}

	// Withdrawal logic
	let withdrawingBidId = $state<string | null>(null);
	let bidToWithdraw = $state<NostrEvent | null>(null);
	let showWithdrawModal = $state(false);

	function confirmWithdraw(bidEvent: NostrEvent) {
		bidToWithdraw = bidEvent;
		showWithdrawModal = true;
	}

	async function handleWithdraw() {
		if (!bidToWithdraw) return;

		const bidEventId = bidToWithdraw.id;

		try {
			withdrawingBidId = bidEventId;
			showWithdrawModal = false;

			const deletionEvent = {
				kind: 5,
				tags: [
					['e', bidEventId],
					['k', String(KINDS.BIDS)]
				],
				content: 'Bid withdrawn'
			};

			const signedEvent = await getSignedEvent(deletionEvent);
			const results = await publishToMultipleRelays(signedEvent);
			const successfulRelays = results.filter((r) => r.success);
			if (successfulRelays.length === 0) {
				const errors = results.map((r) => `${r.relay}: ${r.error}`).join(', ');
				throw new Error(`Failed to publish deletion to any relay: ${errors}`);
			}

			// Clear all bid caches so refresh fetches fresh data with NIP-09 filtering
			clearBidCacheUtil();
			appStore.showSuccessToast($t('bids.withdraw_success'));

			// Refresh UI
			myBids = myBids.filter((b) => b.id !== bidEventId);
		} catch (err) {
			console.error('Error withdrawing bid:', err);
			appStore.showErrorToast($t('bids.withdraw_error'));
		} finally {
			withdrawingBidId = null;
			bidToWithdraw = null;
		}
	}
</script>

<div class="flex flex-col gap-4">
	{#if loading}
		<div class="flex flex-col gap-4">
			{#each Array(1) as __placeholder, i (i)}
				<div
					class="card bg-base-100 border-base-300 animate-pulse rounded-lg border shadow-sm"
					data-skeleton={__placeholder}
				>
					<div class="card-body p-4 md:p-6">
						<!-- Task Information - Header skeleton -->
						<div class="border-base-300 mb-4 md:mb-6">
							<div class="flex items-start">
								<div class="flex-1">
									<!-- Task title skeleton -->
									<div class="bg-base-300 h-6 w-3/4 rounded"></div>
								</div>
							</div>
						</div>

						<!-- Your Bid Details skeleton -->
						<div class="space-y-2">
							<!-- Proposal title skeleton -->
							<div class="flex flex-col gap-2 md:flex-row md:items-center">
								<div class="bg-base-300 h-4 w-32 rounded md:h-5"></div>
								<div class="bg-base-300 h-3 w-16 rounded md:h-4"></div>
							</div>

							<!-- Two-column layout skeleton -->
							<div class="flex flex-col items-start justify-between gap-3 md:flex-row md:gap-4">
								<!-- Left column: Scheduled Period skeleton -->
								<div class="flex w-full flex-col gap-3 text-left md:w-auto md:gap-6">
									<div>
										<div class="bg-base-300 mb-1 h-3 w-28 rounded md:w-32"></div>
										<div class="bg-base-300 h-4 w-32 rounded md:w-36"></div>
										<div class="bg-base-300 mt-1 h-3 w-24 rounded md:w-28"></div>
									</div>
								</div>

								<!-- Right column: Amount & Payment Type skeleton -->
								<div class="flex w-full flex-row md:ml-auto md:w-auto">
									<div class="w-full text-start md:w-auto">
										<div class="bg-base-300 h-6 w-20 rounded md:w-24"></div>
										<div class="bg-base-300 mt-1 h-4 w-24 rounded md:w-28"></div>
									</div>
								</div>
							</div>

							<!-- Avatar, Username, and Review Stars skeleton -->
							<div
								class="flex flex-col gap-2 pt-2 md:flex-row md:items-center md:justify-between md:gap-3"
							>
								<div class="flex items-center gap-2 md:gap-3">
									<!-- Avatar skeleton -->
									<div class="bg-base-300 h-6 w-6 rounded-full md:h-8 md:w-8"></div>

									<!-- Username and Review Stars skeleton -->
									<div class="flex flex-col">
										<div class="bg-base-300 mb-1 h-3 w-16 rounded md:h-4 md:w-20"></div>
										<!-- Review Stars skeleton -->
										<div class="flex items-center">
											{#each Array(5) as __star, i (i)}
												<div
													class="bg-base-300 mr-1 h-2 w-2 rounded md:h-3 md:w-3"
													data-skeleton={__star}
												></div>
											{/each}
											<div class="bg-base-300 ml-1 h-2 w-6 rounded md:h-3 md:w-8"></div>
										</div>
									</div>
								</div>
							</div>

							<!-- Bottom section: Show more and View Task button skeleton -->
							<div class="flex flex-col gap-3 md:flex-row md:justify-between md:gap-0">
								<!-- Show more button skeleton -->
								<div class="border-base-200 pt-2">
									<div class="bg-base-300 h-6 w-20 rounded-2xl"></div>
								</div>

								<!-- View Task button skeleton -->
								<div class="flex justify-start md:justify-end">
									<div class="bg-base-300 h-8 w-24 rounded"></div>
								</div>
							</div>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{:else if error}
		<!-- Error State -->
		<div class="alert alert-outline alert-error">
			<svg class="mx-auto h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
				/>
			</svg>
			<p class="text-base font-semibold">{$t('bids.error_loading_bids')}</p>
			<p class="text-base-content/60 mt-2 mb-4">{error}</p>
			<button onclick={loadMyBids} class="btn btn-outline rounded-lg px-4 py-2">
				{$t('bids.retry')}
			</button>
		</div>
	{:else if myBids.length === 0}
		<!-- Empty State -->
		<div class="card bg-base-100 border-base-300 border shadow-sm">
			<DashboardEmptyState
				icon={IconMagnify}
				title={$t('bids.no_bids_yet')}
				description={$t('bids.no_bids_description')}
				actionLabel={$t('dashboard.find_task')}
				onAction={() => goto('/tasks')}
				testId="dashboard-bids-empty-state"
			/>
		</div>
	{:else}
		<DashboardFilterBar onRefresh={loadMyBids} isRefreshing={loading}>
			<DashboardDropdown
				options={filterOptions}
				value={activeFilter}
				onSelect={handleFilterChange}
				containerClass="col-span-2 sm:w-64"
			/>
		</DashboardFilterBar>

		{#if filteredBids.length === 0}
			<div class="card bg-base-100 border-base-300 border shadow-sm">
				<DashboardEmptyState
					icon={IconMagnify}
					title={$t('dashboard.tasks.no_filtered_tasks')}
					description={$t('dashboard.tasks.try_different_filters')}
					actionLabel={$t('dashboard.contracts.clear_filters')}
					onAction={() => handleFilterChange('all')}
				/>
			</div>
		{:else}
			<!-- Bids List -->
			<div class="flex min-w-0 flex-col gap-4 overflow-x-hidden">
				<!-- bid.content (NostrBidContent) incluye taskTitle, taskDescription, taskBudget, etc. enviados al crear la bid -->
				{#each filteredBids as bidEvent (bidEvent.id)}
					{@const bid = bidEvent.content as unknown as NostrBidContent}
					{@const status = getBidStatus(bidEvent)?.status?.toUpperCase()}
					<div class="card bg-base-100 border-base-300 border shadow-sm">
						<div class="card-body gap-3 p-5">
							<!-- Section TAREA: misma estructura que Find Tasks (TaskCard) -->
							<div class="border-base-200 border-b pb-4">
								<!-- Top row: título + descripción | badge + precio (alineado, sin espacio de más) -->
								<div class="mb-3 flex flex-row items-stretch justify-between gap-2">
									<div class="min-w-0 flex-1 pr-2 md:pr-4">
										<button
											onclick={(e) => {
												e.stopPropagation();
												goto(`/tasks/${bid.taskId}`);
											}}
											class="hover:text-primary card-title line-clamp-2 text-left text-lg font-semibold transition-colors"
										>
											{getTranslatedTaskText(bid, 'title') || $t('bids.unknown_task')}
										</button>
										<p class="text-base-content/60 mt-1 line-clamp-2 text-sm">
											{getTranslatedTaskText(bid, 'description')}
										</p>
									</div>
									<div
										class="flex w-[min(30%,120px)] shrink-0 flex-col items-end justify-between gap-1"
									>
										<span
											class="badge badge-lg {StatusRender[status ?? '']?.badge ??
												'badge-warning'} max-w-full truncate text-center"
										>
											{StatusRender[status ?? '']?.label ?? $t('bids.pending')}
										</span>
										{#if bid.taskBudget != null}
											<div class="text-right">
												<p class="text-xl font-bold">
													${formatNumberWithTwoDecimals(bid.taskBudget.amount)}
												</p>
												<p class="text-base-content/60 text-sm">
													{#if btcPrice > 0}
														{formatInteger(cachedSatsFromUsd(bid.taskBudget.amount, btcPrice) ?? 0)}
														{$t('bids.sats')}
													{:else}
														{$t('bids.price_unavailable')}
													{/if}
												</p>
											</div>
										{/if}
									</div>
								</div>
								<!-- Row for date and address (same structure as Find Tasks, without price on the right) -->
								<div class="mb-3 flex flex-col gap-3">
									<TaskDeadlineDisplay
										dateRangeStart={bid.startDateTime}
										dateRangeEnd={bid.endDateTime}
										showYear={false}
									/>
									<TaskLocationDisplay />
								</div>
								<EscrowInvoiceActions
									bidId={bidEvent.id}
									taskId={bid.taskId}
									taskerPubkey={readTaskerPubkey(bidEvent)}
									existingInvoice={readFundingInvoice(getBidStatus(bidEvent)) ?? ''}
									amount={bid.amount}
									currency={bid.currency}
									{status}
								/>
								<div>
									<UserInfoDisplay
										avatar={bid.taskCreatorAvatar}
										username={bid.taskCreatorUsername}
										rating={bid.taskCreatorRating ?? null}
										size="md"
										avatarAlt={$t('common.components.bidding.dashboard_bids.avatar_alt')}
										pubkey={bid.taskCreatorPubkey}
									/>
								</div>
							</div>

							<!-- Section TU OFERTA (what you sent) - dropdown -->
							<div class="pt-4">
								<button
									type="button"
									class="hover:bg-base-content/5 border-base-300 bg-base-200/40 flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left transition-colors"
									onclick={() => toggleBidExpansion(bid.bidId)}
									aria-expanded={expandedBids.has(bid.bidId)}
								>
									<span class="text-base-content/60 text-xs font-semibold tracking-wide uppercase">
										{$t('bids.section_your_offer')}
									</span>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										class="h-4 w-4 shrink-0 transition-transform duration-200 {expandedBids.has(
											bid.bidId
										)
											? 'rotate-180'
											: ''}"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M19 9l-7 7-7-7"
										/>
									</svg>
								</button>
								{#if expandedBids.has(bid.bidId)}
									<div
										transition:slide={{ duration: 300 }}
										class="border-base-200 bg-base-200/30 mt-3 space-y-3 overflow-hidden rounded-lg border p-3"
									>
										<!-- Fecha enviado 60% | Precio 40% en la misma fila -->
										<div class="grid grid-cols-[3fr_2fr] items-center gap-3">
											<div class="min-w-0">
												<div class="flex items-center gap-2">
													<IconEmailFastOutline class="text-primary h-8 w-8 shrink-0" />
													<div class="flex min-w-0 flex-col gap-0.5">
														<span class="text-sm font-medium"
															>{formatSentAt(bidEvent.created_at)
																.split(/,\s*/)
																.slice(0, -1)
																.join(', ')}</span
														>
														<span class="text-base-content/60 block text-xs"
															>{formatSentAt(bidEvent.created_at).split(/,\s*/).pop()}</span
														>
													</div>
												</div>
											</div>
											<div class="min-w-0 text-right">
												{#if isSatBid(bid.currency)}
													<p class="text-xl font-bold">
														{formatInteger(bid.amount)}
														{$t('bids.sats')}
													</p>
												{:else}
													<p class="text-xl font-bold">
														${formatNumberWithTwoDecimals(bid.amount)}
													</p>
													<p class="text-base-content/60 text-sm">
														{#if btcPrice > 0}
															{$t('bids.sats_estimate', {
																values: {
																	amount: formatInteger(
																		cachedSatsFromUsd(bid.amount, btcPrice) ?? 0
																	)
																}
															})}
														{:else}
															{$t('bids.price_unavailable')}
														{/if}
													</p>
												{/if}
											</div>
										</div>
										{#if bid.startDateTime && bid.endDateTime}
											{@const startTs = new Date(bid.startDateTime).getTime()}
											{@const endTs = new Date(bid.endDateTime).getTime()}
											{#if !isNaN(startTs) && !isNaN(endTs)}
												<BookingDatesDisplay startTime={startTs} endTime={endTs} />
											{/if}
										{/if}
										{#if bid.description}
											<div class="min-w-0">
												<p class="text-base-content/60 mb-1 text-xs font-medium">
													{$t('bids.your_description')}
												</p>
												<div class="bg-base-200 min-w-0 overflow-hidden rounded-lg p-3">
													<p class="text-base-content/80 wrap-break-words text-sm leading-relaxed">
														{getTranslatedBidContent(bid, 'description')}
													</p>
												</div>
											</div>
										{/if}
										{#if bid.proposedApproach && bid.proposedApproach.trim() !== ''}
											<div class="min-w-0">
												<p class="text-base-content/60 mb-1 text-xs font-medium">
													{$t('bids.your_approach')}
												</p>
												<div class="bg-base-200 min-w-0 overflow-hidden rounded-lg p-3">
													<p class="text-base-content/80 wrap-break-words text-sm leading-relaxed">
														{getTranslatedBidContent(bid, 'proposedApproach')}
													</p>
												</div>
											</div>
										{/if}
										{#if bid.coverLetter}
											<div class="min-w-0">
												<p class="text-base-content/60 mb-1 text-xs font-medium">
													{$t('bids.your_cover_letter')}
												</p>
												<div class="bg-base-200 min-w-0 overflow-hidden rounded-lg p-3">
													<p class="text-base-content/80 wrap-break-words text-sm leading-relaxed">
														{getTranslatedBidContent(bid, 'coverLetter')}
													</p>
												</div>
											</div>
										{/if}
										<div
											class="flex min-w-0 flex-col gap-2 pt-4 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center"
										>
											<button
												class="btn btn-primary btn-sm w-full min-w-0 sm:w-auto sm:min-w-fit"
												onclick={() => goto(`/tasks/${bid.taskId}`)}
											>
												<svg
													xmlns="http://www.w3.org/2000/svg"
													class="h-4 w-4 sm:h-5 sm:w-5"
													fill="none"
													viewBox="0 0 24 24"
													stroke="currentColor"
												>
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														stroke-width="2"
														d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
													/>
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														stroke-width="2"
														d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
													/>
												</svg>
												<span class="text-sm sm:text-base">{$t('bids.view_task')}</span>
											</button>

											{#if status === BidStatusEnum.PENDING || status === BidStatusEnum.COUNTERED}
												{#if withdrawingBidId === bidEvent.id}
													<div
														class="btn btn-error btn-sm w-full min-w-0 touch-manipulation gap-2 sm:w-auto sm:min-w-fit"
														aria-busy="true"
													>
														<span class="loading loading-spinner loading-sm"></span>
														<span class="text-sm sm:text-base">{$t('bids.withdraw_bid')}</span>
													</div>
												{:else}
													<button
														class="btn btn-error btn-sm w-full min-w-0 touch-manipulation transition-transform duration-100 select-none active:scale-95 sm:w-auto sm:min-w-fit"
														onclick={() => confirmWithdraw(bidEvent)}
														aria-label={$t('bids.withdraw_bid')}
													>
														<IconClose class="h-4 w-4 sm:h-5 sm:w-5" />
														<span class="text-sm sm:text-base">{$t('bids.withdraw_bid')}</span>
													</button>
												{/if}
											{/if}
										</div>
									</div>
								{/if}
							</div>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	{/if}
</div>

{#if showWithdrawModal}
	<dialog class="modal modal-open">
		<div class="modal-box">
			<h3 class="text-lg font-bold">{$t('bids.withdraw_confirm_title')}</h3>
			<p class="py-4">{$t('bids.withdraw_confirm_message')}</p>
			<div class="modal-action">
				<button class="btn" onclick={() => (showWithdrawModal = false)}>
					{$t('bids.withdraw_confirm_cancel')}
				</button>
				<button class="btn btn-error" onclick={handleWithdraw}>
					{$t('bids.withdraw_confirm_submit')}
				</button>
			</div>
		</div>
		<button class="modal-backdrop" onclick={() => (showWithdrawModal = false)}> close </button>
	</dialog>
{/if}

<script lang="ts">
	import type { NostrEvent } from 'nostr-tools';
	import type { NostrBidContent } from '$lib/types/bid';
	import { onMount } from 'svelte';
	import { t } from 'svelte-i18n';
	import { locale } from 'svelte-i18n';
	import { goto } from '$app/navigation';
	import { getMyBids, getBidStatus, cachedSatsFromUsd } from '$lib/utils/nostr-bid';
	import { formatNumberWithTwoDecimals } from '$lib/utils/helpers/currencyFormatter';
	import { formatStandardDateTime, parseDateWithLocalTime } from '$lib/utils/helpers/dateFormatter';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';
	import { BidStatusEnum } from '$lib/utils/enums/bid.enum';
	import TaskDeadlineDisplay from '$lib/components/task/TaskDeadlineDisplay.svelte';
	import TaskLocationDisplay from '$lib/components/task/TaskLocationDisplay.svelte';
	import UserInfoDisplay from '$lib/components/user/UserInfoDisplay.svelte';

	// Simple function to get translated task title/description
	// Reactive to locale changes via $locale
	function getTranslatedTaskText(
		bid: NostrBidContent,
		field: 'title' | 'description'
	): string {
		const currentLang = $locale || 'en';
		const originalText = field === 'title' ? bid.taskTitle : bid.taskDescription;
		
		// If no translations, return original
		if (!bid.taskTranslations) {
			return originalText;
		}

		// If current language is source language, return original
		if (bid.taskTranslations.sourceLanguage === currentLang) {
			return originalText;
		}

		// Get translation for current language
		const translation = bid.taskTranslations.translations[currentLang];
		if (translation) {
			return translation[field] || originalText;
		}

		// Fallback to original
		return originalText;
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

	// State
	let myBids = $state<NostrEvent[]>([]);
	let loading = $state(true);
	let error = $state<string>('');
	let btcPrice = $state<number>(0); // Default fallback price
	let expandedBids = $state<Set<string>>(new Set()); // Track expanded bids

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
			// Fetch BTC price for USDT conversion
			fetchBtcPrice();

			// Load user's bids
			await loadMyBids();
		} catch (err) {
			console.error('Error loading user data:', err);
			error = $t('bids.error.loading_user_data');
		} finally {
			loading = false;
		}
	});

	async function loadMyBids() {
		try {
			loading = true;
			error = ''; // Clear any previous error
			myBids = await getMyBids();
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
		expandedBids = new Set(expandedBids);
	}

	/** Status label and badge per status; reactive to locale via $t */
	const StatusRender = $derived<Record<string, { label: string; badge: string }>>({
		[BidStatusEnum.ACCEPTED]: { label: $t('bids.accepted'), badge: 'badge-success' },
		[BidStatusEnum.REJECTED]: { label: $t('bids.rejected'), badge: 'badge-error' },
		[BidStatusEnum.COUNTERED]: { label: $t('bids.status_countered'), badge: 'badge-info' },
		[BidStatusEnum.WITHDRAWN]: { label: $t('bids.status_withdrawn'), badge: 'badge-neutral' }
	});

	/** Format sent-at timestamp (Unix seconds) for display */
	function formatSentAt(createdAt: number): string {
		const currentLocale = $locale || 'en';
		return formatStandardDateTime(new Date(createdAt * 1000), currentLocale);
	}

	/** Format bid's proposed date range (dates you set for completing the task) */
	function formatProposedDateRange(bid: NostrBidContent): string {
		if (!bid.startDateTime || !bid.endDateTime) return '';
		const start = parseDateWithLocalTime(bid.startDateTime);
		const end = parseDateWithLocalTime(bid.endDateTime);
		const loc = $locale || 'en';
		if (start && end) {
			return `${formatStandardDateTime(start, loc)} - ${formatStandardDateTime(end, loc)}`;
		}
		return '';
	}
</script>

<div class="space-y-6">
	{#if loading}
		<div class="space-y-4">
			{#each Array(1) as _}
				<div class="card bg-base-100 border-base-300 animate-pulse rounded-lg border shadow-sm">
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
											{#each Array(5) as _}
												<div class="bg-base-300 mr-1 h-2 w-2 rounded md:h-3 md:w-3"></div>
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
		<div class="bg-base-100 rounded-xl py-12 text-center shadow-md">
			<svg
				class="mx-auto mb-4 h-12 w-12 text-red-400"
				fill="none"
				stroke="currentColor"
				viewBox="0 0 24 24"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
				/>
			</svg>
			<h3 class="mt-4 text-lg font-semibold">{$t('bids.error_loading_bids')}</h3>
			<p class="text-base-content/60 mt-2 mb-4">{error}</p>
			<button
				onclick={loadMyBids}
				class="rounded-lg border border-gray-600 bg-gray-700 px-4 py-2 text-white transition-colors hover:bg-gray-600"
			>
				{$t('bids.retry')}
			</button>
		</div>
	{:else if myBids.length === 0}
		<!-- Empty State -->
		<div class="bg-base-100 rounded-xl py-12 text-center shadow-md">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="text-primary mx-auto mb-3 h-12 w-12"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
				/>
			</svg>
			<span class="text-xl font-medium">{$t('bids.no_bids_yet')}</span>
			<p class="mb-4 text-gray-500">
				{$t('bids.no_bids_description')}
			</p>
		</div>
	{:else}
		<!-- Bids List -->
		<div class="space-y-4 pt-4">
			<!-- bid.content (NostrBidContent) incluye taskTitle, taskDescription, taskBudget, etc. enviados al crear la bid -->
			{#each myBids as bidEvent}
				{@const bid = bidEvent.content as unknown as NostrBidContent}
				{@const status = getBidStatus(bidEvent)?.status?.toUpperCase()}
				<div class="card bg-base-100 border-base-300 relative rounded-2xl border shadow-sm">
					<div class="card-body p-4 md:p-6">
						<!-- Status badge: top-right of card -->
						<div class="absolute right-4 top-4 z-10">
							<span class="badge {StatusRender[status ?? '']?.badge ?? 'badge-warning'}">
								{StatusRender[status ?? '']?.label ?? $t('bids.pending')}
							</span>
						</div>

						<!-- Section TAREA (what the task is) -->
						<div class="border-base-200 border-b pb-4">
							<span class="text-base-content/60 mb-2 block text-xs font-semibold uppercase tracking-wide">
								{$t('bids.section_task')}
							</span>
							<button
								onclick={(e) => {
									e.stopPropagation();
									goto(`/tasks/${bid.taskId}`);
								}}
								class="hover:text-primary card-title line-clamp-2 text-left text-lg transition-colors"
							>
								{getTranslatedTaskText(bid, 'title') || $t('bids.unknown_task')}
							</button>
							<p class="text-base-content/60 mt-1 line-clamp-2 text-sm">
								{getTranslatedTaskText(bid, 'description')}
							</p>
							<div class="mt-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
								<div class="flex flex-col gap-2">
									<TaskDeadlineDisplay
										dateRangeStart={bid.startDateTime}
										dateRangeEnd={bid.endDateTime}
									/>
									<TaskLocationDisplay />
								</div>
								{#if bid.taskBudget != null}
									<div class="shrink-0 text-right">
										<p class="text-lg font-bold">${formatNumberWithTwoDecimals(bid.taskBudget.amount)}</p>
										<p class="text-base-content/60 text-sm">{cachedSatsFromUsd(bid.taskBudget.amount, btcPrice)} {$t('bids.sats')}</p>
									</div>
								{/if}
							</div>
							<div class="mt-3">
								<UserInfoDisplay
									avatar={bid.taskCreatorAvatar}
									username={bid.taskCreatorUsername}
									rating={bid.taskCreatorRating || 0}
									size="md"
									avatarAlt={$t('common.components.bidding.dashboard_bids.avatar_alt')}
									pubkey={bid.taskCreatorPubkey}
									memberSince={bidEvent.created_at}
								/>
							</div>
						</div>

						<!-- Section TU OFERTA (what you sent) - dropdown -->
						<div class="pt-4">
							<button
								type="button"
								class="hover:bg-base-content/5 flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg border border-base-300 bg-base-200/40 px-3 py-2 text-left transition-colors"
								onclick={() => toggleBidExpansion(bid.bidId)}
								aria-expanded={expandedBids.has(bid.bidId)}
							>
								<span class="text-base-content/60 text-xs font-semibold uppercase tracking-wide">
									{$t('bids.section_your_offer')}
								</span>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="h-4 w-4 shrink-0 transition-transform duration-200 {expandedBids.has(bid.bidId)
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
								<div class="border-base-200 mt-3 space-y-3 rounded-lg border bg-base-200/30 p-3">
									<!-- Status, sent-at and price in one row, price on the right -->
									<div class="flex flex-wrap items-center justify-between gap-3">
										<div class="flex flex-wrap items-center gap-3">
											<span class="badge {StatusRender[status ?? '']?.badge ?? 'badge-warning'}">{StatusRender[status ?? '']?.label ?? $t('bids.pending')}</span>
											<span class="text-base-content/60 text-sm">
												{$t('bids.sent_at')}: <strong class="text-base-content">{formatSentAt(bidEvent.created_at)}</strong>
											</span>
										</div>
										<div class="shrink-0 text-right">
											<p class="text-xl font-bold">${formatNumberWithTwoDecimals(bid.amount)}</p>
											<p class="text-base-content/60 text-sm">{cachedSatsFromUsd(bid.amount, btcPrice)} {$t('bids.sats')}</p>
										</div>
									</div>
									{#if bid.startDateTime && bid.endDateTime}
										<div class="flex items-start gap-2">
											<svg
												xmlns="http://www.w3.org/2000/svg"
												class="text-base-content/60 mt-0.5 h-4 w-4 shrink-0"
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
											<div class="min-w-0 flex-1">
												<small class="text-base-content/60 text-xs">{$t('bids.estimated_date')}</small>
												<p class="text-sm font-medium">{formatProposedDateRange(bid)}</p>
												{#if bid.estimatedDuration}
													<span class="text-base-content/60 text-xs">({bid.estimatedDuration})</span>
												{/if}
											</div>
										</div>
									{/if}
									{#if bid.description}
										<div>
											<p class="text-base-content/60 mb-1 text-xs font-medium">{$t('bids.your_description')}</p>
											<div class="bg-base-200 rounded-lg p-3">
												<p class="text-base-content/80 text-sm leading-relaxed">
													{getTranslatedBidContent(bid, 'description')}
												</p>
											</div>
										</div>
									{/if}
									{#if bid.proposedApproach && bid.proposedApproach.trim() !== ''}
										<div>
											<p class="text-base-content/60 mb-1 text-xs font-medium">{$t('bids.your_approach')}</p>
											<div class="bg-base-200 rounded-lg p-3">
												<p class="text-base-content/80 text-sm leading-relaxed">
													{getTranslatedBidContent(bid, 'proposedApproach')}
												</p>
											</div>
										</div>
									{/if}
									{#if bid.coverLetter}
										<div>
											<p class="text-base-content/60 mb-1 text-xs font-medium">{$t('bids.your_cover_letter')}</p>
											<div class="bg-base-200 rounded-lg p-3">
												<p class="text-base-content/80 text-sm leading-relaxed">
													{getTranslatedBidContent(bid, 'coverLetter')}
												</p>
											</div>
										</div>
									{/if}
									<div class="flex justify-end pt-2">
										<button
											class="btn btn-primary btn-sm"
											onclick={() => goto(`/tasks/${bid.taskId}`)}
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
													d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
												/>
												<path
													stroke-linecap="round"
													stroke-linejoin="round"
													stroke-width="2"
													d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
												/>
											</svg>
											{$t('bids.view_task')}
										</button>
									</div>
								</div>
							{/if}
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

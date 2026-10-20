<script lang="ts">
	import type { Task } from '$lib/types/task';
	import { t, locale } from 'svelte-i18n';
	import { onMount } from 'svelte';
	import { fly } from 'svelte/transition';
	import { user } from '$lib/stores/user.store';
	import { publishNostrEvent } from '$lib/utils/nostr';
	import { clearBidCache } from '$lib/utils/nostr-bid';
	import { TAG_PATTERNS } from '$lib/utils/constants/tags';
	import { getRSKAddress } from '$lib/stores/wallet.store';
	import { generateBidTranslations } from '$lib/nostr/bid';
	import { formatNumberForInput } from '$lib/utils/helpers/crypto';
	import { formatNumberWithTwoDecimals } from '$lib/utils/helpers/currencyFormatter';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';
	import DurationPickerModal from '$lib/components/date/DurationPickerModal.svelte';
	import ScheduleDateTimeField from '$lib/components/date/ScheduleDateTimeField.svelte';
	import KINDS from '$lib/utils/constants/kinds';
	import { formatStandardDateTime, toUnixSeconds } from '$lib/utils/helpers/dateFormatter';
	import { SvelteDate } from 'svelte/reactivity';

	// Props - Simplified to just task, onClose, and stickySubmit
	const {
		task,
		onClose,
		stickySubmit = true
	} = $props<{
		task: Task;
		onClose: () => void;
		/**
		 * When true, the submit button stays visible while scrolling.
		 * For drawer usage we prefer it to be in normal flow, at the bottom of the drawer.
		 */
		stickySubmit?: boolean;
	}>();

	// Form state (fixed price only)
	let amount = $state<number>(0);
	let description = $state('');
	let proposedApproach = $state('');
	let coverLetter = $state('');
	let submittingBid = $state(false);
	let bidFormErrors = $state<Record<string, string>>({});
	let bidSubmitted = $state(false);
	let additionalInfoOpen = $state(false);
	/**
	 * Returns the task field (title or description) in the user's selected language.
	 * Uses task.translations when available and language differs from source; otherwise returns the source value.
	 */
	function getTaskTranslation(key: 'title' | 'description'): string {
		const currentLang = $locale || 'en';
		const tr = task.translations?.translations;
		if (!tr || task.translations?.sourceLanguage === currentLang) {
			return key === 'title' ? task.title : task.description;
		}
		const translation = tr[currentLang];
		const fallback = key === 'title' ? task.title : task.description;
		return (key === 'title' ? translation?.title : translation?.description) ?? fallback;
	}

	let startDateTime = $state<Date | null>(null);
	let scheduleFieldsTouched = $state(false);
	let durationDays = $state(0);
	let durationHours = $state(1);
	let durationMinutes = $state(0);
	let durationModalOpen = $state(false);

	const endDateTime = $derived.by(() => {
		if (!startDateTime) return null;
		const end = new SvelteDate(startDateTime.getTime());
		end.setDate(end.getDate() + durationDays);
		end.setHours(end.getHours() + durationHours);
		end.setMinutes(end.getMinutes() + durationMinutes);
		return roundDateToInterval(end, FIFTEEN_MINUTES_IN_MS, 'ceil');
	});
	const FIFTEEN_MINUTES_IN_MS = 15 * 60 * 1000;
	const DEFAULT_START_OFFSET_HOURS = 1;
	const DEFAULT_DURATION_IN_HOURS = 1;
	const MS_PER_HOUR = 60 * 60 * 1000;

	// BTC conversion state
	let btcPrice = $state<number>(0);

	// Fetch BTC price on mount
	async function fetchBtcPrice(): Promise<void> {
		try {
			const newPrice = await cryptoPriceService.getCurrentPrice('BTC');
			btcPrice = newPrice;
		} catch (error) {
			console.error('Error fetching BTC price:', error);
			throw new Error('Unable to fetch Bitcoin price. Please try again later.');
		}
	}

	// Handle USD amount changes for FIXED type
	function handleUsdChange(event: Event) {
		let input = cleanInput((event.target as HTMLInputElement).value);
		(event.target as HTMLInputElement).value = input;

		const usdValue = parseFloat(input.replace(/,/g, ''));
		if (!isNaN(usdValue)) {
			amount = usdValue;
		} else {
			amount = 0;
		}

		// Clear amount error when user starts typing
		clearFieldError('amount');
	}

	// Handle sats amount changes for FIXED type
	function handleSatsChange(event: Event) {
		let input = cleanInput((event.target as HTMLInputElement).value);
		(event.target as HTMLInputElement).value = input;

		const satsValue = parseInt(input.replace(/,/g, ''), 10);
		if (!isNaN(satsValue)) {
			// Convert sats to USD using the same formula as TaskBudget.svelte
			amount = (satsValue / 100_000_000) * btcPrice;
		} else {
			amount = 0;
		}

		// Clear amount error when user starts typing
		clearFieldError('amount');
	}

	function cleanInput(value: string): string {
		// Solo permite dígitos, comas y punto
		return value.replace(/[^0-9.,]/g, '');
	}

	function roundDateToInterval(
		date: Date,
		intervalMs = FIFTEEN_MINUTES_IN_MS,
		direction: 'ceil' | 'floor' = 'ceil'
	): Date {
		const rounded = new SvelteDate(date);
		const remainder = rounded.getTime() % intervalMs;
		if (remainder === 0) {
			return rounded;
		}

		if (direction === 'ceil') {
			rounded.setTime(rounded.getTime() + (intervalMs - remainder));
		} else {
			rounded.setTime(rounded.getTime() - remainder);
		}

		return rounded;
	}

	function addDefaultDuration(date: Date, hours = DEFAULT_DURATION_IN_HOURS): Date {
		const result = new SvelteDate(date);
		result.setHours(result.getHours() + hours);
		return result;
	}

	function ensureMinimumDuration(start: Date | null, end: Date | null): Date | null {
		if (!start) return end;
		if (!end) return roundDateToInterval(addDefaultDuration(start), FIFTEEN_MINUTES_IN_MS, 'ceil');

		if (end <= start) {
			return roundDateToInterval(addDefaultDuration(start), FIFTEEN_MINUTES_IN_MS, 'ceil');
		}

		return end;
	}

	function areDatesEqual(dateA: Date | null, dateB: Date | null): boolean {
		if (!dateA || !dateB) return false;
		return dateA.getTime() === dateB.getTime();
	}

	function getDefaultFutureStart(): Date {
		const now = new SvelteDate();
		const target = new SvelteDate(now.getTime() + DEFAULT_START_OFFSET_HOURS * MS_PER_HOUR);
		return roundDateToInterval(target, FIFTEEN_MINUTES_IN_MS, 'ceil');
	}

	function buildPreferredStartDate(): Date | null {
		return getDefaultFutureStart();
	}

	function buildPreferredEndDate(startCandidate: Date | null): Date | null {
		const baseStart = startCandidate ?? getDefaultFutureStart();
		const defaultEndFromStart = new SvelteDate(
			baseStart.getTime() + DEFAULT_DURATION_IN_HOURS * MS_PER_HOUR
		);
		return roundDateToInterval(defaultEndFromStart, FIFTEEN_MINUTES_IN_MS, 'ceil');
	}

	// Prefill schedule fields with task information (if available)
	$effect(() => {
		if (scheduleFieldsTouched) {
			return;
		}

		const preferredStart = buildPreferredStartDate();
		const _preferredEnd = ensureMinimumDuration(
			preferredStart,
			buildPreferredEndDate(preferredStart)
		);

		if (preferredStart && !areDatesEqual(startDateTime, preferredStart)) {
			startDateTime = preferredStart;
		}
	});

	// Handle description changes - clear error when user starts typing
	function handleDescriptionChange() {
		// Clear error as soon as user starts typing (addresses both "required" and "min length" errors)
		if (description.trim().length > 0) {
			clearFieldError('description');
		}
	}

	// Handle proposed approach changes - clear error when user starts typing
	function handleProposedApproachChange() {
		// Clear error as soon as user starts typing (addresses both "required" and "min length" errors)
		if (proposedApproach.trim().length > 0) {
			clearFieldError('proposedApproach');
		}
	}

	// Handle cover letter changes
	function handleCoverLetterChange() {
		clearFieldError('coverLetter');
	}

	// Handle datetime changes
	function handleDateTimeChange() {
		scheduleFieldsTouched = true;
		clearFieldError('datetime');
	}

	// Helper function to clear specific validation errors
	function clearFieldError(fieldName: string) {
		if (bidFormErrors[fieldName]) {
			bidFormErrors = { ...bidFormErrors, [fieldName]: '' };
		}
	}

	// Form validation
	function validateBidForm() {
		const errors: Record<string, string> = {};

		if (amount <= 0) {
			errors.amount = $t('bid_form.errors.amount_greater_than_zero');
		}

		// Validate datetime fields
		if (!startDateTime || !endDateTime) {
			errors.datetime = $t('bid_form.errors.datetime_required');
		} else if (startDateTime >= endDateTime) {
			errors.datetime = $t('bid_form.errors.datetime_invalid');
		} else if (startDateTime.getTime() < Date.now() + 5 * 60 * 1000) {
			const earliest = new Date(Date.now() + 5 * 60 * 1000);
			errors.datetime = $t('bid_form.errors.start_too_soon', {
				values: { time: formatStandardDateTime(earliest) }
			});
		}

		// Validate description - min 20, max 500
		if (!description || description.trim() === '') {
			errors.description = $t('bid_form.errors.description_required');
		} else if (description.trim().length < 20) {
			errors.description = $t('bid_form.errors.description_min_length');
		} else if (description.trim().length > 500) {
			errors.description = $t('bid_form.errors.description_max_length');
		}

		// Validate proposed approach - optional, but if provided: min 20, max 1000
		if (proposedApproach && proposedApproach.trim() !== '') {
			if (proposedApproach.trim().length < 20) {
				errors.proposedApproach = $t('bid_form.errors.proposed_approach_min_length');
			} else if (proposedApproach.trim().length > 1000) {
				errors.proposedApproach = $t('bid_form.errors.proposed_approach_max_length');
			}
		}

		bidFormErrors = errors;
		return Object.keys(errors).length === 0;
	}

	// Helper function to get the first validation error message
	function getFirstValidationError(): string | null {
		// Priority order: general error first, then field errors in order of importance
		if (bidFormErrors.general) {
			return bidFormErrors.general;
		}

		// Check field errors in priority order
		const errorFields = ['amount', 'datetime', 'description', 'proposedApproach', 'coverLetter'];

		for (const field of errorFields) {
			if (bidFormErrors[field] && bidFormErrors[field].trim() !== '') {
				return bidFormErrors[field];
			}
		}

		return null;
	}

	// Helper function to format duration for display (reactive)
	const formatDurationForDisplay = $derived.by(() => {
		if (startDateTime && endDateTime) {
			const diffMs = endDateTime.getTime() - startDateTime.getTime();
			if (diffMs <= 0) {
				return '';
			}
			const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
			const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
			const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

			const parts = [];

			if (diffDays > 0) {
				parts.push(
					`${diffDays} ${diffDays === 1 ? $t('dashboard.bids.bid_creation.day') : $t('dashboard.bids.bid_creation.days')}`
				);
			}

			if (diffHours > 0) {
				parts.push(
					`${diffHours} ${diffHours === 1 ? $t('dashboard.bids.bid_creation.hour') : $t('dashboard.bids.bid_creation.hours')}`
				);
			}

			if (diffMinutes > 0) {
				parts.push(
					`${diffMinutes} ${diffMinutes === 1 ? $t('dashboard.bids.bid_creation.minute') : $t('dashboard.bids.bid_creation.minutes')}`
				);
			}

			if (parts.length === 0) {
				return $t('dashboard.bids.bid_creation.one_hour');
			}

			if (parts.length === 1) {
				return parts[0];
			}

			// Join with translated "and"/"y" for multiple parts
			const lastPart = parts.pop();
			const conjunction = $t('common.components.date_input.and');
			return `${parts.join(', ')} ${conjunction} ${lastPart}`;
		}
		return '';
	});

	// Handle form submission
	async function handleBidSubmit(e: Event) {
		e.preventDefault();

		// Clear general error before validation
		if (bidFormErrors.general) {
			bidFormErrors = { ...bidFormErrors, general: '' };
		}

		if (!validateBidForm()) {
			// Validation failed - errors are already set in bidFormErrors
			return;
		}

		submittingBid = true;

		try {
			const rskAddress = await getRSKAddress();
			const startDateTimeSeconds = toUnixSeconds(startDateTime);
			const endDateTimeSeconds = toUnixSeconds(endDateTime);
			if (!startDateTimeSeconds || !endDateTimeSeconds) {
				throw new Error($t('bid_form.errors.datetime_required'));
			}

			// Generate translations for bid content (description, proposedApproach, coverLetter)
			const bidTranslations = await generateBidTranslations({
				description,
				proposedApproach,
				coverLetter
			});

			// Create bid data structure with explicit type
			const bidData = {
				type: 'bid',
				taskId: task.id,
				taskTitle: task.title,
				taskDescription: task.description,
				taskTranslations: task.translations, // Save task translations
				amount: amount, // Send USD amount directly
				currency: 'USD',
				paymentType: 'FIXED',
				hourlyRate: null,
				estimatedHours: null,
				description,
				estimatedDuration: formatDurationForDisplay,
				proposedApproach,
				coverLetter: coverLetter,
				timestamp: Date.now(),
				bidId: crypto.randomUUID(), // TODO: should be removed in favor of nostr event id property

				taskCreatorPubkey: task.npub,
				taskCreatorUsername: task.creator?.username,
				taskCreatorAvatar: task.creator?.avatar,

				// Original task budget — mismo origen que taskTitle/taskDescription: se guarda en la bid
				// para mostrarlo en Ofertas enviadas (DashboardBidsPanel) sin cargar la tarea de nuevo
				...(typeof task.budget?.amount === 'number' && {
					taskBudget: { amount: task.budget.amount, currency: task.budget.currency ?? 'USD' }
				}),

				// Add logged-in user information
				bidderId: $user.npub || $user.id?.toString() || '',
				bidderName: $user.username || $user.name,
				bidderAvatar: $user.picture || '',

				// Add RSK wallet address for escrow funding
				bidderWalletAddress: rskAddress,

				// Store as Unix seconds so the instant is timezone-safe across viewers
				startDateTime: startDateTimeSeconds,
				endDateTime: endDateTimeSeconds,

				// Add bid translations
				...(bidTranslations && { translations: bidTranslations })
			};

			// Create custom tags for the bid event using TAG_PATTERNS
			const customTags = TAG_PATTERNS.bid(bidData.bidId, task.id, task.npub, 'FIXED');

			// Submit a bid as an encrypted event to the task creator with custom tags
			await publishNostrEvent(KINDS.BIDS, JSON.stringify(bidData), task.npub, customTags);

			// Push notification removed — backend's Nostr indexer handles new_bid_on_task
			// via the reminder engine when it processes the Kind 30007 bid event.

			// Clear bid cache for this specific task and current user
			// This ensures fresh data on next load without clearing unrelated caches
			clearBidCache(task.id);

			// Mark bid as submitted
			bidSubmitted = true;
		} catch (error) {
			console.error('Failed to submit bid:', error);
			bidFormErrors.general =
				error instanceof Error
					? error.message
					: $t('dashboard.bids.bid_creation.failed_to_submit_bid');
		} finally {
			submittingBid = false;
		}
	}

	// Initialize BTC price and user data on mount
	onMount(() => {
		fetchBtcPrice();
	});
</script>

<div class="bid-form-container relative mx-auto flex min-h-0 min-w-0 flex-1 flex-col">
	{#if bidSubmitted}
		<div
			class="p-8 text-center"
			in:fly={{
				duration: 200,
				y: 0,
				x: 20
			}}
		>
			<div class="mb-6">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="text-success mx-auto h-16 w-16"
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
			<h3 class="mb-2 text-xl font-semibold">{$t('bid_form.success.title')}</h3>
			<p class="text-base-content/70 mb-4">
				{$t('bid_form.success.message')}
			</p>
			<div class="flex justify-center gap-4">
				<button class="btn btn-primary" onclick={onClose}>{$t('bid_form.success.close')}</button>
			</div>
		</div>
	{:else}
		<form class="flex min-h-0 flex-1 flex-col" onsubmit={handleBidSubmit}>
			<!-- Scrollable content area - compact spacing -->
			<div class="bid-form-fields flex-1 space-y-2 pb-2">
				<!-- Task context: title, description, help -->
				<div
					class="bg-base-200 border-base-300/50 min-w-0 overflow-visible rounded-lg border p-2.5"
				>
					<div class="mb-1 flex min-w-0 items-start justify-between gap-2">
						<span class="text-info min-w-0 shrink text-xs font-semibold">
							{$t('bid_form.task_you_are_bidding_on')}
						</span>
						<div
							class="bid-form-help-tooltip tooltip tooltip-left shrink-0"
							data-tip={$t('bid_form.help_tooltip')}
						>
							<button
								type="button"
								class="btn btn-circle btn-ghost btn-xs text-base-content/60 hover:text-primary"
								aria-label={$t('bid_form.help_modal_title')}
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
										d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
									/>
								</svg>
							</button>
						</div>
					</div>
					<span
						class="text-base-content line-clamp-1 block min-w-0 text-sm font-medium wrap-break-word"
						>{getTaskTranslation('title')}</span
					>
					{#if getTaskTranslation('description')}
						<p
							class="text-base-content/70 mt-0.5 line-clamp-2 text-xs wrap-break-word whitespace-pre-line"
						>
							{getTaskTranslation('description')}
						</p>
					{/if}
				</div>

				<!-- Fixed price bid amount - USD and Sats like in create-task -->
				<div class="form-control gap-3 pb-6">
					<label class="label min-h-0" for="bid-amount">
						<span class="label-text">{$t('bid_form.form.budget')}</span>
						{#if task.budget?.amount != null}
							<span class="label-text-alt text-info min-w-0 text-xs wrap-break-word">
								{$t('bid_form.form.suggested_price')}: ${formatNumberWithTwoDecimals(
									task.budget.amount
								)}
							</span>
						{:else}
							<span class="label-text-alt text-base-content/60 min-w-0 wrap-break-word">
								{$t('bid_form.form.budget_unavailable')}
							</span>
						{/if}
					</label>

					<div class="flex gap-2">
						<div class="relative flex-1">
							<span class="text-base-content/70 absolute top-1/2 left-3 z-9 -translate-y-1/2"
								>$</span
							>
							<input
								type="text"
								id="bid-usd"
								value={formatNumberForInput(amount)}
								onchange={handleUsdChange}
								oninput={handleUsdChange}
								class="input input-bordered w-full pl-7 {bidFormErrors.amount ? 'input-error' : ''}"
								placeholder={$t('bid_form.form.usd_placeholder')}
								min="0"
							/>
						</div>
						<div class="relative flex-1">
							<span class="text-base-content/70 absolute top-1/2 right-3 z-9 -translate-y-1/2"
								>Sats</span
							>
							<input
								type="text"
								id="bid-sats"
								value={formatNumberForInput(Math.round((amount / btcPrice) * 100_000_000))}
								onchange={handleSatsChange}
								oninput={handleSatsChange}
								class="input input-bordered w-full pr-12 {bidFormErrors.amount
									? 'input-error'
									: ''}"
								placeholder={$t('bid_form.form.sats_placeholder')}
								min="0"
							/>
						</div>
					</div>
					{#if bidFormErrors.amount}
						<div class="label w-full min-w-0">
							<span
								class="label-text-alt text-error block wrap-break-word"
								id="amount-error"
								aria-live="polite">{bidFormErrors.amount}</span
							>
						</div>
					{/if}
					{#if amount > 0}
						<span class="label-text-alt text-base-content/60 block">
							{$t('bid_form.form.btc_price')} ${Math.round(btcPrice).toLocaleString()}
						</span>
					{/if}
				</div>

				<!-- Date and Time Selection for Fixed Price -->
				<div class="form-control min-w-0 gap-4">
					<div class="grid min-w-0 gap-3 sm:grid-cols-2 sm:gap-12 md:gap-16">
						<ScheduleDateTimeField
							bind:value={startDateTime}
							period="start"
							minDate={new Date(Date.now() + 5 * 60 * 1000)}
							headingKey="bid_form.form.schedule_section_start"
							onChange={(date: Date | null) => {
								startDateTime = date;
								handleDateTimeChange();
							}}
						/>
						<!-- Duration trigger button -->
						<div class="form-control min-w-0 gap-0.5 sm:gap-3">
							{#if true}
								<div class="label min-h-0 py-0">
									<span class="label-text">{$t('common.components.duration_picker.title')}</span>
								</div>
							{/if}
							<button
								type="button"
								class="input input-bordered hover:bg-base-200/50 flex min-h-11 w-full items-center gap-1 px-1.5 py-0 text-left transition-colors sm:gap-1.5 sm:px-2"
								onclick={() => (durationModalOpen = true)}
							>
								<span class="text-base-content flex shrink-0 items-center" aria-hidden="true">
									<svg
										xmlns="http://www.w3.org/2000/svg"
										class="block h-5 w-5"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="1.75"
											d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
										/>
									</svg>
								</span>
								<span class="text-base-content min-w-0 flex-1 truncate text-sm font-semibold">
									{#if endDateTime}
										{new Intl.DateTimeFormat($locale || 'en', {
											month: 'short',
											day: 'numeric',
											hour: 'numeric',
											minute: '2-digit',
											hour12: true
										}).format(endDateTime)}
									{:else}
										{$t('common.components.duration_picker.title')}
									{/if}
								</span>
							</button>
						</div>
					</div>
					<p class="text-base-content/70 text-xs">
						{$t('bid_form.form.start_submit_warning')}
					</p>
					{#if bidFormErrors.datetime}
						<div class="label min-h-0 w-full min-w-0">
							<span
								class="label-text-alt text-error block wrap-break-word"
								id="datetime-error"
								aria-live="polite">{bidFormErrors.datetime}</span
							>
						</div>
					{/if}
					{#if startDateTime && endDateTime}
						<div class="bg-info/10 mt-2 rounded-lg px-3 py-2">
							<span class="text-info text-sm font-semibold">
								{$t('bid_form.form.duration')}: {formatDurationForDisplay}
							</span>
						</div>
					{/if}
				</div>

				<DurationPickerModal
					open={durationModalOpen}
					baseStartDate={startDateTime || new Date()}
					value={{ days: durationDays, hours: durationHours, minutes: durationMinutes }}
					onClose={() => (durationModalOpen = false)}
					onSelect={(d) => {
						durationDays = d.days;
						durationHours = d.hours;
						durationMinutes = d.minutes;
						durationModalOpen = false;
						handleDateTimeChange();
					}}
				/>

				<!-- Remove the old estimated duration field since we now have datetime for fixed price -->
				<!-- Estimated Completion Time field removed - not needed for either payment type -->

				<!-- Description of your offer -->
				<div class="form-control flex flex-col">
					<label class="label block min-h-0 py-0.5" for="bid-description">
						<span class="label-text text-sm">{$t('bid_form.form.description.label')}</span>
					</label>
					<textarea
						id="bid-description"
						class="textarea textarea-bordered textarea-sm min-h-16 w-full {bidFormErrors.description
							? 'textarea-error'
							: ''}"
						placeholder={$t('bid_form.form.description.placeholder')}
						bind:value={description}
						oninput={handleDescriptionChange}
						maxlength="500"
					></textarea>
					{#if description.length > 0}
						<small
							class="text-base-content/60 text-xs {description.length >= 500 ? 'text-warning' : ''}"
						>
							{description.length}/500 {$t('dashboard.bids.bid_creation.max')}
						</small>
					{/if}
				</div>

				<!-- Additional information (optional) - dropdown -->
				<div
					class="collapse-arrow border-base-300 bg-base-100 collapse rounded-lg border"
					class:collapse-open={additionalInfoOpen}
				>
					<input
						type="checkbox"
						id="bid-additional-info-toggle"
						bind:checked={additionalInfoOpen}
						class="min-h-0 w-0 border-0 p-0 opacity-0"
						aria-label={$t('bid_form.form.additional_info_title')}
					/>
					<div
						class="collapse-title text-primary bg-primary/10 min-h-0 py-2 text-left text-sm font-medium after:inset-e-4"
						role="button"
						tabindex="0"
						onclick={() => (additionalInfoOpen = !additionalInfoOpen)}
						onkeydown={(e) => e.key === 'Enter' && (additionalInfoOpen = !additionalInfoOpen)}
					>
						{$t('bid_form.form.additional_info_title')}
					</div>
					<div class="collapse-content">
						<div class="space-y-2 pt-0.5">
							<div class="form-control flex flex-col">
								<label class="label block" for="proposed-approach">
									<span class="label-text">{$t('bid_form.form.approach.label')}</span>
								</label>
								<textarea
									id="proposed-approach"
									class="textarea textarea-bordered textarea-sm min-h-14 w-full {bidFormErrors.proposedApproach
										? 'textarea-error'
										: ''}"
									class:textarea-error={bidFormErrors.proposedApproach}
									placeholder={$t('bid_form.form.approach.placeholder')}
									aria-invalid={bidFormErrors.proposedApproach ? 'true' : undefined}
									aria-describedby={bidFormErrors.proposedApproach
										? 'proposed-approach-error'
										: undefined}
									bind:value={proposedApproach}
									oninput={handleProposedApproachChange}
									maxlength="1000"
								></textarea>
								{#if proposedApproach.length > 0}
									<small
										class="text-base-content/60 text-xs {proposedApproach.length >= 1000
											? 'text-warning'
											: ''}"
									>
										{proposedApproach.length}/1000 {$t('dashboard.bids.bid_creation.max')}
									</small>
								{/if}
								{#if bidFormErrors.proposedApproach}
									<div class="label w-full min-w-0">
										<span
											class="label-text-alt text-error block wrap-break-word"
											id="proposed-approach-error"
											aria-live="polite">{bidFormErrors.proposedApproach}</span
										>
									</div>
								{/if}
							</div>

							<div class="form-control flex flex-col">
								<label class="label block" for="bid-cover-letter">
									<span class="label-text">{$t('bid_form.form.cover_letter.label')}</span>
								</label>
								<textarea
									id="bid-cover-letter"
									class="textarea textarea-bordered textarea-sm min-h-14 w-full {bidFormErrors.coverLetter
										? 'textarea-error'
										: ''}"
									placeholder={$t('bid_form.form.cover_letter.placeholder')}
									bind:value={coverLetter}
									oninput={handleCoverLetterChange}
									maxlength="800"
								></textarea>
								{#if coverLetter.length > 0}
									<small
										class="text-base-content/60 text-xs {coverLetter.length >= 800
											? 'text-warning'
											: ''}"
									>
										{coverLetter.length}/800 {$t('dashboard.bids.bid_creation.max')}
									</small>
								{/if}
								{#if bidFormErrors.coverLetter}
									<div class="label w-full min-w-0">
										<span
											class="label-text-alt text-error block wrap-break-word"
											id="cover-letter-error"
											aria-live="polite">{bidFormErrors.coverLetter}</span
										>
									</div>
								{/if}
							</div>
						</div>
					</div>
				</div>
			</div>

			<!-- Submit area -->
			<div
				class="border-base-300 bg-base-100 pb-safe -mx-4 border-t px-4 pt-3 {stickySubmit
					? 'sticky bottom-0 z-50'
					: 'mt-auto'}"
			>
				{#if getFirstValidationError()}
					<div class="alert alert-outline alert-error mb-2">
						<span>{getFirstValidationError()}</span>
					</div>
				{/if}
				<button
					id="bid-submit-btn"
					type="submit"
					class="btn btn-primary btn-sm mb-4 ml-auto block w-full sm:w-auto"
					disabled={submittingBid}
				>
					{#if submittingBid}
						<span class="loading loading-spinner loading-sm"></span>
						{$t('bid_form.form.submitting')}
					{:else}
						{$t('bid_form.form.submit_bid')}
					{/if}
				</button>
			</div>
		</form>
	{/if}
</div>

<style>
	/* Compact form: reduce vertical spacing so less scroll is needed */
	.bid-form-fields :global(.form-control) {
		margin-top: 0;
	}
	.bid-form-fields :global(.label) {
		padding-top: 0.25rem;
		padding-bottom: 0.25rem;
		min-height: 0;
	}

	/* Help tooltip: fixed width so it fits in drawer/modal, wraps and is not clipped */
	:global(.bid-form-help-tooltip[data-tip]::before) {
		width: 16rem;
		max-width: min(16rem, 90vw);
		white-space: normal;
		word-wrap: break-word;
		overflow-wrap: break-word;
		text-align: left;
		z-index: 100;
		margin-top: 0.5rem;
		padding-inline: 1rem;
		padding-block: 0.75rem;
	}

	/* Ensure submit button is always visible above bottom navigation bar on mobile */
	@media (max-width: 1024px) {
		.bid-form-container form > div:first-child {
			/* Add minimal padding to ensure button is accessible when scrolled to bottom */
			padding-bottom: 0.5rem;
		}

		.bid-form-container .sticky {
			/* Ensure sticky button stays visible above bottom nav */
			position: sticky;
			bottom: 0;
			z-index: 50;
			background-color: hsl(var(--b1));
		}
	}
</style>

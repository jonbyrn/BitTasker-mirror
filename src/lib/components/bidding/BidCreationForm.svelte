<script lang="ts">
	import type { PaymentType } from '$lib/types/bid';
	import { t } from 'svelte-i18n';
	import { fly } from 'svelte/transition';
	import { TAG_PATTERNS } from '$lib/utils/constants/tags';
	import { formatNumberForInput } from '$lib/utils/helpers/crypto';
	import { publishNostrEvent } from '$lib/utils/nostr';
	import { walletManager, rskAddress } from '$lib/stores/wallet.store';
	import { clearBidCache } from '$lib/utils/nostr-bid';
	import { pushNotificationService } from '$lib/api/services/push-notification.service';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';
	import DateInput from '$lib/components/date/DateInput.svelte';
	import type { DateRange } from '$lib/types/task';
	import KINDS from '$lib/utils/constants/kinds';

	// Props
	const {
		taskId,
		onClose,
		taskCreatorPubkey,
		taskCreatorUsername,
		taskCreatorAvatar,
		taskTitle,
		taskDescription,
		taskDateRange,
		taskDeadline,
		loggedInUserId,
		loggedInUserName,
		loggedInUserAvatar
	} = $props<{
		taskId: string;
		onClose: () => void;
		taskTitle: string; // Add task title prop
		taskDescription: string; // Add task description prop
		taskDateRange?: DateRange | null;
		taskDeadline?: string | null;
		taskCreatorPubkey?: string | undefined; // Add task creator pubkey prop
		taskCreatorUsername?: string; // Add task creator username prop
		taskCreatorAvatar?: string; // Add task creator avatar prop
		loggedInUserId?: string; // Add logged-in user ID prop
		loggedInUserName?: string; // Add logged-in user name prop
		loggedInUserAvatar?: string; // Add logged-in user avatar prop
	}>();

	// Form state
	let bidType = $state<PaymentType>('FIXED');
	let amount = $state<number>(0); // This will store USD amount for FIXED type
	let hourlyRate = $state<number>(0); // This will store USD amount for HOURLY type
	let estimatedHours = $state<string>('');
	let description = $state('');
	let estimatedDuration = $state('');
	let proposedApproach = $state('');
	let coverLetter = $state('');
	let submittingBid = $state(false);
	let bidFormErrors = $state<Record<string, string>>({});
	let bidSubmitted = $state(false);

	// New datetime fields for fixed price bids
	let startDateTime = $state<Date | null>(null);
let endDateTime = $state<Date | null>(null);
let scheduleFieldsTouched = $state(false);
const FIFTEEN_MINUTES_IN_MS = 15 * 60 * 1000;
const DEFAULT_START_OFFSET_DAYS = 1;
const DEFAULT_DURATION_IN_DAYS = 3;
const DEFAULT_DURATION_IN_HOURS = DEFAULT_DURATION_IN_DAYS * 24;
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

	// Handle hourly rate USD changes
	function handleHourlyRateUsdChange(event: Event) {
		let input = cleanInput((event.target as HTMLInputElement).value);
		(event.target as HTMLInputElement).value = input;

		const usdValue = parseFloat(input.replace(/,/g, ''));
		if (!isNaN(usdValue)) {
			hourlyRate = usdValue;
		} else {
			hourlyRate = 0;
		}

		// Clear hourly rate error when user starts typing
		clearFieldError('hourlyRate');
	}

	// Handle hourly rate sats changes
	function handleHourlyRateSatsChange(event: Event) {
		let input = cleanInput((event.target as HTMLInputElement).value);
		(event.target as HTMLInputElement).value = input;

		const satsValue = parseInt(input.replace(/,/g, ''), 10);
		if (!isNaN(satsValue)) {
			// Convert sats to USD using the same formula as TaskBudget.svelte
			hourlyRate = (satsValue / 100_000_000) * btcPrice;
		} else {
			hourlyRate = 0;
		}

		// Clear hourly rate error when user starts typing
		clearFieldError('hourlyRate');
	}

	// Handle estimated hours changes
	function handleEstimatedHoursChange(event: Event) {
		let input = cleanInput((event.target as HTMLInputElement).value);
		(event.target as HTMLInputElement).value = input;

		const hoursValue = parseFloat(input.replace(/,/g, ''));
		if (!isNaN(hoursValue)) {
			estimatedHours = hoursValue.toString();
		} else {
			estimatedHours = '';
		}

		// Clear estimated hours error when user starts typing
		clearFieldError('estimatedHours');
	}

	function cleanInput(value: string): string {
		// Solo permite dígitos, comas y punto
		return value.replace(/[^0-9.,]/g, '');
	}

	function parseDate(dateValue?: string | null): Date | null {
		if (!dateValue) return null;
		const parsed = new Date(dateValue);
		return Number.isNaN(parsed.getTime()) ? null : parsed;
	}

	function roundDateToInterval(
		date: Date,
		intervalMs = FIFTEEN_MINUTES_IN_MS,
		direction: 'ceil' | 'floor' = 'ceil'
	): Date {
		const rounded = new Date(date);
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
		const result = new Date(date);
		result.setHours(result.getHours() + hours);
		return result;
	}

	function ensureMinimumDuration(start: Date | null, end: Date | null): Date | null {
		if (!start) return end;
		if (!end) return addDefaultDuration(start);

		if (end <= start) {
			return addDefaultDuration(start);
		}

		return end;
	}

	function areDatesEqual(dateA: Date | null, dateB: Date | null): boolean {
		if (!dateA || !dateB) return false;
		return dateA.getTime() === dateB.getTime();
	}

	function addDays(date: Date, days: number): Date {
		const result = new Date(date);
		result.setDate(result.getDate() + days);
		return result;
	}

	function getDefaultFutureStart(): Date {
		const now = new Date();
		const target = addDays(now, DEFAULT_START_OFFSET_DAYS);
		return roundDateToInterval(target, FIFTEEN_MINUTES_IN_MS, 'ceil');
	}

	function clampToFuture(date: Date): Date {
		const nowRounded = roundDateToInterval(new Date(), FIFTEEN_MINUTES_IN_MS, 'ceil');
		return date < nowRounded ? nowRounded : date;
	}

	function buildPreferredStartDate(): Date | null {
		const rangeStart = parseDate(taskDateRange?.start);
		if (rangeStart) {
			return clampToFuture(roundDateToInterval(rangeStart, FIFTEEN_MINUTES_IN_MS, 'ceil'));
		}

		const deadlineDate = parseDate(taskDeadline);
		let candidate = getDefaultFutureStart();

		if (deadlineDate) {
			const maxStartBeforeDeadline = new Date(
				deadlineDate.getTime() - DEFAULT_DURATION_IN_HOURS * MS_PER_HOUR
			);
			const roundedMaxStart = roundDateToInterval(
				maxStartBeforeDeadline,
				FIFTEEN_MINUTES_IN_MS,
				'floor'
			);
			if (!Number.isNaN(roundedMaxStart.getTime())) {
				candidate = roundedMaxStart < candidate ? roundedMaxStart : candidate;
			}
		}

		return clampToFuture(candidate);
	}

	function buildPreferredEndDate(startCandidate: Date | null): Date | null {
		const rangeEnd = parseDate(taskDateRange?.end);
		if (rangeEnd) {
			return roundDateToInterval(rangeEnd, FIFTEEN_MINUTES_IN_MS, 'ceil');
		}

		const deadlineDate = parseDate(taskDeadline);
		const baseStart = startCandidate ?? getDefaultFutureStart();
		const preferredEndFromDuration = addDays(baseStart, DEFAULT_DURATION_IN_DAYS);

		let candidate: Date | null = preferredEndFromDuration;

		if (deadlineDate) {
			// Don't exceed deadline
			candidate = deadlineDate < preferredEndFromDuration ? deadlineDate : preferredEndFromDuration;
		}

		if (!candidate) {
			const fallbackEnd = addDays(new Date(), DEFAULT_START_OFFSET_DAYS + DEFAULT_DURATION_IN_DAYS);
			candidate = fallbackEnd;
		}

		// Ensure end is after start
		if (baseStart && candidate <= baseStart) {
			candidate = addDays(baseStart, DEFAULT_DURATION_IN_DAYS);
		}

		return roundDateToInterval(candidate, FIFTEEN_MINUTES_IN_MS, 'ceil');
	}

	// Prefill schedule fields with task information (if available)
	$effect(() => {
		if (scheduleFieldsTouched) {
			return;
		}

		const preferredStart = buildPreferredStartDate();
		const preferredEnd = ensureMinimumDuration(
			preferredStart,
			buildPreferredEndDate(preferredStart)
		);

		if (preferredStart && !areDatesEqual(startDateTime, preferredStart)) {
			startDateTime = preferredStart;
		}

		if (preferredEnd && !areDatesEqual(endDateTime, preferredEnd)) {
			endDateTime = preferredEnd;
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

	// Handle payment type change
	function handlePaymentTypeChange(newType: PaymentType) {
		if (bidType === newType) return;

		bidType = newType;

		if (newType === 'HOURLY') {
			// Clear fixed price fields and initialize hourly rate with current USD amount
			amount = 0;
			if (hourlyRate > 0) {
				// Keep the current hourly rate USD value
			} else {
				hourlyRate = 0;
			}
		} else {
			// Clear hourly rate fields and initialize fixed price with current hourly rate
			hourlyRate = 0;
			estimatedHours = '';
			if (hourlyRate > 0 && parseFloat(estimatedHours || '0') > 0) {
				// Convert hourly rate to total amount
				amount = hourlyRate * parseFloat(estimatedHours);
			}
		}
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

		// Validate amount for FIXED type
		if (bidType === 'FIXED') {
			if (amount <= 0) {
				errors.amount = $t('bid_form.errors.amount_greater_than_zero');
			}

			// Validate datetime fields for fixed price
			if (!startDateTime || !endDateTime) {
				errors.datetime = $t('bid_form.errors.datetime_required');
			} else if (startDateTime >= endDateTime) {
				errors.datetime = $t('bid_form.errors.datetime_invalid');
			}
		}

		// Validate hourly rate and estimated hours for HOURLY type
		if (bidType === 'HOURLY') {
			if (hourlyRate <= 0) {
				errors.hourlyRate = $t('bid_form.errors.hourly_rate_greater_than_zero');
			}

			if (!estimatedHours || estimatedHours.trim() === '') {
				errors.estimatedHours = $t('bid_form.errors.estimated_hours_required');
			} else if (parseFloat(estimatedHours) <= 0) {
				errors.estimatedHours = $t('bid_form.errors.estimated_hours_greater_than_zero');
			}
		}

		// Validate description - min 20, max 500
		if (!description || description.trim() === '') {
			errors.description = $t('bid_form.errors.description_required');
		} else if (description.trim().length < 20) {
			errors.description = $t('bid_form.errors.description_min_length');
		} else if (description.trim().length > 500) {
			errors.description = $t('bid_form.errors.description_max_length');
		}

		// Validate proposed approach - min 20, max 1000
		if (!proposedApproach || proposedApproach.trim() === '') {
			errors.proposedApproach = $t('bid_form.errors.proposed_approach_required');
		} else if (proposedApproach.trim().length < 20) {
			errors.proposedApproach = $t('bid_form.errors.proposed_approach_min_length');
		} else if (proposedApproach.trim().length > 1000) {
			errors.proposedApproach = $t('bid_form.errors.proposed_approach_max_length');
		}

		bidFormErrors = errors;
		return Object.keys(errors).length === 0;
	}

	// Helper function to format duration for display
	function formatDurationForDisplay(): string {
		if (bidType === 'FIXED' && startDateTime && endDateTime) {
			const diffMs = endDateTime.getTime() - startDateTime.getTime();
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

			// Join with "and" for multiple parts
			const lastPart = parts.pop();
			return `${parts.join(', ')} and ${lastPart}`;
		}
		return '';
	}

	// Handle form submission
	async function handleBidSubmit(e: Event) {
		e.preventDefault();

		if (!validateBidForm()) return;

		submittingBid = true;

		try {
			await walletManager.initialize();

			// Create bid data structure with explicit type
			const bidData = {
				type: 'bid',
				taskId: taskId,
				taskTitle: taskTitle,
				taskDescription: taskDescription,
				amount: amount, // Send USD amount directly
				currency: 'USD',
				paymentType: bidType,
				hourlyRate: bidType === 'HOURLY' && hourlyRate ? hourlyRate : null, // Send USD hourly rate directly
				estimatedHours: bidType === 'HOURLY' && estimatedHours ? parseFloat(estimatedHours) : null,
				description,
				estimatedDuration: bidType === 'FIXED' ? formatDurationForDisplay() : estimatedDuration,
				proposedApproach,
				coverLetter: coverLetter,
				timestamp: Date.now(),
				bidId: crypto.randomUUID(), // TODO: should be removed in favor of nostr event id property

				taskCreatorPubkey: taskCreatorPubkey,
				taskCreatorUsername: taskCreatorUsername,
				taskCreatorAvatar: taskCreatorAvatar,

				// Add logged-in user information
				bidderId: loggedInUserId,
				bidderName: loggedInUserName,
				bidderAvatar: loggedInUserAvatar,

				// Add RSK wallet address for escrow funding
				bidderWalletAddress: $rskAddress,

				// Add new datetime fields
				startDateTime: bidType === 'FIXED' ? startDateTime : null,
				endDateTime: bidType === 'FIXED' ? endDateTime : null
			};

			// Create custom tags for the bid event using TAG_PATTERNS
			const customTags = TAG_PATTERNS.bid(bidData.bidId, taskId, taskCreatorPubkey, bidType);

			// Submit a bid as an encrypted event to the task creator with custom tags
			await publishNostrEvent(KINDS.BIDS, JSON.stringify(bidData), taskCreatorPubkey, customTags);

			// Send notification to task creator
			pushNotificationService.sendNotificationToNpubs({
				npubs: [taskCreatorPubkey],
				title: 'New Bid Received',
				body: `New bid received for task: ${taskTitle || taskId} | taskId:${taskId} | taskCreatorPubkey:${taskCreatorPubkey}`,
				type: 'bid_created',
				clickAction: `${import.meta.env.VITE_APP_URL}/dashboard/task/${taskId}`,
				icon: 'https://bittasker.com/images/Logos/BitTasker-square-logo.svg'
			});

			// Clear bid cache for this specific task
			// This ensures fresh data on next load without clearing unrelated caches
			clearBidCache(taskId);

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

	// Initialize BTC price on mount
	$effect(() => {
		fetchBtcPrice();
	});
</script>

<div class="bg-base-100 relative mx-auto rounded-lg">
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
		<form class="space-y-4" onsubmit={handleBidSubmit}>
			<!-- Payment Type -->
			<div class="form-control">
				<label class="label cursor-pointer" for="payment-type-group">
					<span class="label-text">{$t('bid_form.form.payment_type')}</span>
				</label>
				<div
					id="payment-type-group"
					class="mb-2 flex max-w-md gap-2"
					role="radiogroup"
					aria-label="Payment Type"
				>
					<button
						type="button"
						class="btn flex-1 {bidType === 'FIXED' ? 'btn-primary' : 'btn-outline'}"
						onclick={() => handlePaymentTypeChange('FIXED')}
						role="radio"
						aria-checked={bidType === 'FIXED'}
					>
						{$t('bid_form.form.fixed_price')}
					</button>
					<button
						type="button"
						class="btn flex-1 {bidType === 'HOURLY' ? 'btn-primary' : 'btn-outline'}"
						onclick={() => handlePaymentTypeChange('HOURLY')}
						role="radio"
						aria-checked={bidType === 'HOURLY'}
					>
						{$t('bid_form.form.hourly_rate')}
					</button>
				</div>
			</div>

			{#if bidType === 'FIXED'}
				<!-- Fixed price bid amount - USD and Sats like in create-task -->
				<div class="form-control">
					<label class="label" for="bid-amount">
						<span class="label-text">{$t('bid_form.form.budget')}</span>
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
						<div class="label">
							<span class="label-text-alt text-error" id="amount-error" aria-live="polite"
								>{bidFormErrors.amount}</span
							>
						</div>
					{/if}
					{#if amount > 0}
						<span class="label-text-alt text-base-content/60 mt-1 block">
							{$t('bid_form.form.btc_price')} ${Math.round(btcPrice).toLocaleString()}
						</span>
					{/if}
				</div>

				<!-- Date and Time Selection for Fixed Price -->
				<div class="form-control">
					<label class="label" for="datetime-range">
						<span class="label-text">{$t('bid_form.form.datetime_range')}</span>
					</label>
					<div class="flex flex-col gap-4 sm:flex-row">
						<div class="flex-1">
							<DateInput
								bind:value={startDateTime}
								type="datetime"
								labelKey="bid_form.form.airdatepicker.select_start_datetime"
								placeholderKey="bid_form.form.airdatepicker.select_start_datetime"
								minDate={new Date()}
								maxDate={undefined}
								timeStep={15}
								onChange={(date: Date | null) => {
									startDateTime = date;
									handleDateTimeChange();
								}}
								className={bidFormErrors.datetime ? 'input-error' : ''}
							/>
						</div>
						<div class="flex-1">
							<DateInput
								bind:value={endDateTime}
								type="datetime"
								labelKey="bid_form.form.airdatepicker.select_end_datetime"
								placeholderKey="bid_form.form.airdatepicker.select_end_datetime"
								minDate={startDateTime || new Date()}
								maxDate={undefined}
								timeStep={15}
								onChange={(date: Date | null) => {
									endDateTime = date;
									handleDateTimeChange();
								}}
								className={bidFormErrors.datetime ? 'input-error' : ''}
							/>
						</div>
					</div>
					{#if bidFormErrors.datetime}
						<div class="label">
							<span class="label-text-alt text-error" id="datetime-error" aria-live="polite"
								>{bidFormErrors.datetime}</span
							>
						</div>
					{/if}
					{#if startDateTime && endDateTime}
						<span class="label-text-alt text-base-content/60 mt-1 block">
							{$t('bid_form.form.duration')}: {formatDurationForDisplay()}
						</span>
					{/if}
				</div>
			{:else}
				<!-- Hourly rate bid details -->
				<div class="form-control">
					<label class="label" for="hourly-rate">
						<span class="label-text">{$t('bid_form.form.hourly_rate_label')}</span>
					</label>
					<div class="flex gap-2">
						<div class="relative flex-1">
							<span class="text-base-content/70 absolute top-1/2 left-3 z-10 -translate-y-1/2"
								>$</span
							>
							<input
								type="text"
								id="hourly-rate-usd"
								value={formatNumberForInput(hourlyRate)}
								onchange={handleHourlyRateUsdChange}
								oninput={handleHourlyRateUsdChange}
								class="input input-bordered w-full pl-7 {bidFormErrors.hourlyRate
									? 'input-error'
									: ''}"
								placeholder={$t('bid_form.form.hourly_usd_placeholder')}
								min="0"
							/>
						</div>
						<div class="relative flex-1">
							<span class="text-base-content/70 absolute top-1/2 right-3 z-10 -translate-y-1/2"
								>Sats</span
							>
							<input
								type="text"
								id="hourly-rate-sats"
								value={formatNumberForInput(Math.round((hourlyRate / btcPrice) * 100_000_000))}
								onchange={handleHourlyRateSatsChange}
								oninput={handleHourlyRateSatsChange}
								class="input input-bordered w-full pr-12 {bidFormErrors.hourlyRate
									? 'input-error'
									: ''}"
								placeholder={$t('bid_form.form.hourly_sats_placeholder')}
								min="0"
							/>
						</div>
					</div>
					{#if bidFormErrors.hourlyRate}
						<div class="label">
							<span class="label-text-alt text-error" id="hourly-rate-error" aria-live="polite"
								>{bidFormErrors.hourlyRate}</span
							>
						</div>
					{/if}
					{#if hourlyRate > 0}
						<span class="label-text-alt text-base-content/60 mt-1 block">
							{$t('bid_form.form.btc_price')} ${Math.round(btcPrice).toLocaleString()}
						</span>
					{/if}
				</div>

				<!-- Estimated Hours -->
				<div class="form-control">
					<label class="label" for="estimated-hours">
						<span class="label-text">{$t('bid_form.form.estimated_hours')}</span>
					</label>
					<input
						id="estimated-hours"
						type="text"
						class="input input-bordered w-full"
						class:input-error={bidFormErrors.estimatedHours}
						aria-invalid={bidFormErrors.estimatedHours ? 'true' : undefined}
						aria-describedby={bidFormErrors.estimatedHours ? 'estimated-hours-error' : undefined}
						placeholder={$t('bid_form.form.hours_placeholder')}
						min="1"
						step="1"
						value={estimatedHours}
						onchange={handleEstimatedHoursChange}
						oninput={handleEstimatedHoursChange}
					/>
					{#if bidFormErrors.estimatedHours}
						<div class="label">
							<span class="label-text-alt text-error" id="estimated-hours-error" aria-live="polite"
								>{bidFormErrors.estimatedHours}</span
							>
						</div>
					{/if}
				</div>

				<!-- Estimated total for hourly rate -->
				<div class="form-control">
					<label class="label" for="total-estimated-amount">
						<span class="label-text">{$t('bid_form.form.total_estimated')}</span>
					</label>
					<div class="bg-base-200 rounded-md p-3">
						<div class="text-lg font-semibold">
							${(hourlyRate * parseFloat(estimatedHours || '0')).toLocaleString('en-US', {
								minimumFractionDigits: 2,
								maximumFractionDigits: 2
							})}
						</div>
						<div class="text-sm opacity-70">
							${hourlyRate.toLocaleString('en-US')} × {parseFloat(
								estimatedHours || '0'
							).toLocaleString('en-US')}
							{$t('dashboard.bids.bid_creation.hours')}
						</div>
						<div class="mt-1 text-sm opacity-70">
							≈ {Math.round(
								(hourlyRate / btcPrice) * 100_000_000 * parseFloat(estimatedHours || '0')
							).toLocaleString('en-US')}
							{$t('dashboard.bids.bid_creation.sats')}
						</div>
					</div>
				</div>
			{/if}

			<!-- Remove the old estimated duration field since we now have datetime for fixed price -->
			<!-- Estimated Completion Time field removed - not needed for either payment type -->

			<!-- Bid Description -->
			<div class="form-control flex flex-col">
				<label class="label block" for="bid-description">
					<span class="label-text">{$t('bid_form.form.description.label')}</span>
				</label>
				<textarea
					id="bid-description"
					class="textarea textarea-bordered h-24 w-full {bidFormErrors.description
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
				{#if bidFormErrors.description}
					<div class="label">
						<span
							class="label-text-alt text-error whitespace-break-spaces"
							id="description-error"
							aria-live="polite">{bidFormErrors.description}</span
						>
					</div>
				{/if}
			</div>

			<!-- Your approach -->
			<div class="form-control flex flex-col">
				<label class="label block" for="proposed-approach">
					<span class="label-text">{$t('bid_form.form.approach.label')}</span>
				</label>
				<textarea
					id="proposed-approach"
					class="textarea textarea-bordered h-24 w-full {bidFormErrors.proposedApproach
						? 'textarea-error'
						: ''}"
					class:textarea-error={bidFormErrors.proposedApproach}
					placeholder={$t('bid_form.form.approach.placeholder')}
					aria-invalid={bidFormErrors.proposedApproach ? 'true' : undefined}
					aria-describedby={bidFormErrors.proposedApproach ? 'proposed-approach-error' : undefined}
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
					<div class="label">
						<span
							class="label-text-alt text-error whitespace-break-spaces"
							id="proposed-approach-error"
							aria-live="polite">{bidFormErrors.proposedApproach}</span
						>
					</div>
				{/if}
			</div>

			<!-- Cover letter -->
			<div class="form-control flex flex-col">
				<label class="label block" for="bid-cover-letter">
					<span class="label-text">{$t('bid_form.form.cover_letter.label')}</span>
				</label>
				<textarea
					id="bid-cover-letter"
					class="textarea textarea-bordered h-24 w-full {bidFormErrors.coverLetter
						? 'textarea-error'
						: ''}"
					placeholder={$t('bid_form.form.cover_letter.placeholder')}
					bind:value={coverLetter}
					oninput={handleCoverLetterChange}
					maxlength="800"
				></textarea>
				{#if coverLetter.length > 0}
					<small
						class="text-base-content/60 text-xs {coverLetter.length >= 800 ? 'text-warning' : ''}"
					>
						{coverLetter.length}/800 {$t('dashboard.bids.bid_creation.max')}
					</small>
				{/if}
				{#if bidFormErrors.coverLetter}
					<div class="label">
						<span class="label-text-alt text-error" id="cover-letter-error" aria-live="polite"
							>{bidFormErrors.coverLetter}</span
						>
					</div>
				{/if}
			</div>

			<!-- Submit Buttons -->
			<button
				id="bid-submit-btn"
				type="submit"
				class="btn btn-primary ml-auto block {bidFormErrors.general ? '' : 'mb-20 lg:mb-4'}"
				disabled={submittingBid}
			>
				{#if submittingBid}
					<span class="loading loading-spinner loading-sm"></span>
					{$t('bid_form.form.submitting')}
				{:else}
					{$t('bid_form.form.submit_bid')}
				{/if}
			</button>
			{#if bidFormErrors.general}
				<div class="alert alert-error alert-outline mb-20 lg:mb-4">
					<span>{bidFormErrors.general}</span>
				</div>
			{/if}
		</form>
	{/if}
</div>

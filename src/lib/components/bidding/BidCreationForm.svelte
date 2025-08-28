<script lang="ts">
	import type { PaymentType } from '$lib/types/bid';
	import { t } from 'svelte-i18n';
	import { fly } from 'svelte/transition';
	import { submitBidAsDM } from '$lib/utils/nostr-bid';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';
	import { formatNumberForInput, satsFromUsd, usdFromSats } from '$lib/utils/helpers/crypto';
	import type { NostrBid } from '$lib/utils/nostr-bid'; // Import from nostr-bid.ts where it's defined

	// Props
	const { taskId, onClose, taskCreatorPubkey, taskTitle, taskDescription } = $props<{
		taskId: string;
		onClose: () => void;
		taskCreatorPubkey: string; // Required for sending DM
		taskTitle?: string; // Add task title prop
		taskDescription?: string; // Add task description prop
	}>();

	// Form state
	let bidType = $state<PaymentType>('FIXED');
	let amount = $state<string>(''); // This will store sats
	let hourlyRate = $state<string>(''); // This will store sats
	let estimatedHours = $state<string>('');
	let description = $state('');
	let estimatedDuration = $state('');
	let proposedApproach = $state('');
	let coverLetter = $state('');
	let submittingBid = $state(false);
	let bidFormErrors = $state<Record<string, string>>({});
	let bidSubmitted = $state(false);

	// New datetime fields for fixed price bids
	let startDate = $state<string>('');
	let endDate = $state<string>('');
	let startTime = $state<string>('09:00');
	let endTime = $state<string>('17:00');

	// USDT conversion state
	let usdAmount = $state<number>(0);
	let hourlyRateUsd = $state<number>(0); // Add separate USD state for hourly rate
	let btcPrice = $state<number>(63000); // Default fallback price

	// Fetch BTC price on mount
	async function fetchBtcPrice(): Promise<void> {
		try {
			btcPrice = await cryptoPriceService.getCurrentPrice('BTC');
		} catch (error) {
			console.error('Error fetching BTC price:', error);
		}
	}

	// Handle USD amount changes for USDT
	function handleUsdChange(event: Event) {
		let input = cleanInput((event.target as HTMLInputElement).value);
		(event.target as HTMLInputElement).value = input;

		const usdValue = parseFloat(input.replace(/,/g, ''));
		if (!isNaN(usdValue)) {
			usdAmount = usdValue;
			const satsValue = satsFromUsd(usdValue, btcPrice);
			amount = satsValue.toString();
		} else {
			usdAmount = 0;
			amount = '0';
		}
	}

	// Handle sats amount changes
	function handleSatsChange(event: Event) {
		let input = cleanInput((event.target as HTMLInputElement).value);
		(event.target as HTMLInputElement).value = input;

		const satsValue = parseInt(input.replace(/,/g, ''), 10);
		if (!isNaN(satsValue)) {
			amount = satsValue.toString();
			usdAmount = usdFromSats(satsValue, btcPrice);
		} else {
			amount = '0';
			usdAmount = 0;
		}
	}

	// Handle hourly rate USD changes
	function handleHourlyRateUsdChange(event: Event) {
		let input = cleanInput((event.target as HTMLInputElement).value);
		(event.target as HTMLInputElement).value = input;

		const usdValue = parseFloat(input.replace(/,/g, ''));
		if (!isNaN(usdValue)) {
			hourlyRateUsd = usdValue;
			const satsValue = satsFromUsd(usdValue, btcPrice);
			hourlyRate = satsValue.toString();
		} else {
			hourlyRateUsd = 0;
			hourlyRate = '0';
		}
	}

	// Handle hourly rate sats changes
	function handleHourlyRateSatsChange(event: Event) {
		let input = cleanInput((event.target as HTMLInputElement).value);
		(event.target as HTMLInputElement).value = input;

		const satsValue = parseInt(input.replace(/,/g, ''), 10);
		if (!isNaN(satsValue)) {
			hourlyRate = satsValue.toString();
			hourlyRateUsd = usdFromSats(satsValue, btcPrice);
		} else {
			hourlyRate = '0';
			hourlyRateUsd = 0;
		}
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
	}

	function cleanInput(value: string): string {
		// Solo permite dígitos, comas y punto
		return value.replace(/[^0-9.,]/g, '');
	}

	// Derived calculations
	const getTotalAmount = $derived(
		bidType === 'HOURLY'
			? parseFloat(hourlyRate || '0') * parseFloat(estimatedHours || '0')
			: parseFloat(amount || '0')
	);

	// Handle payment type change
	function handlePaymentTypeChange(newType: PaymentType) {
		if (bidType === newType) return;

		bidType = newType;

		if (newType === 'HOURLY') {
			// Clear fixed price fields and initialize hourly rate with current USD amount
			amount = '';
			if (usdAmount > 0) {
				// Convert the current USD amount to hourly rate sats
				const satsValue = satsFromUsd(usdAmount, btcPrice);
				hourlyRate = satsValue.toString();
				hourlyRateUsd = usdAmount; // Set the hourly rate USD value
			} else {
				hourlyRate = '';
				hourlyRateUsd = 0;
			}
		} else {
			// Clear hourly rate fields and initialize fixed price with current hourly rate
			hourlyRate = '';
			hourlyRateUsd = 0;
			estimatedHours = '';
			if (parseInt(hourlyRate || '0') > 0 && parseFloat(estimatedHours || '0') > 0) {
				// Convert hourly rate to total amount
				const totalSats = parseInt(hourlyRate) * parseFloat(estimatedHours);
				amount = totalSats.toString();
				usdAmount = usdFromSats(totalSats, btcPrice);
			}
		}
	}

	// Form validation
	function validateBidForm() {
		const errors: Record<string, string> = {};

		// Validate amount for FIXED type
		if (bidType === 'FIXED') {
			if (!amount || amount.trim() === '') {
				errors.amount = $t('bid_form.errors.amount_required');
			} else if (parseFloat(amount) <= 0) {
				errors.amount = $t('bid_form.errors.amount_greater_than_zero');
			}

			// Validate datetime fields for fixed price
			if (!startDate || !endDate) {
				errors.datetime = $t('bid_form.errors.datetime_required');
			} else {
				const start = new Date(`${startDate}T${startTime}`);
				const end = new Date(`${endDate}T${endTime}`);
				if (start >= end) {
					errors.datetime = $t('bid_form.errors.datetime_invalid');
				}
			}
		}

		// Validate hourly rate and estimated hours for HOURLY type
		if (bidType === 'HOURLY') {
			if (!hourlyRate || hourlyRate.trim() === '') {
				errors.hourlyRate = $t('bid_form.errors.hourly_rate_required');
			} else if (parseFloat(hourlyRate) <= 0) {
				errors.hourlyRate = $t('bid_form.errors.hourly_rate_greater_than_zero');
			}

			if (!estimatedHours || estimatedHours.trim() === '') {
				errors.estimatedHours = $t('bid_form.errors.estimated_hours_required');
			} else if (parseFloat(estimatedHours) <= 0) {
				errors.estimatedHours = $t('bid_form.errors.estimated_hours_greater_than_zero');
			}
		}

		// Validate description
		if (!description || description.trim() === '') {
			errors.description = $t('bid_form.errors.description_required');
		} else if (description.trim().length < 50) {
			errors.description = $t('bid_form.errors.description_min_length');
		}

		// Validate proposed approach
		if (!proposedApproach || proposedApproach.trim() === '') {
			errors.proposedApproach = $t('bid_form.errors.proposed_approach_required');
		} else if (proposedApproach.trim().length < 50) {
			errors.proposedApproach = $t('bid_form.errors.proposed_approach_min_length');
		}

		bidFormErrors = errors;
		return Object.keys(errors).length === 0;
	}

	// Helper function to format duration for display
	function formatDurationForDisplay(): string {
		if (bidType === 'FIXED' && startDate && endDate) {
			const start = new Date(`${startDate}T${startTime}`);
			const end = new Date(`${endDate}T${endTime}`);
			const diffMs = end.getTime() - start.getTime();
			const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
			const diffHours = Math.ceil(diffMs / (1000 * 60 * 60));

			if (diffDays > 1) {
				return `${diffDays} days`;
			} else if (diffHours > 1) {
				return `${diffHours} hours`;
			} else {
				return '1 hour';
			}
		}
		return '';
	}

	// Handle form submission
	async function handleBidSubmit() {
		if (!validateBidForm()) {
			return;
		}

		submittingBid = true;

		try {
			// Create bid data structure with explicit type
			const bidData = {
				type: 'bid' as const,
				taskId: taskId,
				taskTitle: taskTitle || 'Untitled Task',
				taskDescription: taskDescription || 'No description available', // Add task description
				amount: getTotalAmount,
				currency: 'USD',
				paymentType: bidType,
				hourlyRate: bidType === 'HOURLY' && hourlyRate ? parseFloat(hourlyRate) : null,
				estimatedHours: bidType === 'HOURLY' && estimatedHours ? parseFloat(estimatedHours) : null,
				description,
				estimatedDuration: bidType === 'FIXED' ? formatDurationForDisplay() : estimatedDuration,
				proposedApproach,
				coverLetter: description,
				timestamp: Date.now(),
				bidId: crypto.randomUUID(),
				// Add new datetime fields
				startDate: bidType === 'FIXED' ? startDate : null,
				endDate: bidType === 'FIXED' ? endDate : null,
				startTime: bidType === 'FIXED' ? startTime : null,
				endTime: bidType === 'FIXED' ? endTime : null
			};

			// Submit bid as encrypted DM using the new system
			await submitBidAsDM(bidData, taskCreatorPubkey);

			// Mark bid as submitted
			bidSubmitted = true;
		} catch (error) {
			console.error('Failed to submit bid:', error);
			bidFormErrors.general = error instanceof Error ? error.message : 'Failed to submit bid';
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
		<form
			class="space-y-4"
			onsubmit={(e) => {
				e.preventDefault();
				handleBidSubmit();
			}}
		>
			<!-- Payment Type -->
			<div class="form-control">
				<label class="label cursor-pointer" for="payment-type-group">
					<span class="label-text">{$t('bid_form.form.payment_type')}</span>
				</label>
				<div
					id="payment-type-group"
					class="flex gap-2 mb-2 max-w-md"
					role="radiogroup"
					aria-label="Payment Type"
				>
					<button
						type="button"
						class="btn flex-1 {bidType === 'FIXED'
							? 'btn-primary'
							: 'btn-outline'}"
						onclick={() => handlePaymentTypeChange('FIXED')}
						role="radio"
						aria-checked={bidType === 'FIXED'}
					>
						{$t('bid_form.form.fixed_price')}
					</button>
					<button
						type="button"
						class="btn flex-1 {bidType === 'HOURLY'
							? 'btn-primary'
							: 'btn-outline'}"
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
								value={formatNumberForInput(usdAmount)}
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
								value={formatNumberForInput(parseInt(amount || '0'))}
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
					{#if parseInt(amount || '0') > 0}
						<span class="label-text-alt text-info mt-1 block">
							{$t('bid_form.form.btc_price')} ${btcPrice.toLocaleString()}
						</span>
					{/if}
				</div>

				<!-- Date and Time Selection for Fixed Price -->
				<div class="form-control">
					<label class="label" for="datetime-range">
						<span class="label-text">{$t('bid_form.form.datetime_range')}</span>
					</label>
					<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
						<div>
							<label class="label-text-alt mb-2 block" for="start-date"
								>{$t('bid_form.form.start_datetime')}</label
							>
							<div class="flex gap-2">
								<input
									type="date"
									id="start-date"
									bind:value={startDate}
									class="input input-bordered flex-1 {bidFormErrors.datetime ? 'input-error' : ''}"
									min={new Date().toISOString().split('T')[0]}
								/>
								<input
									type="time"
									id="start-time"
									bind:value={startTime}
									class="input input-bordered w-32 {bidFormErrors.datetime ? 'input-error' : ''}"
								/>
							</div>
						</div>
						<div>
							<label class="label-text-alt mb-2 block" for="end-date"
								>{$t('bid_form.form.end_datetime')}</label
							>
							<div class="flex gap-2">
								<input
									type="date"
									id="end-date"
									bind:value={endDate}
									class="input input-bordered flex-1 {bidFormErrors.datetime ? 'input-error' : ''}"
									min={startDate || new Date().toISOString().split('T')[0]}
								/>
								<input
									type="time"
									id="end-time"
									bind:value={endTime}
									class="input input-bordered w-32 {bidFormErrors.datetime ? 'input-error' : ''}"
								/>
							</div>
						</div>
					</div>
					{#if bidFormErrors.datetime}
						<div class="label">
							<span class="label-text-alt text-error" id="datetime-error" aria-live="polite"
								>{bidFormErrors.datetime}</span
							>
						</div>
					{/if}
					{#if startDate && endDate}
						<span class="label-text-alt text-info mt-1 block">
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
								value={formatNumberForInput(hourlyRateUsd)}
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
								value={formatNumberForInput(parseInt(hourlyRate || '0'))}
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
					{#if parseInt(hourlyRate || '0') > 0}
						<span class="label-text-alt text-info mt-1 block">
							{$t('bid_form.form.btc_price')} ${btcPrice.toLocaleString()}
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
							${(
								(parseInt(hourlyRate || '0') / 100_000_000) *
								btcPrice *
								parseFloat(estimatedHours || '0')
							).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
						</div>
						<div class="text-sm opacity-70">
							{parseInt(hourlyRate || '0').toLocaleString('en-US')} sats × {parseFloat(
								estimatedHours || '0'
							).toLocaleString('en-US')} hours
						</div>
						<div class="mt-1 text-sm opacity-70">
							≈ {(parseInt(hourlyRate || '0') * parseFloat(estimatedHours || '0')).toLocaleString(
								'en-US'
							)} sats
						</div>
					</div>
				</div>
			{/if}

			<!-- Remove the old estimated duration field since we now have datetime for fixed price -->
			<!-- Estimated Completion Time field removed - not needed for either payment type -->

			<!-- Bid Description -->
			<div class="form-control">
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
				></textarea>
				{#if bidFormErrors.description}
					<div class="label">
						<span class="label-text-alt text-error" id="description-error" aria-live="polite"
							>{bidFormErrors.description}</span
						>
					</div>
				{/if}
			</div>

			<!-- Your approach -->
			<div class="form-control">
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
				></textarea>
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
			<div class="form-control">
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
				></textarea>
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
				class="btn btn-primary mb-16 ml-auto block sm:mb-4"
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
				<div class="alert alert-error alert-outline">
					<span>{bidFormErrors.general}</span>
				</div>
			{/if}
		</form>
	{/if}
</div>

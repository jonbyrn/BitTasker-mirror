<script lang="ts">
	import type { CounterOffer, Currency, PaymentType, SimplifiedTaskBid } from '$lib/types/bid';
	import { formatNumberForInput, satsFromUsd, usdFromSats } from '$lib/utils/helpers/crypto';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';
	import { formatNumberWithTwoDecimals } from '$lib/utils/helpers/currencyFormatter';
	import { t } from 'svelte-i18n';
	import DateInput from '$lib/components/date/DateInput.svelte';

	// Props
	const props = $props<{
		bid: SimplifiedTaskBid;
		onSubmit: (
			bidId: string,
			counterOffer: Omit<CounterOffer, 'id' | 'bidId' | 'createdAt' | 'status'>
		) => Promise<void>;
		onCancel: () => void;
	}>();

	// Form state
	let bidType = $state<PaymentType>('FIXED');
	let amount = $state<string>(''); // This will store sats
	let hourlyRate = $state<string>(''); // This will store sats
	let estimatedHours = $state<string>('');
	let estimatedCompletion = $state('');
	let message = $state('');
	let isSubmitting = $state(false);
	let validationErrors = $state<Record<string, string>>({});

	// New datetime fields for fixed price bids
	let startDateTime = $state<Date | null>(null);
	let endDateTime = $state<Date | null>(null);

	// USDT conversion state
	let usdAmount = $state<number>(0);
	let hourlyRateUsd = $state<number>(0);
	let btcPrice = $state<number>(0);

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

	// Helper function to format duration for display
	function formatDurationForDisplay(): string {
		if (bidType === 'FIXED' && startDateTime && endDateTime) {
			const diffMs = endDateTime.getTime() - startDateTime.getTime();
			const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
			const diffHours = Math.ceil(diffMs / (1000 * 60 * 60));

			if (diffDays > 1) {
				return `${diffDays} ${$t('dashboard.bids.counter_offer.days')}`;
			} else if (diffHours > 1) {
				return `${diffHours} ${$t('dashboard.bids.counter_offer.hours')}`;
			} else {
				return $t('dashboard.bids.counter_offer.one_hour');
			}
		}
		return '';
	}

	// Derived values

	// Form validation
	function validateForm() {
		const errors: Record<string, string> = {};

		// Validate amount for FIXED type
		if (bidType === 'FIXED') {
			if (!amount || amount.trim() === '') {
				errors.amount = $t('dashboard.bids.counter_offer.errors.valid_amount');
			} else if (parseFloat(amount) <= 0) {
				errors.amount = $t('dashboard.bids.counter_offer.errors.amount_greater_than_zero');
			}

			// Validate datetime fields for fixed price
			if (!startDateTime || !endDateTime) {
				errors.datetime = $t('dashboard.bids.counter_offer.errors.start_end_dates_required');
			} else if (startDateTime >= endDateTime) {
				errors.datetime = $t('dashboard.bids.counter_offer.errors.end_date_after_start');
			}
		}

		// Validate hourly rate and estimated hours for HOURLY type
		if (bidType === 'HOURLY') {
			if (!hourlyRate || hourlyRate.trim() === '') {
				errors.hourlyRate = $t('dashboard.bids.counter_offer.errors.valid_hourly_rate');
			} else if (parseFloat(hourlyRate) <= 0) {
				errors.hourlyRate = $t('dashboard.bids.counter_offer.errors.hourly_rate_greater_than_zero');
			}

			if (!estimatedHours || estimatedHours.trim() === '') {
				errors.estimatedHours = $t('dashboard.bids.counter_offer.errors.estimated_hours_required');
			} else if (parseFloat(estimatedHours) <= 0) {
				errors.estimatedHours = $t('dashboard.bids.counter_offer.errors.estimated_hours_greater_than_zero');
			}
		}

		if (!message.trim()) {
			errors.message = $t('dashboard.bids.counter_offer.errors.message_required');
		}

		validationErrors = errors;
		return Object.keys(errors).length === 0;
	}

	// Handle form submission
	async function handleSubmit() {
		if (!validateForm() || !props.bid.id) {
			return;
		}

		isSubmitting = true;

		try {
			const counterOffer = {
				price: {
					amount: getTotalAmount,
					currency: 'SATS' as Currency
				},
				paymentType: bidType,
				hourlyRate: bidType === 'HOURLY' && hourlyRate ? parseFloat(hourlyRate) : null,
				estimatedHours: bidType === 'HOURLY' && estimatedHours ? parseFloat(estimatedHours) : null,
				...(estimatedCompletion
					? {
							timeFrame: {
								estimatedCompletion
							}
						}
					: {}),
				// Add new datetime fields for fixed price
				startDate: bidType === 'FIXED' ? startDateTime : null,
				endDate: bidType === 'FIXED' ? endDateTime : null,
				startTime: bidType === 'FIXED' ? startDateTime : null,
				endTime: bidType === 'FIXED' ? endDateTime : null,
				message,
				proposedBy: 'current-user-id' // This would come from user store
			};

			await props.onSubmit(props.bid.id, counterOffer);
		} catch (error) {
			console.error('Failed to submit counter offer:', error);
		} finally {
			isSubmitting = false;
		}
	}

	// Initialize BTC price on mount
	$effect(() => {
		fetchBtcPrice();
	});
</script>

<div class="bg-base-100 mx-auto max-h-[80vh] max-w-2xl overflow-y-auto rounded-lg shadow-lg">
	<!-- Header with close button -->
	<div
		class="bg-base-100 border-base-300 sticky top-0 z-10 flex items-center justify-between p-4"
	>
		<h4 class="font-bold">{$t('dashboard.bids.counter_offer.title')}</h4>
		<button
			type="button"
			class="btn btn-ghost btn-sm btn-circle"
			onclick={props.onCancel}
			aria-label={$t('dashboard.bids.counter_offer.close_dialog')}
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
	<div class="px-4">
		<!-- Original bid amount display -->
		<div class="mb-4 flex items-center justify-between">
			<div>
				<span class="text-sm font-medium text-base-content/70">{$t('dashboard.bids.counter_offer.original_bid_amount')}</span>
			</div>
			<div class="text-right">
				<div class="text-lg font-bold">
					${formatNumberWithTwoDecimals(props.bid.amount)}
				</div>
				<div class="text-base-content/60 text-sm">
					{satsFromUsd(props.bid.amount, btcPrice)}
				</div>
			</div>
		</div>

		<form
			class="space-y-6"
			onsubmit={(e) => {
				e.preventDefault();
				handleSubmit();
			}}
		>
		<!-- Payment Type -->
		<!-- 	<div class="form-control">
			<label class="label cursor-pointer" for="payment-type-group">
				<span class="label-text">Payment Type</span>
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
					Fixed Price
				</button>
				<button
					type="button"
					class="btn flex-1 {bidType === 'HOURLY' ? 'btn-primary' : 'btn-outline'}"
					onclick={() => handlePaymentTypeChange('HOURLY')}
					role="radio"
					aria-checked={bidType === 'HOURLY'}
				>
					Hourly Rate
				</button>
			</div>
		</div> -->

		{#if bidType === 'FIXED'}
			<!-- Fixed price counter offer amount - USD and Sats -->
			<div class="form-control">
				<label class="label" for="counter-amount">
					<span class="label-text font-medium">{$t('dashboard.bids.counter_offer.counter_offer_amount')}</span>
				</label>
				<div class="flex gap-2">
					<div class="relative flex-1">
						<span class="text-base-content/70 absolute top-1/2 left-3 z-9 -translate-y-1/2">$</span>
						<input
							type="text"
							id="counter-usd"
							value={formatNumberForInput(props.bid.amount)}
							onchange={handleUsdChange}
							oninput={handleUsdChange}
							class="input input-bordered w-full pl-7 {validationErrors.amount
								? 'input-error'
								: ''}"
							placeholder="0.00"
							min="0"
						/>
					</div>
					<div class="relative flex-1">
						<span class="text-base-content/70 absolute top-1/2 right-3 z-9 -translate-y-1/2"
							>{$t('dashboard.bids.counter_offer.sats')}</span
						>
						<input
							type="text"
							id="counter-sats"
							value={formatNumberForInput(Math.round((props.bid.amount / btcPrice) * 100_000_000))}
							onchange={handleSatsChange}
							oninput={handleSatsChange}
							class="input input-bordered w-full pr-12 {validationErrors.amount
								? 'input-error'
								: ''}"
							placeholder="0"
							min="0"
						/>
					</div>
				</div>
				{#if validationErrors.amount}
					<div class="label">
						<span id="amount-error" class="label-text-alt text-error"
							>{validationErrors.amount}</span
						>
					</div>
				{/if}
				{#if parseInt(amount || '0') > 0}
					<span class="label-text-alt text-info mt-1 block">
						{$t('dashboard.bids.counter_offer.btc_price')} ${Math.round(btcPrice).toLocaleString()}
					</span>
				{/if}
			</div>

			<!-- Date and Time Selection for Fixed Price -->
			<div class="form-control">
				<label class="label" for="datetime-range">
					<span class="label-text">{$t('dashboard.bids.counter_offer.date_time_range')}</span>
				</label>
				<div class="flex flex-col gap-4">
					<DateInput
						bind:value={startDateTime}
						type="datetime"
						labelKey="dashboard.bids.counter_offer.airdatepicker.select_start_datetime"
						placeholderKey="dashboard.bids.counter_offer.airdatepicker.select_start_datetime"
						minDate={new Date()}
						maxDate={undefined}
						timeStep={15}
						onChange={(date: Date | null) => startDateTime = date}
						className={validationErrors.datetime ? 'input-error' : ''}
					/>
					<DateInput
						bind:value={endDateTime}
						type="datetime"
						labelKey="dashboard.bids.counter_offer.airdatepicker.select_end_datetime"
						placeholderKey="dashboard.bids.counter_offer.airdatepicker.select_end_datetime"
						minDate={startDateTime || new Date()}
						maxDate={undefined}
						timeStep={15}
						onChange={(date: Date | null) => endDateTime = date}
						className={validationErrors.datetime ? 'input-error' : ''}
					/>
				</div>
				{#if validationErrors.datetime}
					<div class="label">
						<span id="datetime-error" class="label-text-alt text-error"
							>{validationErrors.datetime}</span
						>
					</div>
				{/if}
				{#if startDateTime && endDateTime}
					<span class="label-text-alt text-info mt-1 block">
						{$t('dashboard.bids.counter_offer.duration')} {formatDurationForDisplay()}
					</span>
				{/if}
			</div>
		{:else}
			<!-- Hourly rate counter offer details -->
			<div class="form-control">
				<label class="label" for="hourly-rate">
					<span class="label-text font-medium">{$t('dashboard.bids.counter_offer.hourly_rate')}</span>
				</label>
				<div class="flex gap-2">
					<div class="relative flex-1">
						<span class="text-base-content/70 absolute top-1/2 left-3 z-10 -translate-y-1/2">$</span
						>
						<input
							type="text"
							id="hourly-rate-usd"
							value={formatNumberForInput(hourlyRateUsd)}
							onchange={handleHourlyRateUsdChange}
							oninput={handleHourlyRateUsdChange}
							class="input input-bordered w-full pl-7 {validationErrors.hourlyRate
								? 'input-error'
								: ''}"
							placeholder="0.00"
							min="0"
						/>
					</div>
					<div class="relative flex-1">
						<span class="text-base-content/70 absolute top-1/2 right-3 z-10 -translate-y-1/2"
							>{$t('dashboard.bids.counter_offer.sats')}</span
						>
						<input
							type="text"
							id="hourly-rate-sats"
							value={formatNumberForInput(parseInt(hourlyRate || '0'))}
							onchange={handleHourlyRateSatsChange}
							oninput={handleHourlyRateSatsChange}
							class="input input-bordered w-full pr-12 {validationErrors.hourlyRate
								? 'input-error'
								: ''}"
							placeholder="0"
							min="0"
						/>
					</div>
				</div>
				{#if validationErrors.hourlyRate}
					<div class="label">
						<span id="hourly-rate-error" class="label-text-alt text-error"
							>{validationErrors.hourlyRate}</span
						>
					</div>
				{/if}
				{#if parseInt(hourlyRate || '0') > 0}
					<span class="label-text-alt text-info mt-1 block">
						{$t('dashboard.bids.counter_offer.btc_price')} ${btcPrice.toLocaleString()}
					</span>
				{/if}
			</div>

			<!-- Estimated Hours -->
			<div class="form-control">
				<label class="label" for="estimated-hours">
					<span class="label-text font-medium">{$t('dashboard.bids.counter_offer.estimated_hours')}</span>
				</label>
				<input
					id="estimated-hours"
					type="text"
					class="input input-bordered w-full"
					class:input-error={validationErrors.estimatedHours}
					aria-invalid={validationErrors.estimatedHours ? 'true' : undefined}
					aria-describedby={validationErrors.estimatedHours ? 'estimated-hours-error' : undefined}
					placeholder="e.g., 8, 16, 24"
					min="1"
					step="1"
					value={estimatedHours}
					onchange={handleEstimatedHoursChange}
					oninput={handleEstimatedHoursChange}
				/>
				{#if validationErrors.estimatedHours}
					<div class="label">
						<span id="estimated-hours-error" class="label-text-alt text-error"
							>{validationErrors.estimatedHours}</span
						>
					</div>
				{/if}
			</div>

			<!-- Estimated total for hourly rate -->
			<div class="form-control">
				<label class="label" for="total-estimated-amount">
					<span class="label-text font-medium">{$t('dashboard.bids.counter_offer.total_estimated_amount')}</span>
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
						{parseInt(hourlyRate || '0').toLocaleString('en-US')} {$t('dashboard.bids.counter_offer.sats')} × {parseFloat(
							estimatedHours || '0'
						).toLocaleString('en-US')} {$t('dashboard.bids.counter_offer.hours')}
					</div>
					<div class="mt-1 text-sm opacity-70">
						≈ {(parseInt(hourlyRate || '0') * parseFloat(estimatedHours || '0')).toLocaleString(
							'en-US'
						)} {$t('dashboard.bids.counter_offer.sats')}
					</div>
				</div>
			</div>
		{/if}

		<!-- Message -->
		<div class="form-control flex flex-col">
			<label class="label" for="counter-message">
				<span class="label-text">{$t('dashboard.bids.counter_offer.message')}</span>
			</label>
			<textarea
				id="counter-message"
				class="textarea textarea-bordered h-12 w-full"
				class:textarea-error={validationErrors.message}
				oninput={(e) => (message = (e.target as HTMLTextAreaElement).value)}
				placeholder={$t('dashboard.bids.counter_offer.message_placeholder')}
				aria-invalid={validationErrors.message ? 'true' : undefined}
				aria-describedby={validationErrors.message ? 'message-error' : undefined}
				>{message}</textarea
			>
			{#if validationErrors.message}
				<label class="label" for="counter-message">
					<span id="message-error" class="label-text-alt text-error"
						>{validationErrors.message}</span
					>
				</label>
			{/if}
		</div>

		<!-- Submit Buttons - Mobile: Stacked, Desktop: Side by side -->
		<div
			class="bg-base-100 border-base-300 sticky bottom-0 flex w-full flex-col justify-end gap-3 py-4 sm:flex-row md:py-2"
		>
			<button
				type="button"
				class="btn btn-error"
				onclick={props.onCancel}
				disabled={isSubmitting}
			>
				{$t('dashboard.bids.counter_offer.cancel')}
			</button>
			<button type="submit" class="btn btn-primary" disabled={isSubmitting}>
				<span class="hidden sm:inline">{isSubmitting ? $t('dashboard.bids.counter_offer.submitting') : $t('dashboard.bids.counter_offer.send_counter_offer')}</span>
				<span class="sm:hidden">{isSubmitting ? $t('dashboard.bids.counter_offer.submitting') : $t('dashboard.bids.counter_offer.send_offer')}</span>
			</button>
		</div>
	</form>
	</div>
</div>

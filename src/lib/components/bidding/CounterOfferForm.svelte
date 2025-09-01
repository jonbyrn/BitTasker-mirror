<script lang="ts">
	import type { CounterOffer, Currency, TaskBid, PaymentType } from '$lib/types/bid';
	import { formatNumberForInput, satsFromUsd, usdFromSats } from '$lib/utils/helpers/crypto';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';
	import { formatNumberWithTwoDecimals } from '$lib/stores/wallet.store';
	
	// Props
	const props = $props<{
		bid: TaskBid;
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
	let startDate = $state<string>('');
	let endDate = $state<string>('');
	let startTime = $state<string>('09:00');
	let endTime = $state<string>('17:00');

	// USDT conversion state
	let usdAmount = $state<number>(0);
	let hourlyRateUsd = $state<number>(0);
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

	// Derived values

	// Form validation
	function validateForm() {
		const errors: Record<string, string> = {};

		// Validate amount for FIXED type
		if (bidType === 'FIXED') {
			if (!amount || amount.trim() === '') {
				errors.amount = 'Please enter a valid amount';
			} else if (parseFloat(amount) <= 0) {
				errors.amount = 'Please enter an amount greater than zero';
			}

			// Validate datetime fields for fixed price
			if (!startDate || !endDate) {
				errors.datetime = 'Start and end dates are required';
			} else {
				const start = new Date(`${startDate}T${startTime}`);
				const end = new Date(`${endDate}T${endTime}`);
				if (start >= end) {
					errors.datetime = 'End date must be after start date';
				}
			}
		}

		// Validate hourly rate and estimated hours for HOURLY type
		if (bidType === 'HOURLY') {
			if (!hourlyRate || hourlyRate.trim() === '') {
				errors.hourlyRate = 'Please enter a valid hourly rate';
			} else if (parseFloat(hourlyRate) <= 0) {
				errors.hourlyRate = 'Please enter an hourly rate greater than zero';
			}

			if (!estimatedHours || estimatedHours.trim() === '') {
				errors.estimatedHours = 'Please enter estimated hours';
			} else if (parseFloat(estimatedHours) <= 0) {
				errors.estimatedHours = 'Please enter estimated hours greater than zero';
			}
		}

		if (!message.trim()) {
			errors.message = 'Please provide a message';
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
				startDate: bidType === 'FIXED' ? startDate : null,
				endDate: bidType === 'FIXED' ? endDate : null,
				startTime: bidType === 'FIXED' ? startTime : null,
				endTime: bidType === 'FIXED' ? endTime : null,
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

<div class="bg-base-100 mx-auto max-w-2xl rounded-lg p-4 shadow-lg">
	<div class="flex items-center justify-between">
		<div>
			<h4 class="mb-4 font-bold">Create Counter Offer</h4>
		</div>
		<div>
			<div class="flex items-center justify-between">
				<div class="text-right">
					<div class="text-lg font-bold">
						${formatNumberWithTwoDecimals(props.bid.amount)}

						<div class="text-base-content/60 text-sm">
							{satsFromUsd(props.bid.amount, btcPrice)}
						</div>
					</div>
				</div>
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
					<span class="label-text font-medium">Counter Offer Amount</span>
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
							>Sats</span
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
						BTC Price: ${btcPrice.toLocaleString()}
					</span>
				{/if}
			</div>

			<!-- Date and Time Selection for Fixed Price -->
			<div class="form-control">
				<label class="label" for="datetime-range">
					<span class="label-text">Date and Time Range</span>
				</label>
				<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
					<div>
						<label class="label-text-alt mb-2 block" for="start-date">Start Date & Time</label>
						<div class="flex gap-2">
							<input
								type="date"
								id="start-date"
								bind:value={startDate}
								class="input input-bordered flex-1 {validationErrors.datetime ? 'input-error' : ''}"
								min={new Date().toISOString().split('T')[0]}
							/>
							<input
								type="time"
								id="start-time"
								bind:value={startTime}
								class="input input-bordered w-32 {validationErrors.datetime ? 'input-error' : ''}"
							/>
						</div>
					</div>
					<div>
						<label class="label-text-alt mb-2 block" for="end-date">End Date & Time</label>
						<div class="flex gap-2">
							<input
								type="date"
								id="end-date"
								bind:value={endDate}
								class="input input-bordered flex-1 {validationErrors.datetime ? 'input-error' : ''}"
								min={startDate || new Date().toISOString().split('T')[0]}
							/>
							<input
								type="time"
								id="end-time"
								bind:value={endTime}
								class="input input-bordered w-32 {validationErrors.datetime ? 'input-error' : ''}"
							/>
						</div>
					</div>
				</div>
				{#if validationErrors.datetime}
					<div class="label">
						<span id="datetime-error" class="label-text-alt text-error"
							>{validationErrors.datetime}</span
						>
					</div>
				{/if}
				{#if startDate && endDate}
					<span class="label-text-alt text-info mt-1 block">
						Duration: {formatDurationForDisplay()}
					</span>
				{/if}
			</div>
		{:else}
			<!-- Hourly rate counter offer details -->
			<div class="form-control">
				<label class="label" for="hourly-rate">
					<span class="label-text font-medium">Hourly Rate</span>
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
							>Sats</span
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
						BTC Price: ${btcPrice.toLocaleString()}
					</span>
				{/if}
			</div>

			<!-- Estimated Hours -->
			<div class="form-control">
				<label class="label" for="estimated-hours">
					<span class="label-text font-medium">Estimated Hours</span>
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
					<span class="label-text font-medium">Total Estimated Amount</span>
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

		<!-- Message -->
		<div class="form-control flex flex-col">
			<label class="label" for="counter-message">
				<span class="label-text">Message</span>
			</label>
			<textarea
				id="counter-message"
				class="textarea textarea-bordered h-16 w-full"
				class:textarea-error={validationErrors.message}
				oninput={(e) => (message = (e.target as HTMLTextAreaElement).value)}
				placeholder="Explain your counter offer conditions and why you're proposing this amount"
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

		<!-- Submit Buttons -->
		<div class="flex justify-end space-x-3 pt-4">
			<button
				type="button"
				class="btn btn-outline"
				onclick={props.onCancel}
				disabled={isSubmitting}
			>
				Cancel
			</button>
			<button type="submit" class="btn btn-primary" disabled={isSubmitting}>
				{isSubmitting ? 'Submitting...' : 'Send Counter Offer'}
			</button>
		</div>
	</form>
</div>

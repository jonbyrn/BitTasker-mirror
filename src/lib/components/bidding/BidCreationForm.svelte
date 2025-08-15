<script lang="ts">
	import type { PaymentType } from '$lib/types/bid';
	import { t } from 'svelte-i18n';
	import { fly } from 'svelte/transition';
	import { submitBidAsDM } from '$lib/utils/nostr-bid';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';
	import { formatNumberForInput, satsFromUsd, usdFromSats } from '$lib/utils/helpers/crypto';
	import type { NostrBid } from '$lib/utils/nostr-bid'; // Import from nostr-bid.ts where it's defined

	// Props
	const { taskId, onClose, taskCreatorPubkey } = $props<{ 
		taskId: string; 
		onClose: () => void;
		taskCreatorPubkey: string; // Required for sending DM
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

	// USDT conversion state
	let usdAmount = $state<number>(0);
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
			const satsValue = satsFromUsd(usdValue, btcPrice);
			hourlyRate = satsValue.toString();
		} else {
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
		} else {
			hourlyRate = '0';
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

		// Validate estimated duration
		if (!estimatedDuration || estimatedDuration.trim() === '') {
			errors.estimatedDuration = $t('bid_form.errors.estimated_duration_required');
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

	// Handle form submission
	async function handleBidSubmit() {
		if (!validateBidForm()) {
			return;
		}

		submittingBid = true;

		try {
			// Create bid data structure with explicit type
			const bidData: NostrBid = {
				type: 'bid' as const, // Use const assertion to fix type issue
				taskId: taskId,
				amount: getTotalAmount,
				currency: 'SATS',
				paymentType: bidType,
				hourlyRate: bidType === 'HOURLY' ? parseFloat(hourlyRate) : undefined,
				estimatedHours: bidType === 'HOURLY' ? parseFloat(estimatedHours) : undefined,
				description,
				estimatedDuration,
				proposedApproach,
				coverLetter: description,
				timestamp: Date.now(),
				bidId: crypto.randomUUID() // Generate unique bid ID
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

<div class="bg-base-100 relative mx-auto rounded-lg shadow-lg">
	<h2 class="mb-6 text-2xl font-bold">{$t('bid_form.title')}</h2>

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
					class="tabs tabs-boxed bg-base-200 mb-2 rounded-lg p-2"
					role="radiogroup"
					aria-label="Payment Type"
				>
					<button
						type="button"
						class="tab flex-1 rounded-md {bidType === 'FIXED'
							? 'tab-active bg-primary text-primary-content font-medium'
							: 'hover:bg-base-300'}"
						onclick={() => (bidType = 'FIXED')}
						role="radio"
						aria-checked={bidType === 'FIXED'}
					>
						{$t('bid_form.form.fixed_price')}
					</button>
					<button
						type="button"
						class="tab flex-1 rounded-md {bidType === 'HOURLY'
							? 'tab-active bg-primary text-primary-content font-medium'
							: 'hover:bg-base-300'}"
						onclick={() => (bidType = 'HOURLY')}
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
								value={formatNumberForInput(usdAmount)}
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
						type="number"
						class="input input-bordered w-full"
						class:input-error={bidFormErrors.estimatedHours}
						aria-invalid={bidFormErrors.estimatedHours ? 'true' : undefined}
						aria-describedby={bidFormErrors.estimatedHours ? 'estimated-hours-error' : undefined}
						placeholder={$t('bid_form.form.hours_placeholder')}
						min="1"
						step="1"
						bind:value={estimatedHours}
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
							).toFixed(2)}
						</div>
						<div class="text-sm opacity-70">
							{parseInt(hourlyRate || '0')} sats × {estimatedHours || '0'} hours
						</div>
						<div class="mt-1 text-sm opacity-70">
							≈ {parseInt(hourlyRate || '0') * parseInt(estimatedHours || '0')} sats
						</div>
					</div>
				</div>
			{/if}

			<!-- Estimated completion time -->
			<div class="form-control">
				<label class="label" for="estimated-duration">
					<span class="label-text">{$t('bid_form.form.estimated_duration.label')}</span>
				</label>
				<input
					id="estimated-duration"
					type="text"
					class="input input-bordered w-full {bidFormErrors.estimatedDuration ? 'input-error' : ''}"
					class:input-error={bidFormErrors.estimatedDuration}
					placeholder={$t('bid_form.form.estimated_duration.placeholder')}
					aria-invalid={bidFormErrors.estimatedDuration ? 'true' : undefined}
					aria-describedby={bidFormErrors.estimatedDuration
						? 'estimated-duration-error'
						: undefined}
					bind:value={estimatedDuration}
				/>
				{#if bidFormErrors.estimatedDuration}
					<div class="label">
						<span class="label-text-alt text-error" id="estimated-duration-error" aria-live="polite"
							>{bidFormErrors.estimatedDuration}</span
						>
					</div>
				{/if}
			</div>

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
				class="btn btn-primary ml-auto block mb-16 sm:mb-4" 
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

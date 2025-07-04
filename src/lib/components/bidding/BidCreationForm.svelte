<script lang="ts">
	import type { CreateBidParams, Currency, Milestone, PaymentType } from '$lib/types/bid';
	import { AxiosError } from 'axios';
	import { linear } from 'svelte/easing';
	import { t } from '$lib/stores/i18n.store';
	import { fly, slide } from 'svelte/transition';
	import bidService from '$lib/api/services/bid.service';
	import DatePicker from '$lib/components/date/DatePicker.svelte';

	// Props
	const { taskId, onClose } = $props<{ taskId: number; onClose: () => void }>();

	// Form state
	let bidType = $state<PaymentType>('FIXED');
	let amount = $state<string>('');
	let currency = $state<Currency>('BTC');
	let hourlyRate = $state<string>('');
	let estimatedHours = $state<string>('');
	let description = $state('');
	let estimatedDuration = $state('');
	let proposedApproach = $state('');
	let coverLetter = $state('');
	let milestones = $state<Partial<Milestone>[]>([
		{
			title: '',
			description: '',
			amount: 0,
			deliverables: '',
			sequence: 1,
			dueDate: '',
			estimatedHours: 0
		}
	]);
	let submittingBid = $state(false);
	let bidFormErrors = $state<Record<string, string>>({});
	let bidSubmitted = $state(false);

	// Currency options
	const currencyOptions: Currency[] = ['BTC', 'L-BTC', 'USD', 'LN'];

	// Dynamic array handling
	function addItem(array: Partial<Milestone>[], index: number) {
		const newArray = [...array];
		newArray.splice(index + 1, 0, {
			title: '',
			description: '',
			amount: 0,
			deliverables: '',
			sequence: array.length + 1,
			dueDate: '',
			estimatedHours: 0
		});
		return newArray;
	}

	function removeItem(array: Partial<Milestone>[], index: number) {
		if (array.length > 1) {
			const newArray = [...array];
			newArray.splice(index, 1);
			// Update sequence numbers
			return newArray.map((item, i) => ({
				...item,
				sequence: i + 1
			}));
		} else {
			const newArray = [...array];
			newArray[0] = {
				title: '',
				description: '',
				amount: 0,
				deliverables: '',
				sequence: 1,
				dueDate: '',
				estimatedHours: 0
			};
			return newArray;
		}
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

		if (!amount && bidType === 'FIXED') {
			errors.amount = 'Please enter a bid amount';
		} else if (bidType === 'FIXED' && parseFloat(amount) <= 0) {
			errors.amount = 'Bid amount must be greater than 0';
		}

		if (bidType === 'HOURLY') {
			if (!hourlyRate) {
				errors.hourlyRate = 'Please enter an hourly rate';
			} else if (parseFloat(hourlyRate) <= 0) {
				errors.hourlyRate = 'Hourly rate must be greater than 0';
			}

			if (!estimatedHours) {
				errors.estimatedHours = 'Please enter estimated hours';
			} else if (parseFloat(estimatedHours) <= 0) {
				errors.estimatedHours = 'Estimated hours must be greater than 0';
			}
		}

		if (!description.trim()) {
			errors.description = 'Please enter a description for your bid';
		} else if (description.length < 50) {
			errors.description = 'Description should be at least 50 characters';
		}

		if (!estimatedDuration.trim()) {
			errors.estimatedDuration = 'Please provide an estimated completion time';
		}

		if (!proposedApproach.trim()) {
			errors.proposedApproach = 'Please describe your approach to this task';
		} else if (proposedApproach.length < 50) {
			errors.proposedApproach = 'Your approach description should be at least 50 characters';
		}

		bidFormErrors = errors;
		return Object.keys(errors).length === 0;
	}

	// Handle form submission
	async function handleBidSubmit() {
		if (!validateBidForm()) return;

		submittingBid = true;

		try {
			// Filter out empty items
			const filteredMilestones = milestones
				.filter(
					(m) =>
						m.title?.trim() !== '' || m.description?.trim() !== '' || m.deliverables?.trim() !== ''
				)
				.map((m, i) => ({
					title: m.title || `Milestone ${i + 1}`,
					description: m.description || '',
					amount: m.amount || 0,
					deliverables: m.deliverables || '',
					sequence: m.sequence || i + 1,
					dueDate: m.dueDate || '',
					estimatedHours: m.estimatedHours || 0
				}));

			const newBid: Partial<CreateBidParams> = {
				taskId,
				description,
				estimatedDuration,
				proposedApproach,
				coverLetter: description, // Using description as coverLetter as per form
				paymentType: bidType,
				currency,
				visibility: 'PUBLIC',
				responseTime: 24, // Default response time in hours
				milestones: filteredMilestones.length > 0 ? filteredMilestones : undefined
			};

			if (bidType === 'FIXED') {
				newBid.amount = getTotalAmount;
			} else {
				newBid.amount = getTotalAmount;
				newBid.hourlyRate = parseFloat(hourlyRate);
				newBid.estimatedHours = parseFloat(estimatedHours);
			}

			// Create bid through service
			await bidService.createBid(newBid as CreateBidParams);

			// Mark bid as submitted
			bidSubmitted = true;
		} catch (error) {
			console.error('Failed to submit bid:', error);
			if (error instanceof AxiosError && error.response && error.response?.data?.message) {
				const message = error.response.data.message;
				if (Array.isArray(message)) bidFormErrors.general = message[0];
				else bidFormErrors.general = message;
			} else if (error instanceof Error) bidFormErrors.general = error.message;
			else bidFormErrors.general = 'Failed to submit bid. Please try again.';
		} finally {
			submittingBid = false;
		}
	}
</script>

<div class="bg-base-100 relative mx-auto rounded-lg opacity-30 shadow-lg">
	<h2 class="mb-6 text-2xl font-bold">Place your bid (Coming Soon)</h2>

	{#if bidSubmitted}
		<div
			class="p-8 text-center"
			in:fly={{
				duration: 200,
				easing: linear,
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
			<h3 class="mb-2 text-xl font-semibold">Bid Submitted Successfully!</h3>
			<p class="text-base-content/70 mb-4">
				Your bid has been submitted successfully. The task requester will review your bid and may
				contact you with questions or a counter-offer.
			</p>
			<div class="flex justify-center gap-4">
				<button class="btn btn-primary" onclick={onClose}>Close</button>
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
					<span class="label-text">Payment Type</span>
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
						Fixed Price
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
						Hourly Rate
					</button>
				</div>
			</div>

			{#if bidType === 'FIXED'}
				<!-- Fixed price bid amount -->
				<div class="form-control">
					<label class="label" for="bid-amount">
						<span class="label-text">Your Bid Amount ({currency})</span>
					</label>
					<div class="grid grid-cols-4 gap-2">
						<select
							id="bid-currency"
							class="select select-bordered col-span-1"
							bind:value={currency}
						>
							{#each currencyOptions as option}
								<option value={option}>{option}</option>
							{/each}
						</select>
						<input
							id="bid-amount"
							type="number"
							class="input input-bordered col-span-3 w-full"
							class:input-error={bidFormErrors.amount}
							placeholder="0.00123"
							min="0.00001"
							step="0.00001"
							aria-describedby={bidFormErrors.amount ? 'amount-error' : undefined}
							aria-invalid={bidFormErrors.amount ? 'true' : undefined}
							bind:value={amount}
						/>
					</div>
					{#if bidFormErrors.amount}
						<div class="label">
							<span class="label-text-alt text-error" id="amount-error" aria-live="polite"
								>{bidFormErrors.amount}</span
							>
						</div>
					{/if}
				</div>
			{:else}
				<div class="form-control">
					<!-- Hourly rate bid details -->
					<div class="grid grid-cols-2 gap-4">
						<div class="form-control">
							<label class="label" for="hourly-rate">
								<span class="label-text">Hourly Rate ({currency})</span>
							</label>
							<div class="grid grid-cols-4 gap-2">
								<select
									id="hourly-currency"
									class="select select-bordered col-span-1"
									bind:value={currency}
								>
									{#each currencyOptions as option}
										<option value={option}>{option}</option>
									{/each}
								</select>
								<input
									id="hourly-rate"
									type="number"
									class="input input-bordered col-span-3 w-full {bidFormErrors.hourlyRate
										? 'input-error'
										: ''}"
									placeholder="0.0001"
									min="0.00001"
									step="0.00001"
									bind:value={hourlyRate}
								/>
							</div>
							{#if bidFormErrors.hourlyRate}
								<div class="label">
									<span class="label-text-alt text-error" id="hourly-rate-error" aria-live="polite"
										>{bidFormErrors.hourlyRate}</span
									>
								</div>
							{/if}
						</div>
						<div class="form-control">
							<label class="label" for="estimated-hours">
								<span class="label-text">Estimated Hours</span>
							</label>
							<input
								id="estimated-hours"
								type="number"
								class="input input-bordered w-full"
								class:input-error={bidFormErrors.estimatedHours}
								aria-invalid={bidFormErrors.estimatedHours ? 'true' : undefined}
								aria-describedby={bidFormErrors.estimatedHours
									? 'estimated-hours-error'
									: undefined}
								placeholder="10"
								min="1"
								step="1"
								bind:value={estimatedHours}
							/>
							{#if bidFormErrors.estimatedHours}
								<div class="label">
									<span
										class="label-text-alt text-error"
										id="estimated-hours-error"
										aria-live="polite">{bidFormErrors.estimatedHours}</span
									>
								</div>
							{/if}
						</div>
					</div>

					<!-- Estimated total for hourly rate -->
					<div class="form-control">
						<label class="label" for="total-estimated-amount">
							<span class="label-text">Total Estimated Amount</span>
						</label>
						<div class="bg-base-200 rounded-md p-3">
							<div class="text-lg font-semibold">
								{currency}
								{getTotalAmount.toFixed(8)}
							</div>
							<div class="text-sm opacity-70">
								{currency}
								{parseFloat(hourlyRate || '0').toFixed(8)} × {estimatedHours || '0'} hours
							</div>
						</div>
					</div>
				</div>
			{/if}

			<!-- Estimated completion time -->
			<div class="form-control">
				<label class="label" for="estimated-duration">
					<span class="label-text">{$t('bid.form.estimated_duration.label')}</span>
				</label>
				<input
					id="estimated-duration"
					type="text"
					class="input input-bordered w-full {bidFormErrors.estimatedDuration ? 'input-error' : ''}"
					class:input-error={bidFormErrors.estimatedDuration}
					placeholder={$t('bid.form.estimated_duration.placeholder')}
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
					<span class="label-text">{$t('bid.form.description.label')}</span>
				</label>
				<textarea
					id="bid-description"
					class="textarea textarea-bordered h-24 w-full {bidFormErrors.description
						? 'textarea-error'
						: ''}"
					placeholder={$t('bid.form.description.placeholder')}
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
					<span class="label-text">{$t('bid.form.approach.label')}</span>
				</label>
				<textarea
					id="proposed-approach"
					class="textarea textarea-bordered h-24 w-full {bidFormErrors.proposedApproach
						? 'textarea-error'
						: ''}"
					class:textarea-error={bidFormErrors.proposedApproach}
					placeholder={$t('bid.form.approach.placeholder')}
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
					<span class="label-text">{$t('bid.form.cover_letter.label')}</span>
				</label>
				<textarea
					id="bid-cover-letter"
					class="textarea textarea-bordered h-24 w-full {bidFormErrors.coverLetter
						? 'textarea-error'
						: ''}"
					placeholder={$t('bid.form.cover_letter.placeholder')}
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

			<!-- Milestones -->
			<div class="form-control">
				<div class="flex items-center justify-between">
					<label class="label" id="milestones-label" for="milestones-container">
						<span class="label-text font-medium">Milestones (Optional)</span>
					</label>
					<button
						type="button"
						class="btn btn-sm btn-outline"
						onclick={() => (milestones = addItem(milestones, milestones.length - 1))}
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="mr-1 h-4 w-4"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M12 6v6m0 0v6m0-6h6m-6 0H6"
							/>
						</svg>
						Add Milestone
					</button>
				</div>

				<div id="milestones-container" class="border-base-300 bg-base-100 rounded-lg border p-1">
					{#each milestones as milestone, i}
						<div
							class="border-base-200 mb-4 rounded-md border p-4"
							transition:slide={{ duration: 200 }}
						>
							<div class="mb-2 flex items-center justify-between">
								<h3 class="text-lg font-medium">Milestone {i + 1}</h3>
								<button
									type="button"
									class="btn btn-circle btn-ghost btn-sm"
									onclick={() => (milestones = removeItem(milestones, i))}
									aria-label="Remove milestone"
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										class="h-4 w-4"
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

							<!-- Title field -->
							<div class="form-control">
								<label class="label" for={`milestone-title-${i}`}>
									<span class="label-text">Title</span>
								</label>
								<input
									id={`milestone-title-${i}`}
									type="text"
									class="input input-bordered w-full"
									value={milestone.title}
									oninput={(e) => {
										const newMilestones = [...milestones];
										newMilestones[i] = {
											...newMilestones[i],
											title: (e.target as HTMLInputElement).value
										};
										milestones = newMilestones;
									}}
									placeholder="e.g., Initial Design"
								/>
							</div>

							<!-- Description field -->
							<div class="form-control mt-2">
								<label class="label" for={`milestone-description-${i}`}>
									<span class="label-text">Description</span>
								</label>
								<textarea
									id={`milestone-description-${i}`}
									class="textarea textarea-bordered h-20 w-full"
									value={milestone.description}
									oninput={(e) => {
										const newMilestones = [...milestones];
										newMilestones[i] = {
											...newMilestones[i],
											description: (e.target as HTMLTextAreaElement).value
										};
										milestones = newMilestones;
									}}
									placeholder="Describe what this milestone involves"
								></textarea>
							</div>

							<div class="mt-2 grid grid-cols-2 gap-4">
								<!-- Amount field -->
								<div class="form-control">
									<label class="label" for={`milestone-amount-${i}`}>
										<span class="label-text">Amount ({currency})</span>
									</label>
									<input
										id={`milestone-amount-${i}`}
										type="number"
										min="0"
										step="0.01"
										class="input input-bordered w-full"
										value={milestone.amount}
										oninput={(e) => {
											const newMilestones = [...milestones];
											newMilestones[i] = {
												...newMilestones[i],
												amount: parseFloat((e.target as HTMLInputElement).value) || 0
											};
											milestones = newMilestones;
										}}
									/>
								</div>

								<!-- Estimated Hours field -->
								<div class="form-control">
									<label class="label" for={`milestone-hours-${i}`}>
										<span class="label-text">Estimated Hours</span>
									</label>
									<input
										id={`milestone-hours-${i}`}
										type="number"
										min="0"
										step="0.5"
										class="input input-bordered w-full"
										value={milestone.estimatedHours}
										oninput={(e) => {
											const newMilestones = [...milestones];
											newMilestones[i] = {
												...newMilestones[i],
												estimatedHours: parseFloat((e.target as HTMLInputElement).value) || 0
											};
											milestones = newMilestones;
										}}
									/>
								</div>
							</div>

							<div class="mt-2 grid w-full gap-4 sm:grid-cols-2">
								<!-- Due Date field -->
								<div class="form-control w-full">
									<label class="label" for={`milestone-due-date-${i}`}>
										<span class="label-text">Due Date</span>
									</label>
									<DatePicker
										value={milestone.dueDate}
										onChange={(value: string) => {
											const newMilestones = [...milestones];
											newMilestones[i] = { ...newMilestones[i], dueDate: value };
											milestones = newMilestones;
										}}
									/>
								</div>
							</div>

							<!-- Deliverables field -->
							<div class="form-control mt-2">
								<label class="label" for={`milestone-deliverables-${i}`}>
									<span class="label-text">Deliverables</span>
								</label>
								<textarea
									id={`milestone-deliverables-${i}`}
									class="textarea textarea-bordered h-20 w-full rounded-xl"
									value={milestone.deliverables}
									oninput={(e) => {
										const newMilestones = [...milestones];
										newMilestones[i] = {
											...newMilestones[i],
											deliverables: (e.target as HTMLTextAreaElement).value
										};
										milestones = newMilestones;
									}}
									placeholder="What specific items will be delivered at this milestone"
								></textarea>
							</div>
						</div>
					{/each}
				</div>
			</div>

			<!-- Divider -->
			<div class="divider"></div>

			<!-- Submit Buttons -->
			<button type="submit" class="btn btn-primary block justify-self-end" disabled={submittingBid}>
				{#if submittingBid}
					<span class="loading loading-spinner loading-sm"></span>
					Submitting...
				{:else}
					Submit Bid
				{/if}
			</button>
			{#if bidFormErrors.general}
				<div class="alert alert-error">
					<span>{bidFormErrors.general}</span>
				</div>
			{/if}
		</form>
	{/if}

	<div class="absolute top-0 left-0 h-full w-full"></div>
</div>

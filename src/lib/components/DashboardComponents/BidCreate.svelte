<script lang="ts">
	import { onMount } from 'svelte';

	// Props
	export let taskId = '';
	export let taskTitle = '';
	export let taskBudget = '';
	export let taskCurrency = 'BTC';
	export let taskDeadline = '';
	export let onBidSubmit: (bidData?: any) => void = () => {};
	export let onCancel = () => {};

	// Form state
	let amount = '';
	let estimatedDays = 1;
	let proposal = '';
	let attachments: File[] = [];

	// Form validation
	let errors: Record<string, string> = {};
	let isSubmitting = false;

	// Calculate minimum and maximum suggested bids (in a real app, this would be more sophisticated)
	$: suggestedMinBid = taskBudget ? (parseFloat(taskBudget) * 0.8).toFixed(8) : '';
	$: suggestedMaxBid = taskBudget ? (parseFloat(taskBudget) * 1.2).toFixed(8) : '';

	// Calculate estimated completion date
	$: estimatedCompletionDate = calculateCompletionDate(estimatedDays);

	// Calculate completion date based on days
	function calculateCompletionDate(days: number): string {
		const date = new Date();
		date.setDate(date.getDate() + days);
		return date.toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}

	// Handle file upload
	function handleFileUpload(event: Event) {
		const input = event.target as HTMLInputElement;
		if (input.files) {
			for (let i = 0; i < input.files.length; i++) {
				attachments = [...attachments, input.files[i]];
			}
		}
	}

	// Remove an attachment
	function removeAttachment(index: number) {
		attachments = attachments.filter((_, i) => i !== index);
	}

	// Validate form
	function validateForm(): boolean {
		errors = {};

		if (!amount.trim()) {
			errors.amount = 'Bid amount is required';
		} else if (isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
			errors.amount = 'Please enter a valid amount';
		}

		if (!proposal.trim()) {
			errors.proposal = 'Proposal is required';
		} else if (proposal.length < 50) {
			errors.proposal = 'Please provide a more detailed proposal (at least 50 characters)';
		}

		if (estimatedDays <= 0) {
			errors.estimatedDays = 'Please enter a valid number of days';
		}

		return Object.keys(errors).length === 0;
	}

	// Submit bid
	async function submitBid() {
		if (!validateForm()) return;

		isSubmitting = true;

		try {
			// In a real implementation, this would be an API call to submit the bid
			// For now, we'll simulate a successful submission
			await new Promise((resolve) => setTimeout(resolve, 1000));

			// Call the parent's onBidSubmit callback with the bid data
			onBidSubmit({
				taskId,
				amount,
				currency: taskCurrency,
				estimatedDays,
				proposal,
				attachments
			});
		} catch (error) {
			console.error('Error submitting bid:', error);
			errors.general = 'Failed to submit bid. Please try again.';
		} finally {
			isSubmitting = false;
		}
	}

	onMount(() => {
		// Initialize amount with the task budget as a starting point
		amount = taskBudget;
	});
</script>

<div class="bg-base-100 rounded-lg p-6 shadow-lg">
	<h2 class="mb-2 text-2xl font-bold">Submit a Bid</h2>
	<h3 class="mb-6 text-lg">{taskTitle}</h3>

	{#if errors.general}
		<div class="alert alert-error mb-6 shadow-lg">
			<div>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-6 w-6 flex-shrink-0 stroke-current"
					fill="none"
					viewBox="0 0 24 24"
					><path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
					/></svg
				>
				<span>{errors.general}</span>
			</div>
		</div>
	{/if}

	<form on:submit|preventDefault={submitBid} class="space-y-4">
		<!-- Amount -->
		<div class="form-control">
			<label for="amount" class="label">
				<span class="label-text">Your Bid Amount</span>
				{#if suggestedMinBid && suggestedMaxBid}
					<span class="label-text-alt"
						>Suggested range: {suggestedMinBid} - {suggestedMaxBid} {taskCurrency}</span
					>
				{/if}
			</label>
			<div class="input-group">
				<input
					type="number"
					id="amount"
					bind:value={amount}
					step="0.00000001"
					min="0"
					class="input input-bordered w-full {errors.amount ? 'input-error' : ''}"
					placeholder="Enter your bid amount"
				/>
				<span>{taskCurrency}</span>
			</div>
			{#if errors.amount}
				<label class="label">
					<span class="label-text-alt text-error">{errors.amount}</span>
				</label>
			{/if}
		</div>

		<!-- Estimated Completion Time -->
		<div class="form-control">
			<label for="estimatedDays" class="label">
				<span class="label-text">Estimated Time to Complete</span>
				<span class="label-text-alt">Task deadline: {taskDeadline}</span>
			</label>
			<div class="flex flex-col gap-4 md:flex-row">
				<div class="input-group md:w-1/3">
					<input
						type="number"
						id="estimatedDays"
						bind:value={estimatedDays}
						min="1"
						class="input input-bordered w-full {errors.estimatedDays ? 'input-error' : ''}"
					/>
					<span>Days</span>
				</div>
				<div class="flex items-center md:w-2/3">
					<div class="badge badge-primary">Estimated completion by {estimatedCompletionDate}</div>
				</div>
			</div>
			{#if errors.estimatedDays}
				<label class="label">
					<span class="label-text-alt text-error">{errors.estimatedDays}</span>
				</label>
			{/if}
		</div>

		<!-- Proposal -->
		<div class="form-control">
			<label for="proposal" class="label">
				<span class="label-text">Your Proposal</span>
			</label>
			<textarea
				id="proposal"
				bind:value={proposal}
				class="textarea textarea-bordered h-40 {errors.proposal ? 'textarea-error' : ''}"
				placeholder="Describe how you'll complete the task, your approach, experience with similar tasks, and why you're the right person for this job."
			></textarea>
			{#if errors.proposal}
				<label class="label">
					<span class="label-text-alt text-error">{errors.proposal}</span>
				</label>
			{:else}
				<label class="label">
					<span class="label-text-alt">{proposal.length} characters (minimum 50)</span>
				</label>
			{/if}
		</div>

		<!-- Attachments -->
		<div class="form-control">
			<label for="attachments" class="label">
				<span class="label-text">Attachments (optional)</span>
			</label>
			<input
				type="file"
				id="attachments"
				on:change={handleFileUpload}
				class="file-input file-input-bordered w-full"
				multiple
			/>

			{#if attachments.length > 0}
				<div class="mt-4">
					<h4 class="mb-2 font-medium">Uploaded Files:</h4>
					<ul class="space-y-2">
						{#each attachments as file, i}
							<li class="bg-base-200 flex items-center justify-between rounded-md p-2">
								<span class="truncate">{file.name}</span>
								<button
									type="button"
									class="btn btn-sm btn-error btn-circle"
									on:click={() => removeAttachment(i)}
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
							</li>
						{/each}
					</ul>
				</div>
			{/if}
		</div>

		<!-- Actions -->
		<div class="mt-6 flex flex-col-reverse justify-end gap-4 md:flex-row">
			<button type="button" class="btn btn-outline" on:click={onCancel}> Cancel </button>
			<button type="submit" class="btn btn-primary" disabled={isSubmitting}>
				{#if isSubmitting}
					<span class="loading loading-spinner"></span>
					Submitting...
				{:else}
					Submit Bid
				{/if}
			</button>
		</div>
	</form>
</div>

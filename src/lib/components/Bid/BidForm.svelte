<script lang="ts">
	import type { Bid } from '$lib/types/bid';
	import type { Task } from '$lib/types/task';
	import bidService from '$lib/api/services/bid.service';

	const props = $props<{
		task: Task;
		onClose: () => void;
		onSuccess: () => void;
	}>();

	let loading = $state(false);
	let error = $state<string | null>(null);
	let currentStep = $state(1);

	let formData = $state<Bid>({
		taskId: props.task.id,
		amount: 0,
		description: '',
		estimatedDuration: '',
		proposedApproach: '',
		coverLetter: '',
		paymentType: 'FIXED',
		currency: 'USD',
		visibility: 'PUBLIC',
		responseTime: 24,
		milestones: []
	});

	let milestone = $state('');

	function addMilestone() {
		if (milestone.trim()) {
			formData.milestones = [...(formData.milestones || []), milestone.trim()];
			milestone = '';
		}
	}

	function removeMilestone(index: number) {
		formData.milestones = formData.milestones?.filter((_, i) => i !== index);
	}

	async function handleSubmit() {
		try {
			loading = true;
			error = null;
			await bidService.createBid(formData);
			props.onSuccess();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to submit bid';
		} finally {
			loading = false;
		}
	}

	function nextStep() {
		if (currentStep < 3) currentStep++;
	}

	function prevStep() {
		if (currentStep > 1) currentStep--;
	}

	const isFormValid = $derived(
		formData.amount > 0 && formData.description.length > 0 && formData.proposedApproach.length > 0
	);
</script>

<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
	<div class="bg-base-100 max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg shadow-xl">
		<div class="p-6">
			<div class="mb-6 flex items-center justify-between">
				<h2 class="text-2xl font-bold">Place a Bid</h2>
				<button class="btn btn-ghost btn-sm" onclick={() => props.onClose()}>×</button>
			</div>

			<!-- Progress Steps -->
			<ul class="steps mb-6 w-full">
				<li class="step" class:step-primary={currentStep >= 1}>Bid Details</li>
				<li class="step" class:step-primary={currentStep >= 2}>Approach</li>
				<li class="step" class:step-primary={currentStep >= 3}>Review</li>
			</ul>

			{#if error}
				<div class="alert alert-error mb-4">
					<span>{error}</span>
				</div>
			{/if}

			<form
				onsubmit={(e) => {
					e.preventDefault();
					handleSubmit();
				}}
			>
				<!-- Step 1: Basic Details -->
				{#if currentStep === 1}
					<div class="space-y-4">
						<div class="form-control">
							<label for="payment-type" class="label">
								<span class="label-text">Payment Type</span>
							</label>
							<select
								id="payment-type"
								class="select select-bordered w-full"
								bind:value={formData.paymentType}
							>
								<option value="FIXED">Fixed Price</option>
								<option value="HOURLY">Hourly Rate</option>
							</select>
						</div>

						{#if formData.paymentType === 'FIXED'}
							<div class="form-control">
								<label for="bid-amount" class="label block">
									<span class="label-text">Bid Amount</span>
								</label>
								<input
									id="bid-amount"
									type="number"
									class="input input-bordered w-full"
									bind:value={formData.amount}
									min="0"
									step="0.01"
									required
								/>
							</div>
						{:else}
							<div class="grid grid-cols-2 gap-4">
								<div class="form-control">
									<label for="hourly-rate" class="label">
										<span class="label-text">Hourly Rate</span>
									</label>
									<input
										id="hourly-rate"
										type="number"
										class="input input-bordered"
										bind:value={formData.hourlyRate}
										min="0"
										step="0.01"
										required
									/>
								</div>
								<div class="form-control">
									<label for="estimated-hours" class="label">
										<span class="label-text">Estimated Hours</span>
									</label>
									<input
										id="estimated-hours"
										type="number"
										class="input input-bordered"
										bind:value={formData.estimatedHours}
										min="1"
										required
									/>
								</div>
							</div>
						{/if}

						<div class="grid grid-cols-2 gap-4">
							<div class="form-control">
								<label for="currency" class="label">
									<span class="label-text">Currency</span>
								</label>
								<select
									id="currency"
									class="select select-bordered w-full"
									bind:value={formData.currency}
								>
									<option value="USD">USD</option>
									<option value="BTC">BTC</option>
									<option value="L-BTC">L-BTC</option>
									<option value="LN">Lightning</option>
								</select>
							</div>

							<div class="form-control">
								<label for="duration" class="label block">
									<span class="label-text">Estimated Duration</span>
								</label>
								<input
									id="duration"
									type="text"
									class="input input-bordered"
									bind:value={formData.estimatedDuration}
									placeholder="e.g., 2 weeks"
									required
								/>
							</div>
						</div>
					</div>
				{/if}

				<!-- Step 2: Approach -->
				{#if currentStep === 2}
					<div class="space-y-4">
						<div class="form-control">
							<label for="approach" class="label">
								<span class="label-text">Proposed Approach</span>
							</label>
							<textarea
								id="approach"
								class="textarea textarea-bordered h-24"
								bind:value={formData.proposedApproach}
								placeholder="Describe how you plan to complete this task"
								required
							></textarea>
						</div>

						<div class="form-control">
							<label for="cover-letter" class="label">
								<span class="label-text">Cover Letter</span>
							</label>
							<textarea
								id="cover-letter"
								class="textarea textarea-bordered h-24"
								bind:value={formData.coverLetter}
								placeholder="Why are you the best person for this task?"
								required
							></textarea>
						</div>

						<div class="form-control">
							<label for="milestone" class="label">
								<span class="label-text">Milestones</span>
							</label>
							<div class="flex gap-2">
								<input
									id="milestone"
									type="text"
									class="input input-bordered flex-1"
									bind:value={milestone}
									placeholder="Add a milestone"
								/>
								<button type="button" class="btn btn-primary" onclick={addMilestone}> Add </button>
							</div>
							{#if formData.milestones && formData.milestones.length > 0}
								<div class="mt-2 space-y-2">
									{#each formData.milestones as m, i}
										<div class="flex items-center gap-2">
											<span class="flex-1">{m}</span>
											<button
												type="button"
												class="btn btn-ghost btn-sm"
												onclick={() => removeMilestone(i)}
											>
												×
											</button>
										</div>
									{/each}
								</div>
							{/if}
						</div>
					</div>
				{/if}

				<!-- Step 3: Review -->
				{#if currentStep === 3}
					<div class="space-y-4">
						<div class="card bg-base-200">
							<div class="card-body">
								<h3 class="card-title">Bid Summary</h3>
								<div class="grid grid-cols-2 gap-4">
									<div>
										<p class="font-semibold">Payment Type:</p>
										<p>{formData.paymentType}</p>
									</div>
									<div>
										<p class="font-semibold">Amount:</p>
										<p>
											{formData.paymentType === 'FIXED'
												? formData.amount
												: `${formData.hourlyRate}/hr (${formData.estimatedHours} hrs)`}
											{formData.currency}
										</p>
									</div>
									<div>
										<p class="font-semibold">Duration:</p>
										<p>{formData.estimatedDuration}</p>
									</div>
									<div>
										<p class="font-semibold">Response Time:</p>
										<p>{formData.responseTime} hours</p>
									</div>
								</div>

								{#if formData.milestones && formData.milestones.length > 0}
									<div class="mt-4">
										<p class="font-semibold">Milestones:</p>
										<ul class="list-inside list-disc">
											{#each formData.milestones as milestone}
												<li>{milestone}</li>
											{/each}
										</ul>
									</div>
								{/if}
							</div>
						</div>
					</div>
				{/if}

				<!-- Navigation Buttons -->
				<div class="mt-6 flex justify-between">
					{#if currentStep > 1}
						<button type="button" class="btn" onclick={prevStep}> Previous </button>
					{:else}
						<button type="button" class="btn" onclick={() => props.onClose()}> Cancel </button>
					{/if}

					{#if currentStep < 3}
						<button type="button" class="btn btn-primary" onclick={nextStep}> Next </button>
					{:else}
						<button type="submit" class="btn btn-primary" disabled={!isFormValid || loading}>
							{loading ? 'Submitting...' : 'Submit Bid'}
						</button>
					{/if}
				</div>
			</form>
		</div>
	</div>
</div>

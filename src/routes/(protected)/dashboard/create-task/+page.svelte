<script lang="ts">
	// Import task store and task type
	import { taskStore } from '$lib/states/task.store';
	import type { Task } from '$lib/types/task';

	// Load any existing draft on mount
	taskStore.loadDraft();

	// Categories - This would typically come from an API
	const categories = [
		{ id: 1, name: 'Home Maintenance' },
		{ id: 2, name: 'Delivery' },
		{ id: 3, name: 'Professional Services' },
		{ id: 4, name: 'IT & Technology' },
		{ id: 5, name: 'Personal Assistant' },
		{ id: 6, name: 'Creative Services' },
		{ id: 7, name: 'Education & Training' },
		{ id: 8, name: 'Events & Photography' },
		{ id: 9, name: 'Other' }
	];

	// Skills - This would typically come from an API
	const skills = [
		{ id: 5, name: 'JavaScript' },
		{ id: 12, name: 'TypeScript' },
		{ id: 18, name: 'Node.js' }
	];

	// Form validation
	let errors = $state<Record<string, string>>({});
	let isSubmitting = $state(false);
	let isSubmitted = $state(false);

	// Form validation
	function validateCurrentStep(): boolean {
		errors = {};

		switch (taskStore.currentStep) {
			case 'basics':
				if (!taskStore.task.title?.trim()) errors.title = 'Title is required';
				break;

			case 'timing':
				if (!taskStore.task.deadline) errors.deadline = 'Deadline is required';
				break;

			case 'location':
				if (taskStore.task.taskType === 'IN_PERSON' && !taskStore.task.pickupLocation?.zipCode) {
					errors.location = 'Location is required for in-person tasks';
				}
				break;

			case 'details':
				if (!taskStore.task.description?.trim()) errors.description = 'Description is required';
				break;

			case 'budget':
				if (!taskStore.task.budget || taskStore.task.budget <= 0) {
					errors.budget = 'Valid budget is required';
				}
				break;
		}

		return Object.keys(errors).length === 0;
	}

	// Handle file upload
	let attachments = $state<File[]>([]);
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

	function handleNext() {
		if (validateCurrentStep()) {
			taskStore.nextStep();
		}
	}

	// Submit the form
	async function handleSubmit() {
		if (!validateCurrentStep()) return;

		isSubmitting = true;

		try {
			// Prepare the final task data
			const finalTask: Task = {
				...taskStore.task,
				// Add any additional processing here
			};

			// In a real implementation, this would be an API call to create a task
			await new Promise((resolve) => setTimeout(resolve, 1000));

			isSubmitted = true;
			taskStore.clearDraft();

			// Reset form after showing success message
			setTimeout(() => {
				isSubmitted = false;
			}, 3000);
		} catch (error) {
			console.error('Error creating task:', error);
			errors.general = 'Failed to create task. Please try again.';
		} finally {
			isSubmitting = false;
		}
	}
</script>

<div class="card bg-base-100 mx-auto max-w-3xl shadow-xl">
	<div class="card-body">
		<div class="flex items-center justify-between">
			<h2 class="card-title text-2xl">Create a New Task</h2>
			<div class="text-sm">Step {taskStore.currentStep} of 5</div>
		</div>

		{#if isSubmitted}
			<div class="alert alert-success mb-6 shadow-lg">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-6 w-6 shrink-0 stroke-current"
					fill="none"
					viewBox="0 0 24 24"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
					/>
				</svg>
				<span>Task created successfully!</span>
			</div>
		{/if}

		{#if errors.general}
			<div class="alert alert-error mb-6 shadow-lg">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-6 w-6 shrink-0 stroke-current"
					fill="none"
					viewBox="0 0 24 24"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
					/>
				</svg>
				<span>{errors.general}</span>
			</div>
		{/if}

		<div class="space-y-6">
			{#if taskStore.currentStep === 'basics'}
				<div class="w-full">
					<label for="title" class="label">
						<span class="label-text">What do you need done?</span>
					</label>
					<input
						type="text"
						id="title"
						bind:value={taskStore.task.title}
						class="input input-bordered w-full {errors.title ? 'input-error' : ''}"
						placeholder="e.g. Help move my sofa"
					/>
					{#if errors.title}
						<span class="label-text-alt text-error">{errors.title}</span>
					{/if}
				</div>

				<div class="w-full">
					<label for="category" class="label">
						<span class="label-text">Category</span>
					</label>
					<select
						id="category"
						bind:value={taskStore.task.categoryIds[0]}
						class="select select-bordered w-full {errors.category ? 'select-error' : ''}"
					>
						<option value="" disabled selected>Select a category</option>
						{#each categories as cat}
							<option value={cat.id}>{cat.name}</option>
						{/each}
					</select>
					{#if errors.category}
						<span class="label-text-alt text-error">{errors.category}</span>
					{/if}
				</div>
			{:else if taskStore.currentStep === 'timing'}
				<div class="space-y-4">
					<h3 class="text-lg font-semibold">When do you need this done?</h3>
					
					<div class="flex gap-4">
						<button
							class="btn {taskStore.task.dateRange ? 'btn-outline' : 'btn-primary'}"
							onclick={() => taskStore.updateTask({ dateRange: undefined })}
						>
							I'm flexible
						</button>
						<button
							class="btn {!taskStore.task.dateRange ? 'btn-outline' : 'btn-primary'}"
							onclick={() =>
								taskStore.updateTask({
									dateRange: {
										start: new Date().toISOString(),
										end: taskStore.task.deadline
									}
								})}
						>
							On a specific date
						</button>
					</div>

					{#if taskStore.task.dateRange}
						<div class="grid grid-cols-2 gap-4">
							<div>
								<label for="startDate" class="label">Start Date</label>
								<input
									type="date"
									id="startDate"
									bind:value={taskStore.task.dateRange.start}
									class="input input-bordered w-full"
								/>
							</div>
							<div>
								<label for="endDate" class="label">End Date</label>
								<input
									type="date"
									id="endDate"
									bind:value={taskStore.task.dateRange.end}
									class="input input-bordered w-full"
								/>
							</div>
						</div>
					{/if}
				</div>
			{:else if taskStore.currentStep === 'location'}
				<div class="space-y-4">
					<h3 class="text-lg font-semibold">Where do you need this done?</h3>
					
					<div class="flex gap-4">
						<button
							class="btn {taskStore.task.taskType === 'IN_PERSON' ? 'btn-primary' : 'btn-outline'}"
							onclick={() => taskStore.updateTask({ taskType: 'IN_PERSON' })}
						>
							In-person
						</button>
						<button
							class="btn {taskStore.task.taskType === 'REMOTE' ? 'btn-primary' : 'btn-outline'}"
							onclick={() => taskStore.updateTask({ taskType: 'REMOTE' })}
						>
							Remote
						</button>
					</div>

					{#if taskStore.task.taskType === 'IN_PERSON'}
						<div class="w-full">
							<label for="pickup-location" class="label">
								<span class="label-text">Location</span>
							</label>
							<input
								type="text"
								id="pickup-location"
								value={taskStore.task.pickupLocation?.zipCode ?? ''}
								onchange={(e) => {
									const zipCode = (e.target as HTMLInputElement).value;
									taskStore.updateTask({
										pickupLocation: {
											zipCode,
											displayName: '',
											longitude: 0,
											latitude: 0,
											locationLoaded: false
										}
									});
								}}
								class="input input-bordered w-full {errors.location ? 'input-error' : ''}"
								placeholder="Enter ZIP code"
							/>
							{#if errors.location}
								<span class="label-text-alt text-error">{errors.location}</span>
							{/if}
						</div>
					{/if}
				</div>
			{:else if taskStore.currentStep === 'details'}
				<div class="space-y-4">
					<div class="w-full">
						<label for="description">
							<span class="label">Task Details</span>
							<textarea
								id="description"
								bind:value={taskStore.task.description}
								class="textarea textarea-bordered h-32 w-full {errors.description
									? 'textarea-error'
									: ''}"
								placeholder="Describe your task in detail"
							></textarea>
						</label>
						{#if errors.description}
							<span class="label-text-alt text-error">{errors.description}</span>
						{/if}
					</div>

					<div class="w-full">
						<label class="label">Required Skills</label>
						<div class="flex flex-wrap gap-2">
							{#each skills as skill}
								<label class="badge badge-lg cursor-pointer p-3 {taskStore.task.skillIds.includes(skill.id) ? 'badge-primary' : ''}">
									<input
										type="checkbox"
										class="hidden"
										checked={taskStore.task.skillIds.includes(skill.id)}
										onclick={() => {
											const newSkills = taskStore.task.skillIds.includes(skill.id)
												? taskStore.task.skillIds.filter((id) => id !== skill.id)
												: [...taskStore.task.skillIds, skill.id];
											taskStore.updateTask({ skillIds: newSkills });
										}}
									/>
									{skill.name}
								</label>
							{/each}
						</div>
					</div>

					<div class="w-full">
						<label>
							<span class="label">Attachments</span>
							<input
								type="file"
								class="file-input file-input-bordered w-full"
								onchange={handleFileUpload}
								multiple
							/>
						</label>

						{#if attachments.length > 0}
							<div class="mt-4 space-y-2">
								{#each attachments as file, index}
									<div class="bg-base-200 flex items-center justify-between rounded-lg p-2">
										<span class="truncate">{file.name}</span>
										<button
											type="button"
											class="btn btn-error btn-sm btn-circle"
											onclick={() => removeAttachment(index)}
										>
											✕
										</button>
									</div>
								{/each}
							</div>
						{/if}
					</div>
				</div>
			{:else if taskStore.currentStep === 'budget'}
				<div class="space-y-4">
					<h3 class="text-lg font-semibold">What's your budget?</h3>
					
					<div class="flex gap-4">
						<button
							class="btn {taskStore.task.budgetType === 'FIXED' ? 'btn-primary' : 'btn-outline'}"
							onclick={() => taskStore.updateTask({ budgetType: 'FIXED' })}
						>
							Fixed price
						</button>
						<button
							class="btn {taskStore.task.budgetType === 'HOURLY' ? 'btn-primary' : 'btn-outline'}"
							onclick={() => taskStore.updateTask({ budgetType: 'HOURLY' })}
						>
							Hourly rate
						</button>
					</div>

					<div class="w-full">
						<label for="budget" class="label">
							<span class="label-text">Budget (in BTC)</span>
						</label>
						<input
							type="number"
							id="budget"
							bind:value={taskStore.task.budget}
							class="input input-bordered w-full {errors.budget ? 'input-error' : ''}"
							placeholder="Enter your budget"
							min="0"
							step="0.00000001"
						/>
						{#if errors.budget}
							<span class="label-text-alt text-error">{errors.budget}</span>
						{/if}
					</div>

					{#if taskStore.task.budgetType === 'HOURLY'}
						<div class="w-full">
							<label for="estimatedHours" class="label">
								<span class="label-text">Estimated Hours</span>
							</label>
							<input
								type="number"
								id="estimatedHours"
								bind:value={taskStore.task.estimatedHours}
								class="input input-bordered w-full"
								placeholder="Estimated hours needed"
								min="1"
							/>
						</div>
					{/if}
				</div>
			{/if}

			<div class="mt-6 flex justify-between">
				{#if taskStore.currentStep !== 'basics'}
					<button class="btn" onclick={() => taskStore.previousStep()}>Back</button>
				{:else}
					<div></div>
				{/if}

				{#if taskStore.currentStep === 'budget'}
					<button
						class="btn btn-primary {isSubmitting ? 'loading' : ''}"
						onclick={handleSubmit}
						disabled={isSubmitting}
					>
						{isSubmitting ? 'Creating Task...' : 'Get Quotes'}
					</button>
				{:else}
					<button class="btn btn-primary" onclick={handleNext}>Next</button>
				{/if}
			</div>
		</div>
	</div>
</div>

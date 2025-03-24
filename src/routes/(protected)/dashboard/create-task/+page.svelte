<script lang="ts">
	// Form fields
	let title = $state('');
	let description = $state('');
	let category = $state('');
	let location = $state('');
	let isRemote = $state(false);
	let budget = $state('');
	let currencyType = $state('BTC'); // Default to Bitcoin
	let deadline = $state('');
	let skills = $state<string[]>([]);
	let newSkill = $state('');
	let attachments = $state<File[]>([]);

	// Form validation
	let errors = $state<Record<string, string>>({});
	let isSubmitting = $state(false);
	let isSubmitted = $state(false);

	// Categories - This would typically come from an API
	const categories = [
		'Home Maintenance',
		'Delivery',
		'Professional Services',
		'IT & Technology',
		'Personal Assistant',
		'Creative Services',
		'Education & Training',
		'Events & Photography',
		'Other'
	];

	// Currency options
	const currencyOptions = [
		{ value: 'BTC', label: 'Bitcoin (BTC)' },
		{ value: 'LBTC', label: 'Liquid Bitcoin (L-BTC)' },
		{ value: 'USDT', label: 'Tether on Liquid (USDt)' },
		{ value: 'LN', label: 'Lightning Network (⚡)' }
	];

	// Add a skill to the skills array
	function addSkill() {
		if (newSkill && !skills.includes(newSkill)) {
			skills = [...skills, newSkill];
			newSkill = '';
		}
	}

	// Remove a skill from the skills array
	function removeSkill(skillToRemove: string) {
		skills = skills.filter((skill) => skill !== skillToRemove);
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

	// Form validation
	function validateForm() {
		errors = {};

		if (!title.trim()) errors.title = 'Title is required';
		if (!description.trim()) errors.description = 'Description is required';
		if (!category) errors.category = 'Category is required';
		if (!isRemote && !location.trim())
			errors.location = 'Location is required for non-remote tasks';
		if (!budget.trim()) errors.budget = 'Budget is required';
		if (!deadline.trim()) errors.deadline = 'Deadline is required';

		return Object.keys(errors).length === 0;
	}

	// Submit the form
	async function handleSubmit(e: Event) {
		e.preventDefault();
		if (!validateForm()) return;

		isSubmitting = true;

		try {
			// In a real implementation, this would be an API call to create a task
			// For now, we'll simulate a successful submission
			await new Promise((resolve) => setTimeout(resolve, 1000));

			isSubmitted = true;

			// Reset form
			setTimeout(() => {
				title = '';
				description = '';
				category = '';
				location = '';
				isRemote = false;
				budget = '';
				currencyType = 'BTC';
				deadline = '';
				skills = [];
				attachments = [];
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
		<h2 class="card-title mb-6 text-2xl">Create a New Task</h2>

		{#if isSubmitted}
			<div class="alert alert-success mb-6 shadow-lg">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-6 w-6 shrink-0 stroke-current"
					fill="none"
					viewBox="0 0 24 24"
					><path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
					/></svg
				>
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
					><path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
					/></svg
				>
				<span>{errors.general}</span>
			</div>
		{/if}

		<form onsubmit={handleSubmit} class="space-y-6">
			<!-- Title -->
			<div class="w-full">
				<label for="title" class="label">
					<span class="label-text">Task Title</span>
				</label>
				<input
					type="text"
					id="title"
					bind:value={title}
					class="input input-bordered w-full {errors.title ? 'input-error' : ''}"
					placeholder="Enter a clear title for your task"
				/>
				{#if errors.title}
					<span class="label-text-alt text-error">{errors.title}</span>
				{/if}
			</div>

			<!-- Description -->
			<div class="w-full">
				<label for="description">
					<span class="label">Description</span>
					<textarea
						id="description"
						bind:value={description}
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

			<!-- Category -->
			<div class="w-full">
				<label for="category" class="label">
					<span class="label-text">Category</span>
				</label>
				<select
					id="category"
					bind:value={category}
					class="select select-bordered w-full {errors.category ? 'select-error' : ''}"
				>
					<option value="" disabled selected>Select a category</option>
					{#each categories as cat}
						<option value={cat}>{cat}</option>
					{/each}
				</select>
				{#if errors.category}
					<span class="label-text-alt text-error">{errors.category}</span>
				{/if}
			</div>

			<!-- Location -->
			<div class="w-full">
				<div class="mb-2 flex items-center">
					<label for="isRemote" class="label cursor-pointer justify-start">
						<input
							type="checkbox"
							id="isRemote"
							bind:checked={isRemote}
							class="checkbox checkbox-primary"
						/>
						<span class="label-text ml-2">This is a remote task</span>
					</label>
				</div>

				{#if !isRemote}
					<label for="location" class="label">
						<span class="label-text">Location</span>
					</label>
					<input
						type="text"
						id="location"
						bind:value={location}
						class="input input-bordered w-full {errors.location ? 'input-error' : ''}"
						placeholder="Enter the task location"
					/>
					{#if errors.location}
						<span class="label-text-alt text-error">{errors.location}</span>
					{/if}
				{/if}
			</div>

			<!-- Budget -->
			<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
				<div class="w-full">
					<label for="budget" class="label">
						<span class="label-text">Budget</span>
					</label>
					<input
						type="number"
						id="budget"
						bind:value={budget}
						class="input input-bordered w-full {errors.budget ? 'input-error' : ''}"
						placeholder="Enter your budget"
						min="0"
						step="0.00000001"
					/>
					{#if errors.budget}
						<span class="label-text-alt text-error">{errors.budget}</span>
					{/if}
				</div>

				<div class="w-full">
					<label for="currencyType" class="label">
						<span class="label-text">Currency</span>
					</label>
					<select id="currencyType" bind:value={currencyType} class="select select-bordered w-full">
						{#each currencyOptions as option}
							<option value={option.value}>{option.label}</option>
						{/each}
					</select>
				</div>
			</div>

			<!-- Deadline -->
			<div class="w-full">
				<label for="deadline" class="label">
					<span class="label-text">Deadline</span>
				</label>
				<input
					type="date"
					id="deadline"
					bind:value={deadline}
					class="input input-bordered w-full {errors.deadline ? 'input-error' : ''}"
				/>
				{#if errors.deadline}
					<span class="label-text-alt text-error">{errors.deadline}</span>
				{/if}
			</div>

			<!-- Skills -->
			<div class="w-full">
				<label>
					<span class="label">Required Skills</span>
					<div class="flex gap-2">
						<input
							type="text"
							bind:value={newSkill}
							class="input input-bordered w-full"
							placeholder="Enter a required skill"
						/>
						<button
							type="button"
							class="btn btn-primary"
							onclick={addSkill}
							disabled={!newSkill.trim()}
						>
							Add
						</button>
					</div>
				</label>

				{#if skills.length > 0}
					<div class="mt-4 flex flex-wrap gap-2">
						{#each skills as skill}
							<div class="badge badge-lg gap-2 p-3">
								{skill}
								<button
									type="button"
									class="btn btn-ghost btn-xs btn-circle"
									onclick={() => removeSkill(skill)}
								>
									✕
								</button>
							</div>
						{/each}
					</div>
				{/if}
			</div>

			<!-- Attachments -->
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

			<div class="mt-6">
				<button
					type="submit"
					class="btn btn-primary w-full {isSubmitting ? 'loading' : ''}"
					disabled={isSubmitting}
				>
					{isSubmitting ? 'Creating Task...' : 'Create Task'}
				</button>
			</div>
		</form>
	</div>
</div>

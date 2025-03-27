<script lang="ts">
	import type { Task } from '$lib/types/task.d';
	import type { Place } from '$lib/utils/constants/places';
	import { onMount } from 'svelte';
	import { appStore } from '$lib/stores/app.store';
	import { PLACES } from '$lib/utils/constants/places';
	import { taskStore as store, STEPS } from '$lib/stores/task.store';
	import Uploader from '$lib/components/Uploader.svelte';
	import Tags from '$lib/components/Tags.svelte';
	import Input from '$lib/components/Input.svelte';

	onMount(() => {
		store.loadDraft();
	});

	let errors = $state<Record<string, string>>({});
	let isSubmitting = $state(false);
	let isSubmitted = $state(false);

	function validateCurrentStep(): boolean {
		errors = {};

		switch ($store.currentStep) {
			case 'basics':
				if (!$store.task.title?.trim()) errors.title = 'Title is required';
				if ($store.task.dateRange && !$store.task.dateRange.end && !$store.task.dateRange.start) {
					errors.deadline = 'You must select a start or an end date';
				}
				break;
			case 'location':
				if ($store.task.taskType === 'IN_PERSON' && !$store.task.pickupLocation?.zipCode) {
					errors.location = 'Location is required for this task';
				}
				break;

			case 'details':
				if (!$store.task.description?.trim()) errors.description = 'Description is required';
				break;

			case 'budget':
				if (!$store.task.budget || $store.task.budget <= 0) {
					errors.budget = 'Valid budget is required';
				}
				break;
		}

		return Object.keys(errors).length === 0;
	}

	let attachments = $state<File[]>([]);
	function handleFileUpload(files: File[]) {
		if (files) {
			for (let i = 0; i < files.length; i++) {
				attachments = [...attachments, files[i]];
			}
		}
	}

	function handleNext() {
		if (validateCurrentStep()) {
			store.nextStep();
			store.saveDraft();
		}
	}

	async function handleSubmit() {
		if (!validateCurrentStep()) return;

		isSubmitting = true;

		try {
			const finalTask: Task = {
				...$store.task
			};

			await new Promise((resolve) => setTimeout(resolve, 1000));

			isSubmitted = true;
			await store.clearDraft();

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
			<div class="text-sm">Step {STEPS.indexOf($store.currentStep) + 1} of {STEPS.length}</div>
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
			{#if $store.currentStep === 'basics'}
				<div class="w-full">
					<label for="title" class="label">
						<span class="label-text">What do you need done?</span>
					</label>
					<input
						type="text"
						id="title"
						value={$store.task.title}
						onchange={(e) => store.updateTask({ title: (e.target as HTMLInputElement).value })}
						class="input input-bordered w-full {errors.title ? 'input-error' : ''}"
						placeholder="e.g. Help move my sofa"
					/>
					{#if errors.title}
						<span class="label-text-alt text-error">{errors.title}</span>
					{/if}
				</div>

				<div class="space-y-4">
					<h3 class="text-lg font-semibold">When do you need this done?</h3>

					<div class="flex gap-4">
						<button
							class="btn {$store.task.dateRange ? 'btn-outline' : 'btn-primary'}"
							onclick={() => store.updateTask({ dateRange: undefined })}
						>
							I'm flexible
						</button>
						<button
							class="btn {!$store.task.dateRange ? 'btn-outline' : 'btn-primary'}"
							onclick={() =>
								store.updateTask({
									dateRange: {
										start: new Date().toISOString(),
										end: $store.task.deadline
									}
								})}
						>
							On a specific date
						</button>
					</div>

					{#if $store.task.dateRange}
						<div class="grid grid-cols-2 gap-4">
							<div>
								<label for="startDate" class="label">Start Date</label>
								<input
									type="date"
									id="startDate"
									value={$store.task.dateRange.start}
									onchange={(e) => {
										const start = (e.target as HTMLInputElement).value;
										const end = $store.task.dateRange?.end ?? new Date().toISOString();
										store.updateTask({
											dateRange: {
												start,
												end
											}
										});
									}}
									class="input input-bordered w-full"
								/>
							</div>
							<div>
								<label for="endDate" class="label">End Date</label>
								<input
									type="date"
									id="endDate"
									value={$store.task.dateRange.end}
									onchange={(e) => {
										const end = (e.target as HTMLInputElement).value;
										const start = $store.task.dateRange?.start ?? new Date().toISOString();
										store.updateTask({
											dateRange: {
												start,
												end
											}
										});
									}}
									class="input input-bordered w-full"
								/>
							</div>
						</div>
					{/if}
				</div>

				<div class="w-full">
					<Input
						id="category"
						label="Category"
						options={$appStore.categories.map((cat) => ({
							label: cat.name,
							value: cat.id.toString()
						}))}
						value={$appStore.categories.find((cat) => cat.id === $store.task.categoryIds?.[0])
							?.name ?? ''}
						onChange={(id) => store.updateTask({ categoryIds: [parseInt(id.value, 10)] })}
					/>
					{#if errors.category}
						<span class="label-text-alt text-error">{errors.category}</span>
					{/if}
				</div>

				<div class="w-full">
					<label for="skills" class="label">Required Skills</label>
					<Tags
						options={$appStore.skills}
						selectedTags={$store.task.skillIds}
						onChange={(ids) => store.updateTask({ skillIds: ids })}
					/>
				</div>
			{:else if $store.currentStep === 'location'}
				<div class="space-y-4">
					<h3 class="text-lg font-semibold">Is this a removals task?</h3>
					<div class="flex gap-4">
						<button
							class="btn {$store.isRemovals ? 'btn-primary' : 'btn-outline'}"
							onclick={() => ($store.isRemovals = true)}
						>
							Yes
						</button>
						<button
							class="btn {!$store.isRemovals ? 'btn-primary' : 'btn-outline'}"
							onclick={() => ($store.isRemovals = false)}
						>
							No
						</button>
					</div>

					{#if $store.isRemovals}
						<p>Removals tasks require a pickup location and drop-off location.</p>
						<div class="w-full">
							<Input
								id="pickupLocation"
								label="Pickup Location"
								placeholder="Enter address or ZIP code"
								value={$store.task.pickupLocation?.displayName}
								error={errors.location}
								options={PLACES.map((place) => ({
									label: place.displayName,
									value: place.zipCode
								}))}
								onChange={(option) => {
									const place = PLACES.find((p) => p.zipCode === option.value);
									if (place) {
										store.updateTask({
											pickupLocation: {
												...place,
												locationLoaded: true
											}
										});
									}
								}}
							/>
						</div>
						<div class="w-full">
							<Input
								id="dropOffLocation"
								label="Drop-off Location"
								placeholder="Enter address or ZIP code"
								value={$store.task.dropOffLocation?.displayName}
								options={PLACES.map((place) => ({
									label: place.displayName,
									value: place.zipCode
								}))}
								onChange={(option) => {
									const place = PLACES.find((p) => p.zipCode === option.value);
									if (place) {
										store.updateTask({
											dropOffLocation: {
												...place,
												locationLoaded: true
											}
										});
									}
								}}
							/>
						</div>
					{:else}
						<p>Where do you need this done?</p>

						<div class="flex gap-4">
							<button
								class="btn {$store.task.taskType === 'IN_PERSON' ? 'btn-primary' : 'btn-outline'}"
								onclick={() => store.updateTask({ taskType: 'IN_PERSON' })}
							>
								In-person
							</button>
							<button
								class="btn {$store.task.taskType === 'REMOTE' ? 'btn-primary' : 'btn-outline'}"
								onclick={() => store.updateTask({ taskType: 'REMOTE' })}
							>
								Remote
							</button>
						</div>

						{#if $store.task.taskType === 'IN_PERSON'}
							<div class="w-full">
								<Input
									id="location"
									label="Location"
									placeholder="Enter address or ZIP code"
									value={$store.task.pickupLocation?.displayName}
									error={errors.location}
									options={PLACES.map((place) => ({
										label: place.displayName,
										value: place.zipCode
									}))}
									onChange={(option) => {
										const place = PLACES.find((p) => p.zipCode === option.value);
										if (place) {
											store.updateTask({
												pickupLocation: {
													...place,
													locationLoaded: true
												}
											});
										}
									}}
								/>
							</div>
						{/if}
					{/if}

					<div class="w-full">
						<label for="attachments" class="label"> Attachments </label>

						<Uploader
							id="attachments"
							label="Attachments"
							maxFiles={5}
							maxFileSize={10}
							onChange={handleFileUpload}
						/>
					</div>
				</div>
			{:else if $store.currentStep === 'budget'}
				<div class="space-y-4">
					<h3 class="text-lg font-semibold">What's your budget?</h3>

					<div class="flex gap-4">
						<button
							class="btn {$store.task.budgetType === 'FIXED' ? 'btn-primary' : 'btn-outline'}"
							onclick={() => store.updateTask({ budgetType: 'FIXED' })}
						>
							Fixed price
						</button>
						<button
							class="btn {$store.task.budgetType === 'HOURLY' ? 'btn-primary' : 'btn-outline'}"
							onclick={() => store.updateTask({ budgetType: 'HOURLY' })}
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
							value={$store.task.budget}
							onchange={(e) =>
								store.updateTask({ budget: parseFloat((e.target as HTMLInputElement).value) })}
							class="input input-bordered w-full {errors.budget ? 'input-error' : ''}"
							placeholder="Enter your budget"
							min="0"
							step="0.00000001"
						/>
						{#if errors.budget}
							<span class="label-text-alt text-error">{errors.budget}</span>
						{/if}
					</div>

					{#if $store.task.budgetType === 'HOURLY'}
						<div class="w-full">
							<label for="estimatedHours" class="label">
								<span class="label-text">Estimated Hours</span>
							</label>
							<input
								type="number"
								id="estimatedHours"
								value={$store.task.estimatedHours}
								onchange={(e) =>
									store.updateTask({
										estimatedHours: parseInt((e.target as HTMLInputElement).value)
									})}
								class="input input-bordered w-full"
								placeholder="Estimated hours needed"
								min="1"
							/>
						</div>
					{/if}

					<div class="w-full">
						<label for="description">
							<span class="label">Task Details</span>
							<textarea
								id="description"
								value={$store.task.description}
								onchange={(e) =>
									store.updateTask({ description: (e.target as HTMLTextAreaElement).value })}
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
				</div>
			{/if}

			<div class="mt-6 flex justify-between">
				{#if $store.currentStep !== 'basics'}
					<button class="btn" onclick={() => store.previousStep()}>Back</button>
				{:else}
					<div></div>
				{/if}

				{#if $store.currentStep === 'budget'}
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

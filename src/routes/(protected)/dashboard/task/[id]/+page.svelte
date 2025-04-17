<script lang="ts">
	import type { Task, Location } from '$lib/types/task';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { appStore } from '$lib/stores/app.store';
	import { slide } from 'svelte/transition';
	import { pushState } from '$app/navigation';
	import { BudgetTypeEnum, TaskTypeEnum } from '$lib/utils/enums/task.enum';
	import Uploader from '$lib/components/Uploader.svelte';
	import Tags from '$lib/components/Tags.svelte';
	import Input from '$lib/components/Input.svelte';
	import DatePicker from '$lib/components/date/DatePicker.svelte';
	import LocationAutoComplete from '$lib/components/LocationAutoComplete.svelte';
	import taskService from '$lib/api/services/task.service';
	import BidsPanel from '$lib/components/bidding/BidsPanel.svelte';

	const taskId = page.params.id;
	const selectedBidId = page.url.searchParams.get('bid');
	let task = $state<Task | null>(null),
		isEditing = $state(false),
		loading = $state(true),
		error = $state(''),
		updateObject = $state<Partial<Task> & { skillIds?: number[]; categoryIds?: number[] }>({}),
		isFlexibleDate = $state(false),
		activeTab = $state('details'); // 'details' or 'bids';

	// Selected bid object (find the bid that matches selectedBidId)
	const selectedBid = $derived(
		selectedBidId
			? task?.bids?.find((bid) => bid.id?.toString() === selectedBidId?.toString())
			: null
	);

	// Check URL params for tab selection
	const setTabFromUrl = () => {
		if (page && page.url) {
			const tabParam = page.url.searchParams.get('tab');
			if (tabParam && ['details', 'bids'].includes(tabParam)) {
				activeTab = tabParam;
			}
		}
	};

	// Fetch task details
	async function fetchTask() {
		try {
			loading = true;
			task = await taskService.getTaskById(taskId);
			isFlexibleDate = !task?.dateRange;
		} catch (err) {
			error = 'Failed to load task details';
			console.error(err);
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		fetchTask();
		setTabFromUrl();
	});

	type TaskFieldValue<T extends keyof Task> = Task[T];

	const handleInputChange = <T extends keyof Task>(field: T, value: TaskFieldValue<T>) => {
		if (!task) return;
		task[field] = value;
		updateObject = {
			...updateObject,
			[field]: value
		};
	};

	const handleBudgetTypeChange = (value: BudgetTypeEnum) => {
		handleInputChange('budgetType', value);
	};

	let attachments = $state<File[]>([]);
	const handleFileUpload = (files: File[]) => {
		if (files) {
			for (let i = 0; i < files.length; i++) {
				attachments = [...attachments, files[i]];
			}
		}
	};

	const cancelEdit = () => {
		isEditing = false;
		updateObject = {};
		error = '';
		fetchTask();
	};

	async function handleUpdate() {
		try {
			if (!task) return;
			if (Object.keys(updateObject).length === 0) {
				isEditing = false;
				return;
			}
			await taskService.updateTask(taskId, updateObject);
			await fetchTask();
			updateObject = {};
			isEditing = false;
		} catch (err) {
			error = 'Failed to update task';
			console.error(err);
		} finally {
			loading = false;
		}
	}
</script>

{#if loading}
	<div class="flex min-h-[400px] items-center justify-center">
		<span class="loading loading-spinner loading-lg"></span>
	</div>
{:else if task}
	<div class="space-y-6 p-4">
		<div class="flex items-center justify-between">
			<h1 class="text-2xl font-bold">{task.title}</h1>
			<div class="space-x-2">
				{#if !isEditing && activeTab === 'details'}
					<button class="btn btn-primary" onclick={() => (isEditing = true)}>Edit</button>
				{/if}
			</div>
		</div>

		<!-- Task Tabs -->
		<div class="tabs tabs-bordered" role="tablist">
			<button
				class="tab {activeTab === 'details' ? 'tab-active' : ''}"
				onclick={() => {
					activeTab = 'details';
					// Update URL without navigation
					const url = new URL(window.location.href);
					url.searchParams.set('tab', 'details');
					pushState(url, 'Details');
				}}
				role="tab"
				aria-selected={activeTab === 'details'}
				aria-controls="panel-details"
				id="tab-details"
			>
				Details
			</button>
			<button
				class="tab {activeTab === 'bids' ? 'tab-active' : ''}"
				onclick={() => {
					activeTab = 'bids';
					// Update URL without navigation
					const url = new URL(window.location.href);
					url.searchParams.set('tab', 'bids');
					pushState(url, 'Bids');
				}}
				role="tab"
				aria-selected={activeTab === 'bids'}
				aria-controls="panel-bids"
				id="tab-bids"
			>
				Bids
				{#if task.bids && task.bids.length > 0}
					<div class="badge badge-sm ml-2">{task.bids.length}</div>
				{/if}
			</button>
		</div>

		{#if activeTab === 'details'}
			<!-- Task content -->
			<div
				id="panel-details"
				role="tabpanel"
				aria-labelledby="tab-details"
				transition:slide={{ duration: 300 }}
			>
				<!-- Basic Information -->
				<section class="card bg-base-200 p-4">
					<h2 class="mb-4 text-xl font-semibold">Basic Information</h2>
					{#if isEditing}
						<div class="space-y-4">
							<Input
								label="Title"
								value={task.title}
								onChange={({ value }) => handleInputChange('title', value)}
								required
							/>
							<textarea
								id="description"
								value={task.description}
								onchange={(e) =>
									handleInputChange('description', (e.target as HTMLTextAreaElement).value)}
								class="textarea textarea-bordered h-24 w-full"
								placeholder="Describe your task in detail"
							></textarea>
							<div class="grid grid-cols-2 gap-4">
								<Input
									type="number"
									label="Budget"
									value={task.budget.toString()}
									onChange={({ value }) => handleInputChange('budget', parseFloat(value))}
									required
								/>
								<Input
									label="Budget Type"
									value={task.budgetType}
									onChange={({ value }) => handleBudgetTypeChange(value as BudgetTypeEnum)}
									options={[
										{ value: 'FIXED', label: 'Fixed' },
										{ value: 'HOURLY', label: 'Hourly' }
									]}
								/>
							</div>
							{#if task.budgetType === 'HOURLY'}
								<Input
									type="number"
									label="Estimated Hours"
									value={task.estimatedHours?.toString() ?? ''}
									onChange={({ value }) => handleInputChange('estimatedHours', parseFloat(value))}
								/>
							{/if}
						</div>
					{:else}
						<div class="grid gap-2">
							<p><strong>Title:</strong> {task.title}</p>
							<p><strong>Description:</strong> {task.description}</p>
							<p><strong>Budget:</strong> ${task.budget} ({task.budgetType.toLowerCase()})</p>
							<p><strong>Task Type:</strong> {task.taskType.replace('_', ' ')}</p>
							<p><strong>Estimated Hours:</strong> {task.estimatedHours || 'Not specified'}</p>
						</div>
					{/if}
				</section>

				<!-- Timing -->
				<section class="card bg-base-200 p-4">
					<h2 class="mb-4 text-xl font-semibold">Timing</h2>
					{#if isEditing}
						<div class="space-y-4">
							<Input
								label="Date Type"
								value={task?.deadlineDate ? 'Specific Date' : 'Flexible'}
								onChange={({ value }) => (isFlexibleDate = value === 'on_date')}
								options={[
									{ value: 'flexible', label: 'Flexible' },
									{ value: 'on_date', label: 'Specific Date' }
								]}
							/>
							{#if !isFlexibleDate}
								<DatePicker
									label="Deadline"
									value={task.deadlineDate ?? ''}
									onChange={(value: string) => handleInputChange('deadlineDate', value)}
								/>
							{:else}
								<div class="space-y-2">
									<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
										<DatePicker
											label="Start date"
											value={task?.dateRange?.start ?? ''}
											onChange={(value: string) =>
												handleInputChange('dateRange', {
													start: value,
													end: task?.dateRange?.end ?? ''
												})}
										/>
										<DatePicker
											label="End date"
											value={task?.dateRange?.end ?? ''}
											onChange={(value: string) =>
												handleInputChange('dateRange', {
													start: task?.dateRange?.start ?? '',
													end: value
												})}
										/>
									</div>
								</div>
							{/if}
						</div>
					{:else}
						<div class="grid gap-2">
							<p><strong>Date Type:</strong> {task.deadlineDate ?? 'Flexible'}</p>
							{#if task.deadlineDate === 'flexible'}
								{#if task.dateRange}
									<p>
										<strong>Date Range:</strong>
										{new Date(task.dateRange.start).toLocaleDateString()} - {new Date(
											task.dateRange.end
										).toLocaleDateString()}
									</p>
								{/if}
							{:else if task.deadlineDate === 'on_date'}
								<p>
									<strong>Deadline:</strong>
									{new Date(task.deadlineDate).toLocaleDateString()}
								</p>
							{/if}
						</div>
					{/if}
				</section>

				<!-- Location -->
				<section
					class="card bg-base-200 p-4 {!isEditing && task.taskType === TaskTypeEnum.REMOTE
						? 'hidden'
						: 'block'}"
				>
					<h2 class="mb-4 text-xl font-semibold">Location</h2>
					{#if isEditing}
						<div class="space-y-4">
							{#if task.taskType !== TaskTypeEnum.REMOTE}
								<label class="label cursor-pointer space-x-2">
									<span class="label-text">Is this a removals task?</span>
									<input
										type="checkbox"
										class="toggle bg-black"
										checked={task.isRemovals}
										onchange={(e) => handleInputChange('isRemovals', e.currentTarget.checked)}
									/>
								</label>
							{/if}

							{#if !task.isRemovals}
								<label class="label cursor-pointer space-x-2">
									<span class="label-text">Is this a remote task?</span>
									<input
										type="checkbox"
										class="toggle bg-black"
										checked={task.taskType === TaskTypeEnum.REMOTE}
										onchange={(e) =>
											handleInputChange(
												'taskType',
												e.currentTarget.checked ? TaskTypeEnum.REMOTE : TaskTypeEnum.IN_PERSON
											)}
									/>
								</label>
							{/if}

							{#if task.taskType === TaskTypeEnum.IN_PERSON}
								<LocationAutoComplete
									label="Pickup Location"
									location={task.pickupLocation ?? undefined}
									onLocationSelect={(location: Location) =>
										handleInputChange('pickupLocation', location)}
								/>
							{/if}

							{#if task.isRemovals}
								<LocationAutoComplete
									label="Dropoff Location"
									location={task.dropOffLocation ?? undefined}
									onLocationSelect={(location: Location) =>
										handleInputChange('dropOffLocation', location)}
								/>
							{/if}
						</div>
					{:else}
						<div class="grid gap-2">
							{#if task.pickupLocation}
								<p><strong>Pickup Location:</strong> {task.pickupLocation.displayName}</p>
							{/if}
							{#if task.isRemovals && task.dropOffLocation}
								<p><strong>Dropoff Location:</strong> {task.dropOffLocation.displayName}</p>
							{/if}
						</div>
					{/if}
				</section>

				<!-- Attachments -->
				<section class="card bg-base-200 p-4">
					<h2 class="mb-4 text-xl font-semibold">Attachments</h2>
					{#if isEditing}
						<Uploader
							id="attachments"
							label="Attachments"
							maxFiles={5}
							maxFileSize={10}
							onChange={handleFileUpload}
						/>
					{:else}
						<p>No attachments have been uploaded</p>
					{/if}
				</section>

				<!-- Skills and Categories -->
				<section class="card bg-base-200 p-4">
					<h2 class="mb-4 text-xl font-semibold">Skills and Categories</h2>
					{#if isEditing}
						<div class="space-y-4">
							<div>
								<label class="label" for="skills">Required Skills</label>
								<Tags
									selectedTags={task.requiredSkills.map((item) => item.skillId)}
									onChange={(skillIds: number[]) => (updateObject.skillIds = skillIds)}
									options={$appStore.skills}
								/>
							</div>
							<div>
								<label class="label" for="categories">Categories</label>
								<Tags
									selectedTags={task.categories.map((category) => category.categoryId)}
									onChange={(categoryIds: number[]) => (updateObject.categoryIds = categoryIds)}
									options={$appStore.categories}
								/>
							</div>
						</div>
					{:else}
						<div class="grid gap-4">
							{#if task.requiredSkills.length}
								<div>
									<strong>Required Skills:</strong>
									<div class="mt-2 flex flex-wrap gap-2">
										{#each task.requiredSkills as skill}
											<span class="badge badge-primary">{skill.skill.name}</span>
										{/each}
									</div>
								</div>
							{/if}
							{#if task.categories.length}
								<div>
									<strong>Categories:</strong>
									<div class="mt-2 flex flex-wrap gap-2">
										{#each task.categories as category}
											<span class="badge badge-secondary">{category.category.name}</span>
										{/each}
									</div>
								</div>
							{/if}
						</div>
					{/if}
				</section>

				{#if isEditing}
					<div class="mt-4 flex justify-end gap-2">
						<button class="btn btn-neutral border" onclick={cancelEdit}> Cancel </button>
						<button class="btn btn-primary" onclick={handleUpdate}>Save</button>
					</div>
				{/if}

				{#if error}
					<div class="alert alert-error" role="alert">
						<span>{error}</span>
					</div>
				{/if}
			</div>
		{:else if activeTab === 'bids'}
			<!-- Bids content -->
			<div
				id="panel-bids"
				role="tabpanel"
				aria-labelledby="tab-bids"
				transition:slide={{ duration: 300 }}
			>
				<div class="w-full" role="region" aria-labelledby="task-bids-title">
					<h2 id="task-bids-title" class="sr-only">Task Bids</h2>

					{#if task.bids.length > 0}
						<BidsPanel {taskId} onCreateBid={() => {}} bids={task.bids} {selectedBid} />
					{:else}
						<div class="bg-base-200 rounded-lg py-8 text-center">
							<div class="mb-3">
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="mx-auto h-12 w-12 opacity-50"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="1.5"
										d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
									/>
								</svg>
							</div>
							<h3 class="text-lg font-medium">No bids yet</h3>
							<p class="mt-1 text-sm opacity-70">No bids have been submitted for this task yet.</p>
							<a
								class="btn btn-primary mt-4"
								aria-label="See tasks"
								href="/dashboard"
								data-sveltekit-reload="off"
							>
								See All Tasks
							</a>
						</div>
					{/if}
				</div>
			</div>
		{/if}
	</div>
{/if}

<script lang="ts">
	import type { Task, Location } from '$lib/types/task';
	import { BudgetTypeEnum, TaskTypeEnum } from '$lib/utils/enums/task.enum';
	import { appStore } from '$lib/stores/app.store';
	import taskService from '$lib/api/services/task.service';
	import Uploader from '$lib/components/Uploader.svelte';
	import Tags from '$lib/components/Tags.svelte';
	import Input from '$lib/components/Input.svelte';
	import DatePicker from '$lib/components/date/DatePicker.svelte';
	import LocationAutoComplete from '$lib/components/LocationAutoComplete.svelte';

	// Props
	const props = $props<{
		task: Task;
		onCancel: () => void;
		onSuccess: () => void;
	}>();

	// State
	let editedTask = $state<Task>({ ...props.task });
	let isLoading = $state(false);
	let errors = $state<Record<string, string>>({});
	let updateObject = $state<Partial<Task> & { skillIds?: number[]; categoryIds?: number[] }>({});
	let isFlexibleDate = $state(!editedTask?.dateRange);
	let attachments = $state<File[]>([]);

	// Methods
	type TaskFieldValue<T extends keyof Task> = Task[T];

	const handleInputChange = <T extends keyof Task>(field: T, value: TaskFieldValue<T>) => {
		editedTask[field] = value;
		updateObject = {
			...updateObject,
			[field]: value
		};
	};

	const handleBudgetTypeChange = (value: BudgetTypeEnum) => {
		handleInputChange('budgetType', value);
	};

	const handleFileUpload = (files: File[]) => {
		if (files) {
			for (let i = 0; i < files.length; i++) {
				attachments = [...attachments, files[i]];
			}
		}
	};

	const validateForm = (): boolean => {
		errors = {};

		if (!editedTask.title?.trim()) {
			errors.title = 'Title is required';
		}

		if (!editedTask.description?.trim()) {
			errors.description = 'Description is required';
		} else if (editedTask.description.trim().length < 20) {
			errors.description = 'Description must be at least 20 characters long';
		}

		if (!editedTask.budget || editedTask.budget <= 0) {
			errors.budget = 'Valid budget is required';
		}

		if (
			editedTask.budgetType === BudgetTypeEnum.HOURLY &&
			(!editedTask.estimatedHours || editedTask.estimatedHours <= 0)
		) {
			errors.estimatedHours = 'Estimated hours must be greater than 0';
		}

		return Object.keys(errors).length === 0;
	};

	const handleUpdate = async () => {
		if (!validateForm()) return;

		try {
			isLoading = true;

			if (Object.keys(updateObject).length === 0) {
				props.onCancel();
				return;
			}

			await taskService.updateTask(String(editedTask.id), updateObject);

			props.onSuccess();
		} catch (err) {
			errors.general = 'Failed to update task. Please try again.';
			console.error('Error updating task:', err);
		} finally {
			isLoading = false;
		}
	};
</script>

<div class="space-y-6">
	{#if errors.general}
		<div class="alert alert-error" role="alert">
			<span>{errors.general}</span>
		</div>
	{/if}

	<!-- Basic Information -->
	<section class="card bg-base-200 p-4">
		<h2 class="mb-4 text-xl font-semibold">Basic Information</h2>
		<div class="space-y-4">
			<Input
				label="Title"
				value={editedTask.title}
				onChange={({ value }) => handleInputChange('title', value)}
				required
				error={errors.title}
			/>

			<div>
				<label for="description" class="label">
					<span class="label-text">Description</span>
					<span class="label-text-alt text-error">{errors.description || ''}</span>
				</label>
				<textarea
					id="description"
					value={editedTask.description}
					onchange={(e) =>
						handleInputChange('description', (e.target as HTMLTextAreaElement).value)}
					class="textarea textarea-bordered h-32 w-full {errors.description
						? 'textarea-error'
						: ''}"
					placeholder="Describe your task in detail"
				></textarea>
			</div>

			<div>
				<label for="budget-type" class="label">Budget Type</label>
				<div class="flex gap-4" id="budget-type">
					<button
						class="btn {editedTask.budgetType === BudgetTypeEnum.FIXED
							? 'btn-primary'
							: 'btn-outline'}"
						onclick={() => handleBudgetTypeChange(BudgetTypeEnum.FIXED)}
					>
						Fixed price
					</button>
					<button
						class="btn {editedTask.budgetType === BudgetTypeEnum.HOURLY
							? 'btn-primary'
							: 'btn-outline'}"
						onclick={() => handleBudgetTypeChange(BudgetTypeEnum.HOURLY)}
					>
						Hourly rate
					</button>
				</div>
			</div>

			<div>
				<label for="budget" class="label">
					<span class="label-text">Budget</span>
					<span class="label-text-alt text-error">{errors.budget || ''}</span>
				</label>
				<input
					type="number"
					id="budget"
					class="input input-bordered w-full {errors.budget ? 'input-error' : ''}"
					value={editedTask.budget?.toString() ?? '0'}
					onchange={(e) =>
						handleInputChange('budget', parseFloat((e.target as HTMLInputElement).value))}
					min="0"
					step="0.00000001"
				/>
			</div>

			{#if editedTask.budgetType === BudgetTypeEnum.HOURLY}
				<div>
					<label for="estimatedHours" class="label">
						<span class="label-text">Estimated Hours</span>
						<span class="label-text-alt text-error">{errors.estimatedHours || ''}</span>
					</label>
					<input
						type="number"
						id="estimatedHours"
						class="input input-bordered w-full {errors.estimatedHours ? 'input-error' : ''}"
						value={editedTask.estimatedHours?.toString() ?? ''}
						onchange={(e) =>
							handleInputChange('estimatedHours', parseFloat((e.target as HTMLInputElement).value))}
						min="1"
					/>
				</div>
			{/if}
		</div>
	</section>

	<!-- Timing -->
	<section class="card bg-base-200 p-4">
		<h2 class="mb-4 text-xl font-semibold">Timing</h2>
		<div class="space-y-4">
			<Input
				label="Date Type"
				value={editedTask?.deadlineDate ? 'Specific Date' : 'Flexible'}
				options={[
					{ value: 'Specific Date', label: 'Specific Date' },
					{ value: 'Flexible', label: 'Flexible' }
				]}
				onChange={({ value }) => {
					isFlexibleDate = value === 'Flexible';
					if (isFlexibleDate) {
						handleInputChange('deadlineDate', null);
					}
				}}
			/>

			{#if isFlexibleDate}
				<div>
					<label class="label" for="date-range">Date Range</label>
					<div class="grid grid-cols-2 gap-4">
						<DatePicker
							label="Start Date"
							value={editedTask?.dateRange?.start ?? ''}
							onChange={(value: string) =>
								handleInputChange('dateRange', {
									start: value,
									end: editedTask?.dateRange?.end ?? ''
								})}
						/>
						<DatePicker
							label="End Date"
							value={editedTask?.dateRange?.end ?? ''}
							onChange={(value: string) =>
								handleInputChange('dateRange', {
									start: editedTask?.dateRange?.start ?? '',
									end: value
								})}
						/>
					</div>
				</div>
			{:else}
				<DatePicker
					label="Deadline"
					value={editedTask.deadlineDate ?? ''}
					onChange={(value: string) => handleInputChange('deadlineDate', value)}
				/>
			{/if}
		</div>
	</section>

	<!-- Location -->
	<section class="card bg-base-200 p-4">
		<h2 class="mb-4 text-xl font-semibold">Location</h2>
		<div class="space-y-4">
			<div>
				<label for="task-type" class="label">Task Type</label>
				<div id="task-type" class="flex gap-4">
					<button
						class="btn {editedTask.taskType === TaskTypeEnum.REMOTE
							? 'btn-primary'
							: 'btn-outline'}"
						onclick={() => handleInputChange('taskType', TaskTypeEnum.REMOTE)}
					>
						Remote
					</button>
					<button
						class="btn {editedTask.taskType === TaskTypeEnum.IN_PERSON
							? 'btn-primary'
							: 'btn-outline'}"
						onclick={() => handleInputChange('taskType', TaskTypeEnum.IN_PERSON)}
					>
						In-Person
					</button>
				</div>
			</div>

			{#if editedTask.taskType === TaskTypeEnum.IN_PERSON}
				<div class="form-control w-full">
					<label class="label" for="isRemovals">
						<span class="label-text">Is this a removals task?</span>
					</label>
					<input
						type="checkbox"
						id="isRemovals"
						class="toggle"
						checked={editedTask.isRemovals}
						onchange={(e) =>
							handleInputChange('isRemovals', (e.target as HTMLInputElement).checked)}
					/>
				</div>

				<LocationAutoComplete
					label="Pickup Location"
					location={editedTask.pickupLocation ?? undefined}
					onLocationSelect={(location: Location) => handleInputChange('pickupLocation', location)}
				/>

				{#if editedTask.isRemovals}
					<LocationAutoComplete
						label="Dropoff Location"
						location={editedTask.dropOffLocation ?? undefined}
						onLocationSelect={(location: Location) =>
							handleInputChange('dropOffLocation', location)}
					/>
				{/if}
			{/if}
		</div>
	</section>

	<!-- Attachments -->
	<section class="card bg-base-200 p-4">
		<h2 class="mb-4 text-xl font-semibold">Attachments</h2>
		<Uploader
			id="attachments"
			label="Attachments"
			maxFiles={5}
			maxFileSize={10}
			onChange={handleFileUpload}
		/>
	</section>

	<!-- Skills and Categories -->
	<section class="card bg-base-200 p-4">
		<h2 class="mb-4 text-xl font-semibold">Skills and Categories</h2>
		<div class="space-y-4">
			<div>
				<label class="label" for="skills-select">Required Skills</label>
				<Tags
					selectedTags={editedTask.requiredSkills?.map((item) => item.skillId) || []}
					onChange={(skillIds: number[]) => (updateObject.skillIds = skillIds)}
					options={$appStore.skills}
				/>
			</div>
			<div>
				<label class="label" for="categories-select">Categories</label>
				<Tags
					selectedTags={editedTask.categories?.map((category) => category.categoryId) || []}
					onChange={(categoryIds: number[]) => (updateObject.categoryIds = categoryIds)}
					options={$appStore.categories}
				/>
			</div>
		</div>
	</section>

	<!-- Action Buttons -->
	<div class="mt-6 flex justify-end gap-2">
		<button class="btn btn-neutral border" onclick={props.onCancel}> Cancel </button>
		<button
			class="btn btn-primary {isLoading ? 'loading' : ''}"
			onclick={handleUpdate}
			disabled={isLoading}
		>
			{isLoading ? '' : 'Save Changes'}
		</button>
	</div>
</div>

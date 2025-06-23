<script lang="ts">
	import type { MyTaskTemplates$result } from '$houdini';
	import { format } from 'date-fns';
	import { TaskStatusEnum, RecurringFrequencyEnum } from '$lib/utils/enums/task.enum';
	import { BudgetTypeEnum } from '$lib/utils/enums/task.enum';

	// Props
	let { template, onStatusChange, onDelete, onUpdate } = $props<{
		template: MyTaskTemplates$result['taskTemplates'][0];
		onStatusChange: (status: MyTaskTemplates$result['taskTemplates'][0]['task']['status']) => void;
		onDelete: () => void;
		onUpdate?: (templateId: string) => void;
	}>();

	// State
	let isExpanded = $state(false);
	let viewMode = $state<'summary' | 'details' | 'edit'>('summary');
	let showDeleteConfirm = $state(false);
	let isLoading = $state(false);
	let error = $state<string | null>(null);

	const statusLabels = {
		OPEN: 'Active',
		COMPLETED: 'Completed',
		IN_PROGRESS: 'In Progress',
		CANCELLED: 'Cancelled'
	};

	const frequencyText = {
		[RecurringFrequencyEnum.DAILY]: 'Daily',
		[RecurringFrequencyEnum.WEEKLY]: 'Weekly',
		[RecurringFrequencyEnum.BIWEEKLY]: 'Every 2 weeks',
		[RecurringFrequencyEnum.MONTHLY]: 'Monthly',
		[RecurringFrequencyEnum.CUSTOM]: 'Custom'
	};

	// Functions
	function toggleExpand() {
		isExpanded = !isExpanded;
	}

	function toggleStatus() {
		if (template.status === 'OPEN') {
			onStatusChange('PAUSED');
		} else if (template.status === 'PAUSED') {
			onStatusChange('OPEN');
		}
	}

	function formatDate(dateString: string | undefined): string {
		if (!dateString) return 'Not scheduled';
		return format(new Date(dateString), 'MMM d, yyyy');
	}

	function getStatusColor(
		status: MyTaskTemplates$result['taskTemplates'][0]['task']['status']
	): string {
		switch (status) {
			case 'OPEN':
				return 'bg-success text-success-content';
			case 'COMPLETED':
				return 'bg-warning text-warning-content';
			case 'IN_PROGRESS':
				return 'bg-info text-info-content';
			case 'CANCELLED':
				return 'bg-error text-error-content';
			default:
				return 'bg-neutral text-neutral-content';
		}
	}

	function getFrequencyDescription(template: MyTaskTemplates$result['taskTemplates'][0]): string {
		if (!template.recurrencePattern) {
			return 'Unknown';
		}

		const { frequency, interval, daysOfWeek, dayOfMonth } = template.recurrencePattern;

		if (frequency === RecurringFrequencyEnum.DAILY) {
			return interval === 1 ? 'Every day' : `Every ${interval} days`;
		}

		if (frequency === RecurringFrequencyEnum.WEEKLY) {
			return interval === 1 ? 'Every week' : `Every ${interval} weeks`;
		}

		if (frequency === RecurringFrequencyEnum.BIWEEKLY) {
			return 'Every 2 weeks';
		}

		if (frequency === RecurringFrequencyEnum.MONTHLY) {
			if (dayOfMonth) {
				return interval === 1
					? `Monthly on day ${dayOfMonth}`
					: `Every ${interval} months on day ${dayOfMonth}`;
			}
			return interval === 1 ? 'Monthly' : `Every ${interval} months`;
		}

		if (frequency === RecurringFrequencyEnum.CUSTOM && daysOfWeek?.length) {
			const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
			const days = daysOfWeek.map((day) => dayNames[day]).join(', ');
			return `Custom: ${days}`;
		}

		return 'Custom schedule';
	}
</script>

<div class="card bg-base-100 border shadow-md transition-shadow hover:shadow-lg">
	{#if showDeleteConfirm}
		<div class="card-body p-4">
			<h3 class="card-title text-base md:text-lg">Confirm Deletion</h3>
			<p class="py-2">
				Are you sure you want to delete this recurring task template? All future scheduled tasks
				will be cancelled.
			</p>

			<div class="card-actions mt-4 justify-end">
				<button class="btn btn-ghost btn-sm" onclick={() => (showDeleteConfirm = false)}
					>Cancel</button
				>
				<button class="btn btn-error btn-sm" onclick={onDelete}>Delete</button>
			</div>
		</div>
	{:else if viewMode === 'details'}
		<div class="card-body p-4">
			<div class="flex items-center justify-between">
				<h3 class="card-title text-base md:text-lg">{template.title || template.task.title}</h3>
				<div class="badge {getStatusColor(template.status)} badge-sm md:badge-md">
					{template.status
						? statusLabels[template.status as keyof typeof statusLabels] || 'Unknown'
						: 'Unknown'}
				</div>
			</div>

			<div class="divider my-2"></div>

			<!-- Comprehensive Task Details -->
			<div class="space-y-4">
				<!-- Template Info -->
				<div>
					<h4 class="mb-2 font-semibold">Template Information</h4>
					<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
						<div>
							<p class="text-xs opacity-70">Description</p>
							<p class="text-sm">{template.description}</p>
						</div>
						<div>
							<p class="text-xs opacity-70">Created</p>
							<p class="text-sm">{formatDate(template.createdAt)}</p>
						</div>
					</div>
				</div>

				<!-- Schedule Details -->
				<div>
					<h4 class="mb-2 font-semibold">Schedule</h4>
					<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
						<div>
							<p class="text-xs opacity-70">Frequency</p>
							<p class="text-sm">{getFrequencyDescription(template)}</p>
						</div>
						{#if template.recurrencePattern.endDate}
							<div>
								<p class="text-xs opacity-70">End Date</p>
								<p class="text-sm">{formatDate(template.recurrencePattern.endDate)}</p>
							</div>
						{/if}
						{#if template.recurrencePattern.maxOccurrences}
							<div>
								<p class="text-xs opacity-70">Maximum Occurrences</p>
								<p class="text-sm">{template.recurrencePattern.maxOccurrences}</p>
							</div>
						{/if}
						{#if template.nextGenerationDate}
							<div>
								<p class="text-xs opacity-70">Next Task</p>
								<p class="text-sm">{formatDate(template.nextGenerationDate)}</p>
							</div>
						{/if}
					</div>
				</div>

				<!-- Task Details -->
				<div>
					<h4 class="mb-2 font-semibold">Task Details</h4>
					<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
						<div>
							<p class="text-xs opacity-70">Title</p>
							<p class="text-sm">{template.task.title}</p>
						</div>
						<div>
							<p class="text-xs opacity-70">Budget</p>
							<p class="text-sm">
								{template.task.budget}
								{template.task.currency || 'BTC'}
								{#if template.task.budgetType === BudgetTypeEnum.HOURLY}
									/hr ({template.task.estimatedHours || 0} hrs)
								{/if}
							</p>
						</div>
						<div>
							<p class="text-xs opacity-70">Type</p>
							<p class="text-sm">{template.task.taskType.replace('_', ' ')}</p>
						</div>
						<div>
							<p class="text-xs opacity-70">Location</p>
							<p class="text-sm">
								{#if template.task.pickupLocation}
									{template.task.pickupLocation.displayName || template.task.pickupLocation.zipCode}
								{:else}
									Online
								{/if}
							</p>
						</div>
					</div>

					<div class="mt-3">
						<p class="mb-1 text-xs opacity-70">Description</p>
						<p class="text-sm whitespace-pre-line">{template.task.description}</p>
					</div>

					{#if template.task.requiredSkills?.length > 0}
						<div class="mt-3">
							<p class="mb-1 text-xs opacity-70">Required Skills</p>
							<div class="flex flex-wrap gap-2">
								{#each template.task.requiredSkills as skillItem}
									<span class="badge badge-primary badge-outline">{skillItem.skill.name}</span>
								{/each}
							</div>
						</div>
					{/if}
				</div>
			</div>

			<div class="card-actions mt-4 justify-end">
				<button class="btn btn-ghost btn-sm" onclick={() => (viewMode = 'summary')}>Back</button>
				{#if onUpdate}
					<button
						class="btn btn-secondary btn-sm"
						onclick={() => {
							onUpdate(template.id);
						}}>Edit</button
					>
				{/if}
				<button
					class="btn btn-primary btn-sm"
					onclick={toggleStatus}
					disabled={template.status !== TaskStatusEnum.OPEN && template.status !== TaskStatusEnum.IN_PROGRESS}
				>
					{template.status === TaskStatusEnum.OPEN ? 'Pause' : 'Resume'}
				</button>
			</div>
		</div>
	{:else}
		<div class="card-body p-4">
			<!-- Card Header -->
			<div class="flex items-center justify-between">
				<h3 class="card-title truncate text-base md:text-lg">
					{template.title || template.task.title}
				</h3>
				<div class="badge {getStatusColor(template.status)} badge-sm md:badge-md">
					{template.status
						? statusLabels[template.status as keyof typeof statusLabels] || 'Unknown'
						: 'Unknown'}
				</div>
			</div>

			<!-- Recurrence Pattern -->
			<div class="my-2">
				<div class="text-xs opacity-70 md:text-sm">Recurrence:</div>
				<div class="text-sm font-medium md:text-base">
					{getFrequencyDescription(template)}
				</div>
			</div>

			<!-- Next Generation -->
			{#if template.nextGenerationDate}
				<div class="my-2">
					<div class="text-xs opacity-70 md:text-sm">Next task:</div>
					<div class="text-sm font-medium md:text-base">
						{formatDate(template.nextGenerationDate)}
					</div>
				</div>
			{/if}

			<!-- Expanded Content -->
			{#if isExpanded}
				<div class="divider my-2"></div>

				<!-- Budget -->
				<div class="my-2 grid grid-cols-2 gap-2">
					<div>
						<div class="text-xs opacity-70">Budget:</div>
						<div class="text-sm font-medium">
							{template.task.budget}
							{template.task.currency || 'BTC'}
							{#if template.task.budgetType === BudgetTypeEnum.HOURLY}
								/hr ({template.task.estimatedHours || 0} hrs)
							{/if}
						</div>
					</div>

					<!-- Location -->
					<div>
						<div class="text-xs opacity-70">Location:</div>
						<div class="text-sm font-medium">
							{template.task.taskType === 'ONLINE' ? 'Online' : 'In-person'}
							{#if template.task.taskType === 'IN_PERSON' && template.task.pickupLocation?.zipCode}
								({template.task.pickupLocation.zipCode})
							{/if}
						</div>
					</div>
				</div>

				<!-- Description -->
				<div class="my-2">
					<div class="text-xs opacity-70">Description:</div>
					<div class="mt-1 text-sm">
						{template.description.length > 150
							? template.description.slice(0, 150) + '...'
							: template.description}
					</div>
				</div>

				<!-- Created Date -->
				<div class="mt-2 text-xs opacity-50">
					Created: {formatDate(template.createdAt)}
				</div>
			{/if}

			<!-- Card Actions -->
			<div class="card-actions mt-2 justify-end">
				<button class="btn btn-ghost btn-xs" onclick={toggleExpand}>
					{isExpanded ? 'Show Less' : 'Show More'}
				</button>

				<button class="btn btn-ghost btn-xs" onclick={() => (viewMode = 'details')}>
					View Details
				</button>

				<button class="btn btn-ghost btn-xs" onclick={() => (showDeleteConfirm = true)}>
					Delete
				</button>

				<button
					class="btn btn-primary btn-xs"
					onclick={toggleStatus}
					disabled={template.status !== TaskStatusEnum.OPEN && template.status !== TaskStatusEnum.IN_PROGRESS}
				>
					{template.status === TaskStatusEnum.OPEN ? 'Pause' : 'Resume'}
				</button>
			</div>
		</div>
	{/if}
</div>

<script lang="ts">
	import type { TaskTemplate } from '$lib/types/recurring-tasks';
	import { format } from 'date-fns';
	import { TASKSTATUS, RECURRINGFREQUENCYENUM } from '$lib/utils/enums/recurringTask.enums';

	// Props
	let { template, onStatusChange, onDelete } = $props<{
		template: TaskTemplate;
		onStatusChange: (status: TASKSTATUS) => void;
		onDelete: () => void;
	}>();

	// State
	let isExpanded = $state(false);
	const statusLabels = {
		[TASKSTATUS.ACTIVE]: 'Active',
		[TASKSTATUS.PAUSED]: 'Paused',
		[TASKSTATUS.COMPLETED]: 'Completed',
		[TASKSTATUS.CANCELLED]: 'Cancelled'
	};

	const frequencyText = {
		[RECURRINGFREQUENCYENUM.DAILY]: 'Daily',
		[RECURRINGFREQUENCYENUM.WEEKLY]: 'Weekly',
		[RECURRINGFREQUENCYENUM.BIWEEKLY]: 'Every 2 weeks',
		[RECURRINGFREQUENCYENUM.MONTHLY]: 'Monthly',
		[RECURRINGFREQUENCYENUM.CUSTOM]: 'Custom'
	};

	// Functions
	function toggleExpand() {
		isExpanded = !isExpanded;
	}

	function toggleStatus() {
		if (template.status === TASKSTATUS.ACTIVE) {
			onStatusChange(TASKSTATUS.PAUSED);
		} else if (template.status === TASKSTATUS.PAUSED) {
			onStatusChange(TASKSTATUS.ACTIVE);
		}
	}

	function formatDate(dateString: string | undefined): string {
		if (!dateString) return 'Not scheduled';
		return format(new Date(dateString), 'MMM d, yyyy');
	}

	function getStatusColor(status: TASKSTATUS): string {
		switch (status) {
			case TASKSTATUS.ACTIVE:
				return 'bg-success text-success-content';
			case TASKSTATUS.PAUSED:
				return 'bg-warning text-warning-content';
			case TASKSTATUS.COMPLETED:
				return 'bg-info text-info-content';
			case TASKSTATUS.CANCELLED:
				return 'bg-error text-error-content';
			default:
				return 'bg-neutral text-neutral-content';
		}
	}

	function getFrequencyDescription(template: TaskTemplate): string {
		const { frequency, interval, daysOfWeek, dayOfMonth } = template.recurrencePattern;

		if (frequency === RECURRINGFREQUENCYENUM.DAILY) {
			return interval === 1 ? 'Every day' : `Every ${interval} days`;
		}

		if (frequency === RECURRINGFREQUENCYENUM.WEEKLY) {
			return interval === 1 ? 'Every week' : `Every ${interval} weeks`;
		}

		if (frequency === RECURRINGFREQUENCYENUM.BIWEEKLY) {
			return 'Every 2 weeks';
		}

		if (frequency === RECURRINGFREQUENCYENUM.MONTHLY) {
			if (dayOfMonth) {
				return interval === 1
					? `Monthly on day ${dayOfMonth}`
					: `Every ${interval} months on day ${dayOfMonth}`;
			}
			return interval === 1 ? 'Monthly' : `Every ${interval} months`;
		}

		if (frequency === RECURRINGFREQUENCYENUM.CUSTOM && daysOfWeek?.length) {
			const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
			const days = daysOfWeek.map((day) => dayNames[day]).join(', ');
			return `Custom: ${days}`;
		}

		return 'Custom schedule';
	}
</script>

<div class="card bg-base-100 shadow-md transition-shadow hover:shadow-lg">
	<div class="card-body p-4">
		<!-- Card Header -->
		<div class="flex items-center justify-between">
			<h3 class="card-title truncate text-base md:text-lg">{template.title}</h3>
			<div class="badge {getStatusColor(template.status)} badge-sm md:badge-md">
				{statusLabels[template.status]}
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
						{template.budget.amount}
						{template.budget.currency}
						{#if template.budget.type === 'HOURLY'}
							/hr ({template.budget.estimatedHours} hrs)
						{/if}
					</div>
				</div>

				<!-- Location -->
				<div>
					<div class="text-xs opacity-70">Location:</div>
					<div class="text-sm font-medium">
						{template.location.type === 'ONLINE' ? 'Online' : 'In-person'}
						{#if template.location.type === 'IN_PERSON' && template.location.pickup?.zipCode}
							({template.location.pickup.zipCode})
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

			<button class="btn btn-ghost btn-xs" onclick={onDelete}> Delete </button>

			<button
				class="btn btn-primary btn-xs"
				onclick={toggleStatus}
				disabled={template.status !== TASKSTATUS.ACTIVE && template.status !== TASKSTATUS.PAUSED}
			>
				{template.status === TASKSTATUS.ACTIVE ? 'Pause' : 'Resume'}
			</button>
		</div>
	</div>
</div>

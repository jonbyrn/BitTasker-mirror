<!-- 
  AvailabilityFilter.svelte
  Component for time-based task filtering including date range
  and time of day preferences
-->
<script lang="ts">
	import type { DateRange } from '$lib/types/task';

	// Props
	let { onAvailabilityChange = () => {} } = $props<{
		onAvailabilityChange?: (date: DateRange | undefined, timePreferences: string[]) => void;
	}>();

	// State
	let dateRange = $state<{ start: string; end: string }>({
		start: '',
		end: ''
	});

	let timePreferences = $state<string[]>([]);
	const timeOptions = $state([
		{ value: 'morning', label: 'Morning (6am-12pm)' },
		{ value: 'midday', label: 'Midday (12pm-3pm)' },
		{ value: 'afternoon', label: 'Afternoon (3pm-6pm)' },
		{ value: 'evening', label: 'Evening (6pm-10pm)' }
	]);

	let hasDeadline = $state(false);
	let deadlineDate = $state('');

	// Toggle time preference
	function toggleTimePreference(value: string) {
		if (timePreferences.includes(value)) {
			timePreferences = timePreferences.filter((item) => item !== value);
		} else {
			timePreferences = [...timePreferences, value];
		}
	}

	// Clear availability filters
	function clearAvailability() {
		dateRange.start = '';
		dateRange.end = '';
		timePreferences = [];
		hasDeadline = false;
		deadlineDate = '';
	}

	// Format date for display (MM/DD/YYYY)
	function formatDate(dateString: string): string {
		if (!dateString) return '';
		const date = new Date(dateString);
		return date.toLocaleDateString('en-US', {
			month: '2-digit',
			day: '2-digit',
			year: 'numeric'
		});
	}

	// Apply availability filter changes
	function applyChanges() {
		const validDateRange = dateRange.start && dateRange.end ? dateRange : undefined;

		onAvailabilityChange(validDateRange, timePreferences);
	}

	// Update parent when our filters change
	$effect(() => {
		applyChanges();
	});
</script>

<div class="space-y-4">
	<!-- Date Range -->
	<div>
		<label class="label" for="date-range">
			<span class="label-text font-medium">Date Range</span>
		</label>
		<div class="grid grid-cols-2 gap-2">
			<div>
				<label class="label mb-1 p-0" for="start-date">
					<span class="label-text text-xs">Start Date</span>
				</label>
				<input
					type="date"
					class="input input-bordered input-sm w-full"
					bind:value={dateRange.start}
				/>
			</div>
			<div>
				<label class="label mb-1 p-0" for="end-date">
					<span class="label-text text-xs">End Date</span>
				</label>
				<input
					type="date"
					class="input input-bordered input-sm w-full"
					bind:value={dateRange.end}
				/>
			</div>
		</div>
	</div>

	<!-- Time Preferences -->
	<div>
		<label class="label" for="time-preferences">
			<span class="label-text font-medium">Time Preferences</span>
		</label>
		<div class="flex flex-wrap gap-2">
			{#each timeOptions as option}
				<button
					class="btn btn-sm"
					class:btn-primary={timePreferences.includes(option.value)}
					onclick={() => toggleTimePreference(option.value)}
				>
					{option.label}
				</button>
			{/each}
		</div>
	</div>

	<!-- Deadline-based filtering -->
	<div>
		<label class="label flex cursor-pointer justify-start gap-2" for="deadline-filter">
			<input type="checkbox" class="checkbox checkbox-primary" bind:checked={hasDeadline} />
			<span class="label-text font-medium">Filter by Deadline</span>
		</label>

		{#if hasDeadline}
			<div class="mt-2">
				<label class="label mb-1 p-0" for="deadline-date">
					<span class="label-text text-xs">Tasks due before</span>
				</label>
				<input type="date" class="input input-bordered input-sm w-full" bind:value={deadlineDate} />
			</div>
		{/if}
	</div>

	<!-- Clear button -->
	<div>
		<button class="btn btn-sm btn-ghost" onclick={clearAvailability}>
			Clear Availability Filters
		</button>
	</div>
</div>

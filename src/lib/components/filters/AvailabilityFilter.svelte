<!-- 
  AvailabilityFilter.svelte
  Component for time-based task filtering including date range
  and time of day preferences
-->
<script lang="ts">
	// Props
	let {
		deadlineBefore = undefined,
		deadlineAfter = undefined,
		onAvailabilityChange = () => {}
	} = $props<{
		deadlineBefore?: string;
		deadlineAfter?: string;
		onAvailabilityChange?: (
			filterMode: 'date_range' | 'deadline',
			start: string,
			end: string
		) => void;
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

	// Deadline filter modes
	let filterMode = $state<'date_range' | 'deadline'>('date_range');

	// Deadline filters
	let hasDeadlineBefore = $state(false);
	let hasDeadlineAfter = $state(false);
	let deadlineBeforeDate = $state(deadlineBefore || '');
	let deadlineAfterDate = $state(deadlineAfter || '');

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
		hasDeadlineBefore = false;
		hasDeadlineAfter = false;
		deadlineBeforeDate = '';
		deadlineAfterDate = '';
	}

	// Apply availability filter changes
	function applyChanges() {
		if (filterMode === 'date_range') {
			return onAvailabilityChange('date_range', dateRange.start, dateRange.end);
		} else if (filterMode === 'deadline') {
			// Determine which deadline filters to apply based on mode and inputs
			let beforeDate: string | undefined = undefined;
			let afterDate: string | undefined = undefined;

			// Apply deadline filters if the user has specified them
			if (hasDeadlineBefore && deadlineBeforeDate) {
				beforeDate = deadlineBeforeDate;
			}

			if (hasDeadlineAfter && deadlineAfterDate) {
				afterDate = deadlineAfterDate;
			}

			return onAvailabilityChange('deadline', beforeDate, afterDate);
		}
	}

	// Update parent when our filters change
	$effect(() => {
		applyChanges();
	});
</script>

<div class="space-y-4">
	<!-- Filter Type Selection -->
	<div class="flex items-center justify-between gap-2">
		<label class="label" for="filter-type">
			<span class="label-text font-medium">Filter Type</span>
		</label>
		<div class="flex flex-wrap gap-2">
			<button
				class="btn btn-sm"
				class:btn-primary={filterMode === 'date_range'}
				onclick={() => (filterMode = 'date_range')}
			>
				Date Range
			</button>
			<button
				class="btn btn-sm"
				class:btn-primary={filterMode === 'deadline'}
				onclick={() => (filterMode = 'deadline')}
			>
				Deadline
			</button>
		</div>
	</div>

	{#if filterMode === 'date_range'}
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
	{/if}

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

	{#if filterMode === 'deadline'}
		<!-- Deadline Before -->
		<div>
			<label class="label flex cursor-pointer justify-start gap-2" for="deadline-before-filter">
				<input type="checkbox" class="checkbox checkbox-primary" bind:checked={hasDeadlineBefore} />
				<span class="label-text font-medium">Tasks due before</span>
			</label>

			{#if hasDeadlineBefore}
				<div class="mt-2">
					<input
						type="date"
						class="input input-bordered input-sm w-full"
						bind:value={deadlineBeforeDate}
						id="deadline-before-date"
					/>
				</div>
			{/if}
		</div>

		<!-- Deadline After -->
		<div>
			<label class="label flex cursor-pointer justify-start gap-2" for="deadline-after-filter">
				<input type="checkbox" class="checkbox checkbox-primary" bind:checked={hasDeadlineAfter} />
				<span class="label-text font-medium">Tasks due after</span>
			</label>

			{#if hasDeadlineAfter}
				<div class="mt-2">
					<input
						type="date"
						class="input input-bordered input-sm w-full"
						bind:value={deadlineAfterDate}
						id="deadline-after-date"
					/>
				</div>
			{/if}
		</div>
	{/if}

	<!-- Clear button -->
	<div>
		<button class="btn btn-sm btn-ghost" onclick={clearAvailability}>
			Clear Availability Filters
		</button>
	</div>
</div>
